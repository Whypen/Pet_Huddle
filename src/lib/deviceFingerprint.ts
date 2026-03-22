import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

let fingerprintPromise: Promise<FingerprintJS.Agent> | null = null;

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
