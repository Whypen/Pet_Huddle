import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";
import AlertPinMarker from "@/components/map/AlertPinMarker";

type OverlayAlert = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  is_demo?: boolean;
};

interface AlertMarkersOverlayProps {
  map: mapboxgl.Map | null;
  alerts: OverlayAlert[];
  onSelect: (alertId: string) => void;
}

const AlertMarkersOverlay = ({ map, alerts, onSelect }: AlertMarkersOverlayProps) => {
  const [screenPoints, setScreenPoints] = useState<Record<string, { x: number; y: number }>>({});

  const alertsById = useMemo(() => {
    const next: Record<string, OverlayAlert> = {};
    alerts.forEach((alert) => {
      next[alert.id] = alert;
    });
    return next;
  }, [alerts]);

  useEffect(() => {
    if (!map || alerts.length === 0) {
      setScreenPoints({});
      return;
    }

    const syncToMap = () => {
      const next: Record<string, { x: number; y: number }> = {};
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

  if (!map || alerts.length === 0) return null;

  return (
    <>
      {alerts.map((alert) => {
        const point = screenPoints[alert.id];
        if (!point) return null;
        return (
          <button
            key={alert.id}
            type="button"
            className="absolute z-[1200] pointer-events-auto focus:outline-none cursor-pointer"
            style={{
              left: `${point.x}px`,
              top: `${point.y}px`,
              transform: "translate(-50%, -100%)",
            }}
            onClick={() => onSelect(alert.id)}
            aria-label={`Open ${alert.alert_type} alert`}
          >
            <AlertPinMarker alertType={alert.alert_type} interactive />
            {alert.is_demo ? (
              <span className="sr-only">Demo alert</span>
            ) : null}
          </button>
        );
      })}
    </>
  );
};

export default AlertMarkersOverlay;
