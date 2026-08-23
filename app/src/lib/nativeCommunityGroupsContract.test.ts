import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const chat = read("src/lib/nativeChat.ts");
const screen = read("src/screens/NativeChatsScreen.tsx");

describe("native Community group loading contract", () => {
  it("retries only transient protected read failures with the current session", () => {
    expect(chat).toContain("const nativeChatReadShouldRetry");
    for (const status of [0, 401, 502, 503, 504]) expect(chat).toContain(`error.status === ${status}`);
    expect(chat).toContain('error.code === "rpc_timeout"');
    expect(chat).toContain('error.code === "rpc_network_error"');
    expect(chat).toContain("return nativeChatRpc(fn, params, undefined)");
  });

  it("keeps public groups independent from optional context reads", () => {
    expect(chat).toContain("viewerContextPromise");
    expect(chat).toContain("profile: null");
    expect(chat).not.toContain("if (invitePreviewResult.error) throw invitePreviewResult.error");
    expect(chat).toContain("if (publicGroupsResult.error) throw publicGroupsResult.error");
  });

  it("does not hold Community rendering behind the joined-group inbox", () => {
    expect(screen).toContain("const joinedGroupRowsPromise = fetchNativeChatInbox");
    expect(screen).toContain("commitCommunityGroups(cachedJoinedGroupRows)");
    expect(screen).toContain("void joinedGroupRowsPromise.then(commitCommunityGroups)");
    expect(screen).not.toMatch(/Promise\.all\(\[\s*joinedGroupRowsPromise/);
    expect(screen).toContain("void joinedUpcomingEventsPromise.then");
    expect(screen).toContain('void nativeExactTokenRpc(\n              "get_service_provider_distances"');
  });

  it("refreshes viewer scope for Community just as it does for Discover", () => {
    expect(screen).toContain('if (topTab !== "discover" && topTab !== "community") return;');
    expect(screen).toContain("resolveNativeViewerScope({ userId, accessToken, sessionKey, force: true })");
  });
});
