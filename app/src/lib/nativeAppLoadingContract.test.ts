import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(src, "../..");
const read = (path: string) => readFileSync(resolve(src, path), "utf8");

describe("native app light loading contract", () => {
  it("releases signed-in navigation after auth while background warming keeps its own deadline", () => {
    const root = read("navigation/RootNavigator.tsx");
    expect(root).toMatch(/BOOT_AUTH_SESSION_MAX_MS = 4000/);
    expect(root).toMatch(/BOOT_SURFACE_PREWARM_MAX_MS = 4000/);
    expect(root).toMatch(/BOOT_HOME_PRIORITY_WINDOW_MS = 700/);
    expect(root).not.toMatch(/BOOT_BRAND_AUTH_MIN_MS/);
    expect(root).not.toMatch(/shouldHoldBrandBoot/);
    expect(root).toMatch(/Promise\.race\(\[homeFirstPaintWarm, wait\(BOOT_HOME_PRIORITY_WINDOW_MS\)\]\)/);
    expect(root).toMatch(/setTimeout\(\(\) => releaseBootGate\("deadline"\), BOOT_SURFACE_PREWARM_MAX_MS\)/);
    expect(root).toMatch(/disableVideo=\{!animate\}/);
    expect(root).toMatch(/animate=\{!bootBrandAnimationExpired\}/);
    expect(root).toMatch(/releaseBootGate\("complete"\)/);
    expect(root).toMatch(/const \[bootHomeReadySessionKey, setBootHomeReadySessionKey\]/);
    expect(root).toMatch(/void homeFirstPaintWarm\.then\(\(\) => releaseHomeBrand\("complete"\)\)/);
    expect(root).toMatch(/releaseHomeBrand\(reason\)/);
    const signedInSurfaceWarm = root.slice(
      root.indexOf("// Do not spend signed-in surface work while signup/onboarding is still in"),
      root.indexOf("useEffect(() => {\n    if (!userId || !session?.access_token) return;", root.indexOf("// Do not spend signed-in surface work while signup/onboarding is still in")),
    );
    expect(signedInSurfaceWarm).toMatch(/onboarding\?\.onboardingCompleted !== true\) return/);
    expect(signedInSurfaceWarm).toContain("socialBootWarmSessionKeyRef.current === sessionKey");
    expect(root).toMatch(/const signedInBrandTransitionPending = Boolean\(/);
    expect(root).toMatch(/signedInBrandTransitionPending \? \([\s\S]*<NativeBootBrandMedia mode="loading" \/>/);
    const signedInBootCondition = root.slice(
      root.indexOf("// A signed-out app also waits here"),
      root.indexOf("// Decided, signed-out, first run."),
    );
    expect(signedInBootCondition).toContain("!authBootChecked");
    expect(signedInBootCondition).toContain("!session && openingIntroDecision === null");
    expect(signedInBootCondition).not.toContain("bootSurfacePrewarmSessionKey");
    expect(signedInBootCondition).not.toContain("bootHomeReadySessionKey");
  });

  it("warms Home first and still covers every main tab before releasing the gate", () => {
    const root = read("navigation/RootNavigator.tsx");
    const homePriority = root.indexOf("const profileWarm");
    const secondaryPriority = root.indexOf("const immediatelyWarmable");
    expect(homePriority).toBeGreaterThan(-1);
    expect(secondaryPriority).toBeGreaterThan(homePriority);
    expect(root).toMatch(/runSurface\("profile_summary"/);
    expect(root).toMatch(/runSurface\("active_pets"/);
    expect(root).toMatch(/runSurface\("nearby_out_snapshot"/);
    expect(root).toMatch(/runSurface\("discover_cards"/);
    expect(root).toMatch(/runSurface\("chat_inbox_summary"/);
    expect(root).toMatch(/runSurface\("social_first_page_shell"/);
    expect(root).toMatch(/runSurface\("map_shell"/);
    expect(root).toMatch(/runSurface\("service_cards"/);
    expect(root).toMatch(/await immediatelyWarmable;\s*await Promise\.allSettled\(\[profileWarm, scopeWarm\]\)/);
    expect(root).toMatch(/await Promise\.allSettled\(\[homeFirstPaintWarm, scopeDependentWarm\]\)/);
  });

  it("reuses the boot GPS result while resolving viewer scope", () => {
    const root = read("navigation/RootNavigator.tsx");
    const scope = read("lib/nativeViewerScope.ts");
    const map = read("screens/NativeMapScreen.tsx");
    const care = read("screens/NativeServiceScreen.tsx");
    expect(root).not.toMatch(/A signup-approved location is persisted by nativeLocation/);
    expect(root).toMatch(/One canonical location read owns both Home and Map startup/);
    expect(root).toMatch(/devicePoint: coords/);
    expect(scope).toMatch(/devicePoint !== undefined \? devicePoint : await getNativeCurrentCoordinates/);
    expect(scope).toMatch(/VIEWER_SCOPE_ENTRY_REUSE_MS = 30 \* 1000/);
    expect(scope).toContain("viewerScopeMemoryCache");
    expect(scope).toContain("viewerScopeMemoryCache.set(key, { scope, storedAt: Date.now() })");
    expect(scope).toMatch(/if \(entryCachedScope\) return entryCachedScope/);
    expect(scope).toMatch(/const existing = viewerScopeInFlight\.get\(requestKey\);\s*if \(existing\) return existing/);
    expect(map).toMatch(/resolveNativeViewerScope\(\{ userId: effectiveUserId, accessToken, sessionKey: mapShellSessionKey \}\)/);
    expect(care).toMatch(/resolveNativeViewerScope\(\{ userId: nextEffectiveUserId, accessToken, sessionKey: requestSessionKey \}\)/);
  });

  it("does not turn a completed unread refresh into another notification request", () => {
    const root = read("navigation/RootNavigator.tsx");
    const home = read("screens/NativeHomeScreen.tsx");
    expect(root).toMatch(/result\?\.value \?\? cachedCount \?\? await fetchCount\(\)/);
    expect(home).toMatch(/fetchNativeUnreadNotificationCountWithToken\([\s\S]*?sessionKey: sessionKeyForWrite, cacheWriteGuard: guardedCacheWrite/);
  });

  it("dedupes profile, map shell, Social feed, chat inbox and service-card requests in flight", () => {
    const profile = read("lib/nativeProfileSummary.ts");
    const map = read("lib/nativeMapData.ts");
    const chat = read("lib/nativeChat.ts");
    const service = read("lib/nativeService.ts");
    const socialData = read("lib/nativeSocial.ts");
    const home = read("screens/NativeHomeScreen.tsx");
    expect(profile).not.toMatch(/if \(options\.force\) inFlight\.delete/);
    expect(home).toMatch(/const existing = homePetsInFlight\.get\(requestKey\);\s*\/\/[\s\S]*?if \(existing\) return existing/);
    expect(home).toMatch(/const existing = homeNearbyPeopleInFlight\.get\(key\);\s*if \(existing\) return existing/);
    expect(map).toMatch(/const inFlight = mapPinShellInFlight\.get\(cacheKey\);\s*if \(inFlight\) return inFlight/);
    expect(socialData).toMatch(/const existing = nativeSocialFeedInFlight\.get\(requestKey\);\s*if \(existing\) return existing/);
    expect(chat).toMatch(/NATIVE_CHAT_INBOX_CACHE_HIT/);
    expect(chat).toMatch(/const inFlight = nativeChatInboxInFlight\.get\(key\);\s*if \(inFlight\) return inFlight/);
    expect(service).toMatch(/nativeServiceProvidersInFlight/);
  });

  it("treats confirmed empty Map and Social results as real cache entries", () => {
    const map = read("lib/nativeMapData.ts");
    const social = read("screens/NativeSocialScreen.tsx");
    expect(map).not.toContain("!(options?.accessToken && cached.rows.length === 0)");
    expect(map).not.toContain("rows.length > 0 || !options?.accessToken");
    expect(social).toContain("if (cachedFeed) {");
    expect(social).toContain("if (recentlyConfirmed) return;");
    expect(social).toContain('if (mode === "reset" && cacheWriteGuard())');
    expect(social).not.toContain("cachedFeed?.rows?.length");
  });

  it("uses warm Home, Social, Chats and Care data without an immediate duplicate fetch", () => {
    const home = read("screens/NativeHomeScreen.tsx");
    const social = read("screens/NativeSocialScreen.tsx");
    const chats = read("screens/NativeChatsScreen.tsx");
    const care = read("screens/NativeServiceScreen.tsx");
    const mapData = read("lib/nativeMapData.ts");
    const membership = read("screens/NativeManageSubscriptionScreen.tsx");
    const setPet = read("screens/NativeSetPetScreen.tsx");
    expect(home).toMatch(/homeCommunityInFlight/);
    expect(home).toMatch(/freshnessRegistry\.runOnce\(sessionKey, "nearby_out_snapshot"/);
    expect(home).toMatch(/if \(!options\.force\) \{\s*const cached = await readHomeCommunityCache/s);
    expect(social).toMatch(/SOCIAL_FEED_ENTRY_REUSE_MS = 30 \* 1000/);
    expect(chats).toMatch(/fetchNativeProfileSummary\(userId, \{ accessToken, sessionKey \}\)/);
    expect(chats).toMatch(/refreshUnreadTotal\(false\)/);
    expect(chats).toMatch(/resolveNativeViewerScope\(\{ userId, accessToken, sessionKey \}\)/);
    expect(care).toMatch(/viewerScope: careViewerScope,\s*force,/s);
    expect(read("screens/NativeMapScreen.tsx")).not.toMatch(/fetchNativeProfileSummary\(effectiveUserId, \{ force: true, accessToken, sessionKey: mapShellSessionKey \}\)/);
    expect(home).toMatch(/fetchHomePets\(userId, \{ force: forceDb, accessToken, sessionKey, cacheWriteGuard: guardedCacheWrite \}\)/);
    expect(home).toMatch(/void loadHome\(\{ showLoading: true \}\)\.then\(\(\) =>/);
    expect(home).not.toMatch(/fetchHomePets\(userId, \{ force: showLoading \|\| forceDb,/);
    const homeEntry = home.slice(home.indexOf("const becameActive = active && !wasActiveRef.current;"), home.indexOf("useEffect(() => {\n    if (!userId) return;\n    void touchNativeLastActive"));
    expect(homeEntry).not.toContain("loadHome(");
    expect(home).not.toMatch(/void loadHome\(\{ showLoading: false, forceDb: true \}\);/);
    expect(chats).toMatch(/fetchNativeChatInbox\(\{ userId, accessToken, sessionKey, scope: "all", onlyWithActivity: null, limit: 80 \}\)/);
    expect(chats).toMatch(/scope: "groups",\s*onlyWithActivity: null,\s*limit: 80,\s*force,\s*forceDb: force,/s);
    expect(mapData).toMatch(/force: options\.force === true/);
    expect(mapData).not.toMatch(/fetchNativeProfileSummary\(userId, \{\s*force: true,/s);
    expect(setPet).toMatch(/fetchNativeProfileSummary\(userId, \{ accessToken, sessionKey \}\)/);
    expect(membership).toMatch(/fetchNativeProfileSummary\(userId, \{ accessToken: token, sessionKey \}\)/);
    expect(social).not.toMatch(/fetchNativeProfileSummary\(userId, \{ force: true, accessToken \}\)/);
  });

  it("gives every persistent main tab one entry gate plus shared cache or in-flight protection", () => {
    const home = read("screens/NativeHomeScreen.tsx");
    const social = read("screens/NativeSocialScreen.tsx");
    const chats = read("screens/NativeChatsScreen.tsx");
    const care = read("screens/NativeServiceScreen.tsx");
    const map = read("screens/NativeMapScreen.tsx");
    expect(home).toMatch(/const wasActiveRef = useRef\(active\)/);
    expect(home).toMatch(/homePetsInFlight/);
    expect(social).toMatch(/const wasActiveRef = useRef\(active\)/);
    expect(social).toMatch(/feedLoadGateRef/);
    expect(chats).toMatch(/const wasActiveRef = useRef\(active\)/);
    expect(chats).toMatch(/loadRowsGateRef/);
    expect(care).toMatch(/const wasActiveRef = useRef\(active\)/);
    expect(care).toMatch(/loadInFlightRef/);
    expect(map).toMatch(/const wasActiveRef = useRef\(active\)/);
    expect(map).toMatch(/mapShellRequestKeyRef/);
  });

  it("keeps committed Discover and Care surfaces visible during ordinary tab returns", () => {
    const chats = read("screens/NativeChatsScreen.tsx");
    const care = read("screens/NativeServiceScreen.tsx");
    expect(chats).toMatch(/const preserveVisibleDiscoverDeck = silent && discoverProfilesRef\.current\.length > 0/);
    expect(chats).toMatch(/if \(preserveVisibleDiscoverDeck\) \{\s*setDiscoverLoadSettled\(true\);\s*setDiscoverSettledKey\(loadKey\);/);
    expect(chats).toMatch(/if \(!preserveVisibleDiscoverDeck\) \{\s*setDiscoverStatus\("error"\);/);
    expect(chats).toContain("committedLoadKeysRef.current.has(activeChatsLoadKey)");
    expect(care).not.toContain("SERVICE_TAB_REVALIDATION_MS");
    const careEntry = care.slice(care.indexOf("const becameActive = active && !wasActiveRef.current;"), care.indexOf("// Provider review averages"));
    expect(careEntry).not.toMatch(/if \(!becameActive\) return;\s*void load\(/);
    expect(careEntry).toMatch(/if \(realtimeDirtyRef\.current\)/);
  });

  it("keeps ordinary main-route navigation network-free after committed paint", () => {
    const map = read("screens/NativeMapScreen.tsx");
    const social = read("screens/NativeSocialScreen.tsx");
    const chats = read("screens/NativeChatsScreen.tsx");
    const mapEntry = map.slice(map.indexOf("const becameActive = active && !wasActiveRef.current;"), map.indexOf("useEffect(() => {\n    if (!tokenConfig.ok)"));
    const socialEntry = social.slice(social.indexOf("const becameActive = active && !wasActiveRef.current;"), social.indexOf("// Instant cache-first paint"));
    const chatsEntry = chats.slice(chats.indexOf("const becameActive = active && !wasActiveRef.current;"), chats.indexOf("useEffect(() => {\n    if (topTab !== \"discover\""));
    expect(mapEntry).not.toContain("loadMapDataRef.current");
    expect(socialEntry).not.toContain('load("reset")');
    expect(chatsEntry).not.toContain("loadRows(");
  });

  it("does not start non-realtime Care or Discover work while their mounted route is inactive", () => {
    const chats = read("screens/NativeChatsScreen.tsx");
    const care = read("screens/NativeServiceScreen.tsx");
    expect(chats).toMatch(/useEffect\(\(\) => \{\s*if \(!active \|\| !userId\) return;\s*if \(committedLoadKeysRef\.current\.has\(activeChatsLoadKey\)\) return;/);
    expect(chats).toContain('if (!active || !userId || discoverAgeEligible !== true || !discoveryCycleStartedAt) return;');
    expect(care).toMatch(/useEffect\(\(\) => \{\s*if \(!active\) return;\s*void load\(\);/);
    expect(care).toMatch(/if \(!active\) \{\s*realtimeDirtyRef\.current = true;\s*return;\s*\}/);
    expect(care).toMatch(/if \(realtimeDirtyRef\.current\) \{\s*realtimeDirtyRef\.current = false;\s*void load\(true, true\);/);
  });

  it("paints cached pet and carer details before authoritative refresh work settles", () => {
    const pet = read("screens/NativePetDetailsScreen.tsx");
    const carer = read("screens/NativeCarerProfileScreen.tsx");
    const petCacheRead = pet.indexOf("const cachedData = petId");
    const petScopeAwait = pet.indexOf("const [accessibleRow, nextFamilyContext] = await Promise.all");
    expect(petCacheRead).toBeGreaterThan(-1);
    expect(petScopeAwait).toBeGreaterThan(petCacheRead);
    expect(pet.slice(petCacheRead, petScopeAwait)).toContain("setLoading(false)");
    const carerCacheRead = carer.indexOf("readCachedNativeProfileSummary(viewedUserId");
    const carerForceRead = carer.indexOf("fetchNativeProfileSummary(viewedUserId, { force: true");
    expect(carerCacheRead).toBeGreaterThan(-1);
    expect(carerForceRead).toBeGreaterThan(carerCacheRead);
    expect(carer.slice(carerCacheRead, carerForceRead)).toContain("setLoading(false)");
  });

  it("gives every full-screen loading owner a bounded escape path", () => {
    for (const path of [
      "screens/NativeHomeScreen.tsx",
      "screens/NativeSocialScreen.tsx",
      "screens/NativeChatsScreen.tsx",
      "screens/NativeServiceScreen.tsx",
      "screens/NativeChatDialogueScreen.tsx",
      "screens/NativeServiceChatScreen.tsx",
      "screens/NativeProfileSummaryScreen.tsx",
      "screens/NativePetDetailsScreen.tsx",
      "screens/NativeCarerProfileScreen.tsx",
      "screens/NativeEditProfileScreen.tsx",
      "screens/NativeSetPetScreen.tsx",
      "screens/NativeManageSubscriptionScreen.tsx",
    ]) {
      expect(read(path), path).toContain("useNativeLoadingDeadline(");
    }
    const signup = read("screens/NativeSignupScreen.tsx");
    const verify = read("screens/NativeVerifyIdentityScreen.tsx");
    expect(signup).toContain("SIGNUP_DRAFT_LOAD_TIMEOUT_MS");
    expect(verify).toContain("withNativeVerifyIdentityTimeout(");
  });

  it("never announces a Discover failure while a newer request is still loading", () => {
    const chats = read("screens/NativeChatsScreen.tsx");
    expect(chats).toMatch(/catch \(error\) \{[\s\S]*?if \(loadRowsGateRef\.current\.key !== loadKey \|\| inboxRequestSeqRef\.current !== requestSeq\) return;[\s\S]*?setDiscoverStatus\("error"\)/);
    const dedupeIndex = chats.indexOf("if (gate.key === loadKey && gate.inFlight)");
    const ownershipIndex = chats.indexOf("const requestSeq = ++inboxRequestSeqRef.current", dedupeIndex);
    expect(ownershipIndex).toBeGreaterThan(dedupeIndex);
    expect(chats).not.toContain('setStatus(message.includes("invalid_age_range") ? "Set a valid age range." : "Discover could not load. Pull to retry.")');
    expect(chats).toMatch(/finally \{\s*if \(loadRowsGateRef\.current\.key === loadKey && inboxRequestSeqRef\.current === requestSeq\) \{[\s\S]*?setLoading\(false\)/);
  });

  it("keeps stale Community and inbox failures silent but preserves current failure toasts", () => {
    const chats = read("screens/NativeChatsScreen.tsx");
    expect(chats).toMatch(/if \(loadRowsGateRef\.current\.key === loadKey && inboxRequestSeqRef\.current === requestSeq && !silent\) \{\s*setStatus\("Community could not load\. Pull to refresh\."\)/);
    expect(chats).toMatch(/if \(loadRowsGateRef\.current\.key === loadKey && inboxRequestSeqRef\.current === requestSeq\) \{[\s\S]*?setStatus\("Failed to load conversations\. Pull to refresh\."\)/);
    expect(chats).toMatch(/finally \{\s*if \(loadRowsGateRef\.current\.key === loadKey && inboxRequestSeqRef\.current === requestSeq\) \{/);
  });

  it("confirms a Mapbox failure before replacing the loading surface", () => {
    const map = read("screens/NativeMapScreen.tsx");
    expect(map).toContain("MAP_LOAD_ERROR_CONFIRMATION_MS = 1200");
    expect(map).toContain("MAP_LOAD_DEADLINE_MS = 8000");
    expect(map).toContain('key={`native-map-${mapReloadKey}`}');
    expect(map).toContain("setMapReloadKey((current) => current + 1)");
    expect(map).toMatch(/onDidFinishLoadingMap=\{\(\) => \{[\s\S]*?clearTimeout\(mapLoadErrorTimerRef\.current\)[\s\S]*?setLoadError\(null\)/);
    expect(map).toMatch(/onMapLoadingError=\{\(\) => \{[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?if \(mapLoadedRef\.current\) return;[\s\S]*?setLoadError\("Mapbox failed to load\."\)/);
  });

  it("keeps Care local-first while realtime reconciliation runs silently", () => {
    const careChat = read("screens/NativeServiceChatScreen.tsx");
    expect(careChat).toMatch(/readCachedServiceChatHistory/);
    expect(careChat).toMatch(/writeCachedServiceChatHistory/);
    expect(careChat).toMatch(/hydrateServiceMessages\(nextMessages,/);
    expect(careChat).toMatch(/scheduleRealtimeCareRefresh\(subscriptionRoomId, subscriptionSessionKey, "service_chats"\)/);
    expect(careChat).toMatch(/void load\(true\)/);
    expect(careChat).not.toMatch(/clearCachedServiceChatRow\(userId, targetSessionKey, targetRoomId\);\s*void load\(true\)/);
    expect(careChat).toMatch(/Keep the last confirmed local snapshot visible when reconciliation fails/);
  });

  it("renders chat identity from navigation state only after notification ownership confirmation", () => {
    const root = read("navigation/RootNavigator.tsx");
    const dialogue = read("screens/NativeChatDialogueScreen.tsx");
    const notifications = read("lib/nativeNotifications.ts");
    const actionRpc = root.indexOf('supabase.rpc("execute_notification_action"');
    const actionRoute = root.indexOf('enqueueInboundDestination(resultPath, "notification")');
    expect(actionRpc).toBeGreaterThan(-1);
    expect(actionRoute).toBeGreaterThan(actionRpc);
    const ownershipCheck = root.indexOf("verifyNativeNotificationOwnershipWithToken(", root.indexOf('if (action === "open")'));
    const ownershipRoute = root.indexOf('if (ownership === "owned" && defaultPath)', ownershipCheck);
    const defaultRoute = root.indexOf('enqueueInboundDestination(defaultPath, "notification")', ownershipRoute);
    expect(ownershipCheck).toBeGreaterThan(-1);
    expect(ownershipRoute).toBeGreaterThan(ownershipCheck);
    expect(defaultRoute).toBeGreaterThan(ownershipRoute);
    expect(root.slice(ownershipCheck, ownershipRoute)).toContain("activeUserId");
    expect(root.slice(ownershipCheck, ownershipRoute)).toContain("session?.access_token");
    expect(notifications).toMatch(/user_id: `eq\.\$\{cleanUserId\}`/);
    expect(notifications).toMatch(/\}, NOTIFICATION_OWNERSHIP_TIMEOUT_MS\)/);
    expect(dialogue).toMatch(/selectedHandoffRow\?\.peerUserId \|\| params\.withUserId \|\| params\.name/);
    expect(notifications).toMatch(/if \(!params\.get\("name"\) && chatName\) params\.set\("name", chatName\)/);
    expect(notifications).toMatch(/if \(!params\.get\("avatar"\) && chatAvatar\) params\.set\("avatar", chatAvatar\)/);
    expect(notifications).toMatch(/params\.set\("returnTo"/);
  });

  it("keeps the notification hub cache-first and independent from GPS/map detail loading", () => {
    const panel = read("components/NativeNotificationsPanel.tsx");
    const notifications = read("lib/nativeNotifications.ts");
    const cacheRead = panel.indexOf("readCachedNativeNotifications(userId");
    const networkRead = panel.indexOf("fetchNativeNotificationsWithToken(userId");
    expect(cacheRead).toBeGreaterThan(-1);
    expect(networkRead).toBeGreaterThan(cacheRead);
    expect(notifications).not.toMatch(/resolveNativeNotificationAlertScope/);
    expect(notifications).not.toMatch(/withResolvedAlertScopeMetadata/);
    expect(notifications).not.toMatch(/fetchNativeMapAlertById/);
    expect(notifications).toMatch(/const filterHubNotifications/);

    const alertCleanup = readFileSync(resolve(repo, "supabase/migrations/20260718153000_delete_alert_notifications_with_alert.sql"), "utf8");
    expect(alertCleanup).toMatch(/after delete on public\.broadcast_alerts/);
    expect(alertCleanup).toMatch(/delete from public\.notifications/);
  });

  it("keeps Social topic switches cache-first and terminates exhausted pagination", () => {
    const social = read("screens/NativeSocialScreen.tsx");
    const socialData = read("lib/nativeSocial.ts");
    expect(social).toMatch(/void load\("revalidate"\)/);
    expect(social).toMatch(/topicCoverageAttemptRef\.current\.has\(attemptKey\)/);
    expect(social).toMatch(/void load\("coverage"\)/);
    expect(social).toMatch(/if \(visibleThreads\.length > 0 && hasMore\) void load\("more"\)/);
    expect(social).toMatch(/cursorRef\.current = page\.cursor;\s*hasMoreRef\.current = page\.hasMore;\s*setCursor\(page\.cursor\);\s*setHasMore\(page\.hasMore\)/s);
    expect(social).not.toMatch(/ListFooterComponent=\{loadingMore \?[^\n]+\}\s*onEndReached=\{\(\) => void load\("more"\)\}/);
    expect(socialData).toMatch(/const fetchLimit = Math\.min\(limit \+ 1, 25\)/);
    expect(socialData).toMatch(/hasMore: fetchedRows\.length > limit/);
  });
});
