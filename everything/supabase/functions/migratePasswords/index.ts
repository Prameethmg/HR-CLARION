import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { genSaltSync, hashSync } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: rows, error } = await serviceClient
      .from("users")
      .select("id, password");

    if (error) {
      console.error("migratePasswords fetch failed:", error.message);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows ?? []) {
      if (!row.password) {
        skipped++;
        continue;
      }
      // Safety guard: never re-hash a value that is already a bcrypt hash.
      if (row.password.startsWith("$2")) {
        skipped++;
        continue;
      }
      try {
        const hashed = hashSync(row.password, genSaltSync(10));
        const { error: updateError } = await serviceClient
          .from("users")
          .update({ password: hashed })
          .eq("id", row.id);
        if (updateError) {
          failed++;
          errors.push(`${row.id}: ${updateError.message}`);
        } else {
          updated++;
        }
      } catch (err) {
        failed++;
        errors.push(
          `${row.id}: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    return new Response(JSON.stringify({ updated, skipped, failed, errors }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "migratePasswords handler error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
