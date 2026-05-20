const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const isEnabledEnv = (key: string) => {
  const value = process.env[key];
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
};

const isDisabledEnv = (key: string) => {
  const value = process.env[key];
  return FALSE_VALUES.has(String(value || "").trim().toLowerCase());
};

export function nativeMapEnabled() {
  if (isDisabledEnv("EXPO_PUBLIC_NATIVE_MAP_ENABLED")) return false;
  if (isEnabledEnv("EXPO_PUBLIC_NATIVE_MAP_ENABLED")) return true;
  return !isDisabledEnv("EXPO_PUBLIC_NATIVE_MAP_DEBUG");
}

export function nativeMapPhase1Ready() {
  if (isDisabledEnv("EXPO_PUBLIC_NATIVE_MAP_PHASE_1_READY")) return false;
  if (isEnabledEnv("EXPO_PUBLIC_NATIVE_MAP_PHASE_1_READY")) return true;
  return !isDisabledEnv("EXPO_PUBLIC_NATIVE_MAP_PHASE_1_DEBUG_READY");
}

export function shouldUseNativeMapRoute() {
  return nativeMapEnabled() && nativeMapPhase1Ready();
}

export function nativeMapRouteOwnershipReady() {
  return isEnabledEnv("EXPO_PUBLIC_NATIVE_MAP_PHASE_6_ROUTE_READY");
}

export function shouldUseNativeMapRouteOwnership() {
  return shouldUseNativeMapRoute() && nativeMapRouteOwnershipReady();
}
