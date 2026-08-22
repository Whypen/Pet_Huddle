/**
 * /chats, logged out — nearby groups only.
 *
 * No conversations, no message previews, no Discover. The access matrix gives a
 * logged-out visitor "nearby groups + event covers only", and this component
 * cannot show more than that because `/api/public-groups` never returns it —
 * the restriction is enforced at the server, not by hiding UI.
 */

import { useMemo, useRef, useState, type TouchEvent } from "react";
import { useLocation } from "react-router-dom";
import { Hash, Loader2, Search, Users } from "lucide-react";
import { useAuthGate } from "@/components/auth/authGateContext";
import { usePublicGroups } from "@/lib/publicRead";
import { ExploreGroupCard } from "@/components/chat/ExploreGroupCard";
import { PublicFailed, PublicSkeleton, PublicTopBar } from "./PublicChrome";
import { ExpandableSearchField } from "@/components/ui/ExpandableSearchField";
import emptyChatImage from "@/assets/Notifications/Empty Chat.png";

const PublicChats = () => {
  const { requireAuth } = useAuthGate();
  const { data: groups, loading, failed, refresh } = usePublicGroups();
  const { pathname } = useLocation();
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pullStartY = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // The public `/chats` landing is the allowed preview: nearby groups and
  // event covers. Only an explicit friends tab represents private Chats.
  const segment: "groups" | "chats" = pathname.startsWith("/groups") ? "groups" : "chats";
  const visibleGroups = useMemo(() => groups.filter((group) => `${group.name} ${group.area || ""} ${(group.pet_focus || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [groups, query]);

  const onPullStart = (event: TouchEvent<HTMLElement>) => {
    if (window.scrollY > 0 || refreshing || segment !== "groups") return;
    pullStartY.current = event.touches[0]?.clientY ?? null;
  };

  const onPullMove = (event: TouchEvent<HTMLElement>) => {
    if (pullStartY.current === null || window.scrollY > 0) return;
    const distance = Math.max(0, (event.touches[0]?.clientY || 0) - pullStartY.current);
    setPullOffset(Math.min(76, distance * 0.42));
  };

  const onPullEnd = () => {
    if (pullOffset < 54) {
      pullStartY.current = null;
      setPullOffset(0);
      return;
    }
    setRefreshing(true);
    void refresh().finally(() => {
      setRefreshing(false);
      setPullOffset(0);
      pullStartY.current = null;
    });
  };

  return (
    <main
      className="min-h-[100svh] w-full touch-pan-y bg-background pb-24 transition-[padding] duration-200 lg:pl-[var(--public-rail-width,256px)]"
      onTouchStart={onPullStart}
      onTouchMove={onPullMove}
      onTouchEnd={onPullEnd}
      onTouchCancel={onPullEnd}
    >
      <PublicTopBar title="Groups" subtitle="" showIntro={false} mobileActions={segment === "groups" ? <div className="flex items-center gap-0.5"><button type="button" aria-label="Search groups" onClick={() => setSearchOpen((open) => !open)} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted"><Search className="h-[18px] w-[18px]" /></button><button type="button" aria-label="Join group with code" onClick={() => requireAuth("join-group", () => {})} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted"><Hash className="h-[18px] w-[18px]" /></button><button type="button" aria-label="Create group" onClick={() => requireAuth("create-group", () => {})} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted"><Users className="h-[18px] w-[18px]" /></button></div> : undefined} />
      <div className="w-full px-4 pt-3 lg:px-8 2xl:px-12">
        <div
          className="flex items-center justify-center gap-2 overflow-hidden text-[11px] text-muted-foreground transition-[height,opacity] duration-150"
          style={{ height: refreshing ? 30 : pullOffset, opacity: refreshing || pullOffset > 0 ? 1 : 0 }}
          aria-live="polite"
        >
          <Loader2 className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          <span>{refreshing ? "Refreshing…" : pullOffset >= 54 ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
        {segment === "groups" && searchOpen ? <ExpandableSearchField value={query} onChange={setQuery} onClose={() => { setQuery(""); setSearchOpen(false); }} label="Search groups" placeholder="Search groups" className="mb-3" /> : null}
        {segment === "chats" ? (
          <div className="flex min-h-[55svh] items-center justify-center pt-4">
              <button type="button" onClick={() => requireAuth("message", () => {})} className="neu-primary h-12 rounded-2xl px-7 text-[14px] font-bold">
                Sign in to view chats
              </button>
          </div>
        ) : loading ? (
          <PublicSkeleton rows={4} />
        ) : failed ? (
          <PublicFailed what="groups" />
        ) : groups.length === 0 ? (
          <div className="mx-auto flex w-full max-w-md flex-col items-center py-10 text-center">
            <img src={emptyChatImage} alt="" aria-hidden="true" className="w-full max-w-[320px] object-contain" loading="lazy" decoding="async" />
            <p className="mt-2 px-2 text-[15px] leading-relaxed text-muted-foreground">No public groups nearby yet. Be the first to start a local pack!</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleGroups.filter((group) => !hiddenGroupIds.has(group.id)).map((group) => (
              <li key={group.id}>
                {/* The app's own Explore card, not a rebuild. It is purely
                    presentational — props in, no fetching — so the logged-out
                    leak guarantee is unaffected while the visual is identical
                    to what a signed-in member sees. */}
                <ExploreGroupCard
                  group={{
                    id: group.id,
                    name: group.name,
                    avatarUrl: group.cover_url,
                    memberCount: group.member_count,
                    petFocus: group.pet_focus,
                    locationLabel: group.area,
                    description: group.description,
                    nextEventTitle: group.next_event_title,
                    nextEventStartsAt: group.next_event_starts_at,
                    nextEventEndsAt: group.next_event_ends_at,
                  }}
                  cta={{ kind: "join", onJoin: () => requireAuth("join-group", () => {}, { targetId: group.id }) }}
                  onCardOpen={() => requireAuth("join-group", () => {}, { targetId: group.id })}
                  onHide={() => setHiddenGroupIds((current) => new Set(current).add(group.id))}
                  hydratePreviewMembers={false}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default PublicChats;
