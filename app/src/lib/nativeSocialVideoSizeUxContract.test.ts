import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(resolve(appRoot, "src/screens/NativeSocialScreen.tsx"), "utf8");
const pickerStart = source.indexOf("const pickMedia = useCallback(async () => {");
const pickerEnd = source.indexOf("const submit = useCallback", pickerStart);
const pickerSource = source.slice(pickerStart, pickerEnd);

describe("native social video size UX", () => {
  it("rejects oversized videos with the approved guidance", () => {
    expect(pickerSource).toContain("item.size > NATIVE_SOCIAL_VIDEO_MAX_BYTES");
    expect(pickerSource).toContain("Choose a 15 seconds or shorter video.");
  });

  it("does not reject a video based on duration", () => {
    expect(pickerStart).toBeGreaterThan(-1);
    expect(pickerEnd).toBeGreaterThan(pickerStart);
    expect(pickerSource).not.toContain("skippedVideoTooLong");
    expect(pickerSource).not.toMatch(/durationSeconds[\s\S]*?>\s*15\.5/);
  });
});
