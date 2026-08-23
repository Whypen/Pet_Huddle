import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(testDirectory, path), "utf8");
const moduleSource = () => read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
const widgetSource = () => read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
const appConfig = () => read("../../app.config.js");
const targetConfig = () => read("../../targets/HuddleLiveActivities/expo-target.config.js");
const appEntitlements = () => read("../../ios/huddle/huddle.entitlements");
const widgetEntitlements = () => read("../../targets/HuddleLiveActivities/generated.entitlements");

describe("iOS Live Activity credential storage contract", () => {
  it("shares one background-readable, device-only Keychain contract", () => {
    for (const source of [moduleSource(), widgetSource()]) {
      expect(source).toContain('"pet.huddle.active-sessions.action-auth"');
      expect(source).toContain('"AN4TY85CTU.pet.huddle.live-activity-auth"');
      expect(source).toContain("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly");
      expect(source).toContain("kSecAttrAccessGroup");
    }
  });

  it("keeps only non-secret endpoint configuration in app-group defaults", () => {
    expect(moduleSource()).toContain(
      'defaults.set(["supabaseURL": url, "anonKey": key], forKey: Self.actionAuthDefaultsKey)',
    );
    expect(widgetSource()).toContain(
      'defaults.set(["supabaseURL": supabaseURL, "anonKey": anonKey], forKey: authKey)',
    );
    expect(widgetSource()).not.toMatch(
      /UserDefaults[\s\S]{0,300}set\(\[[\s\S]{0,180}"accessToken"/,
    );
  });

  it("migrates plaintext only after a successful Keychain write", () => {
    for (const source of [moduleSource(), widgetSource()]) {
      const write = source.indexOf("if writeActionAuthTokens") >= 0
        ? source.indexOf("if writeActionAuthTokens")
        : source.indexOf("if writeAuthTokens");
      const removePlaintext = source.indexOf('defaults.set(["supabaseURL": supabaseURL, "anonKey": anonKey]', write);
      expect(write).toBeGreaterThan(-1);
      expect(removePlaintext).toBeGreaterThan(write);
    }
  });

  it("rotates refreshed widget credentials in Keychain", () => {
    const source = widgetSource();
    const refresh = source.slice(source.indexOf("private static func freshAuth"), source.indexOf("private static func serviceID"));
    expect(refresh).toContain("writeAuthTokens(accessToken: accessToken, refreshToken: refreshToken)");
    expect(refresh).toContain("current.refreshToken == auth.refreshToken");
    expect(refresh).not.toContain("UserDefaults");
  });

  it("exposes idempotent logout cleanup for Keychain and legacy defaults", () => {
    const source = moduleSource();
    expect(source).toContain('AsyncFunction("clearActionAuth")');
    expect(source).toContain("SecItemDelete(actionAuthKeychainQuery() as CFDictionary)");
    expect(source).toContain("removeObject(forKey: Self.actionAuthDefaultsKey)");
    expect(source).toContain("status == errSecSuccess || status == errSecItemNotFound");
  });

  it("declares the same shared Keychain group for generated and future builds", () => {
    const buildSources = [appConfig(), targetConfig(), appEntitlements(), widgetEntitlements()];
    for (const source of buildSources) {
      expect(source).toContain("pet.huddle.live-activity-auth");
      expect(source).toContain("keychain-access-groups");
    }
  });
});
