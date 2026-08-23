import { describe, expect, it } from "vitest";
import { buildNativeShareSheetPayload } from "./nativeShareSheetPayload";

/**
 * The rules that decide what a shared huddle link looks like in the receiving
 * app — and which apps are offered in the first place.
 *
 * The OS share sheet's app roster is decided by the TYPE of the activity items
 * it is handed, which is why the file attachment matters. That roster itself is
 * OS behaviour and cannot be asserted here; what IS asserted is that a file is
 * offered whenever one exists, and that the link is never duplicated.
 */

const BASE = { text: "Lost cat in Kowloon City", url: "https://huddle.pet/share/alert_a-1" };

describe("share sheet payload", () => {
  it("does not repeat the link iOS already appends", () => {
    const p = buildNativeShareSheetPayload(BASE, { fileUri: null, platform: "ios" });
    expect(p.message).toBe("Lost cat in Kowloon City");
    expect(p.message).not.toContain("https://");
    // The sheet still receives the link — as its own item, rendered once.
    expect(p.url).toBe(BASE.url);
  });

  it("carries the link in the body on Android, which appends nothing", () => {
    const p = buildNativeShareSheetPayload(BASE, { fileUri: null, platform: "android" });
    expect(p.message).toBe("Lost cat in Kowloon City\nhttps://huddle.pet/share/alert_a-1");
  });

  it("still shows the link exactly once when it is in the body", () => {
    const p = buildNativeShareSheetPayload(BASE, { fileUri: null, platform: "android" });
    expect(p.message.match(/https:\/\//g)).toHaveLength(1);
  });

  it("moves the link into the body once a file is attached, because nothing appends it then", () => {
    const p = buildNativeShareSheetPayload(BASE, { fileUri: "file:///tmp/a.jpg", platform: "ios" });
    expect(p.message).toBe("Lost cat in Kowloon City\nhttps://huddle.pet/share/alert_a-1");
    expect(p.message.match(/https:\/\//g)).toHaveLength(1);
    expect(p.fileUri).toBe("file:///tmp/a.jpg");
  });

  it("never drops the link on either platform, with or without a file", () => {
    for (const platform of ["ios", "android"] as const) {
      for (const fileUri of [null, "file:///tmp/a.jpg"]) {
        const p = buildNativeShareSheetPayload(BASE, { fileUri, platform });
        const reachable = p.message.includes(BASE.url) || p.url === BASE.url;
        expect(reachable).toBe(true);
      }
    }
  });

  it("falls back to a brand title rather than an empty one", () => {
    expect(buildNativeShareSheetPayload({ ...BASE, title: "   " }, { fileUri: null, platform: "ios" }).title).toBe("huddle");
    expect(buildNativeShareSheetPayload({ ...BASE, title: "Lost cat" }, { fileUri: null, platform: "ios" }).title).toBe("Lost cat");
  });

  it("survives an empty sentence without leading whitespace", () => {
    const p = buildNativeShareSheetPayload({ ...BASE, text: "" }, { fileUri: null, platform: "android" });
    expect(p.message).toBe("https://huddle.pet/share/alert_a-1");
  });
});
