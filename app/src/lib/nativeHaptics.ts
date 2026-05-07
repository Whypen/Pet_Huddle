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
  // Swipe-specific intents (discovery card gesture)
  swipeThreshold: () => safe(() => Haptics.selectionAsync()),
  swipeReturn: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
};

export type HapticIntent = keyof typeof haptic;
