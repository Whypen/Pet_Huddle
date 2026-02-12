export type GeoPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

export interface GeoCoordsSnapshot {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export interface GeoDebugState {
  permission: GeoPermissionState;
  providerEnabled: boolean;
  locationSamples: GeoCoordsSnapshot[];
  lastKnownCoords: GeoCoordsSnapshot | null;
  mapboxTokenRedacted: string;
  mapboxVersion: string;
  platform: string;
  lastGeocodeRequest: {
    kind: "forward" | "reverse";
    url: string;
    params: Record<string, string>;
    status?: number;
    bodyPreview?: string;
  } | null;
  lastCamera: {
    source: string;
    center: [number, number];
    zoom?: number;
    stack?: string;
    timestamp: number;
  } | null;
  lastBroadcast: {
    uid: string | null;
    payload: Record<string, unknown>;
    response?: unknown;
    error?: unknown;
    timestamp: number;
  } | null;
  lastError: string | null;
  disableGeocode: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();

const state: GeoDebugState = {
  permission: "unknown",
  providerEnabled: typeof navigator !== "undefined" ? Boolean(navigator.geolocation) : false,
  locationSamples: [],
  lastKnownCoords: null,
  mapboxTokenRedacted: "missing",
  mapboxVersion: "unknown",
  platform: typeof navigator !== "undefined" ? navigator.userAgent : "server",
  lastGeocodeRequest: null,
  lastCamera: null,
  lastBroadcast: null,
  lastError: null,
  disableGeocode: false,
};

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeGeoDebug(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGeoDebugState(): GeoDebugState {
  return state;
}

export function updateGeoDebug(patch: Partial<GeoDebugState>): void {
  Object.assign(state, patch);
  notify();
}

export function pushLocationSample(sample: GeoCoordsSnapshot): void {
  state.lastKnownCoords = sample;
  if (state.locationSamples.length < 5) {
    state.locationSamples = [...state.locationSamples, sample];
  }
  notify();
}

export function setGeoDebugError(err: unknown): void {
  state.lastError = err instanceof Error ? err.message : String(err);
  notify();
}

export function setDisableGeocode(disable: boolean): void {
  state.disableGeocode = disable;
  notify();
}

export function redactToken(token?: string | null): string {
  if (!token) return "missing";
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function geoDebugLog(event: string, payload: Record<string, unknown>): void {
  const body = {
    scope: "geo-debug",
    event,
    at: new Date().toISOString(),
    ...payload,
  };
  console.log("[GEO_DEBUG]", JSON.stringify(body));
}

if (typeof window !== "undefined") {
  (window as Window & { __HUDDLE_GEO_DEBUG__?: GeoDebugState }).__HUDDLE_GEO_DEBUG__ = state;
}
