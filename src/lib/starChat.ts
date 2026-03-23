export type StarIntroPayload = {
  kind: "star_intro";
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: string;
};

export type ParsedStarChatContent = {
  text: string;
  kind: string | null;
  senderId: string | null;
  recipientId: string | null;
  createdAt: string | null;
};

export const buildStarIntroPayload = (senderId: string, recipientId: string): string =>
  JSON.stringify({
    kind: "star_intro",
    sender_id: senderId,
    recipient_id: recipientId,
    text: "Star connection started.",
    created_at: new Date().toISOString(),
  } satisfies StarIntroPayload);

export const parseStarChatContent = (rawContent: string | null | undefined): ParsedStarChatContent => {
  const fallback = {
    text: String(rawContent || "").trim(),
    kind: null,
    senderId: null,
    recipientId: null,
    createdAt: null,
  };
  if (!fallback.text) return fallback;
  try {
    const parsed = JSON.parse(fallback.text) as Partial<StarIntroPayload> & { text?: unknown };
    const kind = typeof parsed.kind === "string" ? parsed.kind : null;
    const text = typeof parsed.text === "string" ? parsed.text : "";
    return {
      text: text || fallback.text,
      kind,
      senderId: typeof parsed.sender_id === "string" ? parsed.sender_id : null,
      recipientId: typeof parsed.recipient_id === "string" ? parsed.recipient_id : null,
      createdAt: typeof parsed.created_at === "string" ? parsed.created_at : null,
    };
  } catch {
    return fallback;
  }
};

export const isStarIntroKind = (kind: string | null | undefined) => String(kind || "").trim() === "star_intro";
