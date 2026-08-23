// Single source of truth for every in-app toast and the walk-return banner.
// Screens still call setNotice("Couldn't send your message.") with the legacy
// string; resolveToastCopy maps that to a headline + supporting line + tone so
// no screen has to change. New call sites should pass a NativeToastContent
// object directly.
//
// Contract: app/docs/Contracts/notification_copy_contract.md

export type NativeToastTone = "done" | "system" | "limit" | "failed";

export type NativeToastContent = {
  tone: NativeToastTone;
  headline: string;
  copy?: string;
};

// Voice rules, enforced by nativeToastCopy.test.ts:
//   - headline says what happened, copy says what to do next
//   - "huddle" is always lower case (NativeToast renders it bold)
//   - no apologies, no "Unable to ... right now", no selling the product
const TOAST_COPY: Record<string, NativeToastContent> = {
  // ---------------------------------------------------------------- done
  "Friend added.": { tone: "done", headline: "You've got a new friend!", copy: "Say hi whenever you like." },
  "You're already connected.": { tone: "done", headline: "You two are already friends", copy: "You matched a while back." },
  "New code created.": { tone: "done", headline: "New code ready", copy: "Share it — it works for 7 days." },
  "Thread posted.": { tone: "done", headline: "Posted", copy: "Your thread is live." },
  "Post updated.": { tone: "done", headline: "Post updated", copy: "Everyone sees the new version." },
  "Post deleted.": { tone: "done", headline: "Post deleted", copy: "It's gone now." },
  "Reply posted.": { tone: "done", headline: "Reply posted", copy: "Added to the thread." },
  "Reply updated.": { tone: "done", headline: "Reply updated", copy: "Your edit is live." },
  "Star sent": { tone: "done", headline: "Chat started", copy: "It's in your Chats — say hi." },
  "Wave sent": { tone: "done", headline: "You waved", copy: "If they wave back, you're matched." },
  "Notifications on.": { tone: "done", headline: "Notifications on", copy: "You'll hear about new messages." },
  "Group muted.": { tone: "done", headline: "Group muted", copy: "Messages still arrive, quietly." },

  // -------------------------------------------------------------- system
  "Confirming payment...": { tone: "system", headline: "Confirming payment", copy: "A few seconds — stay on this screen." },
  "Opened Team huddle chat. The linked message is not available yet.": {
    tone: "system",
    headline: "Opened Team huddle",
    copy: "That linked message isn't available yet.",
  },
  "Share canceled.": { tone: "system", headline: "Share canceled", copy: "Nothing left your phone." },
  "Post is already deleted.": { tone: "system", headline: "Already deleted", copy: "This post is gone." },
  "Delete timed out. Pull to refresh to verify result.": {
    tone: "system",
    headline: "Still deleting",
    copy: "Pull to refresh to check it went through.",
  },
  "Reply posted, but mention syncing failed.": {
    tone: "system",
    headline: "Reply posted",
    copy: "Mentions didn't sync, so they won't be notified.",
  },
  "You no longer have access to this conversation.": {
    tone: "system",
    headline: "Chat closed",
    copy: "You no longer have access to it.",
  },

  // --------------------------------------------------------------- limit
  "Video upload is for huddle＊ members only.": {
    tone: "limit",
    headline: "Video is a huddle＊ feature",
    copy: "huddle＊ members can post video in chat.",
  },
  "Video upload is available for huddle＊ members only.": {
    tone: "limit",
    headline: "Video is a huddle＊ feature",
    copy: "huddle＊ members can post video to Social.",
  },
  "Only one video can be added to a post.": {
    tone: "limit",
    headline: "One video per post",
    copy: "Remove the first to add another.",
  },
  "You can pin up to 3 posts.": { tone: "limit", headline: "You've pinned three already", copy: "Unpin one to pin this instead." },
  "Post is too long.": { tone: "limit", headline: "Post is too long", copy: "Trim it down a little." },
  "Reply is too long.": { tone: "limit", headline: "Reply is too long", copy: "Trim it down a little." },
  "Wait for images to finish uploading before sending.": {
    tone: "limit",
    headline: "Images are still uploading",
    copy: "Send once they finish.",
  },
  "Oops! Don't leave this blank.": { tone: "limit", headline: "Add a title and a body", copy: "Posts need both." },
  "Don't skip this one!": { tone: "limit", headline: "This one's required", copy: "Fill it in to continue." },
  "Sign in required.": { tone: "limit", headline: "Sign in to continue", copy: "This needs an account." },
  "You cannot support this user.": { tone: "limit", headline: "Can't support this post", copy: "One of you has blocked the other." },
  "You cannot reply to this user.": { tone: "limit", headline: "Can't reply here", copy: "One of you has blocked the other." },
  "You can't send a Star to this user right now.": {
    tone: "limit",
    headline: "Can't start a chat with them",
    copy: "They're not taking new chats right now.",
  },
  "Cannot send a Wave to this user": {
    tone: "limit",
    headline: "Can't wave at them",
    copy: "They're not taking waves right now.",
  },

  // -------------------------------------------------------------- failed
  "Couldn't send your message.": { tone: "failed", headline: "Message didn't send", copy: "Check your connection and try again." },
  "Couldn't upload that media. Remove it or try again.": { tone: "failed", headline: "Couldn't upload that", copy: "Remove the file or try again." },
  "Couldn't upload that image. Remove it or try again.": { tone: "failed", headline: "Image didn't upload", copy: "Remove it or try again." },
  "Couldn't open your photo library. Try again.": { tone: "failed", headline: "Can't open your photos", copy: "Check photo access in Settings." },
  "Discover could not load. Pull to retry.": { tone: "failed", headline: "Discover didn't load", copy: "Pull to refresh and try again." },
  "Community could not load. Pull to refresh.": { tone: "failed", headline: "Community didn't load", copy: "Pull to refresh and try again." },
  "Failed to load conversations. Pull to refresh.": { tone: "failed", headline: "Chats didn't load", copy: "Pull to refresh and try again." },
  "Notifications are visible, but read status could not sync.": { tone: "failed", headline: "Read status didn't update", copy: "Your notifications are still here." },
  "We couldn't load notifications. Pull back in a moment.": { tone: "failed", headline: "Notifications didn't load", copy: "Close this panel and try again." },
  "Unable to load older messages.": { tone: "failed", headline: "Older messages didn't load", copy: "Scroll up again to retry." },
  "Unable to edit message right now.": { tone: "failed", headline: "Edit didn't save", copy: "Try again in a moment." },
  "Unable to delete message right now.": { tone: "failed", headline: "Couldn't delete that message", copy: "Try again in a moment." },
  "Couldn't save group name.": { tone: "failed", headline: "Group name didn't save", copy: "Try again in a moment." },
  "Couldn't save group description.": { tone: "failed", headline: "Description didn't save", copy: "Try again in a moment." },
  "Couldn't save group details.": { tone: "failed", headline: "Group details didn't save", copy: "Try again in a moment." },
  "Couldn't update cover. Try again.": { tone: "failed", headline: "Cover didn't update", copy: "Pick the photo again." },
  "Couldn't add member.": { tone: "failed", headline: "Couldn't add them", copy: "They may have left. Try again." },
  "Couldn't remove member.": { tone: "failed", headline: "Couldn't remove them", copy: "Try again in a moment." },
  "Couldn't send invite.": { tone: "failed", headline: "Invite didn't send", copy: "Try again in a moment." },
  "Couldn't cancel invite.": { tone: "failed", headline: "Couldn't cancel that invite", copy: "Try again in a moment." },
  "Couldn't update join request.": { tone: "failed", headline: "Couldn't update that join request", copy: "Try again in a moment." },
  "Couldn't load group members.": { tone: "failed", headline: "Members didn't load", copy: "Pull to refresh." },
  "Unable to remove group right now.": { tone: "failed", headline: "Couldn't remove that group", copy: "Try again in a moment." },
  "Unable to leave group right now.": { tone: "failed", headline: "Couldn't leave the group", copy: "Try again in a moment." },
  "Unable to update block status right now.": { tone: "failed", headline: "Couldn't update that block", copy: "Try again in a moment." },
  "Unable to block this member right now.": { tone: "failed", headline: "Couldn't block them", copy: "Try again in a moment." },
  "Unable to block user right now.": { tone: "failed", headline: "Couldn't block them", copy: "Try again in a moment." },
  "Unable to block user right now": { tone: "failed", headline: "Couldn't block them", copy: "Try again in a moment." },
  "Unable to unmatch right now.": { tone: "failed", headline: "Couldn't unmatch", copy: "Try again in a moment." },
  "Unable to update notifications right now.": { tone: "failed", headline: "Couldn't change notifications", copy: "Try again in a moment." },
  "Unable to load pet profile.": { tone: "failed", headline: "Pet profile didn't load", copy: "Pull to refresh." },
  "Unable to update support.": { tone: "failed", headline: "Couldn't add your support", copy: "Tap the paw again." },
  "Unable to update saved post.": { tone: "failed", headline: "Couldn't save that post", copy: "Tap save again." },
  "Unable to delete post.": { tone: "failed", headline: "Couldn't delete that post", copy: "Try again in a moment." },
  "Unable to send Star right now. Try again in a moment.": { tone: "failed", headline: "Couldn't start that chat", copy: "Try again in a moment." },
  "Unable to send Wave right now": { tone: "failed", headline: "Couldn't wave at them", copy: "Try again in a moment." },
  "Please sign in again to send a Wave.": { tone: "failed", headline: "Sign in again to wave", copy: "You've been signed out." },
  "Please sign in again to block this user.": { tone: "failed", headline: "Sign in again", copy: "You've been signed out." },
  "Could not update RSVP.": { tone: "failed", headline: "RSVP didn't save", copy: "Tap your answer again." },
  "Could not remove event.": { tone: "failed", headline: "Couldn't remove that event", copy: "Try again in a moment." },
  "Could not cancel event.": { tone: "failed", headline: "Couldn't cancel that event", copy: "Try again in a moment." },
  "Could not cancel series.": { tone: "failed", headline: "Couldn't cancel the series", copy: "Try again in a moment." },
};

// Legacy strings that interpolate a name, matched by shape rather than value.
const TOAST_PATTERNS: { test: RegExp; build: (match: RegExpMatchArray) => NativeToastContent }[] = [
  {
    test: /^(.+) is no longer in this group\.$/,
    build: (match) => ({ tone: "system", headline: `${match[1]} left`, copy: "They're no longer in this group." }),
  },
];

// These actions already change the visible surface in place. Repeating them in
// a toast adds noise without helping the person understand or recover.
const SILENT_TOAST_MESSAGES = new Set([
  "Post updated.",
  "Reply updated.",
  "Notifications on.",
  "Group muted.",
]);

// Anything not in the map still has to render sensibly — an unmapped string
// becomes the headline, and the tone is inferred from how it reads.
const inferTone = (message: string): NativeToastTone => {
  const value = message.toLowerCase();
  if (/^(unable|couldn't|could not|can't|cannot|failed)/.test(value)) return "failed";
  if (/(only|limit|too long|required|sign in|wait for|blank)/.test(value)) return "limit";
  if (/(added|sent|posted|updated|deleted|saved|created|match|on\.)/.test(value)) return "done";
  return "system";
};

export function resolveToastCopy(message: string): NativeToastContent {
  const trimmed = String(message || "").trim();
  if (!trimmed) return { tone: "system", headline: "" };
  if (SILENT_TOAST_MESSAGES.has(trimmed)) return { tone: "system", headline: "" };

  const mapped = TOAST_COPY[trimmed];
  if (mapped) return mapped;

  for (const pattern of TOAST_PATTERNS) {
    const match = trimmed.match(pattern.test);
    if (match) return pattern.build(match);
  }

  return { tone: inferTone(trimmed), headline: trimmed };
}

// ------------------------------------------------------------------ walk return

export type NativeReturnBucket = "short" | "normal" | "long";

export type NativeReturnBannerContent = {
  bucket: NativeReturnBucket;
  eyebrow: string;
  headline: string;
  copy: string;
};

const SHORT_WALK_SECONDS = 20 * 60;
const LONG_WALK_SECONDS = 2 * 60 * 60;

export function formatWalkDuration(elapsedSeconds: number): string {
  const total = Math.max(0, Math.round(Number(elapsedSeconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 1) return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  if (minutes >= 1) return `${minutes} min`;
  return "under a minute";
}

// Friend voice, and strictly about the walk — the map pin and presence state
// are plumbing the person never asked about.
export function resolveReturnBanner(elapsedSeconds: number): NativeReturnBannerContent {
  const total = Math.max(0, Math.round(Number(elapsedSeconds) || 0));
  const duration = formatWalkDuration(total);

  if (total < SHORT_WALK_SECONDS) {
    return {
      bucket: "short",
      eyebrow: `${duration} out`,
      headline: "Back already?",
      copy: "That was a quick one.",
    };
  }

  if (total >= LONG_WALK_SECONDS) {
    return {
      bucket: "long",
      eyebrow: `${duration} out`,
      headline: "Big adventure",
      copy: "Someone's ready for a nap.",
    };
  }

  return {
    bucket: "normal",
    eyebrow: `${duration} out`,
    headline: "Nice one",
    copy: "Hope that was a good walk.",
  };
}
