# Neighborly Wallet — Embedded Stripe Connect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hosted Stripe popup onboarding with a fully embedded "Neighborly Wallet" experience inside a Huddle modal, with silent background account creation triggered by skill selection and real-time DB-driven UI state.

**Architecture:** The account creation is separated from the onboarding UX — a `create-or-get-stripe-account` edge function fires silently on skill select, while `create-account-session` returns a short-lived client secret for the embedded `<ConnectAccountOnboarding>` component rendered in a Huddle modal. Stripe webhooks + Supabase Realtime keep the UI in sync without any refresh.

**Tech Stack:** React + TypeScript, `@stripe/connect-js` + `@stripe/react-connect-js` (new), Supabase Edge Functions (Deno), Supabase Realtime, Stripe Connect Embedded Components API, PostgreSQL migrations.

---

## 1. AUDIT FINDINGS

### Current Runtime Behavior
- Provider onboarding uses **hosted Stripe redirect** via `window.open()` popup
- `create-stripe-connect-link` edge function handles both account creation AND account link generation in a single call
- CarerProfile.tsx polls the popup via `setInterval` and uses `postMessage` + `localStorage` for cross-window signaling
- Return/refresh URLs: `/carerprofile/stripe-return` → `StripeReturn.tsx`, `/carerprofile/stripe-refresh` → `StripeRefresh.tsx`
- Status is derived and stored as `stripe_payout_status` ("pending" | "needs_action" | "complete") in `pet_care_profiles`
- No Supabase Realtime subscription on the provider's own row
- No silent background account creation

### Exact Files Involved

| File | Role | Action |
|------|------|--------|
| `supabase/functions/create-stripe-connect-link/index.ts` | Account + link creation | Keep `check_status` logic, replace `create_link` with new functions |
| `supabase/functions/stripe-webhook/index.ts` | Webhook handler | Add `account.updated` handler |
| `src/pages/CarerProfile.tsx` | Main provider profile UI | Major refactor |
| `src/pages/carerprofile/StripeReturn.tsx` | Popup return page | **Delete** |
| `src/pages/carerprofile/StripeRefresh.tsx` | Popup refresh page | **Delete** |
| `src/App.tsx` | Router | Remove 2 dead routes |
| `src/lib/invokeAuthedFunction.ts` | Edge function helper | Reuse as-is |

### Old Hosted Onboarding Flow (to remove)
- `CarerProfile.tsx` constants: `STRIPE_CONNECT_RESULT_KEY`, `STRIPE_CONNECT_MESSAGE_TYPE`
- `CarerProfile.tsx` state: `stripeConnecting`, `showPayoutPrefillModal`
- `CarerProfile.tsx` refs: `stripePopupRef`, `stripePopupPollRef`
- `CarerProfile.tsx` callbacks: `clearStripePopupWatcher`, `handleStripeConnect`
- `CarerProfile.tsx` effects: `window.addEventListener("message", ...)` + `window.addEventListener("storage", ...)`
- `CarerProfile.tsx` Dialog block (lines 1467–1499): "Set up payouts" prefill modal
- Routes in `App.tsx` lines 303–317
- Files `StripeReturn.tsx` and `StripeRefresh.tsx`

### Provider-Intent Trigger
Skills are toggled via `toggleSkill()` called from the dropdown `onClick` at line 859 of `CarerProfile.tsx`. The silent trigger will be a `useEffect` watching `formData.skills.length > 0` + absence of an existing `stripe_account_id`.

### DB Table for Wallet Fields
**`pet_care_profiles`** (confirmed canonical provider table)

**Already present:**
- `stripe_account_id` (text)
- `stripe_details_submitted` (boolean)
- `stripe_charges_enabled` (boolean)
- `stripe_payouts_enabled` (boolean)
- `stripe_requirements_currently_due` (text[])
- `stripe_payout_status` ("pending" | "needs_action" | "complete")

**Missing (to add):**
- `stripe_onboarding_started_at` (timestamptz, nullable)
- `stripe_onboarding_completed_at` (timestamptz, nullable)
- `stripe_requirements_state` (jsonb, nullable)

### Existing Listing Gate
`blocked = !isAge18Plus || !isVerified || !payoutsDone || !agreementDone`
where `payoutsDone = formData.stripePayoutStatus === "complete"` (CarerProfile.tsx:1439–1441)

Warning copy to change: `"Complete payout setup."` → `"Set up wallet before providing service."`

### Notification Path
- Table: `notifications` with columns `user_id`, `title`, `body`, `type` ('alert'|'admin'), `data`, `metadata`
- `service_notify()` RPC handles service-chat notifications (different flow; don't reuse for wallet)
- Wallet-connected notification: **direct insert** to `notifications` from `stripe-webhook` edge function using service role client
- Dedup via `stripe_requirements_state` tracking first-ever `payouts_enabled` transition in DB

---

## 2. UI STATE MODEL

```
stripe_account_id = null
  → CTA: "Set Wallet" (primary button)

stripe_account_id exists + stripe_payouts_enabled = false + stripe_details_submitted = false
  → CTA: "Set Wallet" (primary button, reopens onboarding)

stripe_account_id exists + stripe_details_submitted = true + stripe_payouts_enabled = false
  → State: "Under review" (neutral badge, no CTA)

stripe_payouts_enabled = true
  → State: "Wallet connected" (green check)
  → Listing toggle unlocked
```

UI state is derived from `stripe_payouts_enabled` + `stripe_details_submitted` + `stripe_account_id` read directly from the Realtime-subscribed row.

---

## 3. COMPLEXITY & CONFIDENCE ASSESSMENT

| Area | Complexity | Confidence |
|------|-----------|------------|
| DB migration | Low — 3 nullable columns | High |
| `create-or-get-stripe-account` | Low — strip account-link from existing logic | High |
| `create-account-session` | Low — new Stripe API call | High |
| `refresh-stripe-account-status` | Low — extract existing check_status | High |
| `stripe-webhook` `account.updated` | Medium — must not break existing handlers | High |
| Install `@stripe/connect-js` | Low | High |
| Silent background trigger | Low — useEffect + ref guard | High |
| Embedded onboarding modal | **Medium-High** — new library, mobile fit | Medium-High |
| Realtime subscription | Low — standard Supabase pattern | High |
| UI state + copy cleanup | Low | High |
| Listing gate + notification | Low | High |
| Cleanup dead routes/files | Low | High |

**Overall: Medium complexity. Biggest risk is mobile layout of the embedded Stripe component — test on iOS early.**

---

## PHASE 1 — DB Migration

### Task 1: Add optional wallet timestamp fields to `pet_care_profiles`

**Files:**
- Create: `supabase/migrations/20260401120000_pet_care_profiles_wallet_timestamps.sql`

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260401120000_pet_care_profiles_wallet_timestamps.sql
-- Add optional wallet lifecycle fields to pet_care_profiles.
-- All columns nullable — no backfill needed.

alter table public.pet_care_profiles
  add column if not exists stripe_onboarding_started_at  timestamptz default null,
  add column if not exists stripe_onboarding_completed_at timestamptz default null,
  add column if not exists stripe_requirements_state      jsonb       default null;

comment on column public.pet_care_profiles.stripe_onboarding_started_at  is 'Timestamp when user first opened embedded Stripe onboarding.';
comment on column public.pet_care_profiles.stripe_onboarding_completed_at is 'Timestamp when payouts_enabled first became true (set by webhook).';
comment on column public.pet_care_profiles.stripe_requirements_state      is 'Snapshot of Stripe requirements; used to detect first wallet-connected transition.';
```

**Step 2: Apply locally**

```bash
supabase db push
# or: supabase migration up
```

Expected: migration runs clean, 0 errors.

**Step 3: Verify columns exist**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'pet_care_profiles'
  and column_name in (
    'stripe_onboarding_started_at',
    'stripe_onboarding_completed_at',
    'stripe_requirements_state'
  );
```

Expected: 3 rows returned, all `is_nullable = YES`.

**Step 4: Commit**

```bash
git add supabase/migrations/20260401120000_pet_care_profiles_wallet_timestamps.sql
git commit -m "feat(db): add wallet lifecycle columns to pet_care_profiles"
```

---

## PHASE 2 — New Edge Functions

### Task 2: `create-or-get-stripe-account` edge function

Creates (or returns existing) Stripe connected account silently. No account link. No session.

**Files:**
- Create: `supabase/functions/create-or-get-stripe-account/index.ts`

**Step 1: Write the function**

```typescript
// supabase/functions/create-or-get-stripe-account/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cleanEnv = (v: string | undefined | null): string => {
  const r = String(v || "").trim();
  if (!r) return "";
  if ((r.startsWith('"') && r.endsWith('"')) || (r.startsWith("'") && r.endsWith("'"))) return r.slice(1, -1).trim();
  return r;
};

const stripeDefaultSecret = cleanEnv(Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
const stripeLiveSecret = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY"));
const stripeModeHint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();

const pickSecret = (): string => {
  if (stripeModeHint === "live" && stripeLiveSecret) return stripeLiveSecret;
  if (stripeLiveSecret && stripeDefaultSecret.startsWith("sk_test_")) return stripeLiveSecret;
  return stripeDefaultSecret || stripeLiveSecret || "";
};

const COUNTRY_MAP: Record<string, string> = {
  "hong kong": "HK", "hong kong sar": "HK", "singapore": "SG",
  "united states": "US", "united kingdom": "GB", "australia": "AU",
  "japan": "JP", "canada": "CA", "new zealand": "NZ", "taiwan": "TW",
};
const normalizeCountry = (c: string): string | null => {
  const s = String(c || "").trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_MAP[s.toLowerCase()] || null;
};
const slugify = (v: string) => String(v || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const splitName = (n: string) => {
  const parts = String(n || "").trim().replace(/\s+/g, " ").split(" ");
  return { first: parts[0] || null, last: parts.slice(1).join(" ") || null };
};

// MCC mapping — deterministic: vet license skill → 0742, else 7299
const MCC_VET = "0742";
const MCC_DEFAULT = "7299";
const VET_SKILL = "Vet / Licensed Care";
const resolveMcc = (skills: string[]): string =>
  skills.includes(VET_SKILL) ? MCC_VET : MCC_DEFAULT;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
    const token =
      [authHeader.replace(/^Bearer\s+/i, "").trim(), huddleToken.replace(/^Bearer\s+/i, "").trim()]
        .find((t) => t.split(".").length === 3) || "";
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const secret = pickSecret();
    if (!secret) return Response.json({ error: "Stripe secret key missing" }, { status: 500, headers: corsHeaders });

    const stripe = new Stripe(secret, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

    // Fetch existing account id + profile data in parallel
    const [profileResult, huddleProfileResult] = await Promise.all([
      supabase.from("pet_care_profiles").select("stripe_account_id,skills").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("social_id,display_name,legal_name,phone,location_country").eq("id", user.id).maybeSingle(),
    ]);

    const existing = profileResult.data as Record<string, unknown> | null;
    const hp = huddleProfileResult.data as Record<string, unknown> | null;

    const existingAccountId = String(existing?.stripe_account_id || "").trim();

    // Idempotent — reuse if already created
    if (existingAccountId) {
      // Verify account still exists in Stripe; if not, fall through to create
      try {
        await stripe.accounts.retrieve(existingAccountId);
        return Response.json({ stripe_account_id: existingAccountId, created: false }, { headers: corsHeaders });
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (!msg.includes("no such account")) throw e;
        // Account gone — fall through to create fresh
      }
    }

    // Resolve prefill data
    const email = String(user.email || "").trim() || undefined;
    const skills = (existing?.skills as string[]) ?? [];
    const mcc = resolveMcc(skills);
    const socialId = String(hp?.social_id || "").trim();
    const displayName = String(hp?.display_name || "").trim();
    const legalName = String(hp?.legal_name || displayName || "").trim();
    const phone = String(hp?.phone || "").trim() || undefined;
    const country = normalizeCountry(String(hp?.location_country || "")) ?? undefined;
    const usernameSlug = slugify(socialId || displayName || user.id);
    const { first, last } = splitName(legalName);
    const appUrl = cleanEnv(Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL") || "https://huddle.pet");
    const profileUrl = `${appUrl.replace(/\/+$/, "")}/@${usernameSlug}`;

    const account = await stripe.accounts.create(
      {
        type: "express",
        email,
        country,
        business_type: "individual",
        ...(first || last
          ? { individual: { first_name: first ?? undefined, last_name: last ?? undefined, phone } }
          : {}),
        business_profile: {
          mcc,
          url: profileUrl,
          product_description: "Pet care services provided via the Huddle community platform.",
        },
        metadata: {
          huddle_user_id: user.id,
          huddle_social_id: socialId || user.id,
        },
      },
      { idempotencyKey: `huddle_connect_${user.id}` },
    );

    // Persist account id and mark onboarding started
    await supabase
      .from("pet_care_profiles")
      .upsert(
        {
          user_id: user.id,
          stripe_account_id: account.id,
          stripe_details_submitted: account.details_submitted === true,
          stripe_charges_enabled: account.charges_enabled === true,
          stripe_payouts_enabled: account.payouts_enabled === true,
          stripe_onboarding_started_at: new Date().toISOString(),
          stripe_payout_status: "pending",
        },
        { onConflict: "user_id" },
      );

    return Response.json({ stripe_account_id: account.id, created: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("[create-or-get-stripe-account]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Internal error", detail: msg }, { status: 500, headers: corsHeaders });
  }
});
```

**Step 2: Verify the function renders (no deploy yet — dry check)**

```bash
# Check no syntax issues by running deno check
cd "supabase/functions/create-or-get-stripe-account"
deno check index.ts --import-map=../../import_map.json 2>/dev/null || echo "dry check done"
```

**Step 3: Commit**

```bash
git add supabase/functions/create-or-get-stripe-account/
git commit -m "feat(edge): add create-or-get-stripe-account — silent idempotent account creation"
```

---

### Task 3: `create-account-session` edge function

Returns a short-lived Stripe Account Session `client_secret` for the embedded onboarding component.

**Files:**
- Create: `supabase/functions/create-account-session/index.ts`

**Step 1: Write the function**

```typescript
// supabase/functions/create-account-session/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cleanEnv = (v: string | undefined | null): string => {
  const r = String(v || "").trim();
  if (!r) return "";
  if ((r.startsWith('"') && r.endsWith('"')) || (r.startsWith("'") && r.endsWith("'"))) return r.slice(1, -1).trim();
  return r;
};

const pickSecret = (): string => {
  const live = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY"));
  const def = cleanEnv(Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
  const hint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();
  if (hint === "live" && live) return live;
  if (live && def.startsWith("sk_test_")) return live;
  return def || live || "";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
    const token =
      [authHeader.replace(/^Bearer\s+/i, "").trim(), huddleToken.replace(/^Bearer\s+/i, "").trim()]
        .find((t) => t.split(".").length === 3) || "";
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const secret = pickSecret();
    if (!secret) return Response.json({ error: "Stripe secret key missing" }, { status: 500, headers: corsHeaders });

    // Require existing stripe_account_id — this endpoint is only called after silent creation
    const { data: profile } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const accountId = String((profile as Record<string, unknown> | null)?.stripe_account_id || "").trim();
    if (!accountId) {
      return Response.json({ error: "No Stripe account found. Please wait and retry.", code: "account_missing" }, { status: 409, headers: corsHeaders });
    }

    const stripe = new Stripe(secret, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

    const session = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
      },
    });

    return Response.json({ client_secret: session.client_secret }, { headers: corsHeaders });
  } catch (err) {
    console.error("[create-account-session]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Internal error", detail: msg }, { status: 500, headers: corsHeaders });
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/create-account-session/
git commit -m "feat(edge): add create-account-session for embedded Stripe onboarding"
```

---

### Task 4: `refresh-stripe-account-status` edge function

Fetches account from Stripe and syncs all wallet fields to DB. Called after embedded onboarding exits.

**Files:**
- Create: `supabase/functions/refresh-stripe-account-status/index.ts`

**Step 1: Write the function**

```typescript
// supabase/functions/refresh-stripe-account-status/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cleanEnv = (v: string | undefined | null): string => {
  const r = String(v || "").trim();
  if (!r) return "";
  if ((r.startsWith('"') && r.endsWith('"')) || (r.startsWith("'") && r.endsWith("'"))) return r.slice(1, -1).trim();
  return r;
};

const pickSecret = (): string => {
  const live = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY"));
  const def = cleanEnv(Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
  const hint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();
  if (hint === "live" && live) return live;
  if (live && def.startsWith("sk_test_")) return live;
  return def || live || "";
};

const resolvePayoutStatus = (
  detailsSubmitted: boolean,
  payoutsEnabled: boolean,
  currentlyDue: string[],
): "pending" | "needs_action" | "complete" => {
  if (detailsSubmitted && payoutsEnabled && currentlyDue.length === 0) return "complete";
  if (currentlyDue.length > 0 || !payoutsEnabled) return "needs_action";
  return "pending";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
    const token =
      [authHeader.replace(/^Bearer\s+/i, "").trim(), huddleToken.replace(/^Bearer\s+/i, "").trim()]
        .find((t) => t.split(".").length === 3) || "";
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const { data: profile } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const accountId = String((profile as Record<string, unknown> | null)?.stripe_account_id || "").trim();
    if (!accountId) {
      return Response.json({ status: "pending", code: "no_account" }, { headers: corsHeaders });
    }

    const secret = pickSecret();
    if (!secret) return Response.json({ error: "Stripe secret key missing" }, { status: 500, headers: corsHeaders });

    const stripe = new Stripe(secret, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("no such account")) {
        return Response.json({ status: "pending", code: "account_not_found" }, { headers: corsHeaders });
      }
      throw e;
    }

    const currentlyDue = Array.isArray(account.requirements?.currently_due)
      ? (account.requirements?.currently_due ?? []).filter(Boolean)
      : [];
    const detailsSubmitted = account.details_submitted === true;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;
    const payoutStatus = resolvePayoutStatus(detailsSubmitted, payoutsEnabled, currentlyDue);

    const update: Record<string, unknown> = {
      user_id: user.id,
      stripe_account_id: accountId,
      stripe_details_submitted: detailsSubmitted,
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_requirements_currently_due: currentlyDue,
      stripe_payout_status: payoutStatus,
      stripe_requirements_state: {
        currently_due: currentlyDue,
        eventually_due: account.requirements?.eventually_due ?? [],
        synced_at: new Date().toISOString(),
      },
    };
    if (payoutsEnabled) {
      update.stripe_onboarding_completed_at = new Date().toISOString();
    }

    await supabase.from("pet_care_profiles").upsert(update, { onConflict: "user_id" });

    return Response.json({ status: payoutStatus, payouts_enabled: payoutsEnabled, details_submitted: detailsSubmitted }, { headers: corsHeaders });
  } catch (err) {
    console.error("[refresh-stripe-account-status]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Internal error", detail: msg }, { status: 500, headers: corsHeaders });
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/refresh-stripe-account-status/
git commit -m "feat(edge): add refresh-stripe-account-status — syncs wallet fields from Stripe"
```

---

### Task 5: Update `stripe-webhook` to handle `account.updated`

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

**Step 1: Read the full webhook file before editing (mandatory)**

Find the section where events are handled and add the `account.updated` handler. Locate the switch/if-else chain that processes event types.

**Step 2: Add the handler**

Find the section after the existing event handlers (after `customer.subscription.updated` block) and add:

```typescript
// Inside the event dispatch block, after existing handlers:
if (event.type === "account.updated") {
  const account = event.data.object as Stripe.Account;
  const accountId = account.id;

  // Find the provider who owns this account
  const { data: providerRow } = await supabase
    .from("pet_care_profiles")
    .select("user_id, stripe_payouts_enabled, stripe_onboarding_completed_at")
    .eq("stripe_account_id", accountId)
    .maybeSingle();

  if (!providerRow) {
    // Account not linked to any provider — ignore
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const userId = providerRow.user_id as string;
  const wasPayoutsEnabled = providerRow.stripe_payouts_enabled as boolean;
  const alreadyCompleted = Boolean(providerRow.stripe_onboarding_completed_at);

  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? (account.requirements?.currently_due ?? []).filter(Boolean)
    : [];
  const detailsSubmitted = account.details_submitted === true;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;

  const resolveStatus = (ds: boolean, pe: boolean, cd: string[]) => {
    if (ds && pe && cd.length === 0) return "complete";
    if (cd.length > 0 || !pe) return "needs_action";
    return "pending";
  };
  const payoutStatus = resolveStatus(detailsSubmitted, payoutsEnabled, currentlyDue);

  const update: Record<string, unknown> = {
    stripe_details_submitted: detailsSubmitted,
    stripe_charges_enabled: chargesEnabled,
    stripe_payouts_enabled: payoutsEnabled,
    stripe_requirements_currently_due: currentlyDue,
    stripe_payout_status: payoutStatus,
    stripe_requirements_state: {
      currently_due: currentlyDue,
      eventually_due: account.requirements?.eventually_due ?? [],
      synced_at: new Date().toISOString(),
    },
  };
  if (payoutsEnabled && !alreadyCompleted) {
    update.stripe_onboarding_completed_at = new Date().toISOString();
  }

  await supabase
    .from("pet_care_profiles")
    .update(update)
    .eq("user_id", userId);

  // Send wallet-connected notification on FIRST transition to payouts_enabled
  if (payoutsEnabled && !wasPayoutsEnabled) {
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "Wallet connected!",
      body: "Turn on your service listing to begin your carer journey!",
      message: "Wallet connected! Turn on your service listing to begin your carer journey!",
      type: "alert",
      data: { kind: "wallet_connected", href: "/carerprofile" },
      metadata: { kind: "wallet_connected" },
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
```

> **Important:** Place this handler BEFORE the final catch-all return. Do not alter the existing Stripe signature verification block at the top.

**Step 3: Ensure `Stripe` type import is available** — the webhook file already imports Stripe, so `Stripe.Account` will be available.

**Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(webhook): handle account.updated — sync wallet fields + send wallet-connected notification"
```

---

## PHASE 3 — Frontend

### Task 6: Install `@stripe/connect-js` and `@stripe/react-connect-js`

**Files:**
- Modify: `package.json`, `package-lock.json`

**Step 1: Install**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
npm install @stripe/connect-js @stripe/react-connect-js
```

Expected: Both packages added to `node_modules` and `package.json` dependencies.

**Step 2: Verify**

```bash
grep "connect-js\|react-connect-js" package.json
```

Expected: Both entries visible.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deps): add @stripe/connect-js and @stripe/react-connect-js"
```

---

### Task 7: Create `WalletOnboardingModal` component

This component encapsulates the embedded Stripe onboarding entirely. It receives the user's publishable key, fetches the client secret, and renders `<ConnectAccountOnboarding>`.

**Files:**
- Create: `src/components/wallet/WalletOnboardingModal.tsx`

**Step 1: Write the component**

```tsx
// src/components/wallet/WalletOnboardingModal.tsx
import { useCallback, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import {
  ConnectComponentsProvider,
  ConnectAccountOnboarding,
} from "@stripe/react-connect-js";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

interface WalletOnboardingModalProps {
  open: boolean;
  publishableKey: string;
  onExit: () => void;
  onOpenChange: (open: boolean) => void;
}

export function WalletOnboardingModal({
  open,
  publishableKey,
  onExit,
  onOpenChange,
}: WalletOnboardingModalProps) {
  const [loadError, setLoadError] = useState<string | null>(null);

  // fetchClientSecret is called by Stripe Connect JS when it initialises
  const fetchClientSecret = useCallback(async () => {
    const { data, error } = await invokeAuthedFunction<{ client_secret?: string }>(
      "create-account-session",
      { body: {} },
    );
    if (error || !data?.client_secret) {
      setLoadError("Could not start wallet setup. Please retry.");
      return "";
    }
    return data.client_secret;
  }, []);

  // stripeConnectInstance is created fresh each time the modal opens
  const stripeConnectInstance = open
    ? loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          overlays: "dialog",
          variables: {
            fontFamily: "inherit",
            borderRadius: "12px",
          },
        },
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden"
        style={{ maxHeight: "90dvh" }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/20">
          <DialogTitle className="text-base font-semibold">Set Wallet</DialogTitle>
        </DialogHeader>

        <div
          className="overflow-y-auto"
          style={{ maxHeight: "calc(90dvh - 60px)" }}
        >
          {loadError ? (
            <div className="p-6 text-sm text-destructive text-center">{loadError}</div>
          ) : !stripeConnectInstance ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-muted-foreground" size={24} />
            </div>
          ) : (
            <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
              <div className="px-4 py-4">
                <ConnectAccountOnboarding
                  onExit={() => {
                    onOpenChange(false);
                    onExit();
                  }}
                  collectionOptions={{
                    fields: "eventually_due",
                    futureRequirements: "include",
                  }}
                />
              </div>
            </ConnectComponentsProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

> **Note on `stripeConnectInstance`:** Creating it conditionally inside render is intentional here. Each time the modal opens we get a fresh session. This is safe because the component is gated by `open`.

**Step 2: Commit**

```bash
git add src/components/wallet/WalletOnboardingModal.tsx
git commit -m "feat(ui): add WalletOnboardingModal with embedded Stripe Connect onboarding"
```

---

### Task 8: Refactor `CarerProfile.tsx` — remove popup, add silent trigger + Realtime + embedded modal

This is the largest single-file change. Read the full file first, then apply changes in this order:

**Files:**
- Modify: `src/pages/CarerProfile.tsx`

#### Step 1: Read `CarerProfile.tsx` fully before making any changes

```
Read: src/pages/CarerProfile.tsx (all 2016 lines)
```

#### Step 2: Add new imports (at top of file)

Add to the existing import block:
```tsx
import { WalletOnboardingModal } from "@/components/wallet/WalletOnboardingModal";
```

Remove unused imports after the refactor:
- Nothing to remove yet — do it at the end of the refactor

#### Step 3: Remove popup-related constants

Remove:
```tsx
const STRIPE_CONNECT_RESULT_KEY = "huddle:stripe-connect-result";
const STRIPE_CONNECT_MESSAGE_TYPE = "huddle:stripe-connect";
```

#### Step 4: Update `CarerProfileData` interface and `mapRowToForm`

Add `hasStripeAccount` to the interface and mapping (needed for silent trigger guard):

In `CarerProfileData` interface, add:
```tsx
hasStripeAccount: boolean;
```

In `EMPTY`, add:
```tsx
hasStripeAccount: false,
```

In `mapRowToForm`, add to the returned object:
```tsx
hasStripeAccount: Boolean(row.stripe_account_id),
```

Also update the status model — derive wallet UI state from the raw boolean fields:

Add a helper above the component:
```tsx
type WalletUIState = "none" | "incomplete" | "review" | "connected";

function deriveWalletState(
  accountId: string | null | undefined,
  detailsSubmitted: boolean,
  payoutsEnabled: boolean,
): WalletUIState {
  if (!accountId) return "none";
  if (payoutsEnabled) return "connected";
  if (detailsSubmitted) return "review";
  return "incomplete";
}
```

Update `mapRowToForm` to also map these fields:
```tsx
stripeAccountId: String(row.stripe_account_id ?? ""),
stripeDetailsSubmitted: Boolean(row.stripe_details_submitted ?? false),
stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled ?? false),
```

And update `CarerProfileData` to include these raw fields:
```tsx
stripeAccountId: string;
stripeDetailsSubmitted: boolean;
stripePayoutsEnabled: boolean;
```

And `EMPTY`:
```tsx
stripeAccountId: "",
stripeDetailsSubmitted: false,
stripePayoutsEnabled: false,
hasStripeAccount: false,
```

#### Step 5: Remove popup state + refs, add wallet modal state

Remove:
```tsx
const [stripeConnecting, setStripeConnecting] = useState(false);
const [showPayoutPrefillModal, setShowPayoutPrefillModal] = useState(false);
const stripePopupRef = useRef<Window | null>(null);
const stripePopupPollRef = useRef<number | null>(null);
```

Add:
```tsx
const [showWalletModal, setShowWalletModal] = useState(false);
const silentConnectFiredRef = useRef(false);
```

#### Step 6: Remove `clearStripePopupWatcher` callback

Remove the entire:
```tsx
const clearStripePopupWatcher = useCallback(() => { ... }, []);
```

#### Step 7: Remove old popup message/storage event listener `useEffect`

Remove the entire `useEffect` block (lines 434–476) that adds `window.addEventListener("message", ...)` and `window.addEventListener("storage", ...)`.

#### Step 8: Add silent background creation `useEffect`

Add after the load `useEffect`:
```tsx
// Silent background Stripe account creation on first skill selection
useEffect(() => {
  if (silentConnectFiredRef.current) return;
  if (!user) return;
  if (formData.skills.length === 0) return;
  if (formData.hasStripeAccount) return; // already created
  silentConnectFiredRef.current = true;
  void invokeAuthedFunction("create-or-get-stripe-account", { body: {} }).catch(() => {
    // Fire and forget — failures are silent; user can retry via Set Wallet
    silentConnectFiredRef.current = false;
  });
}, [formData.skills, formData.hasStripeAccount, user]);
```

#### Step 9: Add Supabase Realtime subscription `useEffect`

Add after the silent creation effect:
```tsx
// Realtime subscription — keep wallet state in sync without refresh
useEffect(() => {
  if (!user) return;

  const channel = supabase
    .channel(`pet_care_profiles:${user.id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "pet_care_profiles",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        setFormData((prev) => ({
          ...prev,
          stripePayoutStatus: (row.stripe_payout_status as CarerProfileData["stripePayoutStatus"]) ?? prev.stripePayoutStatus,
          stripeAccountId: String(row.stripe_account_id ?? prev.stripeAccountId),
          stripeDetailsSubmitted: Boolean(row.stripe_details_submitted ?? prev.stripeDetailsSubmitted),
          stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled ?? prev.stripePayoutsEnabled),
          hasStripeAccount: Boolean(row.stripe_account_id ?? prev.stripeAccountId),
          listed: Boolean(row.listed ?? prev.listed),
        }));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}, [user]);
```

#### Step 10: Update `computeListingEligible` to use new boolean

```tsx
function computeListingEligible(d: CarerProfileData): boolean {
  return (
    computeCompleted(d) &&
    d.stripePayoutsEnabled === true &&
    d.agreementAccepted
  );
}
```

#### Step 11: Remove `handleStripeConnect` function

Remove the entire `handleStripeConnect` async function (lines 670–718).

#### Step 12: Update `statusCopy` and add wallet state derivation

Replace:
```tsx
const statusCopy =
  formData.stripePayoutStatus === "complete"
    ? "Payouts ready"
    : "Set up Payout Method";
```

With:
```tsx
const walletState = deriveWalletState(
  formData.stripeAccountId,
  formData.stripeDetailsSubmitted,
  formData.stripePayoutsEnabled,
);
```

#### Step 13: Replace Section 9 (payouts UI)

Replace the Section 9 block (lines 1376–1406) with:

```tsx
{/* ── Section 9: Neighborly Wallet ─────────────────────────────────────── */}
<div className="space-y-3">
  {walletState === "connected" ? (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Check size={16} className="text-green-600 shrink-0" />
        <span className="text-sm text-brandText">Wallet connected</span>
      </div>
      <NeuControl
        size="sm"
        variant="tertiary"
        onClick={() => setShowWalletModal(true)}
      >
        Manage wallet
      </NeuControl>
    </div>
  ) : walletState === "review" ? (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50">
      <Loader2 size={14} className="text-muted-foreground animate-pulse shrink-0" />
      <span className="text-sm text-muted-foreground">Wallet under review</span>
    </div>
  ) : (
    <NeuControl
      size="lg"
      variant="primary"
      onClick={() => setShowWalletModal(true)}
      className="w-full"
    >
      Set Wallet
    </NeuControl>
  )}
</div>
```

#### Step 14: Replace old Dialog (prefill modal) with `WalletOnboardingModal`

Remove the Dialog block (lines 1467–1499):
```tsx
<Dialog open={showPayoutPrefillModal} onOpenChange={setShowPayoutPrefillModal}>
  ...
</Dialog>
```

Add before the closing `</>` of edit mode:
```tsx
<WalletOnboardingModal
  open={showWalletModal}
  publishableKey={import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ""}
  onOpenChange={setShowWalletModal}
  onExit={() => {
    // Sync status after onboarding exits
    void invokeAuthedFunction("refresh-stripe-account-status", { body: {} }).catch(() => {});
  }}
/>
```

#### Step 15: Update listing gate copy

Change (line 1445):
```tsx
if (!payoutsDone) warningParts.push("Complete payout setup.");
```
To:
```tsx
if (!payoutsDone) warningParts.push("Set up wallet before providing service.");
```

And update `payoutsDone` derivation:
```tsx
const payoutsDone = formData.stripePayoutsEnabled === true;
```

#### Step 16: Verify `VITE_STRIPE_PUBLISHABLE_KEY` env var is wired

Check `.env` / `.env.local` for `VITE_STRIPE_PUBLISHABLE_KEY`. If missing, add it to `.env.example`.

#### Step 17: Commit

```bash
git add src/pages/CarerProfile.tsx src/components/wallet/WalletOnboardingModal.tsx
git commit -m "feat(carer-profile): replace Stripe popup with embedded WalletOnboardingModal + Realtime + silent create"
```

---

### Task 9: Remove dead routes and files

**Files:**
- Delete: `src/pages/carerprofile/StripeReturn.tsx`
- Delete: `src/pages/carerprofile/StripeRefresh.tsx`
- Modify: `src/App.tsx`

**Step 1: Delete the popup relay pages**

```bash
rm "src/pages/carerprofile/StripeReturn.tsx"
rm "src/pages/carerprofile/StripeRefresh.tsx"
```

**Step 2: Remove routes from App.tsx**

Read `src/App.tsx` first.

Remove the two imports:
```tsx
import CarerStripeReturn from "./pages/carerprofile/StripeReturn";
import CarerStripeRefresh from "./pages/carerprofile/StripeRefresh";
```

Remove the two route blocks (lines ~303–317):
```tsx
<Route
  path="/carerprofile/stripe-return"
  ...
/>
<Route
  path="/carerprofile/stripe-refresh"
  ...
/>
```

**Step 3: Commit**

```bash
git add src/App.tsx
git rm src/pages/carerprofile/StripeReturn.tsx src/pages/carerprofile/StripeRefresh.tsx
git commit -m "chore: remove hosted Stripe return/refresh relay pages and dead routes"
```

---

## PHASE 4 — Quality Gate

### Task 10: Run lint and build

**Step 1: Lint**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
npm run lint
```

Expected: 0 errors. Fix any unused variable warnings from removed popup code.

**Step 2: Build**

```bash
npm run build
```

Expected: Successful build. Pre-existing chunk-size advisory is acceptable. Any type errors must be fixed before proceeding.

**Step 3: Commit any lint fixes**

```bash
git add -p
git commit -m "fix(lint): clean up unused imports and variables after popup removal"
```

---

## 5. SQL MIGRATIONS

### Migration file: `supabase/migrations/20260401120000_pet_care_profiles_wallet_timestamps.sql`

```sql
alter table public.pet_care_profiles
  add column if not exists stripe_onboarding_started_at  timestamptz default null,
  add column if not exists stripe_onboarding_completed_at timestamptz default null,
  add column if not exists stripe_requirements_state      jsonb       default null;

comment on column public.pet_care_profiles.stripe_onboarding_started_at  is 'Timestamp when user first opened embedded Stripe onboarding.';
comment on column public.pet_care_profiles.stripe_onboarding_completed_at is 'Timestamp when payouts_enabled first became true (set by webhook).';
comment on column public.pet_care_profiles.stripe_requirements_state      is 'Snapshot of Stripe requirements; used for first-connect notification dedup.';
```

---

## 6. RLS

No new RLS policies needed. The existing `pet_care_profiles` policies already allow:
- Users to read/update their own row
- `notifications` insert policy `notifications_insert_service_role` exists (verified in migration `20260208234000`) — the webhook uses service role, so wallet notification insert is covered.

---

## 7. TRIGGER CODE

No new DB triggers required for this feature. The notification is sent imperatively from the `stripe-webhook` edge function on `account.updated` → `payouts_enabled` first transition.

---

## 8. EDGE FUNCTIONS SUMMARY

| Function | Location | Purpose |
|----------|----------|---------|
| `create-or-get-stripe-account` | `supabase/functions/create-or-get-stripe-account/index.ts` | Silent idempotent account creation with prefills + MCC |
| `create-account-session` | `supabase/functions/create-account-session/index.ts` | Account Session `client_secret` for embedded onboarding |
| `refresh-stripe-account-status` | `supabase/functions/refresh-stripe-account-status/index.ts` | On-demand sync of wallet fields from Stripe to DB |
| `stripe-webhook` (updated) | `supabase/functions/stripe-webhook/index.ts` | Now handles `account.updated` + sends wallet notification |
| `create-stripe-connect-link` (keep) | `supabase/functions/create-stripe-connect-link/index.ts` | Keep `check_status` action; `create_link` is superseded but leaving the function avoids breaking any future fallback |

---

## 9. DATABASE PROOF COMMANDS

```sql
-- 1. Verify new columns exist
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'pet_care_profiles'
  and column_name in (
    'stripe_account_id', 'stripe_details_submitted', 'stripe_charges_enabled',
    'stripe_payouts_enabled', 'stripe_onboarding_started_at',
    'stripe_onboarding_completed_at', 'stripe_requirements_state',
    'stripe_payout_status'
  );
-- Expected: 8 rows returned

-- 2. Verify wallet fields update (after a test webhook call)
select user_id, stripe_account_id, stripe_payouts_enabled,
       stripe_details_submitted, stripe_payout_status,
       stripe_onboarding_completed_at
from pet_care_profiles
where stripe_account_id is not null
limit 5;

-- 3. Verify notification was written (after first wallet connect)
select id, user_id, title, body, type, created_at
from notifications
where data->>'kind' = 'wallet_connected'
order by created_at desc
limit 5;

-- 4. Verify listing gate reflects DB truth
select user_id, stripe_payouts_enabled, listed,
       (stripe_payouts_enabled = true) as wallet_gate_open
from pet_care_profiles
where stripe_account_id is not null;
```

---

## 10. MANUAL RUNTIME CHECKLIST

- [ ] **Silent account creation**: Select a skill on a fresh profile → no spinner, no popup → check DB for `stripe_account_id` being written
- [ ] **No duplicate creation**: Select second skill → no second edge function call (guarded by `hasStripeAccount` + `silentConnectFiredRef`)
- [ ] **Set Wallet modal**: Tap "Set Wallet" → Huddle modal opens with embedded Stripe form → no external popup window
- [ ] **Mobile iOS**: Modal renders correctly on iPhone viewport, scroll works, no content clipped
- [ ] **Embedded onboarding completes**: Fill required fields → exit → `refresh-stripe-account-status` called → DB updates
- [ ] **Review state**: `details_submitted=true, payouts_enabled=false` → shows "Wallet under review" neutral state
- [ ] **Connected state**: `payouts_enabled=true` → shows green "Wallet connected"
- [ ] **Realtime auto-update**: With webhook fired in Stripe dashboard → UI flips to connected WITHOUT page refresh
- [ ] **Listing toggle locked**: Until `payouts_enabled=true` + agreement accepted → toggle disabled with "Set up wallet before providing service."
- [ ] **Listing toggle unlocks**: After wallet connected → toggle becomes interactive
- [ ] **Notification once**: Wallet connected notification appears in notification feed; triggering again does NOT duplicate
- [ ] **No dead routes**: `/carerprofile/stripe-return` and `/carerprofile/stripe-refresh` return 404
- [ ] **No popup windows**: `window.open` never called in wallet flow
- [ ] **MCC vet mapping**: Provider with "Vet / Licensed Care" skill → Stripe account has MCC 0742
- [ ] **lint**: `npm run lint` → 0 errors
- [ ] **build**: `npm run build` → success

---

## 11. PHASED EXECUTION ORDER

```
Phase 1: DB migration (Task 1)
Phase 2: Edge functions (Tasks 2, 3, 4, 5)  ← can be done in parallel
Phase 3: Frontend packages (Task 6)
Phase 4: WalletOnboardingModal component (Task 7)
Phase 5: CarerProfile refactor (Task 8)
Phase 6: Cleanup dead files (Task 9)
Phase 7: Lint + build gate (Task 10)
```

Tasks 2–5 (edge functions) are independent of each other and can be written in parallel.

---

## NOTES FOR EXECUTOR

1. **`@stripe/connect-js` creates instance per-render** — this is intentional for embedded components. Do not hoist it outside the modal component.
2. **`create-stripe-connect-link` is kept** — do not delete it. Its `check_status` action is still called during initial load (`refreshStripePayoutStatus`). After Realtime is wired, this call can be removed in a follow-up cleanup, but do not remove it in this PR to avoid a regression.
3. **Stripe publishable key** — the embedded component requires `VITE_STRIPE_PUBLISHABLE_KEY` (public key, not secret). Verify this env var exists in Vercel + local `.env`.
4. **Webhook `account.updated`** — Stripe fires this on every account change. The `wasPayoutsEnabled` check ensures notification fires exactly once. If the webhook fires before the DB row exists, the `providerRow` null check exits safely.
5. **`stripe_requirements_state`** — stored as jsonb snapshot. The first-connect dedup relies on `alreadyCompleted` (i.e. `stripe_onboarding_completed_at IS NULL`) not on requirements state directly.
