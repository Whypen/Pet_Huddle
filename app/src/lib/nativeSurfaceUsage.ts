import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem, readNativeDisplayCacheItems } from "./nativeDisplayCacheStorage";

// Lightweight per-user record of which secondary tabs the user actually opens,
// used to make Home's P1 background warming usage-weighted instead of warming
// every speculative surface (Social feed, Service cards, Discover, Groups) on
// every session. New users get a grace window so first exploration stays instant.

export type NativeUsageSurface = "social" | "service" | "chats" | "map";

const VISIT_THROTTLE_MS = 60 * 1000;
const NEW_USER_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const SURFACE_STALE_MS = 21 * 24 * 60 * 60 * 1000;

const memoryVisit = new Map<string, number>();

const visitKey = (userId: string, surface: NativeUsageSurface) => `huddle-native-surface-visit:v1:${userId}:${surface}`;
const firstSeenKey = (userId: string) => `huddle-native-first-seen:v1:${userId}`;

export async function recordNativeSurfaceVisit(userId: string | null | undefined, surface: NativeUsageSurface) {
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId) return;
  const now = Date.now();
  const memKey = `${cleanUserId}:${surface}`;
  const last = memoryVisit.get(memKey) ?? 0;
  if (now - last < VISIT_THROTTLE_MS) return;
  memoryVisit.set(memKey, now);
  await AsyncStorage.setItem(visitKey(cleanUserId, surface), String(now)).catch(() => undefined);
  const seen = await readNativeDisplayCacheItem(firstSeenKey(cleanUserId));
  if (!seen) await AsyncStorage.setItem(firstSeenKey(cleanUserId), String(now)).catch(() => undefined);
}

// Returns the subset of `surfaces` worth warming this session. Warms everything
// when the user is unknown or within the new-user grace window; after that, only
// warms surfaces the user has opened within SURFACE_STALE_MS.
export async function resolveWarmEligibleNativeSurfaces(
  userId: string | null | undefined,
  surfaces: readonly NativeUsageSurface[],
): Promise<Set<NativeUsageSurface>> {
  const eligible = new Set<NativeUsageSurface>(surfaces);
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId) return eligible;

  const now = Date.now();
  const firstSeenRaw = await readNativeDisplayCacheItem(firstSeenKey(cleanUserId));
  const firstSeen = Number(firstSeenRaw || 0);
  if (!Number.isFinite(firstSeen) || firstSeen <= 0) {
    // First time we observe this user: seed the marker and warm everything.
    await AsyncStorage.setItem(firstSeenKey(cleanUserId), String(now)).catch(() => undefined);
    return eligible;
  }
  if (now - firstSeen < NEW_USER_GRACE_MS) return eligible;

  let pairs: readonly [string, string | null][] = [];
  try {
    pairs = await readNativeDisplayCacheItems(surfaces.map((surface) => visitKey(cleanUserId, surface)));
  } catch {
    return eligible;
  }
  surfaces.forEach((surface, index) => {
    const raw = pairs[index]?.[1] ?? null;
    const lastVisit = Number(raw || 0);
    const recent = Number.isFinite(lastVisit) && lastVisit > 0 && now - lastVisit < SURFACE_STALE_MS;
    if (!recent) eligible.delete(surface);
  });
  return eligible;
}
