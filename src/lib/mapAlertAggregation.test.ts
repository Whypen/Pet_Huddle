import { describe, expect, it } from "vitest";
import { buildMapAlertAggregation, mapAlertAggregateCountLabel } from "./mapAlertAggregation";

const alert = (id: string, longitude: number, alert_type = "Stray", created_at = "2026-08-11T00:00:00Z") => ({
  id,
  latitude: 22.3,
  longitude,
  alert_type,
  created_at,
});

describe("web map alert aggregation", () => {
  it("matches the native settled-zoom collision and severity ownership", () => {
    const grouped = buildMapAlertAggregation([
      alert("stray", 114.20003, "Stray", "2026-08-11T03:00:00Z"),
      alert("lost", 114.2, "Lost", "2026-08-11T01:00:00Z"),
    ], 12);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].primary.id).toBe("lost");
    expect(grouped[0].center[0]).toBeCloseTo(114.200015);
  });

  it("keeps the native aggregate count contract", () => {
    expect(mapAlertAggregateCountLabel(1)).toBe("2");
    expect(mapAlertAggregateCountLabel(9)).toBe("9+");
  });
});
