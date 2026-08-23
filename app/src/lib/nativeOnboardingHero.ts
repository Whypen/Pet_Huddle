import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

// One-shot flag that gates the post-signup "huddle" hero. It is armed when a
// user finishes Step 5 (Get verified OR Go straight to huddle) and consumed the
// first time they land on Home — so it shows once per fresh signup across both
// completion paths, and never for returning users.

const heroFlagKey = (userId: string) => `huddle-onboarding-hero-pending:v1:${userId}`;

const cleanUserId = (userId: string | null | undefined) => (typeof userId === "string" ? userId.trim() : "");

export async function armNativeOnboardingHero(userId: string | null | undefined) {
  const id = cleanUserId(userId);
  if (!id) return;
  await AsyncStorage.setItem(heroFlagKey(id), "1").catch(() => undefined);
}

export async function isNativeOnboardingHeroPending(userId: string | null | undefined, accessToken?: string | null, serverPending?: boolean) {
  const id = cleanUserId(userId);
  if (!id) return false;
  if (serverPending === true) return true;
  if (accessToken) {
    const { data } = await nativeExactTokenRpc<Array<{ signup_welcome_pending?: boolean }> | { signup_welcome_pending?: boolean }>(
      "get_native_onboarding_snapshot",
      {},
      accessToken,
    ).catch(() => ({ data: null, error: null }));
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.signup_welcome_pending === true) return true;
  }
  const raw = await readNativeDisplayCacheItem(heroFlagKey(id));
  return raw === "1";
}

export async function clearNativeOnboardingHero(userId: string | null | undefined, accessToken?: string | null) {
  const id = cleanUserId(userId);
  if (!id) return;
  if (accessToken) {
    await nativeExactTokenRpc("mark_native_signup_welcome_seen", {}, accessToken).catch(() => undefined);
  }
  await AsyncStorage.removeItem(heroFlagKey(id)).catch(() => undefined);
}
