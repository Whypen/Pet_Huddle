import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeBroadcastModal.tsx"), "utf8");

describe("NativeBroadcastModal remaining broadcast notice", () => {
  it("hides the internal active-broadcast counter", () => {
    expect(source()).not.toMatch(/Active Broadcast \(/);
  });

  it("shows a contextual notice only when exactly one broadcast remains", () => {
    const modal = source();
    expect(modal).toMatch(/activeBroadcastLimit - activeBroadcastUsed === 1/);
    expect(modal).toMatch(/You have 1 broadcast remaining\./);
    expect(modal).toMatch(/Verify your identity or upgrade your membership\./);
    expect(modal).toMatch(/Upgrade your membership\./);
    expect(modal).toMatch(/isGoldMember/);
    expect(modal).toMatch(/Contact Support/);
  });

  it("uses the concise Post on Social opt-in", () => {
    const modal = source();
    expect(modal).toMatch(/Post on/);
    expect(modal).toContain('NativeNavIcon color={huddleColors.text} size={19} tab="social"');
    expect(modal).not.toMatch(/Enable people to contact you about sightings\./);
    expect(modal).toMatch(/backgroundColor: huddleColors\.glassChrome/);
  });
});
