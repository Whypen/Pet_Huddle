import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeMapScreen.tsx"), "utf8");

describe("NativeMapScreen alert framing", () => {
  it("centers an open alert in the unobscured map area using the measured sheet height", () => {
    const screen = source();
    expect(screen).toMatch(/const \[alertSheetHeight, setAlertSheetHeight\] = useState\(0\)/);
    expect(screen).toMatch(/paddingBottom: alertSheetHeight/);
    expect(screen).toMatch(/onSheetHeightChange=\{\(nextHeight\) =>/);
    expect(screen).not.toMatch(/paddingBottom: 136/);
  });
});
