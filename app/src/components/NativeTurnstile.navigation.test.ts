import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./NativeTurnstile.tsx"), "utf8");
describe("native Turnstile lifecycle contract", () => {
  it("does not remount or add a second recovery message while Cloudflare is verifying", () => {
    expect(source).not.toContain("retryCountRef");
    expect(source).not.toContain("useEffect(");
    expect(source).not.toContain("reloadKey");
    expect(source).not.toContain("Retry security check");
    expect(source).toContain("cacheEnabled");
  });

  it("maps Cloudflare failures to a single user-facing error", () => {
    expect(source).toContain("turnstileUserCopy(payload.message)");
    expect(source).toContain('onError("Security check expired. Try again.")');
  });
});
