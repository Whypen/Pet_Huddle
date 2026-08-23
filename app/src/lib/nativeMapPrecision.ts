// Legacy database values are accepted by the normalizer below, but no client
// may model or emit precise sharing. Apple-safe Map choices are Area/Incognito.
export type NativeMapPrecision = "area" | "hidden";
export const NATIVE_MAP_PRECISION_DEFAULT: NativeMapPrecision = "area";
export const NATIVE_MAP_CUSTOM_HOURS_MAX = 24;
export const NATIVE_MAP_DEFAULT_SHARE_HOURS = 2;

export const normalizeNativeMapPrecision = (value: unknown): NativeMapPrecision => (
  value === "hidden" ? value : NATIVE_MAP_PRECISION_DEFAULT
);

export const clampCustomHours = (hours: number): number => {
  if (!Number.isFinite(hours)) return NATIVE_MAP_DEFAULT_SHARE_HOURS;
  return Math.min(NATIVE_MAP_CUSTOM_HOURS_MAX, Math.max(1, Math.trunc(hours)));
};

export const formatNativeMapSharingUntil = (value: Date): string => value.toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit",
});

export const nativeMapSharingStatusText = (precision: NativeMapPrecision, value: Date): string => (
  `${precision === "hidden" ? "Incognito" : "Visible"} · until ${formatNativeMapSharingUntil(value)}`
);
