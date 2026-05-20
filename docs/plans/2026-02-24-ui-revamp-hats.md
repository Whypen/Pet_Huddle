# UI Revamp HATs A–E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Pet Huddle's UI to match DESIGN_MASTER_SPEC.md — NeuButton system replacing all shadcn Button call-sites, new Glass/Neu primitives, paywall pixel-contract, AI Vet response cards, blocker fixes.

**Architecture:** CSS framework (`neu-primary`, `neu-raised`, `neu-gold`, `neu-icon`, `neu-chip`, `card-e1`, `glass-e2`, `glass-e3`) already exists in `index.css`. Work = build React components that USE those classes + mass-replace `<Button` call-sites. GlassModal, GlassSheet, AppBackground already done in prior session.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + Framer Motion + Radix UI + Sonner

---

## HAT A: Audit Findings

### 10 Spec Anchors (DESIGN_MASTER_SPEC.md)
1. §2 Global Canvas — AppBackground mandatory on every screen ✅ done
2. §3.1 Neu surfaces — GlobalHeader/BottomNav/cards: solid, NO blur
3. §3.2 Glass overlays — blur ONLY on modals/sheets/composer/popovers/toasts
4. §3.3 Primitive mapping — NeuSurface, NeuButton, NeuIconButton, NeuChip, GlassModal, GlassSheet, ComposerDock (required, no parallel systems)
5. §4 Typography roles — Headline 24/600, Body 14/400; Colors: Blue #2145CF, Gold #CFAB21
6. §5 Iconography — 44×44 tap targets, single family
7. §6 Motion — 0.98 scale 120–150ms, modal 240–300ms, reduced-motion fade-only
8. §7 Screen templates — Browse/Feed, Map+panel, Detail, Messages, Forms
9. §8.1 Paywall pixel-contract — 8 ordered DOM elements (X, orbs, headline, 3 benefits, dots, tiles, CTA, restore)
10. §8.2–8.4 AI Vet response card, Capsule dividers, Settings max depth 2

### Design vs Runtime Mismatches
- M1: No NeuButton — 187 `<Button` in pages, 30+ in feature components
- M2: No NeuSurface component
- M3: No NeuIconButton component
- M4: No NeuChip component
- M5: No ComposerDock (AIVet has inline custom composer)
- M6: No CapsuleDivider component
- M7: Subscription.tsx paywall DOM order doesn't match §8.1 contract
- M8: AIVet response cards missing generating state + footer chips
- M9–M12: Blockers B1–B5 (DOB, password eye, safe-area, broadcast modal)

### Legacy Primitives to Eliminate
- `<Button` from `@/components/ui/button` in ALL pages/features → `<NeuButton`

---

## Task 1: Create NeuButton
**Files:** Create `src/components/ui/NeuButton.tsx`
- Variants: `primary` (neu-primary), `secondary` (neu-raised), `gold` (neu-gold), `ghost` (minimal), `destructive`
- Maps existing shadcn variant names: `default`→primary, `outline`→secondary
- Same props interface as shadcn Button (drop-in)

## Task 2: Create NeuSurface, NeuIconButton, NeuChip
**Files:** Create 3 files in `src/components/ui/`
- NeuSurface: wraps card-e1 class
- NeuIconButton: wraps neu-icon class, 44×44 enforced
- NeuChip: wraps neu-chip class with active state

## Task 3: Create ComposerDock + CapsuleDivider
**Files:** Create 2 files in `src/components/ui/`
- ComposerDock: glass-e2 input dock for AI Vet + Chat
- CapsuleDivider: capsule date/section label with fade-in animation

## Task 4: Mass replace Button→NeuButton (pages)
**Files:** 20 page files
- Mechanical: change import + JSX tag name

## Task 5: Mass replace Button→NeuButton (feature components)
**Files:** 15 component files
- Mechanical: change import + JSX tag name

## Task 6: Fix Blockers B1-B5
- B1: SignupDob.tsx — DOB picker scroll fix
- B2: SignupCredentials.tsx + Auth.tsx — password confirm eye icon
- B3: UpsellBanner.tsx — safe-area-inset-bottom
- B5: BroadcastModal.tsx — z-index/portal fix

## Task 7: Subscription paywall DOM contract
**File:** `src/pages/Subscription.tsx`
- Restructure to match §8.1 exactly

## Task 8: AIVet response card + ComposerDock
**File:** `src/pages/AIVet.tsx`
- Replace inline composer with ComposerDock
- Add generating state card, footer chips

## Task 9: HAT E proof
- Adoption counts + grep evidence
- npm run lint + npm run build
