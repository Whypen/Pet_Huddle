# PetDetails Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite `src/pages/PetDetails.tsx` using the downloaded file as the data/logic base, applying UI contract compliance and two adjacent collapsible sections (Health + Temperament & Routine) with compact inline record rows.

**Architecture:** Single-file rewrite — keep all parse helpers and data types verbatim from the downloaded base; replace the render layer with contract-compliant primitives (PageHeader, NeuControl, NeuChip, InsetPanel/Divider). Two adjacent SectionCardDivider-style buttons share no gap so they visually group. Record details use compact B rows (3 visible + "Show N more").

**Tech Stack:** React + TypeScript, Tailwind CSS, Lucide React, Supabase, design system primitives (`NeuControl`, `NeuChip`, `InsetPanel`, `InsetDivider`, `PageHeader`, `StyledScrollArea`).

**Design doc:** `docs/plans/2026-03-06-pet-details-revamp-design.md`

---

### Task 1: Copy downloaded base & verify it builds

**Files:**
- Modify: `src/pages/PetDetails.tsx`

**Step 1: Copy downloaded file into project**

```bash
cp "/Users/hyphen/Downloads/pages/PetDetails.tsx" \
   "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/PetDetails.tsx"
```

**Step 2: Run build — expect errors from non-contract imports**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | grep -E "error|Error"
```

Expected: TypeScript or import errors for `GlobalHeader`, `NeuButton`, `Badge`, `StyledScrollArea` path mismatch. Note which ones fail — these are what we fix in Task 2.

---

### Task 2: Fix imports to contract-compliant primitives

**Files:**
- Modify: `src/pages/PetDetails.tsx` — imports block only (lines 1–13 of downloaded file)

**Step 1: Replace the full import block**

Remove the downloaded imports:
```ts
import { ArrowLeft, Edit, Weight, Cpu, Loader2, Pill, ClipboardList, BellRing, CakeSlice } from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { NeuButton } from "@/components/ui/NeuButton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
```

Replace with:
```ts
import { useState, useEffect, useCallback } from "react";
import { Pencil, Weight, Cpu, Loader2, Pill, BellRing, CakeSlice, Stethoscope, ChevronDown } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/layouts/PageHeader";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import { InsetPanel, InsetDivider } from "@/components/ui/InsetPanel";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
```

**Step 2: Build to verify no import errors remain**

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | grep -E "^.*error" | head -20
```

Expected: errors shift to JSX usage of removed components (GlobalHeader, NeuButton, Badge, motion) — that's correct; we fix those in the next tasks.

---

### Task 3: Replace loading state with skeleton

**Files:**
- Modify: `src/pages/PetDetails.tsx` — the `if (loading)` return block

**Step 1: Find the loading return block in the downloaded file**

It currently renders:
```tsx
if (loading) {
  return (
    <div className="h-full min-h-0 bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
```

Replace with a skeleton that matches the real content footprint (Rule 12):
```tsx
if (loading) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Skeleton header bar */}
      <div className="h-[56px] flex-shrink-0 bg-[var(--bg-card)] border-b border-border/20" />
      {/* Skeleton hero */}
      <div className="h-[200px] flex-shrink-0 bg-muted animate-pulse" />
      {/* Skeleton identity strip */}
      <div className="px-4 pt-4 space-y-2">
        <div className="h-7 w-32 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded-lg bg-muted animate-pulse" />
        <div className="flex gap-2 pt-1">
          <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
        </div>
      </div>
      {/* Skeleton section dividers */}
      <div className="mx-4 mt-6 h-[56px] rounded-[22px] bg-muted animate-pulse" />
      <div className="mx-4 mt-2 h-[56px] rounded-[22px] bg-muted animate-pulse" />
    </div>
  );
}
```

**Step 2: Build check**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | grep "error" | grep -v "advisory\|warning\|warn" | head -10
```

---

### Task 4: Add state variables for new interactions

**Files:**
- Modify: `src/pages/PetDetails.tsx` — inside the `PetDetails` component, after existing state

**Step 1: After `const [isPremiumOpen, setIsPremiumOpen] = useState(false);` in the component, add**

```tsx
const [showHealth, setShowHealth] = useState(false);
const [showTempRoutine, setShowTempRoutine] = useState(false);
const [bioExpanded, setBioExpanded] = useState(false);
const [showAllVetVisits, setShowAllVetVisits] = useState(false);
const [showAllMeds, setShowAllMeds] = useState(false);
```

Also add derived values after `if (!pet) return null;`:
```tsx
const hasHealthData =
  pet.set_reminder ||
  (pet.vet_visit_records && pet.vet_visit_records.length > 0) ||
  (pet.medications && pet.medications.length > 0);

const hasTempRoutine =
  (pet.temperament && pet.temperament.length > 0) || !!pet.routine;

const visibleVetVisits = showAllVetVisits
  ? (pet.vet_visit_records ?? [])
  : (pet.vet_visit_records ?? []).slice(0, 3);

const visibleMeds = showAllMeds
  ? (pet.medications ?? [])
  : (pet.medications ?? []).slice(0, 3);
```

**Step 2: Build check**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | grep "error TS" | head -10
```

---

### Task 5: Rewrite the return JSX — shell + hero + identity strip

**Files:**
- Modify: `src/pages/PetDetails.tsx` — the `return (...)` block

**Step 1: Replace the entire return block with the contract-compliant shell**

```tsx
return (
  <div className="h-full min-h-0 flex flex-col">
    <PageHeader
      title={
        <span className="text-[13px] font-[500] text-[var(--text-secondary)] truncate">
          {pet.name}
        </span>
      }
      showBack
      onBack={() => navigate("/")}
      right={
        <NeuControl
          size="icon-md"
          variant="tertiary"
          aria-label="Edit pet"
          onClick={() => navigate(`/edit-pet-profile?id=${pet.id}`)}
        >
          <Pencil size={18} strokeWidth={1.75} />
        </NeuControl>
      }
    />

    {/* Hero photo */}
    <div className="relative h-[200px] flex-shrink-0 overflow-hidden mt-[56px]">
      {pet.photo_url ? (
        <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
      )}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/[0.28] to-transparent pointer-events-none" />
    </div>

    <StyledScrollArea className="flex-1 min-h-0">
      <div className="pb-[calc(64px+env(safe-area-inset-bottom))]">

        {/* Identity strip */}
        <div className="px-4 pt-4 pb-3">
          <h2 className="text-[28px] font-[700] leading-tight text-[var(--text-primary)] mb-1">
            {pet.name}
          </h2>
          <p className="text-[15px] text-[var(--text-secondary)] mb-3">
            {toTitleCase(pet.species)}{pet.breed ? ` · ${pet.breed}` : ""}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {pet.dob && (
              <NeuChip as="span">
                {formatBirthdayChip(pet.dob)}
                {calculateAge(pet.dob) !== null ? ` (${calculateAge(pet.dob)} y.o)` : ""}
              </NeuChip>
            )}
            {pet.weight && (
              <NeuChip as="span">{pet.weight} {pet.weight_unit}</NeuChip>
            )}
            {pet.microchip_id && (
              <NeuChip as="span">{pet.microchip_id}</NeuChip>
            )}
            {pet.gender && <NeuChip as="span">{pet.gender}</NeuChip>}
            {pet.neutered_spayed && (
              <NeuChip as="span">{getSterilizedLabel(pet.gender)}</NeuChip>
            )}
          </div>
        </div>

        {/* Bio card */}
        {pet.bio && (
          <div className="card-e1 mx-4 mb-4 p-4 rounded-xl">
            <p className={cn(
              "text-[14px] leading-[1.55] text-[var(--text-secondary)]",
              !bioExpanded && "line-clamp-3"
            )}>
              {pet.bio}
            </p>
            {pet.bio.length > 120 && (
              <NeuControl
                size="sm"
                variant="tertiary"
                className="mt-2 -ml-1"
                onClick={() => setBioExpanded((v) => !v)}
              >
                <ChevronDown
                  size={14}
                  strokeWidth={1.75}
                  className={cn("transition-transform mr-1", bioExpanded && "rotate-180")}
                  aria-hidden
                />
                {bioExpanded ? t("Show less") : t("Show more")}
              </NeuControl>
            )}
          </div>
        )}

        {/* ── Health divider (no bottom margin — flush to T&R below) ── */}
        {hasHealthData && (
          <button
            type="button"
            onClick={() => setShowHealth((v) => !v)}
            className="mx-4 mb-0 w-[calc(100%-32px)] h-[56px] rounded-[22px] glass-e2 flex items-center px-4 gap-3"
            style={{ background: "linear-gradient(to right, rgba(33,69,207,0.08), rgba(255,255,255,0.06))" }}
            aria-expanded={showHealth}
          >
            <span className="flex-1 text-left text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
              Health
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className={cn("text-[var(--text-secondary)] transition-transform", showHealth && "rotate-180")}
            />
          </button>
        )}

        {/* Health panel — no bottom margin so T&R divider sits flush */}
        {showHealth && (
          <div className="mx-4 mb-0">
            <InsetPanel>

              {/* Reminder row */}
              <div className="flex items-start gap-3 px-4 py-3">
                <BellRing size={16} strokeWidth={1.75} className="text-[var(--text-secondary)] mt-[2px] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-[500] text-[var(--text-primary)]">
                    {pet.set_reminder
                      ? (pet.set_reminder.reason === "Others"
                          ? pet.set_reminder.customReason || "Reminder"
                          : pet.set_reminder.reason)
                      : "No reminder set"}
                  </p>
                  {pet.set_reminder && (
                    <p className="text-[11px] text-[var(--text-tertiary)]">{pet.set_reminder.reminderDate}</p>
                  )}
                </div>
              </div>

              <InsetDivider />

              {/* Vet visit rows */}
              {visibleVetVisits.length === 0 ? (
                <div className="px-4 py-3">
                  <p className="text-[13px] text-[var(--text-tertiary)]">No vet visit records.</p>
                </div>
              ) : (
                <>
                  {visibleVetVisits.map((record, idx) => (
                    <div key={`${record.visitDate}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                      <Stethoscope size={16} strokeWidth={1.75} className="text-[var(--text-secondary)] mt-[2px] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-[500] text-[var(--text-primary)]">
                          {record.reason === "Others" ? record.customReason || "Visit" : record.reason}
                          {record.vaccine ? ` · ${record.vaccine}` : ""}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{record.visitDate}</p>
                      </div>
                    </div>
                  ))}
                  {(pet.vet_visit_records ?? []).length > 3 && (
                    <div className="px-4 pb-2">
                      <NeuControl
                        size="sm"
                        variant="tertiary"
                        onClick={() => setShowAllVetVisits((v) => !v)}
                      >
                        {showAllVetVisits
                          ? "Show less"
                          : `Show ${(pet.vet_visit_records ?? []).length - 3} more`}
                      </NeuControl>
                    </div>
                  )}
                </>
              )}

              {/* Medications (only if any) */}
              {(pet.medications ?? []).length > 0 && (
                <>
                  <InsetDivider />
                  {visibleMeds.map((med, idx) => (
                    <div key={`${med.name}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                      <Pill size={16} strokeWidth={1.75} className="text-[var(--text-secondary)] mt-[2px] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-[500] text-[var(--text-primary)]">{med.name}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                          {med.dose_amount != null && med.dose_unit
                            ? `${med.dose_amount}${med.dose_unit}`
                            : med.dosage || ""}
                          {(med.frequency_value != null && med.frequency_unit)
                            ? ` · Every ${med.frequency_value} ${med.frequency_unit}`
                            : med.frequency
                            ? ` · ${med.frequency}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(pet.medications ?? []).length > 3 && (
                    <div className="px-4 pb-2">
                      <NeuControl
                        size="sm"
                        variant="tertiary"
                        onClick={() => setShowAllMeds((v) => !v)}
                      >
                        {showAllMeds
                          ? "Show less"
                          : `Show ${(pet.medications ?? []).length - 3} more`}
                      </NeuControl>
                    </div>
                  )}
                </>
              )}

            </InsetPanel>
          </div>
        )}

        {/* ── Temperament & Routine divider — flush to Health above ── */}
        {hasTempRoutine && (
          <button
            type="button"
            onClick={() => setShowTempRoutine((v) => !v)}
            className="mx-4 mt-2 mb-2 w-[calc(100%-32px)] h-[56px] rounded-[22px] glass-e2 flex items-center px-4 gap-3"
            style={{ background: "linear-gradient(to right, rgba(33,69,207,0.08), rgba(255,255,255,0.06))" }}
            aria-expanded={showTempRoutine}
          >
            <span className="flex-1 text-left text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
              Temperament &amp; Routine
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className={cn("text-[var(--text-secondary)] transition-transform", showTempRoutine && "rotate-180")}
            />
          </button>
        )}

        {/* Temperament & Routine panel */}
        {showTempRoutine && (
          <div className="mx-4 mb-4">
            <InsetPanel>
              {pet.temperament && pet.temperament.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {pet.temperament.map((temp) => (
                      <NeuChip key={temp} as="span">{temp}</NeuChip>
                    ))}
                  </div>
                </div>
              )}
              {pet.temperament && pet.temperament.length > 0 && pet.routine && (
                <InsetDivider />
              )}
              {pet.routine && (
                <div className="px-4 py-3">
                  <p className="text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
                    {t("Daily Routine")}
                  </p>
                  <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)] whitespace-pre-wrap">
                    {pet.routine}
                  </p>
                </div>
              )}
            </InsetPanel>
          </div>
        )}

      </div>
    </StyledScrollArea>

    <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
  </div>
);
```

Note: Keep `PremiumUpsell` import from `@/components/social/PremiumUpsell` — it was in the downloaded base and should remain.

**Step 2: Build — expect clean output**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | tail -15
```
Expected: `✓ built in X.XXs` with no TypeScript errors. Pre-existing chunk-size advisory is fine.

---

### Task 6: Verify contract compliance

**Step 1: Check for raw interactive elements (Rule 1 / Rule 13)**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
grep -n "<input\|<select\|<textarea" src/pages/PetDetails.tsx
```
Expected: zero matches.

**Step 2: Verify all Lucide icons have explicit strokeWidth**
```bash
grep -n "lucide\|size={" src/pages/PetDetails.tsx | grep -v "strokeWidth"
```
Cross-check each icon call has `strokeWidth={1.75}`.

**Step 3: Check no Badge, NeuButton, GlobalHeader, motion imports remain**
```bash
grep -n "Badge\|NeuButton\|GlobalHeader\|framer-motion" src/pages/PetDetails.tsx
```
Expected: zero matches.

---

### Task 7: Final lint + build + commit

**Step 1: Lint**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run lint 2>&1 | tail -10
```
Expected: no errors (warnings about `any` in existing code are pre-existing and acceptable).

**Step 2: Build**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

**Step 3: Commit**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"
/Applications/Xcode.app/Contents/Developer/usr/bin/git add src/pages/PetDetails.tsx docs/plans/2026-03-06-pet-details-revamp-design.md docs/plans/2026-03-06-pet-details-revamp.md
/Applications/Xcode.app/Contents/Developer/usr/bin/git commit -m "$(cat <<'EOF'
feat(pet-details): contract-compliant revamp with adjacent collapsible sections

- PageHeader + NeuControl replaces GlobalHeader + NeuButton + raw buttons
- NeuChip replaces Badge for identity chips
- Skeleton state replaces spinner (Rule 12)
- Health + Temperament & Routine as adjacent flush dividers
- Compact B inline rows: vet visits, medications, reminder (3 visible + show more)
- showAllVetVisits / showAllMeds overflow controls

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
