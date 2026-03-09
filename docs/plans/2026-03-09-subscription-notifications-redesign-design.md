# Design: Subscription Redesign + Notifications Drawer
**Date:** 2026-03-09
**Status:** APPROVED — ready for implementation
**Authority:** UI_CONTRACT.md v6.1 + MASTER_SPEC.md v2.0

---

## Scope

Seven changes in one implementation sprint:

1. Notifications → left-side scrollable drawer (replace full-page route)
2. Premium page → three-tab segmented redesign (Plus / Gold / Add-ons)
3. Stripe checkout wired to exact Price IDs + lookup keys
4. Cart — sequential checkout for plan + add-on
5. Feature content per MASTER_SPEC §2.6 (no AI Vet perks)
6. Apple UIUX Director layout with semantic icons
7. CTA → ShoppingCart icon; remove "Restore purchase"

---

## 1. Notifications Drawer

### Change
- Bell icon in `GlobalHeader` opens `Sheet side="left"` instead of `navigate("/notifications")`
- `/notifications` route becomes `<Navigate to="/" />` (preserves DB deep-link compatibility)
- All notification content moves inline into `GlobalHeader`

### Sheet spec
```
side="left"
width: w-[320px]
inner layout: flex flex-col h-full
  header row: "Notifications" h3 + X close button (SheetClose)
  scrollable body: flex-1 overflow-y-auto -webkit-overflow-scrolling: touch
  content: Today / Earlier groups + skeleton rows + empty state
```

### Behaviour preserved
- Real-time Supabase channel subscription for unread count
- Mark-all-read on drawer open
- Deep-link navigation on row tap (allowedHref guard unchanged)
- Skeleton rows (4 × h-[72px]) during loading
- EmptyStateCard when rows.length === 0

---

## 2. GlobalHeader — closeButton Prop

New optional prop: `closeButton?: () => void`

- When passed → right side renders `NeuControl size="icon-md" variant="tertiary"` with `X size={20} strokeWidth={1.75}` instead of the Settings Sheet trigger
- When NOT passed → existing Settings gear behaviour unchanged (all other pages unaffected)
- `Premium.tsx` passes: `closeButton={() => navigate(-1)}`

---

## 3. Premium Page — Three-Tab Redesign

### Route
`/premium` — protected route, uses `GlobalHeader` with `closeButton` prop

### Template
Closest to T3 (Detail + Sticky CTA) but with tabs instead of a single plan. No FilterStrip.

### Shell
```
GlobalHeader (closeButton)
  ↓
Scrollable body (flex-1 overflow-y-auto)
  pb-[calc(90px + env(safe-area-inset-bottom))]
  px-5
  mt-[calc(56px + 24px)]
```

### Hero Block
```
H1:   "Every Pet Deserves More."
      font: 28px / 700 / var(--text-primary) / max 22ch
Body: "Connect wider. Care deeper. Make pet lives better."
      font: 15px / 400 / var(--text-secondary) / max 36ch / mt-2
```

### Plan Segmented Control
Component: `NeuSegmented` — 3 options: `plus | gold | addons`

**"Recommended" badge** — floats above Gold option as absolute-positioned pill:
- bg: `#E0F2B6` (pale lime green)
- text: `#2145CF` (brand blue)
- content: "Recommended"
- font: 10px / 500

**Selected/Active tab state** (ALL 3 tabs when active):
```css
background:   #FF4D4D;    /* coral */
color:        #FFFFFF;    /* white */
border:       2px solid #2145CF;  /* brand blue */
```

**Resting tab state:** standard NeuControl-sm resting recipe

Default selected tab on mount: `gold` (Recommended)

---

### TAB: Huddle+

#### Billing Toggle
`NeuSegmented` or two pill buttons: `Monthly | Annual`

Annual badge pill:
- bg: `#E0F2B6`
- text: `#2145CF`
- content: "-17%"
- position: absolute, above Annual option

#### Pricing display
```
Monthly:  $5.99/mo
Annual:   $4.99/mo  ·  "Billed $59.99/yr"
```
(from MASTER_SPEC §2.5 — US$ values)

#### Feature rows (left icon + label + sublabel)
No AI Vet perks.

| Lucide Icon (strokeWidth 1.75) | Label | Sub-label |
|---|---|---|
| `Users` (20px) | ×2 Discovery | More connections, less noise |
| `Star` (20px) | 4 Stars / month | Trigger conversations directly |
| `Radio` (20px) | Broadcasts · 25km · 24h | Alert your neighbourhood |
| `SlidersHorizontal` (20px) | Advanced Filters | Find your kind of people |
| `Heart` (20px) | Link Family | Connect all your pet accounts |

Row anatomy: `flex items-start gap-3 py-3`
- Icon: 20px, `var(--primary)` (#2145CF), mt-0.5, flex-shrink-0
- Label: 14px / 600 / `var(--text-primary)`
- Sub-label: 12px / 400 / `var(--text-secondary)` mt-0.5

#### Plus CTA
`PaywallCTA` (black pill, 56px, 100% width — Section 6 permitted on subscription page):
```
ShoppingCart size={18} strokeWidth={1.75}  +  "Get Huddle+"
```

---

### TAB: Gold

Same billing toggle + annual badge (same colours).

Prices:
```
Monthly:  $11.99/mo
Annual:   $9.16/mo  ·  "Billed $109.99/yr"
```

#### Feature rows
No AI Vet perks.

| Lucide Icon (strokeWidth 1.75) | Label | Sub-label |
|---|---|---|
| `Globe` (20px) | Wide Open Discovery | Keep discovering |
| `TrendingUp` (20px) | 3× Visibility priority | Become a top profile |
| `Star` (20px) | 10 Stars / month | The most direct connections |
| `Radio` (20px) | Broadcasts · 50km · 48h | Maximum reach |
| `SlidersHorizontal` (20px) | All Filters Access | Including Active Now + Same Energy |
| `Video` (20px) | Video upload | Gold-exclusive |
| `Users2` (20px) | Link Family | Connect all your pet accounts |

Icon colour on Gold tab: `#CFAB21` (gold tone — guarded inside tier="gold" branch per RULE 8)

#### Gold CTA
`PaywallCTA` — gold gradient variant (Section 6 Gold recipe):
```
ShoppingCart size={18} strokeWidth={1.75}  +  "Get Gold"
```

---

### TAB: Add-ons

#### Header copy (inside tab content, not a page header)
```
Label:    "Separate purchase"   — 11px / 500 / uppercase / tracking-[0.06em] / #2145CF
Sub-copy: "Add power-ups to any plan, billed once."  — 13px / 400 / var(--text-secondary)
```

#### Add-on rows — glass-e1 InsetPanel
Three rows. Each: `flex items-center gap-3 px-4 py-4`

| Lucide Icon | Title | Subtitle | Price |
|---|---|---|---|
| `Megaphone` (20px) | Super Broadcast | 72h · 150km · slot bypass | $4.99 |
| `Zap` (20px) | Discovery Boost | 3× ranking weight · 24h | $2.99 |
| `Users2` (20px) | Share Perks | Mirror tier to 2 members | $4.99/mo |

Row anatomy:
```
[Icon left] [flex-col: title (13px/600) + subtitle (12px/400) + price (13px/600 mt-1)] [NeuControl-sm "Add"/"Remove" right]
```
`NeuControl-sm selected=true` shows "Remove", `variant="primary"`.
`NeuControl-sm selected=false` shows "Add", `variant="tertiary"`.

#### Add-on CTA
`NeuControl size="lg" variant="primary" fullWidth`:
```
ShoppingBag size={18} strokeWidth={1.75}  +  "Purchase Add-ons · $X.XX"
```
Disabled (opacity 0.38, pointer-events none) when no add-ons selected.

#### Footer note
```
11px / 400 / var(--text-tertiary) / text-center / mt-4
"Add-ons are purchased separately from your subscription."
```

---

## 4. Stripe Checkout Wiring

### Config files to update

**`.env.local`** — replace old PREMIUM keys:
```
STRIPE_PRICE_PLUS_MONTHLY=price_1T926a5QcAjQDse0QEYva3ZH
STRIPE_PRICE_PLUS_ANNUAL=price_1T92355QcAjQDse0BAnwV7PU
STRIPE_PRICE_GOLD_MONTHLY=price_1T92Cp5QcAjQDse0W4wT20OX
STRIPE_PRICE_GOLD_ANNUAL=price_1T92Cp5QcAjQDse0jvWohWoJ
```
Remove: `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_ANNUAL`

**`supabase/functions/create-checkout-session/.env`** — same rename + same new Price IDs

**`quotaConfig.ts`** — NO CHANGES (already has correct priceId + lookupKey for all 4 plans)

### Edge function key mapping (already in index.ts, no code change needed)
```
plus_monthly  → STRIPE_PRICE_PLUS_MONTHLY
plus_annual   → STRIPE_PRICE_PLUS_ANNUAL
gold_monthly  → STRIPE_PRICE_GOLD_MONTHLY
gold_annual   → STRIPE_PRICE_GOLD_ANNUAL
```

---

## 5. Sequential Checkout Flow

### Plan-only checkout (no add-ons selected)
1. User taps Plan CTA → `startStripeCheckout({ mode: "subscription", type, lookupKey, priceId })`
2. Redirect to Stripe → on success → redirect to `/premium`

### Plan + Add-ons checkout (add-ons selected when Plan CTA tapped)
1. Save selected add-ons + quantities to `sessionStorage("pending_addons")`
2. Launch Plan subscription session with `successUrl = /premium?plan_done=1`
3. On return: `useEffect` detects `?plan_done=1` AND `sessionStorage("pending_addons")` non-empty
4. Auto-invoke add-on payment session
5. Clear `sessionStorage("pending_addons")`
6. Add-on `successUrl = /premium?addon_done=1`
7. Show toast: `"Add-ons added to your account ✓"`

### Add-ons-only checkout (Add-ons tab CTA)
Direct payment session, no sequencing.

### Error handling
- Checkout failure → `toast.error("Checkout unavailable. Please try again.")`
- No window.alert. No "Unlock" copy. Neutral phrasing per copy doctrine.

---

## 6. Live Verification Test

After env update, invoke from Premium.tsx checkout logic with:
```json
{
  "mode": "subscription",
  "type": "plus_monthly",
  "lookupKey": "plus_monthly",
  "priceId": "price_1T926a5QcAjQDse0QEYva3ZH"
}
```
Expected: `{ url: "https://checkout.stripe.com/..." }` — real Stripe URL confirms session creation.
Log result to console. If URL returned → verification PASSED.

---

## 7. Removals

- "Restore purchase" button: deleted from `Premium.tsx` StickyCTA zone
- No mention of "free trial" anywhere in copy
- No "Unlock" in any toast or copy
- No "Premium" label — only "Plus" / "Gold" / "Huddle+" / "Add-ons"

---

## Color Reference (subscription page — reference-locked literal values)

| Use case | Hex |
|---|---|
| Annual badge bg / Recommended badge bg | `#E0F2B6` |
| Annual badge text / Recommended badge text | `#2145CF` |
| Selected/Active tab background | `#FF4D4D` |
| Selected/Active tab text | `#FFFFFF` |
| Selected/Active tab border | `#2145CF` |
| Gold feature icon colour (Gold tab only) | `#CFAB21` |
| Plus feature icon colour (Plus tab) | `#2145CF` |

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/components/layout/GlobalHeader.tsx` | Add `closeButton` prop; add notifications Sheet left-side drawer; remove `navigate("/notifications")` |
| `src/pages/Notifications.tsx` | Convert to `<Navigate to="/" />` redirect |
| `src/pages/Premium.tsx` | Full redesign per this doc |
| `.env.local` | Rename + update Stripe price keys |
| `supabase/functions/create-checkout-session/.env` | Rename + update Stripe price keys |
| `src/App.tsx` | No structural changes needed |
| `src/config/quotaConfig.ts` | No changes needed |

---

## UI Contract Compliance Checklist

- [ ] RULE 1: No native `<button>` / `<input>` — all controls via NeuControl / FormField
- [ ] RULE 2: All colours outside Section 10 reference-locked blocks use CSS tokens
- [ ] RULE 3: No parallel button systems
- [ ] RULE 8: Gold token `#CFAB21` only inside `tier="gold"` branch
- [ ] RULE 9: Lucide only, strokeWidth explicit on every icon
- [ ] RULE 10: One H1 per screen; Body max 36ch
- [ ] RULE 13: `grep -rn "<input\|<select\|<textarea"` → zero matches after delivery
- [ ] RULE 14: Viewport-locked frame + safe-area-inset on fixed bottom elements
- [ ] MCL-03: All controls use NeuControl / FormField
- [ ] MCL-04: All icons Lucide with explicit strokeWidth
- [ ] PaywallCTA: Used only on subscription page (compliant per Section 6)
