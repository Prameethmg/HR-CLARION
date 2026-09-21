import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "CLOSED"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const reportId = typeof body?.report_id === "string" ? body.report_id.trim() : "";
    const newStatus = typeof body?.new_status === "string" ? body.new_status.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!userId || !reportId) {
      return new Response(
        JSON.stringify({ error: "user_id and report_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (newStatus && !STATUSES.includes(newStatus)) {
      return new Response(JSON.stringify({ error: "invalid new_status" }), {
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
      console.error("updateSpeakupReport caller query failed:", callerError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!caller || caller.role !== "IC") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: report, error: reportError } = await serviceClient
      .from("speakup_reports")
      .select("id")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError) {
      console.error("updateSpeakupReport report query failed:", reportError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (note) {
      const { error: noteError } = await serviceClient
        .from("speakup_notes")
        .insert({ report_id: reportId, author_id: userId, note });
      if (noteError) {
        console.error("updateSpeakupReport note insert failed:", noteError.message);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (newStatus) {
      const { error: updateError } = await serviceClient
        .from("speakup_reports")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", reportId);
      if (updateError) {
        console.error("updateSpeakupReport status update failed:", updateError.message);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { error: logError } = await serviceClient
      .from("speakup_access_log")
      .insert({ report_id: reportId, viewer_id: userId });
    if (logError) {
      console.error("updateSpeakupReport access log failed:", logError.message);
    }

    const { data: current, error: currentError } = await serviceClient
      .from("speakup_reports")
      .select("status")
      .eq("id", reportId)
      .maybeSingle();

    const { data: notes, error: notesError } = await serviceClient
      .from("speakup_notes")
      .select("note, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false });

    if (currentError || notesError) {
      console.error("updateSpeakupReport read-back failed:", currentError?.message ?? notesError?.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        status: current?.status ?? null,
        notes: notes ?? [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "updateSpeakupReport handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
