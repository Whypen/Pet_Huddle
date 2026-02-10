import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MessageSquare, Search, X, Loader2, HandMetal, Star, SlidersHorizontal, Lock, User, ChevronRight, ChevronDown, ChevronUp, Trash2, PawPrint, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { CreateGroupDialog } from "@/components/chat/CreateGroupDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useApi } from "@/hooks/useApi";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { demoUsers } from "@/lib/demoData";

/* ── Discovery Filter Types & Defaults ── */
const ALL_GENDERS = ["Male", "Female", "Non-binary", "PNA"] as const;
const ALL_SPECIES = ["dog", "cat", "bird", "rabbit", "reptile", "hamster", "others"] as const;
const ALL_SOCIAL_ROLES = ["playdates", "nannies", "animal-lovers"] as const;
const ALL_ORIENTATIONS = ["Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", "Asexual", "PNA"] as const;
const ALL_DEGREES = ["High School", "Bachelor", "Master", "PhD", "Other"] as const;
const ALL_RELATIONSHIP_STATUSES = ["Single", "In relationship", "Married", "Open", "Divorced", "PNA"] as const;
const ALL_LANGUAGES = ["English", "Cantonese", "Mandarin", "Japanese", "Korean", "French", "Spanish", "Other"] as const;

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
  hasPetExperience: boolean;
  languages: string[];
  verifiedOnly: boolean;
  whoWavedAtMe: boolean;
  activeOnly: boolean;
};

const DEFAULT_FILTERS: DiscoveryFilters = {
  ageMin: 18,
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
  hasCar: true,
  hasPetExperience: true,
  languages: [...ALL_LANGUAGES],
  verifiedOnly: true,
  whoWavedAtMe: true,
  activeOnly: true,
};

type FilterKey = keyof DiscoveryFilters;
type FilterRowDef = { key: FilterKey; label: string; tier: "free" | "premium" | "gold"; type: "range" | "multi" | "toggle" | "slider" };

const FILTER_ROWS: FilterRowDef[] = [
  { key: "ageMin", label: "Age Range", tier: "free", type: "range" },
  { key: "genders", label: "Gender", tier: "free", type: "multi" },
  { key: "maxDistanceKm", label: "Distance", tier: "free", type: "slider" },
  { key: "species", label: "Species", tier: "free", type: "multi" },
  { key: "socialRoles", label: "Social Role", tier: "free", type: "multi" },
  { key: "heightMin", label: "Height Range", tier: "premium", type: "range" },
  { key: "orientations", label: "Sexual Orientation", tier: "premium", type: "multi" },
  { key: "degrees", label: "Highest Degree", tier: "premium", type: "multi" },
  { key: "relationshipStatuses", label: "Relationship Status", tier: "premium", type: "multi" },
  { key: "hasCar", label: "Car Badge", tier: "premium", type: "toggle" },
  { key: "hasPetExperience", label: "Pet Experience", tier: "premium", type: "toggle" },
  { key: "languages", label: "Language", tier: "premium", type: "multi" },
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
    case "socialRoles": return filters.socialRoles.length === ALL_SOCIAL_ROLES.length ? "All" : filters.socialRoles.map(r => r === "playdates" ? "Pet Parents" : r === "nannies" ? "Nannies" : "Animal Lovers").join(", ");
    case "heightMin": return `${filters.heightMin}–${filters.heightMax} cm`;
    case "orientations": return filters.orientations.length === ALL_ORIENTATIONS.length ? "All" : filters.orientations.slice(0, 2).join(", ") + (filters.orientations.length > 2 ? "…" : "");
    case "degrees": return filters.degrees.length === ALL_DEGREES.length ? "All" : filters.degrees.slice(0, 2).join(", ") + (filters.degrees.length > 2 ? "…" : "");
    case "relationshipStatuses": return filters.relationshipStatuses.length === ALL_RELATIONSHIP_STATUSES.length ? "All" : filters.relationshipStatuses.slice(0, 2).join(", ") + (filters.relationshipStatuses.length > 2 ? "…" : "");
    case "hasCar": return filters.hasCar ? "Y" : "N";
    case "hasPetExperience": return filters.hasPetExperience ? "Y" : "N";
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
  is_verified?: boolean;
  has_car?: boolean;
  bio?: string | null;
  relationship_status?: string | null;
  dob?: string | null;
  location_name?: string | null;
  occupation?: string | null;
  school?: string | null;
  major?: string | null;
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
  social_role?: string | null;
};

type MainTab = "nannies" | "playdates" | "animal-lovers" | "groups";
const mainTabs: { id: MainTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "playdates", label: "Play Dates", icon: MessageSquare },
  { id: "nannies", label: "Nannies", icon: MessageSquare },
  { id: "animal-lovers", label: "Animal Lovers", icon: MessageSquare },
  { id: "groups", label: "Groups", icon: Users },
];
const discoverySpeciesOptions = [
  { value: "Any", label: "Any Species" },
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "bird", label: "Bird" },
  { value: "rabbit", label: "Rabbit" },
  { value: "reptile", label: "Reptile" },
  { value: "hamster", label: "Hamster" },
  { value: "others", label: "Others" },
];

interface ChatUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  hasCar: boolean;
  isPremium: boolean;
  lastMessage: string;
  time: string;
  unread: number;
  type: "nannies" | "playdates" | "animal-lovers" | "group";
  isOnline?: boolean;
  hasTransaction?: boolean;
}

interface Group {
  id: string;
  name: string;
  avatarUrl?: string | null;
  memberCount: number;
  lastMessage: string;
  lastMessageSender: string;
  time: string;
  unread: number;
}

// Mock data - in production this would come from the backend
const mockChats: ChatUser[] = [
  {
    id: "1",
    name: "Marcus",
    avatarUrl: null,
    isVerified: true,
    hasCar: true,
    isPremium: false,
    lastMessage: "Sure! Let's meet at Central Park around 3pm?",
    time: "2m ago",
    unread: 2,
    type: "playdates",
    isOnline: true,
    hasTransaction: false
  },
  {
    id: "2",
    name: "Pet Care Pro",
    avatarUrl: null,
    isVerified: true,
    hasCar: false,
    isPremium: true,
    lastMessage: "I can take care of Max this weekend!",
    time: "1h ago",
    unread: 0,
    type: "nannies",
    isOnline: true,
    hasTransaction: false
  },
  {
    id: "3",
    name: "Sarah",
    avatarUrl: null,
    isVerified: false,
    hasCar: true,
    isPremium: false,
    lastMessage: "Thanks for the playdate! Bella had so much fun 🐕",
    time: "3h ago",
    unread: 0,
    type: "playdates",
    isOnline: false,
    hasTransaction: false
  },
  {
    id: "4",
    name: "Emily",
    avatarUrl: null,
    isVerified: true,
    hasCar: false,
    isPremium: true,
    lastMessage: "New kittens just arrived! 🐱",
    time: "2d ago",
    unread: 3,
    type: "animal-lovers",
    isOnline: true,
    hasTransaction: false
  },
  {
    id: "5",
    name: "James",
    avatarUrl: null,
    isVerified: true,
    hasCar: true,
    isPremium: false,
    lastMessage: "I'll be available next Monday for pet sitting",
    time: "3d ago",
    unread: 0,
    type: "nannies",
    isOnline: false,
    hasTransaction: false
  }
];

const mockGroups: Group[] = [
  {
    id: "g1",
    name: "Golden Retriever Club",
    avatarUrl: null,
    memberCount: 24,
    lastMessage: "Anyone going to the dog run today?",
    lastMessageSender: "Emma",
    time: "Yesterday",
    unread: 5
  },
  {
    id: "g2",
    name: "NYC Cat Lovers",
    avatarUrl: null,
    memberCount: 156,
    lastMessage: "Check out this new cat cafe!",
    lastMessageSender: "Mike",
    time: "2d ago",
    unread: 12
  },
  {
    id: "g3",
    name: "Pet Sitting Network",
    avatarUrl: null,
    memberCount: 45,
    lastMessage: "Looking for a sitter this weekend",
    lastMessageSender: "Lisa",
    time: "3d ago",
    unread: 0
  },
  {
    id: "g4",
    name: "Puppy Training Tips",
    avatarUrl: null,
    memberCount: 89,
    lastMessage: "Great progress today!",
    lastMessageSender: "Dr. Wong",
    time: "4d ago",
    unread: 8
  }
];

const Chats = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { isConnected, onNewMessage, onOnlineStatus } = useWebSocket();
  const { getConversations } = useApi();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("playdates");
  const [chats, setChats] = useState<ChatUser[]>(mockChats);
  const [groups, setGroups] = useState<Group[]>(mockGroups);
  const [chatVisibleCount, setChatVisibleCount] = useState(10);
  const [groupVisibleCount, setGroupVisibleCount] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilterRow, setActiveFilterRow] = useState<FilterRowDef | null>(null);
  const [filters, setFilters] = useState<DiscoveryFilters>({ ...DEFAULT_FILTERS });
  const [profileSheetUser, setProfileSheetUser] = useState<{ id: string; name: string; avatarUrl?: string | null } | null>(null);
  const [profileSheetData, setProfileSheetData] = useState<Record<string, unknown> | null>(null);
  const [profileSheetLoading, setProfileSheetLoading] = useState(false);
  // Group management
  const [groupManageId, setGroupManageId] = useState<string | null>(null);
  const [swipeDeleteId, setSwipeDeleteId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [groupImageUploading, setGroupImageUploading] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [mutualWaves, setMutualWaves] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [hiddenDiscoveryIds, setHiddenDiscoveryIds] = useState<Set<string>>(new Set());
  const [selectedDiscovery, setSelectedDiscovery] = useState<DiscoveryProfile | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [activeAlbumIndex, setActiveAlbumIndex] = useState(0);
  const [albumUrls, setAlbumUrls] = useState<Record<string, string[]>>({});
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Collapsible sections
  const [discoveryExpanded, setDiscoveryExpanded] = useState(true);
  const [chatsExpanded, setChatsExpanded] = useState(false);

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

  const isVerified = profile?.is_verified;
  const userAge = profile?.dob
    ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;
  const isMinor = userAge !== null && userAge >= 13 && userAge < 16;
  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "premium" || effectiveTier === "gold";

  // UAT: Free users max 40 profiles/day. After limit: blur overlay and upsell.
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const discoveryKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `discovery_seen_${y}-${m}-${day}`;
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

  // Quota removed — all tiers unlimited
  const bumpDiscoverySeen = async (): Promise<boolean> => {
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
        (supabase as any)
          .from("sitter_profiles")
          .select("hourly_rate")
          .eq("user_id", selectedNanny.id)
          .maybeSingle()
          .then(({ data }: any) => {
            setSitterHourlyRate(data?.hourly_rate || null);
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
  }, [nannyBookingOpen, profile?.id, selectedNanny?.id]);

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
  }, [serviceDate]);

  // Load group members + mutual waves when group manage modal opens
  useEffect(() => {
    if (!groupManageId || !profile?.id) return;
    const load = async () => {
      // Fetch members for this group
      try {
        const { data: members } = await supabase
          .from("chat_room_members")
          .select("user_id, profiles!inner(id, display_name, avatar_url)")
          .eq("room_id", groupManageId);
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
  }, [groupManageId, profile?.id]);

  // Load conversations from backend
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const data = await getConversations() as any;
        if (data && data.chats) {
          // Map backend data to our format
          // For now, we'll use mock data
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
      }
    };
    loadConversations();
  }, []);

  // Discovery cards (embedded in Chats) — send full filter payload
  useEffect(() => {
    const runDiscovery = async () => {
      if (!profile?.id || profile.last_lat == null || profile.last_lng == null) return;
      setDiscoveryLoading(true);
      try {
        const payload = {
          userId: profile.id,
          lat: profile.last_lat,
          lng: profile.last_lng,
          // Full filter payload — backend validates tier gating
          age_min: filters.ageMin,
          age_max: filters.ageMax,
          genders: filters.genders,
          max_distance_km: filters.maxDistanceKm,
          species: filters.species,
          social_roles: filters.socialRoles,
          height_min_cm: isPremium ? filters.heightMin : undefined,
          height_max_cm: isPremium ? filters.heightMax : undefined,
          orientations: isPremium ? filters.orientations : undefined,
          degrees: isPremium ? filters.degrees : undefined,
          relationship_statuses: isPremium ? filters.relationshipStatuses : undefined,
          has_car: isPremium ? filters.hasCar : undefined,
          has_pet_experience: isPremium ? filters.hasPetExperience : undefined,
          languages: isPremium ? filters.languages : undefined,
          verified_only: effectiveTier === "gold" ? filters.verifiedOnly : undefined,
          who_waved_at_me: effectiveTier === "gold" ? filters.whoWavedAtMe : undefined,
          active_only: effectiveTier === "gold" ? filters.activeOnly : undefined,
          advanced: isPremium,
        };
        const { data, error } = await supabase.functions.invoke("social-discovery", { body: payload });
        if (error) throw error;
        setDiscoveryProfiles(data?.profiles || []);
      } catch (err) {
        console.warn("[Chats] Discovery failed", err);
      } finally {
        setDiscoveryLoading(false);
      }
    };
    runDiscovery();
  }, [
    profile?.id,
    profile?.last_lat,
    profile?.last_lng,
    filters,
    isPremium,
    effectiveTier,
  ]);

  useEffect(() => {
    const loadAlbums = async () => {
      if (discoveryProfiles.length === 0) return;
      const next: Record<string, string[]> = {};
      for (const p of discoveryProfiles) {
        const album = Array.isArray(p?.social_album) ? p.social_album : [];
        if (!album.length) continue;
        const resolved = await Promise.all(
          album.map(async (path: string) => {
            if (!path) return "";
            if (path.startsWith("http")) return path;
            const { data } = await supabase.storage.from("social_album").createSignedUrl(path, 60 * 60);
            return data?.signedUrl || "";
          })
        );
        next[p.id] = resolved.filter(Boolean);
      }
      if (Object.keys(next).length > 0) {
        setAlbumUrls((prev) => ({ ...prev, ...next }));
      }
    };
    loadAlbums();
  }, [discoveryProfiles]);

  // Listen for new messages
  useEffect(() => {
    onNewMessage((message) => {
      setChats(prev => prev.map(chat => {
        if (chat.id === message.senderId) {
          return {
            ...chat,
            lastMessage: message.content,
            time: "Just now",
            unread: chat.unread + 1
          };
        }
        return chat;
      }));
    });
  }, [onNewMessage]);

  // Listen for online status updates
  useEffect(() => {
    onOnlineStatus((userId, isOnline) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        if (isOnline) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    });
  }, [onOnlineStatus]);

  // Filter chats based on active tab and search (unified tab system)
  const filteredChats = chats.filter(chat => {
    const matchesTab = mainTab === "groups" ? false : chat.type === mainTab;
    const matchesSearch = !searchQuery ||
      chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Filter groups based on search
  const filteredGroups = groups.filter(group => {
    return !searchQuery ||
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const demoProfiles = demoUsers.map((u) => ({
    id: u.id,
    display_name: u.name,
    avatar_url: u.avatarUrl || null,
    is_verified: u.isVerified,
    has_car: u.hasCar,
    bio: u.bio,
    relationship_status: u.relationshipStatus || null,
    dob: u.age ? new Date(Date.now() - u.age * 365.25 * 24 * 60 * 60 * 1000).toISOString() : null,
    location_name: u.locationName,
    occupation: u.occupation || null,
    school: u.education || null,
    major: u.degree || null,
    tier: u.isPremium ? "premium" : "free",
    pets: u.pets || [],
    pet_species: (u.pets || []).map((p) => p.species),
    pet_size: null,
    height: u.height || null,
    social_album: u.avatarUrl ? [u.avatarUrl] : [],
    show_occupation: true,
    show_academic: true,
    show_bio: true,
    show_relationship_status: true,
    show_age: true,
    show_gender: true,
    show_orientation: true,
    show_height: true,
    show_weight: true,
    social_role: u.role,
    gender_genre: u.gender || null,
    orientation: u.orientation || null,
  }));

  const resolveDemoPetSize = (profileRow: { pet_size?: string | null; pet_species?: string[] | null }) => {
    if (profileRow?.pet_size) return profileRow.pet_size;
    const species = (profileRow?.pet_species || []).map((s: string) => s.toLowerCase());
    if (species.includes("dog")) return "Medium";
    if (species.includes("cat") || species.includes("rabbit") || species.includes("hamster") || species.includes("bird")) {
      return "Small";
    }
    return null;
  };

  const filteredDemoProfiles = demoProfiles.filter((p) => {
    // Apply filter state
    if (filters.socialRoles.length > 0 && p.social_role && !filters.socialRoles.includes(p.social_role)) return false;
    if (filters.species.length > 0 && filters.species.length < ALL_SPECIES.length) {
      const species = (p.pet_species || []).map((s: string) => s.toLowerCase());
      if (!species.some(s => filters.species.includes(s))) return false;
    }
    if (filters.genders.length > 0 && filters.genders.length < ALL_GENDERS.length && p.gender_genre) {
      if (!filters.genders.includes(p.gender_genre)) return false;
    }
    const age = p.dob
      ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : null;
    if (age !== null && (age < filters.ageMin || age > filters.ageMax)) return false;
    return true;
  });

  const discoverySource = (discoveryProfiles.length > 0 ? discoveryProfiles : filteredDemoProfiles).filter(
    (p) => !hiddenDiscoveryIds.has(p.id)
  );

  const handleCreateGroup = () => {
    if (!isVerified || !isPremium) {
      toast.error(t("Only verified premium users can create groups"));
      return;
    }
    setIsCreateGroupOpen(true);
  };

  const handleGroupCreated = (groupData: { name: string; members: unknown[]; allowMemberControl: boolean }) => {
    console.log("Group created:", groupData);
    // Add to groups list
    const newGroup: Group = {
      id: `g${Date.now()}`,
      name: groupData.name,
      avatarUrl: null,
      memberCount: groupData.members.length + 1, // +1 for creator
      lastMessage: "Group created",
      lastMessageSender: "You",
      time: "Just now",
      unread: 0
    };
    setGroups(prev => [newGroup, ...prev]);
    toast.success(`Group "${groupData.name}" created!`);
  };

  const handleChatClick = (chat: ChatUser) => {
    // Mark as read
    setChats(prev => prev.map(c =>
      c.id === chat.id ? { ...c, unread: 0 } : c
    ));
    // Navigate to ChatDialogue with id + name + type params
    navigate(`/chat-dialogue?id=${chat.id}&name=${encodeURIComponent(chat.name)}&type=${chat.type}`);
  };

  const handleRemoveChat = (chat: ChatUser) => {
    if (chat.hasTransaction) {
      toast.error(t("Cannot remove conversations with active transactions"));
      return;
    }
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    toast.success(t("Conversation removed"));
  };

  const handleGroupClick = (group: Group) => {
    // Mark as read
    setGroups(prev => prev.map(g =>
      g.id === group.id ? { ...g, unread: 0 } : g
    ));
    // Navigate to ChatDialogue for group
    navigate(`/chat-dialogue?id=${group.id}&name=${encodeURIComponent(group.name)}&type=group`);
  };

  // Tap user profile — open right-side sheet showing public fields; block if non_social
  const handleProfileTap = async (userId: string, displayName: string, avatarUrl?: string | null) => {
    setProfileSheetUser({ id: userId, name: displayName, avatarUrl });
    setProfileSheetData(null);
    setProfileSheetLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("display_name, avatar_url, bio, relationship_status, dob, location_name, occupation, school, major, is_verified, has_car, tier, effective_tier, non_social, hide_from_map, social_album, show_occupation, show_academic, show_bio, show_relationship_status, show_age, show_gender, show_orientation, show_height, show_weight, gender_genre, orientation, pet_species, pet_experience_years, languages, social_role")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      setProfileSheetData(data as Record<string, unknown> | null);
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
    <div className="min-h-screen bg-background pb-nav relative">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {isMinor && (
        <div className="absolute inset-x-4 top-24 z-[60] pointer-events-none">
          <div className="rounded-xl border border-[#3283ff]/30 bg-background/90 backdrop-blur px-4 py-3 text-sm font-medium text-[#3283ff] shadow-card">
            {t("Social features restricted for users under 16.")}
          </div>
        </div>
      )}

      <div className={cn(isMinor && "pointer-events-none opacity-70")}>

      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-2xl font-bold">{t("chats.title")}</h1>
        <div className="flex items-center gap-2">
          {/* Filter Button */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Filter"
          >
            <SlidersHorizontal className="w-5 h-5 text-muted-foreground" />
          </button>
          {/* Search Button */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <Search className="w-5 h-5 text-muted-foreground" />
          </button>
          {/* Create Group Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateGroup}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              isVerified
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Create Group
          </motion.button>
        </div>
      </header>

        {/* ── Collapsible Discovery Section ── */}
      <section className="px-5 pb-2">
        <button
          onClick={() => setDiscoveryExpanded((v) => !v)}
          className="w-full flex items-center justify-between py-2"
          style={{ borderBottom: "1px solid #E0E0E0", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
        >
          <span className="text-sm font-bold text-brandText">Discovery</span>
          {discoveryExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        <AnimatePresence initial={false}>
          {discoveryExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              {/* Discovery cards — single card visible, horizontal scroll with paging */}
              <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2 snap-x snap-mandatory px-4 -mx-4" style={{ scrollSnapType: "x mandatory" }}>
                {discoveryLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("Loading discovery...")}
                  </div>
                )}
                {discoverySource.map((p, idx) => {
                  const blocked = !isPremium && discoverySeenToday >= 40 && idx >= 40;
                  const age = p?.dob
                    ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                    : "";
                  const petSpeciesList = Array.isArray(p?.pet_species)
                    ? p.pet_species
                    : Array.isArray(p?.pets) && p.pets.length > 0
                    ? p.pets.map((pet: { species?: string | null }) => pet.species || "")
                    : [];
                  const petSpecies = petSpeciesList.length > 0 ? petSpeciesList.join(", ") : "—";
                  const roleBadge = p.social_role === "nannies" ? "Nannies" : p.social_role === "animal-lovers" ? "Animal Lovers" : "Playdates";
                  const album = (albumUrls[p.id] && albumUrls[p.id].length > 0)
                    ? albumUrls[p.id]
                    : Array.isArray(p?.social_album) && p.social_album.length > 0
                    ? p.social_album
                    : p.avatar_url
                    ? [p.avatar_url]
                    : [];
                  const cover = album[0];

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "w-[calc(100vw-40px)] max-w-[380px] flex-shrink-0 rounded-2xl border border-border bg-card shadow-card overflow-hidden relative cursor-pointer",
                        blocked && "cursor-not-allowed"
                      )}
                      style={{ scrollSnapAlign: "center" }}
                      onClick={async () => {
                        if (blocked) return;
                        const ok = await bumpDiscoverySeen();
                        if (!ok) return;
                        setSelectedDiscovery(p);
                        setActiveAlbumIndex(0);
                        setShowDiscoveryModal(true);
                      }}
                    >
                      {cover ? (
                        <img src={cover} alt={p.display_name || ""} className="w-full object-contain bg-muted" style={{ aspectRatio: "3/4" }} loading="lazy" />
                      ) : (
                        <div className="w-full bg-muted" style={{ aspectRatio: "3/4" }} />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />

                      {/* Badge overlays on card image — Verified + Car */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        {p.is_verified && (
                          <span className="px-2 py-0.5 rounded-full bg-brandGold/90 text-white text-[10px] font-bold">Verified</span>
                        )}
                        {p.has_car && (
                          <span className="px-2 py-0.5 rounded-full bg-brandBlue/90 text-white text-[10px] font-bold">Car</span>
                        )}
                      </div>

                      {/* Action icons overlay — Wave / Star / X */}
                      <div className="absolute top-3 right-3 flex gap-1">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (blocked) return;
                            const ok = await bumpDiscoverySeen();
                            if (!ok) return;
                            try {
                              if (profile?.id) {
                                await (supabase as any)
                                  .from("waves")
                                  .insert({ from_user_id: profile.id, to_user_id: p.id })
                                  .throwOnError();
                              }
                              toast.success(t("Wave sent"));
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : String(err);
                              if (msg.includes("duplicate") || msg.includes("23505")) {
                                toast.info(t("Wave already sent"));
                              } else {
                                toast.error(t("Failed to send wave"));
                              }
                            }
                          }}
                          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                        >
                          <HandMetal className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (blocked) return;
                            const okSeen = await bumpDiscoverySeen();
                            if (!okSeen) return;
                            // Quota removed — stars unlimited for all tiers
                            navigate(`/chat-dialogue?id=${p.id}&name=${encodeURIComponent(p.display_name || "")}`);
                          }}
                          className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center"
                        >
                          <Star className="w-4 h-4 text-brandBlue" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (blocked) return;
                            setHiddenDiscoveryIds((prev) => new Set(prev).add(p.id));
                          }}
                          className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>

                      {/* Bottom info: Name, Age, Social Role, Pet Species */}
                      <div className="absolute bottom-3 left-3 right-3 text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold">{p.display_name}</span>
                          {age && <span className="text-sm font-medium">{String(age)}</span>}
                        </div>
                        <div className="text-xs text-white/80 mt-0.5">{roleBadge} • {petSpecies}</div>
                      </div>

                      {blocked ? (
                        <div className="absolute inset-0 backdrop-blur-sm bg-white/80 flex items-center justify-center">
                          <div className="px-4 text-center">
                            <div className="text-sm font-bold text-brandText">Unlock Premium to see more users</div>
                            <div className="text-xs text-brandText/70 mt-2">Free users can view up to 40 profiles per day.</div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsPremiumOpen(true);
                              }}
                              className="mt-3 inline-flex items-center justify-center rounded-lg bg-brandBlue text-white font-bold px-4 py-2"
                            >
                              Explore Premium
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {discoveryProfiles.length > 0 && discoverySource.length === 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => {
                      setFilters((f) => ({ ...f, maxDistanceKm: Math.min(150, f.maxDistanceKm + 15) }));
                      setHiddenDiscoveryIds(new Set());
                    }}
                    className="text-xs font-medium text-[#3283ff] underline"
                  >
                    {t("Run out of huddlers? Expand search.")}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Search Bar */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-5 pb-2 overflow-hidden"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Search conversations...")}
                className="pl-10 pr-10 h-10 rounded-full"
                autoFocus
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapsible Chats Section (default collapsed) ── */}
      <section className="px-5">
        <button
          onClick={() => setChatsExpanded((v) => !v)}
          className="w-full flex items-center justify-between py-2"
          style={{ borderBottom: "1px solid #E0E0E0", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
        >
          <span className="text-sm font-bold text-brandText">Chats</span>
          {chatsExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        <AnimatePresence initial={false}>
          {chatsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >

      {/* Unified Tabs: Play Dates / Nannies / Animal Lovers / Groups */}
      <div className="py-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-border">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={cn(
                "px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap relative",
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
      </div>

      {/* Chats View (Nannies / Playdates / Animal Lovers) */}
      {mainTab !== "groups" && (
        <>
          {/* Chat List — Nanny disclaimer moved inside ChatDialogue */}
          <div>
            <div className="space-y-2">
              {filteredChats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">{t("No conversations found")}</p>
                </div>
              ) : (
                filteredChats.slice(0, chatVisibleCount).map((chat, index) => (
                  <div key={chat.id} className="relative overflow-hidden rounded-xl">
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
                      className="relative flex items-center gap-4 p-4 bg-card shadow-card cursor-pointer hover:bg-accent/5 transition-colors"
                    >
                      <div
                        className="relative cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProfileTap(chat.id, chat.name, chat.avatarUrl);
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{t(chat.name)}</h4>
                          <span className="text-xs text-muted-foreground">{t(chat.time)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{t(chat.lastMessage)}</p>
                        {/* Grey bold subtext closer to bottom border */}
                        <p className="text-xs font-bold text-[#6B7280] mt-1.5">
                          {chat.type === "nannies" ? "Pet Nanny" : chat.type === "playdates" ? "Playdate" : "Animal Lover"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Outlined red bin — only visible during swipe */}
                        {swipeDeleteId === chat.id && (
                          <div className="w-8 h-8 rounded-full border-2 border-red-500 flex items-center justify-center">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </div>
                        )}
                        {/* Grey unread badge for chats */}
                        {chat.unread > 0 && (
                          <span className="w-5 h-5 rounded-full bg-muted-foreground/70 text-white text-xs flex items-center justify-center font-medium">
                            {chat.unread}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  </div>
                ))
              )}
            </div>
            {filteredChats.length > chatVisibleCount && (
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

      {/* Groups View */}
      {mainTab === "groups" && (
        <div className="pt-2">
          <div className="space-y-2">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">{t("No groups found")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isVerified ? t("chats.create_group_prompt") : t("chats.verify_to_create")}
                </p>
              </div>
            ) : (
              filteredGroups.slice(0, groupVisibleCount).map((group, index) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleGroupClick(group)}
                  className="flex items-center gap-4 p-4 rounded-xl bg-card shadow-card cursor-pointer hover:bg-accent/5 transition-colors"
                >
                  {/* Group Avatar — no badge */}
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{t(group.name)}</h4>
                        {/* Group creator only: Manage pill */}
                        {profile?.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setGroupManageId(group.id);
                            }}
                            className="px-2 py-0.5 rounded-full bg-brandBlue text-white text-[10px] font-bold"
                          >
                            Manage
                          </button>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{t(group.time)}</span>
                    </div>
                    {/* Static member count under group name */}
                    <p className="text-[10px] text-muted-foreground">{group.memberCount} members</p>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      <span className="font-medium">{t(group.lastMessageSender)}:</span> {t(group.lastMessage)}
                    </p>
                  </div>

                  {group.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-brandBlue text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
                      {group.unread > 9 ? "9+" : group.unread}
                    </span>
                  )}
                </motion.div>
              ))
            )}
          </div>
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

            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("Delete Conversation")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("This conversation will be permanently deleted. Are you sure?")}</p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>{t("Cancel")}</Button>
            <Button variant="destructive" size="sm" onClick={() => {
              const chat = chats.find((c) => c.id === deleteConfirmId);
              if (chat) handleRemoveChat(chat);
              setDeleteConfirmId(null);
            }}>{t("Delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Manage Modal — group image upload, members list with Remove, invite from mutual waves */}
      <Dialog open={!!groupManageId} onOpenChange={() => setGroupManageId(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Group Image — working upload */}
            <div className="flex items-center gap-3">
              {(() => {
                const grp = groups.find((g) => g.id === groupManageId);
                return grp?.avatarUrl ? (
                  <img src={grp.avatarUrl} alt={grp.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
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
                      const { error: uploadErr } = await supabase.storage.from("notices").upload(path, compressed);
                      if (uploadErr) throw uploadErr;
                      const { data: pub } = supabase.storage.from("notices").getPublicUrl(path);
                      const url = pub.publicUrl;
                      // Update group avatar in local state
                      setGroups((prev) => prev.map((g) => g.id === groupManageId ? { ...g, avatarUrl: url } : g));
                      // Persist to DB if groups table exists
                      await supabase.from("chat_rooms").update({ avatar_url: url }).eq("id", groupManageId);
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
                <Button size="sm" variant="outline" className="text-xs pointer-events-none" disabled={groupImageUploading}>
                  {groupImageUploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Change Image
                </Button>
              </label>
            </div>

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
                          try {
                            await supabase.from("chat_room_members").delete().eq("room_id", groupManageId!).eq("user_id", m.id);
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
              </div>
            </div>

            {/* Invite from Mutual Waves — real notification flow */}
            <div>
              <div className="text-xs font-semibold text-brandText/70 mb-2">Invite from Mutual Waves</div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {mutualWaves.length > 0 ? mutualWaves.map((w) => (
                  <div key={w.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <UserAvatar avatarUrl={w.avatarUrl} name={w.name} isVerified={false} hasCar={false} size="sm" showBadges={false} />
                      <span className="text-sm text-brandText">{w.name}</span>
                    </div>
                    <Button
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={async () => {
                        if (!profile?.id || !groupManageId) return;
                        try {
                          // Insert notification for receiver: "Do you want to join [Group]?"
                          await supabase.from("notifications").insert({
                            user_id: w.id,
                            type: "group_invite",
                            title: "Group Invite",
                            body: `${profile.display_name || "Someone"} invited you to join "${groups.find((g) => g.id === groupManageId)?.name || "a group"}"`,
                            data: { group_id: groupManageId, inviter_id: profile.id },
                          });
                          toast.success(`Invite sent to ${w.name}`);
                          // Remove from invite list to prevent duplicate
                          setMutualWaves((prev) => prev.filter((x) => x.id !== w.id));
                        } catch {
                          toast.error(t("Failed to send invite"));
                        }
                      }}
                    >
                      Invite
                    </Button>
                  </div>
                )) : (
                  <div className="text-xs text-muted-foreground py-2">No mutual waves available</div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connection Status */}
      {!isConnected && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-yellow-500/90 text-yellow-900 text-xs font-medium rounded-full shadow-lg">
          {t("chats.connecting")}
        </div>
      )}

      {/* Discovery Profile Full-Screen */}
      <AnimatePresence>
        {showDiscoveryModal && selectedDiscovery && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[2500]"
              onClick={() => setShowDiscoveryModal(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed inset-x-0 bottom-0 z-[2501] bg-card rounded-t-3xl max-w-md mx-auto overflow-hidden"
            >
              <div className="relative">
                <button
                  onClick={() => setShowDiscoveryModal(false)}
                  className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                {(() => {
                  const album = (albumUrls[selectedDiscovery.id] && albumUrls[selectedDiscovery.id].length > 0)
                    ? albumUrls[selectedDiscovery.id]
                    : Array.isArray(selectedDiscovery.social_album) && selectedDiscovery.social_album.length > 0
                    ? selectedDiscovery.social_album
                    : selectedDiscovery.avatar_url
                    ? [selectedDiscovery.avatar_url]
                    : [];
                  const current = album[activeAlbumIndex] || album[0];
                  return (
                    <>
                      {current ? (
                        <img
                          src={current}
                          alt=""
                          className="w-full h-72 object-cover"
                          loading="lazy"
                          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
                          onTouchEnd={(e) => {
                            if (touchStartX == null || album.length <= 1) return;
                            const delta = touchStartX - e.changedTouches[0].clientX;
                            if (Math.abs(delta) > 40) {
                              const nextIndex = delta > 0
                                ? Math.min(activeAlbumIndex + 1, album.length - 1)
                                : Math.max(activeAlbumIndex - 1, 0);
                              setActiveAlbumIndex(nextIndex);
                            }
                            setTouchStartX(null);
                          }}
                        />
                      ) : (
                        <div className="w-full h-72 bg-muted" />
                      )}
                      {album.length > 1 && (
                        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1">
                          {album.map((_: string, idx: number) => (
                            <button
                              key={`dot-${idx}`}
                              onClick={() => setActiveAlbumIndex(idx)}
                              className={cn(
                                "w-2 h-2 rounded-full",
                                idx === activeAlbumIndex ? "bg-white" : "bg-white/40"
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="p-5 max-h-[50vh] overflow-y-auto">
                {(() => {
                  const age = selectedDiscovery?.dob
                    ? Math.floor((Date.now() - new Date(selectedDiscovery.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                    : null;
                  const pets = Array.isArray(selectedDiscovery?.pets) ? selectedDiscovery.pets : [];
                  const petSpecies = Array.isArray(selectedDiscovery?.pet_species)
                    ? selectedDiscovery.pet_species
                    : pets.map((pet: { species?: string | null }) => pet.species || "");
                  return (
                    <>
                      <h3 className="text-xl font-bold">{selectedDiscovery.display_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedDiscovery.show_age !== false && age ? `${age} • ` : ""}
                        {selectedDiscovery.show_relationship_status !== false
                          ? selectedDiscovery.relationship_status || ""
                          : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedDiscovery.location_name || "—"}</p>

                      {selectedDiscovery.show_bio !== false && selectedDiscovery.bio && (
                        <div className="mt-3">
                          <h4 className="text-sm font-semibold">{t("Bio")}</h4>
                          <p className="text-sm text-muted-foreground">{selectedDiscovery.bio}</p>
                        </div>
                      )}

                      <div className="mt-3">
                        <h4 className="text-sm font-semibold">{t("Pet Info")}</h4>
                        <p className="text-sm text-muted-foreground">
                          {petSpecies.length > 0 ? petSpecies.join(", ") : t("No pet info")}
                        </p>
                      </div>

                      {(selectedDiscovery.show_occupation !== false || selectedDiscovery.show_academic !== false) && (
                        <div className="mt-3 space-y-1">
                          {selectedDiscovery.show_occupation !== false && selectedDiscovery.occupation && (
                            <p className="text-sm text-muted-foreground">
                              {t("Job")}: {selectedDiscovery.occupation}
                            </p>
                          )}
                          {selectedDiscovery.show_academic !== false && (selectedDiscovery.school || selectedDiscovery.major) && (
                            <p className="text-sm text-muted-foreground">
                              {t("School")}: {[selectedDiscovery.school, selectedDiscovery.major].filter(Boolean).join(" • ")}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onCreateGroup={handleGroupCreated}
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
      {/* Profile Sheet — Full-screen scrollable with 3:4 hero, overlays, pet icon, vertical fields, social album */}
      <AnimatePresence>
        {profileSheetUser && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-[80]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProfileSheetUser(null)}
            />
            <motion.div
              className="fixed inset-0 z-[81] bg-card overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              {/* Close button */}
              <button
                onClick={() => setProfileSheetUser(null)}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              {profileSheetLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-brandBlue" />
                </div>
              ) : profileSheetData?.non_social === true ? (
                <div className="flex items-center justify-center h-full p-6">
                  <div className="rounded-xl border border-border bg-muted/50 p-6 text-center max-w-xs">
                    <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                      <User className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-semibold text-brandText">{profileSheetUser.name}</div>
                    <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                      This user has enabled Non-Social mode and is not available for discovery or chat.
                    </div>
                  </div>
                </div>
              ) : profileSheetData ? (
                <div className="pb-8">
                  {/* 3:4 Hero Image — horizontal images fit to 4:3 container */}
                  <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
                    {(profileSheetData.avatar_url || profileSheetUser.avatarUrl) ? (
                      <img
                        src={(profileSheetData.avatar_url as string) || profileSheetUser.avatarUrl || ""}
                        alt={(profileSheetData.display_name as string) || profileSheetUser.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <User className="w-16 h-16 text-muted-foreground/40" />
                      </div>
                    )}
                    {/* Gradient overlay at bottom of image */}
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

                    {/* Overlays at bottom of image: Name, Age, Social Role, Pet Species, Verified + Car Badge */}
                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <div className="flex items-center gap-1.5 mb-1">
                        {profileSheetData.is_verified && (
                          <span className="px-2 py-0.5 rounded-full bg-brandGold/90 text-white text-[10px] font-bold">Verified</span>
                        )}
                        {profileSheetData.has_car && (
                          <span className="px-2 py-0.5 rounded-full bg-brandBlue/90 text-white text-[10px] font-bold">Car</span>
                        )}
                      </div>
                      <div className="text-lg font-bold leading-tight">
                        {(profileSheetData.display_name as string) || profileSheetUser.name}
                        {profileSheetData.show_age !== false && profileSheetData.dob && (
                          <span className="ml-1.5 text-base font-medium">
                            {Math.floor((Date.now() - new Date(profileSheetData.dob as string).getTime()) / (1000 * 60 * 60 * 24 * 365.25))}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/80 mt-0.5">
                        {profileSheetData.social_role ? (profileSheetData.social_role === "nannies" ? "Nanny" : profileSheetData.social_role === "animal-lovers" ? "Animal Lover" : "Playdate") : ""}
                        {Array.isArray(profileSheetData.pet_species) && (profileSheetData.pet_species as string[]).length > 0 && (
                          <> • {(profileSheetData.pet_species as string[]).join(", ")}</>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pet icon below image if owns pet */}
                  {Array.isArray(profileSheetData.pet_species) && (profileSheetData.pet_species as string[]).length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <PawPrint className="w-5 h-5 text-brandBlue" />
                      <span className="text-sm font-medium text-brandText">Pet Owner</span>
                    </div>
                  )}

                  {/* Vertical field list: Bio, Pet Species, Pet Experience, Location, Gender, Orientation, Relationship Status, Academic, Language, Social Album */}
                  <div className="divide-y divide-border">
                    {profileSheetData.show_bio !== false && profileSheetData.bio && (
                      <div className="px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 block mb-1">Bio</span>
                        <p className="text-sm text-brandText leading-relaxed">{profileSheetData.bio as string}</p>
                      </div>
                    )}

                    {Array.isArray(profileSheetData.pet_species) && (profileSheetData.pet_species as string[]).length > 0 && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Pet Species</span>
                        <span className="text-sm text-brandText">{(profileSheetData.pet_species as string[]).join(", ")}</span>
                      </div>
                    )}

                    {profileSheetData.pet_experience_years != null && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Pet Experience</span>
                        <span className="text-sm text-brandText">{profileSheetData.pet_experience_years as number} years</span>
                      </div>
                    )}

                    {profileSheetData.location_name && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Location</span>
                        <span className="text-sm text-brandText">{profileSheetData.location_name as string}</span>
                      </div>
                    )}

                    {profileSheetData.show_gender !== false && profileSheetData.gender_genre && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Gender</span>
                        <span className="text-sm text-brandText">{profileSheetData.gender_genre as string}</span>
                      </div>
                    )}

                    {profileSheetData.show_orientation !== false && profileSheetData.orientation && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Orientation</span>
                        <span className="text-sm text-brandText">{profileSheetData.orientation as string}</span>
                      </div>
                    )}

                    {profileSheetData.show_relationship_status !== false && profileSheetData.relationship_status && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Relationship</span>
                        <span className="text-sm text-brandText">{profileSheetData.relationship_status as string}</span>
                      </div>
                    )}

                    {profileSheetData.show_academic !== false && (profileSheetData.school || profileSheetData.major) && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Academic</span>
                        <span className="text-sm text-brandText">{[profileSheetData.school, profileSheetData.major].filter(Boolean).join(" • ")}</span>
                      </div>
                    )}

                    {Array.isArray(profileSheetData.languages) && (profileSheetData.languages as string[]).length > 0 && (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 w-28 flex-shrink-0">Language</span>
                        <span className="text-sm text-brandText">{(profileSheetData.languages as string[]).join(", ")}</span>
                      </div>
                    )}

                    {/* Social Album — thumbnail grid */}
                    {Array.isArray(profileSheetData.social_album) && (profileSheetData.social_album as string[]).length > 0 && (
                      <div className="px-4 py-3">
                        <span className="text-xs font-semibold text-brandText/60 block mb-2">Social Album</span>
                        <div className="grid grid-cols-3 gap-2">
                          {(profileSheetData.social_album as string[]).slice(0, 9).map((url: string, idx: number) => (
                            <img
                              key={`album-${idx}`}
                              src={url.startsWith("http") ? url : ""}
                              alt={`Album ${idx + 1}`}
                              className="w-full rounded-lg object-cover"
                              style={{ aspectRatio: "1/1" }}
                              loading="lazy"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Profile not found</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Discovery Filter Modal — chevron rows with per-filter selection UIs */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-[70]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsFilterModalOpen(false); setActiveFilterRow(null); }}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 max-h-[80vh] bg-card rounded-t-3xl z-[71] shadow-2xl overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-3 bg-card border-b border-border">
                <h3 className="text-base font-bold text-brandText">
                  {activeFilterRow ? activeFilterRow.label : t("Discovery Filters")}
                </h3>
                <button
                  onClick={() => {
                    if (activeFilterRow) { setActiveFilterRow(null); } else { setIsFilterModalOpen(false); }
                  }}
                  className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
                >
                  {activeFilterRow ? <ChevronRight className="w-5 h-5 rotate-180" /> : <X className="w-5 h-5" />}
                </button>
              </div>

              {/* Main list of filter rows */}
              {!activeFilterRow && (
                <div className="divide-y divide-border">
                  {FILTER_ROWS.map((row) => {
                    const locked =
                      (row.tier === "premium" && effectiveTier === "free") ||
                      (row.tier === "gold" && effectiveTier !== "gold");
                    return (
                      <button
                        key={row.key}
                        className="w-full flex items-center justify-between px-5 py-3.5 text-sm"
                        onClick={() => {
                          if (locked) {
                            const target = row.tier === "gold" ? "Gold" : "Premium";
                            toast.error(`Unlock ${target} to use this filter`);
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
                              {row.tier === "gold" ? "Gold" : "Premium"}
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
                  {/* Age Range */}
                  {activeFilterRow.key === "ageMin" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Min Age</label>
                          <input type="number" min={18} max={99} value={filters.ageMin}
                            onChange={(e) => setFilters((f) => ({ ...f, ageMin: Math.max(18, Math.min(99, Number(e.target.value))) }))}
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm" />
                        </div>
                        <span className="text-muted-foreground mt-5">–</span>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-brandText/70">Max Age</label>
                          <input type="number" min={18} max={99} value={filters.ageMax}
                            onChange={(e) => setFilters((f) => ({ ...f, ageMax: Math.max(f.ageMin, Math.min(99, Number(e.target.value))) }))}
                            className="w-full mt-1 h-9 px-2 py-1 text-left rounded-lg border border-border bg-background text-sm" />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground text-center">{filters.ageMin} – {filters.ageMax} years old</div>
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
                      {([["playdates", "Pet Parents"], ["nannies", "Nannies"], ["animal-lovers", "Animal Lovers"]] as const).map(([val, label]) => (
                        <button key={val}
                          onClick={() => setFilters((f) => ({ ...f, socialRoles: f.socialRoles.includes(val) ? f.socialRoles.filter((x) => x !== val) : [...f.socialRoles, val] }))}
                          className={cn("px-4 py-2 rounded-full text-sm font-medium border transition-colors",
                            filters.socialRoles.includes(val) ? "bg-brandBlue text-white border-brandBlue" : "bg-white text-brandText border-border")}>
                          {label}
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
                  {activeFilterRow.key === "hasPetExperience" && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-sm font-medium text-brandText">Show users with Pet Experience</span>
                      <Switch checked={filters.hasPetExperience} onCheckedChange={(v) => setFilters((f) => ({ ...f, hasPetExperience: v }))} />
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Chats;
