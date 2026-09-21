import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: caller, error: callerError } = await serviceClient
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (callerError) {
      console.error("getSpeakupReports caller query failed:", callerError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!caller || caller.role !== "HR") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: reports, error } = await serviceClient
      .from("speakup_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("getSpeakupReports query failed:", error.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids: string[] = (reports ?? []).map((r) => r.id);
    let contactIds = new Set<string>();
    if (ids.length > 0) {
      const { data: contacts, error: cErr } = await serviceClient
        .from("speakup_contact")
        .select("report_id")
        .in("report_id", ids);
      if (!cErr) {
        contactIds = new Set((contacts ?? []).map((c) => c.report_id));
      }
    }

    const result = (reports ?? []).map((r) => ({
      ...r,
      has_contact: contactIds.has(r.id),
    }));

    return new Response(JSON.stringify({ reports: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "getSpeakupReports handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
