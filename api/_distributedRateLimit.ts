import { createHmac } from 'node:crypto';

type MaybeString = string | string[] | undefined;
type RequestShape = { headers?: Record<string, MaybeString> };
export type IngressScope = 'public-feed' | 'public-groups' | 'public-alerts' | 'share';
export type RateLimitDecision = { ok: true } | { ok: false; retryAfter: number; unavailable?: boolean };

const first = (value: MaybeString) => (Array.isArray(value) ? value[0] || '' : value || '');
const clientAddress = (req: RequestShape): string => {
  const headers = req.headers || {};
  const value = first(headers['x-vercel-forwarded-for'])
    || first(headers['x-real-ip'])
    || first(headers['cf-connecting-ip'])
    || first(headers['x-forwarded-for']).split(',').at(-1)
    || 'unknown';
  return value.trim().slice(0, 128) || 'unknown';
};

export async function checkDistributedRateLimit(req: RequestShape, scope: IngressScope, limit: number): Promise<RateLimitDecision> {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return { ok: false, retryAfter: 60, unavailable: true };
  const keyHash = createHmac('sha256', serviceKey)
    .update(`huddle-public-ingress:v1:${scope}:${clientAddress(req)}`).digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/consume_public_ingress_rate_limit`, {
      method: 'POST',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_scope: scope, p_key_hash: keyHash, p_limit: limit, p_window_seconds: 60 }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, retryAfter: 60, unavailable: true };
    const payload = await response.json() as Array<{ allowed?: boolean; retry_after_seconds?: number }>;
    const decision = Array.isArray(payload) ? payload[0] : null;
    if (!decision) return { ok: false, retryAfter: 60, unavailable: true };
    return decision.allowed === false
      ? { ok: false, retryAfter: Math.max(1, Number(decision.retry_after_seconds) || 60) }
      : { ok: true };
  } catch {
    return { ok: false, retryAfter: 60, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }
}
