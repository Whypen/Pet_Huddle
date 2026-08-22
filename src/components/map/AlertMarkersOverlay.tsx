import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";
import AlertPinMarker from "@/components/map/AlertPinMarker";
import { getBroadcastPinStyle } from "@/lib/broadcastPinStyle";
import { buildMapAlertAggregation, mapAlertAggregateCountLabel } from "@/lib/mapAlertAggregation";

type OverlayAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  creator_id?: string | null;
  created_at?: string | null;
  marker_state?: "active" | "expired_dot";
  is_demo?: boolean;
};

const ALERT_BLOB_RADIUS_METERS = 750;
const ACTIVE_ALERT_RIPPLE_MAX_MARKERS = 16;
const RIPPLE_ALERT_TYPES = new Set(["lost", "stray", "caution"]);

const metersToPixels = (map: mapboxgl.Map, latitude: number, meters: number) => {
  const metersPerPixel = 156543.03392 * Math.cos((latitude * Math.PI) / 180) / Math.pow(2, map.getZoom());
  return meters / Math.max(metersPerPixel, 0.01);
};

interface AlertMarkersOverlayProps {
  map: mapboxgl.Map | null;
  alerts: OverlayAlert[];
  viewerId?: string | null;
  onSelect: (alertId: string) => void;
}

const AlertMarkersOverlay = ({ map, alerts, viewerId = null, onSelect }: AlertMarkersOverlayProps) => {
  const [, setScreenPoints] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 16);
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!map || alerts.length === 0) {
      setScreenPoints({});
      return;
    }

    const syncToMap = () => {
      const next: Record<string, { x: number; y: number }> = {};
      setZoom(map.getZoom());
      alerts.forEach((alert) => {
        const projected = map.project([alert.longitude, alert.latitude]);
        next[alert.id] = { x: projected.x, y: projected.y };
      });
      setScreenPoints(next);
    };

    syncToMap();
    map.on("move", syncToMap);
    map.on("zoom", syncToMap);
    map.on("rotate", syncToMap);
    map.on("pitch", syncToMap);
    map.on("resize", syncToMap);

    return () => {
      map.off("move", syncToMap);
      map.off("zoom", syncToMap);
      map.off("rotate", syncToMap);
      map.off("pitch", syncToMap);
      map.off("resize", syncToMap);
    };
  }, [alerts, map]);

  const groups = useMemo(() => buildMapAlertAggregation(alerts, zoom).flatMap((group) => (
    group.members.length > 1 && !group.members.some((alert) => expandedAlertIds.has(alert.id))
      ? [group]
      : group.members.map((member) => ({ id: member.id, center: [member.longitude, member.latitude] as [number, number], members: [member], primary: member }))
  )), [alerts, expandedAlertIds, zoom]);
  const activeRippleCandidateCount = useMemo(() => alerts.filter((alert) => (
    alert.marker_state !== "expired_dot" && RIPPLE_ALERT_TYPES.has(String(alert.alert_type || "").trim().toLowerCase())
  )).length, [alerts]);

  if (!map || alerts.length === 0) return null;

  return (
    <>
      {groups.map((group) => {
        const alert = group.primary;
        if (!alert) return null;
        const point = map.project(group.center);
        const markerColor = getBroadcastPinStyle(alert.alert_type).markerColor;
        const normalizedType = String(alert.alert_type || "").trim().toLowerCase();
        const featured = group.members.length === 1
          && activeRippleCandidateCount <= ACTIVE_ALERT_RIPPLE_MAX_MARKERS
          && alert.marker_state !== "expired_dot"
          && RIPPLE_ALERT_TYPES.has(normalizedType)
          && alert.creator_id !== viewerId;
        const blobRadius = metersToPixels(map, alert.latitude, ALERT_BLOB_RADIUS_METERS);
        return (
          <span key={group.id}>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute z-[1050] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[28px]"
              style={{ left: point.x, top: point.y, width: blobRadius * 2, height: blobRadius * 2, background: markerColor }}
            />
            {featured ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute z-[1060] -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border opacity-20 motion-reduce:animate-none"
                style={{ left: point.x, top: point.y, width: blobRadius * 2, height: blobRadius * 2, borderColor: markerColor }}
              />
            ) : null}
            <button
              type="button"
              className="absolute z-[1200] pointer-events-auto focus:outline-none cursor-pointer"
              style={{ left: `${point.x}px`, top: `${point.y}px`, transform: "translate(-50%, -100%)" }}
              onClick={() => {
                if (group.members.length > 1) {
                  setExpandedAlertIds((current) => new Set([...current, ...group.members.map((item) => item.id)]));
                }
                onSelect(alert.id);
              }}
              aria-label={group.members.length > 1 ? `Open ${group.members.length} alerts in this area` : `Open ${alert.alert_type} alert`}
            >
              {group.members.length > 1 ? (
                <span className="relative flex h-10 min-w-10 items-center justify-center rounded-full border-2 bg-background px-2 text-sm font-extrabold shadow-elevated" style={{ borderColor: markerColor, color: markerColor }}>
                  {mapAlertAggregateCountLabel(group.members.length)}
                  <span className="absolute -bottom-[7px] h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent" style={{ borderTopColor: markerColor }} />
                </span>
              ) : <AlertPinMarker alertType={alert.alert_type} markerState={alert.marker_state || "active"} interactive />}
              {alert.is_demo ? <span className="sr-only">Demo alert</span> : null}
            </button>
          </span>
        );
      })}
    </>
  );
};

export default AlertMarkersOverlay;
