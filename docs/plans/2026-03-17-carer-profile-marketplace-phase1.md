# Carer Profile Marketplace — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend CarerProfile with marketplace sections (Services, Pet Types, Price, Payouts, Agreement, Listing gate) and swap BottomNav to Home/Service.

**Architecture:** Single-page CarerProfile refactor (src/pages/CarerProfile.tsx) with new DB columns, one new Stripe Connect edge function (create-stripe-connect-link), two thin return/refresh route pages, and a blank Service page placeholder. All state lives in existing `pet_care_profiles` upsert pattern.

**Tech Stack:** React + TypeScript, Supabase (postgres + edge functions), Stripe Connect Express, lucide-react chips/icons, existing NeuControl/form-field-rest/neu-chip design tokens.

---

## Pre-flight: current state summary

- `src/pages/CarerProfile.tsx` — has sections 1, 2, 5, 7. Emergency Readiness currently lives inside Availability.
- `pet_care_profiles` table — missing: services_offered, pet_types, dog_sizes, starting_price, currency, rates, stripe_account_id, stripe_payout_status, agreement_accepted, agreement_accepted_at, agreement_version, listed.
- `src/components/layout/BottomNav.tsx` — `PawPrint/"Pet"/"/"` and `Stethoscope/"AI Vet"/"/ai-vet"` need changing.
- `src/App.tsx` — needs /service, /carerprofile/stripe-return, /carerprofile/stripe-refresh routes.
- `src/legal/service-provider-agreement.html` — exists, use agreement version `"1.0"`.

---

## Task 1: DB Migration — new columns on pet_care_profiles

**Files:**
- Create: `supabase/migrations/20260317150000_carer_profile_phase1_columns.sql`

**Step 1: Write migration**

```sql
-- Phase 1: marketplace columns for pet_care_profiles
alter table public.pet_care_profiles
  add column if not exists services_offered  text[]   not null default '{}',
  add column if not exists services_other    text,
  add column if not exists pet_types         text[]   not null default '{}',
  add column if not exists dog_sizes         text[]   not null default '{}',
  add column if not exists starting_price    numeric,
  add column if not exists currency          text,
  add column if not exists rates             text[]   not null default '{}',
  add column if not exists stripe_account_id text,
  add column if not exists stripe_payout_status text
    check (stripe_payout_status in ('pending','complete')),
  add column if not exists agreement_accepted     boolean     not null default false,
  add column if not exists agreement_accepted_at  timestamptz,
  add column if not exists agreement_version      text,
  add column if not exists listed                 boolean     not null default false;
```

**Step 2: Apply via Supabase MCP**

Use `mcp__2e2b9a1b-66ab-4bd4-95e7-f78ed60a63fe__apply_migration` with the SQL above.

**Step 3: Verify**

Use `mcp__2e2b9a1b-66ab-4bd4-95e7-f78ed60a63fe__execute_sql` — `select column_name from information_schema.columns where table_name='pet_care_profiles' order by ordinal_position;` — confirm all 13 new columns present.

---

## Task 2: BottomNav — swap Pet→Home, AI Vet→Service

**Files:**
- Modify: `src/components/layout/BottomNav.tsx`

**Step 1: Read the file** (already read — reference lines 10–22)

**Step 2: Edit navItems**

Change import line 10:
```tsx
import { Home, Users, MessageCircle, PawPrint, MapPin } from "lucide-react";
```

Change navItems array (lines 16–22):
```tsx
const navItems = [
  { icon: Home,          label: "Home",          path: "/" },
  { icon: Users,         label: "nav.social",    path: "/social" },
  { icon: MessageCircle, label: "nav.chats",     path: "/chats" },
  { icon: PawPrint,      label: "Service",       path: "/service" },
  { icon: MapPin,        label: "nav.map",       path: "/map" },
];
```

**Step 3: Fix label resolution** (line 184 — `resolvedLabel` logic)

```tsx
const resolvedLabel =
  label === "Home" ? "Home"
  : label === "Service" ? "Service"
  : t(label);
```

**Step 4: Verify active state for "/"**

The existing `path === "/"` check on line 182 already handles exact match for Home — no change needed.

---

## Task 3: Service placeholder page + App.tsx routes

**Files:**
- Create: `src/pages/Service.tsx`
- Modify: `src/App.tsx`

**Step 1: Create blank Service page**

```tsx
// src/pages/Service.tsx
import { GlobalHeader } from "@/components/layout/GlobalHeader";

const Service = () => (
  <div className="h-full flex flex-col overflow-hidden">
    <GlobalHeader />
    <div className="flex-1 flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Service coming soon.</p>
    </div>
  </div>
);

export default Service;
```

**Step 2: Add /service route to App.tsx**

After the `/marketplace` route block, add:
```tsx
import Service from "./pages/Service";
// ...
<Route
  path="/service"
  element={
    <ProtectedRoute>
      <AppShell>
        <Service />
        <BottomNav />
      </AppShell>
    </ProtectedRoute>
  }
/>
```

**Step 3: Add Stripe return/refresh routes to App.tsx**

```tsx
import CarerStripeReturn from "./pages/carerprofile/StripeReturn";
import CarerStripeRefresh from "./pages/carerprofile/StripeRefresh";
// ...
<Route
  path="/carerprofile/stripe-return"
  element={<ProtectedRoute><AppShell><CarerStripeReturn /></AppShell></ProtectedRoute>}
/>
<Route
  path="/carerprofile/stripe-refresh"
  element={<ProtectedRoute><AppShell><CarerStripeRefresh /></AppShell></ProtectedRoute>}
/>
```

---

## Task 4: Stripe Connect edge function

**Files:**
- Create: `supabase/functions/create-stripe-connect-link/index.ts`

**Step 1: Write function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { action, returnUrl, refreshUrl } = await req.json() as {
      action: "create_link" | "check_status";
      returnUrl?: string;
      refreshUrl?: string;
    };

    const { data: profile } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (action === "create_link") {
      if (!returnUrl || !refreshUrl) {
        return Response.json({ error: "returnUrl and refreshUrl required" }, { status: 400, headers: corsHeaders });
      }

      let accountId = (profile as { stripe_account_id?: string } | null)?.stripe_account_id;

      if (!accountId) {
        const account = await stripe.accounts.create({ type: "express" });
        accountId = account.id;
        await supabase.from("pet_care_profiles").upsert(
          { user_id: user.id, stripe_account_id: accountId },
          { onConflict: "user_id" }
        );
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return Response.json({ url: link.url }, { headers: corsHeaders });
    }

    if (action === "check_status") {
      const accountId = (profile as { stripe_account_id?: string } | null)?.stripe_account_id;
      if (!accountId) {
        return Response.json({ status: "pending" }, { headers: corsHeaders });
      }

      const account = await stripe.accounts.retrieve(accountId);
      const complete = account.details_submitted === true && account.charges_enabled === true;

      if (complete) {
        await supabase
          .from("pet_care_profiles")
          .update({ stripe_payout_status: "complete" })
          .eq("user_id", user.id);
      }

      return Response.json({ status: complete ? "complete" : "pending" }, { headers: corsHeaders });
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("[create-stripe-connect-link]", err);
    return Response.json({ error: "Internal error" }, { status: 500, headers: corsHeaders });
  }
});
```

**Step 2: Deploy via Supabase MCP**

Use `mcp__2e2b9a1b-66ab-4bd4-95e7-f78ed60a63fe__deploy_edge_function` with function name `create-stripe-connect-link`.

---

## Task 5: Stripe Return + Refresh route pages

**Files:**
- Create: `src/pages/carerprofile/StripeReturn.tsx`
- Create: `src/pages/carerprofile/StripeRefresh.tsx`

**Step 1: Create directory**

```bash
mkdir -p "src/pages/carerprofile"
```

**Step 2: StripeReturn.tsx**

On mount: call `check_status`. If complete, navigate to `/carerprofile` with toast success. If pending, navigate to `/carerprofile` with a toast warning. Show a spinner while checking.

```tsx
// src/pages/carerprofile/StripeReturn.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const StripeReturn = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("create-stripe-connect-link", {
          body: { action: "check_status" },
        });
        if (error) throw error;
        if ((data as { status: string }).status === "complete") {
          toast.success("Payouts set up successfully.");
        } else {
          toast.warning("Payout setup not yet complete. Please try again.");
        }
      } catch {
        toast.error("Could not confirm payout status. Please retry.");
      }
      navigate("/carerprofile", { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
};

export default StripeReturn;
```

**Step 3: StripeRefresh.tsx**

On mount: call `create_link` with the same return/refresh URLs. Redirect to new Stripe URL. Show spinner.

```tsx
// src/pages/carerprofile/StripeRefresh.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const StripeRefresh = () => {
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const returnUrl = `${window.location.origin}/carerprofile/stripe-return`;
        const refreshUrl = `${window.location.origin}/carerprofile/stripe-refresh`;
        const { data, error } = await supabase.functions.invoke("create-stripe-connect-link", {
          body: { action: "create_link", returnUrl, refreshUrl },
        });
        if (error) throw error;
        window.location.href = (data as { url: string }).url;
      } catch {
        toast.error("Could not refresh payout link. Please retry.");
        navigate("/carerprofile", { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" size={24} />
    </div>
  );
};

export default StripeRefresh;
```

---

## Task 6: CarerProfile — extend CarerProfileData type + state + constants

**Files:**
- Modify: `src/pages/CarerProfile.tsx`

This task only touches the constants, types, EMPTY, and mapRowToForm — no JSX yet.

**Step 1: Add new constants near top (after LOCATION_STYLES)**

```tsx
const SERVICES_OFFERED = [
  "Boarding", "Walking", "Day Care", "Drop-in", "Grooming",
  "Training", "Vet / Licensed Care", "Transport", "Emergency Help", "Others",
] as const;

const PET_TYPES = [
  "Dogs", "Cats", "Rabbits", "Birds", "Hamsters / Guinea Pigs",
  "Reptiles", "Fish", "Small pets", "Others",
] as const;

const DOG_SIZES = ["Small", "Medium", "Large", "Giant"] as const;

const CURRENCIES = ["USD", "HKD", "GBP", "EUR", "AUD", "SGD", "CAD", "JPY"] as const;

const RATE_OPTIONS = ["Per hour", "Per day"] as const;

const AGREEMENT_VERSION = "1.0";
```

**Step 2: Extend CarerProfileData interface**

Add to the interface (after `areaName`):
```tsx
  servicesOffered: string[];
  servicesOther: string;
  petTypes: string[];
  dogSizes: string[];
  startingPrice: string;
  currency: string;
  rates: string[];
  stripePayoutStatus: "pending" | "complete" | null;
  agreementAccepted: boolean;
  agreementAcceptedAt: string | null;
  listed: boolean;
```

**Step 3: Extend EMPTY**

Add to EMPTY (after `areaName: ""`):
```tsx
  servicesOffered: [],
  servicesOther: "",
  petTypes: [],
  dogSizes: [],
  startingPrice: "",
  currency: "",
  rates: [],
  stripePayoutStatus: null,
  agreementAccepted: false,
  agreementAcceptedAt: null,
  listed: false,
```

**Step 4: Extend mapRowToForm**

Add to the return object (after `areaName`):
```tsx
    servicesOffered: (row.services_offered as string[]) ?? [],
    servicesOther: String(row.services_other ?? ""),
    petTypes: (row.pet_types as string[]) ?? [],
    dogSizes: (row.dog_sizes as string[]) ?? [],
    startingPrice: row.starting_price != null ? String(row.starting_price) : "",
    currency: String(row.currency ?? ""),
    rates: (row.rates as string[]) ?? [],
    stripePayoutStatus: (row.stripe_payout_status as "pending" | "complete" | null) ?? null,
    agreementAccepted: Boolean(row.agreement_accepted ?? false),
    agreementAcceptedAt: row.agreement_accepted_at ? String(row.agreement_accepted_at) : null,
    listed: Boolean(row.listed ?? false),
```

---

## Task 7: CarerProfile — Section 3 (Services Offered) + Section 4 (Pet Types) JSX

**Files:**
- Modify: `src/pages/CarerProfile.tsx` (edit mode JSX only)

Insert both sections between the existing Skills section and the Availability section.

**Section 3 — Services Offered**

```tsx
{/* Section 3: Services Offered */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Services Offered</h3>
  <div className="space-y-2">
    <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
      Services <span className="text-[11px] font-normal text-[var(--text-tertiary)]">(select all that apply)</span>
    </label>
    <div className="flex flex-wrap gap-2">
      {SERVICES_OFFERED.map((s) => {
        const isVetLicensed = s === "Vet / Licensed Care";
        const vetBlocked = isVetLicensed && !formData.skills.some(
          (sk) => (SKILLS_GROUP_B as readonly string[]).includes(sk)
        );
        const selected = formData.servicesOffered.includes(s);
        return (
          <button
            key={s}
            type="button"
            disabled={vetBlocked}
            onClick={() => {
              if (vetBlocked) return;
              setFormData((prev) => ({
                ...prev,
                servicesOffered: toggleItem(prev.servicesOffered, s),
                servicesOther: s === "Others" && prev.servicesOffered.includes("Others")
                  ? ""
                  : prev.servicesOther,
              }));
            }}
            className={cn(
              "neu-chip text-[13px] transition-colors",
              selected ? "neu-chip--active" : "",
              vetBlocked ? "opacity-40 cursor-not-allowed" : ""
            )}
          >
            {s}
            {vetBlocked && <span className="ml-1 text-[11px]">(proof required)</span>}
          </button>
        );
      })}
    </div>
    {formData.servicesOffered.includes("Others") && (
      <div className="space-y-1.5 mt-1">
        <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">Other service</label>
        <div className="form-field-rest relative flex items-center">
          <input
            value={formData.servicesOther}
            onChange={(e) => setFormData((prev) => ({ ...prev, servicesOther: e.target.value }))}
            placeholder="e.g. Pet taxi to airport"
            className="field-input-core"
          />
        </div>
      </div>
    )}
  </div>
</div>
```

**Section 4 — Pet Types I Care For**

```tsx
{/* Section 4: Pet Types I Care For */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pet Types I Care For</h3>
  <div className="space-y-2">
    <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
      Pet types <span className="text-[11px] font-normal text-[var(--text-tertiary)]">(select all that apply)</span>
    </label>
    <div className="flex flex-wrap gap-2">
      {PET_TYPES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() =>
            setFormData((prev) => ({
              ...prev,
              petTypes: toggleItem(prev.petTypes, p),
              dogSizes: p === "Dogs" && prev.petTypes.includes("Dogs") ? [] : prev.dogSizes,
            }))
          }
          className={cn(
            "neu-chip text-[13px]",
            formData.petTypes.includes(p) ? "neu-chip--active" : ""
          )}
        >
          {p}
        </button>
      ))}
    </div>
    {formData.petTypes.includes("Dogs") && (
      <div className="space-y-1.5 mt-1">
        <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
          Dog sizes <span className="text-[11px] font-normal text-[var(--text-tertiary)]">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {DOG_SIZES.map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, dogSizes: toggleItem(prev.dogSizes, sz) }))}
              className={cn(
                "neu-chip text-[13px]",
                formData.dogSizes.includes(sz) ? "neu-chip--active" : ""
              )}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
</div>
```

**Note on neu-chip--active:** Check if this class exists in `src/index.css`. If not, add it:

In `src/index.css`, find `.neu-chip` definition and add:
```css
.neu-chip--active {
  background-color: hsl(var(--brand-blue) / 0.12);
  color: hsl(var(--brand-blue));
  border-color: hsl(var(--brand-blue) / 0.3);
}
```
If `--brand-blue` isn't the right token, use the same active color pattern as the existing `neu-primary` button — check `src/index.css` for the exact variable.

---

## Task 8: CarerProfile — Section 6 (Starting Price) + restructure Section 5/7/8

**Files:**
- Modify: `src/pages/CarerProfile.tsx` (edit mode JSX)

**Step 1: Restructure Availability section (Section 5)**

Remove Emergency Readiness from the `flex gap-3` row in Availability. The row currently contains Emergency Readiness + Min Notice side by side. Change it to only contain Min Notice:

```tsx
{/* Min Notice — full width now that Emergency is in its own section */}
<div className="space-y-1.5">
  <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">Minimum notice</label>
  <div className="form-field-rest relative flex items-center">
    <input
      type="number"
      min={0}
      value={formData.minNoticeValue}
      onChange={(e) => setFormData((prev) => ({ ...prev, minNoticeValue: e.target.value }))}
      placeholder="0"
      className="field-input-core pr-14"
    />
    <select
      value={formData.minNoticeUnit}
      onChange={(e) =>
        setFormData((prev) => ({
          ...prev,
          minNoticeUnit: e.target.value as "hours" | "days",
          minNoticeValue: "",
        }))
      }
      className="absolute right-3 h-7 border-0 bg-transparent text-xs text-[var(--text-tertiary)] pr-4 focus:outline-none"
    >
      <option value="hours">hrs</option>
      <option value="days">days</option>
    </select>
  </div>
</div>
```

**Step 2: Insert Section 6 — Starting Price (after Availability, before Service Location)**

```tsx
{/* Section 6: Starting Price */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Starting Price</h3>
  <div className="flex gap-3">
    {/* Price */}
    <div className="flex-1 space-y-1.5">
      <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">Starting price</label>
      <div className="form-field-rest relative flex items-center">
        <input
          type="number"
          min={0}
          value={formData.startingPrice}
          onChange={(e) => setFormData((prev) => ({ ...prev, startingPrice: e.target.value }))}
          placeholder="0"
          className="field-input-core"
        />
      </div>
    </div>
    {/* Currency */}
    <div className="w-[90px] space-y-1.5">
      <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">Currency</label>
      <div className="form-field-rest relative flex items-center">
        <select
          value={formData.currency}
          onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}
          className="field-input-core appearance-none"
        >
          <option value="">—</option>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  </div>
  {/* Rates */}
  <div className="space-y-1.5">
    <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
      Rate <span className="text-[11px] font-normal text-[var(--text-tertiary)]">(select all that apply)</span>
    </label>
    <div className="flex gap-2">
      {RATE_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setFormData((prev) => ({ ...prev, rates: toggleItem(prev.rates, r) }))}
          className={cn(
            "neu-chip text-[13px]",
            formData.rates.includes(r) ? "neu-chip--active" : ""
          )}
        >
          {r}
        </button>
      ))}
    </div>
  </div>
</div>
```

**Step 3: Update Section 7 — Service Location area label + conditional requirement hint**

Change area label from "(optional)" to show requirement hint based on location selection:

```tsx
{/* Area — conditionally required */}
{(() => {
  const needsArea = formData.locationStyles.some(
    (ls) => ls === "At my place" || ls === "Meet-up / outdoor"
  );
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
        Area served
        {!needsArea && (
          <span className="ml-1.5 text-[11px] font-normal text-[var(--text-tertiary)]">(optional)</span>
        )}
        {needsArea && (
          <span className="ml-1.5 text-[11px] font-normal text-destructive">required</span>
        )}
      </label>
      <div className="form-field-rest relative flex items-center">
        <input
          value={formData.areaName}
          onChange={(e) => setFormData((prev) => ({ ...prev, areaName: e.target.value }))}
          placeholder="e.g. Downtown, Brooklyn"
          className="field-input-core"
        />
      </div>
    </div>
  );
})()}
```

**Step 4: Insert Section 8 — Emergency Readiness (after Service Location)**

Move the existing Emergency Readiness radio pair here, add helper text:

```tsx
{/* Section 8: Emergency Readiness */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Emergency Readiness</h3>
  <div className="space-y-1.5">
    <label className="text-[13px] font-semibold text-[var(--text-primary)] pl-1">
      Are you available for emergency bookings?
    </label>
    <p className="text-[12px] text-[var(--text-tertiary)] pl-1">
      Only choose Yes if you are genuinely able to respond quickly in urgent situations.
    </p>
    <div className="form-field-rest flex gap-2 items-center py-0 px-2 mt-1">
      {(["Yes", "No"] as const).map((opt) => (
        <NeuControl
          key={opt}
          size="sm"
          variant={
            (opt === "Yes" && formData.emergencyReadiness === true) ||
            (opt === "No" && formData.emergencyReadiness === false)
              ? "primary"
              : "tertiary"
          }
          onClick={() => setFormData((prev) => ({ ...prev, emergencyReadiness: opt === "Yes" }))}
          className="flex-1"
        >
          {opt}
        </NeuControl>
      ))}
    </div>
  </div>
</div>
```

---

## Task 9: CarerProfile — Section 9 (Set up payouts)

**Files:**
- Modify: `src/pages/CarerProfile.tsx`

**Step 1: Insert Section 9 (after Section 8, before Agreement)**

```tsx
{/* Section 9: Set up payouts */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Set up payouts</h3>

  {formData.stripePayoutStatus === "complete" ? (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Check size={16} className="text-green-600 shrink-0" />
        <span className="text-[14px] text-[var(--text-primary)]">Payouts set up</span>
      </div>
      <NeuControl
        size="sm"
        variant="tertiary"
        onClick={handleStripeConnect}
        disabled={stripeConnecting}
      >
        {stripeConnecting ? <Loader2 size={14} className="animate-spin" /> : "Update payouts"}
      </NeuControl>
    </div>
  ) : (
    <div className="space-y-2">
      <p className="text-[13px] text-[var(--text-tertiary)] pl-0.5">
        Connect a Stripe account to receive payments for your services.
      </p>
      <NeuControl
        size="sm"
        variant="primary"
        onClick={handleStripeConnect}
        disabled={stripeConnecting}
        className="w-full"
      >
        {stripeConnecting
          ? <><Loader2 size={14} className="animate-spin mr-2" />Connecting…</>
          : "Set up payouts"}
      </NeuControl>
    </div>
  )}
</div>
```

**Step 2: Add `stripeConnecting` state + `handleStripeConnect` handler to component**

Add state near the top:
```tsx
const [stripeConnecting, setStripeConnecting] = useState(false);
```

Add handler:
```tsx
const handleStripeConnect = async () => {
  setStripeConnecting(true);
  try {
    const returnUrl = `${window.location.origin}/carerprofile/stripe-return`;
    const refreshUrl = `${window.location.origin}/carerprofile/stripe-refresh`;
    const { data, error } = await supabase.functions.invoke("create-stripe-connect-link", {
      body: { action: "create_link", returnUrl, refreshUrl },
    });
    if (error) throw error;
    window.location.href = (data as { url: string }).url;
  } catch (err) {
    console.error("[CarerProfile.stripe_connect]", err);
    toast.error("Could not start payout setup. Please retry.");
    setStripeConnecting(false);
  }
};
```

**Step 3: Re-check payout status on mount**

In the existing load `useEffect`, after `setFormData(mapRowToForm(data))`, add:
```tsx
// If account exists but status not yet confirmed, re-check
if (data.stripe_account_id && !data.stripe_payout_status) {
  void (async () => {
    const { data: statusData } = await supabase.functions.invoke("create-stripe-connect-link", {
      body: { action: "check_status" },
    });
    if ((statusData as { status: string })?.status === "complete") {
      setFormData((prev) => ({ ...prev, stripePayoutStatus: "complete" }));
    }
  })();
}
```

---

## Task 10: CarerProfile — Section 10 (Agreement) + Section 11 (Display toggle)

**Files:**
- Modify: `src/pages/CarerProfile.tsx`

**Step 1: Section 10 — Service Provider Agreement**

```tsx
{/* Section 10: Service Provider Agreement */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
    Service Provider Agreement
  </h3>
  <div className="space-y-2">
    <p className="text-[12px] text-[var(--text-tertiary)] pl-0.5">Required before listing your services.</p>
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={formData.agreementAccepted}
        onChange={(e) => {
          const checked = e.target.checked;
          setFormData((prev) => ({
            ...prev,
            agreementAccepted: checked,
            agreementAcceptedAt: checked ? new Date().toISOString() : null,
          }));
        }}
        className="mt-0.5 h-4 w-4 rounded border-border accent-brandBlue"
      />
      <span className="text-[14px] text-[var(--text-primary)]">
        I agree to the{" "}
        <button
          type="button"
          onClick={() => navigate("/service-provider-agreement")}
          className="text-brandBlue underline underline-offset-2"
        >
          Service Provider Agreement
        </button>
      </span>
    </label>
  </div>
</div>
```

**Step 2: Section 11 — Display my Pet-Carer Profile**

Compute blocking state inline:
```tsx
{/* Section 11: Display my Pet-Carer Profile */}
{(() => {
  const payoutsDone = formData.stripePayoutStatus === "complete";
  const agreementDone = formData.agreementAccepted;
  const blocked = !payoutsDone || !agreementDone;

  const warningText = !payoutsDone && !agreementDone
    ? "Complete payout setup and accept the Service Provider Agreement before listing your services."
    : !payoutsDone
    ? "Complete payout setup before listing your services."
    : "Accept the Service Provider Agreement before listing your services.";

  return (
    <div className="space-y-3 pb-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Display my Pet-Carer Profile
      </h3>
      {blocked && (
        <p className="text-[13px] text-destructive pl-0.5">{warningText}</p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Display my Pet-Carer Profile</p>
          <p className="text-[12px] text-[var(--text-tertiary)]">Show my services in Service page.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formData.listed}
          disabled={blocked}
          onClick={() => {
            if (blocked) return;
            setFormData((prev) => ({ ...prev, listed: !prev.listed }));
          }}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            formData.listed && !blocked ? "bg-brandBlue" : "bg-[rgba(74,73,101,0.18)]",
            blocked ? "opacity-40 cursor-not-allowed" : ""
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform",
              formData.listed && !blocked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>
    </div>
  );
})()}
```

**Step 3: Add Service Provider Agreement page + route**

Create `src/pages/ServiceProviderAgreement.tsx`:
```tsx
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { NeuControl } from "@/components/ui/NeuControl";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ServiceProviderAgreement = () => {
  const navigate = useNavigate();
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <GlobalHeader />
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <NeuControl size="icon-md" variant="tertiary" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={20} strokeWidth={1.75} />
        </NeuControl>
        <h1 className="text-xl font-bold">Service Provider Agreement</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <iframe
          src="/legal/service-provider-agreement.html"
          className="w-full h-full border-0"
          title="Service Provider Agreement"
        />
      </div>
    </div>
  );
};

export default ServiceProviderAgreement;
```

**Note:** The HTML file at `src/legal/service-provider-agreement.html` needs to be accessible at `/legal/service-provider-agreement.html`. Copy or symlink it to `public/legal/`. Add to App.tsx as an unprotected route.

Add to App.tsx (public, no auth needed):
```tsx
import ServiceProviderAgreement from "./pages/ServiceProviderAgreement";
// ...
<Route path="/service-provider-agreement" element={<AppShell><ServiceProviderAgreement /></AppShell>} />
```

Also: ensure `public/legal/` directory has the file — run:
```bash
mkdir -p public/legal
cp "src/legal/service-provider-agreement.html" public/legal/
```

---

## Task 11: CarerProfile — update computeCompleted + save function + view mode

**Files:**
- Modify: `src/pages/CarerProfile.tsx`

**Step 1: Replace computeCompleted with new logic A**

```tsx
function computeCompleted(d: CarerProfileData): boolean {
  // 1. Story
  if (!d.story.trim()) return false;

  // 2. At least 1 valid skill/credential
  const hasValidSkill = d.skills.some((skill) => {
    if ((SKILLS_GROUP_B as readonly string[]).includes(skill)) {
      if (skill === "Licensed veterinarian") return d.vetLicenseFound === true;
      const meta = d.proofMetadata[skill];
      if (!meta) return false;
      return PROOF_CONFIG[skill]?.fields.every((f) => meta[f.key]?.trim()) ?? false;
    }
    return true;
  });
  if (!hasValidSkill) return false;

  // 3. At least 1 service selected
  if (d.servicesOffered.length === 0) return false;

  // 4. At least 1 pet type
  if (d.petTypes.length === 0) return false;

  // 5. Availability: at least 1 day, min notice set
  if (d.days.length === 0) return false;
  const timeOk =
    d.timeBlocks.length > 0 &&
    (!d.timeBlocks.includes("Other") ||
      (d.otherTimeFrom.trim() !== "" && d.otherTimeTo.trim() !== ""));
  if (!timeOk) return false;
  const noticeVal = parseInt(d.minNoticeValue, 10);
  if (d.minNoticeValue.trim() === "" || isNaN(noticeVal) || noticeVal < 0) return false;

  // 6. Starting price, currency, rate
  const priceVal = parseFloat(d.startingPrice);
  if (d.startingPrice.trim() === "" || isNaN(priceVal) || priceVal < 0) return false;
  if (!d.currency) return false;
  if (d.rates.length === 0) return false;

  // 7. Service location: at least 1 style, area required if At my place or Meet-up
  if (d.locationStyles.length === 0) return false;
  const needsArea = d.locationStyles.some(
    (ls) => ls === "At my place" || ls === "Meet-up / outdoor"
  );
  if (needsArea && !d.areaName.trim()) return false;

  // 8. Emergency readiness
  if (d.emergencyReadiness === null) return false;

  return true;
}
```

**Step 2: Add computeListingEligible helper**

```tsx
function computeListingEligible(d: CarerProfileData): boolean {
  return (
    computeCompleted(d) &&
    d.stripePayoutStatus === "complete" &&
    d.agreementAccepted
  );
}
```

**Step 3: Update handleSave to persist new fields**

In the `supabase.from("pet_care_profiles").upsert(...)` call, add:
```tsx
  services_offered: formData.servicesOffered,
  services_other: formData.servicesOffered.includes("Others")
    ? formData.servicesOther.trim() || null
    : null,
  pet_types: formData.petTypes,
  dog_sizes: formData.dogSizes,
  starting_price: formData.startingPrice.trim() !== "" ? parseFloat(formData.startingPrice) : null,
  currency: formData.currency || null,
  rates: formData.rates,
  agreement_accepted: formData.agreementAccepted,
  agreement_accepted_at: formData.agreementAccepted
    ? (formData.agreementAcceptedAt ?? new Date().toISOString())
    : null,
  agreement_version: formData.agreementAccepted ? AGREEMENT_VERSION : null,
  listed: computeListingEligible(formData) ? formData.listed : false,
  completed: computeCompleted(formData),
```

**Step 4: Update view mode to show new sections**

In view mode (after the Skills section view), add:

```tsx
{/* Services Offered — view */}
{formData.servicesOffered.length > 0 && (
  <div className="space-y-1.5">
    <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Services Offered</p>
    <div className="flex flex-wrap gap-1.5">
      {formData.servicesOffered.map((s) => (
        <span key={s} className="neu-chip text-[13px]">
          {s === "Others" && formData.servicesOther ? formData.servicesOther : s}
        </span>
      ))}
    </div>
  </div>
)}

{/* Pet Types — view */}
{formData.petTypes.length > 0 && (
  <div className="space-y-1.5">
    <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Pet Types</p>
    <div className="flex flex-wrap gap-1.5">
      {formData.petTypes.map((p) => <span key={p} className="neu-chip text-[13px]">{p}</span>)}
    </div>
    {formData.dogSizes.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {formData.dogSizes.map((s) => <span key={s} className="neu-chip text-[13px]">{s}</span>)}
      </div>
    )}
  </div>
)}

{/* Starting Price — view */}
{formData.startingPrice && formData.currency && formData.rates.length > 0 && (
  <div className="space-y-1">
    <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Starting Price</p>
    <p className="text-[15px] text-[var(--text-primary)]">
      {formData.currency} {formData.startingPrice} · {formData.rates.join(" / ")}
    </p>
  </div>
)}
```

Also add to view mode (after Service Location, before the empty-state check):

```tsx
{/* Payout + Agreement status — view */}
{(formData.stripePayoutStatus === "complete" || formData.agreementAccepted) && (
  <div className="space-y-1.5">
    <p className="text-[12px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Listing Status</p>
    <div className="flex flex-wrap gap-1.5">
      {formData.stripePayoutStatus === "complete" && (
        <span className="neu-chip text-[13px] flex items-center gap-1">
          <Check size={12} /> Payouts set up
        </span>
      )}
      {formData.agreementAccepted && (
        <span className="neu-chip text-[13px] flex items-center gap-1">
          <Check size={12} /> Agreement accepted
        </span>
      )}
    </div>
    {formData.listed && (
      <p className="text-[13px] text-brandBlue font-medium pl-0.5">Listed on Service page</p>
    )}
  </div>
)}
```

---

## Task 12: Build + lint audit

**Step 1: Run lint**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run lint 2>&1
```
Fix any errors (unused imports, type errors).

**Step 2: Run build**
```bash
npm run build 2>&1
```
Fix any TypeScript or Vite errors.

**Step 3: Audit section order in edit mode**

Read the JSX in CarerProfile.tsx and confirm sections appear in this exact order:
1. About you as a carer (story)
2. Skills & Credentials (experience / proof skills)
3. Services Offered (chip multi-select)
4. Pet Types I Care For (chip multi-select + dog sizes)
5. Availability (Days, Time, Min Notice)
6. Starting Price (price + currency + rates)
7. Service Location (location style + area)
8. Emergency Readiness (Yes/No + helper)
9. Set up payouts (Stripe Connect CTA)
10. Service Provider Agreement (checkbox + link)
11. Display my Pet-Carer Profile (publish toggle)

**Step 4: Audit completion logic**

Verify `computeCompleted` checks all 8 categories (story, skill, services, pet types, availability, price, location, emergency). Verify `computeListingEligible` adds payout + agreement on top.

**Step 5: Audit blocking logic on Section 11**

Confirm toggle cannot be switched on if `stripePayoutStatus !== "complete"` or `!agreementAccepted`. Confirm inline red warning appears for each missing condition.

---

## Execution note

Deploy migration (Task 1) and edge function (Task 4) via Supabase MCP tools. All other tasks are local file edits. The Stripe Connect edge function requires `STRIPE_SECRET_KEY` already set in Supabase project secrets (used by existing checkout functions — confirm before deploying).
