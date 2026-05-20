# Verify Identity — UI Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Full replacement of `/verify-identity` page with a prop-driven, UI-only, premium trust flow — no backend wiring.

**Architecture:** Single scrollable page. Two always-visible `InsetPanel` cards (Human + Card verification). Local `activeCard` state controls which card is expanded. All verification state driven by props. Zero Supabase/Stripe/camera calls.

**Tech Stack:** React + TypeScript, Tailwind, `InsetPanel`/`NeuControl`/`NeuChip` from design system, `PageHeader` from layouts, Framer Motion (already in project), Lucide icons.

---

## Prop / Type Contract (locked)

```ts
type HumanVerificationState =
  | "idle" | "ready" | "capturing" | "pending" | "passed" | "failed";

type CardVerificationState =
  | "idle" | "loading" | "pending" | "passed" | "failed";

type OverallVerificationStatus =
  | "unverified" | "pending" | "verified";

interface VerifyIdentityProps {
  humanVerificationState: HumanVerificationState;
  cardVerificationState: CardVerificationState;
  overallVerificationStatus: OverallVerificationStatus;
  onStartHumanVerification: () => void;
  onBeginCapture: () => void;
  onRetryHuman: () => void;
  onAddCard: () => void;
  onRetryCard: () => void;
}
```

---

## Image Asset

- Path: `src/assets/Sign up/Verify_1.jpg`
- Import as: `import verifyIllustration from "@/assets/Sign up/Verify_1.jpg";`
- Render: `<img src={verifyIllustration} alt="" className="w-full max-w-[260px] h-[160px] object-contain mix-blend-multiply mx-auto" aria-hidden />`

---

## Task 1: File skeleton — types, imports, shell

**File:** `src/pages/VerifyIdentity.tsx` (full replacement — delete all existing content)

**Step 1: Replace file with skeleton**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, UserRound, CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/layouts/PageHeader";
import { InsetPanel, InsetDivider } from "@/components/ui/InsetPanel";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import verifyIllustration from "@/assets/Sign up/Verify_1.jpg";

type HumanVerificationState =
  | "idle" | "ready" | "capturing" | "pending" | "passed" | "failed";

type CardVerificationState =
  | "idle" | "loading" | "pending" | "passed" | "failed";

type OverallVerificationStatus = "unverified" | "pending" | "verified";

interface VerifyIdentityProps {
  humanVerificationState: HumanVerificationState;
  cardVerificationState: CardVerificationState;
  overallVerificationStatus: OverallVerificationStatus;
  onStartHumanVerification: () => void;
  onBeginCapture: () => void;
  onRetryHuman: () => void;
  onAddCard: () => void;
  onRetryCard: () => void;
}

const VerifyIdentity: React.FC<VerifyIdentityProps> = ({
  humanVerificationState = "idle",
  cardVerificationState = "idle",
  overallVerificationStatus = "unverified",
  onStartHumanVerification = () => {},
  onBeginCapture = () => {},
  onRetryHuman = () => {},
  onAddCard = () => {},
  onRetryCard = () => {},
}) => {
  const navigate = useNavigate();
  const [activeCard, setActiveCard] = useState<"human" | "card" | null>(null);

  const toggleCard = (card: "human" | "card") =>
    setActiveCard((prev) => (prev === card ? null : card));

  return (
    <div className="h-full min-h-0 w-full max-w-full flex flex-col">
      {/* TASK 2: PageHeader */}
      {/* TASK 3: Scroll body */}
    </div>
  );
};

export default VerifyIdentity;
```

**Step 2: Verify no TypeScript errors**
```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npx tsc --noEmit 2>&1 | head -30
```

---

## Task 2: PageHeader with overall status chip

**File:** `src/pages/VerifyIdentity.tsx`

Replace `{/* TASK 2: PageHeader */}` with:

```tsx
<PageHeader
  title={<h1 className="text-base font-semibold text-[#424965] truncate">Verify Identity</h1>}
  titleClassName="justify-start"
  showBack
  onBack={() => navigate(-1)}
  right={
    <NeuChip
      as="span"
      active={overallVerificationStatus === "verified"}
      className={cn(
        "text-[11px] flex items-center gap-1 pointer-events-none",
        overallVerificationStatus === "verified" && "text-white"
      )}
    >
      {overallVerificationStatus === "verified" && (
        <BadgeCheck size={12} strokeWidth={2} aria-hidden />
      )}
      {overallVerificationStatus === "unverified" && "Unverified"}
      {overallVerificationStatus === "pending" && "Pending"}
      {overallVerificationStatus === "verified" && "Verified"}
    </NeuChip>
  }
/>
```

---

## Task 3: Scroll body — illustration + explainer

**File:** `src/pages/VerifyIdentity.tsx`

Replace `{/* TASK 3: Scroll body */}` with:

```tsx
<div className="flex-1 min-h-0 overflow-y-auto">
  <div className="pt-[68px] px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)] space-y-4 max-w-md mx-auto">

    {/* Hero illustration */}
    <div className="flex justify-center pt-2">
      <img
        src={verifyIllustration}
        alt=""
        aria-hidden
        className="w-full max-w-[260px] h-[160px] object-contain mix-blend-multiply"
      />
    </div>

    {/* Explainer */}
    <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)] px-1">
      To help keep Huddle safe, we use a quick trust check to confirm
      you're a real person using your real identity. We only keep the
      verification result and limited metadata needed for safety and
      fraud prevention.
    </p>

    {/* TASK 4: HumanVerificationCard */}
    {/* TASK 5: CardVerificationCard */}

  </div>
</div>
```

---

## Task 4: HumanVerificationCard

**File:** `src/pages/VerifyIdentity.tsx` — add before the `VerifyIdentity` component

```tsx
// ── Human status badge helper ─────────────────────────────────────────────

const humanStatusBadge = (state: HumanVerificationState) => {
  if (state === "idle") return null;
  const map: Record<string, { label: string; className: string }> = {
    ready:     { label: "In progress", className: "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]" },
    capturing: { label: "In progress", className: "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]" },
    pending:   { label: "Pending",     className: "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]" },
    passed:    { label: "Complete",    className: "bg-emerald-50 text-emerald-600" },
    failed:    { label: "Action needed", className: "bg-red-50 text-red-500" },
  };
  const entry = map[state];
  if (!entry) return null;
  return (
    <span className={cn("shrink-0 text-[11px] font-medium px-2.5 py-[5px] rounded-full", entry.className)}>
      {entry.label}
    </span>
  );
};

// ── HumanVerificationCard ──────────────────────────────────────────────────

interface HumanCardProps {
  state: HumanVerificationState;
  isOpen: boolean;
  onToggle: () => void;
  onStart: () => void;
  onBegin: () => void;
  onRetry: () => void;
}

const HumanVerificationCard: React.FC<HumanCardProps> = ({
  state,
  isOpen,
  onToggle,
  onStart,
  onBegin,
  onRetry,
}) => {
  const expandable = state !== "passed";

  return (
    <InsetPanel>
      {/* Compact header row */}
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        disabled={!expandable}
        className={cn(
          "flex items-center gap-3 px-4 min-h-[52px] py-3 w-full text-left",
          expandable && "cursor-pointer active:bg-[rgba(255,255,255,0.55)] transition-[background] duration-100",
          !expandable && "cursor-default"
        )}
      >
        <span className={cn(
          "shrink-0 flex items-center",
          state === "passed" ? "text-emerald-500" : "text-[var(--text-secondary)]"
        )}>
          <UserRound size={16} strokeWidth={1.75} />
        </span>
        <span className="flex-1 text-[15px] font-medium leading-snug text-[var(--text-primary,#424965)]">
          Verify You're Human
        </span>
        {humanStatusBadge(state)}
      </button>

      {/* Expanded content */}
      {isOpen && state !== "passed" && (
        <>
          <InsetDivider />

          {/* idle */}
          {state === "idle" && (
            <div className="px-4 pt-3 pb-4 space-y-3">
              <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                A quick check to confirm you're a real person. Takes about 30 seconds.
              </p>
              <NeuControl size="lg" fullWidth onClick={onStart}>
                Start Verification
              </NeuControl>
            </div>
          )}

          {/* ready */}
          {state === "ready" && (
            <div className="px-4 pt-4 pb-5 flex flex-col items-center gap-4">
              <div className="w-[200px] h-[248px] rounded-full border-2 border-dashed border-[rgba(163,168,190,0.4)] flex items-center justify-center">
                <UserRound size={48} strokeWidth={1.25} className="text-[rgba(163,168,190,0.5)]" />
              </div>
              <p className="text-[14px] font-medium text-[var(--text-secondary)] text-center">
                Position your face in the oval
              </p>
              <NeuControl size="lg" fullWidth onClick={onBegin}>
                Begin
              </NeuControl>
            </div>
          )}

          {/* capturing */}
          {state === "capturing" && (
            <div className="px-4 pt-4 pb-5 flex flex-col items-center gap-4">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-[208px] h-[256px] rounded-full border-2 border-brandBlue animate-pulse" />
                <div className="w-[200px] h-[248px] rounded-full border-2 border-brandBlue bg-[rgba(33,69,207,0.06)] flex items-center justify-center">
                  <UserRound size={48} strokeWidth={1.25} className="text-brandBlue opacity-40" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-[15px] font-semibold text-[var(--text-primary,#424965)]">
                  Look straight ahead
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)]">Hold still for a moment…</p>
              </div>
            </div>
          )}

          {/* pending */}
          {state === "pending" && (
            <div className="px-4 pt-3 pb-4">
              <div className="glass-card rounded-[14px] px-4 py-3 flex items-center gap-3">
                <Loader2 size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)] animate-spin shrink-0" />
                <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                  We're reviewing your check. This usually takes a moment.
                </p>
              </div>
            </div>
          )}

          {/* failed */}
          {state === "failed" && (
            <div className="px-4 pt-3 pb-4 space-y-3">
              <div className="glass-card rounded-[14px] px-4 py-3 border border-[rgba(232,69,69,0.2)]">
                <p className="text-[13px] leading-[1.55] text-[var(--color-error,#E84545)]">
                  We couldn't complete the check.
                </p>
              </div>
              <NeuControl size="lg" fullWidth onClick={onRetry}>
                Try Again
              </NeuControl>
            </div>
          )}
        </>
      )}
    </InsetPanel>
  );
};
```

Replace `{/* TASK 4: HumanVerificationCard */}` in the scroll body with:

```tsx
<HumanVerificationCard
  state={humanVerificationState}
  isOpen={activeCard === "human"}
  onToggle={() => toggleCard("human")}
  onStart={onStartHumanVerification}
  onBegin={onBeginCapture}
  onRetry={onRetryHuman}
/>
```

---

## Task 5: CardVerificationCard

**File:** `src/pages/VerifyIdentity.tsx` — add after `HumanVerificationCard`, before `VerifyIdentity`

```tsx
// ── Card status badge helper ───────────────────────────────────────────────

const cardStatusBadge = (state: CardVerificationState) => {
  if (state === "idle") return null;
  const map: Record<string, { label: string; className: string }> = {
    loading: { label: "In progress", className: "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]" },
    pending: { label: "Pending",     className: "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)]" },
    passed:  { label: "Complete",    className: "bg-emerald-50 text-emerald-600" },
    failed:  { label: "Action needed", className: "bg-red-50 text-red-500" },
  };
  const entry = map[state];
  if (!entry) return null;
  return (
    <span className={cn("shrink-0 text-[11px] font-medium px-2.5 py-[5px] rounded-full", entry.className)}>
      {entry.label}
    </span>
  );
};

// ── CardVerificationCard ───────────────────────────────────────────────────

interface CardCardProps {
  state: CardVerificationState;
  isOpen: boolean;
  onToggle: () => void;
  onAddCard: () => void;
  onRetry: () => void;
}

const CardVerificationCard: React.FC<CardCardProps> = ({
  state,
  isOpen,
  onToggle,
  onAddCard,
  onRetry,
}) => {
  const expandable = state !== "passed";

  return (
    <InsetPanel>
      {/* Compact header row */}
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        disabled={!expandable}
        className={cn(
          "flex items-center gap-3 px-4 min-h-[52px] py-3 w-full text-left",
          expandable && "cursor-pointer active:bg-[rgba(255,255,255,0.55)] transition-[background] duration-100",
          !expandable && "cursor-default"
        )}
      >
        <span className={cn(
          "shrink-0 flex items-center",
          state === "passed" ? "text-emerald-500" : "text-[var(--text-secondary)]"
        )}>
          <CreditCard size={16} strokeWidth={1.75} />
        </span>
        <span className="flex-1 text-[15px] font-medium leading-snug text-[var(--text-primary,#424965)]">
          Verify with a Card
        </span>
        {cardStatusBadge(state)}
      </button>

      {/* Passed: masked card row */}
      {state === "passed" && (
        <>
          <InsetDivider />
          <div className="flex items-center gap-3 px-4 py-[13px]">
            <span className="shrink-0 text-emerald-500 flex items-center">
              <CreditCard size={16} strokeWidth={1.75} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="block text-[14px] font-[500] text-[var(--text-primary,#424965)] font-mono tracking-[0.08em]">
                •••• •••• •••• 4242
              </span>
              <span className="block text-[11px] text-[var(--text-tertiary)] mt-0.5">Verified card</span>
            </div>
            <span className="shrink-0 text-[11px] font-medium px-2.5 py-[5px] rounded-full bg-emerald-50 text-emerald-600">
              Verified
            </span>
          </div>
        </>
      )}

      {/* Expanded content */}
      {isOpen && state !== "passed" && (
        <>
          <InsetDivider />

          {/* idle */}
          {state === "idle" && (
            <div className="px-4 pt-3 pb-4 space-y-3">
              <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                Add a card to confirm your identity. Your card won't be charged.
              </p>
              <NeuControl size="lg" fullWidth onClick={onAddCard}>
                Add Card
              </NeuControl>
              <p className="text-[12px] text-[var(--text-tertiary)] text-center">No charge.</p>
            </div>
          )}

          {/* loading */}
          {state === "loading" && (
            <div className="px-4 pt-3 pb-4">
              <NeuControl size="lg" fullWidth loading disabled>
                Connecting…
              </NeuControl>
            </div>
          )}

          {/* pending */}
          {state === "pending" && (
            <div className="px-4 pt-3 pb-4">
              <div className="glass-card rounded-[14px] px-4 py-3 flex items-center gap-3">
                <Loader2 size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)] animate-spin shrink-0" />
                <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">
                  We're confirming your card. This only takes a moment.
                </p>
              </div>
            </div>
          )}

          {/* failed */}
          {state === "failed" && (
            <div className="px-4 pt-3 pb-4 space-y-3">
              <div className="glass-card rounded-[14px] px-4 py-3 border border-[rgba(232,69,69,0.2)]">
                <p className="text-[13px] leading-[1.55] text-[var(--color-error,#E84545)]">
                  Card verification didn't go through.
                </p>
              </div>
              <NeuControl size="lg" fullWidth onClick={onRetry}>
                Try a Different Card
              </NeuControl>
            </div>
          )}
        </>
      )}
    </InsetPanel>
  );
};
```

Replace `{/* TASK 5: CardVerificationCard */}` in scroll body with:

```tsx
<CardVerificationCard
  state={cardVerificationState}
  isOpen={activeCard === "card"}
  onToggle={() => toggleCard("card")}
  onAddCard={onAddCard}
  onRetry={onRetryCard}
/>
```

---

## Task 6: Wire default props for dev preview

The page is rendered as a route in `App.tsx` with no props. Add default parameter values so it renders without crashing during dev/preview:

All props already have `= () => {}` or default state values in the function signature (Task 1). No change needed to `App.tsx`.

---

## Task 7: Lint + build verification

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run lint 2>&1 | tail -20
```

```bash
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle" && npm run build 2>&1 | tail -20
```

Expected: no errors. Pre-existing chunk-size advisory is acceptable.

---

## Task 8: Dev server visual smoke

Start server and confirm all states render correctly by toggling `humanVerificationState` / `cardVerificationState` defaults in the component:

- `idle` both cards → both compact, no badges
- `passed` human → compact with emerald "Complete", non-expandable
- `capturing` → oval with pulsing blue ring visible
- `passed` card → masked card row visible
- `failed` either → red error card + retry CTA visible
- `verified` overall → blue "Verified" chip in header

---
