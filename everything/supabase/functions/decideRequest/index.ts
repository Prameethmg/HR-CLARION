import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const parseLeaveDays = (details: string | null | undefined): number => {
  if (!details) return 1;
  const match = details.match(/(\d+)\s+days?/i);
  if (!match) return 1;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const requestId = typeof body?.request_id === "string" ? body.request_id.trim() : "";
    const decision = typeof body?.decision === "string" ? body.decision.trim() : "";
    const decidedBy = typeof body?.decided_by === "string" ? body.decided_by.trim() : "";

    if (!requestId || (decision !== "APPROVED" && decision !== "REJECTED") || !decidedBy) {
      return new Response(
        JSON.stringify({ error: "request_id, decision (APPROVED|REJECTED) and decided_by are required" }),
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

    const { data: existing, error: existingError } = await serviceClient
      .from("requests")
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();

    if (existingError) {
      console.error("decideRequest fetch failed:", existingError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!existing) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: updatedRequest, error: updateError } = await serviceClient
      .from("requests")
      .update({
        status: decision,
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
      })
      .eq("request_id", requestId)
      .select("*")
      .single();

    if (updateError) {
      console.error("decideRequest update failed:", updateError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let employee: unknown = null;

    if (decision === "APPROVED") {
      const { data: emp, error: empError } = await serviceClient
        .from("employees")
        .select("*")
        .eq("id", existing.employee_id)
        .maybeSingle();

      if (empError) {
        console.error("decideRequest employee fetch failed:", empError.message);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!emp) {
        return new Response(JSON.stringify({ error: "Employee not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existing.request_type === "WFH") {
        const { data: upd, error: updErr } = await serviceClient
          .from("employees")
          .update({ wfh_used_this_month: (emp.wfh_used_this_month ?? 0) + 1 })
          .eq("id", existing.employee_id)
          .select("*")
          .single();
        if (updErr) {
          console.error("decideRequest WFH increment failed:", updErr.message);
          return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        employee = upd;
      } else if (existing.request_type === "LEAVE") {
        const days = parseLeaveDays(existing.details);
        const { data: upd, error: updErr } = await serviceClient
          .from("employees")
          .update({ leave_balance: (emp.leave_balance ?? 0) - days })
          .eq("id", existing.employee_id)
          .select("*")
          .single();
        if (updErr) {
          console.error("decideRequest LEAVE deduction failed:", updErr.message);
          return new Response(JSON.stringify({ error: "Internal error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        employee = upd;
      } else {
        employee = emp;
      }
    } else {
      const { data: emp, error: empError } = await serviceClient
        .from("employees")
        .select("*")
        .eq("id", existing.employee_id)
        .maybeSingle();
      if (empError) {
        console.error("decideRequest employee fetch (rejected) failed:", empError.message);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      employee = emp ?? null;
    }

    return new Response(JSON.stringify({ request: updatedRequest, employee }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "decideRequest handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
