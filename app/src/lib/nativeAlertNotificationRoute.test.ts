import { describe, expect, it } from "vitest";
import { withNativeMapAlertRouteContext } from "./nativeAlertNotificationRoute";

describe("verified alert notification routing", () => {
  it("carries the alert position and audience into the map route", () => {
    const path = withNativeMapAlertRouteContext("/map", {
      alertId: "8f55ab31-6b25-4d1a-98c7-3a6e8af2d941",
      alertLat: 22.3193,
      alertLng: 114.1694,
      alertType: "Lost",
      verifiedOnly: true,
    });

    expect(path).toContain("/map?alert=8f55ab31-6b25-4d1a-98c7-3a6e8af2d941");
    expect(path).toContain("alertLat=22.3193");
    expect(path).toContain("alertLng=114.1694");
    expect(path).toContain("alertType=Lost");
    expect(path).toContain("verifiedOnly=1");
  });
});
