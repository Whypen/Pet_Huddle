import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { createNativeProtectedActionError, requestNativeStorageCleanupResult, type NativeProtectedActionCleanupResult } from "./nativeStorageCleanup";
import { registerNativeMediaAsset } from "./nativeMediaAssets";
import { nativeSafeWriteErrorMessage, requireCurrentNativeSession } from "./nativeSessionGuard";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout, NATIVE_MEDIA_UPLOAD_TIMEOUT_MS } from "./nativeTimeout";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { reverseGeocodeNativeLocationComponents } from "./nativeLocation";
import { purgeNativeSocialPersistentCache, type NativeSocialImageMetadata } from "./nativeSocial";

const alertPublicUrlCache = new Map<string, string | null>();

export const clearNativeAlertPublicUrlCache = (path?: string) => {
  if (!path) {
    alertPublicUrlCache.clear();
    return;
  }
  alertPublicUrlCache.delete(path);
};

const getCachedNativeAlertPublicUrl = (objectName: string): string | null => {
  if (alertPublicUrlCache.has(objectName)) return alertPublicUrlCache.get(objectName) ?? null;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/alerts/${objectName.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
  alertPublicUrlCache.set(objectName, publicUrl);
  return publicUrl;
};

type NativeBroadcastSessionOptions = {
  accessToken?: string | null;
  sessionKey?: string | null;
  userId?: string | null;
};

export const nativeBroadcastSafeErrorMessage = (error: unknown, fallback = "Unable to complete this action right now.") =>
  nativeSafeWriteErrorMessage(error, fallback);

const requireNativeBroadcastSession = (options: NativeBroadcastSessionOptions) => requireCurrentNativeSession({
  accessToken: options.accessToken,
  expectedUserId: options.userId,
  sessionKey: options.sessionKey,
});

const nativeBroadcastHeaders = (accessToken: string, extra?: Record<string, string>) =>
  createNativeAuthenticatedHeaders(accessToken, extra);


export type NativeBroadcastAlertType = "Stray" | "Lost" | "Caution" | "Others";

export type NativeBroadcastCreatePayload = {
  alertId: string;
  durationHours: number;
  threadId: string | null;
  expiresAt: string;
  rangeKm: number;
  rangeMeters: number;
};

export const NATIVE_BROADCAST_RANGE_STEPS = [1, 3, 5, 10, 20, 50] as const;
export const NATIVE_BROADCAST_DURATION_STEPS = [1, 3, 6, 12, 24, 48, 72] as const;

export const NATIVE_BROADCAST_CAPS_BY_TIER: Record<"free" | "plus" | "gold", { radiusKm: number; durationHours: number }> = {
  free: { radiusKm: 5, durationHours: 12 },
  plus: { radiusKm: 10, durationHours: 24 },
  gold: { radiusKm: 20, durationHours: 48 },
};

export const NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER: Record<"free" | "plus" | "gold", number> = {
  free: 3,
  plus: 5,
  gold: 10,
};

export const NATIVE_BROADCAST_VERIFIED_BROADCAST_BONUS = 10;

export const NATIVE_SUPER_BROADCAST_CAPS = { radiusKm: 50, durationHours: 72 } as const;

export const normalizeNativeBroadcastTier = (tierRaw?: string | null): "free" | "plus" | "gold" => {
  const tier = String(tierRaw || "free").toLowerCase();
  if (tier === "gold") return "gold";
  if (tier === "plus" || tier === "premium") return "plus";
  return "free";
};

export const normalizeNativeBroadcastAlertType = (value?: string | null): NativeBroadcastAlertType => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "lost") return "Lost";
  if (normalized === "caution") return "Caution";
  if (normalized === "others" || normalized === "other") return "Others";
  return "Stray";
};

export const nativeBroadcastRequiresPetType = (alertType?: string | null) => {
  const normalized = String(alertType || "").trim().toLowerCase();
  return normalized === "lost" || normalized === "stray";
};

export const getNativeBroadcastActiveConcurrentLimit = (
  tier: "free" | "plus" | "gold",
  isVerified: boolean | null = false,
) => {
  return NATIVE_BROADCAST_ACTIVE_CONCURRENT_CAPS_BY_TIER[tier] + (isVerified ? NATIVE_BROADCAST_VERIFIED_BROADCAST_BONUS : 0);
};

export const getNativeBroadcastPinColor = (type: NativeBroadcastAlertType) => {
  if (type === "Lost") return "#EF4444";
  if (type === "Caution") return "#2145CF";
  if (type === "Others") return "#A1A4A9";
  return "#EAB308";
};

const RICH_NOTIFICATION_ANDROID_MAX_BYTES = 900 * 1024;

const normalizeNativeBroadcastUploadImage = async (uri: string) => {
  const normalized = await manipulateAsync(uri, [{ resize: { width: 1200 } }], {
    compress: 0.76,
    format: SaveFormat.JPEG,
  });
  const info = await FileSystem.getInfoAsync(normalized.uri);
  const size = "size" in info ? Number(info.size || 0) : 0;
  if (size <= RICH_NOTIFICATION_ANDROID_MAX_BYTES) return normalized.uri;

  try {
    const compacted = await manipulateAsync(normalized.uri, [{ resize: { width: 960 } }], {
      compress: 0.62,
      format: SaveFormat.JPEG,
    });
    await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    return compacted.uri;
  } catch (error) {
    await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
};

const base64ToArrayBuffer = (base64: string) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = cleanBase64.endsWith("==") ? 2 : cleanBase64.endsWith("=") ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((cleanBase64.length * 3) / 4) - padding);
  const bytes = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of cleanBase64) {
    if (char === "=") break;
    const value = chars.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8 && index < byteLength) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return bytes;
};

export async function createNativeBroadcastNoMedia({
  address,
  alertType,
  description,
  durationHours,
  imageMetadata = [],
  images = [],
  isSensitive = false,
  lat,
  lng,
  postOnThreads = false,
  verifiedOnly = false,
  petType,
  rangeKm,
  sessionKey,
  title,
  userId,
  accessToken,
}: {
  accessToken?: string | null;
  address: string | null;
  alertType: NativeBroadcastAlertType;
  description: string | null;
  durationHours: number;
  imageMetadata?: NativeSocialImageMetadata[];
  images?: string[];
  isSensitive?: boolean;
  lat: number;
  lng: number;
  postOnThreads?: boolean;
  verifiedOnly?: boolean;
  petType?: string | null;
  rangeKm: number;
  sessionKey?: string | null;
  title: string | null;
  userId?: string | null;
}): Promise<NativeBroadcastCreatePayload> {
  const session = requireNativeBroadcastSession({ accessToken, sessionKey, userId });
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  const rangeMeters = Math.round(rangeKm * 1000);
  const photoUrl = images[0] || null;
  const incidentLocation = await reverseGeocodeNativeLocationComponents(lat, lng).catch(() => null);
  const payload = {
    lat,
    lng,
    type: alertType,
    pet_type: nativeBroadcastRequiresPetType(alertType) ? petType?.trim() || null : null,
    title: title?.trim() || null,
    description: description?.trim() || null,
    address,
    photo_url: photoUrl,
    images,
    range_meters: rangeMeters,
    expires_at: expiresAt,
    // A verified-only alert may cross-post to Social; the thread carries verified_only
    // and every Social read/write path scopes it to verified viewers server-side.
    post_on_social: postOnThreads,
    post_on_threads: postOnThreads,
    verified_only: verifiedOnly,
    is_sensitive: isSensitive,
    incident_admin_area: incidentLocation?.adminArea ?? null,
    incident_city: incidentLocation?.city ?? null,
    incident_country_code: incidentLocation?.countryCode ?? null,
    incident_country_name: incidentLocation?.countryName ?? null,
    incident_district: incidentLocation?.district ?? null,
    incident_location_confidence: incidentLocation ? "reverse_geocode" : null,
    incident_location_source: "alert",
  };

  const { data, error } = await nativeExactTokenRpc("create_alert_thread_and_pin", { payload }, session.accessToken);
  if (error) throw error;
  const result = (data || {}) as {
    alert_id?: string | null;
    duration_hours?: number | null;
    expires_at?: string | null;
    range_km?: number | string | null;
    range_meters?: number | null;
    thread_id?: string | null;
  };
  if (!result.alert_id) throw new Error("Broadcast create RPC did not return alert_id");
  if (result.thread_id && images.length > 0 && imageMetadata.length > 0) {
    const metadataResult = await nativeExactTokenRpc("set_native_social_thread_image_metadata", {
      p_thread_id: result.thread_id,
      p_images: images,
      p_image_metadata: imageMetadata,
    }, session.accessToken);
    if (metadataResult.error) throw metadataResult.error;
  }
  if (result.thread_id) {
    // The alert was cross-posted to Social. load("reset") reuses a feed cache
    // confirmed in the last 30s without hitting the network, so entering Social
    // right after broadcasting would otherwise paint a feed that predates this
    // post. Drop the cache so the next entry is a real fetch.
    void purgeNativeSocialPersistentCache(session.userId).catch(() => undefined);
  }
  const finalRangeMeters = Number.isFinite(Number(result.range_meters)) ? Math.round(Number(result.range_meters)) : rangeMeters;
  const finalRangeKm = Number.isFinite(Number(result.range_km)) ? Number(result.range_km) : finalRangeMeters / 1000;
  const finalDurationHours = Number.isFinite(Number(result.duration_hours)) ? Math.round(Number(result.duration_hours)) : durationHours;
  return {
    alertId: result.alert_id,
    durationHours: finalDurationHours,
    threadId: result.thread_id ?? null,
    expiresAt: result.expires_at ?? expiresAt,
    rangeKm: finalRangeKm,
    rangeMeters: finalRangeMeters,
  };
}

export async function uploadNativeBroadcastImage(userId: string, uri: string, fileName?: string | null, mimeType?: string | null, accessToken?: string | null, sessionKey?: string | null) {
  void fileName;
  void mimeType;
  const session = requireNativeBroadcastSession({ accessToken, sessionKey, userId });
  const token = await getFreshNativeAccessToken(session.accessToken);
  if (!token) throw new Error("auth_required");
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("Selected image is unavailable.");
  const normalizedUri = await normalizeNativeBroadcastUploadImage(uri);
  const extension = "jpg";
  const objectName = `${session.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  try {
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, { encoding: FileSystem.EncodingType.Base64 });
    const body = base64ToArrayBuffer(base64);
    if (body.byteLength === 0) throw new Error("Selected image is empty.");
    const uploadResponse = await fetchNativeResponseWithTimeout(`${supabaseUrl}/storage/v1/object/alerts/${objectName.split("/").map((part) => encodeURIComponent(part)).join("/")}`, {
      method: "POST",
      headers: nativeBroadcastHeaders(token, {
        "cache-control": "3600",
        "content-type": "image/jpeg",
        "x-upsert": "false",
      }),
      body,
    }, NATIVE_MEDIA_UPLOAD_TIMEOUT_MS);
    if (!uploadResponse.ok) {
      const raw = await uploadResponse.text().catch(() => "");
      throw createNativeProtectedActionError({
        ok: false,
        stage: "upload",
        originalError: new Error(raw || `Upload failed (${uploadResponse.status})`),
        cleanupAttempted: false,
        cleanupResult: "not_needed",
      });
    }
  } finally {
    if (normalizedUri !== uri && normalizedUri.startsWith("file://")) {
      await FileSystem.deleteAsync(normalizedUri, { idempotent: true }).catch(() => undefined);
    }
  }
  try {
    await registerNativeMediaAsset({
      accessToken: token,
      bucket: "alerts",
      contentType: "broadcast_alert",
      objectPath: objectName,
    });
  } catch (error) {
    const cleanupResult = await requestNativeStorageCleanupResult("alerts", objectName, "register_broadcast_alert_media_failed", token);
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: error,
      cleanupAttempted: true,
      cleanupResult,
    });
  }
  if (__DEV__) {
    console.log("STORAGE_URL_GET_PUBLIC", { bucket: "alerts", path: objectName });
  }
  const publicUrl = getCachedNativeAlertPublicUrl(objectName);
  if (!publicUrl) throw new Error("Upload succeeded but public URL missing.");
  return publicUrl;
}

const alertStoragePathFromUrl = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const decodeSafe = (path: string) => {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  };
  try {
    const parsed = new URL(raw);
    const marker = "/storage/v1/object/public/alerts/";
    const markerIndex = parsed.pathname.indexOf(marker);
    const path = markerIndex >= 0 ? parsed.pathname.slice(markerIndex + marker.length) : parsed.pathname;
    const cleanPath = decodeSafe(path).replace(/^\/+/, "").replace(/^alerts\//, "");
    return cleanPath && !cleanPath.includes("..") ? cleanPath : null;
  } catch {
    const marker = "/alerts/";
    const markerIndex = raw.indexOf(marker);
    const path = markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw.replace(/^\/+/, "").replace(/^alerts\//, "");
    const cleanPath = decodeSafe(path.split("?")[0] || "").replace(/^\/+/, "");
    return cleanPath && !cleanPath.includes("..") ? cleanPath : null;
  }
};

export async function cleanupNativeBroadcastImages(urls: string[], ownerUserId?: string | null, accessToken?: string | null, sessionKey?: string | null): Promise<NativeProtectedActionCleanupResult> {
  const ownerPrefix = String(ownerUserId || "").trim();
  if (!ownerPrefix) return "not_needed";
  const session = requireNativeBroadcastSession({ accessToken, sessionKey, userId: ownerPrefix });
  const token = session.accessToken;
  const paths = Array.from(new Set(urls
    .map(alertStoragePathFromUrl)
    .filter((path): path is string => typeof path === "string" && path.startsWith(`${ownerPrefix}/`))));
  if (paths.length === 0) return "not_needed";
  let cleanupResult: NativeProtectedActionCleanupResult = "not_needed";
  for (const path of paths) {
    const nextResult = await requestNativeStorageCleanupResult("alerts", path, "delete_broadcast_alert", token);
    if (nextResult === "failed") cleanupResult = "failed";
    else if (nextResult === "deleted" && cleanupResult === "not_needed") cleanupResult = "deleted";
    else if (nextResult === "queued" && cleanupResult !== "failed") cleanupResult = "queued";
  }
  return cleanupResult;
}
