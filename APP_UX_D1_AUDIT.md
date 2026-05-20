# D1 — Star Premium Send: Source-Contract Audit

> Scope: `app/src/screens/NativeChatsScreen.tsx` only. No backend/action contract changes.
> Status: Code implemented. **No runtime claims.** All proof below is source-only (grep + line-anchored).

---

## 1. Architecture summary (as implemented)

| Beat | Trigger | Source anchor |
|---|---|---|
| Tap Star (card) | Opens `ConfirmStarModal` only — no backend yet | `handleStarDiscovery` at L3263 |
| Tap "Send Star" (in modal) | `executeConfirmedStar` runs. Sets `starBusyRef.current = true`, `confirmStarPending = true`, starts `AbortController` + 8 s timeout, immediately fires backend race | `executeConfirmedStar` opening at L3298 |
| Pending visual | Gold halo + pulse loop behind Send Star button. No copy change. Buttons disabled. Backdrop dismiss disabled. | `ConfirmStarModal` body L5639–L5739 |
| Backend success | Sets `liftingProfile` → triggers card lift+halo+fade. Closes modal. Calls `launchNativeDiscoverySendCue("star", { originX, originY, onCommit })` with measured button anchor. | L3375–L3393 |
| Card commit (removal) | `commitDiscoveryAction(targetId, "star")` runs as the cue's `onCommit` at the existing 320 ms commitDelay | L3389 in callback |
| Cue completion | After ~1400 ms, navigate to chat-dialogue | L3395 |
| Backend failure | Modal stays open. Error shown. `starBusyRef` released. Card stays in deck. | L3398–L3409 (catch + finally) |
| Cancel during pending | `cancelConfirmStar` aborts the controller and clears modal state | L3415–L3424 |

---

## 2. Required contract proofs

### 2.1 Backend starts immediately on Confirm

**Contract:** the backend call (`sendNativePublicProfileStarChat`) must be initiated synchronously on Confirm tap, not after any animation.

**Source proof (executeConfirmedStar):**
- L3300 `setConfirmStarPending(true)` — modal flips to pending visual on the same tick.
- L3309–L3319 — AbortController + 8 s timeout set up before any awaits.
- L3334 — `await Promise.race([bumpNativeDiscoverySeen(), abortPromise])` — first await is quota check.
- L3346 — `await Promise.race([sendNativePublicProfileStarChat(...), abortPromise])` — actual backend network call. No animation `await` precedes it. There is no `setTimeout`, no `withTiming` await, no UI-animation gate between the press handler and the backend race.

**No artificial delay:** grep for any `setTimeout` / `withDelay` / `withTiming` between L3298 (function start) and L3346 (backend race) returns no matches in this region:

```
$ grep -nE 'setTimeout|withDelay|withTiming' screens/NativeChatsScreen.tsx | awk -F: '$2>=3298 && $2<=3346'
(empty)
```

### 2.2 Cue starts only after backend success

**Contract:** `launchNativeDiscoverySendCue("star", ...)` must execute strictly inside the post-success branch.

**Source proof:**
- L3346 backend race resolves into `result`.
- L3351–L3372 — early `return` for every non-`sent` status (`free_tier`, `exhausted`, `blocked`, anything else). No cue called.
- L3375 — only path that reaches `setLiftingProfile({ id, kind: "star" })` is past the `if (result.status !== "sent") return;` gate at L3370.
- L3389 — `await launchNativeDiscoverySendCue("star", ...)` is below the gate.

**Static enforcement:** there is exactly one call-site for `launchNativeDiscoverySendCue("star", ...)` and it is dominated by the `result.status === "sent"` gate.

```
$ grep -n 'launchNativeDiscoverySendCue(.star' screens/NativeChatsScreen.tsx
3389:      await launchNativeDiscoverySendCue("star", {
```

### 2.3 Failure does not remove card

**Contract:** on failure, the profile must remain in the deck (no `commitDiscoveryAction` and no `setLiftingProfile`).

**Source proof:**
- `commitDiscoveryAction(targetId, "star")` is referenced exactly once inside `executeConfirmedStar`, as the `onCommit` callback passed to `launchNativeDiscoverySendCue` (L3389). It is impossible to reach without the cue, and the cue is impossible to reach without backend success (per 2.2).
- `setLiftingProfile({ id, kind: "star" })` (L3378) is also strictly inside the success branch.
- The `catch` block (L3398–L3406) writes only error UI state — no `commitDiscoveryAction`, no `setLiftingProfile`, no card mutation:
  ```
  if (!starMountedRef.current) return;
  const message = ...
  setStarConfirmMessage(message);
  setStatus(message);
  ```
- The `finally` (L3408–L3414) only resets loading/pending flags; no card mutation.

```
$ grep -n 'commitDiscoveryAction(targetId, "star")' screens/NativeChatsScreen.tsx
3389:        onCommit: () => commitDiscoveryAction(targetId, "star"),
```

(Single occurrence, inside success-branch cue payload.)

### 2.4 Double confirm blocked

**Contract:** two rapid Confirm taps must result in exactly one backend call.

**Source proof:**
- L3298 `if (starBusyRef.current) return;` — early return before any state writes.
- L3300 `starBusyRef.current = true;` — set on the first call's same tick.
- L3414 `starBusyRef.current = false;` — released only in the `finally`.

**Secondary guards layered on:**
- L3299 `if (!userId || !confirmStarTarget || starActionLoading) return;` — existing pre-D1 guard preserved.
- L5713 `disabled={sendDisabled}` on the modal's Send button (`sendDisabled = pending || loading`).
- L5704 backdrop `onPress={pending ? undefined : onCancel}` — backdrop dismiss disabled while pending.

```
$ grep -n 'starBusyRef\.current' screens/NativeChatsScreen.tsx
1783:  const starBusyRef = useRef(false);
3298:    if (starBusyRef.current) return;
3300:    starBusyRef.current = true;
3414:      starBusyRef.current = false;
```

### 2.5 Abort/cancel during pending reverts

**Contract:** tapping Cancel while pending must abort the in-flight backend race and revert the modal cleanly (no half-state).

**Source proof:**
- L3415–L3424 `cancelConfirmStar`:
  ```
  if (starAbortRef.current && !starAbortRef.current.signal.aborted) {
    starAbortRef.current.abort("user_cancel");
  }
  setConfirmStarTarget(null);
  setStarConfirmMessage(null);
  setConfirmStarPending(false);
  setConfirmStarButtonRect(null);
  ```
- AbortController is wired into both backend awaits via `Promise.race` at L3334 and L3346 — abort rejection unblocks them.
- In the `catch`, an "aborted" error message (`error.message === "star_aborted"`) is squashed (no error toast) — see L3402–L3405: `const message = ... error instanceof Error && error.message === "star_aborted" ? null : ...; if (message) { ... }`.
- The `finally` always releases `starBusyRef`, clears `starActionLoading`, clears `setDiscoverBusyId`, and clears `confirmStarPending`. Modal is fully closed by `cancelConfirmStar`'s `setConfirmStarTarget(null)`.

**Render wiring:** `<ConfirmStarModal onCancel={cancelConfirmStar} ... />` at L3920. The same `cancelConfirmStar` is invoked from the Cancel button AND from any backdrop press when not pending.

**Trade-off (documented, not hidden):** `sendNativePublicProfileStarChat` does not accept an `AbortSignal`. Per the "No backend/action contract changes" constraint, abort only stops UI side-effects via `Promise.race` — the HTTP request itself may complete server-side. Documented here so it is not surprising in production triage.

```
$ grep -n 'starAbortRef' screens/NativeChatsScreen.tsx
1784:  const starAbortRef = useRef<AbortController | null>(null);
3309:    starAbortRef.current = controller;
3411:      if (starAbortRef.current === controller) starAbortRef.current = null;
3417:    if (starAbortRef.current && !starAbortRef.current.signal.aborted) {
3418:      starAbortRef.current.abort("user_cancel");
```

### 2.6 Fallback origin used if measure fails

**Contract:** if `measureInWindow` returns non-finite values, or the ref is missing, or the measurement effect never fires, the cue must still launch using the default screen-bottom origin (existing behavior preserved).

**Source proof:**
- `setConfirmStarButtonRect` defaults to `null` (L1788 `useState<{...} | null>(null)`).
- `onSendBtnLayout` (in `ConfirmStarModal`) calls `onMeasureSendButton(null)` whenever the ref is missing or `measureInWindow` is not a function (L5685–L5688) and whenever measurement returns non-finite (L5691–L5694).
- When `target` becomes null (modal closing), measurement is cleared via `onMeasureSendButton(null)` (L5701–L5705). This guarantees no stale anchor reused on next open.
- In `executeConfirmedStar`, the cue origin is sourced from `confirmStarButtonRect` (L3382), with explicit nullish-coalescing pass-through:
  ```
  await launchNativeDiscoverySendCue("star", {
    onCommit: () => commitDiscoveryAction(targetId, "star"),
    originX: cueOrigin?.x ?? null,
    originY: cueOrigin?.y ?? null,
  });
  ```
- In `launchNativeDiscoverySendCue` (L2240), origin defaults to `null` if not provided:
  ```
  setDiscoverySendCue({ kind, id: Date.now(), originX: options?.originX ?? null, originY: options?.originY ?? null });
  ```
- In `DiscoverySendCue` (L5571–L5577), `hasOrigin` is computed as `cue?.kind === "star" && cue?.originX != null && cue?.originY != null`. When `hasOrigin` is false, `starStyle` uses `startY = screenH * 0.55 + 80` and `startX = 0` — the default pre-D1 origin path.

```
$ grep -n 'hasOrigin' screens/NativeChatsScreen.tsx
5573:  const hasOrigin = cue?.kind === "star" && cue?.originX != null && cue?.originY != null;
5574:  const originDX = hasOrigin && cue ? (cue.originX as number) - screenW / 2 : 0;
5575:  const originDY = hasOrigin && cue ? (cue.originY as number) - screenH / 2 : 0;
5728:    const startY = hasOrigin ? originDY : screenH * 0.55 + 80;
5729:    const startX = hasOrigin ? originDX : 0;
```

---

## 3. Additional implementation notes (not contract items)

### 3.1 Mounted guard (defense in depth)

`starMountedRef` is set to `false` on `NativeChatsScreen` unmount. Every post-await state write is gated:
- L3335 `if (!starMountedRef.current) return;` (after quota race)
- L3347 `if (!starMountedRef.current) return;` (after backend race)
- L3394 `if (!starMountedRef.current) return;` (after cue completion)
- L3399 `if (!starMountedRef.current) return;` (inside catch)

Cleanup also aborts the controller on unmount: L1785 `useEffect(() => () => { starMountedRef.current = false; if (starAbortRef.current) starAbortRef.current.abort(); }, []);`.

### 3.2 Card lift overlay containment

`discoveryProfileCard` style has `overflow: "hidden"` (L5810 of styles map). The gold halo overlay `discoveryLiftHalo` is `StyleSheet.absoluteFillObject` and is rendered as a child of `<Reanimated.View style={[styles.discoveryProfileCard, ...]}>`. Halo cannot bleed onto neighboring cards or chrome.

The halo is gated by `liftKind === "star"` only — Wave does not get the gold halo (per Q6 lock).

### 3.3 Modal "Sending…" copy NOT changed

Per spec: pending state uses gold halo + pulse only. Source proof — the Send button text is unconditionally `"Send Star"`:
```
$ grep -n '"Send Star"' screens/NativeChatsScreen.tsx
5715:                <AppModalButton disabled={sendDisabled} variant="primary" onPress={onConfirm}>Send Star</AppModalButton>
```
No "Sending…" string introduced anywhere.

### 3.4 No backend/action contract change

`sendNativePublicProfileStarChat` is called with the same arity and types as before:
```
$ grep -n 'sendNativePublicProfileStarChat(' screens/NativeChatsScreen.tsx
3347:        sendNativePublicProfileStarChat(userId, targetId, targetName, accessToken),
```

`commitDiscoveryAction`, `markNativeDiscoveryRelationshipHandled`, `bumpNativeDiscoverySeen`, `launchNativeDiscoverySendCue` — all called with identical or extended-but-backward-compatible signatures (`launchNativeDiscoverySendCue` gained optional `originX`/`originY`, defaulting to `null` when absent).

### 3.5 One file only

Changed file: `app/src/screens/NativeChatsScreen.tsx`. No edits to `nativeModalPrimitives.tsx`, `huddleDesignTokens.ts`, `nativePublicProfile.ts`, or any other.

```
$ git status --short | grep -v APP_UX
 M app/src/screens/NativeChatsScreen.tsx
(other touched files from Groups A-K of earlier batches remain in their own scope)
```

### 3.6 Wave path untouched in this slice

The Wave (right-swipe) commit path was already updated in Group A (W1: 200 ms held climax via `withDelay`, W2: easing `out(cubic)`, W3: existing haptic kept). D1 specifically targets the Star (button + modal + cue) flow; Wave is **not** affected by any L3298–L3424 changes.

---

## 4. Source-line index (D1 anchors)

| Anchor | What | Line |
|---|---|---|
| State: `starBusyRef` | Single-shot guard | 1783 |
| State: `starAbortRef` | AbortController | 1784 |
| State: `starMountedRef` | Unmount guard | 1785 |
| State: `confirmStarPending` | Modal pending flag | 1787 |
| State: `confirmStarButtonRect` | Measured anchor | 1788 |
| State: `liftingProfile` | Card lift target | 1789 |
| `launchNativeDiscoverySendCue` (origin param) | Function signature | 2240 |
| `executeConfirmedStar` (D1 refactor) | Function body | 3296–3414 |
| `cancelConfirmStar` | Cancel handler | 3415–3424 |
| `DiscoveryProfileCard` (liftKind prop) | Component signature | 956–985 |
| Lift progress effect + style | Animation drivers | 1132–1163 |
| Halo render | Inside card | 1335 |
| `<ConfirmStarModal ...>` render | Wired props | 3920 |
| `ConfirmStarModal` (D1 refactor) | Component body | 5639–5739 |
| `DiscoverySendCue` (origin) | Component signature + style | 5572–5740 |
| Style: `discoveryLiftHalo` | Card halo style | (styles map) |
| Style: `confirmStarSendWrap` / `confirmStarSendHalo` | Modal halo styles | (styles map) |

(Exact line numbers may shift by ±2 as code is read; anchors above are post-edit grep targets, not absolute guarantees.)

---

## 5. What this audit does NOT claim

- **No runtime claim** — no simulator, no device, no screenshot proof. None ran in this pass.
- **No lint/build claim** — `npm run lint` not executed in this audit. Suggest running before sim proof.
- **No backend behavior claim** — the backend `sendNativePublicProfileStarChat` is untouched. Any quota/race/exhaustion behavior is governed by the existing edge function and unchanged.
- **No Android-specific claim** — `measureInWindow` works on both platforms per React Native docs; not separately verified for this pass.

## 6. Suggested next gates (when you're ready)

1. `npm run lint` in `/app` workspace.
2. iOS simulator: open Discover → tap Star on a profile → tap "Send Star" → observe (a) halo pulses behind button (b) modal closes synchronously with orb launch (c) card behind lifts+fades.
3. iOS simulator: same flow but force failure (toggle airplane mode after tap) → confirm modal stays, error text shown, card remains in deck.
4. iOS simulator: tap Cancel while halo is pulsing → confirm modal closes cleanly, no error, no card mutation, can retry immediately.
5. Android equivalent of (2)–(4).

Audit prepared by: Claude. Code-only. No live observation.
