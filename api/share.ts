type MaybeString = string | string[] | undefined;
type RequestShape = {
  headers?: Record<string, MaybeString>;
  query?: Record<string, MaybeString>;
};
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void };
};
type ThreadRow = { id?: string; content?: string | null; images?: string[] | null; is_sensitive?: boolean | null; user_id?: string | null };
type ProfileRow = { display_name?: string | null; social_id?: string | null };
type AlertRow = {
  id?: string;
  title?: string | null;
  description?: string | null;
  creator_id?: string | null;
  thread_id?: string | null;
  type?: string | null;
  pet_type?: string | null;
  incident_district?: string | null;
  incident_city?: string | null;
  archived_at?: string | null;
  images?: string[] | null;
  photo_url?: string | null;
  is_sensitive?: boolean | null;
  verified_only?: boolean | null;
};

import { cappedOgImage, OG_SQUARE, OG_WIDE, renderAlertPage, renderOgImageTags, renderQrSvg, resolveStaticMapImage, type AlertPageData } from "./_alertPage";
import { checkDistributedRateLimit } from './_distributedRateLimit';

/** One column list, so the two alert lookups cannot drift apart. */
const ALERT_COLS = "id,title,description,creator_id,thread_id,type,pet_type,incident_district,incident_city,archived_at,images,photo_url,is_sensitive,verified_only";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;
const SPACE_PATTERN = /\s+/g;
const IP_RATE_LIMIT_MAX = 120;

const normalizeSocialId = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.replace(/^@+/, "") : "";
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

export const buildSharePreviewTitle = (displayName?: string | null, socialId?: string | null, snippet?: string | null) => {
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

/**
 * ALERT TITLES ARE THE WHOLE PREVIEW.
 *
 * iMessage renders the image, the title and the domain — it does NOT render
 * `og:description`. So the title line has to survive alone, and spending it on
 * the poster's identity ("Sam (@sam) on huddle") tells a reader nothing about a
 * missing cat.
 *
 * Shape: `{Type} {pet_type} in {district}: {title}`
 *   Lost cat in Kowloon City: Ginger tabby, answers to Mochi
 *
 * `pet_type` is guaranteed present for Lost and Stray and structurally null for
 * Caution/Others (`nativeBroadcastRequiresPetType`, app/src/lib/nativeBroadcast.ts),
 * so the species slot is dropped rather than padded when it does not apply.
 */
const ALERT_LEAD: Record<string, string> = {
  lost: "Lost",
  stray: "Stray",
  caution: "Caution",
  others: "Alert",
  other: "Alert",
};

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

export const buildSharePreviewDescription = (content?: string | null) => {
  const cleaned = cleanContent(content);
  if (!cleaned) return "See this post on huddle.";
  return truncateSoft(cleaned);
};

type ShareType = "thread" | "alert" | "profile" | "carer";

const buildCanonicalShareId = (shareType: ShareType, contentId: string) => {
  const normalizedId = String(contentId || "").trim();
  if (!normalizedId) return "";
  if (shareType === "thread") return normalizedId;
  return `${shareType}_${normalizedId}`;
};

const first = (value: MaybeString) => (Array.isArray(value) ? value[0] || "" : value || "");
const firstHeaderToken = (value: MaybeString) =>
  first(value)
    .split(",")[0]
    ?.trim() || "";

const normalizeProto = (value: MaybeString) => {
  const token = firstHeaderToken(value).toLowerCase();
  return token === "http" || token === "https" ? token : "https";
};

const normalizeHost = (value: MaybeString) => {
  const token = firstHeaderToken(value)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
  return token || "huddle.pet";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * A MISSING ENV VAR AND A DELETED POST ARE NOT THE SAME FAILURE.
 *
 * Every preview fetch below returns `null` on any problem, and the handler then
 * renders the generic "Social Post on huddle" card. That made an unset
 * `SUPABASE_URL` in production indistinguishable from a real 404 — every share
 * in the app unfurled generically and nothing anywhere said why.
 *
 * Config absence is a deploy fault, so it is logged loudly and exactly once per
 * request. The page still renders (a share link must never 500), but the cause
 * is now in the function logs instead of being silently swallowed.
 */
const resolveSupabaseConfig = () => {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const apiKey = serviceRoleKey || anonKey;
  if (!url || !apiKey) {
    console.error("[share] SUPABASE CONFIG MISSING — every share link will unfurl generically", {
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasUrl: Boolean(url),
    });
    return null;
  }
  return { url: url.replace(/\/+$/, ""), apiKey };
};

const fetchJson = async <T>(url: string, apiKey: string): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const selectSharePreviewImage = (images: unknown): string | null => {
  if (!Array.isArray(images)) return null;
  return images.find((entry) => typeof entry === "string" && entry.trim().length > 0)?.trim() || null;
};

/** District, then city — deduped, matching the alert page's own area string. */
export const buildAlertArea = (district?: string | null, city?: string | null) =>
  [String(district || "").trim(), String(city || "").trim()]
    .filter(Boolean)
    .filter((part, index, all) => all.findIndex((c) => c.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");

/**
 * One alert row becomes one preview, whichever URL was shared.
 *
 * `shareType`/`contentId` stay with the CALLER so the canonical URL is unchanged
 * — an alert-derived post keeps its own /share/{thread} link and only borrows
 * the alert's words.
 */
const previewFromAlertRow = (alert: AlertRow) => {
  const area = buildAlertArea(alert.incident_district, alert.incident_city);
  const archived = Boolean(String(alert.archived_at || "").trim());

  // A VERIFIED-ONLY ALERT STILL GETS A PREVIEW — A REDACTED ONE.
  //
  // These links were unfurling as bare URLs because they pointed at the SPA,
  // which carries no tags at all. Routing them here fixes that, but a crawler
  // is not a verified member: the photo, the headline and the species are
  // withheld, and only the shape of the alert survives — enough for the
  // recipient to know what they were sent, nothing a stranger can mine.
  if (alert.verified_only === true) {
    return {
      restricted: true,
      imageUrl: null,
      title: buildAlertPreviewTitle({ alertType: alert.type, archived, area }),
      description: "Shared with verified members. Open huddle to view.",
    };
  }

  return {
    restricted: false,
    imageUrl: alert.is_sensitive === true
      ? null
      : selectSharePreviewImage(alert.images) || (String(alert.photo_url || "").trim() || null),
    title: buildAlertPreviewTitle({
      alertType: alert.type,
      archived,
      area,
      headline: alert.title || alert.description,
      petType: alert.pet_type,
    }),
    description: buildSharePreviewDescription(alert.description || alert.title),
  };
};

/**
 * An alert-derived post is an ALERT. A missing pet does not become less urgent
 * because it was cross-posted, so the thread borrows the alert's title rather
 * than unfurling as an ordinary post by its author.
 *
 * One extra REST call, on the crawler path only, behind `s-maxage=120`.
 */
const fetchAlertRowForThread = async (threadId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !threadId) return null;
  const url = `${config.url}/rest/v1/broadcast_alerts?select=${ALERT_COLS}&thread_id=eq.${encodeURIComponent(threadId)}&limit=1`;
  const rows = await fetchJson<AlertRow[]>(url, config.apiKey);
  const alert = Array.isArray(rows) ? rows[0] : null;
  return alert?.id ? alert : null;
};

const fetchThreadPreviewData = async (threadId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !threadId) return null;

  const threadUrl = `${config.url}/rest/v1/threads?select=id,content,images,is_sensitive,user_id&id=eq.${encodeURIComponent(threadId)}&limit=1`;
  const threadRows = await fetchJson<ThreadRow[]>(threadUrl, config.apiKey);
  const thread = Array.isArray(threadRows) ? threadRows[0] : null;
  if (!thread?.id) return null;

  let displayName = "";
  let socialId = "";
  const authorId = String(thread.user_id || "").trim();
  if (authorId) {
    const profileUrl = `${config.url}/rest/v1/profiles?select=display_name,social_id&id=eq.${encodeURIComponent(authorId)}&limit=1`;
    const profileRows = await fetchJson<ProfileRow[]>(profileUrl, config.apiKey);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    displayName = String(profile?.display_name || "").trim();
    socialId = String(profile?.social_id || "").trim();
  }
  // A shared link may still describe a sensitive post, but its image must never
  // be pushed into a third-party preview without the viewer opting in.
  const imageUrl = thread.is_sensitive === true ? null : selectSharePreviewImage(thread.images);

  // AN ALERT-DERIVED POST READS AS THE ALERT, BUT OPENS THE POST.
  //
  // Same preview grammar as sharing the alert itself — a reader cannot tell the
  // two apart, and should not have to. Only the destination differs: this link
  // was shared from Social, so it opens the post and its replies, while
  // `/share/alert_{id}` opens the alert. One incident, two doors, one look.
  const derivedFrom = await fetchAlertRowForThread(String(thread.id));
  if (derivedFrom) {
    const fromAlert = previewFromAlertRow(derivedFrom);
    return {
      shareType: "thread" as const,
      contentId: String(thread.id),
      // The thread's own sensitivity still governs the thread's own media.
      imageUrl: fromAlert.imageUrl || imageUrl,
      title: fromAlert.title,
      description: fromAlert.description,
    };
  }

  // A sensitive post's WORDS are as public as its picture once a link is pasted
  // into a group chat, so the caption stays out of the preview too — the reader
  // is told what it is and opts in by opening the app.
  if (thread.is_sensitive === true) {
    return {
      shareType: "thread" as const,
      contentId: String(thread.id),
      imageUrl: null,
      title: buildSharePreviewTitle(displayName, socialId),
      description: "Sensitive content. Open in huddle to view.",
    };
  }

  return {
    shareType: "thread" as const,
    contentId: String(thread.id),
    imageUrl,
    title: buildSharePreviewTitle(displayName, socialId, thread.content),
    description: buildSharePreviewDescription(thread.content),
  };
};

/**
 * THE ALERT WINS.
 *
 * This function used to fetch the alert, notice it had a linked thread, fetch
 * that thread, and then return the THREAD's preview — discarding the richer
 * record for the poorer one. A lost-cat alert unfurled as "Sam (@sam) on
 * huddle", which is the one thing a reader does not need to know.
 *
 * The alert row now owns the whole preview: its type, species, district and
 * headline. The linked thread is no longer consulted at all on this path.
 */
const fetchAlertPreviewData = async (alertId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !alertId) return null;

  const alertUrl = `${config.url}/rest/v1/broadcast_alerts?select=${ALERT_COLS}&id=eq.${encodeURIComponent(alertId)}&limit=1`;
  const alertRows = await fetchJson<AlertRow[]>(alertUrl, config.apiKey);
  const alert = Array.isArray(alertRows) ? alertRows[0] : null;
  if (!alert?.id) return null;

  return {
    shareType: "alert" as const,
    contentId: String(alert.id),
    ...previewFromAlertRow(alert),
  };
};

/**
 * Full data for the public alert PAGE (distinct from the OG preview above).
 *
 * Selects NO latitude/longitude. The page shows an area, never a point.
 */
const fetchAlertPageData = async (alertId: string): Promise<AlertPageData | null> => {
  const config = resolveSupabaseConfig();
  if (!config || !alertId) return null;

  const url = `${config.url}/rest/v1/broadcast_alerts?select=id,title,description,photo_url,type,incident_district,incident_city,incident_country_name,created_at,archived_at&id=eq.${encodeURIComponent(alertId)}&limit=1`;
  const rows = await fetchJson<Array<Record<string, unknown>>>(url, config.apiKey);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) return null;

  const district = String(row.incident_district || "").trim();
  const city = String(row.incident_city || "").trim();
  const area = [district, city]
    .filter(Boolean)
    .filter((part, index, all) => all.findIndex((c) => c.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");

  // Local proof: live count of other active alerts in the same district.
  // Omitted at zero by the renderer rather than printed as "0".
  let nearbyCount = 0;
  if (district) {
    const nowIso = new Date().toISOString();
    const countUrl = `${config.url}/rest/v1/broadcast_alerts?select=id&incident_district=eq.${encodeURIComponent(district)}&archived_at=is.null&is_sensitive=eq.false&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(nowIso)})&id=neq.${encodeURIComponent(String(row.id))}&limit=50`;
    const nearby = await fetchJson<Array<{ id?: string }>>(countUrl, config.apiKey);
    nearbyCount = Array.isArray(nearby) ? nearby.length : 0;
  }

  return {
    id: String(row.id),
    title: String(row.title || "").trim(),
    description: String(row.description || "").trim(),
    photoUrl: String(row.photo_url || "").trim() || null,
    // The COLUMN is `type`; only the RPC renames it to `alert_type`.
    alertType: String(row.type || "").trim(),
    area,
    country: String(row.incident_country_name || "").trim(),
    createdAt: String(row.created_at || ""),
    archived: Boolean(String(row.archived_at || "").trim()),
    nearbyCount,
  };
};

// Share-card previews: the person's own avatar + real name/services, so links
// pasted into iMessage/WhatsApp/socials unfurl as a proper card — never a raw link.
const fetchProfilePreviewData = async (userId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !userId) return null;
  const profileUrl = `${config.url}/rest/v1/profiles?select=id,display_name,social_id,bio,avatar_url&id=eq.${encodeURIComponent(userId)}&limit=1`;
  const rows = await fetchJson<Array<ProfileRow & { id?: string; bio?: string | null; avatar_url?: string | null }>>(profileUrl, config.apiKey);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile?.id) return null;
  const avatar = String(profile.avatar_url || "").trim();
  return {
    shareType: "profile" as const,
    contentId: String(profile.id),
    title: buildSharePreviewTitle(profile.display_name, profile.social_id),
    description: cleanContent(profile.bio)
      ? truncateSoft(cleanContent(profile.bio))
      : "Meet them and their pack on huddle.",
    imageUrl: /^https:\/\//.test(avatar) ? avatar : null,
  };
};

const fetchCarerPreviewData = async (userId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !userId) return null;
  const profileUrl = `${config.url}/rest/v1/profiles?select=id,display_name,social_id,avatar_url&id=eq.${encodeURIComponent(userId)}&limit=1`;
  const careUrl = `${config.url}/rest/v1/pet_care_profiles?select=services_offered,listed&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
  const [profileRows, careRows] = await Promise.all([
    fetchJson<Array<ProfileRow & { id?: string; avatar_url?: string | null }>>(profileUrl, config.apiKey),
    fetchJson<Array<{ services_offered?: string[] | null; listed?: boolean | null }>>(careUrl, config.apiKey),
  ]);
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;
  if (!profile?.id) return null;
  const care = Array.isArray(careRows) ? careRows[0] : null;
  const services = Array.isArray(care?.services_offered) ? care.services_offered.filter(Boolean) : [];
  const avatar = String(profile.avatar_url || "").trim();
  const name = String(profile.display_name || "").trim() || "A huddle carer";
  return {
    shareType: "carer" as const,
    contentId: String(profile.id),
    title: `${name} · Pet Care on huddle`,
    description: services.length
      ? truncateSoft(`${services.join(" · ")} — trusted pet care on huddle.`)
      : "Trusted pet care on huddle.",
    imageUrl: /^https:\/\//.test(avatar) ? avatar : null,
  };
};

const parseShareQuery = (req: RequestShape) => {
  const idFromPath = first(req.query?.id).trim();
  if (idFromPath) {
    if (idFromPath.startsWith("alert_")) {
      const alertId = idFromPath.slice("alert_".length).trim();
      if (alertId) return { shareType: "alert" as const, contentId: alertId };
      return null;
    }
    if (idFromPath.startsWith("profile_")) {
      const profileId = idFromPath.slice("profile_".length).trim();
      if (profileId) return { shareType: "profile" as const, contentId: profileId };
      return null;
    }
    if (idFromPath.startsWith("carer_")) {
      const carerId = idFromPath.slice("carer_".length).trim();
      if (carerId) return { shareType: "carer" as const, contentId: carerId };
      return null;
    }
    return { shareType: "thread" as const, contentId: idFromPath };
  }

  // Backward compatibility for older rewrite format.
  const legacyThread = first(req.query?.thread).trim();
  if (legacyThread) return { shareType: "thread" as const, contentId: legacyThread };
  return null;
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  const ipRate = await checkDistributedRateLimit(req, 'share', IP_RATE_LIMIT_MAX);
  if ('retryAfter' in ipRate) {
    res.setHeader("Retry-After", String(ipRate.retryAfter));
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(ipRate.unavailable ? 503 : 429).send(ipRate.unavailable ? "Temporarily unavailable" : "Too many requests");
    return;
  }

  const host = normalizeHost(req.headers?.["x-forwarded-host"] || req.headers?.host);
  const proto = normalizeProto(req.headers?.["x-forwarded-proto"]);
  const origin = `${proto}://${host}`;

  const parsed = parseShareQuery(req);
  const preview = !parsed
    ? null
    : parsed.shareType === "thread"
      ? await fetchThreadPreviewData(parsed.contentId)
      : parsed.shareType === "profile"
        ? await fetchProfilePreviewData(parsed.contentId)
        : parsed.shareType === "carer"
          ? await fetchCarerPreviewData(parsed.contentId)
          : await fetchAlertPreviewData(parsed.contentId);
  const effectiveType: ShareType = preview?.shareType || parsed?.shareType || "thread";
  const effectiveContentId = preview?.contentId || parsed?.contentId || "";
  const title = preview?.title || (
    effectiveType === "alert" ? "Map Alert on huddle"
      : effectiveType === "profile" ? "A member on huddle"
        : effectiveType === "carer" ? "Pet Care on huddle"
          : "Social Post on huddle");
  const description = preview?.description || (
    effectiveType === "alert" ? "See this alert on huddle map."
      : effectiveType === "profile" ? "Meet them and their pack on huddle."
        : effectiveType === "carer" ? "Trusted pet care on huddle."
          : "See this post on huddle social.");
  const previewImage = preview && "imageUrl" in preview ? preview.imageUrl : null;
  // A person's link is a face; a post's link is a banner. The avatar keeps its
  // own square shape rather than being cropped into a 1.91:1 strip.
  const ogSize = effectiveType === "profile" || effectiveType === "carer" ? OG_SQUARE : OG_WIDE;
  // NO IMAGE FALLBACK. With nothing real to show, the image tags are omitted
  // and every renderer draws its own text-only preview — title, description,
  // domain. The old `/huddle-logo.jpg` fallback was a square logo declared as
  // 1200x630, which is exactly what pillarboxed it onto grey in iMessage.
  const image = cappedOgImage(previewImage, null, ogSize);
  const shareId = effectiveContentId ? buildCanonicalShareId(effectiveType, effectiveContentId) : "";
  const shareUrl = shareId ? `${origin}/share/${encodeURIComponent(shareId)}` : `${origin}/share`;
  const fallbackDownloadUrl = `${origin}/waitlist`;
  const iosDownloadUrl = String(process.env.HUDDLE_IOS_DOWNLOAD_URL || "").trim() || fallbackDownloadUrl;
  const androidDownloadUrl = String(process.env.HUDDLE_ANDROID_DOWNLOAD_URL || "").trim() || fallbackDownloadUrl;
  // The public alert page is a real page, not an OG stub: full detail, and no
  // auto-redirect to the store. Other share types keep the existing card.
  const restricted = Boolean(preview && "restricted" in preview && preview.restricted);
  if (effectiveType === "alert" && effectiveContentId && !restricted) {
    const alertData = await fetchAlertPageData(effectiveContentId);
    if (alertData) {
      const mapboxToken = String(process.env.MAPBOX_ACCESS_TOKEN || process.env.VITE_MAPBOX_ACCESS_TOKEN || "").trim();
      const staticMapImage = alertData.archived
        ? null
        : await resolveStaticMapImage(alertData.area, alertData.country, mapboxToken);
      const qrSvg = await renderQrSvg(shareUrl);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      res.status(200).send(
        renderAlertPage({
          data: alertData,
          shareUrl,
          staticMapImage,
          iosDownloadUrl,
          androidDownloadUrl,
          ogImage: cappedOgImage(alertData.photoUrl, image),
          title,
          description,
          qrSvg,
        }),
      );
      return;
    }
  }

  const qrSvg = await renderQrSvg(shareUrl);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="apple-itunes-app" content="app-id=6766207079" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    ${renderOgImageTags(image, escapeHtml, ogSize)}
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="/huddle-favicon-32-v5.png" />
    <link rel="icon" type="image/png" href="/huddle-favicon-v5.png" />
    <link rel="apple-touch-icon" href="/huddle-apple-touch-icon-v5.png" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Urbanist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f7fb; color: #424965; }
      .wrap { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
      .card { width: min(520px, 100%); border-radius: 18px; background: #fff; box-shadow: 0 10px 34px rgba(36,55,120,.12); padding: 16px; }
      .preview { width: 100%; aspect-ratio: 1200 / 630; border-radius: 14px; background: #f4f7fb; display: grid; place-items: center; overflow: hidden; }
      .preview img { width: 100%; height: 100%; object-fit: contain; padding: 16px; }
      .title { margin: 12px 0 6px; font-weight: 700; font-size: 17px; line-height: 1.3; }
      .desc { margin: 0; font-size: 14px; line-height: 1.45; color: rgba(66,73,101,.78); }
      .cta { display: inline-flex; margin-top: 14px; background: #2145CF; color: #fff; text-decoration: none; font-weight: 600; border-radius: 999px; padding: 9px 14px; }
      .desktop-only { display: none; margin-top: 16px; }
      .qr-label { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: rgba(66,73,101,.7); }
      .qr svg { width: 148px; height: 148px; border-radius: 10px; }
      @media (min-width: 820px) { .desktop-only { display: block; } }
    </style>
  </head>
  <body>
    <main class="wrap">
      <article class="card">
        ${image ? `<div class="preview"><img src="${escapeHtml(image)}" alt="huddle preview" /></div>` : ""}
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="desc">${escapeHtml(description)}</p>
        <a class="cta" id="download-app" href="${escapeHtml(iosDownloadUrl)}">Get huddle</a>
        ${qrSvg ? `<div class="desktop-only"><p class="qr-label">Scan to open this on your phone:</p><div class="qr">${qrSvg}</div></div>` : ""}
      </article>
    </main>
    <script>
      (() => {
        const ua = navigator.userAgent || "";
        const android = /Android/i.test(ua);
        const store = android
          ? ${JSON.stringify(androidDownloadUrl)}
          : ${JSON.stringify(iosDownloadUrl)};
        document.getElementById("download-app").href = store;

        // NO AUTO-REDIRECT TO THE STORE.
        //
        // This page used to replace itself with the App Store 80ms after load,
        // so a recipient tapped a preview card and landed in the store without
        // ever seeing what they had been sent. If the app is installed the
        // universal link opens it before this page renders at all; if it is
        // not, the reader should see the content first and choose the app
        // afterwards. Same rule as the public alert page.
      })();
    </script>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
  res.status(200).send(html);
}
