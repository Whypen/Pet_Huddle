import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";
import { supabase } from "./supabase";

const ACTIVITY_TOUCH_INTERVAL_MS = 30 * 60 * 1000;
const activityTouchMemory = new Map<string, number>();
const activityTouchInFlight = new Map<string, Promise<boolean>>();

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const activityTouchKey = (userId: string) => `native-last-active-touch:${userId}`;

const readLastTouch = async (userId: string) => {
  const memory = activityTouchMemory.get(userId);
  if (typeof memory === "number") return memory;
  const raw = await readNativeDisplayCacheItem(activityTouchKey(userId));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const writeLastTouch = async (userId: string, value: number) => {
  activityTouchMemory.set(userId, value);
  await AsyncStorage.setItem(activityTouchKey(userId), String(value)).catch(() => undefined);
};

export async function touchNativeLastActive(userId: string | null | undefined) {
  const cleanUserId = cleanString(userId);
  if (!cleanUserId) return false;

  const now = Date.now();
  const lastTouch = await readLastTouch(cleanUserId);
  if (now - lastTouch < ACTIVITY_TOUCH_INTERVAL_MS) return false;

  const existing = activityTouchInFlight.get(cleanUserId);
  if (existing) return existing;

  const request = (async () => {
    activityTouchMemory.set(cleanUserId, now);
    const { error } = await supabase.rpc("touch_profile_activity");
    if (error) {
      activityTouchMemory.delete(cleanUserId);
      return false;
    }
    await writeLastTouch(cleanUserId, now);
    return true;
  })().finally(() => {
    if (activityTouchInFlight.get(cleanUserId) === request) activityTouchInFlight.delete(cleanUserId);
  });

  activityTouchInFlight.set(cleanUserId, request);
  return request;
}
