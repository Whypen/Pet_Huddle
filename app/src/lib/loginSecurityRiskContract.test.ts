import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const readRepo = (path: string) => readFileSync(resolve(repo, path), "utf8");

describe("login security risk contract", () => {
  it("claims the durable device row before any email side effect", () => {
    const security = readRepo("supabase/functions/_shared/securityDevice.ts");
    const insert = security.indexOf('const inserted = await serviceClient');
    const email = security.indexOf("await sendBrevoSecurityEmail");
    expect(insert).toBeGreaterThan(-1);
    expect(email).toBeGreaterThan(insert);
    expect(security).toContain('reason: "concurrent_device_registration"');
  });

  it("keeps first and familiar-context device registrations quiet", () => {
    const security = readRepo("supabase/functions/_shared/securityDevice.ts");
    expect(security).toContain(
      'knownDevices.length === 0 ? "first_device" : "new_device"',
    );
    expect(security).toContain('level === "medium" || level === "high"');
    expect(security).toMatch(/reason: knownDevices\.length === 0\s*\? "first_device"\s*: "low_risk_new_device"/);
  });

  it("persists the native recognition hint through secure and fallback storage", () => {
    const native = readRepo("app/src/lib/nativeSignInDevice.ts");
    expect(native).toContain("SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId)");
    expect(native).toContain("AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, deviceId)");
    expect(native).toContain("existing || fallback || inMemoryDeviceId");
  });

  it("uses a login-specific stable browser identifier without changing identity verification", () => {
    const fingerprint = readRepo("src/lib/deviceFingerprint.ts");
    const auth = readRepo("src/lib/publicAuthApi.ts");
    expect(fingerprint).toContain('LOGIN_DEVICE_ID_KEY = "huddle.web.sign-in-device-id.v1"');
    expect(fingerprint).toContain("export async function getLoginDeviceId");
    expect(auth).toContain("await getLoginDeviceId()");
    expect(fingerprint).toContain("export async function getVisitorId");
  });
});
