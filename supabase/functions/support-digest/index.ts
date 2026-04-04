import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

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

const BREVO_API_KEY = String(Deno.env.get("BREVO_API_KEY") || "").trim();
const FROM_EMAIL    = String(Deno.env.get("BREVO_FROM_EMAIL") || "support@huddle.pet").trim();
const FROM_NAME     = "huddle";
const SUPPORT_EMAIL = "support@huddle.pet";

type Ticket = {
  ticket_number: string;
  created_at:    string;
  name:          string;
  email:         string;
  subject:       string;
  message:       string;
  wants_reply:   boolean;
};

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function digestHtml(tickets: Ticket[]): string {
  const rows = tickets.map((t) => {
    const safeMsg = truncate(t.message, 200)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `
      <tr>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;white-space:nowrap;">${t.ticket_number}</td>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;white-space:nowrap;">${t.created_at}</td>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;">${t.name}</td>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;">${t.email}</td>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;">${t.subject}</td>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;max-width:260px;white-space:pre-wrap;">${safeMsg}</td>
        <td style="padding:8px 10px;border:1px solid #e8e8e8;text-align:center;">${t.wants_reply ? "Yes" : "No"}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="800" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#C8FF00;padding:18px 32px;">
          <span style="font-size:20px;font-weight:700;color:#1a1a1a;">huddle — daily support digest</span>
        </td></tr>
        <tr><td style="padding:32px;overflow-x:auto;">
          <p style="margin:0 0 20px;font-size:15px;color:#545454;">
            ${tickets.length} new support request${tickets.length === 1 ? "" : "s"} in the last 24 hours.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#414141;border-collapse:collapse;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Ticket</th>
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Date</th>
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Name</th>
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Email</th>
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Subject</th>
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Message (200 chars)</th>
                <th style="padding:8px 10px;border:1px solid #e8e8e8;text-align:left;">Reply?</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;color:#aaaaaa;">&copy; huddle internal &middot; support digest</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!supabaseUrl || !serviceRole) return json(500, { error: "server_misconfigured" });

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  // Query tickets from the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: tickets, error } = await adminClient
    .from("support_tickets")
    .select("ticket_number, created_at, name, email, subject, message, wants_reply")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[support-digest] query failed", error.message);
    return json(500, { error: "query_failed" });
  }

  const count = (tickets ?? []).length;
  if (count === 0) {
    return json(200, { ok: true, sent: false, reason: "no_tickets" });
  }

  if (!BREVO_API_KEY) {
    console.warn("[support-digest] BREVO_API_KEY not set — digest skipped");
    return json(200, { ok: true, sent: false, reason: "brevo_not_configured" });
  }

  const textRows = (tickets as Ticket[]).map((t) =>
    `${t.ticket_number} | ${t.created_at} | ${t.name} | ${t.email} | ${t.subject} | ${truncate(t.message, 200)} | wants_reply: ${t.wants_reply ? "Yes" : "No"}`
  ).join("\n");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: SUPPORT_EMAIL }],
      subject:     `[huddle] Daily Support Digest: ${count} new request${count === 1 ? "" : "s"}`,
      htmlContent: digestHtml(tickets as Ticket[]),
      textContent: `Daily Support Digest — ${count} new request${count === 1 ? "" : "s"}\n\n${textRows}`,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[support-digest] brevo error", res.status, err);
    return json(500, { error: "email_send_failed" });
  }

  return json(200, { ok: true, sent: true, count });
});
