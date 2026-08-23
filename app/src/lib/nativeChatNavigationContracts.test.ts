import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(dir, path), "utf8");

describe("native chat navigation contracts", () => {
  it("anchors the unread badge to the fixed-size Chats icon", () => {
    const source = read("../components/NativeBottomNav.tsx");
    expect(source).toContain("<View style={styles.iconAnchor}>");
    expect(source).toMatch(/iconAnchor:\s*\{[\s\S]*width: 24,[\s\S]*height: 24/);
  });

  it("keeps active matches in the rail even without a conversation room", () => {
    const source = read("../screens/NativeChatsScreen.tsx");
    expect(source).toContain("matchedRailSummaries.forEach");
    expect(source).toContain("matchedSummaryToInboxRow(match)");
    expect(source).toContain("row.peerUserId || row.chatId");
  });

  it("removes an unmatched peer immediately from only the actor's local Chats state", () => {
    const chat = read("./nativeChat.ts");
    const dialogue = read("../screens/NativeChatDialogueScreen.tsx");
    const chats = read("../screens/NativeChatsScreen.tsx");
    expect(chat).toContain("publishNativeChatUnmatchCommitted");
    expect(chat).toContain("event.actorUserId");
    expect(dialogue).toMatch(/publishNativeChatUnmatchCommitted\([\s\S]{0,180}onNavigate\("\/chats\?tab=friends"\)/);
    expect(chats).toContain("subscribeNativeChatUnmatchCommitted");
    expect(chats).toContain("event.actorUserId !== userId");
    expect(chats).toContain("setMatchedRailSummaries((current) => current.filter");
    expect(chats).toContain("setRows(nextRows)");
    expect(chat).toContain("const isVisibleNativeInboxRow = (row: NativeChatInboxRow) => isRenderableNativeInboxRow(row) && !row.unmatchedByMe");
    expect(chat).toMatch(/mapInboxRow\)\)\)\.filter\(isVisibleNativeInboxRow\)/);
    expect(chat).toContain("cached.rows.filter(isVisibleNativeInboxRow)");
    expect(chat).toContain("persistent.filter(isVisibleNativeInboxRow)");
  });

  it("restores only the caller when an archived direct conversation is reopened", () => {
    const migration = read("../../../supabase/migrations/20260722170000_reopen_archived_direct_chat_membership.sql");
    expect(migration).toContain("set deleted_at = null, archived_at = null, left_at = null");
    expect(migration).toContain("where chat_id = v_chat_id and user_id = v_actor_id");
  });

  it("canonicalizes every peer-addressed direct-chat route", () => {
    const source = read("../screens/NativeChatDialogueScreen.tsx");
    expect(source).toContain("if (currentParams.withUserId) {");
    expect(source).not.toContain("if (!targetRoomId && currentParams.withUserId) {");
  });

  it("adds the sender peer to direct-message notification routes without changing group routes", () => {
    const source = read("./nativeNotifications.ts");
    expect(source).toContain('["new_message", "direct_message", "match", "star"].includes(normalizedType)');
    expect(source).toContain("meta.sender_id");
    expect(source).toContain("meta.matched_user_id");
  });

  it("treats friend requests as Friends-list inbox items and never direct-message routes", () => {
    const notifications = read("./nativeNotifications.ts");
    const chats = read("../screens/NativeChatsScreen.tsx");
    const root = read("../navigation/RootNavigator.tsx");
    const nav = read("../components/NativeBottomNav.tsx");
    const friendsSheet = read("../components/friends/NativeHuddleFriendsSheet.tsx");
    expect(notifications).toContain('normalizedType === "friend_request" ? "/chats?tab=friends"');
    expect(chats).not.toContain("pendingFriendRequestCount");
    expect(chats).not.toMatch(/onAccepted=\{\(result\) => \{ if \(result\.roomId\) onNavigate/);
    expect(friendsSheet).not.toContain("onOpenChatRoom(result.roomId");
    expect(chats).toContain("setNewlyAcceptedPeerId(result.targetUserId)");
    expect(chats).toContain("setMatchedRailRefreshKey((value) => value + 1)");
    expect(notifications).toContain('type: "eq.friend_request"');
    expect(notifications).toContain('or: "(type.neq.friend_request,type.is.null)"');
    expect(root).toContain("markNativeFriendRequestNotificationsReadWithToken");
    expect(root).toContain('if ((params.get("tab") || "friends") !== "friends") return;');
    expect(nav).toContain("chatUnreadCount > 0 || friendRequestUnread");
    expect(chats).toContain('accessibilityLabel="Unread chats"');
    expect(chats).not.toContain("toggleUnreadText");
  });

  it("paints a canonical empty conversation before secondary enrichment and offers bounded recovery", () => {
    const source = read("../screens/NativeChatDialogueScreen.tsx");
    expect(source).toContain("useNativeLoadingDeadline(loading");
    expect(source).toMatch(/const safetyPromise = isNativeRestrictionActive[\s\S]*await loadRoomRef\.current/);
    expect(source).toMatch(/setHasOlder\(rows\.length > INITIAL_MESSAGE_LOAD_SIZE\);[\s\S]*setLoading\(false\);[\s\S]*hydrateMessages/);
    expect(source).toContain('accessibilityLabel="Retry conversation"');
    expect(source).not.toContain('if (!sameLoadedRoom) onNavigateRef.current("/chats?tab=friends")');
  });

  it("keeps chat search clear controls inside their fields", () => {
    const source = read("../screens/NativeChatsScreen.tsx");
    expect(source).toMatch(/searchClear:\s*\{ width: 28, height: 28, flexShrink: 0/);
    expect(source).not.toMatch(/searchClear:\s*\{ position: "absolute"/);
  });

  it("uses a previewable universal link for add-me sharing", () => {
    const chat = read("./nativeChat.ts");
    const friendsSheet = read("../components/friends/NativeHuddleFriendsSheet.tsx");
    const appConfig = read("../../app.json");
    const association = read("../../../public/.well-known/apple-app-site-association");
    const preview = read("../../../api/add-friend.ts");
    const androidManifest = read("../../android/app/src/main/AndroidManifest.xml");
    expect(chat).toContain("https://huddle.pet/add-friend?code=");
    expect(friendsSheet).toContain('title: "Add me on huddle"');
    expect(appConfig).toContain('"pathPrefix": "/add-friend"');
    expect(association).toContain('{ "/": "/add-friend*" }');
    // Group invites are a real link type (nativePathForHuddleWebPath handles
    // /join/CODE), so every platform registry must claim them too.
    expect(association).toContain('{ "/": "/join*" }');
    expect(appConfig).toContain('"pathPrefix": "/join"');
    expect(androidManifest).toContain('android:pathPrefix="/join"');
    expect(preview).toContain('property="og:image"');
    expect(preview).toContain("/api/open-app");
  });

  it("opens the existing join-group sheet with a validated invite code", () => {
    const source = read("../screens/NativeChatsScreen.tsx");
    expect(source).toContain('params.get("joinCode")');
    expect(source).toContain("/^[A-Z0-9]{6}$/.test(code)");
    expect(source).toContain("setGroupCodeDraft(joinCode)");
    expect(source).toContain("setJoinCodeOpen(true)");
  });
});
