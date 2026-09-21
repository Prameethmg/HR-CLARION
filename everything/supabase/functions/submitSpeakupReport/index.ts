import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = ["HARASSMENT", "DISCRIMINATION", "RETALIATION", "SAFETY", "OTHER"];
const TOKEN_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const generateToken = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const incidentText =
      typeof body?.incident_text === "string" ? body.incident_text.trim() : "";
    const incidentPeriod =
      typeof body?.incident_period === "string" ? body.incident_period.trim() : "";
    const location = typeof body?.location === "string" ? body.location.trim() : "";
    const wantsFollowup = body?.wants_followup === true;
    const contactNote =
      typeof body?.contact_note === "string" ? body.contact_note.trim() : "";

    if (!category || !CATEGORIES.includes(category)) {
      return new Response(JSON.stringify({ error: "category is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!incidentText) {
      return new Response(JSON.stringify({ error: "incident_text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const reportToken = generateToken();

    const { data: report, error: insertError } = await serviceClient
      .from("speakup_reports")
      .insert({
        report_token: reportToken,
        category,
        incident_text: incidentText,
        incident_period: incidentPeriod || null,
        location: location || null,
        wants_followup: wantsFollowup,
      })
      .select("id, report_token")
      .single();

    if (insertError) {
      console.error("submitSpeakupReport insert failed:", insertError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (wantsFollowup && contactNote) {
      const { error: contactError } = await serviceClient
        .from("speakup_contact")
        .insert({ report_id: report.id, contact_note: contactNote });
      if (contactError) {
        console.error("submitSpeakupReport contact insert failed:", contactError.message);
      }
    }

    // Return ONLY the token. No identity, no internal id.
    return new Response(JSON.stringify({ report_token: report.report_token }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "submitSpeakupReport handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
