export type ParsedNativeMapAnonymousArea = {
  clusterKey: string;
  lat: number;
  lng: number;
  count: number;
};

export type ParsedNativeMapAreaCell = {
  areaKey: string;
  lat: number;
  lng: number;
};

export const parseNativeMapAreaCell = (value: unknown): ParsedNativeMapAreaCell | null => {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const areaKey = String(row.areaKey || "").trim();
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!areaKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { areaKey, lat, lng };
};

export const parseNativeMapAnonymousAreas = (value: unknown): ParsedNativeMapAnonymousArea[] => (
  Array.isArray(value) ? value : []
).map((entry) => {
  const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
  const clusterKey = String(row.clusterKey || "").trim();
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const count = Math.trunc(Number(row.count));
  if (!clusterKey || !Number.isFinite(lat) || !Number.isFinite(lng) || count < 2) return null;
  return { clusterKey, lat, lng, count };
}).filter((row): row is ParsedNativeMapAnonymousArea => row !== null);
