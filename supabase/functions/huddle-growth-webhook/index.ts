import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceClient, GRAPH_BASE, json, safeError } from "../_shared/huddleGrowth.ts";

const supabase = getServiceClient();
const verifyToken = String(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "").trim();
const appSecret = String(Deno.env.get("META_APP_SECRET") || "").trim();

const hex = (bytes: Uint8Array) => Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
};

const validSignature = async (raw: string, provided: string) => {
  if (!appSecret || !provided.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return timingSafeEqual(`sha256=${hex(new Uint8Array(digest))}`, provided);
};

const triage = (value: string) => {
  const text = value.toLowerCase();
  if (["vet", "bleeding", "poison", "emergency", "injured", "legal", "privacy", "refund", "harass", "abuse", "torture", "murder", "kill"].some((term) => text.includes(term))) return { classification: "sensitive support", risk: "sensitive", reply_status: "needs_approval", agent_draft: "Thanks for telling us. We’re taking this seriously and have passed it to the right person at huddle to review. If an animal is in immediate danger, please contact a local vet or emergency service now." };
  if (["where are you based", "where are you from", "which country"].some((term) => text.includes(term))) return { classification: "location question", risk: "routine", reply_status: "ready", agent_draft: "huddle is operating across the UK and Asia first. Is there something you’d like help with where you are?" };
  if (["missing", "lost", "last seen"].some((term) => text.includes(term))) return { classification: "community support", risk: "review", reply_status: "ready", agent_draft: "Thanks for sharing this. We really hope they’re home soon. Please keep personal contact details out of public messages and use DMs for anything private." };
  return { classification: "general message", risk: "routine", reply_status: "ready", agent_draft: "Thanks for messaging huddle. We’ve got this — could you share a little more detail so we can give you the right answer?" };
};

serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && verifyToken && token === verifyToken) return new Response(challenge || "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const raw = await req.text();
  try {
    const signature = req.headers.get("x-hub-signature-256") || "";
    if (!(await validSignature(raw, signature))) return json({ error: "invalid_signature" }, 401);
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const provider = String(payload.object || "meta").toLowerCase().includes("whatsapp") ? "whatsapp" : "meta";
    const entries = Array.isArray(payload.entry) ? payload.entry as Array<Record<string, unknown>> : [];
    let accepted = 0;
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes as Array<Record<string, unknown>> : [];
      const messaging = Array.isArray(entry.messaging) ? entry.messaging as Array<Record<string, unknown>> : [];
      const events = changes.length || messaging.length ? [...changes, ...messaging] : [entry];
      for (const event of events) {
        const message = event.message && typeof event.message === "object" ? event.message as Record<string, unknown> : {};
        const value = event.value && typeof event.value === "object" ? event.value as Record<string, unknown> : {};
        const whatsappMessages = Array.isArray(value.messages) ? value.messages as Array<Record<string, unknown>> : [];
        const whatsappContacts = Array.isArray(value.contacts) ? value.contacts as Array<Record<string, unknown>> : [];
        const whatsappMessage = whatsappMessages[0] || {};
        const whatsappContact = whatsappContacts[0]?.profile && typeof whatsappContacts[0].profile === "object" ? whatsappContacts[0].profile as Record<string, unknown> : {};
        const facebookText = message.text || (message.message && typeof message.message === "object" ? (message.message as Record<string, unknown>).text : "");
        const text = String(whatsappMessage.text && typeof whatsappMessage.text === "object" ? (whatsappMessage.text as Record<string, unknown>).body || "" : facebookText || "");
        const platform = provider === "whatsapp" ? "whatsapp" : (Object.keys(message).length ? "facebook" : "");
        const externalEventId = String(event.id || message.id || value.id || `${entry.id || "entry"}:${JSON.stringify(event).slice(0, 240)}`);
        const eventType = String(event.field || event.type || (event.value && typeof event.value === "object" ? (event.value as Record<string, unknown>).messaging_product : "meta_event"));
        const compact = {
          object: payload.object,
          entry_id: entry.id,
          field: eventType,
          event_id: externalEventId,
          received_at: new Date().toISOString(),
          platform: platform || null,
          external_message_id: whatsappMessage.id || message.mid || message.id || null,
          sender_id: whatsappMessage.from || (event.sender && typeof event.sender === "object" ? (event.sender as Record<string, unknown>).id : null) || null,
          from: whatsappMessage.from || null,
          contact_label: whatsappContact.name || null,
          text: text || null,
          timestamp: whatsappMessage.timestamp || null,
          value: event.value || event.message || null,
          ...triage(text),
        };
        const { error } = await supabase.from("huddle_growth_webhook_events").insert({ provider, external_event_id: externalEventId, event_type: eventType, payload: compact });
        if (!error || error.code === "23505") accepted += 1;
      }
    }
    return json({ ok: true, accepted, graph_base: GRAPH_BASE });
  } catch (error) {
    console.error("[huddle-growth-webhook]", safeError(error));
    return json({ error: "webhook_processing_failed" }, 500);
  }
});
