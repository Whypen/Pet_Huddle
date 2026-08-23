import {
  fetchPublicProjection,
  resolvePublicCountry,
  resolvePublicReadConfig,
  setPublicCacheHeaders,
  type ResponseShape,
} from "./_publicRead.js";
import { checkDistributedRateLimit } from './_distributedRateLimit.js';

type MaybeString = string | string[] | undefined;
type RequestShape = { headers?: Record<string, MaybeString> };

type PublicGroup = {
  id: string;
  name: string;
  description: string;
  cover_url: string | null;
  area: string;
  country: string;
  pet_focus: string[];
  member_count: number;
  next_event_title: string | null;
  next_event_starts_at: string | null;
  next_event_ends_at: string | null;
};

const header = (req: RequestShape, name: string): string => {
  const raw = req.headers?.[name];
  const value = String((Array.isArray(raw) ? raw[0] : raw) || "").trim();
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  const rate = await checkDistributedRateLimit(req, 'public-groups', 60);
  if ('retryAfter' in rate) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(rate.unavailable ? 503 : 429).json({ error: rate.unavailable ? 'public_read_unavailable' : 'rate_limited', groups: [] });
    return;
  }
  const config = resolvePublicReadConfig();
  if (!config) {
    res.status(503).json({ error: "public_read_unavailable", groups: [] });
    return;
  }

  // Country is the public projection boundary. `x-vercel-ip-country-region`
  // is a subdivision (for example `ENG` in the UK), not a country.
  const p_country = resolvePublicCountry(header(req, "x-vercel-ip-country"));
  if (!p_country) {
    setPublicCacheHeaders(res);
    res.status(200).json({ groups: [] });
    return;
  }
  const p_district = header(req, "x-vercel-ip-city") || header(req, "x-vercel-ip-country-region") || null;
  const { rows, failed } = await fetchPublicProjection<PublicGroup>(
    config,
    "get_public_groups_nearby",
    { p_country, p_district },
  );
  if (failed) {
    res.status(503).json({ error: "public_read_unavailable", groups: [] });
    return;
  }

  setPublicCacheHeaders(res);
  // The RPC owns public visibility and the narrow anonymous response shape.
  res.status(200).json({ groups: rows });
}
