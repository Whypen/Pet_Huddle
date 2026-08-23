import { describe, expect, it } from "vitest";
import { buildNativeMapPinCollisionOffsets } from "./nativeMapPinCollision";

describe("buildNativeMapPinCollisionOffsets", () => {
  it("does not move an isolated pin", () => {
    expect(buildNativeMapPinCollisionOffsets([
      { id: "alert:a", latitude: 22.3, longitude: 114.2 },
    ]).get("alert:a")).toEqual({ x: 0, y: 0 });
  });

  it("gives co-located pins distinct tappable positions", () => {
    const offsets = buildNativeMapPinCollisionOffsets([
      { id: "friend:b", latitude: 22.3, longitude: 114.2 },
      { id: "alert:a", latitude: 22.3, longitude: 114.2 },
    ]);
    expect(offsets.get("alert:a")).not.toEqual(offsets.get("friend:b"));
    expect(offsets.get("alert:a")).not.toEqual({ x: 0, y: 0 });
  });

  it("is deterministic regardless of input order", () => {
    const pins = [
      { id: "own:self", latitude: 22.3, longitude: 114.2 },
      { id: "friend:b", latitude: 22.3, longitude: 114.2 },
      { id: "alert:a", latitude: 22.3, longitude: 114.2 },
    ];
    expect([...buildNativeMapPinCollisionOffsets(pins).entries()])
      .toEqual([...buildNativeMapPinCollisionOffsets([...pins].reverse()).entries()]);
  });

  it("does not merge nearby but genuinely different coordinates", () => {
    const offsets = buildNativeMapPinCollisionOffsets([
      { id: "alert:a", latitude: 22.300001, longitude: 114.2 },
      { id: "alert:b", latitude: 22.300009, longitude: 114.2 },
    ]);
    expect(offsets.get("alert:a")).toEqual({ x: 0, y: 0 });
    expect(offsets.get("alert:b")).toEqual({ x: 0, y: 0 });
  });
});
