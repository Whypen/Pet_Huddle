import type { NativeMapAnonymousArea } from "./nativeMapData";

/**
 * Multiple viewport anchors can return the same deterministic privacy cell.
 * Keep one row per server key and never merge neighbouring cells on-device:
 * doing so would invent a second geographic aggregation rule in the UI.
 */
export function mergeNativeMapAnonymousAreas(rows: NativeMapAnonymousArea[]): NativeMapAnonymousArea[] {
  const valid = rows
    .filter((row) => row.clusterKey.trim() && Number.isFinite(row.lat) && Number.isFinite(row.lng) && Number.isInteger(row.count) && row.count >= 2)
    .sort((left, right) => left.clusterKey.localeCompare(right.clusterKey));
  const byKey = new Map<string, NativeMapAnonymousArea>();
  valid.forEach((row) => {
    const current = byKey.get(row.clusterKey);
    if (!current || row.count > current.count) byKey.set(row.clusterKey, row);
  });
  return [...byKey.values()].sort((left, right) => left.clusterKey.localeCompare(right.clusterKey));
}
