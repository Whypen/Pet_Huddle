/**
 * PinningLayer.tsx — Precise Pinning System
 *
 * Spec: Fixed UI Pin at center of viewport. User drags the MAP underneath.
 * On map.moveend:
 *   1. Mapbox Reverse Geocoding → address string
 *   2. Overpass API → nearby parking / bus_stop within 500m
 *   3. Turf.js distance from device GPS to center pin
 *   4. Header display: "Address | {dist}km"
 *
 * Positioned with: absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full
 * (anchor point at bottom tip of pin icon)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import mapboxgl from "mapbox-gl";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { MapPin } from "lucide-react";

interface NearbyPOI {
  id: number;
  type: "parking" | "bus_stop";
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
}

interface PinningLayerProps {
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
  userLocation: { lat: number; lng: number } | null;
  isActive: boolean;
  onAddressChange?: (address: string, distKm: number) => void;
  onCenterChange?: (lat: number, lng: number) => void;
  onNearbyPOIs?: (pois: NearbyPOI[]) => void;
}

// Mapbox Reverse Geocoding
async function reverseGeocode(lng: number, lat: number, token: string): Promise<string> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address,place,locality,neighborhood&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// Overpass API: parking + bus_stop within 500m
async function fetchNearbyPOIs(lat: number, lng: number): Promise<NearbyPOI[]> {
  try {
    const radius = 500; // meters
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"="parking"](around:${radius},${lat},${lng});
        node["highway"="bus_stop"](around:${radius},${lat},${lng});
      );
      out body;
    `;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.elements) return [];

    const centerPt = point([lng, lat]);
    return data.elements
      .filter((el: any) => el.lat && el.lon)
      .map((el: any) => {
        const poiPt = point([el.lon, el.lat]);
        const dist = distance(centerPt, poiPt, { units: "meters" });
        const isParking = el.tags?.amenity === "parking";
        return {
          id: el.id,
          type: isParking ? "parking" : "bus_stop",
          name: el.tags?.name || (isParking ? "Parking" : "Bus Stop"),
          lat: el.lat,
          lng: el.lon,
          distanceM: Math.round(dist),
        } as NearbyPOI;
      })
      .sort((a: NearbyPOI, b: NearbyPOI) => a.distanceM - b.distanceM)
      .slice(0, 10);
  } catch {
    return [];
  }
}

const PinningLayer = ({
  map,
  mapLoaded,
  userLocation,
  isActive,
  onAddressChange,
  onCenterChange,
  onNearbyPOIs,
}: PinningLayerProps) => {
  const [address, setAddress] = useState<string>("");
  const [distKm, setDistKm] = useState<number>(0);
  const [nearbyPois, setNearbyPois] = useState<NearbyPOI[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const poiMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear POI markers from map
  const clearPOIMarkers = useCallback(() => {
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];
  }, []);

  // Place POI dot markers on map (tiny coloured dots)
  const placePOIMarkers = useCallback(
    (pois: NearbyPOI[]) => {
      if (!map) return;
      clearPOIMarkers();
      pois.forEach((poi) => {
        const el = document.createElement("div");
        const color = poi.type === "parking" ? "#3B82F6" : "#F59E0B"; // blue parking, amber bus
        el.innerHTML = `
          <div style="
            width: 12px;
            height: 12px;
            background: ${color};
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            cursor: pointer;
          " title="${poi.name} (${poi.distanceM}m)"></div>
        `;
        const marker = new mapboxgl.Marker(el)
          .setLngLat([poi.lng, poi.lat])
          .addTo(map);
        poiMarkersRef.current.push(marker);
      });
    },
    [map, clearPOIMarkers]
  );

  // Handler for map movement end — runs reverse geocoding + Overpass + distance
  const handleMoveEnd = useCallback(async () => {
    if (!map || !isActive) return;
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    // Notify parent of center coordinates
    onCenterChange?.(lat, lng);

    setIsLoading(true);

    // Get mapbox access token from the map instance
    const token = mapboxgl.accessToken as string;

    // Run reverse geocoding + Overpass in parallel
    const [addr, pois] = await Promise.all([
      reverseGeocode(lng, lat, token),
      fetchNearbyPOIs(lat, lng),
    ]);

    // Turf.js distance from device GPS to center pin
    let dist = 0;
    if (userLocation) {
      const from = point([userLocation.lng, userLocation.lat]);
      const to = point([lng, lat]);
      dist = distance(from, to, { units: "kilometers" });
    }

    setAddress(addr);
    setDistKm(Math.round(dist * 10) / 10);
    setNearbyPois(pois);

    // Place POI markers
    placePOIMarkers(pois);

    // Notify parent
    onAddressChange?.(addr, Math.round(dist * 10) / 10);
    onNearbyPOIs?.(pois);

    setIsLoading(false);
  }, [map, isActive, userLocation, onAddressChange, onCenterChange, onNearbyPOIs, placePOIMarkers]);

  // Debounced move end listener
  useEffect(() => {
    if (!map || !mapLoaded || !isActive) {
      clearPOIMarkers();
      return;
    }

    const onMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void handleMoveEnd();
      }, 400);
    };

    map.on("moveend", onMoveEnd);

    // Initial geocode on activation
    void handleMoveEnd();

    return () => {
      map.off("moveend", onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearPOIMarkers();
    };
  }, [map, mapLoaded, isActive, handleMoveEnd, clearPOIMarkers]);

  if (!isActive) return null;

  return (
    <>
      {/* Fixed UI Pin at center of viewport — anchor at bottom tip */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-[1050] pointer-events-none"
        style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}
      >
        <MapPin className="w-10 h-10 text-brandBlue fill-brandBlue" strokeWidth={1.5} />
      </div>

      {/* Header bar: Address | distance */}
      <div className="absolute top-16 left-4 right-4 z-[1100]">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-md flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brandText truncate">
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-brandBlue/30 animate-pulse" />
                  Searching address...
                </span>
              ) : address || "Move map to select location"}
            </p>
          </div>
          {userLocation && distKm > 0 && (
            <span className="ml-3 text-xs font-semibold text-brandBlue whitespace-nowrap">
              {distKm} km
            </span>
          )}
        </div>

        {/* Nearby POIs summary */}
        {nearbyPois.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {nearbyPois.slice(0, 5).map((poi) => (
              <span
                key={poi.id}
                className="text-[10px] bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm text-muted-foreground"
              >
                {poi.type === "parking" ? "🅿️" : "🚌"} {poi.name} ({poi.distanceM}m)
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default PinningLayer;
