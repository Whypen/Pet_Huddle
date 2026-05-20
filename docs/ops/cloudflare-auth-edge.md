# Cloudflare Auth/OTP Edge Setup

## Architecture
- Public protected routes are served from `https://api.huddle.pet/functions/v1/*`.
- `api.huddle.pet` is a Cloudflare-proxied CNAME to Supabase project host (`<project>.supabase.co`).
- Browser auth/OTP calls use `VITE_PUBLIC_AUTH_BASE_URL` (or fallback `VITE_API_URL`) so Cloudflare can apply WAF/rate limits before Supabase/Twilio.
- No Worker/KV/Durable Objects in this pass.

## Required env
- Frontend:
  - `VITE_PUBLIC_AUTH_BASE_URL=https://api.huddle.pet/functions/v1`
  - keep `VITE_SUPABASE_URL` unchanged for Supabase JS auth/session APIs
- Ops shell:
  - `CF_API_TOKEN`
  - `CF_ZONE_ID`
  - `SUPABASE_FUNCTIONS_ORIGIN=https://ztrbourwcnhrpmzwlrcn.supabase.co`

## Apply Cloudflare config
```bash
node scripts/ops/cloudflare_auth_edge_setup.mjs
```

This script:
- creates/updates proxied DNS `api.huddle.pet -> ztrbourwcnhrpmzwlrcn.supabase.co`
- creates/updates `http_ratelimit` rules for:
  - `/functions/v1/send-phone-otp`
  - `/functions/v1/send-pre-signup-verify`
  - `/functions/v1/auth-login`
  - `/functions/v1/auth-signup`
  - `/functions/v1/auth-reset-password`
  - `/functions/v1/auth-change-password`

## Smoke validation
```bash
PUBLIC_AUTH_BASE_URL=https://api.huddle.pet/functions/v1 \
SUPABASE_ANON_KEY=... \
node scripts/ops/cloudflare_auth_edge_smoke.mjs
```

Look for:
- `cf_ray` present for all OPTIONS/POST checks
- OPTIONS status `200`
- invalid token checks return `403` (human verification failed)

