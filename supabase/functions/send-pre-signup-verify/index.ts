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

    // Keep one active presignup row per email so the later signup proof path is deterministic.
    await supabase
      .from("presignup_tokens")
      .delete()
      .eq("email", email)
      .then(({ error }) => {
        if (error) console.warn("[send-pre-signup-verify] existing token cleanup error", error.message);
      });

    // Insert token row — fail hard if this fails (no token = no verify path)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from("presignup_tokens").insert({
      token,
      email,
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

    const verifyUrl = `${APP_URL}/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    const emailHtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
    <meta name="x-apple-disable-message-reformatting">
    <title>Verify your email to join huddle</title>
  </head>
  <body aria-disabled="false" style="margin:0;padding:0;background-color:rgb(240,241,245);text-size-adjust:100%;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:rgb(240,241,245);border:none;border-collapse:collapse;empty-cells:show;max-width:100%;font-size:16px;font-family:Arial;">
      <tbody>
        <tr>
          <td style="background-color:rgb(240,241,245);padding:20px 0;min-width:5px;user-select:text;border:0 solid transparent;">
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;min-height:600px;margin:0 auto;background-color:rgb(255,255,255);border:none;border-collapse:collapse;empty-cells:show;font-size:16px;font-family:Arial;">
              <tbody>
                <tr>
                  <td style="background-color:rgb(193,255,114);padding:32px 40px 28px;min-width:5px;user-select:text;border:0 solid transparent;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border:none;border-collapse:collapse;empty-cells:show;max-width:100%;font-size:16px;font-family:Arial;">
                      <tbody>
                        <tr>
                          <td style="vertical-align:top;text-align:left;min-width:5px;user-select:text;border:0 solid transparent;">
                            <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#414141;">Email Update</p>
                            <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#414141;line-height:1.2;">Verify your email</h1>
                          </td>
                          <td width="60" style="vertical-align:top;text-align:right;padding-left:12px;min-width:5px;user-select:text;border:0 solid transparent;">
                            <img src="https://ztrbourwcnhrpmzwlrcn.supabase.co/storage/v1/object/public/email-assets/ac541fc72d074e9785486186866a00ab.png" width="44" alt="huddle" style="display:block;width:44px;height:auto;margin-left:auto;cursor:pointer;padding:0 1px;position:relative;max-width:100%;">
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 40px;text-align:left;min-width:5px;user-select:text;border:0 solid transparent;">
                    <h2 style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#414141;">Hi there,</h2>
                    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#545454;line-height:1.7;">
                      Tap the email address below to verify your <strong style="font-weight:700;"><span style="color:rgb(33,69,207);">huddle</span></strong> account.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border:none;border-collapse:collapse;empty-cells:show;max-width:100%;font-size:16px;font-family:Arial;">
                      <tbody>
                        <tr>
                          <td style="background-color:rgb(33,69,207);border-radius:8px;min-width:5px;user-select:text;border:0 solid transparent;">
                            <a href="${verifyUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:rgb(255,255,255);text-decoration:none;user-select:auto;">Verify email</a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#888888;line-height:1.5;">
                      <strong style="font-weight:700;">Or paste this link into your browser:</strong><br>
                      <a href="${verifyUrl}" style="color:rgb(33,69,207);text-decoration:none;word-break:break-all;">${verifyUrl}</a>
                    </p>
                    <p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#888888;line-height:1.5;">
                      This link expires in 24 hours for your security. If you didn't create a huddle account, ignore this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:rgb(193,255,114);padding:14px 40px;min-width:5px;user-select:text;border:0 solid transparent;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border:none;border-collapse:collapse;empty-cells:show;max-width:100%;font-size:16px;font-family:Arial;">
                      <tbody>
                        <tr><td style="font-size:0;height:16px;min-width:5px;user-select:text;border:0 solid transparent;">&nbsp;</td></tr>
                        <tr>
                          <td style="text-align:left;min-width:5px;user-select:text;border:0 solid transparent;">
                            <a href="http://instagram.com/huddle.pet" target="_blank" style="display:block;text-decoration:none;user-select:auto;">
                              <img src="https://ztrbourwcnhrpmzwlrcn.supabase.co/storage/v1/object/public/email-assets/df93ac507cf208c552ac90463385ce90.png" width="22" alt="Instagram" style="display:block;width:22px;height:auto;cursor:pointer;padding:0 1px;position:relative;max-width:100%;">
                            </a>
                          </td>
                        </tr>
                        <tr><td style="font-size:0;height:16px;min-width:5px;user-select:text;border:0 solid transparent;">&nbsp;</td></tr>
                        <tr>
                          <td style="color:rgb(43,51,198);font-size:13px;font-family:Arial,sans-serif;line-height:1.4;text-align:left;min-width:5px;user-select:text;border:0 solid transparent;">
                            <span style="font-weight:700;">We want to get this right.</span><br>If you have feedback, DM us on Instagram — we're always listening!
                          </td>
                        </tr>
                        <tr><td style="font-size:0;height:16px;min-width:5px;user-select:text;border:0 solid transparent;"><br></td></tr>
                        <tr><td style="min-width:5px;user-select:text;border:0 solid transparent;">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</td></tr>
                        <tr><td style="font-size:0;height:16px;min-width:5px;user-select:text;border:0 solid transparent;">&nbsp;</td></tr>
                        <tr>
                          <td style="color:rgb(84,84,84);font-size:12px;font-family:Arial,sans-serif;line-height:1.4;text-align:left;min-width:5px;user-select:text;border:0 solid transparent;">
                            This is an automated huddle update — please do not reply to this email.
                          </td>
                        </tr>
                        <tr><td style="font-size:0;height:20px;min-width:5px;user-select:text;border:0 solid transparent;"><br></td></tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender:      { name: "Team Huddle", email: BREVO_FROM_EMAIL },
        to:          [{ email }],
        subject:     "Verify your email to join huddle",
        htmlContent: emailHtml,
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
