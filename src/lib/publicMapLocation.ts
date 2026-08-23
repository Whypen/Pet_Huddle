export type PublicMapLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" };

export const requestPublicMapLocation = (
  geolocation: Geolocation | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation,
): Promise<PublicMapLocationResult> => {
  if (!geolocation) return Promise.resolve({ ok: false, reason: "unsupported" });

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({ ok: true, latitude: coords.latitude, longitude: coords.longitude }),
      (error) => resolve({ ok: false, reason: error.code === 1 ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 5_000, maximumAge: 60_000 },
    );
  });
};
