// confirm-pre-signup-verify
// Marks a presignup token verified in DB.
// Called from SignupVerifyEmail.tsx (no auth session — anon key only).
// Returns { verified: bool, expired: bool } — never exposes email or internal state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: { token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const { token } = body;
    if (!token) return json({ error: "token_required" }, 400);

    const { data: row, error: fetchErr } = await supabase
      .from("presignup_tokens")
      .select("verified, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (fetchErr) {
      console.error("[confirm-pre-signup-verify] fetch error", fetchErr.message);
      return json({ error: "server_error" }, 500);
    }
    if (!row) return json({ verified: false, expired: false });

    const expired = new Date(row.expires_at) < new Date();
    if (expired) return json({ verified: false, expired: true });
    if (row.verified) return json({ verified: true, expired: false });

    const { error: updateErr } = await supabase
      .from("presignup_tokens")
      .update({ verified: true })
      .eq("token", token);

    if (updateErr) {
      console.error("[confirm-pre-signup-verify] update error", updateErr.message);
      return json({ error: "server_error" }, 500);
    }

    return json({ verified: true, expired: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
