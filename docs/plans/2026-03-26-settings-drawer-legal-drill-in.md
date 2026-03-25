# Settings Drawer — Legal Drill-in & Font Alignment

**Date:** 2026-03-26
**File:** `src/components/layout/GlobalHeader.tsx`

---

## Problem

1. **Font inconsistency** — "Legal Information" and "Pet Care Services" rows use custom `<button>` elements with `text-[14px] font-[500]`. All other drawer rows use `InsetRow` which renders `text-[15px] font-medium`. One pixel and inconsistent class naming causes visible misalignment.

2. **Accordion UX** — Legal items expand inline via `legalExpanded` / `petCareExpanded` state. Nested accordions inside a scroll drawer create a content wall and require unnecessary scrolling. 3-level nesting (drawer → Legal → Pet Care Services → document) is too deep for rarely-accessed content.

---

## Design Decision

Replace the accordion with a **view-stack pattern** inside the existing Sheet — the same pattern used by iOS Settings and most native apps. A `drawerView` state controls which panel is visible. Navigation is instant (or with a brief `translateX` slide). No new Sheet instances; no z-index issues.

**Flatten the hierarchy to 2 levels.** "Pet Care Services" as a named drill-in subcategory is removed. Service-specific legal documents are pulled up to the same Legal layer, separated by a visual divider.

---

## Final Information Architecture

```
Main drawer
└── Legal Information  (InsetRow, ChevronRight, drills to "legal" view)
    ├── Privacy Policy               → navigate("/privacy")
    ├── Terms of Service             → navigate("/terms")
    ├── Community Guidelines         → navigate("/community-guidelines")
    ├── ── divider ──
    ├── Service Provider Agreement   → navigate("/service-agreement")
    └── Service Booking Terms        → navigate("/booking-terms")
```

---

## State Changes

| Remove | Add |
|--------|-----|
| `legalExpanded: boolean` | `drawerView: "main" \| "legal"` |
| `petCareExpanded: boolean` | — |

---

## Component Structure

### Main view (`drawerView === "main"`)
- "Legal Information" row: `InsetRow` with `variant="nav"` (renders ChevronRight automatically). `onClick` sets `drawerView("legal")`. **No** `SheetClose` wrapper — stays in drawer.

### Legal sub-view (`drawerView === "legal"`)
Header row inside the sheet content:
```tsx
<button onClick={() => setDrawerView("main")} className="flex items-center gap-2 px-4 py-3 w-full">
  <ChevronLeft size={16} />
  <span className="text-[15px] font-medium">Legal Information</span>
</button>
<InsetDivider />
```

Then `InsetPanel` with all six items. Each leaf row wraps in `SheetClose asChild` so tapping navigates and closes the drawer.

Visual divider between Community Guidelines and Service Provider Agreement: a full-bleed `<div className="h-px bg-border/40 mx-4 my-1" />` or `InsetDivider` with extra margin.

---

## Font Fix

Removing the two custom `<button>` elements and replacing with `InsetRow` resolves the font inconsistency automatically. `InsetRow` is the single source of truth for drawer row typography.

---

## Renamed Items

| Old | New |
|-----|-----|
| Service Agreement | Service Provider Agreement |
| Booking Terms | Service Booking Terms |

Route targets (`/service-agreement`, `/booking-terms`) are unchanged — only the display labels change.

---

## Animation (optional enhancement)

If a slide transition is desired:
- Wrap both views in a container with `overflow-hidden`
- Main view: `translateX(0)` → `translateX(-100%)` on drill-in
- Legal view: starts at `translateX(100%)` → `translateX(0)` on drill-in
- Use `transition-transform duration-200 ease-in-out`

For simplicity, instant swap (no animation) is acceptable for v1.

---

## Out of Scope

- Route changes for `/privacy`, `/terms`, `/community-guidelines`, `/service-agreement`, `/booking-terms`
- Content of legal pages
- Any other drawer sections
