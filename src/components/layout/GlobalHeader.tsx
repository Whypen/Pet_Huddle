import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  ChevronRight,
  FileText,
  Heart,
  Info,
  MessageSquare,
  Settings,
  Shield,
  Star,
  User as UserIcon,
  UserPlus,
  X,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import huddleLogo from "@/assets/huddle-name-transparent.png";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { membershipTierLabel } from "@/lib/membership";
import { plusTabRoute } from "@/lib/routes";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";

// ─── Notification types & helpers ────────────────────────────────────────────

type NotificationRow = {
  id: string;
  message: string;
  type: "alert" | "admin" | string;
  read: boolean;
  created_at: string;
  metadata: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  title?: string | null;
  body?: string | null;
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Math.max(1, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function notifIcon(type: string) {
  if (type === "alert" || type === "mesh_alert" || type === "broadcast")
    return <AlertCircle size={18} strokeWidth={1.75} aria-hidden />;
  if (type === "admin" || type === "system" || type === "announcement")
    return <Info size={18} strokeWidth={1.75} aria-hidden />;
  if (type === "star" || type === "like")
    return <Star size={18} strokeWidth={1.75} aria-hidden />;
  if (type === "heart" || type === "social")
    return <Heart size={18} strokeWidth={1.75} aria-hidden />;
  if (
    type === "message" || type === "chat" || type === "comment" ||
    type === "reply" || type === "mention" || type === "thread" || type === "conversation"
  )
    return <MessageSquare size={18} strokeWidth={1.75} aria-hidden />;
  if (type === "friend" || type === "follow" || type === "connect")
    return <UserPlus size={18} strokeWidth={1.75} aria-hidden />;
  return <Activity size={18} strokeWidth={1.75} aria-hidden />;
}

const allowedHref = (href: string) =>
  /^\/(chats|map|threads|chat-dialogue|verify-identity|pet-details|edit-pet-profile|settings|notifications)(\?|$)/.test(
    href
  );

// ─── Props ────────────────────────────────────────────────────────────────────

interface GlobalHeaderProps {
  onUpgradeClick?: () => void;
  onMenuClick?: () => void;
  /** When passed: right side renders X close button instead of Settings gear */
  closeButton?: () => void;
}

interface Pet {
  id: string;
  name: string;
  photo_url: string | null;
  species: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GlobalHeader = ({ onUpgradeClick, onMenuClick, closeButton }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [pets, setPets] = useState<Pet[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Re-open settings drawer when returning from Account Settings or Identity Verification
  useEffect(() => {
    if ((location.state as { openSettings?: boolean } | null)?.openSettings) {
      setMenuOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // ── Notification drawer state ──────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifRows, setNotifRows] = useState<NotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const markedOnOpenRef = useRef(false);

  const verificationStatus = String(profile?.verification_status ?? "").toLowerCase();
  const isVerified = verificationStatus === "verified";
  const tierLabel = membershipTierLabel(profile?.effective_tier ?? profile?.tier);
  const avatarUrl = profile?.avatar_url ? String(profile.avatar_url) : "";
  const isPlusOrAbove = tierLabel === "Plus" || tierLabel === "Gold";
  const isGold = tierLabel === "Gold";
  const initials = useMemo(() => {
    const name = profile?.display_name || "User";
    return name.trim().slice(0, 1).toUpperCase();
  }, [profile?.display_name]);

  const fetchPets = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, photo_url, species")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .limit(1);
      if (!error && data) setPets(data);
    } catch (err) {
      console.error("Error fetching pets:", err);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchPets();
  }, [user, fetchPets]);

  // ── Unread badge: real-time subscription ────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;

    const refreshUnread = async () => {
      const res = await supabase
        .from("notifications" as "profiles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read" as "user_id", false);
      if (cancelled) return;
      setUnreadCount((res as { count: number | null }).count ?? 0);
    };

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { void refreshUnread(); }
      )
      .subscribe();

    void refreshUnread();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ── Load notifications when drawer opens ────────────────────────────────────
  useEffect(() => {
    if (!notifOpen || !user) return;

    let cancelled = false;
    markedOnOpenRef.current = false;

    const load = async () => {
      setNotifLoading(true);
      const res = await supabase
        .from("notifications" as "profiles")
        .select("id,message,type,title,body,read,created_at,metadata,data" as "*")
        .eq("user_id" as "id", user.id)
        .order("created_at" as "id", { ascending: false })
        .limit(200);
      if (cancelled) return;
      const rows = (res.data ?? []) as NotificationRow[];
      setNotifRows(rows);
      setNotifLoading(false);

      // Mark all as read on open
      if (!markedOnOpenRef.current && rows.length > 0) {
        markedOnOpenRef.current = true;
        setNotifRows((prev) => prev.map((r) => ({ ...r, read: true })));
        await supabase
          .from("notifications" as "profiles")
          .update({ read: true } as Record<string, unknown>)
          .eq("user_id" as "created_at", user.id)
          .eq("read" as "created_at", false);
        // Refresh unread badge
        setUnreadCount(0);
      }
    };

    const channel = supabase
      .channel(`notifications_drawer:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();

    void load();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [notifOpen, user]);

  // ── Notification row interaction ─────────────────────────────────────────────
  const handleNotifRowClick = (r: NotificationRow) => {
    setNotifRows((prev) => prev.map((n) => (n.id === r.id ? { ...n, read: true } : n)));
    void supabase
      .from("notifications" as "profiles")
      .update({ read: true } as Record<string, unknown>)
      .eq("id" as "created_at", r.id)
      .eq("user_id" as "created_at", user?.id ?? "");

    const meta = (r.data ?? r.metadata ?? {}) as Record<string, unknown>;
    const body = String(r.body ?? r.message ?? "");
    const type = String((r.type || "")).toLowerCase();
    const href = typeof meta.href === "string" ? meta.href : null;
    const shouldForceDiscover =
      type === "wave" ||
      body.toLowerCase().includes("open discover to find out");
    const resolvedHref = shouldForceDiscover ? "/chats?tab=discover" : href;
    if (resolvedHref && allowedHref(resolvedHref)) {
      setNotifOpen(false);
      navigate(resolvedHref);
    } else {
      console.warn("Invalid notification href", { id: r.id, href: resolvedHref });
    }
  };

  // ── Derived notification groups ─────────────────────────────────────────────
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayRows = useMemo(
    () => notifRows.filter((r) => new Date(r.created_at) >= todayStart),
    [notifRows, todayStart]
  );
  const earlierRows = useMemo(
    () => notifRows.filter((r) => new Date(r.created_at) < todayStart),
    [notifRows, todayStart]
  );

  const renderNotifRow = (r: NotificationRow) => {
    const body = r.body ?? r.message ?? "";
    return (
      <div
        key={r.id}
        role="button"
        tabIndex={0}
        className={cn(
          "relative overflow-hidden rounded-[16px] flex items-start px-4 py-2 min-h-[52px] cursor-pointer",
          "transition-[background] duration-150",
          r.read ? "bg-transparent" : "glass-e2"
        )}
        onClick={() => handleNotifRowClick(r)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleNotifRowClick(r);
          }
        }}
        aria-label={body}
      >
        {!r.read && (
          <div className="absolute left-0 inset-y-0 w-[3px] bg-[var(--primary)] rounded-l-[16px] pointer-events-none" />
        )}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[14px] leading-[1.4]",
              r.read
                ? "font-[400] text-[var(--text-secondary)]"
                : "font-[500] text-[var(--text-primary)]"
            )}
          >
            {body}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{timeAgo(r.created_at)}</p>
        </div>
      </div>
    );
  };

  const handleLogoClick = () => navigate("/");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <header className="sticky top-0 z-[1700] bg-background border-b border-border/20">
      <div className="flex items-center justify-between px-4 w-full max-w-[430px] mx-auto h-14">

        {/* ── Left: Notification bell → opens left drawer ── */}
        <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
          <SheetTrigger asChild>
            <NeuControl
              size="icon-md"
              variant="tertiary"
              aria-label={t("Notifications")}
              className="relative shrink-0"
            >
              <Bell size={20} strokeWidth={1.75} aria-hidden />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brandError pointer-events-none" />
              )}
            </NeuControl>
          </SheetTrigger>

          <SheetContent
            side="left"
            className="w-[320px] sm:max-w-[320px] p-0 flex flex-col h-full [&>button]:hidden"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t("Notifications")}</SheetTitle>
              <SheetDescription>{t("Notifications drawer")}</SheetDescription>
            </SheetHeader>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-1 shrink-0">
              <h3 className="text-[17px] font-[600] text-[var(--text-primary)]">
                {t("Notifications")}
              </h3>
              <SheetClose asChild>
                <NeuControl size="icon-md" variant="tertiary" aria-label={t("Close")}>
                  <X size={20} strokeWidth={1.75} aria-hidden />
                </NeuControl>
              </SheetClose>
            </div>

            {/* Scrollable body */}
            <div
              className="flex-1 overflow-y-auto px-3 pb-6 space-y-1"
              style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              {/* Skeleton */}
              {notifLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-2 min-h-[60px] rounded-[16px] animate-pulse"
                  >
                    <div className="mt-0.5 flex-shrink-0 h-[36px] w-[36px] rounded-full bg-white/40" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-[14px] w-3/4 rounded-full bg-white/40" />
                      <div className="h-[11px] w-1/3 rounded-full bg-white/30" />
                    </div>
                  </div>
                ))}

              {/* Empty state */}
              {!notifLoading && notifRows.length === 0 && (
                <div className="pt-10">
                  <EmptyStateCard
                    icon={<Bell size={28} strokeWidth={1.75} aria-hidden />}
                    headline={t("You're all caught up.")}
                  />
                </div>
              )}

              {/* Today group */}
              {!notifLoading && todayRows.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground/50 select-none">
                      {t("Today")}
                    </span>
                  </div>
                  {todayRows.map(renderNotifRow)}
                </>
              )}

              {/* Earlier group */}
              {!notifLoading && earlierRows.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground/50 select-none">
                      {t("Earlier")}
                    </span>
                  </div>
                  {earlierRows.map(renderNotifRow)}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Center: Logo ── */}
        <button
          onClick={handleLogoClick}
          className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity"
          aria-label={t("huddle")}
        >
          <img
            src={huddleLogo}
            alt={t("huddle")}
            className="h-7 w-auto max-w-[140px] object-contain"
          />
        </button>

        {/* ── Right: X close OR Settings drawer ── */}
        {closeButton ? (
          <NeuControl
            size="icon-md"
            variant="tertiary"
            aria-label={t("Close")}
            onClick={closeButton}
            className="shrink-0"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </NeuControl>
        ) : (
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <NeuControl
                size="icon-md"
                variant="tertiary"
                aria-label={t("Settings")}
                onClick={() => {
                  if (onMenuClick) {
                    onMenuClick();
                    return;
                  }
                  setMenuOpen(true);
                }}
              >
                <Settings size={20} strokeWidth={1.75} aria-hidden />
              </NeuControl>
            </SheetTrigger>

            <SheetContent className="w-[320px] sm:max-w-sm flex flex-col gap-4 pt-6 px-4 pb-4">
              <SheetHeader className="sr-only">
                <SheetTitle>{t("Settings")}</SheetTitle>
                <SheetDescription>{t("Settings drawer")}</SheetDescription>
              </SheetHeader>

              {/* 1. User identity row */}
              <SheetClose asChild>
                <button
                  onClick={() => navigate("/edit-profile")}
                  className="flex items-center gap-3 px-1 w-full text-left"
                >
                  <div
                    className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center overflow-hidden shrink-0",
                      "bg-[rgba(33,69,207,0.10)]",
                      isVerified && "ring-2 ring-brandGold ring-offset-1"
                    )}
                    aria-hidden
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={profile?.display_name || "Avatar"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[18px] font-[600] text-[var(--color-brand,#2145CF)]">
                        {initials}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[16px] font-[600] text-[var(--text-primary,#424965)] truncate leading-tight">
                      {profile?.display_name || "User"}
                    </h3>
                    <NeuChip as="span" className="mt-1.5 capitalize text-[11px]">
                      {tierLabel}
                    </NeuChip>
                  </div>
                  <ChevronRight
                    size={16}
                    strokeWidth={1.75}
                    className="text-[var(--text-tertiary)] shrink-0 mr-1"
                    aria-hidden
                  />
                </button>
              </SheetClose>

              {/* 2. Manage Membership CTA */}
              <SheetClose asChild>
                <NeuControl
                  variant={isGold ? "gold" : "primary"}
                  tier={isGold ? "gold" : undefined}
                  size="lg"
                  fullWidth
                  onClick={() =>
                    navigate(isPlusOrAbove ? plusTabRoute("Gold") : plusTabRoute("Plus"))
                  }
                >
                  Manage Membership
                </NeuControl>
              </SheetClose>

              {/* 3. Navigation panel */}
              <InsetPanel>
                <SheetClose asChild>
                  <InsetRow
                    label="Identity Verification"
                    icon={<Shield size={16} strokeWidth={1.75} />}
                    variant="nav"
                    value={verificationStatus || "unverified"}
                    onClick={() => navigate("/verify-identity", { state: { from: location.pathname } })}
                  />
                </SheetClose>
                <InsetDivider />
                <SheetClose asChild>
                  <InsetRow
                    label="Account Settings"
                    icon={<UserIcon size={16} strokeWidth={1.75} />}
                    variant="nav"
                    onClick={() => navigate("/settings", { state: { from: location.pathname } })}
                  />
                </SheetClose>
              </InsetPanel>

              {/* 4. Legal panel */}
              <InsetPanel>
                <SheetClose asChild>
                  <InsetRow
                    label="Privacy & Policy"
                    icon={<FileText size={16} strokeWidth={1.75} />}
                    variant="nav"
                    onClick={() => navigate("/privacy")}
                  />
                </SheetClose>
                <InsetDivider />
                <SheetClose asChild>
                  <InsetRow
                    label="Terms of Service"
                    icon={<FileText size={16} strokeWidth={1.75} />}
                    variant="nav"
                    onClick={() => navigate("/terms")}
                  />
                </SheetClose>
              </InsetPanel>

            </SheetContent>
          </Sheet>
        )}

      </div>
    </header>
  );
};
