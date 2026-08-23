import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createFreshNativeFunctionHeaders, deleteAsync, getFreshNativeAccessToken, getInfoAsync, manipulateAsync, readAsStringAsync, refreshNativeSessionOnce } = vi.hoisted(() => ({
  createFreshNativeFunctionHeaders: vi.fn(),
  deleteAsync: vi.fn(),
  getFreshNativeAccessToken: vi.fn(),
  getInfoAsync: vi.fn(),
  manipulateAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  refreshNativeSessionOnce: vi.fn(),
}));

vi.mock("expo-image-manipulator", () => ({
  manipulateAsync,
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
}));

vi.mock("expo-file-system/legacy", () => ({
  deleteAsync,
  EncodingType: { Base64: "base64" },
  getInfoAsync,
  readAsStringAsync,
}));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { refreshSession: vi.fn() },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
  supabaseUrl: "https://example.invalid",
}));
vi.mock("./nativeFunctionClient", () => ({
  createFreshNativeFunctionHeaders,
  getFreshNativeAccessToken,
  refreshNativeSessionOnce,
}));
vi.mock("./nativeStorageCleanup", () => ({
  createNativeProtectedActionError: vi.fn(() => new Error("protected_upload_failed")),
  requestNativeStorageCleanupResult: vi.fn(),
}));

import {
  NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES,
  isNativeProfilePhotoFinalSizeAllowed,
  normalizeNativeProfilePhotoAsset,
  uploadNativeProfilePhotoAsset,
  validateNativeProfilePhotoAsset,
} from "./nativeProfilePhotos";

const sourceAsset = {
  fileName: "pet.jpg",
  fileSize: 2_000_000,
  height: 2000,
  mimeType: "image/jpeg",
  uri: "file:///pet.jpg",
  width: 3000,
};

describe("native profile photo normalization limits", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    manipulateAsync.mockReset();
    getInfoAsync.mockReset();
    deleteAsync.mockReset();
    readAsStringAsync.mockReset();
    getFreshNativeAccessToken.mockReset();
    createFreshNativeFunctionHeaders.mockReset();
  });

  it("rejects missing raw file-size metadata instead of treating it as zero", () => {
    expect(validateNativeProfilePhotoAsset({ ...sourceAsset, fileSize: null })).toBe(
      "Couldn't verify that photo's size. Try another image.",
    );
  });

  it("accepts only a known positive final size at or below the client ceiling", () => {
    expect(isNativeProfilePhotoFinalSizeAllowed(null)).toBe(false);
    expect(isNativeProfilePhotoFinalSizeAllowed(0)).toBe(false);
    expect(isNativeProfilePhotoFinalSizeAllowed(NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES)).toBe(true);
    expect(isNativeProfilePhotoFinalSizeAllowed(NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES + 1)).toBe(false);
  });

  it("never returns an oversized candidate even after exhausting final quality", async () => {
    manipulateAsync.mockImplementation(async () => ({ uri: `file:///output-${manipulateAsync.mock.calls.length}.webp` }));
    getInfoAsync.mockResolvedValue({ exists: true, size: NATIVE_PROFILE_PHOTO_FINAL_MAX_BYTES + 1 });

    await expect(normalizeNativeProfilePhotoAsset(sourceAsset, {
      height: 1200,
      originX: 100,
      originY: 100,
      width: 1200,
    })).rejects.toThrow("Couldn't make that photo small enough to upload");
    expect(manipulateAsync).toHaveBeenCalledTimes(24);
    expect(deleteAsync).toHaveBeenCalledTimes(24);
  });

  it("does not return an output whose file size cannot be verified", async () => {
    manipulateAsync.mockResolvedValue({ uri: "file:///unknown-size.webp" });
    getInfoAsync.mockResolvedValue({ exists: true });

    await expect(normalizeNativeProfilePhotoAsset(sourceAsset, {
      height: 1000,
      originX: 0,
      originY: 0,
      width: 1000,
    })).rejects.toThrow("Couldn't make that photo small enough to upload");
    expect(deleteAsync).toHaveBeenCalledTimes(24);
  });

  it("returns the first verified candidate under the limit with truthful metadata", async () => {
    manipulateAsync.mockResolvedValue({ uri: "file:///bounded.webp" });
    getInfoAsync.mockResolvedValue({ exists: true, size: 900_000 });

    await expect(normalizeNativeProfilePhotoAsset(sourceAsset, {
      height: 1000,
      originX: 0,
      originY: 0,
      width: 1000,
    })).resolves.toEqual({
      fileName: "profile-photo.webp",
      fileSize: 900_000,
      mimeType: "image/webp",
      uri: "file:///bounded.webp",
    });
    expect(manipulateAsync).toHaveBeenCalledTimes(1);
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it("deletes a normalized temporary artifact when upload fails", async () => {
    getFreshNativeAccessToken.mockResolvedValue("token");
    createFreshNativeFunctionHeaders.mockResolvedValue({ Authorization: "Bearer token" });
    readAsStringAsync.mockResolvedValue("base64");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ error: "forbidden" }),
      ok: false,
      status: 403,
    }));

    await expect(uploadNativeProfilePhotoAsset("user", "cover", {
      fileName: "profile-photo.webp",
      fileSize: 900_000,
      mimeType: "image/webp",
      uri: "file:///normalized.webp",
    }, "token")).rejects.toBeTruthy();
    expect(deleteAsync).toHaveBeenCalledWith("file:///normalized.webp", { idempotent: true });
  });
});
