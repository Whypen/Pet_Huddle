import { describe, expect, it } from "vitest";
import {
  buildNativeMapPeopleAreaGroups,
  buildNativeMapPeopleCollisionGroups,
  nativeMapPeopleAreaKey,
} from "./nativeMapPeopleAggregation";

describe("native map people aggregation", () => {
  it("groups friends only when the server area key matches", () => {
    expect(buildNativeMapPeopleAreaGroups([
      { id: "b", areaKey: "cell-a", lat: 22.3, lng: 114.17 },
      { id: "a", areaKey: "cell-a", lat: 22.3, lng: 114.17 },
      { id: "c", areaKey: "cell-b", lat: 22.3, lng: 114.17 },
    ])).toEqual([["a", "b"], ["c"]]);
  });

  it("uses an identical server centre as the legacy v2 cell key", () => {
    expect(buildNativeMapPeopleAreaGroups([
      { id: "a", lat: 22.30225, lng: 114.16975 },
      { id: "b", lat: 22.30225, lng: 114.16975 },
      { id: "c", lat: 22.30225, lng: 114.17425 },
    ])).toEqual([["a", "b"], ["c"]]);
  });

  it("never converts a visual collision into area membership", () => {
    expect(nativeMapPeopleAreaKey({ id: "a", areaKey: "cell-a", lat: 22.3, lng: 114.17 }))
      .not.toBe(nativeMapPeopleAreaKey({ id: "b", areaKey: "cell-b", lat: 22.3, lng: 114.17 }));
  });

  it("aggregates markers as soon as their rendered circles touch", () => {
    expect(buildNativeMapPeopleCollisionGroups([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 32, y: 0 },
    ], 34)).toEqual([["a", "b"]]);
  });

  it("keeps connected collisions in one deterministic group", () => {
    expect(buildNativeMapPeopleCollisionGroups([
      { id: "c", x: 64, y: 0 },
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 32, y: 0 },
    ], 34)).toEqual([["a", "b", "c"]]);
  });

  it("does not aggregate markers with visible space between them", () => {
    expect(buildNativeMapPeopleCollisionGroups([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 40, y: 0 },
    ], 34)).toEqual([["a"], ["b"]]);
  });
});
