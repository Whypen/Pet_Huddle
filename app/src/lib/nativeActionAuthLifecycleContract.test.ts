import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const activeSessions = readFileSync(resolve(appRoot, "src/lib/nativeActiveSessions.ts"), "utf8");
const rootNavigator = readFileSync(resolve(appRoot, "src/navigation/RootNavigator.tsx"), "utf8");

describe("native action credential lifecycle", () => {
  it("exposes the native credential clear operation", () => {
    expect(activeSessions).toContain("clearActionAuth?():");
    expect(activeSessions).toContain('callNative("action_auth_clear"');
    expect(activeSessions).toContain("return native.clearActionAuth()");
    expect(activeSessions).toContain("serializeActionAuthMutation");
  });

  it("ends private session surfaces before clearing credentials on sign-out or deletion", () => {
    const nullSessionBranch = rootNavigator.slice(
      rootNavigator.indexOf('if (eventName === "SIGNED_OUT" || eventName === "USER_DELETED")'),
      rootNavigator.indexOf("return;", rootNavigator.indexOf('if (eventName === "SIGNED_OUT" || eventName === "USER_DELETED")')),
    );
    expect(nullSessionBranch).toContain("await clearAllNativeActiveSessionActivities()");
    expect(nullSessionBranch).toContain("await clearNativeActiveSessionActionAuth()");
    expect(nullSessionBranch.indexOf("clearAllNativeActiveSessionActivities")).toBeLessThan(
      nullSessionBranch.indexOf("clearNativeActiveSessionActionAuth"),
    );
    expect(nullSessionBranch).toContain("clearSessionState(");
  });
});
