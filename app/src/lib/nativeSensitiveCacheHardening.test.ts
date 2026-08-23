import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const supabaseSource = readFileSync(resolve(appRoot, "src/lib/supabase.ts"), "utf8");
const identitySource = readFileSync(resolve(appRoot, "src/lib/nativeVerifyIdentity.ts"), "utf8");

describe("native sensitive cache hardening", () => {
  it("uses an in-process fallback instead of failing a completed login or writing auth sessions to AsyncStorage", () => {
    const setItemBody = supabaseSource.slice(
      supabaseSource.indexOf("setItem: async (key: string, value: string)"),
      supabaseSource.indexOf("removeItem: async (key: string)"),
    );
    expect(setItemBody).not.toContain("AsyncStorage.setItem(key, value)");
    expect(setItemBody).toContain("ephemeralSecureValues.set(key, value)");
    expect(setItemBody).toContain("AsyncStorage.removeItem(key)");
    expect(setItemBody).not.toContain("throw error");
  });

  it("removes a stale plaintext auth copy after a secure write", () => {
    const setItemBody = supabaseSource.slice(
      supabaseSource.indexOf("setItem: async (key: string, value: string)"),
      supabaseSource.indexOf("removeItem: async (key: string)"),
    );
    const cleanupIndex = setItemBody.indexOf("AsyncStorage.removeItem(key)");

    expect(cleanupIndex).toBeGreaterThan(0);
    expect(setItemBody).toContain("removeChunkedSecureValue(key)");
    expect(setItemBody).toContain("chunkManifestKey(key)");
  });

  it("retains read compatibility for plaintext fallback and secure chunks", () => {
    const getItemBody = supabaseSource.slice(
      supabaseSource.indexOf("getItem: async (key: string)"),
      supabaseSource.indexOf("setItem: async (key: string, value: string)"),
    );

    expect(getItemBody).toContain("readChunkManifest(key)");
    expect(getItemBody).toContain("chunks.join(\"\")");
    expect(getItemBody).toContain("AsyncStorage.getItem(key)");
  });

  it("keeps identity profile status memory-only for thirty seconds", () => {
    const cacheSection = identitySource.slice(
      identitySource.indexOf("const profileStatusSessionKey"),
      identitySource.indexOf("const asHumanChallenge"),
    );

    expect(identitySource).not.toContain("PROFILE_STATUS_CACHE_MAX_AGE_MS");
    expect(identitySource).toContain("if (memory) return memory");
    expect(identitySource).toContain("void removePersistedNativeVerifyIdentityProfileStatus(userId, sessionKey)");
    expect(cacheSection).toContain("nativeVerifyIdentityProfileStatusMemory.get(key)");
    expect(cacheSection).toContain("nativeVerifyIdentityProfileStatusMemory.set(");
    expect(cacheSection).not.toContain("AsyncStorage.setItem(");
    expect(cacheSection).not.toContain("AsyncStorage.getItem(");
  });

  it("purges legacy persisted PII and clears memory on logout or user switch", () => {
    expect(identitySource).toContain("readNativeDisplayCacheKeys()");
    expect(identitySource).toContain("AsyncStorage.multiRemove(keys)");
    expect(identitySource).toContain("[2, PROFILE_STATUS_CACHE_VERSION].map");
    expect(identitySource).toContain("removePersistedNativeVerifyIdentityProfileStatus(userId, sessionKey)");
    expect(identitySource).toMatch(/if \(!nextSession \|\| nextSession\.userId !== nativeVerifyIdentityUserId\) \{\s*nativeVerifyIdentityProfileStatusMemory\.clear\(\)/);
  });
});
