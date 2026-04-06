// confirm-pre-signup-verify
// Marks a presignup token verified in DB.
// Called from SignupVerifyEmail.tsx (no auth session — anon key only).
// Returns { verified: bool, expired: bool } — never exposes email or internal state.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ensureSignupProof, readPresignupTokenRow } from "../_shared/signupProof.ts";

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

    const { data: row, error: fetchErr } = await readPresignupTokenRow(supabase, token);

    if (fetchErr) {
      console.error("[confirm-pre-signup-verify] fetch error", fetchErr.message);
      return json({ error: "server_error" }, 500);
    }
    if (!row) return json({ verified: false, expired: false, signup_proof: null });

    const expired = new Date(row.expires_at) < new Date();
    if (expired) return json({ verified: false, expired: true, signup_proof: null });
    if (row.verified) {
      const proof = await ensureSignupProof(supabase, row);
      return json({
        verified: true,
        expired: false,
        signup_proof: proof.proof,
        signup_proof_expires_at: proof.expires_at,
      });
    }

    const { error: updateErr } = await supabase
      .from("presignup_tokens")
      .update({ verified: true })
      .eq("token", token);

    if (updateErr) {
      console.error("[confirm-pre-signup-verify] update error", updateErr.message);
      return json({ error: "server_error" }, 500);
    }

    const refreshed = await readPresignupTokenRow(supabase, token);
    if (refreshed.error || !refreshed.data) {
      return json({ verified: true, expired: false, signup_proof: null });
    }
    const proof = await ensureSignupProof(supabase, refreshed.data);

    return json({
      verified: true,
      expired: false,
      signup_proof: proof.proof,
      signup_proof_expires_at: proof.expires_at,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
