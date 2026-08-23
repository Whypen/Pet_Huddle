import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const chats = () => readFileSync(resolve(dir, "./NativeChatsScreen.tsx"), "utf8");
const dialogue = () => readFileSync(resolve(dir, "./NativeChatDialogueScreen.tsx"), "utf8");

describe("native group detail actions", () => {
  it("shows a normal bell until the viewer has muted the group", () => {
    expect(chats()).toMatch(/name=\{currentMemberMuted \? "bell-off" : "bell"\}/);
    expect(dialogue()).toMatch(/icon: groupMuted \? "bell-off" : "bell"/);
    expect(chats()).toMatch(/const currentMemberMuted = muted \?\? \(management\?\.members/);
    expect(dialogue()).toMatch(/muted=\{groupMuted\}/);
  });

  it("dismisses group details before opening the report modal", () => {
    expect(chats()).toMatch(/transitionNativeModal\(\s*\(\) => setGroupDetails\(null\),\s*\(\) => \{\s*setGroupMemberReportChatId\(chatId\);\s*setGroupMemberReportTarget\(member\);/);
    expect(dialogue()).toMatch(/transitionNativeModal\(\s*\(\) => setGroupInfoOpen\(false\),\s*\(\) => reportSharedGroupMember\(member\),/);
    expect(chats()).toMatch(/accessToken=\{accessToken\}/);
    expect(chats()).toMatch(/chatRoomId=\{groupMemberReportChatId\}/);
  });

  it("renders a routed group header before the full message snapshot finishes", () => {
    expect(dialogue()).toMatch(/params\.joined && params\.room \? \{/);
    expect(dialogue()).toMatch(/const headerReady = Boolean\(room && roomId && room\.id === roomId\)/);
  });

  it("uses chat and save icons for every Group Details footer action", () => {
    const s = chats();
    expect(s).not.toMatch(/<Text style=\{styles\.modal(?:Primary|Secondary)Label\}>Open Group Chat<\/Text>/);
    expect(s).not.toMatch(/<Text style=\{styles\.modalPrimaryLabel\}>Save<\/Text>/);
    expect(s).toMatch(/name=\{action === "chat" \? "message-circle" : "save"\}/);
    expect(s).toMatch(/action === "chat" \? "Open Group Chat" : "Save"/);
  });

  it("uses icon-only actions in the tight two-button admin footer", () => {
    const s = chats();
    expect(s).toMatch(/accessibilityLabel="Open Group Chat"[\s\S]*GroupDetailsFooterButtonLabel action="chat" iconOnly variant="secondary"/);
    expect(s).toMatch(/accessibilityLabel="Save group details"[\s\S]*GroupDetailsFooterButtonLabel action="save" iconOnly/);
    expect(s).toMatch(/!iconOnly \? <Text/);
  });

  it("preserves the Community card member count when opening joined Group Info", () => {
    const s = chats();
    expect(s).toMatch(/memberCount: Math\.max\(1, Math\.floor\(input\.memberCount \?\? 1\)\)/);
    expect(s).toMatch(/const row = buildCreatedGroupInboxRow\(\{[\s\S]*memberCount: group\.memberCount,[\s\S]*name: group\.name,/);
  });
});
