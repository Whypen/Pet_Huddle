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

const BREVO_API_KEY  = String(Deno.env.get("BREVO_API_KEY") || "").trim();
const FROM_EMAIL     = String(Deno.env.get("BREVO_FROM_EMAIL") || "support@huddle.pet").trim();
const FROM_NAME      = "huddle";
const SUPPORT_EMAIL  = "support@huddle.pet";

async function sendBrevoEmail(payload: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[submit-support-ticket] brevo error", res.status, err);
  }
  return res.ok;
}

function confirmationHtml(displayName: string, ticketNumber: string, subject: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#C8FF00;padding:18px 32px;">
          <span style="font-size:20px;font-weight:700;color:#1a1a1a;">huddle</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#414141;font-family:Georgia,serif;">
            Hi ${displayName},
          </h2>
          <p style="margin:0 0 8px;font-size:15px;color:#545454;line-height:1.7;">
            We've received your message and will get back to you as soon as possible.
          </p>
          <p style="margin:0 0 8px;font-size:15px;color:#545454;line-height:1.7;">
            Your ticket number is <strong>${ticketNumber}</strong> — keep this for reference.
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#545454;line-height:1.7;">
            Subject: ${subject}
          </p>
          <p style="margin:28px 0 0;font-size:13px;color:#888888;line-height:1.5;">
            If you didn't submit this request, you can safely ignore this email.
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
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#C8FF00;padding:18px 32px;">
          <span style="font-size:20px;font-weight:700;color:#1a1a1a;">huddle — new support request</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;color:#414141;border-collapse:collapse;">
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;width:130px;padding:8px 12px;border:1px solid #e8e8e8;">Ticket</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${ticketNumber}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Date</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${createdAt}</td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Name</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${name}</td>
            </tr>
            <tr>
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Email</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${email}</td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="font-weight:700;padding:8px 12px;border:1px solid #e8e8e8;">Subject</td>
              <td style="padding:8px 12px;border:1px solid #e8e8e8;">${subject}</td>
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
  const serviceRole  = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRole) return json(500, { error: "server_misconfigured" });

  let body: {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    wants_reply?: boolean;
    turnstile_token?: string;
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

  // Turnstile validation — required for anonymous callers, skipped for authenticated users.
  // The support form lives inside the authenticated settings drawer, so authenticated
  // users are verified by their session. Unauthenticated callers must pass Turnstile.
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const incomingToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isAuthenticatedUser =
    incomingToken.split(".").length === 3 &&
    incomingToken !== anonKey &&
    incomingToken !== serviceRole;

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
  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

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
    // User confirmation
    void sendBrevoEmail({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email, name }],
      subject:     `[${ticketNumber}] We've received your message`,
      htmlContent: confirmationHtml(name, ticketNumber, subject),
      textContent: `Hi ${name},\n\nWe've received your message (ticket ${ticketNumber}) and will be in touch soon.\n\nSubject: ${subject}\n\n— huddle`,
    }).catch((err) => console.warn("[submit-support-ticket] confirmation email failed silently", err));

    // Admin notification
    void sendBrevoEmail({
      sender:  { name: FROM_NAME, email: FROM_EMAIL },
      to:      [{ email: SUPPORT_EMAIL }],
      replyTo: { email, name },
      subject: `[${ticketNumber}] New Support Request: ${subject}`,
      htmlContent: adminHtml(ticketNumber, createdAt, name, email, subject, message, wantsReply),
      textContent: `Ticket: ${ticketNumber}\nDate: ${createdAt}\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\nWants reply: ${wantsReply ? "Yes" : "No"}\n\nMessage:\n${message}`,
    }).catch((err) => console.warn("[submit-support-ticket] admin notification failed silently", err));
  } else {
    console.warn("[submit-support-ticket] BREVO_API_KEY not set — emails skipped");
  }

  return json(200, { ok: true, ticket_number: ticketNumber });
});
