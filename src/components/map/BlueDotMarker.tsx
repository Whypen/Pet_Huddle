import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { User } from "lucide-react";

type Coords = { lat: number; lng: number };

interface BlueDotMarkerProps {
  map: mapboxgl.Map | null;
  coords: Coords | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isInvisible?: boolean;
}

const BlueDotMarker = ({ map, coords, displayName, avatarUrl, isVerified = false, isInvisible = false }: BlueDotMarkerProps) => {
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
    map.on("render", syncToMap);

    if (import.meta.env.DEV) console.debug("[MARKER_MOUNT]", { type: "gps", hasMap: true });

    return () => {
      map.off("move", syncToMap);
      map.off("zoom", syncToMap);
      map.off("rotate", syncToMap);
      map.off("pitch", syncToMap);
      map.off("resize", syncToMap);
      map.off("render", syncToMap);
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
      }}
    >
      {isInvisible ? (
        <div
          className="h-11 w-11 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex items-center justify-center"
          style={{ border: "2px solid #A6D539", background: "#A6D539" }}
          aria-label="You are incognito"
        >
          <User className="h-5 w-5 text-white" strokeWidth={2.4} />
        </div>
      ) : (
        <div
          className="h-11 w-11 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex items-center justify-center"
          style={{ border: "3px solid #A6D539", background: "#A6D539" }}
        >
          <div
            className="h-full w-full rounded-full bg-white flex items-center justify-center overflow-hidden"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || "Me"}
                className="h-[calc(100%-4px)] w-[calc(100%-4px)] rounded-full object-cover"
              />
            ) : (
              <span className="flex h-[calc(100%-4px)] w-[calc(100%-4px)] items-center justify-center rounded-full bg-muted text-sm font-bold text-[var(--text-secondary)]">
                {initial}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BlueDotMarker;
