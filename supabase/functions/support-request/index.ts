// support-request — moderation report notification sidecar
// Called by ReportModal and ChatDialogue AFTER process_user_report() has already
// written the moderation event to user_reports. This function:
//   1. Persists a copy to support_requests (existing table, moderation domain)
//   2. Sends a best-effort admin notification email via Brevo (same provider as rest of repo)
//
// This is NOT the help desk system. Help desk tickets go through submit-support-ticket
// → support_tickets. Two tables intentionally serve different domains.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl    = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const brevoApiKey    = String(Deno.env.get("BREVO_API_KEY") || "").trim();
  const supportEmail   = "support@huddle.pet";

  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "server_misconfigured" });

  let body: { userId?: string; subject?: string; message?: string; email?: string; source?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const userId  = String(body.userId  || "").trim();
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  const email   = String(body.email   || "").trim();
  const source  = String(body.source  || "").trim();

  if (!userId || !message) return json(400, { error: "missing_required_fields" });

  // ── Persist to support_requests (moderation domain) ────────────────────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error: insertError } = await adminClient.from("support_requests").insert({
    user_id: userId,
    subject: subject || null,
    message,
    email:   email   || null,
  });

  if (insertError) {
    console.error("[support-request] insert failed", insertError.message);
    // Do not block — email notification is still useful even if insert failed
  }

  // ── Best-effort admin notification via Brevo ────────────────────────────────
  if (brevoApiKey) {
    const emailSubject = source
      ? `REPORT (${source}) — ${subject || "Huddle Report"}`
      : subject || "Huddle Report";

    void fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key":      brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender:      { name: "huddle", email: supportEmail },
        to:          [{ email: supportEmail }],
        replyTo:     email ? { email } : undefined,
        subject:     emailSubject,
        textContent: `User ID: ${userId}\nEmail: ${email || "N/A"}\nSource: ${source || "N/A"}\n\n${message}`,
      }),
    }).catch((err) => console.warn("[support-request] brevo send failed silently", err));
  } else {
    console.warn("[support-request] BREVO_API_KEY not set — notification skipped");
  }

  return json(200, { ok: true });
});
