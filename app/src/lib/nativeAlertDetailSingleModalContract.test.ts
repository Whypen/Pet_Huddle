import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const detail = readFileSync(resolve(appRoot, "src/components/map/NativeAlertDetailModal.tsx"), "utf8");

/**
 * iOS rejects a present/dismiss handoff when two native <Modal>s are presented at
 * once -- the app freezes and the second sheet's buttons never receive the tap.
 * NativeAlertDetailModal therefore hides its own Modal whenever any child confirm
 * sheet is open. Adding a new confirm sheet without adding it to that expression
 * reintroduces the freeze, and it is invisible in review because the new sheet's
 * own JSX looks perfectly correct on its own.
 */
describe("native alert detail single-modal discipline", () => {
  const visibleExpression = (() => {
    const start = detail.indexOf("      visible={Boolean(alert)");
    expect(start).toBeGreaterThan(-1);
    return detail.slice(start, detail.indexOf("\n", start));
  })();

  it("hides the detail sheet for every confirm sheet that presents its own Modal", () => {
    for (const flag of ["confirmRemove", "confirmFound", "confirmBlock", "reportOpen"]) {
      expect(visibleExpression, `detail Modal stays presented while ${flag} is open`).toContain(`!${flag}`);
    }
  });

  it("keeps every open-state flag that gates a child sheet accounted for in that expression", () => {
    // Any `open={<flag>}` / `visible={<flag>}` handed to a child confirm sheet must
    // also suppress the parent Modal. This catches the next one automatically.
    const childSheetFlags = [...detail.matchAll(/\n\s+open=\{(confirm[A-Za-z]+)\}/g)].map((match) => match[1]);
    expect(childSheetFlags.length).toBeGreaterThan(0);
    for (const flag of new Set(childSheetFlags)) {
      expect(visibleExpression, `${flag} opens a child sheet but does not suppress the detail Modal`).toContain(`!${flag}`);
    }
  });
});
