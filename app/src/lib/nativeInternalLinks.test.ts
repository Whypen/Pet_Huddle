import { describe, expect, it, vi } from "vitest";
import { nativeHardwareBackTarget, nativePathForHuddleWebPath, nativePathForSharedContent, navigateNativeHuddleLink } from "./nativeInternalLinks";

describe("native internal links", () => {
  it("routes shared posts and map alerts inside the app", () => {
    expect(nativePathForSharedContent({ contentId: "post-1", contentType: "thread" })).toBe("/social?focus=post-1");
    expect(nativePathForSharedContent({ contentId: "alert-1", contentType: "alert" })).toBe("/map?alert=alert-1");
  });

  it("preserves explicit verified-alert access tokens", () => {
    expect(nativePathForSharedContent({
      appUrl: "https://huddle.pet/map?alert=alert-1&access=opaque-token",
      contentId: "alert-1",
      contentType: "alert",
    })).toBe("/map?alert=alert-1&access=opaque-token");
  });

  it("converts canonical public share links to native destinations", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/post-1")).toBe("/social?focus=post-1");
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/alert_alert-1")).toBe("/map?alert=alert-1");
    expect(nativePathForHuddleWebPath("https://huddle.pet/threads?focus=post-2")).toBe("/social?focus=post-2");
    expect(nativePathForHuddleWebPath("https://huddle.pet/social?profileUser=user-1")).toBe("/social?profileUser=user-1");
    expect(nativePathForHuddleWebPath("https://huddle.pet/carerprofile?user=user-2")).toBe("/carerprofile?user=user-2");
    expect(nativePathForHuddleWebPath("https://huddle.pet/join/ab12cd")).toBe("/chats?tab=groups&joinCode=AB12CD");
    expect(nativePathForHuddleWebPath("https://huddle.pet/add-friend?code=FRIEND1")).toBe("/add-friend?code=FRIEND1");
    expect(nativePathForHuddleWebPath("https://huddle.pet/verify?token=verify-token&email=person%40example.com"))
      .toBe("/verify?token=verify-token&email=person%40example.com");
  });

  it("defines predictable Android hardware-back destinations", () => {
    expect(nativeHardwareBackTarget("/", "/")).toBeNull();
    expect(nativeHardwareBackTarget("/social", "/social")).toBe("/");
    expect(nativeHardwareBackTarget("/chat-dialogue", "/chat-dialogue?with=user-1")).toBe("/chats?tab=friends");
    expect(nativeHardwareBackTarget("/chat-dialogue", "/chat-dialogue?room=group-1&returnTo=%2Fchats%3Ftab%3Dgroups")).toBe("/chats?tab=groups");
    expect(nativeHardwareBackTarget("/profile", "/profile")).toBe("history");
  });

  it("does not treat third-party links as native routes", () => {
    expect(nativePathForHuddleWebPath("https://example.com/share/post-1")).toBeNull();
  });

  it("rejects unknown Huddle paths instead of silently normalizing them to Home", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/unknown-release-path")).toBeNull();
    expect(nativePathForHuddleWebPath("/unknown-release-path")).toBeNull();
  });

  it("navigates Huddle links without opening a browser", () => {
    const navigate = vi.fn();
    expect(navigateNativeHuddleLink("https://huddle.pet/map?alert=alert-2", navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/map?alert=alert-2");
    expect(navigateNativeHuddleLink("https://example.com", navigate)).toBe(false);
  });
});

describe("verified-only alert share links", () => {
  /**
   * Verified-only alerts moved from the tag-less SPA route onto `/share/`, so
   * their links finally unfurl with a real (redacted) card. The single-use
   * access token now rides as a query param — if this hop drops it, the
   * recipient lands on an alert they cannot open, which is worse than the ugly
   * link this change set out to fix.
   */
  it("carries ?access through /share/alert_ into the Map route", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/alert_a-1?access=tok-123"))
      .toBe("/map?alert=a-1&access=tok-123");
  });

  it("percent-encodes a token that would otherwise break the query", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/alert_a-1?access=a%2Bb%26c"))
      .toBe("/map?alert=a-1&access=a%2Bb%26c");
  });

  it("leaves an ordinary alert link untouched", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/alert_a-1"))
      .toBe("/map?alert=a-1");
  });

  it("ignores an empty access param rather than emitting a dangling one", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/alert_a-1?access="))
      .toBe("/map?alert=a-1");
  });

  it("does not attach a token to a Social post link", () => {
    expect(nativePathForHuddleWebPath("https://huddle.pet/share/t-1?access=tok-123"))
      .toBe("/social?focus=t-1");
  });
});
