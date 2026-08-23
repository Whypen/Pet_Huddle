import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFileSync(resolve(dir, path), "utf8");

describe("native app hygiene contracts", () => {
  it("gives chat controls stable automation IDs and human-readable accessibility labels", () => {
    const chats = source("../screens/NativeChatsScreen.tsx");
    const dialogue = source("../screens/NativeChatDialogueScreen.tsx");
    const serviceChat = source("../screens/NativeServiceChatScreen.tsx");

    expect(chats).toContain('accessibilityLabel={`Open ${name} group chat`}');
    expect(chats).toContain('testID={`native-chat-group-row-${row.chatId}`}');
    expect(chats).toContain('accessibilityLabel={accessibilityLabel} testID={automationId}');
    expect(chats).toContain('`Open ${name} care conversation`');
    expect(chats).toContain('`Open chat with ${name}`');
    expect(chats).not.toContain('accessibilityLabel={`${automationId}:${name}`}');
    expect(dialogue).toContain('accessibilityLabel={isGroup ? "Group details" : "More conversation options"}');
    expect(dialogue).toContain('accessibilityLabel={editingMessageId ? "Edit message" : "Message"} testID="native-chat-composer-input"');
    expect(dialogue).toContain('accessibilityLabel={editingMessageId ? "Save message" : "Send message"} testID="native-chat-send-button"');
    expect(serviceChat).toContain('accessibilityLabel="More conversation options"');
    expect(serviceChat).toContain('testID="service-chat-more-button"');
    expect(serviceChat).toContain('accessibilityLabel="Message"');
    expect(serviceChat).toContain('testID="native-service-chat-composer-input"');
    expect(serviceChat).toContain('accessibilityLabel="Send message"');
    expect(serviceChat).toContain('testID="native-service-chat-send-button"');
  });

  it("debounces signup draft persistence instead of writing on every keystroke", () => {
    const signup = source("../screens/NativeSignupScreen.tsx");

    expect(signup).toMatch(/const timer = setTimeout\(\(\) => \{\s*void saveNativeSignupDraft/);
    expect(signup).toContain("}, 300);");
    expect(signup).toContain("return () => clearTimeout(timer);");
  });

  it("keeps production network diagnostics and payload-bearing logs disabled", () => {
    const supabase = source("./supabase.ts");
    const activeSessions = source("./nativeActiveSessions.ts");
    const hydration = source("./nativeActiveSessionHydration.ts");
    const cleanup = source("./nativeStorageCleanup.ts");

    expect(supabase).toContain("fetch: isDev ? supabaseFetchLogger : fetch");
    expect(activeSessions).toMatch(/const activeSessionLog[\s\S]*?if \(!__DEV__\) return;[\s\S]*?console\.log/);
    expect(hydration).toMatch(/const hydrationLog[\s\S]*?if \(!__DEV__\) return;[\s\S]*?console\.log/);
    expect(cleanup).toMatch(/logNativeProtectedActionFailure[\s\S]*?if \(!__DEV__\) return;[\s\S]*?console\.warn/);
  });

  it("uses private scoped invalidations for chat realtime without changing filtered service listeners", () => {
    const chats = source("../screens/NativeChatsScreen.tsx");
    const root = source("../navigation/RootNavigator.tsx");
    const dialogue = source("../screens/NativeChatDialogueScreen.tsx");
    const serviceChat = source("../screens/NativeServiceChatScreen.tsx");
    const manager = source("./realtimeChannelManager.ts");

    expect(manager).toMatch(/\.channel\(topic, \{ config: \{ private: true \} \}\)/);
    expect(chats).toContain("`user:${userId}:inbox`");
    expect(manager).toContain('.on("broadcast", { event: "changed" }');
    expect(manager).toContain('sharedBroadcastChannels.get(topic)');
    expect(root).toContain("`user:${userId}:inbox`");
    expect(dialogue).toContain("`room:${subscriptionRoomId}`");
    expect(dialogue).toContain("scheduleSilentRoomValidation");
    expect(chats).not.toMatch(/table: "(?:chat_messages|chat_room_members|group_join_requests)"/);
    expect(root).not.toMatch(/table: "(?:chat_messages|chat_room_members|group_join_requests)"/);
    expect(chats).toContain('table: "service_chats", filter: `requester_id=eq.${userId}`');
    expect(chats).toContain('table: "service_chats", filter: `provider_id=eq.${userId}`');
    expect(serviceChat).toContain('`room:${subscriptionRoomId}`');
    expect(serviceChat).toContain('scheduleRealtimeCareRefresh(subscriptionRoomId, subscriptionSessionKey, "room_changed")');
    expect(serviceChat).not.toMatch(/table: "chat_messages"/);
    expect(chats).toContain("}, 450);");
  });

  it("uses scoped event invalidations for Home and dialogue", () => {
    const home = source("../screens/NativeHomeScreen.tsx");
    const dialogue = source("../screens/NativeChatDialogueScreen.tsx");
    expect(home).toContain("`user:${userId}:home`");
    expect(home).toContain('`user:${userId}:home`');
    expect(home).not.toMatch(/table: "(?:chat_events|chat_event_rsvps)"/);
    expect(dialogue).not.toMatch(/table: "(?:chat_events|chat_event_rsvps)"/);
    expect(dialogue).toContain("void refreshGroupEvents(subscriptionRoomId)");
  });

  it("uses bounded private map-cell invalidations", () => {
    const map = source("../screens/NativeMapScreen.tsx");
    expect(map).toContain("mapRealtimeTopicsForCenters");
    expect(map).toContain("createSinglePrivateBroadcastChannel");
    expect(map).not.toMatch(/table: "(?:map_alerts|broadcast_alerts)"/);
    expect(map).not.toContain('table: "profiles"');
    expect(map).toContain("realtimeRefreshRunningRef");
    expect(map).toContain("realtimeRefreshDirtyRef");
  });
});
