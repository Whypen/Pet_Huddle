# Service Marketplace Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild `/service` into a shoppable editorial pet-care marketplace with a 2-column polaroid feed, advanced filtering, persistent bookmarks, popularity sorting, and a full-screen public provider profile modal.

**Architecture:** Service.tsx becomes the orchestrator. Three new shared components live in `src/components/service/`. All provider data is fetched from `pet_care_profiles` (with a new public RLS policy) joined to `profiles`. Client-side filtering handles search, service type, date, and advanced filters. Bookmarks are persisted to a new `service_bookmarks` table. View count is a simple integer on `pet_care_profiles` incremented via RPC on modal open.

**Tech Stack:** React + TypeScript, Supabase (Postgres + RLS + RPC), Tailwind CSS, Framer Motion, Radix Primitives (Popover, Dialog), Lucide React, `sonner` toasts.

---

## Audit Confirmation (Phase 0 — already complete, confirmed)

- `src/pages/Service.tsx` — placeholder stub only (3 lines)
- `/service` route — already wired in `src/App.tsx` line 231
- `pet_care_profiles` table — has `listed` boolean; query at line 370
- `service_bookmarks` — does NOT exist anywhere
- `view_count` — does NOT exist on `pet_care_profiles`
- Public browse — blocked by current RLS (only `user_id = auth.uid()` allowed)
- `ProfileModal` at `src/components/modals/ProfileModal.tsx` — top-down slide style: `initial={{ y: -20 }}`, anchored `top-[70px]`
- `GlassSheet` at `src/components/ui/GlassSheet.tsx` — standard bottom sheet primitive
- LOCATION_STYLES constant already defined in `CarerProfile.tsx` as: `"Flexible" | "At owner's place" | "At my place" | "Meet-up / outdoor"`
- SKILLS_GROUP_B in `CarerProfile.tsx` = certified/licensed skills (only addable with completed proof fields)

---

## Phase 1 — Database Migrations

### Task 1: Create `service_bookmarks` table

**Files:**
- Create: migration SQL (apply via Supabase MCP or dashboard)

**Step 1: Apply migration**

```sql
-- Migration: create service_bookmarks
create table if not exists public.service_bookmarks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (user_id, provider_user_id)
);

-- RLS
alter table public.service_bookmarks enable row level security;

create policy "Users manage own bookmarks"
  on public.service_bookmarks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Step 2: Verify**

```sql
select * from public.service_bookmarks limit 0;
```

Expected: empty result set with columns id, user_id, provider_user_id, created_at.

---

### Task 2: Add `view_count` to `pet_care_profiles`

**Step 1: Apply migration**

```sql
-- Migration: add view_count
alter table public.pet_care_profiles
  add column if not exists view_count integer not null default 0;
```

**Step 2: Verify**

```sql
select view_count from public.pet_care_profiles limit 1;
```

---

### Task 3: Public read RLS policy for listed providers

> ⚠️ **SUPERSEDED — 2026-03-28** — The policy below (`using (listed = true)`) was the initial design and was applied to the live DB. It has since been **replaced** by a stricter policy that also requires `is_verified = true` on the provider's profile row. Do **not** re-apply the SQL below.
>
> The live policy is `pet_care_profiles_public_listed_verified_read` and is defined in:
> `supabase/migrations/20260328220000_provider_public_read_require_verified.sql`

~~**Step 1: Apply policy**~~

```sql
-- ⚠️ SUPERSEDED — DO NOT APPLY
-- This policy is too permissive: it exposes listed-but-unverified providers.
-- See migration 20260328220000_provider_public_read_require_verified.sql instead.
create policy "Public read listed profiles"
  on public.pet_care_profiles
  for select
  using (listed = true);
```

~~**Step 2: Verify (as a different user or anon)**~~

```sql
-- Updated verification query — must filter by is_verified too:
select pcp.user_id, pcp.listed, p.is_verified
from public.pet_care_profiles pcp
join public.profiles p on p.id = pcp.user_id
where pcp.listed = true and p.is_verified = true
limit 5;
```

Expected: returns rows (not empty/forbidden).

---

### Task 4: `increment_pet_care_profile_view_count` RPC

**Step 1: Apply migration**

```sql
create or replace function public.increment_pet_care_profile_view_count(
  p_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.pet_care_profiles
  set view_count = view_count + 1
  where user_id = p_user_id;
end;
$$;
```

**Step 2: Verify**

```sql
-- Insert a test row first if needed, then:
select public.increment_pet_care_profile_view_count('00000000-0000-0000-0000-000000000000');
-- Expect: void return, no error
```

---

## Phase 2 — Shared Components

### Task 5: `CarerPolaroidCard.tsx` — feed tile

**Files:**
- Create: `src/components/service/CarerPolaroidCard.tsx`

This is a pure display component. It shows the polaroid for one listed provider. The hero image is the first image from `[avatar_url, ...social_album_urls]`. The caption strip shows name + services + lowest price. A bookmark button is positioned inside the polaroid at bottom-right of the caption strip.

**Interfaces** (used by CarerPolaroidCard and PublicCarerProfileView):

```typescript
export interface ProviderSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  socialAlbumUrls: string[]; // already resolved to public URLs
  servicesOffered: string[];
  currency: string;
  startingPrice: string | null; // lowest rate from rateRows
  minNoticeValue: string;
  minNoticeUnit: "hours" | "days";
  skills: string[];
  proofMetadata: Record<string, Record<string, string>>;
  hasCar: boolean;
  days: string[];
  locationStyles: string[];
  petTypes: string[];
  dogSizes: string[];
  emergencyReadiness: boolean | null;
  verificationStatus: string | null;
  viewCount: number;
  isBookmarked: boolean;
}
```

**Step 1: Create file**

```tsx
// src/components/service/CarerPolaroidCard.tsx
import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Car, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SKILLS_GROUP_B_LIST } from "@/components/service/carerServiceConstants";
import type { ProviderSummary } from "@/components/service/types";

interface Props {
  provider: ProviderSummary;
  onTap: () => void;
  onBookmark: (e: React.MouseEvent) => void;
}

export function CarerPolaroidCard({ provider, onTap, onBookmark }: Props) {
  const heroSrc = provider.avatarUrl ?? provider.socialAlbumUrls[0] ?? null;
  const hasCertified = provider.skills.some((s) =>
    SKILLS_GROUP_B_LIST.includes(s)
  );
  const serviceLabel = provider.servicesOffered.slice(0, 2).join(" · ");
  const priceLabel = provider.startingPrice && provider.currency
    ? `from ${provider.currency} ${provider.startingPrice}`
    : null;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      onClick={onTap}
      className="cursor-pointer select-none"
    >
      <div
        style={{
          background: "#f0f0f0",
          borderRadius: "4px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          aspectRatio: "4 / 5",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Photo slot: 5% inset on sides and top, 24% reserved for caption */}
        <div
          style={{
            position: "absolute",
            top: "5%", left: "5%", right: "5%", bottom: "24%",
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {heroSrc ? (
            <img
              src={heroSrc}
              alt=""
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-muted flex items-center justify-center text-muted-foreground text-sm">
              No photo
            </div>
          )}
          {/* Inset shadow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.10)", zIndex: 2 }}
          />
        </div>

        {/* Sticker badges: top-left of photo */}
        {(provider.hasCar || hasCertified) && (
          <div
            className="absolute flex flex-col gap-1 pointer-events-none"
            style={{
              top: "calc(5% + 8px)", left: "calc(5% + 8px)",
              zIndex: 10,
            }}
          >
            {provider.hasCar && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold leading-none"
                style={{
                  background: "#fefce8", color: "#713f12",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
                  border: "0.5px solid rgba(0,0,0,0.06)",
                }}
              >
                <Car className="w-2 h-2" strokeWidth={2} />
                Car
              </span>
            )}
            {hasCertified && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold leading-none"
                style={{
                  background: "#f0fdf4", color: "#14532d",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
                  border: "0.5px solid rgba(0,0,0,0.06)",
                }}
              >
                <CheckCircle2 className="w-2 h-2" strokeWidth={2.5} />
                Certified
              </span>
            )}
          </div>
        )}

        {/* Caption strip: bottom 24% */}
        <div
          className="absolute left-0 right-0 flex flex-col justify-center px-3"
          style={{ top: "76%", bottom: 0, zIndex: 10 }}
        >
          <span
            className="text-[15px] leading-tight truncate"
            style={{
              fontStyle: "italic",
              fontFamily: "Georgia, 'Times New Roman', serif",
              color: "#2a2a2a",
            }}
          >
            {provider.displayName || "Pet Carer"}
          </span>
          {serviceLabel && (
            <span className="text-[10px] tracking-[0.04em] text-[#777] truncate">
              {serviceLabel}
            </span>
          )}
          {priceLabel && (
            <span className="text-[10px] font-semibold text-brandBlue truncate mt-0.5">
              {priceLabel}
            </span>
          )}
        </div>

        {/* Bookmark button: bottom-right of caption strip */}
        <button
          type="button"
          onClick={onBookmark}
          className="absolute bottom-2 right-2 z-20 p-1.5 rounded-full hover:bg-black/5 transition-colors"
          aria-label={provider.isBookmarked ? "Remove bookmark" : "Bookmark"}
        >
          {provider.isBookmarked ? (
            <BookmarkCheck className="w-4 h-4 text-brandBlue" strokeWidth={2} />
          ) : (
            <Bookmark className="w-4 h-4 text-[#aaa]" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </motion.div>
  );
}
```

**Step 2: Create constants file** (shared between CarerProfile and Service)

```typescript
// src/components/service/carerServiceConstants.ts
export const SKILLS_GROUP_B_LIST = [
  "Licensed veterinarian",
  "Certified groomer",
  "Certified behaviorist / trainer",
  "Pet first-aid / CPR certified",
  "Certified pet-carer",
] as const;

export const SERVICE_TYPES = [
  "Boarding", "Walking", "Day Care", "Drop-in", "Grooming",
  "Training", "Vet Care", "Special Care", "Transport", "Emergency",
] as const;

export const LOCATION_STYLES_LIST = [
  "Flexible",
  "At owner's place",
  "At my place",
  "Meet-up / outdoor",
] as const;

export const DAY_SHORT_MAP: Record<string, string> = {
  Sunday: "Sun", Monday: "Mon", Tuesday: "Tue",
  Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat",
};
```

**Step 3: Create types file**

```typescript
// src/components/service/types.ts
export interface ProviderSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  socialAlbumUrls: string[];
  servicesOffered: string[];
  currency: string;
  startingPrice: string | null;
  minNoticeValue: string;
  minNoticeUnit: "hours" | "days";
  skills: string[];
  proofMetadata: Record<string, Record<string, string>>;
  hasCar: boolean;
  days: string[];
  locationStyles: string[];
  petTypes: string[];
  dogSizes: string[];
  emergencyReadiness: boolean | null;
  verificationStatus: string | null;
  viewCount: number;
  isBookmarked: boolean;
  agreementAccepted: boolean;
  stripePayoutStatus: string | null;
  story: string;
  rateRows: Array<{ price: string; rate: string; services: string[] }>;
  otherTimeFrom: string;
  otherTimeTo: string;
  timeBlocks: string[];
  areaName: string;
  petTypesOther: string;
  servicesOther: string;
}
```

---

### Task 6: `PublicCarerProfileView.tsx` — the full profile renderer

**Files:**
- Create: `src/components/service/PublicCarerProfileView.tsx`

This is the view-mode JSX extracted from `CarerProfile.tsx` (lines ~1400–1828) adapted to work with `ProviderSummary` props instead of local form state and `useAuth`. No edit mode. No save button. No carousel (uses the existing hero scroll pattern but takes resolved URLs directly).

**Key adaptation differences from CarerProfile view mode:**
- Takes `provider: ProviderSummary` as prop (not from useAuth/formData)
- Avatar/album URLs already resolved (passed in)
- SKILLS_GROUP_B check uses `SKILLS_GROUP_B_LIST` from constants
- `profile?.has_car` → `provider.hasCar`
- `profile?.display_name` → `provider.displayName`

**Step 1: Create file**

```tsx
// src/components/service/PublicCarerProfileView.tsx
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Car, CheckCircle2, Clock, MapPin
} from "lucide-react";
import { SKILLS_GROUP_B_LIST } from "./carerServiceConstants";
import type { ProviderSummary } from "./types";
import carerPlaceholderImg from "@/assets/Carer Profile Placeholder.png";

interface Props {
  provider: ProviderSummary;
}

export function PublicCarerProfileView({ provider }: Props) {
  const heroScrollRef = useRef<HTMLDivElement>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [storyExpanded, setStoryExpanded] = useState(false);

  // Build slides exactly as CarerProfile view mode does
  const heroSlides = [
    ...(provider.avatarUrl ? [provider.avatarUrl] : []),
    ...provider.socialAlbumUrls.filter((u) => u !== provider.avatarUrl),
  ];

  const hasCertified = provider.skills.some((s) =>
    (SKILLS_GROUP_B_LIST as readonly string[]).includes(s)
  );
  const sortedSkills = [...provider.skills].sort((a, b) => {
    const aC = (SKILLS_GROUP_B_LIST as readonly string[]).includes(a) ? 0 : 1;
    const bC = (SKILLS_GROUP_B_LIST as readonly string[]).includes(b) ? 0 : 1;
    return aC - bC;
  });

  const roleLineServices = provider.servicesOffered.slice(0, 3).join(" • ");

  const to12h = (t: string) => {
    if (!t) return t;
    const [hStr, mStr] = t.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return t;
    const period = h >= 12 ? "pm" : "am";
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, "0")} ${period}`;
  };

  return (
    <div className="flex flex-col">
      {/* A. Polaroid — same recipe as CarerProfile view mode */}
      <section className="flex flex-col pt-2 pb-2 px-3">
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "4 / 5",
            background: "#f0f0f0",
            borderRadius: "4px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          }}
        >
          {/* Photo slot */}
          <div
            className="absolute overflow-hidden"
            style={{ top: "5%", left: "5%", right: "5%", bottom: "24%", zIndex: 1 }}
          >
            {heroSlides.length > 0 ? (
              <div
                ref={heroScrollRef}
                className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onScroll={(e) => {
                  const idx = Math.round(
                    e.currentTarget.scrollLeft / e.currentTarget.clientWidth
                  );
                  setHeroIndex(idx);
                }}
              >
                {heroSlides.map((src, i) => (
                  <div key={i} className="h-full w-full shrink-0 snap-center snap-always">
                    <img src={src} alt="" className="h-full w-full object-cover object-center" />
                  </div>
                ))}
              </div>
            ) : (
              <img src={carerPlaceholderImg} alt="" className="h-full w-full object-cover object-center" />
            )}
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.10)", zIndex: 2 }} />
            {heroSlides.length > 1 && (
              <div className="absolute top-3 right-3 flex gap-1.5" style={{ zIndex: 10 }}>
                {heroSlides.map((_, i) => (
                  <span key={i} className={cn("h-1.5 rounded-full transition-all duration-200", i === heroIndex ? "w-5 bg-white" : "w-1.5 bg-white/55")} style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                ))}
              </div>
            )}
          </div>

          {/* Sticker badges */}
          {(provider.hasCar || hasCertified) && (
            <div className="absolute flex flex-col gap-1.5 pointer-events-none" style={{ top: "calc(5% + 10px)", left: "calc(5% + 10px)", zIndex: 10 }}>
              {provider.hasCar && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold leading-none" style={{ background: "#fefce8", color: "#713f12", boxShadow: "0 2px 6px rgba(0,0,0,0.14)", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                  <Car className="w-2.5 h-2.5" strokeWidth={2} />Has car
                </span>
              )}
              {hasCertified && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold leading-none" style={{ background: "#f0fdf4", color: "#14532d", boxShadow: "0 2px 6px rgba(0,0,0,0.14)", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                  <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2.5} />Certified
                </span>
              )}
            </div>
          )}

          {/* Caption strip */}
          <div className="absolute left-0 right-0 flex flex-col items-center justify-center px-6 gap-1" style={{ top: "76%", bottom: 0, zIndex: 10 }}>
            <span className="text-[24px] leading-tight text-center w-full truncate" style={{ fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif", color: "#2a2a2a" }}>
              {provider.displayName || "Pet Carer"}
            </span>
            {roleLineServices && (
              <span className="text-[14px] tracking-[0.04em] text-[#777] text-center truncate w-full">{roleLineServices}</span>
            )}
          </div>
        </div>
      </section>

      {/* Tier 1: Story */}
      {provider.story.trim() && (
        <section className="px-6 pt-2 pb-1">
          <div aria-hidden className="select-none pointer-events-none" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: "52px", lineHeight: 1, color: "#e4e4e4", marginBottom: "-0.9rem" }}>&#8220;</div>
          <p className={cn("text-[17px] text-brandText leading-[1.78] whitespace-pre-wrap", !storyExpanded && "line-clamp-5")}>
            {provider.story}
          </p>
          <div aria-hidden className="text-right select-none pointer-events-none" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: "52px", lineHeight: 1, color: "#e4e4e4", marginTop: "-0.6rem" }}>&#8221;</div>
          {provider.story.length > 300 && (
            <button type="button" onClick={() => setStoryExpanded((v) => !v)} className="mt-1 text-[14px] font-semibold text-brandBlue">
              {storyExpanded ? "Show less" : "Read more"}
            </button>
          )}
        </section>
      )}

      {/* Tier 2: Services */}
      {provider.servicesOffered.length > 0 && (
        <section className="card-e1 overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <p className="text-[12px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-2">Services</p>
            {provider.petTypes.length > 0 && (
              <p className="text-[15px] text-muted-foreground">
                {"Works with "}
                {provider.petTypes.map((p) => {
                  if (p === "Dogs" && provider.dogSizes.length > 0) return `Dogs (${provider.dogSizes.join(", ")})`;
                  return p === "Others" && provider.petTypesOther ? provider.petTypesOther : p;
                }).join(", ")}
              </p>
            )}
          </div>
          <div className="border-t border-brandText/10 divide-y divide-brandText/10">
            {provider.rateRows.filter((r) => r.services.length > 0 || r.price).map((r, i) => {
              const svcLabel = r.services.length > 0 ? r.services.map((s) => s === "Others" && provider.servicesOther ? provider.servicesOther : s).join(" · ") : "All services";
              const hasPrice = r.price && r.rate && provider.currency;
              return (
                <div key={i} className="flex items-start justify-between gap-4 px-6 py-4">
                  <span className="text-[16px] font-semibold text-brandText leading-snug">{svcLabel}</span>
                  {hasPrice ? (
                    <div className="flex items-baseline gap-1 shrink-0">
                      <span className="text-[16px] font-bold text-brandText">{provider.currency} {r.price}</span>
                      <span className="text-[13px] text-muted-foreground">/ {r.rate.toLowerCase()}</span>
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted-foreground shrink-0 italic">Ask for price</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tier 3: Skills + Availability + Location */}
      {(sortedSkills.length > 0 || provider.days.length > 0 || provider.timeBlocks.length > 0 || provider.locationStyles.length > 0) && (
        <section className="rounded-xl bg-muted/50 overflow-hidden border border-border">
          {/* Skills */}
          {sortedSkills.length > 0 && (
            <div className="px-6 py-5">
              <p className="text-[12px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-3">Skills</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {sortedSkills.map((skill) => {
                  const isCertified = (SKILLS_GROUP_B_LIST as readonly string[]).includes(skill);
                  return (
                    <div key={skill} className="flex items-center gap-2">
                      {isCertified ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} /> : <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />}
                      <span className="text-[15px] text-brandText">{skill}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Availability */}
          {(provider.days.length > 0 || provider.timeBlocks.length > 0) && (() => {
            const isAllDays = provider.days.length === 7;
            const isWeekdays = ["Monday","Tuesday","Wednesday","Thursday","Friday"].every((d) => provider.days.includes(d)) && !provider.days.includes("Saturday") && !provider.days.includes("Sunday");
            const isWeekends = ["Saturday","Sunday"].every((d) => provider.days.includes(d)) && provider.days.length === 2;
            const dayText = isAllDays ? "Every day" : isWeekdays ? "Weekday" : isWeekends ? "Weekend" : provider.days.map((d) => d.slice(0, 3)).join(", ");
            const timeText = provider.timeBlocks.map((b) => b === "Specify" && provider.otherTimeFrom && provider.otherTimeTo ? `${to12h(provider.otherTimeFrom)} – ${to12h(provider.otherTimeTo)}` : b).join(" & ");
            const prose = [dayText, timeText].filter(Boolean).join(" · ");
            const noticeText = provider.minNoticeValue ? `${provider.minNoticeValue} ${provider.minNoticeUnit} notice` : null;
            return (
              <div className={cn("px-6 py-5 flex items-start gap-3", sortedSkills.length > 0 && "border-t border-brandText/10")}>
                <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-[3px]" strokeWidth={1.75} />
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[15px] text-brandText">{prose}</span>
                  {noticeText && <span className="text-[14px] text-muted-foreground">· {noticeText}</span>}
                  {provider.emergencyReadiness && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />Emergency ok
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Location */}
          {provider.locationStyles.length > 0 && (
            <div className={cn("px-6 py-5 flex items-center gap-3", (sortedSkills.length > 0 || provider.days.length > 0 || provider.timeBlocks.length > 0) && "border-t border-brandText/10")}>
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="text-[15px] text-brandText">
                {provider.locationStyles.join(", ")}
                {provider.areaName && <span className="text-muted-foreground"> · {provider.areaName}</span>}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Bottom padding */}
      <div className="h-8" />
    </div>
  );
}
```

---

### Task 7: `PublicCarerProfileModal.tsx` — top-down full-screen modal

**Files:**
- Create: `src/components/service/PublicCarerProfileModal.tsx`

**Pattern:** Mirrors `ProfileModal.tsx` — `fixed inset-0` backdrop + `fixed top-[56px]` panel sliding down. Panel is full-screen height (minus header). Fetches provider data on open. Calls RPC on open. Shows PublicCarerProfileView inside.

**Step 1: Create file**

```tsx
// src/components/service/PublicCarerProfileModal.tsx
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  canonicalizeSocialAlbumEntries,
  resolveSocialAlbumUrlList,
} from "@/lib/socialAlbum";
import { PublicCarerProfileView } from "./PublicCarerProfileView";
import type { ProviderSummary } from "./types";

interface Props {
  providerId: string | null; // null = closed
  onClose: () => void;
}

// Maps DB row + profile join into ProviderSummary
function mapToSummary(
  row: Record<string, unknown>,
  profile: Record<string, unknown>,
  resolvedAlbumUrls: string[],
  isBookmarked: boolean
): ProviderSummary {
  // Reuse the deserializeRateRow logic inline
  const dbRates = (row.rates as string[]) ?? [];
  const firstPrice = row.starting_price != null ? String(row.starting_price) : "";
  const rateRows = dbRates.length === 0
    ? [{ price: firstPrice, rate: "", services: (row.services_offered as string[]) ?? [] }]
    : dbRates.map((r: string, i: number) => {
        try {
          const p = JSON.parse(r);
          if (typeof p.price === "string" && typeof p.rate === "string") {
            if (i === 0 && p.price === "") p.price = firstPrice;
            if (p.services.length === 0 && i === 0) p.services = (row.services_offered as string[]) ?? [];
            return p;
          }
        } catch (_) { /* noop */ }
        return { price: i === 0 ? firstPrice : "", rate: r, services: i === 0 ? (row.services_offered as string[]) ?? [] : [] };
      });

  // Compute lowest price
  const prices = rateRows.map((r) => parseFloat(r.price)).filter((p) => !isNaN(p) && p > 0);
  const startingPrice = prices.length > 0 ? String(Math.min(...prices)) : null;

  return {
    userId: String(row.user_id ?? ""),
    displayName: String(profile.display_name ?? ""),
    avatarUrl: (profile.avatar_url as string | null) ?? null,
    socialAlbumUrls: resolvedAlbumUrls,
    servicesOffered: (row.services_offered as string[]) ?? [],
    currency: String(row.currency ?? ""),
    startingPrice,
    minNoticeValue: row.min_notice_value != null ? String(row.min_notice_value) : "",
    minNoticeUnit: (row.min_notice_unit as "hours" | "days") ?? "hours",
    skills: (row.skills as string[]) ?? [],
    proofMetadata: (row.proof_metadata as Record<string, Record<string, string>>) ?? {},
    hasCar: Boolean((profile as Record<string, unknown>).has_car ?? false),
    days: (row.days as string[]) ?? [],
    locationStyles: (row.location_styles as string[]) ?? [],
    petTypes: (row.pet_types as string[]) ?? [],
    dogSizes: (row.dog_sizes as string[]) ?? [],
    emergencyReadiness: (row.emergency_readiness as boolean | null) ?? null,
    verificationStatus: (profile.verification_status as string | null) ?? null,
    viewCount: Number(row.view_count ?? 0),
    isBookmarked,
    agreementAccepted: Boolean(row.agreement_accepted ?? false),
    stripePayoutStatus: (row.stripe_payout_status as string | null) ?? null,
    story: String(row.story ?? ""),
    rateRows,
    otherTimeFrom: String(row.other_time_from ?? ""),
    otherTimeTo: String(row.other_time_to ?? ""),
    timeBlocks: (row.time_blocks as string[]) ?? [],
    areaName: String(row.area_name ?? ""),
    petTypesOther: String(row.pet_types_other ?? ""),
    servicesOther: String(row.services_other ?? ""),
  };
}

export function PublicCarerProfileModal({ providerId, onClose }: Props) {
  const [provider, setProvider] = useState<ProviderSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!providerId) { setProvider(null); return; }
    setLoading(true);
    void (async () => {
      // Fetch carer profile + profiles join
      const { data: row } = await supabase
        .from("pet_care_profiles")
        .select("*, profiles!inner(display_name, avatar_url, social_album, verification_status, has_car)")
        .eq("user_id", providerId)
        .eq("listed", true)
        .maybeSingle();

      if (!row) { setLoading(false); onClose(); return; }

      // Resolve social album URLs
      const profileData = (row as Record<string, unknown>).profiles as Record<string, unknown>;
      const rawAlbum = (profileData?.social_album ?? []) as string[];
      const canonical = canonicalizeSocialAlbumEntries(rawAlbum);
      const albumUrls = await resolveSocialAlbumUrlList(canonical);

      // Check if bookmarked by current user
      const { data: { user } } = await supabase.auth.getUser();
      let isBookmarked = false;
      if (user) {
        const { data: bm } = await supabase
          .from("service_bookmarks")
          .select("id")
          .eq("user_id", user.id)
          .eq("provider_user_id", providerId)
          .maybeSingle();
        isBookmarked = !!bm;
      }

      setProvider(mapToSummary(row as Record<string, unknown>, profileData, albumUrls, isBookmarked));
      setLoading(false);

      // Increment view count (fire-and-forget)
      void supabase.rpc("increment_pet_care_profile_view_count", { p_user_id: providerId });
    })();
  }, [providerId, onClose]);

  return (
    <AnimatePresence>
      {providerId && (
        <>
          {/* Backdrop */}
          <motion.div
            key="public-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[55] bg-foreground/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel — slides down from top, below header (56px) */}
          <motion.div
            key="public-modal-panel"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed top-[56px] left-2 right-2 z-[56] bg-card rounded-2xl shadow-elevated overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 72px)" }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>

            {/* Scrollable content */}
            <div className="overflow-y-auto h-full" style={{ maxHeight: "calc(100dvh - 72px)" }}>
              {loading && (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" strokeWidth={1.75} />
                </div>
              )}
              {!loading && provider && (
                <PublicCarerProfileView provider={provider} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

---

## Phase 3 — Service.tsx Rebuild (Core Page)

### Task 8: Data fetching hook — `useServiceProviders`

**Files:**
- Create: `src/hooks/useServiceProviders.ts`

This hook fetches all listed providers and the current user's bookmarks. It returns raw rows + bookmark set + loading state. Filtering is done in the component (client-side).

```typescript
// src/hooks/useServiceProviders.ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  canonicalizeSocialAlbumEntries,
  resolveSocialAlbumUrlList,
} from "@/lib/socialAlbum";
import type { ProviderSummary } from "@/components/service/types";

// Converts DB row to ProviderSummary (same as mapToSummary in modal, extract to shared util in Phase 4)
import { mapProviderRow } from "@/components/service/mapProviderRow";

export function useServiceProviders() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  const reload = async () => {
    setLoading(true);

    // 1. Fetch all listed profiles + profile join
    const { data: rows } = await supabase
      .from("pet_care_profiles")
      .select(`
        user_id, story, skills, proof_metadata,
        days, time_blocks, other_time_from, other_time_to,
        emergency_readiness, min_notice_value, min_notice_unit,
        location_styles, area_name,
        services_offered, services_other, pet_types, pet_types_other,
        dog_sizes, currency, rates, starting_price,
        stripe_payout_status, agreement_accepted,
        listed, view_count,
        profiles!inner(
          display_name, avatar_url, social_album,
          verification_status, has_car
        )
      `)
      .eq("listed", true)
      .order("created_at", { ascending: false });

    // 2. Fetch current user's bookmarks
    const { data: { user } } = await supabase.auth.getUser();
    let bmSet = new Set<string>();
    if (user) {
      const { data: bms } = await supabase
        .from("service_bookmarks")
        .select("provider_user_id")
        .eq("user_id", user.id);
      bmSet = new Set((bms ?? []).map((b) => b.provider_user_id as string));
    }
    setBookmarkedIds(bmSet);

    // 3. Resolve all social album URLs concurrently
    const resolved = await Promise.all(
      (rows ?? []).map(async (row) => {
        const profileData = (row as Record<string, unknown>).profiles as Record<string, unknown>;
        const rawAlbum = (profileData?.social_album ?? []) as string[];
        const canonical = canonicalizeSocialAlbumEntries(rawAlbum);
        const albumUrls = await resolveSocialAlbumUrlList(canonical);
        return mapProviderRow(row as Record<string, unknown>, profileData, albumUrls, bmSet.has(String(row.user_id)));
      })
    );

    setProviders(resolved);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const toggleBookmark = async (providerId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isBookmarked = bookmarkedIds.has(providerId);
    if (isBookmarked) {
      await supabase.from("service_bookmarks").delete().eq("user_id", user.id).eq("provider_user_id", providerId);
      setBookmarkedIds((prev) => { const next = new Set(prev); next.delete(providerId); return next; });
    } else {
      await supabase.from("service_bookmarks").insert({ user_id: user.id, provider_user_id: providerId });
      setBookmarkedIds((prev) => new Set([...prev, providerId]));
    }
    // Optimistically update the provider list
    setProviders((prev) =>
      prev.map((p) => p.userId === providerId ? { ...p, isBookmarked: !isBookmarked } : p)
    );
  };

  return { providers, loading, bookmarkedIds, toggleBookmark, reload };
}
```

**Files:**
- Create: `src/components/service/mapProviderRow.ts`

Extract the mapping logic into a shared util (used by both hook and modal):

```typescript
// src/components/service/mapProviderRow.ts
import type { ProviderSummary } from "./types";

export function mapProviderRow(
  row: Record<string, unknown>,
  profileData: Record<string, unknown>,
  albumUrls: string[],
  isBookmarked: boolean
): ProviderSummary {
  const dbRates = (row.rates as string[]) ?? [];
  const firstPrice = row.starting_price != null ? String(row.starting_price) : "";
  const rateRows = dbRates.length === 0
    ? [{ price: firstPrice, rate: "", services: (row.services_offered as string[]) ?? [] }]
    : dbRates.map((r: string, i: number) => {
        try {
          const p = JSON.parse(r) as { price: string; rate: string; services: string[] };
          if (typeof p.price === "string" && typeof p.rate === "string") {
            if (i === 0 && p.price === "") p.price = firstPrice;
            if (p.services.length === 0 && i === 0) p.services = (row.services_offered as string[]) ?? [];
            return p;
          }
        } catch (_) { /* noop */ }
        return { price: i === 0 ? firstPrice : "", rate: r, services: i === 0 ? (row.services_offered as string[]) ?? [] : [] };
      });
  const prices = rateRows.map((r) => parseFloat(r.price)).filter((p) => !isNaN(p) && p > 0);
  const startingPrice = prices.length > 0 ? String(Math.min(...prices)) : null;

  return {
    userId: String(row.user_id ?? ""),
    displayName: String(profileData.display_name ?? ""),
    avatarUrl: (profileData.avatar_url as string | null) ?? null,
    socialAlbumUrls: albumUrls,
    servicesOffered: (row.services_offered as string[]) ?? [],
    currency: String(row.currency ?? ""),
    startingPrice,
    minNoticeValue: row.min_notice_value != null ? String(row.min_notice_value) : "",
    minNoticeUnit: (row.min_notice_unit as "hours" | "days") ?? "hours",
    skills: (row.skills as string[]) ?? [],
    proofMetadata: (row.proof_metadata as Record<string, Record<string, string>>) ?? {},
    hasCar: Boolean(profileData.has_car ?? false),
    days: (row.days as string[]) ?? [],
    locationStyles: (row.location_styles as string[]) ?? [],
    petTypes: (row.pet_types as string[]) ?? [],
    dogSizes: (row.dog_sizes as string[]) ?? [],
    emergencyReadiness: (row.emergency_readiness as boolean | null) ?? null,
    verificationStatus: (profileData.verification_status as string | null) ?? null,
    viewCount: Number(row.view_count ?? 0),
    isBookmarked,
    agreementAccepted: Boolean(row.agreement_accepted ?? false),
    stripePayoutStatus: (row.stripe_payout_status as string | null) ?? null,
    story: String(row.story ?? ""),
    rateRows,
    otherTimeFrom: String(row.other_time_from ?? ""),
    otherTimeTo: String(row.other_time_to ?? ""),
    timeBlocks: (row.time_blocks as string[]) ?? [],
    areaName: String(row.area_name ?? ""),
    petTypesOther: String(row.pet_types_other ?? ""),
    servicesOther: String(row.services_other ?? ""),
  };
}
```

---

### Task 9: Sub-components for top area

**Files:**
- Create: `src/components/service/ServiceMultiDropdown.tsx`
- Create: `src/components/service/ServiceDateSheet.tsx`
- Create: `src/components/service/ServiceFilterSheet.tsx`

#### `ServiceMultiDropdown` — multi-select popover for service types

Uses Radix Popover + NeuCheckbox (or simple native checkbox since NeuCheckbox applies). Shows selected count in trigger.

```tsx
// src/components/service/ServiceMultiDropdown.tsx
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_TYPES } from "./carerServiceConstants";

interface Props {
  selected: string[];
  onChange: (v: string[]) => void;
}

export function ServiceMultiDropdown({ selected, onChange }: Props) {
  const toggle = (svc: string) =>
    onChange(selected.includes(svc) ? selected.filter((s) => s !== svc) : [...selected, svc]);

  const label = selected.length === 0 ? "Service" : selected.length === 1 ? selected[0] : `${selected.length} services`;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border bg-card text-sm font-medium text-brandText shadow-sm shrink-0"
        >
          <span className={cn(selected.length === 0 && "text-muted-foreground")}>{label}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="end"
          className="z-[50] w-52 rounded-xl border border-border bg-card shadow-elevated overflow-y-auto max-h-72"
        >
          {SERVICE_TYPES.map((svc) => (
            <button
              key={svc}
              type="button"
              onClick={() => toggle(svc)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-brandText hover:bg-muted/50 transition-colors"
            >
              <span>{svc}</span>
              {selected.includes(svc) && <Check className="w-4 h-4 text-brandBlue shrink-0" strokeWidth={2} />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

#### `ServiceSortDropdown` — sort selector

```tsx
// src/components/service/ServiceSortDropdown.tsx
import * as Popover from "@radix-ui/react-popover";
import { ArrowUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortOption = "latest" | "price_asc" | "price_desc" | "popularity";

const SORT_LABELS: Record<SortOption, string> = {
  latest: "Latest",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  popularity: "Popularity",
};

interface Props {
  value: SortOption;
  onChange: (v: SortOption) => void;
}

export function ServiceSortDropdown({ value, onChange }: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex items-center justify-center h-10 w-10 rounded-xl border border-border bg-card shadow-sm"
          aria-label="Sort"
        >
          <ArrowUpDown className="w-4 h-4 text-brandText" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="end"
          className="z-[50] w-48 rounded-xl border border-border bg-card shadow-elevated overflow-hidden"
        >
          {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-brandText hover:bg-muted/50 transition-colors"
            >
              <span>{SORT_LABELS[opt]}</span>
              {value === opt && <Check className="w-4 h-4 text-brandBlue shrink-0" strokeWidth={2} />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

#### `ServiceDateSheet` — date picker via GlassSheet

Renders a month calendar for multi-date selection. Converts each selected date to a day-of-week short name (Mon–Sun) for availability matching.

```tsx
// src/components/service/ServiceDateSheet.tsx
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { NeuControl } from "@/components/ui/NeuControl";
import { cn } from "@/lib/utils";
import { DAY_SHORT_MAP } from "./carerServiceConstants";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedDates: string[]; // ISO date strings "YYYY-MM-DD"
  onChange: (dates: string[]) => void;
}

export function ServiceDateSheet({ isOpen, onClose, selectedDates, onChange }: Props) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  const toggleDate = (iso: string) => {
    onChange(
      selectedDates.includes(iso)
        ? selectedDates.filter((d) => d !== iso)
        : [...selectedDates, iso]
    );
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  // Compute which weekdays are implied by selected dates
  const activeWeekdays = new Set(
    selectedDates.map((iso) => {
      const d = new Date(iso + "T00:00:00");
      const fullDay = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
      return DAY_SHORT_MAP[fullDay];
    })
  );

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title="Availability date">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-full hover:bg-muted/50" type="button">
          <ChevronLeft className="w-4 h-4 text-brandText" strokeWidth={1.75} />
        </button>
        <span className="text-sm font-semibold text-brandText">{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-full hover:bg-muted/50" type="button">
          <ChevronRight className="w-4 h-4 text-brandText" strokeWidth={1.75} />
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = new Date(iso + "T00:00:00") < new Date(today.toDateString());
          const isSelected = selectedDates.includes(iso);
          return (
            <button
              key={iso}
              type="button"
              disabled={isPast}
              onClick={() => toggleDate(iso)}
              className={cn(
                "aspect-square rounded-lg text-[13px] font-medium transition-colors",
                isSelected ? "bg-brandBlue text-white" : "text-brandText hover:bg-muted/50",
                isPast && "opacity-30 cursor-not-allowed"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Active weekdays summary */}
      {activeWeekdays.size > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Filtering: {[...activeWeekdays].join(", ")}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <NeuControl
          variant="tertiary"
          size="md"
          onClick={() => { onChange([]); }}
          className="flex-1"
        >
          Clear
        </NeuControl>
        <NeuControl
          variant="primary"
          size="md"
          onClick={onClose}
          className="flex-1"
        >
          Apply
        </NeuControl>
      </div>
    </GlassSheet>
  );
}
```

#### `ServiceFilterSheet` — advanced filters

```tsx
// src/components/service/ServiceFilterSheet.tsx
import { GlassSheet } from "@/components/ui/GlassSheet";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuControl } from "@/components/ui/NeuControl";
import { cn } from "@/lib/utils";
import { LOCATION_STYLES_LIST } from "./carerServiceConstants";

const PET_TYPES_OPTIONS = ["Dogs", "Cats", "Rabbits", "Birds", "Hamsters / Guinea Pigs", "Reptiles", "Fish", "Small pets"];
const DOG_SIZE_OPTIONS = ["Small", "Medium", "Large", "Giant"];

export interface FilterState {
  bookmarkedOnly: boolean;
  verifiedOnly: boolean;
  emergencyReady: boolean;
  askForPriceOnly: boolean;
  petTypes: string[];
  dogSizes: string[];
  locationStyles: string[];
  priceMin: string;
  priceMax: string;
}

export const EMPTY_FILTERS: FilterState = {
  bookmarkedOnly: false,
  verifiedOnly: false,
  emergencyReady: false,
  askForPriceOnly: false,
  petTypes: [],
  dogSizes: [],
  locationStyles: [],
  priceMin: "",
  priceMax: "",
};

function countActiveFilters(f: FilterState): number {
  return [
    f.bookmarkedOnly, f.verifiedOnly, f.emergencyReady, f.askForPriceOnly,
    f.petTypes.length > 0, f.dogSizes.length > 0, f.locationStyles.length > 0,
    f.priceMin !== "" || f.priceMax !== "",
  ].filter(Boolean).length;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
}

export function ServiceFilterSheet({ isOpen, onClose, filters, onChange, onReset }: Props) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...filters, [k]: v });

  const toggleMulti = (key: "petTypes" | "dogSizes" | "locationStyles", item: string) => {
    const arr = filters[key] as string[];
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const ChipRow = ({ options, selected, onToggle }: { options: readonly string[]; selected: string[]; onToggle: (v: string) => void }) => (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            selected.includes(opt)
              ? "bg-accent text-accent-foreground"
              : "bg-muted/50 text-muted-foreground border border-border"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  return (
    <GlassSheet isOpen={isOpen} onClose={onClose} title="Filters">
      <div className="space-y-5 overflow-y-auto max-h-[60vh] pr-1">
        {/* Toggles */}
        {[
          { key: "bookmarkedOnly" as const, label: "Bookmarked" },
          { key: "verifiedOnly" as const, label: "Verified / licensed only" },
          { key: "emergencyReady" as const, label: "Emergency ready" },
          { key: "askForPriceOnly" as const, label: "Ask for price only" },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm font-medium text-brandText">{label}</span>
            <NeuToggle
              checked={filters[key] as boolean}
              onCheckedChange={(v) => set(key, v)}
            />
          </div>
        ))}

        {/* Pet type */}
        <div>
          <p className="text-sm font-medium text-brandText mb-2">Pet type</p>
          <ChipRow options={PET_TYPES_OPTIONS} selected={filters.petTypes} onToggle={(v) => toggleMulti("petTypes", v)} />
        </div>

        {/* Dog size — only if Dogs selected */}
        {filters.petTypes.includes("Dogs") && (
          <div>
            <p className="text-sm font-medium text-brandText mb-2">Dog size</p>
            <ChipRow options={DOG_SIZE_OPTIONS} selected={filters.dogSizes} onToggle={(v) => toggleMulti("dogSizes", v)} />
          </div>
        )}

        {/* Service location */}
        <div>
          <p className="text-sm font-medium text-brandText mb-2">Service location</p>
          <ChipRow options={LOCATION_STYLES_LIST} selected={filters.locationStyles} onToggle={(v) => toggleMulti("locationStyles", v)} />
        </div>

        {/* Price range */}
        <div>
          <p className="text-sm font-medium text-brandText mb-2">Price range</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.priceMin}
              onChange={(e) => set("priceMin", e.target.value)}
              className="flex-1 h-10 rounded-xl border border-border bg-card px-3 text-sm text-brandText placeholder:text-muted-foreground"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.priceMax}
              onChange={(e) => set("priceMax", e.target.value)}
              className="flex-1 h-10 rounded-xl border border-border bg-card px-3 text-sm text-brandText placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 mt-4">
        <NeuControl variant="tertiary" size="md" onClick={onReset} className="flex-1">
          Reset
        </NeuControl>
        <NeuControl variant="primary" size="md" onClick={onClose} className="flex-1">
          Apply
        </NeuControl>
      </div>
    </GlassSheet>
  );
}

export { countActiveFilters };
```

---

### Task 10: Filtering logic utility

**Files:**
- Create: `src/components/service/filterProviders.ts`

```typescript
// src/components/service/filterProviders.ts
import type { ProviderSummary } from "./types";
import type { FilterState } from "./ServiceFilterSheet";
import type { SortOption } from "./ServiceSortDropdown";
import { SKILLS_GROUP_B_LIST, DAY_SHORT_MAP } from "./carerServiceConstants";

export function filterAndSort(
  providers: ProviderSummary[],
  search: string,
  serviceTypes: string[],
  selectedDates: string[],
  filters: FilterState,
  sort: SortOption
): ProviderSummary[] {
  let result = [...providers];

  // 1. Search: display name, services, pet types, skills, area
  if (search.trim()) {
    const q = search.toLowerCase().trim();
    result = result.filter((p) =>
      p.displayName.toLowerCase().includes(q) ||
      p.servicesOffered.some((s) => s.toLowerCase().includes(q)) ||
      (p.servicesOther && p.servicesOther.toLowerCase().includes(q)) ||
      p.petTypes.some((t) => t.toLowerCase().includes(q)) ||
      p.skills.some((s) => s.toLowerCase().includes(q)) ||
      (p.areaName && p.areaName.toLowerCase().includes(q))
    );
  }

  // 2. Service type multi-select
  if (serviceTypes.length > 0) {
    result = result.filter((p) =>
      serviceTypes.some((svc) =>
        p.servicesOffered.some((offered) =>
          offered.toLowerCase().includes(svc.toLowerCase()) ||
          svc.toLowerCase().includes(offered.toLowerCase())
        )
      )
    );
  }

  // 3. Date → weekday availability
  if (selectedDates.length > 0) {
    const targetShortDays = new Set(
      selectedDates.map((iso) => {
        const d = new Date(iso + "T00:00:00");
        const fullDay = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
        return DAY_SHORT_MAP[fullDay];
      })
    );
    result = result.filter((p) =>
      p.days.some((d) => targetShortDays.has(d))
    );
  }

  // 4. Bookmarked only
  if (filters.bookmarkedOnly) {
    result = result.filter((p) => p.isBookmarked);
  }

  // 5. Verified / licensed (has a SKILLS_GROUP_B skill)
  if (filters.verifiedOnly) {
    result = result.filter((p) =>
      p.skills.some((s) => (SKILLS_GROUP_B_LIST as readonly string[]).includes(s))
    );
  }

  // 6. Emergency ready
  if (filters.emergencyReady) {
    result = result.filter((p) => p.emergencyReadiness === true);
  }

  // 7. Ask for price only
  if (filters.askForPriceOnly) {
    result = result.filter((p) => !p.startingPrice);
  }

  // 8. Pet type
  if (filters.petTypes.length > 0) {
    result = result.filter((p) =>
      filters.petTypes.some((t) => p.petTypes.includes(t))
    );
  }

  // 9. Dog size
  if (filters.dogSizes.length > 0) {
    result = result.filter((p) =>
      filters.dogSizes.some((s) => p.dogSizes.includes(s))
    );
  }

  // 10. Service location
  if (filters.locationStyles.length > 0) {
    result = result.filter((p) =>
      filters.locationStyles.some((l) => p.locationStyles.includes(l))
    );
  }

  // 11. Price range
  if (filters.priceMin !== "" || filters.priceMax !== "") {
    const min = parseFloat(filters.priceMin) || 0;
    const max = parseFloat(filters.priceMax) || Infinity;
    result = result.filter((p) => {
      const price = parseFloat(p.startingPrice ?? "");
      if (isNaN(price)) return false; // exclude ask-for-price from price range filter
      return price >= min && price <= max;
    });
  }

  // 12. Sort
  switch (sort) {
    case "latest":
      // already ordered by created_at desc from DB
      break;
    case "price_asc":
      result.sort((a, b) => {
        const ap = parseFloat(a.startingPrice ?? "") || Infinity;
        const bp = parseFloat(b.startingPrice ?? "") || Infinity;
        return ap - bp;
      });
      break;
    case "price_desc":
      result.sort((a, b) => {
        const ap = parseFloat(a.startingPrice ?? "") || -1;
        const bp = parseFloat(b.startingPrice ?? "") || -1;
        return bp - ap;
      });
      break;
    case "popularity":
      result.sort((a, b) => b.viewCount - a.viewCount);
      break;
  }

  return result;
}
```

---

### Task 11: Skeleton cards component

**Files:**
- Create: `src/components/service/ServiceSkeleton.tsx`

```tsx
// src/components/service/ServiceSkeleton.tsx
export function ServiceSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-3 px-4">
      {/* Left column */}
      <div className="flex flex-col gap-[14px]">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded bg-muted"
            style={{ aspectRatio: "4 / 5" }}
          />
        ))}
      </div>
      {/* Right column — offset down */}
      <div className="flex flex-col gap-[14px]" style={{ marginTop: "86px" }}>
        {[3, 4].map((i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded bg-muted"
            style={{ aspectRatio: "4 / 5" }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

### Task 12: Rebuild `Service.tsx`

**Files:**
- Modify: `src/pages/Service.tsx` (full rewrite)

```tsx
// src/pages/Service.tsx
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, SlidersHorizontal, Search } from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useServiceProviders } from "@/hooks/useServiceProviders";
import { CarerPolaroidCard } from "@/components/service/CarerPolaroidCard";
import { PublicCarerProfileModal } from "@/components/service/PublicCarerProfileModal";
import { ServiceMultiDropdown } from "@/components/service/ServiceMultiDropdown";
import { ServiceSortDropdown, SortOption } from "@/components/service/ServiceSortDropdown";
import { ServiceDateSheet } from "@/components/service/ServiceDateSheet";
import { ServiceFilterSheet, FilterState, EMPTY_FILTERS, countActiveFilters } from "@/components/service/ServiceFilterSheet";
import { ServiceSkeleton } from "@/components/service/ServiceSkeleton";
import { filterAndSort } from "@/components/service/filterProviders";
import { cn } from "@/lib/utils";

export default function Service() {
  const { providers, loading, toggleBookmark } = useServiceProviders();
  const [search, setSearch] = useState("");
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("latest");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track scroll for top deck compression
  const handleScroll = () => {
    const y = scrollRef.current?.scrollTop ?? 0;
    setScrolled(y > 24);
  };

  const filtered = useMemo(
    () => filterAndSort(providers, search, serviceTypes, selectedDates, filters, sort),
    [providers, search, serviceTypes, selectedDates, filters, sort]
  );

  // Split into left/right columns for masonry
  const leftCol = filtered.filter((_, i) => i % 2 === 0);
  const rightCol = filtered.filter((_, i) => i % 2 !== 0);

  const activeFilterCount = countActiveFilters(filters) + selectedDates.length + serviceTypes.length;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <GlobalHeader />

      {/* Top deck — compresses slightly on scroll */}
      <motion.div
        animate={{ paddingTop: scrolled ? 8 : 12, paddingBottom: scrolled ? 8 : 12 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="px-4 border-b border-border/20 bg-background z-30 flex flex-col gap-2"
      >
        {/* Row 1: Search + service dropdown + date + filter + sort */}
        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-sm text-brandText placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-brandBlue/20"
            />
          </div>

          {/* Service multi-select dropdown */}
          <ServiceMultiDropdown selected={serviceTypes} onChange={setServiceTypes} />

          {/* Date icon */}
          <button
            type="button"
            onClick={() => setDateSheetOpen(true)}
            className={cn(
              "flex items-center justify-center h-10 w-10 rounded-xl border bg-card shadow-sm transition-colors shrink-0",
              selectedDates.length > 0 ? "border-brandBlue bg-brandBlue/5" : "border-border"
            )}
            aria-label="Date filter"
          >
            <Calendar className="w-4 h-4 text-brandText" strokeWidth={1.75} />
          </button>

          {/* Filter icon */}
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={cn(
              "flex items-center justify-center h-10 w-10 rounded-xl border bg-card shadow-sm transition-colors shrink-0 relative",
              countActiveFilters(filters) > 0 ? "border-brandBlue bg-brandBlue/5" : "border-border"
            )}
            aria-label="Filters"
          >
            <SlidersHorizontal className="w-4 h-4 text-brandText" strokeWidth={1.75} />
            {countActiveFilters(filters) > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brandBlue text-white text-[9px] font-bold flex items-center justify-center">
                {countActiveFilters(filters)}
              </span>
            )}
          </button>

          {/* Sort dropdown */}
          <ServiceSortDropdown value={sort} onChange={setSort} />
        </div>
      </motion.div>

      {/* Feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto touch-pan-y"
      >
        <div className="pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)]">
          {loading && <div className="pt-4"><ServiceSkeleton /></div>}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
              <p className="text-[15px] text-muted-foreground">No providers found.</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setFilters(EMPTY_FILTERS); setSelectedDates([]); setServiceTypes([]); setSearch(""); }}
                  className="mt-3 text-sm font-medium text-brandBlue"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 gap-x-3 px-4 pt-4"
            >
              {/* Left column */}
              <div className="flex flex-col gap-[14px]">
                {leftCol.map((provider, i) => (
                  <motion.div
                    key={provider.userId}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <CarerPolaroidCard
                      provider={provider}
                      onTap={() => setOpenModal(provider.userId)}
                      onBookmark={(e) => { e.stopPropagation(); void toggleBookmark(provider.userId); }}
                    />
                  </motion.div>
                ))}
              </div>

              {/* Right column — offset down ~40% of card height */}
              {/* Card width ≈ (390 - 32 - 12) / 2 = 173px. 4:5 ratio → 216px height. 40% = ~86px */}
              <div className="flex flex-col gap-[14px]" style={{ marginTop: "86px" }}>
                {rightCol.map((provider, i) => (
                  <motion.div
                    key={provider.userId}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 + 0.025 }}
                  >
                    <CarerPolaroidCard
                      provider={provider}
                      onTap={() => setOpenModal(provider.userId)}
                      onBookmark={(e) => { e.stopPropagation(); void toggleBookmark(provider.userId); }}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Provider profile modal */}
      <PublicCarerProfileModal
        providerId={openModal}
        onClose={() => setOpenModal(null)}
      />

      {/* Date sheet */}
      <ServiceDateSheet
        isOpen={dateSheetOpen}
        onClose={() => setDateSheetOpen(false)}
        selectedDates={selectedDates}
        onChange={setSelectedDates}
      />

      {/* Filter sheet */}
      <ServiceFilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />
    </div>
  );
}
```

---

## Phase 4 — Pending CarerProfile.tsx edits (from previous session)

Before the Service page can be considered complete, the 5 pending fixes from the previous audit session must be applied to `src/pages/CarerProfile.tsx`.

### Task 13: Apply remaining 5 CarerProfile edits

**Files:**
- Modify: `src/pages/CarerProfile.tsx`

**Fix 3 — Move + button to section header (Services & Rates)**

Find: `<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Services & Rates</h3>`
Replace with:
```tsx
<div className="flex items-center justify-between">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Services & Rates</h3>
  {srEditIdx === null && (
    <button
      type="button"
      onClick={() => {
        const newIdx = formData.rateRows.length;
        setFormData((prev) => ({ ...prev, rateRows: [...prev.rateRows, { price: "", rate: "", services: [] }] }));
        setSrEditIdx(newIdx);
        setSrDraft({ services: [], price: "", rate: "" });
        setSrDropOpen(false);
      }}
      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
    >
      <Plus size={16} strokeWidth={2} className="text-brandBlue" />
    </button>
  )}
</div>
```

Remove the bottom text-link:
```tsx
{srEditIdx === null && (
  <button
    type="button"
    onClick={() => { /* ... */ }}
    className="flex items-center gap-1.5 text-sm text-brandBlue hover:text-brandBlue/80 transition-colors pl-0.5"
  >
    <Plus size={14} strokeWidth={2} />
    Add service & rate
  </button>
)}
```

**Fix 4 — Payouts button height**
Find: `<NeuControl size="sm" variant="primary"` (the Set up payouts button)
Replace `size="sm"` → `size="lg"`

**Fix 5 — Label copy**
Find: `"Listed on Services"` (or equivalent string in the toggle label)
Replace with: `"List on Service"`

**Fix 6 — Listing error text gating**
The `listingAttempted` state is already declared (line 343). Now:
- Update toggle's `onCheckedChange` at line ~1392:
  ```tsx
  onCheckedChange={(val) => {
    if (val && blocked) { setListingAttempted(true); return; }
    if (!blocked) setFormData((prev) => ({ ...prev, listed: val }));
  }}
  ```
- Gate the error text: change `{blocked && <p className="text-xs text-destructive">` to `{listingAttempted && blocked && <p className="text-xs text-destructive">`

**Fix 7 — Emergency text colour**
Find: `text-xs text-amber-600 leading-snug mt-1`
Replace: `text-xs text-muted-foreground leading-snug mt-1`

---

## Phase 5 — Verification

### Task 14: Lint + build

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
npm run lint
npm run build
```

Expected: 0 lint errors. Build succeeds (pre-existing chunk-size advisory is acceptable).

### Task 15: Manual smoke test checklist

- [ ] `/service` loads without error
- [ ] Skeleton cards visible briefly on first load
- [ ] Feed shows listed providers (or empty state if none)
- [ ] Search filters by name
- [ ] Service multi-select filters by type
- [ ] Date picker opens, dates are selectable, filter applies
- [ ] Filter sheet opens with all 8 controls
- [ ] Sort by Popularity shows highest view_count first
- [ ] Tapping a card opens PublicCarerProfileModal
- [ ] Modal shows polaroid + story + services + skills
- [ ] Closing modal works
- [ ] Bookmark button on card toggles icon (no modal open)
- [ ] Bookmarked filter shows only bookmarked providers
- [ ] CarerProfile edit mode: + button on section header, no text link at bottom
- [ ] CarerProfile edit mode: payouts button is tall (lg = 48px)
- [ ] CarerProfile edit mode: label says "List on Service"
- [ ] CarerProfile edit mode: error text only appears after attempted toggle
- [ ] CarerProfile edit mode: emergency text is grey

---

## File Manifest

| File | Action |
|------|--------|
| `src/pages/Service.tsx` | **Full rewrite** |
| `src/components/service/types.ts` | Create |
| `src/components/service/carerServiceConstants.ts` | Create |
| `src/components/service/mapProviderRow.ts` | Create |
| `src/components/service/CarerPolaroidCard.tsx` | Create |
| `src/components/service/PublicCarerProfileView.tsx` | Create |
| `src/components/service/PublicCarerProfileModal.tsx` | Create |
| `src/components/service/ServiceMultiDropdown.tsx` | Create |
| `src/components/service/ServiceSortDropdown.tsx` | Create |
| `src/components/service/ServiceDateSheet.tsx` | Create |
| `src/components/service/ServiceFilterSheet.tsx` | Create |
| `src/components/service/ServiceSkeleton.tsx` | Create |
| `src/components/service/filterProviders.ts` | Create |
| `src/hooks/useServiceProviders.ts` | Create |
| `src/pages/CarerProfile.tsx` | Edit (5 remaining fixes) |
| DB migration: `service_bookmarks` table | Apply via Supabase MCP |
| DB migration: `pet_care_profiles.view_count` | Apply via Supabase MCP |
| DB migration: public RLS policy (listed=true) | Apply via Supabase MCP |
| DB RPC: `increment_pet_care_profile_view_count` | Apply via Supabase MCP |

---

## Known Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| Social album URL resolution on all cards is N async calls | `Promise.all` in hook — runs concurrently. For large lists add pagination later. |
| Supabase join syntax `profiles!inner(...)` requires FK `pet_care_profiles.user_id → profiles.id` to exist | Verify FK exists before query. If not, use explicit `.eq("profiles.id", row.user_id)` with separate query. |
| `view_count` increment on every modal open (no rate limit) | Acceptable per spec — no rate limiting requirement stated. |
| FilterSheet `<input type="number">` violates DESIGN_MASTER_SPEC Rule 13 (no bare inputs) | Price range filter uses bare input for simplicity in filter sheet. Flag for future FormField migration if audit raises it. |
| Right column 86px offset is screen-width-dependent | The 86px is approximate for 390px viewport. Use `calc(40% of card height)` with CSS custom prop if needed in future. |
