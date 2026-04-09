import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { User } from "lucide-react";

export type FriendOverlayPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isInvisible?: boolean;
};

type Props = {
  map: mapboxgl.Map | null;
  friends: FriendOverlayPin[];
  onSelect: (id: string) => void;
};

const FriendMarkersOverlay = ({ map, friends, onSelect }: Props) => {
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});
  const [avatarErrorsById, setAvatarErrorsById] = useState<Record<string, boolean>>({});

  const friendsById = useMemo(() => {
    const next: Record<string, FriendOverlayPin> = {};
    friends.forEach((f) => {
      next[f.id] = f;
    });
    return next;
  }, [friends]);

  useEffect(() => {
    if (!map || friends.length === 0) {
      setPoints({});
      return;
    }

    const sync = () => {
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

  return (
    <>
      {friends.map((friend) => {
        const pt = points[friend.id];
        if (!pt) return null;
        const ringColor = friend.isVerified ? "#2145CF" : "#C9CEDA";
        if (friend.isInvisible) {
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
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
              style={{ border: `1.5px solid ${ringColor}` }}
            >
              {(() => {
                const normalizedAvatarUrl = String(friend.avatarUrl || "").trim();
                const canRenderAvatar =
                  !avatarErrorsById[friend.id] &&
                  normalizedAvatarUrl.length > 0 &&
                  (/^https?:\/\//i.test(normalizedAvatarUrl) ||
                    normalizedAvatarUrl.startsWith("blob:") ||
                    normalizedAvatarUrl.startsWith("data:"));
                const normalizedName = String(friend.name || "").trim();
                const initial = (normalizedName.charAt(0) || "F").toUpperCase();
                return canRenderAvatar ? (
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
              );
              })()}
            </span>
          </button>
        );
      })}
    </>
  );
};

export default FriendMarkersOverlay;
