import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";
import AlertPinMarker from "@/components/map/AlertPinMarker";

type Coords = { lat: number; lng: number };

interface BroadcastMarkerProps {
  map: mapboxgl.Map | null;
  coords: Coords | null;
  alertType: string;
}

const BroadcastMarker = ({ map, coords, alertType }: BroadcastMarkerProps) => {
  const [screenPoint, setScreenPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!map || !coords) {
      setScreenPoint(null);
      return;
    }

    const syncToMap = () => {
      const point = map.project([coords.lng, coords.lat]);
      setScreenPoint({ x: point.x, y: point.y });
    };

    syncToMap();
    map.on("move", syncToMap);
    map.on("zoom", syncToMap);
    map.on("rotate", syncToMap);
    map.on("pitch", syncToMap);
    map.on("resize", syncToMap);

    console.debug("[MARKER_MOUNT]", { type: "broadcast", hasMap: true });

    return () => {
      map.off("move", syncToMap);
      map.off("zoom", syncToMap);
      map.off("rotate", syncToMap);
      map.off("pitch", syncToMap);
      map.off("resize", syncToMap);
    };
  }, [coords, map]);

  if (!screenPoint) return null;

  return (
    <div
      className="absolute z-[1200] pointer-events-none"
      style={{
        left: `${screenPoint.x}px`,
        top: `${screenPoint.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <AlertPinMarker alertType={alertType} />
    </div>
  );
};

export default BroadcastMarker;
