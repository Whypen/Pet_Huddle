import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";

export type VetClinicOverlay = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isOpen?: boolean;
  is24h: boolean;
  type?: string;
};

type Props = {
  map: mapboxgl.Map | null;
  vets: VetClinicOverlay[];
  onSelect: (id: string) => void;
};

const VetMarkersOverlay = ({ map, vets, onSelect }: Props) => {
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});

  const vetsById = useMemo(() => {
    const next: Record<string, VetClinicOverlay> = {};
    vets.forEach((v) => {
      next[v.id] = v;
    });
    return next;
  }, [vets]);

  useEffect(() => {
    if (!map || vets.length === 0) {
      setPoints({});
      return;
    }

    const sync = () => {
      const next: Record<string, { x: number; y: number }> = {};
      vets.forEach((v) => {
        if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return;
        const p = map.project([v.lng, v.lat]);
        next[v.id] = { x: p.x, y: p.y };
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
  }, [map, vets]);

  if (!map || vets.length === 0) return null;

  return (
    <>
      {vets.map((vet) => {
        const pt = points[vet.id];
        if (!pt) return null;
        const dotColor = vet.isOpen === true ? "#22c55e" : vet.isOpen === false ? "#ef4444" : "#A1A4A9";
        const emoji = vet.type === "veterinary" ? "🏥" : "🛍️";
        return (
          <button
            key={vet.id}
            type="button"
            className="absolute z-[1150] pointer-events-auto focus:outline-none"
            style={{
              left: `${pt.x}px`,
              top: `${pt.y}px`,
              transform: "translate(-50%, -100%)",
            }}
            onClick={() => onSelect(vet.id)}
            aria-label={`Open ${vet.name}`}
          >
            <span
              className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#E5E7EB] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
              style={{ fontSize: 18 }}
            >
              {emoji}
              <span
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                style={{ background: dotColor }}
              />
            </span>
          </button>
        );
      })}
    </>
  );
};

export default VetMarkersOverlay;

