import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const sheet = read("../components/NativeCareInterestSheet.tsx");
const nav = read("../components/NativeBottomNav.tsx");
const chats = read("../screens/NativeChatsScreen.tsx");
const drawer = read("../components/NativeSettingsDrawer.tsx");
const root = read("../navigation/RootNavigator.tsx");
const migration = read("../../../supabase/migrations/20260803133000_care_market_defensive_location_and_frozen_snapshot.sql");

describe("Care market availability contract", () => {
  it("uses one shared market boolean on every Care discovery surface", () => {
    expect(nav).toContain('item.key !== "service" || careMarketIsActive');
    expect(chats).toContain('careMarketIsActive &&');
    expect(drawer).toContain('careMarketIsActive ?');
    expect(root).toContain('careMarketIsActive={careMarketIsActive}');
  });

  it("guards only explicit Care availability routes without trapping active Care chats", () => {
    expect(root).toContain("isCareAvailabilityRoute");
    expect(root).toContain("!careMarketIsActive");
    expect(root).toContain('pathname === "/service"');
    expect(root).not.toContain('pathname === "/service-chat"');
    expect(root).not.toContain("NativeServiceScreen.tsx");
  });

  it("builds interest UI only from shared modal primitives and tokens", () => {
    expect(sheet).toContain('from "./nativeModalPrimitives"');
    expect(sheet).toContain('from "./nativeModalPrimitives.styles"');
    expect(sheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(sheet).not.toMatch(/rgba?\s*\(/i);
  });

  it("locks the success copy and exposes the Account Settings editor only while Care is closed", () => {
    expect(sheet).toContain("You can update your preference in Account Settings");
    const profile = read("../screens/NativeProfileSummaryScreen.tsx");
    expect(profile).toContain("!careMarketIsActive ?");
    expect(profile).toContain('label="Care interest"');
    const signup = read("../screens/NativeSignupScreen.tsx");
    expect(signup).toContain("!careSnapshot || careSnapshot.is_active || careSnapshot.has_interest");
  });

  it("opens the automatic prompt once on the signed-in Home surface after Quick Profile commits", () => {
    const signup = read("../screens/NativeSignupScreen.tsx");
    const quickProfile = signup.slice(signup.indexOf("const continueQuickProfile"), signup.indexOf("const waitForSignupSession"));
    expect(quickProfile.indexOf("await uploadQuickProfileAvatar")).toBeLessThan(quickProfile.indexOf("await fetchNativeCareMarket"));
    expect(quickProfile.indexOf("await fetchNativeCareMarket")).toBeLessThan(quickProfile.indexOf("careInterestPending: true"));
    expect(quickProfile).toContain("if (!uploaded) return;");
    expect(quickProfile).toContain("if (!careSnapshot || careSnapshot.is_active || careSnapshot.has_interest)");
    expect(signup).toContain("Finish signup first. RootNavigator will show the optional Care prompt");
    expect(root).toContain("setPostSignupCarePending");
    expect(root).toContain("setPostSignupCareOpen(true)");
    expect(root).toContain("<NativeCareInterestSheet");
  });

  it("treats closing onboarding as no interest and both toggles off as removal", () => {
    expect(sheet).not.toContain("Skip for now");
    expect(sheet).not.toContain("Remove interest</AppModalButton>");
    expect(sheet).toContain("else await removeNativeCareInterest(accessToken)");
    expect(sheet).toContain("Tell us how you’d like to use Care in huddle.");
  });

  it("hides only the Care notification preference while its market is inactive", () => {
    const profile = read("../screens/NativeProfileSummaryScreen.tsx");
    expect(profile).toContain("...(careMarketIsActive ?");
    expect(root).toContain("careMarketIsActive={careMarketIsActive}");
  });

  it("refreshes market state before push or Hub navigation opens Care", () => {
    expect(root).toContain('responseData?.domain === "care_market"');
    expect(root).toContain("await refreshCareMarketRef.current?.()");
    expect(root).toContain("void refreshCareMarket().then(() => onNavigate(path))");
  });

  it("freezes interest on activation and keeps profile targeting live", () => {
    expect(migration).toContain("interest_frozen_at = now()");
    expect(migration).toContain("care_interest_market_active");
    expect(migration).toContain("city_verified_incomplete");
    expect(migration).toContain("_care_resolved_market_city");
  });
});
