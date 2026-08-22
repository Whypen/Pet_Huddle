import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Bell,
  BookOpen,
  ChevronLeft,
  FileText,
  HelpCircle,
  LogOut,
  Settings,
  Shield,
  ShieldAlert,
  Star,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { HuddleWordmark } from "@/components/brand/HuddleWordmark";
import { useAuth } from "@/contexts/AuthContext";
import { resolveCopy } from "@/lib/copy";
import { isVerifiedProfile } from "@/lib/verification";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { normalizeMembershipTier } from "@/lib/membership";
import { plusTabRoute } from "@/lib/routes";
import { NeuControl } from "@/components/ui/NeuControl";
import { InsetPanel, InsetDivider, InsetRow } from "@/components/ui/InsetPanel";
import { EmptyStateCard } from "@/components/ui/EmptyStateCard";
import { SettingsProfileSummary } from "@/components/layout/SettingsProfileSummary";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { GlassModal } from "@/components/ui/GlassModal";
import { HelpSupportDialog } from "@/components/support/HelpSupportDialog";
import { shouldSuppressWebHeaderForNativeShell } from "@/lib/nativeShell";
import { fetchWebNotifications, fetchWebUnreadNotifications, markWebNotificationsRead } from "@/lib/webNotifications";

// ─── Notification types & helpers ────────────────────────────────────────────

type NotificationRow = {
  id: string;
  message: string;
  type: "alert" | "admin" | "map" | "social" | string;
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

const stripLeadingSymbolPrefixes = (text: string) => {
  const trimmed = text.trimStart();
  const emojiPrefixMatch = trimmed.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+)/u);

  if (emojiPrefixMatch) {
    const emojiPrefix = emojiPrefixMatch[1].trimEnd();
    const rest = trimmed
      .slice(emojiPrefixMatch[1].length)
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trimStart();
    return rest ? `${emojiPrefix} ${rest}` : emojiPrefix;
  }

  return trimmed.replace(/^[^\p{L}\p{N}]+/u, "").trimStart();
};

const allowedHref = (href: string) =>
  /^\/(social|groups|chats|map|threads|chat-dialogue|verify-identity|pet-details|edit-pet-profile|edit-profile|settings|notifications|service-chat|carerprofile|member|premium)(\?|$)/.test(
    href
  );

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
};

const isExpiredAlertCopy = (value: unknown) => {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "your alert has expired and is no longer visible";
};

const isSuppressedNotification = (row: Partial<NotificationRow>) => {
  return isExpiredAlertCopy(row.message) || isExpiredAlertCopy(row.body) || isExpiredAlertCopy(row.title);
};

const normalizeNotificationHref = (
  href: string | null,
  type: string,
  meta: Record<string, unknown>
) => {
  const normalizedType = type.toLowerCase();
  const socialTarget = firstString(
    meta.thread_id,
    meta.threadId,
    meta.post_id,
    meta.postId,
    meta.subject_id,
    meta.subjectId,
    meta.content_id,
    meta.contentId
  );
  const alertTarget = firstString(
    meta.alert_id,
    meta.alertId,
    meta.subject_id,
    meta.subjectId,
    meta.content_id,
    meta.contentId
  );

  let nextHref = href;
  if (!nextHref && socialTarget && ["social", "like", "comment", "reply", "mention", "thread"].includes(normalizedType)) {
    nextHref = `/social?focus=${encodeURIComponent(socialTarget)}`;
  }
  if (!nextHref && alertTarget && ["alert", "alert_like", "broadcast", "mesh_alert", "map"].includes(normalizedType)) {
    nextHref = `/map?alert=${encodeURIComponent(alertTarget)}`;
  }
  if (!nextHref) return null;

  if (nextHref.startsWith("/threads")) {
    const [, rawQuery = ""] = nextHref.split("?");
    const params = new URLSearchParams(rawQuery);
    const focus = params.get("focus") || params.get("thread") || socialTarget;
    return focus ? `/social?focus=${encodeURIComponent(focus)}` : "/social";
  }

  // The notification-enqueue DB contract writes a shared `/profile` href for both
  // platforms, but web's own-profile route is `/edit-profile` — native has a
  // `/profile` screen, web doesn't, so this remap only exists on this side.
  if (nextHref === "/profile" || nextHref.startsWith("/profile?")) {
    const [, rawQuery = ""] = nextHref.split("?");
    return rawQuery ? `/edit-profile?${rawQuery}` : "/edit-profile";
  }

  if (nextHref.startsWith("/map")) {
    const [, rawQuery = ""] = nextHref.split("?");
    const params = new URLSearchParams(rawQuery);
    if (!params.get("alert") && alertTarget) {
      params.set("alert", alertTarget);
    }
    const q = params.toString();
    return q ? `/map?${q}` : "/map";
  }

  return nextHref;
};

const normalizedTypeToPage = (rawType: string) => {
  const normalizedType = rawType.toLowerCase();
  if (["alert", "alert_like", "broadcast", "mesh_alert", "map"].includes(normalizedType)) return "map";
  if (["social", "like", "comment", "reply", "mention", "thread"].includes(normalizedType)) return "social";
  return null;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface GlobalHeaderProps {
  onUpgradeClick?: () => void;
  onMenuClick?: () => void;
  /** When passed: right side renders X close button instead of Settings gear */
  closeButton?: () => void;
  desktopRail?: boolean;
  /** Route-owned controls that sit immediately before the account avatar on mobile. */
  accountLeadingActions?: ReactNode;
}

interface Pet {
  id: string;
  name: string;
  photo_url: string | null;
  species: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GlobalHeader = ({ onUpgradeClick, onMenuClick, closeButton, desktopRail = false, accountLeadingActions }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, session, profile, signOut, refreshProfile } = useAuth();
  const t = resolveCopy;
  const [pets, setPets] = useState<Pet[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<"main" | "legal">("main");
  const premiumReturnTo = `${location.pathname}${location.search}`;

  // ── Notification drawer state ──────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifRows, setNotifRows] = useState<NotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const markedOnOpenRef = useRef(false);
  const notifOpenRef = useRef(false);
  const notifBadgeDebounceRef = useRef<number | null>(null);
  const notifDrawerDebounceRef = useRef<number | null>(null);
  const showUnreadDot = !notifOpen && unreadCount > 0;

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(location.search);
    if (params.get("notifications") !== "1") return;
    setNotifOpen(true);
    params.delete("notifications");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate, user]);

  const isVerified = isVerifiedProfile(profile);

  useEffect(() => {
    notifOpenRef.current = notifOpen;
  }, [notifOpen]);

  const logoutItem = useMemo(
    () => ({
      label: "Log Out",
      iconClassName: "text-[#E84545]",
    }),
    []
  );

  useEffect(() => {
    const state = location.state as { openSettingsDrawer?: boolean; openSupportModal?: boolean } | null;
    if (!state?.openSettingsDrawer && !state?.openSupportModal) return;
    if (state?.openSettingsDrawer) {
      setMenuOpen(true);
    }
    if (state?.openSupportModal) {
      setSupportOpen(true);
    }
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

  // ── Re-open drawer when returning from a legal page ──────────────────────────
  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    if (state?.openDrawer && location.pathname === state.from) {
      setMenuOpen(true);
      setDrawerView((state.drawerView as "main" | "legal") ?? "legal");
      // Clear the flag so a page refresh doesn't reopen the drawer.
      window.history.replaceState(
        { ...window.history.state, usr: { ...((window.history.state?.usr as object) ?? {}), openDrawer: false } },
        "",
      );
    }
  }, [location.key, location.pathname, location.state]);

  // ── Unread badge: real-time subscription ────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;

    const refreshUnread = async () => {
      if (notifOpenRef.current) {
        setUnreadCount((prev) => (prev === 0 ? prev : 0));
        return;
      }
      let rows: Array<Partial<NotificationRow>> = [];
      try {
        rows = await fetchWebUnreadNotifications(user.id, session);
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[web.notifications.unread]", error);
      }
      if (cancelled) return;
      const count = rows.filter((r) => !r.data?.skip_history && !r.metadata?.skip_history && !isSuppressedNotification(r)).length;
      setUnreadCount((prev) => (prev === count ? prev : count));
    };

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          if (notifBadgeDebounceRef.current !== null) window.clearTimeout(notifBadgeDebounceRef.current);
          notifBadgeDebounceRef.current = window.setTimeout(() => {
            notifBadgeDebounceRef.current = null;
            void refreshUnread();
          }, 400);
        }
      )
      .subscribe();

    void refreshUnread();

    return () => {
      cancelled = true;
      if (notifBadgeDebounceRef.current !== null) window.clearTimeout(notifBadgeDebounceRef.current);
      supabase.removeChannel(channel);
    };
    // Re-run when the authenticated access token rotates; the REST projection must
    // never be queried with the session that preceded the current one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, session?.access_token]);

  // ── Load notifications when drawer opens ────────────────────────────────────
  useEffect(() => {
    if (!notifOpen || !user) return;

    let cancelled = false;
    markedOnOpenRef.current = false;

    const load = async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) {
        setNotifLoading(true);
      }
      let allRows: NotificationRow[] = [];
      try {
        allRows = (await fetchWebNotifications(user.id, session, 200)) as NotificationRow[];
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[web.notifications.load]", error);
        if (!cancelled) {
          if (!silent) {
            setNotifRows([]);
            setNotifLoading(false);
          }
          setUnreadCount(0);
        }
        return;
      }
      if (cancelled) return;
      const rows = allRows.filter(
        (r) => !r.data?.skip_history && !r.metadata?.skip_history && !isSuppressedNotification(r)
      );
      setNotifRows(rows);
      if (!silent) {
        setNotifLoading(false);
      }

      // Mark all unread as read on open, including skip_history rows.
      // This keeps the bell badge in sync when only push-only chat rows exist.
      const hasAnyUnread = allRows.some((row) => row.read !== true);
      if (!markedOnOpenRef.current && hasAnyUnread) {
        markedOnOpenRef.current = true;
        setNotifRows((prev) => prev.map((r) => ({ ...r, read: true })));
        try {
          await markWebNotificationsRead(user.id, session);
        } catch (error) {
          if (import.meta.env.DEV) console.warn("[web.notifications.mark_all_read]", error);
        }
        // Refresh unread badge
        setUnreadCount(0);
      }
    };

    const channel = supabase
      .channel(`notifications_drawer:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          if (notifDrawerDebounceRef.current !== null) window.clearTimeout(notifDrawerDebounceRef.current);
          notifDrawerDebounceRef.current = window.setTimeout(() => {
            notifDrawerDebounceRef.current = null;
            void load({ silent: true });
          }, 400);
        }
      )
      .subscribe();

    void load();

    return () => {
      cancelled = true;
      if (notifDrawerDebounceRef.current !== null) window.clearTimeout(notifDrawerDebounceRef.current);
      supabase.removeChannel(channel);
    };
    // Only user.id is used inside; intentionally avoid re-subscribing on other user property changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen, user?.id, session]);

  useEffect(() => {
    if (!notifOpen) return;
    // UX contract: opening the drawer clears the bell-dot immediately.
    setUnreadCount(0);
  }, [notifOpen]);

  // ── Notification row interaction ─────────────────────────────────────────────
  const handleNotifRowClick = (r: NotificationRow) => {
    setNotifRows((prev) => prev.map((n) => (n.id === r.id ? { ...n, read: true } : n)));
    if (user?.id) {
      void markWebNotificationsRead(user.id, session, r.id).catch((error) => {
        if (import.meta.env.DEV) console.warn("[web.notifications.mark_read]", error);
      });
    }

    const meta = (r.data ?? r.metadata ?? {}) as Record<string, unknown>;
    const body = String(r.body ?? r.message ?? "");
    const type = String((r.type || "")).toLowerCase();
    const href =
      (typeof meta.href === "string" && meta.href.trim() ? meta.href.trim() : null);
    const removedDiscoverLink =
      type === "wave" ||
      body.toLowerCase().includes("open discover to find out") ||
      href?.includes("tab=discover");
    const normalizedHref = removedDiscoverLink
      ? "/social"
      : normalizeNotificationHref(href, type, meta);

    if (normalizedHref && allowedHref(normalizedHref)) {
      setNotifOpen(false);
      navigate(normalizedHref);
    } else {
      if (normalizedTypeToPage(type) === "map") {
        setNotifOpen(false);
        navigate("/map");
        toast.info("That alert is no longer available.");
        return;
      }
      if (normalizedTypeToPage(type) === "social") {
        setNotifOpen(false);
        navigate("/social");
        toast.info("That post is no longer available.");
        return;
      }
      console.warn("Invalid notification href", { id: r.id, href: normalizedHref, rawHref: href });
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
    const body = stripLeadingSymbolPrefixes(r.body ?? r.message ?? "");
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

  const suppressForNativeShell = shouldSuppressWebHeaderForNativeShell();

  // ── Render ─────────────────────────────────────────────────────────────────
  if (suppressForNativeShell) return null;

  return (
    <header className="sticky top-0 z-[1700] bg-background border-b border-border/20">
      {/* Same --app-max-width token as the shell, so header content stays
          aligned with page content at every width. */}
      <div className="flex h-14 w-full max-w-[var(--app-max-width,430px)] items-center justify-between px-4 mx-auto lg:max-w-none lg:px-6">

        {/* ── Left: Notification bell → opens left drawer ── */}
        <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
          <SheetTrigger asChild>
            <NeuControl
              size="icon-md"
              variant="tertiary"
              aria-label={t("Notifications")}
              className="relative shrink-0 lg:hidden"
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
                    headline={t("You're all caught up")}
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
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0",
            desktopRail && "lg:static",
          )}
          aria-label={t("huddle")}
        >
          <HuddleWordmark size={28} />
        </span>

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
          /* Lightweight settings drawer. The notification Sheet above remains
              separate, and Log out still uses the existing confirmation flow. */
          <div className="ml-auto flex items-center gap-0.5">
          {accountLeadingActions ? <div className="flex items-center">{accountLeadingActions}</div> : null}
          <SettingsMenu
            displayName={profile?.display_name || "User"}
            avatarUrl={profile?.avatar_url || null}
            socialId={profile?.social_id || null}
            accountEmail={user?.email || null}
            isVerified={isVerified}
            tierLabel={normalizeMembershipTier(
              String(profile?.effective_tier || profile?.tier || "free"),
            )}
            nonSocial={profile?.discovery_opt_out === true}
            hideFromMap={profile?.map_precision === "hidden"}
            onVisibilityChange={async (next) => {
              if (!user?.id) return;
              const mapPrecision = next.hideFromMap ? "hidden" : "area";
              const { error } = await supabase
                .from("profiles")
                .update({
                  discovery_opt_out: next.nonSocial,
                  map_precision: mapPrecision,
                  hide_from_map: false,
                })
                .eq("id", user.id);
              if (error) {
                toast.error("We couldn’t save privacy settings. Please retry.");
                return;
              }
              await refreshProfile();
              toast.success("Privacy settings updated.");
            }}
            onLogout={() => setLogoutOpen(true)}
            onEditProfile={() => navigate("/edit-profile", { state: { returnTo: premiumReturnTo } })}
            onHelp={() => setSupportOpen(true)}
            onManageMembership={() => navigate("/member", { state: { returnTo: premiumReturnTo } })}
          />
          </div>
        )}

      </div>

      <HelpSupportDialog open={supportOpen} onOpenChange={setSupportOpen} />

      <GlassModal isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out?" hideClose>
        <p className="text-[14px] leading-[1.55] text-[var(--text-secondary)] text-center mb-5">
          You&apos;ll need to sign in again.
        </p>
        <div className="flex gap-3">
          <NeuControl size="lg" variant="secondary" fullWidth onClick={() => setLogoutOpen(false)}>
            Cancel
          </NeuControl>
          <NeuControl
            size="lg"
            variant="danger"
            fullWidth
            onClick={async () => {
              await signOut();
              navigate("/join", { replace: true });
            }}
          >
            Log out
          </NeuControl>
        </div>
      </GlassModal>
    </header>
  );
};
