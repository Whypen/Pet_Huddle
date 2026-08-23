export type NativeMapPeopleCollisionPoint = {
  id: string;
  x: number;
  y: number;
};

export type NativeMapPeopleAreaPoint = {
  id: string;
  areaKey?: string | null;
  lat: number;
  lng: number;
};

/**
 * Group membership must come from the server privacy cell, never from zoom or
 * rendered-marker collision. Legacy v2 rows do not contain areaKey, but they
 * already carry the server-coarsened cell centre; the coordinate key preserves
 * that same server decision without running another geographic calculation.
 */
export const nativeMapPeopleAreaKey = (point: NativeMapPeopleAreaPoint): string | null => {
  const serverKey = String(point.areaKey || "").trim();
  if (serverKey) return `server:${serverKey}`;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return `legacy:${point.lat.toFixed(8)}:${point.lng.toFixed(8)}`;
};

export const buildNativeMapPeopleAreaGroups = (
  points: NativeMapPeopleAreaPoint[],
): string[][] => {
  const groups = new Map<string, string[]>();
  points
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((point) => {
      const key = nativeMapPeopleAreaKey(point);
      if (!key) return;
      groups.set(key, [...(groups.get(key) || []), point.id]);
    });
  return [...groups.values()];
};

export const buildNativeMapPeopleCollisionGroups = (
  points: NativeMapPeopleCollisionPoint[],
  collisionDistancePx: number,
) => {
  const ordered = points.slice().sort((left, right) => left.id.localeCompare(right.id));
  const parents = ordered.map((_, index) => index);
  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      if (Math.hypot(ordered[left].x - ordered[right].x, ordered[left].y - ordered[right].y) <= collisionDistancePx) {
        union(left, right);
      }
    }
  }

  const groups = new Map<number, string[]>();
  ordered.forEach((point, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) || []), point.id]);
  });
  return [...groups.values()];
};
