import { describe, expect, it } from "vitest";
import { selectSharePreviewImage } from "../../api/share";

describe("share preview image selection", () => {
  it("uses the first usable Social post image for the canonical share-card preview", () => {
    expect(selectSharePreviewImage(["", "  ", "https://images.example/post.jpg", "https://images.example/later.jpg"]))
      .toBe("https://images.example/post.jpg");
  });

  it("does not turn invalid media into an Open Graph image URL", () => {
    expect(selectSharePreviewImage(null)).toBeNull();
    expect(selectSharePreviewImage([null, 42, " "])).toBeNull();
  });
});
