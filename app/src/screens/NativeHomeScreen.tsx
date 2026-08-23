import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem, readNativeDisplayCacheKeys } from "../lib/nativeDisplayCacheStorage";
import { BlurView } from "@react-native-community/blur";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
  AppState,
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  fetchNativeChatDiscoveryProfiles,
  fetchNativeChatInbox,
  fetchNativeChatUnreadTotal,
  fetchNativeExploreGroups,
  fetchNativeViewerUpcomingGroupEvents,
  type NativeChatDiscoveryFilters,
  type NativeChatDiscoveryProfile,
  type NativeExploreGroup,
  type NativeHomeGroupEvent,
} from "../lib/nativeChat";
import { readCachedNativeViewerScope, resolveNativeViewerScope, type NativeViewerScope } from "../lib/nativeViewerScope";
import {
  openNativeAppSettings,
  openNativeLocationSettings,
  requestNativeLocationForPin,
} from "../lib/nativeLocation";
import { getNativeOutNowSessionClock, pinNativeUserOutNow, renewNativeUserOutNowWithClock, returnNativeUserOutNow, startNativeUserOutNowFromSavedLocation } from "../lib/nativeMapMutations";
import { endHomePresenceActivity, OUT_NOW_CONTINUE_REQUEST_KEY, startHomePresenceActivity, updateHomePresenceActivity } from "../lib/nativeActiveSessions";
import { fetchNativeUnreadNotificationCountWithToken } from "../lib/nativeNotifications";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import {
  beginNativePresenceIntent,
  enqueueNativePresenceMutation,
  isCurrentNativePresenceIntent,
  type NativePresenceIntentToken,
} from "../lib/nativePresenceMutationCoordinator";
import {
  cacheWriteGuard,
  freshnessRegistry,
  isCurrentSessionKey,
  LOAD_PHASE_DEFINITIONS,
  type RefreshSurface,
} from "../lib/nativeFreshnessRegistry";
import { resolveWarmEligibleNativeSurfaces } from "../lib/nativeSurfaceUsage";
import {
  fetchNativeProfileSummary,
  isNativeProfileAtLeastAge,
  patchNativeProfileSummaryCache,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  type NativeProfileSummary,
  type NativeQuotaSnapshot,
} from "../lib/nativeProfileSummary";
import { fetchNativeRestrictionsSnapshot } from "../lib/nativeSafetyRestrictions";
import { fetchNativeServiceProviders } from "../lib/nativeService";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { warmNativeSocialFirstPageCache } from "./NativeSocialScreen";
import { nativeFreshImageKey, nativeFreshImageUri, nativeMutableImageVersion } from "../lib/nativeImageFreshness";
import { resolveNativeProfileImageUrlAsync } from "../lib/nativeStorageUrlCache";
import { activeOutCompanionTrace, buildActiveOutCompanions } from "../lib/nativeActiveSessionCompanions";
import { fetchNativeNearbyOutSnapshot } from "../lib/nativeNearbyOutSnapshot";
import { NativeShimmerSkeleton } from "../components/NativeShimmerSkeleton";
import { NativeProfileAvatar, NativeEngagementSparkleInline } from "../components/NativeProfileAvatar";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
import { NativeGlassCircle } from "../components/NativeGlassCircle";
import { NativeGlassSurface } from "../components/NativeGlassSurface";
import { NativePetImage } from "../components/NativePetImage";
import { NativeFamilyPetBadge } from "../components/NativeFamilyPetBadge";
import { NATIVE_RETURN_BANNER_DURATION_MS } from "../components/NativeReturnBanner";
import { hideNativeReturnBanner, showNativeReturnBanner } from "../lib/nativeBannerBus";
import { AppConfirmModal } from "../components/nativeModalPrimitives";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { touchNativeLastActive } from "../lib/nativeActivity";
import { haptic } from "../lib/nativeHaptics";
import { subscribeNativePetMutations } from "../lib/nativeMutationTruth";
import { createSinglePrivateBroadcastChannel, createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { mapRealtimeTopicsForCenters } from "../lib/nativeMapRealtime";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleGlassControls,
  huddleImageDefaults,
  huddleLayout,
  huddlePetPhoto,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";
import { nativePetPresentationImageStyle } from "../lib/nativePetPhotoPresentation";
import { fetchNativeAccessiblePets } from "../lib/nativeFamilyPets";
import { normalizeNativeProfilePhotoPresentationCrop, type NativeProfilePhotoPresentationCrop } from "../lib/nativeProfilePhotos";
import noPetImage from "../../assets/Notifications/Main-Page-no-Pet.png";
import noPetBanner1 from "../../assets/Home/home-no-pet-profile.png";
import noPetBanner2 from "../../assets/Home/home-no-profile.png";
import noPetBanner3 from "../../assets/Home/home-no-verify.png";
import petBanner1 from "../../assets/Home/home-pet-verify-profile.png";
import petBanner2 from "../../assets/Home/home-pet-profile.png";
import petBanner3 from "../../assets/Home/home-pet-verify.png";
import petVerifyOrangeBanner from "../../assets/Home/home-pet-verify-orange.png";

type NativeHomeScreenProps = {
  active?: boolean;
  userId: string | null;
  accessToken?: string | null;
  sessionGeneration: number;
  sessionKey: string | null;
  outNowContinueIntent?: number;
  onNavigate: (path: string) => void;
};

export const HOME_DISCOVERY_WARM_FILTERS: NativeChatDiscoveryFilters = {
  ageMin: 16,
  ageMax: 99,
  genders: [],
  maxDistanceKm: 150,
  species: [],
  socialRoles: [],
  heightMin: 100,
  heightMax: 250,
  orientations: [],
  degrees: [],
  relationshipStatuses: [],
  hasCar: false,
  experienceYearsMin: 0,
  experienceYearsMax: 99,
  languages: [],
  verifiedOnly: false,
  whoWavedAtMe: false,
  activeOnly: false,
};

type HomePet = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  weight: number | null;
  weight_unit: string | null;
  dob: string | null;
  photo_presentation: { home?: { centerX?: number; centerY?: number; widthPct?: number; sourceAspect?: number } } | null;
  photo_url: string | null;
  is_active: boolean | null;
  updated_at?: string | null;
  is_family_shared?: boolean;
  shared_by_display_name?: string | null;
};

type HomeReminder = {
  id: string;
  pet_id: string;
  due_date: string;
  kind: string | null;
  reason: string | null;
};

type LoadState = "loading" | "ready" | "error";
type HomeOutNowState = {
  busy: boolean;
  error: string;
  nearbyCount: number | null;
};

type HomePulsePerson = {
  avatarBlurred?: boolean;
  id: string;
  label?: string | null;
  subLabel?: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  rank: number;
};

type HomePulseState = {
  outPeople: HomePulsePerson[];
  matchedOut: HomePulsePerson[];
  nearbyOut: HomePulsePerson[];
  discover: NativeChatDiscoveryProfile[];
  events: NativeHomeGroupEvent[];
  suggestion: NativeExploreGroup | null;
};

type HomeNearbyPeopleCachePayload = {
  cachedAt: number;
  matchedOut: HomePulsePerson[];
  nearbyOut: HomePulsePerson[];
  outPeople: HomePulsePerson[];
  totalCount: number;
};

const EMPTY_HOME_PULSE: HomePulseState = { outPeople: [], matchedOut: [], nearbyOut: [], discover: [], events: [], suggestion: null };

const HOME_PETS_CACHE_VERSION = 3;
const HOME_COMMUNITY_CACHE_VERSION = 1;
const HOME_PETS_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HOME_COMMUNITY_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const HOME_SOFT_CARD_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type HomePetsCachePayload = {
  version: number;
  cachedAt: number;
  sessionKey: string;
  userId: string;
  pets: HomePet[];
};

type HomeCommunityCachePayload = {
  cachedAt: number;
  discover: NativeChatDiscoveryProfile[];
  events: NativeHomeGroupEvent[];
  groups: NativeExploreGroup[];
  sessionKey: string;
  userId: string;
  version: number;
};

type HomeFreshnessSession = {
  accessToken: string;
  sessionGeneration: number;
  sessionKey: string;
  userId: string;
};

type HomeSoftCardId = "pet" | "profile" | "verify";
type HomeSoftCard = {
  id: HomeSoftCardId;
  dismissColor: string;
  image: ImageSourcePropType;
  path: string;
};

type HomeSoftCardCandidate = {
  id: HomeSoftCardId;
  path: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const parseHomeTimestampMs = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const formatOutNowCountdown = (expiresAt: string | null | undefined, nowMs: number) => {
  const expiresMs = parseHomeTimestampMs(expiresAt);
  if (expiresMs === null || expiresMs <= nowMs) return null;
  const totalMinutes = Math.max(1, Math.ceil((expiresMs - nowMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

// Precise h:mm:ss for the out-now hero countdown ring (ticks every second while active).
const formatOutNowClock = (expiresAt: string | null | undefined, nowMs: number) => {
  const expiresMs = parseHomeTimestampMs(expiresAt);
  if (expiresMs === null || expiresMs <= nowMs) return null;
  const totalSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const OUT_NOW_WINDOW_MS = 2 * 3600_000;

const outNowRingProgress = (expiresAt: string | null | undefined, nowMs: number) => {
  const expiresMs = parseHomeTimestampMs(expiresAt);
  if (expiresMs === null || expiresMs <= nowMs) return 0;
  const startedMs = expiresMs - OUT_NOW_WINDOW_MS;
  return Math.min(1, Math.max(0, (nowMs - startedMs) / OUT_NOW_WINDOW_MS));
};

const formatHomeEventTime = (startsAt: string, now = new Date()) => {
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime())) return "";
  const timeLabel = starts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase().replace(/\s/g, "");
  const dayStart = startOfDay(now).getTime();
  const eventDayStart = startOfDay(starts).getTime();
  const dayDiff = Math.round((eventDayStart - dayStart) / 86_400_000);
  if (dayDiff === 0) return `Today · ${timeLabel}`;
  if (dayDiff === 1) return `Tomorrow · ${timeLabel}`;
  if (dayDiff > 1 && dayDiff < 7) return `${starts.toLocaleDateString("en-US", { weekday: "short" })} · ${timeLabel}`;
  return `${starts.getDate()} ${starts.toLocaleDateString("en-US", { month: "short" })} · ${timeLabel}`;
};

const homeFirstName = (value: string | null | undefined) => String(value || "").trim().split(/\s+/)[0] || "";

const normalizeHomePetSignal = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

const homeTitleCasePetSignal = (value: string) => value
  .split(/[\s_/-]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(" ");

const HOME_NEARBY_MAX_METERS = 2_000;

const formatHomeDistance = (meters: number | null | undefined) => {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0 || meters > HOME_NEARBY_MAX_METERS) return null;
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)}m away`;
  const kilometres = meters < 10_000
    ? Number((meters / 1000).toFixed(1))
    : Math.round(meters / 1000);
  return `${kilometres}km away`;
};

const distanceMetersBetween = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const earthRadius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const homeRoleLabel = (options: { hasPet?: boolean; roles?: string[] | null }) => {
  const roles = (options.roles ?? []).map((role) => role.toLowerCase());
  if (roles.some((role) => role.includes("carer") || role.includes("sitter") || role.includes("walker"))) return "Pet carer";
  if (options.hasPet) return "Pet parent";
  return "Pet lover";
};

// Two-line teaser ladder for the nearby row: line 1 is the WHY (a real pet
// affinity), line 2 the WHERE. No why → where alone; no where → role alone.
// Never a filler line — every rendered line is a true signal.
const resolveHomeTeaserLabelAndRank = (options: {
  breeds?: Array<string | null | undefined>;
  distanceMeters?: number | null;
  hasPet?: boolean;
  roles?: string[] | null;
  species?: Array<string | null | undefined>;
  viewerBreeds: Set<string>;
  viewerSpecies: Set<string>;
}): { label: string; subLabel: string | null; rank: number } => {
  const breeds = (options.breeds ?? []).map(normalizeHomePetSignal).filter(Boolean);
  const species = (options.species ?? []).map(normalizeHomePetSignal).filter(Boolean);
  const whereLabel = formatHomeDistance(options.distanceMeters)
    ?? ((options.hasPet || species.length > 0 || breeds.length > 0) ? "Same area" : null);
  const matchedBreed = breeds.find((breed) => options.viewerBreeds.has(breed));
  if (matchedBreed) return { label: homeTitleCasePetSignal(matchedBreed), subLabel: whereLabel, rank: 0 };
  const matchedSpecies = species.find((item) => options.viewerSpecies.has(item));
  if (matchedSpecies) return { label: homeTitleCasePetSignal(matchedSpecies), subLabel: whereLabel, rank: 1 };
  if (whereLabel) return { label: whereLabel, subLabel: null, rank: whereLabel === "Same area" ? 2 : 3 };
  return { label: homeRoleLabel({ hasPet: options.hasPet, roles: options.roles }), subLabel: null, rank: 4 };
};

const resolveHomeGroupSuggestion = (events: NativeHomeGroupEvent[], groups: NativeExploreGroup[], activePets: HomePet[]) => {
  if (events.length > 0) return null;
  const ownSpecies = new Set(activePets.map((pet) => String(pet.species || "").trim().toLowerCase()).filter(Boolean));
  return groups
    .filter((group) => !group.joined && group.petFocus.some((focus) => ownSpecies.has(String(focus || "").trim().toLowerCase())))
    .sort((left, right) => right.memberCount - left.memberCount)[0] ?? null;
};

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatPetAgeForHomeCard = (dob: string | null | undefined) => {
  if (!dob) return "";
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0) {
    const safeMonths = Math.max(months, 0);
    return safeMonths === 1 ? "1 month old" : `${safeMonths} months old`;
  }
  return years === 1 ? "1 year old" : `${years} years old`;
};

const nextBirthdayFromDob = (dob: string, now = new Date()) => {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = startOfDay(now);
  const next = new Date(today);
  next.setMonth(birth.getMonth());
  next.setDate(birth.getDate());
  if (startOfDay(next).getTime() < today.getTime()) next.setFullYear(next.getFullYear() + 1);
  return next;
};

const formatEventDate = (value: Date) => {
  const day = String(value.getDate());
  const month = value.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
};

const formatReminderLabel = (pet: HomePet | null, reminders: HomeReminder[]) => {
  if (!pet || pet.is_active === false) return "—";
  const today = startOfDay(new Date());
  const candidates: Array<{ date: Date; reason: string }> = [];
  if (pet.dob) {
    const birthday = nextBirthdayFromDob(pet.dob, today);
    if (birthday) candidates.push({ date: birthday, reason: "Birthday" });
  }
  reminders.forEach((reminder) => {
    const date = new Date(reminder.due_date);
    if (Number.isNaN(date.getTime())) return;
    const dueDate = startOfDay(date);
    if (dueDate.getTime() < today.getTime()) return;
    candidates.push({
      date: dueDate,
      reason: reminder.reason?.trim() || reminder.kind?.trim() || "Reminder",
    });
  });
  if (candidates.length === 0) return "—";
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = candidates[0].date.getTime();
  const reasons = Array.from(
    new Set(
      candidates
        .filter((candidate) => candidate.date.getTime() === firstDate)
        .map((candidate) => candidate.reason),
    ),
  );
  return `${formatEventDate(candidates[0].date)}, ${reasons.length ? reasons.join(", ") : "Reminder"}`;
};

const formatHomePetEventLabel = (value: string) => {
  const clean = value.trim();
  if (!clean || clean === "—") return "";
  const [datePart, ...reasonParts] = clean.split(",");
  const reason = reasonParts.join(",").trim() || "Reminder";
  const date = datePart.trim();
  return date ? `${reason} · ${date}` : reason;
};


const hasProfileCoverPhoto = (profile: NativeProfileSummary | null) => {
  const photos = profile?.photos && typeof profile.photos === "object" && !Array.isArray(profile.photos)
    ? profile.photos as Record<string, unknown>
    : null;
  return Boolean(String(photos?.cover || profile?.avatar_url || "").trim());
};

const homeProfileAvatarPresentation = (profile: NativeProfileSummary | null) => {
  const photos = profile?.photos && typeof profile.photos === "object" && !Array.isArray(profile.photos)
    ? profile.photos as Record<string, unknown>
    : null;
  return normalizeNativeProfilePhotoPresentationCrop(photos?.avatar_presentation);
};

const hasCompleteProfileBasics = (profile: NativeProfileSummary | null) => {
  if (!profile) return false;
  const petExperience = Array.isArray(profile.pet_experience)
    ? profile.pet_experience.map((item) => String(item || "").trim()).filter(Boolean)
    : null;
  const experienceYears = typeof profile.experience_years === "number" ? profile.experience_years : null;
  return Boolean(
    hasProfileCoverPhoto(profile) &&
    String(profile.display_name || "").trim() &&
    String(profile.phone || "").trim() &&
    String(profile.dob || "").trim() &&
    String(profile.gender_genre || "").trim() &&
    String(profile.location_country || profile.country || "").trim() &&
    String(profile.location_district || "").trim() &&
    String(profile.social_id || "").trim() &&
    petExperience &&
    (petExperience.length === 0 || experienceYears !== null)
  );
};

const hasRenderableProfileSummary = (profile: NativeProfileSummary | null) =>
  Boolean(String(profile?.display_name || "").trim());

const homeSoftDismissKey = (userId: string, cardId: HomeSoftCardId) => `huddle_home_soft_card_dismissed:v2:${userId}:${cardId}`;

const softCardAccessibilityLabel = (id: HomeSoftCardId) =>
  id === "pet"
    ? "Everything works better with a pet profile"
    : id === "profile"
      ? "Community connects through your profile"
      : "Verify identity to unlock full huddle experience";

const resolveHomeSoftCardImage = (cardId: HomeSoftCardId, slotIndex: number): ImageSourcePropType => {
  if (cardId === "pet") return noPetBanner1;
  if (cardId === "profile") return slotIndex === 0 ? petBanner1 : noPetBanner2;
  if (slotIndex === 0) return petBanner3;
  if (slotIndex === 1) return petVerifyOrangeBanner;
  return noPetBanner3;
};

const resolveHomeSoftCardDismissColor = (slotIndex: number) =>
  slotIndex === 2 ? huddleColors.text : huddleColors.onPrimary;


const homePetsSessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const getHomePetsCacheKey = (userId: string, sessionKey?: string | null) => `huddle_home_pets:v3:${userId}:${homePetsSessionKey(userId, sessionKey)}`;
const getHomeCommunityCacheKey = (userId: string, sessionKey?: string | null) => `huddle_home_community:v1:${userId}:${homePetsSessionKey(userId, sessionKey)}`;
const getHomeNearbyPeopleCacheKey = (userId: string, sessionKey?: string | null) => `huddle_home_nearby_people:v1:${userId}:${homePetsSessionKey(userId, sessionKey)}`;

const HOME_DB_CACHE_TTL_MS = 30_000;
const HOME_NEARBY_PEOPLE_MEMORY_MS = 45_000;
const homePetsMemoryCache = new Map<string, { pets: HomePet[]; cachedAt: number }>();
const homePetsInFlight = new Map<string, Promise<HomePet[]>>();
const homePetsInvalidationEpoch = new Map<string, number>();
const homeRemindersMemoryCache = new Map<string, { reminders: HomeReminder[]; cachedAt: number }>();
const homeRemindersInFlight = new Map<string, Promise<HomeReminder[]>>();
const homeCommunityMemoryCache = new Map<string, HomeCommunityCachePayload>();
const homeCommunityInFlight = new Map<string, Promise<HomeCommunityCachePayload | null>>();
const homeNearbyPeopleMemoryCache = new Map<string, HomeNearbyPeopleCachePayload>();
const homeNearbyPeopleInFlight = new Map<string, Promise<HomeNearbyPeopleCachePayload | null>>();

const readHomeCommunityMemoryCache = (userId: string | null, sessionKey?: string | null) => {
  if (!userId) return null;
  const payload = homeCommunityMemoryCache.get(getHomeCommunityCacheKey(userId, sessionKey));
  if (!payload || Date.now() - payload.cachedAt > HOME_COMMUNITY_CACHE_MAX_AGE_MS) return null;
  return payload;
};

const readHomeNearbyPeopleMemoryCache = (userId: string | null, sessionKey?: string | null) => {
  if (!userId) return null;
  const payload = homeNearbyPeopleMemoryCache.get(getHomeNearbyPeopleCacheKey(userId, sessionKey));
  if (!payload || Date.now() - payload.cachedAt > HOME_NEARBY_PEOPLE_MEMORY_MS) return null;
  return payload;
};

const readHomePetsInvalidationEpoch = (userId: string, sessionKey?: string | null) =>
  homePetsInvalidationEpoch.get(getHomePetsCacheKey(userId, sessionKey)) ?? 0;

const bumpHomePetsInvalidationEpoch = (userId: string, sessionKey?: string | null) => {
  const key = getHomePetsCacheKey(userId, sessionKey);
  homePetsInvalidationEpoch.set(key, (homePetsInvalidationEpoch.get(key) ?? 0) + 1);
};

const bumpHomePetsInvalidationEpochByKey = (key: string) => {
  homePetsInvalidationEpoch.set(key, (homePetsInvalidationEpoch.get(key) ?? 0) + 1);
};

const readHomePetsMemoryCache = (userId: string, sessionKey?: string | null): HomePet[] | null => {
  const key = getHomePetsCacheKey(userId, sessionKey);
  const cached = homePetsMemoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > HOME_DB_CACHE_TTL_MS) {
    homePetsMemoryCache.delete(key);
    return null;
  }
  return cached.pets;
};

const writeHomePetsMemoryCache = (userId: string, pets: HomePet[], sessionKey?: string | null) => {
  homePetsMemoryCache.set(getHomePetsCacheKey(userId, sessionKey), { pets, cachedAt: Date.now() });
  return pets;
};

const readHomeRemindersMemoryCache = (cacheKey: string): HomeReminder[] | null => {
  const cached = homeRemindersMemoryCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > HOME_DB_CACHE_TTL_MS) {
    homeRemindersMemoryCache.delete(cacheKey);
    return null;
  }
  return cached.reminders;
};

const writeHomeRemindersMemoryCache = (cacheKey: string, reminders: HomeReminder[]) => {
  homeRemindersMemoryCache.set(cacheKey, { reminders, cachedAt: Date.now() });
  return reminders;
};

const readHomeCommunityCache = async (userId: string, sessionKey?: string | null): Promise<HomeCommunityCachePayload | null> => {
  const cacheSessionKey = homePetsSessionKey(userId, sessionKey);
  const key = getHomeCommunityCacheKey(userId, cacheSessionKey);
  const memory = homeCommunityMemoryCache.get(key);
  if (memory && Date.now() - memory.cachedAt <= HOME_COMMUNITY_CACHE_MAX_AGE_MS) return memory;
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<HomeCommunityCachePayload>;
    if (
      payload.version !== HOME_COMMUNITY_CACHE_VERSION ||
      payload.userId !== userId ||
      payload.sessionKey !== cacheSessionKey ||
      typeof payload.cachedAt !== "number" ||
      Date.now() - payload.cachedAt > HOME_COMMUNITY_CACHE_MAX_AGE_MS ||
      !Array.isArray(payload.events) ||
      !Array.isArray(payload.discover) ||
      !Array.isArray(payload.groups)
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    const next = payload as HomeCommunityCachePayload;
    homeCommunityMemoryCache.set(key, next);
    return next;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
};

const writeHomeCommunityCache = async (payload: HomeCommunityCachePayload) => {
  const key = getHomeCommunityCacheKey(payload.userId, payload.sessionKey);
  homeCommunityMemoryCache.set(key, payload);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const preloadNativeHomeCommunityBundle = async (options: {
  accessToken: string;
  cacheWriteGuard?: () => boolean;
  effectiveTier?: string | null;
  force?: boolean;
  sessionKey?: string | null;
  userId: string;
  viewerScope?: NativeViewerScope | null;
  includeDiscover?: boolean;
}) => {
  const cacheSessionKey = homePetsSessionKey(options.userId, options.sessionKey);
  const cacheKey = getHomeCommunityCacheKey(options.userId, cacheSessionKey);
  const existing = homeCommunityInFlight.get(cacheKey);
  if (existing) return existing;

  const request: Promise<HomeCommunityCachePayload | null> = (async () => {
    if (!options.force) {
      const cached = await readHomeCommunityCache(options.userId, cacheSessionKey);
      if (cached) return options.includeDiscover === false ? { ...cached, discover: [] } : cached;
    }
    const [memberEvents, discover, groups] = await Promise.all([
      fetchNativeViewerUpcomingGroupEvents({ accessToken: options.accessToken }).catch(() => [] as NativeHomeGroupEvent[]),
      options.includeDiscover === false ? Promise.resolve([] as NativeChatDiscoveryProfile[]) : fetchNativeChatDiscoveryProfiles(options.userId, HOME_DISCOVERY_WARM_FILTERS, {
        accessToken: options.accessToken,
        effectiveTier: options.effectiveTier ?? null,
        force: options.force === true,
        cacheWriteGuard: options.cacheWriteGuard,
        viewerScope: options.viewerScope ?? null,
      }).then((result) => result.profiles).catch(() => [] as NativeChatDiscoveryProfile[]),
      fetchNativeExploreGroups({ userId: options.userId, accessToken: options.accessToken, force: options.force === true, cacheWriteGuard: options.cacheWriteGuard, viewerScope: options.viewerScope ?? null }).then((result) => result.groups).catch(() => [] as NativeExploreGroup[]),
    ]);
    const memberEventGroupIds = new Set(memberEvents.map((event) => event.chatId));
    const exploreEvents = groups
      .filter((group) => !memberEventGroupIds.has(group.id))
      .filter((group) => Boolean(group.nextEventStartsAt))
      .map((group): NativeHomeGroupEvent => ({
        id: `explore:${group.id}:${group.nextEventStartsAt}`,
        chatId: group.id,
        creatorId: group.createdBy,
        title: group.nextEventTitle || group.name,
        description: group.description || "",
        locationLabel: group.locationLabel || "",
        startsAt: group.nextEventStartsAt!,
        endsAt: group.nextEventEndsAt || group.nextEventStartsAt!,
        allowGuests: false,
        createdAt: group.createdAt,
        updatedAt: group.lastMessageAt,
        rsvpCount: 0,
        viewerJoined: false,
        rsvpAvatars: [],
        groupJoined: Boolean(group.joined),
        groupName: group.name,
        groupAvatarUrl: group.avatarUrl,
        seriesId: null,
        recurrenceRule: null,
        occurrenceNumber: null,
        occurrenceCount: null,
        timeZone: null,
      }));
    const events = [...memberEvents, ...exploreEvents]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      .slice(0, 6);
    if (options.cacheWriteGuard && !options.cacheWriteGuard()) return null;
    const payload: HomeCommunityCachePayload = {
      version: HOME_COMMUNITY_CACHE_VERSION,
      cachedAt: Date.now(),
      sessionKey: cacheSessionKey,
      userId: options.userId,
      events,
      discover: discover.slice(0, 8),
      groups,
    };
    await writeHomeCommunityCache(payload);
    return payload;
  })().finally(() => {
    if (homeCommunityInFlight.get(cacheKey) === request) homeCommunityInFlight.delete(cacheKey);
  });
  homeCommunityInFlight.set(cacheKey, request);
  return request;
};

const isCachedPet = (value: unknown): value is HomePet => {
  if (!value || typeof value !== "object") return false;
  const pet = value as Partial<HomePet>;
  return (
    typeof pet.id === "string" &&
    typeof pet.name === "string" &&
    typeof pet.species === "string" &&
    (pet.breed === null || typeof pet.breed === "string") &&
    (pet.weight === null || typeof pet.weight === "number") &&
    (pet.weight_unit === null || typeof pet.weight_unit === "string") &&
    (pet.dob === null || typeof pet.dob === "string") &&
    (pet.photo_presentation === null || typeof pet.photo_presentation === "object") &&
    (pet.photo_url === null || typeof pet.photo_url === "string") &&
    (pet.is_active === null || typeof pet.is_active === "boolean") &&
    (pet.is_family_shared === undefined || typeof pet.is_family_shared === "boolean") &&
    (pet.shared_by_display_name === undefined || pet.shared_by_display_name === null || typeof pet.shared_by_display_name === "string") &&
    (pet.updated_at === undefined || pet.updated_at === null || typeof pet.updated_at === "string")
  );
};

const readHomePetsCache = async (userId: string, sessionKey?: string | null) => {
  const key = getHomePetsCacheKey(userId, sessionKey);
  const cacheSessionKey = homePetsSessionKey(userId, sessionKey);
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<HomePetsCachePayload>;
    if (
      payload.version !== HOME_PETS_CACHE_VERSION ||
      typeof payload.cachedAt !== "number" ||
      payload.userId !== userId ||
      payload.sessionKey !== cacheSessionKey ||
      Date.now() - payload.cachedAt > HOME_PETS_CACHE_MAX_AGE_MS ||
      !Array.isArray(payload.pets)
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    const pets = payload.pets.filter(isCachedPet);
    if (pets.length !== payload.pets.length) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return pets;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
};

const writeHomePetsCache = async (userId: string, pets: HomePet[], sessionKey?: string | null) => {
  const cacheSessionKey = homePetsSessionKey(userId, sessionKey);
  writeHomePetsMemoryCache(userId, pets, cacheSessionKey);
  try {
    const payload: HomePetsCachePayload = {
      version: HOME_PETS_CACHE_VERSION,
      cachedAt: Date.now(),
      sessionKey: cacheSessionKey,
      userId,
      pets,
    };
    await AsyncStorage.setItem(getHomePetsCacheKey(userId, cacheSessionKey), JSON.stringify(payload));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const clearNativeHomePetsCache = async (userId?: string | null) => {
  if (!userId) {
    homePetsMemoryCache.clear();
    homePetsInFlight.clear();
    homePetsInvalidationEpoch.clear();
    return;
  }
  for (const key of Array.from(homePetsMemoryCache.keys())) {
    if (key.startsWith(`huddle_home_pets:v3:${userId}:`)) {
      homePetsMemoryCache.delete(key);
      bumpHomePetsInvalidationEpochByKey(key);
    }
  }
  for (const key of Array.from(homePetsInvalidationEpoch.keys())) {
    if (key.startsWith(`huddle_home_pets:v3:${userId}:`)) {
      homePetsInvalidationEpoch.set(key, (homePetsInvalidationEpoch.get(key) ?? 0) + 1);
    }
  }
  bumpHomePetsInvalidationEpoch(userId);
  for (const key of Array.from(homePetsInFlight.keys())) {
    if (key.includes(`"userId":"${userId}"`) || key.startsWith(`huddle_home_pets:v2:${userId}:`)) {
      homePetsInFlight.delete(key);
      if (key.startsWith(`huddle_home_pets:v3:${userId}:`)) bumpHomePetsInvalidationEpochByKey(key);
    }
  }
  const keys = await readNativeDisplayCacheKeys();
  const removals = keys.filter((key) => key.startsWith(`huddle_home_pets:v2:${userId}:`) || key.startsWith(`huddle_home_pets:v3:${userId}:`));
  if (removals.length > 0) await AsyncStorage.multiRemove(removals).catch(() => undefined);
};

const fetchHomePets = async (userId: string, options: { force?: boolean; accessToken?: string | null; cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {}) => {
  if (!options.force) {
    const cached = readHomePetsMemoryCache(userId, options.sessionKey);
    if (cached) return cached;
  }

  const requestKey = getHomePetsCacheKey(userId, options.sessionKey);
  const requestEpoch = readHomePetsInvalidationEpoch(userId, options.sessionKey);
  const existing = homePetsInFlight.get(requestKey);
  // A force refresh means "do not trust an old cache", not "duplicate a request
  // already fetching the same session-scoped data". Joining the boot warm is
  // especially important when the four-second brand cap releases mid-request.
  if (existing) return existing;
  const request = (async () => {
    const token = await getFreshNativeAccessToken(options.accessToken);
    if (!token) throw new Error("home_pets_access_token_required");
    const parsed = await fetchNativeAccessiblePets(token);
    const rows: HomePet[] = (Array.isArray(parsed) ? parsed : [])
      .filter((pet) => typeof pet?.id === "string" && typeof pet.name === "string" && typeof pet.species === "string")
      .map((pet) => ({
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: typeof pet.breed === "string" ? pet.breed : null,
        weight: typeof pet.weight === "number" ? pet.weight : null,
        weight_unit: typeof pet.weight_unit === "string" ? pet.weight_unit : null,
        dob: typeof pet.dob === "string" ? pet.dob : null,
        photo_presentation: pet.photo_presentation && typeof pet.photo_presentation === "object" ? pet.photo_presentation : null,
        photo_url: typeof pet.photo_url === "string" ? pet.photo_url : null,
        is_active: typeof pet.is_active === "boolean" ? pet.is_active : null,
        updated_at: typeof pet.updated_at === "string" ? pet.updated_at : null,
        is_family_shared: typeof pet.is_family_shared === "boolean" ? pet.is_family_shared : false,
        shared_by_display_name: typeof pet.shared_by_display_name === "string" ? pet.shared_by_display_name : null,
      }));
    if (readHomePetsInvalidationEpoch(userId, options.sessionKey) !== requestEpoch) {
      throw new Error("home_pets_stale_after_invalidation");
    }
    if (options.cacheWriteGuard?.() !== false) writeHomePetsMemoryCache(userId, rows, options.sessionKey);
    return rows;
  })();

  homePetsInFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    homePetsInFlight.delete(requestKey);
  }
};

export const preloadNativeHomePets = (
  userId: string,
  options: { force?: boolean; accessToken?: string | null; cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {},
) => fetchHomePets(userId, options);

export const preloadNativeHomeNearbyPeople = async (options: {
  accessToken?: string | null;
  force?: boolean;
  sessionKey?: string | null;
  userId: string;
}): Promise<HomeNearbyPeopleCachePayload | null> => {
  const key = getHomeNearbyPeopleCacheKey(options.userId, options.sessionKey);
  if (!options.force) {
    const cached = readHomeNearbyPeopleMemoryCache(options.userId, options.sessionKey);
    if (cached) return cached;
  }
  const existing = homeNearbyPeopleInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const snapshot = await fetchNativeNearbyOutSnapshot(options.userId, options.accessToken).catch(() => null);
    // A failed canonical read is not an authoritative empty area. Preserve the
    // last good snapshot so Home and the Live Activity cannot flicker apart.
    if (!snapshot) return null;
    const outPeople = snapshot.companions.map((companion, index): HomePulsePerson => ({
      avatarBlurred: companion.isBlurred,
      id: companion.id,
      label: companion.isBlurred ? "Same area" : null,
      subLabel: null,
      displayName: companion.isBlurred ? null : companion.name,
      avatarUrl: companion.avatarUrl,
      rank: index,
    }));
    const payload: HomeNearbyPeopleCachePayload = {
      outPeople,
      matchedOut: outPeople.filter((person) => person.avatarBlurred !== true),
      nearbyOut: outPeople.filter((person) => person.avatarBlurred === true),
      totalCount: snapshot.totalCount,
      cachedAt: Date.now(),
    };
    homeNearbyPeopleMemoryCache.set(key, payload);
    return payload;
  })().finally(() => {
    if (homeNearbyPeopleInFlight.get(key) === request) homeNearbyPeopleInFlight.delete(key);
  });
  homeNearbyPeopleInFlight.set(key, request);
  return request;
};

const fetchHomeReminders = async (userId: string, petId: string, options: { accessToken?: string | null; force?: boolean } = {}) => {
  const cacheKey = `${userId}:${petId}:${todayISO()}`;

  if (!options.force) {
    const cached = readHomeRemindersMemoryCache(cacheKey);
    if (cached) return cached;
  }

  const existing = homeRemindersInFlight.get(cacheKey);
  if (!options.force && existing) return existing;

  const request = (async () => {
    const token = await getFreshNativeAccessToken(options.accessToken);
    if (!token) throw new Error("home_reminders_access_token_required");
    const params = new URLSearchParams({
      select: "id,pet_id,due_date,kind,reason",
      owner_id: `eq.${userId}`,
      pet_id: `eq.${petId}`,
      due_date: `gte.${todayISO()}`,
      order: "due_date.asc",
      limit: "50",
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/reminders?${params.toString()}`, {
      headers: createNativeAuthenticatedHeaders(token),
    });
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!response.ok) {
      throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
    }
    return writeHomeRemindersMemoryCache(cacheKey, (Array.isArray(parsed) ? parsed : []) as HomeReminder[]);
  })();

  homeRemindersInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    homeRemindersInFlight.delete(cacheKey);
  }
};


// Per-surface max age for app-resume re-validation. On foreground we drop the
// "already refreshed this session" mark for surfaces older than these windows so
// the sweep catches up stale data (quota/unread feel fresh, lists less eagerly),
// without reintroducing churn on quick re-mounts.
const HOME_FOREGROUND_STALE_MS: Partial<Record<RefreshSurface, number>> = {
  notification_unread: 60 * 1000,
  chat_unread: 60 * 1000,
  chat_inbox_summary: 60 * 1000,
  nearby_out_snapshot: 30 * 1000,
  profile_summary: 2 * 60 * 1000,
  tier_quota_restrictions: 2 * 60 * 1000,
  active_pets: 5 * 60 * 1000,
  map_shell: 5 * 60 * 1000,
  matched_rail_summary: 5 * 60 * 1000,
  viewer_location_scope: 10 * 60 * 1000,
  discover_cards: 15 * 60 * 1000,
  social_first_page_shell: 15 * 60 * 1000,
  service_cards: 15 * 60 * 1000,
  groups_invites: 15 * 60 * 1000,
};

export function NativeHomeScreen({ active = true, userId, accessToken, sessionGeneration, sessionKey, outNowContinueIntent = 0, onNavigate }: NativeHomeScreenProps) {
  const { height, width } = useWindowDimensions();
  const homeReduceMotion = useReducedMotion();
  const softCardCarouselRef = useAnimatedRef<Animated.ScrollView>();
  const softCardScrollX = useSharedValue(0);
  const softCardScrollHandler = useAnimatedScrollHandler((event) => { softCardScrollX.value = event.contentOffset.x; });
  const petsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionKeyRef = useRef<string | null>(sessionKey);
  const terminalHomePresenceAtRef = useRef<string | null>(null);
  const outNowCanonicalStartedAtRef = useRef<string | null>(null);
  // Populated by the activeOutNowExpiresAt effect below whenever it resolves
  // an avatar URL. A renewal reuses this instead of resetting the Live
  // Activity to a placeholder image every time -- only a true first start
  // (nothing resolved yet) shows the placeholder.
  const presenceAvatarUrlRef = useRef<string | null>(null);
  const outNowActionEpochRef = useRef(0);
  // Out and Back are terminal mutations of one presence window. Serializing
  // them guarantees a late Out response can never revive a session after Back.
  const [state, setState] = useState<LoadState>("loading");
  // Cache hydration is a fast-path, never a permanent render gate. Native
  // storage can fail to settle, so Home must always reach a retryable state.
  useNativeLoadingDeadline(state === "loading", {
    onTrip: () => {
      setState("error");
    },
  });
  const [profile, setProfile] = useState<NativeProfileSummary | null>(null);
  const profileRef = useRef<NativeProfileSummary | null>(null);
  const [quota, setQuota] = useState<NativeQuotaSnapshot | null>(null);
  const [pets, setPets] = useState<HomePet[]>([]);
  const [reminders, setReminders] = useState<HomeReminder[]>([]);
  const [selectedPetIndex, setSelectedPetIndex] = useState(0);
  const [selectedSoftCardIndex, setSelectedSoftCardIndex] = useState(0);
  const [dismissedSoftCards, setDismissedSoftCards] = useState<Set<HomeSoftCardId>>(() => new Set());
  const [outNowState, setOutNowState] = useState<HomeOutNowState>({ busy: false, error: "", nearbyCount: null });
  const [outNowLocationSettingsReason, setOutNowLocationSettingsReason] = useState<"permission" | "services" | null>(null);
  const [outNowTick, setOutNowTick] = useState(() => Date.now());
  // Auto-dismissing walk summary shown after "I'm back". The X closes it early;
  // otherwise it leaves on its own — no decision needed. Elapsed seconds come
  // straight from the server so the bear and the wording match the real walk.
  const [returnSummary, setReturnSummary] = useState<number | null>(null);
  const returnSummaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissReturnSummary = useCallback(() => {
    if (returnSummaryTimerRef.current) clearTimeout(returnSummaryTimerRef.current);
    returnSummaryTimerRef.current = null;
    setReturnSummary(null);
    hideNativeReturnBanner();
  }, []);
  const showReturnSummary = useCallback((elapsedSeconds: number) => {
    if (returnSummaryTimerRef.current) clearTimeout(returnSummaryTimerRef.current);
    setReturnSummary(elapsedSeconds);
    // Published to the window-level rail. Rendering it here would place it
    // inside mainRouteLayer's padding box, i.e. below the header.
    showNativeReturnBanner({ elapsedSeconds });
    returnSummaryTimerRef.current = setTimeout(() => {
      returnSummaryTimerRef.current = null;
      setReturnSummary(null);
      hideNativeReturnBanner();
    }, NATIVE_RETURN_BANNER_DURATION_MS);
  }, []);
  useEffect(() => () => {
    if (returnSummaryTimerRef.current) clearTimeout(returnSummaryTimerRef.current);
  }, []);
  const [outNowPresenceResolved, setOutNowPresenceResolved] = useState(false);
  const [pulse, setPulse] = useState<HomePulseState>(() => {
    const cachedCommunity = readHomeCommunityMemoryCache(userId, sessionKey);
    const cachedNearby = readHomeNearbyPeopleMemoryCache(userId, sessionKey);
    return {
      outPeople: cachedNearby?.outPeople ?? [],
      matchedOut: cachedNearby?.matchedOut ?? [],
      nearbyOut: cachedNearby?.nearbyOut ?? [],
      discover: cachedCommunity?.discover.slice(0, 8) ?? [],
      events: cachedCommunity?.events ?? [],
      suggestion: null,
    };
  });
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const wasActiveRef = useRef(active);
  useEffect(() => {
    outNowCanonicalStartedAtRef.current = null;
  }, [userId]);

  const softCardCarouselWidth = Math.max(
    width - huddlePetPhoto.bannerHorizontalMargin * 2,
    huddlePetPhoto.bannerMinWidth,
  );
  const emptySoftCardWidth = Math.max(width - huddleSpacing.x5 * 4, 240);
  const emptySoftCardHeight = emptySoftCardWidth / (1024 / 248);
  const carouselSoftCardHeight = softCardCarouselWidth / (1024 / 248);
  const loadingCardHeight = Math.min(Math.max(height * 0.52, 320), 500);
  const activePets = useMemo(() => pets.filter((pet) => pet.is_active !== false), [pets]);
  const activePetCount = activePets.length;
  const displayName = profile?.display_name?.trim() || "huddle";
  const firstName = displayName.split(/\s+/)[0] || "";
  const avatarInitial = firstName.charAt(0).toUpperCase() || "H";
  const hasProfileSummary = hasRenderableProfileSummary(profile);
  const hasPetProfile = activePetCount > 0;
  const hasProfileBasics = hasCompleteProfileBasics(profile);
  const verifiedProfile = isNativeVerifiedProfile(profile);
  const softCards = useMemo<HomeSoftCard[]>(() => {
    const candidates: HomeSoftCardCandidate[] = [];
    if (!hasPetProfile) {
      candidates.push({
        id: "pet",
        path: "/edit-pet-profile",
      });
    }
    if (!hasProfileBasics) {
      candidates.push({
        id: "profile",
        path: "/edit-profile",
      });
    }
    if (!verifiedProfile) {
      candidates.push({
        id: "verify",
        path: "/verify-identity",
      });
    }
    return candidates
      .filter((card) => !dismissedSoftCards.has(card.id))
      .map((card, slotIndex) => ({
        ...card,
        dismissColor: resolveHomeSoftCardDismissColor(slotIndex),
        image: resolveHomeSoftCardImage(card.id, slotIndex),
      }));
  }, [
    dismissedSoftCards,
    hasPetProfile,
    hasProfileBasics,
    verifiedProfile,
  ]);
  const noPetSoftCards = activePetCount === 0 ? softCards : [];
  const petUserSoftCards = activePetCount > 0 ? softCards : [];
  const canShowSoftCards = state === "ready";
  const visibleSoftCardCount = canShowSoftCards ? softCards.length : 0;
  const shouldShowProfileSummary = state === "ready" || hasProfileSummary;
  const outNowCountdown = formatOutNowCountdown(profile?.map_visible_until, outNowTick);
  // A cached profile can paint instantly, but only a foreground-confirmed
  // profile visibility window is allowed to render the active presence state.
  // This is the same map_visible_until truth used by Map's own-pin control.
  const isOutNowActive = outNowPresenceResolved && Boolean(outNowCountdown);
  const discoverTeasers = useMemo(() => {
    const viewerSpecies = new Set(activePets.map((pet) => normalizeHomePetSignal(pet.species)).filter(Boolean));
    const viewerBreeds = new Set(activePets.map((pet) => normalizeHomePetSignal(pet.breed)).filter(Boolean));
    return pulse.discover
      .map((person) => {
        const label = resolveHomeTeaserLabelAndRank({
          breeds: person.pets.map((pet) => pet.breed),
          hasPet: person.pets.length > 0 || person.petSpecies.length > 0,
          roles: person.socialRoles,
          species: [...person.petSpecies, ...person.pets.map((pet) => pet.species)],
          viewerBreeds,
          viewerSpecies,
        });
        return {
          avatarBlurred: true,
          id: person.id,
          label: label.label,
          subLabel: label.subLabel,
          displayName: null,
          avatarUrl: person.avatarUrl,
          rank: label.rank,
        } satisfies HomePulsePerson;
      })
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 8);
  }, [activePets, pulse.discover]);
  // Which card owns the top slot. When the pet banner is the top card the header
  // pet rail hides — the banner already IS the pets, no duplication.
  const heroMode: "out" | "lively" | "pet" = isOutNowActive ? "out" : (outNowState.nearbyCount ?? 0) > 0 ? "lively" : "pet";
  currentSessionKeyRef.current = sessionKey;
  profileRef.current = profile;

  useEffect(() => {
    let active = true;
    const loadDismissed = async () => {
      if (!userId) {
        if (active) setDismissedSoftCards((current) => current.size === 0 ? current : new Set());
        return;
      }
      const entries = await Promise.all(
        (["pet", "profile", "verify"] as HomeSoftCardId[]).map(async (cardId) => {
          const raw = await readNativeDisplayCacheItem(homeSoftDismissKey(userId, cardId));
          const dismissedAt = Number(raw || 0);
          return Date.now() - dismissedAt < HOME_SOFT_CARD_DISMISS_MS ? cardId : null;
        }),
      );
      if (active) {
        const nextDismissed = new Set(entries.filter((item): item is HomeSoftCardId => Boolean(item)));
        setDismissedSoftCards((current) => {
          if (current.size === nextDismissed.size && Array.from(current).every((item) => nextDismissed.has(item))) return current;
          return nextDismissed;
        });
      }
    };
    void loadDismissed();
    return () => {
      active = false;
    };
  }, [userId, sessionGeneration]);

  // 1s tick while out-now is active so the hero clock/ring stay live; a lazy 30s
  // tick otherwise (only needed to notice map_visible_until expiring).
  const outNowTickFast = Boolean(formatOutNowClock(profile?.map_visible_until, outNowTick));
  useEffect(() => {
    const timer = setInterval(() => setOutNowTick(Date.now()), outNowTickFast ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [outNowTickFast]);
  const activeOutNowExpiresAt = useMemo(() => {
    const mapVisibleUntil = String(profile?.map_visible_until ?? "").trim();
    if (mapVisibleUntil && formatOutNowClock(mapVisibleUntil, Date.now())) return mapVisibleUntil;
    return "";
  }, [profile?.map_visible_until, outNowTick]);
  useEffect(() => {
    if (!activeOutNowExpiresAt || !profile) return;
    const expiresAt = activeOutNowExpiresAt;
    const progressStartedAt = new Date(Math.max(0, new Date(expiresAt).getTime() - OUT_NOW_WINDOW_MS)).toISOString();
    let cancelled = false;
    (async () => {
      const clock = await getNativeOutNowSessionClock({ accessToken, expectedUserId: userId }).catch(() => null);
      if (clock?.startedAt) outNowCanonicalStartedAtRef.current = clock.startedAt;
      const startedAt = clock?.startedAt || outNowCanonicalStartedAtRef.current;
      // Never replace the immutable whole-walk clock with the current
      // two-hour progress window during a transient clock read failure.
      if (!startedAt) return;
      const selfAvatarUrl = await resolveNativeProfileImageUrlAsync(profile.avatar_url, 60 * 60, { defaultBucket: "profile_photos" }).catch(() => null);
      if (cancelled) return;
      if (selfAvatarUrl) presenceAvatarUrlRef.current = selfAvatarUrl;
      // The Lock Screen uses Home's ordered nearby-out truth: matched friends
      // first, followed by privacy-blurred nearby non-friends.
      const companions = buildActiveOutCompanions(pulse.outPeople);
      if (__DEV__) console.log("[HUDDLE_ACTIVE_OUT_TRACE]", {
        event: "home_update_payload",
        ...activeOutCompanionTrace(companions, pulse.outPeople.length),
      });
      void updateHomePresenceActivity({
        startedAt,
        progressStartedAt,
        expiresAt,
        selfAvatarUrl,
        companions,
        companionsTotalCount: pulse.outPeople.length,
        friendCount: pulse.matchedOut.length,
        nearbyUserCount: pulse.nearbyOut.length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeOutNowExpiresAt, profile, pulse.matchedOut.length, pulse.nearbyOut.length, pulse.outPeople]);
  const refreshHomeNearbyPins = useCallback(async (options: { force?: boolean } = {}) => {
    if (!userId) return;
    let loaded: HomeNearbyPeopleCachePayload | null = null;
    if (sessionKey) {
      const fetchCanonicalNearby = async (force: boolean) => {
        const payload = await preloadNativeHomeNearbyPeople({ userId, accessToken, sessionKey, force });
        if (!payload) throw new Error("nearby_out_snapshot_unavailable");
        return payload;
      };
      // A post-mutation force refresh must represent the state after the write.
      // If boot still owns an older read, join it first and then run exactly one
      // queued canonical refresh instead of racing two snapshots.
      if (options.force && freshnessRegistry.isInFlight(sessionKey, "nearby_out_snapshot")) {
        await freshnessRegistry.runOnce(sessionKey, "nearby_out_snapshot", () => fetchCanonicalNearby(false)).catch(() => null);
      }
      if (options.force && !freshnessRegistry.isInFlight(sessionKey, "nearby_out_snapshot")) {
        freshnessRegistry.invalidate(sessionKey, ["nearby_out_snapshot"]);
      }
      const result = await freshnessRegistry.runOnce(
        sessionKey,
        "nearby_out_snapshot",
        () => fetchCanonicalNearby(options.force === true),
      ).catch(() => null);
      loaded = result?.value ?? readHomeNearbyPeopleMemoryCache(userId, sessionKey);
    } else {
      loaded = await preloadNativeHomeNearbyPeople({ userId, accessToken, sessionKey, force: options.force === true });
    }
    if (!loaded) return;
    setOutNowState((current) => ({ ...current, nearbyCount: loaded.totalCount }));
    setPulse((current) => ({
      ...current,
      outPeople: loaded.outPeople,
      matchedOut: loaded.matchedOut,
      nearbyOut: loaded.nearbyOut,
    }));
  }, [accessToken, sessionKey, userId]);

  useEffect(() => {
    const expiresMs = parseHomeTimestampMs(profile?.map_visible_until);
    if (expiresMs === null || expiresMs <= Date.now()) return undefined;
    const timer = setTimeout(() => {
      setProfile((current) => current ? { ...current, map_visible_until: new Date().toISOString() } : current);
      void refreshHomeNearbyPins({ force: true });
    }, Math.max(0, expiresMs - Date.now() + 500));
    return () => clearTimeout(timer);
  }, [profile?.map_visible_until, refreshHomeNearbyPins]);

  // Pulse content beyond pins: upcoming group events (soonest first) for the
  // carousel, warm Discover faces for the fallback people row, and a species
  // group suggestion when no events exist. All fail soft — a missing surface
  // hides its section instead of blocking Home.
  useEffect(() => {
    if (state !== "ready" || !userId) return;
    let cancelled = false;
    (async () => {
      const cached = await readHomeCommunityCache(userId, sessionKey);
      if (cached && !cancelled) {
        setPulse((current) => ({
          ...current,
          events: cached.events,
          discover: cached.discover.slice(0, 8),
          suggestion: resolveHomeGroupSuggestion(cached.events, cached.groups, activePets),
        }));
      }
      const freshAccessToken = await getFreshNativeAccessToken(accessToken, userId);
      if (!freshAccessToken || cancelled) return;
      // A Map pin can become active while Home remains mounted. Resolve the
      // scope again at that transition so the Home Discover preview immediately
      // uses the newly available location instead of a pre-pin country scope.
      const viewerScope = activeOutNowExpiresAt
        ? await resolveNativeViewerScope({ userId, accessToken: freshAccessToken, sessionKey, force: true }).catch(() => null)
        : (await readCachedNativeViewerScope(userId, { sessionKey }).catch(() => null))
          ?? (await resolveNativeViewerScope({ userId, accessToken: freshAccessToken, sessionKey }).catch(() => null));
      if (cancelled) return;
      const effectiveTier = profile?.effective_tier || profile?.tier || null;
      const loaded = await preloadNativeHomeCommunityBundle({ userId, accessToken: freshAccessToken, sessionKey, effectiveTier, viewerScope, includeDiscover: isNativeProfileAtLeastAge(profile?.dob, 16) !== false });
      if (cancelled) return;
      if (loaded) {
        setPulse((current) => ({
          ...current,
          events: loaded.events,
          discover: loaded.discover.slice(0, 8),
          suggestion: resolveHomeGroupSuggestion(loaded.events, loaded.groups, activePets),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeOutNowExpiresAt, activePets, profile?.dob, profile?.effective_tier, profile?.tier, sessionKey, state, userId]);

  useEffect(() => {
    if (state !== "ready" || !userId || !accessToken) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const refreshCommunity = () => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (disposed) return;
        void (async () => {
          const freshAccessToken = await getFreshNativeAccessToken(accessToken, userId);
          if (!freshAccessToken || disposed) return;
          const viewerScope = (await readCachedNativeViewerScope(userId, { sessionKey }).catch(() => null))
            ?? (await resolveNativeViewerScope({ userId, accessToken: freshAccessToken, sessionKey }).catch(() => null));
          if (disposed) return;
          const loaded = await preloadNativeHomeCommunityBundle({
            userId,
            accessToken: freshAccessToken,
            sessionKey,
            effectiveTier: profile?.effective_tier || profile?.tier || null,
            includeDiscover: isNativeProfileAtLeastAge(profile?.dob, 16) !== false,
            viewerScope,
          });
          if (!loaded || disposed) return;
          setPulse((current) => ({
            ...current,
            events: loaded.events,
            discover: loaded.discover.slice(0, 8),
            suggestion: resolveHomeGroupSuggestion(loaded.events, loaded.groups, activePets),
          }));
        })();
      }, 250);
    };
    const channelName = `home-community-events-${userId}`;
    const handle = createSinglePrivateBroadcastChannel(
      channelName,
      `user:${userId}:home`,
      refreshCommunity,
      (status) => {
        if (status === "SUBSCRIBED") refreshCommunity();
      },
    );
    return () => {
      disposed = true;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      void handle.dispose();
    };
  }, [accessToken, activePets, profile?.dob, profile?.effective_tier, profile?.tier, sessionKey, state, userId]);

  useEffect(() => {
    if (state !== "ready" || !userId) return;
    void refreshHomeNearbyPins();
  }, [refreshHomeNearbyPins, state, userId]);

  const homeMapRealtimeTopicsKey = useMemo(() => {
    const lat = Number(profile?.last_lat);
    const lng = Number(profile?.last_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    return mapRealtimeTopicsForCenters([[lng, lat]]).join(",");
  }, [profile?.last_lat, profile?.last_lng]);

  useEffect(() => {
    if (state !== "ready" || !userId || !homeMapRealtimeTopicsKey) return undefined;
    const handles = homeMapRealtimeTopicsKey.split(",").map((topic) =>
      createSinglePrivateBroadcastChannel(
        `home-map-cell:${userId}:${topic}`,
        topic,
        () => {
          void refreshHomeNearbyPins({ force: true });
        },
      ));
    return () => { handles.forEach((handle) => { void handle.dispose(); }); };
  }, [homeMapRealtimeTopicsKey, refreshHomeNearbyPins, state, userId]);

  const dismissSoftCard = (cardId: HomeSoftCardId) => {
    if (!userId) return;
    setDismissedSoftCards((current) => current.has(cardId) ? current : new Set([...Array.from(current), cardId]));
    void AsyncStorage.setItem(homeSoftDismissKey(userId, cardId), String(Date.now()));
  };
  const resetSoftCardsForDebug = __DEV__ ? () => {
    if (!userId) return;
    setDismissedSoftCards(new Set());
    void AsyncStorage.multiRemove((["pet", "profile", "verify"] as HomeSoftCardId[]).map((cardId) => homeSoftDismissKey(userId, cardId)));
  } : undefined;
  void LOAD_PHASE_DEFINITIONS;

  const queueOutNowMutation = useCallback(<T,>(intent: NativePresenceIntentToken, mutation: () => Promise<T>) => {
    return enqueueNativePresenceMutation(intent, mutation);
  }, []);

  const handleOutNow = useCallback(async ({ renewalOnly = false }: { renewalOnly?: boolean } = {}) => {
    if (!userId || outNowState.busy) return;
    const actionEpoch = ++outNowActionEpochRef.current;
    const presenceIntent = beginNativePresenceIntent(userId, "active");
    const isCurrentAction = () => active
      && actionEpoch === outNowActionEpochRef.current
      && isCurrentNativePresenceIntent(presenceIntent);
    if (!renewalOnly) outNowCanonicalStartedAtRef.current = null;
    setOutNowState((current) => ({ ...current, busy: true, error: "" }));
    let usedSavedLocation = false;
    try {
      const freshAccessTokenPromise = getFreshNativeAccessToken(accessToken, userId);
      let freshAccessToken: string | null = null;
      const requireFreshAccessToken = async () => {
        freshAccessToken ??= await freshAccessTokenPromise;
        if (!freshAccessToken) throw new Error("missing_access_token");
        return freshAccessToken;
      };

      // A lock-screen continuation renews solely from the last location the
      // server already owns. It must never touch the permission flow, open
      // Settings, or surface an error: a user could only have started this
      // session after an earlier successful Out Now location action.
      usedSavedLocation = renewalOnly;
      let freshCoords: { lat: number; lng: number } | null = null;
      let renewedClock: { startedAt: string; expiresAt: string } | null = null;
      if (renewalOnly) {
        try {
          const renewalAccessToken = await requireFreshAccessToken();
          if (!isCurrentAction()) return;
          const renewalResult = await queueOutNowMutation(presenceIntent, () => renewNativeUserOutNowWithClock({
            accessToken: renewalAccessToken,
            expectedUserId: userId,
          }));
          if (!renewalResult) return;
          renewedClock = renewalResult;
          if (!isCurrentAction()) return;
        } catch (error) {
          if (!String((error as Error)?.message || error || "").includes("out_now_saved_location_missing")) throw error;
          // An inconsistent legacy session has no server location to renew.
          // End it quietly; never turn a passive continuation into a new
          // location or Settings request.
          return;
        }
      }
      if (!renewalOnly) {
        const retainedCoordinates = typeof profileRef.current?.last_lat === "number"
          && typeof profileRef.current?.last_lng === "number"
          && Number.isFinite(profileRef.current.last_lat)
          && Number.isFinite(profileRef.current.last_lng)
          ? { lat: profileRef.current.last_lat, lng: profileRef.current.last_lng }
          : null;
        const location = await requestNativeLocationForPin({ retainedCoordinates });
        if (location.status === "settings_required") {
          if (isCurrentAction()) setOutNowLocationSettingsReason(location.reason);
          throw new Error(location.reason === "permission" ? "location_permission_denied" : "location_services_disabled");
        }
        // "unavailable" is a normal, common outcome now, not a failure:
        // requestNativeLocationForPin never waits on a live GPS fix, because
        // the map only ever shows an approximate ~500m cell. Fall through to
        // the server-side saved-location start below -- the tap must never
        // block on GPS to become deterministic.
        freshCoords = location.status === "ready" ? location.coords : null;
        const authenticatedAccessToken = await requireFreshAccessToken();
        if (!isCurrentAction()) return;
        if (freshCoords) {
          const outNowCoords = freshCoords;
          const pinResult = await queueOutNowMutation(presenceIntent, () => pinNativeUserOutNow(userId, outNowCoords.lat, outNowCoords.lng, null, { accessToken: authenticatedAccessToken }));
          if (!pinResult) return;
          renewedClock = pinResult;
          if (!isCurrentAction()) return;
          if (__DEV__) console.log("[HUDDLE_OUT_NOW]", { event: "fresh_location_pin_ok" });
        } else {
          // No cached, retained, or last-known coordinate exists on-device.
          // The server uses the authenticated user's last saved pin instead;
          // this never invents a location or carries a prior walk's elapsed time.
          usedSavedLocation = true;
          const savedLocationResult = await queueOutNowMutation(presenceIntent, () => startNativeUserOutNowFromSavedLocation({
            accessToken: authenticatedAccessToken,
            expectedUserId: userId,
          }));
          if (!savedLocationResult) return;
          renewedClock = savedLocationResult;
          if (!isCurrentAction()) return;
          if (__DEV__) console.log("[HUDDLE_OUT_NOW]", { event: "saved_location_start_ok", reason: "fresh_location_unavailable" });
        }
      }
      // renewedClock is already a server-confirmed window -- both branches
      // above `return` early on a falsy result, so it is guaranteed set here.
      // Flip to "out now" and start the Live Activity from it immediately.
      // Everything after this point (profile summary refresh, nearby-pin
      // refresh) is best-effort polish and must never gate the tap: if the
      // user backgrounds the app a moment after tapping, the banner and the
      // Live Activity must already be live, not waiting on a second network
      // round trip.
      if (!renewedClock?.startedAt || !Number.isFinite(Date.parse(renewedClock.expiresAt))) {
        throw new Error("out_now_visibility_missing");
      }
      const startedAt = renewedClock.startedAt;
      const expiresAt = renewedClock.expiresAt;
      const expiresAtMs = Date.parse(expiresAt);
      const progressStartedAt = new Date(Math.max(0, expiresAtMs - OUT_NOW_WINDOW_MS)).toISOString();
      outNowCanonicalStartedAtRef.current = startedAt;
      const companions = buildActiveOutCompanions(pulse.outPeople);
      if (__DEV__) console.log("[HUDDLE_ACTIVE_OUT_TRACE]", {
        event: "home_start_payload",
        ...activeOutCompanionTrace(companions, pulse.outPeople.length),
      });
      // Reuse whatever avatar was last resolved (a renewal's activity is
      // already running with a correct one) instead of waiting on a fresh
      // resolve. Only a genuine first-ever start has nothing cached, and
      // falls back to a placeholder. The activeOutNowExpiresAt effect below
      // (keyed on profile.map_visible_until, which setProfile sets a few
      // lines down) independently resolves and patches in a fresh avatar via
      // updateHomePresenceActivity moments later either way.
      void startHomePresenceActivity({
        startedAt,
        progressStartedAt,
        expiresAt,
        selfAvatarUrl: presenceAvatarUrlRef.current,
        companions,
        companionsTotalCount: pulse.outPeople.length,
        friendCount: pulse.matchedOut.length,
        nearbyUserCount: pulse.nearbyOut.length,
      });
      setProfile((current) => current ? {
        ...current,
        ...(freshCoords ? { last_lat: freshCoords.lat, last_lng: freshCoords.lng } : {}),
        map_visible_until: expiresAt,
      } : current);
      setOutNowPresenceResolved(true);
      void patchNativeProfileSummaryCache(userId, {
        ...(freshCoords ? { last_lat: freshCoords.lat, last_lng: freshCoords.lng } : {}),
        map_visible_until: expiresAt,
      }, { sessionKey, createIfMissing: true });
      haptic.presenceOut();

      // Secondary, non-blocking: reconcile with the server's canonical
      // profile (quota, a later map_visible_until from another device, etc.)
      // and refresh nearby pins. Neither gates anything the user has already
      // seen above.
      freshAccessToken = await requireFreshAccessToken();
      void fetchNativeProfileSummary(userId, { force: true, accessToken: freshAccessToken, sessionKey })
        .then((profileSummary) => {
          if (!isCurrentAction() || !profileSummary?.profile) return;
          const serverMapVisibleUntil = String(profileSummary.profile.map_visible_until ?? "").trim();
          const laterExpiresAt = [serverMapVisibleUntil, expiresAt]
            .filter(Boolean)
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || expiresAt;
          setProfile({ ...profileSummary.profile, map_visible_until: laterExpiresAt });
          setQuota(profileSummary.quota);
        })
        .catch(() => undefined);
      void refreshHomeNearbyPins({ force: true }).catch(() => undefined);
    } catch (error) {
      if (!isCurrentAction()) return;
      haptic.error();
      const message = String((error as Error)?.message || error || "");
      const normalizedMessage = message.toLowerCase();
      const locationSettingsRequired = normalizedMessage.includes("location_settings_required")
        || normalizedMessage.includes("location_permission_denied")
        || normalizedMessage.includes("location_services_disabled");
      setOutNowState((current) => ({
        ...current,
        error: locationSettingsRequired
          ? ""
          : normalizedMessage.includes("missing_access_token")
            ? "Please sign in again."
            : normalizedMessage.includes("out_now_saved_location_missing") || normalizedMessage.includes("location_unavailable")
              ? "We can't get your location yet. Check your signal and try again."
              : normalizedMessage.includes("network")
                || normalizedMessage.includes("fetch")
                || normalizedMessage.includes("timeout")
                ? "We couldn't reach huddle. Check your connection and try again."
                : "We couldn't update your Out Now status. Try again in a moment.",
      }));
      if (__DEV__) console.log("[HUDDLE_OUT_NOW]", {
        event: "out_now_failed",
        renewalOnly,
        usedSavedLocation,
        message,
      });
    } finally {
      if (actionEpoch === outNowActionEpochRef.current) setOutNowState((current) => ({ ...current, busy: false }));
    }
  }, [accessToken, active, outNowState.busy, pulse.matchedOut.length, pulse.nearbyOut.length, pulse.outPeople, queueOutNowMutation, refreshHomeNearbyPins, sessionKey, userId]);

  const handleReturned = useCallback(async () => {
    if (!userId) return;
    const actionEpoch = ++outNowActionEpochRef.current;
    const presenceIntent = beginNativePresenceIntent(userId, "inactive");
    // Back is a terminal user choice. Home and Map change immediately; the
    // shared mutation lane finishes the backend write without blocking either.
    setOutNowState((current) => ({ ...current, busy: false, error: "" }));
    const stoppedAt = new Date().toISOString();
    terminalHomePresenceAtRef.current = stoppedAt;
    setProfile((current) => current ? { ...current, map_visible_until: stoppedAt } : current);
    void patchNativeProfileSummaryCache(userId, { map_visible_until: stoppedAt }, { sessionKey, createIfMissing: true });
    try {
      const freshAccessToken = await getFreshNativeAccessToken(accessToken, userId);
      if (!freshAccessToken) throw new Error("missing_access_token");
      const returned = await queueOutNowMutation(presenceIntent, () => returnNativeUserOutNow({
        accessToken: freshAccessToken,
        expectedUserId: userId,
      }));
      if (!returned || actionEpoch !== outNowActionEpochRef.current || !isCurrentNativePresenceIntent(presenceIntent)) return;
      outNowCanonicalStartedAtRef.current = null;
      // returned is already the server-confirmed terminal record -- end the
      // Live Activity, show the duration summary, and haptic immediately.
      // Everything after this point (profile summary refresh, nearby-pin
      // refresh) is best-effort reconciliation and must never gate the tap:
      // if the user backgrounds the app a moment after tapping "I'm back",
      // the Live Activity must already be torn down, not waiting on a second
      // network round trip.
      const returnSummary = returned.finalMessage;
      void endHomePresenceActivity({ finalMessage: returnSummary });
      showReturnSummary(returned.elapsedSeconds);
      haptic.success();

      // Secondary, non-blocking: reconcile with the server's canonical
      // profile (quota, etc.) and refresh nearby pins.
      void fetchNativeProfileSummary(userId, { force: true, accessToken: freshAccessToken, sessionKey })
        .catch(() => null)
        .then((profileSummary) => {
          if (actionEpoch !== outNowActionEpochRef.current || !isCurrentNativePresenceIntent(presenceIntent)) return;
          if (profileSummary?.profile) {
            setProfile(profileSummary.profile);
            setQuota(profileSummary.quota);
          } else {
            setProfile((current) => current ? { ...current, map_visible_until: new Date().toISOString() } : current);
          }
        });
      void refreshHomeNearbyPins({ force: true })
        .catch(() => undefined)
        .then(() => {
          if (actionEpoch === outNowActionEpochRef.current && isCurrentNativePresenceIntent(presenceIntent)) terminalHomePresenceAtRef.current = null;
        });
    } catch (error) {
      if (actionEpoch !== outNowActionEpochRef.current || !isCurrentNativePresenceIntent(presenceIntent)) return;
      haptic.error();
      const message = String((error as Error)?.message || error || "");
      setOutNowState((current) => ({
        ...current,
        error: message.includes("missing_access_token")
          ? "Please sign in again."
          : "Your map is unpinned. Check your connection to finish syncing.",
      }));
    } finally {
      if (actionEpoch === outNowActionEpochRef.current && isCurrentNativePresenceIntent(presenceIntent)) setOutNowState((current) => ({ ...current, busy: false }));
    }
  }, [accessToken, queueOutNowMutation, refreshHomeNearbyPins, sessionKey, showReturnSummary, userId]);

  useEffect(() => {
    if (state !== "ready" || !userId || outNowState.busy) return;
    let cancelled = false;
    void (async () => {
      const requested = await readNativeDisplayCacheItem(OUT_NOW_CONTINUE_REQUEST_KEY);
      if (requested !== "1" || cancelled) return;
      // Consume before starting so an AppState/mount replay cannot create an
      // extra map window. handleOutNow remains the single owner of renewal.
      await AsyncStorage.removeItem(OUT_NOW_CONTINUE_REQUEST_KEY).catch(() => undefined);
      if (!cancelled) void handleOutNow({ renewalOnly: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [handleOutNow, outNowContinueIntent, outNowState.busy, state, userId]);

  const runHomeFreshnessSweep = useCallback(async (freshnessSession: HomeFreshnessSession) => {
    const sessionKeyForWrite = freshnessSession.sessionKey;
    if (!freshnessSession.accessToken || !sessionKeyForWrite) return;

    const isCurrentFreshnessSession = () => (
      userId === freshnessSession.userId &&
      accessToken === freshnessSession.accessToken &&
      isCurrentSessionKey(currentSessionKeyRef.current, sessionKeyForWrite)
    );
    const guardedCacheWrite = () => cacheWriteGuard(currentSessionKeyRef.current, sessionKeyForWrite);
    const runSurface = async <T,>(surface: RefreshSurface, task: () => Promise<T>) => (
      freshnessRegistry.runOnce(sessionKeyForWrite, surface, async () => {
        if (!isCurrentFreshnessSession()) throw new Error("stale_session_before_refresh");
        return task();
      })
    );

    try {
      const [profileResult, petsResult, coordsResult] = await Promise.allSettled([
        runSurface("profile_summary", () => fetchNativeProfileSummary(freshnessSession.userId, { force: true, accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, cacheWriteGuard: guardedCacheWrite })),
        runSurface("active_pets", () => fetchHomePets(freshnessSession.userId, { force: true, accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, cacheWriteGuard: guardedCacheWrite })),
        runSurface("viewer_location_scope", () => resolveNativeViewerScope({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite })),
        runSurface("tier_quota_restrictions", () => fetchNativeRestrictionsSnapshot({ force: true })),
        runSurface("notification_unread", () => fetchNativeUnreadNotificationCountWithToken(
          freshnessSession.userId,
          freshnessSession.accessToken,
          { sessionKey: sessionKeyForWrite, cacheWriteGuard: guardedCacheWrite },
        )),
        runSurface("chat_unread", () => fetchNativeChatUnreadTotal(freshnessSession.userId, { accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, cacheWriteGuard: guardedCacheWrite })),
        runSurface("chat_inbox_summary", () => fetchNativeChatInbox({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, scope: "all", onlyWithActivity: true, limit: 20, force: true, forceDb: true, cacheWriteGuard: guardedCacheWrite })),
      ]);

      if (!isCurrentFreshnessSession()) return;

      const profileSnapshot = profileResult.status === "fulfilled" ? profileResult.value.value ?? null : null;
      if (profileSnapshot?.profile) {
        setProfile(profileSnapshot.profile);
        setQuota(profileSnapshot.quota);
        setOutNowPresenceResolved(true);
      }
      if (petsResult.status === "fulfilled" && Array.isArray(petsResult.value.value)) {
        const nextPets = petsResult.value.value;
        setPets(nextPets);
        if (guardedCacheWrite()) void writeHomePetsCache(freshnessSession.userId, nextPets, sessionKeyForWrite);
      }
      const viewerScope = coordsResult.status === "fulfilled" ? coordsResult.value.value ?? null : null;
      const primaryPoint = viewerScope?.primaryPoint ?? null;
      const locationCountry = viewerScope?.country ?? null;
      const effectiveTier = typeof profileSnapshot?.profile?.effective_tier === "string"
        ? profileSnapshot.profile.effective_tier
        : typeof profileSnapshot?.quota?.effective_tier === "string"
          ? profileSnapshot.quota.effective_tier
          : typeof profileSnapshot?.profile?.tier === "string"
            ? profileSnapshot.profile.tier
            : null;

      const guardedP1 = async (surface: RefreshSurface, task: () => Promise<unknown>) => {
        if (!isCurrentFreshnessSession()) return;
        await runSurface(surface, task);
      };

      // Usage-weighted warming: only speculatively warm secondary tabs the user
      // actually opens (new users + recent visitors warm all). Matched rail and
      // chat inbox stay always-on because they are core chat surfaces.
      const warmEligible = await resolveWarmEligibleNativeSurfaces(freshnessSession.userId, ["social", "service", "chats"]);
      if (!isCurrentFreshnessSession()) return;

      await Promise.allSettled([
        warmEligible.has("chats")
          && isNativeProfileAtLeastAge(profileSnapshot?.profile?.dob, 16) !== false
          ? guardedP1("discover_cards", () => fetchNativeChatDiscoveryProfiles(freshnessSession.userId, HOME_DISCOVERY_WARM_FILTERS, { accessToken: freshnessSession.accessToken, effectiveTier, force: true, cacheWriteGuard: guardedCacheWrite, viewerScope }))
          : Promise.resolve(),
        warmEligible.has("social")
          ? guardedP1("social_first_page_shell", () => warmNativeSocialFirstPageCache({
            accessToken: freshnessSession.accessToken,
            sessionKey: sessionKeyForWrite,
            userId: freshnessSession.userId,
            viewerScope,
          }))
          : Promise.resolve(),
        warmEligible.has("service")
          ? guardedP1("service_cards", () => fetchNativeServiceProviders({
            userId: freshnessSession.userId,
            accessToken: freshnessSession.accessToken,
            sessionKey: sessionKeyForWrite,
            anchor: primaryPoint ? { lat: primaryPoint.lat, lng: primaryPoint.lng } : null,
            viewerCountry: locationCountry,
            viewerScope,
            force: true,
            cacheWriteGuard: guardedCacheWrite,
          }))
          : Promise.resolve(),
        warmEligible.has("chats")
          ? guardedP1("groups_invites", () => fetchNativeExploreGroups({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken, force: true, cacheWriteGuard: guardedCacheWrite, viewerScope }))
          : Promise.resolve(),
        guardedP1("matched_rail_summary", () => fetchNativeChatInbox({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, scope: "friends", onlyWithActivity: true, limit: 20, force: true, forceDb: true, cacheWriteGuard: guardedCacheWrite })),
      ]);
    } catch {
      // Home freshness is cache-repair work; screen state stays user-safe on failures.
    }
  }, [accessToken, userId]);

  const loadHome = useCallback(async ({ showLoading = false, forceDb = false }: { showLoading?: boolean; forceDb?: boolean } = {}) => {
    if (!userId) {
      const emptyProfile: NativeProfileSummary | null = null;
      const emptyQuota: NativeQuotaSnapshot | null = null;
      setState("ready");
      setProfile(emptyProfile);
      setQuota(emptyQuota);
      setPets([]);
      setReminders([]);
      return;
    }

    if (showLoading) {
      setState("loading");
    }
    try {
      const guardedCacheWrite = sessionKey ? () => cacheWriteGuard(currentSessionKeyRef.current, sessionKey) : undefined;
      const [profileSummary, nextPets] = await Promise.all([
        fetchNativeProfileSummary(userId, { force: forceDb, accessToken, sessionKey, cacheWriteGuard: guardedCacheWrite }),
        // Loading UI and cache policy are separate. A first-paint fallback may
        // show the loading state, but it must still consume the boot warm/cache
        // instead of re-querying pets after the four-second gate has completed.
        fetchHomePets(userId, { force: forceDb, accessToken, sessionKey, cacheWriteGuard: guardedCacheWrite }),
      ]);

      const terminalUntil = terminalHomePresenceAtRef.current;
      const terminalMs = Date.parse(String(terminalUntil || ""));
      const serverVisibleMs = Date.parse(String(profileSummary.profile?.map_visible_until || ""));
      const nextProfile = profileSummary.profile && Number.isFinite(terminalMs) && Number.isFinite(serverVisibleMs) && serverVisibleMs > terminalMs + 1000
          ? { ...profileSummary.profile, map_visible_until: terminalUntil }
          : profileSummary.profile;
      const nextQuota = profileSummary.quota;
      setProfile(nextProfile);
      setQuota(nextQuota);
      setOutNowPresenceResolved(true);
      setPets(nextPets);
      if (sessionKey && guardedCacheWrite?.() !== false) void writeHomePetsCache(userId, nextPets, sessionKey);
      setSelectedPetIndex(0);
      if (nextPets.length === 0) setReminders([]);
      setState("ready");
    } catch (error) {
      if (__DEV__) {
        console.warn("[native.home] load_failed", error);
      }
      if (showLoading) setState("error");
    }
  }, [accessToken, sessionKey, userId]);

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      outNowActionEpochRef.current += 1;
      setOutNowLocationSettingsReason(null);
      setPublicProfileOpen(false);
      return;
    }
    if (!becameActive) return;
    setPublicProfileOpen(false);
    // Home stays mounted and its mutation/realtime owners patch committed state.
    // Ordinary tab navigation must not restart cache, disk or network work.
  }, [active]);

  useEffect(() => {
    if (!userId) return;
    void touchNativeLastActive(userId);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      void loadHome({ showLoading: true });
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const [cachedPets, cachedProfile] = await Promise.all([
        readHomePetsCache(userId, sessionKey),
        readCachedNativeProfileSummary(userId, { sessionKey }),
      ]);
      if (cancelled) return;
      if (cachedProfile) {
        setProfile(cachedProfile.profile);
        setQuota(cachedProfile.quota);
      }
      if (cachedPets && cachedProfile && hasRenderableProfileSummary(cachedProfile.profile)) {
        setPets(cachedPets);
        setSelectedPetIndex(0);
        setState("ready");
        if (accessToken && sessionKey) void runHomeFreshnessSweep({ userId, accessToken, sessionGeneration, sessionKey });
        return;
      }
      void loadHome({ showLoading: true }).then(() => {
        if (!cancelled && accessToken && sessionKey) void runHomeFreshnessSweep({ userId, accessToken, sessionGeneration, sessionKey });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadHome, runHomeFreshnessSweep, sessionGeneration, sessionKey, userId]);

  useEffect(() => {
    if (!userId || !accessToken || !sessionKey || state !== "ready") return;
    void runHomeFreshnessSweep({ userId, accessToken, sessionGeneration, sessionKey });
  }, [accessToken, runHomeFreshnessSweep, sessionGeneration, sessionKey, state, userId]);

  useEffect(() => {
    if (!userId || !accessToken || !sessionKey) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        // A Lock Screen "I'm back" intent updates the server while React Native is
        // suspended. Presence is an interaction-critical exception to the normal
        // foreground freshness window: re-read it every time the app resumes so
        // Home never leaves the completed session rendered as active.
        freshnessRegistry.invalidate(sessionKey, ["profile_summary", "viewer_location_scope", "map_shell"]);
        freshnessRegistry.invalidateStale(sessionKey, HOME_FOREGROUND_STALE_MS);
        void runHomeFreshnessSweep({ userId, accessToken, sessionGeneration, sessionKey });
        void refreshHomeNearbyPins();
      }
    });
    return () => subscription.remove();
  }, [accessToken, refreshHomeNearbyPins, runHomeFreshnessSweep, sessionGeneration, sessionKey, userId]);

  useEffect(() => {
    setOutNowPresenceResolved(false);
  }, [userId, sessionGeneration]);

  useEffect(() => {
    if (!userId) return;
    return subscribeNativeProfileSummary(userId, ({ profile: nextProfile, quota: nextQuota }) => {
      const terminalUntil = terminalHomePresenceAtRef.current;
      const terminalMs = Date.parse(String(terminalUntil || ""));
      const incomingMs = Date.parse(String(nextProfile?.map_visible_until || ""));
      setProfile(nextProfile && Number.isFinite(terminalMs) && Number.isFinite(incomingMs) && incomingMs > terminalMs + 1000
          ? { ...nextProfile, map_visible_until: terminalUntil }
          : nextProfile);
      setQuota(nextQuota);
      setOutNowPresenceResolved(true);
    }, { sessionKey });
  }, [sessionKey, userId]);

  useEffect(() => {
    if (!userId) return;
    return subscribeNativePetMutations(userId, (payload) => {
      setPets((current) => {
        if (payload.deleted) {
          const next = current.filter((pet) => pet.id !== payload.petId);
          if (sessionKey) void writeHomePetsCache(userId, next, sessionKey);
          return next;
        }
        const row = payload.pet;
        if (!row || typeof row !== "object") return current;
        const nextPet: HomePet = {
          id: payload.petId,
          name: typeof row.name === "string" ? row.name : current.find((pet) => pet.id === payload.petId)?.name ?? "",
          species: typeof row.species === "string" ? row.species : current.find((pet) => pet.id === payload.petId)?.species ?? "",
          breed: typeof row.breed === "string" ? row.breed : row.breed === null ? null : current.find((pet) => pet.id === payload.petId)?.breed ?? null,
          weight: typeof row.weight === "number" ? row.weight : row.weight == null ? null : Number(row.weight),
          weight_unit: typeof row.weight_unit === "string" ? row.weight_unit : current.find((pet) => pet.id === payload.petId)?.weight_unit ?? null,
          dob: typeof row.dob === "string" ? row.dob : row.dob === null ? null : current.find((pet) => pet.id === payload.petId)?.dob ?? null,
          photo_presentation: row.photo_presentation && typeof row.photo_presentation === "object" ? row.photo_presentation as HomePet["photo_presentation"] : current.find((pet) => pet.id === payload.petId)?.photo_presentation ?? null,
          photo_url: typeof row.photo_url === "string" ? row.photo_url : row.photo_url === null ? null : current.find((pet) => pet.id === payload.petId)?.photo_url ?? null,
          is_active: typeof row.is_active === "boolean" ? row.is_active : current.find((pet) => pet.id === payload.petId)?.is_active ?? true,
          updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
        };
        const exists = current.some((pet) => pet.id === payload.petId);
        const next = exists
          ? current.map((pet) => pet.id === payload.petId ? { ...pet, ...nextPet } : pet)
          : [nextPet, ...current];
        if (sessionKey) void writeHomePetsCache(userId, next, sessionKey);
        return next;
      });
    });
  }, [sessionKey, userId]);

  useEffect(() => {
    if (!userId) return;
    const channelName = `pets-home-realtime-${userId}`;
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pets", filter: `owner_id=eq.${userId}` },
        () => {
          if (petsDebounceRef.current !== null) clearTimeout(petsDebounceRef.current);
          petsDebounceRef.current = setTimeout(() => {
            petsDebounceRef.current = null;
            homePetsMemoryCache.delete(getHomePetsCacheKey(userId, sessionKey));
            void loadHome({ showLoading: false });
          }, 350);
        },
      ));
    if (__DEV__) console.log("SUPABASE_REALTIME_SUBSCRIBE", { channel: channelName, screen: "NativeHomeScreen" });

    return () => {
      if (petsDebounceRef.current !== null) clearTimeout(petsDebounceRef.current);
      if (__DEV__) console.log("SUPABASE_REALTIME_UNSUBSCRIBE", { channel: channelName, screen: "NativeHomeScreen" });
      void handle.dispose();
    };
  }, [loadHome, sessionKey, userId]);

  useEffect(() => {
    const pet = activePets[selectedPetIndex];
    if (!userId || !pet || pet.is_active === false) {
      setReminders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const nextReminders = await fetchHomeReminders(userId, pet.id, { accessToken });
        if (!cancelled) setReminders(nextReminders);
      } catch {
        // Keep existing reminders visible when refresh fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activePets, selectedPetIndex, userId]);

  useEffect(() => {
    if (petUserSoftCards.length <= 1) {
      setSelectedSoftCardIndex((current) => current === 0 ? current : 0);
      return;
    }
    if (homeReduceMotion) return;
    const timer = setInterval(() => {
      setSelectedSoftCardIndex((current) => {
        const next = (current + 1) % petUserSoftCards.length;
        softCardCarouselRef.current?.scrollTo({ x: next * softCardCarouselWidth, animated: true });
        return next;
      });
    }, HOME_CAROUSEL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [homeReduceMotion, petUserSoftCards.length, softCardCarouselRef, softCardCarouselWidth]);


  const handleSoftCardScroll = (offsetX: number) => {
    if (petUserSoftCards.length === 0) return;
    const nextIndex = Math.min(Math.max(Math.round(offsetX / softCardCarouselWidth), 0), petUserSoftCards.length - 1);
    if (nextIndex !== selectedSoftCardIndex) setSelectedSoftCardIndex(nextIndex);
  };

  return (
    <>
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {shouldShowProfileSummary ? (
        <View style={styles.pageHeader}>
          <Pressable
            accessibilityLabel="Open profile"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setPublicProfileOpen(true)}
          >
            <NativeProfileAvatar
              presentationCrop={homeProfileAvatarPresentation(profile)}
              userId={profile?.id}
              uri={profile?.avatar_url}
              version={profile?.updated_at}
              size={54}
              verified={isNativeVerifiedProfile(profile)}
              name={avatarInitial}
            />
            {isNativeVerifiedProfile(profile) ? (
              <View style={styles.avatarBadge}>
                <NativeVerifiedBadge compact variant="avatar" />
              </View>
            ) : null}
          </Pressable>
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <NativeEngagementSparkleInline engagement={profile?.engagement ?? null} size={16} />
              <Text numberOfLines={1} style={styles.title}>{displayName}</Text>
            </View>
            {profile?.social_id ? (
              <Text numberOfLines={1} style={styles.subtitle}>@{String(profile.social_id).replace(/^@+/, "")}</Text>
            ) : null}
          </View>
          <View style={styles.petRailWrap}>
            {activePetCount > 0 && heroMode !== "pet" ? (
              <ScrollView
                contentContainerStyle={styles.petRailContent}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.petRail}
              >
	                {activePets.map((pet, index) => (
	                  <Pressable
                    accessibilityLabel={`Open ${pet.name}'s profile`}
                    accessibilityRole="button"
                    key={pet.id}
                    onPress={() => onNavigate(`/pet-details?id=${pet.id}`)}
                    style={[styles.petRailAvatar, index > 0 ? styles.petRailAvatarOverlap : null]}
                  >
                    {pet.photo_url ? (
                      <NativePetImage
                        cachePolicy={huddleImageDefaults.cachePolicy}
                        contentFit="fill"
                        uri={nativeFreshImageUri(pet.photo_url, nativeMutableImageVersion(pet.photo_url, pet.updated_at))}
                        style={[styles.petRailImage, nativePetPresentationImageStyle(pet.photo_presentation?.home, 1)]}
                      />
                    ) : (
                      <View style={styles.petRailFallback}>
                        <MaterialCommunityIcons color={huddleColors.onPrimary} name="paw" size={17} />
                      </View>
	                    )}
	                  </Pressable>
	                ))}
	                <Pressable
	                  accessibilityLabel="Add pet"
	                  accessibilityRole="button"
	                  onPress={() => onNavigate("/edit-pet-profile")}
	                  style={styles.petRailAdd}
	                >
	                  <NativeGlassCircle
	                    fallbackTint="rgba(255,255,255,0.42)"
	                    glassOpacity={0.82}
	                    highlightOpacity={0.42}
	                    materialTint="rgba(255,255,255,0.18)"
	                    rimColor="rgba(255,255,255,0.54)"
	                    size={46}
	                    tint="rgba(255,255,255,0.18)"
	                  >
	                    <Feather color={huddleColors.blue} name="plus" size={19} />
	                  </NativeGlassCircle>
	                </Pressable>
	              </ScrollView>
	            ) : (
	              <Pressable
	                accessibilityLabel="Add pet"
	                accessibilityRole="button"
	                onPress={() => onNavigate("/edit-pet-profile")}
	                style={styles.petRailAdd}
	              >
	                <NativeGlassCircle
	                  fallbackTint="rgba(255,255,255,0.42)"
	                  glassOpacity={0.82}
	                  highlightOpacity={0.42}
	                  materialTint="rgba(255,255,255,0.18)"
	                  rimColor="rgba(255,255,255,0.54)"
	                  size={46}
	                  tint="rgba(255,255,255,0.18)"
	                >
	                  <Feather color={huddleColors.blue} name="plus" size={19} />
	                </NativeGlassCircle>
	              </Pressable>
	            )}
          </View>
        </View>
      ) : state === "loading" ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pageHeader}>
          <NativeShimmerSkeleton style={styles.avatarSkeleton} />
          <View style={styles.headerText}>
            <NativeShimmerSkeleton style={styles.titleSkeleton} />
            <NativeShimmerSkeleton style={styles.subtitleSkeleton} />
            <View style={styles.profilePillRow}>
              <NativeShimmerSkeleton style={styles.tierSkeleton} />
              <NativeShimmerSkeleton style={styles.starsSkeleton} />
            </View>
          </View>
        </View>
      ) : null}

      {state === "loading" ? (
        <NativeShimmerSkeleton style={[styles.loadingCard, { height: loadingCardHeight }]} />
      ) : null}

      {state === "error" ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Home could not load</Text>
          <Text style={styles.emptyBody}>Check your connection and retry.</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadHome({ forceDb: true, showLoading: true })} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {state === "ready" && activePetCount === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyHeroTitle}>The best way to begin is simply to explore.</Text>
            <View style={styles.emptyIllustration}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={noPetImage}
                style={styles.emptyIllustrationImage}
              />
            </View>
            <Text style={styles.emptyOnboardingCopy}>
              <Text style={styles.emptyOnboardingCopyBrand}>huddle</Text>
              {" "}is built by trusted guardians, not just pet owners.{"\n"}
              Complete our on-boarding journey to get full huddle experience.
            </Text>
            {canShowSoftCards && noPetSoftCards.length > 0 ? (
              <View style={styles.emptySoftCardStack}>
                {noPetSoftCards.map((card) => (
                  <Pressable
                    accessibilityLabel={softCardAccessibilityLabel(card.id)}
                    accessibilityRole="button"
                    key={card.id}
                    onPress={() => onNavigate(card.path)}
                    style={({ pressed }) => [styles.softCard, styles.emptySoftCard, { height: emptySoftCardHeight }, pressed ? styles.pressed : null]}
                  >
                    <ExpoImage accessibilityIgnoresInvertColors contentFit="cover" source={card.image} style={styles.softCardImage} />
                    <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" hitSlop={10} onPress={() => dismissSoftCard(card.id)} style={styles.softCardDismiss}>
                      <Feather color={card.dismissColor} name="x" size={16} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ) : canShowSoftCards && resetSoftCardsForDebug ? (
              <Pressable accessibilityRole="button" onLongPress={resetSoftCardsForDebug} style={styles.emptySoftCardDebugReset}>
                <Text style={styles.emptySoftCardDebugText}>Onboarding cards are hidden</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="Add Your First Pet"
            accessibilityRole="button"
            onPress={() => onNavigate("/edit-pet-profile")}
            style={styles.floatingAddButton}
          >
            <MaterialCommunityIcons color={huddleColors.iconMuted} name="paw" size={26} />
          </Pressable>
        </View>
      ) : null}

      {state === "ready" && activePetCount > 0 ? (
        <>
          {heroMode === "out" ? (
            <HomeOutNowHero
              avatarPresentation={homeProfileAvatarPresentation(profile)}
              avatarUri={profile?.avatar_url}
              avatarVersion={profile?.updated_at}
              clock={formatOutNowClock(profile?.map_visible_until, outNowTick) || "0:00:00"}
              name={avatarInitial}
              progress={outNowRingProgress(profile?.map_visible_until, outNowTick)}
              userId={profile?.id}
            />
          ) : heroMode === "lively" ? (
            <HomeLivelyHero
              matchedOut={pulse.matchedOut}
              onPress={() => onNavigate("/map")}
              outCount={outNowState.nearbyCount ?? 0}
            />
          ) : (
            <HomePetBannerCarousel
              onIndexChange={(nextIndex) => {
                haptic.selectTab();
                setSelectedPetIndex(nextIndex);
              }}
              onOpenPet={(petId) => onNavigate(`/pet-details?id=${petId}`)}
              pets={activePets}
              reminders={reminders}
              width={softCardCarouselWidth}
            />
          )}

          {canShowSoftCards && petUserSoftCards.length > 0 ? (
            <View style={styles.softCardStack}>
              <Animated.ScrollView
                ref={softCardCarouselRef}
                horizontal
                onMomentumScrollEnd={(event) => handleSoftCardScroll(event.nativeEvent.contentOffset.x)}
                onScroll={softCardScrollHandler}
                pagingEnabled
                scrollEnabled={petUserSoftCards.length > 1}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
              >
                {petUserSoftCards.map((card, cardIndex) => (
                  <HomeCarouselFadeSlide index={cardIndex} key={card.id} scrollX={softCardScrollX} width={softCardCarouselWidth}>
                  <Pressable
                    accessibilityLabel={softCardAccessibilityLabel(card.id)}
                    accessibilityRole="button"
                    onPress={() => onNavigate(card.path)}
                    style={({ pressed }) => [styles.softCard, { width: softCardCarouselWidth, height: carouselSoftCardHeight }, pressed ? styles.pressed : null]}
                  >
                    <ExpoImage accessibilityIgnoresInvertColors contentFit="cover" source={card.image} style={styles.softCardImage} />
                    <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" hitSlop={10} onPress={() => dismissSoftCard(card.id)} style={styles.softCardDismiss}>
                      <Feather color={card.dismissColor} name="x" size={16} />
                    </Pressable>
                  </Pressable>
                  </HomeCarouselFadeSlide>
                ))}
              </Animated.ScrollView>
              {petUserSoftCards.length > 1 ? (
                <View pointerEvents="none" style={styles.softCardDashRow}>
                  {petUserSoftCards.map((card, index) => (
                    <View key={`soft-dash-${card.id}`} style={[styles.eventDash, index === selectedSoftCardIndex ? styles.eventDashActive : null]} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {pulse.outPeople.length > 0 ? (
            <HomePeopleRow
              onPressPerson={(personId, person) => {
                if (person.avatarBlurred) {
                  onNavigate("/chats?tab=discover");
                  return;
                }
                onNavigate(`/map?user=${encodeURIComponent(personId)}`);
              }}
              people={pulse.outPeople}
              showPresenceDot
              title="Nearby out now"
            />
          ) : discoverTeasers.length > 0 ? (
            <HomePeopleRow
              onPressPerson={() => onNavigate("/chats?tab=discover")}
              people={discoverTeasers}
              title="Nearby right now"
            />
          ) : null}

          {pulse.events.length > 0 ? (
            <HomeEventCarousel
              events={pulse.events}
              onOpen={(event) => onNavigate(event.groupJoined
                ? `/chat-dialogue?room=${encodeURIComponent(event.chatId)}&joined=1&name=${encodeURIComponent(event.groupName || event.title || "Group")}`
                : `/chats?tab=community&group=${encodeURIComponent(event.chatId)}`)}
              width={softCardCarouselWidth}
            />
          ) : pulse.suggestion ? (
            <HomeGroupSuggestionCard
              group={pulse.suggestion}
              onPress={() => onNavigate("/chats?tab=community")}
            />
          ) : null}

          <View style={styles.outNowSection}>
            {isOutNowActive ? (
              <Pressable
                accessibilityLabel="I'm back"
                accessibilityRole="button"
                disabled={outNowState.busy}
                onPress={() => { void handleReturned(); }}
                style={({ pressed }) => [styles.returnedCta, pressed ? styles.pressed : null, outNowState.busy ? styles.outNowBusy : null]}
              >
                <Feather color={huddleColors.blue} name="home" size={17} />
                <Text style={styles.returnedCtaText}>I'm back</Text>
              </Pressable>
            ) : outNowPresenceResolved ? (
              <HomeOutNowCta busy={outNowState.busy} onPress={() => { void handleOutNow(); }} />
            ) : null}
            {outNowState.error ? <Text style={styles.outNowError}>{outNowState.error}</Text> : null}
          </View>
        </>
      ) : null}
    </ScrollView>
    <AppConfirmModal
      body={outNowLocationSettingsReason === "services"
        ? "Turn on Location Services in Settings, then return to huddle."
        : "Turn on Location for huddle in Settings."}
      cancelLabel="Not now"
      confirmLabel={outNowLocationSettingsReason === "services" ? "Open Location Settings" : "Open huddle Settings"}
      onCancel={() => setOutNowLocationSettingsReason(null)}
      onConfirm={() => {
        const reason = outNowLocationSettingsReason;
        setOutNowLocationSettingsReason(null);
        void (reason === "services" ? openNativeLocationSettings() : openNativeAppSettings());
      }}
      open={active && outNowLocationSettingsReason !== null}
      title={outNowLocationSettingsReason === "services" ? "Turn on Location Services" : "Turn on Location"}
    />
    <NativePublicProfileModal
      accessToken={accessToken ?? null}
      fallbackData={profile ? {
        id: userId,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        is_verified: isNativeVerifiedProfile(profile),
        social_id: profile.social_id,
        updated_at: profile.updated_at,
      } : null}
      hideActions
      hideMatchedActions
      onClose={() => setPublicProfileOpen(false)}
      onNavigate={onNavigate}
      open={publicProfileOpen}
      profileUserId={userId}
      sessionKey={sessionKey}
      viewerUserId={userId}
    />

    </>
  );
}


// Quiet-state top card: the pets as a photo-led banner at the same footprint as
// the presence hero — full-width, hero-height, photo as the card. Swiping pets
// uses the same in-card dash indicator language as the event carousel.
// Shared carousel motion so every Home carousel (pet banner, event, onboarding
// soft cards) behaves identically: 3.8s auto-advance + a scroll-driven crossfade
// (off-centre slides dim to 0.35 as they slide), reduce-motion-guarded.
const HOME_CAROUSEL_INTERVAL_MS = 3800;

function useHomeCarouselAutoAdvance(count: number, width: number, railRef: AnimatedRef<Animated.ScrollView>, indexRef: MutableRefObject<number>, setIndex: (index: number) => void, onIndexChange?: (index: number) => void) {
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion || count <= 1) return;
    const timer = setInterval(() => {
      const next = (indexRef.current + 1) % count;
      indexRef.current = next;
      setIndex(next);
      railRef.current?.scrollTo({ x: next * width, animated: true });
      onIndexChange?.(next);
    }, HOME_CAROUSEL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [count, indexRef, onIndexChange, railRef, reduceMotion, setIndex, width]);
}

// Wraps one slide; interpolates opacity from the shared scroll offset so it
// fades as it slides off centre — the "slide+fade" applied consistently.
function HomeCarouselFadeSlide({ children, index, scrollX, style, width }: {
  children: ReactNode;
  index: number;
  scrollX: SharedValue<number>;
  style?: object;
  width: number;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0.35, 1, 0.35],
      Extrapolation.CLAMP,
    ),
  }));
  return <Animated.View style={[{ width }, style, animatedStyle]}>{children}</Animated.View>;
}

function HomePetBannerCarousel({ onIndexChange, onOpenPet, pets, reminders, width }: {
  onIndexChange?: (index: number) => void;
  onOpenPet: (petId: string) => void;
  pets: HomePet[];
  reminders: HomeReminder[];
  width: number;
}) {
  const railRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollX.value = event.contentOffset.x; });
  useHomeCarouselAutoAdvance(pets.length, width, railRef, indexRef, setIndex, onIndexChange);
  return (
    <View style={styles.petBannerSection}>
      <Animated.ScrollView
        horizontal
        onMomentumScrollEnd={(event) => {
          const next = Math.min(Math.max(Math.round(event.nativeEvent.contentOffset.x / width), 0), pets.length - 1);
          if (indexRef.current !== next) {
            indexRef.current = next;
            setIndex(next);
            onIndexChange?.(next);
          }
        }}
        onScroll={scrollHandler}
        pagingEnabled
        ref={railRef}
        scrollEnabled={pets.length > 1}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
      >
        {pets.map((pet, petIndex) => {
          const meta = [formatPetAgeForHomeCard(pet.dob), pet.weight ? `${pet.weight}${pet.weight_unit || ""}` : ""].filter(Boolean).join(" · ");
          const eventLabel = formatHomePetEventLabel(formatReminderLabel(pet, reminders));
          const presentationPhotoUrl = pet.photo_url;
          const homePosition = pet.photo_presentation?.home;
          return (
            <HomeCarouselFadeSlide index={petIndex} key={pet.id} scrollX={scrollX} width={width}>
            <Pressable
              accessibilityLabel={`Open ${pet.name}'s profile`}
              accessibilityRole="button"
              onPress={() => onOpenPet(pet.id)}
              style={[styles.petBanner, { height: width / huddlePetPhoto.bannerAspect, width }]}
            >
              {presentationPhotoUrl ? (
                <NativePetImage
                  cachePolicy={huddleImageDefaults.cachePolicy}
                  contentFit="fill"
                  uri={nativeFreshImageUri(presentationPhotoUrl, nativeMutableImageVersion(presentationPhotoUrl, pet.updated_at))}
                  style={[styles.eventImage, nativePetPresentationImageStyle(homePosition, huddlePetPhoto.bannerAspect)]}
                />
              ) : (
                <View style={styles.petBannerFallback}>
                  <MaterialCommunityIcons color="rgba(255,255,255,0.85)" name="paw" size={54} />
                </View>
              )}
              <LinearGradient
                colors={["rgba(10,16,40,0)", "rgba(10,16,40,0.74)"]}
                end={{ x: 0, y: 1 }}
                pointerEvents="none"
                start={{ x: 0, y: 0.3 }}
                style={styles.eventOverlay}
              />
              {pet.is_family_shared && pet.shared_by_display_name ? (
                <View style={styles.familyPetBadge}>
                  <NativeFamilyPetBadge displayName={pet.shared_by_display_name} />
                </View>
              ) : null}
              <View style={styles.petBannerCopy}>
                <Text numberOfLines={1} style={styles.petBannerName}>{pet.name}</Text>
                {meta ? <Text numberOfLines={1} style={styles.petBannerMeta}>{meta}</Text> : null}
                {eventLabel ? (
                  <View style={styles.petBannerChip}>
                    <Feather color="#FFFFFF" name="clock" size={13} />
                    <Text numberOfLines={1} style={styles.petBannerChipText}>{eventLabel}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
            </HomeCarouselFadeSlide>
          );
        })}
      </Animated.ScrollView>
      {pets.length > 1 ? (
        <View pointerEvents="none" style={styles.petBannerDashRow}>
          {pets.map((pet, dashIndex) => (
            <View key={`pet-dash-${pet.id}`} style={[styles.eventDash, dashIndex === index ? styles.eventDashActive : null]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Soft radial light-blob that slowly drifts inside the hero card. Two or three of
// these over a deep-ink base give the "neighbourhood is alive" atmosphere without
// looping UI noise — they are background weather, not foreground animation.
function HomeAuroraBlob({ color, delay = 0, driftX, driftY, duration, gid, size, style }: {
  color: string;
  delay?: number;
  driftX: number;
  driftY: number;
  duration: number;
  gid: string;
  size: number;
  style?: object;
}) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [delay, drift, duration, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.value * driftX },
      { translateY: drift.value * driftY },
      { scale: 1 + drift.value * 0.16 },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size }, style, animatedStyle]}>
      <Svg height={size} width={size}>
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={gid} r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.85} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} fill={`url(#${gid})`} r={size / 2} />
      </Svg>
    </Animated.View>
  );
}

function HomeLivePulseDot() {
  const reduceMotion = useReducedMotion();
  const beat = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    beat.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [beat, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - beat.value * 0.45,
    transform: [{ scale: 1 - beat.value * 0.18 }],
  }));
  return <Animated.View style={[styles.heroPulseDot, animatedStyle]} />;
}

// Staggered pop-in for hero face-stack entries: one playful spring on load, never looping.
function HomeStackEntrance({ children, index }: { children: ReactNode; index: number }) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    enter.value = withDelay(150 + index * 130, withSpring(1, { damping: 12, stiffness: 190 }));
  }, [enter, index, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 8 }, { scale: 0.7 + enter.value * 0.3 }],
  }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

function HomeLivelyHero({ matchedOut, onPress, outCount }: {
  matchedOut: HomePulsePerson[];
  onPress: () => void;
  outCount: number;
}) {
  const friendName = homeFirstName(matchedOut[0]?.displayName);
  const headline = matchedOut.length >= 2 && friendName
    ? `${friendName} and ${matchedOut.length - 1} ${matchedOut.length - 1 === 1 ? "friend" : "friends"}\nare out nearby`
    : matchedOut.length === 1 && friendName
      ? `${friendName} is\nout nearby`
      : `${outCount} ${outCount === 1 ? "person is" : "people are"}\nout nearby`;
  const stack = matchedOut.slice(0, 3);
  const overflow = Math.max(0, outCount - stack.length);
  return (
    <Pressable
      accessibilityLabel={`${outCount} people are out near you. Open map`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.heroCard, pressed ? styles.pressed : null]}
    >
      <HomeAuroraBlob color="#3F66E8" driftX={26} driftY={10} duration={7000} gid="huddleAuroraBlue" size={190} style={{ top: -60, left: -30 }} />
      <HomeAuroraBlob color="#7A5FD0" delay={400} driftX={-20} driftY={-8} duration={9000} gid="huddleAuroraViolet" size={170} style={{ bottom: -70, right: -20 }} />
      <HomeAuroraBlob color="rgba(191,255,0,0.55)" delay={900} driftX={14} driftY={-12} duration={11000} gid="huddleAuroraLime" size={130} style={{ bottom: -46, left: 92 }} />
      <View style={styles.heroContent}>
        <View>
          <View style={styles.heroEyebrowRow}>
            <HomeLivePulseDot />
            <Text style={styles.heroEyebrowText}>Out near you now</Text>
          </View>
          <Text style={styles.heroHeadline}>{headline}</Text>
        </View>
        <View style={styles.heroBottomRow}>
          {stack.length > 0 ? (
            <View style={styles.heroStackRow}>
              {stack.map((person, index) => (
                <HomeStackEntrance index={index} key={person.id}>
                  <View style={[styles.heroStackItem, index > 0 ? styles.heroStackOverlap : null]}>
                    <NativeProfileAvatar name={homeFirstName(person.displayName).charAt(0) || "H"} size={26} uri={person.avatarUrl} userId={person.id} />
                  </View>
                </HomeStackEntrance>
              ))}
              {overflow > 0 ? (
                <HomeStackEntrance index={stack.length}>
                  <View style={[styles.heroStackItem, styles.heroStackOverlap, styles.heroStackChip]}>
                    <Text style={styles.heroStackChipText}>+{overflow}</Text>
                  </View>
                </HomeStackEntrance>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.heroCountText}>
            {matchedOut.length > 0 ? `${outCount} out · within 2km` : "within 2km"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Ring sized to hug the avatar: avatar radius 28, stroke centreline at 31 leaves
// under 1px of air between avatar edge and ring inner edge.
const OUT_RING_SIZE = 68;
const OUT_RING_RADIUS = 31;
const OUT_RING_STROKE = 4.5;
const OUT_RING_CIRCUMFERENCE = 2 * Math.PI * OUT_RING_RADIUS;

function HomeOutNowHero({ avatarPresentation, avatarUri, avatarVersion, clock, name, progress, userId }: {
  avatarPresentation?: NativeProfilePhotoPresentationCrop | null;
  avatarUri?: string | null;
  avatarVersion?: string | null;
  clock: string;
  name: string;
  progress: number;
  userId?: string | null;
}) {
  return (
    <View style={styles.heroCard}>
      <HomeAuroraBlob color="rgba(191,255,0,0.6)" driftX={-18} driftY={10} duration={8000} gid="huddleAuroraOutLime" size={200} style={{ top: -70, right: -50 }} />
      <HomeAuroraBlob color="#3F66E8" delay={500} driftX={22} driftY={-8} duration={10000} gid="huddleAuroraOutBlue" size={180} style={{ bottom: -70, left: -40 }} />
      <View style={styles.outHeroRow}>
        <View style={styles.outRingWrap}>
          <Svg height={OUT_RING_SIZE} style={styles.outRingSvg} width={OUT_RING_SIZE}>
            <Circle
              cx={OUT_RING_SIZE / 2}
              cy={OUT_RING_SIZE / 2}
              fill="none"
              r={OUT_RING_RADIUS}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={OUT_RING_STROKE}
            />
            <Circle
              cx={OUT_RING_SIZE / 2}
              cy={OUT_RING_SIZE / 2}
              fill="none"
              r={OUT_RING_RADIUS}
              stroke={huddleColors.lime}
              strokeDasharray={`${OUT_RING_CIRCUMFERENCE * progress} ${OUT_RING_CIRCUMFERENCE}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              strokeWidth={OUT_RING_STROKE}
              transform={`rotate(-90 ${OUT_RING_SIZE / 2} ${OUT_RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.outRingAvatar}>
            <NativeProfileAvatar name={name} presentationCrop={avatarPresentation} size={56} uri={avatarUri} userId={userId} version={avatarVersion} />
          </View>
        </View>
        <View style={styles.outHeroCopy}>
          <View style={styles.heroEyebrowRow}>
            <HomeLivePulseDot />
            <Text style={styles.outHeroEyebrowText}>You're out</Text>
          </View>
          <Text style={styles.outHeroClock}>{clock}</Text>
          <Text style={styles.outHeroUntil}>until you leave the map</Text>
        </View>
      </View>
    </View>
  );
}

function HomePeopleRow({ onPressPerson, people, showPresenceDot = false, title }: {
  onPressPerson: (personId: string, person: HomePulsePerson) => void;
  people: HomePulsePerson[];
  showPresenceDot?: boolean;
  title: string;
}) {
  return (
    <View style={styles.peopleSection}>
      <Text style={styles.peopleTitle}>{title}</Text>
      <ScrollView contentContainerStyle={styles.peopleRail} horizontal showsHorizontalScrollIndicator={false}>
        {people.map((person, personIndex) => (
          <HomePeopleRowPerson
            key={person.id}
            index={personIndex}
            person={person}
            showPresenceDot={showPresenceDot}
            onPress={() => onPressPerson(person.id, person)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// One person tile in the nearby/out row. Blurred (pre-connection) tiles breathe
// slowly with a per-item phase offset so they read as living presences, never a
// synchronized loading state; tapping fires a single shimmer sweep before the
// existing navigation. Labels are the honest two-line ladder: why → where →
// role, no filler.
function HomePeopleRowPerson({ index, onPress, person, showPresenceDot }: {
  index: number;
  onPress: () => void;
  person: HomePulsePerson;
  showPresenceDot: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0);
  const shimmer = useSharedValue(-1);
  useEffect(() => {
    if (reduceMotion || !person.avatarBlurred) return;
    breath.value = withDelay((index % 5) * 700, withRepeat(withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [breath, index, person.avatarBlurred, reduceMotion]);
  const breathingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.03 }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value < 0 ? 0 : 1,
    transform: [{ translateX: shimmer.value * 72 - 36 }, { skewX: "-18deg" }],
  }));
  const handlePress = () => {
    if (!reduceMotion) {
      shimmer.value = 0;
      shimmer.value = withTiming(1, { duration: 320, easing: Easing.inOut(Easing.ease) }, () => {
        shimmer.value = -1;
      });
    }
    onPress();
  };
  const primaryLine = person.displayName || person.label || "Pet lover";
  return (
    <Pressable
      accessibilityLabel={person.displayName || person.label || "Explore nearby pet person"}
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [styles.peoplePerson, pressed ? styles.pressed : null]}
    >
      <Animated.View style={person.avatarBlurred ? breathingStyle : undefined}>
        <View style={styles.peopleAvatarOuter}>
          <View style={styles.peopleAvatarWrap}>
            <NativeProfileAvatar name={homeFirstName(person.displayName).charAt(0) || "H"} size={56} uri={person.avatarUrl} userId={person.id} />
            {person.avatarBlurred ? (
              <BlurView
                blurAmount={8}
                blurType="light"
                pointerEvents="none"
                reducedTransparencyFallbackColor="rgba(255,255,255,0.12)"
                style={styles.peopleAvatarBlur}
              />
            ) : null}
            {person.avatarBlurred ? <View pointerEvents="none" style={styles.peopleAvatarPrivacyWash} /> : null}
            <Animated.View pointerEvents="none" style={[styles.peopleAvatarShimmer, shimmerStyle]}>
              <LinearGradient
                colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
                end={{ x: 1, y: 0 }}
                start={{ x: 0, y: 0 }}
                style={styles.peopleAvatarShimmerFill}
              />
            </Animated.View>
          </View>
          {showPresenceDot ? <View style={styles.peoplePresenceDot} /> : null}
        </View>
      </Animated.View>
      <Text numberOfLines={1} style={styles.peoplePersonName}>{primaryLine}</Text>
      {person.subLabel && !person.displayName ? (
        <Text numberOfLines={1} style={styles.peoplePersonSubLabel}>{person.subLabel}</Text>
      ) : null}
    </Pressable>
  );
}

function HomeEventCarousel({ events, onOpen, width }: {
  events: NativeHomeGroupEvent[];
  onOpen: (event: NativeHomeGroupEvent) => void;
  width: number;
}) {
  const railRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  useEffect(() => { indexRef.current = index; }, [index]);
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollX.value = event.contentOffset.x; });
  useHomeCarouselAutoAdvance(events.length, width, railRef, indexRef, setIndex);
  return (
    <View style={styles.eventSection}>
      <Animated.ScrollView
        horizontal
        onMomentumScrollEnd={(event) => {
          const next = Math.min(Math.max(Math.round(event.nativeEvent.contentOffset.x / width), 0), events.length - 1);
          setIndex((current) => current === next ? current : next);
        }}
        onScroll={scrollHandler}
        pagingEnabled
        ref={railRef}
        scrollEnabled={events.length > 1}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
      >
        {events.map((event, eventIndex) => (
          <HomeCarouselFadeSlide index={eventIndex} key={event.id} scrollX={scrollX} width={width}>
          <Pressable
            accessibilityLabel={`${event.title}, ${formatHomeEventTime(event.startsAt)}. Open group`}
            accessibilityRole="button"
            onPress={() => onOpen(event)}
            style={({ pressed }) => [styles.eventCard, { width }, pressed ? styles.pressed : null]}
          >
            {event.groupAvatarUrl ? (
              <ExpoImage cachePolicy={huddleImageDefaults.cachePolicy} contentFit="cover" source={{ uri: event.groupAvatarUrl }} style={styles.eventImage} />
            ) : (
              <View style={styles.eventImageFallback} />
            )}
            <LinearGradient
              colors={["rgba(23,48,140,0.72)", "rgba(33,69,207,0.34)"]}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={styles.eventOverlay}
            />
            <View style={styles.eventContent}>
              <View style={styles.eventCopy}>
                <Text numberOfLines={1} style={styles.eventEyebrow}>{formatHomeEventTime(event.startsAt)}</Text>
                <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                {event.rsvpCount >= 3 ? <Text numberOfLines={1} style={styles.eventMeta}>{event.rsvpCount} going</Text> : null}
              </View>
              {event.rsvpAvatars.length > 0 ? (
                <View style={styles.eventStackRow}>
                  {event.rsvpAvatars.slice(0, 3).map((avatar, avatarIndex) => (
                    <View key={avatar.userId} style={[styles.eventStackItem, avatarIndex > 0 ? styles.eventStackOverlap : null]}>
                      <NativeProfileAvatar name={homeFirstName(avatar.displayName).charAt(0) || "H"} size={24} uri={avatar.avatarUrl} userId={avatar.userId} />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Pressable>
          </HomeCarouselFadeSlide>
        ))}
      </Animated.ScrollView>
      {events.length > 1 ? (
        <View style={styles.eventDashRow}>
          {events.map((event, dashIndex) => (
            <View key={`event-dash-${event.id}`} style={[styles.eventDash, dashIndex === index ? styles.eventDashActive : null]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HomeGroupSuggestionCard({ group, onPress }: { group: NativeExploreGroup; onPress: () => void }) {
  return (
    <View style={styles.eventSection}>
      <Pressable
        accessibilityLabel={`${group.name}, ${group.memberCount} members. Explore groups`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.eventCard, styles.eventCardFull, pressed ? styles.pressed : null]}
      >
        {group.avatarUrl ? (
          <ExpoImage cachePolicy={huddleImageDefaults.cachePolicy} contentFit="cover" source={{ uri: group.avatarUrl }} style={styles.eventImage} />
        ) : (
          <View style={styles.eventImageFallback} />
        )}
        <LinearGradient
          colors={["rgba(23,48,140,0.72)", "rgba(33,69,207,0.34)"]}
          end={{ x: 1, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={styles.eventOverlay}
        />
        <View style={styles.eventContent}>
          <View style={styles.eventCopy}>
            <Text numberOfLines={1} style={styles.eventEyebrow}>Groups near you</Text>
            <Text numberOfLines={1} style={styles.eventTitle}>{group.name}</Text>
            <Text numberOfLines={1} style={styles.eventMeta}>
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
              {group.locationLabel ? ` · ${group.locationLabel}` : ""}
            </Text>
          </View>
          <Feather color={huddleColors.onPrimary} name="chevron-right" size={20} />
        </View>
      </Pressable>
    </View>
  );
}

// Lime presence CTA with a slow specular sweep — one light glint crossing every few
// seconds. The sweep is the only always-on motion outside the hero, kept subtle.
function HomeOutNowCta({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const [ctaWidth, setCtaWidth] = useState(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || ctaWidth <= 0) return;
    sweep.value = 0;
    sweep.value = withRepeat(
      withSequence(
        withDelay(2200, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
  }, [ctaWidth, reduceMotion, sweep]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -80 + sweep.value * (ctaWidth + 160) },
      { skewX: "-18deg" },
    ],
  }));
  return (
    <Pressable
      accessibilityLabel="I'm out now"
      accessibilityRole="button"
      disabled={busy}
      onLayout={(event) => setCtaWidth(event.nativeEvent.layout.width)}
      onPress={onPress}
      style={({ pressed }) => [styles.outNowCta, pressed ? styles.outNowCtaPressed : null, busy ? styles.outNowBusy : null]}
    >
      {!reduceMotion && ctaWidth > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.outNowCtaSweep, sweepStyle]}>
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={styles.outNowCtaSweepFill}
          />
        </Animated.View>
      ) : null}
      {busy ? (
        <ActivityIndicator color="#2C3A12" size="small" />
      ) : (
        <MaterialCommunityIcons color="#2C3A12" name="paw" size={20} />
      )}
      <Text style={styles.outNowCtaText}>{busy ? "Finding your location..." : "I'm out now"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  content: {
    paddingBottom: huddleLayout.navHeight + huddleSpacing.x7,
  },
  pressed: {
    opacity: 0.72,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x2,
  },
  softCardStack: {
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: 0,
    paddingBottom: huddleSpacing.x4,
  },
  emptySoftCardStack: {
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x4,
  },
  emptyOnboardingCopy: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 22,
    color: huddleColors.mutedText,
  },
  emptyOnboardingCopyBrand: {
    fontFamily: "Urbanist-800",
    color: huddleColors.blue,
  },
  softCardDashRow: {
    position: "absolute",
    bottom: huddleSpacing.x4 + 10,
    right: huddleSpacing.x5 + huddleSpacing.x4,
    flexDirection: "row",
    gap: 4,
  },
  softCard: {
    borderRadius: huddleRadii.card,
    overflow: "hidden",
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  emptySoftCard: {
    width: "100%",
  },
  softCardImage: {
    width: "100%",
    height: "100%",
  },
  softCardDismiss: {
    position: "absolute",
    top: huddleSpacing.x2,
    right: huddleSpacing.x2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.78,
  },
  emptySoftCardDebugReset: {
    minHeight: 44,
    marginTop: huddleSpacing.x4,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySoftCardDebugText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.caption,
  },
  avatarSkeleton: {
    width: 72,
    height: 72,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(244,245,251,0.72)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: huddleColors.canvas,
    backgroundColor: huddleColors.blue,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  title: {
    flexShrink: 1,
    fontFamily: "Urbanist-800",
    fontSize: 24,
    lineHeight: 30,
    color: huddleColors.text,
  },
  titleSkeleton: {
    width: "72%",
    height: 28,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(244,245,251,0.72)",
  },
  subtitle: {
    marginTop: 1,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 18,
    color: "rgba(74,73,101,0.66)",
  },
  subtitleSkeleton: {
    width: "56%",
    height: 18,
    marginTop: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(244,245,251,0.72)",
  },
  profilePillRow: {
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
  tierSkeleton: {
    width: 100,
    height: 25,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(244,245,251,0.72)",
  },
  starsSkeleton: {
    width: 64,
    height: 25,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(244,245,251,0.72)",
  },
  loadingCard: {
    marginHorizontal: huddleSpacing.x5,
    marginTop: huddleSpacing.x1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: huddleColors.divider,
    backgroundColor: "rgba(244,245,251,0.42)",
    ...huddleShadows.glassElevation2,
  },
  emptyWrap: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x1,
    paddingBottom: huddleSpacing.x9,
  },
  emptyCard: {
    borderRadius: 16,
    padding: huddleSpacing.x5,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  emptyHeroTitle: {
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-800",
    fontWeight: "800",
    fontSize: 28,
    lineHeight: 31,
    color: huddleColors.text,
  },
  emptyTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: 30,
    color: huddleColors.text,
  },
  emptyBody: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(74,73,101,0.70)",
  },
  emptyIllustration: {
    height: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIllustrationImage: {
    width: "100%",
    height: "100%",
  },
  retryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    marginTop: huddleSpacing.x4,
  },
  retryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  floatingAddButton: {
    position: "absolute",
    right: huddleSpacing.x5,
    bottom: huddleSpacing.x7,
    width: 56,
    height: 56,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
    backgroundColor: "rgba(255,255,255,0.72)",
    ...huddleShadows.glassElevation2,
  },
  petBannerSection: {
    marginHorizontal: huddleSpacing.x5,
    marginBottom: huddleSpacing.x4,
    borderRadius: 22,
    overflow: "hidden",
    ...huddleShadows.glassElevation2,
  },
  petBanner: {
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "#16307F",
  },
  petBannerFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A4BB5",
  },
  petBannerCopy: {
    position: "absolute",
    left: huddleSpacing.x4 + 2,
    right: huddleSpacing.x4 + 2,
    bottom: huddleSpacing.x4 - 2,
  },
  familyPetBadge: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
  },
  petBannerName: {
    fontFamily: "Urbanist-800",
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: huddleColors.onPrimary,
  },
  petBannerMeta: {
    marginTop: 2,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
    color: "rgba(255,255,255,0.85)",
  },
  petBannerChip: {
    marginTop: huddleSpacing.x2 + 1,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 11,
    paddingHorizontal: huddleSpacing.x3 - 2,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  petBannerChipText: {
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  petBannerDashRow: {
    position: "absolute",
    bottom: 12,
    right: huddleSpacing.x4,
    flexDirection: "row",
    gap: 4,
  },
  outNowSection: {
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x4,
  },
  outNowBusy: {
    opacity: 0.64,
  },
  outNowError: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
  },
  outNowCta: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: huddleColors.lime,
    shadowColor: "#96BE00",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  outNowCtaPressed: {
    transform: [{ scale: 0.98 }],
  },
  outNowCtaText: {
    fontFamily: "Urbanist-800",
    fontSize: 16,
    lineHeight: 21,
    color: "#2C3A12",
  },
  outNowCtaSweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 80,
  },
  outNowCtaSweepFill: {
    flex: 1,
  },
  returnedCta: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
    borderRadius: 16,
    ...huddleGlassControls.borderlessSurface,
    borderWidth: 1,
    borderColor: huddleColors.blue,
  },
  returnedCtaText: {
    fontFamily: "Urbanist-800",
    fontSize: 16,
    lineHeight: 21,
    color: huddleColors.blue,
  },
  petRailWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  petRail: {
    maxWidth: 176,
    flexGrow: 0,
  },
  petRailContent: {
    alignItems: "center",
    paddingLeft: 2,
  },
  petRailAvatar: {
    position: "relative",
    zIndex: 1,
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: huddleColors.canvas,
    backgroundColor: huddleColors.mutedCanvas,
  },
  petRailAvatarOverlap: {
    marginLeft: -6,
  },
  petRailImage: {
    width: "100%",
    height: "100%",
  },
  petRailFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blue,
  },
  petRailAdd: {
    position: "relative",
    zIndex: 0,
    marginLeft: -4,
  },
  heroCard: {
    minHeight: 170,
    marginHorizontal: huddleSpacing.x5,
    marginBottom: huddleSpacing.x4,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#16307F",
    ...huddleShadows.glassElevation2,
  },
  heroContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x4 + 2,
    paddingVertical: huddleSpacing.x4 + 1,
  },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: huddleColors.lime,
  },
  heroEyebrowText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    letterSpacing: 0.3,
    color: "#C6D4FF",
  },
  heroHeadline: {
    marginTop: 8,
    fontFamily: "Urbanist-800",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: huddleColors.onPrimary,
  },
  heroBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2 + 1,
  },
  heroStackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroStackItem: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#16307F",
    backgroundColor: "#16307F",
    overflow: "hidden",
  },
  heroStackOverlap: {
    marginLeft: -9,
  },
  heroStackChip: {
    backgroundColor: huddleColors.premiumGold,
  },
  heroStackChipText: {
    fontFamily: "Urbanist-800",
    fontSize: 10,
    color: "#3D3105",
  },
  heroCountText: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 17,
    color: "#DBE4FF",
  },
  outHeroRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x4 + 2,
    paddingVertical: huddleSpacing.x4,
  },
  outRingWrap: {
    width: OUT_RING_SIZE,
    height: OUT_RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  outRingSvg: {
    position: "absolute",
  },
  outRingAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  outHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  outHeroEyebrowText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    letterSpacing: 0.3,
    color: "#D9FFAB",
  },
  outHeroClock: {
    marginTop: 6,
    fontFamily: "Urbanist-800",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: huddleColors.onPrimary,
    fontVariant: ["tabular-nums"],
  },
  outHeroUntil: {
    marginTop: 2,
    fontFamily: "Urbanist-600",
    fontSize: 13.5,
    lineHeight: 18,
    color: "#C6D4FF",
  },
  peopleSection: {
    paddingBottom: huddleSpacing.x4,
  },
  peopleTitle: {
    marginBottom: huddleSpacing.x2 + 2,
    paddingHorizontal: huddleSpacing.x5,
    fontFamily: "Urbanist-800",
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
    color: huddleColors.text,
  },
  peopleRail: {
    gap: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x5,
  },
  peoplePerson: {
    alignItems: "center",
    width: 76,
  },
  peopleAvatarOuter: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  peopleAvatarWrap: {
    width: 56,
    height: 56,
    overflow: "hidden",
    borderRadius: 28,
  },
  peoplePersonName: {
    marginTop: 5,
    maxWidth: 76,
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  peopleAvatarBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  peopleAvatarPrivacyWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  peopleAvatarShimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 36,
  },
  peopleAvatarShimmerFill: {
    flex: 1,
  },
  peoplePersonSubLabel: {
    marginTop: 1,
    maxWidth: 76,
    fontFamily: "Urbanist-500",
    fontSize: 10,
    lineHeight: 13,
    color: huddleColors.mutedText,
    textAlign: "center",
  },
  peoplePresenceDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: huddleColors.canvas,
    backgroundColor: huddleColors.lime,
  },
  eventSection: {
    marginHorizontal: huddleSpacing.x5,
    marginBottom: huddleSpacing.x4,
    borderRadius: 18,
    overflow: "hidden",
  },
  eventCard: {
    height: 112,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#16307F",
  },
  eventCardFull: {
    width: "100%",
  },
  eventImage: {
    ...StyleSheet.absoluteFillObject,
  },
  eventImageFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#2A4BB5",
  },
  eventOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  eventContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventEyebrow: {
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 18,
    color: "#CFE0FF",
  },
  eventTitle: {
    marginTop: 3,
    fontFamily: "Urbanist-800",
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.3,
    color: huddleColors.onPrimary,
  },
  eventMeta: {
    marginTop: 3,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
    color: "#DBE4FF",
  },
  eventStackRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventStackItem: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
  },
  eventStackOverlap: {
    marginLeft: -9,
  },
  eventDashRow: {
    position: "absolute",
    bottom: 10,
    right: huddleSpacing.x4,
    flexDirection: "row",
    gap: 4,
  },
  eventDash: {
    width: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  eventDashActive: {
    width: 14,
    backgroundColor: huddleColors.onPrimary,
  },
});
