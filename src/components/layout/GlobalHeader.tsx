import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Diamond, Settings, Star, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import huddleLogo from "@/assets/huddle-name-transparent.png";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface GlobalHeaderProps {
  onUpgradeClick?: () => void;
  onMenuClick?: () => void;
}

interface Pet {
  id: string;
  name: string;
  photo_url: string | null;
  species: string;
}

export const GlobalHeader = ({ onUpgradeClick, onMenuClick }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [pets, setPets] = useState<Pet[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const isVerified = !!profile?.is_verified || String(profile?.verification_status ?? "").toLowerCase() === "approved";
  const isPending = !isVerified && String(profile?.verification_status ?? "").toLowerCase() === "pending";
  const initials = useMemo(() => {
    const name = profile?.display_name || "User";
    return name.trim().slice(0, 1).toUpperCase();
  }, [profile?.display_name]);

  // Fetch user's pets
  useEffect(() => {
    if (user) {
      fetchPets();
    }
  }, [user]);

  const fetchPets = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, photo_url, species")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (!error && data) {
        setPets(data);
      }
    } catch (err) {
      console.error("Error fetching pets:", err);
    }
  };

  // Contract: Notification Hub bell + red dot when unread > 0.
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const refreshUnread = async () => {
      const res = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (cancelled) return;
      setUnreadCount(res.count ?? 0);
    };

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          // Re-fetch unread count on any change.
          void refreshUnread();
        }
      )
      .subscribe();

    void refreshUnread();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleLogoClick = () => {
    navigate('/');
  };

  const handlePetClick = () => {
    if (pets.length > 0) {
      navigate(`/edit-pet-profile?id=${pets[0].id}`);
    } else {
      navigate('/edit-pet-profile');
    }
  };

  const hasPets = pets.length > 0;
  const firstPet = pets[0];

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
      <div className="flex items-center justify-between px-4 max-w-md mx-auto h-12">
        {/* Left: Notification Bell */}
        <button
          onClick={() => navigate("/notifications")}
          className="relative p-2 rounded-full hover:bg-muted transition-colors"
          aria-label={t("Notifications")}
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 ? (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
          ) : null}
        </button>

        {/* Centered Logo */}
        <button
          onClick={handleLogoClick}
          className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity"
        >
          <img
            src={huddleLogo}
            alt={t("huddle")}
            className="h-7 w-auto max-w-[140px] object-contain"
          />
        </button>

        {/* Right: Settings (Gear) menu (popover/drawer) */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              onClick={() => {
                if (onMenuClick) {
                  onMenuClick();
                  return;
                }
                setMenuOpen(true);
              }}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              aria-label={t("Settings")}
            >
              <Settings className="w-5 h-5 text-muted-foreground" />
            </button>
          </SheetTrigger>
          <SheetContent className="p-4 w-[320px] sm:max-w-sm">
            {/* Menu order (UAT): Avatar/Name/Badge -> Unlock blocks -> Profile link */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center font-extrabold bg-muted border-2 text-brandText",
                    isVerified ? "border-brandGold" : "border-gray-300",
                  )}
                  aria-label="Avatar"
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-base font-extrabold text-brandText truncate">
                      {profile?.display_name || "User"}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-5 h-5 rounded-full border-2 flex-shrink-0",
                        isVerified ? "border-brandGold" : "border-gray-300",
                      )}
                      aria-label={isVerified ? "Verified" : isPending ? "Pending" : "Not verified"}
                    />
                  </div>
                  <div className="text-xs text-brandText/60 truncate">{user?.email || ""}</div>
                </div>
              </div>

              <div className="flex gap-3 w-full">
                <SheetClose asChild>
                  <button
                    onClick={() => navigate("/premium?tab=Premium")}
                    className="flex-1 min-w-0 rounded-[16px] bg-brandBlue text-white p-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Diamond className="w-4 h-4 text-white" />
                      <div className="text-sm font-extrabold">Unlock Premium</div>
                    </div>
                  </button>
                </SheetClose>

                <SheetClose asChild>
                  <button
                    onClick={() => navigate("/premium?tab=Gold")}
                    className="flex-1 min-w-0 rounded-[16px] bg-brandGold text-white p-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-white" />
                      <div className="text-sm font-extrabold">Unlock Gold</div>
                    </div>
                  </button>
                </SheetClose>
              </div>

              <div className="pt-1">
                <SheetClose asChild>
                  <button
                    onClick={() => navigate("/edit-profile")}
                    className="w-full h-10 min-h-[44px] rounded-[12px] border border-brandText/15 px-4 flex items-center justify-between bg-white"
                  >
                    <span className="flex items-center gap-3 text-sm font-semibold text-brandText">
                      <UserIcon className="w-5 h-5 text-brandText/70" />
                      Profile
                    </span>
                    <span className="text-brandText/50">&rsaquo;</span>
                  </button>
                </SheetClose>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
