import Mapbox from "@rnmapbox/maps";
import Feather from "@expo/vector-icons/Feather";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeFormTextField } from "./NativeFormField";
import { NativeLocationPinButton } from "./NativeLocationPinButton";
import {
  NATIVE_MAP_DEFAULT_CENTER,
  readNativeMapStyleUrl,
  readNativeMapTokenConfig,
} from "../lib/nativeMapConfig";
import {
  fetchNativeLocationSuggestions,
  areNativeLocationServicesEnabled,
  getNativeCurrentCoordinates,
  getNativeForegroundLocationPermissionDetail,
  openNativeAppSettings,
  openNativeLocationSettings,
  requestNativeForegroundLocationPermissionDetail,
  reverseGeocodeNativeLocationComponents,
  subscribeNativeLocationPermissionDetail,
  type NativeLocationSuggestion,
  type NativeResolvedLocation,
} from "../lib/nativeLocation";
import { haptic } from "../lib/nativeHaptics";
import { buildNativeProfileAreaCity, resolveNativeProfileMarketCity } from "../lib/nativeProfileLocation";
import { isReduceMotionActive } from "../lib/nativeReduceMotion";
import { huddleButtons, huddleColors, huddleMap, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";

type NativeSignupLocationStepProps = {
  initialCountry?: string;
  initialCity?: string;
  initialDistrict?: string;
  errorMessage?: string;
  submitting?: boolean;
  onBack: () => void;
  onSubmit: (location: { country: string; city: string; district: string; locationName: string }) => void;
};

const IDLE_REVERSE_DEBOUNCE_MS = 550;
const SEARCH_DEBOUNCE_MS = 300;
const FALLBACK_ZOOM = 12;

export function NativeSignupLocationStep({
  initialCountry = "",
  initialCity = "",
  initialDistrict = "",
  errorMessage = "",
  submitting = false,
  onBack,
  onSubmit,
}: NativeSignupLocationStepProps) {
  const cameraRef = useRef<Mapbox.Camera | null>(null);
  const centerRef = useRef<[number, number]>(NATIVE_MAP_DEFAULT_CENTER);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseSeqRef = useRef(0);
  const searchSeqRef = useRef(0);
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const pillAnim = useRef(new Animated.Value(1)).current;
  const pinPulseAnim = useRef(new Animated.Value(1)).current;
  const radiusAnim = useRef(new Animated.Value(0)).current;
  const searchFocusedRef = useRef(false);
  const searchInputRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const tokenConfig = useMemo(() => readNativeMapTokenConfig(), []);
  const mapStyleURL = useMemo(() => readNativeMapStyleUrl() ?? Mapbox.StyleURL.Street, []);

  const [center, setCenter] = useState<[number, number]>(NATIVE_MAP_DEFAULT_CENTER);
  const [zoom, setZoom] = useState(FALLBACK_ZOOM);
  const [country, setCountry] = useState(initialCountry);
  const [city, setCity] = useState(initialCity);
  const [district, setDistrict] = useState(initialDistrict);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedAreaActive, setSelectedAreaActive] = useState(Boolean(initialCountry.trim() && initialDistrict.trim()));
  const [locationSettingsReason, setLocationSettingsReason] = useState<"permission" | "services" | null>(null);

  const areaLabel = district || country || "Move the map to set your area";
  const canContinue = Boolean(country.trim() && district.trim());
  const searchHasError = Boolean(errorMessage && !canContinue);

  useEffect(() => {
    if (tokenConfig.ok) Mapbox.setAccessToken(tokenConfig.token);
  }, [tokenConfig]);

  useEffect(() => {
    searchFocusedRef.current = searchFocused;
  }, [searchFocused]);

  useEffect(() => {
    if (isReduceMotionActive()) {
      entranceAnim.setValue(1);
      return;
    }
    Animated.timing(entranceAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entranceAnim]);

  useEffect(() => {
    if (!selectedAreaActive || isReduceMotionActive()) {
      radiusAnim.stopAnimation();
      radiusAnim.setValue(0);
      return;
    }

    radiusAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(radiusAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [radiusAnim, selectedAreaActive]);

  const applyCamera = (next: [number, number], nextZoom?: number) => {
    centerRef.current = next;
    setCenter(next);
    if (typeof nextZoom === "number") setZoom(nextZoom);
    cameraRef.current?.setCamera({
      centerCoordinate: next,
      zoomLevel: typeof nextZoom === "number" ? nextZoom : undefined,
      animationDuration: 450,
    });
  };

  const triggerSelectedAreaPulse = () => {
    setSelectedAreaActive(true);
    if (isReduceMotionActive()) return;
    pinPulseAnim.setValue(0.82);
    Animated.spring(pinPulseAnim, {
      toValue: 1,
      damping: 9,
      stiffness: 180,
      mass: 0.55,
      useNativeDriver: true,
    }).start();
  };

  const syncSearchToArea = (nextDistrict: string, nextCountry: string) => {
    const label = nextDistrict || nextCountry;
    if (label) setQuery(label);
  };

  const applyLocationPermissionDetail = useCallback(async (detail: { state: "unknown" | "granted" | "denied" }) => {
    if (detail.state !== "granted") {
      setLocationSettingsReason("permission");
      return;
    }
    setLocationSettingsReason((await areNativeLocationServicesEnabled()) ? null : "services");
  }, []);

  const refreshLocationSettingsReason = useCallback(async () => {
    await applyLocationPermissionDetail(await getNativeForegroundLocationPermissionDetail());
  }, [applyLocationPermissionDetail]);

  useEffect(() => {
    const unsubscribePermission = subscribeNativeLocationPermissionDetail((detail) => {
      void applyLocationPermissionDetail(detail);
    });
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refreshLocationSettingsReason();
    });
    return () => {
      unsubscribePermission();
      appStateSubscription.remove();
    };
  }, [applyLocationPermissionDetail, refreshLocationSettingsReason]);

  const resolveAreaFromCenter = (next: [number, number], options: { syncSearch?: boolean } = {}) => {
    const seq = reverseSeqRef.current + 1;
    reverseSeqRef.current = seq;
    setResolving(true);
    void reverseGeocodeNativeLocationComponents(next[1], next[0])
      .then((components) => {
        if (reverseSeqRef.current !== seq) return;
        if (components) {
          const nextDistrict = (components.district || components.city || components.adminArea || "").trim();
          const nextCity = resolveNativeProfileMarketCity({
            adminArea: components.adminArea,
            city: components.city,
            country: components.countryName,
            district: nextDistrict,
          });
          const nextCountry = (components.countryName || "").trim();
          if (nextDistrict) setDistrict(nextDistrict);
          if (nextCity) setCity(nextCity);
          if (nextCountry) setCountry(nextCountry);
          if (options.syncSearch && !searchFocusedRef.current) syncSearchToArea(nextDistrict, nextCountry);
          if ((nextDistrict || nextCountry) && !isReduceMotionActive()) {
            pillAnim.setValue(0.35);
            Animated.timing(pillAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
          }
          if (nextDistrict || nextCountry) triggerSelectedAreaPulse();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (reverseSeqRef.current === seq) setResolving(false);
      });
  };

  // Center on the user's location once on mount (this is the natural moment to
  // request location permission). If denied, the map stays at a default the user
  // can pan or search from.
  useEffect(() => {
    let active = true;
    void (async () => {
      setLocating(true);
      try {
        const permission = await requestNativeForegroundLocationPermissionDetail();
        if (permission.state !== "granted") {
          setLocationSettingsReason("permission");
          return;
        }
        if (!(await areNativeLocationServicesEnabled())) {
          setLocationSettingsReason("services");
          return;
        }
        setLocationSettingsReason(null);
        const coords = await getNativeCurrentCoordinates({ force: true });
        if (!active || !coords) return;
        const next: [number, number] = [coords.lng, coords.lat];
        applyCamera(next, 13);
        resolveAreaFromCenter(next, { syncSearch: true });
      } catch {
        // No location — user can pan/search.
      } finally {
        if (active) setLocating(false);
      }
    })();
    return () => {
      active = false;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleLocate = () => {
    haptic.selectTab();
    setLocating(true);
    void (async () => {
      try {
        const permission = await requestNativeForegroundLocationPermissionDetail();
        if (permission.state !== "granted") {
          setLocationSettingsReason("permission");
          return;
        }
        if (!(await areNativeLocationServicesEnabled())) {
          setLocationSettingsReason("services");
          return;
        }
        setLocationSettingsReason(null);
        const coords = await getNativeCurrentCoordinates({ force: true });
        if (!coords) return;
        const next: [number, number] = [coords.lng, coords.lat];
        applyCamera(next, 13);
        resolveAreaFromCenter(next, { syncSearch: true });
      } catch {
        // ignore
      } finally {
        setLocating(false);
      }
    })();
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSearchOpen(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    searchTimerRef.current = setTimeout(() => {
      void fetchNativeLocationSuggestions(trimmed, { biasPoint: { lat: centerRef.current[1], lng: centerRef.current[0] } })
        .then((rows) => {
          if (searchSeqRef.current === seq) setSuggestions(rows);
        })
        .catch(() => {
          if (searchSeqRef.current === seq) setSuggestions([]);
        });
    }, SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    if (!searchOpen || suggestions.length === 0) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [searchOpen, suggestions.length]);

  const handleSelectSuggestion = (item: NativeLocationSuggestion) => {
    haptic.selectTab();
    Keyboard.dismiss();
    setSearchOpen(false);
    setSuggestions([]);
    setSearchFocused(false);
    const nextDistrict = (item.district || item.label).trim();
    setQuery(nextDistrict);
    setDistrict(nextDistrict);
    setCity(resolveNativeProfileMarketCity({ city: item.city, country: item.country, district: nextDistrict, locationName: item.label }));
    setCountry(item.country);
    triggerSelectedAreaPulse();
    applyCamera([item.lng, item.lat], 13);
  };

  const handlePinResolved = (loc: NativeResolvedLocation) => {
    haptic.selectTab();
    Keyboard.dismiss();
    const nextDistrict = (loc.district || loc.label).trim();
    const nextCountry = (loc.countryName || loc.country).trim();
    const nextCity = resolveNativeProfileMarketCity({ adminArea: loc.adminArea, city: loc.city, country: nextCountry, district: nextDistrict, locationName: loc.label });
    if (nextDistrict) setDistrict(nextDistrict);
    if (nextCity) setCity(nextCity);
    if (nextCountry) setCountry(nextCountry);
    setQuery(nextDistrict || nextCountry);
    setSearchOpen(false);
    setSuggestions([]);
    setSearchFocused(false);
    triggerSelectedAreaPulse();
    applyCamera([loc.lng, loc.lat], 13);
  };

  const radiusScale = radiusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2.4, 10.2],
  });
  const radiusOpacity = radiusAnim.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0.18, 0.08, 0],
  });

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboard}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack} style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}>
            <Feather color={huddleColors.text} name="chevron-left" size={24} />
          </Pressable>
          <View />
          <View style={styles.backButton} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => { Keyboard.dismiss(); setSearchFocused(false); }}
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.scroller}
        >
          <Animated.View style={[styles.content, { opacity: entranceAnim, transform: [{ translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
            <Text style={styles.title}>Where are you based?</Text>

            <View style={styles.mapCard}>
              {tokenConfig.ok ? (
                <Mapbox.MapView
                  attributionEnabled={false}
                  compassEnabled={false}
                  logoEnabled={false}
                  scaleBarEnabled={false}
                  style={StyleSheet.absoluteFill}
                  styleURL={mapStyleURL}
                  onCameraChanged={(state) => {
                    const c = state.properties?.center;
                    if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
                      centerRef.current = [c[0], c[1]];
                    }
                  }}
                  onMapIdle={() => {
                    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                    idleTimerRef.current = setTimeout(() => {
                      haptic.selectTab();
                      resolveAreaFromCenter(centerRef.current, { syncSearch: true });
                    }, IDLE_REVERSE_DEBOUNCE_MS);
                  }}
                >
                  <Mapbox.Camera ref={cameraRef} animationDuration={0} centerCoordinate={center} zoomLevel={zoom} />
                </Mapbox.MapView>
              ) : (
                <View style={styles.mapFallback}>
                  <Text style={styles.mapFallbackText}>Search for your area below.</Text>
                </View>
              )}

              <View pointerEvents="none" style={styles.centerPinWrap}>
                {selectedAreaActive ? (
                  <Animated.View style={[styles.selectedAreaRadius, { opacity: radiusOpacity, transform: [{ scale: radiusScale }] }]} />
                ) : null}
                <Animated.View style={[styles.ownPinMarker, { transform: [{ scale: pinPulseAnim }] }]}>
                  <View style={styles.ownPinHead}>
                    <Feather color={huddleColors.onPrimary} name="map-pin" size={20} />
                  </View>
                  <View style={styles.ownPinTip} />
                </Animated.View>
              </View>

              <Animated.View pointerEvents="none" style={[styles.areaPill, { opacity: pillAnim }]}>
                {resolving ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Text numberOfLines={1} style={styles.areaPillText}>{areaLabel}</Text>}
              </Animated.View>

              <Pressable accessibilityLabel="Use my current location" accessibilityRole="button" onPress={handleLocate} style={({ pressed }) => [styles.locateButton, pressed ? styles.pressed : null]}>
                {locating ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Feather color={huddleColors.onPrimary} name="navigation" size={18} />}
              </Pressable>
            </View>

            <Text style={styles.subtitle}>Your location stays private. It’s used only to connect you with nearby pet people, communities, events, and safety alerts.</Text>

            <View style={styles.searchWrap}>
              <NativeFormTextField
                ref={searchInputRef}
                compact
                editable={!submitting}
                error={searchHasError ? errorMessage : ""}
                fieldAccessory={query ? (
                  <Pressable accessibilityLabel="Clear search" accessibilityRole="button" hitSlop={8} onPress={() => { setQuery(""); setSuggestions([]); searchInputRef.current?.focus(); }}>
                    <Feather color={huddleColors.iconMuted} name="x" size={18} />
                  </Pressable>
                ) : undefined}
                leftAccessory={(
                  <NativeLocationPinButton
                    disabled={submitting}
                    onResolved={handlePinResolved}
                    style={styles.locationFieldPin}
                  />
                )}
                label=""
                onBlur={() => {
                  setSearchFocused(false);
                  setTimeout(() => setSearchOpen(false), 140);
                }}
                onChangeText={handleQueryChange}
                onFocus={() => {
                  setSearchFocused(true);
                  setSearchOpen(true);
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
                }}
                placeholder="District / Area"
                returnKeyType="search"
                value={query}
              />
              {searchOpen && suggestions.length > 0 ? (
                <View style={styles.suggestionList}>
                  {suggestions.slice(0, 5).map((item) => (
                    <Pressable key={`${item.label}-${item.lat}-${item.lng}`} accessibilityRole="button" onPress={() => handleSelectSuggestion(item)} style={({ pressed }) => [styles.suggestionRow, pressed ? styles.pressed : null]}>
                      <Feather color={huddleColors.iconMuted} name="map-pin" size={16} />
                      <Text numberOfLines={1} style={styles.suggestionText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          {errorMessage && canContinue ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {locationSettingsReason ? (
            <Pressable
              accessibilityLabel="Enable location service"
              accessibilityRole="button"
              onPress={() => void (locationSettingsReason === "services" ? openNativeLocationSettings() : openNativeAppSettings())}
              style={({ pressed }) => [styles.enableLocationButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.enableLocationLabel}>Enable location service</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Continue"
            accessibilityRole="button"
            disabled={!canContinue || submitting}
            onPress={() => {
              const marketCity = resolveNativeProfileMarketCity({ city, country, district });
              onSubmit({
                country: country.trim(),
                city: marketCity,
                district: district.trim(),
                locationName: buildNativeProfileAreaCity(district, marketCity, country),
              });
            }}
            style={({ pressed }) => [styles.continueButton, !canContinue || submitting ? styles.continueButtonDisabled : null, pressed && canContinue && !submitting ? styles.pressed : null]}
          >
            <Text style={[styles.continueLabel, !canContinue || submitting ? styles.continueLabelDisabled : null]}>{submitting ? "Saving..." : "Continue"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  keyboard: {
    flex: 1,
  },
  scroller: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x2,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: huddleSpacing.x10,
  },
  content: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x10,
    paddingBottom: huddleSpacing.x4,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h1,
    lineHeight: huddleType.h1Line,
    color: huddleColors.text,
  },
  subtitle: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.subtext,
  },
  mapCard: {
    marginTop: huddleSpacing.x5,
    height: 300,
    borderRadius: huddleRadii.glass,
    overflow: "hidden",
    backgroundColor: huddleColors.mutedCanvas,
    ...huddleShadows.glassElevation1,
    zIndex: 0,
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mapFallbackText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.mutedText,
  },
  centerPinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 28,
  },
  selectedAreaRadius: {
    position: "absolute",
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    borderRadius: huddleMap.size.alertActive / 2,
    backgroundColor: huddleMap.marker.ownPin,
  },
  ownPinMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  ownPinHead: {
    width: huddleMap.size.alertActive,
    height: huddleMap.size.alertActive,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleMap.size.alertActive / 2,
    backgroundColor: huddleMap.marker.ownPin,
    shadowColor: huddleMap.marker.ownPin,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  ownPinTip: {
    width: 0,
    height: 0,
    marginTop: -3,
    borderLeftWidth: huddleMap.size.alertTipWidth,
    borderRightWidth: huddleMap.size.alertTipWidth,
    borderTopWidth: huddleMap.size.alertTipHeight,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: huddleMap.marker.ownPin,
  },
  areaPill: {
    position: "absolute",
    top: huddleSpacing.x3,
    alignSelf: "center",
    maxWidth: "80%",
    minHeight: 34,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.profileHeroScrimStart,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
  },
  areaPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.onPrimary,
  },
  locateButton: {
    position: "absolute",
    right: huddleSpacing.x3,
    bottom: huddleSpacing.x3,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
    ...huddleShadows.glassElevation2,
  },
  searchWrap: {
    marginTop: huddleSpacing.x3,
    zIndex: 20,
    elevation: 20,
  },
  locationFieldPin: {
    marginLeft: -huddleSpacing.x2,
    marginRight: -huddleSpacing.x1,
  },
  suggestionList: {
    marginTop: huddleSpacing.x2,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
  },
  suggestionText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    color: huddleColors.text,
  },
  searchErrorText: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
  },
  footer: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
  },
  errorText: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
    textAlign: "center",
  },
  enableLocationButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    marginBottom: huddleSpacing.x3,
  },
  enableLocationLabel: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  continueButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    marginBottom: huddleSpacing.x4,
  },
  continueButtonDisabled: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  continueLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  continueLabelDisabled: {
    color: huddleColors.mutedText,
  },
  pressed: {
    opacity: 0.8,
  },
});
