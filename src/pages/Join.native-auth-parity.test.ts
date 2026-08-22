import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const joinSource = readFileSync(join(__dirname, "Join.tsx"), "utf8");
const legalModalSource = readFileSync(join(__dirname, "..", "components", "modals", "LegalModal.tsx"), "utf8");
const callbackSource = readFileSync(join(__dirname, "AuthCallback.tsx"), "utf8");

describe("Join native Auth parity", () => {
  it("uses the native subtle Help action", () => {
    expect(joinSource).toContain('text-[rgba(66,73,101,0.45)]');
    expect(joinSource).toContain('>\n        Help\n');
  });

  it("offers the complete native legal footer and keeps every document modal-owned", () => {
    expect(joinSource.match(/Cookies Policy/g)?.length).toBeGreaterThanOrEqual(3);
    expect(joinSource.match(/setLegalOpen\("cookies"\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(joinSource).toContain("By continuing, you agree to our");
    expect(joinSource).toContain("Learn how we process your data in");
    expect(legalModalSource).toContain('Extract<LegalType, "privacy" | "terms" | "cookies">');
  });

  it("waits for hydrated auth state before restoring the exact originating surface", () => {
    expect(joinSource).toContain("pendingLoginReturn === undefined || !user?.id || hydrating");
    expect(joinSource).toContain("void refreshProfile().finally");
    expect(callbackSource).toContain("!pendingDestination || !hydratedUser?.id || hydrating");
    expect(callbackSource).toContain("setPendingDestination(destination)");
  });

  it("shows location recovery only after the explicit current-location action", () => {
    expect(joinSource).toContain('aria-label="Use current location"');
    expect(joinSource).toContain('error.code === error.PERMISSION_DENIED');
    expect(joinSource).toContain('Location is blocked for this site. Allow it in your browser, or search your area.');
    expect(joinSource).not.toContain("Couldn't find your area automatically — type it instead.");
  });
});
