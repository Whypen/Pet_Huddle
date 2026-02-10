import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  X,
  Loader2,
  Phone,
  MapPin,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { PremiumFooter } from "@/components/monetization/PremiumFooter";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { demoUsers, demoAlerts, DemoUser } from "@/lib/demoData";
import { useUpsell } from "@/hooks/useUpsell";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";
import PinningLayer from "@/components/map/PinningLayer";
import BroadcastModal from "@/components/map/BroadcastModal";
import PinDetailModal from "@/components/map/PinDetailModal";

// Set the access token
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

// Spec: Stray = yellow paw, Lost = red alert, Others = grey paw, Friends = green
const alertTypeColors: Record<string, string> = {
  Stray: "#EAB308",
  Lost: "#EF4444",
  Found: "#A1A4A9",
  Friends: "#A6D539",
  Others: "#A1A4A9",
  stray: "#EAB308",
  lost: "#EF4444",
  found: "#A1A4A9",
  friends: "#A6D539",
  others: "#A1A4A9",
};

interface MapAlert {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  title: string | null;
  description: string | null;
  photo_url: string | null;
  support_count: number;
  report_count: number;
  created_at: string;
  expires_at?: string | null;
  range_meters?: number | null;
  creator_id?: string | null;
  has_thread?: boolean;
  creator: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface FriendPin {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  dob: string | null;
  relationship_status: string | null;
  owns_pets: boolean | null;
  pet_species: string[] | null;
  location_name: string | null;
  last_lat: number | null;
  last_lng: number | null;
  location_pinned_until: string | null;
}

interface VetClinic {
  id: string;
  name: string;
  lat: number;
  lng: number;
  phone?: string;
  openingHours?: string;
  address?: string;
  rating?: number;
  isOpen?: boolean;
  is24h: boolean;
  type?: string;
}

type MapAlertsNearbyRow = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  title?: string | null;
  description: string | null;
  photo_url: string | null;
  support_count: number | null;
  report_count: number | null;
  created_at: string;
  expires_at: string | null;
  range_meters: number | null;
  creator_id?: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

// ==========================================================================
// Overpass API: Fetch vets + pet shops with opening_hours
// ==========================================================================
async function fetchOverpassVets(lat: number, lng: number): Promise<VetClinic[]> {
  try {
    const radius = 50000; // 50km
    const query = `
      [out:json][timeout:15];
      (
        node["amenity"="veterinary"](around:${radius},${lat},${lng});
        node["shop"="pet"](around:${radius},${lat},${lng});
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

    return data.elements
      .filter((el: any) => el.lat && el.lon)
      .map((el: any) => {
        const tags = el.tags || {};
        const hours = tags.opening_hours || "";
        const isVet = tags.amenity === "veterinary";
        const is24h = hours.toLowerCase().includes("24/7") || hours.toLowerCase().includes("24 hours");
        // Simple open/closed heuristic based on opening_hours string
        let isOpen: boolean | undefined;
        if (is24h) {
          isOpen = true;
        } else if (hours) {
          // Try basic check — if hours exist, mark as open during typical hours
          const currentHour = new Date().getHours();
          isOpen = currentHour >= 8 && currentHour < 20;
        }

        return {
          id: `osm-${el.id}`,
          name: tags.name || (isVet ? "Veterinary Clinic" : "Pet Shop"),
          lat: el.lat,
          lng: el.lon,
          phone: tags.phone || tags["contact:phone"] || undefined,
          openingHours: hours || undefined,
          address: [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean).join(", ") || undefined,
          rating: undefined,
          isOpen,
          is24h,
          type: isVet ? "veterinary" : "pet_shop",
        } as VetClinic;
      });
  } catch (e) {
    console.warn("[Map] Overpass vet fetch failed:", e);
    return [];
  }
}

// ==========================================================================
// Main Map Component
// ==========================================================================
const Map = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showUpsellBanner } = useUpsellBanner();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [mapTab, setMapTab] = useState<"Event" | "Friends">("Event");
  const [visibleEnabled, setVisibleEnabled] = useState(false);
  const [alerts, setAlerts] = useState<MapAlert[]>([]);
  const [friendPins, setFriendPins] = useState<FriendPin[]>([]);
  const [vetClinics, setVetClinics] = useState<VetClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<MapAlert | null>(null);
  const [selectedVet, setSelectedVet] = useState<VetClinic | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<DemoUser | null>(null);
  const [selectedFriendPin, setSelectedFriendPin] = useState<FriendPin | null>(null);
  const [hiddenAlerts, setHiddenAlerts] = useState<Set<string>>(new Set());
  const [pinning, setPinning] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<string | null>(null);
  const [isPremiumFooterOpen, setIsPremiumFooterOpen] = useState(false);
  const [premiumFooterReason, setPremiumFooterReason] = useState<string>("broadcast_alert");
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();

  // Pinning system state
  const [pinningActive, setPinningActive] = useState(false);
  const [pinAddress, setPinAddress] = useState("");
  const [pinDistKm, setPinDistKm] = useState(0);
  const [pinCenter, setPinCenter] = useState<{ lat: number; lng: number } | null>(null);

  // Broadcast modal state
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  // Offline warning
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Styled confirmation modals
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [showUnpinConfirm, setShowUnpinConfirm] = useState(false);

  // Add-on broadcast quota
  const [extraBroadcast72h, setExtraBroadcast72h] = useState<number>(0);

  const profileRec = useMemo(() => {
    if (profile && typeof profile === "object") return profile as unknown as Record<string, unknown>;
    return null;
  }, [profile]);

  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "premium" || effectiveTier === "gold";
  const viewRadiusMeters = 50000;

  const isPinned = useMemo(() => {
    const until = profileRec ? profileRec["location_pinned_until"] : null;
    if (typeof until !== "string") return false;
    return new Date(until).getTime() > Date.now();
  }, [profileRec]);

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Offline banner
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Sync visibility from profile
  useEffect(() => {
    const mv = profileRec ? profileRec["map_visible"] : null;
    setVisibleEnabled(typeof mv === "boolean" ? mv : false);
  }, [profileRec]);

  // Quota snapshot
  const loadQuotaSnapshot = useCallback(async () => {
    if (!user) return;
    const res = await (supabase as any).rpc("get_quota_snapshot");
    if (res.error) return;
    const row = Array.isArray(res.data) ? (res.data[0] as Record<string, unknown> | undefined) : (res.data as Record<string, unknown> | null);
    const d = row && typeof row === "object" ? row : null;
    const b = Number(d ? d["extra_broadcast_72h"] : 0);
    setExtraBroadcast72h(Number.isFinite(b) ? b : 0);
  }, [user]);

  useEffect(() => { void loadQuotaSnapshot(); }, [loadQuotaSnapshot]);

  // URL param: open broadcast mode
  useEffect(() => {
    if (searchParams.get("mode") === "broadcast") {
      setPinningActive(true);
    }
  }, [searchParams]);

  // Default center (Hong Kong)
  const defaultCenter: [number, number] = [114.1583, 22.2828];

  // ==========================================================================
  // Pin / Unpin Location
  // ==========================================================================
  const handlePinMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("Geolocation is not supported on this device"));
      return;
    }
    setShowPinConfirm(true);
  };

  const confirmPinLocation = () => {
    setShowPinConfirm(false);
    setPinning(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (pos.coords.accuracy && pos.coords.accuracy > 500) {
          toast.warning(t("Location accuracy too low. Please retry with better GPS signal."));
          setPinning(false);
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        const pinExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        setPinExpiresAt(pinExpires);
        if (user) {
          await (supabase as any).from("profiles").update({ map_visible: true }).eq("id", user.id);
          await (supabase as any).rpc("set_user_location", {
            p_lat: lat,
            p_lng: lng,
            p_pin_hours: 2,
            p_retention_hours: 12,
          });
        }
        setVisibleEnabled(true);
        setPinning(false);
      },
      () => {
        toast.error(t("Unable to detect current location"));
        setPinning(false);
      }
    );
  };

  const handleUnpinMyLocation = () => {
    if (!user) {
      toast.error(t("Please login to pin location"));
      return;
    }
    setShowUnpinConfirm(true);
  };

  const confirmUnpinLocation = async () => {
    setShowUnpinConfirm(false);
    if (!user) return;
    setPinExpiresAt(null);
    setUserLocation(null);
    const res = await supabase
      .from("profiles")
      .update({
        map_visible: false,
        location_pinned_until: null,
        location_retention_until: null,
        last_lat: null,
        last_lng: null,
        location: null,
        location_geog: null,
      } as Record<string, unknown>)
      .eq("id", user.id);
    if (res.error) {
      toast.error(t("Failed to unpin location"));
      return;
    }
    setVisibleEnabled(false);
    toast.success("Unpinned");
  };

  // Single green button toggle: ON = pinned (green), OFF = grey
  const handlePinToggle = () => {
    if (isPinned || visibleEnabled) {
      handleUnpinMyLocation();
    } else {
      handlePinMyLocation();
    }
  };

  // ==========================================================================
  // Fetch: Overpass vet/pet shops
  // ==========================================================================
  const fetchVetClinics = useCallback(async () => {
    try {
      // Try Overpass API first
      const lat = userLocation?.lat ?? 22.2828;
      const lng = userLocation?.lng ?? 114.1583;
      const overpassClinics = await fetchOverpassVets(lat, lng);

      if (overpassClinics.length > 0) {
        setVetClinics(overpassClinics);
        return;
      }

      // Fallback: poi_locations table
      const { data, error } = await supabase
        .from("poi_locations")
        .select("id, name, latitude, longitude, phone, opening_hours, address, poi_type, is_active")
        .eq("is_active", true)
        .in("poi_type", ["veterinary", "pet_shop"]);
      if (error) throw error;
      const clinics: VetClinic[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name || "Vet / Pet Shop",
        lat: row.latitude,
        lng: row.longitude,
        phone: row.phone || undefined,
        openingHours: row.opening_hours || undefined,
        address: row.address || undefined,
        rating: undefined,
        isOpen: undefined,
        is24h: typeof row.opening_hours === "string" && row.opening_hours.toLowerCase().includes("24"),
        type: row.poi_type,
      }));
      setVetClinics(clinics);
    } catch (error) {
      console.error("Error fetching vet/pet-shop:", error);
      // Last resort: demo data
      setVetClinics([
        { id: "vet-1", name: t("map.vet.hk_clinic"), lat: 22.2855, lng: 114.1577, is24h: true, isOpen: true, rating: 4.8, type: "veterinary" },
        { id: "vet-2", name: t("map.vet.central_hospital"), lat: 22.2820, lng: 114.1588, is24h: false, isOpen: false, rating: 4.6, type: "veterinary" },
        { id: "vet-3", name: t("map.vet.wan_chai"), lat: 22.2770, lng: 114.1730, is24h: true, isOpen: true, rating: 4.7, type: "veterinary" },
        { id: "vet-4", name: t("map.vet.kowloon"), lat: 22.3018, lng: 114.1695, is24h: false, isOpen: true, rating: 4.5, type: "pet_shop" },
      ]);
    }
  }, [t, userLocation?.lat, userLocation?.lng]);

  // ==========================================================================
  // Map Initialization
  // ==========================================================================
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const initialCenter = userLocation ? [userLocation.lng, userLocation.lat] : defaultCenter;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter as [number, number],
      zoom: userLocation ? 14 : 11,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      setTimeout(() => { map.current?.resize(); }, 200);
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => { setTimeout(() => { map.current?.resize(); }, 200); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fly to user location on change
  useEffect(() => {
    if (map.current && userLocation) {
      map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
    }
  }, [userLocation]);

  // Fetch vet clinics on mount
  useEffect(() => { fetchVetClinics(); }, [fetchVetClinics]);

  // Fetch alerts + realtime subscription
  useEffect(() => {
    fetchAlerts();
    const channel = supabase
      .channel("map_alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "map_alerts" }, () => { fetchAlerts(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // User location marker
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;
    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.innerHTML = `
      <div style="
        width: 20px; height: 20px;
        background-color: #2145CF; border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 0 0 4px rgba(37,99,235,0.3), 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
      "></div>
    `;
    const marker = new mapboxgl.Marker(el)
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
    return () => { marker.remove(); };
  }, [userLocation, mapLoaded]);

  // ==========================================================================
  // Update Markers — Vet layer BOTH tabs, alerts Event only, friends Friends only
  // ==========================================================================
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const showEvent = mapTab === "Event";
    const showFriends = mapTab === "Friends";

    // Spec: Vet/Pet-Shop markers — emoji 🏥 (vet) or 🏪 (pet shop) with green/red dot
    vetClinics.forEach((vet) => {
      if (!vet.lng || !vet.lat || isNaN(vet.lng) || isNaN(vet.lat)) return;

      const dotColor = vet.isOpen === true ? "#22c55e" : vet.isOpen === false ? "#ef4444" : "#A1A4A9";
      const emoji = vet.type === "pet_shop" ? "🏪" : "🏥";
      const el = document.createElement("div");
      el.className = "vet-marker";
      el.innerHTML = `
        <div style="
          width: 36px; height: 36px;
          background-color: #ffffff;
          border-radius: 50%;
          border: 2px solid #E5E7EB;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; position: relative;
          font-size: 18px;
        ">
          ${emoji}
          <span style="
            position: absolute; top: -2px; right: -2px;
            width: 10px; height: 10px;
            border-radius: 50%;
            background: ${dotColor};
            border: 2px solid #ffffff;
          "></span>
        </div>
      `;
      el.addEventListener("click", () => setSelectedVet(vet));

      const marker = new mapboxgl.Marker(el)
        .setLngLat([vet.lng, vet.lat])
        .addTo(map.current!);
      markersRef.current.push(marker);
    });

    // Friends tab
    if (showFriends) {
      const pins: Array<{ id: string; name: string; lat: number; lng: number }> = [];
      friendPins.forEach((p) => {
        if (typeof p.last_lng !== "number" || typeof p.last_lat !== "number") return;
        pins.push({ id: p.id, name: p.display_name || "Friend", lat: p.last_lat, lng: p.last_lng });
      });
      if (pins.length === 0) {
        demoUsers.slice(0, 10).forEach((friend) => {
          if (!friend.location?.lng || !friend.location?.lat) return;
          pins.push({ id: friend.id, name: friend.name, lat: friend.location.lat, lng: friend.location.lng });
        });
      }
      pins.forEach((friend) => {
        const el = document.createElement("div");
        el.className = "user-marker";
        el.innerHTML = `
          <div style="
            width: 40px; height: 40px;
            background-color: #A6D539; border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 14px; font-weight: bold; color: white;
          ">
            ${friend.name.charAt(0)}
          </div>
        `;
        el.addEventListener("click", () => {
          const demo = demoUsers.find((d) => d.id === friend.id);
          if (demo) { setSelectedFriend(demo); return; }
          const pin = friendPins.find((p) => p.id === friend.id);
          if (pin) setSelectedFriendPin(pin);
        });
        const marker = new mapboxgl.Marker(el)
          .setLngLat([friend.lng, friend.lat])
          .addTo(map.current!);
        markersRef.current.push(marker);
      });
    }

    // Demo alerts (Event tab)
    if (showEvent) {
      demoAlerts.slice(0, 10).forEach((alert: any) => {
        if (!alert.location?.lng && !alert.longitude) return;
        const lng = alert.location?.lng ?? alert.longitude;
        const lat = alert.location?.lat ?? alert.latitude;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) return;

        const color = alertTypeColors[alert.type] || "#a1a4a9";
        const el = document.createElement("div");
        el.className = "demo-alert-marker";
        const isLost = String(alert.type).toLowerCase() === "lost";
        const isStray = String(alert.type).toLowerCase() === "stray";
        el.innerHTML = `
          <div style="
            width: 36px; height: 36px;
            background-color: ${color}; border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            ${isLost ? "animation: pulse 1.5s ease-in-out infinite;" : ""}
          ">
            <span style="font-size: 16px;">${isLost ? "🚨" : isStray ? "🐾" : "ℹ️"}</span>
          </div>
        `;
        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(map.current!);
        markersRef.current.push(marker);
      });
    }

    // Real alerts from DB (Event tab)
    if (showEvent) {
      alerts
        .filter((a) => !hiddenAlerts.has(a.id))
        .forEach((alert) => {
          if (!alert.longitude || !alert.latitude || isNaN(alert.longitude) || isNaN(alert.latitude)) return;

          const el = document.createElement("div");
          el.className = "custom-marker";
          const color = alertTypeColors[alert.alert_type] || "#a1a4a9";
          const isLost = alert.alert_type === "Lost";
          const isStray = alert.alert_type === "Stray";
          el.innerHTML = `
            <div style="
              width: 36px; height: 36px;
              background-color: ${color}; border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              display: flex; align-items: center; justify-content: center;
              cursor: pointer;
              ${isLost ? "animation: pulse 1.5s ease-in-out infinite;" : ""}
            ">
              <span style="font-size: 16px;">${isLost ? "🚨" : isStray ? "🐾" : "ℹ️"}</span>
            </div>
          `;
          el.addEventListener("click", () => setSelectedAlert(alert));
          const marker = new mapboxgl.Marker(el)
            .setLngLat([alert.longitude, alert.latitude])
            .addTo(map.current!);
          markersRef.current.push(marker);
        });
    }
  }, [alerts, friendPins, hiddenAlerts, mapLoaded, mapTab, vetClinics]);

  // ==========================================================================
  // Fetch alerts
  // ==========================================================================
  const fetchAlerts = async () => {
    try {
      const lat = userLocation?.lat ?? (profile?.last_lat ?? null);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? null);
      if (lat != null && lng != null) {
        const { data, error } = await (supabase as any).rpc("get_map_alerts_nearby", {
          p_lat: lat,
          p_lng: lng,
          p_radius_m: viewRadiusMeters,
        });
        if (error) throw error;
        const mapped = (Array.isArray(data) ? (data as MapAlertsNearbyRow[]) : []).map((row) => ({
          id: row.id,
          latitude: row.latitude,
          longitude: row.longitude,
          alert_type: row.alert_type,
          title: row.title || null,
          description: row.description,
          photo_url: row.photo_url,
          support_count: row.support_count ?? 0,
          report_count: row.report_count ?? 0,
          created_at: row.created_at,
          creator_id: row.creator_id || null,
          creator: { display_name: row.creator_display_name, avatar_url: row.creator_avatar_url },
          expires_at: row.expires_at,
          range_meters: row.range_meters,
        }));
        setAlerts(mapped);
      } else {
        const { data, error } = await supabase
          .from("map_alerts")
          .select(`
            id, latitude, longitude, alert_type, title, description, photo_url,
            support_count, report_count, created_at, creator_id,
            creator:profiles!map_alerts_creator_id_fkey(display_name, avatar_url)
          `)
          .eq("is_active", true)
          .lt("report_count", 10)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        setAlerts(data || []);
      }
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch friend pins
  const fetchFriendPins = async () => {
    try {
      if (!user || !visibleEnabled) { setFriendPins([]); return; }
      const lat = userLocation?.lat ?? (profile?.last_lat ?? null);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? null);
      if (lat == null || lng == null) return;
      const { data, error } = await (supabase as any).rpc("get_friend_pins_nearby", {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: viewRadiusMeters,
      });
      if (error) throw error;
      setFriendPins((Array.isArray(data) ? data : []) as FriendPin[]);
    } catch {
      setFriendPins([]);
    }
  };

  useEffect(() => {
    if (mapTab !== "Friends") return;
    void fetchFriendPins();
  }, [mapTab, visibleEnabled, userLocation?.lat, userLocation?.lng]);

  // Reset on mount
  useEffect(() => {
    setAlerts([]);
    setVetClinics([]);
    setHiddenAlerts(new Set());
    setSelectedAlert(null);
    setSelectedVet(null);
    setLoading(true);
  }, []);

  // ==========================================================================
  // Broadcast: open modal with pinning-derived location
  // ==========================================================================
  const openBroadcast = () => {
    if (!pinningActive) {
      // Activate pinning first
      setPinningActive(true);
      toast.info("Move the map to select your broadcast location, then tap Broadcast");
      return;
    }
    // Pinning is active → open broadcast modal with center coords
    if (pinCenter) {
      setIsBroadcastOpen(true);
    } else {
      toast.info("Move the map to select a location first");
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {/* Map takes full remaining height */}
      <div className="flex-1 relative min-h-0">
        {loading && !mapLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : null}

        <div ref={mapContainer} className="h-full w-full" />

        {/* Spec: Offline warning banner */}
        {isOffline && (
          <div className="absolute top-0 left-0 right-0 z-[1100] bg-red-500 text-white text-center text-xs py-2 flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            You are offline. Map data may be outdated.
          </div>
        )}

        {/* ================================================================ */}
        {/* TOP ROW: Tabs (left) + Single green pin button (right)           */}
        {/* ================================================================ */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-full p-1 shadow-md">
            {(["Event", "Friends"] as const).map((tab) => {
              const active = mapTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === "Friends" && !visibleEnabled) {
                      toast.info("Turn on Visible to see friends nearby.");
                      return;
                    }
                    setMapTab(tab);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-bold transition-colors",
                    active ? "bg-brandBlue text-white shadow-sm" : "text-brandText/70 hover:text-brandText"
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Spec: Single green pin button — white pin icon ON / grey OFF */}
          <button
            onClick={handlePinToggle}
            disabled={pinning}
            className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-colors",
              isPinned || visibleEnabled
                ? "bg-[#A6D539]"
                : "bg-white/80 backdrop-blur-sm"
            )}
            aria-label={isPinned ? "Pinned (tap to unpin)" : "Pin my location"}
          >
            {pinning ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            ) : (
              <MapPin
                className={cn(
                  "w-5 h-5",
                  isPinned || visibleEnabled ? "text-white" : "text-gray-400"
                )}
              />
            )}
          </button>
        </div>

        {/* ================================================================ */}
        {/* SECOND ROW: Refresh pill (LEFT)                                  */}
        {/* ================================================================ */}
        <div className="absolute top-16 left-4 z-[1000]">
          <button
            onClick={() => {
              fetchAlerts();
              fetchVetClinics();
              toast.success("Map refreshed");
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500/80 backdrop-blur-sm text-white text-xs font-medium rounded-full shadow-md hover:bg-gray-600/80 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Pinned until info — right side */}
        {pinExpiresAt && (
          <div className="absolute top-16 right-4 z-[1000]">
            <span className="text-xs bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm text-muted-foreground">
              Pinned until {new Date(pinExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}

        {/* ================================================================ */}
        {/* PinningLayer — center-anchor pin + reverse geocoding + Overpass   */}
        {/* ================================================================ */}
        <PinningLayer
          map={map.current}
          mapLoaded={mapLoaded}
          userLocation={userLocation}
          isActive={pinningActive}
          onAddressChange={(addr, dist) => {
            setPinAddress(addr);
            setPinDistKm(dist);
          }}
          onCenterChange={(lat, lng) => {
            setPinCenter({ lat, lng });
          }}
        />

        {/* ================================================================ */}
        {/* BOTTOM: Subtext + Broadcast CTA                                  */}
        {/* ================================================================ */}
        <div className="absolute bottom-4 left-4 right-4 z-[1000]">
          {/* Spec: Subtext "Stay visible or pin your location..." — Event tab ONLY */}
          {mapTab === "Event" && !pinningActive && (
            <p className="text-xs text-center text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5 mb-2">
              Stay visible or pin your location to see the nearby events
            </p>
          )}

          {/* Broadcast button — opens pinning mode then broadcast modal */}
          {!pinningActive ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={openBroadcast}
              className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 shadow-elevated flex items-center justify-center gap-2 font-semibold"
            >
              <AlertTriangle className="w-5 h-5" />
              {t("map.broadcast")}
            </motion.button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPinningActive(false);
                  setPinCenter(null);
                }}
                className="flex-1 h-12 rounded-xl bg-white/90"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (pinCenter) {
                    setIsBroadcastOpen(true);
                  } else {
                    toast.info("Move the map to select a location");
                  }
                }}
                className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Broadcast Here
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* BroadcastModal — full-screen creation with tier gating            */}
      {/* ================================================================ */}
      <BroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => {
          setIsBroadcastOpen(false);
          setPinningActive(false);
          setPinCenter(null);
        }}
        selectedLocation={pinCenter}
        address={pinAddress}
        onSuccess={() => {
          fetchAlerts();
          setPinningActive(false);
          setPinCenter(null);
        }}
        extraBroadcast72h={extraBroadcast72h}
        onQuotaRefresh={loadQuotaSnapshot}
      />

      {/* ================================================================ */}
      {/* PinDetailModal — Viewer POV + Abuse Shield                       */}
      {/* ================================================================ */}
      <PinDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onHide={(id) => {
          setHiddenAlerts((prev) => new Set([...prev, id]));
          toast.success("Alert hidden");
        }}
        onRefresh={fetchAlerts}
      />

      {/* ================================================================ */}
      {/* Pin confirmation modal                                            */}
      {/* ================================================================ */}
      <AnimatePresence>
        {showPinConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center px-6"
            onClick={() => setShowPinConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-elevated"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brandBlue/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-brandBlue" />
                </div>
                <h3 className="text-lg font-bold text-brandText">Pin My Location</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                We use your location for maps and broadcast alerts only. Your pin is visible for 2 hours and retained for 12 hours to deliver alerts. Continue?
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowPinConfirm(false)}
                  className="flex-1 h-11 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmPinLocation}
                  className="flex-1 h-11 rounded-xl bg-brandBlue hover:bg-brandBlue/90"
                >
                  Continue
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unpin confirmation modal */}
      <AnimatePresence>
        {showUnpinConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center px-6"
            onClick={() => setShowUnpinConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-elevated"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-brandText">Unpin Location</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Unpin my location? This will immediately stop showing you on the Friends map tab.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowUnpinConfirm(false)}
                  className="flex-1 h-11 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void confirmUnpinLocation()}
                  className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white"
                >
                  Unpin
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* Vet/Pet Shop Bottom Sheet                                        */}
      {/* ================================================================ */}
      <AnimatePresence>
        {selectedVet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/50 flex items-end"
            onClick={() => setSelectedVet(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-card rounded-t-3xl p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-2xl">
                  {selectedVet.type === "pet_shop" ? "🏪" : "🏥"}
                </div>
                <div>
                  <h3 className="font-semibold">{selectedVet.name}</h3>
                  <div className="flex items-center gap-2">
                    {selectedVet.type && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                        {selectedVet.type === "pet_shop" ? "Pet Shop" : "Veterinary"}
                      </span>
                    )}
                    {selectedVet.isOpen !== undefined && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        selectedVet.isOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {selectedVet.isOpen ? t("Open") : t("Closed")}
                      </span>
                    )}
                    {selectedVet.is24h && (
                      <span className="text-xs bg-[#A6D539] text-white px-2 py-0.5 rounded-full">
                        {t("map.24h")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground mb-4">
                {selectedVet.address && <p>{selectedVet.address}</p>}
                {selectedVet.openingHours && <p>{t("Hours")}: {selectedVet.openingHours}</p>}
                {selectedVet.phone && <p>{t("Phone")}: {selectedVet.phone}</p>}
                <p>{t("Timely reflection of any changes of operations of the Vet Clinic is not guaranteed")}</p>
              </div>

              {/* Spec: Blue "Call" button */}
              <Button
                onClick={() => {
                  if (selectedVet.phone) {
                    window.open(`tel:${selectedVet.phone}`);
                  } else {
                    toast.info(t("Phone number not available"));
                  }
                }}
                className="w-full h-12 rounded-xl bg-brandBlue hover:bg-brandBlue/90 text-white"
              >
                <Phone className="w-5 h-5 mr-2" />
                {t("map.call_now")}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* Friend Profile Modal (demo)                                      */}
      {/* ================================================================ */}
      <AnimatePresence>
        {selectedFriend && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2100] bg-black/50 flex items-end"
            onClick={() => setSelectedFriend(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-card rounded-t-3xl p-6 max-h-[70vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{selectedFriend.name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedFriend.locationName}</p>
                </div>
                <button onClick={() => setSelectedFriend(null)}>
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="text-sm text-muted-foreground mb-3">{selectedFriend.bio}</div>
              <div className="text-sm font-medium mb-1">{t("Pets")}</div>
              <div className="text-xs text-muted-foreground">
                {(selectedFriend.pets || []).length > 0
                  ? selectedFriend.pets.map((pet) => `${pet.name} (${pet.species})`).join(", ")
                  : t("No pets listed")}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Pin Modal (real pins from RPC) */}
      <AnimatePresence>
        {selectedFriendPin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2100] bg-black/50 flex items-end"
            onClick={() => setSelectedFriendPin(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-card rounded-t-3xl p-6 max-h-[70vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-brandText">
                    {selectedFriendPin.display_name || "Friend"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedFriendPin.location_name || "Nearby"}
                  </p>
                </div>
                <button onClick={() => setSelectedFriendPin(null)} aria-label="Close">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="text-sm text-muted-foreground mb-3">
                {selectedFriendPin.relationship_status ? `Status: ${selectedFriendPin.relationship_status}` : " "}
              </div>
              <div className="text-sm font-medium mb-1">{t("Pets")}</div>
              <div className="text-xs text-muted-foreground">
                {(selectedFriendPin.pet_species || []).length > 0
                  ? (selectedFriendPin.pet_species || []).join(", ")
                  : t("No pets listed")}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .mapboxgl-ctrl-bottom-left,
        .mapboxgl-ctrl-bottom-right {
          bottom: 80px !important;
        }
      `}</style>

      <PremiumFooter
        isOpen={isPremiumFooterOpen}
        onClose={() => setIsPremiumFooterOpen(false)}
        triggerReason={premiumFooterReason}
      />
      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />
    </div>
  );
};

export default Map;
