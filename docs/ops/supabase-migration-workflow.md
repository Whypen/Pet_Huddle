# Supabase Migration Workflow

This repo should not rely on `supabase ... --linked` for migration work from this machine.

Reason:
- linked migration commands use Supabase temp-role auth against the pooler
- that path intermittently fails with:
  - `FATAL: Circuit breaker open: Too many authentication errors`
- the direct database host avoids that breaker, but requires working IPv6

## Rule

Use:

```bash
SUPABASE_DB_PASSWORD='...' scripts/ops/supabase_db_push_once.sh
```

Do not use:

```bash
supabase migration list --linked
supabase db push --linked
```

unless you are intentionally debugging linked auth behavior.

## Connection modes

The script supports:

- `SUPABASE_DB_MODE=auto`
  - default
  - prefers direct host
  - fails if direct host is unavailable unless pooler fallback is explicitly enabled
- `SUPABASE_DB_MODE=direct`
  - requires direct host
  - safest mode when IPv6 is available
- `SUPABASE_DB_MODE=pooler`
  - forces pooler
  - use only when you knowingly accept circuit-breaker risk

Pooler fallback is disabled by default.

To allow it explicitly:

```bash
SUPABASE_DB_PASSWORD='...' \
SUPABASE_ALLOW_POOLER_FALLBACK=true \
scripts/ops/supabase_db_push_once.sh
```

## Expected proof bundle

The script always runs:

1. `psql` preflight
2. `supabase migration list --db-url ...`
3. `supabase db push --db-url ...`
4. `supabase migration list --db-url ...`

That keeps migration proof on the exact same connection path used for the push.

## Current project defaults

- project ref: `ztrbourwcnhrpmzwlrcn`
- direct host: `db.ztrbourwcnhrpmzwlrcn.supabase.co`
- pooler host: `aws-1-ap-south-1.pooler.supabase.com:5432`

## Machine limitation

If the script fails with:

```text
direct DB host is not reachable from this network
```

then this machine currently lacks usable IPv6 routing to the direct host.

In that case, the durable fix is:
- run the script from an IPv6-capable network, or
- run it from a small remote runner/VM with IPv6

That is the recommended long-term setup for this repo.
