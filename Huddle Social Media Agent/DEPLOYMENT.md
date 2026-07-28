# Growth Agent deployment and Meta handoff

## Supabase Function secrets

Set these as Supabase Function secrets. Never add them to `.env`, Git, the
frontend, screenshots, logs, or chat.

```sh
supabase secrets set \
  META_APP_ID=1935468547745133 \
  THREADS_APP_ID=1025693406835613 \
  META_APP_SECRET='...' \
  THREADS_APP_SECRET='...' \
  META_TOKEN_ENCRYPTION_KEY='a-long-random-secret' \
  META_WEBHOOK_VERIFY_TOKEN='a-different-random-secret' \
  GROWTH_WORKER_SECRET='a-third-random-secret' \
  OPENAI_API_KEY='...' \
  OPENAI_GROWTH_MODEL='gpt-5.2' \
  META_OAUTH_REDIRECT_URI='https://api.huddle.pet/functions/v1/huddle-growth' \
  THREADS_OAUTH_REDIRECT_URI='https://api.huddle.pet/functions/v1/huddle-growth' \
  APP_URL='https://huddle.pet' \
  GROWTH_ALLOWED_ORIGIN='https://huddle.pet'
```

Register the exact callback above in both the Meta and Threads app settings.
The provider is stored in the signed OAuth state, so one callback endpoint is
intentional. The `/auth/meta/callback` and `/auth/threads/callback` paths from
the supplied secrets file are not routes on this deployment.

`META_TOKEN_ENCRYPTION_KEY` is hashed to a 256-bit AES-GCM key. Losing it makes
stored connection tokens unrecoverable; revoke and reconnect those assets rather
than attempting to recover ciphertext.

`THREADS_APP_SECRET` must be the Threads App Secret shown under the main app's
Threads API settings. It is distinct from `META_APP_SECRET`; using the Meta
App Secret causes the Threads OAuth client-credentials check to fail.

## Migration and functions

Run the migration using the repository's normal Supabase workflow, then deploy:

```sh
supabase db push
supabase functions deploy huddle-growth --no-verify-jwt
supabase functions deploy huddle-growth-webhook --no-verify-jwt
```

The function validates admin JWTs itself. The webhook validates Meta's
`X-Hub-Signature-256` with `META_APP_SECRET`. Queue workers require the separate
`GROWTH_WORKER_SECRET` header and must never be exposed to the browser.

## Meta app configuration

In the Meta app named `huddle social manager`:

1. Keep the app in Development while connecting the Huddle-owned test assets.
2. Add the exact OAuth redirect URLs and `https://huddle.pet/legal/privacy`.
3. Request only the capabilities Huddle actually uses. The function stores
   Meta's granted permissions and fails closed when an action's required scope
   is absent.
4. Link the Professional Instagram account to the Huddle Facebook Page before
   enabling Instagram publishing.
5. Add the webhook URL
   `https://<supabase-project-ref>.supabase.co/functions/v1/huddle-growth-webhook`
   and the same verify token. Subscribe only to fields needed for Huddle's
   business Page, Instagram Professional account, and WhatsApp Business number.
6. Add the Huddle Business Portfolio, Page, ad account, WABA, and phone number
   as app/test assets before requesting review.

## Queue scheduling

Invoke `huddle-growth` with `operation=run_worker` from a protected scheduler:

```sh
curl -X POST 'https://<supabase-project-ref>.supabase.co/functions/v1/huddle-growth' \
  -H 'Content-Type: application/json' \
  -H 'x-growth-worker-secret: <GROWTH_WORKER_SECRET>' \
  --data '{"operation":"run_worker"}'
```

Run this every minute for the action queue and less frequently for insights and
lead-sync jobs. Configure the scheduler in the hosting environment; do not put
the worker secret in Vite variables.

## Verification

```sh
deno test --allow-env supabase/functions/_shared/huddleGrowth.test.ts
deno check supabase/functions/huddle-growth/index.ts
deno check supabase/functions/huddle-growth-webhook/index.ts
npm run build
```

## Safe rollout

1. Apply the migration and deploy functions.
2. Connect only Huddle-owned Development-mode assets.
3. Confirm the admin screen shows the *granted* scopes and discovered IDs.
4. Set daily/monthly spend caps before queueing any paid action.
5. Test a low-risk text post in a controlled asset, then verify the audit row
   and external post ID.
6. Keep emergency stop available during the first scheduled worker run.
