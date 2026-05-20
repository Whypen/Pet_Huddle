export type NativeLoadPhase = "BOOT" | "HOME" | "P1_BACKGROUND" | "LAZY";

export type RefreshSurface =
  | "auth"
  | "profile_exists"
  | "profile_summary"
  | "active_pets"
  | "tier_quota_restrictions"
  | "notification_unread"
  | "chat_unread"
  | "chat_inbox_summary"
  | "viewer_location_scope"
  | "map_shell"
  | "discover_cards"
  | "social_first_page_shell"
  | "service_cards"
  | "groups_invites"
  | "matched_rail_summary"
  | "chat_messages"
  | "public_profile"
  | "pet_detail"
  | "alert_detail"
  | "media_carousel"
  | "service_provider_detail"
  | "comments_replies";

export const LOAD_PHASE_DEFINITIONS: Record<NativeLoadPhase, readonly RefreshSurface[]> = {
  BOOT: ["auth", "profile_exists"],
  HOME: [
    "profile_summary",
    "active_pets",
    "tier_quota_restrictions",
    "notification_unread",
    "chat_unread",
    "chat_inbox_summary",
    "viewer_location_scope",
    "map_shell",
  ],
  P1_BACKGROUND: [
    "discover_cards",
    "social_first_page_shell",
    "service_cards",
    "groups_invites",
    "matched_rail_summary",
  ],
  LAZY: [
    "chat_messages",
    "public_profile",
    "pet_detail",
    "alert_detail",
    "media_carousel",
    "service_provider_detail",
    "comments_replies",
  ],
};

type RefreshStatus = "started" | "deduped" | "completed";

const inFlight = new Map<string, Promise<unknown>>();
const refreshed = new Map<string, Set<RefreshSurface>>();

export const createNativeSessionKey = (userId: string, sessionGeneration: number) =>
  `${String(userId || "").trim()}:${Math.max(0, Math.trunc(sessionGeneration))}`;

const registryKey = (sessionKey: string, surface: RefreshSurface) => `${sessionKey}:${surface}`;

export const freshnessRegistry = {
  hasRefreshed(sessionKey: string, surface: RefreshSurface) {
    return refreshed.get(sessionKey)?.has(surface) === true;
  },

  isInFlight(sessionKey: string, surface: RefreshSurface) {
    return inFlight.has(registryKey(sessionKey, surface));
  },

  markRefreshed(sessionKey: string, surface: RefreshSurface) {
    const set = refreshed.get(sessionKey) ?? new Set<RefreshSurface>();
    set.add(surface);
    refreshed.set(sessionKey, set);
  },

  async runOnce<T>(
    sessionKey: string,
    surface: RefreshSurface,
    task: () => Promise<T>,
  ): Promise<{ status: RefreshStatus; value?: T }> {
    if (this.hasRefreshed(sessionKey, surface)) {
      if (__DEV__) console.log("NATIVE_FRESHNESS_DEDUPE", { sessionKey, surface, reason: "already_refreshed" });
      return { status: "deduped" };
    }

    const key = registryKey(sessionKey, surface);
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      if (__DEV__) console.log("NATIVE_FRESHNESS_DEDUPE", { sessionKey, surface, reason: "in_flight" });
      await existing;
      return { status: "deduped" };
    }

    if (__DEV__) console.log("NATIVE_FRESHNESS_START", { sessionKey, surface });
    const promise = task();
    inFlight.set(key, promise);
    try {
      const value = await promise;
      this.markRefreshed(sessionKey, surface);
      if (__DEV__) console.log("NATIVE_FRESHNESS_SUCCESS", { sessionKey, surface });
      return { status: "completed", value };
    } catch (error) {
      if (__DEV__) console.log("NATIVE_FRESHNESS_FAIL_KEEP_CACHE", { sessionKey, surface, error: String((error as { message?: unknown })?.message || error) });
      throw error;
    } finally {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    }
  },
};

export const isCurrentSessionKey = (currentSessionKey: string | null | undefined, writeSessionKey: string) =>
  Boolean(currentSessionKey && writeSessionKey && currentSessionKey === writeSessionKey);

export const cacheWriteGuard = (currentSessionKey: string | null | undefined, writeSessionKey: string) => {
  const allowed = isCurrentSessionKey(currentSessionKey, writeSessionKey);
  if (!allowed && __DEV__) {
    console.log("NATIVE_FRESHNESS_STALE_WRITE_BLOCKED", {
      currentSessionKey: currentSessionKey ?? null,
      writeSessionKey,
    });
  }
  return allowed;
};
