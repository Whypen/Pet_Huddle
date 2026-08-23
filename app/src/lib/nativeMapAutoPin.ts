import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { isNativeOwnPinWindowVisible } from "./nativeMapData";

const completedBootRenewals = new Set<string>();
const inFlightBootRenewals = new Set<string>();

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export async function renewNativeMapPinOnBootOnce(options: {
  accessToken?: string | null;
  sessionKey?: string | null;
  userId?: string | null;
}) {
  const accessToken = String(options.accessToken || "").trim();
  const userId = String(options.userId || "").trim();
  const sessionKey = String(options.sessionKey || userId || "").trim();
  if (!accessToken || !userId || !sessionKey) return "missing_session" as const;
  if (completedBootRenewals.has(sessionKey) || inFlightBootRenewals.has(sessionKey)) return "already_checked" as const;

  inFlightBootRenewals.add(sessionKey);
  try {
    const { profile } = await fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey });
    if (!profile || profile.hide_from_map === true) return "not_visible" as const;

    const hasExistingPin = finiteNumber(profile.last_lat) && finiteNumber(profile.last_lng);
    if (!hasExistingPin) return "no_existing_pin" as const;
    const previousPin = { lat: profile.last_lat as number, lng: profile.last_lng as number };
    if (!isNativeOwnPinWindowVisible(profile.location_pinned_until, profile.location_retention_until)) {
      return "pin_not_visible" as const;
    }

    void previousPin;
    return "boot_public_pin_renew_disabled" as const;
  } finally {
    inFlightBootRenewals.delete(sessionKey);
    completedBootRenewals.add(sessionKey);
  }
}
