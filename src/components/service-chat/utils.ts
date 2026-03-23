export type ParsedServiceMessage = {
  kind?: string;
  [key: string]: unknown;
};

export const parseServiceMessage = (content: string): ParsedServiceMessage | null => {
  try {
    const parsed = JSON.parse(content) as ParsedServiceMessage;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

