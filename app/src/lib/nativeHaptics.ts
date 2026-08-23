// Single backend-aware haptic surface for /app native screens.
// Screens import only `haptic.<intent>` helpers; they never import
// expo-haptics directly. Intent names mirror `huddleHaptics` in
// app/src/theme/huddleDesignTokens.ts.
//
// Every call is fire-and-forget and silently swallows errors so a
// missing OS capability (simulator, Android without vibration, etc.)
// never surfaces as an unhandled rejection. Haptics are additive
// feedback only — never gate UI logic on success of these calls.

import * as Haptics from "expo-haptics";

const safe = (fn: () => Promise<void>): void => {
  try {
    fn().catch(() => {
      // Silently ignore — haptic failure must never break a flow.
    });
  } catch {
    // Synchronous throws (e.g. native module missing) are also ignored.
  }
};

// Primitive shorthands for composing signature patterns.
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const medium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
const heavy = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// Plays a timed sequence of primitives — the only way to build distinguishable
// "signatures" without full Core Haptics. Each step is fire-and-forget; the
// whole sequence is best-effort and never throws into a flow.
const sequence = (steps: Array<{ at: number; play: () => Promise<void> }>): void => {
  for (const step of steps) {
    if (step.at <= 0) { safe(step.play); continue; }
    const timer = setTimeout(() => safe(step.play), step.at);
    // Timer is intentionally unreferenced — a dropped haptic is harmless.
    void timer;
  }
};

export const haptic = {
  selectTab: () => safe(() => Haptics.selectionAsync()),
  toggleControl: () => safe(() => Haptics.selectionAsync()),
  primaryConfirm: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  destructive: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  // Swipe-specific intents (discovery card gesture)
  swipeThreshold: () => safe(() => Haptics.selectionAsync()),
  swipeReturn: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  // ── Signature vocabulary ────────────────────────────────────────────────
  // Composed sequences give huddle moments a recognisable "feel" the way a
  // premium app cultivates a Taptic language. Each is a distinct rhythm built
  // from the primitives above — a user learns them without ever seeing text.

  /** New match — celebratory double pop (medium → light). */
  match: () => sequence([{ at: 0, play: medium }, { at: 90, play: light }]),
  /** A friend/companion is out near you — a gentle two-tap "knock". */
  friendNearby: () => sequence([{ at: 0, play: light }, { at: 70, play: light }]),
  /** Event about to start — rising anticipation (light → medium → heavy). */
  eventStarting: () => sequence([{ at: 0, play: light }, { at: 100, play: medium }, { at: 210, play: heavy }]),
  /** You went out / broadcast presence — one committed medium tap. */
  presenceOut: () => safe(medium),
  /** Streak advanced — playful climbing triple ending on success. */
  streak: () => sequence([{ at: 0, play: light }, { at: 80, play: light }, { at: 180, play: success }]),
  /** Card flip / reveal — a single crisp light tick. */
  reveal: () => safe(light),
};

export type HapticIntent = keyof typeof haptic;
