import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("native Discover match presentation", () => {
  it("retries a transient protected card-read failure before showing the error state", () => {
    const source = read("app/src/lib/nativeChat.ts");
    expect(source).toContain('await nativeChatReadRpc("get_discovery_cards", {');
  });

  it("has one direct-action modal owner and no passive modal probe", () => {
    const source = read("app/src/screens/NativeChatsScreen.tsx");
    expect(source).not.toContain("openFirstUnseenMatchModal");
    expect(source).not.toContain("matchProbeRef");
    expect(source).toContain("presentedMatchIdsRef");
    expect(source).toContain('topTabRef.current === "discover"');
    expect(source.match(/setMatchModal\(\{ userId: profile\.id/g)).toHaveLength(1);
  });

  it("does not replay the entrance when modal details hydrate", () => {
    const source = read("app/src/screens/NativeChatsScreen.tsx");
    expect(source).toContain("[modalUserId, avatarScale");
    expect(source).not.toContain("roomId: null");
    expect(source).not.toContain("setMatchModal((current)");
  });

  it("uses one Wave motion and one Star timeline", () => {
    const source = read("app/src/screens/NativeChatsScreen.tsx");
    expect(source).not.toContain('launchNativeDiscoverySendCue("wave")');
    expect(source).not.toContain("NATIVE_WAVE_CUE_MS");
    expect(source).toContain("ringOpacity.value = withSequence(");
    expect(source).not.toContain("Promise.race([");
    expect(source).not.toContain("new AbortController()");
  });

  it("makes Star retries idempotent by action id", () => {
    const client = read("app/src/lib/nativePublicProfile.ts");
    const receiptSql = read("supabase/migrations/20260725110000_native_discovery_action_receipts.sql");
    const starSql = read("supabase/migrations/20260725110200_native_discovery_star_atomic.sql");
    expect(client).toContain('"send_native_discovery_star_atomic"');
    expect(client).toContain("p_action_id: actionId");
    expect(receiptSql).toContain("primary key (actor_id, action_id)");
    expect(starSql).toContain("public.send_star_chat_atomic(p_target_user_id, p_target_name, p_content)");
  });
});
