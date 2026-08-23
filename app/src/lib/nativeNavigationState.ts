import type { NativeSignupStep } from "./nativeSignup";

export type NativeRouteSnapshot<Route extends string = string> = {
  path: string;
  route: Route;
};

export type NativeNavigationOverlayState = {
  settingsOpen: boolean;
  settingsOverlay: "account" | null;
  notificationsOpen: boolean;
  supportOpen: boolean;
};

export type NativeNavigationOverlayIntent =
  | "destination"
  | "settings-drawer"
  | "account"
  | "account-with-settings-drawer"
  | "notifications"
  | "support";

export type NativeInboundDestination = {
  path: string;
  source: "initial-url" | "notification" | "live-url";
};

const nativeInboundPriority: Record<NativeInboundDestination["source"], number> = {
  "initial-url": 0,
  notification: 1,
  "live-url": 2,
};

/** Keeps every inbound destination and gives the cold-start URL stable priority. */
export const enqueueNativeInboundDestination = (
  queue: NativeInboundDestination[],
  destination: NativeInboundDestination,
) => {
  if (queue.some((item) => item.path === destination.path && item.source === destination.source)) return queue;
  const next = [...queue, destination];
  next.sort((left, right) => nativeInboundPriority[left.source] - nativeInboundPriority[right.source]);
  return next;
};

export const consumeNativeInboundDestination = (queue: NativeInboundDestination[]) => ({
  destination: queue[0] ?? null,
  remaining: queue.slice(1),
});

export const removeNativeInboundDestination = (
  queue: NativeInboundDestination[],
  destination: NativeInboundDestination,
) => {
  const index = queue.findIndex((item) => item.path === destination.path && item.source === destination.source);
  return index < 0 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)];
};

export const canonicalizeNativeProfilePetPath = (path: string) => {
  if (path.startsWith("/set-profile")) return `/edit-profile${path.slice("/set-profile".length)}`;
  if (path.startsWith("/set-pet")) return `/edit-pet-profile${path.slice("/set-pet".length)}`;
  return path;
};

/**
 * The root navigator owns these four pieces of navigation chrome. Keeping the
 * transitions as a small pure state machine makes overlay ownership testable
 * without pretending a Node test is a mounted React Native modal test. Account
 * is the one deliberate composite: it can remain visible behind its drawer.
 */
export const nativeNavigationOverlayStateFor = (
  intent: NativeNavigationOverlayIntent,
): NativeNavigationOverlayState => {
  switch (intent) {
    case "settings-drawer":
      return { settingsOpen: true, settingsOverlay: null, notificationsOpen: false, supportOpen: false };
    case "account":
      return { settingsOpen: false, settingsOverlay: "account", notificationsOpen: false, supportOpen: false };
    case "account-with-settings-drawer":
      return { settingsOpen: true, settingsOverlay: "account", notificationsOpen: false, supportOpen: false };
    case "notifications":
      return { settingsOpen: false, settingsOverlay: null, notificationsOpen: true, supportOpen: false };
    case "support":
      return { settingsOpen: false, settingsOverlay: null, notificationsOpen: false, supportOpen: true };
    case "destination":
    default:
      return { settingsOpen: false, settingsOverlay: null, notificationsOpen: false, supportOpen: false };
  }
};

export const recordNativeRouteHistory = <Route extends string>(
  history: NativeRouteSnapshot<Route>[],
  current: NativeRouteSnapshot<Route>,
  next: NativeRouteSnapshot<Route>,
  options?: { preserveHistory?: boolean },
) => {
  if (options?.preserveHistory === false) {
    history.length = 0;
  } else if (current.path !== next.path) {
    history.push(current);
  }
  return { previous: current, current: next };
};

export const restoreNativeRouteHistory = <Route extends string>(
  history: NativeRouteSnapshot<Route>[],
  fallback: NativeRouteSnapshot<Route>,
) => {
  const target = history.pop() ?? fallback;
  const previous = history[history.length - 1] ?? fallback;
  return { target, previous };
};

export const nativeSignupStepForResumeState = (state: string | null | undefined): NativeSignupStep => {
  switch (state) {
    case "step_2_credentials": return "credentials";
    case "step_3_email_verification": return "emailConfirmation";
    case "step_4_identity": return "name";
    case "location_transition": return "location";
    case "notification_transition":
    case "step_5_quick_profile":
    case "complete": return "quickProfile";
    default: return "dob";
  }
};

export const nativeSignupResumePath = (state: string | null | undefined) => {
  if (state === "location_transition") return "/signup?resume=locationTransition";
  if (state === "notification_transition") return "/signup?resume=notificationTransition";
  const step = nativeSignupStepForResumeState(state);
  return `/signup?resume=${encodeURIComponent(step)}`;
};

export const nativeSignupStepFromPath = (path: string): NativeSignupStep | null => {
  if (!path.startsWith("/signup")) return null;
  const value = new URLSearchParams(path.split("?")[1] || "").get("resume");
  return value === "dob" || value === "credentials" || value === "emailConfirmation" || value === "name" || value === "location" || value === "quickProfile"
    ? value
    : null;
};

export const nativePreviousSignupStep = (step: NativeSignupStep, oauth = false): NativeSignupStep | null => {
  if (step === "dob") return null;
  if (step === "credentials") return "dob";
  if (step === "emailConfirmation") return "credentials";
  if (step === "name") return "credentials";
  if (step === "location") return "name";
  if (step === "quickProfile") return "location";
  return oauth ? "dob" : null;
};

export const nativeRouteTransition = <Route extends string>(
  current: NativeRouteSnapshot<Route>,
  path: string,
  normalize: (path: string) => Route,
) => ({
  current: { path, route: normalize(path) },
  previous: current,
});

export const replaceNativeRouteHistory = <Route extends string>(
  history: NativeRouteSnapshot<Route>[],
  current: NativeRouteSnapshot<Route>,
  path: string,
  normalize: (path: string) => Route,
) => {
  const transition = nativeRouteTransition(current, path, normalize);
  recordNativeRouteHistory(history, transition.previous, transition.current, { preserveHistory: false });
  return transition;
};

export const canonicalizeNativeNotificationPath = (path: string) => {
  if (!path.startsWith("/threads")) return path;
  const params = new URLSearchParams(path.split("?")[1] || "");
  const focus = params.get("focus");
  return focus ? `/social?focus=${encodeURIComponent(focus)}` : "/social";
};

export const completeNativeRecoveryDismissal = async (signOut: () => Promise<unknown>) => {
  await signOut();
  return { recoveryPasswordPending: false } as const;
};

export const resolveNativeEffectiveRoute = <Route extends string>(
  requestedRoute: Route,
  resolvedRoute: Route,
  signupVerifyReturnActive: boolean,
) => signupVerifyReturnActive && (requestedRoute === "/signup" || requestedRoute === "/verify-identity")
  ? requestedRoute
  : resolvedRoute;
