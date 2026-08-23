import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireNativeModule } from "expo-modules-core";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

type ActiveSessionKind = "map_out_now" | "care_in_progress";

// Written by the Lock Screen renewal deep link and consumed by Home, where the
// normal Out-now flow owns permission, GPS, server mutation, and activity state.
export const OUT_NOW_CONTINUE_REQUEST_KEY = "@huddle:out-now-continue-requested";

type BaseActiveSessionPayload = {
  activityId?: string | null;
  sessionId?: string | null;
  sessionAliases?: string[];
  kind: ActiveSessionKind;
  /** True Out-now session start: drives elapsed copy and return summaries. */
  startedAt: string;
  /** Current two-hour sharing window: drives only visual progress. */
  progressStartedAt?: string | null;
  expiresAt?: string | null;
  selfAvatarUrl?: string | null;
  avatarUrls?: string[];
  avatarIsBlurred?: boolean[];
  names?: string[];
  totalCount?: number;
  friendCount?: number;
  nearbyUserCount?: number;
  deepLink?: string | null;
  finalMessage?: string | null;
  awaitingText?: string | null;
  showAction?: boolean;
  completionRole?: "provider" | "requester" | null;
};

type HuddleActiveSessionsModule = {
  startActivity(payload: BaseActiveSessionPayload): Promise<string | null>;
  updateActivity(payload: BaseActiveSessionPayload): Promise<boolean | null | undefined>;
  endActivity(payload: BaseActiveSessionPayload): Promise<void>;
  setActionAuth?(accessToken: string, refreshToken: string | null, supabaseURL: string, anonKey: string): Promise<boolean | null | undefined>;
  clearActionAuth?(): Promise<boolean | null | undefined>;
  clearHomeActivity?(): Promise<void>;
  clearInactiveCareActivities?(activeDeepLinks: string[]): Promise<void>;
  clearDuplicateActivities?(): Promise<void>;
  getActivitySnapshot?(): Promise<Array<{
    id?: string;
    kind?: ActiveSessionKind;
    deepLink?: string | null;
    activityState?: string;
    isStale?: boolean;
    relevanceScore?: number;
  }>>;
};

const HOME_ACTIVITY_KEY = "huddle_active_session_home_activity_id_v1";
// True start of the current Out-now session, surviving renewals (which rewrite
// startedAt to expiresAt - window). Seeded on start/renewal, consumed on
// "I'm back" so the return summary can report the full time out.
const OUT_NOW_SESSION_START_KEY = "@huddle:out-now-session-start-v1";
const OUT_NOW_SESSION_STALE_GRACE_MS = 10 * 60_000;
const CARE_ACTIVITY_KEY_PREFIX = "huddle_active_session_care_activity_id_v1:";
let cachedNativeModule: HuddleActiveSessionsModule | null | undefined;
let activeSessionStartTail: Promise<void> = Promise.resolve();
let actionAuthMutationTail: Promise<void> = Promise.resolve();

const serializeActionAuthMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previous = actionAuthMutationTail;
  let release: () => void = () => undefined;
  actionAuthMutationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
};

const serializeActiveSessionStart = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previous = activeSessionStartTail;
  let release: () => void = () => undefined;
  activeSessionStartTail = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
};

const activeSessionLog = (event: string, payload: Record<string, unknown> = {}) => {
  if (!__DEV__) return;
  console.log("[HUDDLE_ACTIVE_SESSION_NATIVE]", { event, ...payload });
};

const getNativeModule = () => {
  if (cachedNativeModule) return cachedNativeModule;
  try {
    cachedNativeModule = requireNativeModule<HuddleActiveSessionsModule>("HuddleActiveSessions");
  } catch {
    cachedNativeModule = null;
    activeSessionLog("module_missing");
  }
  return cachedNativeModule;
};

const callNative = async <T>(event: string, task: () => Promise<T>) => {
  if (!getNativeModule()) {
    activeSessionLog(`${event}_skipped`, { reason: "module_missing" });
    return null;
  }
  try {
    const result = await task();
    activeSessionLog(`${event}_ok`, { result: result ?? null, hasResult: Boolean(result) });
    return result;
  } catch (error) {
    activeSessionLog(`${event}_failed`, {
      message: error instanceof Error ? error.message : String(error || "unknown"),
    });
    return null;
  }
};

// Companion slots stay parallel across name, avatar, and privacy fields.
// Matched friends are named and clean; non-friends keep a blurred photo with
// no name, so they contribute only to the +N copy.
export type HuddleActiveSessionCompanion = {
  name: string;
  avatarUrl?: string | null;
  isBlurred?: boolean;
};

const companionPayload = (companions: HuddleActiveSessionCompanion[] | undefined, totalCount: number | undefined) => {
  const list = (companions || []).slice(0, 4);
  const pairs = list.map((entry) => ({
    avatarUrl: String(entry.avatarUrl || "").trim(),
    name: String(entry.name || "").trim(),
    isBlurred: entry.isBlurred === true,
  }));
  return {
    avatarUrls: pairs.map((entry) => entry.avatarUrl),
    avatarIsBlurred: pairs.map((entry) => entry.isBlurred),
    names: pairs.map((entry) => entry.name),
    totalCount: totalCount ?? list.length,
  };
};

type OutNowSessionStartRecord = { startedAt: string; expiresAt: string };

const parseOutNowSessionStart = (raw: string | null): OutNowSessionStartRecord | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OutNowSessionStartRecord;
    if (!parsed || typeof parsed.startedAt !== "string" || !Number.isFinite(Date.parse(parsed.startedAt))) return null;
    return parsed;
  } catch {
    return null;
  }
};

// Keeps the original startedAt across renewals; only a session whose window
// already lapsed (plus grace) re-seeds, so a stale record from a natural
// expiry cannot inflate the next walk's duration.
const seedOutNowSessionStart = async (startedAt: string, expiresAt: string) => {
  const raw = await AsyncStorage.getItem(OUT_NOW_SESSION_START_KEY).catch(() => null);
  const existing = parseOutNowSessionStart(raw);
  const existingExpiryMs = Date.parse(String(existing?.expiresAt ?? ""));
  const stillCurrent = Number.isFinite(existingExpiryMs) && existingExpiryMs + OUT_NOW_SESSION_STALE_GRACE_MS > Date.now();
  const record: OutNowSessionStartRecord = {
    startedAt: stillCurrent && existing ? existing.startedAt : startedAt,
    expiresAt,
  };
  await AsyncStorage.setItem(OUT_NOW_SESSION_START_KEY, JSON.stringify(record)).catch(() => undefined);
};

// Return-summary copy. Under a minute is a doorstep check, not a walk — no
// celebration. Two hours and up earns the long-walk line.
export const formatOutNowReturnSummary = (elapsedMs: number): string | null => {
  if (!Number.isFinite(elapsedMs)) return null;
  const totalMinutes = Math.round(elapsedMs / 60_000);
  if (totalMinutes < 1) return null;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = hours >= 1
    ? (minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`)
    : `${totalMinutes} min`;
  if (totalMinutes >= 120) return `${duration}! What a long walk. Good job!`;
  if (hours >= 1) return `That's a ${duration} walk. Nice one.`;
  return `That's a ${totalMinutes}-minute walk. Nice one.`;
};

// Reads and clears the persisted session start, returning the summary line
// for the ended session (or null when there is nothing worth celebrating).
export const consumeOutNowSessionSummary = async (): Promise<string | null> => {
  const raw = await AsyncStorage.getItem(OUT_NOW_SESSION_START_KEY).catch(() => null);
  await AsyncStorage.removeItem(OUT_NOW_SESSION_START_KEY).catch(() => undefined);
  const record = parseOutNowSessionStart(raw);
  if (!record) return null;
  const expiryMs = Date.parse(String(record.expiresAt ?? ""));
  if (Number.isFinite(expiryMs) && expiryMs + OUT_NOW_SESSION_STALE_GRACE_MS < Date.now()) return null;
  return formatOutNowReturnSummary(Date.now() - Date.parse(record.startedAt));
};

export const startHomePresenceActivity = async (payload: {
  startedAt: string;
  progressStartedAt?: string | null;
  expiresAt: string;
  selfAvatarUrl?: string | null;
  companions?: HuddleActiveSessionCompanion[];
  companionsTotalCount?: number;
  friendCount?: number;
  nearbyUserCount?: number;
}) => serializeActiveSessionStart(async () => {
  await clearDuplicateActiveSessionActivities();
  await seedOutNowSessionStart(payload.startedAt, payload.expiresAt);
  const body: BaseActiveSessionPayload = {
    sessionId: "home",
    kind: "map_out_now",
    startedAt: payload.startedAt,
    progressStartedAt: payload.progressStartedAt || null,
    expiresAt: payload.expiresAt,
    selfAvatarUrl: payload.selfAvatarUrl || null,
    friendCount: payload.friendCount,
    nearbyUserCount: payload.nearbyUserCount,
    ...companionPayload(payload.companions, payload.companionsTotalCount),
  };
  const activityId = await callNative("home_start", () => getNativeModule()!.startActivity(body));
  if (activityId) await AsyncStorage.setItem(HOME_ACTIVITY_KEY, activityId).catch(() => undefined);
});

export const updateHomePresenceActivity = async (payload: {
  startedAt: string;
  progressStartedAt?: string | null;
  expiresAt: string;
  selfAvatarUrl?: string | null;
  companions?: HuddleActiveSessionCompanion[];
  companionsTotalCount?: number;
  friendCount?: number;
  nearbyUserCount?: number;
}) => {
  await clearDuplicateActiveSessionActivities();
  await seedOutNowSessionStart(payload.startedAt, payload.expiresAt);
  const activityId = await AsyncStorage.getItem(HOME_ACTIVITY_KEY).catch(() => null);
  if (!activityId) {
    await startHomePresenceActivity(payload);
    return;
  }
  const updated = await callNative("home_update", () => getNativeModule()!.updateActivity({
    activityId,
    sessionId: "home",
    kind: "map_out_now",
    startedAt: payload.startedAt,
    progressStartedAt: payload.progressStartedAt || null,
    expiresAt: payload.expiresAt,
    selfAvatarUrl: payload.selfAvatarUrl || null,
    friendCount: payload.friendCount,
    nearbyUserCount: payload.nearbyUserCount,
    ...companionPayload(payload.companions, payload.companionsTotalCount),
  }));
  if (updated === false) {
    activeSessionLog("home_update_recover_start", { reason: "native_activity_missing" });
    await AsyncStorage.removeItem(HOME_ACTIVITY_KEY).catch(() => undefined);
    await startHomePresenceActivity(payload);
  }
};

export const endHomePresenceActivity = async (options: { finalMessage?: string | null } = {}) => {
  // A Map pin can be stopped immediately after its optimistic UI appears. Wait
  // for a just-started native activity to publish its id before ending it, or
  // the stop could race and leave a stale banner behind.
  await activeSessionStartTail.catch(() => undefined);
  const activityId = await AsyncStorage.getItem(HOME_ACTIVITY_KEY).catch(() => null);
  await callNative("home_end", () => getNativeModule()!.endActivity({
    activityId: activityId || null,
    sessionId: "home",
    kind: "map_out_now",
    startedAt: new Date().toISOString(),
    finalMessage: options.finalMessage || null,
  }));
  await AsyncStorage.removeItem(HOME_ACTIVITY_KEY).catch(() => undefined);
  await AsyncStorage.removeItem(OUT_NOW_SESSION_START_KEY).catch(() => undefined);
};

export const clearHomePresenceActivityIfStored = async () => {
  const activityId = await AsyncStorage.getItem(HOME_ACTIVITY_KEY).catch(() => null);
  if (activityId) {
    await AsyncStorage.removeItem(HOME_ACTIVITY_KEY).catch(() => undefined);
  }
  await callNative("home_native_clear", async () => {
    const native = getNativeModule();
    if (!native?.clearHomeActivity) return null;
    await native.clearHomeActivity();
    return true;
  });
  await AsyncStorage.removeItem(OUT_NOW_SESSION_START_KEY).catch(() => undefined);
  await AsyncStorage.removeItem(OUT_NOW_CONTINUE_REQUEST_KEY).catch(() => undefined);
};

const careActivityKey = (serviceId: string) => `${CARE_ACTIVITY_KEY_PREFIX}${serviceId}`;

export const startCareSessionActivity = async (payload: {
  chatId: string;
  serviceId: string;
  startedAt: string;
  expiresAt?: string | null;
  pets?: HuddleActiveSessionCompanion[];
  petsTotalCount?: number;
  deepLink: string;
  awaitingText?: string | null;
  showAction?: boolean;
  completionRole?: "provider" | "requester" | null;
}) => serializeActiveSessionStart(async () => {
  const sessionId = String(payload.serviceId || "").trim();
  if (!payload.chatId || !sessionId) return;
  await clearDuplicateActiveSessionActivities();
  const body: BaseActiveSessionPayload = {
    sessionId,
    kind: "care_in_progress",
    startedAt: payload.startedAt,
    expiresAt: payload.expiresAt,
    deepLink: payload.deepLink,
    awaitingText: payload.awaitingText || null,
    showAction: payload.showAction !== false,
    completionRole: payload.completionRole || null,
    ...companionPayload(payload.pets, payload.petsTotalCount),
  };
  const activityId = await callNative("care_start", () => getNativeModule()!.startActivity(body));
  if (activityId) await AsyncStorage.setItem(careActivityKey(sessionId), activityId).catch(() => undefined);
});

export const verifyNativeActiveSessionCoexistence = async (expectedKinds: ActiveSessionKind[]) => {
  const native = getNativeModule();
  if (!native?.getActivitySnapshot) return null;
  const snapshot = await callNative("active_snapshot", () => native.getActivitySnapshot!());
  if (!Array.isArray(snapshot)) return null;
  const presentKinds = new Set(snapshot
    .filter((entry) => entry?.activityState !== "dismissed" && entry?.activityState !== "ended")
    .map((entry) => entry?.kind)
    .filter(Boolean));
  const missingKinds = expectedKinds.filter((kind) => !presentKinds.has(kind));
  activeSessionLog("active_snapshot_result", {
    expectedKinds,
    missingKinds,
    activities: snapshot.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      state: entry.activityState,
      stale: entry.isStale,
      relevanceScore: entry.relevanceScore,
    })),
  });
  return { snapshot, missingKinds };
};

export const updateCareSessionActivity = async (payload: {
  chatId: string;
  serviceId: string;
  startedAt: string;
  expiresAt?: string | null;
  pets?: HuddleActiveSessionCompanion[];
  petsTotalCount?: number;
  deepLink: string;
  awaitingText?: string | null;
  showAction?: boolean;
  completionRole?: "provider" | "requester" | null;
}) => {
  const sessionId = String(payload.serviceId || "").trim();
  if (!payload.chatId || !sessionId) return;
  await clearDuplicateActiveSessionActivities();
  const activityId = await AsyncStorage.getItem(careActivityKey(sessionId)).catch(() => null);
  if (!activityId) {
    await startCareSessionActivity(payload);
    return;
  }
  const updated = await callNative("care_update", () => getNativeModule()!.updateActivity({
    activityId,
    sessionId,
    kind: "care_in_progress",
    startedAt: payload.startedAt,
    expiresAt: payload.expiresAt,
    deepLink: payload.deepLink,
    awaitingText: payload.awaitingText || null,
    showAction: payload.showAction !== false,
    completionRole: payload.completionRole || null,
    ...companionPayload(payload.pets, payload.petsTotalCount),
  }));
  if (updated === false) {
    activeSessionLog("care_update_recover_start", { reason: "native_activity_missing", chatId: payload.chatId, serviceId: sessionId });
    await AsyncStorage.removeItem(careActivityKey(sessionId)).catch(() => undefined);
    await startCareSessionActivity(payload);
  }
};

export const syncNativeActiveSessionActionAuth = async (accessToken: string | null | undefined, refreshToken?: string | null) => {
  const token = String(accessToken || "").trim();
  if (!token) return;
  await serializeActionAuthMutation(() => callNative("action_auth_sync", async () => {
    const native = getNativeModule();
    if (!native?.setActionAuth) return null;
    return native.setActionAuth(token, String(refreshToken || "").trim() || null, supabaseUrl, supabaseAnonKey);
  }));
};

export const clearNativeActiveSessionActionAuth = async () => {
  await serializeActionAuthMutation(() => callNative("action_auth_clear", async () => {
    const native = getNativeModule();
    if (!native?.clearActionAuth) return null;
    return native.clearActionAuth();
  }));
};

export const endCareSessionActivity = async (sessionId: string, sessionAliases: string[] = []) => {
  if (!sessionId) return;
  const key = careActivityKey(sessionId);
  const activityId = await AsyncStorage.getItem(key).catch(() => null);
  await callNative("care_end", () => getNativeModule()!.endActivity({
    activityId: activityId || null,
    sessionId,
    sessionAliases: Array.from(new Set(sessionAliases.map((entry) => String(entry || "").trim()).filter(Boolean).filter((entry) => entry !== sessionId))),
    kind: "care_in_progress",
    startedAt: new Date().toISOString(),
  }));
  await AsyncStorage.removeItem(key).catch(() => undefined);
};

export const clearInactiveCareSessionActivities = async (activeSessions: Array<{ chatId: string; serviceId: string } | string>) => {
  const activePairs = activeSessions
    .map((entry) => typeof entry === "string" ? { chatId: entry, serviceId: entry } : entry)
    .map((entry) => ({ chatId: String(entry.chatId || "").trim(), serviceId: String(entry.serviceId || "").trim() }))
    .filter((entry) => entry.chatId && entry.serviceId);
  const activeSet = new Set(activePairs.map((entry) => entry.serviceId));
  const activeDeepLinks = activePairs.map((entry) => `huddle:///service-chat?room=${encodeURIComponent(entry.chatId)}&service=${encodeURIComponent(entry.serviceId)}&sheet=completion`);
  await callNative("care_native_stale_clear", async () => {
    const native = getNativeModule();
    if (!native?.clearInactiveCareActivities) return null;
    await native.clearInactiveCareActivities(activeDeepLinks);
    return true;
  });
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  const staleKeys = keys.filter((key) => key.startsWith(CARE_ACTIVITY_KEY_PREFIX) && !activeSet.has(key.slice(CARE_ACTIVITY_KEY_PREFIX.length)));
  await Promise.all(staleKeys.map(async (key) => {
    const sessionId = key.slice(CARE_ACTIVITY_KEY_PREFIX.length);
    if (!sessionId) return;
    await endCareSessionActivity(sessionId);
  }));
};

/**
 * Privacy barrier for sign-out and account replacement. Native surfaces are
 * removed before action credentials change, so the previous account cannot
 * remain visible or be re-registered under the next session.
 */
let clearAllActivitiesInFlight: Promise<void> | null = null;

export const clearAllNativeActiveSessionActivities = async () => {
  if (clearAllActivitiesInFlight) return clearAllActivitiesInFlight;
  clearAllActivitiesInFlight = (async () => {
    await Promise.all([
      clearHomePresenceActivityIfStored(),
      callNative("care_native_all_clear", async () => {
        const native = getNativeModule();
        if (!native?.clearInactiveCareActivities) return null;
        await native.clearInactiveCareActivities([]);
        return true;
      }),
    ]);
    const keys = await AsyncStorage.getAllKeys().catch(() => []);
    const activeSessionKeys = keys.filter((key) => key.startsWith(CARE_ACTIVITY_KEY_PREFIX));
    if (activeSessionKeys.length > 0) {
      await AsyncStorage.multiRemove(activeSessionKeys).catch(() => undefined);
    }
  })();
  try {
    await clearAllActivitiesInFlight;
  } finally {
    clearAllActivitiesInFlight = null;
  }
};

let duplicateClearInFlight: Promise<unknown> | null = null;

export const clearDuplicateActiveSessionActivities = async () => {
  if (duplicateClearInFlight) {
    await duplicateClearInFlight.catch(() => undefined);
    return;
  }
  duplicateClearInFlight = callNative("active_duplicate_clear", async () => {
    const native = getNativeModule();
    if (!native?.clearDuplicateActivities) return null;
    await native.clearDuplicateActivities();
    return true;
  }).finally(() => {
    duplicateClearInFlight = null;
  });
  await duplicateClearInFlight.catch(() => undefined);
};
