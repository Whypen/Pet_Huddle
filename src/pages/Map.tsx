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
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
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
import { demoUsers, demoAlerts, demoFriendPins, DemoUser } from "@/lib/demoData";
import { useUpsell } from "@/hooks/useUpsell";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";
import PinningLayer from "@/components/map/PinningLayer";
import BroadcastModal from "@/components/map/BroadcastModal";
import PinDetailModal from "@/components/map/PinDetailModal";

// Mock coordinates for dev fallback (Hong Kong — Tai Wai)
const MOCK_COORDS = { lat: 22.3964, lng: 114.1095 };

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
  thread_id?: string | null;
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
  thread_id?: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

// ==========================================================================
// POI Cache: Read vets + pet shops from poi_locations table (NO live Overpass)
// Harvested monthly via Edge Function + pg_cron
// ==========================================================================

// Format OSM opening_hours abbreviations to readable form
function formatOpeningHours(hours: string): string {
  if (!hours) return "";
  return hours
    .replace(/\bMo\b/g, "Mon")
    .replace(/\bTu\b/g, "Tue")
    .replace(/\bWe\b/g, "Wed")
    .replace(/\bTh\b/g, "Thu")
    .replace(/\bFr\b/g, "Fri")
    .replace(/\bSa\b/g, "Sat")
    .replace(/\bSu\b/g, "Sun")
    .replace(/\bPH\b/g, "Public Holidays");
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

  // Invisible mode — Eye toggle
  const [isInvisible, setIsInvisible] = useState(false);

  // ============================================================
  // PIN PERSISTENCE: Restore pin from localStorage on mount
  // Spec: Pin survives tab switches. If < 12h old, render on load.
  // ============================================================
  useEffect(() => {
    try {
      const stored = localStorage.getItem("huddle_pin");
      if (!stored) return;
      const pin = JSON.parse(stored) as { lat: number; lng: number; expiresAt: string; invisible?: boolean };
      const expiryTime = new Date(pin.expiresAt).getTime();
      const systemExpiry = expiryTime + (10 * 60 * 60 * 1000); // 12h system retention = 2h visible + 10h extra
      if (Date.now() < systemExpiry) {
        console.log("[PIN] Restored pin from localStorage:", pin);
        setUserLocation({ lat: pin.lat, lng: pin.lng });
        setPinExpiresAt(pin.expiresAt);
        setVisibleEnabled(true);
        if (pin.invisible) setIsInvisible(true);
      } else {
        console.log("[PIN] Stored pin expired, clearing");
        localStorage.removeItem("huddle_pin");
      }
    } catch {
      // Corrupted data
      localStorage.removeItem("huddle_pin");
    }
  }, []);

  // Persist pin to localStorage whenever it changes
  useEffect(() => {
    if (userLocation && pinExpiresAt) {
      const pinData = { lat: userLocation.lat, lng: userLocation.lng, expiresAt: pinExpiresAt, invisible: isInvisible };
      localStorage.setItem("huddle_pin", JSON.stringify(pinData));
      console.log("[PIN] Saved pin to localStorage:", pinData);
    }
  }, [userLocation, pinExpiresAt, isInvisible]);

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

  // Pin button re-centers on live GPS when already pinned
  const reCenterOnGPS = useCallback(() => {
    if (!navigator.geolocation || !map.current) return;
    console.log("[PIN] Re-centering on live GPS...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        console.log(`[PIN] Re-center GPS Success: lat=${lat}, lng=${lng}`);
        map.current?.flyTo({ center: [lng, lat], zoom: 14 });
        setUserLocation({ lat, lng });
      },
      () => {
        // Fall back to existing user location
        if (userLocation && map.current) {
          map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [userLocation]);

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

  // ============================================================
  // PHASE 1: Solution-Loop Protocol — GPS High-Accuracy Pin Fix
  // Steps: 1) GPS high-accuracy → 2) Mock fallback → 3) Manual
  // Debug logging at EVERY state transition
  // ============================================================
  const applyPinLocation = useCallback(async (lat: number, lng: number, source: string) => {
    console.log(`[PIN] applyPinLocation — source=${source}, lat=${lat}, lng=${lng}`);
    setUserLocation({ lat, lng });
    const pinExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    setPinExpiresAt(pinExpires);
    console.log("[PIN] Pin State Updated: pinExpiresAt=", pinExpires);

    if (user) {
      console.log("[PIN] Saving to DB — set_user_location RPC...");
      await (supabase as any).from("profiles").update({ map_visible: true }).eq("id", user.id);
      await (supabase as any).rpc("set_user_location", {
        p_lat: lat,
        p_lng: lng,
        p_pin_hours: 2,
        p_retention_hours: 12,
      });
      console.log("[PIN] DB save complete.");
    }

    // Fly to location
    if (map.current) {
      console.log("[PIN] flyTo user location...");
      map.current.flyTo({ center: [lng, lat], zoom: 14 });
    }

    setVisibleEnabled(true);
    setIsInvisible(false);
    setPinning(false);
    console.log(`[PIN] ✅ Pin State Updated: pinned=true, visible=true (via ${source})`);
    toast.success(`Location pinned (${source})`);
  }, [user]);

  const confirmPinLocation = () => {
    setShowPinConfirm(false);
    setPinning(true);
    console.log("[PIN] GPS Request Sent — enableHighAccuracy=true, timeout=5000ms");

    // STEP 1: GPS with High Accuracy
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log(`[PIN] GPS Success: lat=${pos.coords.latitude}, lng=${pos.coords.longitude}, accuracy=${pos.coords.accuracy}m`);
        if (pos.coords.accuracy && pos.coords.accuracy > 500) {
          console.log("[PIN] GPS accuracy too low (>500m). Falling back to mock...");
          toast.warning(t("Location accuracy too low. Using approximate location."));
          // STEP 2: Fall back to mock
          await applyPinLocation(MOCK_COORDS.lat, MOCK_COORDS.lng, "mock-fallback");
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        await applyPinLocation(lat, lng, "GPS");
      },
      async (err) => {
        console.log(`[PIN] GPS Error: code=${err.code}, message=${err.message}`);
        // STEP 2: Mock coordinates fallback
        console.log("[PIN] Applying mock coordinates fallback [22.3964, 114.1095]...");
        toast.info("GPS unavailable — using approximate location. You can refine via Broadcast pin.");
        await applyPinLocation(MOCK_COORDS.lat, MOCK_COORDS.lng, "mock-fallback");
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
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
    setIsInvisible(false);
    localStorage.removeItem("huddle_pin");
    console.log("[PIN] Unpinned — cleared localStorage");
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

  // Invisible mode toggle — Brand Blue eye icon
  const toggleInvisible = async () => {
    if (!user) return;
    const newInvisible = !isInvisible;
    setIsInvisible(newInvisible);
    console.log(`[PIN] Invisible mode toggled: ${newInvisible ? "INVISIBLE" : "VISIBLE"}`);
    await (supabase as any).from("profiles").update({ is_visible: !newInvisible }).eq("id", user.id);
    if (newInvisible) {
      toast.info("You are now invisible on the map");
    } else {
      toast.success("You are now visible on the map");
    }
  };

  // Auto-pin on mount: request geolocation on page load for returning users
  useEffect(() => {
    if (!user || isPinned || visibleEnabled) return;
    // Only prompt once per session
    const prompted = sessionStorage.getItem("geoPrompted");
    if (prompted) return;
    sessionStorage.setItem("geoPrompted", "true");

    if (!navigator.geolocation) return;
    console.log("[PIN] Auto-pin: Requesting geolocation on mount...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log(`[PIN] Auto-pin GPS Success: lat=${pos.coords.latitude}, lng=${pos.coords.longitude}`);
        if (pos.coords.accuracy && pos.coords.accuracy > 500) {
          console.log("[PIN] Auto-pin: accuracy too low, skipping auto-pin");
          return;
        }
        await applyPinLocation(pos.coords.latitude, pos.coords.longitude, "auto-pin");
      },
      (err) => {
        console.log(`[PIN] Auto-pin GPS declined/failed: ${err.message}`);
        // Silent — don't annoy user
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }, [user, isPinned, visibleEnabled, applyPinLocation]);

  // ==========================================================================
  // Fetch: Vet/pet shops from poi_locations cache (NO live Overpass calls)
  // Data is harvested monthly by Edge Function + pg_cron
  // ==========================================================================
  const fetchVetClinics = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("poi_locations")
        .select("id, name, latitude, longitude, phone, opening_hours, address, poi_type, is_active")
        .eq("is_active", true)
        .in("poi_type", ["veterinary", "pet_shop", "pet_grooming"]);
      if (error) throw error;
      const clinics: VetClinic[] = (data || []).map((row: any) => {
        const hours = typeof row.opening_hours === "string" ? row.opening_hours : "";
        const is24h = hours.toLowerCase().includes("24/7") || hours.toLowerCase().includes("24 hours");
        let isOpen: boolean | undefined;
        if (is24h) {
          isOpen = true;
        } else if (hours) {
          const currentHour = new Date().getHours();
          isOpen = currentHour >= 8 && currentHour < 20;
        }
        return {
          id: row.id,
          name: row.name || "Vet / Pet Shop",
          lat: row.latitude,
          lng: row.longitude,
          phone: row.phone || undefined,
          openingHours: hours || undefined,
          address: row.address || undefined,
          rating: undefined,
          isOpen,
          is24h,
          type: row.poi_type,
        };
      });
      setVetClinics(clinics);
    } catch (error) {
      console.error("Error fetching vet/pet-shop from cache:", error);
      // Last resort: demo data
      setVetClinics([
        { id: "vet-1", name: t("map.vet.hk_clinic"), lat: 22.2855, lng: 114.1577, is24h: true, isOpen: true, rating: 4.8, type: "veterinary" },
        { id: "vet-2", name: t("map.vet.central_hospital"), lat: 22.2820, lng: 114.1588, is24h: false, isOpen: false, rating: 4.6, type: "veterinary" },
        { id: "vet-3", name: t("map.vet.wan_chai"), lat: 22.2770, lng: 114.1730, is24h: true, isOpen: true, rating: 4.7, type: "veterinary" },
        { id: "vet-4", name: t("map.vet.kowloon"), lat: 22.3018, lng: 114.1695, is24h: false, isOpen: true, rating: 4.5, type: "pet_shop" },
      ]);
    }
  }, [t]);

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
      // Snap to persisted pin location on map load
      try {
        const storedPin = localStorage.getItem("huddle_pin");
        if (storedPin) {
          const pin = JSON.parse(storedPin);
          if (pin.lat && pin.lng) {
            map.current?.flyTo({ center: [pin.lng, pin.lat], zoom: 14 });
            console.log("[PIN] Map loaded — flyTo persisted pin");
          }
        }
      } catch { /* ignore */ }
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

  // User location marker — Green Name-Initial icon when pinned (matches Friends pin style)
  // Invisible mode: 50% opacity
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;
    const el = document.createElement("div");
    el.className = "user-location-marker";
    const displayName = profile?.display_name || user?.email?.charAt(0) || "Me";
    const initial = typeof displayName === "string" ? displayName.charAt(0).toUpperCase() : "M";
    const opacity = isInvisible ? "0.5" : "1";
    el.innerHTML = `
      <div style="
        width: 48px; height: 48px;
        background-color: #2145CF; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(33,69,207,0.4);
        cursor: pointer;
        opacity: ${opacity};
        transition: opacity 0.3s ease;
      ">
        <div style="
          width: 38px; height: 38px;
          background-color: #A6D539; border-radius: 50%;
          border: 3px solid white;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: bold; color: white;
        ">
          ${initial}
        </div>
      </div>
    `;
    const marker = new mapboxgl.Marker(el)
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
    return () => { marker.remove(); };
  }, [userLocation, mapLoaded, profile?.display_name, user?.email, isInvisible]);

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
      const emoji = vet.type === "veterinary" ? "🏥" : "🛍️";
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
      el.addEventListener("click", () => {
        map.current?.flyTo({ center: [vet.lng, vet.lat], zoom: 14 });
        setSelectedVet(vet);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([vet.lng, vet.lat])
        .addTo(map.current!);
      markersRef.current.push(marker);
    });

    // Friends tab — PRIVACY GATE: unpinned users see NO friend pins
    if (showFriends && isPinned) {
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
          // Zoom snap on friend pin click
          map.current?.flyTo({ center: [friend.lng, friend.lat], zoom: 14 });
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

    // Demo alerts (Event tab) — ALL clickable, open PinDetailModal
    if (showEvent) {
      demoAlerts.forEach((demoAlert: any) => {
        if (!demoAlert.location?.lng && !demoAlert.longitude) return;
        const lng = demoAlert.location?.lng ?? demoAlert.longitude;
        const lat = demoAlert.location?.lat ?? demoAlert.latitude;
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) return;

        const color = alertTypeColors[demoAlert.type] || "#a1a4a9";
        const el = document.createElement("div");
        el.className = "demo-alert-marker";
        const isLost = String(demoAlert.type).toLowerCase() === "lost";
        const isStray = String(demoAlert.type).toLowerCase() === "stray";
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
        // CLICK → flyTo 2km zoom (14) + open PinDetailModal
        el.addEventListener("click", () => {
          // 2km proximity snap
          map.current?.flyTo({ center: [lng, lat], zoom: 14 });
          const demoCreator = demoUsers.find((u) => u.id === demoAlert.creatorId);
          setSelectedAlert({
            id: demoAlert.id,
            latitude: lat,
            longitude: lng,
            alert_type: demoAlert.type,
            title: demoAlert.type === "Others" ? "Community Notice" : `${demoAlert.type} Alert`,
            description: demoAlert.description,
            photo_url: demoAlert.photoUrl || null,
            support_count: demoAlert.supportCount || 0,
            report_count: demoAlert.reportCount || 0,
            created_at: demoAlert.createdAt,
            creator_id: demoAlert.creatorId || null,
            creator: demoCreator ? { display_name: demoCreator.name, avatar_url: demoCreator.avatarUrl || null } : null,
          });
        });
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
          el.addEventListener("click", () => {
            // 2km proximity snap on alert click
            map.current?.flyTo({ center: [alert.longitude, alert.latitude], zoom: 14 });
            setSelectedAlert(alert);
          });
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
          thread_id: row.thread_id || null,
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
            support_count, report_count, created_at, creator_id, thread_id,
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

  // Fetch friend pins — with demo fallback
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
      const dbPins = (Array.isArray(data) ? data : []) as FriendPin[];
      if (dbPins.length > 0) {
        setFriendPins(dbPins);
      } else {
        // Fallback: 10 demo friend pins
        console.log("[Friends] No DB pins — using 10 demo friend pins");
        setFriendPins(demoFriendPins.map((d) => ({
          id: d.id,
          display_name: d.display_name,
          avatar_url: d.avatar_url,
          dob: d.dob,
          relationship_status: d.relationship_status,
          owns_pets: d.owns_pets,
          pet_species: d.pet_species,
          location_name: d.location_name,
          last_lat: d.last_lat,
          last_lng: d.last_lng,
          location_pinned_until: d.location_pinned_until,
        })));
      }
    } catch {
      // Even on error, show demo friend pins
      console.log("[Friends] Error fetching — using demo friend pins");
      setFriendPins(demoFriendPins.map((d) => ({
        id: d.id,
        display_name: d.display_name,
        avatar_url: d.avatar_url,
        dob: d.dob,
        relationship_status: d.relationship_status,
        owns_pets: d.owns_pets,
        pet_species: d.pet_species,
        location_name: d.location_name,
        last_lat: d.last_lat,
        last_lng: d.last_lng,
        location_pinned_until: d.location_pinned_until,
      })));
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

          {/* Right cluster: Invisible Eye toggle + Pin button */}
          <div className="flex items-center gap-2">
            {/* Invisible Eye toggle — only show when pinned */}
            {(isPinned || visibleEnabled) && (
              <button
                onClick={toggleInvisible}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-colors",
                  isInvisible
                    ? "bg-gray-400"
                    : "bg-[#2145CF]"
                )}
                aria-label={isInvisible ? "Invisible (tap to become visible)" : "Visible (tap to go invisible)"}
              >
                {isInvisible ? (
                  <EyeOff className="w-5 h-5 text-white" />
                ) : (
                  <Eye className="w-5 h-5 text-white" />
                )}
              </button>
            )}

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
        </div>

        {/* ================================================================ */}
        {/* SECOND ROW: Refresh pill (LEFT)                                  */}
        {/* ================================================================ */}
        <div className="absolute top-16 left-4 z-[1000]">
          <button
            onClick={() => {
              fetchAlerts();
              fetchVetClinics();
              // Re-center on live GPS or stored user pin
              if (isPinned || visibleEnabled) {
                reCenterOnGPS();
              } else if (userLocation && map.current) {
                map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
              }
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
          {/* Subtext: context-dependent privacy message */}
          {isInvisible && (isPinned || visibleEnabled) && !pinningActive && (
            <p className="text-xs text-right text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5 mb-2">
              You're invisible from map.{pinExpiresAt ? ` Pinned until ${new Date(pinExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}` : ""}
            </p>
          )}
          {mapTab === "Event" && !pinningActive && !visibleEnabled && !isPinned && (
            <p className="text-xs text-center text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5 mb-2">
              Pin location to see accurate events and friends nearby.
            </p>
          )}
          {mapTab === "Friends" && !pinningActive && !isPinned && (
            <p className="text-xs text-center text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5 mb-2">
              Pin your location to see friends nearby.
            </p>
          )}
          {mapTab === "Friends" && !pinningActive && isPinned && isInvisible && (
            <p className="text-xs text-center text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5 mb-2">
              Stay visible to see friends nearby.
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
                  {selectedVet.type === "veterinary" ? "🏥" : "🛍️"}
                </div>
                <div>
                  <h3 className="font-semibold">{selectedVet.name}</h3>
                  <div className="flex items-center gap-2">
                    {selectedVet.type && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                        {selectedVet.type === "pet_shop" ? "Pet Shop" : selectedVet.type === "pet_grooming" ? "Pet Grooming" : "Veterinary"}
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
                {selectedVet.openingHours && <p>{t("Hours")}: {formatOpeningHours(selectedVet.openingHours)}</p>}
                {selectedVet.phone && <p>{t("Phone")}: {selectedVet.phone}</p>}
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  Data sourced from OpenStreetMap. Verification recommended.
                </p>
              </div>

              {/* Spec: Blue "Call" button — HIDDEN when phone is NULL */}
              <div className="flex gap-2">
                {selectedVet.phone && (
                  <Button
                    onClick={() => {
                      window.open(`tel:${selectedVet.phone}`);
                    }}
                    className="flex-1 h-12 rounded-xl bg-brandBlue hover:bg-brandBlue/90 text-white"
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    {t("map.call_now")}
                  </Button>
                )}
                {/* Search Google for more Vets */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const query = encodeURIComponent(`${selectedVet.name} veterinary Hong Kong`);
                    window.open(`https://www.google.com/maps/search/${query}`, "_blank");
                  }}
                  className={cn(
                    "h-12 rounded-xl",
                    selectedVet.phone ? "" : "flex-1"
                  )}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Search Google
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* Friend Profile Modal (demo) — Profile image with overlay          */}
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
              className="w-full bg-card rounded-t-3xl overflow-hidden max-h-[75vh]"
            >
              {/* Profile image with overlay — square shrink-to-fit */}
              <div className="relative w-full aspect-square max-h-[50vh] bg-muted overflow-hidden">
                {selectedFriend.avatarUrl ? (
                  <img
                    src={selectedFriend.avatarUrl}
                    alt={selectedFriend.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#A6D539] to-[#7DA828]">
                    <span className="text-6xl font-bold text-white">{selectedFriend.name.charAt(0)}</span>
                  </div>
                )}
                {/* Close button */}
                <button
                  onClick={() => setSelectedFriend(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                {/* Name, Age, Gender, Owned Pet Species overlay on image */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-4">
                  <h3 className="text-xl font-bold text-white">
                    {selectedFriend.name}, {selectedFriend.age}
                  </h3>
                  <p className="text-sm text-white/80">{selectedFriend.gender}</p>
                  {selectedFriend.pets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedFriend.pets.map((pet) => (
                        <span
                          key={pet.id}
                          className="text-xs bg-white/20 backdrop-blur-sm text-white px-2 py-0.5 rounded-full"
                        >
                          {pet.species === "dog" ? "🐕" : pet.species === "cat" ? "🐱" : "🐾"} {pet.species}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Details below image */}
              <div className="p-5">
                <p className="text-xs text-muted-foreground mb-2">{selectedFriend.locationName}</p>
                <p className="text-sm text-foreground">{selectedFriend.bio}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Pin Modal (real pins from RPC) — UserProfile-style view */}
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
              className="w-full bg-card rounded-t-3xl overflow-hidden max-h-[75vh]"
            >
              {/* Profile header with avatar */}
              <div className="relative w-full h-48 bg-gradient-to-b from-[#A6D539] to-[#7DA828] flex items-center justify-center">
                {selectedFriendPin.avatar_url ? (
                  <img
                    src={selectedFriendPin.avatar_url}
                    alt={selectedFriendPin.display_name || "Friend"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-6xl font-bold text-white">
                    {(selectedFriendPin.display_name || "F").charAt(0).toUpperCase()}
                  </span>
                )}
                <button
                  onClick={() => setSelectedFriendPin(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                  <h3 className="text-xl font-bold text-white">
                    {selectedFriendPin.display_name || "Friend"}
                  </h3>
                  <p className="text-sm text-white/80">
                    {selectedFriendPin.location_name || "Nearby"}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="p-5 space-y-3">
                {selectedFriendPin.relationship_status && (
                  <div className="text-sm text-muted-foreground">
                    Status: {selectedFriendPin.relationship_status}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium mb-1">{t("Pets")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedFriendPin.pet_species || []).length > 0
                      ? (selectedFriendPin.pet_species || []).map((species, i) => (
                          <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                            {species === "dog" ? "🐕" : species === "cat" ? "🐱" : "🐾"} {species}
                          </span>
                        ))
                      : <span className="text-xs text-muted-foreground">{t("No pets listed")}</span>
                    }
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setSelectedFriendPin(null);
                    navigate(`/discover?user=${selectedFriendPin.id}`);
                  }}
                  className="w-full h-11 rounded-xl bg-brandBlue hover:bg-brandBlue/90 text-white mt-2"
                >
                  View Full Profile
                </Button>
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
