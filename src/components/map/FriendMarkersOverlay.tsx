import { useEffect, useMemo, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { pickGroupedPinAsset, pickMaskedAvatarAsset, type GenderBucket } from "./maskedPinAssets";

export type FriendOverlayPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isInvisible?: boolean;
  markerState?: "active" | "expired_dot";
  genderBucket?: GenderBucket;
  sessionMarker?: string | null;
};

type Props = {
  map: mapboxgl.Map | null;
  friends: FriendOverlayPin[];
  onSelect: (id: string) => void;
};

const COMPRESSED_MODE_ENTER_ZOOM = 14.5;
const COMPRESSED_MODE_EXIT_ZOOM = 15;
const COMPRESSED_GROUP_DISTANCE_PX = 18;
const EXPANDED_OVERLAP_DISTANCE_PX = 28;
const EXPANDED_OVERLAP_STEP_PX = 20;
const COMPRESSED_NON_VERIFIED_BG = "#E3E7EF";
const COMPRESSED_VERIFIED_BG = "#E6EEFF";
const COMPRESSED_BADGE_BG = "#EEF2F8";
const COMPRESSED_BADGE_TEXT = "#5C6474";

const QuietUserGlyph = ({ fill }: { fill: string }) => {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-[19px] w-[19px]"
      style={{ overflow: "visible" }}
    >
      <circle cx="8" cy="4.45" r="2.15" fill={fill} />
      <path
        d="M4.05 12.2c0-1.92 1.78-3.3 3.95-3.3s3.95 1.38 3.95 3.3"
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

  const activeFriends = useMemo(
    () =>
      friends.filter((friend) => {
        const pt = points[friend.id];
        return Boolean(pt) && friend.markerState !== "expired_dot";
      }),
    [friends, points]
  );

  const compressedGroups = useMemo<CompressedGroup[]>(() => {
    if (!isCompressedMode) return [];
    const groups: CompressedGroup[] = [];
    activeFriends.forEach((friend) => {
      const pt = points[friend.id];
      if (!pt) return;
      const overlappingGroup = groups.find((group) => {
        const dx = group.x - pt.x;
        const dy = group.y - pt.y;
        return Math.hypot(dx, dy) <= COMPRESSED_GROUP_DISTANCE_PX;
      });
      if (!overlappingGroup) {
        groups.push({ ids: [friend.id], x: pt.x, y: pt.y });
        return;
      }
      const nextCount = overlappingGroup.ids.length + 1;
      overlappingGroup.x = (overlappingGroup.x * overlappingGroup.ids.length + pt.x) / nextCount;
      overlappingGroup.y = (overlappingGroup.y * overlappingGroup.ids.length + pt.y) / nextCount;
      overlappingGroup.ids.push(friend.id);
    });
    return groups;
  }, [activeFriends, isCompressedMode, points]);

  const groupedIds = useMemo(() => {
    const ids = new Set<string>();
    compressedGroups.forEach((group) => {
      if (group.ids.length > 1) {
        group.ids.forEach((id) => ids.add(id));
      }
    });
    return ids;
  }, [compressedGroups]);

  const expandedOffsets = useMemo(() => {
    if (isCompressedMode) return new Map<string, number>();
    const offsets = new Map<string, number>();
    const clusters: Array<{ ids: string[]; x: number; y: number }> = [];
    activeFriends.forEach((friend) => {
      const pt = points[friend.id];
      if (!pt) return;
      const overlappingCluster = clusters.find((cluster) => {
        const dx = cluster.x - pt.x;
        const dy = cluster.y - pt.y;
        return Math.hypot(dx, dy) <= EXPANDED_OVERLAP_DISTANCE_PX;
      });
      if (!overlappingCluster) {
        clusters.push({ ids: [friend.id], x: pt.x, y: pt.y });
        return;
      }
      const nextCount = overlappingCluster.ids.length + 1;
      overlappingCluster.x = (overlappingCluster.x * overlappingCluster.ids.length + pt.x) / nextCount;
      overlappingCluster.y = (overlappingCluster.y * overlappingCluster.ids.length + pt.y) / nextCount;
      overlappingCluster.ids.push(friend.id);
    });
    clusters.forEach((cluster) => {
      if (cluster.ids.length < 2) return;
      const sortedIds = [...cluster.ids].sort((left, right) => left.localeCompare(right));
      const start = -((sortedIds.length - 1) * EXPANDED_OVERLAP_STEP_PX) / 2;
      sortedIds.forEach((id, index) => {
        offsets.set(id, start + index * EXPANDED_OVERLAP_STEP_PX);
      });
    });
    return offsets;
  }, [activeFriends, isCompressedMode, points]);

  if (!map || friends.length === 0) return null;

  return (
    <>
      {isCompressedMode &&
        compressedGroups
          .filter((group) => group.ids.length > 1)
          .map((group) => {
            const sortedIds = [...group.ids].sort((left, right) => left.localeCompare(right));
            const groupedFriends = sortedIds
              .map((id) => friends.find((friend) => friend.id === id))
              .filter((friend): friend is FriendOverlayPin => Boolean(friend));
            const groupingSessionMarker = groupedFriends
              .map((friend) => `${friend.id}:${friend.sessionMarker || "unpinned"}`)
              .join("|");
            const groupPinUrl = pickGroupedPinAsset(groupingSessionMarker);
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
                <div className="relative h-[34px] w-[34px]">
                  {groupPinUrl ? (
                    <img
                      src={groupPinUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span
                    className="absolute -right-1 -top-1 flex min-w-[12px] items-center justify-center rounded-full border border-white/80 px-1 text-[8px] font-semibold leading-none"
                    style={{ background: COMPRESSED_BADGE_BG, color: COMPRESSED_BADGE_TEXT }}
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
        const expandedOffsetX = expandedOffsets.get(friend.id) ?? 0;
        return (
          <button
            key={friend.id}
            type="button"
            className="absolute z-[1150] pointer-events-auto focus:outline-none"
            style={{
              left: `${pt.x + expandedOffsetX}px`,
              top: `${pt.y}px`,
              transform: "translate(-50%, -100%)",
            }}
            onClick={() => onSelect(friend.id)}
            aria-label={friend.isInvisible ? "Open incognito user" : `Open ${friend.name}`}
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
                const isVerified = friend.isVerified === true;
                return (
                  <span
                    className="flex h-[24px] w-[24px] items-center justify-center rounded-full border border-white/80"
                    style={{
                      background: isVerified ? COMPRESSED_VERIFIED_BG : COMPRESSED_NON_VERIFIED_BG,
                    }}
                  >
                    <QuietUserGlyph fill={isVerified ? "#2145CF" : "#5C6474"} />
                  </span>
                );
              }
              if (friend.isInvisible) {
                const bucket = friend.genderBucket ?? "neutral";
                const sessionKey = `${friend.id}:${friend.sessionMarker || "unpinned"}:${bucket}`;
                const maskedAvatarUrl = pickMaskedAvatarAsset(bucket, sessionKey);
                return (
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
                    style={{ border: `1.5px solid ${ringColor}` }}
                  >
                    {maskedAvatarUrl ? (
                      <img
                        src={maskedAvatarUrl}
                        alt=""
                        className="h-[calc(100%-4px)] w-[calc(100%-4px)] rounded-full object-cover"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="flex h-[calc(100%-4px)] w-[calc(100%-4px)] items-center justify-center rounded-full bg-muted text-sm font-bold text-[var(--text-secondary)]">
                        {initial}
                      </span>
                    )}
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
