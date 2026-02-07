import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MessageSquare, Search, X, DollarSign, Loader2, HandMetal, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { CreateGroupDialog } from "@/components/chat/CreateGroupDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useApi } from "@/hooks/useApi";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useUpsell } from "@/hooks/useUpsell";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { demoUsers } from "@/lib/demoData";

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

type MainTab = "chats" | "groups";
const filterTabs = [
  { id: "nannies", labelKey: "social.nannies" },
  { id: "playdates", labelKey: "social.playdates" },
  { id: "animal-lovers", labelKey: "social.animal_lovers" },
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
  const { checkStarsAvailable } = useUpsell();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("chats");
  const [activeFilterTab, setActiveFilterTab] = useState("nannies");
  const [chats, setChats] = useState<ChatUser[]>(mockChats);
  const [groups, setGroups] = useState<Group[]>(mockGroups);
  const [chatVisibleCount, setChatVisibleCount] = useState(10);
  const [groupVisibleCount, setGroupVisibleCount] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryRole, setDiscoveryRole] = useState("playdates");
  const [discoveryDistance, setDiscoveryDistance] = useState(10);
  const [discoveryPetSize, setDiscoveryPetSize] = useState("Any");
  const [discoveryGender, setDiscoveryGender] = useState("Any");
  const [discoverySpecies, setDiscoverySpecies] = useState("Any");
  const [discoveryMinAge, setDiscoveryMinAge] = useState(18);
  const [discoveryMaxAge, setDiscoveryMaxAge] = useState(99);
  const [hiddenDiscoveryIds, setHiddenDiscoveryIds] = useState<Set<string>>(new Set());
  const [selectedDiscovery, setSelectedDiscovery] = useState<DiscoveryProfile | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [activeAlbumIndex, setActiveAlbumIndex] = useState(0);
  const [albumUrls, setAlbumUrls] = useState<Record<string, string[]>>({});
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

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

  useEffect(() => {
    if (!profile?.dob) return;
    const birthDate = new Date(profile.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    setDiscoveryMinAge(Math.max(18, age - 3));
    setDiscoveryMaxAge(Math.min(99, age + 3));
  }, [profile?.dob]);

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
          .from("sitter_profiles")
          .select("hourly_rate")
          .eq("user_id", selectedNanny.id)
          .maybeSingle()
          .then(({ data }) => {
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

  // Load conversations from backend
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const data = await getConversations();
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

  // Discovery cards (embedded in Chats)
  useEffect(() => {
    const runDiscovery = async () => {
      if (!profile?.id || profile.last_lat == null || profile.last_lng == null) return;
      setDiscoveryLoading(true);
      try {
        const minAge = Math.max(16, discoveryMinAge || 16);
        const maxAge = Math.max(minAge, discoveryMaxAge || 99);
        const payload = {
          userId: profile.id,
          lat: profile.last_lat,
          lng: profile.last_lng,
          radiusKm: discoveryDistance,
          role: discoveryRole,
          gender: discoveryGender !== "Any" ? discoveryGender : null,
          species: discoverySpecies !== "Any" ? [discoverySpecies] : null,
          petSize: discoveryPetSize !== "Any" ? discoveryPetSize : null,
          minAge,
          maxAge,
          // Premium/Gold get advanced filters; free uses basic only
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
    discoveryDistance,
    discoveryRole,
    discoveryPetSize,
    discoveryGender,
    discoverySpecies,
    discoveryMinAge,
    discoveryMaxAge,
    isPremium
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

  // Filter chats based on active tab and search
  const filteredChats = chats.filter(chat => {
    const matchesTab =
      activeFilterTab === "nannies" ? chat.type === "nannies" :
      activeFilterTab === "playdates" ? chat.type === "playdates" :
      activeFilterTab === "animal-lovers" ? chat.type === "animal-lovers" : true;

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
    if (discoveryRole && p.social_role !== discoveryRole) return false;
    if (discoverySpecies !== "Any") {
      const species = (p.pet_species || []).map((s: string) => s.toLowerCase());
      if (!species.includes(discoverySpecies.toLowerCase())) return false;
    }
    if (discoveryGender !== "Any" && p.gender_genre !== discoveryGender) return false;
    const age = p.dob
      ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : null;
    if (age !== null && (age < discoveryMinAge || age > discoveryMaxAge)) return false;
    if (discoveryPetSize !== "Any") {
      const size = resolveDemoPetSize(p);
      if (!size || size !== discoveryPetSize) return false;
    }
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
    // Navigate to ChatDialogue with id + name params
    navigate(`/chat-dialogue?id=${chat.id}&name=${encodeURIComponent(chat.name)}`);
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
    navigate(`/chat-dialogue?id=${group.id}&name=${encodeURIComponent(group.name)}`);
  };

  // Nanny Booking: Open modal
  const handleNannyBookClick = (e: React.MouseEvent, chat: ChatUser) => {
    e.stopPropagation(); // Don't navigate to chat
    setSelectedNanny(chat);
    setShowSafeHarborModal(true);
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

        {/* Discovery Cards (embedded in Chats) */}
      <section className="px-5 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
          <select
            value={discoveryRole}
            onChange={(e) => setDiscoveryRole(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
          >
            <option value="playdates">{t("Playdates")}</option>
            <option value="nannies">{t("Nannies")}</option>
            <option value="animal-lovers">{t("Animal Lovers")}</option>
          </select>
          <select
            value={discoverySpecies}
            onChange={(e) => setDiscoverySpecies(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
          >
            {discoverySpeciesOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.label)}
              </option>
            ))}
          </select>
          <select
            value={discoveryGender}
            onChange={(e) => setDiscoveryGender(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
          >
            <option value="Any">{t("Any Gender")}</option>
            {["Male", "Female", "Non-binary", "PNA"].map((gender) => (
              <option key={gender} value={gender}>{gender}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 h-9">
            <span className="text-[10px] text-muted-foreground">{t("Age")}</span>
            <input
              type="number"
              min={16}
              max={99}
              value={discoveryMinAge}
              onChange={(e) => setDiscoveryMinAge(Number(e.target.value || 16))}
              className="w-12 bg-transparent text-[10px] outline-none"
            />
            <span className="text-[10px] text-muted-foreground">-</span>
            <input
              type="number"
              min={16}
              max={99}
              value={discoveryMaxAge}
              onChange={(e) => setDiscoveryMaxAge(Number(e.target.value || 99))}
              className="w-12 bg-transparent text-[10px] outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 h-9">
            <span className="text-[10px] text-muted-foreground">{discoveryDistance}km</span>
            <input
              type="range"
              min={0}
              max={150}
              value={discoveryDistance}
              onChange={(e) => setDiscoveryDistance(Number(e.target.value))}
              className="w-24 accent-primary"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 h-9">
            <span className="text-[10px] text-muted-foreground">{t("Pet Size")}</span>
            <select
              value={discoveryPetSize}
              onChange={(e) => setDiscoveryPetSize(e.target.value)}
              className="bg-transparent text-xs outline-none"
              aria-label={t("Pet Size")}
            >
              {["Any", "Small", "Medium", "Large"].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
          {discoveryLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("Loading discovery...")}
            </div>
          )}
          {discoverySource.map((p) => {
            const age = p?.dob
              ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
              : "";
            const petSpeciesList = Array.isArray(p?.pet_species)
              ? p.pet_species
              : Array.isArray(p?.pets) && p.pets.length > 0
              ? p.pets.map((pet: { species?: string | null }) => pet.species || "")
              : [];
            const petSpecies = petSpeciesList.length > 0 ? petSpeciesList.join(", ") : "—";
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
                className="min-w-[260px] rounded-2xl border border-border bg-card shadow-card overflow-hidden relative cursor-pointer"
                onClick={() => {
                  setSelectedDiscovery(p);
                  setActiveAlbumIndex(0);
                  setShowDiscoveryModal(true);
                }}
              >
                {cover ? (
                  <img src={cover} alt={p.display_name || ""} className="h-44 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-44 w-full bg-muted" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />

                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.success(t("Wave sent"));
                    }}
                    className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                  >
                    <HandMetal className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await checkStarsAvailable();
                      if (!ok) {
                        toast.error(t("Buy a star pack to immediately chat with the user"));
                        return;
                      }
                      const { data: allowed } = await supabase.rpc("check_and_increment_quota", {
                        action_type: "star",
                      });
                      if (allowed === false) {
                        toast.error(t("No stars remaining"));
                        return;
                      }
                      navigate(`/chat-dialogue?id=${p.id}&name=${encodeURIComponent(p.display_name || "")}`);
                    }}
                    className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center"
                  >
                    <Star className="w-4 h-4 text-[#3283FF]" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHiddenDiscoveryIds((prev) => new Set(prev).add(p.id));
                    }}
                    className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="text-sm font-semibold">{p.display_name}</div>
                  <div className="text-xs text-white/80">
                    {age ? `${age} • ${p.relationship_status || "—"}` : p.relationship_status || "—"}
                  </div>
                  <div className="text-xs text-white/80 mt-1">{t("Pet")}: {petSpecies}</div>
                </div>
              </div>
            );
          })}
        </div>

        {discoveryProfiles.length > 0 && discoverySource.length === 0 && (
            <div className="mt-2">
              <button
                onClick={() => {
                  setDiscoveryDistance((prev) => Math.min(150, prev + 15));
                  setHiddenDiscoveryIds(new Set());
                }}
                className="text-xs font-medium text-[#3283ff] underline"
              >
                {t("Run out of huddlers? Expand search.")}
              </button>
            </div>
          )}
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

      {/* Main Tabs - Chats / Groups */}
      <section className="px-5 py-2">
        <div className="flex gap-2 p-1 bg-muted rounded-xl">
          {[
            { id: "chats" as MainTab, labelKey: "chats.tab.chats", icon: MessageSquare },
            { id: "groups" as MainTab, labelKey: "chats.tab.groups", icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                mainTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* Chats View */}
      {mainTab === "chats" && (
        <>
          {/* Filter Tabs */}
          <section className="px-5 py-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilterTab(tab.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                    activeFilterTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
          </section>

          {activeFilterTab === "nannies" && (
            <section className="px-5">
              <div className="rounded-xl bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                Book verified Pet Nannies for safety. We offer secure payments but are not liable for service disputes or losses.
              </div>
            </section>
          )}

          {/* Chat List */}
          <section className="px-5">
            <div className="space-y-2">
              {filteredChats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">{t("No conversations found")}</p>
                </div>
              ) : (
                filteredChats.slice(0, chatVisibleCount).map((chat, index) => (
                  <motion.div
                    key={chat.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleChatClick(chat)}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -120) {
                        handleRemoveChat(chat);
                      }
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-card shadow-card cursor-pointer hover:bg-accent/5 transition-colors"
                  >
                    <div className="relative">
                      <UserAvatar
                        avatarUrl={chat.avatarUrl}
                        name={chat.name}
                        isVerified={chat.isVerified}
                        hasCar={chat.hasCar}
                        isPremium={chat.isPremium}
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
                      <p className="text-sm text-muted-foreground truncate mt-1">{t(chat.lastMessage)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Blue $ icon for nanny-type chats — opens booking modal */}
                      {chat.type === "nannies" && (
                        <button
                          onClick={(e) => handleNannyBookClick(e, chat)}
                          className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-110"
                          style={{ backgroundColor: "#A6D539" }}
                          title={t("Book Nanny")}
                        >
                          <DollarSign className="w-4 h-4 text-white" />
                        </button>
                      )}
                      {chat.unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                          {chat.unread}
                        </span>
                      )}
                    </div>
                  </motion.div>
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
          </section>
        </>
      )}

      {/* Groups View */}
      {mainTab === "groups" && (
        <section className="px-5 pt-2">
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
                  {/* Group Avatar */}
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{t(group.name)}</h4>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {group.memberCount} members
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{t(group.time)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      <span className="font-medium">{t(group.lastMessageSender)}:</span> {t(group.lastMessage)}
                    </p>
                  </div>

                  {group.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium flex-shrink-0">
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
        </section>
      )}

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

      <Dialog open={showSafeHarborModal} onOpenChange={setShowSafeHarborModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Safe Harbor Agreement</DialogTitle>
          </DialogHeader>
          <label className="text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={safeHarborAccepted}
              onChange={(e) => setSafeHarborAccepted(e.target.checked)}
              className="mr-2 align-middle"
            />
            I acknowledge that 'huddle' is a marketplace platform and sitters are independent contractors, not employees of 'huddle'. 'huddle' is not responsible for any injury, property damage, or loss occurring during a booking. I agree to use the in-app dispute resolution system before contacting any financial institution for a chargeback.
          </label>
          <DialogFooter>
            <Button
              disabled={!safeHarborAccepted}
              onClick={() => {
                setShowSafeHarborModal(false);
                setNannyBookingOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  className="w-full h-10 rounded-xl bg-muted border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">{t("booking.amount")}</label>
                <div className="flex items-center gap-2">
                  <select
                    value={bookingCurrency}
                    onChange={(e) => setBookingCurrency(e.target.value)}
                    className="h-12 rounded-xl bg-muted border border-border px-2 text-sm"
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
                    className="flex-1 h-12 rounded-xl bg-muted border border-border px-4 text-lg font-semibold outline-none focus:ring-2 focus:ring-primary/50"
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
    </div>
  );
};

export default Chats;
