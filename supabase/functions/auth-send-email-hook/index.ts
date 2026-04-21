type HookPayload = {
  user?: {
    email?: string;
    new_email?: string;
  };
  email_data?: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    email_action_type?: string;
  };
};

type EmailJob = {
  email: string;
  action: string;
  tokenHash: string;
};

const BREVO_API_KEY = String(Deno.env.get("BREVO_API_KEY") || "").trim();
const FROM_EMAIL = String(Deno.env.get("BREVO_FROM_EMAIL") || "noreply@huddle.pet").trim();
const FROM_NAME = String(Deno.env.get("BREVO_FROM_NAME") || "Team Huddle").trim();
const HOOK_SECRET = String(Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").trim();
const textEncoder = new TextEncoder();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const hookSecretBase64 = (secret: string) => String(secret || "").trim().replace(/^v1,whsec_/, "");

const normalizeBase64 = (value: string) => {
  const normalized = String(value || "").trim();
  const remainder = normalized.length % 4;
  return remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
};

const decodeBase64 = (value: string) =>
  Uint8Array.from(atob(normalizeBase64(value)), (char) => char.charCodeAt(0));

const encodeBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
};

const readV1Signature = (headers: Headers) =>
  String(headers.get("webhook-signature") || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .find((part) => part.startsWith("v1,"))
    ?.slice(3) || "";

const verifyHookSignature = async (raw: string, headers: Headers) => {
  const webhookId = String(headers.get("webhook-id") || "").trim();
  const webhookTimestamp = String(headers.get("webhook-timestamp") || "").trim();
  const webhookSignature = readV1Signature(headers);

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error("missing_webhook_signature_headers");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(hookSecretBase64(HOOK_SECRET)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(`${webhookId}.${webhookTimestamp}.${raw}`),
  );
  const expected = encodeBase64(new Uint8Array(signed));

  if (!constantTimeEqual(expected, webhookSignature)) {
    throw new Error("invalid_webhook_signature");
  }
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const buildEmailLink = (action: string, tokenHash: string) => {
  const encoded = encodeURIComponent(tokenHash);
  switch (action) {
    case "recovery":
      return `https://huddle.pet/update-password?token_hash=${encoded}&type=recovery`;
    case "invite":
      return `https://huddle.pet/auth/callback?token_hash=${encoded}&type=invite`;
    case "email_change":
      return `https://huddle.pet/auth/callback?token_hash=${encoded}&type=email_change`;
    case "magiclink":
      return `https://huddle.pet/auth/callback?token_hash=${encoded}&type=magiclink`;
    case "signup":
    case "email":
    default:
      return `https://huddle.pet/auth/callback?token_hash=${encoded}&type=email`;
  }
};

const contentFor = (action: string, tokenHash: string) => {
  const link = buildEmailLink(action, tokenHash);

  switch (action) {
    case "recovery":
      return {
        subject: "Reset your huddle password",
        button: "Reset password",
        heading: "Reset your password",
        body:
          "We received a request to reset the password for your huddle account. Use the link below to choose a new password.",
        link,
      };
    case "magiclink":
    case "email":
      return {
        subject: "Verify your email to join huddle!",
        button: "Verify email",
        heading: "Verify your email",
        body:
          "Use the link below to verify your huddle email address and continue in the app.",
        link,
      };
    case "signup":
      return {
        subject: "Confirm Your Signup",
        button: "Confirm signup",
        heading: "Confirm your signup",
        body:
          "Use the link below to confirm your huddle signup and continue in the app.",
        link,
      };
    case "email_change":
      return {
        subject: "Verify your new email address",
        button: "Verify new email",
        heading: "Verify your new email",
        body:
          "Use the link below to confirm your new email address for your huddle account.",
        link,
      };
    case "invite":
      return {
        subject: "You have been invited to huddle",
        button: "Accept invite",
        heading: "Accept your invite",
        body: "Use the link below to accept your invite and continue in huddle.",
        link,
      };
    default:
      return {
        subject: "Your huddle sign-in link",
        button: "Open huddle",
        heading: "Open huddle",
        body: "Use the link below to continue in huddle.",
        link,
      };
  }
};

const htmlFor = (heading: string, body: string, button: string, link: string) => `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f0f1f5;font-family:Arial,Helvetica,sans-serif;color:#414141;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f1f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;">
            <tr>
              <td style="background:#c1ff72;padding:32px 40px;">
                <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;line-height:1.2;">${escapeHtml(heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <p style="margin:0 0 20px;font-size:15px;line-height:1.7;">${escapeHtml(body)}</p>
                <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  <tr>
                    <td style="background:#2145cf;border-radius:8px;">
                      <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(button)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#666666;">
                  Or paste this link into your browser:<br>
                  <a href="${escapeHtml(link)}" style="color:#2145cf;word-break:break-all;text-decoration:none;">${escapeHtml(link)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const emailJobsFromPayload = (payload: HookPayload): EmailJob[] => {
  const action = String(payload.email_data?.email_action_type || "").trim().toLowerCase();
  const currentEmail = String(payload.user?.email || "").trim();
  const newEmail = String(payload.user?.new_email || "").trim();
  const tokenHash = String(payload.email_data?.token_hash || "").trim();
  const tokenHashNew = String(payload.email_data?.token_hash_new || "").trim();

  if (action === "email_change") {
    const jobs: EmailJob[] = [];

    // Supabase docs: token_hash_new is for the current email, token_hash is for the new email.
    if (currentEmail && tokenHashNew) jobs.push({ email: currentEmail, action, tokenHash: tokenHashNew });
    if (newEmail && tokenHash) jobs.push({ email: newEmail, action, tokenHash });

    if (jobs.length > 0) return jobs;

    const singleTarget = newEmail || currentEmail;
    const singleHash = tokenHash || tokenHashNew;
    return singleTarget && singleHash ? [{ email: singleTarget, action, tokenHash: singleHash }] : [];
  }

  const email = currentEmail || newEmail;
  return email && tokenHash ? [{ email, action, tokenHash }] : [];
};

const sendBrevoEmail = async (job: EmailJob) => {
  const content = contentFor(job.action, job.tokenHash);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: job.email }],
      subject: content.subject,
      htmlContent: htmlFor(content.heading, content.body, content.button, content.link),
      textContent: `${content.body}\n\n${content.link}`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[auth-send-email-hook] brevo send failed", res.status, err, { action: job.action, email: job.email });
    return { ok: false as const, status: res.status, details: err };
  }

  console.log("[auth-send-email-hook] sent", { action: job.action, email: job.email });
  return { ok: true as const };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!BREVO_API_KEY) return json(500, { error: "brevo_api_key_missing" });
  if (!HOOK_SECRET) return json(500, { error: "hook_secret_missing" });

  let raw = "";
  try {
    raw = await req.text();
    await verifyHookSignature(raw, req.headers);
    const payload = JSON.parse(raw) as HookPayload;

    const jobs = emailJobsFromPayload(payload);
    if (jobs.length === 0) {
      const action = String(payload.email_data?.email_action_type || "").trim().toLowerCase();
      console.error("[auth-send-email-hook] missing email or token hash", {
        action,
        email_present: Boolean(payload.user?.email || payload.user?.new_email),
      });
      return json(400, { error: "missing_email_or_token_hash" });
    }

    for (const job of jobs) {
      const result = await sendBrevoEmail(job);
      if (!result.ok) {
        return json(502, { error: "brevo_send_failed", status: result.status, details: result.details });
      }
    }
    return json(200, {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auth-send-email-hook] unexpected error", message);
    return json(401, { error: message });
  }
});
