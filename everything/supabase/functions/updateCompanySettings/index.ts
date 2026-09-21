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

    const str = (v: unknown): string =>
      typeof v === "string" ? v.trim() : "";

    const companyName = str(body?.company_name);
    const companyTagline = str(body?.company_tagline);
    const companyEmail = str(body?.company_email);
    const companyPhone = str(body?.company_phone);
    const companyAddress = str(body?.company_address);
    const companyWebsite = str(body?.company_website);
    const companyLogo = typeof body?.company_logo === "string" ? body.company_logo : "";

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
      console.error("updateCompanySettings caller query failed:", callerError.message);
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

    // Ensure the singleton row exists, then update it.
    const { error: ensureError } = await serviceClient
      .from("company_settings")
      .upsert({ id: true }, { onConflict: "id" });

    if (ensureError) {
      console.error("updateCompanySettings ensure failed:", ensureError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: saved, error: updateError } = await serviceClient
      .from("company_settings")
      .update({
        company_name: companyName || null,
        company_tagline: companyTagline || null,
        company_email: companyEmail || null,
        company_phone: companyPhone || null,
        company_address: companyAddress || null,
        company_website: companyWebsite || null,
        company_logo: companyLogo || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select("*")
      .single();

    if (updateError) {
      console.error("updateCompanySettings update failed:", updateError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ settings: saved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "updateCompanySettings handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
