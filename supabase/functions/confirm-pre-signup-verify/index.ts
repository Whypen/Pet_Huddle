// confirm-pre-signup-verify
// Marks a presignup token verified in DB.
// Called from SignupVerifyEmail.tsx (no auth session — anon key only).
// Returns canonical verification state and signup proof.

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
    let body: { token?: string; email?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const token = String(body.token || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!token) return json({ error: "token_required" }, 400);

    const { data: row, error: fetchErr } = await readPresignupTokenRow(supabase, token);

    if (fetchErr) {
      console.error("[confirm-pre-signup-verify] fetch error", fetchErr.message);
      return json({ error: "server_error" }, 500);
    }
    if (!row) {
      if (!email) return json({ verified: false, expired: false, signup_proof: null, email: null });
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("presignup_tokens")
        .select("token,email,verified,expires_at,signup_proof,signup_proof_issued_at,signup_proof_expires_at,signup_proof_used_at,created_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(5);
      if (fallbackError) {
        console.error("[confirm-pre-signup-verify] fallback fetch error", fallbackError.message);
        return json({ error: "server_error" }, 500);
      }
      const nowMs = Date.now();
      const fallbackRow =
        (fallbackRows || []).find((candidate) => {
          const expiresAtMs = new Date(String(candidate.expires_at || "")).getTime();
          return candidate.verified && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
        }) ||
        (fallbackRows || []).find((candidate) => {
          const expiresAtMs = new Date(String(candidate.expires_at || "")).getTime();
          return !candidate.verified && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
        }) ||
        fallbackRows?.[0];
      if (!fallbackRow) return json({ verified: false, expired: false, signup_proof: null, email, token: null });
      const fallbackExpired = new Date(fallbackRow.expires_at) < new Date();
      if (fallbackExpired) return json({ verified: false, expired: true, signup_proof: null, email: fallbackRow.email, token: fallbackRow.token });
      if (!fallbackRow.verified) {
        const { error: verifyFallbackError } = await supabase
          .from("presignup_tokens")
          .update({ verified: true })
          .eq("token", fallbackRow.token);
        if (verifyFallbackError) {
          console.error("[confirm-pre-signup-verify] fallback verify error", verifyFallbackError.message);
          return json({ error: "server_error" }, 500);
        }
      }
      const refreshedFallback = await readPresignupTokenRow(supabase, String(fallbackRow.token || ""));
      const finalFallbackRow = refreshedFallback.data || fallbackRow;
      if (refreshedFallback.error) {
        console.error("[confirm-pre-signup-verify] fallback refresh error", refreshedFallback.error.message);
      }
      const fallbackProof = await ensureSignupProof(supabase, finalFallbackRow);
      return json({
        verified: true,
        expired: false,
        signup_proof: fallbackProof.proof,
        signup_proof_expires_at: fallbackProof.expires_at,
        email: finalFallbackRow.email,
        token: finalFallbackRow.token,
      });
    }

    const expired = new Date(row.expires_at) < new Date();
    if (expired) return json({ verified: false, expired: true, signup_proof: null, email: row.email, token: row.token });
    if (row.verified) {
      const proof = await ensureSignupProof(supabase, row);
      return json({
        verified: true,
        expired: false,
        signup_proof: proof.proof,
        signup_proof_expires_at: proof.expires_at,
        email: row.email,
        token: row.token,
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
      email: refreshed.data.email,
      token: refreshed.data.token,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
