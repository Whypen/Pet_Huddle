/**
 * Which surface actually answers an intent better.
 *
 * The web is not a lesser huddle. It renders every alert, every post, every
 * group. What it structurally cannot do is reach you when you are not looking:
 * push notifications, background location, Live Activity. That is a capability
 * boundary, not a paywall, and it is the only honest reason to put the app in
 * front of someone.
 *
 * So the app is offered where it is genuinely the better answer and stays
 * silent everywhere else. A prompt on "like a post" would be a nag; a prompt on
 * "send a broadcast" is the truth — a broadcast goes out from where you
 * physically are, and a browser tab cannot do that.
 *
 * Every member of `AuthIntentType` is classified here. A new intent added to
 * `authIntent.ts` without a classification here is a type error, which is the
 * point: the decision has to be made deliberately, not defaulted.
 */

import type { AuthIntentType } from "@/lib/authIntent";

export type IntentSurface = "app-better" | "web-sufficient";

export const AUTH_INTENT_SURFACE: Record<AuthIntentType, IntentSurface> = {
  // The app reaches you. The web waits for you to come back.
  broadcast: "app-better",
  "map-location": "app-better",
  notifications: "app-better",
  message: "app-better",

  // The web does these completely. Saying otherwise would be a lie told to
  // sell an install.
  post: "web-sufficient",
  reply: "web-sufficient",
  like: "web-sufficient",
  "join-group": "web-sufficient",
  "see-alert": "web-sufficient",
  "save-post": "web-sufficient",
  search: "web-sufficient",
  "view-media": "web-sufficient",
  "create-group": "web-sufficient",
  "manage-group": "web-sufficient",
  "edit-profile": "web-sufficient",
  profile: "web-sufficient",
  settings: "web-sufficient",
  "pin-post": "web-sufficient",
  "post-options": "web-sufficient",
};

export const isAppBetterIntent = (intent: AuthIntentType): boolean =>
  AUTH_INTENT_SURFACE[intent] === "app-better";

/**
 * The line shown beside "Create account" when the app is the better answer.
 * Each one names the specific capability the browser lacks — never a generic
 * "get more in the app", which is the sentence that makes people distrust the
 * rest of the page.
 */
export const APP_BETTER_REASON: Partial<Record<AuthIntentType, string>> = {
  broadcast: "Broadcasts go out from where you are. Send one from the app.",
  "map-location": "The app updates your area in the background, so the map stays true.",
  notifications: "The app tells you the moment it happens.",
  message: "The app tells you when someone replies.",
};
