import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { pickMaskedAvatarAsset, type GenderBucket } from "./maskedPinAssets";

const COMPRESSED_MODE_ENTER_ZOOM = 14.5;
const COMPRESSED_MODE_EXIT_ZOOM = 15;

type Coords = { lat: number; lng: number };

interface BlueDotMarkerProps {
  map: mapboxgl.Map | null;
  coords: Coords | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isInvisible?: boolean;
  genderBucket?: GenderBucket;
  sessionMarker?: string | null;
  markerState?: "active" | "expired_dot";
}

const BlueDotMarker = ({
  map,
  coords,
  displayName,
  avatarUrl,
  isVerified = false,
  isInvisible = false,
  genderBucket = "neutral",
  sessionMarker = null,
  markerState = "active",
}: BlueDotMarkerProps) => {
  const [screenPoint, setScreenPoint] = useState<{ x: number; y: number } | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isCompressedMode, setIsCompressedMode] = useState(false);

  useEffect(() => {
    if (!map || !coords) {
      setScreenPoint(null);
      return;
    }

    const syncToMap = () => {
      const zoom = map.getZoom();
      setIsCompressedMode((current) => {
        if (zoom <= COMPRESSED_MODE_ENTER_ZOOM) return true;
        if (zoom >= COMPRESSED_MODE_EXIT_ZOOM) return false;
        return current;
      });
      const point = map.project([coords.lng, coords.lat]);
      setScreenPoint({ x: point.x, y: point.y });
    };

    syncToMap();
    map.on("move", syncToMap);
    map.on("zoom", syncToMap);
    map.on("rotate", syncToMap);
    map.on("pitch", syncToMap);
    map.on("resize", syncToMap);

    if (import.meta.env.DEV) console.debug("[MARKER_MOUNT]", { type: "gps", hasMap: true });

    return () => {
      map.off("move", syncToMap);
      map.off("zoom", syncToMap);
      map.off("rotate", syncToMap);
      map.off("pitch", syncToMap);
      map.off("resize", syncToMap);
    };
  }, [coords, map]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  if (!screenPoint) return null;

  const normalizedName = String(displayName || "").trim();
  const initial = (normalizedName.charAt(0) || "M").toUpperCase();
  const normalizedAvatarUrl = String(avatarUrl || "").trim();
  const hasRenderableAvatar =
    !avatarFailed &&
    normalizedAvatarUrl.length > 0 &&
    (/^https?:\/\//i.test(normalizedAvatarUrl) ||
      normalizedAvatarUrl.startsWith("blob:") ||
      normalizedAvatarUrl.startsWith("data:"));
  const maskedAvatarUrl = pickMaskedAvatarAsset(
    genderBucket,
    `${displayName || "me"}:${sessionMarker || "unpinned"}:${genderBucket}:own`
  );
  const ownAvatarUrl = hasRenderableAvatar ? normalizedAvatarUrl : maskedAvatarUrl;

  return (
    <div
      className="absolute z-[1200] pointer-events-none"
      style={{
        left: `${screenPoint.x}px`,
        top: `${screenPoint.y}px`,
        transform: isCompressedMode ? "translate(-50%, -50%) scale(0.75)" : "translate(-50%, -50%)",
      }}
    >
      {markerState === "expired_dot" ? (
        <div
          className="h-4 w-4 rounded-full border border-white/80 shadow-[0_4px_12px_rgba(33,69,207,0.28)]"
          style={{ background: "rgba(33,69,207,0.72)" }}
          aria-label="Retained pin"
        >
          <div className="m-auto mt-[5px] h-1.5 w-1.5 rounded-full bg-white" />
        </div>
      ) : isInvisible ? (
        <div
          className="h-11 w-11 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden"
          style={{ border: "2px solid #A6D539", background: "#fff" }}
          aria-label="You are incognito"
        >
          {ownAvatarUrl ? (
            <img
              src={ownAvatarUrl}
              alt=""
              className="h-[calc(100%-4px)] w-[calc(100%-4px)] rounded-full object-cover"
              aria-hidden="true"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className="flex h-[calc(100%-4px)] w-[calc(100%-4px)] items-center justify-center rounded-full bg-muted text-sm font-bold text-[var(--text-secondary)]">
              {initial}
            </span>
          )}
        </div>
      ) : (
        <div
          className="h-11 w-11 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex items-center justify-center"
          style={{ border: "3px solid #A6D539", background: "#A6D539" }}
        >
          <div
            className="h-full w-full rounded-full bg-white flex items-center justify-center overflow-hidden"
          >
            {hasRenderableAvatar ? (
              <img
                src={normalizedAvatarUrl}
                alt={displayName || "Me"}
                className="h-[calc(100%-4px)] w-[calc(100%-4px)] rounded-full object-cover"
                onError={() => setAvatarFailed(true)}
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
