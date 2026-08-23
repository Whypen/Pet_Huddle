import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const alertModal = () => readFileSync(resolve(dir, "../components/map/NativeAlertDetailModal.tsx"), "utf8");
const mapScreen = () => readFileSync(resolve(dir, "../screens/NativeMapScreen.tsx"), "utf8");
const shareCardModal = () => readFileSync(resolve(dir, "../components/share/NativeShareCardModal.tsx"), "utf8");
const socialScreen = () => readFileSync(resolve(dir, "../screens/NativeSocialScreen.tsx"), "utf8");

describe("optimistic support UI", () => {
  it("renders Map sharing as the content-fit page inside the existing alert sheet", () => {
    const source = alertModal();
    expect(source).toContain("{editing ? editSheet : (");
    expect(source).toContain("{shareOpen ? sharePage : (");
    expect(source).toContain('disableSwipeToClose={!shareOpen}');
    expect(source).toContain('onClose={shareOpen ? closeSharePage : onClose}');
    expect(source).toContain("<AppBottomSheetScroll edgeToEdge>");
    expect(source).not.toContain("styles.inlineSharePage");
    expect(source).not.toContain("const shareSheet =");
    // Every child confirm sheet must suppress the detail Modal -- two presented native
    // Modals is a handoff iOS rejects, which freezes the sheet. See
    // nativeAlertDetailSingleModalContract.test.ts for the invariant this belongs to.
    expect(source).toContain("visible={Boolean(alert) && !confirmRemove && !confirmFound && !confirmBlock && !reportOpen}");
    expect(source).not.toMatch(/<Modal[^>]+visible=\{shareOpen\}/);
  });

  it("clears the share page before entering alert edit mode", () => {
    const source = alertModal();
    expect(source).toMatch(/const openEditAlert = \(\) => \{[\s\S]*setShareOpen\(false\);[\s\S]*setEditing\(true\);/);
  });

  it("updates alert support before awaiting the backend and keeps the heart visible", () => {
    const source = alertModal();
    expect(source).toMatch(/setLiked\(nextLiked\);\s*setSupportCount\(\(current\) => Math\.max\(0, current \+ \(nextLiked \? 1 : -1\)\)\);[\s\S]*await (removeNativeAlertSupport|supportNativeAlert)/);
    expect(source).not.toMatch(/\{busy \? \(\s*<NativeSpinner tone="muted"/);
  });

  it("updates comment and reply support before starting the backend request", () => {
    const source = socialScreen();
    expect(source).toMatch(/const optimisticCount = Math\.max\(0, previousCount \+ \(nextSupported \? 1 : -1\)\)/);
    expect(source).toMatch(/setLikedCommentIds\([\s\S]*setCommentsByThread\([\s\S]*void setNativeSocialCommentSupport/);
    expect(source).toMatch(/applyCommentSupportState\(current\[thread\.id\] \|\| \[\], comment\.id, nextSupported, optimisticCount\)/);
  });

  it("opens Map people as a lightweight share card without profile actions", () => {
    const mapSource = mapScreen();
    expect(mapSource).toContain("setMapProfileCard(buildProfileShareCard({");
    expect(mapSource).toContain("showActions={false}");
    expect(mapSource).not.toContain("NativePublicProfileModal");
    expect(shareCardModal()).toContain("{showActions ? <View style={styles.actions}>");
  });
});
