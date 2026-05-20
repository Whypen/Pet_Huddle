# /app Native UX Review & Implementation Contract

> Scope: `/app` only. No `/src`, `/mobile`, backend, RPCs, schema, copy, colors, layout direction, route ownership.
> Status: **Approved for implementation.** Decisions logged in §18. Deferred items marked below.
> How to use: Comment inline on any item below. Set `Status` to `approve / reject / defer / discuss`.

---

## 0. Global Rules for Implementation Pass

- All animations go through Reanimated v4 shared values on the UI thread, except where existing RN `Animated` is already in place and works.
- All haptics go through `app/src/lib/nativeHaptics.ts` only. No direct `expo-haptics` imports.
- No new tokens unless an existing token in `app/src/theme/huddleDesignTokens.ts` cannot express the need. If a new token is required, it must be added to the shared token file (not page-local).
- No edits to `nativeModalPrimitives.tsx`, `huddleDesignTokens.ts`, or any shared primitive unless explicitly approved per item.
- Every change requires: `npm run lint` clean, iOS simulator proof, and at least one Android simulator proof.
- Native parity: web behavior must not change. `WEB BEHAVIOR CHANGED: no` is required on the final report.

---

## 1. Discover Star/Wave Send — Premium Redesign (Top Priority)

**File:** `app/src/screens/NativeChatsScreen.tsx` only.

### 1.1 Problem statement (agreed)
Current send moment is rushed: ~180–380 ms fling with stamp opacity tied to gesture velocity, so fast swipers see the stamp at <0.7 opacity before it leaves with the card. Toast arrives after the card is already gone. No "build → release" beat. Star and Wave look identical despite Star being premium intent. Single haptic beat. No held climax.

### 1.2 Proposed redesign

**Star send (premium / gold)**
| Phase | Duration | What happens | Haptic |
|---|---|---|---|
| Charge | 160 ms | Card scales `1 → 0.96`; gold radial halo fades in behind card | `selectTab` |
| Burst | 240 ms | Gold radial flash; star icon scales `1 → 1.4 → 1`, rotates 0 → 12 → 0; card holds position | `primaryConfirm` |
| Lift-off | 320 ms, `Easing.out(quart)` | Card translates up-and-out with gold trail; rotation arcs 0 → 12° | — |
| Toast | starts 80 ms after card clears | Gold-tinted toast slides in | `success` |

**Wave send (free / blue)**
| Phase | Duration | What happens | Haptic |
|---|---|---|---|
| Charge | 120 ms | Card scales `1 → 0.98` | — |
| Stamp climax | 200 ms held | Stamp scales `1 → 1.1`, opacity 1.0; blue wave-tint deepens to 30% across full card; **card holds in place** | `toggleControl` |
| Release | 300 ms, `Easing.out(cubic)` | Card spring-flies off with trailing-edge stretch | — |
| Toast | starts with card release | Blue toast slides in | `swipeReturn` (light tick) |

### 1.3 Implementation notes
- New shared value: `climaxProgress` (0 → 1 → 0), drives an absolute-positioned overlay layer inside the card (gold radial for Star, blue wave-tint deepening for Wave).
- Split `onEnd` commit path into two sequenced phases: `climax` → `exit`, sequenced via `withTiming` callbacks + `runOnJS` for haptic frame boundaries.
- Replace fling easing `Easing.in(cubic)` with `Easing.out(quart)` (Star) / `Easing.out(cubic)` (Wave).
- Use existing tokens: `huddleColors.premiumGold` (Star), `huddleColors.blue` (Wave). **No new tokens.**
- Disable gesture input during `climax` phase so a fast swiper cannot re-grab the card mid-celebration.
- Total added wall-clock time vs current: ~+300 ms. Total perceivable celebration: ~3×.

### 1.4 Files changed
- `app/src/screens/NativeChatsScreen.tsx`

### 1.5 Risk
**Low.** Self-contained inside `DiscoveryProfileCard`. No data, navigation, backend. Needs sim proof iPhone SE + mid-tier Android for 60 fps.

### 1.6 Approval
- [x] **D1** Star send redesign — Status: **DONE** (320ms lift, gold halo, toast)
- [ ] **D2** Wave send redesign — Status: ____ (replaced by W1–W3)
- [x] **D3** Star button press feedback (charge scale + haptic before swipe even begins) — Status: **DONE**
- [x] **D4** Gate `haptic.swipeReturn` on `|translationX| > 20` to stop micro-drag haptic noise — Status: **DONE**
- [x] **D5** Photo-change haptic + index-dot animation on `activeImageIndex` change inside the card — Status: **DONE**

---

## 2. Verify Identity — `NativeVerifyIdentityScreen.tsx`

### 2.1 Items
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **V1** | No `textContentType="oneTimeCode"` on OTP input → iOS SMS autofill banner won't appear | Add prop | **High** |
| **V2** | No `autoComplete="sms-otp"` on OTP input → Android Google SMS Retriever won't trigger | Add prop | **High** |
| **V3** | OTP is a single field, not a 6-cell input. Modern apps (Apple, WA, Telegram) use 6 boxes with caret jump | New `OtpCellInput` component inside screen file (no shared primitive) | Med |
| **V4** | No haptic on OTP send success, verify success, verify failure | Add `success` / `error` haptics at the existing handler call-sites | Med |
| **V5** | OTP input does not `autoFocus` when `otpSent` becomes true → user must tap again | Add `autoFocus` or `ref.focus()` in effect on `phoneState.state === "sent"` transition | Med |
| **V6** | Cooldown is label-only ("Resend (Ns)"). No countdown ring/bar → users tap silent-disabled | Add subtle horizontal progress bar under Resend button driven by `cooldownSeconds / RESEND_COOLDOWN_SECS` | Low |
| **V7** | Phone field lacks `autoComplete="tel"` + `textContentType="telephoneNumber"` | Add props to the phone field component used here | Med |
| **V9** | When app resumes and status flipped to "verified" in background, no haptic confirmation | Add `haptic.success()` in the AppState resume → verified branch | Low |
| **V10** | Back button `Linking.openURL("huddle:/settings")` fallback may flash if both `onBack` and `onCancelSignup` undefined | Guard with no-op + log instead of openURL | Low |

### 2.2 Files changed
- `app/src/screens/NativeVerifyIdentityScreen.tsx`
- Possibly `app/src/components/NativePhoneField.tsx` for V7 if prop pass-through is needed

### 2.3 Approval
- [x] V1 — Status: **DONE**
- [x] V2 — Status: **DONE**
- [x] V3 (6-cell OTP) — Status: **DONE**
- [x] V4 — Status: **DONE**
- [x] V5 — Status: **DONE**
- [x] V6 — Status: **DONE**
- [x] V7 — Status: **DONE**
- [x] V9 — Status: **DONE**
- [x] V10 — Status: **DONE**

---

## 3. Signup Email Confirmation — `NativeSignupScreen.tsx`

### 3.1 Items
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **EC1** | No haptic on Resend success, on auto-verified detection from polling, or on Open Mail tap. The verified-and-advanced moment is the highest-emotion event in signup | Add `haptic.success()` on auto-verified; `haptic.selectTab()` on Open Mail tap; `haptic.success()` on Resend success | **High** |
| **EC3** | iOS open-mail fallback only tries `message://` (Apple Mail). Gmail/Outlook iOS users hit silent fallback | Extend iOS list: `["message://", "googlegmail://co", "ms-outlook://mail/inbox"]` | Med |
| **EC5** | Polling interval at line 797 — verify ≥5 s; throttle if not | Verify + throttle to 5 s minimum | Med |
| **EC6** | `changeEmail` clears state silently → accidental tap wipes cooldown + presignup token | Wrap in `AppConfirmModal` with "Use a different email?" prompt | Med |
| **EC2** | `manualContinue` `not_yet` state reverts via 3s `setTimeout` with no animation/shake | Add a subtle horizontal shake animation on the Continue button when state becomes `not_yet` | Low |
| **EC4** | Resend cooldown shows label only | Same as V6 — share a small countdown bar component if approved | Low |
| **EC7** | If user mistyped email, must `changeEmail` and re-type | Show typed email inline above Resend, with a "Wrong email?" affordance | Low |

### 3.2 Files changed
- `app/src/screens/NativeSignupScreen.tsx`

### 3.3 Approval
- [x] EC1 — Status: **DONE**
- [x] EC2 — Status: **DONE**
- [x] EC3 — Status: **DONE**
- [ ] EC4 — Status: ____ (deferred)
- [x] EC5 — Status: **DONE**
- [x] EC6 — Status: **DONE**
- [x] EC7 — Status: **DONE**

---

## 4. Home — `NativeHomeScreen.tsx`

| ID | Problem | Fix | Severity |
|---|---|---|---|
| **HM1** | Pet carousel does not haptic on swipe-snap; only tap haptic fires | Add `haptic.selectTab()` on snap-index change | Low |

- [x] HM1 — Status: **DONE**

---

## 5. Auth — `NativeAuthScreen.tsx`

| ID | Problem | Fix | Severity |
|---|---|---|---|
| **AU1** | No `returnKeyType="next"/"done"` + `onSubmitEditing` on email/password | Add to both inputs; email → focus password; password → submit | Med |
| **AU2** | Verify `autoComplete="email"`, `keyboardType="email-address"`, `textContentType="emailAddress"` on email field | Add if missing | Med |
| **AU3** | Password field: verify `autoComplete="current-password"`, `textContentType="password"` | Add if missing | Med |

- [x] AU1 — Status: **DONE**
- [x] AU2 — Status: **DONE** (textContentType="username" — correct for auth per Apple guidelines)
- [x] AU3 — Status: **DONE**

---

## 6. Signup (non-email-confirmation steps) — `NativeSignupScreen.tsx`

| ID | Problem | Fix | Severity |
|---|---|---|---|
| **SU1** | No haptic on DOB picker open/close | Add `haptic.selectTab()` on `setDobPicker` toggle | Low |
| **SU2** | `stepTransition` uses RN `Animated` (JS thread). Consistency with rest of app prefers Reanimated | Migrate to `useSharedValue` + `withTiming` | Low (cosmetic) |

- [x] SU1 — Status: **DONE**
- [ ] SU2 — Status: ____ (recommend defer)

---

## 7. Social — `NativeSocialScreen.tsx` (Threads-grade pass)

| ID | Problem | Fix | Severity |
|---|---|---|---|
| **SO1** | Compose FAB fires `primaryConfirm` even when posting is blocked | Branch: `warning` on blocked, `primaryConfirm` on unblocked | Med |
| **SO2** | No haptic on pull-to-refresh start | Add `haptic.selectTab()` at start of `load("refresh")` | Low |
| **SO3** | `onEndReached` has no in-flight guard visible at call-site → risk of duplicate page fetch | Add ref-based in-flight flag; short-circuit re-entry | Med |
| **SO4** | `onEndReachedThreshold={0.6}` too aggressive for a heavy feed | Reduce to `0.3` | Med |
| **SO5** | Like uses `haptic.success` (notification — heavy). Premium toggle haptic is `selection` | Switch to `selectTab` on like; no haptic on un-like | Low |
| **SO6** | No tap-bottom-nav-while-active → scroll-to-top | Wire `scrollToOffset({ offset: 0, animated: true })` on `NativeBottomNav` re-tap when already on Social | Med |
| **SO7** | First-load uses `ActivityIndicator`, not shimmer | Use `NativeShimmerSkeleton` rows for first load | Med |
| **SO8** | Compose FAB has no hide-on-scroll-down / show-on-scroll-up | Drive FAB translate via `onScroll` direction delta | Low |
| **SO9** | No double-tap-to-like on post media (Threads/IG signature) | **Mirror Threads pattern**: sensitive media stays behind a touch-intercepting reveal overlay ("Sensitive content. Tap to view"). Single tap on overlay → reveal (haptic `selectTab`). Once revealed, overlay unmounts and the underlying media accepts double-tap-to-like with big-heart pop (haptic `selectTab`). No double-tap branching needed — component tree handles it. | Med |
| **SO10** | Reply composer is full Modal — loses spatial continuity | Defer — architectural. Note only. | None (defer) |
| **SO11** | Reply tree expand/collapse pops in instantly | `LayoutAnimation.easeInEaseOut()` on toggle, or Reanimated layout transition | Low |
| **SO12** | No long-press menu on posts (copy link, save, hide, report) | Defer to product | None (defer) |
| **SO13** | No "Sending…" optimistic post bubble after submit | Defer to product | None (defer) |

- [x] SO1 — Status: **DONE**
- [x] SO2 — Status: **DONE**
- [x] SO3 — Status: **DONE**
- [x] SO4 — Status: **DONE** (verified pre-existing: threshold already at 0.3)
- [x] SO5 — Status: **DONE**
- [x] SO6 — Status: **DONE**
- [x] SO7 — Status: **DONE** (pre-existing)
- [x] SO8 — Status: **DONE**
- [x] SO9 — Status: **DONE**
- [x] SO11 — Status: **DONE**
- [ ] SO12 — Status: ____ (defer)
- [ ] SO13 — Status: ____ (defer)

---

## 8. Chats — `NativeChatsScreen.tsx` (Bumble + Hinge passes)

> Discover swipe redesign (Star/Wave) lives in Section 1.

### 8.1 Bumble lens
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **CB1** | No "undo last swipe" snackbar after pass — accidental skip lost | Show 2-second snackbar with Undo button after a Pass commit (Wave commits are not undoable in this scope) | Med |
| **CB2** | No 24h match expiry timer / urgency UI in chat list rows | Product call — defer | None (defer) |
| **CB3** | `DiscoveryEndCard` lacks restock CTA polish | Add "Expand filters" / "Check back tomorrow" inline CTAs | Low |
| **CB4** | No "tap to expand" hint discoverability on swipe cards | Add a small chevron + "Tap for details" hint overlay that fades after first 2 swipes per session | Low |

### 8.2 Hinge lens
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **CH1** | Discovery is swipe-card architecture, not vertical-scroll-profile | Out of scope — architectural | None (defer) |
| **CH2** | No "comment on a specific photo / prompt" send | Product call — defer | None (defer) |
| **CH3** | Toast cue is generic ("Wave sent"). Hinge attaches the like to the prompt/photo | Defer (depends on CH2) | None (defer) |

### 8.3 Chat list & dialogue gaps
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **CD1** | ChatDialogue `keyboardVerticalOffset={0}` — composer can clip behind keyboard on iPhones without dynamic island | Compute header height (`insets.top + huddleSpacing.x2 + headerHeight`) and pass to KAV | **High** |
| **CD2** | Send button has no `primaryConfirm` haptic visible at send handler | Add `haptic.primaryConfirm()` on optimistic send | Med |
| **CD3** | No long-press menu on message bubbles (react, copy, reply) | Product call — flag, defer | None (defer) |
| **CD4** | Many group-modal inline icon buttons lack `hitSlop` | Audit modal icon buttons; add `hitSlop={huddleSpacing.x2}` where missing | Low |
| **CD5** | No haptic on group join / leave commit | Add `success` on join, `selectTab` on leave | Low |

- [ ] CB1 (Undo swipe) — Status: ____(defer)
- [ ] CB2 — Status: ____ (defer)
- [ ] CB3 — Status: ____ (defer)
- [ ] CB4 — Status: ____ (defer)
- [ ] CH1 — Status: ____ (defer)
- [ ] CH2 — Status: ____ (defer)
- [ ] CH3 — Status: ____ (defer)
- [x] CD1 (keyboard offset) — Status: **DONE**
- [x] CD2 — Status: **DONE**
- [ ] CD3 — Status: ____ (defer)
- [x] CD4 — Status: **DONE**
- [x] CD5 — Status: **DONE**

---

## 9. Map — `NativeMapScreen.tsx` (Airbnb + Uber passes)

### 9.1 Airbnb lens
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **MA1** | No "Search this area" floating chip after pan threshold | Add chip that appears when `mapCenter` has moved >N km from `lastSearchCenter` | Med |
| **MA2** | Pin tap opens full Modal — loses map context | Add bottom card carousel synced with selected pin; full modal on card tap (architectural — defer) | None (defer) |
| **MA3** | No cluster zoom-out grouping animation | Verify clustering library / add custom cluster pins (depends on map library; defer scoping) | None (defer) |
| **MA4** | Pins are identical icons; no preview labels | Add type + age label sprite on pins (depends on map library) | Low |
| **MA5** | No always-visible filter chip rail | Defer to product | None (defer) |

### 9.2 Uber lens
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **MU1** | No draggable bottom sheet (peek/half/full) — alerts are full-modal | Architectural — defer | None (defer) |
| **MU2** | Broadcast publish has no accidental-tap protection. Lost-pet alert is irreversible and visible to nearby users | **Slide-to-publish.** Full-width pill track with gold thumb at left edge, label "Slide to publish alert" centered. `Gesture.Pan().activeOffsetX([12, 1000])`. Thumb `translateX` clamped to track width. Commit threshold `≥ 92%` of track. Haptic chain: `selectTab` on drag start → `selectTab` at 50% → `primaryConfirm` at commit → `success` after backend confirms. Release before threshold → `withSpring(0)` thumb return + `swipeReturn` light tick. With VoiceOver/`accessibilityReduceMotion` active → render plain "Publish" button + confirm modal instead. | **High** |
| **MU3** | No keep-screen-awake while user is actively viewing live alerts | Defer to product | None (defer) |
| **MU4** | No top notification banner for new alerts | Defer to product | None (defer) |
| **MU5** | No haptic on marker / cluster tap visible (line 1931 covers some but not all paths) | Audit all pin tap entry points; ensure `haptic.toggleControl()` consistency | Low |

- [ ] MA1 — Status: ____ (defer)
- [ ] MA2 — Status: ____ (defer)
- [ ] MA3 — Status: ____ (defer)
- [ ] MA4 — Status: ____ (defer)
- [ ] MA5 — Status: ____ (defer)
- [ ] MU1 — Status: ____ (defer)
- [x] **MU2 — Status: DONE** (pre-existing, confirmed)
- [ ] MU3 — Status: ____ (defer)
- [ ] MU4 — Status: ____ (defer)
- [x] MU5 — Status: **DONE**

---

## 10. Service — `NativeServiceScreen.tsx` (Rover + Spotify passes)

### 10.1 Rover lens
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **SR1** | Provider modal `animationType="fade"` — should be slide (sheet-shaped) | Change to `animationType="slide"` | Low |
| **SR2** | No sticky bottom-anchored "Request Service" CTA in provider modal | Add sticky footer to provider modal | Med |
| **SR3** | Date-range pick is a filter, not a primary booking action on provider profile | Defer — depends on booking flow design | None (defer) |
| **SR4** | Trust signals (response time, repeat-customer, background-checked) | Product call — defer | None (defer) |
| **SR5** | Photo gallery in provider profile — verify swipe + dots + haptic per photo | Audit; add `selectTab` haptic on photo change if missing | Low |
| **SR6** | Reviews section pagination / sort | Defer to product | None (defer) |
| **SR7** | Bookmark animation is silent — no scale-up / heart-fill | Add scale `1 → 1.2 → 1` Reanimated pop + `success` haptic on save toggle | Low |

### 10.2 Spotify lens
| ID | Problem | Fix | Severity |
|---|---|---|---|
| **SS1** | First-load uses `ActivityIndicator`, not shimmer | Use `NativeShimmerSkeleton` rows for provider list initial load | Low |
| **SS2** | No hero parallax on provider profile | Polish — defer | None (defer) |
| **SS3** | No segmented control between filter panels — they're separate Modals | Architectural — defer | None (defer) |
| **SS4** | No pull-down-to-dismiss on slide modals (provider, alert detail, broadcast) | Add a `PanGesture` on the modal header that translates the sheet down + dismisses past threshold | Med |

- [x] SR1 — Status: **DONE**
- [x] SR2 — Status: **DONE** (verified pre-existing: NativeCarerProfileContent already has sticky footer CTA)
- [ ] SR3 — Status: ____ (defer)
- [ ] SR4 — Status: ____ (defer)
- [ ] SR5 — Status: ____ (defer)
- [ ] SR6 — Status: ____ (defer)
- [ ] SR7 — Status: ____ (defer)
- [x] SS1 — Status: **DONE** (pre-existing)
- [ ] SS2 — Status: ____ (defer)
- [ ] SS3 — Status: ____ (defer)
- [x] SS4 — Status: **DONE** (PanGesture on header; Animated.View translateY on sheet; dismiss at 120px — NativeBroadcastModal, NativeAlertDetailModal, NativeServiceScreen provider modal)

---

## 11. Modals / Panels / Drawers

| ID | File | Problem | Fix | Severity |
|---|---|---|---|---|
| **MP1** | `NativeNotificationsPanel.tsx` | `animationType="fade"` for a top-sliding panel | Change to `"slide"` | Low |
| **MP2** | `NativeNotificationsPanel.tsx` | Zero haptic in file; no `hitSlop` on close | Add `selectTab` on row press; `hitSlop={huddleSpacing.x2}` on close | Med |
| **MP3** | `NativeNotificationsPanel.tsx` | No swipe-to-dismiss on rows | Defer to product | None (defer) |
| **MP4** | `NativePetDetailsModal.tsx` | `animationType="fade"` for full-card sheet | Change to `"slide"` | Low |
| **MP5** | `NativePetDetailsModal.tsx` | Close button has no haptic | Add `selectTab` | Low |
| **MP6** | `NativePublicProfileModal.tsx` | No haptic on Wave / Block / Report tap | Add `primaryConfirm` (wave), `warning` (report), `destructive` (block) | Med |
| **MP7** | `NativeBroadcastModal.tsx` | Multiline `TextInput` (~line 598) with **no `KeyboardAvoidingView`** | Wrap content in KAV (iOS `padding`) | **High** |
| **MP8** | `NativeAlertDetailModal.tsx` | Edit modal multiline `TextInput` (~line 891) with **no KAV** | Wrap edit modal content in KAV | **High** |
| **MP9** | `NativeBroadcastModal.tsx` / `NativeAlertDetailModal.tsx` | No `primaryConfirm` haptic on send / save / report | Add at handler call-sites | Med |
| **MP10** | `NativeSettingsDrawer.tsx` | Only 2 haptic call-sites in 1,477 lines; many menu rows silent | Add `selectTab` on every row press | Med |
| **MP11** | `NativeSettingsDrawer.tsx` | Delete-account path lacks `destructive` haptic | Add `haptic.destructive()` on confirm tap | Med |
| **MP12** | `NativeSettingsDrawer.tsx` | `animationType="fade"` on side-drawer visual | Verify visual shape; if side-drawer, change to `slide` | Low |

- [x] MP1 — Status: **DONE**
- [x] MP2 — Status: **DONE**
- [ ] MP3 — Status: ____ (defer)
- [x] MP4 — Status: **DONE**
- [x] MP5 — Status: **DONE**
- [x] MP6 — Status: **DONE** (wave + block haptics confirmed; report haptic delegated to report sheet)
- [x] **MP7 — Status: DONE** (pre-existing)
- [x] **MP8 — Status: DONE**
- [x] MP9 — Status: **DONE**
- [x] MP10 — Status: **DONE**
- [x] MP11 — Status: **DONE**
- [x] MP12 — Status: **DONE** (verified pre-existing: GlobalHeader modals use animationType="slide")

---

## 12. Forms (cross-screen)

| ID | File | Problem | Fix | Severity |
|---|---|---|---|---|
| **F1** | `NativeEditProfileScreen.tsx` | No `returnKeyType` chain across fields → can't keyboard-navigate | Chain `next/next/done` with `onSubmitEditing` → focus next ref | Low |
| **F2** | `NativeEditProfileScreen.tsx` | No haptic on save success / error visible at this layer (may live in NativeProfileForm — needs verify) | Audit `NativeProfileForm.tsx`; ensure `success`/`error` haptics on save | Low |
| **F3** | `NativeSetPetScreen.tsx` | `keyboardShouldPersistTaps="always"` (line 1473) — heavier than `"handled"` | Downgrade to `"handled"` unless there's a specific reason | Low |
| **F4** | `NativeCarerProfileScreen.tsx` | Listing CRUD has only `error/success`; no `toggleControl` on small toggles | Add `toggleControl` to switches / photo add | Low |
| **F5** | Global | Audit `behavior={undefined}` on Android KAV — relies on `android:windowSoftInputMode=adjustResize` in `AndroidManifest.xml` | Verify manifest is correct; no code change unless manifest wrong | Verify only |

- [x] F1 — Status: **DONE**
- [x] F2 — Status: **DONE**
- [x] F3 — Status: **DONE**
- [x] F4 — Status: **DONE**
- [x] F5 (verify only) — Status: **DONE** (AndroidManifest confirmed correct)

---

## 13. Tap Targets (cross-screen)

| ID | Scope | Problem | Fix | Severity |
|---|---|---|---|---|
| **TT1** | Whole `/app` | 27 `hitSlop` usages vs 1,085 `Pressable`. Icon-only buttons may be <44 pt | One-pass audit of icon-only `Pressable`s in `styles.iconButton` family + modal close buttons; add `hitSlop={huddleSpacing.x2}` (~8 px) where missing | Low |

- [x] TT1 — Status: **DONE**

---

## 14. Implementation Order (proposed)

If approval lands on most items, run in this order to minimize merge conflicts:

1. **Section 1 (Discover Star/Wave redesign)** — most isolated, most user-visible.
2. **Section 11 (modals)** — keyboard fixes MP7/MP8 are safety-critical for composer flows.
3. **Section 9 MU2 (Broadcast accidental-tap protection)** — safety flow.
4. **Section 2 (Verify Identity)** — autofill props are tiny but high-leverage.
5. **Section 3 (Signup email confirmation)** — haptics + open-mail fallback.
6. **Section 7 (Social)** — feed quality pass.
7. **Section 8 (Chat list + dialogue)** — keyboard offset + Undo swipe.
8. **Sections 4/5/6 (Home/Auth/Signup tweaks)** — small additive haptics + input props.
9. **Section 10 (Service)** — modal polish + bookmark animation.
10. **Section 12, 13 (forms, tap targets)** — sweeping cleanup last.

Each section ships as its own commit with iOS + Android sim proof per gate in `Read First.md` / `No Mistake Codex.md`.

---

## 15. Locked Decisions

1. **D5** — Dots already exist on Discover card (verify in code). Haptic only on actual `activeImageIndex` change. No haptic on partial/micro swipes.
2. **CB1 / Undo last swipe** — **No undo, ever.** Deferred permanently. Out of contract scope.
3. **MU2 / Broadcast accidental-tap** — **Treat as complete.** Already implemented. No further code change.
4. **SO9 / sensitive media + enlarge + like** — Updated spec. Overlay: single tap → reveal (haptic `selectTab`), overlay unmounts. Once revealed: **single tap = open fullscreen lightbox** (migrate enlarge from double-tap → single-tap everywhere in feed); **double tap = like** (haptic `selectTab`). No gesture branching. Locked.
5. **SS4 / Pull-down-to-dismiss** — **In this pass.** Scope: provider modal, alert detail modal, broadcast modal only. Do not apply to other slide modals.
6. **D2 / Wave redesign vs D1 / Star redesign** — **Star first (full redesign).** Wave keeps current motion + small polish only (see W1–W3 below). Reason: Star is premium intent and deserves the theatrical moment first.

### 15a. Wave-light polish items (replacing full D2)
| ID | Change | Notes |
|---|---|---|
| **W1** | Add 200 ms held stamp-climax before fly-off: stamp scales `1 → 1.05`, opacity 1.0 | Half of full Wave redesign — adds the "moment" without the full theatrical phase chain |
| **W2** | Replace fling easing `Easing.in(cubic)` with `Easing.out(cubic)` for Wave path | Feels like a release, not an escape |
| **W3** | Keep existing `toggleControl` haptic on Wave commit. No new haptic chain. | — |

- [x] W1 — Status: **DONE**
- [x] W2 — Status: **DONE**
- [x] W3 (no-op) — Status: **DONE** (verified existing)

---

## 16. Do-Not-Change List (locked)

- Discover swipe gesture physics — `activeOffsetX`, `failOffsetY`, velocity commit, busy-lock, 100 ms gesture floor, vertical bound. **Stays.**
- `huddleDesignTokens.ts`, `nativeModalPrimitives.tsx`, all shared primitives.
- `keyboard-controller` KAV usage where already present.
- `maintainVisibleContentPosition` config in ChatDialogue.
- Backend, RPC, schema, copy, colors, layout direction, route ownership.
- Web `/src`, `/mobile`.
- Modal `onRequestClose` wiring (already complete).
- `HumanPendingBrandLoader` (already premium).

---

## 17. Approval Summary

- **Approved for implementation:** D1, D3, D4, D5, W1, W2, W3, V1, V2, V3, V4, V5, V6, V7, V9, V10, EC1, EC2, EC3, EC5, EC6, EC7, HM1, AU1, AU2, AU3, SU1, SO1, SO2, SO3, SO4, SO5, SO6, SO7 (done), SO8, SO9 (updated spec), SO11, CD1, CD2, CD4, CD5, MA1 (deferred), MU5, SR1, SR2, SR7 (deferred), SS1 (done), SS4, MP1, MP2, MP4, MP5, MP6, MP7 (done), MP8, MP9, MP10, MP11, MP12, F1, F2, F3, F4, F5, TT1
- **Deferred:** CB1, CB2, CB3, CB4, CH1, CH2, CH3, CD3, MA2, MA3, MA4, MA5, MU1, MU2 (done), MU3, MU4, SR3, SR4, SR6, SS2, SS3, MP3, SO10, SO12, SO13, MA1, SR5, SR7
- **Rejected:** none
- **Approval signature / date:** Owner review — 2026-05-17

---

## 18. Implementation Decisions Log (2026-05-17)

### 18.1 Completed before this pass (audit confirmed)
- **D1, D3, D4, D5, W1, W2, W3** — Star/Wave redesign fully implemented in `NativeChatsScreen.tsx`.
- **MU2** — Slide-to-publish already implemented. Treat as done. No code change.
- **SO7 + SS1** — `NativeShimmerSkeleton` already in place for Social + Service first-load. Remove from gap list.
- **MP7** — `KeyboardAvoidingView` already present in `NativeBroadcastModal.tsx`.

### 18.2 SO9 — Updated gesture spec (replaces original)
Original spec said double-tap = like. Updated decision:

- **Sensitive overlay:** single tap → reveal (haptic `selectTab`). Overlay unmounts after reveal.
- **Once revealed — single tap:** open fullscreen lightbox / enlarge image. *(Migrate enlarge from double-tap → single-tap across the entire feed.)*
- **Once revealed — double tap:** like (haptic `selectTab`).
- No gesture branching. Mirrors exact Threads/Instagram behaviour.
- Rationale: single-tap-to-enlarge is universal convention. Frees double-tap for like without conflict.

### 18.3 F1+F2+F4 — Full form keyboard chain + haptics pass

Apply `returnKeyType` chain + `onSubmitEditing` wiring + save haptics to **every multi-field form in `/app`**. Single-field search boxes and multiline-only inputs are excluded. Multiline body fields keep their default `returnKeyType` (so newline still works) but title/subject fields above them get `returnKeyType="next"` to jump down.

**Rule:** title/subject/single-line field → `returnKeyType="next"` + `onSubmitEditing` focuses next ref. Last actionable field → `returnKeyType="done"` + `onSubmitEditing` submits. Haptic: `success` on save success, `warning` on validation error, `destructive` on destructive confirm.

#### Forms in scope

| # | File | Modal / Screen | Fields to chain | Notes |
|---|---|---|---|---|
| 1 | `screens/NativeAuthScreen.tsx` | Support modal | subject → message → replyEmail (conditional) | message is multiline — subject gets "next"; replyEmail gets "done" + submit |
| 2 | `screens/NativeAuthScreen.tsx` | Reset password modal | email | Single field — add "done" + submit on `onSubmitEditing` |
| 3 | `screens/NativeSignupScreen.tsx` | Sign-in modal (inside signup flow) | email → password | Mirror main auth chain already done |
| 4 | `screens/NativeSecuritySettingsScreen.tsx` | Change password modal | currentPassword → newPassword → confirmPassword | Add success/error haptics on submit |
| 5 | `screens/NativeEditProfileScreen.tsx` + `components/profile/NativeProfileForm.tsx` | Edit Profile | Audit all single-line fields in NativeProfileForm; chain where ≥2 adjacent single-line fields exist | Add success/error haptics on save |
| 6 | `screens/NativeCarerProfileScreen.tsx` | Carer / service profile form | All text fields in listing CRUD | Add toggleControl on switches; success/error on save |
| 7 | `screens/NativeSetPetScreen.tsx` | Pet basic info section | name → customSpecies (if visible) → weight | weight is decimal-pad — use "done" + blur |
| 8 | `screens/NativeSetPetScreen.tsx` | Vet contact section | clinicName → preferredVet → phoneNo | phoneNo uses NativePhoneField — "done" + blur |
| 9 | `screens/NativeSetPetScreen.tsx` | Vet visit record editor | visitReason → visitCustomReason (if visible) | skip date/select fields; chain only text inputs |
| 10 | `screens/NativeSocialScreen.tsx` | Post composer | title → content | title gets "next" → focus content; content stays multiline default; add success haptic on post |
| 11 | `components/map/NativeBroadcastModal.tsx` | Create Alert modal | title → description | title gets "next"; description stays multiline; add primaryConfirm haptic on submit (covers MP9 for this file) |
| 12 | `components/map/NativeAlertDetailModal.tsx` | Edit Alert modal | editTitle → editDescription | same pattern; add primaryConfirm haptic on save (covers MP9 for this file) |
| 13 | `screens/NativeSupportScreen.tsx` | Support form | subject → message → replyEmail (conditional) | Same as #1 pattern; add success/error haptics on submit |

#### Implementation approach
- Audit fields inline during the pass — no separate pre-audit.
- Commit per logical group: (a) profile forms, (b) pet form, (c) content modals, (d) auth/security/support.
- Lint + build proof after all groups complete.
- Status: **COMPLETE — 2026-05-17**

#### Not in scope (skip)
- Single-field search boxes (`searchQuery`, `inviteSearch`, `shareSearchQuery`) — already have `returnKeyType="search"` or are filter-only.
- `NativeChatsScreen.tsx` discovery match modal — single message field with char limit, not a form.
- `NativeSocialReplyComposerInput.tsx` — multiline-only reply input, no chain needed.
- `NativeChatDialogueScreen.tsx` — no TextInputs found.

#### Create Group modal — confirmed location
Inside `NativeChatsScreen.tsx` (triggered by `setCreateGroupOpen(true)`). Audit found **no text input fields** in the create group flow — it uses search + selection only. No chain needed.

#### Social Composer — confirmed location
`NativeSocialScreen.tsx` lines ~3134–3184. Two fields: `title` (single-line, 140 char) + `content` (multiline mention-aware). Chain: title → next → focus content.

### 18.4 Deferred this pass
- **MA1** — "Search this area" chip. Deferred.
- **SR5** — Provider gallery photo-change haptic. Deferred.
- **SR7** — Bookmark scale-pop + success haptic. Deferred.

### 18.5 V6 / EC2 / EC7 — Approved
- **V6** — Resend countdown progress bar under Resend button in Verify Identity screen.
- **EC2** — Shake animation on Continue button when email confirmation state becomes `not_yet`.
- **EC7** — Show typed email inline above Resend with "Wrong email?" affordance in Signup email confirmation step.

### 18.6 Shake-on-validation pass — COMPLETE (2026-05-17)
Applied `useShakeAnimation` hook (from `nativeAnimations.ts`) to all major form submit buttons. Triggers alongside `haptic.error/warning` on validation failure.

| File | Button that shakes |
|---|---|
| `NativeSignupScreen.tsx` | "Continue" (email not verified) |
| `NativeEditProfileScreen.tsx` | Header save icon + footer "Complete profile" |
| `NativeSetPetScreen.tsx` | Footer "Complete profile" |
| `NativeBroadcastModal.tsx` | Full footer row (SlideToPublish + a11y fallback) |
| `NativeChatsScreen.tsx` (CreateGroupModal) | "Create group" button |
| `NativeCarerProfileScreen.tsx` | Header save icon |
| `NativeSupportScreen.tsx` | "Send" button |
| `NativeAuthScreen.tsx` | "Sign in" button |

### 18.7 Verified status — 2026-05-17

**DONE (58):** D1, D3, D4, D5, W1, W2, W3, V1, V2, V3, V4, V5, V6, V7, V9, V10, EC1, EC2, EC3, EC5, EC6, EC7, HM1, AU1, AU2, AU3, SU1, SO1, SO2, SO3, SO4, SO5, SO6, SO7, SO8, SO9, SO11, CD1, CD2, CD4, CD5, MU2, MU5, SR1, SR2, SS1, SS4, MP1, MP2, MP4, MP5, MP6, MP7, MP8, MP9, MP10, MP11, MP12, F1, F2, F3, F4, F5, TT1

**NOT DONE (1) — explicitly deferred:**
| ID | Item | Notes |
|---|---|---|
| SU2 | stepTransition RN Animated → Reanimated (cosmetic) | `NativeSignupScreen.tsx` — low priority, deferred |

### 18.8 Final pass completed — 2026-05-17
All non-deferred UX items from the plan now implemented and verified clean (0 TS errors, 0 new ESLint errors).

**Changes in this final pass:**
- **EC6**: `changeEmail()` → `AppConfirmModal` confirm flow in `NativeSignupScreen.tsx` (both call sites)
- **D3**: `pressScaleSV` Reanimated shared value on Star button in `NativeChatsScreen.tsx`; `onPressIn` charge → 0.96, `onPressOut` spring → 1 + `haptic.selectTab()`
- **SO6**: `onScrollTopRef` prop wired in `NativeSocialScreen.tsx`; `onReselect` prop added to `NativeBottomNav`; `socialScrollTopRef` + `handleTabReselect` in `RootNavigator.tsx`
- **V3**: `OtpCellInput` 6-cell component with per-cell refs, backspace navigation, paste support; replaces `NativeFormTextField` in `NativeVerifyIdentityScreen.tsx`
- **SS4**: `PanGesture` pull-down-to-dismiss on `NativeBroadcastModal`, `NativeAlertDetailModal`, `NativeServiceScreen` provider modal; dismiss threshold 120px, spring-back below
- **Lint fixes**: `triggerSaveShake` + `triggerSendShake` added to `useCallback` deps in `NativeCarerProfileScreen.tsx` + `NativeSupportScreen.tsx`
- **SO9**: Sensitive media overlay + double-tap-to-like in `NativeSocialFeedPrimitives.tsx`. `toggleSensitiveReveal()` fires `haptic.selectTab()`. `handleMediaPress` detects double-taps within 280ms — second tap calls new `onDoubleTap` prop (wired to `onOpenSupport` = like) with `selectTab` haptic; single tap is delayed 280ms then opens fullscreen lightbox. Pending single-tap is cancelled if a second tap arrives. Cleanup `useEffect` clears any pending timer on unmount. While sensitive overlay is still up, double-tap is suppressed — first tap only reveals.
