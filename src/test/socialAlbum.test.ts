import { beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrl = vi.fn();
const getPublicUrl = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, ttl: number) => createSignedUrl(bucket, path, ttl),
        getPublicUrl: (path: string) => getPublicUrl(bucket, path),
      }),
    },
  },
}));

vi.mock("heic2any", () => ({ default: vi.fn() }));

import { resolveSocialAlbumUrlMap } from "@/lib/socialAlbum";

describe("social album URL resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSignedUrl.mockResolvedValue({ data: null });
    getPublicUrl.mockImplementation((bucket: string, path: string) => ({
      data: { publicUrl: `public:${bucket}:${path}` },
    }));
  });

  it("routes editorial profile_photos paths to the profile photo resolver instead of social_album signing", async () => {
    const path = "profile_photos/735e8908-6dc8-4b41-837e-d4917e93caae/closer-1777493789017.webp";

    await expect(resolveSocialAlbumUrlMap([path])).resolves.toEqual({
      [path]: `public:profile_photos:${path}`,
    });

    expect(createSignedUrl).not.toHaveBeenCalledWith("social_album", path, expect.any(Number));
  });

  it("normalizes public profile_photos URLs without duplicating the bucket prefix", async () => {
    const path = "profile_photos/735e8908-6dc8-4b41-837e-d4917e93caae/closer-1777493789017.webp";
    const publicUrl = `https://ztrbourwcnhrpmzwlrcn.supabase.co/storage/v1/object/public/profile_photos/${path}`;

    await expect(resolveSocialAlbumUrlMap([publicUrl])).resolves.toEqual({
      [publicUrl]: `public:profile_photos:${path}`,
    });

    expect(getPublicUrl).toHaveBeenCalledWith("profile_photos", path);
    expect(getPublicUrl).not.toHaveBeenCalledWith("profile_photos", `profile_photos/${path}`);
    expect(createSignedUrl).not.toHaveBeenCalledWith("social_album", expect.stringContaining(path), expect.any(Number));
  });
});
