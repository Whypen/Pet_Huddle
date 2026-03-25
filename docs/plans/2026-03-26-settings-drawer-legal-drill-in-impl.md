# Settings Drawer — Legal Drill-in Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the accordion Legal / Pet Care Services expand pattern with a two-level view-stack drill-in inside the existing Sheet, and fix the font inconsistency between custom `<button>` rows and `InsetRow`.

**Architecture:** Single `drawerView: "main" | "legal"` state inside `GlobalHeader.tsx`. When `"legal"`, the sheet body is replaced by a back-button header + all six legal items in one flat `InsetPanel`. No new components, no nested Sheets. Sheet `onOpenChange` resets view to `"main"` on close.

**Tech Stack:** React, Tailwind, Radix Sheet, Lucide icons, existing `InsetPanel` / `InsetRow` / `InsetDivider` primitives.

---

## Task 1: Add `ChevronLeft` to lucide imports & remove stale state

**Files:**
- Modify: `src/components/layout/GlobalHeader.tsx:3-23` (imports)
- Modify: `src/components/layout/GlobalHeader.tsx:134-135` (state declarations)

**Step 1: Add `ChevronLeft` to the lucide-react import block**

Current import block (line 3):
```tsx
import {
  Activity,
  AlertCircle,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  ...
} from "lucide-react";
```

Add `ChevronLeft` (alphabetically between `Bell` and `BookOpen`, or after `ChevronDown`):
```tsx
import {
  Activity,
  AlertCircle,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  ...
} from "lucide-react";
```

**Step 2: Replace the two accordion state declarations**

Remove (lines ~134–135):
```tsx
const [legalExpanded, setLegalExpanded] = useState(false);
const [petCareExpanded, setPetCareExpanded] = useState(false);
```

Add:
```tsx
const [drawerView, setDrawerView] = useState<"main" | "legal">("main");
```

**Step 3: Verify no remaining references to old state names**

Run:
```bash
grep -n "legalExpanded\|petCareExpanded" src/components/layout/GlobalHeader.tsx
```
Expected: no matches.

**Step 4: Commit**
```bash
git add src/components/layout/GlobalHeader.tsx
git commit -m "refactor(drawer): replace accordion state with drawerView stack"
```

---

## Task 2: Reset `drawerView` when the Sheet closes

**Files:**
- Modify: `src/components/layout/GlobalHeader.tsx:~579` (Sheet `onOpenChange` prop)

**Step 1: Find the Sheet opening tag**

It currently reads:
```tsx
<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
```

**Step 2: Expand `onOpenChange` to also reset the view**

Replace with:
```tsx
<Sheet
  open={menuOpen}
  onOpenChange={(open) => {
    setMenuOpen(open);
    if (!open) setDrawerView("main");
  }}
>
```

This ensures navigating back via swipe-to-dismiss or tapping the backdrop always resets the view — the next time the drawer opens it starts on the main screen.

**Step 3: Build check**
```bash
npm run build 2>&1 | tail -6
```
Expected: `✓ built in X.XXs` — 0 errors.

**Step 4: Commit**
```bash
git add src/components/layout/GlobalHeader.tsx
git commit -m "fix(drawer): reset drawerView to main on sheet close"
```

---

## Task 3: Replace the Legal accordion with a drill-in `InsetRow`

**Files:**
- Modify: `src/components/layout/GlobalHeader.tsx:~757-841` (the entire Legal block inside "4. Support + Legal panel")

**Step 1: Locate the exact block to replace**

The block starts at the `<InsetDivider />` before the `<button ... onClick={() => setLegalExpanded ...}>` and ends at the closing `</InsetPanel>` of panel 4 (line ~841).

Specifically, replace everything from:
```tsx
<InsetDivider />
<button
  type="button"
  onClick={() => setLegalExpanded((v) => !v)}
  className="w-full flex items-center gap-3 px-4 py-[13px] text-left"
>
  ...
</button>
{legalExpanded && (
  <>
    ...
  </>
)}
```

**Step 2: Replace with a single `InsetRow` drill-in button (shown only in main view)**

Wrap the Legal Information row in a conditional so it only appears when `drawerView === "main"`:

```tsx
<InsetDivider />
<InsetRow
  label="Legal Information"
  icon={<FileText size={16} strokeWidth={1.75} />}
  variant="nav"
  onClick={() => setDrawerView("legal")}
/>
```

Note: `variant="nav"` on `InsetRow` already renders a `ChevronRight` on the right — no custom button needed, and the label renders at `text-[15px] font-medium`, matching every other drawer row.

**Step 3: Close the InsetPanel for the main view**

After the `InsetRow` above, close the panel:
```tsx
</InsetPanel>
```

**Step 4: Build check**
```bash
npm run build 2>&1 | tail -6
```
Expected: 0 errors.

**Step 5: Commit**
```bash
git add src/components/layout/GlobalHeader.tsx
git commit -m "feat(drawer): legal information drill-in row replaces accordion"
```

---

## Task 4: Build the Legal sub-screen

**Files:**
- Modify: `src/components/layout/GlobalHeader.tsx` — add legal sub-screen after the closing `</InsetPanel>` of the main Support+Legal panel, but before `</SheetContent>`.

**Step 1: Add the legal sub-screen block**

Insert after the last `</InsetPanel>` (currently line ~841) and before `</SheetContent>`:

```tsx
{/* ── Legal sub-screen ────────────────────────────────────────── */}
{drawerView === "legal" && (
  <div className="flex flex-col gap-4">
    {/* Back header */}
    <button
      type="button"
      onClick={() => setDrawerView("main")}
      className="flex items-center gap-1.5 px-1 py-1 -mx-1 rounded-lg text-left text-[var(--text-primary)] active:bg-black/5"
    >
      <ChevronLeft size={18} strokeWidth={1.75} className="text-[var(--text-secondary)] shrink-0" />
      <span className="text-[15px] font-semibold">Legal Information</span>
    </button>

    <InsetPanel>
      {/* General legal */}
      <SheetClose asChild>
        <InsetRow
          label="Privacy Policy"
          icon={<ShieldAlert size={16} strokeWidth={1.75} />}
          variant="nav"
          onClick={() => navigate("/privacy")}
        />
      </SheetClose>
      <InsetDivider />
      <SheetClose asChild>
        <InsetRow
          label="Terms of Service"
          icon={<FileText size={16} strokeWidth={1.75} />}
          variant="nav"
          onClick={() => navigate("/terms")}
        />
      </SheetClose>
      <InsetDivider />
      <SheetClose asChild>
        <InsetRow
          label="Community Guidelines"
          icon={<BookOpen size={16} strokeWidth={1.75} />}
          variant="nav"
          onClick={() => navigate("/community-guidelines")}
        />
      </SheetClose>

      {/* Visual separator between general and service-specific */}
      <div className="h-px bg-border/60 mx-3 my-1" />

      {/* Service-specific legal */}
      <SheetClose asChild>
        <InsetRow
          label="Service Provider Agreement"
          icon={<FileText size={16} strokeWidth={1.75} />}
          variant="nav"
          onClick={() => navigate("/service-agreement")}
        />
      </SheetClose>
      <InsetDivider />
      <SheetClose asChild>
        <InsetRow
          label="Service Booking Terms"
          icon={<BookOpen size={16} strokeWidth={1.75} />}
          variant="nav"
          onClick={() => navigate("/booking-terms")}
        />
      </SheetClose>
    </InsetPanel>
  </div>
)}
```

**Step 2: Conditionally hide the main-view panels when in legal view**

The main-view panels (user identity, membership, profile, support+legal) should not render when `drawerView === "legal"`. Wrap the entire main content in:

```tsx
{drawerView === "main" && (
  <>
    {/* 1. User identity row */}
    ...
    {/* 2. Membership panel */}
    ...
    {/* 3. Profile & Access panel */}
    ...
    {/* 4. Support + Legal panel */}
    ...
  </>
)}
```

This gives a clean full-screen sub-view without residual main content peeking through.

**Step 3: Lint + build**
```bash
npm run lint && npm run build 2>&1 | tail -6
```
Expected: 0 lint errors, 0 build errors.

**Step 4: Commit**
```bash
git add src/components/layout/GlobalHeader.tsx
git commit -m "feat(drawer): legal sub-screen with back button and flat item list"
```

---

## Task 5: Push and verify

**Step 1: Push to main**
```bash
git push origin main
```

**Step 2: Manual smoke test checklist**
- [ ] Open settings drawer → main view shows "Legal Information" with a ChevronRight, same font/size as all other rows
- [ ] Tap "Legal Information" → entire sheet body replaces with back button + 5 legal items
- [ ] Back button (`← Legal Information`) returns to main view
- [ ] Tapping any leaf item (e.g. Privacy Policy) closes the drawer and navigates correctly
- [ ] Swipe-to-dismiss the sheet → re-open → starts on main view (not legal)
- [ ] No "Pet Care Services" subcategory visible anywhere
- [ ] "Service Provider Agreement" and "Service Booking Terms" labels are correct
- [ ] Divider line appears between Community Guidelines and Service Provider Agreement
