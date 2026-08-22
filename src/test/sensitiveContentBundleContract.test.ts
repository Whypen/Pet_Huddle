import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("sensitive-content bundle contract", () => {
  it("loads the self-hosted MobileNet model without bundling NSFWJS model shards", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/sensitiveContent.ts"),
      "utf8",
    );

    expect(source).toContain('import("nsfwjs/core")');
    expect(source).toContain('core.load("/models/nsfw/mobilenet_v2/model.json")');
    expect(source).not.toContain('import("nsfwjs")');
    expect(source).not.toContain("nsfwjs/models/");
    expect(source).not.toContain("mobilenet_v2_mid");
    expect(source).not.toContain("inception_v3");
  });
});
