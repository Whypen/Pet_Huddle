import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";

export type NativeCoachMarkKey =
  | "map_broadcast_intro"
  | "discover_star_wave_swipe"
  | "verify_identity_intro"
  | "huddle_code_intro";

const cleanUserId = (userId: string | null | undefined) => (
  typeof userId === "string" ? userId.trim() : ""
);

const coachMarkFlagKey = (userId: string, key: NativeCoachMarkKey) => (
  `huddle-coachmark-seen:v1:${userId}:${key}`
);

export async function isNativeCoachMarkSeen(
  userId: string | null | undefined,
  key: NativeCoachMarkKey,
): Promise<boolean> {
  const id = cleanUserId(userId);
  if (!id) return true;
  const raw = await readNativeDisplayCacheItem(coachMarkFlagKey(id, key));
  return raw === "1";
}

export async function markNativeCoachMarkSeen(
  userId: string | null | undefined,
  key: NativeCoachMarkKey,
): Promise<void> {
  const id = cleanUserId(userId);
  if (!id) return;
  await AsyncStorage.setItem(coachMarkFlagKey(id, key), "1").catch(() => undefined);
}
