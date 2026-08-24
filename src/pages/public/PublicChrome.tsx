/**
 * Shared chrome for the logged-out surfaces.
 *
 * These are new surfaces, so they're designed fresh against the benchmarks
 * rather than inheriting app chrome.
 *
 * LAYOUT — only the bar is sticky
 * ------------------------------
 * Sticky band: wordmark, Create account, destination tabs. One slim visual
 * band, as Threads pins a slim bar and X pins tabs alone.
 *
 * The page title and subtitle scroll away with the content. They are read once;
 * pinning them would cost permanent vertical space on every screen, which on a
 * phone is a serious share of the viewport before any post appears.
 *
 * TABS, NOT PILLS
 * ---------------
 * Rounded tinted pills are this app's vocabulary for FILTER chips. Using them
 * for destinations reads as "narrow this feed" rather than "go elsewhere", so
 * these are flat labels with a 2px underline indicator sitting on the header's
 * own hairline — the X/Threads convention for primary navigation.
 *
 * No bottom nav: a logged-out visitor has three destinations, and a five-tab bar
 * with two dead tabs reads as broken.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, ChevronLeft, ChevronRight, Info, MoreHorizontal, PenSquare } from "lucide-react";
import { HuddleWordmark } from "@/components/brand/HuddleWordmark";
import { WebBrandMedia } from "@/components/brand/WebBrandMedia";
import { AppPromoCta } from "@/components/web/AppPromoCta";
import { useAuthGate } from "@/components/auth/authGateContext";
import { HuddleGlyph, HuddleNavIcon } from "@/components/icons/HuddleIcons";
import { NAV_DESTINATIONS, isNavDestinationActive, type NavDestinationId } from "@/components/layout/navDestinations";

const preloadDestination: Record<NavDestinationId, () => Promise<unknown>> = {
  social: () => import("./PublicSocial"),
  map: () => import("./PublicMap"),
  groups: () => import("./PublicChats"),
  chats: () => import("./PublicChats"),
};

/**
 * The sticky band. `useLocation` rather than `window.location`: the latter is
 * not reactive, so on client-side navigation the active tab would not follow the
 * visitor and `?next=` would carry whatever path happened to be in the DOM.
 * A full page load hides the bug — it only shows on in-app navigation, which is
 * the common case.
 */
export const PublicTopBar = ({
  title,
  subtitle,
  showIntro = true,
  mobileActions,
}: {
  title: string;
  subtitle: string;
  showIntro?: boolean;
  mobileActions?: ReactNode;
}) => {
  const { pathname, search } = useLocation();
  const { requireAuth } = useAuthGate();
  const [railCollapsed, setRailCollapsed] = useState(() => localStorage.getItem("huddle_web_rail") === "collapsed");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const suppressHoverExpansionRef = useRef(false);
  const railExpanded = !railCollapsed || hoverExpanded;
  const isGroupsExplore = pathname.startsWith("/groups");
  const createIntent = pathname.startsWith("/map") ? "broadcast" : isGroupsExplore ? "create-group" : pathname.startsWith("/chats") ? null : "post";
  const createLabel = pathname.startsWith("/map") ? "Create Broadcast" : isGroupsExplore ? "Create Group" : "Create";

  useEffect(() => {
    const width = railCollapsed ? "76px" : "256px";
    document.documentElement.style.setProperty("--public-rail-width", width);
    localStorage.setItem("huddle_web_rail", railCollapsed ? "collapsed" : "expanded");
  }, [railCollapsed]);

  return (
    <>
      <aside
        style={{ width: railExpanded ? 256 : 76 }}
        onMouseEnter={() => { if (railCollapsed && !suppressHoverExpansionRef.current) setHoverExpanded(true); }}
        onMouseLeave={() => { suppressHoverExpansionRef.current = false; setHoverExpanded(false); }}
        onFocusCapture={() => { if (railCollapsed) setHoverExpanded(true); }}
        onBlurCapture={(event) => {
          if (railCollapsed && !event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverExpanded(false);
        }}
        className="fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-border/60 bg-background px-3 py-6 transition-[width] duration-200 lg:flex"
      >
        <div className="mb-8 flex h-10 items-center justify-between px-0.5">
        <Link to="/social" aria-label="huddle" className="overflow-hidden no-underline">
          <WebBrandMedia size={38} className="ml-1" />
        </Link>
        {railExpanded ? <button type="button" aria-label={railCollapsed ? "Keep navigation expanded" : "Collapse navigation"} onClick={() => { const nextCollapsed = !railCollapsed; suppressHoverExpansionRef.current = nextCollapsed; setRailCollapsed(nextCollapsed); setHoverExpanded(false); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted">{railCollapsed ? <ChevronRight className="h-4 w-4"/> : <ChevronLeft className="h-4 w-4"/>}</button> : null}
        </div>
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {NAV_DESTINATIONS.map((destination) => {
            const active = isNavDestinationActive(destination, pathname, search);
            return <Link key={destination.path} to={destination.path} aria-label={destination.label} aria-current={active ? "page" : undefined} onMouseEnter={preloadDestination[destination.id]} onFocus={preloadDestination[destination.id]} onClick={(event) => { if (destination.gate !== "requires-auth") return; event.preventDefault(); requireAuth("message", () => {}); }} className={`flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold no-underline transition-colors ${active ? "bg-muted text-brandText" : "text-brandText/75 hover:bg-muted/60 hover:text-brandText"}`}><span className="grid h-[22px] w-[24px] shrink-0 place-items-center" aria-hidden>{destination.icon === "groups" ? <HuddleGlyph name="chatsGroup" size={20}/> : <HuddleNavIcon name={destination.icon!} size={22}/>}</span>{railExpanded ? <span>{destination.label}</span> : null}</Link>;
          })}
          <button aria-label="Notifications" type="button" onClick={() => requireAuth("notifications", () => {})} className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 hover:bg-muted/60 hover:text-brandText"><Bell className="h-[22px] w-[22px] shrink-0"/>{railExpanded ? <span>Notifications</span> : null}</button>
          {createIntent ? <button aria-label={createLabel} type="button" onClick={() => requireAuth(createIntent, () => {})} className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 hover:bg-muted/60 hover:text-brandText"><PenSquare className="h-[22px] w-[22px] shrink-0"/>{railExpanded ? <span>{createLabel}</span> : null}</button> : null}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <AppPromoCta variant="rail" collapsed={!railExpanded} />
          {/* Back to brandweb. Without it the public surfaces are a dead end for
              anyone who arrived on a shared link and wants to know what huddle is. */}
          <a href="/" className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 no-underline transition-colors hover:bg-muted/60 hover:text-brandText"><Info className="h-[22px] w-[22px] shrink-0"/>{railExpanded ? <span>About huddle</span> : null}</a>
          <button aria-label="More" type="button" onClick={() => requireAuth("settings", () => {})} className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 hover:bg-muted/60 hover:text-brandText"><MoreHorizontal className="h-[22px] w-[22px] shrink-0"/>{railExpanded ? <span>More</span> : null}</button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 h-14 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="relative flex h-full w-full items-center justify-between px-4">
          <Link to="/social" aria-label="huddle" className="no-underline">
            <HuddleWordmark size={28} />
          </Link>
          <div className="flex items-center gap-0.5">
            {mobileActions}
            <Link
              to={`/join?next=${encodeURIComponent(`${pathname}${search}`)}`}
              className="neu-primary ml-1 inline-flex h-11 items-center rounded-full px-4 text-[13px] font-bold no-underline"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <nav className="glass-nav fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+8px)] z-[2600] mx-auto flex h-16 max-w-[430px] items-center justify-around rounded-[28px] px-2 lg:hidden" aria-label="Sections">
        {NAV_DESTINATIONS.map((destination) => {
          const isActive = isNavDestinationActive(destination, pathname, search);
          return (
            <Link
              key={destination.path}
              to={destination.path}
              aria-current={isActive ? "page" : undefined}
              onMouseEnter={preloadDestination[destination.id]}
              onFocus={preloadDestination[destination.id]}
              onClick={(event) => {
                if (destination.gate !== "requires-auth") return;
                event.preventDefault();
                requireAuth("message", () => {});
              }}
              className={[
                "relative inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[14px] px-2 text-[10px] font-semibold no-underline transition-colors",
                isActive ? "bg-brandBlue/[0.08] text-brandBlue" : "text-muted-foreground hover:text-brandText",
              ].join(" ")}
            >
              <span className="grid h-5 w-6 place-items-center" aria-hidden>{destination.icon === "groups" ? <HuddleGlyph name="chatsGroup" size={19}/> : <HuddleNavIcon name={destination.icon!} size={20}/>}</span>
              <span>{destination.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      {showIntro ? (
        /* Scrolls away with the content — page introduction, not chrome. */
        <div className="mx-auto w-full max-w-[680px] px-4 pb-1 pt-5">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-brandText">
            {title}
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-muted-foreground text-pretty">{subtitle}</p>
        </div>
      ) : null}

      {/* Sits below the title, above the feed — in the reading order, never over
          it. Scrolls away with the content and stays dismissed once dismissed. */}
      <div className="px-4 pt-3 lg:hidden">
        <AppPromoCta variant="bar" />
      </div>
    </>
  );
};

/** Skeletons shaped like the real content, never a centred spinner. */
export const PublicSkeleton = ({ rows }: { rows: number }) => (
  <ul className="flex flex-col gap-3" aria-hidden>
    {Array.from({ length: rows }, (_, index) => (
      <li key={index} className="card-e1 rounded-[18px] p-4">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          <span className="h-3.5 w-28 animate-pulse rounded bg-muted" />
        </div>
        <span className="mt-3 block h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <span className="mt-2 block h-3.5 w-1/2 animate-pulse rounded bg-muted" />
      </li>
    ))}
  </ul>
);

export const PublicEmpty = ({
  headline,
  body,
  actionLabel,
  onAction,
}: {
  headline: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) => (
  <div className="mt-10 rounded-[18px] border border-dashed border-border px-6 py-10 text-center">
    <p className="text-[16px] font-extrabold text-brandText text-balance">{headline}</p>
    <p className="mx-auto mt-1.5 max-w-[36ch] text-[14px] font-medium text-muted-foreground text-pretty">
      {body}
    </p>
    <button
      type="button"
      onClick={onAction}
      className="neu-primary mt-5 inline-flex h-11 items-center rounded-[14px] px-5 text-[14px] font-bold"
    >
      {actionLabel}
    </button>
  </div>
);

/**
 * A failed fetch is not an empty district, and must not be dressed up as one —
 * "nothing here" when the request actually failed is a lie the visitor acts on.
 */
export const PublicFailed = ({ what }: { what: string }) => (
  <div className="mt-10 rounded-[18px] border border-border px-6 py-10 text-center">
    <p className="text-[15px] font-bold text-brandText">Couldn&apos;t load {what}.</p>
    <p className="mx-auto mt-1.5 max-w-[36ch] text-[14px] font-medium text-muted-foreground">
      Check your connection and refresh.
    </p>
  </div>
);
