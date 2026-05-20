# Glass/Neu Triage Revamp — Implementation Plan (Delivery Model C)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Triage the highest-severity UI_CONTRACT.md v6.1 violations — canvas foundation, token system, copy drift, all missing primitives, and parallel-system elimination — without touching pages yet.

**Architecture:** Bottom-up: global canvas → design tokens → copy i18n → primitive components → parallel system deletion → audit sweeps → build proof. Pages are NOT touched in this pass; they are unblocked once primitives exist.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Radix UI + Lucide React + class-variance-authority

---

## Audit Baselines (pre-fix state)

```
Raw <button>     205 hits  (RULE 1 / MCL-03)
Raw <input>      105 hits  (RULE 1 / MCL-03)
Raw <select>      26 hits  (RULE 1 / MCL-03)
backdrop-blur    35+ hits  (RULE 2 / Section 5)
RULE 11 miss:    index.html body bg missing
tokens.css:      128 lines, missing easing/glass/color tokens
Copy drift:      "Premium" in rendered i18n values
Parallel systems: v3/Button + NeuButton + shadcn button all coexist (RULE 3)
Missing primitives: NeuControl, FormField system, InsetPanel, EmptyStateCard, PageErrorState, PaywallCTA, ROUTE_MANIFEST.ts
```

---

## C0 — Branch Proof

**Files:** none (read-only)

**Step 1:** Run
```bash
git branch --show-current
git rev-parse --abbrev-ref HEAD
git status -sb
```
Expected: `main` on both; dirty working tree with only existing M/D entries.

---

## C1 — RULE 11: First-Frame Canvas

**Files:**
- Modify: `index.html` — add `style="background-color:#D5DFEF"` to `<body>` tag

**Step 1:** Edit `<body>` opening tag:
```html
<body style="background-color:#D5DFEF;">
```

**Step 2:** Prove:
```bash
grep -n "background-color" index.html
```
Expected: `1:  <body style="background-color:#D5DFEF;">`

---

## C2 — Section 12 Tokens

**Files:**
- Modify: `src/styles/tokens.css` — add missing blocks at bottom

**Tokens to add (must not duplicate or override existing):**
- `--ease-out`, `--ease-std`, `--ease-in`, `--ease-linear`
- `--glass-e1-*`, `--glass-e2-*`, `--glass-e3-*` per Section 5 spec
- `--blue`, `--gold`, `--gold-light`, `--gold-surface`
- `--text-primary`, `--text-secondary`, `--text-tertiary`
- `--color-error`, `--color-success`, `--color-warning`
- `--font` (Urbanist)

**Step 2:** Prove:
```bash
grep -n -- "--ease-" src/styles/tokens.css
grep -n -- "--glass-e" src/styles/tokens.css
grep -n -- "--blue\|--gold\|--text-primary\|--color-error" src/styles/tokens.css
```

---

## C3 — Copy Drift

**Files:**
- Modify: `src/contexts/LanguageContext.tsx` — fix rendered values only (not key names)

**Changes:**
- Line 328: `"premium.premium_plan": "Premium"` → `"premium.premium_plan": "Plus"`
- Line 498: `"Blue Premium": "Blue Premium"` → `"Blue Premium": "Blue Plus"`
- Any other value (not key) containing bare "Premium" that is user-visible

**Step 2:** Prove zero rendered-value drift:
```bash
grep -Rni -E "\bPremium\b" src/contexts/LanguageContext.tsx | grep -v "^[^:]*://\|#\|key\|premium\." | head -n 50
```

---

## C4 — Missing Primitives

### C4.1 — NeuControl

**Files:**
- Create: `src/components/ui/NeuControl.tsx`

Full Section 6 recipe: Primary / Secondary / Tertiary / Danger / Gold variants. All 5 shadow layers. All states: Rest / Pressed / Selected / Disabled / Focus / Loading. Sizing: xl/lg/md/sm/icon-lg/icon-md/icon-sm.

### C4.2 — FormField System

**Files:**
- Create: `src/components/ui/FormField.tsx`

Wraps: text / email / password / tel / number / search / textarea. Section 7 base recipe. Label + Control + MessageSlot anatomy. Keyboard-safe.

**Files:**
- Create: `src/components/ui/NeuDropdown.tsx`
- Create: `src/components/ui/NeuCheckbox.tsx`
- Create: `src/components/ui/NeuToggle.tsx`
- Create: `src/components/ui/NeuSlider.tsx`
- Create: `src/components/ui/FormFieldOtp.tsx`

### C4.3 — InsetPanel

**Files:**
- Create: `src/components/ui/InsetPanel.tsx`

T5 settings anatomy: glass-e1, border-radius 16px, overflow hidden. Row + RowDivider subcomponents.

### C4.4 — EmptyStateCard + PageErrorState

**Files:**
- Create: `src/components/ui/EmptyStateCard.tsx`
- Create: `src/components/ui/PageErrorState.tsx`

Section 7 blueprint anatomy. Lucide icons, NeuControl-icon-lg puck.

### C4.5 — PaywallCTA

**Files:**
- Create: `src/components/paywall/PaywallCTA.tsx`

Section 6 blackpill recipe. height 56px, border-radius 9999px, bg #0D0D0D, color white. MUST NOT be a NeuControl variant.

### C4.6 — ROUTE_MANIFEST

**Files:**
- Create: `src/routes/ROUTE_MANIFEST.ts`

Exported string array matching Section 4 Page Index + UNMAPPED routes.

---

## C5 — RULE 3: Parallel System Elimination

**Files:**
- Delete or mark deprecated: `src/components/ui/NeuButton.tsx` — replaced by NeuControl
- `src/components/ui/v3/Button.tsx` — replaced by NeuControl

Update any imports of the deleted files to use new NeuControl.

**Prove:**
```bash
grep -Rni -E "from .*(NeuButton|v3/Button)" src/ | head -n 50
```
Expected: zero hits (or only the new NeuControl file itself).

---

## C6 — Drift Sweeps

```bash
grep -Rni "<button\b" src/ | head -n 50
grep -Rni "<input\b" src/ | head -n 50
grep -Rni "<select\b" src/ | head -n 50
grep -Rni -E "backdrop-blur|backdrop-filter" src/ | head -n 200
```

Document remaining counts. These are the page-replacement backlog for the NEXT pass.

---

## C7 — Build Gate

```bash
npm run lint
npm run build
```

Expected: lint clean, build success (pre-existing chunk-size advisory only).

---

## Commit Strategy

```
feat(tokens): add RULE 11 canvas + Section 12 token completion
fix(i18n): remove remaining 'Premium' rendered values
feat(primitives): NeuControl canonical 5-layer recipe (Section 6)
feat(primitives): FormField system (Section 7)
feat(primitives): InsetPanel, EmptyStateCard, PageErrorState, PaywallCTA
feat(routes): add ROUTE_MANIFEST.ts
refactor(RULE3): remove NeuButton/v3-Button parallel systems
```
