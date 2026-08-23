export const mapRealtimeTopicsForCenters = (centers: [number, number][]) => {
  const topics = new Set<string>();
  for (const [lng, lat] of centers) {
    const latCell = Math.floor(lat * 4);
    const lngCell = Math.floor(lng * 4);
    const longitudeKmPerCell = 27.83 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    const lngCellRadius = Math.max(1, Math.min(12, Math.ceil(25 / longitudeKmPerCell)));
    for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
      const nextLatCell = Math.max(-360, Math.min(359, latCell + latOffset));
      for (let lngOffset = -lngCellRadius; lngOffset <= lngCellRadius; lngOffset += 1) {
        const unwrappedLngCell = lngCell + lngOffset;
        const nextLngCell = ((unwrappedLngCell + 720) % 1440 + 1440) % 1440 - 720;
        topics.add(`map:${nextLatCell}:${nextLngCell}`);
      }
    }
  }
  return Array.from(topics).sort();
};
