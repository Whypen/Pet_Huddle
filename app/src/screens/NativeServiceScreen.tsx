import { Feather, FontAwesome } from "@expo/vector-icons";
import type { MutableRefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeEngagementSparkle } from "../components/NativeProfileAvatar";
import { NativeRatingBadge } from "../components/NativeRatingBadge";
import { NativeCarerCardSkeleton } from "../components/NativeShimmerSkeleton";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativeServiceProfileImage } from "../components/service/NativeServiceProfileImage";
import profilePlaceholder from "../../assets/ProfilePlaceholder.png";
import { AppBottomSheet, AppBottomSheetHeader, AppConfirmModal, AppModalActionRow, AppModalButton, AppModalCloseButton, AppModalIconButton } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { haptic } from "../lib/nativeHaptics";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { useNavMinimizeOnScroll } from "../lib/nativeNavScroll";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import {
  invalidateNativeChatReadCaches,
  markNativeServiceTabHasDialogues,
} from "../lib/nativeChat";
import {
  DEFAULT_NATIVE_SERVICE_FILTERS,
  NATIVE_SERVICE_DOG_SIZES,
  NATIVE_SERVICE_LOCATION_STYLES,
  NATIVE_SERVICE_PET_TYPES,
  NATIVE_SERVICE_TYPES,
  createNativeServiceChat,
  fetchNativeProviderRatingSummaries,
  fetchNativeServiceProviderDetail,
  fetchNativeServiceProviders,
  filterAndSortNativeServiceProviders,
  incrementNativeServiceProviderView,
  invalidateNativeServiceProviderCaches,
  isNativeServiceAvailableWithinTwoHours,
  readNativeServiceProvidersAsyncCache,
  readNativeServiceProvidersCache,
  recordNativeServiceAnalytics,
  toggleNativeServiceBookmark,
  writeNativeServiceProvidersCache,
  type NativeServiceFilterState,
  type NativeProviderRatingSummary,
  type NativeServiceProvider,
  type NativeServiceSortOption,
} from "../lib/nativeService";
import { fetchNativeRestrictionsSnapshot } from "../lib/nativeSafetyRestrictions";
import { formatNativeCareCurrencySymbol, isVerifiedPublicCredentialLabel } from "../lib/nativeCarerProfile";
import { nativePetEmojiForLabel } from "../lib/nativePetTaxonomy";
import { resolveNativeViewerScope, subscribeNativeViewerScope } from "../lib/nativeViewerScope";
import serviceImage from "../../assets/Notifications/Service.jpg";
import serviceEmptyImage from "../../assets/Notifications/empty-chat-native.png";
import { NativeServiceInboxBanner } from "../components/service/NativeServiceInboxBanner";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleGlassControls,
  huddleFormControls,
  huddleLayout,
  huddlePolaroid,
  huddleRadii,
  huddleShadows,
  huddleSocial,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeServiceScreenProps = {
  active?: boolean;
  accessToken?: string | null;
  sessionKey?: string | null;
  userId: string | null;
  onNavigate: (path: string) => void;
};

type Panel = "filters" | "dates" | "sort" | null;
const SERVICE_TOOLBAR_HEIGHT = huddleLayout.minTouch + huddleSpacing.x4;
type FilterDropdown = "serviceTypes" | "petTypes" | "dogSizes" | "locationStyles" | null;
type DateDropdown = "month" | "year" | null;
type ServiceRestrictionState = Partial<Record<"marketplace_hidden" | "service_disabled", { active?: boolean }>>;

const SORT_OPTIONS: Array<{ value: NativeServiceSortOption; label: string }> = [
  { value: "proximity", label: "Proximity" },
  { value: "latest", label: "Latest" },
  { value: "price_low_to_high", label: "Price: Low to high" },
  { value: "price_high_to_low", label: "Price: High to low" },
  { value: "popularity", label: "Popularity" },
];

const SERVICE_SHEET_SCROLL_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.58);
const SERVICE_SHEET_SCROLL_EXPANDED_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.68);

const toggleString = (list: string[], value: string) => (
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
);

const providerServiceLabel = (provider: NativeServiceProvider, service: string) =>
  service === "Others" && provider.servicesOther.trim() ? provider.servicesOther.trim() : service;

const matchedPublicCredentialBadges = (provider: NativeServiceProvider) =>
  (provider.publicCredentialBadges ?? []).filter((badge) => isVerifiedPublicCredentialLabel(badge.publicLabel));

const formatServicePrice = (price: string | null) => {
  if (!price) return "";
  const numericPrice = Number.parseFloat(price.replace(/,/g, ""));
  if (!Number.isFinite(numericPrice)) return price;
  return numericPrice.toLocaleString("en-US");
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const weekdayByIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const normalizeServiceRestrictionState = (input: unknown): ServiceRestrictionState => (
  input && typeof input === "object" ? input as ServiceRestrictionState : {}
);

const fetchNativeServiceRestrictionState = async (userId: string | null) => {
  if (!userId) return {};
  return normalizeServiceRestrictionState(await fetchNativeRestrictionsSnapshot());
};

type FeedRevealBus = {
  listeners: MutableRefObject<Set<(scrollY: number) => void>>;
  scrollYRef: MutableRefObject<number>;
  viewportHeight: number;
};

function ProviderCard({
  index = 0,
  provider,
  rating,
  reveal,
  wave = 0,
  onOpen,
  onBookmark,
}: {
  index?: number;
  provider: NativeServiceProvider;
  rating?: number;
  /** Scroll bus: cards fade up the first time they enter the viewport. */
  reveal?: FeedRevealBus;
  /** Increments each time the Care tab becomes visible — replays the entrance. */
  wave?: number;
  onOpen: () => void;
  onBookmark: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hero = imageFailed ? null : provider.avatarUrl ?? provider.socialAlbumUrls[0] ?? null;
  const services = provider.servicesOffered.map((service) => providerServiceLabel(provider, service)).join(" · ");
  const showPrice = Boolean(provider.startingPrice && provider.startingPriceRateUnit);
  const formattedPrice = formatServicePrice(provider.startingPrice);
  const verifiedBadges = matchedPublicCredentialBadges(provider);
  const certified = verifiedBadges.length > 0;
  const emergencyReady = isNativeServiceAvailableWithinTwoHours(provider);
  const reduceMotion = useReducedMotion();
  // Reveal-on-scroll entrance: the card stays mounted the whole time and fades
  // up (opacity + 12px rise) the FIRST time it crosses into the viewport —
  // scrolling back up never re-hides it. On each `wave` bump (tab entry) the
  // reveal state resets, so on-screen cards replay a stagger and below-fold
  // cards wait for the scroll to reach them.
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const contentYRef = useRef<number | null>(null);
  const revealedRef = useRef(false);
  const tryRevealRef = useRef<(scrollY: number) => void>(() => undefined);
  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    revealedRef.current = false;
    enter.setValue(0);
    const listeners = reveal?.listeners.current;
    // Stagger applies only to the entry wave (cards already on screen);
    // cards revealed later by scrolling play near-immediately so the feed
    // never feels laggy mid-scroll.
    let inStaggerWindow = true;
    const staggerTimer = setTimeout(() => { inStaggerWindow = false; }, 700);
    const tryReveal = (scrollY: number) => {
      if (revealedRef.current) return;
      const contentY = contentYRef.current;
      if (contentY === null) return;
      // Card top must be ~96px into the viewport before it plays.
      if (!reveal || contentY < scrollY + reveal.viewportHeight - 96) {
        revealedRef.current = true;
        listeners?.delete(tryReveal);
        Animated.timing(enter, {
          toValue: 1,
          duration: 280,
          delay: inStaggerWindow ? Math.min(index, 6) * 70 : (index % 2) * 50,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
    };
    tryRevealRef.current = tryReveal;
    listeners?.add(tryReveal);
    tryReveal(reveal?.scrollYRef.current ?? 0);
    return () => {
      clearTimeout(staggerTimer);
      listeners?.delete(tryReveal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replays per wave/index only
  }, [index, wave]);
  // One-shot pop when a bookmark is SAVED (not removed) — the tap gives
  // something back. Tracks the previous value so server refreshes don't re-pop.
  const bookmarkPop = useRef(new Animated.Value(1)).current;
  const wasBookmarked = useRef(provider.isBookmarked);
  useEffect(() => {
    if (provider.isBookmarked && !wasBookmarked.current && !reduceMotion) {
      Animated.sequence([
        Animated.spring(bookmarkPop, { toValue: 1.35, friction: 4, tension: 320, useNativeDriver: true }),
        Animated.spring(bookmarkPop, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }),
      ]).start();
    }
    wasBookmarked.current = provider.isBookmarked;
  }, [bookmarkPop, provider.isBookmarked, reduceMotion]);

  useEffect(() => {
    setImageFailed(false);
  }, [provider.avatarUrl, provider.socialAlbumUrls]);

  return (
    <Animated.View
      onLayout={(event) => {
        // Column sits at the top of the scroll content, under feedContent's
        // paddingTop — close enough for a reveal threshold.
        contentYRef.current = event.nativeEvent.layout.y + huddleSpacing.x4;
        tryRevealRef.current(reveal?.scrollYRef.current ?? 0);
      }}
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.providerCardShadow, pressed ? styles.pressed : null]}>
      <View style={styles.providerCardFrame}>
        <View style={styles.providerPhotoWrap}>
          {hero ? (
            <NativeServiceProfileImage
              accessibilityIgnoresInvertColors
              onError={() => setImageFailed(true)}
              resizeMode="cover"
              uri={hero}
              style={styles.providerPhoto}
            />
          ) : (
            <Image accessibilityIgnoresInvertColors resizeMode="cover" source={profilePlaceholder} style={styles.providerPhoto} />
          )}
          <View pointerEvents="none" style={styles.badgeStack}>
            {certified ? (
              <View style={[styles.badgePuck, styles.badgeGreen]}>
                <Feather color={huddleColors.onPrimary} name="check-circle" size={13} />
              </View>
            ) : null}
            {emergencyReady ? (
              <View style={[styles.badgePuck, styles.badgeEmergency]}>
                <Feather color={huddleColors.onPrimary} name="zap" size={13} />
              </View>
            ) : null}
          </View>
          {typeof rating === "number" ? (
            <View pointerEvents="none" style={styles.ratingBadgeTopRight}>
              <NativeRatingBadge rating={rating} />
            </View>
          ) : null}
          {showPrice ? (
            <View style={styles.pricePill}>
              <Text style={styles.priceMeta}>{formatNativeCareCurrencySymbol(provider.currency)}</Text>
              <Text style={styles.priceValue}>{formattedPrice}</Text>
              <Text style={styles.priceMeta}>/{provider.startingPriceRateUnit}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.providerCaption}>
          <View style={styles.providerNameRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={provider.isBookmarked ? "Remove bookmark" : "Bookmark provider"} onPress={onBookmark} hitSlop={10} style={({ pressed }) => [styles.bookmarkButton, pressed ? styles.pressed : null]}>
              <Animated.View style={{ transform: [{ scale: bookmarkPop }] }}>
                <FontAwesome color={provider.isBookmarked ? huddleColors.blue : huddleColors.iconSubtle} name="bookmark" size={14} />
              </Animated.View>
            </Pressable>
            <Text numberOfLines={1} style={styles.providerName}>{provider.displayName || "Pet Carer"}</Text>
          </View>
          <Text numberOfLines={2} style={styles.providerServices}>{services}</Text>
        </View>
      </View>
      {/* Anchored to the outer polaroid frame's own corner (not the inset photo wrap, which clips
          via overflow:hidden), so the sparkle sits right on the card's corner without being cropped.
          Only shown for trusted/pillar — the entry-level "active" sparkle is too easy to earn to
          warrant a badge on the carer marketplace listing itself. */}
      {provider.engagement && (provider.engagement.tier === "trusted" || provider.engagement.tier === "pillar") ? (
        <View pointerEvents="none" style={styles.engagementSparkleAnchor}>
          {/* size=76 -> sparkleSize ~26px (round(76*0.34)), i.e. double the previous ~13px
              (the component floors sparkleSize at 13, so size=36 alone would not have doubled it). */}
          <NativeEngagementSparkle engagement={provider.engagement} size={76} />
        </View>
      ) : null}
    </Pressable>
    </Animated.View>
  );
}

function ServiceEmptyCard({
  body,
  buttonLabel,
  unframed = false,
  onPress,
}: {
  body: string;
  buttonLabel?: string;
  unframed?: boolean;
  onPress?: () => void;
}) {
  if (unframed) {
    return (
      <View style={styles.socialEmptyState}>
        <Image accessibilityIgnoresInvertColors resizeMode="contain" source={serviceImage} style={styles.socialEmptyIllustration} />
        <Text style={styles.socialEmptyText}>{body}</Text>
      </View>
    );
  }

  return (
    <View style={styles.socialEmptyState}>
      <Image accessibilityIgnoresInvertColors resizeMode="contain" source={serviceImage} style={styles.socialEmptyIllustration} />
      <Text style={styles.socialEmptyText}>{body}</Text>
      {buttonLabel ? (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.emptySecondaryButton, pressed ? huddleButtons.pressed : null]}>
          <Feather color={huddleColors.blue} name="sliders" size={16} />
          <Text style={styles.emptySecondaryButtonText}>{buttonLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function NativeServiceScreen({ active = true, accessToken, sessionKey, userId, onNavigate }: NativeServiceScreenProps) {
  const insets = useSafeAreaInsets();
  const [providers, setProviders] = useState<NativeServiceProvider[]>([]);
  const [ratingSummaries, setRatingSummaries] = useState<Map<string, NativeProviderRatingSummary>>(new Map());
  const [filters, setFilters] = useState<NativeServiceFilterState>(DEFAULT_NATIVE_SERVICE_FILTERS);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [filterDraft, setFilterDraft] = useState<NativeServiceFilterState>(DEFAULT_NATIVE_SERVICE_FILTERS);
  const [filterDropdown, setFilterDropdown] = useState<FilterDropdown>(null);
  const [dateDropdown, setDateDropdown] = useState<DateDropdown>(null);
  const [dateDraftDates, setDateDraftDates] = useState<string[]>([]);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const loadAttemptRef = useRef(0);
  // Backstop: a loading flag still true past the deadline means something
  // upstream never settled. Fall into this screen's normal retryable error
  // state rather than spinning forever. See useNativeLoadingDeadline.ts.
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      loadAttemptRef.current += 1;
      loadInFlightRef.current = null;
      setLoading(false);
      setRefreshing(false);
      setError("Unable to load care options right now.");
    },
  });

  const [panel, setPanel] = useState<Panel>(null);
  const [serviceControlsHidden, setServiceControlsHidden] = useState(false);
  const serviceControlsProgress = useRef(new Animated.Value(0)).current;
  const lastServiceScrollOffsetRef = useRef(0);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  // SS4: pull-down-to-dismiss on provider modal
  const providerDragY = useRef(new Animated.Value(0)).current;
  const providerDragStyle = useMemo(() => ({ transform: [{ translateY: providerDragY }] }), [providerDragY]);
  const providerBackdropStyle = useMemo(() => ({ opacity: providerDragY.interpolate({ inputRange: [0, 260], outputRange: [1, 0.4], extrapolate: "clamp" as const }) }), [providerDragY]);
  const [activeProvider, setActiveProvider] = useState<NativeServiceProvider | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [carePopup, setCarePopup] = useState<{ title: string; body: string } | null>(null);
  const [serviceDisabled, setServiceDisabled] = useState(false);
  const [marketplaceHidden, setMarketplaceHidden] = useState(false);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(userId);
  const bookmarkInFlightRef = useRef<Set<string>>(new Set());
  const feedAnalyticsFiredRef = useRef(false);
  const lastViewedAnalyticsRef = useRef<string | null>(null);
  const sheetScrollRef = useRef<ScrollView | null>(null);
  const handleNavScroll = useNavMinimizeOnScroll();
  useEffect(() => {
    Animated.timing(serviceControlsProgress, {
      toValue: serviceControlsHidden ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [serviceControlsHidden, serviceControlsProgress]);
  const handleServiceScroll = useCallback((event: Parameters<ReturnType<typeof useNavMinimizeOnScroll>>[0]) => {
    handleNavScroll(event);
    const currentOffset = Math.max(0, event.nativeEvent.contentOffset.y);
    const directionDelta = currentOffset - lastServiceScrollOffsetRef.current;
    if (currentOffset <= 8) setServiceControlsHidden(false);
    else if (directionDelta > 5) setServiceControlsHidden(true);
    else if (directionDelta < -5) setServiceControlsHidden(false);
    lastServiceScrollOffsetRef.current = currentOffset;
  }, [handleNavScroll]);
  const handleFeedScroll = useCallback((event: Parameters<ReturnType<typeof useNavMinimizeOnScroll>>[0]) => {
    handleServiceScroll(event);
    const scrollY = event.nativeEvent.contentOffset.y;
    feedScrollYRef.current = scrollY;
    feedRevealListenersRef.current.forEach((listener) => listener(scrollY));
  }, [handleServiceScroll]);
  const serviceContextRef = useRef<{
    anchor: { lat: number; lng: number } | null;
    viewerCountry: string | null;
    viewerScope: Awaited<ReturnType<typeof resolveNativeViewerScope>> | null;
  }>({ anchor: null, viewerCountry: null, viewerScope: null });
  const wasActiveRef = useRef(active);
  const [entranceWave, setEntranceWave] = useState(0);
  // Scroll-reveal plumbing: cards register a listener and fade up the first
  // time they cross into the viewport. Refs (not state) so scroll never
  // re-renders the feed.
  const feedScrollYRef = useRef(0);
  const feedRevealListenersRef = useRef(new Set<(scrollY: number) => void>());
  const feedReveal = useMemo(() => ({
    listeners: feedRevealListenersRef,
    scrollYRef: feedScrollYRef,
    viewportHeight: Dimensions.get("window").height,
  }), []);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeDirtyRef = useRef(false);
  const activeProviderIdRef = useRef<string | null>(activeProviderId);
  const serviceSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const currentServiceSessionKey = sessionKey || (userId ? `${userId}:0` : "anon:0");
  activeProviderIdRef.current = activeProviderId;
  serviceSessionKeyRef.current = currentServiceSessionKey;

  const load = useCallback(async (background = false, force = false) => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    const attempt = ++loadAttemptRef.current;
    const isCurrentAttempt = () => loadAttemptRef.current === attempt;
    if (!background) setLoading(true);
    setError("");
    const request: Promise<void> = (async () => {
      const nextEffectiveUserId = userId;
      const requestSessionKey = currentServiceSessionKey;
      setEffectiveUserId(nextEffectiveUserId);
      const viewerScope = nextEffectiveUserId
        ? await resolveNativeViewerScope({ userId: nextEffectiveUserId, accessToken, sessionKey: requestSessionKey })
        : null;
      if (!isCurrentAttempt() || serviceSessionKeyRef.current !== requestSessionKey) return;
      const viewerCountry = viewerScope?.countryName || viewerScope?.country || viewerScope?.profileCountryName || viewerScope?.profileCountry || null;
      const accountAnchor = viewerScope?.primaryPoint ?? viewerScope?.profilePoint ?? null;
      const careViewerScope = viewerScope ? {
        ...viewerScope,
        city: viewerScope.city ?? viewerScope.profileLocationName ?? null,
        country: viewerCountry,
        countryCode: viewerScope.countryCode ?? viewerScope.profileCountryCode ?? null,
        countryName: viewerCountry,
        district: viewerScope.district ?? viewerScope.profileDistrict ?? null,
        primaryPoint: accountAnchor,
      } : null;
      const anchor = careViewerScope?.primaryPoint ?? null;
      serviceContextRef.current = { anchor, viewerCountry, viewerScope: careViewerScope };
      const providerCacheHasSelf = (providers: NativeServiceProvider[]) => Boolean(
        nextEffectiveUserId && providers.some((provider) => provider.userId === nextEffectiveUserId),
      );
      const cached = readNativeServiceProvidersCache({ userId: nextEffectiveUserId, sessionKey: requestSessionKey, anchor, viewerCountry, viewerScope: careViewerScope });
      if (cached && !force) {
        if (!isCurrentAttempt() || serviceSessionKeyRef.current !== requestSessionKey) return;
        if (!providerCacheHasSelf(cached.providers)) {
          setProviders(cached.providers);
          setError("");
          if (!background) setLoading(false);
        }
      } else if (!force) {
        const asyncCached = await readNativeServiceProvidersAsyncCache({ userId: nextEffectiveUserId, sessionKey: requestSessionKey, anchor, viewerCountry, viewerScope: careViewerScope });
        if (!isCurrentAttempt() || serviceSessionKeyRef.current !== requestSessionKey) return;
        if (asyncCached && !providerCacheHasSelf(asyncCached.providers)) {
          setProviders(asyncCached.providers);
          setError("");
          if (!background) setLoading(false);
        }
      }
      const [nextProviders, restrictions] = await Promise.all([
        fetchNativeServiceProviders({
          userId: nextEffectiveUserId,
          accessToken,
          sessionKey: requestSessionKey,
          anchor,
          viewerCountry,
          viewerScope: careViewerScope,
          force,
          cacheWriteGuard: () => isCurrentAttempt() && loadInFlightRef.current === request && serviceSessionKeyRef.current === requestSessionKey,
        }),
        fetchNativeServiceRestrictionState(nextEffectiveUserId),
      ]);
      if (!isCurrentAttempt() || serviceSessionKeyRef.current !== requestSessionKey) return;
      setProviders(nextProviders);
      const restrictionData = normalizeServiceRestrictionState(restrictions);
      setServiceDisabled(restrictionData.service_disabled?.active === true);
      setMarketplaceHidden(restrictionData.marketplace_hidden?.active === true);
    })()
      .catch((err) => {
        if (!isCurrentAttempt()) return;
        if (__DEV__) console.warn("[native.service] load_failed", String((err as { message?: unknown })?.message || err || "unknown"));
        setError("Unable to load care options right now.");
      })
      .finally(() => {
        if (loadInFlightRef.current === request) loadInFlightRef.current = null;
        if (!isCurrentAttempt()) return;
        setLoading(false);
        setRefreshing(false);
      });
    loadInFlightRef.current = request;
    return request;
  }, [accessToken, currentServiceSessionKey, userId]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    let refreshInFlight = false;
    const unsubscribe = subscribeNativeViewerScope(userId, () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      void (async () => {
        await invalidateNativeServiceProviderCaches(userId);
        await loadInFlightRef.current?.catch(() => undefined);
        if (!cancelled) await load(true, true);
      })().finally(() => {
        refreshInFlight = false;
      });
    }, { sessionKey: currentServiceSessionKey });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [currentServiceSessionKey, load, userId]);

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      setPanel(null);
      setActiveProviderId(null);
      setActiveProvider(null);
      setCarePopup(null);
      return;
    }
    if (!becameActive) return;
    setPanel(null);
    setActiveProviderId(null);
    // Replay the card entrance wave on every tab entry — tabs stay mounted
    // once visited, so a mount-only entrance would play exactly once per
    // session, usually while the tab is hidden.
    setEntranceWave((wave) => wave + 1);
    if (realtimeDirtyRef.current) {
      realtimeDirtyRef.current = false;
      void load(true, true);
    }
    // The committed provider list remains authoritative for ordinary returns.
    // Realtime invalidations, explicit refresh and completed mutations own
    // reconciliation; navigation itself never starts network work.
  }, [active, load]);

  // Provider review averages for the "4.9★" card badge. Keyed off the loaded
  // provider id set so it refetches whenever the list changes.
  const providerIdKey = providers.map((item) => item.userId).join(",");
  useEffect(() => {
    if (!active) return;
    if (!accessToken || providers.length === 0) {
      setRatingSummaries(new Map());
      return;
    }
    let alive = true;
    void fetchNativeProviderRatingSummaries(providers.map((item) => item.userId), accessToken)
      .then((summaries) => { if (alive) setRatingSummaries(summaries); })
      .catch(() => { if (alive) setRatingSummaries(new Map()); });
    return () => { alive = false; };
  }, [accessToken, active, providerIdKey]);

  useEffect(() => {
    if (!effectiveUserId) return;
    const requestSessionKey = currentServiceSessionKey;
    const visibleProviderIds = providerIdKey.split(",").filter(Boolean);
    const refreshCards = () => {
      if (!active) {
        realtimeDirtyRef.current = true;
        return;
      }
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        if (serviceSessionKeyRef.current !== requestSessionKey) return;
        void invalidateNativeServiceProviderCaches(effectiveUserId);
        void load(true, true);
      }, 650);
    };
    const handle = createSingleRealtimeChannel(`native-service-cards:${effectiveUserId}:${providerIdKey || "none"}`, (baseChannel) => {
      // Scope provider-card realtime to the providers currently visible on screen.
      // Previously this subscribed to every pet_care_profiles / service_reviews
      // change system-wide, so unrelated marketplace activity (any provider edit,
      // any review anywhere) would reload the whole card list.
      let channel = baseChannel
        .on("postgres_changes", { event: "*", schema: "public", table: "service_bookmarks", filter: `user_id=eq.${effectiveUserId}` }, refreshCards);
      for (const providerId of visibleProviderIds) {
        channel = channel
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${providerId}` }, refreshCards)
          .on("postgres_changes", { event: "*", schema: "public", table: "pet_care_profiles", filter: `user_id=eq.${providerId}` }, refreshCards)
          .on("postgres_changes", { event: "*", schema: "public", table: "service_reviews", filter: `provider_id=eq.${providerId}` }, refreshCards);
      }
      return channel;
    });
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      void handle.dispose();
    };
  }, [active, currentServiceSessionKey, effectiveUserId, load, providerIdKey]);

  useEffect(() => {
    if (!effectiveUserId) {
      setServiceDisabled(false);
      setMarketplaceHidden(false);
      return;
    }
    const refreshRestrictions = () => {
      if (!active) {
        realtimeDirtyRef.current = true;
        return;
      }
      void fetchNativeServiceRestrictionState(effectiveUserId).then((next) => {
        setServiceDisabled(next.service_disabled?.active === true);
        setMarketplaceHidden(next.marketplace_hidden?.active === true);
      }, () => {});
    };
    const handle = createSingleRealtimeChannel(`native-service-restrictions:${effectiveUserId}`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "user_moderation_restrictions", filter: `user_id=eq.${effectiveUserId}` }, refreshRestrictions)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_moderation", filter: `user_id=eq.${effectiveUserId}` }, refreshRestrictions)
    );
    return () => {
      void handle.dispose();
    };
  }, [active, effectiveUserId]);

  const visibleProviders = useMemo(() => filterAndSortNativeServiceProviders(providers, filters), [filters, providers]);
  // Staggered masonry: two independent columns flow at their own height. Even-ranked
  // providers fill the left column; the right column is headed by the Care-chats inbox
  // banner, then the odd-ranked providers. Columns are NOT row-aligned, so cards stagger.
  const { leftProviders, rightProviders } = useMemo(() => {
    const left: NativeServiceProvider[] = [];
    const right: NativeServiceProvider[] = [];
    visibleProviders.forEach((provider, index) => {
      (index % 2 === 0 ? left : right).push(provider);
    });
    return { leftProviders: left, rightProviders: right };
  }, [visibleProviders]);

  useEffect(() => {
    if (feedAnalyticsFiredRef.current || loading || visibleProviders.length === 0 || !userId) return;
    feedAnalyticsFiredRef.current = true;
    const top10 = visibleProviders.slice(0, 10);
    void recordNativeServiceAnalytics("service_feed_rendered", {
      sort: filters.sort,
      total: visibleProviders.length,
      top10_gold: top10.filter((provider) => provider.serviceRankWeight === 20).length,
      top10_plus: top10.filter((provider) => provider.serviceRankWeight === 10).length,
      top10_free: top10.filter((provider) => provider.serviceRankWeight === 0).length,
    }, { accessToken, sessionKey: currentServiceSessionKey, userId }).catch(() => undefined);
  }, [accessToken, filters.sort, loading, userId, visibleProviders]);

  const updateFilter = (patch: Partial<NativeServiceFilterState>) => setFilters((prev) => ({ ...prev, ...patch }));

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const currentYear = today.getFullYear();
  const monthIndex = monthDate.getMonth();
  const yearValue = monthDate.getFullYear();
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, month) => new Date(2000, month, 1).toLocaleDateString("en-US", { month: "long" })),
    [],
  );
  const yearOptions = useMemo(() => Array.from({ length: 8 }, (_, index) => currentYear - 2 + index), [currentYear]);
  const monthLabel = useMemo(
    () => monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [monthDate],
  );
  const calendarDays = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startPadding = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ key: string; iso: string | null; label: string }> = [];
    for (let index = 0; index < startPadding; index += 1) {
      cells.push({ key: `pad-${index}`, iso: null, label: "" });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = toIsoDate(new Date(year, month, day));
      cells.push({ key: iso, iso, label: String(day) });
    }
    return cells;
  }, [monthDate]);

  const openPanel = (nextPanel: Panel) => {
    if (nextPanel) haptic.selectTab();
    if (nextPanel === "filters") {
      setFilterDraft(filters);
      setFilterDropdown(null);
    }
    if (nextPanel === "dates") {
      setDateDraftDates(selectedDates);
      setDateDropdown(null);
    }
    setPanel(nextPanel);
  };

  const closePanel = () => {
    setPanel(null);
    setFilterDropdown(null);
    setDateDropdown(null);
  };

  const centerSheetField = (y: number) => {
    setTimeout(() => {
      sheetScrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, y - SERVICE_SHEET_SCROLL_EXPANDED_MAX_HEIGHT * 0.34),
      });
    }, 80);
  };

  const toggleFilterDropdown = (next: Exclude<FilterDropdown, null>, y: number) => {
    setFilterDropdown((current) => {
      const open = current === next ? null : next;
      if (open) centerSheetField(y);
      return open;
    });
  };

  const toggleDateDropdown = (next: Exclude<DateDropdown, null>) => {
    setDateDropdown((current) => {
      const open = current === next ? null : next;
      if (open) centerSheetField(0);
      return open;
    });
  };

  const refresh = () => {
    setRefreshing(true);
    void load(true, true);
  };

  const handleBookmark = async (providerUserId: string) => {
    if (bookmarkInFlightRef.current.has(providerUserId)) return;
    const effectiveUserId = userId;
    if (!effectiveUserId) {
      haptic.error();
      setCarePopup({ title: "huddle Care", body: "Please sign in to bookmark providers." });
      return;
    }
    bookmarkInFlightRef.current.add(providerUserId);
    // SR7: lighter haptic if removing a bookmark, success-tick if saving — matches Airbnb/Rover save-feel
    const willBookmark = !providers.find((p) => p.userId === providerUserId)?.isBookmarked;
    if (willBookmark) haptic.success(); else haptic.selectTab();
    const previous = providers;
    try {
      const next = await toggleNativeServiceBookmark(effectiveUserId, previous, providerUserId, { accessToken, sessionKey: currentServiceSessionKey });
      setProviders(next);
      writeNativeServiceProvidersCache({
        userId: effectiveUserId,
        sessionKey: currentServiceSessionKey,
        anchor: serviceContextRef.current.anchor,
        viewerCountry: serviceContextRef.current.viewerCountry,
        viewerScope: serviceContextRef.current.viewerScope,
      }, next, readNativeServiceProvidersCache({
        userId: effectiveUserId,
        sessionKey: currentServiceSessionKey,
        anchor: serviceContextRef.current.anchor,
        viewerCountry: serviceContextRef.current.viewerCountry,
        viewerScope: serviceContextRef.current.viewerScope,
      })?.updatedAt ?? Date.now());
    } catch {
      setProviders(previous);
      setCarePopup({ title: "huddle Care", body: "Unable to update bookmark right now." });
    } finally {
      bookmarkInFlightRef.current.delete(providerUserId);
    }
  };

  const closeProvider = useCallback(() => {
    activeProviderIdRef.current = null;
    providerDragY.setValue(0);
    setActiveProviderId(null);
    setActiveProvider(null);
    setDetailLoading(false);
    setDetailError("");
  }, [providerDragY]);

  const providerPullDownResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 8 && Math.abs(gestureState.dx) < 18,
      onPanResponderMove: (_, gestureState) => {
        const dy = Math.max(0, gestureState.dy);
        const SOFT_LIMIT = 220;
        providerDragY.setValue(dy <= SOFT_LIMIT ? dy : SOFT_LIMIT + (dy - SOFT_LIMIT) * 0.35);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.9) {
          providerDragY.stopAnimation();
          providerDragY.setValue(0);
          closeProvider();
          return;
        }
        Animated.spring(providerDragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(providerDragY, { toValue: 0, damping: 20, stiffness: 300, useNativeDriver: true }).start();
      },
    }),
    [closeProvider, providerDragY],
  );

  const openProvider = async (provider: NativeServiceProvider) => {
    const requestSessionKey = currentServiceSessionKey;
    activeProviderIdRef.current = provider.userId;
    setActiveProviderId(provider.userId);
    setActiveProvider(provider);
    setDetailError("");
    setDetailLoading(true);
    if (userId && lastViewedAnalyticsRef.current !== provider.userId) {
      lastViewedAnalyticsRef.current = provider.userId;
      void recordNativeServiceAnalytics("service_profile_viewed", {
        provider_user_id: provider.userId,
        sort: filters.sort,
      }, { accessToken, sessionKey: requestSessionKey, userId }).catch(() => undefined);
    }
    try {
      const freshProvider = await fetchNativeServiceProviderDetail({
        userId,
        accessToken,
        sessionKey: requestSessionKey,
        providerUserId: provider.userId,
        updatedAt: provider.updatedAt,
        force: true,
        cacheWriteGuard: () => serviceSessionKeyRef.current === requestSessionKey && activeProviderIdRef.current === provider.userId,
        onCachedProvider: (cachedProvider) => {
          if (provider.userId !== userId && serviceSessionKeyRef.current === requestSessionKey && activeProviderIdRef.current === provider.userId) setActiveProvider(cachedProvider);
        },
      });
      if (serviceSessionKeyRef.current !== requestSessionKey || activeProviderIdRef.current !== provider.userId) return;
      if (!freshProvider) {
        setDetailError("Provider is unavailable right now.");
        return;
      }
      setActiveProvider(freshProvider);
      void incrementNativeServiceProviderView(freshProvider.userId, userId, { accessToken, sessionKey: requestSessionKey }).catch(() => undefined);
    } catch {
      setDetailError("Unable to load provider profile.");
    } finally {
      setDetailLoading(false);
    }
  };

  const requestService = async (providerUserId: string) => {
    const effectiveUserId = userId;
    if (!effectiveUserId) {
      setCarePopup({ title: "huddle Care", body: "Please sign in to request care." });
      return;
    }
    try {
      const restrictions = await fetchNativeServiceRestrictionState(effectiveUserId);
      const nextServiceDisabled = restrictions.service_disabled?.active === true;
      const nextMarketplaceHidden = restrictions.marketplace_hidden?.active === true;
      setServiceDisabled(nextServiceDisabled);
      setMarketplaceHidden(nextMarketplaceHidden);
      if (nextServiceDisabled) {
        setCarePopup({ title: "huddle Care", body: "Your booking access has been placed on hold due to recent account activity that does not meet our community safety standards." });
        return;
      }
    } catch {
      if (serviceDisabled) {
        setCarePopup({ title: "huddle Care", body: "Your booking access has been placed on hold due to recent account activity that does not meet our community safety standards." });
        return;
      }
    }
    try {
      const chatId = await createNativeServiceChat(providerUserId, { accessToken, sessionKey: currentServiceSessionKey, userId: effectiveUserId });
      setProviders((current) => current.filter((provider) => provider.userId !== providerUserId));
      setActiveProviderId(null);
      setActiveProvider(null);
      onNavigate(`/service-chat?room=${encodeURIComponent(chatId)}&request=1&returnTo=${encodeURIComponent("/chats?tab=service")}`);
      // The server write is authoritative and navigation must not wait for
      // AsyncStorage/cache housekeeping. Those operations are best-effort and
      // can be slow on a cache-heavy installation.
      void Promise.allSettled([
        markNativeServiceTabHasDialogues(effectiveUserId),
        invalidateNativeChatReadCaches(effectiveUserId),
        invalidateNativeServiceProviderCaches(effectiveUserId),
      ]);
    } catch (err) {
      const message = String((err as { message?: string })?.message || "");
      const details = String((err as { details?: string })?.details || "");
      const hint = String((err as { hint?: string })?.hint || "");
      const reason = `${message} ${details} ${hint}`.toLowerCase();
      if (reason.includes("provider_not_requestable")) {
        setProviders((current) => current.filter((provider) => provider.userId !== providerUserId));
        setActiveProviderId(null);
        setActiveProvider(null);
        void invalidateNativeServiceProviderCaches(effectiveUserId);
        setCarePopup({ title: "huddle Care", body: "This provider cannot receive care requests yet." });
      } else if (reason.includes("service_access_disabled")) {
        setCarePopup({ title: "huddle Care", body: "Your booking access has been placed on hold due to recent account activity that does not meet our community safety standards." });
      } else if (reason.includes("provider_profile_missing")) {
        setCarePopup({ title: "huddle Care", body: "This provider profile is incomplete and can't receive requests yet." });
      } else if (reason.includes("requester_profile_missing")) {
        setCarePopup({ title: "huddle Care", body: "Your profile setup is incomplete. Please complete profile setup first." });
      } else if (reason.includes("not_authenticated")) {
        setCarePopup({ title: "huddle Care", body: "Please sign in again." });
      } else if (reason.includes("cannot_create_service_chat_with_self")) {
        setCarePopup({ title: "huddle Care", body: "You can't request care from yourself." });
      } else if (reason.includes("already matched")) {
        setCarePopup({ title: "huddle Care", body: "You already have a care chat with this provider." });
      } else {
        setCarePopup({ title: "huddle Care", body: "Unable to start a conversation right now. Please try again later" });
      }
    }
  };

  return (
    <View style={styles.screen}>
      {marketplaceHidden ? (
        <View style={styles.restrictionBanner}>
          <Text style={styles.restrictionBannerText}>Your profile visibility is currently restricted due to recent account activity that does not meet our community safety standards.</Text>
        </View>
      ) : null}
      <Animated.View
        pointerEvents={serviceControlsHidden ? "none" : "auto"}
        style={[styles.toolbarReveal, {
          height: serviceControlsProgress.interpolate({ inputRange: [0, 1], outputRange: [SERVICE_TOOLBAR_HEIGHT, 0] }),
          opacity: serviceControlsProgress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0, 0] }),
          transform: [{ translateY: serviceControlsProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
        }]}
      >
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Feather color={huddleColors.iconSubtle} name="search" size={17} />
          <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
            accessibilityLabel="Search care"
            onChangeText={(search) => updateFilter({ search })}
            placeholder=""
            placeholderTextColor={huddleColors.mutedText}
            style={styles.searchInput}
            value={filters.search}
          />
        </View>
        <Pressable accessibilityLabel="Open filters" onPress={() => openPanel("filters")} style={styles.iconButton}>
          <Feather color={huddleColors.iconMuted} name="sliders" size={20} />
        </Pressable>
        <Pressable accessibilityLabel="Choose care date" onPress={() => openPanel("dates")} style={styles.iconButton}>
          <Feather color={huddleColors.iconMuted} name="calendar" size={20} />
        </Pressable>
        <Pressable accessibilityLabel="Sort care" onPress={() => openPanel("sort")} style={styles.iconButton}>
          <Feather color={huddleColors.iconMuted} name="arrow-down" size={20} />
        </Pressable>
      </View>
      </Animated.View>

      {loading ? (
        <ScrollView contentContainerStyle={styles.feedContent} style={styles.feedScroller} showsVerticalScrollIndicator={false} onScroll={handleServiceScroll} scrollEventThrottle={16}>
          <View style={styles.providerGrid}>
            <View style={styles.providerColumn}>
              <NativeCarerCardSkeleton />
              <NativeCarerCardSkeleton />
              <NativeCarerCardSkeleton />
            </View>
            <View style={[styles.providerColumn, styles.providerColumnOffset]}>
              <NativeCarerCardSkeleton />
              <NativeCarerCardSkeleton />
              <NativeCarerCardSkeleton />
            </View>
          </View>
        </ScrollView>
      ) : error ? (
        <View style={styles.serviceErrorState}>
          <Image accessibilityIgnoresInvertColors resizeMode="contain" source={serviceEmptyImage} style={styles.serviceErrorImage} />
          <Text style={styles.serviceErrorText}>Unable to load Care for now. Please try again later</Text>
          <Pressable onPress={() => void load(false, true)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        visibleProviders.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.feedContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={huddleColors.blue} colors={[huddleColors.blue]} />}
            style={styles.feedScroller}
            onScroll={handleServiceScroll}
            scrollEventThrottle={16}
          >
            {providers.length === 0 ? (
              <ServiceEmptyCard body="No local pros nearby to offer care yet. Be the first to provide care support!" unframed />
            ) : (
              <ServiceEmptyCard body="No providers match these filters." buttonLabel="Expand Filter" onPress={() => openPanel("filters")} />
            )}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.feedContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={huddleColors.blue} colors={[huddleColors.blue]} />}
            showsVerticalScrollIndicator={false}
            style={styles.feedScroller}
            onScroll={handleFeedScroll}
            scrollEventThrottle={16}
          >
            <View style={styles.providerGrid}>
              <View style={styles.providerColumn}>
                {leftProviders.map((item, itemIndex) => (
                  <ProviderCard
                    key={item.userId}
                    index={itemIndex * 2}
                    provider={item}
                    rating={ratingSummaries.get(item.userId)?.avgRating}
                    reveal={feedReveal}
                    wave={entranceWave}
                    onOpen={() => void openProvider(item)}
                    onBookmark={() => void handleBookmark(item.userId)}
                  />
                ))}
              </View>
              <View style={styles.providerColumn}>
                <NativeServiceInboxBanner accessToken={accessToken} onNavigate={onNavigate} sessionKey={sessionKey} userId={effectiveUserId} />
                {rightProviders.map((item, itemIndex) => (
                  <ProviderCard
                    key={item.userId}
                    index={itemIndex * 2 + 1}
                    provider={item}
                    rating={ratingSummaries.get(item.userId)?.avgRating}
                    reveal={feedReveal}
                    wave={entranceWave}
                    onOpen={() => void openProvider(item)}
                    onBookmark={() => void handleBookmark(item.userId)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        )
      )}

      <Modal presentationStyle="overFullScreen" animationType="fade" transparent visible={panel === "sort"} onRequestClose={closePanel}>
        <Pressable style={styles.dropdownBackdrop} onPress={closePanel}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.floatingDropdown, styles.sortDropdown]}>
            {panel === "sort" ? (
              <View style={styles.dropdownContent}>
                {SORT_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => { updateFilter({ sort: option.value }); closePanel(); }}
                    style={({ pressed }) => [styles.dropdownOption, filters.sort === option.value ? styles.dropdownOptionActive : null, pressed ? styles.pressed : null]}
                  >
                    <Text ellipsizeMode="tail" numberOfLines={1} style={styles.dropdownText}>{option.label}</Text>
                    {filters.sort === option.value ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.checkSlot} />}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={panel === "filters" || panel === "dates"} onRequestClose={closePanel}>
        <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
          <Pressable accessibilityLabel="Close care sheet" accessibilityRole="button" onPress={closePanel} style={StyleSheet.absoluteFill} />
          <View pointerEvents="box-none" style={nativeModalStyles.appBottomSheetEventBoundary}>
          <AppBottomSheet onClose={closePanel}>
            <AppBottomSheetHeader>
              <Text style={styles.sheetTitle}>{panel === "dates" ? "Care date" : "Filters"}</Text>
              <AppModalCloseButton onPress={closePanel} />
            </AppBottomSheetHeader>
            <ScrollView
              ref={sheetScrollRef}
              bounces={false}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={[styles.sheetScroll, (filterDropdown || dateDropdown) ? styles.sheetScrollExpanded : null]}
            >
              {panel === "filters" ? (
                <View style={styles.filterStack}>
                  <View style={styles.filterScopeGroup}>
                    <Text style={styles.filterGroupTitle}>CARE SCOPE</Text>
                    <FilterDropdownField
                      label="Care Type"
                      value={filterDraft.serviceTypes}
                      open={filterDropdown === "serviceTypes"}
                      onPress={() => toggleFilterDropdown("serviceTypes", 132)}
                    >
                      <OptionList options={NATIVE_SERVICE_TYPES} selected={filterDraft.serviceTypes} onToggle={(serviceTypes) => setFilterDraft((prev) => ({ ...prev, serviceTypes }))} />
                    </FilterDropdownField>
                    <FilterDropdownField
                      label="Pet Type"
                      value={filterDraft.petTypes}
                      open={filterDropdown === "petTypes"}
                      onPress={() => toggleFilterDropdown("petTypes", 250)}
                    >
                      <OptionList getOptionIcon={nativePetEmojiForLabel} options={NATIVE_SERVICE_PET_TYPES} selected={filterDraft.petTypes} onToggle={(petTypes) => setFilterDraft((prev) => ({ ...prev, petTypes }))} />
                    </FilterDropdownField>
                    <FilterDropdownField
                      label="Pet Size"
                      value={filterDraft.dogSizes}
                      open={filterDropdown === "dogSizes"}
                      onPress={() => toggleFilterDropdown("dogSizes", 368)}
                    >
                      <OptionList options={NATIVE_SERVICE_DOG_SIZES} selected={filterDraft.dogSizes} onToggle={(dogSizes) => setFilterDraft((prev) => ({ ...prev, dogSizes }))} />
                    </FilterDropdownField>
                    <FilterDropdownField
                      label="Care Location"
                      value={filterDraft.locationStyles}
                      open={filterDropdown === "locationStyles"}
                      onPress={() => toggleFilterDropdown("locationStyles", 486)}
                    >
                      <OptionList options={NATIVE_SERVICE_LOCATION_STYLES} selected={filterDraft.locationStyles} onToggle={(locationStyles) => setFilterDraft((prev) => ({ ...prev, locationStyles }))} />
                    </FilterDropdownField>
                  </View>
                  <View style={styles.filterScopeGroup}>
                    <Text style={styles.filterGroupTitle}>OPTIONS</Text>
                    <ToggleRow label="Bookmark" value={filterDraft.bookmarkedOnly} onChange={(bookmarkedOnly) => setFilterDraft((prev) => ({ ...prev, bookmarkedOnly }))} />
                    <ToggleRow label="Professional" value={filterDraft.verifiedLicensedOnly} onChange={(verifiedLicensedOnly) => setFilterDraft((prev) => ({ ...prev, verifiedLicensedOnly }))} />
                    <ToggleRow label="Available in 2 hours" value={filterDraft.emergencyReadyOnly} onChange={(emergencyReadyOnly) => setFilterDraft((prev) => ({ ...prev, emergencyReadyOnly }))} />
                    <ToggleRow label="Volunteer" value={filterDraft.volunteerOnly} onChange={(volunteerOnly) => setFilterDraft((prev) => ({ ...prev, volunteerOnly }))} />
                  </View>
                </View>
              ) : null}
              {panel === "dates" ? (
                <View style={styles.dateStack}>
                  <View style={styles.dateHeaderRow}>
                    <Pressable accessibilityLabel="Previous month" onPress={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={styles.dateArrowButton}>
                      <Feather color={huddleColors.iconMuted} name="chevron-left" size={18} />
                    </Pressable>
                    <View style={styles.dateSelectRow}>
                      <Pressable
                        style={[styles.dateSelectButton, dateDropdown === "month" ? styles.fieldFocused : null]}
                        onPress={() => toggleDateDropdown("month")}
                      >
                        <Text numberOfLines={1} style={styles.dateSelectText}>
                          {new Date(2000, monthIndex, 1).toLocaleDateString("en-US", { month: "long" })}
                        </Text>
                        <Feather color={huddleColors.iconSubtle} name="chevron-down" size={16} />
                      </Pressable>
                      <Pressable
                        style={[styles.dateSelectButton, styles.yearSelectButton, dateDropdown === "year" ? styles.fieldFocused : null]}
                        onPress={() => toggleDateDropdown("year")}
                      >
                        <Text numberOfLines={1} style={styles.dateSelectText}>{yearValue}</Text>
                        <Feather color={huddleColors.iconSubtle} name="chevron-down" size={16} />
                      </Pressable>
                    </View>
                    <Pressable accessibilityLabel="Next month" onPress={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={styles.dateArrowButton}>
                      <Feather color={huddleColors.iconMuted} name="chevron-right" size={18} />
                    </Pressable>
                  </View>
                  {dateDropdown === "month" ? (
                    <SingleOptionList
                      options={monthOptions}
                      selected={monthOptions[monthIndex] ?? ""}
                      onSelect={(label) => {
                        const nextMonth = monthOptions.indexOf(label);
                        if (nextMonth >= 0) setMonthDate((prev) => new Date(prev.getFullYear(), nextMonth, 1));
                        setDateDropdown(null);
                      }}
                    />
                  ) : null}
                  {dateDropdown === "year" ? (
                    <SingleOptionList
                      options={yearOptions.map(String)}
                      selected={String(yearValue)}
                      onSelect={(label) => {
                        const nextYear = Number(label);
                        if (!Number.isNaN(nextYear)) setMonthDate((prev) => new Date(nextYear, prev.getMonth(), 1));
                        setDateDropdown(null);
                      }}
                    />
                  ) : null}
                  <View style={styles.weekdayGrid}>
                    {weekdayByIndex.map((day) => (
                      <Text key={day} style={styles.weekdayText}>{day}</Text>
                    ))}
                  </View>
                  <View style={styles.calendarGrid}>
                    {calendarDays.map((cell) => {
                      if (!cell.iso) return <View key={cell.key} style={styles.calendarCell} />;
                      const date = new Date(`${cell.iso}T00:00:00`);
                      const isPast = date < today;
                      const isToday = date.getTime() === today.getTime();
                      const active = dateDraftDates.includes(cell.iso);
                      return (
                        <Pressable
                          disabled={isPast}
                          key={cell.key}
                          onPress={() => setDateDraftDates((prev) => prev.includes(cell.iso!) ? prev.filter((item) => item !== cell.iso) : [...prev, cell.iso!])}
                          style={({ pressed }) => [
                            styles.calendarCell,
                            active ? styles.calendarCellActive : isToday ? styles.calendarCellToday : styles.calendarCellRest,
                            isPast ? styles.calendarCellDisabled : null,
                            pressed && !isPast ? styles.pressed : null,
                          ]}
                        >
                          <Text style={[styles.calendarCellText, active ? styles.calendarCellTextActive : null, isPast ? styles.calendarCellTextDisabled : null]}>{cell.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.sheetFooter}>
              <AppModalActionRow>
                <AppModalButton
                  variant="secondary"
                  onPress={() => {
                    haptic.destructive();
                    if (panel === "filters") {
                      setFilterDraft((prev) => ({ ...prev, bookmarkedOnly: false, verifiedLicensedOnly: false, emergencyReadyOnly: false, volunteerOnly: false, serviceTypes: [], petTypes: [], dogSizes: [], locationStyles: [] }));
                    }
                    if (panel === "dates") {
                      setDateDraftDates([]);
                    }
                  }}
                >
                  <Text style={styles.secondaryButtonText}>{panel === "dates" ? "Clear" : "Reset"}</Text>
                </AppModalButton>
                <AppModalButton
                  onPress={() => {
                    haptic.primaryConfirm();
                    if (panel === "filters") {
                      setFilters(filterDraft);
                    }
                    if (panel === "dates") {
                      const selectedWeekdays = Array.from(new Set(dateDraftDates.map((iso) => {
                        const date = new Date(`${iso}T00:00:00`);
                        return weekdayByIndex[date.getDay()] ?? "";
                      }).filter(Boolean)));
                      setSelectedDates(dateDraftDates);
                      updateFilter({ selectedWeekdays });
                    }
                    closePanel();
                  }}
                >
                  <Text style={styles.primaryButtonText}>Apply Filters</Text>
                </AppModalButton>
              </AppModalActionRow>
            </View>
          </AppBottomSheet>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={Boolean(activeProviderId)} onRequestClose={closeProvider}>
        <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, styles.profileModalSafeArea, { backgroundColor: "transparent", paddingTop: insets.top + huddleSpacing.x6, paddingBottom: insets.bottom }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.providerDim, providerBackdropStyle]} />
          <Pressable accessibilityLabel="Close provider profile" accessibilityRole="button" onPress={closeProvider} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.profileModalCard, providerDragStyle]}>
              <View style={styles.providerGrabber} {...providerPullDownResponder.panHandlers} />
              <View collapsable={false} {...providerPullDownResponder.panHandlers}>
                <AppBottomSheetHeader>
                  <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>Pet Carer Profile</Text>
                  <AppModalCloseButton onPress={closeProvider} />
                </AppBottomSheetHeader>
              </View>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.profileModalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            style={styles.profileModalScroll}
          >
              {detailError ? (
                <View style={styles.detailState}>
                  <Text style={styles.stateText}>{detailError}</Text>
                </View>
              ) : activeProvider ? (
                <NativeCarerProfileContent provider={activeProvider} accessToken={accessToken} showRequestAction canRequestService={!serviceDisabled} onRequestService={() => void requestService(activeProvider.userId)} />
              ) : detailLoading ? (
                <View style={styles.detailState}>
                  <NativeLoadingState variant="inline" />
                </View>
              ) : (
                <View style={styles.detailState}>
                  <NativeLoadingState variant="inline" />
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <AppConfirmModal
        body={carePopup?.body || ""}
        cancelLabel={null}
        confirmLabel="OK"
        onCancel={() => setCarePopup(null)}
        onConfirm={() => setCarePopup(null)}
        open={Boolean(carePopup)}
        title={carePopup?.title || "huddle Care"}
      />
    </View>
  );
}

function OptionList({ getOptionIcon, options, selected, onToggle, maxHeight }: { getOptionIcon?: (option: string) => string | null; options: readonly string[]; selected: string[]; onToggle: (next: string[]) => void; maxHeight?: number }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator
      style={[styles.dropdownMenu, maxHeight ? { maxHeight } : null]}
      contentContainerStyle={styles.dropdownContent}
    >
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(toggleString(selected, option))}
            style={({ pressed }) => [styles.dropdownOption, active ? styles.dropdownOptionActive : null, pressed ? styles.pressed : null]}
          >
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.dropdownText}>{getOptionIcon ? `${getOptionIcon(option) || ""} ${option}`.trim() : option}</Text>
            {active ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.checkSlot} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SingleOptionList({ options, selected, onSelect }: { options: readonly string[]; selected: string; onSelect: (value: string) => void }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator
      style={styles.dropdownMenu}
      contentContainerStyle={styles.dropdownContent}
    >
      {options.map((option) => {
        const active = selected === option;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [styles.dropdownOption, active ? styles.dropdownOptionActive : null, pressed ? styles.pressed : null]}
          >
            <Text style={styles.dropdownText}>{option}</Text>
            {active ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.checkSlot} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FilterDropdownField({
  children,
  label,
  onPress,
  open,
  value,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  open: boolean;
  value: string[];
}) {
  const summary = value.length > 0 ? value.join(", ") : "All";
  return (
    <View style={styles.filterFieldGroup}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.filterListRow, open ? styles.filterListRowFocused : null, pressed ? styles.pressed : null]}>
        <Text numberOfLines={1} style={styles.filterRowLabel}>{label}</Text>
        <View style={styles.filterRowValueWrap}>
          <Text numberOfLines={1} style={[styles.filterRowValue, value.length === 0 ? styles.filterRowValueMuted : null]}>
            {summary}
          </Text>
          <Feather color={huddleColors.iconSubtle} name={open ? "chevron-up" : "chevron-down"} size={16} />
        </View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <Text style={styles.filterRowLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value ? styles.toggleTrackActive : null]}>
        <View style={[styles.toggleThumb, value ? styles.toggleThumbActive : null]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  toolbar: {
    height: SERVICE_TOOLBAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x2,
    borderBottomWidth: 1,
    borderBottomColor: huddleColors.divider,
    backgroundColor: huddleColors.canvas,
  },
  toolbarReveal: {
    overflow: "hidden",
  },
  restrictionBanner: {
    marginHorizontal: huddleSpacing.x4,
    marginTop: huddleSpacing.x2,
    marginBottom: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    backgroundColor: huddleColors.validationSoft,
    ...huddleFieldStates.error,
  },
  restrictionBannerText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.validationRed,
  },
  searchBox: {
    flex: 1,
    minWidth: 0,
    height: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.button,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    height: huddleSpacing.x6,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    includeFontPadding: false,
    textAlignVertical: "center",
    color: huddleColors.text,
    overflow: "hidden",
  },
  iconButton: {
    width: 32,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  feedContent: {
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x10,
  },
  feedScroller: {
    backgroundColor: huddleColors.canvas,
  },
  providerGrid: {
    backgroundColor: huddleColors.canvas,
    flexDirection: "row",
    gap: huddleSpacing.x3,
  },
  providerGridRow: {
    gap: huddleSpacing.x3,
  },
  providerGridCell: {
    flex: 1,
    marginBottom: 34,
  },
  providerColumn: {
    backgroundColor: huddleColors.canvas,
    flex: 1,
    gap: 34,
  },
  providerColumnOffset: {
    paddingTop: 86,
  },
  providerCardShadow: {
    aspectRatio: huddlePolaroid.frame.aspectRatio,
    borderRadius: huddlePolaroid.frame.radius,
    backgroundColor: huddlePolaroid.frame.backgroundColor,
    ...huddleShadows.polaroidFrame,
  },
  providerCardFrame: {
    flex: 1,
    overflow: "hidden",
    borderRadius: huddlePolaroid.frame.radius,
    backgroundColor: huddlePolaroid.frame.backgroundColor,
  },
  providerPhotoWrap: {
    position: "absolute",
    top: huddlePolaroid.photo.top,
    left: huddlePolaroid.photo.left,
    right: huddlePolaroid.photo.right,
    bottom: huddlePolaroid.photo.bottom,
    overflow: "hidden",
    backgroundColor: huddleColors.canvas,
    borderRadius: huddlePolaroid.photo.radius,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
  },
  providerPhoto: {
    width: "100%",
    height: "100%",
  },
  badgeStack: {
    position: "absolute",
    left: huddlePolaroid.badge.left,
    top: huddlePolaroid.badge.top,
    gap: 0.5,
  },
  ratingBadgeTopRight: {
    position: "absolute",
    right: huddlePolaroid.badge.left,
    top: huddlePolaroid.badge.top,
  },
  engagementSparkleAnchor: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 0,
    height: 0,
  },
  badgePuck: {
    width: huddlePolaroid.badge.size,
    height: huddlePolaroid.badge.size,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.polaroidBadge,
  },
  badgeBlue: { backgroundColor: huddleColors.blue },
  badgeGreen: { backgroundColor: huddleColors.success },
  badgeEmergency: { backgroundColor: huddleColors.tierBadgePlus },
  pricePill: {
    position: "absolute",
    right: "2%",
    bottom: "2%",
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
    borderRadius: huddleRadii.button,
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.polaroidPrice,
  },
  priceMeta: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    color: huddleColors.caption,
  },
  priceValue: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  providerCaption: {
    position: "absolute",
    top: huddlePolaroid.caption.top,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: huddleSpacing.x3,
    paddingTop: 10,
    paddingBottom: huddleSpacing.x3,
    gap: 2,
  },
  providerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
  },
  providerName: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Georgia",
    fontSize: huddlePolaroid.caption.nameSize,
    fontStyle: "italic",
    fontWeight: "700",
    lineHeight: huddlePolaroid.caption.nameLine,
    color: huddleColors.subtext,
  },
  bookmarkButton: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  providerServices: {
    fontFamily: "Urbanist-500",
    fontSize: huddlePolaroid.caption.serviceSize,
    lineHeight: huddlePolaroid.caption.serviceLine,
    letterSpacing: 0,
    color: huddleColors.caption,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
  },
  serviceErrorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x8,
    backgroundColor: huddleColors.canvas,
  },
  serviceErrorImage: {
    width: "100%",
    maxWidth: 280,
    height: 220,
  },
  serviceErrorText: {
    maxWidth: 320,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  stateText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  emptyText: {
    paddingTop: huddleSpacing.x9,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x7,
  },
  socialEmptyState: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x7,
  },
  socialEmptyIllustration: {
    width: huddleSocial.emptyAssetWidth,
    maxWidth: "100%",
    height: huddleSocial.emptyAssetHeight,
  },
  socialEmptyText: {
    maxWidth: 320,
    marginTop: huddleSpacing.x4,
    textAlign: "center",
    fontFamily: "Urbanist-400",
    fontSize: huddleSocial.emptyTextSize,
    lineHeight: huddleSocial.emptyTextLineHeight,
    color: huddleColors.caption,
  },
  emptySecondaryButton: {
    minHeight: 44,
    width: "100%",
    maxWidth: 280,
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.button,
    paddingHorizontal: huddleSpacing.x5,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.fieldFocusRing,
  },
  emptySecondaryButtonText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.blue,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  floatingDropdown: {
    position: "absolute",
    top: huddleLayout.headerHeight + 118,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
  },
  sortDropdown: {
    right: huddleSpacing.x4,
    width: 208,
  },
  sheetTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  sheetScroll: {
    maxHeight: SERVICE_SHEET_SCROLL_MAX_HEIGHT,
  },
  sheetScrollExpanded: {
    maxHeight: SERVICE_SHEET_SCROLL_EXPANDED_MAX_HEIGHT,
  },
  sheetScrollContent: {
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x7,
    paddingBottom: huddleSpacing.x4,
  },
  sheetFooter: {
    width: "100%",
    alignSelf: "stretch",
    flexShrink: 0,
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    backgroundColor: huddleColors.canvas,
  },
  filterStack: {
    gap: huddleSpacing.x6,
  },
  filterScopeGroup: {
    gap: 0,
  },
  filterFieldGroup: {
    gap: 0,
  },
  filterGroupTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    letterSpacing: 1,
    color: huddleColors.mutedText,
    marginBottom: huddleSpacing.x3,
  },
  filterLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.text,
  },
  filterListRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  filterListRowFocused: {
    borderBottomColor: huddleColors.divider,
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
  },
  filterRowLabel: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  filterRowValueWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: huddleSpacing.x2,
  },
  filterRowValue: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: "right",
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  filterRowValueMuted: {
    color: huddleColors.mutedText,
  },
  filterSelectText: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  filterSelectPlaceholder: {
    color: huddleColors.mutedText,
  },
  dropdownMenu: {
    maxHeight: huddleFormControls.select.menuMaxHeight,
    marginTop: huddleSpacing.x1,
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  dropdownContent: {
    padding: huddleFormControls.select.menuPadding,
  },
  dropdownOption: {
    minHeight: huddleFormControls.select.optionMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
    borderRadius: huddleFormControls.select.optionRadius,
  },
  dropdownOptionActive: {
    backgroundColor: huddleColors.glassControl,
  },
  dropdownText: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  checkSlot: {
    width: huddleFormControls.select.checkSlot,
  },
  toggleRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  toggleTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 50,
    height: 28,
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: 3,
    borderRadius: huddleRadii.pill,
  },
  toggleTrackActive: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.24,
    shadowRadius: 5,
    shadowOffset: { width: 1, height: 2 },
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  secondaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  dateStack: {
    gap: huddleSpacing.x3,
  },
  dateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
  },
  dateArrowButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  dateSelectRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  dateSelectButton: {
    flex: 1,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  yearSelectButton: {
    flex: 0,
    minWidth: 108,
  },
  dateSelectText: {
    flex: 1,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  weekdayGrid: {
    flexDirection: "row",
    gap: 6,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Urbanist-400",
    fontSize: 11,
    lineHeight: 14,
    color: huddleColors.mutedText,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  calendarCell: {
    width: "12.42%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  calendarCellRest: {
    backgroundColor: huddleColors.mutedCanvas,
  },
  calendarCellToday: {
    backgroundColor: huddleColors.glassControl,
  },
  calendarCellActive: {
    backgroundColor: huddleColors.blue,
  },
  calendarCellDisabled: {
    opacity: 0.46,
  },
  calendarCellText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    color: huddleColors.text,
  },
  calendarCellTextActive: {
    color: huddleColors.onPrimary,
  },
  calendarCellTextDisabled: {
    color: huddleColors.mutedText,
  },
  profileModalSafeArea: {
    alignItems: "center",
    paddingHorizontal: 0,
  },
  providerDim: {
    backgroundColor: huddleColors.backdrop,
  },
  providerGrabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.sectionDividerStrong,
    marginTop: huddleSpacing.x2,
  },
  profileModalCard: {
    width: "100%",
    height: "100%",
    maxHeight: "100%",
    flexShrink: 1,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  headerActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: huddleSpacing.x1,
  },
  profileModalScroll: {
    flex: 1,
    minHeight: 0,
  },
  profileModalScrollContent: {
    paddingBottom: huddleSpacing.x6,
  },
  detailState: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
  },
  pressed: {
    opacity: 0.78,
  },
});
