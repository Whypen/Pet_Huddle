import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "../components/map/NativeBroadcastModal.tsx"), "utf8");

describe("native broadcast Social toggle", () => {
  it("uses concise Post on copy without supporting subtext", () => {
    const modal = source();
    expect(modal).toMatch(/>Post on<\/Text>/);
    expect(modal).toContain('NativeNavIcon color={huddleColors.text} size={19} tab="social"');
    expect(modal).not.toMatch(/Enable people to contact you about sightings\./);
  });

  it("opens the automatic upsell once, then reveals the persistent upgrade banner", () => {
    const modal = source();
    expect(modal).toMatch(/const upsellShownThisOpenRef = useRef\(false\)/);
    expect(modal).toMatch(/if \(upsellShownThisOpenRef\.current\) \{\s*setShowUpsell\(true\);\s*return;/);
    expect(modal).toMatch(/upsellShownThisOpenRef\.current = true/);
    expect(modal).toMatch(/if \(!visible\) return;[\s\S]*upsellShownThisOpenRef\.current = false/);
    expect(modal).not.toMatch(/upsellShownThisOpenRef\.current = true;\s*setShowUpsell\(true\)/);
    expect(modal).not.toMatch(/setTimeout\(\(\) => setUpsellLocked/);
    expect(modal).toMatch(/showUpsell \? \([\s\S]*onOpenPremium\?\.\(target === "super" \? "addons" : target\)/);
  });
});
