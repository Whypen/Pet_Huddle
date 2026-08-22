import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, ChevronLeft, ChevronRight, MoreHorizontal, PenSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { WebBrandMedia } from "@/components/brand/WebBrandMedia";
import { HuddleGlyph, HuddleNavIcon } from "@/components/icons/HuddleIcons";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { SettingsAvatar } from "@/components/layout/SettingsAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { isVerifiedProfile } from "@/lib/verification";
import { membershipTierLabel } from "@/lib/membership";
import { NAV_DESTINATIONS, isNavDestinationActive, type NavDestinationId } from "@/components/layout/navDestinations";

const preloadDestination: Record<NavDestinationId, () => Promise<unknown>> = {
  social: () => import("@/pages/Social"),
  map: () => import("@/pages/Map"),
  groups: () => import("@/pages/ChatsTwoPane"),
  chats: () => import("@/pages/ChatsTwoPane"),
};

export function DesktopSurfaceRail({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("huddle_web_rail") === "collapsed");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const suppressHoverExpansionRef = useRef(false);
  const expanded = !collapsed || hoverExpanded;
  const returnTo = `${pathname}${search}`;
  const isGroupsExplore = pathname.startsWith("/groups");
  const createPath = pathname.startsWith("/map")
    ? "/map?mode=broadcast"
    : isGroupsExplore
      ? "/groups?create=group"
      : pathname.startsWith("/chats")
        ? null
        : "/social?compose=1";
  const createLabel = pathname.startsWith("/map") ? "Create Broadcast" : isGroupsExplore ? "Create Group" : "Create";

  useEffect(() => {
    const width = collapsed ? "76px" : "256px";
    document.documentElement.style.setProperty("--member-rail-width", width);
    localStorage.setItem("huddle_web_rail", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <aside
        className="fixed inset-y-0 left-0 z-[2800] hidden flex-col border-r border-border/60 bg-background px-3 py-6 transition-[width] duration-200 lg:flex"
        style={{ width: expanded ? 256 : 76 }}
        onMouseEnter={() => {
          if (collapsed && !suppressHoverExpansionRef.current) setHoverExpanded(true);
        }}
        onMouseLeave={() => {
          suppressHoverExpansionRef.current = false;
          setHoverExpanded(false);
        }}
        onClickCapture={() => {
          if (collapsed) setHoverExpanded(true);
        }}
        onFocusCapture={() => {
          if (collapsed) setHoverExpanded(true);
        }}
        onBlurCapture={(event) => {
          if (collapsed && !event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverExpanded(false);
        }}
      >
        <div className="mb-8 flex h-10 items-center justify-between px-0.5">
          <button type="button" aria-label="Go to Social" onClick={() => navigate("/social")} className="overflow-hidden">
            <WebBrandMedia size={38} className="ml-1" />
          </button>
          {expanded ? (
            <button
              type="button"
              aria-label={collapsed ? "Keep navigation expanded" : "Collapse navigation"}
              onClick={() => {
                const nextCollapsed = !collapsed;
                suppressHoverExpansionRef.current = nextCollapsed;
                setCollapsed(nextCollapsed);
                setHoverExpanded(false);
              }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        <SettingsMenu
          displayName={profile?.display_name || "User"}
          avatarUrl={profile?.avatar_url || null}
          socialId={profile?.social_id || null}
          accountEmail={user?.email || null}
          isVerified={isVerifiedProfile(profile)}
          tierLabel={membershipTierLabel(profile?.effective_tier ?? profile?.tier)}
          onLogout={() => void signOut().then(() => navigate("/join"))}
          onEditProfile={() => navigate("/edit-profile", { state: { returnTo } })}
          onManageMembership={() => navigate("/member", { state: { returnTo } })}
          triggerAriaLabel="Profile"
          initialView="profile"
          triggerContent={
            <span className="mb-3 flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left text-brandText transition-colors hover:bg-muted/60">
              <SettingsAvatar
                displayName={profile?.display_name || "User"}
                avatarUrl={profile?.avatar_url || null}
                isVerified={isVerifiedProfile(profile)}
                size={38}
              />
              {expanded ? (
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-extrabold leading-tight">
                    {profile?.display_name || "Profile"}
                  </span>
                  <span className="block truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {membershipTierLabel(profile?.effective_tier ?? profile?.tier)}
                  </span>
                </span>
              ) : null}
            </span>
          }
          triggerClassName="w-full rounded-xl focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-muted/60"
        />

        <nav className="flex flex-col gap-1" aria-label="Primary">
          {NAV_DESTINATIONS.map((destination) => {
            const active = isNavDestinationActive(destination, pathname, search);
            return (
              <button
                key={destination.path}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={destination.label}
                onMouseEnter={preloadDestination[destination.id]}
                onFocus={preloadDestination[destination.id]}
                onClick={() => navigate(destination.path)}
                className={`flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold transition-colors ${active ? "bg-muted text-brandText" : "text-brandText/75 hover:bg-muted/60 hover:text-brandText"}`}
              >
                {destination.icon === "groups" ? <HuddleGlyph name="chatsGroup" size={20} /> : <HuddleNavIcon name={destination.icon} size={22} />}
                {expanded ? <span>{destination.label}</span> : null}
              </button>
            );
          })}
          <button type="button" onClick={() => navigate("/notifications")} className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 hover:bg-muted/60 hover:text-brandText">
            <Bell className="h-[22px] w-[22px] shrink-0" />
            {expanded ? <span>Notifications</span> : null}
          </button>
          {createPath ? (
            <button type="button" aria-label={createLabel} onClick={() => navigate(createPath)} className="flex h-12 items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 hover:bg-muted/60 hover:text-brandText">
              <PenSquare className="h-[22px] w-[22px] shrink-0" />
              {expanded ? <span>{createLabel}</span> : null}
            </button>
          ) : null}
        </nav>

        <span className="mt-auto" />

        <SettingsMenu
          displayName={profile?.display_name || "User"}
          avatarUrl={profile?.avatar_url || null}
          socialId={profile?.social_id || null}
          accountEmail={user?.email || null}
          isVerified={isVerifiedProfile(profile)}
          tierLabel={membershipTierLabel(profile?.effective_tier ?? profile?.tier)}
          onLogout={() => void signOut().then(() => navigate("/join"))}
          onEditProfile={() => navigate("/edit-profile", { state: { returnTo } })}
          onManageMembership={() => navigate("/member", { state: { returnTo } })}
          triggerContent={
            <span className="flex h-12 w-full items-center gap-4 rounded-xl px-3 text-[16px] font-semibold text-brandText/75 hover:bg-muted/60 hover:text-brandText">
              <MoreHorizontal className="h-[22px] w-[22px] shrink-0" />
              {expanded ? <span>More</span> : null}
            </span>
          }
          triggerClassName="w-full rounded-xl focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-muted/60"
        />
      </aside>

      <div className="h-full w-full transition-[padding] duration-200 lg:pl-[var(--member-rail-width,256px)]">{children}</div>
    </div>
  );
}

export default DesktopSurfaceRail;
