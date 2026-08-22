/**
 * Icon parity guard.
 *
 * Web copies its icon path data from the native sources by hand — there is no
 * generator in this repo (app/scripts/ holds only Expo patches). This test is
 * what makes that copy safe: it reads the native files at test time and asserts
 * every shared icon still matches byte-for-byte.
 *
 * If this fails, someone changed an icon on one platform only. Fix the source,
 * don't relax the test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GLYPHS, NAV_ICONS, NATIVE_ICONS_INTENTIONALLY_OMITTED } from "./huddleIconPaths";

const NATIVE_NAV = resolve(__dirname, "../../../app/src/components/NativeNavIcons.tsx");
const NATIVE_GLYPH = resolve(__dirname, "../../../app/src/components/NativeGlyphIcons.tsx");

/**
 * Pulls `name: { ... d: "...", viewBox: "..." }` entries out of a native source
 * file. Deliberately text-parsed rather than imported: the native modules pull
 * in react-native-svg, which will not resolve in this test environment.
 */
function parseNativeIcons(source: string): Record<string, { d: string; viewBox: string }> {
  const out: Record<string, { d: string; viewBox: string }> = {};
  for (const match of source.matchAll(/(\w+):\s*\{([^}]*?)\}/g)) {
    const [, name, body] = match;
    const d = /\bd:\s*"([^"]+)"/.exec(body)?.[1];
    const viewBox = /\bviewBox:\s*"([^"]+)"/.exec(body)?.[1];
    if (d && viewBox) out[name] = { d, viewBox };
  }
  return out;
}

describe("icon parity with native", () => {
  const nativeNav = parseNativeIcons(readFileSync(NATIVE_NAV, "utf8"));
  const nativeGlyphs = parseNativeIcons(readFileSync(NATIVE_GLYPH, "utf8"));

  it("parses the native sources at all", () => {
    // Guards against the parser silently matching nothing after a refactor,
    // which would make every assertion below vacuously pass.
    expect(Object.keys(nativeNav).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(nativeGlyphs).length).toBeGreaterThanOrEqual(7);
  });

  it.each(Object.keys(NAV_ICONS))("nav icon %s matches native", (name) => {
    const native = nativeNav[name];
    expect(native, `"${name}" is missing from NativeNavIcons.tsx`).toBeDefined();
    expect(NAV_ICONS[name as keyof typeof NAV_ICONS].d).toBe(native.d);
    expect(NAV_ICONS[name as keyof typeof NAV_ICONS].viewBox).toBe(native.viewBox);
  });

  it.each(Object.keys(GLYPHS))("glyph %s matches native", (name) => {
    const native = nativeGlyphs[name];
    expect(native, `"${name}" is missing from NativeGlyphIcons.tsx`).toBeDefined();
    expect(GLYPHS[name as keyof typeof GLYPHS].d).toBe(native.d);
    expect(GLYPHS[name as keyof typeof GLYPHS].viewBox).toBe(native.viewBox);
  });

  // Web carries only the icons it renders, so exact key equality with native is
  // wrong — it would force web to ship Care and Discover icons for surfaces the
  // product has removed. Instead: anything native has that web lacks must be
  // explicitly declared as omitted. A brand new native icon is in neither list
  // and fails here.
  it.each([
    ["nav", () => nativeNav],
    ["glyph", () => nativeGlyphs],
  ])("every native %s icon is either mirrored or explicitly omitted", (_kind, getNative) => {
    const web = new Set([...Object.keys(NAV_ICONS), ...Object.keys(GLYPHS)]);
    const unaccounted = Object.keys(getNative()).filter(
      (name) => !web.has(name) && !(name in NATIVE_ICONS_INTENTIONALLY_OMITTED),
    );
    expect(
      unaccounted,
      `native icon(s) ${unaccounted.join(", ")} are neither mirrored on web nor listed in ` +
        `NATIVE_ICONS_INTENTIONALLY_OMITTED. Add the icon to web, or record why web skips it.`,
    ).toEqual([]);
  });

  it("does not carry icons native no longer has", () => {
    const native = new Set([...Object.keys(nativeNav), ...Object.keys(nativeGlyphs)]);
    const orphaned = [...Object.keys(NAV_ICONS), ...Object.keys(GLYPHS)].filter((n) => !native.has(n));
    expect(orphaned, `web has icon(s) native dropped: ${orphaned.join(", ")}`).toEqual([]);
  });

  it("does not list an omission that web actually renders", () => {
    const web = new Set([...Object.keys(NAV_ICONS), ...Object.keys(GLYPHS)]);
    const contradictory = Object.keys(NATIVE_ICONS_INTENTIONALLY_OMITTED).filter((n) => web.has(n));
    expect(contradictory, `declared omitted but present: ${contradictory.join(", ")}`).toEqual([]);
  });
});
