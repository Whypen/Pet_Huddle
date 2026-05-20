# Phase 4 Native Route Gating

Status: Started
Date: 2026-04-19
Scope: make launch-scope native route exposure explicit without changing web behavior

## Source of truth

The reviewer/demo path list in:

- `docs/plans/2026-04-19-phase1-native-scope-matrix.md`

is the single source of truth for native launch route exposure.

## What started in repo

- Added `mobile/src/navigation/launchScope.ts` to centralize launch-scope tab and stack screens.
- Updated `mobile/src/navigation/TabsNavigator.tsx` to render tab routes from the launch-scope config.
- Updated `mobile/src/navigation/RootNavigator.tsx` to render non-tab launch routes from the same launch-scope config.

## Current effect

- Native route exposure is now explicit and centralized.
- Discover remains in native launch scope inside Chats.
- Deferred pages remain excluded from native navigation.
- No current web route behavior was changed.

## Deferred pages still excluded from native launch

- standalone `src/pages/Discover.tsx`
- AI Vet
- Hazard Scanner
- Legacy signup email confirmation
- Legacy subscription fallback

## Follow-on Phase 4 work

1. Keep any future native route additions aligned with the Phase 1 reviewer/demo path list.
2. Add route-level verification during the Phase 4/16 native QA pass.
3. Do not surface deferred pages in screenshots, reviewer notes, or demo flows.
4. Verify the current launch-scope route exposure against local iOS/Android native builds.
