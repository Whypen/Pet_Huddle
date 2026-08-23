import type React from "react";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "../lib/nativeDisplayCacheStorage";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BlurView } from "@react-native-community/blur";
import Mapbox from "@rnmapbox/maps";
import * as Network from "expo-network";
import { AccessibilityInfo, Animated, AppState, Easing, Image, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { NativeSpinner } from "../components/NativeSpinner";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import privacyImage from "../../assets/Notifications/Privacy.jpg";
import poiCafeIcon from "../../assets/map-pois/poi-cafe.png";
import poiDogParkIcon from "../../assets/map-pois/poi-dog-park.png";
import poiEmergencyVetIcon from "../../assets/map-pois/poi-emergency-vet.png";
import poiGenericIcon from "../../assets/map-pois/poi-generic.png";
import poiGroomerIcon from "../../assets/map-pois/poi-groomer.png";
import poiShelterIcon from "../../assets/map-pois/poi-shelter.png";
import poiShopIcon from "../../assets/map-pois/poi-shop.png";
import poiVetIcon from "../../assets/map-pois/poi-vet.png";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeProfileAvatar } from "../components/NativeProfileAvatar";
import { NativeGlyph, type NativeGlyphName } from "../components/NativeGlyphIcons";
import { NativeAlertDetailModal } from "../components/map/NativeAlertDetailModal";
import { NativeBroadcastModal } from "../components/map/NativeBroadcastModal";
import { NativeMapErrorState } from "../components/map/NativeMapErrorState";
import { NativeMapRestrictionModal } from "../components/map/NativeMapRestrictionModal";
import { NativeSelfPinAnchoredMenu } from "../components/map/NativeSelfPinAnchoredMenu";
import { NativeSpotlightOverlay, type NativeSpotlightTarget } from "../components/coachmarks/NativeSpotlightOverlay";
import { AppKeyboardAvoidingView, AppModalActionRow, AppModalButton, AppModalCard, AppModalIconButton } from "../components/nativeModalPrimitives";
import { NativeShareCardModal } from "../components/share/NativeShareCardModal";
import type { ShareCardData } from "../components/share/NativeShareCard";
import { nativeBroadcastRequiresPetType } from "../lib/nativeBroadcast";
import { isNativeCoachMarkSeen, markNativeCoachMarkSeen } from "../lib/nativeCoachMarks";
import { fetchNativeMatchedRailSummary } from "../lib/nativeChat";
import { endHomePresenceActivity, startHomePresenceActivity, updateHomePresenceActivity } from "../lib/nativeActiveSessions";
import { setNavMinimized } from "../lib/nativeNavScroll";
import {
  NATIVE_MAP_DEFAULT_CENTER,
  NATIVE_MAP_DEFAULT_ZOOM,
  getNativeMapWarmCenter,
  setNativeMapWarmCenter,
  readNativePetPoisEnabled,
  readNativeMapStyleUrl,
  readNativeMapTokenConfig,
} from "../lib/nativeMapConfig";
import {
  deriveNativeMapOwnPinFromProfile,
  fetchNativeMapAlertById,
  fetchNativeMapPeopleV2,
  fetchNativeMapOwnPin,
  fetchVisiblePetPois,
  fetchVisibleMapPinShells,
  invalidateNativeMapAlertCaches,
  isNativeMapSharingWindowVisible,
  peekNativeMapAlertById,
  type NativeMapPinShell,
  type NativePetPoi,
  sortNativeMapAlertsForDisplay,
  type NativeMapAlert,
  type NativeMapAreaCell,
  type NativeMapAnonymousArea,
  type NativeMapFriendPin,
  type NativeMapOwnPin,
} from "../lib/nativeMapData";
import { normalizeNativeGenderBucket, pickNativeGroupedPinAsset, pickNativeMaskedAvatarAsset } from "../lib/nativeMaskedPinAssets";
import { buildNativeMapPinCollisionOffsets } from "../lib/nativeMapPinCollision";
import { buildNativeMapPeopleAreaGroups, nativeMapPeopleAreaKey } from "../lib/nativeMapPeopleAggregation";
import { mergeNativeMapAnonymousAreas } from "../lib/nativeMapAnonymousAreaMerge";
import { parseNativeMapAnonymousAreas } from "../lib/nativeMapPeopleV2";
import {
  resolveAnchoredSelfPinMenuPosition,
  type NativeSelfPinMenuPlacement,
} from "../lib/nativeSelfPinMenuPosition";
import { buildNativeMapAlertAggregation, nativeAlertAggregateCountLabel } from "../lib/nativeMapAlertAggregation";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import {
  getNativeCurrentCoordinates,
  getNativeForegroundLocationPermissionDetail,
  openNativeAppSettings,
  openNativeLocationSettings,
  requestNativeLocationForPin,
  subscribeNativeLocationPermissionDetail,
  type NativeLocationPermissionDetail,
  type NativeLocationPermissionState,
} from "../lib/nativeLocation";
import {
  clearNativeUserLocationPin,
  lookupNativeMapAddress,
  lookupNativeMapQueryCenter,
  pinNativeUserLocation,
  pinNativeUserOutNow,
  stopNativeMapSharing,
} from "../lib/nativeMapMutations";
import {
  NATIVE_MAP_DEFAULT_SHARE_HOURS,
  NATIVE_MAP_PRECISION_DEFAULT,
  clampCustomHours,
  normalizeNativeMapPrecision,
  type NativeMapPrecision,
} from "../lib/nativeMapPrecision";
import { useLanguage } from "../lib/nativeLanguage";
import { isNativeRestrictionActive } from "../lib/nativeSafetyRestrictions";
import { resolveNativeViewerScope, subscribeNativeViewerScope, type NativeViewerScope, type NativeViewerScopePoint } from "../lib/nativeViewerScope";
import { huddleColors, huddleFieldStates, huddleLayout, huddleMap, huddleMotion, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { haptic } from "../lib/nativeHaptics";
import { NativeToast } from "../components/NativeToast";
import { buildRollupReachToast, buildTappedReachToast, fetchNativeBroadcastReach } from "../lib/nativeBroadcastReach";
import type { NativeToastContent } from "../lib/nativeToastCopy";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { fetchNativeProfileSummary, patchNativeProfileSummaryCache, subscribeNativeProfileSummary, type NativeProfileSummary } from "../lib/nativeProfileSummary";
import { resolveNativeProfilePhotoDisplayUrl } from "../lib/nativeProfilePhotos";
import { createSinglePrivateBroadcastChannel, createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { mapRealtimeTopicsForCenters } from "../lib/nativeMapRealtime";
import {
  beginNativePresenceIntent,
  enqueueNativePresenceMutation,
  isCurrentNativePresenceIntent,
  type NativePresenceIntentToken,
} from "../lib/nativePresenceMutationCoordinator";
import { nativePetEmojiForLabel, normalizeNativePetFocusLabel } from "../lib/nativePetTaxonomy";
import { fetchNativePublicProfile } from "../lib/nativePublicProfile";
import { buildProfileShareCard } from "../lib/shareCardData";

type NativeMapScreenProps = {
  active?: boolean;
  accessToken?: string | null;
  alertFocusIntent?: number;
  bottomNavVisible?: boolean;
  onBottomSheetOpenChange?: (open: boolean) => void;
  onNavigate?: (path: string) => void;
  search?: string;
  sessionKey?: string | null;
  userId?: string | null;
};

type PendingMapCameraAction = {
  id: number;
  onSettled?: () => void | Promise<void>;
};

const COMPRESSED_MODE_ENTER_ZOOM = 14.5;
const FRIEND_AVATAR_DETAIL_ZOOM = 15.5;
const FRIEND_AVATAR_OVERVIEW_ZOOM = 12;
const MAP_ZOOM_TIER_HYSTERESIS = 0.25;
const MERCATOR_TILE_SIZE = 512;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const ALERT_CACHE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNIFICANT_PIN_MOVE_KM = 0.25;
const NATIVE_MAP_SESSION_CACHE_MS = 5 * 60 * 1000;
// Module-level so it resets on every app cold start (fresh JS context). "Stay at last
// view" only applies to warm remounts within a session; a cold restart re-centers to
// GPS/pin so the user lands on themselves.
let nativeMapColdStartConsumed = false;
const MAP_CAMERA_IDLE_DEBOUNCE_MS = 650;
const MAP_CAMERA_REFETCH_MIN_KM = 0.75;
const MAP_RELATED_ANCHOR_RADIUS_M = 5000;
const BROADCAST_DROP_MARKER_WIDTH = huddleLayout.minTouch;
const BROADCAST_DROP_MARKER_HEIGHT = huddleLayout.minTouch + huddleSpacing.x3;
const ENABLE_ACTIVE_ALERT_RIPPLE = true;
const ACTIVE_ALERT_RIPPLE_MAX_MARKERS = 16;
const EXPIRED_ALERT_MARKER_STYLE: "plan_a_pin" | "plan_b_dot" = "plan_a_pin";
const PET_POI_MIN_ZOOM = 14;
const PET_POI_FETCH_LIMIT = 300;
const PET_POI_CACHE_RADIUS_KM = 10;
const PET_POI_CACHE_REFETCH_MOVE_KM = 2;
const PET_POI_CACHE_MS = 6 * 60 * 60 * 1000;
const BROADCAST_RANGE_MIN_METERS = 1000;
const BROADCAST_RANGE_MAX_METERS = 50000;
const BROADCAST_RANGE_CIRCLE_STEPS = 96;
const BROADCAST_RANGE_RIPPLE_MIN_SCALE = 0.18;

const PET_POI_MAPBOX_IMAGES = {
  "poi-cafe": poiCafeIcon,
  "poi-dog-park": poiDogParkIcon,
  "poi-emergency-vet": poiEmergencyVetIcon,
  "poi-generic": poiGenericIcon,
  "poi-groomer": poiGroomerIcon,
  "poi-shelter": poiShelterIcon,
  "poi-shop": poiShopIcon,
  "poi-vet": poiVetIcon,
} as const;

const distanceKmBetween = (
  first: { lat: number; lng: number } | null,
  second: { lat: number; lng: number } | null,
) => {
  if (!first || !second) return 0;
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(second.lat - first.lat);
  const dLng = toRad(second.lng - first.lng);
  const lat1 = toRad(first.lat);
  const lat2 = toRad(second.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
};

const nativeMapScreenSessionKey = (userId: string | null, sessionKey?: string | null) =>
  String(sessionKey || (userId ? `${userId}:0` : "anonymous:0"));

const mapShellRadiusForZoom = (zoom: number) => {
  if (zoom >= 14) return 5000;
  if (zoom >= 12) return 10000;
  return 25000;
};

const mapShellBucketFor = (center: [number, number], zoom: number, sessionKey: string) => {
  const zoomBucket = Math.max(2, Math.min(20, Math.floor(zoom)));
  const precision = zoomBucket >= 14 ? 3 : zoomBucket >= 11 ? 2 : 1;
  return {
    key: `${sessionKey}:${center[0].toFixed(precision)}:${center[1].toFixed(precision)}:${zoomBucket}`,
    zoomBucket,
  };
};

const pointToCenter = (point: NativeViewerScopePoint | null): [number, number] | null => (
  point ? [point.lng, point.lat] : null
);

const validLngLatCenter = (lat: unknown, lng: unknown): [number, number] | null => {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
};

// Your stored pin location (last_lat/last_lng) — independent of the share-visibility
// window. This is "where you are" for camera centering even after the pin expires.
const profilePinCenter = (profile?: NativeProfileSummary | null): [number, number] | null =>
  validLngLatCenter(profile?.last_lat, profile?.last_lng);

// Your registered profile/home city (latitude/longitude) — last-resort center only.
const profileCityCenter = (profile?: NativeProfileSummary | null): [number, number] | null =>
  validLngLatCenter(profile?.latitude, profile?.longitude);

const uniqueMapShellAnchors = (
  anchors: Array<{ center: [number, number]; radiusMeters: number }>,
) => {
  const seen = new Set<string>();
  return anchors.filter((anchor) => {
    const key = `${anchor.center[0].toFixed(4)}:${anchor.center[1].toFixed(4)}:${anchor.radiusMeters}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

type NativeMapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type BroadcastRangeFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: {
      alertId: string;
      color: string;
      opacity?: number;
    };
    geometry: {
      type: "Polygon";
      coordinates: number[][][];
    };
  }>;
};

type PetPoiCache = {
  center: [number, number];
  loadedAt: number;
  radiusKm: number;
  rows: NativePetPoi[];
};

type PetPoiFeatureProperties = {
  id: string;
  icon: keyof typeof PET_POI_MAPBOX_IMAGES;
  label: string;
};

type PetPoiFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, PetPoiFeatureProperties>;

const mapBoundsFromCenter = (center: [number, number], zoom: number): NativeMapBounds => {
  const span = zoom >= 16 ? 0.035 : zoom >= 15 ? 0.07 : 0.12;
  return {
    west: center[0] - span,
    south: center[1] - span,
    east: center[0] + span,
    north: center[1] + span,
  };
};

const mapBoundsFromRadiusKm = (center: [number, number], radiusKm: number): NativeMapBounds => {
  const latRadius = radiusKm / 110.574;
  const lngRadius = radiusKm / (111.32 * Math.max(0.2, Math.cos((center[1] * Math.PI) / 180)));
  return {
    west: Math.max(-180, center[0] - lngRadius),
    south: Math.max(-90, center[1] - latRadius),
    east: Math.min(180, center[0] + lngRadius),
    north: Math.min(90, center[1] + latRadius),
  };
};

const degreesToRadians = (value: number) => (value * Math.PI) / 180;
const mapPixelsPerMeter = (lat: number, zoom: number) => (
  (MERCATOR_TILE_SIZE * 2 ** zoom) / (40_075_016.68557849 * Math.max(0.2, Math.cos(degreesToRadians(lat))))
);
const radiansToDegrees = (value: number) => (value * 180) / Math.PI;

const clampBroadcastRangeMeters = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const meters = Number(value);
  if (!Number.isFinite(meters)) return null;
  return Math.max(BROADCAST_RANGE_MIN_METERS, Math.min(BROADCAST_RANGE_MAX_METERS, Math.round(meters)));
};

const buildCirclePolygonCoordinates = (longitude: number, latitude: number, radiusMeters: number, steps = BROADCAST_RANGE_CIRCLE_STEPS) => {
  const earthRadiusMeters = 6371008.8;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const centerLat = degreesToRadians(latitude);
  const centerLng = degreesToRadians(longitude);
  const ring: number[][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (2 * Math.PI * index) / steps;
    const pointLat = Math.asin(
      Math.sin(centerLat) * Math.cos(angularDistance) +
      Math.cos(centerLat) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLng = centerLng + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLat),
      Math.cos(angularDistance) - Math.sin(centerLat) * Math.sin(pointLat),
    );
    ring.push([radiansToDegrees(pointLng), radiansToDegrees(pointLat)]);
  }

  return [ring];
};

const emptyBroadcastRangeFeatureCollection: BroadcastRangeFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const buildBroadcastRangeFeature = (
  alert: NativeMapAlert,
  radiusMeters: number,
  options: { idSuffix: string; opacity?: number },
): BroadcastRangeFeatureCollection["features"][number] => ({
  type: "Feature",
  id: `${alert.id}:${options.idSuffix}`,
  properties: {
    alertId: alert.id,
    color: alertMarkerColor(alert.alert_type),
    opacity: options.opacity,
  },
  geometry: {
    type: "Polygon",
    coordinates: buildCirclePolygonCoordinates(alert.longitude, alert.latitude, radiusMeters),
  },
});

const buildBroadcastRangeFeatureCollections = (
  alerts: NativeMapAlert[],
  viewerId: string | null,
  pulseProgress: number,
) => {
  const cleanViewerId = String(viewerId || "").trim();
  if (!cleanViewerId) {
    return {
      fixed: emptyBroadcastRangeFeatureCollection,
      pulse: emptyBroadcastRangeFeatureCollection,
    };
  }

  const fixedFeatures: BroadcastRangeFeatureCollection["features"] = [];
  const pulseFeatures: BroadcastRangeFeatureCollection["features"] = [];
  const rippleScale = BROADCAST_RANGE_RIPPLE_MIN_SCALE + (1 - BROADCAST_RANGE_RIPPLE_MIN_SCALE) * pulseProgress;
  const pulseOpacity = Math.max(0, 0.24 * (1 - pulseProgress));

  alerts.forEach((alert) => {
    if (alert.creator_id !== cleanViewerId) return;
    if (!Number.isFinite(alert.latitude) || !Number.isFinite(alert.longitude)) return;
    const rangeMeters = clampBroadcastRangeMeters(alert.range_meters ?? (alert.range_km ? Number(alert.range_km) * 1000 : null));
    if (!rangeMeters) return;

    fixedFeatures.push(buildBroadcastRangeFeature(alert, rangeMeters, { idSuffix: "range" }));
    if (alert.marker_state === "active") {
      pulseFeatures.push(buildBroadcastRangeFeature(alert, Math.max(1, Math.round(rangeMeters * rippleScale)), {
        idSuffix: "pulse",
        opacity: pulseOpacity,
      }));
    } else {
      fixedFeatures[fixedFeatures.length - 1].properties.opacity = 0.035;
    }
  });

  return {
    fixed: {
      type: "FeatureCollection" as const,
      features: fixedFeatures,
    },
    pulse: {
      type: "FeatureCollection" as const,
      features: pulseFeatures,
    },
  };
};

const normalizeVisibleBounds = (bounds: unknown, fallbackCenter: [number, number], zoom: number): NativeMapBounds => {
  if (Array.isArray(bounds) && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
    const first = bounds[0];
    const second = bounds[1];
    const lngValues = [Number(first[0]), Number(second[0])].filter(Number.isFinite);
    const latValues = [Number(first[1]), Number(second[1])].filter(Number.isFinite);
    if (lngValues.length === 2 && latValues.length === 2) {
      return {
        west: Math.min(...lngValues),
        south: Math.min(...latValues),
        east: Math.max(...lngValues),
        north: Math.max(...latValues),
      };
    }
  }
  return mapBoundsFromCenter(fallbackCenter, zoom);
};

const petPoiTypeLabel = (type: string) => {
  const normalized = String(type || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    vet: "Vet",
    emergency_vet: "Emergency vet",
    pet_shop: "Pet shop",
    groomer: "Groomer",
    shelter: "Shelter",
    pet_hotel: "Pet hotel",
    dog_park: "Dog park",
    pet_friendly_cafe: "Pet-friendly cafe",
    pet_friendly_place: "Pet-friendly place",
  };
  return labels[normalized] || "Pet place";
};

const petPoiIconKey = (type: string): keyof typeof PET_POI_MAPBOX_IMAGES => {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "emergency_vet") return "poi-emergency-vet";
  if (normalized === "vet") return "poi-vet";
  if (normalized === "dog_park") return "poi-generic";
  if (normalized === "shelter") return "poi-generic";
  if (normalized === "pet_hotel") return "poi-shop";
  if (normalized === "pet_shop") return "poi-shop";
  if (normalized === "pet_friendly_place") return "poi-generic";
  if (normalized === "groomer") return "poi-shop";
  if (normalized === "pet_friendly_cafe") return "poi-generic";
  return "poi-generic";
};

const samePetPoiRows = (current: NativePetPoi[], next: NativePetPoi[]) => (
  current.length === next.length && current.every((row, index) => row.id === next[index]?.id)
);

const petPoiInBounds = (poi: NativePetPoi, bounds: NativeMapBounds) => (
  poi.lng >= bounds.west &&
  poi.lng <= bounds.east &&
  poi.lat >= bounds.south &&
  poi.lat <= bounds.north
);

const deriveVisiblePetPois = (rows: NativePetPoi[], bounds: NativeMapBounds) => (
  rows.filter((poi) => petPoiInBounds(poi, bounds)).slice(0, PET_POI_FETCH_LIMIT)
);

const petPoiCacheFetchKey = (center: [number, number], radiusKm: number) => (
  `${center[0].toFixed(4)}:${center[1].toFixed(4)}:${radiusKm}`
);

// Area pins are coarsened into a ~500m privacy zone. The on-map field reflects
// that real backend contract, rather than merely making a smaller privacy zone
// look larger.
const AREA_BLOB_RADIUS_M = 500;
const ALERT_BLOB_RADIUS_M = Math.round(AREA_BLOB_RADIUS_M * 1.5);
// Friends-only areas: full blob + avatars at/above COMPRESSED_MODE_ENTER_ZOOM (14.5),
// a small dot between this and the detail zoom, and hidden below this. Clusters that
// include the viewer's own pin are always shown full (own pin is never collapsed).
const ALERT_EXPAND_TARGET_ZOOM = 16;

const AREA_CELL_DEG = 0.0045;

// Client mirror of the server cell-center coarsening (for the owner's own blob).
const coarsenToCellCenter = (lng: number, lat: number): [number, number] => [
  Math.floor(lng / AREA_CELL_DEG) * AREA_CELL_DEG + AREA_CELL_DEG / 2,
  Math.floor(lat / AREA_CELL_DEG) * AREA_CELL_DEG + AREA_CELL_DEG / 2,
];

const resolveOwnAreaCoordinate = (
  lng: number,
  lat: number,
  geometryVersion: 1 | 2,
  viewerArea: NativeMapAreaCell | null,
): [number, number] => {
  if (geometryVersion === 2) {
    return viewerArea ? [viewerArea.lng, viewerArea.lat] : [lng, lat];
  }
  return coarsenToCellCenter(lng, lat);
};

// Up-to-3 overlapping avatars on the blob rim; masked avatar for Hidden users; numeric overflow.
const AREA_CHIP_SIZE = 34;
const AREA_OWNER_CHIP_SIZE = Math.round(AREA_CHIP_SIZE * 1.5);
const AREA_CHIP_OVERLAP = 6;
const AREA_MENU_WIDTH = 280;
const AREA_MENU_POINTER_CENTER_X = 26;
const AREA_MENU_MAX_VISIBLE_ROWS = 4;
const AREA_MENU_ROW_HEIGHT = 56;
const AREA_MORE_WIDTH = 30;

const renderAreaChip = (member: NativeMapFriendPin, size: number, ringColor: string, marginLeft: number, maskedAvatarKey?: string, stackIndex?: number) => {
  const bucket = normalizeNativeGenderBucket(member.gender_genre);
  const masked = member.is_invisible || !isRenderableImageUrl(member.avatar_url);
  const maskedAsset = masked ? pickNativeMaskedAvatarAsset(bucket, maskedAvatarKey ?? `${member.id}:${member.location_pinned_until || "unpinned"}:${bucket}`) : null;
  // Outer view carries the float shadow (no overflow clipping); inner view clips the image.
  return (
    <View key={member.id} style={[styles.areaChipShadow, { width: size, height: size, borderRadius: size / 2, marginLeft, zIndex: stackIndex }]}>
      <View style={[styles.areaChip, {
        width: size,
        height: size,
        borderRadius: size / 2,
        borderColor: ringColor,
        borderWidth: Math.min(2, size / 20),
      }]}>
        {masked ? (
          <Image source={maskedAsset as ImageSourcePropType} style={styles.areaChipImage} />
        ) : (
          <NativeProfileAvatar name={member.display_name} ringWidth={0} size={size} uri={member.avatar_url} userId={member.id} />
        )}
      </View>
    </View>
  );
};

// The other avatars share one target (profile if 1, menu if >1). The owner's
// pin is first, bigger, on top, and controlled by the existing map toolbar.
function AreaChipRow({ members, tint, ownerId, ownerMaskedAvatarKey, ownerSize = AREA_OWNER_CHIP_SIZE, onMarkerPressStart, onOthersPress, onOwnerPress }: {
  members: NativeMapFriendPin[];
  tint: string;
  ownerId?: string | null;
  ownerMaskedAvatarKey?: string;
  ownerSize?: number;
  onMarkerPressStart?: () => void;
  onOthersPress?: () => void;
  onOwnerPress?: () => void;
}) {
  const owner = ownerId ? members.find((member) => member.id === ownerId) : undefined;
  const others = ownerId ? members.filter((member) => member.id !== ownerId) : members;
  const shownOthers = others.slice(0, owner ? 2 : 3);
  const overflow = others.length - shownOthers.length;
  const shownOthersWidth = shownOthers.length * AREA_CHIP_SIZE
    - Math.max(0, shownOthers.length - 1) * AREA_CHIP_OVERLAP
    + (overflow > 0 ? AREA_MORE_WIDTH - AREA_CHIP_OVERLAP : 0);
  const ownerToOthersGap = owner && shownOthers.length > 0 ? huddleSpacing.x1 : 0;
  // Keep the owner's avatar centred on their map location. The nearby-user
  // target starts to its right, so the two controls never compete for a tap.
  const ownerOffsetX = owner ? (ownerToOthersGap + shownOthersWidth) / 2 : 0;
  return (
    <View style={[styles.areaChipRow, owner ? { transform: [{ translateX: ownerOffsetX }] } : null]}>
      {owner ? (
        <Pressable
          accessibilityLabel="Open map sharing controls"
          accessibilityRole="button"
          onPress={onOwnerPress}
          onPressIn={onMarkerPressStart}
          style={styles.areaOwnChip}
        >
          <View pointerEvents="none">
            <OwnPinBreathingHalo size={ownerSize} />
            {renderAreaChip(owner, ownerSize, huddleMap.marker.ownPin, 0, ownerMaskedAvatarKey)}
          </View>
        </Pressable>
      ) : null}
      {shownOthers.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={others.length > 1 ? `${others.length} people in this area` : `Open ${others[0]?.display_name || "person"}`}
          hitSlop={8}
          onPressIn={onMarkerPressStart}
          onPress={onOthersPress}
          style={styles.areaOthersRow}
        >
          {shownOthers.map((member, index) => renderAreaChip(
            member,
            AREA_CHIP_SIZE,
            tint,
            index === 0 ? ownerToOthersGap : -AREA_CHIP_OVERLAP,
            undefined,
            shownOthers.length - index,
          ))}
          {overflow > 0 ? (
            <View style={[styles.areaMore, { borderColor: tint, marginLeft: -AREA_CHIP_OVERLAP }]}>
              <Text style={styles.areaMoreText}>{overflow}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

// ---- Alert aggregation (far-zoom 250m blobs) -------------------------------
type AlertSeverity = "lost" | "stray" | "caution" | "others";
type AlertSeverityCounts = Record<AlertSeverity, number>;
// Severity order: Lost (red) > Stray (yellow) > Caution (grey) > Others (grey).
const ALERT_SEVERITY_ORDER: AlertSeverity[] = ["lost", "stray", "caution", "others"];
const alertSeverityColor: Record<AlertSeverity, string> = {
  lost: huddleMap.marker.alertLost,
  stray: huddleMap.marker.alertStray,
  caution: huddleMap.marker.alertCaution,
  others: huddleMap.marker.alertOthers,
};
const alertSeverityOf = (alertType: string): AlertSeverity => {
  const normalized = String(alertType || "").trim().toLowerCase();
  if (normalized === "lost") return "lost";
  if (normalized === "caution") return "caution";
  if (normalized === "others" || normalized === "other") return "others";
  return "stray";
};
const AlertAggregateMarker = memo(function AlertAggregateMarker({ alert, count, size = huddleMap.size.alertActive }: { alert: NativeMapAlert; count: number; size?: number }) {
  if (count < 2) return null;
  const countLabel = nativeAlertAggregateCountLabel(count);
  const ringColor = alertSeverityColor[alertSeverityOf(alert.alert_type)];
  const discSize = size - 2;
  return (
    <View pointerEvents="none" style={[styles.alertAggregateMarker, { width: size, height: size }] }>
      <View style={[styles.alertAggregateChip, { width: discSize, height: discSize, borderRadius: discSize / 2, borderColor: ringColor }]}>
        <Text style={[styles.alertAggregateChipText, { color: ringColor, fontSize: size >= 40 ? 16 : size >= 32 ? 14 : 12 }]}>{countLabel}</Text>
      </View>
      <View style={[styles.alertAggregateChipNotch, { borderTopColor: ringColor }]} />
    </View>
  );
});

const buildPetPoiFeatureCollection = (rows: NativePetPoi[]): PetPoiFeatureCollection => ({
  type: "FeatureCollection",
  features: rows.map((poi) => ({
    type: "Feature",
    id: poi.id,
    geometry: {
      type: "Point",
      coordinates: [poi.lng, poi.lat],
    },
    properties: {
      id: poi.id,
      icon: petPoiIconKey(poi.type),
      label: `${poi.name || petPoiTypeLabel(poi.type)} (${petPoiTypeLabel(poi.type)})`,
    },
  })),
});

const emptyPetPoiFeatureCollection: PetPoiFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

type FriendRenderItem =
  | {
      type: "single";
      friend: NativeMapFriendPin;
    }
  | {
      type: "group";
      id: string;
      count: number;
      coordinate: [number, number];
      asset: ImageSourcePropType | null;
      friends: NativeMapFriendPin[];
      expanded: boolean;
    };

const alertMarkerColor = (alertType: string) => {
  const normalized = String(alertType || "").trim().toLowerCase();
  if (normalized === "lost") return huddleMap.marker.alertLost;
  if (normalized === "caution") return huddleMap.marker.alertCaution;
  if (normalized === "others" || normalized === "other") return huddleMap.marker.alertOthers;
  return huddleMap.marker.alertStray;
};

const alertMarkerIcon = (alertType: string): "paw" | keyof typeof Feather.glyphMap => {
  const normalized = String(alertType || "").trim().toLowerCase();
  if (normalized === "caution") return "alert-triangle";
  if (normalized === "others" || normalized === "other") return "info";
  return "paw";
};

const alertMarkerPetEmoji = (alertType: string, petType?: string | null) => {
  if (Platform.OS === "android") return null;
  if (!nativeBroadcastRequiresPetType(alertType)) return null;
  const normalizedPetType = normalizeNativePetFocusLabel(petType);
  if (!normalizedPetType || normalizedPetType === "Others") return null;
  return nativePetEmojiForLabel(normalizedPetType);
};

const isRippleEligibleAlertType = (alertType: string | null | undefined) => {
  const normalized = String(alertType || "").trim().toLowerCase();
  return normalized === "lost" || normalized === "caution" || normalized === "stray";
};

const isRenderableImageUrl = (value: string | null | undefined) => {
  const normalized = String(value || "").trim();
  return /^https?:\/\//i.test(normalized) || normalized.startsWith("data:");
};

const lngLatToWorldPoint = (lng: number, lat: number, zoom: number) => {
  const scale = MERCATOR_TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
};

const peopleMarkerSizeForZoom = (zoom: number) => (
  zoom >= FRIEND_AVATAR_DETAIL_ZOOM
    ? huddleMap.size.userPin
    : zoom >= FRIEND_AVATAR_OVERVIEW_ZOOM
      ? huddleMap.size.userPinCompressed
      : huddleMap.size.userPinOverview
);

type MapVisualZoomTier = "detail" | "compact" | "city";

const initialMapVisualZoomTier = (zoom: number): MapVisualZoomTier => (
  zoom >= FRIEND_AVATAR_DETAIL_ZOOM
    ? "detail"
    : zoom >= FRIEND_AVATAR_OVERVIEW_ZOOM
      ? "compact"
      : "city"
);

const resolveMapVisualZoomTier = (zoom: number, current: MapVisualZoomTier): MapVisualZoomTier => {
  if (current === "detail") {
    if (zoom < FRIEND_AVATAR_OVERVIEW_ZOOM - MAP_ZOOM_TIER_HYSTERESIS) return "city";
    if (zoom < FRIEND_AVATAR_DETAIL_ZOOM - MAP_ZOOM_TIER_HYSTERESIS) return "compact";
    return "detail";
  }
  if (current === "city") {
    if (zoom >= FRIEND_AVATAR_DETAIL_ZOOM + MAP_ZOOM_TIER_HYSTERESIS) return "detail";
    if (zoom >= FRIEND_AVATAR_OVERVIEW_ZOOM + MAP_ZOOM_TIER_HYSTERESIS) return "compact";
    return "city";
  }
  if (zoom >= FRIEND_AVATAR_DETAIL_ZOOM + MAP_ZOOM_TIER_HYSTERESIS) return "detail";
  if (zoom < FRIEND_AVATAR_OVERVIEW_ZOOM - MAP_ZOOM_TIER_HYSTERESIS) return "city";
  return "compact";
};

const mapVisualTierReferenceZoom = (tier: MapVisualZoomTier) => (
  tier === "detail"
    ? FRIEND_AVATAR_DETAIL_ZOOM
    : tier === "compact"
      ? FRIEND_AVATAR_OVERVIEW_ZOOM
      : FRIEND_AVATAR_OVERVIEW_ZOOM - 1
);

const ownMarkerSizeForZoom = (zoom: number) => (
  zoom >= FRIEND_AVATAR_DETAIL_ZOOM ? huddleMap.size.userPin : 36
);

const friendFanFootprint = (count: number) => {
  const columns = Math.min(4, Math.max(1, count));
  const rows = Math.ceil(Math.max(1, count) / 4);
  const width = columns * huddleMap.size.userPinOverview
    - Math.max(0, columns - 1) * AREA_CHIP_OVERLAP
    + AREA_CHIP_OVERLAP;
  const height = rows * huddleMap.size.userPinOverview + Math.max(0, rows - 1);
  // A circular envelope keeps the owner's target clear even at the fan's corners.
  return Math.hypot(width, height);
};

const buildFriendRenderItems = (
  friends: NativeMapFriendPin[],
  expandedIds: Set<string>,
): FriendRenderItem[] => {
  const ordered = friends.slice().sort((left, right) => left.id.localeCompare(right.id));
  const friendsById = new Map(ordered.map((friend) => [friend.id, friend]));
  const groups = buildNativeMapPeopleAreaGroups(ordered.map((friend) => ({
    id: friend.id,
    areaKey: friend.area_key,
    lat: friend.last_lat,
    lng: friend.last_lng,
  }))).map((ids) => ids.map((id) => friendsById.get(id)).filter((friend): friend is NativeMapFriendPin => Boolean(friend)));

  return groups.flatMap<FriendRenderItem>((group) => {
    if (group.length === 1) {
      return { type: "single", friend: group[0] };
    }
    const sortedIds = group.map((friend) => friend.id).sort((left, right) => left.localeCompare(right));
    const sessionKey = group
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((friend) => `${friend.id}:${friend.location_pinned_until || "unpinned"}`)
      .join("|");
    const id = sortedIds.join(",");
    const expanded = expandedIds.has(id);
    const first = group[0];
    return {
      type: "group",
      id,
      count: group.length,
      coordinate: [first.last_lng, first.last_lat],
      asset: pickNativeGroupedPinAsset(sessionKey),
      friends: group.slice().sort((left, right) => left.id.localeCompare(right.id)),
      expanded,
    };
  });
};

function AlertRipple({ color, disabled = false }: { color: string; disabled?: boolean }) {
  const rippleProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (disabled) {
      rippleProgress.stopAnimation();
      rippleProgress.setValue(0);
      return;
    }

    rippleProgress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(rippleProgress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, rippleProgress]);

  if (disabled) return null;

  const scale = rippleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 2.55],
  });
  const opacity = rippleProgress.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0.38, 0.24, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.alertMarkerRipple,
        {
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

// Mount entrance shared by map markers: small scale-up + fade, optionally
// staggered per index, so pins "drop in" as a wave instead of blinking into
// existence on data load. Skipped entirely under reduced motion.
const seenMapMarkerEntrances = new Set<string>();
const seenAlertMarkerEntrances = new Set<string>();

function MarkerEntrance({ children, delay = 0, markerKey }: { children: React.ReactNode; delay?: number; markerKey: string }) {
  const reduceMotion = useReducedMotion();
  const alreadySeen = seenMapMarkerEntrances.has(markerKey);
  const progress = useRef(new Animated.Value(reduceMotion || alreadySeen ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion || alreadySeen) return;
    seenMapMarkerEntrances.add(markerKey);
    Animated.spring(progress, { toValue: 1, delay, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [alreadySeen, delay, markerKey, progress, reduceMotion]);
  return (
    <Animated.View
      style={{
        opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function NativeAlertMarker({
  alert,
  activeRippleCandidateCount = 0,
  reduceMotionEnabled = false,
  selected = false,
  suppressMarkerRipple = false,
  washOpacity = 0,
}: {
  alert: NativeMapAlert;
  activeRippleCandidateCount?: number;
  reduceMotionEnabled?: boolean;
  selected?: boolean;
  suppressMarkerRipple?: boolean;
  washOpacity?: number;
}) {
  // Drops in with a spring bounce on first mount (0.6 → 1), then the same value
  // handles the selected-state scale — one animated node, no compound transforms.
  const alertWasSeen = seenAlertMarkerEntrances.has(alert.id);
  const scaleAnim = useRef(new Animated.Value(
    selected ? 1.25 : reduceMotionEnabled || alertWasSeen ? 1 : 0.6,
  )).current;
  useEffect(() => {
    seenAlertMarkerEntrances.add(alert.id);
    Animated.spring(scaleAnim, {
      toValue: selected ? 1.25 : 1.0,
      friction: 7,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [alert.id, selected, scaleAnim]);
  const color = alertMarkerColor(alert.alert_type);
  const petEmoji = alertMarkerPetEmoji(alert.alert_type, alert.pet_type);
  const isExpired = alert.marker_state === "expired_dot";
  const shouldRipple = ENABLE_ACTIVE_ALERT_RIPPLE
    && !suppressMarkerRipple
    && !reduceMotionEnabled
    && !isExpired
    && activeRippleCandidateCount <= ACTIVE_ALERT_RIPPLE_MAX_MARKERS
    && isRippleEligibleAlertType(alert.alert_type);
  if (isExpired && EXPIRED_ALERT_MARKER_STYLE === "plan_b_dot") {
    return <View style={[styles.alertExpiredDot, { backgroundColor: color }]} />;
  }
  return (
    <Animated.View style={[styles.alertMarker, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.alertMarkerHeadWrap}>
        <AlertRipple color={color} disabled={!shouldRipple} />
        <View style={[styles.alertMarkerHead, { backgroundColor: color }]}>
          {petEmoji ? (
            <Text style={styles.alertMarkerPetEmoji}>{petEmoji}</Text>
          ) : alertMarkerIcon(alert.alert_type) === "paw" ? (
            <MaterialCommunityIcons color={huddleColors.onPrimary} name="paw" size={17} />
          ) : (
            <Feather color={huddleColors.onPrimary} name={alertMarkerIcon(alert.alert_type) as keyof typeof Feather.glyphMap} size={16} />
          )}
        </View>
        {washOpacity > 0 ? <View pointerEvents="none" style={[styles.alertMarkerHeadWash, { opacity: washOpacity }]} /> : null}
      </View>
      <View style={[styles.alertMarkerTip, { borderTopColor: color }]} />
      {washOpacity > 0 ? <View pointerEvents="none" style={[styles.alertMarkerTip, styles.alertMarkerTipWash, { borderTopColor: huddleColors.canvas, opacity: washOpacity }]} /> : null}
    </Animated.View>
  );
}

function AvatarMarker({
  avatarUrl,
  borderColor,
  fallbackSource,
  fallbackName,
  invisible,
  compressed = false,
  size,
  invisibleFill = huddleMap.marker.ownPin,
  userId,
}: {
  avatarUrl?: string | null;
  borderColor: string;
  fallbackSource?: ImageSourcePropType | null;
  fallbackName?: string | null;
  invisible?: boolean;
  compressed?: boolean;
  size?: number;
  invisibleFill?: string;
  userId?: string | null;
}) {
  const initial = String(fallbackName || "M").trim().charAt(0).toUpperCase() || "M";
  const showImage = !invisible && isRenderableImageUrl(avatarUrl);
  const markerSize = size ?? (compressed ? huddleMap.size.userPinCompressed : huddleMap.size.userPin);
  const markerInnerInset = markerSize < huddleMap.size.userPin ? huddleMap.size.userPinCompressedInnerInset : huddleMap.size.userPinInnerInset;
  const innerSize = markerSize - markerInnerInset;
  return (
    <View style={[styles.avatarMarker, {
      width: markerSize,
      height: markerSize,
      borderRadius: markerSize / 2,
      borderColor,
      borderWidth: Math.min(2, markerSize / 20),
      backgroundColor: invisible ? invisibleFill : huddleColors.canvas,
    }]}>
      {invisible ? (
        <Feather color={huddleColors.onPrimary} name="user" size={markerSize < huddleMap.size.userPin ? 13 : 20} />
      ) : showImage ? (
        <NativeProfileAvatar name={fallbackName} ringWidth={0} size={innerSize} uri={String(avatarUrl)} userId={userId} />
      ) : fallbackSource ? (
        <Image source={fallbackSource} style={[styles.avatarImage, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]} />
      ) : (
        <View style={[styles.avatarFallback, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
          <Text style={[styles.avatarFallbackText, markerSize < huddleMap.size.userPin ? styles.avatarFallbackTextCompressed : null]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

// Slow lime pulse ring expanding out of the self marker — the map twin of the
// Home live dot. One glance says "you're live"; honors reduced motion by not
// mounting the loop at all. Sized relative to the marker it wraps.
function OwnPinBreathingHalo({ size }: { size: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        // Rest beat before the next breath — reads calm, not alarming.
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);
  if (reduceMotion) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ownPinHalo,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
        },
      ]}
    />
  );
}

function OwnPinMarker({ pin, size = huddleMap.size.userPin, userId }: { pin: NativeMapOwnPin; size?: number; userId?: string | null }) {
  return (
    <View style={styles.ownPinMarkerWrap}>
      <OwnPinBreathingHalo size={size} />
      <AvatarMarker
        avatarUrl={pin.avatar_url}
        borderColor={huddleMap.marker.ownPin}
        fallbackName={pin.display_name || "Me"}
        invisible={pin.is_invisible}
        size={size}
        userId={userId}
      />
    </View>
  );
}

function FriendPinMarker({ friend, compressed = false, size }: { friend: NativeMapFriendPin; compressed?: boolean; size?: number }) {
  const bucket = normalizeNativeGenderBucket(friend.gender_genre);
  const maskedAsset = pickNativeMaskedAvatarAsset(bucket, `${friend.id}:${friend.location_pinned_until || "unpinned"}:${bucket}${compressed ? ":compressed" : ""}`);
  return (
    <AvatarMarker
      avatarUrl={friend.is_invisible ? null : friend.avatar_url}
      borderColor={huddleColors.canvas}
      compressed={compressed}
      fallbackName={friend.display_name || "Friend"}
      fallbackSource={friend.is_invisible ? maskedAsset : null}
      invisible={false}
      invisibleFill={friend.is_verified ? huddleMap.marker.friendCompressedVerified : huddleMap.marker.friendCompressedUnverified}
      size={size}
      userId={friend.id}
    />
  );
}

function FriendGroupMarker({ asset, count }: { asset: ImageSourcePropType | null; count: number }) {
  const label = count >= 9 ? "9+" : String(count);
  const size = huddleMap.size.userPinCompressed;
  return (
    <View style={[styles.friendGroupMarker, {
      width: size,
      height: size,
      borderRadius: size / 2,
    }]}>
      {asset ? <Image resizeMode="cover" source={asset} style={[styles.friendGroupImage, { borderRadius: size / 2 }]} /> : null}
      <View pointerEvents="none" style={[styles.friendGroupWash, { borderRadius: size / 2 }]} />
      <Text style={styles.friendGroupOverlayCount}>{label}</Text>
    </View>
  );
}

function FriendFanMarker({ friends }: { friends: NativeMapFriendPin[] }) {
  const rows: NativeMapFriendPin[][] = [];
  friends.forEach((friend, index) => {
    const rowIndex = Math.floor(index / 4);
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push(friend);
  });
  return (
    <View accessibilityLabel={`${friends.length} people`} style={styles.friendFanMarker}>
      {rows.map((row, rowIndex) => (
        <View key={`friend-fan-row:${rowIndex}`} style={styles.friendFanRow}>
          {row.map((friend, columnIndex) => (
            <View
              key={friend.id}
              pointerEvents="none"
              style={[styles.friendFanAvatar, { zIndex: row.length - columnIndex }]}
            >
              <FriendPinMarker friend={friend} size={huddleMap.size.userPinOverview} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function NativeLocationPuck() {
  return (
    <View style={styles.locationPuckOuter}>
      <View style={styles.locationPuckInner} />
    </View>
  );
}

const MAP_LOAD_ERROR_CONFIRMATION_MS = 1200;
const MAP_LOAD_DEADLINE_MS = 8000;

export function NativeMapScreen({
  active = true,
  accessToken,
  alertFocusIntent = 0,
  bottomNavVisible = true,
  onBottomSheetOpenChange,
  onNavigate,
  search = "",
  sessionKey,
  userId = null,
}: NativeMapScreenProps) {
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const mapViewRef = useRef<Mapbox.MapView | null>(null);
  const wasActiveRef = useRef(active);
  const mapCameraActiveRef = useRef(false);
  const cameraRef = useRef<Mapbox.Camera | null>(null);
  const { t } = useLanguage();
  const tokenConfig = useMemo(() => readNativeMapTokenConfig(), []);
  const mapStyleURL = useMemo(() => readNativeMapStyleUrl() ?? Mapbox.StyleURL.Street, []);
  const petPoisEnabled = useMemo(() => readNativePetPoisEnabled(), []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mapLoadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapLoadDeadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReloadKey, setMapReloadKey] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapLoadedRef = useRef(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => () => {
    if (mapLoadErrorTimerRef.current) clearTimeout(mapLoadErrorTimerRef.current);
    if (mapLoadDeadlineTimerRef.current) clearTimeout(mapLoadDeadlineTimerRef.current);
  }, []);
  useEffect(() => {
    if (!active || !tokenConfig.ok || mapLoadedRef.current) return undefined;
    if (mapLoadDeadlineTimerRef.current) clearTimeout(mapLoadDeadlineTimerRef.current);
    mapLoadDeadlineTimerRef.current = setTimeout(() => {
      mapLoadDeadlineTimerRef.current = null;
      if (mapLoadedRef.current) return;
      setLoadError("Mapbox failed to load.");
      setMapLoaded(false);
    }, MAP_LOAD_DEADLINE_MS);
    return () => {
      if (mapLoadDeadlineTimerRef.current) clearTimeout(mapLoadDeadlineTimerRef.current);
      mapLoadDeadlineTimerRef.current = null;
    };
  }, [active, mapReloadKey, tokenConfig.ok]);
  const [alerts, setAlerts] = useState<NativeMapAlert[]>([]);
  const [hiddenAlertIds, setHiddenAlertIds] = useState<Set<string>>(new Set());
  const [selectedAlert, setSelectedAlert] = useState<NativeMapAlert | null>(null);
  // "Reached X people" for your own broadcasts. Its own state, never statusMessage:
  // that pill also carries map errors and would overwrite this mid-display.
  const [reachToast, setReachToast] = useState<NativeToastContent | null>(null);
  const [reachToastVersion, setReachToastVersion] = useState(0);
  const reachRequestIdRef = useRef(0);
  // Guards the AUTOMATIC open only (deep link). An explicit tap always re-queries,
  // because "tap again later, get a fresh count" is the whole point of live.
  const autoReachShownRef = useRef<Set<string>>(new Set());
  const mapReachToastShownRef = useRef(false);
  const mapReachQueryRequestedRef = useRef(false);
  // Any alert open suppresses the passive rollup for this visit. Owned alert
  // requests additionally invalidate an aggregate already in flight.
  const alertOpenedThisVisitRef = useRef(false);
  const ownedReachRequestedRef = useRef(false);
  const [alertSheetHeight, setAlertSheetHeight] = useState(0);
  const [petPois, setPetPois] = useState<NativePetPoi[]>([]);
  const [selectedPetPoi, setSelectedPetPoi] = useState<NativePetPoi | null>(null);
  const [friends, setFriends] = useState<NativeMapFriendPin[]>([]);
  const [anonymousAreas, setAnonymousAreas] = useState<NativeMapAnonymousArea[]>([]);
  const [mapPeopleGeometryVersion, setMapPeopleGeometryVersion] = useState<1 | 2>(2);
  const [mapViewerArea, setMapViewerArea] = useState<NativeMapAreaCell | null>(null);
  const [mapPeopleNextRefreshAt, setMapPeopleNextRefreshAt] = useState<string | null>(null);
  const [friendPeerIds, setFriendPeerIds] = useState<Set<string>>(() => new Set());
  const [ownPin, setOwnPin] = useState<NativeMapOwnPin | null>(null);
  const [centerCoordinate, setCenterCoordinate] = useState<[number, number]>(getNativeMapWarmCenter() ?? NATIVE_MAP_DEFAULT_CENTER);
  const [currentZoom, setCurrentZoom] = useState(NATIVE_MAP_DEFAULT_ZOOM);
  const [mapVisualZoomTier, setMapVisualZoomTier] = useState<MapVisualZoomTier>(() => initialMapVisualZoomTier(NATIVE_MAP_DEFAULT_ZOOM));
  const [settledAlertLayoutZoom, setSettledAlertLayoutZoom] = useState(NATIVE_MAP_DEFAULT_ZOOM);
  const [settledFriendLayoutZoom, setSettledFriendLayoutZoom] = useState(NATIVE_MAP_DEFAULT_ZOOM);
  const [expandedAlertIds, setExpandedAlertIds] = useState<Set<string>>(() => new Set());
  const [expandedFriendIds, setExpandedFriendIds] = useState<Set<string>>(() => new Set());
  const [cameraZoom, setCameraZoom] = useState(NATIVE_MAP_DEFAULT_ZOOM);
  const [mapRealtimeTopicsKey, setMapRealtimeTopicsKey] = useState(() =>
    mapRealtimeTopicsForCenters([getNativeMapWarmCenter() ?? NATIVE_MAP_DEFAULT_CENTER]).join(","),
  );
  const [showAlerts, setShowAlerts] = useState(true);
  const [showFriends, setShowFriends] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionState, setPermissionState] = useState<NativeLocationPermissionState>("unknown");
  const [permissionDetail, setPermissionDetail] = useState<NativeLocationPermissionDetail>({ canAskAgain: true, state: "unknown" });
  const [locationLoading, setLocationLoading] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [selfPrecision, setSelfPrecision] = useState<NativeMapPrecision>(NATIVE_MAP_PRECISION_DEFAULT);
  const [selfIncognitoAvatarVersion, setSelfIncognitoAvatarVersion] = useState(0);
  const [selfHours, setSelfHours] = useState(NATIVE_MAP_DEFAULT_SHARE_HOURS);
  const [selfPinMenuAnchor, setSelfPinMenuAnchor] = useState<NativeSelfPinMenuPlacement | null>(null);
  const openSelfPinMenuRef = useRef<(coordinate: [number, number], targetSize: number) => void>(() => undefined);
  // This is set exclusively by an explicit Map pin/location action after the
  // native permission request resolves. It must never appear during hydration.
  const [locationSettingsReason, setLocationSettingsReason] = useState<"permission" | "services" | null>(null);
  const [showUnpinConfirm, setShowUnpinConfirm] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const broadcastCoachMarkRef = useRef<View | null>(null);
  const [broadcastCoachMarkEligible, setBroadcastCoachMarkEligible] = useState(false);
  const [broadcastCoachMarkTarget, setBroadcastCoachMarkTarget] = useState<NativeSpotlightTarget | null>(null);
  const [showBroadcastCoachMark, setShowBroadcastCoachMark] = useState(false);
  const [isPickingBroadcastLocation, setIsPickingBroadcastLocation] = useState(false);
  const [broadcastPreviewPin, setBroadcastPreviewPin] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPreviewAddress, setBroadcastPreviewAddress] = useState<string | null>(null);
  const [broadcastPinningCenter, setBroadcastPinningCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPinningAddress, setBroadcastPinningAddress] = useState<string | null>(null);
  const [broadcastPinningDistanceKm, setBroadcastPinningDistanceKm] = useState(0);
  const [broadcastPinningLoading, setBroadcastPinningLoading] = useState(false);
  const [broadcastManualQuery, setBroadcastManualQuery] = useState("");
  const [broadcastManualSearching, setBroadcastManualSearching] = useState(false);
  const [broadcastManualFocused, setBroadcastManualFocused] = useState(false);
  const [broadcastManualAttempted, setBroadcastManualAttempted] = useState(false);
  const [broadcastDropConfirmation, setBroadcastDropConfirmation] = useState(false);
  const [broadcastDropPoint, setBroadcastDropPoint] = useState<{ x: number; y: number } | null>(null);
  const [draftBroadcastType, setDraftBroadcastType] = useState<"Stray" | "Lost" | "Caution" | "Others">("Stray");
  const [draftBroadcastPetType, setDraftBroadcastPetType] = useState<string | null>(null);
  const [mapRestricted, setMapRestricted] = useState(false);
  const [mapRestrictionModalOpen, setMapRestrictionModalOpen] = useState(false);
  const [mapProfileCard, setMapProfileCard] = useState<ShareCardData | null>(null);
  const mapProfileCardRequestRef = useRef(0);
  const [areaMenu, setAreaMenu] = useState<{
    members: NativeMapFriendPin[];
    anchor: { left: number; top: number };
    center: [number, number];
    hasOwner: boolean;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [alertFocus, setAlertFocus] = useState<{ key: string; source: "alert" | "thread"; modalOnly: boolean; shareToken: string | null } | null>(null);
  const [userFocus, setUserFocus] = useState<{ key: string; retries: number } | null>(null);
  const [broadcastRangePulse, setBroadcastRangePulse] = useState(0);
  const areaMenuScrollY = useRef(new Animated.Value(0)).current;

  const hasFullAlertDetail = useCallback((alert: NativeMapAlert | null) => Boolean(
    alert &&
    (
      alert.title ||
      alert.description ||
      alert.photo_url ||
      alert.media_urls.length > 0 ||
      alert.creator_id ||
      alert.creator.display_name ||
      alert.creator.avatar_url
    )
  ), []);

  useEffect(() => {
    const open = selectedAlert !== null || broadcastOpen || mapRestrictionModalOpen || mapProfileCard !== null || locationSettingsReason !== null || showUnpinConfirm;
    if (__DEV__ && selectedAlert) {
      console.log("NATIVE_MAP_ALERT_MODAL_OPEN", {
        alertId: selectedAlert.id,
        hasDetail: hasFullAlertDetail(selectedAlert),
      });
    }
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [broadcastOpen, hasFullAlertDetail, locationSettingsReason, mapProfileCard, mapRestrictionModalOpen, onBottomSheetOpenChange, selectedAlert, showUnpinConfirm]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotionEnabled(Boolean(enabled));
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setReduceMotionEnabled(Boolean(enabled));
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedAlert || hasFullAlertDetail(selectedAlert)) return;
    const hydrated = alerts.find((alert) => alert.id === selectedAlert.id);
    if (!hydrated || hydrated === selectedAlert || !hasFullAlertDetail(hydrated)) return;
    setSelectedAlert(hydrated);
  }, [alerts, hasFullAlertDetail, selectedAlert]);
  // True while an alert/thread focus param is pending. The cold-start centering reads
  // Read synchronously to skip GPS recenter, so a pin opened from Social lands on the
  // alert location on the first try instead of being clobbered by the "snap to me" jump.
  const alertFocusPendingRef = useRef(false);
  const alertFocusRequestRef = useRef(0);
  // A route remains in navigation state after its alert detail is resolved. Consume
  // each route once so a shell/session refresh cannot silently reopen the sheet.
  const alertFocusRouteKeyRef = useRef<string | null>(null);
  const broadcastDropAnim = useRef(new Animated.Value(0)).current;
  const statusPillAnim = useRef(new Animated.Value(0)).current;
  const offlineBannerAnim = useRef(new Animated.Value(0)).current;
  const broadcastAddressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastAddressRequestRef = useRef(0);
  const broadcastManualFocusedRef = useRef(false);
  const broadcastResolvedAddressRef = useRef<{ address: string; lat: number; lng: number } | null>(null);
  const centerCoordinateRef = useRef<[number, number]>(getNativeMapWarmCenter() ?? NATIVE_MAP_DEFAULT_CENTER);
  const latestPrivateGpsRef = useRef<{ lat: number; lng: number } | null>(null);
  const retainedOwnCoordinateRef = useRef<{ lat: number; lng: number } | null>(null);
  const cameraZoomRef = useRef(NATIVE_MAP_DEFAULT_ZOOM);
  const mapDataRequestIdRef = useRef(0);
  const selectedAlertDetailRequestIdRef = useRef(0);
  const framedAlertSelectionRef = useRef<string | null>(null);
  const friendGroupFocusRequestRef = useRef(0);
  const cameraActionRequestRef = useRef(0);
  const pendingCameraActionRef = useRef<PendingMapCameraAction | null>(null);
  // Mapbox can report a marker tap again through the map surface on iOS. Keep
  // this one short guard at the marker boundary; decorative layers never own it.
  const mapMarkerPressGuardUntilRef = useRef(0);
  const suppressNextAlertCameraIdleFetchRef = useRef(false);
  const cameraIdleFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRefreshRunningRef = useRef(false);
  const realtimeRefreshDirtyRef = useRef(false);
  const mapPeopleExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedMapAreaRef = useRef<{ center: [number, number]; zoomBucket: number } | null>(null);
  const petPoiCacheRef = useRef<PetPoiCache | null>(null);
  const petPoiFetchInFlightRef = useRef<{ key: string; request: Promise<NativePetPoi[]> } | null>(null);
  const mapShellRequestKeyRef = useRef<string | null>(null);
  const initialMapLoadKeyRef = useRef<string | null>(null);
  const initialMapDataSeedRef = useRef<{ ownPin: NativeMapOwnPin | null; sessionKey: string; viewerScope: NativeViewerScope } | null>(null);
  const mapIdentitySnapshotRef = useRef<{ ownPin: NativeMapOwnPin | null; sessionKey: string; viewerScope: NativeViewerScope } | null>(null);
  const broadcastRangePulseAnimRef = useRef(new Animated.Value(0));
  const sessionKeyRef = useRef("anonymous:0");
  const permissionStateRef = useRef<NativeLocationPermissionState>("unknown");
  const pendingSelfPinPersistRef = useRef<{ precision: NativeMapPrecision; visibleUntil: string } | null>(null);
  const selfPinPersistChainRef = useRef<Promise<void>>(Promise.resolve());
  const selfPinIntentVersionRef = useRef(0);
  const locationActionEpochRef = useRef(0);
  const effectiveUserId = userId;

  useEffect(() => {
    if (!active || !effectiveUserId) {
      setBroadcastCoachMarkEligible(false);
      setShowBroadcastCoachMark(false);
      return undefined;
    }
    let cancelled = false;
    void isNativeCoachMarkSeen(effectiveUserId, "map_broadcast_intro").then((seen) => {
      if (cancelled) return;
      setShowBroadcastCoachMark(false);
      setBroadcastCoachMarkEligible(!seen);
    });
    return () => { cancelled = true; };
  }, [active, effectiveUserId]);

  useEffect(() => {
    if (!active || !broadcastCoachMarkEligible) {
      setBroadcastCoachMarkTarget(null);
      return undefined;
    }
    let cancelled = false;
    let frame = 0;
    let remainingAttempts = 8;
    const measure = () => {
      if (cancelled) return;
      broadcastCoachMarkRef.current?.measureInWindow((x, y, width, height) => {
        if (cancelled) return;
        if (width > 0 && height > 0) {
          setBroadcastCoachMarkTarget({ x, y, width, height, shape: "circle" });
          return;
        }
        remainingAttempts -= 1;
        if (remainingAttempts > 0) frame = requestAnimationFrame(measure);
      });
    };
    frame = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, broadcastCoachMarkEligible, windowSize.height, windowSize.width]);

  const startBroadcastCoachMark = useCallback(() => {
    if (!broadcastCoachMarkEligible || !broadcastCoachMarkTarget || showBroadcastCoachMark) return false;
    setShowBroadcastCoachMark(true);
    return true;
  }, [broadcastCoachMarkEligible, broadcastCoachMarkTarget, showBroadcastCoachMark]);

  const showReachToast = useCallback((content: NativeToastContent) => {
    mapReachToastShownRef.current = true;
    setReachToast(content);
    // A repeat tap can legitimately return the same count and copy. Remount the
    // existing toast so its one countdown restarts without creating a stack.
    setReachToastVersion((current) => current + 1);
  }, []);

  // A newer request always wins: an older in-flight response must never replace
  // a fresher count. Mirrors selectedAlertDetailRequestIdRef below.
  const runReachQuery = useCallback((alertId: string | null) => {
    if (!effectiveUserId) return;
    const requestId = ++reachRequestIdRef.current;
    void fetchNativeBroadcastReach({ alertId, accessToken }).then((reach) => {
      if (!reach || requestId !== reachRequestIdRef.current) return;
      if (!alertId && (alertOpenedThisVisitRef.current || ownedReachRequestedRef.current)) return;
      const content = alertId ? buildTappedReachToast(reach) : buildRollupReachToast(reach);
      if (content) showReachToast(content);
    });
  }, [accessToken, effectiveUserId, showReachToast]);

  const dismissMapPopovers = useCallback(() => {
    friendGroupFocusRequestRef.current += 1;
    cameraActionRequestRef.current += 1;
    pendingCameraActionRef.current = null;
    setExpandedFriendIds(new Set());
    setAreaMenu(null);
    setSelfPinMenuAnchor(null);
  }, []);

  const clearPrimaryMapSelection = useCallback(() => {
    dismissMapPopovers();
    setSelectedPetPoi(null);
  }, [dismissMapPopovers]);

  const dismissAlertDetail = useCallback(() => {
    // Both direct-pin and deep-link hydration are async. Closing the sheet is a
    // definitive user action, so invalidate either response before clearing it.
    alertFocusRequestRef.current += 1;
    selectedAlertDetailRequestIdRef.current += 1;
    alertFocusPendingRef.current = false;
    setAlertFocus(null);
    setAlertSheetHeight(0);
    setSelectedAlert(null);
  }, []);

  useEffect(() => {
    let active = true;
    if (!effectiveUserId || !accessToken) {
      setFriendPeerIds(new Set());
      return () => { active = false; };
    }
    void fetchNativeMatchedRailSummary({ accessToken, userId: effectiveUserId })
      .then((rows) => {
        if (!active) return;
        setFriendPeerIds(new Set(rows.map((row) => row.peerUserId)));
      })
      .catch(() => {
        if (active) setFriendPeerIds(new Set());
      });
    return () => { active = false; };
  }, [accessToken, effectiveUserId]);

  const mapShellSessionKey = useMemo(() => (
    nativeMapScreenSessionKey(effectiveUserId, sessionKey)
  ), [effectiveUserId, sessionKey]);
  useEffect(() => {
    sessionKeyRef.current = mapShellSessionKey;
    // Never carry a previous account/session's private device fix into the next
    // signed-in map surface. The active session will repopulate this from its own
    // cached or live foreground location.
    latestPrivateGpsRef.current = null;
    retainedOwnCoordinateRef.current = null;
    mapIdentitySnapshotRef.current = null;
  }, [mapShellSessionKey]);

  useEffect(() => {
    if (!ownPin) return;
    setSelfPrecision(pendingSelfPinPersistRef.current?.precision ?? normalizeNativeMapPrecision(ownPin.map_precision));
    const visibleUntilMs = typeof ownPin.map_visible_until === "string" ? new Date(ownPin.map_visible_until).getTime() : NaN;
    if (Number.isFinite(visibleUntilMs) && visibleUntilMs > Date.now()) {
      setSelfHours(clampCustomHours(Math.ceil((visibleUntilMs - Date.now()) / 3600_000)));
    }
  }, [ownPin]);

  useEffect(() => {
    const snapshot = mapIdentitySnapshotRef.current;
    if (!snapshot || snapshot.sessionKey !== mapShellSessionKey) return;
    snapshot.ownPin = ownPin;
  }, [mapShellSessionKey, ownPin]);

  const alertsCacheKey = useMemo(() => (effectiveUserId ? `huddle:native-map-alerts:${effectiveUserId}` : null), [effectiveUserId]);
  const mapSessionCacheKey = useMemo(() => (effectiveUserId ? `huddle:native-map-session:v8:${mapShellSessionKey}` : null), [effectiveUserId, mapShellSessionKey]);
  const applyCamera = useCallback((center: [number, number], zoom?: number, persist = true, duration?: number, padding?: Mapbox.CameraPadding) => {
    void persist;
    centerCoordinateRef.current = center;
    setCenterCoordinate(center);
    // Remember the latest real center for this session so a freshly opened/remounted
    // map paints here instead of the hardcoded default. Never seeded with the default.
    if (center !== NATIVE_MAP_DEFAULT_CENTER) setNativeMapWarmCenter(center);
    if (typeof zoom === "number" && Number.isFinite(zoom)) {
      cameraZoomRef.current = zoom;
      setCameraZoom(zoom);
    }
    cameraRef.current?.setCamera({
      animationDuration: duration ?? huddleMotion.durations.enter,
      centerCoordinate: center,
      zoomLevel: typeof zoom === "number" && Number.isFinite(zoom) ? zoom : cameraZoomRef.current,
      ...(padding ? { padding } : {}),
    });
  }, []);

  const focusSelectionCamera = useCallback((
    center: [number, number],
    zoom: number,
    duration: number = huddleMotion.durations.base,
    padding?: Mapbox.CameraPadding,
    onSettled?: () => void | Promise<void>,
  ) => {
    const requestId = ++cameraActionRequestRef.current;
    pendingCameraActionRef.current = onSettled ? { id: requestId, onSettled } : null;
    suppressNextAlertCameraIdleFetchRef.current = true;
    const currentCenter = centerCoordinateRef.current;
    const cameraAlreadySettled = Math.abs(currentCenter[0] - center[0]) < 0.000001
      && Math.abs(currentCenter[1] - center[1]) < 0.000001
      && Math.abs(cameraZoomRef.current - zoom) < 0.01
      && !padding;
    if (cameraAlreadySettled) {
      suppressNextAlertCameraIdleFetchRef.current = false;
      pendingCameraActionRef.current = null;
      if (onSettled) void Promise.resolve(onSettled());
      return;
    }
    applyCamera(center, zoom, true, duration, padding);
  }, [applyCamera]);

  const focusAlertCamera = useCallback((
    center: [number, number],
    zoom: number,
    duration: number = huddleMotion.durations.base,
    padding?: Mapbox.CameraPadding,
  ) => {
    focusSelectionCamera(center, zoom, duration, padding);
  }, [focusSelectionCamera]);

  const selectedAlertId = selectedAlert?.id ?? null;
  const selectedAlertLatitude = selectedAlert?.latitude ?? null;
  const selectedAlertLongitude = selectedAlert?.longitude ?? null;
  useEffect(() => {
    if (!selectedAlertId || selectedAlertLatitude === null || selectedAlertLongitude === null) {
      framedAlertSelectionRef.current = null;
      setAlertSheetHeight(0);
      return;
    }
    if (alertSheetHeight <= 0) return;
    if (framedAlertSelectionRef.current === selectedAlertId) return;
    framedAlertSelectionRef.current = selectedAlertId;
    // Center the pin in the map that remains visible above the real sheet,
    // rather than using a fixed inset that only happens to fit one card size.
    focusAlertCamera(
      [selectedAlertLongitude, selectedAlertLatitude],
      Math.max(cameraZoomRef.current, ALERT_EXPAND_TARGET_ZOOM),
      huddleMotion.durations.base,
      { paddingBottom: alertSheetHeight, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
    );
  }, [alertSheetHeight, focusAlertCamera, selectedAlertId, selectedAlertLatitude, selectedAlertLongitude]);

  const readCurrentMapBounds = useCallback(async (center: [number, number]) => {
    try {
      const mapView = mapViewRef.current as (Mapbox.MapView & { getVisibleBounds?: () => Promise<unknown> }) | null;
      const visibleBounds = await mapView?.getVisibleBounds?.();
      return normalizeVisibleBounds(visibleBounds, center, cameraZoomRef.current);
    } catch {
      return mapBoundsFromCenter(center, cameraZoomRef.current);
    }
  }, []);

  const applyVisiblePetPoisFromCache = useCallback((rows: NativePetPoi[], bounds: NativeMapBounds) => {
    const visibleRows = deriveVisiblePetPois(rows, bounds);
    setPetPois((current) => samePetPoiRows(current, visibleRows) ? current : visibleRows);
    setSelectedPetPoi((current) => (current && visibleRows.some((row) => row.id === current.id) ? current : null));
  }, []);

  const loadPetPoisForMap = useCallback(async (
    center: [number, number],
    requestId: number,
    cacheWriteGuard: () => boolean,
    options?: { force?: boolean },
  ) => {
    if (!petPoisEnabled) {
      petPoiCacheRef.current = null;
      if (cacheWriteGuard()) {
        setPetPois([]);
        setSelectedPetPoi(null);
      }
      return;
    }

    if (cameraZoomRef.current < PET_POI_MIN_ZOOM) {
      if (cacheWriteGuard()) {
        setPetPois([]);
        setSelectedPetPoi(null);
      }
      return;
    }

    const viewportBounds = await readCurrentMapBounds(center);
    const cached = petPoiCacheRef.current;
    const now = Date.now();
    const cachedMovedKm = cached ? distanceKmBetween(
      { lat: cached.center[1], lng: cached.center[0] },
      { lat: center[1], lng: center[0] },
    ) : Number.POSITIVE_INFINITY;
    const canUseCache = Boolean(
      cached &&
      !options?.force &&
      now - cached.loadedAt < PET_POI_CACHE_MS &&
      cachedMovedKm <= PET_POI_CACHE_REFETCH_MOVE_KM
    );

    if (canUseCache && cached) {
      if (cacheWriteGuard()) applyVisiblePetPoisFromCache(cached.rows, viewportBounds);
      if (__DEV__) console.log("NATIVE_MAP_PET_POIS_CACHE_HIT", { count: cached.rows.length, visibleCount: deriveVisiblePetPois(cached.rows, viewportBounds).length, movedKm: cachedMovedKm });
      return;
    }

    const fetchKey = petPoiCacheFetchKey(center, PET_POI_CACHE_RADIUS_KM);
    const cacheBounds = mapBoundsFromRadiusKm(center, PET_POI_CACHE_RADIUS_KM);
    try {
      let request = petPoiFetchInFlightRef.current?.key === fetchKey
        ? petPoiFetchInFlightRef.current.request
        : null;
      if (!request) {
        request = fetchVisiblePetPois(cacheBounds, {
          accessToken,
          countryCode: "HK",
          limit: PET_POI_FETCH_LIMIT,
          regionKey: "HK",
        });
        petPoiFetchInFlightRef.current = { key: fetchKey, request };
      }
      const rows = await request;
      if (petPoiFetchInFlightRef.current?.key === fetchKey) petPoiFetchInFlightRef.current = null;
      if (requestId !== mapDataRequestIdRef.current || !cacheWriteGuard()) return;
      petPoiCacheRef.current = {
        center,
        loadedAt: Date.now(),
        radiusKm: PET_POI_CACHE_RADIUS_KM,
        rows,
      };
      if (__DEV__) console.log("NATIVE_MAP_PET_POIS_CACHE_FETCHED", { count: rows.length, fetchKey, radiusKm: PET_POI_CACHE_RADIUS_KM, zoom: cameraZoomRef.current });
      applyVisiblePetPoisFromCache(rows, viewportBounds);
    } catch (error) {
      if (petPoiFetchInFlightRef.current?.key === fetchKey) petPoiFetchInFlightRef.current = null;
      if (__DEV__) console.warn("NATIVE_MAP_PET_POIS_FETCH_FAILED", { error: error instanceof Error ? error.message : String(error) });
      if (!cacheWriteGuard()) return;
      const fallbackCache = petPoiCacheRef.current;
      if (fallbackCache) {
        applyVisiblePetPoisFromCache(fallbackCache.rows, viewportBounds);
        return;
      }
      setPetPois([]);
      setSelectedPetPoi(null);
    }
  }, [accessToken, applyVisiblePetPoisFromCache, petPoisEnabled, readCurrentMapBounds]);

  const readCachedAlerts = useCallback(async () => {
    if (!alertsCacheKey) return [];
    try {
      const raw = await readNativeDisplayCacheItem(alertsCacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.filter((item): item is NativeMapAlert => (
        item && typeof item.id === "string" && typeof item.latitude === "number" && typeof item.longitude === "number"
      )) : [];
    } catch {
      return [];
    }
  }, [alertsCacheKey]);

  const writeCachedAlerts = useCallback(async (nextAlerts: NativeMapAlert[]) => {
    if (!alertsCacheKey) return;
    try {
      await AsyncStorage.setItem(alertsCacheKey, JSON.stringify(nextAlerts));
    } catch {
      // best-effort cache only
    }
  }, [alertsCacheKey]);

  const mergeAlertsWithExpiredCache = useCallback(async (nextAlerts: NativeMapAlert[]) => {
    const cached = await readCachedAlerts();
    if (cached.length === 0) return nextAlerts;
    const nextIds = new Set(nextAlerts.map((alert) => alert.id));
    const now = Date.now();
    const fallbackDots = cached
      .filter((alert) => !nextIds.has(alert.id))
      .filter((alert) => alert.marker_state === "expired_dot")
      .filter((alert) => {
        const baseMs = alert.expires_at ? new Date(alert.expires_at).getTime() : new Date(alert.created_at).getTime();
        return Number.isFinite(baseMs) && baseMs + ALERT_CACHE_GRACE_MS > now;
      })
      .map((alert) => ({ ...alert, marker_state: "expired_dot" as const }));
    const dedup = new Map<string, NativeMapAlert>();
    [...nextAlerts, ...fallbackDots].forEach((alert) => dedup.set(alert.id, alert));
    return sortNativeMapAlertsForDisplay(Array.from(dedup.values()), centerCoordinateRef.current);
  }, [readCachedAlerts]);


  const shellToAlertMarker = useCallback((shell: NativeMapPinShell): NativeMapAlert => {
    return {
      id: shell.pin_id,
      latitude: shell.lat,
      longitude: shell.lng,
      alert_type: shell.alert_type || shell.pin_type || "Others",
      pet_type: shell.pet_type,
      title: null,
      description: null,
      photo_url: null,
      media_urls: [],
      support_count: 0,
      share_count: 0,
      report_count: 0,
      created_at: shell.updated_at,
      expires_at: null,
      range_meters: shell.range_meters,
      range_km: shell.range_km,
      duration_hours: null,
      creator_id: shell.creator_id,
      has_thread: false,
      thread_id: null,
      posted_to_threads: false,
      post_on_social: false,
      social_post_id: null,
      social_status: null,
      social_url: null,
      is_sensitive: false,
      verified_only: shell.verified_only,
      is_demo: false,
      location_street: null,
      location_district: null,
      creator: {
        avatar_url: null,
        display_name: null,
        social_id: null,
      },
      marker_state: shell.marker_state,
    };
  }, []);

  const loadMapData = useCallback(async (options?: { center?: [number, number] | null; force?: boolean; recenter?: boolean; recenterDuration?: number; useCameraCenter?: boolean; refreshIdentity?: boolean }) => {
    const requestId = ++mapDataRequestIdRef.current;
    // A later explicit pin/unpin choice always outranks this asynchronous shell
    // read. Without this fence, an older request can repaint a pin after the
    // user has already changed their presence state.
    const ownPinIntentVersion = selfPinIntentVersionRef.current;
    const requestSessionKey = mapShellSessionKey;
    const currentSessionKey = () => sessionKeyRef.current;
    const cacheWriteGuard = () => currentSessionKey() === requestSessionKey;
    const center = options?.center
      ? options.center
      : options?.useCameraCenter
        ? centerCoordinateRef.current
        : centerCoordinateRef.current;
    const { key: viewportBucketKey, zoomBucket } = mapShellBucketFor(center, cameraZoomRef.current, mapShellSessionKey);
    if (!options?.force && !options?.recenter && !options?.refreshIdentity && mapShellRequestKeyRef.current === viewportBucketKey) return;
    mapShellRequestKeyRef.current = viewportBucketKey;

    // Snap the camera to the requested center immediately, before the network round
    // trip, so a GPS / pin / last-view recenter never appears to linger on the default.
    if (options?.recenter && center) applyCamera(center, cameraZoomRef.current, false, options.recenterDuration);

    const run = async () => {
      if (!effectiveUserId) {
        if (!cacheWriteGuard()) return;
        setAlerts([]);
        setFriends([]);
        setAnonymousAreas([]);
        setMapPeopleGeometryVersion(2);
        setMapViewerArea(null);
        setMapPeopleNextRefreshAt(null);
        setOwnPin(null);
        petPoiCacheRef.current = null;
        setPetPois([]);
        setSelectedPetPoi(null);
        applyCamera(NATIVE_MAP_DEFAULT_CENTER, NATIVE_MAP_DEFAULT_ZOOM, false);
        return;
      }

      const seed = initialMapDataSeedRef.current;
      const identitySnapshot = mapIdentitySnapshotRef.current;
      let viewerScope: NativeViewerScope;
      let nextOwnPin: NativeMapOwnPin | null;
      if (seed?.sessionKey === requestSessionKey) {
        initialMapDataSeedRef.current = null;
        viewerScope = seed.viewerScope;
        nextOwnPin = seed.ownPin;
        mapIdentitySnapshotRef.current = seed;
      } else if (!options?.force && !options?.refreshIdentity && identitySnapshot?.sessionKey === requestSessionKey) {
        viewerScope = identitySnapshot.viewerScope;
        nextOwnPin = identitySnapshot.ownPin;
      } else {
        [viewerScope, nextOwnPin] = await Promise.all([
          resolveNativeViewerScope({ userId: effectiveUserId, accessToken, sessionKey: mapShellSessionKey }),
          fetchNativeMapOwnPin(effectiveUserId, { accessToken, force: options?.force === true, sessionKey: mapShellSessionKey }),
        ]);
        mapIdentitySnapshotRef.current = {
          ownPin: nextOwnPin,
          sessionKey: requestSessionKey,
          viewerScope,
        };
      }
      const relatedPoint = pointToCenter(viewerScope.primaryPoint);
      const privateGps = latestPrivateGpsRef.current;
      const displayOwnPin = nextOwnPin && privateGps ? {
        ...nextOwnPin,
        lat: privateGps.lat,
        lng: privateGps.lng,
      } : nextOwnPin;
      const anchors = uniqueMapShellAnchors([
        { center, radiusMeters: mapShellRadiusForZoom(cameraZoomRef.current) },
        ...(relatedPoint ? [{ center: relatedPoint, radiusMeters: MAP_RELATED_ANCHOR_RADIUS_M }] : []),
      ]);
      // Subscribe only around the visible camera center. The secondary related
      // anchor is a read/cache enrichment and must not double long-lived map
      // channels or create subscription churn off-screen.
      const nextRealtimeTopicsKey = mapRealtimeTopicsForCenters([center]).join(",");
      setMapRealtimeTopicsKey((current) => current === nextRealtimeTopicsKey ? current : nextRealtimeTopicsKey);
      // Pet POIs only need `center`/`requestId`/`cacheWriteGuard`, not the shells/people
      // result, so start this fetch alongside them instead of waiting for them to finish.
      void loadPetPoisForMap(center, requestId, cacheWriteGuard, { force: options?.force === true });
      const [shellGroups, peopleGroups] = await Promise.all([
        Promise.all(anchors.map((anchor) => fetchVisibleMapPinShells(anchor.center, anchor.radiusMeters, {
          accessToken,
          viewerId: effectiveUserId,
          sessionKey: mapShellSessionKey,
          force: options?.force === true,
          cacheWriteGuard: () => requestId === mapDataRequestIdRef.current && cacheWriteGuard(),
        }))),
        Promise.all(anchors.map((anchor) => fetchNativeMapPeopleV2(anchor.center, anchor.radiusMeters, {
          accessToken,
          viewerId: effectiveUserId,
          sessionKey: mapShellSessionKey,
          force: options?.force === true,
          cacheWriteGuard: () => requestId === mapDataRequestIdRef.current && cacheWriteGuard(),
        }))),
      ]);
      const shellMap = new Map<string, NativeMapPinShell>();
      shellGroups.flat().forEach((shell) => shellMap.set(shell.pin_id, shell));
      const shells = Array.from(shellMap.values());
      if (requestId !== mapDataRequestIdRef.current || !cacheWriteGuard()) return;
      const alertShells = shells.filter((shell) => shell.is_alert).map(shellToAlertMarker);
      const connectionMap = new Map<string, NativeMapFriendPin>();
      const anonymousAreaRowsAcrossAnchors: NativeMapAnonymousArea[] = [];
      peopleGroups.forEach((group) => {
        group.connections.forEach((connection) => connectionMap.set(connection.id, connection));
        anonymousAreaRowsAcrossAnchors.push(...group.anonymousAreas);
      });
      const friendShells = Array.from(connectionMap.values());
      const anonymousAreaRows = mergeNativeMapAnonymousAreas(anonymousAreaRowsAcrossAnchors);
      const geometryVersions = new Set(peopleGroups.map((group) => group.geometryVersion));
      if (geometryVersions.size !== 1) throw new Error("mixed_map_people_geometry_versions");
      const nextGeometryVersion = peopleGroups[0]?.geometryVersion ?? 1;
      const nextViewerArea = nextGeometryVersion === 2
        ? peopleGroups.map((group) => group.viewerArea).find((area): area is NativeMapAreaCell => area !== null) ?? null
        : null;
      const nextPeopleRefreshAt = peopleGroups
        .map((group) => group.nextRefreshAt)
        .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;

      setAlerts((current) => {
        const currentById = new Map(current.map((alert) => [alert.id, alert]));
        const mergedAlerts = alertShells.map((shellAlert) => {
          const currentAlert = currentById.get(shellAlert.id);
          if (!currentAlert || !hasFullAlertDetail(currentAlert)) return shellAlert;
          return {
            ...currentAlert,
            latitude: shellAlert.latitude,
            longitude: shellAlert.longitude,
            alert_type: shellAlert.alert_type,
            created_at: shellAlert.created_at,
            marker_state: shellAlert.marker_state,
          };
        });
        const sorted = sortNativeMapAlertsForDisplay(mergedAlerts, center);
        void writeCachedAlerts(sorted);
        return sorted;
      });
      setFriends(friendShells);
      setAnonymousAreas(anonymousAreaRows);
      setMapPeopleGeometryVersion(nextGeometryVersion);
      setMapViewerArea(nextViewerArea);
      setMapPeopleNextRefreshAt(nextPeopleRefreshAt);
      setOwnPin((current) => {
        if (ownPinIntentVersion !== selfPinIntentVersionRef.current) return current;
        const pending = pendingSelfPinPersistRef.current;
        if (!displayOwnPin || !pending) return displayOwnPin;
        const canonicalPrecision = normalizeNativeMapPrecision(displayOwnPin.map_precision);
        if (canonicalPrecision === pending.precision) {
          pendingSelfPinPersistRef.current = null;
          return displayOwnPin;
        }
        return {
          ...displayOwnPin,
          is_invisible: pending.precision === "hidden",
          map_precision: pending.precision,
          map_visible_until: pending.visibleUntil,
        };
      });
      lastFetchedMapAreaRef.current = { center, zoomBucket };
      // (Recenter already applied synchronously above, before the network fetch.)

      if (mapSessionCacheKey && cacheWriteGuard()) {
        try {
          const dbConfirmedAt = Date.now();
          await AsyncStorage.setItem(mapSessionCacheKey, JSON.stringify({
            ts: dbConfirmedAt,
            dbConfirmedAt,
            source: "db",
            status: "fresh",
            center,
            cameraZoom: cameraZoomRef.current,
            alerts: alertShells,
            anonymousAreas: anonymousAreaRows,
            nextRefreshAt: nextPeopleRefreshAt,
          }));
        } catch {
          // best-effort cache only
        }
      }
    };
    return run().finally(() => {
      if (mapShellRequestKeyRef.current === viewportBucketKey) mapShellRequestKeyRef.current = null;
    });
  }, [accessToken, applyCamera, effectiveUserId, hasFullAlertDetail, loadPetPoisForMap, mapSessionCacheKey, mapShellSessionKey, shellToAlertMarker, writeCachedAlerts]);
  const loadMapDataRef = useRef(loadMapData);

  useEffect(() => {
    loadMapDataRef.current = loadMapData;
  }, [loadMapData]);

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      locationActionEpochRef.current += 1;
      setAreaMenu(null);
      setLocationSettingsReason(null);
      setShowUnpinConfirm(false);
      setBroadcastOpen(false);
      setMapRestrictionModalOpen(false);
      mapProfileCardRequestRef.current += 1;
      setMapProfileCard(null);
      setSelectedAlert(null);
      setSelectedPetPoi(null);
      return;
    }
    if (!becameActive) return;
    setAreaMenu(null);
    // Profile-summary events already patch Home and Map's shared Out Now state.
    // Keep the loaded native base map and committed pins intact on tab return.
  }, [active]);

  useEffect(() => {
    if (!tokenConfig.ok) return;
    Mapbox.setAccessToken(tokenConfig.token);
  }, [tokenConfig]);

  useEffect(() => {
    if (!effectiveUserId) return;
    const requestSessionKey = mapShellSessionKey;
    const runTriggeredRefresh = async () => {
      if (!active || sessionKeyRef.current !== requestSessionKey) return;
      if (mapCameraActiveRef.current || realtimeRefreshRunningRef.current) {
        realtimeRefreshDirtyRef.current = true;
        return;
      }
      realtimeRefreshRunningRef.current = true;
      try {
        await loadMapDataRef.current({ force: true, useCameraCenter: true });
      } catch {
        // Keep the last DB-confirmed privacy-safe snapshot.
      } finally {
        realtimeRefreshRunningRef.current = false;
        if (realtimeRefreshDirtyRef.current && active && sessionKeyRef.current === requestSessionKey) {
          realtimeRefreshDirtyRef.current = false;
          void runTriggeredRefresh();
        }
      }
    };
    const refreshMapShell = () => {
      realtimeRefreshDirtyRef.current = true;
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        if (!active || sessionKeyRef.current !== requestSessionKey || mapCameraActiveRef.current) return;
        realtimeRefreshDirtyRef.current = false;
        void runTriggeredRefresh();
      }, 750);
    };
    const mapHandles = mapRealtimeTopicsKey.split(",").filter(Boolean).map((topic) =>
      createSinglePrivateBroadcastChannel(
        `native-map-cell:${effectiveUserId}:${topic}`,
        topic,
        refreshMapShell,
      ));
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      mapHandles.forEach((handle) => { void handle.dispose(); });
    };
  }, [active, effectiveUserId, mapRealtimeTopicsKey, mapShellSessionKey]);

  useEffect(() => {
    if (mapPeopleExpiryTimerRef.current) clearTimeout(mapPeopleExpiryTimerRef.current);
    mapPeopleExpiryTimerRef.current = null;
    if (!active || !mapPeopleNextRefreshAt) return undefined;
    const expiresMs = Date.parse(mapPeopleNextRefreshAt);
    if (!Number.isFinite(expiresMs)) return undefined;
    const delay = Math.max(0, Math.min(2_147_000_000, expiresMs - Date.now() + 250));
    mapPeopleExpiryTimerRef.current = setTimeout(() => {
      mapPeopleExpiryTimerRef.current = null;
      if (!active || mapCameraActiveRef.current) {
        realtimeRefreshDirtyRef.current = true;
        return;
      }
      void loadMapDataRef.current({ force: true, useCameraCenter: true }).catch(() => undefined);
    }, delay);
    return () => {
      if (mapPeopleExpiryTimerRef.current) clearTimeout(mapPeopleExpiryTimerRef.current);
      mapPeopleExpiryTimerRef.current = null;
    };
  }, [active, mapPeopleNextRefreshAt]);

  useEffect(() => {
    let active = true;
    const syncNetworkState = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (active) setIsOffline(state.isConnected === false || state.isInternetReachable === false);
      } catch {
        if (active) setIsOffline(false);
      }
    };
    void syncNetworkState();
    const subscription = Network.addNetworkStateListener((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!statusMessage) {
      Animated.timing(statusPillAnim, { toValue: 0, duration: huddleMotion.durations.fast, useNativeDriver: true }).start();
      return undefined;
    }
    Animated.timing(statusPillAnim, { toValue: 1, duration: huddleMotion.durations.fast, useNativeDriver: true }).start();
    const timer = setTimeout(() => setStatusMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [statusMessage, statusPillAnim]);

  useEffect(() => {
    Animated.timing(offlineBannerAnim, {
      toValue: isOffline ? 1 : 0,
      duration: huddleMotion.durations.base,
      useNativeDriver: true,
    }).start();
  }, [isOffline, offlineBannerAnim]);

  useEffect(() => {
    permissionStateRef.current = permissionState;
  }, [permissionState]);

  useEffect(() => {
    broadcastManualFocusedRef.current = broadcastManualFocused;
  }, [broadcastManualFocused]);

  useEffect(() => {
    if (!broadcastDropConfirmation) {
      broadcastDropAnim.setValue(0);
      setBroadcastDropPoint(null);
      return;
    }
    Animated.sequence([
      Animated.spring(broadcastDropAnim, {
        friction: 6,
        tension: 120,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.delay(520),
      Animated.timing(broadcastDropAnim, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [broadcastDropAnim, broadcastDropConfirmation]);

  useEffect(() => {
    if (!isPickingBroadcastLocation || !broadcastPinningCenter) return undefined;
    const requestId = ++broadcastAddressRequestRef.current;
    setBroadcastPinningDistanceKm(distanceKmBetween(deviceLocation, broadcastPinningCenter));
    setBroadcastPinningLoading(true);
    setBroadcastPinningAddress(null);
    if (!broadcastManualFocusedRef.current) setBroadcastManualQuery("");
    if (broadcastAddressDebounceRef.current) clearTimeout(broadcastAddressDebounceRef.current);
    broadcastAddressDebounceRef.current = setTimeout(() => {
      void lookupNativeMapAddress(broadcastPinningCenter.lat, broadcastPinningCenter.lng)
        .then((address) => {
          if (requestId !== broadcastAddressRequestRef.current) return;
          setBroadcastPinningAddress(address || null);
          broadcastResolvedAddressRef.current = address ? { address, lat: broadcastPinningCenter.lat, lng: broadcastPinningCenter.lng } : null;
          if (!broadcastManualFocusedRef.current) setBroadcastManualQuery(address || "");
        })
        .catch(() => {
          if (requestId !== broadcastAddressRequestRef.current) return;
          setBroadcastPinningAddress(null);
        })
        .finally(() => {
          if (requestId === broadcastAddressRequestRef.current) setBroadcastPinningLoading(false);
        });
    }, 250);
    return () => {
      if (broadcastAddressDebounceRef.current) clearTimeout(broadcastAddressDebounceRef.current);
      if (broadcastAddressRequestRef.current === requestId) broadcastAddressRequestRef.current += 1;
    };
  }, [broadcastPinningCenter, deviceLocation, isPickingBroadcastLocation]);

  useEffect(() => {
    let active = true;
    const syncRestrictions = async () => {
      if (!effectiveUserId) {
        if (active) setMapRestricted(false);
        return;
      }
      const restricted = await isNativeRestrictionActive("map_disabled");
      if (active) setMapRestricted(restricted);
    };
    void syncRestrictions();
    const handle = effectiveUserId
      ? createSingleRealtimeChannel(`native-map-restrictions:${effectiveUserId}`, (channel) =>
          channel
            .on("postgres_changes", { event: "*", schema: "public", table: "user_moderation_restrictions", filter: `user_id=eq.${effectiveUserId}` }, syncRestrictions)
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_moderation", filter: `user_id=eq.${effectiveUserId}` }, syncRestrictions)
        )
      : null;
    return () => {
      active = false;
      if (handle) void handle.dispose();
    };
  }, [effectiveUserId]);

  useEffect(() => {
    const unsubscribePermission = subscribeNativeLocationPermissionDetail((detail) => {
      setPermissionDetail(detail);
      setPermissionState(detail.state);
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const previousPermission = permissionStateRef.current;
      void getNativeForegroundLocationPermissionDetail().then((detail) => {
        setPermissionDetail(detail);
        setPermissionState(detail.state);
        if (detail.state === "granted") {
          void getNativeCurrentCoordinates().then(setDeviceLocation).catch(() => setDeviceLocation(null));
          if (previousPermission !== "granted") void loadMapDataRef.current().catch(() => undefined);
        }
      }).catch(() => undefined);
    });
    return () => {
      unsubscribePermission();
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const loadKey = mapShellSessionKey;
    if (initialMapLoadKeyRef.current === loadKey) return;
    initialMapLoadKeyRef.current = loadKey;
    let active = true;
    setDataLoading(true);
    void (async () => {
      const isColdStart = !nativeMapColdStartConsumed;
      nativeMapColdStartConsumed = true;
      let cachedCenter: [number, number] | null = null;
      let gpsCenter: [number, number] | null = null;
      let storedPinCenter: [number, number] | null = null;
      let cityCenter: [number, number] | null = null;
      let areaDistrictCenter: [number, number] | null = null;
      let initialOwnPin: NativeMapOwnPin | null = null;
      let initialViewerScope: NativeViewerScope | null = null;
      if (mapSessionCacheKey) {
        try {
          const raw = await readNativeDisplayCacheItem(mapSessionCacheKey);
          const cached = raw ? JSON.parse(raw) as {
            ts?: number;
            dbConfirmedAt?: number;
            source?: string;
            status?: string;
            center?: [number, number];
            cameraZoom?: number;
            alerts?: NativeMapAlert[];
            anonymousAreas?: NativeMapAnonymousArea[];
            nextRefreshAt?: string | null;
          } : null;

          if (
            cached &&
            typeof (cached.dbConfirmedAt ?? cached.ts) === "number" &&
            Date.now() - (cached.dbConfirmedAt ?? cached.ts ?? 0) < NATIVE_MAP_SESSION_CACHE_MS &&
            Array.isArray(cached.center) &&
            typeof cached.center[0] === "number" &&
            typeof cached.center[1] === "number"
          ) {
            if (!active) return;
            setAlerts(Array.isArray(cached.alerts) ? cached.alerts : []);
            setAnonymousAreas(parseNativeMapAnonymousAreas(cached.anonymousAreas));
            setMapPeopleNextRefreshAt(typeof cached.nextRefreshAt === "string" ? cached.nextRefreshAt : null);
            // First paint is instant (duration 0) so we never glide from the default
            // center to the cached view; any subsequent re-center still animates.
            applyCamera(cached.center, typeof cached.cameraZoom === "number" ? cached.cameraZoom : cameraZoomRef.current, false, 0);
            lastFetchedMapAreaRef.current = { center: cached.center, zoomBucket: Math.floor(typeof cached.cameraZoom === "number" ? cached.cameraZoom : cameraZoomRef.current) };
            cachedCenter = cached.center;
          } else if (raw) {
            await AsyncStorage.removeItem(mapSessionCacheKey);
          }
        } catch {
          await AsyncStorage.removeItem(mapSessionCacheKey).catch(() => undefined);
        }
      }

      try {
        const detail = await getNativeForegroundLocationPermissionDetail();
        if (active) {
          setPermissionDetail(detail);
          setPermissionState(detail.state);
        }
      } catch {
        if (active) setDeviceLocation(null);
      }

      if (effectiveUserId) {
        const [profileSnapshot, scope] = await Promise.all([
          // Boot already warms this exact session-keyed summary. Reuse it for
          // Map's first paint; explicit pin/unpin and foreground paths still
          // invalidate or force canonical identity when the truth can change.
          fetchNativeProfileSummary(effectiveUserId, { accessToken, sessionKey: mapShellSessionKey }).catch(() => null),
          resolveNativeViewerScope({ userId: effectiveUserId, accessToken, sessionKey: mapShellSessionKey }).catch(() => null),
        ]);
        if (!active) return;
        const profile = profileSnapshot?.profile ?? null;
        const nextOwnPin = profile
          ? await deriveNativeMapOwnPinFromProfile(profile as Record<string, unknown>, { accessToken }).catch(() => null)
          : null;
        if (!active) return;
        initialOwnPin = nextOwnPin;
        if (nextOwnPin) {
          setOwnPin(() => {
            const pending = pendingSelfPinPersistRef.current;
            if (!pending) return nextOwnPin;
            const canonicalPrecision = normalizeNativeMapPrecision(nextOwnPin.map_precision);
            if (canonicalPrecision === pending.precision) {
              pendingSelfPinPersistRef.current = null;
              return nextOwnPin;
            }
            return {
              ...nextOwnPin,
              is_invisible: pending.precision === "hidden",
              map_precision: pending.precision,
              map_visible_until: pending.visibleUntil,
            };
          });
        } else if (!pendingSelfPinPersistRef.current) {
          setOwnPin(null);
        }
        storedPinCenter = profilePinCenter(profile);
        retainedOwnCoordinateRef.current = storedPinCenter
          ? { lat: storedPinCenter[1], lng: storedPinCenter[0] }
          : null;
        cityCenter = profileCityCenter(profile);
        initialViewerScope = scope;
        areaDistrictCenter = pointToCenter(scope?.primaryPoint ?? scope?.profilePoint ?? null);
        if (scope && (scope.source === "live_device_gps" || scope.source === "cached_device_gps") && scope.primaryPoint) {
          latestPrivateGpsRef.current = scope.primaryPoint;
          setDeviceLocation(scope.primaryPoint);
          gpsCenter = [scope.primaryPoint.lng, scope.primaryPoint.lat];
          // The owner's marker is a private local representation while they view the
          // map. Keep it aligned with the same GPS fix used by the camera without
          // writing or extending the public pin window.
          setOwnPin((current) => current ? {
            ...current,
            lat: scope.primaryPoint!.lat,
            lng: scope.primaryPoint!.lng,
          } : current);
        }
      }

      // Center priority. On a warm remount we keep a fresh last view (already applied
      // above) and just load data for it. On a cold start (app restart) we ignore the
      // last view and re-center to GPS → stored pin → profile city, so the user lands
      // on themselves.
      if (initialViewerScope) {
        initialMapDataSeedRef.current = {
          ownPin: initialOwnPin,
          sessionKey: mapShellSessionKey,
          viewerScope: initialViewerScope,
        };
      }
      if (alertFocusPendingRef.current) {
        // A pin/alert was opened (e.g. from Social). Load data but do NOT recenter to
        // GPS — the alert-focus effect drives the camera to the exact pin location.
        await loadMapDataRef.current(cachedCenter ? { center: cachedCenter } : undefined);
      } else if (cachedCenter && !isColdStart) {
        await loadMapDataRef.current({ center: cachedCenter });
      } else {
        // Priority: GPS → stored pin → last view → profile area/district → city.
        // Profile area/district is the default so we never land on the hardcoded city.
        const initialCenter = gpsCenter ?? storedPinCenter ?? cachedCenter ?? areaDistrictCenter ?? cityCenter;
        // If there was no cached view, this re-center IS the first paint — make it
        // instant so we never glide across the world from the default center. If a
        // cached view was already painted, animate the "move to you" smoothly.
        // Recenter bypasses only the same-viewport guard. The shell read still reuses
        // boot prewarm/cache instead of forcing a duplicate network request.
        await loadMapDataRef.current(initialCenter ? { center: initialCenter, recenter: true, recenterDuration: cachedCenter ? undefined : 0 } : undefined);
      }
    })()
      .catch(() => {
        if (!active) return;
        setStatusMessage("Failed to refresh map");
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
      if (cameraIdleFetchTimerRef.current) clearTimeout(cameraIdleFetchTimerRef.current);
    };
  }, [accessToken, applyCamera, effectiveUserId, mapSessionCacheKey, mapShellSessionKey]);

  useEffect(() => {
    const params = new URLSearchParams(search.replace(/^\?/, ""));
    if (params.get("mode") === "broadcast") {
      const currentCenter = centerCoordinateRef.current;
      const nextCenter = { lat: currentCenter[1], lng: currentCenter[0] };
      setBroadcastOpen(false);
      setBroadcastPreviewPin(null);
      setBroadcastPreviewAddress(null);
      setBroadcastPinningCenter(nextCenter);
      setBroadcastPinningAddress(null);
      setBroadcastManualQuery("");
      setIsPickingBroadcastLocation(true);
    }
    const alertParam = params.get("alert");
    const threadParam = params.get("thread");
    const shareToken = String(params.get("access") || "").trim() || null;
    const modalOnly = params.get("modal") === "1";
    const focusId = alertParam || threadParam;
    const hasFocus = Boolean(focusId && focusId.trim());
    const alertLatParam = params.get("alertLat");
    const alertLngParam = params.get("alertLng");
    const alertLat = alertLatParam === null ? Number.NaN : Number(alertLatParam);
    const alertLng = alertLngParam === null ? Number.NaN : Number(alertLngParam);
    const warmAlert = alertParam && effectiveUserId
      ? peekNativeMapAlertById(alertParam, effectiveUserId, { sessionKey: mapShellSessionKey, shareToken })
      : null;
    // Map stays mounted between tabs. The query remains in its route state after
    // resolution, so it must be treated as a one-shot navigation intent rather
    // than a durable command that can re-open over a later pin tap or dismissal.
    const alertRouteKey = hasFocus && effectiveUserId ? `${effectiveUserId}|${search}|${alertFocusIntent}` : null;
    const shouldConsumeAlertFocus = Boolean(alertRouteKey && alertFocusRouteKeyRef.current !== alertRouteKey);
    if (!hasFocus) {
      alertFocusRouteKeyRef.current = null;
      alertFocusPendingRef.current = false;
      setAlertFocus(null);
    } else if (!effectiveUserId) {
      // Preserve first-focus camera priority until the authenticated viewer is
      // available to resolve the protected detail RPC.
      alertFocusPendingRef.current = true;
    } else if (shouldConsumeAlertFocus) {
      alertFocusRouteKeyRef.current = alertRouteKey;
      // A second notification may not carry a warm alert shell. Keep the
      // existing detail Modal presented until its replacement is ready: iOS
      // can lose input if a native Modal is dismissed and re-presented during
      // the same notification handoff. NativeAlertDetailModal already fades
      // alert-to-alert content in place, so this preserves the sheet and
      // swaps to the canonical replacement once it resolves.
      alertFocusRequestRef.current += 1;
      selectedAlertDetailRequestIdRef.current += 1;
      setAlertSheetHeight(0);
      alertFocusPendingRef.current = true;
      if (warmAlert) {
        setShowAlerts(true);
        setAlertSheetHeight(0);
        alertOpenedThisVisitRef.current = true;
        setAlerts((current) => current.some((item) => item.id === warmAlert.id) ? current : [warmAlert, ...current]);
        setSelectedAlert(warmAlert);
      } else if (alertParam && Number.isFinite(alertLat) && Number.isFinite(alertLng)) {
        const alertType = String(params.get("alertType") || "Alert").trim() || "Alert";
        const shell: NativeMapAlert = {
          id: alertParam,
          latitude: alertLat,
          longitude: alertLng,
          alert_type: alertType,
          pet_type: null,
          title: null,
          description: null,
          photo_url: null,
          media_urls: [],
          support_count: 0,
          share_count: 0,
          report_count: 0,
          created_at: new Date().toISOString(),
          expires_at: null,
          range_meters: null,
          range_km: null,
          duration_hours: null,
          creator_id: null,
          has_thread: false,
          thread_id: null,
          posted_to_threads: false,
          post_on_social: false,
          social_post_id: null,
          social_status: null,
          social_url: null,
          is_sensitive: false,
          verified_only: params.get("verifiedOnly") === "1",
          share_access_token: shareToken,
          is_demo: false,
          location_street: null,
          location_district: null,
          creator: { avatar_url: null, display_name: null, social_id: null },
          marker_state: "active",
        };
        setShowAlerts(true);
        setAlertSheetHeight(0);
        setSelectedAlert(shell);
      }
      setAlertFocus({ key: focusId!.trim(), source: alertParam ? "alert" : "thread", modalOnly, shareToken });
    }
    const userParam = String(params.get("user") || "").trim();
    setUserFocus(userParam ? { key: userParam, retries: 0 } : null);
  }, [alertFocusIntent, effectiveUserId, mapShellSessionKey, search]);

  const openMapProfileCard = useCallback((target: {
    avatarUrl?: string | null;
    displayName?: string | null;
    isVerified?: boolean;
    socialId?: string | null;
    userId: string;
  }) => {
    const requestId = mapProfileCardRequestRef.current + 1;
    mapProfileCardRequestRef.current = requestId;
    const fallbackData = {
      id: target.userId,
      avatar_url: target.avatarUrl ?? null,
      display_name: target.displayName ?? "huddle member",
      is_verified: target.isVerified === true,
      social_id: target.socialId ?? null,
    };
    setMapProfileCard(buildProfileShareCard({
      id: target.userId,
      displayName: target.displayName || "huddle member",
      socialId: target.socialId ?? null,
      avatarUrl: target.avatarUrl ?? null,
      isVerified: target.isVerified === true,
      roleLabels: [],
      pets: [],
    }));
    void fetchNativePublicProfile({
      accessToken,
      fallbackData,
      force: false,
      profileUserId: target.userId,
      sessionKey,
      viewerId: effectiveUserId,
    }).then((profile) => {
      if (!profile || mapProfileCardRequestRef.current !== requestId) return;
      setMapProfileCard(buildProfileShareCard({
        id: profile.userId,
        displayName: profile.displayName,
        socialId: profile.socialId,
        avatarUrl: profile.photoUrl,
        tier: profile.membershipTier,
        isVerified: profile.isVerified,
        createdAt: profile.createdAt,
        memberNumber: profile.memberNumber,
        engagementTier: profile.engagement?.tier,
        experienceYears: profile.experienceYears,
        petExperience: profile.petExperience,
        roleLabels: profile.availabilityStatus,
        groupCount: profile.engagementStats?.groups,
        friendCount: profile.engagementStats?.friends,
        pets: profile.petHeads.filter((pet) => pet.isPublic).map((pet) => ({
          name: pet.name || "Pet",
          species: pet.species,
          photoUri: pet.photoUrl,
          photoPosition: pet.photoPosition,
        })),
      }));
    }).catch(() => undefined);
  }, [accessToken, effectiveUserId, sessionKey]);

  // Home "Out right now" avatars deep-link here with ?user=<id>: center on that
  // user's pin (at their own precision) and open the lightweight share card. The
  // pin list loads async, so retry briefly before giving up with a status note.
  useEffect(() => {
    const focus = userFocus;
    if (!focus || !effectiveUserId) return undefined;
    const match = friends.find((friend) => friend.id === focus.key);
    if (match) {
      applyCamera([match.last_lng, match.last_lat], 15.5);
      openMapProfileCard({
        userId: match.id,
        avatarUrl: match.avatar_url,
        displayName: match.display_name,
        isVerified: match.is_verified,
      });
      setUserFocus(null);
      return undefined;
    }
    if (focus.retries >= 5) {
      setStatusMessage("They're no longer visible on the map.");
      setUserFocus(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      setUserFocus((current) => current && current.key === focus.key ? { ...current, retries: current.retries + 1 } : current);
    }, 1200);
    return () => clearTimeout(timer);
  }, [applyCamera, effectiveUserId, friends, openMapProfileCard, userFocus]);

  useEffect(() => {
    const focus = alertFocus;
    const focusId = focus?.key ?? null;
    if (!focus || !focusId || !effectiveUserId) return undefined;
    // A notification/deep-link must supersede a detail request started by a
    // previous pin tap before it can replace the selected sheet.
    selectedAlertDetailRequestIdRef.current += 1;
    const match = alerts.find((alert) => alert.id === focusId || alert.thread_id === focusId || alert.social_post_id === focusId);
    if (match) {
      alertFocusPendingRef.current = false;
      setShowAlerts(true);
      setAlertSheetHeight(0);
      alertOpenedThisVisitRef.current = true;
      setSelectedAlert((current) => current?.id === match.id && current.verified_only === true && match.verified_only !== true
        ? { ...match, verified_only: true }
        : match);
      if (match.creator_id === effectiveUserId && !autoReachShownRef.current.has(match.id)) {
        autoReachShownRef.current.add(match.id);
        ownedReachRequestedRef.current = true;
        runReachQuery(match.id);
      }
      setAlertFocus(null);
      const requestId = ++alertFocusRequestRef.current;
      const requestSessionKey = mapShellSessionKey;
      // Opening is synchronous from the shared entity. Server truth reconciles
      // afterward without remounting the sheet or issuing a second camera move.
      void fetchNativeMapAlertById(match.id, effectiveUserId, {
        accessToken,
        sessionKey: requestSessionKey,
        shareToken: focus.shareToken,
        source: "alert",
        force: true,
        cacheWriteGuard: () => sessionKeyRef.current === requestSessionKey,
      }).then((freshAlert) => {
        if (requestId !== alertFocusRequestRef.current || sessionKeyRef.current !== requestSessionKey) return;
        if (!freshAlert) {
          setSelectedAlert((current) => current?.id === match.id ? null : current);
          setStatusMessage("That alert is no longer available.");
          return;
        }
        setAlerts((current) => [freshAlert, ...current.filter((item) => item.id !== freshAlert.id)]);
        setSelectedAlert((current) => current?.id === freshAlert.id ? freshAlert : current);
      }).catch(() => undefined);
      return undefined;
    }

    const requestId = ++alertFocusRequestRef.current;
    const requestSessionKey = mapShellSessionKey;
    // Consume the route before fetching. Previously, map-shell state changes
    // restarted this effect and spawned overlapping detail and full-map reloads.
    setAlertFocus(null);
    void fetchNativeMapAlertById(focusId, effectiveUserId, {
      accessToken,
      sessionKey: requestSessionKey,
      shareToken: focus.shareToken,
      source: focus.source,
      // Social and notification surfaces prewarm this canonical detail. Reuse
      // cache/in-flight work instead of starting a duplicate forced request.
      force: false,
      cacheWriteGuard: () => sessionKeyRef.current === requestSessionKey,
    }).then((alert) => {
      if (requestId !== alertFocusRequestRef.current || sessionKeyRef.current !== requestSessionKey) return;
      alertFocusPendingRef.current = false;
      if (!alert) {
        setStatusMessage("That alert is no longer available.");
        return;
      }
      setAlerts((current) => current.some((item) => item.id === alert.id) ? current : [alert, ...current]);
      setShowAlerts(true);
      setAlertSheetHeight(0);
      alertOpenedThisVisitRef.current = true;
      setSelectedAlert(alert);
      // Deep link opened one of yours: Trigger 1 wins over the rollup, but this
      // is an automatic open, so it fires at most once per visit.
      if (alert.creator_id === effectiveUserId && !autoReachShownRef.current.has(alert.id)) {
        autoReachShownRef.current.add(alert.id);
        ownedReachRequestedRef.current = true;
        runReachQuery(alert.id);
      }
    }).catch(() => {
      if (requestId !== alertFocusRequestRef.current) return;
      alertFocusPendingRef.current = false;
      setStatusMessage("Unable to open this alert. Please try again.");
    });
    return undefined;
  }, [accessToken, alertFocus, alerts, effectiveUserId, mapShellSessionKey, runReachQuery]);

  const refreshReadOnlyData = () => {
    if (!effectiveUserId || dataLoading || refreshing) return;
    setRefreshing(true);
    setStatusMessage(null);
    void loadMapData({ center: centerCoordinateRef.current, force: true })
      .then(() => {
        setStatusMessage("Map refreshed");
      })
      .catch(() => {
        setStatusMessage("Failed to refresh map");
      })
      .finally(() => setRefreshing(false));
  };

  const handleLocationPress = async () => {
    if (locationLoading) return;
    // Recenter means "put my visible map identity in the middle." An Area or
    // Incognito pin is intentionally rendered at its privacy cell, not at raw
    // GPS. Centering raw GPS made the navigation arrow land away from the avatar.
    if (ownPin) {
      const renderedCoordinate = resolveOwnAreaCoordinate(ownPin.lng, ownPin.lat, mapPeopleGeometryVersion, mapViewerArea);
      focusSelectionCamera(
        renderedCoordinate,
        15.5,
        huddleMotion.durations.base,
      );
      return;
    }
    setLocationLoading(true);
    try {
      // Recenter is a passive convenience action. It must never request
      // permission or open the Settings guidance; only Pin my location can
      // enter that explicit public-sharing flow.
      const permission = await getNativeForegroundLocationPermissionDetail();
      if (permission.state !== "granted") {
        if (active) setStatusMessage(t("Turn on Location to recenter the map."));
        return;
      }
      const cachedLocation = await getNativeCurrentCoordinates({ accuracy: "balanced" });
      if (!cachedLocation) {
        if (active) setStatusMessage(t("We couldn't find your location yet. Try again in a moment."));
        return;
      }
      // Recenter immediately from the private foreground cache. A fresh high-accuracy
      // GPS read can take seconds or time out, but the location arrow must never feel
      // like a no-op while that refinement is in flight.
      if (cachedLocation) {
        latestPrivateGpsRef.current = cachedLocation;
        focusSelectionCamera(
          [cachedLocation.lng, cachedLocation.lat],
          15.5,
          huddleMotion.durations.base,
        );
      }
      const coords = await getNativeCurrentCoordinates({ accuracy: "high", force: true });
      setDeviceLocation(coords);
      if (coords) {
        latestPrivateGpsRef.current = coords;
        // The high-accuracy refinement updates private state silently. Reissuing a
        // second camera command here made the location button visibly "correct"
        // itself after it had already responded from the foreground cache.
      }
    } catch {
      if (active) setStatusMessage(t("We couldn't find your location yet. Try again in a moment."));
    } finally {
      setLocationLoading(false);
    }
  };

  const handleZoomChange = (delta: number) => {
    const nextZoom = Math.max(2, Math.min(20, cameraZoomRef.current + delta));
    applyCamera(centerCoordinateRef.current, nextZoom);
  };

  useEffect(() => {
    if (!effectiveUserId) return undefined;
    return subscribeNativeProfileSummary(effectiveUserId, ({ profile }) => {
      const stored = profilePinCenter(profile);
      if (stored) retainedOwnCoordinateRef.current = { lat: stored[1], lng: stored[0] };
      const pending = pendingSelfPinPersistRef.current;
      const effectivePending = pending;
      const profileVisibleUntil = typeof profile?.map_visible_until === "string" ? profile.map_visible_until : null;
      const nextVisibleUntil = effectivePending?.visibleUntil ?? profileVisibleUntil;
      if (!isNativeMapSharingWindowVisible(nextVisibleUntil)) {
        // A cache/realtime update confirming "back" is authoritative. Invalidate
        // every stale map read before it can reapply an older visible pin.
        pendingSelfPinPersistRef.current = null;
        selfPinIntentVersionRef.current += 1;
        initialMapDataSeedRef.current = null;
        const identitySnapshot = mapIdentitySnapshotRef.current;
        if (identitySnapshot?.sessionKey === mapShellSessionKey) identitySnapshot.ownPin = null;
      }
      setOwnPin((current) => {
        const nextPrecision = effectivePending?.precision ?? normalizeNativeMapPrecision(profile?.map_precision ?? current?.map_precision);
        const nextVisibleUntil = effectivePending?.visibleUntil ?? profileVisibleUntil ?? current?.map_visible_until ?? null;
        if (!isNativeMapSharingWindowVisible(nextVisibleUntil)) return null;
        if (!current) {
          const lat = typeof profile?.last_lat === "number" ? profile.last_lat : null;
          const lng = typeof profile?.last_lng === "number" ? profile.last_lng : null;
          if (lat === null || lng === null) return current;
          return {
            lat,
            lng,
            avatar_url: profile?.avatar_url ?? null,
            display_name: profile?.display_name ?? "huddle",
            is_verified: isNativeVerifiedProfile(profile),
            is_invisible: nextPrecision === "hidden",
            map_precision: nextPrecision,
            map_visible_until: nextVisibleUntil,
            marker_state: "active",
          };
        }
        return {
          ...current,
          avatar_url: profile?.avatar_url ?? current.avatar_url,
          display_name: profile?.display_name ?? current.display_name,
          is_verified: isNativeVerifiedProfile(profile) || current.is_verified,
          is_invisible: nextPrecision === "hidden",
          map_precision: nextPrecision,
          map_visible_until: nextVisibleUntil,
        };
      });
    }, { sessionKey });
  }, [effectiveUserId, mapShellSessionKey, sessionKey]);

  const startBroadcastPinning = () => {
    const currentCenter = centerCoordinateRef.current;
    const nextCenter = { lat: currentCenter[1], lng: currentCenter[0] };
    setBroadcastOpen(false);
    setBroadcastPreviewPin(null);
    setBroadcastPreviewAddress(null);
    setBroadcastPinningCenter(nextCenter);
    setBroadcastPinningAddress(null);
    broadcastResolvedAddressRef.current = null;
    setBroadcastPinningDistanceKm(distanceKmBetween(deviceLocation, nextCenter));
    setBroadcastManualQuery("");
    setIsPickingBroadcastLocation(true);
  };

  const cancelBroadcastPinning = () => {
    setIsPickingBroadcastLocation(false);
    setBroadcastPinningCenter(null);
    setBroadcastPinningAddress(null);
    setBroadcastPinningDistanceKm(0);
    setBroadcastManualQuery("");
    setBroadcastPreviewPin(null);
    setBroadcastPreviewAddress(null);
    setBroadcastDropConfirmation(false);
  };

  const confirmBroadcastPinning = () => {
    const currentCenter = centerCoordinateRef.current;
    // The fixed preview represents the live camera centre. Read its ref at the
    // confirmation event so a final camera frame cannot leave React state one
    // frame behind and publish the alert at the previous centre.
    const center = { lat: currentCenter[1], lng: currentCenter[0] };
    const resolvedAddress = broadcastResolvedAddressRef.current;
    const exactAddress = resolvedAddress && distanceKmBetween(center, resolvedAddress) < 0.02
      ? resolvedAddress.address
      : null;
    setBroadcastPreviewPin(center);
    setBroadcastPreviewAddress(exactAddress);
    setIsPickingBroadcastLocation(false);
    setBroadcastPinningCenter(null);
    setBroadcastPinningAddress(null);
    setBroadcastManualQuery("");
    setBroadcastDropPoint({ x: windowSize.width / 2, y: windowSize.height / 2 });
    setBroadcastDropConfirmation(true);
    setTimeout(() => {
      setBroadcastDropConfirmation(false);
      setBroadcastOpen(true);
    }, 900);
  };

  const searchBroadcastManualLocation = useCallback(async () => {
    const query = broadcastManualQuery.trim();
    if (!query || broadcastManualSearching) return;
    setBroadcastManualSearching(true);
    try {
      const currentCenter = centerCoordinateRef.current;
      const result = await lookupNativeMapQueryCenter(query, null, { lat: currentCenter[1], lng: currentCenter[0] });
      if (!result) {
        return;
      }
      const nextCenter = { lat: result.lat, lng: result.lng };
      Keyboard.dismiss();
      setBroadcastManualFocused(false);
      setBroadcastPinningCenter(nextCenter);
      setBroadcastPinningAddress(query);
      broadcastResolvedAddressRef.current = { address: query, lat: nextCenter.lat, lng: nextCenter.lng };
      applyCamera([result.lng, result.lat], Math.max(cameraZoomRef.current, 14));
    } finally {
      setBroadcastManualSearching(false);
    }
  }, [applyCamera, broadcastManualQuery, broadcastManualSearching]);

  const submitBroadcastManualLocation = useCallback(() => {
    if (!broadcastManualQuery.trim()) {
      setBroadcastManualAttempted(true);
      haptic.error();
      return;
    }
    setBroadcastManualAttempted(false);
    void searchBroadcastManualLocation();
  }, [broadcastManualQuery, searchBroadcastManualLocation]);

  const persistSelfPinFromCoords = useCallback(async (
    coords: { lat: number; lng: number },
    freshAccessToken: string,
    options: { statusMessage: string; precision?: NativeMapPrecision; presenceIntent?: NativePresenceIntentToken },
  ) => {
    const precision = options.precision ?? selfPrecision;
    const presenceIntent = options.presenceIntent ?? beginNativePresenceIntent(effectiveUserId!, "active");
    const intentVersion = ++selfPinIntentVersionRef.current;
    latestPrivateGpsRef.current = coords;
    retainedOwnCoordinateRef.current = coords;
    setDeviceLocation(coords);
    const displayCenter = resolveOwnAreaCoordinate(coords.lng, coords.lat, mapPeopleGeometryVersion, mapViewerArea);
    applyCamera(displayCenter, 15.5);

    // Background persistence — address lookup is display-only and must never
    // delay the canonical Out Now mutation or make the pin feel slow.
    void lookupNativeMapAddress(coords.lat, coords.lng);
    // A new Map pin is the same Out Now action as Home: it starts a fresh
    // elapsed session. Subsequent style/hour edits use the ordinary pin update
    // below and never reset that clock.
    const outNowClock = await enqueueNativePresenceMutation(presenceIntent, () => pinNativeUserOutNow(effectiveUserId!, coords.lat, coords.lng, null, {
      accessToken: freshAccessToken,
      precision,
    }));
    if (!outNowClock || !isCurrentNativePresenceIntent(presenceIntent)) return false;
    // Map pin and Home "I'm out" share one server-confirmed presence session.
    // Capture the already-known avatar before this tick's setOwnPin call
    // makes it stale, and start the Live Activity from outNowClock right
    // away -- the profile refetch and avatar resolve below are backfill for
    // the pin's display fields and must never gate the activity from
    // existing. If the app backgrounds a moment after tapping, the activity
    // must already be live.
    const priorAvatarUrl = ownPin?.avatar_url ?? null;
    pendingSelfPinPersistRef.current = { precision, visibleUntil: outNowClock.expiresAt };
    setOwnPin((prev) => ({
      lat: coords.lat,
      lng: coords.lng,
      display_name: prev?.display_name ?? "huddle",
      avatar_url: prev?.avatar_url ?? null,
      is_verified: prev?.is_verified ?? false,
      is_invisible: precision === "hidden",
      map_precision: precision,
      map_visible_until: outNowClock.expiresAt,
      marker_state: "active",
    }));
    void patchNativeProfileSummaryCache(effectiveUserId!, {
      last_lat: coords.lat,
      last_lng: coords.lng,
      map_precision: precision,
      map_visible_until: outNowClock.expiresAt,
    }, { sessionKey, createIfMissing: true });
    setStatusMessage(options.statusMessage);
    const expiresAtMs = Date.parse(outNowClock.expiresAt);
    const progressStartedAt = Number.isFinite(expiresAtMs)
      ? new Date(expiresAtMs - 2 * 60 * 60 * 1000).toISOString()
      : null;
    if (progressStartedAt) {
      void startHomePresenceActivity({
        startedAt: outNowClock.startedAt,
        progressStartedAt,
        expiresAt: outNowClock.expiresAt,
        selfAvatarUrl: priorAvatarUrl,
        companions: [],
        companionsTotalCount: 0,
        friendCount: 0,
        nearbyUserCount: 0,
      });
    }
    const profileSnapshot = await fetchNativeProfileSummary(effectiveUserId!, { force: true, accessToken: freshAccessToken, sessionKey }).catch(() => null);
    const profile = profileSnapshot?.profile ?? null;
    const avatarUrl = await resolveNativeProfilePhotoDisplayUrl(profile?.avatar_url ?? null).catch(() => null);
    const nextPrecision = normalizeNativeMapPrecision(profile?.map_precision ?? precision);
    // Patch the already-running activity once a properly resolved avatar
    // exists, rather than making its initial appearance wait for it.
    if (progressStartedAt && avatarUrl && avatarUrl !== priorAvatarUrl) {
      void updateHomePresenceActivity({
        startedAt: outNowClock.startedAt,
        progressStartedAt,
        expiresAt: outNowClock.expiresAt,
        selfAvatarUrl: avatarUrl,
        companions: [],
        companionsTotalCount: 0,
        friendCount: 0,
        nearbyUserCount: 0,
      });
    }
    // Backfill canonical profile details onto the confirmed pin without moving it.
    if (intentVersion !== selfPinIntentVersionRef.current) return false;
    pendingSelfPinPersistRef.current = null;
    setOwnPin((prev) => (prev ? {
      ...prev,
      lat: coords.lat,
      lng: coords.lng,
      display_name: profile?.display_name ?? prev.display_name,
      avatar_url: avatarUrl ?? prev.avatar_url,
      is_verified: isNativeVerifiedProfile(profile),
      is_invisible: nextPrecision === "hidden",
      map_precision: nextPrecision,
      map_visible_until: outNowClock.expiresAt,
    } : prev));
    void loadMapDataRef.current({ center: centerCoordinateRef.current, force: true }).catch(() => undefined);
    return true;
  }, [applyCamera, effectiveUserId, mapPeopleGeometryVersion, mapViewerArea, ownPin?.avatar_url, selfPrecision, sessionKey]);

  const requestPinFromLiveGps = async () => {
    if (!effectiveUserId || pinning) return;
    const actionEpoch = ++locationActionEpochRef.current;
    const isCurrentAction = () => active && actionEpoch === locationActionEpochRef.current;
    if (__DEV__) {
      console.log("NATIVE_MAP_SELF_PIN_START", {
        hasAccessToken: Boolean(accessToken),
        permissionState,
        userId: effectiveUserId,
      });
    }
    // Begin auth refresh in parallel. Permission must be the first visible
    // action: waiting on a network token before iOS can present its prompt is
    // exactly the delay that made the TestFlight path feel broken.
    const freshAccessTokenPromise = getFreshNativeAccessToken(accessToken, effectiveUserId);
    const presenceIntent = beginNativePresenceIntent(effectiveUserId, "active");
    setPinning(true);
    // A first install has no reusable coordinate. Give the user a single,
    // explicit acquisition state while the native prompt/cold GPS fix runs.
    setStatusMessage("Finding your location...");
    try {
      const location = await requestNativeLocationForPin({
        retainedCoordinates: latestPrivateGpsRef.current ?? retainedOwnCoordinateRef.current,
      });
      if (!isCurrentAction()) return;
      if (location.status === "settings_required") {
        setLocationSettingsReason(location.reason);
        if (__DEV__) console.log("NATIVE_MAP_SELF_PIN_RESULT", { ok: false, reason: `${location.reason}_settings_required` });
        return;
      }
      if (location.status === "unavailable") {
        setStatusMessage("We can't get your location yet. Check your signal and try again.");
        if (__DEV__) console.log("NATIVE_MAP_SELF_PIN_RESULT", { ok: false, reason: "location_unavailable" });
        return;
      }
      setSelfPrecision(NATIVE_MAP_PRECISION_DEFAULT);
      const coords = location.coords;
      const freshAccessToken = await freshAccessTokenPromise;
      if (!freshAccessToken) {
        setStatusMessage("Please sign in again to pin your location.");
        if (__DEV__) console.log("NATIVE_MAP_SELF_PIN_RESULT", { ok: false, reason: "missing_access_token" });
        return;
      }
      if (__DEV__) {
        console.log("NATIVE_MAP_SELF_PIN_START", {
          hasAccessToken: true,
          lat: coords.lat,
          lng: coords.lng,
          userId: effectiveUserId,
        });
      }
      const didPin = await persistSelfPinFromCoords(coords, freshAccessToken, {
        precision: NATIVE_MAP_PRECISION_DEFAULT,
        statusMessage: "Location pinned (GPS)",
        presenceIntent,
      });
      if (!didPin) return;
      if (isCurrentAction()) {
        const displayCenter = resolveOwnAreaCoordinate(coords.lng, coords.lat, mapPeopleGeometryVersion, mapViewerArea);
        openSelfPinMenuRef.current(displayCenter, ownMarkerSizeForZoom(markerRenderZoom));
      }
      if (__DEV__) console.log("NATIVE_MAP_SELF_PIN_RESULT", { ok: true, lat: coords.lat, lng: coords.lng });
    } catch (error) {
      if (__DEV__) console.warn("[native.map] pin_location_failed", error);
      // This flow starts from an unpinned state. Keep local state unpinned when the
      // canonical mutation cannot be confirmed.
      setOwnPin(null);
      void patchNativeProfileSummaryCache(effectiveUserId, {
        map_visible_until: new Date().toISOString(),
      }, { sessionKey, createIfMissing: true });
      if (isCurrentAction()) setStatusMessage(nativeSafeErrorCopy(error, "We couldn't update your map pin. Try again in a moment."));
      if (__DEV__) {
        console.log("NATIVE_MAP_SELF_PIN_RESULT", {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (actionEpoch === locationActionEpochRef.current) setPinning(false);
    }
  };

  // Root owns the app's one distance-driven GPS watcher. Map consumes the
  // canonical scope event without opening a second native subscription.
  useEffect(() => {
    if (!effectiveUserId) return undefined;
    return subscribeNativeViewerScope(effectiveUserId, (scope) => {
      if (scope.source !== "live_device_gps" && scope.source !== "cached_device_gps") return;
      const coords = scope.primaryPoint;
      if (!coords) return;
      latestPrivateGpsRef.current = coords;
      setDeviceLocation(coords);
      setOwnPin((current) => current ? { ...current, lat: coords.lat, lng: coords.lng } : current);
      setNativeMapWarmCenter([coords.lng, coords.lat]);
      if (mapIdentitySnapshotRef.current?.sessionKey === mapShellSessionKey) {
        mapIdentitySnapshotRef.current.viewerScope = scope;
      }
      if (active) void loadMapDataRef.current({ center: centerCoordinateRef.current, force: true, refreshIdentity: true });
    }, { sessionKey: mapShellSessionKey });
  }, [active, effectiveUserId, mapShellSessionKey]);

  const optimisticallyStopMapSharing = useCallback(() => {
    const previousOwnPin = ownPin;
    const previousViewerArea = mapViewerArea;
    const previousVisibleUntil = previousOwnPin?.map_visible_until ?? null;
    const stoppedAt = new Date().toISOString();
    const intentVersion = ++selfPinIntentVersionRef.current;

    // Stop is terminal. Clear every in-memory source before the network settles
    // so a cached coordinate can never recreate a public pin after this tap.
    pendingSelfPinPersistRef.current = null;
    initialMapDataSeedRef.current = null;
    setSelfPinMenuAnchor(null);
    setMapViewerArea(null);
    const identitySnapshot = mapIdentitySnapshotRef.current;
    if (identitySnapshot?.sessionKey === mapShellSessionKey) identitySnapshot.ownPin = null;
    setOwnPin(null);
    if (effectiveUserId) {
      void patchNativeProfileSummaryCache(effectiveUserId, {
        map_visible_until: stoppedAt,
      }, { sessionKey, createIfMissing: true });
    }

    return { intentVersion, previousOwnPin, previousViewerArea, previousVisibleUntil };
  }, [effectiveUserId, mapShellSessionKey, mapViewerArea, ownPin, sessionKey]);

  const restoreMapSharingAfterStopFailure = useCallback((previous: {
    intentVersion: number;
    previousOwnPin: NativeMapOwnPin | null;
    previousViewerArea: NativeMapAreaCell | null;
    previousVisibleUntil: string | null;
  }) => {
    if (previous.intentVersion !== selfPinIntentVersionRef.current) return;
    setOwnPin(previous.previousOwnPin);
    setMapViewerArea(previous.previousViewerArea);
    const identitySnapshot = mapIdentitySnapshotRef.current;
    if (identitySnapshot?.sessionKey === mapShellSessionKey) identitySnapshot.ownPin = previous.previousOwnPin;
    if (effectiveUserId) {
      void patchNativeProfileSummaryCache(effectiveUserId, {
        map_precision: previous.previousOwnPin?.map_precision,
        map_visible_until: previous.previousVisibleUntil,
      }, { sessionKey, createIfMissing: true });
    }
  }, [effectiveUserId, mapShellSessionKey, sessionKey]);

  const stopMapSharing = useCallback(async () => {
    if (!effectiveUserId || pinning || !ownPin) return;
    setPinning(true);
    setStatusMessage(null);
    const previous = optimisticallyStopMapSharing();
    const presenceIntent = beginNativePresenceIntent(effectiveUserId, "inactive");
    try {
      const write = selfPinPersistChainRef.current
        .catch(() => undefined)
        .then(() => enqueueNativePresenceMutation(presenceIntent, () => stopNativeMapSharing({ accessToken })));
      selfPinPersistChainRef.current = write.then(() => undefined);
      await write;
      if (!isCurrentNativePresenceIntent(presenceIntent)) return;
      setStatusMessage("Sharing stopped");
      await endHomePresenceActivity();
    } catch {
      restoreMapSharingAfterStopFailure(previous);
      setStatusMessage("Failed to stop sharing");
    } finally {
      setPinning(false);
    }
  }, [accessToken, effectiveUserId, optimisticallyStopMapSharing, ownPin, pinning, restoreMapSharingAfterStopFailure]);

  const confirmUnpinLocation = async () => {
    if (!effectiveUserId || pinning) return;
    setShowUnpinConfirm(false);
    setPinning(true);
    setStatusMessage(null);
    const previous = optimisticallyStopMapSharing();
    const presenceIntent = beginNativePresenceIntent(effectiveUserId, "inactive");
    try {
      // A queued precision update must finish before this terminal mutation,
      // otherwise it can win the race and re-enable sharing after Unpin.
      const write = selfPinPersistChainRef.current
        .catch(() => undefined)
        .then(async () => enqueueNativePresenceMutation(presenceIntent, async () => {
          await clearNativeUserLocationPin(effectiveUserId, { accessToken });
          // Compatibility guard for clients connected before the server-side
          // clear-pin contract is migrated: unpin must also end Out Now.
          await stopNativeMapSharing({ accessToken });
        }));
      selfPinPersistChainRef.current = write.then(() => undefined);
      await write;
      if (!isCurrentNativePresenceIntent(presenceIntent)) return;
      setStatusMessage("Unpinned");
      await endHomePresenceActivity();
    } catch {
      restoreMapSharingAfterStopFailure(previous);
      setStatusMessage("Failed to unpin location");
    } finally {
      setPinning(false);
    }
  };

  const handlePinToggle = () => {
    if (!effectiveUserId) {
      onNavigate?.("/signup");
      return;
    }
    if (ownPin) {
      setShowUnpinConfirm(true);
      return;
    }
    void requestPinFromLiveGps();
  };

  const persistSelfPin = useCallback((precision: NativeMapPrecision, hours: number, options?: { rotateIncognitoAvatar?: boolean }) => {
    if (!effectiveUserId || !ownPin) return;
    const normalizedHours = clampCustomHours(hours);
    const previous = ownPin;
    const intentVersion = ++selfPinIntentVersionRef.current;
    const presenceIntent = beginNativePresenceIntent(effectiveUserId, "active");
    const visibleUntil = new Date(Date.now() + normalizedHours * 3600_000).toISOString();
    pendingSelfPinPersistRef.current = { precision, visibleUntil };
    setSelfPrecision(precision);
    if (options?.rotateIncognitoAvatar) setSelfIncognitoAvatarVersion((current) => current + 1);
    setSelfHours(normalizedHours);
    setOwnPin({
      ...ownPin,
      is_invisible: precision === "hidden",
      map_precision: precision,
      map_visible_until: visibleUntil,
    });
    void patchNativeProfileSummaryCache(effectiveUserId, {
      map_precision: precision,
      map_visible_until: visibleUntil,
    }, { sessionKey, createIfMissing: true });
    const displayCenter = resolveOwnAreaCoordinate(ownPin.lng, ownPin.lat, mapPeopleGeometryVersion, mapViewerArea);
    applyCamera(displayCenter, Math.max(cameraZoomRef.current, 15.5));

    const write = selfPinPersistChainRef.current
      .catch(() => undefined)
      .then(() => enqueueNativePresenceMutation(presenceIntent, () => pinNativeUserLocation(effectiveUserId, ownPin.lat, ownPin.lng, null, {
        accessToken,
        hours: normalizedHours,
        precision,
      }).then(() => undefined)));
    selfPinPersistChainRef.current = write;
    void write.catch((error) => {
      if (intentVersion !== selfPinIntentVersionRef.current) return;
      pendingSelfPinPersistRef.current = null;
      setOwnPin(previous);
      setSelfPrecision(previous.map_precision);
      void patchNativeProfileSummaryCache(effectiveUserId, {
        map_precision: previous.map_precision,
        map_visible_until: previous.map_visible_until,
      }, { sessionKey, createIfMissing: true });
      setStatusMessage(nativeSafeErrorCopy(error, "Could not update map privacy."));
    });
  }, [accessToken, applyCamera, effectiveUserId, mapPeopleGeometryVersion, mapViewerArea, ownPin, sessionKey]);

  const toggleSelfIncognito = useCallback(() => {
    const precision: NativeMapPrecision = selfPrecision === "hidden" ? "area" : "hidden";
    void persistSelfPin(precision, selfHours, { rotateIncognitoAvatar: precision === "hidden" });
  }, [persistSelfPin, selfHours, selfPrecision]);

  const openFriendProfile = useCallback((member: NativeMapFriendPin) => {
    clearPrimaryMapSelection();
    setSelectedAlert(null);
    if (member.is_invisible) {
      setStatusMessage("This person is sharing privately.");
      return;
    }
    openMapProfileCard({
      userId: member.id,
      avatarUrl: member.avatar_url,
      displayName: member.display_name,
      isVerified: member.is_verified,
    });
  }, [clearPrimaryMapSelection, openMapProfileCard]);

  const focusFriendProfile = useCallback((member: NativeMapFriendPin) => {
    clearPrimaryMapSelection();
    setSelectedAlert(null);
    focusSelectionCamera(
      [member.last_lng, member.last_lat],
      Math.max(cameraZoomRef.current, FRIEND_AVATAR_OVERVIEW_ZOOM),
      huddleMotion.durations.base,
      undefined,
      () => openFriendProfile(member),
    );
  }, [clearPrimaryMapSelection, focusSelectionCamera, openFriendProfile]);

  const beginMapMarkerPress = useCallback(() => {
    mapMarkerPressGuardUntilRef.current = Date.now() + 700;
  }, []);

  const openSelfPinMenu = useCallback(async (coordinate: [number, number], targetSize: number) => {
    beginMapMarkerPress();
    setSelectedPetPoi(null);
    setSelectedAlert(null);
    setAreaMenu(null);
    try {
      const mapView = mapViewRef.current as (Mapbox.MapView & { getPointInView?: (value: [number, number]) => Promise<[number, number]> }) | null;
      const point = await mapView?.getPointInView?.(coordinate);
      if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      setSelfPinMenuAnchor(resolveAnchoredSelfPinMenuPosition(
        { x: point[0], y: point[1] },
        targetSize / 2,
        windowSize,
        insets,
      ));
    } catch {
      setSelfPinMenuAnchor(null);
    }
  }, [beginMapMarkerPress, insets, windowSize]);
  openSelfPinMenuRef.current = (coordinate, targetSize) => { void openSelfPinMenu(coordinate, targetSize); };

  const openAreaMenu = useCallback(async (cluster: { members: NativeMapFriendPin[]; center: [number, number]; hasOwner: boolean }) => {
    setSelectedPetPoi(null);
    setAreaMenu(null);
    // The avatar row is rendered at the cluster centre, so anchor to that visual
    // target rather than the owner's private/raw coordinate.
    const anchorCoord = cluster.center;
    const fallback = { left: windowSize.width / 2, top: windowSize.height / 2 };
    const rowCount = cluster.members.filter((member) => member.id !== (effectiveUserId || "self")).length;
    const fanRowCount = Math.max(1, Math.ceil(rowCount / 4));
    const anchorHalfHeight = cluster.hasOwner
      ? AREA_OWNER_CHIP_SIZE / 2
      : (fanRowCount * huddleMap.size.userPinOverview + (fanRowCount - 1)) / 2;
    const menuHeight = Math.min(rowCount, AREA_MENU_MAX_VISIBLE_ROWS) * AREA_MENU_ROW_HEIGHT + huddleSpacing.x2;
    const topControlSafeY = insets.top + huddleLayout.headerHeight + huddleLayout.minTouch + huddleSpacing.x5;
    const bottomControlSafeY = windowSize.height - (
      bottomNavVisible
        ? huddleLayout.navHeight + insets.bottom + huddleSpacing.x6
        : insets.bottom + huddleSpacing.x4
    );
    const zoomRailSafeX = windowSize.width - huddleLayout.minTouch - huddleSpacing.x6;
    const clampAreaMenu = (candidate: { left: number; top: number }) => ({
      left: Math.max(huddleSpacing.x3, Math.min(zoomRailSafeX - AREA_MENU_WIDTH, candidate.left)),
      top: Math.max(topControlSafeY, Math.min(bottomControlSafeY - menuHeight, candidate.top)),
    });
    let anchor = clampAreaMenu(fallback);
    try {
      const mapView = mapViewRef.current as (Mapbox.MapView & { getPointInView?: (coordinate: [number, number]) => Promise<[number, number]> }) | null;
      const point = await mapView?.getPointInView?.(anchorCoord);
      if (Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number") {
        anchor = clampAreaMenu({
          left: point[0] - AREA_MENU_POINTER_CENTER_X,
          top: point[1] + anchorHalfHeight + huddleSpacing.x2,
        });
      }
    } catch {
      // keep fallback anchor
    }
    setAreaMenu({ members: cluster.members, anchor, center: cluster.center, hasOwner: cluster.hasOwner });
  }, [bottomNavVisible, effectiveUserId, insets, windowSize]);

  const focusFriendFanAndOpenMenu = useCallback(async (item: Extract<FriendRenderItem, { type: "group" }>) => {
    beginMapMarkerPress();
    clearPrimaryMapSelection();
    const requestId = ++friendGroupFocusRequestRef.current;
    setSelectedAlert(null);
    setExpandedFriendIds(new Set([item.id]));
    focusSelectionCamera(
      item.coordinate,
      Math.max(cameraZoomRef.current, FRIEND_AVATAR_OVERVIEW_ZOOM),
      220,
      undefined,
      async () => {
        if (friendGroupFocusRequestRef.current !== requestId) return;
        await openAreaMenu({ members: item.friends, center: item.coordinate, hasOwner: false });
      },
    );
  }, [beginMapMarkerPress, clearPrimaryMapSelection, focusSelectionCamera, openAreaMenu]);

  const bottomClearance = bottomNavVisible
    ? huddleLayout.navHeight + Math.max(huddleSpacing.x2, insets.bottom + huddleSpacing.x2) + huddleSpacing.x6
    : huddleSpacing.x5 + insets.bottom;
  const zoomBottomClearance = bottomNavVisible
    ? bottomClearance
    : huddleSpacing.x5 + insets.bottom;
  // Marker composition is intentionally frozen for the duration of a camera
  // gesture. Mapbox moves the stable native views; React resolves the next LOD
  // once, after onMapIdle.
  const markerRenderZoom = mapVisualTierReferenceZoom(mapVisualZoomTier);
  const peopleMarkerSize = peopleMarkerSizeForZoom(markerRenderZoom);
  // Area and Incognito pins render as a rim chip-row, grouped by privacy cell.
  const visibleAlerts = useMemo(() => (showAlerts ? alerts.filter((alert) => !hiddenAlertIds.has(alert.id)) : []), [alerts, hiddenAlertIds, showAlerts]);
  const activeRippleCandidateCount = useMemo(() => visibleAlerts.filter((alert) => (
    alert.marker_state !== "expired_dot" && isRippleEligibleAlertType(alert.alert_type)
  )).length, [visibleAlerts]);
  const activeOwnBroadcastRangeCount = useMemo(() => visibleAlerts.filter((alert) => (
    alert.creator_id === effectiveUserId &&
    alert.marker_state === "active" &&
    clampBroadcastRangeMeters(alert.range_meters ?? (alert.range_km ? Number(alert.range_km) * 1000 : null)) !== null
  )).length, [effectiveUserId, visibleAlerts]);
  const broadcastRangeFeatures = useMemo(() => (
    buildBroadcastRangeFeatureCollections(visibleAlerts, effectiveUserId, reduceMotionEnabled ? 0 : broadcastRangePulse)
  ), [broadcastRangePulse, effectiveUserId, reduceMotionEnabled, visibleAlerts]);
  // Owner's own cell center mirrors how others see their Area or Incognito pin.
  const ownApproxCell = useMemo<[number, number] | null>(() => {
    if (!ownPin) return null;
    return resolveOwnAreaCoordinate(ownPin.lng, ownPin.lat, mapPeopleGeometryVersion, mapViewerArea);
  }, [mapPeopleGeometryVersion, mapViewerArea, ownPin]);
  const selfVisibleUntil = useMemo(() => {
    const current = typeof ownPin?.map_visible_until === "string" ? new Date(ownPin.map_visible_until) : null;
    return current && Number.isFinite(current.getTime())
      ? current
      : new Date(Date.now() + clampCustomHours(selfHours) * 3600_000);
  }, [ownPin?.map_visible_until, selfHours]);
  const ownAreaMembers = useMemo<NativeMapFriendPin[] | null>(() => {
    if (!ownPin || !ownApproxCell) return null;
    return [{
      id: effectiveUserId || "self",
      display_name: ownPin.display_name,
      avatar_url: ownPin.avatar_url,
      is_verified: ownPin.is_verified,
      is_invisible: selfPrecision === "hidden",
      is_approximate: true,
      area_key: mapViewerArea?.areaKey ?? null,
      gender_genre: null,
      last_lat: ownApproxCell[1],
      last_lng: ownApproxCell[0],
      location_pinned_until: ownPin.map_visible_until ?? null,
      marker_state: "active",
    }];
  }, [ownPin, ownApproxCell, effectiveUserId, mapViewerArea?.areaKey, selfPrecision]);
  // One server privacy cell is the only people-group membership rule. Marker
  // collision remains a visual offset concern and cannot change the count.
  const areaClusters = useMemo(() => {
    const presences: Array<{ areaKey: string; lng: number; lat: number; member: NativeMapFriendPin; isOwner: boolean }> = [];
    if (showFriends) {
      friends.forEach((friend) => {
        if (!friend.is_approximate || !Number.isFinite(friend.last_lng) || !Number.isFinite(friend.last_lat)) return;
        const areaKey = nativeMapPeopleAreaKey({ id: friend.id, areaKey: friend.area_key, lat: friend.last_lat, lng: friend.last_lng });
        if (!areaKey) return;
        presences.push({ areaKey, lng: friend.last_lng, lat: friend.last_lat, member: friend, isOwner: false });
      });
    }
    if (ownApproxCell && ownAreaMembers) {
      const member = ownAreaMembers[0];
      const areaKey = nativeMapPeopleAreaKey({ id: member.id, areaKey: member.area_key, lat: ownApproxCell[1], lng: ownApproxCell[0] });
      if (areaKey) presences.push({ areaKey, lng: ownApproxCell[0], lat: ownApproxCell[1], member, isOwner: true });
    }
    const clusters = new Map<string, { center: [number, number]; members: NativeMapFriendPin[]; hasOwner: boolean }>();
    presences.forEach((presence) => {
      const target = clusters.get(presence.areaKey);
      if (target) {
        target.members.push(presence.member);
        target.hasOwner = target.hasOwner || presence.isOwner;
      } else {
        clusters.set(presence.areaKey, {
          center: [presence.lng, presence.lat],
          members: [presence.member],
          hasOwner: presence.isOwner,
        });
      }
    });
    return [...clusters.entries()].map(([key, cluster]) => {
      return {
        key,
        center: cluster.center,
        radius: AREA_BLOB_RADIUS_M,
        members: cluster.members,
        hasOwner: cluster.hasOwner,
      };
    });
  }, [effectiveUserId, friends, showFriends, ownApproxCell, ownAreaMembers]);
  const ownerAreaFriendIds = useMemo(() => new Set(
    areaClusters
      .filter((cluster) => cluster.hasOwner)
      .flatMap((cluster) => cluster.members
        .filter((member) => member.id !== (effectiveUserId || "self"))
        .map((member) => member.id)),
  ), [areaClusters, effectiveUserId]);
  const unifiedVisibleFriends = useMemo(() => {
    if (!showFriends) return [];
    const approximateAtPrivacyCenter = areaClusters.flatMap((cluster) => cluster.members
      .filter((member) => member.id !== (effectiveUserId || "self") && !ownerAreaFriendIds.has(member.id))
      .map((member) => ({
        ...member,
        last_lng: cluster.center[0],
        last_lat: cluster.center[1],
      })));
    return approximateAtPrivacyCenter;
  }, [areaClusters, effectiveUserId, ownerAreaFriendIds, showFriends]);
  const friendRenderItems = useMemo(
    () => buildFriendRenderItems(unifiedVisibleFriends, expandedFriendIds),
    [expandedFriendIds, unifiedVisibleFriends],
  );
  const anonymousDisplayAreas = useMemo(() => anonymousAreas.map((area) => ({
    ...area,
    asset: pickNativeGroupedPinAsset(`anonymous:${area.clusterKey}`),
    coordinate: [area.lng, area.lat] as [number, number],
  })), [anonymousAreas]);
  type AreaClusterShape = (typeof areaClusters)[number];
  const handleAreaOthersAction = useCallback((cluster: AreaClusterShape) => {
    const others = cluster.members.filter((member) => member.id !== (effectiveUserId || "self"));
    if (others.length === 0) return;
    clearPrimaryMapSelection();
    setSelectedAlert(null);
    focusSelectionCamera(
      cluster.center,
      Math.max(cameraZoomRef.current, FRIEND_AVATAR_OVERVIEW_ZOOM),
      huddleMotion.durations.base,
      undefined,
      () => {
        if (others.length === 1) openFriendProfile(others[0]);
        else void openAreaMenu(cluster);
      },
    );
  }, [clearPrimaryMapSelection, effectiveUserId, focusSelectionCamera, openAreaMenu, openFriendProfile]);
  const sortedAreaMenuMembers = useMemo(() => {
    if (!areaMenu) return [];
    return areaMenu.members
      .filter((member) => member.id !== (effectiveUserId || "self"))
      .sort((left, right) => {
        const relationshipRank = Number(friendPeerIds.has(right.id)) - Number(friendPeerIds.has(left.id));
        if (relationshipRank !== 0) return relationshipRank;
        return (left.display_name || "").localeCompare(right.display_name || "");
      });
  }, [areaMenu, effectiveUserId, friendPeerIds]);
  const areaMenuRowCount = sortedAreaMenuMembers.length + (areaMenu?.hasOwner ? 1 : 0);
  const areaMenuCanScroll = areaMenuRowCount > AREA_MENU_MAX_VISIBLE_ROWS;
  const areaMenuVisibleHeight = Math.min(areaMenuRowCount, AREA_MENU_MAX_VISIBLE_ROWS) * AREA_MENU_ROW_HEIGHT;
  const areaMenuContentHeight = areaMenuRowCount * AREA_MENU_ROW_HEIGHT;
  const areaMenuScrollRange = Math.max(1, areaMenuContentHeight - areaMenuVisibleHeight);
  const areaMenuScrollThumbHeight = areaMenuCanScroll
    ? Math.max(28, Math.round(areaMenuVisibleHeight * (areaMenuVisibleHeight / areaMenuContentHeight)))
    : 0;
  const areaMenuScrollThumbTravel = Math.max(0, areaMenuVisibleHeight - areaMenuScrollThumbHeight);
  const areaMenuScrollThumbTranslateY = areaMenuScrollY.interpolate({
    inputRange: [0, areaMenuScrollRange],
    outputRange: [0, areaMenuScrollThumbTravel],
    extrapolate: "clamp",
  });

  useEffect(() => {
    areaMenuScrollY.setValue(0);
  }, [areaMenu, areaMenuScrollY]);
  // Recalculate only from the settled camera scale. Pins remain stable while the
  // user pans or pinches, then resolve once after Mapbox reports idle.
  const alertLayout = useMemo(() => buildNativeMapAlertAggregation(
    visibleAlerts.map((alert) => ({
      ...alert,
      alertType: alert.alert_type,
      createdAt: alert.created_at,
    })),
    settledAlertLayoutZoom,
  ), [settledAlertLayoutZoom, visibleAlerts]);
  const alertCells = useMemo(() => alertLayout
    .filter((group) => group.members.length > 1 && !group.members.some((alert) => expandedAlertIds.has(alert.id)))
    .map((group) => {
      const counts: AlertSeverityCounts = { lost: 0, stray: 0, caution: 0, others: 0 };
      group.members.forEach((alert) => { counts[alertSeverityOf(alert.alert_type)] += 1; });
      return {
        key: group.id,
        center: group.center,
        counts,
        total: group.members.length,
        alerts: group.members,
        primary: group.primary,
      };
    }), [alertLayout, expandedAlertIds]);
  const individualVisibleAlerts = useMemo(() => alertLayout.flatMap((group) => (
    group.members.length === 1 || group.members.some((alert) => expandedAlertIds.has(alert.id))
      ? group.members
      : []
  )), [alertLayout, expandedAlertIds]);
  const pinCollisionOffsets = useMemo(() => {
    const pins: Array<{ id: string; latitude: number; longitude: number }> = [];
    friendRenderItems.forEach((item) => {
      if (item.type === "group") pins.push({ id: `friend-group:${item.id}`, latitude: item.coordinate[1], longitude: item.coordinate[0] });
      else pins.push({ id: `friend:${item.friend.id}`, latitude: item.friend.last_lat, longitude: item.friend.last_lng });
    });
    anonymousDisplayAreas.forEach((area) => {
      pins.push({ id: `anonymous:${area.clusterKey}`, latitude: area.coordinate[1], longitude: area.coordinate[0] });
    });
    individualVisibleAlerts.forEach((alert) => pins.push({ id: `alert:${alert.id}`, latitude: alert.latitude, longitude: alert.longitude }));
    return buildNativeMapPinCollisionOffsets(pins);
  }, [anonymousDisplayAreas, friendRenderItems, individualVisibleAlerts]);
  const crossTypeMarkerLayout = useMemo(() => {
    const people = friendRenderItems.map((item) => item.type === "group"
      ? {
          id: `friend-group:${item.id}`,
          coordinate: item.coordinate,
          size: item.expanded || markerRenderZoom >= FRIEND_AVATAR_OVERVIEW_ZOOM
            ? friendFanFootprint(item.count)
            : huddleMap.size.userPinCompressed,
        }
      : { id: `friend:${item.friend.id}`, coordinate: [item.friend.last_lng, item.friend.last_lat] as [number, number], size: peopleMarkerSizeForZoom(markerRenderZoom) })
      .concat(anonymousDisplayAreas.map((area) => ({
        id: `anonymous:${area.clusterKey}`,
        coordinate: area.coordinate,
        size: huddleMap.size.userPinCompressed,
      })))
      .sort((left, right) => left.id.localeCompare(right.id));
    const alertMarkers = [
      ...alertCells.map((cluster) => ({ id: `alert-aggregate:${cluster.key}`, coordinate: cluster.center })),
      ...individualVisibleAlerts.map((alert) => ({ id: `alert:${alert.id}`, coordinate: [alert.longitude, alert.latitude] as [number, number] })),
    ].sort((left, right) => left.id.localeCompare(right.id));
    const offsets = new Map<string, { x: number; y: number }>();
    const paired = new Set<string>();
    const visualSize = markerRenderZoom >= FRIEND_AVATAR_DETAIL_ZOOM
      ? huddleMap.size.userPinCompressed
      : peopleMarkerSizeForZoom(markerRenderZoom);
    const baseAlertSize = markerRenderZoom >= FRIEND_AVATAR_DETAIL_ZOOM ? huddleMap.size.alertActive : visualSize;
    const ownerCluster = areaClusters.find((cluster) => cluster.hasOwner);
    const ownCoordinate = ownPin
      ? ownApproxCell
        ? ownerCluster?.center ?? ownApproxCell
        : [ownPin.lng, ownPin.lat] as [number, number]
      : null;
    const ownSize = ownMarkerSizeForZoom(markerRenderZoom);

    if (ownCoordinate) {
      const ownPoint = lngLatToWorldPoint(ownCoordinate[0], ownCoordinate[1], settledFriendLayoutZoom);
      const alertMatch = alertMarkers.find((alert) => {
        const alertPoint = lngLatToWorldPoint(alert.coordinate[0], alert.coordinate[1], settledFriendLayoutZoom);
        return Math.hypot(ownPoint.x - alertPoint.x, ownPoint.y - alertPoint.y) <= (ownSize + baseAlertSize) / 2 + 4;
      });
      if (alertMatch) {
        const alertPoint = lngLatToWorldPoint(alertMatch.coordinate[0], alertMatch.coordinate[1], settledFriendLayoutZoom);
        const deltaX = ownPoint.x - alertPoint.x;
        const deltaY = ownPoint.y - alertPoint.y;
        const distance = Math.hypot(deltaX, deltaY);
        const target = (ownSize + baseAlertSize) / 2 + 3;
        const extra = Math.max(0, target - distance);
        offsets.set("own:self", {
          x: Math.round((distance > 0.5 ? deltaX / distance : 1) * extra),
          y: Math.round((distance > 0.5 ? deltaY / distance : 0) * extra),
        });
        offsets.set(alertMatch.id, { x: 0, y: 0 });
        paired.add(alertMatch.id);
      }
    }

    people.forEach((person) => {
      if (paired.has(person.id)) return;
      const personPoint = lngLatToWorldPoint(person.coordinate[0], person.coordinate[1], settledFriendLayoutZoom);
      const match = alertMarkers.find((alert) => {
        if (paired.has(alert.id)) return false;
        const alertPoint = lngLatToWorldPoint(alert.coordinate[0], alert.coordinate[1], settledFriendLayoutZoom);
        return Math.hypot(personPoint.x - alertPoint.x, personPoint.y - alertPoint.y) <= (baseAlertSize + person.size) / 2 + 4;
      });
      if (!match) return;
      const alertPoint = lngLatToWorldPoint(match.coordinate[0], match.coordinate[1], settledFriendLayoutZoom);
      const deltaX = personPoint.x - alertPoint.x;
      const deltaY = personPoint.y - alertPoint.y;
      const distance = Math.hypot(deltaX, deltaY);
      const unitX = distance > 0.5 ? deltaX / distance : 1;
      const unitY = distance > 0.5 ? deltaY / distance : 0;
      const extraSeparation = Math.max(0, (visualSize + person.size) / 2 + 3 - distance);
      paired.add(person.id);
      paired.add(match.id);
      offsets.set(person.id, {
        x: Math.round(unitX * extraSeparation),
        y: Math.round(unitY * extraSeparation),
      });
      // Alerts stay on their true coordinate so their field remains attached.
      offsets.set(match.id, { x: 0, y: 0 });
    });

    if (ownCoordinate) {
      const ownPoint = lngLatToWorldPoint(ownCoordinate[0], ownCoordinate[1], settledFriendLayoutZoom);
      people.forEach((person) => {
        const personPoint = lngLatToWorldPoint(person.coordinate[0], person.coordinate[1], settledFriendLayoutZoom);
        const deltaX = personPoint.x - ownPoint.x;
        const deltaY = personPoint.y - ownPoint.y;
        const distance = Math.hypot(deltaX, deltaY);
        const target = (ownSize + person.size) / 2 + 3;
        if (distance > target) return;
        const extra = target - distance;
        const current = offsets.get(person.id) ?? { x: 0, y: 0 };
        offsets.set(person.id, {
          x: current.x + Math.round((distance > 0.5 ? deltaX / distance : 1) * extra),
          y: current.y + Math.round((distance > 0.5 ? deltaY / distance : 0) * extra),
        });
      });
    }

    return { offsets, paired, visualSize };
  }, [alertCells, anonymousDisplayAreas, areaClusters, friendRenderItems, individualVisibleAlerts, markerRenderZoom, ownApproxCell, ownPin, settledFriendLayoutZoom]);
  const visibleAreaGradientBlobs = useMemo(() => [
    // Alert fields paint first. Person fields remain visually independent and
    // must never inherit a warm alert tint when the two overlap.
    ...alertCells.map((cluster) => {
      const dominant = ALERT_SEVERITY_ORDER.find((severity) => cluster.counts[severity] > 0) ?? "others";
      return {
        key: `alert:${cluster.key}`,
        clusterKey: cluster.key,
        kind: "alert" as const,
        hasOwner: false,
        center: cluster.center,
        color: alertSeverityColor[dominant],
        radius: ALERT_BLOB_RADIUS_M,
        strength: 1.15,
      };
    }),
    ...individualVisibleAlerts.map((alert) => ({
      key: `alert-single:${alert.id}`,
      clusterKey: alert.id,
      kind: "alert" as const,
      hasOwner: false,
      center: [alert.longitude, alert.latitude] as [number, number],
      color: alertSeverityColor[alertSeverityOf(alert.alert_type)],
      radius: ALERT_BLOB_RADIUS_M,
      strength: 1.15,
    })),
    ...areaClusters
      .filter((cluster) => cluster.hasOwner || currentZoom > COMPRESSED_MODE_ENTER_ZOOM)
      .map((cluster) => ({
        key: `person:${cluster.key}`,
        clusterKey: cluster.key,
        kind: "person" as const,
        hasOwner: cluster.hasOwner,
        center: cluster.center,
        color: cluster.hasOwner ? huddleMap.marker.ownPin : "#BFD8FF",
        radius: cluster.radius,
        strength: cluster.hasOwner ? 1.65 : 1.4,
      })),
    ...anonymousAreas.map((area) => ({
      key: `anonymous:${area.clusterKey}`,
      clusterKey: area.clusterKey,
      kind: "person" as const,
      hasOwner: false,
      center: [area.lng, area.lat] as [number, number],
      color: "#BFD8FF",
      radius: AREA_BLOB_RADIUS_M,
      strength: 1.4,
    })),
  ], [alertCells, anonymousAreas, areaClusters, currentZoom, individualVisibleAlerts]);
  const areaGradientFeatures = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: "FeatureCollection",
    features: visibleAreaGradientBlobs.map((blob) => ({
      type: "Feature" as const,
      id: blob.key,
      properties: {
        blobKey: blob.key,
        blur: blob.hasOwner ? 0.42 : blob.kind === "alert" ? 0.74 : 0.58,
        color: blob.color,
        opacity: blob.hasOwner ? 0.42 : Math.min(0.32, 0.2 * blob.strength),
        // Use the computed privacy radius. A single area pin is 500m; merged
        // presences expand only enough to keep every member inside the field.
        // Store the zoom-0 radius and let Mapbox's native style engine scale it
        // continuously during a pinch. React never needs to chase camera frames.
        pixelRadiusAtZoom0: blob.radius * mapPixelsPerMeter(blob.center[1], 0),
      },
      geometry: {
        type: "Point" as const,
        coordinates: blob.center,
      },
    })),
  }), [visibleAreaGradientBlobs]);
  const openMapAlert = useCallback((alert: NativeMapAlert) => {
    // A direct pin tap always wins over a prior notification intent.
    alertFocusRequestRef.current += 1;
    alertFocusPendingRef.current = false;
    setAlertFocus(null);
    beginMapMarkerPress();
    haptic.toggleControl();
    clearPrimaryMapSelection();
    alertOpenedThisVisitRef.current = true;
    setAlertSheetHeight(0);
    setSelectedAlert(alert);
    if (!effectiveUserId) return;
    // Trigger 1 — a genuine tap on your own pin. Always live; never de-duped,
    // so tapping again later gives a fresh count.
    if (alert.creator_id === effectiveUserId) {
      ownedReachRequestedRef.current = true;
      runReachQuery(alert.id);
    }
    const requestSessionKey = mapShellSessionKey;
    const detailRequestId = ++selectedAlertDetailRequestIdRef.current;
    void fetchNativeMapAlertById(alert.id, effectiveUserId, {
      accessToken,
      sessionKey: requestSessionKey,
      source: "alert",
      updatedAt: alert.created_at,
      force: true,
      cacheWriteGuard: () => sessionKeyRef.current === requestSessionKey,
    }).then((detail) => {
      if (!detail || sessionKeyRef.current !== requestSessionKey || selectedAlertDetailRequestIdRef.current !== detailRequestId) return;
      setSelectedAlert(detail);
    }).catch((error) => {
      if (selectedAlertDetailRequestIdRef.current !== detailRequestId) return;
      setStatusMessage(nativeSafeErrorCopy(error, "Unable to open alert details. Tap the pin to retry."));
    });
  }, [accessToken, beginMapMarkerPress, clearPrimaryMapSelection, effectiveUserId, mapShellSessionKey, runReachQuery]);
  // Trigger 2 — passive map entry. Runs once per visit, and only when no alert
  // was opened: an explicit or deep-linked alert always outranks the rollup.
  useEffect(() => {
    if (!active || !effectiveUserId) return;
    if (mapReachQueryRequestedRef.current || mapReachToastShownRef.current || alertOpenedThisVisitRef.current || ownedReachRequestedRef.current) return;
    if (alertFocusPendingRef.current) return; // a deep link is still resolving
    const timer = setTimeout(() => {
      if (mapReachQueryRequestedRef.current || mapReachToastShownRef.current || alertOpenedThisVisitRef.current || ownedReachRequestedRef.current) return;
      mapReachQueryRequestedRef.current = true;
      runReachQuery(null);
    }, 900); // let the map settle before interrupting
    return () => clearTimeout(timer);
  }, [active, effectiveUserId, runReachQuery]);

  // A visit ends when the tab is left; the next entry may summarise again.
  useEffect(() => {
    if (active) return;
    mapReachToastShownRef.current = false;
    mapReachQueryRequestedRef.current = false;
    autoReachShownRef.current.clear();
    alertOpenedThisVisitRef.current = false;
    ownedReachRequestedRef.current = false;
    reachRequestIdRef.current += 1;
    setReachToast(null);
  }, [active]);

  const focusAlertCell = useCallback((cluster: (typeof alertCells)[number]) => {
    beginMapMarkerPress();
    setExpandedAlertIds((current) => new Set([...current, ...cluster.alerts.map((alert) => alert.id)]));
    openMapAlert(cluster.primary);
  }, [beginMapMarkerPress, openMapAlert]);
  const petPoiFeatures = useMemo(() => buildPetPoiFeatureCollection(petPois), [petPois]);
  const selectedPetPoiFeatures = useMemo(() => (
    selectedPetPoi ? buildPetPoiFeatureCollection([selectedPetPoi]) : emptyPetPoiFeatureCollection
  ), [selectedPetPoi]);

  useEffect(() => {
    const pulseAnim = broadcastRangePulseAnimRef.current;
    if (reduceMotionEnabled || activeOwnBroadcastRangeCount <= 0) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
      setBroadcastRangePulse(0);
      return undefined;
    }

    const listenerId = pulseAnim.addListener(({ value }) => {
      setBroadcastRangePulse(value);
    });
    pulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      pulseAnim.removeListener(listenerId);
    };
  }, [activeOwnBroadcastRangeCount, reduceMotionEnabled]);

  const handlePetPoiPress = useCallback<NonNullable<React.ComponentProps<typeof Mapbox.ShapeSource>["onPress"]>>((event) => {
    const feature = event.features?.[0];
    const properties = feature?.properties && typeof feature.properties === "object" ? feature.properties as { id?: unknown } : null;
    const id = String(properties?.id || feature?.id || "").trim();
    if (!id) return;
    const poi = petPois.find((item) => item.id === id);
    if (!poi) return;
    haptic.toggleControl();
    dismissMapPopovers();
    setSelectedPetPoi(poi);
    setSelectedAlert(null);
  }, [dismissMapPopovers, petPois]);
  const unpinnedHint = useMemo(() => {
    if (isPickingBroadcastLocation || ownPin) return null;
    return t("Pin your location to receive accurate nearby alerts");
  }, [isPickingBroadcastLocation, ownPin, t]);
  const mapTopChromeOffset = insets.top + huddleLayout.headerHeight + huddleSpacing.x3;
  const mapCoachMarkBottom = windowSize.height - Math.max(huddleSpacing.x2, insets.bottom + huddleSpacing.x2) - huddleLayout.navHeight;
  const mapCoachMarkAdvanceBounds: NativeSpotlightTarget = {
    x: 0,
    y: mapTopChromeOffset,
    width: windowSize.width,
    height: Math.max(0, mapCoachMarkBottom - mapTopChromeOffset),
    shape: "rounded",
  };

  if (!tokenConfig.ok) {
    return (
      <NativeMapErrorState
        body={t("Mapbox is not configured for this native build. Add EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN or EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and restart the app.")}
        title={t("Map unavailable")}
      />
    );
  }

  return (
    <View onStartShouldSetResponderCapture={startBroadcastCoachMark} style={styles.container}>
      <Mapbox.MapView
        key={`native-map-${mapReloadKey}`}
        ref={mapViewRef}
        attributionEnabled={false}
        compassEnabled={false}
        logoEnabled={false}
        onDidFinishLoadingMap={() => {
          mapLoadedRef.current = true;
          if (mapLoadErrorTimerRef.current) {
            clearTimeout(mapLoadErrorTimerRef.current);
            mapLoadErrorTimerRef.current = null;
          }
          if (mapLoadDeadlineTimerRef.current) {
            clearTimeout(mapLoadDeadlineTimerRef.current);
            mapLoadDeadlineTimerRef.current = null;
          }
          setMapLoaded(true);
          setLoadError(null);
        }}
        onMapLoadingError={() => {
          if (__DEV__) console.warn("[NativeMapScreen] Mapbox map failed to load", { styleURL: mapStyleURL });
          if (mapLoadedRef.current || mapLoadErrorTimerRef.current) return;
          mapLoadErrorTimerRef.current = setTimeout(() => {
            mapLoadErrorTimerRef.current = null;
            if (mapLoadedRef.current) return;
            setLoadError("Mapbox failed to load.");
            setMapLoaded(false);
          }, MAP_LOAD_ERROR_CONFIRMATION_MS);
        }}
        onCameraChanged={(state) => {
          // Programmatic camera moves position a selected pin or avatar group.
          // Only a real user gesture dismisses a visible map popover.
          if (state.gestures?.isGestureActive) {
            clearPrimaryMapSelection();
            // Recede the nav only while the user is manipulating the map.
            // Programmatic framing must not move unrelated navigation chrome.
            if (mapLoaded && !mapCameraActiveRef.current) {
              mapCameraActiveRef.current = true;
              setNavMinimized(true);
            }
          }
          const zoom = state.properties?.zoom;
          if (typeof zoom === "number" && Number.isFinite(zoom)) {
            cameraZoomRef.current = zoom;
          }
          const center = state.properties?.center;
          if (Array.isArray(center) && typeof center[0] === "number" && typeof center[1] === "number" && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
            const nextCenter: [number, number] = [center[0], center[1]];
            centerCoordinateRef.current = nextCenter;
          }
        }}
        onMapIdle={() => {
          // Map settled — restore the nav to full size.
          mapCameraActiveRef.current = false;
          const hadTriggeredDirty = realtimeRefreshDirtyRef.current && active;
          if (hadTriggeredDirty) {
            realtimeRefreshDirtyRef.current = false;
            void loadMapDataRef.current({ force: true, useCameraCenter: true }).catch(() => undefined);
          }
          setNavMinimized(false);
          const settledZoom = cameraZoomRef.current;
          setCurrentZoom((current) => (
            Math.abs(current - settledZoom) >= 0.01 ? settledZoom : current
          ));
          setMapVisualZoomTier((current) => resolveMapVisualZoomTier(settledZoom, current));
          setSettledAlertLayoutZoom((current) => (
            Math.abs(current - settledZoom) >= 0.01 ? settledZoom : current
          ));
          setSettledFriendLayoutZoom((current) => (
            Math.abs(current - settledZoom) >= 0.01 ? settledZoom : current
          ));
          if (settledZoom < PET_POI_MIN_ZOOM && petPois.length > 0) {
            setPetPois([]);
            setSelectedPetPoi(null);
          }
          if (isPickingBroadcastLocation) {
            const [lng, lat] = centerCoordinateRef.current;
            setBroadcastPinningCenter({ lng, lat });
          }
          const pendingCameraAction = pendingCameraActionRef.current;
          if (pendingCameraAction) {
            pendingCameraActionRef.current = null;
            if (pendingCameraAction.id === cameraActionRequestRef.current) {
              void Promise.resolve(pendingCameraAction.onSettled?.());
            }
          }
          if (suppressNextAlertCameraIdleFetchRef.current) {
            suppressNextAlertCameraIdleFetchRef.current = false;
            return;
          }
          if (hadTriggeredDirty) return;
          if (!effectiveUserId || !mapLoaded || isPickingBroadcastLocation) return;
          if (cameraIdleFetchTimerRef.current) clearTimeout(cameraIdleFetchTimerRef.current);
          cameraIdleFetchTimerRef.current = setTimeout(() => {
            const currentCenter = centerCoordinateRef.current;
            const nextZoomBucket = Math.max(2, Math.min(20, Math.floor(cameraZoomRef.current)));
            const previous = lastFetchedMapAreaRef.current;
            const movedKm = previous ? distanceKmBetween(
              { lat: previous.center[1], lng: previous.center[0] },
              { lat: currentCenter[1], lng: currentCenter[0] },
            ) : Number.POSITIVE_INFINITY;
            if (previous && movedKm < MAP_CAMERA_REFETCH_MIN_KM && previous.zoomBucket === nextZoomBucket) {
              const requestSessionKey = sessionKeyRef.current;
              void loadPetPoisForMap(currentCenter, mapDataRequestIdRef.current, () => sessionKeyRef.current === requestSessionKey);
              return;
            }
            void loadMapDataRef.current({ center: currentCenter }).catch(() => undefined);
          }, MAP_CAMERA_IDLE_DEBOUNCE_MS);
        }}
        onPress={(event) => {
          // Marker presses can also surface as a map press on iOS. Preserve the
          // friend fan state instead of letting the underlying map clear it.
          if (Date.now() < mapMarkerPressGuardUntilRef.current) return;
          clearPrimaryMapSelection();
          if (!isPickingBroadcastLocation) return;
          const geometry = (event as { geometry?: { coordinates?: unknown } })?.geometry;
          const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
          if (typeof coordinates?.[0] !== "number" || typeof coordinates?.[1] !== "number") return;
          const next = { lng: coordinates[0], lat: coordinates[1] };
          // A map tap repositions the holder but does not bypass the pin-first
          // confirmation. The same live centre is used by Place Alert Pin.
          setBroadcastPinningCenter(next);
          applyCamera([next.lng, next.lat], cameraZoomRef.current, false, 180);
        }}
        scaleBarEnabled={false}
        scrollEnabled={!broadcastOpen}
        style={styles.map}
        styleURL={mapStyleURL}
        zoomEnabled={!broadcastOpen}
      >
        <Mapbox.Camera
          ref={cameraRef}
          animationDuration={0}
          centerCoordinate={centerCoordinate}
          zoomLevel={cameraZoom}
        />
        <Mapbox.Images images={PET_POI_MAPBOX_IMAGES} />
        {!isPickingBroadcastLocation && broadcastRangeFeatures.fixed.features.length > 0 ? (
          <Mapbox.ShapeSource
            id="huddle-own-broadcast-ranges"
            shape={broadcastRangeFeatures.fixed}
          >
            <Mapbox.FillLayer
              id="huddle-own-broadcast-ranges-fill"
              style={{
                fillColor: ["get", "color"],
                fillOpacity: ["coalesce", ["get", "opacity"], 0],
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {!isPickingBroadcastLocation && broadcastRangeFeatures.pulse.features.length > 0 ? (
          <Mapbox.ShapeSource
            id="huddle-own-broadcast-range-pulse"
            shape={broadcastRangeFeatures.pulse}
          >
            <Mapbox.FillLayer
              id="huddle-own-broadcast-range-ripple-fill"
              style={{
                fillColor: ["get", "color"],
                fillOpacity: ["get", "opacity"],
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {!isPickingBroadcastLocation && areaGradientFeatures.features.length > 0 ? (
          <Mapbox.ShapeSource id="huddle-area-gradients" shape={areaGradientFeatures}>
            <Mapbox.CircleLayer
              id="huddle-area-gradients-circle"
              style={{
                circleBlur: ["get", "blur"],
                circleColor: ["get", "color"],
                circleOpacity: ["get", "opacity"],
                circleRadius: [
                  "interpolate",
                  ["exponential", 2],
                  ["zoom"],
                  2,
                  ["*", ["get", "pixelRadiusAtZoom0"], 4],
                  20,
                  ["*", ["get", "pixelRadiusAtZoom0"], 1_048_576],
                ],
                circleStrokeWidth: 0,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {!isPickingBroadcastLocation && alertCells.map((cluster) => (
          <Mapbox.MarkerView allowOverlap anchor={{ x: 0.5, y: 1 }} coordinate={cluster.center} key={`alert-aggregate:${cluster.key}`} style={styles.mapInteractiveMarker}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${cluster.total} ${cluster.total === 1 ? "alert" : "alerts"} in this area`}
              hitSlop={8}
              onPressIn={beginMapMarkerPress}
              onPress={() => focusAlertCell(cluster)}
              style={{ transform: [
                { translateX: crossTypeMarkerLayout.offsets.get(`alert-aggregate:${cluster.key}`)?.x || 0 },
                { translateY: crossTypeMarkerLayout.offsets.get(`alert-aggregate:${cluster.key}`)?.y || 0 },
              ] }}
            >
              <AlertAggregateMarker
                alert={cluster.primary}
                count={cluster.total}
                size={crossTypeMarkerLayout.paired.has(`alert-aggregate:${cluster.key}`)
                  ? crossTypeMarkerLayout.visualSize
                  : markerRenderZoom >= FRIEND_AVATAR_DETAIL_ZOOM ? huddleMap.size.alertActive : peopleMarkerSize}
              />
            </Pressable>
          </Mapbox.MarkerView>
        ))}
        {!isPickingBroadcastLocation && petPoisEnabled && currentZoom >= PET_POI_MIN_ZOOM ? (
          <Mapbox.ShapeSource
            id="huddle-pet-pois"
            onPress={handlePetPoiPress}
            shape={petPoiFeatures}
          >
            <Mapbox.SymbolLayer
              id="huddle-pet-pois-icons"
              style={{
                iconAllowOverlap: false,
                iconAnchor: "center",
                iconIgnorePlacement: false,
                iconImage: ["get", "icon"],
                iconSize: 0.38,
                symbolSortKey: 1,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {!isPickingBroadcastLocation && petPoisEnabled && currentZoom >= PET_POI_MIN_ZOOM && selectedPetPoi ? (
          <Mapbox.ShapeSource
            id="huddle-selected-pet-poi"
            shape={selectedPetPoiFeatures}
          >
            <Mapbox.SymbolLayer
              id="huddle-selected-pet-poi-label"
              style={{
                textAllowOverlap: true,
                textAnchor: "top",
                textColor: huddleColors.coral,
                textField: ["get", "label"],
                textHaloColor: huddleColors.canvas,
                textHaloWidth: huddleMap.size.userPinCompressedInnerInset,
                textIgnorePlacement: true,
                textLineHeight: huddleType.lineTight,
                textMaxWidth: huddleSpacing.x8,
                textOffset: [0, huddleType.lineSnug],
                textSize: huddleType.helper,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {ownPin && !isPickingBroadcastLocation && !ownApproxCell ? (
          <Mapbox.MarkerView
            allowOverlap
          anchor={{ x: 0.5, y: 0.5 }}
          coordinate={[ownPin.lng, ownPin.lat]}
            style={[styles.mapInteractiveMarker, styles.mapOwnInteractiveMarker]}
          >
            <Pressable
              accessibilityLabel="Open map sharing controls"
              accessibilityRole="button"
              onPress={() => {
                void openSelfPinMenu([ownPin.lng, ownPin.lat], ownMarkerSizeForZoom(markerRenderZoom));
              }}
              onPressIn={beginMapMarkerPress}
              style={{ transform: [
                { translateX: crossTypeMarkerLayout.offsets.get("own:self")?.x || 0 },
                { translateY: crossTypeMarkerLayout.offsets.get("own:self")?.y || 0 },
              ] }}
            >
              <View pointerEvents="none">
                <OwnPinMarker pin={ownPin} size={ownMarkerSizeForZoom(markerRenderZoom)} userId={effectiveUserId} />
              </View>
            </Pressable>
          </Mapbox.MarkerView>
        ) : null}
        {!isPickingBroadcastLocation && areaClusters.map((cluster) => {
          if (cluster.hasOwner) {
            return (
              <Fragment key={`area:${cluster.key}`}>
                <Mapbox.MarkerView allowOverlap anchor={{ x: 0.5, y: 0.5 }} coordinate={cluster.center} style={[styles.mapInteractiveMarker, styles.mapOwnInteractiveMarker]}>
                  <View style={{ transform: [
                    { translateX: crossTypeMarkerLayout.offsets.get("own:self")?.x || 0 },
                    { translateY: crossTypeMarkerLayout.offsets.get("own:self")?.y || 0 },
                  ] }}>
                    <AreaChipRow
                      members={cluster.members}
                      ownerId={effectiveUserId || "self"}
                      ownerMaskedAvatarKey={`${effectiveUserId || "self"}:incognito:${selfIncognitoAvatarVersion}`}
                      ownerSize={ownMarkerSizeForZoom(markerRenderZoom)}
                      tint={huddleColors.canvas}
                      onMarkerPressStart={beginMapMarkerPress}
                      onOwnerPress={() => {
                        void openSelfPinMenu(cluster.center, ownMarkerSizeForZoom(markerRenderZoom));
                      }}
                      onOthersPress={() => {
                        handleAreaOthersAction(cluster);
                      }}
                    />
                  </View>
                </Mapbox.MarkerView>
              </Fragment>
            );
          }
          return null;
        })}
        {!isPickingBroadcastLocation && anonymousDisplayAreas.map((area) => (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={area.coordinate}
            key={`anonymous:${area.clusterKey}`}
            pointerEvents="none"
            style={styles.mapInteractiveMarker}
          >
            <View
              accessible
              accessibilityLabel={`${area.count >= 9 ? "9 or more" : area.count} people in this area`}
              pointerEvents="none"
              style={{ transform: [
                { translateX: crossTypeMarkerLayout.offsets.get(`anonymous:${area.clusterKey}`)?.x ?? pinCollisionOffsets.get(`anonymous:${area.clusterKey}`)?.x ?? 0 },
                { translateY: crossTypeMarkerLayout.offsets.get(`anonymous:${area.clusterKey}`)?.y ?? pinCollisionOffsets.get(`anonymous:${area.clusterKey}`)?.y ?? 0 },
              ] }}
            >
              <FriendGroupMarker asset={area.asset} count={area.count} />
            </View>
          </Mapbox.MarkerView>
        ))}
        {!isPickingBroadcastLocation && friendRenderItems.map((item, itemIndex) => item.type === "group" ? (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={item.coordinate}
            key={`friend-group:${item.id}`}
            style={styles.mapInteractiveMarker}
          >
            <View style={{ transform: [
              { translateX: crossTypeMarkerLayout.offsets.get(`friend-group:${item.id}`)?.x ?? pinCollisionOffsets.get(`friend-group:${item.id}`)?.x ?? 0 },
              { translateY: crossTypeMarkerLayout.offsets.get(`friend-group:${item.id}`)?.y ?? pinCollisionOffsets.get(`friend-group:${item.id}`)?.y ?? 0 },
            ] }}>
              {item.expanded || markerRenderZoom >= FRIEND_AVATAR_OVERVIEW_ZOOM ? (
                <Pressable
                  accessibilityLabel={`Choose from ${item.count} people`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPressIn={(event) => {
                    event.stopPropagation();
                    beginMapMarkerPress();
                  }}
                  onPress={(event) => {
                    event.stopPropagation();
                    void focusFriendFanAndOpenMenu(item);
                  }}
                >
                  <View pointerEvents="none">
                    <FriendFanMarker friends={item.friends} />
                  </View>
                </Pressable>
              ) : (
                <MarkerEntrance delay={Math.min(itemIndex, 8) * 50} markerKey={`friend-group:${item.id}`}>
                  <Pressable
                    accessibilityLabel={`Show ${item.count} people`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPressIn={(event) => {
                      event.stopPropagation();
                      beginMapMarkerPress();
                    }}
                    onPress={(event) => {
                      event.stopPropagation();
                      void focusFriendFanAndOpenMenu(item);
                    }}
                  >
                    <FriendGroupMarker asset={item.asset} count={item.count} />
                  </Pressable>
                </MarkerEntrance>
              )}
            </View>
          </Mapbox.MarkerView>
        ) : (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 1 }}
            coordinate={[item.friend.last_lng, item.friend.last_lat]}
            key={`friend:${item.friend.id}`}
            style={styles.mapInteractiveMarker}
          >
            <View style={{ transform: [
              { translateX: crossTypeMarkerLayout.offsets.get(`friend:${item.friend.id}`)?.x ?? pinCollisionOffsets.get(`friend:${item.friend.id}`)?.x ?? 0 },
              { translateY: crossTypeMarkerLayout.offsets.get(`friend:${item.friend.id}`)?.y ?? pinCollisionOffsets.get(`friend:${item.friend.id}`)?.y ?? 0 },
            ] }}>
              <MarkerEntrance delay={Math.min(itemIndex, 8) * 50} markerKey={`friend:${item.friend.id}`}>
                <Pressable
                  accessibilityLabel={`View ${item.friend.display_name || "friend"}`}
                  accessibilityRole="button"
                  onPressIn={beginMapMarkerPress}
                  onPress={() => focusFriendProfile(item.friend)}
                >
                  <FriendPinMarker
                    friend={item.friend}
                    size={crossTypeMarkerLayout.paired.has(`friend:${item.friend.id}`) ? crossTypeMarkerLayout.visualSize : peopleMarkerSize}
                  />
                </Pressable>
              </MarkerEntrance>
            </View>
          </Mapbox.MarkerView>
        ))}

        {!isPickingBroadcastLocation && individualVisibleAlerts.map((alert) => (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 1 }}
            coordinate={[alert.longitude, alert.latitude]}
            key={`alert:${alert.id}`}
            style={styles.mapInteractiveMarker}
          >
            <Pressable
              accessibilityLabel={alert.title || "Open alert"}
              accessibilityRole="button"
              hitSlop={huddleSpacing.x2}
              onPressIn={beginMapMarkerPress}
              onPress={() => openMapAlert(alert)}
              style={[styles.alertHitTarget, { transform: [
                { translateX: selectedAlert?.id === alert.id ? 0 : crossTypeMarkerLayout.offsets.get(`alert:${alert.id}`)?.x ?? pinCollisionOffsets.get(`alert:${alert.id}`)?.x ?? 0 },
                { translateY: selectedAlert?.id === alert.id ? 0 : crossTypeMarkerLayout.offsets.get(`alert:${alert.id}`)?.y ?? pinCollisionOffsets.get(`alert:${alert.id}`)?.y ?? 0 },
              ] }]}
            >
              <View style={{ transform: [{ scale: (
                selectedAlert?.id === alert.id
                  ? huddleMap.size.alertActive
                  : crossTypeMarkerLayout.paired.has(`alert:${alert.id}`)
                    ? crossTypeMarkerLayout.visualSize
                    : markerRenderZoom >= FRIEND_AVATAR_DETAIL_ZOOM ? huddleMap.size.alertActive : peopleMarkerSize
              ) / huddleMap.size.alertActive }] }}>
                <NativeAlertMarker
                  activeRippleCandidateCount={activeRippleCandidateCount}
                  alert={alert}
                  reduceMotionEnabled={reduceMotionEnabled}
                  selected={selectedAlert?.id === alert.id}
                  suppressMarkerRipple={alert.creator_id === effectiveUserId}
                />
              </View>
            </Pressable>
          </Mapbox.MarkerView>
        ))}
      </Mapbox.MapView>

      {ownPin && selfPinMenuAnchor ? (
        <NativeSelfPinAnchoredMenu
          anchorStyle={{ left: selfPinMenuAnchor.left, top: selfPinMenuAnchor.top }}
          hours={selfHours}
          onChangeHours={(hours) => persistSelfPin(selfPrecision, hours)}
          onChangePrecision={(precision) => persistSelfPin(precision, selfHours, { rotateIncognitoAvatar: precision === "hidden" })}
          onStop={() => { void stopMapSharing(); }}
          pointerHorizontal={selfPinMenuAnchor.pointerHorizontal}
          pointerVertical={selfPinMenuAnchor.pointerVertical}
          precision={selfPrecision}
          visibleUntil={selfVisibleUntil}
        />
      ) : null}

      <View pointerEvents="box-none" style={[styles.topControlsWrap, { top: mapTopChromeOffset }]}>
        <View pointerEvents="box-none" style={styles.topControlsInner}>
          <View style={styles.toggleGroup}>
            <BlurView blurAmount={16} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
            <MapControlButton
              accessibilityLabel="Alerts"
              active={showAlerts}
              svgIcon="mapAlert"
              onPress={() => {
                clearPrimaryMapSelection();
                setShowAlerts((value) => !value);
              }}
            />
            <MapControlButton
              accessibilityLabel="Friends"
              active={showFriends}
              svgIcon="mapUser"
              onPress={() => {
                clearPrimaryMapSelection();
                setShowFriends((value) => !value);
              }}
            />
          </View>
          <MapControlButton
            accessibilityLabel="Refresh"
            icon="refresh-cw"
            loading={refreshing}
            onPress={refreshReadOnlyData}
            style={styles.refreshButton}
          />
          <View style={styles.rightActionCluster}>
            {ownPin ? (
              <MapControlButton
                accessibilityLabel={selfPrecision === "hidden" ? "Incognito enabled" : "Incognito disabled"}
                icon={selfPrecision === "hidden" ? "eye-off" : "eye"}
                onPress={toggleSelfIncognito}
              />
            ) : null}
            <MapControlButton
              accessibilityLabel={ownPin ? "Unpin my location" : "Pin my location"}
              icon="map-pin"
              loading={pinning}
              onPress={handlePinToggle}
              success={Boolean(ownPin)}
            />
          </View>
        </View>
      </View>

      {!broadcastOpen && unpinnedHint ? (
        <View
          pointerEvents="none"
          style={[
            styles.unpinnedHint,
            { top: mapTopChromeOffset + huddleLayout.minTouch + huddleSpacing.x3 },
          ]}
        >
          <View style={styles.unpinnedHintReserve}>
            <Text style={styles.unpinnedHintText}>{unpinnedHint}</Text>
          </View>
        </View>
      ) : null}

      {isPickingBroadcastLocation ? (
        <>
          <View pointerEvents="none" style={styles.fixedBroadcastPin}>
            <NativeAlertMarker
              activeRippleCandidateCount={1}
              alert={{
                alert_type: draftBroadcastType,
                pet_type: draftBroadcastPetType,
                id: "broadcast-center-preview",
                latitude: broadcastPinningCenter?.lat ?? centerCoordinate[1],
                longitude: broadcastPinningCenter?.lng ?? centerCoordinate[0],
                marker_state: "active",
                title: draftBroadcastType,
              } as NativeMapAlert}
              reduceMotionEnabled={reduceMotionEnabled}
            />
          </View>
          <View style={[styles.pinningAddressWrap, { top: mapTopChromeOffset + huddleLayout.minTouch + huddleSpacing.x3 }]}>
            <AppKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={styles.manualAddressKeyboard}>
              <View style={styles.manualAddressCard}>
                <View style={styles.manualAddressRow}>
                  <TextInput
                    accessibilityLabel="Alert location search"
                    autoCapitalize="words"
                    multiline={false}
                    scrollEnabled
                    numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                    textBreakStrategy="simple"
                    onBlur={() => setBroadcastManualFocused(false)}
                    onChangeText={(value) => {
                      setBroadcastManualQuery(value);
                      if (broadcastManualAttempted && value.trim()) setBroadcastManualAttempted(false);
                    }}
                    onFocus={() => setBroadcastManualFocused(true)}
                    onSubmitEditing={submitBroadcastManualLocation}
                    placeholder={broadcastPinningLoading ? "Finding address..." : "Search address or place"}
                    placeholderTextColor={huddleColors.mutedText}
                    returnKeyType="search"
                    selectTextOnFocus
                    style={[
                      styles.manualAddressInput,
                      broadcastManualFocused ? styles.manualAddressInputFocused : null,
                      broadcastManualAttempted && !broadcastManualQuery.trim() ? styles.manualAddressInputError : null,
                    ]}
                    value={broadcastManualQuery}
                  />
                  <Pressable
                    accessibilityLabel="Search address"
                    accessibilityRole="button"
                    disabled={broadcastManualSearching}
                    onPress={submitBroadcastManualLocation}
                    style={[styles.manualAddressButton, broadcastManualSearching ? styles.manualAddressButtonDisabled : null]}
                  >
                    {broadcastManualSearching ? <NativeSpinner tone="primary" /> : <Feather color={huddleColors.onPrimary} name="search" size={16} />}
                  </Pressable>
                </View>
                {broadcastManualAttempted && !broadcastManualQuery.trim() ? <Text style={styles.manualAddressErrorText}>Enter an address before searching.</Text> : null}
              </View>
            </AppKeyboardAvoidingView>
          </View>
          <View style={[styles.pickLocationActions, { bottom: bottomClearance + huddleSpacing.x5 }]}>
            <Pressable accessibilityLabel="Cancel alert pin" accessibilityRole="button" onPress={cancelBroadcastPinning} style={styles.pickLocationCancel}>
              <Text style={styles.pickLocationCancelText}>{t("Cancel")}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Place alert pin here" accessibilityRole="button" onPress={confirmBroadcastPinning} style={styles.pickLocationConfirm}>
              <Text style={styles.pickLocationConfirmText}>{t("Place Alert Pin")}</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <View
        collapsable={false}
        onLayout={() => {
          if (!active || !broadcastCoachMarkEligible) return;
          requestAnimationFrame(() => {
            broadcastCoachMarkRef.current?.measureInWindow((x, y, width, height) => {
              if (width <= 0 || height <= 0) return;
              setBroadcastCoachMarkTarget({ x, y, width, height, shape: "circle" });
            });
          });
        }}
        pointerEvents="box-none"
        ref={broadcastCoachMarkRef}
        style={[styles.broadcastButtonWrap, { bottom: bottomClearance }]}
      >
        <MapControlButton
          accessibilityLabel="Broadcast an alert"
          icon="radio"
          tint={huddleColors.blue}
              onPress={() => {
                if (startBroadcastCoachMark()) return;
                if (mapRestricted) {
                  setMapRestrictionModalOpen(true);
                  return;
                }
                // Pin-first: place the alert location before filling the form, so
                // users never complete the composer only to discover a pin is required.
                clearPrimaryMapSelection();
                setSelectedAlert(null);
                startBroadcastPinning();
          }}
          size={56}
          style={styles.broadcastButton}
        />
      </View>

      <NativeSpotlightOverlay
        accent={huddleColors.lime}
        advanceBounds={mapCoachMarkAdvanceBounds}
        body="You choose who sees them and how far."
        focusVisual={(
          <MapControlButton
            accessibilityLabel="Broadcast an alert"
            icon="radio"
            onPress={() => undefined}
            size={56}
            style={styles.broadcastButton}
            tint={huddleColors.blue}
          />
        )}
        headline="Pins stay live 7 days, plus any boost time."
        kicker="Alerts"
        onAdvance={() => {
          setBroadcastCoachMarkEligible(false);
          setShowBroadcastCoachMark(false);
          setBroadcastCoachMarkTarget(null);
          void markNativeCoachMarkSeen(effectiveUserId, "map_broadcast_intro");
        }}
        target={broadcastCoachMarkTarget}
        visible={active && showBroadcastCoachMark && Boolean(broadcastCoachMarkTarget)}
      />

      <View pointerEvents="box-none" style={[styles.zoomControlShadow, { bottom: zoomBottomClearance }]}>
        <View style={styles.zoomControlStack}>
          <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" onPress={() => { haptic.toggleControl(); handleZoomChange(1); }} style={styles.zoomButton}>
            <Feather color={huddleColors.text} name="plus" size={20} />
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" onPress={() => { haptic.toggleControl(); handleZoomChange(-1); }} style={styles.zoomButton}>
            <Feather color={huddleColors.text} name="minus" size={20} />
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable accessibilityLabel="Recenter" accessibilityRole="button" onPress={() => { haptic.toggleControl(); void handleLocationPress(); }} style={styles.zoomButton}>
            {locationLoading ? <NativeSpinner tone="secondary" /> : <Feather color={huddleColors.blue} name="navigation" size={16} />}
          </Pressable>
        </View>
      </View>

      {!mapLoaded && !loadError ? (
        <View pointerEvents="none" style={[styles.mapLoadingOverlay, { top: mapTopChromeOffset, bottom: bottomClearance }]}>
          <NativeLoadingState variant="inline" />
        </View>
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.offlineBanner,
          { top: mapTopChromeOffset },
          {
            opacity: offlineBannerAnim,
            transform: [{
              translateY: offlineBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-32, 0] }),
            }],
          },
        ]}
      >
        <Feather color={huddleColors.onPrimary} name="wifi-off" size={16} />
        <Text style={styles.offlineBannerText}>{t("You are offline. Map data may be outdated.")}</Text>
      </Animated.View>

      {/* Reach confirmation. Separate from the statusPill below so a map error
          can never overwrite it, and it uses the shared top-rail toast. */}
      {reachToast ? (
        <NativeToast
          key={reachToastVersion}
          content={reachToast}
          holdToPause
          onDismiss={() => setReachToast(null)}
        />
      ) : null}

      {mapLoaded && statusMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.statusPill,
            { top: mapTopChromeOffset + huddleLayout.minTouch + huddleSpacing.x2, right: huddleSpacing.x4 },
            {
              opacity: statusPillAnim,
              transform: [{
                translateY: statusPillAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }),
              }],
            },
          ]}
        >
          <Text style={styles.dataErrorText}>{statusMessage}</Text>
        </Animated.View>
      ) : null}

      {broadcastDropConfirmation && broadcastDropPoint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.broadcastDropFlyingPin,
            {
              opacity: broadcastDropAnim.interpolate({
                inputRange: [0, 0.08, 1],
                outputRange: [0, 1, 1],
              }),
              transform: [
                {
                  translateX: broadcastDropAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [broadcastDropPoint.x - BROADCAST_DROP_MARKER_WIDTH / 2, broadcastDropPoint.x - BROADCAST_DROP_MARKER_WIDTH / 2],
                  }),
                },
                {
                  translateY: broadcastDropAnim.interpolate({
                    inputRange: [0, 0.72, 1],
                    outputRange: [mapTopChromeOffset + huddleSpacing.x5, Math.max(mapTopChromeOffset + huddleSpacing.x5, broadcastDropPoint.y - BROADCAST_DROP_MARKER_HEIGHT - huddleSpacing.x4), broadcastDropPoint.y - BROADCAST_DROP_MARKER_HEIGHT],
                  }),
                },
                {
                  scale: broadcastDropAnim.interpolate({
                    inputRange: [0, 0.72, 1],
                    outputRange: [0.72, 1.06, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <NativeAlertMarker
            activeRippleCandidateCount={1}
            alert={{
              alert_type: draftBroadcastType,
              pet_type: draftBroadcastPetType,
              id: "broadcast-preview-flying",
              latitude: broadcastPreviewPin?.lat ?? 0,
              longitude: broadcastPreviewPin?.lng ?? 0,
              marker_state: "active",
              title: draftBroadcastType,
            } as NativeMapAlert}
            reduceMotionEnabled={reduceMotionEnabled}
          />
        </Animated.View>
      ) : null}

      {permissionState === "denied" && mapLoaded ? (
        null
      ) : null}

      {loadError ? (
        <NativeMapErrorState
          onRetry={() => {
            mapLoadedRef.current = false;
            setLoadError(null);
            setMapLoaded(false);
            setMapReloadKey((current) => current + 1);
            void loadMapData();
          }}
          title={t("Map failed to load")}
        />
      ) : null}

      <NativeMapConfirmationModal
        icon="map-pin"
        iconColor={huddleColors.blue}
        onClose={() => setLocationSettingsReason(null)}
        primaryLabel={locationSettingsReason === "services" ? "Open Location Settings" : "Open huddle Settings"}
        primaryVariant="primary"
        onPrimary={async () => {
          const reason = locationSettingsReason;
          setLocationSettingsReason(null);
          await (reason === "services" ? openNativeLocationSettings() : openNativeAppSettings());
        }}
        title={locationSettingsReason === "services" ? "Turn on Location Services" : "Turn on Location"}
        visible={active && locationSettingsReason !== null}
      >
        <Text style={styles.modalBody}>
          {locationSettingsReason === "services"
            ? "Turn on Location Services in Settings, then return to huddle."
            : "Turn on Location for huddle in Settings."}
        </Text>
      </NativeMapConfirmationModal>

      <NativeMapConfirmationModal
        icon="map-pin"
        iconColor={huddleColors.validationRed}
        imageSource={privacyImage}
        onClose={() => setShowUnpinConfirm(false)}
        primaryLabel="Unpin"
        primaryVariant="danger"
        onPrimary={() => void confirmUnpinLocation()}
        title="Unpin Location"
        visible={showUnpinConfirm}
      >
        <Text style={styles.modalBody}>This will remove you from the map and may limit nearby alerts. If you'd prefer to stay private, tap Invisible instead.</Text>
      </NativeMapConfirmationModal>

      <NativeBroadcastModal
        accessToken={accessToken ?? null}
        centerCoordinate={centerCoordinate}
        alertType={draftBroadcastType}
        mapRestricted={mapRestricted}
        onAlertTypeChange={(next) => {
          setDraftBroadcastType(next);
          if (!nativeBroadcastRequiresPetType(next)) setDraftBroadcastPetType(null);
        }}
        onClearLocation={() => {
          setBroadcastPreviewPin(null);
          setBroadcastPreviewAddress(null);
        }}
        onRestricted={() => setMapRestrictionModalOpen(true)}
        onClose={() => {
          setBroadcastOpen(false);
          setBroadcastPreviewPin(null);
          setBroadcastPreviewAddress(null);
          setBroadcastDropConfirmation(false);
          setDraftBroadcastPetType(null);
        }}
        onCreated={async (created) => {
          setStatusMessage(null);
          if (created?.alert) {
            setAlerts((current) => {
              if (current.some((alert) => alert.id === created.alert.id)) return current;
              return sortNativeMapAlertsForDisplay([created.alert, ...current], centerCoordinateRef.current);
            });
          }
          setBroadcastPreviewPin(null);
          setBroadcastPreviewAddress(null);
        }}
        onOpenPremium={(target) => onNavigate?.(target === "addons" || target === "super" ? "/premium?tab=addons" : "/premium")}
        onOpenSupport={() => {
          setBroadcastOpen(false);
          onNavigate?.("/support");
        }}
        onPetTypeChange={setDraftBroadcastPetType}
        onRequestPinLocation={() => {
          if (mapRestricted) {
            setMapRestrictionModalOpen(true);
            return;
          }
          startBroadcastPinning();
        }}
        selectedAddress={broadcastPreviewAddress}
        selectedLocation={broadcastPreviewPin}
        selectedPetType={draftBroadcastPetType}
        sessionKey={mapShellSessionKey}
        userId={effectiveUserId}
        visible={broadcastOpen}
      />

      <NativeMapRestrictionModal onClose={() => setMapRestrictionModalOpen(false)} visible={mapRestrictionModalOpen} />

      {areaMenu ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.areaMenu, { left: areaMenu.anchor.left, top: areaMenu.anchor.top }]}>
            <View style={styles.areaMenuPointer} />
            <Animated.ScrollView
              bounces={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: areaMenuScrollY } } }],
                { useNativeDriver: true },
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={styles.areaMenuScroll}
            >
              {sortedAreaMenuMembers.map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  onPress={() => { setAreaMenu(null); openFriendProfile(member); }}
                  style={styles.areaMenuRow}
                >
                  <Text numberOfLines={1} style={styles.areaMenuName}>
                    {member.is_invisible ? "Someone (private)" : (member.display_name || "Someone")}
                    {friendPeerIds.has(member.id) && !member.is_invisible ? <Text style={styles.areaMenuRelationship}> (friend)</Text> : null}
                  </Text>
                  {!member.is_invisible ? <Feather color={huddleColors.iconSubtle} name="chevron-right" size={18} /> : null}
                </Pressable>
              ))}
            </Animated.ScrollView>
            {areaMenuCanScroll ? (
              <View pointerEvents="none" style={styles.areaMenuScrollTrack}>
                <Animated.View
                  style={[
                    styles.areaMenuScrollThumb,
                    {
                      height: areaMenuScrollThumbHeight,
                      transform: [{ translateY: areaMenuScrollThumbTranslateY }],
                    },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <NativeAlertDetailModal
        alert={selectedAlert}
        onClose={dismissAlertDetail}
        onHidden={(alertId) => {
          alertFocusRequestRef.current += 1;
          selectedAlertDetailRequestIdRef.current += 1;
          alertFocusPendingRef.current = false;
          setAlertFocus(null);
          void invalidateNativeMapAlertCaches(alertId);
          setHiddenAlertIds((current) => {
            const next = new Set(current);
            next.add(alertId);
            return next;
          });
          setAlerts((current) => {
            const next = current.filter((alert) => alert.id !== alertId);
            void writeCachedAlerts(next);
            return next;
          });
        }}
        onOpenProfile={(profileId) => {
          const creator = selectedAlert?.creator_id === profileId ? selectedAlert.creator : null;
          dismissAlertDetail();
          openMapProfileCard({
            userId: profileId,
            avatarUrl: creator?.avatar_url ?? null,
            displayName: creator?.display_name ?? null,
            socialId: creator?.social_id ?? null,
          });
        }}
        onOpenSocial={(threadId) => onNavigate?.(threadId ? `/social?focus=${encodeURIComponent(threadId)}` : "/social")}
        onRefresh={loadMapData}
        onSheetHeightChange={(nextHeight) => {
          setAlertSheetHeight((current) => Math.abs(current - nextHeight) >= 2 ? nextHeight : current);
        }}
        onShareCountUpdated={(updatedAlert) => {
          setSelectedAlert(updatedAlert);
          setAlerts((current) => {
            const withoutUpdated = current.filter((alert) => alert.id !== updatedAlert.id);
            const next = sortNativeMapAlertsForDisplay([updatedAlert, ...withoutUpdated], centerCoordinateRef.current);
            void writeCachedAlerts(next);
            return next;
          });
        }}
        onUpdated={(updatedAlert) => {
          void invalidateNativeMapAlertCaches(updatedAlert.id);
          setSelectedAlert(updatedAlert);
          setAlerts((current) => {
            const withoutUpdated = current.filter((alert) => alert.id !== updatedAlert.id);
            const next = sortNativeMapAlertsForDisplay([updatedAlert, ...withoutUpdated], centerCoordinateRef.current);
            void writeCachedAlerts(next);
            return next;
          });
        }}
        accessToken={accessToken}
        sessionKey={mapShellSessionKey}
        userId={effectiveUserId}
      />

      {mapProfileCard ? <NativeShareCardModal
        data={mapProfileCard}
        onClose={() => {
          mapProfileCardRequestRef.current += 1;
          setMapProfileCard(null);
        }}
        showActions={false}
        visible
      /> : null}

      <View pointerEvents="none" style={[styles.bottomControlReserve, { height: bottomClearance }]} />
    </View>
  );
}

function NativeMapConfirmationModal({
  children,
  icon,
  iconColor,
  imageSource,
  onClose,
  onPrimary,
  primaryLabel,
  primaryVariant,
  title,
  visible,
}: {
  children: React.ReactNode;
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  imageSource?: ImageSourcePropType;
  onClose: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryVariant: "primary" | "danger";
  title: string;
  visible: boolean;
}) {
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable style={styles.nativeConfirmationBackdrop} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <View style={styles.nativeConfirmationCard}>
            <View style={styles.nativeConfirmationContent}>
            <View style={styles.nativeConfirmationClose}>
              <AppModalIconButton accessibilityLabel="Close" onPress={onClose}>
                <Feather color={huddleColors.subtext} name="x" size={18} />
              </AppModalIconButton>
            </View>
            <View style={styles.modalTitleRow}>
              <View style={[styles.modalIconCircle, { backgroundColor: primaryVariant === "primary" ? huddleColors.primarySoftFill : huddleColors.mutedCanvas }]}>
                <Feather color={iconColor} name={icon} size={20} />
              </View>
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            {imageSource ? <Image resizeMode="contain" source={imageSource} style={styles.modalImage} /> : null}
            {children}
            <AppModalActionRow>
              <AppModalButton variant={primaryVariant === "danger" ? "destructive" : "primary"} onPress={onPrimary}>
                <Text style={styles.modalPrimaryText}>{primaryLabel}</Text>
              </AppModalButton>
            </AppModalActionRow>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MapControlButton({
  accessibilityLabel,
  active = false,
  disabled = false,
  icon,
  svgIcon,
  loading = false,
  onPress,
  phaseLocked = false,
  size = 44,
  style,
  success = false,
  tint,
}: {
  accessibilityLabel: string;
  active?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  svgIcon?: NativeGlyphName;
  loading?: boolean;
  onPress?: () => void;
  phaseLocked?: boolean;
  size?: number;
  style?: object;
  success?: boolean;
  tint?: string;
}) {
  const foreground = success || active ? huddleColors.onPrimary : tint ?? (icon === "eye" ? huddleColors.blue : huddleColors.subtext);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active || success }}
      disabled={disabled}
      onPress={onPress ? () => { haptic.toggleControl(); onPress(); } : undefined}
      style={({ pressed }) => [
        styles.controlButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: success ? huddleMap.marker.ownPin : active ? huddleColors.blue : huddleColors.glassControl,
        },
        phaseLocked ? styles.phaseLockedButton : null,
        pressed ? styles.controlButtonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <NativeSpinner tone="primary" />
      ) : svgIcon ? (
        <NativeGlyph color={foreground} name={svgIcon} size={20} />
      ) : icon ? (
        <Feather color={foreground} name={icon} size={size >= 56 ? 26 : icon === "refresh-cw" ? 16 : 20} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  map: {
    flex: 1,
  },
  mapInteractiveMarker: {
    zIndex: 1,
  },
  mapOwnInteractiveMarker: {
    zIndex: 3,
  },
  mapLoadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1400,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomControlReserve: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
  },
  topControlsWrap: {
    position: "absolute",
    right: huddleSpacing.x4,
    left: huddleSpacing.x4,
    zIndex: 1600,
    alignItems: "center",
  },
  topControlsInner: {
    width: "100%",
    maxWidth: 440,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
  },
  toggleGroup: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleLayout.minTouch,
    flexDirection: "row",
    gap: 4,
    padding: 4,
    backgroundColor: huddleColors.glassControl,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  rightActionCluster: {
    marginLeft: "auto",
    flexDirection: "row",
    gap: 4,
  },
  controlButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  controlButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  phaseLockedButton: {
    opacity: 1,
  },
  refreshButton: {
    marginLeft: huddleSpacing.x2,
  },
  unpinnedHint: {
    position: "absolute",
    left: huddleSpacing.x4,
    right: huddleSpacing.x4,
    zIndex: 1650,
    alignItems: "center",
  },
  unpinnedHintReserve: {
    minHeight: 30,
    alignItems: "center",
  },
  unpinnedHintText: {
    maxWidth: 440,
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 6,
    backgroundColor: huddleColors.glassChrome,
    color: huddleColors.subtext,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
    textAlign: "center",
  },
  broadcastButtonWrap: {
    position: "absolute",
    left: huddleSpacing.x4,
    zIndex: 1700,
  },
  broadcastButton: {
    backgroundColor: huddleColors.glassChrome,
  },
  fixedBroadcastPin: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch + huddleSpacing.x3,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -huddleLayout.minTouch / 2,
    marginTop: -(huddleLayout.minTouch + huddleSpacing.x3),
    zIndex: 1700,
  },
  pinningAddressWrap: {
    position: "absolute",
    left: huddleSpacing.x4,
    right: huddleSpacing.x4,
    zIndex: 1750,
    alignItems: "center",
  },
  pinningAddressCard: {
    width: "100%",
    maxWidth: 440,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
    backgroundColor: huddleColors.glassChrome,
  },
  pinningAddressTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pinningAddressText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  pinningDistanceText: {
    marginLeft: huddleSpacing.x3,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.blue,
  },
  manualAddressCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 12,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
    backgroundColor: huddleColors.glassChrome,
  },
  manualAddressKeyboard: {
    width: "100%",
    maxWidth: 440,
  },
  manualAddressHelper: {
    marginBottom: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.subtext,
  },
  manualAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  manualAddressInput: {
    height: 36,
    maxHeight: 36,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 0,
    backgroundColor: huddleColors.canvas,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    textAlignVertical: "center",
    overflow: "hidden",
  },
  manualAddressInputFocused: {
    ...huddleFieldStates.focused,
  },
  manualAddressInputError: {
    ...huddleFieldStates.error,
  },
  manualAddressErrorText: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
  },
  manualAddressButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: huddleColors.blue,
  },
  manualAddressButtonDisabled: {
    opacity: 0.5,
  },
  pickLocationActions: {
    position: "absolute",
    left: huddleSpacing.x4,
    right: huddleSpacing.x4,
    zIndex: 1700,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  pickLocationCancel: {
    minHeight: 42,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.glassChrome,
  },
  pickLocationCancelText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  pickLocationConfirm: {
    minHeight: 42,
    maxWidth: 260,
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.blue,
  },
  pickLocationConfirmText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  // Shadow on the outer wrap (glass surface clips), capsule glass inside —
  // same chrome language as the bottom nav, so the map controls read owned.
  zoomControlShadow: {
    position: "absolute",
    right: huddleSpacing.x4,
    zIndex: 1500,
    borderRadius: huddleRadii.pill,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  // Same frosted recipe as the top-row map controls (refresh button):
  // glassControl white over the map, glassBorder rim — visible, owned, calm.
  zoomControlStack: {
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassControl,
  },
  zoomButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomDivider: {
    alignSelf: "center",
    width: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(66,82,110,0.28)",
  },
  pinShellMarker: {
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleMap.size.alertActive / 2,
    borderWidth: 2,
    borderColor: huddleColors.onPrimary,
    backgroundColor: huddleColors.blue,
  },
  pinShellAlert: {
    backgroundColor: huddleMap.marker.alertStray,
  },
  pinShellUser: {
    backgroundColor: huddleMap.marker.friendVerified,
  },
  alertMarker: {
    alignItems: "center",
  },
  alertHitTarget: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  alertMarkerHead: {
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleMap.size.alertActive / 2,
    // White rim so the coloured head reads as a designed pin, not a raw
    // notification badge, over any map tile.
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: huddleColors.text,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  alertMarkerPetEmoji: {
    fontSize: 18,
    lineHeight: 21,
    includeFontPadding: false,
    textAlign: "center",
  },
  alertMarkerHeadWrap: {
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    alignItems: "center",
    justifyContent: "center",
  },
  alertMarkerHeadWash: {
    position: "absolute",
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    borderRadius: huddleMap.size.alertActive / 2,
    backgroundColor: huddleColors.canvas,
  },
  alertMarkerRipple: {
    position: "absolute",
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    borderRadius: huddleMap.size.alertActive / 2,
  },
  alertMarkerTip: {
    width: 0,
    height: 0,
    marginTop: -3,
    borderLeftWidth: huddleMap.size.alertTipWidth,
    borderRightWidth: huddleMap.size.alertTipWidth,
    borderTopWidth: huddleMap.size.alertTipHeight,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  alertMarkerTipWash: {
    position: "absolute",
    top: huddleMap.size.alertActive - 3,
  },
  alertExpiredDot: {
    width: huddleMap.size.alertExpired,
    height: huddleMap.size.alertExpired,
    borderWidth: 1,
    borderColor: huddleColors.onPrimary,
    borderRadius: huddleMap.size.alertExpired / 2,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  areaChipRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  areaOwnChip: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ownPinMarkerWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Expanding lime ring behind the self marker — soft fill + thin rim so the
  // pulse reads as breathing light, not a target reticle.
  ownPinHalo: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: huddleMap.marker.ownPin,
    backgroundColor: "rgba(166,213,57,0.16)",
  },
  areaOthersRow: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
  },
  areaChipShadow: {
    backgroundColor: huddleColors.canvas,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  areaChip: {
    borderWidth: 2.5,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
  },
  areaDot: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: huddleColors.coral,
    borderWidth: 2,
    borderColor: huddleColors.canvas,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  areaDotCount: {
    fontFamily: "Urbanist-800",
    fontSize: 10,
    color: huddleColors.onPrimary,
  },
  areaChipImage: {
    width: "100%",
    height: "100%",
  },
  areaMore: {
    minWidth: 30,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    paddingHorizontal: 7,
    backgroundColor: huddleColors.coral,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  areaMoreText: {
    fontFamily: "Urbanist-800",
    fontSize: 13,
    color: huddleColors.onPrimary,
  },
  alertAggregateMarker: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  alertAggregateChip: {
    backgroundColor: huddleColors.canvas,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  alertAggregateChipText: {
    fontFamily: "Urbanist-800",
  },
  alertAggregateChipNotch: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  areaMenu: {
    position: "absolute",
    minWidth: 220,
    width: AREA_MENU_WIDTH,
    backgroundColor: huddleColors.canvas,
    borderRadius: huddleRadii.glass,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x1,
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  areaMenuPointer: {
    position: "absolute",
    top: -7,
    left: 18,
    width: 16,
    height: 16,
    backgroundColor: huddleColors.canvas,
    transform: [{ rotate: "45deg" }],
  },
  areaMenuScroll: {
    maxHeight: AREA_MENU_ROW_HEIGHT * AREA_MENU_MAX_VISIBLE_ROWS,
  },
  areaMenuScrollTrack: {
    position: "absolute",
    top: huddleSpacing.x1,
    right: huddleSpacing.x1,
    bottom: huddleSpacing.x1,
    width: 3,
    borderRadius: 2,
    backgroundColor: huddleColors.iconSubtle,
    opacity: 0.14,
  },
  areaMenuScrollThumb: {
    width: 3,
    borderRadius: 2,
    backgroundColor: huddleColors.iconSubtle,
    opacity: 0.68,
  },
  areaMenuRow: {
    height: AREA_MENU_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
  },
  areaMenuName: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    color: huddleColors.text,
  },
  areaMenuRelationship: {
    fontFamily: "Urbanist-400",
    fontSize: 14,
    color: huddleColors.iconSubtle,
  },
  avatarMarker: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatarImage: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.mutedCanvas,
  },
  avatarFallbackText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  avatarFallbackTextCompressed: {
    fontSize: 11,
    lineHeight: 14,
  },
  friendGroupMarker: {
    width: huddleMap.size.userPin,
    height: huddleMap.size.userPin,
    alignItems: "center",
    justifyContent: "center",
    borderColor: huddleColors.canvas,
    borderRadius: huddleMap.size.userPin / 2,
    backgroundColor: "transparent",
    shadowColor: huddleColors.text,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  friendGroupImage: {
    width: "100%",
    height: "100%",
  },
  friendGroupWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.canvas,
    opacity: 0.7,
  },
  friendGroupOverlayCount: {
    position: "absolute",
    width: "100%",
    height: "100%",
    textAlign: "center",
    textAlignVertical: "center",
    fontFamily: "Urbanist-800",
    fontSize: 14,
    lineHeight: huddleMap.size.userPinCompressed,
    color: huddleColors.text,
  },
  friendFanMarker: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  friendFanRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 6,
  },
  friendFanAvatar: {
    marginRight: -6,
  },
  locationPuckOuter: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: huddleColors.onPrimary,
    borderRadius: 9,
    backgroundColor: huddleColors.blue,
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  locationPuckInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: huddleColors.onPrimary,
  },
  dataErrorPill: {
    position: "absolute",
    top: huddleSpacing.x3,
    alignSelf: "center",
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
    borderRadius: huddleLayout.minTouch,
    backgroundColor: huddleColors.glassChrome,
  },
  offlineBanner: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 2100,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
    backgroundColor: huddleColors.validationRed,
  },
  offlineBannerText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.onPrimary,
  },
  locationDeniedPill: {
    top: huddleSpacing.x8,
  },
  statusPill: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
    borderRadius: huddleLayout.minTouch,
    backgroundColor: huddleColors.glassChrome,
    zIndex: 1750,
  },
  broadcastDropFlyingPin: {
    position: "absolute",
    zIndex: 1900,
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch + huddleSpacing.x3,
    alignItems: "center",
    justifyContent: "center",
  },
  dataErrorText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.subtext,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    backgroundColor: huddleColors.backdrop,
  },
  nativeConfirmationBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    backgroundColor: huddleColors.backdrop,
  },
  nativeConfirmationCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  nativeConfirmationContent: {
    position: "relative",
    gap: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x6,
    paddingBottom: huddleSpacing.x5,
  },
  nativeConfirmationClose: {
    position: "absolute",
    right: huddleSpacing.x4,
    top: huddleSpacing.x4,
    zIndex: 4,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: huddleSpacing.x6,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  modalCloseButton: {
    position: "absolute",
    top: huddleSpacing.x4,
    right: huddleSpacing.x4,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: huddleColors.divider,
  },
  modalTitleRow: {
    marginRight: huddleSpacing.x7,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  modalIconCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  modalTitle: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  modalImage: {
    width: "100%",
    height: 144,
    marginBottom: huddleSpacing.x4,
    borderRadius: 12,
  },
  modalBody: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  modalActions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: huddleColors.mutedCanvas,
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: huddleColors.blue,
  },
  modalDangerButton: {
    backgroundColor: huddleColors.validationRed,
  },
  modalSecondaryText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  modalPrimaryText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
});
