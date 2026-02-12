import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";

export type FriendOverlayPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type Props = {
  map: mapboxgl.Map | null;
  friends: FriendOverlayPin[];
  onSelect: (id: string) => void;
};

const FriendMarkersOverlay = ({ map, friends, onSelect }: Props) => {
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});

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
    return () => {
      map.off("move", sync);
      map.off("zoom", sync);
      map.off("rotate", sync);
      map.off("pitch", sync);
      map.off("resize", sync);
    };
  }, [map, friends]);

  if (!map || friends.length === 0) return null;

  return (
    <>
      {friends.map((friend) => {
        const pt = points[friend.id];
        if (!pt) return null;
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
            <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-[#A6D539] text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
              {friend.name.charAt(0).toUpperCase()}
            </span>
          </button>
        );
      })}
    </>
  );
};

export default FriendMarkersOverlay;

