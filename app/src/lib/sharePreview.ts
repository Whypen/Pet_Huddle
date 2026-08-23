/**
 * Share preview copy — the SINGLE grammar for how huddle content is described.
 *
 * Used by two surfaces that must never disagree about the same alert:
 *   - external link unfurls (WhatsApp, iMessage, Telegram) via `api/share.ts`
 *   - internal huddle chat share cards via `shareModel.ts`
 *
 * `api/share.ts` is a Vercel function and cannot import across the app
 * boundary, so it carries a mirror of these functions. `sharePreviewParity.test.ts`
 * asserts the two produce byte-identical output across a matrix of inputs —
 * the parity is a test, not a promise. Change one, change both, or the suite
 * fails.
 */

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

export const buildSharePreviewTitle = (
  displayName?: string | null,
  socialId?: string | null,
  snippet?: string | null,
) => {
  const name = String(displayName || "").trim();
  const social = normalizeSocialId(socialId);
  const identity = name && social
    ? `${name} (@${social})`
    : name || (social ? `@${social}` : "");
  if (!identity) return "Post on huddle";
  // Identity alone is what iMessage would show for the ENTIRE preview, so the
  // post's own words join the title when there are any. Identity stays first:
  // it is the trust signal that makes a stranger open the link.
  const words = cleanContent(snippet);
  if (!words) return `${identity} on huddle`;
  return truncateSoft(`${identity}: ${words}`, 48, 72);
};

export const buildSharePreviewDescription = (content?: string | null) => {
  const cleaned = cleanContent(content);
  if (!cleaned) return "See this post on huddle.";
  return truncateSoft(cleaned);
};

/**
 * ALERT TITLES ARE THE WHOLE PREVIEW.
 *
 * iMessage renders the image, the title and the domain — it does NOT render
 * `og:description`. So the title line has to survive alone, and spending it on
 * the poster's identity ("Sam (@sam) on huddle") tells a reader nothing about a
 * missing cat.
 *
 * Shape: `{Type} {pet_type} in {area}: {title}`
 *   Lost cat in Kowloon City, Hong Kong: Ginger tabby, answers to Mochi
 *
 * `pet_type` is guaranteed present for Lost and Stray and structurally null for
 * Caution/Others (`nativeBroadcastRequiresPetType`), so the species slot is
 * dropped rather than padded when it does not apply.
 */
const ALERT_LEAD: Record<string, string> = {
  lost: "Lost",
  stray: "Stray",
  caution: "Caution",
  others: "Alert",
  other: "Alert",
};

/** District, then city — deduped, matching the public alert page's area string. */
export const buildAlertArea = (district?: string | null, city?: string | null) =>
  [String(district || "").trim(), String(city || "").trim()]
    .filter(Boolean)
    .filter((part, index, all) => all.findIndex((c) => c.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");

export const buildAlertPreviewTitle = (input: {
  alertType?: string | null;
  petType?: string | null;
  area?: string | null;
  headline?: string | null;
  archived?: boolean;
}) => {
  const lead = ALERT_LEAD[String(input.alertType || "").trim().toLowerCase()] || "Alert";
  const species = String(input.petType || "").trim().toLowerCase();
  const area = String(input.area || "").trim();
  const headline = cleanContent(input.headline);

  // "Lost cat" / "Caution" — never "Caution null".
  const subject = species ? `${lead} ${species}` : lead;
  // Without an area the brand carries the place slot, so the line still reads.
  const stem = area ? `${subject} in ${area}` : `${subject} on huddle`;
  // Resolved keeps the ORIGINAL line and prefixes it. "Resolved" alone answers
  // nothing — the reader needs to know resolved WHAT.
  const prefixed = input.archived ? `Resolved — ${stem}` : stem;
  if (!headline) return prefixed;
  return truncateSoft(`${prefixed}: ${headline}`, 48, 72);
};
