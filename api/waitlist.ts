// Waitlist signup → Brevo.
// POST /api/waitlist  body: { email }  (JSON or form-urlencoded)
// - Adds/updates the contact in the Brevo list (BREVO_DEFAULT_LIST_ID).
// - Sends a branded "you're in" confirmation email (best-effort).
// Secrets are read from environment variables (set these in the Vercel
// project: BREVO_API_KEY, BREVO_DEFAULT_LIST_ID). Nothing is hardcoded.

type MaybeString = string | string[] | undefined;

type RequestShape = {
  method?: string;
  headers?: Record<string, MaybeString>;
  body?: unknown;
};

type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => {
    json: (body: unknown) => void;
    send: (body: string) => void;
    end: () => void;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENDER = { name: "huddle", email: "support@huddle.pet" };

// Simple per-instance rate limit (best-effort; not a security boundary).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const RATE_BUCKETS = new Map<string, { count: number; windowStart: number }>();

function first(value: MaybeString): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function getClientIp(headers?: Record<string, MaybeString>): string {
  const fwd = first(headers?.["x-forwarded-for"]);
  if (fwd) return fwd.split(",")[0].trim();
  return first(headers?.["x-real-ip"]).trim() || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    RATE_BUCKETS.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

function parseBody(req: RequestShape): Record<string, unknown> {
  let body = req.body;
  if (typeof body === "string") {
    const trimmed = body.trim();
    try {
      body = JSON.parse(trimmed);
    } catch {
      // form-urlencoded fallback
      const params = new URLSearchParams(trimmed);
      const obj: Record<string, string> = {};
      params.forEach((v, k) => (obj[k] = v));
      body = obj;
    }
  }
  return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
}

function confirmationHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0E0E10;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="background:#142E99;border-radius:24px;padding:36px 32px;color:#ffffff;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#BFFF00;">huddle</div>
      <h1 style="font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;margin:18px 0 0;">You're in the circle.</h1>
    </div>
    <div style="padding:28px 8px 8px;font-size:16px;line-height:1.6;color:#424965;">
      <p style="margin:0 0 16px;">Thanks for joining the huddle waitlist. You're now one of the first who'll hear the moment huddle opens near you.</p>
      <p style="margin:0 0 16px;">Until then — keep an eye out. When something needs doing for a pet nearby, you'll finally have somewhere to act.</p>
      <p style="margin:24px 0 0;font-weight:700;color:#0E0E10;">— the huddle team</p>
    </div>
    <div style="padding:24px 8px 0;font-size:12px;color:#9a9a9a;">
      You received this because you joined the waitlist at huddle.pet. A circle for every pet.
    </div>
  </div>
</body></html>`;
}

async function brevoFetch(path: string, apiKey: string, payload: unknown) {
  return fetch(`https://api.brevo.com${path}`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export default async function handler(req: RequestShape, res: ResponseShape) {
  const wantsJson = first(req.headers?.accept).includes("application/json");

  function respond(code: number, ok: boolean, message: string) {
    if (wantsJson) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(code).json({ ok, error: ok ? undefined : message });
      return;
    }
    // No-JS form post → redirect back to the page.
    res.setHeader("Location", ok ? "/waitlist?joined=1" : "/waitlist?error=1");
    res.status(303).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    respond(405, false, "Method not allowed.");
    return;
  }

  const ip = getClientIp(req.headers);
  if (rateLimited(ip)) {
    respond(429, false, "Too many requests. Please try again shortly.");
    return;
  }

  const body = parseBody(req);

  // Honeypot — bots fill this hidden field. Pretend success, do nothing.
  if (String(body["email_address_check"] || "").trim() !== "") {
    respond(200, true, "");
    return;
  }

  const email = String(body["email"] || body["EMAIL"] || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    respond(400, false, "Please enter a valid email address.");
    return;
  }

  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  const listId = Number(String(process.env.BREVO_DEFAULT_LIST_ID || "").trim());
  if (!apiKey || !Number.isFinite(listId) || listId <= 0) {
    console.error("waitlist: missing BREVO_API_KEY or BREVO_DEFAULT_LIST_ID env");
    respond(500, false, "Waitlist is temporarily unavailable. Please try again later.");
    return;
  }

  // 1) Add / update the contact in the waitlist list.
  try {
    const r = await brevoFetch("/v3/contacts", apiKey, {
      email,
      listIds: [listId],
      updateEnabled: true,
    });
    // 201 created, 204 updated. A 400 "already exists" is fine (idempotent).
    if (!r.ok && r.status !== 204) {
      const txt = await r.text().catch(() => "");
      const benign = r.status === 400 && /already|exist|duplicate/i.test(txt);
      if (!benign) {
        console.error("waitlist: brevo contact error", r.status, txt.slice(0, 300));
        respond(502, false, "Couldn't add you right now. Please try again in a moment.");
        return;
      }
    }
  } catch (err) {
    console.error("waitlist: brevo contact network error", err);
    respond(502, false, "Network error. Please try again.");
    return;
  }

  // 2) Send the confirmation email — best-effort, never blocks signup.
  try {
    await brevoFetch("/v3/smtp/email", apiKey, {
      sender: SENDER,
      to: [{ email }],
      subject: "You're in the circle.",
      htmlContent: confirmationHtml(),
      tags: ["waitlist-confirmation"],
    });
  } catch (err) {
    console.error("waitlist: confirmation email failed (non-fatal)", err);
  }

  respond(200, true, "");
}
