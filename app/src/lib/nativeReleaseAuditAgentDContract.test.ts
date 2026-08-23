import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(currentDir, path), "utf8");
const securityScreen = read("../screens/NativeSecuritySettingsScreen.tsx");
const dialogueScreen = read("../screens/NativeChatDialogueScreen.tsx");
const chatsScreen = read("../screens/NativeChatsScreen.tsx");
const storageMigration = read("../../../supabase/migrations/20260801223000_storage_upload_constraints.sql");

describe("release audit Agent D contracts", () => {
  it("uses the friends inbox target for dialogue exits (N6)", () => {
    expect(dialogueScreen).not.toContain('/chats?tab=chats');
    expect(dialogueScreen.match(/\/chats\?tab=friends/g)).toHaveLength(1);
    expect(dialogueScreen).toContain('accessibilityLabel="Retry conversation"');
    expect(chatsScreen).toContain('if (tab === "friends" || tab === "groups" || tab === "service") return "chats";');
  });

  it("checks compromised passwords in the client without weakening server enforcement (S8 UX)", () => {
    expect(securityScreen).toContain("await nativePasswordSecurityError(newPassword)");
    expect(securityScreen).toContain("turnstile_token: turnstileProof");
  });

  it("consumes the Turnstile challenge before each current-password attempt (S9)", () => {
    const attemptStart = securityScreen.indexOf("// A solved challenge gets one current-password attempt");
    const resetBeforePasswordCheck = securityScreen.indexOf('setTurnstileToken("");', attemptStart);
    const passwordCheck = securityScreen.indexOf("supabase.auth.signInWithPassword(credentials)");
    expect(resetBeforePasswordCheck).toBeGreaterThan(0);
    expect(resetBeforePasswordCheck).toBeLessThan(passwordCheck);
  });

  it("clears the Turnstile challenge when local security checks reject the change", () => {
    const securityReject = securityScreen.indexOf("if (securityError)");
    const securityRejectReset = securityScreen.indexOf('setTurnstileToken("");', securityReject);
    const missingIdentity = securityScreen.indexOf("if (!email && !phone)");
    const missingIdentityReset = securityScreen.indexOf('setTurnstileToken("");', missingIdentity);

    expect(securityReject).toBeGreaterThan(0);
    expect(securityRejectReset).toBeGreaterThan(securityReject);
    expect(missingIdentity).toBeGreaterThan(0);
    expect(missingIdentityReset).toBeGreaterThan(missingIdentity);
  });

  it("caps and image-restricts upload buckets at the storage boundary (S10)", () => {
    expect(storageMigration).toContain("file_size_limit = 15728640");
    for (const bucket of ["alerts", "avatars", "pets", "notices", "identity_verification", "identity_verification_evidence"]) {
      expect(storageMigration).toContain(`'${bucket}'`);
    }
    expect(storageMigration).toContain("'application/pdf'");
  });
});
