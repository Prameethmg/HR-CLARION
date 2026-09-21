import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_MODEL = "alibaba/qwen-3.7-plus";

interface PolicyContext {
  employee: Record<string, unknown>;
  policies: Record<string, unknown>[];
}

const randomSuffix = (n: number): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const SYSTEM_PROMPT = `You are HR Clarion, an HR policy decision engine. You will receive an employee's
question, their employee record, and a set of policy clauses.

Rules:

1. Use only the clauses provided, never outside knowledge.
2. If clauses conflict, the one with higher precedence wins - explain which won and
why.
3. Every claim must cite a clause_id and section_ref.
4. Apply the employee's own record (balances, department) to give a specific answer
with visible arithmetic.
5. If clauses don't answer the question, set confidence below 0.7, leave citations empty,
set action_type to ESCALATE - never guess.
6. Reply with ONLY a single valid JSON object: {"answer": "", "applicable_rule": "",
"conflict_detected": true/false, "conflict_explanation": "", "citations": [], "confidence":
0-1, "action_required": true/false, "action_type":""}
7. For citations, return an array of plain strings only, in the format "clause_id
§section_ref" -for example ["WFH-01 §1.1", "PROD-WFH-02 §1.2"]. Never return
objects. The section_ref must be the actual clause section number provided to you,
never the scope.
8. Set action_required to true whenever the topic (WFH, LEAVE) has a corresponding
actionable request type available, even if the employee only asked a question. Set
action_type to the matching type (e.g. "WFH_REQUEST", "LEAVE_REQUEST").
Only set action_required to false when the question is purely informational and no
request type applies.
9. applicable_rule must always be a single clause_id string only, never a sentence.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const employeeId = typeof body?.employee_id === "string" ? body.employee_id.trim() : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const topic = typeof body?.topic === "string" ? body.topic.trim() : "";

    if (!employeeId || !question || !topic) {
      return new Response(
        JSON.stringify({ error: "employee_id, question and topic are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const AI_API_TOKEN = Deno.env.get("AI_API_TOKEN_317763878e3e");
    if (!AI_API_TOKEN) {
      return new Response(JSON.stringify({ error: "AI API token is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Step 1: call getPolicyContext to fetch the employee record and matching clauses.
    // Retry once to absorb transient gateway/service failures without widening auth scope.
    let context: PolicyContext | null = null;
    let contextError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctxStart = Date.now();
      const result = await serviceClient.functions.invoke("getPolicyContext", {
        body: { employee_id: employeeId, topic, question },
      });
      const ctxMs = Date.now() - ctxStart;
      console.log("DIAG getPolicyContext_ms_attempt_" + (attempt + 1) + "=" + ctxMs);

      if (!result.error && result.data?.employee && Array.isArray(result.data.policies)) {
        context = result.data;
        break;
      }

      contextError = result.error ?? { message: "empty context" };
      console.error(
        "getPolicyDecision getPolicyContext call failed:",
        contextError.message ?? "empty context"
      );
      if (attempt === 1) {
        break;
      }
    }

    if (!context?.employee || !Array.isArray(context.policies)) {
      return new Response(JSON.stringify({ error: "Failed to load policy context" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employee = context.employee;
    const policies = context.policies;

    // Step 2: build the user message with clearly labeled fields
    const userMessage = [
      "EMPLOYEE RECORD:",
      JSON.stringify(employee, null, 2),
      "",
      "POLICY CLAUSES:",
      policies
        .map((p) =>
          JSON.stringify(
            {
              clause_id: p.clause_id,
              scope: p.scope,
              section_ref: p.section_ref,
              precedence: p.precedence,
              clause_text: p.clause_text,
            },
            null,
            2
          )
        )
        .join("\n"),
      "",
      "EMPLOYEE QUESTION:",
      question,
    ].join("\n");
    console.log(
      "DIAG prompt_length_chars system=" +
        SYSTEM_PROMPT.length +
        " user=" +
        userMessage.length
    );

    // Step 3: use a single retry for transient AI gateway failures while keeping the
    // prompt and security model unchanged.
    let aiResponse: Response | null = null;
    let aiErrorMessage = "AI service error";
    for (let attempt = 0; attempt < 2; attempt++) {
      const aiStart = Date.now();
      aiResponse = await fetch(
        "https://api.enter.pro/code/api/v1/ai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + AI_API_TOKEN,
            "Content-Type": "application/json",
            "X-Session-ID": crypto.randomUUID(),
            "X-Enter-Project-ID": "317763878e3e472bbbfd1c2b1b9bf8fc",
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            stream: false,
            enable_thinking: false,
          }),
        }
      );
      const aiMs = Date.now() - aiStart;
      console.log("DIAG ai_ms_attempt_" + (attempt + 1) + "=" + aiMs);

      if (aiResponse.ok) {
        break;
      }

      const errText = await aiResponse.text();
      try {
        const errData = JSON.parse(errText);
        aiErrorMessage = errData.error?.message || aiErrorMessage;
      } catch {
        // keep default
      }
      console.error(
        "getPolicyDecision AI call failed:",
        aiResponse.status,
        aiErrorMessage
      );
      if (attempt === 1) {
        break;
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      return new Response(JSON.stringify({ error: aiErrorMessage }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content;

    console.log(
      "DIAG usage=" +
        JSON.stringify(aiJson?.usage ?? null) +
        " finish_reason=" +
        JSON.stringify(aiJson?.choices?.[0]?.finish_reason ?? null) +
        " content_chars=" +
        (typeof content === "string" ? content.length : -1)
    );

    if (typeof content !== "string" || content.length === 0) {
      return new Response(JSON.stringify({ error: "AI returned an empty response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let decision: Record<string, unknown> | null = null;
    try {
      decision = JSON.parse(content);
    } catch (err) {
      console.log(
        "DIAG content_not_json " + (err instanceof Error ? err.message : String(err))
      );
      // Not JSON — return exactly as today, no escalation row.
      return new Response(content, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const citations = decision.citations;
    const confidence = decision.confidence;
    const citationsEmpty = !Array.isArray(citations) || citations.length === 0;
    const lowConfidence = typeof confidence === "number" && confidence < 0.7;
    const isEscalation =
      decision.action_type === "ESCALATE" || citationsEmpty || lowConfidence;

    if (!isEscalation) {
      // Not an escalation — return the AI content exactly as today, no insert.
      return new Response(content, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Escalation path: mark it, persist one row, and include the id in the reply.
    decision.action_type = "ESCALATE";
    const escalationId = "ESC-" + Date.now() + "-" + randomSuffix(4);

    const { error: insertError } = await serviceClient
      .from("escalations")
      .insert({
        escalation_id: escalationId,
        employee_id: employeeId,
        question_text: question,
        reason: "NO_MATCHING_POLICY",
        confidence: typeof confidence === "number" ? confidence : null,
        status: "OPEN",
        created_at: new Date().toISOString(),
        hr_reply: null,
        hr_reply_at: null,
      });

    if (insertError) {
      console.error(
        "getPolicyDecision escalation insert failed:",
        insertError.message
      );
    } else {
      console.log("DIAG escalation_created=" + escalationId);
    }

    return new Response(
      JSON.stringify({
        ...decision,
        action_type: "ESCALATE",
        escalation_id: escalationId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "getPolicyDecision handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
