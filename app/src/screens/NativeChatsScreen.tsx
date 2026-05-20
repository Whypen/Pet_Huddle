import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Dimensions, Easing, Image, Keyboard, KeyboardAvoidingView as RNKeyboardAvoidingView, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType, type ImageStyle, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getQuotaCapsForTier, normalizeQuotaTier, quotaConfig } from "../lib/quotaConfig_v1";
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
  archiveNativeChatRoomForCurrentUser,
  clearCachedNativeChatMessages,
  fetchNativeExploreGroups,
  fetchNativeMatchedRailSummary,
  fetchNativePendingGroupInvitePrompts,
  fetchNativeGroupPreviewMembers,
  fetchNativeGroupManagementSnapshot,
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
  updateNativeGroupChatMetadata,
  updateNativeGroupJoinRequest,
  uploadNativeChatStorageObject,
  type NativeChatDiscoveryProfile,
  type NativeChatDiscoveryFilters,
  type NativeChatDiscoverStatus,
  type NativeExploreGroup,
  type NativeGroupManagementSnapshot,
  type NativeChatInboxRow,
  type NativeChatInboxScope,
} from "../lib/nativeChat";
import { haptic } from "../lib/nativeHaptics";
import { useShakeAnimation } from "../lib/nativeAnimations";
import { fetchNativeServiceProviderDetail, incrementNativeServiceProviderView, type NativeServiceProvider } from "../lib/nativeService";
import {
  buildNativePetFocusLabel,
  nativePetBreedOptionsForSpeciesLabel,
  nativePetFocusLabels,
  splitNativePetFocusLabel,
} from "../lib/nativePetTaxonomy";
import {
  extractNativeCountryFromPlaceLabel,
  fetchNativeLocationSuggestions,
  getNativeForegroundLocationPermissionDetail,
  openNativeLocationSettings,
  requestNativeForegroundLocationPermissionDetail,
  type NativeLocationPermissionDetail,
  type NativeLocationSuggestion,
} from "../lib/nativeLocation";
import { fetchNativeProfileSummary } from "../lib/nativeProfileSummary";
import { sendNativePublicProfileStarChat, sendNativePublicProfileWave } from "../lib/nativePublicProfile";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import { createNativeProtectedActionError, logNativeProtectedActionFailure, requestNativeStorageCleanupResult } from "../lib/nativeStorageCleanup";
import { resolveNativeAvatarUrl } from "../lib/nativeStorageUrlCache";
import { searchNativeSocialMentionSuggestions, type NativeSocialMentionSuggestion } from "../lib/nativeSocial";
import { resolveNativeViewerScope, type NativeViewerScope } from "../lib/nativeViewerScope";
import {
  unreadTotalWithReadOverlay,
} from "../lib/nativeChatMirror";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import type { NativeProfileUploadAsset } from "../lib/nativeProfilePhotos";
import { supabase, supabaseUrl } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleFieldStates, huddleFormControls, huddleImageDefaults, huddleLayout, huddleMap, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import discoverAgeGateImage from "../../assets/Notifications/discover-age-gate.png";
import emptyChatImage from "../../assets/Notifications/empty-chat-native.png";
import emptyChatImageFallback from "../../assets/Notifications/empty-chat.png";
import matchedImage from "../../assets/Notifications/matched.png";
import serviceImage from "../../assets/Notifications/Service.jpg";
import teamHuddleLogo from "../../assets/huddle-logo-transparent.png";
import profilePlaceholder from "../../huddle Design System/assets/ProfilePlaceholder.png";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeCarerProfileContent } from "../components/service/NativeCarerProfileContent";
import { NativeMediaImageCropper } from "../components/profile/NativeProfilePhotoCropper";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
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
  AppModalButton,
  AppModalCard,
  AppModalField,
  AppModalIconButton,
  AppModalScroll,
} from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import Reanimated, {
  Easing as ReanimEasing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView as RNBlurView } from "@react-native-community/blur";
// MatchModal blob shapes — irregular vertical ovals with a strong left bulge (blue) and a slight
// concave waist (coral). Drawn as SVG paths so the outline + image clip stay pixel-precise.
import Svg, { Defs as SvgDefs, ClipPath as SvgClipPath, Image as SvgImage, Mask as SvgMask, Path as SvgPath, G as SvgG, Rect as SvgRect, Text as SvgText } from "react-native-svg";

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
type MatchModalState = { userId: string; name: string; avatarUrl: string | null; roomId: string | null };
type SelfMatchProfile = { name: string; avatarUrl: string | null };
type StarConfirmTarget = { id: string; displayName: string };
type DiscoverySendCueKind = "wave" | "star";
type NativeViewerPetSignal = { species: string; breed: string };
const DISCOVER_AGE_GATE_COPY = "Discover & Chat features are for 16+ only.\nFor now, join the social conversation and help protect the pack by keeping an eye on the Map.";

const GROUP_EXPLORE_SORT_OPTIONS: Array<{ value: NativeGroupExploreSort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "proximity", label: "Proximity" },
  { value: "latest", label: "Latest" },
  { value: "popularity", label: "Popularity" },
];

const base64ToArrayBuffer = (base64: string) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = cleanBase64.endsWith("==") ? 2 : cleanBase64.endsWith("=") ? 1 : 0;
  const byteLength = Math.max(0, Math.floor((cleanBase64.length * 3) / 4) - padding);
  const bytes = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of cleanBase64) {
    if (char === "=") break;
    const value = chars.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8 && index < byteLength) {
      bits -= 8;
      bytes[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }

  return bytes.buffer;
};

const uploadNativeGroupCover = async (options: { accessToken?: string | null; asset: PendingGroupCover; chatId: string; userId: string }) => {
  if (!options.accessToken) throw new Error("missing_access_token");
  if (!options.chatId) throw new Error("missing_group");
  if (options.asset.size !== null && options.asset.size > 15 * 1024 * 1024) throw new Error("file_too_large");
  const extension = (options.asset.name.includes(".") ? options.asset.name.split(".").pop() : options.asset.mime.split("/").pop())?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const objectName = `groups/${options.chatId}/${options.userId}-${Date.now()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(options.asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToArrayBuffer(base64);
  try {
    await uploadNativeChatStorageObject({
      accessToken: options.accessToken,
      bucket: "avatars",
      path: objectName,
      body,
      contentType: options.asset.mime || "image/jpeg",
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
  }, options.accessToken);
  if (registerError) {
    const cleanupResult = await requestNativeStorageCleanupResult("avatars", objectName, "register_group_cover_media_failed", options.accessToken);
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
  accessToken?: string | null;
  userId: string | null;
  search?: string;
  sessionKey?: string | null;
  onBottomSheetOpenChange?: (open: boolean) => void;
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
const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const estimatePetFocusChipUnits = (value: string) => value.length * 8 + 28;
const shouldCollapsePetFocusChips = (values: string[]) => values.reduce((total, value) => total + estimatePetFocusChipUnits(value), 0) + Math.max(0, values.length - 1) * 6 > 315;
const INBOX_FIRST_PAGE = 10;
const INBOX_NEXT_PAGE = 20;
const DISCOVERY_VISIBLE_COUNT = 20;
const DISCOVERY_MAX_RADIUS_KM = 150;
const DISCOVERY_HEIGHT_MAX_CM = 250;
const SWIPE_COMMIT_OFFSET = 110;
const SWIPE_COMMIT_OFFSET_LAST = 130;
const SWIPE_COMMIT_VELOCITY = 0.8;
const SWIPE_VELOCITY_MIN_OFFSET = 80;
const SWIPE_VERTICAL_BOUND = 80;
const DISCOVERY_FLING_X = Math.max(Dimensions.get("window").width, 430) * 1.05;
const FILTER_SHEET_SCROLL_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.58);
const discoveryPassedKey = (userId: string) => `native-chats:discovery-passed:${userId}`;
const discoveryPassedSessionKey = (userId: string) => `native-chats:discovery-passed-session:${userId}`;
const discoveryHandledKey = (userId: string) => `native-chats:discovery-handled:${userId}`;
const discoveryFiltersKey = (userId: string) => `native-chats:discovery-filters:v2:${userId}`;
const discoverySeenTodayKey = (userId: string, day: string) => `native-chats:discovery-seen:${day}:${userId}`;
const chatsDiscoverProfilesCacheKey = (userId: string, filterKey: string, tier: string, country: string | null) => `native-chats:discover-cache:v2:${userId}:${tier}:${country || "global"}:${filterKey}`;
const chatsExploreGroupsCacheKey = (userId: string) => `native-chats:groups-explore-cache:v1:${userId}`;
const chatsInboxRowsCacheKey = (userId: string, sessionKey: string | null | undefined, mainTab: Exclude<NativeChatsTab, "discover">) => `native-chats:inbox-cache:v3:${userId}:${sessionKey || `${userId}:0`}:${mainTab}`;
const chatsServiceTabProbeCacheKey = (userId: string, sessionKey: string | null | undefined) => `native-chats:service-tab-probe:v2:${userId}:${sessionKey || `${userId}:0`}`;
const chatsGroupDetailsCacheKey = (userId: string, chatId: string, isExplore: boolean) => `native-chats:groupSnapshot:v2:${userId}:${isExplore ? "explore" : "manage"}:${chatId}`;
const CHATS_DISCOVER_CACHE_LIMIT = 8;
const CHATS_GROUP_EXPLORE_CACHE_LIMIT = 5;
const CHATS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DISCOVERY_ROLLBACK_REQUEUE_OFFSET = 4;

const readChatsCache = async <T,>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
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
  { title: "Huddle+", tier: "plus", rows: FILTER_ROWS.filter((row) => row.tier === "plus") },
  { title: "Gold", tier: "gold", rows: FILTER_ROWS.filter((row) => row.tier === "gold") },
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

const scopeForTab = (tab: Exclude<NativeChatsTab, "discover">): NativeChatInboxScope => {
  if (tab === "groups") return "groups";
  if (tab === "service") return "all";
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

const displayName = (row: NativeChatInboxRow) => {
  if (row.roomType === "group") return row.chatName || "Group chat";
  if (row.roomType === "service") return row.peerName || row.chatName || "Care chat";
  return row.peerName || row.chatName || "Conversation";
};

const isTeamHuddleRow = (row: NativeChatInboxRow) => (
  row.peerUserId === TEAM_HUDDLE_USER_ID || isNativeTeamHuddleIdentity(displayName(row), row.peerSocialId)
);

const isCareInboxRow = (row: NativeChatInboxRow) => row.roomType === "service" || isTeamHuddleRow(row);

const appendReturnTo = (path: string, returnTo: string) => `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;

const carePreviewForKind = (kind: string, row?: NativeChatInboxRow, userId?: string | null) => {
  const normalized = kind.trim();
  const actorName = row?.lastMessageSenderId === userId ? "You" : displayName(row || {} as NativeChatInboxRow);
  const startedTime = row?.lastMessageAt ? new Date(row.lastMessageAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  if (normalized === "service_request_sent") {
    return row?.serviceRequesterId === userId
      ? "Your booking request has been sent."
      : "You have received a booking request.";
  }
  if (normalized === "service_request_updated" || normalized === "service_quote_sent") return `Care Scope has been updated by ${actorName}.`;
  if (normalized === "service_request_withdrawn") return "Request withdrawn";
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
      return String(share.chatHeadline || share.title || "Shared from Huddle").trim();
    }
    const carePreview = carePreviewForKind(kind, row, userId);
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
}: {
  fallback: ReactNode;
  resizeMode?: "cover" | "contain";
  style: StyleProp<ImageStyle>;
  uri: string | null | undefined;
}) {
  const resolved = useMemo(() => resolveNativeAvatarUrl(uri) || (typeof uri === "string" && /^https?:\/\//i.test(uri) ? uri : null), [uri]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolved]);
  if (!resolved || failed) return <>{fallback}</>;
  return (
    <ExpoImage
      accessibilityIgnoresInvertColors
      cachePolicy="memory-disk"
      contentFit={resizeMode}
      onError={() => setFailed(true)}
      source={{ uri: resolved }}
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
}: {
  avatarUrl: string | null;
  isVerified: boolean;
  isTeamHuddle?: boolean;
  name: string;
  size: "md" | "lg";
}) {
  const frameStyle = size === "lg" ? styles.userAvatarLg : styles.userAvatarMd;
  const imageStyle = size === "lg" ? styles.userAvatarImageLg : styles.userAvatarImageMd;
  const verifiedBadgeStyle = size === "lg" ? styles.userAvatarVerifiedBadgeLg : styles.userAvatarVerifiedBadgeMd;
  return (
    <View style={[frameStyle, isVerified ? styles.userAvatarVerified : styles.userAvatarUnverified]}>
      <ResilientAvatarImage
        fallback={<Image accessibilityLabel={name || "User"} resizeMode={isTeamHuddle ? "contain" : "cover"} source={isTeamHuddle ? teamHuddleLogo : profilePlaceholder} style={imageStyle} />}
        resizeMode={isTeamHuddle ? "contain" : "cover"}
        style={imageStyle}
        uri={isTeamHuddle ? null : avatarUrl}
      />
      {isVerified ? <View style={verifiedBadgeStyle}><NativeVerifiedBadge compact variant="avatar" /></View> : null}
    </View>
  );
}

function VerifiedMemberAvatar({ avatarUrl, isVerified, name }: { avatarUrl: string | null; isVerified: boolean; name: string }) {
  return (
    <View style={[styles.memberAvatarFrame, isVerified ? styles.memberAvatarFrameVerified : null]}>
      <ResilientAvatarImage fallback={<Text style={styles.memberAvatarInitial}>{initials(name)}</Text>} style={styles.memberAvatarImage} uri={avatarUrl} />
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
  if (tier === "gold") return "Gold";
  if (tier === "plus") return "Huddle+";
  return null;
};

const DISCOVERY_ISLAND_HEIGHT = 72;
// New layout: deepest queued card peeks 20 px below top card, then 8 px tight gap, then the action island.
const DISCOVERY_QUEUED_PEEK_DEPTH = 20;
const DISCOVERY_DECK_TO_ISLAND_GAP = 8;
const DISCOVERY_STACK_AFTER_CARD = DISCOVERY_QUEUED_PEEK_DEPTH + DISCOVERY_DECK_TO_ISLAND_GAP + DISCOVERY_ISLAND_HEIGHT;
const DISCOVERY_NAV_MIN_GAP = 24;
const DISCOVERY_CHROME_RESERVE = 224;

const DISCOVERY_DECK_REFERENCE_WIDTH = 360;
const DISCOVERY_QUEUED_SIDE_GAP_1 = (DISCOVERY_DECK_REFERENCE_WIDTH * (1 - 0.86)) / 2;
const DISCOVERY_QUEUED_SIDE_GAP_2 = (DISCOVERY_DECK_REFERENCE_WIDTH * (1 - 0.78)) / 2;
const DISCOVERY_QUEUED_SIDE_GAP_3 = (DISCOVERY_DECK_REFERENCE_WIDTH * (1 - 0.70)) / 2;
const discoveryQueuedSideGap = (index: number) => {
  if (index === 1) return DISCOVERY_QUEUED_SIDE_GAP_1;
  if (index === 2) return DISCOVERY_QUEUED_SIDE_GAP_2;
  return DISCOVERY_QUEUED_SIDE_GAP_3;
};
const discoveryQueuedScaleX = (index: number, cardWidth: number) => Math.max(0.7, (cardWidth - discoveryQueuedSideGap(index) * 2) / cardWidth);
const discoveryQueuedTranslateY = (index: number) => index === 1 ? -2 : index === 2 ? 4 : 10;
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

const readSeenMatchSet = async (viewerId: string, accessToken?: string | null) => {
  const [localRaw, serverResult] = await Promise.all([
    AsyncStorage.getItem(seenMatchesKey(viewerId)),
    nativeExactTokenRpc<Array<{ matched_user_id?: string | null }>>("get_native_seen_match_ids", {}, accessToken),
  ]);
  const seen = new Set<string>();
  try {
    const parsed = JSON.parse(String(localRaw || "[]")) as unknown;
    if (Array.isArray(parsed)) parsed.map(String).filter(Boolean).forEach((id) => seen.add(id));
  } catch {
    // Ignore corrupt local cache; server rows below keep the modal from replaying.
  }
  const serverRows = serverResult.error ? [] : (((serverResult.data || []) as unknown) as Array<{ matched_user_id?: string | null }>);
  serverRows.map((row) => String(row.matched_user_id || "").trim()).filter(Boolean).forEach((id) => seen.add(id));
  return seen;
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

const COUNTRY_ALIASES: Record<string, string> = {
  hk: "hong kong",
  "hong kong sar": "hong kong",
  "hong kong s.a.r.": "hong kong",
  us: "united states",
  usa: "united states",
  "u.s.a.": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u.k.": "united kingdom",
};

const normalizeCountryKey = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return COUNTRY_ALIASES[normalized] || normalized;
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
function DiscoverPillIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <SvgPath
        fill={color}
        d="M11.91 14h7.843a2.25 2.25 0 0 1 2.25 2.25v.905A3.75 3.75 0 0 1 20.696 20C19.13 21.345 16.89 22.002 14 22.002h-.179a1.75 1.75 0 0 0-.221-1.897l-.111-.121l-2.23-2.224a5.48 5.48 0 0 0 .65-3.76M6.5 10.5a4.5 4.5 0 0 1 3.46 7.377l2.823 2.814a.75.75 0 0 1-.975 1.134l-.085-.072l-2.903-2.896A4.5 4.5 0 1 1 6.5 10.5m0 1.5a3 3 0 1 0 0 6a3 3 0 0 0 0-6M14 2.005a5 5 0 1 1 0 10a5 5 0 0 1 0-10"
      />
    </Svg>
  );
}

// Community: Fluent "people-community-20-filled" — symmetric three-person filled icon,
// same Fluent filled family as the Discover icon. Single clean path, no mask tricks.
// Source: microsoft/fluentui-system-icons
function CommunityPillIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <SvgPath
        fill={color}
        d="M10 2C8.34315 2 7 3.34315 7 5C7 6.65685 8.34315 8 10 8C11.6569 8 13 6.65685 13 5C13 3.34315 11.6569 2 10 2ZM5.0528 9.99585C5.01946 10.1587 5.00195 10.3273 5.00195 10.5V14C5.00195 15.5286 5.68794 16.897 6.76887 17.8142C6.7124 17.832 6.65527 17.8487 6.59751 17.8642C4.46365 18.4359 2.2703 17.1696 1.69853 15.0357L1.05148 12.6209C0.837071 11.8207 1.31194 10.9982 2.11214 10.7838L5.0528 9.99585ZM13.235 17.8142C14.316 16.897 15.002 15.5286 15.002 14V10.5C15.002 10.3273 14.9844 10.1587 14.9511 9.99585L17.8918 10.7838C18.692 10.9982 19.1668 11.8207 18.9524 12.6209L18.3054 15.0357C17.7336 17.1696 15.5403 18.4359 13.4064 17.8642C13.3486 17.8487 13.2915 17.832 13.235 17.8142ZM16.5 4C15.1193 4 14 5.11929 14 6.5C14 7.88071 15.1193 9 16.5 9C17.8807 9 19 7.88071 19 6.5C19 5.11929 17.8807 4 16.5 4ZM3.5 4C2.11929 4 1 5.11929 1 6.5C1 7.88071 2.11929 9 3.5 9C4.88071 9 6 7.88071 6 6.5C6 5.11929 4.88071 4 3.5 4ZM7.5 9C6.67157 9 6 9.67157 6 10.5V14C6 16.2091 7.79086 18 10 18C12.2091 18 14 16.2091 14 14V10.5C14 9.67157 13.3284 9 12.5 9H7.5Z"
      />
    </Svg>
  );
}

// Glass-tinted active segment for the Discover|Community|Chats pill rail.
// Always mounted inside every pill Pressable so the BlurView never cold-starts.
// visible=false → opacity:0 (invisible but still composited), preventing the
// "blur pops in" flicker on the first activation of each pill.
function TopSegmentGlassLayer({ visible }: { visible: boolean }) {
  return (
    <View pointerEvents="none" style={[topSegmentGlassStyles.clip, !visible && topSegmentGlassStyles.hidden]}>
      <RNBlurView blurAmount={16} blurType="light" style={StyleSheet.absoluteFill} />
      <View style={topSegmentGlassStyles.tint} />
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.32)", "rgba(255, 255, 255, 0)"]}
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
  // Translucent blue gives the glass-tinted body; full huddleColors.blue would be opaque.
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(33, 69, 207, 0.82)" },
  // Top-edge highlight ≈ glass dome curvature.
  highlight: { position: "absolute", left: 0, right: 0, top: 0, height: "55%" },
  // Inner hairline border ≈ rim of polished glass.
  border: { ...StyleSheet.absoluteFillObject, borderRadius: huddleRadii.pill, borderWidth: 0.5, borderColor: "rgba(255, 255, 255, 0.22)" },
});

// Phase K: neuglass toast — floats over discover, auto-dismisses, prettier than Bumble's banner
const DISCOVER_TOAST_INTENTS: Record<string, { color: string; icon: string }> = {
  wave: { color: huddleColors.blue, icon: "hand-wave" },
  star: { color: huddleColors.premiumGold, icon: "star-outline" },
  error: { color: "#E94C5C", icon: "alert-circle-outline" },
};
function DiscoverToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const translateYSV = useSharedValue(-64);
  const opacitySV = useSharedValue(0);
  useEffect(() => {
    translateYSV.value = withSpring(0, { damping: 18, stiffness: 260, mass: 0.6 });
    opacitySV.value = withTiming(1, { duration: 200 });
    const t = setTimeout(() => {
      translateYSV.value = withTiming(-64, { duration: 260 });
      opacitySV.value = withTiming(0, { duration: 220 }, () => runOnJS(onDismiss)());
    }, 3200);
    return () => clearTimeout(t);
  }, [message, onDismiss, opacitySV, translateYSV]);
  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateYSV.value }],
    opacity: opacitySV.value,
  }));
  const lowerMsg = message.toLowerCase();
  const intentKey = Object.keys(DISCOVER_TOAST_INTENTS).find((k) => lowerMsg.includes(k)) ?? "wave";
  const intent = DISCOVER_TOAST_INTENTS[intentKey] ?? DISCOVER_TOAST_INTENTS.wave;
  return (
    <Reanimated.View pointerEvents="none" style={[styles.discoverToastWrap, toastStyle]}>
      <RNBlurView blurAmount={20} blurType="light" style={StyleSheet.absoluteFill} />
      <View style={[styles.discoverToastIntentBar, { backgroundColor: intent.color }]} />
      <MaterialCommunityIcons color={intent.color} name={intent.icon as never} size={18} style={styles.discoverToastIcon} />
      <Text numberOfLines={2} style={styles.discoverToastText}>{message}</Text>
    </Reanimated.View>
  );
}

function QueuedCardPrivacyLayer({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <RNBlurView blurAmount={22} blurType="light" style={StyleSheet.absoluteFill} />
      <View style={styles.discoveryQueuedPrivacyWash} />
    </View>
  );
}

function DiscoveryProfileCard({
  busy,
  chips,
  index,
  isDeepestQueued,
  isLast,
  liftKind,
  swipeXSV,
  onSwipePhaseChange,
  profile,
  onPass,
  onProfileTap,
  onStar,
  onWave,
}: {
  busy: boolean;
  chips: string[];
  index: number;
  isDeepestQueued: boolean;
  isLast: boolean;
  liftKind: DiscoverySendCueKind | null; // D1: when set, card runs sync lift+halo+fade overlay
  swipeXSV: SharedValue<number>;
  onSwipePhaseChange: (active: boolean) => void;
  profile: NativeChatDiscoveryProfile;
  onPass: (profile: NativeChatDiscoveryProfile) => void;
  onProfileTap: (profile: NativeChatDiscoveryProfile) => void;
  onStar: (profile: NativeChatDiscoveryProfile) => void;
  onWave: (profile: NativeChatDiscoveryProfile) => Promise<boolean>;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, Math.min(viewportWidth - huddleSpacing.x6, 360));
  const cardHeight = cardWidth * 1.25;
  // Card-unit reservation. Tight against the deepest queued card peek (no decorative bars now).
  // layerStackBottom = top card bottom + Q3 peek (20). islandTop = layerStackBottom + 8 px tight gap.
  const layerStackBottom = cardHeight + DISCOVERY_QUEUED_PEEK_DEPTH;
  const islandTop = layerStackBottom + DISCOVERY_DECK_TO_ISLAND_GAP;
  const gluedStackHeight = islandTop + DISCOVERY_ISLAND_HEIGHT;
  // Compute compactActions ONCE per card lifetime (mount). Locking it prevents the action layout
  // from switching mid-session while the user is reading the card.
  const compactActionsInitial = viewportHeight < cardHeight + DISCOVERY_STACK_AFTER_CARD + DISCOVERY_CHROME_RESERVE + DISCOVERY_NAV_MIN_GAP;
  const compactActionsRef = useRef(compactActionsInitial);
  const compactActions = compactActionsRef.current;
  const roleLabel = profile.socialRole ? petLine(profile) : "";
  const tierLabel = discoveryTierLabel(profile.tier);
  const commitOffset = isLast ? SWIPE_COMMIT_OFFSET_LAST : SWIPE_COMMIT_OFFSET;
  const springCfg = isLast ? SPRING_CFG_LAST : SPRING_CFG;

  // UI-thread shared values (Reanimated v4)
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const committedDirSV = useSharedValue<-1 | 0 | 1>(0); // -1=left, 0=none, 1=right
  const hasCrossed = useSharedValue(false);
  const touchOriginYSV = useSharedValue(cardHeight * 0.5);
  const gestureStartMsSV = useSharedValue(0);

  // Wave button — idle micro-rotation. Sine-eased, fewer segments, longer arc + rest. Reads as a
  // natural little wave every ~5s instead of the previous 4-segment robotic flip.
  // Only the top card (index === 0) animates so we don't burn CPU on stacked queued cards.
  const waveIconRotSV = useSharedValue(0);
  useEffect(() => {
    if (index !== 0) return;
    const easeSin = ReanimEasing.inOut(ReanimEasing.sin);
    waveIconRotSV.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 320, easing: easeSin }),
        withTiming(7, { duration: 360, easing: easeSin }),
        withTiming(-4, { duration: 280, easing: easeSin }),
        withTiming(0, { duration: 220, easing: easeSin }),
        withDelay(3800, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [index, waveIconRotSV]);
  const waveIconAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${waveIconRotSV.value}deg` }] }));

  const clearSwipeState = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    committedDirSV.value = 0;
    swipeXSV.value = 0;
    onSwipePhaseChange(false);
  }, [committedDirSV, onSwipePhaseChange, swipeXSV, translateX, translateY]);

  const doPass = useCallback((p: NativeChatDiscoveryProfile) => {
    clearSwipeState();
    onPass(p);
  }, [clearSwipeState, onPass]);

  const doWave = useCallback((p: NativeChatDiscoveryProfile) => {
    clearSwipeState();
    void onWave(p).then((committed) => {
      if (!committed) {
        haptic.error();
        committedDirSV.value = 0;
        swipeXSV.value = 0;
        onSwipePhaseChange(false);
        translateX.value = withSpring(0, springCfg);
        translateY.value = withSpring(0, springCfg);
      }
    });
  }, [clearSwipeState, committedDirSV, onSwipePhaseChange, springCfg, swipeXSV, onWave, translateX, translateY]);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-40, 40])
      .enabled(index === 0)
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
          swipeXSV.value = 0;
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
        const pivotOffsetY = touchOriginYSV.value - cardHeight * 0.5;
        const flingY = pivotOffsetY * 0.35;
        if (rightCommit) {
          committedDirSV.value = 1;
          runOnJS(haptic.primaryConfirm)();
          const dur = Math.max(180, Math.min(380, 380 - Math.abs(e.velocityX) * 0.15));
          // W1: 200ms held climax before fly-off so the stamp is visible.
          // W2: release easing (out cubic) instead of escape easing (in cubic).
          translateX.value = withDelay(200, withTiming(DISCOVERY_FLING_X, { duration: dur, easing: ReanimEasing.out(ReanimEasing.cubic) }, () => {
            runOnJS(doWave)(profile);
          }));
          translateY.value = withDelay(200, withTiming(flingY, { duration: dur }));
          return;
        }
        if (leftCommit) {
          committedDirSV.value = -1;
          runOnJS(haptic.toggleControl)();
          const dur = Math.max(180, Math.min(380, 380 - Math.abs(e.velocityX) * 0.15));
          translateX.value = withTiming(-DISCOVERY_FLING_X, { duration: dur, easing: ReanimEasing.in(ReanimEasing.cubic) }, () => {
            runOnJS(doPass)(profile);
          });
          translateY.value = withTiming(flingY, { duration: dur });
          return;
        }
        // Spring return with overshoot personality
        // D4: gate haptic on |translationX| > 20 so micro-drags don't fire it
        if (Math.abs(e.translationX) > 20) runOnJS(haptic.swipeReturn)();
        swipeXSV.value = 0;
        translateX.value = withSpring(0, springCfg, () => {
          runOnJS(onSwipePhaseChange)(false);
        });
        translateY.value = withSpring(0, springCfg);
      }),
    [busy, cardHeight, commitOffset, committedDirSV, doPass, doWave, gestureStartMsSV, hasCrossed, index, onSwipePhaseChange, profile, springCfg, swipeXSV, touchOriginYSV, translateX, translateY]
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
    const pivotY = touchOriginYSV.value - cardHeight * 0.5;
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
    opacity: committedDirSV.value === 1
      ? 0.2
      : interpolate(translateX.value, [0, 63, 180], [0, 0.1, 0.2], Extrapolation.CLAMP),
  }));

  const passTintStyle = useAnimatedStyle(() => ({
    opacity: committedDirSV.value === -1
      ? 0.24
      : interpolate(translateX.value, [-180, -99, -45, 0], [0.24, 0.16, 0.08, 0], Extrapolation.CLAMP),
  }));

  const passStampStyle = useAnimatedStyle(() => {
    const cd = committedDirSV.value;
    const tx = translateX.value;
    const stampRot = interpolate(tx, [-180, 0, 180], [8, 0, -8], Extrapolation.CLAMP);
    // Steep ramp: invisible until 55px, then rapid reveal
    return {
      opacity: cd === -1
        ? 1
        : interpolate(tx, [-160, -110, -55, 0], [1, 0.75, 0.04, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: cd === -1 ? 0 : interpolate(tx, [-160, -36, 0], [0, 6, 18], Extrapolation.CLAMP) },
        { translateY: cd === -1 ? 0 : interpolate(tx, [-160, -36, 0], [0, 4, 12], Extrapolation.CLAMP) },
        { scale: cd === -1 ? 1 : interpolate(tx, [-160, -55, 0], [1, 0.9, 0.7], Extrapolation.CLAMP) },
        { rotate: `${stampRot}deg` },
      ],
    };
  });

  const waveStampStyle = useAnimatedStyle(() => {
    const cd = committedDirSV.value;
    const tx = translateX.value;
    const stampRot = interpolate(tx, [-180, 0, 180], [8, 0, -8], Extrapolation.CLAMP);
    // Steep ramp: invisible until 55px, then rapid reveal
    return {
      opacity: cd === 1
        ? 1
        : interpolate(tx, [0, 55, 110, 160], [0, 0.04, 0.75, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: cd === 1 ? 0 : interpolate(tx, [0, 36, 160], [-18, -6, 0], Extrapolation.CLAMP) },
        { translateY: cd === 1 ? 0 : interpolate(tx, [0, 36, 160], [12, 4, 0], Extrapolation.CLAMP) },
        { scale: cd === 1 ? 1.05 : interpolate(tx, [0, 55, 110, 160], [0.54, 0.7, 0.94, 1.05], Extrapolation.CLAMP) },
        { rotate: `${stampRot}deg` },
      ],
    };
  });

  // Phase F: island/traffic button container fades during drag
  const buttonFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(swipeXSV.value), [0, 60, 120], [1, 0.4, 0], Extrapolation.CLAMP),
  }));

  // Queued real-card geometry uses fixed pixel side gaps derived from the decorative deck spec:
  // scaleX 0.86 / 0.78 / 0.70 at 360px reference width => 25.2 / 39.6 / 54px side gaps.
  //   scaleY = 1                              → card stays full-height
  //   translateY -2 / 4 / 10                  → each peek band is exactly 6 px tall (evenly spaced)
  // On swipe, each card scales-X up and translates UP toward the slot directly above.
  //   Q1 (closest):  25.2 px side gap → full width, TY -2 → -8
  //   Q2 (middle):   39.6 px side gap → 25.2 px side gap, TY 4 → -2
  //   Q3 (deepest):  54 px side gap → 39.6 px side gap, TY 10 → 4
  const queuedAnimatedStyle = useAnimatedStyle(() => {
    if (index === 0) {
      return { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] };
    }
    const progress = Math.min(1, Math.abs(swipeXSV.value) / 150);
    let baseSx: number; let peakSx: number; let baseTY: number; let peakTY: number;
    const scale1 = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_1 * 2) / cardWidth);
    const scale2 = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_2 * 2) / cardWidth);
    const scale3 = Math.max(0.7, (cardWidth - DISCOVERY_QUEUED_SIDE_GAP_3 * 2) / cardWidth);
    if (index === 1) { baseSx = scale1; peakSx = 1.0;  baseTY = -2; peakTY = -8; }
    else if (index === 2) { baseSx = scale2; peakSx = scale1; baseTY =  4; peakTY = -2; }
    else { baseSx = scale3; peakSx = scale2; baseTY = 10; peakTY =  4; }
    const scaleX = baseSx + progress * (peakSx - baseSx);
    const tY = baseTY + progress * (peakTY - baseTY);
    return { transform: [{ translateY: tY }, { scaleX }, { scaleY: 1 }] };
  });

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
      if ((inLeft || inRight) && tapY < cardHeight * 0.70) return;
    }
    onProfileTap(profile);
  }, [busy, cardHeight, cardWidth, index, mediaSources.length, onProfileTap, profile]);

  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .maxDuration(400)
      .maxDistance(10)
      .enabled(index === 0)
      .onEnd((e) => { runOnJS(handleProfileTapGesture)(e.x, e.y); }),
    [handleProfileTapGesture, index]
  );

  const composedGesture = useMemo(() =>
    Gesture.Simultaneous(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  const renderDiscoveryActions = (variant: "island" | "traffic") => {
    const traffic = variant === "traffic";
    return (
      <View style={traffic ? styles.discoveryTrafficActions : styles.discoveryActionIsland}>
        <Pressable
          accessibilityLabel={`Star ${profile.displayName}`}
          disabled={busy}
          onPress={() => onStar(profile)}
          onPressIn={() => {
            pressScaleSV.value = withTiming(0.96, { duration: 80 });
            runOnJS(haptic.selectTab)();
          }}
          onPressOut={() => {
            pressScaleSV.value = withSpring(1, { damping: 14, stiffness: 260 });
          }}
          style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, styles.discoveryTrafficStar] : styles.discoveryActionStar, styles.discoveryStarButton, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}
        >
          <FontAwesome5 color={huddleColors.onPrimary} name="star" size={traffic ? 22 : 20} />
        </Pressable>
        <Pressable accessibilityLabel={`Wave at ${profile.displayName}`} disabled={busy} onPress={() => void onWave(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, styles.discoveryTrafficWave] : styles.discoveryActionPrimary, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
          {/* Filled hand-wave + idle micro-rotation. Animated only on top card (index === 0). */}
          <Reanimated.View style={waveIconAnimatedStyle}>
            <MaterialCommunityIcons color={huddleColors.onPrimary} name="hand-wave" size={traffic ? 28 : 32} style={styles.discoveryWaveIcon} />
          </Reanimated.View>
        </Pressable>
        <Pressable accessibilityLabel={`Pass ${profile.displayName}`} disabled={busy} onPress={() => onPass(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, styles.discoveryTrafficPass] : styles.discoveryActionSecondary, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
          <Feather color={huddleColors.subtext} name="x" size={traffic ? 26 : 22} />
        </Pressable>
      </View>
    );
  };

  return (
    <Reanimated.View style={[
      styles.discoveryCardUnit,
      index > 0 && styles.discoveryCardQueued,
      {
        width: cardWidth,
        height: compactActions || index > 0 ? layerStackBottom : gluedStackHeight,
        zIndex: index === 0 ? 20 : 16 - index,
        elevation: index === 0 ? 20 : 16 - index,
      },
      queuedAnimatedStyle,
    ]}>
      {isDeepestQueued ? <View pointerEvents="none" style={[styles.discoveryQueuedBottomShadow, { top: cardHeight + DISCOVERY_QUEUED_PEEK_DEPTH - 4, width: cardWidth * queuedScaleX }]} /> : null}
      <GestureDetector gesture={composedGesture}>
        <Reanimated.View style={[styles.discoveryProfileCard, { height: cardHeight }, cardAnimatedStyle]}>
          <View style={styles.discoveryPhotoWrap}>
            <Pressable accessibilityLabel={`Open ${profile.displayName} profile`} accessibilityRole="button" style={styles.discoveryProfileTap}>
              <ResilientAvatarImage fallback={<View style={styles.discoveryPhotoFallback}><Text style={styles.discoveryPhotoFallbackText}>{initials(profile.displayName)}</Text></View>} style={styles.discoveryPhoto} uri={activeImage} />
            </Pressable>
            {index === 0 && mediaSources.length > 1 ? (
              <>
                <Pressable accessibilityLabel="Previous photo" onPress={(event) => { event.stopPropagation(); stepAlbum(-1); }} style={styles.discoveryAlbumLeftZone} />
                <Pressable accessibilityLabel="Next photo" onPress={(event) => { event.stopPropagation(); stepAlbum(1); }} style={styles.discoveryAlbumRightZone} />
                <View pointerEvents="none" style={styles.discoveryAlbumDots}>
                  {mediaSources.map((source, dotIndex) => <View key={`${source}:${dotIndex}`} style={[styles.discoveryAlbumDot, dotIndex === activeImageIndex && styles.discoveryAlbumDotActive]} />)}
                </View>
              </>
            ) : null}
            <View style={styles.discoveryPhotoScrim} />
            <View style={styles.discoveryTopBadgeRow}>
              <View style={styles.discoveryTopLeftBadges}>
                {profile.hasCar ? <View style={styles.discoveryCarBadge}><FontAwesome5 color={huddleColors.onPrimary} name="car-side" size={13} /></View> : null}
                {chips.map((chip) => (
                  <View key={chip} style={styles.discoveryChip}>
                    <Text style={styles.discoveryChipText}>{chip}</Text>
                  </View>
                ))}
              </View>
              {/* Actions stay mounted on the top card; buttonFadeStyle handles real swipe movement. */}
              {compactActions && index === 0 ? (
                <Reanimated.View style={buttonFadeStyle}>{renderDiscoveryActions("traffic")}</Reanimated.View>
              ) : null}
            </View>
            <Reanimated.View pointerEvents="none" style={[styles.discoverySwipeTint, styles.discoveryWaveTint, waveTintStyle]} />
            <Reanimated.View pointerEvents="none" style={[styles.discoverySwipeTint, styles.discoveryPassTint, passTintStyle]} />
            {/* D1: gold lift halo overlay — clipped by parent card overflow:hidden so cannot bleed onto neighbors. */}
            {liftKind === "star" ? <Reanimated.View pointerEvents="none" style={[styles.discoveryLiftHalo, liftHaloStyle]} /> : null}
            <Reanimated.View style={[styles.swipeStamp, styles.passStamp, passStampStyle]}><Text style={styles.passStampText}>SKIP</Text><Feather color="#E94C5C" name="x" size={18} /></Reanimated.View>
            <Reanimated.View style={[styles.swipeStamp, styles.waveStamp, waveStampStyle]}><MaterialCommunityIcons color={huddleColors.blue} name="hand-wave" size={18} style={styles.discoveryWaveStampIcon} /><Text style={styles.waveStampText}>WAVE</Text></Reanimated.View>
            <LinearGradient
              colors={[huddleColors.profileHeroScrimStart, huddleColors.profileHeroScrimMid, huddleColors.profileHeroScrimEnd]}
              end={{ x: 0, y: 0 }}
              pointerEvents="none"
              start={{ x: 0, y: 1 }}
              style={styles.discoveryHeroScrim}
            />
            {/* Fix #4B: explicit info-strip scrim at the very bottom of the card so chips sit on a clear translucent band, not on the subject's body. */}
            <LinearGradient
              colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.42)"]}
              end={{ x: 0, y: 1 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={styles.discoveryChipInfoStrip}
            />
            <View style={styles.discoveryHeroCopy}>
              <View style={styles.discoveryHeroNameRow}>
                <Text adjustsFontSizeToFit minimumFontScale={0.58} numberOfLines={1} style={styles.discoveryHeroName}>
                  {(profile.displayName || "User").toUpperCase()}
                </Text>
                {profile.isVerified ? <NativeVerifiedBadge compact scale={1.25} style={styles.discoveryVerifiedTighten} /> : null}
              </View>
              <View style={styles.discoveryHeroPills}>
                {roleLabel ? (
                  <View style={styles.discoveryHeroRolePill}>
                    <View style={styles.discoveryHeroRoleDot} />
                    <Text numberOfLines={1} style={styles.discoveryHeroRoleText}>{roleLabel}</Text>
                  </View>
                ) : null}
                {tierLabel ? (
                  <View style={[styles.discoveryHeroTierPill, tierLabel === "Gold" ? styles.discoveryHeroGoldPill : styles.discoveryHeroPlusPill]}>
                    <Feather color={tierLabel === "Gold" ? huddleColors.premiumGold : huddleColors.onPrimary} name="star" size={14} />
                    <Text numberOfLines={1} style={[styles.discoveryHeroTierText, tierLabel === "Gold" ? styles.discoveryHeroGoldText : styles.discoveryHeroPlusText]}>{tierLabel}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {/* Queued cards keep their deck color at the bottom, while the privacy layer above masks profile details. */}
            {index > 0 ? (
              <LinearGradient
                colors={["rgba(33,71,201,0)", queuedBottomScrimColor]}
                start={{ x: 0, y: 0.55 }}
                end={{ x: 0, y: 1 }}
                style={[StyleSheet.absoluteFill, { zIndex: 16 }]}
                pointerEvents="none"
              />
            ) : null}
            {index > 0 ? <QueuedCardPrivacyLayer style={styles.discoveryQueuedPrivacyLayer} /> : null}
          </View>
        </Reanimated.View>
      </GestureDetector>
      {!compactActions && index === 0 ? (
        <Reanimated.View style={[styles.discoveryActionIslandSlot, { top: islandTop }, buttonFadeStyle]}>{renderDiscoveryActions("island")}</Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
}

// Card-shaped shimmer shell shown before the first profile lands.
// `layer` mirrors the active queued-card geometry, including the bottom-card shadow.
function DiscoveryCardShell({ layer = 0 }: { layer?: 0 | 1 | 2 | 3 }) {
  const { width: viewportWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, Math.min(viewportWidth - huddleSpacing.x6, 360));
  const cardHeight = cardWidth * 1.25;
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
      </View>
    </View>
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
        <Pressable accessibilityLabel={`${automationId}:${name}`} testID={automationId} disabled={disabled} onPress={() => onPress(row)} style={({ pressed }) => [styles.webChatRow, priorityStar && styles.priorityStarRow, unread && styles.rowUnread, disabled && styles.rowDisabled, pressed && styles.rowPressed]}>
          <Pressable
            accessibilityLabel={`Open ${name} profile`}
            disabled={!row.peerUserId || disabled || isTeamHuddle}
            onPress={(event) => {
              event.stopPropagation();
              onAvatarPress(row);
            }}
            style={styles.avatarPressTarget}
          >
            <NativeUserAvatar avatarUrl={avatarUrl} isTeamHuddle={isTeamHuddle} isVerified={row.peerIsVerified || isTeamHuddle} name={name} size="lg" />
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

function NativeGroupChatRow({ onOpenDetails, onPress, row }: { currentUserId: string | null; row: NativeChatInboxRow; onManage: (row: NativeChatInboxRow) => void; onOpenDetails: (row: NativeChatInboxRow) => void; onPress: (row: NativeChatInboxRow) => void }) {
  const name = displayName(row);
  const unread = row.unreadCount > 0;
  const preview = row.lastMessageContent ? parseInboxPreview(row.lastMessageContent) : "Group chat";
  return (
    <Pressable accessibilityLabel={`native-chat-group-row:${name}`} testID="native-chat-group-row" onPress={() => onPress(row)} style={({ pressed }) => [styles.webChatRow, unread && styles.rowUnread, pressed && styles.rowPressed]}>
      <Pressable accessibilityLabel={`Open ${name} details`} onPress={(event) => { event.stopPropagation(); onOpenDetails(row); }} style={styles.groupListAvatar}>
        <ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={24} />} style={styles.groupListAvatarImage} uri={row.avatarUrl} />
      </Pressable>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.rowTitleWrap}>
            <Text numberOfLines={1} style={styles.rowTitle}>{name}</Text>
          </View>
          <Text style={styles.rowTime}>{compactTime(row.lastMessageAt || row.activityTs)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text numberOfLines={1} style={[styles.rowSubtitle, unread && styles.rowSubtitleUnread]}>{preview}</Text>
          {unread ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{row.unreadCount > 99 ? "9+" : row.unreadCount}</Text></View> : null}
        </View>
        {row.locationLabel ? (
          <View style={styles.groupMetaInlineRow}>
            <View style={styles.groupLocationInline}>
              <Feather color={huddleColors.iconSubtle} name="map-pin" size={13} />
              <Text numberOfLines={1} style={styles.groupLocationText}>{row.locationLabel}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MatchedRail({ rows, onOpen }: { rows: NativeChatInboxRow[]; onOpen: (row: NativeChatInboxRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <ScrollView contentContainerStyle={styles.matchRailContent} horizontal showsHorizontalScrollIndicator={false}>
      {rows.slice(0, 10).map((row) => {
        const name = displayName(row);
        const avatarUrl = row.peerAvatarUrl || row.avatarUrl;
        return (
          <Pressable key={`match:${row.chatId}`} accessibilityLabel={`Open match with ${name}`} onPress={() => onOpen(row)} style={styles.matchRailItem}>
            <NativeUserAvatar avatarUrl={avatarUrl} isVerified={row.peerIsVerified} name={name} size="lg" />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function DiscoveryEndState({
  passedCount,
  quotaReached,
  onResurface,
  onExpandSearch,
}: {
  passedCount: number;
  quotaReached: boolean;
  onResurface: () => void;
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
          {passedCount} profile{passedCount === 1 ? "" : "s"} skipped this session
        </Text>
      ) : null}
      <View style={styles.discoveryEndActions}>
        {passedCount > 0 && !quotaReached ? (
          <Pressable onPress={onResurface} style={({ pressed }) => [styles.discoveryEndPrimary, pressed && huddleButtons.pressed]}>
            <MaterialCommunityIcons color={huddleColors.onPrimary} name="refresh" size={18} />
            <Text style={styles.discoveryEndPrimaryText}>Resurface skipped</Text>
          </Pressable>
        ) : null}
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
    <View style={nativeModalStyles.appEmptyWrap}>
      <View style={[styles.webEmptyCard, groupAligned ? styles.webEmptyCardGroupAligned : null]}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={emptyImage}
          style={styles.webEmptyImage}
        />
        {title ? <Text style={styles.webEmptyTitle}>{title}</Text> : null}
        {body ? <Text style={styles.webEmptyBody}>{body}</Text> : null}
        {buttonLabel ? <Pressable onPress={onPress} style={styles.webEmptyButton}><Text style={styles.webEmptyButtonText}>{buttonLabel}</Text></Pressable> : null}
      </View>
    </View>
  );
}

function NativeServiceChatsEmptyState() {
  return (
    <View style={nativeModalStyles.appEmptyWrap}>
      <View style={styles.webEmptyCard}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={serviceImage}
          style={styles.webEmptyImage}
        />
        <Text style={styles.webEmptyBody}>
          Give a chance to our local pro and use <Text style={styles.webEmptyBodyStrong}>Care</Text>!
        </Text>
      </View>
    </View>
  );
}

const MATCH_QUICK_REPLIES = ["Hey! Your pet is adorable 🐾", "Would love to meet up!", "Hey! How's your day?", "Your profile caught my eye!"];
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
          preserveAspectRatio="none"
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
  useEffect(() => {
    if (!modal) return;
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
  }, [modal, avatarScale, avatarOpacity, dockSlide, screenH, screenOpacity, screenTranslateY]);
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
                {sending ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Feather color={huddleColors.onPrimary} name="send" size={16} />}
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

export function NativeChatsScreen({ accessToken, userId, search, sessionKey, onBottomSheetOpenChange, onNavigate }: NativeChatsScreenProps) {
  const screenInsets = useSafeAreaInsets();
  const [topTab, setTopTab] = useState<NativeChatsTopTab>(() => parseInitialTopTab(search));
  const [mainTab, setMainTab] = useState<Exclude<NativeChatsTab, "discover">>(() => parseInitialMainTab(search));
  const [rows, setRows] = useState<NativeChatInboxRow[]>([]);
  // Cache hydration is source="cache" status="hydrating"; only DB validation can move status="fresh".
  const [inboxSyncState, setInboxSyncState] = useState<"idle" | "hydrating" | "refreshing" | "fresh" | "error">("idle");
  const [serviceTabHasDialogues, setServiceTabHasDialogues] = useState<boolean | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [discoverProfiles, setDiscoverProfiles] = useState<NativeChatDiscoveryProfile[]>([]);
  const [discoverLoadSettled, setDiscoverLoadSettled] = useState(false);
  const [discoverSettledKey, setDiscoverSettledKey] = useState<string | null>(null);
  const [discoverStorageHydrated, setDiscoverStorageHydrated] = useState(false);
  const [discoverEndStateReady, setDiscoverEndStateReady] = useState(false);
  const [discoverySwipeActive, setDiscoverySwipeActive] = useState(false);
  const discoverySwipeXSV = useSharedValue(0);
  const [discoverStatus, setDiscoverStatus] = useState<NativeChatDiscoverStatus>("ready");
  const [discoverLocationPermission, setDiscoverLocationPermission] = useState<NativeLocationPermissionDetail>({ canAskAgain: true, state: "unknown" });
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const [discoverLocationLabel, setDiscoverLocationLabel] = useState<string | null>(null);
  const [discoverBusyId, setDiscoverBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<NativeChatDiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [viewerCountry, setViewerCountry] = useState<string | null>(null);
  const [viewerScope, setViewerScope] = useState<NativeViewerScope | null>(null);
  const [viewerScopeResolved, setViewerScopeResolved] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<StarUpgradeTier | null>(null);
  const [filterRow, setFilterRow] = useState<keyof NativeChatDiscoveryFilters | null>(null);
  const [effectiveTier, setEffectiveTier] = useState<"free" | "plus" | "gold">("free");
  const [selfVerified, setSelfVerified] = useState(false);
  const [confirmStarTarget, setConfirmStarTarget] = useState<StarConfirmTarget | null>(null);
  const [starActionLoading, setStarActionLoading] = useState(false);
  const [starConfirmMessage, setStarConfirmMessage] = useState<string | null>(null);
  // Discover manual refresh — bare refresh-cw icon top-right (mirrors Map MapControlButton icon contract).
  const [discoverRefreshing, setDiscoverRefreshing] = useState(false);
  // D1: Star premium flow — guards and origin measurement
  const starBusyRef = useRef(false); // D1 guard: single-shot block against double-confirm
  const starAbortRef = useRef<AbortController | null>(null); // D1 guard: cancel/timeout
  const starMountedRef = useRef(true); // D1 guard: ignore post-await writes after unmount
  useEffect(() => () => { starMountedRef.current = false; if (starAbortRef.current) starAbortRef.current.abort(); }, []);
  const [confirmStarPending, setConfirmStarPending] = useState(false); // D1: drives modal charge visual
  const [confirmStarButtonRect, setConfirmStarButtonRect] = useState<{ x: number; y: number } | null>(null); // D1: measured Send-Star button anchor; null fallback uses default cue origin
  const [liftingProfile, setLiftingProfile] = useState<{ id: string; kind: DiscoverySendCueKind } | null>(null); // D1: card lift sync after backend success
  const [discoverySendCue, setDiscoverySendCue] = useState<{ kind: DiscoverySendCueKind; id: number; originX: number | null; originY: number | null } | null>(null);
  const [passedDiscoveryIds, setPassedDiscoveryIds] = useState<Set<string>>(new Set());
  const [handledDiscoveryIds, setHandledDiscoveryIds] = useState<Set<string>>(new Set());
  const [matchModal, setMatchModal] = useState<MatchModalState | null>(null);
  const [matchQuickHello, setMatchQuickHello] = useState("");
  const [matchSending, setMatchSending] = useState(false);
  const [activeMatchedPeerIds, setActiveMatchedPeerIds] = useState<Set<string>>(new Set());
  const [selfMatchProfile, setSelfMatchProfile] = useState<SelfMatchProfile>({ name: "You", avatarUrl: null });
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
  const [profileSheetSource, setProfileSheetSource] = useState<"discover" | "other">("other");
  const [carerProfileOpen, setCarerProfileOpen] = useState(false);
  const [carerProfile, setCarerProfile] = useState<NativeServiceProvider | null>(null);
  const [carerProfileLoading, setCarerProfileLoading] = useState(false);
  const [carerProfileError, setCarerProfileError] = useState("");
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
  const [routeGroupDetailId, setRouteGroupDetailId] = useState<string | null>(() => parseInitialGroupDetailId(search));
  const [groupManagement, setGroupManagement] = useState<NativeGroupManagementSnapshot | null>(null);
  const [groupManagementLoading, setGroupManagementLoading] = useState(false);
  const [groupManagementError, setGroupManagementError] = useState(false);
  const [matchedInviteCandidates, setMatchedInviteCandidates] = useState<Array<{ id: string; name: string; avatarUrl: string | null; isVerified: boolean; socialId: string | null }>>([]);
  const [groupNameEdit, setGroupNameEdit] = useState("");
  const [groupLocationEdit, setGroupLocationEdit] = useState("");
  const [groupPetFocusEdit, setGroupPetFocusEdit] = useState<string[]>([]);
  const [groupDescriptionEdit, setGroupDescriptionEdit] = useState("");
  const [groupEditCoverDraft, setGroupEditCoverDraft] = useState<PendingGroupCover | null>(null);
  const [groupDetailsErrors, setGroupDetailsErrors] = useState<GroupDetailsErrors>({});
  const [groupMemberReportTarget, setGroupMemberReportTarget] = useState<NativeGroupManagementSnapshot["members"][number] | null>(null);
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
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const open = filterOpen || groupExploreSortOpen || premiumTier !== null || confirmStarTarget !== null || matchModal !== null || profileSheetUserId !== null || carerProfileOpen || inviteInboxOpen || pendingGroupInvitePrompt !== null || groupDetails !== null || groupManagement !== null || groupMemberReportTarget !== null || pendingDeleteRow !== null || createGroupOpen || joinCodeOpen;
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [carerProfileOpen, confirmStarTarget, createGroupOpen, filterOpen, groupDetails, groupExploreSortOpen, groupManagement, groupMemberReportTarget, inviteInboxOpen, joinCodeOpen, matchModal, onBottomSheetOpenChange, pendingDeleteRow, pendingGroupInvitePrompt, premiumTier, profileSheetUserId]);
  const discoverySendCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryFiltersSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passedDiscoveryIdsRef = useRef(passedDiscoveryIds);
  const handledDiscoveryIdsRef = useRef(handledDiscoveryIds);
  const activeMatchedPeerIdsRef = useRef(activeMatchedPeerIds);
  const viewerCountryRef = useRef(viewerCountry);
  const rowsRef = useRef(rows);
  const chatSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const inboxRequestSeqRef = useRef(0);
  const hasDbConfirmedInboxRef = useRef(false);
  const readOverlayRef = useRef<Map<string, number>>(new Map());
  const unreadTotalVersionRef = useRef(0);
  const matchProbeRef = useRef<{ userId: string | null; inFlight: boolean }>({ userId: null, inFlight: false });
  const loadRowsGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const loadMoreRowsRef = useRef(false);
  const exploreLoadGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const seenGroupInvitePromptsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedRowsRef = useRef(false);

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
    chatSessionKeyRef.current = sessionKey || (userId ? `${userId}:0` : "anon:0");
  }, [sessionKey, userId]);

  useEffect(() => {
    setTopTab(parseInitialTopTab(search));
    setMainTab(parseInitialMainTab(search));
    setRouteGroupDetailId(parseInitialGroupDetailId(search));
  }, [search]);

  useEffect(() => {
    if (!userId) {
      seenGroupInvitePromptsRef.current = new Set();
      return;
    }
    void AsyncStorage.getItem(`native_group_invite_prompt_seen_${userId}`)
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
    if (!userId) {
      setPassedDiscoveryIds(new Set());
      setHandledDiscoveryIds(new Set());
      setDiscoverStorageHydrated(false);
      return;
    }
    setDiscoverStorageHydrated(false);
    let cancelled = false;
    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [passedRaw, passedSessionRaw, handledRaw, matchedRaw, filtersRaw, seenRaw] = await Promise.all([
        AsyncStorage.getItem(discoveryPassedKey(userId)),
        AsyncStorage.getItem(discoveryPassedSessionKey(userId)),
        AsyncStorage.getItem(discoveryHandledKey(userId)),
        AsyncStorage.getItem(matchedDiscoveryKey(userId)),
        AsyncStorage.getItem(discoveryFiltersKey(userId)),
        AsyncStorage.getItem(discoverySeenTodayKey(userId, today)),
      ]);
      if (cancelled) return;
      try {
        const parsed = JSON.parse(String(passedRaw || "[]")) as unknown;
        const parsedSession = JSON.parse(String(passedSessionRaw || "[]")) as unknown;
        const ids = new Set<string>();
        if (Array.isArray(parsed)) parsed.map(String).filter(Boolean).forEach((id) => ids.add(id));
        if (Array.isArray(parsedSession)) parsedSession.map(String).filter(Boolean).forEach((id) => ids.add(id));
        setPassedDiscoveryIds(ids);
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
      setDiscoverySeenToday(Math.max(0, Number(seenRaw || 0) || 0));
      setDiscoverStorageHydrated(true);
    })().catch(() => {
      if (!cancelled) setDiscoverStorageHydrated(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (discoveryFiltersSaveRef.current) clearTimeout(discoveryFiltersSaveRef.current);
    discoveryFiltersSaveRef.current = setTimeout(() => {
      discoveryFiltersSaveRef.current = null;
      void AsyncStorage.setItem(discoveryFiltersKey(userId), JSON.stringify(filters));
    }, 220);
  }, [filters, userId]);

  useEffect(() => {
    if (!userId) {
      setEffectiveTier("free");
      setViewerScope(null);
      setViewerScopeResolved(false);
      setViewerGroupAnchor(null);
      setViewerPetSignals([]);
      setViewerLocationWords([]);
      return;
    }
    let cancelled = false;
    setViewerScopeResolved(false);
    void (async () => {
      const [snapshot, scope, groupContext] = await Promise.all([
        fetchNativeProfileSummary(userId, { force: false, accessToken }).catch(() => null),
        resolveNativeViewerScope({ userId, accessToken }).catch(() => null),
        fetchNativeViewerGroupContext({ accessToken }).catch(() => null),
      ]);
      if (cancelled) return;
      if (snapshot) {
        setEffectiveTier(normalizeTier(snapshot.profile?.effective_tier ?? snapshot.quota?.effective_tier ?? snapshot.profile?.tier ?? snapshot.quota?.tier));
        setSelfVerified(isNativeVerifiedProfile(snapshot.profile));
        setSelfMatchProfile({
          name: String(snapshot.profile?.display_name || "You"),
          avatarUrl: resolveNativeAvatarUrl(snapshot.profile?.avatar_url),
        });
      } else {
        setEffectiveTier("free");
      }
      if (scope) {
        const scopeLocationText = [scope.district, scope.country].filter(Boolean).join(" ");
        setViewerScope(scope);
        setViewerGroupAnchor(scope.primaryPoint);
        setViewerLocationWords(scopeLocationText
          .toLowerCase()
          .split(/[\s,./-]+/)
          .filter((word) => word.length > 2));
        setViewerCountry(scope.country);
        setGroupCountryDraft(scope.country || null);
      } else {
        setViewerScope(null);
      }
      setViewerScopeResolved(true);
      if (groupContext) {
        setViewerPetSignals(groupContext.pets.map((pet) => ({
          species: String(pet.species || "").trim(),
          breed: String(pet.breed || "").trim(),
        })).filter((pet) => pet.species || pet.breed));
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, userId]);

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
    return Array.from(byPeer.values());
  }, [friendsSourceRows, friendsWithConversationPeerIds, mainTab, topTab]);
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
      setActiveMatchedPeerIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const matches = await fetchNativeMatchedRailSummary({ accessToken, limit: 500 });
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
          setActiveMatchedPeerIds(new Set());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, userId]);

  const visibleRows = useMemo(() => {
    if (topTab !== "chats") return [];
    const sourceRows = searchResultRows ?? rows;
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
    MAIN_TABS.filter((tab) => tab.key !== "service" || serviceTabHasDialogues === true || mainTab === "service" || rows.some(isCareInboxRow))
  ), [mainTab, rows, serviceTabHasDialogues]);
  const realtimeVisibleChatIds = useMemo(() => (
    Array.from(new Set(visibleRows.map((row) => row.chatId).filter(Boolean)))
  ), [visibleRows]);
  const realtimeVisibleGroupIds = useMemo(() => (
    Array.from(new Set(visibleRows.filter((row) => row.roomType === "group").map((row) => row.chatId).filter(Boolean)))
  ), [visibleRows]);
  const realtimeVisibleChatIdsKey = useMemo(() => realtimeVisibleChatIds.join(","), [realtimeVisibleChatIds]);
  const realtimeVisibleGroupIdsKey = useMemo(() => realtimeVisibleGroupIds.join(","), [realtimeVisibleGroupIds]);

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
        const serviceRows = await fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: "all", onlyWithActivity: null, limit: 80, force: true, forceDb: true });
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

  const commitDiscoveryAction = useCallback((profileId: string, action: "pass" | "wave" | "star") => {
    if (!userId) return;
    const cleanId = String(profileId || "").trim();
    if (!cleanId) return;
    invalidateNativeDiscoveryRelationshipCache(userId);
    if (action === "pass") {
      setDiscoverProfiles((current) => current.filter((profile) => profile.id !== cleanId));
      setPassedDiscoveryIds((current) => {
        const next = new Set(current);
        next.add(cleanId);
        persistDiscoverySet(discoveryPassedKey(userId), next);
        persistDiscoverySet(discoveryPassedSessionKey(userId), next);
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
  }, [persistDiscoverySet, userId]);

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

  const bumpNativeDiscoverySeen = useCallback(async () => {
    try {
      const { data, error } = await nativeExactTokenRpc("check_and_increment_quota", { action_type: "discovery_view" }, accessToken);
      if (error || data !== true) return false;
      if (userId) {
        const today = new Date().toISOString().slice(0, 10);
        setDiscoverySeenToday((current) => {
          const next = current + 1;
          void AsyncStorage.setItem(discoverySeenTodayKey(userId, today), String(next));
          return next;
        });
      }
      return true;
    } catch {
      return false;
    }
  }, [accessToken, userId]);

  const enqueueNativeChatNotification = useCallback(async (args: { userId: string; kind: string; title: string; body: string; href: string; data?: Record<string, unknown> }) => {
    try {
      let href = args.href;
      if (href === "/chats") href = "/chats?tab=discover";
      if (!href.startsWith("/")) href = "/chats?tab=discover";
      await nativeExactTokenRpc("enqueue_notification", {
        p_user_id: args.userId,
        p_category: "chats",
        p_kind: args.kind,
        p_title: args.title,
        p_body: args.body,
        p_href: href,
        p_data: args.data ?? {},
      }, accessToken);
    } catch {
      // Notification parity is best-effort and must not block the primary action.
    }
  }, [accessToken]);

  const launchNativeDiscoverySendCue = useCallback((kind: DiscoverySendCueKind, options?: { onCommit?: () => void; originX?: number | null; originY?: number | null }) => new Promise<void>((resolve) => {
    if (discoverySendCueTimerRef.current) {
      clearTimeout(discoverySendCueTimerRef.current);
      discoverySendCueTimerRef.current = null;
    }
    // D1: pass through optional origin coords for spatial-continuity with the modal Send button.
    // Falls back to default screen-bottom origin when null (e.g., when measureInWindow failed).
    setDiscoverySendCue({ kind, id: Date.now(), originX: options?.originX ?? null, originY: options?.originY ?? null });
    const commitDelay = kind === "star" ? 320 : 220;
    // Animation runway — wave bubble rises ~700ms, star travels bottom→top ~1300ms.
    const completeDelay = kind === "star" ? 1400 : 760;
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
      country: viewerScope?.country ?? null,
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

  const applyReadOverlay = useCallback((sourceRows: NativeChatInboxRow[]) => {
    const overlay = readOverlayRef.current;
    return sourceRows.map((row) => overlay.has(row.chatId) ? { ...row, unreadCount: 0 } : row);
  }, []);

  const syncUnreadTotalFromRows = useCallback((sourceRows: NativeChatInboxRow[]) => {
    setUnreadTotal(unreadTotalWithReadOverlay(sourceRows, readOverlayRef.current));
  }, []);

  const loadRows = useCallback(async ({ force, silent }: { force?: boolean; silent?: boolean } = {}) => {
    if (!userId) {
      setRows([]);
      setUnreadTotal(0);
      setInboxSyncState("idle");
      hasDbConfirmedInboxRef.current = false;
      setDiscoverLoadSettled(false);
      setDiscoverSettledKey(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const loadKey = topTab === "discover"
      ? activeDiscoverRequestKey
      : topTab === "community"
        ? `${userId}|community|${effectiveTier}`
        : `${userId}|${sessionKey || `${userId}:0`}|${topTab}|${mainTab}|${effectiveTier}`;
    const requestSeq = ++inboxRequestSeqRef.current;
    if (topTab === "discover" && !viewerScopeResolved) {
      if (!silent) setLoading(true);
      setRefreshing(false);
      return;
    }
    const now = Date.now();
    const gate = loadRowsGateRef.current;
    if (!force && gate.key === loadKey && (gate.inFlight || now - gate.lastStartedAt < 1200)) {
      setRefreshing(false);
      return;
    }
    loadRowsGateRef.current = { key: loadKey, inFlight: true, lastStartedAt: now };
    if (topTab === "discover") {
      setStatus(null);
      setDiscoverLoadSettled(false);
      setDiscoverSettledKey(null);
      const discoverCacheKey = chatsDiscoverProfilesCacheKey(userId, filterKey, effectiveTier, viewerCountryRef.current);
      const cachedDiscover = !force ? await readChatsCache<{
        profiles: NativeChatDiscoveryProfile[];
        status: NativeChatDiscoverStatus;
        locationLabel: string | null;
      }>(discoverCacheKey) : null;

      if (cachedDiscover?.profiles?.length) {
        setDiscoverProfiles(cachedDiscover.profiles);
        setDiscoverStatus(cachedDiscover.status);
        setDiscoverLocationLabel(cachedDiscover.locationLabel);
        setDiscoverLoadSettled(true);
        setDiscoverSettledKey(loadKey);
        if (!silent) setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const result = await fetchNativeChatDiscoveryProfiles(userId, filters, {
          accessToken,
          effectiveTier,
          viewerScope,
          force,
          cacheWriteGuard: () => loadRowsGateRef.current.key === loadKey,
        });
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
        let nextProfiles = eligibleProfiles
          .filter((profile) => !passedIds.has(profile.id))
          .slice(0, CHATS_DISCOVER_CACHE_LIMIT);

        if (nextProfiles.length === 0 && passedIds.size > 0 && eligibleProfiles.length > 0) {
          const clearedPassedIds = new Set<string>();
          passedDiscoveryIdsRef.current = clearedPassedIds;
          setPassedDiscoveryIds(clearedPassedIds);
          void AsyncStorage.removeItem(discoveryPassedKey(userId));
          void AsyncStorage.removeItem(discoveryPassedSessionKey(userId));
          nextProfiles = eligibleProfiles.slice(0, CHATS_DISCOVER_CACHE_LIMIT);
        }

        setDiscoverProfiles(nextProfiles);
        if (__DEV__) {
          console.log("NATIVE_DISCOVER_FINAL_PROFILES", {
            discoverProfilesLength: nextProfiles.length,
            lostFromRpcToFinalCount: result.profiles.length - nextProfiles.length,
            passedIdsCount: passedIds.size,
          });
        }
        setDiscoverStatus(result.status);
        setDiscoverLocationLabel(result.locationLabel);
        setDiscoverLoadSettled(true);
        setDiscoverSettledKey(loadKey);
        void writeChatsCache(discoverCacheKey, {
          profiles: nextProfiles,
          status: result.status,
          locationLabel: result.locationLabel,
        });
      } catch {
        if (!cachedDiscover?.profiles?.length) {
          setDiscoverStatus("error");
          setDiscoverLoadSettled(true);
          setDiscoverSettledKey(loadKey);
        }
        setStatus("Discover could not load. Pull to retry.");
      } finally {
        if (loadRowsGateRef.current.key === loadKey) loadRowsGateRef.current.inFlight = false;
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
      return;
    }
    if (topTab === "community") {
      // Community = group exploration only. No inbox load; no mainTab/groupSubTab dependency.
      try {
        if (!silent) setLoading(true);
        const joinedGroupIds = rowsRef.current.filter((row) => row.roomType === "group").map((row) => row.chatId);
        const exploreKey = `${userId}|${joinedGroupIds.slice().sort().join(",")}`;
        const exploreGate = exploreLoadGateRef.current;
        if (force || exploreGate.key !== exploreKey || (!exploreGate.inFlight && Date.now() - exploreGate.lastStartedAt >= 5000)) {
          exploreLoadGateRef.current = { key: exploreKey, inFlight: true, lastStartedAt: Date.now() };
          const groupsCacheKey = chatsExploreGroupsCacheKey(userId);
          void readChatsCache<{ invited: NativeExploreGroup[]; groups: NativeExploreGroup[] }>(groupsCacheKey).then((cached) => {
            if (!force && cached) {
              setExploreGroups(cached.groups.slice(0, CHATS_GROUP_EXPLORE_CACHE_LIMIT));
              setInvitedExploreGroups(cached.invited);
            }
          });
          const explore = await fetchNativeExploreGroups({
            userId,
            accessToken,
            joinedGroupIds,
            viewerScope,
            force,
            cacheWriteGuard: () => exploreLoadGateRef.current.key === exploreKey,
          });
          const allGroups = [...explore.invited, ...explore.groups].slice(0, CHATS_GROUP_EXPLORE_CACHE_LIMIT + explore.invited.length);
          const creatorIds = new Set(allGroups.map((group) => group.createdBy).filter((id): id is string => Boolean(id)));
          const distanceByCreator = new Map<string, number>();
          if (viewerGroupAnchor && creatorIds.size > 0) {
            const { data, error } = await nativeExactTokenRpc(
              "get_service_provider_distances",
              { p_lat: viewerGroupAnchor.lat, p_lng: viewerGroupAnchor.lng },
              accessToken,
            );
            if (error) {
              console.warn("[native.chats] group_distance_failed", error);
            } else {
              for (const row of (Array.isArray(data) ? data : []) as Array<{ user_id?: string; distance_km?: number | null }>) {
                const id = String(row.user_id || "");
                if (!creatorIds.has(id) || typeof row.distance_km !== "number" || !Number.isFinite(row.distance_km)) continue;
                distanceByCreator.set(id, row.distance_km);
              }
            }
          }
          const withDistance = (group: NativeExploreGroup) => ({
            ...group,
            distanceKm: group.createdBy ? distanceByCreator.get(group.createdBy) ?? null : null,
          });
          const nextGroups = explore.groups.map(withDistance).slice(0, CHATS_GROUP_EXPLORE_CACHE_LIMIT);
          const nextInvited = explore.invited.map(withDistance);
          setExploreGroups(nextGroups);
          setInvitedExploreGroups(nextInvited);
          void writeChatsCache(groupsCacheKey, { invited: nextInvited, groups: nextGroups });
          if (exploreLoadGateRef.current.key === exploreKey) exploreLoadGateRef.current.inFlight = false;
        }
      } catch (error) {
        console.warn("[native.chats] community_load_failed", error);
        if (!silent) setStatus("Community could not load. Pull to refresh.");
      } finally {
        if (loadRowsGateRef.current.key === loadKey) loadRowsGateRef.current.inFlight = false;
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
      return;
    }
    const inboxCacheKey = chatsInboxRowsCacheKey(userId, sessionKey, mainTab);
    const cacheSessionKey = sessionKey || `${userId}:0`;
    const cacheSurface = `native_chats:${mainTab}`;
    const cachedInbox = !force ? await readChatsInboxMirrorCache(inboxCacheKey, { sessionKey: cacheSessionKey, surface: cacheSurface, userId }) : null;

    if (loadRowsGateRef.current.key !== loadKey || inboxRequestSeqRef.current !== requestSeq) return;
    if (!hasDbConfirmedInboxRef.current && cachedInbox?.rows?.length) {
      const hydratedRows = applyReadOverlay(cachedInbox.rows);
      setRows(hydratedRows);
      syncUnreadTotalFromRows(hydratedRows);
      setInboxSyncState("hydrating");
      setHasMoreRows(cachedInbox.hasMoreRows);
      setRowCursor(cachedInbox.rowCursor);
      setVisibleCount(INBOX_FIRST_PAGE);
    } else if (!silent) {
      setLoading(true);
    }

    setStatus(null);
    setInboxSyncState((current) => current === "hydrating" ? current : "refreshing");
    try {
      setVisibleCount(INBOX_FIRST_PAGE);
      const [baseRows, activeFriendRows] = await Promise.all([
        fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: scopeForTab(mainTab), onlyWithActivity: mainTab === "friends" ? false : null, limit: 80, force: true, forceDb: true }),
        mainTab === "friends" ? fetchNativeChatInbox({ userId, accessToken, sessionKey, scope: "friends", onlyWithActivity: true, limit: INBOX_FIRST_PAGE, force: true, forceDb: true }) : Promise.resolve([] as NativeChatInboxRow[]),
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
      setRows(dbRows);
      hasDbConfirmedInboxRef.current = true;
      syncUnreadTotalFromRows(dbRows);
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
      console.warn("[native.chats] load_rows_failed", error);
      if (inboxRequestSeqRef.current === requestSeq) setInboxSyncState("error");
      if (!silent) setStatus("Failed to load conversations. Pull to refresh.");
    } finally {
      if (loadRowsGateRef.current.key === loadKey) loadRowsGateRef.current.inFlight = false;
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, activeDiscoverRequestKey, applyReadOverlay, effectiveTier, filterKey, filters, mainTab, sessionKey, syncUnreadTotalFromRows, topTab, userId, viewerGroupAnchor, viewerScope, viewerScopeResolved]);

  useEffect(() => {
    if (!userId) return;
    void loadRows({ silent: false });
  }, [loadRows, userId]);

  useEffect(() => {
    if (topTab !== "discover") return;
    let active = true;
    void getNativeForegroundLocationPermissionDetail().then((detail) => {
      if (active) setDiscoverLocationPermission(detail);
    }).catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void getNativeForegroundLocationPermissionDetail().then((detail) => {
        setDiscoverLocationPermission(detail);
      }).catch(() => undefined);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [loadRows, topTab]);

  const handleDiscoverEnableLocation = useCallback(async () => {
    if (discoverLocationPermission.canAskAgain) {
      const detail = await requestNativeForegroundLocationPermissionDetail();
      setDiscoverLocationPermission(detail);
      if (detail.state === "granted") {
        await loadRows({ force: true, silent: true });
        return;
      }
      return;
    }
    await openNativeLocationSettings();
  }, [discoverLocationPermission.canAskAgain, loadRows]);

	  const refreshUnreadTotal = useCallback(async () => {
	    if (!userId) {
	      setUnreadTotal(0);
	      return;
	    }
    const requestVersion = unreadTotalVersionRef.current;
	    try {
	      const total = await fetchNativeChatUnreadTotal(userId, { accessToken, sessionKey, force: true });
      const overlayTotal = Array.from(readOverlayRef.current.values()).reduce((sum, count) => sum + Math.max(0, count), 0);
	      if (unreadTotalVersionRef.current === requestVersion) setUnreadTotal(Math.max(0, total - overlayTotal));
    } catch (error) {
      console.warn("[native.chats] unread_total_failed", error);
    }
  }, [accessToken, sessionKey, userId]);

  useEffect(() => {
    void refreshUnreadTotal();
  }, [refreshUnreadTotal]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void invalidateNativeChatReadCaches(userId);
        void refreshUnreadTotal();
        void loadRows({ force: true, silent: true });
      }, 450);
    };
    const channelName = `native-chats-realtime-${userId}`;
    const handle = createSingleRealtimeChannel(channelName, (baseChannel) => {
      let channel = baseChannel
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `requester_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `provider_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_chat_invites", filter: `invitee_user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_join_requests", filter: `user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_members", filter: `user_id=eq.${userId}` }, refresh);

      for (const chatId of realtimeVisibleChatIds) {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` }, refresh);
      }
      for (const groupId of realtimeVisibleGroupIds) {
        channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "group_join_requests", filter: `chat_id=eq.${groupId}` }, refresh);
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
  }, [loadRows, realtimeVisibleChatIds, realtimeVisibleChatIdsKey, realtimeVisibleGroupIds, realtimeVisibleGroupIdsKey, refreshUnreadTotal, userId]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadRows({ force: true, silent: true });
  }, [loadRows]);

  useEffect(() => {
    if (!userId || topTab !== "chats") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void invalidateNativeChatReadCaches(userId);
        void loadRows({ force: true, silent: true });
      }
    });
    return () => subscription.remove();
  }, [loadRows, topTab, userId]);

  const handleTopTabPress = useCallback((tab: NativeChatsTopTab) => {
    haptic.selectTab();
    setTopTab(tab);
    setStatus(null);
  }, []);

  // Bottom edge-swipe: flick left/right on the lower screen strip to cycle Discover → Community → Chats.
  // Stops at the ends (no wrap). Vertical motion and taps pass through unchanged.
  const cycleTopTab = useCallback((direction: 1 | -1) => {
    const order: NativeChatsTopTab[] = ["discover", "community", "chats"];
    const currentIndex = order.indexOf(topTab);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    haptic.selectTab();
    setTopTab(order[nextIndex]);
    setStatus(null);
  }, [topTab]);
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
    discoverTabOpacity.value = withTiming(topTab === "discover" ? 1 : 0, { duration: 100 });
    communityTabOpacity.value = withTiming(topTab === "community" ? 1 : 0, { duration: 100 });
    chatsTabOpacity.value = withTiming(topTab === "chats" ? 1 : 0, { duration: 100 });
  }, [topTab, discoverTabOpacity, communityTabOpacity, chatsTabOpacity]);
  const discoverTabStyle = useAnimatedStyle(() => ({ opacity: discoverTabOpacity.value }));
  const communityTabStyle = useAnimatedStyle(() => ({ opacity: communityTabOpacity.value }));
  const chatsTabStyle = useAnimatedStyle(() => ({ opacity: chatsTabOpacity.value }));

  const handleMainTabPress = useCallback((tab: Exclude<NativeChatsTab, "discover">) => {
    haptic.selectTab();
    setMainTab(tab);
    setStatus(null);
  }, []);

  const handleOpenRow = useCallback((row: NativeChatInboxRow) => {
    haptic.toggleControl();

    const roomId = String(row.chatId || "").trim();
    if (!roomId) {
      setStatus("Unable to open conversation right now.");
      return;
    }

    if (row.unreadCount > 0) readOverlayRef.current.set(roomId, Math.max(row.unreadCount, readOverlayRef.current.get(roomId) || 0));
    setRows((current) => current.map((item) => item.chatId === roomId ? { ...item, unreadCount: 0 } : item));
    unreadTotalVersionRef.current += 1;
    setUnreadTotal((current) => Math.max(0, current - Math.max(0, row.unreadCount)));
    if (userId) {
      void invalidateNativeChatReadCaches(userId);
      void markNativeChatRoomRead({ roomId, userId, accessToken })
        .then(() => {
          void refreshUnreadTotal();
        })
        .catch((error) => {
          console.warn("[native.chats] mark_read_open_failed", error);
          void refreshUnreadTotal();
        });
    }

    const name = displayName(row);
    const unreadParam = `&unread=${Math.max(0, row.unreadCount)}`;

    if (row.roomType === "group") {
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}&joined=1${unreadParam}`, "/chats?tab=groups"));
      return;
    }

    if (isTeamHuddleRow(row)) {
      const avatarParam = row.peerAvatarUrl ? `&avatar=${encodeURIComponent(row.peerAvatarUrl)}` : "";
      const peerParam = row.peerUserId ? `&with=${encodeURIComponent(row.peerUserId)}` : "";
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(name)}${peerParam}${unreadParam}${avatarParam}`, "/chats?tab=service"));
      return;
    }

    void resolveNativeChatInboxRowNavigation(row, (targetUserId, targetName) => ensureNativeDirectChatRoom(targetUserId, targetName, { accessToken, actorId: userId })).then((path) => {
      onNavigate(path);
    }).catch((error: unknown) => {
      const detail = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
      readOverlayRef.current.delete(roomId);
      setRows((current) => current.map((item) => item.chatId === roomId ? { ...item, unreadCount: row.unreadCount } : item));
      setUnreadTotal((current) => current + Math.max(0, row.unreadCount));
      setStatus(detail ? `Unable to open conversation right now: ${detail}` : "Unable to open conversation right now.");
    });
  }, [accessToken, onNavigate, refreshUnreadTotal, userId]);

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
      void incrementNativeServiceProviderView(providerUserId, userId, accessToken).catch(() => undefined);
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
  }, [accessToken, loading, openManagedGroup, routeGroupDetailId, rows]);

  const openGroupMemberProfile = useCallback((memberId: string) => {
    if (groupDetails && "invitePending" in groupDetails) {
      // Invite-pending flows originate from Community (Group Explore).
      setTopTab("community");
    }
    setGroupDetails(null);
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
        return;
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
      console.warn("[native.chats] group_details_members_failed", error);
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
      setGroupManagement(await fetchNativeGroupManagementSnapshot(chatId, { accessToken }));
    } catch {
      setStatus("Unable to refresh group management.");
    }
  }, [accessToken]);

  const handleJoinExploreGroup = useCallback(async (group: NativeExploreGroup) => {
    if (!userId) return;
    try {
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
        await joinNativePublicGroup({ userId, chatId: group.id, accessToken });
        if (group.createdBy && group.createdBy !== userId) {
          const joinerName = selfMatchProfile.name || "Someone";
          void enqueueNativeChatNotification({
            userId: group.createdBy,
            kind: "group_joined",
            title: group.name,
            body: `${joinerName} just joined your group! 👋 Say Hello!`,
            href: `/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}`,
            data: {
              kind: "group_joined",
              chat_id: group.id,
              group_name: group.name,
              joined_user_id: userId,
            },
          });
        }
        haptic.success(); // CD5: confirm instant join
      } else {
        await requestNativeGroupJoin({ userId, chatId: group.id, accessToken });
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
  }, [accessToken, enqueueNativeChatNotification, loadRows, onNavigate, selfMatchProfile.name, userId]);

  const handleDeclineExploreInvite = useCallback(async (group: NativeExploreGroup) => {
    if (!userId) return;
    try {
      await declineNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, userId, accessToken });
      setInvitedExploreGroups((current) => current.filter((item) => item.id !== group.id));
      setGroupDetails(null);
      await loadRows({ force: true, silent: true });
    } catch {
      setStatus("Unable to decline invite right now.");
    }
  }, [accessToken, loadRows, userId]);

  const confirmInviteInboxDecisions = useCallback(async (decisions: Record<string, "accept" | "decline">) => {
    if (!userId) return;
    const entries = invitedExploreGroups.filter((group) => decisions[group.id]);
    if (!entries.length) return;
    for (const group of entries) {
      const decision = decisions[group.id];
      if (decision === "accept") {
        await acceptNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, accessToken });
      } else {
        await declineNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, userId, accessToken });
      }
    }
    setInviteInboxOpen(false);
    setGroupDetails(null);
    await loadRows({ force: true, silent: true });
  }, [accessToken, invitedExploreGroups, loadRows, userId]);

  const handleJoinCode = useCallback(async () => {
    if (!userId) return;
    try {
      const joined = await joinNativeGroupByCode({ userId, code: groupCodeDraft, accessToken });
      setJoinCodeOpen(false);
      setGroupCodeDraft("");
      await loadRows({ force: true, silent: true });
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(joined.chatId)}&name=${encodeURIComponent(joined.name)}&joined=1`, "/chats?tab=groups"));
    } catch {
      setStatus("Code not found or group could not be joined.");
    }
  }, [accessToken, groupCodeDraft, loadRows, onNavigate, userId]);

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
      void loadRows({ force: true, silent: true }).catch((error) => console.warn("[native.chats] post_create_group_refresh_failed", error));
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(created.chatId)}&name=${encodeURIComponent(created.name)}`, "/chats?tab=groups"));
    } catch (error) {
      logNativeProtectedActionFailure("[native.chats] create_group_failed", error);
      const message = error instanceof Error ? error.message : String(error || "");
      if (/file_too_large/i.test(message)) setStatus("That file's too big. Try a photo under 15MB.");
      else setStatus("Couldn't create group. Check the name and try again.");
    } finally {
      setGroupCreating(false);
    }
  }, [accessToken, groupCountryDraft, groupCoverDraft, groupCreating, groupDescriptionDraft, groupInviteIds, groupJoinMethodDraft, groupLocationDraft, groupNameDraft, groupPetFocusDraft, groupVisibilityDraft, loadRows, onNavigate, resetCreateGroupDrafts, selfVerified, userId]);

  const pickGroupCover = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setGroupCoverDraft({
      uri: asset.uri,
      name: asset.fileName || `group-cover-${Date.now()}.jpg`,
      mime: asset.mimeType || "image/jpeg",
      size: asset.fileSize ?? null,
      height: asset.height ?? null,
      width: asset.width ?? null,
    });
  }, []);

  const pickGroupEditCover = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ["images"],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.86,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setGroupEditCoverDraft({
      uri: asset.uri,
      name: asset.fileName || `group-cover-${Date.now()}.jpg`,
      mime: asset.mimeType || "image/jpeg",
      size: asset.fileSize ?? null,
      height: asset.height ?? null,
      width: asset.width ?? null,
    });
    setGroupDetailsErrors((current) => ({ ...current, cover: false }));
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
    setStatus(tier === "gold" ? "Gold unlocks every Discover filter." : "Huddle+ unlocks advanced filters.");
    setPremiumTier(tier);
  }, []);

  const markMatchSeenPersisted = useCallback(async (targetUserId?: string | null) => {
    const normalized = String(targetUserId || "").trim();
    if (!userId || !normalized) return;
    try {
      const [seenRaw, matchedRaw] = await Promise.all([
        AsyncStorage.getItem(seenMatchesKey(userId)),
        AsyncStorage.getItem(matchedDiscoveryKey(userId)),
      ]);
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

  const openFirstUnseenMatchModal = useCallback(async () => {
    if (!userId || matchModal || matchProbeRef.current.inFlight || matchProbeRef.current.userId === userId) return;
    matchProbeRef.current = { userId, inFlight: true };
    try {
      const [seen, matchesRows] = await Promise.all([
        readSeenMatchSet(userId, accessToken),
        fetchNativeMatchedRailSummary({ accessToken, limit: 500 }),
      ]);
      if (!matchesRows.length) return;
      const blocked = new Set(rowsRef.current.filter((row) => row.blockedByMe || row.blockedByThem || row.unmatchedByMe || row.unmatchedByThem).map((row) => row.peerUserId).filter(Boolean) as string[]);
      const candidates = [];
      for (const row of matchesRows) {
        if (!row.peerUserId || row.peerUserId === userId) continue;
        if (seen.has(row.peerUserId) || blocked.has(row.peerUserId)) continue;
        candidates.push(row);
      }
      if (!candidates.length) return;
      const target = candidates[0];
      const targetUserId = target.peerUserId;
      if (!targetUserId) return;
      const name = String(target.displayName || "Conversation");
      setMatchModal({ userId: targetUserId, name, avatarUrl: target.avatarUrl, roomId: null });
      void markMatchSeenPersisted(targetUserId);
      try {
	      const roomId = await ensureNativeDirectChatRoom(targetUserId, name, { accessToken, actorId: userId });
        setMatchModal((current) => current?.userId === targetUserId ? { ...current, roomId } : current);
      } catch {
        // Keep modal visible; the quick hello action can retry the canonical RPC.
      }
    } catch {
      // Passive match surfacing is non-blocking.
    } finally {
      matchProbeRef.current = { userId, inFlight: false };
    }
  }, [accessToken, markMatchSeenPersisted, matchModal, userId]);

  useEffect(() => {
    if (!userId) return;
    void openFirstUnseenMatchModal();
  }, [openFirstUnseenMatchModal, userId]);

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
      void markNativeChatRoomRead({ roomId, userId, accessToken }).catch((error) => console.warn("[native.chats] match_quick_hello_mark_read_failed", error));
      void loadRows({ force: true, silent: true });
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(targetName)}&with=${encodeURIComponent(targetUserId)}`, "/chats?tab=friends"));
    } catch {
      setStatus("Unable to send hello right now.");
      setMatchSending(false);
    }
  }, [accessToken, loadRows, markMatchSeenPersisted, matchModal, matchQuickHello, matchSending, onNavigate, userId]);

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
  const discoveryQuotaLocked = topTab === "discover" && discoverStatus === "ready" && discoveryQuotaReached && normalizeQuotaTier(effectiveTier) !== "gold";
  const discoveryQuotaCopy = quotaConfig.copy.discovery.exhausted[normalizeQuotaTier(effectiveTier)];
  // Top card + up to 3 queued cards below (4 total). When fewer profiles remain, the pile shrinks
  // naturally — no ghost/placeholder cards are inserted to pad the visual.
  const discoveryDeckProfiles = discoverProfiles.slice(0, 4);
  const currentDiscoveryProfile = discoveryDeckProfiles[0] ?? null;
  const discoverRequestSettled = topTab === "discover" && discoverLoadSettled && discoverSettledKey === activeDiscoverRequestKey;
  const discoverBooting = topTab === "discover" && !discoverRequestSettled;
  const discoverEndStateCandidate =
    discoverRequestSettled &&
    !loading &&
    discoverStatus === "ready" &&
    !discoveryQuotaReached &&
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
    haptic.toggleControl();
    commitDiscoveryAction(profile.id, "pass");
  }, [commitDiscoveryAction]);

  const handleWaveDiscovery = useCallback(async (profile: NativeChatDiscoveryProfile) => {
    if (!userId || discoverBusyId) return false;
    if (discoveryQuotaReached) {
      setStatus(discoveryQuotaCopy);
      return false;
    }
    haptic.toggleControl();
    setDiscoverBusyId(profile.id);
    setStatus(null);
    commitDiscoveryAction(profile.id, "wave");
    try {
      const quotaAccepted = await bumpNativeDiscoverySeen();
      if (!quotaAccepted) {
        rollbackDiscoveryAction(profile, "wave");
        setStatus(discoveryQuotaCopy);
        return false;
      }
      const result = await sendNativePublicProfileWave(userId, profile.id, accessToken);
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
      markNativeDiscoveryRelationshipHandled(userId, profile.id);
      await launchNativeDiscoverySendCue("wave");
      if (result.status === "sent" && !result.mutual) {
        void enqueueNativeChatNotification({
          userId: profile.id,
          kind: "wave",
          title: "New wave",
          body: "Someone just waved at you 👋",
          href: "/chats?tab=discover",
          data: { from_user_id: userId, type: "wave" },
        });
      }
      if (result.mutual || await hasReciprocalWave(userId, profile.id, accessToken)) {
        setMatchModal({ userId: profile.id, name: profile.displayName, avatarUrl: resolveNativeAvatarUrl(profile.avatarUrl), roomId: null });
        void markMatchSeenPersisted(profile.id);
        try {
	          const roomId = await ensureNativeDirectChatRoom(profile.id, profile.displayName, { accessToken, actorId: userId });
          setMatchModal((current) => current?.userId === profile.id ? { ...current, roomId } : current);
        } catch {
          // Keep match modal visible; quick hello can retry via the match RPC.
        }
        setStatus("It's a match.");
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
      setDiscoverBusyId(null);
    }
  }, [accessToken, bumpNativeDiscoverySeen, commitDiscoveryAction, discoverBusyId, discoveryQuotaCopy, discoveryQuotaReached, enqueueNativeChatNotification, launchNativeDiscoverySendCue, markMatchSeenPersisted, rollbackDiscoveryAction, userId]);

  const handleStarDiscovery = useCallback((profile: NativeChatDiscoveryProfile) => {
    if (!userId || discoverBusyId) return;
    if (discoveryQuotaReached) {
      setStatus(discoveryQuotaCopy);
      return;
    }
    haptic.toggleControl();
    setStarConfirmMessage(null);
    setConfirmStarTarget({ id: profile.id, displayName: profile.displayName });
  }, [discoverBusyId, discoveryQuotaCopy, discoveryQuotaReached, userId]);

  const handleDiscoveryProfileTap = useCallback((profile: NativeChatDiscoveryProfile) => {
    if (discoverBusyId) return;
    haptic.toggleControl();
    setProfileSheetSource("discover");
    setProfileSheetUserId(profile.id);
  }, [discoverBusyId]);

  const handleProfileSheetWave = useCallback(async () => {
    if (!profileSheetUserId) return;
    const profile = discoverProfiles.find((p) => p.id === profileSheetUserId);
    if (!profile) return;
    const sent = await handleWaveDiscovery(profile);
    if (sent) setProfileSheetUserId(null);
  }, [discoverProfiles, handleWaveDiscovery, profileSheetUserId]);

  // Star from profile preview opened in Discover. Closes the profile sheet first, then routes through
  // the existing handleStarDiscovery (which opens ConfirmStarModal). Single backend path preserved.
  const handleProfileSheetStar = useCallback(() => {
    if (!profileSheetUserId) return;
    const profile = discoverProfiles.find((p) => p.id === profileSheetUserId);
    if (!profile) return;
    setProfileSheetUserId(null);
    handleStarDiscovery(profile);
  }, [discoverProfiles, handleStarDiscovery, profileSheetUserId]);

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

    // D1: abort + 8s timeout guard. Backend signature unchanged; race wins ignore late settles.
    const controller = new AbortController();
    starAbortRef.current = controller;
    const timeoutMs = 8000;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error(controller.signal.reason === "timeout" ? "star_timeout" : "star_aborted")), { once: true });
    });
    timeoutHandle = setTimeout(() => { if (!controller.signal.aborted) controller.abort("timeout"); }, timeoutMs);

    const targetId = confirmStarTarget.id;
    const targetName = confirmStarTarget.displayName;

    try {
      if (discoveryQuotaReached) {
        setStarConfirmMessage(discoveryQuotaCopy);
        setStatus(discoveryQuotaCopy);
        return;
      }
      const quotaAccepted = await Promise.race([bumpNativeDiscoverySeen(), abortPromise]);
      if (!starMountedRef.current) return;
      if (!quotaAccepted) {
        setStarConfirmMessage(discoveryQuotaCopy);
        setStatus(discoveryQuotaCopy);
        return;
      }
      if (!accessToken) {
        const message = "Please sign in again to send a Star.";
        setStarConfirmMessage(message);
        setStatus(message);
        return;
      }
      const result = await Promise.race([
        sendNativePublicProfileStarChat(userId, targetId, targetName, accessToken),
        abortPromise,
      ]);
      if (!starMountedRef.current) return;
      if (result.status === "free_tier") {
        setConfirmStarTarget(null);
        setStarConfirmMessage(null);
        onNavigate("/premium");
        return;
      }
      if (result.status === "exhausted") {
        if (result.upgradeTier === "gold") {
          setConfirmStarTarget(null);
          setStarConfirmMessage(null);
          setPremiumTier("gold");
        } else {
          setStarConfirmMessage("You're out of Stars for now.");
          setStatus("You're out of Stars for now.");
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
      // Drop the "Star sent." banner — cue + navigation to chat IS the confirmation.
      onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(result.roomId)}&name=${encodeURIComponent(targetName)}&with=${encodeURIComponent(targetId)}`, "/chats?tab=friends"));
    } catch (error) {
      // D1: FAILURE path — card stays in deck. No cue. No lift. Modal stays open with error.
      if (!starMountedRef.current) return;
      const message = error instanceof Error && error.message === "star_timeout"
        ? "That took too long. Try again."
        : error instanceof Error && error.message === "star_aborted"
          ? null
          : "Unable to send Star right now. Try again in a moment.";
      if (message) {
        setStarConfirmMessage(message);
        setStatus(message);
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (starAbortRef.current === controller) starAbortRef.current = null;
      if (starMountedRef.current) {
        setStarActionLoading(false);
        setDiscoverBusyId(null);
        setConfirmStarPending(false);
      }
      starBusyRef.current = false;
    }
  }, [accessToken, bumpNativeDiscoverySeen, commitDiscoveryAction, confirmStarButtonRect, confirmStarTarget, discoveryQuotaCopy, discoveryQuotaReached, launchNativeDiscoverySendCue, onNavigate, starActionLoading, userId]);

  // Discover refresh: bare refresh-cw icon top-right. Mirrors Map's MapControlButton icon contract
  // (Feather "refresh-cw", subtext color, ActivityIndicator on loading, toggleControl haptic).
  // No background — icon-only per product call.
  const handleDiscoverRefresh = useCallback(async () => {
    if (discoverRefreshing) return; // single-shot guard
    if (!userId) return;
    haptic.toggleControl();
    setDiscoverRefreshing(true);
    try {
      await loadRows({ force: true });
    } finally {
      if (starMountedRef.current) setDiscoverRefreshing(false);
    }
  }, [discoverRefreshing, loadRows, userId]);


  // D1: cancel during pending aborts backend race + reverts modal.
  const cancelConfirmStar = useCallback(() => {
    if (starAbortRef.current && !starAbortRef.current.signal.aborted) {
      starAbortRef.current.abort("user_cancel");
    }
    setConfirmStarTarget(null);
    setStarConfirmMessage(null);
    setConfirmStarPending(false);
    setConfirmStarButtonRect(null);
  }, []);


  const handleResurfacePassedProfiles = useCallback(() => {
    if (!userId) return;
    const clearedPassedIds = new Set<string>();
    passedDiscoveryIdsRef.current = clearedPassedIds;
    setPassedDiscoveryIds(clearedPassedIds);
    void AsyncStorage.removeItem(discoveryPassedKey(userId));
    void AsyncStorage.removeItem(discoveryPassedSessionKey(userId));
    void loadRows({ force: true, silent: false });
  }, [loadRows, userId]);

  const hasLoadError = /failed to load/i.test(status || "") || inboxSyncState === "error";

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
  }, []);

  const commitGroupDetailsDraft = useCallback(async (options?: { close?: boolean; open?: boolean }) => {
    if (!groupDetails || !userId) {
      if (options?.close) setGroupDetails(null);
      return;
    }
    if ("invitePending" in groupDetails) {
      if (options?.open) onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(groupDetails.id)}&name=${encodeURIComponent(groupDetails.name)}`, "/chats?tab=groups"));
      if (options?.close) closeGroupDetails();
      return;
    }
    const chatId = groupDetails.chatId;
    const currentMemberRole = groupManagement?.members.find((member) => member.userId === userId)?.role?.toLowerCase() || "";
    const canManageGroup = groupDetails.createdBy === userId || currentMemberRole === "admin" || currentMemberRole === "creator";
    if (!canManageGroup) {
      if (options?.open) onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(chatId)}&name=${encodeURIComponent(groupDetails.chatName || "Group")}`, "/chats?tab=groups"));
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
	        if (!accessToken) throw new Error("missing_access_token");
	        if (groupDetails.createdBy && userId !== groupDetails.createdBy) throw new Error("not_authorized");
	        const uploadedCover = await uploadNativeGroupCover({ accessToken, asset: groupEditCoverDraft, chatId, userId });
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
      if (options?.open) onNavigate(appendReturnTo(`/chat-dialogue?room=${encodeURIComponent(chatId)}&name=${encodeURIComponent(savedName)}`, "/chats?tab=groups"));
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
  }, [accessToken, closeGroupDetails, groupDescriptionEdit, groupDetails, groupEditCoverDraft, groupLocationEdit, groupManagement?.members, groupNameEdit, groupPetFocusEdit, onNavigate, patchGroupEverywhere, userId]);

  const bannerInviteGroups = invitedExploreGroups.filter((group) => !dismissedInviteBannerIds.has(group.inviteId || group.id));
  const firstPendingGroupInvite = bannerInviteGroups[0] ?? null;
  const visibleExploreGroups = sortExploreGroups(
    [...invitedExploreGroups, ...exploreGroups].filter((group) => !hiddenExploreGroupIds.has(group.id)),
    groupExploreSort,
    viewerPetSignals,
    viewerLocationWords,
  );

  return (
    <View style={styles.screen}>
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
                ? <ActivityIndicator color={huddleColors.subtext} size="small" />
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
              <Pressable accessibilityLabel="Discover" accessibilityRole="button" onPress={() => handleTopTabPress("discover")} style={[nativeModalStyles.appTopSegmentButton, styles.topToggleSegment, topTab === "discover" && styles.topToggleSegmentActive]}>
                <TopSegmentGlassLayer visible={topTab === "discover"} />
                <DiscoverPillIcon color={topTab === "discover" ? huddleColors.onPrimary : huddleColors.mutedText} size={20} />
              </Pressable>
              <Pressable accessibilityLabel="Community" accessibilityRole="button" onPress={() => handleTopTabPress("community")} style={[nativeModalStyles.appTopSegmentButton, styles.topToggleSegment, topTab === "community" && styles.topToggleSegmentActive]}>
                <TopSegmentGlassLayer visible={topTab === "community"} />
                <CommunityPillIcon color={topTab === "community" ? huddleColors.onPrimary : huddleColors.mutedText} size={20} />
              </Pressable>
              <Pressable accessibilityLabel="Chats" accessibilityRole="button" onPress={() => handleTopTabPress("chats")} style={[nativeModalStyles.appTopSegmentButton, styles.topToggleSegment, topTab === "chats" && styles.topToggleSegmentActive]}>
                <TopSegmentGlassLayer visible={topTab === "chats"} />
                <Feather color={topTab === "chats" ? huddleColors.onPrimary : huddleColors.mutedText} name="message-circle" size={20} />
                {topTab !== "chats" && unreadTotal > 0 ? <View style={styles.toggleUnreadBadge}><Text style={styles.toggleUnreadText}>{unreadTotal > 99 ? "99+" : unreadTotal}</Text></View> : null}
                {topTab === "chats" && unreadTotal > 0 ? <View style={styles.toggleUnreadDot} /> : null}
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
                </View>
                {searchQuery ? (
                  <Pressable accessibilityLabel="Clear search" onPress={() => setSearchQuery("")} style={styles.searchClear}>
                    <Feather color={huddleColors.iconMuted} name="x" size={16} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View style={styles.chatTabsRow}>
              <View style={styles.mainTabRail}>
                {visibleMainTabs.map((tab) => {
                  const active = tab.key === mainTab;
                  return (
                    <Pressable key={tab.key} onPress={() => handleMainTabPress(tab.key)} style={nativeModalStyles.appUnderlineTab}>
                      <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>{tab.label}</Text>
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
        <Reanimated.View pointerEvents={topTab === "discover" ? "auto" : "none"} style={[StyleSheet.absoluteFill, discoverTabStyle]}>
          <ScrollView
            alwaysBounceVertical
            contentContainerStyle={[styles.content, styles.discoverContent, { paddingBottom: screenInsets.bottom + huddleSpacing.x10 + huddleSpacing.x8 }]}
            scrollEnabled={!discoverySwipeActive}
            showsVerticalScrollIndicator={false}
          >
            {status ? <DiscoverToast message={status} onDismiss={() => setStatus(null)} /> : null}
            {discoverRequestSettled && !loading && discoverStatus === "age_blocked" ? <NativeChatsEmptyState body={DISCOVER_AGE_GATE_COPY} image={discoverAgeGateImage} /> : null}
            {discoverRequestSettled && !loading && discoverStatus === "location_required" ? (
              <NativeChatsEmptyState
                body={discoverLocationPermission.canAskAgain
                  ? "Huddle uses your location to show nearby people, groups, and map pins."
                  : "Location is off for Huddle. Open Settings, tap Location, then choose While Using the App."}
                buttonLabel={discoverLocationPermission.canAskAgain ? "Enable Location" : "Open Huddle Settings"}
                onPress={() => { void handleDiscoverEnableLocation(); }}
              />
            ) : null}
            {discoverRequestSettled && !loading && discoverStatus === "error" ? (
              <NativeChatsEmptyState body="Discover could not load. Pull to retry." />
            ) : null}
            {discoverRequestSettled && !loading && discoveryQuotaLocked ? <NativeChatsEmptyState body={discoveryQuotaCopy} buttonLabel={effectiveTier === "free" ? "Upgrade to Huddle+" : "Upgrade to Gold"} onPress={() => onNavigate("/premium")} title="Discover limit reached" /> : null}
            {renderDiscoverEndState ? <DiscoveryEndState passedCount={passedDiscoveryIds.size} quotaReached={discoveryQuotaReached} onResurface={handleResurfacePassedProfiles} onExpandSearch={() => setFilterOpen(true)} /> : null}
            {/* Loading-shell: card+deck placeholder before the first profile lands. Suppressed once any other terminal state owns the surface. */}
            {discoverStatus !== "age_blocked"
              && discoverStatus !== "location_required"
              && discoverStatus !== "error"
              && !discoveryQuotaLocked
              && !renderDiscoverEndState
              && !currentDiscoveryProfile
              && (loading || !discoverRequestSettled || discoverRefreshing) ? (
                <View style={styles.discoveryStack}>
                  <DiscoveryCardShell layer={3} />
                  <DiscoveryCardShell layer={2} />
                  <DiscoveryCardShell layer={1} />
                  <DiscoveryCardShell layer={0} />
                </View>
              ) : null}
            {discoverStatus === "ready" && !discoveryQuotaReached && currentDiscoveryProfile ? (
              <View style={styles.discoveryStack}>
                {discoveryDeckProfiles.map((profile, index) => {
                  const profileChips: string[] = [];
                  if (effectiveTier === "gold" && filters.activeOnly) profileChips.push("Active today");
                  if (effectiveTier === "gold" && filters.whoWavedAtMe) profileChips.push("Waved at you");
                  const isLastCard = discoverProfiles.length === 1;
                  return <DiscoveryProfileCard key={profile.id} busy={discoverBusyId === profile.id} chips={profileChips} index={index} isDeepestQueued={index > 0 && index === discoveryDeckProfiles.length - 1} isLast={isLastCard} liftKind={liftingProfile?.id === profile.id ? liftingProfile.kind : null} profile={profile} swipeXSV={discoverySwipeXSV} onPass={handlePassDiscovery} onProfileTap={handleDiscoveryProfileTap} onStar={handleStarDiscovery} onSwipePhaseChange={setDiscoverySwipeActive} onWave={handleWaveDiscovery} />;
                })}
              </View>
            ) : null}
          </ScrollView>
        </Reanimated.View>

        {/* ── COMMUNITY ── */}
        <Reanimated.View pointerEvents={topTab === "community" ? "auto" : "none"} style={[StyleSheet.absoluteFill, communityTabStyle]}>
          <ScrollView
            alwaysBounceVertical
            contentContainerStyle={[styles.content, { paddingBottom: screenInsets.bottom + huddleSpacing.x10 + huddleSpacing.x8 }]}
            showsVerticalScrollIndicator={false}
          >
            {status ? <View style={styles.statusBanner}><Feather color={huddleColors.blue} name="info" size={16} /><Text style={styles.statusText}>{status}</Text></View> : null}
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
                {visibleExploreGroups.map((group) => <ExploreGroupCard key={group.id} group={group} onHide={(groupId) => setHiddenExploreGroupIds((current) => new Set(current).add(groupId))} onOpen={openExploreGroupOrInvitePrompt} />)}
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
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={huddleColors.blue} onRefresh={handleRefresh} />}
            scrollEventThrottle={120}
            showsVerticalScrollIndicator={false}
          >
            {status ? <View style={styles.statusBanner}><Feather color={huddleColors.blue} name="info" size={16} /><Text style={styles.statusText}>{status}</Text></View> : null}
            {loading ? <View style={styles.skeletonList}><NativeChatRowSkeleton /><NativeChatRowSkeleton /><NativeChatRowSkeleton /><NativeChatRowSkeleton /><NativeChatRowSkeleton /></View> : null}
            {!loading && mainTab === "friends" ? <MatchedRail rows={avatarOnlyMatches} onOpen={handleOpenRow} /> : null}
            {!loading && !hasLoadError && mainTab === "service" && visibleRows.length === 0 ? <NativeServiceChatsEmptyState /> : null}
            {!loading && !hasLoadError && mainTab !== "service" && visibleRows.length === 0 && !(mainTab === "friends" && avatarOnlyMatches.length > 0) && !(mainTab === "groups" && invitedExploreGroups.length > 0) ? <NativeChatsEmptyState body={mainTab === "groups" ? "Better in a pack! Create or join a group to start coordinating local meetups." : "Meet your friends on the Social and send a star to start a chat!"} groupAligned={mainTab === "groups"} image={emptyChatImage} /> : null}
            {!loading && visibleRows.length > 0 ? <View style={styles.list}>{visibleRows.map((row) => mainTab === "groups" ? <NativeGroupChatRow key={`${row.roomType}:${row.chatId}`} currentUserId={userId} row={row} onManage={openManagedGroup} onOpenDetails={openManagedGroup} onPress={handleOpenRow} /> : <NativeChatRow key={`${row.roomType}:${row.chatId}`} row={row} userId={userId} onAvatarPress={handleAvatarProfilePress} onDelete={setPendingDeleteRow} onPress={handleOpenRow} />)}</View> : null}
          </ScrollView>
        </Reanimated.View>

      </View>
      {/* Invisible bottom-area swipe catcher — sits ABOVE the global NativeBottomNav (which itself
          floats at insets.bottom+8 with height navHeight=64). Captures committed horizontal flicks
          and cycles the top segment. Vertical motion fails the gesture so ScrollView still scrolls;
          taps in the strip are inert (no committed horizontal motion → no claim → no tab change). */}
      <GestureDetector gesture={bottomSwipeGesture}>
        <View
          pointerEvents="box-only"
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
	      <DiscoveryFilterModal effectiveTier={effectiveTier} filters={filters} filterRow={filterRow} open={filterOpen} onApply={(nextFilters) => { setFilters(nextFilters); setFilterOpen(false); setFilterRow(null); }} onClose={() => { setFilterOpen(false); setFilterRow(null); }} onLockedFilter={requestFilterTier} onSetFilterRow={setFilterRow} />
      <NativeDiscoverUpgradeModal onClose={() => setPremiumTier(null)} onUpgrade={() => onNavigate("/premium")} tier={premiumTier} />
      <GroupDetailsModal
        currentUserId={userId}
        detailsErrors={groupDetailsErrors}
        descriptionEdit={groupDescriptionEdit}
        editCover={groupEditCoverDraft}
        group={groupDetails}
        management={groupManagement}
        managementError={groupManagementError}
        managementLoading={groupManagementLoading}
        countryLabel={groupCountryDraft}
        locationEdit={groupLocationEdit}
        nameEdit={groupNameEdit}
        petFocusEdit={groupPetFocusEdit}
        selectableMembers={selectableMembers}
        onChangeLocationEdit={(value) => {
          setGroupLocationEdit(value);
          if (groupDetailsErrors.location && value.trim()) setGroupDetailsErrors((current) => ({ ...current, location: false }));
        }}
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
        onPickCover={pickGroupEditCover}
        onBlockMember={(member) => {
          if (!userId) return;
	          void nativeExactTokenRpc("block_user", { p_blocked_id: member.userId }, accessToken)
            .then(({ error }) => {
              if (error) throw error;
              invalidateNativeDiscoveryRelationshipCache(userId);
              setStatus(`${member.name || "Member"} blocked.`);
            })
            .catch(() => setStatus("Unable to block member right now."));
        }}
        onInviteMembers={(group, ids) => {
          if (!userId) return;
          const chatId = "chatId" in group ? group.chatId : group.id;
          const name = ("chatName" in group ? group.chatName : group.name) || "Group";
	          void inviteNativeGroupMembers({ chatId, chatName: name, inviterUserId: userId, inviteUserIds: ids, accessToken }).then(() => refreshGroupManagement(chatId)).catch(() => setStatus("Unable to invite members right now."));
        }}
        onCancelInvite={(group, invite) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
	          void cancelNativeGroupInvite({ chatId, inviteId: invite.id, accessToken })
            .then(() => {
              setGroupManagement((current) => current ? { ...current, pendingInvites: current.pendingInvites.filter((item) => item.id !== invite.id) } : current);
              setStatus("Invite canceled.");
            })
            .catch(() => setStatus("Unable to cancel invite right now."));
        }}
        onLeaveGroup={async (group) => {
          try {
            if (!userId) return;
            const chatId = "chatId" in group ? group.chatId : group.id;
	            await sendNativeChatMessage({ roomId: chatId, senderId: userId, content: `${selfMatchProfile.name || "Someone"} left the group.`, accessToken });
	            await removeNativeGroupMember({ chatId, userId, accessToken });
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
        onOpenMemberProfile={openGroupMemberProfile}
        onReportMember={(member) => setGroupMemberReportTarget(member)}
        onRemoveMember={(group, memberId) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
	          void removeNativeGroupMember({ chatId, userId: memberId, accessToken }).then(() => refreshGroupManagement(chatId)).catch(() => setStatus("Unable to remove member right now."));
        }}
        onRequestAction={(group, request, action) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
	          return updateNativeGroupJoinRequest({ chatId, requestId: request.id, userId: request.userId, action, accessToken }).then(() => refreshGroupManagement(chatId)).catch((error) => {
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
            setGroupManagement((current) => current ? {
              ...current,
              members: current.members.map((member) => member.userId === userId ? { ...member, isMuted: muted } : member),
            } : current);
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
		      <CreateGroupModal countryLabel={groupCountryDraft} cover={groupCoverDraft} coverCropAsset={groupCoverCropTarget?.target === "create" ? groupCoverCropTarget.asset : null} creating={groupCreating} description={groupDescriptionDraft} joinMethod={groupJoinMethodDraft} location={groupLocationDraft} name={groupNameDraft} open={createGroupOpen} petFocus={groupPetFocusDraft} visibility={groupVisibilityDraft} onCancelCoverCrop={() => setGroupCoverCropTarget(null)} onChangeDescription={setGroupDescriptionDraft} onChangeJoinMethod={setGroupJoinMethodDraft} onChangeLocation={setGroupLocationDraft} onChangeName={setGroupNameDraft} onChangePetFocus={setGroupPetFocusDraft} onChangeVisibility={setGroupVisibilityDraft} onClose={closeCreateGroupModal} onEditCover={() => editPendingGroupCover("create", groupCoverDraft)} onPickCover={pickGroupCover} onRemoveCover={() => setGroupCoverDraft(null)} onSaveCoverCrop={saveGroupCoverCrop} onSubmit={handleCreateGroup} />
      <ConfirmDeleteModal row={pendingDeleteRow} onCancel={() => setPendingDeleteRow(null)} onConfirm={confirmDeleteConversation} />
      <MatchModal modal={matchModal} onClose={closeMatchModal} onQuickHello={() => void sendMatchQuickHello()} quickHello={matchQuickHello} self={selfMatchProfile} sending={matchSending} setQuickHello={setMatchQuickHello} />
      <NativePublicProfileModal accessToken={accessToken ?? null} currentUserId={userId} hideActions={profileSheetSource === "discover"} hideMatchedActions={profileSheetSource !== "discover"} sessionKey={sessionKey} showStar={profileSheetSource === "discover"} showWave={profileSheetSource === "discover"} onStar={handleProfileSheetStar} onWave={handleProfileSheetWave} onClose={() => setProfileSheetUserId(null)} onNavigate={onNavigate} open={Boolean(profileSheetUserId)} userId={profileSheetUserId} />
      <Modal animationType="slide" presentationStyle="overFullScreen" transparent visible={carerProfileOpen} onRequestClose={() => setCarerProfileOpen(false)}>
        <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
          <Pressable accessibilityLabel="Close carer profile" accessibilityRole="button" onPress={() => setCarerProfileOpen(false)} style={StyleSheet.absoluteFill} />
          <AppModalCard fullHeight>
            <View style={styles.carerProfileHeader}>
              <Text numberOfLines={1} style={nativeModalStyles.appModalSheetTitle}>Pet Carer Profile</Text>
              <AppModalIconButton accessibilityLabel="Close carer profile" onPress={() => setCarerProfileOpen(false)}>
                <Feather color={huddleColors.text} name="x" size={24} />
              </AppModalIconButton>
            </View>
            <AppModalScroll>
              {carerProfileError ? (
                <View style={styles.carerProfileState}><Text style={styles.carerProfileStateText}>{carerProfileError}</Text></View>
              ) : carerProfile ? (
                <NativeCarerProfileContent provider={carerProfile} />
              ) : carerProfileLoading ? (
                <View style={styles.carerProfileState}><NativeLoadingState variant="inline" /></View>
              ) : null}
            </AppModalScroll>
          </AppModalCard>
        </View>
      </Modal>
      <NativeSocialReportModal
        currentUserId={userId}
        onClose={() => setGroupMemberReportTarget(null)}
        onNotice={setStatus}
        open={Boolean(groupMemberReportTarget)}
        source="Group Chat"
        sourceOrigin="friends chats"
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

function ExploreGroupCard({ group, onHide, onOpen }: { group: NativeExploreGroup; onHide: (groupId: string) => void; onOpen: (group: NativeExploreGroup) => void }) {
  const memberLabel = `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`;
  const ctaLabel = group.invitePending ? "You're invited" : group.requested ? "Requested" : group.joinMethod === "instant" ? "Join" : "Request to join";
  return (
    <View style={nativeModalStyles.appContentCard}>
      <Pressable accessibilityLabel={`Open ${group.name} details`} onPress={() => onOpen(group)} style={styles.exploreCover}>
        <ResilientAvatarImage fallback={<View style={styles.exploreCoverFallback} />} style={styles.exploreCoverImage} uri={group.avatarUrl} />
        <View style={styles.exploreScrim} />
        <Text style={styles.exploreMembers}>{memberLabel}</Text>
        <Pressable accessibilityLabel={`Hide ${group.name}`} onPress={(event) => { event.stopPropagation(); onHide(group.id); }} hitSlop={8} style={styles.exploreHideButton}>
          <Feather color={huddleColors.blue} name="x" size={18} />
        </Pressable>
        <View style={styles.exploreOverlay}>
          <Text numberOfLines={1} style={styles.exploreTitle}>{group.name}</Text>
          {group.locationLabel ? <View style={styles.exploreMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={styles.exploreMeta}>{group.locationLabel}</Text></View> : null}
          {group.petFocus.length > 0 ? <View style={styles.exploreChips}>{group.petFocus.slice(0, 4).map((tag) => <Text key={tag} style={styles.exploreChip}>{tag}</Text>)}</View> : null}
        </View>
      </Pressable>
      <View style={styles.exploreBody}>
        {group.description ? <Text numberOfLines={2} style={styles.exploreDescription}>{group.description}</Text> : null}
        <Pressable disabled={group.requested} onPress={() => onOpen(group)} style={[nativeModalStyles.appPrimaryPillButton, group.invitePending && styles.exploreCtaInvite, group.requested && styles.exploreCtaDisabled]}>
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
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.groupDetailsEventBoundary}>
        <AppBottomSheet onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Group invites</Text>
            <AppModalIconButton accessibilityLabel="Close group invites" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={22} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
		          <AppBottomSheetScroll>
            <View style={styles.inviteInboxList}>
              {groups.map((group) => {
                const decision = decisions[group.id];
                return (
                  <View key={group.id} style={styles.inviteInboxRow}>
                    <Pressable accessibilityLabel={`Open ${group.name} invite`} onPress={() => onOpenGroup(group)} style={styles.inviteInboxIdentity}>
                      <View style={styles.inviteInboxAvatar}>
                        <ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={22} />} style={styles.inviteInboxAvatarImage} uri={group.avatarUrl} />
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
	            <AppModalIconButton accessibilityLabel="Close filters" onPress={onClose}>
	              <Feather color={huddleColors.text} name="x" size={22} />
	            </AppModalIconButton>
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
      <Text style={styles.filterTierPillText}>{isGold ? "Gold" : "Huddle+"}</Text>
    </View>
  );
}

function NativeDiscoverUpgradeModal({ onClose, onUpgrade, tier }: { onClose: () => void; onUpgrade: () => void; tier: StarUpgradeTier | null }) {
  const insets = useSafeAreaInsets();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  if (!tier) return null;
  const isGold = tier === "gold";
  const plan = quotaConfig.stripePlans[tier];
  const caps = quotaConfig.capsByTier[tier];
  const themeColor = isGold ? huddleColors.membershipUpgradeGold : huddleColors.membershipUpgradePlus;
  const monthly = plan.monthly.amount;
  const annual = plan.annual.amount;
  const annualPerMonth = annual / 12;
  const displayPrice = billing === "annual" ? annualPerMonth : monthly;
  const discountPct = Math.round((1 - annualPerMonth / monthly) * 100);
  const features: Array<{ icon: keyof typeof Feather.glyphMap; title: string; subtitle: string }> = isGold ? [
    { icon: "globe", title: "Max Discovery", subtitle: "Keep discovering without the usual limits." },
    { icon: "trending-up", title: "Top Profile Boost", subtitle: "Priority placement in Discover and Care." },
    { icon: "star", title: `${caps.starsPerMonth} Stars / month`, subtitle: "Your fastest way to connect." },
    { icon: "radio", title: `Broadcasts · ${caps.broadcastRadiusKm}km · ${caps.broadcastDurationHours}h`, subtitle: "Your widest reach, for even longer." },
    { icon: "sliders", title: "All Filters", subtitle: "Every filter unlocked. Less noise, better matches." },
    { icon: "video", title: "Video Uploads", subtitle: "Gold exclusive." },
    { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
  ] : [
    { icon: "users", title: "Open Discovery", subtitle: "Double the chances. Better matches." },
    { icon: "trending-up", title: "Profile Boost", subtitle: "Get seen earlier in Discover and Care." },
    { icon: "star", title: `${caps.starsPerMonth} Stars / month`, subtitle: "Reach out without waiting." },
    { icon: "radio", title: `Broadcasts · ${caps.broadcastRadiusKm}km · ${caps.broadcastDurationHours}h`, subtitle: "Reach more nearby members for longer." },
    { icon: "globe", title: "Advanced Filters", subtitle: "Sharper search. Better fit." },
    { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
  ];
  return (
    <Modal presentationStyle="overFullScreen" animationType="fade" transparent visible={Boolean(tier)} onRequestClose={onClose}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, { paddingTop: insets.top + huddleSpacing.x6, paddingBottom: insets.bottom }]}>
        <Pressable accessibilityLabel="Close membership" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Pressable style={[styles.upgradeCard, { backgroundColor: themeColor }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.upgradeBillingRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: billing === "monthly" }} onPress={() => setBilling("monthly")} style={[styles.upgradeBillingTab, billing !== "monthly" && styles.upgradeBillingTabInactive]}>
              <Text style={[styles.upgradeBillingText, billing !== "monthly" && { color: themeColor }]}>Monthly</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: billing === "annual" }} onPress={() => setBilling("annual")} style={[styles.upgradeBillingTab, billing !== "annual" && styles.upgradeBillingTabInactive]}>
              <Text style={[styles.upgradeBillingText, billing !== "annual" && { color: themeColor }]}>Annually</Text>
              {billing !== "annual" ? <Text style={[styles.upgradeDiscountBadge, { backgroundColor: themeColor }]}>-{discountPct}%</Text> : null}
            </Pressable>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.upgradeBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.upgradeHeadline}>{isGold ? "Upgrade to Huddle Gold" : "Upgrade to Huddle+"}</Text>
            <Text style={styles.upgradeSubheadline}>{isGold ? "Activate now to send stars and become a top profile in your area and find more connections!" : "Activate now to send stars and find 2x more connections!"}</Text>
            <Text style={styles.upgradePrice}>USD${displayPrice.toFixed(2)}<Text style={styles.upgradePriceUnit}> /mo</Text></Text>
            {billing === "annual" ? <Text style={styles.upgradeAnnualNote}>USD${annual.toFixed(2)} billed yearly</Text> : null}
            <View style={styles.upgradeDivider} />
            <View style={styles.upgradeFeatureList}>
              {features.map((feature) => (
                <View key={feature.title} style={styles.upgradeFeatureRow}>
                  <Feather color={huddleColors.onPrimary} name={feature.icon} size={22} />
                  <View style={styles.upgradeFeatureCopy}>
                    <Text style={styles.upgradeFeatureTitle}>{feature.title}</Text>
                    <Text style={styles.upgradeFeatureSubtitle}>{feature.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={onUpgrade} style={styles.upgradeCta}>
              <Text style={[styles.upgradeCtaText, { color: themeColor }]}>{isGold ? "Upgrade to Huddle Gold" : "Upgrade to Huddle+"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.upgradeLaterButton}>
              <Text style={styles.upgradeLaterText}>Maybe later</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </View>
    </Modal>
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
  currentUserId,
  detailsErrors,
  descriptionEdit,
  editCover,
  group,
  hideOpenChatButton = false,
  countryLabel,
  locationEdit,
  management,
  managementError,
  managementLoading,
  nameEdit,
  petFocusEdit,
  onChangeDescriptionEdit,
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
  onReportMember,
  onRemoveMember,
  onRequestAction,
  onRemoveGroup,
  onSaveDetails,
  onToggleMute,
  selectableMembers,
}: {
  currentUserId: string | null;
  countryLabel: string | null;
  detailsErrors: GroupDetailsErrors;
  descriptionEdit: string;
  editCover: PendingGroupCover | null;
  group: NativeExploreGroup | NativeChatInboxRow | null;
  hideOpenChatButton?: boolean;
  management: NativeGroupManagementSnapshot | null;
  managementError: boolean;
  managementLoading: boolean;
  nameEdit: string;
  locationEdit: string;
  petFocusEdit: string[];
  selectableMembers: Array<{ id: string; name: string; avatarUrl: string | null; isVerified: boolean; socialId?: string | null }>;
  onChangeDescriptionEdit: (value: string) => void;
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
  const groupDetailsScrollRef = useRef<ScrollView | null>(null);
  const groupDetailsFieldLayoutsRef = useRef<Record<string, { height: number; y: number }>>({});
  const [groupDetailsKeyboardHeight, setGroupDetailsKeyboardHeight] = useState(0);
  const [groupDetailsFooterHeight, setGroupDetailsFooterHeight] = useState(0);
  const activeGroupId = group ? "chatId" in group ? group.chatId : group.id : null;
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
      void fetchNativeLocationSuggestions(trimmed, countryLabel)
        .then((results) => {
          if (!active) return;
          setLocationSuggestions(results);
          setLocationSearchOpen(results.length > 0);
        })
        .catch(() => {
          if (active) setLocationSuggestions([]);
        })
        .finally(() => {
          if (active) setLocationSearching(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [countryLabel, locationEdit]);
  useEffect(() => {
    if (inviteEditorOpen) scrollGroupDetailsFieldIntoView("invite", huddleSpacing.x9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteEditorOpen, inviteSearchResults.length, inviteSearching]);
  useEffect(() => {
    if (locationSearchOpen) scrollGroupDetailsFieldIntoView("location", huddleSpacing.x9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSearchOpen, locationSuggestions.length, locationSearching]);
  if (!group) return null;
  const isExplore = "invitePending" in group;
  const isJoinedGroup = !isExplore;
  const currentMemberRole = management?.members.find((member) => member.userId === currentUserId)?.role?.toLowerCase() || "";
  const currentMemberMuted = management?.members.find((member) => member.userId === currentUserId)?.isMuted === true;
  const canManage = Boolean(isJoinedGroup && currentUserId && (("createdBy" in group && group.createdBy === currentUserId) || currentMemberRole === "admin" || currentMemberRole === "creator"));
  const groupDetailsEditingActive = groupDetailsKeyboardHeight > 0 || groupNameFocused || groupDescriptionFocused || groupLocationFocused || groupInviteFocused || groupPetOtherFocused;
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
  const scrollGroupDetailsFieldIntoView = (target: string, extraOffset = 0) => {
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
  };
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
      <RNKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close group details" onPress={onClose} style={StyleSheet.absoluteFill} />
	        <View style={styles.groupDetailsEventBoundary}>
			        <AppBottomSheet onClose={onClose} style={styles.groupDetailsSheet}>
	          <AppBottomSheetHeader>
            {isJoinedGroup ? (
              <View style={styles.groupHeaderActionCluster}>
                <Pressable disabled={groupActionBusy === "mute"} onPress={() => { void toggleGroupMute(); }} style={({ pressed }) => [styles.groupHeaderActionButton, pressed && styles.pressed, groupActionBusy === "mute" && styles.actionDisabled]}>
                  <Feather color={huddleColors.text} name={currentMemberMuted ? "bell" : "bell-off"} size={17} />
                </Pressable>
	                <Pressable onPress={() => setGroupActionConfirm(canManage ? "remove" : "leave")} style={({ pressed }) => [styles.groupHeaderActionButton, styles.groupHeaderDangerButton, pressed && styles.pressed]}>
	                  <Feather color={huddleColors.validationRed} name="log-out" size={17} />
	                </Pressable>
	              </View>
            ) : null}
            <View style={styles.groupDetailsHeaderSpacer} />
            <AppModalIconButton accessibilityLabel="Close" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
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
                        <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: editCover.uri }} style={styles.createAvatarImage} transition={120} />
                      ) : avatarUrl ? (
                        <ResilientAvatarImage fallback={<Feather color={huddleColors.blue} name="users" size={26} />} style={styles.createAvatarImage} uri={avatarUrl} />
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
	                          <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: editCover.uri }} style={nativeModalStyles.appGroupHeroImage} transition={120} />
                        ) : avatarUrl ? (
                          <ResilientAvatarImage fallback={<View style={nativeModalStyles.appGroupHeroFallback} />} style={nativeModalStyles.appGroupHeroImage} uri={avatarUrl} />
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
	                        <AppModalField
	                          accessibilityLabel="Group description"
	                          error={detailsErrors.description}
                            focused={groupDescriptionFocused}
                          multiline
                          onBlur={() => setGroupDescriptionFocused(false)}
                          onChangeText={onChangeDescriptionEdit}
                          onFocus={() => { setGroupDescriptionFocused(true); scrollGroupDetailsFieldIntoView("description", huddleSpacing.x8); }}
                          placeholder="Tell people what this group is about and how you usually meet."
                          style={styles.createDescriptionField}
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
	                    <AppModalField
	                      accessibilityLabel="Group location"
	                      error={detailsErrors.location}
                      focused={groupLocationFocused}
                      onBlur={() => setGroupLocationFocused(false)}
                      onChangeText={(value) => {
                        onChangeLocationEdit(value);
                        setLocationSearchOpen(value.trim().length >= 2);
                      }}
                      onFocus={() => {
                        setGroupLocationFocused(true);
                        if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                        scrollGroupDetailsFieldIntoView("location", huddleSpacing.x8);
                      }}
                      placeholder="Search district or neighbourhood"
                      style={styles.createLocationField}
                      value={locationEdit}
	                    />
	                    {detailsErrors.location ? <Text style={styles.createErrorText}>Add a group location to continue.</Text> : null}
                    {locationSearchOpen && (locationSuggestions.length > 0 || locationSearching) ? (
                      <View style={styles.locationSuggestionCard}>
                        {locationSearching && locationSuggestions.length === 0 ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                        {locationSuggestions.map((suggestion) => (
                          <Pressable
                            key={`${suggestion.label}:${suggestion.lat}:${suggestion.lng}`}
                            onPress={() => {
                              const selectedLocation = suggestion.district || suggestion.label;
                              onChangeLocationEdit(selectedLocation);
                              setLocationSearchOpen(false);
                            }}
                            style={styles.locationSuggestionRow}
                          >
                            <Text style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>
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
	              {editCover?.uri ? <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: editCover.uri }} style={nativeModalStyles.appGroupHeroImage} transition={120} /> : <ResilientAvatarImage fallback={<View style={nativeModalStyles.appGroupHeroFallback} />} style={nativeModalStyles.appGroupHeroImage} uri={avatarUrl} />}
              <View style={nativeModalStyles.appGroupHeroTopScrim} />
              <View style={nativeModalStyles.appGroupHeroBottomScrim} />
	              <Text style={nativeModalStyles.appGroupHeroMembers}>{memberLabel}</Text>
              {isJoinedGroup && canManage ? (
                <Pressable accessibilityLabel={editCover ? "Save group avatar" : "Change group avatar"} onPress={editCover ? onSaveDetails : onPickCover} style={styles.heroOverlayAction}>
                  <Feather color={huddleColors.onPrimary} name={editCover ? "save" : "camera"} size={18} />
                </Pressable>
              ) : null}
              <View style={nativeModalStyles.appGroupHeroCopy}>
                <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroTitle}>{name}</Text>
                {(canManage ? locationEdit : locationLabel) ? <View style={nativeModalStyles.appGroupHeroMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={nativeModalStyles.appGroupHeroMeta}>{canManage ? locationEdit : locationLabel}</Text></View> : null}
                {previewPetFocus.length > 0 ? (
                  <View style={nativeModalStyles.appGroupHeroChips}>
                    {previewPetFocus.slice(0, 4).map((tag) => <Text key={tag} style={nativeModalStyles.appGroupHeroChip}>{tag}</Text>)}
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
                          </View>
                          {inviteSearch ? (
                            <Pressable accessibilityLabel="Clear invite search" onPress={() => setInviteSearch("")} style={styles.searchClear}>
                              <Feather color={huddleColors.iconMuted} name="x" size={16} />
                            </Pressable>
                          ) : null}
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
	                      {management.mediaUrls.map((url) => <ExpoImage key={url} cachePolicy="memory-disk" contentFit="cover" source={{ uri: url }} style={nativeModalStyles.appGroupMediaThumb} transition={120} />)}
	                    </ScrollView>
                    </View>
	                ) : null}
              </View>
            ) : null}
            {isExplore ? (
              <View style={styles.exploreMembersSection}>
                <Text style={styles.sectionLabel}>Members</Text>
                {managementLoading ? <Text style={nativeModalStyles.appModalMutedBody}>Loading members...</Text> : managementError ? <Text style={nativeModalStyles.appModalMutedBody}>Couldn't load members. Pull to refresh and try again.</Text> : sortedMembers.length ? sortedMembers.map((member) => {
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
	              {isExplore ? (
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
                      <AppModalButton onPress={onSaveDetails}><Text style={styles.modalPrimaryLabel}>Save</Text></AppModalButton>
                    ) : (
                      <AppModalActionRow>
                        <AppModalButton variant="secondary" onPress={() => onOpenChat(group)}><Text style={styles.modalSecondaryLabel}>Open Group Chat</Text></AppModalButton>
                        <AppModalButton onPress={onSaveDetails}><Text style={styles.modalPrimaryLabel}>Save</Text></AppModalButton>
                      </AppModalActionRow>
                    )
	                ) : (
	                  <AppModalButton onPress={() => onOpenChat(group)}><Text style={styles.modalPrimaryLabel}>Open Group Chat</Text></AppModalButton>
	                )
	              )}
		            </AppBottomSheetFooter>
            ) : null}
			        </AppBottomSheet>
	        </View>
      </RNKeyboardAvoidingView>
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
	    </Modal>
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
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}>
        <AppBottomSheet onClose={onClose}>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Join with code</Text>
            <AppModalIconButton accessibilityLabel="Close" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={22} />
            </AppModalIconButton>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CreateGroupModal({
  countryLabel,
  cover,
  coverCropAsset,
  creating,
  description,
  joinMethod,
  location,
  name,
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
  const [petFocusOpen, setPetFocusOpen] = useState(false);
  const [petFocusOther, setPetFocusOther] = useState("");
  const [petFocusBreedOpen, setPetFocusBreedOpen] = useState<string | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [locationFocused, setLocationFocused] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [createErrors, setCreateErrors] = useState<{ cover?: boolean; description?: boolean; location?: boolean; name?: boolean }>({});
  const [createShakeAnim, triggerCreateShake] = useShakeAnimation();
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
    const nextErrors = {
      name: !name.trim(),
      location: !location.trim(),
      cover: !cover,
      description: !description.trim() || countWords(description) > GROUP_DESCRIPTION_WORD_LIMIT,
    };
    setCreateErrors(nextErrors);
    if (nextErrors.name || nextErrors.location || nextErrors.cover || nextErrors.description) {
      haptic.warning();
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
      void fetchNativeLocationSuggestions(trimmed, countryLabel)
        .then((results) => {
          if (!active) return;
          setLocationSuggestions(results);
          setLocationSearchOpen(results.length > 0);
        })
        .catch(() => {
          if (active) setLocationSuggestions([]);
        })
        .finally(() => {
          if (active) setLocationSearching(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
	  }, [countryLabel, location]);
	  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <RNKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close create group" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.createGroupEventBoundary}>
			        <AppBottomSheet onClose={onClose} style={styles.createGroupSheet}>
		          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Create a group</Text>
            <AppModalIconButton accessibilityLabel="Close" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={22} />
            </AppModalIconButton>
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
	            <View onLayout={registerCreateField("name")} style={styles.createNameRow}>
	              <Pressable accessibilityLabel="Upload group avatar" onPress={onPickCover} style={styles.createAvatarButton}>
	                {cover ? (
	                  <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: cover.uri }} style={styles.createAvatarImage} transition={120} />
	                ) : (
	                  <Feather color={huddleColors.blue} name="users" size={26} />
	                )}
	              </Pressable>
		              <View style={styles.createNameField}>
		                <AppModalField blurOnSubmit error={createErrors.name} focused={nameFocused} onBlur={() => setNameFocused(false)} onChangeText={(value) => { onChangeName(value); if (createErrors.name && value.trim()) setCreateErrors((current) => ({ ...current, name: false })); }} onFocus={() => { setNameFocused(true); centerCreateField("name"); }} onSubmitEditing={Keyboard.dismiss} placeholder="Group name" returnKeyType="done" style={[styles.createTextField, styles.groupDetailsNameField]} value={name} />
		              </View>
		            </View>
            <View>
              <Text style={styles.createLabel}>Description</Text>
              <View onLayout={registerCreateField("cover")} style={[styles.createPreviewCard, createErrors.cover ? styles.createPreviewCardError : null]}>
	                <View style={nativeModalStyles.appGroupHero}>
	                  {cover ? (
	                    <ExpoImage cachePolicy="memory-disk" contentFit="cover" source={{ uri: cover.uri }} style={nativeModalStyles.appGroupHeroImage} transition={120} />
	                  ) : (
	                    <LinearGradient colors={[huddleColors.blueSoft, huddleColors.blue]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
	                  )}
	                  {cover ? <LinearGradient colors={["rgba(9,12,25,0.32)", "rgba(9,12,25,0)"]} pointerEvents="none" style={styles.createHeroTopScrim} /> : null}
	                  {cover ? <LinearGradient colors={["rgba(9,12,25,0)", "rgba(9,12,25,0.34)", "rgba(9,12,25,0.72)"]} pointerEvents="none" style={styles.createHeroBottomScrim} /> : null}
                  <Text style={nativeModalStyles.appGroupHeroMembers}>1 member</Text>
                  <View style={nativeModalStyles.appGroupHeroCopy}>
                    <Text numberOfLines={1} style={nativeModalStyles.appGroupHeroTitle}>{name.trim() || "Your group name"}</Text>
                    {location.trim() ? <View style={nativeModalStyles.appGroupHeroMetaRow}><Feather color={huddleColors.profileCaptionPlaceholder} name="map-pin" size={12} /><Text numberOfLines={1} style={nativeModalStyles.appGroupHeroMeta}>{location.trim()}</Text></View> : null}
                    {petFocus.length > 0 ? (
                      <View style={styles.createHeroChips}>
                        {previewPetFocus.map((tag) => <Text key={tag} numberOfLines={1} style={styles.createHeroChip}>{tag}</Text>)}
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
	                  <AppModalField error={createErrors.description} focused={descriptionFocused} multiline onBlur={() => setDescriptionFocused(false)} onChangeText={(value) => { changeDescription(value); if (createErrors.description && value.trim() && countWords(value) <= GROUP_DESCRIPTION_WORD_LIMIT) setCreateErrors((current) => ({ ...current, description: false })); }} onFocus={() => { setDescriptionFocused(true); centerCreateField("description"); }} placeholder="Tell people what this group is about and how you usually meet." returnKeyType="done" style={styles.createDescriptionField} value={description} />
                </View>
              </View>
            </View>
	            <View onLayout={registerCreateField("location")}>
	              <Text style={styles.createLabel}>Location</Text>
	              <AppModalField
	                focused={locationFocused}
	                onBlur={() => setLocationFocused(false)}
	                error={createErrors.location}
	                onChangeText={(value) => {
	                  acceptedLocationRef.current = null;
	                  onChangeLocation(value);
	                  if (createErrors.location && value.trim()) setCreateErrors((current) => ({ ...current, location: false }));
	                }}
	                onFocus={() => {
	                  setLocationFocused(true);
	                  centerCreateField("location");
	                  if (locationSuggestions.length > 0) setLocationSearchOpen(true);
	                }}
	                onSubmitEditing={Keyboard.dismiss}
	                placeholder="Search district or neighbourhood"
	                returnKeyType="search"
	                style={styles.createLocationField}
	                value={location}
              />
              {locationSearchOpen && (locationSuggestions.length > 0 || locationSearching) ? (
                <View style={styles.locationSuggestionCard}>
                  {locationSearching && locationSuggestions.length === 0 ? <Text style={styles.locationSuggestionMeta}>Searching...</Text> : null}
                  {locationSuggestions.map((suggestion) => (
                    <Pressable
                      key={`${suggestion.label}:${suggestion.lat}:${suggestion.lng}`}
                      onPress={() => {
                        const selectedLocation = suggestion.district || suggestion.label;
	                        acceptedLocationRef.current = selectedLocation;
	                        onChangeLocation(selectedLocation);
	                        setLocationSearchOpen(false);
	                        Keyboard.dismiss();
	                      }}
                      style={styles.locationSuggestionRow}
                    >
                      <Text style={styles.locationSuggestionPrimary}>{suggestion.district || suggestion.label}</Text>
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
                  {petFocus.length > 0 ? petFocus.join(", ") : "Choose a focus"}
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
                        <Text style={[styles.petFocusOptionText, active ? styles.petFocusOptionTextActive : null]}>{option}</Text>
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
                    <Text style={[styles.optionCardBody, visibility === "public" && styles.optionCardBodyActive]}>Visible in Explore. Pet lovers nearby can find it.</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => { onChangeVisibility("private"); onChangeJoinMethod("request"); }} style={[nativeModalStyles.appOptionCard, visibility === "private" && nativeModalStyles.appOptionCardActive]}>
                  <View style={[styles.optionRadio, visibility === "private" && styles.optionRadioActive]} />
                  <View style={styles.optionCardCopy}>
                    <Text style={[styles.optionCardTitle, visibility === "private" && styles.optionCardTitleActive]}>Private</Text>
                    <Text style={[styles.optionCardBody, visibility === "private" && styles.optionCardBodyActive]}>Hidden. People join with a code.</Text>
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
              <Animated.View style={{ transform: [{ translateX: createShakeAnim }] }}>
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
	      </RNKeyboardAvoidingView>
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
  const trail3 = useSharedValue(0);
  const apexHapticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeHapticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (apexHapticTimerRef.current) {
      clearTimeout(apexHapticTimerRef.current);
      apexHapticTimerRef.current = null;
    }
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
      trail3.value = 0;
      return;
    }
    const isStarKind = cue.kind === "star";
    // Liftoff haptic
    haptic.selectTab();
    // Reset
    progress.value = 0;
    ringScale.value = 0;
    ringOpacity.value = 0;
    trail1.value = 0;
    trail2.value = 0;
    trail3.value = 0;
    if (isStarKind) {
      // Bottom → center (rise) → hold → top (exit). Total ~1300ms.
      progress.value = withTiming(1, { duration: 1300, easing: ReanimEasing.bezier(0.22, 1, 0.36, 1) });
      // Apex sparkle ring
      ringOpacity.value = withDelay(420, withTiming(1, { duration: 100 }));
      ringScale.value = withDelay(420, withTiming(2.6, { duration: 520, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      ringOpacity.value = withDelay(560, withTiming(0, { duration: 380 }));
      // Particle trails (staggered)
      trail1.value = withDelay(80, withTiming(1, { duration: 900, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      trail2.value = withDelay(160, withTiming(1, { duration: 900, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      trail3.value = withDelay(240, withTiming(1, { duration: 900, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      // Apex confirm haptic, completion success haptic
      apexHapticTimerRef.current = setTimeout(() => { haptic.primaryConfirm(); }, 460);
      completeHapticTimerRef.current = setTimeout(() => { haptic.success(); }, 980);
    } else {
      // Wave bubble: rise from bottom-center, peak, fade up. ~700ms.
      progress.value = withTiming(1, { duration: 700, easing: ReanimEasing.out(ReanimEasing.cubic) });
      ringOpacity.value = withDelay(180, withTiming(1, { duration: 80 }));
      ringScale.value = withDelay(180, withTiming(1.9, { duration: 380, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      ringOpacity.value = withDelay(280, withTiming(0, { duration: 320 }));
      trail1.value = withDelay(40, withTiming(1, { duration: 560, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      trail2.value = withDelay(120, withTiming(1, { duration: 560, easing: ReanimEasing.out(ReanimEasing.cubic) }));
      apexHapticTimerRef.current = setTimeout(() => { haptic.success(); }, 240);
    }
    return () => {
      if (apexHapticTimerRef.current) {
        clearTimeout(apexHapticTimerRef.current);
        apexHapticTimerRef.current = null;
      }
      if (completeHapticTimerRef.current) {
        clearTimeout(completeHapticTimerRef.current);
        completeHapticTimerRef.current = null;
      }
    };
  }, [cue, progress, ringScale, ringOpacity, trail1, trail2, trail3]);

  const isStar = cue?.kind === "star";

  // Star: rise from bottom (+screenH/2 + 80) → center → exit top (-screenH/2 - 80).
  // Scale grows then mildly recedes on exit.
  // D1: when origin coords are provided, start position is the button anchor (originDX, originDY)
  // instead of bottom-of-screen. Falls back to existing start when origin is null.
  const starStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const startY = hasOrigin ? originDY : screenH * 0.55 + 80;
    const startX = hasOrigin ? originDX : 0;
    const ty = interpolate(p, [0, 0.36, 0.55, 1], [startY, 0, 0, -screenH * 0.55 - 120], Extrapolation.CLAMP);
    const tx = interpolate(p, [0, 0.36, 1], [startX, 0, 0], Extrapolation.CLAMP);
    const sc = interpolate(p, [0, 0.36, 0.55, 1], [0.35, 1.45, 1.45, 0.55], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.06, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
    return { transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }], opacity: op };
  });

  // Wave: rises from below into center, mild scale pulse, fades upward.
  const waveStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const ty = interpolate(p, [0, 0.5, 1], [220, 0, -56], Extrapolation.CLAMP);
    const sc = interpolate(p, [0, 0.5, 0.85, 1], [0.55, 1.18, 1.0, 0.85], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.15, 0.75, 1], [0, 1, 1, 0], Extrapolation.CLAMP);
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
  const trailStyle3 = useAnimatedStyle(() => {
    const p = trail3.value;
    const ty = interpolate(p, [0, 1], [100, 100 - 225], Extrapolation.CLAMP);
    const op = interpolate(p, [0, 0.15, 0.85, 1], [0, 0.9, 0.6, 0], Extrapolation.CLAMP);
    const sc = interpolate(p, [0, 0.5, 1], [0.5, 1, 0.4], Extrapolation.CLAMP);
    return { transform: [{ translateX: -4 }, { translateY: ty }, { scale: sc }], opacity: op };
  });

  if (!cue) return null;

  return (
    <View pointerEvents="none" style={styles.sendCueOverlay}>
      {/* Apex ring — soft halo expanding outward */}
      <Reanimated.View style={[styles.sendCueRing, isStar ? styles.sendCueRingStar : styles.sendCueRingWave, ringStyle]} />
      {/* Trailing particles */}
      <Reanimated.View style={[styles.sendCueTrailDot, isStar ? styles.sendCueTrailDotStar : styles.sendCueTrailDotWave, trailStyle1]} />
      <Reanimated.View style={[styles.sendCueTrailDot, styles.sendCueTrailDotSm, isStar ? styles.sendCueTrailDotStar : styles.sendCueTrailDotWave, trailStyle2]} />
      {isStar ? (
        <Reanimated.View style={[styles.sendCueTrailDot, styles.sendCueTrailDotXs, styles.sendCueTrailDotStar, trailStyle3]} />
      ) : null}
      {/* Hero orb */}
      <Reanimated.View style={[styles.sendCueOrb, isStar ? styles.sendCueOrbStar : styles.sendCueOrbWave, isStar ? starStyle : waveStyle]}>
        <Feather color={isStar ? huddleColors.text : huddleColors.onPrimary} name={isStar ? "star" : "send"} size={isStar ? 42 : 38} />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, paddingTop: huddleLayout.headerHeight + huddleSpacing.x8, backgroundColor: huddleColors.canvas },
  controlsStack: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: huddleColors.divider, backgroundColor: huddleColors.canvas },
  // flex:1 is critical — without it, absoluteFill children have no measured height and
  // ScrollViews render at zero height or lose bottom safe-area spacing.
  tabContainer: { flex: 1 },
  skeletonList: { gap: huddleSpacing.x3 },
  content: { paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x10 + huddleSpacing.x8, gap: huddleSpacing.x3 },
  discoverContent: { flexGrow: 1 },
  topToggleRow: { minHeight: huddleSpacing.x9 - huddleSpacing.x2, flexDirection: "row", alignItems: "center", paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x5, paddingBottom: huddleSpacing.x3 },
  sideActionSlot: { width: 36, height: 36 },
  topToggleCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  topToggle: { width: "100%", maxWidth: 220, flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  topToggleSegment: { paddingHorizontal: huddleSpacing.x1 + 2 },
  // Invisible swipe catcher in the empty padding zone above the global NativeBottomNav.
  // `bottom` is set inline at render so we can use the live safe-area inset + nav height.
  bottomSwipeStrip: { position: "absolute", left: 0, right: 0, height: 72 },
  // Active pill lifts ~4px above the inactive segments and carries its own soft drop-shadow.
  // The glass body itself renders inside (BlurView + tint + highlight + inner border) — see TopSegmentGlassLayer.
  topToggleSegmentActive: { minHeight: 36, ...huddleShadows.photoControl },
  topToggleText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  topToggleTextActive: { color: huddleColors.onPrimary },
  toggleUnreadBadge: { position: "absolute", right: -4, top: -4, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x1 + 2, backgroundColor: huddleColors.primarySoftFill, borderWidth: 2, borderColor: huddleColors.canvas },
  toggleUnreadText: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.blue },
  toggleUnreadDot: { position: "absolute", right: 2, top: 2, width: 10, height: 10, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.validationRed, borderWidth: 2, borderColor: huddleColors.canvas },
  confirmStarError: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed, textAlign: "center" },
  carerProfileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3, paddingBottom: huddleSpacing.x3 },
  carerProfileState: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: huddleSpacing.x4 },
  carerProfileStateText: { fontFamily: "Urbanist-600", fontSize: huddleType.body, lineHeight: huddleType.lineNormal, color: huddleColors.mutedText, textAlign: "center" },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  // Verified Create-Group treatment: same shape/size as the # and Search circle buttons, just blue-tinted.
  // Reads as "available" without the visual clash of an outlined border.
  iconButtonSmallVerified: { backgroundColor: huddleColors.blueSoft },
  dropdownBackdrop: { flex: 1, backgroundColor: "transparent" },
  floatingDropdown: { position: "absolute", top: huddleLayout.headerHeight + 220, borderRadius: huddleFormControls.select.menuRadius, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.canvas, overflow: "hidden", ...huddleShadows.glassElevation1 },
  groupSortDropdown: { right: huddleSpacing.x5 + huddleSpacing.x6 * 2 + huddleSpacing.x2, width: 208 },
  dropdownContent: { padding: huddleFormControls.select.menuPadding },
  dropdownOption: { minHeight: huddleFormControls.select.optionMinHeight, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal, paddingVertical: huddleFormControls.select.optionPaddingVertical, borderRadius: huddleFormControls.select.optionRadius },
  dropdownOptionActive: { backgroundColor: huddleColors.primarySoftFill },
  dropdownText: { flex: 1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  checkSlot: { width: huddleFormControls.select.checkSlot },
  searchWrap: { minHeight: 44, justifyContent: "center", paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x2 },
  searchField: { height: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderRadius: 22, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x3, ...huddleShadows.glassElevation1 },
  searchInput: { flex: 1, minWidth: 0, height: 42, padding: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  searchClear: { position: "absolute", right: huddleSpacing.x3, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
  chatTabsRow: { minHeight: huddleSpacing.x8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x2 },
  mainTabRail: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: huddleSpacing.x2 },
  mainTabText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  mainTabTextActive: { color: huddleColors.blue },
  mainTabIndicator: { position: "absolute", left: huddleSpacing.x2, right: huddleSpacing.x2, bottom: 0, height: 2, borderTopLeftRadius: huddleRadii.pill, borderTopRightRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  chatActions: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 + 2 },
  iconButtonSmall: { width: huddleSpacing.x6, height: huddleSpacing.x6, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  statusBanner: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassChrome, ...huddleShadows.glassElevation1 },
  statusText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  list: { gap: 0 },
  swipeRowWrap: { overflow: "visible", borderRadius: huddleRadii.card },
  rowDeleteAction: { position: "absolute", top: 0, right: 0, bottom: 0, width: 80, borderRadius: huddleRadii.card, backgroundColor: huddleColors.validationRed, overflow: "hidden" },
  rowDeleteActionPressable: { flex: 1, alignItems: "center", justifyContent: "center" },
  webChatRow: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, ...huddleShadows.glassElevation1 },
  priorityStarRow: { borderColor: huddleColors.premiumGold, shadowColor: huddleColors.premiumGold, shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
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
  userAvatarLg: { width: 64, height: 64, borderRadius: huddleRadii.pill, borderWidth: 1, backgroundColor: huddleColors.mutedCanvas },
  userAvatarMd: { width: 48, height: 48, borderRadius: huddleRadii.pill, borderWidth: 1, backgroundColor: huddleColors.mutedCanvas },
  userAvatarVerified: { borderColor: huddleColors.blue },
  userAvatarUnverified: { borderColor: huddleColors.fieldBorderStrong },
  userAvatarImageLg: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  userAvatarImageMd: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  userAvatarVerifiedBadgeLg: { position: "absolute", right: -3, bottom: 3 },
  userAvatarVerifiedBadgeMd: { position: "absolute", right: -3, bottom: 1 },
  rowBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: huddleSpacing.x1 },
  rowTop: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  rowTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  rowTitle: { flex: 1, fontFamily: "Urbanist-700", fontSize: 16, lineHeight: 19, color: huddleColors.text },
  rowTopMeta: { flexShrink: 0, flexGrow: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: huddleSpacing.x2 },
  serviceStatusBadge: { flexShrink: 0, minHeight: 22, maxWidth: 118, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2 },
  serviceStatusBadgeBlue: { backgroundColor: huddleColors.blueSoft },
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
  memberAvatarFrame: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 2, borderColor: huddleMap.marker.friendUnverified, backgroundColor: huddleColors.primarySoftFill },
  memberAvatarFrameVerified: { borderColor: huddleColors.blue },
  memberAvatarImage: { width: "100%", height: "100%", overflow: "hidden", borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.primarySoftFill },
  memberAvatarInitial: { fontFamily: "Urbanist-700", fontSize: 14, lineHeight: 18, color: huddleColors.blue },
  memberVerifiedBadge: { position: "absolute", right: -6, bottom: -5 },
  groupMetaInlineRow: { minHeight: huddleType.helperLine, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  groupLocationInline: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupLocationRow: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupLocationText: { flex: 1, minWidth: 0, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.subtext, includeFontPadding: false },
  groupTagRow: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x1, marginTop: huddleSpacing.x1 },
  groupTag: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.primarySoftFill, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  groupDescriptionText: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  emptyCard: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x5, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, ...huddleShadows.glassElevation1 },
  webEmptyCard: { width: "100%", maxWidth: 360, minHeight: 360, alignItems: "center", justifyContent: "center", gap: huddleSpacing.x3, marginTop: huddleSpacing.x8, paddingHorizontal: huddleSpacing.x5, paddingVertical: huddleSpacing.x6, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, ...huddleShadows.glassElevation1 },
  webEmptyCardGroupAligned: { marginTop: -huddleSpacing.x4 },
  webEmptyImage: { width: "100%", height: 220 },
  webEmptyTitle: { marginTop: huddleSpacing.x2, textAlign: "center", fontFamily: "Urbanist-700", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text },
  webEmptyBody: { marginTop: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x2, textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 24, color: huddleColors.subtext },
  webEmptyBodyStrong: { fontFamily: "Urbanist-700", color: huddleColors.text },
  webEmptyButton: { minHeight: 44, minWidth: 200, marginTop: huddleSpacing.x4, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x5, backgroundColor: huddleColors.blue, ...huddleShadows.photoControl },
  webEmptyButtonText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  emptyIcon: { width: 56, height: 56, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.blueSoft },
  emptyTitle: { textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text },
  emptyBody: { textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  secondaryButton: { ...huddleButtons.base, ...huddleButtons.secondary, minHeight: 48 },
  secondaryButtonText: { ...huddleButtons.label, color: huddleColors.text },
  matchRailContent: { gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x2, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x2 },
  matchRailItem: { width: 68, height: 68, alignItems: "center", justifyContent: "center", overflow: "visible" },
  matchRailAvatar: { width: 54, height: 54, borderRadius: huddleRadii.pill, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.blue, borderWidth: 2, borderColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  matchRailImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  matchRailVerifiedBadge: { position: "absolute", right: -3, bottom: -2 },
  matchRailCarBadge: { position: "absolute", left: -1, bottom: -1, width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.premiumGold, borderWidth: 2, borderColor: huddleColors.canvas },
  discoveryStack: { position: "relative", alignItems: "center", paddingBottom: huddleSpacing.x4 },
  discoveryCardUnit: { position: "relative", alignItems: "center" },
  discoveryProfileCard: { position: "relative", zIndex: 20, width: "100%", overflow: "hidden", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.canvas, borderWidth: 0, ...huddleShadows.glassElevation1, elevation: 20 },
  // Tighten the verified check next to the name — overrides the badge wrapper to lift the glyph slightly closer to the baseline of the bold name above it.
  discoveryVerifiedTighten: { marginLeft: -2, marginBottom: 2 },
  // Loading-shell composition that sits over the shimmer fill — name/role placeholder lines + chip row.
  discoveryShellCopyStack: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, bottom: huddleSpacing.x6, gap: huddleSpacing.x2 },
  discoveryShellLineWide: { height: 18, width: "62%", borderRadius: huddleRadii.pill },
  discoveryShellLineMed: { height: 14, width: "40%", borderRadius: huddleRadii.pill },
  discoveryShellChipRow: { flexDirection: "row", gap: huddleSpacing.x2, marginTop: huddleSpacing.x1 },
  discoveryShellChip: { height: 22, width: 68, borderRadius: huddleRadii.pill },
  discoveryCardQueued: { position: "absolute", top: huddleSpacing.x2, opacity: 1 },
  discoveryPhotoWrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.blueSoft },
  discoveryQueuedPrivacyLayer: { zIndex: 17 },
  discoveryQueuedPrivacyWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.24)" },
  discoveryQueuedBottomShadow: { position: "absolute", alignSelf: "center", height: 18, borderRadius: huddleRadii.pill, backgroundColor: "transparent", shadowColor: "#42526E", shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  discoveryProfileTap: { flex: 1 },
  discoveryPhoto: { width: "100%", height: "100%", borderRadius: huddleRadii.modal },
  discoveryPhotoFallback: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.blue },
  discoveryPhotoFallbackText: { fontFamily: "Urbanist-800", fontSize: 42, lineHeight: 48, color: huddleColors.onPrimary },
  discoveryAlbumLeftZone: { position: "absolute", left: 0, top: 0, zIndex: 6, width: "33%", height: "70%" },
  discoveryAlbumRightZone: { position: "absolute", right: 0, top: 0, zIndex: 6, width: "33%", height: "70%" },
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
  discoveryTrafficStar: { backgroundColor: huddleColors.premiumGold, borderColor: huddleColors.premiumGold },
  discoveryTrafficWave: { backgroundColor: huddleColors.blue, borderColor: huddleColors.blue },
  discoveryTrafficPass: { backgroundColor: huddleColors.canvas, borderColor: huddleColors.glassBorder },
  discoveryWaveIcon: { transform: [{ rotate: "-60deg" }] },
  discoverySwipeTint: { ...StyleSheet.absoluteFillObject, zIndex: 12 },
  discoveryWaveTint: { backgroundColor: "rgba(33,71,201,0.96)" },
  // D1: gold lift halo overlay sits above content but below the orb cue. Uses premiumGold for parity.
  discoveryLiftHalo: { ...StyleSheet.absoluteFillObject, zIndex: 14, backgroundColor: huddleColors.premiumGold },
  // Discover refresh icon — bare, no background, same Feather "refresh-cw" + subtext color as Map's MapControlButton icon
  discoverRefreshButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  // D1: ConfirmStarModal Send-button wrap holds the gold pulse halo behind the button while pending.
  confirmStarSendWrap: { position: "relative", flex: 1 },
  // D1: halo sits behind the AppModalButton (zIndex below button). Slight inset so it reads as glow, not a frame.
  confirmStarSendHalo: { position: "absolute", left: -8, right: -8, top: -8, bottom: -8, zIndex: -1, borderRadius: huddleRadii.button, backgroundColor: huddleColors.premiumGold },
  // Bespoke gold Send Star button — mirrors AppModalButton height/radius (48 / pill) without modifying the locked primitive.
  confirmStarSendGoldButton: { flex: 1, height: 48, borderRadius: huddleRadii.button, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.premiumGold },
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
  waveStampText: { fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 18, letterSpacing: 2.3, color: huddleColors.blue },
  discoveryWaveStampIcon: { transform: [{ rotate: "-60deg" }] },
  discoveryHeroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "56%" },
  // Fix #4B: chip-row info-strip — extra dark scrim only over the bottom ~25% so chips have a clear band.
  discoveryChipInfoStrip: { position: "absolute", left: 0, right: 0, bottom: 0, height: "28%" },
  discoveryHeroCopy: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x9, paddingBottom: huddleSpacing.x5 },
  discoveryHeroNameRow: { maxWidth: "100%", flexDirection: "row", alignItems: "flex-end", alignSelf: "flex-start", flexWrap: "nowrap", gap: huddleSpacing.x1 },
  discoveryHeroName: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-800", fontSize: 34, lineHeight: 36, includeFontPadding: false, textTransform: "uppercase", color: huddleColors.onPrimary, textShadowColor: huddleColors.profileNameShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 14 },
  discoveryHeroPills: { marginTop: huddleSpacing.x3, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, minWidth: 0, flexWrap: "nowrap" },
  discoveryHeroRolePill: { minHeight: 34, alignSelf: "flex-start", maxWidth: "72%", flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, overflow: "hidden", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.profileHeroRoleBorder, backgroundColor: huddleColors.blueSoft, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1 },
  discoveryHeroRoleDot: { width: 6, height: 6, flexShrink: 0, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  discoveryHeroRoleText: { flexShrink: 1, minWidth: 0, fontFamily: "Urbanist-600", fontSize: 13, lineHeight: 17, color: huddleColors.blue },
  discoveryHeroTierPill: { minHeight: 32, maxWidth: "28%", flexShrink: 0, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, backgroundColor: huddleColors.profileHeroTierFill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1 },
  discoveryHeroGoldPill: { borderColor: huddleColors.profileHeroGoldBorder, backgroundColor: huddleColors.premiumGoldSoft },
  discoveryHeroPlusPill: { borderColor: huddleColors.profileHeroPlusBorder, backgroundColor: huddleColors.profileHeroPlusFill },
  discoveryHeroTierText: { flexShrink: 1, fontFamily: "Urbanist-600", fontSize: 13, lineHeight: 17, color: huddleColors.onPrimary },
  discoveryHeroGoldText: { color: huddleColors.premiumGold },
  discoveryHeroPlusText: { color: huddleColors.onPrimary },
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
  discoveryChip: { minHeight: 24, maxWidth: 92, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: huddleSpacing.x2, borderRadius: huddleRadii.pill, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.32)" },
  discoveryChipText: { flexShrink: 1, fontFamily: "Urbanist-700", fontSize: 12, lineHeight: 16, color: huddleColors.onPrimary },
  discoveryEndWrap: { width: "100%", alignItems: "center", paddingTop: huddleSpacing.x6, paddingHorizontal: huddleSpacing.x6, gap: huddleSpacing.x2 },
  discoveryEndImage: { width: 220, height: 220, marginBottom: huddleSpacing.x2 } as ImageStyle,
  discoveryEndHeadline: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text, textAlign: "center" },
  discoveryEndSub: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.subtext, textAlign: "center" },
  discoveryEndActions: { marginTop: huddleSpacing.x4, gap: huddleSpacing.x3, alignItems: "center", width: "100%" },
  discoveryEndPrimary: { minHeight: 48, width: "100%", maxWidth: 280, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue, paddingHorizontal: huddleSpacing.x5, ...huddleShadows.photoControl },
  discoveryEndPrimaryText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  discoveryEndSecondary: { minHeight: 44, width: "100%", maxWidth: 280, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldFocusRing, backgroundColor: huddleColors.canvas, paddingHorizontal: huddleSpacing.x5 },
  discoveryEndSecondaryText: { fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.blue },
  discoveryRoleBadge: { minHeight: 32, maxWidth: "100%", justifyContent: "center", paddingHorizontal: huddleSpacing.x3, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blueSoft, borderWidth: 1, borderColor: huddleColors.fieldFocusRing },
  discoveryRoleBadgeText: { flexShrink: 1, fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 17, color: huddleColors.blue },
  discoveryPetLine: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  discoveryBio: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 22, color: huddleColors.subtext },
  discoveryActionIsland: { width: 220, height: 72, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x2, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.glassChrome, borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.glassElevation1 },
  discoveryActionIslandSlot: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 30, elevation: 30 },
  discoveryActionSecondary: { width: 56, height: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.photoControl },
  discoveryActionSecondaryText: { ...huddleButtons.label, color: huddleColors.text },
  discoveryActionStar: { width: 56, height: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.premiumGold, borderWidth: 1, borderColor: huddleColors.premiumGold, ...huddleShadows.photoControl },
  discoveryStarButton: { flexGrow: 0, flexShrink: 0 },
  discoveryActionPrimary: { width: 56, height: 56, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue, borderWidth: 1, borderColor: huddleColors.blue, ...huddleShadows.photoControl },
  discoveryActionPrimaryText: { ...huddleButtons.label, color: huddleColors.onPrimary },
  actionDisabled: { opacity: 0.62 },
  exploreList: { gap: huddleSpacing.x4 },
  inviteInboxLauncher: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.fieldFocusRing, paddingHorizontal: huddleSpacing.x4, paddingVertical: huddleSpacing.x3, backgroundColor: huddleColors.blueSoft },
  inviteInboxLauncherCopy: { flex: 1, minWidth: 0 },
  inviteInboxLauncherTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  inviteInboxLauncherBody: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.subtext },
  inviteInboxList: { gap: huddleSpacing.x2 },
  inviteInboxRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1 },
  inviteInboxIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  inviteInboxAvatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.blueSoft },
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
  exploreScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: huddleColors.profileHeroScrimMid },
  exploreMembers: { position: "absolute", left: huddleSpacing.x3, top: huddleSpacing.x3, overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x1, backgroundColor: huddleColors.profileCaptionOverlay, fontFamily: "Urbanist-600", fontSize: 11, lineHeight: 14, color: huddleColors.onPrimary },
  exploreHideButton: { position: "absolute", right: huddleSpacing.x3, top: huddleSpacing.x3, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: huddleColors.glassBorder, ...huddleShadows.glassElevation1 },
  exploreOverlay: { position: "absolute", left: huddleSpacing.x4, right: huddleSpacing.x4, bottom: huddleSpacing.x3, gap: huddleSpacing.x1 },
  exploreTitle: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.onPrimary },
  exploreMetaRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  exploreMeta: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.profileCaptionPlaceholder },
  exploreChips: { flexDirection: "row", flexWrap: "wrap", gap: huddleSpacing.x1 },
  exploreChip: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2, paddingVertical: 3, backgroundColor: huddleColors.glassControl, fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.onPrimary },
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
  createGroupEventBoundary: { flex: 1, justifyContent: "flex-end" },
  createGroupSheet: { height: "82%", maxHeight: "82%", flexShrink: 0 },
  createGroupScroll: { flex: 1, minHeight: 0 },
  createGroupScrollContent: { paddingBottom: huddleSpacing.x10 },
  createSheetContent: { gap: huddleSpacing.x4, paddingBottom: huddleSpacing.x3 },
  createNameRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  createNameField: { flex: 1, minWidth: 0 },
  createAvatarButton: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.blueSoft },
  createAvatarButtonError: { ...huddleFieldStates.error },
  createAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  createFieldBlock: { gap: huddleSpacing.x1 + 2 },
  createTextField: { height: 58, minHeight: 58, maxHeight: 58, paddingHorizontal: huddleSpacing.x3, paddingTop: 0, paddingBottom: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, includeFontPadding: false, textAlignVertical: "center" },
  createLocationField: { height: 52, minHeight: 52, maxHeight: 52, paddingHorizontal: huddleSpacing.x3, paddingTop: 0, paddingBottom: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, includeFontPadding: false, textAlignVertical: "center" },
  groupDetailsNameField: { fontFamily: "Urbanist-800", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, textAlignVertical: "center" },
  createLabel: { marginBottom: huddleSpacing.x1 + 2, paddingLeft: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
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
  petFocusOptionActive: { backgroundColor: huddleColors.primarySoftFill },
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
  nativeSwitch: { width: huddleSpacing.x8, height: huddleSpacing.x5, justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x1, backgroundColor: huddleColors.mutedCanvas },
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
  groupDetailsEventBoundary: { width: "100%", justifyContent: "flex-end" },
  groupDetailsSheet: { height: "82%", maxHeight: "82%", flexShrink: 0 },
  groupDetailsScroll: { flex: 1, minHeight: 0 },
  groupHeaderActionCluster: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  groupHeaderActionButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  groupHeaderDangerButton: { backgroundColor: huddleColors.validationSoft },
  groupDetailsHeaderSpacer: { flex: 1 },
  groupDetailsScrollContent: { paddingBottom: huddleSpacing.x10 },
  groupDetailsBody: { gap: huddleSpacing.x5 },
  groupEditControls: { gap: huddleSpacing.x4 },
  groupNameEditRow: { flexDirection: "row", alignItems: "flex-end", gap: huddleSpacing.x3 },
  groupNameEditAvatar: { width: 58, height: 58, marginBottom: 1, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.blueSoft },
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
  inlineIconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.primarySoftFill },
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
  createDescriptionField: { height: 92, minHeight: 72, maxHeight: 120, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, backgroundColor: huddleButtons.ghost.backgroundColor, shadowOpacity: huddleButtons.disabled.shadowOpacity, elevation: huddleButtons.disabled.elevation, fontSize: huddleType.label, lineHeight: huddleType.labelLine },
  joinCodeContent: { alignItems: "center", gap: huddleSpacing.x4 },
  joinCodeField: { width: 176, textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h4, letterSpacing: 0 },
  joinCodeDots: { flexDirection: "row", gap: huddleSpacing.x2 },
  joinCodeDot: { width: 8, height: 8, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.divider },
  joinCodeDotActive: { backgroundColor: huddleColors.blue },
  locationSuggestionCard: { marginTop: huddleSpacing.x2, overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation1 },
  locationSuggestionRow: { minHeight: 48, justifyContent: "center", gap: 2, paddingHorizontal: huddleSpacing.x3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.divider },
  locationSuggestionPrimary: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  locationSuggestionMeta: { fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.mutedText },
  sendCueOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20, alignItems: "center", justifyContent: "center" },
  sendCueOrb: { width: 84, height: 84, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, ...huddleShadows.glassElevation2 },
  sendCueOrbWave: { backgroundColor: huddleColors.blue },
  sendCueOrbStar: { backgroundColor: huddleColors.premiumGold },
  // Ring + trail dots are absolute, centered via 50% pin + negative margin offset
  sendCueRing: { position: "absolute", top: "50%", left: "50%", width: 110, height: 110, marginTop: -55, marginLeft: -55, borderRadius: huddleRadii.pill, borderWidth: 3 },
  sendCueRingWave: { borderColor: huddleColors.blue },
  sendCueRingStar: { borderColor: huddleColors.premiumGold },
  sendCueTrailDot: { position: "absolute", top: "50%", left: "50%", width: 10, height: 10, marginTop: -5, marginLeft: -5, borderRadius: 5 },
  sendCueTrailDotSm: { width: 7, height: 7, marginTop: -3.5, marginLeft: -3.5, borderRadius: 3.5 },
  sendCueTrailDotXs: { width: 5, height: 5, marginTop: -2.5, marginLeft: -2.5, borderRadius: 2.5 },
  sendCueTrailDotWave: { backgroundColor: huddleColors.blue },
  sendCueTrailDotStar: { backgroundColor: huddleColors.premiumGold },
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
  matchSlotFallbackGold: { backgroundColor: huddleColors.premiumGold },
  matchSlotInitials: { fontFamily: "Urbanist-800", fontSize: 28, lineHeight: 32, color: huddleColors.onPrimary },
  matchKeyboardScrim: { ...StyleSheet.absoluteFillObject, zIndex: 1, backgroundColor: huddleColors.backdrop },
  matchKeyboardDockWrap: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20 },
  matchDockBelowPill: { paddingHorizontal: huddleSpacing.x4, paddingBottom: huddleSpacing.x4, gap: huddleSpacing.x2 },
  matchDockFocused: { paddingBottom: huddleSpacing.x1, gap: huddleSpacing.x1 },
  matchModalCard: { width: "100%", maxWidth: 390, alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.modal, padding: huddleSpacing.x5, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation2 },
  matchModalAvatar: { width: 92, height: 92, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  matchModalInitials: { fontFamily: "Urbanist-800", fontSize: 30, lineHeight: 36, color: huddleColors.onPrimary },
  matchTitle: { textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  matchBody: { textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  goldButton: { backgroundColor: huddleColors.premiumGold },
  // Fix #7: discover toast made quieter — narrower (centered, max 80% width), smaller text,
  // tighter padding, lower elevation. Used only for errors/duplicate notices now that "Wave sent"
  // and "Star sent" banners are removed (the cue animation IS the confirmation).
  discoverToastWrap: {
    position: "absolute", top: 8, alignSelf: "center", maxWidth: "82%", zIndex: 50,
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: huddleRadii.pill, overflow: "hidden",
    paddingVertical: 8, paddingRight: 14, paddingLeft: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: huddleColors.glassBorder,
  },
  discoverToastIntentBar: { width: 3, alignSelf: "stretch", borderTopLeftRadius: huddleRadii.pill, borderBottomLeftRadius: huddleRadii.pill },
  discoverToastIcon: { marginLeft: 8 },
  discoverToastText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
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
