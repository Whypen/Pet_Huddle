import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Users, MessageSquare, Search, X, Loader2, Star, SlidersHorizontal, Lock, ChevronRight, ChevronLeft, Trash2, DollarSign, MapPin, PawPrint, ArrowUpRight, SendHorizontal, Pencil, UserPlus, Bell, BellOff, LogOut, ShieldAlert, ImageIcon, Hash } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { CreateGroupSheet } from "@/components/chat/CreateGroupSheet";
import { JoinWithCodeSheet } from "@/components/chat/JoinWithCodeSheet";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NeuButton } from "@/components/ui/NeuButton";
import { ensureDirectChatRoom } from "@/lib/chatRooms";
import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";
import {
  CANONICAL_GENDER_OPTIONS,
  CANONICAL_ORIENTATION_OPTIONS,
  CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS,
  CANONICAL_SOCIAL_ROLE_OPTIONS,
} from "@/lib/profileOptions";
import { areUsersBlocked, loadBlockedUserIdsFor } from "@/lib/blocking";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { GlassModal } from "@/components/ui/GlassModal";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
import { WaveHandIcon } from "@/components/icons/WaveHandIcon";
import waveHandCta from "@/assets/Wave Hand CTA.png";
import matchPageImage from "@/assets/Match page.png";
import discoverAgeGateImage from "@/assets/Notifications/Discover age gate.png";
import emptyChatImage from "@/assets/Notifications/Empty Chat.png";
import serviceImage from "@/assets/Notifications/Service.jpg";
import profilePlaceholder from "@/assets/Profile Placeholder.png";
import { getQuotaCapsForTier, normalizeQuotaTier, quotaConfig } from "@/config/quotaConfig";
import { StarUpgradeSheet } from "@/components/monetization/StarUpgradeSheet";
import { startStripeCheckout } from "@/lib/stripeCheckout";
import { buildStarIntroPayload, isStarIntroKind, parseStarChatContent } from "@/lib/starChat";
import { parseChatShareMessage } from "@/lib/shareModel";
import { SharedContentCard } from "@/components/chat/SharedContentCard";
import { HuddleVideoLoader } from "@/components/ui/HuddleVideoLoader";

/* ── Discovery Filter Types & Defaults ── */
const ALL_GENDERS = [...CANONICAL_GENDER_OPTIONS] as const;
const ALL_SPECIES = [...CANONICAL_PET_EXPERIENCE_SPECIES_OPTIONS] as const;
const ALL_SOCIAL_ROLES = [...CANONICAL_SOCIAL_ROLE_OPTIONS] as const;
const ALL_ORIENTATIONS = CANONICAL_ORIENTATION_OPTIONS.filter(
  (item) => !/^prefer not to say$/i.test(String(item || "").trim())
) as unknown as readonly string[];
const ALL_DEGREES = ["High School", "Bachelor", "Master", "PhD", "Other"] as const;
const ALL_RELATIONSHIP_STATUSES = [
  "Single",
  "In a relationship",
  "Open relationship",
  "Married",
  "Divorced",
] as const;
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
] as const;

const normalizeRelationshipStatus = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "pna" || normalized === "prefer not to say") return "";
  if (normalized === "in relationship") return "In a relationship";
  if (normalized === "open") return "Open relationship";
  if (normalized === "in a relationship") return "In a relationship";
  if (normalized === "open relationship") return "Open relationship";
  const exact = ALL_RELATIONSHIP_STATUSES.find((item) => item.toLowerCase() === normalized);
  return exact || raw;
};

type DiscoveryFilters = {
  ageMin: number;
  ageMax: number;
  genders: string[];
  maxDistanceKm: number;
  species: string[];
  socialRoles: string[];
  heightMin: number;
  heightMax: number;
  orientations: string[];
  degrees: string[];
  relationshipStatuses: string[];
  hasCar: boolean;
  experienceYearsMin: number;
  experienceYearsMax: number;
  languages: string[];
  verifiedOnly: boolean;
  whoWavedAtMe: boolean;
  activeOnly: boolean;
};

const DEFAULT_FILTERS: DiscoveryFilters = {
  ageMin: 16,
  ageMax: 99,
  genders: [...ALL_GENDERS],
  maxDistanceKm: 150,
  species: [...ALL_SPECIES],
  socialRoles: [...ALL_SOCIAL_ROLES],
  heightMin: 100,
  heightMax: 300,
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

const DISCOVERY_EXPAND_STEP_KM = 15;
const DISCOVERY_MAX_RADIUS_KM = 150;


type FilterKey = keyof DiscoveryFilters;
type FilterRowDef = { key: FilterKey; label: string; tier: "free" | "plus" | "gold"; type: "range" | "multi" | "toggle" | "slider" };

const FILTER_ROWS: FilterRowDef[] = [
  { key: "ageMin", label: "Age Range", tier: "free", type: "range" },
  { key: "genders", label: "Gender", tier: "free", type: "multi" },
  { key: "maxDistanceKm", label: "Distance", tier: "free", type: "slider" },
  { key: "species", label: "Species", tier: "free", type: "multi" },
  { key: "socialRoles", label: "Community Role", tier: "free", type: "multi" },
  { key: "heightMin", label: "Height Range", tier: "plus", type: "range" },
  { key: "orientations", label: "Sexual Orientation", tier: "plus", type: "multi" },
  { key: "degrees", label: "Highest Degree", tier: "plus", type: "multi" },
  { key: "relationshipStatuses", label: "Relationship Status", tier: "plus", type: "multi" },
  { key: "hasCar", label: "Car Badge", tier: "plus", type: "toggle" },
  { key: "experienceYearsMin", label: "Pet Experience", tier: "plus", type: "range" },
  { key: "languages", label: "Language", tier: "plus", type: "multi" },
  { key: "verifiedOnly", label: "Verified Users Only", tier: "gold", type: "toggle" },
  { key: "whoWavedAtMe", label: "Who waved at you", tier: "gold", type: "toggle" },
  { key: "activeOnly", label: "Active Users only", tier: "gold", type: "toggle" },
];

/** Build a short summary for a filter row */
function filterSummary(filters: DiscoveryFilters, row: FilterRowDef): string {
  switch (row.key) {
    case "ageMin": return `${filters.ageMin}–${filters.ageMax}`;
    case "genders": return filters.genders.length === ALL_GENDERS.length ? "All" : filters.genders.join(", ");
    case "maxDistanceKm": return `${filters.maxDistanceKm} km`;
    case "species": return filters.species.length === ALL_SPECIES.length ? "All" : filters.species.join(", ");
    case "socialRoles": return filters.socialRoles.length === ALL_SOCIAL_ROLES.length ? "All" : filters.socialRoles.join(", ");
    case "heightMin": return `${filters.heightMin}–${filters.heightMax} cm`;
    case "orientations": return filters.orientations.length === ALL_ORIENTATIONS.length ? "All" : filters.orientations.slice(0, 2).join(", ") + (filters.orientations.length > 2 ? "…" : "");
    case "degrees": return filters.degrees.length === ALL_DEGREES.length ? "All" : filters.degrees.slice(0, 2).join(", ") + (filters.degrees.length > 2 ? "…" : "");
    case "relationshipStatuses": return filters.relationshipStatuses.length === ALL_RELATIONSHIP_STATUSES.length ? "All" : filters.relationshipStatuses.slice(0, 2).join(", ") + (filters.relationshipStatuses.length > 2 ? "…" : "");
    case "hasCar": return filters.hasCar ? "Y" : "N";
    case "experienceYearsMin": return `${filters.experienceYearsMin}–${filters.experienceYearsMax} years`;
    case "languages": return filters.languages.length === ALL_LANGUAGES.length ? "All" : filters.languages.slice(0, 2).join(", ") + (filters.languages.length > 2 ? "…" : "");
    case "verifiedOnly": return filters.verifiedOnly ? "Y" : "N";
    case "whoWavedAtMe": return filters.whoWavedAtMe ? "Y" : "N";
    case "activeOnly": return filters.activeOnly ? "Y" : "N";
    default: return "";
  }
}

type DiscoveryPet = {
  species?: string | null;
  name?: string | null;
};

type DiscoveryProfile = {
  id: string;
  display_name: string | null;
  avatar_url?: string | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  has_car?: boolean;
  bio?: string | null;
  relationship_status?: string | null;
  dob?: string | null;
  location_name?: string | null;
  location_district?: string | null;
  occupation?: string | null;
  school?: string | null;
  major?: string | null;
  degree?: string | null;
  tier?: string | null;
  pets?: DiscoveryPet[] | null;
  pet_species?: string[] | null;
  pet_size?: string | null;
  social_album?: string[] | null;
  show_occupation?: boolean | null;
  show_academic?: boolean | null;
  show_bio?: boolean | null;
  show_relationship_status?: boolean | null;
  show_age?: boolean | null;
  show_gender?: boolean | null;
  show_orientation?: boolean | null;
  show_height?: boolean | null;
  show_weight?: boolean | null;
  gender_genre?: string | null;
  orientation?: string | null;
  languages?: string[] | null;
  height?: number | null;
  last_active_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  pet_experience?: string[] | null;
  social_role?: string | null;
  availability_status?: string[] | null;
  pet_experience_years?: number | null;
  last_lat?: number | null;
  last_lng?: number | null;
};

const getDiscoverySocialRole = (profile: DiscoveryProfile) => {
  const rawRole =
    Array.isArray(profile.availability_status) && profile.availability_status.length > 0
      ? profile.availability_status[0] || null
      : profile.social_role || null;
  const role = String(rawRole || "").trim();
  if (!role) return null;
  const exact = CANONICAL_SOCIAL_ROLE_OPTIONS.find((entry) => entry.toLowerCase() === role.toLowerCase());
  if (exact) return exact;
  const token = role.toLowerCase();
  if (token.includes("nann")) return "Pet Nanny";
  if (token.includes("play")) return "Pet Parent";
  if (token.includes("animal")) return "Animal Friend (No Pet)";
  return null;
};

const normalizeAvailabilityLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^animal friend\s*\(no pet\)$/i.test(trimmed)) return "Animal Friend";
  return trimmed;
};

const DISCOVER_MIN_AGE_MESSAGE = "User must be 16+ to access Discover feature on Chats.";
const DISCOVER_AGE_GATE_BODY =
  "Discover & Chat features are for 16+ only. For now, join the social conversation and help protect the pack by keeping an eye on the Map.";

const extractDistrictToken = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1] || parts[0] || raw || null;
  if (parts.length === 2) return parts[0] || raw || null;
  return parts[0] || raw || null;
};

const resolveDiscoveryLocationLabel = ({
  liveLocationDistrict,
  pinDistrict,
  profileLocationDistrict,
  profileLocationName,
}: {
  liveLocationDistrict?: string | null;
  pinDistrict?: string | null;
  profileLocationDistrict?: string | null;
  profileLocationName?: string | null;
}) =>
  extractDistrictToken(liveLocationDistrict) ||
  extractDistrictToken(pinDistrict) ||
  extractDistrictToken(profileLocationDistrict) ||
  extractDistrictToken(profileLocationName) ||
  null;

type MainTab = "friends" | "groups" | "service";
const mainTabs: { id: MainTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "friends", label: "Friends", icon: MessageSquare },
  { id: "groups", label: "Groups", icon: Users },
  { id: "service", label: "Service", icon: MessageSquare },
];

const applyExperienceYearsFilter = (profiles: DiscoveryProfile[], filters: DiscoveryFilters) => {
  const minYears = Math.max(0, filters.experienceYearsMin);
  const maxYears = Math.max(minYears, Math.min(99, filters.experienceYearsMax));
  return profiles.filter((profile) => {
    const years = Number(profile.pet_experience_years ?? 0);
    if (!Number.isFinite(years)) return false;
    return years >= minYears && years <= maxYears;
  });
};

const applyDiscoveryClientFilters = (
  profiles: DiscoveryProfile[],
  filters: DiscoveryFilters,
  options?: { enforceVerifiedOnly?: boolean; enforceActiveOnly?: boolean; wavedByUserIds?: Set<string>; anchor?: DiscoveryAnchor | null }
) => {
  const minAge = Math.max(16, filters.ageMin);
  const maxAge = Math.max(minAge, filters.ageMax);
  const speciesFilterActive = filters.species.length < ALL_SPECIES.length;
  const genderFilterActive = filters.genders.length < ALL_GENDERS.length;
  const socialRoleFilterActive = filters.socialRoles.length < ALL_SOCIAL_ROLES.length;
  const orientationFilterActive = filters.orientations.length < ALL_ORIENTATIONS.length;
  const relationshipFilterActive = filters.relationshipStatuses.length < ALL_RELATIONSHIP_STATUSES.length;
  const languageFilterActive = filters.languages.length < ALL_LANGUAGES.length;
  const heightFilterActive = filters.heightMin > 100 || filters.heightMax < 300;
  const degreeFilterActive = filters.degrees.length < ALL_DEGREES.length;
  const allowNoSpecies = filters.species.includes("None");

  const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  return applyExperienceYearsFilter(profiles, filters).filter((profile) => {
    if (profile.dob) {
      const age = Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      if (Number.isFinite(age) && (age < minAge || age > maxAge)) return false;
    }

    if (options?.enforceVerifiedOnly && filters.verifiedOnly && profile.is_verified !== true) {
      return false;
    }

    const active30dThresholdMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activityRaw = profile.last_active_at || profile.updated_at || profile.created_at || "";
    const activityMs = activityRaw ? new Date(activityRaw).getTime() : NaN;
    if (!Number.isFinite(activityMs) || activityMs < active30dThresholdMs) {
      return false;
    }

    if (genderFilterActive) {
      const profileGender = String(profile.gender_genre ?? "").trim();
      if (!profileGender || !filters.genders.includes(profileGender)) return false;
    }

    if (socialRoleFilterActive) {
      const profileRole = getDiscoverySocialRole(profile);
      if (!profileRole || !filters.socialRoles.includes(profileRole)) return false;
    }

    if (orientationFilterActive) {
      const profileOrientation = String(profile.orientation ?? "").trim();
      if (!profileOrientation || !filters.orientations.includes(profileOrientation)) return false;
    }

    if (relationshipFilterActive) {
      const profileRelationship = normalizeRelationshipStatus(profile.relationship_status);
      if (!profileRelationship || !filters.relationshipStatuses.includes(profileRelationship)) return false;
    }

    if (degreeFilterActive) {
      const profileDegree = String(profile.degree ?? "").trim();
      if (!profileDegree || !filters.degrees.includes(profileDegree)) return false;
    }

    if (speciesFilterActive) {
      const speciesPool = new Set(
        (Array.isArray(profile.pet_experience) ? profile.pet_experience : [])
          .concat(Array.isArray(profile.pet_species) ? profile.pet_species : [])
          .concat(Array.isArray(profile.pets) ? profile.pets.map((pet) => pet.species || "") : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );
      if (speciesPool.size === 0) return allowNoSpecies;
      let matched = false;
      for (const species of filters.species) {
        if (species === "None") {
          if (speciesPool.size === 0) {
            matched = true;
            break;
          }
          continue;
        }
        if (speciesPool.has(species)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    if (heightFilterActive) {
      const height = Number(profile.height);
      if (!Number.isFinite(height) || height < filters.heightMin || height > filters.heightMax) return false;
    }

    if (languageFilterActive) {
      const profileLanguages = new Set(
        (Array.isArray(profile.languages) ? profile.languages : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );
      if (profileLanguages.size === 0) return false;
      let languageMatched = false;
      for (const lang of filters.languages) {
        if (profileLanguages.has(lang)) {
          languageMatched = true;
          break;
        }
      }
      if (!languageMatched) return false;
    }

    if (filters.hasCar && !profile.has_car) return false;

    if (options?.enforceActiveOnly && filters.activeOnly) {
      const active24hThresholdMs = Date.now() - 24 * 60 * 60 * 1000;
      if (activityMs < active24hThresholdMs) return false;
    }

    if (filters.whoWavedAtMe) {
      const wavedSet = options?.wavedByUserIds;
      if (!wavedSet || !wavedSet.has(profile.id)) return false;
    }

    if (options?.anchor && Number.isFinite(profile.last_lat) && Number.isFinite(profile.last_lng)) {
      const dKm = distanceKm(options.anchor.lat, options.anchor.lng, Number(profile.last_lat), Number(profile.last_lng));
      if (Number.isFinite(dKm) && dKm > filters.maxDistanceKm) return false;
    }

    return true;
  });
};

interface ChatUser {
  id: string;
  peerUserId?: string | null;
  name: string;
  avatarUrl?: string | null;
  socialAvailability?: string | null;
  previewOverride?: string | null;
  isVerified: boolean;
  hasCar: boolean;
  isPremium: boolean;
  lastMessage: string;
  lastMessageAt?: string | null;
  time: string;
  lastMessageFromMe?: boolean;
  lastMessageReadByOther?: boolean;
  unread: number;
  type: "friend" | "group" | "service";
  isOnline?: boolean;
  hasTransaction?: boolean;
  matchedAt?: string | null;
  lastMessageKind?: string | null;
  lastMessageStarSenderId?: string | null;
  lastMessageStarRecipientId?: string | null;
  serviceStatus?: "pending" | "booked" | "in_progress" | "completed" | "disputed" | null;
  serviceType?: string | null;
  serviceDateLabel?: string | null;
}

interface Group {
  id: string;
  inviteId?: string | null;
  name: string;
  avatarUrl?: string | null;
  memberCount: number;
  lastMessage: string;
  lastMessageSender: string;
  time: string;
  unread: number;
  invitePending?: boolean;
  inviterName?: string | null;
}

interface GroupContactOption {
  id: string;
  name: string;
  avatar?: string;
  verified: boolean;
}

type PendingGroupInvite = {
  inviteId: string;
  chatId: string;
  chatName: string;
  inviterName: string;
  createdAt?: string | null;
};

type MatchOnlyAvatar = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  hasCar: boolean;
};

type DiscoveryAnchor = {
  lat: number;
  lng: number;
  source: "device" | "pinned" | "profile";
};

type MatchModalState = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  roomId?: string | null;
};

type StarUpgradeTier = "plus" | "gold";

type WaveSendStatus = "sent" | "duplicate" | "blocked" | "failed";

type WaveSendResult = {
  status: WaveSendStatus;
  mutual: boolean;
  matchCreated: boolean;
};

type MatchRow = {
  user1_id: string;
  user2_id: string;
  chat_id?: string | null;
  matched_at?: string | null;
  created_at?: string | null;
};

const isDuplicateWaveError = (err: unknown) => {
  const payload = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
  const code = String(payload?.code || "");
  const status = Number(payload?.status || 0);
  const message = String(payload?.message || "");
  const details = String(payload?.details || "");
  const hint = String(payload?.hint || "");
  const blob = `${message} ${details} ${hint}`.toLowerCase();
  return code === "23505" || status === 409 || blob.includes("duplicate key");
};

const isWaveSchemaFallbackError = (err: unknown) => {
  const payload = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
  const code = String(payload?.code || "");
  const message = String(payload?.message || "").toLowerCase();
  return code === "42703" || code === "PGRST204" || message.includes("column");
};

const parseChatPreviewText = (rawContent: string | null | undefined) => {
  const raw = String(rawContent || "").trim();
  if (!raw) return "";
  const share = parseChatShareMessage(raw);
  if (share) {
    return `Shared from huddle's ${share.surface}`;
  }
  const starParsed = parseStarChatContent(raw);
  if (isStarIntroKind(starParsed.kind)) {
    return "Star connection";
  }
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; attachments?: Array<{ mime?: unknown }> };
    if (parsed && typeof parsed === "object") {
      const text = String(parsed.text || "").replace(/\s+/g, " ").trim();
      if (text) return text;
      if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
        const hasVideo = parsed.attachments.some((attachment) => String(attachment?.mime || "").startsWith("video/"));
        return hasVideo ? "🎥 Video" : "🖼️ Photo";
      }
    }
  } catch {
    // plain text fallback
  }
  return raw.replace(/\s+/g, " ").trim();
};

const isGroupMembershipHint = (text: string | null | undefined) => {
  const value = String(text || "").trim();
  if (!value) return false;
  return /just joined the chat\.$/i.test(value) || /left the group\.$/i.test(value);
};

const Chats = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { t } = useLanguage();

  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinWithCodeOpen, setIsJoinWithCodeOpen] = useState(false);
  const [groupVerifyGateOpen, setGroupVerifyGateOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "groups") return "groups";
    if (tab === "service") return "service";
    return "friends";
  });
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [chatVisibleCount, setChatVisibleCount] = useState(10);
  const [groupVisibleCount, setGroupVisibleCount] = useState(10);
  const [groupSubTab, setGroupSubTab] = useState<"my" | "explore">("my");
  const [exploreGroups, setExploreGroups] = useState<Array<{
    id: string;
    name: string;
    avatar_url: string | null;
    location_label: string | null;
    pet_focus: string[] | null;
    join_method: string;
    last_message_at: string | null;
    created_at: string;
  }>>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"discover" | "chats">(() => {
    const tab = searchParams.get("tab");
    return tab === "chats" || tab === "groups" ? "chats" : "discover";
  });
  const [swipeDir, setSwipeDir] = useState<"up" | "down" | null>(null);
  const [discoveryRefreshTick, setDiscoveryRefreshTick] = useState(0);
  const [discoveryVisibleCount, setDiscoveryVisibleCount] = useState(20);
  const [activeFilterRow, setActiveFilterRow] = useState<FilterRowDef | null>(null);
  const [filters, setFilters] = useState<DiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [expandedDistanceKm, setExpandedDistanceKm] = useState<number | null>(null);
  const [ageMinDraft, setAgeMinDraft] = useState(String(DEFAULT_FILTERS.ageMin));
  const [ageMaxDraft, setAgeMaxDraft] = useState(String(DEFAULT_FILTERS.ageMax));
  const [profileSheetUser, setProfileSheetUser] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);
  const [profileSheetData, setProfileSheetData] = useState<Record<string, unknown> | null>(null);
  const [profileSheetLoading, setProfileSheetLoading] = useState(false);
  // Group management
  const [groupManageId, setGroupManageId] = useState<string | null>(null);
  const [swipeDeleteId, setSwipeDeleteId] = useState<string | null>(null);
  const [swipeDeleteGroupId, setSwipeDeleteGroupId] = useState<string | null>(null);
  const [deleteGroupConfirmId, setDeleteGroupConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [groupImageUploading, setGroupImageUploading] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupPendingInvites, setGroupPendingInvites] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState<{ requestId: string; userId: string; name: string; avatarUrl?: string | null }[]>([]);
  const [mutualWaves, setMutualWaves] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupAddSearch, setGroupAddSearch] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryAnchor, setDiscoveryAnchor] = useState<DiscoveryAnchor | null>(null);
  const [discoveryLocationBlocked, setDiscoveryLocationBlocked] = useState(false);
  const [groupContactPool, setGroupContactPool] = useState<GroupContactOption[]>([]);
  const [hiddenDiscoveryIds, setHiddenDiscoveryIds] = useState<Set<string>>(new Set());
  const [handledDiscoveryIds, setHandledDiscoveryIds] = useState<Set<string>>(new Set());
  const [passedDiscoveryIds, setPassedDiscoveryIds] = useState<Set<string>>(new Set());
  const [carryoverPassedIds, setCarryoverPassedIds] = useState<Set<string>>(new Set());
  const [discoveryHistoryHydrated, setDiscoveryHistoryHydrated] = useState(false);
  const [albumUrls, setAlbumUrls] = useState<Record<string, string[]>>({});
  const [matchModal, setMatchModal] = useState<MatchModalState | null>(null);
  const [openingMatchChat, setOpeningMatchChat] = useState(false);
  const [matchQuickHello, setMatchQuickHello] = useState("");
  const [pendingGroupInvite, setPendingGroupInvite] = useState<PendingGroupInvite | null>(null);
  const seenGroupInvitePromptsRef = useRef<Set<string>>(new Set());

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string>("");
  const [activeRoomMessages, setActiveRoomMessages] = useState<{ id: string; sender_id: string; content: string; created_at: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showChatsToggleDot, setShowChatsToggleDot] = useState(false);
  const [lastClearedUnreadCount, setLastClearedUnreadCount] = useState(0);
  const [starUpgradeTier, setStarUpgradeTier] = useState<StarUpgradeTier | null>(null);
  const [starUpgradeBilling, setStarUpgradeBilling] = useState<"monthly" | "annual">("monthly");
  const [starCheckoutLoading, setStarCheckoutLoading] = useState(false);
  const [confirmStarTarget, setConfirmStarTarget] = useState<DiscoveryProfile | null>(null);
  const [starActionLoading, setStarActionLoading] = useState(false);
  const [starFlightVisible, setStarFlightVisible] = useState(false);
  const [matchOnlyAvatars, setMatchOnlyAvatars] = useState<MatchOnlyAvatar[]>([]);
  const [matchesFeedTick, setMatchesFeedTick] = useState(0);
  const roomSeenRef = useRef<Record<string, string>>({});
  const seenMatchUserIdsRef = useRef<Set<string>>(new Set());
  const serverSeenMatchUserIdsRef = useRef<Set<string>>(new Set());
  const pendingSeenMatchWritesRef = useRef<Set<string>>(new Set());
  const [localSeenMatchesHydrated, setLocalSeenMatchesHydrated] = useState(false);
  const [seenMatchesHydrated, setSeenMatchesHydrated] = useState(false);
  const [seenMatchesServerState, setSeenMatchesServerState] = useState<"idle" | "ready" | "failed">("idle");
  const directPeerByRoomRef = useRef<Record<string, string>>({});

  // Nanny Booking modal state
  const [nannyBookingOpen, setNannyBookingOpen] = useState(false);
  const [selectedNanny, setSelectedNanny] = useState<ChatUser | null>(null);
  const [bookingAmount, setBookingAmount] = useState("50");
  const [bookingCurrency, setBookingCurrency] = useState("USD");
  const [bookingProcessing, setBookingProcessing] = useState(false);
  const [safeHarborAccepted, setSafeHarborAccepted] = useState(false);
  const [showSafeHarborModal, setShowSafeHarborModal] = useState(false);
  const [serviceDate, setServiceDate] = useState("");
  const [serviceEndDate, setServiceEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [selectedPet, setSelectedPet] = useState("");
  const [userPets, setUserPets] = useState<{ id: string; name: string; species: string }[]>([]);
  const [sitterHourlyRate, setSitterHourlyRate] = useState<number | null>(null);
  const [bookingLocation, setBookingLocation] = useState("");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "groups") {
      setTopTab("chats");
      setMainTab("groups");
      return;
    }
    if (tab === "service") {
      setTopTab("chats");
      setMainTab("service");
      return;
    }
    if (tab === "chats") {
      setTopTab("chats");
      return;
    }
    if (tab === "discover") {
      setTopTab("discover");
    }
  }, [searchParams]);

  const isVerified = profile?.is_verified === true;
  const userAge = profile?.dob
    ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;
  const isMinor = userAge !== null && userAge < 13;
  const discoverChatAgeBlocked = userAge !== null && userAge < 16;
  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const discoverExhaustedCopy = quotaConfig.copy.discovery.exhausted[normalizeQuotaTier(effectiveTier)];
  const normalizedTier = String(effectiveTier || "free").toLowerCase();
  const isGoldTier = normalizedTier === "gold";
  const isPremium = effectiveTier === "plus" || effectiveTier === "gold";

  // UAT: Free users max 40 profiles/day. After limit: blur overlay and upsell.
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const dragY = useMotionValue(0);
  const dragRotate = useTransform(dragY, [-260, 0, 260], [15, 0, 15]);
  const dragScale = useTransform(dragY, [-260, 0, 260], [0.95, 1, 0.95]);
  const dragUpProgress = useTransform(dragY, [-220, 0], [1, 0]);
  const dragDownProgress = useTransform(dragY, [0, 220], [0, 1]);
  const waveIndicatorOpacity = useTransform(dragUpProgress, [0, 0.2, 0.5, 0.7, 1], [0, 0.18, 0.9, 1, 1]);
  const passIndicatorOpacity = useTransform(dragDownProgress, [0, 0.2, 0.5, 0.7, 1], [0, 0.18, 0.9, 1, 1]);
  const waveIndicatorScale = useTransform(dragUpProgress, [0, 0.2, 0.5, 0.7, 1], [0.72, 0.82, 0.94, 1, 1]);
  const passIndicatorScale = useTransform(dragDownProgress, [0, 0.2, 0.5, 0.7, 1], [0.72, 0.82, 0.94, 1, 1]);
  const [discoverImageIndex, setDiscoverImageIndex] = useState(0);
  const discoverImageInteractingRef = useRef(false);
  const discoveryKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `discovery_seen_${y}-${m}-${day}_${profile?.id || "anon"}`;
  }, [profile?.id]);
  const handledDiscoveryKey = useMemo(
    () => `discovery_handled_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const passedDiscoveryKey = useMemo(
    () => `discovery_passed_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const passedDiscoverySessionKey = useMemo(
    () => `discovery_passed_session_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const discoverySessionId = useMemo(() => {
    if (!profile?.id) return "anon";
    const key = `discovery_session_${profile.id}`;
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const generated = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, generated);
      return generated;
    } catch {
      return `volatile_${profile.id}`;
    }
  }, [profile?.id]);
  const roomSeenKey = useMemo(
    () => `chat_room_seen_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const seenMatchesKey = useMemo(
    () => `seen_match_modal_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const pendingSeenMatchesKey = useMemo(
    () => `seen_match_modal_pending_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const discoveryFiltersKey = useMemo(
    () => `discovery_filters_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const matchedDiscoveryKey = useMemo(
    () => `discovery_matched_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const resolveDiscoveryAnchor = useCallback(async (): Promise<DiscoveryAnchor | null> => {
    if (profile?.id) {
      const { data } = await supabase
        .from("user_locations")
        .select("location")
        .eq("user_id", profile.id)
        .eq("is_public", true)
        .maybeSingle();
      const point = (data?.location || null) as unknown as { coordinates?: unknown } | null;
      const coords = Array.isArray(point?.coordinates) ? point?.coordinates : null;
      if (coords && typeof coords[0] === "number" && typeof coords[1] === "number") {
        return { lat: Number(coords[1]), lng: Number(coords[0]), source: "device" };
      }
    }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const permissionState =
          navigator.permissions?.query
            ? (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state
            : "prompt";
        if (permissionState === "granted") {
          const deviceAnchor = await new Promise<DiscoveryAnchor>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (position) =>
                resolve({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  source: "device",
                }),
              (error) => reject(error),
              { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 }
            );
          });
          if (Number.isFinite(deviceAnchor.lat) && Number.isFinite(deviceAnchor.lng)) {
            return deviceAnchor;
          }
        }
      } catch {
        // fall through to pinned/profile fallback
      }
    }

    if (profile?.id) {
      const { data: latestPin } = await supabase
        .from("pins")
        .select("lat, lng")
        .eq("user_id", profile.id)
        .is("thread_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (typeof latestPin?.lat === "number" && typeof latestPin?.lng === "number") {
        return { lat: latestPin.lat, lng: latestPin.lng, source: "pinned" };
      }
    }

    if (profile?.id) {
      if (typeof profile?.last_lat === "number" && typeof profile?.last_lng === "number") {
        return { lat: profile.last_lat, lng: profile.last_lng, source: "profile" };
      }
    }

    if (typeof profile?.last_lat === "number" && typeof profile?.last_lng === "number") {
      return { lat: profile.last_lat, lng: profile.last_lng, source: "profile" };
    }

    return null;
  }, [profile?.id, profile?.last_lat, profile?.last_lng]);

  const openLocationSettings = useCallback(() => {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = "App-Prefs:Privacy&path=LOCATION";
      toast.info("If settings did not open, use iOS Settings > Privacy & Security > Location Services > Browser.");
      return;
    }
    if (/Android/i.test(ua)) {
      window.location.href = "intent://settings/location#Intent;scheme=android-app;end";
      toast.info("If settings did not open, use Android Settings > Location > App permissions.");
      return;
    }
    toast.info("Open your browser site settings and allow Location for this app.");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(discoveryKey);
      const n = raw ? Number(raw) : 0;
      setDiscoverySeenToday(Number.isFinite(n) ? n : 0);
    } catch {
      setDiscoverySeenToday(0);
    }
  }, [discoveryKey]);

  useEffect(() => {
    if (activeFilterRow?.key === "ageMin") {
      setAgeMinDraft(String(filters.ageMin));
      setAgeMaxDraft(String(filters.ageMax));
    }
  }, [activeFilterRow, filters.ageMax, filters.ageMin]);

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const raw = localStorage.getItem(discoveryFiltersKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<DiscoveryFilters>;
      if (!parsed || typeof parsed !== "object") return;
      setFilters((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore malformed cache
    }
  }, [discoveryFiltersKey, profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    try {
      localStorage.setItem(discoveryFiltersKey, JSON.stringify(filters));
    } catch {
      // ignore cache write failure
    }
  }, [discoveryFiltersKey, filters, profile?.id]);

  useEffect(() => {
    setHiddenDiscoveryIds(new Set());
    setHandledDiscoveryIds(new Set());
    setPassedDiscoveryIds(new Set());
    setCarryoverPassedIds(new Set());
    setDiscoveryHistoryHydrated(false);
    setDiscoveryVisibleCount(20);
    setSwipeDir(null);
    dragY.set(0);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const handledRaw = localStorage.getItem(handledDiscoveryKey);
      const handled = handledRaw ? (JSON.parse(handledRaw) as string[]) : [];
      if (Array.isArray(handled) && handled.length > 0) {
        setHandledDiscoveryIds(new Set(handled.filter((id) => typeof id === "string" && id)));
      }
      const passedSessionRaw = sessionStorage.getItem(passedDiscoverySessionKey);
      const passedSession = passedSessionRaw ? (JSON.parse(passedSessionRaw) as string[]) : [];
      const parsedSessionPassed = Array.isArray(passedSession)
        ? new Set(passedSession.filter((id) => typeof id === "string" && id))
        : new Set<string>();
      setPassedDiscoveryIds(parsedSessionPassed);
      const passedRaw = localStorage.getItem(passedDiscoveryKey);
      if (passedRaw) {
        const parsed = JSON.parse(passedRaw) as
          | string[]
          | { ids?: unknown; sessionId?: unknown };
        const ids = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.ids)
            ? (parsed.ids as unknown[])
            : [];
        const parsedPassed = new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)));
        const ownerSessionId = typeof parsed === "object" && parsed !== null ? String(parsed.sessionId || "") : "";
          if (parsedPassed.size > 0) {
            if (ownerSessionId && ownerSessionId === discoverySessionId) {
              setCarryoverPassedIds(new Set());
              setPassedDiscoveryIds((prev) => new Set([...prev, ...parsedPassed]));
            } else {
              setCarryoverPassedIds(parsedPassed);
            }
          }
      }
      const matchedRaw = localStorage.getItem(matchedDiscoveryKey);
      const matched = matchedRaw ? (JSON.parse(matchedRaw) as string[]) : [];
      if (Array.isArray(matched) && matched.length > 0) {
        setHandledDiscoveryIds((prev) => {
          const next = new Set(prev);
          matched
            .filter((id): id is string => typeof id === "string" && Boolean(id))
            .forEach((id) => next.add(id));
          return next;
        });
      }
    } catch {
      // ignore malformed cache
    } finally {
      setDiscoveryHistoryHydrated(true);
    }
  }, [discoverySessionId, handledDiscoveryKey, matchedDiscoveryKey, passedDiscoveryKey, passedDiscoverySessionKey, profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    directPeerByRoomRef.current = {};
  }, [profile?.id]);

  const rememberDirectPeer = useCallback((roomId: string, peerUserId: string) => {
    const nextRoomId = String(roomId || "").trim();
    const nextPeerId = String(peerUserId || "").trim();
    if (!nextRoomId || !nextPeerId) return;
    const next = { ...directPeerByRoomRef.current, [nextRoomId]: nextPeerId };
    directPeerByRoomRef.current = next;
  }, []);

  const persistRoomSeen = useCallback((next: Record<string, string>) => {
    roomSeenRef.current = next;
    try {
      localStorage.setItem(roomSeenKey, JSON.stringify(next));
    } catch {
      // ignore cache write failures
    }
  }, [roomSeenKey]);

  const markRoomSeen = useCallback((roomId: string) => {
    if (!roomId) return;
    persistRoomSeen({ ...roomSeenRef.current, [roomId]: new Date().toISOString() });
  }, [persistRoomSeen]);

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const raw = localStorage.getItem(roomSeenKey);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      roomSeenRef.current = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      roomSeenRef.current = {};
    }
  }, [profile?.id, roomSeenKey]);

  const persistSeenMatches = useCallback((next: Set<string>) => {
    seenMatchUserIdsRef.current = next;
    try {
      localStorage.setItem(seenMatchesKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore cache write failures
    }
  }, [seenMatchesKey]);

  const persistPendingSeenMatches = useCallback((next: Set<string>) => {
    pendingSeenMatchWritesRef.current = next;
    try {
      localStorage.setItem(pendingSeenMatchesKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore cache write failures
    }
  }, [pendingSeenMatchesKey]);

  const flushPendingSeenMatches = useCallback(async () => {
    if (!profile?.id || !user?.id) return;
    const pending = Array.from(pendingSeenMatchWritesRef.current);
    if (!pending.length) return;
    const payload = pending.map((matchedUserId) => ({
      viewer_id: user.id,
      matched_user_id: matchedUserId,
    }));
    try {
      const { error } = await (supabase
        .from("discover_match_seen" as "profiles")
        .upsert(payload as never, { onConflict: "viewer_id,matched_user_id", ignoreDuplicates: true })) as unknown as Promise<{
        error: { message?: string } | null;
      }>;
      if (error) {
        console.warn("[discover.match_seen] flush_failed", error.message || "unknown_error");
        return;
      }
      const next = new Set(pendingSeenMatchWritesRef.current);
      pending.forEach((id) => next.delete(id));
      persistPendingSeenMatches(next);
    } catch {
      // best-effort only
    }
  }, [persistPendingSeenMatches, profile?.id, user?.id]);

  const markMatchSeen = useCallback((userId?: string | null) => {
    const normalized = String(userId || "").trim();
    if (!normalized || !profile?.id) return;
    const next = new Set(seenMatchUserIdsRef.current);
    next.add(normalized);
    persistSeenMatches(next);
    const nextServer = new Set(serverSeenMatchUserIdsRef.current);
    nextServer.add(normalized);
    serverSeenMatchUserIdsRef.current = nextServer;
    const nextPending = new Set(pendingSeenMatchWritesRef.current);
    nextPending.add(normalized);
    persistPendingSeenMatches(nextPending);
    void flushPendingSeenMatches();
  }, [flushPendingSeenMatches, persistPendingSeenMatches, persistSeenMatches, profile?.id]);

  const fetchUserMatches = useCallback(async (): Promise<MatchRow[]> => {
    if (!profile?.id) return [];
    const attempts: Array<{ select: string; activeOnly: boolean }> = [
      { select: "chat_id,user1_id,user2_id,matched_at,last_interaction_at", activeOnly: true },
      { select: "user1_id,user2_id,matched_at,last_interaction_at", activeOnly: true },
      { select: "chat_id,user1_id,user2_id,matched_at,last_interaction_at", activeOnly: false },
      { select: "user1_id,user2_id,matched_at,last_interaction_at", activeOnly: false },
      { select: "chat_id,user1_id,user2_id", activeOnly: false },
      { select: "user1_id,user2_id", activeOnly: false },
    ];

    let lastErrorMessage = "";
    for (const attempt of attempts) {
      let query = supabase
        .from("matches")
        .select(attempt.select)
        .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
        .limit(500);
      if (attempt.select.includes("matched_at")) {
        query = query.order("matched_at", { ascending: false, nullsFirst: false });
      }
      if (attempt.activeOnly) {
        query = query.eq("is_active", true);
      }
      const result = await query;
      if (result.error) {
        lastErrorMessage = result.error.message || lastErrorMessage;
        continue;
      }
      if (attempt.activeOnly && Array.isArray(result.data) && result.data.length === 0) {
        // Some environments keep legacy rows where is_active is null/false.
        // Fall through to non-active query attempts before concluding no matches.
        continue;
      }
      return ((result.data || []) as Array<Record<string, unknown>>).map((row) => ({
        user1_id: String(row.user1_id || ""),
        user2_id: String(row.user2_id || ""),
        chat_id: typeof row.chat_id === "string" ? row.chat_id : null,
        matched_at:
          typeof row.matched_at === "string"
            ? row.matched_at
            : typeof row.last_interaction_at === "string"
              ? row.last_interaction_at
              : null,
        created_at:
          typeof row.matched_at === "string"
            ? row.matched_at
            : typeof row.last_interaction_at === "string"
              ? row.last_interaction_at
              : null,
      }));
    }

    console.warn("[chats.matches] failed to fetch matches", { error: lastErrorMessage || "unknown_error" });
    return [];
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) {
      pendingSeenMatchWritesRef.current = new Set();
      setLocalSeenMatchesHydrated(false);
      return;
    }
    try {
      const raw = localStorage.getItem(seenMatchesKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(parsed)) {
        seenMatchUserIdsRef.current = new Set(parsed.filter((value) => typeof value === "string" && value));
      } else {
        seenMatchUserIdsRef.current = new Set();
      }
      const pendingRaw = localStorage.getItem(pendingSeenMatchesKey);
      const pendingParsed = pendingRaw ? (JSON.parse(pendingRaw) as string[]) : [];
      if (Array.isArray(pendingParsed)) {
        pendingSeenMatchWritesRef.current = new Set(
          pendingParsed.filter((value) => typeof value === "string" && value)
        );
      } else {
        pendingSeenMatchWritesRef.current = new Set();
      }
    } catch {
      seenMatchUserIdsRef.current = new Set();
      pendingSeenMatchWritesRef.current = new Set();
    } finally {
      setLocalSeenMatchesHydrated(true);
    }
  }, [pendingSeenMatchesKey, profile?.id, seenMatchesKey]);

  useEffect(() => {
    if (!profile?.id) {
      serverSeenMatchUserIdsRef.current = new Set();
      setSeenMatchesHydrated(false);
      setSeenMatchesServerState("idle");
      return;
    }
    let cancelled = false;
    setSeenMatchesHydrated(false);
    setSeenMatchesServerState("idle");
    void (async () => {
      try {
        const { data, error } = await (supabase
          .from("discover_match_seen" as "profiles")
          .select("matched_user_id" as "*")
          .eq("viewer_id", profile.id)
          .limit(1000)) as unknown as Promise<{
          data: Array<{ matched_user_id?: string | null }> | null;
          error: { message?: string } | null;
        }>;
        if (cancelled) return;
        if (error) {
          console.warn("[discover.match_seen] load_failed", error.message || "unknown_error");
          setSeenMatchesServerState("failed");
        }
        const next = new Set(
          (data || [])
            .map((row) => String(row?.matched_user_id || "").trim())
            .filter(Boolean)
        );
        serverSeenMatchUserIdsRef.current = next;
        if (!error) {
          setSeenMatchesServerState("ready");
        }
      } catch {
        if (cancelled) return;
        serverSeenMatchUserIdsRef.current = new Set();
        setSeenMatchesServerState("failed");
      } finally {
        if (!cancelled) setSeenMatchesHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!localSeenMatchesHydrated || seenMatchesServerState !== "ready") return;
    void flushPendingSeenMatches();
  }, [flushPendingSeenMatches, localSeenMatchesHydrated, seenMatchesServerState]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void (async () => {
      const rows = await fetchUserMatches();
      if (cancelled) return;
      // Intentionally not pruning seenMatchUserIdsRef here.
      // Pruning caused re-shows when fetchUserMatches() missed rows temporarily.
      void rows;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUserMatches, matchesFeedTick, persistSeenMatches, profile?.id]);

  const discoveryDailyCap = getQuotaCapsForTier(profile?.effective_tier || profile?.tier || "free").discoveryViewsPerDay;
  const discoveryQuotaReached = Number.isFinite(discoveryDailyCap) && discoveryDailyCap !== null && discoverySeenToday >= discoveryDailyCap;
  const showDiscoveryQuotaLock = discoveryQuotaReached && !isGoldTier;
  const silentGoldDiscoveryCapReached = discoveryQuotaReached && isGoldTier;
  const effectiveDiscoveryDistanceKm = useMemo(() => {
    const base = Math.max(1, Math.round(filters.maxDistanceKm || 5));
    const expanded = expandedDistanceKm === null ? base : Math.max(base, Math.round(expandedDistanceKm));
    return Math.min(DISCOVERY_MAX_RADIUS_KM, expanded);
  }, [expandedDistanceKm, filters.maxDistanceKm]);
  const canExpandSearch = effectiveDiscoveryDistanceKm < DISCOVERY_MAX_RADIUS_KM;
  const prevDiscoveryQuotaReachedRef = useRef(discoveryQuotaReached);

  const bumpDiscoverySeen = async (): Promise<boolean> => {
    if (discoveryQuotaReached) return false;
    setDiscoverySeenToday((prev) => {
      const next = prev + 1;
      try {
        localStorage.setItem(discoveryKey, String(next));
      } catch {
        // ignore
      }
      return next;
    });
    return true;
  };

  useEffect(() => {
    setExpandedDistanceKm(null);
  }, [
    filters.maxDistanceKm,
    filters.ageMin,
    filters.ageMax,
    filters.genders,
    filters.species,
    filters.socialRoles,
    filters.heightMin,
    filters.heightMax,
    filters.orientations,
    filters.degrees,
    filters.relationshipStatuses,
    filters.hasCar,
    filters.experienceYearsMin,
    filters.experienceYearsMax,
    filters.languages,
    filters.verifiedOnly,
    filters.whoWavedAtMe,
    filters.activeOnly,
  ]);

  useEffect(() => {
    const prev = prevDiscoveryQuotaReachedRef.current;
    if (prev && !discoveryQuotaReached && topTab === "discover") {
      setSwipeDir(null);
      dragY.set(0);
      setDiscoveryRefreshTick((tick) => tick + 1);
    }
    prevDiscoveryQuotaReachedRef.current = discoveryQuotaReached;
  }, [discoveryQuotaReached, dragY, topTab]);

  const checkReciprocalWave = useCallback(
    async (targetUserId: string) => {
      if (!profile?.id) return false;
      try {
        const attempts: Array<{ fromCol: "from_user_id" | "sender_id"; toCol: "to_user_id" | "receiver_id" }> = [
          { fromCol: "sender_id", toCol: "receiver_id" },
          { fromCol: "from_user_id", toCol: "to_user_id" },
        ];
        for (const attempt of attempts) {
          const { data, error } = await supabase
            .from("waves")
            .select("id")
            .eq(attempt.fromCol, targetUserId)
            .eq(attempt.toCol, profile.id)
            .limit(1)
            .maybeSingle();
          if (error) {
            if (isWaveSchemaFallbackError(error)) continue;
            return false;
          }
          if ((data as { id?: string } | null)?.id) return true;
          // Schema exists and no reciprocal row; no need to query alias columns.
          break;
        }
      } catch {
        return false;
      }
      return false;
    },
    [profile?.id]
  );

  const finalizeMutualWave = useCallback(
    async (targetUserId: string): Promise<boolean> => {
      if (!profile?.id) return false;
      try {
        const { data, error } = await (supabase.rpc as (
          fn: string,
          params?: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message?: string } | null }>)("accept_mutual_wave", {
          p_target_user_id: targetUserId,
        });
        if (error) {
          const message = String(error.message || "");
          // Backward compatibility for environments that have not run the new migration yet.
          if (!/accept_mutual_wave/i.test(message) && !/does not exist/i.test(message)) {
            throw error;
          }
          return false;
        }
        if (Array.isArray(data) && data.length > 0) {
          const first = (data[0] || {}) as { match_created?: unknown };
          return first.match_created === true;
        }
      } catch {
        // non-blocking: UI should still continue.
        return false;
      }
      return false;
    },
    [profile?.id]
  );

  const sendDiscoveryWave = useCallback(
    async (targetUserId: string, options?: { showToast?: boolean }): Promise<WaveSendResult> => {
      if (!profile?.id) return { status: "failed", mutual: false, matchCreated: false };
      const showToast = options?.showToast ?? true;
      try {
        // Hard guard: never allow wave flow (and therefore notifications) once users are already matched.
        const matchProbeA = await supabase
          .from("matches")
          .select("id")
          .eq("user1_id", profile.id)
          .eq("user2_id", targetUserId)
          .limit(1)
          .maybeSingle();
        if ((matchProbeA.data as { id?: string } | null)?.id) {
          if (showToast) toast.info("You're already matched.");
          return { status: "duplicate", mutual: false, matchCreated: false };
        }
        const matchProbeB = await supabase
          .from("matches")
          .select("id")
          .eq("user1_id", targetUserId)
          .eq("user2_id", profile.id)
          .limit(1)
          .maybeSingle();
        if ((matchProbeB.data as { id?: string } | null)?.id) {
          if (showToast) toast.info("You're already matched.");
          return { status: "duplicate", mutual: false, matchCreated: false };
        }

        const isBlocked = await areUsersBlocked(profile.id, targetUserId);
        if (isBlocked) {
          if (showToast) toast.error(t("Cannot wave this user"));
          return { status: "blocked", mutual: false, matchCreated: false };
        }

        const outgoingChecks: Array<{ fromCol: "sender_id" | "from_user_id"; toCol: "receiver_id" | "to_user_id" }> = [
          { fromCol: "sender_id", toCol: "receiver_id" },
          { fromCol: "from_user_id", toCol: "to_user_id" },
        ];
        for (const check of outgoingChecks) {
          const { data: existingRow, error: existingError } = await supabase
            .from("waves")
            .select("id")
            .eq(check.fromCol, profile.id)
            .eq(check.toCol, targetUserId)
            .limit(1)
            .maybeSingle();
          if (existingError) {
            if (isWaveSchemaFallbackError(existingError)) continue;
            break;
          }
          if ((existingRow as { id?: string } | null)?.id) {
            const mutual = await checkReciprocalWave(targetUserId);
            const matchCreated = mutual ? await finalizeMutualWave(targetUserId) : false;
            if (showToast) {
              toast.info(mutual ? "It’s a pawfect match!" : t("Wave already sent"));
            }
            return { status: "duplicate", mutual, matchCreated };
          }
          break;
        }

        const senderReceiverPayload = {
          sender_id: profile.id,
          receiver_id: targetUserId,
          status: "pending",
          wave_type: "standard",
        } as Record<string, unknown>;
        const fromToPayload = {
          from_user_id: profile.id,
          to_user_id: targetUserId,
          status: "pending",
          wave_type: "standard",
        } as Record<string, unknown>;

        // Use insert-first instead of upsert to avoid schema-specific ON CONFLICT failures.
        const canonicalInsert = await supabase.from("waves" as "profiles").insert(senderReceiverPayload);
        if (canonicalInsert.error) {
          if (isDuplicateWaveError(canonicalInsert.error)) throw canonicalInsert.error;
          if (!isWaveSchemaFallbackError(canonicalInsert.error)) throw canonicalInsert.error;
          const legacyInsert = await supabase.from("waves" as "profiles").insert(fromToPayload);
          if (legacyInsert.error) {
            if (isDuplicateWaveError(legacyInsert.error)) throw legacyInsert.error;
            throw legacyInsert.error;
          }
        }
        const mutual = await checkReciprocalWave(targetUserId);
        let matchCreated = false;
        if (mutual) {
          matchCreated = await finalizeMutualWave(targetUserId);
        }
        if (showToast) {
          toast.success(mutual ? "It’s a pawfect match!" : t("Wave sent"));
        }
        return { status: "sent", mutual, matchCreated };
      } catch (err: unknown) {
        if (isDuplicateWaveError(err)) {
          const mutual = await checkReciprocalWave(targetUserId);
          let matchCreated = false;
          if (mutual) {
            matchCreated = await finalizeMutualWave(targetUserId);
          }
          if (showToast) {
            toast.info(mutual ? "It’s a pawfect match!" : t("Wave already sent"));
          }
          return { status: "duplicate", mutual, matchCreated };
        }
        if (showToast) toast.error(t("Failed to send wave"));
        return { status: "failed", mutual: false, matchCreated: false };
      }
    },
    [checkReciprocalWave, finalizeMutualWave, profile?.id, t]
  );

  const openStarUpgradeSheet = useCallback((tier: StarUpgradeTier) => {
    // Always close discovery filter layers before showing upsell, so upsell is the active top modal.
    setIsFilterModalOpen(false);
    setActiveFilterRow(null);
    setStarUpgradeTier(tier);
    setStarUpgradeBilling("monthly");
  }, []);

  const closeStarUpgradeSheet = useCallback(() => {
    if (starCheckoutLoading) return;
    setStarUpgradeTier(null);
  }, [starCheckoutLoading]);

  const getStarRemaining = useCallback(async () => {
    const snapshot = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_quota_snapshot");
    if (snapshot.error) throw snapshot.error;
    const row = Array.isArray(snapshot.data) ? snapshot.data[0] : snapshot.data;
    const typed = (row || {}) as { tier?: string; stars_used_cycle?: number; extra_stars?: number };
    const userTier = String(profile?.tier || "free").toLowerCase();
    const cap = getQuotaCapsForTier(userTier).starsPerMonth;
    const used = Number(typed.stars_used_cycle || 0);
    const extra = Number(typed.extra_stars || 0);
    return Math.max(0, cap - used) + Math.max(0, extra);
  }, [profile?.tier]);

  async function runStarAction(target: DiscoveryProfile): Promise<{ sent: boolean; roomId: string | null }> {
    if (!profile?.id) return { sent: false, roomId: null };
    const tier = String(profile?.tier || "free").toLowerCase();
    if (tier === "free") {
      openStarUpgradeSheet("plus");
      return { sent: false, roomId: null };
    }
    let remaining = 0;
    try {
      remaining = await getStarRemaining();
    } catch {
      toast.error("Unable to verify Star quota right now.");
      return { sent: false, roomId: null };
    }
    if (remaining <= 0) {
      if (tier === "plus") {
        openStarUpgradeSheet("gold");
      } else {
        toast.info(quotaConfig.copy.stars.exhausted);
      }
      return { sent: false, roomId: null };
    }
    try {
      const roomId = await ensureDirectChatRoom(supabase, profile.id, target.id, target.display_name || "Conversation");
      if (!roomId) throw new Error("room_not_created");
      const quotaResult = await (supabase.rpc as (fn: string, params?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
        "check_and_increment_quota",
        { action_type: "star" }
      );
      if (quotaResult.error) {
        if (tier === "plus") {
          openStarUpgradeSheet("gold");
        } else {
          toast.info(quotaConfig.copy.stars.exhausted);
        }
        return { sent: false, roomId: null };
      }
      const { error: starMessageError } = await supabase.from("chat_messages").insert({
        chat_id: roomId,
        sender_id: profile.id,
        content: buildStarIntroPayload(profile.id, target.id),
      });
      if (starMessageError) throw starMessageError;
      void enqueueChatNotification({
        userId: target.id,
        kind: "star",
        title: "New star",
        body: "Someone sent you a Star ⭐ Tap to find out who.",
        href: `/chat-dialogue?room=${roomId}&with=${profile.id}`,
        data: { room_id: roomId, from_user_id: profile.id, type: "star" },
      });
      commitDiscoverySwipe("up", target.id, "star");
      return { sent: true, roomId };
    } catch {
      toast.error("Unable to open chat right now.");
      return { sent: false, roomId: null };
    }
  }

  const executeConfirmedStar = useCallback(async () => {
    if (!confirmStarTarget || starActionLoading) return;
    if (!profile?.id) return;
    setStarActionLoading(true);
    try {
      const ok = await bumpDiscoverySeen();
      if (!ok) {
        if (!isGoldTier) {
          toast.info(discoverExhaustedCopy);
        }
        setConfirmStarTarget(null);
        return;
      }
      const result = await runStarAction(confirmStarTarget);
      if (result.sent && result.roomId) {
        setStarFlightVisible(true);
        const roomId = result.roomId;
        const target = confirmStarTarget;
        window.setTimeout(() => {
          setStarFlightVisible(false);
          navigate(
            `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(
              target.display_name || "Conversation"
            )}&with=${encodeURIComponent(target.id)}`
          );
        }, 420);
      }
      setConfirmStarTarget(null);
    } finally {
      setStarActionLoading(false);
    }
  }, [bumpDiscoverySeen, confirmStarTarget, isGoldTier, navigate, profile?.id, runStarAction, starActionLoading]);

  const handleStarUpgradeCheckout = useCallback(async () => {
    if (!starUpgradeTier || starCheckoutLoading) return;
    setStarCheckoutLoading(true);
    try {
      const selectedPlan = quotaConfig.stripePlans[starUpgradeTier][starUpgradeBilling];
      const url = await startStripeCheckout({
        mode: "subscription",
        type: `${starUpgradeTier}_${starUpgradeBilling === "annual" ? "annual" : "monthly"}`,
        lookupKey: selectedPlan.lookupKey,
        priceId: selectedPlan.priceId,
        successUrl: `${window.location.origin}/premium`,
        cancelUrl: `${window.location.origin}/chats`,
      });
      window.location.assign(url);
    } catch {
      toast.error("Unable to start checkout right now.");
    } finally {
      setStarCheckoutLoading(false);
    }
  }, [starCheckoutLoading, starUpgradeBilling, starUpgradeTier]);

  // Filters are now managed in the filters state object with sensible defaults

  // Fetch user pets when the nanny booking modal opens
  useEffect(() => {
    if (nannyBookingOpen && profile?.id) {
      supabase.from("pets").select("id, name, species").eq("owner_id", profile.id).then(({ data }) => {
        if (data) {
          setUserPets(data);
          if (data.length > 0) {
            setSelectedPet(data[0].id);
          }
        }
      });
      setBookingLocation(
        profile.location_name ||
          (profile.last_lat && profile.last_lng ? `${profile.last_lat.toFixed(5)}, ${profile.last_lng.toFixed(5)}` : "")
      );
      if (selectedNanny?.id) {
        supabase
          .from("sitter_profiles" as "profiles")
          .select("hourly_rate" as "*")
          .eq("user_id" as "id", selectedNanny.id)
          .maybeSingle()
          .then(({ data }: { data: Record<string, unknown> | null }) => {
            setSitterHourlyRate((data?.hourly_rate as number) || null);
          });
      }
      setServiceDate("");
      setServiceEndDate("");
      setStartTime("09:00");
      setEndTime("17:00");
      setSafeHarborAccepted(false);
      if (sitterHourlyRate) {
        const baseDate = serviceDate || new Date().toISOString().split("T")[0];
        const endDate = serviceEndDate || baseDate;
        const start = new Date(`${baseDate}T${startTime}`);
        const end = new Date(`${endDate}T${endTime}`);
        const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
        const expected = Math.round((sitterHourlyRate * hours) / 100);
        if (expected > 0) setBookingAmount(expected.toString());
      }
    }
  }, [
    nannyBookingOpen,
    profile?.id,
    profile?.last_lat,
    profile?.last_lng,
    profile?.location_name,
    selectedNanny?.id,
    serviceDate,
    serviceEndDate,
    startTime,
    endTime,
    sitterHourlyRate,
  ]);

  useEffect(() => {
    if (!sitterHourlyRate || !serviceDate || !serviceEndDate) return;
    const start = new Date(`${serviceDate}T${startTime}`);
    const end = new Date(`${serviceEndDate}T${endTime}`);
    const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
    if (!hours) return;
    const expected = Math.round((sitterHourlyRate * hours) / 100);
    if (expected > 0) setBookingAmount(expected.toString());
  }, [sitterHourlyRate, serviceDate, serviceEndDate, startTime, endTime]);

  useEffect(() => {
    if (serviceDate && !serviceEndDate) {
      setServiceEndDate(serviceDate);
    }
  }, [serviceDate, serviceEndDate]);

  // Load group members + mutual waves when group manage modal opens
  useEffect(() => {
    if (!groupManageId || !profile?.id) return;
    const load = async () => {
      // Fetch members for this group
      try {
        const { data: members } = await supabase
          .from("chat_room_members")
          .select("user_id, profiles!inner(id, display_name, avatar_url)")
          .eq("chat_id", groupManageId);
        if (members) {
          setGroupMembers(
            members.map((m: { user_id: string; profiles: { id: string; display_name: string | null; avatar_url: string | null } }) => ({
              id: m.user_id,
              name: m.profiles?.display_name || "User",
              avatarUrl: m.profiles?.avatar_url || null,
            }))
          );
        }
      } catch {
        // Fallback — show owner only
        setGroupMembers([{ id: profile.id, name: profile.display_name || "You", avatarUrl: profile.avatar_url || null }]);
      }
      // Fetch pending invites for this group
      try {
        const { data: inviteRows } = await supabase
          .from("group_chat_invites")
          .select("invitee_user_id, profiles!group_chat_invites_invitee_user_id_fkey(id, display_name, avatar_url)")
          .eq("chat_id", groupManageId)
          .eq("status", "pending");
        if (Array.isArray(inviteRows)) {
          setGroupPendingInvites(
            inviteRows
              .map((row: {
                invitee_user_id?: string | null;
                profiles?: { id?: string; display_name?: string | null; avatar_url?: string | null } | null;
              }) => ({
                id: String(row.invitee_user_id || row.profiles?.id || ""),
                name: String(row.profiles?.display_name || "User"),
                avatarUrl: row.profiles?.avatar_url || null,
              }))
              .filter((row) => Boolean(row.id))
          );
        } else {
          setGroupPendingInvites([]);
        }
      } catch {
        setGroupPendingInvites([]);
      }
      // Fetch pending join requests (for public groups with join_method=request)
      try {
        const { data: requestRows } = await supabase
          .from("group_join_requests")
          .select("id, user_id, profiles!group_join_requests_user_id_fkey(display_name, avatar_url)")
          .eq("chat_id", groupManageId)
          .eq("status", "pending");
        if (Array.isArray(requestRows)) {
          setGroupJoinRequests(
            requestRows
              .map((row: {
                id: string;
                user_id: string;
                profiles?: { display_name?: string | null; avatar_url?: string | null } | null;
              }) => ({
                requestId: row.id,
                userId: row.user_id,
                name: row.profiles?.display_name || "Someone",
                avatarUrl: row.profiles?.avatar_url || null,
              }))
          );
        } else {
          setGroupJoinRequests([]);
        }
      } catch {
        setGroupJoinRequests([]);
      }
      // Fetch mutual waves for invite
      try {
        const { data: waves } = await supabase
          .from("waves")
          .select("from_user_id, to_user_id")
          .or(`from_user_id.eq.${profile.id},to_user_id.eq.${profile.id}`);
        if (waves) {
          // Mutual: both directions exist
          const sent = new Set(waves.filter((w: { from_user_id: string }) => w.from_user_id === profile.id).map((w: { to_user_id: string }) => w.to_user_id));
          const received = waves.filter((w: { to_user_id: string; from_user_id: string }) => w.to_user_id === profile.id && sent.has(w.from_user_id)).map((w: { from_user_id: string }) => w.from_user_id);
          if (received.length > 0) {
            const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", received);
            if (profiles) {
              setMutualWaves(profiles.map((p: { id: string; display_name: string | null; avatar_url: string | null }) => ({
                id: p.id,
                name: p.display_name || "User",
                avatarUrl: p.avatar_url || null,
              })));
            }
          } else {
            setMutualWaves([]);
          }
        }
      } catch {
        setMutualWaves([]);
      }
    };
    load();
  }, [groupManageId, profile?.id, profile?.display_name, profile?.avatar_url]);

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

  const loadConversations = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const pendingInvitesByChat = new Map<string, PendingGroupInvite>();
      try {
        const { data: inviteRows } = await supabase
          .from("group_chat_invites")
          .select("id, chat_id, chat_name, inviter_user_id, created_at, profiles!group_chat_invites_inviter_user_id_fkey(display_name)")
          .eq("invitee_user_id", profile.id)
          .eq("status", "pending");
        if (Array.isArray(inviteRows)) {
          for (const row of inviteRows as Array<Record<string, unknown>>) {
            const chatId = String(row.chat_id || "");
            if (!chatId) continue;
            const chatName = String(row.chat_name || "Group");
            const inviterName = String((row.profiles as Record<string, unknown> | null)?.display_name || "Someone");
            pendingInvitesByChat.set(chatId, {
              inviteId: String(row.id || ""),
              chatId,
              chatName,
              inviterName,
              createdAt: typeof row.created_at === "string" ? row.created_at : null,
            });
          }
        }
      } catch {
        // non-blocking
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("chat_room_members")
        .select("chat_id")
        .eq("user_id", profile.id);
      if (membershipsError) throw membershipsError;

      let roomIds = [...new Set((memberships || []).map((row: { chat_id: string }) => row.chat_id).filter(Boolean))];
      roomIds = [...new Set([...roomIds, ...Array.from(pendingInvitesByChat.keys())])];
      if (!roomIds.length) {
        const { data: ownedChats } = await supabase
          .from("chats")
          .select("id")
          .eq("created_by", profile.id)
          .eq("type", "direct")
          .order("created_at", { ascending: false })
          .limit(40);
        roomIds = [...new Set((ownedChats || []).map((row: { id: string }) => row.id).filter(Boolean))];
      }
      if (!roomIds.length) {
        setChats([]);
        setGroups([]);
        const matchesRows = await fetchUserMatches();
        const counterpartIds = Array.from(
          new Set(
            ((matchesRows || []) as Array<{ user1_id: string; user2_id: string }>)
              .map((row) => (row.user1_id === profile.id ? row.user2_id : row.user1_id))
              .filter((id) => Boolean(id) && id !== profile.id)
          )
        );
        if (counterpartIds.length === 0) {
          setMatchOnlyAvatars([]);
          return;
        }
        const profileById = new Map<string, Record<string, unknown>>();
        const profileSelect = "id, display_name, avatar_url, verification_status, is_verified, has_car, availability_status, social_album";
        const { data: profileRows } = await supabase
          .from("profiles")
          .select(profileSelect)
          .in("id", counterpartIds);
        if (Array.isArray(profileRows)) {
          for (const row of profileRows as Array<Record<string, unknown>>) {
            const rowId = String(row.id || "");
            if (rowId) profileById.set(rowId, row);
          }
        }
        const unresolvedIds = counterpartIds.filter((id) => !profileById.has(id));
        if (unresolvedIds.length > 0) {
          const { data: publicRows } = await supabase
            .from("profiles_public")
            .select("id, display_name, avatar_url, has_car, availability_status, user_role")
            .in("id", unresolvedIds);
          if (Array.isArray(publicRows)) {
            for (const row of publicRows as Array<Record<string, unknown>>) {
              const rowId = String(row.id || "");
              if (rowId) profileById.set(rowId, row);
            }
          }
        }
        const nextAvatars: MatchOnlyAvatar[] = counterpartIds
          .map((counterpart) => {
            const row = (profileById.get(counterpart) || {}) as Record<string, unknown>;
            const socialAlbumFallback = Array.isArray(row.social_album)
              ? String((row.social_album as unknown[])[0] || "").trim()
              : "";
            return {
              userId: counterpart,
              name: String(row.display_name || "User"),
              avatarUrl: (row.avatar_url as string | null) || socialAlbumFallback || null,
              isVerified: row.is_verified === true,
              hasCar: Boolean(row.has_car),
              matchedAt:
                ((matchesRows || []) as Array<{ user1_id: string; user2_id: string; matched_at?: string | null }>)
              .find((r) => (r.user1_id === profile.id ? r.user2_id : r.user1_id) === counterpart)?.matched_at || null,
            };
          })
          .slice(0, 12);
        setMatchOnlyAvatars(nextAvatars);
        return;
      }

      const [{ data: rooms, error: roomsError }, { data: members, error: membersError }, { data: messages, error: messagesError }, { data: serviceChats, error: serviceChatsError }, matchesRows] = await Promise.all([
        supabase.from("chats").select("id, name, avatar_url, type").in("id", roomIds),
        supabase
          .from("chat_room_members")
          .select("chat_id, user_id")
          .in("chat_id", roomIds),
        supabase
          .from("chat_messages")
          .select("id, chat_id, sender_id, content, created_at")
          .in("chat_id", roomIds)
          .order("created_at", { ascending: false }),
        (supabase as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              in: (col: string, values: string[]) => Promise<{ data: unknown; error: { message?: string } | null }>;
            };
          };
        })
          .from("service_chats")
          .select("chat_id,status,requester_id,provider_id,request_card")
          .in("chat_id", roomIds),
        fetchUserMatches(),
      ]);

      if (roomsError) throw roomsError;
      if (membersError) console.warn("[chats] members query failed", membersError);
      if (messagesError) console.warn("[chats] messages query failed", messagesError);
      if (serviceChatsError) console.warn("[chats] service_chats query failed", serviceChatsError);

      const serviceByChatId = new Map<
        string,
        {
          status?: string | null;
          requester_id?: string | null;
          provider_id?: string | null;
          request_card?: Record<string, unknown> | null;
        }
      >();
      if (Array.isArray(serviceChats)) {
        for (const row of serviceChats as Array<Record<string, unknown>>) {
          const chatId = String(row.chat_id || "");
          if (!chatId) continue;
          serviceByChatId.set(chatId, {
            status: typeof row.status === "string" ? row.status : null,
            requester_id: typeof row.requester_id === "string" ? row.requester_id : null,
            provider_id: typeof row.provider_id === "string" ? row.provider_id : null,
            request_card:
              row.request_card && typeof row.request_card === "object"
                ? (row.request_card as Record<string, unknown>)
                : null,
          });
        }
      }

      const memberRows = (members || []) as { chat_id: string; user_id: string }[];
      const matchByChatId = new Map<string, string>();
      const matchedAtByCounterpart = new Map<string, string>();
      for (const row of matchesRows) {
        const counterpart = row.user1_id === profile.id ? row.user2_id : row.user1_id;
        if (!counterpart) continue;
        if (row.chat_id) matchByChatId.set(String(row.chat_id), counterpart);
        if (row.matched_at && !matchedAtByCounterpart.has(counterpart)) matchedAtByCounterpart.set(counterpart, row.matched_at);
        if (row.chat_id) rememberDirectPeer(String(row.chat_id), counterpart);
      }
      const counterpartByLastSender = new Map<string, string>();
      for (const msg of (messages || []) as { chat_id: string; sender_id: string }[]) {
        if (!msg?.chat_id || !msg?.sender_id || msg.sender_id === profile.id) continue;
        if (!counterpartByLastSender.has(msg.chat_id)) {
          counterpartByLastSender.set(msg.chat_id, msg.sender_id);
        }
      }
      const counterpartIds = Array.from(
        new Set(
          [
            ...memberRows.map((member) => member.user_id),
            ...Array.from(matchByChatId.values()),
            ...Object.values(directPeerByRoomRef.current),
            ...Array.from(counterpartByLastSender.values()),
          ].filter((userId) => userId && userId !== profile.id)
        )
      );
      const profileById = new Map<string, Record<string, unknown>>();
      const blockedByMe = new Set<string>();
      const blockedByThem = new Set<string>();
      const unmatchedByThem = new Set<string>();
      if (counterpartIds.length > 0) {
        const profileSelect = "id, display_name, avatar_url, verification_status, is_verified, has_car, availability_status, social_album";
        let profileRows: unknown[] | null = null;
        const { data: primaryRows, error: profileRowsError } = await supabase
          .from("profiles")
          .select(profileSelect)
          .in("id", counterpartIds);
        if (profileRowsError) {
          profileRows = [];
        } else {
          profileRows = (primaryRows || []) as unknown[];
        }
        if (Array.isArray(profileRows)) {
          for (const row of profileRows as Array<Record<string, unknown>>) {
            const rowId = String(row.id || "");
            if (rowId) profileById.set(rowId, row);
          }
        }
        const unresolvedIds = counterpartIds.filter((id) => !profileById.has(id));
        if (unresolvedIds.length > 0) {
          const { data: publicRows, error: publicRowsError } = await supabase
            .from("profiles_public")
            .select("id, display_name, avatar_url, has_car, availability_status, user_role")
            .in("id", unresolvedIds);
          if (!publicRowsError && Array.isArray(publicRows)) {
            for (const row of publicRows as Array<Record<string, unknown>>) {
              const rowId = String(row.id || "");
              if (rowId) profileById.set(rowId, row);
            }
          }
        }

        const [{ data: blocksFromMe }, { data: blocksToMe }, { data: unmatchesToMe }] = await Promise.all([
          supabase
            .from("user_blocks")
            .select("blocked_id")
            .eq("blocker_id", profile.id)
            .in("blocked_id", counterpartIds),
          supabase
            .from("user_blocks")
            .select("blocker_id")
            .eq("blocked_id", profile.id)
            .in("blocker_id", counterpartIds),
          supabase
            .from("user_unmatches")
            .select("actor_id")
            .eq("target_id", profile.id)
            .in("actor_id", counterpartIds),
        ]);
        for (const row of (blocksFromMe || []) as Array<{ blocked_id?: string | null }>) {
          const id = String(row.blocked_id || "").trim();
          if (id) blockedByMe.add(id);
        }
        for (const row of (blocksToMe || []) as Array<{ blocker_id?: string | null }>) {
          const id = String(row.blocker_id || "").trim();
          if (id) blockedByThem.add(id);
        }
        for (const row of (unmatchesToMe || []) as Array<{ actor_id?: string | null }>) {
          const id = String(row.actor_id || "").trim();
          if (id) unmatchedByThem.add(id);
        }
      }

      const lastByRoom = new Map<string, { id: string; sender_id: string; content: string; created_at: string }>();
      const unreadByRoom = new Map<string, number>();
      const seenSnapshot = roomSeenRef.current;
      const seededSeen: Record<string, string> = { ...seenSnapshot };
      for (const msg of (messages || []) as { id: string; chat_id: string; sender_id: string; content: string; created_at: string }[]) {
        if (!lastByRoom.has(msg.chat_id)) lastByRoom.set(msg.chat_id, msg);
        if (!seededSeen[msg.chat_id] && msg.created_at) {
          seededSeen[msg.chat_id] = msg.created_at;
        }
        if (msg.sender_id === profile.id) continue;
        const seenAtRaw = seenSnapshot[msg.chat_id];
        const seenAtMs = seenAtRaw ? new Date(seenAtRaw).getTime() : Number.NaN;
        const msgMs = msg.created_at ? new Date(msg.created_at).getTime() : Number.NaN;
        if (!Number.isFinite(msgMs)) continue;
        if (!Number.isFinite(seenAtMs) || msgMs > seenAtMs) {
          unreadByRoom.set(msg.chat_id, (unreadByRoom.get(msg.chat_id) || 0) + 1);
        }
      }
      if (Object.keys(seededSeen).length !== Object.keys(seenSnapshot).length) {
        persistRoomSeen(seededSeen);
      }
      const lastMessageIds = Array.from(new Set(Array.from(lastByRoom.values()).map((message) => message.id).filter(Boolean)));
      const lastMessageReadByOther = new Map<string, boolean>();
      if (lastMessageIds.length > 0) {
        const { data: readRows } = await supabase
          .from("message_reads")
          .select("message_id, user_id")
          .in("message_id", lastMessageIds);
        for (const row of (readRows || []) as Array<{ message_id: string; user_id: string }>) {
          if (!row?.message_id || !row?.user_id) continue;
          if (row.user_id === profile.id) continue;
          lastMessageReadByOther.set(row.message_id, true);
        }
      }

      const membersByRoom = new Map<string, { user_id: string; profiles?: Record<string, unknown> }[]>();
      for (const member of memberRows) {
        const arr = membersByRoom.get(member.chat_id) || [];
        arr.push({ ...member, profiles: profileById.get(member.user_id) });
        membersByRoom.set(member.chat_id, arr);
      }

      const nextChats: ChatUser[] = [];
      const nextGroups: Group[] = [];

      const formatChatTimestamp = (iso?: string | null) => {
        if (!iso) return "";
        const stamp = new Date(iso);
        if (Number.isNaN(stamp.getTime())) return "";
        const now = new Date();
        const sameDay =
          stamp.getFullYear() === now.getFullYear() &&
          stamp.getMonth() === now.getMonth() &&
          stamp.getDate() === now.getDate();
        if (sameDay) {
          return new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(stamp);
        }
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        if (now.getTime() - stamp.getTime() <= oneWeekMs) {
          return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(stamp);
        }
        const day = String(stamp.getDate()).padStart(2, "0");
        const month = String(stamp.getMonth() + 1);
        return `${day}/${month}/${stamp.getFullYear()}`;
      };

      const formatServiceDateRange = (requestCard: Record<string, unknown> | null | undefined) => {
        if (!requestCard) return null;
        const requestedDates = Array.isArray(requestCard.requestedDates)
          ? (requestCard.requestedDates as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        const fallback = String(requestCard.requestedDate || "").trim();
        const items = requestedDates.length > 0 ? requestedDates : fallback ? [fallback] : [];
        if (items.length === 0) return null;
        const sorted = [...items].sort();
        const format = (iso: string) => {
          const [year, month, day] = iso.split("-");
          if (!year || !month || !day) return iso;
          return `${day}-${month}-${year}`;
        };
        return `From ${format(sorted[0])} to ${format(sorted[sorted.length - 1])}`;
      };

      for (const room of (rooms || []) as Record<string, unknown>[]) {
        const roomId = String(room.id || "");
        if (!roomId) continue;
        const roomMembers = membersByRoom.get(roomId) || [];
        const roomType = String(room.type || "direct");
        const isService = roomType === "service";
        const isGroup = roomType === "group" || (!isService && roomMembers.length > 2);
        const last = lastByRoom.get(roomId);

        if (isGroup) {
          const senderProfile = last?.sender_id ? (profileById.get(last.sender_id) || null) : null;
          const senderName = last?.sender_id === profile.id
            ? "You"
            : (String(senderProfile?.display_name || "").trim() || null);
          const pendingInvite = pendingInvitesByChat.get(roomId) || null;
          nextGroups.push({
            id: roomId,
            inviteId: pendingInvite?.inviteId || null,
            name: String(room.name || "Group"),
            avatarUrl: (room.avatar_url as string | null) ?? null,
            memberCount: roomMembers.length,
            lastMessage: parseChatPreviewText(last?.content),
            lastMessageSender: senderName || "",
            time: formatChatTimestamp(last?.created_at),
            unread: unreadByRoom.get(roomId) || 0,
            invitePending: Boolean(pendingInvite),
            inviterName: pendingInvite?.inviterName || null,
          });
          continue;
        }

        const other = roomMembers.find((m) => m.user_id !== profile.id);
      const counterpartUserId =
          other?.user_id ||
          matchByChatId.get(roomId) ||
          directPeerByRoomRef.current[roomId] ||
          counterpartByLastSender.get(roomId) ||
          null;
        if (!counterpartUserId) continue;
        if (counterpartUserId && counterpartUserId === profile.id) continue;
        if (counterpartUserId) rememberDirectPeer(roomId, counterpartUserId);
        const otherProfile = (other?.profiles || (counterpartUserId ? profileById.get(counterpartUserId) : {}) || {}) as Record<string, unknown>;
        const tier = "free";
        const fallbackName = String(room.name || "").trim() || "Conversation";
        const counterpartName = String(otherProfile.display_name || "").trim() || fallbackName;
        const socialAlbumFallback = Array.isArray(otherProfile.social_album)
          ? String((otherProfile.social_album as unknown[])[0] || "").trim()
          : "";
        const counterpartAvatar = (otherProfile.avatar_url as string | null) || socialAlbumFallback || ((room.avatar_url as string | null) ?? null);
        const availabilityList = Array.isArray(otherProfile.availability_status)
          ? (otherProfile.availability_status as unknown[]).map((entry) => String(entry || "").trim()).filter(Boolean)
          : [];
        const socialAvailability =
          availabilityList.length > 0
            ? availabilityList.map((entry) => normalizeAvailabilityLabel(entry)).filter(Boolean).join(" • ")
            : normalizeAvailabilityLabel(String(otherProfile.social_role || otherProfile.user_role || "Friend"));
        const parsedLastMeta = parseStarChatContent(last?.content || "");
        const preview = parseChatPreviewText(last?.content);
        const serviceMeta = isService ? serviceByChatId.get(roomId) : null;
        const serviceRequestCard = serviceMeta?.request_card || null;
        const showRequesterRequestPrompt =
          Boolean(isService && serviceMeta && serviceMeta.requester_id === profile.id && !serviceRequestCard);
        const previewOverride = counterpartUserId
          ? (
              blockedByMe.has(counterpartUserId)
                ? `You've blocked ${counterpartName}`
                : blockedByThem.has(counterpartUserId)
                  ? `You're blocked by ${counterpartName}.`
                  : unmatchedByThem.has(counterpartUserId)
                    ? "You've been unmatched."
                    : showRequesterRequestPrompt
                      ? "Send a request to get started!"
                    : ""
            )
          : "";
        nextChats.push({
          id: roomId,
          peerUserId: counterpartUserId || null,
          name: counterpartName,
          avatarUrl: counterpartAvatar,
          socialAvailability,
          previewOverride: previewOverride || null,
          isVerified: otherProfile.is_verified === true,
          hasCar: Boolean(otherProfile.has_car),
          isPremium: tier !== "free",
          lastMessage: preview,
          lastMessageAt: last?.created_at || null,
          time: formatChatTimestamp(last?.created_at),
          lastMessageFromMe: last?.sender_id === profile.id,
          lastMessageReadByOther: Boolean(last?.id && lastMessageReadByOther.get(last.id)),
          lastMessageKind: parsedLastMeta.kind,
          lastMessageStarSenderId: parsedLastMeta.senderId,
          lastMessageStarRecipientId: parsedLastMeta.recipientId,
          unread: unreadByRoom.get(roomId) || 0,
          type: isService ? "service" : "friend",
          isOnline: false,
          hasTransaction: false,
          matchedAt: (counterpartUserId && matchedAtByCounterpart.get(counterpartUserId)) || null,
          serviceStatus: isService
            ? ((serviceMeta?.status as ChatUser["serviceStatus"]) || "pending")
            : null,
          serviceType: isService
            ? String(serviceRequestCard?.serviceType || "").trim() || null
            : null,
          serviceDateLabel: isService
            ? formatServiceDateRange(serviceRequestCard)
            : null,
        });
      }

      // Ensure invite-only groups are visible even before membership is accepted.
      for (const pendingInvite of pendingInvitesByChat.values()) {
        if (nextGroups.some((group) => group.id === pendingInvite.chatId)) continue;
        nextGroups.push({
          id: pendingInvite.chatId,
          inviteId: pendingInvite.inviteId,
          name: pendingInvite.chatName,
          avatarUrl: null,
          memberCount: 0,
          lastMessage: `Added by ${pendingInvite.inviterName}`,
          lastMessageSender: "",
          time: formatChatTimestamp(pendingInvite.createdAt || null),
          unread: 0,
          invitePending: true,
          inviterName: pendingInvite.inviterName,
        });
      }

      const uniqueChats: ChatUser[] = [];
      for (const chat of nextChats) {
        const nextScore = new Date(chat.lastMessageAt || chat.matchedAt || 0).getTime();
        const foundIndex = uniqueChats.findIndex((existing) => {
          if (chat.peerUserId && existing.peerUserId) return chat.peerUserId === existing.peerUserId;
          return chat.id === existing.id;
        });

        if (foundIndex < 0) {
          uniqueChats.push(chat);
          continue;
        }

        const existing = uniqueChats[foundIndex];
        const existingScore = new Date(existing.lastMessageAt || existing.matchedAt || 0).getTime();
        const preferred = (chat.peerUserId && !existing.peerUserId) || (chat.avatarUrl && !existing.avatarUrl) || nextScore > existingScore;
        if (preferred) {
          uniqueChats[foundIndex] = { ...existing, ...chat };
        } else if (!existing.socialAvailability && chat.socialAvailability) {
          uniqueChats[foundIndex] = { ...existing, socialAvailability: chat.socialAvailability };
        }
      }

      uniqueChats.sort((a, b) => {
        const aMatch = a.matchedAt ? new Date(a.matchedAt).getTime() : Number.NaN;
        const bMatch = b.matchedAt ? new Date(b.matchedAt).getTime() : Number.NaN;
        if (Number.isFinite(aMatch) || Number.isFinite(bMatch)) {
          const safeA = Number.isFinite(aMatch) ? aMatch : -Infinity;
          const safeB = Number.isFinite(bMatch) ? bMatch : -Infinity;
          if (safeA !== safeB) return safeB - safeA;
        }
        const aMsg = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : Number.NaN;
        const bMsg = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : Number.NaN;
        const safeA = Number.isFinite(aMsg) ? aMsg : -Infinity;
        const safeB = Number.isFinite(bMsg) ? bMsg : -Infinity;
        return safeB - safeA;
      });

      setChats(uniqueChats);
      setGroups(nextGroups);
      const counterpartInActiveConversations = new Set(
        uniqueChats
          .filter((chat) => Boolean(chat.lastMessageAt) || parseChatPreviewText(chat.lastMessage).length > 0)
          .map((chat) => String(chat.peerUserId || "").trim())
          .filter(Boolean)
      );
      const avatarCandidates = new Map<string, MatchOnlyAvatar>();
      for (const row of matchesRows) {
        const counterpart = row.user1_id === profile.id ? row.user2_id : row.user1_id;
        if (!counterpart || counterpart === profile.id) continue;
        if (counterpartInActiveConversations.has(counterpart)) continue;
        const profileRow = (profileById.get(counterpart) || {}) as Record<string, unknown>;
        const socialAlbumFallback = Array.isArray(profileRow.social_album)
          ? String((profileRow.social_album as unknown[])[0] || "").trim()
          : "";
        avatarCandidates.set(counterpart, {
          userId: counterpart,
          name: String(profileRow.display_name || "User"),
          avatarUrl: (profileRow.avatar_url as string | null) || socialAlbumFallback || null,
          isVerified: profileRow.is_verified === true,
          hasCar: Boolean(profileRow.has_car),
        });
      }
      setMatchOnlyAvatars((prev) => {
        const merged = new Map<string, MatchOnlyAvatar>();
        for (const candidate of avatarCandidates.values()) {
          merged.set(candidate.userId, candidate);
        }
        for (const existing of prev) {
          if (!existing?.userId) continue;
          if (counterpartInActiveConversations.has(existing.userId)) continue;
          if (!merged.has(existing.userId)) {
            merged.set(existing.userId, existing);
          }
        }
        return Array.from(merged.values()).slice(0, 12);
      });
    } catch {
      toast.error("Failed to load conversations");
    }
  }, [blockedUserIds, fetchUserMatches, persistRoomSeen, profile?.id, rememberDirectPeer]);

  // Load conversations from backend
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Check for pending group invites when opening Groups tab
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const raw = localStorage.getItem(`group_invite_prompt_seen_${profile.id}`);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(parsed)) {
        seenGroupInvitePromptsRef.current = new Set(parsed.filter((entry) => typeof entry === "string" && entry.trim().length > 0));
      } else {
        seenGroupInvitePromptsRef.current = new Set();
      }
    } catch {
      seenGroupInvitePromptsRef.current = new Set();
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || mainTab !== "groups") return;
    const checkInvites = async () => {
      const { data: invites } = await supabase
        .from("group_chat_invites")
        .select("id, chat_id, chat_name, created_at, profiles!group_chat_invites_inviter_user_id_fkey(display_name)")
        .eq("invitee_user_id", profile.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!Array.isArray(invites) || invites.length === 0) return;
      const first = invites[0] as Record<string, unknown>;
      const chatId = String(first.chat_id || "");
      if (!chatId) return;
      const inviteId = String(first.id || "");
      const inviteSeenKey = inviteId || `${chatId}:${String(first.created_at || "")}`;
      if (inviteSeenKey && seenGroupInvitePromptsRef.current.has(inviteSeenKey)) return;
      if (inviteSeenKey) {
        seenGroupInvitePromptsRef.current.add(inviteSeenKey);
        try {
          localStorage.setItem(
            `group_invite_prompt_seen_${profile.id}`,
            JSON.stringify(Array.from(seenGroupInvitePromptsRef.current))
          );
        } catch {
          // ignore cache write errors
        }
      }
      setPendingGroupInvite({
        inviteId,
        chatId,
        chatName: String(first.chat_name || "Group"),
        inviterName: String((first.profiles as Record<string, unknown> | null)?.display_name || "Someone"),
      });
    };
    void checkInvites();
  }, [profile?.id, mainTab]);

  // Discovery cards (embedded in Chats) — send full filter payload
  useEffect(() => {
    const runDiscovery = async () => {
      if (!profile?.id || !discoveryHistoryHydrated) return;
      const anchor = await resolveDiscoveryAnchor();
      setDiscoveryAnchor(anchor);
      if (!anchor) {
        setDiscoveryProfiles([]);
        setDiscoveryLocationBlocked(true);
        return;
      }
      setDiscoveryLocationBlocked(false);
      setDiscoveryLoading(true);
      try {
        setDiscoveryVisibleCount(20);
        const wavedByUserIds = new Set<string>();
        if (filters.whoWavedAtMe) {
          const waveSelectAttempts = [
            "from_user_id, sender_id",
            "from_user_id",
            "sender_id",
          ];
          const incomingToAttempts: Array<"to_user_id" | "receiver_id"> = ["to_user_id", "receiver_id"];
          let incomingLoaded = false;
          for (const selectCols of waveSelectAttempts) {
            for (const toCol of incomingToAttempts) {
              const { data: waveRows, error: waveErr } = await supabase
                .from("waves")
                .select(selectCols)
                .eq(toCol, profile.id);
              if (waveErr) {
                continue;
              }
              for (const row of (waveRows || []) as Array<Record<string, unknown>>) {
                const senderId = String(row.from_user_id || row.sender_id || "");
                if (senderId) wavedByUserIds.add(senderId);
              }
              incomingLoaded = true;
              break;
            }
            if (incomingLoaded) break;
          }
        }
        const handledIds = new Set<string>();
        try {
          const handledRaw = localStorage.getItem(handledDiscoveryKey);
          const handledCached = handledRaw ? (JSON.parse(handledRaw) as string[]) : [];
          if (Array.isArray(handledCached)) {
            handledCached.forEach((id) => {
              if (typeof id === "string" && id) handledIds.add(id);
            });
          }
        } catch {
          // ignore malformed local handled cache
        }
        const outgoingWaveTargetIds = new Set<string>();
        const waveSentAttempts = ["to_user_id, receiver_id", "to_user_id", "receiver_id"];
        const outgoingFromAttempts: Array<"from_user_id" | "sender_id"> = ["from_user_id", "sender_id"];
        let outgoingLoaded = false;
        for (const selectCols of waveSentAttempts) {
          for (const fromCol of outgoingFromAttempts) {
            const { data: sentRows, error: sentErr } = await supabase
              .from("waves")
              .select(selectCols)
              .eq(fromCol, profile.id);
            if (sentErr) continue;
            for (const row of (sentRows || []) as Array<Record<string, unknown>>) {
              const targetId = String(row.to_user_id || row.receiver_id || "");
              if (targetId) {
                handledIds.add(targetId);
                outgoingWaveTargetIds.add(targetId);
              }
            }
            outgoingLoaded = true;
            break;
          }
          if (outgoingLoaded) break;
        }
        // Mutual-wave guard: if both directions exist, always treat as handled even when matches sync lags.
        if (outgoingWaveTargetIds.size > 0) {
          const waveReceivedAttempts = ["from_user_id, sender_id", "from_user_id", "sender_id"];
          for (const selectCols of waveReceivedAttempts) {
            const receivedQuery = supabase
              .from("waves")
              .select(selectCols)
              .limit(500) as unknown as {
                eq: (column: "to_user_id" | "receiver_id", value: string) => Promise<{ data: unknown; error: unknown }>;
              };
            const receivedResultPrimary = await receivedQuery.eq("to_user_id", profile.id);
            let data = receivedResultPrimary.data;
            let error = receivedResultPrimary.error;
            if (error) {
              const receivedResultFallback = await receivedQuery.eq("receiver_id", profile.id);
              data = receivedResultFallback.data;
              error = receivedResultFallback.error;
            }
            if (error) continue;
            for (const row of (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>) {
              const sourceId = String(row.from_user_id || row.sender_id || "");
              if (sourceId && outgoingWaveTargetIds.has(sourceId)) {
                handledIds.add(sourceId);
              }
            }
            break;
          }
        }
        // Hard guard: accepted wave counterparts are always hidden from discovery
        // even when matches table replication is delayed.
        const acceptedWaveSelectAttempts = [
          "from_user_id,to_user_id,sender_id,receiver_id,status",
          "sender_id,receiver_id,status",
          "from_user_id,to_user_id,status",
        ];
        for (const selectCols of acceptedWaveSelectAttempts) {
          const fromAttempts: Array<"sender_id" | "from_user_id"> = ["sender_id", "from_user_id"];
          let acceptedLoaded = false;
          for (const fromCol of fromAttempts) {
            const { data: acceptedRows, error: acceptedError } = await supabase
              .from("waves")
              .select(selectCols)
              .eq(fromCol, profile.id)
              .eq("status", "accepted")
              .limit(500);
            if (acceptedError) continue;
            for (const row of (acceptedRows || []) as Array<Record<string, unknown>>) {
              const counterpart = String(row.receiver_id || row.to_user_id || "");
              if (counterpart) handledIds.add(counterpart);
            }
            acceptedLoaded = true;
            break;
          }
          if (acceptedLoaded) break;
        }
        for (const selectCols of acceptedWaveSelectAttempts) {
          const toAttempts: Array<"receiver_id" | "to_user_id"> = ["receiver_id", "to_user_id"];
          let acceptedLoaded = false;
          for (const toCol of toAttempts) {
            const { data: acceptedRows, error: acceptedError } = await supabase
              .from("waves")
              .select(selectCols)
              .eq(toCol, profile.id)
              .eq("status", "accepted")
              .limit(500);
            if (acceptedError) continue;
            for (const row of (acceptedRows || []) as Array<Record<string, unknown>>) {
              const counterpart = String(row.sender_id || row.from_user_id || "");
              if (counterpart) handledIds.add(counterpart);
            }
            acceptedLoaded = true;
            break;
          }
          if (acceptedLoaded) break;
        }
        const matchesRows = await fetchUserMatches();
        if (matchesRows.length > 0) {
          const matchedIds = new Set<string>();
          for (const row of matchesRows) {
            const counterpart = row.user1_id === profile.id ? row.user2_id : row.user1_id;
            if (counterpart) {
              handledIds.add(counterpart);
              matchedIds.add(counterpart);
            }
          }
          try {
            localStorage.setItem(matchedDiscoveryKey, JSON.stringify(Array.from(matchedIds)));
          } catch {
            // ignore cache write failure
          }
        }
        try {
          const matchedRaw = localStorage.getItem(matchedDiscoveryKey);
          const matchedCached = matchedRaw ? (JSON.parse(matchedRaw) as string[]) : [];
          if (Array.isArray(matchedCached)) {
            matchedCached.forEach((id) => {
              if (typeof id === "string" && id) handledIds.add(id);
            });
          }
        } catch {
          // ignore malformed local matched cache
        }
        setHandledDiscoveryIds((prev) => {
          const next = new Set([...prev, ...handledIds]);
          try {
            localStorage.setItem(handledDiscoveryKey, JSON.stringify(Array.from(next)));
          } catch {
            // ignore cache write failure
          }
          return next;
        });
        const mergedProfiles = new Map<string, DiscoveryProfile>();
        const pinDistrictByUserId = new Map<string, string | null>();
        const liveLocationDistrictByUserId = new Map<string, string | null>();
        const pinRadiusM = Math.max(1000, Math.round(effectiveDiscoveryDistanceKm * 1000));
        try {
          const hasExplicitHeightFilter =
            isPremium && (filters.heightMin > DEFAULT_FILTERS.heightMin || filters.heightMax < DEFAULT_FILTERS.heightMax);
          const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
            "social_discovery",
            {
              p_user_id: profile.id,
              p_lat: anchor.lat,
              p_lng: anchor.lng,
              p_radius_m: pinRadiusM,
              p_min_age: Math.max(16, filters.ageMin || 16),
              p_max_age: Math.max(Math.max(16, filters.ageMin || 16), filters.ageMax || 99),
              p_role: null,
              p_gender: filters.genders.length === 1 ? filters.genders[0] ?? null : null,
              p_species: filters.species.length === ALL_SPECIES.length ? null : filters.species,
              p_pet_size: null,
              p_advanced: isPremium,
              p_height_min: hasExplicitHeightFilter ? filters.heightMin : null,
              p_height_max: hasExplicitHeightFilter ? filters.heightMax : null,
              p_only_waved: filters.whoWavedAtMe,
              p_active_only: filters.activeOnly,
            }
          );
          if (error) throw error;
          const fromEdge = ((data || []) as DiscoveryProfile[]).map((row) => ({
            ...row,
            social_role: Array.isArray((row as DiscoveryProfile & { availability_status?: string[] | null }).availability_status)
              ? (((row as DiscoveryProfile & { availability_status?: string[] | null }).availability_status || [])[0] ?? null)
              : row.social_role ?? null,
          }));
          for (const row of fromEdge) {
            const existing = mergedProfiles.get(row.id);
            mergedProfiles.set(row.id, {
              ...existing,
              ...row,
              display_name: row.display_name || existing?.display_name || "User",
              avatar_url: row.avatar_url || existing?.avatar_url || null,
              location_name: row.location_name || existing?.location_name || null,
            });
          }

          const mergedIds = Array.from(mergedProfiles.keys());
          if (mergedIds.length > 0) {
            const { data: liveLocations } = await supabase
              .from("user_locations")
              .select("user_id, location_name, updated_at")
              .in("user_id", mergedIds)
              .order("updated_at", { ascending: false });

            for (const row of (liveLocations || []) as Array<{ user_id?: string | null; location_name?: string | null }>) {
              const userId = String(row.user_id || "").trim();
              if (!userId || liveLocationDistrictByUserId.has(userId)) continue;
              const district = extractDistrictToken(row.location_name || null);
              liveLocationDistrictByUserId.set(userId, district);
              if (!pinDistrictByUserId.has(userId)) {
                pinDistrictByUserId.set(userId, district);
              }
            }

            const { data: profileEnrichment } = await supabase
              .from("profiles")
              .select("id, pet_experience, degree, languages, height, has_car, verification_status, is_verified, relationship_status, orientation, gender_genre, availability_status, last_active_at, updated_at, created_at, last_lat, last_lng, location_name, location_district")
              .in("id", mergedIds);
            for (const row of (profileEnrichment || []) as DiscoveryProfile[]) {
              const existing = mergedProfiles.get(row.id);
              if (!existing) continue;
              const profileDistrict = String(row.location_district || "").trim() || null;
              const profileLocation = String(row.location_name || "").trim() || null;
              const liveDistrict = liveLocationDistrictByUserId.get(row.id) || null;
              const pinDistrict = pinDistrictByUserId.get(row.id) || null;
              mergedProfiles.set(row.id, {
                ...existing,
                ...row,
                location_name: resolveDiscoveryLocationLabel({
                  liveLocationDistrict: liveDistrict,
                  pinDistrict,
                  profileLocationDistrict: profileDistrict,
                  profileLocationName: profileLocation || existing.location_name || null,
                }),
              });
            }
          }
        } catch (edgeErr) {
          console.warn("[Chats] social_discovery rpc unavailable", edgeErr);
          setDiscoveryProfiles([]);
          return;
        }
        const mergedList = applyDiscoveryClientFilters(Array.from(mergedProfiles.values()), {
          ...filters,
          maxDistanceKm: effectiveDiscoveryDistanceKm,
        }, {
          enforceVerifiedOnly: filters.verifiedOnly,
          enforceActiveOnly: filters.activeOnly,
          wavedByUserIds,
          anchor,
        }).filter((row) => row.id !== profile.id && !handledIds.has(row.id));
        if (mergedList.length > 0) {
          setDiscoveryProfiles(mergedList);
          return;
        }
        setDiscoveryProfiles([]);
      } catch (err) {
        console.warn("[Chats] Discovery failed", err);
        setDiscoveryProfiles([]);
      } finally {
        setDiscoveryLoading(false);
      }
    };
    runDiscovery();
  }, [
    discoveryHistoryHydrated,
    profile?.id,
    filters,
    effectiveDiscoveryDistanceKm,
    isPremium,
    effectiveTier,
    resolveDiscoveryAnchor,
    discoveryRefreshTick,
    handledDiscoveryKey,
    passedDiscoveryKey,
    passedDiscoverySessionKey,
    matchedDiscoveryKey,
  ]);

  useEffect(() => {
    if (discoveryLoading) return;
    if (discoveryProfiles.length === 0) return;
    const visibleCount = discoveryProfiles.filter((p) => {
      if (hiddenDiscoveryIds.has(p.id)) return false;
      if (blockedUserIds.has(p.id)) return false;
      if (handledDiscoveryIds.has(p.id)) return false;
      return true;
    }).length;
    if (visibleCount === 0) {
      if (hiddenDiscoveryIds.size > 0) {
        setHiddenDiscoveryIds(new Set());
      }
      if (discoveryVisibleCount !== 20) {
        setDiscoveryVisibleCount(20);
      }
    }
  }, [
    blockedUserIds,
    discoveryVisibleCount,
    discoveryLoading,
    discoveryProfiles,
    handledDiscoveryIds,
    hiddenDiscoveryIds,
  ]);

  useEffect(() => {
    const loadAlbums = async () => {
      if (discoveryProfiles.length === 0) return;
      const next: Record<string, string[]> = {};
      for (const p of discoveryProfiles) {
        const album = canonicalizeSocialAlbumEntries(Array.isArray(p?.social_album) ? p.social_album : []);
        if (!album.length) continue;
        next[p.id] = await resolveSocialAlbumUrlList(album, 60 * 60);
      }
      if (Object.keys(next).length > 0) {
        setAlbumUrls((prev) => ({ ...prev, ...next }));
      }
    };
    loadAlbums();
  }, [discoveryProfiles]);

  const loadRoomMessages = useCallback(async (roomId: string) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("chat_id", roomId)
      .order("created_at", { ascending: true })
      .limit(150);
    if (error) {
      toast.error("Failed to load chat messages");
      return;
    }
    setActiveRoomMessages((data || []) as { id: string; sender_id: string; content: string; created_at: string }[]);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`chats_messages_${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void loadConversations();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, profile?.id]);

  useEffect(() => {
    if (!activeRoomId) return;
    const roomChannel = supabase
      .channel(`active_room_${activeRoomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${activeRoomId}` },
        () => {
          void loadRoomMessages(activeRoomId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(roomChannel);
    };
  }, [activeRoomId, loadRoomMessages]);

  const getChatPreview = (chat: ChatUser) => {
    const override = String(chat.previewOverride || "").trim();
    if (override) return override;
    if (isStarIntroKind(chat.lastMessageKind || null)) {
      const isSender = chat.lastMessageStarSenderId === profile?.id || chat.lastMessageFromMe === true;
      return isSender ? "You sent a Star ⭐" : "New Star Connection ⭐";
    }
    return parseChatPreviewText(chat.lastMessage);
  };

  const getServiceStatusLabel = (chat: ChatUser) => {
    switch (chat.serviceStatus) {
      case "booked":
        return "Booked";
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      case "disputed":
        return "Disputed";
      default:
        return "Pending";
    }
  };

  // Filter chats based on active tab and search (unified tab system)
  const filteredChats = chats.filter(chat => {
    if (chat.peerUserId && chat.peerUserId === profile?.id) return false;
    const matchesTab =
      mainTab === "friends"
        ? chat.type === "friend" && !chat.hasTransaction
        : mainTab === "service"
          ? chat.type === "service"
          : false;
    const matchesSearch = !searchQuery ||
      chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getChatPreview(chat).toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });
  const avatarOnlyMatchedChats = filteredChats.filter(
    (chat) =>
      Boolean(chat.peerUserId) &&
      chat.peerUserId !== profile?.id &&
      !chat.lastMessageAt &&
      getChatPreview(chat).length === 0
  );
  const avatarOnlyMatchOnlyAvatars = matchOnlyAvatars.filter(
    (entry) => !filteredChats.some((chat) => chat.peerUserId === entry.userId)
  );
  const visibleConversationChats = filteredChats.filter((chat) => {
    const hasConversationActivity = Boolean(chat.lastMessageAt) || getChatPreview(chat).length > 0;
    if (!hasConversationActivity) return false;
    return !avatarOnlyMatchedChats.some((avatarOnly) => avatarOnly.id === chat.id);
  });
  const priorityStarChats = visibleConversationChats.filter(
    (chat) => isStarIntroKind(chat.lastMessageKind || null) && chat.lastMessageFromMe !== true
  );
  const regularConversationChats = visibleConversationChats.filter(
    (chat) => !priorityStarChats.some((priorityChat) => priorityChat.id === chat.id)
  );
  const filteredServiceChats = filteredChats;
  const strictMatchedDiscoveryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const chat of chats) {
      if (chat.type !== "friend") continue;
      const peerId = String(chat.peerUserId || "").trim();
      if (!peerId) continue;
      ids.add(peerId);
    }
    for (const entry of matchOnlyAvatars) {
      const peerId = String(entry.userId || "").trim();
      if (!peerId) continue;
      ids.add(peerId);
    }
    return ids;
  }, [chats, matchOnlyAvatars]);

  useEffect(() => {
    if (strictMatchedDiscoveryIds.size === 0) return;
    setHandledDiscoveryIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of strictMatchedDiscoveryIds) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      if (!changed) return prev;
      try {
        localStorage.setItem(handledDiscoveryKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore cache write failure
      }
      return next;
    });
  }, [handledDiscoveryKey, strictMatchedDiscoveryIds]);

  // Filter groups based on search
  const filteredGroups = groups.filter(group => {
    return !searchQuery ||
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalUnreadMessages = useMemo(
    () => chats.reduce((sum, chat) => sum + Math.max(0, chat.unread || 0), 0) + groups.reduce((sum, group) => sum + Math.max(0, group.unread || 0), 0),
    [chats, groups]
  );

  useEffect(() => {
    if (!profile?.id) return;
    try {
      localStorage.setItem(`chats_unread_${profile.id}`, String(totalUnreadMessages));
      window.dispatchEvent(new CustomEvent("huddle:chats-unread", { detail: { count: totalUnreadMessages } }));
    } catch {
      // ignore storage dispatch failure
    }
  }, [profile?.id, totalUnreadMessages]);

  useEffect(() => {
    if (topTab === "chats") {
      setShowChatsToggleDot(false);
      setLastClearedUnreadCount(totalUnreadMessages);
      return;
    }
    if (totalUnreadMessages <= 0) {
      setShowChatsToggleDot(false);
      return;
    }
    if (totalUnreadMessages > lastClearedUnreadCount) {
      setShowChatsToggleDot(true);
    }
  }, [lastClearedUnreadCount, topTab, totalUnreadMessages]);

  const baseDiscoverySource = discoveryProfiles.filter(
    (p) =>
      !hiddenDiscoveryIds.has(p.id) &&
      !blockedUserIds.has(p.id) &&
      !handledDiscoveryIds.has(p.id) &&
      !strictMatchedDiscoveryIds.has(p.id)
  );
  const visibleDiscoverySource = baseDiscoverySource.filter((p) => !passedDiscoveryIds.has(p.id));
  const carryoverQueue = visibleDiscoverySource.filter((p) => carryoverPassedIds.has(p.id));
  const primaryQueue = visibleDiscoverySource.filter((p) => !carryoverPassedIds.has(p.id));
  const discoverySource = silentGoldDiscoveryCapReached ? [] : [...primaryQueue, ...carryoverQueue];
  const discoveryDeck = discoverySource.slice(0, discoveryVisibleCount);
  const currentDiscovery = discoveryDeck[0] ?? null;
  const nextDiscovery = discoveryDeck[1] ?? null;
  const thirdDiscovery = discoveryDeck[2] ?? null;
  const fourthDiscovery = discoveryDeck[3] ?? null;
  const fifthDiscovery = discoveryDeck[4] ?? null;
  const showDiscoverEmpty = !discoveryLoading && !currentDiscovery && !discoveryLocationBlocked;
  const discoveryStackHasRealNext = Boolean(currentDiscovery && nextDiscovery);

  useEffect(() => {
    if (discoveryLoading || discoveryLocationBlocked) return;
    if (currentDiscovery) return;
    if (discoveryProfiles.length === 0) return;
    // Do not auto-reset handled/passed state here. Resetting causes matched users
    // to re-enter Discover and re-trigger "already matched" dead-end states.
  }, [
    currentDiscovery,
    discoveryLoading,
    discoveryLocationBlocked,
    discoveryProfiles.length,
  ]);

  const getDiscoveryAlbum = useCallback((profileRow?: DiscoveryProfile | null) => {
    if (!profileRow) return [] as string[];
    const normalizedSocialAlbum = canonicalizeSocialAlbumEntries(
      Array.isArray(profileRow.social_album) ? profileRow.social_album : []
    );
    const resolvedSocialAlbum = Array.isArray(albumUrls[profileRow.id]) ? albumUrls[profileRow.id] : [];
    const album = resolvedSocialAlbum.length > 0 ? resolvedSocialAlbum : normalizedSocialAlbum;
    return Array.from(
      new Set(
        [profileRow.avatar_url || "", ...album]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  }, [albumUrls]);

  useEffect(() => {
    setDiscoverImageIndex(0);
  }, [currentDiscovery?.id]);

  const refreshDiscovery = useCallback(() => {
    setSwipeDir(null);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [dragY]);

  const handleExpandSearch = useCallback(() => {
    if (!canExpandSearch) return;
    setExpandedDistanceKm((prev) => {
      const base = prev === null ? Math.max(1, Math.round(filters.maxDistanceKm || 5)) : prev;
      return Math.min(DISCOVERY_MAX_RADIUS_KM, base + DISCOVERY_EXPAND_STEP_KM);
    });
    setSwipeDir(null);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [canExpandSearch, dragY, filters.maxDistanceKm]);

  const resurfacePassedProfiles = useCallback(() => {
    setPassedDiscoveryIds(new Set());
    setCarryoverPassedIds(new Set());
    try {
      sessionStorage.removeItem(passedDiscoverySessionKey);
      localStorage.removeItem(passedDiscoveryKey);
    } catch {
      // ignore cache clear failure
    }
    setSwipeDir(null);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [dragY, passedDiscoveryKey, passedDiscoverySessionKey]);

  const advanceDiscoveryCard = useCallback((currentId?: string, action?: "wave" | "star" | "pass") => {
    dragY.set(0);
    setSwipeDir(null);
    if (currentId) {
      if (action === "pass") {
        setHiddenDiscoveryIds((prev) => {
          if (!prev.has(currentId)) return prev;
          const next = new Set(prev);
          next.delete(currentId);
          return next;
        });
        setDiscoveryProfiles((prev) => {
          const index = prev.findIndex((item) => item.id === currentId);
          if (index < 0) return prev;
          const item = prev[index];
          return [...prev.slice(0, index), ...prev.slice(index + 1), item];
        });
        setPassedDiscoveryIds((prev) => {
          const next = new Set(prev);
          next.add(currentId);
          try {
            const ids = Array.from(next);
            sessionStorage.setItem(passedDiscoverySessionKey, JSON.stringify(ids));
            localStorage.setItem(
              passedDiscoveryKey,
              JSON.stringify({ ids, sessionId: discoverySessionId })
            );
          } catch {
            // ignore cache write failure
          }
          return next;
        });
      } else {
        setHandledDiscoveryIds((prev) => {
          const next = new Set(prev);
          next.add(currentId);
          try {
            localStorage.setItem(handledDiscoveryKey, JSON.stringify(Array.from(next)));
          } catch {
            // ignore cache write failure
          }
          return next;
        });
      }
    }
  }, [discoverySessionId, dragY, handledDiscoveryKey, passedDiscoveryKey, passedDiscoverySessionKey]);

  const commitDiscoverySwipe = useCallback((direction: "up" | "down", currentId?: string, action?: "wave" | "star" | "pass") => {
    setSwipeDir(direction);
    advanceDiscoveryCard(currentId, action);
  }, [advanceDiscoveryCard]);

  const persistMatchedDiscoveryUser = useCallback((userId?: string | null) => {
    const normalized = String(userId || "").trim();
    if (!normalized) return;

    setHandledDiscoveryIds((prev) => {
      const next = new Set(prev);
      next.add(normalized);
      try {
        localStorage.setItem(handledDiscoveryKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore cache write failure
      }
      return next;
    });

    try {
      const raw = localStorage.getItem(matchedDiscoveryKey);
      const current = raw ? (JSON.parse(raw) as string[]) : [];
      const next = Array.from(
        new Set([...(Array.isArray(current) ? current : []), normalized]),
      );
      localStorage.setItem(matchedDiscoveryKey, JSON.stringify(next));
    } catch {
      // ignore cache write failure
    }
  }, [handledDiscoveryKey, matchedDiscoveryKey]);

  useEffect(() => {
    if (discoverySource.length === 0) {
      return;
    }
    // Keep pass queue behavior deterministic:
    // when there are passed profiles, do not prefetch new profiles into this session queue.
    if (passedDiscoveryIds.size > 0) {
      return;
    }
    if (discoveryDeck.length < 5 && discoverySource.length > discoveryVisibleCount) {
      setDiscoveryVisibleCount((prev) => Math.min(prev + 20, discoverySource.length));
      return;
    }
  }, [discoveryDeck.length, discoveryLoading, discoverySource.length, discoveryVisibleCount, passedDiscoveryIds.size]);
  const groupSelectableUsers = useMemo(() => {
    const nextById = new Map<string, GroupContactOption>();
    const add = (entry: GroupContactOption | null | undefined) => {
      if (!entry?.id) return;
      if (entry.id === profile?.id) return;
      if (blockedUserIds.has(entry.id)) return;
      if (nextById.has(entry.id)) return;
      nextById.set(entry.id, entry);
    };

    groupContactPool.forEach((entry) => add(entry));
    chats
      .filter((chat) => chat.type === "friend" && chat.peerUserId)
      .forEach((chat) =>
        add({
          id: String(chat.peerUserId),
          name: chat.name || "User",
          avatar: chat.avatarUrl || undefined,
          verified: Boolean(chat.isVerified),
        })
      );
    matchOnlyAvatars.forEach((entry) =>
      add({
        id: entry.userId,
        name: entry.name || "User",
        avatar: entry.avatarUrl || undefined,
        verified: Boolean(entry.isVerified),
      })
    );

    return Array.from(nextById.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [blockedUserIds, chats, groupContactPool, matchOnlyAvatars, profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    void (async () => {
      const matchesRows = await fetchUserMatches();
      const counterpartIds = Array.from(
        new Set(
          matchesRows
            .map((row) => (row.user1_id === profile.id ? row.user2_id : row.user1_id))
            .filter((id) => Boolean(id) && id !== profile.id && !blockedUserIds.has(id))
        )
      );

      if (counterpartIds.length === 0) {
        setGroupContactPool([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_status, is_verified")
        .in("id", counterpartIds)
        .limit(250);
      if (error) {
        const fallback = counterpartIds.map((id) => ({
          id,
          name: "User",
          avatar: undefined,
          verified: false,
        }));
        setGroupContactPool(fallback);
        return;
      }

      const byId = new Map(
        (((data || []) as unknown) as DiscoveryProfile[]).map((row) => [row.id, row] as const)
      );
      const next = counterpartIds
        .map((id) => byId.get(id))
        .filter((row): row is DiscoveryProfile => Boolean(row))
        .map((row) => ({
          id: row.id,
          name: row.display_name || "User",
          avatar: row.avatar_url || undefined,
          verified: row.is_verified === true,
        }));
      if (next.length > 0) {
        setGroupContactPool(next);
      } else {
        const fallback = counterpartIds.map((id) => ({
          id,
          name: "User",
          avatar: undefined,
          verified: false,
        }));
        setGroupContactPool(fallback);
      }
    })();
  }, [blockedUserIds, fetchUserMatches, matchesFeedTick, profile?.id]);

  const ensureDirectRoom = useCallback(async (targetUserId: string, targetName: string) => {
    if (!profile?.id) return null;
    const roomId = await ensureDirectChatRoom(supabase, profile.id, targetUserId, targetName);
    if (roomId) rememberDirectPeer(roomId, targetUserId);
    return roomId;
  }, [profile?.id, rememberDirectPeer]);

  const enqueueChatNotification = useCallback(
    async (args: { userId: string; kind: string; title: string; body: string; href: string; data?: Record<string, unknown> }) => {
      try {
        let normalizedHref = args.href;
        if (normalizedHref === "/chats") normalizedHref = "/chats?tab=discover";
        if (!normalizedHref.startsWith("/")) normalizedHref = "/chats?tab=discover";
        const { error } = await (supabase.rpc as (fn: string, params?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
          "enqueue_notification",
          {
            p_user_id: args.userId,
            p_category: "chats",
            p_kind: args.kind,
            p_title: args.title,
            p_body: args.body,
            p_href: normalizedHref,
            p_data: args.data ?? {},
          }
        );
        if (error) {
          console.warn("[chats.notification] enqueue_notification failed", {
            kind: args.kind,
            href: normalizedHref,
            message: error.message || "unknown_error",
          });
        }
      } catch {
        // Keep UX non-blocking; notification failures should not block primary action.
      }
    },
    []
  );

  useEffect(() => {
    if (!matchModal) {
      setMatchQuickHello("");
    }
  }, [matchModal]);

  const sendMatchQuickHello = useCallback(async () => {
    if (!matchModal || !profile?.id || openingMatchChat) return;
    const targetName = matchModal.name || "Conversation";
    const text = matchQuickHello.trim();
    setOpeningMatchChat(true);
    try {
      const roomId =
        matchModal.roomId ||
        (await ensureDirectChatRoom(supabase, profile.id, matchModal.userId, targetName));
      if (!roomId) throw new Error("room_not_created");
      rememberDirectPeer(roomId, matchModal.userId);
      if (text) {
        const { error: messageErr } = await supabase
          .from("chat_messages")
          .insert({ chat_id: roomId, sender_id: profile.id, content: text });
        if (messageErr) throw messageErr;
      }
      setMatchModal(null);
      setMatchQuickHello("");
      markRoomSeen(roomId);
      markMatchSeen(matchModal.userId);
      navigate(
      `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(targetName)}&with=${encodeURIComponent(
          matchModal.userId
        )}`
      );
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message || "")
          : String(err || "");
      console.error("[chats.match.quick_hello_failed]", detail || err);
      toast.error(detail ? `Unable to open chat right now: ${detail}` : "Unable to open chat right now.");
    } finally {
      setOpeningMatchChat(false);
    }
  }, [markMatchSeen, markRoomSeen, matchModal, matchQuickHello, navigate, openingMatchChat, profile?.id, rememberDirectPeer]);

  const closeMatchModal = useCallback(() => {
    if (matchModal?.userId) {
      markMatchSeen(matchModal.userId);
      setMatchOnlyAvatars((prev) => {
        const exists = prev.some((entry) => entry.userId === matchModal.userId);
        if (exists) return prev;
        return [
          {
            userId: matchModal.userId,
            name: matchModal.name || "Conversation",
            avatarUrl: matchModal.avatarUrl || null,
            isVerified: false,
            hasCar: false,
            matchedAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 12);
      });
    }
    setMatchModal(null);
  }, [markMatchSeen, matchModal]);

  const openMatchModalFor = useCallback(
    async (target: { userId: string; name: string; avatarUrl?: string | null }) => {
      if (!profile?.id || !target.userId) return null;
      persistMatchedDiscoveryUser(target.userId);
      markMatchSeen(target.userId);
      const nextModal: MatchModalState = {
        userId: target.userId,
        name: target.name || "Conversation",
        avatarUrl: target.avatarUrl || null,
        roomId: null,
      };
      setMatchModal(nextModal);
      void loadConversations();
      try {
        const roomId = await ensureDirectChatRoom(
          supabase,
          profile.id,
          target.userId,
          target.name || "Conversation"
        );
        if (roomId) {
          rememberDirectPeer(roomId, target.userId);
          setMatchModal((prev) => {
            if (!prev || prev.userId !== target.userId) return prev;
            return { ...prev, roomId };
          });
        }
        return roomId;
      } catch (err: unknown) {
        console.error("[chats.match.open_modal_room_failed]", err);
        // Keep modal visible; chat room can still be retried from send/start action.
        return null;
      }
    },
    [loadConversations, markMatchSeen, persistMatchedDiscoveryUser, profile?.id, rememberDirectPeer]
  );

  useEffect(() => {
    if (!profile?.id || matchModal || !seenMatchesHydrated || !localSeenMatchesHydrated) return;
    if (seenMatchesServerState !== "ready") return;
    let cancelled = false;
    void (async () => {
      try {
        const matchesRows = await fetchUserMatches();
        if (cancelled || matchesRows.length === 0) return;
        const candidateIds: string[] = [];
        for (const row of matchesRows) {
          const counterpart = row.user1_id === profile.id ? row.user2_id : row.user1_id;
          if (!counterpart) continue;
          if (seenMatchUserIdsRef.current.has(counterpart)) continue;
          if (serverSeenMatchUserIdsRef.current.has(counterpart)) continue;
          if (blockedUserIds.has(counterpart)) continue;
          candidateIds.push(counterpart);
        }
        if (!candidateIds.length || cancelled) return;
        const { data: targetProfiles, error: targetProfilesError } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", candidateIds.slice(0, 20));
        if (targetProfilesError || cancelled || !Array.isArray(targetProfiles) || targetProfiles.length === 0) return;
        const targetProfileById = new Map<string, { id: string; display_name: string | null; avatar_url: string | null }>();
        for (const row of targetProfiles as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
          targetProfileById.set(row.id, row);
        }
        const targetUserId = candidateIds.find((id) => targetProfileById.has(id)) || null;
        if (!targetUserId) return;
        const targetProfile = targetProfileById.get(targetUserId);
        if (!targetProfile) return;
        const names = candidateIds
          .slice(0, 3)
          .map((id) => (targetProfileById.get(id)?.display_name || "").trim())
          .filter(Boolean);
        if (candidateIds.length > 3) {
          toast.info(`You have matched with ${candidateIds.length} new friends!`);
        } else if (names.length > 1) {
          toast.info(`You're now friends with ${names.join(", ")}!`);
        }
        await openMatchModalFor({
          userId: targetUserId,
          name: String(targetProfile.display_name || "Conversation"),
          avatarUrl: (targetProfile.avatar_url as string | null) ?? null,
        });
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    blockedUserIds,
    fetchUserMatches,
    matchModal,
    matchesFeedTick,
    openMatchModalFor,
    profile?.id,
    localSeenMatchesHydrated,
    seenMatchesHydrated,
    seenMatchesServerState,
  ]);

  useEffect(() => {
    if (!profile?.id) return;
    const onMatchChange = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      const row = (payload.new || payload.old || null) as Record<string, unknown> | null;
      if (!row) return;
      const user1 = String(row.user1_id || "");
      const user2 = String(row.user2_id || "");
      if (user1 !== profile.id && user2 !== profile.id) return;
      setMatchesFeedTick((prev) => prev + 1);
      void loadConversations();
    };

    const channel = supabase
      .channel(`matches_feed_${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches" }, onMatchChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, onMatchChange)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    // Auto-open group manage dialog if navigated here via ?manage=roomId
    const manageGroupId = searchParams.get("manage");
    if (manageGroupId) {
      if (isVerified) {
        setGroupManageId(manageGroupId);
      } else {
        setGroupVerifyGateOpen(true);
      }
      setMainTab("groups");
    }

    const openUserId = searchParams.get("with");
    const openUserName = searchParams.get("name") || "Conversation";
    const openRoomId = searchParams.get("room");

    if (openRoomId) {
      markRoomSeen(openRoomId);
      navigate(
        `/chat-dialogue?room=${encodeURIComponent(openRoomId)}&name=${encodeURIComponent(openUserName)}${
          openUserId ? `&with=${encodeURIComponent(openUserId)}` : ""
        }`,
        { replace: true }
      );
      return;
    }

    if (!openUserId || openUserId === profile.id) return;
    void (async () => {
      try {
        const roomId = await ensureDirectRoom(openUserId, openUserName);
        if (!roomId) return;
        markRoomSeen(roomId);
        navigate(
          `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(openUserName)}&with=${encodeURIComponent(
            openUserId
          )}`,
          { replace: true }
        );
      } catch {
        toast.error("Unable to open chat right now.");
      }
    })();
  }, [ensureDirectRoom, isVerified, markRoomSeen, navigate, profile?.id, searchParams]);

  const sendInlineMessage = useCallback(async () => {
    if (!activeRoomId || !profile?.id || !chatInput.trim() || chatSending) return;
    setChatSending(true);
    const text = chatInput.trim();
    setChatInput("");
    try {
      const { data: recipients } = await supabase
        .from("chat_room_members")
        .select("user_id")
        .eq("chat_id", activeRoomId)
        .neq("user_id", profile.id);
      const recipientIds = (((recipients || []) as unknown) as Array<{ user_id: string }>).map((item) => item.user_id);
      for (const recipientId of recipientIds) {
        const blocked = await areUsersBlocked(profile.id, recipientId);
        if (blocked) {
          toast.error("Messaging blocked for this user.");
          setChatInput(text);
          setChatSending(false);
          return;
        }
      }
      const { error } = await supabase
        .from("chat_messages")
        .insert({ chat_id: activeRoomId, sender_id: profile.id, content: text });
      if (error) throw error;
      await loadRoomMessages(activeRoomId);
      await loadConversations();
    } catch {
      toast.error("Failed to send message");
      setChatInput(text);
    } finally {
      setChatSending(false);
    }
  }, [activeRoomId, chatInput, chatSending, loadConversations, loadRoomMessages, profile?.id]);

  const handleCreateGroup = () => {
    if (!isVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    setIsCreateGroupOpen(true);
  };

  const handleGroupCreated = (chatId: string) => {
    void loadConversations();
    navigate(`/chat-dialogue?room=${encodeURIComponent(chatId)}`);
  };

  const fetchExploreGroups = useCallback(async () => {
    setExploreLoading(true);
    try {
      const { data } = await supabase
        .from("chats")
        .select("id, name, avatar_url, location_label, pet_focus, join_method, last_message_at, created_at")
        .eq("type", "group")
        .eq("visibility", "public")
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (!data) return;

      // Client-side ranking: R_pet (0–3) × 3 + R_active (0–2)
      const userSpecies: string[] = (
        (Array.isArray(profile?.pets) ? profile.pets : []) as Array<{ species?: string }>
      )
        .map((p) => (p.species ?? "").toLowerCase())
        .filter(Boolean);

      const scored = data.map((g) => {
        const focusLower = (g.pet_focus ?? []).map((f: string) => f.toLowerCase());
        let petScore = 0;
        if (focusLower.includes("all pets")) {
          petScore = 1;
        } else if (userSpecies.length > 0 && userSpecies.some((s) => focusLower.includes(s))) {
          petScore = 3;
        }
        const msSince = g.last_message_at ? Date.now() - new Date(g.last_message_at).getTime() : Infinity;
        const activeScore = msSince < 86_400_000 ? 2 : msSince < 604_800_000 ? 1 : 0;
        return { ...g, _score: petScore * 3 + activeScore };
      });

      scored.sort((a, b) =>
        b._score - a._score ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setExploreGroups(scored);
    } finally {
      setExploreLoading(false);
    }
  }, [profile?.pets]);

  useEffect(() => {
    if (mainTab === "groups" && groupSubTab === "explore") {
      void fetchExploreGroups();
    }
  }, [mainTab, groupSubTab, fetchExploreGroups]);

  const handleChatClick = (chat: ChatUser) => {
    // Mark as read
    setChats(prev => prev.map(c =>
      c.id === chat.id ? { ...c, unread: 0 } : c
    ));
    if (chat.peerUserId) {
      setMatchOnlyAvatars((prev) => prev.filter((entry) => entry.userId !== chat.peerUserId));
    }
    markRoomSeen(chat.id);
    if (chat.type === "service") {
      navigate(`/service-chat?room=${encodeURIComponent(chat.id)}&name=${encodeURIComponent(chat.name)}`);
      return;
    }
    navigate(
      `/chat-dialogue?room=${encodeURIComponent(chat.id)}&name=${encodeURIComponent(chat.name)}${
        chat.peerUserId ? `&with=${encodeURIComponent(chat.peerUserId)}` : ""
      }`
    );
  };

  const handleMatchAvatarClick = useCallback((entry: MatchOnlyAvatar) => {
    if (!entry.userId) return;
    void (async () => {
      const roomId = await ensureDirectRoom(entry.userId, entry.name || "Conversation");
      if (!roomId) return;
      setMatchOnlyAvatars((prev) => prev.filter((item) => item.userId !== entry.userId));
      markMatchSeen(entry.userId);
      markRoomSeen(roomId);
      navigate(
        `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(entry.name || "Conversation")}&with=${encodeURIComponent(
          entry.userId
        )}`
      );
    })();
  }, [ensureDirectRoom, markMatchSeen, markRoomSeen, navigate]);

  const handleRemoveChat = (chat: ChatUser) => {
    if (chat.hasTransaction) {
      toast.error(t("Cannot remove conversations with active transactions"));
      return;
    }
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    toast.success(t("Conversation removed"));
  };

  const handleGroupClick = (group: Group) => {
    if (group.invitePending) {
      setPendingGroupInvite({
        inviteId: "",
        chatId: group.id,
        chatName: group.name,
        inviterName: group.inviterName || "Someone",
      });
      return;
    }
    // Mark as read
    setGroups(prev => prev.map(g =>
      g.id === group.id ? { ...g, unread: 0 } : g
    ));
    markRoomSeen(group.id);
    navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}`);
  };

  // Tap user profile — open right-side sheet showing public fields; block if non_social
  const handleProfileTap = async (userId: string, displayName: string, avatarUrl?: string | null) => {
    setProfileSheetUser({ id: userId, name: displayName, avatarUrl });
    setProfileSheetData(null);
    setProfileSheetLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, bio, relationship_status, dob, location_name, occupation, school, major, degree, affiliation, verification_status, is_verified, has_car, tier, effective_tier, non_social, hide_from_map, social_album, availability_status, show_affiliation, show_occupation, show_academic, show_bio, show_relationship_status, show_age, show_gender, show_orientation, show_height, show_weight, gender_genre, orientation, experience_years, languages" as "*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setProfileSheetData(null);
        return;
      }
      const { data: pets } = await supabase
        .from("pets")
        .select("id, name, species, photo_url, is_active")
        .eq("owner_id", userId);
      const petHeads = (pets || []).filter((pet) => pet.is_active !== false);
      setProfileSheetData({ ...(data as Record<string, unknown>), pet_heads: petHeads });
    } catch {
      setProfileSheetData(null);
    } finally {
      setProfileSheetLoading(false);
    }
  };

  // Nanny Booking: Open modal (no Safe Harbor popup — disclaimer is inside ChatDialogue)
  const handleNannyBookClick = (chat: ChatUser) => {
    setSelectedNanny(chat);
    setNannyBookingOpen(true);
  };

  // Nanny Booking: Trigger Stripe Checkout via Edge Function
  const handleBookingCheckout = async () => {
    if (!profile?.id || !selectedNanny) return;
    if (!serviceDate || !serviceEndDate || !selectedPet || !startTime || !endTime || !bookingLocation.trim()) {
      toast.error(t("Please complete all booking details"));
      return;
    }
    if (new Date(`${serviceEndDate}T${endTime}`).getTime() <= new Date(`${serviceDate}T${startTime}`).getTime()) {
      toast.error(t("booking.invalid_date_range"));
      return;
    }
    if (!safeHarborAccepted) {
      toast.error(t("You must accept the Safe Harbor terms"));
      return;
    }
    setBookingProcessing(true);

    try {
      const startIso = new Date(`${serviceDate}T${startTime}`).toISOString();
      const endIso = new Date(`${serviceEndDate}T${endTime}`).toISOString();

      const idempotencyKey = `booking_${profile.id}_${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("create-marketplace-booking", {
        headers: { "idempotency-key": idempotencyKey },
        body: {
          clientId: profile.id,
          sitterId: selectedNanny.id,
          amount: Math.round(parseFloat(bookingAmount) * 100), // cents
          currency: bookingCurrency,
          serviceStartDate: startIso,
          serviceEndDate: endIso,
          petId: selectedPet,
          locationName: bookingLocation.trim(),
          successUrl: `${window.location.origin}/chats?booking_success=true`,
          cancelUrl: `${window.location.origin}/chats`,
          safeHarborAccepted: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || t("booking.payment_failed"));
    } finally {
      setBookingProcessing(false);
    }
  };

  return (
    <div className="h-full min-h-0 bg-background relative overflow-x-hidden flex flex-col">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
      />

      {isMinor && (
        <div className="absolute inset-x-4 top-24 z-[60] pointer-events-none">
          <div className="rounded-xl border border-[#3283ff]/30 bg-background/95 px-4 py-3 text-sm font-medium text-[#3283ff] shadow-card">
            {t("Social features restricted for users under 13.")}
          </div>
        </div>
      )}

      <div className={cn("flex-1 min-h-0 flex flex-col", isMinor && "pointer-events-none opacity-70")}>

      {/* ── Discover | Chats top-tab toggle + filter icon ──────────────────── */}
      <div className="flex items-center px-4 pt-3 pb-2 flex-shrink-0">
        {/* Left spacer — mirrors filter button for visual balance */}
        <div className="w-9 flex-shrink-0" />
        {/* Toggle pill — centered */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center bg-muted rounded-full p-1 gap-1">
            <button
              onClick={() => setTopTab("discover")}
              className={cn(
                "px-5 py-1.5 rounded-full text-sm font-semibold transition-all",
                topTab === "discover"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-brandText"
              )}
            >
              {t("Discover")}
            </button>
            <button
              onClick={() => setTopTab("chats")}
              className={cn(
                "relative px-5 py-1.5 rounded-full text-sm font-semibold transition-all",
                topTab === "chats"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-brandText"
              )}
            >
              {t("Chats")}
              {showChatsToggleDot && topTab !== "chats" && totalUnreadMessages > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[rgba(33,69,207,0.14)] px-1.5 py-[1px] text-[10px] font-semibold leading-none text-[#2145CF] ring-2 ring-white">
                  {totalUnreadMessages > 99 ? "99+" : totalUnreadMessages}
                </span>
              )}
            </button>
          </div>
        </div>
        {/* Filter button — right, only in discover tab */}
        {topTab === "discover" && !discoverChatAgeBlocked ? (
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Filter"
          >
            <SlidersHorizontal className="w-5 h-5 text-muted-foreground" strokeWidth={1.75} />
          </button>
        ) : (
          <div className="w-9 flex-shrink-0" />
        )}
      </div>

      {discoverChatAgeBlocked && (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+12px)] pt-3">
          <div className="mx-auto flex w-full max-w-md flex-col items-center">
            <img
              src={discoverAgeGateImage}
              alt="Discover age gate"
              className="w-full max-w-[360px] object-contain"
            />
            <p className="mt-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
              {DISCOVER_AGE_GATE_BODY}
            </p>
          </div>
        </div>
      )}

      {/* ── DISCOVER view ────────────────────────────────────────────────────── */}
      {!discoverChatAgeBlocked && topTab === "discover" && (
        <div
          className={cn(
            "flex-1 min-h-0 flex flex-col overflow-y-auto touch-pan-y pb-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+12px)] transition-all duration-300",
            matchModal && "scale-[0.985] blur-[2px]"
          )}
        >


          {/* Portrait card stack */}
          <div className="px-4 pt-2 pb-0 flex items-start justify-center flex-none">
            <div className="relative w-full max-w-[372px] pb-[10%] sm:pb-[16%] md:pb-[24%]">
              <div className="relative h-[clamp(340px,50vh,480px)] w-full overflow-visible">
                {discoveryStackHasRealNext && (() => {
                  const nextAlbum = getDiscoveryAlbum(nextDiscovery);
                  const nextCover = nextAlbum[0];
                  return (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 z-[5] overflow-hidden rounded-[28px] bg-[#D6DCF6] shadow-[0_10px_24px_rgba(33,71,201,0.12)]"
                      style={{ transform: "translateY(7%) scale(0.92)" }}
                    >
                      {nextCover ? (
                        <img
                          src={nextCover}
                          alt=""
                          className="h-full w-full object-cover object-center"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-[linear-gradient(180deg,#93A1F7_0%,#4765E2_54%,#09155F_100%)]" />
                      )}
                      <div className="absolute inset-0 bg-[rgba(17,37,126,0.34)]" />
                    </div>
                  );
                })()}
                {currentDiscovery && (
                  <div
                    aria-hidden="true"
                    className="absolute z-0 left-1/2 bottom-[-9%] h-[14%] w-full -translate-x-1/2 rounded-[22px] bg-[rgba(79,86,119,0.10)] shadow-[0_4px_8px_rgba(0,0,255,0.10)]"
                    style={{ transform: "translateX(-50%) scaleX(0.73)" }}
                  />
                )}
                {currentDiscovery && (
                  <div
                    aria-hidden="true"
                    className="absolute z-[1] left-1/2 bottom-[-6%] h-[14%] w-full -translate-x-1/2 rounded-[22px] bg-[rgba(33,71,201,0.30)] shadow-[0_4px_8px_rgba(0,0,255,0.10)]"
                    style={{ transform: "translateX(-50%) scaleX(0.81)" }}
                  />
                )}
                {currentDiscovery && (
                  <div
                    aria-hidden="true"
                    className="absolute z-[2] left-1/2 bottom-[-3%] h-[14%] w-full -translate-x-1/2 rounded-[22px] bg-[rgba(33,71,201,0.60)] shadow-[0_4px_8px_rgba(0,0,255,0.10)]"
                    style={{ transform: "translateX(-50%) scaleX(0.9)" }}
                  />
                )}

                {discoveryLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-slate-100/60">
                    <HuddleVideoLoader size={32} />
                  </div>
                )}

                {discoveryLocationBlocked && (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                    <div className="glass-nav w-full rounded-[28px] border border-white/55 bg-white/24 px-6 py-6 shadow-[0_16px_32px_rgba(33,71,201,0.12)]">
                      <p className="text-sm text-muted-foreground">{t("Enable location to discover people nearby.")}</p>
                      <button
                        onClick={openLocationSettings}
                        className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[rgba(33,71,201,0.92)] px-5 text-xs font-semibold text-white shadow-[0_10px_22px_rgba(33,71,201,0.24)]"
                      >
                        {t("Open Location Settings")}
                      </button>
                    </div>
                  </div>
                )}

                {showDiscoverEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                    <div className="glass-nav w-full rounded-[30px] border border-white/55 bg-white/24 px-6 py-7 shadow-[0_18px_40px_rgba(33,71,201,0.14)]">
                      <img
                        src={emptyChatImage}
                        alt=""
                        aria-hidden="true"
                        className="mx-auto mb-4 w-full max-w-[320px] object-contain opacity-95"
                        loading="lazy"
                      />
                      <p className="text-base font-semibold text-[#4F5677]">All caught up!</p>
                      <div className="mt-4 flex flex-col gap-2">
                        {canExpandSearch && (
                          <button
                            className="inline-flex h-11 items-center justify-center rounded-full bg-[rgba(33,71,201,0.92)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(33,71,201,0.24)]"
                            onClick={handleExpandSearch}
                          >
                            {`Expand Search +${DISCOVERY_EXPAND_STEP_KM}km`}
                          </button>
                        )}
                        {passedDiscoveryIds.size > 0 && (
                          <button
                            className="inline-flex h-11 items-center justify-center rounded-full bg-white/75 px-5 text-sm font-semibold text-[#4F5677] shadow-[0_8px_20px_rgba(33,71,201,0.12)]"
                            onClick={resurfacePassedProfiles}
                          >
                            Resurface Skipped Profiles
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {currentDiscovery && (
                  <>
                    <motion.div
                      className="pointer-events-none absolute right-2 top-2 z-[28] flex h-14 w-14 items-center justify-center rounded-full bg-[#2147C9] shadow-[0_10px_24px_rgba(33,71,201,0.30)]"
                      style={{ opacity: waveIndicatorOpacity, scale: waveIndicatorScale, rotate: 15 }}
                    >
                      <img
                        src={waveHandCta}
                        alt=""
                        aria-hidden="true"
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 select-none object-contain"
                        draggable={false}
                      />
                    </motion.div>
                    <motion.div
                      className="pointer-events-none absolute bottom-[-30px] left-1/2 z-[28] flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] shadow-[0_10px_24px_rgba(33,71,201,0.18)]"
                      style={{ opacity: passIndicatorOpacity, scale: passIndicatorScale }}
                    >
                      <X size={22} strokeWidth={1.9} className="text-[#4F5677]" />
                    </motion.div>
                  </>
                )}

                {currentDiscovery && (() => {
                  const p = currentDiscovery;
                  const normalizeSpeciesKey = (raw: string) => {
                    const token = raw.trim().toLowerCase();
                    if (!token || token === "none") return "";
                    if (token.endsWith("ies") && token.length > 3) return `${token.slice(0, -3)}y`;
                    if (token.endsWith("s") && !token.endsWith("ss") && token.length > 2) return token.slice(0, -1);
                    return token;
                  };
                  const toDisplaySpecies = (normalized: string) =>
                    normalized
                      .split(/[\s_-]+/)
                      .filter(Boolean)
                      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                      .join(" ");
                  const availabilityPills: string[] = Array.isArray(p?.availability_status)
                    ? p.availability_status
                        .map((value) => normalizeAvailabilityLabel(String(value || "").trim()))
                        .filter(Boolean)
                    : [];
                  const speciesMap = new Map<string, string>();
                  for (const raw of (Array.isArray(p?.pets) ? p.pets.map((pet: { species?: string | null }) => String(pet.species || "").trim()) : [])
                    .concat(Array.isArray(p?.pet_species) ? p.pet_species.map((value) => String(value || "").trim()) : [])
                    .concat(Array.isArray(p?.pet_experience) ? p.pet_experience.map((value) => String(value || "").trim()) : [])) {
                    const key = normalizeSpeciesKey(raw);
                    if (!key || speciesMap.has(key)) continue;
                    speciesMap.set(key, toDisplaySpecies(key));
                  }
                  const speciesSummary = Array.from(speciesMap.values()).join(" • ");
                  const album = getDiscoveryAlbum(p);
                  const cover = album[0] || profilePlaceholder;

                  return (
                    <motion.div
                      key={p.id}
                      drag="y"
                      dragConstraints={{ top: 0, bottom: 0 }}
                      dragElastic={0.2}
                      dragMomentum={false}
                      style={{ y: dragY, rotate: dragRotate, scale: dragScale }}
                      className="absolute inset-0 z-20 rounded-[28px] overflow-visible bg-white shadow-[0_26px_56px_rgba(33,71,201,0.16)]"
                      onDragEnd={(_, info) => {
                        if (info.offset.y <= -85) {
                          void (async () => {
                            const ok = await bumpDiscoverySeen();
                            if (!ok) {
                              if (!isGoldTier) {
                                toast.info(discoverExhaustedCopy);
                              }
                              return;
                            }
                            const result = await sendDiscoveryWave(p.id, { showToast: false });
                            if (result.status === "sent" || result.status === "duplicate") {
                              commitDiscoverySwipe("up", p.id, "wave");
                              if (result.status === "sent" && !result.mutual) {
                                void enqueueChatNotification({
                                  userId: p.id,
                                  kind: "wave",
                                  title: "New wave",
                                  body: "Someone just waved at you 👋",
                                  href: "/chats?tab=discover",
                                  data: { from_user_id: profile?.id, type: "wave" },
                                });
                              }
                              if (result.mutual) {
                                persistMatchedDiscoveryUser(p.id);
                                setHiddenDiscoveryIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(p.id);
                                  return next;
                                });
                                if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                                  navigator.vibrate(18);
                                }
                                window.setTimeout(() => {
                                  void (async () => {
                                    const roomId = await openMatchModalFor({
                                      userId: p.id,
                                      name: p.display_name || "Conversation",
                                      avatarUrl: p.avatar_url || null,
                                    });
                                    if (roomId && result.matchCreated) {
                                      const currentName = profile?.display_name || "Someone";
                                      const targetName = p.display_name || "Someone";
                                      void enqueueChatNotification({
                                        userId: p.id,
                                        kind: "match",
                                        title: `You're now friends with ${currentName}!`,
                                        body: "It's a pawfect match!",
                                        href: `/chat-dialogue?room=${roomId}&with=${profile?.id || ""}`,
                                        data: { room_id: roomId, from_user_id: profile?.id, type: "match" },
                                      });
                                      if (profile?.id) {
                                        void enqueueChatNotification({
                                          userId: profile.id,
                                          kind: "match",
                                          title: `You're now friends with ${targetName}!`,
                                          body: "It's a pawfect match!",
                                          href: `/chat-dialogue?room=${roomId}&with=${p.id}`,
                                          data: { room_id: roomId, from_user_id: p.id, type: "match" },
                                        });
                                      }
                                    }
                                  })();
                                }, 180);
                              }
                              return;
                            }
                            void animate(dragY, 0, {
                              type: "spring",
                              stiffness: 240,
                              damping: 24,
                            });
                            toast.error("Failed to send wave");
                          })();
                          return;
                        }
                        if (info.offset.y >= 110) {
                          commitDiscoverySwipe("down", p.id, "pass");
                          return;
                        }
                        void animate(dragY, 0, {
                          type: "spring",
                          stiffness: 240,
                          damping: 24,
                        });
                      }}
                      whileDrag={{ scale: 0.95 }}
                      onClick={() => {
                        if (Math.abs(dragY.get()) > 8) return;
                        if (discoverImageInteractingRef.current) return;
                        void handleProfileTap(p.id, p.display_name || "User", p.avatar_url || null);
                      }}
                    >
                      {showDiscoveryQuotaLock && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
                          <div className="w-full rounded-[26px] border border-white/35 bg-white/20 px-5 py-4 text-center shadow-[0_14px_40px_rgba(7,24,108,0.2)] backdrop-blur-[18px]">
                            <p className="text-sm font-semibold text-white">
                              {discoverExhaustedCopy}
                            </p>
                            <button
                              type="button"
                              onClick={() => setIsPremiumOpen(true)}
                              className="mt-2 inline-flex h-9 items-center justify-center rounded-full bg-[rgba(33,71,201,0.95)] px-4 text-xs font-semibold text-white"
                            >
                              {t("See plans")}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="h-full w-full overflow-hidden rounded-[28px] [clip-path:inset(0_round_28px)]">
                        {album.length > 0 ? (
                          <>
                          <div
                            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                            onPointerDown={() => {
                              discoverImageInteractingRef.current = false;
                            }}
                            onPointerMove={() => {
                              discoverImageInteractingRef.current = true;
                            }}
                            onPointerUp={() => {
                              window.setTimeout(() => {
                                discoverImageInteractingRef.current = false;
                              }, 100);
                            }}
                            onPointerCancel={() => {
                              discoverImageInteractingRef.current = false;
                            }}
                            onScroll={(event) => {
                              const node = event.currentTarget;
                              if (!node.clientWidth) return;
                              const idx = Math.round(node.scrollLeft / node.clientWidth);
                              setDiscoverImageIndex(Math.max(0, Math.min(album.length - 1, idx)));
                            }}
                          >
                            {album.map((src, index) => (
                              <div key={`${p.id}-album-${index}`} className="h-full w-full shrink-0 snap-start">
                                <img
                                  src={src}
                                  alt={`${p.display_name || "User"} ${index + 1}`}
                                  className="h-full w-full object-cover object-center"
                                  style={{ objectPosition: "center center" }}
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                          {album.length > 1 && (
                            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-center justify-center gap-1.5">
                              {album.map((_, idx) => (
                                <span
                                  key={`${p.id}-img-dot-${idx}`}
                                  className={cn(
                                    "h-1.5 rounded-full transition-all",
                                    idx === discoverImageIndex ? "w-4 bg-[#7D86A6]" : "w-1.5 bg-[#B8BED2]/85"
                                  )}
                                />
                              ))}
                            </div>
                          )}
                        </>
                        ) : (
                          <img
                            src={cover}
                            alt={p.display_name || ""}
                            className="w-full h-full object-cover object-center"
                            style={{ objectPosition: "center center" }}
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = profilePlaceholder; }}
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(180deg,rgba(9,21,95,0)_0%,rgba(9,21,95,0.82)_100%)] pointer-events-none" />
                        <div className="absolute top-4 left-4">
                          <ProfileBadges
                            isVerified={p.is_verified === true}
                            hasCar={!!p.has_car}
                            size="sm"
                          />
                        </div>
                        <div className="absolute inset-x-4 bottom-5 pointer-events-none">
                          <div className="relative overflow-hidden rounded-[28px] border border-[rgba(255,255,255,0.38)] backdrop-blur-[22px] shadow-[0_14px_48px_rgba(0,0,0,0.16)]">
                          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0.48)_22%,rgba(33,69,207,0.48)_38%,rgba(33,69,207,0.42)_100%)]" />
                          {availabilityPills.length > 0 && (
                            <div className="absolute inset-x-0 top-0 z-10 flex h-[40px] items-center rounded-t-[27px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.58)_0%,rgba(255,255,255,0.48)_100%)] px-4">
                              <span className="block min-w-0 truncate text-[12px] font-semibold leading-[1] text-[#1F1F1F]">
                                {availabilityPills.join(" • ")}
                              </span>
                            </div>
                          )}
                          <div className={cn("relative z-10 flex items-end gap-3 px-4 pb-3", availabilityPills.length > 0 ? "pt-[46px]" : "pt-3")}>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1.5 flex items-center gap-2">
                                <span className="truncate text-[25px] font-[700] leading-tight text-white">{p.display_name}</span>
                              </div>
                              {p.location_name && (
                                <div className="flex items-center gap-1.5 mb-2 py-[1px]">
                                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-white/90" strokeWidth={1.9} />
                                  <span className="truncate text-[12px] font-medium leading-[1.2] text-white/90">{p.location_name}</span>
                                </div>
                              )}
                              {speciesSummary && (
                                <div className="mt-0.5 flex items-center gap-1.5 py-0">
                                  <PawPrint className="h-3.5 w-3.5 flex-shrink-0 text-white/90" strokeWidth={1.9} />
                                  <span className="truncate text-[12px] font-medium leading-[1.1] text-white/90">{speciesSummary}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(33,71,201,0.92)] text-white shadow-[0_10px_24px_rgba(33,71,201,0.35)]">
                              <ArrowUpRight className="h-5 w-5" strokeWidth={2} />
                            </div>
                          </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Action bar: Star | Wave | Skip */}
          <div className="px-4 mt-6 pb-[calc(8px+env(safe-area-inset-bottom,0px))] flex-shrink-0">
            {showDiscoverEmpty ? (
              <div />
            ) : (
              <div className="mx-auto flex w-fit items-center gap-4 rounded-full border border-white/55 bg-[rgba(255,255,255,0.72)] px-4 py-3 shadow-[0_16px_34px_rgba(33,71,201,0.12)] backdrop-blur-[20px]">
            {/* Star — brandGold */}
            <button
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full bg-white/88 text-brandBlue shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_8px_18px_rgba(33,71,201,0.08)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
                showDiscoveryQuotaLock && "cursor-not-allowed opacity-45"
              )}
              aria-label="Star"
              disabled={showDiscoveryQuotaLock}
              onClick={async (e) => {
                e.stopPropagation();
                const p = currentDiscovery;
                if (!p) return;
                if (!profile?.id) return;
                if (blockedUserIds.has(p.id)) return;
                setConfirmStarTarget(p);
              }}
            >
              <Star size={22} strokeWidth={1.9} />
            </button>

            {/* Wave — primary (larger center) */}
            <button
              className={cn(
                "group flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(33,71,201,0.96)] shadow-[0_12px_24px_rgba(33,71,201,0.26)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
                showDiscoveryQuotaLock && "cursor-not-allowed opacity-45"
              )}
              aria-label="Wave"
              disabled={showDiscoveryQuotaLock}
              onClick={async (e) => {
                e.stopPropagation();
                const p = currentDiscovery;
                if (!p) return;
                if (blockedUserIds.has(p.id)) return;
                const ok = await bumpDiscoverySeen();
                if (!ok) return;
                const result = await sendDiscoveryWave(p.id, { showToast: true });
                if (result.status === "sent" && !result.mutual) {
                  void enqueueChatNotification({
                    userId: p.id,
                    kind: "wave",
                    title: "New wave",
                    body: "Someone just waved at you 👋",
                    href: "/chats?tab=discover",
                    data: { from_user_id: profile?.id, type: "wave" },
                  });
                }
                if (result.status === "sent" || result.status === "duplicate") {
                  commitDiscoverySwipe("up", p.id, "wave");
                  if (result.mutual) {
                    persistMatchedDiscoveryUser(p.id);
                    setHiddenDiscoveryIds((prev) => {
                      const next = new Set(prev);
                      next.add(p.id);
                      return next;
                    });
                    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                      navigator.vibrate(18);
                    }
                    window.setTimeout(() => {
                      void (async () => {
                        const roomId = await openMatchModalFor({
                          userId: p.id,
                          name: p.display_name || "Conversation",
                          avatarUrl: p.avatar_url || null,
                        });
                        if (roomId && result.matchCreated) {
                          const currentName = profile?.display_name || "Someone";
                          const targetName = p.display_name || "Someone";
                          void enqueueChatNotification({
                            userId: p.id,
                            kind: "match",
                            title: `You're now friends with ${currentName}!`,
                            body: "It's a pawfect match!",
                            href: `/chat-dialogue?room=${roomId}&with=${profile?.id || ""}`,
                            data: { room_id: roomId, from_user_id: profile?.id, type: "match" },
                          });
                          if (profile?.id) {
                            void enqueueChatNotification({
                              userId: profile.id,
                              kind: "match",
                              title: `You're now friends with ${targetName}!`,
                              body: "It's a pawfect match!",
                              href: `/chat-dialogue?room=${roomId}&with=${p.id}`,
                              data: { room_id: roomId, from_user_id: p.id, type: "match" },
                            });
                          }
                        }
                      })();
                    }, 180);
                  }
                }
              }}
            >
              <WaveHandIcon size={40} className="drop-shadow-[0_8px_18px_rgba(7,24,108,0.22)]" />
            </button>

            {/* Skip — muted */}
            <button
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/88 text-brandBlue shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_8px_18px_rgba(33,71,201,0.08)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              aria-label="Skip"
              onClick={(e) => {
                e.stopPropagation();
                const p = currentDiscovery;
                if (!p) return;
                commitDiscoverySwipe("down", p.id, "pass");
              }}
            >
              <X size={22} strokeWidth={1.9} />
            </button>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {matchModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1800] overflow-hidden"
            >
              <img
                src={matchPageImage}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <button
                type="button"
                className="absolute right-4 top-4 z-20 rounded-full bg-white/55 p-2 text-[#3653BE] shadow-[0_6px_20px_rgba(21,48,153,0.18)] backdrop-blur-md"
                onClick={closeMatchModal}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative z-10 flex h-full flex-col items-center px-6 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+12px)] pt-16">
                <div className="absolute left-1/2 top-[calc(42%+clamp(38px,5vw,48px))] z-20 -translate-x-1/2 -translate-y-1/2">
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1, transition: { delay: 0.14, duration: 0.24 } }}
                    className="relative h-[clamp(96px,14vw,124px)] w-[clamp(172px,25vw,216px)]"
                  >
                    <div className="absolute left-0 top-1/2 h-[clamp(96px,14vw,124px)] w-[clamp(96px,14vw,124px)] -translate-y-1/2 overflow-hidden rounded-full bg-transparent">
                      <img
                        src={profile?.avatar_url || profilePlaceholder}
                        alt={profile?.display_name || "You"}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="absolute right-0 top-1/2 h-[clamp(96px,14vw,124px)] w-[clamp(96px,14vw,124px)] -translate-y-1/2 overflow-hidden rounded-full bg-transparent">
                      <img
                        src={matchModal.avatarUrl || profilePlaceholder}
                        alt={matchModal.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </motion.div>
                </div>

                <motion.form
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1, transition: { delay: 0.2, duration: 0.24 } }}
                  className="absolute bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+12px)] left-4 right-4 z-20"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMatchQuickHello();
                  }}
                >
                  <div className="flex items-center gap-2 rounded-[20px] border border-white/55 bg-white/82 p-2 shadow-[0_14px_36px_rgba(21,48,153,0.16)] backdrop-blur-[14px]">
                    <input
                      value={matchQuickHello}
                      onChange={(event) => setMatchQuickHello(event.target.value)}
                      placeholder="Drop a friendly hello"
                      className="h-11 flex-1 rounded-[14px] bg-white/70 px-4 text-sm text-[#23326B] outline-none placeholder:text-[#90A0C1]"
                      maxLength={500}
                    />
                    <button
                      type="submit"
                      disabled={openingMatchChat || !matchQuickHello.trim()}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(33,71,201,0.95)] text-white shadow-[0_10px_22px_rgba(33,71,201,0.28)] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Send"
                    >
                      {openingMatchChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── CHATS view ───────────────────────────────────────────────────────── */}
      {!discoverChatAgeBlocked && topTab === "chats" && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Inline room chat (if active) */}
          {activeRoomId && (
            <section className="px-5 pb-3">
              <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="text-sm font-semibold truncate">{activeRoomName || "Chat"}</div>
                  <button className="text-xs underline" onClick={() => setActiveRoomId(null)}>Close</button>
                </div>
                <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-2">
                  {activeRoomMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : activeRoomMessages.map((m) => {
                    const mine = m.sender_id === profile?.id;
                    const share = parseChatShareMessage(m.content);
                    return (
                      <div key={m.id} className={cn("max-w-[85%]", mine ? "ml-auto" : "")}>
                        {share ? (
                          <SharedContentCard share={share} mine={mine} compact />
                        ) : (
                          <div className={cn("rounded-lg px-3 py-2 text-sm", mine ? "bg-brandBlue text-white" : "bg-muted text-brandText")}>
                            {m.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-3 py-3 border-t border-border flex items-center gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    style={{ fontSize: "16px" }}
                    className="flex-1 h-10 rounded-[10px] bg-[rgba(255,255,255,0.72)] shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)] border-0 outline-none px-3 text-sm text-[var(--text-primary,#424965)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendInlineMessage();
                      }
                    }}
                  />
                  <NeuButton className="h-10 px-3" onClick={() => void sendInlineMessage()} disabled={chatSending || !chatInput.trim()}>
                    {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Send</span>}
                  </NeuButton>
                </div>
              </div>
            </section>
          )}

          {/* Search bar */}
          {isSearchOpen && (
            <div className="px-5 pt-1 pb-2">
              <div className="relative w-full max-w-full min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Search")}
                  autoFocus
                  style={{ fontSize: "16px" }}
                  className="w-full max-w-full min-w-0 pl-10 pr-10 h-10 rounded-full bg-[rgba(255,255,255,0.72)] shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)] border border-border outline-none text-sm text-[var(--text-primary,#424965)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Friends | Groups tabs + action row */}
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
            <div className="flex gap-2">
              {mainTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMainTab(tab.id)}
                  className={cn(
                    "px-3.5 py-2 text-xs font-medium transition-colors relative text-center",
                    mainTab === tab.id
                      ? "text-brandBlue"
                      : "text-muted-foreground hover:text-brandText"
                  )}
                >
                  {t(tab.label)}
                  {mainTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-brandBlue rounded-t" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              >
                <Search className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
              </button>
              {mainTab === "groups" && (
                <>
                  <button
                    onClick={() => setIsJoinWithCodeOpen(true)}
                    className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                    aria-label="Join with code"
                  >
                    <Hash className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={handleCreateGroup}
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
                      isVerified
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    aria-label="Create Group"
                  >
                    <Users className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Chat list */}
          <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y pb-[calc(64px+env(safe-area-inset-bottom)+20px)]">

            {/* Chats View (Friends) */}
            {mainTab === "friends" && (
              <>
                {/* Chat List */}
                <div className="px-5">
                  <div className="space-y-0.5">
                    {visibleConversationChats.length === 0 && avatarOnlyMatchedChats.length === 0 && avatarOnlyMatchOnlyAvatars.length === 0 ? (
                      <div className="mx-auto flex w-full max-w-md flex-col items-center py-4">
                        <img
                          src={emptyChatImage}
                          alt="No chats yet"
                          className="w-full max-w-[360px] object-contain"
                        />
                        <p className="mt-2 px-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                          Get new conversations going by joining Social discussion or add more into to make your profile pop and get matched easier.
                        </p>
                      </div>
                    ) : (
                      <>
                        {(avatarOnlyMatchedChats.length > 0 || avatarOnlyMatchOnlyAvatars.length > 0) && (
                          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible px-2 pb-2 pt-2">
                            {avatarOnlyMatchedChats.slice(0, 10).map((chat) => (
                              <button
                                key={`avatar-only-${chat.id}`}
                                type="button"
                                onClick={() => handleChatClick(chat)}
                                className="relative shrink-0 overflow-visible rounded-full p-0.5"
                                aria-label={chat.name}
                              >
                                <UserAvatar
                                  avatarUrl={chat.avatarUrl}
                                  name={chat.name}
                                  isVerified={chat.isVerified}
                                  hasCar={chat.hasCar}
                                  size="md"
                                  showBadges={true}
                                />
                              </button>
                            ))}
                            {avatarOnlyMatchOnlyAvatars.slice(0, 10).map((entry) => (
                              <button
                                key={`avatar-only-match-${entry.userId}`}
                                type="button"
                                onClick={() => handleMatchAvatarClick(entry)}
                                className="relative shrink-0 overflow-visible rounded-full p-0.5"
                                aria-label={entry.name}
                              >
                                <UserAvatar
                                  avatarUrl={entry.avatarUrl}
                                  name={entry.name}
                                  isVerified={entry.isVerified}
                                  hasCar={entry.hasCar}
                                  size="md"
                                  showBadges={true}
                                />
                              </button>
                            ))}
                          </div>
                        )}
                        {priorityStarChats.length > 0 && (
                          <div className="px-1 pb-1 pt-1">
                            <div className="space-y-0.5">
                              {priorityStarChats.map((chat, index) => (
                                <div key={`priority-${chat.id}`} className="relative overflow-visible rounded-xl">
                                  <motion.div
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.04 }}
                                    onClick={() => handleChatClick(chat)}
                                    className="relative flex items-center gap-3 p-3 bg-card shadow-[0_0_0_1px_rgba(246,198,72,0.38),0_8px_20px_rgba(246,198,72,0.22)] cursor-pointer hover:bg-accent/5 transition-colors"
                                  >
                                    <div
                                      className="relative cursor-pointer rounded-full"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!chat.peerUserId) return;
                                        handleProfileTap(chat.peerUserId, chat.name, chat.avatarUrl);
                                      }}
                                    >
                                      <UserAvatar
                                        avatarUrl={chat.avatarUrl}
                                        name={chat.name}
                                        isVerified={chat.isVerified}
                                        hasCar={chat.hasCar}
                                        size="lg"
                                        showBadges={true}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_44px] gap-x-2 items-start">
                                      <div className="min-w-0">
                                        <h4 className="m-0 truncate font-semibold leading-[1.2]">{chat.name}</h4>
                                        <p className="m-0 mt-0.5 truncate text-sm leading-[1.2] text-[#A27A2A]">
                                          {getChatPreview(chat)}
                                        </p>
                                        {chat.socialAvailability ? (
                                          <p className="m-0 mt-2 truncate text-xs font-semibold leading-[1.2] text-[#6B7280]">
                                            {chat.socialAvailability}
                                          </p>
                                        ) : (
                                          <span className="mt-1.5 block h-[14px]" />
                                        )}
                                      </div>
                                      <div className="col-start-2 row-span-3 flex flex-col items-end gap-1.5 pt-0.5">
                                        <span className="text-xs text-[#9AA0B5]">{chat.time}</span>
                                        {chat.unread > 0 ? (
                                          <span className="w-5 h-5 rounded-full bg-muted-foreground/70 text-white text-xs flex items-center justify-center font-medium">
                                            {chat.unread > 99 ? "9+" : chat.unread}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  </motion.div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {regularConversationChats.slice(0, Math.max(0, chatVisibleCount - priorityStarChats.length)).map((chat, index) => (
                        <div key={chat.id} className="relative overflow-visible rounded-xl">
                          <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => handleChatClick(chat)}
                            drag="x"
                            dragConstraints={{ left: -80, right: 0 }}
                            dragElastic={0.1}
                            onDrag={(_, info) => {
                              setSwipeDeleteId(info.offset.x < -30 ? chat.id : null);
                            }}
                            onDragEnd={(_, info) => {
                              setSwipeDeleteId(null);
                              if (info.offset.x < -60) {
                                if (chat.hasTransaction) {
                                  toast.error(t("Cannot remove conversations with active transactions"));
                                } else {
                                  setDeleteConfirmId(chat.id);
                                }
                              }
                            }}
                            className="relative flex items-center gap-3 p-3 bg-card shadow-card cursor-pointer hover:bg-accent/5 transition-colors"
                          >
                            <div
                              className="relative cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!chat.peerUserId) return;
                                handleProfileTap(chat.peerUserId, chat.name, chat.avatarUrl);
                              }}
                            >
                              <UserAvatar
                                avatarUrl={chat.avatarUrl}
                                name={chat.name}
                                isVerified={chat.isVerified}
                                hasCar={chat.hasCar}
                                size="lg"
                                showBadges={true}
                              />
                              {/* Online indicator */}
                              {(chat.isOnline || onlineUsers.has(chat.id)) && (
                                <div className="absolute top-0 left-0 w-3 h-3 rounded-full bg-[#A6D539] ring-2 ring-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_44px] gap-x-2 items-start">
                              <div className="min-w-0">
                                <h4 className="m-0 truncate font-semibold leading-[1.2]">{chat.name}</h4>
                                {getChatPreview(chat) ? (
                                  <p className="m-0 mt-0.5 truncate text-sm leading-[1.2] text-muted-foreground">
                                    {getChatPreview(chat)}
                                  </p>
                                ) : null}
                                {chat.socialAvailability ? (
                                  <p className="m-0 mt-2 truncate text-xs font-semibold leading-[1.2] text-[#6B7280]">
                                    {chat.socialAvailability}
                                  </p>
                                ) : (
                                  <span className="mt-1.5 block h-[14px]" />
                                )}
                              </div>
                              <div className="col-start-2 row-span-3 flex flex-col items-end gap-1.5 pt-0.5">
                                <span className="text-xs text-[#9AA0B5]">{chat.time}</span>
                                {chat.unread > 0 ? (
                                  <span className="w-5 h-5 rounded-full bg-muted-foreground/70 text-white text-xs flex items-center justify-center font-medium">
                                    {chat.unread > 99 ? "9+" : chat.unread}
                                  </span>
                                ) : chat.lastMessageFromMe ? (
                                  <span
                                    className={cn(
                                      "text-[12px] font-semibold leading-none",
                                      chat.lastMessageReadByOther ? "text-[#2145CF]" : "text-[#A3A8BE]"
                                    )}
                                    aria-label={chat.lastMessageReadByOther ? "read" : "sent"}
                                  >
                                    ✓
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Outlined red bin — only visible during swipe */}
                              {swipeDeleteId === chat.id && (
                                <div className="w-8 h-8 rounded-full border-2 border-red-500 flex items-center justify-center">
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </div>
                        ))}
                      </>
                    )}
                  </div>
                  {regularConversationChats.length > Math.max(0, chatVisibleCount - priorityStarChats.length) && (
                    <div className="flex justify-center pt-2">
                      <button
                        className="text-sm text-primary hover:underline"
                        onClick={() => setChatVisibleCount((c) => c + 10)}
                      >
                        {t("Load more")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Service View */}
            {mainTab === "service" && (
              <div className="px-5">
                <div className="space-y-0.5">
                  {filteredServiceChats.length === 0 ? (
                    <div className="mx-auto flex w-full max-w-md flex-col items-center py-4">
                      <img
                        src={serviceImage}
                        alt="Service"
                        className="w-full max-w-[300px] object-contain"
                      />
                      <p className="mt-2 px-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                        Need a hand? Explore local pros in the <span className="font-semibold text-[#1F1F1F]">Service</span>
                      </p>
                    </div>
                  ) : (
                    filteredServiceChats.slice(0, chatVisibleCount).map((chat, index) => (
                      <div key={chat.id} className="relative overflow-visible rounded-xl">
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          onClick={() => handleChatClick(chat)}
                          className="relative flex items-center gap-3 p-3 bg-card shadow-card cursor-pointer hover:bg-accent/5 transition-colors"
                        >
                          <div
                            className="relative cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!chat.peerUserId) return;
                              handleProfileTap(chat.peerUserId, chat.name, chat.avatarUrl);
                            }}
                          >
                            <UserAvatar
                              avatarUrl={chat.avatarUrl}
                              name={chat.name}
                              isVerified={chat.isVerified}
                              hasCar={chat.hasCar}
                              size="lg"
                              showBadges={true}
                            />
                          </div>
                            <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_44px] gap-x-2 items-start">
                              <div className="min-w-0">
                                <h4 className="m-0 truncate font-semibold leading-[1.2]">{chat.name}</h4>
                                <p className="m-0 mt-0.5 truncate text-sm leading-[1.2] text-muted-foreground">
                                  {chat.serviceType || getChatPreview(chat) || "Service chat"}
                                </p>
                                <p className="m-0 mt-2 truncate text-xs font-semibold leading-[1.2] text-[#6B7280]">
                                  {getServiceStatusLabel(chat)}
                                  {chat.serviceDateLabel ? ` · ${chat.serviceDateLabel}` : ""}
                                </p>
                              </div>
                            <div className="col-start-2 row-span-3 flex flex-col items-end gap-1.5 pt-0.5">
                              <span className="text-xs text-[#9AA0B5]">{chat.time}</span>
                              {chat.unread > 0 ? (
                                <span className="w-5 h-5 rounded-full bg-muted-foreground/70 text-white text-xs flex items-center justify-center font-medium">
                                  {chat.unread > 99 ? "9+" : chat.unread}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Groups View */}
            {mainTab === "groups" && (
              <div className="pt-2">
                {/* Sub-tab toggle */}
                <div className="flex px-5 gap-2 mb-3">
                  <button
                    onClick={() => setGroupSubTab("my")}
                    className="neu-chip text-[13px] px-4 py-1.5 font-medium"
                    data-active={groupSubTab === "my"}
                  >
                    My Groups
                  </button>
                  <button
                    onClick={() => setGroupSubTab("explore")}
                    className="neu-chip text-[13px] px-4 py-1.5 font-medium"
                    data-active={groupSubTab === "explore"}
                  >
                    Explore
                  </button>
                </div>

                {/* Explore tab */}
                {groupSubTab === "explore" && (
                  <div className="px-5 space-y-2">
                    {exploreLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" strokeWidth={1.75} />
                      </div>
                    ) : exploreGroups.length === 0 ? (
                      <div className="mx-auto flex w-full max-w-md flex-col items-center py-4">
                        <img
                          src={emptyChatImage}
                          alt="No groups yet"
                          className="w-full max-w-[320px] object-contain"
                        />
                        <p className="mt-2 px-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                          No public groups nearby yet. Be the first to create one!
                        </p>
                      </div>
                    ) : (
                      exploreGroups.map((group, index) => (
                        <motion.div
                          key={group.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.2 }}
                          onClick={() => navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}`)}
                          className="flex items-center gap-3 p-3 bg-card shadow-card rounded-xl cursor-pointer hover:bg-accent/5 transition-colors"
                        >
                          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-card border border-border/30 flex items-center justify-center">
                            {group.avatar_url ? (
                              <img src={group.avatar_url} alt={group.name} className="w-full h-full object-cover" />
                            ) : (
                              <Users className="w-6 h-6 text-primary" strokeWidth={1.75} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[15px] truncate text-brandText">{group.name}</p>
                            {group.location_label && (
                              <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                                <MapPin className="inline w-3 h-3 mr-0.5" strokeWidth={1.75} />{group.location_label}
                              </p>
                            )}
                            {group.pet_focus && group.pet_focus.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {group.pet_focus.slice(0, 3).map((tag) => (
                                  <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/60 text-accent-foreground font-medium">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {group.last_message_at
                                ? (() => {
                                    const ms = Date.now() - new Date(group.last_message_at).getTime();
                                    if (ms < 3_600_000) return `Active ${Math.floor(ms / 60_000)}m ago`;
                                    if (ms < 86_400_000) return "Active today";
                                    if (ms < 604_800_000) return "Active this week";
                                    return "Not recently active";
                                  })()
                                : "No messages yet"}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                        </motion.div>
                      ))
                    )}
                  </div>
                )}

                {/* My Groups tab */}
                {groupSubTab === "my" && (
                <div className="px-5 space-y-2">
                  {filteredGroups.length === 0 ? (
                    <div className="mx-auto flex w-full max-w-md flex-col items-center py-4">
                      <img
                        src={emptyChatImage}
                        alt="No groups yet"
                        className="w-full max-w-[360px] object-contain"
                      />
                      <p className="mt-2 px-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                        Better in a pack! Get verified to start a group chat and coordinate your next local meetup.
                      </p>
                      <p className="mt-1 text-center text-sm text-muted-foreground">
                        {isVerified ? t("chats.create_group_prompt") : t("chats.verify_to_create")}
                      </p>
                    </div>
                  ) : (
                    filteredGroups.slice(0, groupVisibleCount).map((group, index) => (
                      <div key={group.id} className="relative overflow-hidden rounded-xl">
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          drag="x"
                          dragConstraints={{ left: -80, right: 0 }}
                          dragElastic={0.1}
                          onDrag={(_, info) => {
                            setSwipeDeleteGroupId(info.offset.x < -30 ? group.id : null);
                          }}
                          onDragEnd={(_, info) => {
                            setSwipeDeleteGroupId(null);
                            if (info.offset.x < -60) {
                              setDeleteGroupConfirmId(group.id);
                            }
                          }}
                          onClick={() => handleGroupClick(group)}
                          className="flex items-center gap-3 p-3 bg-card shadow-card cursor-pointer hover:bg-accent/5 transition-colors"
                        >
                          {/* Group Avatar */}
                          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-card border border-border/30 flex items-center justify-center">
                            {group.avatarUrl ? (
                              <img src={group.avatarUrl || profilePlaceholder} alt={group.name} className="w-full h-full object-cover" />
                            ) : (
                              <Users className="w-6 h-6 text-primary" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_44px] gap-x-2 items-start">
                            <div className="min-w-0">
                              {/* Primary: group name */}
                              <h4 className="truncate font-semibold leading-[1.2]">{t(group.name)}</h4>
                              {/* Secondary: sender: preview */}
                              <p className="mt-0.5 truncate text-sm leading-[1.2] text-muted-foreground">
                                {isGroupMembershipHint(group.lastMessage)
                                  ? group.lastMessage || <span className="italic">No messages yet</span>
                                  : group.lastMessageSender
                                  ? <><span className="font-medium text-brandText/80">{group.lastMessageSender}:</span> {group.lastMessage}</>
                                  : group.lastMessage || <span className="italic">No messages yet</span>
                                }
                              </p>
                              {/* Bottom row: member count */}
                              <p className="mt-1 text-[11px] font-[500] text-[#6B7280]">
                                {group.invitePending ? "Invitation pending" : `${group.memberCount} members`}
                              </p>
                            </div>
                            <div className="col-start-2 row-span-3 flex flex-col items-end gap-1.5 pt-0.5">
                              <span className="text-xs text-[#9AA0B5]">{t(group.time)}</span>
                              {group.unread > 0 ? (
                                <span className="w-5 h-5 rounded-full bg-brandBlue text-white text-xs flex items-center justify-center font-medium">
                                  {group.unread > 9 ? "9+" : group.unread}
                                </span>
                              ) : group.invitePending ? (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!profile?.id) return;
                                    try {
                                      let data: unknown = null;
                                      let error: { message?: string } | null = null;
                                      if (group.inviteId) {
                                        const byId = await (supabase.rpc as (
                                          fn: string,
                                          params?: Record<string, unknown>
                                        ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
                                          "accept_group_chat_invite_by_id",
                                          {
                                          p_invite_id: group.inviteId,
                                          }
                                        );
                                        data = byId.data;
                                        error = byId.error;
                                      } else {
                                        const byChat = await (supabase.rpc as (
                                          fn: string,
                                          params?: Record<string, unknown>
                                        ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
                                          "accept_group_chat_invite",
                                          {
                                          p_chat_id: group.id,
                                          }
                                        );
                                        data = byChat.data;
                                        error = byChat.error;
                                      }
                                      if (error) throw error;
                                      const joined = Array.isArray(data)
                                        ? ((data[0] || {}) as { joined?: unknown }).joined === true
                                        : false;
                                      if (!joined) {
                                        toast.error("Invite is no longer available.");
                                        return;
                                      }
                                      toast.success(`Joined ${group.name}`);
                                      await loadConversations();
                                      navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}`);
                                    } catch (err: unknown) {
                                      const msg =
                                        err && typeof err === "object" && "message" in err
                                          ? String((err as { message?: string }).message || "")
                                          : "";
                                      toast.error(msg ? `Unable to join group right now: ${msg}` : "Unable to join group right now.");
                                    }
                                  }}
                                  className="h-7 rounded-full border border-[#3653BE]/30 px-2 text-[11px] font-semibold text-[#3653BE] hover:bg-[#3653BE]/5"
                                  aria-label="Join group"
                                >
                                  Join
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isVerified) {
                                      setGroupVerifyGateOpen(true);
                                      return;
                                    }
                                    setGroupManageId(group.id);
                                  }}
                                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted"
                                  aria-label="Manage group"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Swipe trash indicator */}
                          {swipeDeleteGroupId === group.id && (
                            <div className="absolute right-3 w-8 h-8 rounded-full border-2 border-red-500 flex items-center justify-center">
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </div>
                          )}
                        </motion.div>
                      </div>
                    ))
                  )}
                  {filteredGroups.length > groupVisibleCount && (
                    <div className="flex justify-center pt-2">
                      <button
                        className="text-sm text-primary hover:underline"
                        onClick={() => setGroupVisibleCount((c) => c + 10)}
                      >
                        {t("Load more")}
                      </button>
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

          </div>

        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("Delete Conversation")}</DialogTitle>
            <DialogDescription>{t("Confirm deletion of this conversation.")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("This conversation will be permanently deleted. Are you sure?")}</p>
          <DialogFooter className="flex gap-2">
            <NeuButton variant="secondary" size="sm" onClick={() => setDeleteConfirmId(null)}>{t("Cancel")}</NeuButton>
            <NeuButton variant="destructive" size="sm" onClick={() => {
              const chat = chats.find((c) => c.id === deleteConfirmId);
              if (chat) handleRemoveChat(chat);
              setDeleteConfirmId(null);
            }}>{t("Delete")}</NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation */}
      <Dialog open={!!deleteGroupConfirmId} onOpenChange={() => setDeleteGroupConfirmId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Leave Group</DialogTitle>
            <DialogDescription>You will leave this group chat.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to leave this group? This cannot be undone.</p>
          <DialogFooter className="flex gap-2">
            <NeuButton variant="secondary" size="sm" onClick={() => setDeleteGroupConfirmId(null)}>Cancel</NeuButton>
            <NeuButton variant="destructive" size="sm" onClick={async () => {
              if (!profile?.id || !deleteGroupConfirmId) return;
              try {
                await supabase.from("chat_room_members").delete().eq("chat_id", deleteGroupConfirmId).eq("user_id", profile.id);
                setGroups((prev) => prev.filter((g) => g.id !== deleteGroupConfirmId));
                toast.success("You left the group.");
              } catch {
                toast.error("Unable to leave group right now.");
              }
              setDeleteGroupConfirmId(null);
            }}>Leave</NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Manage Modal — group image upload, members list with Remove, add members */}
      <Dialog open={!!groupManageId} onOpenChange={() => { setGroupManageId(null); setGroupAddSearch(""); }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manager Group</DialogTitle>
            <DialogDescription>Edit photo, members, and group settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Group Image — working upload */}
            <div className="flex items-center gap-3">
              {(() => {
                const grp = groups.find((g) => g.id === groupManageId);
                return grp?.avatarUrl ? (
                  <img src={grp.avatarUrl || profilePlaceholder} alt={grp.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                );
              })()}
              <div className="flex-1">
                <div className="text-sm font-semibold text-brandText">
                  {groups.find((g) => g.id === groupManageId)?.name || "Group"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {groups.find((g) => g.id === groupManageId)?.memberCount || 0} members
                </div>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !groupManageId || !profile?.id) return;
                    setGroupImageUploading(true);
                    try {
                      const { default: compress } = await import("browser-image-compression");
                      const compressed = await compress(file, { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true });
                      const ext = compressed.name.split(".").pop() || "jpg";
                      const path = `groups/${groupManageId}/${Date.now()}.${ext}`;
                      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: true });
                      if (uploadErr) throw uploadErr;
                      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
                      const url = pub.publicUrl;
                      // Update group avatar in local state
                      setGroups((prev) => prev.map((g) => g.id === groupManageId ? { ...g, avatarUrl: url } : g));
                      // Persist to DB if groups table exists
                      await supabase.from("chats").update({ avatar_url: url }).eq("id", groupManageId);
                      toast.success(t("Group image updated"));
                    } catch (err) {
                      console.error("Group image upload failed:", err);
                      toast.error(t("Failed to upload group image"));
                    } finally {
                      setGroupImageUploading(false);
                      e.target.value = "";
                    }
                  }}
                />
                <NeuButton size="sm" variant="secondary" className="text-xs pointer-events-none" disabled={groupImageUploading}>
                  {groupImageUploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Change Image
                </NeuButton>
              </label>
            </div>

            {/* Join Requests — approve or decline */}
            {groupJoinRequests.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-brandText/70 mb-2">
                  Join requests{" "}
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brandBlue text-white text-[10px] font-bold">
                    {groupJoinRequests.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupJoinRequests.map((req) => (
                    <div key={req.requestId} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <UserAvatar avatarUrl={req.avatarUrl ?? null} name={req.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                        <span className="text-sm text-brandText">{req.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            try {
                              await supabase
                                .from("group_join_requests")
                                .update({ status: "approved" })
                                .eq("id", req.requestId);
                              await supabase
                                .from("chat_participants")
                                .insert({ chat_id: groupManageId!, user_id: req.userId, role: "member" });
                              setGroupJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
                              setGroupMembers((prev) => [...prev, { id: req.userId, name: req.name, avatarUrl: req.avatarUrl }]);
                              setGroups((prev) => prev.map((g) => g.id === groupManageId ? { ...g, memberCount: g.memberCount + 1 } : g));
                              toast.success(`${req.name} approved`);
                            } catch {
                              toast.error("Couldn't approve request.");
                            }
                          }}
                          className="h-6 px-2 rounded-full bg-brandBlue/10 text-brandBlue text-[11px] font-semibold hover:bg-brandBlue/20 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await supabase
                                .from("group_join_requests")
                                .update({ status: "declined" })
                                .eq("id", req.requestId);
                              setGroupJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
                              toast.success(`${req.name} declined`);
                            } catch {
                              toast.error("Couldn't decline request.");
                            }
                          }}
                          className="h-6 px-2 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold hover:bg-muted/80 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members List — fetched from backend, with working Remove */}
            <div>
              <div className="text-xs font-semibold text-brandText/70 mb-2">Members</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {groupMembers.length > 0 ? groupMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <UserAvatar avatarUrl={m.avatarUrl} name={m.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                      <span className="text-sm text-brandText">{m.id === profile?.id ? `${m.name} (You)` : m.name}</span>
                    </div>
                    {m.id !== profile?.id && (
                      <button
                        onClick={async () => {
                          if (!profile?.is_verified) {
                            setGroupVerifyGateOpen(true);
                            return;
                          }
                          try {
                            await supabase.from("chat_room_members").delete().eq("chat_id", groupManageId!).eq("user_id", m.id);
                            setGroupMembers((prev) => prev.filter((x) => x.id !== m.id));
                            setGroups((prev) => prev.map((g) => g.id === groupManageId ? { ...g, memberCount: Math.max(0, g.memberCount - 1) } : g));
                            toast.success(`${m.name} removed`);
                          } catch {
                            toast.error(t("Failed to remove member"));
                          }
                        }}
                        className="text-[10px] font-medium text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )) : (
                  <div className="text-xs text-muted-foreground py-2">Loading members...</div>
                )}
                {groupPendingInvites.map((invitee) => (
                  <div key={`invite-${invitee.id}`} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 opacity-65">
                      <UserAvatar avatarUrl={invitee.avatarUrl} name={invitee.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                      <span className="text-sm text-brandText">{invitee.name}</span>
                    </div>
                    <span className="text-[10px] font-medium text-[#9AA0B5]">Invited</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Members — search from matched friends not yet in group */}
            {(() => {
              const currentMemberIds = new Set([
                ...groupMembers.map((m) => m.id),
                ...groupPendingInvites.map((m) => m.id),
              ]);
              const addableFriends = groupSelectableUsers.filter((u) => !currentMemberIds.has(u.id));
              const filtered = groupAddSearch.trim()
                ? addableFriends.filter((u) => u.name.toLowerCase().includes(groupAddSearch.toLowerCase()))
                : addableFriends;
              if (addableFriends.length === 0) return null;
              return (
                <div>
                  <div className="flex items-center mb-2">
                    <div className="text-xs font-semibold text-brandText/70">Add Members</div>
                  </div>
                  {addableFriends.length > 4 && (
                    <div className="form-field-rest relative flex items-center mb-2">
                      <input
                        value={groupAddSearch}
                        onChange={(e) => setGroupAddSearch(e.target.value)}
                        placeholder="Search friends…"
                        className="field-input-core text-sm h-9"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {filtered.slice(0, 20).map((u) => (
                      <div key={u.id} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <UserAvatar avatarUrl={u.avatarUrl || null} name={u.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                          <span className="text-sm text-brandText">{u.name}</span>
                        </div>
                        <NeuButton
                          size="sm"
                          variant="secondary"
                          className="h-7 w-7 p-0 flex items-center justify-center"
                          aria-label="Add member"
                          onClick={async () => {
                            if (!profile?.is_verified) {
                              setGroupVerifyGateOpen(true);
                              return;
                            }
                            if (!profile?.id || !groupManageId) return;
                            try {
                              const { error: memberErr } = await supabase
                                .from("group_chat_invites")
                                .upsert(
                                  {
                                    chat_id: groupManageId,
                                    chat_name: groups.find((g) => g.id === groupManageId)?.name || "Group",
                                    inviter_user_id: profile.id,
                                    invitee_user_id: u.id,
                                    status: "pending",
                                  },
                                  { onConflict: "chat_id,invitee_user_id", ignoreDuplicates: false }
                                );
                              if (memberErr) throw memberErr;
                              setGroupPendingInvites((prev) =>
                                prev.some((m) => m.id === u.id)
                                  ? prev
                                  : [...prev, { id: u.id, name: u.name, avatarUrl: u.avatarUrl || null }]
                              );
                              toast.success(`${u.name} invited`);
                            } catch {
                              toast.error("Couldn't invite member.");
                            }
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </NeuButton>
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">No friends found</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupVerifyGateOpen} onOpenChange={setGroupVerifyGateOpen}>
        <DialogContent className="max-w-sm !z-[9800] !top-[38%] !translate-y-0">
          <DialogHeader>
            <DialogTitle>Identity verification required</DialogTitle>
            <DialogDescription>Finish verification to unlock Group Creation feature</DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuButton
              variant="secondary"
              size="lg"
              className="flex-1 min-w-0"
              onClick={() => setGroupVerifyGateOpen(false)}
            >
              Not now
            </NeuButton>
            <NeuButton
              size="lg"
              className="flex-1 min-w-0"
              onClick={() => {
                setGroupVerifyGateOpen(false);
                navigate("/verify-identity");
              }}
            >
              Verify now
            </NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group invite acceptance popup */}
      <Dialog open={!!pendingGroupInvite} onOpenChange={() => setPendingGroupInvite(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Group invite 🐾</DialogTitle>
            <DialogDescription>
              <strong>{pendingGroupInvite?.inviterName}</strong> invited you to join{" "}
              <strong>{pendingGroupInvite?.chatName}</strong>. Want to hop in?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <NeuButton
              variant="secondary"
              size="lg"
              className="flex-1 min-w-0"
              onClick={() => setPendingGroupInvite(null)}
            >
              Not Now
            </NeuButton>
            <NeuButton
              size="lg"
              className="flex-1 min-w-0"
              onClick={async () => {
                if (!pendingGroupInvite || !profile?.id) return;
                try {
                  let data: unknown = null;
                  let error: { message?: string } | null = null;
                  if (pendingGroupInvite.inviteId) {
                    const byId = await (supabase.rpc as (
                      fn: string,
                      params?: Record<string, unknown>
                    ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
                      "accept_group_chat_invite_by_id",
                      {
                        p_invite_id: pendingGroupInvite.inviteId,
                      }
                    );
                    data = byId.data;
                    error = byId.error;
                  } else {
                    const byChat = await (supabase.rpc as (
                      fn: string,
                      params?: Record<string, unknown>
                    ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
                      "accept_group_chat_invite",
                      {
                        p_chat_id: pendingGroupInvite.chatId,
                      }
                    );
                    data = byChat.data;
                    error = byChat.error;
                  }
                  if (error) throw error;
                  const joined = Array.isArray(data)
                    ? ((data[0] || {}) as { joined?: unknown }).joined === true
                    : false;
                  if (!joined) {
                    toast.error("Invite is no longer available.");
                    return;
                  }
                  toast.success(`Joined ${pendingGroupInvite.chatName}`);
                  await loadConversations();
                  navigate(`/chat-dialogue?room=${encodeURIComponent(pendingGroupInvite.chatId)}&name=${encodeURIComponent(pendingGroupInvite.chatName)}`);
                } catch (err: unknown) {
                  const msg =
                    err && typeof err === "object" && "message" in err
                      ? String((err as { message?: string }).message || "")
                      : "";
                  toast.error(msg ? `Unable to join group right now: ${msg}` : "Unable to join group right now.");
                } finally {
                  setPendingGroupInvite(null);
                }
              }}
            >
              Join
            </NeuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <CreateGroupSheet
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={handleGroupCreated}
      />
      <JoinWithCodeSheet
        isOpen={isJoinWithCodeOpen}
        onClose={() => setIsJoinWithCodeOpen(false)}
      />
      </div>

      {/* Safe Harbor modal removed — disclaimer is now inside ChatDialogue */}

      {/* Nanny Booking Modal */}
      <AnimatePresence>
        {nannyBookingOpen && selectedNanny && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNannyBookingOpen(false)}
              className="fixed inset-0 bg-black/50 z-[2000]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-card rounded-t-3xl p-6 z-[2001] shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{t("booking.title")}</h3>
                <button onClick={() => setNannyBookingOpen(false)}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-semibold">{selectedNanny.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-semibold">{selectedNanny.name}</p>
                  <p className="text-xs text-muted-foreground">{t("booking.pet_nanny")}</p>
                </div>
              </div>
              <div className="mb-3 text-xs text-muted-foreground">
                A verified badge increases trust and helps secure more bookings.
              </div>

              {/* Service Start Date */}
              <div className="mb-3">
                <label className="text-sm font-medium mb-1.5 block">{t("booking.service_date")}</label>
                <input
                  type="date"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full h-10 rounded-xl bg-muted border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Service End Date */}
              <div className="mb-3">
                <label className="text-sm font-medium mb-1.5 block">{t("Service End Date")}</label>
                <input
                  type="date"
                  value={serviceEndDate}
                  onChange={(e) => setServiceEndDate(e.target.value)}
                  min={serviceDate || new Date().toISOString().split("T")[0]}
                  className="w-full h-10 rounded-xl bg-muted border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Start / End Time */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("booking.start_time")}</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("booking.end_time")}</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-10 rounded-xl bg-muted border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Pet Selection — fetched from user's pets table */}
              <div className="mb-3">
                <label className="text-sm font-medium mb-1.5 block">{t("booking.which_pet")}</label>
                <select
                  value={selectedPet}
                  onChange={(e) => setSelectedPet(e.target.value)}
                  className="w-full h-10 rounded-xl bg-muted border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                >
                  <option value="">{t("booking.select_pet")}</option>
                  {userPets.map((pet) => (
                    <option key={pet.id} value={pet.id}>
                      {pet.name} ({pet.species})
                    </option>
                  ))}
                </select>
              </div>

              {/* Location — user input */}
              <div className="mb-4">
                <label className="text-sm font-medium mb-1.5 block">{t("booking.location")}</label>
                <input
                  type="text"
                  value={bookingLocation}
                  onChange={(e) => setBookingLocation(e.target.value)}
                  placeholder={t("Enter service location")}
                  className="w-full h-9 rounded-[12px] bg-white border border-brandText/30 px-2 py-1 text-sm text-left outline-none focus:border-brandBlue focus:shadow-sm"
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">{t("booking.amount")}</label>
                <div className="flex items-center gap-2">
                  <select
                    value={bookingCurrency}
                    onChange={(e) => setBookingCurrency(e.target.value)}
                    className="h-9 rounded-[12px] bg-white border border-brandText/30 px-2 py-1 text-sm text-left"
                  >
                    <option value="USD">USD</option>
                    <option value="HKD">HKD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input
                    type="number"
                    value={bookingAmount}
                    onChange={(e) => setBookingAmount(e.target.value)}
                    min="1"
                    max="500"
                    disabled={!!sitterHourlyRate}
                    className="flex-1 h-9 rounded-[12px] bg-white border border-brandText/30 px-2 py-1 text-sm font-semibold text-left outline-none focus:border-brandBlue focus:shadow-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {sitterHourlyRate ? t("booking.amount_calculated") : t("Amount must be greater than 0")}
                </p>
                <label className="text-xs text-muted-foreground mt-3 block">
                  <input
                    type="checkbox"
                    checked={safeHarborAccepted}
                    onChange={(e) => setSafeHarborAccepted(e.target.checked)}
                    className="mr-2 align-middle"
                  />
                  I acknowledge that 'huddle' is a marketplace platform and sitters are independent contractors, not employees of 'huddle'. 'huddle' is not responsible for any injury, property damage, or loss occurring during a booking. I agree to use the in-app dispute resolution system before contacting any financial institution for a chargeback.
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setNannyBookingOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  {t("booking.cancel")}
                </button>
                <button
                  onClick={handleBookingCheckout}
                  disabled={
                    bookingProcessing ||
                    parseFloat(bookingAmount) <= 0 ||
                    !serviceDate ||
                    !serviceEndDate ||
                    !startTime ||
                    !endTime ||
                    !selectedPet ||
                    !bookingLocation.trim() ||
                    !safeHarborAccepted
                  }
                  className="flex-1 py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md"
                  style={{ backgroundColor: "#A6D539" }}
                >
                  {bookingProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      {t("Proceed Booking Payment")}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <PublicProfileSheet
        isOpen={Boolean(profileSheetUser)}
        onClose={() => setProfileSheetUser(null)}
        loading={profileSheetLoading}
        fallbackName={profileSheetUser?.name}
        viewedUserId={profileSheetUser?.id}
        data={profileSheetData as never}
        onStarQuotaBlocked={(targetTier) => openStarUpgradeSheet(targetTier)}
      />
      <StarUpgradeSheet
        isOpen={Boolean(starUpgradeTier)}
        tier={starUpgradeTier || "plus"}
        billing={starUpgradeBilling}
        loading={starCheckoutLoading}
        onClose={closeStarUpgradeSheet}
        onBillingChange={setStarUpgradeBilling}
        onUpgrade={handleStarUpgradeCheckout}
      />
      <Dialog
        open={Boolean(confirmStarTarget)}
        onOpenChange={(open) => {
          if (starActionLoading) return;
          if (!open) setConfirmStarTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Use a Star to connect?</DialogTitle>
            <DialogDescription>This starts a conversation immediately.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <button
              type="button"
              className="flex-1 h-10 rounded-full border border-border bg-[#eceff4] px-4 text-sm font-semibold text-[#4a4965]"
              disabled={starActionLoading}
              onClick={() => setConfirmStarTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 h-10 rounded-full bg-[#F5C85C] px-4 text-sm font-semibold text-[#2C2A19] disabled:opacity-50"
              disabled={starActionLoading}
              onClick={() => void executeConfirmedStar()}
            >
              {starActionLoading ? "Sending..." : "Send Star"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnimatePresence>
        {starFlightVisible && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[9805]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#F5C85C] text-[34px] drop-shadow-[0_8px_18px_rgba(245,200,92,0.45)]"
              initial={{ scale: 1, x: 0, y: 0, opacity: 1 }}
              animate={{ scale: 0.36, x: 160, y: -240, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              ⭐
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovery Filter Modal */}
      <GlassModal
        isOpen={isFilterModalOpen && !starUpgradeTier}
        onClose={() => { setIsFilterModalOpen(false); setActiveFilterRow(null); }}
        title={activeFilterRow ? undefined : t("Filters")}
        maxWidth="max-w-lg"
        className="max-h-[78vh] overflow-y-auto pb-4"
      >
              {/* Main list of filter rows */}
              {!activeFilterRow && (
                <div className="divide-y divide-border">
                  {FILTER_ROWS.map((row) => {
                    const locked =
                      (row.tier === "plus" && effectiveTier === "free") ||
                      (row.tier === "gold" && effectiveTier !== "gold");
                    return (
                      <button
                        key={row.key}
                        className="w-full flex items-center justify-between px-5 py-3.5 text-sm"
                        onClick={() => {
                          if (locked) {
                            if (row.tier === "gold" && effectiveTier !== "gold") {
                              toast.error(quotaConfig.copy.filters.goldLocked);
                              openStarUpgradeSheet("gold");
                              return;
                            }
                            toast.error(quotaConfig.copy.filters.locked);
                            openStarUpgradeSheet("plus");
                            return;
                          }
                          setActiveFilterRow(row);
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          {locked && <Lock className="w-4 h-4 text-muted-foreground" />}
                          <span className={cn("font-medium", locked ? "text-muted-foreground" : "text-brandText")}>
                            {row.label}
                          </span>
                          {locked && (
                            <span className={cn(
                              "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white",
                              row.tier === "gold" ? "bg-brandGold" : "bg-brandBlue"
                            )}>
                              {row.tier === "gold" ? "Gold" : "Plus"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!locked && (
                            <span className="text-xs text-muted-foreground max-w-[120px] truncate text-right">
                              {filterSummary(filters, row)}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Per-filter selection UI */}
              {activeFilterRow && (
                <div className="p-5 space-y-4">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-base font-semibold text-brandText hover:text-brandText"
                    onClick={() => setActiveFilterRow(null)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {activeFilterRow.label}
                  </button>
                  {/* Age Range */}
                  {activeFilterRow.key === "ageMin" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Min Age</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={ageMinDraft}
                            onChange={(e) => setAgeMinDraft(e.target.value)}
                            onBlur={() => {
                              const digits = ageMinDraft.replace(/[^\d]/g, "");
                              const parsed = Number(digits);
                              setFilters((f) => {
                                const nextMin = Number.isFinite(parsed) ? Math.max(16, Math.min(99, parsed)) : f.ageMin;
                                const clampedMin = Math.min(nextMin, f.ageMax);
                                setAgeMinDraft(String(clampedMin));
                                return { ...f, ageMin: clampedMin };
                              });
                            }}
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm" />
                        </div>
                        <span className="text-muted-foreground mt-5">–</span>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Max Age</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={ageMaxDraft}
                            onChange={(e) => setAgeMaxDraft(e.target.value)}
                            onBlur={() => {
                              const digits = ageMaxDraft.replace(/[^\d]/g, "");
                              const parsed = Number(digits);
                              setFilters((f) => {
                                const nextMax = Number.isFinite(parsed) ? Math.max(16, Math.min(99, parsed)) : f.ageMax;
                                const clampedMax = Math.max(f.ageMin, nextMax);
                                setAgeMaxDraft(String(clampedMax));
                                return { ...f, ageMax: clampedMax };
                              });
                            }}
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm" />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">{filters.ageMin} – {filters.ageMax} years old</div>
                      {(() => {
                        const draftDigits = ageMinDraft.replace(/[^\d]/g, "");
                        const draftMin = Number(draftDigits);
                        if (!Number.isFinite(draftMin) || draftMin >= 16) return null;
                        return (
                          <div className="text-xs text-center text-[#7D86A6]">
                            {DISCOVER_MIN_AGE_MESSAGE}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* Height Range */}
                  {activeFilterRow.key === "heightMin" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Min (cm)</label>
                          <input type="number" min={100} max={300} value={filters.heightMin}
                            onChange={(e) => setFilters((f) => ({ ...f, heightMin: Math.max(100, Math.min(300, Number(e.target.value))) }))}
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm" />
                        </div>
                        <span className="text-muted-foreground mt-5">–</span>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Max (cm)</label>
                          <input type="number" min={100} max={300} value={filters.heightMax}
                            onChange={(e) => setFilters((f) => ({ ...f, heightMax: Math.max(f.heightMin, Math.min(300, Number(e.target.value))) }))}
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm" />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">{filters.heightMin} – {filters.heightMax} cm</div>
                    </div>
                  )}
                  {/* Pet Experience Range */}
                  {activeFilterRow.key === "experienceYearsMin" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Min years</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={filters.experienceYearsMin}
                            onChange={(e) =>
                              setFilters((f) => ({
                                ...f,
                                experienceYearsMin: Math.max(0, Math.min(99, Number(e.target.value))),
                              }))
                            }
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm"
                          />
                        </div>
                        <span className="text-muted-foreground mt-5">–</span>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Max years</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={filters.experienceYearsMax}
                            onChange={(e) =>
                              setFilters((f) => ({
                                ...f,
                                experienceYearsMax: Math.max(f.experienceYearsMin, Math.min(99, Number(e.target.value))),
                              }))
                            }
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm"
                          />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">
                        {filters.experienceYearsMin} – {filters.experienceYearsMax} years
                      </div>
                    </div>
                  )}
                  {/* Distance slider */}
                  {activeFilterRow.key === "maxDistanceKm" && (
                    <div className="space-y-4">
                      <div className="text-center text-2xl font-bold text-brandBlue">{filters.maxDistanceKm} km</div>
                      <input type="range" min={0} max={150} value={filters.maxDistanceKm}
                        onChange={(e) => setFilters((f) => ({ ...f, maxDistanceKm: Number(e.target.value) }))}
                        className="w-full accent-primary" />
                      <div className="flex justify-between text-xs text-muted-foreground"><span>0 km</span><span>150 km</span></div>
                    </div>
                  )}
                  {/* Multi-select: Gender */}
                  {activeFilterRow.key === "genders" && (
                    <div className="space-y-2">
                      {[...ALL_GENDERS].map((g) => (
                        <label key={g} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                          <input type="checkbox" checked={filters.genders.includes(g)}
                            onChange={(e) => setFilters((f) => ({ ...f, genders: e.target.checked ? [...f.genders, g] : f.genders.filter((x) => x !== g) }))}
                            className="w-4 h-4 accent-primary rounded" />
                          <span className="text-sm text-brandText">{g}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Multi-select: Species (chips) */}
                  {activeFilterRow.key === "species" && (
                    <div className="flex flex-wrap gap-2">
                      {[...ALL_SPECIES].map((s) => (
                        <button key={s}
                          onClick={() => setFilters((f) => ({ ...f, species: f.species.includes(s) ? f.species.filter((x) => x !== s) : [...f.species, s] }))}
                          className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                            filters.species.includes(s) ? "bg-brandBlue text-white border-brandBlue" : "bg-white text-brandText border-border")}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Social Role (pill toggles) */}
                  {activeFilterRow.key === "socialRoles" && (
                    <div className="flex flex-wrap gap-2">
                      {[...ALL_SOCIAL_ROLES].map((val) => (
                        <button key={val}
                          onClick={() => setFilters((f) => ({ ...f, socialRoles: f.socialRoles.includes(val) ? f.socialRoles.filter((x) => x !== val) : [...f.socialRoles, val] }))}
                          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors",
                            filters.socialRoles.includes(val) ? "bg-brandBlue text-white border-brandBlue" : "bg-white text-brandText border-border")}>
                          {val}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Multi-select: Orientations */}
                  {activeFilterRow.key === "orientations" && (
                    <div className="space-y-2">
                      {[...ALL_ORIENTATIONS].map((o) => (
                        <label key={o} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                          <input type="checkbox" checked={filters.orientations.includes(o)}
                            onChange={(e) => setFilters((f) => ({ ...f, orientations: e.target.checked ? [...f.orientations, o] : f.orientations.filter((x) => x !== o) }))}
                            className="w-4 h-4 accent-primary rounded" />
                          <span className="text-sm text-brandText">{o}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Multi-select: Degrees */}
                  {activeFilterRow.key === "degrees" && (
                    <div className="space-y-2">
                      {[...ALL_DEGREES].map((d) => (
                        <label key={d} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                          <input type="checkbox" checked={filters.degrees.includes(d)}
                            onChange={(e) => setFilters((f) => ({ ...f, degrees: e.target.checked ? [...f.degrees, d] : f.degrees.filter((x) => x !== d) }))}
                            className="w-4 h-4 accent-primary rounded" />
                          <span className="text-sm text-brandText">{d}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Multi-select: Relationship Status */}
                  {activeFilterRow.key === "relationshipStatuses" && (
                    <div className="space-y-2">
                      {[...ALL_RELATIONSHIP_STATUSES].map((rs) => (
                        <label key={rs} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                          <input type="checkbox" checked={filters.relationshipStatuses.includes(rs)}
                            onChange={(e) => setFilters((f) => ({ ...f, relationshipStatuses: e.target.checked ? [...f.relationshipStatuses, rs] : f.relationshipStatuses.filter((x) => x !== rs) }))}
                            className="w-4 h-4 accent-primary rounded" />
                          <span className="text-sm text-brandText">{rs}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Multi-select: Languages */}
                  {activeFilterRow.key === "languages" && (
                    <div className="space-y-2">
                      {[...ALL_LANGUAGES].map((lang) => (
                        <label key={lang} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                          <input type="checkbox" checked={filters.languages.includes(lang)}
                            onChange={(e) => setFilters((f) => ({ ...f, languages: e.target.checked ? [...f.languages, lang] : f.languages.filter((x) => x !== lang) }))}
                            className="w-4 h-4 accent-primary rounded" />
                          <span className="text-sm text-brandText">{lang}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Toggle filters */}
                  {activeFilterRow.key === "hasCar" && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm font-medium text-brandText">Show users with Car Badge</span>
                      <Switch checked={filters.hasCar} onCheckedChange={(v) => setFilters((f) => ({ ...f, hasCar: v }))} />
                    </div>
                  )}
                  {activeFilterRow.key === "verifiedOnly" && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm font-medium text-brandText">Show only Verified Users</span>
                      <Switch checked={filters.verifiedOnly} onCheckedChange={(v) => setFilters((f) => ({ ...f, verifiedOnly: v }))} />
                    </div>
                  )}
                  {activeFilterRow.key === "whoWavedAtMe" && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm font-medium text-brandText">Show users who waved at you</span>
                      <Switch checked={filters.whoWavedAtMe} onCheckedChange={(v) => setFilters((f) => ({ ...f, whoWavedAtMe: v }))} />
                    </div>
                  )}
                  {activeFilterRow.key === "activeOnly" && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm font-medium text-brandText">Show Active Users only (24h)</span>
                      <Switch checked={filters.activeOnly} onCheckedChange={(v) => setFilters((f) => ({ ...f, activeOnly: v }))} />
                    </div>
                  )}
                  <button className="w-full rounded-xl bg-brandBlue text-white font-bold py-3 text-sm mt-4"
                    onClick={() => setActiveFilterRow(null)}>
                    Done
                  </button>
                </div>
              )}

              {/* Apply / Reset buttons */}
              {!activeFilterRow && (
                <div className="p-5 space-y-2">
                  <button className="w-full rounded-xl bg-brandBlue text-white font-bold py-3 text-sm"
                    onClick={() => { setIsFilterModalOpen(false); toast.success(t("Filters applied")); }}>
                    {t("Apply Filters")}
                  </button>
                  <button className="w-full rounded-xl bg-muted text-muted-foreground font-medium py-3 text-sm"
                    onClick={() => { setFilters({ ...DEFAULT_FILTERS }); toast.info(t("Filters reset to defaults")); }}>
                    Reset to Defaults
                  </button>
                </div>
              )}
      </GlassModal>
    </div>
  );
};

export default Chats;
