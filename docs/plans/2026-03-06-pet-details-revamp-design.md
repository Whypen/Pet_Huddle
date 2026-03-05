# PetDetails Page Revamp — Design Doc
**Date:** 2026-03-06
**Status:** Approved
**Scope:** `src/pages/PetDetails.tsx` only

---

## Goals

1. Restore the downloaded original as the data/logic base (parsers, types, fetch unchanged).
2. Apply UI contract compliance (Rules 1–3, 9, 10, 12, 14).
3. Replace the two separate collapsible sections with two **adjacent** dividers that feel like one group — independently toggleable but visually flush.
4. Expand record display from summary counts to **compact B inline rows** with "Show more" overflow.

---

## Shell

| Element | Spec |
|---|---|
| Header | `PageHeader` — `showBack` (navigates `/`) + pet name truncated in title slot + `NeuControl size="icon-md" variant="tertiary"` pencil edit icon |
| Hero | 200px fixed-height photo or gradient; bottom gradient overlay only; no raw `<button>` back in hero |
| Chips | `NeuChip as="span"` — birthday+age, weight, microchip ID, gender, neutered/spayed. No `Badge` import |
| Removed | `GlobalHeader`, `NeuButton`, `Badge`, `motion.h1`, raw `<button>` back arrow |
| Loading | Skeleton: `card-e1` placeholder blocks matching hero (200px) + identity strip height + two divider bars — no spinner as sole indicator |

---

## Content Layout

```
PageHeader (fixed 56px)
Hero photo / gradient (200px, mt-[56px])
Identity strip (px-4 pt-4 pb-3)
  └─ h2 name (28px/700)
  └─ species · breed (15px secondary)
  └─ NeuChip row (birthday, weight, microchip, gender, neutered)
Bio card (card-e1 mx-4 mb-4, line-clamp-3, Show more/less NeuControl)

── Health divider ─────────────── mb-0
Health InsetPanel (mx-4 mb-0)     ← only when open
── Temperament & Routine divider ─ mt-0 mb-2
T&R InsetPanel (mx-4 mb-4)        ← only when open

bottom padding pb-[calc(64px+env(safe-area-inset-bottom))]
```

---

## Health Panel — Compact B Rows

Contents inside one `InsetPanel`:

### Reminder
- Icon: `BellRing` (16px, sw 1.75)
- Primary line: reason label (or "None")
- Secondary line: `reminderDate` (if set)
- Single row, always visible

### `InsetDivider`

### Vet Visits
- Icon: `Stethoscope` per row
- Each row: `reason[ · vaccine]` primary + `date` secondary
- Show first 3; if > 3 → `NeuControl size="sm" variant="tertiary"` "Show N more / Show less"
- If none: single row "No records" in tertiary text, no icon

### `InsetDivider` (only if medications exist)

### Medications
- Icon: `Pill` per row
- Each row: `name` primary + `dose_amount dose_unit · Every freq_value freq_unit` secondary (falls back to legacy `dosage` / `frequency` strings)
- Show first 3; if > 3 → same "Show N more" pattern
- Section omitted entirely if `medications` array is empty

---

## Temperament & Routine Panel

Contents inside one `InsetPanel`:

### Temperament
- `NeuChip as="span"` chips in flex-wrap — no sub-label
- Omitted if `temperament` is null/empty

### `InsetDivider` (only if both present)

### Routine
- Group label: `text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)]` → "DAILY ROUTINE"
- Body: `text-[13px] leading-[1.5] whitespace-pre-wrap text-[var(--text-secondary)]`
- No truncation (content is already gated behind a tap)
- Omitted if `routine` is null

Panel hidden entirely if neither `temperament` nor `routine` exists.

---

## Divider Adjacency — No Gap

```tsx
{/* Health divider — no bottom margin */}
<button ... className="... mx-4 mb-0 ...">Health</button>

{/* Health panel — no bottom margin when open */}
{showHealth && <div className="mx-4 mb-0"><InsetPanel>...</InsetPanel></div>}

{/* Temperament & Routine divider — no top margin, flush to Health */}
<button ... className="... mx-4 mt-0 mb-2 ...">Temperament &amp; Routine</button>

{/* T&R panel */}
{showTempRoutine && <div className="mx-4 mb-4"><InsetPanel>...</InsetPanel></div>}
```

Both dividers are independently toggleable. Opening one does not affect the other.

---

## State

```ts
const [showHealth, setShowHealth] = useState(false);
const [showTempRoutine, setShowTempRoutine] = useState(false);
const [bioExpanded, setBioExpanded] = useState(false);
const [showAllVetVisits, setShowAllVetVisits] = useState(false);
const [showAllMeds, setShowAllMeds] = useState(false);
```

---

## Contract Compliance Checklist

- [ ] No `<button>` styled directly in page (divider headers use same established inline pattern as Chats/Social; all interactive CTA controls use NeuControl)
- [ ] No `Badge` import — replaced by `NeuChip`
- [ ] No `NeuButton` — replaced by `NeuControl`
- [ ] No `GlobalHeader` — replaced by `PageHeader`
- [ ] No `motion` imports
- [ ] All Lucide icons have `strokeWidth={1.75}` explicit
- [ ] Skeleton state present (Rule 12)
- [ ] Viewport-locked frame: `h-full min-h-0 flex flex-col` shell (Rule 14)
- [ ] `StyledScrollArea flex-1 min-h-0` content region

---

## Files Changed

- `src/pages/PetDetails.tsx` — full rewrite based on downloaded base + design above
