/**
 * BottomNav — Phase 4 / Step 22
 * glass-nav (A.2) — replaces former bg-white version (D.1 violation removed)
 * z-[20] per Z-index map
 * All icons: strokeWidth={1.5} (A.7)
 * No framer-motion bounce (A.8 — banned)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { shouldSuppressWebBottomNavForNativeShell } from "@/lib/nativeShell";
import { HuddleGlyph, HuddleNavIcon } from "@/components/icons/HuddleIcons";
import { NAV_DESTINATIONS, isNavDestinationActive } from "@/components/layout/navDestinations";

// Care is hidden on web in every form, signed in or out — there is no web build
// of it. The Service entry is removed outright rather than flag-gated: a flag
// would imply it can be switched on, which is not the plan.
/** Height constant for offset calculations (matches glass-nav h-[64px]) */
export const BOTTOM_NAV_HEIGHT = 80;

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
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
        const { data, error } = await (supabase.rpc as unknown as (
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

  if (shouldSuppressWebBottomNavForNativeShell()) return null;

  return (
    <nav
      data-bottom-nav="true"
      className="glass-nav fixed left-4 right-4 z-[2600] h-[64px] rounded-[28px] lg:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
    >
      {/* Same --app-max-width token as the shell. */}
      <div className="flex items-center justify-around h-full w-full max-w-[var(--app-max-width,430px)] mx-auto px-[8px]">
        {NAV_DESTINATIONS.map((destination) => {
          const { icon, path } = destination;
          const targetPathname = path.split("?")[0];
          const targetTab = new URLSearchParams(path.split("?")[1] || "").get("tab");
          const isSocialAlias = targetPathname === "/social" && (location.pathname.startsWith("/social") || location.pathname.startsWith("/threads"));
          const isActive = isSocialAlias || isNavDestinationActive(destination, location.pathname, location.search);
          const resolvedLabel = destination.shortLabel;

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
              <span className="relative z-[1] grid h-5 w-6 place-items-center" aria-hidden>
                {icon === "groups" ? <HuddleGlyph name="chatsGroup" size={20} /> : <HuddleNavIcon name={icon} size={20} />}
              </span>
              {targetPathname === "/chats" && targetTab === "friends" &&
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
