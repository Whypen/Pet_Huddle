# UI_CONTRACT_HUDDLE_GLASS_NEU
**Version:** 6.1 FINAL — Apple Editorial Audit + Enforcement Rewrite
**Authority:** Supersedes all previous contracts (v1–v6.0). Single source of truth.
**Stack:** React + Vite + Tailwind CSS + Urbanist (Google Fonts)
**Does NOT override:** MASTER_SPEC.md (product logic, tiers, quotas, routes)

**Token Policy (PATCH A — RESOLVED):**
> **Option 1 is enforced:** Reference-locked screen blocks in Section 10 MAY use
> hardcoded literal values exactly as specified in that section. All other code
> — page files, components outside Section 10, global styles — MUST use only
> :root-scoped CSS custom properties defined in Section 12. No exceptions.

**Locked References:**
| System | Source |
|---|---|
| Glass surface | https://www.behance.net/gallery/145926467/UI-kit-STORAGE-Glassmorphism-UI-Kit-Design |
| Neu controls | https://www.behance.net/gallery/97897977/Free-Neomorphic-UI-Kit-for-Dashboards |
| Neu icons | https://www.behance.net/gallery/199099915/Neumorphism-UI-Icon |
| AI Vet | https://www.cosmos.so/e/1718180492 |
| Section divider | https://www.cosmos.so/e/1092080551 |
| Subscription paywall | https://www.cosmos.so/e/813266309 |
| Settings inset panel | https://www.cosmos.so/e/1336723141 |
| Signup steps | https://www.cosmos.so/e/2047032905 |
| Animated upload + save | https://www.cosmos.so/e/368946619 |
| Broadcast / nanny modal | https://www.cosmos.so/e/403392397 |

---

## 1. ENFORCEMENT RULES

A screen is COMPLIANT only when every rule below passes simultaneously. Any single failure = contract failure. MUST NOT ship.

```
RULE 1 — NO DIRECT CONTROL STYLING IN PAGES
  MUST NOT style buttons, toggles, chips, dropdowns, OTP grids, phone inputs,
  select elements, textareas, checkboxes, or range sliders directly inside
  page or screen files.
  MUST use the primitives defined in Section 6 (NeuControl) and Section 7
  (FormField). See Section 2 for the full Control Replacement Map.
  No exceptions except src/components/paywall/PaywallCTA.tsx.
  MUST NOT add transition: all or any transition shorthand without explicit
  property list to any NeuControl element or wrapper.

RULE 2 — TOKEN-ONLY STYLE CHANGES (outside reference-locked blocks)
  All style values outside Section 10 reference-locked blocks MUST reference
  :root-scoped CSS custom properties from Section 12 only.
  "Token" means a :root-scoped custom property defined in Section 12.
  Component-local custom properties are NOT tokens for this rule.
  MUST NOT create new CSS custom properties outside Section 12.
  If a value has no Section 12 token, amend Section 12 first.
  Inline or page-scoped overrides are NON-COMPLIANT unless the component
  is documented in Section 10 and the override is listed there.
  Exception: Section 10 reference-locked blocks may use literal hex/rgba
  values as specified. These values are immutable and must not be tokenised
  without a contract amendment.

RULE 3 — NO PARALLEL SYSTEMS
  MUST NOT let old and new button/icon/glass/font implementations coexist.
  Before shipping any page, delete all prior implementations of the same
  control type in that page scope. Includes legacy Tailwind button classes
  (bg-blue-500, rounded-md) alongside NeuControl.

RULE 4 — PAGE INDEX IS MANDATORY
  Every route MUST have a Page Index entry (Section 4).
  A page with no entry is UNMAPPED and MUST NOT be modified until it
  receives a contract amendment.
  UNMAPPED pages MUST still comply with the Minimum Compliance Layer
  (Section 4 — MCL). Unmapped means "no template assigned", not "exempt
  from all rules."

RULE 5 — TEMPLATE COMPLIANCE
  Every mapped page MUST map to exactly one Editorial Template (Section 3).
  Compliance is verified by block order, not visual appearance.

RULE 6 — ABOVE-THE-FOLD LIMIT
  Max 2 primary content blocks visible before first scroll on a 390px-wide
  mobile viewport at 100% zoom. Headline + supporting line = 1 block.

RULE 7 — CARD GROUPING
  Screens with 4+ cards MUST group into 2–4 sections, each separated by a
  CapsuleDivider or SectionCardDivider (Section 10).
  Screens with fewer than 4 cards: single ungrouped list is permitted.
  Ungrouped micro-cards on a 4+-card screen = NON-COMPLIANT.

RULE 8 — GOLD COLOR ISOLATION
  --gold, --gold-light, --gold-surface MUST NOT appear outside Gold-tier UI.
  Gold-tier UI: Gold subscription page/modal, Gold tier badge, Gold settings block.
  Plus tier uses --blue exclusively. No gold pixel on a Plus or neutral screen.

  ENFORCEMENT PATTERN — tier prop:
    A component may conditionally render Gold vs Blue via a tier="gold"|"plus"
    prop. Gold tokens MUST NOT appear outside a tier="gold" branch.
    MUST NOT hardcode Gold values without a tier guard.

  GOLD SWEEP CHECKLIST (run before any Gold-related PR):
    grep -rn "var(--gold\|--gold-light\|--gold-surface\|#CFAB21\|#D9B528" src/ \
      --include="*.tsx" --include="*.css"
    For every match: confirm it is inside a tier="gold" branch.
    Any unguarded match = contract failure.

RULE 9 — ONE ICON FAMILY
  MUST use Lucide React exclusively. No Heroicons, no MUI icons, no SVG
  imports outside Lucide. Exceptions: brand logo SVG, animated SVG progress
  ring in UploadZone (Section 10 only).
  Every Lucide icon MUST have strokeWidth set explicitly per Section 8.
  MUST NOT use the Lucide default strokeWidth (2.0).

RULE 10 — TYPOGRAPHY DISCIPLINE
  MUST use Urbanist exclusively (Section 12). MUST NOT override font-family,
  font-size, font-weight, or letter-spacing outside the Section 12 scale.
  One H1 per screen in the DOM at any moment. Hidden H1 elements count.
  One supporting Body line in the hero/header zone per screen.
  Body and Label MUST NOT exceed 36ch. Headlines MUST NOT exceed 22ch.

RULE 11 — FIRST-FRAME CANVAS + AUTH HERO PLATFORM
  The canvas gradient MUST be visible before JavaScript executes.
  MUST set background-color: #D5DFEF (literal hex) on <body> as an
  inline style in index.html. MUST NOT use var(--canvas-solid) in a
  style attribute — CSS custom properties do not resolve in inline HTML
  attributes before the stylesheet loads.
  MUST set background: var(--canvas) on #root via global CSS with
  background-attachment: fixed. No white flash before hydration.

  AUTH FIRST-FRAME LAW:
  The first frame rendered on any auth screen (/login, /forgot-password)
  MUST show the canvas gradient AND the glass AuthCard platform with
  logo + brand name visible. MUST NOT render a blank or white screen on
  any frame, including the frame before React hydrates.
  MUST NOT show only a spinner on first frame for auth screens.
  The AuthCard MUST be present in the static HTML shell (SSR or inline),
  or the canvas + AuthCard structure must be injected before JS bundle loads.

RULE 12 — SKELETON STATES REQUIRED
  Every T1 (Feed), T2 (List+Filters), and T3 (Detail+Sticky CTA) page
  MUST render a skeleton layout during data loading.
  Skeleton cards MUST match real card footprint (height, border-radius).
  A centered spinner as the only loading indicator = NON-COMPLIANT.

RULE 13 — CONTROL AUDIT GATE
  Before any screen delivery is complete, run on the FULL src/ tree:
    grep -rn "<input\|<select\|<textarea" src/ --include="*.tsx" --include="*.jsx" \
      | grep -v "FormField\|NeuControl\|NeuCheckbox\|NeuToggle\|NeuSlider\|NeuDropdown\|NeuSegmented\|UploadZone"
  Expected result: zero matches.
  The grep MUST run on full src/ — not per-page — to catch wrapper indirection.
  A non-zero result = NON-COMPLIANT. MUST NOT ship.

RULE 14 — VIEWPORT-LOCKED FRAME LAW
  Every page shell MUST implement the viewport-locked frame pattern.
  No exceptions for any mapped or unmapped route.

  Required shell:
    html, body, #root {
      min-height: 100svh;       /* NOT vh — svh respects mobile browser chrome */
      display: flex;
      flex-direction: column;
    }
    .screen-frame {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .content-region {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

  Safe-area inset MUST be applied to:
    — StickyCTA:  pb-[env(safe-area-inset-bottom,16px)]
    — Composer:   pb-[env(safe-area-inset-bottom,10px)]
    — BottomNav:  pb-[env(safe-area-inset-bottom,0px)]
    — InsetPanel (Settings): pb-[env(safe-area-inset-bottom,20px)]

  MUST NOT use 100dvh as primary height for content areas.
  MUST NOT set overflow: hidden on the content-region.
  MUST NOT use position: fixed for content areas.
  position: fixed is permitted ONLY for structural chrome:
    PageHeader, BottomNav, StickyCTA, Composer, WarningStrip, toast.

  KEYBOARD-SAFE FORMS:
    Primary: window.visualViewport resize listener adjusts content-region pb.
    Fallback (visualViewport undefined): window resize + documentElement
      .clientHeight delta to estimate keyboard height.
    Minimum static fallback: pb-[280px] on FormBody when no API available.
    CTA MUST remain visible above keyboard at all times.
    Active field MUST scroll to center of visible viewport on focus.
    MUST NOT leave keyboard-safe with zero implementation.
```

---

## 2. CONTROL REPLACEMENT MAP  [PATCH B — UPDATED]

Every native HTML interactive element MUST be replaced. MUST NOT ship any native browser-default control rendering.

### Full Replacement Table

```
Native Element / Control        → Huddle Component               States Required
────────────────────────────────────────────────────────────────────────────────────
<button>                        → NeuControl (any variant)        Rest/Pressed/Disabled/Loading/Focus
<a role="button">               → NeuControl-tertiary             Rest/Pressed/Disabled/Focus
Chip / FilterChip               → NeuControl-sm                  Rest/Selected/Disabled/Focus
IconButton (nav / toolbar)      → NeuControl-icon-md/lg           Rest/Pressed/Disabled/Focus
<input type="text">             → FormField-text                  Rest/Focus/Error/Disabled
<input type="email">            → FormField-text                  Rest/Focus/Error/Disabled
<input type="password">         → FormField-text (mask toggle)    Rest/Focus/Error/Disabled
<input type="tel">              → FormField-phone                 Rest/Focus/Error/Disabled
<input type="number">           → FormField-text (inputMode=num)  Rest/Focus/Error/Disabled
<input type="search">           → FormField-search                Rest/Focus/Active/Disabled
OTP / PIN entry (6-digit)       → FormField-otp                   Rest/Selected/Filled/Error
<textarea>                      → FormField-textarea              Rest/Focus/Error/Disabled
<select>                        → NeuDropdown                     Rest/Open/Selected/Disabled/Focus
Dropdown trigger                → NeuDropdown trigger             Rest/Open/Focus
<input type="checkbox">         → NeuCheckbox                     Unchecked/Checked/Indeterminate/Error
<input type="radio">            → NeuRadio / NeuControl-sm chip   Unselected/Selected/Disabled
<input type="range">            → NeuSlider                       Rest/Active/Disabled
<input type="file">             → UploadZone                      Idle/Hover/Uploading/Complete/Error
Toggle switch                   → NeuToggle                       Off/On/Disabled
Segmented control               → NeuSegmented                    Rest/Selected/Disabled
PhoneInput (flag + tel)         → FormField-phone                 Rest/Focus/Error/Disabled
NativeAlert / confirm()         → T7 dialog shell                 (see Section 3, T7)
```

Any control type absent from this table MUST NOT be used. File a contract amendment before implementing a new control type.

### Control State Requirement

All controls MUST implement all required states listed above. A control is NOT shippable with missing states. Each state MUST be visually distinct — opacity differences alone are insufficient for Focus and Selected states.

---

## 3. EDITORIAL TEMPLATE LIBRARY

Every page maps to exactly one template. Block order is immutable. Spacing uses the 4px grid (Section 12). Allowed components are exclusive unless the screen is Reference-Locked (Section 10).

---

### T1 — FEED

**Use for:** Discovery, Home, Activity feed.

```
Block order (fixed):
  [PageHeader]     glass-e2, h-56px, fixed top, z:nav
  [FilterStrip]    h-44px, sticky below header, horizontal chip scroll
                   MUST NOT be a glass surface (glass density law — Section 5)
                   Background: transparent or rgba(255,255,255,0.20) non-elevated
  [CardStream]     content-region, px-16, pt-8, gap-12 between cards
                   CapsuleDivider or SectionCardDivider REQUIRED between named
                   section groups (threshold: 4+ cards; max 4 groups)
  [FAB]            fixed right-20 bottom-[navH+20], z:fab (optional)

Spacing:          16px horizontal | 12px between cards | 24px section gaps
Allowed controls: NeuControl-sm chips in FilterStrip; NeuControl-primary/secondary on cards
Above-fold:       PageHeader + max 2 visible cards
Card grouping:    2–4 sections; each separated by a divider
Skeleton:         3 skeleton cards (match real card height/radius) during loading
```

---

### T2 — LIST + FILTERS

**Use for:** Marketplace, any filterable list with FAB action.

```
Block order (fixed):
  [PageHeader]     glass-e2, h-56px, fixed top
  [FilterStrip]    h-44px, STICKY below PageHeader
                   MUST NOT be glass surface
  [ListBody]       content-region, px-16, pt-8, space-y-12
                   CapsuleDivider REQUIRED between named section groups (max 4)
  [FAB]            fixed right-20 bottom-[navH+20]

Spacing:          16px horizontal | 12px between rows | 8px inside FilterStrip
Allowed controls: NeuControl-sm chips in FilterStrip; no inline page buttons
Skeleton:         4 skeleton rows (match real row height/radius) during loading
```

---

### T3 — DETAIL + STICKY CTA

**Use for:** /subscription page, any detail view with persistent CTA.

```
Block order (fixed):
  [PageHeader]     glass-e2, h-56px, fixed top
  [HeroBlock]      exactly 1×H1 + 1×Body supporting line
                   mt-[headerH+24px], px-20
  [SectionBody]    content-region, px-20, space-y-32; max 4 sections
                   CapsuleDivider REQUIRED between sections
  [StickyCTA]      glass-e2, position fixed bottom-0 left-0 right-0
                   px-20 pt-12 pb-[env(safe-area-inset-bottom,16px)]

Spacing:          24px hero-to-first-section | 32px between sections
Allowed controls: NeuControl-lg for CTA | NeuControl-secondary for secondary
HeroBlock rule:   Exactly 1 H1. Exactly 1 Body line. No other content above first section.
Skeleton:         HeroBlock skeleton + 2 section skeletons during loading
```

---

### T4 — FORM / STEPPER

**Use for:** Signup steps, any multi-step form flow.

```
Block order (fixed):
  [ProgressBar]    3px, fixed top inset-x-0, z:progress
  [StepNav]        h-56px, fixed below ProgressBar, bg transparent
  [FormBody]       content-region, max-w-[400px] mx-auto, px-20, pt-40, space-y-20
                   pb-[calc(var(--cta-height,56px)+env(safe-area-inset-bottom,16px)+24px)]
                   Keyboard open: increase pb by keyboard displacement via visualViewport
  [StickyCTA]      glass-e2, fixed bottom, px-20 pt-12 pb-[env(safe-area-inset-bottom,16px)]

Spacing:          20px between unrelated fields | 12px between related/grouped fields
Per-step rule:    Exactly 1×H1. Exactly 1×Body supporting line. Fields follow beneath.
                  MUST NOT include prose between fields.
Allowed controls: NeuControl-lg for CTA | FormField components for all inputs (Section 7)
Transition:       Step transitions defined in Section 9
Field grouping:   Related fields: space-y-12. Unrelated groups: space-y-20 or CapsuleDivider.
                  Flat equal-spacing for 3+ unrelated fields = NON-COMPLIANT.
Keyboard-safe:    Implemented per RULE 14 keyboard-safe forms section.
```

---

### T5 — INSET PANEL

**Use for:** Settings and any full-screen configuration view requiring nested navigation.

```
Block order (fixed):
  [PageHeader]     glass-e2, h-56px, fixed top; title: screen name, h3 centered
  [PageCanvas]     global canvas (no glass on page background)
                   content-region, px-16, pt-[headerH+16px], pb-[safeArea+20px]
    [UserHeader]   OUTSIDE InsetPanel; Avatar 56px + Name h3 + tier badge chip
                   px-4 py-16; required for authenticated state; skeleton if loading
    [TierBlock]    OUTSIDE InsetPanel; per-tier upgrade block (spec per Section 10)
    [GroupLabel]   12px/500 UPPERCASE tracking-[0.06em] var(--text-tertiary)
                   px-4 pt-8 pb-4; positioned ABOVE its InsetPanel
    [InsetPanel]   glass-e1; border-radius 16px; overflow hidden
                   Each logical group = its own InsetPanel
      [Row × N]    h-56px; px-20; flex items-center gap-12
                   icon 20px strokeWidth 1.75 + label Body flex-1 + trailing
                   trailing: NeuToggle | Caption value | ChevronRight 16px | none
      [RowDivider] h-px bg-white/20 mx-20 (between rows; omit after last row)

Groups:           Min 2, max 5 InsetPanels per Settings page
LeftRail:         OPTIONAL, screens ≥ 640px; 72px wide; glass-e1; icon+label list

Row tap behavior:
  Toggle row    → fires immediately; no navigation
  Value row     → inline push: content slides left, secondary InsetPanel enters right
  Danger row    → T7 confirmation dialog; MUST NOT open a sheet
  Nav row       → push animation (see Section 9 timing table)
  MUST NOT open bottom sheets from any settings row.
  MUST NOT stack sheets.
  Max nesting: 1 level deep. No third-level panels.
```

---

### T6 — CONVERSATIONAL

**Use for:** AI Vet (/ai-vet), Chat DM, Chat Group.

```
Block order (fixed):
  [ChatHeader]     glass-e2, h-56px, fixed top, z:nav
  [MessageThread]  content-region, px-16, pt-[headerH+12px],
                   pb-[composerH+warningH+safeArea], space-y-16
  [WarningStrip]   fixed above Composer; AI Vet screens only (see Section 10)
  [Composer]       glass-e2, fixed bottom, px-16 pt-10 pb-[safeArea+10]

Spacing:          16px horizontal | 16px between bubbles | 8px within bubble groups
ChatHeader DM:    Avatar40 + Name(h3) + SocialRole(caption) + VerifiedBadge
ChatHeader Group: GroupAvatar40 + GroupName(h3, truncate) + MemberList(caption)
SocialRole:       EXACTLY "Pet Lover" | "Pet Parent" | "Pet Nanny" — no custom strings
No sticky sections inside MessageThread. AI response cards are the only card type in thread.
```

---

### T7 — OVERLAY / DIALOG

**Use for:** PaywallModal (non-canonical trigger only), BroadcastModal, confirmation dialogs.

```
Shell:        glass-e3, border-radius 32px 32px 0 0 (mobile)
              border-radius 28px (tablet ≥640px, centered, max-w-[440px])
              max-height 88dvh; overflow-y auto; px-20 pb-[safeArea+24px]
Backdrop:     rgba(66,73,101,0.40), backdrop-filter blur(4px), z:backdrop(39)
Entry mobile: translateY(100%→0) 350ms var(--ease-out)
Entry tablet: scale(0.94→1) + opacity(0→1) 300ms var(--ease-out)
Exit:         reverse, 200ms var(--ease-in)
z-index:      modal: 40 | backdrop: 39
Block order:  Defined per screen in Section 10. No deviation.

CONFIRMATION DIALOG (subset of T7):
  Shell:     glass-e2; border-radius 20px; max-w-[320px] mx-auto; centered
             NOT a full bottom sheet — centered floating panel
  Content:   Icon puck (optional) + H3 headline + Body (1 sentence, consequence)
             + [Primary action NeuControl-md Danger] + [Cancel NeuControl-tertiary]
  MUST NOT contain more than 2 actions.
  MUST NOT scroll.
```

---

### T8 — AUTH HERO

**Use for:** `/login`, `/forgot-password`, any unauthenticated entry point.

```
Block order (fixed):
  [Canvas]         visible before JS — #D5DFEF literal hex on <body> inline style
  [AuthCard]       glass-e2; max-w-[360px]; mx-auto; mt-[20dvh]; px-28 py-36;
                   border-radius 28px; MUST be in static HTML shell (see RULE 11)
  [LogoBrand]      Logo SVG 48px + App Name H1 + tagline Body; text-center; mb-32
  [AuthForm]       FormField components only; space-y-16
  [PrimaryAction]  NeuControl-lg Primary w-full; mt-24
  [SecondaryLinks] Caption var(--text-tertiary); text-center; mt-16

AuthCard rules:
  MUST NOT render auth form outside glass AuthCard container.
  MUST NOT place content flush against canvas (no unwrapped form).
  AuthCard MUST remain fully visible above keyboard (keyboard-safe per RULE 14).
  H1: exactly one — app name or screen title.
  AuthCard MUST be fully visible at 390×844px at rest, no scroll required.
  First frame MUST show canvas + AuthCard — never blank or white (RULE 11).
```

---

## 4. PAGE INDEX (MANDATORY)

### MAPPED ROUTES

| Route / Screen | Template | Required Blocks | Notes |
|---|---|---|---|
| `/` or `/home` | T1 Feed | PageHeader + FilterStrip + CardStream | FAB optional |
| `/ai-vet` | T6 Conversational | ChatHeader(AIVet) + MessageThread + WarningStrip + Composer | Two-mode; see Sec 10 |
| `/chat/:id` (DM) | T6 Conversational | ChatHeader(DM) + MessageThread + Composer | SocialRole required |
| `/chat/:id` (Group) | T6 Conversational | ChatHeader(Group) + MessageThread + Composer | MemberList required |
| `/service-chat` | T6 Conversational (Extended) | ServiceChatHeader + BookingCard(fixed) + ActionBar(fixed) + MessageThread + Composer or StartRequestBar | Service booking conversation |
| `/marketplace` | T2 List+Filters | PageHeader + FilterStrip + ListBody + FAB | FAB = emergency broadcast |
| `/subscription` | T3 Detail+Sticky CTA | PageHeader + HeroBlock(Orbs+H1+Benefits+Dots) + PlanTiles + StickyCTA | **Canonical page**; see Sec 10 |
| `PaywallModal` | T7 Overlay | 8-node DOM per Sec 10 | **Non-canonical trigger only** |
| `/settings` | T5 Inset Panel | PageHeader + PageCanvas + UserHeader + TierBlock + InsetPanels | No nested sheets |
| `/signup/*` | T4 Form/Stepper | ProgressBar + StepNav + FormBody + StickyCTA | Per-step H1 enforced |
| `BroadcastModal` | T7 Overlay | Header + ConstraintBar + Form + StickyCTA | Emergency color only |
| `/login` | T8 Auth Hero | Canvas + AuthCard + LogoBrand + AuthForm + PrimaryAction | First-frame canvas law |
| `/forgot-password` | T8 Auth Hero | Canvas + AuthCard + LogoBrand + AuthForm + PrimaryAction | Back in SecondaryLinks |

### T6 Extension — Service Chat (`/service-chat`)

ServiceChat uses T6 Conversational as its base template with two structural additions:

1. **BookingCard** (fixed, `top: 56px`, below ChatHeader)
   - NOT a glass surface. Uses NeuSurface recipe: `bg-white border border-border/30 shadow-[0_2px_16px_rgba(0,0,0,0.06)]`. No `backdrop-filter`.
   - Does NOT count as a persistent glass chrome bar (not glass-e1/e2/e3).
   - MessageThread `paddingTop` is dynamically measured via `ResizeObserver` to account for both the 56px ChatHeader and the BookingCard height.

2. **ActionBar** (fixed, above Composer)
   - NOT a glass surface. Uses solid background: `bg-background border-t border-border/20`. No `backdrop-filter`. No `backdrop-blur`.
   - Counts as a secondary action zone (same status as StickyCTA in T3/T4).
   - Glass Chrome Density: ChatHeader (1 glass bar) + Composer (1 glass action zone) + ActionBar (solid, non-glass) = COMPLIANT.

Safe-area for ActionBar: `pb-[env(safe-area-inset-bottom,0px)]` applied to the ActionBar container (it sits above Composer which already handles safe-area).

Control compliance: All interactive elements in BookingCard, ActionBar, RequestForm, QuoteForm, BookingConfirmScreen, ReviewFlow, and DisputeFlow MUST use NeuControl + FormField primitives per Section 2. No raw `<button>`, `<input>`, `<textarea>`, `<select>`.

### UNMAPPED ROUTES — DO NOT TEMPLATE-MODIFY

```
UNMAPPED — Template assignment pending. MUST NOT apply or change template structure.
  /pets
  /pet/:id
  /profile
  /activity
  /notifications
  /nanny
  /nanny/:id
  /broadcast (standalone route, if exists)
```

### MINIMUM COMPLIANCE LAYER (MCL) — ALL ROUTES INCLUDING UNMAPPED  [PATCH I — NEW]

Every route in the app, whether MAPPED or UNMAPPED, MUST comply with the MCL at all times.
Unmapped status means no template is assigned. It does NOT grant exemption from the MCL.
A page violating any MCL rule is NON-COMPLIANT regardless of mapping status.

```
MCL-01 CANVAS: Canvas gradient (var(--canvas)) MUST be visible as the page background.
               body literal hex #D5DFEF MUST be present in index.html inline style.

MCL-02 TYPOGRAPHY: Urbanist MUST be loaded and applied. All text MUST use Section 12
               type scale. No system font rendering except during font-load (≤100ms).

MCL-03 CONTROLS: All interactive elements MUST use NeuControl or FormField primitives
               (Section 2 replacement map). No native browser control rendering.

MCL-04 ICONS: All icons MUST use Lucide React with strokeWidth per Section 8 table.
               MUST NOT use any other icon library.

MCL-05 SCREEN FRAME: Viewport-locked frame pattern MUST be implemented per RULE 14.
               min-height 100svh, flex column, content-region flex-1 overflow-auto.

MCL-06 FORM FIELDS: Any form on an unmapped page MUST use FormField anatomy per Section 7:
               Label → Control → MessageSlot. Single MessageSlot per field.

MCL-07 MOTION: All transitions MUST use easing tokens from Section 9.
               MUST NOT use inline cubic-bezier values. MUST NOT use transition: all.

MCL-08 GLASS: Any glass surface on an unmapped page MUST use the tier recipe from
               Section 5 (e1/e2/e3). MUST include inner highlight and correct blur.

MCL-09 SKELETONS: Any unmapped page with a list or grid of cards MUST show skeleton
               placeholders during loading (matching card footprint).

MCL-10 SAFE AREA: env(safe-area-inset-bottom) MUST be applied to all fixed bottom
               elements (CTAs, composers, nav bars) on every route.
```

**Route Discovery Gate (run before starting any new screen):**
```bash
grep -rn "path=\|path:\|Route path\|to=" src/routes/ src/app/ src/App.tsx \
  | grep -v "//\|node_modules\|\.test\."
```
MUST maintain `src/routes/ROUTE_MANIFEST.ts` — exported string array of all route paths.
Page Index MAPPED ROUTES MUST match this manifest exactly. ROUTE_MANIFEST.ts is source of truth.

---

## 5. GLASS SYSTEM RECIPE

Shadow color family for glass elevation: `rgba(0,87,255,*)` — from Behance kit. Glass elevation shadows only.
NeuControl shadow family: `rgba(163,168,190,*)` — neutral/cool-grey. Section 6 only.
Canvas: periwinkle-to-blue gradient (locked).

### Elevation Tiers

**glass-e1 — Content layer (cards, chips, plan tiles, InsetPanel, inline surfaces)**
```css
background:             rgba(255,255,255,0.60);   /* range: 0.58–0.65 */
backdrop-filter:        blur(18px);               /* range: 16–20px — MINIMUM 16px */
-webkit-backdrop-filter: blur(18px);
border:                 1px solid rgba(255,255,255,0.55);   /* alpha: 0.48–0.70 */
box-shadow:
  0 2px 10px rgba(0,87,255,0.11),
  0 1px 3px rgba(0,87,255,0.06),
  inset 0 1px 0 rgba(255,255,255,0.72);           /* inner highlight — REQUIRED */
border-radius:          20px;
```

**glass-e2 — Sheet layer (headers, composer, sticky CTA, SectionCardDivider container)**
```css
background:             rgba(255,255,255,0.72);   /* range: 0.68–0.76 */
backdrop-filter:        blur(24px);               /* range: 22–26px */
-webkit-backdrop-filter: blur(24px);
border:                 1px solid rgba(255,255,255,0.60);   /* alpha: 0.48–0.70 */
box-shadow:
  0 8px 24px rgba(0,87,255,0.13),
  0 2px 6px rgba(0,87,255,0.07),
  inset 0 1px 0 rgba(255,255,255,0.78);
border-radius:          24px;
padding:                28px;
```

**glass-e3 — Overlay layer (modals, dialogs, PaywallModal)**
```css
background:             rgba(255,255,255,0.82);   /* range: 0.78–0.86 */
backdrop-filter:        blur(32px);               /* range: 28–36px */
-webkit-backdrop-filter: blur(32px);
border:                 1px solid rgba(255,255,255,0.68);   /* alpha: 0.48–0.70 */
box-shadow:
  0 20px 48px rgba(0,87,255,0.17),
  0 0 0 1px rgba(255,255,255,0.30),
  inset 0 1px 0 rgba(255,255,255,0.82);
border-radius:          28px;
padding:                32px;
```

### Shared Rules

```
Inner highlight (inset 0 1px 0):  REQUIRED on every glass surface. Non-negotiable.
Hairline border alpha:            MINIMUM 0.48. MAXIMUM 0.70. No exceptions.
Blur minimum:                     16px (e1) | 22px (e2) | 28px (e3).
Vendor prefix:                    MUST include -webkit-backdrop-filter.
Fallback:
  @supports not (backdrop-filter: blur(1px)) {
    background:   rgba(255,255,255,0.95);
    border-color: rgba(200,205,220,0.60);
    box-shadow:   0 2px 12px rgba(0,0,0,0.10);
  }
```

### Legibility Fail-Safes

```
When glass sits over a busy canvas region:
  1. Boost background opacity by +0.10 (stay within tier range).
  2. Add local scrim pseudo-element:
     ::after { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
       background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.28)); }
MUST NOT flatten blur. MUST NOT use dark glass (dark-tinted rgba background).

Image scrim exception:
  ::after dark gradient on a direct image container is permitted.
  Maximum rgba(0,0,0,0.32). MUST NOT apply to glass surfaces.
  Applies to: NannyCard image, PetCard image, card hero images only.
```

### Glass Chrome Density Rule

```
Maximum 1 persistent glass chrome bar per screen at any time.
"Persistent glass chrome bar" = fixed/sticky glass spanning full viewport width
that remains visible while the user scrolls.

Permitted:
  PageHeader   glass-e2 (the 1 persistent chrome bar)
  StickyCTA    glass-e2 (bottom action zone — NOT counted as chrome bar)
  Composer     glass-e2 (bottom input zone — NOT counted as chrome bar)

FilterStrip: MUST NOT be a glass surface when PageHeader is glass.
  Use transparent or rgba(255,255,255,0.20) non-elevated strip.
  FilterStrip backdrop-filter is PROHIBITED when PageHeader is present.

T6 (Conversational): ChatHeader (1 bar) + Composer (1 action zone) = COMPLIANT.
T3/T4: PageHeader (1 bar) + StickyCTA (1 action zone) = COMPLIANT.
T1/T2: PageHeader (1 bar) + FilterStrip (NOT glass) = COMPLIANT.

Transient surfaces (sheets, modals, toasts, dropdowns) are exempt from this count.
```

### Non-Glass Border Containers

```
These MUST NOT use backdrop-filter:
  — UploadZone: dashed border, rgba bg, no backdrop-filter
  — CapsuleDivider capsule: pill with rgba bg, backdrop-blur-8 ONLY (not glass)

CapsuleDivider backdrop-blur-8 is a non-elevation blur. No shadow, no inner highlight.
MUST NOT be elevated to glass-e1.
```

### Canvas

```css
/* index.html — literal hex, NOT var() — MUST be present before any script tag */
<body style="background-color: #D5DFEF;">

/* global.css — loads before React */
:root {
  --canvas:       linear-gradient(160deg, #EEF1FA 0%, #D5DFEF 35%, #BCCBE6 65%, #9AACD8 100%);
  --canvas-solid: #D5DFEF;
}
html, body, #root {
  background:            var(--canvas);
  background-attachment: fixed;
  min-height:            100svh;
}
```

---

## 6. NEU CONTROL SYSTEM  [PATCH B + 1.5 — Real Neumorphism, 5 Layers]

**ONE canonical recipe. ALL interactive controls.** No control is exempt. See Section 2.

### Canonical Surface Recipe — 5 Mandatory Layers

```
Layer 1: Base fill          — soft white surface
Layer 2: Drop shadow        — neutral/cool-grey ONLY. MUST NOT be blue-tinted.
Layer 3: Outer lift         — white highlight (top-left light source)
Layer 4: Inner bevel        — top-edge catch-light (inset highlight)
Layer 5: Chamfer rim        — hairline border gradient

All 5 layers MUST be present. Any missing layer = NON-COMPLIANT.
```

```css
/* ── RESTING ── */
background:  rgba(255,255,255,0.82);                   /* Layer 1 */
border:      1px solid rgba(255,255,255,0.65);          /* Layer 5 */
box-shadow:
  5px 5px 14px rgba(163,168,190,0.28),                  /* Layer 2: neutral drop */
  -4px -4px 10px rgba(255,255,255,0.84),                /* Layer 3: outer lift */
  inset 0 1px 0 rgba(255,255,255,0.90);                 /* Layer 4: inner bevel */
transition:
  background   150ms var(--ease-out),
  box-shadow   150ms var(--ease-out),
  transform    150ms var(--ease-out),
  border-color 150ms var(--ease-out),
  opacity      150ms var(--ease-out);
/* MUST NOT use transition: all */

/* ── PRESSED — BEVEL INVERSION (mandatory, not just scale) ──
   Resting: outer drop + outer lift = convex raised surface
   Pressed: inset drop + inset lift = concave pushed-in surface
   Scale alone is NOT sufficient. Full bevel inversion is required. */
background:  rgba(255,255,255,0.72);
transform:   scale(0.97);
box-shadow:
  inset 3px 3px 9px rgba(163,168,190,0.28),             /* Layer 2 inverted */
  inset -2px -2px 6px rgba(255,255,255,0.82);           /* Layer 3 inverted */
/* Layer 4 removed in pressed state. Surface is concave — no inner highlight. */

/* ── SELECTED (toggle-on / chip-active / segmented-active) ── */
background:  rgba(33,69,207,0.08);
border:      1px solid rgba(33,69,207,0.22);            /* Blue via border tint only */
color:       var(--blue);
box-shadow:
  inset 2px 2px 6px rgba(163,168,190,0.20),
  inset -1px -1px 4px rgba(255,255,255,0.68);
/* Drop shadow MUST remain neutral even in selected state. */

/* ── DISABLED ── */
opacity:        0.38;
box-shadow:     none;
pointer-events: none;

/* ── FOCUS (keyboard navigation) ── */
/* Blue expressed HERE only — as focus ring. Not in drop shadow. */
/* Append to resting box-shadow stack: */
  0 0 0 2px #2145CF,
  0 0 0 4px rgba(33,69,207,0.18);
outline: none;

/* ── LOADING ── */
/* Label replaced with 16px spinner (same color as label). Width unchanged. */
/* cursor: not-allowed on parent. Resting visual maintained. */
```

**Shadow palette enforcement:**
```
DROP SHADOW (Layer 2) MUST use: rgba(163,168,190,*) or rgba(174,178,196,*) — cool-grey
MUST NOT use: rgba(0,30,100,*) — blue-tinted (retired)
MUST NOT use: rgba(0,0,0,*) — pure black
MUST NOT use any shadow with blue channel dominance except:
  — Focus ring: 0 0 0 2px #2145CF
  — Selected border tint: rgba(33,69,207,0.22)
```

### Variants

**Primary — Huddle Blue**
```css
background:  linear-gradient(145deg, #2A53E0 0%, #1C3ECC 100%);
border:      1px solid rgba(255,255,255,0.22);
color:       #FFFFFF;
box-shadow:
  5px 5px 14px rgba(163,168,190,0.32),
  -4px -4px 10px rgba(96,141,255,0.38),
  inset 0 1px 0 rgba(255,255,255,0.18);
/* PRESSED: */
box-shadow:
  inset 4px 4px 10px rgba(0,0,0,0.22),
  inset -3px -3px 8px rgba(255,255,255,0.10);
transform: scale(0.97);
```

**Gold — tier="gold" guard required**
```css
/* MUST NOT appear outside tier="gold" branch */
background:  linear-gradient(145deg, #D9B528 0%, #BF9B18 100%);
border:      1px solid rgba(255,255,255,0.22);
color:       #2A2400;
box-shadow:
  5px 5px 14px rgba(163,168,190,0.28),
  -4px -4px 10px rgba(255,220,70,0.48),
  inset 0 1px 0 rgba(255,255,255,0.22);
```

**Secondary (glass outline — neutral)**
```css
background:  rgba(255,255,255,0.80);
color:       var(--text-primary);
/* Full resting NeuControl recipe — no gradient */
```

**Tertiary (text-only — skip/cancel)**
```css
background:  transparent;
border:      1px solid rgba(255,255,255,0.42);
box-shadow:  none;
color:       var(--text-secondary);
/* hover: */  background: rgba(255,255,255,0.28);
/* active: */ background: rgba(255,255,255,0.42); transform: scale(0.97);
transition:  background 150ms var(--ease-out), transform 150ms var(--ease-out);
```

**Danger**
```css
background:  rgba(255,255,255,0.80);
color:       var(--color-error);
border:      1px solid rgba(232,69,69,0.22);
box-shadow:
  5px 5px 14px rgba(163,168,190,0.22),
  -4px -4px 10px rgba(255,255,255,0.84),
  inset 0 1px 0 rgba(255,255,255,0.88);
```

**PaywallCTA — standalone, SubscriptionPage + PaywallModal only**
```
src/components/paywall/PaywallCTA.tsx
MUST NOT be a NeuControl variant. MUST NOT be imported by any other file.
```
```css
height: 56px; width: 100%; border-radius: 9999px;
background: #0D0D0D; color: #FFFFFF;
font-size: 16px; font-weight: 600;
box-shadow: 0 6px 20px rgba(0,0,0,0.32); border: none;
/* PRESSED: */ transform: scale(0.98); box-shadow: 0 2px 8px rgba(0,0,0,0.22);
transition: transform 150ms var(--ease-out), box-shadow 150ms var(--ease-out);
```

### Sizing Table

```
Variant   Height  H.Pad  Radius  Font    Weight  Use case
──────────────────────────────────────────────────────────────────────
xl        48px    28px   16px    15px    600     Full-width sheet CTA
lg        44px    24px   14px    14px    600     Page-level primary CTA
md        40px    16px   12px    14px    500     Inline actions, standard
sm        32px    12px   10px    12px    500     Chips, tags, filter pills

icon-lg   44×44   —      14px    —       —       Primary icon actions
icon-md   40×40   —      12px    —       —       Toolbar (invisible +2px → 44)
icon-sm   32×32   —      10px    —       —       Inline / secondary

blackpill 56px    n/a    9999px  16px    600     SubscriptionPage + PaywallModal only
```

Icon-to-label gap: 8px always.

---

## 7. FORM FIELD SYSTEM  [PATCH B — Neutral shadows, consistent with NeuControl]

All FormField components share the base recipe. No native `<input>` rendering.

### FormField — Base Recipe

FormField uses the same neutral shadow philosophy as NeuControl. Inset shadows use neutral palette — NOT blue-tinted.

```css
/* Container */
border-radius: 14px;
border:        1px solid rgba(255,255,255,0.55);         /* chamfer rim — min alpha 0.48 */
background:    rgba(255,255,255,0.72);
box-shadow:
  inset 2px 2px 6px rgba(163,168,190,0.18),             /* neutral inset drop */
  inset -1px -1px 4px rgba(255,255,255,0.80);           /* neutral inset lift */
height:        52px;
padding:       0 16px;
font-family:   var(--font);
font-size:     15px;
color:         var(--text-primary);

/* FOCUS */
border-color:  rgba(33,69,207,0.42);                    /* Blue expressed via border only */
box-shadow:
  inset 2px 2px 6px rgba(163,168,190,0.18),             /* inset unchanged */
  inset -1px -1px 4px rgba(255,255,255,0.80),
  0 0 0 2px rgba(33,69,207,0.18);                       /* focus ring */
outline: none;

/* ERROR */
border-color:  rgba(232,69,69,0.42);
box-shadow:
  inset 2px 2px 6px rgba(232,69,69,0.08),
  0 0 0 2px rgba(232,69,69,0.14);

/* DISABLED */
opacity:       0.45;
pointer-events: none;
```

**Shadow palette rationale:** Inset shadow uses `rgba(163,168,190,*)` (same neutral family as NeuControl). Blue-tinted inset shadows (`rgba(0,30,100,*)`) are retired. Blue is expressed only via border-color on focus.

### FormField Anatomy Law

```
[Label]        13px/500 var(--text-primary); mb-6
[Control]      base recipe; height 52px (textarea: min-h-80px)
[MessageSlot]  mt-6; exactly ONE message at a time

Label rules:
  MUST NOT exceed 13px. MUST NOT use weight above 500.
  MUST NOT use a different color for required fields.

Helper text (no error):
  11px/400 var(--text-tertiary)
  MUST be hidden (display:none or removed) when error is active.
  MUST NOT be dimmed — hidden completely.

Error text (error active):
  11px/400 var(--color-error)
  MUST replace helper text — never shown simultaneously.
  MUST contain exactly ONE sentence.
  MUST NOT repeat the field label in the error message.

Spacing (immutable):
  Label → Control:    6px
  Control → Message:  6px
  Between fields:     20px (unrelated) | 12px (related/grouped)
  MUST NOT deviate for any form context.

Validation rule:
  ONE signal per field at any time.
  Hierarchy: MessageSlot error > field border color.
  MUST NOT show toast + inline error for the same field simultaneously.
  MUST NOT show helper + error simultaneously.

MessageSlot DOM:
  MUST be a single node: <MessageSlot error={error} helper={helperText} />
  MUST NOT be two conditional nodes: {error && <p/>} {helper && <p/>}
  Two conditional nodes create a render-frame race condition.
```

### Empty State Blueprint  [PATCH C — NEW]

Every screen with zero-content state MUST use EmptyStateCard anatomy. No exceptions.

```
EmptyStateCard anatomy (fixed):
  [IconPuck]     NeuControl-icon-lg (44×44); Lucide icon 24px strokeWidth 1.75
                 --text-tertiary; centered; mb-16
  [Headline]     H2; text-center; max-w-[22ch] mx-auto; mb-8
  [SupportLine]  Body 15px; --text-secondary; text-center; max-w-[28ch] mx-auto; mb-24
  [PrimaryAction] NeuControl-lg Primary; w-fit mx-auto

Rules:
  MUST NOT show more than 1 CTA in an empty state.
  MUST NOT show empty state without a headline.
  MUST NOT show pep talk, motivational copy, or filler body text.
  MUST NOT show a full-page spinner as an empty state substitute.
  MUST NOT omit the PrimaryAction unless the screen is genuinely read-only.
  Icon MUST communicate the empty state context (e.g., MessageSquare for empty chat,
    PawPrint for empty pets list) — MUST NOT use a generic placeholder.
```

### Error State Blueprint  [PATCH C — NEW]

Every page-level or screen-level error condition MUST use PageErrorState anatomy.

```
PageErrorState anatomy (fixed):
  [IconPuck]     NeuControl-icon-lg (44×44); AlertCircle 24px strokeWidth 1.75
                 --color-error; centered; mb-16
  [Headline]     H2; text-center; max-w-[22ch]; mb-8
                 Describes what failed. MUST NOT say "Something went wrong" alone.
  [SupportLine]  Body 15px; --text-secondary; text-center; max-w-[28ch]; mb-24
                 One actionable sentence. MUST NOT blame the user.
  [Action]       NeuControl-lg Secondary; "Try again" or "Go back"; w-fit mx-auto

Rules:
  MUST NOT show more than 1 action in PageErrorState.
  MUST NOT show inline error AND PageErrorState simultaneously.
  MUST NOT show PageErrorState for single-field validation errors
    (those use MessageSlot per FormField Anatomy Law).
  PageErrorState is for: network failure, server error, resource not found.
```

### FormField Variants

**FormField-text:** Standard text input. Height 52px. Applies base recipe.

**FormField-phone:**
```
Flag picker prefix (40px wide, NeuControl-sm visual) + divider 1px rgba(255,255,255,0.40) + input
inputMode="tel" pattern="[0-9]*"
```

**FormField-otp (6-digit):**
```
6 × 48×56px cells; gap-8; base recipe per cell
Selected: border-color rgba(33,69,207,0.42); focus ring 2px rgba(33,69,207,0.18)
Filled:   background rgba(33,69,207,0.06)
Error:    shake 3×80ms ±6px ease-linear; all cells border --color-error
inputMode="numeric" pattern="[0-9]*" on hidden input; cells are display-only
```

**FormField-textarea:**
```
min-height: 80px; resize: vertical (max: 200px)
line-height: 1.55; padding: 14px 16px
Same base recipe; border-radius 14px
```

**NeuDropdown:**
```
Trigger: NeuControl-md visual + label + ChevronDown 16px strokeWidth 1.75
Panel:   glass-e1; position absolute; mt-4; min-w-[trigger-width]; z:40
Options: h-44 rows, px-12, Body 15px; hover bg rgba(33,69,207,0.06)
Selected: bg rgba(33,69,207,0.08); color var(--blue); CheckCircle 16px trailing
```

**NeuCheckbox:**
```
Container: 20×20px; border-radius 6px; border 1.5px solid rgba(255,255,255,0.55)
           background rgba(255,255,255,0.72); inset shadow (base recipe)
Checked:   background var(--blue); border-color rgba(33,69,207,0.60)
           Check icon: 12px white strokeWidth 2.5
Label:     Body 15px; gap-10 from checkbox; clickable area extends to label
```

**NeuToggle:**
```
Track:  44×26px; border-radius 9999px; background rgba(255,255,255,0.60)
        ON: background var(--blue); transition: background 180ms var(--ease-std)
Thumb:  22×22px; border-radius 50%; background white
        box-shadow: 1px 1px 4px rgba(163,168,190,0.28)
        ON: translateX(18px); OFF: translateX(2px)
        transition: translateX 180ms var(--ease-std)
```

**NeuSlider:**
```
Track:  h-4; border-radius 9999px; bg rgba(255,255,255,0.50)
Fill:   bg var(--blue); border-radius 9999px
Thumb:  20×20px; border-radius 50%; bg white
        box-shadow: 2px 2px 6px rgba(163,168,190,0.28), -1px -1px 4px rgba(255,255,255,0.84)
Active: scale(1.2) 150ms var(--ease-out)
```

---

## 8. ICON CONTRACT

**One family: Lucide React. MUST NOT use any other library.**

```
MUST NOT import icons from any library other than Lucide React.
MUST NOT use SVG files except: brand logo, animated SVG progress ring in UploadZone.
MUST NOT use default strokeWidth (2.0). MUST set strokeWidth explicitly on every icon.
MUST NOT override strokeWidth per-icon without a contract amendment.
```

### Stroke Width by Size — Option A (locked, no per-icon exceptions)

```
16px   strokeWidth={1.75}   — inline, chips, badges, chevrons, NeuDropdown, row trailing
20px   strokeWidth={1.75}   — NeuControl buttons, inputs, rows, FormField icons, settings
24px   strokeWidth={1.75}   — nav tabs, PageHeader actions, ChatHeader actions
32px   strokeWidth={1.50}   — FAB, hero moments
```

**Rationale (immutable):**
```
16/20/24px at 1.75: consistent visual weight across the density range common in mobile UI.
Prevents thin/heavy inconsistency when sizes appear in proximity (rows, toolbars, cards).
32px at 1.50: large icons read heavy at 1.75; thinned for editorial lightness at FAB/hero scale.
Per-icon overrides PROHIBITED. File a contract amendment if a specific icon fails visually.
```

### Nav and Key Action Icons — Neu Icon Puck

```
Nav icons and primary header action icons MUST use the neu-icon puck:
  Container: NeuControl-icon-md (40×40 visual / 44×44 touch) for toolbar
             NeuControl-icon-lg (44×44) for primary single actions
  Icon size: 24px strokeWidth 1.75 inside puck
  MUST NOT render a 24px bare icon as a standalone tappable element.
  MUST NOT render any standalone tappable icon without a NeuControl-icon container.

Bare icon permitted when:
  — Icon accompanies a text label inside a button or row
  — Icon is 16px or 20px
  — Icon is purely decorative (no tap target)
```

### Color States

```
Default:    var(--text-tertiary)   rgba(74,73,101,0.55)
Active/On:  var(--blue)            #2145CF
Danger:     var(--color-error)     #E84545
Gold moment: var(--gold)           #CFAB21   ← tier="gold" guard required
On primary: #FFFFFF
On gold:    #2A2400
On dark bg: #FFFFFF
```

### Tap Target

```
Minimum visual: 40×40px (icon-md)
Minimum touch:  44×44px — invisible padding (p-[2px]) when visual = 40px
MUST NOT render a 24px bare icon as a tappable element with no container.
```

---

## 9. MOTION + MICROINTERACTIONS CONTRACT

**Banned easing:** Cubic-bezier parameter > 1.0. No spring, elastic, overshoot, bounce.

### Easing Tokens

```css
:root {
  --ease-out:    cubic-bezier(0.22, 1.00, 0.36, 1.00);
  --ease-std:    cubic-bezier(0.40, 0.00, 0.20, 1.00);
  --ease-in:     cubic-bezier(0.55, 0.00, 1.00, 0.45);
  --ease-linear: linear;
}
/* MUST reference tokens. MUST NOT inline cubic-bezier values. */
```

### Timing Table

```
Event                          Duration   Easing       Property
──────────────────────────────────────────────────────────────────────────
NeuControl press               150ms      ease-out     scale + shadow
NeuControl release             100ms      ease-out     return to resting
Chip / toggle select           120ms      ease-std     bg + shadow + color
Toggle switch translate        180ms      ease-std     translateX + bg
Sheet entry                    350ms      ease-out     translateY(100%→0)
Sheet exit                     250ms      ease-in      translateY(0→100%)
Modal entry (mobile)           350ms      ease-out     translateY(100%→0)
Modal entry (tablet)           300ms      ease-out     scale(0.94→1) + opacity
Modal exit                     200ms      ease-in      reverse
Backdrop in                    200ms      ease-out     opacity(0→0.40)
Backdrop out                   200ms      ease-in      opacity
Page reveal                    200ms      ease-out     opacity + translateY(8px→0)
Card stagger                   60ms       —            delay per card
Step forward — exit            180ms      ease-in      translateX(0→-20px) + opacity(0)
Step forward — enter           240ms      ease-out     translateX(20px→0) + opacity(1)
Step back — exit               180ms      ease-in      translateX(0→20px) + opacity(0)
Step back — enter              240ms      ease-out     translateX(-20px→0) + opacity(1)
Settings panel push            280ms      ease-out     translateX(100%→0) secondary panel
Settings panel pop             240ms      ease-in      reverse
Progress bar (signup)          350ms      ease-out     width
ProgressRing stroke            100ms      ease-linear  stroke-dashoffset
Upload border pulse            2200ms     ease-std     opacity 0.32→0.64, infinite
Upload complete check          280ms      ease-out     scale(0.6→1.0) + opacity
Upload error shake             3×80ms     ease-linear  translateX ±6px
AI shimmer (generating)        1400ms     ease-linear  background-position, infinite
AI response line fade          200ms      ease-out     opacity; stagger 40ms/paragraph
AI chips appear                180ms      ease-out     scale(0.82→1) + opacity; stagger 60ms
Send button appear             200ms      ease-out     scale(0→1)
Send button disappear          120ms      ease-in      scale(1→0)
Pager dot width (subscription) 200ms      ease-out     width (6px→20px)
Toast in                       200ms      ease-out     opacity + translateY(8px→0)
Toast out                      150ms      ease-in      opacity + translateY(0→8px)
FAB pulse ring                 2000ms     ease-std     opacity + scale, infinite
EmptyState icon appear         240ms      ease-out     scale(0.80→1.0) + opacity
ErrorState icon appear         200ms      ease-out     scale(0.80→1.0) + opacity
```

Step transitions: exit MUST complete before enter begins. No overlap.

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration:     0.01ms !important;
    animation-duration:      0.01ms !important;
    animation-iteration-count: 1 !important;
  }
  /* Permitted exceptions (required for comprehension):
   * — Modal/sheet entry: opacity 0→1 at ≤150ms only
   * — Toast: opacity at ≤150ms only
   * Decorative transitions MUST be fully disabled:
   * — Card stagger, chip/AI chip appear, AI response fade
   * — Upload pulse, FAB pulse ring, shimmer
   * — Settings panel push/pop (instant swap)
   * — EmptyState/ErrorState icon appear (instant) */
}
```

---

## 10. REFERENCE-LOCKED SCREEN CONTRACTS

These entries override all other layout rules for that screen. Section 10 entries may use literal values as specified (Token Policy Option 1). Values listed here are immutable unless a contract amendment is filed.

---

### AI VET — `/ai-vet`  [PATCH H — No-invention rewrite]

**Template:** T6 (Conversational) | **Ref:** cosmos.so/e/1718180492

The AI Vet screen has exactly TWO MODES. No other modes exist. No additional states may be added without a contract amendment.

---

#### MODE_A — ASSISTANT HOME

**State trigger:** No messages in conversation thread (initial load or cleared session).

**ChatHeader (glass-e2, h-56px, fixed top):**
```
[← NeuControl-icon-md]  ["Personalized AI Vet" — 13px/500 var(--text-secondary) centered]  [⋮ NeuControl-icon-md]

MUST NOT contain: avatar, persona name, "Dr." prefix, "24/7" string, availability claim,
  status indicator, or any AI personality element.
```

**HeroZone (content-region; flex-1; flex-col items-center justify-center; px-20):**
```
PetSelector (top of HeroZone, self-end mr-0, mt-16):
  NeuDropdown pill; pre-selected to user's active pet
  Format: "[emoji] [Pet Name]" — e.g. "🐶 Milo"
  Width: fit-content; max-w-[160px]
  ChevronDown 16px strokeWidth 1.75 trailing

HeroText (centered vertically):
  H2:   "Hi, [Username]"
        22px/600 var(--text-primary); text-center
  Body: "How can I help you with [Pet Name] today?"
        15px/400 var(--text-secondary); text-center; mt-8; max-w-[28ch]
        [Pet Name] updates when PetSelector changes

QuickChips (3 × NeuControl-sm):
  flex-wrap justify-center; gap-8; mt-24
  Tap → sends chip text as first message → transitions to MODE_B
  Chip content: sourced from product spec (MASTER_SPEC.md); not hardcoded here
  Appear: stagger 60ms per chip; scale(0.82→1) + opacity 180ms ease-out
```

**WarningStrip (fixed, above Composer):**
```
Background: transparent; px-20 py-8; text-center
Text: "AI responses are for informational purposes only. Consult a vet for diagnosis."
      11px/400 var(--text-tertiary); max-w-[34ch] mx-auto
MUST be visible in both modes. MUST NOT be dismissible. MUST NOT be replaced with icon.
```

**Composer (glass-e2, fixed bottom):**
```
px-16 pt-10 pb-[env(safe-area-inset-bottom,10px)]
[PaperClip NeuControl-icon-sm]  [FormField-text flex-1]  [Send NeuControl-icon-md Primary]
Send hidden when input empty; appear 200ms ease-out; disappear 120ms ease-in
```

---

#### MODE_B — CONVERSATION THREAD

**State trigger:** One or more messages in thread.

**ChatHeader:** Identical to MODE_A. No change on mode transition.

**MessageThread (content-region, standard T6):**
```
User messages: right-aligned; glass-e1 pill; max-w-[72%]; px-16 py-10; Body 15px
AI messages:   left-aligned; AI Response Card (below)
```

**AI Response Card:**
```
Container: glass-e1; border-left 3px solid #2145CF; border-radius 20px; mx-0

GENERATING:
  Header strip (sticky within card, h-32px):
    "GENERATING…" 11px/500 var(--text-tertiary)
    3-dot animation: scale(0.4→1.0) stagger 0/120/240ms, 800ms loop ease-out
    MUST remain until streaming completes
  Content zone:
    Shimmer lines: h-12 + h-8 + h-8; rounded-8; 1400ms linear infinite
    Content streams: each paragraph fades in 200ms ease-out; stagger 40ms
    MUST NOT animate character-by-character
    MUST NOT render partial sentences — full paragraphs only

POST-GENERATION:
  Header strip: height(32px→0) + opacity(1→0) 200ms ease-in → remove from DOM
  Action chips after strip exits DOM:
    "Save" | "Share" | "Ask follow-up" — NeuControl-sm
    Stagger 60ms; scale(0.82→1) + opacity 180ms ease-out
    MUST NOT appear during generation
```

**Upload (triggered by PaperClip):**
```
UploadZone compact (h-[112px]) renders inline above Composer.
5-state machine per UploadZone section below.
Dismissible via × NeuControl-icon-sm top-right.
```

**WarningStrip:** Identical to MODE_A. Always visible.

---

**NO-INVENTION RULE — AI VET:**
```
MUST NOT add:
  — Any persona name ("Dr. Huddle" or any variant)
  — Any availability claim ("24/7", "Always on", "Available now")
  — Purple orbs, non-blue color moments, multi-color hero gradients
  — Voice input, AR features, video calls, real-time audio
  — MODE_C or any state not defined above
  — Any chrome element not listed in the anatomy above

The ONLY valid states are MODE_A and MODE_B.
Any new AI Vet pattern requires a contract amendment before implementation.
```

**Reference Checklist:**
```
□ ChatHeader: ← icon-md + "Personalized AI Vet" Label + ⋮ icon-md (no persona, no "24/7")
□ MODE_A: blue-surface or canvas bg + PetSelector top-right + H2 + Body + 3 chips staggered
□ MODE_B: T6 MessageThread + AI Response Cards only
□ Response card: glass-e1, border-left 3px #2145CF, border-radius 20px
□ Header strip: h-32px sticky, "GENERATING…" 11px/500, 3-dot until done
□ Shimmer: exactly 3 lines h-12 + h-8 + h-8
□ Paragraph stream: opacity fade 200ms + 40ms stagger — NOT typewriter
□ Action chips: ONLY after header strip exits DOM
□ WarningStrip: 11px/400 var(--text-tertiary); fixed above Composer; both modes
□ Composer: PaperClip + FormField-text + Send icon-md
□ No purple orbs, no "Dr. Huddle", no "24/7"
```

---

### CAPSULE DIVIDER — inline thread/list separator  [PATCH E — renamed from SectionDivider]

**Template:** In-thread / in-list component | **Ref:** cosmos.so/e/1092080551

**Use for:** Date separators in MessageThread, unread markers, system event markers in chat lists. NOT for Discover or Chat section headers (use SectionCardDivider).

**Anatomy (immutable):**
```tsx
<div className="flex items-center gap-12 py-12 px-16">
  <div className="flex-1 h-px bg-white/28" />
  <div className={`px-12 py-[5px] rounded-full backdrop-blur-[8px]
    border border-white/50 text-[11px] font-medium tracking-[0.04em]
    ${variantStyles}`}>
    {label}
  </div>
  <div className="flex-1 h-px bg-white/28" />
</div>
```

**Variants:**
```
date:       bg rgba(255,255,255,0.38)  text rgba(66,73,101,0.60)  "Today" / "Mon 6 Jan"
unread:     bg rgba(33,69,207,0.10)   text #2145CF               "3 New"
system:     bg rgba(34,197,94,0.10)   text #22C55E               "Booking confirmed"
emergency:  bg rgba(249,115,22,0.12)  text #F97316               "Alert"
```

**Insert animation:**
```
New divider: opacity(0→1) + scaleX(0.60→1.00) 200ms ease-out
MUST NOT slide. Scale only.
```

**MUST NOT:**
```
Use border-white below /50.
Use a full-width colored band.
Use more than one divider type per section boundary.
Use inside a Discover feed or Chat list section header (use SectionCardDivider there).
```

---

### SECTION CARD DIVIDER — Discover + Chat list section header  [PATCH E — NEW]

**Template:** Section header card | **Ref:** cosmos.so/e/1092080551

**Use for:** Section headers in Discover feed and Chat list (e.g., "Nearby", "Active chats", "Requests"). NOT for MessageThread date separators.

**Anatomy:**
```tsx
<div
  className="w-full overflow-hidden"
  style={{ borderRadius: '22px' }}
  /* Full container is glass-e2 */
>
  <div
    className="flex items-center justify-between px-20"
    style={{
      height: '56px',   /* range: 52–60px */
      /* Gradient overlay on glass-e2 container: */
      background: 'linear-gradient(to right, rgba(33,69,207,0.08), rgba(255,255,255,0.06))',
      borderBottom: '1px solid rgba(255,255,255,0.28)'
    }}
  >
    <span
      className="font-medium uppercase tracking-[0.07em]"
      style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
    >
      {sectionLabel}
    </span>
    <ChevronDown size={16} strokeWidth={1.75} color="var(--text-tertiary)" />
  </div>
</div>
```

**Rules:**
```
Container:      glass-e2 (Section 5); border-radius 20–24px; overflow hidden
Header strip:   h-52–60px
                Gradient: linear-gradient(to right, rgba(33,69,207,0.08), rgba(255,255,255,0.06))
                Blue→transparent L-to-R gradient on glass-e2 base (subtle, not prominent)
                MUST NOT add a second backdrop-filter on the strip
Label:          LEFT-ALIGNED; uppercase; tracking-[0.06–0.08em]; 12–13px/500; var(--text-secondary)
ChevronDown:    16px strokeWidth 1.75; var(--text-tertiary); RIGHT side; REQUIRED
                Tap: defined by screen contract (expand/collapse or navigate)

MUST NOT:
  Center the label.
  Omit the ChevronDown.
  Use a full-bleed solid color band.
  Use inside a MessageThread (CapsuleDivider is correct there).
  Use as a button (it is a section header with optional nav, not a CTA).
```

---

### SUBSCRIPTION PAGE — `/subscription`  [PATCH G — Canonical page]

**Template:** T3 (Detail + Sticky CTA) | **Ref:** cosmos.so/e/813266309
**Status: CANONICAL.** `/subscription` is the primary subscription experience.
PaywallModal is a trigger overlay only (see below).

**NO-INVENTION RULE — SUBSCRIPTION:**
```
MUST match the reference screenshot anatomy below exactly.
MUST NOT add: testimonials, FAQ, feature comparison table, social proof, extra badges.
MUST NOT reorder the DOM nodes below.
Any deviation requires a contract amendment.
```

**PageHeader:** glass-e2, h-56px, fixed. Title: tier name + "Plan" or just tier name, h3 centered.

**HeroBlock (mt-[headerH+24px], px-20, text-center):**
```
[OrbCluster]  3 overlapping gradient orbs; filter blur(20px); centered
              blue:       80px radial #2145CF center → #1a3ab5, opacity 0.90
              periwinkle: 56px radial #9AACD8 center → #7088b8, opacity 0.70
              Gold variant only: gold 64px #CFAB21→#a88718 opacity 0.80
              (tier="gold" guard required on gold orb)
              Positions: blue center, periwinkle offset(+12px,-12px)

[H1]          text-center; max-w-[22ch] mx-auto; mt-16

[BenefitRows × 3]
              space-y-12; mt-24; max-w-[280px] mx-auto; text-left
              Each row: CheckCircle 16px strokeWidth 1.75 var(--color-success)
                        + label Body 15px var(--text-primary); gap-12

[PagerDots]   mt-20; flex gap-6 justify-center
              Active:   6px circle (NOT pill/bar), h-6, border-radius 50%, bg #2145CF
              Inactive: 6px circle, h-6, bg rgba(66,73,101,0.22)
              MUST use simple circle dots — NOT an expanding pill/bar.
              Width transition on active: 200ms var(--ease-out) (circle scale, not width)
```

**PlanTiles (mt-24, mx-20, flex gap-12):**
```
Monthly tile:   glass-e1; p-16; border-radius 20px; ring-2 ring-[#2145CF]/40 (DEFAULT SELECTED)
                Content: "Monthly" h3 + price 22px/700 + "/mo" Caption + subtext Caption

Annual tile:    glass-e1; p-16; border-radius 20px; position relative
                Content: same structure
                Badge: position absolute -top-12 right-12
                        pill bg-#0D0D0D text-#FFFFFF 10px/500 tracking-[0.03em]
                        Label: "-17%"   ← LOCKED. MUST NOT use "Save X%" or any other format.
                Annual is NOT default selected (Monthly is default).
```

**StickyCTA (glass-e2, fixed bottom, px-20 pt-12 pb-[safeArea+16]):**
```
[PaywallCTA]    src/components/paywall/PaywallCTA.tsx; mt-0; w-full
                Black pill h-56px, border-radius 9999px, bg #0D0D0D, color #FFFFFF
[RestoreLink]   mt-12; 11px/400 var(--text-tertiary); text-center
                min tap-target 44px (py-12); label: "Restore purchase"
```

**Gold variant:** tier="gold" guard on gold orb and --gold tokens. Same page structure.

---

### PAYWALL MODAL — `PaywallModal`  [Non-canonical trigger overlay]

**Template:** T7 (Overlay) | **Ref:** cosmos.so/e/813266309
**Status: NON-CANONICAL.** Triggered from locked-feature surfaces as an interruption gate.
Content and pricing MUST match `/subscription` page. Layout may differ (sheet vs page).
Design changes to subscription offering MUST be applied to `/subscription` first.

**Shell:** glass-e3, border-radius 32px 32px 0 0 (mobile) / 28px centered max-w-[440px] (tablet)
max-height 88dvh; overflow-y auto; px-20; pb-[safeArea+24px]

**DOM ORDER — LOCKED:**
```
1. [Close ×]         NeuControl-icon-lg; position absolute top-16 right-16
2. [Orb cluster]     Same spec as /subscription HeroBlock OrbCluster
3. [Headline]        H1; text-center; max-w-[22ch]; mt-16
4. [Benefit rows×3]  Same as /subscription; space-y-12; mt-24
5. [Pager dots]      mt-20; same circle-dot anatomy as /subscription (NOT pill)
6. [Plan tiles×2]    mt-24 flex gap-12; Monthly ring (default); Annual "-17%" badge
7. [PaywallCTA]      PaywallCTA.tsx; mt-24; w-full
8. [Restore link]    mt-12; Caption var(--text-tertiary); "Restore purchase"
```

"-17%" badge: LOCKED. MUST match `/subscription`. MUST NOT use any other badge format.

---

### SETTINGS — `/settings`  [PATCH F — Inset Panel]

**Template:** T5 (Inset Panel) | **Ref:** cosmos.so/e/1336723141

**PageHeader:** glass-e2, h-56px, fixed. Title: "Settings" h3 centered.

**PageCanvas:** global canvas background; content-region; px-16; pt-[headerH+16px]; pb-[safeArea+20px]; space-y-8.

**ContentFrame (max-w-[480px] mx-auto; flex flex-col gap-8):**

```
UserHeader (NOT inside InsetPanel):
  Avatar 56px rounded-full + Name h3 + tier badge chip (NeuControl-sm)
  px-4 py-16; required for authenticated state; skeleton if loading

TierBlock (NOT inside InsetPanel; per-tier):
  Free/Plus users: Plus block (blue gradient) + Gold block (gold gradient)
  Gold users:      Gold block only
  h-64; border-radius 14px; mx-0
  Plus block:  background linear-gradient(135deg, #2A53E0, #1C3ECC)
               box-shadow: 0 4px 16px rgba(33,69,207,0.28)
  Gold block:  background linear-gradient(135deg, #D9B528, #BF9B18)
               box-shadow: 0 4px 16px rgba(207,171,33,0.30)
               tier="gold" guard required

--- GroupLabel "ACCOUNT" --- (12px/500 UPPERCASE tracking-[0.06em] var(--text-tertiary); px-4 pt-8 pb-4)

[InsetPanel: Account]
  glass-e1; border-radius 16px; overflow hidden
  Row: Edit Profile    → ChevronRight; push nav
  Row: Notifications   → ChevronRight; push nav
  Row: Privacy         → ChevronRight; push nav

--- GroupLabel "PREFERENCES" ---

[InsetPanel: Preferences]
  Row: Language   → trailing Caption value; push nav
  Row: Units      → trailing Caption value; push nav
  Row: Theme      → trailing NeuToggle; inline fire

--- GroupLabel "SUPPORT" ---

[InsetPanel: Support]
  Row: Help Center   → ChevronRight; push nav
  Row: About         → ChevronRight; push nav
  Row: Rate the App  → Star 20px strokeWidth 1.75 trailing; external

[InsetPanel: Danger — no GroupLabel]
  Row: Log Out         → var(--color-error); no trailing; T7 confirmation
  RowDivider: h-px bg-white/20 mx-20
  Row: Delete Account  → var(--color-error); no trailing; T7 confirmation

All RowDividers: h-px bg-white/20 mx-20; omit after last row in each panel.
All rows: h-56px; px-20; Lucide icon 20px strokeWidth 1.75; label Body flex-1; trailing.
```

**MUST NOT:**
```
Open a bottom sheet from any settings row.
Stack sheets.
Use T5-Sheet/Drawer pattern (that pattern is retired for Settings).
Show more than 5 InsetPanels.
```

---

### SIGNUP STEPS

**Template:** T4 (Form/Stepper) | **Ref:** cosmos.so/e/2047032905

**Progress bar:**
```css
position: fixed; top: 0; inset-x: 0; height: 3px; z-index: var(--z-progress);
background: rgba(255,255,255,0.28);
/* Fill: */
background: linear-gradient(90deg, #2145CF, #3A5FE8);
width: calc(var(--step) / var(--total-steps) * 100%);
transition: width 350ms var(--ease-out);
```

**StepNav (h-56px, fixed below ProgressBar):**
```
[← NeuControl-icon-md]  [Step N of M — 11px/400 var(--text-tertiary) centered]
[Skip — NeuControl-tertiary — optional steps only]
```

**FormBody:** max-w-[400px] mx-auto; px-20; pt-40; space-y-20

**Per-step rule:**
```
Exactly 1×H1. Exactly 1×Body supporting line.
FormField components only beneath. MUST NOT include prose between fields.
```

**CTA bar:** glass-e2; fixed bottom; px-20 pt-12 pb-[safeArea+16]; NeuControl-lg Primary w-full

**Step transitions:**
```
Forward exit:  180ms ease-in  translateX(0→-20px) + opacity(0)
Forward enter: 240ms ease-out translateX(20px→0) + opacity(1)
Back exit:     180ms ease-in  translateX(0→20px) + opacity(0)
Back enter:    240ms ease-out translateX(-20px→0) + opacity(1)
Exit MUST complete before enter begins.
```

---

### ANIMATED UPLOAD + SAVE BUTTONS

**Template:** In-component | **Ref:** cosmos.so/e/368946619

**Upload Zone — 5-state machine (NOT a glass surface):**
```
Container: w-full h-[160px] (compact: h-[112px]); border-radius 20px
           MUST NOT use backdrop-filter

IDLE:       background rgba(255,255,255,0.48)
            border: 1.5px dashed rgba(33,69,207,0.32)
            animation: border-opacity 0.32→0.64, 2200ms ease-std infinite
            content: UploadCloud 24px strokeWidth 1.75 var(--blue) + "Upload photo" Caption

HOVER/DRAG: background rgba(33,69,207,0.06); border 2px solid #2145CF
            transform scale(1.02) 200ms ease-out; "Drop here" 14px/500 #2145CF

UPLOADING:  background rgba(255,255,255,0.56); border 2px solid rgba(33,69,207,0.40)
            SVG ring 40px (r=18, circumference≈113, stroke #2145CF, strokeWidth 2.5)
            + percentage 11px var(--text-tertiary)
            dashoffset: 113-(progress/100)*113; 100ms ease-linear
            MUST show ring minimum 400ms

COMPLETE:   background rgba(34,197,94,0.06); border 1.5px solid #22C55E
            CheckCircle 24px strokeWidth 1.75 var(--color-success)
            scale(0.6→1.0) + opacity(0→1) 280ms ease-out; "Uploaded" Caption

ERROR:      background rgba(232,69,69,0.06); border 1.5px solid #E84545
            XCircle 24px strokeWidth 1.75 var(--color-error)
            shake 3×80ms ±6px ease-linear; "Failed — tap to retry" Caption
```

**State machine:**
```
Valid: IDLE→HOVER, IDLE→UPLOADING, UPLOADING→COMPLETE, UPLOADING→ERROR, ERROR→IDLE
MUST NOT skip states. MUST NOT go IDLE→COMPLETE directly.
```

**Save Button — 3-state:**
```
IDLE:   NeuControl-lg Secondary; label "Save"
SAVING: Same width; 16px spinner replaces label; resting visual (no layout shift)
SAVED:  CheckCircle 16px + "Saved"; bg rgba(34,197,94,0.08); hold 1500ms → IDLE
```

---

### BROADCAST MODAL + NANNY CARD

**Template:** T7 (Overlay) | **Ref:** cosmos.so/e/403392397

**Emergency FAB:**
```css
width: 56px; height: 56px; border-radius: 50%;
position: fixed; right: 20px; bottom: calc(var(--nav-height) + 20px);
z-index: var(--z-fab);
background: linear-gradient(135deg, #F97316 0%, #EA5F0B 100%);
box-shadow: 0 6px 20px rgba(249,115,22,0.42), 0 2px 6px rgba(249,115,22,0.26);
::before {
  content: ''; position: absolute; inset: -6px; border-radius: 50%;
  border: 1.5px solid rgba(249,115,22,0.42);
  animation: pulse-ring 2000ms var(--ease-std) infinite;
}
```

FAB and BroadcastModal are the ONLY contexts for `#F97316`. No exceptions.

**Modal anatomy (T7 glass-e2 shell):**
```
[Header]         Megaphone 20px strokeWidth 1.75 var(--color-emergency)
                 + "Emergency Broadcast" h3 var(--color-emergency)
                 [×] NeuControl-icon-md position absolute top-20 right-20
[ConstraintBar]  sticky below header; px-20 py-12; border-b rgba(255,255,255,0.25)
                 4 chips NeuControl-sm: [quota][active][duration][radius]
                 bg rgba(249,115,22,0.08); text var(--color-emergency)
[Form px-20 space-y-20]
  Pet chips:     horizontal scroll; glass-e1 60px pill + Avatar 30px each
  Type toggle:   "Lost" | "Found" | "Stray" — NeuSegmented
  Description:   FormField-textarea min-h-[80px]
  Radius:        "0.5km" | "1km" | "2km" | "5km" — NeuSegmented-sm
  Photo:         UploadZone compact h-[112px]
[StickyCTA]      glass-e2 sticky bottom; NeuControl-xl w-full
                 bg linear-gradient(135deg,#F97316,#EA5F0B); color #FFFFFF
                 label: "Send Alert to [N] neighbors"
                 sub: 11px/400 var(--text-tertiary) "Reaches [N] pet owners within [radius]"
```

**Nanny Card (glass-e1, overflow-hidden):**
```
Image:  aspect-[4/3]; border-radius 20px 20px 0 0; object-fit cover
        ::after { bottom gradient h-[33%] transparent→rgba(0,0,0,0.24) }
Body:   px-16 py-16 space-y-12
Row 1:  Avatar 40px + Name h3 + distance badge + verified chip
Row 2:  Service chips (horizontal scroll, NeuControl-sm)
Row 3:  Rate h3 + "/hr" Caption var(--text-tertiary) + availability dot 8px
Row 4:  [Message: NeuControl-md Secondary flex-1] [Book: NeuControl-md Primary flex-1] gap-12
```

---

## 11. EDITORIAL LAYOUT ENFORCEMENT

All rules below are binding contract requirements. They are not advisory.

### Core Rules

```
RULE E1 — TEMPLATE CONFORMANCE
  Every mapped page MUST conform to exactly ONE template from Section 3.
  Compliance verified by block order, not visual appearance.

RULE E2 — BLOCK ORDER IS LAW
  Block added, removed, or reordered = contract failure.

RULE E3 — PAGE INDEX MANDATORY
  Every page MUST have a Page Index entry. UNMAPPED pages MUST comply
  with the Minimum Compliance Layer (Section 4 MCL).

RULE E4 — TOKEN-ONLY (outside Section 10)
  Style changes outside reference-locked Section 10 blocks MUST use
  Section 12 tokens only. Inline or page-scoped overrides = NON-COMPLIANT.

RULE E5 — ABOVE-THE-FOLD
  Max 2 primary content blocks visible before first scroll at 390px width.
  Headline + supporting line = 1 block.

RULE E6 — CARD GROUPING
  4+ cards: MUST organize into 2–4 groups, each separated by CapsuleDivider
  or SectionCardDivider. Fewer than 4: single ungrouped list permitted.

RULE E7 — TYPOGRAPHY HIERARCHY
  Exactly ONE <h1> in the rendered DOM at any moment. Hidden H1 counts.
  PageHeader MUST NOT contain <h1> or <h2>. Use <h3>, Caption, Label.
  H1 lives in content zone only: FormBody, HeroBlock, AuthCard, ChatHeader.
  At most ONE supporting Body line in hero/header zone per screen.
  Body and Label: max-w-[36ch]. Headlines: max-w-[22ch].

RULE E8 — SCREEN COMPLIANCE CHECKLIST
  A screen is COMPLIANT if and only if ALL of these pass:
   1. Maps to exactly one template in Page Index (Section 4).
   2. Block order matches template exactly.
   3. All controls use NeuControl / FormField (Section 2 map).
   4. Full-tree grep for <input|<select|<textarea returns zero.
   5. All icons: Lucide React, locked strokeWidth per Section 8.
   6. Typography: Urbanist at Section 12 scale — no inline overrides.
   7. No above-fold or card grouping violations (E5, E6).
   8. Canvas visible before JS hydration (RULE 11).
   9. Skeleton state present for T1/T2/T3 (RULE 12).
  10. Max 1 persistent glass chrome bar (Section 5 density rule).
  11. FormField anatomy: single MessageSlot, correct spacing (Section 7).
  12. Auth screens use T8 with glass AuthCard (Section 3).
  13. Viewport-locked frame implemented (RULE 14).
  14. NeuControl: 5-layer recipe, neutral drop shadow (Section 6).
  15. FormField: neutral inset shadows, no blue-tinted inset (Section 7).
  16. MCL satisfied (Section 4 MCL).
  Any single failure = NON-COMPLIANT. MUST NOT ship.
```

### Apple Editorial Laws  [PATCH C — NEW]

```
RULE EL1 — HERO DENSITY LAW
  Per hero zone (HeroBlock in T3, AuthCard header in T8, MODE_A HeroZone in AI Vet):
    — Max 1 decorative element (orb cluster counts as 1; image counts as 1).
    — Max 2 action elements above the fold (e.g. CTA + secondary link).
    — Hero copy: exactly 1 headline + 1 support line. No additional prose.
    — No non-functional badges in hero (e.g. no "New", "Beta", "Popular" labels
      in the hero zone unless they gate a real interaction).
    — No decorative dividers, illustration clusters, or icon grids in the hero zone.
  Violation: any hero with more than 1 decorative element, more than 1 support line,
    or more than 2 actionable elements above the fold = NON-COMPLIANT.

RULE EL2 — HEADLINE + PURPOSE LAW
  Every screen MUST have 2–4 sections. No more. No fewer (except single-form screens).
  Every section MUST have:
    — A purpose label (either a GroupLabel above an InsetPanel, a SectionCardDivider
      header, or an h3 section title — exactly one of these).
    — A dominant component pattern (all cards, all rows, all form fields — no mixing).
  MUST NOT mix component patterns within a section ("card salad"):
    — A section containing both a card and a row list is NON-COMPLIANT.
    — A section containing both a form field and an informational card is NON-COMPLIANT.
    — Each section must use one pattern: cards OR rows OR form fields OR media.

RULE EL3 — EMPTY STATE BLUEPRINT
  Every screen capable of a zero-content state MUST implement EmptyStateCard
  per the anatomy defined in Section 7 (Empty State Blueprint).
  EmptyStateCard anatomy: IconPuck + Headline + SupportLine + PrimaryAction.
  MUST NOT substitute a centered spinner, placeholder text, or bare message.
  MUST NOT show more than 1 CTA in empty state.
  MUST NOT omit PrimaryAction unless the screen is read-only by design.

RULE EL4 — ERROR STATE BLUEPRINT
  Every page-level or full-screen error MUST implement PageErrorState per the
  anatomy defined in Section 7 (Error State Blueprint).
  PageErrorState anatomy: AlertCircle IconPuck + Headline + SupportLine + Action.
  MUST NOT use alert() or system dialogs for page errors.
  MUST NOT show PageErrorState for single-field validation (that uses MessageSlot).
  MUST NOT mix PageErrorState with inline MessageSlot errors simultaneously.
  PageErrorState is for: network failure, server error, 404, resource unavailable.
```

### Editorial Hardening Laws

```
RULE EH1 — NO FULL-BLEED DARK BACKGROUNDS
  Canvas gradient is the page background. MUST NOT apply a full-bleed dark or
  solid-colored background overriding the canvas on any page or section.
  Permitted: emergency orange system (BroadcastModal only).
  Permitted: image scrim max rgba(0,0,0,0.32) on direct image containers.

RULE EH2 — NO MODAL-ON-MODAL STACKING
  T7 overlays MUST NOT stack. A second T7 MUST NOT open while a T7 is visible.
  Exception: Confirmation T7 dialog (2 actions, no scroll) may appear over a T7
    overlay for destructive actions only (Logout, Delete). Max 2-level stack for
    confirmation only. No deeper stacking.
  T5 drawers MUST NOT appear over a T7 overlay under any condition.

RULE EH3 — APPROVED HORIZONTAL SCROLL INSTANCES ONLY
  Nested horizontal scroll inside vertical scroll is NON-COMPLIANT except:
    — FilterStrip (T1, T2): chip row below header
    — Pet chips row in BroadcastModal
    — Service chips in NannyCard
  Any other horizontal scroll requires a contract amendment.

RULE EH4 — NO SYSTEM DEFAULT UI
  MUST NOT ship: alert(), confirm(), native <select>, native date pickers,
    native file choosers (use UploadZone), browser tooltips, native checkbox/radio.
  All replacements defined in Section 2 (Control Replacement Map).
  Native element use "temporarily" = contract failure.

RULE EH5 — EMPTY STATES REQUIRE ONE PRIMARY ACTION
  Every empty state MUST have one headline, one primary action.
  MUST NOT show pep talk, filler copy, or spinner as empty state substitute.
  MUST NOT show more than 1 primary action. Covered by EL3.

RULE EH6 — SKELETON STATES FOR CARD LISTS
  T1/T2/T3 with card layouts MUST show skeleton cards during loading.
  Skeleton MUST match real card footprint: same height, same border-radius.
  Centered spinner as sole loading indicator for card list = NON-COMPLIANT.

RULE EH7 — MAX 2 DISTINCT BRAND COLORS PER SCREEN VIEW
  MUST NOT show more than 2 distinct brand colors simultaneously.
  Emergency (#F97316): BroadcastModal and FAB ONLY.
  Gold (#CFAB21): tier="gold" contexts only.
  Blue + Gold = 2 colors in Gold flows. Permitted.
  Blue + Green (--color-success) for confirmation moments = permitted.

RULE EH8 — HERO PROSE MAX 2 LINES
  Body copy in hero zones MUST NOT wrap beyond 2 lines at 390px viewport.
  Enforce with max-w-[28ch] to max-w-[32ch]. Hard limit.
  If copy exceeds 2 lines: shorten the copy. MUST NOT increase max-w.

RULE EH9 — 44×44 TOUCH TARGET ON ALL TAPPABLE ELEMENTS
  Every tap/press/click element MUST have a minimum 44×44px touch target.
  Visual size may be smaller; invisible padding compensates.
  Verified in RULE E8 checklist before any screen ships.

RULE EH10 — SUBSCRIPTION BADGE + PRICING COPY LOCKED
  Annual badge: MUST display "-17%". No other format.
  Monthly: DEFAULT SELECTED state on load (both page and modal).
  Price strings: MUST NOT be hardcoded in UI components. Use server values.
  Any format change requires a contract amendment.
```

---

## 12. TOKEN REFERENCE

### Brand Colors

```css
:root {
  /* Primary — Plus tier + main actions */
  --blue:               #2145CF;
  --blue-light:         #3A5FE8;
  --blue-surface:       rgba(33,69,207,0.08);
  --blue-glow:          rgba(33,69,207,0.26);

  /* Gold — tier="gold" contexts only */
  --gold:               #CFAB21;
  --gold-light:         #E0BC2A;
  --gold-surface:       rgba(207,171,33,0.10);

  /* Text — periwinkle family */
  --text-primary:       #424965;
  --text-secondary:     rgba(66,73,101,0.72);   /* NOT #4a4a4a */
  --text-tertiary:      rgba(74,73,101,0.55);
  --text-white:         #FFFFFF;
  --text-on-gold:       #2A2400;

  /* Semantic */
  --color-error:        #E84545;
  --color-success:      #22C55E;
  --color-emergency:    #F97316;   /* BroadcastModal + FAB ONLY */

  /* Service Chat status colours */
  --service-pending:     #888888;
  --service-pending-bg:  rgba(136,136,136,0.10);
  --service-booked:      #16a34a;
  --service-booked-bg:   rgba(22,163,74,0.10);
  --service-progress:    #2563eb;
  --service-progress-bg: rgba(37,99,235,0.10);
  --service-complete:    #16a34a;
  --service-complete-bg: rgba(22,163,74,0.10);
  --service-disputed:    #ef6450;
  --service-disputed-bg: rgba(239,100,80,0.10);

  /* Canvas */
  --canvas:             linear-gradient(160deg, #EEF1FA 0%, #D5DFEF 35%, #BCCBE6 65%, #9AACD8 100%);
  --canvas-solid:       #D5DFEF;

  /* Neu control shadows — neutral palette (v6+) */
  --neu-shadow-drop:    rgba(163,168,190,0.28);
  --neu-shadow-lift:    rgba(255,255,255,0.84);
  --neu-shadow-bevel:   rgba(255,255,255,0.90);

  /* Spacing */
  --sp-4:   4px;
  --sp-8:   8px;
  --sp-12:  12px;
  --sp-16:  16px;
  --sp-20:  20px;
  --sp-24:  24px;
  --sp-28:  28px;
  --sp-32:  32px;
  --sp-40:  40px;

  /* Z-index */
  --z-content:   0;
  --z-fab:       10;
  --z-nav:       20;
  --z-sheet:     30;
  --z-backdrop:  39;
  --z-modal:     40;
  --z-toast:     50;
  --z-progress:  60;
}
```

### Typography Scale

```css
/* MUST be first link in <head>, before any stylesheet */
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap');

:root {
  --font: 'Urbanist', system-ui, sans-serif;
  /* system-ui fallback: acceptable only during font-load (≤100ms) */
}
```

```
Role     Size   Weight  Line-h   Tracking   Max-width   Token
──────────────────────────────────────────────────────────────────────
Display  32px   700     1.05     -0.03em    22ch        --type-display
H1       22px   600     1.15     -0.02em    22ch        --type-h1
H2       18px   600     1.20     -0.01em    —           --type-h2
H3       16px   600     1.25      0.00em    —           --type-h3
Body     15px   400     1.55      0.00em    36ch        --type-body
Label    13px   500     1.40      0.01em    36ch        --type-label
Caption  11px   400     1.45      0.02em    36ch        --type-caption
```

Allowed weights: 400, 500, 600, 700 only.
Allowed sizes: the 7 above only.
MUST NOT add font-size, font-weight, or letter-spacing outside this table.

### Typography Hierarchy Law

```
Every screen MUST satisfy ALL simultaneously:
  H1:      Exactly 1 in DOM at any moment (hidden elements count).
  H2:      Permitted in card bodies and section content.
           MUST NOT appear in PageHeader or ChatHeader.
  H3:      The header text role. PageHeader, ChatHeader, card titles.
  Body:    Hero zone: exactly 1 supporting line. Card body: unrestricted.
  Label:   UI labels, form labels — 36ch max.
  Caption: Sub-labels, timestamps — 36ch max.

Violations:
  MUST NOT use 17px, 14px, 12px, 10px or any size not in the 7-value table.
  MUST NOT use weight 300, 800, 900 or any value not in the 4-value list.
  MUST NOT mix typefaces intentionally.
  MUST NOT use letter-spacing values outside the table in page files.
```

### Spacing Grid

Base 4px. All spacing MUST be a multiple of 4.
```
4px    micro gaps, icon cluster spacing
8px    chip inner padding, dense rows, icon-to-label gap
12px   card inner gap, row icon-to-text
16px   section padding, card padding, screen horizontal
20px   form fields, drawer padding
24px   major card padding
28px   glass-e2 default padding
32px   page section gap, glass-e3 default padding
40px   form body top padding
56px   header height standard
```

---

## 13. BRAND TONE (MICROCOPY)

```
1.  Calm, specific, functional. No hype. Exclamation marks only on genuine
    celebrations (booking confirmed, pet found).

2.  One headline per screen. One supporting line. They MUST NOT compete.

3.  Button labels are verbs, 1–2 words: "Book", "Send", "Save", "Continue", "Skip".
    MUST NOT use: "Get started", "Learn more", "Discover", "Explore now".

4.  Tier names: Free | Plus | Gold.
    MUST NOT use: "Premium", "Pro", "Basic", "Standard", "Upgrade".

5.  Error messages describe what happened, not what the user did wrong.
    "Couldn't connect" — not "You're offline".
    "Upload failed" — not "Something went wrong".

6.  Empty states: one headline, one action. No pep talk.

7.  Loading states name the thing: "Fetching your pets…" — not "Loading…".

8.  Gold tier copy may be warm and aspirational. All other tiers: direct.

9.  Confirmation dialogs state consequence:
    "This will remove [Pet Name] from your account." → "Remove" | "Cancel".

10. MUST NOT use "Premium" in any user-facing string.

11. AI Vet copy MUST NOT imply medical authority:
    MUST NOT: "Dr. Huddle says…", "Diagnosis:", "Medically reviewed".
    MUST: "Based on what you've described…", "Consider checking with your vet."

12. Empty state headlines name the empty thing:
    "No pets yet" — not "It's quiet here". "No chats yet" — not "Nothing to see".
```

---

*UI_CONTRACT_HUDDLE_GLASS_NEU v6.1 FINAL — huddle — 2026-02-25*
*Patches applied:*
*  A — Token Policy resolved: Option 1 (Section 10 blocks may hardcode; all else tokens)*
*  B — FormField neutral shadows; Control Replacement Map states added*
*  C — Apple Editorial Laws EL1–EL4 (Hero Density, Headline+Purpose, Empty/Error Blueprints)*
*  D — RULE 11 First-Frame Auth Platform Law strengthened; RULE 14 Viewport-Lock*
*  E — CapsuleDivider (renamed) + SectionCardDivider (new, blue gradient header)*
*  F — Settings confirmed Inset Panel; T5-Sheet retired*
*  G — /subscription canonical page; PaywallModal non-canonical; pager dots = circles*
*  H — AI Vet two-mode rewrite; no-invention rule hardened*
*  I — Minimum Compliance Layer MCL-01–MCL-10 for all unmapped routes*
*Supersedes: v1–v6.0. v6.0 is retired.*
*Glass: behance.net/gallery/145926467 | Neu: behance.net/gallery/97897977 + /199099915*
*Screens: cosmos.so/e/1718180492 | /1092080551 | /813266309 | /1336723141 | /2047032905 | /368946619 | /403392397*
