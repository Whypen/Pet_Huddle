import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(resolve(appRoot, "src/lib/nativeMapAlertInteractions.ts"), "utf8");

describe("native map alert interaction auth contract", () => {
  it("awaits the auth gate before reading support caches or starting RPC work", () => {
    const supportedStart = source.indexOf("export async function loadNativeAlertSupported");
    const countStart = source.indexOf("export async function countNativeAlertSupports");
    const supportedSource = source.slice(supportedStart, countStart);
    const countSource = source.slice(countStart, source.indexOf("export async function supportNativeAlert", countStart));

    expect(supportedSource).toContain("await requireAccessToken(options.accessToken);");
    expect(countSource).toContain("await requireAccessToken(options.accessToken);");
    expect(supportedSource.indexOf("await requireAccessToken")).toBeLessThan(supportedSource.indexOf("supportedCache.has"));
    expect(countSource.indexOf("await requireAccessToken")).toBeLessThan(countSource.indexOf("supportCountCache.has"));
  });

  it("has no bare promise-producing auth gate calls", () => {
    expect(source).not.toMatch(/\n\s*requireAccessToken\(options\.accessToken\);/);
  });
});
