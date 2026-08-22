import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

let fingerprintPromise: ReturnType<typeof FingerprintJS.load> | null = null;
const LOGIN_DEVICE_ID_KEY = "huddle.web.sign-in-device-id.v1";
let inMemoryLoginDeviceId = "";

async function getAgent() {
  if (!fingerprintPromise) {
    fingerprintPromise = FingerprintJS.load();
  }
  return fingerprintPromise;
}

export async function getVisitorId(): Promise<string | null> {
  try {
    const fp = await getAgent();
    const result = await fp.get();
    return result.visitorId || null;
  } catch (error) {
    console.warn("[deviceFingerprint] failed to compute visitor id", error);
    return null;
  }
}

export async function getLoginDeviceId(): Promise<string> {
  if (inMemoryLoginDeviceId) return inMemoryLoginDeviceId;

  try {
    const stored = window.localStorage.getItem(LOGIN_DEVICE_ID_KEY)?.trim();
    if (stored) {
      inMemoryLoginDeviceId = stored;
      return stored;
    }
  } catch {
    // Private browsing and hardened browser modes can deny storage access.
  }

  const fingerprintId = await getVisitorId();
  const generated = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  const deviceId = fingerprintId || `web-signin-${generated}`;
  inMemoryLoginDeviceId = deviceId;
  try {
    window.localStorage.setItem(LOGIN_DEVICE_ID_KEY, deviceId);
  } catch {
    // The in-memory value still prevents repeated identity rotation this session.
  }
  return deviceId;
}

export async function trackDeviceFingerprint(
  source: "signup" | "login" | "verify_identity_entry" | "other",
): Promise<{ ok: boolean; verificationStatus?: string | null }> {
  try {
    const visitorId = await getVisitorId();
    if (!visitorId) return { ok: false };
    const { data, error } = await invokeAuthedFunction<{ verificationStatus?: string }>("verify-device-fingerprint", {
      body: {
        visitorId,
        source,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      },
    });
    if (error) {
      console.warn("[deviceFingerprint] track error", error.message);
      return { ok: false };
    }
    return {
      ok: true,
      verificationStatus: typeof data?.verificationStatus === "string" ? data.verificationStatus : null,
    };
  } catch (error) {
    console.warn("[deviceFingerprint] track invoke failed", error);
    return { ok: false };
  }
}
