import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem, readNativeDisplayCacheItems, readNativeDisplayCacheKeys } from "../lib/nativeDisplayCacheStorage";
import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { NativeGlyph } from "../components/NativeGlyphIcons";
import { NativeGlassCircle } from "../components/NativeGlassCircle";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, Dimensions, Easing, Image, Keyboard, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType, type ImageStyle, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeDiscoverCoachMarks } from "../components/coachmarks/NativeDiscoverCoachMarks";
import { NativeToast, NATIVE_TOAST_DURATION_MS } from "../components/NativeToast";
import { NativeLocationPinButton } from "../components/NativeLocationPinButton";
import { NativeGlassSurface } from "../components/NativeGlassSurface";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getQuotaCapsForTier, normalizeQuotaTier, quotaConfig } from "../lib/quotaConfig_v1";
import {
  mergeNativeStableDiscoveryDeck,
  nativeDiscoveryCycleIsActive,
  nativeDiscoveryCycleStartedAtStorageKey,
  nativeDiscoveryPassedCycleStorageKey,
  nativeDiscoveryStableDeckStorageKey,
  nativeDiscoveryTailRefillAttemptKey,
  selectNativeDailyUnpassedProfiles,
  shouldRefillNativeDiscoveryTail,
} from "../lib/nativeDiscoveryDeckPolicy";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeChatRowSkeleton, NativeGroupCardSkeleton, NativeShimmerSkeleton } from "../components/NativeShimmerSkeleton";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import {
  acceptNativeGroupInvite,
  cancelNativeGroupInvite,
  createNativeGroupChat,
  declineNativeGroupInvite,
  ensureNativeDirectChatRoom,
  extractNativeAvatarStorageObjectPath,
  archiveNativeChatRoomForCurrentUser,
  clearCachedNativeChatMessages,
  fetchNativeExploreGroups,
  fetchNativeMatchedRailSummary,
  matchedSummaryToInboxRow,
  fetchNativePendingGroupInvitePrompts,
  fetchNativeGroupPreviewMembers,
  peekNativeGroupPreviewMembers,
  fetchNativeGroupChatEvents,
  fetchNativeGroupChatEventsCached,
  peekNativeGroupChatEvents,
  fetchNativeGroupManagementSnapshot,
  fetchNativeViewerUpcomingGroupEvents,
  fetchNativeViewerGroupContext,
  fetchNativeChatDiscoveryProfiles,
  fetchNativeChatRoom,
  invalidateNativeDiscoveryRelationshipCache,
  markNativeDiscoveryRelationshipHandled,
  fetchNativeChatInbox,
  fetchNativeChatUnreadTotal,
  invalidateNativeChatReadCaches,
  markNativeServiceTabHasDialogues,
  readNativeServiceTabHasDialogues,
  joinNativeGroupByCode,
  joinNativePublicGroup,
  markNativeChatRoomRead,
  patchCachedNativeChatInboxGroupRows,
  requestNativeGroupJoin,
  resolveNativeChatInboxRowNavigation,
  searchNativeChatInbox,
  isNativeTeamHuddleIdentity,
  TEAM_HUDDLE_USER_ID,
  inviteNativeGroupMembers,
  removeNativeGroupChat,
  removeNativeGroupMember,
  sendNativeChatMessage,
  setNativeGroupMuteState,
  subscribeNativeChatUnmatchCommitted,
  updateNativeGroupChatMetadata,
  updateNativeGroupJoinRequest,
  uploadNativeChatStorageObject,
  type NativeChatDiscoveryProfile,
  type NativeChatDiscoveryFilters,
  type NativeChatDiscoverStatus,
  type NativeExploreGroup,
  type NativeGroupManagementSnapshot,
  type NativeGroupChatEvent,
  type NativeChatInboxRow,
  type NativeChatInboxScope,
  type NativeMatchedRailSummary,
} from "../lib/nativeChat";
import { haptic } from "../lib/nativeHaptics";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { markNativeNewChatSignal } from "../lib/nativeNewChatSignal";
import { readNativeChatsInboxHandoff, writeNativeChatsInboxHandoff, writeNativeChatsLastTabHandoff, writeNativeChatSelectedRowHandoff } from "../lib/nativeChatHandoff";
import { useErrorShake } from "../components/motion/useErrorShake";
import { useNativeModalTransition } from "../lib/nativeModalTransition";
import { fetchNativeServiceProviderDetail, incrementNativeServiceProviderView, type NativeServiceProvider } from "../lib/nativeService";
import { nativePetSpeciesEmojiOrText } from "../lib/nativePetEmoji";
import {
  buildNativePetFocusLabel,
  nativePetBreedOptionsForSpeciesLabel,
  nativePetFocusLabels,
  splitNativePetFocusLabel,
} from "../lib/nativePetTaxonomy";
import {
  extractNativeCountryFromPlaceLabel,
  fetchNativePrioritizedLocationSuggestions,
  getNativeForegroundLocationPermissionDetail,
  openNativeAppSettings,
  requestNativeForegroundLocationPermissionDetail,
  subscribeNativeLocationPermissionDetail,
  type NativeLocationPermissionDetail,
  type NativeLocationSuggestion,
  type NativeResolvedLocation,
} from "../lib/nativeLocation";
import { mergeNativeDiscoveryPermissionDeck } from "../lib/nativeDiscoveryPermissionDeck";
import { fetchNativeProfileSummary, isNativeProfileAtLeastAge, subscribeNativeProfileSummary } from "../lib/nativeProfileSummary";
import { setNativeFriendsMatchingEnabled } from "../lib/nativeFriendsMatching";
import { fetchNativePublicProfile, sendNativePublicProfileStarChat, sendNativePublicProfileWave, type NativePublicProfile } from "../lib/nativePublicProfile";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import { isNativeCoachMarkSeen } from "../lib/nativeCoachMarks";
import { getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { invalidateNativeBlockCascade } from "../lib/nativeBlockCascade";
import { nativeFreshImageKey, nativeFreshImageUri } from "../lib/nativeImageFreshness";
import { nativePetPresentationImageStyle } from "../lib/nativePetPhotoPresentation";
import { readNativeLocalMediaFile } from "../lib/nativeLocalMediaUpload";
import { createNativeProtectedActionError, logNativeProtectedActionFailure, requestNativeStorageCleanupResult } from "../lib/nativeStorageCleanup";
import { resolveNativeAvatarUrl } from "../lib/nativeStorageUrlCache";
import { searchNativeSocialMentionSuggestions, type NativeSocialMentionSuggestion } from "../lib/nativeSocial";
import { resolveNativeViewerScope, subscribeNativeViewerScope, type NativeViewerScope } from "../lib/nativeViewerScope";
import { createSinglePrivateBroadcastChannel, createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import type { NativeProfileUploadAsset } from "../lib/nativeProfilePhotos";
import { supabase, supabaseUrl } from "../lib/supabase";
import { huddleButtons, huddleCoachMark, huddleColors, huddleFieldStates, huddleFormControls, huddleGlassControls, huddleImageDefaults, huddleLayout, huddleMap, huddleRadii, huddleShadows, huddleSocial, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import discoverAgeGateImage from "../../assets/Notifications/discover-age-gate.png";
import emptyChatImage from "../../assets/Notifications/empty-chat-native.png";
import emptyChatImageFallback from "../../assets/Notifications/empty-chat.png";
import { NativeContactFriendRequests } from "../components/chat/NativeContactFriendRequests";
import matchedImage from "../../assets/Notifications/matched.png";
import serviceImage from "../../assets/Notifications/Service.jpg";
import teamHuddleLogo from "../../assets/huddle-logo-transparent.png";
import profilePlaceholder from "../../assets/ProfilePlaceholder.png";
import { NativePublicProfileModal, ProfileUpgradeModal, StarsExhaustedModal } from "../components/profile/NativePublicProfileModal";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativeMediaImageCropper } from "../components/profile/NativeProfilePhotoCropper";
import { pickNativeProfilePhoto } from "../components/profile/NativeProfilePhotoPicker";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
import { NativeEngagementSparkleInline } from "../components/NativeProfileAvatar";
import { NativeFormTextField } from "../components/NativeFormField";
import { HuddleRangeControl, HuddleSingleRangeControl } from "../components/HuddleRangeControl";
import {
  AppConfirmModal,
  AppDestructiveSlideConfirm,
  AppModalActionRow,
  AppBottomSheet,
  AppBottomSheetFooter,
  AppBottomSheetHeader,
  AppBottomSheetScroll,
  AppKeyboardAvoidingView as KeyboardAvoidingView,
  AppModalButton,
  AppModalCard,
  AppModalCloseButton,
  AppModalField,
  AppModalIconButton,
  AppModalScroll,
} from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import Reanimated, {
  Easing as ReanimEasing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { NativeAuroraCover } from "../components/NativeAuroraCover";
import { peekVisibleUserPinIds, subscribeVisibleUserPinIds } from "../lib/nativeMapData";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView as RNBlurView } from "@react-native-community/blur";
// MatchModal blob shapes — irregular vertical ovals with a strong left bulge (blue) and a slight
// concave waist (coral). Drawn as SVG paths so the outline + image clip stay pixel-precise.
import Svg, { Defs as SvgDefs, ClipPath as SvgClipPath, Image as SvgImage, Mask as SvgMask, Path as SvgPath, G as SvgG, Rect as SvgRect, Text as SvgText } from "react-native-svg";

let ChatGlassViewComponent: typeof import("expo-glass-effect").GlassView | null = null;
let CHAT_LIQUID_GLASS = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glass = require("expo-glass-effect") as typeof import("expo-glass-effect");
  CHAT_LIQUID_GLASS = glass.isLiquidGlassAvailable();
  if (CHAT_LIQUID_GLASS) ChatGlassViewComponent = glass.GlassView;
} catch {
  CHAT_LIQUID_GLASS = false;
}

type NativeChatsTab = "friends" | "groups" | "service" | "discover";
type NativeChatsTopTab = "discover" | "community" | "chats";
type StarUpgradeTier = "plus" | "gold";
type FilterTier = "free" | StarUpgradeTier;
type NativeGroupExploreSort = "relevance" | "proximity" | "latest" | "popularity";
type PendingGroupCover = { uri: string; name: string; mime: string; size: number | null; height?: number | null; width?: number | null };
type PendingGroupCoverCropTarget = {
  asset: NativeProfileUploadAsset & { height?: number | null; width?: number | null };
  target: "create" | "edit";
} | null;
type GroupDetailsErrors = { cover?: boolean; description?: boolean; location?: boolean; name?: boolean };
type MatchModalState = { userId: string; name: string; avatarUrl: string | null };
type SelfMatchProfile = { name: string; avatarUrl: string | null };
type StarConfirmTarget = { id: string; displayName: string; actionId: string };
type ProfileSheetFallbackData = Record<string, unknown>;
type DiscoverySendCueKind = "star";
type NativeViewerPetSignal = { species: string; breed: string };
const nativeDiscoveryActionId = (kind: "wave" | "star", targetId: string) =>
  `${kind}:${targetId}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
const DISCOVER_AGE_GATE_COPY = "Discover is available to people aged 16+ only.\nYou can still use Social, Chats, and Map.";

const GROUP_EXPLORE_SORT_OPTIONS: Array<{ value: NativeGroupExploreSort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "proximity", label: "Proximity" },
  { value: "latest", label: "Latest" },
  { value: "popularity", label: "Popularity" },
];

const uploadNativeGroupCover = async (options: { accessToken?: string | null; asset: PendingGroupCover; chatId: string; userId: string }) => {
  const accessToken = await getFreshNativeAccessToken(options.accessToken);
  if (!accessToken) throw new Error("missing_access_token");
  if (!options.chatId) throw new Error("missing_group");
  if (options.asset.size !== null && options.asset.size > 15 * 1024 * 1024) throw new Error("file_too_large");
  const file = await readNativeLocalMediaFile(options.asset.uri, { fileName: options.asset.name, mimeType: options.asset.mime }, { fallbackContentType: "image/jpeg", fallbackExtension: "jpg" });
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const objectName = `groups/${options.chatId}/cover-${uploadId}.${file.extension}`;
  try {
    await uploadNativeChatStorageObject({
      accessToken,
      bucket: "avatars",
      path: objectName,
      body: file.body,
      contentType: file.contentType || options.asset.mime || "image/jpeg",
      upsert: true,
    });
  } catch (error) {
    throw createNativeProtectedActionError({
      ok: false,
      stage: "upload",
      originalError: error,
      cleanupAttempted: false,
      cleanupResult: "not_needed",
    });
  }
  const { error: registerError } = await nativeExactTokenRpc("register_native_media_asset", {
    p_bucket: "avatars",
    p_content_id: options.chatId,
    p_content_type: "group_cover",
    p_expires_at: null,
    p_object_path: objectName,
  }, accessToken);
  if (registerError) {
    const cleanupResult = await requestNativeStorageCleanupResult("avatars", objectName, "register_group_cover_media_failed", accessToken);
    throw createNativeProtectedActionError({
      ok: false,
      stage: "register",
      originalError: registerError,
      cleanupAttempted: true,
      cleanupResult,
    });
  }
  return {
    objectName,
    url: `${supabaseUrl}/storage/v1/object/public/avatars/${objectName.split("/").map((part) => encodeURIComponent(part)).join("/")}`,
  };
};
type NativeChatsScreenProps = {
  active?: boolean;
  accessToken?: string | null;
  careMarketIsActive?: boolean;
  userId: string | null;
  search?: string;
  sessionKey?: string | null;
  onBottomSheetOpenChange?: (open: boolean) => void;
  friendRequestUnread?: boolean;
  onNavigate: (path: string) => void;
};

const MAIN_TABS: Array<{ key: Exclude<NativeChatsTab, "discover">; label: string }> = [
  { key: "friends", label: "Friends" },
  { key: "groups", label: "Groups" },
  { key: "service", label: "Care" },
];

const ALL_GENDERS = ["Man", "Woman", "Non-binary", "Transgender", "Genderfluid", "Others"];
const ALL_SPECIES = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others", "None"];
const ALL_SOCIAL_ROLES = ["Pet Parent", "Pet Nanny", "Animal Friend (No Pet)", "Veterinarian", "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer"];
const ALL_ORIENTATIONS = ["Straight", "Gay / Lesbian", "Bisexual", "Pansexual", "Queer", "Asexual", "Questioning / Not sure", "Others"];
const ALL_DEGREES = ["High School", "Bachelor", "Master", "PhD", "Other"];
const ALL_RELATIONSHIP_STATUSES = ["Single", "In a relationship", "Open relationship", "Married", "Divorced"];
const ALL_LANGUAGES = [
  "English",
  "Cantonese",
  "Mandarin",
  "Spanish",
  "French",
  "Japanese",
  "Korean",
  "German",
  "Portuguese",
  "Italian",
  "Arabic",
  "Hindi",
  "Bengali",
  "Urdu",
  "Russian",
  "Turkish",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Malay",
  "Tamil",
  "Telugu",
  "Polish",
  "Dutch",
  "Swedish",
];
const PET_FOCUS_OPTIONS = ["All", ...nativePetFocusLabels];
const GROUP_PET_FOCUS_MAX = 3;
const GROUP_DESCRIPTION_WORD_LIMIT = 100;
const GROUP_DESCRIPTION_FIELD_MIN_HEIGHT = huddleType.labelLine * 2;
const GROUP_DESCRIPTION_FIELD_MAX_HEIGHT = 92;
const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const safeQuotaNumber = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
const parseProfileExperienceYears = (value: unknown) => {
  if (value == null || value === "") return null;
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(value).match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const estimatePetFocusChipUnits = (value: string) => value.length * 8 + 28;
const shouldCollapsePetFocusChips = (values: string[]) => values.reduce((total, value) => total + estimatePetFocusChipUnits(value), 0) + Math.max(0, values.length - 1) * 6 > 315;
const normalizeCountryForSurfaceScope = (value?: string | null) => String(value || "").trim().toLowerCase();
const resolveGroupExploreCountryFromScope = (scope?: NativeViewerScope | null) => (
  scope?.countryName ||
  scope?.country ||
  scope?.profileCountryName ||
  scope?.profileCountry ||
  null
);
const groupMatchesViewerCountry = (group: NativeExploreGroup, country?: string | null) => {
  const viewerCountry = normalizeCountryForSurfaceScope(country);
  if (!viewerCountry) return false;
  return normalizeCountryForSurfaceScope(group.locationCountry) === viewerCountry;
};
const INBOX_FIRST_PAGE = 10;
const INBOX_NEXT_PAGE = 20;
const DISCOVERY_VISIBLE_COUNT = 20;
const DISCOVERY_MAX_RADIUS_KM = 150;
const DISCOVERY_HEIGHT_MAX_CM = 250;
// Send-cue runway. Star is rare and paid so it carries more weight than a wave,
// but it follows a confirm modal — the person has already committed twice, and
// ceremony after a confirmation is just delay.
const NATIVE_STAR_CUE_MS = 400;

const SWIPE_COMMIT_OFFSET = 110;
const SWIPE_COMMIT_OFFSET_LAST = 130;
const SWIPE_COMMIT_VELOCITY = 0.8;
const SWIPE_VELOCITY_MIN_OFFSET = 80;
const SWIPE_VERTICAL_BOUND = 80;
const DISCOVERY_FLING_X = Math.max(Dimensions.get("window").width, 430) * 1.05;
const FILTER_SHEET_SCROLL_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.58);
// Fisher-Yates shuffle for the discovery deck — used by pull-to-refresh to reorder the
// current unpassed stack so a refresh visibly reshuffles instead of re-showing the same
// deterministic order.
const shuffleDiscoveryDeck = <T,>(deck: T[]): T[] => {
  const next = [...deck];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const discoveryHandledKey = (userId: string) => `native-chats:discovery-handled:${userId}`;
const discoveryFiltersKey = (userId: string) => `native-chats:discovery-filters:v2:${userId}`;
const CHATS_EXPLORE_GROUPS_CACHE_PREFIX = "native-chats:groups-explore-cache:";
const chatsExploreGroupsCacheKey = (userId: string, scopeKey: string) => (
  `native-chats:groups-explore-cache:v5:${userId}:${encodeURIComponent(scopeKey || "global")}`
);
const chatsInboxRowsCacheKey = (userId: string, sessionKey: string | null | undefined, mainTab: Exclude<NativeChatsTab, "discover">) => `native-chats:inbox-cache:v3:${userId}:${sessionKey || `${userId}:0`}:${mainTab}`;
const chatsServiceTabProbeCacheKey = (userId: string, sessionKey: string | null | undefined) => `native-chats:service-tab-probe:v2:${userId}:${sessionKey || `${userId}:0`}`;
const chatsGroupDetailsCacheKey = (userId: string, chatId: string, isExplore: boolean) => `native-chats:groupSnapshot:v2:${userId}:${isExplore ? "explore" : "manage"}:${chatId}`;
const CHATS_DISCOVER_CACHE_LIMIT = 8;
// How many queued cards behind the visible top card get canonical-hydrated ahead of a swipe.
// Bounded on purpose: deep prefetch would spend a canonical fetch on cards most sessions
// never reach.
const DISCOVERY_QUEUED_HYDRATION_DEPTH = 2;
const DISCOVERY_QUEUED_HYDRATION_MAX_ATTEMPTS = 2;

// A refresh may improve ranking, but it must not move cards already committed to
// the visible deck. Existing order wins; newly eligible profiles append behind it.
const resetDiscoveryCanonicalPreviewState = (profiles: NativeChatDiscoveryProfile[]) => profiles.map((profile) => ({
  ...profile,
  bio: null,
  canonicalProfileLoaded: false,
  canonicalProfileFailed: false,
}));

const applyCanonicalProfilePreviewToDiscoveryProfile = (profile: NativeChatDiscoveryProfile, detail: NativePublicProfile): NativeChatDiscoveryProfile => {
  const visibleBio = detail.visibility.show_bio ? detail.bio.trim() : "";
  const publicPets = detail.petHeads.map((pet) => ({
    ageYears: pet.ageYears ?? null,
    id: pet.id,
    isPublic: pet.isPublic !== false,
    name: pet.name ?? null,
    photoUrl: pet.photoUrl ?? null,
    photoPosition: pet.photoPosition ?? null,
    species: pet.species ?? null,
    updatedAt: pet.updatedAt ?? null,
  }));
  const canonicalExperienceYears = parseProfileExperienceYears(detail.experienceYears);
  return {
    ...profile,
    bio: visibleBio || null,
    canonicalProfileLoaded: true,
    canonicalProfileFailed: false,
    petExperience: detail.petExperience.length > 0 ? detail.petExperience : profile.petExperience,
    petExperienceYears: canonicalExperienceYears ?? profile.petExperienceYears,
    pets: publicPets.length > 0 ? publicPets : profile.pets,
    socialRoles: detail.availabilityStatus.length > 0 ? detail.availabilityStatus : profile.socialRoles,
    socialRole: detail.availabilityStatus[0] ?? profile.socialRole,
  };
};

const CHATS_GROUP_EXPLORE_CACHE_LIMIT = 5;
const CHATS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DISCOVERY_ROLLBACK_REQUEUE_OFFSET = 4;

const readChatsCache = async <T,>(key: string): Promise<T | null> => {
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: number; value?: T };
    if (typeof parsed.cachedAt !== "number" || Date.now() - parsed.cachedAt > CHATS_CACHE_MAX_AGE_MS) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed.value ?? null;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
};

const writeChatsCache = async <T,>(key: string, value: T) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const patchNativeChatsGroupCaches = async (
  userId: string | null | undefined,
  chatId: string,
  patch: Partial<NativeChatInboxRow> & Partial<NativeExploreGroup>,
  insertGroup?: NativeExploreGroup | null,
) => {
  const viewer = String(userId || "").trim();
  if (!viewer || !chatId) return;
  const keys = await readNativeDisplayCacheKeys();
  await Promise.all(keys.filter((key) => (
    (key.startsWith(CHATS_EXPLORE_GROUPS_CACHE_PREFIX) && key.includes(`:${viewer}:`)) ||
    key === `native-chats:groups-explore-cache:v1:${viewer}` ||
    key.startsWith(`native-chats:groupSnapshot:v2:${viewer}:`)
  )).map(async (key) => {
    try {
      const raw = await readNativeDisplayCacheItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { cachedAt?: number; value?: unknown };
      if (!parsed || typeof parsed !== "object") return;
      if (key === `native-chats:groups-explore-cache:v1:${viewer}` || key.startsWith(`native-chats:groups-explore-cache:v2:${viewer}:`)) {
        const value = parsed.value as { invited?: NativeExploreGroup[]; groups?: NativeExploreGroup[] } | null;
        const groups = Array.isArray(value?.groups) ? value.groups : [];
        const nextGroups = groups.some((group) => group.id === chatId)
          ? groups.map((group) => group.id === chatId ? { ...group, ...patch } : group)
          : insertGroup ? [{ ...insertGroup, ...patch }, ...groups] : groups;
        await AsyncStorage.setItem(key, JSON.stringify({
          cachedAt: Date.now(),
          value: {
            invited: Array.isArray(value?.invited) ? value.invited.map((group) => group.id === chatId ? { ...group, ...patch } : group) : [],
            groups: nextGroups,
          },
        }));
        return;
      }
      if (key.endsWith(`:${chatId}`)) {
        await AsyncStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value: { ...(parsed.value as object || {}), ...patch } }));
      }
    } catch {
      // Cache patching is best-effort; the next DB refresh remains authoritative.
    }
  }));
};

type NativeChatsInboxMirrorEnvelope = {
  userId: string;
  sessionKey: string;
  surface: string;
  cachedAt: number;
  dbConfirmedAt: number;
  source: "db" | "realtime";
  rows: {
    hasMoreRows: boolean;
    rowCursor: string | null;
    rows: NativeChatInboxRow[];
  };
};

const readChatsInboxMirrorCache = async (key: string, options: { sessionKey: string; surface: string; userId: string }) => {
  const envelope = await readChatsCache<NativeChatsInboxMirrorEnvelope>(key);
  if (
    !envelope ||
    envelope.userId !== options.userId ||
    envelope.sessionKey !== options.sessionKey ||
    envelope.surface !== options.surface ||
    typeof envelope.dbConfirmedAt !== "number" ||
    (envelope.source !== "db" && envelope.source !== "realtime") ||
    !Array.isArray(envelope.rows?.rows)
  ) return null;
  return envelope.rows;
};

const writeChatsInboxMirrorCache = async (key: string, value: NativeChatsInboxMirrorEnvelope["rows"], options: { dbConfirmedAt: number; sessionKey: string; surface: string; userId: string }) => (
  writeChatsCache<NativeChatsInboxMirrorEnvelope>(key, {
    userId: options.userId,
    sessionKey: options.sessionKey,
    surface: options.surface,
    cachedAt: Date.now(),
    dbConfirmedAt: options.dbConfirmedAt,
    source: "db",
    rows: value,
  })
);

const FILTER_ROWS: Array<{ key: keyof NativeChatDiscoveryFilters; label: string; tier: FilterTier }> = [
  { key: "ageMin", label: "Age Range", tier: "free" },
  { key: "genders", label: "Gender", tier: "free" },
  { key: "maxDistanceKm", label: "Distance", tier: "free" },
  { key: "species", label: "Species", tier: "free" },
  { key: "socialRoles", label: "Community Role", tier: "free" },
  { key: "heightMin", label: "Height Range", tier: "plus" },
  { key: "orientations", label: "Sexual Orientation", tier: "plus" },
  { key: "degrees", label: "Highest Degree", tier: "plus" },
  { key: "relationshipStatuses", label: "Relationship Status", tier: "plus" },
  { key: "hasCar", label: "Car Badge", tier: "plus" },
  { key: "experienceYearsMin", label: "Pet Experience", tier: "plus" },
  { key: "languages", label: "Language", tier: "plus" },
  { key: "verifiedOnly", label: "Verified Users Only", tier: "gold" },
  { key: "whoWavedAtMe", label: "Who waved at you", tier: "gold" },
  { key: "activeOnly", label: "Active Users only", tier: "gold" },
];

const FILTER_GROUPS: Array<{ title: string; tier: FilterTier; rows: typeof FILTER_ROWS }> = [
  { title: "Basic", tier: "free", rows: FILTER_ROWS.filter((row) => row.tier === "free") },
  { title: "huddle+", tier: "plus", rows: FILTER_ROWS.filter((row) => row.tier === "plus") },
  { title: "huddle＊", tier: "gold", rows: FILTER_ROWS.filter((row) => row.tier === "gold") },
];

const SPECIES_CHIP_EMOJI: Record<string, string> = {
  All: "🐾", Dogs: "🐕", Cats: "🐈", Birds: "🦜", Fish: "🐟",
  Reptiles: "🦎", "Small Mammals": "🐹", "Farm Animals": "🐄", Others: "🐾", None: "🐾",
};
const SPRING_CFG = { damping: 14, stiffness: 280, mass: 0.6 } as const;
const SPRING_CFG_LAST = { damping: 28, stiffness: 340, mass: 0.6 } as const;

const DEFAULT_FILTERS: NativeChatDiscoveryFilters = {
  ageMin: 16,
  ageMax: 99,
  genders: [...ALL_GENDERS],
  maxDistanceKm: DISCOVERY_MAX_RADIUS_KM,
  species: [...ALL_SPECIES],
  socialRoles: [...ALL_SOCIAL_ROLES],
  heightMin: 100,
  heightMax: DISCOVERY_HEIGHT_MAX_CM,
  orientations: [...ALL_ORIENTATIONS],
  degrees: [...ALL_DEGREES],
  relationshipStatuses: [...ALL_RELATIONSHIP_STATUSES],
  hasCar: false,
  experienceYearsMin: 0,
  experienceYearsMax: 99,
  languages: [...ALL_LANGUAGES],
  verifiedOnly: false,
  whoWavedAtMe: false,
  activeOnly: false,
};

const parseInitialMainTab = (search?: string): Exclude<NativeChatsTab, "discover"> => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const tab = params.get("tab");
  if (tab === "groups") return "groups";
  if (tab === "service") return "service";
  return "friends";
};

const parseInitialTopTab = (search?: string): NativeChatsTopTab => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const tab = params.get("tab");
  if (tab === "community") return "community";
  if (tab === "friends" || tab === "groups" || tab === "service") return "chats";
  return "discover";
};

const parseInitialGroupDetailId = (search?: string) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return String(params.get("detail") || params.get("group") || "").trim() || null;
};

const parseInitialServiceRoomId = (search?: string) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (params.get("tab") !== "service") return null;
  return String(params.get("room") || params.get("serviceRoom") || "").trim() || null;
};

const parseInitialJoinCode = (search?: string) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (params.get("tab") !== "groups") return null;
  const code = String(params.get("joinCode") || "").trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
};

const scopeForTab = (tab: Exclude<NativeChatsTab, "discover">): NativeChatInboxScope => {
  if (tab === "groups") return "groups";
  if (tab === "service") return "service";
  return "friends";
};

const compactTime = (value: string | null) => {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

// Honest "last event" label for group cards: the most recent PAST event reads
// as "Xh"/"Xd ago", the 6-7 day edge reads as "last week", and anything older
// than a week — or a group with no events at all — is hidden entirely rather
// than showing a stale or meaningless date.
const groupCardLastEventLabel = (events: NativeGroupChatEvent[] | null) => {
  if (!events || events.length === 0) return null;
  const now = Date.now();
  let mostRecentPastMs: number | null = null;
  for (const event of events) {
    const startsMs = new Date(event.startsAt).getTime();
    if (!Number.isFinite(startsMs) || startsMs > now) continue;
    if (mostRecentPastMs === null || startsMs > mostRecentPastMs) mostRecentPastMs = startsMs;
  }
  if (mostRecentPastMs === null) return null;
  const hours = (now - mostRecentPastMs) / 3_600_000;
  if (hours >= 168) return null;
  if (hours >= 144) return "last week";
  return compactTime(new Date(mostRecentPastMs).toISOString());
};

const displayName = (row: NativeChatInboxRow) => {
  if (row.roomType === "group") return row.chatName || "Group chat";
  if (row.roomType === "service") return row.peerName || row.chatName || "Care chat";
  return row.peerName || row.chatName || "Conversation";
};

const discoveryProfileToPublicProfileFallback = (profile: NativeChatDiscoveryProfile): ProfileSheetFallbackData => ({
  id: profile.id,
  display_name: profile.displayName,
  avatar_url: profile.avatarUrl,
  bio: profile.bio,
  gender_genre: profile.gender,
  height: profile.height,
  school: profile.school,
  major: profile.major,
  location_name: profile.locationName,
  is_verified: profile.isVerified,
  has_car: profile.hasCar,
  user_role: profile.socialRole,
  pet_experience: profile.petExperience,
  pet_experience_years: profile.petExperienceYears,
  relationship_status: profile.relationshipStatus,
  availability_status: profile.socialRoles,
  created_at: profile.createdAt,
  updated_at: profile.updatedAt,
  last_active_at: profile.lastActiveAt,
  effective_tier: profile.tier,
  tier: profile.tier,
  social_album: profile.socialAlbum,
  pet_heads: profile.pets.map((pet, index) => ({
    id: `${profile.id}:discover-pet:${index}`,
    name: pet.name,
    species: pet.species,
    is_active: true,
    is_public: true,
  })),
});

const isTeamHuddleRow = (row: NativeChatInboxRow) => (
  row.peerUserId === TEAM_HUDDLE_USER_ID || isNativeTeamHuddleIdentity(displayName(row), row.peerSocialId)
);

const isCareInboxRow = (row: NativeChatInboxRow) => row.roomType === "service";

const hasVisibleRowsForInboxTab = (tab: Exclude<NativeChatsTab, "discover">, sourceRows: NativeChatInboxRow[]) => {
  if (tab === "groups") return sourceRows.some((row) => row.roomType === "group");
  if (tab === "service") return sourceRows.some(isCareInboxRow);
  return sourceRows.some((row) => row.roomType !== "group" && !isCareInboxRow(row));
};

const appendReturnTo = (path: string, returnTo: string) => `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;

const carePreviewForKind = (kind: string, row?: NativeChatInboxRow, userId?: string | null, payload?: Record<string, unknown>) => {
  const normalized = kind.trim();
  const actorName = row?.lastMessageSenderId === userId ? "You" : displayName(row || {} as NativeChatInboxRow);
  const startedTime = row?.lastMessageAt ? new Date(row.lastMessageAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  if (normalized === "service_request_sent") {
    // The event author is available in the first inbox payload; the service row can
    // briefly still be resolving after the request is sent.
    return row?.lastMessageSenderId === userId
      ? "Your booking request has been sent."
      : "You have received a booking request.";
  }
  if (normalized === "service_request_updated" || normalized === "service_quote_sent") return `Care Scope has been updated by ${actorName}.`;
  if (normalized === "service_request_withdrawn") return "Request withdrawn";
  if (normalized === "service_booking_cancelled" || normalized === "voluntary_booking_cancelled") {
    const policy = String(payload?.policy || "").toLowerCase();
    return /lte_24h/.test(policy)
      ? `${actorName} cancelled close to the booking. huddle is reviewing this cancellation.`
      : `${actorName} cancelled the booking.`;
  }
  if (normalized === "service_booked") return "All set! Your care session is locked in.";
  if (normalized === "service_pin_shared") return row?.serviceRequesterId === userId ? "You Start PIN is sent." : "You've received the Start PIN.";
  if (normalized === "service_check_in" || normalized === "service_in_progress") return `Care session started${startedTime ? ` at ${startedTime}` : ""}.`;
  if (normalized === "service_completed") return "The care session is now complete.";
  if (normalized === "service_dispute_resolved") return "Review completed. This booking is now closed.";
  if (normalized === "service_disputed" || normalized === "service_issue_reported") return "Issue flagged. Our team is looking into this.";
  return "";
};

const parseInboxPreview = (content: string | null, row?: NativeChatInboxRow, userId?: string | null) => {
  const text = String(content || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const kind = String(parsed.kind || parsed.type || "").trim();
    if (kind === "star_intro") return String(parsed.text || "Sent a Star to connect.").trim();
    if (kind === "huddle_share") {
      const share = parsed.share && typeof parsed.share === "object" ? parsed.share as Record<string, unknown> : {};
      return String(share.chatHeadline || share.title || "Shared from huddle").trim();
    }
    if (kind === "service_care_update") {
      const note = String(parsed.note || parsed.text || "").trim();
      if (note) return note;
      return parsed.photo || String(parsed.photoUrl || "").trim() ? "Shared a photo update" : "Shared a care update";
    }
    const carePreview = carePreviewForKind(kind, row, userId, parsed);
    if (carePreview) return carePreview;
    const messageText = String(parsed.text || "").trim();
    if (messageText) return messageText;
    const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    if (attachments.length > 0) return attachments.some((item) => String((item as Record<string, unknown>)?.mime || "").startsWith("image/")) ? "Photo" : "Attachment";
    return messageText || "";
  } catch {
    return text.replace(/\s+/g, " ");
  }
};

const serviceStatusPreview = (row: NativeChatInboxRow, userId: string | null) => {
  if (row.roomType !== "service") return "";
  const serviceContent = row.lastMessageContent ? parseInboxPreview(row.lastMessageContent, row, userId) : "";
  if (serviceContent) return serviceContent;
  if (row.serviceStatus === "completed") {
    return row.serviceRequesterId === userId
      ? "The booking is completed. Please leave a review."
      : "The booking is completed.";
  }
  if (row.serviceRequestCard) {
    return "Care Scope has been updated.";
  }
  return row.serviceStatus || "Care request";
};

const serviceStatusBadge = (status: string | null) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "booked") return { label: "Booked", style: styles.serviceStatusBadgeBlue, textStyle: styles.serviceStatusBadgeTextBlue };
  if (normalized === "in_progress") return { label: "Care in progress", style: styles.serviceStatusBadgeBlue, textStyle: styles.serviceStatusBadgeTextBlue };
  if (normalized === "completed") return { label: "Completed", style: styles.serviceStatusBadgeGreen, textStyle: styles.serviceStatusBadgeTextGreen };
  if (normalized === "disputed") return { label: "Disputed", style: styles.serviceStatusBadgeRed, textStyle: styles.serviceStatusBadgeTextRed };
  return null;
};

const displaySubtitle = (row: NativeChatInboxRow, userId: string | null) => {
  if (row.blockedByMe) return "Blocked";
  if (row.blockedByThem) return "Unavailable";
  if (row.unmatchedByMe || row.unmatchedByThem) return "Unmatched";
  const text = String(row.lastMessageContent || "").trim();
  if (row.roomType === "service") {
    const statusText = serviceStatusPreview(row, userId);
    if (text) return parseInboxPreview(text, row, userId) || statusText || "Care request";
    return statusText || "Care request";
  }
  if (text) return parseInboxPreview(text);
  if (!text) {
    if (row.roomType === "group") return row.memberCount > 0 ? `${row.memberCount} members` : "Group chat";
    return row.peerAvailabilityLabel || "Say hi";
  }
  return "";
};

const serviceSkillsLabel = (row: NativeChatInboxRow) => {
  if (row.serviceProviderId && row.peerUserId === row.serviceProviderId) return "Pet Carer";
  if (row.serviceRequesterId && row.peerUserId === row.serviceRequesterId) return "Pet Owner";
  const skills = Array.isArray(row.serviceProviderSkills) ? row.serviceProviderSkills.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (skills.length > 0) return skills.slice(0, 3).join(" / ");
  return "Pet Owner";
};

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "H";

function ResilientAvatarImage({
  fallback,
  resizeMode = "cover",
  style,
  uri,
  version,
}: {
  fallback: ReactNode;
  resizeMode?: "cover" | "contain";
  style: StyleProp<ImageStyle>;
  uri: string | null | undefined;
  version?: string | null;
}) {
  const resolved = useMemo(() => resolveNativeAvatarUrl(uri), [uri]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolved]);
  if (!resolved || failed) return <>{fallback}</>;
  const imageVersion = version || resolved;
  return (
    <ExpoImage
      accessibilityIgnoresInvertColors
      cachePolicy="memory-disk"
      contentFit={resizeMode}
      key={nativeFreshImageKey(resolved, imageVersion)}
      onError={() => setFailed(true)}
      source={{ uri: nativeFreshImageUri(resolved, imageVersion) }}
      style={style}
      transition={120}
    />
  );
}

function NativeUserAvatar({
  avatarUrl,
  isVerified,
  isTeamHuddle = false,
  name,
  size,
  version,
}: {
  avatarUrl: string | null;
  isVerified: boolean;
  isTeamHuddle?: boolean;
  name: string;
  size: "md" | "lg";
  version?: string | null;
}) {
  const frameStyle = size === "lg" ? styles.userAvatarLg : styles.userAvatarMd;
  const imageStyle = size === "lg" ? styles.userAvatarImageLg : styles.userAvatarImageMd;
  const verifiedBadgeStyle = size === "lg" ? styles.userAvatarVerifiedBadgeLg : styles.userAvatarVerifiedBadgeMd;
  return (
    <View style={[frameStyle, isVerified ? styles.userAvatarVerified : null]}>
      <ResilientAvatarImage
        fallback={<Image accessibilityLabel={name || "User"} resizeMode={isTeamHuddle ? "contain" : "cover"} source={isTeamHuddle ? teamHuddleLogo : profilePlaceholder} style={imageStyle} />}
        resizeMode={isTeamHuddle ? "contain" : "cover"}
        style={imageStyle}
        uri={isTeamHuddle ? null : avatarUrl}
        version={version}
      />
      {isVerified ? <View style={verifiedBadgeStyle}><NativeVerifiedBadge compact variant="avatar" /></View> : null}
    </View>
  );
}

function VerifiedMemberAvatar({ avatarUrl, isVerified, name, version }: { avatarUrl: string | null; isVerified: boolean; name: string; version?: string | null }) {
  return (
    <View style={[styles.memberAvatarFrame, isVerified ? styles.memberAvatarFrameVerified : null]}>
      <ResilientAvatarImage fallback={<Text style={styles.memberAvatarInitial}>{initials(name)}</Text>} style={styles.memberAvatarImage} uri={avatarUrl} version={version} />
      {isVerified ? <View style={styles.memberVerifiedBadge}><NativeVerifiedBadge compact variant="avatar" /></View> : null}
    </View>
  );
}

const groupMemberRoleLabel = (role: string | null | undefined) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "creator" || normalized === "owner" ? "admin" : "member";
};

const groupMemberRoleFor = (group: NativeExploreGroup | NativeChatInboxRow, member: NativeGroupManagementSnapshot["members"][number], index?: number) => (
  groupMemberRoleLabel(
    ("createdBy" in group && group.createdBy === member.userId)
      ? "admin"
      : member.role || (index === 0 && ("memberCount" in group ? group.memberCount : 0) > 0 ? "admin" : null),
  )
);

const sortGroupMembers = (members: NativeGroupManagementSnapshot["members"], group: NativeExploreGroup | NativeChatInboxRow, currentUserId: string | null) => {
  const roleRank = (member: NativeGroupManagementSnapshot["members"][number]) => groupMemberRoleFor(group, member) === "admin" ? 0 : 1;
  return [...members].sort((a, b) => {
    const adminDelta = roleRank(a) - roleRank(b);
    if (adminDelta !== 0) return adminDelta;
    if (a.userId === currentUserId && b.userId !== currentUserId) return -1;
    if (b.userId === currentUserId && a.userId !== currentUserId) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
};

const petLine = (profile: NativeChatDiscoveryProfile) => {
  if (profile.socialRoles.length > 0) return profile.socialRoles.join(" · ");
  const namedPets = profile.pets
    .map((pet) => [pet.name, pet.species].filter(Boolean).join(" the "))
    .filter(Boolean);
  if (namedPets.length > 0) return namedPets.slice(0, 2).join(" · ");
  if (profile.petSpecies.length > 0) return profile.petSpecies.slice(0, 3).join(" · ");
  if (/^animal friend\s*\(no pet\)$/i.test(profile.socialRole || "")) return "Animal Friend";
  return profile.socialRole || "Pet people nearby";
};

const formatDiscoverySpecies = (value?: string | null) => {
  const clean = String(value || "").trim();
  if (!clean) return "Pet";
  return clean
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const discoveryProfileFacts = (profile: NativeChatDiscoveryProfile) => {
  const species = profile.petSpecies.map(formatDiscoverySpecies).filter(Boolean);
  const experience = profile.petExperience.map((item) => String(item || "").trim()).filter(Boolean);
  const years = profile.petExperienceYears && profile.petExperienceYears > 0
    ? `${profile.petExperienceYears} ${profile.petExperienceYears === 1 ? "year" : "years"} experience`
    : "";
  return [years, ...species.slice(0, 3), ...experience.slice(0, 2)]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4);
};

const discoveryPackEmojiItems = (profile: NativeChatDiscoveryProfile, pets: NativeChatDiscoveryProfile["pets"]) => {
  const speciesSource = pets.length > 0
    ? pets.map((pet) => pet.species || "").filter(Boolean)
    : [
      ...profile.petSpecies,
      ...profile.petExperience.map((item) => String(item || "").split(/[•·]/)[0] || ""),
    ];
  return speciesSource
    .map(formatDiscoverySpecies)
    .map(nativePetSpeciesEmojiOrText)
    .filter(Boolean)
    .filter((value, valueIndex, values) => values.indexOf(value) === valueIndex);
};

const filterOptionsForKey = (key: keyof NativeChatDiscoveryFilters) => {
  if (key === "genders") return ALL_GENDERS;
  if (key === "species") return ALL_SPECIES;
  if (key === "socialRoles") return ALL_SOCIAL_ROLES;
  if (key === "orientations") return ALL_ORIENTATIONS;
  if (key === "degrees") return ALL_DEGREES;
  if (key === "relationshipStatuses") return ALL_RELATIONSHIP_STATUSES;
  if (key === "languages") return ALL_LANGUAGES;
  return null;
};

const formatSelectedSummary = (selected: string[], options: string[]) => {
  const validSelected = selected.filter((item) => options.includes(item));
  if (validSelected.length === 0) return "None";
  if (validSelected.length === options.length) return "All";
  return validSelected.length > 2 ? `${validSelected.slice(0, 2).join(", ")}...` : validSelected.join(", ");
};

const filterSummary = (filters: NativeChatDiscoveryFilters, key: keyof NativeChatDiscoveryFilters) => {
  if (key === "ageMin") return `${filters.ageMin}-${filters.ageMax}`;
  if (key === "maxDistanceKm") return `${filters.maxDistanceKm} km`;
  if (key === "heightMin") return `${filters.heightMin}-${filters.heightMax} cm`;
  if (key === "experienceYearsMin") return `${filters.experienceYearsMin}-${filters.experienceYearsMax} years`;
  const value = filters[key];
  const options = filterOptionsForKey(key);
  if (Array.isArray(value) && options) return formatSelectedSummary(value, options);
  return value ? "Y" : "N";
};

const isToggleFilterKey = (key: keyof NativeChatDiscoveryFilters) => (
  key === "hasCar" || key === "verifiedOnly" || key === "whoWavedAtMe" || key === "activeOnly"
);

const sanitizeDiscoveryFilters = (input: Partial<NativeChatDiscoveryFilters>): NativeChatDiscoveryFilters => {
  const next = { ...DEFAULT_FILTERS, ...input };
  const hasOwn = (key: keyof NativeChatDiscoveryFilters) => Object.prototype.hasOwnProperty.call(input, key);
  const cleanArray = (key: keyof NativeChatDiscoveryFilters, options: string[]) => {
    const value = input[key];
    if (!hasOwn(key) || !Array.isArray(value)) return DEFAULT_FILTERS[key] as string[];
    const cleaned = value.filter((item) => options.includes(String(item)));
    return cleaned;
  };
  next.genders = cleanArray("genders", ALL_GENDERS);
  next.species = cleanArray("species", ALL_SPECIES);
  next.socialRoles = cleanArray("socialRoles", ALL_SOCIAL_ROLES);
  next.orientations = cleanArray("orientations", ALL_ORIENTATIONS);
  next.degrees = cleanArray("degrees", ALL_DEGREES);
  next.relationshipStatuses = cleanArray("relationshipStatuses", ALL_RELATIONSHIP_STATUSES);
  next.languages = cleanArray("languages", ALL_LANGUAGES);
  next.ageMin = Math.max(16, Math.min(99, Number(input.ageMin ?? DEFAULT_FILTERS.ageMin) || DEFAULT_FILTERS.ageMin));
  next.ageMax = Math.max(next.ageMin, Math.min(99, Number(input.ageMax ?? DEFAULT_FILTERS.ageMax) || DEFAULT_FILTERS.ageMax));
  next.maxDistanceKm = Math.max(0, Math.min(DISCOVERY_MAX_RADIUS_KM, Number(input.maxDistanceKm ?? DEFAULT_FILTERS.maxDistanceKm) || DEFAULT_FILTERS.maxDistanceKm));
  next.heightMin = Math.max(100, Math.min(DISCOVERY_HEIGHT_MAX_CM, Number(input.heightMin ?? DEFAULT_FILTERS.heightMin) || DEFAULT_FILTERS.heightMin));
  next.heightMax = Math.max(next.heightMin, Math.min(DISCOVERY_HEIGHT_MAX_CM, Number(input.heightMax ?? DEFAULT_FILTERS.heightMax) || DEFAULT_FILTERS.heightMax));
  next.experienceYearsMin = Math.max(0, Math.min(99, Number(input.experienceYearsMin ?? DEFAULT_FILTERS.experienceYearsMin) || DEFAULT_FILTERS.experienceYearsMin));
  next.experienceYearsMax = Math.max(next.experienceYearsMin, Math.min(99, Number(input.experienceYearsMax ?? DEFAULT_FILTERS.experienceYearsMax) || DEFAULT_FILTERS.experienceYearsMax));
  next.hasCar = Boolean(input.hasCar);
  next.verifiedOnly = Boolean(input.verifiedOnly);
  next.whoWavedAtMe = Boolean(input.whoWavedAtMe);
  next.activeOnly = Boolean(input.activeOnly);
  return next;
};

const normalizeTier = (value: unknown): "free" | "plus" | "gold" => {
  const tier = String(value || "free").trim().toLowerCase();
  if (tier.includes("gold")) return "gold";
  if (tier.includes("plus") || tier.includes("premium")) return "plus";
  return "free";
};

const discoveryTierLabel = (value: unknown) => {
  const tier = normalizeTier(value);
  if (tier === "gold") return "huddle＊";
  if (tier === "plus") return "huddle+";
  return null;
};

const DISCOVERY_ISLAND_HEIGHT = 72;
// New layout: deepest queued card peeks 20 px below top card, then 8 px tight gap, then the action island.
const DISCOVERY_QUEUED_PEEK_DEPTH = 20;
const DISCOVERY_DECK_TO_ISLAND_GAP = 8;
const DISCOVERY_STACK_AFTER_CARD = DISCOVERY_QUEUED_PEEK_DEPTH + DISCOVERY_DECK_TO_ISLAND_GAP + DISCOVERY_ISLAND_HEIGHT;
const DISCOVERY_NAV_MIN_GAP = 24;
const DISCOVERY_CHROME_RESERVE = 224;
const DISCOVERY_NAV_TIGHT_GAP = 2;
const DISCOVERY_BIO_FULL_HEIGHT = 92;
const DISCOVERY_BIO_COMPACT_HEIGHT = 74;
const DISCOVERY_BIO_SINGLE_HEIGHT = 56;

const DISCOVERY_DECK_REFERENCE_WIDTH = 360;
const DISCOVERY_QUEUED_SIDE_GAP_1 = (DISCOVERY_DECK_REFERENCE_WIDTH * (1 - 0.92)) / 2;
const DISCOVERY_QUEUED_SIDE_GAP_2 = (DISCOVERY_DECK_REFERENCE_WIDTH * (1 - 0.78)) / 2;
const DISCOVERY_QUEUED_SIDE_GAP_3 = (DISCOVERY_DECK_REFERENCE_WIDTH * (1 - 0.70)) / 2;
const DISCOVERY_PROFILE_CARD_BORDER_WIDTH = 1;
type DiscoveryBioMode = "full" | "compact" | "single" | "hidden";
const discoveryCardMetrics = (viewportWidth: number, viewportHeight: number, bottomInset: number, stackTopY: number | null) => {
  const cardWidth = Math.max(280, Math.min(viewportWidth - (viewportWidth <= 390 ? huddleSpacing.x5 : huddleSpacing.x6), 360));
  const navBottomOffset = Math.max(huddleSpacing.x2, bottomInset + 8);
  const navTopY = viewportHeight - navBottomOffset - huddleLayout.navHeight;
  const measuredStackSlot = stackTopY == null
    ? viewportHeight - DISCOVERY_CHROME_RESERVE - huddleLayout.navHeight - bottomInset - DISCOVERY_NAV_TIGHT_GAP
    : navTopY - stackTopY - DISCOVERY_NAV_TIGHT_GAP;
  const maxCardHeight = Math.max(0, measuredStackSlot - DISCOVERY_QUEUED_PEEK_DEPTH);
  const desiredPhotoHeight = cardWidth * 1.25;
  let bioMode: DiscoveryBioMode = "hidden";
  let bioPanelHeight = 0;
  if (maxCardHeight >= desiredPhotoHeight + DISCOVERY_BIO_FULL_HEIGHT) {
    bioMode = "full";
    bioPanelHeight = DISCOVERY_BIO_FULL_HEIGHT;
  } else if (maxCardHeight >= desiredPhotoHeight + DISCOVERY_BIO_COMPACT_HEIGHT) {
    bioMode = "compact";
    bioPanelHeight = DISCOVERY_BIO_COMPACT_HEIGHT;
  } else if (maxCardHeight >= desiredPhotoHeight + DISCOVERY_BIO_SINGLE_HEIGHT) {
    bioMode = "single";
    bioPanelHeight = DISCOVERY_BIO_SINGLE_HEIGHT;
  }
  const cardHeight = bioMode === "hidden"
    ? maxCardHeight
    : Math.min(maxCardHeight, desiredPhotoHeight + bioPanelHeight);
  return {
    bioMode,
    bioPanelHeight,
    cardHeight,
    cardWidth,
    maxCardHeight,
    photoHeight: cardHeight - bioPanelHeight,
  };
};
const discoveryQueuedSideGap = (index: number) => {
  if (index === 1) return DISCOVERY_QUEUED_SIDE_GAP_1;
  if (index === 2) return DISCOVERY_QUEUED_SIDE_GAP_2;
  return DISCOVERY_QUEUED_SIDE_GAP_3;
};
const discoveryQueuedScaleX = (index: number, cardWidth: number) => Math.max(0.7, (cardWidth - discoveryQueuedSideGap(index) * 2) / cardWidth);
// The settled navy wash is painted inside the prepared card's 1px frame.
// Static layer 2 must end at this painted width—not at 92% of the outer box—
// so the reset swaps equal visible bounds.
const discoverySettledNavyScaleX = (cardWidth: number) => {
  const preparedOuterScale = discoveryQueuedScaleX(1, cardWidth);
  const preparedInnerRatio = Math.max(0, cardWidth - DISCOVERY_PROFILE_CARD_BORDER_WIDTH * 2) / cardWidth;
  return preparedOuterScale * preparedInnerRatio;
};
const discoveryQueuedTranslateY = (index: number) => index === 1 ? 0 : index === 2 ? 6 : 12;
const discoveryQueuedScrimColor = (index: number) => index === 1
  ? "rgba(17,37,126,0.84)"
  : index === 2
    ? "rgba(75,137,255,0.60)"
    : "rgba(255,255,255,0.80)";

const isFilterLocked = (rowTier: FilterTier, userTier: "free" | "plus" | "gold") => (
  rowTier === "plus" && userTier === "free" || rowTier === "gold" && userTier !== "gold"
);

const isAvatarOnlyMatch = (row: NativeChatInboxRow) => (
  row.roomType !== "group" &&
  row.roomType !== "service" &&
  Boolean(row.peerUserId) &&
  !row.blockedByMe &&
  !row.blockedByThem &&
  !row.unmatchedByMe &&
  !row.unmatchedByThem &&
  !["inactive", "closed", "archived", "deleted"].includes(String((row as unknown as Record<string, unknown>).status || "").toLowerCase()) &&
  !(row as unknown as Record<string, unknown>).closed_at &&
  (row as unknown as Record<string, unknown>).is_active !== false &&
  Boolean(row.matchedAt) &&
  !row.lastMessageAt &&
  !String(row.lastMessageContent || "").trim()
);

const isMatchedRailRow = (row: NativeChatInboxRow, activeMatchedPeerIds: Set<string>) => (
  isAvatarOnlyMatch(row) || (
    row.roomType !== "group" &&
    row.roomType !== "service" &&
    Boolean(row.peerUserId) &&
    !row.blockedByMe &&
    !row.blockedByThem &&
    !row.unmatchedByMe &&
    !row.unmatchedByThem &&
    !row.lastMessageAt &&
    !String(row.lastMessageContent || "").trim() &&
    activeMatchedPeerIds.has(String(row.peerUserId || ""))
  )
);

const hasActiveTransaction = (row: NativeChatInboxRow) => (
  row.roomType === "service" && Boolean(row.serviceStatus && !["cancelled", "completed", "declined", "expired"].includes(row.serviceStatus))
);

const isStarIntroContent = (content: string | null) => {
  const raw = String(content || "").trim();
  if (!raw.includes("star")) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const kind = String(parsed.kind || parsed.type || "").toLowerCase();
    return kind.includes("star");
  } catch {
    return raw.toLowerCase().includes("star connection");
  }
};

const chatRowActivityValue = (row: NativeChatInboxRow) => {
  const last = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : 0;
  const activity = row.activityTs ? new Date(row.activityTs).getTime() : 0;
  const matched = row.matchedAt ? new Date(row.matchedAt).getTime() : 0;
  return Math.max(
    Number.isFinite(last) ? last : 0,
    Number.isFinite(activity) ? activity : 0,
    Number.isFinite(matched) ? matched : 0,
  );
};

const groupActivityValue = (group: NativeExploreGroup) => {
  const last = group.lastMessageAt ? new Date(group.lastMessageAt).getTime() : 0;
  const created = group.createdAt ? new Date(group.createdAt).getTime() : 0;
  return Math.max(Number.isFinite(last) ? last : 0, Number.isFinite(created) ? created : 0);
};

// Picks the event the countdown badge should describe: an event currently in
// progress wins outright (any of them — "Event now" reads the same either
// way); otherwise the soonest future event. Already-ended events are ignored.
// Array order from the RPC is not guaranteed, so this can't just take [0].
const pickActiveOrNextGroupEvent = (events: NativeGroupChatEvent[], nowMs = Date.now()): NativeGroupChatEvent | null => {
  let best: NativeGroupChatEvent | null = null;
  let bestStarts = Infinity;
  for (const event of events) {
    const starts = new Date(event.startsAt).getTime();
    const ends = event.endsAt ? new Date(event.endsAt).getTime() : NaN;
    if (!Number.isFinite(starts) || starts <= 0) continue;
    const hasEnded = Number.isFinite(ends) && ends > 0 && ends <= nowMs;
    if (hasEnded) continue;
    const inProgress = starts <= nowMs;
    if (inProgress) return event; // currently happening — show immediately
    if (starts < bestStarts) {
      bestStarts = starts;
      best = event;
    }
  }
  return best;
};

type GroupEventCountdown = { label: string; active: boolean };

// Human countdown, not odometer copy: "Event in 46 mins" under the hour,
// "Event in 2h 15m" under a day, "Event in 3 days" beyond. An event currently
// in progress reads "Event happening" (the badge adds the pulse + going count).
const groupNextEventCountdownLabel = (startsAt?: string | null, endsAt?: string | null, nowMs = Date.now()): GroupEventCountdown | null => {
  const starts = startsAt ? new Date(startsAt).getTime() : 0;
  const ends = endsAt ? new Date(endsAt).getTime() : 0;
  if (!Number.isFinite(starts) || starts <= 0) return null;
  if (Number.isFinite(ends) && ends > 0 && ends <= nowMs) return null;
  const diffMs = starts - nowMs;
  if (diffMs <= 0) return { label: "Event happening", active: true };
  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) return { label: `Event in ${totalMinutes} ${totalMinutes === 1 ? "min" : "mins"}`, active: false };
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return { label: minutes > 0 ? `Event in ${totalHours}h ${minutes}m` : `Event in ${totalHours}h`, active: false };
  }
  const days = Math.round(totalHours / 24);
  return { label: `Event in ${days} ${days === 1 ? "day" : "days"}`, active: false };
};

const groupImageVersion = (group: NativeExploreGroup | NativeChatInboxRow, fallback?: string | null) => {
  const row = group as NativeExploreGroup & NativeChatInboxRow & { updatedAt?: string | null };
  return row.updatedAt || row.activityTs || row.lastMessageAt || row.createdAt || row.id || row.chatId || fallback || null;
};

const normalizeGroupSignal = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

const groupPetRelevance = (group: NativeExploreGroup, viewerPets: NativeViewerPetSignal[]) => {
  if (!viewerPets.length || !group.petFocus.length) return 0;
  const focus = group.petFocus.map((item) => splitNativePetFocusLabel(item));
  let score = 0;
  for (const viewerPet of viewerPets) {
    const species = normalizeGroupSignal(viewerPet.species);
    const breed = normalizeGroupSignal(viewerPet.breed);
    for (const item of focus) {
      const itemSpecies = normalizeGroupSignal(item.species);
      const itemBreed = normalizeGroupSignal(item.breed);
      if (!itemSpecies || itemSpecies === "all") score = Math.max(score, 1);
      if (species && itemSpecies === species) score = Math.max(score, 20);
      if (breed && itemBreed && itemBreed === breed) score = Math.max(score, 40);
    }
  }
  return score;
};

const finiteGroupDistance = (group: NativeExploreGroup) => (
  typeof group.distanceKm === "number" && Number.isFinite(group.distanceKm) ? group.distanceKm : Number.POSITIVE_INFINITY
);

const groupLocationMatchScore = (group: NativeExploreGroup, viewerLocationWords: string[]) => {
  if (!viewerLocationWords.length) return 0;
  const words = String([group.locationDistrict, group.locationLabel].filter(Boolean).join(" "))
    .toLowerCase()
    .split(/[\s,./-]+/)
    .filter((word) => word.length > 2);
  return words.some((word) => viewerLocationWords.includes(word)) ? 10 : 0;
};

const sortExploreGroups = (
  groups: NativeExploreGroup[],
  sort: NativeGroupExploreSort,
  viewerPets: NativeViewerPetSignal[],
  viewerLocationWords: string[],
) => [...groups].sort((left, right) => {
  if (sort === "proximity") {
    const distanceDiff = finiteGroupDistance(left) - finiteGroupDistance(right);
    if (distanceDiff !== 0) return distanceDiff;
  } else if (sort === "latest") {
    const activityDiff = groupActivityValue(right) - groupActivityValue(left);
    if (activityDiff !== 0) return activityDiff;
  } else if (sort === "popularity") {
    if (right.memberCount !== left.memberCount) return right.memberCount - left.memberCount;
  } else {
    const relevanceDiff = (
      groupPetRelevance(right, viewerPets) + groupLocationMatchScore(right, viewerLocationWords)
    ) - (
      groupPetRelevance(left, viewerPets) + groupLocationMatchScore(left, viewerLocationWords)
    );
    if (relevanceDiff !== 0) return relevanceDiff;
    const distanceDiff = finiteGroupDistance(left) - finiteGroupDistance(right);
    if (distanceDiff !== 0) return distanceDiff;
  }
  if (right.memberCount !== left.memberCount) return right.memberCount - left.memberCount;
  return groupActivityValue(right) - groupActivityValue(left);
});

type GroupCoverNextEvent = { title?: string | null; startsAt?: string | null; endsAt?: string | null; rsvpCount?: number };

const nativeInboxGroupToExploreGroup = (row: NativeChatInboxRow, nextEvent?: GroupCoverNextEvent | null): NativeExploreGroup => ({
  id: row.chatId,
  inviteId: null,
  name: row.chatName || "Group",
  avatarUrl: row.avatarUrl,
  memberCount: row.memberCount,
  petFocus: row.petFocus,
  locationLabel: row.locationLabel,
  locationCountry: row.locationCountry,
  locationDistrict: null,
  joinMethod: row.joinMethod,
  description: row.description,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  lastMessageAt: row.lastMessageAt,
  visibility: row.visibility,
  roomCode: row.roomCode,
  invitePending: false,
  inviterName: null,
  requested: false,
  joined: true,
  nextEventTitle: nextEvent?.title ?? null,
  nextEventStartsAt: nextEvent?.startsAt ?? null,
  nextEventEndsAt: nextEvent?.endsAt ?? null,
});

const mergeExploreGroups = (joinedRows: NativeChatInboxRow[], groups: NativeExploreGroup[], joinedNextEventByChatId: Map<string, GroupCoverNextEvent> = new Map()) => {
  const byId = new Map<string, NativeExploreGroup>();
  joinedRows
    .filter((row) => row.roomType === "group" && row.visibility === "public")
    .map((row) => nativeInboxGroupToExploreGroup(row, joinedNextEventByChatId.get(row.chatId)))
    .forEach((group) => byId.set(group.id, group));
  groups.forEach((group) => {
    if (!byId.has(group.id)) byId.set(group.id, group);
  });
  return Array.from(byId.values());
};

const buildCreatedGroupInboxRow = (input: {
  avatarUrl: string | null;
  chatId: string;
  createdAt: string;
  createdBy: string;
  description: string | null;
  joinMethod: "instant" | "request";
  locationCountry: string | null;
  locationLabel: string | null;
  memberCount?: number;
  name: string;
  petFocus: string[];
  visibility: "public" | "private";
}): NativeChatInboxRow => ({
  activityTs: input.createdAt,
  avatarUrl: input.avatarUrl,
  blockedByMe: false,
  blockedByThem: false,
  chatId: input.chatId,
  chatName: input.name,
  createdAt: input.createdAt,
  createdBy: input.createdBy,
  description: input.description,
  joinMethod: input.joinMethod,
  lastMessageAt: input.createdAt,
  lastMessageContent: null,
  lastMessageId: null,
  lastMessageReadByOther: false,
  lastMessageSenderId: null,
  lastMessageSenderName: null,
  matchedAt: null,
  locationCountry: input.locationCountry,
  locationLabel: input.locationLabel,
  memberCount: Math.max(1, Math.floor(input.memberCount ?? 1)),
  unmatchedByMe: false,
  unmatchedByThem: false,
  petFocus: input.petFocus,
  peerAvatarUrl: null,
  peerAvailabilityLabel: null,
  peerHasCar: false,
  peerIsVerified: false,
  peerName: null,
  peerSocialId: null,
  peerUserId: null,
  roomCode: null,
  roomType: "group",
  serviceProviderId: null,
  serviceRequestCard: null,
  serviceRequesterId: null,
  serviceStatus: null,
  shapeIssue: null,
  unreadCount: 0,
  visibility: input.visibility,
});

const preferConversationRow = (current: NativeChatInboxRow | undefined, candidate: NativeChatInboxRow) => {
  if (!current) return candidate;
  const currentHasMessage = Boolean(current.lastMessageAt) || Boolean(String(current.lastMessageContent || "").trim());
  const candidateHasMessage = Boolean(candidate.lastMessageAt) || Boolean(String(candidate.lastMessageContent || "").trim());
  if (candidateHasMessage !== currentHasMessage) return candidateHasMessage ? candidate : current;
  if (candidate.unreadCount !== current.unreadCount) return candidate.unreadCount > current.unreadCount ? candidate : current;
  return chatRowActivityValue(candidate) > chatRowActivityValue(current) ? candidate : current;
};

const dedupeDirectRowsByPeer = (inputRows: NativeChatInboxRow[]) => {
  const directByPeer = new Map<string, NativeChatInboxRow>();
  const nonDirectRows: NativeChatInboxRow[] = [];
  inputRows.forEach((row) => {
    if (row.roomType === "group" || row.roomType === "service" || !row.peerUserId) {
      nonDirectRows.push(row);
      return;
    }
    const peerId = String(row.peerUserId);
    directByPeer.set(peerId, preferConversationRow(directByPeer.get(peerId), row));
  });
  return [...nonDirectRows, ...Array.from(directByPeer.values())]
    .sort((left, right) => chatRowActivityValue(right) - chatRowActivityValue(left));
};

const isPriorityStarRow = (row: NativeChatInboxRow, viewerId?: string | null) => (
  row.roomType !== "group" &&
  row.roomType !== "service" &&
  isStarIntroContent(row.lastMessageContent) &&
  row.lastMessageSenderId !== viewerId
);

const isLastMessageFromViewer = (row: NativeChatInboxRow, viewerId?: string | null) => (
  Boolean(viewerId && row.lastMessageSenderId && row.lastMessageSenderId === viewerId)
);

const hasReciprocalWave = async (viewerId: string, targetUserId: string, accessToken?: string | null) => {
  const { data, error } = await nativeExactTokenRpc<boolean>("has_native_reciprocal_wave", {
    p_target_user_id: targetUserId,
  }, accessToken);
  if (error) return false;
  return data === true;
};

const seenMatchesKey = (userId: string) => `huddle:discover:seen-matches:${userId}`;
const matchedDiscoveryKey = (userId: string) => `huddle:discover:matched:${userId}`;

const activeMs = (profile: NativeChatDiscoveryProfile) => new Date(profile.lastActiveAt || profile.updatedAt || profile.createdAt || 0).getTime();

const normalizeRelationshipStatus = (value: string | null) => {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  if (lower === "pna" || lower === "prefer not to say") return "";
  if (lower === "in relationship") return "In a relationship";
  if (lower === "open") return "Open relationship";
  if (lower === "in a relationship") return "In a relationship";
  if (lower === "open relationship") return "Open relationship";
  return ALL_RELATIONSHIP_STATUSES.find((item) => item.toLowerCase() === lower) || raw;
};

const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const applyDiscoveryFilters = (
  profiles: NativeChatDiscoveryProfile[],
  filters: NativeChatDiscoveryFilters,
  options?: { anchor?: { lat: number; lng: number } | null; viewerCountry?: string | null; relaxFreshness?: boolean },
) => profiles.filter((profile) => {
  if (profile.age !== null && (profile.age < filters.ageMin || profile.age > filters.ageMax)) return false;
  if (filters.verifiedOnly && !profile.isVerified) return false;
  if (filters.hasCar && !profile.hasCar) return false;
  if (filters.activeOnly && activeMs(profile) < Date.now() - 24 * 60 * 60 * 1000) return false;
  if (!options?.relaxFreshness && activeMs(profile) < Date.now() - 30 * 24 * 60 * 60 * 1000) return false;
  const genderFilterActive = filters.genders.length < ALL_GENDERS.length;
  const socialRoleFilterActive = filters.socialRoles.length < ALL_SOCIAL_ROLES.length;
  const relationshipFilterActive = filters.relationshipStatuses.length < ALL_RELATIONSHIP_STATUSES.length;
  if (genderFilterActive && (!profile.gender || !filters.genders.includes(profile.gender))) return false;
  if (socialRoleFilterActive && (!profile.socialRole || !filters.socialRoles.includes(profile.socialRole))) return false;
  if (relationshipFilterActive && !filters.relationshipStatuses.includes(normalizeRelationshipStatus(profile.relationshipStatus))) return false;
  const heightFilterActive = filters.heightMin > DEFAULT_FILTERS.heightMin || filters.heightMax < DEFAULT_FILTERS.heightMax;
  if (heightFilterActive && profile.height === null) return false;
  if (profile.height !== null && (profile.height < filters.heightMin || profile.height > filters.heightMax)) return false;
  const years = profile.petExperienceYears ?? 0;
  if (years < filters.experienceYearsMin || years > filters.experienceYearsMax) return false;
  const speciesFilterActive = filters.species.length < ALL_SPECIES.length;
  if (speciesFilterActive) {
    const species = new Set([...profile.petSpecies, ...profile.petExperience, ...profile.pets.map((pet) => pet.species || "")].filter(Boolean));
    const allowsNone = filters.species.includes("None");
    if (species.size === 0) return allowsNone;
    if (![...species].some((item) => filters.species.includes(item))) return false;
  }
  void options;
  return true;
});

// ── Custom pill icons ─────────────────────────────────────────────
// Discover: Fluent "people-search" (filled) — magnifier + person silhouette.
// Source: https://icon-sets.iconify.design/fluent/people-search-24-filled/

// Glass-tinted active segment for the Discover|Community|Chats pill rail.
// Always mounted inside every pill Pressable so the BlurView never cold-starts.
// visible=false → opacity:0 (invisible but still composited), preventing the
// "blur pops in" flicker on the first activation of each pill.
function TopSegmentGlassLayer({ visible }: { visible: boolean }) {
  return (
    <View pointerEvents="none" style={[topSegmentGlassStyles.clip, !visible && topSegmentGlassStyles.hidden]}>
      {CHAT_LIQUID_GLASS && ChatGlassViewComponent ? (
        <ChatGlassViewComponent
          glassEffectStyle="clear"
          isInteractive
          tintColor="rgba(33,69,207,0.72)"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <RNBlurView blurAmount={22} blurType="light" style={StyleSheet.absoluteFill} />
      )}
      <View style={topSegmentGlassStyles.tint} />
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.42)", "rgba(255, 255, 255, 0.04)"]}
        end={{ x: 0, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={topSegmentGlassStyles.highlight}
      />
      <View style={topSegmentGlassStyles.border} />
    </View>
  );
}
const topSegmentGlassStyles = StyleSheet.create({
  clip: { ...StyleSheet.absoluteFillObject, borderRadius: huddleRadii.pill, overflow: "hidden" },
  hidden: { opacity: 0 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(33, 69, 207, 0.88)" },
  // Top-edge highlight ≈ glass dome curvature.
  highlight: { position: "absolute", left: 0, right: 0, top: 0, height: "55%" },
  // Inner hairline border ≈ rim of polished glass.
  border: { ...StyleSheet.absoluteFillObject, borderRadius: huddleRadii.pill, borderWidth: 0.5, borderColor: "rgba(255, 255, 255, 0.46)" },
});

function ChatsToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      onDismiss();
    }, NATIVE_TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  return <NativeToast message={message} onDismiss={onDismiss} />;
}

function QueuedCardPrivacyLayer({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <RNBlurView blurAmount={22} blurType="light" style={StyleSheet.absoluteFill} />
      <View style={styles.discoveryQueuedPrivacyWash} />
    </View>
  );
}

type DiscoverLocationPermissionCoverProps = { canAskAgain: boolean; onPress: () => void };

function DiscoverLocationPermissionCover({ canAskAgain, onPress }: DiscoverLocationPermissionCoverProps) {
  return (
    <View accessibilityViewIsModal style={[styles.discoveryPausedCover, styles.discoveryLocationPermissionInCard]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <RNBlurView blurAmount={22} blurType="light" style={StyleSheet.absoluteFill} />
        <View style={styles.discoveryQueuedPrivacyWash} />
      </View>
      <View style={styles.discoveryPausedContent}>
        <Text style={styles.discoveryPausedTitle}>Discover your pet people</Text>
        <Text style={styles.discoveryPausedBody}>{canAskAgain ? "Turn on location to find pet people near you." : "Turn on Location for huddle in Settings."}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.discoveryPausedButton, pressed && huddleButtons.pressed]}
        >
          <Text style={styles.discoveryPausedButtonText}>{canAskAgain ? "Turn On Location" : "Open huddle Settings"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DiscoveryStarControlVisual({ standalone = false }: { standalone?: boolean }) {
  return (
    <View style={standalone ? styles.discoveryInlineStar : undefined}>
      <NativeGlassCircle blurAmount={6} blurType="ultraThinMaterial" forceFallback fallbackTint="rgba(255,117,31,0.36)" glassOpacity={0} highlightOpacity={0} navFillOnLiquidGlass={false} bodyGradient={{ colors: ["rgba(255,190,120,0.95)", "rgba(255,117,31,1)", "rgba(202,72,4,1)"], locations: [0, 0.44, 1], start: { x: 0.2, y: 0 }, end: { x: 0.74, y: 1 } }} sheen rimColor="rgba(255,246,238,1)" size={38} tint="rgba(255,117,31,0.92)">
        <MaterialCommunityIcons color={huddleColors.onPrimary} name="star" size={23} />
      </NativeGlassCircle>
    </View>
  );
}

function DiscoveryWaveControlVisual({ iconStyle, standalone = false }: { iconStyle?: StyleProp<ViewStyle>; standalone?: boolean }) {
  return (
    <View style={standalone ? styles.discoveryGlassWave : undefined}>
      <NativeGlassCircle blurAmount={11} blurType="ultraThinMaterial" forceFallback fallbackTint="transparent" glassOpacity={0} highlightOpacity={0} navFillOnLiquidGlass={false} sheen rimColor="rgba(255,255,255,0.52)" size={60} tint="rgba(255,255,255,0.10)">
        <Reanimated.View style={iconStyle}>
          <MaterialCommunityIcons color={huddleColors.blue} name="paw" size={30} style={styles.discoveryWaveIcon} />
        </Reanimated.View>
      </NativeGlassCircle>
    </View>
  );
}

function DiscoveryProfileCard({
  busy,
  cardRef,
  chips,
  deckTransitionActive = false,
  index,
  isDeepestQueued,
  isLast,
  liftKind,
  stackTopY,
  swipeXSV,
  paused,
  locationPermissionCover,
  preparedBehind = false,
  enablingPaused,
  onSwipePhaseChange,
  profile,
  onPass,
  onProfileTap,
  onStar,
  onWave,
  onWaveIntent,
  onEnablePaused,
  starRef,
  waveRef,
}: {
  busy: boolean;
  cardRef?: RefObject<View | null>;
  chips: string[];
  deckTransitionActive?: boolean;
  index: number;
  isDeepestQueued: boolean;
  isLast: boolean;
  liftKind: DiscoverySendCueKind | null; // D1: when set, card runs sync lift+halo+fade overlay
  stackTopY: number | null;
  swipeXSV: SharedValue<number>;
  paused?: boolean;
  locationPermissionCover?: DiscoverLocationPermissionCoverProps;
  preparedBehind?: boolean;
  enablingPaused?: boolean;
  onSwipePhaseChange: (active: boolean) => void;
  profile: NativeChatDiscoveryProfile;
  onPass: (profile: NativeChatDiscoveryProfile) => void;
  onProfileTap: (profile: NativeChatDiscoveryProfile) => void;
  onStar: (profile: NativeChatDiscoveryProfile) => void;
  onWave: (profile: NativeChatDiscoveryProfile) => Promise<boolean>;
  onWaveIntent: (profile: NativeChatDiscoveryProfile) => void;
  onEnablePaused?: () => void;
  starRef?: RefObject<View | null>;
  waveRef?: RefObject<View | null>;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const screenInsets = useSafeAreaInsets();
  const { bioMode, bioPanelHeight, cardWidth, maxCardHeight, photoHeight } = discoveryCardMetrics(viewportWidth, viewportHeight, screenInsets.bottom, stackTopY);
  const rawBioPreview = profile.bio?.trim() || "";
  // Truncation is handled by numberOfLines + ellipsizeMode on the <Text> below,
  // which is pixel-accurate. A blind character cap used to cut bios short while
  // the 1–2 line panel still had room. We only collapse internal whitespace so
  // stray newlines don't waste the available lines.
  const bioPreview = rawBioPreview.replace(/\s+/g, " ");
  const publicPets = profile.pets.filter((pet) => pet.id || pet.name || pet.species || pet.photoUrl);
  const packDisplayItems = discoveryPackEmojiItems(profile, publicPets);
  const packEmojiText = packDisplayItems.join(" · ");
  const journeyYears = profile.petExperienceYears && profile.petExperienceYears > 0 ? `${profile.petExperienceYears} ${profile.petExperienceYears === 1 ? "YEAR" : "YEARS"}` : "";
  const journeyText = journeyYears ? `${journeyYears}${packEmojiText ? ` WITH ${packEmojiText}` : ""}` : "";
  const canShowFallbackLowerContent = profile.canonicalProfileLoaded || profile.canonicalProfileFailed;
  const lowerContentKind: "bio" | "journey" | "pack" | "none" =
    rawBioPreview ? "bio" : !canShowFallbackLowerContent ? "none" : journeyText ? "journey" : packDisplayItems.length > 0 ? "pack" : "none";
  const packLabel = lowerContentKind === "journey" ? "PET JOURNEY: " : "THE PACK: ";
  const packLine = lowerContentKind === "journey" ? journeyText : packEmojiText;
  const showLowerSurface = lowerContentKind !== "none" && bioMode !== "hidden" && bioPanelHeight > 0;
  const packPanelHeight = bioMode === "full" ? 64 : 56;
  const renderedBioPanelHeight = showLowerSurface ? (lowerContentKind === "pack" || lowerContentKind === "journey" ? Math.min(bioPanelHeight, packPanelHeight) : bioPanelHeight) : 0;
  const renderedPhotoHeight = showLowerSurface ? maxCardHeight - renderedBioPanelHeight : maxCardHeight;
  const renderedCardHeight = renderedPhotoHeight + renderedBioPanelHeight;
  const bioLines = bioMode === "full" || bioMode === "compact" ? 2 : 1;
  // Card-unit reservation. Tight against the deepest queued card peek (v2: actions are on-card,
  // so there is no island reservation — the peek sits directly below the card).
  const layerStackBottom = renderedCardHeight + DISCOVERY_QUEUED_PEEK_DEPTH;
  // Compute compactActions ONCE per card lifetime (mount). Locking it prevents the action layout
  // from switching mid-session while the user is reading the card.
  const compactActionsInitial = viewportHeight < renderedCardHeight + DISCOVERY_STACK_AFTER_CARD + DISCOVERY_CHROME_RESERVE + DISCOVERY_NAV_MIN_GAP;
  const compactActionsRef = useRef(compactActionsInitial);
  const compactActions = compactActionsRef.current;
  const roleLabel = petLine(profile);
  const displayName = (profile.displayName || "huddle member").trim().toUpperCase();
  const commitOffset = isLast ? SWIPE_COMMIT_OFFSET_LAST : SWIPE_COMMIT_OFFSET;
  const springCfg = isLast ? SPRING_CFG_LAST : SPRING_CFG;

  // UI-thread shared values (Reanimated v4)
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const committedDirSV = useSharedValue<-1 | 0 | 1>(0); // -1=left, 0=none, 1=right
  const hasCrossed = useSharedValue(false);
  const touchOriginYSV = useSharedValue(renderedCardHeight * 0.5);
  const gestureStartMsSV = useSharedValue(0);

  const waveIconRotSV = useSharedValue(0);
  const waveIconAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${waveIconRotSV.value}deg` }] }));

  const doPass = useCallback((p: NativeChatDiscoveryProfile) => {
    // Remove while the outgoing card is still fully off-screen. Resetting its
    // transform first produces a one-frame snap back to center before unmount.
    onPass(p);
    onSwipePhaseChange(false);
  }, [onPass, onSwipePhaseChange]);

  const doWave = useCallback((p: NativeChatDiscoveryProfile) => {
    // handleWaveDiscovery removes accepted cards synchronously before its first
    // await. Keep this outgoing instance off-screen and let the newly keyed top
    // card mount at rest; only restore when the action was rejected.
    const result = onWave(p);
    onSwipePhaseChange(false);
    void result.then((committed) => {
      if (!committed) {
        haptic.error();
        committedDirSV.value = 0;
        swipeXSV.value = withSpring(0, springCfg);
        translateX.value = withSpring(0, springCfg);
        translateY.value = withSpring(0, springCfg);
      }
    });
  }, [committedDirSV, onSwipePhaseChange, springCfg, onWave, swipeXSV, translateX, translateY]);

  const runPassExit = useCallback(() => {
    if (busy || committedDirSV.value !== 0) return;
    committedDirSV.value = -1;
    onSwipePhaseChange(true);
    haptic.toggleControl();
    swipeXSV.value = withTiming(-150, { duration: 210, easing: ReanimEasing.out(ReanimEasing.cubic) });
    translateX.value = withTiming(-DISCOVERY_FLING_X, { duration: 210, easing: ReanimEasing.out(ReanimEasing.cubic) }, () => {
      runOnJS(doPass)(profile);
    });
  }, [busy, committedDirSV, doPass, onSwipePhaseChange, profile, swipeXSV, translateX]);

  const runWaveExit = useCallback(() => {
    if (busy || committedDirSV.value !== 0) return;
    committedDirSV.value = 1;
    onSwipePhaseChange(true);
    haptic.primaryConfirm();
    onWaveIntent(profile);
    swipeXSV.value = withTiming(150, { duration: 210, easing: ReanimEasing.out(ReanimEasing.cubic) });
    translateX.value = withTiming(DISCOVERY_FLING_X, { duration: 210, easing: ReanimEasing.out(ReanimEasing.cubic) }, () => {
      runOnJS(doWave)(profile);
    });
  }, [busy, committedDirSV, doWave, onSwipePhaseChange, onWaveIntent, profile, swipeXSV, translateX]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-40, 40])
      .enabled(index === 0 && !paused)
      .onBegin((e) => {
        hasCrossed.value = false;
        gestureStartMsSV.value = Date.now();
        touchOriginYSV.value = e.y;
        runOnJS(onSwipePhaseChange)(true);
      })
      .onUpdate((e) => {
        if (committedDirSV.value !== 0) return;
        translateX.value = e.translationX;
        translateY.value = Math.max(-SWIPE_VERTICAL_BOUND, Math.min(SWIPE_VERTICAL_BOUND, e.translationY));
        swipeXSV.value = e.translationX;
        const aboveThreshold = Math.abs(e.translationX) >= commitOffset;
        if (aboveThreshold && !hasCrossed.value) {
          hasCrossed.value = true;
          runOnJS(haptic.swipeThreshold)();
        } else if (!aboveThreshold && hasCrossed.value) {
          hasCrossed.value = false;
        }
      })
      .onEnd((e) => {
        const elapsedMs = Date.now() - gestureStartMsSV.value;
        if (busy || elapsedMs < 100) {
          swipeXSV.value = withSpring(0, springCfg);
          translateX.value = withSpring(0, springCfg);
          translateY.value = withSpring(0, springCfg);
          runOnJS(onSwipePhaseChange)(false);
          return;
        }
        const rightCommit =
          e.translationX >= commitOffset ||
          (e.velocityX >= SWIPE_COMMIT_VELOCITY * 1000 && e.translationX > SWIPE_VELOCITY_MIN_OFFSET);
        const leftCommit =
          e.translationX <= -commitOffset ||
          (e.velocityX <= -(SWIPE_COMMIT_VELOCITY * 1000) && e.translationX < -SWIPE_VELOCITY_MIN_OFFSET);
        // Diagonal Y component proportional to distance from card vertical center
        const pivotOffsetY = touchOriginYSV.value - renderedCardHeight * 0.5;
        const flingY = pivotOffsetY * 0.35;
        if (rightCommit) {
          committedDirSV.value = 1;
          runOnJS(haptic.primaryConfirm)();
          runOnJS(onWaveIntent)(profile);
          const dur = Math.max(170, Math.min(260, 300 - Math.abs(e.velocityX) * 0.12));
          // Fly off immediately on commit (no held delay — the stamp it waited for is gone).
          swipeXSV.value = withTiming(150, { duration: dur, easing: ReanimEasing.out(ReanimEasing.cubic) });
          translateX.value = withTiming(DISCOVERY_FLING_X, { duration: dur, easing: ReanimEasing.out(ReanimEasing.cubic) }, () => {
            runOnJS(doWave)(profile);
          });
          translateY.value = withTiming(flingY, { duration: dur });
          return;
        }
        if (leftCommit) {
          committedDirSV.value = -1;
          runOnJS(haptic.toggleControl)();
          const dur = Math.max(170, Math.min(260, 300 - Math.abs(e.velocityX) * 0.12));
          swipeXSV.value = withTiming(-150, { duration: dur, easing: ReanimEasing.out(ReanimEasing.cubic) });
          translateX.value = withTiming(-DISCOVERY_FLING_X, { duration: dur, easing: ReanimEasing.out(ReanimEasing.cubic) }, () => {
            runOnJS(doPass)(profile);
          });
          translateY.value = withTiming(flingY, { duration: dur });
          return;
        }
        // Spring return with overshoot personality
        // D4: gate haptic on |translationX| > 20 so micro-drags don't fire it
        if (Math.abs(e.translationX) > 20) runOnJS(haptic.swipeReturn)();
        swipeXSV.value = withSpring(0, springCfg);
        translateX.value = withSpring(0, springCfg, () => {
          runOnJS(onSwipePhaseChange)(false);
        });
        translateY.value = withSpring(0, springCfg);
      }),
    [busy, commitOffset, committedDirSV, doPass, doWave, gestureStartMsSV, hasCrossed, index, onSwipePhaseChange, onWaveIntent, paused, profile, renderedCardHeight, springCfg, swipeXSV, touchOriginYSV, translateX, translateY]
  );

  // D1: lift progress drives the sync card lift+halo+fade when liftKind is set.
  // Star: 320ms total to match cue commit-delay. Wave: 220ms.
  // Driven by an effect below so the animation only starts after backend success (parent sets liftKind).
  const liftProgressSV = useSharedValue(0);
  // D3: star button charge scale — pressed in → 0.96, released → spring back to 1
  const pressScaleSV = useSharedValue(1);
  useEffect(() => {
    if (liftKind) {
      const dur = liftKind === "star" ? 320 : 220;
      liftProgressSV.value = withTiming(1, { duration: dur, easing: ReanimEasing.out(ReanimEasing.cubic) });
    } else {
      liftProgressSV.value = 0;
    }
  }, [liftKind, liftProgressSV]);

  // Animated styles — UI thread
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    const ty = translateY.value;
    // Arc correction: pivot at touch origin, compensate vertical drift
    const pivotY = touchOriginYSV.value - renderedCardHeight * 0.5;
    const rot = interpolate(tx, [-180, 0, 180], [-10, 0, 10], Extrapolation.CLAMP);
    const rotRad = (rot * Math.PI) / 180;
    const compensateY = -pivotY * (1 - Math.cos(rotRad));
    // Scale up slightly when threshold crossed (Phase D)
    const aboveT = Math.abs(tx) >= commitOffset;
    const swipeScale = aboveT ? 1.015 : interpolate(Math.abs(tx), [0, commitOffset], [1, 1.015], Extrapolation.CLAMP);
    // D1: lift adds an additional scale 1→1.02 with fade at the tail.
    const liftScale = interpolate(liftProgressSV.value, [0, 0.5, 1], [1, 1.02, 1.0], Extrapolation.CLAMP);
    const liftOpacity = interpolate(liftProgressSV.value, [0, 0.5, 1], [1, 1, 0], Extrapolation.CLAMP);
    return {
      opacity: liftOpacity,
      transform: [
        { translateX: tx },
        { translateY: ty * 0.18 + compensateY },
        { rotate: `${rot}deg` },
        { scale: swipeScale * liftScale * pressScaleSV.value },
      ],
    };
  });

  // D1: gold halo overlay inside card bounds (overflow: hidden on card clips bleed).
  // Halo rises 0→0.6 in the first half of the lift, fades 0.6→0 in the second half.
  const liftHaloStyle = useAnimatedStyle(() => {
    const p = liftProgressSV.value;
    return {
      opacity: interpolate(p, [0, 0.5, 1], [0, 0.6, 0], Extrapolation.CLAMP),
    };
  });

  const waveTintStyle = useAnimatedStyle(() => ({
    // The blue right-swipe tint used to remain locked at 22% after commit,
    // visually impersonating the decorative navy layer even after that wash
    // had already cleared. Keep only a brief directional cue, then remove it
    // on the same aggressive runway as the prepared-card wash.
    opacity: interpolate(
      translateX.value,
      [0, commitOffset * 0.1, commitOffset * 0.22],
      [0, 0.1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const passTintStyle = useAnimatedStyle(() => ({
    opacity: committedDirSV.value === -1
      ? 0.22
      : interpolate(translateX.value, [-commitOffset, -commitOffset * 0.5, 0], [0.22, 0.1, 0], Extrapolation.CLAMP),
  }));

  // v2: the corner CTAs ARE the swipe feedback — the committed-direction control grows + brightens
  // as you drag, so tapping and swiping read as the same gesture. Drag right → Wave; left → Next.
  const waveReactStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    const progress = interpolate(tx, [0, commitOffset], [0, 1], Extrapolation.CLAMP);
    // Pin the paw on screen as the card swipes/flings right: fully cancel the
    // card's rightward travel so the button stays put (and grows) instead of
    // riding the card off-screen. Only for rightward (wave) drags.
    const counter = tx > 0 ? -tx : 0;
    return {
      transform: [
        { translateX: counter },
        { scale: interpolate(progress, [0, 1], [1, 1.3], Extrapolation.CLAMP) },
      ],
    };
  });
  const nextReactStyle = useAnimatedStyle(() => {
    const progress = interpolate(translateX.value, [-commitOffset, 0], [1, 0], Extrapolation.CLAMP);
    return {
      backgroundColor: interpolateColor(progress, [0, 1], ["rgba(17,24,39,0.18)", "rgba(233,76,92,0.34)"]),
      borderColor: interpolateColor(progress, [0, 1], ["rgba(255,255,255,0.28)", "rgba(255,255,255,0.72)"]),
      opacity: interpolate(progress, [0, 1], [0.92, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(progress, [0, 1], [1, 1.3], Extrapolation.CLAMP) }],
    };
  });

  // Restore the original full-card deck: the prepared profile owns the 92%
  // second-card slot, while the deeper full cards sit behind it.
  const preparedBaseScale = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_1 * 2) / cardWidth);
  const queuedAnimatedStyle = useAnimatedStyle(() => {
    if (preparedBehind) {
      const progress = deckTransitionActive ? Math.min(1, Math.abs(swipeXSV.value) / 150) : 0;
      return {
        transform: [
          { translateY: 0 },
          { scaleX: interpolate(progress, [0, 1], [preparedBaseScale, 1], Extrapolation.CLAMP) },
          { scaleY: 1 },
        ],
      };
    }
    if (index === 0) {
      return { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] };
    }
    const progress = Math.min(1, Math.abs(swipeXSV.value) / 150);
    let baseSx: number; let peakSx: number; let baseTY: number; let peakTY: number;
    const scale1 = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_1 * 2) / cardWidth);
    const scale2 = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_2 * 2) / cardWidth);
    const scale3 = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_3 * 2) / cardWidth);
    if (index === 1) { baseSx = scale1; peakSx = 1.0;  baseTY = 0; peakTY = -2; }
    else if (index === 2) { baseSx = scale2; peakSx = scale1; baseTY = 6; peakTY = 0; }
    else { baseSx = scale3; peakSx = scale2; baseTY = 12; peakTY = 6; }
    const scaleX = baseSx + progress * (peakSx - baseSx);
    const tY = baseTY + progress * (peakTY - baseTY);
    return { transform: [{ translateY: tY }, { scaleX }, { scaleY: 1 }] };
  });
  const preparedRevealWashStyle = useAnimatedStyle(() => {
    if (!preparedBehind) return { opacity: 0, transform: [{ scaleX: 1 }] };
    const distance = deckTransitionActive ? Math.abs(swipeXSV.value) : 0;
    const progress = Math.min(1, distance / 150);
    const outerScale = interpolate(progress, [0, 1], [preparedBaseScale, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(distance, [0, commitOffset * 0.1, commitOffset * 0.22], [1, 0.25, 0], Extrapolation.CLAMP),
      // Counter-scale only the navy name-area cover. The real prepared card can
      // promote 92%→100%, but the visible navy layer remains exactly 92% wide,
      // matching the newly mounted second layer after commit.
      transform: [{ scaleX: preparedBaseScale / outerScale }],
    };
  });
  const controlsHandoffStyle = useAnimatedStyle(() => {
    const distance = deckTransitionActive ? Math.abs(swipeXSV.value) : 0;
    if (preparedBehind) {
      return {
        opacity: interpolate(distance, [0, commitOffset * 0.42, commitOffset], [0, 0, 1], Extrapolation.CLAMP),
      };
    }
    return {
      opacity: index === 0
        ? interpolate(distance, [0, commitOffset * 0.72], [1, 0], Extrapolation.CLAMP)
        : 0,
    };
  });
  const preparedFrameStyle = useAnimatedStyle(() => ({
    // The queued frame is hidden so it cannot become a visible edge above the
    // fixed second-layer surface; active cards retain their normal frame.
    borderColor: preparedBehind ? "transparent" : "rgba(66,73,101,0.12)",
    // The prepared card keeps its side geometry, but its bottom frame must not
    // create a settled-only separator between the navy and light-blue layers.
    borderBottomWidth: 0,
  }));

  // Bottom scrim color — navy → Huddle Blue → white (opacity unchanged from prior stack).
  //   Q1 (front-most): rgba(17,37,126,0.84)  navy / indigo
  //   Q2 (middle):     rgba(75,137,255,0.60)  bright light blue
  //   Q3 (deepest):    rgba(255,255,255,0.80) white
  const queuedBottomScrimColor = discoveryQueuedScrimColor(index);
  const queuedScaleX = discoveryQueuedScaleX(index, cardWidth);

  const mediaSources = useMemo(() => {
    const album = [profile.coverUrl, ...profile.socialAlbum, profile.avatarUrl].filter((s): s is string => Boolean(s));
    return Array.from(new Set(album));
  }, [profile.avatarUrl, profile.coverUrl, profile.socialAlbum]);
  const activeImage = mediaSources[Math.min(activeImageIndex, Math.max(0, mediaSources.length - 1))] || null;
  useEffect(() => { setActiveImageIndex(0); }, [profile.id]);
  const stepAlbum = useCallback((direction: -1 | 1) => {
    if (mediaSources.length <= 1) return;
    haptic.selectTab(); // D5: photo change haptic — fires only on real index change (length>1 path)
    setActiveImageIndex((current) => {
      const next = current + direction;
      if (next < 0) return mediaSources.length - 1;
      if (next >= mediaSources.length) return 0;
      return next;
    });
  }, [mediaSources.length]);

  // Tap gesture — composited with Pan to fix RNGH/Pressable conflict on Android.
  // The Pan gesture's failOffsetY([-40,40]) prevents natural tap tremors from failing
  // the gesture, so Pressable.onPress never fires. Gesture.Tap() runs on the JS thread
  // and handles profile open reliably on both platforms.
  const handleProfileTapGesture = useCallback((tapX: number, tapY: number) => {
    if (busy) return;
    // Skip when tapping album navigation zones: left/right 33%, top 70%
    if (index === 0 && mediaSources.length > 1) {
      const inLeft = tapX < cardWidth * 0.33;
      const inRight = tapX > cardWidth * 0.67;
      if ((inLeft || inRight) && tapY < renderedCardHeight * 0.70) return;
    }
    const inHeroOrActions = tapY > Math.max(0, renderedPhotoHeight - 132);
    const inNextButton = tapX > cardWidth - 72 && tapY < 82;
    if (inHeroOrActions || inNextButton) return;
    onProfileTap(profile);
  }, [busy, cardWidth, index, mediaSources.length, onProfileTap, profile, renderedCardHeight, renderedPhotoHeight]);

  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .maxDuration(400)
      .maxDistance(10)
      .enabled(index === 0 && !paused)
      .onEnd((e) => { runOnJS(handleProfileTapGesture)(e.x, e.y); }),
    [handleProfileTapGesture, index, paused]
  );

  const composedGesture = useMemo(() =>
    Gesture.Simultaneous(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  return (
    <Reanimated.View collapsable={false} style={[
      styles.discoveryCardUnit,
      index > 0 && styles.discoveryCardQueued,
      {
        width: cardWidth,
        height: layerStackBottom,
        zIndex: index === 0 ? 20 : preparedBehind ? 19 : 16 - index,
        elevation: index === 0 ? 20 : preparedBehind ? 19 : 16 - index,
      },
      queuedAnimatedStyle,
    ]}>
      {isDeepestQueued ? <View pointerEvents="none" style={[styles.discoveryQueuedBottomShadow, { top: renderedCardHeight + DISCOVERY_QUEUED_PEEK_DEPTH - 4, width: cardWidth * queuedScaleX }]} /> : null}
      <GestureDetector gesture={composedGesture}>
        <Reanimated.View
          collapsable={false}
          ref={index === 0 ? cardRef : undefined}
          style={[styles.discoveryProfileCard, { height: renderedCardHeight }, preparedFrameStyle, cardAnimatedStyle]}
        >
          <View style={[styles.discoveryPhotoWrap, !showLowerSurface && styles.discoveryPhotoWrapRoundedBottom, { height: renderedPhotoHeight }]}>
            <Pressable accessibilityLabel={`Open ${profile.displayName} profile`} accessibilityRole="button" style={styles.discoveryProfileTap}>
              <ResilientAvatarImage fallback={<View style={styles.discoveryPhotoFallback}><Text style={styles.discoveryPhotoFallbackText}>{initials(profile.displayName)}</Text></View>} style={[styles.discoveryPhoto, !showLowerSurface && styles.discoveryPhotoRoundedBottom]} uri={activeImage} version={activeImage || profile.id} />
            </Pressable>
            {index === 0 && mediaSources.length > 1 ? (
              <>
                <Pressable accessibilityLabel="Previous photo" onPress={(event) => { event.stopPropagation(); stepAlbum(-1); }} style={[styles.discoveryAlbumLeftZone, { height: renderedPhotoHeight * 0.7 }]} />
                <Pressable accessibilityLabel="Next photo" onPress={(event) => { event.stopPropagation(); stepAlbum(1); }} style={[styles.discoveryAlbumRightZone, { height: renderedPhotoHeight * 0.7 }]} />
                <View pointerEvents="none" style={styles.discoveryAlbumDots}>
                  {mediaSources.map((source, dotIndex) => <View key={`${source}:${dotIndex}`} style={[styles.discoveryAlbumDot, dotIndex === activeImageIndex && styles.discoveryAlbumDotActive]} />)}
                </View>
              </>
            ) : null}
            <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.58)", "rgba(255,255,255,0.96)"]} start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} pointerEvents="none" style={styles.discoveryBottomGradient} />
            <View style={styles.discoveryTopBadgeRow}>
              <View style={styles.discoveryTopLeftBadges}>
                {chips.map((chip) => (
                  <View key={chip} style={styles.discoveryChip}>
                    <Text style={styles.discoveryChipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Reanimated.View pointerEvents="none" style={[styles.discoverySwipeTint, styles.discoveryWaveTint, waveTintStyle]} />
            <Reanimated.View pointerEvents="none" style={[styles.discoverySwipeTint, styles.discoveryPassTint, passTintStyle]} />
            {/* D1: gold lift halo overlay — clipped by parent card overflow:hidden so cannot bleed onto neighbors. */}
            {liftKind === "star" ? <Reanimated.View pointerEvents="none" style={[styles.discoveryLiftHalo, liftHaloStyle]} /> : null}
            <View pointerEvents="box-none" style={styles.discoveryHeroCopy}>
              <View style={styles.discoveryKickerRow}>
                {roleLabel ? (
                  <>
                    {/* Only shown alongside the role kicker — if there's no role label, there's
                        nothing for the sparkle to sit "before", so it doesn't render at all. */}
                    <NativeEngagementSparkleInline engagement={profile.engagement} size={14} />
                    <Text numberOfLines={1} style={styles.discoveryRoleKicker}>{roleLabel}</Text>
                  </>
                ) : null}
              </View>
              <View style={styles.discoveryHeroNameRow}>
                <Text adjustsFontSizeToFit minimumFontScale={0.58} numberOfLines={1} style={styles.discoveryHeroName}>{displayName}</Text>
                {profile.isVerified ? <NativeVerifiedBadge compact scale={1.15} style={styles.discoveryHeroVerified} /> : null}
              </View>
            </View>
            {index === 0 || preparedBehind ? (
              <Reanimated.View pointerEvents={index === 0 ? "box-none" : "none"} style={[StyleSheet.absoluteFill, controlsHandoffStyle]}>
                {/* Next — chrome-light, top-right "close" corner. Swipe-left also = next. */}
                <Reanimated.View style={[styles.discoveryNextButton, nextReactStyle]}>
                  <Pressable accessibilityLabel="Next" accessibilityRole="button" disabled={index !== 0 || busy} hitSlop={8} onPress={runPassExit} style={({ pressed }) => [pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
                    <View style={styles.discoveryPassIcon}><NativeGlyph color={huddleColors.onPrimary} name="pass" size={20} /></View>
                  </Pressable>
                </Reanimated.View>
                {/* Fixed action cluster: every card reserves the same name geometry. */}
                <View style={styles.discoveryCornerActions}>
                  <Pressable
                    accessibilityLabel={`Star ${profile.displayName}`}
                    collapsable={false}
                    disabled={index !== 0 || busy}
                    hitSlop={10}
                    onPress={() => onStar(profile)}
                    onPressIn={() => { pressScaleSV.value = withTiming(0.96, { duration: 80 }); haptic.selectTab(); }}
                    onPressOut={() => { pressScaleSV.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
                    ref={index === 0 ? starRef : undefined}
                    style={({ pressed }) => [styles.discoveryInlineStar, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}
                  >
                    <DiscoveryStarControlVisual />
                  </Pressable>
                  <Reanimated.View style={waveReactStyle}>
                    <Pressable accessibilityLabel={`Wave at ${profile.displayName}`} collapsable={false} disabled={index !== 0 || busy} onPress={runWaveExit} ref={index === 0 ? waveRef : undefined} style={({ pressed }) => [styles.discoveryGlassWave, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
                      <DiscoveryWaveControlVisual iconStyle={waveIconAnimatedStyle} />
                    </Pressable>
                  </Reanimated.View>
                </View>
              </Reanimated.View>
            ) : null}
          </View>
          {showLowerSurface ? (
            <View style={[styles.discoveryBioPanel, (lowerContentKind === "pack" || lowerContentKind === "journey") && styles.discoveryPackPanel, bioMode === "compact" && styles.discoveryBioPanelCompact, bioMode === "single" && styles.discoveryBioPanelSingle, lowerContentKind === "bio" && styles.discoveryBioPanelQuote, { height: renderedBioPanelHeight }]}>
              {lowerContentKind === "bio" ? bioMode === "single" ? (
                <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.discoveryBioCopy, styles.discoveryBioCopySingle]}>{bioPreview}</Text>
              ) : (
                <>
                  <Text pointerEvents="none" style={styles.discoveryBioQuoteOpen}>“</Text>
                  <Text pointerEvents="none" style={styles.discoveryBioQuoteClose}>”</Text>
                  <View style={styles.discoveryBioQuoteWrap}>
                    <Text ellipsizeMode="tail" numberOfLines={bioLines} style={styles.discoveryBioCopy}>{bioPreview}</Text>
                  </View>
                </>
              ) : lowerContentKind === "pack" || lowerContentKind === "journey" ? (
                <View style={[styles.discoveryPackPreview, bioMode === "single" && styles.discoveryPackPreviewSingle]}>
                  <View style={styles.discoveryPackCopy}>
                    <View style={styles.discoveryPackLineRow}>
                      <Text numberOfLines={1} style={styles.discoveryPackKicker}>{packLabel}</Text>
                      <Text ellipsizeMode={lowerContentKind === "journey" ? "middle" : "tail"} numberOfLines={1} style={styles.discoveryPackLine}>{packLine}</Text>
                    </View>
                  </View>
                  {bioMode !== "full" ? null : (
                    <View style={styles.discoveryPackMiniCarousel}>
                      {publicPets.filter((pet) => pet.photoUrl).slice(0, 2).map((pet, petIndex) => (
                        <View key={pet.id || `${pet.photoUrl}:${petIndex}`} style={[styles.discoveryPackMiniPolaroid, petIndex === 1 && styles.discoveryPackMiniPolaroidBack]}>
                          <ExpoImage
                            accessibilityIgnoresInvertColors
                            cachePolicy="memory-disk"
                            contentFit="fill"
                            key={nativeFreshImageKey(pet.photoUrl || "", pet.updatedAt || pet.photoUrl || "")}
                            source={{ uri: nativeFreshImageUri(pet.photoUrl || "", pet.updatedAt || pet.photoUrl || "") }}
                            style={[styles.discoveryPackMiniPhoto, nativePetPresentationImageStyle(pet.photoPosition, 4 / 5)]}
                            transition={120}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
            {preparedBehind ? (
              <Reanimated.View
                pointerEvents="none"
                style={[styles.discoveryPreparedRevealWash, { height: renderedBioPanelHeight + 112 }, preparedRevealWashStyle]}
              />
            ) : null}
            {/* Queued cards keep their deck color at the bottom, while the privacy layer above masks profile details. */}
            {index > 0 && !preparedBehind ? (
              <LinearGradient
                colors={["rgba(33,71,201,0)", queuedBottomScrimColor]}
                start={{ x: 0, y: 0.55 }}
                end={{ x: 0, y: 1 }}
                style={[StyleSheet.absoluteFill, { zIndex: 16 }]}
                pointerEvents="none"
              />
            ) : null}
            {index > 0 && !preparedBehind ? <QueuedCardPrivacyLayer style={styles.discoveryQueuedPrivacyLayer} /> : null}
            {index === 0 && paused ? (
              <View style={styles.discoveryPausedCover}>
                <RNBlurView blurAmount={22} blurType="light" style={StyleSheet.absoluteFill} />
                <View style={styles.discoveryQueuedPrivacyWash} />
                <View style={styles.discoveryPausedContent}>
                  <Text style={styles.discoveryPausedTitle}>Friends Matching is paused</Text>
                  <Text style={styles.discoveryPausedBody}>Turn it back on to see other people&apos;s profiles — and let them discover you.</Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={enablingPaused}
                    onPress={() => onEnablePaused?.()}
                    style={({ pressed }) => [styles.discoveryPausedButton, pressed && huddleButtons.pressed, enablingPaused && styles.actionDisabled]}
                  >
                    <Text style={styles.discoveryPausedButtonText}>{enablingPaused ? "Enabling…" : "Open to Friends Matching"}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {index === 0 && locationPermissionCover ? <DiscoverLocationPermissionCover {...locationPermissionCover} /> : null}
        </Reanimated.View>
      </GestureDetector>
    </Reanimated.View>
  );
}

// Card-shaped shimmer shell shown before the first profile lands.
// `layer` mirrors the active queued-card geometry, including the bottom-card shadow.
function DiscoveryCardShell({ layer = 0, locationPermissionCover, stackTopY }: { layer?: 0 | 1 | 2 | 3; locationPermissionCover?: DiscoverLocationPermissionCoverProps; stackTopY: number | null }) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const screenInsets = useSafeAreaInsets();
  const { cardHeight, cardWidth } = discoveryCardMetrics(viewportWidth, viewportHeight, screenInsets.bottom, stackTopY);
  const isBelow = layer > 0;
  const scaleX = layer === 0 ? 1 : discoveryQueuedScaleX(layer, cardWidth);
  const translateY = layer === 0 ? 0 : discoveryQueuedTranslateY(layer);

  return (
    <View
      pointerEvents="none"
      style={[
        { height: cardHeight, width: cardWidth },
        isBelow ? { position: "absolute", top: huddleSpacing.x2, zIndex: 18 - layer, elevation: 18 - layer } : undefined,
        { transform: [{ translateY }, { scaleX }, { scaleY: 1 }] },
      ]}
    >
      {layer === 3 ? <View pointerEvents="none" style={[styles.discoveryQueuedBottomShadow, { top: cardHeight + DISCOVERY_QUEUED_PEEK_DEPTH - 4, width: cardWidth }]} /> : null}
      <View style={[styles.discoveryProfileCard, { height: cardHeight, width: "100%" }]}>
        <NativeShimmerSkeleton style={StyleSheet.absoluteFillObject} />
        {layer === 0 ? (
          <View style={styles.discoveryShellCopyStack} pointerEvents="none">
            <NativeShimmerSkeleton style={styles.discoveryShellLineWide} />
            <NativeShimmerSkeleton style={styles.discoveryShellLineMed} />
            <View style={styles.discoveryShellChipRow}>
              <NativeShimmerSkeleton style={styles.discoveryShellChip} />
              <NativeShimmerSkeleton style={styles.discoveryShellChip} />
            </View>
          </View>
        ) : null}
        {layer === 0 && locationPermissionCover ? <DiscoverLocationPermissionCover {...locationPermissionCover} /> : null}
      </View>
    </View>
  );
}

function DiscoveryStaticDeckLayer({ cardHeight, cardWidth, layer, swipeXSV, transitionActive }: { cardHeight: number; cardWidth: number; layer: 2 | 3 | 4; swipeXSV: SharedValue<number>; transitionActive: boolean }) {
  const baseScale = layer === 4 ? Math.max(0.62, (cardWidth - (DISCOVERY_QUEUED_SIDE_GAP_3 + 14.4) * 2) / cardWidth) : discoveryQueuedScaleX(layer, cardWidth);
  const nextScale = layer === 2
    ? discoverySettledNavyScaleX(cardWidth)
    : discoveryQueuedScaleX(layer - 1, cardWidth);
  const baseTranslateY = layer === 4 ? 18 : discoveryQueuedTranslateY(layer);
  const nextTranslateY = discoveryQueuedTranslateY(layer - 1);
  const baseColor = layer === 2 ? "#95B7FA" : layer === 3 ? "#DEE2EA" : "#F3F5F9";
  const nextColor = layer === 2 ? "#8192D7" : layer === 3 ? "#95B7FA" : "#DEE2EA";
  const animatedStyle = useAnimatedStyle(() => {
    const progress = transitionActive ? Math.min(1, Math.abs(swipeXSV.value) / 150) : 0;
    return {
      backgroundColor: interpolateColor(progress, [0, 1], [baseColor, nextColor]),
      // Layer 2's outer percentage already targets the settled navy paint
      // width. Match the settled card's corner clipping at the same endpoint;
      // otherwise its 12px corners expose a visibly wider bottom strip even
      // when the bounding-box widths are equal.
      borderRadius: layer === 2
        ? interpolate(progress, [0, 1], [huddleRadii.card, huddleRadii.modal], Extrapolation.CLAMP)
        : huddleRadii.card,
      opacity: layer === 4 ? interpolate(progress, [0, 0.2, 1], [0, 0, 1], Extrapolation.CLAMP) : 1,
      transform: [
        { translateY: interpolate(progress, [0, 1], [baseTranslateY, nextTranslateY], Extrapolation.CLAMP) },
        { scaleX: interpolate(progress, [0, 1], [baseScale, nextScale], Extrapolation.CLAMP) },
        { scaleY: 1 },
      ],
    };
  });
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.discoveryStaticDeckCard,
        {
          height: cardHeight,
          width: cardWidth,
          zIndex: 18 - layer,
          elevation: 18 - layer,
        },
        animatedStyle,
      ]}
    />
  );
}

// The real prepared-next profile owns layer 1. These are the original
// full-height cards for layers 2/3, plus hidden incoming layer 4.
function DiscoveryStaticDeck({ count, stackTopY, swipeXSV, transitionActive }: { count: number; stackTopY: number | null; swipeXSV: SharedValue<number>; transitionActive: boolean }) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const screenInsets = useSafeAreaInsets();
  const { cardWidth, maxCardHeight } = discoveryCardMetrics(viewportWidth, viewportHeight, screenInsets.bottom, stackTopY);
  const visibleDeepestLayer = Math.min(3, Math.max(0, count - 1));
  const layers: Array<2 | 3 | 4> = visibleDeepestLayer >= 2
    ? Array.from({ length: visibleDeepestLayer - 1 }, (_, offset) => (offset + 2) as 2 | 3)
    : [];
  if (count >= 5) layers.push(4);
  layers.reverse();
  return (
    <>
      {layers.map((layer) => <DiscoveryStaticDeckLayer key={`static-deck-layer:${layer}`} cardHeight={maxCardHeight} cardWidth={cardWidth} layer={layer} swipeXSV={swipeXSV} transitionActive={transitionActive} />)}
    </>
  );
}

function NativeChatRow({
  onAvatarPress,
  onDelete,
  onPress,
  row,
  userId,
}: {
  row: NativeChatInboxRow;
  onAvatarPress: (row: NativeChatInboxRow) => void;
  onDelete: (row: NativeChatInboxRow) => void;
  onPress: (row: NativeChatInboxRow) => void;
  userId: string | null;
}) {
  const name = displayName(row);
  const unread = row.unreadCount > 0;
  const disabled = row.blockedByMe || row.blockedByThem || row.unmatchedByMe || row.unmatchedByThem;
  const isTeamHuddle = isTeamHuddleRow(row);
  const priorityStar = isPriorityStarRow(row, userId);
  const socialAvailability = row.roomType === "service" ? serviceSkillsLabel(row) : row.peerAvailabilityLabel;
  const automationId = row.roomType === "service" ? "native-chat-service-row" : row.roomType === "group" ? "native-chat-group-row" : "native-chat-direct-row";
  const accessibilityLabel = row.roomType === "service"
    ? `Open ${name} care conversation`
    : row.roomType === "group"
      ? `Open ${name} group chat`
      : `Open chat with ${name}`;
  const statusBadge = row.roomType === "service" ? serviceStatusBadge(row.serviceStatus) : null;
  const translateX = useRef(new Animated.Value(0)).current;
  // Trash fades in proportionally during the drag — visible the moment the user starts swiping,
  // stable at full opacity once revealed. Driven by translateX so it never lags behind the row.
  const trashOpacity = useRef(
    translateX.interpolate({ inputRange: [-76, -24, 0], outputRange: [1, 0.35, 0], extrapolate: "clamp" }),
  ).current;
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => row.roomType !== "service" && Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderGrant: () => {
      // Reset to closed on every new gesture start so a second swipe never gets stuck mid-reveal.
      translateX.setValue(0);
    },
    onPanResponderMove: (_, gesture) => {
      translateX.setValue(Math.min(0, Math.max(-92, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const shouldReveal = gesture.dx < -56;
      Animated.spring(translateX, {
        toValue: shouldReveal ? -76 : 0,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
        overshootClamping: true,
      }).start();
    },
  }), [translateX, row.roomType]);
  const avatarUrl = row.peerAvatarUrl || row.avatarUrl;
  return (
    <View style={styles.swipeRowWrap}>
      {/* Always mounted so the trash is visible the instant the swipe starts. */}
      <Animated.View style={[styles.rowDeleteAction, { opacity: trashOpacity }]}>
        <Pressable accessibilityLabel={`Remove ${name}`} onPress={() => onDelete(row)} style={styles.rowDeleteActionPressable}>
          <Feather color={huddleColors.onPrimary} name="trash-2" size={18} />
        </Pressable>
      </Animated.View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <Pressable accessibilityLabel={accessibilityLabel} testID={automationId} disabled={disabled} onPress={() => onPress(row)} style={({ pressed }) => [styles.webChatRow, priorityStar && styles.priorityStarRow, unread && styles.rowUnread, disabled && styles.rowDisabled, pressed && styles.rowPressed]}>
          <Pressable
            accessibilityLabel={`Open ${name} profile`}
            disabled={!row.peerUserId || disabled || isTeamHuddle}
            onPress={(event) => {
              event.stopPropagation();
              onAvatarPress(row);
            }}
            style={styles.avatarPressTarget}
          >
            <NativeUserAvatar avatarUrl={avatarUrl} isTeamHuddle={isTeamHuddle} isVerified={row.peerIsVerified || isTeamHuddle} name={name} size="lg" version={row.activityTs || row.lastMessageAt || row.chatId} />
          </Pressable>
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <View style={styles.rowTitleWrap}>
                <Text numberOfLines={1} style={styles.rowTitle}>{name}</Text>
              </View>
              <View style={styles.rowTopMeta}>
                {statusBadge ? (
                  <View style={[styles.serviceStatusBadge, statusBadge.style]}>
                    <Text numberOfLines={1} style={[styles.serviceStatusBadgeText, statusBadge.textStyle]}>{statusBadge.label}</Text>
                  </View>
                ) : null}
                <Text style={statusBadge ? styles.rowTimeWithStatus : styles.rowTime}>{compactTime(row.lastMessageAt || row.activityTs)}</Text>
              </View>
            </View>
            <View style={styles.rowBottom}>
              <Text numberOfLines={1} style={[styles.rowSubtitle, priorityStar && styles.rowSubtitleStar, unread && styles.rowSubtitleUnread]}>{displaySubtitle(row, userId)}</Text>
              {unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{row.unreadCount > 99 ? "9+" : row.unreadCount}</Text></View> : null}
              {!unread && isLastMessageFromViewer(row, userId) ? (
                <Text accessibilityLabel={row.lastMessageReadByOther ? "read" : "sent"} style={[styles.readStateCheck, row.lastMessageReadByOther ? styles.readStateCheckRead : styles.readStateCheckSent]}>✓</Text>
              ) : null}
            </View>
            {socialAvailability ? (
              <Text numberOfLines={1} style={styles.rowAvailability}>{socialAvailability}</Text>
            ) : (
              <View style={styles.rowAvailabilitySpacer} />
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/// Small looping lime dot — the shared "live" signal (same language as Home's
/// pulse and the Live Activity). The only looping motion allowed in lists.
function NativeGroupLiveDot() {
  const reduceMotion = useReducedMotion();
  const beat = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    beat.value = withRepeat(withTiming(1, { duration: 1100, easing: ReanimEasing.inOut(ReanimEasing.ease) }), -1, true);
  }, [beat, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - beat.value * 0.45,
    transform: [{ scale: 1 - beat.value * 0.16 }],
  }));
  return <Reanimated.View style={[styles.groupCardLiveDot, animatedStyle]} />;
}

// Media-forward group card: cover image (or deterministic aurora identity) with
// name/location on a bottom scrim, message preview in a slim body strip below.
// "Last event: Xd" badge: the group's event list is fetched (cached RPC,
// in-flight deduped, 5min TTL — past events don't change) and reduced to the
// most recent PAST event's recency, hidden entirely past a week or with none.
function NativeGroupChatRow({ accessToken, friendIds, index = 0, onOpenDetails: _onOpenDetails, onPress, outIds, row }: { accessToken?: string | null; currentUserId: string | null; friendIds: Set<string>; index?: number; outIds: Set<string>; row: NativeChatInboxRow; onManage: (row: NativeChatInboxRow) => void; onOpenDetails: (row: NativeChatInboxRow) => void; onPress: (row: NativeChatInboxRow) => void }) {
  const reduceMotion = useReducedMotion();
  const name = displayName(row);
  const unread = row.unreadCount > 0;
  const preview = row.lastMessageContent ? parseInboxPreview(row.lastMessageContent) : "Group chat";
  const [groupEvents, setGroupEvents] = useState<NativeGroupChatEvent[] | null>(() => peekNativeGroupChatEvents(row.chatId));
  const [previewMembers, setPreviewMembers] = useState<NativeGroupManagementSnapshot["members"] | null>(() => peekNativeGroupPreviewMembers(row.chatId));
  useEffect(() => {
    let cancelled = false;
    // Stagger the warm-up so a long inbox doesn't burst-fire N RPCs at once;
    // the fetch itself is cached + deduped, so repeat renders are free.
    const timer = setTimeout(() => {
      fetchNativeGroupChatEventsCached(row.chatId, { accessToken })
        .catch(() => null)
        .then((events) => {
          if (!cancelled) setGroupEvents(events ?? peekNativeGroupChatEvents(row.chatId));
        });
      fetchNativeGroupPreviewMembers(row.chatId, { accessToken })
        .catch(() => null)
        .then((members) => {
          if (!cancelled) setPreviewMembers(members ?? peekNativeGroupPreviewMembers(row.chatId));
        });
    }, Math.min(index, 8) * 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, index, row.chatId]);
  // Badge priority: happening now > upcoming countdown > most recent past event.
  const activeOrNextEvent = pickActiveOrNextGroupEvent(groupEvents ?? []);
  const eventCountdown = groupNextEventCountdownLabel(activeOrNextEvent?.startsAt, activeOrNextEvent?.endsAt);
  const lastEventLabel = eventCountdown ? null : groupCardLastEventLabel(groupEvents);
  const previewStackMembers = [...(previewMembers || [])].sort((left, right) => {
    const leftRank = outIds.has(left.userId) ? (friendIds.has(left.userId) ? 0 : 1) : friendIds.has(left.userId) ? 2 : 3;
    const rightRank = outIds.has(right.userId) ? (friendIds.has(right.userId) ? 0 : 1) : friendIds.has(right.userId) ? 2 : 3;
    return leftRank - rightRank || left.userId.localeCompare(right.userId);
  }).slice(0, 4);
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    enter.value = withDelay(Math.min(index, 6) * 60, withTiming(1, { duration: 260, easing: ReanimEasing.out(ReanimEasing.ease) }));
  }, [enter, index, reduceMotion]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 10 }],
  }));
  return (
    <Reanimated.View style={[styles.groupCardShadowWrap, entranceStyle]}>
      <Pressable
        accessibilityLabel={`Open ${name} group chat`}
        accessibilityRole="button"
        testID={`native-chat-group-row-${row.chatId}`}
        onPress={() => onPress(row)}
        style={({ pressed }) => [styles.groupCard, pressed && styles.rowPressed]}
      >
        <View style={styles.groupCardCover}>
          {row.avatarUrl ? (
            <ResilientAvatarImage
              fallback={<NativeAuroraCover initial={name} seed={row.chatId} style={StyleSheet.absoluteFill} />}
              style={styles.groupCardCoverImage}
              uri={row.avatarUrl}
              version={row.activityTs || row.lastMessageAt || row.chatId}
            />
          ) : (
            <NativeAuroraCover initial={name} seed={row.chatId} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={["rgba(10,16,40,0)", "rgba(10,16,40,0.78)"]}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0.3 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Top scrim so the info button + time stay legible over light covers. */}
          <LinearGradient
            colors={["rgba(10,16,40,0.34)", "rgba(10,16,40,0)"]}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={styles.groupCardTopScrim}
          />
          {previewStackMembers.length > 0 ? (
            <View pointerEvents="none" style={[styles.exploreFaceStack, styles.groupCardFaceStack]}>
              {previewStackMembers.map((member, memberIndex) => (
                <View key={member.userId} style={[styles.exploreFaceStackItem, outIds.has(member.userId) ? styles.exploreFaceStackItemOut : null, memberIndex > 0 && styles.exploreFaceStackOverlap]}>
                  <ResilientAvatarImage
                    fallback={<View style={styles.exploreFaceStackFallback}><Feather color={huddleColors.blue} name="user" size={14} /></View>}
                    style={styles.exploreFaceStackImage}
                    uri={member.avatarUrl}
                    version={member.userId}
                  />
                </View>
              ))}
              {row.memberCount > previewStackMembers.length ? (
                <View style={[styles.exploreFaceStackItem, styles.exploreFaceStackOverlap, styles.exploreFaceStackMore]}>
                  <Text style={styles.exploreFaceStackMoreText}>+{row.memberCount - previewStackMembers.length}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {eventCountdown ? (
            <View style={styles.groupCardLiveBadge}>
              {eventCountdown.active ? <NativeGroupLiveDot /> : <Feather color="rgba(255,255,255,0.85)" name="calendar" size={11} />}
              <Text numberOfLines={1} style={styles.groupCardLiveBadgeText}>
                {eventCountdown.active && (activeOrNextEvent?.rsvpCount ?? 0) > 3 ? `${eventCountdown.label} — ${activeOrNextEvent?.rsvpCount} going` : eventCountdown.label}
              </Text>
            </View>
          ) : lastEventLabel ? (
            <View style={styles.groupCardLiveBadge}>
              <Feather color="rgba(255,255,255,0.85)" name="calendar" size={11} />
              <Text numberOfLines={1} style={styles.groupCardLiveBadgeText}>{`Last event: ${lastEventLabel}`}</Text>
            </View>
          ) : null}
          <View style={styles.groupCardScrimContent}>
            <View style={styles.groupCardNameRow}>
              <Text numberOfLines={1} style={styles.groupCardName}>{name}</Text>
            </View>
            {row.locationLabel ? (
              <View style={styles.groupCardLocationRow}>
                <Feather color="rgba(255,255,255,0.75)" name="map-pin" size={12} />
                <Text numberOfLines={1} style={styles.groupCardLocationText}>{row.locationLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.groupCardBody}>
          <Text numberOfLines={1} style={[styles.rowSubtitle, styles.groupCardPreview, unread && styles.rowSubtitleUnread]}>{preview}</Text>
          {unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{row.unreadCount > 99 ? "9+" : row.unreadCount}</Text></View> : null}
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

function GroupDescriptionTextArea({
  error,
  focused,
  style,
  ...props
}: { error?: boolean; focused?: boolean } & TextInputProps) {
  const [contentHeight, setContentHeight] = useState(GROUP_DESCRIPTION_FIELD_MIN_HEIGHT);
  const fieldHeight = Math.min(GROUP_DESCRIPTION_FIELD_MAX_HEIGHT, Math.max(GROUP_DESCRIPTION_FIELD_MIN_HEIGHT, Math.ceil(contentHeight)));
  const scrollEnabled = contentHeight > GROUP_DESCRIPTION_FIELD_MAX_HEIGHT;

  return (
    <TextInput
      {...props}
      multiline
      numberOfLines={2}
      onContentSizeChange={(event) => {
        const nextHeight = event.nativeEvent.contentSize.height;
        if (Number.isFinite(nextHeight)) setContentHeight(nextHeight);
      }}
      placeholderTextColor={huddleColors.mutedText}
      scrollEnabled={scrollEnabled}
      style={[
        nativeModalStyles.appModalField,
        styles.createDescriptionField,
        focused ? nativeModalStyles.appModalFieldFocused : null,
        error ? nativeModalStyles.appModalFieldError : null,
        { height: fieldHeight },
        style,
      ]}
      textAlignVertical="top"
    />
  );
}

function MatchedRail({ highlightPeerId, onHighlightComplete, rows, onOpen }: { highlightPeerId?: string | null; onHighlightComplete?: () => void; rows: NativeChatInboxRow[]; onOpen: (row: NativeChatInboxRow) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;
  const hiddenCount = rows.length - 10;
  const visibleRows = expanded || hiddenCount <= 0 ? rows : rows.slice(0, 10);
  return (
    <ScrollView contentContainerStyle={styles.matchRailContent} horizontal showsHorizontalScrollIndicator={false}>
      {visibleRows.map((row) => {
        const name = displayName(row);
        const avatarUrl = row.peerAvatarUrl || row.avatarUrl;
        return (
          <NewFriendRailAvatar key={`match:${row.peerUserId || row.chatId}`} highlighted={Boolean(highlightPeerId && row.peerUserId === highlightPeerId)} onHighlightComplete={onHighlightComplete}>
            <Pressable accessibilityLabel={`Open match with ${name}`} onPress={() => onOpen(row)} style={[styles.matchRailItem, row.justAdded && styles.matchRailItemJustAdded]}>
              <NativeUserAvatar avatarUrl={avatarUrl} isVerified={row.peerIsVerified} name={name} size="lg" version={row.activityTs || row.lastMessageAt || row.chatId} />
            </Pressable>
          </NewFriendRailAvatar>
        );
      })}
      {!expanded && hiddenCount > 0 ? (
        <Pressable accessibilityLabel={`Show ${hiddenCount} more matches`} accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.matchRailItem}>
          <View style={styles.matchRailMoreTile}>
            <Text style={styles.matchRailMoreText}>+{hiddenCount}</Text>
          </View>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function NewFriendRailAvatar({ children, highlighted, onHighlightComplete }: { children: ReactNode; highlighted: boolean; onHighlightComplete?: () => void }) {
  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(-1);
  useEffect(() => {
    if (!highlighted || reduceMotion) {
      if (highlighted) onHighlightComplete?.();
      return;
    }
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: 1200, easing: ReanimEasing.inOut(ReanimEasing.ease) }, (finished) => {
      if (finished && onHighlightComplete) runOnJS(onHighlightComplete)();
    });
  }, [highlighted, onHighlightComplete, reduceMotion, sweep]);
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: sweep.value < 0 ? 0 : 1,
    transform: [{ translateX: -46 + sweep.value * 112 }, { skewX: "-18deg" }],
  }));
  return <View style={styles.newFriendRailAvatar}>
    {children}
    {highlighted && !reduceMotion ? <Reanimated.View pointerEvents="none" style={[styles.newFriendRailShine, sweepStyle]}>
      <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.72)", "rgba(255,255,255,0)"]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
    </Reanimated.View> : null}
  </View>;
}

function DiscoveryEndState({
  passedCount,
  onExpandSearch,
}: {
  passedCount: number;
  onExpandSearch: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);
  return (
    <Animated.View style={[styles.discoveryEndWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Image accessibilityIgnoresInvertColors resizeMode="contain" source={emptyChatImage} style={styles.discoveryEndImage} />
      <Text style={styles.discoveryEndHeadline}>You've met everyone nearby.</Text>
      {passedCount > 0 ? (
        <Text style={styles.discoveryEndSub}>
          {passedCount} profile{passedCount === 1 ? "" : "s"} skipped today
        </Text>
      ) : null}
      <View style={styles.discoveryEndActions}>
        <Pressable onPress={onExpandSearch} style={({ pressed }) => [styles.discoveryEndSecondary, pressed && huddleButtons.pressed]}>
          <Feather color={huddleColors.blue} name="sliders" size={16} />
          <Text style={styles.discoveryEndSecondaryText}>Expand search</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function NativeChatsEmptyState({
  body,
  buttonLabel,
  groupAligned,
  image,
  onPress,
  title,
}: {
  body?: string;
  buttonLabel?: string;
  groupAligned?: boolean;
  image?: ImageSourcePropType;
  onPress?: () => void;
  title?: string;
}) {
  const emptyImage = image || emptyChatImageFallback;

  return (
    <View style={[styles.socialEmptyState, groupAligned ? styles.socialEmptyStateGroupAligned : null]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={emptyImage}
        style={styles.socialEmptyIllustration}
      />
      {title ? <Text style={styles.socialEmptyTitle}>{title}</Text> : null}
      {body ? <Text style={styles.socialEmptyText}>{body}</Text> : null}
      {buttonLabel ? <Pressable onPress={onPress} style={styles.webEmptyButton}><Text style={styles.webEmptyButtonText}>{buttonLabel}</Text></Pressable> : null}
    </View>
  );
}

function NativeServiceChatsEmptyState() {
  return (
    <View style={styles.socialEmptyState}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={serviceImage}
        style={styles.socialEmptyIllustration}
      />
      <Text style={styles.socialEmptyText}>
        Give a chance to our local pro and use <Text style={styles.socialEmptyTextStrong}>Care</Text>!
      </Text>
    </View>
  );
}

const MATCH_QUICK_REPLIES = ["Hey! Your pet is adorable 🐾", "Would love to meet up!", "How's your day?", "Your profile caught my eye!"];
// matched.png native dims: 928 × 1376  →  aspect ratio
const MATCH_IMG_W = 928;
const MATCH_IMG_H = 1376;
const MATCH_IMG_RATIO = MATCH_IMG_W / MATCH_IMG_H;
// Avatar frames sit on top of the (frameless) artwork. Two square frames,
// blue (left/self) behind, gold (right/peer) on top with slight overlap.
// Sized in image % so they scale with the rendered artwork on every device.
// Match-modal blob geometry — tuned to the reference image:
// - frame width 26% of artwork width (slightly smaller than before; user said size can shrink but not grow)
// - frame height = width × 1.18 → reads as a vertical oval/egg, not a circle
// - centers 0.225 apart (≈ frame W − 0.035 overlap → ~13% slight overlap)
const MATCH_FRAME_W_PCT = 0.30;
// SVG blob viewBox is 116 wide × 130 tall → height/width = 1.121. Frame ratio must match so the
// SVG fills the frame without letterboxing (preserveAspectRatio=meet would otherwise leave gaps).
const MATCH_FRAME_H_RATIO = 130 / 116;
const MATCH_FRAMES_CENTER_Y_PCT = 0.36;
// Gap < frame width → overlap. 0.30 − 0.245 = 0.055 imgW overlap (slight, ≈18% of frame width).
const MATCH_FRAMES_GAP_PCT = 0.245;
const MATCH_BLUE_FRAME_RIGHT_NUDGE_PCT = 0.065;
// SVG path data — these are the shapes you approved in match_blob_preview.html.
const MATCH_BLOB_BLUE_PATH = "M 68 6 C 82 6, 90 16, 92 30 C 94 48, 90 66, 84 82 C 78 96, 70 108, 60 116 C 46 124, 28 124, 18 116 C 8 108, 4 94, 2 78 C -2 60, 2 38, 10 22 C 22 10, 44 4, 68 6 Z";
const MATCH_BLOB_CORAL_PATH = "M 42 6 C 60 4, 76 12, 86 28 C 98 46, 102 70, 98 90 C 92 110, 76 122, 56 124 C 38 124, 22 122, 12 110 C 6 98, 10 86, 16 76 C 20 64, 22 56, 18 50 C 14 38, 10 22, 16 12 C 22 6, 32 5, 42 6 Z";
const MATCH_BLOB_VIEWBOX = "-4 0 116 130";
// SVG-rendered match avatar blob. Path is the approved shape; avatar image is clipped to the path
// with cover semantics so most of the user's face/torso shows inside the blob. Stroke draws the
// brand-colored outline on top so the border traces the exact same shape.
function MatchBlob({
  variant,
  width,
  height,
  avatarUri,
  fallbackInitials,
  fallbackColor,
}: {
  variant: "blue" | "coral";
  width: number;
  height: number;
  avatarUri: string | null;
  fallbackInitials: string;
  fallbackColor: string;
}) {
  const path = variant === "blue" ? MATCH_BLOB_BLUE_PATH : MATCH_BLOB_CORAL_PATH;
  const strokeColor = variant === "blue" ? huddleColors.blue : huddleColors.coral;
  const clipId = `match-blob-clip-${variant}`;
  return (
    <Svg width={width} height={height} viewBox={MATCH_BLOB_VIEWBOX}>
      <SvgDefs>
        <SvgClipPath id={clipId}>
          <SvgPath d={path} />
        </SvgClipPath>
      </SvgDefs>
      <SvgPath d={path} fill={huddleColors.glassOverlay} />
      {avatarUri ? (
        <SvgImage
          href={{ uri: avatarUri }}
          x={-4}
          y={0}
          width={120}
          height={130}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      ) : (
        <SvgG clipPath={`url(#${clipId})`}>
          <SvgRect x={-4} y={0} width={120} height={130} fill={huddleColors.glassOverlay} />
          <SvgText
            x={56}
            y={74}
            fontSize={28}
            fontWeight="800"
            fontFamily="Urbanist-800"
            textAnchor="middle"
            fill={huddleColors.onPrimary}
          >
            {fallbackInitials}
          </SvgText>
        </SvgG>
      )}
      <SvgPath
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

function MatchModal({
  modal,
  onClose,
  onQuickHello,
  quickHello,
  self,
  setQuickHello,
  sending,
}: {
  modal: MatchModalState | null;
  onClose: () => void;
  onQuickHello: () => void;
  quickHello: string;
  self: SelfMatchProfile;
  setQuickHello: (value: string) => void;
  sending: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [replyFocused, setReplyFocused] = useState(false);

  // Compute the image's rendered rect under cover semantics, so slot
  // positions stay locked to the artwork on every device aspect ratio.
  const screenAspect = screenW / screenH;
  const imgW = screenAspect > MATCH_IMG_RATIO ? screenW : screenH * MATCH_IMG_RATIO;
  const imgH = screenAspect > MATCH_IMG_RATIO ? screenW / MATCH_IMG_RATIO : screenH;
  const imgLeft = (screenW - imgW) / 2;
  const imgTop = (screenH - imgH) / 2;

  // Two parallel egg-blob frames, brand-bordered. Right frame overlaps left
  // (gap between centers < frame width), and renders above via z-index.
  const frameW = MATCH_FRAME_W_PCT * imgW;
  const frameH = frameW * MATCH_FRAME_H_RATIO;
  const centerX = imgLeft + imgW / 2;
  const centerY = imgTop + MATCH_FRAMES_CENTER_Y_PCT * imgH;
  const halfGap = (MATCH_FRAMES_GAP_PCT * imgW) / 2;
  const frameLeft = {
    left: centerX - halfGap - frameW / 2 + MATCH_BLUE_FRAME_RIGHT_NUDGE_PCT * imgW,
    top: centerY - frameH / 2,
    width: frameW,
    height: frameH,
  };
  const frameRight = {
    left: centerX + halfGap - frameW / 2,
    top: centerY - frameH / 2,
    width: frameW,
    height: frameH,
  };

  // Entry: full match page slides up, then avatars and composer settle into place.
  const avatarScale = useSharedValue(0.6);
  const avatarOpacity = useSharedValue(0);
  const dockSlide = useSharedValue(80);
  const screenOpacity = useSharedValue(0);
  const screenTranslateY = useSharedValue(screenH);
  const modalUserId = modal?.userId ?? null;
  useEffect(() => {
    if (!modalUserId) return;
    screenOpacity.value = 0;
    screenTranslateY.value = screenH;
    dockSlide.value = 80;
    avatarScale.value = 0.6;
    avatarOpacity.value = 0;
    screenOpacity.value = withTiming(1, { duration: 180 });
    screenTranslateY.value = withTiming(0, { duration: 360, easing: ReanimEasing.out(ReanimEasing.cubic) });
    avatarScale.value = withDelay(80, withSpring(1, { damping: 14, stiffness: 240, mass: 0.6 }));
    avatarOpacity.value = withDelay(80, withTiming(1, { duration: 220 }));
    dockSlide.value = withDelay(180, withSpring(0, { damping: 18, stiffness: 200, mass: 0.6 }));
  }, [modalUserId, avatarScale, avatarOpacity, dockSlide, screenH, screenOpacity, screenTranslateY]);
  const avatarAnimStyle = useAnimatedStyle(() => ({
    opacity: avatarOpacity.value,
    transform: [{ scale: avatarScale.value }],
  }));
  const dockAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dockSlide.value }],
  }));
  const screenAnimStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ translateY: screenTranslateY.value }],
  }));

  if (!modal) return null;
  const quickHelloDisabled = sending || !quickHello.trim();
  return (
    <Modal presentationStyle="overFullScreen" animationType="none" transparent visible onRequestClose={onClose}>
      <Reanimated.View style={[styles.matchFullScreen, screenAnimStyle]}>
        {/* Backdrop — bleed handles aspect-ratio differences */}
        <Image resizeMode="cover" source={matchedImage} style={styles.matchFullImage} />
        {replyFocused ? (
          <Pressable
            accessibilityLabel="Dismiss keyboard"
            onPress={() => {
              Keyboard.dismiss();
              setReplyFocused(false);
            }}
            style={styles.matchKeyboardScrim}
          />
        ) : null}
        {/* Avatar frames — square, brand-bordered. Right frame layers on top. */}
        {/* Blue blob (self) — behind. SVG path renders the approved organic outline + clips avatar to it. */}
        <Reanimated.View pointerEvents="none" style={[styles.matchAvatarFrameWrap, frameLeft, styles.matchAvatarFrameZBack, avatarAnimStyle]}>
          <MatchBlob
            variant="blue"
            width={frameW}
            height={frameH}
            avatarUri={self.avatarUrl}
            fallbackInitials={initials(self.name)}
            fallbackColor={huddleColors.blue}
          />
        </Reanimated.View>
        {/* Coral blob (peer) — in front, slight overlap. */}
        <Reanimated.View pointerEvents="none" style={[styles.matchAvatarFrameWrap, frameRight, styles.matchAvatarFrameZFront, avatarAnimStyle]}>
          <MatchBlob
            variant="coral"
            width={frameW}
            height={frameH}
            avatarUri={modal.avatarUrl}
            fallbackInitials={initials(modal.name)}
            fallbackColor={huddleColors.coral}
          />
        </Reanimated.View>
        {/* Close button */}
        <Pressable accessibilityLabel="Close" hitSlop={huddleSpacing.x2} onPress={onClose} style={[nativeModalStyles.appMatchCloseButton, { top: Math.max(insets.top + huddleSpacing.x2, huddleSpacing.x4) }]}>
          <Feather color={huddleColors.blue} name="x" size={16} />
        </Pressable>
        {/* Chips + chromeless input bottom-anchored; keyboard controller lifts this tray above the iOS keyboard. */}
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} pointerEvents="box-none" style={styles.matchKeyboardDockWrap}>
          <Reanimated.View style={[styles.matchDockBelowPill, replyFocused && styles.matchDockFocused, dockAnimStyle]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.matchQuickReplies}
              keyboardShouldPersistTaps="handled"
            >
              {MATCH_QUICK_REPLIES.map((reply) => (
                <Pressable key={reply} onPress={() => setQuickHello(reply)} style={({ pressed }) => [styles.matchQuickReplyChip, pressed && huddleButtons.pressed]}>
                  <RNBlurView blurAmount={24} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
                  <View pointerEvents="none" style={styles.matchGlassOverlay} />
                  {/* Force single-line — chip widens to fit copy; horizontal scroll handles overflow. */}
                  <Text numberOfLines={1} ellipsizeMode="clip" style={styles.matchQuickReplyText}>{reply}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.matchInputRow}>
              <RNBlurView blurAmount={24} blurType="light" pointerEvents="none" style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={styles.matchGlassOverlay} />
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                editable={!sending}
                maxLength={500}
                onChangeText={setQuickHello}
                onBlur={() => setReplyFocused(false)}
                onFocus={() => setReplyFocused(true)}
                placeholder="Type a message"
                placeholderTextColor={huddleColors.mutedText}
                style={styles.matchInputField}
                value={quickHello}
              />
              <Pressable
                accessibilityLabel="Send"
                disabled={quickHelloDisabled}
                onPress={onQuickHello}
                style={({ pressed }) => [styles.matchInputSend, quickHelloDisabled && styles.matchInputSendDisabled, pressed && !quickHelloDisabled ? styles.matchInputSendPressed : null]}
              >
                {sending ? <NativeSpinner tone="primary" /> : <Feather color={huddleColors.onPrimary} name="send" size={16} />}
              </Pressable>
            </View>
            {replyFocused ? null : (
              <Pressable accessibilityLabel="Keep exploring" onPress={onClose} style={styles.matchKeepExploring}>
                <Text style={styles.matchKeepExploringText}>Keep exploring</Text>
              </Pressable>
            )}
          </Reanimated.View>
        </KeyboardAvoidingView>
      </Reanimated.View>
    </Modal>
  );
}

export function NativeChatsScreen({ active = true, accessToken, careMarketIsActive = false, friendRequestUnread = false, userId, search, sessionKey, onBottomSheetOpenChange, onNavigate }: NativeChatsScreenProps) {
  const screenInsets = useSafeAreaInsets();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const initialMainTab = parseInitialMainTab(search);
  const initialRows = readNativeChatsInboxHandoff({ sessionKey, tab: initialMainTab, userId }) || [];
  const [topTab, setTopTab] = useState<NativeChatsTopTab>(() => parseInitialTopTab(search));
  const [mainTab, setMainTab] = useState<Exclude<NativeChatsTab, "discover">>(() => initialMainTab);
  const [rows, setRows] = useState<NativeChatInboxRow[]>(() => initialRows);
  // Cache hydration is source="cache" status="hydrating"; only DB validation can move status="fresh".
  const [inboxSyncState, setInboxSyncState] = useState<"idle" | "hydrating" | "refreshing" | "fresh" | "error">(() => initialRows.length > 0 ? "hydrating" : "idle");
  const [serviceTabHasDialogues, setServiceTabHasDialogues] = useState<boolean | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [discoverProfiles, setDiscoverProfiles] = useState<NativeChatDiscoveryProfile[]>([]);
  const [discoverLoadSettled, setDiscoverLoadSettled] = useState(false);
  const [discoverSettledKey, setDiscoverSettledKey] = useState<string | null>(null);
  const [discoverStorageHydrated, setDiscoverStorageHydrated] = useState(false);
  const [discoverDeckHydrated, setDiscoverDeckHydrated] = useState(false);
  const [discoverEndStateReady, setDiscoverEndStateReady] = useState(false);
  const [discoverySwipeActive, setDiscoverySwipeActive] = useState(false);
  const [discoveryStackTopY, setDiscoveryStackTopY] = useState<number | null>(null);
  const [discoveryGeometryReady, setDiscoveryGeometryReady] = useState(false);
  const discoverySwipeXSV = useSharedValue(0);
  const [discoverStatus, setDiscoverStatus] = useState<NativeChatDiscoverStatus>("ready");
  const [discoverAgeEligible, setDiscoverAgeEligible] = useState<boolean | null>(null);
  const [discoverLocationPermission, setDiscoverLocationPermission] = useState<NativeLocationPermissionDetail>({ canAskAgain: true, state: "unknown" });
  const [discoverLocationPermissionResolved, setDiscoverLocationPermissionResolved] = useState(false);
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const [discoveryCycleStartedAt, setDiscoveryCycleStartedAt] = useState<string | null>(null);
  const [discoverLocationLabel, setDiscoverLocationLabel] = useState<string | null>(null);
  const [discoverBusyId, setDiscoverBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<NativeChatDiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [viewerCountry, setViewerCountry] = useState<string | null>(null);
  const [viewerScope, setViewerScope] = useState<NativeViewerScope | null>(null);
  const [viewerScopeResolved, setViewerScopeResolved] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<StarUpgradeTier | null>(null);
  const [starsExhaustedOpen, setStarsExhaustedOpen] = useState(false);
  const [filterRow, setFilterRow] = useState<keyof NativeChatDiscoveryFilters | null>(null);
  const [effectiveTier, setEffectiveTier] = useState<"free" | "plus" | "gold">("free");
  const [selfVerified, setSelfVerified] = useState(false);
  // Friends Matching paused = the viewer's `non_social` flag is on (Account Settings →
  // "Open to Friends Matching" turned off). When paused, the Discover deck is frozen
  // behind a blur until they re-enable it inline.
  const [friendsMatchingPaused, setFriendsMatchingPaused] = useState(false);
  const [enablingFriendsMatching, setEnablingFriendsMatching] = useState(false);
  const [resumeMatchingHintOpen, setResumeMatchingHintOpen] = useState(false);
  // Discover manual refresh — bare refresh-cw icon top-right (mirrors Map MapControlButton icon contract).
  const [discoverRefreshing, setDiscoverRefreshing] = useState(false);
  const [liftingProfile, setLiftingProfile] = useState<{ id: string; kind: DiscoverySendCueKind } | null>(null); // D1: card lift sync after backend success
  const [discoverySendCue, setDiscoverySendCue] = useState<{ kind: DiscoverySendCueKind; id: number; originX: number | null; originY: number | null } | null>(null);
  const [confirmStarTarget, setConfirmStarTarget] = useState<StarConfirmTarget | null>(null);
  const [starActionLoading, setStarActionLoading] = useState(false);
  const [starConfirmMessage, setStarConfirmMessage] = useState<string | null>(null);
  const [confirmStarPending, setConfirmStarPending] = useState(false);
  const [confirmStarButtonRect, setConfirmStarButtonRect] = useState<{ x: number; y: number } | null>(null);
  const [passedDiscoveryIds, setPassedDiscoveryIds] = useState<Set<string>>(new Set());
  const [handledDiscoveryIds, setHandledDiscoveryIds] = useState<Set<string>>(new Set());
  const [matchModal, setMatchModal] = useState<MatchModalState | null>(null);
  const [matchQuickHello, setMatchQuickHello] = useState("");
  const [matchSending, setMatchSending] = useState(false);
  const [activeMatchedPeerIds, setActiveMatchedPeerIds] = useState<Set<string>>(new Set());
  const [visibleOutIds, setVisibleOutIds] = useState<Set<string>>(() => peekVisibleUserPinIds());
  useEffect(() => subscribeVisibleUserPinIds((ids) => {
    setVisibleOutIds((current) => {
      const currentKey = Array.from(current).sort().join("|");
      const nextKey = Array.from(ids).sort().join("|");
      return currentKey === nextKey ? current : ids;
    });
  }), []);
  const [selfMatchProfile, setSelfMatchProfile] = useState<SelfMatchProfile>({ name: "You", avatarUrl: null });
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const [profileSheetFallbackData, setProfileSheetFallbackData] = useState<ProfileSheetFallbackData | null>(null);
  const [profileSheetSource, setProfileSheetSource] = useState<"discover" | "other">("other");
  const [carerProfileOpen, setCarerProfileOpen] = useState(false);
  const [carerProfile, setCarerProfile] = useState<NativeServiceProvider | null>(null);
  const [carerProfileLoading, setCarerProfileLoading] = useState(false);
  const [carerProfileError, setCarerProfileError] = useState("");
  const [communityNextEventByGroupId, setCommunityNextEventByGroupId] = useState<Map<string, GroupCoverNextEvent>>(new Map());
  const [exploreGroups, setExploreGroups] = useState<NativeExploreGroup[]>([]);
  const [invitedExploreGroups, setInvitedExploreGroups] = useState<NativeExploreGroup[]>([]);
  const [groupExploreSort, setGroupExploreSort] = useState<NativeGroupExploreSort>("relevance");
  const [groupExploreSortOpen, setGroupExploreSortOpen] = useState(false);
  const [hiddenExploreGroupIds, setHiddenExploreGroupIds] = useState<Set<string>>(new Set());
  const [dismissedInviteBannerIds, setDismissedInviteBannerIds] = useState<Set<string>>(new Set());
  const [viewerGroupAnchor, setViewerGroupAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const [viewerPetSignals, setViewerPetSignals] = useState<NativeViewerPetSignal[]>([]);
  const [viewerLocationWords, setViewerLocationWords] = useState<string[]>([]);
  const [pendingGroupInvitePrompt, setPendingGroupInvitePrompt] = useState<NativeExploreGroup | null>(null);
  const [groupInviteBannerExpanded, setGroupInviteBannerExpanded] = useState(false);
  const [inviteInboxOpen, setInviteInboxOpen] = useState(false);
  const [groupDetails, setGroupDetails] = useState<NativeExploreGroup | NativeChatInboxRow | null>(null);
  const [eventCountdownNow, setEventCountdownNow] = useState(() => Date.now());
  const [routeGroupDetailId, setRouteGroupDetailId] = useState<string | null>(() => parseInitialGroupDetailId(search));
  const [routeServiceRoomId, setRouteServiceRoomId] = useState<string | null>(() => parseInitialServiceRoomId(search));
  const [groupManagement, setGroupManagement] = useState<NativeGroupManagementSnapshot | null>(null);
  const [groupManagementLoading, setGroupManagementLoading] = useState(false);
  const [groupManagementError, setGroupManagementError] = useState(false);
  const [matchedInviteCandidates, setMatchedInviteCandidates] = useState<Array<{ id: string; name: string; avatarUrl: string | null; isVerified: boolean; socialId: string | null }>>([]);
  const [matchedRailSummaries, setMatchedRailSummaries] = useState<NativeMatchedRailSummary[]>([]);
  const [groupNameEdit, setGroupNameEdit] = useState("");
  const [groupLocationEdit, setGroupLocationEdit] = useState("");
  const [groupPetFocusEdit, setGroupPetFocusEdit] = useState<string[]>([]);
  const [groupDescriptionEdit, setGroupDescriptionEdit] = useState("");
  const [groupEditCoverDraft, setGroupEditCoverDraft] = useState<PendingGroupCover | null>(null);
  const [groupDetailsErrors, setGroupDetailsErrors] = useState<GroupDetailsErrors>({});
  const [groupMemberReportTarget, setGroupMemberReportTarget] = useState<NativeGroupManagementSnapshot["members"][number] | null>(null);
  const [groupMemberReportChatId, setGroupMemberReportChatId] = useState<string | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<NativeChatInboxRow | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupJoinMethodDraft, setGroupJoinMethodDraft] = useState<"instant" | "request">("request");
  const [groupVisibilityDraft, setGroupVisibilityDraft] = useState<"public" | "private">("public");
  const [groupLocationDraft, setGroupLocationDraft] = useState("");
  const [groupCountryDraft, setGroupCountryDraft] = useState<string | null>(null);
  const [groupPetFocusDraft, setGroupPetFocusDraft] = useState<string[]>([]);
  const [groupInviteIds, setGroupInviteIds] = useState<string[]>([]);
  const [groupCoverDraft, setGroupCoverDraft] = useState<PendingGroupCover | null>(null);
  const [groupCoverCropTarget, setGroupCoverCropTarget] = useState<PendingGroupCoverCropTarget>(null);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupCodeDraft, setGroupCodeDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(INBOX_FIRST_PAGE);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [rowCursor, setRowCursor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResultRows, setSearchResultRows] = useState<NativeChatInboxRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [contactFriendRequestsRefreshKey, setContactFriendRequestsRefreshKey] = useState(0);
  const [newlyAcceptedPeerId, setNewlyAcceptedPeerId] = useState<string | null>(null);
  const [matchedRailRefreshKey, setMatchedRailRefreshKey] = useState(0);
  const handleNewFriendHighlightComplete = useCallback(() => setNewlyAcceptedPeerId(null), []);
  const [status, setStatus] = useState<string | null>(null);
  const transitionNativeModal = useNativeModalTransition();
  const wasActiveRef = useRef(active);

  useEffect(() => {
    const open = filterOpen || groupExploreSortOpen || premiumTier !== null || starsExhaustedOpen || matchModal !== null || profileSheetUserId !== null || confirmStarTarget !== null || carerProfileOpen || inviteInboxOpen || pendingGroupInvitePrompt !== null || groupDetails !== null || groupManagement !== null || groupMemberReportTarget !== null || pendingDeleteRow !== null || createGroupOpen || joinCodeOpen;
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [carerProfileOpen, confirmStarTarget, createGroupOpen, filterOpen, groupDetails, groupExploreSortOpen, groupManagement, groupMemberReportTarget, inviteInboxOpen, joinCodeOpen, matchModal, onBottomSheetOpenChange, pendingDeleteRow, pendingGroupInvitePrompt, premiumTier, profileSheetUserId, starsExhaustedOpen]);
  useEffect(() => {
    if (topTab !== "community" && !groupDetails) return undefined;
    setEventCountdownNow(Date.now());
    const timer = setInterval(() => setEventCountdownNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [groupDetails, topTab]);
  const discoverySendCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryStackRef = useRef<View | null>(null);
  const discoverPageRef = useRef<View | null>(null);
  const discoverCardRef = useRef<View | null>(null);
  const discoverStarRef = useRef<View | null>(null);
  const discoverWaveRef = useRef<View | null>(null);
  const [discoverCoachMarkArmed, setDiscoverCoachMarkArmed] = useState(false);
  const [showDiscoverCoachMarks, setShowDiscoverCoachMarks] = useState(false);
  // Seen-once is persisted per user, but the AsyncStorage write races the arming effect
  // right after the last mark is dismissed. This ref closes that window so the sequence
  // cannot re-arm and fire a second time in the same session.
  const discoverCoachMarksCompletedRef = useRef(false);
  const discoveryMeasureSeqRef = useRef(0);
  const starBusyRef = useRef(false);
  const waveActionRef = useRef<{ profileId: string; actionId: string } | null>(null);
  const starPreflightRef = useRef<string | null>(null);
  const presentedMatchIdsRef = useRef<Set<string>>(new Set());
  const starMountedRef = useRef(true);
  const discoveryFiltersSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passedDiscoveryIdsRef = useRef(passedDiscoveryIds);
  const handledDiscoveryIdsRef = useRef(handledDiscoveryIds);
  const discoveryDetailHydratedRef = useRef<Set<string>>(new Set());
  const discoveryDetailHydrationAttemptsRef = useRef<Map<string, number>>(new Map());
  const activeMatchedPeerIdsRef = useRef(activeMatchedPeerIds);
  const viewerCountryRef = useRef(viewerCountry);
  const rowsRef = useRef(rows);
  const discoverProfilesRef = useRef(discoverProfiles);
  const mainTabRef = useRef(mainTab);
  const topTabRef = useRef(topTab);
  const stableDiscoverTopCardRef = useRef<{ profile: NativeChatDiscoveryProfile; deckKey: string } | null>(null);
  const discoverLocationPermissionStateRef = useRef<NativeLocationPermissionDetail["state"]>("unknown");

  const setDiscoverySwipePhase = useCallback((active: boolean) => {
    setDiscoverySwipeActive(active);
  }, []);
  const inboxRowsByTabRef = useRef<Partial<Record<Exclude<NativeChatsTab, "discover">, NativeChatInboxRow[]>>>(initialRows.length > 0 ? { [initialMainTab]: initialRows } : {});
  const chatSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const inboxRequestSeqRef = useRef(0);
  const readOverlayRef = useRef<Map<string, number>>(new Map());
  const unreadTotalVersionRef = useRef(0);
  const loadRowsGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const committedLoadKeysRef = useRef(new Set<string>());
  const loadMoreRowsRef = useRef(false);
  const exploreLoadGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const communityScrollRef = useRef<ScrollView | null>(null);
  const seenGroupInvitePromptsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedRowsRef = useRef(false);

  const measureDiscoveryStackTop = useCallback(() => {
    const seq = ++discoveryMeasureSeqRef.current;
    const navBottomOffset = Math.max(huddleSpacing.x2, screenInsets.bottom + 8);
    const navTopY = viewportHeight - navBottomOffset - huddleLayout.navHeight;
    const minimumStackTopY = screenInsets.top + 96;
    const isValid = (y: number) => Number.isFinite(y)
      && y >= minimumStackTopY
      && navTopY - y - DISCOVERY_NAV_TIGHT_GAP - DISCOVERY_QUEUED_PEEK_DEPTH >= 280;

    const measureStable = (attempt: number) => {
      requestAnimationFrame(() => {
        discoveryStackRef.current?.measureInWindow((_firstX, firstY) => {
          if (seq !== discoveryMeasureSeqRef.current) return;
          if (!isValid(firstY)) {
            if (attempt < 4) measureStable(attempt + 1);
            return;
          }
          requestAnimationFrame(() => {
            discoveryStackRef.current?.measureInWindow((_secondX, secondY) => {
              if (seq !== discoveryMeasureSeqRef.current) return;
              if (!isValid(secondY) || Math.abs(firstY - secondY) >= 1.5) {
                if (attempt < 4) measureStable(attempt + 1);
                return;
              }
              setDiscoveryStackTopY((current) => current !== null && Math.abs(current - secondY) < 1 ? current : secondY);
              setDiscoveryGeometryReady(true);
            });
          });
        });
      });
    };
    measureStable(0);
  }, [screenInsets.bottom, screenInsets.top, viewportHeight]);

  useLayoutEffect(() => {
    if (!active || topTab !== "discover") return;
    discoveryMeasureSeqRef.current += 1;
    setDiscoveryGeometryReady(false);
    setDiscoveryStackTopY(null);
  }, [active, screenInsets.bottom, screenInsets.top, topTab, viewportHeight, viewportWidth]);

  useEffect(() => {
    starMountedRef.current = true;
    return () => {
      starMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    passedDiscoveryIdsRef.current = passedDiscoveryIds;
  }, [passedDiscoveryIds]);

  useEffect(() => {
    handledDiscoveryIdsRef.current = handledDiscoveryIds;
  }, [handledDiscoveryIds]);

  useEffect(() => {
    activeMatchedPeerIdsRef.current = activeMatchedPeerIds;
  }, [activeMatchedPeerIds]);

  useEffect(() => {
    viewerCountryRef.current = viewerCountry;
  }, [viewerCountry]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    discoverProfilesRef.current = discoverProfiles;
  }, [discoverProfiles]);

  useEffect(() => {
    mainTabRef.current = mainTab;
  }, [mainTab]);

  useEffect(() => {
    topTabRef.current = topTab;
  }, [topTab]);

  const commitInboxRows = useCallback((tab: Exclude<NativeChatsTab, "discover">, nextRows: NativeChatInboxRow[]) => {
    inboxRowsByTabRef.current[tab] = nextRows;
    writeNativeChatsInboxHandoff({ rows: nextRows, sessionKey, tab, userId });
    setRows(nextRows);
  }, [sessionKey, userId]);

  useEffect(() => subscribeNativeChatUnmatchCommitted((event) => {
    if (!userId || event.actorUserId !== userId) return;
    const keep = (row: NativeChatInboxRow) => row.peerUserId !== event.peerUserId && (!event.chatId || row.chatId !== event.chatId);
    for (const tab of ["friends", "groups", "service"] as const) {
      const current = inboxRowsByTabRef.current[tab];
      if (current) inboxRowsByTabRef.current[tab] = current.filter(keep);
    }
    const nextRows = rowsRef.current.filter(keep);
    rowsRef.current = nextRows;
    setRows(nextRows);
    setSearchResultRows((current) => current ? current.filter(keep) : null);
    setMatchedRailSummaries((current) => current.filter((row) => row.peerUserId !== event.peerUserId && (!event.chatId || row.chatId !== event.chatId)));
    setMatchedInviteCandidates((current) => current.filter((row) => row.id !== event.peerUserId));
    setActiveMatchedPeerIds((current) => {
      const next = new Set(current);
      next.delete(event.peerUserId);
      return next;
    });
    writeNativeChatsInboxHandoff({ rows: nextRows, sessionKey, tab: "friends", userId });
  }), [sessionKey, userId]);

  useEffect(() => {
    chatSessionKeyRef.current = sessionKey || (userId ? `${userId}:0` : "anon:0");
  }, [sessionKey, userId]);

  useEffect(() => {
    if (!routeServiceRoomId) return;
    const roomId = routeServiceRoomId;
    setRouteServiceRoomId(null);
    onNavigate(`/service-chat?room=${encodeURIComponent(roomId)}&returnTo=${encodeURIComponent("/chats?tab=service")}`);
  }, [onNavigate, routeServiceRoomId]);

  useEffect(() => {
    if (!userId) {
      seenGroupInvitePromptsRef.current = new Set();
      return;
    }
    void readNativeDisplayCacheItem(`native_group_invite_prompt_seen_${userId}`)
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : [];
        seenGroupInvitePromptsRef.current = new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : []);
      })
      .catch(() => {
        seenGroupInvitePromptsRef.current = new Set();
      });
  }, [userId]);

  useEffect(() => {
    if (!userId || pendingGroupInvitePrompt) return;
    if (topTab !== "community" && !(topTab === "chats" && mainTab === "groups")) return;
    let cancelled = false;
    void fetchNativePendingGroupInvitePrompts(userId, { accessToken })
      .then((invites) => {
        if (cancelled) return;
        const nextInvite = invites.find((group) => {
          const key = group.inviteId || group.id;
          return key && !seenGroupInvitePromptsRef.current.has(key);
        });
        if (!nextInvite) return;
        const key = nextInvite.inviteId || nextInvite.id;
        seenGroupInvitePromptsRef.current.add(key);
        void AsyncStorage.setItem(`native_group_invite_prompt_seen_${userId}`, JSON.stringify(Array.from(seenGroupInvitePromptsRef.current))).catch(() => undefined);
        setPendingGroupInvitePrompt(nextInvite);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, mainTab, pendingGroupInvitePrompt, topTab, userId]);

  useEffect(() => () => {
    if (discoverySendCueTimerRef.current) clearTimeout(discoverySendCueTimerRef.current);
    if (discoveryFiltersSaveRef.current) clearTimeout(discoveryFiltersSaveRef.current);
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
  }, []);

  useEffect(() => {
    if (!userId || discoverAgeEligible !== true) {
      setPassedDiscoveryIds(new Set());
      setHandledDiscoveryIds(new Set());
      setDiscoverStorageHydrated(false);
      setDiscoverDeckHydrated(false);
      return;
    }
    setDiscoverStorageHydrated(false);
    let cancelled = false;
    void (async () => {
      const discoveryStorageKeys = [
        nativeDiscoveryCycleStartedAtStorageKey(userId),
        nativeDiscoveryPassedCycleStorageKey(userId),
        discoveryHandledKey(userId),
        matchedDiscoveryKey(userId),
        discoveryFiltersKey(userId),
      ];
      const [cycleResult, discoveryStorageRows] = await Promise.all([
        nativeExactTokenRpc("get_discovery_cycle_state", {}, accessToken),
        readNativeDisplayCacheItems(discoveryStorageKeys),
      ]);
      const [localCycleStartedAt, passedSessionRaw, handledRaw, matchedRaw, filtersRaw] = discoveryStorageRows.map((row) => row[1]);
      if (cancelled) return;
      const cycleState = cycleResult.data && typeof cycleResult.data === "object"
        ? cycleResult.data as { cycle_started_at?: unknown; waves_used?: unknown }
        : {};
      const serverCycleStartedAt = typeof cycleState.cycle_started_at === "string" && nativeDiscoveryCycleIsActive(cycleState.cycle_started_at)
        ? cycleState.cycle_started_at
        : null;
      // A transient cycle-state request must never erase an active local deck.
      const fallbackCycleStartedAt = nativeDiscoveryCycleIsActive(localCycleStartedAt) ? localCycleStartedAt : null;
      const resolvedCycleStartedAt = cycleResult.error ? fallbackCycleStartedAt : serverCycleStartedAt;
      setDiscoveryCycleStartedAt(resolvedCycleStartedAt);
      if (resolvedCycleStartedAt) {
        void AsyncStorage.setItem(nativeDiscoveryCycleStartedAtStorageKey(userId), resolvedCycleStartedAt);
      } else if (!cycleResult.error) {
        void AsyncStorage.removeItem(nativeDiscoveryCycleStartedAtStorageKey(userId));
      }
      try {
        const parsedSession = JSON.parse(String(passedSessionRaw || "[]")) as unknown;
        const ids = new Set<string>();
        if (resolvedCycleStartedAt && Array.isArray(parsedSession)) parsedSession.map(String).filter(Boolean).forEach((id) => ids.add(id));
        setPassedDiscoveryIds(ids);
        if (!resolvedCycleStartedAt) void AsyncStorage.removeItem(nativeDiscoveryPassedCycleStorageKey(userId));
      } catch {
        setPassedDiscoveryIds(new Set());
      }
      try {
        const parsed = JSON.parse(String(handledRaw || "[]")) as unknown;
        const matched = JSON.parse(String(matchedRaw || "[]")) as unknown;
        const ids = new Set<string>();
        if (Array.isArray(parsed)) parsed.map(String).filter(Boolean).forEach((id) => ids.add(id));
        if (Array.isArray(matched)) matched.map(String).filter(Boolean).forEach((id) => ids.add(id));
        setHandledDiscoveryIds(ids);
      } catch {
        setHandledDiscoveryIds(new Set());
      }
      try {
        const parsed = JSON.parse(String(filtersRaw || "")) as Partial<NativeChatDiscoveryFilters>;
        if (parsed && typeof parsed === "object") {
          setFilters(sanitizeDiscoveryFilters(parsed));
        }
      } catch {
        // Ignore corrupt persisted filters.
      }
      setDiscoverySeenToday(resolvedCycleStartedAt ? Math.max(0, Number(cycleState.waves_used || 0) || 0) : 0);
      setDiscoverStorageHydrated(true);
    })().catch(() => {
      if (!cancelled) setDiscoverStorageHydrated(true);
    });
    return () => { cancelled = true; };
  }, [accessToken, discoverAgeEligible, userId]);

  useEffect(() => {
    if (!userId || !discoverStorageHydrated || discoverDeckHydrated) return;
    let cancelled = false;
    void readChatsCache<{ profiles: NativeChatDiscoveryProfile[] }>(nativeDiscoveryStableDeckStorageKey(userId))
      .then((cached) => {
        if (cancelled) return;
        const stableProfiles = (cached?.profiles || []).filter((profile) => (
          profile?.id && !passedDiscoveryIds.has(profile.id) && !handledDiscoveryIds.has(profile.id)
        ));
        if (stableProfiles.length > 0) {
          setDiscoverProfiles((current) => current.length > 0 ? current : stableProfiles.slice(0, CHATS_DISCOVER_CACHE_LIMIT));
          stableDiscoverTopCardRef.current = { profile: stableProfiles[0], deckKey: `${userId}|discover|${sessionKey || `${userId}:0`}` };
          setDiscoverStatus("ready");
          setLoading(false);
        }
        setDiscoverDeckHydrated(true);
      })
      .catch(() => { if (!cancelled) setDiscoverDeckHydrated(true); });
    return () => { cancelled = true; };
  }, [discoverDeckHydrated, discoverStorageHydrated, handledDiscoveryIds, passedDiscoveryIds, sessionKey, userId]);

  useEffect(() => {
    if (!userId || !discoverDeckHydrated || discoverProfiles.length === 0) return;
    void writeChatsCache(nativeDiscoveryStableDeckStorageKey(userId), {
      profiles: discoverProfiles.slice(0, CHATS_DISCOVER_CACHE_LIMIT),
    });
  }, [discoverDeckHydrated, discoverProfiles, userId]);

  useEffect(() => {
    if (!userId) return;
    if (discoveryFiltersSaveRef.current) clearTimeout(discoveryFiltersSaveRef.current);
    discoveryFiltersSaveRef.current = setTimeout(() => {
      discoveryFiltersSaveRef.current = null;
      void AsyncStorage.setItem(discoveryFiltersKey(userId), JSON.stringify(filters));
    }, 220);
  }, [filters, userId]);

  const applyResolvedViewerScope = useCallback((scope: NativeViewerScope | null) => {
    if (!scope) {
      setViewerScope(null);
      return;
    }
    const viewerExploreCountry = resolveGroupExploreCountryFromScope(scope);
    const viewerExploreDistrict = scope.district || scope.profileDistrict || null;
    const viewerExplorePoint = scope.primaryPoint ?? scope.profilePoint ?? null;
    const scopeLocationText = [viewerExploreDistrict, viewerExploreCountry].filter(Boolean).join(" ");
    setViewerScope(scope);
    setViewerGroupAnchor(viewerExplorePoint);
    setViewerLocationWords(scopeLocationText
      .toLowerCase()
      .split(/[\s,./-]+/)
      .filter((word) => word.length > 2));
    setViewerCountry(viewerExploreCountry);
    setGroupCountryDraft(viewerExploreCountry || null);
  }, []);

  useEffect(() => {
    if (!userId) {
      setEffectiveTier("free");
      setViewerScope(null);
      setViewerScopeResolved(false);
      setDiscoverLocationPermission({ canAskAgain: true, state: "unknown" });
      setDiscoverLocationPermissionResolved(false);
      setViewerGroupAnchor(null);
      setViewerPetSignals([]);
      setViewerLocationWords([]);
      return;
    }
    let cancelled = false;
    setViewerScopeResolved(false);
    discoverLocationPermissionStateRef.current = "unknown";
    setDiscoverLocationPermission({ canAskAgain: true, state: "unknown" });
    setDiscoverLocationPermissionResolved(false);
    void (async () => {
      const [snapshot, scope, groupContext, permission] = await Promise.all([
        fetchNativeProfileSummary(userId, { accessToken, sessionKey }).catch(() => null),
        resolveNativeViewerScope({ userId, accessToken, sessionKey }).catch(() => null),
        fetchNativeViewerGroupContext({ accessToken }).catch(() => null),
        getNativeForegroundLocationPermissionDetail().catch(() => ({ canAskAgain: true, state: "unknown" as const })),
      ]);
      if (cancelled) return;
      if (snapshot) {
        setDiscoverAgeEligible(isNativeProfileAtLeastAge(snapshot.profile?.dob, 16));
        setEffectiveTier(normalizeTier(snapshot.profile?.effective_tier ?? snapshot.quota?.effective_tier ?? snapshot.profile?.tier ?? snapshot.quota?.tier));
        setSelfVerified(isNativeVerifiedProfile(snapshot.profile));
        setFriendsMatchingPaused(snapshot.profile?.discovery_opt_out === true);
        setSelfMatchProfile({
          name: String(snapshot.profile?.display_name || "You"),
          avatarUrl: resolveNativeAvatarUrl(snapshot.profile?.avatar_url),
        });
      } else {
        setDiscoverAgeEligible(null);
        setEffectiveTier("free");
      }
      applyResolvedViewerScope(scope);
      discoverLocationPermissionStateRef.current = permission.state;
      setDiscoverLocationPermission(permission);
      setDiscoverLocationPermissionResolved(true);
      setViewerScopeResolved(true);
      if (groupContext) {
        setViewerPetSignals(groupContext.pets.map((pet) => ({
          species: String(pet.species || "").trim(),
          breed: String(pet.breed || "").trim(),
        })).filter((pet) => pet.species || pet.breed));
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, applyResolvedViewerScope, sessionKey, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeNativeViewerScope(userId, (scope) => {
      applyResolvedViewerScope(scope);
      setViewerScopeResolved(true);
    }, { sessionKey });
  }, [applyResolvedViewerScope, sessionKey, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeNativeProfileSummary(userId, ({ profile, quota }) => {
      const ageEligible = isNativeProfileAtLeastAge(profile?.dob, 16);
      setDiscoverAgeEligible(ageEligible);
      if (ageEligible === false && topTabRef.current === "discover") {
        topTabRef.current = "chats";
        setTopTab("chats");
      }
      setSelfVerified(isNativeVerifiedProfile(profile));
      setFriendsMatchingPaused(profile?.discovery_opt_out === true);
      setEffectiveTier(normalizeTier(profile?.effective_tier ?? quota?.effective_tier ?? profile?.tier ?? quota?.tier));
      setSelfMatchProfile((current) => ({
        name: String(profile?.display_name || current.name || "You"),
        avatarUrl: resolveNativeAvatarUrl(profile?.avatar_url),
      }));
    }, { sessionKey });
  }, [sessionKey, userId]);

  const friendsSourceRows = searchResultRows ?? rows;
  const friendsWithConversationPeerIds = useMemo(() => new Set(
    friendsSourceRows
      .filter((row) => row.roomType !== "group" && row.roomType !== "service" && Boolean(row.peerUserId) && (Boolean(row.lastMessageAt) || Boolean(String(row.lastMessageContent || "").trim())))
      .map((row) => String(row.peerUserId || "")),
  ), [friendsSourceRows]);
  const avatarOnlyMatches = useMemo(() => {
    if (topTab !== "chats" || mainTab !== "friends") return [];
    const byPeer = new Map<string, NativeChatInboxRow>();
    friendsSourceRows.forEach((row) => {
      const peerId = String(row.peerUserId || "");
      if (!peerId || friendsWithConversationPeerIds.has(peerId) || !isMatchedRailRow(row, activeMatchedPeerIdsRef.current)) return;
      if (!byPeer.has(peerId)) byPeer.set(peerId, row);
    });
    matchedRailSummaries.forEach((match) => {
      const peerId = String(match.peerUserId || "");
      if (!peerId || friendsWithConversationPeerIds.has(peerId) || byPeer.has(peerId)) return;
      byPeer.set(peerId, matchedSummaryToInboxRow(match));
    });
    const ordered = Array.from(byPeer.values());
    if (!newlyAcceptedPeerId) return ordered;
    return ordered.sort((left, right) => Number(right.peerUserId === newlyAcceptedPeerId) - Number(left.peerUserId === newlyAcceptedPeerId));
  }, [friendsSourceRows, friendsWithConversationPeerIds, mainTab, matchedRailSummaries, newlyAcceptedPeerId, topTab]);
  const selectableMembers = useMemo(() => (
    [
      ...matchedInviteCandidates,
      ...rows
      .filter((row) => row.roomType !== "group" && row.roomType !== "service" && Boolean(row.peerUserId))
	      .map((row) => ({ id: row.peerUserId!, name: displayName(row), avatarUrl: resolveNativeAvatarUrl(row.peerAvatarUrl || row.avatarUrl), isVerified: row.peerIsVerified, socialId: row.peerSocialId })),
    ]
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.id === entry.id) === index)
  ), [matchedInviteCandidates, rows]);

  useEffect(() => {
    if (!userId) {
      setMatchedInviteCandidates([]);
      setMatchedRailSummaries([]);
      setActiveMatchedPeerIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const matches = await fetchNativeMatchedRailSummary({ accessToken, limit: 500, userId });
        if (!cancelled) setMatchedRailSummaries(matches);
        const candidateIds = matches.map((match) => match.peerUserId).filter(Boolean);
        if (!cancelled) setActiveMatchedPeerIds(new Set(candidateIds));
        if (!candidateIds.length) {
          if (!cancelled) setMatchedInviteCandidates([]);
          return;
        }
        const candidates = matches.map((match) => ({
          id: match.peerUserId,
          name: match.displayName || "Matched user",
          avatarUrl: match.avatarUrl,
          socialId: match.socialId,
          isVerified: match.isVerified,
        }));
        if (!cancelled) setMatchedInviteCandidates(candidates);
      } catch {
        if (!cancelled) {
          setMatchedInviteCandidates([]);
          setMatchedRailSummaries([]);
          setActiveMatchedPeerIds(new Set());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, matchedRailRefreshKey, userId]);

  const visibleRows = useMemo(() => {
    if (topTab !== "chats") return [];
    const sourceRows = searchResultRows ?? inboxRowsByTabRef.current[mainTab] ?? rows;
    const railPeerIds = new Set(avatarOnlyMatches.map((row) => String(row.peerUserId || "")).filter(Boolean));

    if (mainTab === "groups") {
      return sourceRows.filter((row) => row.roomType === "group").slice(0, visibleCount);
    }

    if (mainTab === "service") {
      return sourceRows.filter(isCareInboxRow).slice(0, visibleCount);
    }

    const conversationRows = sourceRows.filter((row) =>
      row.roomType !== "group" &&
      !isCareInboxRow(row) &&
      !railPeerIds.has(String(row.peerUserId || ""))
    );
    const priority = conversationRows.filter((row) => isPriorityStarRow(row, userId));
    const regular = conversationRows.filter((row) => !isPriorityStarRow(row, userId));
    return [...priority, ...regular].slice(0, visibleCount);
  }, [avatarOnlyMatches, mainTab, rows, searchResultRows, topTab, userId, visibleCount]);
  const visibleMainTabs = useMemo(() => (
    MAIN_TABS.filter((tab) => tab.key !== "service" || (careMarketIsActive && (serviceTabHasDialogues === true || mainTab === "service" || rows.some(isCareInboxRow))))
  ), [careMarketIsActive, mainTab, rows, serviceTabHasDialogues]);

  useEffect(() => {
    if (!userId || topTab !== "chats") {
      setServiceTabHasDialogues(null);
      return;
    }
    let cancelled = false;
    const cacheKey = chatsServiceTabProbeCacheKey(userId, sessionKey);
    void (async () => {
      const cached = await readChatsCache<{ hasDialogues: boolean }>(cacheKey);
      const durableHasDialogues = await readNativeServiceTabHasDialogues(userId);
      if (cancelled) return;
      if (durableHasDialogues) {
        setServiceTabHasDialogues(true);
        return;
      }
      if (cached?.hasDialogues === true) {
        setServiceTabHasDialogues(true);
        void markNativeServiceTabHasDialogues(userId);
        return;
      }
      if (cached) setServiceTabHasDialogues(cached.hasDialogues);
      try {
        const serviceRows = await fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: "all", onlyWithActivity: null, limit: 80 });
        const hasDialogues = serviceRows.some(isCareInboxRow);
        if (cancelled) return;
        setServiceTabHasDialogues(hasDialogues);
        void writeChatsCache(cacheKey, { hasDialogues });
        if (hasDialogues) void markNativeServiceTabHasDialogues(userId);
      } catch {
        if (!cancelled && !cached) setServiceTabHasDialogues(mainTab === "service");
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, mainTab, sessionKey, topTab, userId]);

  const friendsConversationRowCount = useMemo(() => {
    const railPeerIds = new Set(avatarOnlyMatches.map((row) => String(row.peerUserId || "")).filter(Boolean));
    return rows.filter((row) => !railPeerIds.has(String(row.peerUserId || ""))).length;
  }, [avatarOnlyMatches, rows]);

  const persistDiscoverySet = useCallback((key: string, values: Set<string>) => {
    void AsyncStorage.setItem(key, JSON.stringify(Array.from(values)));
  }, []);

  const ensureDiscoveryCycleStarted = useCallback(() => {
    setDiscoveryCycleStartedAt((current) => {
      const next = current && nativeDiscoveryCycleIsActive(current) ? current : new Date().toISOString();
      if (userId) void AsyncStorage.setItem(nativeDiscoveryCycleStartedAtStorageKey(userId), next);
      return next;
    });
    void nativeExactTokenRpc("touch_discovery_cycle", {}, accessToken).then(({ data, error }) => {
      if (!error && typeof data === "string") {
        setDiscoveryCycleStartedAt(data);
        if (userId) void AsyncStorage.setItem(nativeDiscoveryCycleStartedAtStorageKey(userId), data);
      }
    });
  }, [accessToken, userId]);

  const commitDiscoveryAction = useCallback((profileId: string, action: "pass" | "wave" | "star") => {
    if (!userId) return;
    const cleanId = String(profileId || "").trim();
    if (!cleanId) return;
    if (action !== "wave") ensureDiscoveryCycleStarted();
    invalidateNativeDiscoveryRelationshipCache(userId);
    if (stableDiscoverTopCardRef.current?.profile.id === cleanId) stableDiscoverTopCardRef.current = null;
    if (action === "pass") {
      setDiscoverProfiles((current) => current.filter((profile) => profile.id !== cleanId));
      setPassedDiscoveryIds((current) => {
        const next = new Set(current);
        next.add(cleanId);
        persistDiscoverySet(nativeDiscoveryPassedCycleStorageKey(userId), next);
        return next;
      });
      return;
    }
    setDiscoverProfiles((current) => current.filter((profile) => profile.id !== cleanId));
    setHandledDiscoveryIds((current) => {
      const next = new Set(current);
      next.add(cleanId);
      persistDiscoverySet(discoveryHandledKey(userId), next);
      return next;
    });
  }, [ensureDiscoveryCycleStarted, persistDiscoverySet, userId]);

  const rollbackDiscoveryAction = useCallback((profile: NativeChatDiscoveryProfile, action: "wave" | "star") => {
    if (!userId) return;
    setHandledDiscoveryIds((current) => {
      const next = new Set(current);
      next.delete(profile.id);
      persistDiscoverySet(discoveryHandledKey(userId), next);
      return next;
    });
    setDiscoverProfiles((current) => {
      if (current.some((item) => item.id === profile.id)) return current;
      const insertAt = Math.min(current.length, DISCOVERY_ROLLBACK_REQUEUE_OFFSET);
      return [...current.slice(0, insertAt), profile, ...current.slice(insertAt)].slice(0, DISCOVERY_VISIBLE_COUNT);
    });
  }, [persistDiscoverySet, userId]);

  const launchNativeDiscoverySendCue = useCallback((kind: DiscoverySendCueKind, options?: { onCommit?: () => void; originX?: number | null; originY?: number | null }) => new Promise<void>((resolve) => {
    if (discoverySendCueTimerRef.current) {
      clearTimeout(discoverySendCueTimerRef.current);
      discoverySendCueTimerRef.current = null;
    }
    // D1: pass through optional origin coords for spatial-continuity with the modal Send button.
    // Falls back to default screen-bottom origin when null (e.g., when measureInWindow failed).
    setDiscoverySendCue({ kind, id: Date.now(), originX: options?.originX ?? null, originY: options?.originY ?? null });
    const commitDelay = 200;
    // Runway is set by the deck, not by taste: the card exit is 170–260ms
    // (velocity-scaled), so a cue that outlives it desyncs from the next card.
    // DiscoverySendCue animates to exactly these values — it must never be
    // unmounted mid-flight, which is what produced the visible pop.
    const completeDelay = NATIVE_STAR_CUE_MS;
    let committed = false;
    discoverySendCueTimerRef.current = setTimeout(() => {
      committed = true;
      options?.onCommit?.();
      discoverySendCueTimerRef.current = setTimeout(() => {
        discoverySendCueTimerRef.current = null;
        setDiscoverySendCue(null);
        resolve();
      }, Math.max(0, completeDelay - commitDelay));
    }, commitDelay);
    if (completeDelay <= commitDelay && !committed) {
      options?.onCommit?.();
      setDiscoverySendCue(null);
      resolve();
    }
  }), []);

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const viewerScopeKey = useMemo(() => {
    const point = viewerScope?.primaryPoint;
    return JSON.stringify({
      city: viewerScope?.city ?? viewerScope?.profileLocationName ?? null,
      country: viewerScope?.country ?? null,
      district: viewerScope?.district ?? viewerScope?.profileDistrict ?? null,
      lat: typeof point?.lat === "number" ? Number(point.lat.toFixed(4)) : null,
      lng: typeof point?.lng === "number" ? Number(point.lng.toFixed(4)) : null,
      resolved: viewerScopeResolved,
      source: viewerScope?.source ?? null,
    });
  }, [viewerScope, viewerScopeResolved]);
  const activeDiscoverRequestKey = useMemo(
    () => `${userId || "anon"}|discover|${effectiveTier}|${viewerCountry || "global"}|${viewerScopeKey}|${filterKey}`,
    [effectiveTier, filterKey, userId, viewerCountry, viewerScopeKey],
  );
  const activeDiscoverDeckKey = useMemo(
    () => `${userId || "anon"}|discover|${sessionKey || `${userId || "anon"}:0`}`,
    [sessionKey, userId],
  );
  const activeChatsLoadKey = useMemo(() => (
    topTab === "discover"
      ? activeDiscoverRequestKey
      : topTab === "community"
        ? `${userId}|community|${effectiveTier}|${viewerScopeKey}`
        : `${userId}|${sessionKey || `${userId}:0`}|${topTab}|${mainTab}|${effectiveTier}`
  ), [activeDiscoverRequestKey, effectiveTier, mainTab, sessionKey, topTab, userId, viewerScopeKey]);

  const applyReadOverlay = useCallback((sourceRows: NativeChatInboxRow[]) => {
    const overlay = readOverlayRef.current;
    return sourceRows.map((row) => overlay.has(row.chatId) ? { ...row, unreadCount: 0 } : row);
  }, []);

  const refreshUnreadTotal = useCallback(async (force = true) => {
    if (!userId) {
      setUnreadTotal(0);
      return;
    }
    const requestVersion = unreadTotalVersionRef.current;
    try {
      const total = await fetchNativeChatUnreadTotal(userId, { accessToken, sessionKey, force });
      const overlayTotal = Array.from(readOverlayRef.current.values()).reduce((sum, count) => sum + Math.max(0, count), 0);
      if (unreadTotalVersionRef.current === requestVersion) setUnreadTotal(Math.max(0, total - overlayTotal));
    } catch (error) {
      logNativeProtectedActionFailure("[native.chats] unread_total_failed", error);
    }
  }, [accessToken, sessionKey, userId]);

  // The switcher's "Chats" badge reflects unread across every chat scope (friends+groups+service).
  // It's kept correct by the realtime subscription below (chat_messages/message_reads events call
  // refreshUnreadTotal directly) plus this mount-time fetch — tab switches don't need to trigger it.
  useEffect(() => {
    // The root boot warm owns the first authoritative read. This cache-aware
    // call joins/reuses it instead of forcing a second unread RPC on entry.
    void refreshUnreadTotal(false);
  }, [refreshUnreadTotal]);

  const loadRows = useCallback(async ({ force, silent }: { force?: boolean; silent?: boolean } = {}) => {
    if (!userId) {
      setRows([]);
      inboxRowsByTabRef.current = {};
      committedLoadKeysRef.current.clear();
      setUnreadTotal(0);
      setInboxSyncState("idle");
      setDiscoverLoadSettled(false);
      setDiscoverSettledKey(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const loadKey = activeChatsLoadKey;
    if (topTab === "discover" && discoverAgeEligible !== true) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if ((topTab === "discover" || topTab === "community") && !viewerScopeResolved) {
      if (!silent) setLoading(true);
      setRefreshing(false);
      return;
    }
    const now = Date.now();
    const gate = loadRowsGateRef.current;
    if (gate.key === loadKey && gate.inFlight) {
      setRefreshing(false);
      return;
    }
    if (!force && gate.key === loadKey && now - gate.lastStartedAt < 1200) {
      setRefreshing(false);
      return;
    }
    loadRowsGateRef.current = { key: loadKey, inFlight: true, lastStartedAt: now };
    // Allocate ownership only after dedupe. A duplicate render/effect call must
    // not invalidate the request it just joined and leave the surface unsettled.
    const requestSeq = ++inboxRequestSeqRef.current;
    if (topTab === "discover") {
      // A silent validation must never hide a deck the user already committed to.
      // The request key can change when viewer scope/session data settles, so keep
      // the visible deck's settled boundary aligned with this background request
      // until the authoritative response arrives. Cold entry still owns the shell.
      const preserveVisibleDiscoverDeck = silent && discoverProfilesRef.current.length > 0;
      setStatus(null);
      if (preserveVisibleDiscoverDeck) {
        setDiscoverLoadSettled(true);
        setDiscoverSettledKey(loadKey);
        committedLoadKeysRef.current.add(loadKey);
      } else {
        setDiscoverLoadSettled(false);
        setDiscoverSettledKey(null);
      }
      // Discover previews depend on the canonical public-profile snapshot for Bio > Pet Journey > Pack.
      // Do not paint cached deck rows first; it creates a visible late swap and can briefly expose stale
      // lower-card content before canonical hydration finishes. Cold-entry paint is owned by the stable
      // deck cache (nativeDiscoveryStableDeckStorageKey), which restores the last committed deck instead.
      if (!silent) setLoading(true);

      try {
        const result = await fetchNativeChatDiscoveryProfiles(userId, filters, {
          accessToken,
          countryOnly: discoverLocationPermissionResolved && discoverLocationPermission.state !== "granted",
          effectiveTier,
          viewerScope,
          force,
          cacheWriteGuard: () => loadRowsGateRef.current.key === loadKey && inboxRequestSeqRef.current === requestSeq,
        });
        if (loadRowsGateRef.current.key !== loadKey || inboxRequestSeqRef.current !== requestSeq) return;
        const passedIds = passedDiscoveryIdsRef.current;
        const handledIds = handledDiscoveryIdsRef.current;
        let clientFilteredProfiles = applyDiscoveryFilters(result.profiles, filters, {
          anchor: result.anchor,
          viewerCountry: viewerCountryRef.current,
          relaxFreshness: force,
        });
        if (!force && result.profiles.length > 0 && clientFilteredProfiles.length === 0) {
          clientFilteredProfiles = applyDiscoveryFilters(result.profiles, filters, {
            anchor: result.anchor,
            viewerCountry: viewerCountryRef.current,
            relaxFreshness: true,
          });
        }
        if (__DEV__) {
          console.log("NATIVE_DISCOVER_SCREEN_MATCHES_NATIVE_DISCOVERY_FILTERS", {
            beforeMatchesNativeDiscoveryFiltersCount: result.profiles.length,
            afterMatchesNativeDiscoveryFiltersCount: clientFilteredProfiles.length,
            droppedByMatchesNativeDiscoveryFiltersCount: result.profiles.length - clientFilteredProfiles.length,
          });
        }
        const eligibleProfiles = clientFilteredProfiles.filter((profile) =>
          !handledIds.has(profile.id) &&
          !activeMatchedPeerIdsRef.current.has(profile.id)
        );
        if (__DEV__) {
          console.log("NATIVE_DISCOVER_SCREEN_RELATIONSHIP_GUARD", {
            beforeRelationshipGuardCount: clientFilteredProfiles.length,
            afterRelationshipGuardCount: eligibleProfiles.length,
            droppedByRelationshipGuardCount: clientFilteredProfiles.length - eligibleProfiles.length,
          });
        }
        let nextProfiles = selectNativeDailyUnpassedProfiles(eligibleProfiles, passedIds, CHATS_DISCOVER_CACHE_LIMIT);

        discoveryDetailHydratedRef.current = new Set();
        discoveryDetailHydrationAttemptsRef.current = new Map();
        nextProfiles = resetDiscoveryCanonicalPreviewState(nextProfiles);
        if (nextProfiles.length > 0) {
          // Canonical-hydrate only the visible top card before first paint so the
          // first card no longer waits on the entire deck's canonical fetches. The
          // queued (privacy-masked) cards stay unhydrated here and are filled in by
          // the lazy per-card hydration effect once committed — which skips this top
          // card because applyCanonical… marks it canonicalProfileLoaded. This keeps
          // the top card swap-free while letting the deck paint immediately.
          const topProfile = nextProfiles[0];
          const topDetail = await fetchNativePublicProfile({
            accessToken,
            fallbackData: discoveryProfileToPublicProfileFallback(topProfile),
            force: true,
            profileUserId: topProfile.id,
            requireCanonical: true,
            sessionKey,
            viewerId: userId,
          }).catch(() => null);
          if (loadRowsGateRef.current.key !== loadKey || inboxRequestSeqRef.current !== requestSeq) return;
          if (topDetail) {
            nextProfiles = [applyCanonicalProfilePreviewToDiscoveryProfile(topProfile, topDetail), ...nextProfiles.slice(1)];
            discoveryDetailHydratedRef.current.add(topProfile.id);
          }
        }
        const existingStableTop = stableDiscoverTopCardRef.current;
        let finalProfiles = nextProfiles;
        if (!force && existingStableTop && existingStableTop.deckKey === activeDiscoverDeckKey && !handledIds.has(existingStableTop.profile.id) && !passedIds.has(existingStableTop.profile.id)) {
          const updatedStableTop = nextProfiles.find((profile) => profile.id === existingStableTop.profile.id) ?? existingStableTop.profile;
          finalProfiles = [updatedStableTop, ...nextProfiles.filter((profile) => profile.id !== updatedStableTop.id)]
            .slice(0, CHATS_DISCOVER_CACHE_LIMIT);
        }
        setDiscoverProfiles((current) => {
          // Network ranking is advisory once a deck is visible. Preserve the full
          // committed order and only append newcomers behind it. This also prevents
          // an in-flight refresh from replacing the card underneath an active swipe.
          const countryOnly = discoverLocationPermissionResolved && discoverLocationPermission.state !== "granted";
          const protectedPreview = countryOnly ? current.slice(0, 4) : [];
          const committedProfiles = countryOnly && protectedPreview.length > 0
            ? mergeNativeDiscoveryPermissionDeck(
              protectedPreview,
              finalProfiles,
              viewerScope?.profileCountryName ?? viewerScope?.profileCountry,
            )
              .slice(0, CHATS_DISCOVER_CACHE_LIMIT)
            : current.length > 0
              ? mergeNativeStableDiscoveryDeck(current, finalProfiles, CHATS_DISCOVER_CACHE_LIMIT)
              : finalProfiles;
          const committedTopProfile = committedProfiles[0] ?? null;
          stableDiscoverTopCardRef.current = committedTopProfile ? { profile: committedTopProfile, deckKey: activeDiscoverDeckKey } : null;
          return committedProfiles;
        });
        if (__DEV__) {
          console.log("NATIVE_DISCOVER_FINAL_PROFILES", {
            discoverProfilesLength: finalProfiles.length,
            lostFromRpcToFinalCount: result.profiles.length - finalProfiles.length,
            passedIdsCount: passedIds.size,
          });
        }
        setDiscoverStatus(result.status);
        setDiscoverLocationLabel(result.locationLabel);
        setDiscoverLoadSettled(true);
        setDiscoverSettledKey(loadKey);
      } catch (error) {
        // A superseded request may reject after the replacement request has
        // already started. It must never paint a failure over that loading UI.
        if (loadRowsGateRef.current.key !== loadKey || inboxRequestSeqRef.current !== requestSeq) return;
		        // Keep the last confirmed deck actionable when a background
		        // validation fails. Explicit/cold loads still surface the error
		        // state and its retry affordance.
		        if (!preserveVisibleDiscoverDeck) {
		          setDiscoverStatus("error");
		          setDiscoverLoadSettled(true);
		          setDiscoverSettledKey(loadKey);
		        }
        logNativeProtectedActionFailure("[native.chats] discover_load_failed", error);
	      } finally {
        if (loadRowsGateRef.current.key === loadKey && inboxRequestSeqRef.current === requestSeq) {
          loadRowsGateRef.current.inFlight = false;
          if (!silent) setLoading(false);
          setRefreshing(false);
        }
      }
      return;
    }
    if (topTab === "community") {
      // Community = group exploration only. No inbox load; no mainTab/groupSubTab dependency.
      try {
        const groupsCacheKey = chatsExploreGroupsCacheKey(userId, viewerScopeKey);
        const cachedExplore = !force ? await readChatsCache<{ invited: NativeExploreGroup[]; groups: NativeExploreGroup[] }>(groupsCacheKey) : null;
        if (cachedExplore) {
          committedLoadKeysRef.current.add(loadKey);
          setExploreGroups(cachedExplore.groups.slice(0, CHATS_GROUP_EXPLORE_CACHE_LIMIT));
          setInvitedExploreGroups(cachedExplore.invited);
          if (!silent) setLoading(false);
        } else if (!silent) {
          setLoading(true);
        }
        const cachedJoinedGroupRows = rowsRef.current.filter((row) => row.roomType === "group");
        const cachedJoinedGroupIds = cachedJoinedGroupRows.map((row) => row.chatId);
        const exploreKey = `${userId}|${viewerScopeKey}|${cachedJoinedGroupIds.slice().sort().join(",")}`;
        const exploreGate = exploreLoadGateRef.current;
        if (force || exploreGate.key !== exploreKey || (!exploreGate.inFlight && Date.now() - exploreGate.lastStartedAt >= 5000)) {
          const exploreStartedAt = Date.now();
          exploreLoadGateRef.current = { key: exploreKey, inFlight: true, lastStartedAt: exploreStartedAt };
          const joinedGroupRowsPromise = fetchNativeChatInbox({
            userId,
            accessToken,
            sessionKey,
            scope: "groups",
            onlyWithActivity: null,
            limit: 80,
            force,
            forceDb: force,
          }).catch((error) => {
            logNativeProtectedActionFailure("[native.chats] community_inbox_enrichment_failed", error);
            return rowsRef.current.filter((row) => row.roomType === "group");
          });
          const joinedUpcomingEventsPromise = fetchNativeViewerUpcomingGroupEvents({ accessToken, limit: 80 }).catch(() => []);
          const explore = await fetchNativeExploreGroups({
            userId,
            accessToken,
            joinedGroupIds: cachedJoinedGroupIds,
            viewerScope,
            force,
            cacheWriteGuard: () => inboxRequestSeqRef.current === requestSeq && exploreLoadGateRef.current.key === exploreKey && exploreLoadGateRef.current.lastStartedAt === exploreStartedAt,
          });
          const joinedNextEventByChatId = new Map<string, GroupCoverNextEvent>();
          const allGroups = [...explore.invited, ...explore.groups].slice(0, CHATS_GROUP_EXPLORE_CACHE_LIMIT + explore.invited.length);
          const creatorIds = new Set(allGroups.map((group) => group.createdBy).filter((id): id is string => Boolean(id)));
          const distanceByCreator = new Map<string, number>();
          const withDistance = (group: NativeExploreGroup) => ({
            ...group,
            distanceKm: group.createdBy ? distanceByCreator.get(group.createdBy) ?? null : null,
          });
          const viewerExploreCountry = resolveGroupExploreCountryFromScope(viewerScope);
          let latestJoinedGroupRows = cachedJoinedGroupRows;
          const commitCommunityGroups = (joinedGroupRows: NativeChatInboxRow[]) => {
            if (inboxRequestSeqRef.current !== requestSeq || exploreLoadGateRef.current.key !== exploreKey || exploreLoadGateRef.current.lastStartedAt !== exploreStartedAt) return;
            latestJoinedGroupRows = joinedGroupRows;
            const nextGroups = mergeExploreGroups(joinedGroupRows, explore.groups, joinedNextEventByChatId)
              .map(withDistance)
              .filter((group) => groupMatchesViewerCountry(group, viewerExploreCountry))
              .slice(0, CHATS_GROUP_EXPLORE_CACHE_LIMIT);
            const nextInvited = explore.invited.map(withDistance);
            setExploreGroups(nextGroups);
            setInvitedExploreGroups(nextInvited);
            void writeChatsCache(groupsCacheKey, { invited: nextInvited, groups: nextGroups });
          };
          // Public groups paint without waiting for the joined-group inbox. A
          // successful inbox read enriches the same list when it arrives.
          commitCommunityGroups(cachedJoinedGroupRows);
          committedLoadKeysRef.current.add(loadKey);
          if (!silent) setLoading(false);
          void joinedGroupRowsPromise.then(commitCommunityGroups);
          void joinedUpcomingEventsPromise.then((events) => {
            for (const event of events) {
              joinedNextEventByChatId.set(event.chatId, { title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, rsvpCount: event.rsvpCount });
            }
            setCommunityNextEventByGroupId(new Map(joinedNextEventByChatId));
            commitCommunityGroups(latestJoinedGroupRows);
          });
          if (viewerGroupAnchor && creatorIds.size > 0) {
            void nativeExactTokenRpc(
              "get_service_provider_distances",
              { p_lat: viewerGroupAnchor.lat, p_lng: viewerGroupAnchor.lng },
              accessToken,
            ).then(({ data, error }) => {
              if (error) {
                logNativeProtectedActionFailure("[native.chats] group_distance_failed", error);
                return;
              }
              for (const row of (Array.isArray(data) ? data : []) as Array<{ user_id?: string; distance_km?: number | null }>) {
                const id = String(row.user_id || "");
                if (!creatorIds.has(id) || typeof row.distance_km !== "number" || !Number.isFinite(row.distance_km)) continue;
                distanceByCreator.set(id, row.distance_km);
              }
              commitCommunityGroups(latestJoinedGroupRows);
            });
          }
          if (inboxRequestSeqRef.current === requestSeq && exploreLoadGateRef.current.key === exploreKey && exploreLoadGateRef.current.lastStartedAt === exploreStartedAt) exploreLoadGateRef.current.inFlight = false;
        }
      } catch (error) {
        logNativeProtectedActionFailure("[native.chats] community_load_failed", error);
        if (loadRowsGateRef.current.key === loadKey && inboxRequestSeqRef.current === requestSeq && !silent) {
          setStatus("Community could not load. Pull to refresh.");
        }
      } finally {
        if (loadRowsGateRef.current.key === loadKey && inboxRequestSeqRef.current === requestSeq) {
          loadRowsGateRef.current.inFlight = false;
          if (!silent) setLoading(false);
          setRefreshing(false);
        }
      }
      return;
    }
    const inboxCacheKey = chatsInboxRowsCacheKey(userId, sessionKey, mainTab);
    const cacheSessionKey = sessionKey || `${userId}:0`;
    const cacheSurface = `native_chats:${mainTab}`;
    const cachedInbox = !force ? await readChatsInboxMirrorCache(inboxCacheKey, { sessionKey: cacheSessionKey, surface: cacheSurface, userId }) : null;

    if (loadRowsGateRef.current.key !== loadKey || inboxRequestSeqRef.current !== requestSeq) return;
    if (cachedInbox) {
      committedLoadKeysRef.current.add(loadKey);
      const hydratedRows = applyReadOverlay(cachedInbox.rows);
      commitInboxRows(mainTab, hydratedRows);
      setInboxSyncState("hydrating");
      setHasMoreRows(cachedInbox.hasMoreRows);
      setRowCursor(cachedInbox.rowCursor);
      setVisibleCount(INBOX_FIRST_PAGE);
    } else if (!silent && !hasVisibleRowsForInboxTab(mainTab, [...(inboxRowsByTabRef.current[mainTab] || []), ...rowsRef.current])) {
      setLoading(true);
    }

    setStatus(null);
    setInboxSyncState((current) => current === "fresh" || current === "error" ? "refreshing" : current);
    try {
      setVisibleCount(INBOX_FIRST_PAGE);
      const [baseRows, activeFriendRows] = await Promise.all([
        fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: scopeForTab(mainTab), onlyWithActivity: mainTab === "friends" ? false : null, limit: 80, force: force === true, forceDb: force === true }),
        mainTab === "friends" ? fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: "friends", onlyWithActivity: true, limit: INBOX_FIRST_PAGE, force: force === true, forceDb: force === true }) : Promise.resolve([] as NativeChatInboxRow[]),
      ]);
      const nextRows = mainTab === "friends"
        ? applyReadOverlay(dedupeDirectRowsByPeer([...baseRows, ...activeFriendRows]))
        : baseRows;
      const overlay = readOverlayRef.current;
      for (const row of nextRows) {
        if (overlay.has(row.chatId) && row.unreadCount === 0) overlay.delete(row.chatId);
      }
      const dbRows = applyReadOverlay(nextRows);
      if (loadRowsGateRef.current.key !== loadKey || inboxRequestSeqRef.current !== requestSeq) return;
      if (mainTab === "service") {
        const hasDialogues = dbRows.some(isCareInboxRow);
        setServiceTabHasDialogues(hasDialogues);
        void writeChatsCache(chatsServiceTabProbeCacheKey(userId, sessionKey), { hasDialogues });
        if (hasDialogues) void markNativeServiceTabHasDialogues(userId);
      }
      commitInboxRows(mainTab, dbRows);
      committedLoadKeysRef.current.add(loadKey);
      setInboxSyncState("fresh");
      const conversationRows = mainTab === "friends" ? dbRows.filter((row) => !isMatchedRailRow(row, activeMatchedPeerIdsRef.current)) : dbRows;
      const cursorSource = activeFriendRows.length > 0 ? activeFriendRows : conversationRows;
      const nextRowCursor = cursorSource[cursorSource.length - 1]?.activityTs || cursorSource[cursorSource.length - 1]?.lastMessageAt || null;
      const nextHasMoreRows = mainTab === "friends" && (activeFriendRows.length >= INBOX_FIRST_PAGE || conversationRows.length > INBOX_FIRST_PAGE);
      setRowCursor(nextRowCursor);
      setHasMoreRows(nextHasMoreRows);
      void writeChatsInboxMirrorCache(inboxCacheKey, {
        rows: dbRows.slice(0, 40),
        hasMoreRows: nextHasMoreRows,
        rowCursor: nextRowCursor,
      }, { dbConfirmedAt: Date.now(), sessionKey: cacheSessionKey, surface: cacheSurface, userId });
    } catch (error) {
        logNativeProtectedActionFailure("[native.chats] load_rows_failed", error);
      if (loadRowsGateRef.current.key === loadKey && inboxRequestSeqRef.current === requestSeq) {
        setInboxSyncState("error");
        if (!silent) setStatus("Failed to load conversations. Pull to refresh.");
      }
    } finally {
      if (loadRowsGateRef.current.key === loadKey && inboxRequestSeqRef.current === requestSeq) {
        loadRowsGateRef.current.inFlight = false;
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accessToken, activeChatsLoadKey, activeDiscoverDeckKey, applyReadOverlay, commitInboxRows, discoverAgeEligible, discoverLocationPermission.state, discoverLocationPermissionResolved, effectiveTier, filters, mainTab, sessionKey, topTab, userId, viewerGroupAnchor, viewerScope, viewerScopeKey, viewerScopeResolved]);

  const handleEnableFriendsMatching = useCallback(async () => {
    if (!userId || enablingFriendsMatching) return;
    setEnablingFriendsMatching(true);
    const previousPaused = friendsMatchingPaused;
    setFriendsMatchingPaused(false); // optimistic — overlay clears immediately
    try {
      await setNativeFriendsMatchingEnabled(userId, true, accessToken);
      haptic.success();
      void loadRows({ force: true }); // refresh the deck now that the viewer is discoverable
      const hintKey = `native-friends-matching-resume-hint:v1:${userId}`;
      const shown = await readNativeDisplayCacheItem(hintKey);
      if (!shown) {
        setResumeMatchingHintOpen(true);
        void AsyncStorage.setItem(hintKey, "1").catch(() => undefined);
      }
    } catch {
      setFriendsMatchingPaused(previousPaused); // revert on failure
      setStatus("Couldn't enable Friends Matching. Please try again.");
    } finally {
      setEnablingFriendsMatching(false);
    }
  }, [accessToken, enablingFriendsMatching, friendsMatchingPaused, loadRows, userId]);

  useEffect(() => {
    if (!active || !userId) return;
    if (committedLoadKeysRef.current.has(activeChatsLoadKey)) return;
    void loadRows();
  }, [active, activeChatsLoadKey, loadRows, userId]);

  const resetExpiredDiscoveryCycle = useCallback(() => {
    if (!userId) return;
    const emptyPassedIds = new Set<string>();
    passedDiscoveryIdsRef.current = emptyPassedIds;
    setPassedDiscoveryIds(emptyPassedIds);
    setDiscoveryCycleStartedAt(null);
    setDiscoverySeenToday(0);
    void AsyncStorage.removeItem(nativeDiscoveryPassedCycleStorageKey(userId));
    void AsyncStorage.removeItem(nativeDiscoveryCycleStartedAtStorageKey(userId));
    void loadRows({ force: true, silent: true });
  }, [loadRows, userId]);

  useEffect(() => {
    if (!active || !userId || discoverAgeEligible !== true || !discoveryCycleStartedAt) return;
    const startedAtMs = Date.parse(discoveryCycleStartedAt);
    if (!Number.isFinite(startedAtMs)) {
      resetExpiredDiscoveryCycle();
      return;
    }
    const remainingMs = startedAtMs + 24 * 60 * 60 * 1000 - Date.now();
    if (remainingMs <= 0) {
      resetExpiredDiscoveryCycle();
      return;
    }
    const timer = setTimeout(resetExpiredDiscoveryCycle, remainingMs);
    return () => clearTimeout(timer);
  }, [active, discoverAgeEligible, discoveryCycleStartedAt, resetExpiredDiscoveryCycle, userId]);

  useEffect(() => {
    if (!active || !userId || discoverAgeEligible !== true) return;
    const refreshCycleState = () => {
      void nativeExactTokenRpc("get_discovery_cycle_state", {}, accessToken).then(({ data, error }) => {
        if (error) return;
        const state = data && typeof data === "object" ? data as { cycle_started_at?: unknown; waves_used?: unknown } : {};
        if (typeof state.cycle_started_at !== "string" || !nativeDiscoveryCycleIsActive(state.cycle_started_at)) {
          if (discoveryCycleStartedAt) resetExpiredDiscoveryCycle();
          return;
        }
        setDiscoveryCycleStartedAt(state.cycle_started_at);
        void AsyncStorage.setItem(nativeDiscoveryCycleStartedAtStorageKey(userId), state.cycle_started_at);
        setDiscoverySeenToday(Math.max(0, Number(state.waves_used || 0) || 0));
      });
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshCycleState();
    });
    return () => subscription.remove();
  }, [accessToken, active, discoverAgeEligible, discoveryCycleStartedAt, resetExpiredDiscoveryCycle, userId]);

  useEffect(() => {
    const becameActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      Keyboard.dismiss();
      setFilterOpen(false);
      setGroupExploreSortOpen(false);
      setPremiumTier(null);
      setStarsExhaustedOpen(false);
      setResumeMatchingHintOpen(false);
      setConfirmStarTarget(null);
      setMatchModal(null);
      setProfileSheetUserId(null);
      setCarerProfileOpen(false);
      setInviteInboxOpen(false);
      setPendingGroupInvitePrompt(null);
      setGroupDetails(null);
      setGroupManagement(null);
      setGroupMemberReportTarget(null);
      setPendingDeleteRow(null);
      setCreateGroupOpen(false);
      setJoinCodeOpen(false);
      return;
    }
    if (!becameActive || !userId) return;
    // Keep all three mounted panes exactly as the user left them. Realtime
    // updates, mutations and explicit refresh own reconciliation.
  }, [active, userId]);

  useEffect(() => {
    if (topTab !== "discover" && topTab !== "community") return;
    let active = true;
    let scopeRefreshInFlight = false;
    const refreshScope = async (detail: NativeLocationPermissionDetail) => {
      if (!userId || scopeRefreshInFlight) return;
      scopeRefreshInFlight = true;
      try {
        // A transient failure here (RPC timeout, token mid-refresh right as the app
        // foregrounds — both routine on an AppState "active" event) must not blank a
        // scope that already resolved successfully. Losing it changes viewerScopeKey,
        // which re-fires the Discover load with no lat/lng and no country and reads
        // as "location_required" -- even though the OS permission is still granted --
        // and the deck silently vanishes with no explanation and no cover shown, since
        // the cover only renders for an actually denied permission. So: apply the new
        // scope only on success; on failure, keep whatever scope is already resolved.
        let scope: NativeViewerScope | null = null;
        let resolved = true;
        try {
          scope = await resolveNativeViewerScope({ userId, accessToken, sessionKey, force: true });
        } catch {
          resolved = false;
        }
        if (active) {
          const gainedLocation = discoverLocationPermissionResolved
            && discoverLocationPermissionStateRef.current !== "granted"
            && detail.state === "granted";
          discoverLocationPermissionStateRef.current = detail.state;
          if (resolved) {
            if (gainedLocation) {
              stableDiscoverTopCardRef.current = null;
              setDiscoverProfiles([]);
              setDiscoverLoadSettled(false);
              setDiscoverSettledKey(null);
            }
            applyResolvedViewerScope(scope);
          }
          setDiscoverLocationPermission(detail);
          setDiscoverLocationPermissionResolved(true);
          setViewerScopeResolved((current) => current || resolved);
        }
      } finally {
        scopeRefreshInFlight = false;
      }
    };
    const applyPermission = (detail: NativeLocationPermissionDetail) => {
      if (!active) return;
      setDiscoverLocationPermission(detail);
    };
    const unsubscribePermission = subscribeNativeLocationPermissionDetail(applyPermission);
    void getNativeForegroundLocationPermissionDetail().then((detail) => refreshScope(detail)).catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void getNativeForegroundLocationPermissionDetail().then((detail) => refreshScope(detail)).catch(() => undefined);
    });
    return () => {
      active = false;
      unsubscribePermission();
      subscription.remove();
    };
  }, [accessToken, applyResolvedViewerScope, discoverLocationPermissionResolved, sessionKey, topTab, userId]);

  // Refill only the unseen tail. The committed prefix remains immutable, so this
  // cannot repaint the visible card or disturb an active swipe.
  const discoverTailRefillKeyRef = useRef("");
  useEffect(() => {
    if (topTab !== "discover" || discoverAgeEligible !== true) {
      discoverTailRefillKeyRef.current = "";
      return;
    }
    if (!shouldRefillNativeDiscoveryTail({ deckLength: discoverProfiles.length, loadSettled: discoverLoadSettled, loading, visible: true })) return;
    const refillKey = nativeDiscoveryTailRefillAttemptKey(discoveryCycleStartedAt, discoverProfiles.map((profile) => profile.id));
    if (discoverTailRefillKeyRef.current === refillKey) return;
    discoverTailRefillKeyRef.current = refillKey;
    void loadRows({ force: true, silent: true });
  }, [discoverAgeEligible, discoverLoadSettled, discoverProfiles, discoveryCycleStartedAt, loadRows, loading, topTab]);

  const handleDiscoverEnableLocation = useCallback(async () => {
    if (discoverLocationPermission.canAskAgain) {
      const detail = await requestNativeForegroundLocationPermissionDetail();
      const gainedLocation = discoverLocationPermissionResolved
        && discoverLocationPermissionStateRef.current !== "granted"
        && detail.state === "granted";
      discoverLocationPermissionStateRef.current = detail.state;
      if (gainedLocation) {
        stableDiscoverTopCardRef.current = null;
        setDiscoverProfiles([]);
        setDiscoverLoadSettled(false);
        setDiscoverSettledKey(null);
      }
      setDiscoverLocationPermission(detail);
      setDiscoverLocationPermissionResolved(true);
      // Same rule as the AppState refresh above: a resolve failure must not blank an
      // already-good scope, or the deck goes dark with the permission still granted.
      try {
        const scope = await resolveNativeViewerScope({ userId, accessToken, sessionKey, force: true });
        applyResolvedViewerScope(scope);
        setViewerScopeResolved(true);
      } catch {
        // Leave any already-resolved scope in place; a bare permission grant with no
        // prior scope still lets the effect above retry rather than hanging silently.
      }
      return;
    }
    await openNativeAppSettings();
  }, [accessToken, applyResolvedViewerScope, discoverLocationPermission.canAskAgain, discoverLocationPermissionResolved, sessionKey, userId]);

  const refreshInboxRowsByChatIds = useCallback(async (chatIds: string[]) => {
    if (!userId || chatIds.length === 0) return false;
    const uniqueChatIds = Array.from(new Set(chatIds.map((id) => String(id || "").trim()).filter(Boolean)));
    if (uniqueChatIds.length === 0) return false;
    try {
      const freshRows = await fetchNativeChatInbox({
        userId,
        accessToken,
        sessionKey,
        scope: "all",
        onlyWithActivity: null,
        limit: Math.max(uniqueChatIds.length, INBOX_FIRST_PAGE),
        chatIds: uniqueChatIds,
        force: true,
        forceDb: true,
      });
      if (freshRows.length === 0) return false;
      const touchedTabs = new Set<Exclude<NativeChatsTab, "discover">>();
      for (const row of freshRows) {
        const tab: Exclude<NativeChatsTab, "discover"> = isCareInboxRow(row)
          ? "service"
          : row.roomType === "group"
            ? "groups"
            : "friends";
        touchedTabs.add(tab);
        const existing = inboxRowsByTabRef.current[tab] || [];
        const byId = new Map(existing.map((item) => [item.chatId, item]));
        byId.set(row.chatId, row);
        const nextRows = Array.from(byId.values()).sort((a, b) => {
          const bTime = Date.parse(b.activityTs || b.lastMessageAt || "");
          const aTime = Date.parse(a.activityTs || a.lastMessageAt || "");
          return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
        });
        inboxRowsByTabRef.current[tab] = nextRows;
        const cacheSessionKey = sessionKey || `${userId}:0`;
        void writeChatsInboxMirrorCache(
          chatsInboxRowsCacheKey(userId, sessionKey, tab),
          { rows: nextRows.slice(0, 40), hasMoreRows: tab === "friends" && nextRows.length > INBOX_FIRST_PAGE, rowCursor: nextRows[nextRows.length - 1]?.activityTs || nextRows[nextRows.length - 1]?.lastMessageAt || null },
          { dbConfirmedAt: Date.now(), sessionKey: cacheSessionKey, surface: `native_chats:${tab}`, userId },
        );
      }
      if (touchedTabs.has("service")) {
        const serviceRows = inboxRowsByTabRef.current.service || [];
        const hasDialogues = serviceRows.some(isCareInboxRow);
        setServiceTabHasDialogues(hasDialogues);
        void writeChatsCache(chatsServiceTabProbeCacheKey(userId, sessionKey), { hasDialogues });
        if (hasDialogues) void markNativeServiceTabHasDialogues(userId);
      }
      const activeTab = mainTabRef.current;
      if (topTabRef.current === "chats" && touchedTabs.has(activeTab)) {
        const nextRows = applyReadOverlay(inboxRowsByTabRef.current[activeTab] || []);
        commitInboxRows(activeTab, nextRows);
        setInboxSyncState("fresh");
        setLoading(false);
      }
      return true;
    } catch (error) {
        logNativeProtectedActionFailure("[native.chats] targeted_inbox_refresh_failed", error);
      return false;
    }
  }, [accessToken, applyReadOverlay, commitInboxRows, sessionKey, userId]);

  useEffect(() => {
    if (!userId) return;
    const refresh = (payload?: unknown, options?: { fullFallback?: boolean }) => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void invalidateNativeChatReadCaches(userId);
        void refreshUnreadTotal();
        if (options?.fullFallback) void loadRows({ force: true, silent: true });
      }, 450);
    };
    const channelName = `native-chats-realtime-${userId}`;
    const handle = createSinglePrivateBroadcastChannel(
      channelName,
      `user:${userId}:inbox`,
      (payload) => refresh(payload, { fullFallback: true }),
      (status) => { if (status === "SUBSCRIBED") refresh(undefined, { fullFallback: true }); },
    );
    const filteredHandle = createSingleRealtimeChannel(`${channelName}:filtered`, (channel) => channel
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `requester_id=eq.${userId}` }, (payload) => refresh(payload, { fullFallback: true }))
        .on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `provider_id=eq.${userId}` }, (payload) => refresh(payload, { fullFallback: true }))
        .on("postgres_changes", { event: "*", schema: "public", table: "group_chat_invites", filter: `invitee_user_id=eq.${userId}` }, (payload) => refresh(payload, { fullFallback: true })));
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      void handle.dispose();
      void filteredHandle.dispose();
    };
  }, [loadRows, refreshUnreadTotal, userId]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setContactFriendRequestsRefreshKey((current) => current + 1);
    void loadRows({ force: true, silent: true });
  }, [loadRows]);

  useEffect(() => {
    if (!userId || topTab !== "chats") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // Resubscription/realtime events will patch changed rows. Foregrounding
        // alone must not discard or reload a committed inbox.
      }
    });
    return () => subscription.remove();
  }, [topTab, userId]);

  const handleTopTabPress = useCallback((tab: NativeChatsTopTab) => {
    haptic.selectTab();
    setTopTab(tab);
    setStatus(null);
  }, []);

  // Bottom edge-swipe: flick left/right on the lower screen strip to cycle Discover → Community → Chats.
  // Stops at the ends (no wrap). Vertical motion and taps pass through unchanged.
  const cycleTopTab = useCallback((direction: 1 | -1) => {
    const order: NativeChatsTopTab[] = discoverAgeEligible === false ? ["community", "chats"] : ["discover", "community", "chats"];
    const currentIndex = order.indexOf(topTab);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    haptic.selectTab();
    setTopTab(order[nextIndex]);
    setStatus(null);
  }, [discoverAgeEligible, topTab]);
  const cycleTopTabRef = useRef(cycleTopTab);
  useEffect(() => { cycleTopTabRef.current = cycleTopTab; }, [cycleTopTab]);
  // JS-side bridge so the gesture worklet can dispatch via runOnJS without recreating each render.
  const dispatchTabCycle = useCallback((direction: 1 | -1) => {
    cycleTopTabRef.current(direction);
  }, []);
  // RNGH Pan handles horizontal/vertical disambiguation properly (failOffsetY releases the gesture
  // for vertical motion so ScrollView still scrolls). activeOffsetX requires a committed horizontal
  // pan before claiming, so taps in the strip are inert.
  const bottomSwipeGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetX([-20, 20])
      .failOffsetY([-15, 15])
      .onEnd((event) => {
        "worklet";
        const SWIPE_COMMIT = 48;
        if (event.translationX <= -SWIPE_COMMIT) runOnJS(dispatchTabCycle)(1);
        else if (event.translationX >= SWIPE_COMMIT) runOnJS(dispatchTabCycle)(-1);
      }),
    [dispatchTabCycle],
  );

  // ── Tab container opacity (always-mounted three-pane layout) ─────────────────────────
  // Three Reanimated.Views stay mounted at all times; only the active one has opacity 1.
  // 100ms crossfade prevents the hard-cut flicker between tabs.
  const discoverTabOpacity = useSharedValue(topTab === "discover" ? 1 : 0);
  const communityTabOpacity = useSharedValue(topTab === "community" ? 1 : 0);
  const chatsTabOpacity = useSharedValue(topTab === "chats" ? 1 : 0);
  useEffect(() => {
    // Only the incoming tab fades in; outgoing tabs hide instantly. A cross-fade left
    // two full-screen tab contents visible at once mid-transition (e.g. the chats empty
    // state ghosting over the Discover deck).
    discoverTabOpacity.value = topTab === "discover" ? withTiming(1, { duration: 140 }) : 0;
    communityTabOpacity.value = topTab === "community" ? withTiming(1, { duration: 140 }) : 0;
    chatsTabOpacity.value = topTab === "chats" ? withTiming(1, { duration: 140 }) : 0;
  }, [topTab, discoverTabOpacity, communityTabOpacity, chatsTabOpacity]);
  const discoverTabStyle = useAnimatedStyle(() => ({ opacity: discoverTabOpacity.value }));
  const communityTabStyle = useAnimatedStyle(() => ({ opacity: communityTabOpacity.value }));
  const chatsTabStyle = useAnimatedStyle(() => ({ opacity: chatsTabOpacity.value }));

  const hydrateMainTabFromPersistentCache = useCallback(async (tab: Exclude<NativeChatsTab, "discover">) => {
    if (!userId) return;
    const cacheSessionKey = sessionKey || `${userId}:0`;
    const cachedInbox = await readChatsInboxMirrorCache(
      chatsInboxRowsCacheKey(userId, sessionKey, tab),
      { sessionKey: cacheSessionKey, surface: `native_chats:${tab}`, userId },
    );
    if (!cachedInbox) return;
    if (topTabRef.current !== "chats" || mainTabRef.current !== tab) return;
    const hydratedRows = applyReadOverlay(cachedInbox.rows);
    commitInboxRows(tab, hydratedRows);
    setHasMoreRows(cachedInbox.hasMoreRows);
    setRowCursor(cachedInbox.rowCursor);
    setVisibleCount(INBOX_FIRST_PAGE);
    setInboxSyncState("hydrating");
    setLoading(false);
  }, [applyReadOverlay, commitInboxRows, sessionKey, userId]);

  const activateMainTab = useCallback((tab: Exclude<NativeChatsTab, "discover">, options?: { haptic?: boolean }) => {
    const resolvedTab = tab === "service" && !careMarketIsActive ? "friends" : tab;
    if (options?.haptic) haptic.selectTab();
    mainTabRef.current = resolvedTab;
    writeNativeChatsLastTabHandoff({ sessionKey, tab: resolvedTab, userId });
    setSearchQuery("");
    setSearchResultRows(null);
    const hasMemoryRowsForTab = Object.prototype.hasOwnProperty.call(inboxRowsByTabRef.current, resolvedTab);
    const memoryRows = inboxRowsByTabRef.current[resolvedTab] || [];
    if (hasMemoryRowsForTab) {
      const hydratedRows = applyReadOverlay(memoryRows);
      setRows(hydratedRows);
      setInboxSyncState("fresh");
      setLoading(false);
    } else {
      // No cached rows for this tab yet (e.g. route-driven return from a Care chat
      // on a fresh mount). Do not leave the previous tab's rows mounted under the
      // new tab filter: that renders as a blank pane until the DB read returns.
      setInboxSyncState((current) => (current === "fresh" || current === "error" || current === "idle" ? "hydrating" : current));
      setLoading(true);
      void hydrateMainTabFromPersistentCache(resolvedTab);
    }
    setMainTab(resolvedTab);
    setStatus(null);
  }, [applyReadOverlay, careMarketIsActive, hydrateMainTabFromPersistentCache, sessionKey, userId]);

  useEffect(() => {
    const requestedTopTab = parseInitialTopTab(search);
    const nextTopTab = requestedTopTab === "discover" && discoverAgeEligible === false ? "chats" : requestedTopTab;
    topTabRef.current = nextTopTab;
    setTopTab(nextTopTab);
    activateMainTab(parseInitialMainTab(search));
    setRouteGroupDetailId(parseInitialGroupDetailId(search));
    setRouteServiceRoomId(parseInitialServiceRoomId(search));
    const joinCode = parseInitialJoinCode(search);
    if (joinCode) {
      setGroupCodeDraft(joinCode);
      setJoinCodeOpen(true);
    }
  }, [activateMainTab, discoverAgeEligible, search]);

  const handleMainTabPress = useCallback((tab: Exclude<NativeChatsTab, "discover">) => {
    activateMainTab(tab, { haptic: true });
  }, [activateMainTab]);

  const handleOpenRow = useCallback((row: NativeChatInboxRow) => {
    haptic.toggleControl();

    const roomId = String(row.chatId || "").trim();
    writeNativeChatsInboxHandoff({ rows: visibleRows.length > 0 ? visibleRows : rowsRef.current, sessionKey, tab: mainTab, userId });
    writeNativeChatSelectedRowHandoff({ row, sessionKey, userId });
    const name = displayName(row);
    const unreadParam = `&unread=${Math.max(0, row.unreadCount)}`;

    if (row.roomType === "group") {
      if (!roomId) {
        setStatus("Unable to open conversation right now.");
        return;
      }
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}&joined=1${unreadParam}`, "/chats?tab=groups"));
      return;
    }

    void resolveNativeChatInboxRowNavigation(row, (targetUserId, targetName) => ensureNativeDirectChatRoom(targetUserId, targetName, { accessToken, actorId: userId })).then((path) => {
      onNavigate(path);
    }).catch((error: unknown) => {
      const detail = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
      setStatus(detail ? `Unable to open conversation right now: ${detail}` : "Unable to open conversation right now.");
    });
  }, [accessToken, mainTab, onNavigate, sessionKey, userId, visibleRows]);

  const openCarerProfile = useCallback(async (providerUserId: string) => {
    if (!userId) return;
    haptic.toggleControl();
    setCarerProfileOpen(true);
    setCarerProfileLoading(true);
    setCarerProfileError("");
    setCarerProfile(null);
    try {
      const provider = await fetchNativeServiceProviderDetail({ userId, accessToken, sessionKey, providerUserId, force: true });
      setCarerProfile(provider);
      void incrementNativeServiceProviderView(providerUserId, userId, { accessToken, sessionKey }).catch(() => undefined);
    } catch {
      setCarerProfileError("Unable to load provider profile.");
    } finally {
      setCarerProfileLoading(false);
    }
  }, [accessToken, sessionKey, userId]);

  const handleAvatarProfilePress = useCallback((row: NativeChatInboxRow) => {
    if (!row.peerUserId) return;
    if (isNativeTeamHuddleIdentity(displayName(row), row.peerSocialId)) return;
    haptic.toggleControl();
    setProfileSheetFallbackData({
      id: row.peerUserId,
      display_name: displayName(row),
      avatar_url: row.peerAvatarUrl || row.avatarUrl,
      is_verified: row.peerIsVerified,
      social_id: row.peerSocialId,
      availability_status: row.peerAvailabilityLabel ? [row.peerAvailabilityLabel] : [],
      updated_at: row.activityTs || row.lastMessageAt,
      last_active_at: row.activityTs || row.lastMessageAt,
    });
    setProfileSheetSource("other");
    setProfileSheetUserId(row.peerUserId);
  }, []);

  const handleSearchRecent = useCallback(async () => {
    if (!userId) return;
    if (searchQuery.trim().length < 2) {
      setSearchResultRows(null);
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const nextRows = await searchNativeChatInbox(searchQuery, { userId, accessToken });
      setSearchResultRows(dedupeDirectRowsByPeer(nextRows).filter((row) => {
        if (mainTab === "groups") return row.roomType === "group";
        if (mainTab === "service") return isCareInboxRow(row);
        return row.roomType !== "group" && !isCareInboxRow(row);
      }));
    } catch {
      setStatus("Search is not available right now.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, mainTab, searchQuery, userId]);

  const handleLoadMore = useCallback(async () => {
    if (!userId) return;
    if (searchResultRows) return;
    if (loadMoreRowsRef.current) return;
    loadMoreRowsRef.current = true;
    if (mainTab !== "friends") {
      setVisibleCount((count) => count + INBOX_NEXT_PAGE);
      loadMoreRowsRef.current = false;
      return;
    }
    try {
      const requestSessionKey = sessionKey || `${userId}:0`;
      const nextRows = await fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: "friends", onlyWithActivity: true, limit: INBOX_NEXT_PAGE, cursor: rowCursor, force: true, forceDb: true });
      if (chatSessionKeyRef.current !== requestSessionKey) return;
      if (nextRows.length === 0) {
        setHasMoreRows(false);
        return;
      }
      setRows((current) => {
        const seen = new Set(current.map((row) => row.chatId));
        return dedupeDirectRowsByPeer([...current, ...nextRows.filter((row) => !seen.has(row.chatId))]);
      });
      setRowCursor(nextRows[nextRows.length - 1]?.activityTs || nextRows[nextRows.length - 1]?.lastMessageAt || rowCursor);
      setHasMoreRows(nextRows.length >= INBOX_NEXT_PAGE);
      setVisibleCount((count) => count + INBOX_NEXT_PAGE);
    } catch {
      setStatus("Unable to load more conversations.");
    } finally {
      loadMoreRowsRef.current = false;
    }
  }, [accessToken, mainTab, rowCursor, searchResultRows, sessionKey, userId]);

  const handleChatsScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceToBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    if (distanceToBottom > 180) return;
    if (mainTab === "service" || searchResultRows) return;
    const hasHiddenLocalRows = mainTab === "friends" ? friendsConversationRowCount > visibleRows.length : rows.length > visibleRows.length;
    if (!hasMoreRows && !hasHiddenLocalRows) return;
    void handleLoadMore();
  }, [friendsConversationRowCount, handleLoadMore, hasMoreRows, mainTab, rows.length, searchResultRows, visibleRows.length]);

  const openExploreGroup = useCallback((group: NativeExploreGroup) => {
    if (group.joined) {
      const row = buildCreatedGroupInboxRow({
        avatarUrl: group.avatarUrl,
        chatId: group.id,
        createdAt: group.createdAt || new Date().toISOString(),
        createdBy: group.createdBy || "",
        description: group.description,
        joinMethod: group.joinMethod === "instant" ? "instant" : "request",
        locationCountry: group.locationCountry,
        locationLabel: group.locationLabel,
        memberCount: group.memberCount,
        name: group.name,
        petFocus: group.petFocus,
        visibility: group.visibility === "private" ? "private" : "public",
      });
      setGroupDetails(row);
      setGroupNameEdit(row.chatName || "Group");
      setGroupLocationEdit(row.locationLabel || "");
      setGroupPetFocusEdit(row.petFocus || []);
      setGroupDescriptionEdit(row.description || "");
      setGroupDetailsErrors({});
      return;
    }
    setGroupDetails(group);
    setGroupNameEdit(group.name || "");
    setGroupLocationEdit(group.locationLabel || "");
    setGroupPetFocusEdit(group.petFocus || []);
    setGroupDescriptionEdit(group.description || "");
    setGroupDetailsErrors({});
  }, []);

  const openExploreGroupOrInvitePrompt = useCallback((group: NativeExploreGroup) => {
    if (group.invitePending) {
      setPendingGroupInvitePrompt(group);
      return;
    }
    openExploreGroup(group);
  }, [openExploreGroup]);

  const openManagedGroup = useCallback((row: NativeChatInboxRow) => {
    setGroupDetails(row);
    setGroupNameEdit(row.chatName || "Group");
    setGroupLocationEdit(row.locationLabel || "");
    setGroupPetFocusEdit(row.petFocus || []);
    setGroupDescriptionEdit(row.description || "");
    setGroupDetailsErrors({});
  }, []);

  const closeGroupDetails = useCallback(() => {
    if (groupDetails && "invitePending" in groupDetails) {
      // Invite-pending flows originate from Community (Group Explore).
      // Return there without mutating Chats mainTab.
      setTopTab("community");
    }
    setGroupDetails(null);
    setGroupNameEdit("");
    setGroupLocationEdit("");
    setGroupPetFocusEdit([]);
    setGroupDetailsErrors({});
  }, [groupDetails]);

  useEffect(() => {
    if (!routeGroupDetailId || loading) return;
    let cancelled = false;
    const target = rows.find((row) => row.chatId === routeGroupDetailId && row.roomType === "group");
    if (target) {
      openManagedGroup(target);
      setRouteGroupDetailId(null);
      return;
    }
    const exploreTarget = [...invitedExploreGroups, ...exploreGroups].find((group) => group.id === routeGroupDetailId);
    if (exploreTarget) {
      communityScrollRef.current?.scrollTo({ y: 0, animated: false });
      openExploreGroupOrInvitePrompt(exploreTarget);
      setRouteGroupDetailId(null);
      return;
    }
    void (async () => {
      const room = await fetchNativeChatRoom(routeGroupDetailId, { accessToken }).catch(() => null);
      if (cancelled || !room || room.type !== "group") return;
      const fallbackRow: NativeChatInboxRow = {
        activityTs: room.lastMessageAt || room.updatedAt || room.createdAt,
        avatarUrl: room.avatarUrl,
        blockedByMe: false,
        blockedByThem: false,
        chatId: room.id,
        chatName: room.name,
        createdAt: room.createdAt,
        createdBy: room.createdBy,
        description: room.description,
        joinMethod: room.joinMethod,
        lastMessageAt: room.lastMessageAt,
        lastMessageContent: null,
        lastMessageId: null,
        lastMessageReadByOther: false,
        lastMessageSenderId: null,
        lastMessageSenderName: null,
        matchedAt: null,
        locationCountry: room.locationCountry,
        locationLabel: room.locationLabel,
        memberCount: 0,
        unmatchedByMe: false,
        unmatchedByThem: false,
        petFocus: room.petFocus,
        peerAvatarUrl: null,
        peerAvailabilityLabel: null,
        peerHasCar: false,
        peerIsVerified: false,
        peerName: null,
        peerSocialId: null,
        peerUserId: null,
        roomCode: room.roomCode,
        roomType: "group",
        serviceProviderId: null,
        serviceRequestCard: null,
        serviceRequesterId: null,
        serviceStatus: null,
        shapeIssue: null,
        unreadCount: 0,
        visibility: room.visibility,
      };
      openManagedGroup(fallbackRow);
      setRouteGroupDetailId(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, exploreGroups, invitedExploreGroups, loading, openExploreGroupOrInvitePrompt, openManagedGroup, routeGroupDetailId, rows]);

  const openGroupMemberProfile = useCallback((memberId: string) => {
    if (groupDetails && "invitePending" in groupDetails) {
      // Invite-pending flows originate from Community (Group Explore).
      setTopTab("community");
    }
    setGroupDetails(null);
    setProfileSheetFallbackData(null);
    setProfileSheetSource("other");
    setProfileSheetUserId(memberId);
  }, [groupDetails]);

  useEffect(() => {
    const chatId = groupDetails ? "chatId" in groupDetails ? groupDetails.chatId : groupDetails.id : null;
    if (!chatId) {
      setGroupManagement(null);
      setGroupManagementLoading(false);
      setGroupManagementError(false);
      return;
    }
    let cancelled = false;
    setGroupManagement(null);
    setGroupManagementError(false);
    const isExplore = Boolean(groupDetails && "invitePending" in groupDetails);
    const cacheKey = userId ? chatsGroupDetailsCacheKey(userId, chatId, isExplore) : null;

    void (async () => {
      const cached = cacheKey ? await readChatsCache<NativeGroupManagementSnapshot>(cacheKey) : null;
      if (cancelled) return;

      if (cached) {
        setGroupManagement(cached);
        setGroupManagementLoading(false);
        setGroupManagementError(false);
      }

      setGroupManagementLoading(true);

      const snapshot = isExplore
        ? { members: await fetchNativeGroupPreviewMembers(chatId, { accessToken }), joinRequests: [], pendingInvites: [], mediaUrls: [] }
        : await fetchNativeGroupManagementSnapshot(chatId, { accessToken });

      if (cancelled) return;
      setGroupManagement(snapshot);
      setGroupManagementError(false);
      if (cacheKey) void writeChatsCache(cacheKey, snapshot);
      setGroupManagementLoading(false);
    })().catch((error) => {
        logNativeProtectedActionFailure("[native.chats] group_details_members_failed", error);
      if (!cancelled) {
        setGroupManagement(null);
        setGroupManagementError(true);
        setGroupManagementLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [accessToken, groupDetails, userId]);

  const refreshGroupManagement = useCallback(async (chatId: string) => {
    try {
      const snapshot = await fetchNativeGroupManagementSnapshot(chatId, { accessToken });
      setGroupManagement(snapshot);
      if (userId) void writeChatsCache(chatsGroupDetailsCacheKey(userId, chatId, false), snapshot);
    } catch {
      setStatus("Unable to refresh group management.");
    }
  }, [accessToken, userId]);

  const handleJoinExploreGroup = useCallback(async (group: NativeExploreGroup) => {
    if (!userId) return;
    try {
      if (group.joined) {
        setGroupDetails(null);
        onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&joined=1`, "/chats?tab=groups"));
        return;
      }
      if (group.invitePending) {
        await acceptNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, accessToken });
        setInvitedExploreGroups((current) => current.filter((item) => item.id !== group.id));
        setDismissedInviteBannerIds((current) => { const next = new Set(current); next.add(group.inviteId || group.id); return next; });
        setPendingGroupInvitePrompt(null);
        setGroupDetails(null);
        haptic.success(); // CD5: confirm group join via invite
        await loadRows({ force: true, silent: true });
        onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&joined=1`, "/chats?tab=groups"));
        return;
      } else if (group.joinMethod === "instant") {
        await joinNativePublicGroup({ userId, chatId: group.id, accessToken, sessionKey });
        if (group.createdBy && group.createdBy !== userId) {
          void nativeExactTokenRpc("enqueue_native_group_joined_notification", {
            p_chat_id: group.id,
          }, accessToken).catch(() => undefined);
        }
        haptic.success(); // CD5: confirm instant join
      } else {
        await requestNativeGroupJoin({ userId, chatId: group.id, accessToken, sessionKey });
        setExploreGroups((current) => current.map((item) => item.id === group.id ? { ...item, requested: true } : item));
        setGroupDetails((current) => current && "invitePending" in current && current.id === group.id ? { ...current, requested: true } : current);
        setStatus("Request sent.");
        haptic.selectTab(); // CD5: lighter tick for "request sent" (pending)
        return;
      }
      setGroupDetails(null);
      await loadRows({ force: true, silent: true });
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&joined=1`, "/chats?tab=groups"));
    } catch {
      haptic.error();
      setStatus("Unable to join group right now.");
    }
  }, [accessToken, loadRows, onNavigate, sessionKey, userId]);

  const handleDeclineExploreInvite = useCallback(async (group: NativeExploreGroup) => {
    if (!userId) return;
    try {
      await declineNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, userId, accessToken, sessionKey });
      setInvitedExploreGroups((current) => current.filter((item) => item.id !== group.id));
      setGroupDetails(null);
      await loadRows({ force: true, silent: true });
    } catch {
      setStatus("Unable to decline invite right now.");
    }
  }, [accessToken, loadRows, sessionKey, userId]);

  const confirmInviteInboxDecisions = useCallback(async (decisions: Record<string, "accept" | "decline">) => {
    if (!userId) return;
    const entries = invitedExploreGroups.filter((group) => decisions[group.id]);
    if (!entries.length) return;
    for (const group of entries) {
      const decision = decisions[group.id];
      if (decision === "accept") {
        await acceptNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, accessToken });
      } else {
        await declineNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, userId, accessToken, sessionKey });
      }
    }
    setInviteInboxOpen(false);
    setGroupDetails(null);
    await loadRows({ force: true, silent: true });
  }, [accessToken, invitedExploreGroups, loadRows, sessionKey, userId]);

  const handleJoinCode = useCallback(async () => {
    if (!userId) return;
    try {
      const joined = await joinNativeGroupByCode({ userId, code: groupCodeDraft, accessToken, sessionKey });
      setJoinCodeOpen(false);
      setGroupCodeDraft("");
      await loadRows({ force: true, silent: true });
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(joined.chatId)}&name=${encodeURIComponent(joined.name)}&joined=1`, "/chats?tab=groups"));
    } catch {
      setStatus("Code not found or group could not be joined.");
    }
  }, [accessToken, groupCodeDraft, loadRows, onNavigate, sessionKey, userId]);

  const resetCreateGroupDrafts = useCallback(() => {
    setGroupNameDraft("");
    setGroupDescriptionDraft("");
    setGroupJoinMethodDraft("request");
    setGroupVisibilityDraft("public");
    setGroupLocationDraft("");
    setGroupPetFocusDraft([]);
    setGroupInviteIds([]);
    setGroupCoverDraft(null);
  }, []);

  const closeCreateGroupModal = useCallback(() => {
    setCreateGroupOpen(false);
    resetCreateGroupDrafts();
  }, [resetCreateGroupDrafts]);

  const handleCreateGroup = useCallback(async () => {
    if (!userId || groupCreating) return;
    if (!selfVerified) {
      setStatus("Get verified to start a group chat and coordinate your next local meetup.");
      return;
    }
    if (!groupNameDraft.trim()) {
      setStatus("Add a group name to continue.");
      return;
    }
    if (!groupLocationDraft.trim()) {
      setStatus("Add a group location to continue.");
      return;
    }
    if (!groupCoverDraft) {
      setStatus("Add a group cover photo to continue.");
      return;
    }
    if (!groupDescriptionDraft.trim()) {
      setStatus("Add a group description to continue.");
      return;
    }
    if (countWords(groupDescriptionDraft) > GROUP_DESCRIPTION_WORD_LIMIT) {
      setStatus(`Description must be ${GROUP_DESCRIPTION_WORD_LIMIT} words or fewer.`);
      return;
    }
    setGroupCreating(true);
    try {
      const created = await createNativeGroupChat({
        userId,
        name: groupNameDraft,
        description: groupDescriptionDraft,
        avatarUrl: null,
        joinMethod: groupJoinMethodDraft,
        visibility: groupVisibilityDraft,
        locationLabel: groupLocationDraft,
        locationCountry: groupCountryDraft,
        petFocus: groupPetFocusDraft,
	        inviteUserIds: groupInviteIds,
	        accessToken,
	        sessionKey,
	      });
      let avatarUrl: string | null = null;
      if (groupCoverDraft) {
        const uploadedCover = await uploadNativeGroupCover({ accessToken, asset: groupCoverDraft, chatId: created.chatId, userId });
        avatarUrl = uploadedCover.url;
        try {
          await updateNativeGroupChatMetadata({
            roomId: created.chatId,
            avatarUrl,
            updateAvatar: true,
            accessToken,
          });
        } catch (metadataError) {
          const cleanupResult = await requestNativeStorageCleanupResult("avatars", uploadedCover.objectName, "group_cover_metadata_update_failed", accessToken);
          throw createNativeProtectedActionError({
            ok: false,
            stage: "domain_save",
            originalError: metadataError,
            cleanupAttempted: true,
            cleanupResult,
          });
        }
	      }
	      setCreateGroupOpen(false);
	      resetCreateGroupDrafts();
      const createdAt = new Date().toISOString();
      const createdRow = buildCreatedGroupInboxRow({
        avatarUrl,
        chatId: created.chatId,
        createdAt,
        createdBy: userId,
        description: groupDescriptionDraft.trim() || null,
        joinMethod: groupJoinMethodDraft,
        locationCountry: groupCountryDraft,
        locationLabel: groupLocationDraft.trim() || null,
        name: created.name,
        petFocus: groupPetFocusDraft,
        visibility: groupVisibilityDraft,
      });
      setRows((current) => [createdRow, ...current.filter((row) => row.chatId !== created.chatId)]);
      if (groupVisibilityDraft === "public") {
        const joinedExploreGroup = nativeInboxGroupToExploreGroup(createdRow);
        setExploreGroups((current) => [joinedExploreGroup, ...current.filter((group) => group.id !== created.chatId)]);
      }
      void patchCachedNativeChatInboxGroupRows({
        chatId: created.chatId,
        fallbackRow: createdRow,
        patch: {
          avatarUrl,
          chatName: created.name,
        },
        sessionKey,
        userId,
      });
      void patchNativeChatsGroupCaches(userId, created.chatId, { avatarUrl, chatName: created.name, name: created.name }, groupVisibilityDraft === "public" ? nativeInboxGroupToExploreGroup(createdRow) : null);
      void fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: "groups", onlyWithActivity: null, limit: 80, force: true, forceDb: true })
        .then((nextRows) => setRows((current) => {
          const byId = new Map<string, NativeChatInboxRow>();
          [...nextRows, ...current].forEach((row) => byId.set(row.chatId, row));
          return Array.from(byId.values()).sort((left, right) => chatRowActivityValue(right) - chatRowActivityValue(left));
        }))
        .catch((error) => logNativeProtectedActionFailure("[native.chats] post_create_group_inbox_refresh_failed", error));
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(created.chatId)}&name=${encodeURIComponent(created.name)}&joined=1`, "/chats?tab=groups"));
    } catch (error) {
      logNativeProtectedActionFailure("[native.chats] create_group_failed", error);
      const message = error instanceof Error ? error.message : String(error || "");
      if (/file_too_large/i.test(message)) setStatus("That file's too big. Try a photo under 15MB.");
      else setStatus("Couldn't create group. Check the name and try again.");
    } finally {
      setGroupCreating(false);
    }
  }, [accessToken, groupCountryDraft, groupCoverDraft, groupCreating, groupDescriptionDraft, groupInviteIds, groupJoinMethodDraft, groupLocationDraft, groupNameDraft, groupPetFocusDraft, groupVisibilityDraft, onNavigate, resetCreateGroupDrafts, selfVerified, sessionKey, userId]);

  // Pick → crop in one tap, using the shared non-blocking picker (PHPicker needs
  // no permission grant), then hand straight to the 16:9 cover cropper.
  const pickGroupCover = useCallback(async () => {
    const picked = await pickNativeProfilePhoto({ soloAspect: "16:9" });
    const asset = picked?.asset;
    if (!asset?.uri || !asset.width || !asset.height) return;
    setGroupCoverCropTarget({
      asset: {
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        fileSize: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null,
        height: asset.height,
        width: asset.width,
      },
      target: "create",
    });
  }, []);

  const pickGroupEditCover = useCallback(async () => {
    const picked = await pickNativeProfilePhoto({ soloAspect: "16:9" });
    const asset = picked?.asset;
    if (!asset?.uri || !asset.width || !asset.height) return;
    setGroupDetailsErrors((current) => ({ ...current, cover: false }));
    setGroupCoverCropTarget({
      asset: {
        uri: asset.uri,
        fileName: asset.fileName ?? null,
        fileSize: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null,
        height: asset.height,
        width: asset.width,
      },
      target: "edit",
    });
  }, []);

  const editPendingGroupCover = useCallback((target: "create" | "edit", cover: PendingGroupCover | null) => {
    if (!cover?.uri || !cover.width || !cover.height) {
      setStatus("Pick a photo first, then edit it.");
      return;
    }
    setGroupCoverCropTarget({
      asset: {
        uri: cover.uri,
        fileName: cover.name,
        fileSize: cover.size,
        mimeType: cover.mime,
        height: cover.height,
        width: cover.width,
      },
      target,
    });
  }, []);

  const saveGroupCoverCrop = useCallback(async (asset: NativeProfileUploadAsset) => {
    if (!asset.uri || !groupCoverCropTarget) return;
    const croppedCover: PendingGroupCover = {
      uri: asset.uri,
      name: asset.fileName || `group-cover-${Date.now()}.jpg`,
      mime: asset.mimeType || "image/jpeg",
      size: asset.fileSize ?? null,
      height: 900,
      width: 1600,
    };
    if (groupCoverCropTarget.target === "edit") {
      setGroupEditCoverDraft(croppedCover);
      setGroupDetailsErrors((current) => ({ ...current, cover: false }));
    } else {
      setGroupCoverDraft(croppedCover);
    }
    setGroupCoverCropTarget(null);
  }, [groupCoverCropTarget]);

  const requestFilterTier = useCallback((tier: StarUpgradeTier) => {
    setFilterOpen(false);
    setFilterRow(null);
    setStatus(tier === "gold" ? "huddle＊ unlocks every Discover filter." : "huddle+ unlocks advanced filters.");
    setPremiumTier(tier);
  }, []);

  const markMatchSeenPersisted = useCallback(async (targetUserId?: string | null) => {
    const normalized = String(targetUserId || "").trim();
    if (!userId || !normalized) return;
    try {
      const [seenRaw, matchedRaw] = (await readNativeDisplayCacheItems([
        seenMatchesKey(userId),
        matchedDiscoveryKey(userId),
      ])).map((row) => row[1]);
      const seen = new Set(Array.isArray(JSON.parse(seenRaw || "[]")) ? JSON.parse(seenRaw || "[]") as string[] : []);
      const matched = new Set(Array.isArray(JSON.parse(matchedRaw || "[]")) ? JSON.parse(matchedRaw || "[]") as string[] : []);
      seen.add(normalized);
      matched.add(normalized);
      await Promise.all([
        AsyncStorage.setItem(seenMatchesKey(userId), JSON.stringify(Array.from(seen))),
        AsyncStorage.setItem(matchedDiscoveryKey(userId), JSON.stringify(Array.from(matched))),
      ]);
    } catch {
      // Local seen cache is best-effort; server write below is the durable source.
    }
    await nativeExactTokenRpc("mark_native_discover_match_seen", {
      p_matched_user_id: normalized,
    }, accessToken);
  }, [accessToken, userId]);

  const confirmDeleteConversation = useCallback(() => {
    if (!pendingDeleteRow) return;
    if (hasActiveTransaction(pendingDeleteRow)) {
      setStatus("Cannot remove conversations with active transactions.");
      setPendingDeleteRow(null);
      return;
    }
    const chatId = pendingDeleteRow.chatId;
	    void archiveNativeChatRoomForCurrentUser(chatId, { accessToken }).then(async () => {
      if (userId) await clearCachedNativeChatMessages(userId, chatId, { sessionKey });
      setRows((current) => current.filter((row) => row.chatId !== chatId));
      setStatus("Conversation removed.");
    }).catch(() => {
      setStatus("Unable to remove conversation right now.");
    });
    setPendingDeleteRow(null);
  }, [accessToken, pendingDeleteRow, sessionKey, userId]);

  const sendMatchQuickHello = useCallback(async () => {
    if (!matchModal || matchSending || !userId) return;
    setMatchSending(true);
    try {
      const targetUserId = matchModal.userId;
      const targetName = matchModal.name;
      const { data: roomData, error: roomError } = await nativeExactTokenRpc("send_match_first_message", {
        p_target_user_id: targetUserId,
        p_target_name: targetName,
        p_body: matchQuickHello.trim(),
      }, accessToken);
      if (roomError) throw roomError;
      const roomId = String(roomData || "").trim();
      if (!roomId) throw new Error("room_not_created");
      setMatchModal(null);
      setMatchQuickHello("");
      setMatchSending(false);
      void markMatchSeenPersisted(targetUserId);
      void markNativeChatRoomRead({ roomId, userId, accessToken, sessionKey }).catch((error) => logNativeProtectedActionFailure("[native.chats] match_quick_hello_mark_read_failed", error));
      void loadRows({ force: true, silent: true });
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(targetName)}&with=${encodeURIComponent(targetUserId)}`, "/chats?tab=friends"));
    } catch {
      setStatus("Unable to send hello right now.");
      setMatchSending(false);
    }
  }, [accessToken, loadRows, markMatchSeenPersisted, matchModal, matchQuickHello, matchSending, onNavigate, sessionKey, userId]);

  const closeMatchModal = useCallback(() => {
    if (matchModal?.userId) {
      void markMatchSeenPersisted(matchModal.userId);
      void loadRows({ force: true, silent: true });
    }
    setMatchModal(null);
    setMatchQuickHello("");
  }, [loadRows, markMatchSeenPersisted, matchModal?.userId]);

  const discoveryDailyCap = getQuotaCapsForTier(effectiveTier).discoveryViewsPerDay;
  const discoveryQuotaReached = discoveryDailyCap !== null && discoverySeenToday >= discoveryDailyCap;
  const discoveryQuotaCopy = quotaConfig.copy.discovery.exhausted[normalizeQuotaTier(effectiveTier)];
  const discoverLocationPermissionRequired = discoverLocationPermissionResolved && discoverLocationPermission.state === "denied";
  const discoverLocationPrivacyCoverVisible = discoverLocationPermissionRequired;
  // Top card + up to 3 queued cards below (4 total). When fewer profiles remain, the pile shrinks
  // naturally — no ghost/placeholder cards are inserted to pad the visual.
  const discoveryDeckProfiles = discoverProfiles.slice(0, 4);
  const currentDiscoveryProfile = discoveryDeckProfiles[0] ?? null;
  const nextDiscoveryProfile = discoveryDeckProfiles[1] ?? null;
  // Key the arming effect on the top card's id, not the profile object. Lazy canonical
  // hydration replaces that object a second or two after first paint without changing
  // which card is on top, and an object-identity dep re-ran this effect on every swap.
  const currentDiscoveryProfileId = currentDiscoveryProfile?.id ?? null;
  useEffect(() => {
    if (!active || discoverAgeEligible !== true || topTab !== "discover" || !currentDiscoveryProfileId || !discoveryGeometryReady || discoverLocationPrivacyCoverVisible || discoverStatus !== "ready") {
      setShowDiscoverCoachMarks(false);
      setDiscoverCoachMarkArmed(false);
      return undefined;
    }
    let cancelled = false;
    void isNativeCoachMarkSeen(userId, "discover_star_wave_swipe").then((seen) => {
      if (cancelled || discoverCoachMarksCompletedRef.current) return;
      // Arm only -- never force-hide from here. This effect re-runs whenever the top
      // card changes (including the user swiping to the next one), and hiding on
      // re-run dismissed an open sequence mid-read.
      setDiscoverCoachMarkArmed((armed) => armed || !seen);
    });
    return () => { cancelled = true; };
  }, [active, currentDiscoveryProfileId, discoverAgeEligible, discoverLocationPrivacyCoverVisible, discoverStatus, discoveryGeometryReady, topTab, userId]);

  const startDiscoverCoachMarks = useCallback(() => {
    if (!discoverCoachMarkArmed || showDiscoverCoachMarks) return false;
    setDiscoverCoachMarkArmed(false);
    setShowDiscoverCoachMarks(true);
    return true;
  }, [discoverCoachMarkArmed, showDiscoverCoachMarks]);
  // Keep the ScrollView's deck slot invariant while keyed cards exchange roles.
  // Without an explicit stage height, the final queued-to-top promotion can
  // briefly collapse the flow-owned child and let iOS adjust the scroll offset.
  const discoveryDeckStageHeight = discoveryCardMetrics(
    viewportWidth,
    viewportHeight,
    screenInsets.bottom,
    discoveryStackTopY,
  ).maxCardHeight + DISCOVERY_QUEUED_PEEK_DEPTH;
  useLayoutEffect(() => {
    // Normalize every promoted slot during React's commit phase, before the new
    // deck is painted. A normal effect runs after paint and exposes one frame of
    // the previous swipe geometry (wide card, then shrink), across every layer.
    discoverySwipeXSV.value = 0;
  }, [currentDiscoveryProfile?.id, discoverySwipeXSV]);
  useEffect(() => {
    // Only warm the cover + avatar for upcoming cards, not the full social album —
    // a card the user swipes past shouldn't have downloaded its whole photo set.
    const nextImageUris = discoverProfiles
      .slice(1, 4)
      .flatMap((profile) => [profile.coverUrl, profile.avatarUrl])
      .filter((uri): uri is string => Boolean(uri));
    Array.from(new Set(nextImageUris)).forEach((uri) => {
      void ExpoImage.prefetch(nativeFreshImageUri(uri, uri));
    });
  }, [discoverProfiles]);
  useEffect(() => {
    // Canonical-hydrate the queued cards the loader deliberately left masked, so a card
    // already carries its Bio / Pet Journey / Pack panel by the time a swipe promotes it
    // to the top. Hydrating while the card is still queued keeps the panel swap off-screen
    // — the exact reason the loader hydrates only the visible top card before first paint.
    if (!userId || discoverProfiles.length < 2) return;
    let cancelled = false;
    const queued = discoverProfiles.slice(1, 1 + DISCOVERY_QUEUED_HYDRATION_DEPTH).filter((profile) => (
      profile?.id &&
      !profile.canonicalProfileLoaded &&
      !discoveryDetailHydratedRef.current.has(profile.id) &&
      (discoveryDetailHydrationAttemptsRef.current.get(profile.id) ?? 0) < DISCOVERY_QUEUED_HYDRATION_MAX_ATTEMPTS
    ));
    queued.forEach((profile) => {
      discoveryDetailHydrationAttemptsRef.current.set(
        profile.id,
        (discoveryDetailHydrationAttemptsRef.current.get(profile.id) ?? 0) + 1,
      );
      void fetchNativePublicProfile({
        accessToken,
        fallbackData: discoveryProfileToPublicProfileFallback(profile),
        profileUserId: profile.id,
        requireCanonical: true,
        sessionKey,
        viewerId: userId,
      })
        .then((detail) => {
          if (cancelled || !detail) return;
          discoveryDetailHydratedRef.current.add(profile.id);
          // Deliberately not applyPublicProfileToDiscoveryCards: that writer is reserved for
          // explicit profile-sheet opens. Passive deck hydration must never refresh a card
          // the user is actively looking at, so this only patches the still-queued row.
          setDiscoverProfiles((current) => current.map((item, index) => (
            index > 0 && item.id === profile.id && !item.canonicalProfileLoaded
              ? applyCanonicalProfilePreviewToDiscoveryProfile(item, detail)
              : item
          )));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [accessToken, discoverProfiles, sessionKey, userId]);
  const discoverRequestSettled = topTab === "discover" && discoverLoadSettled && discoverSettledKey === activeDiscoverRequestKey;
  const discoverBooting = topTab === "discover" && !discoverRequestSettled;
  const discoverEndStateCandidate =
    discoverRequestSettled &&
    !loading &&
    discoverStatus === "ready" &&
    discoverProfiles.length === 0;
  const renderDiscoverEndState = discoverEndStateCandidate && discoverEndStateReady;

  useEffect(() => {
    if (!discoverEndStateCandidate) {
      setDiscoverEndStateReady(false);
      return;
    }
    const timer = setTimeout(() => setDiscoverEndStateReady(true), 900);
    return () => clearTimeout(timer);
  }, [activeDiscoverRequestKey, discoverEndStateCandidate]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(() => { void handleSearchRecent(); }, 220);
    return () => clearTimeout(timer);
  }, [handleSearchRecent, searchOpen]);

  const handlePassDiscovery = useCallback((profile: NativeChatDiscoveryProfile) => {
    commitDiscoveryAction(profile.id, "pass");
  }, [commitDiscoveryAction]);

  const handleWaveDiscoveryIntent = useCallback((profile: NativeChatDiscoveryProfile) => {
    if (!userId || discoverBusyId || discoveryQuotaReached) return;
    waveActionRef.current = {
      profileId: profile.id,
      actionId: nativeDiscoveryActionId("wave", profile.id),
    };
    setDiscoverBusyId(profile.id);
  }, [discoverBusyId, discoveryQuotaReached, userId]);

  const handleWaveDiscovery = useCallback(async (profile: NativeChatDiscoveryProfile) => {
    if (!userId || (discoverBusyId && discoverBusyId !== profile.id)) return false;
    if (discoveryQuotaReached) {
      setStatus(discoveryQuotaCopy);
      return false;
    }
    const currentAction = waveActionRef.current?.profileId === profile.id
      ? waveActionRef.current
      : { profileId: profile.id, actionId: nativeDiscoveryActionId("wave", profile.id) };
    waveActionRef.current = currentAction;
    setDiscoverBusyId(profile.id);
    setStatus(null);
    commitDiscoveryAction(profile.id, "wave");
    try {
      const result = await sendNativePublicProfileWave(userId, profile.id, currentAction.actionId, accessToken);
      if (result.status === "quota_exhausted") {
        rollbackDiscoveryAction(profile, "wave");
        setStatus(discoveryQuotaCopy);
        return false;
      }
      if (result.status === "blocked") {
        rollbackDiscoveryAction(profile, "wave");
        setStatus("Cannot wave this user.");
        return false;
      }
      if (result.status === "failed") {
        rollbackDiscoveryAction(profile, "wave");
        setStatus("Wave could not send. Try again.");
        return false;
      }
      setDiscoveryCycleStartedAt((current) => {
        const next = current && nativeDiscoveryCycleIsActive(current) ? current : new Date().toISOString();
        void AsyncStorage.setItem(nativeDiscoveryCycleStartedAtStorageKey(userId), next);
        return next;
      });
      setDiscoverySeenToday((current) => current + 1);
      markNativeDiscoveryRelationshipHandled(userId, profile.id);
      if (result.mutual || await hasReciprocalWave(userId, profile.id, accessToken)) {
        if (active && topTabRef.current === "discover" && !presentedMatchIdsRef.current.has(profile.id)) {
          presentedMatchIdsRef.current.add(profile.id);
          setMatchModal({ userId: profile.id, name: profile.displayName, avatarUrl: resolveNativeAvatarUrl(profile.avatarUrl) });
        }
      } else if (result.status === "duplicate") {
        // Keep the duplicate notice (information user can't infer from cue alone). Drop the "Wave sent." banner — the send cue is the confirmation.
        setStatus("You already waved. Open chats when the match is ready.");
      }
      return true;
    } catch {
      rollbackDiscoveryAction(profile, "wave");
      setStatus("Wave could not send. Try again.");
      return false;
    } finally {
      if (waveActionRef.current?.profileId === profile.id) waveActionRef.current = null;
      setDiscoverBusyId(null);
    }
  }, [accessToken, active, commitDiscoveryAction, discoverBusyId, discoveryQuotaCopy, discoveryQuotaReached, rollbackDiscoveryAction, userId]);

  const handleStarDiscovery = useCallback((profile: NativeChatDiscoveryProfile) => {
    if (!userId || discoverBusyId || starPreflightRef.current) return;
    if (!accessToken || normalizeQuotaTier(effectiveTier) === "free") {
      setPremiumTier("plus");
      return;
    }
    const preflightId = nativeDiscoveryActionId("star", profile.id);
    starPreflightRef.current = preflightId;
    void (async () => {
      const localTier = normalizeQuotaTier(effectiveTier);
      let authoritativeTier = localTier;
      const snapshot = await fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey }).catch(() => null);
      authoritativeTier = normalizeQuotaTier(snapshot?.profile?.effective_tier ?? snapshot?.quota?.effective_tier ?? snapshot?.profile?.tier ?? snapshot?.quota?.tier ?? localTier);
      if (snapshot) setEffectiveTier(authoritativeTier);
      if (authoritativeTier === "free") {
        setPremiumTier("plus");
        return;
      }
      const quotaSnapshot = await nativeExactTokenRpc("get_quota_snapshot", {}, accessToken);
      if (!quotaSnapshot.error) {
        const quota = Array.isArray(quotaSnapshot.data) ? quotaSnapshot.data[0] : quotaSnapshot.data;
        const typedQuota = quota && typeof quota === "object" ? quota as Record<string, unknown> : {};
        const used = safeQuotaNumber(typedQuota.stars_used_cycle ?? typedQuota.stars_month_used);
        const extra = safeQuotaNumber(typedQuota.extra_stars ?? typedQuota.extras_stars);
        const includedStars = getQuotaCapsForTier(authoritativeTier).starsPerMonth;
        if (Math.max(0, includedStars - used) + Math.max(0, extra) <= 0) {
          if (authoritativeTier === "plus") setPremiumTier("gold");
          else setStarsExhaustedOpen(true);
          return;
        }
      }
      setStarConfirmMessage(null);
      if (starPreflightRef.current !== preflightId) return;
      setConfirmStarTarget({ id: profile.id, displayName: profile.displayName, actionId: preflightId });
    })().finally(() => {
      if (starPreflightRef.current === preflightId) starPreflightRef.current = null;
    });
  }, [accessToken, discoverBusyId, effectiveTier, sessionKey, userId]);

  const handleDiscoveryProfileTap = useCallback((profile: NativeChatDiscoveryProfile) => {
    if (discoverBusyId) return;
    haptic.toggleControl();
    setProfileSheetFallbackData(discoveryProfileToPublicProfileFallback(profile));
    setProfileSheetSource("discover");
    setProfileSheetUserId(profile.id);
  }, [discoverBusyId]);

  // Explicit profile-sheet opens may refresh that same card after the user has
  // inspected it; passive deck/background hydration never uses this writer.
  const applyPublicProfileToDiscoveryCards = useCallback((targetId: string, detail: NativePublicProfile | null) => {
    if (!detail) return;
    setDiscoverProfiles((current) => current.map((item) => (
      item.id === targetId ? applyCanonicalProfilePreviewToDiscoveryProfile(item, detail) : item
    )));
  }, []);

  const handleProfileSheetResolved = useCallback((detail: NativePublicProfile) => {
    const targetId = detail.userId || profileSheetUserId;
    if (!targetId) return;
    discoveryDetailHydratedRef.current.add(targetId);
    applyPublicProfileToDiscoveryCards(targetId, detail);
  }, [applyPublicProfileToDiscoveryCards, profileSheetUserId]);

  const handleProfileSheetWave = useCallback(async () => {
    if (!profileSheetUserId) return;
    const profile = discoverProfiles.find((p) => p.id === profileSheetUserId);
    if (!profile) return;
    const sent = await handleWaveDiscovery(profile);
    if (sent) {
      setProfileSheetUserId(null);
      setProfileSheetFallbackData(null);
    }
  }, [discoverProfiles, handleWaveDiscovery, profileSheetUserId]);

  const executeConfirmedStar = useCallback(async () => {
    // D1 guard: double-confirm block. starBusyRef is the single-shot ref;
    // starActionLoading kept for legacy callers + button UI parity.
    if (starBusyRef.current) return;
    if (!userId || !confirmStarTarget || starActionLoading) return;
    starBusyRef.current = true;
    // D1: backend starts immediately on Confirm. Pending state drives modal charge (gold halo + pulse, no copy change).
    setConfirmStarPending(true);
    setStarActionLoading(true);
    setDiscoverBusyId(confirmStarTarget.id);
    setStarConfirmMessage(null);
    setStatus(null);

    const targetId = confirmStarTarget.id;
    const targetName = confirmStarTarget.displayName;
    const actionId = confirmStarTarget.actionId;

    try {
      const freshAccessToken = await getFreshNativeAccessToken(accessToken);
      if (!freshAccessToken) {
        const message = "Please sign in again to send a Star.";
        setStarConfirmMessage(message);
        setStatus(message);
        return;
      }
      const result = await sendNativePublicProfileStarChat(userId, targetId, targetName, actionId, freshAccessToken);
      if (!starMountedRef.current) return;
      if (result.status === "free_tier") {
        setConfirmStarTarget(null);
        setStarConfirmMessage(null);
        setPremiumTier("plus");
        return;
      }
      if (result.status === "exhausted") {
        if (result.upgradeTier === "gold") {
          setConfirmStarTarget(null);
          setStarConfirmMessage(null);
          setPremiumTier("gold");
        } else {
          setConfirmStarTarget(null);
          setStarConfirmMessage(null);
          setStarsExhaustedOpen(true);
        }
        return;
      }
      if (result.status === "blocked") {
        setConfirmStarTarget(null);
        setStarConfirmMessage(null);
        setStatus("You can't send a Star to this user right now.");
        return;
      }
      if (result.status !== "sent") {
        setConfirmStarTarget(null);
        setStarConfirmMessage(null);
        setStatus(result.reason || "Unable to send Star right now. Try again in a moment.");
        return;
      }

      // D1: backend SUCCESS. Now and only now do we run the climax.
      markNativeDiscoveryRelationshipHandled(userId, targetId);
      // D1: tie the profile card behind to a synchronized lift+halo+fade overlay.
      setLiftingProfile({ id: targetId, kind: "star" });
      // D1: pass measured Send-Star button anchor to the cue so the orb begins from the button.
      // Falls back to default screen-bottom origin if measurement failed (confirmStarButtonRect === null).
      const cueOrigin = confirmStarButtonRect;
      // Close the modal at the same beat the orb begins its rise — preserves spatial continuity.
      setConfirmStarTarget(null);
      setConfirmStarPending(false);
      setStarConfirmMessage(null);
      await launchNativeDiscoverySendCue("star", {
        onCommit: () => commitDiscoveryAction(targetId, "star"),
        originX: cueOrigin?.x ?? null,
        originY: cueOrigin?.y ?? null,
      });
      if (!starMountedRef.current) return;
      setLiftingProfile(null);
      // Confirmation is the gold dot on the Chats tab, not a redirect. Yanking the
      // person out of the deck mid-browse to a chat they have not written in yet
      // is the disruption; the dot lets them finish and come back.
      void markNativeNewChatSignal(userId);
    } catch (error) {
      // D1: FAILURE path — card stays in deck. No cue. No lift. Modal stays open with error.
      if (!starMountedRef.current) return;
      const message = "Unable to send Star right now. Try again in a moment.";
      if (message) {
        setStarConfirmMessage(message);
        setStatus(message);
      }
    } finally {
      if (starMountedRef.current) {
        setStarActionLoading(false);
        setDiscoverBusyId(null);
        setConfirmStarPending(false);
      }
      starBusyRef.current = false;
    }
  }, [accessToken, commitDiscoveryAction, confirmStarButtonRect, confirmStarTarget, launchNativeDiscoverySendCue, starActionLoading, userId]);

  // Discover refresh: bare refresh-cw icon top-right. Mirrors Map's MapControlButton icon contract
  // (Feather "refresh-cw", subtext color, ActivityIndicator on loading, toggleControl haptic).
  // No background — icon-only per product call.
  const handleDiscoverRefresh = useCallback(async () => {
    if (discoverRefreshing) return; // single-shot guard
    if (!userId) return;
    haptic.toggleControl();
    stableDiscoverTopCardRef.current = null;
    setDiscoverRefreshing(true);
    // (A) Reshuffle the current unpassed deck order in place — instant, no refetch — so
    // the pull visibly reorders the stack rather than re-rendering the same order.
    setDiscoverProfiles((current) => (current.length > 1 ? shuffleDiscoveryDeck(current) : current));
    requestAnimationFrame(() => {
      if (starMountedRef.current) setDiscoverRefreshing(false);
    });
  }, [discoverRefreshing, userId]);


  const cancelConfirmStar = useCallback(() => {
    setConfirmStarTarget(null);
    setStarConfirmMessage(null);
    setConfirmStarPending(false);
    setConfirmStarButtonRect(null);
  }, []);


  // Backstop: if `loading` is still true past the deadline something upstream is
  // stuck (an unbounded network call that never settled). Surface the same
  // retryable error state a real failure produces rather than spinning forever.
  const loadingDeadlineTripped = useNativeLoadingDeadline(loading, {
    onTrip: () => {
      if (__DEV__) console.warn("[native.chats] load_deadline_tripped", { mainTab, topTab });
      setLoading(false);
      setRefreshing(false);
      // Clear the gate so the very next pull-to-refresh actually re-issues the
      // request instead of being swallowed by the in-flight guard.
      inboxRequestSeqRef.current += 1;
      loadRowsGateRef.current.inFlight = false;
      exploreLoadGateRef.current.inFlight = false;
      if (topTab === "discover") {
        // Discover's shell is driven by its own settled flags, not `loading`.
        // Settle them too or the skeleton simply keeps rendering.
        setDiscoverStatus("error");
        setDiscoverLoadSettled(true);
        setDiscoverSettledKey(activeDiscoverRequestKey);
        return;
      }
      setStatus(topTab === "community"
        ? "Community could not load. Pull to refresh."
        : "Failed to load conversations. Pull to refresh.");
    },
  });

  const hasLoadError = /failed to load/i.test(status || "") || inboxSyncState === "error" || loadingDeadlineTripped;

  const patchGroupEverywhere = useCallback((chatId: string, patch: Partial<NativeChatInboxRow> & Partial<NativeExploreGroup>) => {
    setRows((current) => current.map((row) => row.chatId === chatId ? { ...row, ...patch } : row));
    setExploreGroups((current) => current.map((group) => group.id === chatId ? { ...group, ...patch } : group));
    setInvitedExploreGroups((current) => current.map((group) => group.id === chatId ? { ...group, ...patch } : group));
    setGroupDetails((current) => {
      if (!current) return current;
      const currentChatId = "chatId" in current ? current.chatId : current.id;
      if (currentChatId !== chatId) return current;
      return { ...current, ...patch };
    });
    void patchNativeChatsGroupCaches(userId, chatId, patch);
  }, [userId]);

  const commitGroupDetailsDraft = useCallback(async (options?: { close?: boolean; open?: boolean }) => {
    if (!groupDetails || !userId) {
      if (options?.close) setGroupDetails(null);
      return;
    }
    if ("invitePending" in groupDetails) {
      if (options?.open) onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(groupDetails.id)}&name=${encodeURIComponent(groupDetails.name)}&joined=1`, "/chats?tab=groups"));
      if (options?.close) closeGroupDetails();
      return;
    }
    const chatId = groupDetails.chatId;
    const currentMemberRole = groupManagement?.members.find((member) => member.userId === userId)?.role?.toLowerCase() || "";
    const canManageGroup = groupDetails.createdBy === userId || currentMemberRole === "admin" || currentMemberRole === "creator";
    if (!canManageGroup) {
      if (options?.open) onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(chatId)}&name=${encodeURIComponent(groupDetails.chatName || "Group")}&joined=1`, "/chats?tab=groups"));
      if (options?.close) closeGroupDetails();
      return;
    }
    const nextName = groupNameEdit.trim();
    const existingAvatarUrl = "avatarUrl" in groupDetails ? groupDetails.avatarUrl : null;
    const nextErrors: GroupDetailsErrors = {
      name: !nextName,
      location: !groupLocationEdit.trim(),
      cover: !existingAvatarUrl && !groupEditCoverDraft,
      description: countWords(groupDescriptionEdit) > GROUP_DESCRIPTION_WORD_LIMIT,
    };
    setGroupDetailsErrors(nextErrors);
    if (nextErrors.name) {
      setStatus("Add a group name to continue.");
      return;
    }
    if (nextErrors.location) {
      setStatus("Add a group location to continue.");
      return;
    }
    if (nextErrors.cover) {
      setStatus("Add a group cover photo to continue.");
      return;
    }
    if (nextErrors.description) {
      setStatus(`Description must be ${GROUP_DESCRIPTION_WORD_LIMIT} words or fewer.`);
      return;
    }
    let avatarUrl = existingAvatarUrl;
    let uploadedCoverObjectName: string | null = null;
    try {
	      if (groupEditCoverDraft) {
	        const freshAccessToken = await getFreshNativeAccessToken(accessToken);
	        if (!freshAccessToken) throw new Error("missing_access_token");
	        if (groupDetails.createdBy && userId !== groupDetails.createdBy) throw new Error("not_authorized");
	        const uploadedCover = await uploadNativeGroupCover({ accessToken: freshAccessToken, asset: groupEditCoverDraft, chatId, userId });
	        avatarUrl = uploadedCover.url;
	        uploadedCoverObjectName = uploadedCover.objectName;
	      }
      const saved = await updateNativeGroupChatMetadata({
        roomId: chatId,
        name: nextName,
        avatarUrl,
        description: groupDescriptionEdit.trim(),
        locationLabel: groupLocationEdit.trim(),
        petFocus: groupPetFocusEdit,
        updateName: true,
        updateAvatar: Boolean(groupEditCoverDraft),
        updateDescription: true,
	        updateLocation: true,
	        updatePetFocus: true,
	        accessToken,
	      });
      const savedName = saved?.name || nextName;
      const savedLocation = saved?.locationLabel || groupLocationEdit.trim();
      const savedPetFocus = saved?.petFocus || groupPetFocusEdit;
      const previousCoverObjectName = groupEditCoverDraft ? extractNativeAvatarStorageObjectPath(existingAvatarUrl) : null;
      if (previousCoverObjectName && previousCoverObjectName !== uploadedCoverObjectName) {
        const cleanupResult = await requestNativeStorageCleanupResult("avatars", previousCoverObjectName, "replace_group_cover", accessToken);
        if (cleanupResult === "failed") {
          logNativeProtectedActionFailure("[native.chats] replace_group_cover_cleanup_failed", createNativeProtectedActionError({
            ok: false,
            stage: "cleanup",
            originalError: new Error("replace_group_cover_cleanup_failed"),
            cleanupAttempted: true,
            cleanupResult,
          }));
        }
      }
      const patch = {
        avatarUrl,
        chatName: savedName,
        name: savedName,
        description: groupDescriptionEdit.trim(),
        locationLabel: savedLocation,
        petFocus: savedPetFocus,
      };
      setGroupEditCoverDraft(null);
      setGroupNameEdit(savedName);
      setGroupLocationEdit(savedLocation);
      setGroupPetFocusEdit(savedPetFocus);
      patchGroupEverywhere(chatId, patch);
      void patchCachedNativeChatInboxGroupRows({ chatId, patch, sessionKey, userId });
      if (options?.open) onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(chatId)}&name=${encodeURIComponent(savedName)}&joined=1`, "/chats?tab=groups"));
      if (options?.close) setGroupDetails(null);
      setGroupDetailsErrors({});
      setStatus(null);
    } catch (error) {
      if (uploadedCoverObjectName && accessToken) {
        const cleanupResult = await requestNativeStorageCleanupResult("avatars", uploadedCoverObjectName, "group_cover_metadata_update_failed", accessToken);
        logNativeProtectedActionFailure("[native.chats] update_group_cover_cleanup", createNativeProtectedActionError({
          ok: false,
          stage: "domain_save",
          originalError: error,
          cleanupAttempted: true,
          cleanupResult,
        }));
      } else {
        logNativeProtectedActionFailure("[native.chats] update_group_failed", error);
      }
      const message = error instanceof Error ? error.message : String(error || "");
      if (/file_too_large/i.test(message)) setStatus("That file's too big. Try a photo under 15MB.");
      else if (/not_authorized|permission|denied|policy|rls/i.test(message)) setStatus("Only the group's creator can change the cover.");
      else setStatus("Unable to update group right now.");
    }
  }, [accessToken, closeGroupDetails, groupDescriptionEdit, groupDetails, groupEditCoverDraft, groupLocationEdit, groupManagement?.members, groupNameEdit, groupPetFocusEdit, onNavigate, patchGroupEverywhere, sessionKey, userId]);

  const bannerInviteGroups = invitedExploreGroups.filter((group) => !dismissedInviteBannerIds.has(group.inviteId || group.id));
  const firstPendingGroupInvite = bannerInviteGroups[0] ?? null;
  const visibleExploreGroups = sortExploreGroups(
    [...invitedExploreGroups, ...exploreGroups].filter((group) => !hiddenExploreGroupIds.has(group.id)),
    groupExploreSort,
    viewerPetSignals,
    viewerLocationWords,
  ).sort((left, right) => {
    if (!routeGroupDetailId) return 0;
    if (left.id === routeGroupDetailId) return -1;
    if (right.id === routeGroupDetailId) return 1;
    return 0;
  });

  return (
    <View collapsable={false} style={styles.screen}>
      <View style={styles.controlsStack}>
        <View style={styles.topToggleRow}>
          {/* Left: refresh icon. Discover refreshes the deck; Community refreshes explore groups. */}
          {topTab === "discover" && discoverStatus !== "age_blocked" ? (
            <Pressable
              accessibilityLabel="Refresh discovery"
              accessibilityRole="button"
              accessibilityState={{ disabled: discoverRefreshing }}
              disabled={discoverRefreshing}
              hitSlop={huddleSpacing.x2}
              onPress={() => { void handleDiscoverRefresh(); }}
              style={styles.discoverRefreshButton}
            >
              {discoverRefreshing
                ? <NativeSpinner tone="muted" />
                : <Feather color={huddleColors.subtext} name="refresh-cw" size={18} />}
            </Pressable>
          ) : topTab === "community" ? (
            <Pressable accessibilityLabel="Create Group" onPress={() => selfVerified ? setCreateGroupOpen(true) : setStatus("Get verified to start a group chat and coordinate your next local meetup.")} style={styles.iconButton}>
              <Feather color={selfVerified ? huddleColors.blue : huddleColors.iconMuted} name="user-plus" size={19} />
            </Pressable>
          ) : (
            <View style={styles.sideActionSlot} />
          )}
          <View style={styles.topToggleCenter}>
            <View style={styles.topToggle}>
              {discoverAgeEligible === false ? null : <Pressable accessibilityLabel="Discover" accessibilityRole="button" onPress={() => handleTopTabPress("discover")} style={[nativeModalStyles.appTopSegmentButton, styles.topToggleSegment, topTab === "discover" && styles.topToggleSegmentActive]}>
                <TopSegmentGlassLayer visible={topTab === "discover"} />
                {friendsMatchingPaused ? (
                  <View style={styles.discoverIconSlashWrap}>
                    <NativeGlyph color={topTab === "discover" ? huddleColors.onPrimary : huddleColors.mutedText} name="chatsUser" size={20} />
                    <View style={[styles.discoverIconSlash, { backgroundColor: topTab === "discover" ? huddleColors.onPrimary : huddleColors.mutedText }]} />
                  </View>
                ) : (
                  <NativeGlyph color={topTab === "discover" ? huddleColors.onPrimary : huddleColors.mutedText} name="chatsUser" size={20} />
                )}
              </Pressable>}
              <Pressable accessibilityLabel="Community" accessibilityRole="button" onPress={() => handleTopTabPress("community")} style={[nativeModalStyles.appTopSegmentButton, styles.topToggleSegment, topTab === "community" && styles.topToggleSegmentActive]}>
                <TopSegmentGlassLayer visible={topTab === "community"} />
                <NativeGlyph color={topTab === "community" ? huddleColors.onPrimary : huddleColors.mutedText} name="chatsGroup" size={20} />
              </Pressable>
              <Pressable accessibilityLabel="Chats" accessibilityRole="button" onPress={() => handleTopTabPress("chats")} style={[nativeModalStyles.appTopSegmentButton, styles.topToggleSegment, topTab === "chats" && styles.topToggleSegmentActive]}>
                <TopSegmentGlassLayer visible={topTab === "chats"} />
                <View style={styles.toggleIconWrap}>
                  <NativeGlyph color={topTab === "chats" ? huddleColors.onPrimary : huddleColors.mutedText} name="chatsChat" size={20} />
                  {unreadTotal > 0 || friendRequestUnread ? <View accessibilityLabel="Unread chats" style={styles.toggleUnreadBadge} /> : null}
                </View>
              </Pressable>
            </View>
          </View>
          {topTab === "discover" && discoverStatus !== "age_blocked" ? (
            <Pressable accessibilityLabel="Filter" onPress={() => setFilterOpen(true)} style={styles.iconButton}>
              <Feather color={huddleColors.iconMuted} name="sliders" size={19} />
            </Pressable>
          ) : topTab === "community" ? (
            <Pressable accessibilityLabel="Sort groups" onPress={() => setGroupExploreSortOpen(true)} style={styles.iconButton}>
              <Feather color={huddleColors.iconMuted} name="sliders" size={19} />
            </Pressable>
          ) : (
            <View style={styles.sideActionSlot} />
          )}
        </View>
        {topTab === "chats" ? (
          <>
            {searchOpen ? (
              <View style={styles.searchWrap}>
                <View style={styles.searchField}>
                  <Feather color={huddleColors.iconSubtle} name="search" size={18} />
                  <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                    accessibilityLabel="Search chats"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setSearchQuery}
                    placeholder="Search"
                    placeholderTextColor={huddleColors.mutedText}
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                  {searchQuery ? (
                    <Pressable accessibilityLabel="Clear search" onPress={() => setSearchQuery("")} style={styles.searchClear}>
                      <Feather color={huddleColors.iconMuted} name="x" size={16} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
            <View style={styles.chatTabsRow}>
              <View style={styles.mainTabRail}>
                {visibleMainTabs.map((tab) => {
                  const active = tab.key === mainTab;
                  return (
                    <Pressable key={tab.key} onPress={() => handleMainTabPress(tab.key)} style={nativeModalStyles.appUnderlineTab}>
                      <View style={styles.mainTabLabelRow}>
                        <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>{tab.label}</Text>
                      </View>
                      {active ? <View style={styles.mainTabIndicator} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.chatActions}>
                {mainTab === "groups" ? (
                  <>
                    <Pressable accessibilityLabel="Join with code" onPress={() => setJoinCodeOpen(true)} style={styles.iconButtonSmall}>
                      <Feather color={huddleColors.iconMuted} name="hash" size={16} />
                    </Pressable>
                    <Pressable accessibilityLabel="Create Group" onPress={() => selfVerified ? setCreateGroupOpen(true) : setStatus("Get verified to start a group chat and coordinate your next local meetup.")} style={[styles.iconButtonSmall, selfVerified && styles.iconButtonSmallVerified]}>
                      <Feather color={selfVerified ? huddleColors.blue : huddleColors.iconMuted} name="user-plus" size={16} />
                    </Pressable>
                  </>
                ) : null}
                <Pressable accessibilityLabel="Search" onPress={() => setSearchOpen((open) => !open)} style={styles.iconButtonSmall}>
                  <Feather color={huddleColors.iconMuted} name="search" size={16} />
                </Pressable>
              </View>
            </View>
          </>
        ) : null}
      </View>
      {/* ── Three always-mounted tab panes ──────────────────────────────────────────────
          The outer View is flex:1 so absoluteFill children get the correct measured height.
          Each Reanimated.View fades in/out over 100ms; inactive panes have pointerEvents="none"
          so touches fall through. No tab is ever unmounted — state and scroll position persist. */}
      <View style={styles.tabContainer}>

        {/* ── DISCOVER ── */}
        {discoverAgeEligible === false ? null : <Reanimated.View collapsable={false} pointerEvents={topTab === "discover" ? "auto" : "none"} ref={discoverPageRef} style={[StyleSheet.absoluteFill, discoverTabStyle]}>
          <ScrollView
            alwaysBounceVertical
            contentContainerStyle={[styles.content, styles.discoverContent, { paddingBottom: screenInsets.bottom + huddleSpacing.x10 + huddleSpacing.x8 }]}
            refreshControl={<RefreshControl refreshing={refreshing || discoverRefreshing} tintColor={huddleColors.blue} colors={[huddleColors.blue]} onRefresh={handleDiscoverRefresh} />}
            scrollEnabled={!discoverySwipeActive}
            showsVerticalScrollIndicator={false}
          >
            {discoverRequestSettled && !loading && discoverStatus === "age_blocked" ? <NativeChatsEmptyState body={DISCOVER_AGE_GATE_COPY} image={discoverAgeGateImage} /> : null}
            {discoverRequestSettled && !loading && !discoverLocationPrivacyCoverVisible && discoverStatus === "error" ? (
              <NativeChatsEmptyState body="Discover could not load. Pull to retry." />
            ) : null}
            {renderDiscoverEndState && !discoverLocationPrivacyCoverVisible ? <DiscoveryEndState passedCount={passedDiscoveryIds.size} onExpandSearch={() => setFilterOpen(true)} /> : null}
            {/* Loading-shell: card+deck placeholder before the first profile lands. Suppressed once any other terminal state owns the surface. */}
            {discoverStatus !== "age_blocked"
              && (discoverLocationPrivacyCoverVisible || discoverStatus !== "error")
              && (discoverLocationPrivacyCoverVisible || !renderDiscoverEndState)
              && (!currentDiscoveryProfile || !discoveryGeometryReady)
              && (!discoveryGeometryReady || loading || !discoverRequestSettled || discoverRefreshing || discoverLocationPrivacyCoverVisible || (discoverLocationPermissionRequired && discoverStatus === "location_required")) ? (
                <View ref={discoveryStackRef} onLayout={measureDiscoveryStackTop} style={[styles.discoveryStack, { minHeight: discoveryDeckStageHeight + huddleSpacing.x4 }]}>
                  <DiscoveryCardShell
                    layer={0}
                    locationPermissionCover={discoverLocationPrivacyCoverVisible ? { canAskAgain: discoverLocationPermission.canAskAgain, onPress: () => { void handleDiscoverEnableLocation(); } } : undefined}
                    stackTopY={discoveryStackTopY}
                  />
                </View>
              ) : null}
            {(discoverStatus === "ready" || (discoverLocationPrivacyCoverVisible && discoverStatus !== "age_blocked")) && currentDiscoveryProfile && discoveryGeometryReady ? (
              <View collapsable={false} ref={discoveryStackRef} onLayout={measureDiscoveryStackTop} style={[styles.discoveryStack, { minHeight: discoveryDeckStageHeight + huddleSpacing.x4 }]}>
                <DiscoveryStaticDeck count={discoverProfiles.length} stackTopY={discoveryStackTopY} swipeXSV={discoverySwipeXSV} transitionActive={discoverySwipeActive} />
                {nextDiscoveryProfile ? (
                  <DiscoveryProfileCard key={nextDiscoveryProfile.id} busy={false} chips={[]} deckTransitionActive={discoverySwipeActive} index={1} isDeepestQueued={false} isLast={false} liftKind={null} preparedBehind profile={nextDiscoveryProfile} stackTopY={discoveryStackTopY} swipeXSV={discoverySwipeXSV} onPass={handlePassDiscovery} onProfileTap={handleDiscoveryProfileTap} onStar={handleStarDiscovery} onSwipePhaseChange={setDiscoverySwipePhase} onWave={handleWaveDiscovery} onWaveIntent={handleWaveDiscoveryIntent} />
                ) : null}
                <DiscoveryProfileCard key={currentDiscoveryProfile.id} busy={discoverBusyId === currentDiscoveryProfile.id} chips={[
                  ...(effectiveTier === "gold" && filters.activeOnly ? ["Active today"] : []),
                  ...(effectiveTier === "gold" && filters.whoWavedAtMe ? ["Waved at you"] : []),
                ]} cardRef={discoverCardRef} index={0} isDeepestQueued={false} isLast={discoverProfiles.length === 1} liftKind={liftingProfile?.id === currentDiscoveryProfile.id ? liftingProfile.kind : null} paused={friendsMatchingPaused} locationPermissionCover={discoverLocationPrivacyCoverVisible ? { canAskAgain: discoverLocationPermission.canAskAgain, onPress: () => { void handleDiscoverEnableLocation(); } } : undefined} enablingPaused={enablingFriendsMatching} profile={currentDiscoveryProfile} stackTopY={discoveryStackTopY} swipeXSV={discoverySwipeXSV} starRef={discoverStarRef} waveRef={discoverWaveRef} onPass={handlePassDiscovery} onProfileTap={handleDiscoveryProfileTap} onStar={handleStarDiscovery} onSwipePhaseChange={setDiscoverySwipePhase} onWave={handleWaveDiscovery} onWaveIntent={handleWaveDiscoveryIntent} onEnablePaused={() => void handleEnableFriendsMatching()} />
              </View>
            ) : null}
          </ScrollView>
          {discoverCoachMarkArmed && !showDiscoverCoachMarks ? (
            <Pressable
              accessibilityLabel="Show Discover guide"
              accessibilityRole="button"
              onPressIn={startDiscoverCoachMarks}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <NativeDiscoverCoachMarks
            cardRef={discoverCardRef}
            onFinish={() => {
              discoverCoachMarksCompletedRef.current = true;
              setDiscoverCoachMarkArmed(false);
              setShowDiscoverCoachMarks(false);
            }}
            pageRef={discoverPageRef}
            starFocusVisual={<DiscoveryStarControlVisual standalone />}
            starRef={discoverStarRef}
            userId={userId}
            visible={showDiscoverCoachMarks}
            waveFocusVisual={<DiscoveryWaveControlVisual standalone />}
            waveRef={discoverWaveRef}
          />
        </Reanimated.View>}

        {/* ── COMMUNITY ── */}
        <Reanimated.View pointerEvents={topTab === "community" ? "auto" : "none"} style={[StyleSheet.absoluteFill, communityTabStyle]}>
          <ScrollView
            alwaysBounceVertical
            contentContainerStyle={[styles.content, { paddingBottom: screenInsets.bottom + huddleSpacing.x10 + huddleSpacing.x8 }]}
            ref={communityScrollRef}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={huddleColors.blue} colors={[huddleColors.blue]} onRefresh={handleRefresh} />}
            showsVerticalScrollIndicator={false}
          >
            {loading ? <View style={styles.skeletonList}><NativeGroupCardSkeleton /><NativeGroupCardSkeleton /><NativeGroupCardSkeleton /></View> : null}
            {!loading && firstPendingGroupInvite ? (
              <View style={styles.groupInviteBanner}>
                <View style={styles.groupInviteBannerHeader}>
                  <Pressable accessibilityLabel="Expand group invites" onPress={() => setGroupInviteBannerExpanded((expanded) => !expanded)} style={styles.groupInviteBannerCopy}>
                    <Text numberOfLines={2} style={styles.groupInviteBannerText}>
                      <Text style={styles.groupInviteBannerName}>{firstPendingGroupInvite.inviterName || "Someone"}</Text>
                      {` invited you to join a group${bannerInviteGroups.length > 1 ? ` (${bannerInviteGroups.length} invites)` : ""}`}
                    </Text>
                  </Pressable>
                  <View style={styles.groupInviteBannerActions}>
                    <Pressable accessibilityLabel="Not now for group invite" onPress={() => setDismissedInviteBannerIds((current) => new Set(current).add(firstPendingGroupInvite.inviteId || firstPendingGroupInvite.id))} style={styles.groupInviteBannerSecondary}>
                      <Text style={styles.groupInviteBannerSecondaryText}>Not Now</Text>
                    </Pressable>
                    <Pressable accessibilityLabel="Join group invite" onPress={() => void handleJoinExploreGroup(firstPendingGroupInvite)} style={styles.groupInviteBannerPrimary}>
                      <Text style={styles.groupInviteBannerPrimaryText}>Join</Text>
                    </Pressable>
                  </View>
                </View>
                {groupInviteBannerExpanded && bannerInviteGroups.length > 1 ? (
                  <View style={styles.groupInviteBannerExpanded}>
                    {bannerInviteGroups.slice(1).map((group) => (
                      <View key={group.inviteId || group.id} style={styles.groupInviteBannerRow}>
                        <Pressable onPress={() => setPendingGroupInvitePrompt(group)} style={styles.groupInviteBannerRowCopy}>
                          <Text numberOfLines={1} style={styles.groupInviteBannerRowTitle}>{group.name}</Text>
                          <Text numberOfLines={1} style={styles.groupInviteBannerRowMeta}>{group.inviterName || "Someone"} invited you</Text>
                        </Pressable>
                        <View style={styles.groupInviteBannerActions}>
                          <Pressable accessibilityLabel={`Not now for ${group.name}`} onPress={() => setDismissedInviteBannerIds((current) => new Set(current).add(group.inviteId || group.id))} style={styles.groupInviteBannerSecondary}>
                            <Text style={styles.groupInviteBannerSecondaryText}>Not Now</Text>
                          </Pressable>
                          <Pressable accessibilityLabel={`Join ${group.name}`} onPress={() => void handleJoinExploreGroup(group)} style={styles.groupInviteBannerPrimary}>
                            <Text style={styles.groupInviteBannerPrimaryText}>Join</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {!loading && visibleExploreGroups.length > 0 ? (
              <View style={styles.exploreList}>
                {visibleExploreGroups.map((group, index) => <ExploreGroupCard key={group.id} accessToken={accessToken} countdownNow={eventCountdownNow} friendIds={activeMatchedPeerIds} group={group} index={index} nextEvent={communityNextEventByGroupId.get(group.id) ?? null} outIds={visibleOutIds} onHide={(groupId) => setHiddenExploreGroupIds((current) => new Set(current).add(groupId))} onOpen={openExploreGroupOrInvitePrompt} onPrimaryAction={handleJoinExploreGroup} />)}
              </View>
            ) : null}
            {!loading && !hasLoadError && visibleExploreGroups.length === 0 ? <NativeChatsEmptyState body="No public groups nearby yet. Be the first to start a local pack!" groupAligned image={emptyChatImage} /> : null}
          </ScrollView>
        </Reanimated.View>

        {/* ── CHATS ── */}
        <Reanimated.View pointerEvents={topTab === "chats" ? "auto" : "none"} style={[StyleSheet.absoluteFill, chatsTabStyle]}>
          <ScrollView
            alwaysBounceVertical
            contentContainerStyle={[styles.content, { paddingBottom: screenInsets.bottom + huddleSpacing.x10 + huddleSpacing.x8 }]}
            onScroll={handleChatsScroll}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={huddleColors.blue} colors={[huddleColors.blue]} onRefresh={handleRefresh} />}
            scrollEventThrottle={120}
            showsVerticalScrollIndicator={false}
          >
            {loading && visibleRows.length === 0 ? <View style={styles.skeletonList}><NativeChatRowSkeleton /><NativeChatRowSkeleton /><NativeChatRowSkeleton /><NativeChatRowSkeleton /><NativeChatRowSkeleton /></View> : null}
            <NativeContactFriendRequests accessToken={accessToken} active={active} visible={topTab === "chats" && mainTab === "friends"} refreshKey={contactFriendRequestsRefreshKey} userId={userId} onError={setStatus} onAccepted={(result) => {
              setNewlyAcceptedPeerId(result.targetUserId);
              setMatchedRailRefreshKey((value) => value + 1);
              void loadRows({ force: true, silent: true });
            }} />
            {!loading && mainTab === "friends" ? <MatchedRail highlightPeerId={newlyAcceptedPeerId} onHighlightComplete={handleNewFriendHighlightComplete} rows={avatarOnlyMatches} onOpen={handleOpenRow} /> : null}
            {!loading && !hasLoadError && mainTab === "service" && visibleRows.length === 0 && inboxSyncState === "fresh" ? <NativeServiceChatsEmptyState /> : null}
            {!loading && !hasLoadError && inboxSyncState === "fresh" && mainTab !== "service" && visibleRows.length === 0 && !(mainTab === "friends" && avatarOnlyMatches.length > 0) ? <NativeChatsEmptyState body={mainTab === "groups" ? "Better in a pack! Create or join a group to start coordinating local meetups." : "Meet friends on Social, then start a chat here."} groupAligned={mainTab === "groups"} image={emptyChatImage} /> : null}
            {!loading && visibleRows.length > 0 ? <View style={styles.list}>{visibleRows.map((row, rowIndex) => mainTab === "groups" ? <NativeGroupChatRow key={`${row.roomType}:${row.chatId}`} accessToken={accessToken} currentUserId={userId} friendIds={activeMatchedPeerIds} index={rowIndex} outIds={visibleOutIds} row={row} onManage={openManagedGroup} onOpenDetails={openManagedGroup} onPress={handleOpenRow} /> : <NativeChatRow key={`${row.roomType}:${row.chatId}`} row={row} userId={userId} onAvatarPress={handleAvatarProfilePress} onDelete={setPendingDeleteRow} onPress={handleOpenRow} />)}</View> : null}
          </ScrollView>
        </Reanimated.View>

      </View>
      {status ? <ChatsToast message={status} onDismiss={() => setStatus(null)} /> : null}
      {/* Invisible bottom-area swipe catcher — sits ABOVE the global NativeBottomNav (which itself
          floats at insets.bottom+8 with height navHeight=64). Captures committed horizontal flicks
          and cycles the top segment. Vertical motion fails the gesture so ScrollView still scrolls;
          taps in the strip are inert (no committed horizontal motion → no claim → no tab change). */}
      <GestureDetector gesture={bottomSwipeGesture}>
        <View
          pointerEvents={topTab === "discover" ? "none" : "box-only"}
          style={[styles.bottomSwipeStrip, { bottom: Math.max(huddleSpacing.x2, screenInsets.bottom + huddleSpacing.x2) + huddleLayout.navHeight + huddleSpacing.x2 }]}
        />
      </GestureDetector>
      <Modal presentationStyle="overFullScreen" animationType="fade" transparent visible={groupExploreSortOpen} onRequestClose={() => setGroupExploreSortOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setGroupExploreSortOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.floatingDropdown, styles.groupSortDropdown]}>
            <View style={styles.dropdownContent}>
              {GROUP_EXPLORE_SORT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => { setGroupExploreSort(option.value); setGroupExploreSortOpen(false); }}
                  style={({ pressed }) => [styles.dropdownOption, groupExploreSort === option.value ? styles.dropdownOptionActive : null, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.dropdownText}>{option.label}</Text>
                  {groupExploreSort === option.value ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.checkSlot} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <DiscoveryFilterModal effectiveTier={effectiveTier} filters={filters} filterRow={filterRow} open={filterOpen} onApply={(nextFilters) => { stableDiscoverTopCardRef.current = null; setDiscoverProfiles([]); setFilters(nextFilters); setFilterOpen(false); setFilterRow(null); }} onClose={() => { setFilterOpen(false); setFilterRow(null); }} onLockedFilter={requestFilterTier} onSetFilterRow={setFilterRow} />
      <ProfileUpgradeModal onClose={() => setPremiumTier(null)} onUpgrade={() => onNavigate("/premium")} tier={premiumTier} />
      <StarsExhaustedModal open={starsExhaustedOpen} onClose={() => setStarsExhaustedOpen(false)} />
      <AppConfirmModal
        open={resumeMatchingHintOpen}
        title="You're back in Friends Matching"
        body="If you ever want to take a break, simply turn off Open to Friends Matching in your Account Settings."
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => setResumeMatchingHintOpen(false)}
        onCancel={() => setResumeMatchingHintOpen(false)}
      />
      <GroupDetailsModal
        accessToken={accessToken}
        countdownNow={eventCountdownNow}
        currentUserId={userId}
        detailsErrors={groupDetailsErrors}
        descriptionEdit={groupDescriptionEdit}
        editCover={groupEditCoverDraft}
        group={groupDetails}
        management={groupManagement}
        managementError={groupManagementError}
        managementLoading={groupManagementLoading}
        countryLabel={groupCountryDraft}
        locationBiasPoint={viewerScope?.primaryPoint ?? null}
        locationEdit={groupLocationEdit}
        nameEdit={groupNameEdit}
        petFocusEdit={groupPetFocusEdit}
        selectableMembers={selectableMembers}
        onChangeLocationEdit={(value) => {
          setGroupLocationEdit(value);
          if (groupDetailsErrors.location && value.trim()) setGroupDetailsErrors((current) => ({ ...current, location: false }));
        }}
        onChangeCountryEdit={setGroupCountryDraft}
        onChangeNameEdit={(value) => {
          setGroupNameEdit(value);
          if (groupDetailsErrors.name && value.trim()) setGroupDetailsErrors((current) => ({ ...current, name: false }));
        }}
        onChangePetFocusEdit={setGroupPetFocusEdit}
        onChangeDescriptionEdit={(value) => {
          setGroupDescriptionEdit(value);
          if (groupDetailsErrors.description && countWords(value) <= GROUP_DESCRIPTION_WORD_LIMIT) setGroupDetailsErrors((current) => ({ ...current, description: false }));
        }}
        onClose={() => { void commitGroupDetailsDraft({ close: true }); }}
        coverCropAsset={groupCoverCropTarget?.target === "edit" ? groupCoverCropTarget.asset : null}
        onCancelCoverCrop={() => setGroupCoverCropTarget(null)}
        onSaveCoverCrop={saveGroupCoverCrop}
        onPickCover={pickGroupEditCover}
        onBlockMember={(member) => {
          if (!userId) return;
	          void nativeExactTokenRpc("block_user", { p_blocked_id: member.userId }, accessToken)
            .then(({ error }) => {
              if (error) throw error;
              void invalidateNativeBlockCascade({ userId });
              setStatus(`${member.name || "Member"} blocked.`);
            })
            .catch(() => setStatus("Unable to block member right now."));
        }}
        onInviteMembers={(group, ids) => {
          if (!userId) return;
          const chatId = "chatId" in group ? group.chatId : group.id;
          const name = ("chatName" in group ? group.chatName : group.name) || "Group";
	          void inviteNativeGroupMembers({ chatId, chatName: name, inviterUserId: userId, inviteUserIds: ids, accessToken, sessionKey }).then(() => refreshGroupManagement(chatId)).catch(() => setStatus("Unable to invite members right now."));
        }}
        onCancelInvite={(group, invite) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
		          void cancelNativeGroupInvite({ chatId, inviteId: invite.id, accessToken })
            .then(() => {
              setGroupManagement((current) => {
                const next = current ? { ...current, pendingInvites: current.pendingInvites.filter((item) => item.id !== invite.id) } : current;
                if (next && userId) void writeChatsCache(chatsGroupDetailsCacheKey(userId, chatId, false), next);
                return next;
              });
              setStatus("Invite canceled.");
            })
            .catch(() => setStatus("Unable to cancel invite right now."));
        }}
        onLeaveGroup={async (group) => {
          try {
            if (!userId) return;
            const chatId = "chatId" in group ? group.chatId : group.id;
	            await sendNativeChatMessage({ roomId: chatId, senderId: userId, content: `${selfMatchProfile.name || "Someone"} left the group.`, accessToken, sessionKey });
	            await removeNativeGroupMember({ chatId, userId, accessToken, sessionKey });
            setGroupDetails(null);
            void loadRows({ force: true, silent: true });
            haptic.selectTab(); // CD5: lighter tick on voluntary leave
            setStatus("Left group.");
          } catch (error) {
            haptic.error();
            setStatus("Unable to leave group right now.");
            throw error;
          }
        }}
        onDeclineInvite={(group) => void handleDeclineExploreInvite(group)}
        onJoin={(group) => void handleJoinExploreGroup(group)}
        onOpenChat={() => { void commitGroupDetailsDraft({ open: true }); }}
        onOpenMemberProfile={(memberId) => {
          transitionNativeModal(
            () => setGroupDetails(null),
            () => openGroupMemberProfile(memberId),
          );
        }}
        onReportMember={(member) => {
          const activeGroup = groupDetails;
          if (!activeGroup) return;
          const chatId = "chatId" in activeGroup ? activeGroup.chatId : activeGroup.id;
          transitionNativeModal(
            () => setGroupDetails(null),
            () => {
              setGroupMemberReportChatId(chatId);
              setGroupMemberReportTarget(member);
            },
          );
        }}
        onRemoveMember={(group, memberId) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
	          void removeNativeGroupMember({ chatId, userId: memberId, actorUserId: userId, accessToken, sessionKey }).then(() => refreshGroupManagement(chatId)).catch(() => setStatus("Unable to remove member right now."));
        }}
        onRequestAction={(group, request, action) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
	          return updateNativeGroupJoinRequest({ chatId, requestId: request.id, userId: request.userId, actorUserId: userId, action, accessToken, sessionKey }).then(() => refreshGroupManagement(chatId)).catch((error) => {
            setStatus("Unable to update join request right now.");
            throw error;
          });
        }}
        onRemoveGroup={async (group) => {
          try {
            const chatId = "chatId" in group ? group.chatId : group.id;
	            await removeNativeGroupChat(chatId, { accessToken });
            setGroupDetails(null);
            void loadRows({ force: true, silent: true });
            setStatus("Group removed.");
          } catch (error) {
            setStatus("Unable to remove group right now.");
            throw error;
          }
        }}
        onSaveDetails={() => { void commitGroupDetailsDraft({ close: true }); }}
        onToggleMute={async (group, muted) => {
	          try {
	            const chatId = "chatId" in group ? group.chatId : group.id;
		            await setNativeGroupMuteState({ chatId, muted, accessToken });
            setGroupManagement((current) => {
              const next = current ? {
                ...current,
                members: current.members.map((member) => member.userId === userId ? { ...member, isMuted: muted } : member),
              } : current;
              if (next && userId) void writeChatsCache(chatsGroupDetailsCacheKey(userId, chatId, false), next);
              return next;
            });
            setStatus(muted ? "Group muted." : "Notifications on.");
          } catch (error) {
            setStatus("Unable to update notifications right now.");
            throw error;
          }
        }}
	      />
		      <NativeJoinWithCodeSheet open={joinCodeOpen} value={groupCodeDraft} onChange={setGroupCodeDraft} onClose={() => setJoinCodeOpen(false)} onSubmit={handleJoinCode} />
      <GroupInviteInboxSheet groups={invitedExploreGroups} open={inviteInboxOpen} onClose={() => setInviteInboxOpen(false)} onConfirm={confirmInviteInboxDecisions} onOpenGroup={openExploreGroupOrInvitePrompt} />
	      <GroupInvitePromptModal group={pendingGroupInvitePrompt} onClose={() => setPendingGroupInvitePrompt(null)} onJoin={(group) => { setPendingGroupInvitePrompt(null); void handleJoinExploreGroup(group); }} />
		      <CreateGroupModal countryLabel={groupCountryDraft} locationBiasPoint={viewerScope?.primaryPoint ?? null} cover={groupCoverDraft} coverCropAsset={groupCoverCropTarget?.target === "create" ? groupCoverCropTarget.asset : null} creating={groupCreating} description={groupDescriptionDraft} joinMethod={groupJoinMethodDraft} location={groupLocationDraft} name={groupNameDraft} open={createGroupOpen} petFocus={groupPetFocusDraft} visibility={groupVisibilityDraft} onCancelCoverCrop={() => setGroupCoverCropTarget(null)} onChangeCountry={setGroupCountryDraft} onChangeDescription={setGroupDescriptionDraft} onChangeJoinMethod={setGroupJoinMethodDraft} onChangeLocation={setGroupLocationDraft} onChangeName={setGroupNameDraft} onChangePetFocus={setGroupPetFocusDraft} onChangeVisibility={setGroupVisibilityDraft} onClose={closeCreateGroupModal} onEditCover={() => editPendingGroupCover("create", groupCoverDraft)} onPickCover={pickGroupCover} onRemoveCover={() => setGroupCoverDraft(null)} onSaveCoverCrop={saveGroupCoverCrop} onSubmit={handleCreateGroup} />
      <ConfirmDeleteModal row={pendingDeleteRow} onCancel={() => setPendingDeleteRow(null)} onConfirm={confirmDeleteConversation} />
      <MatchModal modal={matchModal} onClose={closeMatchModal} onQuickHello={() => void sendMatchQuickHello()} quickHello={matchQuickHello} self={selfMatchProfile} sending={matchSending} setQuickHello={setMatchQuickHello} />
      <NativePublicProfileModal accessToken={accessToken ?? null} viewerUserId={userId} fallbackData={profileSheetFallbackData} heroPresentation="full-bleed" hideActions={profileSheetSource === "discover"} hideMatchedActions={profileSheetSource !== "discover"} sessionKey={sessionKey} showStar={profileSheetSource === "discover"} showWave={profileSheetSource === "discover"} onProfileResolved={profileSheetSource === "discover" ? handleProfileSheetResolved : undefined} onWave={handleProfileSheetWave} onClose={() => { setProfileSheetUserId(null); setProfileSheetFallbackData(null); }} onNavigate={onNavigate} open={Boolean(profileSheetUserId)} profileUserId={profileSheetUserId} />
      <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={carerProfileOpen} onRequestClose={() => setCarerProfileOpen(false)}>
        <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
          <Pressable accessibilityLabel="Close carer profile" accessibilityRole="button" onPress={() => setCarerProfileOpen(false)} style={StyleSheet.absoluteFill} />
          <AppModalCard fullHeight>
            <AppBottomSheetHeader>
              <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>Pet Carer Profile</Text>
              <AppModalCloseButton onPress={() => setCarerProfileOpen(false)} />
            </AppBottomSheetHeader>
            <AppModalScroll>
              {carerProfileError ? (
                <View style={styles.carerProfileState}><Text style={styles.carerProfileStateText}>{carerProfileError}</Text></View>
              ) : carerProfile ? (
                <NativeCarerProfileContent provider={carerProfile} accessToken={accessToken} />
              ) : carerProfileLoading ? (
                <View style={styles.carerProfileState}><NativeLoadingState variant="inline" /></View>
              ) : null}
            </AppModalScroll>
          </AppModalCard>
        </View>
      </Modal>
      <NativeSocialReportModal
        accessToken={accessToken}
        chatRoomId={groupMemberReportChatId}
        currentUserId={userId}
        onClose={() => {
          setGroupMemberReportTarget(null);
          setGroupMemberReportChatId(null);
        }}
        onNotice={setStatus}
        open={Boolean(groupMemberReportTarget)}
        sessionKey={sessionKey}
        source="Group Chat"
        sourceOrigin="friends chats"
        subject={groupMemberReportChatId ? { type: "group_chat", id: groupMemberReportChatId, label: "Group Chat" } : null}
        target={groupMemberReportTarget ? {
          userId: groupMemberReportTarget.userId,
          author: {
            displayName: groupMemberReportTarget.name,
            socialId: null,
            avatarUrl: groupMemberReportTarget.avatarUrl,
            verificationStatus: null,
            locationCountry: null,
            isVerified: false,
            nonSocial: false,
          },
        } : null}
      />
      <ConfirmStarModal
        errorMessage={starConfirmMessage}
        loading={starActionLoading}
        pending={confirmStarPending}
        target={confirmStarTarget}
        onCancel={cancelConfirmStar}
        onConfirm={() => void executeConfirmedStar()}
        onMeasureSendButton={(rect) => setConfirmStarButtonRect(rect)}
      />
      <DiscoverySendCue cue={discoverySendCue} />
    </View>
  );
}

// Countdown chip for upcoming events; while an event is in progress it
// switches to a live badge — green pulse dot + "Event happening — N going"
// (going count shown only when more than 3, so small events don't read empty).
function GroupEventCountdownBadge({ countdown, goingCount = 0 }: { countdown: GroupEventCountdown | null; goingCount?: number }) {
  if (!countdown) return null;
  const label = countdown.active && goingCount > 3 ? `${countdown.label} — ${goingCount} going` : countdown.label;
  return (
    <NativeGlassSurface glassFillStyle={styles.exploreEventCountdownGlassFill} intensity="clear" style={styles.exploreEventCountdown}>
      <View pointerEvents="none" style={styles.exploreEventCountdownGreenTint} />
      {countdown.active ? <View style={styles.exploreEventCountdownDotWrap}><NativeGroupLiveDot /></View> : null}
      <Text numberOfLines={1} style={[nativeModalStyles.appGroupHeroChip, styles.exploreEventCountdownText]}>{label}</Text>
    </NativeGlassSurface>
  );
}

const sentenceCaseTag = (value: string) => {
  const clean = String(value || "").trim();
  if (!clean) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

function ExploreGroupCard({ accessToken, countdownNow, friendIds, group, index, nextEvent, onHide, onOpen, onPrimaryAction, outIds }: { accessToken?: string | null; countdownNow: number; friendIds: Set<string>; group: NativeExploreGroup; index: number; nextEvent?: GroupCoverNextEvent | null; onHide: (groupId: string) => void; onOpen: (group: NativeExploreGroup) => void; onPrimaryAction: (group: NativeExploreGroup) => void; outIds: Set<string> }) {
  const memberLabel = `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`;
  const ctaLabel = group.joined ? "Open Group" : group.invitePending ? "You're invited" : group.requested ? "Requested" : group.joinMethod === "instant" ? "Join" : "Request to join";
  const eventCountdown = groupNextEventCountdownLabel(group.nextEventStartsAt || nextEvent?.startsAt, group.nextEventEndsAt || nextEvent?.endsAt, countdownNow);
  const [previewMembers, setPreviewMembers] = useState<NativeGroupManagementSnapshot["members"] | null>(() => peekNativeGroupPreviewMembers(group.id));
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchNativeGroupPreviewMembers(group.id, { accessToken })
        .catch(() => null)
        .then((members) => {
          if (cancelled || !members) return;
          setPreviewMembers((current) => {
            const currentKey = (current || []).map((member) => `${member.userId}:${member.avatarUrl || ""}`).join("|");
            const nextKey = members.map((member) => `${member.userId}:${member.avatarUrl || ""}`).join("|");
            return currentKey === nextKey ? current : members;
          });
        });
    }, Math.min(index, 8) * 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [accessToken, group.id, index]);
  const outNowCount = useMemo(() => {
    if (!previewMembers || previewMembers.length === 0) return 0;
    if (outIds.size === 0) return 0;
    return previewMembers.filter((member) => outIds.has(member.userId)).length;
  }, [outIds, previewMembers]);
  const stackMembers = [...(previewMembers || [])]
    .sort((left, right) => {
      const leftRank = outIds.has(left.userId) ? (friendIds.has(left.userId) ? 0 : 1) : friendIds.has(left.userId) ? 2 : 3;
      const rightRank = outIds.has(right.userId) ? (friendIds.has(right.userId) ? 0 : 1) : friendIds.has(right.userId) ? 2 : 3;
      return leftRank - rightRank || left.userId.localeCompare(right.userId);
    })
    .slice(0, 4);
  return (
    <View style={nativeModalStyles.appContentCard}>
      <Pressable accessibilityLabel={`Open ${group.name} details`} onPress={() => onOpen(group)} style={styles.exploreCover}>
        <ResilientAvatarImage fallback={<NativeAuroraCover initial={group.name} seed={group.id} style={StyleSheet.absoluteFill} />} style={styles.exploreCoverImage} uri={group.avatarUrl} version={group.lastMessageAt || group.createdAt || group.id} />
        <View style={styles.exploreScrim} />
        {stackMembers.length === 0 ? <Text style={styles.exploreMembers}>{memberLabel}</Text> : null}
        <Pressable accessibilityLabel={`Hide ${group.name}`} onPress={(event) => { event.stopPropagation(); onHide(group.id); }} hitSlop={8} style={styles.exploreHideButton}>
          <Feather color={huddleColors.blue} name="x" size={18} />
        </Pressable>
        <View style={styles.exploreOverlay}>
          <GroupEventCountdownBadge countdown={eventCountdown} goingCount={nextEvent?.rsvpCount ?? 0} />
          <Text numberOfLines={1} style={styles.exploreTitle}>{group.name}</Text>
          {group.locationLabel ? <View style={styles.exploreMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={styles.exploreMeta}>{group.locationLabel}</Text></View> : null}
          {group.petFocus.length > 0 ? (
            <View style={[nativeModalStyles.appGroupHeroChips, stackMembers.length > 0 ? styles.exploreChipRowWithFaces : null]}>
              {group.petFocus.slice(0, 4).map((tag) => <Text key={tag} style={[nativeModalStyles.appGroupHeroChip, styles.exploreChipSentence]}>{sentenceCaseTag(tag)}</Text>)}
            </View>
          ) : null}
        </View>
        {stackMembers.length > 0 ? (
          <View style={styles.exploreFaceStack}>
            {stackMembers.map((member, memberIndex) => (
              <View key={member.userId} style={[styles.exploreFaceStackItem, outIds.has(member.userId) ? styles.exploreFaceStackItemOut : null, memberIndex > 0 && styles.exploreFaceStackOverlap]}>
                <ResilientAvatarImage
                  fallback={<View style={styles.exploreFaceStackFallback}><Feather color={huddleColors.blue} name="user" size={14} /></View>}
                  style={styles.exploreFaceStackImage}
                  uri={member.avatarUrl}
                  version={member.userId}
                />
              </View>
            ))}
            {group.memberCount > stackMembers.length ? (
              <View style={[styles.exploreFaceStackItem, styles.exploreFaceStackOverlap, styles.exploreFaceStackMore]}>
                <Text style={styles.exploreFaceStackMoreText}>+{group.memberCount - stackMembers.length}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
      <View style={[styles.exploreBody, stackMembers.length > 0 && styles.exploreBodyWithStack]}>
        {outNowCount > 0 ? (
          <View style={styles.exploreOutNowRow}>
            <NativeGroupLiveDot />
            <Text style={styles.exploreOutNowText}>{outNowCount} member{outNowCount === 1 ? " is" : "s are"} out now</Text>
          </View>
        ) : null}
        {group.description ? <Text numberOfLines={2} style={styles.exploreDescription}>{group.description}</Text> : null}
        <Pressable disabled={!group.joined && group.requested} onPress={() => onPrimaryAction(group)} style={[nativeModalStyles.appPrimaryPillButton, group.invitePending && styles.exploreCtaInvite, !group.joined && group.requested && styles.exploreCtaDisabled]}>
          <Text style={[styles.exploreCtaText, group.requested && styles.exploreCtaDisabledText]}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GroupInviteInboxSheet({
  groups,
  onClose,
  onConfirm,
  onOpenGroup,
  open,
}: {
  groups: NativeExploreGroup[];
  open: boolean;
  onClose: () => void;
  onConfirm: (decisions: Record<string, "accept" | "decline">) => Promise<void>;
  onOpenGroup: (group: NativeExploreGroup) => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, "accept" | "decline">>({});
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) setDecisions({});
  }, [open]);
  if (!open) return null;
  const selectedCount = Object.keys(decisions).length;
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}>
          <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}>
        <AppBottomSheet onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Group invites</Text>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
		          <AppBottomSheetScroll>
            <View style={styles.inviteInboxList}>
              {groups.map((group) => {
                const decision = decisions[group.id];
                return (
                  <View key={group.id} style={styles.inviteInboxRow}>
                    <Pressable accessibilityLabel={`Open ${group.name} invite`} onPress={() => onOpenGroup(group)} style={styles.inviteInboxIdentity}>
                      <View style={styles.inviteInboxAvatar}>
                        <ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={22} />} style={styles.inviteInboxAvatarImage} uri={group.avatarUrl} version={group.lastMessageAt || group.createdAt || group.id} />
                      </View>
                      <View style={styles.inviteInboxCopy}>
                        <Text numberOfLines={1} style={styles.inviteInboxName}>{group.name}</Text>
                        <Text numberOfLines={1} style={styles.inviteInboxMeta}>{group.inviterName ? `Invited by ${group.inviterName}` : `${group.memberCount || 0} members`}</Text>
                      </View>
                    </Pressable>
                    <View style={styles.inviteInboxActions}>
                      <Pressable accessibilityLabel={`Decline ${group.name}`} onPress={() => setDecisions((current) => ({ ...current, [group.id]: "decline" }))} style={[styles.requestDecisionIcon, decision === "accept" && styles.requestDecisionMuted, decision === "decline" && styles.requestDecisionRejectActive]}>
                        <Feather color={decision === "decline" ? huddleColors.onPrimary : huddleColors.validationRed} name="x" size={16} />
                      </Pressable>
                      <Pressable accessibilityLabel={`Accept ${group.name}`} onPress={() => setDecisions((current) => ({ ...current, [group.id]: "accept" }))} style={[styles.requestDecisionIcon, decision === "decline" && styles.requestDecisionMuted, decision === "accept" && styles.requestDecisionApproveActive]}>
                        <Feather color={decision === "accept" ? huddleColors.onPrimary : huddleColors.blue} name="check" size={16} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              {groups.length === 0 ? <Text style={nativeModalStyles.appModalMutedBody}>No pending group invites.</Text> : null}
            </View>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <AppModalButton disabled={selectedCount === 0 || confirming} loading={confirming} onPress={() => {
              setConfirming(true);
              void onConfirm(decisions).finally(() => setConfirming(false));
            }}>
              <Text style={styles.modalPrimaryLabel}>Confirm</Text>
            </AppModalButton>
	          </AppBottomSheetFooter>
		        </AppBottomSheet>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function GroupInvitePromptModal({
  group,
  onClose,
  onJoin,
}: {
  group: NativeExploreGroup | null;
  onClose: () => void;
  onJoin: (group: NativeExploreGroup) => void;
}) {
  if (!group) return null;
  const inviter = group.inviterName || "Someone";

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(group)}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, styles.groupInvitePromptBackdrop]} onPress={onClose}>
        <Pressable style={styles.groupInvitePromptCard} onPress={(event) => event.stopPropagation()}>
          <Text style={nativeModalStyles.appModalSheetTitle}>Group invite 🐾</Text>
          <Text style={nativeModalStyles.appModalBody}>
            <Text style={styles.modalBold}>{inviter}</Text>
            {" invited you to join "}
            <Text style={styles.modalBold}>{group.name || "Group"}</Text>
            {". Want to hop in?"}
          </Text>
          <View style={nativeModalStyles.appModalActionRow}>
            <View style={nativeModalStyles.appModalActionItem}>
              <Pressable accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalSecondaryButton}>
                <Text style={styles.modalSecondaryLabel}>Not now</Text>
              </Pressable>
            </View>
            <View style={nativeModalStyles.appModalActionItem}>
              <Pressable accessibilityRole="button" onPress={() => onJoin(group)} style={nativeModalStyles.appModalPrimaryButton}>
                <Text style={styles.modalPrimaryLabel}>Join group</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DiscoveryFilterModal({
  effectiveTier,
  filters,
  filterRow,
  onApply,
  onClose,
  onLockedFilter,
  onSetFilterRow,
  open,
}: {
  effectiveTier: "free" | "plus" | "gold";
  filters: NativeChatDiscoveryFilters;
  filterRow: keyof NativeChatDiscoveryFilters | null;
  onApply: (filters: NativeChatDiscoveryFilters) => void;
  onClose: () => void;
  onLockedFilter: (tier: StarUpgradeTier) => void;
  onSetFilterRow: (row: keyof NativeChatDiscoveryFilters | null) => void;
  open: boolean;
}) {
  const [expandedTier, setExpandedTier] = useState<StarUpgradeTier | null>(null);
  const [draftFilters, setDraftFilters] = useState<NativeChatDiscoveryFilters>(filters);
  const filterScrollRef = useRef<ScrollView | null>(null);
  const patch = (next: Partial<NativeChatDiscoveryFilters>) => {
    setDraftFilters((current) => sanitizeDiscoveryFilters({ ...current, ...next }));
  };
  const centerFilterRow = (row: keyof NativeChatDiscoveryFilters) => {
    const rowIndex = FILTER_ROWS.findIndex((item) => item.key === row);
    if (rowIndex < 0) return;
    setTimeout(() => {
      filterScrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, (rowIndex * 74) - (FILTER_SHEET_SCROLL_MAX_HEIGHT * 0.36)),
      });
    }, 80);
  };
  const toggleFilterRow = (row: keyof NativeChatDiscoveryFilters, expanded: boolean) => {
    const next = expanded ? null : row;
    onSetFilterRow(next);
    if (next) centerFilterRow(next);
  };
  const handleReset = () => {
    setDraftFilters({ ...DEFAULT_FILTERS });
    onSetFilterRow(null);
    setExpandedTier(null);
  };
  const handleApply = () => {
    onApply(sanitizeDiscoveryFilters(draftFilters));
  };
  useEffect(() => {
    if (open) {
      setDraftFilters(filters);
    } else {
      setExpandedTier(null);
    }
  }, [filters, open]);
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}>
          <AppBottomSheet onClose={onClose}>
	            <AppBottomSheetHeader>
	            <Text style={nativeModalStyles.appModalSheetTitle}>Filters</Text>
            <AppModalCloseButton onPress={onClose} />
		          </AppBottomSheetHeader>
		          <ScrollView
                ref={filterScrollRef}
                bounces={false}
                contentContainerStyle={styles.filterScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.filterScroll}
              >
	            {FILTER_GROUPS.map((group) => {
                const groupLocked = group.tier !== "free" && isFilterLocked(group.tier, effectiveTier);
                const groupExpanded = group.tier === "free" || expandedTier === group.tier;
                if (group.tier !== "free") {
                  return (
                    <View key={group.title} style={styles.filterGroup}>
                      <Pressable onPress={() => groupLocked ? onLockedFilter(group.tier as StarUpgradeTier) : setExpandedTier(groupExpanded ? null : group.tier as StarUpgradeTier)} style={styles.filterCategoryRow}>
                        <Text style={[styles.filterGroupTitle, groupLocked && styles.filterLabelLocked]}>{group.title}</Text>
                        {groupLocked ? <TierAccessPill tier={group.tier as StarUpgradeTier} /> : <Feather color={huddleColors.iconSubtle} name={groupExpanded ? "chevron-up" : "chevron-down"} size={16} />}
                      </Pressable>
                      {groupExpanded ? group.rows.map((row) => {
                        const expanded = filterRow === row.key;
                        const toggleRow = isToggleFilterKey(row.key);
                        const toggleActive = toggleRow ? Boolean(draftFilters[row.key]) : false;
                        return (
                          <View key={row.key} style={styles.filterSection}>
                            <Pressable
                              onPress={() => toggleRow ? patch({ [row.key]: !draftFilters[row.key] } as Partial<NativeChatDiscoveryFilters>) : toggleFilterRow(row.key, expanded)}
                              style={styles.filterRow}
                            >
                              <View style={styles.filterTitleWrap}>
                                <Text style={styles.filterLabel}>{row.label}</Text>
                              </View>
                              {toggleRow ? (
                                <View style={[styles.nativeSwitch, toggleActive && styles.nativeSwitchActive]}><View style={[styles.nativeSwitchKnob, toggleActive && styles.nativeSwitchKnobActive]} /></View>
                              ) : (
                                <View style={styles.filterSummaryWrap}>
                                  <Text numberOfLines={1} style={styles.filterSummary}>{filterSummary(draftFilters, row.key)}</Text>
                                  <Feather color={huddleColors.iconSubtle} name={expanded ? "chevron-up" : "chevron-down"} size={16} />
                                </View>
                              )}
                            </Pressable>
                            {expanded && !toggleRow ? (
                              <View style={styles.filterInlineEditor}>
                                <FilterRowEditor filters={draftFilters} row={row.key} onPatch={patch} />
                              </View>
                            ) : null}
                          </View>
                        );
                      }) : null}
                    </View>
                  );
                }
                return (
                <View key={group.title} style={styles.filterGroup}>
                  <Text style={styles.filterGroupTitle}>{group.title}</Text>
                  {group.rows.map((row) => {
                    const expanded = filterRow === row.key;
                    const toggleRow = isToggleFilterKey(row.key);
                    const toggleActive = toggleRow ? Boolean(draftFilters[row.key]) : false;
                    return (
                      <View key={row.key} style={styles.filterSection}>
                        <Pressable
                          onPress={() => toggleRow ? patch({ [row.key]: !draftFilters[row.key] } as Partial<NativeChatDiscoveryFilters>) : toggleFilterRow(row.key, expanded)}
                          style={styles.filterRow}
                        >
                          <View style={styles.filterTitleWrap}>
                            <Text style={styles.filterLabel}>{row.label}</Text>
                          </View>
                          {toggleRow ? (
                            <View style={[styles.nativeSwitch, toggleActive && styles.nativeSwitchActive]}><View style={[styles.nativeSwitchKnob, toggleActive && styles.nativeSwitchKnobActive]} /></View>
                          ) : (
                            <View style={styles.filterSummaryWrap}>
                              <Text numberOfLines={1} style={styles.filterSummary}>{filterSummary(draftFilters, row.key)}</Text>
                              <Feather color={huddleColors.iconSubtle} name={expanded ? "chevron-up" : "chevron-down"} size={16} />
                            </View>
                          )}
                        </Pressable>
                        {expanded && !toggleRow ? (
                          <View style={styles.filterInlineEditor}>
                            <FilterRowEditor filters={draftFilters} row={row.key} onPatch={patch} />
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )})}
		          </ScrollView>
          <AppBottomSheetFooter>
            <AppModalActionRow>
              <AppModalButton variant="secondary" onPress={handleReset}><Text style={styles.modalSecondaryLabel}>Reset</Text></AppModalButton>
              <AppModalButton onPress={handleApply}><Text style={styles.modalPrimaryLabel}>Apply Filters</Text></AppModalButton>
            </AppModalActionRow>
	          </AppBottomSheetFooter>
	          </AppBottomSheet>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TierAccessPill({ tier }: { tier: StarUpgradeTier }) {
  const isGold = tier === "gold";
  return (
    <View style={[styles.filterTierPill, isGold ? styles.filterTierPillGold : styles.filterTierPillPlus]}>
      <Text style={styles.filterTierPillText}>{isGold ? "huddle＊" : "huddle+"}</Text>
    </View>
  );
}

function FilterRowEditor({ filters, onPatch, row }: { filters: NativeChatDiscoveryFilters; onPatch: (next: Partial<NativeChatDiscoveryFilters>) => void; row: keyof NativeChatDiscoveryFilters }) {
  if (row === "ageMin" || row === "heightMin" || row === "experienceYearsMin") {
    const minKey = row;
    const maxKey = row === "ageMin" ? "ageMax" : row === "heightMin" ? "heightMax" : "experienceYearsMax";
    const min = Number(filters[minKey]);
    const max = Number(filters[maxKey]);
    const floor = row === "ageMin" ? 16 : row === "heightMin" ? 100 : 0;
    const ceiling = row === "ageMin" ? 99 : row === "heightMin" ? DISCOVERY_HEIGHT_MAX_CM : 99;
    const suffix = row === "heightMin" ? " cm" : row === "experienceYearsMin" ? " years" : "";
    return (
      <HuddleRangeControl
        max={ceiling}
        min={floor}
        step={1}
        suffix={suffix}
        values={[min, max]}
        onChange={([nextMin, nextMax]) => onPatch({ [minKey]: nextMin, [maxKey]: nextMax } as Partial<NativeChatDiscoveryFilters>)}
      />
    );
  }
  if (row === "maxDistanceKm") {
    return (
      <HuddleSingleRangeControl
        max={DISCOVERY_MAX_RADIUS_KM}
        min={0}
        step={1}
        suffix=" km"
        value={filters.maxDistanceKm}
        onChange={(maxDistanceKm) => onPatch({ maxDistanceKm })}
      />
    );
  }
  if (row === "hasCar" || row === "verifiedOnly" || row === "whoWavedAtMe" || row === "activeOnly") {
    const label = row === "hasCar" ? "Show users with Car Badge" : row === "verifiedOnly" ? "Show only Verified Users" : row === "whoWavedAtMe" ? "Show users who waved at you" : "Show Active Users only (24h)";
    return <Pressable onPress={() => onPatch({ [row]: !filters[row] } as Partial<NativeChatDiscoveryFilters>)} style={styles.toggleRow}><Text style={styles.filterLabel}>{label}</Text><View style={[styles.nativeSwitch, filters[row] && styles.nativeSwitchActive]}><View style={[styles.nativeSwitchKnob, filters[row] && styles.nativeSwitchKnobActive]} /></View></Pressable>;
  }
  const options = row === "genders" ? ALL_GENDERS : row === "species" ? ALL_SPECIES : row === "socialRoles" ? ALL_SOCIAL_ROLES : row === "orientations" ? ALL_ORIENTATIONS : row === "degrees" ? ALL_DEGREES : row === "relationshipStatuses" ? ALL_RELATIONSHIP_STATUSES : ALL_LANGUAGES;
  const selected = filters[row] as string[];
  return <InlineMultiSelect options={options} values={selected} onChange={(values) => onPatch({ [row]: values } as Partial<NativeChatDiscoveryFilters>)} />;
}

function InlineMultiSelect({ onChange, options, values }: { onChange: (values: string[]) => void; options: string[]; values: string[] }) {
  return (
    <View style={styles.inlineSelectLayer}>
      <ScrollView nestedScrollEnabled style={styles.selectMenu}>
        {options.map((option, index) => {
          const selected = values.includes(option);
          const nextValues = selected ? values.filter((item) => item !== option) : [...values, option];
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              key={`${option}-${index}`}
              onPress={() => onChange(nextValues.length === options.length ? [] : nextValues)}
              style={({ pressed }) => [styles.selectOption, pressed ? styles.pressed : null]}
            >
              <Text style={styles.selectOptionText}>{option}</Text>
              {selected ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.selectCheckSlot} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function GroupDetailsModal({
  accessToken,
  countdownNow,
  currentUserId,
  detailsErrors,
  descriptionEdit,
  editCover,
  group,
  hideOpenChatButton = false,
  countryLabel,
  locationBiasPoint,
  locationEdit,
  management,
  managementError,
  managementLoading,
  muted,
  nameEdit,
  petFocusEdit,
  onChangeDescriptionEdit,
  onChangeCountryEdit,
  onChangeLocationEdit,
  onChangeNameEdit,
  onChangePetFocusEdit,
  onClose,
  onCancelInvite,
  onInviteMembers,
  onDeclineInvite,
  onBlockMember,
  onJoin,
  onLeaveGroup,
  onOpenChat,
  onOpenMemberProfile,
  onPickCover,
  coverCropAsset,
  onCancelCoverCrop,
  onSaveCoverCrop,
  onReportMember,
  onRemoveMember,
  onRequestAction,
  onRemoveGroup,
  onSaveDetails,
  onToggleMute,
  selectableMembers,
}: {
  accessToken?: string | null;
  countdownNow: number;
  currentUserId: string | null;
  countryLabel: string | null;
  detailsErrors: GroupDetailsErrors;
  descriptionEdit: string;
  editCover: PendingGroupCover | null;
  group: NativeExploreGroup | NativeChatInboxRow | null;
  hideOpenChatButton?: boolean;
  locationBiasPoint?: { lat: number; lng: number } | null;
  management: NativeGroupManagementSnapshot | null;
  managementError: boolean;
  managementLoading: boolean;
  muted?: boolean;
  nameEdit: string;
  locationEdit: string;
  petFocusEdit: string[];
  selectableMembers: Array<{ id: string; name: string; avatarUrl: string | null; isVerified: boolean; socialId?: string | null }>;
  onChangeDescriptionEdit: (value: string) => void;
  onChangeCountryEdit?: (value: string | null) => void;
  onChangeLocationEdit: (value: string) => void;
  onChangeNameEdit: (value: string) => void;
  onChangePetFocusEdit: (value: string[]) => void;
  onClose: () => void;
  onCancelInvite: (group: NativeExploreGroup | NativeChatInboxRow, invite: NativeGroupManagementSnapshot["pendingInvites"][number]) => void;
  onDeclineInvite: (group: NativeExploreGroup) => void;
  onInviteMembers: (group: NativeExploreGroup | NativeChatInboxRow, ids: string[]) => void;
  onBlockMember: (member: NativeGroupManagementSnapshot["members"][number]) => void | Promise<void>;
  onJoin: (group: NativeExploreGroup) => void;
  onLeaveGroup: (group: NativeExploreGroup | NativeChatInboxRow) => Promise<void>;
  onOpenChat: (group: NativeExploreGroup | NativeChatInboxRow) => void;
  onOpenMemberProfile: (userId: string) => void;
  onPickCover: () => void;
  coverCropAsset: (NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null;
  onCancelCoverCrop: () => void;
  onSaveCoverCrop: (asset: NativeProfileUploadAsset) => Promise<void>;
  onReportMember: (member: NativeGroupManagementSnapshot["members"][number]) => void;
  onRemoveMember: (group: NativeExploreGroup | NativeChatInboxRow, memberId: string) => void | Promise<void>;
  onRequestAction: (group: NativeExploreGroup | NativeChatInboxRow, request: NativeGroupManagementSnapshot["joinRequests"][number], action: "approve" | "decline") => Promise<void>;
  onRemoveGroup: (group: NativeExploreGroup | NativeChatInboxRow) => Promise<void>;
  onSaveDetails: () => void;
  onToggleMute: (group: NativeExploreGroup | NativeChatInboxRow, muted: boolean) => Promise<void>;
}) {
  const [inviteDraft, setInviteDraft] = useState<string[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<NativeSocialMentionSuggestion[]>([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [inviteEditorOpen, setInviteEditorOpen] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [manualLocationAllowedQuery, setManualLocationAllowedQuery] = useState<string | null>(null);
  const [locationPinError, setLocationPinError] = useState("");
  const [locationSelectionError, setLocationSelectionError] = useState(false);
  const acceptedLocationRef = useRef<string | null>(null);
  const [groupNameFocused, setGroupNameFocused] = useState(false);
  const [groupDescriptionFocused, setGroupDescriptionFocused] = useState(false);
  const [groupLocationFocused, setGroupLocationFocused] = useState(false);
  const [groupInviteFocused, setGroupInviteFocused] = useState(false);
  const [groupPetOtherFocused, setGroupPetOtherFocused] = useState(false);
  const [expandedMetaEditor, setExpandedMetaEditor] = useState<"location" | "pet" | null>(null);
  const [petFocusOpen, setPetFocusOpen] = useState(false);
  const [petFocusOther, setPetFocusOther] = useState("");
  const [petFocusBreedOpen, setPetFocusBreedOpen] = useState<string | null>(null);
  const [memberActionTarget, setMemberActionTarget] = useState<NativeGroupManagementSnapshot["members"][number] | null>(null);
  const [memberActionConfirm, setMemberActionConfirm] = useState<{ member: NativeGroupManagementSnapshot["members"][number]; mode: "block" | "remove" } | null>(null);
  const [memberActionBusy, setMemberActionBusy] = useState<"block" | "remove" | null>(null);
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false);
  const [requestDecisions, setRequestDecisions] = useState<Record<string, "approve" | "decline">>({});
  const [requestErrors, setRequestErrors] = useState<Record<string, boolean>>({});
  const [requestConfirming, setRequestConfirming] = useState(false);
  const [groupActionConfirm, setGroupActionConfirm] = useState<"leave" | "remove" | null>(null);
  const [groupActionBusy, setGroupActionBusy] = useState<"mute" | "leave" | "remove" | null>(null);
  const [detailGroupEvents, setDetailGroupEvents] = useState<NativeGroupChatEvent[]>([]);
  const groupDetailsScrollRef = useRef<ScrollView | null>(null);
  const groupDetailsFieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [groupDetailsKeyboardHeight, setGroupDetailsKeyboardHeight] = useState(0);
  const [groupDetailsFooterHeight, setGroupDetailsFooterHeight] = useState(0);
  const activeGroupId = group ? "chatId" in group ? group.chatId : group.id : null;
  const activeGroupIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeGroupIdRef.current === activeGroupId) return;
    activeGroupIdRef.current = activeGroupId;
    acceptedLocationRef.current = locationEdit.trim() || null;
    setManualLocationAllowedQuery(null);
    setLocationSelectionError(false);
    setLocationPinError("");
  }, [activeGroupId, locationEdit]);
  useEffect(() => {
    setInviteDraft([]);
    setInviteSearch("");
    setInviteSearchResults([]);
    setInviteEditorOpen(false);
    setJoinRequestsOpen(false);
    setRequestDecisions({});
    setRequestErrors({});
    setMemberActionTarget(null);
    setMemberActionConfirm(null);
  }, [activeGroupId]);
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => setGroupDetailsKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setGroupDetailsKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  useEffect(() => {
    const query = inviteSearch.trim();
    if (!inviteEditorOpen || query.length < 1) {
      setInviteSearchResults([]);
      setInviteSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setInviteSearching(true);
      void searchNativeSocialMentionSuggestions(query, currentUserId)
        .then((results) => {
          if (!cancelled) setInviteSearchResults(results);
        })
        .catch(() => {
          if (!cancelled) setInviteSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setInviteSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentUserId, inviteEditorOpen, inviteSearch]);
  useEffect(() => {
    const trimmed = locationEdit.trim();
    if (trimmed.length < 2) {
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
      setLocationSearching(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLocationSearching(true);
      void fetchNativePrioritizedLocationSuggestions(trimmed, { biasPoint: locationBiasPoint ?? null, selectedCountry: countryLabel })
        .then((results) => {
          if (!active) return;
          setLocationSuggestions(results);
          setManualLocationAllowedQuery(results.length === 0 ? trimmed : null);
          setLocationSearchOpen(results.length > 0);
        })
        .catch(() => {
          if (active) {
            setLocationSuggestions([]);
            setManualLocationAllowedQuery(null);
          }
        })
        .finally(() => {
          if (active) setLocationSearching(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [countryLabel, locationBiasPoint, locationEdit]);
  useEffect(() => {
    if (inviteEditorOpen) scrollGroupDetailsFieldIntoView("invite", huddleSpacing.x9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteEditorOpen, inviteSearchResults.length, inviteSearching]);
  useEffect(() => {
    if (locationSearchOpen) scrollGroupDetailsFieldIntoView("location", huddleSpacing.x9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSearchOpen, locationSuggestions.length, locationSearching]);
  useEffect(() => {
    if (!activeGroupId) {
      setDetailGroupEvents([]);
      return;
    }
    let active = true;
    void fetchNativeGroupChatEvents(activeGroupId, { accessToken })
      .then((events) => {
        if (active) setDetailGroupEvents(events);
      })
      .catch(() => {
        if (active) setDetailGroupEvents([]);
      });
    return () => {
      active = false;
    };
  }, [accessToken, activeGroupId]);
  if (!group) return null;
  const isExplore = "invitePending" in group;
  const isJoinedGroup = !isExplore || group.joined === true;
  const currentMemberRole = management?.members.find((member) => member.userId === currentUserId)?.role?.toLowerCase() || "";
  const currentMemberMuted = muted ?? (management?.members.find((member) => member.userId === currentUserId)?.isMuted === true);
  const canManage = Boolean(isJoinedGroup && currentUserId && (("createdBy" in group && group.createdBy === currentUserId) || currentMemberRole === "admin" || currentMemberRole === "creator"));
  const groupDetailsEditingActive = groupDetailsKeyboardHeight > 0 || groupNameFocused || groupDescriptionFocused || groupLocationFocused || groupInviteFocused || groupPetOtherFocused;
  const handleSaveDetails = () => {
    const trimmed = locationEdit.trim();
    if (trimmed && acceptedLocationRef.current !== trimmed && manualLocationAllowedQuery !== trimmed) {
      setLocationSelectionError(true);
      setLocationSearchOpen(true);
      scrollGroupDetailsFieldIntoView("location", huddleSpacing.x8);
      return;
    }
    onSaveDetails();
  };
  const applyCurrentLocationEdit = (loc: NativeResolvedLocation) => {
    const selectedLocation = loc.district || loc.label;
    acceptedLocationRef.current = selectedLocation;
    setManualLocationAllowedQuery(null);
    setLocationPinError("");
    setLocationSuggestions([]);
    setLocationSearchOpen(false);
    onChangeLocationEdit(selectedLocation);
  };
  const name = "chatName" in group ? group.chatName || "Group" : group.name;
  const avatarUrl = "avatarUrl" in group ? group.avatarUrl : null;
  const memberCount = "memberCount" in group ? group.memberCount : 0;
  const description = "description" in group ? group.description : null;
  const visibleDescription = isJoinedGroup ? descriptionEdit : description;
  const locationLabel = "locationLabel" in group ? group.locationLabel : null;
  const petFocus = "petFocus" in group ? group.petFocus : [];
  const petFocusSpecies = petFocusEdit.map((item) => splitNativePetFocusLabel(item).species);
  const previewPetFocus = petFocusEdit.length > 0 ? petFocusEdit : petFocus;
  const memberLabel = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  const detailNextEvent = pickActiveOrNextGroupEvent(detailGroupEvents, countdownNow);
  const eventCountdown = "nextEventStartsAt" in group ? groupNextEventCountdownLabel(group.nextEventStartsAt || detailNextEvent?.startsAt, group.nextEventEndsAt || detailNextEvent?.endsAt, countdownNow) : groupNextEventCountdownLabel(detailNextEvent?.startsAt, detailNextEvent?.endsAt, countdownNow);
  const sortedMembers = management?.members ? sortGroupMembers(management.members, group, currentUserId) : [];
  const excludedInviteIds = new Set([
    ...(management?.members ?? []).map((member) => member.userId),
    ...(management?.pendingInvites ?? []).map((invite) => invite.userId),
  ]);
  const inviteQuery = inviteSearch.trim().toLowerCase().replace(/^@/, "");
  const inviteSuggestions = inviteSearchResults
    .filter((member) => {
      const userId = String(member.userId || "").trim();
      const displayName = String(member.displayName || "").trim();
      const socialId = String(member.socialId || "").trim().replace(/^@/, "");
      if (!userId || (!displayName && !socialId)) return false;
      if (userId === currentUserId || excludedInviteIds.has(userId)) return false;
      return !inviteQuery || displayName.toLowerCase().includes(inviteQuery) || socialId.toLowerCase().includes(inviteQuery);
    })
    .slice(0, 3);
  const topInviteSuggestions = selectableMembers
    .filter((member) => member.id !== currentUserId && !excludedInviteIds.has(member.id) && String(member.name || "").trim())
    .slice(0, 3);
  const visibleInviteSuggestions = inviteSearch.trim() ? inviteSuggestions : topInviteSuggestions;
  const selectedRequestCount = Object.keys(requestDecisions).length;
  const toggleGroupMute = async () => {
    if (groupActionBusy) return;
    setGroupActionBusy("mute");
    try {
      await onToggleMute(group, !currentMemberMuted);
    } finally {
      setGroupActionBusy(null);
    }
  };
  const confirmGroupAction = async () => {
    if (!groupActionConfirm || groupActionBusy) return;
    const action = groupActionConfirm;
    setGroupActionBusy(action);
    try {
      if (action === "remove") await onRemoveGroup(group);
      else await onLeaveGroup(group);
    } catch {
      // Parent callback owns the user-facing error copy.
    } finally {
      setGroupActionBusy(null);
      setGroupActionConfirm(null);
    }
  };
  const registerGroupDetailsField = (key: string) => (event: { nativeEvent: { layout: { height: number; y: number } } }) => {
    groupDetailsFieldLayoutsRef.current[key] = event.nativeEvent.layout;
  };
  function scrollGroupDetailsFieldIntoView(target: string, extraOffset = 0) {
    if (!group) return;
    const scrollToTarget = () => {
      const fieldLayout = groupDetailsFieldLayoutsRef.current[target];
      if (!fieldLayout) return;
      const footerReserve = groupDetailsKeyboardHeight > 0 ? 0 : groupDetailsFooterHeight || (canManage || isExplore || !hideOpenChatButton ? 86 : 0);
      const visibleHeight = Math.max(220, Math.round(Dimensions.get("window").height * 0.82) - 62 - footerReserve - groupDetailsKeyboardHeight - huddleSpacing.x4);
      const fieldBottom = fieldLayout.y + fieldLayout.height + extraOffset;
      const shouldAlignToTop = target === "description" || target === "invite";
      const nextY = shouldAlignToTop
        ? Math.max(0, fieldLayout.y - huddleSpacing.x4)
        : Math.max(0, fieldBottom - visibleHeight + huddleSpacing.x4);
      groupDetailsScrollRef.current?.scrollTo({ y: nextY, animated: true });
    };
    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
    setTimeout(scrollToTarget, 360);
  }
  const confirmMemberAction = async () => {
    if (!memberActionConfirm || memberActionBusy || !group) return;
    const { member, mode } = memberActionConfirm;
    setMemberActionBusy(mode);
    try {
      if (mode === "block") await Promise.resolve(onBlockMember(member));
      else await Promise.resolve(onRemoveMember(group, member.userId));
    } finally {
      setMemberActionBusy(null);
      setMemberActionConfirm(null);
    }
  };
  const confirmJoinRequestDecisions = async () => {
    const entries = management?.joinRequests.filter((request) => requestDecisions[request.id]) ?? [];
    if (!entries.length || requestConfirming) return;
    setRequestConfirming(true);
    const nextErrors: Record<string, boolean> = {};
    for (const request of entries) {
      try {
        await onRequestAction(group, request, requestDecisions[request.id]);
      } catch {
        nextErrors[request.id] = true;
      }
    }
    setRequestErrors(nextErrors);
    setRequestDecisions((current) => Object.fromEntries(Object.keys(nextErrors).map((id) => [id, current[id]])) as Record<string, "approve" | "decline">);
    if (Object.keys(nextErrors).length === 0) setJoinRequestsOpen(false);
    setRequestConfirming(false);
  };
  const openMemberActionMenu = (member: NativeGroupManagementSnapshot["members"][number]) => {
    setMemberActionTarget((current) => current?.userId === member.userId ? null : member);
  };
  const setPetFocusBreed = (species: string, breed: string) => {
    const nextValues = petFocusEdit.map((item) => {
      const parsed = splitNativePetFocusLabel(item);
      return parsed.species === species ? buildNativePetFocusLabel(species, breed) : item;
    }).filter(Boolean);
    onChangePetFocusEdit(nextValues);
  };
  const togglePetFocusSpecies = (species: string) => {
    const customOtherSpecies = petFocusOther.trim();
    const active = species === "Others"
      ? petFocusSpecies.includes("Others") || Boolean(customOtherSpecies && petFocusSpecies.includes(customOtherSpecies))
      : petFocusSpecies.includes(species);
    const withoutAll = petFocusEdit.filter((item) => splitNativePetFocusLabel(item).species !== "All");
    let nextValues: string[];
    if (species === "All") {
      nextValues = petFocusSpecies.includes("All") ? [] : ["All"];
      setPetFocusBreedOpen(null);
    } else if (active) {
      nextValues = withoutAll.filter((item) => {
        const itemSpecies = splitNativePetFocusLabel(item).species;
        return species === "Others" ? itemSpecies !== "Others" && itemSpecies !== customOtherSpecies : itemSpecies !== species;
      });
      if (petFocusBreedOpen === species) setPetFocusBreedOpen(null);
    } else {
      if (withoutAll.length >= GROUP_PET_FOCUS_MAX) return;
      nextValues = [...withoutAll, species];
      setPetFocusBreedOpen(species === "Others" ? null : species);
    }
    onChangePetFocusEdit(nextValues);
  };
  const closeMemberActionMenu = () => {
    setMemberActionTarget(null);
  };
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close group details" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={nativeModalStyles.appBottomSheetEventBoundary}>
			        <AppBottomSheet onClose={onClose} style={styles.groupDetailsSheet}>
	          <AppBottomSheetHeader>
            {isJoinedGroup ? (
              <View style={styles.groupHeaderActionCluster}>
                <Pressable disabled={groupActionBusy === "mute"} onPress={() => { void toggleGroupMute(); }} style={({ pressed }) => [styles.groupHeaderActionButton, pressed && styles.pressed, groupActionBusy === "mute" && styles.actionDisabled]}>
                  <Feather color={huddleColors.text} name={currentMemberMuted ? "bell-off" : "bell"} size={17} />
                </Pressable>
	                <Pressable onPress={() => setGroupActionConfirm(canManage ? "remove" : "leave")} style={({ pressed }) => [styles.groupHeaderActionButton, styles.groupHeaderDangerButton, pressed && styles.pressed]}>
	                  <Feather color={huddleColors.validationRed} name="log-out" size={17} />
	                </Pressable>
	              </View>
            ) : null}
            <View style={styles.groupDetailsHeaderSpacer} />
            <AppModalCloseButton onPress={onClose} />
	          </AppBottomSheetHeader>
		          <ScrollView
                ref={groupDetailsScrollRef}
                bounces
              contentContainerStyle={[nativeModalStyles.appModalScrollContent, styles.groupDetailsScrollContent]}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={false}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={styles.groupDetailsScroll}
              >
	            <View style={styles.groupDetailsBody}>
              {isJoinedGroup && canManage ? (
                <View style={styles.groupEditControls}>
	                  <View style={styles.createNameRow}>
	                    <Pressable accessibilityLabel="Change group avatar" onPress={onPickCover} style={[styles.createAvatarButton, detailsErrors.cover ? styles.createAvatarButtonError : null]}>
                      {editCover?.uri ? (
                        <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(editCover.uri, editCover.uri)} source={{ uri: nativeFreshImageUri(editCover.uri, editCover.uri) }} style={styles.createAvatarImage} transition={120} />
                      ) : avatarUrl ? (
                        <ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={26} />} style={styles.createAvatarImage} uri={avatarUrl} version={groupImageVersion(group, avatarUrl)} />
                      ) : (
                        <Feather color={huddleColors.blue} name="users" size={26} />
                      )}
                    </Pressable>
		            <View style={styles.createNameField}>
	                      <AppModalField
	                        accessibilityLabel="Group name"
	                        error={detailsErrors.name}
                          focused={groupNameFocused}
                          onBlur={() => setGroupNameFocused(false)}
	                        onChangeText={onChangeNameEdit}
                          onFocus={() => setGroupNameFocused(true)}
                        placeholder="Group name"
                        returnKeyType="done"
                        style={[styles.createTextField, styles.groupDetailsNameField]}
                        value={nameEdit}
                      />
	                    </View>
	                  </View>
	                  {detailsErrors.name ? <Text style={styles.createErrorText}>Add a group name to continue.</Text> : null}
	                  {detailsErrors.cover ? <Text style={styles.createErrorText}>Add a group cover photo to continue.</Text> : null}
                  <View>
	                    <Text style={styles.createLabel}>Description</Text>
	                    <View style={[styles.createPreviewCard, detailsErrors.cover ? styles.createPreviewCardError : null]}>
	                      <View style={nativeModalStyles.appGroupHero}>
	                        {editCover?.uri ? (
	                          <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(editCover.uri, editCover.uri)} source={{ uri: nativeFreshImageUri(editCover.uri, editCover.uri) }} style={nativeModalStyles.appGroupHeroImage} transition={120} />
                        ) : avatarUrl ? (
                          <ResilientAvatarImage fallback={<NativeAuroraCover initial={name} seed={"id" in group ? group.id : group.chatId} style={StyleSheet.absoluteFill} />} style={nativeModalStyles.appGroupHeroImage} uri={avatarUrl} version={groupImageVersion(group, avatarUrl)} />
                        ) : (
                          <LinearGradient colors={[huddleColors.blueSoft, huddleColors.blue]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                        )}
                        {avatarUrl || editCover?.uri ? <LinearGradient colors={["rgba(9,12,25,0.32)", "rgba(9,12,25,0)"]} pointerEvents="none" style={styles.createHeroTopScrim} /> : null}
                        {avatarUrl || editCover?.uri ? <LinearGradient colors={["rgba(9,12,25,0)", "rgba(9,12,25,0.34)", "rgba(9,12,25,0.72)"]} pointerEvents="none" style={styles.createHeroBottomScrim} /> : null}
                        <Text style={nativeModalStyles.appGroupHeroMembers}>{memberLabel}</Text>
                        <Pressable accessibilityLabel="Change group avatar" onPress={onPickCover} style={styles.coverEmptyCameraOnly}>
                          <Feather color={huddleColors.onPrimary} name="camera" size={22} />
                        </Pressable>
                        <View style={nativeModalStyles.appGroupHeroCopy}>
                          <GroupEventCountdownBadge countdown={eventCountdown} goingCount={detailNextEvent?.rsvpCount ?? 0} />
                          <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroTitle}>{nameEdit.trim() || name}</Text>
                          {locationEdit.trim() ? <View style={nativeModalStyles.appGroupHeroMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={nativeModalStyles.appGroupHeroMeta}>{locationEdit.trim()}</Text></View> : null}
                          {petFocusEdit.length > 0 ? (
                            <View style={styles.createHeroChips}>
                              {petFocusEdit.slice(0, GROUP_PET_FOCUS_MAX).map((tag) => <Text key={tag} numberOfLines={1} style={styles.createHeroChip}>{tag}</Text>)}
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View onLayout={registerGroupDetailsField("description")} style={styles.createDescriptionWrap}>
	                        <GroupDescriptionTextArea
	                          accessibilityLabel="Group description"
	                          error={detailsErrors.description}
                            focused={groupDescriptionFocused}
                          onBlur={() => setGroupDescriptionFocused(false)}
                          onChangeText={onChangeDescriptionEdit}
                          onFocus={() => { setGroupDescriptionFocused(true); scrollGroupDetailsFieldIntoView("description", huddleSpacing.x8); }}
                          placeholder="Tell people what this group is about and how you usually meet."
                          value={descriptionEdit}
                        />
	                    </View>
	                    {detailsErrors.description ? <Text style={styles.createErrorText}>Description must be {GROUP_DESCRIPTION_WORD_LIMIT} words or fewer.</Text> : null}
	                  </View>
                  </View>
                  <View style={styles.groupMetaChipRow}>
                    <Pressable onPress={() => setExpandedMetaEditor((current) => current === "location" ? null : "location")} style={[styles.groupMetaChip, expandedMetaEditor === "location" && styles.groupMetaChipActive]}>
                      <Feather color={expandedMetaEditor === "location" ? huddleColors.onPrimary : huddleColors.iconSubtle} name="map-pin" size={16} />
                      <Text numberOfLines={1} style={[styles.groupMetaChipText, expandedMetaEditor === "location" && styles.groupMetaChipTextActive]}>{locationEdit.trim() || "Location"}</Text>
                    </Pressable>
                    <Pressable onPress={() => setExpandedMetaEditor((current) => current === "pet" ? null : "pet")} style={[styles.groupMetaChip, expandedMetaEditor === "pet" && styles.groupMetaChipActive]}>
                      <FontAwesome5 color={expandedMetaEditor === "pet" ? huddleColors.onPrimary : huddleColors.iconSubtle} name="paw" size={14} />
                      <Text numberOfLines={1} style={[styles.groupMetaChipText, expandedMetaEditor === "pet" && styles.groupMetaChipTextActive]}>{petFocusEdit.length > 0 ? petFocusEdit.join(", ") : "Pet focus"}</Text>
                    </Pressable>
                  </View>
                  {expandedMetaEditor === "location" ? (
                  <View onLayout={registerGroupDetailsField("location")}>
                    <Text style={styles.createLabel}>Location</Text>
                    <View style={[styles.locationFieldRow, groupLocationFocused ? nativeModalStyles.appModalFieldFocused : null, detailsErrors.location ? nativeModalStyles.appModalFieldError : null]}>
                      <NativeLocationPinButton
                        onError={setLocationPinError}
                        onResolved={applyCurrentLocationEdit}
                        style={styles.locationFieldPin}
                      />
                      <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                        accessibilityLabel="Group location"
                        onBlur={() => setGroupLocationFocused(false)}
                        onChangeText={(value) => {
                          acceptedLocationRef.current = null;
                          setManualLocationAllowedQuery(null);
                          setLocationPinError("");
                          setLocationSelectionError(false);
                          onChangeLocationEdit(value);
                          setLocationSearchOpen(value.trim().length >= 2);
                        }}
                        onFocus={() => {
                          setGroupLocationFocused(true);
                          if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                          scrollGroupDetailsFieldIntoView("location", huddleSpacing.x8);
                        }}
                        placeholder="Where do you usually meet?"
                        placeholderTextColor={huddleColors.mutedText}
                        style={styles.locationFieldInput}
                        value={locationEdit}
                      />
                    </View>
                    {locationPinError ? <Text style={styles.createErrorText}>{locationPinError}</Text> : null}
                    {detailsErrors.location || locationSelectionError ? <Text style={styles.createErrorText}>{locationSelectionError ? "Choose a search result, or use this exact text only when no result exists." : "Add a group location to continue."}</Text> : null}
                    {locationSearchOpen && (locationSuggestions.length > 0 || locationSearching) ? (
                      <View style={styles.locationSuggestionCard}>
                        {locationSearching && locationSuggestions.length === 0 ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                        {locationSuggestions.map((suggestion) => (
                          <Pressable
                            key={`${suggestion.label}:${suggestion.lat}:${suggestion.lng}`}
                            onPress={() => {
	                              const selectedLocation = suggestion.district || suggestion.label;
	                              acceptedLocationRef.current = selectedLocation;
	                              setManualLocationAllowedQuery(null);
	                              setLocationSelectionError(false);
	                              onChangeLocationEdit(selectedLocation);
                              onChangeCountryEdit?.(suggestion.country || extractNativeCountryFromPlaceLabel(suggestion.label) || null);
                              setLocationSearchOpen(false);
                            }}
                            style={styles.locationSuggestionRow}
                          >
                            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>
                            {suggestion.label ? <Text numberOfLines={1} style={styles.locationSuggestionMeta}>{suggestion.label}</Text> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  ) : null}
                  {expandedMetaEditor === "pet" ? (
                  <View onLayout={registerGroupDetailsField("petFocus")} style={nativeModalStyles.appModalFieldBlock}>
                    <Text style={[nativeModalStyles.appModalFieldLabel, styles.createSelectLabel]}>Pet focus</Text>
                    <Pressable accessibilityRole="button" onPress={() => setPetFocusOpen((current) => !current)} style={[nativeModalStyles.appModalSelectTrigger, styles.createSelectTrigger, petFocusOpen ? nativeModalStyles.appModalFieldFocused : null]}>
                      <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, styles.createSelectText, petFocusEdit.length === 0 ? nativeModalStyles.appModalSelectPlaceholder : null]}>
                        {petFocusEdit.length > 0 ? petFocusEdit.join(", ") : "Choose a focus"}
                      </Text>
                      <Feather color={huddleColors.mutedText} name={petFocusOpen ? "chevron-up" : "chevron-down"} size={16} />
                    </Pressable>
                    {petFocusOpen ? (
                      <View style={styles.petFocusMenu}>
                        {PET_FOCUS_OPTIONS.map((option) => {
                          const customOtherSpecies = petFocusOther.trim();
                          const active = option === "Others"
                            ? petFocusSpecies.includes("Others") || Boolean(customOtherSpecies && petFocusSpecies.includes(customOtherSpecies))
                            : petFocusSpecies.includes(option);
                          const disabled = !active && !petFocusSpecies.includes("All") && petFocusEdit.filter((item) => splitNativePetFocusLabel(item).species !== "All").length >= GROUP_PET_FOCUS_MAX;
                          return (
                            <Pressable
                              accessibilityRole="button"
                              disabled={disabled}
                              key={option}
                              onPress={() => togglePetFocusSpecies(option)}
                              style={[styles.petFocusOption, active ? styles.petFocusOptionActive : null, disabled ? nativeModalStyles.disabled : null]}
                            >
                              <Text style={[styles.petFocusOptionText, active ? styles.petFocusOptionTextActive : null]}>{option}</Text>
                              {active ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.selectCheckSlot} />}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                    {petFocusEdit.filter((item) => splitNativePetFocusLabel(item).species !== "All").map((item) => {
                      const { species, breed } = splitNativePetFocusLabel(item);
                      const isOther = species === "Others" || species === petFocusOther.trim();
                      const breedOptions = nativePetBreedOptionsForSpeciesLabel(species);
                      if (isOther) {
                        return (
                          <View key="pet-focus-other" style={styles.petFocusDetailField}>
                            <Text style={styles.petFocusDetailLabel}>Other species</Text>
                            <AppModalField
                              focused={groupPetOtherFocused}
                              onChangeText={(value) => {
                                setPetFocusOther(value);
                                const nextSpecies = value.trim();
                                const nextValues = petFocusEdit.map((current) => {
                                  const currentSpecies = splitNativePetFocusLabel(current).species;
                                  return currentSpecies === "Others" || currentSpecies === petFocusOther.trim() ? nextSpecies || "Others" : current;
                                });
                                onChangePetFocusEdit(nextValues);
                              }}
                              onBlur={() => setGroupPetOtherFocused(false)}
                              onFocus={() => { setGroupPetOtherFocused(true); scrollGroupDetailsFieldIntoView("petFocus", huddleSpacing.x6); }}
                              placeholder="Enter species..."
                              style={styles.petFocusOtherInput}
                              value={petFocusOther}
                            />
                          </View>
                        );
                      }
                      if (breedOptions.length === 0) return null;
                      return (
                        <View key={`${species}-breed`} style={styles.petFocusDetailField}>
                          <Text style={styles.petFocusDetailLabel}>{species} Breed</Text>
                          <Pressable onPress={() => setPetFocusBreedOpen((current) => current === species ? null : species)} style={[styles.petFocusBreedTrigger, petFocusBreedOpen === species ? nativeModalStyles.appModalFieldFocused : null]}>
                            <Text numberOfLines={1} style={[styles.petFocusBreedText, !breed ? styles.petFocusBreedPlaceholder : null]}>{breed || "Breed (optional)"}</Text>
                            <Feather color={huddleColors.mutedText} name={petFocusBreedOpen === species ? "chevron-up" : "chevron-down"} size={14} />
                          </Pressable>
                          {petFocusBreedOpen === species ? (
                            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={styles.petFocusBreedMenu}>
                              {breedOptions.map((breedOption) => (
                                <Pressable key={breedOption} onPress={() => { setPetFocusBreed(species, breedOption); setPetFocusBreedOpen(null); }} style={[styles.petFocusBreedOption, breed === breedOption ? styles.petFocusOptionActive : null]}>
                                  <Text style={[styles.petFocusOptionText, breed === breedOption ? styles.petFocusOptionTextActive : null]}>{breedOption}</Text>
                                  {breed === breedOption ? <Feather color={huddleColors.blue} name="check" size={14} /> : <View style={styles.selectCheckSlot} />}
                                </Pressable>
                              ))}
                            </ScrollView>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                  ) : null}
                </View>
              ) : null}
	          {!canManage ? <View style={styles.groupHeroDescriptionBlock}>
	            <View style={nativeModalStyles.appGroupHero}>
	              {editCover?.uri ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(editCover.uri, editCover.uri)} source={{ uri: nativeFreshImageUri(editCover.uri, editCover.uri) }} style={nativeModalStyles.appGroupHeroImage} transition={120} /> : <ResilientAvatarImage fallback={<NativeAuroraCover initial={name} seed={"id" in group ? group.id : group.chatId} style={StyleSheet.absoluteFill} />} style={nativeModalStyles.appGroupHeroImage} uri={avatarUrl} version={groupImageVersion(group, avatarUrl)} />}
              <View style={nativeModalStyles.appGroupHeroTopScrim} />
              <View style={nativeModalStyles.appGroupHeroBottomScrim} />
	              <Text style={nativeModalStyles.appGroupHeroMembers}>{memberLabel}</Text>
              {isJoinedGroup && canManage ? (
                <Pressable accessibilityLabel={editCover ? "Save group avatar" : "Change group avatar"} onPress={editCover ? onSaveDetails : onPickCover} style={styles.heroOverlayAction}>
                  <Feather color={huddleColors.onPrimary} name={editCover ? "save" : "camera"} size={18} />
                </Pressable>
              ) : null}
              <View style={nativeModalStyles.appGroupHeroCopy}>
                <GroupEventCountdownBadge countdown={eventCountdown} goingCount={detailNextEvent?.rsvpCount ?? 0} />
                <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroTitle}>{name}</Text>
                {(canManage ? locationEdit : locationLabel) ? <View style={nativeModalStyles.appGroupHeroMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={nativeModalStyles.appGroupHeroMeta}>{canManage ? locationEdit : locationLabel}</Text></View> : null}
                {previewPetFocus.length > 0 ? (
                  <View style={nativeModalStyles.appGroupHeroChips}>
                    {previewPetFocus.slice(0, 4).map((tag) => <Text key={tag} style={[nativeModalStyles.appGroupHeroChip, styles.exploreChipSentence]}>{sentenceCaseTag(tag)}</Text>)}
                  </View>
                ) : null}
              </View>
            </View>
            {visibleDescription || isJoinedGroup ? <View style={styles.descriptionInlineCard}>
              {visibleDescription ? (
		                <Text style={styles.groupDetailsDescriptionText}>{visibleDescription}</Text>
              ) : (
                <Text style={nativeModalStyles.appModalMutedBody}>No description yet.</Text>
              )}
            </View> : null}
              </View>
              : null}
            {isJoinedGroup ? (
              <View style={styles.managementSection}>
		                {canManage && management?.joinRequests.length ? (
                    <View style={styles.managementActionCard}>
		                  <Pressable onPress={() => setJoinRequestsOpen((open) => !open)} style={styles.managementActionHeader}>
	                    <View style={styles.managementActionCopy}>
	                      <Text style={styles.managementActionTitle}>Join requests</Text>
	                      <Text style={styles.managementActionBody}>{management.joinRequests.length} pending</Text>
	                    </View>
	                    <View style={styles.managementCountBadge}><Text style={styles.managementCountText}>{management.joinRequests.length}</Text></View>
	                    <Feather color={huddleColors.iconSubtle} name={joinRequestsOpen ? "chevron-up" : "chevron-down"} size={18} />
	                  </Pressable>
                    {joinRequestsOpen ? (
                      <View style={styles.requestInlinePanel}>
                        {management.joinRequests.map((request) => {
                          const decision = requestDecisions[request.id];
                          return (
                            <View key={request.id} style={styles.requestDecisionRow}>
                              <Pressable accessibilityLabel={`Open ${request.name || "requester"} profile`} onPress={() => onOpenMemberProfile(request.userId)} style={styles.memberIdentity}>
                                <VerifiedMemberAvatar avatarUrl={request.avatarUrl} isVerified={request.isVerified} name={request.name || "Member"} />
	                              <Text numberOfLines={1} style={[nativeModalStyles.appMemberSelectName, styles.groupMemberName]}>{request.name || "Member"}</Text>
                              </Pressable>
                              <View style={styles.requestDecisionActions}>
                                <Pressable onPress={() => setRequestDecisions((current) => ({ ...current, [request.id]: "decline" }))} style={[styles.requestDecisionIcon, decision === "approve" && styles.requestDecisionMuted, decision === "decline" && styles.requestDecisionRejectActive]}>
                                  <Feather color={decision === "decline" ? huddleColors.onPrimary : huddleColors.validationRed} name="x" size={16} />
                                </Pressable>
                                <Pressable onPress={() => setRequestDecisions((current) => ({ ...current, [request.id]: "approve" }))} style={[styles.requestDecisionIcon, decision === "decline" && styles.requestDecisionMuted, decision === "approve" && styles.requestDecisionApproveActive]}>
                                  <Feather color={decision === "approve" ? huddleColors.onPrimary : huddleColors.blue} name="check" size={16} />
                                </Pressable>
                              </View>
                              {requestErrors[request.id] ? <Text style={styles.requestErrorText}>Try again</Text> : null}
                            </View>
                          );
                        })}
                        <View style={styles.requestInlineFooter}>
                          <AppModalButton disabled={selectedRequestCount === 0 || requestConfirming} loading={requestConfirming} onPress={() => { void confirmJoinRequestDecisions(); }}>
                            <Text style={styles.modalPrimaryLabel}>Confirm</Text>
                          </AppModalButton>
                        </View>
                      </View>
                    ) : null}
                    </View>
	                ) : null}
                {canManage ? (
	                  <View style={styles.managementActionCard} onLayout={registerGroupDetailsField("invite")}>
		                  <Pressable onPress={() => setInviteEditorOpen((open) => !open)} style={styles.managementActionHeader}>
                      <View style={styles.managementActionCopy}>
                        <Text style={styles.managementActionTitle}>Invite users</Text>
                        <Text style={styles.managementActionBody}>{management?.pendingInvites.length ? `${management.pendingInvites.length} invited` : "Search by name or Social ID"}</Text>
                      </View>
                      <Feather color={huddleColors.iconSubtle} name={inviteEditorOpen ? "chevron-up" : "chevron-down"} size={18} />
                    </Pressable>
                    {inviteEditorOpen ? (
                      <View style={styles.inviteEditor}>
                        <View style={styles.inviteSearchWrap}>
                          <View style={[styles.searchField, groupInviteFocused ? nativeModalStyles.appModalFieldFocused : null]}>
                            <Feather color={huddleColors.iconSubtle} name="search" size={18} />
                            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                              accessibilityLabel="Search friends to invite"
                              autoCapitalize="none"
                              autoCorrect={false}
                              onBlur={() => setGroupInviteFocused(false)}
                              onChangeText={setInviteSearch}
                              onFocus={() => { setGroupInviteFocused(true); scrollGroupDetailsFieldIntoView("invite", huddleSpacing.x9); }}
                              placeholder="Search friends"
                              placeholderTextColor={huddleColors.mutedText}
                              returnKeyType="search"
                              style={styles.searchInput}
                              value={inviteSearch}
                            />
                            {inviteSearch ? (
                              <Pressable accessibilityLabel="Clear invite search" onPress={() => setInviteSearch("")} style={styles.searchClear}>
                                <Feather color={huddleColors.iconMuted} name="x" size={16} />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        {inviteSearching ? <Text style={nativeModalStyles.appModalMutedBody}>Searching...</Text> : null}
		                        {visibleInviteSuggestions.map((member) => {
                          const userId = "userId" in member ? member.userId : member.id;
	                          const socialId = String("socialId" in member ? member.socialId || "" : "").replace(/^@/, "");
                          const avatarUrl = "avatarUrl" in member ? member.avatarUrl : null;
                          const isVerified = "isVerified" in member ? member.isVerified : false;
                          const active = inviteDraft.includes(userId);
                          const name = ("displayName" in member ? member.displayName : member.name) || (socialId ? `@${socialId}` : "User");
                          return (
	                            <Pressable key={userId} onPress={() => setInviteDraft((current) => active ? current.filter((id) => id !== userId) : [...current, userId])} style={styles.inviteMemberRow}>
	                              <Pressable accessibilityLabel={`Open ${name} profile`} onPress={(event) => { event.stopPropagation(); onOpenMemberProfile(userId); }} style={styles.memberIdentity}>
	                                <VerifiedMemberAvatar avatarUrl={avatarUrl} isVerified={isVerified} name={name} />
		                                <View style={[styles.inviteSuggestionCopy, !socialId ? styles.inviteSuggestionCopySingle : null]}>
		                                  <Text numberOfLines={1} style={styles.inviteSuggestionName}>{name}</Text>
	                                  {socialId ? <Text numberOfLines={1} style={styles.inviteSuggestionHandle}>@{socialId}</Text> : null}
	                                </View>
	                              </Pressable>
                              <Feather color={active ? huddleColors.blue : huddleColors.iconSubtle} name={active ? "check-circle" : "circle"} size={20} />
                            </Pressable>
                          );
                        })}
		                        {inviteSearch.trim() && !inviteSearching && visibleInviteSuggestions.length === 0 ? <Text style={nativeModalStyles.appModalMutedBody}>No users found.</Text> : null}
                        {inviteDraft.length ? <AppModalButton onPress={() => { onInviteMembers(group, inviteDraft); setInviteDraft([]); setInviteEditorOpen(false); }}><Text style={styles.modalPrimaryLabel}>Send invites</Text></AppModalButton> : null}
	                        {management?.pendingInvites.length ? <Text style={styles.sectionLabel}>Pending invites</Text> : null}
                        {management?.pendingInvites.map((invite) => (
                          <View key={invite.id} style={styles.inviteMemberRow}>
                            <Pressable accessibilityLabel={`Open ${invite.name || "invited user"} profile`} onPress={() => onOpenMemberProfile(invite.userId)} style={[styles.memberIdentity, styles.pendingInviteIdentity]}>
                              <VerifiedMemberAvatar avatarUrl={invite.avatarUrl} isVerified={invite.isVerified} name={invite.name || "Member"} />
	                              <View style={[styles.inviteSuggestionCopy, !invite.socialId ? styles.inviteSuggestionCopySingle : null]}>
		                                <Text numberOfLines={1} style={styles.inviteSuggestionName}>{invite.name || "Member"}</Text>
	                                {invite.socialId ? <Text numberOfLines={1} style={styles.inviteSuggestionHandle}>@{invite.socialId}</Text> : null}
	                              </View>
                            </Pressable>
                            <Pressable accessibilityLabel={`Cancel invite for ${invite.name || "member"}`} onPress={() => onCancelInvite(group, invite)} hitSlop={8}>
                              <Text style={styles.cancelInviteText}>Cancel</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : null}
	                  </View>
                ) : null}
		                {sortedMembers.length ? <Text style={styles.sectionLabel}>Members</Text> : null}
	                {sortedMembers.map((member) => {
                    const memberRole = groupMemberRoleFor(group, member);
                    return (
                      <View key={member.userId} style={styles.memberActionBlock}>
		                    <View style={[nativeModalStyles.appMemberSelectRow, styles.groupMemberCompactRow]}>
                          <Pressable accessibilityLabel={`Open ${member.name || "member"} profile`} onPress={() => onOpenMemberProfile(member.userId)} style={styles.memberIdentity}>
		                        <VerifiedMemberAvatar avatarUrl={member.avatarUrl} isVerified={member.isVerified} name={member.name || "Member"} />
			                        <Text numberOfLines={1} style={[nativeModalStyles.appMemberSelectName, styles.groupMemberName]}>{member.name || "Member"}</Text>
                          </Pressable>
		                      <Text style={styles.detailsMeta}>{memberRole}</Text>
                            {member.userId !== currentUserId ? (
	                            <Pressable accessibilityLabel={`Member actions for ${member.name || "member"}`} onPress={() => openMemberActionMenu(member)} style={styles.iconButtonSmall}><Feather color={huddleColors.iconSubtle} name="more-horizontal" size={16} /></Pressable>
                            ) : null}
	                      </View>
                        {memberActionTarget?.userId === member.userId ? (
                          <View style={styles.memberInlineActions}>
                            <Pressable onPress={() => { onReportMember(member); closeMemberActionMenu(); }} style={styles.memberInlineAction}>
                              <Feather color={huddleColors.iconSubtle} name="flag" size={15} />
                              <Text style={styles.memberInlineActionText}>Report</Text>
                            </Pressable>
                            <Pressable onPress={() => { setMemberActionConfirm({ member, mode: "block" }); closeMemberActionMenu(); }} style={styles.memberInlineAction}>
                              <Feather color={huddleColors.validationRed} name="slash" size={15} />
                              <Text style={[styles.memberInlineActionText, styles.memberInlineActionTextDestructive]}>Block user</Text>
                            </Pressable>
                            {canManage ? (
                              <Pressable onPress={() => { setMemberActionConfirm({ member, mode: "remove" }); closeMemberActionMenu(); }} style={[styles.memberInlineAction, styles.memberInlineActionLast]}>
                                <Feather color={huddleColors.validationRed} name="user-minus" size={15} />
                                <Text style={[styles.memberInlineActionText, styles.memberInlineActionTextDestructive]}>Remove member</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
	                    </View>
                    );
                  })}
	                {management?.mediaUrls.length ? (
                    <View style={styles.mediaSection}>
                      <Text style={styles.sectionLabel}>Media</Text>
	                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={nativeModalStyles.appGroupMediaRail}>
	                      {management.mediaUrls.map((url) => <ExpoImage key={nativeFreshImageKey(url, url)} cachePolicy="memory-disk" contentFit="cover" source={{ uri: nativeFreshImageUri(url, url) }} style={nativeModalStyles.appGroupMediaThumb} transition={120} />)}
	                    </ScrollView>
                    </View>
	                ) : null}
              </View>
            ) : null}
            {isExplore ? (
              <View style={styles.exploreMembersSection}>
                <Text style={styles.sectionLabel}>Members</Text>
                {managementLoading ? <NativeSpinner tone="accent" /> : managementError ? <Text style={nativeModalStyles.appModalMutedBody}>Couldn't load members. Pull to refresh and try again.</Text> : sortedMembers.length ? sortedMembers.map((member) => {
                  const memberRole = groupMemberRoleFor(group, member);
                  return (
                    <View key={member.userId} style={[nativeModalStyles.appMemberSelectRow, styles.groupMemberCompactRow]}>
                      <Pressable accessibilityLabel={`Open ${member.name || "member"} profile`} onPress={() => onOpenMemberProfile(member.userId)} style={styles.memberIdentity}>
                      <VerifiedMemberAvatar avatarUrl={member.avatarUrl} isVerified={member.isVerified} name={member.name || "Member"} />
	                      <Text numberOfLines={1} style={[nativeModalStyles.appMemberSelectName, styles.groupMemberName]}>{member.name || "Member"}</Text>
                      </Pressable>
                      <Text style={styles.detailsMeta}>{memberRole}</Text>
                    </View>
                  );
                }) : <Text style={nativeModalStyles.appModalMutedBody}>No members yet.</Text>}
              </View>
            ) : null}
            </View>
		          </ScrollView>
            {!groupDetailsEditingActive && (isExplore || !hideOpenChatButton || canManage) ? (
	            <AppBottomSheetFooter onLayout={(event) => setGroupDetailsFooterHeight(event.nativeEvent.layout.height)}>
		              {isExplore && !group.joined ? (
                group.invitePending ? (
                  <AppModalActionRow>
                    <AppModalButton variant="secondary" onPress={() => onDeclineInvite(group)}>
                      <Text style={styles.modalSecondaryLabel}>Decline invite</Text>
                    </AppModalButton>
                    <AppModalButton onPress={() => onJoin(group)}>
                      <Text style={styles.modalPrimaryLabel}>Accept invite</Text>
                    </AppModalButton>
                  </AppModalActionRow>
                ) : (
                  <AppModalButton disabled={group.requested} variant={group.requested ? "secondary" : "primary"} onPress={() => onJoin(group)}>
                    <Text style={group.requested ? styles.modalSecondaryLabel : styles.modalPrimaryLabel}>{group.requested ? "Request sent" : group.joinMethod === "instant" ? "Join" : "Request to join"}</Text>
                  </AppModalButton>
                )
              ) : (
		                canManage ? (
                    hideOpenChatButton ? (
	                      <AppModalButton onPress={handleSaveDetails}><GroupDetailsFooterButtonLabel action="save" /></AppModalButton>
                    ) : (
                      <AppModalActionRow>
                        <AppModalButton accessibilityLabel="Open Group Chat" variant="secondary" onPress={() => onOpenChat(group)}><GroupDetailsFooterButtonLabel action="chat" iconOnly variant="secondary" /></AppModalButton>
	                        <AppModalButton accessibilityLabel="Save group details" onPress={handleSaveDetails}><GroupDetailsFooterButtonLabel action="save" iconOnly /></AppModalButton>
                      </AppModalActionRow>
                    )
	                ) : (
	                  <AppModalButton onPress={() => onOpenChat(group)}><GroupDetailsFooterButtonLabel action="chat" /></AppModalButton>
	                )
	              )}
		            </AppBottomSheetFooter>
            ) : null}
			        </AppBottomSheet>
	        </View>
      </KeyboardAvoidingView>
        <ConfirmGroupActionModal
          busy={groupActionBusy === groupActionConfirm}
          mode={groupActionConfirm}
          onCancel={() => setGroupActionConfirm(null)}
          onConfirm={() => { void confirmGroupAction(); }}
        />
        <ConfirmMemberActionModal
          busy={memberActionBusy === memberActionConfirm?.mode}
          target={memberActionConfirm}
          onCancel={() => setMemberActionConfirm(null)}
          onConfirm={() => { void confirmMemberAction(); }}
        />
        <NativeMediaImageCropper
          asset={coverCropAsset}
          aspect="16:9"
          onCancel={onCancelCoverCrop}
          onError={() => undefined}
          onSave={onSaveCoverCrop}
          presentation="inline"
          title="Edit group photo"
        />
	    </Modal>
  );
}

function GroupDetailsFooterButtonLabel({ action, iconOnly = false, variant = "primary" }: { action: "chat" | "save"; iconOnly?: boolean; variant?: "primary" | "secondary" }) {
  const color = variant === "secondary" ? huddleColors.text : huddleColors.onPrimary;
  return (
    <View style={styles.groupDetailsFooterButtonLabel}>
      <Feather color={color} name={action === "chat" ? "message-circle" : "save"} size={18} />
      {!iconOnly ? <Text style={variant === "secondary" ? styles.modalSecondaryLabel : styles.modalPrimaryLabel}>{action === "chat" ? "Open Group Chat" : "Save"}</Text> : null}
    </View>
  );
}

function ConfirmMemberActionModal({ busy, target, onCancel, onConfirm }: { busy: boolean; target: { member: NativeGroupManagementSnapshot["members"][number]; mode: "block" | "remove" } | null; onCancel: () => void; onConfirm: () => void }) {
  if (!target) return null;
  const remove = target.mode === "remove";
  const name = target.member.name || "this member";
  return (
    <AppDestructiveSlideConfirm
      body={remove ? `${name} will lose access to this group and its messages.` : `${name} will no longer be able to contact you.`}
      busy={busy}
      onClose={onCancel}
      onConfirm={onConfirm}
      open
      presentation="inline"
      slideLabel={remove ? "Slide to Remove" : "Slide to Block"}
      title={remove ? "Remove member?" : "Block user?"}
    />
  );
}

function ConfirmGroupActionModal({ busy, mode, onCancel, onConfirm }: { busy: boolean; mode: "leave" | "remove" | null; onCancel: () => void; onConfirm: () => void }) {
  if (!mode) return null;
  const remove = mode === "remove";
  return (
    <AppDestructiveSlideConfirm
      body={remove ? "This group and all its content will be permanently deleted. This action cannot be undone." : "You'll no longer see new messages in this group."}
      busy={busy}
      onClose={onCancel}
      onConfirm={onConfirm}
      open
      presentation="inline"
      slideLabel={remove ? "Slide to Remove" : "Slide to Leave"}
      title={remove ? "Remove group?" : "Leave group?"}
    />
  );
}

function NativeJoinWithCodeSheet({ onChange, onClose, onSubmit, open, value }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const normalized = value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}>
        <View pointerEvents="box-none" style={nativeModalStyles.appBottomSheetEventBoundary}>
        <AppBottomSheet onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Join with code</Text>
            <AppModalCloseButton onPress={onClose} />
          </AppBottomSheetHeader>
          <AppBottomSheetScroll>
            <View style={styles.joinCodeContent}>
              <Text style={nativeModalStyles.appModalMutedBody}>Enter the 6-character room code from the group invite.</Text>
              <AppModalField
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType="ascii-capable"
                maxLength={6}
                onChangeText={(next) => onChange(next.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                style={styles.joinCodeField}
                value={normalized}
              />
              <View style={styles.joinCodeDots}>
                {Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.joinCodeDot, index < normalized.length && styles.joinCodeDotActive]} />)}
              </View>
            </View>
          </AppBottomSheetScroll>
          <AppBottomSheetFooter>
            <AppModalButton disabled={normalized.length !== 6} onPress={onSubmit}><Text style={styles.modalPrimaryLabel}>Join</Text></AppModalButton>
          </AppBottomSheetFooter>
	          </AppBottomSheet>
        </View>
      </Pressable>
    </Modal>
  );
}

function CreateGroupModal({
  countryLabel,
  locationBiasPoint,
  cover,
  coverCropAsset,
  creating,
  description,
  joinMethod,
  location,
  name,
  onChangeCountry,
  onChangeDescription,
  onChangeJoinMethod,
  onChangeLocation,
  onChangeName,
  onChangePetFocus,
  onChangeVisibility,
  onCancelCoverCrop,
  onClose,
  onEditCover,
  onPickCover,
  onRemoveCover,
  onSaveCoverCrop,
  onSubmit,
  open,
  petFocus,
  visibility,
}: {
  countryLabel: string | null;
  locationBiasPoint?: { lat: number; lng: number } | null;
  cover: PendingGroupCover | null;
  coverCropAsset: (NativeProfileUploadAsset & { height?: number | null; width?: number | null }) | null;
  creating: boolean;
  description: string;
  joinMethod: "instant" | "request";
  location: string;
  name: string;
  open: boolean;
  petFocus: string[];
  visibility: "public" | "private";
  onChangeCountry?: (value: string | null) => void;
  onChangeDescription: (value: string) => void;
  onChangeJoinMethod: (value: "instant" | "request") => void;
  onChangeLocation: (value: string) => void;
  onChangeName: (value: string) => void;
  onChangePetFocus: (value: string[]) => void;
  onChangeVisibility: (value: "public" | "private") => void;
  onCancelCoverCrop: () => void;
  onClose: () => void;
  onEditCover: () => void;
  onPickCover: () => void;
  onRemoveCover: () => void;
  onSaveCoverCrop: (asset: NativeProfileUploadAsset) => Promise<void>;
  onSubmit: () => void;
}) {
  const [locationSuggestions, setLocationSuggestions] = useState<NativeLocationSuggestion[]>([]);
  const [locationSearchOpen, setLocationSearchOpen] = useState(false);
  const [locationSearching, setLocationSearching] = useState(false);
  const [manualLocationAllowedQuery, setManualLocationAllowedQuery] = useState<string | null>(null);
  const [locationPinError, setLocationPinError] = useState("");
  const [petFocusOpen, setPetFocusOpen] = useState(false);
  const [petFocusOther, setPetFocusOther] = useState("");
  const [petFocusBreedOpen, setPetFocusBreedOpen] = useState<string | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [locationFocused, setLocationFocused] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [createErrors, setCreateErrors] = useState<{ cover?: boolean; description?: boolean; location?: boolean; name?: boolean }>({});
  const { shake: triggerCreateShake, shakeStyle: createShakeStyle } = useErrorShake("warning");
  const createGroupScrollRef = useRef<ScrollView | null>(null);
  const createFieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [createKeyboardHeight, setCreateKeyboardHeight] = useState(0);
  const [createFooterHeight, setCreateFooterHeight] = useState(0);
  const acceptedLocationRef = useRef<string | null>(null);
  const petFocusSpecies = petFocus.map((item) => splitNativePetFocusLabel(item).species);
  const fullPreviewPetFocus = petFocus.slice(0, GROUP_PET_FOCUS_MAX);
  const previewPetFocus = shouldCollapsePetFocusChips(fullPreviewPetFocus)
    ? Array.from(new Set(petFocus.map((item) => splitNativePetFocusLabel(item).species).filter(Boolean))).slice(0, GROUP_PET_FOCUS_MAX)
    : fullPreviewPetFocus;
  const showFreeTextLocationScopeHint = visibility === "public" && Boolean(location.trim()) && acceptedLocationRef.current !== location.trim();
  const setPetFocusBreed = (species: string, breed: string) => {
    onChangePetFocus(petFocus.map((item) => {
      const parsed = splitNativePetFocusLabel(item);
      return parsed.species === species ? buildNativePetFocusLabel(species, breed) : item;
    }).filter(Boolean));
  };
  const togglePetFocusSpecies = (species: string) => {
    if (species === "All") {
      onChangePetFocus(petFocusSpecies.includes("All") ? [] : ["All"]);
      setPetFocusBreedOpen(null);
      return;
    }
    const customOtherSpecies = petFocusOther.trim();
    const active = species === "Others"
      ? petFocusSpecies.includes("Others") || Boolean(customOtherSpecies && petFocusSpecies.includes(customOtherSpecies))
      : petFocusSpecies.includes(species);
    const withoutAll = petFocus.filter((item) => splitNativePetFocusLabel(item).species !== "All");
    if (active) {
      onChangePetFocus(withoutAll.filter((item) => {
        const itemSpecies = splitNativePetFocusLabel(item).species;
        return species === "Others" ? itemSpecies !== "Others" && itemSpecies !== customOtherSpecies : itemSpecies !== species;
      }));
      if (petFocusBreedOpen === species) setPetFocusBreedOpen(null);
      return;
    }
    if (withoutAll.length >= GROUP_PET_FOCUS_MAX) return;
    onChangePetFocus([...withoutAll, species]);
    setPetFocusBreedOpen(species === "Others" ? null : species);
  };
  const changeDescription = (value: string) => {
    if (countWords(value) > GROUP_DESCRIPTION_WORD_LIMIT) return;
    onChangeDescription(value);
  };

  const applyCurrentLocation = (loc: NativeResolvedLocation) => {
    const selectedLocation = loc.district || loc.label;
    acceptedLocationRef.current = selectedLocation;
    setManualLocationAllowedQuery(null);
    setLocationPinError("");
    setLocationSuggestions([]);
    setLocationSearchOpen(false);
    onChangeLocation(selectedLocation);
    onChangeCountry?.(loc.countryName || loc.country || null);
    if (createErrors.location && selectedLocation.trim()) setCreateErrors((current) => ({ ...current, location: false }));
  };
  const registerCreateField = (key: string) => (event: { nativeEvent: { layout: { height: number; y: number } } }) => {
    createFieldLayoutsRef.current[key] = event.nativeEvent.layout;
  };
  const centerCreateField = (target: number | string, extraOffset = 0) => {
    const scrollToTarget = () => {
      const fieldLayout = typeof target === "number" ? { y: target, height: 0 } : createFieldLayoutsRef.current[target] ?? { y: 0, height: 0 };
      const visibleHeight = Math.max(220, Math.round(Dimensions.get("window").height * 0.82) - 62 - createFooterHeight - createKeyboardHeight - huddleSpacing.x4);
      const fieldBottom = fieldLayout.y + fieldLayout.height + extraOffset;
      const shouldAlignToTop = target === "description" || target === "petFocus";
      const nextY = shouldAlignToTop
        ? Math.max(0, fieldLayout.y - huddleSpacing.x3)
        : Math.max(0, fieldBottom - visibleHeight + huddleSpacing.x4);
      createGroupScrollRef.current?.scrollTo({ y: nextY, animated: true });
    };
    requestAnimationFrame(scrollToTarget);
    setTimeout(scrollToTarget, 180);
    setTimeout(scrollToTarget, 360);
  };
  useEffect(() => {
    if (!open) return;
    Keyboard.dismiss();
    setLocationSearchOpen(false);
    setLocationPinError("");
    setPetFocusOpen(false);
    setPetFocusBreedOpen(null);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => setCreateKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setCreateKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [open]);
  useEffect(() => {
    if (cover && createErrors.cover) setCreateErrors((current) => ({ ...current, cover: false }));
  }, [cover, createErrors.cover]);
  const submitCreateGroup = () => {
    const trimmedLocation = location.trim();
    const nextErrors = {
      name: !name.trim(),
      location: !trimmedLocation,
      cover: !cover,
      description: !description.trim() || countWords(description) > GROUP_DESCRIPTION_WORD_LIMIT,
    };
    setCreateErrors(nextErrors);
    if (nextErrors.name || nextErrors.location || nextErrors.cover || nextErrors.description) {
      triggerCreateShake();
    }
    if (nextErrors.name) {
      centerCreateField("name");
      return;
    }
    if (nextErrors.location) {
      centerCreateField("location");
      return;
    }
    if (nextErrors.cover) {
      centerCreateField("cover");
      return;
    }
    if (nextErrors.description) {
      centerCreateField("description");
      return;
    }
    Keyboard.dismiss();
    onSubmit();
  };
  useEffect(() => {
    const trimmed = location.trim();
    if (acceptedLocationRef.current && acceptedLocationRef.current === trimmed) return;
    if (trimmed.length < 2) {
      setLocationSuggestions([]);
      setLocationSearchOpen(false);
      setLocationSearching(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLocationSearching(true);
      void fetchNativePrioritizedLocationSuggestions(trimmed, { biasPoint: locationBiasPoint ?? null, selectedCountry: countryLabel })
        .then((results) => {
          if (!active) return;
          setLocationSuggestions(results);
          setManualLocationAllowedQuery(results.length === 0 ? trimmed : null);
          setLocationSearchOpen(results.length > 0);
        })
        .catch(() => {
          if (active) {
            setLocationSuggestions([]);
            setManualLocationAllowedQuery(null);
          }
        })
        .finally(() => {
          if (active) setLocationSearching(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
	  }, [countryLabel, locationBiasPoint, location]);
	  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close create group" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={nativeModalStyles.appBottomSheetEventBoundary}>
			        <AppBottomSheet onClose={onClose} style={styles.createGroupSheet}>
		          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Create a group</Text>
            <AppModalCloseButton onPress={onClose} />
	          </AppBottomSheetHeader>
	          <ScrollView
	            ref={createGroupScrollRef}
	            bounces
	            contentContainerStyle={[nativeModalStyles.appModalScrollContent, styles.createGroupScrollContent]}
	            keyboardDismissMode="interactive"
	            keyboardShouldPersistTaps="handled"
	            nestedScrollEnabled={false}
	            scrollEventThrottle={16}
	            showsVerticalScrollIndicator={false}
	            style={styles.createGroupScroll}
	          >
	            <View style={styles.createSheetContent}>
	            {/* No separate circular avatar preview: the cover card below IS the
	                group's identity (cover and avatar are the same stored field), so
	                a second thumbnail was duplicate chrome. Name field takes the row. */}
	            <View onLayout={registerCreateField("name")} style={styles.createNameRow}>
		              <View style={styles.createNameField}>
		                <AppModalField blurOnSubmit error={createErrors.name} focused={nameFocused} onBlur={() => setNameFocused(false)} onChangeText={(value) => { onChangeName(value); if (createErrors.name && value.trim()) setCreateErrors((current) => ({ ...current, name: false })); }} onFocus={() => { setNameFocused(true); centerCreateField("name"); }} onSubmitEditing={Keyboard.dismiss} placeholder="Group name" returnKeyType="done" style={[styles.createTextField, styles.groupDetailsNameField]} value={name} />
		              </View>
		            </View>
            <View>
              <Text style={styles.createLabel}>Description</Text>
              <View onLayout={registerCreateField("cover")} style={[styles.createPreviewCard, createErrors.cover ? styles.createPreviewCardError : null]}>
	                <View style={nativeModalStyles.appGroupHero}>
	                  {cover ? (
	                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(cover.uri, cover.uri)} source={{ uri: nativeFreshImageUri(cover.uri, cover.uri) }} style={nativeModalStyles.appGroupHeroImage} transition={120} />
	                  ) : (
	                    // Live identity preview: the aurora reseeds off the name as
	                    // the user types, so the group visibly "becomes itself"
	                    // during creation — and matches exactly what the list and
	                    // detail cards render if no photo is ever uploaded.
	                    <NativeAuroraCover seed={name.trim() || "huddle"} style={StyleSheet.absoluteFill} />
	                  )}
	                  {cover ? <LinearGradient colors={["rgba(9,12,25,0.32)", "rgba(9,12,25,0)"]} pointerEvents="none" style={styles.createHeroTopScrim} /> : null}
	                  {cover ? <LinearGradient colors={["rgba(9,12,25,0)", "rgba(9,12,25,0.34)", "rgba(9,12,25,0.72)"]} pointerEvents="none" style={styles.createHeroBottomScrim} /> : null}
                  <Text style={nativeModalStyles.appGroupHeroMembers}>1 member</Text>
                  <View style={nativeModalStyles.appGroupHeroCopy}>
                    <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroTitle}>{name.trim() || "Your group name"}</Text>
                    {location.trim() ? <View style={nativeModalStyles.appGroupHeroMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={nativeModalStyles.appGroupHeroMeta}>{location.trim()}</Text></View> : null}
                    {petFocus.length > 0 ? (
                      <View style={styles.createHeroChips}>
                        {previewPetFocus.map((tag) => {
                          const species = splitNativePetFocusLabel(tag).species;
                          return <Text key={tag} numberOfLines={1} style={styles.createHeroChip}>{nativePetSpeciesEmojiOrText(species === "All" ? "Others" : species)}</Text>;
                        })}
	                      </View>
	                    ) : null}
	                  </View>
                  {cover ? (
                    <View style={styles.coverActions}>
                      <Pressable accessibilityLabel="Remove cover photo" onPress={onRemoveCover} style={styles.coverActionButton}><Feather color={huddleColors.onPrimary} name="trash-2" size={20} /></Pressable>
                      <Pressable accessibilityLabel="Edit cover photo" onPress={onEditCover} style={styles.coverActionButton}><Feather color={huddleColors.onPrimary} name="crop" size={20} /></Pressable>
                      <Pressable accessibilityLabel="Change cover photo" onPress={onPickCover} style={styles.coverActionButton}><Feather color={huddleColors.onPrimary} name="camera" size={20} /></Pressable>
                    </View>
                  ) : (
                    <Pressable accessibilityLabel="Add cover photo" onPress={onPickCover} style={styles.coverEmptyAction}>
                      <Feather color={huddleColors.onPrimary} name="camera" size={24} />
                      <Text style={styles.coverEmptyTitle}>Add a cover photo</Text>
                      <Text style={styles.coverEmptyHint}>16:9, daylight is your friend</Text>
                    </Pressable>
                  )}
                </View>
                <View onLayout={registerCreateField("description")} style={styles.createDescriptionWrap}>
	                  <GroupDescriptionTextArea error={createErrors.description} focused={descriptionFocused} onBlur={() => setDescriptionFocused(false)} onChangeText={(value) => { changeDescription(value); if (createErrors.description && value.trim() && countWords(value) <= GROUP_DESCRIPTION_WORD_LIMIT) setCreateErrors((current) => ({ ...current, description: false })); }} onFocus={() => { setDescriptionFocused(true); centerCreateField("description"); }} placeholder="Tell people what this group is about and how you usually meet." returnKeyType="done" value={description} />
                </View>
              </View>
            </View>
	            <View onLayout={registerCreateField("location")}>
	              <Text style={styles.createLabel}>Location</Text>
              <View style={[styles.locationFieldRow, locationFocused ? nativeModalStyles.appModalFieldFocused : null, createErrors.location ? nativeModalStyles.appModalFieldError : null]}>
                <NativeLocationPinButton
                  onError={setLocationPinError}
                  onResolved={applyCurrentLocation}
                  style={styles.locationFieldPin}
                />
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  onBlur={() => setLocationFocused(false)}
                  onChangeText={(value) => {
                    acceptedLocationRef.current = null;
                    setManualLocationAllowedQuery(null);
                    setLocationPinError("");
                    onChangeLocation(value);
                    if (createErrors.location && value.trim()) setCreateErrors((current) => ({ ...current, location: false }));
                  }}
                  onFocus={() => {
                    setLocationFocused(true);
                    centerCreateField("location");
                    if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                  }}
                  onSubmitEditing={Keyboard.dismiss}
                  placeholder="Where do you usually meet?"
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="search"
                  style={styles.locationFieldInput}
                  value={location}
                />
              </View>
              {locationPinError ? <Text style={styles.createErrorText}>{locationPinError}</Text> : null}
              {!locationPinError && showFreeTextLocationScopeHint ? (
                <Text style={styles.createHelperText}>We'll show this group to people in your current city or country.</Text>
              ) : null}
              {locationSearchOpen && (locationSuggestions.length > 0 || locationSearching) ? (
                <View style={styles.locationSuggestionCard}>
                  {locationSearching && locationSuggestions.length === 0 ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                  {locationSuggestions.map((suggestion) => (
                    <Pressable
                      key={`${suggestion.label}:${suggestion.lat}:${suggestion.lng}`}
                      onPress={() => {
                        const selectedLocation = suggestion.district || suggestion.label;
		                        acceptedLocationRef.current = selectedLocation;
		                        setManualLocationAllowedQuery(null);
                        setLocationPinError("");
		                        onChangeLocation(selectedLocation);
                        onChangeCountry?.(suggestion.country || extractNativeCountryFromPlaceLabel(suggestion.label) || null);
	                        setLocationSearchOpen(false);
	                        Keyboard.dismiss();
	                      }}
                      style={styles.locationSuggestionRow}
                    >
                      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>
                      {suggestion.label ? <Text numberOfLines={1} style={styles.locationSuggestionMeta}>{suggestion.label}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <View onLayout={registerCreateField("petFocus")} style={nativeModalStyles.appModalFieldBlock}>
              <Text style={[nativeModalStyles.appModalFieldLabel, styles.createSelectLabel]}>Pet focus</Text>
              <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setLocationSearchOpen(false); setPetFocusOpen((current) => { const next = !current; if (next) centerCreateField("petFocus"); return next; }); }} style={[nativeModalStyles.appModalSelectTrigger, styles.createSelectTrigger, petFocusOpen ? nativeModalStyles.appModalFieldFocused : null]}>
                <Text numberOfLines={1} style={[nativeModalStyles.appModalSelectText, styles.createSelectText, petFocus.length === 0 ? nativeModalStyles.appModalSelectPlaceholder : null]}>
                  {petFocus.length > 0
                    ? petFocus.map((item) => {
                      const species = splitNativePetFocusLabel(item).species;
                      return nativePetSpeciesEmojiOrText(species === "All" ? "Others" : species);
                    }).filter((value, index, values) => values.indexOf(value) === index).join(" ")
                    : "Choose a focus"}
                </Text>
                <Feather color={huddleColors.mutedText} name={petFocusOpen ? "chevron-up" : "chevron-down"} size={16} />
              </Pressable>
              {petFocusOpen ? (
                <View style={styles.petFocusMenu}>
                  {PET_FOCUS_OPTIONS.map((option) => {
                    const customOtherSpecies = petFocusOther.trim();
                    const active = option === "Others"
                      ? petFocusSpecies.includes("Others") || Boolean(customOtherSpecies && petFocusSpecies.includes(customOtherSpecies))
                      : petFocusSpecies.includes(option);
                    const disabled = !active && !petFocusSpecies.includes("All") && petFocus.filter((item) => splitNativePetFocusLabel(item).species !== "All").length >= GROUP_PET_FOCUS_MAX;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        disabled={disabled}
                        key={option}
                        onPress={() => togglePetFocusSpecies(option)}
                        style={[styles.petFocusOption, active ? styles.petFocusOptionActive : null, disabled ? nativeModalStyles.disabled : null]}
                      >
                        <Text style={[styles.petFocusOptionText, active ? styles.petFocusOptionTextActive : null]}>{nativePetSpeciesEmojiOrText(option === "All" ? "Others" : option)}  {option}</Text>
                        {active ? <Feather color={huddleColors.blue} name="check" size={16} /> : <View style={styles.selectCheckSlot} />}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {petFocus.filter((item) => splitNativePetFocusLabel(item).species !== "All").map((item) => {
                const { species, breed } = splitNativePetFocusLabel(item);
                const isOther = species === "Others" || species === petFocusOther.trim();
                const breedOptions = nativePetBreedOptionsForSpeciesLabel(species);
                if (isOther) {
                  return (
                    <View key="pet-focus-other" style={styles.petFocusDetailField}>
                      <Text style={styles.petFocusDetailLabel}>Other species</Text>
                      <AppModalField
                        onChangeText={(value) => {
                          setPetFocusOther(value);
                          const nextSpecies = value.trim();
                          onChangePetFocus(petFocus.map((current) => {
                            const currentSpecies = splitNativePetFocusLabel(current).species;
                            return currentSpecies === "Others" || currentSpecies === petFocusOther.trim() ? nextSpecies || "Others" : current;
                          }));
                        }}
                        onFocus={() => centerCreateField("petFocus", huddleSpacing.x6)}
                        placeholder="Enter species..."
                        style={styles.petFocusOtherInput}
                        value={petFocusOther}
                      />
                    </View>
                  );
                }
                if (breedOptions.length === 0) return null;
                return (
                  <View key={`${species}-breed`} style={styles.petFocusDetailField}>
                    <Text style={styles.petFocusDetailLabel}>{species} Breed</Text>
                    <Pressable onPress={() => { Keyboard.dismiss(); setPetFocusBreedOpen((current) => { const next = current === species ? null : species; if (next) centerCreateField("petFocus", huddleSpacing.x8); return next; }); }} style={[styles.petFocusBreedTrigger, petFocusBreedOpen === species ? nativeModalStyles.appModalFieldFocused : null]}>
                      <Text numberOfLines={1} style={[styles.petFocusBreedText, !breed ? styles.petFocusBreedPlaceholder : null]}>{breed || "Breed (optional)"}</Text>
                      <Feather color={huddleColors.mutedText} name={petFocusBreedOpen === species ? "chevron-up" : "chevron-down"} size={14} />
                    </Pressable>
                    {petFocusBreedOpen === species ? (
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={styles.petFocusBreedMenu}>
                        {breedOptions.map((breedOption) => (
                          <Pressable key={breedOption} onPress={() => { setPetFocusBreed(species, breedOption); setPetFocusBreedOpen(null); }} style={[styles.petFocusBreedOption, breed === breedOption ? styles.petFocusOptionActive : null]}>
                            <Text style={[styles.petFocusOptionText, breed === breedOption ? styles.petFocusOptionTextActive : null]}>{breedOption}</Text>
                            {breed === breedOption ? <Feather color={huddleColors.blue} name="check" size={14} /> : <View style={styles.selectCheckSlot} />}
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <View>
              <Text style={styles.createLabel}>Visibility</Text>
              <View style={styles.optionCardGrid}>
                <Pressable onPress={() => onChangeVisibility("public")} style={[nativeModalStyles.appOptionCard, visibility === "public" && nativeModalStyles.appOptionCardActive]}>
                  <View style={[styles.optionRadio, visibility === "public" && styles.optionRadioActive]} />
                  <View style={styles.optionCardCopy}>
                    <Text style={[styles.optionCardTitle, visibility === "public" && styles.optionCardTitleActive]}>Public</Text>
                    <Text style={[styles.optionCardBody, visibility === "public" && styles.optionCardBodyActive]}>Open to all nearby pet lovers</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => { onChangeVisibility("private"); onChangeJoinMethod("request"); }} style={[nativeModalStyles.appOptionCard, visibility === "private" && nativeModalStyles.appOptionCardActive]}>
                  <View style={[styles.optionRadio, visibility === "private" && styles.optionRadioActive]} />
                  <View style={styles.optionCardCopy}>
                    <Text style={[styles.optionCardTitle, visibility === "private" && styles.optionCardTitleActive]}>Private</Text>
                    <Text style={[styles.optionCardBody, visibility === "private" && styles.optionCardBodyActive]}>Invite-only. Requires a join code.</Text>
                  </View>
                </Pressable>
              </View>
            </View>
            {visibility === "public" ? (
              <Animated.View>
                <Text style={styles.createLabel}>How can people join?</Text>
                <View style={styles.joinOptionList}>
                  <Pressable onPress={() => onChangeJoinMethod("request")} style={[nativeModalStyles.appOptionCard, joinMethod === "request" && nativeModalStyles.appOptionCardActive]}>
                    <View style={[styles.optionRadioSmall, joinMethod === "request" && styles.optionRadioActive]} />
                    <View style={styles.optionCardCopy}>
                      <Text style={[styles.optionCardTitle, joinMethod === "request" && styles.optionCardTitleActive]}>Send a join request <Text style={styles.optionCardHint}>(recommended)</Text></Text>
                      <Text style={[styles.optionCardBody, joinMethod === "request" && styles.optionCardBodyActive]}>You approve each new member.</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => onChangeJoinMethod("instant")} style={[nativeModalStyles.appOptionCard, joinMethod === "instant" && nativeModalStyles.appOptionCardActive]}>
                    <View style={[styles.optionRadioSmall, joinMethod === "instant" && styles.optionRadioActive]} />
                    <View style={styles.optionCardCopy}>
                      <Text style={[styles.optionCardTitle, joinMethod === "instant" && styles.optionCardTitleActive]}>Join instantly</Text>
                      <Text style={[styles.optionCardBody, joinMethod === "instant" && styles.optionCardBodyActive]}>Anyone can join right away.</Text>
                    </View>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}
            </View>
          </ScrollView>
	          <AppBottomSheetFooter onLayout={(event) => setCreateFooterHeight(event.nativeEvent.layout.height)}>
              <Animated.View style={createShakeStyle}>
	              <AppModalButton disabled={creating} loading={creating} onPress={submitCreateGroup}>
	                <Text style={styles.modalPrimaryLabel}>Create group</Text>
	              </AppModalButton>
              </Animated.View>
	          </AppBottomSheetFooter>
		        </AppBottomSheet>
	        </View>
	        <NativeMediaImageCropper
	          asset={coverCropAsset}
	          aspect="16:9"
	          onCancel={onCancelCoverCrop}
	          onError={() => undefined}
	          onSave={onSaveCoverCrop}
	          presentation="inline"
	          title="Edit group photo"
	        />
	      </KeyboardAvoidingView>
	    </Modal>
	  );
}

function ConfirmDeleteModal({ onCancel, onConfirm, row }: { row: NativeChatInboxRow | null; onCancel: () => void; onConfirm: () => void }) {
  if (!row) return null;
  return <AppDestructiveSlideConfirm body="This conversation will be permanently deleted. Are you sure?" onClose={onCancel} onConfirm={onConfirm} open slideLabel="Slide to Remove" title="Remove conversation?" />;
}

// D1: ConfirmStarModal is now stateful — supports a pending state (gold halo + pulse behind Send Star)
// and reports the Send Star button's window position via onMeasureSendButton so the success cue
// can launch from the button origin. If the measurement never fires, the parent falls back to the
// default screen-bottom origin inside launchNativeDiscoverySendCue.
function ConfirmStarModal({
  errorMessage,
  loading,
  pending,
  onCancel,
  onConfirm,
  onMeasureSendButton,
  target,
}: {
  errorMessage?: string | null;
  loading: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onMeasureSendButton: (rect: { x: number; y: number } | null) => void;
  target: StarConfirmTarget | null;
}) {
  // Pulse loop: 1.0 → 1.02 → 1.0 every 1200ms while pending. Stops when not pending.
  const pulseSV = useSharedValue(0);
  const haloOpacitySV = useSharedValue(0);
  const sendButtonRef = useRef<View | null>(null);

  useEffect(() => {
    if (pending) {
      haloOpacitySV.value = withTiming(1, { duration: 200 });
      // Gentle pulse — 600ms in, 600ms out, repeated.
      pulseSV.value = withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0, { duration: 600 })), -1, false);
    } else {
      haloOpacitySV.value = withTiming(0, { duration: 200 });
      pulseSV.value = withTiming(0, { duration: 200 });
    }
  }, [haloOpacitySV, pending, pulseSV]);

  const haloStyle = useAnimatedStyle(() => {
    // Halo grows slightly with pulse for a "breathing" feel.
    const scale = 1.04 + pulseSV.value * 0.04;
    return { opacity: haloOpacitySV.value * (0.55 + pulseSV.value * 0.25), transform: [{ scale }] };
  });

  // Measure the Send Star button on layout. Parent re-measures via this anchor only when
  // the layout actually changes; for opens with stable layout, the first onLayout is enough.
  const onSendBtnLayout = useCallback(() => {
    const node = sendButtonRef.current;
    if (!node || typeof node.measureInWindow !== "function") {
      // Measurement unavailable — parent falls back to default origin.
      onMeasureSendButton(null);
      return;
    }
    node.measureInWindow((x: number, y: number, width: number, height: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        onMeasureSendButton(null);
        return;
      }
      // Anchor at button center.
      onMeasureSendButton({ x: x + width / 2, y: y + height / 2 });
    });
  }, [onMeasureSendButton]);

  useEffect(() => {
    if (!target) {
      // Modal closing — clear measurement so a stale anchor isn't reused next open.
      onMeasureSendButton(null);
    }
  }, [onMeasureSendButton, target]);

  if (!target) return null;

  const isVisible = Boolean(target);
  const sendDisabled = pending || loading;

  return (
    <Modal animationType="fade" onRequestClose={pending ? () => { /* D1: ignore backdrop dismiss while backend pending — use Cancel button to abort */ } : onCancel} transparent visible={isVisible}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={pending ? undefined : onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={nativeModalStyles.appConfirmCard}>
            <Text style={nativeModalStyles.appConfirmTitle}>Use a Star to connect?</Text>
            <Text style={nativeModalStyles.appConfirmBody}>This starts a conversation immediately.</Text>
            {errorMessage ? <Text style={nativeModalStyles.appModalError}>{errorMessage}</Text> : null}
            <AppModalActionRow>
              <AppModalButton disabled={pending || loading} variant="secondary" onPress={onCancel}>Cancel</AppModalButton>
              <View ref={sendButtonRef} collapsable={false} onLayout={onSendBtnLayout} style={styles.confirmStarSendWrap}>
                {/* D1: gold pulse halo behind the Send Star button. Visible only while pending. */}
                <Reanimated.View pointerEvents="none" style={[styles.confirmStarSendHalo, haloStyle]} />
                {/* Bespoke gold CTA — bypasses the locked AppModalButton variants (only primary/secondary/destructive exist) without modifying the shared primitive. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send Star"
                  disabled={sendDisabled}
                  onPress={onConfirm}
                  style={({ pressed }) => [styles.confirmStarSendGoldButton, sendDisabled ? styles.confirmStarSendGoldButtonDisabled : null, pressed ? { opacity: 0.88 } : null]}
                >
                  <Text style={styles.confirmStarSendGoldText}>Send Star</Text>
                </Pressable>
              </View>
            </AppModalActionRow>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DiscoverySendCue({ cue }: { cue: { kind: DiscoverySendCueKind; id: number; originX: number | null; originY: number | null } | null }) {
  const { height: screenH, width: screenW } = useWindowDimensions();
  // D1: when origin is provided (measured Send Star button center in window coords), the orb begins
  // at that anchor and rises into the existing center→exit path. When origin is null, falls back to
  // the default screen-bottom start (existing behavior). Star only; Wave keeps original start.
  const hasOrigin = cue?.kind === "star" && cue?.originX != null && cue?.originY != null;
  const originDX = hasOrigin && cue ? (cue.originX as number) - screenW / 2 : 0;
  const originDY = hasOrigin && cue ? (cue.originY as number) - screenH / 2 : 0;
  const progress = useSharedValue(0);
  const ringScale = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const trail1 = useSharedValue(0);
  const trail2 = useSharedValue(0);
  const completeHapticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (completeHapticTimerRef.current) {
      clearTimeout(completeHapticTimerRef.current);
      completeHapticTimerRef.current = null;
    }
    if (!cue) {
      progress.value = 0;
      ringScale.value = 0;
      ringOpacity.value = 0;
      trail1.value = 0;
      trail2.value = 0;
      return;
    }
    // Reset
    progress.value = 0;
    ringScale.value = 0;
    ringOpacity.value = 0;
    trail1.value = 0;
    trail2.value = 0;
    progress.value = withTiming(1, { duration: NATIVE_STAR_CUE_MS, easing: ReanimEasing.bezier(0.22, 1, 0.36, 1) });
    ringOpacity.value = withSequence(
      withDelay(60, withTiming(0.85, { duration: 90 })),
      withTiming(0, { duration: 210 }),
    );
    ringScale.value = withDelay(60, withTiming(2.2, { duration: 300, easing: ReanimEasing.out(ReanimEasing.cubic) }));
    trail1.value = withDelay(40, withTiming(1, { duration: 320, easing: ReanimEasing.out(ReanimEasing.cubic) }));
    trail2.value = withDelay(90, withTiming(1, { duration: 320, easing: ReanimEasing.out(ReanimEasing.cubic) }));
    completeHapticTimerRef.current = setTimeout(() => { haptic.success(); }, 320);
    return () => {
      if (completeHapticTimerRef.current) {
        clearTimeout(completeHapticTimerRef.current);
        completeHapticTimerRef.current = null;
      }
    };
  }, [cue, progress, ringScale, ringOpacity, trail1, trail2]);

  const isStar = cue?.kind === "star";

  // Star: rise from bottom (+screenH/2 + 80) → center → exit top (-screenH/2 - 80).
  // Scale grows then mildly recedes on exit.
  // D1: when origin coords are provided, start position is the button anchor (originDX, originDY)
  // instead of bottom-of-screen. Falls back to existing start when origin is null.
  const starStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const startY = hasOrigin ? originDY : screenH * 0.55 + 80;
    const startX = hasOrigin ? originDX : 0;
    const ty = interpolate(p, [0, 0.55, 1], [startY, 0, -26], Extrapolation.CLAMP);
    const tx = interpolate(p, [0, 0.55, 1], [startX, 0, 0], Extrapolation.CLAMP);
    // One direction of scale. The old 0.35→1.45→0.55 grew then shrank while
    // flying away, so the motion fought itself.
    const sc = interpolate(p, [0, 0.55, 1], [0.4, 1.18, 1.06], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.12, 0.6, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return { transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }], opacity: op };
  });

  // Wave: rises from below into center, mild scale pulse, fades upward.
  const waveStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const ty = interpolate(p, [0, 1], [18, 0], Extrapolation.CLAMP);
    const sc = interpolate(p, [0, 0.45, 1], [0.7, 1.06, 1.0], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.18, 0.55, 1], [0, 1, 0.9, 0], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty }, { scale: sc }], opacity: op };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: 0.6 + ringScale.value * 0.6 }],
  }));

  // Particle trails — three rising specks, fading outward.
  const trailStyle1 = useAnimatedStyle(() => {
    const p = trail1.value;
    const baseY = isStar ? 80 : 60;
    const ty = interpolate(p, [0, 1], [baseY, baseY - 200], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.15, 0.85, 1], [0, 0.9, 0.6, 0], Extrapolation.CLAMP);
    const sc = interpolate(p, [0, 0.5, 1], [0.5, 1, 0.4], Extrapolation.CLAMP);
    return { transform: [{ translateX: -14 }, { translateY: ty }, { scale: sc }], opacity: op };
  });
  const trailStyle2 = useAnimatedStyle(() => {
    const p = trail2.value;
    const baseY = isStar ? 60 : 40;
    const ty = interpolate(p, [0, 1], [baseY, baseY - 180], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.15, 0.85, 1], [0, 0.9, 0.6, 0], Extrapolation.CLAMP);
    const sc = interpolate(p, [0, 0.5, 1], [0.5, 1, 0.4], Extrapolation.CLAMP);
    return { transform: [{ translateX: 18 }, { translateY: ty }, { scale: sc }], opacity: op };
  });

  if (!cue) return null;

  return (
    <View pointerEvents="none" style={styles.sendCueOverlay}>
      {/* Apex ring — soft halo expanding outward */}
      <Reanimated.View style={[styles.sendCueRing, isStar ? styles.sendCueRingStar : styles.sendCueRingWave, ringStyle]} />
      {/* Trailing particles */}
      {isStar ? (
        <>
          <Reanimated.View style={[styles.sendCueTrailDot, styles.sendCueTrailDotStar, trailStyle1]} />
          <Reanimated.View style={[styles.sendCueTrailDot, styles.sendCueTrailDotSm, styles.sendCueTrailDotStar, trailStyle2]} />
        </>
      ) : null}
      {/* Hero orb */}
      <Reanimated.View style={[styles.sendCueOrb, isStar ? styles.sendCueOrbStar : styles.sendCueOrbWave, isStar ? starStyle : waveStyle]}>
        {isStar ? (
          <View style={styles.sendCueStarIcon}>
            <FontAwesome5 color={huddleColors.coral} name="star" size={42} />
            <FontAwesome5 color={huddleColors.subscriptionAddonLime} name="star" size={36} solid style={styles.sendCueStarIconFill} />
          </View>
        ) : (
          <MaterialCommunityIcons color={huddleColors.onPrimary} name="paw" size={38} />
        )}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: huddleColors.canvas },
  controlsStack: { flexShrink: 0, backgroundColor: huddleColors.canvas },
  // flex:1 is critical — without it, absoluteFill children have no measured height and
  // ScrollViews render at zero height or lose bottom safe-area spacing.
  tabContainer: { flex: 1 },
  skeletonList: { gap: huddleSpacing.x3 },
  content: { paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x10 + huddleSpacing.x8, gap: huddleSpacing.x3 },
  discoverContent: { flexGrow: 1 },
  topToggleRow: { minHeight: huddleSpacing.x9 - huddleSpacing.x2, flexDirection: "row", alignItems: "center", paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  sideActionSlot: { width: 36, height: 36 },
  topToggleCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  topToggle: { width: "100%", maxWidth: 220, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: huddleRadii.pill, backgroundColor: "rgba(243,244,246,0.82)", borderWidth: 1, borderColor: huddleColors.cardBorderSoft },
  topToggleSegment: { overflow: "visible", paddingHorizontal: huddleSpacing.x1 + 2 },
  // Invisible swipe catcher in the empty padding zone above the global NativeBottomNav.
  // `bottom` is set inline at render so we can use the live safe-area inset + nav height.
  bottomSwipeStrip: { position: "absolute", left: 0, right: 0, height: 72 },
  // Active pill = blue glass (TopSegmentGlassLayer: BlurView + blue tint + top highlight
  // + inner rim) + neu: a soft brand-blue colored lift so it reads as a raised glass pill.
  topToggleSegmentActive: {
    minHeight: 36,
    shadowColor: huddleColors.blue,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  topToggleText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  topToggleTextActive: { color: huddleColors.onPrimary },
  // Anchored to the icon (not the variable-height segment) so the badge sits in the
  // same spot whether the tab is active or not; red + white reads clearly on both the
  // white rail and the active blue pill.
  toggleIconWrap: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  toggleUnreadBadge: { position: "absolute", right: -5, top: -4, width: 8, height: 8, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.validationRed, borderWidth: 1.5, borderColor: huddleColors.canvas, zIndex: 5, elevation: 5 },
  toggleUnreadDot: { position: "absolute", right: 2, top: 2, width: 10, height: 10, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.validationRed, borderWidth: 2, borderColor: huddleColors.canvas },
  confirmStarError: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed, textAlign: "center" },
  carerProfileState: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: huddleSpacing.x4 },
  carerProfileStateText: { fontFamily: "Urbanist-600", fontSize: huddleType.body, lineHeight: huddleType.lineNormal, color: huddleColors.mutedText, textAlign: "center" },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  // Verified Create-Group treatment: same shape/size as the # and Search circle buttons, just blue-tinted.
  // Reads as "available" without the visual clash of an outlined border.
  iconButtonSmallVerified: { ...huddleGlassControls.surface },
  dropdownBackdrop: { flex: 1, backgroundColor: "transparent" },
  floatingDropdown: { position: "absolute", top: huddleLayout.headerHeight + 118, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, overflow: "hidden", ...huddleShadows.glassElevation1 },
  groupSortDropdown: { right: huddleSpacing.x4, width: 208 },
  dropdownContent: { padding: huddleFormControls.select.menuPadding },
  dropdownOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical, borderRadius: huddleFormControls.select.optionRadius },
  dropdownOptionActive: { backgroundColor: huddleColors.glassControl },
  dropdownText: { flex: 1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  checkSlot: { width: huddleFormControls.select.checkSlot },
  searchWrap: { minHeight: 44, justifyContent: "center", paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x2 },
  searchField: { height: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderRadius: 22, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3, ...huddleShadows.glassElevation1 },
  searchInput: { flex: 1, minWidth: 0, flexShrink: 1, height: 42, padding: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text, overflow: "hidden" },
  searchClear: { width: 28, height: 28, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  chatTabsRow: { minHeight: huddleSpacing.x8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x2 },
  mainTabRail: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: huddleSpacing.x2 },
  mainTabText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  mainTabTextActive: { color: huddleColors.blue },
  mainTabLabelRow: { alignItems: "center", flexDirection: "row", gap: huddleSpacing.x1 },
  newFriendRailAvatar: { overflow: "hidden", position: "relative" },
  newFriendRailShine: { bottom: 0, position: "absolute", top: 0, width: 34 },
  mainTabIndicator: { position: "absolute", left: huddleSpacing.x2, right: huddleSpacing.x2, bottom: 0, height: 2, borderTopLeftRadius: huddleRadii.pill, borderTopRightRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  chatActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 + 2 },
  iconButtonSmall: { width: huddleSpacing.x6, height: huddleSpacing.x6, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  list: { gap: 0 },
  swipeRowWrap: { overflow: "visible", borderRadius: huddleRadii.card },
  rowDeleteAction: { position: "absolute", top: 0, right: 0, bottom: 0, width: 80, borderRadius: huddleRadii.card, backgroundColor: huddleColors.validationRed, overflow: "hidden" },
  rowDeleteActionPressable: { flex: 1, alignItems: "center", justifyContent: "center" },
  webChatRow: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, ...huddleShadows.glassElevation1 },
  // Shadow lives on the OUTER wrapper — RN clips shadowOpacity/shadowRadius
  // wherever overflow:"hidden" is set, so it can never sit on the same view
  // that clips the cover image to its rounded corners.
  groupCardShadowWrap: { marginBottom: huddleSpacing.x3, borderRadius: 18, backgroundColor: huddleColors.canvas, shadowColor: "#0B1440", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  groupCard: { borderRadius: 18, overflow: "hidden", backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: "rgba(9,15,40,0.10)" },
  groupCardCover: { height: 118, overflow: "hidden", backgroundColor: "#0B1C52" },
  groupCardCoverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  groupCardTopScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 46 },
  groupCardLiveBadge: { position: "absolute", top: 10, right: 10, maxWidth: "70%", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: huddleRadii.pill, backgroundColor: "rgba(9,15,40,0.42)", paddingHorizontal: 9, paddingVertical: 5 },
  groupCardLiveBadgeText: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: "#FFFFFF" },
  groupCardScrimContent: { position: "absolute", left: 14, right: 14, bottom: 10 },
  groupCardNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  groupCardName: { flexShrink: 1, fontFamily: "Urbanist-800", fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: huddleColors.onPrimary },
  groupCardLocationRow: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 },
  groupCardLocationText: { flexShrink: 1, fontFamily: "Urbanist-600", fontSize: 12, lineHeight: 15, color: "rgba(255,255,255,0.75)" },
  groupCardLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#BFFF00" },
  groupCardBody: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3 + 2, paddingVertical: huddleSpacing.x2 + 2 },
  groupCardPreview: { fontSize: 13.5, lineHeight: 17 },
  chatActionPill: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30, paddingHorizontal: huddleSpacing.x3 - 2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas },
  chatActionPillVerified: { borderColor: "rgba(33,69,207,0.35)", backgroundColor: "rgba(33,69,207,0.06)" },
  chatActionPillText: { fontFamily: "Urbanist-700", fontSize: 12, lineHeight: 15, color: huddleColors.iconMuted },
  chatActionPillTextVerified: { color: huddleColors.blue },
  priorityStarRow: { borderColor: huddleColors.coral, shadowColor: huddleColors.coral, shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  webGroupRow: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x4, paddingVertical: huddleSpacing.x4, paddingHorizontal: huddleSpacing.x2, borderRadius: huddleRadii.card, backgroundColor: huddleColors.canvas, borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  rowUnread: { backgroundColor: huddleColors.canvas },
  rowDisabled: { opacity: 0.58 },
  rowPressed: { opacity: 0.92, transform: [{ scale: 0.975 }] },
  avatarPressTarget: { width: 64, height: 64, overflow: "visible", borderRadius: huddleRadii.pill },
  avatar: { width: 56, height: 56, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.canvas, borderWidth: 2, borderColor: huddleColors.blue },
  avatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  groupAvatar: { backgroundColor: huddleColors.coral },
  serviceAvatar: { backgroundColor: huddleColors.premiumGold },
  avatarText: { fontFamily: "Urbanist-800", fontSize: 14, lineHeight: 18, color: huddleColors.onPrimary },
  userAvatarLg: { width: 64, height: 64, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: "transparent", backgroundColor: huddleColors.mutedCanvas },
  userAvatarMd: { width: 48, height: 48, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: "transparent", backgroundColor: huddleColors.mutedCanvas },
  userAvatarVerified: { borderColor: huddleColors.blue },
  userAvatarImageLg: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  userAvatarImageMd: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  userAvatarVerifiedBadgeLg: { position: "absolute", right: -3, bottom: 3 },
  userAvatarVerifiedBadgeMd: { position: "absolute", right: -3, bottom: 1 },
  rowBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: huddleSpacing.x1 },
  rowTop: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  rowTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  rowTitle: { flex: 1, fontFamily: "Urbanist-700", fontSize: 17, lineHeight: 20, color: huddleColors.text },
  rowTopMeta: { flexShrink: 0, flexGrow: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: huddleSpacing.x2 },
  serviceStatusBadge: { flexShrink: 0, minHeight: 22, maxWidth: 118, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2 },
  serviceStatusBadgeBlue: { backgroundColor: huddleColors.glassControl },
  serviceStatusBadgeGreen: { backgroundColor: huddleColors.successSoft },
  serviceStatusBadgeRed: { backgroundColor: huddleColors.validationSoft },
  serviceStatusBadgeText: { fontFamily: "Urbanist-700", fontSize: huddleType.meta, lineHeight: huddleType.metaLine },
  serviceStatusBadgeTextBlue: { color: huddleColors.blue },
  serviceStatusBadgeTextGreen: { color: huddleColors.success },
  serviceStatusBadgeTextRed: { color: huddleColors.coral },
  rowTime: { width: 44, textAlign: "right", fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 14, color: huddleColors.caption },
  rowTimeWithStatus: { flexShrink: 0, textAlign: "right", fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 14, color: huddleColors.caption },
  rowBottom: { minHeight: huddleType.labelLine, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  rowSubtitle: { flex: 1, fontFamily: "Urbanist-500", fontSize: 14, lineHeight: 17, color: huddleColors.mutedText },
  rowSubtitleStar: { color: "#A27A2A" },
  rowSubtitleUnread: { fontFamily: "Urbanist-700", color: huddleColors.text },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: huddleSpacing.x1, backgroundColor: huddleColors.iconMuted },
  readStateCheck: { width: 20, textAlign: "center", fontFamily: "Urbanist-800", fontSize: 12, lineHeight: 14 },
  readStateCheckRead: { color: huddleColors.blue },
  readStateCheckSent: { color: huddleColors.iconSubtle },
  rowAvailability: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.subtext, includeFontPadding: false },
  rowAvailabilitySpacer: { height: huddleType.helperLine },
  unreadText: { fontFamily: "Urbanist-700", fontSize: 12, lineHeight: 14, color: huddleColors.onPrimary },
  groupInlineManageIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  groupListAvatar: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft },
  groupListAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  groupUnreadBadge: { position: "absolute", right: -4, bottom: -4, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: 4, backgroundColor: huddleColors.mutedText },
  groupListBody: { flex: 1, minWidth: 0, gap: huddleSpacing.x2 },
  groupListHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  groupHeaderRight: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: huddleSpacing.x2, marginLeft: "auto" },
  groupListTitle: { flex: 1, paddingRight: huddleSpacing.x2, fontFamily: "Urbanist-700", fontSize: huddleType.body, lineHeight: huddleType.labelLine, color: huddleColors.text },
  groupMembersText: { width: 76, textAlign: "right", fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.caption },
  memberAvatar: { width: 32, height: 32, overflow: "hidden", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  memberAvatarFrame: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 2, borderColor: "transparent", backgroundColor: huddleColors.glassControl },
  memberAvatarFrameVerified: { borderColor: huddleColors.blue },
  memberAvatarImage: { width: "100%", height: "100%", overflow: "hidden", borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.glassControl },
  memberAvatarInitial: { fontFamily: "Urbanist-700", fontSize: 14, lineHeight: 18, color: huddleColors.blue },
  memberVerifiedBadge: { position: "absolute", right: -6, bottom: -5 },
  groupMetaInlineRow: { minHeight: huddleType.helperLine, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  groupLocationInline: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupLocationRow: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupLocationText: { flex: 1, minWidth: 0, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.subtext, includeFontPadding: false },
  groupTagRow: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x1, marginTop: huddleSpacing.x1 },
  groupTag: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.glassControl, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  groupDescriptionText: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  emptyCard: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x5, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, ...huddleShadows.glassElevation1 },
  socialEmptyState: {
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x7,
  },
  socialEmptyStateGroupAligned: {
    paddingTop: huddleSpacing.x5,
  },
  socialEmptyIllustration: {
    height: huddleSocial.emptyAssetHeight,
    maxWidth: "100%",
    width: huddleSocial.emptyAssetWidth,
  },
  socialEmptyTitle: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    marginTop: huddleSpacing.x4,
    textAlign: "center",
  },
  socialEmptyText: {
    color: huddleColors.caption,
    fontFamily: "Urbanist-400",
    fontSize: huddleSocial.emptyTextSize,
    lineHeight: huddleSocial.emptyTextLineHeight,
    marginTop: huddleSpacing.x4,
    textAlign: "center",
  },
  socialEmptyTextStrong: { fontFamily: "Urbanist-600", color: huddleColors.text },
  webEmptyButton: { minHeight: 44, minWidth: 200, marginTop: huddleSpacing.x4, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.button, paddingHorizontal: huddleSpacing.x5, backgroundColor: huddleColors.blue, ...huddleShadows.photoControl },
  webEmptyButtonText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  emptyIcon: { ...huddleGlassControls.surface, width: 56, height: 56, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center" },
  emptyTitle: { textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text },
  emptyBody: { textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  secondaryButton: { ...huddleButtons.base, ...huddleButtons.secondary, minHeight: 48 },
  secondaryButtonText: { ...huddleButtons.label, color: huddleColors.text },
  matchRailContent: { gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x2, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  matchRailItem: { width: 68, height: 68, alignItems: "center", justifyContent: "center", overflow: "visible" },
  matchRailItemJustAdded: { borderWidth: 2, borderColor: huddleColors.premiumGold, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.premiumGoldSoft, shadowColor: huddleColors.premiumGold, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  matchRailAvatar: { width: 54, height: 54, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.blue, borderWidth: 2, borderColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  matchRailImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  matchRailMoreTile: { width: 64, height: 64, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.mutedCanvas, borderWidth: 1, borderColor: huddleColors.fieldBorder },
  matchRailMoreText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  matchRailVerifiedBadge: { position: "absolute", right: -3, bottom: -2 },
  matchRailCarBadge: { position: "absolute", left: -1, bottom: -1, width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.premiumGold, borderWidth: 2, borderColor: huddleColors.canvas },
  discoveryStack: { position: "relative", alignItems: "center", paddingBottom: huddleSpacing.x4 },
  discoveryStaticDeckCard: {
    position: "absolute",
    top: huddleSpacing.x2,
    borderRadius: huddleRadii.card,
    borderWidth: 0,
  },
  discoveryStaticDeckCardOne: { backgroundColor: "#8192D7" },
  discoveryStaticDeckCardTwo: { backgroundColor: "#95B7FA" },
  discoveryStaticDeckCardThree: { backgroundColor: "#DEE2EA" },
  discoveryPreparedRevealWash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#8192D7",
    borderBottomLeftRadius: huddleRadii.modal,
    borderBottomRightRadius: huddleRadii.modal,
    zIndex: 30,
    elevation: 30,
  },
  discoverIconSlashWrap: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  discoverIconSlash: { position: "absolute", width: 25, height: 1.75, borderRadius: 1, transform: [{ rotate: "45deg" }] },
  // Friends Matching paused — reuses the bottom-card swipe cover (RNBlurView + wash)
  // to blur the WHOLE top card, with the message + CTA centered on top.
  discoveryPausedCover: { ...StyleSheet.absoluteFillObject, zIndex: 25, elevation: 25, alignItems: "center", justifyContent: "center", paddingHorizontal: huddleSpacing.x6 },
  discoveryLocationPermissionInCard: { elevation: 0 },
  discoveryPausedContent: { alignItems: "center", paddingHorizontal: huddleSpacing.x4, gap: huddleSpacing.x3 },
  discoveryPausedTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text, textAlign: "center" },
  discoveryPausedBody: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.subtext, textAlign: "center" },
  discoveryPausedButton: { marginTop: huddleSpacing.x2, minHeight: 48, paddingHorizontal: huddleSpacing.x6, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.button, backgroundColor: huddleColors.blue },
  discoveryPausedButtonText: { fontFamily: "Urbanist-700", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.onPrimary },
  discoveryCardUnit: { position: "relative", alignItems: "center" },
  discoveryProfileCard: { position: "relative", zIndex: 20, width: "100%", overflow: "hidden", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.canvas, borderWidth: DISCOVERY_PROFILE_CARD_BORDER_WIDTH, borderColor: "rgba(66,73,101,0.12)" },
  // Tighten the verified check next to the name — overrides the badge wrapper to lift the glyph slightly closer to the baseline of the bold name above it.
  // Loading-shell composition that sits over the shimmer fill — name/role placeholder lines + chip row.
  discoveryShellCopyStack: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, bottom: huddleSpacing.x6, gap: huddleSpacing.x2 },
  discoveryShellLineWide: { height: 18, width: "62%", borderRadius: huddleRadii.pill },
  discoveryShellLineMed: { height: 14, width: "40%", borderRadius: huddleRadii.pill },
  discoveryShellChipRow: { flexDirection: "row", gap: huddleSpacing.x2, marginTop: huddleSpacing.x1 },
  discoveryShellChip: { height: 22, width: 68, borderRadius: huddleRadii.pill },
  discoveryCardQueued: { position: "absolute", top: huddleSpacing.x2, opacity: 1 },
  discoveryPhotoWrap: { position: "relative", overflow: "hidden", borderTopLeftRadius: huddleRadii.modal, borderTopRightRadius: huddleRadii.modal, backgroundColor: huddleColors.glassControl },
  discoveryPhotoWrapRoundedBottom: { borderBottomLeftRadius: huddleRadii.modal, borderBottomRightRadius: huddleRadii.modal },
  discoveryQueuedPrivacyLayer: { zIndex: 17 },
  discoveryQueuedPrivacyWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.24)" },
  discoveryQueuedBottomShadow: { position: "absolute", alignSelf: "center", height: 18, borderRadius: huddleRadii.pill, backgroundColor: "transparent", shadowColor: "#42526E", shadowOpacity: 0.1, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 6 },
  discoveryProfileTap: { flex: 1 },
  discoveryPhoto: { width: "100%", height: "100%", borderTopLeftRadius: huddleRadii.modal, borderTopRightRadius: huddleRadii.modal },
  discoveryPhotoRoundedBottom: { borderBottomLeftRadius: huddleRadii.modal, borderBottomRightRadius: huddleRadii.modal },
  discoveryPhotoFallback: { flex: 1, alignItems: "center", justifyContent: "center", borderTopLeftRadius: huddleRadii.modal, borderTopRightRadius: huddleRadii.modal, backgroundColor: huddleColors.blue },
  discoveryPhotoFallbackText: { fontFamily: "Urbanist-800", fontSize: 42, lineHeight: 48, color: huddleColors.onPrimary },
  discoveryAlbumLeftZone: { position: "absolute", left: 0, top: 0, zIndex: 6, width: "33%" },
  discoveryAlbumRightZone: { position: "absolute", right: 0, top: 0, zIndex: 6, width: "33%" },
  discoveryAlbumDots: { position: "absolute", left: 0, right: 0, top: huddleSpacing.x3, zIndex: 7, flexDirection: "row", justifyContent: "center", gap: 6 },
  discoveryAlbumDot: { width: 6, height: 6, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.glassControl },
  discoveryAlbumDotActive: { width: 16, backgroundColor: huddleColors.canvas },
  discoveryPhotoScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9, 21, 95, 0.08)" },
  discoveryTopBadgeRow: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, top: huddleSpacing.x4, zIndex: 8, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  discoveryTopLeftBadges: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingRight: huddleSpacing.x2 },
  discoveryCarBadge: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  discoveryShieldBadge: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue, borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.photoControl },
  discoveryTrafficActions: { gap: huddleSpacing.x3, alignItems: "center", paddingTop: huddleSpacing.x1 },
  discoveryTrafficButton: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, ...huddleShadows.photoControl },
  discoveryTrafficStar: { backgroundColor: huddleColors.coral, borderColor: huddleColors.coral },
  discoveryTrafficWave: { backgroundColor: huddleColors.blue, borderColor: huddleColors.blue },
  discoveryTrafficPass: { backgroundColor: huddleColors.canvas, borderColor: huddleColors.glassBorder },
  discoveryWaveIcon: { transform: [{ rotate: "0deg" }] },
  discoverySwipeTint: { ...StyleSheet.absoluteFillObject, zIndex: 12 },
  discoveryWaveTint: { backgroundColor: "rgba(33,71,201,0.96)" },
  // D1: star lift halo overlay sits above content but below the orb cue. Uses coral for star parity.
  discoveryLiftHalo: { ...StyleSheet.absoluteFillObject, zIndex: 14, backgroundColor: huddleColors.coral },
  // Discover refresh icon — bare, no background, same Feather "refresh-cw" + subtext color as Map's MapControlButton icon
  discoverRefreshButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  // D1: ConfirmStarModal Send-button wrap holds the gold pulse halo behind the button while pending.
  confirmStarSendWrap: { position: "relative", flex: 1 },
  // D1: halo sits behind the AppModalButton (zIndex below button). Slight inset so it reads as glow, not a frame.
  confirmStarSendHalo: { position: "absolute", left: -8, right: -8, top: -8, bottom: -8, zIndex: -1, borderRadius: huddleRadii.button, backgroundColor: huddleColors.coral },
  // Bespoke gold Send Star button — mirrors AppModalButton height/radius (48 / pill) without modifying the locked primitive.
  confirmStarSendGoldButton: { flex: 1, height: 48, borderRadius: huddleRadii.button, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.coral },
  confirmStarSendGoldButtonDisabled: { opacity: 0.55 },
  confirmStarSendGoldText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  discoveryPassTint: { backgroundColor: "rgba(233,76,92,0.95)" },
  // Stamps anchor to corners but sit BELOW the top-badge row (car badge + chips). 56px from card top
  // clears the badge row's ~44px height + spacing, so stamps never overlap badges.
  swipeStamp: { position: "absolute", zIndex: 18, top: 56, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, borderWidth: 1.5, backgroundColor: "rgba(255,255,255,0.85)" },
  passStamp: { right: huddleSpacing.x4, borderColor: "#E94C5C" },
  // Wave stamp now sits TOP-LEFT, mirroring the pass stamp on TOP-RIGHT. No longer covers the face.
  waveStamp: { left: huddleSpacing.x4, borderColor: huddleColors.blue },
  passStampText: { fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 18, letterSpacing: 2.3, color: "#E94C5C" },
  passStampIcon: { transform: [{ scaleX: -1 }] },
  waveStampText: { fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 18, letterSpacing: 2.3, color: huddleColors.blue },
  discoveryWaveStampIcon: { transform: [{ rotate: "-60deg" }] },
  discoveryNameRow: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, bottom: huddleSpacing.x4, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  discoveryName: { fontFamily: "Urbanist-800", fontSize: 32, lineHeight: 38, color: huddleColors.onPrimary, textShadowColor: huddleColors.profileNameShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  verifiedPill: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, paddingHorizontal: huddleSpacing.x3, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  verifiedText: { fontFamily: "Urbanist-800", fontSize: 11, lineHeight: 14, color: huddleColors.onPrimary },
  discoveryBody: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, bottom: huddleSpacing.x5, minHeight: 164, overflow: "hidden", borderRadius: huddleRadii.sheet, borderWidth: 1, borderColor: "rgba(255,255,255,0.42)", backgroundColor: "rgba(255,255,255,0.58)", ...huddleShadows.glassElevation1 },
  discoveryRoleStrip: { height: 44, justifyContent: "center", paddingHorizontal: huddleSpacing.x5, backgroundColor: "rgba(255,255,255,0.62)" },
  discoveryRoleStripText: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  discoveryGlassCopy: { paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x4, paddingBottom: huddleSpacing.x4, gap: huddleSpacing.x2 },
  discoveryMetaRow: { gap: huddleSpacing.x2 },
  discoveryGlassMeta: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  discoveryGlassMetaText: { flexShrink: 1, fontFamily: "Urbanist-600", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.onPrimary },
  discoveryChip: { minHeight: 24, maxWidth: 92, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: huddleSpacing.x2, borderRadius: huddleRadii.pill, backgroundColor: "rgba(255,255,255,0.58)", borderWidth: 1, borderColor: "rgba(255,255,255,0.70)" },
  discoveryChipText: { flexShrink: 1, fontFamily: "Urbanist-700", fontSize: 12, lineHeight: 16, color: huddleColors.blue },
  discoveryEndWrap: { width: "100%", alignItems: "center", paddingTop: huddleSpacing.x6, paddingHorizontal: huddleSpacing.x6, gap: huddleSpacing.x2 },
  discoveryEndImage: { width: 220, height: 220, marginBottom: huddleSpacing.x2 } as ImageStyle,
  discoveryEndHeadline: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text, textAlign: "center" },
  discoveryEndSub: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.subtext, textAlign: "center" },
  discoveryEndActions: { marginTop: huddleSpacing.x4, gap: huddleSpacing.x3, alignItems: "center", width: "100%" },
  discoveryEndPrimary: { minHeight: 48, width: "100%", maxWidth: 280, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue, paddingHorizontal: huddleSpacing.x5, ...huddleShadows.photoControl },
  discoveryEndPrimaryText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  discoveryEndSecondary: { minHeight: 44, width: "100%", maxWidth: 280, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldFocusRing, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x5 },
  discoveryEndSecondaryText: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  discoveryRoleBadge: { minHeight: 32, maxWidth: "100%", justifyContent: "center", paddingHorizontal: huddleSpacing.x3, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.glassControl, borderWidth: 1, borderColor: huddleColors.glassBorder },
  discoveryRoleBadgeText: { flexShrink: 1, fontFamily: "Urbanist-800", fontSize: 15, lineHeight: 19, color: huddleColors.blue },
  discoveryPetLine: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  discoveryBio: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.subtext },
  discoveryActionIsland: { width: 220, height: 72, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x2, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.glassChrome, borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.glassElevation1 },
  discoveryActionIslandSlot: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 30, elevation: 30 },
  discoveryActionSecondary: { width: 56, height: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.photoControl },
  discoveryActionSecondaryText: { ...huddleButtons.label, color: huddleColors.text },
  discoveryActionStar: { width: 56, height: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.coral, borderWidth: 1.5, borderColor: huddleColors.coral, ...huddleShadows.photoControl },
  discoveryStarIcon: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  discoveryTrafficStarIcon: { width: 22, height: 22 },
  // Flip the double-chevron horizontally so it points right (skip/next) instead of left.
  discoveryPassIcon: { transform: [{ scaleX: -1 }] },
  // --- Discover card v2: on-card glass actions + top-right Next ---
  // White bottom scrim keeps the photo airy and links the hero copy to the white bio surface below.
  discoveryBottomGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "44%" },
  discoveryHeroCopy: { position: "absolute", left: huddleSpacing.x4, right: 132, bottom: huddleSpacing.x4, zIndex: 22, gap: huddleSpacing.x1 },
  discoveryKickerRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  discoveryInlineStar: { width: 38, height: 38, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.coral, borderWidth: 1, borderColor: "rgba(255,220,192,0.92)", shadowColor: huddleColors.coral, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  discoveryRoleKicker: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-700", fontSize: 14, lineHeight: 18, letterSpacing: 1, color: huddleColors.mutedText, textTransform: "uppercase" },
  discoveryHeroNameRow: { maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  discoveryHeroName: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-800", fontSize: 32, lineHeight: 35, includeFontPadding: false, color: huddleColors.text, textTransform: "uppercase" },
  discoveryHeroVerified: { marginLeft: -2, marginTop: 1 },
  discoveryHeroFacts: { marginTop: huddleSpacing.x2, maxWidth: 210 },
  discoveryHeroFactsKicker: { fontFamily: "Urbanist-700", fontSize: 14, lineHeight: 18, letterSpacing: 1, color: huddleColors.mutedText, textTransform: "uppercase" },
  discoveryHeroFactsText: { marginTop: 2, fontFamily: "Urbanist-700", fontSize: 21, lineHeight: 25, color: huddleColors.subtext },
  // Wave owns the card's bottom-right hero corner. Swipes with the card.
  discoveryCornerActions: { position: "absolute", right: huddleSpacing.x4, bottom: huddleSpacing.x4, zIndex: 23, flexDirection: "row", alignItems: "flex-end", gap: huddleSpacing.x2 },
  // Shadow wrappers only — the frosted glass + clipping live in NativeGlassCircle (overflow:hidden clips
  // its own shadow, so the soft depth shadow sits here on the un-clipped Pressable).
  discoveryGlassStar: { width: 48, height: 48, borderRadius: huddleRadii.pill, ...huddleShadows.glassElevation1 },
  discoveryGlassWave: { width: 60, height: 60, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)", backgroundColor: "transparent", ...huddleShadows.glassElevation1 },
  discoveryBioPanel: { position: "relative", overflow: "hidden", justifyContent: "center", paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x2, backgroundColor: huddleColors.canvas, borderTopWidth: 0, borderBottomLeftRadius: huddleRadii.modal, borderBottomRightRadius: huddleRadii.modal },
  discoveryBioPanelQuote: { paddingHorizontal: 8, paddingVertical: 4 },
  discoveryPackPanel: { paddingHorizontal: 8, paddingVertical: huddleSpacing.x1 },
  discoveryBioPanelCompact: { paddingVertical: huddleSpacing.x2 },
  discoveryBioPanelSingle: { paddingHorizontal: 8, paddingVertical: 4 },
  discoveryBioMeta: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, letterSpacing: 0.8, color: huddleColors.mutedText, textTransform: "uppercase" },
  discoveryBioQuoteWrap: { width: "100%", alignSelf: "stretch", justifyContent: "center", paddingHorizontal: 0, paddingVertical: 4 },
  discoveryBioQuoteOpen: { position: "absolute", left: 8, top: 4, fontFamily: "Georgia", fontSize: 30, lineHeight: 30, color: huddleColors.sectionDividerStrong },
  discoveryBioQuoteClose: { position: "absolute", right: 8, bottom: 4, fontFamily: "Georgia", fontSize: 30, lineHeight: 30, color: huddleColors.sectionDividerStrong },
  discoveryBioCopy: { width: "100%", alignSelf: "stretch", paddingHorizontal: 8, fontFamily: "Urbanist-600Italic", fontSize: 17, lineHeight: 27, color: huddleColors.text },
  discoveryBioCopySingle: { width: "100%", textAlign: "center", fontSize: 16, lineHeight: 24 },
  discoveryPackPreview: { width: "100%", maxWidth: 370, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2 },
  discoveryPackPreviewSingle: { maxWidth: 360 },
  discoveryPackCopy: { flex: 1, minWidth: 0 },
  discoveryPackLineRow: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  discoveryPackLine: { flex: 1, minWidth: 0, fontFamily: "Urbanist-600Italic", fontSize: 16, lineHeight: 22, color: huddleColors.text },
  discoveryPackKicker: { flexShrink: 0, fontFamily: "Urbanist-700", fontSize: 14, lineHeight: 18, letterSpacing: 0.7, color: huddleColors.mutedText, textTransform: "uppercase" },
  discoveryPackMiniCarousel: { width: 62, height: 48, position: "relative", flexShrink: 0 },
  discoveryPackMiniPolaroid: { position: "absolute", right: 0, top: 0, width: 38, height: 46, padding: 3, paddingBottom: 9, borderRadius: 6, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: "rgba(66,73,101,0.10)", shadowColor: huddleColors.neutralShadow, shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2, transform: [{ rotate: "4deg" }] },
  discoveryPackMiniPolaroidBack: { right: 23, top: 3, transform: [{ rotate: "-5deg" }], opacity: 0.92 },
  discoveryPackMiniPhoto: { width: "100%", height: "100%", borderRadius: 4, backgroundColor: huddleColors.glassControl },
  discoveryPackTitle: { marginTop: 3, fontFamily: "Urbanist-700", fontSize: 16, lineHeight: 20, color: huddleColors.text },
  discoveryPackMeta: { marginTop: 2, fontFamily: "Urbanist-600", fontSize: 12, lineHeight: 15, letterSpacing: 0.7, color: huddleColors.subtext, textTransform: "uppercase" },
  discoveryPackPolaroids: { width: 92, height: 74, position: "relative", flexShrink: 0 },
  discoveryPackPolaroidsSingle: { width: 58, height: 48 },
  discoveryPackPolaroid: { position: "absolute", right: 0, top: 0, width: 58, height: 70, padding: 4, paddingBottom: 13, borderRadius: 8, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: "rgba(66,73,101,0.10)", shadowColor: huddleColors.neutralShadow, shadowOpacity: 0.12, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3, transform: [{ rotate: "3deg" }] },
  discoveryPackPolaroidBack: { right: 34, top: 6, transform: [{ rotate: "-5deg" }], opacity: 0.96 },
  discoveryPackPhoto: { width: "100%", height: "100%", borderRadius: 5, backgroundColor: huddleColors.glassControl },
  discoveryPackPhotoFallback: { width: "100%", height: "100%", borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.glassControl },
  // Next: chrome-light, top-right "close" corner. Small + faint, just enough contrast on bright photos.
  discoveryNextButton: { position: "absolute", right: huddleSpacing.x3, top: huddleSpacing.x3, zIndex: 22, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", backgroundColor: huddleCoachMark.passSurface },
  discoveryStarButton: { flexGrow: 0, flexShrink: 0 },
  discoveryActionPrimary: { width: 56, height: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue, borderWidth: 1, borderColor: huddleColors.blue, ...huddleShadows.photoControl },
  discoveryActionPrimaryText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  actionDisabled: { opacity: 0.62 },
  exploreList: { gap: huddleSpacing.x4 },
  inviteInboxLauncher: { ...huddleGlassControls.surface, minHeight: 58, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  inviteInboxLauncherCopy: { flex: 1, minWidth: 0 },
  inviteInboxLauncherTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  inviteInboxLauncherBody: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.subtext },
  inviteInboxList: { gap: huddleSpacing.x2 },
  inviteInboxRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  inviteInboxIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  inviteInboxAvatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassControl },
  inviteInboxAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  inviteInboxCopy: { flex: 1, minWidth: 0 },
  inviteInboxName: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  inviteInboxMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.subtext },
  inviteInboxActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupInvitePromptStrong: { fontFamily: "Urbanist-800", color: huddleColors.text },
  groupInviteBanner: { minHeight: 64, gap: huddleSpacing.x2, marginBottom: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.glassBorder, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, backgroundColor: huddleColors.glassChrome, ...huddleShadows.glassElevation1 },
  groupInviteBannerHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupInviteBannerCopy: { flex: 1, minWidth: 0 },
  groupInviteBannerText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  groupInviteBannerName: { fontFamily: "Urbanist-800", color: huddleColors.text },
  groupInviteBannerActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupInviteBannerSecondary: { minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  groupInviteBannerSecondaryText: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.text },
  groupInviteBannerPrimary: { minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.blue },
  groupInviteBannerPrimaryText: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.onPrimary },
  groupInviteBannerExpanded: { gap: huddleSpacing.x2, borderTopWidth: 1, borderTopColor: huddleColors.glassBorder, paddingTop: huddleSpacing.x2 },
  groupInviteBannerRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupInviteBannerRowCopy: { flex: 1, minWidth: 0 },
  groupInviteBannerRowTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  groupInviteBannerRowMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.subtext },
  exploreCover: { width: "100%", aspectRatio: 16 / 9, overflow: "hidden", backgroundColor: huddleColors.blue },
  exploreCoverImage: { width: "100%", height: "100%" },
  exploreCoverFallback: { flex: 1, backgroundColor: huddleColors.blue },
  exploreChipSentence: { textTransform: "none", letterSpacing: 0.1 },
  exploreChipRowWithFaces: { paddingRight: 124 },
  exploreFaceStack: { position: "absolute", right: huddleSpacing.x3, bottom: huddleSpacing.x3, flexDirection: "row", alignItems: "center" },
  groupCardFaceStack: { left: huddleSpacing.x3, right: undefined, top: huddleSpacing.x3, bottom: undefined },
  exploreFaceStackItem: { width: 32, height: 32, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.canvas, backgroundColor: huddleColors.canvas, overflow: "hidden" },
  exploreFaceStackItemOut: { borderWidth: 2, borderColor: huddleColors.success },
  exploreFaceStackImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  exploreFaceStackFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.mutedCanvas },
  exploreFaceStackOverlap: { marginLeft: -9 },
  exploreFaceStackMore: { minWidth: 32, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.mutedCanvas, paddingHorizontal: 4 },
  exploreFaceStackMoreText: { fontFamily: "Urbanist-700", fontSize: 11, lineHeight: 14, color: huddleColors.subtext },
  exploreBodyWithStack: {},
  exploreOutNowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  exploreOutNowText: { fontFamily: "Urbanist-700", fontSize: 12.5, lineHeight: 16, color: huddleColors.text },
  exploreScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.profileHeroScrimMid },
  exploreMembers: { position: "absolute", left: huddleSpacing.x3, top: huddleSpacing.x3, overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.profileCaptionOverlay, fontFamily: "Urbanist-600", fontSize: 11, lineHeight: 14, color: huddleColors.onPrimary },
  exploreHideButton: { position: "absolute", right: huddleSpacing.x3, top: huddleSpacing.x3, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.glassElevation1 },
  exploreOverlay: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, bottom: huddleSpacing.x3, gap: huddleSpacing.x1 },
  exploreEventCountdown: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.success, backgroundColor: "transparent", overflow: "hidden" },
  exploreEventCountdownDotWrap: { marginLeft: 10, marginRight: -4 },
  exploreEventCountdownGlassFill: { borderRadius: huddleRadii.pill, backgroundColor: huddleColors.successSoft },
  exploreEventCountdownGreenTint: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.successSoft },
  exploreEventCountdownText: { borderWidth: 0, borderColor: "transparent", backgroundColor: "transparent", color: huddleColors.onPrimary, textTransform: "none" },
  exploreTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.onPrimary },
  exploreMetaRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  exploreMeta: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.profileCaptionPlaceholder },
  exploreBody: { padding: huddleSpacing.x4, gap: huddleSpacing.x3 },
  exploreDescription: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  exploreCtaInvite: { backgroundColor: huddleColors.coral },
  exploreCtaDisabled: { backgroundColor: huddleColors.mutedCanvas, shadowOpacity: huddleButtons.disabled.shadowOpacity },
  exploreCtaText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  exploreCtaDisabledText: { color: huddleColors.mutedText },
  managementSection: { gap: huddleSpacing.x5 },
  managementInlineBlock: { gap: huddleSpacing.x3 },
  managementActionCard: { overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas },
  managementActionHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  managementActionRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  managementActionCopy: { flex: 1, minWidth: 0 },
  managementActionTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.body, lineHeight: huddleType.labelLine, color: huddleColors.text },
  managementActionBody: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  groupSheetActionGrid: { gap: huddleSpacing.x2 },
  groupSheetActionButton: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  groupSheetActionDestructive: { fontFamily: "Urbanist-700", fontSize: huddleType.body, lineHeight: huddleType.labelLine, color: huddleColors.validationRed },
  managementCountBadge: { minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x1, backgroundColor: huddleColors.blue },
  managementCountText: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.onPrimary },
  inviteMembersBlock: { gap: huddleSpacing.x3 },
  inviteEditor: { gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x4, paddingBottom: huddleSpacing.x4 },
  inviteSearchWrap: { minHeight: 44, justifyContent: "center" },
  inviteSearchField: { height: 44 },
  inviteMemberRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  inviteSuggestionCopy: { flex: 1, minWidth: 0, justifyContent: "center", gap: 0 },
  inviteSuggestionCopySingle: { alignSelf: "stretch" },
  inviteSuggestionName: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-800", fontSize: huddleType.body, lineHeight: 18, color: huddleColors.text, includeFontPadding: false },
  inviteSuggestionHandle: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText, includeFontPadding: false },
  pendingInviteIdentity: { opacity: 0.72 },
  cancelInviteText: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  mediaSection: { gap: huddleSpacing.x2 },
  createGroupSheet: { height: "82%", maxHeight: "82%", flexShrink: 0 },
  createGroupScroll: { flex: 1, minHeight: 0 },
  createGroupScrollContent: { paddingBottom: huddleSpacing.x10 },
  createSheetContent: { gap: huddleSpacing.x4, paddingBottom: huddleSpacing.x3 },
  createNameRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  createNameField: { flex: 1, minWidth: 0 },
  createAvatarButton: { ...huddleGlassControls.surface, width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  createAvatarButtonError: { ...huddleFieldStates.error },
  createAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  createFieldBlock: { gap: huddleSpacing.x1 + 2 },
  createTextField: { height: 58, minHeight: 58, maxHeight: 58, paddingHorizontal: huddleSpacing.x3, paddingTop: 0, paddingBottom: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, includeFontPadding: false, textAlignVertical: "center" },
  locationFieldRow: { height: 56, minHeight: 56, maxHeight: 56, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: huddleColors.fieldBorder, borderRadius: huddleRadii.field, paddingLeft: huddleSpacing.x1, paddingRight: huddleSpacing.x3, backgroundColor: huddleColors.glassChrome, ...huddleShadows.glassElevation1 },
  // includeFontPadding: false intentionally omitted — on Android it strips the padding
  // reserved for descenders (g/y/j/p/q), which clips them against this field's fixed-height
  // parent row. textAlignVertical: "center" still centers the text correctly without it.
  locationFieldInput: { flex: 1, minWidth: 0, flexShrink: 1, height: "100%", paddingTop: huddleSpacing.x1, paddingBottom: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, textAlignVertical: "center", color: huddleColors.text, overflow: "hidden" },
  locationFieldPin: { marginRight: huddleSpacing.x1 },
  groupDetailsNameField: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, textAlignVertical: "center" },
  createLabel: { marginBottom: huddleSpacing.x1 + 2, paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  createHelperText: { marginTop: huddleSpacing.x1, paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  createErrorText: { marginTop: -huddleSpacing.x2, paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed },
  createSelectLabel: { fontSize: huddleType.label, lineHeight: huddleType.labelLine },
  createSelectTrigger: { minHeight: 52, height: 52 },
  createSelectText: { fontSize: huddleType.label, lineHeight: huddleType.labelLine },
  groupMetaChipRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupMetaChip: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  groupMetaChipActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  groupMetaChipText: { flexShrink: 1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  groupMetaChipTextActive: { color: huddleColors.onPrimary },
  petFocusMenu: { marginTop: huddleSpacing.x2, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleFormControls.select.menuBorderColor, padding: huddleFormControls.select.menuPadding, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  petFocusMenuContent: { padding: huddleFormControls.select.menuPadding },
  petFocusOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleFormControls.select.optionRadius, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical },
  petFocusOptionActive: { backgroundColor: huddleColors.glassControl },
  petFocusOptionText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  petFocusOptionTextActive: { color: huddleColors.blue },
  petFocusBreedBlock: { gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  petFocusDetailField: { gap: huddleSpacing.x1, marginTop: huddleSpacing.x3 },
  petFocusDetailLabel: { paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  petFocusBreedTrigger: { minHeight: 52, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, paddingHorizontal: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  petFocusBreedText: { flex: 1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  petFocusBreedPlaceholder: { color: huddleColors.mutedText },
  petFocusBreedMenu: { maxHeight: 180, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, padding: huddleSpacing.x1 },
  petFocusBreedOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleFormControls.select.optionRadius, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical },
  petFocusOtherInput: { height: 52, minHeight: 52, maxHeight: 52, marginHorizontal: huddleSpacing.x2, marginBottom: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingTop: 0, paddingBottom: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, includeFontPadding: false, textAlignVertical: "center" },
  filterGroup: { paddingTop: huddleSpacing.x3 },
  filterScroll: { maxHeight: FILTER_SHEET_SCROLL_MAX_HEIGHT },
  filterScrollContent: { paddingHorizontal: huddleSpacing.x6, paddingTop: huddleSpacing.x3, paddingBottom: huddleSpacing.x3 },
  filterCategoryRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3, borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  filterGroupTitle: { paddingVertical: huddleSpacing.x2, fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText, textTransform: "uppercase", letterSpacing: 0.8 },
  upgradeCard: { width: "100%", maxWidth: 390, maxHeight: "100%", overflow: "hidden", borderRadius: huddleRadii.glass, borderWidth: 1.5, borderColor: huddleColors.membershipUpgradeBorder, ...huddleShadows.glassElevation2 },
  upgradeBillingRow: { minHeight: 44, flexDirection: "row" },
  upgradeBillingTab: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1 },
  upgradeBillingTabInactive: { backgroundColor: huddleColors.canvas },
  upgradeBillingText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  upgradeDiscountBadge: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.onPrimary },
  upgradeBody: { paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x4, paddingBottom: huddleSpacing.x3 },
  upgradeHeadline: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.onPrimary },
  upgradeSubheadline: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.membershipUpgradeTextSoft },
  upgradePrice: { marginTop: huddleSpacing.x4, fontFamily: "Urbanist-800", fontSize: huddleType.h1, lineHeight: huddleType.h1Line, color: huddleColors.onPrimary },
  upgradePriceUnit: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.membershipUpgradeTextSoft },
  upgradeAnnualNote: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.membershipUpgradeTextMuted },
  upgradeDivider: { height: 1, marginTop: huddleSpacing.x4, backgroundColor: huddleColors.membershipUpgradeDivider },
  upgradeFeatureList: { marginTop: huddleSpacing.x3 },
  upgradeFeatureRow: { flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x3, paddingVertical: huddleSpacing.x2 },
  upgradeFeatureCopy: { flex: 1, minWidth: 0 },
  upgradeFeatureTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  upgradeFeatureSubtitle: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.membershipUpgradeTextSoft },
  upgradeCta: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: huddleSpacing.x5, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas },
  upgradeCtaText: { ...huddleButtons.label },
  upgradeLaterButton: { minHeight: 40, alignItems: "center", justifyContent: "center", marginTop: huddleSpacing.x2 },
  upgradeLaterText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.membershipUpgradeTextFaint },
  filterSection: { borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  filterRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  filterInlineEditor: { paddingBottom: huddleSpacing.x4 },
  filterTitleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  filterLabel: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  filterLabelLocked: { color: huddleColors.mutedText },
  filterTierPill: { minHeight: 25, justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3 },
  filterTierPillPlus: { backgroundColor: huddleColors.membershipUpgradePlus },
  filterTierPillGold: { backgroundColor: huddleColors.membershipUpgradeGold },
  filterTierPillText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: 16, color: huddleColors.onPrimary },
  filterSummaryWrap: { maxWidth: "52%", flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  filterSummary: { flexShrink: 1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  toggleRow: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  nativeSwitch: { ...huddleGlassControls.toggleSurface, width: huddleSpacing.x8, height: huddleSpacing.x5, justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x1 },
  nativeSwitchActive: { backgroundColor: huddleColors.blue },
  nativeSwitchKnob: { width: huddleSpacing.x4, height: huddleSpacing.x4, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas },
  nativeSwitchKnobActive: { alignSelf: "flex-end" },
  inlineSelectLayer: { zIndex: 30, elevation: 8 },
  selectTrigger: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleRadii.field, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3 },
  selectValue: { flex: 1, fontFamily: "Urbanist-500", fontSize: 14, color: huddleColors.text },
  placeholderText: { color: huddleColors.mutedText },
  selectMenu: { maxHeight: huddleFormControls.select.menuMaxHeight, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 0, backgroundColor: huddleColors.canvas, padding: huddleFormControls.select.menuPadding, ...huddleShadows.dropdownMenu },
  selectOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, borderRadius: huddleFormControls.select.optionRadius, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical },
  selectOptionText: { flex: 1, fontFamily: "Urbanist-500", fontSize: 14, color: huddleColors.text },
  selectCheckSlot: { width: huddleFormControls.select.checkSlot, height: huddleFormControls.select.checkSlot },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  detailsMeta: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  groupDetailsSheet: { height: "82%", maxHeight: "82%", flexShrink: 0 },
  groupDetailsScroll: { flex: 1, minHeight: 0 },
  groupHeaderActionCluster: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupHeaderActionButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  groupHeaderDangerButton: { backgroundColor: huddleColors.validationSoft },
  groupDetailsHeaderSpacer: { flex: 1 },
  groupDetailsScrollContent: { paddingBottom: huddleSpacing.x10 },
  groupDetailsFooterButtonLabel: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2 },
  groupDetailsBody: { gap: huddleSpacing.x5 },
  groupEditControls: { gap: huddleSpacing.x4 },
  groupNameEditRow: { flexDirection: "row", alignItems: "flex-end", gap: huddleSpacing.x3 },
  groupNameEditAvatar: { ...huddleGlassControls.surface, width: 58, height: 58, marginBottom: 1, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  groupNameEditAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  groupNameEditFieldWrap: { flex: 1, minWidth: 0 },
	  groupHeroDescriptionBlock: { overflow: "hidden", borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft },
  groupHeroActionCluster: { position: "absolute", left: huddleSpacing.x3, top: huddleSpacing.x3, zIndex: 3, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupHeroActionButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: "rgba(9,12,25,0.48)", borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, ...huddleShadows.photoControl },
  groupHeroDangerButton: { backgroundColor: "rgba(239,68,68,0.82)" },
	  heroOverlayAction: { position: "absolute", right: huddleSpacing.x3, top: huddleSpacing.x3, width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop, borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, ...huddleShadows.photoControl },
  descriptionInlineCard: { gap: huddleSpacing.x4, padding: huddleSpacing.x4, backgroundColor: huddleColors.canvas },
  descriptionInlineHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  groupDetailsDescriptionText: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 24, color: huddleColors.text },
  exploreMembersSection: { gap: huddleSpacing.x2 },
  inlineIconButton: { ...huddleGlassControls.surface, width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  memberIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
	  groupMemberCompactRow: { minHeight: 40, paddingHorizontal: 0, paddingVertical: 0 },
  groupMemberName: { fontSize: huddleType.body, lineHeight: huddleType.labelLine },
  requestInlinePanel: { gap: huddleSpacing.x3, paddingHorizontal: huddleSpacing.x3, paddingBottom: huddleSpacing.x3, backgroundColor: huddleColors.canvas },
  requestInlineFooter: { paddingTop: huddleSpacing.x2 },
  requestDecisionList: { gap: huddleSpacing.x2 },
  requestDecisionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x2 },
  requestDecisionActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  requestDecisionIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  requestDecisionMuted: { opacity: 0.28 },
  requestDecisionApproveActive: { backgroundColor: huddleColors.blue },
  requestDecisionRejectActive: { backgroundColor: huddleColors.validationRed },
  requestErrorText: { width: 56, fontFamily: "Urbanist-600", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.validationRed },
	  memberActionBlock: { gap: 0 },
  memberInlineActions: { marginLeft: huddleSpacing.x6, overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas },
  memberInlineAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.divider },
  memberInlineActionLast: { borderBottomWidth: 0 },
  memberInlineActionText: { flex: 1, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  memberInlineActionTextDestructive: { color: huddleColors.validationRed },
  segmentRow: { flexDirection: "row", gap: huddleSpacing.x2 },
  segmentButton: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.mutedCanvas },
  segmentButtonActive: { borderColor: huddleColors.blue, backgroundColor: huddleColors.blue },
  segmentText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  segmentTextActive: { color: huddleColors.onPrimary },
  createPreviewCard: { overflow: "hidden", borderRadius: huddleRadii.glass, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  createPreviewCardError: { ...huddleFieldStates.error },
  createHeroTopScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 72 },
  createHeroBottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 132 },
  createHeroChips: { flexDirection: "row", flexWrap: "nowrap", gap: huddleSpacing.x1 + 2 },
  createHeroChip: { flexShrink: 1, overflow: "hidden", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.profileHeroTierFill, fontFamily: "Urbanist-500", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, letterSpacing: 0.4, color: huddleColors.onPrimary, textTransform: "uppercase" },
  coverActions: { position: "absolute", right: huddleSpacing.x2, bottom: huddleSpacing.x2, flexDirection: "row", gap: huddleSpacing.x2 },
  coverActionButton: { width: huddleSpacing.x8 - huddleSpacing.x1, height: huddleSpacing.x8 - huddleSpacing.x1, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop, borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, ...huddleShadows.photoControl },
  coverEmptyCameraOnly: { position: "absolute", top: huddleSpacing.x3, left: huddleSpacing.x3, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop, borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, ...huddleShadows.photoControl },
  coverEmptyAction: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2 },
  coverEmptyTitle: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  coverEmptyHint: { fontFamily: "Urbanist-600", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.profileCaptionPlaceholder },
  optionCardGrid: { flexDirection: "row", gap: huddleSpacing.x3 },
  joinOptionList: { gap: huddleSpacing.x2 },
  optionRadio: { width: 10, height: 10, marginTop: 4, borderRadius: huddleRadii.pill, borderWidth: 2, borderColor: huddleColors.blue },
  optionRadioSmall: { width: 8, height: 8, marginTop: 5, borderRadius: huddleRadii.pill, borderWidth: 2, borderColor: huddleColors.blue },
  optionRadioActive: { borderColor: huddleColors.onPrimary, backgroundColor: huddleColors.onPrimary },
  optionCardCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionCardTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  optionCardTitleActive: { color: huddleColors.onPrimary },
  optionCardBody: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  optionCardBodyActive: { color: huddleColors.profileCaptionPlaceholder },
  optionCardHint: { fontFamily: "Urbanist-500", fontSize: huddleType.meta, lineHeight: huddleType.metaLine },
  sectionLabel: { fontFamily: "Urbanist-800", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText, textTransform: "uppercase", letterSpacing: 0.8 },
  memberSelectAvatar: { width: 38, height: 38, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.blue },
  groupInvitePromptBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x4,
  },
  groupInvitePromptCard: {
    width: "100%",
    maxWidth: 390,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x5,
    gap: huddleSpacing.x4,
  },
  modalBold: { fontFamily: "Urbanist-800", color: huddleColors.text },
  modalPrimaryLabel: { ...huddleButtons.label, color: huddleColors.onPrimary },
  modalSecondaryLabel: { ...huddleButtons.label, color: huddleColors.text },
  createDescriptionWrap: { paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3 },
  createDescriptionField: { minHeight: GROUP_DESCRIPTION_FIELD_MIN_HEIGHT, maxHeight: GROUP_DESCRIPTION_FIELD_MAX_HEIGHT, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, backgroundColor: huddleButtons.ghost.backgroundColor, shadowOpacity: huddleButtons.disabled.shadowOpacity, elevation: huddleButtons.disabled.elevation, fontSize: huddleType.label, lineHeight: huddleType.labelLine },
  joinCodeContent: { alignItems: "center", gap: huddleSpacing.x4 },
  joinCodeField: { width: 176, textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h4, letterSpacing: 0 },
  joinCodeDots: { flexDirection: "row", gap: huddleSpacing.x2 },
  joinCodeDot: { width: 8, height: 8, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.divider },
  joinCodeDotActive: { backgroundColor: huddleColors.blue },
  locationSuggestionCard: { marginTop: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  locationSuggestionRow: { minHeight: 48, justifyContent: "center", gap: 2, paddingHorizontal: huddleSpacing.x3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.divider },
  locationSuggestionPrimary: { flexShrink: 1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  locationSuggestionMeta: { flexShrink: 1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  sendCueOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20, alignItems: "center", justifyContent: "center" },
  sendCueOrb: { width: 84, height: 84, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, ...huddleShadows.glassElevation2 },
  sendCueOrbWave: { backgroundColor: huddleColors.blue },
  sendCueOrbStar: { backgroundColor: huddleColors.canvas, borderWidth: 2, borderColor: huddleColors.coral },
  sendCueStarIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  sendCueStarIconFill: { position: "absolute" },
  // Ring + trail dots are absolute, centered via 50% pin + negative margin offset
  sendCueRing: { position: "absolute", top: "50%", left: "50%", width: 110, height: 110, marginTop: -55, marginLeft: -55, borderRadius: huddleRadii.pill, borderWidth: 3 },
  sendCueRingWave: { borderColor: huddleColors.blue },
  sendCueRingStar: { borderColor: huddleColors.coral },
  sendCueTrailDot: { position: "absolute", top: "50%", left: "50%", width: 10, height: 10, marginTop: -5, marginLeft: -5, borderRadius: 5 },
  sendCueTrailDotSm: { width: 7, height: 7, marginTop: -3.5, marginLeft: -3.5, borderRadius: 3.5 },
  sendCueTrailDotStar: { backgroundColor: huddleColors.coral },
  matchFullScreen: { flex: 1, backgroundColor: huddleColors.canvas },
  matchFullImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  // Avatar frame — square, brand-border, soft elevation. Outer holds the
  // shadow (no clip), inner holds the border + image clip. Right frame layers
  // above the left via zIndex so the gold frame visually sits "on top".
  // Match avatar frames — slightly irregular oval "blob" shapes with thick brand borders.
  // NOTE: corner radii are NOT in this static style. They're applied inline from frameSize so they
  // never exceed frameSize/2 (which would clamp to a perfect circle and lose the organic feel).
  matchAvatarFrameWrap: { position: "absolute", ...huddleShadows.glassElevation2 },
  matchAvatarFrameZBack: { zIndex: 2 },
  matchAvatarFrameZFront: { zIndex: 3 },
  matchAvatarFrameInner: { flex: 1, overflow: "hidden", borderWidth: 7, backgroundColor: huddleColors.canvas },
  matchAvatarFrameInnerBlue: { borderColor: huddleColors.blue },
  matchAvatarFrameInnerGold: { borderColor: huddleColors.coral },
  matchSlotImage: { width: "100%", height: "100%" } as ImageStyle,
  matchSlotFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  matchSlotFallbackBlue: { backgroundColor: huddleColors.blue },
  matchSlotFallbackGold: { backgroundColor: huddleColors.coral },
  matchSlotInitials: { fontFamily: "Urbanist-800", fontSize: 28, lineHeight: 32, color: huddleColors.onPrimary },
  matchKeyboardScrim: { ...StyleSheet.absoluteFillObject, zIndex: 1, backgroundColor: huddleColors.backdrop },
  matchKeyboardDockWrap: { position: "absolute", left: 0, right: 0, bottom: huddleSpacing.x3, zIndex: 20 },
  matchDockBelowPill: { paddingHorizontal: huddleSpacing.x4, paddingBottom: huddleSpacing.x4, gap: huddleSpacing.x2 },
  matchDockFocused: { paddingBottom: huddleSpacing.x1, gap: huddleSpacing.x1 },
  matchModalCard: { width: "100%", maxWidth: 390, alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.modal, padding: huddleSpacing.x5, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation2 },
  matchModalAvatar: { width: 92, height: 92, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  matchModalInitials: { fontFamily: "Urbanist-800", fontSize: 30, lineHeight: 36, color: huddleColors.onPrimary },
  matchTitle: { textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  matchBody: { textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  goldButton: { backgroundColor: huddleColors.coral },
  // Fix #7: discover toast made quieter — narrower (centered, max 80% width), smaller text,
  // tighter padding, lower elevation. Used only for errors/duplicate notices now that "Wave sent"
  // and "Star sent" banners are removed (the cue animation IS the confirmation).
  // Phase L: match modal additions — white-on-blue, no blue tints anywhere
  matchQuickReplies: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2, paddingRight: huddleSpacing.x4, paddingBottom: 8 },
  matchQuickReplyChip: {
    // flexShrink: 0 prevents chips from being squeezed; combined with numberOfLines={1} on Text, content never wraps.
    flexShrink: 0,
    overflow: "hidden",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: huddleRadii.pill, borderWidth: 0,
    backgroundColor: "transparent",
    ...huddleShadows.glassElevation1,
  },
  matchQuickReplyText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  matchGlassOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.matchComposerGlass },
  // White 80% glass with blur keeps the composer readable over the artwork.
  matchInputRow: {
    overflow: "hidden",
    minHeight: 52,
    flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth, borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.glassElevation1,
  },
  matchInputField: {
    flex: 1, height: 36, minHeight: 36, paddingVertical: 0, paddingHorizontal: 4,
    fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: huddleType.labelLine,
    includeFontPadding: false, textAlignVertical: "center",
    color: huddleColors.text,
    minWidth: 0,
    flexShrink: 1,
    overflow: "hidden",
  },
  matchInputSend: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderRadius: 18, backgroundColor: huddleColors.blue,
  },
  matchInputSendDisabled: { backgroundColor: huddleColors.blueLight },
  matchInputSendPressed: { transform: [{ scale: 0.97 }] },
  matchKeepExploring: { alignItems: "center", paddingTop: 8, paddingBottom: 2 },
  matchKeepExploringText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, color: huddleColors.subtext, textDecorationLine: "underline" },
});
