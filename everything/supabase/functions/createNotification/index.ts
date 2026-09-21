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
    const message = typeof body?.message === "string" ? body.message : "";
    const type = typeof body?.type === "string" ? body.type.trim() : "";
    const relatedId = typeof body?.related_id === "string" ? body.related_id.trim() : "";

    if (!userId || !message || !type || !relatedId) {
      return new Response(
        JSON.stringify({ error: "user_id, message, type and related_id are required" }),
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

    const id = "NOTIF-" + Date.now() + "-" + Math.floor(Math.random() * 9999);

    const { data: inserted, error } = await serviceClient
      .from("notifications")
      .insert({
        id,
        user_id: userId,
        message,
        type,
        related_id: relatedId,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      console.error("createNotification insert failed:", error.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ notification: inserted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "createNotification handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
