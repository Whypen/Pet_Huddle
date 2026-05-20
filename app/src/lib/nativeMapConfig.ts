import Constants from "expo-constants";

export const NATIVE_MAP_DEFAULT_CENTER: [number, number] = [114.1583, 22.2828];
export const NATIVE_MAP_DEFAULT_ZOOM = 16.5;

export type NativeMapTokenSource =
  | "EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN"
  | "EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN"
  | "expo.extra.mapboxPublicToken";

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
