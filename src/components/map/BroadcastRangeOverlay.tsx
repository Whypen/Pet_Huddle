import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";

type RangeAlert = {
  id: string;
  latitude: number;
  longitude: number;
  creator_id?: string | null;
  range_meters?: number | null;
  range_km?: number | null;
  marker_state?: "active" | "expired_dot";
  alert_type: string;
};

type Props = {
  map: mapboxgl.Map | null;
  alerts: RangeAlert[];
  viewerId: string | null;
};

const rangeColor = (type: string) => {
  const normalized = type.toLowerCase();
  if (normalized === "lost") return "255,76,76";
  if (normalized === "stray") return "255,138,76";
  if (normalized === "caution") return "250,190,45";
  return "33,69,207";
};

const BroadcastRangeOverlay = ({ map, alerts, viewerId }: Props) => {
  const [revision, redraw] = useState(0);
  useEffect(() => {
    if (!map) return;
    const sync = () => redraw((value) => value + 1);
    map.on("move", sync);
    map.on("zoom", sync);
    map.on("resize", sync);
    return () => {
      map.off("move", sync);
      map.off("zoom", sync);
      map.off("resize", sync);
    };
  }, [map]);

  const ranges = useMemo(() => {
    void revision;
    if (!map || !viewerId) return [];
    return alerts.flatMap((alert) => {
      if (alert.creator_id !== viewerId || alert.marker_state === "expired_dot") return [];
      const meters = Number(alert.range_meters ?? (alert.range_km ? Number(alert.range_km) * 1000 : 0));
      if (!Number.isFinite(meters) || meters <= 0) return [];
      const point = map.project([alert.longitude, alert.latitude]);
      const metersPerPixel = 156543.03392 * Math.cos((alert.latitude * Math.PI) / 180) / Math.pow(2, map.getZoom());
      const radius = Math.max(12, meters / Math.max(metersPerPixel, 0.01));
      return [{ ...alert, point, radius, color: rangeColor(alert.alert_type) }];
    });
  }, [alerts, map, revision, viewerId]);

  if (!map || ranges.length === 0) return null;
  return <>{ranges.map((range) => (
    <div key={range.id} className="pointer-events-none absolute z-[1100]" style={{ left: range.point.x, top: range.point.y }} aria-hidden="true">
      <span className="absolute rounded-full border" style={{ width: range.radius * 2, height: range.radius * 2, left: -range.radius, top: -range.radius, borderColor: `rgba(${range.color},.3)`, background: `rgba(${range.color},.07)` }} />
      <span className="absolute animate-ping rounded-full border" style={{ width: range.radius * 2, height: range.radius * 2, left: -range.radius, top: -range.radius, borderColor: `rgba(${range.color},.22)` }} />
    </div>
  ))}</>;
};

export default BroadcastRangeOverlay;
