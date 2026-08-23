import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("native store purchase ownership contract", () => {
  it("attaches the authenticated Huddle account to every Apple and Google purchase", () => {
    const nativeStore = read("app/src/lib/nativeStoreSubscriptions.ts");
    expect(nativeStore).toContain("apple: { appAccountToken: userId, sku: product.id }");
    expect(nativeStore).toContain("obfuscatedAccountId: userId");
  });

  it("binds Apple verification and restore to the provider-returned owner", () => {
    const apple = read("supabase/functions/verify-apple-subscription/index.ts");
    expect(apple).toContain("resolveStorePurchaseOwnership(userId, transaction.appAccountToken)");
    expect(apple).toContain('jsonError(400, "missing_app_account_token")');
    expect(apple).toContain('jsonError(409, "store_account_mismatch")');
    expect(apple).toContain("ownership.providerAccountToken");
  });

  it("binds Google subscriptions and consumables to provider-returned owners", () => {
    const google = read("supabase/functions/verify-google-subscription/index.ts");
    expect(google).toContain("product.obfuscatedExternalAccountId || null");
    expect(google).toContain("subscription.externalAccountIdentifiers?.obfuscatedAccountId || null");
    expect(google).toContain("resolveStorePurchaseOwnership(userId, providerAccountIdentifier)");
    expect(google).toContain('jsonError(400, "missing_obfuscated_account_id")');
    expect(google).toContain('jsonError(409, "store_account_mismatch")');
    expect(google.match(/p_provider_account_token: ownership\.providerAccountToken/g)).toHaveLength(2);
  });

  it("does not substitute the authenticated caller for provider ownership at the RPC boundary", () => {
    for (const path of [
      "supabase/functions/verify-apple-subscription/index.ts",
      "supabase/functions/verify-google-subscription/index.ts",
    ]) {
      const verifier = read(path);
      expect(verifier).not.toContain("p_provider_account_token: userId");
    }
  });
});
