import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Built-in Supabase Edge Runtime AI session (gte-small, 384 dims, no API key).
declare const Supabase: {
  ai: {
    Session: new (
      model: string
    ) => {
      run: (
        text: string,
        options?: { mean_pool?: boolean; normalize?: boolean }
      ) => Promise<unknown>;
    };
  };
};

const POLICY_COLUMNS =
  "clause_id, doc_title, section_ref, topic, scope, precedence, clause_text, effective_date";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const employeeId = typeof body?.employee_id === "string" ? body.employee_id.trim() : "";
    const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    if (!employeeId || !topic) {
      return new Response(
        JSON.stringify({ error: "employee_id and topic are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: employee, error: employeeError } = await serviceClient
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) {
      console.error("getPolicyContext employee query failed:", employeeError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employee) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deterministic set: topic match AND scope COMPANY or the employee's department.
    // Skipped when topic is missing or UNKNOWN.
    const deterministicClauses: Record<string, unknown>[] = [];
    if (topic && topic !== "UNKNOWN") {
      const { data, error } = await serviceClient
        .from("policies")
        .select(POLICY_COLUMNS)
        .eq("topic", topic)
        .in("scope", ["COMPANY", employee.department]);

      if (error) {
        console.error("getPolicyContext policies query failed:", error.message);
      } else {
        deterministicClauses.push(...(data ?? []));
      }
    }

    let policies: Record<string, unknown>[] = deterministicClauses;
    let retrievalMode:
      | "empty"
      | "topic_only"
      | "topic_plus_vector"
      | "topic_only_fallback"
      | "vector_only" =
      deterministicClauses.length > 0 ? "topic_only" : "empty";

    if (question) {
      try {
        const session = new Supabase.ai.Session("gte-small");
        const embedding = await session.run(question, {
          mean_pool: true,
          normalize: true,
        });
        const values = Array.from(embedding as ArrayLike<number>);

        const matchCount = deterministicClauses.length > 0 ? 5 : 8;
        const { data: matches, error: matchError } = await serviceClient.rpc(
          "match_policies",
          {
            query_embedding: `[${values.join(",")}]`,
            match_count: matchCount,
            dept: employee.department,
          }
        );

        if (matchError) throw matchError;

        const matchIds: string[] = (matches ?? []).map((m) => m.clause_id);
        const vectorClauses: Record<string, unknown>[] = [];

        if (matchIds.length > 0) {
          const { data: fullRows, error: fullErr } = await serviceClient
            .from("policies")
            .select(POLICY_COLUMNS)
            .in("clause_id", matchIds);

          if (!fullErr && fullRows) {
            const byId = new Map(fullRows.map((r) => [r.clause_id, r]));
            const seen = new Set(deterministicClauses.map((c) => c.clause_id));
            for (const m of matches ?? []) {
              const row = byId.get(m.clause_id);
              if (row && !seen.has(row.clause_id)) {
                vectorClauses.push(row);
                seen.add(row.clause_id);
              }
            }
          }
        }

        policies = [...deterministicClauses, ...vectorClauses];
        retrievalMode =
          deterministicClauses.length > 0 ? "topic_plus_vector" : "vector_only";
      } catch (err) {
        console.error(
          "getPolicyContext vector step failed:",
          err instanceof Error ? err.message : err
        );
        policies = deterministicClauses;
        retrievalMode =
          deterministicClauses.length > 0 ? "topic_only_fallback" : "empty";
      }
    }

    return new Response(
      JSON.stringify({ employee, policies, retrieval_mode: retrievalMode }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "getPolicyContext handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
