import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeVerifyIntroSheet.tsx"), "utf8");

describe("NativeVerifyIntroSheet", () => {
  it("has one dismiss action and nothing else — no secondary link, no navigation prop", () => {
    const text = source();
    expect(text).not.toContain("onLearnMore");
    expect(text).not.toContain("onNavigate");
  });

  it("builds on the shared sheet primitives rather than a bespoke sheet", () => {
    const text = source();
    expect(text).toContain('import { AppBottomSheet } from "../nativeModalPrimitives";');
    expect(text).toContain('import { nativeModalStyles } from "../nativeModalPrimitives.styles";');
    expect(text).toMatch(/<AppBottomSheet\b/);
    expect(text).toContain("style={nativeModalStyles.appConfirmBody}");
    expect(text).not.toContain("borderTopLeftRadius");
  });

  it("mounts through the exact same backdrop/safe-area tokens as NativeAppReviewSheet, not a bespoke wrapper", () => {
    const text = source();
    expect(text).toContain("style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}");
    expect(text).not.toContain("useSharedValue");
    expect(text).not.toContain("useAnimatedStyle");
    expect(text).not.toContain('animationType="none"');
  });

  it("dismisses from a tap anywhere and renders no CTA button", () => {
    const text = source();
    expect(text).toContain("onPress={onDismiss}");
    expect(text).toContain("Tap anywhere to continue");
    expect(text).not.toContain("AppModalButton");
    expect(text).not.toMatch(/>Continue</);
  });

  it("drops the grabber, which advertised a drag the sheet does not support", () => {
    const text = source();
    expect(text).toContain("disableSwipeToClose");
    expect(text).not.toContain("grabber");
  });

  it("shows the shield icon inline to the left of the headline, not stacked above it", () => {
    const text = source();
    expect(text).toContain('<Feather color={huddleColors.blue} name="shield" size={22} />');
    expect(text).toMatch(/<View style={styles\.headlineRow}>\s*<Feather[^]*?<Text style={styles\.headline}>/);
  });

  it("uses a bold headline weight, matching the spotlight coach marks", () => {
    const text = source();
    expect(text).toMatch(/headline:\s*{[^}]*fontFamily:\s*"Urbanist-700"/);
  });

  it("shares the spotlight's editorial dimension tokens so both onboarding surfaces read as one system", () => {
    const text = source();
    expect(text).toContain("huddleCoachMark.ruleWidth");
    expect(text).toContain("huddleCoachMark.kickerLetterSpacing");
    expect(text).toContain("huddleType.h1");
  });

  it("lets the Android back button dismiss, now that no CTA does it", () => {
    expect(source()).toContain("onRequestClose={onDismiss}");
  });
});
