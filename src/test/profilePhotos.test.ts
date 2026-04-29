import { describe, expect, it, vi, beforeEach } from "vitest";

const storageFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => storageFrom(bucket),
    },
  },
}));

vi.mock("heic2any", () => ({ default: vi.fn() }));

import {
  getProfilePhotoUploadPath,
  resolveProfilePhotoDisplayUrl,
} from "@/lib/profilePhotos";

describe("profile photo storage paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storageFrom.mockImplementation((bucket: string) => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `public:${bucket}:${path}` } }),
      createSignedUrl: async (path: string) => ({
        data: bucket === "social_album" ? null : { signedUrl: `signed:${bucket}:${path}` },
      }),
    }));
  });

  it("writes new editorial profile photos under the lowercase public bucket prefix", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);

    expect(getProfilePhotoUploadPath("user-1", "cover")).toBe("profile_photos/user-1/cover-123.webp");
  });

  it("resolves new editorial photos through the public profile_photos bucket", async () => {
    await expect(resolveProfilePhotoDisplayUrl("profile_photos/user-1/cover-123.webp")).resolves.toBe(
      "public:profile_photos:profile_photos/user-1/cover-123.webp",
    );

    expect(storageFrom).toHaveBeenCalledWith("profile_photos");
  });

  it("keeps legacy capital Profiles paths readable with signed URLs", async () => {
    await expect(resolveProfilePhotoDisplayUrl("Profiles/user-1/cover-123.webp")).resolves.toBe(
      "signed:Profiles:Profiles/user-1/cover-123.webp",
    );

    expect(storageFrom).toHaveBeenCalledWith("Profiles");
  });

  it("falls back from legacy social album paths to avatar public URLs", async () => {
    await expect(resolveProfilePhotoDisplayUrl("user-1/avatar.webp")).resolves.toBe(
      "public:avatars:user-1/avatar.webp",
    );

    expect(storageFrom).toHaveBeenCalledWith("social_album");
    expect(storageFrom).toHaveBeenCalledWith("avatars");
  });
});
