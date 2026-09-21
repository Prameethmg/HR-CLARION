import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RiskResult {
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  risk_factors: string[];
}

const computeRisk = (e: {
  tenure_months: number | null;
  months_since_promotion: number | null;
  leave_utilisation_pct: number | null;
  last_engagement_score: number | null;
  overtime_flag: boolean | null;
  manager_changes_12m: number | null;
}): RiskResult => {
  const tenure = e.tenure_months ?? 0;
  const promo = e.months_since_promotion ?? 0;
  const leavePct = e.leave_utilisation_pct ?? 100;
  const engagement = e.last_engagement_score ?? 3;
  const overtime = e.overtime_flag === true;
  const changes = e.manager_changes_12m ?? 0;

  let score = 0;
  const factors: string[] = [];

  if (promo > 24) {
    score += 25;
    factors.push(`No promotion in ${promo} months`);
  }
  if (engagement <= 2) {
    score += 25;
    factors.push(`Engagement ${engagement}/5`);
  }
  if (leavePct < 20) {
    score += 15;
    factors.push(`Leave utilisation ${leavePct}% (<20%)`);
  }
  if (overtime) {
    score += 15;
    factors.push("Overtime flagged");
  }
  if (changes >= 2) {
    score += 10;
    factors.push(`${changes} manager changes in 12 months`);
  }
  if (tenure >= 12 && tenure <= 24) {
    score += 10;
    factors.push(`Tenure ${tenure} months (12-24)`);
  }

  const risk_level: RiskResult["risk_level"] =
    score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

  return { risk_score: score, risk_level, risk_factors: factors };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: policies, error: policiesError } = await serviceClient
      .from("policies")
      .select("clause_id, doc_title, section_ref, topic, scope, precedence, effective_date")
      .order("clause_id", { ascending: true });

    if (policiesError) {
      console.error("getAdminOverview policies query failed:", policiesError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employees, error: employeesError } = await serviceClient
      .from("employees")
      .select(
        "id, name, department, role_title, manager_id, leave_balance, wfh_used_this_month, tenure_months, months_since_promotion, leave_utilisation_pct, last_engagement_score, overtime_flag, manager_changes_12m"
      )
      .order("id", { ascending: true });

    if (employeesError) {
      console.error("getAdminOverview employees query failed:", employeesError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employeesWithRisk = (employees ?? []).map((emp) => ({
      ...emp,
      ...computeRisk(emp),
    }));

    const { data: escalations, error: escalationsError } = await serviceClient
      .from("escalations")
      .select("*")
      .order("created_at", { ascending: true });

    if (escalationsError) {
      console.error("getAdminOverview escalations query failed:", escalationsError.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employeeIds = Array.from(
      new Set((escalations ?? []).map((e) => e.employee_id).filter(Boolean))
    );
    let nameMap: Record<string, string> = {};
    if (employeeIds.length > 0) {
      const { data: empRows, error: empErr } = await serviceClient
        .from("employees")
        .select("id, name")
        .in("id", employeeIds);
      if (empErr) {
        console.error("getAdminOverview escalation join failed:", empErr.message);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      nameMap = Object.fromEntries((empRows ?? []).map((e) => [e.id, e.name]));
    }

    const escalationsWithNames = (escalations ?? []).map((e) => ({
      ...e,
      employee_name: nameMap[e.employee_id] ?? e.employee_id,
    }));

    return new Response(
      JSON.stringify({
        policies: policies ?? [],
        employees: employeesWithRisk,
        escalations: escalationsWithNames,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "getAdminOverview handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
