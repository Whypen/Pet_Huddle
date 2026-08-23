import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNativeMediaKind,
  assertNativeMediaSize,
  NATIVE_CHAT_MEDIA_MAX_BYTES,
  NATIVE_SOCIAL_VIDEO_MAX_BYTES,
  validateNativeSocialVideoSelection,
} from "./nativeMediaPolicy";

const appRoot = resolve(__dirname, "../..");
const readSource = (path: string) => readFileSync(resolve(appRoot, path), "utf8");

describe("native media policy", () => {
  it("accepts files exactly at the limit and rejects one byte over", () => {
    expect(() => assertNativeMediaSize(NATIVE_CHAT_MEDIA_MAX_BYTES, NATIVE_CHAT_MEDIA_MAX_BYTES, "too large")).not.toThrow();
    expect(() => assertNativeMediaSize(NATIVE_CHAT_MEDIA_MAX_BYTES + 1, NATIVE_CHAT_MEDIA_MAX_BYTES, "too large")).toThrow("too large");
  });

  it("allows unknown picker size so the verified filesystem size can decide later", () => {
    expect(() => assertNativeMediaSize(null, NATIVE_CHAT_MEDIA_MAX_BYTES, "too large")).not.toThrow();
  });

  it("rejects the wrong media kind with user-facing guidance", () => {
    expect(() => assertNativeMediaKind("image/jpeg", ["image"])).not.toThrow();
    expect(() => assertNativeMediaKind("video/mp4", ["video"])).not.toThrow();
    expect(() => assertNativeMediaKind("application/pdf", ["image", "video"])).toThrow("Choose a photo or video file.");
  });

  it("accepts video duration independently and enforces the 50 MB client contract", () => {
    expect(() => validateNativeSocialVideoSelection({
      durationSeconds: 15.5,
      mimeType: "video/mp4",
      size: NATIVE_SOCIAL_VIDEO_MAX_BYTES,
    })).not.toThrow();
    expect(() => validateNativeSocialVideoSelection({ durationSeconds: 16, mimeType: "video/mp4", size: 1 })).not.toThrow();
    expect(() => validateNativeSocialVideoSelection({ durationSeconds: 120, mimeType: "video/mp4", size: 1 })).not.toThrow();
    expect(() => validateNativeSocialVideoSelection({ durationSeconds: 15, mimeType: "video/mp4", size: NATIVE_SOCIAL_VIDEO_MAX_BYTES + 1 })).toThrow("Choose a 15 seconds or shorter video.");
    expect(() => validateNativeSocialVideoSelection({ durationSeconds: 15, mimeType: "image/jpeg", size: 1 })).toThrow("Choose a video file.");
  });

  it("checks verified filesystem size before allocating a full base64 body", () => {
    const source = readSource("src/lib/nativeLocalMediaUpload.ts");
    const sizeCheck = source.indexOf("assertNativeMediaSize(");
    const base64Read = source.indexOf("FileSystem.readAsStringAsync");
    expect(sizeCheck).toBeGreaterThan(-1);
    expect(base64Read).toBeGreaterThan(sizeCheck);
  });

  it("wires the limits into native chat and Bunny social upload paths", () => {
    const chat = readSource("src/screens/NativeChatDialogueScreen.tsx");
    const social = readSource("src/lib/nativeSocial.ts");
    expect(chat).toContain("maxBytes: NATIVE_CHAT_MEDIA_MAX_BYTES");
    expect(chat).toContain("This video is over 25 MB. Choose a shorter or lower-quality video.");
    expect(social).toContain("validateNativeSocialVideoSelection(media)");
    expect(social).toContain("maxBytes: NATIVE_SOCIAL_VIDEO_MAX_BYTES");
    expect(social).toContain("fileSize: Number(file.size || blob.size || 0)");
    expect(social).not.toContain("fileSize: Number(media.size || file.size");
  });
});
