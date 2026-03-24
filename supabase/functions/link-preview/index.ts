const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const normalizeUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();

const parseMetaAttributes = (tag: string) => {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const key = match[1]?.toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    if (!key) continue;
    attrs[key] = decodeHtml(rawValue);
  }
  return attrs;
};

const buildMetaMap = (html: string) => {
  const map = new Map<string, string>();
  const tagPattern = /<meta\b[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(html)) !== null) {
    const attrs = parseMetaAttributes(tagMatch[0]);
    const content = attrs["content"] || "";
    if (!content) continue;
    const property = (attrs["property"] || attrs["name"] || attrs["itemprop"] || "").toLowerCase();
    if (!property) continue;
    if (!map.has(property)) map.set(property, content);
  }
  return map;
};

const readTitle = (html: string) => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1] ? decodeHtml(titleMatch[1]) : "";
};

const toAbsoluteUrl = (baseUrl: string, maybeRelative: string) => {
  const normalized = normalizeUrl(maybeRelative);
  if (normalized) return normalized;
  try {
    const absolute = new URL(maybeRelative, baseUrl).toString();
    return normalizeUrl(absolute);
  } catch {
    return null;
  }
};

const fetchPage = async (url: string, userAgent: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("preview_timeout"), 7000);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { url } = (await req.json()) as { url?: string };
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return json({ error: "invalid_url" }, 400);

    const userAgents = [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    ];
    let res: Response | null = null;
    for (const ua of userAgents) {
      const candidate = await fetchPage(normalizedUrl, ua);
      if (candidate.ok) {
        res = candidate;
        break;
      }
      if (res == null) res = candidate;
    }

    if (!res || !res.ok) return json({ url: normalizedUrl, failed: true });
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const finalUrl = normalizeUrl(res.url) || normalizedUrl;
    if (!contentType.includes("text/html")) {
      return json({
        url: finalUrl,
        title: finalUrl,
        siteName: new URL(finalUrl).hostname.replace(/^www\./, ""),
      });
    }

    const html = await res.text();
    const meta = buildMetaMap(html);
    const title = meta.get("og:title") || meta.get("twitter:title") || readTitle(html) || finalUrl;
    const description =
      meta.get("og:description") ||
      meta.get("twitter:description") ||
      meta.get("description") ||
      "";
    const imageRaw =
      meta.get("og:image") ||
      meta.get("og:image:url") ||
      meta.get("twitter:image") ||
      meta.get("twitter:image:src") ||
      "";
    const siteName =
      meta.get("og:site_name") ||
      meta.get("twitter:site") ||
      new URL(finalUrl).hostname.replace(/^www\./, "");
    const image = imageRaw ? toAbsoluteUrl(finalUrl, imageRaw) : null;

    return json({
      url: finalUrl,
      title,
      description,
      image: image || undefined,
      siteName: siteName.replace(/^@/, ""),
    });
  } catch (error) {
    console.error("[link-preview] failed", error);
    return json({ failed: true });
  }
});
