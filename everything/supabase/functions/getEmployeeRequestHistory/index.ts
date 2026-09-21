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
    const employeeId =
      typeof body?.employee_id === "string" ? body.employee_id.trim() : "";

    if (!employeeId) {
      return new Response(JSON.stringify({ error: "employee_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: employee, error: empError } = await serviceClient
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .maybeSingle();

    if (empError) {
      console.error("getEmployeeRequestHistory employee query failed:", empError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!employee) {
      return new Response(JSON.stringify({ error: "Employee not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Note: the requests table has no created_at column (schema is fixed), so
    // requests are sorted newest-first by decided_at (nulls last).
    const { data: requests, error: reqError } = await serviceClient
      .from("requests")
      .select("request_id, request_type, details, reason, status, decided_by, decided_at")
      .eq("employee_id", employeeId)
      .order("decided_at", { ascending: false, nullsFirst: false });

    if (reqError) {
      console.error("getEmployeeRequestHistory requests query failed:", reqError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: escalations, error: escError } = await serviceClient
      .from("escalations")
      .select(
        "escalation_id, question_text, reason, confidence, status, created_at, hr_reply, hr_reply_at"
      )
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    if (escError) {
      console.error("getEmployeeRequestHistory escalations query failed:", escError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        requests: requests ?? [],
        escalations: escalations ?? [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "getEmployeeRequestHistory handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
