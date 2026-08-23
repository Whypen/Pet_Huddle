import Constants from "expo-constants";
import { NATIVE_MAPBOX_PUBLIC_TOKEN } from "./nativeEnv.generated";

// Absolute last-resort center, only used before any real location is known.
export const NATIVE_MAP_DEFAULT_CENTER: [number, number] = [114.1583, 22.2828];
export const NATIVE_MAP_DEFAULT_ZOOM = 16.5;

// Last-known map center for the current app session. Seeded by the boot warm (GPS /
// stored pin / profile city resolved during the brand window) and updated whenever the
// map re-centers, so a freshly opened map paints on the user's location instead of the
// hardcoded default. Lives at module scope so it is read synchronously on map mount.
let nativeMapWarmCenter: [number, number] | null = null;
export const getNativeMapWarmCenter = (): [number, number] | null =>
  nativeMapWarmCenter ? [nativeMapWarmCenter[0], nativeMapWarmCenter[1]] : null;
export const setNativeMapWarmCenter = (center?: [number, number] | null) => {
  if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
    nativeMapWarmCenter = [center[0], center[1]];
  }
};

export type NativeMapTokenSource =
  | "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN"
  | "EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"
  | "expo.extra.mapboxPublicToken"
  | "nativeEnv.generated";

export type NativeMapTokenConfig =
  | {
      ok: true;
      token: string;
      source: NativeMapTokenSource;
    }
  | {
      ok: false;
      token: null;
      source: null;
      error: "missing_mapbox_public_token";
    };

const readEnv = (key: string) => {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
};

const readExpoConfigMapboxToken = () => {
  const extra = Constants.expoConfig?.extra as { mapboxPublicToken?: unknown } | undefined;
  const value = extra?.mapboxPublicToken;
  return typeof value === "string" ? value.trim() : "";
};

const readExpoConfigMapboxStyleUrl = () => {
  const extra = Constants.expoConfig?.extra as { huddleMapboxStyleUrl?: unknown; mapboxStyleUrl?: unknown } | undefined;
  const value = extra?.huddleMapboxStyleUrl ?? extra?.mapboxStyleUrl;
  return typeof value === "string" ? value.trim() : "";
};

const isMapboxStyleUrl = (value: string) => value.startsWith("mapbox://styles/");
const isTruthyFeatureFlag = (value: unknown) => typeof value === "string" && value.trim().toLowerCase() === "true";

export function readNativeMapStyleUrl() {
  const styleUrl = readEnv("HUDDLE_MAPBOX_STYLE_URL") || readEnv("EXPO_PUBLIC_HUDDLE_MAPBOX_STYLE_URL") || readExpoConfigMapboxStyleUrl();
  return styleUrl && isMapboxStyleUrl(styleUrl) ? styleUrl : null;
}

export function readNativePetPoisEnabled() {
  const extra = Constants.expoConfig?.extra as { huddleEnablePetPois?: unknown } | undefined;
  return isTruthyFeatureFlag(readEnv("HUDDLE_ENABLE_PET_POIS"))
    || isTruthyFeatureFlag(readEnv("EXPO_PUBLIC_HUDDLE_ENABLE_PET_POIS"))
    || isTruthyFeatureFlag(extra?.huddleEnablePetPois);
}

export function readNativeMapTokenConfig(): NativeMapTokenConfig {
  const publicToken = readEnv("EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN");
  if (publicToken) {
    return {
      ok: true,
      token: publicToken,
      source: "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN",
    };
  }

  const accessToken = readEnv("EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN");
  if (accessToken) {
    return {
      ok: true,
      token: accessToken,
      source: "EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN",
    };
  }

  const configToken = readExpoConfigMapboxToken();
  if (configToken) {
    return {
      ok: true,
      token: configToken,
      source: "expo.extra.mapboxPublicToken",
    };
  }

  const generatedToken = NATIVE_MAPBOX_PUBLIC_TOKEN.trim();
  if (generatedToken) {
    return {
      ok: true,
      token: generatedToken,
      source: "nativeEnv.generated",
    };
  }

  return {
    ok: false,
    token: null,
    source: null,
    error: "missing_mapbox_public_token",
  };
}

export function hasNativeMapToken() {
  return readNativeMapTokenConfig().ok;
}
