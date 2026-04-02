// send-pre-signup-verify — v2
// Creates a DB token row then sends a Brevo verification email.
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
const APP_URL          = Deno.env.get("APP_URL") ?? "https://huddle.pet";

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
    let body: { email?: string; token?: string; turnstile_token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

    const { email, token, turnstile_token } = body;
    if (!email || !token) return json({ error: "email_and_token_required" }, 400);

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

    // Cleanup expired tokens (best-effort; non-fatal)
    await supabase
      .from("presignup_tokens")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .then(({ error }) => {
        if (error) console.warn("[send-pre-signup-verify] cleanup error", error.message);
      });

    // Insert token row — fail hard if this fails (no token = no verify path)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from("presignup_tokens").insert({
      token,
      email,
      verified: false,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("[send-pre-signup-verify] DB insert failed", insertError.message);
      return json({ error: "db_error" }, 500);
    }

    const verifyUrl = `${APP_URL}/verify?token=${encodeURIComponent(token)}`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender:      { name: "huddle", email: BREVO_FROM_EMAIL },
        to:          [{ email }],
        subject:     "Verify your email to join huddle",
        htmlContent: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;padding:32px;color:#424965;max-width:480px;margin:0 auto;">
  <h2 style="margin-bottom:8px;">Verify your email</h2>
  <p style="color:rgba(74,73,101,0.70);margin-bottom:24px;">
    Tap the button below to confirm your email address and complete your huddle registration.
  </p>
  <a href="${verifyUrl}"
     style="display:inline-block;background:#2145CF;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;">
    Verify email
  </a>
  <p style="margin-top:24px;color:rgba(74,73,101,0.50);font-size:12px;">
    This link expires in 24 hours. If you didn't create a huddle account, ignore this email.
  </p>
</body>
</html>`,
        textContent: `Verify your email to join huddle\n\nTap the link below:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[send-pre-signup-verify] Brevo error", res.status, err);
      return json({ error: "email_send_failed" }, 500);
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-pre-signup-verify] unexpected error", msg);
    return json({ error: "server_error" }, 500);
  }
});
