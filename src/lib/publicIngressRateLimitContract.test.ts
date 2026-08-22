import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const api = (name: string) => readFileSync(join(__dirname, '..', '..', 'api', name), 'utf8');
const migration = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20260812125202_distributed_public_ingress_rate_limits.sql'), 'utf8');

describe('distributed public ingress rate limit contract', () => {
  it('gates every database-backed public endpoint and share preview', () => {
    for (const [file, scope] of [
      ['public-feed.ts', 'public-feed'], ['public-groups.ts', 'public-groups'],
      ['public-alerts.ts', 'public-alerts'], ['share.ts', 'share'],
    ]) expect(api(file)).toContain(`checkDistributedRateLimit(req, '${scope}'`);
  });

  it('uses one atomic server-only database boundary', () => {
    expect(migration).toContain('on conflict (scope, key_hash) do update');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('from anon, authenticated');
    expect(migration).toContain("window_started_at < now() - interval '1 day'");
  });

  it('fails closed when the durable limiter is unavailable', () => {
    const limiter = api('_distributedRateLimit.ts');
    expect(limiter).toContain("return { ok: false, retryAfter: 60, unavailable: true }");
    expect(limiter).toContain("setTimeout(() => controller.abort(), 2_000)");
  });

  it('has no per-instance Map limiter', () => {
    expect(api('share.ts')).not.toContain('REQUEST_RATE_BUCKETS');
    expect(api('_distributedRateLimit.ts')).toContain("createHmac('sha256', serviceKey)");
    expect(api('_distributedRateLimit.ts')).toContain('controller.abort()');
  });
});
