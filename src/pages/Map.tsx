import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AlertTriangle, 
  X,
  ThumbsUp,
  Flag,
  EyeOff,
  Ban,
  Loader2,
  Camera,
  Phone,
  Hospital,
  MapPin,
  Star
} from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import imageCompression from "browser-image-compression";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { PremiumFooter } from "@/components/monetization/PremiumFooter";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { demoUsers, demoAlerts, DemoUser, DemoAlert } from "@/lib/demoData";
import { useUpsell } from "@/hooks/useUpsell";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";

// Set the access token
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

const alertTypeColors: Record<string, string> = {
  Stray: "#2145CF",
  Lost: "#EF4444",
  Found: "#A1A4A9",
  Friends: "#A6D539",
  Others: "#A1A4A9",
  stray: "#2145CF",
  lost: "#EF4444",
  found: "#A1A4A9",
  friends: "#A6D539",
  others: "#A1A4A9",
};

const MAX_ALERT_WORDS = 20;

interface MapAlert {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  description: string | null;
  photo_url: string | null;
  support_count: number;
  report_count: number;
  created_at: string;
  expires_at?: string | null;
  range_meters?: number | null;
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
}

type MapAlertsNearbyRow = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  description: string | null;
  photo_url: string | null;
  support_count: number | null;
  report_count: number | null;
  created_at: string;
  expires_at: string | null;
  range_meters: number | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

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
  const [activeFilter, setActiveFilter] = useState("all");
  const [alerts, setAlerts] = useState<MapAlert[]>([]);
  const [friendPins, setFriendPins] = useState<FriendPin[]>([]);
  const [vetClinics, setVetClinics] = useState<VetClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [alertType, setAlertType] = useState("Stray");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<MapAlert | null>(null);
  const [selectedVet, setSelectedVet] = useState<VetClinic | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<DemoUser | null>(null);
  const [selectedFriendPin, setSelectedFriendPin] = useState<FriendPin | null>(null);
  const [hiddenAlerts, setHiddenAlerts] = useState<Set<string>>(new Set());
  const [pinning, setPinning] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [showConfirmRemove, setShowConfirmRemove] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [userLocationAccuracy, setUserLocationAccuracy] = useState<number | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<string | null>(null);
  const [retentionExpiresAt, setRetentionExpiresAt] = useState<string | null>(null);
  const [isPremiumFooterOpen, setIsPremiumFooterOpen] = useState(false);
  const [premiumFooterReason, setPremiumFooterReason] = useState<string>("broadcast_alert");
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();

  const profileRec = useMemo(() => {
    if (profile && typeof profile === "object") return profile as Record<string, unknown>;
    return null;
  }, [profile]);

  // Contract: broadcast creation dropdown gates (base vs add-on extended).
  const [selectedRangeKm, setSelectedRangeKm] = useState<number | null>(null);
  const [selectedDurationH, setSelectedDurationH] = useState<number | null>(null);
  const [postOnThreads, setPostOnThreads] = useState(false);
  const [extraBroadcast72h, setExtraBroadcast72h] = useState<number>(0);

  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "premium" || effectiveTier === "gold";
  // v1.9 override: Broadcast radius (km): Free 2, Premium 10, Gold 20.
  const broadcastRange = effectiveTier === "gold" ? 20 : isPremium ? 10 : 2;
  const viewRadiusMeters = 50000; // Contract: Map view limited to 50km

  useEffect(() => {
    const mv = profileRec ? profileRec["map_visible"] : null;
    setVisibleEnabled(typeof mv === "boolean" ? mv : false);
  }, [profileRec]);

  const isPinned = useMemo(() => {
    const until = profileRec ? profileRec["location_pinned_until"] : null;
    if (typeof until !== "string") return false;
    return new Date(until).getTime() > Date.now();
  }, [profileRec]);

  const loadQuotaSnapshot = useCallback(async () => {
    if (!user) return;
    const res = await supabase.rpc("get_quota_snapshot");
    if (res.error) return;
    const row =
      Array.isArray(res.data) ? (res.data[0] as Record<string, unknown> | undefined) : (res.data as Record<string, unknown> | null);
    const d = row && typeof row === "object" ? row : null;
    const b = Number(d ? d["extra_broadcast_72h"] : 0);
    setExtraBroadcast72h(Number.isFinite(b) ? b : 0);
  }, [user]);

  useEffect(() => {
    void loadQuotaSnapshot();
  }, [loadQuotaSnapshot]);

  useEffect(() => {
    if (searchParams.get("mode") === "broadcast") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  // Default center (Hong Kong)
  const defaultCenter: [number, number] = [114.1583, 22.2828];

  const filterChips = [
    { id: "all", label: t("map.filter_all") },
    { id: "Stray", label: t("map.filter_stray") },
    { id: "Lost", label: t("map.filter_lost") },
    { id: "Friends", label: t("map.filter_friends") },
    { id: "Others", label: t("map.filter_others") },
  ];

  const handlePinMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("Geolocation is not supported on this device"));
      return;
    }
    // Legal: explicit consent for location use on maps/alerts only (data minimization).
    const ok = window.confirm(
      "We use your location for maps and broadcast alerts only. Your pin is visible for 2 hours and retained for 12 hours to deliver alerts. Continue?"
    );
    if (!ok) return;
    setPinning(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setUserLocationAccuracy(pos.coords.accuracy);
        if (pos.coords.accuracy && pos.coords.accuracy > 500) {
          toast.warning(t("Location accuracy too low. Please retry with better GPS signal."));
          setPinning(false);
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });
        const pinExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const retentionExpires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        setPinExpiresAt(pinExpires);
        setRetentionExpiresAt(retentionExpires);
        if (user) {
          // Contract: visible toggle implies consent for friend visibility while pinned.
          await supabase.from("profiles").update({ map_visible: true }).eq("id", user.id);
          await supabase.rpc("set_user_location", {
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

  const handleUnpinMyLocation = async () => {
    if (!user) {
      toast.error(t("Please login to pin location"));
      return;
    }
    const ok = window.confirm("Unpin my location? This will immediately stop showing you on the Friends map tab.");
    if (!ok) return;
    setPinExpiresAt(null);
    setRetentionExpiresAt(null);
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

  const toggleVisible = async () => {
    if (!user) {
      toast.error(t("Please login to enable visibility"));
      return;
    }
    if (!visibleEnabled) {
      // Turning on visibility: we pin now to match the contract behavior on web.
      handlePinMyLocation();
      return;
    }
    await handleUnpinMyLocation();
  };

  const handleManualPin = async () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error(t("Invalid coordinates"));
      return;
    }
    setUserLocation({ lat, lng });
    const pinExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const retentionExpires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    setPinExpiresAt(pinExpires);
    setRetentionExpiresAt(retentionExpires);
    if (user) {
      await supabase.from("profiles").update({ map_visible: true }).eq("id", user.id);
      await supabase.rpc("set_user_location", {
        p_lat: lat,
        p_lng: lng,
        p_pin_hours: 2,
        p_retention_hours: 12,
      });
    }
    setVisibleEnabled(true);
  };

  // Fetch HK Vet Clinics from Google Places (via Edge Function)
  const fetchVetClinics = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("vet-clinics");
      if (error) throw error;
      const clinics: VetClinic[] = (data?.clinics || []).map((clinic: {
        id: string;
        name: string;
        lat: number;
        lng: number;
        phone?: string;
        openingHours?: string;
        address?: string;
        rating?: number;
        isOpen?: boolean;
      }) => ({
        id: clinic.id,
        name: clinic.name,
        lat: clinic.lat,
        lng: clinic.lng,
        phone: clinic.phone,
        openingHours: clinic.openingHours,
        address: clinic.address,
        rating: clinic.rating,
        isOpen: clinic.isOpen,
        is24h: clinic.openingHours?.toLowerCase?.().includes("24") || false,
      }));
      setVetClinics(clinics);
    } catch (error) {
      console.error("Error fetching vet clinics:", error);
      // Fallback demo data
      setVetClinics([
        { id: "vet-1", name: t("map.vet.hk_clinic"), lat: 22.2855, lng: 114.1577, is24h: true, isOpen: true, rating: 4.8 },
        { id: "vet-2", name: t("map.vet.central_hospital"), lat: 22.2820, lng: 114.1588, is24h: false, isOpen: false, rating: 4.6 },
        { id: "vet-3", name: t("map.vet.wan_chai"), lat: 22.2770, lng: 114.1730, is24h: true, isOpen: true, rating: 4.7 },
        { id: "vet-4", name: t("map.vet.kowloon"), lat: 22.3018, lng: 114.1695, is24h: false, isOpen: true, rating: 4.5 },
      ]);
    }
  }, [t]);

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const initialCenter = userLocation ? [userLocation.lng, userLocation.lat] : defaultCenter;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: userLocation ? 14 : 11,
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      setTimeout(() => {
        map.current?.resize();
      }, 200);
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    map.current.on("click", (e) => {
      if (isCreateOpen) {
        setSelectedLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        map.current?.resize();
      }, 200);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (map.current && userLocation) {
      map.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
    }
  }, [userLocation]);

  // Fetch vet clinics on mount
  useEffect(() => {
    fetchVetClinics();
  }, [fetchVetClinics]);

  // Fetch alerts
  useEffect(() => {
    fetchAlerts();
    
    const channel = supabase
      .channel("map_alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "map_alerts" }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Place a blue "You are here" pin for the user's own location + persist coords
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation) return;

    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.innerHTML = `
      <div style="
        width: 20px;
        height: 20px;
        background-color: #2145CF;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 0 0 4px rgba(37,99,235,0.3), 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
      "></div>
    `;

    const marker = new mapboxgl.Marker(el)
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);

    return () => marker.remove();
  }, [userLocation, mapLoaded, user]);

  // Update markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Contract: Tabs. Event shows vets + alerts. Friends shows user pins only.
    const showEvent = mapTab === "Event";
    const showFriends = mapTab === "Friends";

    // Add vet clinic markers (Event tab only)
    if (showEvent && activeFilter === "all") {
      vetClinics.forEach((vet) => {
        // SPRINT 1: Null-check for lng/lat to prevent crash
        if (!vet.lng || !vet.lat || isNaN(vet.lng) || isNaN(vet.lat)) {
          console.warn("Invalid vet coordinates:", vet);
          return;
        }

        const dotColor = vet.isOpen === true ? "#22c55e" : vet.isOpen === false ? "#ef4444" : "#A1A4A9";
        const el = document.createElement("div");
        el.className = "vet-marker";
        el.innerHTML = `
          <div style="
            width: 34px;
            height: 34px;
            background-color: #ffffff;
            border-radius: 50%;
            border: 2px solid #E5E7EB;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            position: relative;
            font-weight: bold;
            color: #111827;
          ">
            +
            <span style="
              position: absolute;
              top: -2px;
              right: -2px;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: ${dotColor};
              border: 1px solid #ffffff;
            "></span>
          </div>
        `;
        el.addEventListener("click", () => setSelectedVet(vet));

        const marker = new mapboxgl.Marker(el)
          .setLngLat([vet.lng, vet.lat])
          .addTo(map.current!);
        markersRef.current.push(marker);
      });
    }

    // Add friend pins (Friends tab only). Fallback to demo users if none (contract: demo pins).
    if (showFriends) {
      const pins: Array<{ id: string; name: string; lat: number; lng: number }> = [];
      friendPins.forEach((p) => {
        if (typeof p.last_lng !== "number" || typeof p.last_lat !== "number") return;
        pins.push({ id: p.id, name: p.display_name || "Friend", lat: p.last_lat, lng: p.last_lng });
      });
      if (pins.length === 0) {
        demoUsers.slice(0, 10).forEach((friend) => {
          if (!friend.location?.lng || !friend.location?.lat ||
              isNaN(friend.location.lng) || isNaN(friend.location.lat)) {
            return;
          }
          pins.push({ id: friend.id, name: friend.name, lat: friend.location.lat, lng: friend.location.lng });
        });
      }

      pins.forEach((friend) => {
        const el = document.createElement("div");
        el.className = "user-marker";
        el.innerHTML = `
          <div style="
            width: 40px;
            height: 40px;
            background-color: #A6D539;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            color: white;
          ">
            ${friend.name.charAt(0)}
          </div>
        `;

        el.addEventListener("click", () => {
          const demo = demoUsers.find((d) => d.id === friend.id);
          if (demo) {
            setSelectedFriend(demo);
            return;
          }
          const pin = friendPins.find((p) => p.id === friend.id);
          if (pin) setSelectedFriendPin(pin);
        });

        const marker = new mapboxgl.Marker(el)
          .setLngLat([friend.lng, friend.lat])
          .addTo(map.current!);
        markersRef.current.push(marker);
      });
    }

    // Add demo alert markers (Event tab only, contract: demo pins).
    if (showEvent) {
      const filteredDemoAlerts = demoAlerts.filter((alert) => {
        if (activeFilter === "all") return true;
        return alert.type.toLowerCase() === activeFilter.toLowerCase();
      });

      filteredDemoAlerts.slice(0, 10).forEach((alert) => {
        // SPRINT 1: Null-check for alert location coordinates
        if (!alert.location?.lng || !alert.location?.lat ||
            isNaN(alert.location.lng) || isNaN(alert.location.lat)) {
          return;
        }

        const color = alertTypeColors[alert.type] || "#a1a4a9";
        const el = document.createElement("div");
        el.className = "demo-alert-marker";
        el.innerHTML = `
          <div style="
            width: 36px;
            height: 36px;
            background-color: ${color};
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            ${alert.type === "lost" ? "animation: pulse 1.5s ease-in-out infinite;" : ""}
          ">
            <span style="font-size: 16px;">${alert.type === "lost" ? "🚨" : alert.type === "stray" ? "🐾" : "ℹ️"}</span>
          </div>
        `;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([alert.location.lng, alert.location.lat])
          .addTo(map.current!);
        markersRef.current.push(marker);
      });
    }

    // Add real alerts from database
    const filteredAlerts = showEvent
      ? alerts.filter((alert) => {
          if (hiddenAlerts.has(alert.id)) return false;
          if (activeFilter === "all") return true;
          return alert.alert_type === activeFilter;
        })
      : [];

    filteredAlerts.forEach((alert) => {
      // SPRINT 1: Critical null-check for database alert coordinates
      if (!alert.longitude || !alert.latitude ||
          isNaN(alert.longitude) || isNaN(alert.latitude)) {
        console.warn("Invalid database alert coordinates:", alert);
        return;
      }

      const el = document.createElement("div");
      el.className = "custom-marker";
      el.innerHTML = `
        <div style="
          width: 36px;
          height: 36px;
          background-color: ${alertTypeColors[alert.alert_type] || "#a1a4a9"};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          ${alert.alert_type === "Lost" ? "animation: pulse 1.5s ease-in-out infinite;" : ""}
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            ${alert.alert_type === "Stray" ? '<path d="M4.5 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm15 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-4.5 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-6 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm3 3c-2.76 0-5 2.24-5 5v3h10v-3c0-2.76-2.24-5-5-5z"/>' : ""}
            ${alert.alert_type === "Lost" ? '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>' : ""}
            ${alert.alert_type === "Found" ? '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>' : ""}
          </svg>
        </div>
      `;

      el.addEventListener("click", () => {
        setSelectedAlert(alert);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([alert.longitude, alert.latitude])
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [alerts, activeFilter, friendPins, hiddenAlerts, mapLoaded, mapTab, vetClinics]);

  const fetchAlerts = async () => {
    try {
      const lat = userLocation?.lat ?? (profile?.last_lat ?? null);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? null);
      if (lat != null && lng != null) {
        const { data, error } = await supabase.rpc("get_map_alerts_nearby", {
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
          description: row.description,
          photo_url: row.photo_url,
          support_count: row.support_count ?? 0,
          report_count: row.report_count ?? 0,
          created_at: row.created_at,
          creator: { display_name: row.creator_display_name, avatar_url: row.creator_avatar_url },
          expires_at: row.expires_at,
          range_meters: row.range_meters,
        }));
        setAlerts(mapped);
      } else {
        // Fallback: no user location yet
        const { data, error } = await supabase
          .from("map_alerts")
          .select(`
            id, latitude, longitude, alert_type, description, photo_url,
            support_count, report_count, created_at,
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

  const fetchFriendPins = async () => {
    try {
      if (!user) {
        setFriendPins([]);
        return;
      }
      if (!visibleEnabled) {
        setFriendPins([]);
        return;
      }
      const lat = userLocation?.lat ?? (profile?.last_lat ?? null);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? null);
      if (lat == null || lng == null) return;
      const { data, error } = await supabase.rpc("get_friend_pins_nearby", {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: viewRadiusMeters,
      });
      if (error) throw error;
      setFriendPins((Array.isArray(data) ? data : []) as FriendPin[]);
    } catch (e) {
      console.warn("[Map] fetchFriendPins failed", e);
      setFriendPins([]);
    }
  };

  useEffect(() => {
    if (mapTab !== "Friends") return;
    void fetchFriendPins();
  }, [mapTab, visibleEnabled, userLocation?.lat, userLocation?.lng, profile?.last_lat, profile?.last_lng]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAlert = async () => {
    if (!user || !selectedLocation) {
      toast.error(t("Please select a location on the map"));
      return;
    }

    setCreating(true);

    try {
      let photoUrl = null;

      if (imageFile) {
        // v1.9 override: broadcast media deducts from Media quota (Free=0, Premium=10/day, Gold=50/day).
        const q = await supabase.rpc("check_and_increment_quota", { action_type: "media" });
        if (q.data !== true) {
          showUpsellBanner({
            message: "Limited. Upgrade or add +10 Media to continue uploading images today.",
            ctaLabel: "Go to Premium",
            onCta: () => {
              sessionStorage.setItem("pending_addon", "media");
              navigate("/premium");
            },
          });
          return;
        }

        // Client-side compression (<500KB target) to reduce storage + bandwidth.
        const compressed = await imageCompression(imageFile, { maxSizeMB: 0.5, useWebWorker: true });
        const uploadFile = compressed instanceof File ? compressed : imageFile;
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("alerts")
          .upload(fileName, uploadFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("alerts")
          .getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      const rangeKm = selectedRangeKm ?? broadcastRange;
      const durH = selectedDurationH ?? (effectiveTier === "gold" ? 48 : isPremium ? 24 : 12);
      const expiresAt = new Date(Date.now() + durH * 60 * 60 * 1000).toISOString();

      const { data: inserted, error } = await supabase
        .from("map_alerts")
        .insert({
        creator_id: user.id,
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
        alert_type: alertType,
        description: description.trim() || null,
        photo_url: photoUrl,
        range_meters: Math.round(rangeKm * 1000),
        expires_at: expiresAt,
      })
        .select("id")
        .maybeSingle();

      if (error) {
        const errObj = (typeof error === "object" && error !== null) ? (error as Record<string, unknown>) : null;
        const msg = typeof (errObj?.message) === "string" ? (errObj.message as string) : "";
        if (msg.includes("quota_exceeded")) {
          showUpsellBanner({
            message: "Limited. You have reached your Broadcast limit for this week.",
            ctaLabel: "Go to Premium",
            onCta: () => {
              sessionStorage.setItem("pending_addon", "emergency_alert");
              navigate("/premium");
            },
          });
          return;
        }
        throw error;
      }

      toast.success(t("Alert broadcasted!"));

      // Contract: optional "Post on Threads" (best-effort).
      if (postOnThreads) {
        const quota = await supabase.rpc("check_and_increment_quota", { action_type: "thread_post" });
        if (quota.data === true) {
          await supabase.from("threads").insert({
            user_id: user.id,
            title: `Broadcast (${alertType})`,
            content: description.trim() || "",
            tags: ["News"],
            hashtags: [],
            images: photoUrl ? [photoUrl] : [],
          });
        } else {
          toast.info("Thread post limit reached. Your broadcast is still live.");
        }
      }

      resetCreateForm();
      fetchAlerts();
      void loadQuotaSnapshot();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || t("map.create_alert_failed"));
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setIsCreateOpen(false);
    setSelectedLocation(null);
    setAlertType("Stray");
    setDescription("");
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSupport = async (alertId: string) => {
    if (!user) {
      toast.error(t("Please login to support alerts"));
      return;
    }

    try {
      await supabase.from("alert_interactions").insert({
        alert_id: alertId,
        user_id: user.id,
        interaction_type: "support",
      });

      toast.success(t("Thanks for your support!"));
      fetchAlerts();
    } catch (error: unknown) {
      const code =
        (typeof error === "object" && error !== null && "code" in error)
          ? String((error as Record<string, unknown>).code)
          : "";
      if (code === "23505") {
        toast.info(t("You've already supported this alert"));
      } else {
        toast.error(t("Failed to support alert"));
      }
    }
  };

  const handleReport = async (alertId: string) => {
    if (!user) {
      toast.error(t("Please login to report alerts"));
      return;
    }

    try {
      await supabase.from("alert_interactions").insert({
        alert_id: alertId,
        user_id: user.id,
        interaction_type: "report",
      });

      toast.success(t("Alert reported"));
    } catch (error: unknown) {
      const code =
        (typeof error === "object" && error !== null && "code" in error)
          ? String((error as Record<string, unknown>).code)
          : "";
      if (code === "23505") {
        toast.info(t("You've already reported this alert"));
      } else {
        toast.error(t("Failed to report alert"));
      }
    }
  };

  const handleHide = (alertId: string) => {
    setHiddenAlerts((prev) => new Set([...prev, alertId]));
    setSelectedAlert(null);
    toast.success(t("Alert hidden"));
  };

  const handleBlockUser = () => {
    setSelectedAlert(null);
    toast.success(t("You won't see posts from this user"));
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return t("Just now");
    if (hours < 24) return `${hours}${t("h ago")}`;
    const days = Math.floor(hours / 24);
    return `${days}${t("d ago")}`;
  };

  // Reset stale map state on initial load
  useEffect(() => {
    setAlerts([]);
    setVetClinics([]);
    setHiddenAlerts(new Set());
    setSelectedAlert(null);
    setSelectedVet(null);
    setLoading(true);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />
      
      {/* Header */}
      <header className="px-4 pt-4 pb-3 bg-card z-10 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-brandText">{t("Map")}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Available on map for 2 hours and stay in system for 12 hours to receive broadcast alert. If you want to mute alerts, please go to Account Settings.
            </p>
          </div>
        </div>

        {/* Contract: Tabs + Visible toggle + Pin button */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-black/5 rounded-full p-1">
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
                    active ? "bg-white text-brandText shadow-sm" : "text-brandText/70 hover:text-brandText"
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void toggleVisible()}
              className={cn(
                "h-10 px-4 rounded-full border text-sm font-bold transition-colors",
                visibleEnabled ? "border-brandGold text-brandGold bg-brandGold/10" : "border-gray-300 text-brandText/70 bg-white"
              )}
              aria-label="Visible toggle"
            >
              {visibleEnabled ? "Visible: On" : "Visible: Off"}
            </button>

            <Button
              onClick={() => {
                if (isPinned) {
                  void handleUnpinMyLocation();
                } else {
                  handlePinMyLocation();
                }
              }}
              disabled={pinning}
              className="h-10 rounded-full bg-primary text-primary-foreground"
            >
              <MapPin className="w-4 h-4 mr-2" />
              {pinning ? t("Pinning...") : isPinned ? "Unpin" : t("Pin my Location")}
            </Button>
          </div>
        </div>

        {/* Manual input for location (contract: tap map/manual input). */}
        <div className="mt-3 grid grid-cols-[1fr,1fr,auto] gap-2">
          <input
            type="number"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            placeholder={t("Latitude")}
            className="h-9 rounded-lg bg-muted border border-border px-3 text-xs"
          />
          <input
            type="number"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            placeholder={t("Longitude")}
            className="h-9 rounded-lg bg-muted border border-border px-3 text-xs"
          />
          <Button onClick={handleManualPin} variant="outline" className="h-9 rounded-lg px-3">
            {t("Pin")}
          </Button>
        </div>
        {pinExpiresAt && (
          <p className="text-xs text-muted-foreground mt-2">
            {t("Pinned until")}: {new Date(pinExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </header>

      {/* Filter Chips */}
      {mapTab === "Event" ? (
        <div className="px-4 py-3 bg-card border-b border-border z-10 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {filterChips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setActiveFilter(chip.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                  activeFilter === chip.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 bg-card border-b border-border z-10 flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            Friends pins show only when users have Visible on and are within 50km.
          </p>
        </div>
      )}

      {/* Map Container */}
      <div className="flex-1 relative min-h-0">
        {loading && !mapLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : null}

        <div ref={mapContainer} className="h-full w-full" />

        {/* Create Alert Mode Overlay */}
        {isCreateOpen && (
          <div className="absolute top-4 left-4 right-4 bg-card rounded-xl p-4 shadow-elevated z-[1000]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t("Tap map to select location")}</h3>
              <button onClick={resetCreateForm}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {selectedLocation && (
              <p className="text-sm text-muted-foreground">
                📍 {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
              </p>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="absolute bottom-4 left-4 right-4 z-[1000]">
          {!isCreateOpen ? (
            <div className="space-y-2">
              <p className="text-xs text-center text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5">
                {t("map.broadcast_remark").replace("{distance}", String(broadcastRange))}
              </p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedRangeKm(broadcastRange);
                  setSelectedDurationH(effectiveTier === "gold" ? 48 : isPremium ? 24 : 12);
                  setPostOnThreads(false);
                  setIsCreateOpen(true);
                }}
                className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 shadow-elevated flex items-center justify-center gap-2 font-semibold"
              >
                <AlertTriangle className="w-5 h-5" />
                {t("map.broadcast")}
              </motion.button>
            </div>
          ) : selectedLocation ? (
            <div className="bg-card rounded-xl p-4 shadow-elevated space-y-4">
              {/* Alert Type */}
              <div className="flex gap-2">
                {["Stray", "Lost", "Others"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setAlertType(type)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                      alertType === type
                        ? "text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                    style={{
                      backgroundColor: alertType === type ? alertTypeColors[type] : undefined,
                    }}
                  >
                    {t(type)}
                  </button>
                ))}
              </div>
              
              {/* Description */}
              <div className="space-y-1">
                <Textarea
                  placeholder={t("Brief description (max 20 words)...")}
                  value={description}
                  onChange={(e) => {
                    const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                    if (words.length <= MAX_ALERT_WORDS) {
                      setDescription(e.target.value);
                    }
                  }}
                  className="rounded-xl min-h-[60px]"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("map.word_count")
                      .replace("{count}", String(description.trim().split(/\s+/).filter(Boolean).length))
                      .replace("{max}", String(MAX_ALERT_WORDS))}
                  </span>
                </div>
              </div>
              
              {/* Image */}
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="" className="rounded-xl max-h-32 object-cover w-full" />
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Camera className="w-5 h-5" />
                  {t("map.add_photo")}
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              )}

              {/* Contract: Range/Duration gated dropdowns + "Post on Threads" */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Range</div>
                  <select
                    value={String(selectedRangeKm ?? broadcastRange)}
                    onChange={(e) => setSelectedRangeKm(Number(e.target.value))}
                    className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm"
                  >
                    <option value="2" disabled={broadcastRange < 2}>2km</option>
                    <option value="10" disabled={broadcastRange < 10}>10km</option>
                    <option value="20" disabled={broadcastRange < 20 && extraBroadcast72h <= 0}>
                      {broadcastRange >= 20 ? "20km" : "20km (Add-on)"}
                    </option>
                  </select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Duration</div>
                  <select
                    value={String(selectedDurationH ?? (effectiveTier === "gold" ? 48 : isPremium ? 24 : 12))}
                    onChange={(e) => setSelectedDurationH(Number(e.target.value))}
                    className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm"
                  >
                    <option value="12">12h</option>
                    <option value="24" disabled={!isPremium}>24h</option>
                    <option value="48" disabled={effectiveTier !== "gold"}>48h</option>
                    <option value="72" disabled={extraBroadcast72h <= 0}>72h (Add-on)</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={postOnThreads}
                  onChange={(e) => setPostOnThreads(e.target.checked)}
                  className="w-4 h-4"
                />
                Post on Threads
              </label>
              
              {/* Submit */}
              <Button
                onClick={handleCreateAlert}
                disabled={creating}
                className="w-full h-12 rounded-xl"
                style={{ backgroundColor: alertTypeColors[alertType] }}
              >
                {creating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  t("map.broadcast_alert").replace("{type}", t(alertType))
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Vet Clinic Modal */}
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
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <Hospital className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{selectedVet.name}</h3>
                  <div className="flex items-center gap-2">
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

              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => {
                    if (!profile?.is_verified) {
                      toast.info(t("Available to verified users only"));
                      return;
                    }
                  }}
                  className="flex items-center gap-1 text-sm"
                >
                  <Star className="w-4 h-4 text-amber-500" />
                  <span className={cn(!profile?.is_verified && "text-muted-foreground")}>
                    {profile?.is_verified ? `${selectedVet.rating || 5.0} / 5` : t("Available to verified users only")}
                  </span>
                </button>
              </div>

              {/* Contract: no navigation button (timely ops changes not guaranteed). */}
              <div className="grid grid-cols-1 gap-3">
                <Button
                  onClick={() => {
                    if (selectedVet.phone) {
                      window.open(`tel:${selectedVet.phone}`);
                    } else {
                      toast.info(t("Phone number not available"));
                    }
                  }}
                  className="h-12 rounded-xl"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  {t("map.call_now")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert Detail Modal */}
      <AnimatePresence>
        {selectedAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/50 flex items-end"
            onClick={() => setSelectedAlert(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-card rounded-t-3xl p-6 max-h-[70vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span 
                    className="px-3 py-1 rounded-full text-white text-sm font-medium"
                    style={{ backgroundColor: alertTypeColors[selectedAlert.alert_type] }}
                  >
                    {t(selectedAlert.alert_type)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatTimeAgo(selectedAlert.created_at)}
                  </span>
                </div>
                <button onClick={() => setSelectedAlert(null)}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              {selectedAlert.photo_url && (
                <img src={selectedAlert.photo_url} alt="" className="w-full rounded-xl mb-4 max-h-48 object-cover" />
              )}

              {selectedAlert.description && (
                <p className="text-foreground mb-4">{selectedAlert.description}</p>
              )}

              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  {selectedAlert.creator?.avatar_url ? (
                    <img src={selectedAlert.creator.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold">
                      {selectedAlert.creator?.display_name?.charAt(0) || t("Unknown").charAt(0)}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium">{selectedAlert.creator?.display_name || t("Anonymous")}</span>
                <span className="text-sm text-muted-foreground ml-auto">
                  {t("map.supports").replace("{count}", String(selectedAlert.support_count))}
                </span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button onClick={() => handleSupport(selectedAlert.id)} className="h-12 rounded-xl bg-primary hover:bg-primary/90">
                  <ThumbsUp className="w-5 h-5 mr-2" />
                  {t("social.support")}
                </Button>
                <Button onClick={() => handleReport(selectedAlert.id)} variant="outline" className="h-12 rounded-xl">
                  <Flag className="w-5 h-5 mr-2" />
                  {t("social.report")}
                </Button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleHide(selectedAlert.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <EyeOff className="w-4 h-4" />
                  {t("social.hide")}
                </button>
                <button
                  onClick={handleBlockUser}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-destructive"
                >
                  <Ban className="w-4 h-4" />
                  {t("Block User")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Profile Modal */}
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

      {/* Premium Footer — triggers on Mesh-Alert limits for free users */}
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
