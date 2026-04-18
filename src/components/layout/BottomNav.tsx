/**
 * BottomNav — Phase 4 / Step 22
 * glass-nav (A.2) — replaces former bg-white version (D.1 violation removed)
 * z-[20] per Z-index map
 * All icons: strokeWidth={1.5} (A.7)
 * No framer-motion bounce (A.8 — banned)
 */

import { useEffect, useMemo, useState } from "react";
import { Home, Users, MessageCircle, PawPrint, MapPin } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { icon: Home,          label: "Home",          path: "/" },
  { icon: Users,         label: "nav.social",    path: "/social" },
  { icon: MessageCircle, label: "nav.chats",     path: "/chats" },
  { icon: PawPrint,      label: "Service",       path: "/service" },
  { icon: MapPin,        label: "nav.map",       path: "/map" },
];

/** Height constant for offset calculations (matches glass-nav h-[64px]) */
export const BOTTOM_NAV_HEIGHT = 80;

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { profile } = useAuth();
  const unreadStorageKey = useMemo(
    () => `chats_unread_${profile?.id || "anon"}`,
    [profile?.id]
  );
  const [chatUnread, setChatUnread] = useState(0);
  const isChatSurface =
    location.pathname.startsWith("/chats") ||
    location.pathname.startsWith("/chat-dialogue") ||
    location.pathname.startsWith("/service-chat");

  const recalcUnreadFromBackend = useMemo(
    () =>
      async (userId: string) => {
        const { data, error } = await (supabase.rpc as (
          fn: string,
          params?: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_chat_inbox_summaries", {
          p_scope: "all",
          p_chat_ids: null,
        });
        if (error) return;
        const rows = Array.isArray(data)
          ? (data as Array<{ unread_count?: number | null }>)
          : [];
        const unread = rows.reduce((sum, row) => sum + Math.max(0, Number(row?.unread_count ?? 0)), 0);
        setChatUnread(unread);
        try {
          localStorage.setItem(unreadStorageKey, String(unread));
        } catch {
          // ignore
        }
      },
    [unreadStorageKey]
  );

  useEffect(() => {
    if (!profile?.id) {
      setChatUnread(0);
      return;
    }
    setChatUnread(0);
    void recalcUnreadFromBackend(profile.id);
  }, [profile?.id, recalcUnreadFromBackend, unreadStorageKey]);

  useEffect(() => {
    const onUnread = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      const next = Number(detail?.count ?? 0);
      setChatUnread(Number.isFinite(next) ? Math.max(0, next) : 0);
    };
    const onRoomSeen = () => {
      if (!profile?.id) return;
      void recalcUnreadFromBackend(profile.id);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== unreadStorageKey) return;
      const next = event.newValue ? Number(event.newValue) : 0;
      setChatUnread(Number.isFinite(next) ? Math.max(0, next) : 0);
    };
    window.addEventListener("huddle:chats-unread", onUnread as EventListener);
    window.addEventListener("huddle:chat-room-seen", onRoomSeen as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("huddle:chats-unread", onUnread as EventListener);
      window.removeEventListener("huddle:chat-room-seen", onRoomSeen as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [profile?.id, recalcUnreadFromBackend, unreadStorageKey]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`bottom_nav_unread_${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void recalcUnreadFromBackend(profile.id);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, recalcUnreadFromBackend]);

  return (
    <nav
      data-bottom-nav="true"
      className="glass-nav fixed left-4 right-4 z-[2600] h-[64px] rounded-[28px]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      <div className="flex items-center justify-around h-full w-full max-w-[430px] mx-auto px-[8px]">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isSocialAlias = path === "/social" && (location.pathname.startsWith("/social") || location.pathname.startsWith("/threads"));
          const isActive =
            path === "/"
              ? location.pathname === "/"
              : isSocialAlias || location.pathname.startsWith(path);
          const resolvedLabel =
            label === "Home" ? "Home"
            : label === "Service" ? "Service"
            : t(label);

          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={[
                "relative flex flex-col items-center justify-center gap-[2px]",
                "min-w-[44px] min-h-[44px] px-[12px] py-[6px] rounded-[14px]",
                "transition-colors duration-150",
                isActive ? "text-[#2145CF]" : "text-[rgba(74,73,101,0.45)] hover:text-[rgba(74,73,101,0.70)]",
              ].join(" ")}
              aria-current={isActive ? "page" : undefined}
              aria-label={resolvedLabel}
            >
              {/* Active indicator */}
              {isActive && (
                <span
                  className="absolute inset-0 rounded-[14px] bg-[rgba(33,69,207,0.08)] pointer-events-none"
                  aria-hidden
                />
              )}
              <Icon
                size={20}
                strokeWidth={1.5}
                className="relative z-[1]"
                aria-hidden
              />
              {path === "/chats" &&
                chatUnread > 0 &&
                !isChatSurface && (
                <span
                  className="absolute right-[6px] top-[3px] z-[2] h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                  aria-label={`${chatUnread} unread`}
                />
              )}
              <span className="text-[10px] font-[500] leading-tight relative z-[1]">
                {resolvedLabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
