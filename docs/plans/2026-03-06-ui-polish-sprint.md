# UI Polish Sprint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 9 targeted improvements: Urbanist font consolidation, home card polish (taller + info pills + alignment + wisdom label), PetDetails hero taller, GlobalHeader on all main pages (Social / AIVet / Notifications / Map), AIVet pet selector moved to top, and Chats page Discovery|Chats split-view with swipeable portrait card stack and 3-button action bar.

**Architecture:** Each task modifies exactly one file. Tasks 1–8 are small surgical edits. Task 9 (Chats.tsx) is the largest — it introduces a `topTab` state, restructures the render tree into Discover/Chats branches, and replaces the horizontal card scroll with a CSS portrait card stack. All existing state, effects, handlers, and modals in Chats.tsx are preserved.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, Lucide React (strokeWidth=1.75 everywhere), existing UI primitives (NeuControl, NeuChip, ProfileBadges, GlassModal, GlobalHeader).

**Design doc:** `docs/plans/2026-03-06-ui-polish-sprint-design.md`

---

## Constraints (read before every task)

- **No Framer Motion** in new code — card stack uses CSS `transition` + `transform` only
- **No raw `<button>`** — use `NeuControl` for all interactive elements
- **Lucide only** for icons, `strokeWidth={1.75}` on every icon
- **No `backdrop-blur` on GlobalHeader** — it uses solid `bg-background`
- **Read before Edit** — always read the full target section before replacing it
- **Lint + build after each task** — `npm run lint && npm run build` (pre-existing chunk advisory is fine; any new error = fix before commit)

---

## Task 1: Urbanist font — tailwind.config.js

**File:**
- Modify: `tailwind.config.js` lines 16–29

**What:** The CSS tokens already correctly load Urbanist via Google Fonts and assign `--font: 'Urbanist'` to `:root`. However `tailwind.config.js` overrides `font-sans`, `font-body`, `font-display` with system fonts, causing Tailwind utility classes to leak non-Urbanist. Fix by aligning all Tailwind font families to Urbanist.

**Step 1: Read current fontFamily block**

```bash
sed -n '14,32p' tailwind.config.js
```

Expected output:
```
    fontFamily: {
      // Legacy (keep for compatibility)
      sans: [
        "Microsoft YaHei UI",
        ...
      ],
      body:    ["-apple-system", "BlinkMacSystemFont", "'SF Pro Text'", ...],
      display: ["-apple-system", "BlinkMacSystemFont", "'SF Pro Display'", ...],
    },
```

**Step 2: Replace the fontFamily block**

In `tailwind.config.js`, replace the entire `fontFamily` object:

```js
// BEFORE (lines ~17-29)
fontFamily: {
  // Legacy (keep for compatibility)
  sans: [
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
  // UI CONTRACT v3 — A.5 Typography
  body:    ["-apple-system", "BlinkMacSystemFont", "'SF Pro Text'", "'Segoe UI'", "system-ui", "sans-serif"],
  display: ["-apple-system", "BlinkMacSystemFont", "'SF Pro Display'", "'Segoe UI'", "system-ui", "sans-serif"],
},
```

Replace with:

```js
// UI CONTRACT RULE 10 — Urbanist exclusively
fontFamily: {
  sans:    ["Urbanist", "system-ui", "sans-serif"],
  body:    ["Urbanist", "system-ui", "sans-serif"],
  display: ["Urbanist", "system-ui", "sans-serif"],
},
```

**Step 3: Lint + build**

```bash
npm run lint && npm run build
```

Expected: 0 new errors (pre-existing chunk-size advisory is fine).

**Step 4: Commit**

```bash
git add tailwind.config.js
git commit -m "style: align all Tailwind font families to Urbanist (Rule 10)"
```

---

## Task 2: Index.tsx — remove wisdom label + fix avatar alignment

**File:**
- Modify: `src/pages/Index.tsx` lines 207, 338

**Step 1: Read the two target sections**

```bash
sed -n '205,250p' src/pages/Index.tsx   # pet selector row
sed -n '326,346p' src/pages/Index.tsx   # wisdom card
```

**Step 2: Fix pet selector row — add `items-center`**

Find line 207:
```tsx
// BEFORE
<div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 overflow-visible">
```

Replace with:
```tsx
// AFTER
<div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-2 overflow-visible">
```

**Step 3: Remove "Huddle Wisdom" label**

Find line 338:
```tsx
// BEFORE — remove ONLY this line, keep the <p> below it
<h4 className="text-sm font-semibold text-brandText mb-1">{t("home.wisdom")}</h4>
```

Delete that one line. The `<p>` with the tip text stays.

**Step 4: Lint + build**

```bash
npm run lint && npm run build
```

**Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "fix: align pet avatars with + button; remove Huddle Wisdom label"
```

---

## Task 3: Index.tsx — taller pet card + white info pills

**File:**
- Modify: `src/pages/Index.tsx` lines 254–322 (the pet card section)

**What:** Three changes inside the pet card:
1. Add `min-h-[260px]` to the outer card `motion.div`
2. Change `pt-24` → `pt-44` on the content overlay div so the photo gets more visual height
3. Replace the existing inline text info (`weight • species • breed`) with frosted white pill badges (species, breed, age, weight)

**Step 1: Read the pet card block**

```bash
sed -n '251,325p' src/pages/Index.tsx
```

**Step 2: Apply changes**

Locate the outer card `motion.div` at line ~254:
```tsx
// BEFORE
<motion.div
  layout
  onClick={() => navigate(`/pet-details?id=${selectedPet.id}`)}
  className="relative rounded-2xl overflow-hidden shadow-card cursor-pointer hover:shadow-lg transition-shadow"
>
```

Replace with (adds `min-h-[260px]`):
```tsx
<motion.div
  layout
  onClick={() => navigate(`/pet-details?id=${selectedPet.id}`)}
  className="relative min-h-[260px] rounded-2xl overflow-hidden shadow-card cursor-pointer hover:shadow-lg transition-shadow"
>
```

Locate the content overlay div at line ~281:
```tsx
// BEFORE
<div className="relative p-5 pt-24">
```

Replace with:
```tsx
<div className="relative p-5 pt-44">
```

Replace the entire `<motion.div key={selectedPet.id}...>` inner block (lines ~282–320). The old block showed name + age heading then weight/species/breed as plain text spans. Replace with pet name heading + white pill badges row:

```tsx
// BEFORE (lines ~282–319)
<motion.div
  key={selectedPet.id}
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
>
  <div className="text-left">
    <h2 className="text-2xl font-bold text-primary-foreground">
      {selectedPet.name}
      {selectedPet.dob && `, ${computeAgeYears(selectedPet.dob)} Years Old`}
    </h2>
  </div>
  <div className="flex gap-4 mt-2 text-primary-foreground/80 text-sm flex-wrap">
    {selectedPet.weight && (
      <>
        <span>{t("Weight")}: {selectedPet.weight}{selectedPet.weight_unit}</span>
        <span>{t("•")}</span>
      </>
    )}
    <span className="capitalize">{selectedPet.species}</span>
    {selectedPet.breed && (
      <>
        <span>{t("•")}</span>
        <span>{selectedPet.breed}</span>
      </>
    )}
  </div>
  <div className="mt-4 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
    <div className="flex items-center gap-2 text-primary-foreground">
      <Clock className="w-4 h-4" />
      <span className="text-sm font-medium">
        {t("home.next_event")}: {nextEventLabel}
      </span>
    </div>
  </div>
</motion.div>
```

Replace with:
```tsx
// AFTER
<motion.div
  key={selectedPet.id}
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
>
  {/* White info pills — species, breed, age, weight */}
  <div className="flex flex-wrap gap-1.5 mb-3">
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold capitalize">
      {selectedPet.species}
    </span>
    {selectedPet.breed && (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
        {selectedPet.breed}
      </span>
    )}
    {selectedPet.dob && (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
        {computeAgeYears(selectedPet.dob)}y
      </span>
    )}
    {selectedPet.weight && (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
        {selectedPet.weight}{selectedPet.weight_unit}
      </span>
    )}
  </div>

  <h2 className="text-2xl font-bold text-primary-foreground">
    {selectedPet.name}
  </h2>

  <div className="mt-3 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
    <div className="flex items-center gap-2 text-primary-foreground">
      <Clock className="w-4 h-4" strokeWidth={1.75} />
      <span className="text-sm font-medium">
        {t("home.next_event")}: {nextEventLabel}
      </span>
    </div>
  </div>
</motion.div>
```

**Step 3: Lint + build**

```bash
npm run lint && npm run build
```

**Step 4: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: taller home pet card with white info pills overlay"
```

---

## Task 4: PetDetails.tsx — hero height 200 → 260px

**File:**
- Modify: `src/pages/PetDetails.tsx` line ~302

**Step 1: Read the hero block**

```bash
sed -n '299,308p' src/pages/PetDetails.tsx
```

Expected line to find:
```tsx
<div className="relative h-[200px] flex-shrink-0 overflow-hidden mt-[56px]">
```

**Step 2: Change the height**

```tsx
// BEFORE
<div className="relative h-[200px] flex-shrink-0 overflow-hidden mt-[56px]">

// AFTER
<div className="relative h-[260px] flex-shrink-0 overflow-hidden mt-[56px]">
```

**Step 3: Lint + build**

```bash
npm run lint && npm run build
```

**Step 4: Commit**

```bash
git add src/pages/PetDetails.tsx
git commit -m "fix: PetDetails hero height 200→260px (30% taller)"
```

---

## Task 5: Social.tsx — replace PageHeader with GlobalHeader

**File:**
- Modify: `src/pages/Social.tsx` lines 1–50

**What:** Replace `PageHeader title="Notice Board"` with `GlobalHeader`. The compose (PenSquare) button becomes a FAB fixed at bottom-right.

**Step 1: Read current imports + return block**

```bash
sed -n '1,12p' src/pages/Social.tsx
sed -n '38,50p' src/pages/Social.tsx
```

**Step 2: Update imports**

```tsx
// BEFORE (line 3)
import { PageHeader } from "@/layouts/PageHeader";

// AFTER — replace with GlobalHeader
import { GlobalHeader } from "@/components/layout/GlobalHeader";
```

**Step 3: Replace PageHeader in return block**

```tsx
// BEFORE (lines ~38–44)
<div className="h-full min-h-0 relative overflow-x-hidden flex flex-col">
  <PageHeader
    title="Notice Board"
    right={composeButton}
  />

  <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
    <div className="pt-[68px] px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)]">
```

Replace with:
```tsx
<div className="h-full min-h-0 relative overflow-x-hidden flex flex-col">
  <GlobalHeader />

  <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
    <div className="pt-4 px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)]">
```

**Step 4: Add compose FAB**

At the very bottom of the return, just before the closing `</div>` of the outermost wrapper, add:

```tsx
{/* Compose FAB */}
<button
  className="fixed right-5 bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] z-30 w-14 h-14 rounded-full bg-primary shadow-elevated flex items-center justify-center"
  aria-label="Compose post"
  onClick={() => {/* existing compose handler if any, else leave empty */}}
>
  <PenSquare size={20} strokeWidth={1.75} className="text-primary-foreground" />
</button>
```

Note: If Social.tsx has no compose handler, the button can be left with an empty onClick for now.

**Step 5: Remove `composeButton` variable** (it's no longer used in JSX as a PageHeader prop)

Delete lines:
```tsx
const composeButton = (
  <NeuControl size="icon-md" variant="tertiary" aria-label="Compose post">
    <PenSquare size={20} strokeWidth={1.75} aria-hidden />
  </NeuControl>
);
```

**Step 6: Lint + build**

```bash
npm run lint && npm run build
```

**Step 7: Commit**

```bash
git add src/pages/Social.tsx
git commit -m "feat: GlobalHeader on Social page; compose → FAB"
```

---

## Task 6: Notifications.tsx — GlobalHeader + auto-mark-read + subtle section dividers

**File:**
- Modify: `src/pages/Notifications.tsx` lines 1–10, 119–145, 211–285

**What:**
1. Replace `PageHeader` with `GlobalHeader`
2. Auto-mark all notifications read when the page opens (remove the "Mark all" button)
3. Replace `<SectionDivider label="Today/Earlier"/>` with a minimal Apple-style inline label — no chip, no decorative lines, just a muted micro-label

**Step 1: Read current imports + return block**

```bash
sed -n '1,11p' src/pages/Notifications.tsx
sed -n '119,145p' src/pages/Notifications.tsx
sed -n '208,290p' src/pages/Notifications.tsx
```

**Step 2: Update imports**

```tsx
// BEFORE (line 4)
import { PageHeader } from "@/layouts/PageHeader";

// AFTER — add GlobalHeader, add useRef (for auto-mark once)
import { GlobalHeader } from "@/components/layout/GlobalHeader";
```

Also add `useRef` to the React import if not already present:
```tsx
import { useEffect, useMemo, useState, useRef } from "react";
```

**Step 3: Auto-mark-read on mount (add after existing useEffects)**

Find the section after the `markAllRead` function (line ~119). Add a ref + effect:

```tsx
// Auto-mark all read when the page first loads notifications
const markedOnLoadRef = useRef(false);
useEffect(() => {
  if (!markedOnLoadRef.current && rows.length > 0) {
    markedOnLoadRef.current = true;
    void markAllRead();
  }
}, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
```

**Step 4: Replace PageHeader in return — remove "Mark all" button**

```tsx
// BEFORE (lines ~211–226)
<div className="min-h-svh pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
  <PageHeader
    title={t("Notifications")}
    showBack
    right={
      unread > 0 ? (
        <NeuControl size="sm" variant="tertiary" onClick={markAllRead} aria-label={t("Mark all as read")}>
          {t("Mark all")}
        </NeuControl>
      ) : undefined
    }
  />
```

Replace with:
```tsx
<div className="min-h-svh pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
  <GlobalHeader />
```

Also remove any `pt-[56px]` or `pt-[68px]` on the content div below — GlobalHeader is sticky, not fixed, so no manual offset needed.

**Step 5: Replace SectionDivider with Apple-style micro-labels**

The current code uses `<SectionDivider label={t("Today")} />` and `<SectionDivider label={t("Earlier")} />`. Replace both with a minimal inline label — no background chip, no lines, just small muted text:

```tsx
// BEFORE
{!loading && todayRows.length > 0 && (
  <>
    <SectionDivider label={t("Today")} />
    {todayRows.map(renderRow)}
  </>
)}
{!loading && earlierRows.length > 0 && (
  <>
    <SectionDivider label={t("Earlier")} />
    {earlierRows.map(renderRow)}
  </>
)}
```

Replace with:
```tsx
{!loading && todayRows.length > 0 && (
  <>
    <div className="px-4 pt-5 pb-1">
      <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground/50 select-none">
        {t("Today")}
      </span>
    </div>
    {todayRows.map(renderRow)}
  </>
)}
{!loading && earlierRows.length > 0 && (
  <>
    <div className="px-4 pt-5 pb-1">
      <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground/50 select-none">
        {t("Earlier")}
      </span>
    </div>
    {earlierRows.map(renderRow)}
  </>
)}
```

**Design note (Apple-style):** Ultra-small (11px), wide tracking, uppercase, 50% muted opacity — functions as a whisper-quiet spatial anchor, not a headline. Consistent with iOS Mail, Settings, and Reminders section headers.

**Step 6: Remove unused imports** — `SectionDivider` (if it came from Notifications.tsx imports), `NeuControl` if now unused, `Bell` if only used for PageHeader right prop.

```bash
grep -n "^import" src/pages/Notifications.tsx
```

Remove any import that TypeScript flags as unused after the above changes.

**Step 7: Lint + build**

```bash
npm run lint && npm run build
```

**Step 8: Commit**

```bash
git add src/pages/Notifications.tsx
git commit -m "feat: GlobalHeader on Notifications; auto-mark-read on open; Apple-style section labels"
```

---

## Task 7: AIVet.tsx — GlobalHeader + pet selector at top

**File:**
- Modify: `src/pages/AIVet.tsx` lines 1–222 (full file, ~222 lines)

**What:**
1. Replace the `glass-bar h-[56px] fixed` chat header with `GlobalHeader`
2. Move the PetSelector from its offset position inside `MODE_A` main section to a dedicated strip immediately below `GlobalHeader` (always visible, not conditional on messages.length)
3. Adjust all `pt-[calc(56px...)]` padding references to `pt-4` since GlobalHeader is sticky (not fixed)

**Step 1: Read the full file**

```bash
cat src/pages/AIVet.tsx
```

**Step 2: Update imports**

```tsx
// BEFORE line 9
import { ArrowLeft, Ellipsis, Activity, Salad, MapPin } from "lucide-react";

// AFTER — add GlobalHeader import; remove ArrowLeft + Ellipsis (no longer needed for custom header)
import { Activity, Salad, MapPin } from "lucide-react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
```

**Step 3: Replace the return block structure**

The full new structure (replace everything from `return (` to `);`):

```tsx
return (
  <div className="h-full min-h-0 flex flex-col relative overflow-x-hidden">

    {/* GlobalHeader — same as all pages */}
    <GlobalHeader />

    {/* Pet selector strip — always visible below header */}
    {pets.length > 0 && (
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-4 pt-3 pb-2 flex-shrink-0">
        {pets.map((p) => (
          <NeuControl
            key={p.id}
            size="sm"
            variant={p.id === selectedPetId ? "primary" : "secondary"}
            onClick={() => setSelectedPetId(p.id)}
          >
            {p.name}
          </NeuControl>
        ))}
      </div>
    )}

    {/* ── MODE_A: Empty state ──────────────────────────────────────────────── */}
    {messages.length === 0 && !isTyping ? (
      <main
        className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-[20px]"
        style={{
          paddingBottom: `calc(${composerBottom + 24}px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {/* Greeting */}
        <h2
          className="text-[24px] font-[700] leading-[1.20] tracking-[-0.01em] text-[var(--text-primary)] mt-[24px] text-center"
        >
          Hi, {displayName}.
        </h2>
        <p className="text-[15px] font-[400] leading-[1.55] text-[var(--text-secondary)] mt-[8px] text-center max-w-[32ch]">
          What's going on with {petName}?
        </p>

        {/* Quick chips */}
        <div className="flex flex-wrap justify-center gap-[8px] mt-[24px]">
          {SUGGESTIONS.map(({ icon: Icon, label }) => (
            <NeuControl
              key={label}
              variant="secondary"
              size="sm"
              onClick={() => sendMessage(label)}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              {label}
            </NeuControl>
          ))}
        </div>
      </main>
    ) : (
      /* ── MODE_B: Conversation active ──────────────────────────────────── */
      <main
        className="flex-1 min-h-0 overflow-y-auto px-[16px] space-y-[16px] pt-[12px]"
        style={{
          paddingBottom: `calc(${composerBottom + 16}px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {messages.map((msg) => (
          <ChatBubble key={msg.id} variant={msg.variant}>
            {msg.text}
          </ChatBubble>
        ))}
        {isTyping && <ChatBubble variant="ai" typing />}
        <div ref={messagesEndRef} />
      </main>
    )}

    {/* ── WarningStrip — always fixed ─────────────────────────────────────── */}
    <div
      className="fixed inset-x-0 z-[15] px-[20px] py-[8px] text-center"
      style={{ bottom: `${BOTTOM_NAV_HEIGHT + composerHeight}px` }}
    >
      <span className="text-[11px] font-[400] leading-[1.45] text-[var(--text-tertiary)]">
        Not a substitute for a vet. For information only.
      </span>
    </div>

    {/* ── Composer — always fixed ─────────────────────────────────────────── */}
    <Composer
      value={composerValue}
      onChange={setComposerValue}
      onSend={() => sendMessage(composerValue)}
      navOffset={BOTTOM_NAV_HEIGHT}
      placeholder={`Ask anything about ${petName}…`}
      onHeightChange={setComposerHeight}
      showAttach={false}
      showCamera
      alwaysShowSend
      hideTopBorder
    />
  </div>
);
```

**Step 4: Remove unused imports** (ArrowLeft, Ellipsis, useNavigate if navigate is no longer used)

```bash
# Check if navigate is still used elsewhere
grep -n "navigate" src/pages/AIVet.tsx
```

If navigate is no longer used, remove:
```tsx
import { useNavigate } from "react-router-dom";
```
and:
```tsx
const navigate = useNavigate();
```

**Step 5: Lint + build**

```bash
npm run lint && npm run build
```

**Step 6: Commit**

```bash
git add src/pages/AIVet.tsx
git commit -m "feat: GlobalHeader on AIVet; pet selector moves to top strip"
```

---

## Task 8: Map.tsx — add GlobalHeader

**File:**
- Modify: `src/pages/Map.tsx` lines 1–50, ~1278–1295 (return block)

**What:** Map is currently full-bleed with explicit comment "no GlobalHeader". Add GlobalHeader as a sticky overlay above the map. The map canvas must account for the 56px header height.

**Step 1: Read imports + return opening**

```bash
sed -n '1,45p' src/pages/Map.tsx
sed -n '1276,1295p' src/pages/Map.tsx
```

**Step 2: Add GlobalHeader import**

```tsx
// Add to imports (near other layout imports)
import { GlobalHeader } from "@/components/layout/GlobalHeader";
```

**Step 3: Wrap return in new structure**

```tsx
// BEFORE (line ~1278)
return (
  <div className="relative h-full w-full overflow-hidden">
    {/* Map canvas — full-bleed, no GlobalHeader */}
    <div
      className="absolute inset-0"
      ...
    >
```

Replace opening with:
```tsx
return (
  <div className="relative h-full w-full overflow-hidden flex flex-col">
    <GlobalHeader />
    {/* Map canvas — below GlobalHeader */}
    <div
      className="flex-1 relative overflow-hidden"
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
      onTouchCancel={handlePullEnd}
    >
```

Note: The original `<div className="absolute inset-0" ...>` had the touch handlers on it. They move to the new `flex-1 relative` div. Remove the separate `<div className="absolute inset-0" ...>` wrapper — its children (map container + overlays) go directly inside the new flex-1 div.

Also update the map container ref div from:
```tsx
<div ref={mapContainer} className="h-full w-full relative overflow-hidden">
```
to the same (no change needed — it naturally fills the `flex-1` parent).

**Step 4: Close the new wrapper div properly**

The return must now close the extra `flex-1` div before closing the outermost `flex-col` div. Audit the closing tags carefully.

**Step 5: Lint + build**

```bash
npm run lint && npm run build
```

**Step 6: Commit**

```bash
git add src/pages/Map.tsx
git commit -m "feat: GlobalHeader on Map page"
```

---

## Task 9: Chats.tsx — Discovery|Chats split-view with portrait card stack

**File:**
- Modify: `src/pages/Chats.tsx` (~2334 lines — the largest file)

**What:**
1. Add `topTab: "discover" | "chats"` state
2. Add `[Discover | Chats]` pill toggle below GlobalHeader
3. Discovery view: CSS portrait card stack (fills available space) + 3-button action bar (Star/Wave/Skip) replacing the current collapsible horizontal-scroll grid
4. Chats view: search bar + Friends/Groups sub-tabs + chat list (existing logic, just reorganised)
5. Fix icon: `HandMetal` → `Hand` (Wave button)
6. Fix badges: replace raw text "Verified"/"Car" spans with `ProfileBadges` component
7. Filter: the existing `isFilterModalOpen` state and filter panel stay; change the container from bottom sheet (`motion.div fixed bottom-0`) to `GlassModal` centered

**Important:** ALL existing state variables, effects, handlers, query logic, group modals, booking modals, and filter logic are preserved. Only the render tree structure changes.

### Step 1: Read key sections

```bash
# Imports (lines 1-10)
sed -n '1,15p' src/pages/Chats.tsx

# State declarations (lines 215-295)
sed -n '215,295p' src/pages/Chats.tsx

# Return opening + GlobalHeader (lines 1083-1160)
sed -n '1083,1165p' src/pages/Chats.tsx

# Discovery card render (lines 1178-1330)
sed -n '1178,1340p' src/pages/Chats.tsx

# Filter modal (lines 2014-2030)
sed -n '2010,2035p' src/pages/Chats.tsx
```

### Step 2: Update imports

```tsx
// BEFORE line 3
import { Users, MessageSquare, Search, X, Loader2, HandMetal, Star, SlidersHorizontal, Lock, ChevronRight, ChevronDown, ChevronUp, Trash2, DollarSign } from "lucide-react";

// AFTER — replace HandMetal with Hand
import { Users, MessageSquare, Search, X, Loader2, Hand, Star, SlidersHorizontal, Lock, ChevronRight, ChevronDown, ChevronUp, Trash2, DollarSign } from "lucide-react";
```

Also add ProfileBadges and GlassModal imports (check if already imported):

```tsx
// Add if not present
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { GlassModal } from "@/components/ui/GlassModal";
```

### Step 3: Add `topTab` state

After line ~232 (`const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);`), add:

```tsx
const [topTab, setTopTab] = useState<"discover" | "chats">("discover");
// Card stack: index of the active (front) card
const [stackIndex, setStackIndex] = useState(0);
// Animate direction: null | "left" | "right"
const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
```

### Step 4: Add `topTab` pill toggle + restructure render tree

Find the section immediately after `<GlobalHeader .../>` (around line 1086) through the end of the existing collapsible discovery section and the chat list.

Replace everything between `</GlobalHeader>` (or after it) and the existing modals/portals at the bottom with this restructured layout:

```tsx
{/* ── Top-level Discover | Chats toggle ──────────────────────────────── */}
<div className="flex justify-center px-4 pt-3 pb-2 flex-shrink-0">
  <div className="flex items-center bg-muted rounded-full p-1 gap-1">
    <button
      onClick={() => setTopTab("discover")}
      className={cn(
        "px-5 py-1.5 rounded-full text-sm font-semibold transition-all",
        topTab === "discover"
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-brandText"
      )}
    >
      {t("Discover")}
    </button>
    <button
      onClick={() => setTopTab("chats")}
      className={cn(
        "px-5 py-1.5 rounded-full text-sm font-semibold transition-all",
        topTab === "chats"
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-brandText"
      )}
    >
      {t("Chats")}
    </button>
  </div>
</div>

{/* ── DISCOVER view ───────────────────────────────────────────────────── */}
{topTab === "discover" && (
  <div className="flex-1 min-h-0 flex flex-col">

    {/* Filter trigger row */}
    <div className="flex justify-end px-4 pb-1">
      <button
        onClick={() => setIsFilterModalOpen(true)}
        className="p-2 rounded-full hover:bg-muted transition-colors"
        aria-label="Filter"
      >
        <SlidersHorizontal className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
      </button>
    </div>

    {/* Portrait card stack */}
    <div className="flex-1 mx-4 relative min-h-0">
      {discoveryLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" strokeWidth={1.75} />
        </div>
      )}
      {discoveryLocationBlocked && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">{t("Enable location to discover people nearby.")}</p>
        </div>
      )}
      {!discoveryLoading && discoverySource.length === 0 && !discoveryLocationBlocked && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">{t("No one nearby right now. Check back later.")}</p>
        </div>
      )}

      {/* Render top 3 cards as a stacked deck */}
      {discoverySource.slice(stackIndex, stackIndex + 3).map((p, relIdx) => {
        const isTop = relIdx === 0;
        const age = p?.dob
          ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
          : null;
        const petSpeciesList: string[] = Array.isArray(p?.pet_species)
          ? p.pet_species
          : Array.isArray(p?.pets) && p.pets.length > 0
          ? p.pets.map((pet: { species?: string | null }) => pet.species || "")
          : [];
        const album = (albumUrls[p.id] && albumUrls[p.id].length > 0)
          ? albumUrls[p.id]
          : Array.isArray(p?.social_album) && p.social_album.length > 0
          ? p.social_album
          : p.avatar_url
          ? [p.avatar_url]
          : [];
        const cover = album[0];
        const stackScales = ["scale-100 translate-y-0", "scale-[0.97] -translate-y-[10px]", "scale-[0.94] -translate-y-[20px]"];
        const stackZ = [3, 2, 1];
        const isAnimating = isTop && swipeDir !== null;

        return (
          <div
            key={p.id}
            className={cn(
              "absolute inset-0 rounded-[22px] overflow-hidden",
              "transition-all duration-250 ease-out",
              stackScales[relIdx],
              isAnimating && swipeDir === "left" && "translate-x-[-140%] rotate-[-12deg] opacity-0",
              isAnimating && swipeDir === "right" && "translate-x-[140%] rotate-[12deg] opacity-0",
            )}
            style={{ zIndex: stackZ[relIdx] }}
            onTransitionEnd={() => {
              if (isTop && swipeDir !== null) {
                setSwipeDir(null);
                setStackIndex((i) => i + 1);
              }
            }}
            onClick={() => {
              if (!isTop) return;
              void handleProfileTap(p.id, p.display_name || "User", p.avatar_url || null);
            }}
          >
            {/* Photo */}
            {cover ? (
              <img src={cover} alt={p.display_name || ""} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
            )}

            {/* Gradient scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent pointer-events-none" />

            {/* ProfileBadges — top-left */}
            <div className="absolute top-3 left-3">
              <ProfileBadges
                isVerified={String(p.verification_status ?? "").toLowerCase() === "verified"}
                hasCar={!!p.has_car}
                size="sm"
              />
            </div>

            {/* Info overlay — bottom */}
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none">
              {/* Location area */}
              {p.location && (
                <div className="flex items-center gap-1 mb-1.5">
                  <MapPin className="w-3 h-3 text-white/70 flex-shrink-0" strokeWidth={1.75} />
                  <span className="text-[12px] text-white/70 font-medium leading-none truncate">{p.location}</span>
                </div>
              )}
              {/* Name + Age */}
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[22px] font-[700] text-white leading-tight">{p.display_name}</span>
                {age && <span className="text-[15px] text-white/70 font-medium">{String(age)}</span>}
              </div>
              {/* Social role + pet species chips */}
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                {p.social_role && (
                  <span className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-semibold">
                    {p.social_role}
                  </span>
                )}
                {petSpeciesList.slice(0, 3).map((s, si) => (
                  <span key={si} className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-semibold capitalize">
                    {s}
                  </span>
                ))}
              </div>
              {/* Bio */}
              {p.bio && (
                <p className="text-[13px] text-white/80 leading-snug line-clamp-2">{p.bio}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {/* ── Action bar: Star | Wave | Skip ──────────────────────────────────── */}
    <div className="flex justify-center items-center gap-8 py-5 px-4 flex-shrink-0">
      {/* Star — brandGold, opens direct chat */}
      <NeuControl
        variant="secondary"
        size="icon-lg"
        aria-label="Star"
        onClick={async (e: React.MouseEvent) => {
          e.stopPropagation();
          const p = discoverySource[stackIndex];
          if (!p) return;
          const blocked = blockedUserIds.has(p.id);
          if (blocked) return;
          const ok = await bumpDiscoverySeen();
          if (!ok) return;
          await ensureDirectRoom(p.id, p.display_name || "Conversation");
        }}
        className="text-brandGold ring-1 ring-brandGold/30"
      >
        <Star size={24} strokeWidth={1.75} className="text-brandGold" />
      </NeuControl>

      {/* Wave — brandBlue */}
      <NeuControl
        variant="primary"
        size="icon-lg"
        aria-label="Wave"
        onClick={async (e: React.MouseEvent) => {
          e.stopPropagation();
          const p = discoverySource[stackIndex];
          if (!p) return;
          const blocked = blockedUserIds.has(p.id);
          if (blocked) return;
          const ok = await bumpDiscoverySeen();
          if (!ok) return;
          try {
            if (!profile?.id) return;
            const isBlocked = await areUsersBlocked(profile.id, p.id);
            if (isBlocked) { toast.error(t("Cannot wave this user")); return; }
            let waveError: unknown = null;
            const firstTry = await supabase
              .from("waves" as "profiles")
              .insert({ from_user_id: profile.id, to_user_id: p.id } as Record<string, unknown>);
            waveError = firstTry.error;
            if (waveError) {
              const secondTry = await supabase
                .from("waves" as "profiles")
                .insert({ sender_id: profile.id, receiver_id: p.id, status: "pending", wave_type: "standard" } as Record<string, unknown>);
              waveError = secondTry.error;
            }
            if (waveError) throw waveError;
            toast.success(t("Wave sent"));
            setSwipeDir("right");
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("duplicate") || msg.includes("23505")) {
              toast.info(t("Wave already sent"));
            } else {
              toast.error(t("Failed to send wave"));
            }
          }
        }}
      >
        <Hand size={24} strokeWidth={1.75} />
      </NeuControl>

      {/* Skip — muted */}
      <NeuControl
        variant="secondary"
        size="icon-lg"
        aria-label="Skip"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          const p = discoverySource[stackIndex];
          if (!p) return;
          setSwipeDir("left");
        }}
        className="text-muted-foreground"
      >
        <X size={24} strokeWidth={1.75} />
      </NeuControl>
    </div>
  </div>
)}

{/* ── CHATS view ──────────────────────────────────────────────────────── */}
{topTab === "chats" && (
  <div className="flex-1 min-h-0 flex flex-col">
    {/* Search bar */}
    {isSearchOpen && (
      <div className="px-4 pt-2 pb-1">
        <input
          type="search"
          placeholder={t("Search conversations…")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 rounded-full bg-muted px-4 text-sm text-brandText placeholder:text-muted-foreground outline-none"
        />
      </div>
    )}

    {/* Friends | Groups sub-tabs + action buttons */}
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex gap-2">
        {mainTabs.map((tab) => (
          <NeuControl
            key={tab.id}
            size="sm"
            variant={mainTab === tab.id ? "primary" : "secondary"}
            onClick={() => setMainTab(tab.id)}
          >
            {t(tab.label)}
          </NeuControl>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <Search className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
        </button>
        <button
          onClick={handleCreateGroup}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            isVerified ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
          {t("Create Group")}
        </button>
      </div>
    </div>

    {/* Chat list — StyledScrollArea wrapping existing list JSX */}
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[calc(64px+env(safe-area-inset-bottom)+20px)]">
      {/* PASTE existing chat list JSX here — the filteredChats.map / groups.map blocks */}
      {/* Keep ALL existing chat row rendering unchanged */}
    </div>

    {/* Compose FAB */}
    <button
      className="fixed right-5 bottom-[calc(64px+env(safe-area-inset-bottom)+20px)] z-30 w-14 h-14 rounded-full bg-primary shadow-elevated flex items-center justify-center"
      aria-label="New conversation"
      onClick={handleCreateGroup}
    >
      <MessageSquare size={20} strokeWidth={1.75} className="text-primary-foreground" />
    </button>
  </div>
)}
```

### Step 5: Replace the filter bottom sheet with GlassModal

Find the filter sheet block (lines ~2014–2320) that starts with:
```tsx
{isFilterModalOpen && (
  <>
    <motion.div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-[70]" .../>
    <motion.div className="fixed bottom-0 left-0 right-0 max-h-[80vh] bg-card rounded-t-3xl z-[71]" ...>
```

Replace the outer container wrapper only (keep all inner filter rows/content):
```tsx
// BEFORE outer wrapper
{isFilterModalOpen && (
  <>
    <motion.div className="fixed inset-0 ..." onClick={...} />
    <motion.div className="fixed bottom-0 ... max-h-[80vh] bg-card rounded-t-3xl" ...>
      {/* filter content */}
    </motion.div>
  </>
)}
```

Replace with:
```tsx
<GlassModal
  isOpen={isFilterModalOpen}
  onClose={() => { setIsFilterModalOpen(false); setActiveFilterRow(null); }}
  title={t("Filters")}
  maxWidth="max-w-lg"
  className="max-h-[80vh] overflow-y-auto"
>
  {/* PASTE all existing filter rows JSX here unchanged */}
</GlassModal>
```

Note: The `sticky top-0` header row inside the filter panel can be removed since GlassModal provides its own title + close button.

### Step 6: Remove the old header section

The old `<header className="flex items-center justify-between px-5 pt-4 pb-2">` block and the old collapsible `<section className="px-5 pb-2">` discovery section should now be deleted (their content has been moved into the topTab branches above).

### Step 7: Lint + build

```bash
npm run lint && npm run build
```

Fix any TypeScript errors. Common issues:
- `MapPin` may need to be imported (check if already in imports; add if not)
- `Hand` must be in imports (added in Step 2)
- `ProfileBadges` must be imported (added in Step 2)
- `stackIndex`, `swipeDir`, `setSwipeDir`, `setStackIndex` must exist in state (added in Step 3)

### Step 8: Commit

```bash
git add src/pages/Chats.tsx
git commit -m "feat: Discovery|Chats split-view toggle with portrait card stack and Star/Wave/Skip action bar"
```

---

## Final verification

After all 9 tasks:

```bash
npm run lint && npm run build
```

Check in browser (dev server: `npm run dev`):
- [ ] All fonts render as Urbanist
- [ ] Home pet card is taller with white info pills (species, breed, age, weight)
- [ ] "Huddle Wisdom" label gone, tip text remains
- [ ] Pet avatars and + button vertically aligned
- [ ] PetDetails hero is visibly taller
- [ ] Social, AIVet, Map, Notifications all show GlobalHeader (Bell | Logo | Settings)
- [ ] AIVet shows pet name chips below header
- [ ] Chats page: `[Discover | Chats]` pill toggle at top; default Discover
- [ ] Discover view: tall portrait card stack with ProfileBadges, location area, name/age, social role/species chips, bio
- [ ] Star (gold) / Wave (Hand icon, blue) / Skip (grey) action bar
- [ ] Chats view: search, Friends|Groups tabs, chat list, compose FAB
- [ ] Filter opens as centered GlassModal

```bash
git add -A
git commit -m "chore: final polish sprint verification pass"
```
