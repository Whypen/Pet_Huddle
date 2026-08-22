/**
 * The single source of truth for web navigation.
 *
 * The desktop rail and the mobile bottom bar are two presentations of THIS list,
 * never two lists. They drifted in the past (the bottom bar still carried a Care
 * tab long after Care was pulled from web), and the only durable fix is to give
 * them one definition to share.
 *
 * Order is deliberate and matches the approved IA:
 *   Social · Map · Groups · Chats
 *
 * Care and Discover are absent by design, not by omission — see NOT_ON_WEB.
 */

import type { HuddleNavIconName } from "@/components/icons/huddleIconPaths";

/** What a destination does when a signed-out visitor reaches for it. */
export type NavGate =
  /** Renders for everyone. */
  | "open"
  /** Signed out gets the auth wall instead of the surface. */
  | "requires-auth";

export type NavDestinationId = "social" | "map" | "groups" | "chats";

export type NavDestination = {
  id: NavDestinationId;
  /** Route path for the destination. */
  path: string;
  /** Visible destination label. */
  label: string;
  /** Visible mobile label, where horizontal space is tight. */
  shortLabel: string;
  /** Mirrored native icon, or null when the icon has no native counterpart. */
  icon: HuddleNavIconName | "groups";
  gate: NavGate;
};

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { id: "social", path: "/social", label: "Social", shortLabel: "Social", icon: "social", gate: "open" },
  { id: "map", path: "/map", label: "Map", shortLabel: "Map", icon: "map", gate: "open" },
  { id: "groups", path: "/groups", label: "Groups", shortLabel: "Groups", icon: "groups", gate: "open" },
  { id: "chats", path: "/chats", label: "Chats", shortLabel: "Chats", icon: "chats", gate: "requires-auth" },
] as const;

/**
 * Surfaces the app has that web deliberately does not, and why. Kept next to the
 * nav so that "why is there no Care tab?" is answered where someone would look,
 * rather than being rediscovered as a bug.
 */
export const NOT_ON_WEB: Record<string, string> = {
  service: "Care is removed from web in every form; /service-chat stays routable but unreachable from nav.",
  discover: "Discover surfaces people rather than content — same category as live location.",
  home: "Home is not a web navigation destination. The approved web surfaces are Social, Map, Groups, and Chats.",
};

export const isNavDestinationActive = (destination: NavDestination, pathname: string, search = ""): boolean => {
  // `/social` also owns the legacy `/threads` alias.
  if (destination.id === "social") {
    return pathname.startsWith("/social") || pathname.startsWith("/threads");
  }
  if (destination.id === "groups") return pathname.startsWith("/groups");
  if (destination.id === "chats") return pathname.startsWith("/chats") || pathname.startsWith("/chat-dialogue");
  return pathname.startsWith(destination.path);
};
