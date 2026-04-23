import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { User, Users } from "lucide-react";

export type FriendOverlayPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isInvisible?: boolean;
  markerState?: "active" | "expired_dot";
};

type Props = {
  map: mapboxgl.Map | null;
  friends: FriendOverlayPin[];
  onSelect: (id: string) => void;
};

const COMPRESSED_MODE_ENTER_ZOOM = 14.5;
const COMPRESSED_MODE_EXIT_ZOOM = 15;
const COMPRESSED_GROUP_DISTANCE_PX = 18;

const QuietUserGlyph = ({ isVerified }: { isVerified: boolean }) => {
  const fill = isVerified ? "#2145CF" : "#5C6474";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-[19px] w-[19px]"
      style={{ overflow: "visible" }}
    >
      <circle cx="8" cy="4.4" r="2.1" fill={fill} />
      <path
        d="M4.15 12.3c0-1.95 1.72-3.35 3.85-3.35s3.85 1.4 3.85 3.35"
        fill={fill}
      />
    </svg>
  );
};

type CompressedGroup = {
  ids: string[];
  x: number;
  y: number;
};

const QuietGroupGlyph = () => (
  <Users className="h-[18px] w-[18px] text-[#5C6474]" strokeWidth={1.7} aria-hidden="true" />
);

const FriendMarkersOverlay = ({ map, friends, onSelect }: Props) => {
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});
  const [avatarErrorsById, setAvatarErrorsById] = useState<Record<string, boolean>>({});
  const [isCompressedMode, setIsCompressedMode] = useState(false);

  useEffect(() => {
    if (!map || friends.length === 0) {
      setPoints({});
      return;
    }

    const sync = () => {
      const zoom = map.getZoom();
      setIsCompressedMode((current) => {
        if (zoom <= COMPRESSED_MODE_ENTER_ZOOM) return true;
        if (zoom >= COMPRESSED_MODE_EXIT_ZOOM) return false;
        return current;
      });
      const next: Record<string, { x: number; y: number }> = {};
      friends.forEach((f) => {
        if (!Number.isFinite(f.lat) || !Number.isFinite(f.lng)) return;
        const p = map.project([f.lng, f.lat]);
        next[f.id] = { x: p.x, y: p.y };
      });
      setPoints(next);
    };

    sync();
    map.on("move", sync);
    map.on("zoom", sync);
    map.on("rotate", sync);
    map.on("pitch", sync);
    map.on("resize", sync);
    map.on("render", sync);
    return () => {
      map.off("move", sync);
      map.off("zoom", sync);
      map.off("rotate", sync);
      map.off("pitch", sync);
      map.off("resize", sync);
      map.off("render", sync);
    };
  }, [map, friends]);

  useEffect(() => {
    setAvatarErrorsById((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      friends.forEach((friend) => {
        if (prev[friend.id]) next[friend.id] = true;
      });
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      if (!changed) {
        for (const id of Object.keys(next)) {
          if (!prev[id]) {
            changed = true;
            break;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [friends]);

  if (!map || friends.length === 0) return null;

  const compressedGroups: CompressedGroup[] = [];
  const groupedIds = new Set<string>();

  if (isCompressedMode) {
    friends.forEach((friend) => {
      const pt = points[friend.id];
      if (!pt || friend.markerState === "expired_dot") return;

      const overlappingGroup = compressedGroups.find((group) => {
        const dx = group.x - pt.x;
        const dy = group.y - pt.y;
        return Math.hypot(dx, dy) <= COMPRESSED_GROUP_DISTANCE_PX;
      });

      if (!overlappingGroup) {
        compressedGroups.push({ ids: [friend.id], x: pt.x, y: pt.y });
        return;
      }

      const nextCount = overlappingGroup.ids.length + 1;
      overlappingGroup.x = (overlappingGroup.x * overlappingGroup.ids.length + pt.x) / nextCount;
      overlappingGroup.y = (overlappingGroup.y * overlappingGroup.ids.length + pt.y) / nextCount;
      overlappingGroup.ids.push(friend.id);
    });

    compressedGroups.forEach((group) => {
      if (group.ids.length > 1) {
        group.ids.forEach((id) => groupedIds.add(id));
      }
    });
  }

  return (
    <>
      {isCompressedMode &&
        compressedGroups
          .filter((group) => group.ids.length > 1)
          .map((group) => {
            const countLabel = group.ids.length > 9 ? "9+" : String(group.ids.length);
            return (
              <div
                key={`group:${group.ids.join(",")}`}
                className="absolute z-[1140] pointer-events-none"
                style={{
                  left: `${group.x}px`,
                  top: `${group.y}px`,
                  transform: "translate(-50%, -100%)",
                }}
                aria-label={`${group.ids.length} nearby users`}
              >
                <div className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/80 bg-[#E3E7EF]">
                  <QuietGroupGlyph />
                  <span
                    className="absolute -right-1 -top-1 flex min-w-[12px] items-center justify-center rounded-full px-1 text-[8px] font-semibold leading-none text-[#4E5565]"
                    style={{ background: "#F7F8FB", border: "0.75px solid rgba(78,85,101,0.24)" }}
                  >
                    {countLabel}
                  </span>
                </div>
              </div>
            );
          })}
      {friends.map((friend) => {
        const pt = points[friend.id];
        if (!pt) return null;
        if (friend.markerState === "expired_dot") return null;
        if (groupedIds.has(friend.id)) return null;
        const ringColor = friend.isVerified ? "#2145CF" : "#C9CEDA";
        if (friend.isInvisible && !isCompressedMode) {
          return (
            <div
              key={friend.id}
              className="absolute z-[1150] pointer-events-none"
              style={{
                left: `${pt.x}px`,
                top: `${pt.y}px`,
                transform: "translate(-50%, -100%)",
              }}
              aria-label="Incognito user"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                style={{ background: "#A6D539", border: "2px solid #A6D539" }}
              >
                <User className="h-5 w-5 text-white" strokeWidth={2.4} />
              </span>
            </div>
          );
        }
        return (
          <button
            key={friend.id}
            type="button"
            className="absolute z-[1150] pointer-events-auto focus:outline-none"
            style={{
              left: `${pt.x}px`,
              top: `${pt.y}px`,
              transform: "translate(-50%, -100%)",
            }}
            onClick={() => onSelect(friend.id)}
            aria-label={`Open ${friend.name}`}
          >
            {(() => {
              const normalizedAvatarUrl = String(friend.avatarUrl || "").trim();
              const canRenderAvatar =
                !isCompressedMode &&
                !avatarErrorsById[friend.id] &&
                normalizedAvatarUrl.length > 0 &&
                (/^https?:\/\//i.test(normalizedAvatarUrl) ||
                  normalizedAvatarUrl.startsWith("blob:") ||
                  normalizedAvatarUrl.startsWith("data:"));
              const normalizedName = String(friend.name || "").trim();
              const initial = (normalizedName.charAt(0) || "F").toUpperCase();
              if (isCompressedMode) {
                return (
                  <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full border border-white/80 bg-[#E3E7EF]">
                    <QuietUserGlyph isVerified={friend.isVerified === true} />
                  </span>
                );
              }
              return (
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                  style={{ border: `1.5px solid ${ringColor}` }}
                >
                  {canRenderAvatar ? (
                    <img
                      src={normalizedAvatarUrl}
                      alt={friend.name}
                      className="h-[calc(100%-4px)] w-[calc(100%-4px)] rounded-full object-cover"
                      onError={() =>
                        setAvatarErrorsById((prev) => ({ ...prev, [friend.id]: true }))
                      }
                    />
                  ) : (
                    <span className="flex h-[calc(100%-4px)] w-[calc(100%-4px)] items-center justify-center rounded-full bg-muted text-sm font-bold text-[var(--text-secondary)]">
                      {initial}
                    </span>
                  )}
                </span>
              );
            })()}
          </button>
        );
      })}
    </>
  );
};

export default FriendMarkersOverlay;
