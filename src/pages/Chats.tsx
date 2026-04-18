import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate, type MotionValue } from "framer-motion";
import { Users, MessageSquare, Search, X, Loader2, Star, SlidersHorizontal, Lock, ChevronRight, ChevronLeft, Trash2, DollarSign, MapPin, SendHorizontal, UserPlus, Bell, BellOff, LogOut, ShieldAlert, ImageIcon, Hash, BadgeCheck, Settings, Pencil, Save } from "lucide-react";
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
import { GlassModal } from "@/components/ui/GlassModal";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
import { WaveHandIcon } from "@/components/icons/WaveHandIcon";
import matchPageImage from "@/assets/Match page.png";
import discoverAgeGateImage from "@/assets/Notifications/Discover age gate.png";
import emptyChatImage from "@/assets/Notifications/Empty Chat.png";
import serviceImage from "@/assets/Notifications/Service.jpg";
import profilePlaceholder from "@/assets/Profile Placeholder.png";
import { getQuotaCapsForTier, normalizeQuotaTier, quotaConfig } from "@/config/quotaConfig";
import { StarUpgradeSheet } from "@/components/monetization/StarUpgradeSheet";
import { handoffStripeCheckout } from "@/lib/stripeCheckout";
import { openExternalUrl } from "@/lib/nativeShell";
import { isStarIntroKind, parseStarChatContent, sendStarChat } from "@/lib/starChat";
import { parseChatShareMessage } from "@/lib/shareModel";
import { SharedContentCard } from "@/components/chat/SharedContentCard";
import { DiscoveryDeck } from "@/components/chat/DiscoveryDeck";
import { GroupDetailsPanel } from "@/components/chat/GroupDetailsPanel";
import { groupActivityRankValue, updateGroupChatMetadata, type GroupMetadataRow } from "@/lib/groupChats";
import { useDiscoverLocationGate } from "@/hooks/useDiscoverLocationGate";
import {
  noteDiscoveryCommit,
  noteDiscoveryDragEnd,
  noteDiscoveryFlingResolved,
} from "@/lib/discoveryPerf";
import {
  TEAM_HUDDLE_USER_ID,
  isTeamHuddleIdentity,
  resolveTeamHuddleAvatar,
  resolveTeamHuddleAvailability,
  resolveTeamHuddleDisplayName,
} from "@/lib/teamHuddleIdentity";
import {
  extractDistrictToken,
  normalizeCountryKey,
  resolveCountryByPrecedence,
  resolveDiscoveryLocationLabel,
} from "@/lib/locationLabels";

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

const interpolateStops = (progress: number, inputs: number[], outputs: number[]) => {
  if (inputs.length !== outputs.length || inputs.length === 0) return 0;
  const clamped = clamp(progress, inputs[0], inputs[inputs.length - 1]);
  for (let index = 1; index < inputs.length; index += 1) {
    const start = inputs[index - 1];
    const end = inputs[index];
    if (clamped <= end) {
      const span = end - start || 1;
      const ratio = (clamped - start) / span;
      return outputs[index - 1] + (outputs[index] - outputs[index - 1]) * ratio;
    }
  }
  return outputs[outputs.length - 1];
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
const DISCOVERY_FILTER_DEBOUNCE_MS = 300;
const DISCOVERY_CLIENT_RESET_USER_ID = "735e8908-6dc8-4b41-837e-d4917e93caae";
const DISCOVERY_CLIENT_RESET_STAMP = "2026-04-18-deck-reset-v4";
const DISCOVERY_CLIENT_RESET_DISPLAY_NAMES = new Set(["hyphen fong", "social manager"]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const animateMotionValue = (
  value: MotionValue<number>,
  target: number,
  options: {
    type?: "spring" | "tween";
    stiffness?: number;
    damping?: number;
    mass?: number;
    duration?: number;
    ease?: number[];
  }
) =>
  new Promise<void>((resolve) => {
    animate(value, target, {
      ...options,
      onComplete: () => resolve(),
    });
  });

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
  location_country?: string | null;
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
  options?: {
    enforceVerifiedOnly?: boolean;
    enforceActiveOnly?: boolean;
    wavedByUserIds?: Set<string>;
    anchor?: DiscoveryAnchor | null;
    viewerCountry?: string | null;
  }
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
      const viewerCountry = normalizeCountryKey(options.viewerCountry ?? null);
      const profileCountry = normalizeCountryKey(profile.location_country ?? null);
      const sameCountry = Boolean(viewerCountry && profileCountry && viewerCountry === profileCountry);
      if (!sameCountry && Number.isFinite(dKm) && dKm > filters.maxDistanceKm) return false;
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
  avatar_url?: string | null;
  memberCount: number;
  lastMessage: string;
  lastMessageSender: string;
  time: string;
  lastMessageFromMe?: boolean;
  lastMessageReadByOther?: boolean;
  unread: number;
  invitePending?: boolean;
  inviterName?: string | null;
  // Discovery fields — populated from chats table
  petFocus?: string[] | null;
  locationLabel?: string | null;
  lastMessageAt?: string | null;
  joinMethod?: string | null;
  description?: string | null;
  isAdmin?: boolean;
  locationCountry?: string | null;
  visibility?: "public" | "private" | null;
  roomCode?: string | null;
  createdAt?: string | null;
  _score?: number;
}

const PULL_REFRESH_THRESHOLD = 54;

interface GroupContactOption {
  id: string;
  name: string;
  avatar?: string;
  verified: boolean;
}

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
  source: "device";
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

type InboxScope = MainTab | "all";

type InboxSummaryRow = {
  chat_id: string;
  room_type: string | null;
  peer_user_id?: string | null;
  peer_name?: string | null;
  peer_avatar_url?: string | null;
  peer_is_verified?: boolean | null;
  peer_has_car?: boolean | null;
  peer_availability_label?: string | null;
  peer_social_id?: string | null;
  blocked_by_me?: boolean | null;
  blocked_by_them?: boolean | null;
  unmatched_by_them?: boolean | null;
  matched_at?: string | null;
  chat_name?: string | null;
  avatar_url?: string | null;
  member_count?: number | null;
  pet_focus?: string[] | null;
  location_label?: string | null;
  location_country?: string | null;
  visibility?: "public" | "private" | null;
  room_code?: string | null;
  join_method?: string | null;
  description?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  last_message_id?: string | null;
  last_message_sender_id?: string | null;
  last_message_sender_name?: string | null;
  last_message_content?: string | null;
  last_message_at?: string | null;
  unread_count?: number | null;
  last_message_read_by_other?: boolean | null;
  service_status?: ChatUser["serviceStatus"] | null;
  service_requester_id?: string | null;
  service_provider_id?: string | null;
  service_request_card?: Record<string, unknown> | null;
  shape_issue?: string | null;
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

const Chats = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
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
  const [exploreGroups, setExploreGroups] = useState<Group[]>([]);
  const [invitedExploreGroups, setInvitedExploreGroups] = useState<Group[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const inboxCacheRef = useRef<{ friends: ChatUser[]; service: ChatUser[]; groups: Group[] }>({
    friends: [],
    service: [],
    groups: [],
  });
  const inboxLoadedScopesRef = useRef<Set<MainTab>>(new Set());
  const inboxWarmTimerRef = useRef<number | null>(null);
  const dirtyRoomIdsRef = useRef<Set<string>>(new Set());
  const dirtyRoomFlushTimerRef = useRef<number | null>(null);
  const [groupsPullRefreshing, setGroupsPullRefreshing] = useState(false);
  const [groupsPullOffset, setGroupsPullOffset] = useState(0);
  const groupsTouchStartYRef = useRef<number | null>(null);
  const groupsPullEligibleRef = useRef(false);
  // IDs of groups where current user has a pending join request
  const [sentJoinRequests, setSentJoinRequests] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [topTab, setTopTab] = useState<"discover" | "chats">(() => {
    const tab = searchParams.get("tab");
    return tab === "chats" || tab === "groups" ? "chats" : "discover";
  });
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | "star" | null>(null);
  const [discoveryRefreshTick, setDiscoveryRefreshTick] = useState(0);
  const [discoveryVisibleCount, setDiscoveryVisibleCount] = useState(20);
  const [activeFilterRow, setActiveFilterRow] = useState<FilterRowDef | null>(null);
  const [filters, setFilters] = useState<DiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [debouncedFilters, setDebouncedFilters] = useState<DiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [expandedDistanceKm, setExpandedDistanceKm] = useState<number | null>(null);
  const [ageMinDraft, setAgeMinDraft] = useState(String(DEFAULT_FILTERS.ageMin));
  const [ageMaxDraft, setAgeMaxDraft] = useState(String(DEFAULT_FILTERS.ageMax));
  const [profileSheetUser, setProfileSheetUser] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);
  const [profileSheetData, setProfileSheetData] = useState<Record<string, unknown> | null>(null);
  const [profileSheetLoading, setProfileSheetLoading] = useState(false);
  // Group management
  const [groupManageId, setGroupManageId] = useState<string | null>(null);
  const [groupDetailsId, setGroupDetailsId] = useState<string | null>(null);
  const [groupManageReturnToDetails, setGroupManageReturnToDetails] = useState(false);
  const [swipeDeleteId, setSwipeDeleteId] = useState<string | null>(null);
  const [swipeDeleteGroupId, setSwipeDeleteGroupId] = useState<string | null>(null);
  const [deleteGroupConfirmId, setDeleteGroupConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [groupImageUploading, setGroupImageUploading] = useState(false);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupDescriptionSaving, setGroupDescriptionSaving] = useState(false);
  const [groupDescriptionEditing, setGroupDescriptionEditing] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupPendingInvites, setGroupPendingInvites] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState<{ requestId: string; userId: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupDetailsMediaUrls, setGroupDetailsMediaUrls] = useState<string[]>([]);
  const [mutualWaves, setMutualWaves] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [groupAddSearch, setGroupAddSearch] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryLoadSettled, setDiscoveryLoadSettled] = useState(false);
  const [discoveryAnchor, setDiscoveryAnchor] = useState<DiscoveryAnchor | null>(null);
  const [groupContactPool, setGroupContactPool] = useState<GroupContactOption[]>([]);
  const [hiddenDiscoveryIds, setHiddenDiscoveryIds] = useState<Set<string>>(new Set());
  const [handledDiscoveryIds, setHandledDiscoveryIds] = useState<Set<string>>(new Set());
  const [passedDiscoveryIds, setPassedDiscoveryIds] = useState<Set<string>>(new Set());
  const [carryoverPassedIds, setCarryoverPassedIds] = useState<Set<string>>(new Set());
  const [discoveryHistoryHydrated, setDiscoveryHistoryHydrated] = useState(false);
  const [albumUrls, setAlbumUrls] = useState<Record<string, string[]>>({});
  const discoveryMediaReadyRef = useRef<Map<string, { urlsReady: boolean; imagesDecoded: boolean }>>(new Map());
  const discoveryMediaWaitersRef = useRef<Map<string, Set<() => void>>>(new Map());
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
  const [starUpgradeTier, setStarUpgradeTier] = useState<StarUpgradeTier | null>(null);
  const [starUpgradeBilling, setStarUpgradeBilling] = useState<"monthly" | "annual">("monthly");
  const [starCheckoutLoading, setStarCheckoutLoading] = useState(false);
  const [confirmStarTarget, setConfirmStarTarget] = useState<DiscoveryProfile | null>(null);
  const [starActionLoading, setStarActionLoading] = useState(false);
  const [discoverySendCue, setDiscoverySendCue] = useState<null | { kind: "wave" | "star"; id: number }>(null);
  const discoverySendCueTimeoutRef = useRef<number | null>(null);
  const discoverySendCueAnimationRef = useRef<{ stop: () => void } | null>(null);
  const discoverySendCueKindRef = useRef<"wave" | "star" | null>(null);
  const discoverySendCueCommitPendingRef = useRef(false);
  const discoverySendCueProgress = useMotionValue(0);
  const [matchOnlyAvatars, setMatchOnlyAvatars] = useState<MatchOnlyAvatar[]>([]);
  const [matchesFeedTick, setMatchesFeedTick] = useState(0);
  const seenMatchUserIdsRef = useRef<Set<string>>(new Set());
  const serverSeenMatchUserIdsRef = useRef<Set<string>>(new Set());
  const pendingSeenMatchWritesRef = useRef<Set<string>>(new Set());
  const [localSeenMatchesHydrated, setLocalSeenMatchesHydrated] = useState(false);
  const [seenMatchesHydrated, setSeenMatchesHydrated] = useState(false);
  const [seenMatchesServerState, setSeenMatchesServerState] = useState<"idle" | "ready" | "failed">("idle");
  const directPeerByRoomRef = useRef<Record<string, string>>({});
  const conversationsHydratedRef = useRef(false);
  const conversationsRetryTimerRef = useRef<number | null>(null);

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
  const discoverySwipeBusyRef = useRef(false);
  const [discoverySwipeUiBusy, setDiscoverySwipeUiBusy] = useState(false);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const dragRotateBase = useTransform(dragX, [-200, 0, 200], [-10, 0, 12]);
  // Separate writable motion value for exit rotation so fling doesn't fight useTransform
  const dragRotateOverride = useMotionValue(0);
  const dragRotate = useTransform(
    [dragRotateBase, dragRotateOverride] as const,
    ([base, override]: [number, number]) => base + override
  );
  const dragScale = useTransform(
    () => 1 - clamp((Math.abs(dragX.get()) * 0.7 + Math.abs(dragY.get())) / 3600, 0, 0.065)
  );
  const dragRightProgress = useTransform(() => clamp(Math.max(0, dragX.get()) / 180, 0, 1));
  const dragLeftProgress = useTransform(() => clamp(Math.max(0, -dragX.get()) / 180, 0, 1));
  const committedDiscoveryDirection = swipeDir === "left" || swipeDir === "right" ? swipeDir : null;
  // During the commit window (discoverySwipeUiBusy=true) we NEVER fall back to
  // raw drag progress — the outgoing card is already off-screen but dragX is
  // still ±viewport until the rAF-gated reset, which would flash the stamp on
  // the newly promoted card for one frame. Force an explicit value instead.
  const waveIndicatorOpacity = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "right" ? 1 : 0
      : interpolateStops(dragRightProgress.get(), [0, 0.08, 0.45, 1], [0, 0.16, 0.8, 1])
  );
  const passIndicatorOpacity = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "left" ? 1 : 0
      : interpolateStops(dragLeftProgress.get(), [0, 0.08, 0.45, 1], [0, 0.16, 0.8, 1])
  );
  const waveIndicatorScale = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "right" ? 1.03 : 0.54
      : interpolateStops(dragRightProgress.get(), [0, 0.08, 0.45, 1], [0.54, 0.7, 0.94, 1.03])
  );
  const passIndicatorScale = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "left" ? 1 : 0.7
      : interpolateStops(dragLeftProgress.get(), [0, 0.28, 1], [0.7, 0.9, 1])
  );
  const waveIndicatorX = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "right" ? 0 : -18
      : interpolateStops(dragRightProgress.get(), [0, 0.2, 1], [-18, -6, 0])
  );
  const waveIndicatorY = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "right" ? 0 : 12
      : interpolateStops(dragRightProgress.get(), [0, 0.2, 1], [12, 4, 0])
  );
  const passIndicatorX = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "left" ? 0 : 18
      : interpolateStops(dragLeftProgress.get(), [0, 0.2, 1], [18, 6, 0])
  );
  const passIndicatorY = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "left" ? 0 : 12
      : interpolateStops(dragLeftProgress.get(), [0, 0.2, 1], [12, 4, 0])
  );
  const waveTintOpacity = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "right" ? 0.2 : 0
      : interpolateStops(dragRightProgress.get(), [0, 0.35, 1], [0, 0.1, 0.2])
  );
  const passTintOpacity = useTransform(() =>
    discoverySwipeUiBusy
      ? committedDiscoveryDirection === "left" ? 0.24 : 0
      : interpolateStops(dragLeftProgress.get(), [0, 0.25, 0.55, 1], [0, 0.08, 0.16, 0.24])
  );
  const nextCardScale = useTransform(dragX, [-150, 0, 150], [1, 0.95, 1]);
  const nextCardTranslateY = useTransform(dragX, [-150, 0, 150], [0, 8, 0]);
  const stampCounterRotate = useTransform(dragRotate, (value) => -value);
  const [waveButtonAnimating, setWaveButtonAnimating] = useState(false);
  const clearDiscoverySendCueTimer = useCallback(() => {
    if (discoverySendCueTimeoutRef.current !== null) {
      window.clearTimeout(discoverySendCueTimeoutRef.current);
      discoverySendCueTimeoutRef.current = null;
    }
  }, []);
  const clearDiscoverySendCue = useCallback(() => {
    clearDiscoverySendCueTimer();
    discoverySendCueAnimationRef.current?.stop();
    discoverySendCueAnimationRef.current = null;
    discoverySendCueKindRef.current = null;
    discoverySendCueCommitPendingRef.current = false;
    discoverySendCueProgress.set(0);
    setDiscoverySendCue(null);
  }, [clearDiscoverySendCueTimer, discoverySendCueProgress]);
  const launchDiscoverySendCue = useCallback(
    (
      kind: "wave" | "star",
      options?: {
        onCommit?: () => void;
        onComplete?: () => void;
      }
    ) => {
      clearDiscoverySendCueTimer();
      discoverySendCueAnimationRef.current?.stop();
      discoverySendCueKindRef.current = kind;
      discoverySendCueCommitPendingRef.current = kind === "star" && typeof options?.onCommit === "function";
      discoverySendCueProgress.set(0);
      setDiscoverySendCue({ kind, id: Date.now() });

      const duration = kind === "wave" ? 0.22 : 1.35;
      const commitAt = kind === "star" ? 0.32 : 1;
      discoverySendCueAnimationRef.current = animate(discoverySendCueProgress, 1, {
        duration,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (latest) => {
          if (
            kind === "star" &&
            discoverySendCueCommitPendingRef.current &&
            latest >= commitAt
          ) {
            discoverySendCueCommitPendingRef.current = false;
            options?.onCommit?.();
          }
        },
        onComplete: () => {
          discoverySendCueAnimationRef.current = null;
          discoverySendCueKindRef.current = null;
          discoverySendCueCommitPendingRef.current = false;
          discoverySendCueProgress.set(0);
          setDiscoverySendCue(null);
          options?.onComplete?.();
        },
      });
    },
    [clearDiscoverySendCueTimer, discoverySendCueProgress]
  );
  const discoverySendCueScale = useTransform(discoverySendCueProgress, (progress) =>
    discoverySendCueKindRef.current === "wave"
      ? interpolateStops(progress, [0, 0.3, 0.72, 1], [0.58, 0.86, 1.04, 0.9])
      : interpolateStops(progress, [0, 0.18, 0.46, 0.74, 1], [0.72, 1.02, 1.16, 1.02, 0.82])
  );
  const discoverySendCueX = useTransform(discoverySendCueProgress, (progress) =>
    discoverySendCueKindRef.current === "wave"
      ? interpolateStops(progress, [0, 0.28, 0.74, 1], [-44, -6, 86, 156])
      : interpolateStops(progress, [0, 0.22, 0.58, 1], [-168, -84, 88, 224])
  );
  const discoverySendCueY = useTransform(discoverySendCueProgress, (progress) =>
    discoverySendCueKindRef.current === "wave"
      ? interpolateStops(progress, [0, 0.28, 0.74, 1], [18, 6, -32, -64])
      : interpolateStops(progress, [0, 0.18, 0.52, 1], [182, 124, -18, -318])
  );
  const discoverySendCueOpacity = useTransform(discoverySendCueProgress, (progress) =>
    discoverySendCueKindRef.current === "wave"
      ? interpolateStops(progress, [0, 0.28, 0.72, 1], [0.08, 0.54, 1, 0])
      : interpolateStops(progress, [0, 0.12, 0.36, 0.84, 1], [0.1, 0.78, 1, 0.92, 0])
  );
  const discoverySendCueRotate = useTransform(discoverySendCueProgress, (progress) =>
    discoverySendCueKindRef.current === "wave"
      ? interpolateStops(progress, [0, 0.28, 0.72, 1], [-14, -6, 6, 10])
      : interpolateStops(progress, [0, 0.22, 0.58, 1], [-24, -12, 6, 18])
  );
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
  useEffect(() => () => clearDiscoverySendCue(), [clearDiscoverySendCue]);
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
  const discoverLocationGate = useDiscoverLocationGate(topTab === "discover" && !discoverChatAgeBlocked);
  const discoveryLocationBlocked =
    topTab === "discover" &&
    !discoverChatAgeBlocked &&
    !discoverLocationGate.checking &&
    !discoverLocationGate.canShowDiscover;

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
    const timer = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, DISCOVERY_FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const normalizedDisplayName = String(profile?.display_name || "").trim().toLowerCase();
    const shouldRunDiscoveryClientReset =
      profile?.id === DISCOVERY_CLIENT_RESET_USER_ID ||
      DISCOVERY_CLIENT_RESET_DISPLAY_NAMES.has(normalizedDisplayName);
    if (!shouldRunDiscoveryClientReset || !profile?.id) return;
    const resetFlagKey = `discovery_client_reset_${profile.id}`;
    try {
      if (localStorage.getItem(resetFlagKey) === DISCOVERY_CLIENT_RESET_STAMP) return;
      const localKeys = Object.keys(localStorage);
      localKeys.forEach((key) => {
        if (
          key === discoveryKey ||
          key === handledDiscoveryKey ||
          key === passedDiscoveryKey ||
          key === matchedDiscoveryKey ||
          key === seenMatchesKey ||
          key === pendingSeenMatchesKey ||
          key.startsWith(`discovery_seen_`) ||
          key.startsWith(`discovery_handled_${profile.id}`) ||
          key.startsWith(`discovery_passed_${profile.id}`) ||
          key.startsWith(`discovery_matched_${profile.id}`) ||
          key.startsWith(`discovery_session_${profile.id}`)
        ) {
          localStorage.removeItem(key);
        }
      });
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach((key) => {
        if (
          key === passedDiscoverySessionKey ||
          key.startsWith(`discovery_passed_session_${profile.id}`) ||
          key.startsWith(`discovery_session_${profile.id}`)
        ) {
          sessionStorage.removeItem(key);
        }
      });
      localStorage.setItem(resetFlagKey, DISCOVERY_CLIENT_RESET_STAMP);
    } catch {
      // best-effort client reset only
    }
    setDiscoverySeenToday(0);
    setHandledDiscoveryIds(new Set());
    setPassedDiscoveryIds(new Set());
    setCarryoverPassedIds(new Set());
    setHiddenDiscoveryIds(new Set());
    seenMatchUserIdsRef.current = new Set();
    pendingSeenMatchWritesRef.current = new Set();
    serverSeenMatchUserIdsRef.current = new Set();
    setLocalSeenMatchesHydrated(false);
    setSeenMatchesHydrated(false);
    setSeenMatchesServerState("idle");
    setDiscoveryHistoryHydrated(false);
    setDiscoveryVisibleCount(20);
    setSwipeDir(null);
    dragX.set(0);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [
    discoveryKey,
    dragX,
    dragY,
    handledDiscoveryKey,
    matchedDiscoveryKey,
    pendingSeenMatchesKey,
    passedDiscoveryKey,
    passedDiscoverySessionKey,
    profile?.id,
    profile?.display_name,
    seenMatchesKey,
  ]);

  useEffect(() => {
    setHiddenDiscoveryIds(new Set());
    setHandledDiscoveryIds(new Set());
    setPassedDiscoveryIds(new Set());
    setCarryoverPassedIds(new Set());
    setDiscoveryHistoryHydrated(false);
    setDiscoveryVisibleCount(20);
    setSwipeDir(null);
    dragX.set(0);
    dragY.set(0);
  }, [dragX, dragY, profile?.id]);

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
    const base = Math.max(1, Math.round(debouncedFilters.maxDistanceKm || 5));
    const expanded = expandedDistanceKm === null ? base : Math.max(base, Math.round(expandedDistanceKm));
    return Math.min(DISCOVERY_MAX_RADIUS_KM, expanded);
  }, [debouncedFilters.maxDistanceKm, expandedDistanceKm]);
  const canExpandSearch = effectiveDiscoveryDistanceKm < DISCOVERY_MAX_RADIUS_KM;
  const prevDiscoveryQuotaReachedRef = useRef(discoveryQuotaReached);

  const bumpDiscoverySeen = useCallback(async (): Promise<boolean> => {
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
  }, [discoveryKey, discoveryQuotaReached]);

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
      dragX.set(0);
      dragY.set(0);
      setDiscoveryRefreshTick((tick) => tick + 1);
    }
    prevDiscoveryQuotaReachedRef.current = discoveryQuotaReached;
  }, [discoveryQuotaReached, dragX, dragY, topTab]);

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
        if (showToast && mutual) {
          toast.success("It’s a pawfect match!");
        }
        return { status: "sent", mutual, matchCreated };
      } catch (err: unknown) {
        if (isDuplicateWaveError(err)) {
          const mutual = await checkReciprocalWave(targetUserId);
          let matchCreated = false;
          if (mutual) {
            matchCreated = await finalizeMutualWave(targetUserId);
          }
          if (showToast && mutual) {
            toast.success("It’s a pawfect match!");
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

  const markDiscoveryMediaReady = useCallback(
    (profileId: string, patch: Partial<{ urlsReady: boolean; imagesDecoded: boolean }>) => {
      const normalized = String(profileId || "").trim();
      if (!normalized) return;
      const current = discoveryMediaReadyRef.current.get(normalized) || { urlsReady: false, imagesDecoded: false };
      const next = { ...current, ...patch };
      discoveryMediaReadyRef.current.set(normalized, next);
      if (!next.urlsReady) return;
      const waiters = discoveryMediaWaitersRef.current.get(normalized);
      if (!waiters) return;
      waiters.forEach((resolve) => resolve());
      discoveryMediaWaitersRef.current.delete(normalized);
    },
    []
  );

  const ensureDiscoveryProfileReady = useCallback(async (profileId?: string | null) => {
    const normalized = String(profileId || "").trim();
    if (!normalized) return;
    const current = discoveryMediaReadyRef.current.get(normalized);
    // Only gate on urlsReady (Supabase URL resolution). The DOM <img> handles
    // decode via fetchPriority+decoding=async; no manual decode preload needed.
    if (current?.urlsReady) return;
    await new Promise<void>((resolve) => {
      const waiters = discoveryMediaWaitersRef.current.get(normalized) || new Set<() => void>();
      waiters.add(resolve);
      discoveryMediaWaitersRef.current.set(normalized, waiters);
      window.setTimeout(() => {
        if (!waiters.has(resolve)) return;
        waiters.delete(resolve);
        if (waiters.size === 0) {
          discoveryMediaWaitersRef.current.delete(normalized);
        }
        resolve();
      }, 220);
    });
  }, []);

  const springDiscoveryCardHome = useCallback(async () => {
    // Use overdamped tween instead of spring — eliminates overshoot that caused
    // stamp indicators to flash the wrong direction during cancel-return.
    await Promise.all([
      animateMotionValue(dragX, 0, { type: "tween", duration: 0.32, ease: [0.25, 1, 0.35, 1] }),
      animateMotionValue(dragY, 0, { type: "tween", duration: 0.32, ease: [0.25, 1, 0.35, 1] }),
      animateMotionValue(dragRotateOverride, 0, { type: "tween", duration: 0.32, ease: [0.25, 1, 0.35, 1] }),
    ]);
    dragX.set(0);
    dragY.set(0);
    dragRotateOverride.set(0);
  }, [dragRotateOverride, dragX, dragY]);

  const flingDiscoveryCard = useCallback(
    async (direction: "left" | "right", velocityX = 0) => {
      const viewportWidth =
        typeof window !== "undefined" ? Math.max(window.innerWidth, 430) : 430;
      const travel = clamp(Math.abs(velocityX), 0, 1600);
      const targetX =
        direction === "right"
          ? viewportWidth * 1.05
          : -viewportWidth * 1.05;
      // 0.34s at max velocity, 0.42s at zero — visible but not sluggish
      const duration = clamp(0.34 + (600 - Math.min(travel, 600)) / 4000, 0.34, 0.42);
      const exitRotate = direction === "right" ? 20 : -20;
      await Promise.all([
        animateMotionValue(dragX, targetX, {
          type: "tween",
          duration,
          ease: [0.4, 0, 1, 1],
        }),
        animateMotionValue(dragY, 0, {
          type: "tween",
          duration,
          ease: [0.4, 0, 1, 1],
        }),
        animateMotionValue(dragRotateOverride, exitRotate, {
          type: "tween",
          duration,
          ease: [0.4, 0, 1, 1],
        }),
      ]);
      noteDiscoveryFlingResolved();
    },
    [dragRotateOverride, dragX, dragY]
  );

  const advanceDiscoveryCard = useCallback((currentId?: string, action?: "wave" | "star" | "pass") => {
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
  }, [discoverySessionId, handledDiscoveryKey, passedDiscoveryKey, passedDiscoverySessionKey]);

  const commitDiscoverySwipe = useCallback((direction: "left" | "right" | "star", currentId?: string, action?: "wave" | "star" | "pass") => {
    noteDiscoveryCommit();
    setSwipeDir(direction);
    advanceDiscoveryCard(currentId, action);
  }, [advanceDiscoveryCard]);

  const rollbackDiscoverySwipe = useCallback((currentId?: string, action?: "wave" | "star" | "pass") => {
    if (!currentId || action === "pass") return;
    setSwipeDir(null);
    setHandledDiscoveryIds((prev) => {
      if (!prev.has(currentId)) return prev;
      const next = new Set(prev);
      next.delete(currentId);
      try {
        localStorage.setItem(handledDiscoveryKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore cache write failure
      }
      return next;
    });
  }, [handledDiscoveryKey]);

  const performDiscoverySwipe = useCallback(
    async (
      direction: "left" | "right",
      currentId: string,
      action: "wave" | "pass",
      options?: {
        velocityX?: number;
        task?: () => Promise<boolean>;
        nextProfileId?: string | null;
        optimistic?: boolean;
        onRollback?: () => void;
      }
    ) => {
      if (discoverySwipeBusyRef.current) return false;
      setSwipeDir(direction);
      discoverySwipeBusyRef.current = true;
      setDiscoverySwipeUiBusy(true);

      try {
        // Fire the network task immediately, but don't make the deck wait for it
        // after the fling completes. That removes the "sent but stuck" feel.
        noteDiscoveryDragEnd();
        const taskPromise = options?.task ? options.task() : Promise.resolve(true);
        await flingDiscoveryCard(direction, options?.velocityX ?? 0);
        if (options?.optimistic) {
          commitDiscoverySwipe(direction, currentId, action);
          await new Promise<void>((resolve) => {
            if (typeof window === "undefined") {
              resolve();
              return;
            }
            window.requestAnimationFrame(() => resolve());
          });
          dragX.set(0);
          dragY.set(0);
          dragRotateOverride.set(0);
          const ok = await taskPromise;
          if (!ok) {
            options.onRollback?.();
          }
          return ok;
        }
        const ok = await taskPromise;
        if (!ok) {
          setSwipeDir(null);
          await springDiscoveryCardHome();
          return false;
        }
        // Commit immediately — no media-ready stall. The next card's <img> uses
        // fetchPriority="high" so it loads naturally; a brief placeholder flash is
        // better UX than a hard pause after the fling resolves.
        commitDiscoverySwipe(direction, currentId, action);
        await new Promise<void>((resolve) => {
          if (typeof window === "undefined") {
            resolve();
            return;
          }
          window.requestAnimationFrame(() => resolve());
        });
        dragX.set(0);
        dragY.set(0);
        dragRotateOverride.set(0);
        return true;
      } finally {
        discoverySwipeBusyRef.current = false;
        setDiscoverySwipeUiBusy(false);
      }
    },
    [commitDiscoverySwipe, dragRotateOverride, dragX, dragY, flingDiscoveryCard, springDiscoveryCardHome]
  );

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

  const runStarAction = useCallback(async (target: DiscoveryProfile): Promise<{ sent: boolean; roomId: string | null }> => {
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
    const result = await sendStarChat({
      senderId: profile.id,
      senderTier: profile?.tier,
      targetUserId: target.id,
      targetName: target.display_name || "Conversation",
    });
    if (result.status === "sent") {
      return { sent: true, roomId: result.roomId };
    }
    if (result.status === "exhausted") {
      if (result.upgradeTier === "gold") {
        openStarUpgradeSheet("gold");
      } else {
        toast.info(quotaConfig.copy.stars.exhausted);
      }
      return { sent: false, roomId: null };
    }
    if (result.status === "blocked") {
      toast.error("Cannot start chat with this user.");
      return { sent: false, roomId: null };
    }
    toast.error("Unable to open chat right now.");
    return { sent: false, roomId: null };
  }, [getStarRemaining, openStarUpgradeSheet, profile?.id, profile?.tier]);

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
        const roomId = result.roomId;
        const target = confirmStarTarget;
        launchDiscoverySendCue("star", {
          onCommit: () => {
            commitDiscoverySwipe("star", target.id, "star");
          },
          onComplete: () => {
            navigate(
              `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(
                target.display_name || "Conversation"
              )}&with=${encodeURIComponent(target.id)}`
            );
          },
        });
      }
      setConfirmStarTarget(null);
    } finally {
      setStarActionLoading(false);
    }
  }, [bumpDiscoverySeen, commitDiscoverySwipe, confirmStarTarget, discoverExhaustedCopy, isGoldTier, launchDiscoverySendCue, navigate, profile?.id, runStarAction, starActionLoading]);

  const handleStarUpgradeCheckout = useCallback(async () => {
    if (!starUpgradeTier || starCheckoutLoading) return;
    setStarCheckoutLoading(true);
    try {
      const selectedPlan = quotaConfig.stripePlans[starUpgradeTier][starUpgradeBilling];
      await handoffStripeCheckout({
        mode: "subscription",
        type: `${starUpgradeTier}_${starUpgradeBilling === "annual" ? "annual" : "monthly"}`,
        lookupKey: selectedPlan.lookupKey,
        priceId: selectedPlan.priceId,
        successUrl: `${window.location.origin}/premium`,
        cancelUrl: `${window.location.origin}/chats`,
      }, "chats-star-upgrade");
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

  const loadChatsGroupManageData = useCallback(async () => {
    if (!groupManageId || !profile?.id) return;
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
      setGroupMembers([{ id: profile.id, name: profile.display_name || "You", avatarUrl: profile.avatar_url || null }]);
    }
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
    try {
      const { data: waves } = await supabase
        .from("waves")
        .select("from_user_id, to_user_id")
        .or(`from_user_id.eq.${profile.id},to_user_id.eq.${profile.id}`);
      if (waves) {
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
  }, [groupManageId, profile?.avatar_url, profile?.display_name, profile?.id]);

  useEffect(() => {
    if (!groupManageId || !profile?.id) return;
    void loadChatsGroupManageData();
    let reloadTimer: ReturnType<typeof window.setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void loadChatsGroupManageData();
      }, 120);
    };
    const channel = supabase
      .channel(`group-manage-${groupManageId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_members", filter: `chat_id=eq.${groupManageId}` }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_chat_invites", filter: `chat_id=eq.${groupManageId}` }, () => {
        scheduleReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_join_requests", filter: `chat_id=eq.${groupManageId}` }, () => {
        scheduleReload();
      })
      .subscribe();
    return () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [groupManageId, loadChatsGroupManageData, profile?.id]);

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

  const sortChatUsers = useCallback((items: ChatUser[]) => {
    return [...items].sort((a, b) => {
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
  }, []);

  const sortGroups = useCallback(
    (items: Group[]) =>
      [...items].sort(
        (a, b) =>
          groupActivityRankValue(b.lastMessageAt, b.createdAt) - groupActivityRankValue(a.lastMessageAt, a.createdAt) ||
          a.name.localeCompare(b.name)
      ),
    []
  );

  const commitInboxCaches = useCallback(() => {
    setChats([...inboxCacheRef.current.friends, ...inboxCacheRef.current.service]);
    setGroups(inboxCacheRef.current.groups);
  }, []);

  const buildChatFromSummary = useCallback(
    (row: InboxSummaryRow): ChatUser | null => {
      const roomId = String(row.chat_id || "").trim();
      if (!roomId) return null;
      const roomType = String(row.room_type || "").trim();
      const isService = roomType === "service" || Boolean(row.service_status);
      const counterpartUserId = String(row.peer_user_id || "").trim() || null;
      if (!counterpartUserId) {
        console.warn("[chats.inbox] missing counterpart", roomId, row.shape_issue || null);
        return null;
      }
      rememberDirectPeer(roomId, counterpartUserId);
      if (row.shape_issue) {
        console.warn("[chats.inbox.shape_issue]", roomId, row.shape_issue);
      }
      const fallbackName = String(row.peer_name || row.chat_name || "Conversation").trim() || "Conversation";
      const counterpartSocialId = String(row.peer_social_id || "").trim() || null;
      const counterpartName =
        resolveTeamHuddleDisplayName(counterpartUserId, fallbackName, counterpartSocialId) || fallbackName;
      const isOfficialTeamHuddle =
        counterpartUserId === TEAM_HUDDLE_USER_ID ||
        isTeamHuddleIdentity(counterpartName, counterpartSocialId);
      const counterpartAvatar = resolveTeamHuddleAvatar(
        (row.peer_avatar_url as string | null) || (row.avatar_url as string | null) || null,
        counterpartName,
        counterpartSocialId
      );
      const socialAvailability = resolveTeamHuddleAvailability(
        counterpartUserId,
        counterpartName,
        counterpartSocialId,
        String(row.peer_availability_label || "Friend").trim() || "Friend"
      );
      const parsedLastMeta = parseStarChatContent(String(row.last_message_content || ""));
      const serviceRequestCard =
        row.service_request_card && typeof row.service_request_card === "object"
          ? (row.service_request_card as Record<string, unknown>)
          : null;
      const showRequesterRequestPrompt =
        Boolean(isService && row.service_requester_id === profile?.id && !serviceRequestCard);
      const previewOverride = row.blocked_by_me
        ? `You've blocked ${counterpartName}`
        : row.blocked_by_them
          ? `You're blocked by ${counterpartName}.`
          : row.unmatched_by_them
            ? "You've been unmatched."
            : showRequesterRequestPrompt
              ? "Send a request to get started!"
              : "";
      return {
        id: roomId,
        peerUserId: counterpartUserId,
        name: counterpartName,
        avatarUrl: counterpartAvatar,
        socialAvailability,
        previewOverride: previewOverride || null,
        isVerified: isOfficialTeamHuddle || row.peer_is_verified === true,
        hasCar: Boolean(row.peer_has_car),
        isPremium: false,
        lastMessage: parseChatPreviewText(String(row.last_message_content || "")),
        lastMessageAt: row.last_message_at || null,
        time: formatChatTimestamp(row.last_message_at || row.matched_at || row.created_at || null),
        lastMessageFromMe: row.last_message_sender_id === profile?.id,
        lastMessageReadByOther: row.last_message_read_by_other === true,
        unread: Number(row.unread_count ?? 0),
        type: isService ? "service" : "friend",
        isOnline: false,
        hasTransaction: false,
        matchedAt: row.matched_at || null,
        lastMessageKind: parsedLastMeta.kind,
        lastMessageStarSenderId: parsedLastMeta.senderId,
        lastMessageStarRecipientId: parsedLastMeta.recipientId,
        serviceStatus: isService ? ((row.service_status as ChatUser["serviceStatus"]) || "pending") : null,
        serviceType: isService ? String(serviceRequestCard?.serviceType || "").trim() || null : null,
        serviceDateLabel: isService ? formatServiceDateRange(serviceRequestCard) : null,
      };
    },
    [profile?.id, rememberDirectPeer]
  );

  const buildGroupFromSummary = useCallback(
    (row: InboxSummaryRow): Group | null => {
      const roomId = String(row.chat_id || "").trim();
      if (!roomId) return null;
      if (String(row.room_type || "").trim() !== "group") {
        console.warn("[chats.inbox] skipping non-group summary in group scope", roomId, row.room_type || null);
        return null;
      }
      if (row.shape_issue) {
        console.warn("[chats.inbox.shape_issue]", roomId, row.shape_issue);
      }
      return {
        id: roomId,
        name: String(row.chat_name || "Group"),
        avatarUrl: (row.avatar_url as string | null) ?? null,
        avatar_url: (row.avatar_url as string | null) ?? null,
        memberCount: Number(row.member_count ?? 0),
        lastMessage: parseChatPreviewText(String(row.last_message_content || "")),
        lastMessageSender:
          row.last_message_sender_id === profile?.id
            ? "You"
            : String(row.last_message_sender_name || "").trim(),
        time: formatChatTimestamp(row.last_message_at || row.created_at || null),
        lastMessageFromMe: row.last_message_sender_id === profile?.id,
        lastMessageReadByOther: row.last_message_read_by_other === true,
        unread: Number(row.unread_count ?? 0),
        petFocus: Array.isArray(row.pet_focus) ? row.pet_focus : null,
        locationLabel: (row.location_label as string | null) ?? null,
        lastMessageAt: row.last_message_at || null,
        joinMethod: (row.join_method as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        isAdmin: (row.created_by as string | null) === profile?.id,
        locationCountry: (row.location_country as string | null) ?? null,
        visibility: ((row.visibility as "public" | "private" | null) ?? null),
        roomCode: (row.room_code as string | null) ?? null,
        createdAt: row.created_at || null,
      };
    },
    [profile?.id]
  );

  const fetchInboxSummaryRows = useCallback(
    async (scope: InboxScope = "all", chatIds?: string[]) => {
      if (!profile?.id) return [] as InboxSummaryRow[];
      const payload = {
        p_scope: scope,
        p_chat_ids: chatIds && chatIds.length > 0 ? chatIds : null,
      };
      const { data, error } = await (supabase.rpc as (
        fn: string,
        params?: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_chat_inbox_summaries", payload);
      if (error) throw error;
      return Array.isArray(data) ? (data as InboxSummaryRow[]) : [];
    },
    [profile?.id]
  );

  const refreshMatchOnlyAvatars = useCallback(
    async (friendChats: ChatUser[]) => {
      if (!profile?.id) return;
      const matchesRows = await fetchUserMatches();
      const counterpartIds = Array.from(
        new Set(
          matchesRows
            .map((row) => (row.user1_id === profile.id ? row.user2_id : row.user1_id))
            .filter((id) => Boolean(id) && id !== profile.id)
        )
      );
      if (counterpartIds.length === 0) {
        setMatchOnlyAvatars([]);
        return;
      }
      const counterpartInActiveConversations = new Set(
        friendChats
          .filter((chat) => Boolean(chat.lastMessageAt) || parseChatPreviewText(chat.lastMessage).length > 0)
          .map((chat) => String(chat.peerUserId || "").trim())
          .filter(Boolean)
      );
      const profileById = new Map<string, Record<string, unknown>>();
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, is_verified, has_car, social_album, social_id")
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
          .select("id, display_name, avatar_url, is_verified, has_car")
          .in("id", unresolvedIds);
        if (Array.isArray(publicRows)) {
          for (const row of publicRows as Array<Record<string, unknown>>) {
            const rowId = String(row.id || "");
            if (rowId) profileById.set(rowId, row);
          }
        }
      }
      const avatarCandidates = new Map<string, MatchOnlyAvatar>();
      for (const row of matchesRows) {
        const counterpart = row.user1_id === profile.id ? row.user2_id : row.user1_id;
        if (!counterpart || counterpart === profile.id) continue;
        if (counterpartInActiveConversations.has(counterpart)) continue;
        const profileRow = (profileById.get(counterpart) || {}) as Record<string, unknown>;
        const displayName = String(profileRow.display_name || "User");
        const socialId =
          typeof profileRow.social_id === "string" && profileRow.social_id.trim().length > 0
            ? profileRow.social_id
            : null;
        const isOfficialTeamHuddle =
          counterpart === TEAM_HUDDLE_USER_ID ||
          isTeamHuddleIdentity(displayName, socialId);
        const socialAlbumFallback = Array.isArray(profileRow.social_album)
          ? String((profileRow.social_album as unknown[])[0] || "").trim()
          : "";
        avatarCandidates.set(counterpart, {
          userId: counterpart,
          name: resolveTeamHuddleDisplayName(counterpart, displayName, socialId) || displayName,
          avatarUrl: resolveTeamHuddleAvatar(
            (profileRow.avatar_url as string | null) || socialAlbumFallback || null,
            displayName,
            socialId
          ),
          isVerified: isOfficialTeamHuddle || profileRow.is_verified === true,
          hasCar: Boolean(profileRow.has_car),
          matchedAt: row.matched_at || null,
        });
      }
      setMatchOnlyAvatars(Array.from(avatarCandidates.values()).slice(0, 12));
    },
    [fetchUserMatches, profile?.id]
  );

  const scheduleMatchOnlyAvatarRefresh = useCallback((friendChats: ChatUser[]) => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      void refreshMatchOnlyAvatars(friendChats);
    }, 0);
  }, [refreshMatchOnlyAvatars]);

  const applyInboxRowsToCaches = useCallback(
    (scope: InboxScope, rows: InboxSummaryRow[], targetedRoomIds?: string[]) => {
      const nextFriends: ChatUser[] = [];
      const nextService: ChatUser[] = [];
      const nextGroups: Group[] = [];
      for (const row of rows) {
        const roomType = String(row.room_type || "").trim();
        if (roomType === "group") {
          const group = buildGroupFromSummary(row);
          if (group) nextGroups.push(group);
          continue;
        }
        const chat = buildChatFromSummary(row);
        if (!chat) continue;
        if (chat.type === "service") {
          nextService.push(chat);
        } else {
          nextFriends.push(chat);
        }
      }

      const mergeById = <T extends { id: string }>(existing: T[], incoming: T[], sortFn: (items: T[]) => T[]) => {
        if (!targetedRoomIds || targetedRoomIds.length === 0) return sortFn(incoming);
        const map = new Map<string, T>();
        for (const item of existing) {
          if (!targetedRoomIds.includes(item.id)) map.set(item.id, item);
        }
        for (const item of incoming) {
          map.set(item.id, item);
        }
        return sortFn(Array.from(map.values()));
      };

      if (scope === "all" || scope === "friends") {
        inboxCacheRef.current.friends = mergeById(
          inboxCacheRef.current.friends,
          nextFriends,
          sortChatUsers
        );
        inboxLoadedScopesRef.current.add("friends");
      }
      if (scope === "all" || scope === "service") {
        inboxCacheRef.current.service = mergeById(
          inboxCacheRef.current.service,
          nextService,
          sortChatUsers
        );
        inboxLoadedScopesRef.current.add("service");
      }
      if (scope === "all" || scope === "groups") {
        inboxCacheRef.current.groups = mergeById(
          inboxCacheRef.current.groups,
          nextGroups,
          sortGroups
        );
        inboxLoadedScopesRef.current.add("groups");
      }
      commitInboxCaches();
    },
    [buildChatFromSummary, buildGroupFromSummary, commitInboxCaches, sortChatUsers, sortGroups]
  );

  const loadConversations = useCallback(
    async (scope: InboxScope = "all") => {
      if (!profile?.id) return;
      try {
        const rows = await fetchInboxSummaryRows(scope);
        applyInboxRowsToCaches(scope, rows);
        if (scope === "all" || scope === "friends") {
          const friendChats =
            scope === "all"
              ? inboxCacheRef.current.friends
              : sortChatUsers(
                  rows
                    .map((row) => (String(row.room_type || "").trim() === "group" ? null : buildChatFromSummary(row)))
                    .filter((row): row is ChatUser => Boolean(row) && row.type === "friend")
                );
          scheduleMatchOnlyAvatarRefresh(friendChats);
        }
        conversationsHydratedRef.current = true;
      } catch {
        if (!conversationsHydratedRef.current) {
          if (conversationsRetryTimerRef.current == null) {
            conversationsRetryTimerRef.current = window.setTimeout(() => {
              conversationsRetryTimerRef.current = null;
              void loadConversations(scope);
            }, 650);
          }
          return;
        }
        toast.error("Failed to load conversations");
      }
    },
    [applyInboxRowsToCaches, buildChatFromSummary, fetchInboxSummaryRows, profile?.id, scheduleMatchOnlyAvatarRefresh, sortChatUsers]
  );

  const refreshRoomSummaries = useCallback(
    async (roomIds: string[]) => {
      const nextRoomIds = Array.from(new Set(roomIds.map((id) => String(id || "").trim()).filter(Boolean)));
      if (!profile?.id || nextRoomIds.length === 0) return;
      try {
        const rows = await fetchInboxSummaryRows("all", nextRoomIds);
        applyInboxRowsToCaches("all", rows, nextRoomIds);
        if (rows.some((row) => String(row.room_type || "").trim() !== "group")) {
          scheduleMatchOnlyAvatarRefresh(inboxCacheRef.current.friends);
        }
      } catch (error) {
        console.warn("[chats.inbox] room summary refresh failed", error);
      }
    },
    [applyInboxRowsToCaches, fetchInboxSummaryRows, profile?.id, scheduleMatchOnlyAvatarRefresh]
  );

  const flushDirtyRoomSummaries = useCallback(async () => {
    if (dirtyRoomFlushTimerRef.current != null) {
      window.clearTimeout(dirtyRoomFlushTimerRef.current);
      dirtyRoomFlushTimerRef.current = null;
    }
    const roomIds = Array.from(dirtyRoomIdsRef.current);
    dirtyRoomIdsRef.current.clear();
    if (roomIds.length === 0) return;
    await refreshRoomSummaries(roomIds);
  }, [refreshRoomSummaries]);

  const queueDirtyRoomSummaryRefresh = useCallback(
    (roomId: string | null | undefined) => {
      const normalized = String(roomId || "").trim();
      if (!normalized) return;
      dirtyRoomIdsRef.current.add(normalized);
      if (dirtyRoomFlushTimerRef.current != null) return;
      dirtyRoomFlushTimerRef.current = window.setTimeout(() => {
        void flushDirtyRoomSummaries();
      }, 120);
    },
    [flushDirtyRoomSummaries]
  );

  useEffect(() => {
    if (authLoading || !profile?.id) return;
    const shouldHydrateDiscoverInbox =
      topTab !== "chats" &&
      (!inboxLoadedScopesRef.current.has("friends") || !inboxLoadedScopesRef.current.has("groups"));
    if (shouldHydrateDiscoverInbox) {
      void loadConversations("all");
    } else if (!inboxLoadedScopesRef.current.has(mainTab)) {
      void loadConversations(mainTab);
    }
    if (inboxWarmTimerRef.current != null) {
      window.clearTimeout(inboxWarmTimerRef.current);
    }
    inboxWarmTimerRef.current = window.setTimeout(() => {
      const inactiveScopes = (["friends", "groups", "service"] as const).filter(
        (scope) => (topTab !== "chats" || scope !== mainTab) && !inboxLoadedScopesRef.current.has(scope)
      );
      void (async () => {
        for (const scope of inactiveScopes) {
          await loadConversations(scope);
        }
      })();
    }, 260);
    return () => {
      if (conversationsRetryTimerRef.current != null) {
        window.clearTimeout(conversationsRetryTimerRef.current);
        conversationsRetryTimerRef.current = null;
      }
      if (inboxWarmTimerRef.current != null) {
        window.clearTimeout(inboxWarmTimerRef.current);
        inboxWarmTimerRef.current = null;
      }
      if (dirtyRoomFlushTimerRef.current != null) {
        window.clearTimeout(dirtyRoomFlushTimerRef.current);
        dirtyRoomFlushTimerRef.current = null;
      }
    };
  }, [authLoading, loadConversations, mainTab, profile?.id, topTab]);

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
      setDiscoveryLoadSettled(false);
      if (!discoverLocationGate.canShowDiscover || !discoverLocationGate.anchor) {
        setDiscoveryAnchor(null);
        setDiscoveryProfiles([]);
        setDiscoveryLoading(false);
        setDiscoveryLoadSettled(true);
        return;
      }
      setDiscoveryLoading(true);
      const anchor = discoverLocationGate.anchor;
      setDiscoveryAnchor(anchor);
      try {
        setDiscoveryVisibleCount(20);
        const wavedByUserIds = new Set<string>();
        if (debouncedFilters.whoWavedAtMe) {
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
            isPremium && (debouncedFilters.heightMin > DEFAULT_FILTERS.heightMin || debouncedFilters.heightMax < DEFAULT_FILTERS.heightMax);
          const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
            "social_discovery_restricted",
            {
              p_user_id: profile.id,
              p_lat: anchor.lat,
              p_lng: anchor.lng,
              p_radius_m: pinRadiusM,
              p_min_age: Math.max(16, debouncedFilters.ageMin || 16),
              p_max_age: Math.max(Math.max(16, debouncedFilters.ageMin || 16), debouncedFilters.ageMax || 99),
              p_role: null,
              p_gender: debouncedFilters.genders.length === 1 ? debouncedFilters.genders[0] ?? null : null,
              p_species: debouncedFilters.species.length === ALL_SPECIES.length ? null : debouncedFilters.species,
              p_pet_size: null,
              p_advanced: isPremium,
              p_height_min: hasExplicitHeightFilter ? debouncedFilters.heightMin : null,
              p_height_max: hasExplicitHeightFilter ? debouncedFilters.heightMax : null,
              p_only_waved: debouncedFilters.whoWavedAtMe,
              p_active_only: debouncedFilters.activeOnly,
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
              .select("id, pet_experience, degree, languages, height, has_car, verification_status, is_verified, relationship_status, orientation, gender_genre, availability_status, last_active_at, updated_at, created_at, last_lat, last_lng, location_name, location_district, location_country")
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
          console.warn("[Chats] social_discovery_restricted rpc unavailable", edgeErr);
          setDiscoveryProfiles([]);
          return;
        }
        const mergedList = applyDiscoveryClientFilters(Array.from(mergedProfiles.values()), {
          ...debouncedFilters,
          maxDistanceKm: effectiveDiscoveryDistanceKm,
        }, {
          enforceVerifiedOnly: debouncedFilters.verifiedOnly,
          enforceActiveOnly: debouncedFilters.activeOnly,
          wavedByUserIds,
          anchor,
          viewerCountry: profile.location_country ?? null,
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
        setDiscoveryLoadSettled(true);
      }
    };
    runDiscovery();
  }, [
    discoveryHistoryHydrated,
    fetchUserMatches,
    profile?.id,
    profile?.location_country,
    discoverLocationGate.anchor,
    discoverLocationGate.canShowDiscover,
    debouncedFilters,
    effectiveDiscoveryDistanceKm,
    isPremium,
    effectiveTier,
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
      const resolved = await Promise.all(
        discoveryProfiles.map(async (profile) => {
          const album = canonicalizeSocialAlbumEntries(Array.isArray(profile?.social_album) ? profile.social_album : []);
          if (!album.length) {
            markDiscoveryMediaReady(profile.id, { urlsReady: true });
            return [profile.id, []] as const;
          }
          const urls = await resolveSocialAlbumUrlList(album, 60 * 60);
          markDiscoveryMediaReady(profile.id, { urlsReady: true });
          return [profile.id, urls] as const;
        })
      );
      const next: Record<string, string[]> = Object.fromEntries(
        resolved.filter(([, urls]) => Array.isArray(urls) && urls.length > 0)
      );
      if (Object.keys(next).length > 0) {
        setAlbumUrls((prev) => ({ ...prev, ...next }));
      }
    };
    void loadAlbums();
  }, [discoveryProfiles, markDiscoveryMediaReady]);

  const markChatMessagesRead = useCallback(
    async (
      roomId: string,
      roomMessages?: Array<{ id: string; sender_id: string; content: string; created_at: string }>
    ) => {
      if (!profile?.id || !roomId) return;

      const sourceMessages =
        roomMessages ||
        (((await supabase
          .from("chat_messages")
          .select("id, sender_id, content, created_at")
          .eq("chat_id", roomId)
          .order("created_at", { ascending: true }))?.data || []) as Array<{
          id: string;
          sender_id: string;
          content: string;
          created_at: string;
        }>);

      const incomingIds = sourceMessages
        .filter((message) => message.sender_id && message.sender_id !== profile.id)
        .map((message) => message.id)
        .filter(Boolean);

      if (incomingIds.length === 0) return;

      const { data: existingReads, error: readsError } = await supabase
        .from("message_reads")
        .select("message_id")
        .eq("user_id", profile.id)
        .in("message_id", incomingIds);

      if (readsError) {
        console.warn("[chats.mark_read.load_failed]", readsError.message);
        return;
      }

      const existingSet = new Set(
        ((existingReads || []) as Array<{ message_id?: string | null }>)
          .map((row) => String(row?.message_id || ""))
          .filter(Boolean)
      );

      const missingRows = incomingIds
        .filter((messageId) => !existingSet.has(messageId))
        .map((messageId) => ({
          message_id: messageId,
          user_id: profile.id,
          read_at: new Date().toISOString(),
        }));

      if (missingRows.length === 0) return;

      const { error: upsertError } = await supabase
        .from("message_reads")
        .upsert(missingRows, { onConflict: "message_id,user_id" });

      if (upsertError) {
        console.warn("[chats.mark_read.upsert_failed]", upsertError.message);
      }
    },
    [profile?.id]
  );

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
    const nextMessages = (data || []) as { id: string; sender_id: string; content: string; created_at: string }[];
    setActiveRoomMessages(nextMessages);
    void markChatMessagesRead(roomId, nextMessages);
  }, [markChatMessagesRead]);
  const subscribedInboxRoomIds = useMemo(
    () =>
      Array.from(
        new Set(
          [...chats.map((chat) => String(chat.id || "").trim()), ...groups.map((group) => String(group.id || "").trim())].filter(Boolean)
        )
      ).sort(),
    [chats, groups]
  );

  useEffect(() => {
    if (!profile?.id || subscribedInboxRoomIds.length === 0) return;
    const channel = supabase
      .channel(`chats_messages_${profile.id}`);
    subscribedInboxRoomIds.forEach((roomId) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${roomId}` },
        (payload) => {
          const row = ((payload.new || payload.old || null) as { chat_id?: string | null } | null);
          queueDirtyRoomSummaryRefresh(row?.chat_id || roomId);
        }
      );
    });
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, queueDirtyRoomSummaryRefresh, subscribedInboxRoomIds]);

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

  const syncGroupRowIntoState = useCallback((row: GroupMetadataRow) => {
    const apply = (group: Group) =>
      group.id === row.id
        ? {
            ...group,
            avatarUrl: row.avatar_url ?? null,
            avatar_url: row.avatar_url ?? null,
            description: row.description ?? null,
            locationLabel: row.location_label ?? null,
            locationCountry: row.location_country ?? null,
            petFocus: row.pet_focus ?? null,
            joinMethod: row.join_method ?? null,
            visibility: row.visibility ?? null,
            roomCode: row.room_code ?? null,
            createdAt: row.created_at ?? null,
            lastMessageAt: row.last_message_at ?? group.lastMessageAt ?? null,
            memberCount: Number(row.member_count ?? group.memberCount ?? 0),
            isAdmin: group.isAdmin || row.created_by === profile?.id,
          }
        : group;
    inboxCacheRef.current.groups = sortGroups(inboxCacheRef.current.groups.map(apply));
    commitInboxCaches();
    setExploreGroups((prev) => prev.map(apply));
    setInvitedExploreGroups((prev) => prev.map(apply));
  }, [commitInboxCaches, profile?.id, sortGroups]);

  const filteredGroups = useMemo(() => {
    const loweredQuery = searchQuery.trim().toLowerCase();
    return [...groups]
      .filter((group) =>
        !loweredQuery ||
        group.name.toLowerCase().includes(loweredQuery) ||
        group.lastMessage.toLowerCase().includes(loweredQuery) ||
        String(group.description || "").toLowerCase().includes(loweredQuery)
      )
      .sort(
        (a, b) =>
          groupActivityRankValue(b.lastMessageAt, b.createdAt) - groupActivityRankValue(a.lastMessageAt, a.createdAt) ||
          a.name.localeCompare(b.name)
      );
  }, [groups, searchQuery]);

  const totalUnreadMessages = useMemo(
    () => chats.reduce((sum, chat) => sum + Math.max(0, chat.unread || 0), 0) + groups.reduce((sum, group) => sum + Math.max(0, group.unread || 0), 0),
    [chats, groups]
  );
  useEffect(() => {
    if (!groupManageId) {
      setGroupDescriptionEditing(false);
      setGroupDescriptionDraft("");
      return;
    }
    const selected = groups.find((group) => group.id === groupManageId) || null;
    setGroupDescriptionEditing(false);
    setGroupDescriptionDraft(selected?.description || "");
  }, [groupManageId, groups]);

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
    setShowChatsToggleDot(topTab !== "chats" && totalUnreadMessages > 0);
  }, [topTab, totalUnreadMessages]);

  const baseDiscoverySource = useMemo(
    () =>
      discoveryProfiles.filter(
        (p) =>
          !hiddenDiscoveryIds.has(p.id) &&
          !blockedUserIds.has(p.id) &&
          !handledDiscoveryIds.has(p.id) &&
          !strictMatchedDiscoveryIds.has(p.id)
      ),
    [blockedUserIds, discoveryProfiles, handledDiscoveryIds, hiddenDiscoveryIds, strictMatchedDiscoveryIds]
  );
  const visibleDiscoverySource = useMemo(
    () => baseDiscoverySource.filter((p) => !passedDiscoveryIds.has(p.id)),
    [baseDiscoverySource, passedDiscoveryIds]
  );
  const carryoverQueue = useMemo(
    () => visibleDiscoverySource.filter((p) => carryoverPassedIds.has(p.id)),
    [carryoverPassedIds, visibleDiscoverySource]
  );
  const primaryQueue = useMemo(
    () => visibleDiscoverySource.filter((p) => !carryoverPassedIds.has(p.id)),
    [carryoverPassedIds, visibleDiscoverySource]
  );
  const discoverySource = useMemo(
    () => (silentGoldDiscoveryCapReached ? [] : [...primaryQueue, ...carryoverQueue]),
    [carryoverQueue, primaryQueue, silentGoldDiscoveryCapReached]
  );
  const discoveryDeck = useMemo(
    () => discoverySource.slice(0, discoveryVisibleCount),
    [discoverySource, discoveryVisibleCount]
  );
  const stackedDiscoveryCards = useMemo(
    () => discoveryDeck.slice(0, 2),
    [discoveryDeck]
  );
  const currentDiscovery = stackedDiscoveryCards[0] ?? null;
  const showDiscoverEmpty = discoveryLoadSettled && !discoveryLoading && !currentDiscovery && !discoveryLocationBlocked;
  const pendingDiscoverEmpty = Boolean(
    currentDiscovery &&
      stackedDiscoveryCards.length === 1 &&
      discoverySwipeUiBusy &&
      swipeDir
  );
  const renderDiscoverEmpty = showDiscoverEmpty || pendingDiscoverEmpty;

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

  const getDiscoverySpeciesSummary = useCallback((profileRow: DiscoveryProfile) => {
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
    const speciesMap = new Map<string, string>();
    for (const raw of (Array.isArray(profileRow?.pets) ? profileRow.pets.map((pet: { species?: string | null }) => String(pet.species || "").trim()) : [])
      .concat(Array.isArray(profileRow?.pet_species) ? profileRow.pet_species.map((value) => String(value || "").trim()) : [])
      .concat(Array.isArray(profileRow?.pet_experience) ? profileRow.pet_experience.map((value) => String(value || "").trim()) : [])) {
      const key = normalizeSpeciesKey(raw);
      if (!key || speciesMap.has(key)) continue;
      speciesMap.set(key, toDisplaySpecies(key));
    }
    return Array.from(speciesMap.values()).join(" • ");
  }, []);

  const getDiscoveryAvailabilityPills = useCallback(
    (profileRow: DiscoveryProfile) =>
      Array.isArray(profileRow?.availability_status)
        ? profileRow.availability_status
            .map((value) => normalizeAvailabilityLabel(String(value || "").trim()))
            .filter(Boolean)
        : [],
    []
  );

  useEffect(() => {
    dragX.set(0);
    dragY.set(0);
    dragRotateOverride.set(0);
    discoverySwipeBusyRef.current = false;
    setDiscoverySwipeUiBusy(false);
  }, [currentDiscovery?.id, dragRotateOverride, dragX, dragY]);

  const refreshDiscovery = useCallback(() => {
    setSwipeDir(null);
    dragX.set(0);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [dragX, dragY]);

  const handleExpandSearch = useCallback(() => {
    if (!canExpandSearch) return;
    setExpandedDistanceKm((prev) => {
      const base = prev === null ? Math.max(1, Math.round(filters.maxDistanceKm || 5)) : prev;
      return Math.min(DISCOVERY_MAX_RADIUS_KM, base + DISCOVERY_EXPAND_STEP_KM);
    });
    setSwipeDir(null);
    dragX.set(0);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [canExpandSearch, dragX, dragY, filters.maxDistanceKm]);

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
    dragX.set(0);
    dragY.set(0);
    setDiscoveryRefreshTick((tick) => tick + 1);
  }, [dragX, dragY, passedDiscoveryKey, passedDiscoverySessionKey]);

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
      void markChatMessagesRead(roomId);
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
  }, [markChatMessagesRead, markMatchSeen, matchModal, matchQuickHello, navigate, openingMatchChat, profile?.id, rememberDirectPeer]);

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
      void loadConversations("friends");
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

  const finalizeDiscoveryMatch = useCallback(
    (target: DiscoveryProfile, matchCreated: boolean) => {
      persistMatchedDiscoveryUser(target.id);
      setHiddenDiscoveryIds((prev) => {
        const next = new Set(prev);
        next.add(target.id);
        return next;
      });
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(18);
      }
      window.setTimeout(() => {
        void (async () => {
          const roomId = await openMatchModalFor({
            userId: target.id,
            name: target.display_name || "Conversation",
            avatarUrl: target.avatar_url || null,
          });
          if (roomId && matchCreated) {
            const currentName = profile?.display_name || "Someone";
            const targetName = target.display_name || "Someone";
            void enqueueChatNotification({
              userId: target.id,
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
                href: `/chat-dialogue?room=${roomId}&with=${target.id}`,
                data: { room_id: roomId, from_user_id: target.id, type: "match" },
              });
            }
          }
        })();
      }, 180);
    },
    [enqueueChatNotification, openMatchModalFor, persistMatchedDiscoveryUser, profile?.display_name, profile?.id]
  );

  const executeDiscoveryWaveTask = useCallback(
    async (target: DiscoveryProfile, showToast: boolean) => {
      const ok = await bumpDiscoverySeen();
      if (!ok) {
        if (!isGoldTier) {
          toast.info(discoverExhaustedCopy);
        }
        return false;
      }
      const result = await sendDiscoveryWave(target.id, { showToast });
      if (result.status === "sent" && !result.mutual) {
        void enqueueChatNotification({
          userId: target.id,
          kind: "wave",
          title: "New wave",
          body: "Someone just waved at you 👋",
          href: "/chats?tab=discover",
          data: { from_user_id: profile?.id, type: "wave" },
        });
      }
      if (result.status === "sent" || result.status === "duplicate") {
        if (result.mutual) {
          finalizeDiscoveryMatch(target, result.matchCreated);
        }
        return true;
      }
      toast.error("Failed to send wave");
      return false;
    },
    [
      bumpDiscoverySeen,
      discoverExhaustedCopy,
      enqueueChatNotification,
      finalizeDiscoveryMatch,
      isGoldTier,
      profile?.id,
      sendDiscoveryWave,
    ]
  );

  const triggerDiscoveryWave = useCallback(
    async (target: DiscoveryProfile, velocityXOrOptions?: number | { velocityX?: number; showToast?: boolean }) => {
      if (blockedUserIds.has(target.id)) return false;
      // Accept either a raw velocityX number (from onSwipeRight drag) or an options object (from button)
      const velocityX = typeof velocityXOrOptions === "number" ? velocityXOrOptions : (velocityXOrOptions?.velocityX ?? 0);
      const showToast = typeof velocityXOrOptions === "object" ? (velocityXOrOptions?.showToast ?? true) : true;
      return performDiscoverySwipe("right", target.id, "wave", {
        velocityX,
        nextProfileId: stackedDiscoveryCards[1]?.id ?? null,
        optimistic: true,
        onRollback: () => rollbackDiscoverySwipe(target.id, "wave"),
        task: async () => {
          launchDiscoverySendCue("wave");
          const ok = await executeDiscoveryWaveTask(target, showToast);
          return ok;
        },
      });
    },
    [blockedUserIds, executeDiscoveryWaveTask, launchDiscoverySendCue, performDiscoverySwipe, rollbackDiscoverySwipe, stackedDiscoveryCards]
  );

  const triggerDiscoveryPass = useCallback(
    async (target: DiscoveryProfile, velocityX = 0) => {
      if (blockedUserIds.has(target.id)) return false;
      return performDiscoverySwipe("left", target.id, "pass", {
        velocityX,
        nextProfileId: stackedDiscoveryCards[1]?.id ?? null,
      });
    },
    [blockedUserIds, performDiscoverySwipe, stackedDiscoveryCards]
  );

  const promptDiscoveryStar = useCallback(
    (target: DiscoveryProfile) => {
      if (!profile?.id) return;
      if (blockedUserIds.has(target.id)) return;
      setConfirmStarTarget(target);
    },
    [blockedUserIds, profile?.id]
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
      void loadConversations("friends");
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
      void (async () => {
        const canonicalRoomId = openUserId ? (await ensureDirectRoom(openUserId, openUserName)) || openRoomId : openRoomId;
        void markChatMessagesRead(canonicalRoomId);
        navigate(
          `/chat-dialogue?room=${encodeURIComponent(canonicalRoomId)}&name=${encodeURIComponent(openUserName)}${
            openUserId ? `&with=${encodeURIComponent(openUserId)}` : ""
          }`,
          { replace: true }
        );
      })();
      return;
    }

    if (!openUserId || openUserId === profile.id) return;
    void (async () => {
      try {
        const roomId = await ensureDirectRoom(openUserId, openUserName);
        if (!roomId) return;
        void markChatMessagesRead(roomId);
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
  }, [ensureDirectRoom, isVerified, markChatMessagesRead, navigate, profile?.id, searchParams]);

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
      await refreshRoomSummaries([activeRoomId]);
    } catch {
      toast.error("Failed to send message");
      setChatInput(text);
    } finally {
      setChatSending(false);
    }
  }, [activeRoomId, chatInput, chatSending, loadRoomMessages, profile?.id, refreshRoomSummaries]);

  const handleCreateGroup = () => {
    if (!isVerified) {
      setGroupVerifyGateOpen(true);
      return;
    }
    setIsCreateGroupOpen(true);
  };

  const handleGroupCreated = (chatId: string) => {
    void loadConversations("groups");
    navigate(`/chat-dialogue?room=${encodeURIComponent(chatId)}`);
  };

  const joinedGroupIdsKey = useMemo(
    () =>
      groups
        .map((group) => String(group.id || "").trim())
        .filter(Boolean)
        .sort()
        .join(","),
    [groups]
  );

  const fetchExploreGroups = useCallback(async () => {
    setExploreLoading(true);
    try {
      const [{ data: requestRows }, invitePreviewResult, publicGroupsResult, liveLocationResult, profileLocationResult] = await Promise.all([
        user?.id
          ? supabase
              .from("group_join_requests")
              .select("chat_id")
              .eq("user_id", user.id)
              .eq("status", "pending")
          : Promise.resolve({ data: [] }),
        user?.id
          ? (supabase.rpc as (
              fn: string,
              params?: Record<string, unknown>
            ) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_group_invite_previews", {
              p_user_id: user.id,
            })
          : Promise.resolve({ data: [] as unknown[], error: null }),
        user?.id
          ? (supabase.rpc as (
              fn: string,
              params?: Record<string, unknown>
            ) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_public_groups_for_viewer")
          : Promise.resolve({ data: [] }),
        user?.id
          ? supabase
              .from("user_locations")
              .select("location_name")
              .eq("user_id", user.id)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        user?.id
          ? supabase
              .from("profiles")
              .select("location_name, location_country, location_district, location_pinned_until")
              .eq("id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (requestRows) {
        setSentJoinRequests(new Set((requestRows as Array<{ chat_id: string }>).map((r) => r.chat_id)));
      }

      if (invitePreviewResult.error) throw invitePreviewResult.error;
      if (publicGroupsResult.error) throw publicGroupsResult.error;

      const invitePreviewRows = Array.isArray(invitePreviewResult.data)
        ? (invitePreviewResult.data as Array<Record<string, unknown>>)
        : [];

      const inviteMap = new Map<string, PendingGroupInvite>();
      for (const row of invitePreviewRows) {
        const chatId = String(row.chat_id || "").trim();
        if (!chatId) continue;
        inviteMap.set(chatId, {
          inviteId: String(row.invite_id || ""),
          chatId,
          chatName: String(row.chat_name || "Group"),
          inviterName: String(row.inviter_name || "Someone"),
          createdAt: typeof row.created_at === "string" ? row.created_at : null,
        });
      }

      const profileLocation = (profileLocationResult.data || null) as {
        location_name?: string | null;
        location_country?: string | null;
        location_district?: string | null;
        location_pinned_until?: string | null;
      } | null;
      const profilePinnedUntilMs = profileLocation?.location_pinned_until ? new Date(profileLocation.location_pinned_until).getTime() : Number.NaN;
      const pinActive = Number.isFinite(profilePinnedUntilMs) && profilePinnedUntilMs > Date.now();
      const viewerCountry = resolveCountryByPrecedence({
        gpsCountry: null,
        gpsLocationName: (liveLocationResult.data as { location_name?: string | null } | null)?.location_name || null,
        pinCountry: pinActive ? profileLocation?.location_country || null : null,
        pinLocationName: pinActive ? profileLocation?.location_name || null : null,
        profileCountry: profileLocation?.location_country || profile?.location_country || null,
        profileLocationName: profileLocation?.location_name || profile?.location_name || null,
      });
      const viewerDistrict = resolveDiscoveryLocationLabel({
        liveLocationDistrict: extractDistrictToken((liveLocationResult.data as { location_name?: string | null } | null)?.location_name || null),
        pinDistrict: pinActive ? extractDistrictToken(profileLocation?.location_name || null) : null,
        profileLocationDistrict: profileLocation?.location_district || profile?.location_district || null,
        profileLocationName: profileLocation?.location_name || profile?.location_name || null,
      });

      const rows: Array<{
        id: string;
        name: string;
        avatar_url: string | null;
        location_label: string | null;
        location_country: string | null;
        pet_focus: string[] | null;
        join_method: string;
        last_message_at: string | null;
        created_at: string;
        description: string | null;
        member_count: number | null;
        created_by: string | null;
      }> = Array.isArray(publicGroupsResult.data) ? (publicGroupsResult.data as typeof rows) : [];

      const inviteChatRows: typeof rows = invitePreviewRows.map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: String(record.chat_id || ""),
          name: String(record.chat_name || "Group"),
          avatar_url: (record.avatar_url as string | null) ?? null,
          location_label: (record.location_label as string | null) ?? null,
          location_country: normalizeCountryKey((record.location_country as string | null) ?? null) || null,
          pet_focus: Array.isArray(record.pet_focus) ? (record.pet_focus as string[]) : null,
          join_method: String(record.join_method || "request"),
          last_message_at: (record.last_message_at as string | null) ?? null,
          created_at: String(record.created_at || ""),
          description: (record.description as string | null) ?? null,
          member_count: Number(record.member_count ?? 0),
          created_by: (record.created_by as string | null) ?? null,
          visibility: ((record.visibility as "public" | "private" | null) ?? null),
          room_code: (record.room_code as string | null) ?? null,
        };
      }).filter((row) => row.id);

      const joinedIds = new Set(joinedGroupIdsKey ? joinedGroupIdsKey.split(",") : []);

      // Client-side ranking: proximity (0|4) + pet relevance (0|1|3)×3 + activity (0–2)
      const userSpecies: string[] = (
        (Array.isArray(profile?.pets) ? profile.pets : []) as Array<{ species?: string }>
      )
        .map((p) => (p.species ?? "").toLowerCase())
        .filter(Boolean);

      // Extract meaningful location tokens from user's profile location for proximity matching
      const userLocWords = String(viewerDistrict || "")
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((w) => w.length > 2);

      const toGroup = (
        g: {
          id: string;
          name: string;
          avatar_url: string | null;
          location_label: string | null;
          location_country: string | null;
          pet_focus: string[] | null;
          join_method: string;
          last_message_at: string | null;
          created_at: string;
          description: string | null;
          member_count: number | null;
          created_by: string | null;
          visibility?: "public" | "private" | null;
          room_code?: string | null;
        },
        score = 0,
      ): Group => ({
        id: g.id,
        inviteId: inviteMap.get(g.id)?.inviteId || null,
        name: g.name,
        avatarUrl: g.avatar_url,
        avatar_url: g.avatar_url,
        memberCount: Number(g.member_count ?? 0),
        lastMessage: "",
        lastMessageSender: "",
        time: formatChatTimestamp(g.last_message_at || g.created_at || null),
        unread: 0,
        invitePending: inviteMap.has(g.id),
        inviterName: inviteMap.get(g.id)?.inviterName || null,
        petFocus: g.pet_focus ?? null,
        locationLabel: g.location_label ?? null,
        lastMessageAt: g.last_message_at ?? null,
        joinMethod: g.join_method ?? "request",
        description: g.description ?? null,
        isAdmin: g.created_by === profile?.id,
        locationCountry: g.location_country ?? null,
        visibility: g.visibility ?? "public",
        roomCode: g.room_code ?? null,
        createdAt: g.created_at || null,
        _score: score,
      });

      const invitedGroups = inviteChatRows
        .filter((g) => !joinedIds.has(g.id))
        .map((g) => toGroup(g, Number.MAX_SAFE_INTEGER));

      const invitedIds = new Set(invitedGroups.map((group) => group.id));

      const scored = rows
        .filter((g) => !joinedIds.has(g.id) && !invitedIds.has(g.id))
        .map((g) => {
          const focusLower = (g.pet_focus ?? []).map((f) => f.toLowerCase());
          let petScore = 0;
          if (focusLower.includes("all pets")) {
            petScore = 1;
          } else if (userSpecies.length > 0 && userSpecies.some((s) => focusLower.some((f) => f.includes(s) || s.includes(f)))) {
            petScore = 3;
          }
          const msSince = g.last_message_at ? Date.now() - new Date(g.last_message_at).getTime() : Infinity;
          const activeScore = msSince < 86_400_000 ? 2 : msSince < 604_800_000 ? 1 : 0;
          // Proximity: does the group's location share any meaningful word with user's location?
          const groupLocWords = (g.location_label || "").toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
          const proxScore = userLocWords.length > 0 && groupLocWords.some((w) => userLocWords.includes(w)) ? 4 : 0;
          return {
            group: toGroup(g, proxScore + petScore * 3 + activeScore),
            score: proxScore + petScore * 3 + activeScore,
          };
        });

      scored.sort((a, b) =>
        b.score - a.score ||
        groupActivityRankValue(b.group.lastMessageAt, b.group.createdAt) - groupActivityRankValue(a.group.lastMessageAt, a.group.createdAt) ||
        new Date(b.group.createdAt || 0).getTime() - new Date(a.group.createdAt || 0).getTime()
      );

      setInvitedExploreGroups(
        invitedGroups.sort(
          (a, b) =>
            groupActivityRankValue(b.lastMessageAt, b.createdAt) - groupActivityRankValue(a.lastMessageAt, a.createdAt) ||
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        )
      );
      setExploreGroups(scored.map((entry) => entry.group));
    } catch (error) {
      console.warn("[groups.explore] fetch failed", error);
      setInvitedExploreGroups([]);
      setExploreGroups([]);
    } finally {
      setExploreLoading(false);
    }
  }, [
    joinedGroupIdsKey,
    profile?.id,
    profile?.location_country,
    profile?.location_district,
    profile?.location_name,
    profile?.pets,
    user?.id,
  ]);

  const acceptGroupInviteAndOpen = useCallback(
    async (invite: { chatId: string; chatName: string; inviteId?: string | null }) => {
      let data: unknown = null;
      let error: { message?: string } | null = null;
      if (invite.inviteId) {
        const byId = await (supabase.rpc as (
          fn: string,
          params?: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
          "accept_group_chat_invite_by_id",
          { p_invite_id: invite.inviteId }
        );
        data = byId.data;
        error = byId.error;
      } else {
        const byChat = await (supabase.rpc as (
          fn: string,
          params?: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
          "accept_group_chat_invite",
          { p_chat_id: invite.chatId }
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
        return false;
      }
      await Promise.all([loadConversations("groups"), fetchExploreGroups()]);
      navigate(`/chat-dialogue?room=${encodeURIComponent(invite.chatId)}&name=${encodeURIComponent(invite.chatName)}&joined=1`);
      return true;
    },
    [fetchExploreGroups, loadConversations, navigate]
  );

  const requestGroupJoin = useCallback(
    async (group: Group) => {
      if (!user?.id) {
        toast.error("Sign in to join groups.");
        return false;
      }
      const { error } = await supabase
        .from("group_join_requests")
        .insert({ chat_id: group.id, user_id: user.id, status: "pending" });
      if (error && error.code !== "23505") {
        toast.error("Couldn't send request. Please try again.");
        return false;
      }
      setSentJoinRequests((prev) => new Set([...prev, group.id]));
      toast.success("Request sent!");
      return true;
    },
    [user?.id]
  );

  const joinPublicGroupAndOpen = useCallback(
    async (group: Group) => {
      if (!user?.id) {
        toast.error("Sign in to join groups.");
        return false;
      }
      const { error } = await supabase
        .from("chat_participants")
        .insert({ chat_id: group.id, user_id: user.id, role: "member" });
      if (error) {
        toast.error("Couldn't join. Please try again.");
        return false;
      }
      const { error: memberErr } = await supabase
        .from("chat_room_members")
        .insert({ chat_id: group.id, user_id: user.id });
      if (memberErr) {
        toast.error("Couldn't join. Please try again.");
        return false;
      }
      void supabase.rpc("post_group_welcome_message", { p_chat_id: group.id, p_user_id: user.id });
      void supabase.rpc("notify_group_join", { p_chat_id: group.id, p_user_id: user.id });
      await Promise.all([loadConversations("groups"), fetchExploreGroups()]);
      navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}&joined=1`);
      return true;
    },
    [fetchExploreGroups, loadConversations, navigate, user?.id]
  );

  useEffect(() => {
    if (mainTab === "groups" && groupSubTab === "explore") {
      void fetchExploreGroups();
    }
  }, [mainTab, groupSubTab, fetchExploreGroups]);

  const triggerGroupsExploreRefresh = useCallback(async () => {
    if (groupsPullRefreshing) return;
    setGroupsPullRefreshing(true);
    try {
      await Promise.all([loadConversations("groups"), fetchExploreGroups()]);
    } catch {
      toast.error("Couldn't refresh groups.");
    } finally {
      setGroupsPullRefreshing(false);
      setGroupsPullOffset(0);
      groupsTouchStartYRef.current = null;
      groupsPullEligibleRef.current = false;
    }
  }, [fetchExploreGroups, groupsPullRefreshing, loadConversations]);

  const handleGroupsPullStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (mainTab !== "groups" || groupSubTab !== "explore") {
      groupsTouchStartYRef.current = null;
      groupsPullEligibleRef.current = false;
      return;
    }
    const container = event.currentTarget;
    if ((container.scrollTop ?? 0) > 0 || groupsPullRefreshing) {
      groupsTouchStartYRef.current = null;
      groupsPullEligibleRef.current = false;
      return;
    }
    const touchY = event.touches[0]?.clientY;
    groupsPullEligibleRef.current = typeof touchY === "number" && touchY >= 60;
    groupsTouchStartYRef.current = groupsPullEligibleRef.current ? touchY : null;
  }, [groupSubTab, groupsPullRefreshing, mainTab]);

  const handleGroupsPullMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (mainTab !== "groups" || groupSubTab !== "explore" || !groupsPullEligibleRef.current) return;
    const startY = groupsTouchStartYRef.current;
    if (startY == null) return;
    const currentY = event.touches[0]?.clientY;
    if (typeof currentY !== "number") return;
    const delta = currentY - startY;
    if (delta <= 0) {
      setGroupsPullOffset(0);
      return;
    }
    setGroupsPullOffset(Math.min(84, delta * 0.45));
  }, [groupSubTab, mainTab]);

  const handleGroupsPullEnd = useCallback(() => {
    if (mainTab !== "groups" || groupSubTab !== "explore") {
      groupsTouchStartYRef.current = null;
      groupsPullEligibleRef.current = false;
      setGroupsPullOffset(0);
      return;
    }
    if (groupsPullOffset >= PULL_REFRESH_THRESHOLD && !groupsPullRefreshing) {
      void triggerGroupsExploreRefresh();
      return;
    }
    groupsTouchStartYRef.current = null;
    groupsPullEligibleRef.current = false;
    setGroupsPullOffset(0);
  }, [groupSubTab, groupsPullOffset, groupsPullRefreshing, mainTab, triggerGroupsExploreRefresh]);

  const openGroupDetailsSheet = useCallback(async (group: Group) => {
    setGroupDetailsId(group.id);
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("content")
        .eq("chat_id", group.id)
        .order("created_at", { ascending: false })
        .limit(80);
      const urls: string[] = [];
      for (const row of (data || []) as Array<{ content?: string | null }>) {
        try {
          const parsed = JSON.parse(String(row.content || "")) as { attachments?: Array<{ url?: string; mime?: string }> };
          if (!Array.isArray(parsed.attachments)) continue;
          parsed.attachments.forEach((attachment) => {
            const url = String(attachment?.url || "").trim();
            const mime = String(attachment?.mime || "").trim();
            if (!url || mime.startsWith("video/")) return;
            urls.push(url);
          });
        } catch {
          // ignore plain text rows
        }
      }
      setGroupDetailsMediaUrls(urls);
    } catch {
      setGroupDetailsMediaUrls([]);
    }
  }, []);

  const activeGroupDetails = useMemo(
    () => [...groups, ...invitedExploreGroups, ...exploreGroups].find((group) => group.id === groupDetailsId) || null,
    [exploreGroups, groupDetailsId, groups, invitedExploreGroups]
  );

  const handleChatClick = (chat: ChatUser) => {
    // Mark as read
    setChats(prev => prev.map(c =>
      c.id === chat.id ? { ...c, unread: 0 } : c
    ));
    if (chat.peerUserId) {
      setMatchOnlyAvatars((prev) => prev.filter((entry) => entry.userId !== chat.peerUserId));
    }
    void markChatMessagesRead(chat.id);
    if (chat.type === "service") {
      navigate(`/service-chat?room=${encodeURIComponent(chat.id)}&name=${encodeURIComponent(chat.name)}`);
      return;
    }
    if (chat.peerUserId) {
      void (async () => {
        const canonicalRoomId = await ensureDirectRoom(chat.peerUserId!, chat.name || "Conversation");
        const nextRoomId = canonicalRoomId || chat.id;
        void markChatMessagesRead(nextRoomId);
        navigate(
          `/chat-dialogue?room=${encodeURIComponent(nextRoomId)}&name=${encodeURIComponent(chat.name)}&with=${encodeURIComponent(chat.peerUserId!)}`
        );
      })();
      return;
    }
    navigate(`/chat-dialogue?room=${encodeURIComponent(chat.id)}&name=${encodeURIComponent(chat.name)}`);
  };

  const handleMatchAvatarClick = useCallback((entry: MatchOnlyAvatar) => {
    if (!entry.userId) return;
    void (async () => {
      const roomId = await ensureDirectRoom(entry.userId, entry.name || "Conversation");
      if (!roomId) return;
      setMatchOnlyAvatars((prev) => prev.filter((item) => item.userId !== entry.userId));
      markMatchSeen(entry.userId);
      void markChatMessagesRead(roomId);
      navigate(
        `/chat-dialogue?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(entry.name || "Conversation")}&with=${encodeURIComponent(
          entry.userId
        )}`
      );
    })();
  }, [ensureDirectRoom, markChatMessagesRead, markMatchSeen, navigate]);

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
    void markChatMessagesRead(group.id);
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

  const isTeamHuddleAvatarTapDisabled = useCallback(
    (userId: string | null | undefined, displayName: string | null | undefined) =>
      String(userId || "").trim() === TEAM_HUDDLE_USER_ID || isTeamHuddleIdentity(displayName, "teamhuddle"),
    []
  );

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
        openExternalUrl(data.url, "marketplace-booking");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || t("booking.payment_failed"));
    } finally {
      setBookingProcessing(false);
    }
  };

  const triggerWaveFromButton = useCallback(async () => {
    const p = currentDiscovery;
    if (!p || showDiscoverEmpty || showDiscoveryQuotaLock || discoverySwipeBusyRef.current) return;
    setWaveButtonAnimating(true);
    window.setTimeout(() => {
      setWaveButtonAnimating(false);
    }, 500);
    void triggerDiscoveryWave(p, { showToast: true });
  }, [currentDiscovery, showDiscoverEmpty, showDiscoveryQuotaLock, triggerDiscoveryWave]);

  return (
    <div className="h-full min-h-0 bg-background relative overflow-hidden flex flex-col">
      <div>
        <GlobalHeader
          onUpgradeClick={() => setIsPremiumOpen(true)}
        />
      </div>

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
              {topTab === "chats" && totalUnreadMessages > 0 && (
                <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[#FF4D4F] ring-2 ring-white" />
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
        <div className={cn("flex-1 min-h-0 flex flex-col", matchModal && "scale-[0.985] blur-[2px]")}>
          <DiscoveryDeck
            stackedDiscoveryCards={stackedDiscoveryCards}
            currentDiscovery={currentDiscovery}
            discoveryLoading={discoveryLoading}
            discoveryLocationBlocked={discoveryLocationBlocked}
            renderDiscoverEmpty={renderDiscoverEmpty}
            canExpandSearch={canExpandSearch}
            discoveryExpandStepKm={DISCOVERY_EXPAND_STEP_KM}
            passedDiscoveryCount={passedDiscoveryIds.size}
            showDiscoveryQuotaLock={showDiscoveryQuotaLock}
            discoverExhaustedCopy={discoverExhaustedCopy}
            emptyChatImage={emptyChatImage}
            profilePlaceholder={profilePlaceholder}
            swipeUiBusy={discoverySwipeUiBusy}
            waveButtonAnimating={waveButtonAnimating}
            dragX={dragX}
            dragY={dragY}
            dragRotate={dragRotate}
            dragScale={dragScale}
            nextCardScale={nextCardScale}
            nextCardTranslateY={nextCardTranslateY}
            stampCounterRotate={stampCounterRotate}
            waveIndicatorOpacity={waveIndicatorOpacity}
            passIndicatorOpacity={passIndicatorOpacity}
            waveIndicatorScale={waveIndicatorScale}
            passIndicatorScale={passIndicatorScale}
            waveIndicatorX={waveIndicatorX}
            waveIndicatorY={waveIndicatorY}
            passIndicatorX={passIndicatorX}
            passIndicatorY={passIndicatorY}
            waveTintOpacity={waveTintOpacity}
            passTintOpacity={passTintOpacity}
            onOpenLocationSettings={discoverLocationGate.handleEnableLocation}
            onExpandSearch={handleExpandSearch}
            onResurfacePassedProfiles={resurfacePassedProfiles}
            onWaveFromButton={triggerWaveFromButton}
            onSwipeRight={triggerDiscoveryWave}
            onSwipeLeft={triggerDiscoveryPass}
            onPromptStar={promptDiscoveryStar}
            onProfileTap={handleProfileTap}
            onSpringCardHome={springDiscoveryCardHome}
            getDiscoveryAlbum={getDiscoveryAlbum}
            getDiscoverySpeciesSummary={getDiscoverySpeciesSummary}
            getDiscoveryAvailabilityPills={getDiscoveryAvailabilityPills}
          />
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
          <div
            className="flex-1 min-h-0 overflow-y-auto touch-pan-y pb-[calc(64px+env(safe-area-inset-bottom)+20px)]"
            onTouchStart={handleGroupsPullStart}
            onTouchMove={handleGroupsPullMove}
            onTouchEnd={handleGroupsPullEnd}
            onTouchCancel={handleGroupsPullEnd}
          >
            {mainTab === "groups" && groupSubTab === "explore" ? (
              <div
                className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground transition-all duration-150"
                style={{
                  height: groupsPullRefreshing ? 28 : groupsPullOffset > 0 ? Math.max(14, Math.min(28, groupsPullOffset * 0.55)) : 0,
                  opacity: groupsPullRefreshing || groupsPullOffset > 0 ? 1 : 0,
                }}
              >
                <Loader2 className={groupsPullRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                <span>
                  {groupsPullRefreshing
                    ? "Refreshing..."
                    : groupsPullOffset >= PULL_REFRESH_THRESHOLD
                      ? "Release to refresh"
                      : "Pull to refresh"}
                </span>
              </div>
            ) : null}

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
                                      className={cn(
                                        "relative rounded-full",
                                        isTeamHuddleAvatarTapDisabled(chat.peerUserId, chat.name) ? "cursor-default" : "cursor-pointer"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!chat.peerUserId) return;
                                        if (isTeamHuddleAvatarTapDisabled(chat.peerUserId, chat.name)) return;
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
                                        <h4 className="m-0 flex items-center gap-1 truncate font-semibold leading-[1.2]">
                                          <span className="truncate">{chat.name}</span>
                                          {chat.isVerified ? <BadgeCheck className="h-4 w-4 shrink-0 text-brandBlue" aria-label="Verified" /> : null}
                                        </h4>
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
                              className={cn(
                                "relative",
                                isTeamHuddleAvatarTapDisabled(chat.peerUserId, chat.name) ? "cursor-default" : "cursor-pointer"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!chat.peerUserId) return;
                                if (isTeamHuddleAvatarTapDisabled(chat.peerUserId, chat.name)) return;
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
                                <h4 className="m-0 flex items-center gap-1 truncate font-semibold leading-[1.2]">
                                  <span className="truncate">{chat.name}</span>
                                  {chat.isVerified ? <BadgeCheck className="h-4 w-4 shrink-0 text-brandBlue" aria-label="Verified" /> : null}
                                </h4>
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
                    ) : invitedExploreGroups.length === 0 && exploreGroups.length === 0 ? (
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
                      <>
                        {invitedExploreGroups.length > 0 && (
                          <div className="space-y-2">
                            {invitedExploreGroups.map((group, index) => {
                              const handleExploreCardCTA = async (e: React.MouseEvent) => {
                                e.stopPropagation();
                                try {
                                  await acceptGroupInviteAndOpen({
                                    chatId: group.id,
                                    chatName: group.name,
                                    inviteId: group.inviteId,
                                  });
                                } catch {
                                  toast.error("Unable to join group right now.");
                                }
                              };

                              return (
                                <motion.div
                                  key={`invite-${group.id}`}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: index * 0.04, duration: 0.2 }}
                                  className="relative rounded-xl bg-card p-3 shadow-card"
                                >
                                <div className="flex items-start gap-3">
                                  <button
                                    type="button"
                                    className="mt-1 flex h-14 w-14 shrink-0 self-center items-center justify-center overflow-hidden rounded-full border border-border/30 bg-card"
                                    onClick={() => void openGroupDetailsSheet(group)}
                                    aria-label={`Open ${group.name} details`}
                                    >
                                      {group.avatarUrl ? (
                                        <img src={group.avatarUrl} alt={group.name} className="h-full w-full object-cover" />
                                      ) : (
                                        <Users className="h-6 w-6 text-primary" strokeWidth={1.75} />
                                      )}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <div className="relative min-w-0">
                                        <div className="absolute right-0 top-0 flex shrink-0 flex-col items-end gap-2 text-right">
                                          <p className="text-[11px] leading-[1.25] text-[#8C93AA]">{`Members: ${group.memberCount}`}</p>
                                          <button
                                            onClick={handleExploreCardCTA}
                                            className="rounded-full px-3 py-1 text-[13px] font-semibold text-white"
                                            style={{ backgroundColor: "var(--blue, #3B82F6)" }}
                                          >
                                            You&apos;re invited
                                          </button>
                                        </div>
                                        <button
                                          type="button"
                                          className="block min-w-0 max-w-full pr-[104px] text-left"
                                          onClick={() => void openGroupDetailsSheet(group)}
                                        >
                                          <p className="truncate text-[15px] font-semibold text-brandText">{group.name}</p>
                                        </button>
                                      </div>
                                      {group.locationLabel && (
                                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                          <MapPin className="mr-0.5 inline h-3 w-3" strokeWidth={1.75} />
                                          {group.locationLabel}
                                        </p>
                                      )}
                                      {group.petFocus && group.petFocus.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {group.petFocus.slice(0, 3).map((tag) => (
                                            <span key={tag} className="rounded-full bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {group.description && (
                                        <p className="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-muted-foreground">
                                          {group.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}

                        {exploreGroups.map((group, index) => {
                          const isMember = groups.some((g) => g.id === group.id);
                          const hasSentRequest = sentJoinRequests.has(group.id);

                          const handleExploreCardCTA = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (!user?.id) { toast.error("Sign in to join groups."); return; }
                            if (isMember) {
                              navigate(`/chat-dialogue?room=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.name)}`);
                              return;
                            }
                            if (group.joinMethod === "instant") {
                              await joinPublicGroupAndOpen(group);
                            } else {
                              await requestGroupJoin(group);
                            }
                          };

                          return (
                            <motion.div
                              key={group.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: (invitedExploreGroups.length + index) * 0.04, duration: 0.2 }}
                              className="relative rounded-xl bg-card p-3 shadow-card"
                            >
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  className="mt-1 flex h-14 w-14 shrink-0 self-center items-center justify-center overflow-hidden rounded-full border border-border/30 bg-card"
                                  onClick={() => void openGroupDetailsSheet(group)}
                                  aria-label={`Open ${group.name} details`}
                                >
                                  {group.avatarUrl ? (
                                    <img src={group.avatarUrl} alt={group.name} className="h-full w-full object-cover" />
                                  ) : (
                                    <Users className="h-6 w-6 text-primary" strokeWidth={1.75} />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="relative min-w-0">
                                    <div className="absolute right-0 top-0 flex shrink-0 flex-col items-end gap-2 text-right">
                                      <p className="text-[11px] leading-[1.25] text-[#8C93AA]">{`Members: ${group.memberCount}`}</p>
                                      {isMember ? (
                                        <button
                                          onClick={handleExploreCardCTA}
                                          className="flex items-center gap-0.5 text-[13px] font-medium text-primary"
                                        >
                                          Open <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                                        </button>
                                      ) : hasSentRequest ? (
                                        <span className="rounded-full bg-accent/40 px-3 py-1 text-[12px] font-medium text-muted-foreground">
                                          Requested
                                        </span>
                                      ) : group.joinMethod === "instant" ? (
                                        <button
                                          onClick={handleExploreCardCTA}
                                          className="rounded-full px-3 py-1 text-[13px] font-semibold text-white"
                                          style={{ backgroundColor: "var(--blue, #3B82F6)" }}
                                        >
                                          Join
                                        </button>
                                      ) : (
                                        <button
                                          onClick={handleExploreCardCTA}
                                          className="rounded-full border px-3 py-1 text-[13px] font-semibold"
                                          style={{ borderColor: "var(--blue, #3B82F6)", color: "var(--blue, #3B82F6)" }}
                                        >
                                          Request
                                        </button>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className="block min-w-0 max-w-full pr-[112px] text-left"
                                      onClick={() => void openGroupDetailsSheet(group)}
                                    >
                                      <p className="truncate text-[15px] font-semibold text-brandText">{group.name}</p>
                                    </button>
                                  </div>
                                  {group.locationLabel && (
                                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                      <MapPin className="mr-0.5 inline h-3 w-3" strokeWidth={1.75} />
                                      {group.locationLabel}
                                    </p>
                                  )}
                                  {group.petFocus && group.petFocus.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {group.petFocus.slice(0, 3).map((tag) => (
                                        <span key={tag} className="rounded-full bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {group.description && (
                                    <p className="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-muted-foreground">
                                      {group.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </>
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
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.2 }}
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
                          className="relative cursor-pointer rounded-xl bg-card p-3 shadow-card"
                        >
                          {group.isAdmin ? (
                            <button
                              type="button"
                              className="absolute left-0 top-0 z-[2] flex h-6 w-6 items-center justify-center text-[#8C93AA]"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isVerified) { setGroupVerifyGateOpen(true); return; }
                                setGroupManageReturnToDetails(false);
                                setGroupManageId(group.id);
                              }}
                              aria-label={`Manage ${group.name}`}
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                          ) : null}
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              className="relative mt-1 flex h-14 w-14 shrink-0 self-center items-center justify-center overflow-visible rounded-full border border-border/30 bg-card"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openGroupDetailsSheet(group);
                              }}
                              aria-label={`Open ${group.name} details`}
                            >
                              {group.avatarUrl ? (
                                <img src={group.avatarUrl} alt={group.name} className="h-full w-full object-cover" />
                              ) : (
                                <Users className="h-6 w-6 text-primary" strokeWidth={1.75} />
                              )}
                              {group.unread > 0 ? (
                                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/70 text-xs font-medium text-white shadow-sm">
                                  {group.unread > 99 ? "9+" : group.unread}
                                </span>
                              ) : null}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="relative min-w-0">
                                <div className="absolute right-0 top-1/2 flex w-[78px] -translate-y-1/2 flex-col items-center gap-1 text-center text-[11px] leading-[1.25] text-[#8C93AA]">
                                  <p className="w-full">{`Members: ${group.memberCount}`}</p>
                                </div>
                                <button
                                  type="button"
                                  className="block min-w-0 max-w-full pr-[88px] text-left"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openGroupDetailsSheet(group);
                                  }}
                                >
                                  <p className="truncate text-[15px] font-semibold text-brandText">{group.name}</p>
                                </button>
                              </div>
                              {group.locationLabel && (
                                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                  <MapPin className="mr-0.5 inline w-3 h-3" strokeWidth={1.75} />{group.locationLabel}
                                </p>
                              )}
                              {group.petFocus && group.petFocus.length > 0 && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {group.petFocus.slice(0, 3).map((tag) => (
                                    <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/60 text-accent-foreground font-medium">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {group.description && (
                                <p className="mt-1 line-clamp-2 break-words text-[11px] leading-relaxed text-muted-foreground">
                                  {group.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Invite pending CTA */}
                          {group.invitePending && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const joined = await acceptGroupInviteAndOpen({
                                    chatId: group.id,
                                    chatName: group.name,
                                    inviteId: group.inviteId,
                                  });
                                  if (!joined) return;
                                  toast.success(`Joined ${group.name}`);
                                } catch (err: unknown) {
                                  const msg = err && typeof err === "object" && "message" in err
                                    ? String((err as { message?: string }).message || "")
                                    : "";
                                  toast.error(msg ? `Unable to join group right now: ${msg}` : "Unable to join group right now.");
                                }
                              }}
                              className="flex-shrink-0 h-7 rounded-full border border-[#3653BE]/30 px-2 text-[11px] font-semibold text-[#3653BE] hover:bg-[#3653BE]/5"
                            >
                              Join
                            </button>
                          )}
                          <div className="flex flex-shrink-0 items-center gap-2">
                            {swipeDeleteGroupId === group.id ? (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-500">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </div>
                            ) : null}
                          </div>
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
                await supabase.from("chat_participants").delete().eq("chat_id", deleteGroupConfirmId).eq("user_id", profile.id);
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

      <Dialog open={Boolean(activeGroupDetails)} onOpenChange={(open) => { if (!open) setGroupDetailsId(null); }}>
        <DialogContent className="max-w-sm max-h-[88vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{activeGroupDetails?.name || "Group"}</DialogTitle>
            <DialogDescription>{`${activeGroupDetails?.memberCount || 0} members`}</DialogDescription>
          </DialogHeader>
          <GroupDetailsPanel
            name={activeGroupDetails?.name || "Group"}
            avatarUrl={activeGroupDetails?.avatarUrl || activeGroupDetails?.avatar_url || null}
            memberCount={activeGroupDetails?.memberCount || 0}
            description={activeGroupDetails?.description || null}
            mediaUrls={groupDetailsMediaUrls}
            actions={[
              ...(activeGroupDetails?.isAdmin
                ? [{
                    key: "manage",
                    label: "Manage Group",
                    icon: <Settings className="h-5 w-5 text-muted-foreground" />,
                    onClick: () => {
                      setGroupDetailsId(null);
                      if (!isVerified) { setGroupVerifyGateOpen(true); return; }
                      setGroupManageReturnToDetails(true);
                      setGroupManageId(activeGroupDetails.id);
                    },
                  }]
                : []),
              ...(activeGroupDetails?.id && groups.some((group) => group.id === activeGroupDetails.id)
                ? [{
                    key: "open",
                    label: "Open group",
                    icon: <ChevronRight className="h-5 w-5 text-muted-foreground" />,
                    onClick: () => {
                      setGroupDetailsId(null);
                      handleGroupClick(activeGroupDetails);
                    },
                  }]
                : []),
            ]}
          />
        </DialogContent>
      </Dialog>

      {/* Group Manage Modal — group image upload, members list with Remove, add members */}
      <Dialog open={!!groupManageId} onOpenChange={() => { setGroupManageId(null); setGroupAddSearch(""); setGroupManageReturnToDetails(false); }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {groupManageReturnToDetails ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white/80"
                  onClick={() => {
                    setGroupManageId(null);
                    setGroupAddSearch("");
                    setGroupManageReturnToDetails(false);
                    if (activeGroupDetails?.id) {
                      setGroupDetailsId(activeGroupDetails.id);
                    }
                  }}
                  aria-label="Back to group details"
                >
                  <ChevronLeft className="h-4 w-4 text-brandText/70" />
                </button>
              ) : null}
              <DialogTitle>Manage Group</DialogTitle>
            </div>
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
                      const path = `${profile.id}/groups/${groupManageId}/${Date.now()}.${ext}`;
                      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: true });
                      if (uploadErr) throw uploadErr;
                      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
                      const url = pub.publicUrl;
                      const row = await updateGroupChatMetadata({
                        chatId: groupManageId,
                        avatarUrl: url,
                        updateAvatar: true,
                      });
                      syncGroupRowIntoState(row);
                      void loadConversations("groups");
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

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-brandText/70">Description</div>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8C93AA] transition-colors hover:bg-muted/50"
                  disabled={groupDescriptionSaving}
                  onClick={async () => {
                    if (!groupManageId) return;
                    if (!groupDescriptionEditing) {
                      setGroupDescriptionEditing(true);
                      return;
                    }
                    setGroupDescriptionSaving(true);
                    try {
                      const row = await updateGroupChatMetadata({
                        chatId: groupManageId,
                        description: groupDescriptionDraft.trim() || null,
                        updateDescription: true,
                      });
                      syncGroupRowIntoState(row);
                      setGroupDescriptionDraft(row.description || "");
                      setGroupDescriptionEditing(false);
                      void loadConversations("groups");
                      toast.success("Group description updated");
                    } catch {
                      toast.error("Couldn't save group description.");
                    } finally {
                      setGroupDescriptionSaving(false);
                    }
                  }}
                  aria-label={groupDescriptionEditing ? "Save description" : "Edit description"}
                >
                  {groupDescriptionSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : groupDescriptionEditing ? (
                    <Save className="h-4 w-4" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                </button>
              </div>
              {groupDescriptionEditing ? (
                <div className="form-field-rest min-h-[92px] py-3">
                  <textarea
                    value={groupDescriptionDraft}
                    onChange={(event) => setGroupDescriptionDraft(event.target.value)}
                    className="field-input-core resize-none px-0 text-sm leading-relaxed"
                    rows={4}
                    placeholder="Tell members what this group is about."
                  />
                </div>
              ) : (
                <div className="rounded-[16px] border border-white/60 bg-white px-4 py-3 text-sm leading-relaxed text-brandText shadow-[0_10px_24px_rgba(66,73,101,0.08)]">
                  {groupDescriptionDraft.trim() || "No description yet."}
                </div>
              )}
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
                      <button
                        type="button"
                        className="flex items-center gap-2"
                        onClick={() => void handleProfileTap(req.userId, req.name, req.avatarUrl ?? null)}
                      >
                        <UserAvatar avatarUrl={req.avatarUrl ?? null} name={req.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                        <span className="text-sm text-brandText">{req.name}</span>
                      </button>
                    </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            try {
                              const { error: rpcError } = await supabase.rpc(
                                "approve_group_join_request",
                                { p_request_id: req.requestId }
                              );
                              if (rpcError) throw rpcError;
                              setGroupJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
                              setGroupMembers((prev) => [...prev, { id: req.userId, name: req.name, avatarUrl: req.avatarUrl }]);
                              setGroups((prev) => prev.map((g) => g.id === groupManageId ? { ...g, memberCount: g.memberCount + 1 } : g));
                              void loadConversations("groups");
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
                              const { error: rpcError } = await supabase.rpc(
                                "decline_group_join_request",
                                { p_request_id: req.requestId }
                              );
                              if (rpcError) throw rpcError;
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
                    <button
                      type="button"
                      className="flex items-center gap-2"
                      onClick={() => void handleProfileTap(m.id, m.name, m.avatarUrl)}
                    >
                      <UserAvatar avatarUrl={m.avatarUrl} name={m.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                      <span className="text-sm text-brandText">{m.id === profile?.id ? `${m.name} (You)` : m.name}</span>
                    </button>
                    {m.id !== profile?.id && (
                      <button
                        onClick={async () => {
                          if (!profile?.is_verified) {
                            setGroupVerifyGateOpen(true);
                            return;
                          }
                          try {
                            const { error: rpcError } = await supabase.rpc(
                              "remove_group_member",
                              { p_chat_id: groupManageId!, p_user_id: m.id }
                            );
                            if (rpcError) throw rpcError;
                            setGroupMembers((prev) => prev.filter((x) => x.id !== m.id));
                            setGroups((prev) => prev.map((g) => g.id === groupManageId ? { ...g, memberCount: Math.max(0, g.memberCount - 1) } : g));
                            void loadConversations("groups");
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
                    <button
                      type="button"
                      className="flex items-center gap-2 opacity-65"
                      onClick={() => void handleProfileTap(invitee.id, invitee.name, invitee.avatarUrl)}
                    >
                      <UserAvatar avatarUrl={invitee.avatarUrl} name={invitee.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                      <span className="text-sm text-brandText">{invitee.name}</span>
                    </button>
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
                        <button
                          type="button"
                          className="flex items-center gap-2"
                          onClick={() => void handleProfileTap(u.id, u.name, u.avatarUrl || null)}
                        >
                          <UserAvatar avatarUrl={u.avatarUrl || null} name={u.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                          <span className="text-sm text-brandText">{u.name}</span>
                        </button>
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
                              void loadConversations("groups");
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
                  const joined = await acceptGroupInviteAndOpen({
                    chatId: pendingGroupInvite.chatId,
                    chatName: pendingGroupInvite.chatName,
                    inviteId: pendingGroupInvite.inviteId,
                  });
                  if (!joined) {
                    return;
                  }
                  toast.success(`Joined ${pendingGroupInvite.chatName}`);
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
        zIndexBase={12000}
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
        {discoverySendCue && (
          <motion.div
            key={`${discoverySendCue.kind}-${discoverySendCue.id}`}
            className="pointer-events-none fixed inset-0 z-[9805] overflow-hidden"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={cn(
                "absolute flex items-center justify-center rounded-full",
                discoverySendCue.kind === "wave"
                  ? "right-[18%] top-[28%] h-[84px] w-[84px] bg-[rgba(33,71,201,0.96)] text-white shadow-[0_18px_36px_rgba(33,71,201,0.34)]"
                  : "left-[18%] top-[72%] h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 bg-[#F5C85C] text-[#2C2A19] shadow-[0_18px_36px_rgba(245,200,92,0.34)]"
              )}
              style={{
                scale: discoverySendCueScale,
                x: discoverySendCueX,
                y: discoverySendCueY,
                opacity: discoverySendCueOpacity,
                rotate: discoverySendCueRotate,
              }}
            >
              {discoverySendCue.kind === "wave" ? (
                <WaveHandIcon size={56} className="drop-shadow-[0_10px_18px_rgba(7,24,108,0.22)]" />
              ) : (
                <Star size={48} fill="currentColor" stroke="currentColor" strokeWidth={1.8} />
              )}
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
