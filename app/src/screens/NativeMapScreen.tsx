import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BlurView } from "@react-native-community/blur";
import Mapbox from "@rnmapbox/maps";
import * as Network from "expo-network";
import { ActivityIndicator, Animated, AppState, Image, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import privacyImage from "../../assets/Notifications/Privacy.jpg";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeAlertDetailModal } from "../components/map/NativeAlertDetailModal";
import { NativeBroadcastModal } from "../components/map/NativeBroadcastModal";
import { NativeMapErrorState } from "../components/map/NativeMapErrorState";
import { NativeMapRestrictionModal } from "../components/map/NativeMapRestrictionModal";
import { AppModalActionRow, AppModalButton, AppModalCard, AppModalIconButton } from "../components/nativeModalPrimitives";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeServiceProfileImage } from "../components/service/NativeServiceProfileImage";
import {
  NATIVE_MAP_DEFAULT_CENTER,
  NATIVE_MAP_DEFAULT_ZOOM,
  readNativeMapTokenConfig,
} from "../lib/nativeMapConfig";
import {
  fetchNativeMapReadOnlyData,
  fetchNativeMapAlertById,
  sortNativeMapAlertsForDisplay,
  type NativeMapAlert,
  type NativeMapFriendPin,
  type NativeMapOwnPin,
} from "../lib/nativeMapData";
import { normalizeNativeGenderBucket, pickNativeGroupedPinAsset, pickNativeMaskedAvatarAsset } from "../lib/nativeMaskedPinAssets";
import {
  getNativeCurrentCoordinates,
  getNativeForegroundLocationPermissionDetail,
  openNativeLocationSettings,
  requestNativeForegroundLocationPermissionDetail,
  type NativeLocationPermissionDetail,
  type NativeLocationPermissionState,
} from "../lib/nativeLocation";
import {
  clearNativeUserLocationPin,
  lookupNativeMapAddress,
  lookupNativeMapQueryCenter,
  pinNativeUserLocation,
  setNativeMapInvisible,
} from "../lib/nativeMapMutations";
import { useLanguage } from "../lib/nativeLanguage";
import { isNativeRestrictionActive } from "../lib/nativeSafetyRestrictions";
import { supabase } from "../lib/supabase";
import { huddleColors, huddleLayout, huddleMap, huddleMotion, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { haptic } from "../lib/nativeHaptics";

type NativeMapScreenProps = {
  bottomNavVisible?: boolean;
  onBottomSheetOpenChange?: (open: boolean) => void;
  onNavigate?: (path: string) => void;
  search?: string;
  userId?: string | null;
};

const COMPRESSED_MODE_ENTER_ZOOM = 14.5;
const COMPRESSED_GROUP_DISTANCE_PX = 18;
const EXPANDED_GROUP_DISTANCE_PX = 28;
const MERCATOR_TILE_SIZE = 512;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const ALERT_CACHE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNIFICANT_PIN_MOVE_KM = 0.25;
const BROADCAST_DROP_MARKER_WIDTH = huddleLayout.minTouch;
const BROADCAST_DROP_MARKER_HEIGHT = huddleLayout.minTouch + huddleSpacing.x3;

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

const worldPointToLngLat = (x: number, y: number, zoom: number): [number, number] => {
  const scale = MERCATOR_TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const mercatorY = 0.5 - y / scale;
  const lat = (90 - (360 * Math.atan(Math.exp(-mercatorY * 2 * Math.PI))) / Math.PI);
  return [lng, lat];
};

const buildFriendRenderItems = (friends: NativeMapFriendPin[], zoom: number): FriendRenderItem[] => {
  const maxDistancePx = zoom <= COMPRESSED_MODE_ENTER_ZOOM ? COMPRESSED_GROUP_DISTANCE_PX : EXPANDED_GROUP_DISTANCE_PX;
  const groups: Array<{
    friends: NativeMapFriendPin[];
    x: number;
    y: number;
  }> = [];

  friends.forEach((friend) => {
    const point = lngLatToWorldPoint(friend.last_lng, friend.last_lat, zoom);
    const overlappingGroup = groups.find((group) => Math.hypot(group.x - point.x, group.y - point.y) <= maxDistancePx);
    if (!overlappingGroup) {
      groups.push({ friends: [friend], x: point.x, y: point.y });
      return;
    }
    const nextCount = overlappingGroup.friends.length + 1;
    overlappingGroup.x = (overlappingGroup.x * overlappingGroup.friends.length + point.x) / nextCount;
    overlappingGroup.y = (overlappingGroup.y * overlappingGroup.friends.length + point.y) / nextCount;
    overlappingGroup.friends.push(friend);
  });

  return groups.map((group) => {
    if (group.friends.length === 1) {
      return { type: "single", friend: group.friends[0] };
    }
    const sortedIds = group.friends.map((friend) => friend.id).sort((left, right) => left.localeCompare(right));
    const sessionKey = group.friends
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((friend) => `${friend.id}:${friend.location_pinned_until || "unpinned"}`)
      .join("|");
    return {
      type: "group",
      id: sortedIds.join(","),
      count: group.friends.length,
      coordinate: worldPointToLngLat(group.x, group.y, zoom),
      asset: pickNativeGroupedPinAsset(sessionKey),
    };
  });
};

function NativeAlertMarker({ alert, selected = false }: { alert: NativeMapAlert; selected?: boolean }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: selected ? 1.25 : 1.0,
      friction: 7,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [selected, scaleAnim]);
  const color = alertMarkerColor(alert.alert_type);
  if (alert.marker_state === "expired_dot") {
    return <View style={[styles.alertExpiredDot, { backgroundColor: color }]} />;
  }
  return (
    <Animated.View style={[styles.alertMarker, { transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.alertMarkerHead, { backgroundColor: color }]}>
        {alertMarkerIcon(alert.alert_type) === "paw" ? (
          <MaterialCommunityIcons color={huddleColors.onPrimary} name="paw" size={17} />
        ) : (
          <Feather color={huddleColors.onPrimary} name={alertMarkerIcon(alert.alert_type) as keyof typeof Feather.glyphMap} size={16} />
        )}
      </View>
      <View style={[styles.alertMarkerTip, { borderTopColor: color }]} />
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
  invisibleFill = huddleMap.marker.ownPin,
}: {
  avatarUrl?: string | null;
  borderColor: string;
  fallbackSource?: ImageSourcePropType | null;
  fallbackName?: string | null;
  invisible?: boolean;
  compressed?: boolean;
  invisibleFill?: string;
}) {
  const initial = String(fallbackName || "M").trim().charAt(0).toUpperCase() || "M";
  const showImage = !invisible && isRenderableImageUrl(avatarUrl);
  const markerSize = compressed ? huddleMap.size.userPinCompressed : huddleMap.size.userPin;
  const markerInnerInset = compressed ? huddleMap.size.userPinCompressedInnerInset : huddleMap.size.userPinInnerInset;
  const innerSize = markerSize - markerInnerInset;
  const imageStyle = [styles.avatarImage, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }];
  return (
    <View style={[styles.avatarMarker, { width: markerSize, height: markerSize, borderRadius: markerSize / 2, borderColor, backgroundColor: invisible ? invisibleFill : huddleColors.canvas }]}>
      {invisible ? (
        <Feather color={huddleColors.onPrimary} name="user" size={compressed ? 13 : 20} />
      ) : showImage ? (
        <NativeServiceProfileImage accessibilityIgnoresInvertColors resizeMode="cover" uri={String(avatarUrl)} style={imageStyle} />
      ) : fallbackSource ? (
        <Image source={fallbackSource} style={[styles.avatarImage, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]} />
      ) : (
        <View style={[styles.avatarFallback, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
          <Text style={[styles.avatarFallbackText, compressed ? styles.avatarFallbackTextCompressed : null]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

function OwnPinMarker({ pin }: { pin: NativeMapOwnPin }) {
  return (
    <AvatarMarker
      avatarUrl={pin.avatar_url}
      borderColor={huddleMap.marker.ownPin}
      fallbackName={pin.display_name || "Me"}
      invisible={pin.is_invisible}
    />
  );
}

function FriendPinMarker({ friend, compressed }: { friend: NativeMapFriendPin; compressed: boolean }) {
  const bucket = normalizeNativeGenderBucket(friend.gender_genre);
  const maskedAsset = pickNativeMaskedAvatarAsset(bucket, `${friend.id}:${friend.location_pinned_until || "unpinned"}:${bucket}${compressed ? ":compressed" : ""}`);
  return (
    <AvatarMarker
      avatarUrl={friend.is_invisible || compressed ? null : friend.avatar_url}
      borderColor={friend.is_verified ? huddleMap.marker.friendVerified : huddleMap.marker.friendUnverified}
      compressed={compressed}
      fallbackName={friend.display_name || "Friend"}
      fallbackSource={friend.is_invisible || compressed ? maskedAsset : null}
      invisible={false}
      invisibleFill={friend.is_verified ? huddleMap.marker.friendCompressedVerified : huddleMap.marker.friendCompressedUnverified}
    />
  );
}

function FriendGroupMarker({ asset, count }: { asset: ImageSourcePropType | null; count: number }) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <View style={styles.friendGroupMarker}>
      {asset ? (
        <Image source={asset} style={styles.friendGroupImage} />
      ) : (
        <Text style={styles.friendGroupCount}>{label}</Text>
      )}
      <View style={styles.friendGroupBadge}>
        <Text style={styles.friendGroupBadgeText}>{label}</Text>
      </View>
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

export function NativeMapScreen({ bottomNavVisible = true, onBottomSheetOpenChange, onNavigate, search = "", userId = null }: NativeMapScreenProps) {
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const mapViewRef = useRef<Mapbox.MapView | null>(null);
  const cameraRef = useRef<Mapbox.Camera | null>(null);
  const { t } = useLanguage();
  const tokenConfig = useMemo(() => readNativeMapTokenConfig(), []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [alerts, setAlerts] = useState<NativeMapAlert[]>([]);
  const [hiddenAlertIds, setHiddenAlertIds] = useState<Set<string>>(new Set());
  const [selectedAlert, setSelectedAlert] = useState<NativeMapAlert | null>(null);
  const [friends, setFriends] = useState<NativeMapFriendPin[]>([]);
  const [ownPin, setOwnPin] = useState<NativeMapOwnPin | null>(null);
  const [centerCoordinate, setCenterCoordinate] = useState<[number, number]>(NATIVE_MAP_DEFAULT_CENTER);
  const [currentZoom, setCurrentZoom] = useState(NATIVE_MAP_DEFAULT_ZOOM);
  const [cameraZoom, setCameraZoom] = useState(NATIVE_MAP_DEFAULT_ZOOM);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showFriends, setShowFriends] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionState, setPermissionState] = useState<NativeLocationPermissionState>("unknown");
  const [permissionDetail, setPermissionDetail] = useState<NativeLocationPermissionDetail>({ canAskAgain: true, state: "unknown" });
  const [locationLoading, setLocationLoading] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [showGpsModal, setShowGpsModal] = useState(false);
  const [showUnpinConfirm, setShowUnpinConfirm] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [isPickingBroadcastLocation, setIsPickingBroadcastLocation] = useState(false);
  const [broadcastPreviewPin, setBroadcastPreviewPin] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPreviewAddress, setBroadcastPreviewAddress] = useState<string | null>(null);
  const [broadcastPinningCenter, setBroadcastPinningCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [broadcastPinningAddress, setBroadcastPinningAddress] = useState<string | null>(null);
  const [broadcastPinningDistanceKm, setBroadcastPinningDistanceKm] = useState(0);
  const [broadcastPinningLoading, setBroadcastPinningLoading] = useState(false);
  const [broadcastManualQuery, setBroadcastManualQuery] = useState("");
  const [broadcastManualSearching, setBroadcastManualSearching] = useState(false);
  const [broadcastShowManualSearch, setBroadcastShowManualSearch] = useState(false);
  const [broadcastDropConfirmation, setBroadcastDropConfirmation] = useState(false);
  const [broadcastDropPoint, setBroadcastDropPoint] = useState<{ x: number; y: number } | null>(null);
  const [draftBroadcastType, setDraftBroadcastType] = useState<"Stray" | "Lost" | "Caution" | "Others">("Stray");
  const [mapRestricted, setMapRestricted] = useState(false);
  const [mapRestrictionModalOpen, setMapRestrictionModalOpen] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [alertFocus, setAlertFocus] = useState<{ key: string; source: "alert" | "thread"; modalOnly: boolean } | null>(null);

  useEffect(() => {
    const open = selectedAlert !== null || broadcastOpen || mapRestrictionModalOpen || profileModalUserId !== null || showGpsModal || showUnpinConfirm;
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [broadcastOpen, mapRestrictionModalOpen, onBottomSheetOpenChange, profileModalUserId, selectedAlert, showGpsModal, showUnpinConfirm]);

  useEffect(() => {
    if (!selectedAlert) return;
    const hydrated = alerts.find((alert) => alert.id === selectedAlert.id);
    if (!hydrated || hydrated === selectedAlert) return;
    setSelectedAlert(hydrated);
  }, [alerts, selectedAlert]);
  const [alertFocusRetries, setAlertFocusRetries] = useState(0);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const broadcastDropAnim = useRef(new Animated.Value(0)).current;
  const statusPillAnim = useRef(new Animated.Value(0)).current;
  const offlineBannerAnim = useRef(new Animated.Value(0)).current;
  const broadcastAddressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerCoordinateRef = useRef<[number, number]>(NATIVE_MAP_DEFAULT_CENTER);
  const cameraZoomRef = useRef(NATIVE_MAP_DEFAULT_ZOOM);
  const renderedZoomRef = useRef(NATIVE_MAP_DEFAULT_ZOOM);
  const mapDataInFlightRef = useRef<Promise<void> | null>(null);
  const initialMapLoadKeyRef = useRef<string | null>(null);
  const activePinGpsCheckKeyRef = useRef<string | null>(null);
  const permissionStateRef = useRef<NativeLocationPermissionState>("unknown");
  const effectiveUserId = sessionUserId ?? userId;

  const alertsCacheKey = useMemo(() => (effectiveUserId ? `huddle:native-map-alerts:${effectiveUserId}` : null), [effectiveUserId]);
  const friendPinsCacheKey = useMemo(() => (effectiveUserId ? `huddle:native-friend-pins-session:${effectiveUserId}` : null), [effectiveUserId]);
  const applyCamera = useCallback((center: [number, number], zoom?: number, persist = true, duration?: number, padding?: Mapbox.CameraPadding) => {
    void persist;
    centerCoordinateRef.current = center;
    setCenterCoordinate(center);
    if (typeof zoom === "number" && Number.isFinite(zoom)) {
      cameraZoomRef.current = zoom;
      renderedZoomRef.current = zoom;
      setCurrentZoom(zoom);
      setCameraZoom(zoom);
    }
    cameraRef.current?.setCamera({
      animationDuration: duration ?? huddleMotion.durations.enter,
      centerCoordinate: center,
      zoomLevel: typeof zoom === "number" && Number.isFinite(zoom) ? zoom : cameraZoomRef.current,
      ...(padding ? { padding } : {}),
    });
  }, []);

  const readCachedAlerts = useCallback(async () => {
    if (!alertsCacheKey) return [];
    try {
      const raw = await AsyncStorage.getItem(alertsCacheKey);
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

  const loadMapData = useCallback(async (options?: { useCameraCenter?: boolean }) => {
    if (mapDataInFlightRef.current) return mapDataInFlightRef.current;
    const promise = (async () => {
    if (!effectiveUserId) {
      setAlerts([]);
      setFriends([]);
      setOwnPin(null);
      applyCamera(NATIVE_MAP_DEFAULT_CENTER, NATIVE_MAP_DEFAULT_ZOOM, false);
      return;
    }
    const result = await fetchNativeMapReadOnlyData(
      effectiveUserId,
      options?.useCameraCenter ? centerCoordinateRef.current : null,
    );
    const mergedAlerts = await mergeAlertsWithExpiredCache(result.alerts);
    setAlerts(mergedAlerts);
    setFriends(result.friends);
    setOwnPin(result.ownPin);
    applyCamera(result.center, cameraZoomRef.current, false);
    void writeCachedAlerts(mergedAlerts);
    if (friendPinsCacheKey) {
      try {
        await AsyncStorage.setItem(friendPinsCacheKey, JSON.stringify(result.friends));
      } catch {
        // best-effort cache only
      }
    }
    })().finally(() => {
      mapDataInFlightRef.current = null;
    });
    mapDataInFlightRef.current = promise;
    return promise;
  }, [applyCamera, effectiveUserId, friendPinsCacheKey, mergeAlertsWithExpiredCache, writeCachedAlerts]);
  const loadMapDataRef = useRef(loadMapData);

  useEffect(() => {
    loadMapDataRef.current = loadMapData;
  }, [loadMapData]);

  useEffect(() => {
    if (!tokenConfig.ok) return;
    Mapbox.setAccessToken(tokenConfig.token);
  }, [tokenConfig]);

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
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setSessionUserId(data.user?.id ?? null);
    }).catch(() => {
      if (active) setSessionUserId(null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
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
    setBroadcastPinningDistanceKm(distanceKmBetween(deviceLocation, broadcastPinningCenter));
    setBroadcastPinningLoading(true);
    setBroadcastShowManualSearch(false);
    if (broadcastAddressDebounceRef.current) clearTimeout(broadcastAddressDebounceRef.current);
    broadcastAddressDebounceRef.current = setTimeout(() => {
      void lookupNativeMapAddress(broadcastPinningCenter.lat, broadcastPinningCenter.lng)
        .then((address) => {
          setBroadcastPinningAddress(address || null);
          setBroadcastShowManualSearch(!address);
        })
        .catch(() => {
          setBroadcastPinningAddress(null);
          setBroadcastShowManualSearch(true);
        })
        .finally(() => setBroadcastPinningLoading(false));
    }, 400);
    return () => {
      if (broadcastAddressDebounceRef.current) clearTimeout(broadcastAddressDebounceRef.current);
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
    const channel = effectiveUserId
      ? supabase
          .channel(`native-map-restrictions:${effectiveUserId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "user_moderation_restrictions", filter: `user_id=eq.${effectiveUserId}` }, syncRestrictions)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_moderation", filter: `user_id=eq.${effectiveUserId}` }, syncRestrictions)
          .subscribe()
      : null;
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [effectiveUserId]);

  useEffect(() => {
    let active = true;
    const syncPermissionAndLocation = async () => {
      try {
        const detail = await getNativeForegroundLocationPermissionDetail();
        if (!active) return;
        setPermissionDetail(detail);
        setPermissionState(detail.state);
        if (detail.state !== "granted") {
          setDeviceLocation(null);
          return;
        }
        const coords = await getNativeCurrentCoordinates();
        if (!active) return;
        setDeviceLocation(coords);
      } catch {
        if (active) setDeviceLocation(null);
      }
    };
    void syncPermissionAndLocation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
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
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const loadKey = effectiveUserId ?? "anonymous";
    if (initialMapLoadKeyRef.current === loadKey) return;
    initialMapLoadKeyRef.current = loadKey;
    let active = true;
    setDataLoading(true);
    if (friendPinsCacheKey) {
      void AsyncStorage.getItem(friendPinsCacheKey).then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setFriends(parsed as NativeMapFriendPin[]);
        } catch {
          void AsyncStorage.removeItem(friendPinsCacheKey);
        }
      });
    }
    void readCachedAlerts().then((cached) => {
      if (active && cached.length > 0) setAlerts(cached);
    });
    void loadMapDataRef.current()
      .catch(() => {
        if (!active) return;
        void readCachedAlerts().then((cached) => {
          if (active && cached.length > 0) setAlerts(cached);
        });
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [effectiveUserId, friendPinsCacheKey, readCachedAlerts]);

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
      setBroadcastShowManualSearch(false);
      setIsPickingBroadcastLocation(true);
    }
    const alertParam = params.get("alert");
    const threadParam = params.get("thread");
    const modalOnly = params.get("modal") === "1";
    const focusId = alertParam || threadParam;
    setAlertFocus(focusId && focusId.trim() ? { key: focusId.trim(), source: alertParam ? "alert" : "thread", modalOnly } : null);
    setAlertFocusRetries(0);
  }, [search]);

  useEffect(() => {
    const focus = alertFocus;
    const focusId = focus?.key ?? null;
    if (!focus || !focusId || !effectiveUserId) return undefined;
    const focusSource = focus.source;
    const match = alerts.find((alert) => alert.id === focusId || alert.thread_id === focusId || alert.social_post_id === focusId);
    if (match) {
      setShowAlerts(true);
      applyCamera([match.longitude, match.latitude], 15.5);
      setSelectedAlert(match);
      setAlertFocus(null);
      return;
    }
    const timer = setTimeout(() => {
      void fetchNativeMapAlertById(focusId, effectiveUserId, { source: focusSource }).then(async (alert) => {
      if (!alert) {
        if (alertFocusRetries >= 5) {
          setStatusMessage("That alert is no longer available.");
          setAlertFocus(null);
          return;
        }
        setAlertFocusRetries((value) => value + 1);
        if (alertFocusRetries % 2 === 1) await loadMapDataRef.current().catch(() => undefined);
        return;
      }
      setAlerts((current) => current.some((item) => item.id === alert.id) ? current : [alert, ...current]);
      setShowAlerts(true);
      applyCamera([alert.longitude, alert.latitude], 15.5);
      setSelectedAlert(alert);
      setAlertFocus(null);
    });
    }, alertFocusRetries === 0 ? 0 : 800);
    return () => clearTimeout(timer);
  }, [alertFocus, alertFocusRetries, alerts, applyCamera, effectiveUserId]);

  useEffect(() => {
    if (!ownPin || !effectiveUserId || permissionState !== "granted") return;
    const checkKey = `${effectiveUserId}:${ownPin.lat.toFixed(5)}:${ownPin.lng.toFixed(5)}`;
    if (activePinGpsCheckKeyRef.current === checkKey) return;
    activePinGpsCheckKeyRef.current = checkKey;
    let active = true;
    void (async () => {
      const coords = await getNativeCurrentCoordinates();
      if (!active || !coords || !effectiveUserId) return;
      const movedKm = distanceKmBetween({ lat: ownPin.lat, lng: ownPin.lng }, coords);
      if (movedKm < SIGNIFICANT_PIN_MOVE_KM) {
        setDeviceLocation(coords);
        return;
      }
      const address = await lookupNativeMapAddress(coords.lat, coords.lng);
      await pinNativeUserLocation(effectiveUserId, coords.lat, coords.lng, address);
      setDeviceLocation(coords);
      await loadMapDataRef.current();
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [effectiveUserId, ownPin, permissionState]);

  const refreshReadOnlyData = () => {
    if (!effectiveUserId || dataLoading || refreshing) return;
    let active = true;
    setRefreshing(true);
    void loadMapData({ useCameraCenter: true })
      .catch(() => {
        if (!active) return;
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  };

  const handleLocationPress = async () => {
    if (locationLoading) return;
    if (permissionState === "denied" && !permissionDetail.canAskAgain) {
      setShowGpsModal(true);
      return;
    }
    setLocationLoading(true);
    try {
      const nextPermission = permissionState === "granted"
        ? { canAskAgain: permissionDetail.canAskAgain, state: "granted" as const }
        : await requestNativeForegroundLocationPermissionDetail();
      setPermissionDetail(nextPermission);
      setPermissionState(nextPermission.state);
      if (nextPermission.state !== "granted") {
        setDeviceLocation(null);
        if (!nextPermission.canAskAgain) setShowGpsModal(true);
        return;
      }
      const coords = await getNativeCurrentCoordinates();
      setDeviceLocation(coords);
      if (coords) applyCamera([coords.lng, coords.lat], 15.5);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleZoomChange = (delta: number) => {
    const nextZoom = Math.max(2, Math.min(20, cameraZoomRef.current + delta));
    applyCamera(centerCoordinateRef.current, nextZoom);
  };

  const startBroadcastPinning = () => {
    const currentCenter = centerCoordinateRef.current;
    const nextCenter = { lat: currentCenter[1], lng: currentCenter[0] };
    setBroadcastOpen(false);
    setBroadcastPreviewPin(null);
    setBroadcastPreviewAddress(null);
    setBroadcastPinningCenter(nextCenter);
    setBroadcastPinningAddress(null);
    setBroadcastPinningDistanceKm(distanceKmBetween(deviceLocation, nextCenter));
    setBroadcastManualQuery("");
    setBroadcastShowManualSearch(false);
    setIsPickingBroadcastLocation(true);
  };

  const cancelBroadcastPinning = () => {
    setIsPickingBroadcastLocation(false);
    setBroadcastPinningCenter(null);
    setBroadcastPinningAddress(null);
    setBroadcastPinningDistanceKm(0);
    setBroadcastManualQuery("");
    setBroadcastShowManualSearch(false);
    setBroadcastPreviewPin(null);
    setBroadcastPreviewAddress(null);
    setBroadcastDropConfirmation(false);
  };

  const confirmBroadcastPinning = () => {
    const currentCenter = centerCoordinateRef.current;
    const center = broadcastPinningCenter ?? { lat: currentCenter[1], lng: currentCenter[0] };
    setBroadcastPreviewPin(center);
    setBroadcastPreviewAddress(broadcastPinningAddress);
    setIsPickingBroadcastLocation(false);
    setBroadcastPinningCenter(null);
    setBroadcastPinningAddress(null);
    setBroadcastShowManualSearch(false);
    setBroadcastManualQuery("");
    setBroadcastDropPoint({ x: windowSize.width / 2, y: windowSize.height / 2 });
    setBroadcastDropConfirmation(true);
    setTimeout(() => {
      setBroadcastDropConfirmation(false);
      setBroadcastOpen(true);
    }, 900);
  };

  const searchBroadcastManualLocation = async () => {
    const query = broadcastManualQuery.trim();
    if (!query || broadcastManualSearching) return;
    setBroadcastManualSearching(true);
    try {
      const result = await lookupNativeMapQueryCenter(query);
      if (!result) {
        setBroadcastShowManualSearch(true);
        return;
      }
      const nextCenter = { lat: result.lat, lng: result.lng };
      setBroadcastPinningCenter(nextCenter);
      setBroadcastPinningAddress(query);
      setBroadcastShowManualSearch(false);
      applyCamera([result.lng, result.lat], Math.max(cameraZoomRef.current, 14));
    } finally {
      setBroadcastManualSearching(false);
    }
  };

  const requestPinFromLiveGps = async () => {
    if (!effectiveUserId || pinning) return;
    if (permissionState === "denied" && !permissionDetail.canAskAgain) {
      setShowGpsModal(true);
      return;
    }
    setPinning(true);
    setStatusMessage(null);
    try {
      const nextPermission = permissionState === "granted"
        ? { canAskAgain: permissionDetail.canAskAgain, state: "granted" as const }
        : await requestNativeForegroundLocationPermissionDetail();
      setPermissionDetail(nextPermission);
      setPermissionState(nextPermission.state);
      if (nextPermission.state !== "granted") {
        if (!nextPermission.canAskAgain) setShowGpsModal(true);
        return;
      }
      const coords = await getNativeCurrentCoordinates();
      if (!coords) {
        setShowGpsModal(true);
        return;
      }
      const address = await lookupNativeMapAddress(coords.lat, coords.lng);
      await pinNativeUserLocation(effectiveUserId, coords.lat, coords.lng, address);
      setDeviceLocation(coords);
      applyCamera([coords.lng, coords.lat], 15.5);
      setStatusMessage("Location pinned (GPS)");
      await loadMapData();
    } catch {
      setStatusMessage("Failed to pin location");
    } finally {
      setPinning(false);
    }
  };

  const confirmUnpinLocation = async () => {
    if (!effectiveUserId || pinning) return;
    setShowUnpinConfirm(false);
    setPinning(true);
    setStatusMessage(null);
    try {
      await clearNativeUserLocationPin(effectiveUserId);
      setOwnPin(null);
      setFriends([]);
      setStatusMessage("Unpinned");
      await loadMapData();
    } catch {
      setStatusMessage("Failed to unpin location");
    } finally {
      setPinning(false);
    }
  };

  const handlePinToggle = () => {
    if (!effectiveUserId) {
      setStatusMessage("Please login to pin location");
      return;
    }
    if (ownPin) {
      setShowUnpinConfirm(true);
      return;
    }
    void requestPinFromLiveGps();
  };

  const toggleInvisible = async () => {
    if (!effectiveUserId || !ownPin || privacySaving) return;
    const nextInvisible = !ownPin.is_invisible;
    setOwnPin({ ...ownPin, is_invisible: nextInvisible });
    setPrivacySaving(true);
    setStatusMessage(nextInvisible ? "Masked as Incognito" : "Incognito disabled");
    try {
      await setNativeMapInvisible(effectiveUserId, nextInvisible);
      await loadMapData();
    } catch {
      setOwnPin({ ...ownPin, is_invisible: !nextInvisible });
      setStatusMessage(nextInvisible ? "Failed to enable incognito" : "Failed to disable incognito");
    } finally {
      setPrivacySaving(false);
    }
  };

  const bottomClearance = bottomNavVisible
    ? huddleLayout.navHeight + Math.max(huddleSpacing.x2, insets.bottom + huddleSpacing.x2) + huddleSpacing.x6
    : huddleSpacing.x5 + insets.bottom;
  const zoomBottomClearance = bottomNavVisible
    ? bottomClearance
    : huddleSpacing.x5 + insets.bottom;
  const isCompressedMode = currentZoom <= COMPRESSED_MODE_ENTER_ZOOM;
  const friendRenderItems = useMemo(() => buildFriendRenderItems(showFriends ? friends : [], currentZoom), [friends, showFriends, currentZoom]);
  const visibleAlerts = useMemo(() => (showAlerts ? alerts.filter((alert) => !hiddenAlertIds.has(alert.id)) : []), [alerts, hiddenAlertIds, showAlerts]);
  const unpinnedHint = useMemo(() => {
    if (isPickingBroadcastLocation || ownPin) return null;
    if (showAlerts && showFriends) return t("Pin location to see happenings and friends nearby.");
    if (showAlerts) return t("Pin location to see accurate happenings nearby.");
    if (showFriends) return t("Pin location to see friends nearby.");
    return null;
  }, [isPickingBroadcastLocation, ownPin, showAlerts, showFriends, t]);
  if (!tokenConfig.ok) {
    return (
      <NativeMapErrorState
        body={t("Mapbox is not configured for this native build. Add EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN or EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN and restart the app.")}
        title={t("Map unavailable")}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        ref={mapViewRef}
        attributionEnabled={false}
        compassEnabled={false}
        logoEnabled={false}
        onDidFinishLoadingMap={() => {
          setMapLoaded(true);
          setLoadError(null);
        }}
        onMapLoadingError={() => {
          setLoadError("Mapbox failed to load.");
          setMapLoaded(false);
        }}
        onCameraChanged={(state) => {
          const zoom = state.properties?.zoom;
          if (typeof zoom === "number" && Number.isFinite(zoom)) {
            cameraZoomRef.current = zoom;
            if (Math.abs(zoom - renderedZoomRef.current) >= 0.08) {
              renderedZoomRef.current = zoom;
              setCurrentZoom(zoom);
            }
          }
          const center = state.properties?.center;
          if (Array.isArray(center) && typeof center[0] === "number" && typeof center[1] === "number" && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
            const nextCenter: [number, number] = [center[0], center[1]];
            centerCoordinateRef.current = nextCenter;
            if (isPickingBroadcastLocation) {
              setBroadcastPinningCenter({ lng: center[0], lat: center[1] });
            }
          }
        }}
        onPress={(event) => {
          if (!isPickingBroadcastLocation) return;
          const geometry = (event as { geometry?: { coordinates?: unknown } })?.geometry;
          const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : null;
          if (typeof coordinates?.[0] !== "number" || typeof coordinates?.[1] !== "number") return;
          const next = { lng: coordinates[0], lat: coordinates[1] };
          setBroadcastPreviewPin(next);
          void lookupNativeMapAddress(next.lat, next.lng).then((address) => {
            setBroadcastPreviewAddress(address || null);
          });
          setIsPickingBroadcastLocation(false);
          setBroadcastPinningCenter(null);
          setBroadcastPinningAddress(null);
          setBroadcastOpen(true);
        }}
        scaleBarEnabled={false}
        scrollEnabled={!broadcastOpen}
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        zoomEnabled={!broadcastOpen}
      >
        <Mapbox.Camera
          ref={cameraRef}
          animationDuration={0}
          centerCoordinate={centerCoordinate}
          zoomLevel={cameraZoom}
        />
        {ownPin && !isPickingBroadcastLocation ? (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={[ownPin.lng, ownPin.lat]}
          >
            <Pressable accessibilityLabel="Open my profile" accessibilityRole="button" onPress={() => setProfileModalUserId(effectiveUserId)}>
              <OwnPinMarker pin={ownPin} />
            </Pressable>
          </Mapbox.MarkerView>
        ) : null}
        {!isPickingBroadcastLocation && friendRenderItems.map((item) => item.type === "group" ? (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={item.coordinate}
            key={`friend-group:${item.id}`}
          >
            <FriendGroupMarker asset={item.asset} count={item.count} />
          </Mapbox.MarkerView>
        ) : (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 1 }}
            coordinate={[item.friend.last_lng, item.friend.last_lat]}
            key={`friend:${item.friend.id}`}
          >
            <Pressable accessibilityLabel={`Open ${item.friend.display_name || "friend"} profile`} accessibilityRole="button" onPress={() => setProfileModalUserId(item.friend.id)}>
              <FriendPinMarker compressed={isCompressedMode} friend={item.friend} />
            </Pressable>
          </Mapbox.MarkerView>
        ))}
        {!isPickingBroadcastLocation && visibleAlerts.map((alert) => (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 1 }}
            coordinate={[alert.longitude, alert.latitude]}
            key={`alert:${alert.id}`}
          >
            <Pressable
              accessibilityLabel={alert.title || "Open alert"}
              accessibilityRole="button"
              hitSlop={huddleSpacing.x2}
              onPress={() => {
                haptic.toggleControl();
                setSelectedAlert(alert);
                applyCamera(
                  [alert.longitude, alert.latitude],
                  Math.max(cameraZoomRef.current, 14),
                  true,
                  huddleMotion.durations.navigate,
                  { paddingBottom: 136, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
                );
              }}
              style={styles.alertHitTarget}
            >
              <NativeAlertMarker alert={alert} selected={selectedAlert?.id === alert.id} />
            </Pressable>
          </Mapbox.MarkerView>
        ))}
      </Mapbox.MapView>

      <View pointerEvents="box-none" style={[styles.topControlsWrap, { top: insets.top + huddleSpacing.x3 }]}>
        <View pointerEvents="box-none" style={styles.topControlsInner}>
          <View style={styles.toggleGroup}>
            <BlurView blurAmount={16} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
            <MapControlButton
              accessibilityLabel="Alerts"
              active={showAlerts}
              icon="bell"
              onPress={() => setShowAlerts((value) => !value)}
            />
            <MapControlButton
              accessibilityLabel="Friends"
              active={showFriends}
              icon="users"
              onPress={() => setShowFriends((value) => !value)}
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
                accessibilityLabel={ownPin.is_invisible ? "Incognito enabled" : "Incognito disabled"}
                loading={privacySaving}
                icon={ownPin.is_invisible ? "eye-off" : "eye"}
                onPress={() => void toggleInvisible()}
              />
            ) : null}
            <MapControlButton
              accessibilityLabel={ownPin ? "Pinned (tap to unpin)" : "Pin my location"}
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
            { top: insets.top + huddleSpacing.x3 + huddleLayout.minTouch + huddleSpacing.x3 },
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
              alert={{
                alert_type: draftBroadcastType,
                id: "broadcast-center-preview",
                latitude: broadcastPinningCenter?.lat ?? centerCoordinate[1],
                longitude: broadcastPinningCenter?.lng ?? centerCoordinate[0],
                marker_state: "active",
                title: draftBroadcastType,
              } as NativeMapAlert}
            />
          </View>
          <View style={[styles.pinningAddressWrap, { top: insets.top + huddleSpacing.x3 + huddleLayout.minTouch + huddleSpacing.x3 }]}>
            {broadcastShowManualSearch ? (
              <View style={styles.manualAddressCard}>
                <Text style={styles.manualAddressHelper}>Address lookup timed out. Type an address manually:</Text>
                <View style={styles.manualAddressRow}>
                  <TextInput
                    accessibilityLabel="Manual alert address"
                    autoCapitalize="words"
                    onChangeText={setBroadcastManualQuery}
                    onSubmitEditing={() => void searchBroadcastManualLocation()}
                    placeholder="e.g. Central, Hong Kong"
                    placeholderTextColor={huddleColors.mutedText}
                    returnKeyType="search"
                    style={styles.manualAddressInput}
                    value={broadcastManualQuery}
                  />
                  <Pressable
                    accessibilityLabel="Search address"
                    accessibilityRole="button"
                    disabled={broadcastManualSearching || !broadcastManualQuery.trim()}
                    onPress={() => void searchBroadcastManualLocation()}
                    style={[styles.manualAddressButton, broadcastManualSearching || !broadcastManualQuery.trim() ? styles.manualAddressButtonDisabled : null]}
                  >
                    {broadcastManualSearching ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Feather color={huddleColors.onPrimary} name="search" size={16} />}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View pointerEvents="none" style={styles.pinningAddressCard}>
                <View style={styles.pinningAddressTextWrap}>
                  <Text numberOfLines={1} style={styles.pinningAddressText}>
                    {broadcastPinningAddress || t("Move map to select location")}
                  </Text>
                </View>
                {deviceLocation && broadcastPinningDistanceKm > 0 ? (
                  <Text style={styles.pinningDistanceText}>{broadcastPinningDistanceKm} km</Text>
                ) : null}
              </View>
            )}
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

      <View pointerEvents="box-none" style={[styles.broadcastButtonWrap, { bottom: bottomClearance }]}>
        <MapControlButton
          accessibilityLabel="Broadcast"
          icon="edit-3"
              onPress={() => {
                if (mapRestricted) {
                  setMapRestrictionModalOpen(true);
                  return;
                }
                setBroadcastOpen(true);
          }}
          size={56}
          style={styles.broadcastButton}
        />
      </View>

      <View pointerEvents="box-none" style={[styles.zoomControlStack, { bottom: zoomBottomClearance }]}>
        <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" onPress={() => { haptic.toggleControl(); handleZoomChange(1); }} style={styles.zoomButton}>
          <Feather color={huddleColors.text} name="plus" size={22} />
        </Pressable>
        <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" onPress={() => { haptic.toggleControl(); handleZoomChange(-1); }} style={[styles.zoomButton, styles.zoomButtonMiddle]}>
          <Feather color={huddleColors.text} name="minus" size={22} />
        </Pressable>
        <Pressable accessibilityLabel="Recenter" accessibilityRole="button" onPress={() => { haptic.toggleControl(); void handleLocationPress(); }} style={styles.zoomButton}>
          {locationLoading ? <ActivityIndicator color={huddleColors.text} size="small" /> : <Feather color={huddleColors.text} name="navigation" size={16} />}
        </Pressable>
      </View>

      {(!mapLoaded || dataLoading) && !loadError ? (
        <NativeLoadingState variant="overlay" />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.offlineBanner,
          { top: insets.top },
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

      {mapLoaded && statusMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.statusPill,
            { top: insets.top + huddleSpacing.x3 + huddleLayout.minTouch + huddleSpacing.x2, right: huddleSpacing.x4 },
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
                    outputRange: [insets.top + huddleSpacing.x10, Math.max(insets.top + huddleSpacing.x10, broadcastDropPoint.y - BROADCAST_DROP_MARKER_HEIGHT - huddleSpacing.x4), broadcastDropPoint.y - BROADCAST_DROP_MARKER_HEIGHT],
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
            alert={{
              alert_type: draftBroadcastType,
              id: "broadcast-preview-flying",
              latitude: broadcastPreviewPin?.lat ?? 0,
              longitude: broadcastPreviewPin?.lng ?? 0,
              marker_state: "active",
              title: draftBroadcastType,
            } as NativeMapAlert}
          />
        </Animated.View>
      ) : null}

      {permissionState === "denied" && mapLoaded ? (
        null
      ) : null}

      {loadError ? (
        <NativeMapErrorState
          body={loadError}
	          onRetry={() => {
	            setLoadError(null);
	            setMapLoaded(false);
	            void loadMapData();
	          }}
          onSecondaryAction={isPickingBroadcastLocation ? () => {
            const fallback = deviceLocation ?? { lat: centerCoordinateRef.current[1], lng: centerCoordinateRef.current[0] };
            setBroadcastPreviewPin(fallback);
            setBroadcastPreviewAddress(broadcastPinningAddress);
            setIsPickingBroadcastLocation(false);
            setBroadcastOpen(true);
          } : undefined}
          secondaryLabel={isPickingBroadcastLocation ? t("Use current location instead") : undefined}
          title={t("Map failed to load")}
        />
      ) : null}

      <NativeMapConfirmationModal
        icon="map-pin"
        iconColor={huddleColors.blue}
        onClose={() => setShowGpsModal(false)}
        primaryLabel={permissionDetail.canAskAgain ? "Enable Location" : "Open Huddle Settings"}
        primaryVariant="primary"
        onPrimary={async () => {
          if (permissionDetail.canAskAgain) {
            const detail = await requestNativeForegroundLocationPermissionDetail();
            setPermissionDetail(detail);
            setPermissionState(detail.state);
            if (detail.state === "granted") {
              setShowGpsModal(false);
              const coords = await getNativeCurrentCoordinates().catch(() => null);
              setDeviceLocation(coords);
              if (coords) applyCamera([coords.lng, coords.lat], 15.5);
              void loadMapData().catch(() => undefined);
              return;
            }
            if (!detail.canAskAgain) return;
            return;
          }
          await openNativeLocationSettings();
        }}
        title="Enable Location?"
        visible={showGpsModal}
      >
        <Text style={styles.modalBody}>
          {permissionDetail.canAskAgain
            ? "Huddle uses your location to show nearby friends, groups, and map alerts."
            : "Location is off for Huddle. Open Settings, tap Location, then choose While Using the App."}
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
        centerCoordinate={centerCoordinate}
        alertType={draftBroadcastType}
        mapRestricted={mapRestricted}
        onAlertTypeChange={setDraftBroadcastType}
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
        onOpenPremium={() => onNavigate?.("/premium")}
        onRequestPinLocation={() => {
          if (mapRestricted) {
            setMapRestrictionModalOpen(true);
            return;
          }
          startBroadcastPinning();
        }}
        selectedAddress={broadcastPreviewAddress}
        selectedLocation={broadcastPreviewPin}
        userId={effectiveUserId}
        visible={broadcastOpen}
      />

      <NativeMapRestrictionModal onClose={() => setMapRestrictionModalOpen(false)} visible={mapRestrictionModalOpen} />

      <NativeAlertDetailModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onHidden={(alertId) => {
          setHiddenAlertIds((current) => {
            const next = new Set(current);
            next.add(alertId);
            return next;
          });
        }}
        onOpenProfile={setProfileModalUserId}
        onOpenSocial={(threadId) => onNavigate?.(threadId ? `/social?focus=${encodeURIComponent(threadId)}` : "/social")}
        onRefresh={loadMapData}
        userId={effectiveUserId}
      />

      <NativePublicProfileModal
        onBlocked={(blockedUserId) => {
          setFriends((current) => current.filter((friend) => friend.id !== blockedUserId));
          setAlerts((current) => current.filter((alert) => alert.creator_id !== blockedUserId));
          void loadMapData();
        }}
        onClose={() => setProfileModalUserId(null)}
        onNavigate={onNavigate}
        open={Boolean(profileModalUserId)}
        userId={profileModalUserId}
      />

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
  loading = false,
  onPress,
  phaseLocked = false,
  size = 44,
  style,
  success = false,
}: {
  accessibilityLabel: string;
  active?: boolean;
  disabled?: boolean;
  icon: keyof typeof Feather.glyphMap;
  loading?: boolean;
  onPress?: () => void;
  phaseLocked?: boolean;
  size?: number;
  style?: object;
  success?: boolean;
}) {
  const foreground = success || active ? huddleColors.onPrimary : icon === "eye" ? huddleColors.blue : huddleColors.subtext;
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
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <Feather color={foreground} name={icon} size={size >= 56 ? 20 : icon === "refresh-cw" ? 16 : 20} />
      )}
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
    minHeight: 36,
    flex: 1,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 8,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 0,
    backgroundColor: huddleColors.canvas,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
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
  zoomControlStack: {
    position: "absolute",
    right: huddleSpacing.x4,
    zIndex: 1500,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: 6,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  zoomButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  zoomButtonMiddle: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: huddleColors.fieldBorder,
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
    shadowColor: huddleColors.text,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleMap.size.userPin / 2,
    backgroundColor: huddleMap.marker.friendCompressedUnverified,
    shadowColor: huddleColors.text,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  friendGroupImage: {
    width: huddleMap.size.userPin,
    height: huddleMap.size.userPin,
    borderRadius: huddleMap.size.userPin / 2,
  },
  friendGroupCount: {
    fontFamily: "Urbanist-700",
    fontSize: 10,
    lineHeight: 13,
    color: huddleMap.marker.friendBadgeText,
  },
  friendGroupBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: 7,
    backgroundColor: huddleMap.marker.friendBadgeFill,
  },
  friendGroupBadgeText: {
    fontFamily: "Urbanist-700",
    fontSize: 8,
    lineHeight: 10,
    color: huddleMap.marker.friendBadgeText,
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
