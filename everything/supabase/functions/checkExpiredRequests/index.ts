import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Matches "DD Mon YYYY" (one or two digits, whitespace, a month name,
// whitespace, a 4-digit year). For a range like "21–22 Aug 2025" only the
// second number ("22 Aug 2025") is directly followed by the month name, so it
// naturally selects the end/relevant date.
const parseDate = (details: string | null | undefined): Date | null => {
  if (!details) return null;
  const m = details.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (month === undefined) return null;
  return new Date(Date.UTC(+m[3], month, +m[1]));
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

    const { data: rows, error } = await serviceClient
      .from("requests")
      .select("*")
      .eq("status", "PENDING");

    if (error) {
      console.error("checkExpiredRequests query failed:", error.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const expiredIds: string[] = [];
    const skippedIds: string[] = [];

    for (const row of rows ?? []) {
      const requestDate = parseDate(row.details);

      if (!requestDate) {
        // No parseable "DD Mon YYYY" date — skip silently, do not modify.
        skippedIds.push(row.request_id);
        continue;
      }
      if (!(requestDate < today)) {
        // Date is today or in the future — not overdue yet.
        continue;
      }

      const { error: updateError } = await serviceClient
        .from("requests")
        .update({ status: "EXPIRED" })
        .eq("request_id", row.request_id);

      if (updateError) {
        console.error(
          `checkExpiredRequests update failed for ${row.request_id}:`,
          updateError.message
        );
        continue;
      }

      const notificationId =
        "NOTIF-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
      const { error: notifError } = await serviceClient
        .from("notifications")
        .insert({
          id: notificationId,
          user_id: row.employee_id,
          message:
            "Your " + row.request_type + " request has expired without a decision and has been marked as expired.",
          type: "REQUEST_EXPIRED",
          related_id: row.request_id,
          is_read: false,
          created_at: new Date().toISOString(),
        });

      if (notifError) {
        console.error(
          `checkExpiredRequests notification failed for ${row.request_id}:`,
          notifError.message
        );
        continue;
      }

      expiredIds.push(row.request_id);
    }

    return new Response(
      JSON.stringify({
        expired_count: expiredIds.length,
        expired_ids: expiredIds,
        skipped_ids: skippedIds,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "checkExpiredRequests handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
