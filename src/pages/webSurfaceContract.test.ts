import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("web surface release contract", () => {
  it("keeps joined public groups in Explore like the native merge", () => {
    const chats = source("src/pages/ScopedChats.tsx");
    expect(chats).toContain("mergeJoinedPublicGroups");
    expect(chats).toContain('row.room_type === "group" && row.visibility === "public"');
    expect(chats).toContain("const joined = mergeJoinedPublicGroups(joinedGroups, groups);");
    expect(chats).toContain("setJoinedGroups(joined)");
  });

  it("keeps signed-in Map full-bleed and removes stock Mapbox navigation", () => {
    const routes = source("src/routes/FullAppRoutes.tsx");
    const mapRouteStart = routes.indexOf('path="/map"');
    const mapRoute = routes.slice(mapRouteStart, mapRouteStart + 1_000);
    expect(mapRoute).toContain("<DesktopSurfaceRail>");
    expect(mapRoute).toContain("<AppShell fullBleed>");
    expect(source("src/pages/Map.tsx")).not.toContain("new mapboxgl.NavigationControl");
  });

  it("matches native Map sharing precision and presentation contracts", () => {
    const map = source("src/pages/Map.tsx");
    const nativePrecision = source("app/src/lib/nativeMapPrecision.ts");
    expect(nativePrecision).toContain('NATIVE_MAP_PRECISION_DEFAULT: NativeMapPrecision = "area"');
    expect(map).toContain('const MAP_PRECISION_DEFAULT: MapPrecision = "area"');
    expect(map).toContain('p_precision: next');
    expect(map).toContain('p_visible_hours: mapShareHours');
    expect(map).toContain('const toggleInvisible = useCallback');
    expect(map).not.toContain('const changeMapShareHours = useCallback');
    expect(map).not.toContain('"precise", Crosshair');
    expect(map).not.toContain('Sharing for');
    expect(map).not.toContain('Your location in ~500m area.');
    expect(map).toContain('type MapPrecision = "area" | "hidden"');
    expect(nativePrecision).toMatch(/value === "hidden" \? value : NATIVE_MAP_PRECISION_DEFAULT/);
    expect(nativePrecision).not.toContain('"precise"');
    expect(source("app/src/screens/NativeMapScreen.tsx")).not.toContain("Finding precise address");
    expect(map).not.toContain("native_map_set_invisible");
    expect(map).toContain('callRpc("get_visible_map_pin_shells_with_audience"');
    expect((map.match(/callRpc\("get_visible_map_pin_shells_with_audience"/g) || [])).toHaveLength(1);
    expect(map).toContain("Date.now() - cached.at < 60_000");
    expect(map).not.toContain('callRpc(\n          "get_visible_broadcast_alerts"');
    expect(source("src/components/map/AlertMarkersOverlay.tsx")).toContain("Open ${group.members.length} alerts in this area");
    expect(source("src/lib/mapAlertAggregation.ts")).toContain("MAP_ALERT_COLLISION_DISTANCE_PX = 46");
    expect(source("src/components/map/AlertMarkersOverlay.tsx")).toContain("const ALERT_BLOB_RADIUS_METERS = 750");
    expect(source("src/lib/mapAlertAggregation.ts")).toContain('count >= 9 ? "9+"');
    expect(source("src/components/map/AlertMarkersOverlay.tsx")).toContain("animate-ping rounded-full border opacity-20");
    expect(source("src/components/map/BroadcastRangeOverlay.tsx")).toContain('alert.creator_id !== viewerId');
    const pinDetail = source("src/components/map/PinDetailModal.tsx");
    expect(pinDetail).not.toContain('.from("profiles")');
    expect(pinDetail).not.toContain('.from("threads")');
    expect(source("src/components/map/BroadcastRangeOverlay.tsx")).toContain('animate-ping');
    expect(map).toContain('get_broadcast_alert_by_id_with_audience');
    expect(map).not.toContain("#A6D539");
    expect(map).not.toContain("#B9FF00");
    expect(map).toContain('<HuddleGlyph name="mapAlert"');
    expect(map).toContain('<HuddleGlyph name="mapUser"');
    const friends = source("src/components/map/FriendMarkersOverlay.tsx");
    expect(friends).toContain('"city" | "compact" | "detail"');
    expect(friends).toContain('const FRIEND_OVERVIEW_ZOOM = 12');
    expect(friends).toContain('const FRIEND_DETAIL_ZOOM = 15.5');
    expect(friends).toContain('const MAP_ZOOM_TIER_HYSTERESIS = 0.25');
    expect(friends).toContain('const resolveZoomTier');
    expect(source("src/index.css")).toContain('[data-huddle-bottom-sheet="true"]');
    expect(source("src/index.css")).toContain("@media (min-width: 768px)");
  });

  it("keeps the public Social projection sensitive-aware and read-only carousel navigation ungated", () => {
    const publicSocial = source("src/pages/public/PublicSocial.tsx");
    const publicRead = source("src/lib/publicRead.ts");
    const publicApi = source("api/public-feed.ts");
    const projection = source("supabase/migrations/20260821173000_public_social_sensitive_media_parity.sql");
    expect(publicSocial).toContain("isSensitive: post.is_sensitive === true");
    expect(publicSocial).toContain("media: post.images.map");
    expect(publicSocial).toContain("onShare={() => void sharePost(post)}");
    expect(publicRead).toContain("is_sensitive: boolean");
    expect(publicApi).toContain("is_sensitive: row.is_sensitive === true");
    expect(projection).toContain("coalesce(c.is_sensitive, false) as is_sensitive");
    expect(projection).not.toContain("and coalesce(t.is_sensitive, false) = false");
  });

  it("does not blank Group Explore when Vercel omits a country-region header", () => {
    const publicGroups = source("api/public-groups.ts");
    expect(publicGroups).toContain(
      'header(req, "x-vercel-ip-country-region") || header(req, "x-vercel-ip-country")',
    );
  });

  it("coarsens logged-out Map alerts through the native area-cell geometry", () => {
    const projection = source("supabase/migrations/20260821170000_coarsen_public_alert_projection.sql");
    expect(projection).toContain("public.map_area_cell_v2(a.latitude, a.longitude)");
    expect(projection).toContain("cell.lat");
    expect(projection).toContain("cell.lng");
    expect(projection).not.toMatch(/select\s+a\.id,\s*a\.latitude,\s*a\.longitude/is);
    expect(projection).toContain("exact stored alert coordinates are never returned");
  });

  it("renders the existing Social composer inline rather than as a desktop sheet", () => {
    const social = source("src/components/social/NoticeBoard.tsx");
    const bar = source("src/components/social/SocialComposerBar.tsx");
    const modal = source("src/components/social/noticeboard/NoticeBoardComposerModal.tsx");
    expect(social).toContain('presentation={editingNoticeId ? "sheet" : "inline"}');
    expect(social).toContain("inlineTarget={composerInlineHostRef.current}");
    expect(bar).toContain('placeholder="What\'s happening?"');
    expect(bar).toContain('aria-label="Add photo or video"');
    expect(bar).toContain("focus:border-brandBlue/35");
    expect(social).toContain("submitDisabled={creating || remainingCreateWords < 0}");
    expect(social).not.toContain("submitDisabled={creating || !content.trim() || !title.trim()");
    expect(modal).toContain("disabled={creating || remainingCreateWords < 0}");
    expect(modal).not.toContain("disabled={creating || !content.trim() || !title.trim()");
    expect(social).toContain('if (!title.trim()) nextErrors.title = t("Title is required")');
    expect(social).toContain('if (!composedContent.trim()) nextErrors.content = t("Content is required")');
    expect(source("src/pages/Social.tsx")).toContain("composeSignal={composeSignal}");
  });

  it("collapses an untouched Social composer after focus leaves the whole composer", () => {
    const social = source("src/components/social/NoticeBoard.tsx");
    expect(social).toContain("collapseEmptyCreateComposerAfterBlur");
    expect(social).toContain("composerShellRef.current?.contains(document.activeElement)");
    expect(social).toContain("if (title.trim() || content.trim() || createMediaFiles.length > 0 || editingNoticeId) return");
    expect(social).toContain("setIsCreateOpen(false)");
    expect(social).toContain("onContentBlur={collapseEmptyCreateComposerAfterBlur}");
  });

  it("uses the app's canonical Social mutation RPCs and no raw thread writes", () => {
    const social = source("src/components/social/NoticeBoard.tsx");
    expect(social).toContain('rpc("create_native_social_thread"');
    expect(social).toContain('rpc("update_native_social_thread"');
    expect(social).toContain('rpc("delete_social_thread"');
    expect(social).not.toContain('.from("threads" as "profiles")');
  });

  it("keeps Social controls visible and the public composer plus topic rail sticky", () => {
    const signed = source("src/pages/Social.tsx");
    const publicSocial = source("src/pages/public/PublicSocial.tsx");
    const topics = source("src/components/social/SocialSectionList.tsx");
    expect(signed).not.toContain("controlsHidden");
    expect(publicSocial).toContain('className="sticky top-14');
    expect(publicSocial).toContain("primaryTag: post.category || null");
    expect(publicSocial).toContain("publicTagClassName");
    expect(topics).toContain("overflowEdges.right");
    expect(topics).toContain("scrollbar-hide");
    expect(topics).not.toContain("scrollbar-none");
  });

  it("never falls back from Social projections to raw feed/profile table reads", () => {
    const feed = source("src/components/social/noticeboard/feedData.ts");
    expect(feed).toContain('"get_social_feed"');
    expect(feed).toContain('"get_social_feed_hydration"');
    expect(feed).toContain('"get_user_engagement_tiers"');
    expect(feed).not.toContain('from("threads"');
    expect(feed).not.toContain('from("profiles"');
    expect(feed).not.toContain("hydrateRowsLegacy");
  });

  it("renders the native pillar author treatment from the canonical engagement batch", () => {
    const social = source("src/components/social/NoticeBoard.tsx");
    expect(social).toContain('notice.author?.engagement?.tier === "pillar"');
    expect(social).toContain("text-[var(--engagement-pillar)]");
    expect(source("src/index.css")).toContain("--engagement-pillar:   #C8861A");
  });

  it("keeps the topic rail directly below the composer and genuinely draggable", () => {
    const social = source("src/components/social/NoticeBoard.tsx");
    const host = social.indexOf("<div ref={composerInlineHostRef}");
    const topics = social.indexOf("<SocialSectionList", host);
    expect(host).toBeGreaterThan(-1);
    expect(topics).toBeGreaterThan(host);
    expect(social.slice(host, topics)).not.toContain("filtersRowRef");
    const rail = source("src/components/social/SocialSectionList.tsx");
    expect(rail).toContain("overflow-x-auto");
    expect(rail).toContain("touch-pan-x");
    expect(rail).toContain("onPointerMove");
    expect(rail).toContain("rail.scrollLeft = drag.scrollLeft - delta");
    expect(rail).toContain("overflowEdges.right");
    expect(rail).toContain("bg-gradient-to-l");
  });

  it("keeps Social search and app-order sorting available without auth", () => {
    const signed = source("src/pages/Social.tsx");
    const guest = source("src/pages/public/PublicSocial.tsx");
    for (const page of [signed, guest]) {
      expect(page).toContain('aria-label="Search"');
      expect(page).toContain('aria-label="Sort"');
      expect(page.indexOf('"Latest"')).toBeLessThan(page.indexOf('"Trending"'));
    }
    expect(signed).toContain('mobileControl === "search"');
    expect(signed).toContain('mobileControl === "sort"');
    expect(guest).toContain('activeControl === "search"');
    expect(guest).toContain('activeControl === "sort"');
    expect(guest).not.toContain('requireAuth("search"');
    expect(guest).not.toContain('requireAuth("share"');
  });

  it("uses the same upright MaterialCommunity paw paths as native", () => {
    const paw = source("src/components/icons/HuddlePawIcon.tsx");
    expect(paw).toContain("const PAW =");
    expect(paw).toContain("const PAW_OUTLINE =");
    expect(source("src/components/social/ThreadCard.tsx")).toContain("<HuddlePawIcon");
    expect(source("src/components/social/ThreadCard.tsx")).not.toContain("<PawPrint");
  });

  it("centres the auth wall at every viewport size", () => {
    const wall = source("src/components/auth/AuthWall.tsx");
    expect(wall).toContain("<GlassModal");
    expect(wall).not.toContain("<GlassSheet");
    expect(wall).toContain('backdropClassName="!bg-foreground/[0.55]"');
  });

  it("owns every public and member destination in one navigation contract", () => {
    const config = source("src/components/layout/navDestinations.ts");
    const member = source("src/components/layout/DesktopSurfaceRail.tsx");
    const guest = source("src/pages/public/PublicChrome.tsx");
    expect(config.indexOf('id: "social"')).toBeLessThan(config.indexOf('id: "map"'));
    expect(config.indexOf('id: "map"')).toBeLessThan(config.indexOf('id: "groups"'));
    expect(config.indexOf('id: "groups"')).toBeLessThan(config.indexOf('id: "chats"'));
    expect(config).toContain('id: "groups", path: "/groups"');
    expect(config).toContain('id: "chats", path: "/chats"');
    expect(config).toContain('gate: "requires-auth"');
    for (const shell of [member, guest]) {
      expect(shell).toContain("NAV_DESTINATIONS.map");
      expect(shell).toContain("isNavDestinationActive(destination, pathname, search)");
    }
    expect(member).not.toContain("const destinations = [");
    expect(guest).not.toContain("const DESTINATIONS = [");
    expect(guest).not.toContain("const MOBILE_DESTINATIONS");
  });

  it("preserves native group-empty copy and walls the write", () => {
    const groups = source("src/pages/public/PublicChats.tsx");
    expect(groups).toContain('No public groups nearby yet. Be the first to start a local pack!');
    expect(groups).not.toContain('body="Be the first to start a local pack!"');
    expect(groups).toContain('requireAuth("create-group"');
    expect(groups).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(groups).not.toContain('max-w-[680px]');
  });

  it("keeps audited mobile controls at the 44px minimum", () => {
    const composer = source("src/components/social/SocialComposerBar.tsx");
    const topics = source("src/components/social/SocialSectionList.tsx");
    const guest = source("src/pages/public/PublicSocial.tsx");
    expect(composer).toContain("h-11 min-w-11");
    expect(composer).toContain("grid h-11 w-11");
    expect(topics).toContain("h-12 min-w-11");
    expect(guest).toContain('aria-label="Search"');
    expect(guest).toContain("grid h-11 w-11");
  });

  it("removes Home from the scoped mobile navigation and exposes Groups", () => {
    const nav = source("src/components/layout/BottomNav.tsx");
    const destinations = source("src/components/layout/navDestinations.ts");
    expect(nav).toContain("NAV_DESTINATIONS.map");
    expect(nav).not.toContain("const navItems");
    expect(destinations).not.toContain('id: "home"');
    expect(destinations).toContain('path: "/groups"');
    expect(destinations.indexOf('id: "social"')).toBeLessThan(destinations.indexOf('id: "map"'));
    expect(destinations.indexOf('id: "map"')).toBeLessThan(destinations.indexOf('id: "groups"'));
    expect(destinations.indexOf('id: "groups"')).toBeLessThan(destinations.indexOf('id: "chats"'));
  });

  it("expands the collapsed desktop rail on hover or tap", () => {
    const rail = source("src/components/layout/DesktopSurfaceRail.tsx");
    expect(rail).toContain("suppressHoverExpansionRef");
    expect(rail).toContain("if (collapsed && !suppressHoverExpansionRef.current) setHoverExpanded(true)");
    expect(rail).toContain("onClickCapture={() => {");
    expect(rail).toContain("if (collapsed) setHoverExpanded(true)");
  });

  it("uses the native Auth motion assets on Join", () => {
    const brand = source("src/components/brand/WebBrandMedia.tsx");
    expect(brand).toContain("app/assets/APP/brandlogo.mp4");
    expect(brand).toContain("app/assets/APP/brandlogofallback.png");
    expect(source("src/pages/Join.tsx")).toContain("<WebBrandMedia");
  });

  it("keeps Join concise, app-labelled and free of the rejected marketing block", () => {
    const join = source("src/pages/Join.tsx");
    expect(join).not.toContain("Pets bring us together");
    expect(join).not.toContain("WELCOME TO HUDDLE");
    expect(join).toMatch(/>\s*Sign in\s*</);
    expect(join).toContain(">\n        Help\n");
    expect(join).toContain("text-[rgba(66,73,101,0.45)]");
    expect(join).toContain("text-brandText/[0.72]");
    expect(join).toContain("Cookies Policy");
    expect(join).toContain('rounded-[24px]');
  });

  it("keeps settings in-place and removes fake linked-device QR behavior", () => {
    const settings = source("src/components/layout/SettingsMenu.tsx");
    expect(settings).not.toContain("DeviceLinkPanel");
    expect(settings).not.toContain("Linked devices");
    expect(settings).not.toContain('navigate("/")');
    expect(settings).toContain('toggle("profile")');
    expect(settings).toContain('toggle("account")');
    expect(settings).toContain('setPasswordOpen(true)');
    expect(settings).toContain('setDeleteOpen(true)');
    expect(settings).toContain('authChangePassword');
    expect(settings).toContain('functions.invoke("delete-account"');
    expect(settings).toContain('label="Report a problem"');
    expect(settings).toContain("onEscapeKeyDown");
    expect(settings).not.toContain("<GlassModal");
  });

  it("centres and auto-rotates the app profile card without flip instructions", () => {
    const card = source("src/components/profile/ProfileShareCard.tsx");
    expect(card).toContain("window.setInterval");
    expect(card).toContain("5200");
    expect(card).toContain("<GlassModal");
    expect(card).not.toContain("<GlassSheet");
    expect(card).not.toContain("Tap the card to flip");
  });

  it("keeps Groups Explore separate from private Chats in every shell", () => {
    const destinations = source("src/components/layout/navDestinations.ts");
    expect(destinations).toContain('path: "/groups"');
    expect(destinations).toContain('path: "/chats"');
    for (const file of [
      "src/components/layout/BottomNav.tsx",
      "src/components/layout/DesktopSurfaceRail.tsx",
      "src/pages/public/PublicChrome.tsx",
    ]) {
      const shell = source(file);
      if (!file.endsWith("BottomNav.tsx")) expect(shell).toContain("NAV_DESTINATIONS");
    }
    expect(source("src/pages/public/PublicChats.tsx")).toContain("<PublicTopBar");
    const routes = source("src/routes/FullAppRoutes.tsx");
    expect(routes).toContain('<Route path="/groups" element={null} />');
    const chats = source("src/pages/ScopedChats.tsx");
    expect(chats).toContain('const groupsExplore = pathname.startsWith("/groups")');
    expect(routes).toContain('import("@/pages/ScopedChats")');
    expect(routes).not.toContain('import("@/pages/Chats")');
    expect(chats).not.toMatch(/Discover|Care|Stripe|service-chat|ServiceChat/);
    expect(chats).toContain("groupsExplore");
    expect(chats).toContain('aria-label="Search groups"');
    expect(chats).toContain('aria-label="Join group with code"');
    expect(chats).toContain('aria-label="Create group"');
    expect(chats).toContain("Complete identity verification in the huddle app");
    expect(chats).toContain('>Friends</button>');
    expect(chats).toContain('>Groups</button>');
    expect(chats).toContain('No public groups nearby yet. Be the first to start a local pack!');
    expect(chats).toContain('Meet friends on Social, then start a chat here.');
    expect(chats).toContain('Better in a pack! Create or join a group to start coordinating local meetups.');
    expect(chats).toContain('@/assets/Notifications/Empty Chat.png');
    expect(chats).toContain('"get_chat_inbox_summaries"');
    expect(chats).toContain('"search_chat_inbox"');
    expect(chats).toContain('loadInbox(inboxScope, inboxScope === "friends" ? false : null, 80, null, force)');
    expect(chats).toContain('loadInbox("friends", true, INBOX_FIRST_PAGE, null, force)');
    expect(chats).toContain("dedupeInboxRowsByPeer([...baseRows, ...activeRows])");
    expect(chats).toContain("filter(isRenderableInboxRow)");
    expect(chats).toContain("isMatchedRailRow(row, activeMatchedPeerIds)");
    expect(chats).toContain("matchedSummaryToInboxRow(summary)");
    expect(chats).toContain("parseInboxPreview(row.last_message_content)");
    expect(chats).toContain('loadInbox("friends", true, INBOX_NEXT_PAGE, inboxCursor)');
    expect(chats).toContain('channel(`user:${user.id}:inbox`');
    expect(chats).toContain('.on("broadcast", { event: "changed" }, reconcile)');
    expect(chats).toContain('"get_native_viewer_group_context"');
    expect(chats).toContain('"get_native_viewer_scope"');
    expect(chats).toContain('"get_public_groups_for_viewer"');
    expect(chats).toContain("loadSequenceRef");
    expect(chats).toContain("sequence !== loadSequenceRef.current");
    expect(chats).toContain("!loading && !loadError && visibleGroups.length === 0");
    expect(chats).toContain("!loading && !loadError && filteredInbox.length === 0");
    expect(chats).toContain("Try again");
    expect(chats).toContain("[groups.public.failed]");
    expect(chats).toContain("setInvites(");
    expect(chats).not.toMatch(/\.from\("(chats|chat_messages|chat_participants|chat_room_members|profiles|user_locations|group_join_requests)"\)/);
    expect(source("src/pages/ChatsTwoPane.tsx")).toContain("if (isGroupsExplore)");
    expect(source("src/pages/ChatsTwoPane.tsx")).toContain('className="h-[100svh] w-full overflow-y-auto"');
    expect(source("src/pages/ChatsTwoPane.tsx")).toContain('className="flex h-[100svh] w-full overflow-hidden"');
    expect(source("src/pages/ChatsTwoPane.tsx")).not.toContain('max-w-[1100px]');
  });

  it("matches native Groups Explore preview and out-now behavior without a duplicate fetch", () => {
    const card = source("src/components/chat/ExploreGroupCard.tsx");
    const aurora = source("src/components/chat/AuroraCover.tsx");
    const chats = source("src/pages/ScopedChats.tsx");
    const map = source("src/pages/Map.tsx");
    expect(card).toContain('"get_public_group_preview_members"');
    expect(card).toContain('AuroraCover seed={group.id} initial={group.name}');
    expect(aurora).toContain('"#2145CF", "#3A5FE8", "#BFFF00"');
    expect(aurora).toContain('hash = Math.imul(hash, 0x01000193)');
    expect(aurora).toContain('62 + pick(2, 24)');
    expect(card).toContain('loading="lazy"');
    expect(card).toContain('decoding="async"');
    expect(card).toContain("outNowCount");
    expect(card).toContain("member{outNowCount === 1 ? \" is\" : \"s are\"} out now");
    expect(chats).toContain('"get_native_matched_rail_summary"');
    expect(chats).toContain("p_limit: 500");
    expect(chats).toContain("hydratePreviewMembers={Boolean(user?.id)}");
    expect(chats).toContain("friendIds={activeMatchedPeerIds}");
    expect(chats).toContain("outIds={visibleOutIds}");
    expect(chats).not.toContain('get_visible_map_pin_shells_with_audience');
    expect(map).toContain("publishVisibleUserPinIds(nextPins.map((pin) => pin.id))");
  });

  it("matches native alert field gating for featured map markers", () => {
    const web = source("src/components/map/AlertMarkersOverlay.tsx");
    const native = source("app/src/screens/NativeMapScreen.tsx");
    expect(web).toContain("ACTIVE_ALERT_RIPPLE_MAX_MARKERS = 16");
    expect(web).toContain('new Set(["lost", "stray", "caution"])');
    expect(web).toContain('alert.marker_state !== "expired_dot"');
    expect(web).toContain("group.members.length === 1");
    expect(web).toContain("alert.creator_id !== viewerId");
    expect(web).toContain("motion-reduce:animate-none");
    expect(source("src/pages/Map.tsx")).toContain("viewerId={user?.id || null}");
    expect(native).toContain("ACTIVE_ALERT_RIPPLE_MAX_MARKERS = 16");
    expect(native).toContain("activeRippleCandidateCount <= ACTIVE_ALERT_RIPPLE_MAX_MARKERS");
  });

  it("creates groups through the app's server-owned RPC without split table writes", () => {
    const create = source("src/components/chat/CreateGroupSheet.tsx");
    expect(create).toContain('"create_native_group_chat"');
    expect(create).toContain("p_invite_user_ids: []");
    expect(create).not.toContain('.from("chats")');
    expect(create).not.toContain('.from("chat_participants")');
    expect(create).not.toContain('.from("chat_room_members")');
    expect(create).not.toContain('.from("chat_messages")');
    expect(create).not.toContain('.from("user_locations")');
  });

  it("uses the app's protected dialogue RPCs for messages, reads, and chat profiles", () => {
    const dialogue = source("src/pages/ChatDialogue.tsx");
    expect(dialogue).toContain('"get_native_chat_dialogue_snapshot"');
    expect(dialogue).toContain("profile_hydration_failed");
    expect(dialogue).toContain("return [] as Record<string, unknown>[]");
    expect(dialogue).toContain('"send_native_chat_message"');
    expect(dialogue).toContain('"mark_room_read_messages"');
    expect(dialogue).toContain('"get_native_chat_read_receipts"');
    expect(dialogue).toContain('"get_native_chat_profile_summaries"');
    expect(dialogue).toContain('"get_native_group_member_state"');
    expect(dialogue).toContain('"[chats.dialogue.load_failed]"');
    expect(dialogue).toContain("stage: loadStage");
    expect(dialogue).toContain("const dialogueLoadToast = (stage: string)");
    expect(dialogue).toContain("Messages didn't load. Try again in a moment.");
    expect(dialogue).not.toContain("Unable to load messages right now.");
    expect(dialogue).not.toContain("Unable to open conversation right now.");
    expect(dialogue).not.toContain('.from("chat_messages")');
    expect(dialogue).not.toContain('.from("message_reads")');
    expect(dialogue).not.toContain('.from("chat_participants")');
    expect(dialogue).not.toContain('.select("*")');
  });

  it("keeps feed avatar decoding off the critical render path", () => {
    const thread = source("src/components/social/ThreadCard.tsx");
    const avatar = source("src/components/layout/SettingsAvatar.tsx");
    expect(thread).toContain('loading="lazy"');
    expect(avatar).toContain('decoding="async"');
  });

  it("makes Create contextual and removes it from Chats", () => {
    const rail = source("src/components/layout/DesktopSurfaceRail.tsx");
    expect(rail).toContain('pathname.startsWith("/map")');
    expect(rail).toContain('"/map?mode=broadcast"');
    expect(rail).toContain('pathname.startsWith("/chats")');
    expect(rail).toContain("? null");
    expect(rail).toContain('"Create Broadcast"');
    expect(rail).toContain('"Create Group"');
  });

  it("keeps auth on /join with native entry copy and complete signup fields", () => {
    const routes = source("src/routes/PublicAuthRoutes.tsx");
    const join = source("src/pages/Join.tsx");
    const callback = source("src/pages/AuthCallback.tsx");
    expect(routes).not.toContain('import("@/pages/Auth")');
    expect(routes).toContain('params.set("mode", "signin")');
    expect(join).toContain(">\n        Help\n");
    expect(join).toContain("<WebBrandMedia size={96} />");
    expect(join).toContain("Sign in to huddle");
    expect(join).not.toContain("Pets bring us together");
    expect(join).not.toContain("WELCOME TO HUDDLE");
    expect(join).toContain('label="Social ID"');
    expect(join).toContain('label="Confirm password"');
    expect(join).toContain('id="join-password-rules"');
    expect(join).toContain('rounded-[24px] border border-border/70 bg-white/80 p-4');
    expect(join).toContain("HelpSupportDialog");
    expect(join.match(/Continue with Apple/g)?.length).toBeGreaterThanOrEqual(3);
    expect(join.match(/Continue with Google/g)?.length).toBeGreaterThanOrEqual(3);
    expect(join).toContain('setLegalOpen("terms")');
    expect(join).toContain('setLegalOpen("privacy")');
    expect(join).toContain("<LegalModal");
    expect(join).toContain("const resumed = takeAuthIntent();");
    expect(join).toContain("navigate(resolveReturnTo(), { replace: true })");
    expect(join).not.toContain('href="/legal/terms"');
    expect(join).not.toContain('href="/legal/privacy"');
    expect(callback).toContain("resolveAuthReturnTo(resumed?.returnTo, takeAuthReturnTo())");
    expect(callback).toContain("!pendingDestination || !hydratedUser?.id || hydrating");
    expect(callback).toContain("void refreshProfile().finally");
    expect(join).toContain("pendingLoginReturn === undefined || !user?.id || hydrating");
    expect(join).not.toContain('nextPath || "/social"');
    expect(callback).toContain('"/join?mode=signin"');
    expect(callback).not.toContain('navigate("/auth"');
    const publicRoute = source("src/components/auth/PublicRoute.tsx");
    const editProfile = source("src/pages/EditProfile.tsx");
    const editPetProfile = source("src/pages/EditPetProfile.tsx");
    expect(routes).toContain('path="/auth" element={<LegacyAuthRedirect />}');
    expect(routes).toContain('params.set("next", originatingPath)');
    expect(routes).not.toContain('import("@/pages/Auth")');
    expect(publicRoute).toContain("resolveAuthReturnTo(readAuthIntent()?.returnTo, nextPath)");
    expect(publicRoute).not.toContain('<Navigate to="/"');
    expect(editProfile).toContain("takeResolvedAuthReturnTo()");
    expect(editPetProfile.match(/takeResolvedAuthReturnTo\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(editProfile).not.toContain('shouldSetPet ? "/set-pet" : "/"');
    expect(editPetProfile).not.toContain('window.location.replace("/")');
  });

  it("uses native map interaction RPCs and keeps public map navigation readable", () => {
    const detail = source("src/components/map/PinDetailModal.tsx");
    const publicMap = source("src/pages/public/PublicMap.tsx");
    const signedInMap = source("src/pages/Map.tsx");
    expect(detail).toContain('rpc("native_map_alert_supported"');
    expect(detail).toContain('rpc("native_map_alert_support_count"');
    expect(detail).toContain('rpc("native_map_upsert_alert_interaction"');
    expect(detail).toContain('rpc("native_map_remove_alert_interaction"');
    expect(detail).not.toContain('.from("broadcast_alert_interactions"');
    expect(publicMap).toContain('placeholder="Search an area"');
    expect(publicMap).toContain('onClick={recenter}');
    expect(publicMap).toContain('id="public-map-search-error"');
    expect(publicMap).not.toContain('setLocationNotice("No matching area found.');
    expect(publicMap).toContain("navigator.geolocation.getCurrentPosition");
    expect(publicMap).toContain("enableHighAccuracy: false");
    expect(publicMap).not.toContain('requireAuth("map-location"');
    expect(publicMap).toContain("initialAlertViewportApplied");
    expect(signedInMap).toContain('const MAP_PRECISION_DEFAULT: MapPrecision = "area"');
    expect(signedInMap).toContain('requireAuth("see-alert"');
    expect(signedInMap).toContain('requireAuth("broadcast"');
    expect(signedInMap).toContain('requireAuth("map-location"');
    expect(signedInMap).toContain('{user ? <div className="absolute inset-x-0 z-[1600]');
    expect(signedInMap).toContain('permission.state === "denied"');
    expect(signedInMap).toContain('setGpsFailureReason("permission")');
    expect(signedInMap).toContain('// "prompt" deliberately invokes the browser-owned permission request.');
    expect(signedInMap).toContain("requestCurrentPosition();");
  });

  it("hydrates the shell after a normal Map marker press like native Map", () => {
    const map = source("src/pages/Map.tsx");
    expect(map).toContain("const handleAlertSelect = useCallback");
    expect(map).toContain("setSelectedAlert(alert);");
    expect(map).toContain("void fetchAlertByIdForDeepLink(alert.id).then");
    expect(map).toContain("if (detail) setSelectedAlert(detail);");
    expect(source("app/src/screens/NativeMapScreen.tsx")).toContain("fetchNativeMapAlertById(alert.id, effectiveUserId");
  });

  it("lets Social use the available desktop canvas instead of forcing a mobile-width column", () => {
    const signedInSocial = source("src/pages/Social.tsx");
    const publicSocial = source("src/pages/public/PublicSocial.tsx");
    const publicChrome = source("src/pages/public/PublicChrome.tsx");
    for (const social of [signedInSocial, publicSocial]) {
      expect(social).toContain("lg:px-8 2xl:px-12");
      expect(social).not.toContain('max-w-[640px]');
      expect(social).not.toContain('max-w-[920px] px-4');
    }
    const desktopHeader = publicChrome.slice(publicChrome.indexOf('<header className="sticky top-0'), publicChrome.indexOf('</header>') + 9);
    expect(desktopHeader).not.toContain("max-w-[680px]");
  });

  it("keeps settings lightweight and excludes family and identity flows from the global bundle", () => {
    const header = source("src/components/layout/GlobalHeader.tsx");
    const menu = source("src/components/layout/SettingsMenu.tsx");
    const settingsPage = source("src/pages/Settings.tsx");
    expect(menu).toContain('label="Membership"');
    expect(menu).toContain('label="My huddle Code"');
    expect(menu).toContain('label="Add a Friend"');
    expect(menu).not.toContain('label="Family Account"');
    expect(menu).not.toContain('label="Identity Verification"');
    expect(header).not.toContain("ManageFamilySheet");
    expect(header).not.toContain('from("family_members"');
    expect(menu).not.toContain("notification_preferences");
    expect(settingsPage).not.toContain("notification_preferences");
    expect(settingsPage).not.toContain("Notification settings");
  });

  it("keeps Supabase RPC methods bound on every shipped web surface", () => {
    [
      "src/pages/Map.tsx",
      "src/pages/ScopedChats.tsx",
      "src/pages/public/PublicMap.tsx",
      "src/components/social/NoticeBoard.tsx",
      "src/components/social/noticeboard/feedData.ts",
      "src/components/social/noticeboard/socialParityApi.ts",
      "src/lib/profileShareCard.ts",
    ].forEach((path) => {
      const webSurface = source(path);
      expect(webSurface, path).not.toContain("(supabase.rpc as");
      expect(webSurface, path).not.toContain("const rpc = supabase.rpc as");
    });
  });

  it("uses the app notification REST projection instead of a web-only table-query path", () => {
    const header = source("src/components/layout/GlobalHeader.tsx");
    const notifications = source("src/lib/webNotifications.ts");
    expect(header).toContain("fetchWebUnreadNotifications");
    expect(header).toContain("fetchWebNotifications");
    expect(header).toContain("markWebNotificationsRead");
    expect(header).not.toContain('.from("notifications")');
    expect(notifications).toContain('select: "id,message,body,title,metadata,data"');
    expect(notifications).toContain('select: "id,message,title,body,type,href,read,created_at,metadata,data"');
    expect(notifications).toContain('Authorization: `Bearer ${token}`');
    expect(notifications).toContain('method: "PATCH"');
    expect(notifications).toContain('body: JSON.stringify({ read: true })');
  });

  it("returns standalone sign-in to its validated origin instead of Join or legacy Home", () => {
    const join = source("src/pages/Join.tsx");
    expect(join).toContain("navigate(resolveAuthReturnTo(resumed?.returnTo, takeAuthReturnTo(), nextPath), { replace: true })");
    expect(join).not.toContain("navigate(-1)");
    expect(source("src/lib/authIntent.ts")).toContain('DEFAULT_AUTH_RETURN_TO = "/social"');
  });

  it("keeps sensitive Social posts readable while concealing media on public and signed-in reads", () => {
    const projection = source("supabase/migrations/20260821173000_public_social_sensitive_media_parity.sql");
    const publicRead = source("src/lib/publicRead.ts");
    const hydration = source("src/components/social/noticeboard/feedData.ts");
    const carousel = source("src/components/social/PostMediaCarousel.tsx");

    // Native Social keeps the post readable and conceals only the media. The
    // public projection carries the same boolean into the shared carousel.
    expect(projection).toContain("coalesce(c.is_sensitive, false) as is_sensitive");
    expect(projection).not.toContain("coalesce(t.is_sensitive, false) = false");
    expect(publicRead).toContain("is_sensitive: boolean");
    expect(hydration).toContain("is_sensitive: true");
    expect(hydration).toContain("typeof hydration.is_sensitive === \"boolean\"");
    const noticeBoard = source("src/components/social/NoticeBoard.tsx");
    expect(noticeBoard).toContain("const concealedRows = nextRows.map((row) => ({ ...row, is_sensitive: true }))");
    expect(noticeBoard.indexOf("setNotices(concealedRows)")).toBeLessThan(noticeBoard.indexOf("const hydrated = await hydrateRows(nextRows)"));
    expect(carousel).toContain("SENSITIVE_BLUR_RADIUS_PX = 100");
    expect(carousel).toContain("backdrop-blur-[20px]");
    expect(carousel).toContain("Tap to view");
  });

  it("keeps public Social media browsing and sharing outside the auth wall", () => {
    const publicSocial = source("src/pages/public/PublicSocial.tsx");
    const card = source("src/components/social/ThreadCard.tsx");
    const carousel = source("src/components/social/PostMediaCarousel.tsx");

    expect(publicSocial).toContain("post.images.map");
    expect(publicSocial).toContain("onShare={() => void sharePost(post)}");
    expect(publicSocial).not.toContain('requireAuth("share"');
    expect(carousel).toContain('aria-label="Next image"');
    expect(carousel).toContain("onDoubleTap?.()");
  });

  it("matches the native verified avatar ring and compact check badge", () => {
    const avatar = source("src/components/layout/SettingsAvatar.tsx");
    expect(avatar).toContain('isVerified && "border-2 border-brandBlue"');
    expect(avatar).toContain("showVerifiedBadge && isVerified");
    expect(avatar).toContain('h-[14px] w-[14px]');
    expect(avatar).not.toContain("ring-offset");
    expect(avatar).not.toContain("Shield");
  });

  it("uses the native pillar tint without inventing a second gold", () => {
    const social = source("src/components/social/NoticeBoard.tsx");
    const tokens = source("src/index.css");
    expect(social).toContain("text-[var(--engagement-pillar)]");
    expect(tokens).toContain("--engagement-pillar:   #C8861A");
  });

  it("keeps the public feed projection on indexed per-thread counts", () => {
    const migration = source("supabase/migrations/20260811004500_public_social_projection_fast_path.sql");
    expect(migration).toContain("idx_thread_supports_thread_id");
    expect(migration).toContain("left join lateral");
    expect(migration).not.toContain("group by ts.thread_id");
    expect(migration).not.toContain("group by tc.thread_id");
  });

  it("keeps profile cards owner-safe and profile writes inside the narrowed client grant", () => {
    const social = source("src/components/social/noticeboard/NoticeBoardOverlays.tsx");
    const map = source("src/pages/Map.tsx");
    const dialogue = source("src/pages/ChatDialogue.tsx");
    const card = source("src/components/profile/ProfileShareCard.tsx");
    const loader = source("src/lib/profileShareCard.ts");
    const edit = source("src/pages/EditProfile.tsx");
    for (const consumer of [social, map, dialogue]) expect(consumer).toContain("ProfileShareCard");
    expect(card).toContain("<CardRestricted");
    expect(card).toContain("window.setInterval");
    expect(card).not.toContain("Tap the card to flip");
    expect(loader).toContain("isMinorDob");
    expect(edit).not.toContain(".upsert(");
    expect(edit).not.toContain("human_verification_status: \"passed\"");
    expect(edit).not.toContain("is_verified: true");
    expect(edit).not.toContain("verification_status: \"verified\"");
    expect(edit).not.toContain("last_lat:");
    expect(edit).not.toContain("last_lng:");
  });
});
