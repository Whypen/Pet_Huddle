// send-pre-signup-verify — v2
// Reuses an active pending DB token row on passive re-entry, or creates one
// only when needed / explicitly forced.
// Cleans up expired tokens on each call.
// Returns { ok: true } or { error: string } — never swallows failures.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getExpectedTurnstileHostnames,
  validateTurnstile,
} from "../_shared/turnstile.ts";

const BREVO_API_KEY    = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") ?? "noreply@huddle.pet";
const BREVO_VERIFY_TEMPLATE_ID = Number(Deno.env.get("BREVO_VERIFY_TEMPLATE_ID") || "3");
const APP_URL          = Deno.env.get("APP_URL") ?? "https://huddle.pet";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  (Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ?? "",
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
    let body: {
      email?: string;
      current_token?: string;
      turnstile_token?: string;
      force_new_token?: boolean;
      device_id?: string;
      install_id?: string;
    };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const { email, current_token, turnstile_token, force_new_token } = body;
    if (!email) return json({ error: "email_required" }, 400);
    const normalizedEmail = String(email).trim().toLowerCase();
    const ACCOUNT_UNAVAILABLE_MESSAGE =
      "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.";
    const SIGNUP_REVIEW_MESSAGE = "Signup is temporarily unavailable. Please try again later.";

    const { data: blockStatus, error: blockStatusError } = await supabase.rpc("lookup_signup_blocks", {
      p_email: normalizedEmail,
      p_phone: null,
      p_device_id: String(body.device_id || "").trim() || null,
      p_install_id: String(body.install_id || "").trim() || null,
    });
    if (blockStatusError) {
      console.error("[send-pre-signup-verify] block lookup failed", blockStatusError.message);
      return json({ error: "server_error" }, 500);
    }
    const blocked = Boolean((blockStatus as { blocked?: unknown } | null)?.blocked);
    if (blocked) {
      return json({
        error: "account_unavailable",
        public_message:
          String((blockStatus as { public_message?: unknown } | null)?.public_message || "").trim() ||
          ACCOUNT_UNAVAILABLE_MESSAGE,
      }, 403);
    }
    const reviewRequired = Boolean((blockStatus as { review_required?: unknown } | null)?.review_required);
    const cooldownUntil =
      String((blockStatus as { cooldown_until?: unknown } | null)?.cooldown_until || "").trim() || null;
    if (reviewRequired) {
      return json({
        error: "signup_temporarily_unavailable",
        public_message: SIGNUP_REVIEW_MESSAGE,
        cooldown_until: cooldownUntil,
      }, 429);
    }

    // Cleanup expired tokens (best-effort; non-fatal)
    await supabase
      .from("presignup_tokens")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .then(({ error }) => {
        if (error) console.warn("[send-pre-signup-verify] cleanup error", error.message);
      });

    const { data: existingRows, error: existingRowsError } = await supabase
      .from("presignup_tokens")
        .select("token,email,signal_key,verified,expires_at,signup_proof,signup_proof_issued_at,signup_proof_expires_at,signup_proof_used_at,created_at")
      .eq("email", normalizedEmail)
      .order("created_at", { ascending: false });

    if (existingRowsError) {
      console.error("[send-pre-signup-verify] existing row fetch failed", existingRowsError.message);
      return json({ error: "server_error" }, 500);
    }

    const nowMs = Date.now();
    const activePendingRow = (existingRows || []).find((row) => {
      const expiresAtMs = new Date(String(row.expires_at || "")).getTime();
      return !row.verified && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
    });
    const currentTokenValue = String(current_token || "").trim();
    const currentPendingRow = (existingRows || []).find((row) => {
      const expiresAtMs = new Date(String(row.expires_at || "")).getTime();
      return (
        currentTokenValue &&
        row.token === currentTokenValue &&
        !row.verified &&
        Number.isFinite(expiresAtMs) &&
        expiresAtMs > nowMs
      );
    });

    if (!force_new_token && activePendingRow) {
      return json({
        ok: true,
        token: activePendingRow.token,
        email: activePendingRow.email,
        signal_key: activePendingRow.signal_key,
        reused: true,
        email_sent: false,
      });
    }

    if (!currentPendingRow) {
      const clientIp =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const turnstile = await validateTurnstile(
        turnstile_token ?? null,
        clientIp,
        "send_pre_signup_verify",
        getExpectedTurnstileHostnames(),
      );
      if (!turnstile.valid) {
        console.warn("[send-pre-signup-verify] turnstile rejected", {
          reason: turnstile.reason,
          error_codes: turnstile.error_codes,
          action: turnstile.action,
          hostname: turnstile.hostname,
          challenge_ts: turnstile.challenge_ts,
          ip: clientIp,
        });
        return json({
          error: "human_verification_failed",
          turnstile_reason: turnstile.reason,
        }, 403);
      }
    }

    if (force_new_token) {
      const activeTokenValues = (existingRows || [])
        .filter((row) => {
          const expiresAtMs = new Date(String(row.expires_at || "")).getTime();
          return !row.verified && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
        })
        .map((row) => String(row.token || "").trim())
        .filter(Boolean);

      if (activeTokenValues.length > 0) {
        const { error: deleteError } = await supabase
          .from("presignup_tokens")
          .delete()
          .eq("email", normalizedEmail)
          .in("token", activeTokenValues);

        if (deleteError) {
          console.error("[send-pre-signup-verify] active token cleanup failed", deleteError.message);
          return json({ error: "db_error" }, 500);
        }
      }
    }

    // Insert token row — fail hard if this fails (no token = no verify path)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const nextToken = crypto.randomUUID();
    const signalKey = crypto.randomUUID();
    const { error: insertError } = await supabase.from("presignup_tokens").insert({
      token: nextToken,
      email: normalizedEmail,
      signal_key: signalKey,
      verified: false,
      expires_at: expiresAt,
      signup_proof: null,
      signup_proof_issued_at: null,
      signup_proof_expires_at: null,
      signup_proof_used_at: null,
    });

    if (insertError) {
      console.error("[send-pre-signup-verify] DB insert failed", insertError.message);
      return json({ error: "db_error" }, 500);
    }

    const verifyUrl = `${APP_URL}/verify?token=${encodeURIComponent(nextToken)}&email=${encodeURIComponent(normalizedEmail)}`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender:      { name: "Team Huddle", email: BREVO_FROM_EMAIL },
        to:          [{ email: normalizedEmail }],
        templateId:  BREVO_VERIFY_TEMPLATE_ID,
        params:      {
          email: normalizedEmail,
          verify_url: verifyUrl,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-pre-signup-verify] Brevo error", res.status, err);
      return json({ error: "email_send_failed" }, 500);
    }

    return json({ ok: true, token: nextToken, email: normalizedEmail, signal_key: signalKey, reused: false, email_sent: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
