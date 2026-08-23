import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(currentDir, "..");
const kernelPath = resolve(currentDir, "nativeFunctionClient.ts");
const supabasePath = resolve(currentDir, "supabase.ts");

const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
  if (/\.test\.[jt]sx?$/.test(entry.name)) return [];
  return [path];
});

const productionSources = () => sourceFiles(srcRoot).map((path) => ({
  path,
  relativePath: relative(srcRoot, path),
  source: readFileSync(path, "utf8"),
}));

describe("native auth kernel static enforcement", () => {
  it("keeps every session lifecycle operation inside the single auth kernel", () => {
    const forbidden = /supabase\.auth\.(?:getSession|refreshSession|setSession|signOut|onAuthStateChange)\s*\(/g;
    const violations = productionSources()
      .filter(({ path }) => path !== kernelPath)
      .flatMap(({ relativePath, source }) => [...source.matchAll(forbidden)].map((match) => `${relativePath}:${match[0]}`));

    expect(violations).toEqual([]);
  });

  it("keeps Bearer header construction inside the single auth kernel", () => {
    const forbidden = /Authorization\s*:\s*[`'"]Bearer\s/g;
    const violations = productionSources()
      .filter(({ path }) => path !== kernelPath)
      .flatMap(({ relativePath, source }) => [...source.matchAll(forbidden)].map((match) => `${relativePath}:${match[0]}`));

    expect(violations).toEqual([]);
  });

  it("does not trust caller-provided tokens as the current protected identity", () => {
    const source = readFileSync(kernelPath, "utf8");
    const tokenResolver = source.slice(
      source.indexOf("export async function getFreshNativeAccessToken"),
      source.indexOf("export const setNativeAuthRefreshForeground"),
    );

    expect(tokenResolver).toContain("const fresh = await getFreshNativeSession(undefined, expectedUserId)");
    expect(tokenResolver).not.toContain("return _preferredAccessToken");
    expect(source).toContain("currentNativeSession.access_token !== token");
  });

  it("uses one supported lock and one app-foreground refresh owner", () => {
    const supabaseSource = readFileSync(supabasePath, "utf8");
    const rootSource = readFileSync(resolve(srcRoot, "navigation/RootNavigator.tsx"), "utf8");

    expect(supabaseSource).toContain('import { createClient, processLock } from "@supabase/supabase-js"');
    expect(supabaseSource).toContain("lock: processLock");
    expect(rootSource).toContain('setNativeAuthRefreshForeground(AppState.currentState === "active")');
    expect(rootSource).toContain('setNativeAuthRefreshForeground(state === "active")');
  });

  it("keeps verification on the central session and refresh path without its own token fallback", () => {
    const source = readFileSync(resolve(currentDir, "nativeVerifyIdentity.ts"), "utf8");

    expect(source).toContain("const fresh = await getFreshNativeSession()");
    expect(source).toContain("refreshNativeSessionOnce(");
    expect(source).not.toContain("nativeVerifyIdentitySessionFallback");
    expect(source).not.toMatch(/supabase\.auth\.(?:getSession|refreshSession)\s*\(/);
  // Whole-source regex sweep: needs a real budget, not the 5s default.
  }, 30_000);
});
