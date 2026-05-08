import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Dimensions, Easing, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type GestureResponderEvent, type ImageSourcePropType, type ImageStyle, type StyleProp } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getQuotaCapsForTier, normalizeQuotaTier, quotaConfig } from "../../../quotaConfig_v1";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSocialReportModal } from "../components/social/NativeSocialReportModal";
import {
  acceptNativeGroupInvite,
  cancelNativeGroupInvite,
  createNativeGroupChat,
  declineNativeGroupInvite,
  ensureNativeDirectChatRoom,
  fetchNativeExploreGroups,
  fetchNativePendingGroupInvitePrompts,
  fetchNativeGroupPreviewMembers,
  fetchNativeGroupManagementSnapshot,
  fetchNativeChatDiscoveryProfiles,
  fetchNativeChatInbox,
  fetchNativeChatUnreadTotal,
  joinNativeGroupByCode,
  joinNativePublicGroup,
  markNativeChatRoomRead,
  requestNativeGroupJoin,
  resolveNativeChatInboxRowNavigation,
  searchNativeChatInbox,
  isNativeTeamHuddleIdentity,
  inviteNativeGroupMembers,
  removeNativeGroupChat,
  removeNativeGroupMember,
  sendNativeChatMessage,
  setNativeGroupMuteState,
  updateNativeGroupChatMetadata,
  updateNativeGroupJoinRequest,
  type NativeChatDiscoveryProfile,
  type NativeChatDiscoveryFilters,
  type NativeChatDiscoverStatus,
  type NativeExploreGroup,
  type NativeGroupManagementSnapshot,
  type NativeChatInboxRow,
  type NativeChatInboxScope,
} from "../lib/nativeChat";
import { haptic } from "../lib/nativeHaptics";
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
import { resolveNativeAvatarUrl } from "../lib/nativeStorageUrlCache";
import { searchNativeSocialMentionSuggestions, type NativeSocialMentionSuggestion } from "../lib/nativeSocial";
import { supabase } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleFieldStates, huddleFormControls, huddleImageDefaults, huddleLayout, huddleMap, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import discoverAgeGateImage from "../../assets/Notifications/discover-age-gate.png";
import emptyChatImage from "../../assets/Notifications/empty-chat-native.png";
import emptyChatImageFallback from "../../assets/Notifications/empty-chat.png";
import matchedImage from "../../assets/Notifications/MatchedHero.png";
import serviceImage from "../../assets/Notifications/Service.jpg";
import profilePlaceholder from "../../huddle Design System/assets/ProfilePlaceholder.png";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
import { NativeFormTextField } from "../components/NativeFormField";
import { HuddleRangeControl, HuddleSingleRangeControl } from "../components/HuddleRangeControl";
import {
  AppActionMenu,
  AppConfirmModal,
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
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView as RNBlurView } from "@react-native-community/blur";

type NativeChatsTab = "friends" | "groups" | "service" | "discover";
type NativeChatsTopTab = "discover" | "chats";
type NativeGroupSubTab = "my" | "explore";
type StarUpgradeTier = "plus" | "gold";
type FilterTier = "free" | StarUpgradeTier;
type NativeGroupExploreSort = "relevance" | "proximity" | "latest" | "popularity";
type PendingGroupCover = { uri: string; name: string; mime: string; size: number | null };
type GroupDetailsErrors = { cover?: boolean; description?: boolean; location?: boolean; name?: boolean };
type MatchModalState = { userId: string; name: string; avatarUrl: string | null; roomId: string | null };
type SelfMatchProfile = { name: string; avatarUrl: string | null };
type StarConfirmTarget = { id: string; displayName: string };
type DiscoverySendCueKind = "wave" | "star";
type NativeViewerPetSignal = { species: string; breed: string };

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

const uploadNativeGroupCover = async (options: { asset: PendingGroupCover; chatId?: string | null; userId: string }) => {
  if (options.asset.size !== null && options.asset.size > 15 * 1024 * 1024) throw new Error("file_too_large");
  const extension = (options.asset.name.includes(".") ? options.asset.name.split(".").pop() : options.asset.mime.split("/").pop())?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const objectName = options.chatId
    ? `${options.userId}/groups/${options.chatId}/${Date.now()}.${extension}`
    : `${options.userId}/groups/${Date.now()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(options.asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = base64ToArrayBuffer(base64);
  const { error } = await supabase.storage.from("avatars").upload(objectName, body, {
    contentType: options.asset.mime || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(objectName);
  if (!data.publicUrl) throw new Error("group_cover_public_url_missing");
  return data.publicUrl;
};
type NativeMatchRow = { user1_id: string; user2_id: string; chat_id?: string | null; matched_at?: string | null; created_at?: string | null };

type NativeChatsScreenProps = {
  userId: string | null;
  search?: string;
  onBottomSheetOpenChange?: (open: boolean) => void;
  onNavigate: (path: string) => void;
};

const MAIN_TABS: Array<{ key: Exclude<NativeChatsTab, "discover">; label: string }> = [
  { key: "friends", label: "Friends" },
  { key: "groups", label: "Groups" },
  { key: "service", label: "Service" },
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
const PET_FOCUS_OPTIONS = nativePetFocusLabels;
const GROUP_PET_FOCUS_MAX = 3;
const GROUP_DESCRIPTION_WORD_LIMIT = 100;
const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const estimatePetFocusChipUnits = (value: string) => value.length * 8 + 28;
const shouldCollapsePetFocusChips = (values: string[]) => values.reduce((total, value) => total + estimatePetFocusChipUnits(value), 0) + Math.max(0, values.length - 1) * 6 > 315;
const INBOX_FIRST_PAGE = 10;
const INBOX_NEXT_PAGE = 20;
const DISCOVERY_VISIBLE_COUNT = 20;
const DISCOVERY_MAX_RADIUS_KM = 150;
const DISCOVERY_HEIGHT_MAX_CM = 300;
const SWIPE_COMMIT_OFFSET = 110;
const SWIPE_COMMIT_OFFSET_LAST = 130;
const SWIPE_COMMIT_VELOCITY = 0.8;
const SWIPE_VELOCITY_MIN_OFFSET = 80;
const SWIPE_VERTICAL_BOUND = 80;
const DISCOVERY_FLING_X = Math.max(Dimensions.get("window").width, 430) * 1.05;
const DISCOVERY_FLING_DURATION_MS = 380;
const DISCOVERY_RETURN_DURATION_MS = 320;
const FILTER_SHEET_SCROLL_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.58);
const discoveryPassedKey = (userId: string) => `native-chats:discovery-passed:${userId}`;
const discoveryPassedSessionKey = (userId: string) => `native-chats:discovery-passed-session:${userId}`;
const discoveryHandledKey = (userId: string) => `native-chats:discovery-handled:${userId}`;
const discoveryFiltersKey = (userId: string) => `native-chats:discovery-filters:v2:${userId}`;
const discoverySeenTodayKey = (userId: string, day: string) => `native-chats:discovery-seen:${day}:${userId}`;
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
  Dogs: "🐕", Cats: "🐈", Birds: "🦜", Fish: "🐟",
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
  if (tab === "chats" || tab === "groups" || tab === "service") return "chats";
  if (tab === "discover") return "discover";
  return "discover";
};

const parseInitialGroupDetailId = (search?: string) => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return String(params.get("detail") || params.get("group") || "").trim() || null;
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

const displayName = (row: NativeChatInboxRow) => {
  if (row.roomType === "group") return row.chatName || "Group chat";
  if (row.roomType === "service") return row.chatName || row.peerName || "Service chat";
  return row.peerName || row.chatName || "Conversation";
};

const parseInboxPreview = (content: string | null) => {
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
    const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    if (attachments.length > 0) return attachments.some((item) => String((item as Record<string, unknown>)?.mime || "").startsWith("image/")) ? "Photo" : "Attachment";
    return String(parsed.text || "").trim();
  } catch {
    return text.replace(/\s+/g, " ");
  }
};

const displaySubtitle = (row: NativeChatInboxRow) => {
  if (row.blockedByMe) return "Blocked";
  if (row.blockedByThem) return "Unavailable";
  if (row.unmatchedByMe || row.unmatchedByThem) return "Unmatched";
  const text = String(row.lastMessageContent || "").trim();
  if (!text) {
    if (row.roomType === "group") return row.memberCount > 0 ? `${row.memberCount} members` : "Group chat";
    if (row.roomType === "service") return row.serviceStatus || "Service request";
    return row.peerAvailabilityLabel || "Say hi";
  }
  return parseInboxPreview(text);
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
  return <Image onError={() => setFailed(true)} resizeMode={resizeMode} source={{ uri: resolved }} style={style} />;
}

function NativeUserAvatar({
  avatarUrl,
  isVerified,
  name,
  size,
}: {
  avatarUrl: string | null;
  isVerified: boolean;
  name: string;
  size: "md" | "lg";
}) {
  const frameStyle = size === "lg" ? styles.userAvatarLg : styles.userAvatarMd;
  const imageStyle = size === "lg" ? styles.userAvatarImageLg : styles.userAvatarImageMd;
  const verifiedBadgeStyle = size === "lg" ? styles.userAvatarVerifiedBadgeLg : styles.userAvatarVerifiedBadgeMd;
  return (
    <View style={[frameStyle, isVerified ? styles.userAvatarVerified : styles.userAvatarUnverified]}>
      <ResilientAvatarImage
        fallback={<Image accessibilityLabel={name || "User"} resizeMode="cover" source={profilePlaceholder} style={imageStyle} />}
        style={imageStyle}
        uri={avatarUrl}
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

const DISCOVERY_CARD_TO_LAYER_GAP = -40;
const DISCOVERY_LAYER_VISIBLE_GAP = 6;
const DISCOVERY_LAYER_HEIGHT = 52;
const DISCOVERY_LAYER_TO_ISLAND_GAP = 15;
const DISCOVERY_ISLAND_HEIGHT = 72;
const DISCOVERY_STACK_AFTER_CARD = DISCOVERY_CARD_TO_LAYER_GAP + DISCOVERY_LAYER_VISIBLE_GAP * 3 + DISCOVERY_LAYER_HEIGHT + DISCOVERY_LAYER_TO_ISLAND_GAP + DISCOVERY_ISLAND_HEIGHT;
const DISCOVERY_NAV_MIN_GAP = 24;
const DISCOVERY_CHROME_RESERVE = 224;
const DISCOVERY_STATUS_BANNER_RESERVE = 76;

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

const hasReciprocalWave = async (viewerId: string, targetUserId: string) => {
  const canonical = await supabase
    .from("waves" as never)
    .select("id")
    .eq("sender_id" as never, targetUserId as never)
    .eq("receiver_id" as never, viewerId as never)
    .limit(1);
  if (Array.isArray(canonical.data) && canonical.data.length > 0) return true;
  const legacy = await supabase
    .from("waves" as never)
    .select("id")
    .eq("from_user_id" as never, targetUserId as never)
    .eq("to_user_id" as never, viewerId as never)
    .limit(1);
  return Array.isArray(legacy.data) && legacy.data.length > 0;
};

const fetchNativeUserMatches = async (viewerId: string): Promise<NativeMatchRow[]> => {
  const attempts = [
    "chat_id,user1_id,user2_id,matched_at,last_interaction_at",
    "user1_id,user2_id,matched_at,last_interaction_at",
    "chat_id,user1_id,user2_id",
    "user1_id,user2_id",
  ];
  for (const selectColumns of attempts) {
    let query = supabase
      .from("matches" as never)
      .select(selectColumns as never)
      .or(`user1_id.eq.${viewerId},user2_id.eq.${viewerId}`)
      .eq("is_active" as never, true as never)
      .limit(500);
    if (selectColumns.includes("matched_at")) {
      query = query.order("matched_at" as never, { ascending: false, nullsFirst: false });
    }
    const { data, error } = await query;
    if (error) continue;
    return (((data || []) as unknown) as Array<Record<string, unknown>>).map((row) => ({
      user1_id: String(row.user1_id || ""),
      user2_id: String(row.user2_id || ""),
      chat_id: typeof row.chat_id === "string" ? row.chat_id : null,
      matched_at: typeof row.matched_at === "string" ? row.matched_at : typeof row.last_interaction_at === "string" ? row.last_interaction_at : null,
      created_at: typeof row.matched_at === "string" ? row.matched_at : typeof row.last_interaction_at === "string" ? row.last_interaction_at : null,
    }));
  }
  return [];
};

const readSeenMatchSet = async (viewerId: string) => {
  const [localRaw, serverResult] = await Promise.all([
    AsyncStorage.getItem(seenMatchesKey(viewerId)),
    supabase
      .from("discover_match_seen" as never)
      .select("matched_user_id" as never)
      .eq("viewer_id" as never, viewerId as never)
      .limit(500),
  ]);
  const seen = new Set<string>();
  try {
    const parsed = JSON.parse(String(localRaw || "[]")) as unknown;
    if (Array.isArray(parsed)) parsed.map(String).filter(Boolean).forEach((id) => seen.add(id));
  } catch {
    // Ignore corrupt local cache; server rows below keep the modal from replaying.
  }
  const serverRows = (((serverResult.data || []) as unknown) as Array<{ matched_user_id?: string | null }>);
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
  options?: { anchor?: { lat: number; lng: number } | null; viewerCountry?: string | null },
) => profiles.filter((profile) => {
  if (profile.age !== null && (profile.age < filters.ageMin || profile.age > filters.ageMax)) return false;
  if (filters.verifiedOnly && !profile.isVerified) return false;
  if (filters.hasCar && !profile.hasCar) return false;
  if (filters.activeOnly && activeMs(profile) < Date.now() - 24 * 60 * 60 * 1000) return false;
  if (activeMs(profile) < Date.now() - 30 * 24 * 60 * 60 * 1000) return false;
  const genderFilterActive = filters.genders.length < ALL_GENDERS.length;
  const socialRoleFilterActive = filters.socialRoles.length < ALL_SOCIAL_ROLES.length;
  const orientationFilterActive = filters.orientations.length < ALL_ORIENTATIONS.length;
  const relationshipFilterActive = filters.relationshipStatuses.length < ALL_RELATIONSHIP_STATUSES.length;
  const degreeFilterActive = filters.degrees.length < ALL_DEGREES.length;
  const languageFilterActive = filters.languages.length < ALL_LANGUAGES.length;
  if (genderFilterActive && (!profile.gender || !filters.genders.includes(profile.gender))) return false;
  if (socialRoleFilterActive && (!profile.socialRole || !filters.socialRoles.includes(profile.socialRole))) return false;
  if (orientationFilterActive && (!profile.orientation || !filters.orientations.includes(profile.orientation))) return false;
  if (relationshipFilterActive && !filters.relationshipStatuses.includes(normalizeRelationshipStatus(profile.relationshipStatus))) return false;
  if (degreeFilterActive && (!profile.degree || !filters.degrees.includes(profile.degree))) return false;
  if (languageFilterActive && !profile.languages.some((language) => filters.languages.includes(language))) return false;
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
  if (options?.anchor && Number.isFinite(profile.lastLat) && Number.isFinite(profile.lastLng)) {
    const sameCountry = Boolean(
      normalizeCountryKey(options.viewerCountry) &&
      normalizeCountryKey(profile.locationCountry) &&
      normalizeCountryKey(options.viewerCountry) === normalizeCountryKey(profile.locationCountry),
    );
    const dKm = distanceKm(options.anchor.lat, options.anchor.lng, Number(profile.lastLat), Number(profile.lastLng));
    if (!sameCountry && Number.isFinite(dKm) && dKm > filters.maxDistanceKm) return false;
  }
  return true;
});

// Phase K: neuglass toast — floats over discover, auto-dismisses, prettier than Bumble's banner
const DISCOVER_TOAST_INTENTS: Record<string, { color: string; icon: string }> = {
  wave: { color: huddleColors.blue, icon: "hand-wave-outline" },
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

// Phase M: frosted glass overlay for queued cards — fades out as top card is dragged
function QueuedCardBlur({ swipeXSV, style }: { swipeXSV: SharedValue<number>; style?: StyleProp<ImageStyle> }) {
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(swipeXSV.value), [0, 80, 160], [1, 0.4, 0], Extrapolation.CLAMP),
  }));
  return (
    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayStyle, style as object]}>
      <RNBlurView blurAmount={18} blurType="light" style={StyleSheet.absoluteFill} />
    </Reanimated.View>
  );
}

function DiscoveryProfileCard({
  busy,
  chips,
  index,
  isLast,
  statusVisible,
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
  isLast: boolean;
  statusVisible: boolean;
  swipeXSV: SharedValue<number>;
  onSwipePhaseChange: (active: boolean) => void;
  profile: NativeChatDiscoveryProfile;
  onPass: (profile: NativeChatDiscoveryProfile) => void;
  onProfileTap: (profile: NativeChatDiscoveryProfile) => void;
  onStar: (profile: NativeChatDiscoveryProfile) => void;
  onWave: (profile: NativeChatDiscoveryProfile) => Promise<boolean>;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [committedDirection, setCommittedDirection] = useState<"left" | "right" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, Math.min(viewportWidth - huddleSpacing.x6, 360));
  const cardHeight = cardWidth * 1.25;
  const layerFrontTop = cardHeight + DISCOVERY_CARD_TO_LAYER_GAP;
  const layerSecondTop = layerFrontTop + DISCOVERY_LAYER_VISIBLE_GAP;
  const layerThirdTop = layerSecondTop + DISCOVERY_LAYER_VISIBLE_GAP;
  const layerBackTop = layerThirdTop + DISCOVERY_LAYER_VISIBLE_GAP;
  const layerStackBottom = layerBackTop + DISCOVERY_LAYER_HEIGHT;
  const islandTop = layerStackBottom + DISCOVERY_LAYER_TO_ISLAND_GAP;
  const gluedStackHeight = islandTop + DISCOVERY_ISLAND_HEIGHT;
  const compactActions = viewportHeight < cardHeight + DISCOVERY_STACK_AFTER_CARD + DISCOVERY_CHROME_RESERVE + (statusVisible ? DISCOVERY_STATUS_BANNER_RESERVE : 0) + DISCOVERY_NAV_MIN_GAP;
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

  const clearSwipeState = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    committedDirSV.value = 0;
    swipeXSV.value = 0;
    setCommittedDirection(null);
    setIsDragging(false);
    onSwipePhaseChange(false);
  }, [committedDirSV, onSwipePhaseChange, swipeXSV, translateX, translateY]);

  const doPass = useCallback((p: NativeChatDiscoveryProfile) => {
    onPass(p);
    clearSwipeState();
  }, [clearSwipeState, onPass]);

  const doWave = useCallback((p: NativeChatDiscoveryProfile) => {
    void onWave(p).then((committed) => {
      if (!committed) {
        haptic.error();
        committedDirSV.value = 0;
        swipeXSV.value = 0;
        onSwipePhaseChange(false);
        translateX.value = withSpring(0, springCfg, () => {
          runOnJS(setCommittedDirection)(null);
          runOnJS(setIsDragging)(false);
        });
        translateY.value = withSpring(0, springCfg);
      } else {
        clearSwipeState();
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
        runOnJS(setIsDragging)(true);
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
          runOnJS(setIsDragging)(false);
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
          runOnJS(setCommittedDirection)("right");
          runOnJS(haptic.primaryConfirm)();
          const dur = Math.max(180, Math.min(380, 380 - Math.abs(e.velocityX) * 0.15));
          translateX.value = withTiming(DISCOVERY_FLING_X, { duration: dur, easing: ReanimEasing.in(ReanimEasing.cubic) }, () => {
            runOnJS(doWave)(profile);
          });
          translateY.value = withTiming(flingY, { duration: dur });
          return;
        }
        if (leftCommit) {
          committedDirSV.value = -1;
          runOnJS(setCommittedDirection)("left");
          runOnJS(haptic.toggleControl)();
          const dur = Math.max(180, Math.min(380, 380 - Math.abs(e.velocityX) * 0.15));
          translateX.value = withTiming(-DISCOVERY_FLING_X, { duration: dur, easing: ReanimEasing.in(ReanimEasing.cubic) }, () => {
            runOnJS(doPass)(profile);
          });
          translateY.value = withTiming(flingY, { duration: dur });
          return;
        }
        // Spring return with overshoot personality
        runOnJS(haptic.swipeReturn)();
        swipeXSV.value = 0;
        translateX.value = withSpring(0, springCfg, () => {
          runOnJS(setIsDragging)(false);
          runOnJS(onSwipePhaseChange)(false);
        });
        translateY.value = withSpring(0, springCfg);
      }),
    [busy, cardHeight, commitOffset, committedDirSV, doPass, doWave, gestureStartMsSV, hasCrossed, index, onSwipePhaseChange, profile, springCfg, swipeXSV, touchOriginYSV, translateX, translateY]
  );

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
    const scaleVal = aboveT ? 1.015 : interpolate(Math.abs(tx), [0, commitOffset], [1, 1.015], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: tx },
        { translateY: ty * 0.18 + compensateY },
        { rotate: `${rot}deg` },
        { scale: scaleVal },
      ],
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
        { scale: cd === 1 ? 1.03 : interpolate(tx, [0, 55, 110, 160], [0.54, 0.7, 0.94, 1.03], Extrapolation.CLAMP) },
        { rotate: `${stampRot}deg` },
      ],
    };
  });

  // Phase F: island/traffic button container fades during drag
  const buttonFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(swipeXSV.value), [0, 60, 120], [1, 0.4, 0], Extrapolation.CLAMP),
  }));

  // Phase B/M: queued card rises + scales driven entirely on UI thread
  const queuedAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(swipeXSV.value) / 150);
    const scale = index === 1 ? 0.95 + progress * 0.05 : 0.92 + progress * 0.03;
    const tY = index === 1 ? 8 - progress * 8 : 16 - progress * 8;
    return { transform: [{ translateY: tY }, { scale }] };
  });

  const mediaSources = useMemo(() => {
    const album = [profile.coverUrl, ...profile.socialAlbum, profile.avatarUrl].filter((s): s is string => Boolean(s));
    return Array.from(new Set(album));
  }, [profile.avatarUrl, profile.coverUrl, profile.socialAlbum]);
  const activeImage = mediaSources[Math.min(activeImageIndex, Math.max(0, mediaSources.length - 1))] || null;
  useEffect(() => { setActiveImageIndex(0); }, [profile.id]);
  const stepAlbum = useCallback((direction: -1 | 1) => {
    if (mediaSources.length <= 1) return;
    setActiveImageIndex((current) => {
      const next = current + direction;
      if (next < 0) return mediaSources.length - 1;
      if (next >= mediaSources.length) return 0;
      return next;
    });
  }, [mediaSources.length]);

  const renderDiscoveryActions = (variant: "island" | "traffic") => {
    const traffic = variant === "traffic";
    return (
      <View style={traffic ? styles.discoveryTrafficActions : styles.discoveryActionIsland}>
        <Pressable accessibilityLabel={`Star ${profile.displayName}`} disabled={busy} onPress={() => onStar(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, styles.discoveryTrafficStar] : styles.discoveryActionStar, styles.discoveryStarButton, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
          <FontAwesome5 color={huddleColors.onPrimary} name="star" size={traffic ? 22 : 20} />
        </Pressable>
        <Pressable accessibilityLabel={`Wave at ${profile.displayName}`} disabled={busy} onPress={() => void onWave(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, styles.discoveryTrafficWave] : styles.discoveryActionPrimary, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
          <MaterialCommunityIcons color={huddleColors.onPrimary} name="hand-wave-outline" size={traffic ? 28 : 32} style={styles.discoveryWaveIcon} />
        </Pressable>
        <Pressable accessibilityLabel={`Pass ${profile.displayName}`} disabled={busy} onPress={() => onPass(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, styles.discoveryTrafficPass] : styles.discoveryActionSecondary, pressed && huddleButtons.pressed, busy && styles.actionDisabled]}>
          <Feather color="#E94C5C" name="x" size={traffic ? 26 : 22} />
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
      index > 0 ? queuedAnimatedStyle : undefined,
    ]}>
      {committedDirection && index === 0 ? (
        <View pointerEvents="none" style={[styles.discoveryPreloadCard, { height: cardHeight }]}>
          {activeImage ? <Image accessibilityIgnoresInvertColors blurRadius={18} resizeMode="cover" source={{ uri: activeImage }} style={styles.discoveryPreloadImage} /> : <View style={styles.discoveryPreloadFallback} />}
          <View style={styles.discoveryPreloadWash} />
        </View>
      ) : null}
      <GestureDetector gesture={panGesture}>
        <Reanimated.View style={[styles.discoveryProfileCard, { height: cardHeight }, cardAnimatedStyle]}>
          <View style={styles.discoveryPhotoWrap}>
            <Pressable accessibilityLabel={`Open ${profile.displayName} profile`} onPress={() => onProfileTap(profile)} style={styles.discoveryProfileTap}>
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
              {compactActions && index === 0 && !isDragging && !committedDirection ? (
                <Reanimated.View style={buttonFadeStyle}>{renderDiscoveryActions("traffic")}</Reanimated.View>
              ) : null}
            </View>
            <Reanimated.View pointerEvents="none" style={[styles.discoverySwipeTint, styles.discoveryWaveTint, waveTintStyle]} />
            <Reanimated.View pointerEvents="none" style={[styles.discoverySwipeTint, styles.discoveryPassTint, passTintStyle]} />
            <Reanimated.View style={[styles.swipeStamp, styles.passStamp, passStampStyle]}><Text style={styles.passStampText}>SKIP</Text><Feather color="#E94C5C" name="x" size={18} /></Reanimated.View>
            <Reanimated.View style={[styles.swipeStamp, styles.waveStamp, waveStampStyle]}><MaterialCommunityIcons color={huddleColors.blue} name="hand-wave-outline" size={18} style={styles.discoveryWaveStampIcon} /><Text style={styles.waveStampText}>WAVE</Text></Reanimated.View>
            <LinearGradient
              colors={[huddleColors.profileHeroScrimStart, huddleColors.profileHeroScrimMid, huddleColors.profileHeroScrimEnd]}
              end={{ x: 0, y: 0 }}
              pointerEvents="none"
              start={{ x: 0, y: 1 }}
              style={styles.discoveryHeroScrim}
            />
            <View style={styles.discoveryHeroCopy}>
              <View style={styles.discoveryHeroNameRow}>
                <Text adjustsFontSizeToFit minimumFontScale={0.58} numberOfLines={1} style={styles.discoveryHeroName}>
                  {(profile.displayName || "User").toUpperCase()}
                </Text>
                {profile.isVerified ? <NativeVerifiedBadge compact scale={2} /> : null}
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
            {/* Phase M: frosted glass overlay on queued cards, fades as top card is swiped away */}
            {index > 0 ? <QueuedCardBlur swipeXSV={swipeXSV} style={[StyleSheet.absoluteFill, { borderRadius: styles.discoveryProfileCard.borderRadius }]} /> : null}
          </View>
        </Reanimated.View>
      </GestureDetector>
      {!compactActions && index === 0 && !isDragging && !committedDirection ? (
        <Reanimated.View style={[styles.discoveryActionIslandSlot, { top: islandTop }, buttonFadeStyle]}>{renderDiscoveryActions("island")}</Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
}

function DiscoveryDeckBottomLayers() {
  const { width: viewportWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, Math.min(viewportWidth - huddleSpacing.x6, 360));
  const cardHeight = cardWidth * 1.25;
  const layerFrontTop = cardHeight + DISCOVERY_CARD_TO_LAYER_GAP;
  const layerSecondTop = layerFrontTop + DISCOVERY_LAYER_VISIBLE_GAP;
  const layerThirdTop = layerSecondTop + DISCOVERY_LAYER_VISIBLE_GAP;
  const layerBackTop = layerThirdTop + DISCOVERY_LAYER_VISIBLE_GAP;

  return (
    <View pointerEvents="none" style={[styles.discoveryLayerSet, { width: cardWidth }]}>
      <View style={[styles.discoveryLayer, styles.discoveryLayerBack, { top: layerBackTop }]} />
      <View style={[styles.discoveryLayer, styles.discoveryLayerThird, { top: layerThirdTop }]} />
      <View style={[styles.discoveryLayer, styles.discoveryLayerSecond, { top: layerSecondTop }]} />
      <View style={[styles.discoveryLayer, styles.discoveryLayerFront, { top: layerFrontTop }]} />
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
  const priorityStar = isPriorityStarRow(row, userId);
  const socialAvailability = row.peerAvailabilityLabel;
  const automationId = row.roomType === "service" ? "native-chat-service-row" : row.roomType === "group" ? "native-chat-group-row" : "native-chat-direct-row";
  const translateX = useRef(new Animated.Value(0)).current;
  const [deleteRevealed, setDeleteRevealed] = useState(false);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderMove: (_, gesture) => {
      translateX.setValue(Math.min(0, Math.max(-92, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const shouldReveal = gesture.dx < -56;
      setDeleteRevealed(shouldReveal);
      Animated.spring(translateX, { toValue: shouldReveal ? -76 : 0, useNativeDriver: true }).start();
    },
  }), [translateX]);
  const avatarUrl = row.peerAvatarUrl || row.avatarUrl;
  return (
    <View style={styles.swipeRowWrap}>
      {deleteRevealed ? (
        <Pressable accessibilityLabel={`Remove ${name}`} onPress={() => onDelete(row)} style={styles.rowDeleteAction}>
          <Feather color={huddleColors.onPrimary} name="trash-2" size={18} />
        </Pressable>
      ) : null}
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <Pressable accessibilityLabel={`${automationId}:${name}`} testID={automationId} disabled={disabled} onPress={() => onPress(row)} style={({ pressed }) => [styles.webChatRow, priorityStar && styles.priorityStarRow, unread && styles.rowUnread, disabled && styles.rowDisabled, pressed && styles.rowPressed]}>
          <Pressable
            accessibilityLabel={`Open ${name} profile`}
            disabled={!row.peerUserId || disabled}
            onPress={(event) => {
              event.stopPropagation();
              onAvatarPress(row);
            }}
            style={styles.avatarPressTarget}
          >
            <NativeUserAvatar avatarUrl={avatarUrl} isVerified={row.peerIsVerified} name={name} size="lg" />
          </Pressable>
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <View style={styles.rowTitleWrap}>
                <Text numberOfLines={1} style={styles.rowTitle}>{name}</Text>
              </View>
              <Text style={styles.rowTime}>{compactTime(row.lastMessageAt || row.activityTs)}</Text>
            </View>
            <View style={styles.rowBottom}>
              <Text numberOfLines={1} style={[styles.rowSubtitle, priorityStar && styles.rowSubtitleStar, unread && styles.rowSubtitleUnread]}>{displaySubtitle(row)}</Text>
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
  onResuface,
  onExpandSearch,
}: {
  passedCount: number;
  quotaReached: boolean;
  onResuface: () => void;
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
          <Pressable onPress={onResuface} style={({ pressed }) => [styles.discoveryEndPrimary, pressed && huddleButtons.pressed]}>
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
  image,
  onPress,
  title,
}: {
  body?: string;
  buttonLabel?: string;
  image?: ImageSourcePropType;
  onPress?: () => void;
  title?: string;
}) {
  const emptyImage = image || emptyChatImageFallback;

  return (
    <View style={nativeModalStyles.appEmptyWrap}>
      <View style={styles.webEmptyCard}>
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

const MATCH_QUICK_REPLIES = ["Hey! Your pet is adorable 🐾", "Would love to meet up!", "Let's chat 😄", "Your profile caught my eye!"];
// Matched.png native dims: 928 × 1376  →  aspect ratio
const MATCH_IMG_W = 928;
const MATCH_IMG_H = 1376;
const MATCH_IMG_RATIO = MATCH_IMG_W / MATCH_IMG_H;
// Slot rectangles measured against the artwork (% of image dims).
// Each slot is the white interior of the egg — sized so an ellipse mask
// (borderRadius: 9999 on a non-square box) fills the white area exactly.
const MATCH_SLOT_BLUE = { x: 0.255, y: 0.225, w: 0.265, h: 0.225 } as const; // back / self
const MATCH_SLOT_ORANGE = { x: 0.448, y: 0.265, w: 0.285, h: 0.230 } as const; // front / peer
// Y position of the bottom of the "LET'S DROP A HELLO" pill (in image %).
const MATCH_PILL_BOTTOM = 0.74;

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

  // Compute the image's rendered rect under cover semantics, so slot
  // positions stay locked to the artwork on every device aspect ratio.
  const screenAspect = screenW / screenH;
  const imgW = screenAspect > MATCH_IMG_RATIO ? screenW : screenH * MATCH_IMG_RATIO;
  const imgH = screenAspect > MATCH_IMG_RATIO ? screenW / MATCH_IMG_RATIO : screenH;
  const imgLeft = (screenW - imgW) / 2;
  const imgTop = (screenH - imgH) / 2;

  const slotBlue = {
    left: imgLeft + MATCH_SLOT_BLUE.x * imgW,
    top: imgTop + MATCH_SLOT_BLUE.y * imgH,
    width: MATCH_SLOT_BLUE.w * imgW,
    height: MATCH_SLOT_BLUE.h * imgH,
  };
  const slotOrange = {
    left: imgLeft + MATCH_SLOT_ORANGE.x * imgW,
    top: imgTop + MATCH_SLOT_ORANGE.y * imgH,
    width: MATCH_SLOT_ORANGE.w * imgW,
    height: MATCH_SLOT_ORANGE.h * imgH,
  };
  // Dock pinned just under the pill, with safe-area-aware bottom margin.
  const pillBottomScreenY = imgTop + MATCH_PILL_BOTTOM * imgH;
  const dockTop = pillBottomScreenY + huddleSpacing.x3;

  // Spring entry: avatars scale-in from inside the eggs, dock rises from bottom.
  const avatarScale = useSharedValue(0.6);
  const avatarOpacity = useSharedValue(0);
  const dockSlide = useSharedValue(80);
  const screenOpacity = useSharedValue(0);
  useEffect(() => {
    if (!modal) return;
    screenOpacity.value = withTiming(1, { duration: 240 });
    avatarScale.value = withDelay(80, withSpring(1, { damping: 14, stiffness: 240, mass: 0.6 }));
    avatarOpacity.value = withDelay(80, withTiming(1, { duration: 220 }));
    dockSlide.value = withDelay(180, withSpring(0, { damping: 18, stiffness: 200, mass: 0.6 }));
  }, [modal, avatarScale, avatarOpacity, dockSlide, screenOpacity]);
  const avatarAnimStyle = useAnimatedStyle(() => ({
    opacity: avatarOpacity.value,
    transform: [{ scale: avatarScale.value }],
  }));
  const dockAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dockSlide.value }],
    opacity: interpolate(dockSlide.value, [80, 30, 0], [0, 0.5, 1], Extrapolation.CLAMP),
  }));
  const screenAnimStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));

  if (!modal) return null;
  const quickHelloDisabled = sending || !quickHello.trim();
  return (
    <Modal presentationStyle="overFullScreen" animationType="none" transparent visible onRequestClose={onClose}>
      <Reanimated.View style={[styles.matchFullScreen, screenAnimStyle]}>
        {/* Backdrop — bleed handles aspect-ratio differences */}
        <Image resizeMode="cover" source={matchedImage} style={styles.matchFullImage} />
        {/* Avatar slots — perfectly inside the egg interiors, no white showing */}
        <Reanimated.View pointerEvents="none" style={[styles.matchAvatarSlotBase, slotBlue, avatarAnimStyle]}>
          <ResilientAvatarImage
            fallback={<View style={styles.matchSlotFallback}><Text style={styles.matchSlotInitials}>{initials(self.name)}</Text></View>}
            style={styles.matchSlotImage}
            uri={self.avatarUrl}
          />
        </Reanimated.View>
        <Reanimated.View pointerEvents="none" style={[styles.matchAvatarSlotBase, slotOrange, avatarAnimStyle]}>
          <ResilientAvatarImage
            fallback={<View style={styles.matchSlotFallback}><Text style={styles.matchSlotInitials}>{initials(modal.name)}</Text></View>}
            style={styles.matchSlotImage}
            uri={modal.avatarUrl}
          />
        </Reanimated.View>
        {/* Close button */}
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[nativeModalStyles.appMatchCloseButton, { top: Math.max(insets.top + huddleSpacing.x2, huddleSpacing.x4) }]}>
          <Feather color={huddleColors.blue} name="x" size={16} />
        </Pressable>
        {/* Chips + chromeless input pinned below the LET'S DROP A HELLO pill */}
        <Reanimated.View style={[styles.matchDockBelowPill, { top: dockTop, paddingBottom: insets.bottom + huddleSpacing.x4 }, dockAnimStyle]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchQuickReplies}
            keyboardShouldPersistTaps="handled"
          >
            {MATCH_QUICK_REPLIES.map((reply) => (
              <Pressable key={reply} onPress={() => setQuickHello(reply)} style={({ pressed }) => [styles.matchQuickReplyChip, pressed && huddleButtons.pressed]}>
                <Text style={styles.matchQuickReplyText}>{reply}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.matchInputRow}>
            <TextInput
              editable={!sending}
              maxLength={500}
              onChangeText={setQuickHello}
              placeholder="Type a message"
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={styles.matchInputField}
              value={quickHello}
            />
            <Pressable
              accessibilityLabel="Send"
              disabled={quickHelloDisabled}
              onPress={onQuickHello}
              style={({ pressed }) => [styles.matchInputSend, quickHelloDisabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
            >
              {sending ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Feather color={huddleColors.onPrimary} name="send" size={16} />}
            </Pressable>
          </View>
          <Pressable accessibilityLabel="Keep exploring" onPress={onClose} style={styles.matchKeepExploring}>
            <Text style={styles.matchKeepExploringText}>Keep exploring</Text>
          </Pressable>
        </Reanimated.View>
      </Reanimated.View>
    </Modal>
  );
}

export function NativeChatsScreen({ userId, search, onBottomSheetOpenChange, onNavigate }: NativeChatsScreenProps) {
  const screenInsets = useSafeAreaInsets();
  const [topTab, setTopTab] = useState<NativeChatsTopTab>(() => parseInitialTopTab(search));
  const [mainTab, setMainTab] = useState<Exclude<NativeChatsTab, "discover">>(() => parseInitialMainTab(search));
  const [groupSubTab, setGroupSubTab] = useState<NativeGroupSubTab>("my");
  const [rows, setRows] = useState<NativeChatInboxRow[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [discoverProfiles, setDiscoverProfiles] = useState<NativeChatDiscoveryProfile[]>([]);
  const [discoverySwipeActive, setDiscoverySwipeActive] = useState(false);
  const discoverySwipeXSV = useSharedValue(0);
  const [discoverStatus, setDiscoverStatus] = useState<NativeChatDiscoverStatus>("ready");
  const [discoverLocationPermission, setDiscoverLocationPermission] = useState<NativeLocationPermissionDetail>({ canAskAgain: true, state: "unknown" });
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const [discoverLocationLabel, setDiscoverLocationLabel] = useState<string | null>(null);
  const [discoverBusyId, setDiscoverBusyId] = useState<string | null>(null);
  const [filters, setFilters] = useState<NativeChatDiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [viewerCountry, setViewerCountry] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<StarUpgradeTier | null>(null);
  const [filterRow, setFilterRow] = useState<keyof NativeChatDiscoveryFilters | null>(null);
  const [effectiveTier, setEffectiveTier] = useState<"free" | "plus" | "gold">("free");
  const [selfVerified, setSelfVerified] = useState(false);
  const [confirmStarTarget, setConfirmStarTarget] = useState<StarConfirmTarget | null>(null);
  const [starActionLoading, setStarActionLoading] = useState(false);
  const [starConfirmMessage, setStarConfirmMessage] = useState<string | null>(null);
  const [discoverySendCue, setDiscoverySendCue] = useState<{ kind: DiscoverySendCueKind; id: number } | null>(null);
  const [passedDiscoveryIds, setPassedDiscoveryIds] = useState<Set<string>>(new Set());
  const [handledDiscoveryIds, setHandledDiscoveryIds] = useState<Set<string>>(new Set());
  const [matchModal, setMatchModal] = useState<MatchModalState | null>(null);
  const [matchQuickHello, setMatchQuickHello] = useState("");
  const [matchSending, setMatchSending] = useState(false);
  const [activeMatchedPeerIds, setActiveMatchedPeerIds] = useState<Set<string>>(new Set());
  const [selfMatchProfile, setSelfMatchProfile] = useState<SelfMatchProfile>({ name: "You", avatarUrl: null });
  const [profileSheetUserId, setProfileSheetUserId] = useState<string | null>(null);
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
    const open = filterOpen || groupExploreSortOpen || premiumTier !== null || confirmStarTarget !== null || matchModal !== null || profileSheetUserId !== null || inviteInboxOpen || pendingGroupInvitePrompt !== null || groupDetails !== null || groupManagement !== null || groupMemberReportTarget !== null || pendingDeleteRow !== null || createGroupOpen || joinCodeOpen;
    onBottomSheetOpenChange?.(open);
    return () => onBottomSheetOpenChange?.(false);
  }, [confirmStarTarget, createGroupOpen, filterOpen, groupDetails, groupExploreSortOpen, groupManagement, groupMemberReportTarget, inviteInboxOpen, joinCodeOpen, matchModal, onBottomSheetOpenChange, pendingDeleteRow, pendingGroupInvitePrompt, premiumTier, profileSheetUserId]);
  const discoverySendCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveryFiltersSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passedDiscoveryIdsRef = useRef(passedDiscoveryIds);
  const handledDiscoveryIdsRef = useRef(handledDiscoveryIds);
  const rowsRef = useRef(rows);
  const matchProbeRef = useRef<{ userId: string | null; inFlight: boolean }>({ userId: null, inFlight: false });
  const loadRowsGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const exploreLoadGateRef = useRef<{ key: string | null; inFlight: boolean; lastStartedAt: number }>({ key: null, inFlight: false, lastStartedAt: 0 });
  const seenGroupInvitePromptsRef = useRef<Set<string>>(new Set());
  const hasHydratedRowsRef = useRef(false);

  useEffect(() => {
    passedDiscoveryIdsRef.current = passedDiscoveryIds;
  }, [passedDiscoveryIds]);

  useEffect(() => {
    handledDiscoveryIdsRef.current = handledDiscoveryIds;
  }, [handledDiscoveryIds]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

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
    if (!userId || topTab !== "chats" || mainTab !== "groups" || pendingGroupInvitePrompt) return;
    let cancelled = false;
    void fetchNativePendingGroupInvitePrompts(userId)
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
  }, [mainTab, pendingGroupInvitePrompt, topTab, userId]);

  useEffect(() => () => {
    if (discoverySendCueTimerRef.current) clearTimeout(discoverySendCueTimerRef.current);
    if (discoveryFiltersSaveRef.current) clearTimeout(discoveryFiltersSaveRef.current);
  }, []);

  useEffect(() => {
    if (!userId) {
      setPassedDiscoveryIds(new Set());
      setHandledDiscoveryIds(new Set());
      return;
    }
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
    })();
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
      setViewerGroupAnchor(null);
      setViewerPetSignals([]);
      setViewerLocationWords([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await fetchNativeProfileSummary(userId, { force: true });
        if (cancelled) return;
        setEffectiveTier(normalizeTier(snapshot.profile?.effective_tier ?? snapshot.quota?.effective_tier ?? snapshot.profile?.tier ?? snapshot.quota?.tier));
        setSelfVerified(snapshot.profile?.is_verified === true || String(snapshot.profile?.verification_status || "").toLowerCase() === "verified");
        setSelfMatchProfile({
          name: String(snapshot.profile?.display_name || "You"),
          avatarUrl: resolveNativeAvatarUrl(snapshot.profile?.avatar_url),
        });
        const profileLocationName = String(snapshot.profile?.location_name || snapshot.profile?.location_label || snapshot.profile?.city || "").trim();
        const profileLocationCountry = String(snapshot.profile?.location_country || snapshot.profile?.country || "").trim();
        const country = profileLocationCountry || extractNativeCountryFromPlaceLabel(profileLocationName);
        const lat = Number(snapshot.profile?.latitude);
        const lng = Number(snapshot.profile?.longitude);
        setViewerGroupAnchor(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
        setViewerLocationWords(String(profileLocationName)
          .toLowerCase()
          .split(/[\s,./-]+/)
          .filter((word) => word.length > 2));
        setViewerCountry(profileLocationCountry || null);
        setGroupCountryDraft(country || null);
        const { data: petRows } = await supabase
          .from("pets")
          .select("species,breed")
          .eq("owner_id", userId)
          .eq("is_active", true)
          .limit(20);
        if (!cancelled) {
          setViewerPetSignals(((petRows ?? []) as Array<{ species?: string | null; breed?: string | null }>).map((pet) => ({
            species: String(pet.species || "").trim(),
            breed: String(pet.breed || "").trim(),
          })).filter((pet) => pet.species || pet.breed));
        }
      } catch {
        if (!cancelled) {
          setEffectiveTier("free");
          setViewerCountry(null);
          setViewerGroupAnchor(null);
          setViewerPetSignals([]);
          setViewerLocationWords([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

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
      if (!peerId || friendsWithConversationPeerIds.has(peerId) || !isMatchedRailRow(row, activeMatchedPeerIds)) return;
      if (!byPeer.has(peerId)) byPeer.set(peerId, row);
    });
    return Array.from(byPeer.values());
  }, [activeMatchedPeerIds, friendsSourceRows, friendsWithConversationPeerIds, mainTab, topTab]);
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
        const matches = await fetchNativeUserMatches(userId);
        const candidateIds = Array.from(new Set(matches
          .map((match) => match.user1_id === userId ? match.user2_id : match.user1_id)
          .filter((candidateId) => Boolean(candidateId) && candidateId !== userId)))
          .slice(0, 500);
        if (!cancelled) setActiveMatchedPeerIds(new Set(candidateIds));
        if (!candidateIds.length) {
          if (!cancelled) setMatchedInviteCandidates([]);
          return;
        }
        const { data, error } = await supabase
          .from("profiles" as never)
	          .select("id,display_name,avatar_url,social_id,is_verified,verification_status" as never)
          .in("id" as never, candidateIds as never)
          .limit(candidateIds.length);
        if (error) throw error;
        const byId = new Map((((data || []) as unknown) as Array<{
          id?: string;
          display_name?: string | null;
	          avatar_url?: string | null;
	          social_id?: string | null;
	          is_verified?: boolean | null;
          verification_status?: string | null;
        }>).map((profile) => [String(profile.id || ""), profile] as const));
        const candidates = candidateIds
          .map((candidateId) => {
            const profile = byId.get(candidateId);
            if (!profile) return null;
            return {
              id: candidateId,
	              name: String(profile.display_name || "Matched user"),
	              avatarUrl: resolveNativeAvatarUrl(profile.avatar_url),
	              socialId: String(profile.social_id || "").replace(/^@/, "") || null,
	              isVerified: profile.is_verified === true || String(profile.verification_status || "").toLowerCase() === "verified",
            };
          })
	          .filter(Boolean) as Array<{ id: string; name: string; avatarUrl: string | null; isVerified: boolean; socialId: string | null }>;
        if (!cancelled) setMatchedInviteCandidates(candidates);
      } catch {
        if (!cancelled) {
          setMatchedInviteCandidates([]);
          setActiveMatchedPeerIds(new Set());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const visibleRows = useMemo(() => {
    if (topTab === "discover") return [];
    if (mainTab === "groups" && groupSubTab === "explore") return [];
    const sourceRows = searchResultRows ?? rows;
    const railPeerIds = new Set(avatarOnlyMatches.map((row) => String(row.peerUserId || "")).filter(Boolean));
    const conversationRows = mainTab === "friends"
      ? sourceRows.filter((row) => !railPeerIds.has(String(row.peerUserId || "")))
      : sourceRows;
    if (mainTab === "friends") {
      const priority = conversationRows.filter((row) => isPriorityStarRow(row, userId));
      const regular = conversationRows.filter((row) => !isPriorityStarRow(row, userId));
      return [...priority, ...regular].slice(0, visibleCount);
    }
    return conversationRows.slice(0, visibleCount);
  }, [avatarOnlyMatches, groupSubTab, mainTab, rows, searchResultRows, topTab, userId, visibleCount]);
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
    if (action === "pass") {
      setDiscoverProfiles((current) => {
        const index = current.findIndex((profile) => profile.id === cleanId);
        if (index < 0) return current;
        const profile = current[index];
        return [...current.slice(0, index), ...current.slice(index + 1), profile];
      });
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
    setDiscoverProfiles((current) => current.some((item) => item.id === profile.id) ? current : [profile, ...current].slice(0, DISCOVERY_VISIBLE_COUNT));
  }, [persistDiscoverySet, userId]);

  const bumpNativeDiscoverySeen = useCallback(async () => {
    try {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)("check_and_increment_quota", { action_type: "discovery_view" });
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
  }, [userId]);

  const enqueueNativeChatNotification = useCallback(async (args: { userId: string; kind: string; title: string; body: string; href: string; data?: Record<string, unknown> }) => {
    try {
      let href = args.href;
      if (href === "/chats") href = "/chats?tab=discover";
      if (!href.startsWith("/")) href = "/chats?tab=discover";
      await (supabase.rpc as unknown as (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ error: { message?: string } | null }>)("enqueue_notification", {
        p_user_id: args.userId,
        p_category: "chats",
        p_kind: args.kind,
        p_title: args.title,
        p_body: args.body,
        p_href: href,
        p_data: args.data ?? {},
      });
    } catch {
      // Notification parity is best-effort and must not block the primary action.
    }
  }, []);

  const launchNativeDiscoverySendCue = useCallback((kind: DiscoverySendCueKind, options?: { onCommit?: () => void }) => new Promise<void>((resolve) => {
    if (discoverySendCueTimerRef.current) {
      clearTimeout(discoverySendCueTimerRef.current);
      discoverySendCueTimerRef.current = null;
    }
    setDiscoverySendCue({ kind, id: Date.now() });
    const commitDelay = kind === "star" ? 320 : 220;
    const completeDelay = kind === "star" ? 1350 : 260;
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

  const loadRows = useCallback(async ({ force, silent }: { force?: boolean; silent?: boolean } = {}) => {
    if (!userId) {
      setRows([]);
      setUnreadTotal(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const loadKey = `${userId}|${topTab}|${mainTab}|${groupSubTab}|${effectiveTier}|${topTab === "discover" ? filterKey : ""}`;
    const now = Date.now();
    const gate = loadRowsGateRef.current;
    if (!force && gate.key === loadKey && (gate.inFlight || now - gate.lastStartedAt < 1200)) {
      setRefreshing(false);
      return;
    }
    loadRowsGateRef.current = { key: loadKey, inFlight: true, lastStartedAt: now };
    if (topTab === "discover") {
      setStatus(null);
      if (!silent) setLoading(true);
      try {
        const result = await fetchNativeChatDiscoveryProfiles(userId, filters, { effectiveTier });
        const passedIds = passedDiscoveryIdsRef.current;
        const handledIds = handledDiscoveryIdsRef.current;
        setDiscoverProfiles(applyDiscoveryFilters(result.profiles, filters, {
          anchor: result.anchor,
          viewerCountry,
        }).filter((profile) => !passedIds.has(profile.id) && !handledIds.has(profile.id)));
        setDiscoverStatus(result.status);
      setDiscoverLocationLabel(result.locationLabel);
      } catch {
        setDiscoverProfiles([]);
        setDiscoverStatus("ready");
        setStatus(null);
      } finally {
        if (loadRowsGateRef.current.key === loadKey) loadRowsGateRef.current.inFlight = false;
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
      return;
    }
    if (!silent) setLoading(true);
    setStatus(null);
    try {
      setVisibleCount(INBOX_FIRST_PAGE);
      const [baseRows, activeFriendRows] = await Promise.all([
        fetchNativeChatInbox({ scope: scopeForTab(mainTab), onlyWithActivity: mainTab === "friends" ? false : null, limit: 80, force }),
        mainTab === "friends" ? fetchNativeChatInbox({ scope: "friends", onlyWithActivity: true, limit: INBOX_FIRST_PAGE, force }) : Promise.resolve([] as NativeChatInboxRow[]),
      ]);
      const nextRows = mainTab === "friends"
        ? dedupeDirectRowsByPeer([...baseRows, ...activeFriendRows])
        : baseRows;
      setRows(nextRows);
      const conversationRows = mainTab === "friends" ? nextRows.filter((row) => !isMatchedRailRow(row, activeMatchedPeerIds)) : nextRows;
      setHasMoreRows(mainTab === "friends" && (activeFriendRows.length >= INBOX_FIRST_PAGE || conversationRows.length > INBOX_FIRST_PAGE));
      const cursorSource = activeFriendRows.length > 0 ? activeFriendRows : conversationRows;
      setRowCursor(cursorSource[cursorSource.length - 1]?.activityTs || cursorSource[cursorSource.length - 1]?.lastMessageAt || null);
      if (mainTab === "groups" && groupSubTab === "explore") {
        const joinedGroupIds = nextRows.filter((row) => row.roomType === "group").map((row) => row.chatId);
        const exploreKey = `${userId}|${joinedGroupIds.slice().sort().join(",")}`;
        const exploreGate = exploreLoadGateRef.current;
        if (force || exploreGate.key !== exploreKey || (!exploreGate.inFlight && now - exploreGate.lastStartedAt >= 5000)) {
          exploreLoadGateRef.current = { key: exploreKey, inFlight: true, lastStartedAt: now };
	          void fetchNativeExploreGroups({ userId, joinedGroupIds })
	          .then(async (explore) => {
                const allGroups = [...explore.invited, ...explore.groups];
                const creatorIds = new Set(allGroups.map((group) => group.createdBy).filter((id): id is string => Boolean(id)));
                const distanceByCreator = new Map<string, number>();
                if (viewerGroupAnchor && creatorIds.size > 0) {
                  const { data, error } = await (supabase.rpc as unknown as (
                    fn: string,
                    params?: Record<string, unknown>,
                  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
                    "get_service_provider_distances",
                    { p_lat: viewerGroupAnchor.lat, p_lng: viewerGroupAnchor.lng },
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
	            setExploreGroups(explore.groups.map(withDistance));
	            setInvitedExploreGroups(explore.invited.map(withDistance));
	          })
            .catch((error) => console.warn("[native.chats] explore_groups_failed", error))
            .finally(() => {
              if (exploreLoadGateRef.current.key === exploreKey) exploreLoadGateRef.current.inFlight = false;
            });
        }
      }
    } catch (error) {
      console.warn("[native.chats] load_rows_failed", error);
      if (!silent) setStatus("Failed to load conversations. Pull to refresh.");
    } finally {
      if (loadRowsGateRef.current.key === loadKey) loadRowsGateRef.current.inFlight = false;
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [activeMatchedPeerIds, effectiveTier, filterKey, filters, groupSubTab, mainTab, topTab, userId, viewerCountry, viewerGroupAnchor]);

  useEffect(() => {
    if (!userId) return;
    const key = `${userId}|${topTab}|${mainTab}|${groupSubTab}`;
    if (hasHydratedRowsRef.current && loadRowsGateRef.current.key?.startsWith(key)) return;
    hasHydratedRowsRef.current = true;
    void loadRows();
  }, [groupSubTab, loadRows, mainTab, topTab, userId]);

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

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void fetchNativeChatUnreadTotal()
      .then((total) => {
        if (active) setUnreadTotal(total);
      })
      .catch((error) => console.warn("[native.chats] unread_total_failed", error));
    return () => {
      active = false;
    };
  }, [userId]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadRows({ force: true, silent: true });
  }, [loadRows]);

  const handleTopTabPress = useCallback((tab: NativeChatsTopTab) => {
    haptic.selectTab();
    setTopTab(tab);
    setStatus(null);
  }, []);

  const handleMainTabPress = useCallback((tab: Exclude<NativeChatsTab, "discover">) => {
    haptic.selectTab();
    setMainTab(tab);
    setStatus(null);
  }, []);

  const handleOpenRow = useCallback((row: NativeChatInboxRow) => {
    haptic.toggleControl();
    const originalRoomId = row.chatId;
    setRows((current) => current.map((item) => item.chatId === originalRoomId ? { ...item, unreadCount: 0 } : item));
    if (userId) void markNativeChatRoomRead({ roomId: originalRoomId, userId }).catch((error) => console.warn("[native.chats] mark_read_open_failed", error));
    void resolveNativeChatInboxRowNavigation(row, ensureNativeDirectChatRoom).then((path) => {
      const roomMatch = /[?&]room=([^&]+)/.exec(path);
      const resolvedRoomId = roomMatch ? decodeURIComponent(roomMatch[1] || "") : "";
      if (userId && resolvedRoomId && resolvedRoomId !== originalRoomId) {
        void markNativeChatRoomRead({ roomId: resolvedRoomId, userId }).catch((error) => console.warn("[native.chats] mark_read_resolved_open_failed", error));
      }
      onNavigate(path);
    }).catch((error: unknown) => {
      const detail = error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "")
        : "";
      setRows((current) => current.map((item) => item.chatId === originalRoomId ? { ...item, unreadCount: row.unreadCount } : item));
      setStatus(detail ? `Unable to open conversation right now: ${detail}` : "Unable to open conversation right now.");
    });
  }, [onNavigate, userId]);

  const handleAvatarProfilePress = useCallback((row: NativeChatInboxRow) => {
    if (!row.peerUserId) return;
    if (isNativeTeamHuddleIdentity(displayName(row), row.peerSocialId)) return;
    haptic.toggleControl();
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
      const nextRows = await searchNativeChatInbox(searchQuery);
      setSearchResultRows(dedupeDirectRowsByPeer(nextRows).filter((row) => {
        if (mainTab === "groups") return row.roomType === "group";
        if (mainTab === "service") return row.roomType === "service";
        return row.roomType !== "group" && row.roomType !== "service";
      }));
    } catch {
      setStatus("Search is not available right now.");
    } finally {
      setLoading(false);
    }
  }, [mainTab, searchQuery, userId]);

  const handleLoadMore = useCallback(async () => {
    if (!userId) return;
    if (searchResultRows) return;
    if (mainTab !== "friends") {
      setVisibleCount((count) => count + INBOX_NEXT_PAGE);
      return;
    }
    try {
      const nextRows = await fetchNativeChatInbox({ scope: "friends", onlyWithActivity: true, limit: INBOX_NEXT_PAGE, cursor: rowCursor });
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
    }
  }, [mainTab, rowCursor, searchResultRows, userId]);

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
      setTopTab("chats");
      setMainTab("groups");
      setGroupSubTab("explore");
    }
    setGroupDetails(null);
    setGroupNameEdit("");
    setGroupLocationEdit("");
    setGroupPetFocusEdit([]);
    setGroupDetailsErrors({});
  }, [groupDetails]);

  useEffect(() => {
    if (!routeGroupDetailId || loading) return;
    const target = rows.find((row) => row.chatId === routeGroupDetailId && row.roomType === "group");
    if (!target) return;
    openManagedGroup(target);
    setRouteGroupDetailId(null);
  }, [loading, openManagedGroup, routeGroupDetailId, rows]);

  const openGroupMemberProfile = useCallback((memberId: string) => {
    if (groupDetails && "invitePending" in groupDetails) {
      setTopTab("chats");
      setMainTab("groups");
      setGroupSubTab("explore");
    }
    setGroupDetails(null);
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
    setGroupManagementLoading(true);
    setGroupManagementError(false);
    const isExplore = Boolean(groupDetails && "invitePending" in groupDetails);
    const loadSnapshot = isExplore
      ? fetchNativeGroupPreviewMembers(chatId).then((members) => ({ members, joinRequests: [], pendingInvites: [], mediaUrls: [] }))
      : fetchNativeGroupManagementSnapshot(chatId);
    void loadSnapshot
      .then((snapshot) => {
        if (!cancelled) {
          setGroupManagement(snapshot);
          setGroupManagementError(false);
        }
      })
      .catch((error) => {
        console.warn("[native.chats] group_details_members_failed", error);
        if (!cancelled) {
          setGroupManagement(null);
          setGroupManagementError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setGroupManagementLoading(false);
      });
    return () => { cancelled = true; };
  }, [groupDetails]);

  const refreshGroupManagement = useCallback(async (chatId: string) => {
    try {
      setGroupManagement(await fetchNativeGroupManagementSnapshot(chatId));
    } catch {
      setStatus("Unable to refresh group management.");
    }
  }, []);

  const handleJoinExploreGroup = useCallback(async (group: NativeExploreGroup) => {
    if (!userId) return;
    try {
      if (group.invitePending) {
        await acceptNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId });
        setInvitedExploreGroups((current) => current.filter((item) => item.id !== group.id));
        setDismissedInviteBannerIds((current) => { const next = new Set(current); next.add(group.inviteId || group.id); return next; });
        setPendingGroupInvitePrompt(null);
        setGroupDetails(null);
        await loadRows({ force: true, silent: true });
        onNavigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&joined=1`);
        return;
      } else if (group.joinMethod === "instant") {
        await joinNativePublicGroup({ userId, chatId: group.id });
      } else {
        await requestNativeGroupJoin({ userId, chatId: group.id });
        setExploreGroups((current) => current.map((item) => item.id === group.id ? { ...item, requested: true } : item));
        setGroupDetails((current) => current && "invitePending" in current && current.id === group.id ? { ...current, requested: true } : current);
        setStatus("Request sent.");
        return;
      }
      setGroupDetails(null);
      await loadRows({ force: true, silent: true });
      onNavigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&joined=1`);
    } catch {
      setStatus("Unable to join group right now.");
    }
  }, [loadRows, onNavigate, userId]);

  const handleDeclineExploreInvite = useCallback(async (group: NativeExploreGroup) => {
    if (!userId) return;
    try {
      await declineNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, userId });
      setInvitedExploreGroups((current) => current.filter((item) => item.id !== group.id));
      setGroupDetails(null);
      await loadRows({ force: true, silent: true });
    } catch {
      setStatus("Unable to decline invite right now.");
    }
  }, [loadRows, userId]);

  const confirmInviteInboxDecisions = useCallback(async (decisions: Record<string, "accept" | "decline">) => {
    if (!userId) return;
    const entries = invitedExploreGroups.filter((group) => decisions[group.id]);
    if (!entries.length) return;
    for (const group of entries) {
      const decision = decisions[group.id];
      if (decision === "accept") {
        await acceptNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId });
      } else {
        await declineNativeGroupInvite({ chatId: group.id, inviteId: group.inviteId, userId });
      }
    }
    setInviteInboxOpen(false);
    setGroupDetails(null);
    await loadRows({ force: true, silent: true });
  }, [invitedExploreGroups, loadRows, userId]);

  const handleJoinCode = useCallback(async () => {
    if (!userId) return;
    try {
      const joined = await joinNativeGroupByCode({ userId, code: groupCodeDraft });
      setJoinCodeOpen(false);
      setGroupCodeDraft("");
      await loadRows({ force: true, silent: true });
      onNavigate(`/chat-dialogue?room=${encodeURIComponent(joined.chatId)}&name=${encodeURIComponent(joined.name)}&joined=1`);
    } catch {
      setStatus("Code not found or group could not be joined.");
    }
  }, [groupCodeDraft, loadRows, onNavigate, userId]);

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
    if (countWords(groupDescriptionDraft) > GROUP_DESCRIPTION_WORD_LIMIT) {
      setStatus(`Description must be ${GROUP_DESCRIPTION_WORD_LIMIT} words or fewer.`);
      return;
    }
    setGroupCreating(true);
    try {
	      let avatarUrl: string | null = null;
	      if (groupCoverDraft) {
	        const { data: authData, error: authError } = await supabase.auth.getUser();
	        const authUid = authData.user?.id ?? null;
	        if (authError || !authUid) throw new Error("not_authenticated");
	        avatarUrl = await uploadNativeGroupCover({ asset: groupCoverDraft, userId: authUid });
	      }
      const created = await createNativeGroupChat({
        userId,
        name: groupNameDraft,
        description: groupDescriptionDraft,
        avatarUrl,
        joinMethod: groupJoinMethodDraft,
        visibility: groupVisibilityDraft,
        locationLabel: groupLocationDraft,
        locationCountry: groupCountryDraft,
        petFocus: groupPetFocusDraft,
        inviteUserIds: groupInviteIds,
      });
      setCreateGroupOpen(false);
      resetCreateGroupDrafts();
      void loadRows({ force: true, silent: true }).catch((error) => console.warn("[native.chats] post_create_group_refresh_failed", error));
      onNavigate(`/chat-dialogue?room=${encodeURIComponent(created.chatId)}&name=${encodeURIComponent(created.name)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (/file_too_large/i.test(message)) setStatus("That file's too big. Try a photo under 15MB.");
      else setStatus("Couldn't create group. Check the name and try again.");
    } finally {
      setGroupCreating(false);
    }
  }, [groupCountryDraft, groupCoverDraft, groupCreating, groupDescriptionDraft, groupInviteIds, groupJoinMethodDraft, groupLocationDraft, groupNameDraft, groupPetFocusDraft, groupVisibilityDraft, loadRows, onNavigate, resetCreateGroupDrafts, selfVerified, userId]);

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
    });
    setGroupDetailsErrors((current) => ({ ...current, cover: false }));
  }, []);

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
    await (supabase.from("discover_match_seen" as never).upsert({
      viewer_id: userId,
      matched_user_id: normalized,
    } as never, { onConflict: "viewer_id,matched_user_id", ignoreDuplicates: true }) as unknown as Promise<unknown>);
  }, [userId]);

  const openFirstUnseenMatchModal = useCallback(async () => {
    if (!userId || matchModal || matchProbeRef.current.inFlight || matchProbeRef.current.userId === userId) return;
    matchProbeRef.current = { userId, inFlight: true };
    try {
      const [seen, matchesRows] = await Promise.all([
        readSeenMatchSet(userId),
        fetchNativeUserMatches(userId),
      ]);
      if (!matchesRows.length) return;
      const blocked = new Set(rowsRef.current.filter((row) => row.blockedByMe || row.blockedByThem || row.unmatchedByMe || row.unmatchedByThem).map((row) => row.peerUserId).filter(Boolean) as string[]);
      const candidateIds: string[] = [];
      for (const row of matchesRows) {
        const counterpart: string = row.user1_id === userId ? row.user2_id : row.user1_id;
        if (!counterpart || counterpart === userId) continue;
        if (seen.has(counterpart) || blocked.has(counterpart)) continue;
        candidateIds.push(counterpart);
      }
      if (!candidateIds.length) return;
      const { data, error } = await supabase
        .from("profiles" as never)
        .select("id,display_name,avatar_url" as never)
        .in("id" as never, candidateIds.slice(0, 20) as never)
        .limit(20);
      if (error || !Array.isArray(data) || data.length === 0) return;
      const byId = new Map((((data || []) as unknown) as Array<{ id?: string; display_name?: string | null; avatar_url?: string | null }>).map((row) => [String(row.id || ""), row] as const));
      const targetUserId = candidateIds.find((id) => byId.has(id));
      if (!targetUserId) return;
      const target = byId.get(targetUserId);
      if (!target) return;
      const name = String(target.display_name || "Conversation");
      setMatchModal({ userId: targetUserId, name, avatarUrl: resolveNativeAvatarUrl(target.avatar_url), roomId: null });
      void markMatchSeenPersisted(targetUserId);
      try {
        const roomId = await ensureNativeDirectChatRoom(targetUserId, name);
        setMatchModal((current) => current?.userId === targetUserId ? { ...current, roomId } : current);
      } catch {
        // Keep modal visible; the quick hello action can retry the canonical RPC.
      }
    } catch {
      // Passive match surfacing is non-blocking.
    } finally {
      matchProbeRef.current = { userId, inFlight: false };
    }
  }, [markMatchSeenPersisted, matchModal, userId]);

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
    setRows((current) => current.filter((row) => row.chatId !== pendingDeleteRow.chatId));
    setPendingDeleteRow(null);
    setStatus("Conversation removed.");
  }, [pendingDeleteRow]);

  const sendMatchQuickHello = useCallback(async () => {
    if (!matchModal || matchSending || !userId) return;
    setMatchSending(true);
    try {
      const { data: roomData, error: roomError } = await (supabase.rpc as unknown as (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)("send_match_first_message", {
        p_target_user_id: matchModal.userId,
        p_target_name: matchModal.name,
        p_body: matchQuickHello.trim(),
      });
      if (roomError) throw roomError;
      const roomId = String(roomData || "").trim();
      if (!roomId) throw new Error("room_not_created");
      await markMatchSeenPersisted(matchModal.userId);
      await markNativeChatRoomRead({ roomId, userId });
      setMatchModal(null);
      setMatchQuickHello("");
      void loadRows({ force: true, silent: true });
      onNavigate(`/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(matchModal.name)}&with=${encodeURIComponent(matchModal.userId)}`);
    } catch {
      setStatus("Unable to send hello right now.");
    } finally {
      setMatchSending(false);
    }
  }, [loadRows, markMatchSeenPersisted, matchModal, matchQuickHello, matchSending, onNavigate, userId]);

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
  const discoveryDeckProfiles = discoverProfiles.slice(0, 3);
  const currentDiscoveryProfile = discoveryDeckProfiles[0] ?? null;
  const renderDiscoverEmpty = discoverStatus === "ready" && !discoveryQuotaLocked && (discoverProfiles.length === 0 || discoveryQuotaReached);

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
      const result = await sendNativePublicProfileWave(userId, profile.id);
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
      if (result.mutual || await hasReciprocalWave(userId, profile.id)) {
        setMatchModal({ userId: profile.id, name: profile.displayName, avatarUrl: resolveNativeAvatarUrl(profile.avatarUrl), roomId: null });
        void markMatchSeenPersisted(profile.id);
        try {
          const roomId = await ensureNativeDirectChatRoom(profile.id, profile.displayName);
          setMatchModal((current) => current?.userId === profile.id ? { ...current, roomId } : current);
        } catch {
          // Keep match modal visible; quick hello can retry via the match RPC.
        }
        setStatus("It's a match.");
      } else {
        setStatus(result.status === "duplicate" ? "You already waved. Open chats when the match is ready." : "Wave sent.");
      }
      return true;
    } catch {
      rollbackDiscoveryAction(profile, "wave");
      setStatus("Wave could not send. Try again.");
      return false;
    } finally {
      setDiscoverBusyId(null);
    }
  }, [bumpNativeDiscoverySeen, commitDiscoveryAction, discoverBusyId, discoveryQuotaCopy, discoveryQuotaReached, enqueueNativeChatNotification, launchNativeDiscoverySendCue, markMatchSeenPersisted, rollbackDiscoveryAction, userId]);

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
    setProfileSheetUserId(profile.id);
  }, [discoverBusyId]);

  const handleProfileSheetWave = useCallback(async () => {
    if (!profileSheetUserId) return;
    const profile = discoverProfiles.find((p) => p.id === profileSheetUserId);
    if (!profile) return;
    const sent = await handleWaveDiscovery(profile);
    if (sent) setProfileSheetUserId(null);
  }, [discoverProfiles, handleWaveDiscovery, profileSheetUserId]);

  const executeConfirmedStar = useCallback(async () => {
    if (!userId || !confirmStarTarget || starActionLoading) return;
    setStarActionLoading(true);
    setDiscoverBusyId(confirmStarTarget.id);
    setStarConfirmMessage(null);
    setStatus(null);
    try {
      if (discoveryQuotaReached) {
        setStarConfirmMessage(discoveryQuotaCopy);
        setStatus(discoveryQuotaCopy);
        return;
      }
      const quotaAccepted = await bumpNativeDiscoverySeen();
      if (!quotaAccepted) {
        setStarConfirmMessage(discoveryQuotaCopy);
        setStatus(discoveryQuotaCopy);
        return;
      }
      const result = await sendNativePublicProfileStarChat(userId, confirmStarTarget.id, confirmStarTarget.displayName);
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
          setStarConfirmMessage("You're out of Stars for this cycle.");
          setStatus("You're out of Stars for this cycle.");
        }
        return;
      }
      if (result.status === "blocked") {
        setConfirmStarTarget(null);
        setStarConfirmMessage(null);
        setStatus("Cannot start chat with this user.");
        return;
      }
      if (result.status !== "sent") {
        setConfirmStarTarget(null);
        setStarConfirmMessage(null);
        setStatus("Unable to send Star right now.");
        return;
      }
      const targetId = confirmStarTarget.id;
      const targetName = confirmStarTarget.displayName;
      await launchNativeDiscoverySendCue("star", { onCommit: () => commitDiscoveryAction(targetId, "star") });
      setConfirmStarTarget(null);
      setStarConfirmMessage(null);
      setStatus("Star sent.");
      onNavigate(`/chat-dialogue?room=${encodeURIComponent(result.roomId)}&name=${encodeURIComponent(targetName)}&with=${encodeURIComponent(targetId)}`);
    } catch {
      setStatus("Unable to send Star right now.");
    } finally {
      setStarActionLoading(false);
      setDiscoverBusyId(null);
    }
  }, [bumpNativeDiscoverySeen, commitDiscoveryAction, confirmStarTarget, discoveryQuotaCopy, discoveryQuotaReached, launchNativeDiscoverySendCue, onNavigate, starActionLoading, userId]);

  const handleResurfacePassedProfiles = useCallback(() => {
    if (!userId) return;
    setPassedDiscoveryIds(new Set());
    void AsyncStorage.removeItem(discoveryPassedKey(userId));
    void AsyncStorage.removeItem(discoveryPassedSessionKey(userId));
    void loadRows({ force: true, silent: true });
  }, [loadRows, userId]);

  const hasLoadError = /failed to load/i.test(status || "");

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
      if (options?.open) onNavigate(`/chat-dialogue?room=${encodeURIComponent(groupDetails.id)}&name=${encodeURIComponent(groupDetails.name)}`);
      if (options?.close) closeGroupDetails();
      return;
    }
    const chatId = groupDetails.chatId;
    const currentMemberRole = groupManagement?.members.find((member) => member.userId === userId)?.role?.toLowerCase() || "";
    const canManageGroup = groupDetails.createdBy === userId || currentMemberRole === "admin" || currentMemberRole === "creator";
    if (!canManageGroup) {
      if (options?.open) onNavigate(`/chat-dialogue?room=${encodeURIComponent(chatId)}&name=${encodeURIComponent(groupDetails.chatName || "Group")}`);
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
    try {
	      if (groupEditCoverDraft) {
	        const { data: authData, error: authError } = await supabase.auth.getUser();
	        const authUid = authData.user?.id ?? null;
	        if (authError || !authUid) throw new Error("not_authenticated");
	        if (groupDetails.createdBy && authUid !== groupDetails.createdBy) throw new Error("not_authorized");
	        avatarUrl = await uploadNativeGroupCover({ asset: groupEditCoverDraft, chatId, userId: authUid });
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
      if (options?.open) onNavigate(`/chat-dialogue?room=${encodeURIComponent(chatId)}&name=${encodeURIComponent(savedName)}`);
      if (options?.close) setGroupDetails(null);
      setGroupDetailsErrors({});
      setStatus(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (/file_too_large/i.test(message)) setStatus("That file's too big. Try a photo under 15MB.");
      else if (/not_authorized|permission|denied|policy|rls/i.test(message)) setStatus("Only the group's creator can change the cover.");
      else setStatus("Unable to update group right now.");
    }
  }, [closeGroupDetails, groupDescriptionEdit, groupDetails, groupEditCoverDraft, groupLocationEdit, groupManagement?.members, groupNameEdit, groupPetFocusEdit, onNavigate, patchGroupEverywhere, userId]);

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
          <View style={styles.sideActionSlot} />
          <View style={styles.topToggleCenter}>
            <View style={styles.topToggle}>
              <Pressable onPress={() => handleTopTabPress("discover")} style={[nativeModalStyles.appTopSegmentButton, topTab === "discover" && nativeModalStyles.appTopSegmentButtonActive]}>
                <Text style={[styles.topToggleText, topTab === "discover" && styles.topToggleTextActive]}>Discover</Text>
              </Pressable>
              <Pressable onPress={() => handleTopTabPress("chats")} style={[nativeModalStyles.appTopSegmentButton, topTab === "chats" && nativeModalStyles.appTopSegmentButtonActive]}>
                <Text style={[styles.topToggleText, topTab === "chats" && styles.topToggleTextActive]}>Chats</Text>
                {topTab !== "chats" && unreadTotal > 0 ? <View style={styles.toggleUnreadBadge}><Text style={styles.toggleUnreadText}>{unreadTotal > 99 ? "99+" : unreadTotal}</Text></View> : null}
                {topTab === "chats" && unreadTotal > 0 ? <View style={styles.toggleUnreadDot} /> : null}
              </Pressable>
            </View>
          </View>
          {topTab === "discover" && discoverStatus !== "age_blocked" ? (
            <Pressable accessibilityLabel="Filter" onPress={() => setFilterOpen(true)} style={styles.iconButton}>
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
                {MAIN_TABS.map((tab) => {
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
	                <Pressable accessibilityLabel="Search" onPress={() => setSearchOpen((open) => !open)} style={styles.iconButtonSmall}>
	                  <Feather color={huddleColors.iconMuted} name="search" size={16} />
	                </Pressable>
	              </View>
	            </View>
	            {mainTab === "groups" ? (
	              <View style={styles.groupSubTabs}>
                  <View style={styles.groupSubTabRail}>
	                  <Pressable onPress={() => setGroupSubTab("my")} style={[nativeModalStyles.appPillTab, groupSubTab === "my" && nativeModalStyles.appPillTabActive]}>
	                    <Text style={[styles.groupSubTabText, groupSubTab === "my" && styles.groupSubTabTextActive]}>My Groups</Text>
	                  </Pressable>
	                  <Pressable onPress={() => setGroupSubTab("explore")} style={[nativeModalStyles.appPillTab, groupSubTab === "explore" && nativeModalStyles.appPillTabActive]}>
	                    <Text style={[styles.groupSubTabText, groupSubTab === "explore" && styles.groupSubTabTextActive]}>Explore</Text>
	                  </Pressable>
                  </View>
                  <View style={styles.groupSubTabActions}>
                    {groupSubTab === "explore" ? (
                      <Pressable accessibilityLabel="Sort groups" onPress={() => setGroupExploreSortOpen(true)} style={styles.iconButtonSmall}>
                        <Feather color={huddleColors.iconMuted} name="sliders" size={16} />
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityLabel="Join with code" onPress={() => setJoinCodeOpen(true)} style={styles.iconButtonSmall}>
                      <Feather color={huddleColors.iconMuted} name="hash" size={16} />
                    </Pressable>
                    <Pressable accessibilityLabel="Create Group" onPress={() => selfVerified ? setCreateGroupOpen(true) : setStatus("Get verified to start a group chat and coordinate your next local meetup.")} style={[styles.iconButtonSmall, selfVerified && styles.iconButtonSmallAccent]}>
                      <Feather color={selfVerified ? huddleColors.onPrimary : huddleColors.iconMuted} name="users" size={16} />
                    </Pressable>
                  </View>
	              </View>
	            ) : null}
          </>
        ) : null}
      </View>
      <ScrollView
        alwaysBounceVertical
        contentContainerStyle={[styles.content, topTab === "discover" && styles.discoverContent, { paddingBottom: screenInsets.bottom + huddleSpacing.x10 + huddleSpacing.x8 }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={huddleColors.blue} onRefresh={handleRefresh} />}
        scrollEnabled={!discoverySwipeActive}
        showsVerticalScrollIndicator={false}
      >
        {status && topTab !== "discover" ? <View style={styles.statusBanner}><Feather color={huddleColors.blue} name="info" size={16} /><Text style={styles.statusText}>{status}</Text></View> : null}
        {status && topTab === "discover" ? <DiscoverToast message={status} onDismiss={() => setStatus(null)} /> : null}
        {loading ? <NativeLoadingState variant="inline" /> : null}
        {!loading && topTab === "discover" && discoverStatus === "age_blocked" ? <NativeChatsEmptyState body="Discover & Chat features are for 16+ only. For now, join the social conversation and help protect the pack by keeping an eye on the Map." image={discoverAgeGateImage} /> : null}
        {!loading && topTab === "discover" && discoverStatus === "location_required" ? (
          <NativeChatsEmptyState
            body={discoverLocationPermission.canAskAgain
              ? "Huddle uses your location to show nearby people, groups, and map pins."
              : "Location is off for Huddle. Open Settings, tap Location, then choose While Using the App."}
            buttonLabel={discoverLocationPermission.canAskAgain ? "Enable Location" : "Open Huddle Settings"}
            onPress={() => { void handleDiscoverEnableLocation(); }}
          />
        ) : null}
        {!loading && topTab === "discover" && renderDiscoverEmpty ? <DiscoveryEndState passedCount={passedDiscoveryIds.size} quotaReached={discoveryQuotaReached} onResuface={handleResurfacePassedProfiles} onExpandSearch={() => setFilterOpen(true)} /> : null}
        {!loading && topTab === "discover" && discoveryQuotaLocked ? <NativeChatsEmptyState body={discoveryQuotaCopy} buttonLabel={effectiveTier === "free" ? "Upgrade to Huddle+" : "Upgrade to Gold"} onPress={() => onNavigate("/premium")} title="Discover limit reached" /> : null}
        {!loading && topTab === "discover" && discoverStatus === "ready" && !renderDiscoverEmpty && !discoveryQuotaReached && currentDiscoveryProfile ? (
          <View style={styles.discoveryStack}>
            {discoveryDeckProfiles.length > 1 ? <DiscoveryDeckBottomLayers /> : null}
            {discoveryDeckProfiles.map((profile, index) => {
                const profileChips: string[] = [];
                if (profile.petSpecies?.length === 1) {
                  const sp = profile.petSpecies[0];
                  profileChips.push(`${SPECIES_CHIP_EMOJI[sp] ?? "🐾"} ${sp}`);
                }
                if (effectiveTier === "gold" && filters.activeOnly) profileChips.push("Active today");
                if (effectiveTier === "gold" && filters.whoWavedAtMe) profileChips.push("Waved at you");
                const isLastCard = discoverProfiles.length === 1;
                return <DiscoveryProfileCard key={profile.id} busy={discoverBusyId === profile.id} chips={profileChips} index={index} isLast={isLastCard} profile={profile} statusVisible={Boolean(status)} swipeXSV={discoverySwipeXSV} onPass={handlePassDiscovery} onProfileTap={handleDiscoveryProfileTap} onStar={handleStarDiscovery} onSwipePhaseChange={setDiscoverySwipeActive} onWave={handleWaveDiscovery} />;
              })}
          </View>
        ) : null}
	        {!loading && topTab === "chats" && mainTab === "groups" && groupSubTab === "explore" && visibleExploreGroups.length > 0 ? (
	          <View style={styles.exploreList}>
		            {visibleExploreGroups.map((group) => <ExploreGroupCard key={group.id} group={group} onHide={(groupId) => setHiddenExploreGroupIds((current) => new Set(current).add(groupId))} onOpen={openExploreGroupOrInvitePrompt} />)}
	          </View>
	        ) : null}
        {!loading && topTab === "chats" && mainTab === "friends" ? <MatchedRail rows={avatarOnlyMatches} onOpen={handleOpenRow} /> : null}
        {!loading && topTab === "chats" && mainTab === "groups" && groupSubTab === "my" && firstPendingGroupInvite ? (
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
        {!loading && !hasLoadError && topTab === "chats" && (mainTab !== "groups" || groupSubTab !== "explore") && visibleRows.length === 0 && !(mainTab === "friends" && avatarOnlyMatches.length > 0) && !(mainTab === "groups" && groupSubTab === "my" && invitedExploreGroups.length > 0) ? <NativeChatsEmptyState body={mainTab === "groups" ? "Better in a pack! Create or join a group to start coordinating local meetups." : mainTab === "service" ? "No local pros nearby to offer service yet. Be the first to provide care support!" : "Meet your friends on the Social and send a star to start a chat!"} image={mainTab === "service" ? serviceImage : emptyChatImage} /> : null}
        {!loading && !hasLoadError && topTab === "chats" && mainTab === "groups" && groupSubTab === "explore" && visibleExploreGroups.length === 0 ? <NativeChatsEmptyState body="No public groups nearby yet. Be the first to start a local pack!" image={emptyChatImage} /> : null}
        {!loading && topTab === "chats" && (mainTab !== "groups" || groupSubTab !== "explore") && visibleRows.length > 0 ? <View style={styles.list}>{visibleRows.map((row) => mainTab === "groups" ? <NativeGroupChatRow key={`${row.roomType}:${row.chatId}`} currentUserId={userId} row={row} onManage={openManagedGroup} onOpenDetails={openManagedGroup} onPress={handleOpenRow} /> : <NativeChatRow key={`${row.roomType}:${row.chatId}`} row={row} userId={userId} onAvatarPress={handleAvatarProfilePress} onDelete={setPendingDeleteRow} onPress={handleOpenRow} />)}{!searchResultRows && (hasMoreRows || (mainTab === "friends" ? friendsConversationRowCount > visibleRows.length : rows.length > visibleRows.length)) ? <Pressable onPress={handleLoadMore} style={nativeModalStyles.appLoadMoreButton}><Text style={styles.loadMoreText}>Load more</Text></Pressable> : null}</View> : null}
	      </ScrollView>
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
	      <DiscoveryFilterModal effectiveTier={effectiveTier} filters={filters} filterRow={filterRow} open={filterOpen} onApply={() => { setFilterOpen(false); setFilterRow(null); void loadRows({ force: true }); }} onClose={() => { setFilterOpen(false); setFilterRow(null); }} onLockedFilter={requestFilterTier} onReset={() => { setFilters({ ...DEFAULT_FILTERS }); setFilterRow(null); }} onSetFilterRow={setFilterRow} onUpdate={setFilters} />
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
          void (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)("block_user", { p_blocked_id: member.userId })
            .then(({ error }) => {
              if (error) throw error;
              setStatus(`${member.name || "Member"} blocked.`);
            })
            .catch(() => setStatus("Unable to block member right now."));
        }}
        onInviteMembers={(group, ids) => {
          if (!userId) return;
          const chatId = "chatId" in group ? group.chatId : group.id;
          const name = ("chatName" in group ? group.chatName : group.name) || "Group";
          void inviteNativeGroupMembers({ chatId, chatName: name, inviterUserId: userId, inviteUserIds: ids }).then(() => refreshGroupManagement(chatId)).catch(() => setStatus("Unable to invite members right now."));
        }}
        onCancelInvite={(group, invite) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
          void cancelNativeGroupInvite({ chatId, inviteId: invite.id })
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
            await sendNativeChatMessage({ roomId: chatId, senderId: userId, content: `${selfMatchProfile.name || "Someone"} left the group.` });
            await removeNativeGroupMember({ chatId, userId });
            setGroupDetails(null);
            void loadRows({ force: true, silent: true });
            setStatus("Left group.");
          } catch (error) {
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
          void removeNativeGroupMember({ chatId, userId: memberId }).then(() => refreshGroupManagement(chatId)).catch(() => setStatus("Unable to remove member right now."));
        }}
        onRequestAction={(group, request, action) => {
          const chatId = "chatId" in group ? group.chatId : group.id;
          return updateNativeGroupJoinRequest({ chatId, requestId: request.id, userId: request.userId, action }).then(() => refreshGroupManagement(chatId)).catch((error) => {
            setStatus("Unable to update join request right now.");
            throw error;
          });
        }}
        onRemoveGroup={async (group) => {
          try {
            const chatId = "chatId" in group ? group.chatId : group.id;
            await removeNativeGroupChat(chatId);
            setGroupDetails(null);
            void loadRows({ force: true, silent: true });
            setStatus("Group removed.");
          } catch (error) {
            setStatus("Unable to remove group right now.");
            throw error;
          }
        }}
        onSaveDetails={() => { void commitGroupDetailsDraft(); }}
        onToggleMute={async (group, muted) => {
          try {
            const chatId = "chatId" in group ? group.chatId : group.id;
            await setNativeGroupMuteState({ chatId, muted });
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
		      <CreateGroupModal countryLabel={groupCountryDraft} cover={groupCoverDraft} creating={groupCreating} description={groupDescriptionDraft} joinMethod={groupJoinMethodDraft} location={groupLocationDraft} name={groupNameDraft} open={createGroupOpen} petFocus={groupPetFocusDraft} visibility={groupVisibilityDraft} onChangeDescription={setGroupDescriptionDraft} onChangeJoinMethod={setGroupJoinMethodDraft} onChangeLocation={setGroupLocationDraft} onChangeName={setGroupNameDraft} onChangePetFocus={setGroupPetFocusDraft} onChangeVisibility={setGroupVisibilityDraft} onClose={closeCreateGroupModal} onPickCover={pickGroupCover} onRemoveCover={() => setGroupCoverDraft(null)} onSubmit={handleCreateGroup} />
      <ConfirmDeleteModal row={pendingDeleteRow} onCancel={() => setPendingDeleteRow(null)} onConfirm={confirmDeleteConversation} />
      <MatchModal modal={matchModal} onClose={closeMatchModal} onQuickHello={() => void sendMatchQuickHello()} quickHello={matchQuickHello} self={selfMatchProfile} sending={matchSending} setQuickHello={setMatchQuickHello} />
      <NativePublicProfileModal hideActions showWave onWave={handleProfileSheetWave} onClose={() => setProfileSheetUserId(null)} onNavigate={onNavigate} open={Boolean(profileSheetUserId)} userId={profileSheetUserId} />
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
            lastLat: null,
            lastLng: null,
            isVerified: false,
            nonSocial: false,
          },
        } : null}
      />
      <ConfirmStarModal errorMessage={starConfirmMessage} loading={starActionLoading} target={confirmStarTarget} onCancel={() => { setConfirmStarTarget(null); setStarConfirmMessage(null); }} onConfirm={() => void executeConfirmedStar()} />
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
        <AppBottomSheet>
          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Group invites</Text>
            <AppModalIconButton accessibilityLabel="Close group invites" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={22} />
            </AppModalIconButton>
          </AppBottomSheetHeader>
		          <AppBottomSheetScroll fill>
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

function GroupInvitePromptModal({ group, onClose, onJoin }: { group: NativeExploreGroup | null; onClose: () => void; onJoin: (group: NativeExploreGroup) => void }) {
  if (!group) return null;
  return (
    <AppConfirmModal
      body={(
        <Text style={nativeModalStyles.appConfirmBody}>
          <Text style={styles.groupInvitePromptStrong}>{group.inviterName || "Someone"}</Text>
          {` invited you to join `}
          <Text style={styles.groupInvitePromptStrong}>{group.name || "a group"}</Text>
          {". Want to hop in?"}
        </Text>
      )}
      cancel="Not Now"
      confirm="Join"
      onCancel={onClose}
      onConfirm={() => onJoin(group)}
      open={Boolean(group)}
      showClose
      title="Group invite 🐾"
    />
  );
}

function DiscoveryFilterModal({
  effectiveTier,
  filters,
  filterRow,
  onApply,
  onClose,
  onLockedFilter,
  onReset,
  onSetFilterRow,
  onUpdate,
  open,
}: {
  effectiveTier: "free" | "plus" | "gold";
  filters: NativeChatDiscoveryFilters;
  filterRow: keyof NativeChatDiscoveryFilters | null;
  onApply: () => void;
  onClose: () => void;
  onLockedFilter: (tier: StarUpgradeTier) => void;
  onReset: () => void;
  onSetFilterRow: (row: keyof NativeChatDiscoveryFilters | null) => void;
  onUpdate: (filters: NativeChatDiscoveryFilters) => void;
  open: boolean;
}) {
  const [expandedTier, setExpandedTier] = useState<StarUpgradeTier | null>(null);
  const filterScrollRef = useRef<ScrollView | null>(null);
  const patch = (next: Partial<NativeChatDiscoveryFilters>) => onUpdate({ ...filters, ...next });
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
    onReset();
    onSetFilterRow(null);
    setExpandedTier(null);
  };
  useEffect(() => {
    if (!open) setExpandedTier(null);
  }, [open]);
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible={open} onRequestClose={onClose}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}>
          <AppBottomSheet>
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
                        const toggleActive = toggleRow ? Boolean(filters[row.key]) : false;
                        return (
                          <View key={row.key} style={styles.filterSection}>
                            <Pressable
                              onPress={() => toggleRow ? patch({ [row.key]: !filters[row.key] } as Partial<NativeChatDiscoveryFilters>) : toggleFilterRow(row.key, expanded)}
                              style={styles.filterRow}
                            >
                              <View style={styles.filterTitleWrap}>
                                <Text style={styles.filterLabel}>{row.label}</Text>
                              </View>
                              {toggleRow ? (
                                <View style={[styles.nativeSwitch, toggleActive && styles.nativeSwitchActive]}><View style={[styles.nativeSwitchKnob, toggleActive && styles.nativeSwitchKnobActive]} /></View>
                              ) : (
                                <View style={styles.filterSummaryWrap}>
                                  <Text numberOfLines={1} style={styles.filterSummary}>{filterSummary(filters, row.key)}</Text>
                                  <Feather color={huddleColors.iconSubtle} name={expanded ? "chevron-up" : "chevron-down"} size={16} />
                                </View>
                              )}
                            </Pressable>
                            {expanded && !toggleRow ? (
                              <View style={styles.filterInlineEditor}>
                                <FilterRowEditor filters={filters} row={row.key} onPatch={patch} />
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
                    const toggleActive = toggleRow ? Boolean(filters[row.key]) : false;
                    return (
                      <View key={row.key} style={styles.filterSection}>
                        <Pressable
                          onPress={() => toggleRow ? patch({ [row.key]: !filters[row.key] } as Partial<NativeChatDiscoveryFilters>) : toggleFilterRow(row.key, expanded)}
                          style={styles.filterRow}
                        >
                          <View style={styles.filterTitleWrap}>
                            <Text style={styles.filterLabel}>{row.label}</Text>
                          </View>
                          {toggleRow ? (
                            <View style={[styles.nativeSwitch, toggleActive && styles.nativeSwitchActive]}><View style={[styles.nativeSwitchKnob, toggleActive && styles.nativeSwitchKnobActive]} /></View>
                          ) : (
                            <View style={styles.filterSummaryWrap}>
                              <Text numberOfLines={1} style={styles.filterSummary}>{filterSummary(filters, row.key)}</Text>
                              <Feather color={huddleColors.iconSubtle} name={expanded ? "chevron-up" : "chevron-down"} size={16} />
                            </View>
                          )}
                        </Pressable>
                        {expanded && !toggleRow ? (
                          <View style={styles.filterInlineEditor}>
                            <FilterRowEditor filters={filters} row={row.key} onPatch={patch} />
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
              <AppModalButton onPress={onApply}><Text style={styles.modalPrimaryLabel}>Apply Filters</Text></AppModalButton>
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
  const themeColor = isGold ? huddleColors.tierBadgeGold : huddleColors.tierBadgePlus;
  const monthly = plan.monthly.amount;
  const annual = plan.annual.amount;
  const annualPerMonth = annual / 12;
  const displayPrice = billing === "annual" ? annualPerMonth : monthly;
  const discountPct = Math.round((1 - annualPerMonth / monthly) * 100);
  const features: Array<{ icon: keyof typeof Feather.glyphMap; title: string; subtitle: string }> = isGold ? [
    { icon: "globe", title: "Max Discovery", subtitle: "Keep discovering without the usual limits." },
    { icon: "trending-up", title: "Top Profile Boost", subtitle: "Priority placement in Discover and Services." },
    { icon: "star", title: `${caps.starsPerMonth} Stars / month`, subtitle: "Your fastest way to connect." },
    { icon: "radio", title: `Broadcasts · ${caps.broadcastRadiusKm}km · ${caps.broadcastDurationHours}h`, subtitle: "Your widest reach, for even longer." },
    { icon: "sliders", title: "All Filters", subtitle: "Every filter unlocked. Less noise, better matches." },
    { icon: "video", title: "Video Uploads", subtitle: "Gold exclusive." },
    { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
  ] : [
    { icon: "users", title: "Open Discovery", subtitle: "Double the chances. Better matches." },
    { icon: "trending-up", title: "Profile Boost", subtitle: "Get seen earlier in Discover and Services." },
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

function GroupDetailsModal({
  currentUserId,
  detailsErrors,
  descriptionEdit,
  editCover,
  group,
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
  onBlockMember: (member: NativeGroupManagementSnapshot["members"][number]) => void;
  onJoin: (group: NativeExploreGroup) => void;
  onLeaveGroup: (group: NativeExploreGroup | NativeChatInboxRow) => Promise<void>;
  onOpenChat: (group: NativeExploreGroup | NativeChatInboxRow) => void;
  onOpenMemberProfile: (userId: string) => void;
  onPickCover: () => void;
  onReportMember: (member: NativeGroupManagementSnapshot["members"][number]) => void;
  onRemoveMember: (group: NativeExploreGroup | NativeChatInboxRow, memberId: string) => void;
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
  const [expandedMetaEditor, setExpandedMetaEditor] = useState<"location" | "pet" | null>(null);
  const [petFocusOpen, setPetFocusOpen] = useState(false);
  const [petFocusOther, setPetFocusOther] = useState("");
  const [petFocusBreedOpen, setPetFocusBreedOpen] = useState<string | null>(null);
  const [memberActionTarget, setMemberActionTarget] = useState<NativeGroupManagementSnapshot["members"][number] | null>(null);
  const [memberActionAnchor, setMemberActionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false);
  const [requestDecisions, setRequestDecisions] = useState<Record<string, "approve" | "decline">>({});
  const [requestErrors, setRequestErrors] = useState<Record<string, boolean>>({});
  const [requestConfirming, setRequestConfirming] = useState(false);
  const [groupActionConfirm, setGroupActionConfirm] = useState<"leave" | "remove" | null>(null);
  const [groupActionBusy, setGroupActionBusy] = useState<"mute" | "leave" | "remove" | null>(null);
  const activeGroupId = group ? "chatId" in group ? group.chatId : group.id : null;
  useEffect(() => {
    setInviteDraft([]);
    setInviteSearch("");
    setInviteSearchResults([]);
    setInviteEditorOpen(false);
    setJoinRequestsOpen(false);
    setRequestDecisions({});
    setRequestErrors({});
  }, [activeGroupId]);
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
  if (!group) return null;
  const isExplore = "invitePending" in group;
  const isJoinedGroup = !isExplore;
  const currentMemberRole = management?.members.find((member) => member.userId === currentUserId)?.role?.toLowerCase() || "";
  const currentMemberMuted = management?.members.find((member) => member.userId === currentUserId)?.isMuted === true;
  const canManage = Boolean(isJoinedGroup && currentUserId && (("createdBy" in group && group.createdBy === currentUserId) || currentMemberRole === "admin" || currentMemberRole === "creator"));
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
  const openMemberActionMenu = (member: NativeGroupManagementSnapshot["members"][number], event: GestureResponderEvent) => {
    setMemberActionTarget(member);
    setMemberActionAnchor({
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    });
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
    setMemberActionAnchor(null);
  };
  const memberMenuPosition = (() => {
    if (!memberActionAnchor) return null;
    const { width, height } = Dimensions.get("window");
    const menuWidth = 190;
    const menuHeight = canManage && memberActionTarget?.userId !== currentUserId ? 132 : 88;
    return {
      left: Math.max(huddleSpacing.x3, Math.min(width - menuWidth - huddleSpacing.x3, memberActionAnchor.x - menuWidth + huddleSpacing.x4)),
      top: Math.max(huddleSpacing.x5, Math.min(height - menuHeight - huddleSpacing.x5, memberActionAnchor.y + huddleSpacing.x2)),
      width: menuWidth,
    };
  })();
  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close group details" onPress={onClose} style={StyleSheet.absoluteFill} />
	        <View style={styles.groupDetailsEventBoundary}>
		        <AppBottomSheet mode="large">
	          <AppBottomSheetHeader>
            <View style={styles.groupDetailsHeaderSpacer} />
            <AppModalIconButton accessibilityLabel="Close" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={24} />
            </AppModalIconButton>
	          </AppBottomSheetHeader>
		          <AppBottomSheetScroll fill>
	            <View style={styles.groupDetailsBody}>
              {isJoinedGroup && canManage ? (
                <View style={styles.groupEditControls}>
	                  <View style={styles.createNameRow}>
	                    <Pressable accessibilityLabel="Change group avatar" onPress={onPickCover} style={[styles.createAvatarButton, detailsErrors.cover ? styles.createAvatarButtonError : null]}>
                      {editCover?.uri ? (
                        <Image resizeMode="cover" source={{ uri: editCover.uri }} style={styles.createAvatarImage} />
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
	                        onChangeText={onChangeNameEdit}
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
                          <Image resizeMode="cover" source={{ uri: editCover.uri }} style={nativeModalStyles.appGroupHeroImage} />
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
                      <View style={styles.createDescriptionWrap}>
	                        <AppModalField
	                          accessibilityLabel="Group description"
	                          error={detailsErrors.description}
                          multiline
                          onChangeText={onChangeDescriptionEdit}
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
                  <View>
                    <Text style={styles.createLabel}>Location</Text>
	                    <AppModalField
	                      accessibilityLabel="Group location"
	                      error={detailsErrors.location}
                      onChangeText={(value) => {
                        onChangeLocationEdit(value);
                        setLocationSearchOpen(value.trim().length >= 2);
                      }}
                      onFocus={() => {
                        if (locationSuggestions.length > 0) setLocationSearchOpen(true);
                      }}
                      placeholder="Search district or neighbourhood"
                      style={styles.createTextField}
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
                  <View style={nativeModalStyles.appModalFieldBlock}>
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
                              onChangeText={(value) => {
                                setPetFocusOther(value);
                                const nextSpecies = value.trim();
                                const nextValues = petFocusEdit.map((current) => {
                                  const currentSpecies = splitNativePetFocusLabel(current).species;
                                  return currentSpecies === "Others" || currentSpecies === petFocusOther.trim() ? nextSpecies || "Others" : current;
                                });
                                onChangePetFocusEdit(nextValues);
                              }}
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
              {editCover?.uri ? <Image resizeMode="cover" source={{ uri: editCover.uri }} style={nativeModalStyles.appGroupHeroImage} /> : <ResilientAvatarImage fallback={<View style={nativeModalStyles.appGroupHeroFallback} />} style={nativeModalStyles.appGroupHeroImage} uri={avatarUrl} />}
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
	                  <View style={styles.managementActionCard}>
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
                          <View style={styles.searchField}>
                            <Feather color={huddleColors.iconSubtle} name="search" size={18} />
                            <TextInput
                              accessibilityLabel="Search friends to invite"
                              autoCapitalize="none"
                              autoCorrect={false}
                              onChangeText={setInviteSearch}
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
                <View style={styles.groupSheetActionGrid}>
                  <Pressable disabled={groupActionBusy === "mute"} onPress={() => { void toggleGroupMute(); }} style={({ pressed }) => [styles.groupSheetActionButton, pressed && styles.pressed, groupActionBusy === "mute" && styles.actionDisabled]}>
                    <Feather color={huddleColors.text} name={currentMemberMuted ? "bell" : "bell-off"} size={18} />
                    <View style={styles.managementActionCopy}>
                      <Text style={styles.managementActionTitle}>{currentMemberMuted ? "Unmute Notifications" : "Mute Notifications"}</Text>
                      <Text style={styles.managementActionBody}>{currentMemberMuted ? "Push alerts are off" : "Pause group push alerts"}</Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setGroupActionConfirm(canManage ? "remove" : "leave")} style={({ pressed }) => [styles.groupSheetActionButton, pressed && styles.pressed]}>
                    <Feather color={huddleColors.validationRed} name={canManage ? "trash-2" : "log-out"} size={18} />
                    <View style={styles.managementActionCopy}>
                      <Text style={styles.groupSheetActionDestructive}>{canManage ? "Remove Group" : "Leave Group"}</Text>
                      <Text style={styles.managementActionBody}>{canManage ? "Delete this group" : "Stop receiving messages"}</Text>
                    </View>
                  </Pressable>
                </View>
	                {management?.members.length ? <Text style={styles.sectionLabel}>Members</Text> : null}
	                {management?.members.map((member, index) => {
                    const memberRole = groupMemberRoleFor(group, member, index);
                    return (
                      <View key={member.userId} style={styles.memberActionBlock}>
		                    <View style={nativeModalStyles.appMemberSelectRow}>
                          <Pressable accessibilityLabel={`Open ${member.name || "member"} profile`} onPress={() => onOpenMemberProfile(member.userId)} style={styles.memberIdentity}>
		                        <VerifiedMemberAvatar avatarUrl={member.avatarUrl} isVerified={member.isVerified} name={member.name || "Member"} />
			                        <Text numberOfLines={1} style={[nativeModalStyles.appMemberSelectName, styles.groupMemberName]}>{member.name || "Member"}</Text>
                          </Pressable>
		                      <Text style={styles.detailsMeta}>{memberRole}</Text>
                            {member.userId !== currentUserId ? (
	                            <Pressable accessibilityLabel={`Member actions for ${member.name || "member"}`} onPress={(event) => openMemberActionMenu(member, event)} style={styles.iconButtonSmall}><Feather color={huddleColors.iconSubtle} name="more-horizontal" size={16} /></Pressable>
                            ) : null}
	                      </View>
	                    </View>
                    );
                  })}
	                {management?.mediaUrls.length ? (
                    <View style={styles.mediaSection}>
                      <Text style={styles.sectionLabel}>Media</Text>
	                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={nativeModalStyles.appGroupMediaRail}>
	                      {management.mediaUrls.map((url) => <Image key={url} resizeMode="cover" source={{ uri: url }} style={nativeModalStyles.appGroupMediaThumb} />)}
	                    </ScrollView>
                    </View>
	                ) : null}
              </View>
            ) : null}
            {isExplore ? (
              <View style={styles.exploreMembersSection}>
                <Text style={styles.sectionLabel}>Members</Text>
                {managementLoading ? <Text style={nativeModalStyles.appModalMutedBody}>Loading members...</Text> : managementError ? <Text style={nativeModalStyles.appModalMutedBody}>Couldn't load members. Pull to refresh and try again.</Text> : management?.members.length ? management.members.map((member, index) => {
                  const memberRole = groupMemberRoleFor(group, member, index);
                  return (
                    <View key={member.userId} style={nativeModalStyles.appMemberSelectRow}>
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
	          </AppBottomSheetScroll>
            <AppBottomSheetFooter>
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
                  <AppModalActionRow>
                    <AppModalButton variant="secondary" onPress={() => onOpenChat(group)}><Text style={styles.modalSecondaryLabel}>Open Group</Text></AppModalButton>
                    <AppModalButton onPress={onSaveDetails}><Text style={styles.modalPrimaryLabel}>Save</Text></AppModalButton>
                  </AppModalActionRow>
                ) : (
                  <AppModalButton onPress={() => onOpenChat(group)}><Text style={styles.modalPrimaryLabel}>Open Group</Text></AppModalButton>
                )
              )}
            </AppBottomSheetFooter>
		        </AppBottomSheet>
	        </View>
      </View>
        <Modal presentationStyle="overFullScreen" transparent visible={Boolean(memberActionTarget)} animationType="fade" onRequestClose={closeMemberActionMenu}>
          <View style={styles.moreMenuBackdrop}>
            <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={closeMemberActionMenu} />
            <AppActionMenu items={[
              { label: "Report", icon: "flag", onPress: () => { if (memberActionTarget) onReportMember(memberActionTarget); closeMemberActionMenu(); } },
              { label: "Block user", icon: "slash", destructive: true, onPress: () => { if (memberActionTarget) onBlockMember(memberActionTarget); closeMemberActionMenu(); } },
              ...(canManage && memberActionTarget?.userId !== currentUserId ? [{ label: "Remove", icon: "trash-2" as const, destructive: true, onPress: () => { const member = memberActionTarget; closeMemberActionMenu(); if (member) onRemoveMember(group, member.userId); } }] : []),
            ]} style={memberMenuPosition ? [styles.memberActionMenuAnchored, memberMenuPosition] : styles.memberActionMenuAnchored} />
          </View>
        </Modal>
        <ConfirmGroupActionModal
          busy={groupActionBusy === groupActionConfirm}
          mode={groupActionConfirm}
          onCancel={() => setGroupActionConfirm(null)}
          onConfirm={() => { void confirmGroupAction(); }}
        />
	    </Modal>
  );
}

function ConfirmGroupActionModal({ busy, mode, onCancel, onConfirm }: { busy: boolean; mode: "leave" | "remove" | null; onCancel: () => void; onConfirm: () => void }) {
  if (!mode) return null;
  const remove = mode === "remove";
  return (
    <AppConfirmModal
      body={remove ? "This group and all its content will be permanently deleted. This action cannot be undone." : "You'll no longer see new messages in this group."}
      confirm={remove ? "Remove" : "Leave"}
      destructive
      loading={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
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
        <AppBottomSheet>
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
  onClose,
  onPickCover,
  onRemoveCover,
  onSubmit,
  open,
  petFocus,
  visibility,
}: {
  countryLabel: string | null;
  cover: PendingGroupCover | null;
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
  onClose: () => void;
  onPickCover: () => void;
  onRemoveCover: () => void;
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
  const createGroupScrollRef = useRef<ScrollView | null>(null);
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
  const centerCreateField = (y: number) => {
    requestAnimationFrame(() => {
      createGroupScrollRef.current?.scrollTo({ y, animated: true });
    });
  };
  useEffect(() => {
    if (cover && createErrors.cover) setCreateErrors((current) => ({ ...current, cover: false }));
  }, [cover, createErrors.cover]);
  const submitCreateGroup = () => {
    const nextErrors = {
      name: !name.trim(),
      location: !location.trim(),
      cover: !cover,
      description: countWords(description) > GROUP_DESCRIPTION_WORD_LIMIT,
    };
    setCreateErrors(nextErrors);
    if (nextErrors.name) {
      centerCreateField(0);
      return;
    }
    if (nextErrors.location) {
      centerCreateField(80);
      return;
    }
    if (nextErrors.cover) {
      centerCreateField(520);
      return;
    }
    if (nextErrors.description) {
      centerCreateField(600);
      return;
    }
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
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]}>
        <Pressable accessibilityLabel="Close create group" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={nativeModalStyles.appBottomSheetEventBoundary}>
		        <AppBottomSheet large>
		          <AppBottomSheetHeader>
            <Text style={nativeModalStyles.appModalSheetTitle}>Create a group</Text>
            <AppModalIconButton accessibilityLabel="Close" onPress={onClose}>
              <Feather color={huddleColors.text} name="x" size={22} />
            </AppModalIconButton>
	          </AppBottomSheetHeader>
	          <ScrollView
	            ref={createGroupScrollRef}
	            bounces
	            contentContainerStyle={nativeModalStyles.appModalScrollContent}
	            keyboardDismissMode="interactive"
	            keyboardShouldPersistTaps="handled"
	            nestedScrollEnabled={false}
	            scrollEventThrottle={16}
	            showsVerticalScrollIndicator={false}
	            style={[nativeModalStyles.appModalScroll, nativeModalStyles.appBottomSheetScroll, nativeModalStyles.appBottomSheetScrollFill]}
	          >
	            <View style={styles.createSheetContent}>
	            <View style={styles.createNameRow}>
	              <Pressable accessibilityLabel="Upload group avatar" onPress={onPickCover} style={styles.createAvatarButton}>
	                {cover ? (
	                  <Image resizeMode="cover" source={{ uri: cover.uri }} style={styles.createAvatarImage} />
	                ) : (
	                  <Feather color={huddleColors.blue} name="users" size={26} />
	                )}
	              </Pressable>
	              <View style={styles.createNameField}>
	                <AppModalField error={createErrors.name} focused={nameFocused} onBlur={() => setNameFocused(false)} onChangeText={(value) => { onChangeName(value); if (createErrors.name && value.trim()) setCreateErrors((current) => ({ ...current, name: false })); }} onFocus={() => { setNameFocused(true); centerCreateField(0); }} placeholder="Group name" style={[styles.createTextField, styles.groupDetailsNameField]} value={name} />
	              </View>
	            </View>
            <View>
              <Text style={styles.createLabel}>Description</Text>
              <View style={[styles.createPreviewCard, createErrors.cover ? styles.createPreviewCardError : null]}>
	                <View style={nativeModalStyles.appGroupHero}>
	                  {cover ? (
	                    <Image resizeMode="cover" source={{ uri: cover.uri }} style={nativeModalStyles.appGroupHeroImage} />
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
                <View style={styles.createDescriptionWrap}>
	                  <AppModalField error={createErrors.description} focused={descriptionFocused} multiline onBlur={() => setDescriptionFocused(false)} onChangeText={(value) => { changeDescription(value); if (createErrors.description && countWords(value) <= GROUP_DESCRIPTION_WORD_LIMIT) setCreateErrors((current) => ({ ...current, description: false })); }} onFocus={() => { setDescriptionFocused(true); centerCreateField(560); }} placeholder="Tell people what this group is about and how you usually meet." style={styles.createDescriptionField} value={description} />
                </View>
              </View>
            </View>
	            <View>
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
	                  centerCreateField(80);
	                  if (locationSuggestions.length > 0) setLocationSearchOpen(true);
	                }}
	                placeholder="Search district or neighbourhood"
	                style={styles.createTextField}
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
            <View style={nativeModalStyles.appModalFieldBlock}>
              <Text style={[nativeModalStyles.appModalFieldLabel, styles.createSelectLabel]}>Pet focus</Text>
              <Pressable accessibilityRole="button" onPress={() => setPetFocusOpen((current) => !current)} style={[nativeModalStyles.appModalSelectTrigger, styles.createSelectTrigger, petFocusOpen ? nativeModalStyles.appModalFieldFocused : null]}>
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
                        onFocus={() => centerCreateField(210)}
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
	          <AppBottomSheetFooter>
	            <AppModalButton disabled={creating} loading={creating} onPress={submitCreateGroup}>
	              <Text style={styles.modalPrimaryLabel}>Create group</Text>
	            </AppModalButton>
          </AppBottomSheetFooter>
	        </AppBottomSheet>
	        </View>
	      </View>
	    </Modal>
	  );
}

function ConfirmDeleteModal({ onCancel, onConfirm, row }: { row: NativeChatInboxRow | null; onCancel: () => void; onConfirm: () => void }) {
  if (!row) return null;
  return <AppConfirmModal body="This conversation will be permanently deleted. Are you sure?" confirm="Remove" destructive onCancel={onCancel} onConfirm={onConfirm} open title="Remove conversation?" />;
}

function ConfirmStarModal({ errorMessage, loading, onCancel, onConfirm, target }: { errorMessage?: string | null; loading: boolean; onCancel: () => void; onConfirm: () => void; target: StarConfirmTarget | null }) {
  if (!target) return null;
  return <AppConfirmModal body="This starts a conversation immediately." confirm={loading ? "Sending..." : "Send Star"} loading={loading} message={errorMessage} onCancel={onCancel} onConfirm={onConfirm} open title="Use a Star to connect?" />;
}

function DiscoverySendCue({ cue }: { cue: { kind: DiscoverySendCueKind; id: number } | null }) {
  if (!cue) return null;
  const isStar = cue.kind === "star";
  return (
    <View pointerEvents="none" style={styles.sendCueOverlay}>
      <View style={[styles.sendCueOrb, isStar ? styles.sendCueOrbStar : styles.sendCueOrbWave]}>
        <Feather color={isStar ? huddleColors.text : huddleColors.onPrimary} name={isStar ? "star" : "send"} size={isStar ? 42 : 38} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, paddingTop: 56, backgroundColor: huddleColors.canvas },
  controlsStack: { flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: huddleColors.divider, backgroundColor: huddleColors.canvas },
  content: { paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x10 + huddleSpacing.x8, gap: huddleSpacing.x3 },
  discoverContent: { flexGrow: 1 },
  topToggleRow: { minHeight: huddleSpacing.x9 - huddleSpacing.x2, flexDirection: "row", alignItems: "center", paddingHorizontal: huddleSpacing.x4, paddingTop: huddleSpacing.x3, paddingBottom: huddleSpacing.x2 },
  sideActionSlot: { width: 36, height: 36 },
  topToggleCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  topToggle: { width: "100%", maxWidth: 212, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1, padding: huddleSpacing.x1, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.mutedCanvas },
  topToggleText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  topToggleTextActive: { color: huddleColors.onPrimary },
  toggleUnreadBadge: { position: "absolute", right: -4, top: -4, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x1 + 2, backgroundColor: huddleColors.primarySoftFill, borderWidth: 2, borderColor: huddleColors.canvas },
  toggleUnreadText: { fontFamily: "Urbanist-800", fontSize: huddleType.meta, lineHeight: huddleType.metaLine, color: huddleColors.blue },
  toggleUnreadDot: { position: "absolute", right: 2, top: 2, width: 10, height: 10, borderRadius: huddleRadii.pill, backgroundColor: huddleColors.validationRed, borderWidth: 2, borderColor: huddleColors.canvas },
  confirmStarError: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.validationRed, textAlign: "center" },
  iconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill },
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
  iconButtonSmallAccent: { backgroundColor: huddleColors.blue },
  groupSubTabs: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x2, paddingBottom: huddleSpacing.x3 },
  groupSubTabRail: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  groupSubTabActions: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 + 2 },
  groupSubTabText: { fontFamily: "Urbanist-700", fontSize: 13, lineHeight: 18, color: huddleColors.text },
  groupSubTabTextActive: { color: huddleColors.onPrimary },
  statusBanner: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.glassBorder, backgroundColor: huddleColors.glassChrome, ...huddleShadows.glassElevation1 },
  statusText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  list: { gap: 0 },
  swipeRowWrap: { overflow: "visible", borderRadius: huddleRadii.card },
  rowDeleteAction: { position: "absolute", top: 0, right: 0, bottom: 0, width: 80, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.card, backgroundColor: huddleColors.validationRed },
  loadMoreText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  webChatRow: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3, padding: huddleSpacing.x3, borderRadius: huddleRadii.card, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, ...huddleShadows.glassElevation1 },
  priorityStarRow: { borderColor: huddleColors.premiumGold, shadowColor: huddleColors.premiumGold, shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  webGroupRow: { minHeight: 104, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x4, paddingVertical: huddleSpacing.x4, paddingHorizontal: huddleSpacing.x2, borderRadius: huddleRadii.card, backgroundColor: huddleColors.canvas, borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  rowUnread: { backgroundColor: huddleColors.canvas },
  rowDisabled: { opacity: 0.58 },
  rowPressed: { transform: [{ scale: 0.99 }] },
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
  rowTop: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  rowTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1 },
  rowTitle: { flex: 1, fontFamily: "Urbanist-700", fontSize: 16, lineHeight: 19, color: huddleColors.text },
  rowTime: { width: 44, textAlign: "right", fontFamily: "Urbanist-500", fontSize: 12, lineHeight: 14, color: huddleColors.caption },
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
  webEmptyImage: { width: "100%", height: 220 },
  webEmptyTitle: { marginTop: huddleSpacing.x2, textAlign: "center", fontFamily: "Urbanist-700", fontSize: huddleType.h4, lineHeight: huddleType.h4Line, color: huddleColors.text },
  webEmptyBody: { marginTop: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x2, textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 24, color: huddleColors.subtext },
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
  discoveryLayerSet: { position: "absolute", top: 0, zIndex: 0, elevation: 0 },
  discoveryLayer: { position: "absolute", left: 0, right: 0, height: DISCOVERY_LAYER_HEIGHT, borderRadius: huddleRadii.glass },
  discoveryLayerBack: { zIndex: 1, elevation: 1, backgroundColor: "rgba(79,86,119,0.14)", transform: [{ scaleX: 0.62 }] },
  discoveryLayerThird: { zIndex: 2, elevation: 2, backgroundColor: "rgba(33,71,201,0.30)", transform: [{ scaleX: 0.70 }] },
  discoveryLayerSecond: { zIndex: 3, elevation: 3, backgroundColor: "rgba(33,71,201,0.54)", transform: [{ scaleX: 0.78 }] },
  discoveryLayerFront: { zIndex: 4, elevation: 4, backgroundColor: "rgba(17,37,126,0.84)", transform: [{ scaleX: 0.86 }] },
  discoveryCardUnit: { position: "relative", alignItems: "center" },
  discoveryProfileCard: { position: "relative", zIndex: 20, width: "100%", overflow: "hidden", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.canvas, borderWidth: 0, ...huddleShadows.glassElevation1, elevation: 20 },
  discoveryCardQueued: { position: "absolute", top: huddleSpacing.x2, opacity: 1 },
  discoveryPreloadCard: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 18, overflow: "hidden", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.blueSoft, ...huddleShadows.glassElevation1, elevation: 18 },
  discoveryPreloadImage: { width: "100%", height: "100%" },
  discoveryPreloadFallback: { flex: 1, backgroundColor: huddleColors.blue },
  discoveryPreloadWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.36)" },
  discoveryPhotoWrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: huddleRadii.modal, backgroundColor: huddleColors.blueSoft },
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
  discoveryPassTint: { backgroundColor: "rgba(233,76,92,0.95)" },
  swipeStamp: { position: "absolute", zIndex: 18, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x1, borderRadius: huddleRadii.card, paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2, borderWidth: 2, backgroundColor: "rgba(255,255,255,0.52)" },
  passStamp: { right: huddleSpacing.x4, top: huddleSpacing.x4, borderColor: "#E94C5C" },
  waveStamp: { left: huddleSpacing.x4, bottom: 130, borderColor: huddleColors.blue },
  passStampText: { fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 18, letterSpacing: 2.3, color: "#E94C5C" },
  waveStampText: { fontFamily: "Urbanist-800", fontSize: 13, lineHeight: 18, letterSpacing: 2.3, color: huddleColors.blue },
  discoveryWaveStampIcon: { transform: [{ rotate: "-60deg" }] },
  discoveryHeroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "56%" },
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
  createSheetContent: { gap: huddleSpacing.x4, paddingBottom: huddleSpacing.x3 },
  createNameRow: { flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
  createNameField: { flex: 1, minWidth: 0 },
  createAvatarButton: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.blueSoft },
  createAvatarButtonError: { ...huddleFieldStates.error },
  createAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  createFieldBlock: { gap: huddleSpacing.x1 + 2 },
  createTextField: { height: 58, minHeight: 58, maxHeight: 58, paddingHorizontal: huddleSpacing.x3, paddingTop: 0, paddingBottom: 0, fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, includeFontPadding: false, textAlignVertical: "center" },
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
  upgradeCard: { width: "100%", maxWidth: 390, maxHeight: "100%", overflow: "hidden", borderRadius: huddleRadii.glass, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.88)", ...huddleShadows.glassElevation2 },
  upgradeBillingRow: { minHeight: 44, flexDirection: "row" },
  upgradeBillingTab: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: huddleSpacing.x1 },
  upgradeBillingTabInactive: { backgroundColor: huddleColors.canvas },
  upgradeBillingText: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  upgradeDiscountBadge: { overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x2, paddingVertical: huddleSpacing.x1, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.onPrimary },
  upgradeBody: { paddingHorizontal: huddleSpacing.x5, paddingTop: huddleSpacing.x4, paddingBottom: huddleSpacing.x3 },
  upgradeHeadline: { fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.onPrimary },
  upgradeSubheadline: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: "rgba(255,255,255,0.80)" },
  upgradePrice: { marginTop: huddleSpacing.x4, fontFamily: "Urbanist-800", fontSize: huddleType.h1, lineHeight: huddleType.h1Line, color: huddleColors.onPrimary },
  upgradePriceUnit: { fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: "rgba(255,255,255,0.80)" },
  upgradeAnnualNote: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: "rgba(255,255,255,0.75)" },
  upgradeDivider: { height: 1, marginTop: huddleSpacing.x4, backgroundColor: "rgba(255,255,255,0.28)" },
  upgradeFeatureList: { marginTop: huddleSpacing.x3 },
  upgradeFeatureRow: { flexDirection: "row", alignItems: "flex-start", gap: huddleSpacing.x3, paddingVertical: huddleSpacing.x2 },
  upgradeFeatureCopy: { flex: 1, minWidth: 0 },
  upgradeFeatureTitle: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.onPrimary },
  upgradeFeatureSubtitle: { marginTop: huddleSpacing.x1, fontFamily: "Urbanist-500", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: "rgba(255,255,255,0.80)" },
  upgradeCta: { minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: huddleSpacing.x5, borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas },
  upgradeCtaText: { ...huddleButtons.label },
  upgradeLaterButton: { minHeight: 40, alignItems: "center", justifyContent: "center", marginTop: huddleSpacing.x2 },
  upgradeLaterText: { fontFamily: "Urbanist-600", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: "rgba(255,255,255,0.65)" },
  filterSection: { borderBottomWidth: 1, borderBottomColor: huddleColors.divider },
  filterRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  filterInlineEditor: { paddingBottom: huddleSpacing.x4 },
  filterTitleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2 },
  filterLabel: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  filterLabelLocked: { color: huddleColors.mutedText },
  filterTierPill: { minHeight: 25, justifyContent: "center", overflow: "hidden", borderRadius: huddleRadii.pill, paddingHorizontal: huddleSpacing.x3 },
  filterTierPillPlus: { backgroundColor: huddleColors.tierBadgePlus },
  filterTierPillGold: { backgroundColor: huddleColors.tierBadgeGold },
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
  pressed: { opacity: 0.78 },
  detailsMeta: { fontFamily: "Urbanist-700", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.mutedText },
  groupDetailsEventBoundary: { width: "100%", justifyContent: "flex-end" },
  groupDetailsHeaderSpacer: { flex: 1 },
  groupDetailsBody: { gap: huddleSpacing.x5 },
  groupEditControls: { gap: huddleSpacing.x4 },
  groupNameEditRow: { flexDirection: "row", alignItems: "flex-end", gap: huddleSpacing.x3 },
  groupNameEditAvatar: { width: 58, height: 58, marginBottom: 1, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, borderWidth: 1, borderColor: huddleColors.fieldBorderSoft, backgroundColor: huddleColors.blueSoft },
  groupNameEditAvatarImage: { width: "100%", height: "100%", borderRadius: huddleRadii.pill },
  groupNameEditFieldWrap: { flex: 1, minWidth: 0 },
  groupHeroDescriptionBlock: { overflow: "hidden", borderRadius: huddleRadii.glass, backgroundColor: huddleColors.canvas, borderWidth: 1, borderColor: huddleColors.cardBorderSoft },
  heroOverlayAction: { position: "absolute", left: huddleSpacing.x3, top: huddleSpacing.x3, width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.backdrop, borderWidth: 1, borderColor: huddleColors.profileHeroTierBorder, ...huddleShadows.photoControl },
  descriptionInlineCard: { gap: huddleSpacing.x4, padding: huddleSpacing.x4, backgroundColor: huddleColors.canvas },
  descriptionInlineHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: huddleSpacing.x3 },
  groupDetailsDescriptionText: { fontFamily: "Urbanist-500", fontSize: huddleType.body, lineHeight: 24, color: huddleColors.text },
  exploreMembersSection: { gap: huddleSpacing.x2 },
  inlineIconButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.primarySoftFill },
  memberIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x3 },
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
  memberActionBlock: { gap: huddleSpacing.x2 },
  memberInlineActions: { marginLeft: huddleSpacing.x6, overflow: "hidden", borderRadius: huddleRadii.card, borderWidth: 1, borderColor: huddleColors.cardBorderSoft, backgroundColor: huddleColors.canvas },
  memberInlineAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2, paddingHorizontal: huddleSpacing.x3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: huddleColors.divider },
  memberInlineActionText: { flex: 1, fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.text },
  memberInlineActionTextDestructive: { color: huddleColors.validationRed },
  moreMenuBackdrop: { flex: 1, backgroundColor: huddleColors.backdrop },
  memberActionMenuAnchored: { position: "absolute" },
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
  matchFullScreen: { flex: 1, backgroundColor: huddleColors.canvas },
  matchFullImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  // Avatar slot — sits exactly inside an egg's white interior. The non-square
  // dims + borderRadius 9999 produce a clean ellipse that hides every pixel
  // of the underlying white. Image inside is `cover` so the photo fills it.
  matchAvatarSlotBase: { position: "absolute", overflow: "hidden", borderRadius: 9999, zIndex: 2 },
  matchSlotImage: { width: "100%", height: "100%" } as ImageStyle,
  matchSlotFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: huddleColors.blue },
  matchSlotInitials: { fontFamily: "Urbanist-800", fontSize: 28, lineHeight: 32, color: huddleColors.onPrimary },
  // Dock pinned to bottom band, below the pre-baked "LET'S DROP A HELLO" pill.
  matchDockBelowPill: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: huddleSpacing.x4, zIndex: 20, gap: huddleSpacing.x2 },
  matchModalCard: { width: "100%", maxWidth: 390, alignItems: "center", gap: huddleSpacing.x3, borderRadius: huddleRadii.modal, padding: huddleSpacing.x5, backgroundColor: huddleColors.canvas, ...huddleShadows.glassElevation2 },
  matchModalAvatar: { width: 92, height: 92, alignItems: "center", justifyContent: "center", borderRadius: huddleRadii.pill, backgroundColor: huddleColors.blue },
  matchModalInitials: { fontFamily: "Urbanist-800", fontSize: 30, lineHeight: 36, color: huddleColors.onPrimary },
  matchTitle: { textAlign: "center", fontFamily: "Urbanist-800", fontSize: huddleType.h3, lineHeight: huddleType.h3Line, color: huddleColors.text },
  matchBody: { textAlign: "center", fontFamily: "Urbanist-500", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.subtext },
  goldButton: { backgroundColor: huddleColors.premiumGold },
  // Phase K: neuglass discover toast
  discoverToastWrap: {
    position: "absolute", top: 8, left: 16, right: 16, zIndex: 50,
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: huddleRadii.card, overflow: "hidden",
    paddingVertical: 12, paddingRight: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: huddleColors.glassBorder,
    ...huddleShadows.glassElevation1,
  },
  discoverToastIntentBar: { width: 4, alignSelf: "stretch", borderTopLeftRadius: huddleRadii.card, borderBottomLeftRadius: huddleRadii.card },
  discoverToastIcon: { marginLeft: 12 },
  discoverToastText: { flex: 1, fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine, color: huddleColors.text },
  // Phase L: match modal additions — white-on-blue, no blue tints anywhere
  matchQuickReplies: { flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingRight: huddleSpacing.x4, paddingBottom: 8 },
  matchQuickReplyChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: huddleRadii.pill, borderWidth: 0,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  matchQuickReplyText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, lineHeight: huddleType.helperLine, color: huddleColors.blue },
  // Chromeless input — white text/icon over the cream-blue band, transparent backing
  matchInputRow: {
    flexDirection: "row", alignItems: "center", gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3, paddingVertical: huddleSpacing.x2,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.4)",
  },
  matchInputField: {
    flex: 1, paddingVertical: 6, paddingHorizontal: 4,
    fontFamily: "Urbanist-600", fontSize: huddleType.label, lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  matchInputSend: {
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
    borderRadius: 18, backgroundColor: huddleColors.blue,
  },
  matchKeepExploring: { alignItems: "center", paddingTop: 8, paddingBottom: 2 },
  matchKeepExploringText: { fontFamily: "Urbanist-700", fontSize: huddleType.helper, color: "rgba(255,255,255,0.92)", textDecorationLine: "underline" },
});
