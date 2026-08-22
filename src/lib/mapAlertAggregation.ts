export type MapAlertAggregationInput = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  created_at?: string | null;
};

export type MapAlertAggregationGroup<T extends MapAlertAggregationInput> = {
  id: string;
  center: [number, number];
  members: T[];
  primary: T;
};

const TILE_SIZE = 512;
const MAX_LATITUDE = 85.05112878;
export const MAP_ALERT_COLLISION_DISTANCE_PX = 46;

const severityRank = (type: string) => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "lost") return 0;
  if (normalized === "stray") return 1;
  if (normalized === "caution") return 2;
  return 3;
};

const worldPoint = (longitude: number, latitude: number, zoom: number) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
};

const primaryOrder = <T extends MapAlertAggregationInput>(left: T, right: T) => {
  const severity = severityRank(left.alert_type) - severityRank(right.alert_type);
  if (severity !== 0) return severity;
  const time = new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  if (Number.isFinite(time) && time !== 0) return time;
  return left.id.localeCompare(right.id);
};

/** Browser mirror of app/src/lib/nativeMapAlertAggregation.ts. */
export const buildMapAlertAggregation = <T extends MapAlertAggregationInput>(
  alerts: T[],
  settledZoom: number,
): MapAlertAggregationGroup<T>[] => {
  const groups: Array<{ members: T[]; points: Array<{ x: number; y: number }> }> = [];
  [...alerts].sort((a, b) => a.id.localeCompare(b.id)).forEach((alert) => {
    if (!alert.id || !Number.isFinite(alert.latitude) || !Number.isFinite(alert.longitude)) return;
    const point = worldPoint(alert.longitude, alert.latitude, settledZoom);
    const group = groups.find((candidate) => candidate.points.some((other) => (
      Math.hypot(point.x - other.x, point.y - other.y) < MAP_ALERT_COLLISION_DISTANCE_PX
    )));
    if (group) {
      group.members.push(alert);
      group.points.push(point);
    } else {
      groups.push({ members: [alert], points: [point] });
    }
  });

  return groups.map((group) => {
    const members = [...group.members].sort(primaryOrder);
    const longitude = members.reduce((sum, alert) => sum + alert.longitude, 0) / members.length;
    const latitude = members.reduce((sum, alert) => sum + alert.latitude, 0) / members.length;
    return {
      id: members.map((alert) => alert.id).sort().join(":"),
      center: [longitude, latitude],
      members,
      primary: members[0],
    };
  });
};

export const mapAlertAggregateCountLabel = (count: number) => count >= 9 ? "9+" : String(Math.max(2, count));
