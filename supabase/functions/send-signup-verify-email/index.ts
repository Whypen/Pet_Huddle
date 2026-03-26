// supabase/functions/send-signup-verify-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const APP_URL    = Deno.env.get("APP_URL")      ?? "https://huddle.pet";
const BREVO_KEY  = Deno.env.get("BREVO_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") ?? "noreply@huddle.pet";
const FROM_NAME  = "huddle";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

async function sendVerifyEmail(
  to: string,
  name: string,
  verifyUrl: string,
): Promise<boolean> {
  const displayName = name || "there";
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
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#414141;">Hi ${displayName},</h2>
          <p style="margin:0 0 8px;font-size:15px;color:#545454;line-height:1.7;">
            Thanks for joining huddle! One quick step left — confirm your email address
            so we know it's really you.
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#545454;line-height:1.7;">
            The button below expires in 24 hours.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${verifyUrl}"
               style="display:inline-block;padding:14px 32px;background:#2145CF;color:#ffffff;
                      font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">
              Verify my email
            </a>
          </td></tr></table>
          <p style="margin:28px 0 0;font-size:13px;color:#888888;line-height:1.5;">
            If you didn't create a huddle account, you can safely ignore this email.
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

  const text = `Hi ${displayName},\n\nThanks for joining huddle! Verify your email here:\n${verifyUrl}\n\nThe link expires in 24 hours.\n\nIf you didn't create a huddle account, you can safely ignore this email.`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to, name: displayName }],
      subject:     "Verify your huddle account to complete sign up",
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[send-signup-verify-email] brevo error", res.status, err);
  }
  return res.ok;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    let body: { user_id?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { user_id } = body;
    if (!user_id) return json({ error: "user_id required" }, 400);

    // Fetch profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", user_id)
      .single();

    if (error || !profile?.email) {
      console.error("[send-signup-verify-email] profile not found", user_id);
      return json({ ok: true, skipped: true });
    }

    // Generate a one-time token, store it with 24h expiry
    const token     = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await supabase
      .from("profiles")
      .update({
        email_verify_token:            token,
        email_verify_token_expires_at: expiresAt,
      })
      .eq("id", user_id);

    if (tokenError) {
      console.error("[send-signup-verify-email] token store failed", tokenError.message);
      return json({ error: "server error" }, 500);
    }

    const verifyUrl = `${APP_URL}/signup/email-confirmation?token=${token}&uid=${user_id}`;
    const sent      = await sendVerifyEmail(profile.email, profile.display_name || "there", verifyUrl);

    if (!sent) {
      console.error("[send-signup-verify-email] send failed", user_id);
      return json({ ok: true, skipped: true, reason: "send_failed" });
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-signup-verify-email] unexpected error", msg);
    return json({ error: "server error" }, 500);
  }
});
