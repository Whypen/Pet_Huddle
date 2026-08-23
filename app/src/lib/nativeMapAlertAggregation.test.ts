import { describe, expect, it } from "vitest";
import { buildNativeMapAlertAggregation, nativeAlertAggregateCountLabel } from "./nativeMapAlertAggregation";

const alert = (id: string, longitude: number, alertType = "Stray", createdAt = "2026-07-18T00:00:00Z") => ({
  id, latitude: 22.3, longitude, alertType, createdAt,
});

describe("native alert aggregation", () => {
  it("leaves a single alert as a single-member group", () => {
    expect(buildNativeMapAlertAggregation([alert("a", 114.2)], 14)[0].members).toHaveLength(1);
  });

  it("groups colliding pins at a far viewport and separates them closer", () => {
    const alerts = [alert("a", 114.2), alert("b", 114.2005)];
    expect(buildNativeMapAlertAggregation(alerts, 12)).toHaveLength(1);
    expect(buildNativeMapAlertAggregation(alerts, 17)).toHaveLength(2);
  });

  it("uses Lost, Stray, Caution, Others then newest for the primary", () => {
    const group = buildNativeMapAlertAggregation([
      alert("caution", 114.2, "Caution"),
      alert("stray-old", 114.2, "Stray", "2026-07-17T00:00:00Z"),
      alert("stray-new", 114.2, "Stray", "2026-07-18T00:00:00Z"),
      alert("lost", 114.2, "Lost"),
    ], 16)[0];
    expect(group.primary.id).toBe("lost");
    expect(group.members.map((item) => item.id)).toEqual(["lost", "stray-new", "stray-old", "caution"]);
  });

  it("caps aggregate count copy at 9+ and never emits 1", () => {
    expect(nativeAlertAggregateCountLabel(1)).toBe("2");
    expect(nativeAlertAggregateCountLabel(8)).toBe("8");
    expect(nativeAlertAggregateCountLabel(9)).toBe("9+");
  });
});
