import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./nativeCoachMarks.ts"), "utf8");

describe("nativeCoachMarks", () => {
  it("uses separate versioned, per-user keys for the four approved surfaces", () => {
    const text = source();
    expect(text).toContain("`huddle-coachmark-seen:v1:${userId}:${key}`");
    for (const key of ["map_broadcast_intro", "discover_star_wave_swipe", "verify_identity_intro", "huddle_code_intro"]) {
      expect(text).toContain(`"${key}"`);
    }
    expect(text).not.toContain("community_tab_intro");
  });

  it("never displays a coach mark without a signed-in user", () => {
    expect(source()).toMatch(/if \(!id\) return true;/);
  });

  it("honours the persisted seen flag for every surface", () => {
    const text = source();
    expect(text).not.toContain("FORCE_REPLAY_FOR_DESIGN_REVIEW");
    expect(text).toContain("const raw = await readNativeDisplayCacheItem(coachMarkFlagKey(id, key));");
    expect(text).toContain('return raw === "1";');
  });

  it("reads and writes through AsyncStorage without making storage failures fatal", () => {
    const text = source();
    expect(text).toMatch(/readNativeDisplayCacheItem\(.*\)/);
    expect(text).toMatch(/AsyncStorage\.setItem\(.*\)\.catch\(\(\) => undefined\)/);
  });
});
