const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;
const SPACE_PATTERN = /\s+/g;

const normalizeSocialId = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^@+/, "");
};

const cleanContent = (value: string | null | undefined) =>
  String(value || "")
    .replace(URL_PATTERN, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(SPACE_PATTERN, " ")
    .trim();

const truncateSoft = (value: string, minChars = 120, maxChars = 160) => {
  if (value.length <= maxChars) return value;
  const candidate = value.slice(0, maxChars + 1);
  const boundary = candidate.lastIndexOf(" ");
  const cut = boundary >= minChars ? boundary : maxChars;
  return `${candidate.slice(0, cut).trim()}...`;
};

export const buildSharePreviewTitle = (displayName?: string | null, socialId?: string | null) => {
  const name = String(displayName || "").trim();
  const social = normalizeSocialId(socialId);
  if (name && social) return `${name} (@${social}) on huddle`;
  if (name) return `${name} on huddle`;
  if (social) return `@${social} on huddle`;
  return "Post on huddle";
};

export const buildSharePreviewDescription = (content?: string | null) => {
  const cleaned = cleanContent(content);
  if (!cleaned) return "See this post on huddle.";
  return truncateSoft(cleaned);
};

