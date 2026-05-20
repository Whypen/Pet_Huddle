# Profile Editorial Spread — Implementation Plan

> **Feature:** Redesign the public profile **view mode** + the photo upload UX in **Set / Edit Profile** as an editorial magazine spread.
> **Surface:** Web first (`huddle.pet`), native (Expo) parity in Phase 7.
> **Author:** Design lead — Hypebeast / Hinge / Bumble lens.
> **Date:** 2026-04-29.
> **Owners:** _assign at kickoff_.

A reader following this doc top-to-bottom should be able to ship the feature without further questions. Open questions resolved on 2026-04-29 — see §18 for the locked decisions and §0 for the head-of-huddle review delta applied to this revision.

---

## 0. Head-of-huddle review (2026-04-29) — locked decisions & simplifications

Reviewed by: huddle product/design lead.

**Decisions locked from the open questions:**

1. Edit profile route is `src/pages/EditProfile.tsx`. Plan's swap-in target is unambiguous.
2. Cropper + display follow Hinge / Bumble conventions: aspect-locked at upload, no on-the-fly recropping at render time, photos render `object-cover` to their slot's frame. `react-easy-crop` confirmed.
3. Supabase Storage bucket is `Profiles`.
4. Ship the HEIC converter **and** a client-side image compressor before upload. See §9.11.
5. **Reuse the existing polaroid pattern** from `src/components/service/CarerPolaroidCard.tsx`. Extract a generic `PolaroidCard` primitive to share between Service and the Pack. **No new CSS polaroid implementation, no rotation, no horizontal carousel.** This collapses the Pack section dramatically — see §8.5.
6. Native (Expo) is gated on web 100% rollout. Phase 7 begins only after Phase 6 (modal-surface unification) is at 100%.

**Pack simplification (the main shape change in this revision):**

- Old plan: horizontal scroll-snap carousel of CSS polaroid frames with alternating ±1.5° rotation, captions hanging *outside* the frame.
- New plan: **2-column grid of `PolaroidCard` tiles**, capped at 4 visible. Captions live *inside* the polaroid frame (consistent with `CarerPolaroidCard`). No rotation. No carousel. If a user has > 4 pets, a fifth tile shows `+ {N} more` and opens an overflow sheet listing the rest.
- Why: less "swipey," more editorial; visually consistent with the Service marketplace; no animation cost; no asset duplication; the polaroid stops being a special profile-only flourish and becomes a brand primitive.

**Other tightening from the review:**

- Section header subtitle (`"3 companions"`) is dropped. The grid itself shows the count. Editorial restraint.
- Pack experience tagline retained but moved *below* the grid as a single tracked-caps line, no decorative blue accent line above it (kill one decorative element).
- The optional Coral asterisk warmer for Vitals (in §19 risk mitigations) is **not** added by default; only revisit if the section reads cold post-Storybook.

---

## 0.1 v1.1 locked positions (2026-04-29 — second review)

Five further tightenings, ratified after a side-by-side gut-check vs. Hinge / Bumble:

1. **Drop the Coral age numeral on the hero.** Name only, full Urbanist 800 white. Age moves into Vitals (`AGE · 28`). Profile reads less "dating-app", more editorial.
2. **Vary plate widths to break the feed rhythm.** `establishing` 100% bleed, `pack` 88% inset (left-aligned, gutter on the right), `closer` 100% bleed. Asymmetric = magazine; uniform = feed.
3. **Kill the diptych.** Two side-by-side photos break ugly when one is portrait + one is landscape, and forced 1:1 cropping kills photographs. Replace with a single **`ProfileAdaptivePlate`** that auto-renders to the photo's native aspect (1:1, 4:5, 16:9 supported). **Slot count drops from 6 → 5.**
4. **Kill card chrome between sections.** No borders, no shadows, no rounded white containers around Vitals or any text section. Type sits on canvas with **1px `rgba(66,73,101,0.10)` hairline rules** between rows. The Pack polaroids stay (they *are* the artifact). Everything else is type-on-white, like reading a web magazine.
5. **The Closer earns a sign-off.** Full-bleed 4:5 followed by the word *"end."* in `.type-meta` Coral, centered, 24px padding-block. Magazine colophon move.

**Spec changes triggered by v1.1 (applied below):**

- §3 / §5 / §7 / §11 / §13: slot list shrinks to 5; `diptychA` and `diptychB` removed; `solo` added as the renamed adaptive plate.
- §6: composition map updated to reflect 5-slot order and width variation.
- §8.2: hero name-only; age removed from overlay.
- §8.6: Vitals card chrome stripped to canvas + hairlines; gains an `AGE` row.
- §8.7: `ProfileDiptych` deleted; replaced by `ProfileAdaptivePlate`.
- §8.8: Closer plate gains the *"end."* sign-off.
- §9.2 / §13: slot copy updated; `solo` brief written.

---

## Table of Contents

1. [Background & rationale](#1-background--rationale)
2. [Goals & non-goals](#2-goals--non-goals)
3. [Naming — internal codenames vs. user-facing labels](#3-naming--internal-codenames-vs-user-facing-labels)
4. [Token mapping (single source of truth)](#4-token-mapping-single-source-of-truth)
5. [Data model & migration](#5-data-model--migration)
6. [Information architecture — view mode](#6-information-architecture--view-mode)
7. [Component inventory](#7-component-inventory)
8. [Component specs — view mode](#8-component-specs--view-mode)
9. [Component specs — edit mode](#9-component-specs--edit-mode)
10. [Motion & interaction](#10-motion--interaction)
11. [File plan](#11-file-plan)
12. [Component → token map](#12-component--token-map)
13. [Copy & i18n](#13-copy--i18n)
14. [Backend & API](#14-backend--api)
15. [Performance](#15-performance)
16. [Testing](#16-testing)
17. [Phased rollout](#17-phased-rollout)
18. [Open questions](#18-open-questions)
19. [Risks & mitigations](#19-risks--mitigations)
20. [Definition of done](#20-definition-of-done)

---

## 1. Background & rationale

The current `PublicProfileView` is a stack of equal-weight white cards with the same border, the same radius, and the same icon-pill grammar repeated five times. This violates the design system's *"Editorial, not Dashboard"* doctrine. The Social Album is a flat 3-column contact-sheet grid that feels like a generic upload screen. Pets — huddle's emotional centerpiece — are tucked under an experience header at 64×64 px.

We rebuild the profile as a **magazine spread**: alternating text peaks and photographic peaks, with photos *interleaved* between content sections (Hinge-style) rather than dumped into an album section (legacy Bumble-style). The pet section is promoted to a 2-up polaroid grid — the brand's signature physical artifact. The upload UX changes from a generic photo pool to a **5-slot editorial editor** where each slot has a brief, an aspect ratio, and a semantic role.

---

## 2. Goals & non-goals

### Goals

1. Replace the equal-weight stacked-card profile with an editorial spread.
2. Replace the pool-style photo uploader with a 5-slot editor (one slot is required, four are optional).
3. Promote pets to the brand's emotional centerpiece via a 2-up polaroid grid (capped at 4 visible).
4. Use only canonical tokens from `app/huddle Design System/colors_and_type.css`. Do not invent new values.
5. Ship the editor first, the viewer second, so the data shape stabilises before rendering changes.

### Non-goals

- Action bar (Wave / Support / Star) — out of scope.
- Pet profile editor — unchanged.
- Settings, notifications, broadcast UI — untouched.
- Native (Expo) port — Phase 7 only.

---

## 3. Naming — internal codenames vs. user-facing labels

**Codenames** are used in TypeScript, file names, API payloads, Supabase columns, and Storybook stories. They never reach the UI.

**Labels** are what the user reads. Calm, plain English. Sentence case. No jargon.

| Codename | UI label | UI helper text |
|---|---|---|
| `cover` | **Main photo** | A clear photo of you. Eye contact. Daylight is your friend. |
| `establishing` | **Where you spend time** | A wider shot — your neighbourhood, a favourite park, your sofa with the dog on it. |
| `pack` | **You and your pet** | A photo with at least one of your pets. You can add a caption. |
| `solo` | **A photo of just you** | One more frame of you — square, portrait, or wide, however it was shot. |
| `closer` | **One last photo** | The image you'd want a neighbour to remember. |

> **Hard rule:** the strings *"diptych"*, *"rhyme"*, *"establishing shot"*, *"closer"* must never appear in user-visible UI or i18n values. They live only in code identifiers.

---

## 4. Token mapping (single source of truth)

Canonical: `app/huddle Design System/colors_and_type.css`.
Web aliases already exist in `src/styles/tokens.css`. Use the design-system names directly in new code.

### Tokens consumed by this feature

| Layer | Tokens |
|---|---|
| Color | `--huddle-blue` `#2145CF`, `--huddle-blue-light`, `--coral-orange` `#FF7F50`, `--premium-gold`, `--fg-1` `#424965`, `--fg-2` `#4A4A4A`, `--fg-3`, `--fg-on-dark`, `--bg-canvas`, `--bg-muted`, `--bg-blue-soft` `#EBF5FF`, `--validation-red` `#EF4444` |
| Glass | `--glass-e1-*`, `--glass-e2-*`, `--glass-e3-*` |
| Neumorphic | `--neu-rest-shadow`, `--neu-pressed-shadow`, `--neu-drop`, `--neu-lift`, `--neu-inner` |
| Radii | `--radius-sm` 8, `--radius-md` 12, `--radius-lg` 16, `--radius-xl` 20, `--radius-2xl` 24, `--radius-3xl` 28, `--radius-field` 14, `--radius-pill` 9999 |
| Spacing (8pt) | `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 24, `--space-6` 32, `--space-7` 40, `--space-8` 48, `--space-9` 64 |
| Layout | `--app-max-width` 430, `--header-h` 56, `--nav-h` 64, `--min-touch` 44. **Web override:** form fields, buttons, and selects render at **40px** height (web convention; not the design-system mobile defaults of 52/56). Use the existing web tokens / classes that already enforce 40px. |
| Motion | `--dur-micro` 75, `--dur-fast` 150, `--dur-base` 200, `--dur-slow` 300, `--dur-enter` 350, `--ease-out`, `--ease-std`, `--ease-in` |
| Type sizes | `--t-hero` 60, `--t-hero-sm` 44, `--t-h1` 32, `--t-h2` 24, `--t-h3` 20, `--t-h4` 18, `--t-body` 16, `--t-body-sm` 15, `--t-label` 14, `--t-helper` 12, `--t-caption` 11, `--t-meta` 10 |
| Type weights | `--fw-light` 300 → `--fw-extrabold` 800 |
| Type classes | `.type-hero`, `.type-hero-sm`, `.type-h1`-`.type-h4`, `.type-body`, `.type-label`, `.type-helper`, `.type-caption`, `.type-meta` |
| Illustration | `--ink`, `--paper`, `--paper-edge`, `--illus-stroke-w`, `--illus-offset-x`, `--illus-offset-y` |
| Assets | `Polaroid.png`, `Badge.png`, `huddle-logo.png`, `huddle-wordmark.png`, `illustration-pet-care.jpg` |

### Hard rules (carried through)

- Neumorphic shadows: **neutral grey drop only**. Glass shadows: **blue-tinted only**. Never mix.
- `backdrop-filter` only inside `.glass-card`, `.glass-l2`, `.glass-l3`, `.glass-bar`, `.glass-nav`. Ad-hoc blurs forbidden.
- Brand name lowercase `huddle` in copy.
- No emoji in UI. Lucide for web icons; Ionicons (`*-outline`) for native.
- Sentence case everywhere except `.type-meta` (10pt tracked uppercase, 0.08em).
- Coral Orange is for hero typography and warmth moments. **Never a button background.**
- Premium Gold is Gold-tier only. Forbidden as a generic accent.

---

## 5. Data model & migration

### Current shape (assumed)

```ts
profile.photo_url: string | null    // avatar / cover
profile.social_album: string[]      // up to 9, order-dependent
```

### Target shape

```ts
// src/types/profilePhotos.ts
export type ProfilePhotoSlot =
  | "cover"
  | "establishing"
  | "pack"
  | "solo"
  | "closer";

export type SoloAspect = "1:1" | "4:5" | "16:9";

export interface ProfilePhotos {
  cover:        string | null;
  establishing: string | null;
  pack:         string | null;
  solo:         string | null;
  closer:       string | null;
  pack_caption: string | null;     // ≤ 30 chars; only meaningful when `pack` set
  solo_aspect:  SoloAspect | null; // detected at upload from the cropped output
}
```

### Supabase migration

File: `supabase/migrations/<timestamp>_profile_photos_jsonb.sql`

1. `ALTER TABLE profiles ADD COLUMN photos jsonb NOT NULL DEFAULT '{}'::jsonb;`
2. Backfill per row:
   - `cover` ← `photo_url`
   - `establishing` ← `social_album[1]`
   - `pack` ← `social_album[2]`
   - `solo` ← `social_album[3]`
   - `closer` ← `social_album[4]`
   - `pack_caption` ← `null`
   - `solo_aspect` ← `"4:5"` (legacy default; user can recrop on next edit)
3. Items at index 5+ in `social_album` are not migrated.
4. Keep `social_album` and `photo_url` columns for one release as fallback. Drop in Phase 5 (cleanup).
5. Provide a reverse migration script.
6. RLS unchanged.

### First-edit toast

After migration, the first time a user opens Edit Profile, show a toast:
*"We've reorganised your photos into the new layout. Take a look."*
Persist a `profile_photos_migrated_seen_at` timestamp so it shows once.

---

## 6. Information architecture — view mode (v1.1)

```
01  HERO COVER          100% bleed 4:5; name only (Urbanist 800 white)
─── pull-quote bio ───  type on canvas; italic; asterisk above
PLATE 02 (establishing) 100% bleed 4:5; no caption
─── THE PACK ─────────  asterisk header; 2-up polaroid grid (max 4); experience tagline
PLATE 03 (pack)         88% inset, left-aligned, 3:2; tracked-caps caption inside
04  VITALS              type on canvas; hairline rules; no card chrome
PLATE 04 (solo)         88% inset, right-aligned; native aspect (1:1 / 4:5 / 16:9)
PLATE 05 (closer)       100% bleed 4:5; "end." sign-off in Coral below
06  COLOPHON            single tracked-caps line
```

**Width rhythm:** 100 → 100 → 88-left → 88-right → 100. Two bleeds bookend two insets — magazine, not feed.

Missing plates are **gracefully omitted** — no empty box, no skeleton.

---

## 7. Component inventory

### View-mode (read-only)

```
src/components/profile/sections/
  ProfileHero.tsx
  ProfilePullQuote.tsx
  ProfilePlate.tsx
  ProfilePack.tsx
  ProfileVitals.tsx
  ProfileAdaptivePlate.tsx
  ProfileColophon.tsx
src/components/profile/
  ProfileSectionMark.tsx
  PublicProfileView.tsx           # composition only — ≤ 80 lines
```

### Edit-mode (write)

```
src/components/profile/edit/
  ProfilePhotoSlots.tsx
  ProfilePhotoSlot.tsx
  ProfilePhotoCropper.tsx
  ProfilePhotoSlotSheet.tsx
  ProfilePackCaptionField.tsx
  copy/slotBriefs.ts
```

### Reused primitives

- `GlassModal`, `GlassSheet` — `src/components/ui/`
- `NeuButton`, `NeuChip`, `FormField` — `src/components/ui/`
- `Polaroid.png` — copied from design system to `src/assets/brand/`

---

## 8. Component specs — view mode

### 8.1 `ProfileSectionMark`

A reusable header cue shaped like a magazine section divider.

```
*  THE PACK
   3 companions
```

- Asterisk: Urbanist 800, 16px, `var(--huddle-blue)`.
- Title: `.type-h2` (24/700) + `text-transform: uppercase` + `letter-spacing: 0.01em`.
- Subtitle: `.type-helper` italic.
- Padding-block: `var(--space-5)` (24px).
- Props: `{ label: string; sublabel?: string }`.

### 8.2 `ProfileHero`

- Container: `aspect-[4/5]; width: 100%; border-radius: var(--radius-3xl) var(--radius-3xl) 0 0` (rounded only at the sheet's top edge).
- Image: `object-cover; object-position: center;`.
- Top-left meta strip: `.type-meta`, white, 16px inset.
- Top-right badges: stacked frosted chips, `var(--glass-e1-bg)` + `backdrop-filter: blur(var(--glass-e1-blur))` + `var(--glass-e1-border)`, radius `var(--radius-pill)`, 28×28. Lucide `ShieldCheck` and `Car`.
- Bottom protection gradient: `linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 55%)`.
- **Name only.** `.type-hero-sm` (44/800), white, `letter-spacing: -0.015em`. No age, no Coral numeral.
- Sub-line: `.type-meta`, white at 90% opacity. Format: `LOCATION · ROLE`.
- No buttons or actions.

> **Changed in v1.1:** Coral age numeral removed. Age moves to the first row of Vitals (§8.6).

### 8.3 `ProfilePullQuote`

- Conditional: only renders when `bio.trim()` is non-empty.
- Vertical padding: `var(--space-7)` 40px top and bottom.
- Asterisk: `var(--huddle-blue)`, weight 800, 24px, centered.
- Quote: Urbanist 500 italic, 22px, `var(--fg-1)`, `max-width: 320px`, centered, `line-height: var(--lh-snug)`.
- Attribution: `.type-meta`, `var(--huddle-blue)`, centered, 12px above text.

### 8.4 `ProfilePlate`

Generic full-bleed photo block. Used for slots 02, 03, 06.

```ts
type ProfilePlateProps = {
  src: string | null;
  aspect: "4/5" | "3/2" | "1/1";
  caption?: string | null;
  alt: string;
};
```

- Container: `width: 100%; aspect-ratio: <aspect>; border-radius: 0` (edge-to-edge inside the sheet's clipping).
- Image: `object-cover`, lazy except cover.
- Caption (only when present): bottom-left, `.type-meta`, white, on `linear-gradient(to top, rgba(0,0,0,0.55), transparent 50%)`, 16px padding.
- Returns `null` if `!src` — graceful omission.

### 8.5 `ProfilePack` — simplified (post-review)

The brand's emotional centerpiece. **Reuses the polaroid contract already shipped in `CarerPolaroidCard`.**

**Step 0 — extract the primitive.** Before building `ProfilePack`, refactor `CarerPolaroidCard` into a generic `PolaroidCard` primitive at `src/components/ui/PolaroidCard.tsx`. The Service marketplace re-imports it; the Pack imports the same. One source of truth.

`PolaroidCard` props:
```ts
type PolaroidCardProps = {
  photoUrl: string | null;
  badges?: PolaroidBadge[];     // top-left pucks (carer marketplace uses Car/Certified/Emergency; Pack uses none or one private-lock badge)
  captionPrimary: string;        // Georgia italic, like the carer name
  captionSecondary?: string;     // tracked-caps subline ("Golden retriever · 4")
  overlay?: React.ReactNode;     // bottom-right pill (price for carer; nothing for pet)
  onTap?: () => void;
  disabled?: boolean;            // private pets — apply blur + lock badge
  ariaLabel: string;
};
```

The primitive keeps the existing visual contract verbatim: 4:5 outer, `#f0f0f0` frame, 5% inset photo, ~24% caption strip at bottom, Georgia italic primary caption, tracked secondary caption.

**`ProfilePack` composition:**

- Header via `ProfileSectionMark` with `label="THE PACK"`. **No subtitle.** The grid shows the count.
- Layout: 2-column CSS grid. `grid-template-columns: 1fr 1fr; gap: var(--space-3)` (12px); padding-inline `var(--space-5)` (24px).
- Each tile: `<PolaroidCard photoUrl={pet.photoUrl} captionPrimary={pet.name} captionSecondary={`${formatSpecies(pet.species)} · ${pet.age}`} onTap={() => onPetClick(pet.id, pet.isPublic)} disabled={!pet.isPublic} ariaLabel={`Open ${pet.name}'s profile`} />`.
- Cap at **4 visible tiles**. If `pets.length > 4`, the 4th tile is replaced by an overflow tile (same polaroid frame, photo replaced with a flat `var(--bg-blue-soft)` background, primary caption *"+{N} more"*, secondary caption *"See the rest"*). Tap → `GlassSheet` listing the remaining pets as compact rows (avatar + name + species).
- **No rotation.** No hover wobble.
- **No animation** beyond the existing `whileTap={{ scale: 0.97 }}` from `PolaroidCard`.
- Private pet: `disabled` flag → photo gets `filter: blur(12px) brightness(0.9)`, top-left adds a Lucide `Lock` badge puck, secondary caption shows `PRIVATE`.
- Below the grid (no decorative line, no extra spacing): a single tracked-caps line, `.type-meta`, `var(--fg-1)`, format `8 YEARS · DOGS, CATS, RABBITS`. Padding-block-start `var(--space-4)` (16px).
- Empty state (no pets): a single Friendly Outliner illustration (`illustration-pet-care.jpg`) on a torn-paper rectangle, with copy *"{Name} is new to pet life — ready to begin."* in italic 400, `--t-body-sm`.

**What this simplifies:**

- One source of truth for the polaroid look (fewer bugs across surfaces).
- No carousel logic, no snap-scrolling, no overflow-x, no scrollbar styling.
- No rotation = no reduced-motion edge case to handle.
- Caption lives inside the frame = no caption-under-frame alignment work.
- Visual consistency with Service marketplace strengthens the brand.

### 8.6 `ProfileVitals` (v1.1 — type on canvas, no card)

- **No card chrome.** No background, no border, no shadow, no radius. Renders directly on `var(--bg-canvas)`.
- Padding-inline: `var(--space-5)` (24px) — matches the page gutter.
- Padding-block: `var(--space-6)` (32px) top and bottom.
- Layout: 2-col grid, label 35% / value 65%.
- Row height: 48px.
- Divider: `border-bottom: 1px solid rgba(66,73,101,0.10)` — **solid hairline**, not dotted (less "form-y", more "magazine table-of-contents"). Last row no divider.
- Label: `.type-meta`, `var(--fg-2)`, left-aligned.
- Value: Urbanist 600, 16px, `var(--fg-1)`.
- **No icons.** Per editorial doctrine.

**Row visibility model:**

- **Always public** (no visibility flag, always rendered when value is non-empty): `AGE`, `GENDER`, `LOCATION`.
- **Visibility-flag gated**: `HEIGHT`, `ORIENTATION`, `EDUCATION`, `WORKS AT`, `AFFILIATION`, `RELATIONSHIP`. Render only when both the visibility flag is true *and* the value is non-empty.
- **Always rendered when non-empty** (no flag, optional value): `SPEAKS`.

**Row order (when present):**

| Row | Source | Gating |
|---|---|---|
| `AGE` | computed from `dob` — **promoted to the first row** since it left the hero | always public |
| `LOCATION` | `locationName` | always public |
| `GENDER` | `gender` | always public |
| `HEIGHT` | `${height} cm` | `show_height` |
| `ORIENTATION` | `orientation` | `show_orientation` |
| `EDUCATION` | `degree`, `major`, `school` joined by ` · ` | `show_academic` |
| `WORKS AT` | `occupation` | `show_occupation` |
| `AFFILIATION` | `affiliation` | `show_affiliation` |
| `SPEAKS` | `languages.join(", ")` | always (when non-empty) |
| `RELATIONSHIP` | `relationship_status` | `show_relationship_status` |

> **Inset (88%) plates** in §6 align *with the Vitals padding edge*, not the page edge. The 12% gutter sits on whichever side §6 specifies (right for `pack`, left for `solo`). This creates the asymmetric magazine rhythm.

### 8.7 `ProfileAdaptivePlate` (replaces v1.0 `ProfileDiptych`)

A single full-width plate that respects the photo's native aspect ratio. **No diptych.** No two-up grid. Solves the "one portrait + one landscape looks ugly" problem by never forcing a pair.

```ts
type ProfileAdaptivePlateProps = {
  src: string | null;
  aspect: "1:1" | "4:5" | "16:9";   // detected at upload, stored in photos.solo_aspect
  align: "full-bleed" | "inset-left" | "inset-right";
  alt: string;
};
```

- Container width: `100%` for full-bleed; `88%` aligned to the chosen side for inset variants.
- `aspect-ratio` set from the `aspect` prop — no cropping at render.
- Image: `object-cover; object-position: center;` with `border-radius: 0`.
- Returns `null` if `!src` — graceful omission preserves the rhythm by letting the layout collapse cleanly.
- `onClick` opens the lightbox.

**Why this beats the diptych:**
- Mixed aspects between users no longer break the layout.
- Odd photo counts no longer leave a forlorn empty half.
- Honors the photo's original framing — editorial respects the image.

### 8.8 `ProfileColophon` (with Closer sign-off)

The closer plate is followed by a **sign-off line** before the colophon:

- Sign-off: *"end."* in `.type-meta`, `var(--coral-orange)`, centered, padding-block `var(--space-5)` (24px).
- Then the colophon proper:
  - Padding-block: `var(--space-6)` (32px).
  - Single line: `*  HUDDLE MEMBER · VERIFIED · {LOCATION}` in `.type-meta`, centered, `var(--fg-1)`.
  - Optional second line: *Joined April 2024* in `.type-helper` italic.

### 8.9 `PublicProfileView` (v1.1 composition)

A composition file. Reads `photos`, visibility, bio, pets and renders the spread. Plates are conditionally rendered — missing photos drop their plate.

```tsx
<>
  <ProfileHero ... />
  <ProfilePullQuote ... />
  <ProfilePlate src={photos.establishing} aspect="4/5" align="full-bleed" alt={`${name} — photo`} />
  <ProfilePack ... />
  <ProfilePlate src={photos.pack} aspect="3/2" align="inset-left" caption={photos.pack_caption} alt={`${name} with pets`} />
  <ProfileVitals ... />
  <ProfileAdaptivePlate src={photos.solo} aspect={photos.solo_aspect ?? "4:5"} align="inset-right" alt={`${name} — solo`} />
  <ProfilePlate src={photos.closer} aspect="4/5" align="full-bleed" alt={`${name} — final photo`} />
  <ProfileColophon ... />
</>
```

> `ProfilePlate` (§8.4) gains an `align: "full-bleed" | "inset-left" | "inset-right"` prop in v1.1 to support the width rhythm. Default `"full-bleed"`.

---

## 9. Component specs — edit mode

### 9.1 `ProfilePhotoSlots`

Container for the five slots, replacing the existing photo uploader.

Header above the slots:
```
*  Your photos
   Five photos, each does a different job.
```

Stack layout, vertical, full width up to `var(--app-max-width)`. Gap between slots: `var(--space-5)` (24px).

Below the slots, a single line:
> *Profiles with all five photos tend to feel complete.* — `.type-helper` italic, `var(--fg-2)`. **No progress bar.**

### 9.2 `slotBriefs.ts`

Single source for slot copy and aspect ratios.

```ts
import type { ProfilePhotoSlot } from "@/types/profilePhotos";

export const SLOT_ORDER: ProfilePhotoSlot[] = [
  "cover", "establishing", "pack", "solo", "closer",
];

export const slotBriefs: Record<ProfilePhotoSlot, {
  label: string;
  helper: string;
  aspect: "4/5" | "3/2" | "free";   // "free" = user picks 1:1, 4:5, or 16:9
}> = {
  cover:        { label: "Main photo",            helper: "A clear photo of you. Eye contact. Daylight is your friend.", aspect: "4/5" },
  establishing: { label: "Where you spend time",  helper: "A wider shot — your neighbourhood, a favourite park, your sofa with the dog on it.", aspect: "4/5" },
  pack:         { label: "You and your pet",      helper: "A photo with at least one of your pets. You can add a caption.", aspect: "3/2" },
  solo:         { label: "A photo of just you",   helper: "One more frame of you — square, portrait, or wide, however it was shot.", aspect: "free" },
  closer:       { label: "One last photo",        helper: "The image you'd want a neighbour to remember.", aspect: "4/5" },
};
```

> **The `solo` slot — aspect picker.** When the user uploads to `solo`, the cropper exposes three quick-pick aspect tabs *Square · Portrait · Wide* (1:1, 4:5, 16:9). The chosen aspect is stored in `photos.solo_aspect` and drives `ProfileAdaptivePlate` at render time. No other slot offers aspect choice.

### 9.3 `ProfilePhotoSlot` — empty state

- Container: `aspect-ratio` from spec; full width; `border-radius: var(--radius-lg)` (16).
- Border: `2px dashed rgba(33,69,207,0.30)`.
- Background: `var(--bg-blue-soft)` (#EBF5FF).
- Centered content stack:
  - Lucide `Plus`, 32px, `var(--huddle-blue)`.
  - Label: `.type-h4` (18/600), `var(--fg-1)`, 8px below icon.
  - Helper: `.type-helper`, `var(--fg-2)`, 4px below label, max-width 280px, centered.
- Tap surface: entire card. Opens hidden `<input type="file" accept="image/*">`.
- Hover (web ≥ 768px): background → `rgba(33,69,207,0.06)` over `var(--dur-fast)` `var(--ease-std)`.
- Press: `transform: scale(0.97)` + `box-shadow: var(--neu-pressed-shadow)`.

### 9.4 `ProfilePhotoSlot` — filled state

- Same aspect-ratio container; image edge-to-edge with `border-radius: var(--radius-lg)`.
- Top-left chip: `slotBriefs[slot].label` in `.type-meta`, on `var(--glass-e1-bg)` + `backdrop-filter: blur(var(--glass-e1-blur))`, radius `var(--radius-pill)`, padding `4px 10px`. Tells the user *which* slot they're looking at without leaving the card.
- Top-right: a 32×32 frosted glass icon button with Lucide `MoreHorizontal`. Tap → opens `ProfilePhotoSlotSheet`.
- Slot `pack` only: `ProfilePackCaptionField` directly below, `var(--space-4)` gap.

### 9.5 `ProfilePhotoSlotSheet`

`GlassSheet` (mobile-first bottom sheet; on web ≥ 768px, anchored popover).

- Two list items, 40px tall, 16px padding-inline:
  1. Lucide `RefreshCw` + *"Replace photo"* → opens file picker.
  2. Lucide `Trash2` + *"Remove photo"* → confirmation `GlassModal` E3.
- Cancel: tap outside or swipe down.

Confirmation modal copy:
- Title: *Remove this photo?*
- Body: *It'll disappear from your profile right away.*
- Primary: *Remove* (`validation-red`, neumorphic).
- Secondary: *Keep it* (neutral).

### 9.6 `ProfilePhotoCropper`

- Library: `react-easy-crop` (install if absent: `pnpm add react-easy-crop`).
- Modal: `GlassModal` E3.
- Crop aspect: locked to `slotBriefs[slot].aspect`.
- Controls (modal footer):
  - Zoom slider — neumorphic track, brand-blue thumb.
  - `NeuButton` primary *"Save"* + tertiary *"Cancel"*.
- Output: `canvas.toBlob('image/webp', 0.85)`, max long edge 1600px.
- Storage path: `Profiles/{userId}/{slot}-{timestamp}.webp` in Supabase Storage.
- On save: delete the prior file in that slot **after** the new path is committed to `photos`.
- Keyboard: arrow keys nudge crop position 1px; shift+arrow nudges 8px; Esc cancels.

### 9.7 `ProfilePackCaptionField`

- Only visible when `photos.pack` is set.
- Built on `FormField` primitive — `border-radius: var(--radius-field)` (14), height **40px (web convention)**.
- Label: *"Caption"* in `.type-label`. Sentence case. No colon.
- **No placeholder.** (Per huddle voice doctrine: empty fields stay empty; we don't hint with examples in this slot.)
- `maxLength={30}`. Counter to the right of the label, `.type-helper`, format `12 / 30`.
- Validation: trim on blur; empty becomes `null`.

### 9.8 Validation rules

- Save button disabled until `photos.cover` is non-null.
- Client rejects raw file > 25MB before any conversion. Toast: *"That file's too big. Try a photo under 25MB."* (`validation-red`). The 12MB limit applies to the final compressed output (see §9.11) — well below the cap in practice.
- Mime allow-list: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`. HEIC/HEIF converted client-side before crop. Toast on failure: *"That file type's not supported. Try JPG, PNG, or HEIC."*

### 9.11 Image pipeline — convert + compress + upload

A single helper at `src/lib/profilePhotos.ts` handles every upload through the same pipeline:

```
file
  → 1. mime + size guard (reject early)
  → 2. heic2any() if mime is image/heic or image/heif → JPEG blob
  → 3. user crops in ProfilePhotoCropper (aspect locked per slot)
  → 4. canvas resize: cap long edge at 1600px
  → 5. canvas.toBlob('image/webp', 0.82) — primary path
       fallback to ('image/jpeg', 0.85) on browsers without WebP encode
  → 6. if final blob > 1.2MB, re-encode at 0.72 quality (single retry)
  → 7. upload to Supabase Storage bucket "Profiles" at:
       Profiles/{userId}/{slot}-{timestamp}.webp
  → 8. delete the previous file in that slot after the new path is committed
```

**Targets:**
- Final size budget: **≤ 1.2MB per photo** after compression. Five slots × 1.2MB = 6MB max per profile in the bucket.
- WebP quality 0.82 (primary), 0.72 (retry). JPEG fallback 0.85.
- Long-edge cap 1600px — sufficient for retina rendering at slot widths 220–430px.

**Libraries:**
- `heic2any` for HEIC/HEIF decode.
- No external compressor library — the canvas + `toBlob` is the compressor.

**Error handling:**
- HEIC decode failure → toast `edit.photos.error.unsupported`.
- Encode failure → fallback to JPEG path; if both fail, toast `edit.photos.error.unsupported`.
- Upload failure → keep the previous slot value; toast `edit.photos.error.uploadFailed` (*"Couldn't save that photo. Try again in a moment."*).
- Network drop mid-upload → upload retries once with exponential backoff (250ms, 1000ms) before erroring.

**Telemetry:**
- Log `profile_photo_upload` with `slot`, `mime_in`, `bytes_in`, `bytes_out`, `duration_ms`, `retried`, `success`. Used to validate the size budget post-launch.

### 9.9 Reordering

**Locked.** Slots are fixed; only the photo inside a slot can change. No drag-to-reorder. This is a deliberate editorial discipline — slots have semantic jobs.

### 9.10 Accessibility

- Each empty slot is a `<button>` with `aria-label="{label}, {helper}"`.
- Each filled slot pairs the photo with a `<button>` for the slot's actions.
- `Replace` / `Remove` sheet: focus trap; `Esc` closes.
- Cropper: keyboard nudge as above.
- `aria-live="polite"` region announces *"Photo uploaded to {label}"* on success.
- Reduced motion (`@media (prefers-reduced-motion: reduce)`): all transitions clamp to 0.01ms (global rule). The Pack has no rotation or hover transform to disable.

---

## 10. Motion & interaction

| Surface | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| `ProfileHero` photo | mount | fade + scale 1.02 → 1 | `--dur-enter` 350 | `--ease-out` |
| `ProfilePack` polaroid | press | scale 0.97 (inherited from `PolaroidCard`) | `--dur-fast` 150 | `--ease-std` |
| Empty → filled slot | upload success | image cross-fade | `--dur-slow` 300 | `--ease-std` |
| Slot tap | press | scale 0.97 + bevel invert | `--dur-fast` 150 | `--ease-std` |
| Slot sheet | open | slide-in from bottom | `--dur-enter` 350 | `--ease-out` |
| Cropper modal | open | scale 0.96 → 1 | `--dur-slow` 300 | `--ease-out` |
| Lightbox | open | fade backdrop + scale 0.96 → 1 | `--dur-base` 200 | `--ease-out` |

No spring/bounce. No overshoot. Reduced-motion is global.

---

## 11. File plan

### New files

```
src/types/profilePhotos.ts
src/components/ui/PolaroidCard.tsx                      # extracted shared primitive (Phase 0)
src/lib/profilePhotos.ts                                # validation, mime/size, curate(legacyAlbum), convert+compress pipeline (§9.11)
src/components/profile/ProfileSectionMark.tsx
src/components/profile/sections/ProfileHero.tsx
src/components/profile/sections/ProfilePullQuote.tsx
src/components/profile/sections/ProfilePlate.tsx
src/components/profile/sections/ProfilePack.tsx
src/components/profile/sections/ProfileVitals.tsx
src/components/profile/sections/ProfileAdaptivePlate.tsx
src/components/profile/sections/ProfileColophon.tsx
src/components/profile/edit/ProfilePhotoSlots.tsx
src/components/profile/edit/ProfilePhotoSlot.tsx
src/components/profile/edit/ProfilePhotoCropper.tsx
src/components/profile/edit/ProfilePhotoSlotSheet.tsx
src/components/profile/edit/ProfilePackCaptionField.tsx
src/components/profile/edit/copy/slotBriefs.ts
src/assets/brand/Polaroid.png                           # copied from /app design system
supabase/migrations/<ts>_profile_photos_jsonb.sql
```

### Modified files

```
src/components/profile/PublicProfileView.tsx            # rewritten as composition (≤80 lines)
src/components/modals/ProfileModal.tsx                  # body becomes <PublicProfileView/>; chrome only
src/components/service/CarerPolaroidCard.tsx            # refactored to import shared <PolaroidCard/> primitive
src/pages/EditProfile.tsx                               # replace existing uploader with <ProfilePhotoSlots/>
src/contexts/LanguageContext.tsx                        # new keys (see §13)
src/lib/profile/queries.ts                              # SELECT photos jsonb + pack_caption
src/lib/profile/mutations.ts                            # update photos jsonb
```

### Files retained (read-only) for one release

```
src/<...>/social-album components                       # legacy, kept until Phase 5 (cleanup)
profiles.social_album column                            # kept until Phase 5 (cleanup)
profiles.photo_url column                               # kept until Phase 5 (cleanup)
```

---

## 12. Component → token map

| Element | Tokens / classes |
|---|---|
| Hero name | `.type-hero-sm`; `color: var(--fg-on-dark)` |
| Vitals AGE row | `.type-meta` label; Urbanist 600 16px value, `color: var(--fg-1)` (no Coral on hero — v1.1) |
| Hero meta line | `.type-meta`; white at 90% |
| Pull-quote text | Urbanist 500 italic; `--t-h3`; `color: var(--fg-1)`; `line-height: var(--lh-snug)` |
| Section mark asterisk | weight 800; 16px; `color: var(--huddle-blue)` |
| Section title | `.type-h2` + `text-transform: uppercase` + `letter-spacing: 0.01em` |
| Polaroid frame | white; `box-shadow: var(--neu-rest-shadow)`; `border-radius: 4px`; padding 12/12/56/12 |
| Pet name caption | `.type-label` |
| Pet meta caption | `.type-meta` |
| Vitals container | **No card chrome (v1.1).** Renders directly on `var(--bg-canvas)`. No background, no border, no shadow, no radius. Padding-inline `var(--space-5)`; padding-block `var(--space-6)`. |
| Vitals row divider | 1px solid `rgba(66,73,101,0.10)` hairline; last row no divider |
| Vitals row label | `.type-meta`; `color: var(--fg-2)` |
| Vitals row value | Urbanist 600; `--t-body`; `color: var(--fg-1)` |
| Empty slot | dashed 2px Huddle Blue alpha; `background: var(--bg-blue-soft)`; `border-radius: var(--radius-lg)` |
| Filled slot label chip | glass-e1; `.type-meta`; `border-radius: var(--radius-pill)` |
| Caption input | `FormField`; `--radius-field`; **40px height (web)** |
| Plate caption | `.type-meta`; white; on dark protection gradient |
| Section vertical rhythm | `var(--space-7)` 40px between text↔plate boundaries |
| Sheet | `GlassSheet`; `--glass-e2-*`; `--radius-2xl` |
| Modal | `GlassModal`; `--glass-e3-*`; `--radius-3xl` |
| Lightbox backdrop | `rgba(0,0,0,0.72)`; **no blur** (lightbox not in the permitted glass list) |

---

## 13. Copy & i18n

All user-visible strings go through `LanguageContext.tsx`. Copy follows the design system house voice — calm, confident, human, sentence case, no emoji.

```
profile.section.pack.title              "The pack"
profile.section.pack.companions_one     "1 companion"
profile.section.pack.companions_other   "{{count}} companions"
profile.section.pack.experience         "{{years}} years · {{species}}"
profile.section.pack.firstTimer         "{{name}} is new to pet life — ready to begin."
profile.colophon.member                 "huddle member · verified · {{location}}"
profile.colophon.joined                 "Joined {{month}} {{year}}"

edit.photos.heading                     "Your photos"
edit.photos.sub                         "Five photos, each does a different job."
edit.photos.slot.cover.label            "Main photo"
edit.photos.slot.cover.helper           "A clear photo of you. Eye contact. Daylight is your friend."
edit.photos.slot.establishing.label     "Where you spend time"
edit.photos.slot.establishing.helper    "A wider shot — your neighbourhood, a favourite park, your sofa with the dog on it."
edit.photos.slot.pack.label             "You and your pet"
edit.photos.slot.pack.helper            "A photo with at least one of your pets. You can add a caption."
edit.photos.slot.solo.label             "A photo of just you"
edit.photos.slot.solo.helper            "One more frame of you — square, portrait, or wide, however it was shot."
edit.photos.slot.closer.label           "One last photo"
edit.photos.slot.closer.helper          "The image you'd want a neighbour to remember."
edit.photos.aspect.square               "Square"
edit.photos.aspect.portrait             "Portrait"
edit.photos.aspect.wide                 "Wide"
profile.closer.signoff                  "end."

edit.photos.caption.label               "Caption"
# edit.photos.caption.placeholder       — REMOVED. No placeholder per voice doctrine.
edit.photos.completion                  "Profiles with all five photos tend to feel complete."
edit.photos.replace                     "Replace photo"
edit.photos.remove                      "Remove photo"
edit.photos.removeConfirm.title         "Remove this photo?"
edit.photos.removeConfirm.body          "It'll disappear from your profile right away."
edit.photos.removeConfirm.confirm       "Remove"
edit.photos.removeConfirm.cancel        "Keep it"
edit.photos.error.tooLarge              "That file's too big. Try a photo under 25MB."
edit.photos.error.unsupported           "That file type's not supported. Try JPG, PNG, or HEIC."
edit.photos.error.uploadFailed          "Couldn't save that photo. Try again in a moment."
edit.photos.toast.migrated              "We've reorganised your photos into the new layout. Take a look."
profile.section.pack.overflowMore       "+{{count}} more"
profile.section.pack.overflowSub        "See the rest"
```

zh-TW: stub each key with the English value plus a `// TRANSLATE` flag; pass to localisation owner before launch.

---

## 14. Backend & API

- `GET /api/profile/:id` — returns `photos` jsonb and `pack_caption`. Resolves signed URLs server-side for non-public buckets.
- `PATCH /api/profile/me` — accepts a partial `photos` payload + `pack_caption` + `solo_aspect`. Validates each path matches `^Profiles/{userId}/(cover|establishing|pack|solo|closer)-\d+\.webp$`.
- Supabase Storage: bucket **`Profiles`** (locked in §18). RLS — owner-write, public-read for `Profiles/{userId}/`.
- Cleanup job: weekly cron deletes objects under `Profiles/{userId}/` not referenced by `photos`.

---

## 15. Performance

- Slot images: WebP, max 1600px long edge.
- Hero `cover`: `loading="eager"; fetchpriority="high"`. All other plates `loading="lazy"`.
- Optional Phase 2: store a 24-byte LQIP dataURL alongside `cover` (`photos.cover_lqip`) for instant render.
- Use `<img srcset>` with widths `400, 800, 1200, 1600`.
- Polaroid frame is **CSS-only** — no PNG network request per polaroid (asset fallback decided post-Storybook review per §19).
- Cropper output: `canvas.toBlob('image/webp', 0.85)`.
- Lighthouse Performance target: ≥ 90 mobile preset on the profile route.

---

## 16. Testing

### Unit (Vitest)

- `lib/profilePhotos.ts`
  - `curate(legacyAlbum: string[]) → ProfilePhotos` — every legacy length 0…9 produces correct mapping.
  - `validateMime`, `validateSize`.
- `slotBriefs` — snapshot.

### Component (Vitest + Testing Library)

- `ProfileHero`: renders name only (no age, no Coral numeral — v1.1); hides badges when flags false.
- `ProfilePlate`: returns null when `src` is null.
- `ProfilePullQuote`: returns null when bio empty.
- `ProfileVitals`:
  - always-public rows (AGE, LOCATION, GENDER) render whenever value is non-empty, regardless of any flag.
  - flag-gated rows render only when flag is true *and* value is non-empty.
  - rows with no source value never render.
- `ProfilePhotoSlot`:
  - empty state shows label + helper
  - filled state shows label chip
  - tap on empty opens file picker (mocked)
  - tap on filled opens sheet
- `ProfilePackCaptionField`: 30-char limit; counter updates correctly.

### Visual (Storybook + Chromatic if available)

Stories per component:

- Hero with / without badges; with / without sub-line
- Plate at every aspect; with / without caption
- Pack with 0, 1, 3, 6 pets; first-timer empty state
- Vitals fully populated; minimal; with flag-gated rows hidden but always-public rows still showing
- Slot empty / filled / pack-with-caption / cropper-open

### E2E (Playwright)

- Upload `cover` → save enabled → save succeeds → profile renders.
- Upload pack photo + caption → caption appears on plate 03.
- Remove pack photo → caption field disappears; plate 03 omitted.
- Migration: legacy account with 7-item album renders with the first 5 in correct slots; items 6–7 dropped.

### Accessibility

- axe scan on view + edit pages — zero serious / critical.
- Keyboard-only flow: tab through 5 slots → upload → crop → save.
- Screen reader spot-check: VoiceOver (iOS / macOS), NVDA (Windows).

### Quality gates

- `npm run lint` — zero new warnings.
- `npm run build` — zero new warnings.

---

## 17. Phased rollout

**Discipline:** each phase ships independently to `main` and is observable in production before the next phase starts. **Modal-surface replacement is deliberately split off into its own pass** (Phase 6) so a regression in `ProfileModal` (used in Map / Chats / Social) cannot block the editor or viewer.

| Phase | Scope | Branch | Acceptance |
|---|---|---|---|
| **1. Foundation — `PolaroidCard` extraction** | Extract `PolaroidCard` from `CarerPolaroidCard` into `src/components/ui/PolaroidCard.tsx`; refactor the carer card to consume it. **No new feature surface.** Verify tokens in `src/styles/tokens.css` cover what the v1.1 plan needs; add aliases only if missing. | `chore/polaroid-card-extract` | Service marketplace renders pixel-identical post-refactor; visual diff clean; Storybook story for `PolaroidCard` in all states. |
| **2. Data layer + backfill** | Supabase migration adding `photos jsonb` + `pack_caption` + `solo_aspect`. Backfill from `photo_url` + `social_album`. New types, queries, mutations. Feature flag column `PROFILE_EDITORIAL_V1`. **Reads still go through legacy code; new shape is dual-written but not yet rendered.** | `feat/profile-photos-data` | 100% of rows have `photos` jsonb populated; legacy `social_album` + `photo_url` untouched; queries return both shapes; staging smoke-tested with prod snapshot. |
| **3. Edit mode only** | `ProfilePhotoSlots` + `ProfilePhotoSlot` + `ProfilePhotoCropper` + `ProfilePhotoSlotSheet` + `ProfilePackCaptionField`. Image pipeline (HEIC + compressor). Old uploader hidden behind `PROFILE_EDITORIAL_V1` flag. **View mode still renders legacy.** | `feat/profile-photo-slots` | Behind flag, users can upload all 5 slots, crop with aspect lock, choose square/portrait/wide for `solo`, replace, remove, caption pack; final size budget honored; legacy users unaffected. |
| **4. View mode only** | All section components (`ProfileHero`, `ProfilePullQuote`, `ProfilePlate`, `ProfilePack`, `ProfileVitals`, `ProfileAdaptivePlate`, `ProfileColophon`, `ProfileSectionMark`); rewrite `PublicProfileView` as composition. Behind same flag. **Modal surfaces still use legacy `ProfileModal` body — out of scope for this phase.** | `feat/profile-editorial-view` | Behind flag, the public profile route renders the new spread for users who completed editor; legacy data also renders correctly via `curate()`. Ship at 10% → 50% → 100% over 2 weeks. |
| **5. Polish, copy, cleanup** | a11y pass; Storybook stories; brand-owner copy sign-off; flag retired at 100%; legacy `social_album` + `photo_url` columns dropped. **Modal surfaces still legacy.** | `chore/profile-polish` | Lighthouse ≥ 90; axe clean; copy approved; flag removed; legacy columns dropped. |
| **6. Modal-surface unification** *(separate pass)* | Replace `ProfileModal` body with `<PublicProfileView />`. Map / Chats / Social open the new spread. **Done only after Phase 5 (cleanup) is stable in prod for ≥ one release window.** | `feat/profile-modal-unify` | Avatar tap from Map, Chats, Social opens the new spread inside `GlassSheet` (mobile) or `GlassModal` (web ≥ 768px). No regression on existing modal triggers. |
| **7. Native parity** | **Starts only after Phase 6 is at 100% rollout** and stable. Port to Expo. Move `slotBriefs` to a shared package if monorepo allows. Swap Lucide → Ionicons (`*-outline`). | `feat/profile-native` | Native edit + view match web composition within ±4px. |

**Why this ordering is the safe one:**

- `PolaroidCard` first → Service marketplace is the canary. If the extraction breaks, we catch it before anything profile-related is touched.
- Data layer second → schema is stable and observable before any UI consumes it. If backfill is wrong, we fix it without UI rollback.
- Edit before view → users self-curate into the new shape; the view phase renders against real production data, not synthetic test data.
- View before modal → the standalone profile route is a smaller blast radius than `ProfileModal`, which is wired into Map / Chats / Social.
- Modal as its own pass → the most coupled surface in the app gets the most isolation.

**Feature flag:** `PROFILE_EDITORIAL_V1` boolean column on `profiles`. Staged rollout 10% → 50% → 100% over 2 weeks within Phase 4.

**Rollback strategy per phase:** flip `PROFILE_EDITORIAL_V1` to false (Phases 3–5); revert the branch (Phases 1, 2, 6, 7).

---

## 18. Open questions — resolved 2026-04-29

| # | Question | Decision |
|---|---|---|
| 1 | Edit profile route | `src/pages/EditProfile.tsx` |
| 2 | Cropper library | `react-easy-crop`. Display follows Hinge / Bumble — aspect-locked at upload, `object-cover` at render, no per-render recropping. |
| 3 | Storage bucket name | `Profiles` |
| 4 | HEIC handling | Ship `heic2any` converter **and** the canvas-based compressor pipeline (§9.11). Final size budget 1.2MB/photo. |
| 5 | Polaroid implementation | Reuse `CarerPolaroidCard`'s contract. Extract a shared `PolaroidCard` primitive at `src/components/ui/PolaroidCard.tsx`. Service and Pack import the same component. No CSS reinvention; no PNG asset toggle. |
| 6 | Native timeline | Phase 7 (Expo) starts only **after web Phase 6 (modal-surface unification) is at 100% rollout** and stable for at least one release window. |
| 7 | `orientation` field labelling | Keep label as `ORIENTATION` in Vitals (matches existing visibility flag). If brand owner wants it renamed `PRONOUNS` post-launch, it's a one-line copy change. |

---

## 19. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Users dislike slot constraints | Track save-completion-rate before/after. If <70% fill ≥3 slots after 2 weeks, reduce to 4 mandatory + 2 optional and revisit briefs. |
| Migration backfill places photos in semantically wrong slots | First-edit toast invites user to *"take a look"*. Default state visible immediately. |
| HEIC handling fragile | `heic2any` client-side; fallback toast if decoder fails. |
| CSS polaroid looks cheap | Storybook A/B with PNG asset; flip a `usePolaroidAsset` flag in `ProfilePack` if needed. |
| Vitals dossier feels too cold | Add a single Coral asterisk above the card; if still cold, re-introduce one Lucide icon at the top-left of the card (not per row). |
| Bottom sheet collides with iOS safe area | Existing `GlassSheet` already handles `env(safe-area-inset-bottom)`. Verify on device. |
| Existing avatar consumers still read `photo_url` | Migration keeps the column populated with `photos.cover` until Phase 5 (cleanup). |

---

## 20. Definition of done

- [ ] All new components have Storybook stories.
- [ ] `npm run lint` passes with zero new warnings.
- [ ] `npm run build` passes with zero new warnings.
- [ ] Lighthouse Performance ≥ 90 on the profile route, mobile preset.
- [ ] axe scan on view + edit pages returns zero serious / critical issues.
- [ ] Visual diff screenshots checked into the PR for: empty profile, half-filled profile, full profile, edit empty state, edit half-filled, cropper open.
- [ ] Brand owner sign-off on copy in `slotBriefs.ts` and the new i18n keys.
- [ ] Feature flag wiring tested at 0% / 50% / 100% rollout.
- [ ] Migration smoke-tested on staging with a sanitised snapshot of prod data.
- [ ] First-edit toast confirmed to render once per user.

---

---

## 21. Native portability check (web → Expo)

> **No code in `/mobile` or `/app` is touched in this pass.** This section documents that every v1.1 decision is portable, so Phase 7 is a port not a redesign.

### 21.1 Portability matrix

| Web decision | RN equivalent | Risk |
|---|---|---|
| `aspect-ratio` CSS on plates | `aspectRatio` style prop (RN ≥ 0.71 native; supported on Expo SDK 49+) | None |
| Plate width 100% / 88% inset, left/right | `width: "100%"` / `width: "88%"` + `alignSelf: "flex-start" \| "flex-end"` | None |
| Hairline `1px solid rgba(66,73,101,0.10)` between Vitals rows | `StyleSheet.hairlineWidth` + same color | None |
| `object-cover` images | `<Image resizeMode="cover" />` or `expo-image` `contentFit="cover"` | None |
| Hero protection gradient | `expo-linear-gradient` | None |
| `backdrop-filter: blur(...)` on glass chips | `expo-blur` `<BlurView intensity={...} tint="light" />` | Slight render-cost on Android — already accepted across the app's existing glass surfaces |
| `var(--coral-orange)` etc. | Tokens already mirrored in `mobile/src/theme/tokens.ts` per design-system README | None |
| Urbanist (TTF self-hosted) | Already loaded in mobile via `expo-font` (per design-system README) | None |
| `.type-meta`, `.type-hero-sm` etc. | Mapped to RN text styles in `mobile/src/components/HText.tsx` (per design-system README) | None |
| `PolaroidCard` (4:5 `#f0f0f0` frame, 5% inset photo, caption strip) | Pure View + Image composition; no web-only APIs used | None |
| `ProfileAdaptivePlate` aspect 1:1 / 4:5 / 16:9 | `aspectRatio` numeric (1, 0.8, 1.7777) | None |
| Polaroid `whileTap={{ scale: 0.97 }}` | `react-native-reanimated` `useAnimatedStyle` + `Pressable` (already used) | None |
| `react-easy-crop` (web upload) | Replaced by `expo-image-picker` with `allowsEditing: true` + `aspect: [w, h]` per slot, or `react-native-image-crop-picker` if richer crop UI needed | Library swap, not a design change |
| `heic2any` (web HEIC decode) | Native: HEIC handled by the OS via `expo-image-picker` — no decode needed | None — strictly simpler on native |
| Canvas `toBlob('image/webp', 0.82)` compressor | `expo-image-manipulator` `manipulateAsync(uri, [{resize}], { compress: 0.82, format: SaveFormat.WEBP })` | None |
| Supabase Storage upload to `Profiles/{userId}/...` | Same client (`@supabase/supabase-js`); same path scheme; same RLS | None |
| `slotBriefs.ts`, `ProfilePhotos` types, copy keys | Move to a shared package (e.g. `packages/profile-photos`) at Phase 7 kickoff so web + native share one source | None |
| `GlassSheet` / `GlassModal` web primitives | Mobile already ships analogues (`GlassSheet` in `mobile/src/components/`, per design-system README) | None |
| Lucide icons | Swap to Ionicons `*-outline` (already convention per design-system README §Iconography) | None |

### 21.2 Things that get *easier* on native

- HEIC: no decoder needed — OS handles it.
- Compression: `expo-image-manipulator` is a single call; no canvas dance.
- Cropper: OS-provided picker is the standard UX users expect.
- Reduced motion: `AccessibilityInfo.isReduceMotionEnabled()` is a one-liner.

### 21.3 Things to flag for the Phase 7 implementer

1. The 88% inset plates — verify they don't collide with the iOS notch / Dynamic Island when the profile is shown in a full-screen sheet (it shouldn't, since the profile lives below the sheet's drag handle, but worth a device test).
2. WebP support: iOS 14+ and Android 4.0+ both support WebP natively, so the compression target is portable.
3. Hairline rules: on iOS retina, `StyleSheet.hairlineWidth` is 0.33 and looks correct; on Android it can render at 0.5. Acceptable per existing app conventions.
4. Polaroid box-shadow: web uses `box-shadow`; RN needs `elevation` (Android) + `shadowColor / shadowOpacity / shadowOffset / shadowRadius` (iOS). The shared `PolaroidCard` should expose a platform-aware shadow spec via the existing token bridge.

**Verdict:** every v1.1 decision is portable. Phase 7 is a port, not a redesign. No web-only API or layout primitive is in use that lacks a clean RN equivalent.

---

*End of plan. Open questions in §18 are resolved. Phase 0 is unblocked.*
