export const NATIVE_DISCOVERY_DECK_CACHE_LIMIT = 8;
export const NATIVE_DISCOVERY_TAIL_REFILL_THRESHOLD = 4;

export const NATIVE_DISCOVERY_CYCLE_MS = 24 * 60 * 60 * 1000;

export const nativeDiscoveryPassedCycleStorageKey = (userId: string) =>
  `native-chats:discovery-passed-cycle:v2:${userId}`;

export const nativeDiscoveryCycleStartedAtStorageKey = (userId: string) =>
  `native-chats:discovery-cycle-started-at:v1:${userId}`;

export const nativeDiscoveryStableDeckStorageKey = (userId: string) =>
  `native-chats:discovery-stable-deck:v3:${userId}`;

export const nativeDiscoveryCycleIsActive = (cycleStartedAt: string | null | undefined, nowMs = Date.now()) => {
  const startedAtMs = Date.parse(String(cycleStartedAt || ""));
  return Number.isFinite(startedAtMs) && nowMs < startedAtMs + NATIVE_DISCOVERY_CYCLE_MS;
};

export const mergeNativeStableDiscoveryDeck = <T extends { id: string }>(
  current: T[],
  incoming: T[],
  limit = NATIVE_DISCOVERY_DECK_CACHE_LIMIT,
): T[] => {
  const seenIds = new Set(current.map((profile) => profile.id));
  const appended: T[] = [];
  for (const profile of incoming) {
    if (seenIds.has(profile.id)) continue;
    seenIds.add(profile.id);
    appended.push(profile);
  }
  return [...current, ...appended].slice(0, limit);
};

export const selectNativeDailyUnpassedProfiles = <T extends { id: string }>(
  eligible: T[],
  passedIds: ReadonlySet<string>,
  limit = NATIVE_DISCOVERY_DECK_CACHE_LIMIT,
): T[] => eligible.filter((profile) => !passedIds.has(profile.id)).slice(0, limit);

export const shouldRefillNativeDiscoveryTail = ({
  deckLength,
  loadSettled,
  loading,
  visible,
}: {
  deckLength: number;
  loadSettled: boolean;
  loading: boolean;
  visible: boolean;
}) => visible && loadSettled && !loading && deckLength > 0 && deckLength <= NATIVE_DISCOVERY_TAIL_REFILL_THRESHOLD;

export const nativeDiscoveryTailRefillAttemptKey = (cycleStartedAt: string | null, profileIds: string[]) =>
  `${cycleStartedAt || "new-cycle"}:${profileIds.join(",")}`;
