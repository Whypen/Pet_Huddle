export type NativeMapPinCollisionInput = {
  id: string;
  latitude: number;
  longitude: number;
};

export type NativeMapPinPixelOffset = { x: number; y: number };

const SAME_LOCATION_DECIMALS = 6;
const PIN_SEPARATION_PX = 22;

const locationKey = (pin: NativeMapPinCollisionInput) =>
  `${pin.latitude.toFixed(SAME_LOCATION_DECIMALS)}:${pin.longitude.toFixed(SAME_LOCATION_DECIMALS)}`;

export const buildNativeMapPinCollisionOffsets = (
  pins: NativeMapPinCollisionInput[],
): Map<string, NativeMapPinPixelOffset> => {
  const offsets = new Map<string, NativeMapPinPixelOffset>();
  const groups = new Map<string, NativeMapPinCollisionInput[]>();

  pins.forEach((pin) => {
    if (!pin.id || !Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) return;
    const key = locationKey(pin);
    groups.set(key, [...(groups.get(key) || []), pin]);
  });

  groups.forEach((group) => {
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    if (ordered.length === 1) {
      offsets.set(ordered[0].id, { x: 0, y: 0 });
      return;
    }
    const startAngle = ordered.length === 2 ? Math.PI : -Math.PI / 2;
    ordered.forEach((pin, index) => {
      const angle = startAngle + (index * Math.PI * 2) / ordered.length;
      offsets.set(pin.id, {
        x: Math.round(Math.cos(angle) * PIN_SEPARATION_PX),
        y: Math.round(Math.sin(angle) * PIN_SEPARATION_PX),
      });
    });
  });

  return offsets;
};
