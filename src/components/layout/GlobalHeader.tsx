import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Heart,
  HelpCircle,
  Info,
  MessageSquare,
  Settings,
  Shield,
  ShieldAlert,
  Star,
  User as UserIcon,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import huddleLogo from "@/assets/huddle-name-transparent.png";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { membershipTierLabel, normalizeMembershipTier } from "@/lib/membership";
import { plusTabRoute } from "@/lib/routes";
import { getQuotaCapsForTier } from "@/config/quotaConfig";
import { NeuControl } from "@/components/ui/NeuControl";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { ManageFamilySheet } from "@/components/monetization/ManageFamilySheet";

// ─── Notification types & helpers ────────────────────────────────────────────

type NotificationRow = {
  id: string;
  message: string;
  type: "alert" | "admin" | string;
  read: boolean;
  created_at: string;
  href?: string | null;
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
  const [carerGateOpen, setCarerGateOpen] = useState(false);
  const [familySheetOpen, setFamilySheetOpen] = useState(false);
  const [familyUsedCount, setFamilyUsedCount] = useState(0);
  const [starsRemaining, setStarsRemaining] = useState<number | null>(() => {
    const initial = Number(profile?.stars_count);
    return Number.isFinite(initial) ? Math.max(0, initial) : null;
  });
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportEmailOptIn, setSupportEmailOptIn] = useState(true);
  const [drawerView, setDrawerView] = useState<"main" | "legal">("main");

  // ── Notification drawer state ──────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifRows, setNotifRows] = useState<NotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const markedOnOpenRef = useRef(false);
  const showUnreadDot = !notifOpen && unreadCount > 0;

  const isVerified = profile?.is_verified === true;
  const dob = (profile as Record<string, unknown> | null)?.dob as string | null ?? null;
  const isAge18Plus = dob
    ? (() => {
        const birth = new Date(dob);
        const now = new Date();
        const age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        return age > 18 || (age === 18 && (m > 0 || (m === 0 && now.getDate() >= birth.getDate())));
      })()
    : false;
  const normalizedTier = normalizeMembershipTier(profile?.effective_tier ?? profile?.tier);
  const tierLabel = membershipTierLabel(normalizedTier);
  const avatarUrl = profile?.avatar_url ? String(profile.avatar_url) : "";
  const isPlusOrAbove = normalizedTier === "plus" || normalizedTier === "gold";
  const isGold = normalizedTier === "gold";
  const initials = useMemo(() => {
    const name = profile?.display_name || "User";
    return name.trim().slice(0, 1).toUpperCase();
  }, [profile?.display_name]);
  const membershipPillClassName = useMemo(() => {
    if (normalizedTier === "gold") {
      return "bg-[#FF6452] text-white";
    }
    if (normalizedTier === "plus") {
      return "bg-[#5BA4F5] text-white";
    }
    return "bg-[#E9ECF3] text-[#7E8599]";
  }, [normalizedTier]);
  const starPillClassName = starsRemaining && starsRemaining > 0
    ? "bg-white text-[#4A4965] border border-[#E4E8F2]"
    : "bg-transparent text-[#98A0B8] border border-[#C6CAD6]";
  const starPillLabel = `${Math.max(0, Number(starsRemaining || 0))} ⭐`;

  useEffect(() => {
    if (!menuOpen || !profile?.id) return;
    let cancelled = false;
    const loadStars = async () => {
      const snapshot = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_quota_snapshot");
      if (snapshot.error) {
        if (!cancelled) {
          const fallback = Number(profile?.stars_count);
          setStarsRemaining(Number.isFinite(fallback) ? Math.max(0, fallback) : 0);
        }
        return;
      }
      const row = Array.isArray(snapshot.data) ? snapshot.data[0] : snapshot.data;
      const typed = (row || {}) as { tier?: string; stars_used_cycle?: number; extra_stars?: number };
      const userTier = String(profile?.effective_tier || profile?.tier || typed.tier || "free").toLowerCase();
      const cap = getQuotaCapsForTier(userTier).starsPerMonth;
      const used = Number(typed.stars_used_cycle || 0);
      const extra = Number(typed.extra_stars || 0);
      const nextRemaining = Math.max(0, cap - used) + Math.max(0, extra);
      if (!cancelled) setStarsRemaining(nextRemaining);
    };
    void loadStars();
    return () => {
      cancelled = true;
    };
  }, [menuOpen, profile?.effective_tier, profile?.id, profile?.stars_count, profile?.tier]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("family_members" as never)
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", user.id)
      .neq("status", "declined")
      .then(({ count }: { count: number | null }) => setFamilyUsedCount(count ?? 0));
  }, [user?.id, familySheetOpen]);

  useEffect(() => {
    const state = location.state as { openSettingsDrawer?: boolean } | null;
    if (!state?.openSettingsDrawer) return;
    setMenuOpen(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
  }, [location.pathname, location.search, location.state, navigate]);

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
        .select("id,metadata,data" as "*")
        .eq("user_id", user.id)
        .eq("read" as "user_id", false);
      if (cancelled) return;
      const rows = (res as { data: Array<{ metadata?: Record<string, unknown>; data?: Record<string, unknown> }> | null }).data ?? [];
      const count = rows.filter((r) => !r.data?.skip_history && !r.metadata?.skip_history).length;
      setUnreadCount(count);
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
      if ((res as { error?: unknown }).error) {
        if (!cancelled) {
          setNotifRows([]);
          setNotifLoading(false);
          setUnreadCount(0);
        }
        return;
      }
      if (cancelled) return;
      const allRows = (res.data ?? []) as NotificationRow[];
      const rows = allRows.filter(
        (r) => !r.data?.skip_history && !r.metadata?.skip_history
      );
      setNotifRows(rows);
      setNotifLoading(false);

      // Mark all unread as read on open, including skip_history rows.
      // This keeps the bell badge in sync when only push-only chat rows exist.
      const hasAnyUnread = allRows.some((row) => row.read !== true);
      if (!markedOnOpenRef.current && hasAnyUnread) {
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

  useEffect(() => {
    if (!notifOpen) return;
    // UX contract: opening the drawer clears the bell-dot immediately.
    setUnreadCount(0);
  }, [notifOpen]);

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
    const href =
      (typeof meta.href === "string" && meta.href.trim() ? meta.href.trim() : null);
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

  const submitSupport = async () => {
    const msg = supportMessage.trim();
    if (!msg) return;
    try {
      const { error } = await supabase.from("support_requests").insert({
        user_id: user?.id ?? null,
        category: "help",
        subject: supportSubject.trim() || "Support Request",
        message: msg + (supportEmailOptIn ? "\n\n[You may follow up via email]" : ""),
        email: (profile as Record<string, unknown> | null)?.email as string | null ?? null,
        contact_method: supportEmailOptIn ? "email" : null,
      } as never);
      if (error) throw error;
      setSupportOpen(false);
      setSupportSubject("");
      setSupportMessage("");
      setSupportEmailOptIn(true);
      toast.success("Message sent. We'll be in touch soon.");
    } catch {
      toast.error("Couldn't send your message. Please try again.");
    }
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
              {showUnreadDot && (
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
          <Sheet
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) setDrawerView("main");
            }}
          >
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

              {drawerView === "main" && (
              <>
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
                      isVerified && "ring-2 ring-brandBlue ring-offset-1"
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
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center justify-center rounded-full px-3 text-[11px] font-[700] leading-none",
                          membershipPillClassName
                        )}
                      >
                        {tierLabel}
                      </span>
                      {starsRemaining !== null && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuOpen(false);
                            navigate("/premium");
                          }}
                          className={cn(
                            "inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[11px] font-[700] leading-none",
                            starPillClassName
                          )}
                        >
                          {starPillLabel}
                        </button>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    strokeWidth={1.75}
                    className="text-[var(--text-tertiary)] shrink-0 mr-1"
                    aria-hidden
                  />
                </button>
              </SheetClose>

              {/* 2. Membership panel */}
              <InsetPanel>
                <SheetClose asChild>
                  <InsetRow
                    label="Manage Membership"
                    icon={<Star size={16} strokeWidth={1.75} />}
                    variant="nav"
                    onClick={() => {
                      if (onUpgradeClick && !isPlusOrAbove) {
                        setTimeout(onUpgradeClick, 200);
                      } else {
                        navigate(isPlusOrAbove ? plusTabRoute("Gold") : plusTabRoute("Plus"));
                      }
                    }}
                  />
                </SheetClose>
                <InsetDivider />
                <InsetRow
                  label="Family Account"
                  icon={<Users size={16} strokeWidth={1.75} />}
                  variant="nav"
                  value={familyUsedCount > 0 ? `${familyUsedCount} member${familyUsedCount > 1 ? "s" : ""}` : undefined}
                  onClick={() => {
                    setMenuOpen(false);
                    setTimeout(() => setFamilySheetOpen(true), 150);
                  }}
                />
              </InsetPanel>

              {/* 3. Profile & Access panel */}
              <InsetPanel>
                <SheetClose asChild>
                  <InsetRow
                    label="Identity Verification"
                    icon={
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${isVerified ? "bg-brandBlue" : "bg-[#A1A4A9]"} text-white`}>
                        <Shield size={12} strokeWidth={1.75} />
                      </span>
                    }
                    variant="nav"
                    value={isVerified ? "Verified" : undefined}
                    onClick={() => navigate("/verify-identity")}
                  />
                </SheetClose>
                {isAge18Plus && (
                  <>
                    <InsetDivider />
                    <SheetClose asChild>
                      <InsetRow
                        label="Pet Carer Profile"
                        icon={<Heart size={16} strokeWidth={1.75} />}
                        variant="nav"
                        value={isVerified ? undefined : "Verify first"}
                        onClick={() => {
                          if (isVerified) {
                            navigate("/carerprofile", { state: { from: location.pathname } });
                          } else {
                            setTimeout(() => setCarerGateOpen(true), 150);
                          }
                        }}
                      />
                    </SheetClose>
                  </>
                )}
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

              {/* 4. Support + Legal panel */}
              <InsetPanel>
                <InsetRow
                  label="Help & Support"
                  icon={<HelpCircle size={16} strokeWidth={1.75} />}
                  variant="nav"
                  onClick={() => {
                    setMenuOpen(false);
                    setTimeout(() => setSupportOpen(true), 150);
                  }}
                />
                <InsetDivider />
                <InsetRow
                  label="Legal Information"
                  icon={<FileText size={16} strokeWidth={1.75} />}
                  variant="nav"
                  onClick={() => setDrawerView("legal")}
                />
              </InsetPanel>
              </>
              )}

              {/* ── Legal sub-screen ─────────────────────────────────────── */}
              {drawerView === "legal" && (
                <div className="flex flex-col gap-4">
                  <button
                    type="button"
                    onClick={() => setDrawerView("main")}
                    className="flex items-center gap-1.5 px-1 py-1 -mx-1 rounded-lg text-left text-[var(--text-primary)] active:bg-black/5"
                  >
                    <ChevronLeft size={18} strokeWidth={1.75} className="text-[var(--text-secondary)] shrink-0" />
                    <span className="text-[15px] font-semibold">Legal Information</span>
                  </button>

                  <InsetPanel>
                    <SheetClose asChild>
                      <InsetRow
                        label="Privacy Policy"
                        icon={<ShieldAlert size={16} strokeWidth={1.75} />}
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
                    <InsetDivider />
                    <SheetClose asChild>
                      <InsetRow
                        label="Community Guidelines"
                        icon={<BookOpen size={16} strokeWidth={1.75} />}
                        variant="nav"
                        onClick={() => navigate("/community-guidelines")}
                      />
                    </SheetClose>
                    <div className="h-px bg-border/60 mx-3 my-1" />
                    <SheetClose asChild>
                      <InsetRow
                        label="Service Provider Agreement"
                        icon={<FileText size={16} strokeWidth={1.75} />}
                        variant="nav"
                        onClick={() => navigate("/service-agreement")}
                      />
                    </SheetClose>
                    <InsetDivider />
                    <SheetClose asChild>
                      <InsetRow
                        label="Service Booking Terms"
                        icon={<BookOpen size={16} strokeWidth={1.75} />}
                        variant="nav"
                        onClick={() => navigate("/booking-terms")}
                      />
                    </SheetClose>
                  </InsetPanel>
                </div>
              )}

            </SheetContent>
          </Sheet>
        )}

      </div>

      {/* ── Carer profile gate (outside sheet so it renders after sheet closes) ── */}
      {carerGateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setCarerGateOpen(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-xl mx-4 p-5 max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Identity verification required</h2>
              <p className="text-[13px] text-[var(--text-secondary)]">Finish verification to start offering trusted pet-care services.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCarerGateOpen(false)}
                className="flex-1 h-10 rounded-xl border border-border text-[14px] font-medium text-[var(--text-secondary)] hover:bg-muted transition-colors"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => { setCarerGateOpen(false); navigate("/verify-identity"); }}
                className="flex-1 h-10 rounded-xl bg-brandBlue text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
              >
                Verify now
              </button>
            </div>
          </div>
        </div>
      )}

      <ManageFamilySheet isOpen={familySheetOpen} onClose={() => setFamilySheetOpen(false)} />

      {/* ── Help & Support dialog ── */}
      <Dialog open={supportOpen} onOpenChange={(o) => { if (!o) setSupportOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Help &amp; Support</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Subject</label>
              <div className="form-field-rest relative flex items-center">
                <input
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="field-input-core"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">Message</label>
              <div className="form-field-rest relative h-auto min-h-[96px] py-3">
                <textarea
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="How can we help?"
                  className="field-input-core resize-none min-h-[72px]"
                />
              </div>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={supportEmailOptIn}
                onChange={(e) => setSupportEmailOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-brandBlue flex-shrink-0"
              />
              <span className="text-[13px] text-[var(--text-secondary)]">
                You may follow up with me via email if needed.
              </span>
            </label>
          </div>
          <DialogFooter className="!flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSupportOpen(false)}
              className="flex-1 h-11 rounded-xl border border-[var(--border)] text-[14px] font-[500] text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitSupport}
              className="flex-1 h-11 rounded-xl bg-brandBlue text-white text-[14px] font-[500]"
            >
              Send
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};
