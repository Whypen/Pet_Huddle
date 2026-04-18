export type ParsedServiceAttachment = {
  url: string;
  mime: string;
  name: string;
};

export type ParsedServiceMessage = {
  text: string;
  attachments: ParsedServiceAttachment[];
  linkPreviewUrl: string | null;
  kind?: string;
  raw: Record<string, unknown> | null;
};

const parseMaybeJson = (value: unknown): unknown => {
  let current = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!trimmed) return "";
    if (
      !trimmed.startsWith("{") &&
      !trimmed.startsWith("[") &&
      !trimmed.startsWith("\"")
    ) {
      return current;
    }
    try {
      current = JSON.parse(trimmed);
    } catch {
      return current;
    }
  }
  return current;
};

const normalizeAttachments = (value: unknown): ParsedServiceAttachment[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string")
    .map((item) => {
      const attachment = item as { url?: unknown; mime?: unknown; name?: unknown };
      return {
        url: String(attachment.url || ""),
        mime: String(attachment.mime || ""),
        name: String(attachment.name || "media"),
      };
    })
    .filter((item) => item.url);
};

export const parseServiceMessage = (content: string): ParsedServiceMessage => {
  const decoded = parseMaybeJson(content);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return {
      text: typeof decoded === "string" ? decoded : String(content || ""),
      attachments: [],
      linkPreviewUrl: null,
      raw: null,
    };
  }

  const raw = decoded as Record<string, unknown>;
  let text = typeof raw.text === "string" ? raw.text : "";
  let attachments = normalizeAttachments(raw.attachments);
  let linkPreviewUrl = typeof raw.linkPreviewUrl === "string" ? raw.linkPreviewUrl : null;

  const decodedText = parseMaybeJson(text);
  if (decodedText && typeof decodedText === "object" && !Array.isArray(decodedText)) {
    const nestedRaw = decodedText as Record<string, unknown>;
    if (!attachments.length) attachments = normalizeAttachments(nestedRaw.attachments);
    if (!linkPreviewUrl && typeof nestedRaw.linkPreviewUrl === "string") {
      linkPreviewUrl = nestedRaw.linkPreviewUrl;
    }
    if (typeof nestedRaw.text === "string") {
      text = nestedRaw.text;
    }
  }

  return {
    text,
    attachments,
    linkPreviewUrl,
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    raw,
  };
};
