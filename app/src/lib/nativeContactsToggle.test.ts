import { describe, expect, it } from "vitest";
import { nativeContactsTogglePreferenceKey, resolveNativeContactsToggleIntent } from "./nativeContactsTogglePolicy";

describe("contacts toggle intent", () => {
  it("turns off without touching the OS, because the app cannot revoke a grant", () => {
    expect(resolveNativeContactsToggleIntent(true, { canAskAgain: true, state: "granted" })).toBe("disable");
    expect(resolveNativeContactsToggleIntent(true, { canAskAgain: false, state: "granted" })).toBe("disable");
  });

  it("prompts the OS the first time and after a recoverable denial", () => {
    expect(resolveNativeContactsToggleIntent(false, { canAskAgain: true, state: "unknown" })).toBe("request");
    expect(resolveNativeContactsToggleIntent(false, { canAskAgain: true, state: "denied" })).toBe("request");
  });

  it("opens settings once the OS will no longer show its own prompt", () => {
    expect(resolveNativeContactsToggleIntent(false, { canAskAgain: false, state: "denied" })).toBe("open-settings");
  });

  it("re-enables without a prompt when the grant already exists", () => {
    expect(resolveNativeContactsToggleIntent(false, { canAskAgain: false, state: "granted" })).toBe("enable");
  });

  it("scopes the stored preference per account", () => {
    expect(nativeContactsTogglePreferenceKey("user-1")).not.toBe(nativeContactsTogglePreferenceKey("user-2"));
    expect(nativeContactsTogglePreferenceKey(null)).toContain("anon");
  });
});
