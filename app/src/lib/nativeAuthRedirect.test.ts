import { describe, expect, it } from "vitest";
import { isTrustedNativeAuthCallbackUrl } from "./nativeAuthRedirectTrust";

const isTrusted = (value: string) => isTrustedNativeAuthCallbackUrl(new URL(value));

describe("native auth redirect trust boundary", () => {
  it("accepts only Huddle auth callback URLs", () => {
    expect(isTrusted("https://huddle.pet/auth/callback?code=valid-format-code")).toBe(true);
    expect(isTrusted("https://www.huddle.pet/auth/callback#access_token=token")).toBe(true);
    expect(isTrusted("huddle:///auth/callback?token_hash=hash&type=recovery")).toBe(true);
    expect(isTrusted("huddle://auth/callback?code=valid-format-code")).toBe(true);
  });

  it("rejects auth material on untrusted origins and non-callback routes", () => {
    expect(isTrusted("https://attacker.example/auth/callback#access_token=token")).toBe(false);
    expect(isTrusted("https://huddle.pet/map?access_token=token&refresh_token=refresh")).toBe(false);
    expect(isTrusted("huddle:///map?access_token=token&refresh_token=refresh")).toBe(false);
    expect(isTrusted("otherapp:///auth/callback?code=valid-format-code")).toBe(false);
  });
});
