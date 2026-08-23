import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("native Huddle rewards UX contract", () => {
  it("keeps the ordinary reward sheet content-sized", () => {
    const drawer = read("app/src/components/NativeSettingsDrawer.tsx");
    const rewardsBody = drawer.slice(drawer.indexOf("rewardsBody: {"), drawer.indexOf("rewardsTitle: {"));
    expect(rewardsBody).not.toContain("height:");
    expect(rewardsBody).not.toContain("minHeight:");
  });

  it("measures both celebration layers and reshapes with the flood", () => {
    const celebration = read("app/src/components/NativeHuddleRewardCelebration.tsx");
    expect(celebration).toContain('useState<"before" | "after">("before")');
    expect(celebration).toContain("setBeforeHeight(event.nativeEvent.layout.height)");
    expect(celebration).toContain("setAfterHeight(event.nativeEvent.layout.height)");
    expect(celebration).toContain("cardHeight.value = withTiming(target");
    expect(celebration).toContain("setAnchor(y + height / 2)");
    expect(celebration).toContain("adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2}");
    expect(celebration).toContain("memberCount > 10 ? 3 : 2");
  });

  it("refreshes staged milestone state when celebration closes", () => {
    const drawer = read("app/src/components/NativeSettingsDrawer.tsx");
    expect(drawer).toContain("refreshNativeHuddleRewardProgress(userId, { accessToken, force: true, sessionKey })");
    expect(drawer).toContain('"month" : "months"} of`');
    expect(drawer).toContain("<Text style={[styles.huddleRewardsAccent");
    expect(drawer).toContain("huddle＊</Text> · free");
  });

  it("loads stage-scoped celebration contributors", () => {
    const client = read("app/src/lib/nativeHuddleRewards.ts");
    const migration = read("supabase/migrations/20260731053000_huddle_promo_stage_contributors.sql");
    expect(client).toContain('"refresh_huddle_promo_progress_v9"');
    expect(migration).toContain("v_stage_target - v_stage_start");
    expect(migration).toContain("limit least(v_stage_total, 15)");
    expect(migration).toContain("'contributor_total', v_stage_total");
  });

  it("shows editable eligibility terms and keeps add-friend failures inline", () => {
    const client = read("app/src/lib/nativeHuddleRewards.ts");
    const drawer = read("app/src/components/NativeSettingsDrawer.tsx");
    expect(client).toContain("eligibility_terms?: string");
    expect(drawer).toContain("progress.eligibility_terms");
    const friendsSheet = read("app/src/components/friends/NativeHuddleFriendsSheet.tsx");
    expect(friendsSheet).toContain('setNotice("You\'re already connected.")');
    expect(friendsSheet).toContain("{error ? <Text style={styles.error}>{error}</Text> : null}");
  });

  it("does not require optional RNShare while the app boots", () => {
    const shareCard = read("app/src/components/share/NativeShareCardModal.tsx");
    expect(shareCard).not.toContain('import RNShare from "react-native-share"');
    expect(shareCard).toContain("if (NativeModules.RNShare)");
    expect(shareCard).toContain('await import("react-native-share")');
    expect(shareCard).toContain("await Share.share({ message, url: front })");
  });
});
