export type PinCoords = { lat: number; lng: number } & { __brand: "PinCoords" };

export const asPinCoords = (coords: { lat: number; lng: number }): PinCoords =>
  coords as PinCoords;
