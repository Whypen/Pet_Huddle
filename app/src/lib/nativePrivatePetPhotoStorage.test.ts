import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.stubGlobal("__DEV__", false);

const { createSignedUrl, getPublicUrl } = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, ttl: number) => createSignedUrl(bucket, path, ttl),
        getPublicUrl: (path: string) => getPublicUrl(bucket, path),
      }),
    },
  },
}));

import {
  parseNativePetImageStorageRef,
  resetSignedStorageCache,
  resolveNativePetImageUrl,
  resolveNativePetImageUrlAsync,
} from "./nativeStorageUrlCache";

describe("private pet photo storage boundary", () => {
  beforeEach(() => {
    resetSignedStorageCache();
    createSignedUrl.mockReset();
    getPublicUrl.mockReset();
    getPublicUrl.mockImplementation((bucket: string, path: string) => ({ data: { publicUrl: `https://example.invalid/public/${bucket}/${path}` } }));
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.invalid/signed/private-photo" }, error: null });
  });

  it("keeps existing public pet URLs unchanged", async () => {
    const url = "https://project.invalid/storage/v1/object/public/pets/owner/pet/photo.jpg";
    expect(resolveNativePetImageUrl(url)).toBe(url);
    await expect(resolveNativePetImageUrlAsync(url)).resolves.toBe(url);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("never converts a private pet reference into a public URL", async () => {
    const ref = "private_pet_photos/owner/pet/photo.jpg";
    expect(resolveNativePetImageUrl(ref)).toBeNull();
    await expect(resolveNativePetImageUrlAsync(ref)).resolves.toBe("https://example.invalid/signed/private-photo");
    expect(createSignedUrl).toHaveBeenCalledWith("private_pet_photos", "owner/pet/photo.jpg", 3600);
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("parses private signed URLs back to their protected object", () => {
    expect(parseNativePetImageStorageRef("https://project.invalid/storage/v1/object/sign/private_pet_photos/owner/pet/photo.jpg?token=redacted")).toMatchObject({
      bucket: "private_pet_photos",
      kind: "storage",
      objectPath: "owner/pet/photo.jpg",
      sourceVisibility: "signed",
    });
  });

  it("keeps legacy Care card URLs compatible after private migration", () => {
    const root = fs.existsSync(path.join(process.cwd(), "app", "package.json")) ? path.join(process.cwd(), "app") : process.cwd();
    const image = fs.readFileSync(path.join(root, "src/components/NativePetImage.tsx"), "utf8");
    expect(image).toContain('publicRef.bucket !== "pets"');
    expect(image).toContain('resolveNativePetImageUrlAsync(`private_pet_photos/${publicRef.objectPath}`)');
  });
});
