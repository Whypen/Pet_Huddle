import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { resolveNativeProfilePhotoDisplayUrl } from "./nativeProfilePhotos";
import { resolveNativeAvatarUrl, resolveNativeProfileImageUrlAsync, resolveNativeStoragePublicUrl } from "./nativeStorageUrlCache";
import { lookupNativeMapQueryCenter } from "./nativeMapMutations";
import { parseNativeMapAnonymousAreas, parseNativeMapAreaCell } from "./nativeMapPeopleV2";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import { normalizeNativeMapPrecision, type NativeMapPrecision } from "./nativeMapPrecision";
import { readNativeDisplayCacheKeys } from "./nativeDisplayCacheStorage";

const MAP_PIN_SHELL_CACHE_MS = 60_000;
const mapPinShellCache = new Map<string, { rows: NativeMapPinShell[]; rowVersion: string; ts: number }>();
const mapPinShellInFlight = new Map<string, Promise<NativeMapPinShell[]>>();
const mapPeopleV2Cache = new Map<string, { value: NativeMapPeopleV2; ts: number }>();
const mapPeopleV2InFlight = new Map<string, Promise<NativeMapPeopleV2>>();
const MAP_ALERT_DETAIL_CACHE_MS = 60_000;
const MAP_ALERT_HANDOFF_CACHE_MS = 10 * 60_000;
const mapAlertDetailCache = new Map<string, { alert: NativeMapAlert; ts: number }>();
const mapAlertDetailInFlight = new Map<string, Promise<NativeMapAlert | null>>();
const canonicalMapAlertCache = new Map<string, { alert: NativeMapAlert; ts: number }>();
const MAP_BLOCKED_USERS_CACHE_MS = 60_000;
const mapBlockedUsersCache = new Map<string, { ids: Set<string>; ts: number }>();
const mapBlockedUsersInFlight = new Map<string, Promise<Set<string>>>();
let nativeMapCacheGeneration = 0;

const canonicalMapAlertCacheKey = (
  alertId: string,
  viewerId: string,
  sessionKey?: string | null,
  shareToken?: string | null,
) => `${viewerId || "anon"}|${sessionKey || `${viewerId || "anon"}:0`}|${alertId}|${String(shareToken || "").trim() || "ordinary"}`;

const nativeMapRpc = async (fn: string, params: Record<string, unknown>, accessToken?: string | null): Promise<{ data: unknown; error: unknown }> => {
  return nativeExactTokenRpc(fn, params, accessToken);
};

const parseNativeMapTimestampMs = (value: unknown): number | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const isNativeOwnPinWindowVisible = (
  pinnedUntil: unknown,
  retentionUntil: unknown,
  nowMs = Date.now(),
) => {
  const pinnedUntilMs = parseNativeMapTimestampMs(pinnedUntil);
  const retentionUntilMs = parseNativeMapTimestampMs(retentionUntil);
  return (
    (pinnedUntilMs !== null && pinnedUntilMs > nowMs) ||
    (retentionUntilMs !== null && retentionUntilMs > nowMs)
  );
};

// Stored location may be retained after sharing ends. Only the explicit
// visibility window is allowed to drive an active self-pin UI state.
export const isNativeMapSharingWindowVisible = (
  visibleUntil: unknown,
  nowMs = Date.now(),
) => {
  const visibleUntilMs = parseNativeMapTimestampMs(visibleUntil);
  return visibleUntilMs !== null && visibleUntilMs > nowMs;
};

export const clearNativeMapCaches = async () => {
  nativeMapCacheGeneration += 1;
  mapPinShellCache.clear();
  mapPinShellInFlight.clear();
  mapPeopleV2Cache.clear();
  mapPeopleV2InFlight.clear();
  mapAlertDetailCache.clear();
  mapAlertDetailInFlight.clear();
  canonicalMapAlertCache.clear();
  mapBlockedUsersCache.clear();
  mapBlockedUsersInFlight.clear();
  notifyVisibleUserPinIds();
  try {
    const keys = await readNativeDisplayCacheKeys();
    const removals = keys.filter((key) => (
      key.startsWith("native-map:") || key.startsWith("huddle:native-map-")
    ));
    if (removals.length > 0) await AsyncStorage.multiRemove(removals);
  } catch {
    // Session teardown remains authoritative even if best-effort disk cleanup fails.
  }
};

// Map people, pin-shell, and alert-detail data is memory-only. Sweep every
// historical per-viewport record plus pre-v8 session snapshots, which included
// friend/own-pin coordinates. The current v8 snapshot contains camera, alert,
// and anonymous-area state only.
export const purgeNativeMapPersistentCaches = async () => {
  try {
    const keys = await readNativeDisplayCacheKeys();
    const removals = keys.filter((key) => (
      key.startsWith("native-map:")
      || /^huddle:native-map-session:v[1-7]:/.test(key)
    ));
    if (removals.length > 0) await AsyncStorage.multiRemove(removals);
  } catch {
    // Foreground/startup cleanup is best-effort; current code does not write
    // these private persistent cache families.
  }
};

export const invalidateNativeMapAlertCaches = async (alertId?: string | null) => {
  const cleanAlertId = String(alertId || "").trim();
  for (const key of Array.from(mapAlertDetailCache.keys())) {
    if (!cleanAlertId || key.includes(`|${cleanAlertId}|`)) mapAlertDetailCache.delete(key);
  }
  for (const key of Array.from(canonicalMapAlertCache.keys())) {
    if (!cleanAlertId || key.includes(`|${cleanAlertId}|`)) canonicalMapAlertCache.delete(key);
  }
  mapPinShellCache.clear();
  mapPeopleV2Cache.clear();
};

export type NativeMapAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  pet_type: string | null;
  title: string | null;
  description: string | null;
  photo_url: string | null;
  media_urls: string[];
  support_count: number;
  share_count?: number;
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
  verified_only?: boolean;
  share_access_token?: string | null;
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
  is_approximate: boolean;
  area_key: string | null;
  gender_genre: string | null;
  last_lat: number;
  last_lng: number;
  location_pinned_until: string | null;
  marker_state: "active";
};

export type NativeMapAnonymousArea = {
  clusterKey: string;
  lat: number;
  lng: number;
  count: number;
};

export type NativeMapPeopleV2 = {
  connections: NativeMapFriendPin[];
  anonymousAreas: NativeMapAnonymousArea[];
  geometryVersion: 1 | 2;
  nextRefreshAt: string | null;
  viewerArea: NativeMapAreaCell | null;
};

export type NativeMapAreaCell = {
  areaKey: string;
  lat: number;
  lng: number;
};

export type NativeMapOwnPin = {
  lat: number;
  lng: number;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_invisible: boolean;
  map_precision: NativeMapPrecision;
  map_visible_until: string | null;
  marker_state: "active";
};

export type NativePetPoi = {
  id: string;
  name: string | null;
  type: string;
  lat: number;
  lng: number;
  address: string | null;
  district: string | null;
  phone: string | null;
  website: string | null;
  source: string;
  source_url: string | null;
  admin_verified: boolean;
};

export type NativeMapPinShell = {
  pin_id: string;
  lat: number;
  lng: number;
  pin_type: string;
  updated_at: string;
  is_alert: boolean;
  alert_type: string | null;
  pet_type: string | null;
  creator_id: string | null;
  range_meters: number | null;
  range_km: number | null;
  marker_state: "active" | "expired_dot";
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_invisible: boolean;
  is_approximate: boolean;
  verified_only: boolean;
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
  pet_type?: string | null;
  title: string | null;
  description?: string | null;
  photo_url?: string | null;
  media_urls?: string[] | null;
  support_count?: number | null;
  share_count?: number | null;
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
  verified_only?: boolean | null;
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
  map_precision?: string | null;
  map_visible_until?: string | null;
};

type VisibleMapPinShellRow = {
  pin_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  pin_type?: string | null;
  updated_at?: string | null;
  is_alert?: boolean | null;
  alert_type?: string | null;
  pet_type?: string | null;
  creator_id?: string | null;
  range_meters?: number | null;
  range_km?: number | null;
  marker_state?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  is_invisible?: boolean | null;
  is_approximate?: boolean | null;
  verified_only?: boolean | null;
  gender_genre?: string | null;
};

type VisiblePetPoiRow = {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  district?: string | null;
  phone?: string | null;
  website?: string | null;
  source?: string | null;
  source_url?: string | null;
  admin_verified?: boolean | null;
};

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
  const cacheGeneration = nativeMapCacheGeneration;
  const cacheKey = userId || "anon";
  const cached = mapBlockedUsersCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MAP_BLOCKED_USERS_CACHE_MS) return new Set(cached.ids);
  const existing = mapBlockedUsersInFlight.get(cacheKey);
  if (existing) return existing.then((ids) => new Set(ids));
  const request = (async () => {
    const { data, error } = await nativeMapRpc("get_native_map_blocked_user_ids", {}, accessToken);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const ids = new Set<string>();
    rows.forEach((row) => {
      const record = row as { user_id?: unknown };
      const blockedId = typeof record.user_id === "string" ? record.user_id : null;
      if (blockedId && blockedId !== userId) ids.add(blockedId);
    });
    if (cacheGeneration === nativeMapCacheGeneration) mapBlockedUsersCache.set(cacheKey, { ids, ts: Date.now() });
    return ids;
  })().finally(() => {
    if (mapBlockedUsersInFlight.get(cacheKey) === request) mapBlockedUsersInFlight.delete(cacheKey);
  });
  mapBlockedUsersInFlight.set(cacheKey, request);
  return request.then((ids) => new Set(ids));
}

async function deriveOwnPin(
  profile: Record<string, unknown> | null | undefined,
  options: { accessToken?: string | null } = {},
): Promise<NativeMapOwnPin | null> {
  void options;
  const lat = isFiniteNumber(profile?.last_lat) ? profile?.last_lat : profile?.latitude;
  const lng = isFiniteNumber(profile?.last_lng) ? profile?.last_lng : profile?.longitude;
  const visibleUntil = typeof profile?.map_visible_until === "string" ? profile.map_visible_until : null;
  if (!isNativeMapSharingWindowVisible(visibleUntil)) return null;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  const avatarUrl = await resolveNativeProfilePhotoDisplayUrl(typeof profile?.avatar_url === "string" ? profile.avatar_url : null);
  return {
    lat,
    lng,
    display_name: typeof profile?.display_name === "string" ? profile.display_name : null,
    avatar_url: avatarUrl,
    is_verified: isNativeVerifiedProfile(profile),
    is_invisible: profile?.hide_from_map === true || profile?.map_precision === "hidden",
    map_precision: normalizeNativeMapPrecision(profile?.map_precision),
    map_visible_until: visibleUntil,
    marker_state: "active",
  };
}

export async function deriveNativeMapOwnPinFromProfile(
  profile: Record<string, unknown> | null | undefined,
  options: { accessToken?: string | null } = {},
): Promise<NativeMapOwnPin | null> {
  return deriveOwnPin(profile, options);
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
    pet_type: typeof row.pet_type === "string" && row.pet_type.trim() ? row.pet_type.trim() : null,
    title: row.title ?? null,
    description: row.description ?? null,
    photo_url: photoUrl,
    media_urls: mediaUrls,
    support_count: row.support_count ?? 0,
    share_count: row.share_count ?? 0,
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
    verified_only: row.verified_only === true,
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


export async function fetchNativeMapOwnPin(userId: string, options: { accessToken?: string | null; force?: boolean; sessionKey?: string | null } = {}): Promise<NativeMapOwnPin | null> {
  const { profile } = await fetchNativeProfileSummary(userId, {
    force: options.force === true,
    accessToken: options.accessToken,
    sessionKey: options.sessionKey,
  });
  return deriveNativeMapOwnPinFromProfile((profile || null) as Record<string, unknown> | null, { accessToken: options.accessToken });
}

/// Cache-only peek at the ids of currently-visible ACTIVE user pins across every
/// fresh in-memory shell cache entry. Never triggers a fetch — list-surface
/// accents (e.g. the groups-list live dot) intersect against this and simply
/// show nothing when the cache is cold. Honest degradation over N new queries.
export function peekVisibleUserPinIds(): Set<string> {
  const ids = new Set<string>();
  const now = Date.now();
  mapPinShellCache.forEach((entry) => {
    if (now - entry.ts >= MAP_PIN_SHELL_CACHE_MS) return;
    entry.rows.forEach((row) => {
      if (!row.is_alert && row.marker_state === "active" && row.pin_id) ids.add(row.pin_id);
    });
  });
  return ids;
}

const visibleUserPinListeners = new Set<(ids: Set<string>) => void>();

export function subscribeVisibleUserPinIds(listener: (ids: Set<string>) => void): () => void {
  visibleUserPinListeners.add(listener);
  listener(peekVisibleUserPinIds());
  return () => { visibleUserPinListeners.delete(listener); };
}

const notifyVisibleUserPinIds = () => {
  if (visibleUserPinListeners.size === 0) return;
  const ids = peekVisibleUserPinIds();
  visibleUserPinListeners.forEach((listener) => listener(ids));
};

export async function fetchNativeMapPeopleV2(
  center: [number, number],
  radiusMeters = 25000,
  options: { accessToken?: string | null; viewerId?: string | null; sessionKey?: string | null; force?: boolean; cacheWriteGuard?: () => boolean } = {},
): Promise<NativeMapPeopleV2> {
  const cacheGeneration = nativeMapCacheGeneration;
  const cappedRadius = Math.max(0, Math.min(radiusMeters, 25000));
  const cacheKey = `${options.sessionKey || options.viewerId || "anon"}|${center[0].toFixed(3)}|${center[1].toFixed(3)}|${cappedRadius}`;
  const cached = mapPeopleV2Cache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.ts < MAP_PIN_SHELL_CACHE_MS) return cached.value;
  const inFlight = mapPeopleV2InFlight.get(cacheKey);
  if (inFlight) return inFlight;
  const request = (async () => {
    const params = {
      p_lat: center[1],
      p_lng: center[0],
      p_radius_m: cappedRadius,
    };
    let geometryVersion: 1 | 2 = 2;
    let { data, error } = await nativeMapRpc("get_native_map_people_v3", params, options.accessToken);
    const rpcError = error as { code?: unknown; status?: unknown } | null;
    const missingVersionedRpc = rpcError?.code === "PGRST202" || rpcError?.status === 404;
    if (missingVersionedRpc) {
      geometryVersion = 1;
      ({ data, error } = await nativeMapRpc("get_native_map_people_v2", params, options.accessToken));
    }
    if (error) throw error;
    const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    if (record.geometryVersion === 2) geometryVersion = 2;
    const connections = await Promise.all((Array.isArray(record.connections) ? record.connections : []).map(async (value, index) => {
      const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      const isInvisible = row.isInvisible === true;
      const serverId = String(row.id || "").trim();
      const id = isInvisible
        ? `incognito:${index}:${lat.toFixed(5)}:${lng.toFixed(5)}`
        : serverId;
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id,
        display_name: !isInvisible && typeof row.displayName === "string" && row.displayName.trim() ? row.displayName : null,
        avatar_url: isInvisible ? null : await resolveNativeMapAvatarUrl(typeof row.avatarUrl === "string" ? row.avatarUrl : null),
        is_verified: !isInvisible && row.isVerified === true,
        is_invisible: isInvisible,
        is_approximate: true,
        area_key: typeof row.areaKey === "string" && row.areaKey.trim() ? row.areaKey.trim() : null,
        gender_genre: !isInvisible && typeof row.genderGenre === "string" && row.genderGenre.trim() ? row.genderGenre : null,
        last_lat: lat,
        last_lng: lng,
        location_pinned_until: !isInvisible && typeof row.visibleUntil === "string" ? row.visibleUntil : null,
        marker_state: "active" as const,
      };
    }));
    const anonymousAreas = parseNativeMapAnonymousAreas(record.anonymousAreas);
    const result: NativeMapPeopleV2 = {
      connections: connections.filter((row): row is NativeMapFriendPin => row !== null),
      anonymousAreas,
      geometryVersion,
      nextRefreshAt: typeof record.nextRefreshAt === "string" && Number.isFinite(Date.parse(record.nextRefreshAt)) ? record.nextRefreshAt : null,
      viewerArea: geometryVersion === 2 ? parseNativeMapAreaCell(record.viewerArea) : null,
    };
    if (cacheGeneration === nativeMapCacheGeneration && options.cacheWriteGuard?.() !== false) {
      mapPeopleV2Cache.set(cacheKey, { value: result, ts: Date.now() });
    }
    return result;
  })().finally(() => {
    if (mapPeopleV2InFlight.get(cacheKey) === request) mapPeopleV2InFlight.delete(cacheKey);
  });
  mapPeopleV2InFlight.set(cacheKey, request);
  return request;
}

export async function fetchVisibleMapPinShells(center: [number, number], radiusMeters = 25000, options?: { accessToken?: string | null; viewerId?: string | null; sessionKey?: string | null; force?: boolean; cacheWriteGuard?: () => boolean }): Promise<NativeMapPinShell[]> {
  const cacheGeneration = nativeMapCacheGeneration;
  const cappedRadius = Math.max(0, Math.min(radiusMeters, 25000));
  const cacheKey = `${options?.sessionKey || options?.viewerId || "anon"}|${center[0].toFixed(3)}|${center[1].toFixed(3)}|${cappedRadius}`;
  const cached = mapPinShellCache.get(cacheKey);
  if (!options?.force && cached && Date.now() - cached.ts < MAP_PIN_SHELL_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_MAP_SHELL_CACHE_HIT", { cacheKey, count: cached.rows.length });
    return cached.rows;
  }
  const inFlight = mapPinShellInFlight.get(cacheKey);
  if (inFlight) return inFlight;
  if (__DEV__) console.log("NATIVE_MAP_SHELL_CACHE_MISS", { cacheKey });
  const request = (async () => {
    const { data, error } = await nativeMapRpc("get_visible_map_pin_shells_with_audience", {
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
          pet_type: typeof row.pet_type === "string" && row.pet_type.trim() ? row.pet_type.trim() : null,
          creator_id: typeof row.creator_id === "string" && row.creator_id.trim() ? row.creator_id.trim() : null,
          range_meters: Number.isFinite(Number(row.range_meters)) ? Math.round(Number(row.range_meters)) : null,
          range_km: Number.isFinite(Number(row.range_km)) ? Number(row.range_km) : null,
          marker_state: (row.marker_state === "expired_dot" ? "expired_dot" : "active") as "active" | "expired_dot",
          display_name: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : null,
          avatar_url: avatarUrl,
          is_verified: isNativeVerifiedProfile(row),
          is_invisible: row.is_invisible === true,
          is_approximate: row.is_approximate === true,
          verified_only: row.verified_only === true,
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
    if (cacheGeneration === nativeMapCacheGeneration && options?.cacheWriteGuard?.() !== false) {
      mapPinShellCache.set(cacheKey, { rows, rowVersion, ts: Date.now() });
      notifyVisibleUserPinIds();
    }
    return rows;
  })().finally(() => {
    if (mapPinShellInFlight.get(cacheKey) === request) mapPinShellInFlight.delete(cacheKey);
  });
  mapPinShellInFlight.set(cacheKey, request);
  return request;
}

export async function fetchVisiblePetPois(
  bounds: { west: number; south: number; east: number; north: number },
  options: { accessToken?: string | null; limit?: number; regionKey?: string | null; countryCode?: string | null } = {},
): Promise<NativePetPoi[]> {
  const west = Number(bounds.west);
  const south = Number(bounds.south);
  const east = Number(bounds.east);
  const north = Number(bounds.north);
  if (![west, south, east, north].every(Number.isFinite)) return [];
  const limit = Math.max(1, Math.min(Number(options.limit || 300), 300));
  const { data, error } = await nativeMapRpc("get_visible_pet_pois", {
    p_west: west,
    p_south: south,
    p_east: east,
    p_north: north,
    p_limit: limit,
    p_region_key: options.regionKey || "HK",
    p_country_code: options.countryCode || "HK",
  }, options.accessToken);
  if (error) throw error;
  const rows = Array.isArray(data) ? data as VisiblePetPoiRow[] : [];
  return rows.map((row) => ({
    id: String(row.id || "").trim(),
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
    type: String(row.type || "").trim(),
    lat: Number(row.lat),
    lng: Number(row.lng),
    address: typeof row.address === "string" && row.address.trim() ? row.address.trim() : null,
    district: typeof row.district === "string" && row.district.trim() ? row.district.trim() : null,
    phone: typeof row.phone === "string" && row.phone.trim() ? row.phone.trim() : null,
    website: typeof row.website === "string" && row.website.trim() ? row.website.trim() : null,
    source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : "osm",
    source_url: typeof row.source_url === "string" && row.source_url.trim() ? row.source_url.trim() : null,
    admin_verified: row.admin_verified === true,
  })).filter((row) =>
    row.id &&
    row.type &&
    Number.isFinite(row.lat) &&
    Number.isFinite(row.lng)
  );
}

export function peekNativeMapAlertById(
  alertId: string,
  viewerId: string,
  options?: { sessionKey?: string | null; shareToken?: string | null },
): NativeMapAlert | null {
  const key = canonicalMapAlertCacheKey(alertId, viewerId, options?.sessionKey, options?.shareToken);
  const cached = canonicalMapAlertCache.get(key);
  if (!cached || Date.now() - cached.ts >= MAP_ALERT_HANDOFF_CACHE_MS) {
    if (cached) canonicalMapAlertCache.delete(key);
    return null;
  }
  return cached.alert;
}

export async function fetchNativeMapAlertById(alertId: string, viewerId: string, options?: { accessToken?: string | null; sessionKey?: string | null; shareToken?: string | null; source?: "alert" | "thread"; updatedAt?: string | null; force?: boolean; cacheWriteGuard?: () => boolean }): Promise<NativeMapAlert | null> {
  const cacheGeneration = nativeMapCacheGeneration;
  const shareToken = String(options?.shareToken || "").trim();
  const canonicalKey = canonicalMapAlertCacheKey(alertId, viewerId, options?.sessionKey, shareToken);
  const canonical = canonicalMapAlertCache.get(canonicalKey);
  if (!options?.force && canonical && Date.now() - canonical.ts < MAP_ALERT_HANDOFF_CACHE_MS) {
    return canonical.alert;
  }
  const cacheKey = `${viewerId || "anon"}|${options?.sessionKey || `${viewerId || "anon"}:0`}|${alertId}|${options?.source || "alert"}|${options?.updatedAt || "unknown"}|${shareToken || "ordinary"}`;
  const cached = mapAlertDetailCache.get(cacheKey);
  if (!options?.force && cached && Date.now() - cached.ts < MAP_ALERT_DETAIL_CACHE_MS) {
    canonicalMapAlertCache.set(canonicalKey, cached);
    return cached.alert;
  }
  const existing = !options?.force ? mapAlertDetailInFlight.get(cacheKey) : null;
  if (existing) return existing;
  const request = (async () => {
    let resolvedAlertId = alertId;
    if (options?.source === "thread" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedAlertId)) {
      const { data: contextRows, error: contextError } = await nativeMapRpc("get_social_feed_alert_context", {
        p_thread_ids: [alertId],
      }, options?.accessToken);
      if (contextError) throw contextError;
      const row = Array.isArray(contextRows) ? contextRows[0] as { map_id?: string | null } | undefined : undefined;
      resolvedAlertId = String(row?.map_id || "").trim();
      if (!resolvedAlertId) return null;
    }
    // Audience detail and blocked-user truth are independent. Waiting for one
    // before starting the other made Social -> Map alert opening pay two RTTs.
    const [blockedIds, detailResult] = await Promise.all([
      loadNativeBlockedUserIds(viewerId, options?.accessToken),
      shareToken
        ? nativeMapRpc("get_broadcast_alert_by_share_token", {
            p_alert_id: resolvedAlertId,
            p_share_token: shareToken,
          }, options?.accessToken)
        : nativeMapRpc("get_broadcast_alert_by_id_with_audience", {
            p_alert_id: resolvedAlertId,
          }, options?.accessToken),
    ]);
    const { data, error } = detailResult;
    if (error) throw error;
    const rows = Array.isArray(data) ? data as VisibleMapAlertRow[] : [];
    const mapped = (await Promise.all(rows.map(mapAlert)))
      .filter((alert): alert is NativeMapAlert => Boolean(alert))
      .map((alert) => shareToken ? { ...alert, verified_only: true, share_access_token: shareToken } : alert);
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
    if (match && cacheGeneration === nativeMapCacheGeneration && options?.cacheWriteGuard?.() !== false) {
      const cacheEntry = { alert: match, ts: Date.now() };
      mapAlertDetailCache.set(cacheKey, cacheEntry);
      canonicalMapAlertCache.set(canonicalKey, cacheEntry);
    }
    return match;
  })().finally(() => {
    if (mapAlertDetailInFlight.get(cacheKey) === request) mapAlertDetailInFlight.delete(cacheKey);
  });
  if (!options?.force) mapAlertDetailInFlight.set(cacheKey, request);
  return request;
}
