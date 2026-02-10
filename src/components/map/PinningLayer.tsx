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
import { MapPin, Search, Loader2 } from "lucide-react";

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

// Mapbox Reverse Geocoding with 3s timeout
async function reverseGeocode(lng: number, lat: number, token: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address,place,locality,neighborhood&limit=1`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return "";
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name || "";
    }
    return "";
  } catch {
    return ""; // Empty string signals timeout / failure → show manual input
  }
}

// Mapbox Forward Geocoding — search by text, returns { lat, lng, address }
async function forwardGeocode(
  query: string,
  token: string,
  bbox?: string
): Promise<{ lat: number; lng: number; address: string } | null> {
  try {
    const bboxParam = bbox ? `&bbox=${bbox}` : "";
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=address,place,locality,neighborhood,poi&limit=1${bboxParam}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const feat = data.features[0];
      const [lng, lat] = feat.center;
      return { lat, lng, address: feat.place_name || query };
    }
    return null;
  } catch {
    return null;
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
    interface OverpassElement {
      id: number;
      lat: number;
      lon: number;
      tags?: { amenity?: string; name?: string; [key: string]: string | undefined };
    }
    return (data.elements as OverpassElement[])
      .filter((el) => el.lat && el.lon)
      .map((el) => {
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
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
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

  // Forward geocode handler for manual address input
  const handleManualSearch = useCallback(async () => {
    if (!map || !manualQuery.trim()) return;
    setIsSearching(true);
    const token = mapboxgl.accessToken as string;
    // Bias results to Hong Kong bbox
    const result = await forwardGeocode(manualQuery.trim(), token, "113.83,22.15,114.44,22.56");
    if (result) {
      setAddress(result.address);
      setShowManualInput(false);
      setManualQuery("");
      // Fly map to the geocoded location → triggers moveend → updates center
      map.flyTo({ center: [result.lng, result.lat], zoom: 14 });
      onCenterChange?.(result.lat, result.lng);
      onAddressChange?.(result.address, distKm);
    }
    setIsSearching(false);
  }, [map, manualQuery, distKm, onCenterChange, onAddressChange]);

  // Handler for map movement end — runs reverse geocoding + Overpass + distance
  const handleMoveEnd = useCallback(async () => {
    if (!map || !isActive) return;
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    // Notify parent of center coordinates
    onCenterChange?.(lat, lng);

    setIsLoading(true);
    setShowManualInput(false);
    console.log(`[PinningLayer] moveEnd — center: lat=${lat.toFixed(5)}, lng=${lng.toFixed(5)}`);

    // Get mapbox access token from the map instance
    const token = mapboxgl.accessToken as string;

    // Run reverse geocoding (3s timeout) + Overpass in parallel
    console.log("[PinningLayer] Geocoding Payload: reverseGeocode + fetchNearbyPOIs...");
    const [addr, pois] = await Promise.all([
      reverseGeocode(lng, lat, token),
      fetchNearbyPOIs(lat, lng),
    ]);
    console.log(`[PinningLayer] Geocode result: addr="${addr}", POIs=${pois.length}`);

    // Turf.js distance from device GPS to center pin
    let dist = 0;
    if (userLocation) {
      const from = point([userLocation.lng, userLocation.lat]);
      const to = point([lng, lat]);
      dist = distance(from, to, { units: "kilometers" });
    }

    // If reverse geocode failed (empty string) → show manual fallback
    if (!addr) {
      setShowManualInput(true);
      setAddress("");
      onAddressChange?.("", Math.round(dist * 10) / 10);
    } else {
      setAddress(addr);
      setShowManualInput(false);
      onAddressChange?.(addr, Math.round(dist * 10) / 10);
    }

    setDistKm(Math.round(dist * 10) / 10);
    setNearbyPois(pois);

    // Place POI markers
    placePOIMarkers(pois);

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

      {/* Header bar: Address | distance | manual fallback */}
      <div className="absolute top-16 left-4 right-4 z-[1100]">
        {showManualInput && !isLoading ? (
          /* Manual address input fallback — shown when reverse geocoding times out */
          <div className="bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md">
            <p className="text-[10px] text-muted-foreground mb-1.5">
              Address lookup timed out. Type an address manually:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleManualSearch(); }}
                placeholder="e.g. Central, Hong Kong"
                className="flex-1 h-9 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brandBlue/30"
                autoFocus
              />
              <button
                onClick={() => void handleManualSearch()}
                disabled={isSearching || !manualQuery.trim()}
                className="h-9 px-3 rounded-lg bg-brandBlue text-white text-sm font-medium flex items-center gap-1 disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
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
        )}

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
