# Service Page Algo Rank Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give Gold/Plus carers a consistent tier-as-tiebreaker boost in all five Service page sort modes, then surface this as a named perk in membership copy.

**Architecture:** Add a `service_rank_weight` integer column to `pet_care_profiles` (Gold=20, Plus=10, Free=0), kept current by a DB trigger on `profiles.effective_tier`. The frontend reads this column, adds it to `ProviderSummary`, and applies it as a secondary comparator in all five sort branches in `filterProviders.ts`. Pass 2 adds a `serviceVisibility` entry to `quotaConfig.ts` and one new row to the `FEATURES` arrays in `Subscription.tsx` and the `PLUS_PERKS`/`GOLD_PERKS` lists in `Premium.tsx`.

**Tech Stack:** PostgreSQL trigger (Supabase migration), TypeScript, Vitest

**Complexity:** Pass 1 LOW-MEDIUM (1 migration + 4 TS files). Pass 2 LOW (2 copy files + quotaConfig). **Confidence: HIGH** — all changes are additive, no API contract changes, no RLS changes, no new RPC.

---

## Pass 1 — Tier-as-tiebreaker ranking

### Task 1: DB migration — add column + trigger

**Files:**
- Create: `supabase/migrations/20260407000000_service_rank_weight.sql`

**Step 1: Write the migration**

```sql
-- supabase/migrations/20260407000000_service_rank_weight.sql

-- 1. Add column (default 0 so existing rows are valid immediately)
ALTER TABLE pet_care_profiles
  ADD COLUMN IF NOT EXISTS service_rank_weight integer NOT NULL DEFAULT 0;

-- 2. Back-fill from current effective_tier
UPDATE pet_care_profiles p
SET service_rank_weight = CASE
  WHEN pr.effective_tier = 'gold' THEN 20
  WHEN pr.effective_tier = 'plus' THEN 10
  ELSE 0
END
FROM profiles pr
WHERE pr.id = p.user_id;

-- 3. Trigger function: fires on profiles.effective_tier change
CREATE OR REPLACE FUNCTION sync_service_rank_weight()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE pet_care_profiles
  SET service_rank_weight = CASE
    WHEN NEW.effective_tier = 'gold' THEN 20
    WHEN NEW.effective_tier = 'plus' THEN 10
    ELSE 0
  END
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger (replace if exists)
DROP TRIGGER IF EXISTS trg_sync_service_rank_weight ON profiles;
CREATE TRIGGER trg_sync_service_rank_weight
  AFTER UPDATE OF effective_tier, tier ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_service_rank_weight();
```

**Step 2: Apply the migration (local dev)**

```bash
supabase db push
```
Expected: migration applied, no errors.

**Step 3: Verify column and back-fill**

Run in Supabase SQL editor or `supabase db execute`:
```sql
SELECT p.user_id, pr.effective_tier, p.service_rank_weight
FROM pet_care_profiles p
JOIN profiles pr ON pr.id = p.user_id
LIMIT 10;
```
Expected: `service_rank_weight` matches tier mapping.

**Step 4: Commit**

```bash
git add supabase/migrations/20260407000000_service_rank_weight.sql
git commit -m "feat(service): add service_rank_weight column + sync trigger"
```

---

### Task 2: Write the failing filterProviders test

**Files:**
- Create: `src/test/filterProviders.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest";
import { filterAndSortProviders } from "@/components/service/filterProviders";
import type { ProviderSummary } from "@/components/service/types";

const BASE: Omit<ProviderSummary, "userId" | "displayName" | "serviceRankWeight"> = {
  avatarUrl: null, socialAlbumUrls: [], servicesOffered: [], servicesOther: "",
  currency: "USD", startingPrice: null, startingPriceRateUnit: null, rateRows: [],
  minNoticeValue: "", minNoticeUnit: "hours", skills: [], proofMetadata: {},
  hasCar: false, days: [], timeBlocks: [], otherTimeFrom: "", otherTimeTo: "",
  locationStyles: [], areaName: "", petTypes: [], petTypesOther: "",
  dogSizes: [], emergencyReadiness: null, verificationStatus: null,
  viewCount: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  isBookmarked: false, agreementAccepted: true, stripePayoutStatus: null,
  story: "", distanceKm: null,
};

const defaultFilters = {
  search: "", serviceTypes: [], selectedWeekdays: [], bookmarkedOnly: false,
  verifiedLicensedOnly: false, emergencyReadyOnly: false, petTypes: [], dogSizes: [],
  locationStyles: [],
};

function makeProvider(userId: string, overrides: Partial<ProviderSummary>): ProviderSummary {
  return { ...BASE, userId, displayName: userId, serviceRankWeight: 0, ...overrides };
}

describe("filterAndSortProviders — tier tiebreaker", () => {
  it("latest: equal updatedAt → gold beats free", () => {
    const ts = "2026-01-01T00:00:00Z";
    const gold = makeProvider("gold", { serviceRankWeight: 20, updatedAt: ts });
    const free = makeProvider("free", { serviceRankWeight: 0, updatedAt: ts });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "latest" });
    expect(result[0].userId).toBe("gold");
  });

  it("latest: more recent updatedAt overrides tier", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, updatedAt: "2026-01-01T00:00:00Z" });
    const free = makeProvider("free", { serviceRankWeight: 0,  updatedAt: "2026-06-01T00:00:00Z" });
    const result = filterAndSortProviders([gold, free], { ...defaultFilters, sort: "latest" });
    expect(result[0].userId).toBe("free");
  });

  it("proximity: equal distance → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, distanceKm: 1 });
    const free = makeProvider("free", { serviceRankWeight: 0,  distanceKm: 1 });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "proximity" });
    expect(result[0].userId).toBe("gold");
  });

  it("price_low_to_high: equal price → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, startingPrice: "50" });
    const free = makeProvider("free", { serviceRankWeight: 0,  startingPrice: "50" });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "price_low_to_high" });
    expect(result[0].userId).toBe("gold");
  });

  it("price_high_to_low: equal price → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, startingPrice: "50" });
    const free = makeProvider("free", { serviceRankWeight: 0,  startingPrice: "50" });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "price_high_to_low" });
    expect(result[0].userId).toBe("gold");
  });

  it("popularity: equal viewCount → gold beats free", () => {
    const gold = makeProvider("gold", { serviceRankWeight: 20, viewCount: 10 });
    const free = makeProvider("free", { serviceRankWeight: 0,  viewCount: 10 });
    const result = filterAndSortProviders([free, gold], { ...defaultFilters, sort: "popularity" });
    expect(result[0].userId).toBe("gold");
  });

  it("tier order: gold > plus > free at equal rank signal", () => {
    const ts = "2026-01-01T00:00:00Z";
    const gold = makeProvider("gold", { serviceRankWeight: 20, updatedAt: ts });
    const plus = makeProvider("plus", { serviceRankWeight: 10, updatedAt: ts });
    const free = makeProvider("free", { serviceRankWeight: 0,  updatedAt: ts });
    const result = filterAndSortProviders([free, gold, plus], { ...defaultFilters, sort: "latest" });
    expect(result.map((p) => p.userId)).toEqual(["gold", "plus", "free"]);
  });
});
```

**Step 2: Run — expect FAIL** (field does not exist yet)

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npx vitest run src/test/filterProviders.test.ts 2>&1 | tail -20
```
Expected: TypeScript error or test failure about unknown field `serviceRankWeight`.

---

### Task 3: Add `serviceRankWeight` to `ProviderSummary` type

**Files:**
- Modify: `src/components/service/types.ts`

**Step 1: Add the field** (after `distanceKm`)

In `src/components/service/types.ts`, change:
```typescript
  distanceKm?: number | null;
}
```
to:
```typescript
  distanceKm?: number | null;
  serviceRankWeight: number;
}
```

**Step 2: Run tests — still fail** (mapper doesn't set it yet)

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npx vitest run src/test/filterProviders.test.ts 2>&1 | tail -20
```
Expected: Type error resolved, logic tests fail (no tiebreaker logic yet).

---

### Task 4: Wire `serviceRankWeight` through the data pipeline

Two files need updating: `mapProviderRow.ts` (sets the field from the raw DB row) and `useServiceProviders.ts` (includes `service_rank_weight` in SELECT + passes it down).

**Files:**
- Modify: `src/components/service/mapProviderRow.ts`
- Modify: `src/hooks/useServiceProviders.ts`

**Step 1: Update `mapProviderRow.ts`** — add `serviceRankWeight` to the returned object

In the `return { ... }` block at the end of `mapProviderRow()`, add after `story`:
```typescript
    serviceRankWeight:    Number(row.service_rank_weight ?? 0),
```

**Step 2: Update `useServiceProviders.ts`** — add column to SELECT list

In the `.select([...].join(","))` call, add `"service_rank_weight"` after `"stripe_payout_status"`:
```typescript
            "stripe_payout_status",
            "service_rank_weight",
```

No other changes needed — `mapProviderRow()` already receives the full `rowObj` and will pick up the new field.

**Step 3: Run tests — still fail** (sort tiebreaker not applied yet)

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npx vitest run src/test/filterProviders.test.ts 2>&1 | tail -20
```
Expected: Compilation passes, tests fail on sort order assertions.

---

### Task 5: Apply tier tiebreaker in `filterProviders.ts`

**Files:**
- Modify: `src/components/service/filterProviders.ts`

**Step 1: Add tiebreaker helper** (add after `toLatestTime` function)

```typescript
function tierTiebreak(a: ProviderSummary, b: ProviderSummary): number {
  return (b.serviceRankWeight ?? 0) - (a.serviceRankWeight ?? 0);
}
```

**Step 2: Update all 5 sort branches** to use `tierTiebreak` as the secondary comparator when the primary key is equal. Replace the `switch (filters.sort)` block:

```typescript
  switch (filters.sort) {
    case "proximity":
      return [...filtered].sort((a, b) => {
        const ad = typeof a.distanceKm === "number" && Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
        const bd = typeof b.distanceKm === "number" && Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        const tb = tierTiebreak(a, b);
        if (tb !== 0) return tb;
        return toLatestTime(b) - toLatestTime(a);
      });
    case "price_low_to_high":
      return [...filtered].sort((a, b) => {
        const ap = a.startingPrice ? Number.parseFloat(a.startingPrice) : Number.POSITIVE_INFINITY;
        const bp = b.startingPrice ? Number.parseFloat(b.startingPrice) : Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return tierTiebreak(a, b);
      });
    case "price_high_to_low":
      return [...filtered].sort((a, b) => {
        const ap = a.startingPrice ? Number.parseFloat(a.startingPrice) : Number.NEGATIVE_INFINITY;
        const bp = b.startingPrice ? Number.parseFloat(b.startingPrice) : Number.NEGATIVE_INFINITY;
        if (bp !== ap) return bp - ap;
        return tierTiebreak(a, b);
      });
    case "popularity":
      return [...filtered].sort((a, b) => {
        if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
        return tierTiebreak(a, b);
      });
    case "latest":
    default:
      return [...filtered].sort((a, b) => {
        const td = toLatestTime(b) - toLatestTime(a);
        if (td !== 0) return td;
        return tierTiebreak(a, b);
      });
  }
```

**Step 3: Run tests — expect PASS**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npx vitest run src/test/filterProviders.test.ts 2>&1 | tail -20
```
Expected: All 7 tests PASS.

**Step 4: Run lint + build**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npm run lint && npm run build 2>&1 | tail -20
```
Expected: 0 lint errors, build succeeds.

**Step 5: Commit**

```bash
git add \
  src/test/filterProviders.test.ts \
  src/components/service/types.ts \
  src/components/service/mapProviderRow.ts \
  src/hooks/useServiceProviders.ts \
  src/components/service/filterProviders.ts
git commit -m "feat(service): tier-as-tiebreaker ranking across all 5 sort modes"
```

---

## Pass 2 — Membership copy

### Task 6: Add `serviceVisibility` to `quotaConfig.ts`

**Files:**
- Modify: `src/config/quotaConfig.ts`

**Step 1: Add `serviceVisibility` to the `TierCaps` interface**

Find the interface that lists `discoveryViewsPerDay`, `discoveryLabel`, etc. Add:
```typescript
  serviceVisibilityLabel: string;
```

**Step 2: Populate for each tier**

In the Free caps object, add:
```typescript
    serviceVisibilityLabel: "Standard",
```
In the Plus caps object, add:
```typescript
    serviceVisibilityLabel: "Priority placement",
```
In the Gold caps object, add:
```typescript
    serviceVisibilityLabel: "Top placement",
```

**Step 3: Run lint**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npm run lint 2>&1 | tail -10
```
Expected: 0 errors.

---

### Task 7: Add Services perk row to Subscription.tsx and Premium.tsx

**Files:**
- Modify: `src/pages/Subscription.tsx`
- Modify: `src/pages/Premium.tsx`

**Step 1: Add to `FEATURES` in `Subscription.tsx`** (after "Priority nanny matching")

```typescript
  { label: "Priority Services placement",  icon: "lock" as const,  badge: "plus" as const },
```

**Step 2: Add to `PLUS_PERKS` list in `Premium.tsx`**

Find the Plus perks array (the one containing `"×2 Discovery"`). Add:
```typescript
  { icon: Briefcase, label: "Priority Services placement", sublabel: "Carers see your listing higher" },
```
> Note: import `Briefcase` from `lucide-react` at the top of the file if it isn't already imported.

**Step 3: Check if `Briefcase` is already imported**

```bash
grep "Briefcase" "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Premium.tsx"
```
If not present, add it to the existing `lucide-react` import line.

**Step 4: Run lint + build**

```bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && npm run lint && npm run build 2>&1 | tail -20
```
Expected: 0 errors, build succeeds.

**Step 5: Commit**

```bash
git add \
  src/config/quotaConfig.ts \
  src/pages/Subscription.tsx \
  src/pages/Premium.tsx
git commit -m "feat(membership): add Services priority placement perk to Plus/Gold copy"
```

---

## Deploy

```bash
# Deploy migration to production
supabase db push --linked

# Deploy edge function if any were changed (none in this plan)
# Vercel auto-deploys on push to main
git push origin main
```

---

## Testing checklist

- [ ] `npx vitest run src/test/filterProviders.test.ts` — all 7 pass
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — succeeds
- [ ] Service page in browser: create two test providers (one Gold, one Free) with identical `updated_at` — Gold should appear first in "Latest" sort
- [ ] Subscription page: "Priority Services placement" row visible in feature comparison
- [ ] Premium page: perk appears in Plus section
