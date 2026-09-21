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
    const managerId = typeof body?.manager_id === "string" ? body.manager_id.trim() : "";

    if (!managerId) {
      return new Response(JSON.stringify({ error: "manager_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: requests, error: requestsError } = await serviceClient
      .from("requests")
      .select("*")
      .eq("manager_id", managerId)
      .order("request_id", { ascending: true });

    if (requestsError) {
      console.error("getManagerRequests requests query failed:", requestsError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve employee names for the joined display
    const employeeIds = Array.from(
      new Set((requests ?? []).map((r) => r.employee_id).filter(Boolean))
    );
    let nameMap: Record<string, string> = {};
    if (employeeIds.length > 0) {
      const { data: employees, error: employeesError } = await serviceClient
        .from("employees")
        .select("id, name")
        .in("id", employeeIds);

      if (employeesError) {
        console.error("getManagerRequests employees query failed:", employeesError.message);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      nameMap = Object.fromEntries((employees ?? []).map((e) => [e.id, e.name]));
    }

    const result = (requests ?? []).map((r) => ({
      ...r,
      employee_name: nameMap[r.employee_id] ?? r.employee_id,
    }));

    return new Response(JSON.stringify({ requests: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "getManagerRequests handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
