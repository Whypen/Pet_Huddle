import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Loader2,
  Phone,
  MapPin,
  RefreshCw,
  WifiOff,
  Eye,
  EyeOff,
  ExternalLink,
  Bell,
  Users,
  PenSquare,
} from "lucide-react";
import privacyImage from "@/assets/Notifications/Privacy.jpg";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BOTTOM_NAV_HEIGHT } from "@/components/layout/BottomNav";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { NeuControl } from "@/components/ui/NeuControl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { useUpsell } from "@/hooks/useUpsell";
import { useLocation, useNavigate } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";
import BroadcastModal from "@/components/map/BroadcastModal";
import PinDetailModal from "@/components/map/PinDetailModal";
import BlueDotMarker from "@/components/map/BlueDotMarker";
import BroadcastMarker from "@/components/map/BroadcastMarker";
import AlertMarkersOverlay from "@/components/map/AlertMarkersOverlay";
import VetMarkersOverlay from "@/components/map/VetMarkersOverlay";
import FriendMarkersOverlay, { type FriendOverlayPin } from "@/components/map/FriendMarkersOverlay";
import { normalizeGenderBucket } from "@/components/map/maskedPinAssets";
import { loadBlockedUserIdsFor } from "@/lib/blocking";
import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useSafetyRestrictions } from "@/hooks/useSafetyRestrictions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openExternalUrl } from "@/lib/nativeShell";

const extractDistrictFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
};

// Zoom Level 16.5 ≈ ~500m proximity
const PROXIMITY_ZOOM = 16.5;
const ENABLE_DEMO_DATA = String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? "false") === "true";

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
  media_urls?: string[] | null;
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
  is_sensitive?: boolean;
  marker_state?: "active" | "expired_dot";
  is_demo?: boolean;
  creator: {
    display_name: string | null;
    social_id?: string | null;
    avatar_url: string | null;
  } | null;
}

interface FriendPin {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean | null;
  is_invisible?: boolean | null;
  gender_genre?: string | null;
  dob: string | null;
  relationship_status: string | null;
  owns_pets: boolean | null;
  pet_species: string[] | null;
  location_name: string | null;
  last_lat: number | null;
  last_lng: number | null;
  location_pinned_until: string | null;
  location_retention_until?: string | null;
  marker_state?: "active" | "expired_dot";
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
  is_sensitive: boolean | null;
  media_urls: string[] | null;
  location_street: string | null;
  location_district: string | null;
  creator_display_name: string | null;
  creator_social_id: string | null;
  creator_avatar_url: string | null;
  marker_state: "active" | "expired_dot" | "hidden" | null;
};

function mapVisibleAlertRowToMapAlert(row: VisibleMapAlertRow): MapAlert {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    alert_type: row.alert_type,
    title: row.title || null,
    description: row.description || null,
    photo_url: row.photo_url || null,
    media_urls: Array.isArray(row.media_urls) ? row.media_urls.filter(Boolean) : row.photo_url ? [row.photo_url] : [],
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
    is_sensitive: row.is_sensitive === true,
    duration_hours: row.duration_hours,
    range_km: row.range_km,
    location_street: row.location_street,
    location_district: row.location_district,
    creator: {
      display_name: row.creator_display_name,
      social_id: row.creator_social_id,
      avatar_url: row.creator_avatar_url,
    },
    expires_at: row.expires_at,
    range_meters: row.range_meters,
    marker_state: row.marker_state === "expired_dot" ? "expired_dot" : "active",
  };
}

function dedupeById(items: MapAlert[]): MapAlert[] {
  const dedup: Record<string, MapAlert> = {};
  items.forEach((item) => {
    dedup[item.id] = item;
  });
  return Object.values(dedup);
}

type OwnPinState = {
  lat: number;
  lng: number;
  pinnedAt: string | null;
  markerState: "active";
  isInvisible: boolean;
};

const UUID_V4ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_PIN_ACTIVE_HOURS = 24;
const USER_PIN_RETENTION_HOURS = 24 * 7;

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
  const { user, profile, refreshProfile } = useAuth();
  const { isActive } = useSafetyRestrictions();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { showUpsellBanner } = useUpsellBanner();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapFallback, setMapFallback] = useState(false);
  const [mapInitNonce, setMapInitNonce] = useState(0);
  const hasInitialized = useRef(false);
  const lastMoveendRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const isPickingBroadcastLocationRef = useRef(false);
  const isBroadcastOpenRef = useRef(false);
  const initialViewportAppliedRef = useRef(false);
  const pinSnapAppliedRef = useRef(false);

  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showFriends, setShowFriends] = useState(true);
  const [showVets] = useState(false);
  const [visibleEnabled, setVisibleEnabled] = useState(false);
  const [dbAlerts, setDbAlerts] = useState<MapAlert[]>([]);
  const dbAlertsRef = useRef<MapAlert[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [friendPins, setFriendPins] = useState<FriendPin[]>([]);
  const [vetClinics, setVetClinics] = useState<VetClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<MapAlert | null>(null);
  const [alertFocusId, setAlertFocusId] = useState<string | null>(null);
  const [alertFocusThreadId, setAlertFocusThreadId] = useState<string | null>(null);
  const alertFocusRetriesRef = useRef(0);
  const [selectedVet, setSelectedVet] = useState<VetClinic | null>(null);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileName, setPublicProfileName] = useState<string>("");
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [publicProfileData, setPublicProfileData] = useState<Record<string, unknown> | null>(null);
  const [mapRestrictionModalOpen, setMapRestrictionModalOpen] = useState(false);
  const [hiddenAlerts, setHiddenAlerts] = useState<Set<string>>(new Set());
  const [pinning, setPinning] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastKnownOwnCoords, setLastKnownOwnCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPreviewPin, setBroadcastPreviewPin] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPreviewAddress, setBroadcastPreviewAddress] = useState<string | null>(null);
  const [draftBroadcastType, setDraftBroadcastType] = useState<"Stray" | "Lost" | "Caution" | "Others">("Stray");
  useEffect(() => {
    if (import.meta.env.DEV) console.debug("[USER_PIN]", userLocation);
  }, [userLocation]);
  useEffect(() => {
    if (import.meta.env.DEV) console.debug("[BROADCAST_PIN]", broadcastPreviewPin);
  }, [broadcastPreviewPin]);
  const [pinPersistedAt, setPinPersistedAt] = useState<string | null>(null);
  const [ownMarkerState, setOwnMarkerState] = useState<"active" | "expired_dot" | null>(null);
  const [pinAddressSnapshot, setPinAddressSnapshot] = useState<string | null>(null);
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();
  const defaultCenter = useMemo<[number, number]>(() => [114.1583, 22.2828], []);
  const hideFromMap = Boolean(profile?.hide_from_map);
  const ownMarkerCacheKey = useMemo(() => (user?.id ? `huddle:last-own-coords:${user.id}` : null), [user?.id]);
  const alertsCacheKey = useMemo(() => (user?.id ? `huddle:map-alerts:${user.id}` : null), [user?.id]);

  useEffect(() => {
    if (!ownMarkerCacheKey) {
      setLastKnownOwnCoords(null);
      return;
    }
    try {
      const raw = localStorage.getItem(ownMarkerCacheKey);
      if (!raw) {
        setLastKnownOwnCoords(null);
        return;
      }
      const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
      const lat = typeof parsed?.lat === "number" ? parsed.lat : null;
      const lng = typeof parsed?.lng === "number" ? parsed.lng : null;
      if (lat === null || lng === null) {
        setLastKnownOwnCoords(null);
        return;
      }
      setLastKnownOwnCoords({ lat, lng });
    } catch {
      setLastKnownOwnCoords(null);
    }
  }, [ownMarkerCacheKey]);

  const persistOwnMarkerCoords = useCallback((coords: { lat: number; lng: number }) => {
    setLastKnownOwnCoords(coords);
    if (!ownMarkerCacheKey) return;
    try {
      localStorage.setItem(ownMarkerCacheKey, JSON.stringify(coords));
    } catch {
      // best-effort cache only
    }
  }, [ownMarkerCacheKey]);

  const clearOwnMarkerCoordsCache = useCallback(() => {
    setLastKnownOwnCoords(null);
    if (!ownMarkerCacheKey) return;
    try {
      localStorage.removeItem(ownMarkerCacheKey);
    } catch {
      // best-effort cache only
    }
  }, [ownMarkerCacheKey]);

  const readCachedAlerts = useCallback((): MapAlert[] => {
    if (!alertsCacheKey) return [];
    try {
      const raw = localStorage.getItem(alertsCacheKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is MapAlert => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return typeof row.id === "string" && typeof row.latitude === "number" && typeof row.longitude === "number";
      });
    } catch {
      return [];
    }
  }, [alertsCacheKey]);

  const writeCachedAlerts = useCallback((alerts: MapAlert[]) => {
    if (!alertsCacheKey) return;
    try {
      localStorage.setItem(alertsCacheKey, JSON.stringify(alerts));
    } catch {
      // best-effort cache only
    }
  }, [alertsCacheKey]);

  const deriveOwnPinState = useCallback((profileRecord: Record<string, unknown> | null): OwnPinState | null => {
    const lat = typeof profileRecord?.last_lat === "number" ? profileRecord.last_lat : null;
    const lng = typeof profileRecord?.last_lng === "number" ? profileRecord.last_lng : null;
    if (lat === null || lng === null) return null;
    const pinnedUntil = typeof profileRecord?.location_pinned_until === "string"
      ? String(profileRecord.location_pinned_until)
      : null;
    const nowMs = Date.now();
    const pinnedMs = pinnedUntil ? new Date(pinnedUntil).getTime() : Number.NaN;
    if (Number.isFinite(pinnedMs) && pinnedMs > nowMs) {
      return {
        lat,
        lng,
        pinnedAt: pinnedUntil,
        markerState: "active",
        isInvisible: Boolean(profileRecord?.hide_from_map),
      };
    }
    return null;
  }, []);

  const getProfileActivePin = useCallback((): OwnPinState | null => {
    return deriveOwnPinState((profile || null) as Record<string, unknown> | null);
  }, [deriveOwnPinState, profile]);

  useEffect(() => {
    dbAlertsRef.current = dbAlerts;
  }, [dbAlerts]);

  useEffect(() => {
    const cached = readCachedAlerts();
    if (cached.length > 0) {
      setDbAlerts(cached);
    }
  }, [readCachedAlerts]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const helper = (coords?: { lat: number; lng: number }) => {
      const fallback = coords ?? userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
      setBroadcastPreviewPin(fallback);
      setBroadcastPreviewAddress(pinAddressSnapshot || null);
      setIsPickingBroadcastLocation(false);
      setIsBroadcastOpen(true);
      if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
    };
    (window as unknown as { __TEST_selectBroadcastLocation?: typeof helper }).__TEST_selectBroadcastLocation = helper;
    return () => {
      delete (window as unknown as { __TEST_selectBroadcastLocation?: typeof helper }).__TEST_selectBroadcastLocation;
    };
  }, [defaultCenter, pinAddressSnapshot, userLocation]);

  const lookupBroadcastAddress = useCallback(async (lat: number, lng: number) => {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}&types=address,place,locality,neighborhood&limit=1&language=en`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return String(data?.features?.[0]?.place_name || "").trim() || null;
    } catch {
      return null;
    }
  }, []);

  // Pinning system state
  const [pinningActive, setPinningActive] = useState(false);
  const [isPickingBroadcastLocation, setIsPickingBroadcastLocation] = useState(false);

  // Broadcast modal state
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  // Offline warning
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Styled confirmation modals
  const [showUnpinConfirm, setShowUnpinConfirm] = useState(false);
  const [showGpsModal, setShowGpsModal] = useState(false);
  // Invisible mode — Eye toggle
  const [isInvisible, setIsInvisible] = useState(false);
  useEffect(() => {
    (window as typeof window & { __HUDDLE_MAP__?: { initialized: boolean; fallback: boolean } }).__HUDDLE_MAP__ = {
      initialized: mapLoaded && !mapFallback,
      fallback: mapFallback,
    };
  }, [mapFallback, mapLoaded]);

  // Restore persisted pin only from DB for authenticated sessions.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const activePin = getProfileActivePin();
      if (!activePin) return;
      const next = { lat: activePin.lat, lng: activePin.lng };
      setUserLocation(next);
      persistOwnMarkerCoords(next);
      setVisibleEnabled(true);
      setIsInvisible(activePin.isInvisible);
      setPinPersistedAt(activePin.pinnedAt);
      setOwnMarkerState(activePin.markerState);
    })();
  }, [getProfileActivePin, persistOwnMarkerCoords, user]);

  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "plus" || effectiveTier === "gold";
  const viewRadiusMeters = 50000;

  const isPinned = useMemo(() => Boolean(userLocation), [userLocation]);

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

  useEffect(() => {
    isPickingBroadcastLocationRef.current = isPickingBroadcastLocation;
  }, [isPickingBroadcastLocation]);

  useEffect(() => {
    isBroadcastOpenRef.current = isBroadcastOpen;
  }, [isBroadcastOpen]);

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
    if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
  }, [defaultCenter, isPickingBroadcastLocation, mapFallback, userLocation]);

  // Sync pin-visible state from whether we currently have a self location/pin.
  useEffect(() => {
    if (userLocation) {
      setVisibleEnabled(true);
      return;
    }
    setVisibleEnabled(false);
  }, [userLocation]);

  // Privacy is an independent flag and must not drive pin/unpin state.
  useEffect(() => {
    setIsInvisible(hideFromMap);
  }, [hideFromMap]);

  // URL params: open broadcast mode / deep-link alert focus.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "broadcast") {
      setPinningActive(true);
    }
    const alertIdFromUrl = params.get("alert");
    const alertThreadFromUrl = params.get("thread");
    setAlertFocusId(alertIdFromUrl && alertIdFromUrl.trim() ? alertIdFromUrl.trim() : null);
    setAlertFocusThreadId(alertThreadFromUrl && alertThreadFromUrl.trim() ? alertThreadFromUrl.trim() : null);
    alertFocusRetriesRef.current = 0;
  }, [location.search]);

  // Default center (Hong Kong)

  const flyToWithDebug = useCallback(
    (source: string, options: mapboxgl.FlyToOptions) => {
      const isLikelyUserAction =
        source.startsWith("marker.") ||
        source.startsWith("refresh.") ||
        source.startsWith("reCenterOnGPS.") ||
        source === "manual.findOnMap";
      if ((isBroadcastOpenRef.current || isPickingBroadcastLocationRef.current) && !isLikelyUserAction) return;
      map.current?.flyTo(options);
    },
    []
  );

  const resolveProfileLocationCenter = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    const parts = [
      profile?.location_name?.trim() || "",
      profile?.location_district?.trim() || "",
      profile?.location_country?.trim() || "",
    ].filter(Boolean);
    if (!parts.length) return null;
    const query = parts.join(", ");
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}&types=address,place,locality,neighborhood&limit=1&language=en`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const payload = await response.json() as { features?: Array<{ center?: [number, number] }> };
      const center = payload.features?.[0]?.center;
      if (!center || center.length < 2) return null;
      return { lng: Number(center[0]), lat: Number(center[1]) };
    } catch {
      return null;
    }
  }, [profile?.location_country, profile?.location_district, profile?.location_name]);


  // Pin button re-centers on live GPS when already pinned
  const reCenterOnGPS = useCallback(() => {
    if (!navigator.geolocation || !map.current) return;
    if (import.meta.env.DEV) console.debug("[PIN] Re-centering on live GPS...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (import.meta.env.DEV) console.debug(`[PIN] Re-center GPS Success: lat=${lat}, lng=${lng}`);
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

  // ==========================================================================
  // GPS Required Modal — same app/device settings deep-link contract as Discover
  // ==========================================================================
  const openDeviceLocationSettings = () => {
    const isIos = /ipad|iphone|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);

    if (isIos) {
      openExternalUrl("app-settings:", "map-app-settings");
      return;
    }

    if (isAndroid) {
      openExternalUrl(
        "intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end",
        "map-app-settings"
      );
      return;
    }

    toast.info("Please open Settings and enable Location Services for Huddle.");
  };

  // ==========================================================================
  // Pin / Unpin Location
  // ==========================================================================

  // ============================================================
  // GPS pin workflow (spec): live GPS only, no production mock fallback
  // ============================================================
  const applyPinLocation = useCallback(async (lat: number, lng: number, source: string) => {
    if (import.meta.env.DEV) console.debug(`[PIN] applyPinLocation — source=${source}, lat=${lat}, lng=${lng}`);
    if (!user?.id) {
      toast.error("Please login to pin location");
      setPinning(false);
      return;
    }

    const resolvedAddress = pinAddressSnapshot || (await lookupBroadcastAddress(lat, lng)) || null;
    if (resolvedAddress) setPinAddressSnapshot(resolvedAddress);

    if (import.meta.env.DEV) console.debug("[PIN] Saving to DB — set_user_location RPC...");
    const { error: profileVisibilityError } = await supabase
      .from("profiles")
      .update({ hide_from_map: false } as Record<string, unknown>)
      .eq("id", user.id);
    if (profileVisibilityError) {
      if (import.meta.env.DEV) console.error("[PIN] profile hide_from_map update failed", profileVisibilityError);
      setPinning(false);
      toast.error("Failed to pin location");
      return;
    }

    const { error: setLocationError } = await supabase.rpc("set_user_location", {
      p_lat: lat,
      p_lng: lng,
      p_pin_hours: USER_PIN_ACTIVE_HOURS,
      p_retention_hours: USER_PIN_RETENTION_HOURS,
      p_address: resolvedAddress,
    });
    if (setLocationError) {
      if (import.meta.env.DEV) console.error("[PIN] set_user_location failed", setLocationError);
      setPinning(false);
      toast.error("Failed to pin location");
      return;
    }

    const pinnedAt = new Date().toISOString();
    setUserLocation({ lat, lng });
    setOwnMarkerState("active");
    setPinPersistedAt(pinnedAt);
    if (import.meta.env.DEV) console.debug("[PIN] Pin State Updated: pinPersistedAt=", pinnedAt);
    persistOwnMarkerCoords({ lat, lng });

    flyToWithDebug("pin.apply", { center: [lng, lat], zoom: 15.5 });

    setVisibleEnabled(true);
    setIsInvisible(false);
    setPinning(false);
    if (import.meta.env.DEV) console.debug(`[PIN] ✅ Pin State Updated: pinned=true, visible=true (via ${source})`);
    toast.success(`Location pinned (${source})`);
  }, [flyToWithDebug, lookupBroadcastAddress, persistOwnMarkerCoords, pinAddressSnapshot, user?.id]);

  const requestPinFromLiveGps = useCallback(() => {
    // No secure context — GPS cannot work at all.
    if (!window.isSecureContext) {
      setShowGpsModal(true);
      return;
    }
    // Browser does not support Geolocation API.
    if (!navigator.geolocation) {
      setShowGpsModal(true);
      return;
    }

    const runGetCurrentPosition = () => {
      setPinning(true);
      if (import.meta.env.DEV) console.debug("[PIN] GPS Request Sent — enableHighAccuracy=true, timeout=7000ms");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (import.meta.env.DEV) console.debug(`[PIN] GPS Success: lat=${pos.coords.latitude}, lng=${pos.coords.longitude}, accuracy=${pos.coords.accuracy}m`);
          await applyPinLocation(pos.coords.latitude, pos.coords.longitude, "GPS");
        },
        (err) => {
          if (import.meta.env.DEV) console.debug(`[PIN] GPS Error: code=${err.code}, message=${err.message}`);
          setPinning(false);
          // PERMISSION_DENIED (1) — user blocked location for this app.
          // POSITION_UNAVAILABLE (2) — device location services off.
          // TIMEOUT (3) — no GPS fix within timeout; treat as unavailable.
          // All cases: show GPS required modal. No silent fallback, no stale pin.
          setShowGpsModal(true);
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
      );
    };

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (status.state === "denied") {
            // Permission already denied — show modal immediately, skip API call.
            setShowGpsModal(true);
            return;
          }
          // "granted" or "prompt" — attempt live GPS; modal fires on any error.
          runGetCurrentPosition();
        })
        .catch(() => {
          // Permissions API not available (some iOS WebViews) — attempt anyway.
          runGetCurrentPosition();
        });
      return;
    }

    runGetCurrentPosition();
  }, [applyPinLocation]);

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
    const { error: clearProfilePinError } = await supabase.rpc("clear_user_location_pin");
    const { error: pinDeleteError } = await supabase.from("pins").delete().eq("user_id", user.id).is("thread_id", null);
    const { error: userLocationError } = await supabase
      .from("user_locations")
      .update({
        is_public: false,
        expires_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("user_id", user.id);
    const unpinError = clearProfilePinError ?? pinDeleteError ?? userLocationError;
    if (unpinError) {
      toast.error(t("Failed to unpin location"));
      return;
    }
    setPinPersistedAt(null);
    setOwnMarkerState(null);
    setIsInvisible(false);
    setUserLocation(null);
    clearOwnMarkerCoordsCache();
    setFriendPins([]);
    setSelectedAlert(null);
    setSelectedVet(null);
    setBroadcastPreviewPin(null);
    setPinningActive(false);
    setPinAddressSnapshot(null);
    setVisibleEnabled(false);
    toast.success("Unpinned");
  };

  // Single green button toggle: ON = pinned (green), OFF = grey
  const handlePinToggle = () => {
    if (isPinned || visibleEnabled) {
      handleUnpinMyLocation();
    } else {
      // Do NOT set visibleEnabled here — GPS must succeed first.
      requestPinFromLiveGps();
    }
  };

  // Invisible mode toggle — Brand Blue eye icon
  const toggleInvisible = async () => {
    if (!user) return;
    const newInvisible = !isInvisible;
    setIsInvisible(newInvisible);
    if (import.meta.env.DEV) console.debug(`[PIN] Invisible mode toggled: ${newInvisible ? "INVISIBLE" : "VISIBLE"}`);
    await supabase
      .from("profiles")
      .update({ hide_from_map: newInvisible } as Record<string, unknown>)
      .eq("id", user.id);
    await refreshProfile();
    void fetchFriendPins();
    void fetchAlerts();
    if (newInvisible) {
      toast.info("Masked as Incognito");
    } else {
      toast.success("Incognito disabled");
    }
  };

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
      if (import.meta.env.DEV) console.error("Error fetching vet/pet-shop from cache:", error);
      if (ENABLE_DEMO_DATA) {
        setVetClinics([
          { id: "vet-1", name: t("map.vet.hk_clinic"), lat: 22.2855, lng: 114.1577, is24h: true, isOpen: true, rating: 4.8, type: "veterinary" },
          { id: "vet-2", name: t("map.vet.central_hospital"), lat: 22.2820, lng: 114.1588, is24h: false, isOpen: false, rating: 4.6, type: "veterinary" },
          { id: "vet-3", name: t("map.vet.wan_chai"), lat: 22.2770, lng: 114.1730, is24h: true, isOpen: true, rating: 4.7, type: "veterinary" },
          { id: "vet-4", name: t("map.vet.kowloon"), lat: 22.3018, lng: 114.1695, is24h: false, isOpen: true, rating: 4.5, type: "pet_shop" },
        ]);
      } else {
        setVetClinics([]);
        toast.error("Unable to load nearby clinics right now.");
      }
    }
  }, [t]);

  // ==========================================================================
  // Map Initialization (singleton + one-time auto-snap)
  // ==========================================================================
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const container = mapContainer.current;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const attachMap = () => {
      if (cancelled || map.current || !mapContainer.current) return;
      const rect = mapContainer.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const initialCenter: [number, number] = userLocation
        ? [userLocation.lng, userLocation.lat]
        : defaultCenter;

      if (import.meta.env.DEV) console.debug("[MAP_INIT] mapboxgl.Map typeof =", typeof mapboxgl?.Map);
      if (!mapboxgl?.Map || typeof mapboxgl.Map !== "function") {
        if (import.meta.env.DEV) console.error("[MAP_INIT] mapboxgl.Map missing: bad import or name collision");
        setMapFallback(true);
        setMapLoaded(false);
        return;
      }
      const supported = mapboxgl.supported({ failIfMajorPerformanceCaveat: false });
      if (!supported) {
        if (import.meta.env.DEV) console.warn("[MAP_INIT] mapboxgl unsupported");
        setMapFallback(true);
        setMapLoaded(false);
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
        setMapFallback(false);
      } catch (error) {
        if (import.meta.env.DEV) console.error("[MAP_INIT] mapboxgl init failed", error);
        setMapFallback(true);
        setMapLoaded(false);
        return;
      }

      map.current.once("render", () => {
        setMapLoaded(true);
        requestAnimationFrame(() => map.current?.resize());
      });

      map.current.on("load", () => {
        setMapLoaded(true);
        if (!hasInitialized.current && userLocation) {
          flyToWithDebug("map.load.initialSnap", {
            center: [userLocation.lng, userLocation.lat],
            zoom: PROXIMITY_ZOOM,
            essential: true,
            duration: 2000,
          });
          hasInitialized.current = true;
        }
        requestAnimationFrame(() => map.current?.resize());
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
      });
      map.current.on("click", (event) => {
        if (!isPickingBroadcastLocationRef.current) return;
        const next = { lat: event.lngLat.lat, lng: event.lngLat.lng };
        setBroadcastPreviewPin(next);
        void lookupBroadcastAddress(next.lat, next.lng).then((address) => {
          setBroadcastPreviewAddress(address || pinAddressSnapshot || null);
        });
        setIsPickingBroadcastLocation(false);
        setIsBroadcastOpen(true);
        if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: next.lat, lng: next.lng });
      });

      map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    };

    observer = new ResizeObserver(() => {
      if (!map.current) {
        attachMap();
        return;
      }
      requestAnimationFrame(() => map.current?.resize());
    });
    observer.observe(container);
    attachMap();

    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
  }, [defaultCenter, flyToWithDebug, lookupBroadcastAddress, mapInitNonce, pinAddressSnapshot, userLocation]);

  const handleFallbackClick = useCallback(() => {
    if (!isPickingBroadcastLocation) return;
    const fallback = userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
    setBroadcastPreviewPin(fallback);
    setBroadcastPreviewAddress(pinAddressSnapshot || null);
    setIsPickingBroadcastLocation(false);
    setIsBroadcastOpen(true);
    if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
  }, [defaultCenter, isPickingBroadcastLocation, pinAddressSnapshot, userLocation]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => { requestAnimationFrame(() => map.current?.resize()); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // First viewport priority:
  // 1) existing pin/userLocation — always wins, even overrides a fallback already applied
  // 2) last known profile coordinates — applied once if pin not yet available
  // 3) profile location text geocoded to area — applied once if no coords either
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const apply = async () => {
      if (!map.current) return;
      // Pin snap always wins — overrides any previously applied fallback
      if (userLocation && !pinSnapAppliedRef.current) {
        flyToWithDebug("init.userPin", { center: [userLocation.lng, userLocation.lat], zoom: 15.5 });
        pinSnapAppliedRef.current = true;
        initialViewportAppliedRef.current = true;
        return;
      }
      // Fallback: only apply once, while pin hasn't arrived yet
      if (initialViewportAppliedRef.current) return;
      if (typeof profile?.last_lat === "number" && typeof profile?.last_lng === "number") {
        flyToWithDebug("init.profileLast", { center: [profile.last_lng, profile.last_lat], zoom: 14.5 });
        initialViewportAppliedRef.current = true;
        return;
      }
      const geocoded = await resolveProfileLocationCenter();
      if (geocoded) {
        flyToWithDebug("init.profileStreet", { center: [geocoded.lng, geocoded.lat], zoom: 14.5 });
        initialViewportAppliedRef.current = true;
      }
    };
    void apply();
  }, [
    flyToWithDebug,
    mapLoaded,
    profile?.last_lat,
    profile?.last_lng,
    resolveProfileLocationCenter,
    userLocation,
  ]);

  useEffect(() => {
    const applyControlOffset = () => {
      const node = document.querySelector<HTMLElement>(".mapboxgl-ctrl-bottom-right");
      if (!node) return;
      node.style.right = "12px";
      node.style.bottom = `calc(var(--nav-height,64px) + env(safe-area-inset-bottom) + 120px)`;
    };
    applyControlOffset();
    const id = window.setInterval(applyControlOffset, 500);
    return () => window.clearInterval(id);
  }, [isBroadcastOpen, mapLoaded]);

  // NOTE: Do not auto-fly on userLocation changes to prevent map blinking.

  // ==========================================================================
  // Fetch dbAlerts
  // ==========================================================================
  useEffect(() => {
    if (!profile?.id) {
      setBlockedUserIds(new Set());
      return;
    }
    void (async () => {
      const ids = await loadBlockedUserIdsFor(profile.id);
      setBlockedUserIds(ids);
    })();
  }, [profile?.id]);

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
      const mapped = (Array.isArray(data) ? (data as VisibleMapAlertRow[]) : []).map(mapVisibleAlertRowToMapAlert);
      const nowMs = Date.now();
      const graceMs = 7 * 24 * 60 * 60 * 1000;
      const rpcIds = new Set(mapped.map((item) => item.id));
      const fallbackDots: MapAlert[] = readCachedAlerts()
        .filter((row) => !rpcIds.has(row.id))
        .filter((row) => {
          const baseMs = row.expires_at ? new Date(row.expires_at).getTime() : new Date(row.created_at).getTime();
          return Number.isFinite(baseMs) && baseMs + graceMs > nowMs;
        })
        .map((row) => ({
          ...row,
          marker_state: "expired_dot",
        }));
      const visibleOnly = mapped
        .concat(fallbackDots)
        .filter((row, index, all) => all.findIndex((entry) => entry.id === row.id) === index)
        .filter((row): row is MapAlert => row.marker_state !== "hidden")
        .filter((row) => !(row.creator_id && blockedUserIds.has(row.creator_id)));
      setDbAlerts(visibleOnly);
      writeCachedAlerts(visibleOnly);
      return visibleOnly;
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error fetching dbAlerts:", error);
      const cached = readCachedAlerts();
      if (cached.length > 0) {
        setDbAlerts(cached);
        return cached;
      }
      return dbAlertsRef.current;
    } finally {
      setLoading(false);
    }
  }, [blockedUserIds, defaultCenter, profile?.last_lat, profile?.last_lng, readCachedAlerts, userLocation?.lat, userLocation?.lng, writeCachedAlerts]);

  const fetchAlertByIdForDeepLink = useCallback(async (alertId: string): Promise<MapAlert | null> => {
    const trimmedAlertId = String(alertId || "").trim();
    if (!trimmedAlertId) return null;
    if (!UUID_V4ISH.test(trimmedAlertId)) return null;
    try {
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "get_broadcast_alert_by_id",
        { p_alert_id: trimmedAlertId },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as VisibleMapAlertRow | undefined) : undefined;
      if (!row || !row.id) return null;
      return mapVisibleAlertRowToMapAlert(row);
    } catch (error) {
      if (import.meta.env.DEV) console.error("[DEEPLINK_ALERT_FETCH_ERROR]", error);
      return null;
    }
  }, []);

  const fetchAlertByThreadForDeepLink = useCallback(async (threadId: string): Promise<MapAlert | null> => {
    const trimmedThreadId = String(threadId || "").trim();
    if (!trimmedThreadId) return null;
    try {
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "get_social_feed_alert_context",
        { p_thread_ids: [trimmedThreadId] },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as { map_id?: string | null } | undefined) : undefined;
      const alertId = String(row?.map_id || "").trim();
      if (!alertId) return null;
      return await fetchAlertByIdForDeepLink(alertId);
    } catch (error) {
      if (import.meta.env.DEV) console.error("[DEEPLINK_THREAD_ALERT_FETCH_ERROR]", error);
      return null;
    }
  }, [fetchAlertByIdForDeepLink]);

  // Fetch vet clinics on mount
  useEffect(() => { fetchVetClinics(); }, [fetchVetClinics]);

  // Fetch dbAlerts on entry; keep map static unless user refreshes.
  useEffect(() => {
    void fetchAlerts();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!user) { setFriendPins([]); return; }
      const lat = userLocation?.lat ?? (profile?.last_lat ?? defaultCenter[1]);
      const lng = userLocation?.lng ?? (profile?.last_lng ?? defaultCenter[0]);
      const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)("get_friend_pins_nearby", {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: viewRadiusMeters,
      });
      if (error) throw error;
      const dbPins = (Array.isArray(data) ? data : []) as FriendPin[];
      if (dbPins.length > 0) {
        const visiblePins = dbPins.filter((pin) => pin.marker_state !== "expired_dot");
        const friendIds = visiblePins.map((pin) => pin.id).filter(Boolean);
        if (friendIds.length > 0) {
          const { data: profileRows } = await supabase
            .from("profiles")
            .select("id,is_verified,gender_genre,hide_from_map")
            .in("id", friendIds);
          const profileById = new Map<
            string,
            { is_verified: boolean; gender_genre: string | null; hide_from_map: boolean }
          >(
            (
              (profileRows || []) as Array<{
                id: string;
                is_verified?: boolean | null;
                gender_genre?: string | null;
                hide_from_map?: boolean | null;
              }>
            ).map((row) => [
              row.id,
              {
                is_verified: row.is_verified === true,
                gender_genre: row.gender_genre ?? null,
                hide_from_map: row.hide_from_map === true,
              },
            ])
          );
          setFriendPins(
            visiblePins.map((pin) => ({
              ...pin,
              is_verified: profileById.get(pin.id)?.is_verified ?? false,
              gender_genre: profileById.get(pin.id)?.gender_genre ?? null,
              is_invisible: profileById.get(pin.id)?.hide_from_map ?? false,
            }))
          );
        } else {
          setFriendPins(visiblePins);
        }
      } else {
        setFriendPins([]);
      }
    } catch {
      // Preserve the current overlay on transient failures.
    }
  }, [defaultCenter, profile?.last_lat, profile?.last_lng, user, userLocation?.lat, userLocation?.lng, viewRadiusMeters]);

  const fetchCurrentPinState = useCallback(async () => {
    if (!user?.id) {
      setUserLocation(null);
      clearOwnMarkerCoordsCache();
      setVisibleEnabled(false);
      setPinPersistedAt(null);
      setOwnMarkerState(null);
      setPinAddressSnapshot(null);
      setIsInvisible(false);
      return null;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("last_lat,last_lng,location_pinned_until,location_retention_until,hide_from_map")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // Keep current UI pin state on transient fetch failure.
      return userLocation;
    }
    const activePin = deriveOwnPinState((data || null) as Record<string, unknown> | null);
    if (!activePin) {
      setUserLocation(null);
      clearOwnMarkerCoordsCache();
      setVisibleEnabled(false);
      setPinPersistedAt(null);
      setOwnMarkerState(null);
      setPinAddressSnapshot(null);
      setIsInvisible(false);
      return null;
    }
    const next = { lat: activePin.lat, lng: activePin.lng };
    setUserLocation(next);
    persistOwnMarkerCoords(next);
    setVisibleEnabled(true);
    setIsInvisible(activePin.isInvisible);
    setPinPersistedAt(activePin.pinnedAt);
    setOwnMarkerState(activePin.markerState);
    return next;
  }, [clearOwnMarkerCoordsCache, deriveOwnPinState, persistOwnMarkerCoords, user?.id, userLocation]);

  const focusMapTarget = useCallback((source: string, lat: number, lng: number) => {
    flyToWithDebug(source, { center: [lng, lat], zoom: 15.5 });
  }, [flyToWithDebug]);

  useEffect(() => {
    if (!alertFocusId && !alertFocusThreadId) return;
    const focusKey = alertFocusId || alertFocusThreadId || "";
    if (!focusKey) return;
    const target = dbAlerts.find((item) => item.id === alertFocusId);
    if (target) {
      setShowAlerts(true);
      focusMapTarget("deeplink.alert", target.latitude, target.longitude);
      setSelectedAlert(target);
      setAlertFocusId(null);
      setAlertFocusThreadId(null);
      return;
    }
    if (alertFocusRetriesRef.current >= 5) {
      void (async () => {
        const byThread = alertFocusThreadId ? await fetchAlertByThreadForDeepLink(alertFocusThreadId) : null;
        const byId = alertFocusId ? await fetchAlertByIdForDeepLink(alertFocusId) : null;
        const resolved = byThread ?? byId;
        if (resolved) {
          setDbAlerts((prev) => dedupeById([resolved, ...prev]));
          setShowAlerts(true);
          focusMapTarget("deeplink.alert.resolved", resolved.latitude, resolved.longitude);
          setSelectedAlert(resolved);
          setAlertFocusId(null);
          setAlertFocusThreadId(null);
          return;
        }
        toast.info("That alert is no longer available.");
        setAlertFocusId(null);
        setAlertFocusThreadId(null);
      })();
      return;
    }
    alertFocusRetriesRef.current += 1;
    const timer = window.setTimeout(() => {
      void (async () => {
        const byThread = alertFocusThreadId ? await fetchAlertByThreadForDeepLink(alertFocusThreadId) : null;
        const byId = alertFocusId ? await fetchAlertByIdForDeepLink(alertFocusId) : null;
        const resolved = byThread ?? byId;
        if (resolved) {
          setDbAlerts((prev) => dedupeById([resolved, ...prev]));
          setShowAlerts(true);
          focusMapTarget("deeplink.alert.retry", resolved.latitude, resolved.longitude);
          setSelectedAlert(resolved);
          setAlertFocusId(null);
          setAlertFocusThreadId(null);
          return;
        }
        await fetchAlerts();
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [alertFocusId, alertFocusThreadId, dbAlerts, fetchAlertByIdForDeepLink, fetchAlertByThreadForDeepLink, fetchAlerts, focusMapTarget]);

  const openPublicProfileSheet = useCallback(
    async (userId: string, fallbackName: string) => {
      setPublicProfileUserId(userId);
      setPublicProfileName(fallbackName);
      setPublicProfileOpen(true);
      setPublicProfileData(null);
      setPublicProfileLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!showFriends) return;
    void fetchFriendPins();
  }, [fetchFriendPins, showFriends, userLocation?.lat, userLocation?.lng]);

  useEffect(() => {
    if (!selectedAlert) return;
    const updated = dbAlerts.find((row) => row.id === selectedAlert.id) || null;
    if (updated) {
      if (updated !== selectedAlert) setSelectedAlert(updated);
    }
  }, [dbAlerts, selectedAlert]);

  const refreshMapData = useCallback(async () => {
    setPullRefreshing(true);
    try {
      const localPinSnapshot = userLocation;
      setBroadcastPreviewPin(null);
      setSelectedAlert(null);
      setSelectedVet(null);
      const [pinState] = await Promise.all([fetchCurrentPinState(), fetchAlerts(), fetchVetClinics(), fetchFriendPins()]);
      if (pinState) {
        flyToWithDebug("refresh.pinned", { center: [pinState.lng, pinState.lat], zoom: 15.5 });
      } else if (localPinSnapshot) {
        // Preserve local pin position when backend read momentarily lags.
        flyToWithDebug("refresh.localPinned", { center: [localPinSnapshot.lng, localPinSnapshot.lat], zoom: 15.5 });
      } else if (userLocation && map.current) {
        flyToWithDebug("refresh.fallback", {
          center: [userLocation.lng, userLocation.lat],
          zoom: 14,
        });
      } else if (isPinned || visibleEnabled) {
        // Avoid forcing a fresh GPS read during manual refresh.
        // This prevents browser/location-provider transient errors from breaking pin UX.
        const geocoded = await resolveProfileLocationCenter();
        if (geocoded) {
          flyToWithDebug("refresh.visibleProfileStreet", { center: [geocoded.lng, geocoded.lat], zoom: 14.5 });
        }
      } else if (typeof profile?.last_lat === "number" && typeof profile?.last_lng === "number") {
        flyToWithDebug("refresh.profileLast", { center: [profile.last_lng, profile.last_lat], zoom: 14.5 });
      } else {
        const geocoded = await resolveProfileLocationCenter();
        if (geocoded) {
          flyToWithDebug("refresh.profileStreet", { center: [geocoded.lng, geocoded.lat], zoom: 14.5 });
        }
      }
    } finally {
      setPullRefreshing(false);
    }
  }, [
    fetchAlerts,
    fetchCurrentPinState,
    fetchFriendPins,
    fetchVetClinics,
    flyToWithDebug,
    isPinned,
    profile?.last_lat,
    profile?.last_lng,
    resolveProfileLocationCenter,
    userLocation,
    visibleEnabled,
  ]);

  // Reset on mount
  useEffect(() => {
    setHiddenAlerts(new Set());
    setSelectedAlert(null);
    setSelectedVet(null);
  }, []);

  // ==========================================================================
  // Broadcast: start a NEW draft pin flow every time
  // ==========================================================================
  const openBroadcast = () => {
    if (isActive("map_disabled")) {
      setMapRestrictionModalOpen(true);
      return;
    }
    setBroadcastPreviewPin(null);
    setIsPickingBroadcastLocation(false);
    setIsBroadcastOpen(true);
  };

  const renderPinsSource = useMemo(
    () => dedupeById([...dbAlerts]),
    [dbAlerts]
  );

  const friendOverlayPins = useMemo<FriendOverlayPin[]>(() => {
    if (!showFriends) return [];
    const pins: FriendOverlayPin[] = [];
    friendPins.forEach((p) => {
      if (p.marker_state === "expired_dot") return;
      if (typeof p.last_lng !== "number" || typeof p.last_lat !== "number") return;
      if (user?.id && p.id === user.id) return;
      pins.push({
        id: p.id,
        name: p.display_name || "Friend",
        lat: p.last_lat,
        lng: p.last_lng,
        avatarUrl: p.avatar_url,
        isVerified: Boolean(p.is_verified),
        isInvisible: Boolean(p.is_invisible),
        genderBucket: normalizeGenderBucket(p.gender_genre),
        sessionMarker: p.location_pinned_until,
        markerState: "active",
      });
    });
    return pins;
  }, [friendPins, showFriends, user?.id]);

  const ownMarkerCoords = useMemo<{ lat: number; lng: number } | null>(() => {
    if (userLocation) return userLocation;
    return null;
  }, [userLocation]);

  const filteredPins = useMemo(
    () =>
      renderPinsSource.filter((alert) => {
        if (hiddenAlerts.has(alert.id)) return false;
        return true;
      }),
    [hiddenAlerts, renderPinsSource]
  );

  useEffect(() => {
    const activeCount = dbAlerts.filter((alert) => alert.marker_state !== "expired_dot").length;
    const expiredDotCount = dbAlerts.filter((alert) => alert.marker_state === "expired_dot").length;
    if (import.meta.env.DEV) console.debug("[PINS]", {
      db: dbAlerts.length,
      render: renderPinsSource.length,
      filtered: filteredPins.length,
      active: activeCount,
      expired_dot: expiredDotCount,
    });
  }, [dbAlerts, filteredPins.length, renderPinsSource.length]);

  const unpinnedHint = useMemo(() => {
    if (pinningActive || isPinned) return null;
    if (showAlerts && showFriends) return "Pin location to see happenings and friends nearby.";
    if (showAlerts) return "Pin location to see accurate happenings nearby.";
    if (showFriends) return "Pin location to see friends nearby.";
    return null;
  }, [isPinned, pinningActive, showAlerts, showFriends]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      <GlobalHeader />
      {/* Map canvas — below GlobalHeader */}
      <div
        className="flex-1 relative overflow-hidden"
      >
        {loading && !mapLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : null}

        <div
          ref={mapContainer}
          className="h-full w-full relative overflow-hidden"
        >
          {mapFallback && (
            <div className="absolute inset-0 z-[1500] flex items-center justify-center bg-card/95 px-6 text-center">
              <div className="max-w-[280px] rounded-2xl border border-border bg-background/95 p-5 shadow-elevated">
                <p className="text-base font-semibold text-brandText">Map failed to load</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  We couldn’t initialize the map. Retry to recheck size and start Mapbox again.
                </p>
                <NeuControl
                  type="button"
                  size="md"
                  fullWidth
                  className="mt-4"
                  onClick={() => {
                    setMapFallback(false);
                    setMapLoaded(false);
                    setMapInitNonce((value) => value + 1);
                  }}
                >
                  Retry
                </NeuControl>
                {isPickingBroadcastLocation && (
                  <NeuControl
                    type="button"
                    variant="secondary"
                    size="md"
                    fullWidth
                    className="mt-2"
                    onClick={handleFallbackClick}
                  >
                    Use current location instead
                  </NeuControl>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Spec: Offline warning banner */}
        {isOffline && (
          <div className="absolute top-0 left-0 right-0 z-[1100] bg-red-500 text-white text-center text-xs py-2 flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            You are offline. Map data may be outdated.
          </div>
        )}

        {isPickingBroadcastLocation && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-[1700] rounded-full bg-black/80 px-4 py-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis text-white max-w-[92vw] pointer-events-none"
            style={{ bottom: "calc(var(--nav-height,64px) + env(safe-area-inset-bottom) + 75px)" }}
          >
            Tap on map to choose location
          </div>
        )}

        {/* ================================================================ */}
        {/* FLOATING CONTROL ROW — Alerts / Friends / Vets / Actions         */}
        {/* ================================================================ */}
        <div className="absolute inset-x-0 z-[1600] flex items-center justify-center pointer-events-none px-4"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div className="w-full max-w-[440px] px-1 flex items-center pointer-events-none">
            <div className="rounded-full bg-white/30 backdrop-blur-md border border-white/40 px-1 py-1 flex items-center gap-1 pointer-events-auto shadow-md">
              <NeuControl
                size="icon-md"
                variant={showAlerts ? "primary" : "tertiary"}
                selected={showAlerts}
                aria-label="Alerts"
                onClick={() => setShowAlerts((v) => !v)}
              >
                <Bell />
              </NeuControl>
              <NeuControl
                size="icon-md"
                variant={showFriends ? "primary" : "tertiary"}
                selected={showFriends}
                aria-label="Friends"
                onClick={() => setShowFriends((v) => !v)}
              >
                <Users />
              </NeuControl>
            </div>
            <div className="ml-2 flex items-center pointer-events-auto">
              <button
                onClick={() => void refreshMapData()}
                className="w-11 h-11 rounded-full bg-white/30 backdrop-blur-md border border-white/40 shadow-md flex items-center justify-center touch-manipulation"
                aria-label="Refresh"
              >
                <RefreshCw className={cn("w-4 h-4 text-[var(--text-secondary)]", pullRefreshing && "animate-spin")} />
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1 pointer-events-auto">
              {(isPinned || visibleEnabled) && (
                <button
                  onClick={toggleInvisible}
                  className={cn(
                    "w-11 h-11 rounded-full bg-white/30 backdrop-blur-md border border-white/40 shadow-md flex items-center justify-center touch-manipulation transition-colors"
                  )}
                  aria-label={isInvisible ? "Incognito enabled (tap to disable)" : "Incognito disabled (tap to enable)"}
                >
                  {isInvisible ? (
                    <EyeOff className="w-5 h-5 text-[var(--text-secondary)]" />
                  ) : (
                    <Eye className="w-5 h-5 text-[#2145CF]" />
                  )}
                </button>
              )}
              <button
                onClick={handlePinToggle}
                disabled={pinning}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-colors touch-manipulation",
                  isPinned || visibleEnabled
                    ? "bg-[#A6D539]"
                    : "bg-white/30 backdrop-blur-md border border-white/40"
                )}
                aria-label={isPinned ? "Pinned (tap to unpin)" : "Pin my location"}
              >
                {pinning ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                ) : (
                  <MapPin className={cn("w-5 h-5", isPinned || visibleEnabled ? "text-white" : "text-[var(--text-secondary)]")} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* SECOND ROW: Invisible Subtext (RIGHT)                            */}
        {/* ================================================================ */}
        {isInvisible && (isPinned || visibleEnabled) && !pinningActive && (
          <div className="absolute top-16 right-4 z-[1650] pointer-events-auto">
            <span className="text-xs bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm text-muted-foreground">
              Masked as Incognito
            </span>
          </div>
        )}

        {map.current && !isPickingBroadcastLocation && showVets && vetClinics.length > 0 && (
          <VetMarkersOverlay
            map={map.current}
            vets={vetClinics}
            onSelect={(id) => {
              const vet = vetClinics.find((v) => v.id === id);
              if (!vet) return;
              focusMapTarget("marker.vet.click", vet.lat, vet.lng);
              setSelectedVet(vet);
            }}
          />
        )}

        {map.current && !isPickingBroadcastLocation && showFriends && friendOverlayPins.length > 0 && (
          <FriendMarkersOverlay
            map={map.current}
            friends={friendOverlayPins}
            onSelect={(id) => {
              const friend = friendOverlayPins.find((f) => f.id === id);
              if (!friend) return;
              focusMapTarget("marker.friend.click", friend.lat, friend.lng);
              const pin = friendPins.find((p) => p.id === friend.id);
              if (pin) {
                void openPublicProfileSheet(
                  pin.id,
                  pin.display_name || "Friend"
                );
              }
            }}
          />
        )}

        {map.current && !isPickingBroadcastLocation && ownMarkerCoords && (
          <BlueDotMarker
            map={map.current}
            coords={ownMarkerCoords}
            displayName={profile?.display_name || user?.email || "Me"}
            avatarUrl={profile?.avatar_url || null}
            isVerified={profile?.is_verified === true}
            isInvisible={isInvisible}
            genderBucket={normalizeGenderBucket(profile?.gender_genre)}
            sessionMarker={pinPersistedAt}
            markerState={ownMarkerState || "active"}
          />
        )}
        {map.current && broadcastPreviewPin && (
          <BroadcastMarker map={map.current} coords={broadcastPreviewPin} alertType={draftBroadcastType} />
        )}
        {map.current && !isPickingBroadcastLocation && showAlerts && (
          <AlertMarkersOverlay
            map={map.current}
            alerts={filteredPins}
            onSelect={(alertId) => {
              const alert = filteredPins.find((pin) => pin.id === alertId);
              if (!alert) return;
              focusMapTarget(alert.is_demo ? "marker.demoAlert.click" : "marker.alert.click", alert.latitude, alert.longitude);
              setSelectedAlert(alert);
            }}
          />
        )}

        {/* ================================================================ */}
        {/* BOTTOM: Broadcast CTA + Unpinned Hint                            */}
        {/* ================================================================ */}
        {!isBroadcastOpen && (
          <>
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-[440px] z-[1700] pointer-events-none"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 72px)" }}
            >
              <div className="min-h-[30px]">
                {unpinnedHint && !isPickingBroadcastLocation && (
                  <p className="text-xs text-center text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-3 py-1.5">
                    {unpinnedHint}
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {!isBroadcastOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+68px)] z-[1700] w-[calc(100%-32px)] max-w-[440px] pointer-events-none">
            <button
              className="h-14 w-14 rounded-full border border-white/40 bg-white/30 shadow-md backdrop-blur-md flex items-center justify-center pointer-events-auto"
              aria-label={t("map.broadcast")}
              onClick={openBroadcast}
            >
              <PenSquare size={20} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* BroadcastModal — full-screen creation with tier gating            */}
      {/* ================================================================ */}
      <BroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => {
          setIsBroadcastOpen(false);
          setIsPickingBroadcastLocation(false);
          setPinningActive(false);
          setBroadcastPreviewPin(null);
          setBroadcastPreviewAddress(null);
        }}
        selectedLocation={broadcastPreviewPin}
        selectedAddress={broadcastPreviewAddress}
        alertType={draftBroadcastType}
        onAlertTypeChange={(next) => setDraftBroadcastType((next === "Lost" || next === "Caution" || next === "Others") ? next : "Stray")}
        onRequestPinLocation={() => {
          if (isActive("map_disabled")) {
            setMapRestrictionModalOpen(true);
            return;
          }
          if (!map.current) {
            const fallback = userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
            setBroadcastPreviewPin(fallback);
            setBroadcastPreviewAddress(pinAddressSnapshot || null);
            setIsPickingBroadcastLocation(false);
            setIsBroadcastOpen(true);
            if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
            return;
          }
          setIsBroadcastOpen(false);
          setIsPickingBroadcastLocation(true);
        }}
        onClearLocation={() => {
          setBroadcastPreviewPin(null);
          setBroadcastPreviewAddress(null);
        }}
        onSuccess={async (created) => {
          if (created?.alert) {
            setDbAlerts((prev) => {
              if (prev.some((p) => p.id === created.alert.id)) return prev;
              return [created.alert, ...prev];
            });
          }
          setBroadcastPreviewPin(null);
          setBroadcastPreviewAddress(null);
          setPinningActive(false);
          if (import.meta.env.DEV) console.debug("[PIN_CLEAR_CHECK]", {
            reason: "success",
            broadcastPreviewPinExists: !!broadcastPreviewPin,
            userLocationExists: !!userLocation,
          });
        }}
        onError={() => {
          if (import.meta.env.DEV) console.debug("[PIN_CLEAR_CHECK]", {
            reason: "error",
            broadcastPreviewPinExists: !!broadcastPreviewPin,
            userLocationExists: !!userLocation,
          });
        }}
      />
      <Dialog open={mapRestrictionModalOpen} onOpenChange={setMapRestrictionModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Map Alert Access Paused</DialogTitle>
            <DialogDescription>
              Your ability to pin map alerts has been paused due to recent account activity that does not meet our community safety standards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="h-10 rounded-full bg-brandBlue px-4 text-sm font-semibold text-white"
              onClick={() => setMapRestrictionModalOpen(false)}
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        onOpenProfile={(userId, fallbackName) => {
          void openPublicProfileSheet(userId, fallbackName);
        }}
      />

      {/* ================================================================ */}
      {/* GPS Required modal                                               */}
      {/* Shown when location is off, denied, or unavailable.             */}
      {/* ================================================================ */}
      {showGpsModal && (
        <div
          className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center px-6 transition-opacity duration-150"
          onClick={() => setShowGpsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-elevated relative"
          >
            {/* Close — top right X */}
            <button
              onClick={() => setShowGpsModal(false)}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-muted/60 hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="flex items-center gap-3 mb-4 pr-8">
              <div className="w-10 h-10 rounded-full bg-brandBlue/10 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-brandBlue" />
              </div>
              <h3 className="text-lg font-bold text-brandText">Enable Location?</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Enable location to see friends and alerts. You can stay incognito in Settings.
            </p>

            <div className="flex gap-3">
              <NeuControl
                variant="secondary"
                size="md"
                onClick={() => setShowGpsModal(false)}
                className="flex-1"
              >
                Cancel
              </NeuControl>
              <NeuControl
                variant="primary"
                size="md"
                onClick={() => {
                  setShowGpsModal(false);
                  openDeviceLocationSettings();
                }}
                className="flex-1"
              >
                Enable Location
              </NeuControl>
            </div>
          </div>
        </div>
      )}

      {/* Unpin confirmation modal */}
      {showUnpinConfirm && (
        <div
          className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center px-6 transition-opacity duration-150"
          onClick={() => setShowUnpinConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-elevated"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-brandText">Unpin Location</h3>
            </div>
            <img
              src={privacyImage}
              alt=""
              className="w-full rounded-xl object-contain"
            />
            <p className="text-sm text-muted-foreground mb-6">
              This will remove you from the map and may limit nearby alerts. If you'd prefer to stay private, tap Invisible instead.
            </p>
            <div className="flex gap-3">
              <NeuControl
                variant="secondary"
                size="md"
                onClick={() => setShowUnpinConfirm(false)}
                className="flex-1"
              >
                Cancel
              </NeuControl>
              <NeuControl
                variant="danger"
                size="md"
                onClick={() => void confirmUnpinLocation()}
                className="flex-1"
              >
                Unpin
              </NeuControl>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Vet/Pet Shop Bottom Sheet                                        */}
      {/* ================================================================ */}
      {selectedVet && (
        <div
          className="fixed inset-0 z-[5000] bg-black/50 flex items-end transition-opacity duration-150"
          onClick={() => setSelectedVet(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[var(--app-max-width,430px)] bg-card rounded-t-3xl p-6 translate-y-0 transition-transform duration-200 max-h-[calc(100svh-var(--nav-height,64px)-env(safe-area-inset-bottom,0px)-8px)] overflow-y-auto"
            style={{ marginBottom: "calc(var(--nav-height,64px) + env(safe-area-inset-bottom,0px))" }}
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
                  <NeuControl
                    size="md"
                    onClick={() => { window.open(`tel:${selectedVet.phone}`); }}
                    className="flex-1"
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    {t("map.call_now")}
                  </NeuControl>
                )}
                <NeuControl
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    const query = encodeURIComponent(`${selectedVet.name} veterinary Hong Kong`);
                    window.open(`https://www.google.com/maps/search/${query}`, "_blank");
                  }}
                  className={cn(!selectedVet.phone && "flex-1")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Search Google
                </NeuControl>
              </div>
          </div>
        </div>
      )}

      <PublicProfileSheet
        isOpen={publicProfileOpen}
        onClose={() => setPublicProfileOpen(false)}
        loading={publicProfileLoading}
        fallbackName={publicProfileName}
        viewedUserId={publicProfileUserId}
        data={publicProfileData as never}
      />

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        .mapboxgl-ctrl-top-right {
          top: 124px !important;
          right: 12px !important;
        }
        .mapboxgl-ctrl-bottom-left,
        .mapboxgl-ctrl-bottom-right {
          bottom: 80px !important;
        }
      `}</style>

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
