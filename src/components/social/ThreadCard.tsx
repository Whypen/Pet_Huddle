/**
 * ThreadCard — the Social post card, as a standalone presentational component.
 *
 * SCOPE: header, title, map link, body, link preview, hashtags, media, action
 * bar. NOT the comment tree, reply threading, composer or per-comment menus —
 * those are behind the auth wall for logged-out visitors, so they are not a
 * parity surface. Everything a logged-out reader actually sees is here.
 *
 * PRESENTATIONAL ONLY. Data and callbacks in as props; no fetching, no
 * `supabase` import. That is what keeps the logged-out leak guarantee intact.
 *
 * Public identity/profile actions are supplied as callbacks so the exact same
 * visual card can remain readable while profile access stays behind auth.
 */

import { Bookmark, MessageCircle, MoreHorizontal, Pin, Send } from "lucide-react";
import { useState } from "react";
import { HuddlePawIcon } from "@/components/icons/HuddlePawIcon";
import { cn } from "@/lib/utils";
import { PostMediaCarousel } from "@/components/social/PostMediaCarousel";
import { SettingsAvatar } from "@/components/layout/SettingsAvatar";

/**
 * Copied verbatim from `NoticeBoard.tsx:88-107`. That component is module-local
 * and not exported, and exporting it would mean editing the dirty file.
 */
const AuthorHandle = ({
  displayName,
  socialId,
  className = "",
  socialClassName = "",
}: {
  displayName?: string | null;
  socialId?: string | null;
  className?: string;
  socialClassName?: string;
}) => (
  <span className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
    <span className="truncate font-semibold text-brandText">{displayName || "Anonymous"}</span>
    {socialId ? (
      <span className={cn("truncate text-xs font-medium text-[rgba(74,73,101,0.52)]", socialClassName)}>
        @{socialId}
      </span>
    ) : null}
  </span>
);

/** Matches PostMediaCarousel MediaItem: it keys on `src`, not `url`. */
export type ThreadCardMedia = { src: string; kind?: "image" | "video"; alt?: string };

export type ThreadCardData = {
  id: string;
  title: string;
  content: string;
  createdAtLabel: string;
  authorName: string;
  authorSocialId?: string | null;
  authorAvatarUrl?: string | null;
  authorIsVerified?: boolean;
  hashtags?: string[];
  media?: ThreadCardMedia[];
  isSensitive?: boolean;
  supportCount?: number;
  commentCount?: number;
  shareCount?: number;
  /** Chip label, e.g. "Advice". Omitted when absent, never rendered empty. */
  primaryTag?: string | null;
  primaryTagClassName?: string;
};

export interface ThreadCardProps {
  thread: ThreadCardData;
  isSupported?: boolean;
  isSaved?: boolean;
  isPinned?: boolean;
  onSupport: () => void;
  onReply: () => void;
  onShare: () => void;
  onMore?: () => void;
  onSave: () => void;
  onPin: () => void;
  /** Omitted when there is no profile surface to open — see PublicSocial. */
  onOpenProfile?: () => void;
  className?: string;
}

export const ThreadCard = ({
  thread,
  isSupported = false,
  isSaved = false,
  isPinned = false,
  onSupport,
  onReply,
  onShare,
  onMore,
  onSave,
  onPin,
  onOpenProfile,
  className,
}: ThreadCardProps) => {
  const [contentExpanded, setContentExpanded] = useState(false);
  const AvatarTag = (onOpenProfile ? "button" : "span") as "button";
  const media = thread.media ?? [];
  const hashtags = thread.hashtags ?? [];
  const supportCount = Math.max(0, Number(thread.supportCount ?? 0));
  const commentCount = Math.max(0, Number(thread.commentCount ?? 0));
  const shareCount = Math.max(0, Number(thread.shareCount ?? 0));

  return (
    <div
      data-thread-id={thread.id}
      className={cn(
        "w-full max-w-full min-w-0 overflow-hidden py-4 outline-none border-b border-border/70 [content-visibility:auto] [contain-intrinsic-size:auto_520px]",
        className,
      )}
    >
      <div className="relative flex items-start gap-3">
        <div className="absolute right-0 -top-2 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            className={cn(
              "h-8 w-8 rounded-full p-1.5 transition-colors flex items-center justify-center",
              isSaved ? "text-brandBlue" : "text-brandText/60 hover:text-brandText",
            )}
            aria-label="Save post"
          >
            <Bookmark className={cn("h-4 w-4", isSaved && "fill-brandBlue/20")} />
          </button>
          <button
            type="button"
            onClick={onPin}
            className={cn(
              "h-8 w-8 rounded-full p-1.5 transition-colors flex items-center justify-center",
              isPinned ? "text-brandBlue" : "text-brandText/60 hover:text-brandText",
            )}
            aria-label="Toggle post pin"
          >
            <Pin className={cn("h-4 w-4", isPinned && "fill-brandBlue/20")} />
          </button>
        </div>

        {/* A button only when there is somewhere to go. Rendering a button that
            does nothing would be the silent no-op the rules forbid. */}
        <AvatarTag
          {...(onOpenProfile ? { type: "button" as const, onClick: onOpenProfile } : {})}
          {...(onOpenProfile ? { "aria-label": `View ${thread.authorName || "member"}'s profile` } : {})}
          className="relative h-10 w-10 flex-shrink-0 rounded-full bg-transparent"
        >
          <SettingsAvatar displayName={thread.authorName || "Anonymous"} avatarUrl={thread.authorAvatarUrl} isVerified={thread.authorIsVerified} loading="lazy" size={40} />
        </AvatarTag>

        <div className="flex-1 min-w-0">
          <div className="pr-[76px]">
            <div className="flex items-center gap-2 mb-1">
              {/* Same reasoning as the avatar: no handler, no button. */}
              {onOpenProfile ? (
                <button
                  type="button"
                  className="min-w-0 underline-offset-2 hover:underline"
                  onClick={onOpenProfile}
                >
                  <AuthorHandle
                    displayName={thread.authorName || "Anonymous"}
                    socialId={thread.authorSocialId || null}
                    className="max-w-full text-sm"
                  />
                </button>
              ) : (
                <AuthorHandle
                  displayName={thread.authorName || "Anonymous"}
                  socialId={thread.authorSocialId || null}
                  className="max-w-full text-sm"
                />
              )}
            </div>
          </div>

          <p className="text-sm font-semibold break-words">{thread.title}</p>

          <div className={cn(
            "text-sm leading-6 text-foreground break-words whitespace-pre-wrap transition-[max-height] duration-200",
            contentExpanded ? "max-h-none" : "max-h-[120px] overflow-hidden",
          )}>
            {thread.content}
          </div>
          {thread.content.length > 180 || thread.content.split("\n").length > 5 ? (
            <button
              type="button"
              onClick={() => setContentExpanded((current) => !current)}
              className="mt-1 text-xs font-bold text-[rgba(74,73,101,0.72)]"
            >
              {contentExpanded ? "See Less" : "Read More"}
            </button>
          ) : null}

          {hashtags.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {hashtags.slice(0, 3).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}
            </p>
          )}

          {media.length > 0 && (
            <PostMediaCarousel
              className="mt-2"
              isSensitive={thread.isSensitive === true}
              items={media}
              onDoubleTap={onSupport}
            />
          )}

          <div className="mt-3 flex items-center">
            <div className="flex min-w-0 items-center gap-2">
              <p className="text-xs text-[rgba(74,73,101,0.45)]">{thread.createdAtLabel}</p>
              {thread.primaryTag ? (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0",
                    thread.primaryTagClassName,
                  )}
                >
                  {thread.primaryTag}
                </span>
              ) : null}
            </div>

            <div className="ml-auto flex items-center justify-end gap-0.5 min-w-[136px]">
              <button
                type="button"
                onClick={onSupport}
                className={cn(
                  "relative h-8 w-8 inline-flex items-center justify-center rounded-full p-1.5 transition-all",
                  isSupported ? "bg-[var(--support-coral-soft)]" : "hover:bg-muted",
                )}
                title="Support"
              >
                {/* Coral paw, not a thumbs-up — matches the signed-in card. */}
                <HuddlePawIcon
                  filled={isSupported}
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isSupported ? "text-[var(--support-coral)]" : "text-muted-foreground",
                  )}
                />
                {supportCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground text-center">
                    {supportCount}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={onReply}
                className="relative h-8 w-8 inline-flex items-center justify-center rounded-full p-1.5 transition-all hover:bg-muted"
                title="Replies"
                aria-label="Toggle replies"
              >
                <MessageCircle className="w-4 h-4" />
                {commentCount > 0 ? <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground text-center">{commentCount}</span> : null}
              </button>

              <button
                type="button"
                onClick={onShare}
                className="relative h-8 w-8 inline-flex items-center justify-center rounded-full p-1.5 transition-all hover:bg-muted"
                title="Share"
                aria-label="Share post"
              >
                <Send className="w-4 h-4" />
                {shareCount > 0 ? <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground text-center">{shareCount}</span> : null}
              </button>
              {onMore ? (
                <button
                  type="button"
                  onClick={onMore}
                  className="relative h-8 w-8 inline-flex items-center justify-center rounded-full p-1.5 transition-all hover:bg-muted"
                  title="More"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreadCard;
