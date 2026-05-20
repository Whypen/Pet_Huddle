import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";

export type NativeProfileSummary = {
  [key: string]: unknown;
  id?: string | null;
  display_name?: string | null;
  email?: string | null;
  social_id?: string | null;
  avatar_url?: string | null;
  availability_status?: unknown;
  is_verified?: boolean | null;
  verification_status?: string | null;
  effective_tier?: string | null;
  tier?: string | null;
  non_social?: boolean | null;
  hide_from_map?: boolean | null;
  pet_experience?: string[] | null;
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

type NativeProfileSummaryCachePayload = NativeProfileSummarySnapshot & {
  version: number;
  cachedAt: number;
  sessionKey: string;
  userId: string;
};

const CACHE_VERSION = 4;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const memoryCache = new Map<string, NativeProfileSummaryCachePayload>();
const inFlight = new Map<string, Promise<NativeProfileSummarySnapshot>>();
const listeners = new Map<string, Set<(snapshot: NativeProfileSummarySnapshot) => void>>();

const profileSummarySessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const cacheKey = (userId: string, sessionKey?: string | null) => `huddle_native_profile_summary:v4:${userId}:${profileSummarySessionKey(userId, sessionKey)}`;

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

const notify = (userId: string, snapshot: NativeProfileSummarySnapshot) => {
  listeners.get(userId)?.forEach((listener) => listener(snapshot));
};

const persist = async (userId: string, snapshot: NativeProfileSummarySnapshot, sessionKey?: string | null) => {
  const cacheSessionKey = profileSummarySessionKey(userId, sessionKey);
  const payload: NativeProfileSummaryCachePayload = {
    version: CACHE_VERSION,
    cachedAt: Date.now(),
    sessionKey: cacheSessionKey,
    userId,
    profile: snapshot.profile,
    quota: snapshot.quota,
  };
  memoryCache.set(cacheKey(userId, cacheSessionKey), payload);
  notify(userId, snapshot);
  try {
    await AsyncStorage.setItem(cacheKey(userId, cacheSessionKey), JSON.stringify(payload));
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
    const raw = await AsyncStorage.getItem(key);
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
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("missing_access_token");
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_native_profile_summary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: "{}",
  });
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

  const existing = inFlight.get(cacheKey(userId, cacheSessionKey));
  if (existing) return existing;

  const request = (async () => {
    const data = await fetchNativeProfileSummaryRpc(options.accessToken);
    const profile = data?.profile ?? null;
    const resolvedAvatarUrl = profile?.avatar_url
      ? await resolveNativeProfileImageUrlAsync(profile.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => profile.avatar_url ?? null)
      : null;
    const snapshot: NativeProfileSummarySnapshot = {
      profile: profile ? { ...profile, avatar_url: resolvedAvatarUrl } : null,
      quota: data?.quota && typeof data.quota === "object" ? data.quota : null,
    };
    if (!snapshot.profile) {
      throw new Error("profile_summary_unavailable");
    }
    if (options.cacheWriteGuard?.() !== false) await persist(userId, snapshot, cacheSessionKey);
    return snapshot;
  })();

  inFlight.set(cacheKey(userId, cacheSessionKey), request);
  try {
    return await request;
  } finally {
    inFlight.delete(cacheKey(userId, cacheSessionKey));
  }
};

export const writeNativeProfileSummaryCache = async (userId: string, snapshot: NativeProfileSummarySnapshot, options: { sessionKey?: string | null } = {}) => {
  await persist(userId, snapshot, options.sessionKey);
};

export const subscribeNativeProfileSummary = (
  userId: string,
  listener: (snapshot: NativeProfileSummarySnapshot) => void,
) => {
  const set = listeners.get(userId) ?? new Set<(snapshot: NativeProfileSummarySnapshot) => void>();
  set.add(listener);
  listeners.set(userId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
};

export const clearNativeProfileSummaryCache = async (userId?: string | null) => {
  if (!userId) {
    memoryCache.clear();
    return;
  }
  for (const key of Array.from(memoryCache.keys())) {
    if (
      key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v4:${userId}:`)
    ) memoryCache.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (
      key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
      key.startsWith(`huddle_native_profile_summary:v4:${userId}:`)
    ) inFlight.delete(key);
  }
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const removals = keys.filter((key) => (
    key === `huddle_native_profile_summary:${userId}` ||
    key.startsWith(`huddle_native_profile_summary:v3:${userId}:`) ||
    key.startsWith(`huddle_native_profile_summary:v4:${userId}:`)
  ));
  if (removals.length > 0) await AsyncStorage.multiRemove(removals).catch(() => undefined);
};
