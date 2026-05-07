import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { resolveNativeProfilePhotoDisplayUrl } from "./nativeProfilePhotos";
import { resolveNativeStoragePublicUrl } from "./nativeStorageUrlCache";
import { supabase } from "./supabase";
import { lookupNativeMapQueryCenter } from "./nativeMapMutations";

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

export async function loadNativeBlockedUserIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error || !Array.isArray(data)) return new Set<string>();

  const ids = new Set<string>();
  data.forEach((row) => {
    const blockerId = typeof row.blocker_id === "string" ? row.blocker_id : null;
    const blockedId = typeof row.blocked_id === "string" ? row.blocked_id : null;
    if (blockerId === userId && blockedId) ids.add(blockedId);
    if (blockedId === userId && blockerId) ids.add(blockerId);
  });
  return ids;
}

async function deriveOwnPin(profile: Record<string, unknown> | null | undefined): Promise<NativeMapOwnPin | null> {
  const lat = profile?.last_lat;
  const lng = profile?.last_lng;
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
    is_verified: profile?.is_verified === true,
    is_invisible: profile?.hide_from_map === true,
    marker_state: "active",
  };
}

function mapAlert(row: VisibleMapAlertRow): NativeMapAlert | null {
  if (!isFiniteNumber(row.latitude) || !isFiniteNumber(row.longitude)) return null;
  if (row.marker_state === "hidden") return null;
  const { mediaUrls, photoUrl } = normalizeNativeAlertMediaUrls(row);
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
      avatar_url: row.creator_avatar_url ?? null,
      display_name: row.creator_display_name ?? null,
      social_id: row.creator_social_id ?? null,
    },
    marker_state: row.marker_state === "expired_dot" ? "expired_dot" : "active",
  };
}

async function fetchVisibleAlerts(center: [number, number], blockedIds: Set<string>) {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)("get_visible_broadcast_alerts", {
    p_lat: center[1],
    p_lng: center[0],
  });
  if (error) throw error;
  return (Array.isArray(data) ? (data as VisibleMapAlertRow[]) : [])
    .map(mapAlert)
    .filter((item): item is NativeMapAlert => Boolean(item))
    .filter((item) => !(item.creator_id && blockedIds.has(item.creator_id)));
}

async function fetchFriendPins(center: [number, number]) {
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)("get_friend_pins_nearby", {
    p_lat: center[1],
    p_lng: center[0],
    p_radius_m: VIEW_RADIUS_METERS,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as FriendPinRow[]) : [];
  const visibleRows = rows.filter((row) => (
    typeof row.id === "string" &&
    isFiniteNumber(row.last_lat) &&
    isFiniteNumber(row.last_lng) &&
    row.marker_state !== "expired_dot"
  ));
  const friendIds = visibleRows.map((row) => row.id);
  const profileById = new Map<string, FriendProfileRow>();
  if (friendIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,is_verified,gender_genre,hide_from_map")
      .in("id", friendIds);
    (Array.isArray(profileRows) ? profileRows as FriendProfileRow[] : []).forEach((row) => {
      if (typeof row.id === "string") profileById.set(row.id, row);
    });
  }
  return Promise.all(visibleRows.map(async (row) => {
    const profile = profileById.get(row.id);
    const avatarUrl = await resolveNativeProfilePhotoDisplayUrl(row.avatar_url || null);
    return {
      id: row.id,
      display_name: row.display_name,
      avatar_url: avatarUrl,
      is_verified: profile?.is_verified === true,
      is_invisible: profile?.hide_from_map === true,
      gender_genre: profile?.gender_genre ?? null,
      last_lat: row.last_lat as number,
      last_lng: row.last_lng as number,
      location_pinned_until: row.location_pinned_until,
      marker_state: "active" as const,
    };
  }));
}

export async function fetchNativeMapReadOnlyData(userId: string, cameraCenter?: [number, number] | null): Promise<NativeMapReadOnlyData> {
  const [{ profile }, blockedIds] = await Promise.all([
    fetchNativeProfileSummary(userId, { force: true }),
    loadNativeBlockedUserIds(userId),
  ]);
  const profileRecord = (profile || null) as Record<string, unknown> | null;
  const ownPin = await deriveOwnPin(profileRecord);
  const profileLat = profileRecord?.last_lat;
  const profileLng = profileRecord?.last_lng;
  let center: [number, number] = Array.isArray(cameraCenter) && isFiniteNumber(cameraCenter[0]) && isFiniteNumber(cameraCenter[1])
    ? cameraCenter
    : ownPin
      ? [ownPin.lng, ownPin.lat]
      : isFiniteNumber(profileLng) && isFiniteNumber(profileLat)
        ? [profileLng, profileLat]
        : DEFAULT_CENTER;
  if (!cameraCenter && !ownPin && !(isFiniteNumber(profileLng) && isFiniteNumber(profileLat))) {
    const query = [
      typeof profileRecord?.location_name === "string" ? profileRecord.location_name.trim() : "",
      typeof profileRecord?.location_district === "string" ? profileRecord.location_district.trim() : "",
      typeof profileRecord?.location_country === "string" ? profileRecord.location_country.trim() : "",
    ].filter(Boolean).join(", ");
    const geocoded = await lookupNativeMapQueryCenter(query);
    if (geocoded) center = [geocoded.lng, geocoded.lat];
  }

  const [rawAlerts, friends] = await Promise.all([
    fetchVisibleAlerts(center, blockedIds),
    fetchFriendPins(center),
  ]);
  return {
    alerts: sortNativeMapAlertsForDisplay(rawAlerts, center),
    center,
    friends: friends.filter((friend) => friend.id !== userId),
    ownPin,
  };
}

export async function fetchNativeMapAlertById(alertId: string, viewerId: string, options?: { source?: "alert" | "thread" }): Promise<NativeMapAlert | null> {
  const blockedIds = await loadNativeBlockedUserIds(viewerId);
  let resolvedAlertId = alertId;
  if (options?.source === "thread" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedAlertId)) {
    const { data: contextRows } = await (supabase.rpc as unknown as (
      fn: string,
      args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>)("get_social_feed_alert_context", {
      p_thread_ids: [alertId],
    });
    const row = Array.isArray(contextRows) ? contextRows[0] as { map_id?: string | null } | undefined : undefined;
    resolvedAlertId = String(row?.map_id || "").trim();
    if (!resolvedAlertId) return null;
  }
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>)("get_broadcast_alert_by_id", {
    p_alert_id: resolvedAlertId,
  });
  if (error) return null;
  const rows = Array.isArray(data) ? data as VisibleMapAlertRow[] : [];
  const mapped = rows.map(mapAlert).filter((alert): alert is NativeMapAlert => Boolean(alert));
  const match = mapped.find((alert) => !(alert.creator_id && blockedIds.has(alert.creator_id))) ?? null;
  if (!match) return null;
  return match;
}
