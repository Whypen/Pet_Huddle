import { buildSharePreviewDescription, buildSharePreviewTitle } from "@/lib/sharePreview";

export type ShareContentType = "thread" | "alert";

export type ShareModelInput = {
  origin: string;
  contentType: ShareContentType;
  contentId: string;
  displayName?: string | null;
  socialId?: string | null;
  contentSnippet?: string | null;
  imagePath?: string;
};

export type ShareModel = {
  contentType: ShareContentType;
  contentId: string;
  shareId: string;
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  countThreadId: string | null;
};

export type SharePayload = ShareModel;

const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, "");

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
    if (!contentId) return null;
    return { contentType: "alert", contentId };
  }
  return { contentType: "thread", contentId: raw };
};

export const buildShareModel = ({
  origin,
  contentType,
  contentId,
  displayName,
  socialId,
  contentSnippet,
  imagePath = "/huddle-logo.jpg",
}: ShareModelInput): ShareModel => {
  const cleanOrigin = normalizeOrigin(origin);
  const shareId = buildCanonicalShareId(contentType, contentId);
  const url = `${cleanOrigin}/share/${encodeURIComponent(shareId)}`;
  const title = buildSharePreviewTitle(displayName, socialId);
  const description = buildSharePreviewDescription(contentSnippet);
  const imageUrl = `${cleanOrigin}${imagePath.startsWith("/") ? imagePath : `/${imagePath}`}`;

  return {
    contentType,
    contentId,
    shareId,
    url,
    title,
    description,
    imageUrl,
    countThreadId: contentType === "thread" ? contentId : null,
  };
};
