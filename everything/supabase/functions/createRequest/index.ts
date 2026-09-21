import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const mapRequestType = (requestType: string): string => {
  switch (requestType) {
    case "WFH_REQUEST":
      return "WFH";
    case "LEAVE_REQUEST":
      return "LEAVE";
    default:
      return requestType;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const employeeId = typeof body?.employee_id === "string" ? body.employee_id.trim() : "";
    const requestType = typeof body?.request_type === "string" ? body.request_type.trim() : "";
    const details = typeof body?.details === "string" ? body.details.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const reasoningSnapshot =
      typeof body?.reasoning_snapshot === "string" ? body.reasoning_snapshot : "";
    const citations = typeof body?.citations === "string" ? body.citations.trim() : "";

    if (!employeeId || !requestType || !details || !reason) {
      return new Response(
        JSON.stringify({
          error: "employee_id, request_type, details and reason are required",
        }),
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

    const { data: employee, error: empError } = await serviceClient
      .from("employees")
      .select("id, manager_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (empError) {
      console.error("createRequest employee fetch failed:", empError.message);
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
    if (!employee.manager_id) {
      return new Response(
        JSON.stringify({ error: "Employee has no manager assigned" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestId = `REQ-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const { data: created, error: insertError } = await serviceClient
      .from("requests")
      .insert({
        request_id: requestId,
        employee_id: employeeId,
        request_type: mapRequestType(requestType),
        details,
        reason,
        status: "PENDING",
        manager_id: employee.manager_id,
        reasoning_snapshot: reasoningSnapshot,
        citations: citations || null,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("createRequest insert failed:", insertError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ request: created }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "createRequest handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
