import AsyncStorage from "@react-native-async-storage/async-storage";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { cleanupNativeBroadcastImages } from "./nativeBroadcast";
import { invalidateNativeMapAlertCaches } from "./nativeMapData";

const supportedCache = new Map<string, boolean>();
const supportCountCache = new Map<string, number>();
const supportedInFlight = new Map<string, Promise<boolean>>();
const supportCountInFlight = new Map<string, Promise<number>>();

const supportedKey = (alertId: string, userId: string) => `${alertId}:${userId}`;
const supportedStorageKey = (alertId: string, userId: string) => `native-alert-support:v1:${alertId}:${userId}`;
const supportCountStorageKey = (alertId: string) => `native-alert-support-count:v1:${alertId}`;
type NativeMapActionOptions = { accessToken?: string | null; force?: boolean };

const requireAccessToken = (accessToken?: string | null) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("missing_access_token");
  return token;
};

const mapActionRpc = async <T = unknown>(fn: string, params: Record<string, unknown> = {}, accessToken?: string | null) => {
  const token = requireAccessToken(accessToken);
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, token);
  if (error) {
    if (__DEV__) console.warn("NATIVE_MAP_SUPPORT_RPC_ERROR", {
      code: typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : null,
      fn,
      message: error.message || "map_action_failed",
    });
    throw new Error(error.message || "map_action_failed");
  }
  return data;
};

const readPersistentBoolean = async (key: string): Promise<boolean | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
};

const writePersistentBoolean = async (key: string, value: boolean) => {
  try {
    await AsyncStorage.setItem(key, value ? "true" : "false");
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const readPersistentNumber = async (key: string): Promise<number | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const writePersistentNumber = async (key: string, value: number) => {
  try {
    await AsyncStorage.setItem(key, String(Math.max(0, value)));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const clearNativeAlertInteractionCache = async (alertId?: string, userId?: string) => {
  if (!alertId) {
    supportedCache.clear();
    supportCountCache.clear();
    supportedInFlight.clear();
    supportCountInFlight.clear();
    return;
  }

  supportCountCache.delete(alertId);
  supportCountInFlight.delete(alertId);
  await AsyncStorage.removeItem(supportCountStorageKey(alertId)).catch(() => {});

  if (userId) {
    const key = supportedKey(alertId, userId);
    supportedCache.delete(key);
    supportedInFlight.delete(key);
    await AsyncStorage.removeItem(supportedStorageKey(alertId, userId)).catch(() => {});
    return;
  }

  for (const key of supportedCache.keys()) {
    if (key.startsWith(`${alertId}:`)) supportedCache.delete(key);
  }
  for (const key of supportedInFlight.keys()) {
    if (key.startsWith(`${alertId}:`)) supportedInFlight.delete(key);
  }
};

export async function areNativeUsersBlocked(viewerId: string, targetId: string, options: NativeMapActionOptions = {}): Promise<boolean> {
  if (!viewerId || !targetId || viewerId === targetId) return false;
  const data = await mapActionRpc<boolean>("is_user_blocked", {
    p_a: viewerId,
    p_b: targetId,
  }, options.accessToken);
  return Boolean(data);
}

export async function enqueueNativeAlertSupportNotification({
  accessToken,
  actorName,
  alertId,
  creatorId,
  userId,
}: {
  actorName: string;
  alertId: string;
  creatorId: string | null;
  userId: string;
} & NativeMapActionOptions) {
  if (!creatorId || creatorId === userId) return;
  await mapActionRpc("upsert_notification_window", {
    p_owner_user_id: creatorId,
    p_subject_id: alertId,
    p_subject_type: "alert",
    p_kind: "alert_like",
    p_category: "map",
    p_href: `/map?alert=${encodeURIComponent(alertId)}`,
    p_actor_id: userId,
    p_actor_name: actorName || "Someone",
  }, accessToken);
}

export async function loadNativeAlertSupported(alertId: string, userId: string, options: NativeMapActionOptions = {}) {
  requireAccessToken(options.accessToken);
  const key = supportedKey(alertId, userId);

  if (!options.force && supportedCache.has(key)) return supportedCache.get(key) === true;

  const persistent = options.force ? null : await readPersistentBoolean(supportedStorageKey(alertId, userId));
  if (!options.force && persistent !== null) {
    supportedCache.set(key, persistent);
    return persistent;
  }

  const existing = supportedInFlight.get(key);
  if (!options.force && existing) return existing;

  const request = (async () => {
    const value = Boolean(await mapActionRpc<boolean>("native_map_alert_supported", {
      p_alert_id: alertId,
    }, options.accessToken));
    supportedCache.set(key, value);
    void writePersistentBoolean(supportedStorageKey(alertId, userId), value);
    return value;
  })().finally(() => {
    if (supportedInFlight.get(key) === request) supportedInFlight.delete(key);
  });

  supportedInFlight.set(key, request);
  return request;
}

export async function countNativeAlertSupports(alertId: string, options: NativeMapActionOptions = {}) {
  requireAccessToken(options.accessToken);
  if (!options.force && supportCountCache.has(alertId)) return supportCountCache.get(alertId) ?? 0;

  const persistent = options.force ? null : await readPersistentNumber(supportCountStorageKey(alertId));
  if (!options.force && persistent !== null) {
    supportCountCache.set(alertId, persistent);
    return persistent;
  }

  const existing = supportCountInFlight.get(alertId);
  if (!options.force && existing) return existing;

  const request = (async () => {
    const value = Number(await mapActionRpc<number>("native_map_alert_support_count", {
      p_alert_id: alertId,
    }, options.accessToken) ?? 0);
    supportCountCache.set(alertId, value);
    void writePersistentNumber(supportCountStorageKey(alertId), value);
    return value;
  })().finally(() => {
    if (supportCountInFlight.get(alertId) === request) supportCountInFlight.delete(alertId);
  });

  supportCountInFlight.set(alertId, request);
  return request;
}

export async function supportNativeAlert(alertId: string, userId: string, options: NativeMapActionOptions = {}) {
  if (__DEV__) console.log("NATIVE_MAP_SUPPORT_RPC_START", {
    alertId,
    hasAccessToken: Boolean(options.accessToken),
    nextSupported: true,
  });
  const data = await mapActionRpc("native_map_upsert_alert_interaction", {
    p_alert_id: alertId,
    p_interaction_type: "support",
  }, options.accessToken);
  if (__DEV__) console.log("NATIVE_MAP_SUPPORT_RPC_RESULT", {
    alertId,
    isArray: Array.isArray(data),
    rawDataShape: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
  });

  supportedCache.set(supportedKey(alertId, userId), true);
  void writePersistentBoolean(supportedStorageKey(alertId, userId), true);

  const cachedCount = supportCountCache.get(alertId);
  if (typeof cachedCount === "number") {
    const nextCount = cachedCount + 1;
    supportCountCache.set(alertId, nextCount);
    void writePersistentNumber(supportCountStorageKey(alertId), nextCount);
  }
}

export async function removeNativeAlertSupport(alertId: string, userId: string, options: NativeMapActionOptions = {}) {
  if (__DEV__) console.log("NATIVE_MAP_SUPPORT_RPC_START", {
    alertId,
    hasAccessToken: Boolean(options.accessToken),
    nextSupported: false,
  });
  const data = await mapActionRpc("native_map_remove_alert_interaction", {
    p_alert_id: alertId,
    p_interaction_type: "support",
  }, options.accessToken);
  if (__DEV__) console.log("NATIVE_MAP_SUPPORT_RPC_RESULT", {
    alertId,
    isArray: Array.isArray(data),
    rawDataShape: data === null ? "null" : Array.isArray(data) ? "array" : typeof data,
  });

  supportedCache.set(supportedKey(alertId, userId), false);
  void writePersistentBoolean(supportedStorageKey(alertId, userId), false);

  const cachedCount = supportCountCache.get(alertId);
  if (typeof cachedCount === "number") {
    const nextCount = Math.max(0, cachedCount - 1);
    supportCountCache.set(alertId, nextCount);
    void writePersistentNumber(supportCountStorageKey(alertId), nextCount);
  }
}

export async function reportNativeAlert(alertId: string, userId: string, options: NativeMapActionOptions = {}) {
  await mapActionRpc("native_map_upsert_alert_interaction", {
    p_alert_id: alertId,
    p_interaction_type: "report",
  }, options.accessToken);
}

export async function deleteNativeBroadcastAlert(alertId: string, imageUrls: string[] = [], ownerUserId?: string | null, options: NativeMapActionOptions = {}) {
  await mapActionRpc("delete_broadcast_alert", {
    p_alert_id: alertId,
  }, options.accessToken);
  void invalidateNativeMapAlertCaches(alertId);
  if (imageUrls.length > 0) {
    await cleanupNativeBroadcastImages(imageUrls, ownerUserId, options.accessToken).catch((cleanupError) => {
      if (__DEV__) {
        console.warn("[map.delete_alert_image_cleanup.failed]", {
          alertId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
      throw cleanupError;
    });
  }
}

export async function blockNativeAlertCreator(creatorId: string, options: NativeMapActionOptions = {}) {
  await mapActionRpc("block_user", {
    p_blocked_id: creatorId,
  }, options.accessToken);
}

export async function updateNativeBroadcastAlert(alertId: string, patch: {
  description: string | null;
  images: string[];
  is_sensitive?: boolean;
  photo_url: string | null;
  previousImages?: string[];
  ownerUserId?: string | null;
  title: string;
}, options: NativeMapActionOptions = {}) {
  const previousImages = Array.isArray(patch.previousImages) ? patch.previousImages : [];
  const nextImages = Array.isArray(patch.images) ? patch.images : [];
  const data = await mapActionRpc("update_broadcast_alert", {
    p_alert_id: alertId,
    p_patch: patch,
  }, options.accessToken);
  if (!data) throw new Error("Failed to update alert");
  void invalidateNativeMapAlertCaches(alertId);
  const removedImages = previousImages.filter((url) => !nextImages.includes(url));
  if (removedImages.length > 0) {
    await cleanupNativeBroadcastImages(removedImages, patch.ownerUserId, options.accessToken).catch((cleanupError) => {
      if (__DEV__) {
        console.warn("[map.update_alert_image_cleanup.failed]", {
          alertId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
      throw cleanupError;
    });
  }
}

export async function loadNativeMapActorName(userId: string, options: NativeMapActionOptions = {}) {
  const data = await mapActionRpc<{ display_name?: string | null }[]>("native_map_actor_name", {
    p_user_id: userId,
  }, options.accessToken);
  const row = Array.isArray(data) ? data[0] : null;
  const displayName = typeof row?.display_name === "string" ? row.display_name.trim() : "";
  return displayName || "Someone";
}
