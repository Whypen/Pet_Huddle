import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Users, MessageSquare, Search, X } from "lucide-react";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { CreateGroupDialog } from "@/components/chat/CreateGroupDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

type MainTab = "Chats" | "Groups";
const filterTabs = ["Nannies", "Playdates", "Animal Lovers"];

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
    isOnline: true
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
    isOnline: true
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
    isOnline: false
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
    isOnline: true
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
    isOnline: false
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

const newHuddles = [
  { id: "h1", name: "Emma", isNew: true, avatarUrl: null, isVerified: true, hasCar: false, isPremium: false },
  { id: "h2", name: "James", isNew: true, avatarUrl: null, isVerified: false, hasCar: true, isPremium: true },
  { id: "h3", name: "Lily", isNew: false, avatarUrl: null, isVerified: true, hasCar: true, isPremium: false },
];

const Chats = () => {
  const { profile } = useAuth();
  const { isConnected, onNewMessage, onOnlineStatus } = useWebSocket();
  const { getConversations } = useApi();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("Chats");
  const [activeFilterTab, setActiveFilterTab] = useState("Nannies");
  const [chats, setChats] = useState<ChatUser[]>(mockChats);
  const [groups, setGroups] = useState<Group[]>(mockGroups);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const isVerified = profile?.is_verified;

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
    const tabKey = activeFilterTab.toLowerCase().replace(" ", "-");
    const matchesTab =
      tabKey === "nannies" ? chat.type === "nannies" :
      tabKey === "playdates" ? chat.type === "playdates" :
      tabKey === "animal-lovers" ? chat.type === "animal-lovers" : true;

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

  const handleCreateGroup = () => {
    if (!isVerified) {
      toast.error("Only verified users can create groups");
      return;
    }
    setIsCreateGroupOpen(true);
  };

  const handleGroupCreated = (groupData: { name: string; members: any[]; allowMemberControl: boolean }) => {
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
    // Navigate to chat detail (would implement full chat view)
    toast.info(`Opening chat with ${chat.name}`);
  };

  const handleGroupClick = (group: Group) => {
    // Mark as read
    setGroups(prev => prev.map(g =>
      g.id === group.id ? { ...g, unread: 0 } : g
    ));
    // Navigate to group detail
    toast.info(`Opening group: ${group.name}`);
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <h1 className="text-2xl font-bold">Messages</h1>
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
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </header>

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
                placeholder="Search conversations..."
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
          {(["Chats", "Groups"] as MainTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                mainTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "Chats" ? (
                <MessageSquare className="w-4 h-4" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              {tab}
            </button>
          ))}
        </div>
      </section>

      {/* Chats View */}
      {mainTab === "Chats" && (
        <>
          {/* Filter Tabs */}
          <section className="px-5 py-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {filterTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveFilterTab(tab)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                    activeFilterTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </section>

          {/* New Huddles */}
          <section className="px-5 py-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">New Huddles</h3>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {newHuddles.map((huddle, index) => (
                <motion.button
                  key={huddle.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col items-center gap-2 flex-shrink-0"
                >
                  <div className={cn(
                    "p-0.5 rounded-full",
                    huddle.isNew
                      ? "bg-gradient-to-br from-primary to-accent"
                      : "bg-border"
                  )}>
                    <div className="p-0.5 rounded-full bg-background">
                      <UserAvatar
                        avatarUrl={huddle.avatarUrl}
                        name={huddle.name}
                        isVerified={huddle.isVerified}
                        hasCar={huddle.hasCar}
                        isPremium={huddle.isPremium}
                        size="lg"
                        showBadges={true}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium">{huddle.name}</span>
                </motion.button>
              ))}
            </div>
          </section>

          {/* Chat List */}
          <section className="px-5">
            <div className="space-y-2">
              {filteredChats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-muted-foreground">No conversations found</p>
                </div>
              ) : (
                filteredChats.map((chat, index) => (
                  <motion.div
                    key={chat.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleChatClick(chat)}
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
                        <div className="absolute top-0 left-0 w-3 h-3 rounded-full bg-green-500 ring-2 ring-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{chat.name}</h4>
                        <span className="text-xs text-muted-foreground">{chat.time}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-1">{chat.lastMessage}</p>
                    </div>
                    {chat.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium flex-shrink-0">
                        {chat.unread}
                      </span>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {/* Groups View */}
      {mainTab === "Groups" && (
        <section className="px-5 pt-2">
          <div className="space-y-2">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No groups found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isVerified ? "Create a group to start chatting!" : "Get verified to create groups"}
                </p>
              </div>
            ) : (
              filteredGroups.map((group, index) => (
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
                        <h4 className="font-semibold">{group.name}</h4>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {group.memberCount} members
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{group.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      <span className="font-medium">{group.lastMessageSender}:</span> {group.lastMessage}
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
        </section>
      )}

      {/* Connection Status */}
      {!isConnected && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-yellow-500/90 text-yellow-900 text-xs font-medium rounded-full shadow-lg">
          Connecting to chat server...
        </div>
      )}

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onCreateGroup={handleGroupCreated}
      />
    </div>
  );
};

export default Chats;
