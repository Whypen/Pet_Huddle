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

const stableIndex = (value: string, length: number) => {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return length ? hash % length : 0;
};

const triage = (value: string, kind = "message", sender = "", eventId = "") => {
  const text = value.toLowerCase();
  const isComment = kind === "comment" || kind === "reply";
  const cleanSender = sender.trim().replace(/^@/, "");
  const generic = ["", "community member", "instagram user", "facebook user", "threads user", "messenger user"].includes(cleanSender.toLowerCase());
  const address = generic ? "" : isComment && /^[a-z0-9._]+$/i.test(cleanSender) ? `@${cleanSender} ` : isComment ? `${cleanSender}, ` : `Hey ${cleanSender.split(/\s+/)[0]} — `;
  const choose = (variants: string[]) => `${address}${variants[stableIndex(`${eventId}|${sender}|${value}`, variants.length)]}`;
  if (["vet", "bleeding", "poison", "emergency", "injured"].some((term) => text.includes(term))) return { classification: "animal safety", risk: "sensitive", reply_status: "needs_approval", agent_draft: isComment ? choose(["this sounds urgent — please contact a local vet or emergency veterinary service now. We can’t assess an emergency from a comment."]) : `${address || "Hey — "}I’m sorry, this sounds urgent. Please contact a local vet or emergency veterinary service now. We can’t diagnose or assess an emergency from a message.` };
  if (["animal torture", "torture", "animal murder", "murder videos", "animal abuse", "kill animals", "killing animals"].some((term) => text.includes(term))) return { classification: "animal harm", risk: "sensitive", reply_status: "needs_approval", agent_draft: isComment ? choose(["yeah, this is horrifying. We’re not repeating the graphic details, but animal harm should never be treated like normal content.", "this is genuinely awful. We won’t amplify the graphic details, but treating animal harm as normal content is never okay."]) : `${address || "Hey — "}I’m sorry you had to see this. Please don’t send or repost graphic material. Share the public link only and we’ll review what can be reported safely.` };
  if (["legal", "privacy", "refund", "payment", "charged", "harass", "abuse", "scam"].some((term) => text.includes(term))) return { classification: "sensitive support", risk: "sensitive", reply_status: "needs_approval", agent_draft: isComment ? choose(["we’re taking this seriously. Please DM us the details so nothing private ends up in public.", "this deserves a careful look. Send us the details privately so nothing sensitive sits in the comments."]) : `${address || "Hey — "}I’m sorry you’re dealing with this. Share only what we need to review it — never send passwords, one-time codes, full card details, or ID.` };
  if (["where are you based", "where are you from", "which country"].some((term) => text.includes(term))) return { classification: "location question", risk: "routine", reply_status: "ready", agent_draft: "huddle is operating across the UK and Asia first. Is there something you’d like help with where you are?" };
  if (["missing", "lost", "last seen"].some((term) => text.includes(term))) return { classification: "community support", risk: "review", reply_status: "ready", agent_draft: isComment ? choose(["really hope they’re home soon. Keeping contact details in DMs is the move.", "hoping they’re back safe soon 🤞 keep the private details out of the comments and in DMs."]) : `${address || "Hey — "}I hope they’re home soon. Send the private details by DM rather than posting contact information publicly.` };
  return { classification: "general message", risk: "routine", reply_status: "ready", agent_draft: isComment ? choose(text.includes("?") ? ["wait, what happened? 👀", "okay we need the rest of this story 👀", "hold on — tell us more 😭"] : ["honestly 😭 they notice way more than we give them credit for.", "yeah 😭 the animal has already read the room.", "not them understanding the assignment before us."]) : `${address || "Hey — "}tell us a bit more and we’ll point you in the right direction.` };
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
        const valueMessage = whatsappMessages[0] || {};
        const whatsappMessage = provider === "whatsapp" ? valueMessage : {};
        const whatsappContact = whatsappContacts[0]?.profile && typeof whatsappContacts[0].profile === "object" ? whatsappContacts[0].profile as Record<string, unknown> : {};
        const facebookText = message.text || (message.message && typeof message.message === "object" ? (message.message as Record<string, unknown>).text : "");
        const valueText = valueMessage.text && typeof valueMessage.text === "object" ? (valueMessage.text as Record<string, unknown>).body : valueMessage.text;
        const text = String(valueText || facebookText || value.message || "");
        const objectName = String(payload.object || "").toLowerCase();
        const platform = provider === "whatsapp" ? "whatsapp" : objectName.includes("instagram") ? "instagram" : (Object.keys(message).length || objectName.includes("page") ? "facebook" : "");
        const externalEventId = String(event.id || message.id || value.id || `${entry.id || "entry"}:${JSON.stringify(event).slice(0, 240)}`);
        const eventType = String(event.field || event.type || (event.value && typeof event.value === "object" ? (event.value as Record<string, unknown>).messaging_product : "meta_event"));
        const hasWhatsAppMessage = provider === "whatsapp" && whatsappMessages.length > 0;
        // Delivery/read/status callbacks are operational events, not conversations.
        if (provider === "whatsapp" && (!hasWhatsAppMessage || !text.trim())) continue;
        const kind = platform === "whatsapp" ? "message" : (message.comment_id || eventType.toLowerCase().includes("comment") ? "comment" : "message");
        const compact = {
          object: payload.object,
          entry_id: entry.id,
          field: eventType,
          event_id: externalEventId,
          received_at: new Date().toISOString(),
          platform: platform || null,
          external_message_id: valueMessage.id || message.mid || message.id || null,
          sender_id: valueMessage.from || (valueMessage.sender && typeof valueMessage.sender === "object" ? (valueMessage.sender as Record<string, unknown>).id : null) || (event.sender && typeof event.sender === "object" ? (event.sender as Record<string, unknown>).id : null) || null,
          from: whatsappMessage.from || null,
          contact_label: whatsappContact.name || null,
          text: text || null,
          kind,
          source_type: kind === "comment" ? "comment" : "inbox",
          inbox_label: kind === "comment" ? null : platform === "instagram" ? "Instagram inbox" : platform === "facebook" ? "Facebook Messenger" : "WhatsApp inbox",
          timestamp: whatsappMessage.timestamp || null,
          value: event.value || event.message || null,
          ...triage(text, kind, String(whatsappContact.name || ""), externalEventId),
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
