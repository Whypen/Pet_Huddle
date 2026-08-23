import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(__dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(appRoot, relativePath), "utf8");

describe("window-level native toast contract", () => {
  it("renders the only visual NativeToast host beside the global header", () => {
    const root = read("src/navigation/RootNavigator.tsx");
    expect(root).toContain("subscribeNativeWindowToast");
    expect(root).toContain("windowLevel");
    expect(root.indexOf("<NativeGlobalHeader")).toBeLessThan(root.indexOf("windowLevel"));
    expect(root).toContain("<FullWindowOverlay>");
    expect(root).toContain("zIndex: 10000");
  });

  it("makes screen-level NativeToast instances publish instead of paint", () => {
    const toast = read("src/components/NativeToast.tsx");
    expect(toast).toContain("if (!props.windowLevel) return <NativeToastRelay");
    expect(toast).toContain("showNativeWindowToast");
    expect(toast).toContain("hideNativeWindowToast(id)");
  });

  it("keeps the shared rail above the global header stacking level", () => {
    const toast = read("src/components/NativeToast.tsx");
    const header = read("src/theme/huddleDesignTokens.ts");
    expect(toast).toContain("zIndex: 60");
    expect(header).toContain("headerZIndex: 20");
  });

  it("allows only one top rail at a time", () => {
    const root = read("src/navigation/RootNavigator.tsx");
    expect(root).toContain("if (payload) setWindowToast(null)");
    expect(root).toContain("if (payload) setBanner(null)");
  });
});
