import { useState } from "react";
import { motion } from "framer-motion";
import { Settings, Check } from "lucide-react";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { cn } from "@/lib/utils";

const filterTabs = ["Friends", "Nannies", "Groups"];

const newHuddles = [
  { id: 1, name: "Emma", isNew: true },
  { id: 2, name: "James", isNew: true },
  { id: 3, name: "Lily", isNew: false },
];

const chats = [
  { 
    id: 1, 
    name: "Marcus", 
    verified: true, 
    lastMessage: "Sure! Let's meet at Central Park around 3pm?", 
    time: "2m ago",
    unread: 2,
    type: "friend"
  },
  { 
    id: 2, 
    name: "Pet Care Pro", 
    verified: true, 
    lastMessage: "I can take care of Max this weekend!", 
    time: "1h ago",
    unread: 0,
    type: "nanny"
  },
  { 
    id: 3, 
    name: "Sarah", 
    verified: false, 
    lastMessage: "Thanks for the playdate! Bella had so much fun 🐕", 
    time: "3h ago",
    unread: 0,
    type: "friend"
  },
  { 
    id: 4, 
    name: "Golden Retriever Club", 
    verified: false, 
    lastMessage: "Emma: Anyone going to the dog run today?", 
    time: "Yesterday",
    unread: 5,
    type: "group"
  },
];

const Chats = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Friends");

  const filteredChats = chats.filter(chat => {
    if (activeTab === "Friends") return chat.type === "friend";
    if (activeTab === "Nannies") return chat.type === "nanny";
    if (activeTab === "Groups") return chat.type === "group";
    return true;
  });

  return (
    <div className="min-h-screen bg-background pb-nav">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold">Chats</h1>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <Settings className="w-6 h-6 text-muted-foreground" />
        </button>
      </header>

      {/* Filter Tabs */}
      <section className="px-5 py-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab
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
                "w-16 h-16 rounded-full p-0.5",
                huddle.isNew 
                  ? "bg-gradient-to-br from-primary to-accent" 
                  : "bg-border"
              )}>
                <div className="w-full h-full rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
                  {huddle.name.charAt(0)}
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
          {filteredChats.map((chat, index) => (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-card shadow-card"
            >
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-semibold">
                  {chat.name.charAt(0)}
                </div>
                {chat.verified && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-3 h-3 text-accent-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{chat.name}</h4>
                  <span className="text-xs text-muted-foreground">{chat.time}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate mt-1">{chat.lastMessage}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {chat.unread > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                    {chat.unread}
                  </span>
                )}
                {chat.type === "nanny" && (
                  <button className="px-3 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded-full">
                    Book Now
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Chats;
