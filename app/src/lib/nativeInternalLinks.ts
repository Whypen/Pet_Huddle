import { parseCanonicalShareId, type ShareModel } from "./shareModel";

const clean = (value: unknown) => String(value || "").trim();

const NATIVE_OWNED_PATHS = [
  "/", "/signup", "/verify", "/verify-identity", "/edit-profile", "/set-profile", "/pet-details", "/edit-pet-profile", "/set-pet",
  "/social", "/chats", "/service", "/map", "/premium", "/manage-subscription",
  "/add-friend",
  "/carerprofile", "/carer-profile", "/profile", "/settings", "/support", "/legal",
  "/privacy", "/privacy-choices", "/collection-notice", "/terms", "/community-guidelines",
  "/cookies", "/service-agreement", "/service-provider-agreement", "/booking-terms",
  "/chat-dialogue", "/service-chat", "/threads", "/share", "/join",
] as const;

export const isNativeOwnedHuddlePath = (path: string) => {
  const pathname = new URL(path.startsWith("/") ? `https://huddle.pet${path}` : path).pathname || "/";
  return NATIVE_OWNED_PATHS.some((owned) => pathname === owned || (owned !== "/" && pathname.startsWith(`${owned}/`)));
};

export const nativePathForSharedContent = (
  share: Pick<ShareModel, "contentId" | "contentType"> & Partial<Pick<ShareModel, "appUrl">>,
  /**
   * Single-use access token from a verified-only alert link.
   *
   * Verified-only alerts are shared as `/share/alert_{id}?access={token}` so the
   * link carries a real preview instead of unfurling as a bare SPA URL. The
   * token has to survive that hop or the recipient lands on an alert they are
   * not allowed to open.
   */
  accessToken?: string | null,
): string | null => {
  const contentId = clean(share.contentId);
  if (!contentId) return null;
  const access = clean(accessToken);
  if (share.contentType === "alert" && share.appUrl && !access) {
    const path: string | null = nativePathForHuddleWebPath(share.appUrl);
    if (path?.startsWith("/map?")) return path;
  }
  if (share.contentType !== "alert") return `/social?focus=${encodeURIComponent(contentId)}`;
  const alertPath = `/map?alert=${encodeURIComponent(contentId)}`;
  return access ? `${alertPath}&access=${encodeURIComponent(access)}` : alertPath;
};

/** Converts public Huddle web paths into routes owned by the installed app. */
export const nativePathForHuddleWebPath = (pathWithSearch: string): string | null => {
  const raw = clean(pathWithSearch);
  if (!raw) return null;
  const parsed = new URL(raw.startsWith("/") ? `https://huddle.pet${raw}` : raw);
  if (parsed.hostname !== "huddle.pet" && parsed.hostname !== "www.huddle.pet") return null;
  const path = parsed.pathname || "/";

  if (path.startsWith("/share/")) {
    let shareId = path.slice("/share/".length).split("/")[0] || "";
    try { shareId = decodeURIComponent(shareId); } catch { return "/social"; }
    const share = parseCanonicalShareId(shareId);
    // `?access=` rides along with the share link; dropping it here would strand
    // the recipient of a verified-only alert on a page they cannot open.
    return share ? nativePathForSharedContent(share, parsed.searchParams.get("access")) : "/social";
  }
  if (path === "/share") return "/social";
  if (path.startsWith("/join/")) {
    let code = path.slice("/join/".length).split("/")[0] || "";
    try { code = decodeURIComponent(code).trim().toUpperCase(); } catch { return "/chats?tab=groups"; }
    return /^[A-Z0-9]{6}$/.test(code)
      ? `/chats?tab=groups&joinCode=${encodeURIComponent(code)}`
      : "/chats?tab=groups";
  }
  if (path.startsWith("/threads")) {
    const focus = parsed.searchParams.get("focus");
    return focus ? `/social?focus=${encodeURIComponent(focus)}` : "/social";
  }
  if (!isNativeOwnedHuddlePath(`${path}${parsed.search || ""}`)) return null;
  return `${path}${parsed.search || ""}`;
};

export const nativeHardwareBackTarget = (route: string, routePath: string): string | null => {
  if (route === "/") return null;
  if (route === "/social" || route === "/chats" || route === "/service" || route === "/map") return "/";
  if (route === "/chat-dialogue") {
    const params = new URLSearchParams(String(routePath).split("?")[1] || "");
    const requestedReturnTo = clean(params.get("returnTo"));
    const safeReturnTo = requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") && isNativeOwnedHuddlePath(requestedReturnTo)
      ? requestedReturnTo
      : null;
    return safeReturnTo || (params.get("with") ? "/chats?tab=friends" : "/chats?tab=groups");
  }
  if (route === "/service-chat") return "/chats?tab=service";
  return "history";
};

export const navigateNativeHuddleLink = (
  url: string,
  onNavigate: (path: string) => void,
) => {
  const nativePath = nativePathForHuddleWebPath(url);
  if (!nativePath) return false;
  onNavigate(nativePath);
  return true;
};
