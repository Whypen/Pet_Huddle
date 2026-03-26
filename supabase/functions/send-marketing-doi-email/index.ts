// supabase/functions/send-marketing-doi-email/index.ts
//
// Records first marketing opt-in and sends the DOI confirmation email.
// Called fire-and-forget from SignupName after account creation.
// Never blocks account creation — always fail-open.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const APP_URL    = Deno.env.get("APP_URL")           ?? "https://huddle.pet";
const BREVO_KEY  = Deno.env.get("BREVO_API_KEY")     ?? "";
const FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL")  ?? "noreply@huddle.pet";
const FROM_NAME  = "huddle";

// DOI token valid for 7 days (more lenient than account verification)
const DOI_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

async function sendDoiEmail(to: string, name: string, doiUrl: string): Promise<boolean> {
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
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#414141;">Confirm your subscription</h2>
          <p style="margin:0 0 8px;font-size:15px;color:#545454;line-height:1.7;">
            Hi ${displayName},
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#545454;line-height:1.7;">
            You asked to receive emails from huddle for pet care, community news, and product updates.
            Click the button below to confirm your subscription.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${doiUrl}"
               style="display:inline-block;padding:14px 32px;background:#2145CF;color:#ffffff;
                      font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">
              Confirm my subscription
            </a>
          </td></tr></table>
          <p style="margin:28px 0 0;font-size:13px;color:#888888;line-height:1.5;">
            This link expires in 7 days. If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaaaaa;">
            &copy; huddle &nbsp;&middot;&nbsp;
            <a href="https://huddle.pet" style="color:#aaaaaa;">huddle.pet</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Hi ${displayName},\n\nConfirm your huddle subscription here:\n${doiUrl}\n\nThis link expires in 7 days. If you didn't request this, you can safely ignore this email.`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to, name: displayName }],
      subject:     "Confirm your huddle subscription",
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[send-marketing-doi-email] brevo error", res.status, err);
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
      .select("email, display_name, marketing_doi_confirmed")
      .eq("id", user_id)
      .single();

    if (error || !profile?.email) {
      console.error("[send-marketing-doi-email] profile not found", user_id);
      return json({ ok: true, skipped: true });
    }

    // Idempotent: already DOI confirmed — nothing to do
    if (profile.marketing_doi_confirmed) {
      return json({ ok: true, already_confirmed: true });
    }

    // Generate DOI token with 7-day expiry
    const token     = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DOI_TTL_MS).toISOString();
    const now       = new Date().toISOString();

    // Record first opt-in + store token
    const { error: writeError } = await supabase
      .from("profiles")
      .update({
        marketing_opt_in_checked:       true,
        marketing_opt_in_checked_at:    now,
        marketing_doi_token:            token,
        marketing_doi_token_expires_at: expiresAt,
      })
      .eq("id", user_id);

    if (writeError) {
      console.error("[send-marketing-doi-email] write failed", writeError.message);
      return json({ error: "server error" }, 500);
    }

    const doiUrl = `${APP_URL}/signup/marketing-confirmed?token=${token}&uid=${user_id}`;
    const sent   = await sendDoiEmail(profile.email, profile.display_name || "there", doiUrl);

    if (!sent) {
      console.warn("[send-marketing-doi-email] send failed (opt-in recorded)", user_id);
      return json({ ok: true, skipped: true, reason: "send_failed" });
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-marketing-doi-email] unexpected error", msg);
    return json({ error: "server error" }, 500);
  }
});
