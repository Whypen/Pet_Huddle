import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Settings, 
  Search, 
  AlertTriangle, 
  X,
  ThumbsUp,
  Flag,
  EyeOff,
  Ban,
  Loader2,
  MapPin,
  Camera
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const alertTypeColors: Record<string, string> = {
  Stray: "#3B82F6",
  Lost: "#EF4444",
  Found: "#22C55E",
};

const createAlertIcon = (type: string) => {
  return L.divIcon({
    className: 'custom-alert-icon',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background-color: ${alertTypeColors[type] || '#3B82F6'};
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

interface MapAlert {
  id: string;
  latitude: number;
  longitude: number;
  alert_type: string;
  description: string | null;
  photo_url: string | null;
  support_count: number;
  report_count: number;
  created_at: string;
  creator: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface LocationSelectorProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

const LocationSelector = ({ onLocationSelect }: LocationSelectorProps) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const filterChips = [
  { id: "all", label: "All" },
  { id: "Stray", label: "Stray" },
  { id: "Lost", label: "Lost" },
  { id: "Found", label: "Found" },
];

const Map = () => {
  const { user, profile } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [alerts, setAlerts] = useState<MapAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [alertType, setAlertType] = useState("Stray");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<MapAlert | null>(null);
  const [hiddenAlerts, setHiddenAlerts] = useState<Set<string>>(new Set());
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  // Default center (Hong Kong)
  const defaultCenter: [number, number] = [22.2828, 114.1583];

  useEffect(() => {
    fetchAlerts();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('map_alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'map_alerts',
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("map_alerts")
        .select(`
          id,
          latitude,
          longitude,
          alert_type,
          description,
          photo_url,
          support_count,
          report_count,
          created_at,
          creator:profiles!map_alerts_creator_id_fkey(
            display_name,
            avatar_url
          )
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAlert = async () => {
    if (!user || !selectedLocation) {
      toast.error("Please select a location on the map");
      return;
    }

    setCreating(true);

    try {
      let photoUrl = null;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("alerts")
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("alerts")
          .getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      const { error } = await supabase
        .from("map_alerts")
        .insert({
          creator_id: user.id,
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
          alert_type: alertType,
          description: description.trim() || null,
          photo_url: photoUrl,
        });

      if (error) throw error;

      toast.success("Alert broadcasted!");
      resetCreateForm();
      fetchAlerts();
    } catch (error: any) {
      toast.error(error.message || "Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setIsCreateOpen(false);
    setSelectedLocation(null);
    setAlertType("Stray");
    setDescription("");
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSupport = async (alertId: string) => {
    if (!user) {
      toast.error("Please login to support alerts");
      return;
    }

    try {
      // Add interaction
      await supabase
        .from("alert_interactions")
        .insert({
          alert_id: alertId,
          user_id: user.id,
          interaction_type: "support",
        });

      // Update count
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        await supabase
          .from("map_alerts")
          .update({ support_count: alert.support_count + 1 })
          .eq("id", alertId);
      }

      toast.success("Thanks for your support!");
      fetchAlerts();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.info("You've already supported this alert");
      } else {
        toast.error("Failed to support alert");
      }
    }
  };

  const handleReport = async (alertId: string) => {
    if (!user) {
      toast.error("Please login to report alerts");
      return;
    }

    try {
      await supabase
        .from("alert_interactions")
        .insert({
          alert_id: alertId,
          user_id: user.id,
          interaction_type: "report",
        });

      toast.success("Alert reported");
    } catch (error: any) {
      if (error.code === '23505') {
        toast.info("You've already reported this alert");
      } else {
        toast.error("Failed to report alert");
      }
    }
  };

  const handleHide = (alertId: string) => {
    setHiddenAlerts(prev => new Set([...prev, alertId]));
    setSelectedAlert(null);
    toast.success("Alert hidden");
  };

  const handleBlockUser = (creatorId: string) => {
    setBlockedUsers(prev => new Set([...prev, creatorId]));
    setSelectedAlert(null);
    toast.success("You won't see posts from this user");
  };

  const filteredAlerts = alerts.filter(alert => {
    if (hiddenAlerts.has(alert.id)) return false;
    if (activeFilter === "all") return true;
    return alert.alert_type === activeFilter;
  });

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-nav">
      {/* Header */}
      <header className="px-4 pt-6 pb-3 bg-card z-10">
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
      <div className="px-4 py-3 bg-card border-b border-border z-10">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                activeFilter === chip.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {isCreateOpen && (
              <LocationSelector 
                onLocationSelect={(lat, lng) => setSelectedLocation({ lat, lng })} 
              />
            )}
            
            {/* Selected location marker */}
            {selectedLocation && (
              <Marker 
                position={[selectedLocation.lat, selectedLocation.lng]}
                icon={createAlertIcon(alertType)}
              />
            )}
            
            {/* Alert markers */}
            {filteredAlerts.map((alert) => (
              <Marker
                key={alert.id}
                position={[alert.latitude, alert.longitude]}
                icon={createAlertIcon(alert.alert_type)}
                eventHandlers={{
                  click: () => setSelectedAlert(alert),
                }}
              />
            ))}
          </MapContainer>
        )}

        {/* Create Alert Mode Overlay */}
        {isCreateOpen && (
          <div className="absolute top-4 left-4 right-4 bg-card rounded-xl p-4 shadow-elevated z-[1000]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Tap map to select location</h3>
              <button onClick={resetCreateForm}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {selectedLocation && (
              <p className="text-sm text-muted-foreground">
                📍 {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
              </p>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="absolute bottom-4 left-4 right-4 z-[1000]">
          {!isCreateOpen ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsCreateOpen(true)}
              className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 shadow-elevated flex items-center justify-center gap-2 font-semibold"
            >
              <AlertTriangle className="w-5 h-5" />
              Broadcast Alert
            </motion.button>
          ) : selectedLocation ? (
            <div className="bg-card rounded-xl p-4 shadow-elevated space-y-4">
              {/* Alert Type */}
              <div className="flex gap-2">
                {["Stray", "Lost", "Found"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setAlertType(type)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                      alertType === type
                        ? "text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                    style={{
                      backgroundColor: alertType === type ? alertTypeColors[type] : undefined
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
              
              {/* Description */}
              <Textarea
                placeholder="Describe what you saw (optional)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl min-h-[80px]"
              />
              
              {/* Image */}
              {imagePreview ? (
                <div className="relative">
                  <img 
                    src={imagePreview} 
                    alt="" 
                    className="rounded-xl max-h-32 object-cover w-full" 
                  />
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Camera className="w-5 h-5" />
                  Add photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              )}
              
              {/* Submit */}
              <Button
                onClick={handleCreateAlert}
                disabled={creating}
                className="w-full h-12 rounded-xl"
                style={{ backgroundColor: alertTypeColors[alertType] }}
              >
                {creating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  `Broadcast ${alertType} Alert`
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Alert Detail Modal */}
      <AnimatePresence>
        {selectedAlert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/50 flex items-end"
            onClick={() => setSelectedAlert(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-card rounded-t-3xl p-6 max-h-[70vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span 
                    className="px-3 py-1 rounded-full text-white text-sm font-medium"
                    style={{ backgroundColor: alertTypeColors[selectedAlert.alert_type] }}
                  >
                    {selectedAlert.alert_type}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatTimeAgo(selectedAlert.created_at)}
                  </span>
                </div>
                <button onClick={() => setSelectedAlert(null)}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              {selectedAlert.photo_url && (
                <img 
                  src={selectedAlert.photo_url} 
                  alt="" 
                  className="w-full rounded-xl mb-4 max-h-48 object-cover" 
                />
              )}

              {selectedAlert.description && (
                <p className="text-foreground mb-4">{selectedAlert.description}</p>
              )}

              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  {selectedAlert.creator?.avatar_url ? (
                    <img 
                      src={selectedAlert.creator.avatar_url} 
                      alt="" 
                      className="w-full h-full rounded-full object-cover" 
                    />
                  ) : (
                    <span className="text-xs font-semibold">
                      {selectedAlert.creator?.display_name?.charAt(0) || "?"}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium">
                  {selectedAlert.creator?.display_name || "Anonymous"}
                </span>
                <span className="text-sm text-muted-foreground ml-auto">
                  {selectedAlert.support_count} supports
                </span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Button
                  onClick={() => handleSupport(selectedAlert.id)}
                  className="h-12 rounded-xl bg-accent hover:bg-accent/90"
                >
                  <ThumbsUp className="w-5 h-5 mr-2" />
                  Support
                </Button>
                <Button
                  onClick={() => handleReport(selectedAlert.id)}
                  variant="outline"
                  className="h-12 rounded-xl"
                >
                  <Flag className="w-5 h-5 mr-2" />
                  Report
                </Button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleHide(selectedAlert.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <EyeOff className="w-4 h-4" />
                  Hide
                </button>
                <button
                  onClick={() => selectedAlert.creator && handleBlockUser(selectedAlert.creator.display_name || "")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-destructive"
                >
                  <Ban className="w-4 h-4" />
                  Block User
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Map;
