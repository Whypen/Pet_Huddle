import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { resolveNativeProfilePhotoDisplayUrl } from "./nativeProfilePhotos";
import { resolveNativeAvatarUrl, resolveNativeProfileImageUrlAsync, resolveNativeStoragePublicUrl } from "./nativeStorageUrlCache";
import { lookupNativeMapQueryCenter } from "./nativeMapMutations";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";

const MAP_PIN_SHELL_CACHE_MS = 60_000;
const mapPinShellCache = new Map<string, { rows: NativeMapPinShell[]; rowVersion: string; ts: number }>();
const mapPinShellInFlight = new Map<string, Promise<NativeMapPinShell[]>>();
const MAP_ALERT_DETAIL_CACHE_MS = 60_000;
const mapAlertDetailCache = new Map<string, { alert: NativeMapAlert; ts: number }>();

const persistentMapCacheKey = (kind: "pinShell" | "alertDetail", key: string) => `native-map:${kind}:v1:${key}`;

const nativeMapRpc = async (fn: string, params: Record<string, unknown>, accessToken?: string | null): Promise<{ data: unknown; error: unknown }> => {
  if (accessToken) {
    return nativeExactTokenRpc(fn, params, accessToken);
  }
  return { data: null, error: { message: "missing_access_token" } };
};

const readPersistentMapCache = async <T,>(key: string, maxAgeMs: number): Promise<T | null | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { ts?: number; dbConfirmedAt?: number; source?: string; status?: string; value?: T | null };
    const confirmedAt = typeof parsed.dbConfirmedAt === "number" ? parsed.dbConfirmedAt : parsed.ts;
    if (typeof confirmedAt !== "number" || Date.now() - confirmedAt > maxAgeMs) {
      await AsyncStorage.removeItem(key);
      return undefined;
    }
    return parsed.value ?? null;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return undefined;
  }
};

const writePersistentMapCache = async <T,>(key: string, value: T) => {
  try {
    const dbConfirmedAt = Date.now();
    await AsyncStorage.setItem(key, JSON.stringify({ ts: dbConfirmedAt, dbConfirmedAt, source: "db", status: "fresh", value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const invalidateNativeMapAlertCaches = async (alertId?: string | null) => {
  const cleanAlertId = String(alertId || "").trim();
  for (const key of Array.from(mapAlertDetailCache.keys())) {
    if (!cleanAlertId || key.includes(`|${cleanAlertId}|`)) mapAlertDetailCache.delete(key);
  }
  mapPinShellCache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const removals = keys.filter((key) => {
      if (key.startsWith("native-map:pinShell:v1:")) return true;
      if (!key.startsWith("native-map:alertDetail:v1:")) return false;
      return !cleanAlertId || key.includes(`|${cleanAlertId}|`);
    });
    if (removals.length > 0) await AsyncStorage.multiRemove(removals);
  } catch {
    // Cache invalidation is best-effort; DB refresh remains authoritative.
  }
};

export type NativeMapAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  title: string | null;
  description: string | null;
  photo_url: string | null;
  media_urls: string[];
  support_count: number;
  report_count: number;
  created_at: string;
  expires_at: string | null;
  range_meters: number | null;
  range_km: number | null;
  duration_hours: number | null;
  creator_id: string | null;
  has_thread: boolean;
  thread_id: string | null;
  posted_to_threads: boolean;
  post_on_social: boolean;
  social_post_id: string | null;
  social_status: string | null;
  social_url: string | null;
  is_sensitive: boolean;
  is_demo: boolean;
  location_street: string | null;
  location_district: string | null;
  creator: {
    avatar_url: string | null;
    display_name: string | null;
    social_id: string | null;
  };
  marker_state: "active" | "expired_dot";
};

export type NativeMapFriendPin = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_invisible: boolean;
  gender_genre: string | null;
  last_lat: number;
  last_lng: number;
  location_pinned_until: string | null;
  marker_state: "active";
};

export type NativeMapOwnPin = {
  lat: number;
  lng: number;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_invisible: boolean;
  marker_state: "active";
};

export type NativeMapPinShell = {
  pin_id: string;
  lat: number;
  lng: number;
  pin_type: string;
  updated_at: string;
  is_alert: boolean;
  alert_type: string | null;
  marker_state: "active" | "expired_dot";
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_invisible: boolean;
  gender_genre: string | null;
};

export type NativeMapReadOnlyData = {
  alerts: NativeMapAlert[];
  center: [number, number];
  friends: NativeMapFriendPin[];
  ownPin: NativeMapOwnPin | null;
};

type VisibleMapAlertRow = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  title: string | null;
  description?: string | null;
  photo_url?: string | null;
  media_urls?: string[] | null;
  support_count?: number | null;
  report_count?: number | null;
  created_at?: string | null;
  expires_at?: string | null;
  duration_hours?: number | null;
  range_meters?: number | null;
  range_km?: number | null;
  creator_id: string | null;
  thread_id?: string | null;
  posted_to_threads?: boolean | null;
  post_on_social?: boolean | null;
  social_post_id?: string | null;
  social_status?: string | null;
  social_url?: string | null;
  is_sensitive?: boolean | null;
  is_demo?: boolean | null;
  location_street?: string | null;
  location_district?: string | null;
  creator_display_name?: string | null;
  creator_social_id?: string | null;
  creator_avatar_url?: string | null;
  marker_state: "active" | "expired_dot" | "hidden" | null;
};

type FriendPinRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  last_lat: number | null;
  last_lng: number | null;
  location_pinned_until: string | null;
  marker_state?: string | null;
};

type FriendProfileRow = {
  id: string;
  is_verified?: boolean | null;
  gender_genre?: string | null;
  hide_from_map?: boolean | null;
};

type VisibleMapPinShellRow = {
  pin_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  pin_type?: string | null;
  updated_at?: string | null;
  is_alert?: boolean | null;
  alert_type?: string | null;
  marker_state?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  is_invisible?: boolean | null;
  gender_genre?: string | null;
};

const DEFAULT_CENTER: [number, number] = [114.1583, 22.2828];
const VIEW_RADIUS_METERS = 50000;
const ALERT_TYPE_PRIORITY: Record<string, number> = {
  lost: 0,
  caution: 1,
  stray: 2,
  others: 3,
  other: 3,
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const resolveNativeAlertMediaUrl = (value: unknown): string | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (/^data:image\//i.test(raw)) return raw;
  return resolveNativeStoragePublicUrl("alerts", raw);
};

const normalizeNativeAlertMediaUrls = (row: VisibleMapAlertRow) => {
  const source = Array.isArray(row.media_urls) && row.media_urls.length > 0
    ? row.media_urls
    : row.photo_url
      ? [row.photo_url]
      : [];
  const mediaUrls = Array.from(new Set(source.map(resolveNativeAlertMediaUrl).filter((url): url is string => Boolean(url))));
  const photoUrl = resolveNativeAlertMediaUrl(row.photo_url) || mediaUrls[0] || null;
  return { mediaUrls, photoUrl };
};

const resolveNativeMapAvatarUrl = async (value: unknown): Promise<string | null> => (
  (await resolveNativeProfileImageUrlAsync(value, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null))
  ?? resolveNativeAvatarUrl(value)
  ?? (await resolveNativeProfilePhotoDisplayUrl(typeof value === "string" ? value : null).catch(() => null))
);

const timeValue = (value: string | null | undefined) => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const distanceScore = (alert: NativeMapAlert, center: [number, number]) => {
  const latDelta = alert.latitude - center[1];
  const lngDelta = alert.longitude - center[0];
  return (latDelta * latDelta) + (lngDelta * lngDelta);
};

export const sortNativeMapAlertsForDisplay = (items: NativeMapAlert[], center: [number, number]) => (
  [...items].sort((left, right) => {
    if (left.marker_state !== right.marker_state) return left.marker_state === "active" ? -1 : 1;
    const leftPriority = ALERT_TYPE_PRIORITY[String(left.alert_type || "").toLowerCase()] ?? ALERT_TYPE_PRIORITY.others;
    const rightPriority = ALERT_TYPE_PRIORITY[String(right.alert_type || "").toLowerCase()] ?? ALERT_TYPE_PRIORITY.others;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    if (left.support_count !== right.support_count) return right.support_count - left.support_count;
    const leftTime = timeValue(left.expires_at) || timeValue(left.created_at);
    const rightTime = timeValue(right.expires_at) || timeValue(right.created_at);
    if (leftTime !== rightTime) return rightTime - leftTime;
    return distanceScore(left, center) - distanceScore(right, center);
  })
);

export async function loadNativeBlockedUserIds(userId: string, accessToken?: string | null): Promise<Set<string>> {
  if (!accessToken) throw new Error("missing_access_token");
  const { data, error } = await nativeMapRpc("get_native_map_blocked_user_ids", {}, accessToken);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  const ids = new Set<string>();
  rows.forEach((row) => {
    const record = row as { user_id?: unknown };
    const blockedId = typeof record.user_id === "string" ? record.user_id : null;
    if (blockedId && blockedId !== userId) ids.add(blockedId);
  });
  return ids;
}

async function deriveOwnPin(profile: Record<string, unknown> | null | undefined): Promise<NativeMapOwnPin | null> {
  const lat = isFiniteNumber(profile?.last_lat) ? profile?.last_lat : profile?.latitude;
  const lng = isFiniteNumber(profile?.last_lng) ? profile?.last_lng : profile?.longitude;
  const pinnedUntil = typeof profile?.location_pinned_until === "string" ? profile.location_pinned_until : null;
  if (!pinnedUntil) return null;
  const pinnedUntilMs = new Date(pinnedUntil).getTime();
  if (!Number.isFinite(pinnedUntilMs) || pinnedUntilMs <= Date.now()) return null;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  const avatarUrl = await resolveNativeProfilePhotoDisplayUrl(typeof profile?.avatar_url === "string" ? profile.avatar_url : null);
  return {
    lat,
    lng,
    display_name: typeof profile?.display_name === "string" ? profile.display_name : null,
    avatar_url: avatarUrl,
    is_verified: isNativeVerifiedProfile(profile),
    is_invisible: profile?.hide_from_map === true,
    marker_state: "active",
  };
}

async function mapAlert(row: VisibleMapAlertRow): Promise<NativeMapAlert | null> {
  if (!isFiniteNumber(row.latitude) || !isFiniteNumber(row.longitude)) return null;
  if (row.marker_state === "hidden") return null;
  const { mediaUrls, photoUrl } = normalizeNativeAlertMediaUrls(row);
  const creatorAvatarUrl = await resolveNativeMapAvatarUrl(row.creator_avatar_url);
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    alert_type: row.alert_type,
    title: row.title ?? null,
    description: row.description ?? null,
    photo_url: photoUrl,
    media_urls: mediaUrls,
    support_count: row.support_count ?? 0,
    report_count: row.report_count ?? 0,
    created_at: row.created_at || new Date().toISOString(),
    expires_at: row.expires_at ?? null,
    duration_hours: row.duration_hours ?? null,
    range_meters: row.range_meters ?? null,
    range_km: row.range_km ?? null,
    creator_id: row.creator_id ?? null,
    thread_id: row.thread_id ?? null,
    has_thread: Boolean(row.thread_id || row.social_post_id),
    posted_to_threads: row.posted_to_threads === true,
    post_on_social: row.post_on_social === true,
    social_post_id: row.social_post_id ?? null,
    social_status: row.social_status ?? null,
    social_url: row.social_url ?? null,
    is_sensitive: row.is_sensitive === true,
    is_demo: row.is_demo === true,
    location_street: row.location_street ?? null,
    location_district: row.location_district ?? null,
    creator: {
      avatar_url: creatorAvatarUrl,
      display_name: row.creator_display_name ?? null,
      social_id: row.creator_social_id ?? null,
    },
    marker_state: row.marker_state === "expired_dot" ? "expired_dot" : "active",
  };
}


export async function fetchNativeMapOwnPin(userId: string, options: { accessToken?: string | null } = {}): Promise<NativeMapOwnPin | null> {
  const { profile } = await fetchNativeProfileSummary(userId, { force: true, accessToken: options.accessToken });
  return deriveOwnPin((profile || null) as Record<string, unknown> | null);
}

export async function fetchVisibleMapPinShells(center: [number, number], radiusMeters = 25000, options?: { accessToken?: string | null; viewerId?: string | null; sessionKey?: string | null; force?: boolean; cacheWriteGuard?: () => boolean }): Promise<NativeMapPinShell[]> {
  const cappedRadius = Math.max(0, Math.min(radiusMeters, 25000));
  const cacheKey = `${options?.sessionKey || options?.viewerId || "anon"}|${center[0].toFixed(3)}|${center[1].toFixed(3)}|${cappedRadius}`;
  const cached = mapPinShellCache.get(cacheKey);
  if (!options?.force && cached && Date.now() - cached.ts < MAP_PIN_SHELL_CACHE_MS && !(options?.accessToken && cached.rows.length === 0)) {
    if (__DEV__) console.log("NATIVE_MAP_SHELL_CACHE_HIT", { cacheKey, count: cached.rows.length });
    return cached.rows;
  }
  const inFlight = mapPinShellInFlight.get(cacheKey);
  if (!options?.force && inFlight) return inFlight;
  const persistentKey = persistentMapCacheKey("pinShell", cacheKey);
  if (!options?.force) {
    const persistent = await readPersistentMapCache<{ rows: NativeMapPinShell[]; rowVersion: string }>(persistentKey, MAP_PIN_SHELL_CACHE_MS);
    if (persistent?.rows && !(options?.accessToken && persistent.rows.length === 0)) {
      mapPinShellCache.set(cacheKey, { rows: persistent.rows, rowVersion: persistent.rowVersion || "", ts: Date.now() });
      if (__DEV__) console.log("NATIVE_MAP_SHELL_ASYNC_CACHE_HIT", { cacheKey, count: persistent.rows.length });
      return persistent.rows;
    }
  }
  if (!options?.accessToken) throw new Error("missing_access_token");
  if (__DEV__) console.log("NATIVE_MAP_SHELL_CACHE_MISS", { cacheKey });
  const request = (async () => {
    const { data, error } = await nativeMapRpc("get_visible_map_pin_shells", {
      p_lat: center[1],
      p_lng: center[0],
      p_radius_m: cappedRadius,
    }, options?.accessToken);

    if (__DEV__) {
      console.log("NATIVE_MAP_SHELLS_FETCHED", {
        center,
        radius: cappedRadius,
        error: error ? String((error as { message?: unknown }).message || error) : null,
        count: Array.isArray(data) ? data.length : null,
        sample: Array.isArray(data) ? data.slice(0, 3) : data,
      });
    }

    if (error) throw error;

    const rows = (await Promise.all((Array.isArray(data) ? data as VisibleMapPinShellRow[] : [])
      .map(async (row) => {
        const avatarUrl = await resolveNativeMapAvatarUrl(row.avatar_url);
        if (__DEV__) {
          console.log("NATIVE_MAP_PIN_SHELL_AVATAR_MAPPED", {
            pinId: row.pin_id ?? null,
            rawAvatarUrl: row.avatar_url ?? null,
            mappedAvatarUrl: avatarUrl,
            rawIsFullUrl: typeof row.avatar_url === "string" ? /^(data:|blob:|https?:\/\/)/i.test(row.avatar_url.trim()) : false,
          });
        }
        return {
          pin_id: String(row.pin_id || "").trim(),
          lat: Number(row.lat),
          lng: Number(row.lng),
          pin_type: String(row.pin_type || (row.is_alert ? "alert" : "user")).trim().toLowerCase(),
          updated_at: String(row.updated_at || ""),
          is_alert: row.is_alert === true,
          alert_type: typeof row.alert_type === "string" && row.alert_type.trim() ? row.alert_type : null,
          marker_state: (row.marker_state === "expired_dot" ? "expired_dot" : "active") as "active" | "expired_dot",
          display_name: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : null,
          avatar_url: avatarUrl,
          is_verified: isNativeVerifiedProfile(row),
          is_invisible: row.is_invisible === true,
          gender_genre: typeof row.gender_genre === "string" && row.gender_genre.trim() ? row.gender_genre : null,
        };
      })))
      .filter((row) =>
        row.pin_id &&
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lng) &&
        row.updated_at
      );
    const rowVersion = rows.map((row) => `${row.pin_id}:${row.updated_at}`).sort().join("|");
    if ((rows.length > 0 || !options?.accessToken) && options?.cacheWriteGuard?.() !== false) {
      mapPinShellCache.set(cacheKey, { rows, rowVersion, ts: Date.now() });
      void writePersistentMapCache(persistentKey, { rows, rowVersion });
    }
    return rows;
  })().finally(() => {
    if (mapPinShellInFlight.get(cacheKey) === request) mapPinShellInFlight.delete(cacheKey);
  });
  mapPinShellInFlight.set(cacheKey, request);
  return request;
}

export async function fetchNativeMapAlertById(alertId: string, viewerId: string, options?: { accessToken?: string | null; sessionKey?: string | null; source?: "alert" | "thread"; updatedAt?: string | null; force?: boolean; cacheWriteGuard?: () => boolean }): Promise<NativeMapAlert | null> {
  const cacheKey = `${viewerId || "anon"}|${options?.sessionKey || `${viewerId || "anon"}:0`}|${alertId}|${options?.source || "alert"}|${options?.updatedAt || "unknown"}`;
  const cached = mapAlertDetailCache.get(cacheKey);
  if (!options?.force && cached && Date.now() - cached.ts < MAP_ALERT_DETAIL_CACHE_MS) {
    return cached.alert;
  }
  const persistentKey = persistentMapCacheKey("alertDetail", cacheKey);
  const persistent = options?.force ? undefined : await readPersistentMapCache<NativeMapAlert>(persistentKey, MAP_ALERT_DETAIL_CACHE_MS);
  if (!options?.force && persistent !== undefined) {
    if (!persistent) return null;
    mapAlertDetailCache.set(cacheKey, { alert: persistent, ts: Date.now() });
    if (__DEV__) console.log("NATIVE_MAP_ALERT_DETAIL_ASYNC_CACHE_HIT", { cacheKey, hasAlert: Boolean(persistent) });
    return persistent;
  }
  if (!options?.accessToken) throw new Error("missing_access_token");
  const blockedIds = await loadNativeBlockedUserIds(viewerId, options.accessToken);
  let resolvedAlertId = alertId;
  if (options?.source === "thread" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedAlertId)) {
    const { data: contextRows, error: contextError } = await nativeMapRpc("get_social_feed_alert_context", {
      p_thread_ids: [alertId],
    }, options?.accessToken);
    if (contextError) throw contextError;
    const row = Array.isArray(contextRows) ? contextRows[0] as { map_id?: string | null } | undefined : undefined;
    resolvedAlertId = String(row?.map_id || "").trim();
    if (!resolvedAlertId) {
      return null;
    }
  }
  const { data, error } = await nativeMapRpc("get_broadcast_alert_by_id", {
    p_alert_id: resolvedAlertId,
  }, options?.accessToken);
  if (error) {
    throw error;
  }
  const rows = Array.isArray(data) ? data as VisibleMapAlertRow[] : [];
  const mapped = (await Promise.all(rows.map(mapAlert))).filter((alert): alert is NativeMapAlert => Boolean(alert));
  if (__DEV__) {
    console.log("NATIVE_MAP_ALERT_DETAIL_AVATAR_MAPPED", {
      alertId: resolvedAlertId,
      rawAvatarUrls: rows.slice(0, 3).map((row) => row.creator_avatar_url ?? null),
      mappedAvatarUrls: mapped.slice(0, 3).map((alert) => alert.creator.avatar_url),
      rawAvatarKinds: rows.slice(0, 3).map((row) => {
        const raw = typeof row.creator_avatar_url === "string" ? row.creator_avatar_url.trim() : "";
        if (!raw) return "empty";
        return /^(data:|blob:|https?:\/\/)/i.test(raw) ? "full_url" : "storage_path";
      }),
    });
  }
  const match = mapped.find((alert) => !(alert.creator_id && blockedIds.has(alert.creator_id))) ?? null;
  if (match && options?.cacheWriteGuard?.() !== false) {
    mapAlertDetailCache.set(cacheKey, { alert: match, ts: Date.now() });
    void writePersistentMapCache(persistentKey, match);
  }
  if (!match) return null;
  return match;
}
