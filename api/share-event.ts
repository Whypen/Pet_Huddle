/**
 * /api/share-event — analytics for the public alert page.
 *
 * FIRST-PARTY, NO VENDOR, NO COOKIES, NO PII.
 * Reuses the app's own event RPC (`record_social_feed_event`) rather than
 * introducing an analytics product. A third-party tracker on a public page is a
 * privacy and consent decision, not an implementation detail, and nothing in the
 * spec named one.
 *
 * Nothing identifying is stored: no IP, no user agent, no fingerprint, no
 * session cookie. Just "this alert's thread had a view / open_app / share /
 * copy_link", which is what the funnel question actually needs.
 *
 * Never blocks or breaks the page — every failure path returns 204. The page
 * calls this with `sendBeacon`, which ignores the response entirely.
 */

const ALLOWED_EVENTS = new Set(["view", "open_app", "share", "copy_link"]);

type RequestShape = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { end: () => void };
};

const readBody = async (req: RequestShape): Promise<Record<string, unknown>> => {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  // 204 on every path, including rejections — this endpoint must never surface
  // an error to a visitor reading about a lost pet.
  const done = () => res.status(204).end();
  if (req.method !== "POST") return done();

  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) return done();

  const body = await readBody(req);
  const alertId = String(body.alert_id || "").trim();
  const event = String(body.event || "").trim();
  if (!alertId || !ALLOWED_EVENTS.has(event)) return done();

  try {
    // The alert's linked thread is the event subject the RPC expects.
    const alertResponse = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/broadcast_alerts?select=thread_id&id=eq.${encodeURIComponent(alertId)}&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          accept: "application/json",
        },
      },
    );
    if (!alertResponse.ok) return done();
    const rows = (await alertResponse.json()) as Array<{ thread_id?: string | null }>;
    const threadId = String(rows?.[0]?.thread_id || "").trim();
    if (!threadId) return done();

    await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/record_social_feed_event`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_thread_id: threadId,
        p_event_type: `share_page_${event}`,
        p_metadata: { surface: "public_alert_page" },
      }),
    });
  } catch {
    // Analytics failing is never worth a visible error.
  }

  return done();
}
