import type { NativeToastContent } from "./nativeToastCopy";

// Copy for "Reached X people". Kept free of runtime imports on purpose: the
// Supabase client pulls in react-native-url-polyfill, which the test runner
// cannot parse, so the fetch lives in nativeBroadcastReach.ts instead.
//
// Contract: app/docs/Contracts/notification_copy_contract.md

/** Below this the number is not worth interrupting anyone for. */
export const NATIVE_BROADCAST_REACH_MIN = 10;

export type NativeBroadcastReach = {
  tappedReach: number | null;
  tappedAlertType: string | null;
  tappedLocation: string | null;
  tappedEligible: boolean;
  rollupReach: number;
  rollupBroadcasts: number;
};

const people = (count: number) => `Reached ${count.toLocaleString()} ${count === 1 ? "person" : "people"}`;

const tappedAlertSubject = (alertType: string | null): string => {
  switch (String(alertType ?? "").trim().toLowerCase()) {
    case "stray": return "Your Stray sighting";
    case "lost": return "Your Lost sighting";
    default: return "Your alert";
  }
};

/**
 * Copy for a single tapped alert. Returns null when it fails the age, active or
 * reach gates — the caller shows nothing rather than a weak number.
 */
export function buildTappedReachToast(reach: NativeBroadcastReach): NativeToastContent | null {
  if (!reach.tappedEligible) return null;
  const count = reach.tappedReach ?? 0;
  if (count < NATIVE_BROADCAST_REACH_MIN) return null;

  const subject = tappedAlertSubject(reach.tappedAlertType);
  // Location comes from the canonical server row, never the optimistic shell,
  // which carries a null district while a deep link is still resolving.
  const copy = reach.tappedLocation
    ? `${subject} near ${reach.tappedLocation}.`
    : `${subject} is live.`;

  return { tone: "done", headline: people(count), copy };
}

/** Copy for every still-active broadcast this person owns. */
export function buildRollupReachToast(reach: NativeBroadcastReach): NativeToastContent | null {
  if (reach.rollupReach < NATIVE_BROADCAST_REACH_MIN || reach.rollupBroadcasts < 1) return null;

  const copy = reach.rollupBroadcasts === 1
    ? "Across 1 active broadcast."
    : `Across ${reach.rollupBroadcasts} active broadcasts.`;

  return { tone: "done", headline: people(reach.rollupReach), copy };
}
