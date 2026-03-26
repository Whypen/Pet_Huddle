import { buildSharePreviewDescription, buildSharePreviewTitle } from "./sharePreview.js";

export type ShareContentType = "thread" | "alert";
export type ShareSurface = "Social" | "Map";

export type ShareModelInput = {
  origin: string;
  contentType: ShareContentType;
  contentId: string;
  surface: ShareSurface;
  appContentId?: string | null;
  displayName?: string | null;
  socialId?: string | null;
  contentSnippet?: string | null;
  imagePath?: string | null;
};

export type ShareModel = {
  contentType: ShareContentType;
  contentId: string;
  surface: ShareSurface;
  shareId: string;
  canonicalUrl: string;
  appUrl: string;
  title: string;
  description: string;
  imageUrl: string;
  chatHeadline: string;
  countThreadId: string | null;
};

type ChatShareEnvelope = {
  kind: "huddle_share";
  share: ShareModel;
};

const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, "");
const isAbsoluteHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const normalizeSocialId = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.replace(/^@+/, "") : "";
};

const parseIdentityFromTitle = (title: string) => {
  const raw = String(title || "").trim();
  if (!raw) return { displayName: "", socialId: "" };
  const withSocial = raw.match(/^(.+?)\s+\(@([^)]+)\)\s+on\s+huddle$/i);
  if (withSocial) {
    return {
      displayName: String(withSocial[1] || "").trim(),
      socialId: normalizeSocialId(String(withSocial[2] || "").trim()),
    };
  }
  const nameOnly = raw.match(/^(.+?)\s+on\s+huddle$/i);
  if (nameOnly) {
    return {
      displayName: String(nameOnly[1] || "").trim().replace(/^@+/, ""),
      socialId: "",
    };
  }
  const socialOnly = raw.match(/^@(.+?)\s+on\s+huddle$/i);
  if (socialOnly) {
    return {
      displayName: "",
      socialId: normalizeSocialId(String(socialOnly[1] || "").trim()),
    };
  }
  return { displayName: "", socialId: "" };
};

const normalizeChatHeadline = (headline: string | null | undefined, title: string, surface: ShareSurface) => {
  const rawHeadline = String(headline || "").trim();
  if (rawHeadline && /on huddle's (Social|Map)$/i.test(rawHeadline)) return rawHeadline;
  const parsed = parseIdentityFromTitle(title);
  return buildChatShareHeadline(parsed.displayName, parsed.socialId, surface);
};

export const buildCanonicalShareId = (contentType: ShareContentType, contentId: string) => {
  const normalizedId = String(contentId || "").trim();
  if (!normalizedId) return "";
  return contentType === "thread" ? normalizedId : `alert_${normalizedId}`;
};

export const parseCanonicalShareId = (shareId: string): { contentType: ShareContentType; contentId: string } | null => {
  const raw = String(shareId || "").trim();
  if (!raw) return null;
  if (raw.startsWith("alert_")) {
    const contentId = raw.slice("alert_".length).trim();
    return contentId ? { contentType: "alert", contentId } : null;
  }
  return { contentType: "thread", contentId: raw };
};

export const buildChatShareHeadline = (
  displayName?: string | null,
  socialId?: string | null,
  surface: ShareSurface = "Social",
) => {
  const name = String(displayName || "").trim();
  const social = normalizeSocialId(socialId);
  if (name && social) return `${name} (@${social}) on huddle's ${surface}`;
  if (name) return `${name} on huddle's ${surface}`;
  if (social) return `@${social} on huddle's ${surface}`;
  return `${surface === "Map" ? "Alert" : "Post"} on huddle's ${surface}`;
};

export const buildShareModel = ({
  origin,
  contentType,
  contentId,
  surface,
  appContentId,
  displayName,
  socialId,
  contentSnippet,
  imagePath = "/huddle-logo.jpg",
}: ShareModelInput): ShareModel => {
  const cleanOrigin = normalizeOrigin(origin);
  const shareId = buildCanonicalShareId(contentType, contentId);
  const canonicalUrl = `${cleanOrigin}/share/${encodeURIComponent(shareId)}`;
  const normalizedAppContentId = String(appContentId || "").trim() || contentId;
  const appUrl = surface === "Map"
    ? `${cleanOrigin}/map?alert=${encodeURIComponent(normalizedAppContentId)}`
    : contentType === "thread"
      ? `${cleanOrigin}/threads?focus=${encodeURIComponent(contentId)}`
      : `${cleanOrigin}/map?alert=${encodeURIComponent(contentId)}`;
  const title = buildSharePreviewTitle(displayName, socialId);
  const description = buildSharePreviewDescription(contentSnippet);
  const rawImage = String(imagePath || "").trim();
  const normalizedImagePath = rawImage || "/huddle-logo.jpg";
  const imageUrl = isAbsoluteHttpUrl(normalizedImagePath)
    ? normalizedImagePath
    : `${cleanOrigin}${normalizedImagePath.startsWith("/") ? normalizedImagePath : `/${normalizedImagePath}`}`;

  return {
    contentType,
    contentId,
    surface,
    shareId,
    canonicalUrl,
    appUrl,
    title,
    description,
    imageUrl,
    chatHeadline: buildChatShareHeadline(displayName, socialId, surface),
    countThreadId: contentType === "thread" ? contentId : null,
  };
};

export const serializeChatShareMessage = (share: ShareModel) =>
  JSON.stringify({
    kind: "huddle_share",
    share: {
      ...share,
      chatHeadline: normalizeChatHeadline(share.chatHeadline, share.title, share.surface),
    },
  } satisfies ChatShareEnvelope);

export const parseChatShareMessage = (rawContent: string | null | undefined): ShareModel | null => {
  const raw = String(rawContent || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatShareEnvelope> | Record<string, unknown>;
    const payloadShare = (() => {
      if ((parsed as Partial<ChatShareEnvelope>)?.kind === "huddle_share" && (parsed as Partial<ChatShareEnvelope>)?.share) {
        return (parsed as Partial<ChatShareEnvelope>).share as Partial<ShareModel>;
      }
      // Backward compatibility: accept direct share object payloads from older builds.
      if (parsed && typeof parsed === "object" && ("contentType" in parsed || "shareId" in parsed || "canonicalUrl" in parsed || "url" in parsed)) {
        return parsed as Partial<ShareModel>;
      }
      return null;
    })();
    if (!payloadShare) return null;
    const share = payloadShare as Partial<ShareModel>;
    const normalizedContentType: ShareContentType | null =
      share.contentType === "thread" || share.contentType === "alert" ? share.contentType : null;
    const normalizedSurface: ShareSurface =
      share.surface === "Social" || share.surface === "Map"
        ? share.surface
        : normalizedContentType === "alert"
          ? "Map"
          : "Social";
    const canonicalOrLegacyUrl = String(share.canonicalUrl || (share as { url?: string }).url || "").trim();
    if (
      !normalizedContentType ||
      !share.contentId ||
      !share.shareId ||
      !canonicalOrLegacyUrl ||
      !share.title ||
      !share.description ||
      !share.imageUrl
    ) {
      return null;
    }
    return {
      contentType: normalizedContentType,
      contentId: String(share.contentId),
      surface: normalizedSurface,
      shareId: String(share.shareId),
      canonicalUrl: canonicalOrLegacyUrl,
      appUrl: String(share.appUrl || (normalizedContentType === "thread"
        ? `/threads?focus=${encodeURIComponent(String(share.contentId))}`
        : `/map?alert=${encodeURIComponent(String(share.contentId))}`)),
      title: String(share.title),
      description: String(share.description),
      imageUrl: String(share.imageUrl),
      chatHeadline: normalizeChatHeadline(share.chatHeadline, String(share.title), normalizedSurface),
      countThreadId: share.countThreadId ? String(share.countThreadId) : null,
    };
  } catch {
    return null;
  }
};
