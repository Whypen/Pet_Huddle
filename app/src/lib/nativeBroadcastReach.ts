import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import type { NativeBroadcastReach } from "./nativeBroadcastReachCopy";

// Fetches the reach summary. Copy builders live in nativeBroadcastReachCopy.ts
// so they stay unit-testable without dragging in the Supabase client.
//
// Contract: app/docs/Contracts/notification_copy_contract.md

export { NATIVE_BROADCAST_REACH_MIN, buildRollupReachToast, buildTappedReachToast } from "./nativeBroadcastReachCopy";
export type { NativeBroadcastReach } from "./nativeBroadcastReachCopy";

type ReachRow = {
  tapped_reach: number | null;
  tapped_alert_type: string | null;
  tapped_location: string | null;
  tapped_eligible: boolean | null;
  rollup_reach: number | null;
  rollup_broadcasts: number | null;
};

const int = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const text = (value: unknown): string | null => {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
};

export async function fetchNativeBroadcastReach(
  options: { alertId?: string | null; accessToken?: string | null } = {},
): Promise<NativeBroadcastReach | null> {
  // nativeExactTokenRpc resolves { data, error } — it does not throw on an RPC error.
  const result = await nativeExactTokenRpc<ReachRow | ReachRow[]>(
    "get_native_broadcast_reach",
    { p_alert_id: options.alertId ?? null },
    options.accessToken,
  ).catch(() => null);

  if (!result || result.error) return null;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) return null;

  return {
    tappedReach: row.tapped_reach === null || row.tapped_reach === undefined ? null : int(row.tapped_reach),
    tappedAlertType: text(row.tapped_alert_type),
    tappedLocation: text(row.tapped_location),
    tappedEligible: row.tapped_eligible === true,
    rollupReach: int(row.rollup_reach),
    rollupBroadcasts: int(row.rollup_broadcasts),
  };
}
