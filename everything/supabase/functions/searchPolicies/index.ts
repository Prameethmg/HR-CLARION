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

const DEFAULT_TOP_K = 6;
const MAX_TOP_K = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const department =
      typeof body?.department === "string" && body.department.trim() !== ""
        ? body.department.trim()
        : null;

    if (!question) {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawTopK = body?.top_k;
    const parsedTopK =
      typeof rawTopK === "number" && Number.isFinite(rawTopK)
        ? Math.floor(rawTopK)
        : DEFAULT_TOP_K;
    const topK = Math.min(Math.max(parsedTopK, 1), MAX_TOP_K);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const session = new Supabase.ai.Session("gte-small");

    const embedStart = Date.now();
    const embedding = await session.run(question, {
      mean_pool: true,
      normalize: true,
    });
    const embedMs = Date.now() - embedStart;

    const values = Array.from(embedding as ArrayLike<number>);

    const searchStart = Date.now();
    const { data, error } = await serviceClient.rpc("match_policies", {
      query_embedding: `[${values.join(",")}]`,
      match_count: topK,
      dept: department,
    });
    const searchMs = Date.now() - searchStart;

    if (error) {
      console.error("searchPolicies match_policies failed:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        clauses: data ?? [],
        timing_ms: { embed: embedMs, search: searchMs },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("searchPolicies handler error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
