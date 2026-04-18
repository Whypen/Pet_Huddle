export type ParsedServiceMessage = {
  kind?: string;
  [key: string]: unknown;
};

export const parseServiceMessage = (content: string): ParsedServiceMessage | null => {
  try {
    let parsed: unknown = JSON.parse(content);
    if (typeof parsed === "string") {
      const nested = String(parsed || "").trim();
      if (nested.startsWith("{") || nested.startsWith("[")) {
        try {
          parsed = JSON.parse(nested);
        } catch {
          parsed = nested;
        }
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ParsedServiceMessage;
  } catch {
    return null;
  }
};
