import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(resolve(appRoot, "src/screens/NativeMapScreen.tsx"), "utf8");
const social = readFileSync(resolve(appRoot, "src/screens/NativeSocialScreen.tsx"), "utf8");
const socialCard = readFileSync(resolve(appRoot, "src/components/social/NativeSocialFeedPrimitives.tsx"), "utf8");
const alertDetail = readFileSync(resolve(appRoot, "src/components/map/NativeAlertDetailModal.tsx"), "utf8");
const chatDialogue = readFileSync(resolve(appRoot, "src/screens/NativeChatDialogueScreen.tsx"), "utf8");
const serviceChat = readFileSync(resolve(appRoot, "src/screens/NativeServiceChatScreen.tsx"), "utf8");
const mapData = readFileSync(resolve(appRoot, "src/lib/nativeMapData.ts"), "utf8");
const rootNavigator = readFileSync(resolve(appRoot, "src/navigation/RootNavigator.tsx"), "utf8");
const notificationsPanel = readFileSync(resolve(appRoot, "src/components/NativeNotificationsPanel.tsx"), "utf8");
const socialMapVisibilityMigration = readFileSync(resolve(appRoot, "../supabase/migrations/20260820070257_social_map_visible_alert_location_link.sql"), "utf8");

const assertDeepLinkDetailLifecycle = (candidate: string) => {
  expect(candidate).toContain("const alertFocusRouteKeyRef = useRef<string | null>(null);");
  expect(candidate).toContain("const shouldConsumeAlertFocus = Boolean(alertRouteKey && alertFocusRouteKeyRef.current !== alertRouteKey);");
  expect(candidate).toContain("${effectiveUserId}|${search}|${alertFocusIntent}");
  expect(candidate).toContain("}, [alertFocusIntent, effectiveUserId, mapShellSessionKey, search]);");
  expect(candidate).toContain("const dismissAlertDetail = useCallback");
  const nextAlertIntent = candidate.slice(candidate.indexOf("} else if (shouldConsumeAlertFocus) {"), candidate.indexOf("setAlertFocus({ key: focusId!", candidate.indexOf("} else if (shouldConsumeAlertFocus) {")));
  expect(nextAlertIntent).toMatch(/alertFocusRequestRef\.current \+= 1;[\s\S]{0,120}selectedAlertDetailRequestIdRef\.current \+= 1;[\s\S]{0,120}alertFocusPendingRef\.current = true;/);
  // A -> B is an in-place detail transition. Clearing the selection here starts
  // a native iOS Modal dismissal before the cold B detail is ready, then races a
  // second presentation when the fetch resolves. State/logs can say B opened
  // while UIKit leaves the old transition's layer above the map.
  expect(nextAlertIntent).not.toContain("setSelectedAlert(null);");
  const coldResolveStart = candidate.indexOf("// Consume the route before fetching.");
  const coldResolve = candidate.slice(coldResolveStart, candidate.indexOf("}).catch", coldResolveStart));
  expect(coldResolve).toMatch(/if \(!alert\)[\s\S]{0,160}return;[\s\S]{0,360}setSelectedAlert\(alert\);/);
  const dismiss = candidate.slice(candidate.indexOf("const dismissAlertDetail = useCallback"), candidate.indexOf("\n\n  useEffect", candidate.indexOf("const dismissAlertDetail = useCallback")));
  expect(dismiss).toMatch(/alertFocusRequestRef\.current \+= 1;[\s\S]{0,160}selectedAlertDetailRequestIdRef\.current \+= 1;/);
  const directTap = candidate.slice(candidate.indexOf("const openMapAlert = useCallback"), candidate.indexOf("// Trigger 2"));
  expect(directTap).toMatch(/alertFocusRequestRef\.current \+= 1;[\s\S]{0,120}setAlertFocus\(null\);/);
};

describe("native map alert open contract", () => {
  it("opens both individual pins and zoomed-out alert cells through one path", () => {
    expect(source).toContain("onPress={() => openMapAlert(alert)}");
    expect(source).toContain("openMapAlert(cluster.primary)");
    expect(source).toContain("setExpandedAlertIds");
  });

  it("uses one true full-screen image viewer with confirmed saves for Map, Social, and Chats", () => {
    expect(alertDetail).toContain("NativeSocialMediaCarousel");
    expect(chatDialogue).toContain("NativeSocialMediaCarousel");
    expect(serviceChat).toContain("NativeSocialMediaCarousel");
    expect(socialCard).toContain("<View style={[styles.expandedMediaFrame, { height, width }]}>");
    expect(socialCard).not.toContain("const maxMediaHeight");
    expect(socialCard).toContain("Gesture.Simultaneous(pinch, pan, longPress, doubleTap)");
    expect(socialCard).toContain("Gesture.Tap().numberOfTaps(2)");
    expect(socialCard).toContain("const nextScale = savedScale.value > 1.01 ? 1 : 2;");
    expect(socialCard).toContain("onTouchEnd={handleSwipeDownEnd}");
    expect(socialCard).toContain("<Reanimated.View style={[styles.expandedImageWrap, animatedStyle]}");
    expect(socialCard).toContain("onLongPress={() => { if (!hiddenSensitive) setSaveTargetUri(item.uri); }}");
    expect(socialCard).toContain('<AppConfirmModal\n          body="Save this image to your photo library?"');
    expect(socialCard).toContain('<NativeToast message={saveNotice}');
  });

  it("suppresses the camera-idle map reload caused by alert centering", () => {
    expect(source).toContain("suppressNextAlertCameraIdleFetchRef.current = true");
    expect(source).toContain("if (suppressNextAlertCameraIdleFetchRef.current)");
  });

  it("consumes notification focus before detail hydration can restart", () => {
    expect(source).toMatch(/setAlertFocus\(null\);[\s\S]{0,180}fetchNativeMapAlertById\(focusId/);
    expect(source).not.toContain("setAlertFocusRetries");
  });

  it("treats a notification route as a one-shot intent, cancels stale detail work, and keeps A -> B in one Modal", () => {
    assertDeepLinkDetailLifecycle(source);
    expect(rootNavigator).toContain("const [mapAlertNavigationIntent, setMapAlertNavigationIntent] = useState(0);");
    expect(rootNavigator).toContain("if (nextRoute === \"/map\" && /(?:^|[?&])(alert|thread)=/.test(path)) {");
    expect(rootNavigator).toContain("alertFocusIntent={mapAlertNavigationIntent}");
    expect(source).toContain("NativeAlertDetailModal already fades");
  });

  it("waits for the notification drawer native Modal to unmount before routing to alert B", () => {
    const rowPress = notificationsPanel.slice(
      notificationsPanel.indexOf("haptic.selectTab();"),
      notificationsPanel.indexOf("const reviewTrigger", notificationsPanel.indexOf("haptic.selectTab();")),
    );
    expect(rowPress).toContain("pendingNavigationPathRef.current = path;");
    expect(rowPress).toContain("onClose();");
    expect(rowPress).not.toContain("onNavigate(path)");
    expect(notificationsPanel).toMatch(/if \(open \|\| rendered\) return;[\s\S]{0,520}requestAnimationFrame\(\(\) => onNavigateRef\.current\(path\)\)/);
  });

  it("fails if a later edit restores immediate drawer-to-detail navigation", () => {
    const tampered = notificationsPanel.replace(
      "pendingNavigationPathRef.current = path;",
      "onNavigate(path);",
    );
    const rowPress = tampered.slice(
      tampered.indexOf("haptic.selectTab();"),
      tampered.indexOf("const reviewTrigger", tampered.indexOf("haptic.selectTab();")),
    );
    expect(() => expect(rowPress).not.toContain("onNavigate(path)")).toThrow();
  });

  it("fails closed if a later edit removes the route or request invalidation guard", () => {
    const routeTampered = source.replace(
      "const shouldConsumeAlertFocus = Boolean(alertRouteKey && alertFocusRouteKeyRef.current !== alertRouteKey);",
      "const shouldConsumeAlertFocus = true;",
    );
    const replayTampered = source.replace("${effectiveUserId}|${search}|${alertFocusIntent}", "${effectiveUserId}|${search}");
    const requestTampered = source.replace(
      "alertFocusRequestRef.current += 1;\n    selectedAlertDetailRequestIdRef.current += 1;",
      "alertFocusRequestRef.current += 1;\n    selectedAlertDetailRequestIdRef.current += 0;",
    );
    expect(() => assertDeepLinkDetailLifecycle(routeTampered)).toThrow();
    expect(() => assertDeepLinkDetailLifecycle(replayTampered)).toThrow();
    expect(() => assertDeepLinkDetailLifecycle(requestTampered)).toThrow();
  });

  it("never probes alert liveness per visible post", () => {
    // This used to fire fetchNativeMapAlertById once per visible alert card, re-running on
    // every viewability change with only a 60s cache -- an N+1 on a scrolling list, purely
    // to compute one boolean. Liveness now ships with the feed row as alert_state.
    expect(social).not.toContain("viewableAlertIdsRef");
    expect(social).not.toContain("viewableAlertIdsKey");
    expect(social).not.toContain("setInactiveAlertIds");
    expect(social).not.toMatch(/isViewable[\s\S]{0,400}fetchNativeMapAlertById/);
  });

  it("serves alert liveness from the feed row instead of a probe", () => {
    const socialLib = readFileSync(resolve(appRoot, "src/lib/nativeSocial.ts"), "utf8");
    expect(socialLib).toContain('export type NativeSocialAlertState = "active" | "found" | "inactive"');
    expect(socialLib).toContain("alertState: normalizeAlertState(row.alert_state)");
    expect(socialLib).toContain("alertState: normalizeAlertState(hydration.alert_state)");
    // Anything not openable must be indistinguishable, so a hidden alert discloses nothing.
    expect(socialLib).toMatch(/value === "active" \|\| value === "found" \? value : "inactive"/);
  });

  it("keeps expired or removed alert posts in Social and renders their location as plain text", () => {
    // The post itself always survives; only the location affordance changes. A pin that
    // cannot be opened must not look tappable, and must not show an error notice.
    expect(socialCard).toContain('const alertIsOpenable = thread.alertState === "active" && Boolean(thread.mapId);');
    expect(socialCard).toContain("styles.mapLinkPlainText");
    expect(socialCard).not.toContain("That alert is no longer available.");
    expect(socialCard).not.toContain("mapLinkInactiveText");
    expect(socialCard).not.toContain("inactiveAlertNoticeOpacity");
    expect(socialCard).not.toContain("alertNoLongerActive");
    expect(social).not.toContain("dismissedInactiveAlertIds");
    // postDistrict is written onto the thread at cross-post time, so the label outlives the pin.
    expect(socialCard).toMatch(/deriveNativeSocialDistrictLabel\(thread\.alertDistrict\)\s*\|\| deriveNativeSocialDistrictLabel\(thread\.postDistrict\)/);
    // Icon and location are a single linked phrase, not two separated controls.
    expect(socialCard).toMatch(/mapLink: \{[\s\S]{0,160}gap: huddleSpacing\.x1,/);
  });

  it("keeps the Social location link openable for the full map-visible broadcast window", () => {
    // Social's "active" means map-openable, not "priority boost still running".
    // It must therefore use the exact retained-dot window used by the map RPC.
    expect(socialMapVisibilityMigration).toMatch(/ba\.created_at \+ make_interval\(hours => greatest\(1, least\(72, coalesce\(ba\.duration_hours, 24\)\)\)\) \+ interval '7 days' >= now\(\)/);
    expect(socialMapVisibilityMigration).toContain("public.can_view_verified_only_broadcast(ba.id) then 'active'");
    expect(socialMapVisibilityMigration).not.toContain("ba.expires_at is null or ba.expires_at > now()");
    expect(socialMapVisibilityMigration).toContain("security definer");
    expect(socialMapVisibilityMigration).toContain("revoke all on function public.get_social_feed_alert_context(uuid[]) from public, anon;");
  });

  it("shows a permanent Found badge on a post whose alert was resolved", () => {
    expect(socialCard).toContain("thread.foundAt ? (");
    expect(socialCard).toContain("styles.tagPill_found");
    expect(socialCard).toMatch(/Found · \$\{formatNativeSocialTimeAgo\(thread\.foundAt\)\}/);
  });

  it("opens a warm Social alert synchronously from the canonical Map entity", () => {
    expect(mapData).toContain("canonicalMapAlertCache");
    expect(mapData).toContain("export function peekNativeMapAlertById");
    expect(source).toMatch(/const warmAlert = alertParam[\s\S]{0,300}peekNativeMapAlertById/);
    expect(source).toMatch(/if \(warmAlert\)[\s\S]{0,400}setSelectedAlert\(warmAlert\)/);
    expect(source).toMatch(/Opening is synchronous from the shared entity[\s\S]{0,450}force: true/);
    expect(source).toMatch(/current\?\.id === freshAlert\.id \? freshAlert : current/);
  });

  it("reuses one deduplicated request for the cold fallback", () => {
    expect(social).toMatch(/fetchNativeMapAlertById\(item\.mapId, userId,[\s\S]{0,260}onNavigate/);
    expect(source).toMatch(/fetchNativeMapAlertById\(focusId[\s\S]{0,320}force: false/);
    expect(mapData).toContain("mapAlertDetailInFlight");
    expect(mapData).toMatch(/const existing = !options\?\.force \? mapAlertDetailInFlight\.get\(cacheKey\)[\s\S]{0,180}const request = \(async \(\) => \{/);
    expect(mapData).not.toMatch(/persistentMapCacheKey|readPersistentMapCache|writePersistentMapCache/);
    expect(mapData).toMatch(/const \[blockedIds, detailResult\] = await Promise\.all/);
  });
});
