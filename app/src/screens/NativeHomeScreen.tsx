import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from "react-native-reanimated";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Image,
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
  type NativeChatDiscoveryFilters,
} from "../lib/nativeChat";
import { resolveNativeViewerScope } from "../lib/nativeViewerScope";
import { fetchVisibleMapPinShells } from "../lib/nativeMapData";
import { fetchNativeUnreadNotificationCountWithToken } from "../lib/nativeNotifications";
import {
  cacheWriteGuard,
  freshnessRegistry,
  isCurrentSessionKey,
  LOAD_PHASE_DEFINITIONS,
  type RefreshSurface,
} from "../lib/nativeFreshnessRegistry";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  type NativeProfileSummary,
  type NativeQuotaSnapshot,
} from "../lib/nativeProfileSummary";
import { fetchNativeRestrictionsSnapshot } from "../lib/nativeSafetyRestrictions";
import { fetchNativeServiceProviders } from "../lib/nativeService";
import { purgeNativeSocialPersistentCache } from "./NativeSocialScreen";
import { NativeShimmerSkeleton } from "../components/NativeShimmerSkeleton";
import { springSoft } from "../lib/nativeAnimations";
import { touchNativeLastActive } from "../lib/nativeActivity";
import { haptic } from "../lib/nativeHaptics";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleImageDefaults,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";
import noPetImage from "../../assets/Notifications/Main-Page-no-Pet.png";

type NativeHomeScreenProps = {
  userId: string | null;
  accessToken?: string | null;
  sessionGeneration: number;
  sessionKey: string | null;
  onNavigate: (path: string) => void;
};

const HOME_DISCOVERY_WARM_FILTERS: NativeChatDiscoveryFilters = {
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
  photo_url: string | null;
  is_active: boolean | null;
};

type HomeReminder = {
  id: string;
  pet_id: string;
  due_date: string;
  kind: string | null;
  reason: string | null;
};

type LoadState = "loading" | "ready" | "error";

const HOME_PETS_CACHE_VERSION = 1;
const HOME_PETS_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type HomePetsCachePayload = {
  version: number;
  cachedAt: number;
  sessionKey: string;
  userId: string;
  pets: HomePet[];
};

type HomeFreshnessSession = {
  accessToken: string;
  sessionGeneration: number;
  sessionKey: string;
  userId: string;
};

const wisdomTips: Record<string, string[]> = {
  Dog: [
    "Keep daily walks predictable; dogs relax faster when exercise, meals, and rest follow a familiar rhythm.",
    "Check paws after outdoor walks, especially after hot pavement, rain, or rough ground.",
    "Short training moments work best when they end before your dog loses focus.",
    "Fresh water and a quiet cool-down spot help dogs recover after play.",
  ],
  Cat: [
    "Cats feel safer when food, litter, scratching, and rest zones are separated.",
    "A few minutes of hunting-style play before meals can reduce restless evening energy.",
    "Slow blinks, soft voices, and side approaches are easier for many cats to trust.",
    "Clean litter boxes daily. Sudden changes can signal health or stress.",
  ],
  Bird: [
    "Birds need steady sleep routines and a calm, covered rest period at night.",
    "Rotate safe toys regularly so enrichment stays interesting without overcrowding the cage.",
    "Avoid non-stick fumes, aerosols, and smoke around birds; their lungs are extremely sensitive.",
    "Daily observation matters: appetite, droppings, and posture changes can be early warning signs.",
  ],
  Rabbit: [
    "Rabbits need unlimited hay; it supports digestion and keeps teeth wearing down naturally.",
    "Give rabbits hiding spaces and gentle floor-level interaction so they feel secure.",
    "Sudden appetite loss in rabbits is urgent and should be checked quickly.",
    "Rabbit spaces stay healthier when litter, hay, and water areas are refreshed daily.",
  ],
  Reptile: [
    "Stable temperature gradients are essential; check warm and cool zones with a reliable thermometer.",
    "Humidity needs vary by species, so match enclosure care to the animal, not the tank size.",
    "UVB bulbs weaken before they visibly burn out; replace them on schedule.",
    "Clean water bowls and hides often to prevent bacteria building up in warm enclosures.",
  ],
  Hamster: [
    "Hamsters need deep bedding for burrowing and a quiet place to sleep during the day.",
    "A solid running wheel protects tiny feet better than wire wheels.",
    "Scatter feeding adds enrichment and lets hamsters forage naturally.",
    "Handle hamsters close to a soft surface; sudden jumps can cause injuries.",
  ],
  Others: [
    "Small routine checks often catch pet issues early: appetite, water, energy, and bathroom habits.",
    "A predictable care rhythm helps most pets feel safer and easier to understand.",
    "Keep a simple note of unusual behaviour so patterns are easier to spot.",
    "When care advice conflicts, follow species-specific veterinary guidance first.",
  ],
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatSpeciesLabel = (value: string) =>
  String(value || "")
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatPetAge = (dob: string | null | undefined) => {
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
  if (years <= 0) return `${Math.max(months, 0)} mo`;
  if (months <= 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
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
  const day = String(value.getDate()).padStart(2, "0");
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

const socialRoleText = (profile: NativeProfileSummary | null) => {
  const roles = Array.isArray(profile?.availability_status)
    ? profile.availability_status
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .map((entry) => (/^animal friend\s*\(no pet\)$/i.test(entry) ? "Animal Friend" : entry))
    : [];
  return roles.length > 0 ? roles.join(" · ") : "Animal Friend";
};

const normalizeTier = (value?: string | null) => {
  const tier = String(value || "free").trim().toLowerCase();
  if (tier === "gold" || tier === "huddle gold" || tier.startsWith("gold_")) return "gold";
  if (
    tier === "plus" ||
    tier === "premium" ||
    tier === "huddle+" ||
    tier === "huddle plus" ||
    tier.startsWith("plus_") ||
    tier.startsWith("premium_")
  ) {
    return "plus";
  }
  return "free";
};

const tierLabel = (value?: string | null) => {
  const tier = normalizeTier(value);
  if (tier === "gold") return "Huddle Gold";
  if (tier === "plus") return "Huddle+";
  return "Free";
};

const starQuotaLimit = (value?: string | null) => {
  const tier = normalizeTier(value);
  if (tier === "gold") return 10;
  if (tier === "plus") return 4;
  return 0;
};

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const homePetsSessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const getHomePetsCacheKey = (userId: string, sessionKey?: string | null) => `huddle_home_pets:v2:${userId}:${homePetsSessionKey(userId, sessionKey)}`;

const HOME_DB_CACHE_TTL_MS = 30_000;
const homePetsMemoryCache = new Map<string, { pets: HomePet[]; cachedAt: number }>();
const homePetsInFlight = new Map<string, Promise<HomePet[]>>();
const homeRemindersMemoryCache = new Map<string, { reminders: HomeReminder[]; cachedAt: number }>();
const homeRemindersInFlight = new Map<string, Promise<HomeReminder[]>>();

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
    (pet.photo_url === null || typeof pet.photo_url === "string") &&
    (pet.is_active === null || typeof pet.is_active === "boolean")
  );
};

const readHomePetsCache = async (userId: string, sessionKey?: string | null) => {
  const key = getHomePetsCacheKey(userId, sessionKey);
  const cacheSessionKey = homePetsSessionKey(userId, sessionKey);
  try {
    const raw = await AsyncStorage.getItem(key);
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

const fetchHomePets = async (userId: string, options: { force?: boolean; accessToken?: string | null; cacheWriteGuard?: () => boolean; sessionKey?: string | null } = {}) => {
  if (!options.force) {
    const cached = readHomePetsMemoryCache(userId, options.sessionKey);
    if (cached) return cached;
  }

  const requestKey = getHomePetsCacheKey(userId, options.sessionKey);
  const existing = homePetsInFlight.get(requestKey);
  if (!options.force && existing) return existing;
  if (!options.accessToken) throw new Error("home_pets_access_token_required");

  const request = (async () => {
    const params = new URLSearchParams({
      select: "id,name,species,breed,weight,weight_unit,dob,photo_url,is_active,created_at",
      owner_id: `eq.${userId}`,
      order: "is_active.desc,created_at.asc",
      limit: "20",
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/pets?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        apikey: supabaseAnonKey,
      },
    });
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!response.ok) {
      throw new Error(typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText));
    }
    const rows = ((Array.isArray(parsed) ? parsed : []) as HomePet[]).filter((pet) => typeof pet.id === "string");
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

const fetchHomeReminders = async (userId: string, petId: string, options: { accessToken?: string | null; force?: boolean } = {}) => {
  const cacheKey = `${userId}:${petId}:${todayISO()}`;

  if (!options.force) {
    const cached = readHomeRemindersMemoryCache(cacheKey);
    if (cached) return cached;
  }

  const existing = homeRemindersInFlight.get(cacheKey);
  if (!options.force && existing) return existing;

  const request = (async () => {
    const token = String(options.accessToken || "").trim();
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
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
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

const speciesTip = (species: string | undefined) => {
  if (!species) return null;
  const normalizedValue = species.trim().toLowerCase();
  const normalizedSpecies =
    normalizedValue === "dogs" ? "Dog" :
      normalizedValue === "cats" ? "Cat" :
        normalizedValue === "other" || normalizedValue === "others" ? "Others" :
          species.charAt(0).toUpperCase() + species.slice(1).toLowerCase();
  const tips = wisdomTips[normalizedSpecies] || wisdomTips.Others;
  return tips.length ? tips[Math.floor(Math.random() * tips.length)] : null;
};

export function NativeHomeScreen({ userId, accessToken, sessionGeneration, sessionKey, onNavigate }: NativeHomeScreenProps) {
  const { height, width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView | null>(null);
  const petsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionKeyRef = useRef<string | null>(sessionKey);
  const [state, setState] = useState<LoadState>("loading");
  const [profile, setProfile] = useState<NativeProfileSummary | null>(null);
  const [quota, setQuota] = useState<NativeQuotaSnapshot | null>(null);
  const [pets, setPets] = useState<HomePet[]>([]);
  const [reminders, setReminders] = useState<HomeReminder[]>([]);
  const [selectedPetIndex, setSelectedPetIndex] = useState(0);

  const cardWidth = Math.min(Math.max(width * 0.8, 248), 332);
  const loadingCardHeight = Math.min(Math.max(height * 0.52, 320), 500);
  const sideInset = Math.max((width - cardWidth) / 2, huddleSpacing.x5);
  const selectedPet = pets[Math.min(selectedPetIndex, Math.max(pets.length - 1, 0))] || null;
  const nextEventLabel = formatReminderLabel(selectedPet, reminders);
  const selectedPetTip = useMemo(() => speciesTip(selectedPet?.species), [selectedPet?.species]);
  const displayName = profile?.display_name?.trim() || "";
  const firstName = displayName.split(/\s+/)[0] || "";
  const avatarInitial = firstName.charAt(0).toUpperCase();
  const hasProfileSummary = Boolean(displayName);
  const tierValue = quota?.effective_tier || quota?.tier || profile?.effective_tier || profile?.tier || "free";
  const starTierValue = profile?.tier || "free";
  const realTier = normalizeTier(starTierValue);
  const membershipTier = normalizeTier(tierValue);
  const membershipLabel = tierLabel(tierValue);
  const starUsed = numberValue(quota?.stars_used_cycle ?? quota?.stars_month_used);
  const starExtras = numberValue(quota?.extra_stars ?? quota?.extras_stars);
  const starsRemaining = Math.max(0, starQuotaLimit(starTierValue) - starUsed) + starExtras;
  const starQuotaLabel = `${Math.max(0, starsRemaining)} ⭐`;
  const showStarQuotaPill = !(realTier === "free" && starsRemaining <= 0);
  const showMembershipSummary = membershipTier !== "free" || starsRemaining > 0;

  currentSessionKeyRef.current = sessionKey;
  void LOAD_PHASE_DEFINITIONS;

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
        runSurface("viewer_location_scope", () => resolveNativeViewerScope({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken })),
        runSurface("tier_quota_restrictions", () => fetchNativeRestrictionsSnapshot({ force: true })),
        runSurface("notification_unread", () => fetchNativeUnreadNotificationCountWithToken(freshnessSession.userId, freshnessSession.accessToken)),
        runSurface("chat_unread", () => fetchNativeChatUnreadTotal(freshnessSession.userId, { accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, force: true, cacheWriteGuard: guardedCacheWrite })),
        runSurface("chat_inbox_summary", () => fetchNativeChatInbox({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken, sessionKey: sessionKeyForWrite, scope: "all", onlyWithActivity: true, limit: 20, force: true, forceDb: true, cacheWriteGuard: guardedCacheWrite })),
      ]);

      if (!isCurrentFreshnessSession()) return;

      const profileSnapshot = profileResult.status === "fulfilled" ? profileResult.value.value ?? null : null;
      if (profileSnapshot?.profile) {
        setProfile(profileSnapshot.profile);
        setQuota(profileSnapshot.quota);
      }
      if (petsResult.status === "fulfilled" && Array.isArray(petsResult.value.value)) {
        const nextPets = petsResult.value.value;
        setPets(nextPets);
        if (guardedCacheWrite()) void writeHomePetsCache(freshnessSession.userId, nextPets, sessionKeyForWrite);
      }

      const viewerScope = coordsResult.status === "fulfilled" ? coordsResult.value.value ?? null : null;
      const primaryPoint = viewerScope?.primaryPoint ?? null;
      if (primaryPoint) {
        void runSurface("map_shell", () => fetchVisibleMapPinShells([primaryPoint.lng, primaryPoint.lat], 25000, {
          accessToken: freshnessSession.accessToken,
          viewerId: freshnessSession.userId,
          sessionKey: sessionKeyForWrite,
          force: true,
          cacheWriteGuard: guardedCacheWrite,
        })).catch(() => undefined);
      }

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

      await Promise.allSettled([
        guardedP1("discover_cards", () => fetchNativeChatDiscoveryProfiles(freshnessSession.userId, HOME_DISCOVERY_WARM_FILTERS, { accessToken: freshnessSession.accessToken, effectiveTier, force: true, cacheWriteGuard: guardedCacheWrite, viewerScope })),
        guardedP1("social_first_page_shell", () => purgeNativeSocialPersistentCache(freshnessSession.userId)),
        guardedP1("service_cards", () => fetchNativeServiceProviders({
          userId: freshnessSession.userId,
          accessToken: freshnessSession.accessToken,
          sessionKey: sessionKeyForWrite,
          anchor: primaryPoint ? { lat: primaryPoint.lat, lng: primaryPoint.lng } : null,
          viewerCountry: locationCountry,
          viewerScope,
          force: true,
          cacheWriteGuard: guardedCacheWrite,
        })),
        guardedP1("groups_invites", () => fetchNativeExploreGroups({ userId: freshnessSession.userId, accessToken: freshnessSession.accessToken, force: true, cacheWriteGuard: guardedCacheWrite, viewerScope })),
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

    if (showLoading) setState("loading");
    try {
      const guardedCacheWrite = sessionKey ? () => cacheWriteGuard(currentSessionKeyRef.current, sessionKey) : undefined;
      const [profileSummary, nextPets] = await Promise.all([
        fetchNativeProfileSummary(userId, { force: forceDb, accessToken, sessionKey, cacheWriteGuard: guardedCacheWrite }),
        fetchHomePets(userId, { force: showLoading || forceDb, accessToken, sessionKey, cacheWriteGuard: guardedCacheWrite }),
      ]);

      const nextProfile = profileSummary.profile;
      const nextQuota = profileSummary.quota;
      setProfile(nextProfile);
      setQuota(nextQuota);
      setPets(nextPets);
      if (sessionKey && guardedCacheWrite?.() !== false) void writeHomePetsCache(userId, nextPets, sessionKey);
      setSelectedPetIndex(0);
      if (nextPets.length === 0) setReminders([]);
      setState("ready");
    } catch {
      if (showLoading) setState("error");
    }
  }, [accessToken, sessionKey, userId]);

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
      if (cachedPets && cachedProfile) {
        setPets(cachedPets);
        setSelectedPetIndex(0);
        setState("ready");
        if (accessToken && sessionKey) void runHomeFreshnessSweep({ userId, accessToken, sessionGeneration, sessionKey });
        return;
      }
      void loadHome({ showLoading: true, forceDb: true }).then(() => {
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
        void runHomeFreshnessSweep({ userId, accessToken, sessionGeneration, sessionKey });
      }
    });
    return () => subscription.remove();
  }, [accessToken, runHomeFreshnessSweep, sessionGeneration, sessionKey, userId]);

  useEffect(() => {
    if (!userId) return;
    return subscribeNativeProfileSummary(userId, ({ profile: nextProfile, quota: nextQuota }) => {
      setProfile(nextProfile);
      setQuota(nextQuota);
    });
  }, [userId]);

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
    const pet = pets[selectedPetIndex];
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
  }, [accessToken, pets, selectedPetIndex, userId]);

  const handleCarouselScroll = (offsetX: number) => {
    const step = cardWidth + 6;
    const nextIndex = Math.round((offsetX - sideInset) / step);
    const bounded = Math.min(Math.max(nextIndex, 0), Math.max(pets.length - 1, 0));
    if (bounded !== selectedPetIndex) {
      haptic.selectTab();
      setSelectedPetIndex(bounded);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {hasProfileSummary ? (
        <View style={styles.pageHeader}>
          <Pressable
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onNavigate("/edit-profile")}
          >
            <View style={[styles.avatar, isNativeVerifiedProfile(profile) ? styles.avatarVerified : null]}>
              {profile?.avatar_url ? (
                <ExpoImage
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImage}
                  contentFit={huddleImageDefaults.contentFit}
                  cachePolicy={huddleImageDefaults.cachePolicy}
                  transition={huddleImageDefaults.transition}
                  priority="high"
                />
              ) : (
                <Text style={styles.avatarInitial}>{avatarInitial}</Text>
              )}
            </View>
            <View style={[styles.avatarBadge, isNativeVerifiedProfile(profile) ? styles.avatarBadgeVerified : null]}>
              <Feather color={isNativeVerifiedProfile(profile) ? huddleColors.onPrimary : huddleColors.mutedText} name="shield" size={12} />
            </View>
          </Pressable>
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={styles.title}>{displayName}</Text>
            </View>
            <Text numberOfLines={1} style={styles.subtitle}>{socialRoleText(profile)}</Text>
            {showMembershipSummary ? (
              <View pointerEvents="none" style={styles.profilePillRow}>
                <View
                  style={[
                    styles.tierPill,
                    membershipTier === "gold" && styles.tierPillGold,
                    membershipTier === "plus" && styles.tierPillPlus,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.tierPillText, membershipTier !== "free" && styles.tierPillTextActive]}
                  >
                    {membershipLabel}
                  </Text>
                </View>
                {showStarQuotaPill ? (
                  <View style={[styles.starsPill, starsRemaining <= 0 && styles.starsPillEmpty]}>
                    <Text numberOfLines={1} style={[styles.starsPillText, starsRemaining <= 0 && styles.starsPillTextEmpty]}>
                      {starQuotaLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      ) : (
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
      )}

      {state === "loading" ? (
        <NativeShimmerSkeleton style={[styles.loadingCard, { height: loadingCardHeight }]} />
      ) : null}

      {state === "error" ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Home could not load</Text>
          <Text style={styles.emptyBody}>Check your connection and retry.</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadHome({ showLoading: true })} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {state === "ready" && pets.length === 0 ? (
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
            <Text style={styles.emptyBody}>
              Huddle is built by more than just pet owners; it's built by trusted guardians.
            </Text>
            <Text style={styles.emptyBody}>
              Get verified to join the pack—protecting the lost on the <Text style={styles.emptyBodyStrong}>Map</Text>, lending a hand in{" "}
              <Text style={styles.emptyBodyStrong}>Social</Text>, and finding your people in <Text style={styles.emptyBodyStrong}>Chats</Text>.
            </Text>
            <Text style={styles.emptyBody}>Every great story starts with a first step.</Text>
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

      {state === "ready" && pets.length > 0 ? (
        <>
          <View style={styles.carouselSection}>
            <ScrollView
              ref={carouselRef}
              contentContainerStyle={[styles.carouselContent, { paddingHorizontal: sideInset }]}
              decelerationRate="fast"
              horizontal
              onMomentumScrollEnd={(event) => handleCarouselScroll(event.nativeEvent.contentOffset.x)}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + 6}
              snapToAlignment="start"
            >
              {pets.map((pet, index) => (
                <PetCard
                  cardWidth={cardWidth}
                  index={index}
                  isSelected={index === selectedPetIndex}
                  key={pet.id}
                  nextEventLabel={nextEventLabel}
                  onEdit={() => onNavigate(`/edit-pet-profile?id=${pet.id}`)}
                  onPress={() => onNavigate(`/pet-details?id=${pet.id}`)}
                  pet={pet}
                />
              ))}
              <Pressable
                accessibilityLabel="Add pet"
                accessibilityRole="button"
                onPress={() => onNavigate("/edit-pet-profile")}
                style={[styles.addPetCard, { width: cardWidth, height: cardWidth * 1.25 }]}
              >
                <View style={styles.addPetIcon}>
                  <Feather color={huddleColors.blue} name="plus" size={25} />
                </View>
              </Pressable>
            </ScrollView>
          </View>

          {selectedPetTip ? (
            <View style={styles.tipSection}>
              <View style={styles.tipCard}>
                <View style={styles.tipIcon}>
                  <MaterialCommunityIcons color={huddleColors.blue} name="lightbulb-outline" size={20} />
                </View>
                <Text style={styles.tipText}>{selectedPetTip}</Text>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function PetCard({
  cardWidth,
  index,
  isSelected,
  nextEventLabel,
  onEdit,
  onPress,
  pet,
}: {
  cardWidth: number;
  index: number;
  isSelected: boolean;
  nextEventLabel: string;
  onEdit: () => void;
  onPress: () => void;
  pet: HomePet | null;
}) {
  const reduceMotion = useReducedMotion();
  const animatedSelectionStyle = useAnimatedStyle(() => {
    const targetScale = isSelected ? 1 : 0.94;
    const targetOpacity = isSelected ? 1 : 0.7;
    if (reduceMotion) {
      return { transform: [{ scale: targetScale }], opacity: targetOpacity };
    }
    return {
      transform: [{ scale: withSpring(targetScale, springSoft) }],
      opacity: withSpring(targetOpacity, springSoft),
    };
  }, [isSelected, reduceMotion]);

  if (!pet) return null;
  return (
    <Animated.View
      style={[
        { width: cardWidth, height: cardWidth * 1.25 },
        index > 0 ? styles.petCardGap : null,
        animatedSelectionStyle,
      ]}
    >
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.petCard, styles.petCardFill]}
    >
      <Pressable
        accessibilityLabel="Edit Pet"
        accessibilityRole="button"
        onPress={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        style={styles.editPetButton}
      >
        <Feather color={huddleColors.mutedText} name="settings" size={17} />
      </Pressable>
      <View style={styles.petMedia}>
        {pet.photo_url ? (
          <ExpoImage
            contentFit="cover"
            cachePolicy={huddleImageDefaults.cachePolicy}
            transition={huddleImageDefaults.transition}
            source={{ uri: pet.photo_url }}
            style={styles.petImage}
          />
        ) : (
          <View style={styles.petFallback}>
            <MaterialCommunityIcons color={huddleColors.onPrimary} name="paw" size={54} />
          </View>
        )}
        <LinearGradient
          colors={["rgba(66,73,101,0)", "rgba(66,73,101,0.40)", "rgba(66,73,101,0.80)"]}
          locations={[0, 0.55, 1]}
          pointerEvents="none"
          style={styles.petScrim}
        />
      </View>
      <View style={styles.petContent}>
        <Text numberOfLines={1} style={styles.petName}>{pet.name}</Text>
        <View style={styles.chipRow}>
          <StatusChip label={`${formatSpeciesLabel(pet.species || "Pet")}${pet.breed ? ` · ${pet.breed}` : ""}`} />
          {pet.dob ? <StatusChip label={formatPetAge(pet.dob)} /> : null}
          {pet.weight ? <StatusChip label={`${pet.weight}${pet.weight_unit || ""}`} /> : null}
        </View>
        {isSelected && pet.is_active !== false && nextEventLabel.trim() !== "—" ? (
          <View style={styles.nextEvent}>
            <Feather color={huddleColors.onPrimary} name="clock" size={16} />
            <Text numberOfLines={2} style={styles.nextEventText}>Next Event: {nextEventLabel}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
    </Animated.View>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <View style={styles.statusChip}>
      <Text numberOfLines={1} style={styles.statusChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  content: {
    paddingTop: huddleLayout.headerHeight,
    paddingBottom: huddleLayout.navHeight + huddleSpacing.x7,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(33,69,207,0.10)",
    borderWidth: 2,
    borderColor: "#C9CEDA",
  },
  avatarVerified: {
    borderColor: huddleColors.blue,
  },
  avatarSkeleton: {
    width: 72,
    height: 72,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(244,245,251,0.72)",
    borderWidth: 2,
    borderColor: "#C9CEDA",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
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
    backgroundColor: huddleColors.mutedCanvas,
  },
  avatarBadgeVerified: {
    backgroundColor: huddleColors.blue,
  },
  avatarInitial: {
    fontFamily: "Urbanist-700",
    fontSize: 26,
    color: huddleColors.blue,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
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
    marginTop: 4,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 20,
    color: "rgba(74,73,101,0.80)",
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
  tierPill: {
    minHeight: 25,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: "#ECEFF4",
  },
  tierPillPlus: {
    backgroundColor: "#5BA4F5",
  },
  tierPillGold: {
    backgroundColor: "#FF6A55",
  },
  tierPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: "#6E7386",
  },
  tierPillTextActive: {
    color: huddleColors.onPrimary,
  },
  starsPill: {
    minHeight: 25,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    borderWidth: 1,
    borderColor: "#E4E8F2",
    backgroundColor: huddleColors.canvas,
  },
  starsPillEmpty: {
    borderColor: "#C6CAD6",
    backgroundColor: "transparent",
  },
  starsPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.text,
  },
  starsPillTextEmpty: {
    color: "#98A0B8",
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
    fontFamily: "Urbanist-600",
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
  emptyBodyStrong: {
    fontFamily: "Urbanist-600",
    color: "#000000",
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
  carouselSection: {
    paddingTop: huddleSpacing.x1,
    paddingBottom: huddleSpacing.x3,
  },
  carouselContent: {
    paddingTop: 4,
    paddingBottom: huddleSpacing.x3,
  },
  petCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: huddleColors.text,
    ...huddleShadows.glassElevation2,
  },
  petCardFill: {
    width: "100%",
    height: "100%",
  },
  petCardGap: {
    marginLeft: 6,
  },
  editPetButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    ...huddleShadows.glassElevation2,
  },
  petMedia: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  petImage: {
    width: "100%",
    height: "100%",
  },
  petFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blueLight,
  },
  petScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "100%",
  },
  petContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: huddleSpacing.x5,
  },
  petName: {
    fontFamily: "Urbanist-700",
    fontSize: 24,
    lineHeight: 30,
    color: huddleColors.onPrimary,
  },
  chipRow: {
    marginTop: huddleSpacing.x2,
    marginBottom: huddleSpacing.x3,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  statusChip: {
    maxWidth: "100%",
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  statusChipText: {
    fontFamily: "Urbanist-700",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.onPrimary,
  },
  nextEvent: {
    marginTop: huddleSpacing.x1,
    borderRadius: 12,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  nextEventText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  addPetCard: {
    marginLeft: 6,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: huddleColors.divider,
    backgroundColor: "rgba(255,255,255,0.98)",
    ...huddleShadows.glassElevation2,
  },
  addPetIcon: {
    width: 64,
    height: 64,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.mutedCanvas,
  },
  tipSection: {
    paddingHorizontal: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x4,
  },
  tipCard: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 4, height: 4 },
    elevation: 2,
  },
  tipText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(74,73,101,0.80)",
  },
});
