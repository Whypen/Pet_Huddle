import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import { fetchNativeEngagementTiers, type NativeEngagementSummary } from "./nativeEngagement";
import { readNativeDisplayCacheItem, readNativeDisplayCacheKeys } from "./nativeDisplayCacheStorage";

export type NativeProfileSummary = {
  [key: string]: unknown;
  id?: string | null;
  display_name?: string | null;
  email?: string | null;
  social_id?: string | null;
  avatar_url?: string | null;
  availability_status?: unknown;
  phone?: string | null;
  contact_discovery_enabled?: boolean | null;
  photos?: unknown;
  gender_genre?: string | null;
  location_country?: string | null;
  location_district?: string | null;
  experience_years?: number | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  effective_tier?: string | null;
  tier?: string | null;
  non_social?: boolean | null;
  discovery_opt_out?: boolean | null;
  hide_from_map?: boolean | null;
  map_precision?: string | null;
  map_visible_until?: string | null;
  pet_experience?: string[] | null;
  updated_at?: string | null;
  family_slots?: number | null;
  country?: string | null;
  city?: string | null;
  location_label?: string | null;
  dob?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  last_lat?: number | null;
  last_lng?: number | null;
  location_pinned_until?: string | null;
  location_retention_until?: string | null;
  engagement?: NativeEngagementSummary | null;
};

export type NativeQuotaSnapshot = {
  effective_tier?: string | null;
  tier?: string | null;
  stars_month_used?: number | null;
  stars_used_cycle?: number | null;
  extras_stars?: number | null;
  extra_stars?: number | null;
  broadcast_active_limit?: number | null;
  broadcast_active_used?: number | null;
};

export type NativeProfileSummarySnapshot = {
  profile: NativeProfileSummary | null;
  quota: NativeQuotaSnapshot | null;
};

/** Returns null when DOB is absent or invalid, preventing false age-gating on uncertainty. */
export const isNativeProfileAtLeastAge = (dob: unknown, minimumAge: number, now = new Date()): boolean | null => {
  if (typeof dob !== "string" || !dob.trim()) return null;
  const birth = new Date(dob);
  if (!Number.isFinite(birth.getTime()) || birth.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= minimumAge;
};

type NativeProfileSummaryCachePayload = NativeProfileSummarySnapshot & {
  version: number;
  cachedAt: number;
  sessionKey: string;
  userId: string;
};

const CACHE_VERSION = 6;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const memoryCache = new Map<string, NativeProfileSummaryCachePayload>();
const inFlight = new Map<string, Promise<NativeProfileSummarySnapshot>>();
type NativeProfileSummaryListener = {
  listener: (snapshot: NativeProfileSummarySnapshot) => void;
  sessionKey: string | null;
};

const listeners = new Map<string, Set<NativeProfileSummaryListener>>();
// A foreground action can patch presence while an older profile request is in
// flight. The request must never repaint that stale server snapshot over the
// user's newer Out/Back decision.
const cacheRevisions = new Map<string, number>();

const profileSummarySessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const cacheKey = (userId: string, sessionKey?: string | null) => `huddle_native_profile_summary:v6:${userId}:${profileSummarySessionKey(userId, sessionKey)}`;

const cacheRevision = (key: string) => cacheRevisions.get(key) ?? 0;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

const isProfile = (value: unknown): value is NativeProfileSummary | null => {
  if (value === null) return true;
  if (!isObject(value)) return false;
  return (
    (value.display_name === undefined || value.display_name === null || typeof value.display_name === "string") &&
    (value.email === undefined || value.email === null || typeof value.email === "string") &&
    (value.avatar_url === undefined || value.avatar_url === null || typeof value.avatar_url === "string") &&
    (value.is_verified === undefined || value.is_verified === null || typeof value.is_verified === "boolean") &&
    (value.effective_tier === undefined || value.effective_tier === null || typeof value.effective_tier === "string") &&
    (value.tier === undefined || value.tier === null || typeof value.tier === "string")
  );
};

const isQuota = (value: unknown): value is NativeQuotaSnapshot | null => value === null || isObject(value);

const isFresh = (cachedAt: number) => Date.now() - cachedAt <= CACHE_MAX_AGE_MS;

const mergeProfileSummaryForCache = (
  _current: NativeProfileSummarySnapshot | null,
  incoming: NativeProfileSummarySnapshot,
): NativeProfileSummarySnapshot => incoming;

const notify = (userId: string, snapshot: NativeProfileSummarySnapshot, sessionKey: string) => {
  listeners.get(userId)?.forEach(({ listener, sessionKey: listenerSessionKey }) => {
    if (listenerSessionKey && listenerSessionKey !== sessionKey) return;
    try {
      listener(snapshot);
    } catch {
      // A stale mounted screen cannot block Home, Map, and profile surfaces
      // from receiving the same optimistic cache patch.
    }
  });
};

const persist = async (userId: string, snapshot: NativeProfileSummarySnapshot, sessionKey?: string | null) => {
  const cacheSessionKey = profileSummarySessionKey(userId, sessionKey);
  const key = cacheKey(userId, cacheSessionKey);
  const current = memoryCache.get(key);
  const nextSnapshot = mergeProfileSummaryForCache(
    current ? { profile: current.profile, quota: current.quota } : null,
    snapshot,
  );
  const payload: NativeProfileSummaryCachePayload = {
    version: CACHE_VERSION,
    cachedAt: Date.now(),
    sessionKey: cacheSessionKey,
    userId,
    profile: nextSnapshot.profile,
    quota: nextSnapshot.quota,
  };
  memoryCache.set(key, payload);
  cacheRevisions.set(key, cacheRevision(key) + 1);
  notify(userId, nextSnapshot, cacheSessionKey);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const readCachedNativeProfileSummary = async (userId: string, options: { sessionKey?: string | null } = {}): Promise<NativeProfileSummarySnapshot | null> => {
  const key = cacheKey(userId, options.sessionKey);
  const cacheSessionKey = profileSummarySessionKey(userId, options.sessionKey);
  const memory = memoryCache.get(key);
  if (memory && isFresh(memory.cachedAt) && memory.profile) {
    return { profile: memory.profile, quota: memory.quota };
  }
  if (memory && !memory.profile) memoryCache.delete(key);

  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<NativeProfileSummaryCachePayload>;
    if (
      payload.version !== CACHE_VERSION ||
      typeof payload.cachedAt !== "number" ||
      payload.userId !== userId ||
      payload.sessionKey !== cacheSessionKey ||
      !isFresh(payload.cachedAt) ||
      !payload.profile ||
      !isProfile(payload.profile ?? null) ||
      !isQuota(payload.quota ?? null)
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    const next: NativeProfileSummaryCachePayload = {
      version: CACHE_VERSION,
      cachedAt: payload.cachedAt,
      sessionKey: cacheSessionKey,
      userId,
      profile: payload.profile ?? null,
      quota: payload.quota ?? null,
    };
    memoryCache.set(key, next);
    return { profile: next.profile, quota: next.quota };
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
};

const fetchNativeProfileSummaryRpc = async (accessToken?: string | null) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) {
    throw new Error("missing_access_token");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_native_profile_summary`, {
      method: "POST",
      headers: createNativeAuthenticatedHeaders(token, {
        "content-type": "application/json",
      }),
      body: "{}",
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(controller.signal.aborted ? "profile_summary_timeout" : String((error as { message?: unknown })?.message || "profile_summary_network_error"));
  } finally {
    clearTimeout(timeoutId);
  }
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok) {
    throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
  }
  return parsed as { profile?: NativeProfileSummary | null; quota?: NativeQuotaSnapshot | null } | null;
};

export const fetchNativeProfileSummary = async (userId: string, options: { force?: boolean; accessToken?: string | null; cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {}) => {
  const cacheSessionKey = profileSummarySessionKey(userId, options.sessionKey);
  if (!options.force) {
    const cached = await readCachedNativeProfileSummary(userId, { sessionKey: cacheSessionKey });
    if (cached?.profile) return cached;
  }

  const key = cacheKey(userId, cacheSessionKey);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const requestRevision = cacheRevision(key);
    const data = await fetchNativeProfileSummaryRpc(options.accessToken);
    const profile = data?.profile ?? null;
    const resolvedAvatarUrl = profile?.avatar_url
      ? await resolveNativeProfileImageUrlAsync(profile.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null)
      : null;
    const engagement = profile?.id ? (await fetchNativeEngagementTiers([profile.id], options.accessToken)).get(profile.id) ?? null : null;
    const snapshot: NativeProfileSummarySnapshot = {
      profile: profile ? { ...profile, avatar_url: resolvedAvatarUrl, engagement } : null,
      quota: data?.quota && typeof data.quota === "object" ? data.quota : null,
    };
    if (!snapshot.profile) {
      throw new Error("profile_summary_unavailable");
    }
    if (options.cacheWriteGuard?.() !== false) {
      if (cacheRevision(key) === requestRevision) {
        await persist(userId, snapshot, cacheSessionKey);
      } else {
        // A later cache patch is an explicit foreground decision. Return that
        // shared truth rather than the older request that raced behind it.
        const latest = memoryCache.get(key);
        if (latest?.profile) return { profile: latest.profile, quota: latest.quota };
      }
    }
    return snapshot;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
};

export const writeNativeProfileSummaryCache = async (userId: string, snapshot: NativeProfileSummarySnapshot, options: { sessionKey?: string | null } = {}) => {
  await persist(userId, snapshot, options.sessionKey);
};

export const patchNativeProfileSummaryCache = async (
  userId: string,
  patch: Partial<NativeProfileSummary>,
  options: { createIfMissing?: boolean; sessionKey?: string | null } = {},
) => {
  const existing = await readCachedNativeProfileSummary(userId, { sessionKey: options.sessionKey }).catch(() => null);
  if (!existing?.profile && !options.createIfMissing) return false;
  await persist(userId, {
    profile: { id: userId, ...(existing?.profile ?? {}), ...patch },
    quota: existing?.quota ?? null,
  }, options.sessionKey);
  return true;
};

export const subscribeNativeProfileSummary = (
  userId: string,
  listener: (snapshot: NativeProfileSummarySnapshot) => void,
  options: { sessionKey?: string | null } = {},
) => {
  const listenerSessionKey = options.sessionKey ? profileSummarySessionKey(userId, options.sessionKey) : null;
  const set = listeners.get(userId) ?? new Set<NativeProfileSummaryListener>();
  const entry = { listener, sessionKey: listenerSessionKey };
  set.add(entry);
  listeners.set(userId, set);
  // Emit the freshest cached snapshot immediately on subscribe, so a screen that
  // mounts after an avatar change (e.g. Social) applies the latest profile photo
  // right away instead of waiting for the next background refresh to notify.
  let newest: NativeProfileSummaryCachePayload | null = null;
  for (const [key, payload] of memoryCache) {
    if (
      key.includes(`:v6:${userId}:`) &&
      payload.profile &&
      (!listenerSessionKey || payload.sessionKey === listenerSessionKey) &&
      (!newest || payload.cachedAt > newest.cachedAt)
    ) {
      newest = payload;
    }
  }
  if (newest) listener({ profile: newest.profile, quota: newest.quota });
  return () => {
    set.delete(entry);
    if (set.size === 0) listeners.delete(userId);
  };
};

export const clearNativeProfileSummaryCache = async (userId?: string | null) => {
  if (!userId) {
    memoryCache.clear();
    cacheRevisions.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (
      key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v4:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v5:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v6:${userId}:`)
    ) memoryCache.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (
      key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v4:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v5:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v6:${userId}:`)
    ) inFlight.delete(key);
  }
  for (const key of Array.from(cacheRevisions.keys())) {
    if (
      key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v4:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v5:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v6:${userId}:`)
    ) cacheRevisions.delete(key);
  }
  const keys = await readNativeDisplayCacheKeys();
  const removals = keys.filter((key) => (
    key === `huddle_native_profile_summary:${userId}` ||
    key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
    key.startsWith(`huddle_native_profile_summary:v4:${userId}:`) ||
    key.startsWith(`huddle_native_profile_summary:v5:${userId}:`) ||
    key.startsWith(`huddle_native_profile_summary:v6:${userId}:`)
  ));
  if (removals.length > 0) await AsyncStorage.multiRemove(removals).catch(() => undefined);
};
