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

const BATCH_SIZE = 10;
const TIME_BUDGET_MS = 40000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const session = new Supabase.ai.Session("gte-small");

    const startedAt = Date.now();
    const attempted = new Set<string>();
    const failedClauseIds: string[] = [];
    let embeddedCount = 0;
    let firstErrorMessage = "";

    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      let query = serviceClient
        .from("policies")
        .select("clause_id, doc_title, topic, section_ref, clause_text")
        .is("embedding", null)
        .order("clause_id", { ascending: true })
        .limit(BATCH_SIZE);

      if (attempted.size > 0) {
        query = query.not("clause_id", "in", `(${Array.from(attempted).join(",")})`);
      }

      const { data: rows, error } = await query;

      if (error) {
        console.error("embedPolicies select failed:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        attempted.add(row.clause_id);
        const text = `${row.doc_title} | ${row.topic} | ${row.section_ref} | ${row.clause_text}`;
        try {
          const embedding = await session.run(text, {
            mean_pool: true,
            normalize: true,
          });
          const values = Array.from(embedding as ArrayLike<number>);
          const { error: updateError } = await serviceClient
            .from("policies")
            .update({ embedding: `[${values.join(",")}]` })
            .eq("clause_id", row.clause_id);

          if (updateError) {
            if (!firstErrorMessage) firstErrorMessage = updateError.message;
            failedClauseIds.push(row.clause_id);
            console.error(
              `embedPolicies update failed for ${row.clause_id}:`,
              updateError.message
            );
          } else {
            embeddedCount++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!firstErrorMessage) firstErrorMessage = message;
          failedClauseIds.push(row.clause_id);
          console.error(
            `embedPolicies embedding failed for ${row.clause_id}:`,
            message
          );
        }
      }
    }

    const { count, error: countError } = await serviceClient
      .from("policies")
      .select("clause_id", { count: "exact", head: true })
      .is("embedding", null);

    if (countError) {
      console.error("embedPolicies count failed:", countError.message);
    }

    if (firstErrorMessage) {
      console.error("embedPolicies first error:", firstErrorMessage);
    }

    return new Response(
      JSON.stringify({
        embedded_count: embeddedCount,
        remaining_null_count: count ?? -1,
        failed_clause_ids: failedClauseIds,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("embedPolicies handler error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
