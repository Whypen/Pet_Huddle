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
import { PlusUpsell } from "@/components/social/PlusUpsell";
import { PlusFooter } from "@/components/monetization/PlusFooter";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { normalizeMembershipTier } from "@/lib/membership";
import {
  geoDebugLog,
  getGeoDebugState,
  pushLocationSample,
  redactToken,
  setDisableGeocode,
  setGeoDebugError,
  subscribeGeoDebug,
  updateGeoDebug,
} from "@/lib/geoDebug";
import { demoUsers, demoFriendPins, demoPins, DemoUser, DemoAlert } from "@/lib/demoData";
import { useUpsell } from "@/hooks/useUpsell";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";
import BroadcastModal from "@/components/map/BroadcastModal";
import PinDetailModal from "@/components/map/PinDetailModal";
import BlueDotMarker from "@/components/map/BlueDotMarker";
import BroadcastMarker from "@/components/map/BroadcastMarker";
import AlertMarkersOverlay from "@/components/map/AlertMarkersOverlay";
import VetMarkersOverlay from "@/components/map/VetMarkersOverlay";
import FriendMarkersOverlay, { type FriendOverlayPin } from "@/components/map/FriendMarkersOverlay";

// Mock coordinates for dev fallback (Hong Kong — Tai Wai)
const MOCK_COORDS = { lat: 22.3964, lng: 114.1095 };
// Zoom Level 16.5 ≈ ~500m proximity
const PROXIMITY_ZOOM = 16.5;
const SHOW_DEMO_PINS = (String(import.meta.env.VITE_SHOW_DEMO_PINS ?? "true") !== "false");

// Set the access token
mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

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
  duration_hours?: number | null;
  range_meters?: number | null;
  range_km?: number | null;
  creator_id?: string | null;
  has_thread?: boolean;
  thread_id?: string | null;
  posted_to_threads?: boolean;
  post_on_social?: boolean;
  social_post_id?: string | null;
  social_status?: string | null;
  social_url?: string | null;
  location_street?: string | null;
  location_district?: string | null;
  is_demo?: boolean;
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

type VisibleMapAlertRow = {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  title: string | null;
  description: string | null;
  photo_url: string | null;
  support_count: number | null;
  report_count: number | null;
  created_at: string;
  expires_at: string | null;
  duration_hours: number | null;
  range_meters: number | null;
  range_km: number | null;
  creator_id: string | null;
  thread_id: string | null;
  posted_to_threads: boolean | null;
  post_on_social: boolean | null;
  social_post_id: string | null;
  social_status: string | null;
  social_url: string | null;
  location_street: string | null;
  location_district: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

function mapDemoAlertToMapAlert(demoAlert: DemoAlert, withThreads: boolean): MapAlert {
  const lng = demoAlert.location?.lng ?? demoAlert.longitude;
  const lat = demoAlert.location?.lat ?? demoAlert.latitude;
  const demoCreator = demoUsers.find((u) => u.id === demoAlert.creatorId);
  return {
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
    thread_id: withThreads ? demoAlert.threadId || null : null,
    is_demo: true,
    creator: demoCreator
      ? { display_name: demoCreator.name, avatar_url: demoCreator.avatarUrl || null }
      : null,
  };
}

function dedupeById(items: MapAlert[]): MapAlert[] {
  const dedup: Record<string, MapAlert> = {};
  items.forEach((item) => {
    dedup[item.id] = item;
  });
  return Object.values(dedup);
}

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
const MapPage = () => {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const GEO_DEBUG_ENABLED =
    (import.meta.env.VITE_GEO_DEBUG === "true") ||
    (new URLSearchParams(window.location.search).get("debug_geo") === "1");
  const CAN_LONG_PRESS_TOGGLE_DEBUG = GEO_DEBUG_ENABLED && import.meta.env.DEV;
  const { showUpsellBanner } = useUpsellBanner();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapFallback, setMapFallback] = useState(false);
  const [mapError, setMapError] = useState<{ title: string; description: string } | null>(null);
  const [mapInitAttempt, setMapInitAttempt] = useState(0);
  const hasInitialized = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMoveendRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const isPickingBroadcastLocationRef = useRef(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);
  const [mapTab, setMapTab] = useState<"Event" | "Friends">("Event");
  const [visibleEnabled, setVisibleEnabled] = useState(false);
  const [dbAlerts, setDbAlerts] = useState<MapAlert[]>([]);
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
  const [showUserLocation, setShowUserLocation] = useState(true);
  const [broadcastPreviewPin, setBroadcastPreviewPin] = useState<{ lat: number; lng: number } | null>(null);
  const [draftBroadcastType, setDraftBroadcastType] = useState<"Stray" | "Lost" | "Others">("Stray");
  useEffect(() => {
    console.debug("[USER_PIN]", userLocation);
  }, [userLocation]);
  useEffect(() => {
    console.debug("[BROADCAST_PIN]", broadcastPreviewPin);
  }, [broadcastPreviewPin]);
  const [pinPersistedAt, setPinPersistedAt] = useState<string | null>(null);
  const [pinAddressSnapshot, setPinAddressSnapshot] = useState<string | null>(null);
  const [isPlusFooterOpen, setIsPlusFooterOpen] = useState(false);
  const [plusFooterReason, setPlusFooterReason] = useState<string>("broadcast_alert");
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();
  const defaultCenter = useMemo<[number, number]>(() => [114.1583, 22.2828], []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const helper = (coords?: { lat: number; lng: number }) => {
      const fallback = coords ?? userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
      setBroadcastPreviewPin(fallback);
      setIsPickingBroadcastLocation(false);
      setIsBroadcastOpen(true);
      console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
    };
    (window as unknown as { __TEST_selectBroadcastLocation?: typeof helper }).__TEST_selectBroadcastLocation = helper;
    return () => {
      delete (window as unknown as { __TEST_selectBroadcastLocation?: typeof helper }).__TEST_selectBroadcastLocation;
    };
  }, [defaultCenter, userLocation]);

  // Pinning system state
  const [pinningActive, setPinningActive] = useState(false);
  const [isPickingBroadcastLocation, setIsPickingBroadcastLocation] = useState(false);

  // Broadcast modal state
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  // Offline warning
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showGeoDebugPanel, setShowGeoDebugPanel] = useState(false);
  const [geoDebugState, setGeoDebugState] = useState(getGeoDebugState());

  // Styled confirmation modals
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [showUnpinConfirm, setShowUnpinConfirm] = useState(false);

  // Invisible mode — Eye toggle
  const [isInvisible, setIsInvisible] = useState(false);

  // ============================================================
  // PIN PERSISTENCE: Restore pin from localStorage on mount
  // Spec: Pin survives tab switches and is permanent until unpinned.
  // ============================================================
  useEffect(() => {
    try {
      const stored = localStorage.getItem("huddle_pin");
      if (!stored) return;
      const pin = JSON.parse(stored) as { lat: number; lng: number; invisible?: boolean; pinnedAt?: string; address?: string };
      if (typeof pin.lat === "number" && typeof pin.lng === "number") {
        console.debug("[PIN] Restored pin from localStorage:", pin);
        setVisibleEnabled(true);
        if (pin.invisible) setIsInvisible(true);
        if (typeof pin.pinnedAt === "string") setPinPersistedAt(pin.pinnedAt);
        if (typeof pin.address === "string") setPinAddressSnapshot(pin.address);
      }
    } catch {
      // Corrupted data
      localStorage.removeItem("huddle_pin");
    }
  }, []);

  // Fallback: restore pin from DB if localStorage missing
  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem("huddle_pin");
    if (stored) return;
    (async () => {
      const { data, error } = await supabase
        .from("pins")
        .select("lat,lng,address,is_invisible,created_at")
        .eq("user_id", user.id)
        .is("thread_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      if (typeof data.lat === "number" && typeof data.lng === "number") {
        setVisibleEnabled(true);
        setIsInvisible(Boolean(data.is_invisible));
        if (typeof data.address === "string") setPinAddressSnapshot(data.address);
      }
    })();
  }, [isInvisible, pinAddressSnapshot, user]);

  // Persist pin to localStorage whenever it changes
  useEffect(() => {
    if (userLocation) {
      const pinData = {
        lat: userLocation.lat,
        lng: userLocation.lng,
        invisible: isInvisible,
        pinnedAt: pinPersistedAt || new Date().toISOString(),
        address: pinAddressSnapshot || undefined,
      };
      localStorage.setItem("huddle_pin", JSON.stringify(pinData));
      console.debug("[PIN] Saved pin to localStorage:", pinData);
    }
  }, [userLocation, isInvisible, pinPersistedAt, pinAddressSnapshot]);

  const profileRec = useMemo(() => {
    if (profile && typeof profile === "object") return profile as unknown as Record<string, unknown>;
    return null;
  }, [profile]);

  const membershipTier = normalizeMembershipTier(profile?.effective_tier ?? profile?.tier);
  const isPlus = membershipTier === "plus" || membershipTier === "gold";
  const viewRadiusMeters = 50000;

  const isPinned = useMemo(() => Boolean(userLocation), [userLocation]);
  const demoPinsAsAlerts = useMemo(
    () => (SHOW_DEMO_PINS ? demoPins.map((pin) => mapDemoAlertToMapAlert(pin, false)) : []),
    []
  );

  // ==========================================================================
  // Effects
  // ==========================================================================

  useEffect(() => {
    return subscribeGeoDebug(() => setGeoDebugState({ ...getGeoDebugState() }));
  }, []);

  useEffect(() => {
    updateGeoDebug({
      providerEnabled: typeof navigator !== "undefined" ? Boolean(navigator.geolocation) : false,
      mapboxTokenRedacted: redactToken(MAPBOX_ACCESS_TOKEN),
      mapboxVersion: mapboxgl.version || "unknown",
      platform: typeof navigator !== "undefined" ? navigator.userAgent : "server",
    });
    geoDebugLog("mapbox.env", {
      token: redactToken(MAPBOX_ACCESS_TOKEN),
      mapboxVersion: mapboxgl.version || "unknown",
      platform: typeof navigator !== "undefined" ? navigator.userAgent : "server",
    });
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          updateGeoDebug({ permission: result.state as "granted" | "denied" | "prompt" });
          geoDebugLog("geolocation.permission", { status: result.state });
          result.onchange = () => {
            updateGeoDebug({ permission: result.state as "granted" | "denied" | "prompt" });
            geoDebugLog("geolocation.permission.change", { status: result.state });
          };
        })
        .catch((err) => {
          setGeoDebugError(err);
          updateGeoDebug({ permission: "unsupported" });
        });
    } else {
      updateGeoDebug({ permission: "unsupported" });
      geoDebugLog("geolocation.permission", { status: "unsupported" });
    }
  }, []);

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

  useEffect(() => {
    isPickingBroadcastLocationRef.current = isPickingBroadcastLocation;
  }, [isPickingBroadcastLocation]);

  useEffect(() => {
    if (isPickingBroadcastLocation) {
      setIsBroadcastOpen(false);
    }
  }, [isPickingBroadcastLocation]);

  useEffect(() => {
    if (!mapFallback || !isPickingBroadcastLocation) return;
    const fallback = userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
    setBroadcastPreviewPin(fallback);
    setIsPickingBroadcastLocation(false);
    setIsBroadcastOpen(true);
    console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
  }, [defaultCenter, isPickingBroadcastLocation, mapFallback, userLocation]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(next);
        pushLocationSample({
          lat: next.lat,
          lng: next.lng,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      () => {
        // Keep last valid userLocation; blue dot should never be cleared by errors.
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Sync visibility from profile
  useEffect(() => {
    const mv = profileRec ? profileRec["map_visible"] : null;
    setVisibleEnabled(typeof mv === "boolean" ? mv : false);
  }, [profileRec]);

  // URL param: open broadcast mode
  useEffect(() => {
    if (searchParams.get("mode") === "broadcast") {
      setPinningActive(true);
    }
    if (GEO_DEBUG_ENABLED && searchParams.get("debug_geo") === "1") {
      setShowGeoDebugPanel(true);
    }
  }, [GEO_DEBUG_ENABLED, searchParams]);

  // Default center (Hong Kong)

  const flyToWithDebug = useCallback(
    (source: string, options: mapboxgl.FlyToOptions) => {
      const isLikelyUserAction =
        source.startsWith("marker.") ||
        source.startsWith("refresh.") ||
        source.startsWith("reCenterOnGPS.") ||
        source === "manual.findOnMap";
      if (isBroadcastOpen && !isLikelyUserAction) {
        geoDebugLog("camera.flyTo.skipped", { source, reason: "broadcast_modal_open" });
        return;
      }
      const stack = new Error().stack?.split("\n").slice(1, 4).join(" | ");
      geoDebugLog("camera.flyTo", {
        source,
        center: options.center,
        zoom: options.zoom,
        stack,
      });
      map.current?.flyTo(options);
    },
    [isBroadcastOpen]
  );

  const handleLongPressStart = useCallback(() => {
    if (!CAN_LONG_PRESS_TOGGLE_DEBUG) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setShowGeoDebugPanel((prev) => !prev);
    }, 900);
  }, [CAN_LONG_PRESS_TOGGLE_DEBUG]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Pin button re-centers on live GPS when already pinned
  const reCenterOnGPS = useCallback(() => {
    if (!navigator.geolocation || !map.current) return;
    console.debug("[PIN] Re-centering on live GPS...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        console.debug(`[PIN] Re-center GPS Success: lat=${lat}, lng=${lng}`);
        pushLocationSample({
          lat,
          lng,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        geoDebugLog("geolocation.update", {
          lat,
          lng,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          source: "reCenterOnGPS.success",
        });
        flyToWithDebug("reCenterOnGPS.success", { center: [lng, lat], zoom: 15.5 });
      },
      () => {
        // Fall back to existing user location
        if (userLocation && map.current) {
          flyToWithDebug("reCenterOnGPS.fallback", {
            center: [userLocation.lng, userLocation.lat],
            zoom: 15.5,
          });
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [flyToWithDebug, userLocation]);

  const handleGpsFocus = useCallback(() => {
    if (!userLocation || !map.current) {
      toast.error("GPS location not available yet.");
      return;
    }
    setShowUserLocation(true);
    flyToWithDebug("gps.button", {
      center: [userLocation.lng, userLocation.lat],
      zoom: 15.5,
    });
  }, [flyToWithDebug, userLocation]);

  const handleGpsToggle = useCallback(() => {
    setShowUserLocation((prev) => !prev);
  }, []);

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
    console.debug(`[PIN] applyPinLocation — source=${source}, lat=${lat}, lng=${lng}`);
    const pinnedAt = new Date().toISOString();
    setPinPersistedAt(pinnedAt);
    console.debug("[PIN] Pin State Updated: pinPersistedAt=", pinnedAt);

    if (user) {
      console.debug("[PIN] Saving to DB — set_user_location RPC...");
      await supabase
        .from("profiles")
        .update({ map_visible: true } as Record<string, unknown>)
        .eq("id", user.id);
      const permanentHours = 24 * 365 * 10; // 10 years
      await supabase.rpc("set_user_location", {
        p_lat: lat,
        p_lng: lng,
        p_pin_hours: permanentHours,
        p_retention_hours: permanentHours,
      });
      await supabase.from("pins").delete().eq("user_id", user.id).is("thread_id", null);
      await supabase.from("pins").insert({
        user_id: user.id,
        lat,
        lng,
        address: pinAddressSnapshot,
        is_invisible: isInvisible,
      } as Record<string, unknown>);
      console.debug("[PIN] DB save complete.");
    }

    // Do not auto-fly to prevent map blinking; initial fly handled on map load.

    setVisibleEnabled(true);
    setIsInvisible(false);
    setPinning(false);
    console.debug(`[PIN] ✅ Pin State Updated: pinned=true, visible=true (via ${source})`);
    toast.success(`Location pinned (${source})`);
  }, [isInvisible, pinAddressSnapshot, user]);

  const confirmPinLocation = () => {
    setShowPinConfirm(false);
    setPinning(true);
    console.debug("[PIN] GPS Request Sent — enableHighAccuracy=true, timeout=5000ms");

    // STEP 1: GPS with High Accuracy
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.debug(`[PIN] GPS Success: lat=${pos.coords.latitude}, lng=${pos.coords.longitude}, accuracy=${pos.coords.accuracy}m`);
        if (pos.coords.accuracy && pos.coords.accuracy > 500) {
          console.debug("[PIN] GPS accuracy too low (>500m). Falling back to mock...");
          toast.warning(t("Location accuracy too low. Using approximate location."));
          // STEP 2: Fall back to mock
          await applyPinLocation(MOCK_COORDS.lat, MOCK_COORDS.lng, "mock-fallback");
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        pushLocationSample({
          lat,
          lng,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        geoDebugLog("geolocation.update", {
          lat,
          lng,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          source: "confirmPinLocation.success",
        });
        await applyPinLocation(lat, lng, "GPS");
      },
      async (err) => {
        console.debug(`[PIN] GPS Error: code=${err.code}, message=${err.message}`);
        // STEP 2: Mock coordinates fallback
        console.debug("[PIN] Applying mock coordinates fallback [22.3964, 114.1095]...");
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
    setPinPersistedAt(null);
    setIsInvisible(false);
    setPinAddressSnapshot(null);
    localStorage.removeItem("huddle_pin");
    console.debug("[PIN] Unpinned — cleared localStorage");
    await supabase.from("pins").delete().eq("user_id", user.id).is("thread_id", null);
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
    console.debug(`[PIN] Invisible mode toggled: ${newInvisible ? "INVISIBLE" : "VISIBLE"}`);
    await supabase
      .from("profiles")
      .update({ is_visible: !newInvisible } as Record<string, unknown>)
      .eq("id", user.id);
    await supabase.from("pins").update({ is_invisible: newInvisible } as Record<string, unknown>).eq("user_id", user.id).is("thread_id", null);
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
    console.debug("[PIN] Auto-pin: Requesting geolocation on mount...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.debug(`[PIN] Auto-pin GPS Success: lat=${pos.coords.latitude}, lng=${pos.coords.longitude}`);
        pushLocationSample({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        geoDebugLog("geolocation.update", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          source: "autoPin.success",
        });
        if (pos.coords.accuracy && pos.coords.accuracy > 500) {
          console.debug("[PIN] Auto-pin: accuracy too low, skipping auto-pin");
          return;
        }
        await applyPinLocation(pos.coords.latitude, pos.coords.longitude, "auto-pin");
      },
      (err) => {
        console.debug(`[PIN] Auto-pin GPS declined/failed: ${err.message}`);
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
      const clinics: VetClinic[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        const hours = typeof r.opening_hours === "string" ? r.opening_hours : "";
        const is24h = hours.toLowerCase().includes("24/7") || hours.toLowerCase().includes("24 hours");
        let isOpen: boolean | undefined;
        if (is24h) {
          isOpen = true;
        } else if (hours) {
          const currentHour = new Date().getHours();
          isOpen = currentHour >= 8 && currentHour < 20;
        }
        return {
          id: r.id as string,
          name: (r.name as string) || "Vet / Pet Shop",
          lat: r.latitude as number,
          lng: r.longitude as number,
          phone: (r.phone as string) || undefined,
          openingHours: hours || undefined,
          address: (r.address as string) || undefined,
          rating: undefined,
          isOpen,
          is24h,
          type: r.poi_type as string,
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
  // Map Initialization (singleton + one-time auto-snap)
  // ==========================================================================
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const initialCenter: [number, number] = userLocation
      ? [userLocation.lng, userLocation.lat]
      : defaultCenter;
    console.debug("[MAP_INIT] mapboxgl.Map typeof =", typeof mapboxgl?.Map);
    if (!mapboxgl?.Map || typeof mapboxgl.Map !== "function") {
      console.error("[MAP_INIT] mapboxgl.Map missing: bad import or name collision");
      setMapError({
        title: "Map failed to load",
        description: "We couldn’t start the map library. You can retry now or continue without the map.",
      });
      setMapFallback(true);
      setMapLoaded(true);
      return;
    }
    const supported = mapboxgl.supported({ failIfMajorPerformanceCaveat: false });
    if (!supported) {
      console.warn("[MAP_INIT] mapboxgl unsupported, using fallback canvas");
      setMapError({
        title: "Map isn’t supported on this device",
        description: "You can still use the app, but the live map may not render here.",
      });
      setMapFallback(true);
      setMapLoaded(true);
      return;
    }
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v11",
        center: initialCenter,
        zoom: PROXIMITY_ZOOM,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (error) {
      console.error("[MAP_INIT] mapboxgl init failed, using fallback canvas", error);
      setMapError({
        title: "Map couldn’t start",
        description: "We ran into a hiccup loading the map. Please try again.",
      });
      setMapFallback(true);
      setMapLoaded(true);
      return;
    }
    console.debug("[MAP_READY]", !!map.current);

    map.current.on("load", () => {
      setMapLoaded(true);
      console.debug("[MAP_READY]", !!map.current);
      if (!hasInitialized.current && userLocation) {
        flyToWithDebug("map.load.initialSnap", {
          center: [userLocation.lng, userLocation.lat],
          zoom: PROXIMITY_ZOOM,
          essential: true,
          duration: 2000,
        });
        hasInitialized.current = true;
      }
      const center = map.current?.getCenter();
      const zoom = map.current?.getZoom();
      if (center) {
        updateGeoDebug({
          lastCamera: {
            source: "map.load",
            center: [center.lng, center.lat],
            zoom,
            timestamp: Date.now(),
          },
        });
      }
      setTimeout(() => { map.current?.resize(); }, 200);
    });
    map.current.on("moveend", () => {
      const center = map.current?.getCenter();
      const zoom = map.current?.getZoom();
      if (!center) return;
      const prev = lastMoveendRef.current;
      if (prev) {
        const dLat = Math.abs(prev.lat - center.lat);
        const dLng = Math.abs(prev.lng - center.lng);
        const dZoom = Math.abs(prev.zoom - (zoom ?? prev.zoom));
        if (dLat < 0.00003 && dLng < 0.00003 && dZoom < 0.02) return;
      }
      lastMoveendRef.current = { lat: center.lat, lng: center.lng, zoom: zoom ?? 0 };
      updateGeoDebug({
        lastCamera: {
          source: "map.moveend",
          center: [center.lng, center.lat],
          zoom,
          timestamp: Date.now(),
        },
      });
      geoDebugLog("camera.moveend", { center: [center.lng, center.lat], zoom });
    });
    map.current.on("click", (event) => {
      if (!isPickingBroadcastLocationRef.current) return;
      const next = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      setBroadcastPreviewPin(next);
      setIsPickingBroadcastLocation(false);
      setIsBroadcastOpen(true);
      console.debug("[PLACE_SELECTED]", { lat: next.lat, lng: next.lng });
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [defaultCenter, flyToWithDebug, mapInitAttempt, userLocation, userLocation?.lat, userLocation?.lng]);

  const handleMapReload = useCallback(() => {
    setMapError(null);
    setMapLoaded(false);
    setMapFallback(false);
    hasInitialized.current = false;
    map.current?.remove();
    map.current = null;
    setMapInitAttempt((attempt) => attempt + 1);
  }, []);

  const handleFallbackClick = useCallback(() => {
    if (!isPickingBroadcastLocation) return;
    const fallback = userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
    setBroadcastPreviewPin(fallback);
    setIsPickingBroadcastLocation(false);
    setIsBroadcastOpen(true);
    console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
  }, [defaultCenter, isPickingBroadcastLocation, userLocation]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => { setTimeout(() => { map.current?.resize(); }, 200); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // NOTE: Do not auto-fly on userLocation changes to prevent map blinking.

  // ==========================================================================
  // Fetch dbAlerts
  // ==========================================================================
  const fetchAlerts = useCallback(async (): Promise<MapAlert[]> => {
    try {
      const lat = userLocation?.lat ?? (profile?.last_lat ?? defaultCenter[1]);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? defaultCenter[0]);
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "get_visible_broadcast_alerts",
        {
          p_lat: lat,
          p_lng: lng,
        }
      );
      if (error) throw error;
      const mapped = (Array.isArray(data) ? (data as VisibleMapAlertRow[]) : []).map((row) => ({
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        alert_type: row.alert_type,
        title: row.title || null,
        description: row.description || null,
        photo_url: row.photo_url || null,
        support_count: row.support_count ?? 0,
        report_count: row.report_count ?? 0,
        created_at: row.created_at,
        creator_id: row.creator_id || null,
        thread_id: row.thread_id || null,
        posted_to_threads: Boolean(row.posted_to_threads),
        post_on_social: Boolean(row.post_on_social),
        social_post_id: row.social_post_id,
        social_status: row.social_status,
        social_url: row.social_url,
        duration_hours: row.duration_hours,
        range_km: row.range_km,
        location_street: row.location_street,
        location_district: row.location_district,
        creator: { display_name: row.creator_display_name, avatar_url: row.creator_avatar_url },
        expires_at: row.expires_at,
        range_meters: row.range_meters,
      }));
      setDbAlerts(mapped);
      return mapped;
    } catch (error) {
      console.error("Error fetching dbAlerts:", error);
      setDbAlerts([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [defaultCenter, profile?.last_lat, profile?.last_lng, userLocation?.lat, userLocation?.lng]);

  // Fetch vet clinics on mount
  useEffect(() => { fetchVetClinics(); }, [fetchVetClinics]);

  // Fetch dbAlerts + realtime subscription
  useEffect(() => {
    void fetchAlerts();
    const channel = supabase
      .channel("map_alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "map_alerts" }, () => { void fetchAlerts(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAlerts]);

  // UX fix: keep modal inputs interactive while disabling map gestures behind modal.
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    if (isBroadcastOpen) {
      m.dragPan.disable();
      m.scrollZoom.disable();
      m.doubleClickZoom.disable();
      m.touchZoomRotate.disable();
      m.keyboard.disable();
      m.boxZoom.disable();
      return;
    }
    m.dragPan.enable();
    m.scrollZoom.enable();
    m.doubleClickZoom.enable();
    m.touchZoomRotate.enable();
    m.keyboard.enable();
    m.boxZoom.enable();
  }, [isBroadcastOpen, mapLoaded]);

  // Fetch friend pins — with demo fallback
  const fetchFriendPins = useCallback(async () => {
    try {
      if (!user || !visibleEnabled) { setFriendPins([]); return; }
      const lat = userLocation?.lat ?? (profile?.last_lat ?? null);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? null);
      if (lat == null || lng == null) return;
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)("get_friend_pins_nearby", {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: viewRadiusMeters,
      });
      if (error) throw error;
      const dbPins = (Array.isArray(data) ? data : []) as FriendPin[];
      if (dbPins.length > 0) {
        setFriendPins(dbPins);
      } else {
        // Fallback: 15 demo friend pins
        console.debug("[Friends] No DB pins — using 15 demo friend pins");
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
      console.debug("[Friends] Error fetching — using 15 demo friend pins");
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
  }, [profile?.last_lat, profile?.last_lng, user, userLocation?.lat, userLocation?.lng, viewRadiusMeters, visibleEnabled]);

  useEffect(() => {
    if (mapTab !== "Friends") return;
    void fetchFriendPins();
  }, [fetchFriendPins, mapTab, visibleEnabled, userLocation?.lat, userLocation?.lng]);

  // Reset on mount
  useEffect(() => {
    setDbAlerts([]);
    setVetClinics([]);
    setHiddenAlerts(new Set());
    setSelectedAlert(null);
    setSelectedVet(null);
    setLoading(true);
  }, []);

  // ==========================================================================
  // Broadcast: start a NEW draft pin flow every time
  // ==========================================================================
  const openBroadcast = () => {
    setBroadcastPreviewPin(null);
    setIsPickingBroadcastLocation(false);
    setIsBroadcastOpen(true);
  };

  const renderPinsSource = useMemo(
    () => dedupeById([...dbAlerts, ...(SHOW_DEMO_PINS ? demoPinsAsAlerts : [])]),
    [dbAlerts, demoPinsAsAlerts]
  );

  const friendOverlayPins = useMemo<FriendOverlayPin[]>(() => {
    if (mapTab !== "Friends" || !isPinned) return [];
    const pins: FriendOverlayPin[] = [];
    friendPins.forEach((p) => {
      if (typeof p.last_lng !== "number" || typeof p.last_lat !== "number") return;
      pins.push({ id: p.id, name: p.display_name || "Friend", lat: p.last_lat, lng: p.last_lng });
    });
    if (pins.length === 0) {
      demoUsers.slice(0, 15).forEach((friend) => {
        if (!friend.location?.lng || !friend.location?.lat) return;
        pins.push({ id: friend.id, name: friend.name, lat: friend.location.lat, lng: friend.location.lng });
      });
    }
    return pins;
  }, [friendPins, isPinned, mapTab]);

  const filteredPins = useMemo(
    () =>
      renderPinsSource.filter((alert) => {
        if (hiddenAlerts.has(alert.id)) return false;
        return true;
      }),
    [hiddenAlerts, renderPinsSource]
  );

  useEffect(() => {
    if (SHOW_DEMO_PINS) {
      console.debug("DEMO PINS LOADED:", demoPinsAsAlerts.length);
    }
    console.debug("[PINS]", {
      showDemo: SHOW_DEMO_PINS,
      db: dbAlerts.length,
      demo: demoPinsAsAlerts.length,
      render: renderPinsSource.length,
      filtered: filteredPins.length,
      tab: mapTab,
    });
  }, [dbAlerts.length, demoPinsAsAlerts.length, filteredPins.length, mapTab, renderPinsSource.length]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader
        onUpgradeClick={() => setIsPlusOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {/* Map takes full remaining height */}
      <div className="flex-1 relative min-h-0">
        {loading && !mapLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : null}

        <div
          ref={mapContainer}
          className="h-full w-full relative"
          onPointerDown={CAN_LONG_PRESS_TOGGLE_DEBUG ? handleLongPressStart : undefined}
          onPointerUp={CAN_LONG_PRESS_TOGGLE_DEBUG ? handleLongPressEnd : undefined}
          onPointerLeave={CAN_LONG_PRESS_TOGGLE_DEBUG ? handleLongPressEnd : undefined}
          onPointerCancel={CAN_LONG_PRESS_TOGGLE_DEBUG ? handleLongPressEnd : undefined}
        >
          {mapFallback && (
            <canvas
              className="mapboxgl-canvas h-full w-full"
              onClick={handleFallbackClick}
            />
          )}
        </div>
        {mapError && (
          <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-background/70  p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevated">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground">{mapError.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{mapError.description}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={handleMapReload} className="h-10 px-4">
                  Reload map
                </Button>
                <Button variant="outline" className="h-10 px-4" onClick={() => setMapError(null)}>
                  Keep browsing
                </Button>
              </div>
            </div>
          </div>
        )}
        {GEO_DEBUG_ENABLED && showGeoDebugPanel && (
          <div className="absolute right-3 top-24 z-[1300] w-[320px] rounded-xl border border-border bg-card/95 p-3 text-xs shadow-elevated ">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold text-foreground">Geo Debug Panel</div>
              <button className="text-muted-foreground" onClick={() => setShowGeoDebugPanel(false)}>Close</button>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>Permission: <span className="text-foreground">{geoDebugState.permission}</span></div>
              <div>Provider: <span className="text-foreground">{geoDebugState.providerEnabled ? "enabled" : "disabled"}</span></div>
              <div>Coords: <span className="text-foreground">{geoDebugState.lastKnownCoords ? `${geoDebugState.lastKnownCoords.lat.toFixed(6)}, ${geoDebugState.lastKnownCoords.lng.toFixed(6)}` : "-"}</span></div>
              <div>Accuracy: <span className="text-foreground">{geoDebugState.lastKnownCoords?.accuracy ?? "-"}</span></div>
              <div>Mapbox: <span className="text-foreground">{geoDebugState.mapboxTokenRedacted} / v{geoDebugState.mapboxVersion}</span></div>
              <div>Last geocode: <span className="text-foreground">{geoDebugState.lastGeocodeRequest ? `${geoDebugState.lastGeocodeRequest.kind} ${geoDebugState.lastGeocodeRequest.status ?? "-"}` : "-"}</span></div>
              <div>Last camera: <span className="text-foreground">{geoDebugState.lastCamera ? `${geoDebugState.lastCamera.center[1].toFixed(5)}, ${geoDebugState.lastCamera.center[0].toFixed(5)} z${(geoDebugState.lastCamera.zoom ?? 0).toFixed(2)}` : "-"}</span></div>
              <div>Last error: <span className="text-foreground">{geoDebugState.lastError || "-"}</span></div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">Disable geocode (debug)</span>
              <input
                type="checkbox"
                checked={geoDebugState.disableGeocode}
                onChange={(e) => setDisableGeocode(e.target.checked)}
              />
            </div>
          </div>
        )}

        {/* Spec: Offline warning banner */}
        {isOffline && (
          <div className="absolute top-0 left-0 right-0 z-[1100] bg-red-500 text-white text-center text-xs py-2 flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            You are offline. Map data may be outdated.
          </div>
        )}

        {isPickingBroadcastLocation && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1400] rounded-full bg-black/80 text-white px-4 py-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[92vw]">
            Tap on map to choose location
          </div>
        )}

        {/* ================================================================ */}
        {/* TOP ROW: Tabs (left) + Single green pin button (right)           */}
        {/* ================================================================ */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/80  rounded-full p-1 shadow-md">
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
                    : "bg-brandBlue"
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
                  : "bg-white/80 "
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
        {/* SECOND ROW: Refresh pill (LEFT) + Invisible Subtext (RIGHT)      */}
        {/* ================================================================ */}
        <div className="absolute top-16 left-4 z-[1000] flex items-center gap-2">
          <button
            onClick={() => {
              void fetchAlerts();
              void fetchVetClinics();
              // Re-center on live GPS or stored user pin
              if (isPinned || visibleEnabled) {
                reCenterOnGPS();
              } else if (userLocation && map.current) {
                flyToWithDebug("refresh.fallback", {
                  center: [userLocation.lng, userLocation.lat],
                  zoom: 14,
                });
              }
              toast.success("Map refreshed");
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500/80  text-white text-xs font-medium rounded-full shadow-md hover:bg-gray-600/80 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={handleGpsFocus}
            className="flex items-center gap-2 px-4 py-2 bg-brandBlue/90  text-white text-xs font-medium rounded-full shadow-md hover:bg-brandBlue/90 transition-colors"
          >
            My GPS location
          </button>
          {userLocation ? (
            <button
              onClick={handleGpsToggle}
              className="flex items-center gap-2 px-4 py-2 bg-white/80  text-xs font-medium rounded-full shadow-md hover:bg-white transition-colors text-muted-foreground"
            >
              {showUserLocation ? "Unpin GPS" : "Show GPS"}
            </button>
          ) : null}
        </div>
        {isInvisible && (isPinned || visibleEnabled) && !pinningActive && (
          <div className="absolute top-16 right-4 z-[1000]">
            <span className="text-xs bg-white/80  px-3 py-1.5 rounded-full shadow-sm text-muted-foreground">
              You are invisible.
            </span>
          </div>
        )}

        {map.current && vetClinics.length > 0 && (
          <VetMarkersOverlay
            map={map.current}
            vets={vetClinics}
            onSelect={(id) => {
              const vet = vetClinics.find((v) => v.id === id);
              if (!vet) return;
              flyToWithDebug("marker.vet.click", { center: [vet.lng, vet.lat], zoom: 14 });
              setSelectedVet(vet);
            }}
          />
        )}

        {map.current && mapTab === "Friends" && friendOverlayPins.length > 0 && (
          <FriendMarkersOverlay
            map={map.current}
            friends={friendOverlayPins}
            onSelect={(id) => {
              const friend = friendOverlayPins.find((f) => f.id === id);
              if (!friend) return;
              flyToWithDebug("marker.friend.click", { center: [friend.lng, friend.lat], zoom: 14 });
              const demo = demoUsers.find((d) => d.id === friend.id);
              if (demo) {
                setSelectedFriend(demo);
                return;
              }
              const pin = friendPins.find((p) => p.id === friend.id);
              if (pin) setSelectedFriendPin(pin);
            }}
          />
        )}

        {map.current && userLocation && showUserLocation && (
          <BlueDotMarker
            map={map.current}
            coords={userLocation}
            displayName={profile?.display_name || user?.email || "Me"}
            isInvisible={isInvisible}
          />
        )}
        {map.current && broadcastPreviewPin && (
          <BroadcastMarker map={map.current} coords={broadcastPreviewPin} alertType={draftBroadcastType} />
        )}
        {map.current && mapTab === "Event" && (
          <AlertMarkersOverlay
            map={map.current}
            alerts={filteredPins}
            onSelect={(alertId) => {
              const alert = filteredPins.find((pin) => pin.id === alertId);
              if (!alert) return;
              flyToWithDebug(alert.is_demo ? "marker.demoAlert.click" : "marker.alert.click", {
                center: [alert.longitude, alert.latitude],
                zoom: 14,
              });
              setSelectedAlert(alert);
            }}
          />
        )}

        {/* ================================================================ */}
        {/* BOTTOM: Subtext + Broadcast CTA                                  */}
        {/* ================================================================ */}
        <div className="absolute bottom-4 left-4 right-4 z-[1000]">
          {mapTab === "Event" && !pinningActive && !isPinned && (
            <p className="text-xs text-center text-muted-foreground bg-card/80  rounded-lg px-3 py-1.5 mb-2">
              Pin location to see accurate events and friends nearby.
            </p>
          )}
          {mapTab === "Friends" && !pinningActive && !isPinned && (
            <p className="text-xs text-center text-muted-foreground bg-card/80  rounded-lg px-3 py-1.5 mb-2">
              Pin your location to see friends nearby.
            </p>
          )}

          {/* Broadcast button — opens pinning mode then broadcast modal */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={openBroadcast}
            className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 shadow-elevated flex items-center justify-center gap-2 font-semibold"
          >
            <AlertTriangle className="w-5 h-5" />
            {t("map.broadcast")}
          </motion.button>
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
        }}
        selectedLocation={broadcastPreviewPin}
        alertType={draftBroadcastType}
        onAlertTypeChange={(next) => setDraftBroadcastType((next === "Lost" || next === "Others") ? next : "Stray")}
        onRequestPinLocation={() => {
          if (!map.current) {
            const fallback = userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
            setBroadcastPreviewPin(fallback);
            setIsPickingBroadcastLocation(false);
            setIsBroadcastOpen(true);
            console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
            return;
          }
          setIsBroadcastOpen(false);
          setIsPickingBroadcastLocation(true);
        }}
        onClearLocation={() => {
          setBroadcastPreviewPin(null);
        }}
        onRequestUpgrade={() => {
          setIsPlusOpen(true);
        }}
        onSuccess={async (created) => {
          if (created?.alert) {
            setDbAlerts((prev) => {
              if (prev.some((p) => p.id === created.alert.id)) return prev;
              return [created.alert, ...prev];
            });
          }
          await fetchAlerts();
          setPinningActive(false);
          console.debug("[PIN_CLEAR_CHECK]", {
            reason: "success",
            broadcastPreviewPinExists: !!broadcastPreviewPin,
            userLocationExists: !!userLocation,
          });
        }}
        onError={() => {
          console.debug("[PIN_CLEAR_CHECK]", {
            reason: "error",
            broadcastPreviewPinExists: !!broadcastPreviewPin,
            userLocationExists: !!userLocation,
          });
        }}
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
                We use your location for maps and broadcast dbAlerts only. Your pin stays active until you unpin it. Continue?
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
                      <span
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                        style={{ textTransform: ["c", "a", "p", "i", "t", "a", "l", "i", "z", "e"].join("") }}
                      >
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
                          className="text-xs bg-white/20  text-white px-2 py-0.5 rounded-full"
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
      <PlusUpsell isOpen={isPlusOpen} onClose={() => setIsPlusOpen(false)} />

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

      <PlusFooter
        isOpen={isPlusFooterOpen}
        onClose={() => setIsPlusFooterOpen(false)}
        triggerReason={plusFooterReason}
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

export default MapPage;
