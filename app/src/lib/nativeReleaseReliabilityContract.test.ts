import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(src, path), "utf8");

describe("native release reliability contracts", () => {
  it("keeps confirmed store purchases out of the repurchase path when membership refresh fails", () => {
    const screen = read("screens/NativeManageSubscriptionScreen.tsx");
    const refreshStart = screen.indexOf("const refreshConfirmedPurchaseMembership");
    const refreshEnd = screen.indexOf("useEffect(() =>", refreshStart);
    const refresh = screen.slice(refreshStart, refreshEnd);

    expect(refresh).toContain("await refetchBackendMembership(requestSessionKey)");
    expect(refresh).toContain("setMembershipRefreshNeedsRetry(true)");
    expect(refresh).toContain("Your purchase will not be repeated.");
    expect(refresh).not.toContain("requestNativeStoreProductPurchase");
    expect(screen).toContain("scheduleNativeMembershipRefreshRetry({");
    expect(screen).toContain("membershipAutoRetryAttemptedRef.current = true");
    expect(screen).toContain("subscriptionSessionKeyRef.current === expectedSessionKey");
    expect(screen).toContain('accessibilityLabel="Retry membership refresh"');
    expect(screen).toMatch(/const isPurchaseBusy = [^;]*membershipRefreshNeedsRetry/);
  });

  it("never persists push enabled unless device registration succeeded", () => {
    const screen = read("screens/NativeProfileSummaryScreen.tsx");
    const enableStart = screen.indexOf("const enablePush");
    const enableEnd = screen.indexOf("useEffect(", enableStart);
    const enablePush = screen.slice(enableStart, enableEnd);

    // The registration result now gates the write rather than being rolled back
    // after an optimistic one, so there is no window where the toggle reads
    // enabled while the device is actually unregistered.
    expect(enablePush).toMatch(/if \(result !== "registered"\) \{[\s\S]*?return;/);
    expect(enablePush).toMatch(/result !== "registered"[\s\S]*?persistPrefs\(\{ \.\.\.prefs, push_enabled: true \}, "push"\)/);
    expect(screen).toContain("Push notifications are off. Allow notifications in your device settings, then try again.");
  });
});
