# Edge Runtime Crash Audit (Issue 4)

## What crashed and why

### Observed runtime signals
- Edge logs showed:
  - `wall clock duration warning`
  - `early termination has been triggered`
  - `runtime has escaped from the event loop unexpectedly`
- When this happened, protected identity functions returned `503` to the app.

### Confirmed high-risk path
- `verify-identity` bootstrap calls two functions repeatedly (focus/visibility + polling):
  - `verify-human-challenge` (`action=get`)
  - `create-identity-setup-intent` (`action=status`)
- `create-identity-setup-intent` status previously made outbound Stripe API requests for setup-intent reconciliation.
- That made a frequently-called status endpoint perform expensive network work in Edge runtime isolates.
- Under retries/focus polling this can trip isolate wall-clock termination and destabilize runtime.

### Additional pressure factors
- Multiple Stripe-heavy functions still load Stripe SDK in Edge runtime.
- `health-check` was previously coupled to Stripe checks instead of lightweight infra checks.

## Fixes applied in this pass

1. `create-identity-setup-intent` status is now DB-only (no Stripe call in status path).
2. Stripe REST requests in `create-identity-setup-intent` now use hard timeout (8s) via `AbortController`.
3. `health-check` is now lightweight (Supabase DB reachability only), no Stripe dependency.
4. Added local hardening script:
   - `npm run ops:edge:harden`
   - applies memory/cpu/restart constraints to the Edge Runtime container.

## Why this avoids repeat crashes

- Frequent bootstrap requests now stay cheap and deterministic.
- Expensive Stripe calls only run on explicit card actions (`action=create`) instead of every status check.
- Timeout prevents runaway isolate execution from long network waits.
- Health checks no longer trigger Stripe runtime load on connectivity pings.

## Localized self-hosting plan (recommended final architecture)

To avoid depending on Supabase Edge for heavy flows:

1. Keep Supabase Edge only for:
   - auth-adjacent token checks
   - lightweight routing
   - webhooks with strict idempotency
2. Move heavy billing/verification orchestration to a local service (Node/Bun/Deno server) with:
   - explicit memory limits
   - process manager/supervisor
   - queue/retry controls
3. Use Edge functions as thin proxy/glue to that local service (or call service directly from trusted server paths).

This isolates runtime risk and prevents one heavy function from affecting all function routes.

## Local operations

### Start and harden local stack
```bash
supabase start
npm run ops:edge:harden
```

### Verify container constraints
```bash
docker inspect $(docker ps --format '{{.Names}}' | grep '^supabase_edge_runtime_' | head -n1) \
  --format 'OOMKilled={{.State.OOMKilled}} Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}'
```

### Tail runtime logs
```bash
docker logs -f $(docker ps --format '{{.Names}}' | grep '^supabase_edge_runtime_' | head -n1)
```
