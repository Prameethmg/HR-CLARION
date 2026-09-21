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
    const escalationId =
      typeof body?.escalation_id === "string" ? body.escalation_id.trim() : "";
    const hrReply =
      typeof body?.hr_reply === "string" ? body.hr_reply.trim() : "";

    if (!escalationId || !hrReply) {
      return new Response(
        JSON.stringify({ error: "escalation_id and hr_reply are required" }),
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

    const { data: existing, error: fetchError } = await serviceClient
      .from("escalations")
      .select("*")
      .eq("escalation_id", escalationId)
      .maybeSingle();

    if (fetchError) {
      console.error("replyToEscalation fetch failed:", fetchError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!existing) {
      return new Response(JSON.stringify({ error: "Escalation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: updated, error: updateError } = await serviceClient
      .from("escalations")
      .update({
        hr_reply: hrReply,
        hr_reply_at: new Date().toISOString(),
      })
      .eq("escalation_id", escalationId)
      .select("*")
      .single();

    if (updateError) {
      console.error("replyToEscalation update failed:", updateError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = ("HR has replied to your escalation: " + hrReply).slice(0, 200);
    const notificationId =
      "NOTIF-" + Date.now() + "-" + Math.floor(Math.random() * 9999);

    const { error: notifError } = await serviceClient
      .from("notifications")
      .insert({
        id: notificationId,
        user_id: existing.employee_id,
        message,
        type: "ESCALATION_REPLY",
        related_id: escalationId,
        is_read: false,
        created_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error(
        "replyToEscalation notification insert failed:",
        notifError.message
      );
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ escalation: updated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "replyToEscalation handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
