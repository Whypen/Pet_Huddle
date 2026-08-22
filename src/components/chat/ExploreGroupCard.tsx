/**
 * ExploreGroupCard — Chats > Groups > Explore
 *
 * Direct web counterpart of NativeChatsScreen.ExploreGroupCard. The cover,
 * scrim, member count, dismiss control, location, sentence-case pet chips,
 * description and one full-width CTA keep the same hierarchy as the app.
 *
 * Glass-card class is the existing tokenized surface (src/styles/global.css).
 * No new tokens, no new packages, no new queries.
 */

import React, { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, MapPin, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuroraCover } from "@/components/chat/AuroraCover";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExploreGroupCardCTA =
  | { kind: "join"; onJoin: () => void }
  | { kind: "request"; onRequest: () => void }
  | { kind: "requested" }
  | { kind: "invited"; onAccept: () => void }
  | { kind: "open"; onOpen: () => void };

// Structural type — accepts the Chats.tsx `Group` shape without coupling to it.
export interface ExploreGroupCardData {
  id: string;
  name: string;
  avatarUrl?: string | null;
  memberCount: number;
  petFocus?: string[] | null;
  locationLabel?: string | null;
  description?: string | null;
  isVerified?: boolean | null;
  nextEventTitle?: string | null;
  nextEventStartsAt?: string | null;
  nextEventEndsAt?: string | null;
}

export interface ExploreGroupCardProps {
  group: ExploreGroupCardData;
  cta: ExploreGroupCardCTA;
  onCardOpen: () => void;
  onHide?: () => void;
  className?: string;
  friendIds?: Set<string>;
  outIds?: Set<string>;
  /** Keep count-only cards query-free when the parent does not need member faces. */
  hydratePreviewMembers?: boolean;
}

const sentenceCaseTag = (value: string) => {
  const clean = String(value || "").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : clean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ExploreGroupCard: React.FC<ExploreGroupCardProps> = ({
  group,
  cta,
  onCardOpen,
  onHide,
  className = "",
  friendIds = new Set<string>(),
  outIds = new Set<string>(),
  hydratePreviewMembers = true,
}) => {
  const petTags = (group.petFocus ?? []).slice(0, 4);
  const memberLabel = `${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`;
  const eventCountdown = groupNextEventCountdownLabel(group.nextEventStartsAt, group.nextEventEndsAt);
  const [previewMembers, setPreviewMembers] = useState<Array<{ id: string; avatarUrl: string | null }>>([]);

  useEffect(() => {
    if (!hydratePreviewMembers) {
      setPreviewMembers([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (supabase.rpc as unknown as (name: string, args: { p_chat_id: string }) => Promise<{ data: unknown; error: unknown }>)("get_public_group_preview_members", { p_chat_id: group.id })
        .then(({ data, error }) => {
          if (cancelled || error) return;
          const rows = (Array.isArray(data) ? data : []) as Array<{ user_id?: unknown; avatar_url?: unknown }>;
          setPreviewMembers(rows.map((row) => ({ id: String(row.user_id || ""), avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null })).filter((row) => row.id).slice(0, 4));
        });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [group.id, hydratePreviewMembers]);

  const stackMembers = [...previewMembers].sort((left, right) => {
    const leftRank = outIds.has(left.id) ? (friendIds.has(left.id) ? 0 : 1) : friendIds.has(left.id) ? 2 : 3;
    const rightRank = outIds.has(right.id) ? (friendIds.has(right.id) ? 0 : 1) : friendIds.has(right.id) ? 2 : 3;
    return leftRank - rightRank || left.id.localeCompare(right.id);
  });
  const outNowCount = stackMembers.filter((member) => outIds.has(member.id)).length;

  return (
    <article className={`overflow-hidden rounded-[20px] border border-brandText/[0.04] bg-background shadow-sm ${className}`}>
      {/* Cover — the native ExploreGroupCard uses one full-cover scrim. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onCardOpen}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCardOpen(); } }}
        aria-label={`Open ${group.name} details`}
        className="relative block w-full aspect-[16/9] overflow-hidden text-left"
      >
        {group.avatarUrl ? (
          <img
            src={group.avatarUrl}
            alt={group.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <AuroraCover seed={group.id} initial={group.name} />
        )}

        {/* Native token: profileHeroScrimMid = rgba(20,24,38,0.38). */}
        <div
          className="pointer-events-none absolute inset-0 bg-[rgba(20,24,38,0.38)]"
          aria-hidden
        />

        {/* Native only replaces this pill with the member face stack when that
            authenticated projection is available. Public covers stay count-only. */}
        {stackMembers.length === 0 ? <span
          className="absolute left-3 top-3 rounded-full bg-[rgba(33,69,207,0.60)] px-3 py-1 text-[11px] font-semibold leading-[14px] text-white"
        >
          {memberLabel}
        </span> : null}

        {onHide ? (
          <button
            type="button"
            aria-label={`Hide ${group.name}`}
            onClick={(event) => { event.stopPropagation(); onHide(); }}
            className="absolute right-3 top-3 grid h-[34px] w-[34px] place-items-center rounded-full border border-white/50 bg-white/75 text-brandBlue shadow-sm backdrop-blur-md"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : null}

        {/* Basic info overlay — bottom-left, profile-card style */}
        <div className={`absolute bottom-3 left-4 right-4 flex flex-col gap-[4px] ${stackMembers.length > 0 ? "pr-[124px]" : ""}`}>
          {eventCountdown ? (
            <span className="mb-1 inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-success bg-success/20 px-2.5 py-1 text-[11px] font-bold leading-[14px] text-white backdrop-blur-md">
              {eventCountdown.active ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success shadow-[0_0_0_3px_hsl(var(--success)/0.22)]" aria-hidden />
              ) : (
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
              )}
              <span className="truncate">{eventCountdown.label}</span>
            </span>
          ) : null}
          <div className="flex items-center gap-[6px] min-w-0">
            <span className="truncate text-[17px] font-extrabold leading-[22px] tracking-[-0.2px] text-white drop-shadow-sm">
              {group.name}
            </span>
          </div>
          {group.locationLabel ? (
            <span className="flex truncate items-center gap-[4px] text-[12px] font-semibold leading-[15px] text-white/75">
              <MapPin size={12} strokeWidth={1.75} className="flex-shrink-0" aria-hidden />
              {group.locationLabel}
            </span>
          ) : null}
          {petTags.length > 0 ? (
            <div className="flex gap-[6px] overflow-x-auto scrollbar-hide pb-[2px] -mx-1 px-1">
              {petTags.map((tag) => (
                <span
                  key={tag}
                  className="flex-shrink-0 rounded-full border border-white/[0.35] bg-white/[0.18] px-2 py-1 text-[11px] font-medium normal-case leading-[14px] tracking-[0.1px] text-white"
                >
                  {sentenceCaseTag(tag)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {stackMembers.length > 0 ? <div className="absolute bottom-3 right-3 flex items-center" aria-label={`${stackMembers.length} group members shown`}>
          {stackMembers.map((member, index) => <span key={member.id} className={`grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 bg-muted text-brandBlue ${outIds.has(member.id) ? "border-success shadow-[0_0_0_2px_hsl(var(--success)/0.22)]" : "border-white"}`} style={{ marginLeft: index ? -9 : 0, zIndex: stackMembers.length - index }}>
            {member.avatarUrl ? <img src={member.avatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <User className="h-4 w-4" />}
          </span>)}
          {group.memberCount > stackMembers.length ? <span className="-ml-2 grid h-9 min-w-9 place-items-center rounded-full border-2 border-white bg-brandBlue px-1 text-[10px] font-bold text-white">+{group.memberCount - stackMembers.length}</span> : null}
        </div> : null}
      </div>

      {/* Body — description (optional) + CTA */}
      <div className="space-y-3 p-4">
        {outNowCount > 0 ? <p className="flex items-center gap-2 text-[12px] font-semibold text-brandText"><span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_3px_hsl(var(--success)/0.18)]" />{outNowCount} member{outNowCount === 1 ? " is" : "s are"} out now</p> : null}
        {group.description ? (
          <p className="text-[13px] leading-relaxed text-[rgba(74,73,101,0.70)] line-clamp-2 break-words">
            {group.description}
          </p>
        ) : null}

        <CTAButton cta={cta} groupName={group.name} />
      </div>
    </article>
  );
};

export type GroupEventCountdown = { label: string; active: boolean };

/** Exact web counterpart of NativeChatsScreen.groupNextEventCountdownLabel. */
export const groupNextEventCountdownLabel = (
  startsAt?: string | null,
  endsAt?: string | null,
  nowMs = Date.now(),
): GroupEventCountdown | null => {
  const starts = startsAt ? new Date(startsAt).getTime() : 0;
  const ends = endsAt ? new Date(endsAt).getTime() : 0;
  if (!Number.isFinite(starts) || starts <= 0) return null;
  if (Number.isFinite(ends) && ends > 0 && ends <= nowMs) return null;
  const diffMs = starts - nowMs;
  if (diffMs <= 0) return { label: "Event happening", active: true };
  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) {
    return {
      label: `Event in ${totalMinutes} ${totalMinutes === 1 ? "min" : "mins"}`,
      active: false,
    };
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return {
      label: minutes > 0 ? `Event in ${totalHours}h ${minutes}m` : `Event in ${totalHours}h`,
      active: false,
    };
  }
  const days = Math.round(totalHours / 24);
  return { label: `Event in ${days} ${days === 1 ? "day" : "days"}`, active: false };
};

// ─── CTA button ───────────────────────────────────────────────────────────────

function CTAButton({ cta, groupName }: { cta: ExploreGroupCardCTA; groupName: string }) {
  const baseClass =
    "flex h-[44px] w-full items-center justify-center gap-[6px] rounded-full bg-primary px-[22px] text-[15px] font-semibold text-white shadow-soft transition-all duration-150 active:scale-[0.97]";

  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  switch (cta.kind) {
    case "join":
      return (
        <button
          type="button"
          aria-label={`Join ${groupName}`}
          className={baseClass}
          onClick={(e) => stop(e, cta.onJoin)}
        >
          Join
        </button>
      );

    case "request":
      return (
        <button
          type="button"
          aria-label={`Request to join ${groupName}`}
          className={baseClass}
          onClick={(e) => stop(e, cta.onRequest)}
        >
          Request to join
        </button>
      );

    case "requested":
      return (
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="Join request pending"
          className={`${baseClass} bg-muted text-muted-foreground shadow-none`}
        >
          Requested
        </button>
      );

    case "invited":
      return (
        <button
          type="button"
          aria-label={`Accept invite to ${groupName}`}
          className={`${baseClass} bg-[var(--support-coral)]`}
          onClick={(e) => stop(e, cta.onAccept)}
        >
          You&apos;re invited
        </button>
      );

    case "open":
      return (
        <button
          type="button"
          aria-label={`Open ${groupName}`}
          className={baseClass}
          onClick={(e) => stop(e, cta.onOpen)}
        >
          Open Group
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </button>
      );
  }
}

export default ExploreGroupCard;
