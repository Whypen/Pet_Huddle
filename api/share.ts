type MaybeString = string | string[] | undefined;
type RequestShape = {
  headers?: Record<string, MaybeString>;
  query?: Record<string, MaybeString>;
};
type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void };
};
type ThreadRow = { id?: string; content?: string | null; user_id?: string | null };
type ProfileRow = { display_name?: string | null; social_id?: string | null };
type AlertRow = {
  id?: string;
  title?: string | null;
  description?: string | null;
  creator_id?: string | null;
  thread_id?: string | null;
};

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;
const SPACE_PATTERN = /\s+/g;

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

const buildSharePreviewTitle = (displayName?: string | null, socialId?: string | null) => {
  const name = String(displayName || "").trim();
  const social = normalizeSocialId(socialId);
  if (name && social) return `${name} (@${social}) on huddle`;
  if (name) return `${name} on huddle`;
  if (social) return `@${social} on huddle`;
  return "Post on huddle";
};

const buildSharePreviewDescription = (content?: string | null) => {
  const cleaned = cleanContent(content);
  if (!cleaned) return "See this post on huddle.";
  return truncateSoft(cleaned);
};

const buildCanonicalShareId = (shareType: "thread" | "alert", contentId: string) => {
  const normalizedId = String(contentId || "").trim();
  if (!normalizedId) return "";
  return shareType === "thread" ? normalizedId : `alert_${normalizedId}`;
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

const resolveSupabaseConfig = () => {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const apiKey = serviceRoleKey || anonKey;
  if (!url || !apiKey) return null;
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

const fetchThreadPreviewData = async (threadId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !threadId) return null;

  const threadUrl = `${config.url}/rest/v1/threads?select=id,content,user_id&id=eq.${encodeURIComponent(threadId)}&limit=1`;
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

  return {
    shareType: "thread" as const,
    contentId: String(thread.id),
    title: buildSharePreviewTitle(displayName, socialId),
    description: buildSharePreviewDescription(thread.content),
  };
};

const fetchAlertPreviewData = async (alertId: string) => {
  const config = resolveSupabaseConfig();
  if (!config || !alertId) return null;

  const alertUrl = `${config.url}/rest/v1/broadcast_alerts?select=id,title,description,creator_id,thread_id&id=eq.${encodeURIComponent(alertId)}&limit=1`;
  const alertRows = await fetchJson<AlertRow[]>(alertUrl, config.apiKey);
  const alert = Array.isArray(alertRows) ? alertRows[0] : null;
  if (!alert?.id) return null;

  const linkedThreadId = String(alert.thread_id || "").trim();
  if (linkedThreadId) {
    const threadPreview = await fetchThreadPreviewData(linkedThreadId);
    if (threadPreview) return threadPreview;
  }

  let displayName = "";
  let socialId = "";
  const creatorId = String(alert.creator_id || "").trim();
  if (creatorId) {
    const profileUrl = `${config.url}/rest/v1/profiles?select=display_name,social_id&id=eq.${encodeURIComponent(creatorId)}&limit=1`;
    const profileRows = await fetchJson<ProfileRow[]>(profileUrl, config.apiKey);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    displayName = String(profile?.display_name || "").trim();
    socialId = String(profile?.social_id || "").trim();
  }

  const fallbackSnippet = String(alert.description || alert.title || "").trim();
  return {
    shareType: "alert" as const,
    contentId: String(alert.id),
    title: buildSharePreviewTitle(displayName, socialId),
    description: buildSharePreviewDescription(fallbackSnippet),
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
    return { shareType: "thread" as const, contentId: idFromPath };
  }

  // Backward compatibility for older rewrite format.
  const legacyThread = first(req.query?.thread).trim();
  if (legacyThread) return { shareType: "thread" as const, contentId: legacyThread };
  return null;
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  const host = normalizeHost(req.headers?.["x-forwarded-host"] || req.headers?.host);
  const proto = normalizeProto(req.headers?.["x-forwarded-proto"]);
  const origin = `${proto}://${host}`;

  const parsed = parseShareQuery(req);
  const preview = !parsed
    ? null
    : parsed.shareType === "thread"
      ? await fetchThreadPreviewData(parsed.contentId)
      : await fetchAlertPreviewData(parsed.contentId);
  const title = preview?.title || "Post on huddle";
  const description = preview?.description || "See this post on huddle.";
  const image = `${origin}/huddle-logo.jpg`;
  const shareId = !preview ? "" : buildCanonicalShareId(preview.shareType, preview.contentId);
  const shareUrl = shareId ? `${origin}/share/${encodeURIComponent(shareId)}` : `${origin}/share`;
  const destination = !preview
    ? `${origin}/threads`
    : preview.shareType === "alert"
      ? `${origin}/map`
      : `${origin}/threads?focus=${encodeURIComponent(preview.contentId)}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
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
    </style>
  </head>
  <body>
    <main class="wrap">
      <article class="card">
        <div class="preview"><img src="${escapeHtml(image)}" alt="huddle preview" /></div>
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="desc">${escapeHtml(description)}</p>
        <a class="cta" href="${escapeHtml(destination)}">Open on huddle</a>
      </article>
    </main>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
  res.status(200).send(html);
}
