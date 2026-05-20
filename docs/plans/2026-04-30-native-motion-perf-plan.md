# /app Native Motion + Performance Execution Plan

> **Authoring constraint:** This plan is written under `Read First.md` and `No Mistake Codex.md`. Every step honors the gates listed there. No drift, no invented tokens, no scope widening, no new packages without explicit approval, `/src` read-only, `/mobile` untouched, simulator proof required.
>
> **Date:** 2026-04-30
> **Scope:** `/app` native pages only. No `/src`. No `/mobile`.
> **Status until approved:** PLAN ONLY — no code changes until the user signs off on each phase.

---

## 0. Authority and constraint contract

This plan derives from:
- `Read First.md` — repo ownership, route ownership, design-system rule, simulator gate, web-to-native release gate, clean-commit boundary, simplify-before-adding gate, layer ownership, every-pass prevention gate, execution order, default constraints.
- `No Mistake Codex.md` — source-of-truth gate, app simulator truth gate, visual parity gate, shared native surface gate, dead UI code gate, token audit gate, target surface proof gate, behavior proof gate, shell and chrome gate, layer ownership, route ownership, sensitive flow, build/import/deploy.
- `app/huddle Design System/SKILL.md` and `colors_and_type.css` — canonical visual values.
- `app/src/theme/huddleDesignTokens.ts` — **active** native token sink (not the design system file directly).

Hard rules carried forward into every phase below:

1. **Token sink is `app/src/theme/huddleDesignTokens.ts`.** New shared values are added there; never in a screen file.
2. **No inventing tokens.** If a value cannot be expressed by an existing token and is not yet in the design system, it must be justified in the report with the exact missing need.
3. **No new package** unless the user explicitly approves it for the current pass. Each phase below names the package required (if any) and gates the phase on approval.
4. **`/src` is read-only.** Native motion/perf changes never touch `/src`.
5. **`/mobile` untouched** unless the user explicitly says otherwise.
6. **Simulator mirror gate** applies to every visible change.
7. **No new native page or route.** Every touched surface is already `COMPLETE` per `Read First.md`'s route status: `/`, `/notifications`, `/service`, `/carerprofile`, `/settings`, `/settings/security`, `/set-pet`, `/edit-pet-profile`, plus the `/support` and legal native pages. No new route work in this plan.
8. **No-permission change gate.** Behavior, geometry, ownership, data contracts must not change unless the scoped fix strictly requires it.
9. **Modal primitive contract.** Any motion change inside a modal still uses `app/src/components/nativeModalPrimitives.tsx` + `nativeModalPrimitives.styles.ts`.
10. **Reporting.** Every phase ends with the proof bundle from `Read First.md` §13 + the gate checklist from §16.

---

## 1. Constraint-aware re-read of the prior audit

The earlier audit recommended adding `expo-haptics`, `expo-image`, `react-native-reanimated`, `@shopify/flash-list`, `react-native-keyboard-controller`, and `react-native-bottom-sheet`. Under `Read First.md` rules:

- Each of those is a **new package** → requires explicit user approval per simplify-before-adding gate.
- `react-native-reanimated` adds a **babel plugin** → native build config change.
- `expo-image` swaps a primitive used by ~10 screens → triggers no-permission change gate per surface.
- `@shopify/flash-list` swaps `ScrollView` + `.map()` to virtualized list → behavior change (re-mount, recycle) → must prove parity per surface.

The plan therefore breaks the work into **two tiers**:

- **Tier A — Zero-dependency native polish (default).** Uses what's already installed. Safest. Approval gate is per-phase, not per-package. Can ship today.
- **Tier B — Dependency-gated upgrades.** Each new package is its own approval line. Cannot proceed until the user signs off on the package. Each carries simulator proof + commit-boundary checks + behavior parity proof.

Already installed (per `app/package.json`):
- `react-native-gesture-handler` ^2.30.0
- `react-native-safe-area-context` ^5.6.2
- `react-native-screens` ^4.23.0
- `@react-native-community/blur` ^4.4.1 (used by `NativeBottomNav.tsx`)
- `expo-image-picker` ~17.0.8
- `expo-linear-gradient` ~15.0.8
- `expo-status-bar` ~3.0.9

Not installed (Tier B):
- `react-native-reanimated`
- `expo-haptics`
- `expo-image`
- `@shopify/flash-list`
- `react-native-keyboard-controller`
- any bottom-sheet library

---

## 2. Pre-flight (no behavior change, no new dep)

Goal: extend `huddleDesignTokens.ts` with the missing motion contract from the design system. This is the **only** way later phases can express timings without page-local constants. Justified per "Hard gate: no invented design systems."

**Justification per token rule:**

- *Exact missing need:* motion durations and easing curves used by existing native UI (and required by every animation phase below) are documented in `app/huddle Design System/colors_and_type.css` as `--dur-micro/fast/base/slow/enter` and `--ease-out/std/in`, but the active app theme `app/src/theme/huddleDesignTokens.ts` does not export them. Today, the one screen using `Animated` (`NativeSignupScreen.tsx`) hardcodes timings.
- *Why existing tokens cannot cover it:* `huddleSpacing`, `huddleType`, etc. cover space and type only. There is no motion namespace yet.
- *Source-of-truth behavior supported:* the design-system motion contract.
- *Shared file where added:* `app/src/theme/huddleDesignTokens.ts`.

Pre-flight deliverable:

```ts
// added to app/src/theme/huddleDesignTokens.ts
export const huddleMotion = {
  durations: {
    micro: 75,
    fast: 150,
    base: 200,
    slow: 300,
    enter: 350,
  },
  easings: {
    // Stored as cubic-bezier coefficients so consumers can adapt to any animation runtime.
    out: [0.22, 1.0, 0.36, 1.0],
    standard: [0.4, 0.0, 0.2, 1.0],
    in: [0.55, 0.0, 1.0, 0.45],
  },
} as const;

export const huddleHaptics = {
  // Intent → semantic name. Phase 1B wires the actual library to these intents.
  selectTab: "selection",
  toggleControl: "selection",
  primaryConfirm: "impact-medium",
  destructive: "impact-heavy",
  success: "notification-success",
  error: "notification-error",
} as const;
```

Both objects are inert constants. Adding them does not animate anything, does not import any new package, and does not alter rendered UI. They become the canonical names every later phase references.

**Pre-flight gate checklist:**
- Files touched: `app/src/theme/huddleDesignTokens.ts` only.
- New package: none.
- Web touched: no.
- `/mobile` touched: no.
- Behavior change: none (constants only).
- Simulator proof: not required (no rendered change). Confirmed via typecheck only.
- Commit: single file. `git diff --check` clean.

---

## 3. Phase order and approval gates

| Phase | Surface | Tier | New package required | Approval needed before start |
|---|---|---|---|---|
| **0** | Token sink: add `huddleMotion` + `huddleHaptics` to `huddleDesignTokens.ts` | A | none | yes — confirms token additions |
| **1A** | `GestureHandlerRootView` at app root | A | none (already installed) | yes |
| **1B** | Add `expo-haptics` and wire it through `huddleHaptics` intents on existing controls | B | `expo-haptics` | yes — package + per-screen list |
| **2** | `expo-image` swap on read-heavy screens | B | `expo-image` | yes — package + per-screen list |
| **3** | `react-native-reanimated` foundation + babel plugin (ship empty, no animations yet) | B | `react-native-reanimated` | yes — package + babel config |
| **4** | Reanimated polish #1 — bottom-nav active-tab spring pill | B | depends on Phase 3 | yes |
| **5** | Reanimated polish #2 — pet carousel scale-on-snap on `NativeHomeScreen` | B | depends on Phase 3 | yes |
| **6** | Reanimated polish #3 — collapsing hero on `NativeCarerProfileScreen` (and parity on `NativeProfileSummaryScreen`) | B | depends on Phase 3 | yes |
| **7** | Reanimated polish #4 — shimmer skeletons replacing static loading boxes (Home, Service, Notifications, Profile Summary) | B | depends on Phase 3 | yes |
| **8** | `@shopify/flash-list` migration on `NativeServiceScreen` provider list | B | `@shopify/flash-list` | yes |
| **9** | `react-native-keyboard-controller` swap-in for the 6 KAV consumers | B | `react-native-keyboard-controller` | yes |
| **10** | Stretchy-hero pull-to-refresh (Home + Service) | B | depends on Phase 3 | yes |
| **11** | Lightweight cleanups: chevron → Feather icon in `NativePageHeader`; `removeClippedSubviews`/`decelerationRate="fast"` on long ScrollViews; `enableScreens()` confirmation; `StatusBar` audit; `useWindowDimensions` standardisation; `InteractionManager.runAfterInteractions` for Home secondary loads | A | none | yes — but cheapest pass |

Each phase below has its own scope, files touched, gates, and proof bundle. **No phase begins without explicit user approval naming that phase number.**

---

## 4. Phase 0 — Token sink (Tier A)

Already specified in §2. This is the only phase that needs no further review beyond confirming the token names. Once approved:

- Edit `app/src/theme/huddleDesignTokens.ts` — append the two const blocks.
- Run `npx tsc --noEmit` (or repo-equivalent typecheck) inside `/app`.
- Commit: `app/src/theme/huddleDesignTokens.ts` only.

**Proof bundle:**
- FILES CHANGED: `app/src/theme/huddleDesignTokens.ts`
- WEB SRC TOUCHED: no
- BEHAVIOR CHANGED: no
- SIMULATOR PROOF: not required (no UI)
- TYPECHECK: pass
- LINT: pass
- SAFE TO PUSH: yes
- SAFE TO DEPLOY LIVE: yes (no runtime change)

---

## 5. Phase 1A — `GestureHandlerRootView` at app root (Tier A)

**Goal.** Wrap `App.tsx`'s root in `<GestureHandlerRootView style={{ flex: 1 }}>` so every existing gesture moves to native thread (uses already-installed `react-native-gesture-handler`).

**Files touched.**
- `app/App.tsx` — wrap the existing root return in `GestureHandlerRootView`.

**No-permission gate.** Confirms that the wrapper does not change rendered output, navigation, deep-link routing, or layout. `App.tsx` line-by-line inspection required first.

**Source-of-truth gate.** Web's gesture model differs structurally; this is purely a native-shell change. `LAYERS INSPECTED`: `app` (only). `LAYERS TOUCHED`: `app`. `ROOT OWNER`: native-shell.

**Simulator proof.** Required:
- Open the app cold; verify Home renders.
- Pull-to-refresh on Home; verify it still works.
- Open Service screen; tap a provider; back-swipe; verify gestures still respond.
- Open Settings drawer; close it.
- Confirm web-shell route (`/subscription`) still loads inside `WebShellScreen` without gesture lockups.

**Acceptance.**
- App boots without crash.
- All existing pressables, scrolls, modals, and drawers still work.
- No visual change.
- No new package.

**Proof bundle.**
- FILES CHANGED: `app/App.tsx`
- WEB SRC TOUCHED: no
- ROUTE OWNERSHIP CHANGED: no
- SHELL OWNERSHIP CHANGED: no (this is a passive wrapper)
- SIMULATOR PROOF: pass (record the five checks above)
- LINT/TYPECHECK: pass
- SAFE TO PUSH: yes
- SAFE TO DEPLOY LIVE: yes

---

## 6. Phase 1B — `expo-haptics` (Tier B, new package)

**Approval required:** the package, and the exact list of screens/controls below.

**Goal.** Wire haptics through the `huddleHaptics` intents from Phase 0. Every haptic call references the shared intent name; no screen calls `Haptics.impactAsync(...)` with a raw style.

**New shared helper.** Add `app/src/lib/nativeHaptics.ts` with one exported function per intent:

```ts
import * as Haptics from "expo-haptics";

export const haptic = {
  selectTab: () => Haptics.selectionAsync(),
  toggleControl: () => Haptics.selectionAsync(),
  primaryConfirm: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  destructive: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
```

This is the only file allowed to import `expo-haptics`. Every other file imports `haptic.*` from `nativeHaptics.ts`. Centralised so the lib can be swapped or no-oped without touching screens.

**Files touched (per-screen list, locked).**
- `app/src/lib/nativeHaptics.ts` — new file.
- `app/src/components/NativeBottomNav.tsx` — `haptic.selectTab()` on tab press.
- `app/src/components/NativeSettingsDrawer.tsx` — `haptic.selectTab()` on row press.
- `app/src/screens/NativeServiceScreen.tsx` — `haptic.toggleControl()` on bookmark toggle and on filter chip toggle; `haptic.primaryConfirm()` on filter "Apply"; `haptic.destructive()` on "Clear filters" if it exists.
- `app/src/screens/NativeNotificationsScreen.tsx` — `haptic.toggleControl()` on read/dismiss.
- `app/src/screens/NativeHomeScreen.tsx` — `haptic.selectTab()` on pet carousel snap.
- `app/src/screens/NativeAuthScreen.tsx` — `haptic.success()` on sign-in success; `haptic.error()` on validation error.
- `app/src/screens/NativeSignupScreen.tsx` — `haptic.error()` on validation error; `haptic.success()` on step completion.
- `app/src/screens/NativeSecuritySettingsScreen.tsx` — `haptic.success()` on password change success; `haptic.error()` on failure; `haptic.toggleControl()` on biometric toggle.
- `app/src/screens/NativeSupportScreen.tsx` — `haptic.success()` on submit success; `haptic.error()` on validation/error.
- `app/src/screens/NativeManageSubscriptionScreen.tsx` — `haptic.toggleControl()` on plan select.
- `app/src/screens/NativeSetPetScreen.tsx`, `NativePetDetailsScreen.tsx`, `NativeCarerProfileScreen.tsx` — `haptic.success()` / `haptic.error()` on save outcomes.
- `app/package.json` + lockfile.

**Read First gates honored:**
- Modal/input gate: any haptic on a modal control still goes through the existing `nativeModalPrimitives` → no new modal style.
- No-permission gate: behavior unchanged; haptics are *additive* feedback only. No control changes function or label.
- Sensitive-flow gate: auth, payments, security, identity — haptics on these need explicit approval to call `expo-haptics` near the auth/Stripe flows. The plan keeps haptics OUT of the actual mutation moment (no haptic between `signInWithPassword` request and response). Haptic fires only on the final state transition (`success`/`error`), never inside an in-flight request.
- Simplify-before-adding: only one new file (`nativeHaptics.ts`); no parallel handler families.

**Per-screen verification.**
For each touched screen, the pass must:
1. Read web source-of-truth file in `/src` line-by-line for the matching surface to confirm no behavior change is implied (Code parity gate).
2. Read the `/app` screen line-by-line for the touched control.
3. Add the single haptic call at the press handler.
4. Run simulator on iOS to verify the haptic fires.
5. Run on a physical iOS device for at least one representative case (haptics require device proof per `Read First` "Web-to-native release gate" §12).

**Acceptance.**
- Six intent names cover every touched control. No raw `Haptics.*` calls outside `nativeHaptics.ts`.
- No control's label, position, ownership, or behavior changed.
- No new color/spacing/typography token added.
- Lockfile and `package.json` show only the `expo-haptics` addition.

**Proof bundle.**
- FILES CHANGED: list each touched screen.
- WEB SRC TOUCHED: no.
- BEHAVIOR CHANGED: no (additive feedback only).
- ROUTE OWNERSHIP CHANGED: no.
- SHELL OWNERSHIP CHANGED: no.
- SIMULATOR PROOF: per-screen pass list.
- PHYSICAL DEVICE PROOF: pass (haptic requires real device).
- TYPECHECK / LINT / BUILD: pass.
- SAFE TO PUSH / DEPLOY LIVE: yes.
- CI/EAS REPRODUCIBLE FROM GIT: yes.

---

## 7. Phase 2 — `expo-image` swap (Tier B, new package)

**Approval required:** the package and the per-screen list below.

**Goal.** Replace stock `<Image>` with `expo-image` on read-heavy screens for: persistent disk cache, native fade-in, priority loading. **Static bundled assets keep `<Image>` from `react-native`** — no need to swap.

**Files touched (locked, remote-image only).**
- `app/src/screens/NativeHomeScreen.tsx` — avatar (`profile.avatar_url`), pet carousel (`pet.photo_url`).
- `app/src/screens/NativeServiceScreen.tsx` — provider photo + bookmark thumbnail.
- `app/src/screens/NativeCarerProfileScreen.tsx` — gallery + avatar.
- `app/src/screens/NativeProfileSummaryScreen.tsx` — avatar.
- `app/src/screens/NativeSetPetScreen.tsx` — pet photo if remote; if local URI from `expo-image-picker`, keep stock `<Image>`.
- `app/src/components/NativePetDetailsContent.tsx` — pet photo.
- `app/src/components/service/NativeCarerProfileContent.tsx` — provider gallery.
- `app/package.json` + lockfile.

**Stays on stock `<Image>`:**
- `NativeAuthScreen.tsx` (logo, Apple icon, hero illustration — bundled assets).
- `NativeSignupScreen.tsx` (illustrations).
- All static design-system assets (`Polaroid.png`, etc.).

**`huddleImageDefaults` token addition.** Per the no-invented-tokens rule, the default `transition`, `cachePolicy`, and `contentFit` constants are added once to `huddleDesignTokens.ts`:

```ts
export const huddleImageDefaults = {
  transition: huddleMotion.durations.fast, // 150
  cachePolicy: "memory-disk" as const,
  contentFit: "cover" as const,
};
```

Every `expo-image` callsite spreads these defaults, then overrides only what differs (e.g. `priority="high"` on the hero card, `priority="low"` on list thumbnails).

**Behavior parity (no-permission gate).**
- Same `source={{ uri }}`.
- Same `style`/`resizeMode` semantics — `expo-image`'s `contentFit="cover"` matches `resizeMode="cover"`.
- Loading/empty/error states unchanged. If a screen had no error state for `<Image>`, do not add one.
- `Image.prefetch` is replaced by `Image.prefetch` from `expo-image` only at the same callsites where the old API is used (none observed in current screens).

**Performance acceptance.**
- Cold-launch service list scroll improves measurably (subjective: photos no longer pop in).
- Re-launch app: avatars/photos appear instantly from disk cache.

**Proof bundle.**
- FILES CHANGED: list.
- WEB SRC TOUCHED: no.
- BEHAVIOR CHANGED: no (visual fade is additive; same source URIs).
- VISUAL PARITY PROOF: same crop, same aspect, same placement; record a screenshot per touched screen before/after.
- SIMULATOR PROOF: pass per screen.
- LINT/TYPECHECK/BUILD: pass.
- SAFE TO PUSH / DEPLOY LIVE: yes.

---

## 8. Phase 3 — `react-native-reanimated` foundation (Tier B, new package + babel plugin)

**Approval required:** the package, the babel plugin, and confirmation that no animation will ship in this phase. Phase 3 only installs the runtime; animation work happens in Phases 4–7 and 10.

**Files touched.**
- `app/babel.config.js` — append `react-native-reanimated/plugin` as the **last** plugin (per Reanimated docs).
- `app/package.json` + lockfile.
- No screen changes.

**Why this is its own phase.** Adding the babel plugin can break Metro caches and hot reload. We isolate the change so a regression here cannot be confused with an animation bug in a later phase.

**Source-of-truth gate.** Reanimated does not change web source. `LAYERS INSPECTED`: `app`. `LAYERS TOUCHED`: `app` (config only). `ROOT OWNER`: native-config.

**Acceptance.**
- App still boots cold on iOS simulator.
- App still boots cold on Android simulator.
- Hot reload still works.
- No screen renders differently.
- `expo doctor` shows no warnings.

**Proof bundle.**
- FILES CHANGED: `app/babel.config.js`, `app/package.json`, lockfile.
- WEB SRC TOUCHED: no.
- BEHAVIOR CHANGED: no (no screen edits).
- SIMULATOR PROOF: cold boot pass on both platforms; warm reload pass.
- METRO CACHE RESET: confirm `npx expo start --clear` once after install.
- LINT/TYPECHECK/BUILD: pass.
- EAS BUILD CHECK: optional but encouraged for one preview build to confirm the plugin compiles for release.
- SAFE TO PUSH: yes only after both simulator boots succeed.
- SAFE TO DEPLOY LIVE: gated on EAS preview build pass.

---

## 9. Phases 4–7 — Reanimated polish (Tier B, depends on Phase 3)

Each polish phase is a separate approval line. Each phase below shares the same gating template.

### Per-phase template (applies to 4, 5, 6, 7, 10)

1. **Source-of-truth read.** Read `/src` line-by-line for the equivalent web behavior of the screen being touched. Confirm the animation does not contradict any web data flow, geometry, or callback. Animation is additive only.
2. **Native code read.** Read the `/app` screen line-by-line. List what must remain unchanged.
3. **Add motion using shared tokens only.** All `withTiming` durations come from `huddleMotion.durations.*`. All `withSpring` configs go in a new shared helper at `app/src/lib/nativeAnimations.ts` (added on Phase 4 and reused thereafter). No page-local timings.
4. **No new visual values.** Animations animate existing tokenized properties. If a new color/border/shadow seems needed, stop — that's a separate token-addition request.
5. **Reduced-motion respect.** Each animated component checks `useReducedMotion()` (Reanimated hook) and short-circuits to the final value with no animation. Listed in every phase's acceptance.
6. **Simulator proof.** Record a screen capture before and after the change.
7. **Physical device check** for any animation that depends on 120Hz, ProMotion, or refresh-rate behavior.
8. **Commit boundary.** Only the touched files staged. `git diff --cached --name-only` reviewed before commit.
9. **Proof bundle** per `Read First.md` §13.

### Phase 4 — Bottom-nav active-tab spring pill

**Surface:** `app/src/components/NativeBottomNav.tsx` only.

**Change:** Replace color-only active state with a `translateX`-animated pill (`withSpring`) sliding under the active tab. Keep `BlurView` chrome and tab labels unchanged.

**Files touched:** `NativeBottomNav.tsx`, `app/src/lib/nativeAnimations.ts` (new shared helper).

**No-permission gate:**
- Tab labels unchanged.
- Tab routes unchanged.
- Tab order unchanged.
- Tap target size unchanged.
- Hit area unchanged.

**Reduced-motion:** if reduced, pill jumps instantly. No spring.

**Acceptance:** pill snaps cleanly between five tabs; no shadow or color token added; `withSpring` config sourced from `nativeAnimations.ts`.

### Phase 5 — Pet carousel scale-on-snap

**Surface:** `app/src/screens/NativeHomeScreen.tsx` pet carousel only.

**Change:** Active card scales 1.0 → 1.04, inactive cards fade to 0.7 opacity. Driven by `useAnimatedScrollHandler` on the existing carousel `ScrollView`.

**Files touched:** `NativeHomeScreen.tsx` (carousel block only — keep all other handlers identical).

**No-permission gate:**
- Card data, navigation, and tap behavior unchanged.
- Carousel snap geometry unchanged.
- "Add pet" empty state untouched.

**Reduced-motion:** scale and opacity stay at 1.0; no transform.

### Phase 6 — Collapsing hero on Carer Profile and Profile Summary

**Surfaces:**
- `app/src/screens/NativeCarerProfileScreen.tsx` — hero photo collapses on scroll; nav title fades in when hero clears safe area.
- `app/src/screens/NativeProfileSummaryScreen.tsx` — same treatment for parity.

**Change:** Use `useAnimatedScrollHandler` on the existing `ScrollView`. Apply `translateY` + `scale` + `opacity` interpolations to the hero. Apply opposing fade to the title in `NativePageHeader` *only when wrapped in this scope* — do **not** modify `NativePageHeader` itself; instead pass an animated style override or an opacity prop. If the header doesn't accept an animated prop, add a minimally scoped one to that header *only after explicit approval*.

**Files touched:** the two screens. `NativePageHeader.tsx` only if approved separately.

**No-permission gate:**
- Hero geometry, content, taps unchanged at scrollY=0.
- Title text unchanged.
- Back button unchanged.
- Scroll content unchanged.

**Reduced-motion:** hero stays at full height; title visible from start.

### Phase 7 — Shimmer skeletons

**Surfaces:** loading states on `NativeHomeScreen`, `NativeServiceScreen`, `NativeNotificationsScreen`, `NativeProfileSummaryScreen`.

**Change:** Replace static grey loading boxes with a Reanimated translateX-loop shimmer over a `LinearGradient`. Keep dimensions and parent layout identical.

**Files touched:** the four screens. Optional: extract `NativeShimmerSkeleton.tsx` into `app/src/components/` if reuse is clean. Decision deferred to read-time per simplify-before-adding gate.

**No-permission gate:** skeleton dimensions match current loading-card dimensions exactly.

**Reduced-motion:** shimmer is a static gradient; no animation.

---

## 10. Phase 8 — `@shopify/flash-list` on Service provider list (Tier B)

**Approval required:** package + the one screen.

**Surface:** `app/src/screens/NativeServiceScreen.tsx` provider list only. No other list converted in this phase.

**Why this list first:** it's the longest unbounded list (50+ providers possible) and the most scroll-heavy in the app.

**Change:** Replace the current provider-mapping `ScrollView` block with `<FlashList>`. Keep `RefreshControl` wired to it. Estimate `estimatedItemSize` from a measured render. Keep keys stable.

**No-permission gate:**
- Provider card content, geometry, taps unchanged.
- Filter modal, sort modal, dates modal untouched.
- Bookmark behavior unchanged.
- Empty state unchanged.

**Behavior parity proof.** The list must:
- Render the same providers in the same order.
- Open the same provider profile modal on tap.
- Trigger the same `incrementNativeServiceProviderView` callback.
- Survive a scroll-to-end without `onEndReached` being implicitly added (we do not add pagination in this phase).

**Acceptance:**
- Scrolling 50+ providers feels glassy.
- No card flickers on recycle (FlashList footgun: unstable `key`s cause flicker — must verify).
- No memory growth across 5 minutes of scroll.

**Proof bundle:** standard Tier B bundle + `MEMORY GROWTH OBSERVED: no` line.

---

## 11. Phase 9 — `react-native-keyboard-controller` (Tier B)

**Approval required:** package + the six KAV consumers.

**Goal.** Replace `KeyboardAvoidingView` in: `NativeAuthScreen`, `NativeCarerProfileScreen`, `NativeSignupScreen`, `NativeServiceScreen`, `NativeSetPetScreen`, `NativeSupportScreen`.

**Change:** Wrap each screen with `KeyboardProvider` (root once) and replace `KeyboardAvoidingView` with `KeyboardAvoidingView` from `react-native-keyboard-controller` (drop-in API match) or `KeyboardStickyView` where the input must hug the keyboard.

**Files touched:**
- `app/App.tsx` — once, for `KeyboardProvider` (sits inside the existing `GestureHandlerRootView` from Phase 1A).
- Each of the six screens.

**No-permission gate:** each form's tab order, validation, error placement, submit button position must remain identical.

**Sensitive-flow gate:** Auth and Signup screens are sensitive flows. Each requires:
- Local code proof.
- Local runtime proof on iOS sim.
- Live runtime proof on iOS device (real keyboard latency cannot be proven on simulator).
- Live runtime proof on Android device.

**Acceptance:** keyboard follow runs at 60fps on iOS / Android; no jump on dismiss; existing iOS-only `behavior="padding"` parity maintained on iOS; Android no longer has keyboard flicker.

---

## 12. Phase 10 — Stretchy hero on pull-to-refresh (Tier B, Reanimated)

**Surfaces:** `NativeHomeScreen` and `NativeServiceScreen`.

**Change:** When `useAnimatedScrollHandler` reads `contentOffset.y < 0`, scale the hero by a clamped factor. `RefreshControl` still owns the actual refresh trigger; the stretch is decorative only.

**No-permission gate:** the refresh trigger threshold and behavior must not change. The visual stretch is purely additive.

**Acceptance:** stretching feels native iOS; no double-fire of refresh; Android `RefreshControl` unaffected.

---

## 13. Phase 11 — Lightweight cleanups (Tier A, no new dep)

A grouped, near-zero-risk pass. Each item is small, but each still gets a no-permission and source-of-truth check.

| Item | File | Risk |
|---|---|---|
| Replace 3-View chevron with `<Feather name="chevron-left" />` | `NativePageHeader.tsx` | low; verify exact stroke/size matches |
| `removeClippedSubviews` + `decelerationRate="fast"` on long ScrollViews | `NativeHomeScreen.tsx`, `NativeServiceScreen.tsx`, `NativeNotificationsScreen.tsx`, `NativeCarerProfileScreen.tsx`, `NativeProfileSummaryScreen.tsx`, `NativeSetPetScreen.tsx`, `NativeSignupScreen.tsx` | low; verify items still render on Android |
| Confirm `enableScreens()` is called before navigation initializes | `App.tsx` | low; pure import-side-effect call |
| `<StatusBar>` consistency audit | every screen with non-canvas hero | low |
| Switch any `Dimensions.get('window')` to `useWindowDimensions()` | grep first; only swap if found | low |
| `InteractionManager.runAfterInteractions` to defer Home secondary loads (notifications count, wallet) | `NativeHomeScreen.tsx` only | medium; behavior gate — defer the *fetch*, not the *display* |

**Defer-load no-permission gate.** The `InteractionManager` change is the most behavior-relevant cleanup. The plan only defers fetches that are not blocking initial paint. If a fetch is required for the initial card visible to the user, it does not move. The deferred set is limited to: notifications count badge, wallet balance, secondary recommendations.

**Acceptance:** all touched screens render and behave identically except the Home cold-launch perceived time.

---

## 14. Cross-phase reporting template

Every phase report MUST include the items below, copy-pasted verbatim into the PR description.

```text
PHASE: <number + name>

ROOT OWNER: native-shell | native-content | native-config
LAYERS INSPECTED: <list>
LAYERS TOUCHED: <list>

WEB SOURCE FILES READ LINE-BY-LINE:
- <list, or "n/a — pure native polish">
NATIVE FILES READ LINE-BY-LINE:
- <list>
CODE PARITY DRIFT FOUND: yes/no
CODE PARITY DRIFT PATCHED: yes/no
CODE PARITY RE-AUDIT PASSES: <count>
UNPATCHED PARITY GAPS: <list or "none">

NEW PACKAGE(S) ADDED: <name@version | none>
TOKEN(S) ADDED TO huddleDesignTokens.ts: <list | none>
TOKEN ADDITION JUSTIFICATION: <as required by Read First>

FILES CHANGED: <list>
PATCH DIFFS: <attached>
EXACT COMMANDS RUN: <list>
GIT STATUS BEFORE: <output>
GIT STATUS AFTER: <output>
STAGED FILES: <output of git diff --cached --name-only>
WEB PRODUCT FILES STAGED: yes/no
WHY ANY /src FILE IS STAGED: <reason or "n/a">
UNTRACKED IMPORTS LEFT: yes/no
CI/EAS REPRODUCIBLE FROM GIT: yes/no

PUSHED TO MAIN: yes/no
BACKEND DEPLOYED: yes/no (always no for native-only)
FRONTEND DEPLOYED: yes/no (always no for native-only)
ACTUALLY LIVE: yes/no
WHAT CAN BE TESTED RIGHT NOW: <description>

SIMULATOR PROOF: pass | fail | not verified
SIMULATOR PROOF NOTES: <per-screen breakdown>
PHYSICAL DEVICE PROOF: pass | fail | not required
PHYSICAL DEVICE PROOF NOTES: <if applicable>

LINT: pass/fail
TYPECHECK: pass/fail
BUILD: pass/fail

EVERY-PASS PREVENTION GATE CHECKLIST:
1. Scope gate: pass/fail
2. Code gate: pass/fail
3. Import gate: pass/fail
4. TDZ gate: pass/fail or n/a
5. Behavior gate: pass/fail
6. Failure-state gate: pass/fail
7. Persistence gate: n/a (no writes)
8. Copy gate: n/a (no copy changes)
9. Performance gate: pass/fail
10. Deploy gate: pass/fail or n/a

NATIVE ROADMAP STATUS:
- COMPLETE: <unchanged unless this phase touches a route owner>
- PARTIAL: <unchanged>
- PENDING NEXT: <unchanged>
- ROUTE STATUS CHANGED THIS PASS: no (this plan never changes route status)
- WEB BEHAVIOR CHANGED: no

REQUIRED COMPLETION LANGUAGE:
- Source of truth inspected: yes/no
- Visual parity proof: pass/fail/not verified
- Behavior proof: pass/fail/not verified
- Token changed: <token name | none>
- No-permission behavior preserved: yes/no
- Runtime proof: local/live/not verified
- Safe to push: yes/no
- Safe to deploy live: yes/no

CODE REMOVED/SIMPLIFIED: yes/no
DUPLICATE PATHS LEFT: yes/no
NEW DEPLOYMENT WEIGHT ADDED: yes/no (the new package, where applicable)
```

A phase that cannot return a "yes" on `Safe to push` and `Safe to deploy live` does not ship.

---

## 15. Risks and explicit non-goals

**Risks.**

- **Reanimated babel plugin** can trigger Metro cache issues. Mitigation: dedicated phase (3) before any animation; cold boot proof on both platforms before ship.
- **expo-image** swap can subtly change `resizeMode` interpretation if a screen relied on `cover`/`contain` semantics that don't map. Mitigation: per-screen visual diff in simulator + locked list of screens.
- **FlashList recycle bugs** on cards with mutable internal state. Mitigation: stable keys, `extraData` audit, scroll-stress test.
- **expo-haptics** on auth and Stripe flows could fire spuriously in failure modes. Mitigation: haptics fire only on terminal state transitions, never inside in-flight requests.
- **Keyboard-controller** changes IME positioning. Mitigation: per-screen runtime proof on both platforms; rollback path is one-line revert.

**Explicit non-goals (do not creep into this plan).**

- No new native screen, route, or content. Route status as documented in `Read First.md` is preserved.
- No `/src` edits. Web behavior must remain unchanged for every phase.
- No `/mobile` edits.
- No new color, typography, spacing, radius, shadow, or surface token unless the only-allowed motion/haptics/imageDefaults additions in Phase 0 / Phase 2.
- No replacement of `nativeModalPrimitives`. Every modal control inside touched screens must continue to use those primitives, animated or not.
- No new modal/sheet/drawer surface type swap.
- No premature performance work on lists that are not provably long (Notifications and Home pet carousel stay on `ScrollView`/`.map()` until they're proven to need virtualization).
- No "polish" of unrelated screens during a touched-screen pass.

---

## 16. Phase ordering rationale and minimum viable rollout

If the user wants the smallest first ship that demonstrates the direction:

- **Phase 0** (token sink) — zero risk; can ship today.
- **Phase 1A** (`GestureHandlerRootView`) — low risk; uses installed dep.
- **Phase 11** (lightweight cleanups) — low risk; no new dep.

That trio alone is shippable without any new package and gives:
- Tokenized motion contract for future work.
- Native-thread gestures.
- Free Android scroll perf, accessible chevron, status-bar consistency, and faster perceived Home cold-launch via interaction deferral.

After that, the value-density order is: Phase 1B (haptics) → Phase 4 (bottom-nav pill) → Phase 5 (pet carousel) → Phase 2 (expo-image) → Phase 7 (skeletons) → Phase 6 (hero collapse) → Phase 8 (FlashList) → Phase 9 (keyboard) → Phase 10 (stretchy hero).

Phases 1B onward each need explicit approval since they each add a new package or rely on Reanimated.

---

## 17. What this plan explicitly will NOT do without further approval

- Add any package not named in §3.
- Edit any file not named in the touched-files list of an approved phase.
- Touch `/src`, `/mobile`, or `/app/huddle Design System` runtime files.
- Modify any modal, sheet, or drawer surface beyond what an approved phase specifies, and only via shared primitives.
- Animate or polish surfaces that no approved phase has named.
- Ship a phase without simulator proof and (where the phase requires it) physical-device proof.
- Mark a phase complete without the §14 reporting template fully filled in.

---

## 18. Approval ask

To proceed, the user picks one of:

- **A)** Approve Phase 0 only (token sink). Zero-risk preflight, zero new packages.
- **B)** Approve Phase 0 + Phase 1A + Phase 11 as the "Tier A" no-new-package opening pass.
- **C)** Approve Phase 0 + 1A + 1B (haptics) — one new package (`expo-haptics`), highest perceived-quality gain per dollar.
- **D)** Approve a custom subset by listing phase numbers.

No code is written until one of the above is chosen.

---

*End of plan. This document is the single source of authority for the motion/perf direction in `/app`. Any drift from it must be flagged and approved before continuation, per `Read First.md` §1 "Core rule" and `No Mistake Codex.md` "Core Rule".*
