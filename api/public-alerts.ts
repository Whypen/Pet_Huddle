import {
  clampLimit,
  fetchPublicProjection,
  resolvePublicReadConfig,
  setPublicCacheHeaders,
  type ResponseShape,
} from "./_publicRead";
import { checkDistributedRateLimit } from './_distributedRateLimit';

type MaybeString = string | string[] | undefined;
type RequestShape = {
  query?: Record<string, MaybeString>;
  headers?: Record<string, MaybeString>;
};

type PublicAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  area: string;
  created_at: string;
};

const headerNumber = (req: RequestShape, name: string, fallback: number): number => {
  const raw = req.headers?.[name];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) ? value : fallback;
};

export default async function handler(req: RequestShape, res: ResponseShape) {
  const rate = await checkDistributedRateLimit(req, 'public-alerts', 60);
  if ('retryAfter' in rate) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(rate.unavailable ? 503 : 429).json({ error: rate.unavailable ? 'public_read_unavailable' : 'rate_limited', alerts: [] });
    return;
  }
  const config = resolvePublicReadConfig();
  if (!config) {
    res.status(503).json({ error: "public_read_unavailable", alerts: [] });
    return;
  }

  const p_bbox = {
    lat: headerNumber(req, "x-vercel-ip-latitude", 22.3193),
    lng: headerNumber(req, "x-vercel-ip-longitude", 114.1694),
    radius_m: 10000,
    limit: clampLimit(req.query?.limit, 100, 200),
  };
  const { rows, failed } = await fetchPublicProjection<PublicAlert>(
    config,
    "get_public_map_alerts",
    { p_bbox },
  );
  if (failed) {
    res.status(503).json({ error: "public_read_unavailable", alerts: [] });
    return;
  }

  setPublicCacheHeaders(res);
  res.status(200).json({ alerts: rows });
}
