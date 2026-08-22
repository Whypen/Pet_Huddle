import {
  clampLimit,
  fetchPublicProjection,
  resolvePublicReadConfig,
  setPublicCacheHeaders,
  type ResponseShape,
} from "./_publicRead";
import { checkDistributedRateLimit } from './_distributedRateLimit';
import { isPubliclyVisiblePost } from "./_publicProjectionVisibility.mjs";

type MaybeString = string | string[] | undefined;
type RequestShape = {
  query?: Record<string, MaybeString>;
  headers?: Record<string, MaybeString>;
};

type PublicPost = {
  id: string;
  title: string;
  content: string;
  images: string[];
  likes: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  category: string;
  tags: string[];
  hashtags: string[];
  author_name: string;
  author_avatar_url: string | null;
  author_social_id: string | null;
  author_verification_status: string | null;
  is_sensitive: boolean;
};

const visitorCountry = (req: RequestShape): string => {
  const raw = req.headers?.["x-vercel-ip-country"];
  // Pass the edge's ISO code to the database unchanged. The app's own
  // normalize_country_key function owns code-to-country normalization; doing
  // it again in JavaScript produced "Hong Kong SAR China" instead of the
  // canonical "Hong Kong" key.
  return String((Array.isArray(raw) ? raw[0] : raw) || "").trim().toUpperCase();
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  const rate = await checkDistributedRateLimit(req, 'public-feed', 60);
  if ('retryAfter' in rate) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(rate.unavailable ? 503 : 429).json({ error: rate.unavailable ? 'public_read_unavailable' : 'rate_limited', posts: [] });
    return;
  }
  const config = resolvePublicReadConfig();
  if (!config) {
    res.status(503).json({ error: "public_read_unavailable", posts: [] });
    return;
  }

  const p_limit = clampLimit(req.query?.limit, 20, 50);
  const requestedSort = String(Array.isArray(req.query?.sort) ? req.query?.sort[0] : req.query?.sort || "Latest");
  const sort = requestedSort.toLowerCase() === "trending" ? "Trending" : "Latest";
  const country = visitorCountry(req);
  const { rows, failed } = await fetchPublicProjection<PublicPost>(
    config,
    "get_public_social_feed",
    { p_limit, p_cursor: { ...(country ? { country } : {}), sort } },
  );
  if (failed) {
    res.status(503).json({ error: "public_read_unavailable", posts: [] });
    return;
  }

  setPublicCacheHeaders(res);
  res.status(200).json({
    posts: rows
      .filter(isPubliclyVisiblePost)
      .map((row) => ({ ...row, is_sensitive: row.is_sensitive === true })),
  });
}
