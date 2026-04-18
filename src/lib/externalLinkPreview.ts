import { supabase } from "@/integrations/supabase/client";

export type ExternalLinkPreview = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  loading?: boolean;
  failed?: boolean;
  resolved?: boolean;
  error?: string;
};

type LinkPreviewPayload = {
  url?: unknown;
  title?: unknown;
  description?: unknown;
  image?: unknown;
  siteName?: unknown;
  failed?: unknown;
};

const previewCache = new Map<string, ExternalLinkPreview>();
const previewInflight = new Map<string, Promise<ExternalLinkPreview>>();

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/i;

export const extractFirstHttpUrl = (value: string) => {
  const match = String(value || "").match(URL_PATTERN);
  return match?.[1] || null;
};

export const stripExternalUrlFromText = (value: string, url: string | null | undefined) => {
  if (!url) return value;
  return String(value || "")
    .replace(url, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const formatExternalUrlLabel = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${host}${path}` || url;
  } catch {
    return url;
  }
};

const buildFallbackPreview = (url: string, error?: string): ExternalLinkPreview => ({
  url,
  title: formatExternalUrlLabel(url),
  siteName: (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "External link";
    }
  })(),
  failed: true,
  resolved: true,
  error,
});

export const fetchExternalLinkPreview = async (url: string): Promise<ExternalLinkPreview> => {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) {
    throw new Error("preview_url_missing");
  }

  const cached = previewCache.get(normalizedUrl);
  if (cached && (cached.resolved || cached.failed)) {
    return cached;
  }

  const pending = previewInflight.get(normalizedUrl);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("link-preview", {
        body: { url: normalizedUrl },
      });

      if (error) {
        const fallback = buildFallbackPreview(normalizedUrl, error.message || "preview_request_failed");
        previewCache.set(normalizedUrl, fallback);
        return fallback;
      }

      const payload = (data as LinkPreviewPayload | null) ?? null;
      if (payload?.failed === true) {
        const fallback = buildFallbackPreview(normalizedUrl, "preview_failed");
        previewCache.set(normalizedUrl, fallback);
        return fallback;
      }

      const resolved: ExternalLinkPreview = {
        url: String(payload?.url || normalizedUrl),
        title: typeof payload?.title === "string" ? payload.title : undefined,
        description: typeof payload?.description === "string" ? payload.description : undefined,
        image: typeof payload?.image === "string" ? payload.image : undefined,
        siteName: typeof payload?.siteName === "string" ? payload.siteName : undefined,
        resolved: true,
      };
      previewCache.set(normalizedUrl, resolved);
      return resolved;
    } catch (error) {
      const fallback = buildFallbackPreview(
        normalizedUrl,
        error instanceof Error ? error.message : "preview_exception",
      );
      previewCache.set(normalizedUrl, fallback);
      return fallback;
    } finally {
      previewInflight.delete(normalizedUrl);
    }
  })();

  previewInflight.set(normalizedUrl, request);
  return request;
};
