import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const requireIc = async (
  serviceClient: ReturnType<typeof createClient>,
  userId: string
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const { data: user, error } = await serviceClient
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  if (!user || user.role !== "IC") {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  return { ok: true };
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

    const guard = await requireIc(serviceClient, userId);
    if (!guard.ok) return guard.response;

    const { data: reports, error } = await serviceClient
      .from("speakup_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listSpeakupReports query failed:", error.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reportIds: string[] = (reports ?? []).map((r) => r.id);

    let contactIds = new Set<string>();
    const noteCounts = new Map<string, number>();

    if (reportIds.length > 0) {
      const { data: contacts, error: cErr } = await serviceClient
        .from("speakup_contact")
        .select("report_id")
        .in("report_id", reportIds);
      if (!cErr) {
        contactIds = new Set((contacts ?? []).map((c) => c.report_id));
      }

      const { data: notes, error: nErr } = await serviceClient
        .from("speakup_notes")
        .select("report_id")
        .in("report_id", reportIds);
      if (!nErr) {
        for (const n of notes ?? []) {
          noteCounts.set(n.report_id, (noteCounts.get(n.report_id) ?? 0) + 1);
        }
      }
    }

    // One access-log row per report returned, viewer_id = caller's id.
    for (const id of reportIds) {
      const { error: logError } = await serviceClient
        .from("speakup_access_log")
        .insert({ report_id: id, viewer_id: userId });
      if (logError) {
        console.error(
          `listSpeakupReports access log failed for ${id}:`,
          logError.message
        );
      }
    }

    const results = (reports ?? []).map((r) => ({
      ...r,
      has_contact: contactIds.has(r.id),
      notes_count: noteCounts.get(r.id) ?? 0,
    }));

    return new Response(JSON.stringify({ reports: results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "listSpeakupReports handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
