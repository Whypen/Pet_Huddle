import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isVerifiedPublicCredentialLabel, normalizePublicCredentialLabel } from "./nativeCredentialStatus";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260716211500_effective_professional_credential_status.sql"),
  "utf8",
);

describe("effective professional credential status", () => {
  it("normalizes legacy unable-to-verify responses to self-declared", () => {
    expect(normalizePublicCredentialLabel("Unable to verify online")).toBe("Self-declared");
  });

  it("only treats matched public labels as verified", () => {
    expect(isVerifiedPublicCredentialLabel("Certificate matched")).toBe(true);
    expect(isVerifiedPublicCredentialLabel("Self-declared")).toBe(false);
    expect(isVerifiedPublicCredentialLabel("Unable to verify online")).toBe(false);
  });

  it("derives expiry at read time and sends the agreed single-fire notification", () => {
    expect(migration).toContain("p_expiry_date < current_date");
    expect(migration).toContain("when p_status = 'unable_to_verify' then 'self_declared'");
    expect(migration).toContain("'Care Certificate expired'");
    expect(migration).toContain("Update it to restore your verified credential badge.");
    expect(migration).toContain("'notification_key', 'care-certificate-expired:'");
    expect(migration).toContain("'/carerprofile?mode=edit&section=professional&credential='");
  });
});
