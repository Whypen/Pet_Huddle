const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
  });

// Successes: edge cache 1d, browser 1h, SWR 7d
const SUCCESS_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
};

// Failures: short retry window so transient bot-blocks don't lock for a week
const FAILURE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

// UA rotation: Twitterbot is whitelisted by most news sites (NYT, Rolling Stone,
// WSJ, Bloomberg) which block Facebook/generic crawlers; Slackbot is the
// next-best fallback; facebookexternalhit handles social-graph content; Chrome
// desktop is the final catch-all.
const USER_AGENTS = [
  "Twitterbot/1.0",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];

const tryOEmbed = async (url: string): Promise<Record<string, unknown> | null> => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    // YouTube fast-path
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
      const videoId = host === "youtu.be"
        ? u.pathname.slice(1).split("/")[0]
        : u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop();
      if (!videoId) return null;
      return {
        url,
        title: `YouTube video`,
        description: "",
        image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        siteName: "YouTube",
      };
    }

    // Spotify fast-path via oEmbed
    if (host === "open.spotify.com") {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
        if (r.ok) {
          const data = await r.json();
          return {
            url,
            title: data.title || "Spotify",
            description: "",
            image: data.thumbnail_url || undefined,
            siteName: "Spotify",
          };
        }
      } finally {
        clearTimeout(t);
      }
    }
  } catch {
    return null;
  }
  return null;
};

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return _; }
    })
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();

const parseAttributes = (tag: string) => {
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
    const attrs = parseAttributes(tagMatch[0]);
    const content = attrs["content"] || "";
    if (!content) continue;
    const property = (attrs["property"] || attrs["name"] || attrs["itemprop"] || "").toLowerCase();
    if (!property) continue;
    if (!map.has(property)) map.set(property, content);
  }
  return map;
};

// Discover an oEmbed JSON endpoint advertised by the page (Vimeo, Twitter/X,
// Reddit, SoundCloud, TikTok, Flickr, CodePen, Figma, Substack, Medium expose
// this — bypasses bot-block on the HTML).
const findOEmbedHref = (html: string): string | null => {
  const linkPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs["rel"] || "").toLowerCase();
    const type = (attrs["type"] || "").toLowerCase();
    if (rel.includes("alternate") && type.includes("json") && type.includes("oembed")) {
      return attrs["href"] || null;
    }
  }
  return null;
};

const fetchOEmbedJson = async (endpoint: string): Promise<Record<string, unknown> | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("oembed_timeout"), 4000);
  try {
    const r = await fetch(endpoint, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Twitterbot/1.0", Accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

// Headless-rendered fallback for sites that block all bot UAs (Rolling Stone,
// some paywalled news). Jina Reader returns markdown with a YAML-ish header
// containing Title/URL Source/Markdown Content. Free, no key required.
const tryJinaReader = async (url: string): Promise<Record<string, unknown> | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("jina_timeout"), 6000);
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
    });
    if (!r.ok) return null;
    const text = await r.text();
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    const descMatch = text.match(/^Description:\s*(.+)$/m);
    const imgMatch = text.match(/^Image:\s*(\S+)/m) || text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
    const title = titleMatch?.[1]?.trim();
    if (!title) return null;
    const host = new URL(url).hostname.replace(/^www\./, "");
    return {
      url,
      title,
      description: descMatch?.[1]?.trim() || "",
      image: imgMatch?.[1] || undefined,
      siteName: host,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
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

    const oembed = await tryOEmbed(normalizedUrl);
    if (oembed) return json(oembed, 200, SUCCESS_CACHE_HEADERS);

    let res: Response | null = null;
    for (const ua of USER_AGENTS) {
      const candidate = await fetchPage(normalizedUrl, ua);
      if (candidate.ok) {
        res = candidate;
        break;
      }
      if (res == null) res = candidate;
    }

    if (!res) {
      const jina = await tryJinaReader(normalizedUrl);
      if (jina) return json(jina, 200, SUCCESS_CACHE_HEADERS);
      return json({ url: normalizedUrl, failed: true }, 200, FAILURE_CACHE_HEADERS);
    }
    // Note: do NOT bail on non-2xx — many sites (Rolling Stone, WP VIP) return
    // a branded 404/410 page with valid og: tags pointing at the site logo,
    // which still renders as a usable site-card preview.
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const finalUrl = normalizeUrl(res.url) || normalizedUrl;
    if (!contentType.includes("text/html")) {
      return json({
        url: finalUrl,
        title: finalUrl,
        siteName: new URL(finalUrl).hostname.replace(/^www\./, ""),
      }, 200, SUCCESS_CACHE_HEADERS);
    }

    const html = await res.text();
    const meta = buildMetaMap(html);
    let title = meta.get("og:title") || meta.get("twitter:title") || readTitle(html) || "";
    let description =
      meta.get("og:description") ||
      meta.get("twitter:description") ||
      meta.get("description") ||
      "";
    let imageRaw =
      meta.get("og:image") ||
      meta.get("og:image:url") ||
      meta.get("twitter:image") ||
      meta.get("twitter:image:src") ||
      "";
    let siteName =
      meta.get("og:site_name") ||
      meta.get("twitter:site") ||
      "";

    // If meta is missing (paywalled, JS-rendered, soft-blocked HTML), try the
    // page-advertised oEmbed JSON endpoint as a second source.
    if (!title || !imageRaw) {
      const oembedHrefRaw = findOEmbedHref(html);
      const oembedHref = oembedHrefRaw ? toAbsoluteUrl(finalUrl, oembedHrefRaw) : null;
      if (oembedHref) {
        const data = await fetchOEmbedJson(oembedHref);
        if (data) {
          title = title || (typeof data.title === "string" ? data.title : "");
          siteName = siteName || (typeof data.provider_name === "string" ? data.provider_name : "");
          if (!imageRaw && typeof data.thumbnail_url === "string") imageRaw = data.thumbnail_url;
          if (!description && typeof data.author_name === "string") description = data.author_name;
        }
      }
    }

    // Last-resort: HTML loaded but had no usable meta (anti-bot stub page).
    if (!title || !imageRaw) {
      const jina = await tryJinaReader(finalUrl);
      if (jina) {
        title = title || (typeof jina.title === "string" ? jina.title : "");
        if (!imageRaw && typeof jina.image === "string") imageRaw = jina.image;
        if (!description && typeof jina.description === "string") description = jina.description;
      }
    }

    title = title || finalUrl;
    siteName = siteName || new URL(finalUrl).hostname.replace(/^www\./, "");
    const image = imageRaw ? toAbsoluteUrl(finalUrl, imageRaw) : null;

    return json({
      url: finalUrl,
      title: decodeHtml(title),
      description: decodeHtml(description),
      image: image || undefined,
      siteName: decodeHtml(siteName).replace(/^@/, ""),
    }, 200, SUCCESS_CACHE_HEADERS);
  } catch (error) {
    console.error("[link-preview] failed", error);
    return json({ failed: true }, 200, FAILURE_CACHE_HEADERS);
  }
});
