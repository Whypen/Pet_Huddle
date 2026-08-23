import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeVerifyIdentityScreen.tsx"), "utf8");

describe("NativeVerifyIdentityScreen coach mark", () => {
  it("shows the app-only intro on this user's first screen visit", () => {
    const text = source();
    expect(text).toContain("NativeVerifyIntroSheet");
    expect(text).toContain('isNativeCoachMarkSeen(userId, "verify_identity_intro")');
  });

  it("records seen before its first presentation, so a restart cannot replay it", () => {
    const text = source();
    const readIndex = text.indexOf('isNativeCoachMarkSeen(userId, "verify_identity_intro")');
    const introEffect = text.slice(
      text.lastIndexOf("  useEffect(() => {", readIndex),
      text.indexOf("  }, [userId]);", readIndex),
    );
    expect(introEffect).toContain('await markNativeCoachMarkSeen(userId, "verify_identity_intro")');
    expect(introEffect.indexOf('await markNativeCoachMarkSeen(userId, "verify_identity_intro")')).toBeLessThan(introEffect.indexOf("setShowVerifyIntro(true)"));
  });

  it("has one dismiss path and no legal navigation", () => {
    const text = source();
    expect(text).toContain("setShowVerifyIntro(false)");
    expect(text).not.toMatch(/NativeVerifyIntroSheet[\s\S]{0,500}onLearnMore/);
  });
});
