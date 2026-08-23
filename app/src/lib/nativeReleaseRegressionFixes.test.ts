import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(srcRoot, path), "utf8");

describe("native release regression fixes", () => {
  it("preserves Care on ordinary tab returns and never blocks post-write navigation on cache cleanup", () => {
    const source = read("screens/NativeServiceScreen.tsx");
    expect(source).not.toContain("SERVICE_TAB_REVALIDATION_MS");
    const tabEntryStart = source.indexOf("const becameActive = active && !wasActiveRef.current;");
    const tabEntryEnd = source.indexOf("// Provider review averages", tabEntryStart);
    const tabEntry = source.slice(tabEntryStart, tabEntryEnd);
    expect(tabEntry).not.toMatch(/if \(!becameActive\) return;\s*void load\(/);
    expect(tabEntry).toMatch(/if \(realtimeDirtyRef\.current\)/);

    const createIndex = source.indexOf("const chatId = await createNativeServiceChat");
    const navigateIndex = source.indexOf("onNavigate(`/service-chat?room=", createIndex);
    const cleanupIndex = source.indexOf("void Promise.allSettled([", createIndex);
    expect(createIndex).toBeGreaterThan(-1);
    expect(navigateIndex).toBeGreaterThan(createIndex);
    expect(cleanupIndex).toBeGreaterThan(navigateIndex);

    const unavailableBranch = source.slice(source.indexOf('reason.includes("provider_not_requestable")'), source.indexOf('reason.includes("service_access_disabled")'));
    expect(unavailableBranch).toContain("setProviders((current) => current.filter");
    expect(unavailableBranch).toContain("invalidateNativeServiceProviderCaches");
  });

  it("rejects inaccessible Care room routes instead of rendering an empty booking shell", () => {
    const source = read("screens/NativeServiceChatScreen.tsx");
    expect(source).toMatch(/if \(serviceRows\.length === 0\) \{[\s\S]{0,500}setRouteUnavailable\(true\)[\s\S]{0,500}return;/);
    expect(source).toContain("This Care conversation is unavailable.");
    expect(source).toContain("Back to Care chats");
  });

  it("keeps Home carousel parent updates outside child state updater callbacks", () => {
    const source = read("screens/NativeHomeScreen.tsx");
    const hookStart = source.indexOf("function useHomeCarouselAutoAdvance");
    const hookEnd = source.indexOf("function HomeCarouselFadeSlide", hookStart);
    const hook = source.slice(hookStart, hookEnd);
    expect(hook).toContain("indexRef.current = next;");
    expect(hook).toContain("setIndex(next);");
    expect(hook).toContain("onIndexChange?.(next);");
    expect(hook).not.toContain("setIndex((current)");

    const carouselStart = source.indexOf("function HomePetBannerCarousel");
    const carouselEnd = source.indexOf("function HomeAuroraBlob", carouselStart);
    expect(source.slice(carouselStart, carouselEnd)).not.toContain("setIndex((current)");
  });
});
