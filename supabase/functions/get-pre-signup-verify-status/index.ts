// get-pre-signup-verify-status
// Returns canonical presignup status by token and/or email.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { ensureSignupProof, hasUsableSignupProof, readPresignupTokenRow } from "../_shared/signupProof.ts";

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

const findAuthUserByEmail = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<{ user: Record<string, unknown> | null; error: string | null }> => {
  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email.toLowerCase())}`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      return { user: null, error: `auth_lookup_http_${response.status}` };
    }
    const payload = (await response.json()) as { users?: Array<Record<string, unknown>> };
    const users = payload.users || [];
    const match = users.find((user) => String(user.email || "").trim().toLowerCase() === email.toLowerCase()) || null;
    return { user: match, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { user: null, error: message || "auth_lookup_failed" };
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: { token?: string; email?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const token = String(body.token || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!token && !email) return json({ error: "token_or_email_required" }, 400);

    const { data: tokenRow, error } = token ? await readPresignupTokenRow(supabase, token) : { data: null, error: null };

    if (error) {
      console.error("[get-pre-signup-verify-status] fetch error", error.message);
      return json({ error: "server_error" }, 500);
    }

    const { data: emailRows, error: emailRowsError } = email
      ? await supabase
        .from("presignup_tokens")
        .select("token,email,verified,expires_at,signup_proof,signup_proof_issued_at,signup_proof_expires_at,signup_proof_used_at,created_at")
        .eq("email", email)
        .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (emailRowsError) {
      console.error("[get-pre-signup-verify-status] email fetch error", emailRowsError.message);
      return json({ error: "server_error" }, 500);
    }

    const nowMs = Date.now();
    const usableTokenRow =
      tokenRow && new Date(String(tokenRow.expires_at || "")).getTime() > nowMs ? tokenRow : null;
    const canonicalRow =
      (usableTokenRow?.verified ? usableTokenRow : null) ||
      (emailRows || []).find((row) => row.verified && !row.signup_proof_used_at && new Date(String(row.expires_at || "")).getTime() > nowMs) ||
      (emailRows || []).find((row) => !row.verified && new Date(String(row.expires_at || "")).getTime() > nowMs) ||
      usableTokenRow ||
      (emailRows || [])[0] ||
      null;

    if (!canonicalRow) {
      if (email) {
        const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
        const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
        if (supabaseUrl && serviceRoleKey) {
          const { user, error: authLookupError } = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
          if (authLookupError) {
            console.error("[get-pre-signup-verify-status] auth email lookup error", authLookupError);
            return json({ error: "server_error" }, 500);
          }
          const authConfirmed = Boolean(
            user &&
            (
              String(user.email_confirmed_at || "").trim() ||
              String(user.confirmed_at || "").trim()
            ),
          );
          return json({
            verified: authConfirmed,
            auth_confirmed: authConfirmed,
            confirmation_mode: authConfirmed ? "auth" : null,
            expired: false,
            signup_proof: null,
            email,
            token: null,
          });
        }
      }
      return json({ verified: false, auth_confirmed: false, confirmation_mode: null, expired: false, signup_proof: null, email, token: null });
    }

    const expired = new Date(canonicalRow.expires_at) < new Date();
    if (!canonicalRow.verified || expired) {
      return json({
        verified: canonicalRow.verified,
        auth_confirmed: false,
        confirmation_mode: canonicalRow.verified ? "presignup" : null,
        expired,
        signup_proof: null,
        email: canonicalRow.email,
        token: canonicalRow.token,
      });
    }

    const proof = await ensureSignupProof(supabase, canonicalRow);
    if (!proof.proof) {
      return json({
        verified: true,
        expired: false,
        signup_proof: hasUsableSignupProof(canonicalRow) ? canonicalRow.signup_proof : null,
        email: canonicalRow.email,
        token: canonicalRow.token,
      });
    }

    return json({
      verified: true,
      auth_confirmed: false,
      confirmation_mode: "presignup",
      expired: false,
      signup_proof: proof.proof,
      signup_proof_expires_at: proof.expires_at,
      email: canonicalRow.email,
      token: canonicalRow.token,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[get-pre-signup-verify-status] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
