# UI Polish Sprint — Design Document
**Date:** 2026-03-06
**Branch:** `salvage/ui-from-stash` → main
**Status:** Approved

---

## Scope

Eight distinct improvement areas derived from UX review session. All changes are additive or refactoring — no database schema changes required.

---

## 1. Taller Pet Cards

### 1a — Home Dashboard Pet Card
- Add `min-h-[260px]` to the card container `div` (currently no explicit height)
- Change content overlay from `pt-24` → `pt-44` so the photo has more visual breathing room
- Add white pill badges overlaid on the photo (see §1c below)

### 1b — PetDetails Hero Photo
- Change hero div height from `h-[200px]` → `h-[260px]` (~30% taller)
- Gradient scrim and overlay elements scale naturally — no other changes needed

### 1c — Home Pet Card Info Pills (new)
White frosted pill badges on the Home dashboard pet card, matching PetDetails stat style.

**Pills to show:** Species (with icon) · Breed · Age · Weight
**Style:** `backdrop-blur-sm bg-white/20 text-white px-2.5 py-1 rounded-full text-xs font-semibold`
**Layout:** `flex flex-wrap gap-1.5` row positioned above the pet name in the overlay
**Data source:** `activePet.species`, `activePet.breed`, `activePet.dob` (compute age), `activePet.weight_kg`
**Icons:** Use `PawPrint` for species, omit icon for breed/age/weight (keep it compact)

---

## 2. Remove "Huddle Wisdom" Label

Remove only the `<h4>` element containing `{t("home.wisdom")}` from the tips card in `Index.tsx`.
The lightbulb icon and tip body text remain untouched.

---

## 3. Pet Avatar + "+" Button Alignment

Add `items-center` to the `flex gap-3 overflow-x-auto` container in the pet selector row (`Index.tsx`).
All pet avatar buttons are already `w-16 h-16` matching the `+` button — vertical centering will snap them into alignment.

---

## 4. GlobalHeader on All Main Tab Pages

All five BottomNav tabs plus Notifications must share the same `GlobalHeader` (Bell | Logo | Settings).

| Page | Current state | Change |
|------|--------------|--------|
| `Index.tsx` | ✅ GlobalHeader | none |
| `Chats.tsx` | ✅ GlobalHeader | none (redesigned in §5) |
| `Social.tsx` | ❌ PageHeader "Notice Board" | replace with GlobalHeader |
| `AIVet.tsx` | ❌ custom glass-bar fixed header | replace with GlobalHeader |
| `Map.tsx` | check at implementation | add GlobalHeader if missing |
| `Notifications.tsx` | check at implementation | add GlobalHeader if missing |

**Social.tsx note:** The `PageHeader` "Notice Board" title disappears — the board icon/compose button in the top-right (if any) should move to a FAB or remain in page body.

---

## 5. AIVet — Pet Selector Moved to Top

Currently the `PetSelector` component is in a `top-right offset` absolute-positioned div inside the chat area.

**New layout:**
```
[GlobalHeader]
[Pet selector row]   — full-width strip, px-4 pt-3 pb-2, horizontal scroll of pet name chips
[Chat area]          — fills flex-1
[Input bar]          — sticky bottom
```

The pet selector row uses the existing `petOptions` array + `selectedPetId` state. Style it as a `flex gap-2 overflow-x-auto px-4 pt-3 pb-2` row of small NeuControl-sm chips (one per pet, active = filled-primary, inactive = ghost).

---

## 6. Discovery | Chats Split-View Toggle

This is the largest change. `Chats.tsx` gains a top-level segmented toggle. The existing Discovery grid + the existing chat list are both preserved, just reorganised.

### 6a — Toggle Control

```
[GlobalHeader]
[  Discover  |  Chats  ]   ← centered pill toggle, h-10, mx-auto, below header
```

**Style:** Same segmented pill as EditProfile's view/edit toggle.
**Default on mount:** `Discover` active.
**State:** `topTab: "discover" | "chats"` — local useState, not persisted.

### 6b — Discover View

```
[Filter icon row]          SlidersHorizontal top-right of view, opens GlassModal (§6c)
[Portrait card stack]      mx-4, flex-1, min-h-[380px]
[Action bar]               Star · Wave · Skip (§6d)
```

**Portrait Card:**
- `rounded-[22px] overflow-hidden` container fills available vertical space
- Full-bleed `object-cover` photo
- **Stack depth (CSS, no Framer Motion):**
  - Card 0 (active): `scale(1) translateY(0) z-[3]`
  - Card 1 (mid): `scale(0.97) translateY(-10px) z-[2]`
  - Card 2 (back): `scale(0.94) translateY(-20px) z-[1]`
- Cards rendered `absolute inset-0` inside a `relative` container

**Card Info Overlay (bottom 45% dark scrim):**
```
[top-left]  ProfileBadges component (Shield-gold verified · Car-blue pet driver)

[bottom overlay]
  📍 [profile.location]                         ← MapPin 12px + location area string
  [Name H2 white bold] [Age white/70]
  [NeuChip: social_role] [NeuChip: 🐾 Dog] ...  ← pet species if user owns pets
  [bio 2 lines white/80 truncated]
```

- Use existing `ProfileBadges` component (`isVerified`, `hasCar` props)
- Location: `MapPin` Lucide icon + `profile.location` field (not computed distance)
- Pet species chips: query `pets` table for each discovery user OR use `pet_species` denormalised field if available

**Tap interaction:**
- Tap **left third** of card → trigger Skip (slide left CSS transition)
- Tap **right third** of card → trigger Wave (slide right CSS transition)
- Tap **center third** → navigate to user profile
- CSS transition: `transform 0.25s ease-out, opacity 0.25s`
- After animation completes → advance to next card, reset transform

### 6c — Filter (GlassModal, centered)

SlidersHorizontal button triggers `GlassModal` (the centered `glass-e3` modal primitive from HAT C).
All existing `DiscoveryFilters` state and `FilterRowDef` rows are preserved — only the container changes from inline panel to modal.
Footer: `[Reset]` + `[Apply]` NeuControl buttons.

### 6d — Action Bar (3 buttons)

```
[⭐ Star]  ·····  [👋 Wave]  ·····  [✕ Skip]
```

| Button | Icon | Color | Wiring |
|--------|------|-------|--------|
| Star | `Star` filled | `text-brandGold` / gold ring | `ensureDirectRoom(p.id, ...)` |
| Wave | `Hand` | `bg-primary text-primary-foreground` | `waves` table insert (existing) |
| Skip | `X` | `text-muted-foreground` ghost | `setHiddenDiscoveryIds` |

- **Wave icon fix**: Replace `HandMetal` (devil horns 🤘) with `Hand` (open raised hand 👋)
- All three are `NeuControl`-icon-lg with `w-14 h-14`
- Laid out `flex justify-center items-center gap-8 py-4`

### 6e — Chats View

```
[Search bar]              FormField-search ghost, px-4 mt-3 mb-1
[Friends | Groups tabs]   NeuControl-sm chip row px-4 mb-2
[Chat list / empty state]
[FAB]                     PenSquare, fixed right-[20px] bottom-[calc(64px+20px)]
```

All existing chat list logic, group modal, and booking flow are preserved — only the surrounding layout changes.

---

## 7. Urbanist Font Globally

**Root cause:** `tailwind.config.js` fontFamily overrides (`font-sans`, `font-body`, `font-display`) use system fonts, partially overriding the CSS token `--font: 'Urbanist'`.

**Fix:** Update `tailwind.config.js`:
```js
fontFamily: {
  sans:    ["Urbanist", "system-ui", "sans-serif"],
  body:    ["Urbanist", "system-ui", "sans-serif"],
  display: ["Urbanist", "system-ui", "sans-serif"],
}
```

Urbanist is already loaded in `index.html` via Google Fonts and declared in `tokens.css`. This change makes Tailwind utility classes consistent with the CSS token.

---

## Constraints & Rules

- **No Framer Motion** — card stack uses CSS transforms only
- **Lucide only** (Rule 9, strokeWidth=1.75) — `Hand` replaces `HandMetal`
- **No raw `<button>`** — action buttons use `NeuControl`
- **No `backdrop-blur` on page headers** — GlobalHeader uses solid `bg-background`
- **GlassModal** for centered overlay (uses existing `glass-e3` primitive from HAT C)
- **ProfileBadges** component (`src/components/ui/ProfileBadges.tsx`) must be reused, not duplicated

---

## Files Changed (expected)

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Taller card + info pills + remove wisdom label + avatar alignment |
| `src/pages/PetDetails.tsx` | Hero height 200→260px |
| `src/pages/Chats.tsx` | Full Discovery|Chats split-view redesign |
| `src/pages/Social.tsx` | Replace PageHeader with GlobalHeader |
| `src/pages/AIVet.tsx` | Replace custom header + move pet selector to top |
| `src/pages/Map.tsx` | Add GlobalHeader if missing |
| `src/pages/Notifications.tsx` | Add GlobalHeader if missing |
| `tailwind.config.js` | fontFamily → Urbanist for all utilities |
