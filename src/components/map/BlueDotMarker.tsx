import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";

type Coords = { lat: number; lng: number };

interface BlueDotMarkerProps {
  map: mapboxgl.Map | null;
  coords: Coords | null;
  displayName?: string | null;
  isInvisible?: boolean;
}

const BlueDotMarker = ({ map, coords, displayName, isInvisible = false }: BlueDotMarkerProps) => {
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

    console.debug("[MARKER_MOUNT]", { type: "gps", hasMap: true });

    return () => {
      map.off("move", syncToMap);
      map.off("zoom", syncToMap);
      map.off("rotate", syncToMap);
      map.off("pitch", syncToMap);
      map.off("resize", syncToMap);
    };
  }, [coords, map]);

  if (!screenPoint) return null;

  const initial = (displayName || "M").charAt(0).toUpperCase();

  return (
    <div
      className="absolute z-[1200] pointer-events-none"
      style={{
        left: `${screenPoint.x}px`,
        top: `${screenPoint.y}px`,
        transform: "translate(-50%, -50%)",
        opacity: isInvisible ? 0.5 : 1,
      }}
    >
      <div className="h-12 w-12 rounded-full bg-brandBlue shadow-lg flex items-center justify-center">
        <div className="h-10 w-10 rounded-full bg-[#A6D539] border-[3px] border-white text-white font-bold text-sm flex items-center justify-center">
          {initial}
        </div>
      </div>
    </div>
  );
};

export default BlueDotMarker;

