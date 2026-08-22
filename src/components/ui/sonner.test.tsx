import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webToast = readFileSync(join(__dirname, "sonner.tsx"), "utf8");
const webCss = readFileSync(join(__dirname, "..", "..", "index.css"), "utf8");
const nativeToast = readFileSync(join(__dirname, "..", "..", "..", "app/src/components/NativeToast.tsx"), "utf8");

describe("web toast mirrors NativeToast", () => {
  it("keeps the native duration and geometry", () => {
    expect(nativeToast).toContain("NATIVE_TOAST_DURATION_MS = 4200");
    expect(webToast).toContain("duration={4200}");
    expect(webToast).toContain("!items-center");
    expect(webToast).toContain("!rounded-[26px]");
    expect(webToast).toContain("!py-[17px]");
    expect(webToast).toContain("!h-11 !w-11");
    expect(webToast).toContain("huddle-native-toast__disc");
  });

  it("keeps native light glass, tone washes, veil and progress rail", () => {
    expect(webToast).toContain('theme="light"');
    expect(webCss).toContain("rgba(20, 24, 38, 0.10)");
    expect(webCss).toContain("rgba(191, 255, 0, 0.42)");
    expect(webCss).toContain("rgba(33, 69, 207, 0.26)");
    expect(webCss).toContain("rgba(255, 117, 31, 0.30)");
    expect(webCss).toContain("rgba(239, 68, 68, 0.26)");
    expect(webCss).toContain("--huddle-toast-disc: #BFFF00");
    expect(webCss).toContain("animation: huddle-toast-progress 4200ms");
  });
});
