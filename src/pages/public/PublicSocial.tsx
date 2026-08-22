/**
 * /social, logged out — read the feed, take no action.
 *
 * Renders the app's own `ThreadCard`, so a logged-out visitor sees the same post
 * card a member does. No markup is defined here.
 *
 * This file contains no `supabase` import and does no fetching of its own — the
 * data comes from `/api/public-feed` via `usePublicRead`. That is what makes the
 * logged-out leak guarantee structural rather than a promise.
 *
 * Every action routes through `requireAuth`, which opens the auth wall. Nothing
 * is a silent no-op.
 */

import { useMemo, useRef, useState, type TouchEvent } from "react";
import { ArrowDownUp, Check, Loader2, Search, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuthGate } from "@/components/auth/authGateContext";
import { usePublicFeed, relativeTime } from "@/lib/publicRead";
import { ThreadCard } from "@/components/social/ThreadCard";
import { SocialComposerBar } from "@/components/social/SocialComposerBar";
import { PublicTopBar, PublicFailed, PublicSkeleton } from "./PublicChrome";
import { SocialSectionList } from "@/components/social/SocialSectionList";
import {
  SOCIAL_SECTION_ALIASES,
  type SocialSection,
} from "@/components/social/socialSections";

const publicTagClassName = (category: string) =>
  category.trim().toLowerCase() === "news"
    ? "border border-[#A1A4A9] bg-[#A1A4A9] text-white"
    : "border border-primary bg-primary text-white";

const PublicSocial = () => {
  const { requireAuth } = useAuthGate();
  const { pathname, search } = useLocation();
  const [selectedSection, setSelectedSection] = useState<SocialSection | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"Latest" | "Trending">("Latest");
  const { data: posts, loading, failed, refresh } = usePublicFeed(sortMode);
  const [activeControl, setActiveControl] = useState<"search" | "sort" | null>(null);
  const scrollStartY = useRef<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const visiblePosts = useMemo(() => {
    const aliases = selectedSection ? SOCIAL_SECTION_ALIASES[selectedSection].map((value) => value.toLowerCase()) : null;
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = posts.filter((post) => {
      if (aliases && !post.tags.some((tag) => aliases.includes(tag.trim().toLowerCase()))) return false;
      if (!normalizedQuery) return true;
      return `${post.author_name} ${post.title} ${post.content} ${post.tags.join(" ")} ${post.hashtags.join(" ")}`.toLowerCase().includes(normalizedQuery);
    });
    // Ordering is owned by the same database ranking contract as the app.
    // Client filtering must preserve that order instead of inventing another
    // Trending formula over only the first page.
    return filtered;
  }, [posts, query, selectedSection]);

  const sharePost = async (post: (typeof posts)[number]) => {
    const url = new URL(`/social?focus=${encodeURIComponent(post.id)}`, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      await navigator.share({ title: post.title || "Huddle", text: post.content, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  const onPullStart = (event: TouchEvent<HTMLElement>) => {
    if (window.scrollY > 0 || refreshing) return;
    scrollStartY.current = event.touches[0]?.clientY ?? null;
  };

  const onPullMove = (event: TouchEvent<HTMLElement>) => {
    if (scrollStartY.current === null || window.scrollY > 0) return;
    const distance = Math.max(0, (event.touches[0]?.clientY || 0) - scrollStartY.current);
    setPullOffset(Math.min(76, distance * 0.42));
  };

  const onPullEnd = () => {
    if (pullOffset < 54) {
      scrollStartY.current = null;
      setPullOffset(0);
      return;
    }
    setRefreshing(true);
    void refresh().finally(() => {
      setRefreshing(false);
      setPullOffset(0);
      scrollStartY.current = null;
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
      <PublicTopBar
        title="Social"
        subtitle=""
        showIntro={false}
        mobileActions={
          <div className="flex items-center">
            <button type="button" aria-label="Search" aria-expanded={activeControl === "search"} onClick={() => setActiveControl((current) => current === "search" ? null : "search")} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><Search className="h-5 w-5" /></button>
            <button type="button" aria-label="Sort" aria-expanded={activeControl === "sort"} onClick={() => setActiveControl((current) => current === "sort" ? null : "sort")} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><ArrowDownUp className="h-5 w-5" /></button>
          </div>
        }
      />

      {activeControl ? (
        <div className="border-b border-border/60 bg-background px-4 py-2">
          {activeControl === "search" ? (
            <label className="form-field-rest mx-auto flex h-11 w-full items-center rounded-[22px] px-3 lg:max-w-none">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
              <span className="sr-only">Search social posts</span>
              <input autoFocus type="text" inputMode="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field-input-core min-w-0 flex-1 pl-2 text-sm" />
              <button type="button" aria-label="Close search" onClick={() => setActiveControl(null)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
            </label>
          ) : (
            <div className="mx-auto max-w-[320px] rounded-[14px] border border-border bg-background p-1.5 shadow-lg" role="menu" aria-label="Sort social posts">
              {(["Latest", "Trending"] as const).map((option) => <button key={option} type="button" role="menuitemradio" aria-checked={sortMode === option} onClick={() => { setSortMode(option); setActiveControl(null); }} className={sortMode === option ? "flex h-10 w-full items-center justify-between rounded-[10px] bg-brandBlue/[0.08] px-3 text-[13px] font-bold text-brandBlue" : "flex h-10 w-full items-center justify-between rounded-[10px] px-3 text-[13px] font-semibold text-brandText hover:bg-muted"}>{option}{sortMode === option ? <Check className="h-4 w-4" /> : null}</button>)}
            </div>
          )}
        </div>
      ) : null}

      <div className="mx-auto w-full px-4 lg:px-8 2xl:px-12">
        <div
          className="flex items-center justify-center gap-2 overflow-hidden text-[11px] text-muted-foreground transition-[height,opacity] duration-150"
          style={{ height: refreshing ? 30 : pullOffset, opacity: refreshing || pullOffset > 0 ? 1 : 0 }}
          aria-live="polite"
        >
          <Loader2 className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          <span>{refreshing ? "Refreshing…" : pullOffset >= 54 ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
        <section className="min-w-0">
        {/* Renders identically to the signed-in bar — seeing where you would
            write is part of what makes the page worth joining. Tapping opens
            the wall rather than a composer that could never post. */}
        <div className="sticky top-14 z-30 bg-background">
          <SocialComposerBar onOpen={() => requireAuth("post", () => {})} />
          <SocialSectionList selected={selectedSection} onSelect={setSelectedSection} />
        </div>

        {loading ? (
          <PublicSkeleton rows={4} />
        ) : failed ? (
          <PublicFailed what="posts" />
        ) : visiblePosts.length === 0 ? (
          null
        ) : (
          <ul className="flex flex-col">
            {visiblePosts.map((post) => (
              <li key={post.id}>
                <ThreadCard
                  thread={{
                    id: post.id,
                    title: post.title,
                    content: post.content,
                    createdAtLabel: relativeTime(post.created_at),
                    authorName: post.author_name,
                    authorSocialId: post.author_social_id,
                    authorAvatarUrl: post.author_avatar_url,
                    authorIsVerified: post.author_verification_status === "verified",
                    isSensitive: post.is_sensitive === true,
                    hashtags: post.hashtags,
                    primaryTag: post.category || null,
                    primaryTagClassName: post.category ? publicTagClassName(post.category) : undefined,
                    media: post.images.map((src, index) => ({ src, kind: "image" as const, alt: `${post.title || "Post"} ${index + 1}` })),
                    supportCount: post.likes,
                    commentCount: post.comment_count,
                    shareCount: post.share_count,
                  }}
                  // Every one of these opens the wall — read-only, never a no-op.
                  onSupport={() => requireAuth("like", () => {}, { targetId: post.id })}
                  onReply={() => requireAuth("reply", () => {}, { targetId: post.id })}
                  onShare={() => void sharePost(post)}
                  onMore={() => requireAuth("post-options", () => {}, { targetId: post.id })}
                  onSave={() => requireAuth("save-post", () => {}, { targetId: post.id })}
                  onPin={() => requireAuth("pin-post", () => {}, { targetId: post.id })}
                  onOpenProfile={() =>
                    requireAuth("profile", () => {}, {
                      targetId: post.author_social_id || post.id,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        </section>
      </div>
    </main>
  );
};

export default PublicSocial;
