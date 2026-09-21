import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PASSCODE = "clarion-diag-2026";
const AI_MODEL = "alibaba/qwen-3.7-plus";
const GATEWAY_URL = "https://api.enter.pro/code/api/v1/ai/chat/completions";

// Copied verbatim from getPolicyDecision/index.ts
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
    const passphrase = typeof body?.passphrase === "string" ? body.passphrase : "";
    const variant = typeof body?.variant === "string" ? body.variant : "";

    if (passphrase !== PASSCODE) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validVariants = ["baseline", "max_tokens", "no_thinking"];
    if (!validVariants.includes(variant)) {
      return new Response(JSON.stringify({ error: "invalid variant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AI_API_TOKEN = Deno.env.get("AI_API_TOKEN_317763878e3e");
    if (!AI_API_TOKEN) {
      throw new Error("AI_API_TOKEN is not configured");
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const question =
      "How long do I have to submit my expense report after a business trip?";
    const { data: context, error: contextError } = await serviceClient.functions.invoke(
      "getPolicyContext",
      { body: { employee_id: "EMP002", topic: "UNKNOWN", question } }
    );

    if (contextError || !context?.employee || !Array.isArray(context.policies)) {
      throw new Error(
        "getPolicyContext failed: " + (contextError?.message ?? "empty context")
      );
    }

    const userMessage = [
      "EMPLOYEE RECORD:",
      JSON.stringify(context.employee, null, 2),
      "",
      "POLICY CLAUSES:",
      context.policies
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

    const requestBody: Record<string, unknown> = {
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      stream: false,
    };
    if (variant === "max_tokens") {
      requestBody.max_tokens = 1000;
    } else if (variant === "no_thinking") {
      requestBody.enable_thinking = false;
    }

    const aiStart = Date.now();
    const aiResponse = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_TOKEN}`,
        "Content-Type": "application/json",
        "X-Session-ID": crypto.randomUUID(),
        "X-Enter-Project-ID": "317763878e3e472bbbfd1c2b1b9bf8fc",
      },
      body: JSON.stringify(requestBody),
    });
    const seconds = (Date.now() - aiStart) / 1000;

    const rawText = await aiResponse.text();

    if (!aiResponse.ok) {
      let errorText = rawText.slice(0, 500);
      try {
        const parsed = JSON.parse(rawText);
        errorText = parsed.error?.message || errorText;
      } catch {
        const m = rawText.match(/data: (.+)/);
        if (m) {
          try {
            const sse = JSON.parse(m[1]);
            errorText = sse.error?.message || errorText;
          } catch {
            // keep raw
          }
        }
      }
      return new Response(
        JSON.stringify({
          variant,
          seconds,
          http_status: aiResponse.status,
          usage: null,
          finish_reason: null,
          content_chars: 0,
          parses_as_json: false,
          reasoning_field_present: false,
          reasoning_chars: 0,
          content_preview: "",
          error_text: errorText,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let aiJson: Record<string, unknown> = {};
    try {
      aiJson = JSON.parse(rawText);
    } catch {
      aiJson = {};
    }

    const choice = (aiJson.choices as Array<Record<string, unknown>> | undefined)?.[0] as
      | Record<string, unknown>
      | undefined;
    const message = (choice?.message ?? {}) as Record<string, unknown>;
    const content = typeof message.content === "string" ? message.content : "";

    let reasoningField = "";
    for (const key of ["reasoning", "reasoning_content", "thinking", "thought"]) {
      const v = message[key];
      if (typeof v === "string" && v.length > 0) {
        reasoningField = v;
        break;
      }
    }

    let parsesAsJson = false;
    try {
      JSON.parse(content);
      parsesAsJson = true;
    } catch {
      parsesAsJson = false;
    }

    return new Response(
      JSON.stringify({
        variant,
        seconds,
        http_status: aiResponse.status,
        usage: aiJson.usage ?? null,
        finish_reason: choice?.finish_reason ?? null,
        content_chars: content.length,
        parses_as_json: parsesAsJson,
        reasoning_field_present: reasoningField.length > 0,
        reasoning_chars: reasoningField.length,
        content_preview: content.slice(0, 200),
        error_text: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("diagAiSpeedTest handler error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
