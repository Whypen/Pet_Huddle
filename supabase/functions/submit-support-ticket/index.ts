import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import { getExpectedTurnstileHostnames, validateTurnstile } from "../_shared/turnstile.ts";

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

const isJwt = (value: string): boolean => value.split(".").length === 3;

const BREVO_API_KEY  = String(Deno.env.get("BREVO_API_KEY") || "").trim();
const FROM_EMAIL     = String(Deno.env.get("BREVO_SUPPORT_FROM_EMAIL") || "noreply@huddle.pet").trim();
const FROM_NAME      = String(Deno.env.get("BREVO_SUPPORT_FROM_NAME") || "Team Huddle").trim();
const SUPPORT_REPLY_TEMPLATE_ID = Number(String(Deno.env.get("BREVO_SUPPORT_REPLY_TEMPLATE_ID") || "").trim());
const SUPPORT_EMAIL  = "support@huddle.pet";
const BRAND_BLUE = "#2145CF";
const HEADER_BG = "#F6F8FF";

type BrevoSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; status: number | null; error: string };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

async function sendBrevoEmail(payload: Record<string, unknown>): Promise<BrevoSendResult> {
  if (!BREVO_API_KEY) {
    return { ok: false, status: null, error: "BREVO_API_KEY missing" };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responseText = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[submit-support-ticket] brevo error", res.status, responseText);
    return { ok: false, status: res.status, error: responseText || `brevo_http_${res.status}` };
  }
  try {
    const payload = JSON.parse(responseText) as { messageId?: unknown };
    return { ok: true, messageId: typeof payload.messageId === "string" ? payload.messageId : null };
  } catch {
    return { ok: true, messageId: null };
  }
}

const shouldSendUserConfirmation = (email: string, wantsReply: boolean) =>
  wantsReply &&
  Boolean(email) &&
  !/^no-?reply@huddle\.pet$/i.test(email);

const emailHead = `<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light only; supported-color-schemes: light; }
  </style>
</head>`;

function templateFailureHtml(
  ticketNumber: string,
  recipientEmail: string,
  templateId: number,
  error: string,
): string {
  return `<!DOCTYPE html>
<html>${emailHead}
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td bgcolor="${HEADER_BG}" style="background-color:${HEADER_BG} !important;padding:18px 32px;border-bottom:3px solid ${BRAND_BLUE};">
          <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.25;font-weight:800;color:${BRAND_BLUE} !important;mso-style-textfill-fill-color:${BRAND_BLUE};">huddle support email failed</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#414141;font-size:14px;line-height:1.6;">
          <p style="margin:0 0 12px;">The user confirmation template did not send after the support ticket was saved.</p>
          <p style="margin:0 0 8px;"><strong>Ticket:</strong> ${escapeHtml(ticketNumber)}</p>
          <p style="margin:0 0 8px;"><strong>Recipient:</strong> ${escapeHtml(recipientEmail)}</p>
          <p style="margin:0 0 8px;"><strong>Template ID:</strong> ${Number.isFinite(templateId) ? templateId : "missing"}</p>
          <p style="margin:0;"><strong>Error:</strong> ${escapeHtml(error)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function adminHtml(
  ticketNumber: string,
  createdAt: string,
  name: string,
  email: string,
  subject: string,
  message: string,
  wantsReply: boolean,
): string {
  const safeMsg = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>${emailHead}
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td bgcolor="${HEADER_BG}" style="background-color:${HEADER_BG} !important;padding:18px 32px;border-bottom:3px solid ${BRAND_BLUE};">
          <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.25;font-weight:800;color:${BRAND_BLUE} !important;mso-style-textfill-fill-color:${BRAND_BLUE};">huddle — new support request</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;color:#414141;border-collapse:collapse;">
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;width:130px;padding:8px 12px;border:1px solid #e8e8e8;">Ticket</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${escapeHtml(ticketNumber)}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Date</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${escapeHtml(createdAt)}</td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Name</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Email</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${escapeHtml(email)}</td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Subject</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${escapeHtml(subject)}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Wants reply</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${wantsReply ? "Yes" : "No"}</td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;vertical-align:top;padding:8px 12px;border:1px solid #e8e8e8;">Message</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;white-space:pre-wrap;">${safeMsg}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaaaaa;">&copy; huddle internal &middot; support-digest@huddle.pet</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl  = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRole  = String((Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) || "").trim();
  if (!supabaseUrl || !serviceRole) return json(500, { error: "server_misconfigured" });

  let body: {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    wants_reply?: boolean;
    turnstile_token?: string;
    access_token?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const name       = String(body.name    || "").trim();
  const email      = String(body.email   || "").trim();
  const subject    = String(body.subject || "").trim();
  const message    = String(body.message || "").trim();
  const wantsReply = Boolean(body.wants_reply ?? false);

  if (!name)    return json(400, { error: "name_required" });
  if (!email)   return json(400, { error: "email_required" });
  if (!subject) return json(400, { error: "subject_required" });
  if (!message) return json(400, { error: "message_required" });

  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const bodyToken = String(body.access_token || "").replace(/^Bearer\s+/i, "").trim();
  const huddleToken = String(req.headers.get("x-huddle-access-token") || "").replace(/^Bearer\s+/i, "").trim();
  const bearerToken = String(req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const candidateToken = [huddleToken, bodyToken, bearerToken].find(
    (token) => isJwt(token) && token !== anonKey && token !== serviceRole,
  ) || "";
  let isAuthenticatedUser = false;

  if (candidateToken) {
    const { data: { user }, error: authError } = await adminClient.auth.getUser(candidateToken);
    isAuthenticatedUser = Boolean(user) && !authError;
  }

  if (!isAuthenticatedUser) {
    const turnstile = await validateTurnstile(
      body.turnstile_token ?? null,
      clientIp(req),
      "support_ticket",
      getExpectedTurnstileHostnames(),
    );
    if (!turnstile.valid) {
      return json(403, { error: "human_verification_failed", turnstile_reason: turnstile.reason });
    }
  }

  // Insert using service role (bypasses RLS, gets ticket_number back)
  const { data: ticket, error: insertError } = await adminClient
    .from("support_tickets")
    .insert({
      // ticket_number is set by the trigger; pass empty string and the trigger fills it
      ticket_number: "",
      name,
      email,
      subject,
      message,
      wants_reply: wantsReply,
    })
    .select("ticket_number, created_at")
    .single();

  if (insertError || !ticket) {
    console.error("[submit-support-ticket] insert failed", insertError?.message);
    return json(500, { error: "insert_failed" });
  }

  const ticketNumber = ticket.ticket_number as string;
  const createdAt    = ticket.created_at as string;

  // ── Emails (fail-open: DB insert already succeeded) ─────────────────────────
  if (BREVO_API_KEY) {
    const userConfirmationPromise = (async () => {
      if (!shouldSendUserConfirmation(email, wantsReply)) return;

      if (!Number.isInteger(SUPPORT_REPLY_TEMPLATE_ID) || SUPPORT_REPLY_TEMPLATE_ID <= 0) {
        const error = "BREVO_SUPPORT_REPLY_TEMPLATE_ID missing or invalid";
        console.error("[submit-support-ticket] support reply template missing", { ticketNumber, email });
        await sendBrevoEmail({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: SUPPORT_EMAIL }],
          subject: `[${ticketNumber}] Support reply template failed`,
          htmlContent: templateFailureHtml(ticketNumber, email, SUPPORT_REPLY_TEMPLATE_ID, error),
          textContent: `Support reply template failed\nTicket: ${ticketNumber}\nRecipient: ${email}\nTemplate ID: missing\nError: ${error}`,
        });
        return;
      }

      const result = await sendBrevoEmail({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email, name }],
        replyTo: { email: SUPPORT_EMAIL, name: "huddle support" },
        templateId: SUPPORT_REPLY_TEMPLATE_ID,
        params: {
          name,
          display_name: name,
          email,
          subject,
          ticket_number: ticketNumber,
        },
      });

      if (!result.ok) {
        await sendBrevoEmail({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: SUPPORT_EMAIL }],
          subject: `[${ticketNumber}] Support reply template failed`,
          htmlContent: templateFailureHtml(ticketNumber, email, SUPPORT_REPLY_TEMPLATE_ID, result.error),
          textContent: `Support reply template failed\nTicket: ${ticketNumber}\nRecipient: ${email}\nTemplate ID: ${SUPPORT_REPLY_TEMPLATE_ID}\nError: ${result.error}`,
        });
      }
    })().catch((err) => console.warn("[submit-support-ticket] confirmation email failed silently", err));

    const adminNotificationPromise = sendBrevoEmail({
      sender:  { name: FROM_NAME, email: FROM_EMAIL },
      to:      [{ email: SUPPORT_EMAIL }],
      replyTo: { email, name },
      subject: `[${ticketNumber}] New Support Request: ${subject}`,
      htmlContent: adminHtml(ticketNumber, createdAt, name, email, subject, message, wantsReply),
      textContent: `Ticket: ${ticketNumber}\nDate: ${createdAt}\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nWants reply: ${wantsReply ? "Yes" : "No"}\n\nMessage:\n${message}`,
    }).then((result) => {
      if (!result.ok) {
        console.warn("[submit-support-ticket] admin notification failed", result);
      }
    }).catch((err) => console.warn("[submit-support-ticket] admin notification failed silently", err));

    await Promise.allSettled([userConfirmationPromise, adminNotificationPromise]);
  } else {
    console.warn("[submit-support-ticket] BREVO_API_KEY not set — emails skipped");
  }

  return json(200, { ok: true, ticket_number: ticketNumber });
});
