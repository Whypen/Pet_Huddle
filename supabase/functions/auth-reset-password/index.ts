import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

type ResetBody = {
  email?: string;
  redirectTo?: string;
  turnstile_token?: string;
  turnstile_action?: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const DEFAULT_RESET_REDIRECT =
  "https://huddle.pet/auth/callback?type=recovery&next=/update-password";
const BREVO_API_KEY = String(Deno.env.get("BREVO_API_KEY") || "").trim();
const BREVO_FROM_EMAIL = String(Deno.env.get("BREVO_FROM_EMAIL") || "noreply@huddle.pet").trim();
const BREVO_FROM_NAME = "huddle";

const normalizeRedirectTo = (value: string) => {
  try {
    const url = new URL(value);
    if (url.pathname === "/update-password") {
      url.pathname = "/auth/callback";
      url.searchParams.set("type", "recovery");
      url.searchParams.set("next", "/update-password");
      return url.toString();
    }
    return value;
  } catch {
    return value;
  }
};

const isMissingUserError = (message: string) => {
  const normalized = message.trim().toLowerCase();
  return normalized.includes("not found") || normalized.includes("user not found");
};

async function sendResetEmail(to: string, resetUrl: string): Promise<{ ok: boolean; error: string | null }> {
  if (!BREVO_API_KEY) {
    return { ok: false, error: "brevo_not_configured" };
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#C8FF00;padding:18px 32px;">
          <span style="font-size:20px;font-weight:700;color:#1a1a1a;">huddle</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#414141;">Reset your password</h2>
          <p style="margin:0 0 12px;font-size:15px;color:#545454;line-height:1.7;">
            We received a request to reset your huddle password.
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#545454;line-height:1.7;">
            Use the button below to choose a new password. This link expires in 24 hours.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${resetUrl}"
               style="display:inline-block;padding:14px 32px;background:#2145CF;color:#ffffff;
                      font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">
              Reset my password
            </a>
          </td></tr></table>
          <p style="margin:28px 0 0;font-size:13px;color:#888888;line-height:1.5;">
            If you didn&apos;t request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaaaaa;">
            &copy; huddle &nbsp;·&nbsp;
            <a href="https://huddle.pet" style="color:#aaaaaa;">huddle.pet</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Reset your huddle password\n\n` +
    `Open this link to choose a new password:\n${resetUrl}\n\n` +
    `This link expires in 24 hours. If you didn't request this, you can ignore this email.`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: to }],
      subject: "Reset your huddle password",
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return { ok: false, error: errorText || `brevo_${res.status}` };
  }

  return { ok: true, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_misconfigured" });

  let body: ResetBody;
  try {
    body = (await req.json()) as ResetBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const redirectTo = normalizeRedirectTo(String(body.redirectTo || "").trim() || DEFAULT_RESET_REDIRECT);
  if (!email) return json(400, { error: "email_required" });

  const turnstile = await validateTurnstile(
    body.turnstile_token ?? null,
    clientIp(req),
    "reset_password",
    getExpectedTurnstileHostnames(),
  );
  if (!turnstile.valid) {
    return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
  }

  const authAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const generated = await authAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (generated.error) {
    const message = generated.error.message || "generate_link_failed";
    console.warn("[auth-reset-password] generateLink returned error", {
      email_domain: email.includes("@") ? email.split("@").slice(-1)[0] : "invalid",
      redirectTo,
      message,
    });
    if (isMissingUserError(message)) {
      return json(200, { data: null });
    }
    return json(500, { error: "reset_password_failed" });
  }

  const actionLink = String(generated.data?.properties?.action_link || "").trim();
  if (!actionLink) {
    console.error("[auth-reset-password] generateLink returned no action_link");
    return json(500, { error: "reset_password_failed" });
  }

  const sent = await sendResetEmail(email, actionLink);
  if (!sent.ok) {
    console.error("[auth-reset-password] brevo send failed", sent.error || "unknown");
    return json(500, { error: "reset_password_failed" });
  }

  return json(200, { data: null });
});
