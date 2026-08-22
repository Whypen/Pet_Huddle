import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import {
  X,
  Loader2,
  MapPin,
  RefreshCw,
  WifiOff,
  EyeOff,
  Eye,
  PenSquare,
  Plus,
  Minus,
  Navigation,
} from "lucide-react";
import privacyImage from "@/assets/Notifications/Privacy.jpg";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BOTTOM_NAV_HEIGHT } from "@/components/layout/BottomNav";
// Lazy-loaded: these four modals are conditionally rendered, so their
// bundles should not be on the Map page's critical path. Suspense wraps
// each render site below so AnimatePresence enter/exit still works.
const PremiumUpsell = lazy(() => import("@/components/social/PremiumUpsell").then((m) => ({ default: m.PremiumUpsell })));
const UpsellModal = lazy(() => import("@/components/monetization/UpsellModal").then((m) => ({ default: m.UpsellModal })));
import { useAuth } from "@/contexts/AuthContext";
import { resolveCopy } from "@/lib/copy";
import { supabase } from "@/integrations/supabase/client";

const callRpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;
import { NeuControl } from "@/components/ui/NeuControl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { useUpsell } from "@/hooks/useUpsell";
import { useLocation, useNavigate } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";
const BroadcastModal = lazy(() => import("@/components/map/BroadcastModal"));
const PinDetailModal = lazy(() => import("@/components/map/PinDetailModal"));
import BlueDotMarker from "@/components/map/BlueDotMarker";
import BroadcastMarker from "@/components/map/BroadcastMarker";
import AlertMarkersOverlay from "@/components/map/AlertMarkersOverlay";
import BroadcastRangeOverlay from "@/components/map/BroadcastRangeOverlay";
import FriendMarkersOverlay, { type FriendOverlayPin } from "@/components/map/FriendMarkersOverlay";
import { normalizeGenderBucket } from "@/components/map/maskedPinAssets";
import { loadBlockedUserIdsFor } from "@/lib/blocking";
import { ProfileShareCard } from "@/components/profile/ProfileShareCard";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { useSafetyRestrictions } from "@/hooks/useSafetyRestrictions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openExternalUrl } from "@/lib/nativeShell";
import { isVerifiedProfile } from "@/lib/verification";
import { HuddleGlyph } from "@/components/icons/HuddleIcons";
import { publishVisibleUserPinIds } from "@/lib/visibleMapPinCache";
import { useAuthGate } from "@/components/auth/authGateContext";

const extractDistrictFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
};

// Zoom Level 16.5 ≈ ~500m proximity
const PROXIMITY_ZOOM = 16.5;
const MAP_BOTTOM_CHROME_OFFSET = "calc(var(--nav-height,64px) + env(safe-area-inset-bottom,0px) + 68px)";

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
  verified_only?: boolean;
  share_access_token?: string | null;
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

type VisibleMapPinShellRow = {
  pin_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  pin_type?: string | null;
  updated_at?: string | null;
  is_alert?: boolean | null;
  alert_type?: string | null;
  creator_id?: string | null;
  range_meters?: number | null;
  range_km?: number | null;
  marker_state?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
  is_invisible?: boolean | null;
  gender_genre?: string | null;
  verified_only?: boolean | null;
};

function mapVisibleAlertShellToMapAlert(row: VisibleMapPinShellRow): MapAlert | null {
  const latitude = Number(row.lat);
  const longitude = Number(row.lng);
  const id = String(row.pin_id || "").trim();
  if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude) || row.marker_state === "hidden") return null;
  return {
    id,
    latitude,
    longitude,
    alert_type: String(row.alert_type || row.pin_type || "Others"),
    title: null,
    description: null,
    photo_url: null,
    media_urls: [],
    support_count: 0,
    report_count: 0,
    created_at: String(row.updated_at || new Date().toISOString()),
    expires_at: null,
    duration_hours: null,
    range_meters: row.range_meters ?? null,
    range_km: row.range_km ?? null,
    creator_id: row.creator_id ?? null,
    has_thread: false,
    thread_id: null,
    posted_to_threads: false,
    post_on_social: false,
    social_post_id: null,
    social_status: null,
    social_url: null,
    location_street: null,
    location_district: null,
    is_sensitive: false,
    verified_only: row.verified_only === true,
    marker_state: row.marker_state === "expired_dot" ? "expired_dot" : "active",
    creator: { display_name: null, social_id: null, avatar_url: null },
  };
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

// The native public control exposes Area and Incognito only. Historical values
// are normalized to Area by the shared backend/native contract; web never
// exposes a separate exact-location mode.
type MapPrecision = "area" | "hidden";
const MAP_PRECISION_DEFAULT: MapPrecision = "area";
const MAP_SHARE_HOURS_DEFAULT = 2;
const AREA_CELL_DEG = 0.0045;
const coarsenToCellCenter = (lng: number, lat: number): [number, number] => [
  Math.floor(lng / AREA_CELL_DEG) * AREA_CELL_DEG + AREA_CELL_DEG / 2,
  Math.floor(lat / AREA_CELL_DEG) * AREA_CELL_DEG + AREA_CELL_DEG / 2,
];

const UUID_V4ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_PIN_ACTIVE_HOURS = 2;
const USER_PIN_RETENTION_HOURS = 24 * 7;

// ==========================================================================
// Main Map Component
// ==========================================================================
const MapPage = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { requireAuth } = useAuthGate();
  const { isActive } = useSafetyRestrictions();
  const t = resolveCopy;
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
  const lastGpsSnapRef = useRef<{ lat: number; lng: number } | null>(null);

  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showFriends, setShowFriends] = useState(true);
  const [visibleEnabled, setVisibleEnabled] = useState(false);
  const [dbAlerts, setDbAlerts] = useState<MapAlert[]>([]);
  const dbAlertsRef = useRef<MapAlert[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [friendPins, setFriendPins] = useState<FriendPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<MapAlert | null>(null);
  const [alertFocusId, setAlertFocusId] = useState<string | null>(null);
  const [alertFocusThreadId, setAlertFocusThreadId] = useState<string | null>(null);
  const alertFocusRetriesRef = useRef(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileName, setPublicProfileName] = useState<string>("");
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [publicProfileData, setPublicProfileData] = useState<Record<string, unknown> | null>(null);
  const [mapRestrictionModalOpen, setMapRestrictionModalOpen] = useState(false);
  const [hiddenAlerts, setHiddenAlerts] = useState<Set<string>>(new Set());
  const [pinning, setPinning] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [lastKnownOwnCoords, setLastKnownOwnCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPreviewPin, setBroadcastPreviewPin] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPreviewAddress, setBroadcastPreviewAddress] = useState<string | null>(null);
  const [draftBroadcastType, setDraftBroadcastType] = useState<"Stray" | "Lost" | "Caution" | "Others">("Stray");
  useEffect(() => {
    userLocationRef.current = userLocation;
    if (import.meta.env.DEV) console.debug("[USER_PIN]", userLocation);
  }, [userLocation]);
  useEffect(() => {
    if (import.meta.env.DEV) console.debug("[BROADCAST_PIN]", broadcastPreviewPin);
  }, [broadcastPreviewPin]);
  const [pinPersistedAt, setPinPersistedAt] = useState<string | null>(null);
  const [ownMarkerState, setOwnMarkerState] = useState<"active" | "expired_dot" | null>(null);
  const [pinAddressSnapshot, setPinAddressSnapshot] = useState<string | null>(null);
  const pinAddressSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    pinAddressSnapshotRef.current = pinAddressSnapshot;
  }, [pinAddressSnapshot]);
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();
  const defaultCenter = useMemo<[number, number]>(() => [114.1583, 22.2828], []);
  const ownMarkerCacheKey = useMemo(() => (user?.id ? `huddle:last-own-coords:${user.id}` : null), [user?.id]);
  const alertsCacheKey = useMemo(() => (user?.id ? `huddle:map-alerts:${user.id}` : null), [user?.id]);
  const activePinGpsRefreshSessionKey = useMemo(
    () => (user?.id ? `huddle:active-pin-gps-refresh-session:${user.id}` : null),
    [user?.id]
  );
  const friendPinsSessionKey = useMemo(
    () => (user?.id ? `huddle:friend-pins-session:${user.id}` : null),
    [user?.id]
  );

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

  // Track the most recently persisted coords + the latest in-memory coords so
  // we can (a) skip writes for sub-250 m drift, (b) flush the latest value on
  // tab close. watchPosition can fire ~1 Hz; without these guards we burned
  // localStorage writes on every tick of GPS jitter.
  const lastPersistedOwnCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const latestOwnCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Distance between two lat/lng pairs in meters. Earth-mean haversine.
  const haversineMeters = useCallback((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }, []);

  const persistOwnMarkerCoords = useCallback((coords: { lat: number; lng: number }) => {
    setLastKnownOwnCoords(coords);
    latestOwnCoordsRef.current = coords;
    if (!ownMarkerCacheKey) return;
    // Distance-delta gate: skip the localStorage write unless the user moved
    // more than ~250 m since the last persisted value. visibilitychange/pagehide
    // listener below guarantees we still capture the final coords on tab close.
    const last = lastPersistedOwnCoordsRef.current;
    if (last && haversineMeters(last, coords) < 250) return;
    lastPersistedOwnCoordsRef.current = coords;
    try {
      localStorage.setItem(ownMarkerCacheKey, JSON.stringify(coords));
    } catch {
      // best-effort cache only
    }
  }, [haversineMeters, ownMarkerCacheKey]);

  // Flush the latest in-memory coords to localStorage on tab hide / page close,
  // even if the distance threshold wasn't crossed. Keeps the "last known
  // location" cache accurate across sessions without paying the write cost on
  // every GPS tick.
  useEffect(() => {
    if (!ownMarkerCacheKey) return;
    const flush = () => {
      const latest = latestOwnCoordsRef.current;
      if (!latest) return;
      const last = lastPersistedOwnCoordsRef.current;
      if (last && last.lat === latest.lat && last.lng === latest.lng) return;
      try {
        localStorage.setItem(ownMarkerCacheKey, JSON.stringify(latest));
        lastPersistedOwnCoordsRef.current = latest;
      } catch {
        // best-effort cache only
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
    };
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
    const point = profileRecord?.own_pin_point && typeof profileRecord.own_pin_point === "object"
      ? profileRecord.own_pin_point as { lat?: unknown; lng?: unknown }
      : null;
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const pinnedUntil = typeof profileRecord?.map_visible_until === "string"
      ? profileRecord.map_visible_until
      : typeof profileRecord?.location_pinned_until === "string"
        ? profileRecord.location_pinned_until
        : typeof profile?.map_visible_until === "string"
          ? profile.map_visible_until
          : null;
    const visibleUntilMs = pinnedUntil ? Date.parse(pinnedUntil) : NaN;
    if (!Number.isFinite(visibleUntilMs) || visibleUntilMs <= Date.now()) return null;
    const precision: MapPrecision = profileRecord?.map_precision === "hidden" || profile?.map_precision === "hidden" ? "hidden" : "area";
    return {
      lat,
      lng,
      pinnedAt: pinnedUntil,
      markerState: "active",
      isInvisible: profileRecord?.is_invisible === true || profile?.hide_from_map === true || precision === "hidden",
    };
  }, [profile?.hide_from_map, profile?.map_precision, profile?.map_visible_until]);

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
  const [gpsFailureReason, setGpsFailureReason] = useState<"permission" | "unavailable" | "timeout" | "unsupported" | "insecure" | null>(null);
  const [mapPrecision, setMapPrecision] = useState<MapPrecision>(() => profile?.map_precision === "hidden" ? "hidden" : MAP_PRECISION_DEFAULT);
  const [mapShareHours, setMapShareHours] = useState(MAP_SHARE_HOURS_DEFAULT);
  const isInvisible = mapPrecision === "hidden";
  useEffect(() => {
    (window as typeof window & { __HUDDLE_MAP__?: { initialized: boolean; fallback: boolean } }).__HUDDLE_MAP__ = {
      initialized: mapLoaded && !mapFallback,
      fallback: mapFallback,
    };
  }, [mapFallback, mapLoaded]);

  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "plus" || effectiveTier === "gold";
  const viewRadiusMeters = 25000;

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

  // Native contract: Incognito is the hidden precision tier. Area is the
  // default for every fresh pin; the legacy hide_from_map switch is not used.
  useEffect(() => {
    setMapPrecision(profile?.map_precision === "hidden" ? "hidden" : MAP_PRECISION_DEFAULT);
  }, [profile?.map_precision]);

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
    (source: string, options: Parameters<mapboxgl.Map["flyTo"]>[0]) => {
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

  const snapToGpsChange = useCallback((coords: { lat: number; lng: number }, source: string, options?: { force?: boolean }) => {
    if (!map.current || isBroadcastOpenRef.current || isPickingBroadcastLocationRef.current) return;
    const last = lastGpsSnapRef.current;
    if (!options?.force && last && haversineMeters(last, coords) < 250) return;
    lastGpsSnapRef.current = coords;
    flyToWithDebug(source, {
      center: [coords.lng, coords.lat],
      zoom: 15.5,
      essential: true,
      duration: 900,
    });
  }, [flyToWithDebug, haversineMeters]);

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
  const reCenterOnGPS = useCallback(async () => {
    if (!map.current) return;
    if (userLocation) {
      flyToWithDebug("reCenterOnGPS.pin", { center: [userLocation.lng, userLocation.lat], zoom: 15.5 });
      return;
    }
    if (!navigator.geolocation) {
      setGpsFailureReason("unsupported");
      setShowGpsModal(true);
      return;
    }
    const requestCurrentPosition = () => navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (import.meta.env.DEV) console.debug(`[PIN] Re-center GPS Success: lat=${lat}, lng=${lng}`);
        flyToWithDebug("reCenterOnGPS.success", { center: [lng, lat], zoom: 15.5 });
      },
      (error) => {
        setGpsFailureReason(error.code === 1 ? "permission" : error.code === 3 ? "timeout" : "unavailable");
        setShowGpsModal(true);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    if (!navigator.permissions?.query) {
      requestCurrentPosition();
      return;
    }
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        setGpsFailureReason("permission");
        setShowGpsModal(true);
        return;
      }
      // "prompt" deliberately invokes the browser-owned permission request.
      requestCurrentPosition();
    } catch {
      requestCurrentPosition();
    }
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
  const applyPinLocation = useCallback(async (lat: number, lng: number, source: string, requestedPrecision: MapPrecision = MAP_PRECISION_DEFAULT) => {
    if (import.meta.env.DEV) console.debug(`[PIN] applyPinLocation — source=${source}, lat=${lat}, lng=${lng}`);
    if (!user?.id) {
      toast.error("Please sign in again to pin your location.");
      setPinning(false);
      return;
    }

    const resolvedAddress = pinAddressSnapshot || (await lookupBroadcastAddress(lat, lng)) || null;
    if (resolvedAddress) setPinAddressSnapshot(resolvedAddress);

    if (import.meta.env.DEV) console.debug("[PIN] Saving to DB — set_user_location RPC...");
    const precision: MapPrecision = requestedPrecision === "hidden" ? "hidden" : "area";
    const { error: setLocationError } = await callRpc("set_user_location", {
      p_lat: lat,
      p_lng: lng,
      p_pin_hours: USER_PIN_ACTIVE_HOURS,
      p_retention_hours: USER_PIN_RETENTION_HOURS,
      p_address: resolvedAddress,
      p_precision: precision,
      p_visible_hours: mapShareHours,
    });
    if (setLocationError) {
      if (import.meta.env.DEV) console.error("[PIN] set_user_location failed", setLocationError);
      setPinning(false);
      toast.error("We couldn't update your map pin. Try again in a moment.");
      return;
    }

    const pinnedAt = new Date().toISOString();
    setUserLocation({ lat, lng });
    setOwnMarkerState("active");
    setPinPersistedAt(pinnedAt);
    if (import.meta.env.DEV) console.debug("[PIN] Pin State Updated: pinPersistedAt=", pinnedAt);
    persistOwnMarkerCoords({ lat, lng });

    flyToWithDebug("pin.apply", { center: [lng, lat], zoom: 15.5 });
    lastGpsSnapRef.current = { lat, lng };

    setVisibleEnabled(true);
    setMapPrecision(precision);
    setPinning(false);
    void refreshProfile();
    if (import.meta.env.DEV) console.debug(`[PIN] ✅ Pin State Updated: pinned=true, visible=true (via ${source})`);
    toast.success(`Location pinned (${source})`);
  }, [flyToWithDebug, lookupBroadcastAddress, mapShareHours, persistOwnMarkerCoords, pinAddressSnapshot, refreshProfile, user?.id]);

  const refreshActivePinFromGrantedGps = useCallback(async () => {
    if (!user?.id || !navigator.geolocation || !navigator.permissions?.query) return null;
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (permission.state !== "granted") return null;
    } catch {
      return null;
    }

    return new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const resolvedAddress = pinAddressSnapshotRef.current || (await lookupBroadcastAddress(lat, lng)) || null;
          if (resolvedAddress) setPinAddressSnapshot(resolvedAddress);
          const { error } = await callRpc("set_user_location", {
            p_lat: lat,
            p_lng: lng,
            p_pin_hours: USER_PIN_ACTIVE_HOURS,
            p_retention_hours: USER_PIN_RETENTION_HOURS,
            p_address: resolvedAddress,
            p_precision: mapPrecision === "hidden" ? "hidden" : "area",
            p_visible_hours: mapShareHours,
          });
          if (error) {
            resolve(null);
            return;
          }
          const pinnedAt = new Date().toISOString();
          const next = { lat, lng };
          setUserLocation(next);
          setOwnMarkerState("active");
          setPinPersistedAt(pinnedAt);
          persistOwnMarkerCoords(next);
          setVisibleEnabled(true);
          snapToGpsChange(next, "gps.refresh");
          void refreshProfile();
          resolve(next);
        },
        () => {
          // Keep the saved pin if a GPS refresh fails.
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 }
      );
    });
  }, [lookupBroadcastAddress, mapPrecision, mapShareHours, persistOwnMarkerCoords, refreshProfile, snapToGpsChange, user?.id]);

  const requestPinFromLiveGps = useCallback(() => {
    // No secure context — GPS cannot work at all.
    if (!window.isSecureContext) {
      setGpsFailureReason("insecure");
      setShowGpsModal(true);
      return;
    }
    // Browser does not support Geolocation API.
    if (!navigator.geolocation) {
      setGpsFailureReason("unsupported");
      setShowGpsModal(true);
      return;
    }

    const runGetCurrentPosition = () => {
      setPinning(true);
      if (import.meta.env.DEV) console.debug("[PIN] GPS Request Sent — enableHighAccuracy=true, timeout=7000ms");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (import.meta.env.DEV) console.debug(`[PIN] GPS Success: lat=${pos.coords.latitude}, lng=${pos.coords.longitude}, accuracy=${pos.coords.accuracy}m`);
          await applyPinLocation(pos.coords.latitude, pos.coords.longitude, "GPS", MAP_PRECISION_DEFAULT);
        },
        (err) => {
          if (import.meta.env.DEV) console.debug(`[PIN] GPS Error: code=${err.code}, message=${err.message}`);
          setPinning(false);
          // PERMISSION_DENIED (1) — user blocked location for this app.
          // POSITION_UNAVAILABLE (2) — device location services off.
          // TIMEOUT (3) — no GPS fix within timeout; treat as unavailable.
          setGpsFailureReason(err.code === 1 ? "permission" : err.code === 3 ? "timeout" : "unavailable");
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
            setGpsFailureReason("permission");
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
    const { error } = await supabase.rpc("clear_user_location_pin");
    if (error) {
      toast.error(t("Failed to unpin location"));
      return;
    }
    setPinPersistedAt(null);
    setOwnMarkerState(null);
    setMapPrecision(MAP_PRECISION_DEFAULT);
    setUserLocation(null);
    clearOwnMarkerCoordsCache();
    setFriendPins([]);
    setSelectedAlert(null);
    setBroadcastPreviewPin(null);
    setPinningActive(false);
    setPinAddressSnapshot(null);
    setVisibleEnabled(false);
    toast.success("Unpinned");
  };

  // Single green button toggle: ON = pinned (green), OFF = grey
  const handlePinToggle = () => {
    if (!user) {
      requireAuth("map-location", () => {}, { returnTo: "/map" });
      return;
    }
    if (isPinned || visibleEnabled) {
      handleUnpinMyLocation();
    } else {
      // Do NOT set visibleEnabled here — GPS must succeed first.
      requestPinFromLiveGps();
    }
  };

  const toggleInvisible = useCallback(async () => {
    if (!user?.id || !userLocation) return;
    const previous = mapPrecision;
    const next: MapPrecision = previous === "hidden" ? "area" : "hidden";
    setMapPrecision(next);
    const { error } = await callRpc("set_user_location", {
      p_lat: userLocation.lat,
      p_lng: userLocation.lng,
      p_pin_hours: USER_PIN_ACTIVE_HOURS,
      p_retention_hours: USER_PIN_RETENTION_HOURS,
      p_address: pinAddressSnapshotRef.current,
      p_precision: next,
      p_visible_hours: mapShareHours,
    });
    if (error) {
      setMapPrecision(previous);
      toast.error("Could not update map privacy.");
      return;
    }
    void refreshProfile();
  }, [mapPrecision, mapShareHours, refreshProfile, user?.id, userLocation]);

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

      const currentUserLocation = userLocationRef.current;
      const initialCenter: [number, number] = currentUserLocation
        ? [currentUserLocation.lng, currentUserLocation.lat]
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
          // huddle's branded style. The stock streets-v11 basemap is what made
          // web read as a different product from the app.
          style: "mapbox://styles/whypen/cmpx5mu4m000l01sb5fmm2imv",
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
        const currentUserLocation = userLocationRef.current;
        if (!hasInitialized.current && currentUserLocation) {
          flyToWithDebug("map.load.initialSnap", {
            center: [currentUserLocation.lng, currentUserLocation.lat],
            zoom: PROXIMITY_ZOOM,
            essential: true,
            duration: 2000,
          });
          lastGpsSnapRef.current = currentUserLocation;
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
          setBroadcastPreviewAddress(address || pinAddressSnapshotRef.current || null);
        });
        setIsPickingBroadcastLocation(false);
        setIsBroadcastOpen(true);
        if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: next.lat, lng: next.lng });
      });

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
  }, [defaultCenter, flyToWithDebug, lookupBroadcastAddress, mapInitNonce]);

  const handleFallbackClick = useCallback(() => {
    if (!isPickingBroadcastLocation) return;
    const fallback = userLocation ?? { lat: defaultCenter[1], lng: defaultCenter[0] };
    setBroadcastPreviewPin(fallback);
    setBroadcastPreviewAddress(pinAddressSnapshot || null);
    setIsPickingBroadcastLocation(false);
    setIsBroadcastOpen(true);
    if (import.meta.env.DEV) console.debug("[PLACE_SELECTED]", { lat: fallback.lat, lng: fallback.lng });
  }, [defaultCenter, isPickingBroadcastLocation, pinAddressSnapshot, userLocation]);

  // Handle window resize. Coalesce RAF: bursty resize events (mobile keyboard
  // open/close, rotation) would otherwise stack callbacks and cause many redundant
  // map.resize() invocations.
  useEffect(() => {
    let frame: number | null = null;
    const handleResize = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        map.current?.resize();
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  // First viewport priority:
  // 1) existing pin/userLocation — always wins, even overrides a fallback already applied
  // 2) profile location text geocoded to area — applied once if no pin exists
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const apply = async () => {
      if (!map.current) return;
      // Pin snap always wins — overrides any previously applied fallback
      if (userLocation && !pinSnapAppliedRef.current) {
        flyToWithDebug("init.userPin", { center: [userLocation.lng, userLocation.lat], zoom: 15.5 });
        lastGpsSnapRef.current = userLocation;
        pinSnapAppliedRef.current = true;
        initialViewportAppliedRef.current = true;
        return;
      }
      // Fallback: only apply once, while pin hasn't arrived yet
      if (initialViewportAppliedRef.current) return;
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
    resolveProfileLocationCenter,
    userLocation,
  ]);

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

  // NativeMapData owns one audience-safe shell fetch for alerts and people,
  // cached for 60 seconds. Keep the web surface on that same data path so
  // mounting both overlays never pays for the same RPC twice.
  const visibleShellCacheRef = useRef<{ key: string; rows: VisibleMapPinShellRow[]; at: number } | null>(null);
  const visibleShellInFlightRef = useRef<Promise<VisibleMapPinShellRow[]> | null>(null);
  const fetchVisibleShells = useCallback(async (force = false): Promise<VisibleMapPinShellRow[]> => {
    const lat = userLocation?.lat ?? defaultCenter[1];
    const lng = userLocation?.lng ?? defaultCenter[0];
    const key = `${lng.toFixed(3)}|${lat.toFixed(3)}|${viewRadiusMeters}|${user?.id || "anon"}`;
    const cached = visibleShellCacheRef.current;
    if (!force && cached?.key === key && Date.now() - cached.at < 60_000) return cached.rows;
    if (visibleShellInFlightRef.current) return visibleShellInFlightRef.current;
    const promise = (async () => {
      const { data, error } = await callRpc("get_visible_map_pin_shells_with_audience", {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: viewRadiusMeters,
      });
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as VisibleMapPinShellRow[];
      visibleShellCacheRef.current = { key, rows, at: Date.now() };
      return rows;
    })();
    visibleShellInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      visibleShellInFlightRef.current = null;
    }
  }, [defaultCenter, user?.id, userLocation?.lat, userLocation?.lng, viewRadiusMeters]);

  // Request coalescing: when N callers fire fetchAlerts() in the same tick,
  // they all await the same in-flight Promise instead of triggering N RPCs.
  const fetchAlertsInFlightRef = useRef<Promise<MapAlert[]> | null>(null);
  const fetchAlerts = useCallback(async (): Promise<MapAlert[]> => {
    if (fetchAlertsInFlightRef.current) return fetchAlertsInFlightRef.current;
    const promise = (async (): Promise<MapAlert[]> => {
      try {
        const mapped = (await fetchVisibleShells())
          .filter((row) => row.is_alert === true)
          .map(mapVisibleAlertShellToMapAlert)
          .filter((row): row is MapAlert => row !== null);
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
        const visibleOnly = dedupeById(mapped.concat(fallbackDots))
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
        fetchAlertsInFlightRef.current = null;
      }
    })();
    fetchAlertsInFlightRef.current = promise;
    return promise;
  }, [blockedUserIds, fetchVisibleShells, readCachedAlerts, writeCachedAlerts]);

  const fetchAlertByIdForDeepLink = useCallback(async (alertId: string): Promise<MapAlert | null> => {
    const trimmedAlertId = String(alertId || "").trim();
    if (!trimmedAlertId) return null;
    if (!UUID_V4ISH.test(trimmedAlertId)) return null;
    try {
      const shareToken = String(new URLSearchParams(location.search).get("access") || "").trim();
      const { data, error } = await callRpc(
        shareToken ? "get_broadcast_alert_by_share_token" : "get_broadcast_alert_by_id_with_audience",
        shareToken
          ? { p_alert_id: trimmedAlertId, p_share_token: shareToken }
          : { p_alert_id: trimmedAlertId },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as VisibleMapAlertRow | undefined) : undefined;
      if (!row || !row.id) return null;
      const mapped = mapVisibleAlertRowToMapAlert(row);
      return shareToken ? { ...mapped, verified_only: true, share_access_token: shareToken } : mapped;
    } catch (error) {
      if (import.meta.env.DEV) console.error("[DEEPLINK_ALERT_FETCH_ERROR]", error);
      return null;
    }
  }, [location.search]);

  const fetchAlertByThreadForDeepLink = useCallback(async (threadId: string): Promise<MapAlert | null> => {
    const trimmedThreadId = String(threadId || "").trim();
    if (!trimmedThreadId) return null;
    try {
      const { data, error } = await callRpc(
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

  // Fetch friend pins from the canonical audience-safe projection. Coalesced: concurrent callers
  // share the in-flight Promise, eliminating duplicate RPCs.
  const fetchFriendPinsInFlightRef = useRef<Promise<void> | null>(null);
  const fetchFriendPins = useCallback(async (): Promise<void> => {
    if (fetchFriendPinsInFlightRef.current) return fetchFriendPinsInFlightRef.current;
    const promise = (async (): Promise<void> => {
      try {
        if (!user) { setFriendPins([]); publishVisibleUserPinIds([]); return; }
        const nextPins: FriendPin[] = (await fetchVisibleShells())
          .filter((row) => row.is_alert !== true && row.marker_state !== "expired_dot")
          .filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
          .map((row) => ({
            id: String(row.pin_id || ""),
            display_name: row.display_name ?? null,
            avatar_url: row.avatar_url ?? null,
            is_verified: row.is_verified === true,
            is_invisible: row.is_invisible === true,
            gender_genre: row.gender_genre ?? null,
            dob: null,
            relationship_status: null,
            owns_pets: null,
            pet_species: null,
            location_name: null,
            last_lat: Number(row.lat),
            last_lng: Number(row.lng),
            location_pinned_until: null,
            marker_state: "active" as const,
          }))
          .filter((row) => row.id.length > 0);
        setFriendPins(nextPins);
        publishVisibleUserPinIds(nextPins.map((pin) => pin.id));
        if (friendPinsSessionKey) {
          sessionStorage.setItem(friendPinsSessionKey, JSON.stringify(nextPins));
        }
      } catch {
        // Preserve the current overlay on transient failures.
      } finally {
        fetchFriendPinsInFlightRef.current = null;
      }
    })();
    fetchFriendPinsInFlightRef.current = promise;
    return promise;
  }, [fetchVisibleShells, friendPinsSessionKey, user]);

  // Coalesced: the inbox-mount effect and refresh callback can both trigger
  // this in the same tick — share the in-flight Promise so we hit the
  // profiles table once.
  const fetchCurrentPinStateInFlightRef = useRef<Promise<{ lat: number; lng: number } | null> | null>(null);
  const fetchCurrentPinState = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    if (fetchCurrentPinStateInFlightRef.current) return fetchCurrentPinStateInFlightRef.current;
    const promise = (async (): Promise<{ lat: number; lng: number } | null> => {
      try {
        if (!user?.id) {
          setUserLocation(null);
          clearOwnMarkerCoordsCache();
          setVisibleEnabled(false);
          setPinPersistedAt(null);
          setOwnMarkerState(null);
          setPinAddressSnapshot(null);
          setMapPrecision(MAP_PRECISION_DEFAULT);
          return null;
        }
        const { data, error } = await callRpc(
          "get_native_viewer_scope",
        );
        if (error) {
          // Keep current UI pin state on transient fetch failure.
          return userLocationRef.current;
        }
        const row = Array.isArray(data) ? data[0] : data;
        const activePin = deriveOwnPinState((row || null) as Record<string, unknown> | null);
        if (!activePin) {
          setUserLocation(null);
          clearOwnMarkerCoordsCache();
          setVisibleEnabled(false);
          setPinPersistedAt(null);
          setOwnMarkerState(null);
          setPinAddressSnapshot(null);
          setMapPrecision(profile?.map_precision === "hidden" ? "hidden" : MAP_PRECISION_DEFAULT);
          return null;
        }
        const next = { lat: activePin.lat, lng: activePin.lng };
        setUserLocation(next);
        persistOwnMarkerCoords(next);
        snapToGpsChange(next, "gps.savedPin");
        setVisibleEnabled(true);
        setMapPrecision(profile?.map_precision === "hidden" ? "hidden" : MAP_PRECISION_DEFAULT);
        setPinPersistedAt(activePin.pinnedAt);
        setOwnMarkerState(activePin.markerState);
        return next;
      } finally {
        fetchCurrentPinStateInFlightRef.current = null;
      }
    })();
    fetchCurrentPinStateInFlightRef.current = promise;
    return promise;
  }, [clearOwnMarkerCoordsCache, deriveOwnPinState, persistOwnMarkerCoords, profile?.map_precision, snapToGpsChange, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const pinState = await fetchCurrentPinState();
      if (cancelled || !pinState) return;
      if (!activePinGpsRefreshSessionKey) return;
      if (sessionStorage.getItem(activePinGpsRefreshSessionKey)) return;
      sessionStorage.setItem(activePinGpsRefreshSessionKey, new Date().toISOString());
      void refreshActivePinFromGrantedGps();
    })();
    return () => {
      cancelled = true;
    };
  }, [activePinGpsRefreshSessionKey, fetchCurrentPinState, refreshActivePinFromGrantedGps, user?.id]);

  const focusMapTarget = useCallback((source: string, lat: number, lng: number) => {
    flyToWithDebug(source, { center: [lng, lat], zoom: 15.5 });
  }, [flyToWithDebug]);

  useEffect(() => {
    if (!alertFocusId && !alertFocusThreadId) return;
    const focusKey = alertFocusId || alertFocusThreadId || "";
    if (!focusKey) return;
    const hasShareAccess = Boolean(new URLSearchParams(location.search).get("access"));
    if (!user && !hasShareAccess) {
      requireAuth("see-alert", () => {}, { targetId: focusKey, returnTo: location.pathname + location.search });
      setAlertFocusId(null);
      setAlertFocusThreadId(null);
      return;
    }
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
  }, [alertFocusId, alertFocusThreadId, dbAlerts, fetchAlertByIdForDeepLink, fetchAlertByThreadForDeepLink, fetchAlerts, focusMapTarget, location.pathname, location.search, requireAuth, user]);

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
    if (friendPinsSessionKey) {
      const cached = sessionStorage.getItem(friendPinsSessionKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setFriendPins(parsed as FriendPin[]);
            return;
          }
        } catch {
          sessionStorage.removeItem(friendPinsSessionKey);
        }
      }
      const fetchedFlag = `${friendPinsSessionKey}:fetched`;
      if (sessionStorage.getItem(fetchedFlag)) return;
      sessionStorage.setItem(fetchedFlag, new Date().toISOString());
    }
    void fetchFriendPins();
  }, [fetchFriendPins, friendPinsSessionKey, showFriends]);

  useEffect(() => {
    if (!selectedAlert) return;
    const updated = dbAlerts.find((row) => row.id === selectedAlert.id) || null;
    if (updated) {
      // The map projection is a shell; never let its refresh replace the
      // audience-gated full detail loaded after a marker press.
      const hasFullDetail = Boolean(
        selectedAlert.title ||
        selectedAlert.description ||
        selectedAlert.photo_url ||
        (selectedAlert.media_urls?.length ?? 0) > 0 ||
        selectedAlert.creator_id ||
        selectedAlert.creator?.display_name ||
        selectedAlert.creator?.avatar_url,
      );
      if (!hasFullDetail && updated !== selectedAlert) setSelectedAlert(updated);
    }
  }, [dbAlerts, selectedAlert]);

  const refreshMapData = useCallback(async () => {
    setPullRefreshing(true);
    try {
      const localPinSnapshot = userLocation;
      setBroadcastPreviewPin(null);
      setSelectedAlert(null);
      visibleShellCacheRef.current = null;
      const [pinState] = await Promise.all([fetchCurrentPinState(), fetchVisibleShells(true)]);
      await Promise.all([fetchAlerts(), fetchFriendPins()]);
      if (pinState) {
        const refreshedPin = await refreshActivePinFromGrantedGps();
        const focusPin = refreshedPin ?? pinState;
        flyToWithDebug("refresh.pinned", { center: [focusPin.lng, focusPin.lat], zoom: 15.5 });
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
    fetchVisibleShells,
    flyToWithDebug,
    isPinned,
    refreshActivePinFromGrantedGps,
    resolveProfileLocationCenter,
    userLocation,
    visibleEnabled,
  ]);

  // Reset on mount
  useEffect(() => {
    setHiddenAlerts(new Set());
    setSelectedAlert(null);
  }, []);

  // ==========================================================================
  // Broadcast: start a NEW draft pin flow every time
  // ==========================================================================
  const openBroadcast = () => {
    if (!user) {
      requireAuth("broadcast", () => {}, { returnTo: "/map" });
      return;
    }
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
        isVerified: isVerifiedProfile(p),
        isInvisible: Boolean(p.is_invisible),
        genderBucket: normalizeGenderBucket(p.gender_genre),
        sessionMarker: p.location_pinned_until,
        markerState: "active",
      });
    });
    return pins;
  }, [friendPins, showFriends, user?.id]);

  const ownMarkerCoords = useMemo<{ lat: number; lng: number } | null>(() => {
    const source = userLocation || lastKnownOwnCoords;
    if (!source) return null;
    const [lng, lat] = coarsenToCellCenter(source.lng, source.lat);
    return { lat, lng };
  }, [lastKnownOwnCoords, mapPrecision, userLocation]);

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

  // ==========================================================================
  // Stable marker-overlay callbacks — defined here (not inline in JSX) so
  // they don't trigger child rerenders on every parent state update.
  // ==========================================================================
  const handleFriendSelect = useCallback((id: string) => {
    const friend = friendOverlayPins.find((f) => f.id === id);
    if (!friend) return;
    focusMapTarget("marker.friend.click", friend.lat, friend.lng);
    const pin = friendPins.find((p) => p.id === friend.id);
    if (pin) {
      void openPublicProfileSheet(pin.id, pin.display_name || "Friend");
    }
  }, [focusMapTarget, friendOverlayPins, friendPins, openPublicProfileSheet]);

  const handleAlertSelect = useCallback((alertId: string) => {
    const alert = filteredPins.find((pin) => pin.id === alertId);
    if (!alert) return;
    const hasShareAccess = Boolean(new URLSearchParams(location.search).get("access"));
    if (!user && !hasShareAccess) {
      requireAuth("see-alert", () => {}, { targetId: alert.id, returnTo: "/map" });
      return;
    }
    focusMapTarget(alert.is_demo ? "marker.demoAlert.click" : "marker.alert.click", alert.latitude, alert.longitude);
    setSelectedAlert(alert);
    // The shell projection intentionally contains only marker-safe fields. The
    // native map hydrates the full alert after every real marker press; do the
    // same with the existing audience-gated detail RPC instead of opening a
    // shell as if it were complete alert data.
    void fetchAlertByIdForDeepLink(alert.id).then((detail) => {
      if (detail) setSelectedAlert(detail);
    });
  }, [fetchAlertByIdForDeepLink, filteredPins, focusMapTarget, location.search, requireAuth, user]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      <GlobalHeader desktopRail />
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
        {/* FLOATING CONTROL ROW — Alerts / Friends / Actions                */}
        {/* ================================================================ */}
        {user ? <div className="absolute inset-x-0 z-[1600] flex items-center justify-center pointer-events-none px-4"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div className="flex w-full max-w-[440px] items-center px-1 pointer-events-none lg:max-w-none lg:px-5">
            <div className="rounded-full bg-white/30 backdrop-blur-md border border-white/40 px-1 py-1 flex items-center gap-1 pointer-events-auto shadow-md">
              <NeuControl
                size="icon-md"
                variant={showAlerts ? "primary" : "tertiary"}
                selected={showAlerts}
                aria-label="Alerts"
                onClick={() => setShowAlerts((v) => !v)}
              >
                <HuddleGlyph name="mapAlert" size={20} />
              </NeuControl>
              <NeuControl
                size="icon-md"
                variant={showFriends ? "primary" : "tertiary"}
                selected={showFriends}
                aria-label="Friends"
                onClick={() => setShowFriends((v) => !v)}
              >
                <HuddleGlyph name="mapUser" size={20} />
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
              {(isPinned || visibleEnabled) ? (
                <button
                  onClick={() => void toggleInvisible()}
                  className="w-11 h-11 rounded-full bg-white/30 backdrop-blur-md border border-white/40 shadow-md flex items-center justify-center touch-manipulation transition-colors"
                  aria-label={isInvisible ? "Incognito enabled (tap to disable)" : "Incognito disabled (tap to enable)"}
                >
                  {isInvisible ? <EyeOff className="w-5 h-5 text-[var(--text-secondary)]" /> : <Eye className="w-5 h-5 text-brandBlue" />}
                </button>
              ) : null}
              <button
                onClick={handlePinToggle}
                disabled={pinning}
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-colors touch-manipulation",
                  isPinned || visibleEnabled
                    ? "bg-[var(--lime-green)]"
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
        </div> : null}

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

        {map.current && !isPickingBroadcastLocation && showFriends && friendOverlayPins.length > 0 && (
          <FriendMarkersOverlay
            map={map.current}
            friends={friendOverlayPins}
            onSelect={handleFriendSelect}
          />
        )}

        {map.current && !isPickingBroadcastLocation && ownMarkerCoords && (
          <BlueDotMarker
            map={map.current}
            coords={ownMarkerCoords}
            displayName={profile?.display_name || user?.email || "Me"}
            avatarUrl={profile?.avatar_url || null}
            isVerified={isVerifiedProfile(profile)}
            isInvisible={isInvisible}
            markerState={ownMarkerState || "active"}
          />
        )}
        {map.current && broadcastPreviewPin && (
          <BroadcastMarker map={map.current} coords={broadcastPreviewPin} alertType={draftBroadcastType} />
        )}
        {map.current && !isPickingBroadcastLocation && showAlerts && (
          <>
            <BroadcastRangeOverlay map={map.current} alerts={filteredPins} viewerId={user?.id || null} />
            <AlertMarkersOverlay map={map.current} alerts={filteredPins} viewerId={user?.id || null} onSelect={handleAlertSelect} />
          </>
        )}

        {/* ================================================================ */}
        {/* BOTTOM: Broadcast CTA                                            */}
        {/* ================================================================ */}
        {!isBroadcastOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+68px)] z-[1700] w-[calc(100%-32px)] max-w-[440px] pointer-events-none lg:left-6 lg:bottom-6 lg:w-auto lg:max-w-none lg:translate-x-0">
            <button
              className="h-14 w-14 rounded-full border border-white/40 bg-white/30 shadow-md backdrop-blur-md flex items-center justify-center pointer-events-auto"
              aria-label={t("map.broadcast")}
              onClick={openBroadcast}
            >
              <PenSquare size={20} strokeWidth={1.75} className="text-[var(--text-secondary)]" />
            </button>
          </div>
        )}

        <div className="absolute bottom-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+68px)] right-4 z-[1700] flex flex-col overflow-hidden rounded-[14px] border border-white/70 bg-white/80 shadow-elevated backdrop-blur-xl lg:bottom-6 lg:right-6">
          <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()} className="grid h-[42px] w-[42px] place-items-center text-brandText hover:bg-white/70">
            <Plus className="h-5 w-5" />
          </button>
          <span className="mx-2 h-px bg-border" />
          <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()} className="grid h-[42px] w-[42px] place-items-center text-brandText hover:bg-white/70">
            <Minus className="h-5 w-5" />
          </button>
          <span className="mx-2 h-px bg-border" />
          <button type="button" aria-label="Recenter on my location" onClick={reCenterOnGPS} className="grid h-[42px] w-[42px] place-items-center text-brandBlue hover:bg-white/70">
            <Navigation className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* BroadcastModal — full-screen creation with tier gating            */}
      {/* ================================================================ */}
      <Suspense fallback={null}>
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
      </Suspense>
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
      <Suspense fallback={null}>
      <PinDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onHide={(id) => {
          setHiddenAlerts((prev) => { const next = new Set(prev); next.add(id); return next; });
          toast.success("Alert hidden");
        }}
        onRefresh={fetchAlerts}
        onOpenProfile={(userId, fallbackName) => {
          void openPublicProfileSheet(userId, fallbackName);
        }}
      />
      </Suspense>

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
              {gpsFailureReason === "permission"
                ? "Location is blocked for this site. Allow it in your browser settings, then try again."
                : gpsFailureReason === "unsupported"
                  ? "This browser does not support location services."
                  : gpsFailureReason === "insecure"
                    ? "Location requires a secure browser connection."
                    : gpsFailureReason === "timeout" || gpsFailureReason === "unavailable"
                      ? "We couldn’t get a location fix. Check Location Services and try again."
                      : "Enable location to see friends and alerts. You can stay incognito in Settings."}
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
                  if (navigator.permissions?.query) {
                    void navigator.permissions.query({ name: "geolocation" as PermissionName })
                      .then((status) => status.state === "denied" ? openDeviceLocationSettings() : requestPinFromLiveGps())
                      .catch(() => requestPinFromLiveGps());
                    return;
                  }
                  requestPinFromLiveGps();
                }}
                className="flex-1"
              >
                Try location
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

      {publicProfileOpen && publicProfileUserId ? <ProfileShareCard profileId={publicProfileUserId} onClose={() => setPublicProfileOpen(false)} /> : null}

      <Suspense fallback={null}>
        <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      </Suspense>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      `}</style>

      <Suspense fallback={null}>
        <UpsellModal
          isOpen={upsellModal.isOpen}
          type={upsellModal.type}
          title={upsellModal.title}
          description={upsellModal.description}
          price={upsellModal.price}
          onClose={closeUpsellModal}
          onBuy={() => buyAddOn(upsellModal.type)}
        />
      </Suspense>
    </div>
  );
};

export default MapPage;
