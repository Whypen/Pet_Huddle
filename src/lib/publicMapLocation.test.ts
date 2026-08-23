import { describe, expect, it, vi } from "vitest";
import { requestPublicMapLocation } from "./publicMapLocation";

describe("public map location", () => {
  it("uses the browser position without an auth dependency", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 22.31, longitude: 114.17 } } as GeolocationPosition);
    });

    await expect(requestPublicMapLocation({ getCurrentPosition } as unknown as Geolocation)).resolves.toEqual({
      ok: true,
      latitude: 22.31,
      longitude: 114.17,
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("distinguishes denied permission from an unavailable position", async () => {
    const denied = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError));
    const unavailable = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 2 } as GeolocationPositionError));

    await expect(requestPublicMapLocation({ getCurrentPosition: denied } as unknown as Geolocation)).resolves.toEqual({ ok: false, reason: "denied" });
    await expect(requestPublicMapLocation({ getCurrentPosition: unavailable } as unknown as Geolocation)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
