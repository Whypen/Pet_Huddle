/**
 * Wall copy, keyed to the action that triggered it.
 *
 * A generic "Sign in to continue" is the failure mode here: it makes the wall
 * feel like a tollbooth. Naming the action the person was already taking makes
 * it read as a step in what they were doing, which is the whole reason intent is
 * carried through auth in the first place (see lib/authIntent.ts).
 */

import type { AuthIntentType } from "@/lib/authIntent";

export type AuthWallCopy = {
  /** Small uppercase line above the headline — names the action in progress. */
  eyebrow: string;
  title: string;
  /** One line of why, never a sales pitch. */
  subtitle: string;
};

const COPY: Record<AuthIntentType, AuthWallCopy> = {
  "profile": {
    eyebrow: "Viewing a profile",
    title: "Sign in to view this profile",
    subtitle: "Profiles and pets stay within the huddle community.",
  },
  "post": {
    eyebrow: "Posting to Social",
    title: "Sign in to post",
    subtitle: "Reading is open to everyone. Posting needs an account.",
  },
  "reply": {
    eyebrow: "Replying",
    title: "Sign in to reply",
    subtitle: "Replies often carry addresses, so they stay behind sign-in.",
  },
  "like": {
    eyebrow: "Reacting to a post",
    title: "Sign in to react",
    subtitle: "Your reactions are tied to your account.",
  },
  "join-group": {
    eyebrow: "Joining a group",
    title: "Sign in to join",
    subtitle: "You'll be in the moment you're done.",
  },
  "broadcast": {
    eyebrow: "Broadcasting an alert",
    title: "Sign in to broadcast",
    subtitle: "Alerts reach real neighbours nearby, so they need a verified account.",
  },
  "see-alert": {
    eyebrow: "Opening an alert",
    title: "Sign in to see this alert",
    subtitle: "Alert details include locations shared by the person who posted them.",
  },
  "message": {
    eyebrow: "Sending a message",
    title: "Sign in to message",
    subtitle: "Messages are private between accounts.",
  },
  "create-group": {
    eyebrow: "Creating a group",
    title: "Sign in to create a group",
    subtitle: "You'll be the first member and its admin.",
  },
  "manage-group": {
    eyebrow: "Managing a group",
    title: "Sign in to manage this group",
    subtitle: "Group changes are tied to an administrator account.",
  },
  "edit-profile": {
    eyebrow: "Editing your profile",
    title: "Sign in to edit your profile",
    subtitle: "Profile changes and photos stay tied to your account.",
  },
  "notifications": {
    eyebrow: "Notifications",
    title: "Sign in to see notifications",
    subtitle: "Notifications are personal to your account.",
  },
  "settings": {
    eyebrow: "Settings",
    title: "Sign in to open settings",
    subtitle: "Settings are personal to your account.",
  },
  "map-location": {
    eyebrow: "Your location",
    title: "Sign in to use your location",
    subtitle: "Your shared map pin uses an approximate area.",
  },
  "search": {
    eyebrow: "Search",
    title: "Sign in to search",
    subtitle: "Search is available to huddle members.",
  },
  "view-media": {
    eyebrow: "Opening a post",
    title: "Sign in to open this post",
    subtitle: "The public feed stays readable before you sign in.",
  },
  "save-post": {
    eyebrow: "Saving a post",
    title: "Sign in to save",
    subtitle: "Saved posts stay with your account.",
  },
  "pin-post": {
    eyebrow: "Pinning a post",
    title: "Sign in to pin",
    subtitle: "Pinned posts stay with your account.",
  },
  "post-options": {
    eyebrow: "Post options",
    title: "Sign in to open post options",
    subtitle: "Post controls are available to huddle members.",
  },
};

/** Falls back to the least presumptuous framing rather than throwing. */
export const resolveAuthWallCopy = (intent?: AuthIntentType | null): AuthWallCopy =>
  (intent && COPY[intent]) || {
    eyebrow: "huddle",
    title: "Sign in to continue",
    subtitle: "Reading is open to everyone. Taking part needs an account.",
  };

export const AUTH_WALL_COPY = COPY;
