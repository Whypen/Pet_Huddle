import { useState } from "react";
import { motion } from "framer-motion";
import { Settings, Search, MapPin, Cross, Coffee, TreePine, AlertTriangle } from "lucide-react";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { cn } from "@/lib/utils";

const filterChips = [
  { id: "open", label: "Open Now", active: true },
  { id: "vets", label: "Vets", active: false },
  { id: "parks", label: "Parks", active: false },
  { id: "cafes", label: "Cafes", active: false },
];

const locations = [
  { id: 1, type: "vet", name: "24/7 ER Vet", lat: 35, left: 20 },
  { id: 2, type: "park", name: "Central Park Dog Run", lat: 45, left: 55 },
  { id: 3, type: "cafe", name: "Paws & Coffee", lat: 60, left: 75 },
  { id: 4, type: "park", name: "Victoria Park", lat: 70, left: 30 },
];

const checkedInUsers = [
  { id: 1, name: "Marcus", location: "Central Park Dog Run", x: 55, y: 42 },
  { id: 2, name: "Sarah", location: "Victoria Park", x: 32, y: 68 },
];

const Map = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState(["open"]);

  const toggleFilter = (id: string) => {
    setActiveFilters(prev => 
      prev.includes(id) 
        ? prev.filter(f => f !== id)
        : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with Search */}
      <header className="px-4 pt-6 pb-3 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find dog parks, vets, or friends..."
              className="w-full bg-muted rounded-full pl-12 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <Settings className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Filter Chips */}
      <div className="px-4 py-3 bg-card border-b border-border">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => toggleFilter(chip.id)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                activeFilters.includes(chip.id)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-gradient-to-b from-primary-soft to-accent-soft overflow-hidden">
        {/* Map Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px),
              linear-gradient(hsl(var(--border)) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Heatmap Overlay */}
        <div className="absolute" style={{ top: '35%', left: '45%', width: '120px', height: '120px' }}>
          <div className="w-full h-full rounded-full bg-warning/30 blur-2xl" />
        </div>

        {/* Location Markers */}
        {locations.map((location, index) => (
          <motion.div
            key={location.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className="absolute cursor-pointer"
            style={{ top: `${location.lat}%`, left: `${location.left}%` }}
          >
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shadow-card",
              location.type === "vet" && "bg-destructive",
              location.type === "park" && "bg-accent",
              location.type === "cafe" && "bg-primary"
            )}>
              {location.type === "vet" && <Cross className="w-5 h-5 text-destructive-foreground" />}
              {location.type === "park" && <TreePine className="w-5 h-5 text-accent-foreground" />}
              {location.type === "cafe" && <Coffee className="w-5 h-5 text-primary-foreground" />}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-card px-2 py-1 rounded-lg shadow-sm whitespace-nowrap">
              <span className="text-xs font-medium">{location.name}</span>
            </div>
          </motion.div>
        ))}

        {/* Checked-in Users */}
        {checkedInUsers.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5 + index * 0.1 }}
            className="absolute"
            style={{ top: `${user.y}%`, left: `${user.x}%` }}
          >
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent p-0.5 shadow-elevated">
                <div className="w-full h-full rounded-full bg-card flex items-center justify-center text-sm font-bold">
                  {user.name.charAt(0)}
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-card" />
            </div>
          </motion.div>
        ))}

        {/* Status Indicators */}
        <div className="absolute bottom-4 left-4 right-4 flex gap-3">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex-1 bg-warning/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-card"
          >
            <div className="flex items-center gap-2 text-foreground">
              <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
              <span className="text-sm font-medium">Central Park: Busy</span>
            </div>
          </motion.div>
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            whileTap={{ scale: 0.95 }}
            className="bg-destructive text-destructive-foreground rounded-xl px-4 py-3 shadow-card flex items-center gap-2"
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-semibold">Live Alert</span>
          </motion.button>
        </div>
      </div>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Map;
