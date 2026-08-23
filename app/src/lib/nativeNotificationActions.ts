import * as Notifications from "expo-notifications";

export const NATIVE_NOTIFICATION_ACTIONS = {
  reply: "huddle_action_reply",
  joinGroup: "huddle_action_join_group",
  rsvp: "huddle_action_rsvp",
  startCare: "huddle_action_start_care",
} as const;

export const NATIVE_NOTIFICATION_CATEGORIES = {
  reply: "huddle_reply",
  joinGroup: "huddle_join_group",
  rsvp: "huddle_event_rsvp",
  startCare: "huddle_start_care",
} as const;

// Expo does not deliver killed-state iOS action presses to a JavaScript background
// task. Keep actions foregrounded so auth, server authority, recovery UI, and the
// action's destination are always available before reporting success.
const protectedForegroundAction = {
  opensAppToForeground: true,
  isAuthenticationRequired: true,
} as const;

export const registerNativeNotificationActions = async () => {
  // Expo reconciles each category against Apple's complete category set. Run
  // these serially: concurrent read-modify-write calls can overwrite siblings.
  await Notifications.setNotificationCategoryAsync(NATIVE_NOTIFICATION_CATEGORIES.reply, [{
      identifier: NATIVE_NOTIFICATION_ACTIONS.reply,
      buttonTitle: "Reply",
      options: protectedForegroundAction,
      textInput: { submitButtonTitle: "Send", placeholder: "Reply…" },
    }]);
  await Notifications.setNotificationCategoryAsync(NATIVE_NOTIFICATION_CATEGORIES.joinGroup, [{
      identifier: NATIVE_NOTIFICATION_ACTIONS.joinGroup,
      buttonTitle: "Join now",
      options: protectedForegroundAction,
    }]);
  await Notifications.setNotificationCategoryAsync(NATIVE_NOTIFICATION_CATEGORIES.rsvp, [{
      identifier: NATIVE_NOTIFICATION_ACTIONS.rsvp,
      buttonTitle: "I'm going",
      options: protectedForegroundAction,
    }]);
  await Notifications.setNotificationCategoryAsync(NATIVE_NOTIFICATION_CATEGORIES.startCare, [{
      identifier: NATIVE_NOTIFICATION_ACTIONS.startCare,
      buttonTitle: "Start Care",
      options: protectedForegroundAction,
    }]);
};

export type NativeNotificationAction = "reply" | "join_group" | "rsvp" | "start_care" | "open" | "unknown";

export const nativeNotificationAction = (response: Notifications.NotificationResponse | null): NativeNotificationAction => {
  const identifier = response?.actionIdentifier;
  if (!identifier || identifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return "open";
  if (identifier === NATIVE_NOTIFICATION_ACTIONS.reply) return "reply";
  if (identifier === NATIVE_NOTIFICATION_ACTIONS.joinGroup) return "join_group";
  if (identifier === NATIVE_NOTIFICATION_ACTIONS.rsvp) return "rsvp";
  if (identifier === NATIVE_NOTIFICATION_ACTIONS.startCare) return "start_care";
  return "unknown";
};

export const nativeNotificationActionErrorCopy = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || "");
  const message = raw.toLowerCase();
  if (message.includes("not_authenticated") || message.includes("jwt")) {
    return "Your session expired. Sign in again, then try the action once more.";
  }
  if (message.includes("event_unavailable")) {
    return "This event has ended or is no longer available.";
  }
  if (message.includes("group_member_required")) {
    return "Join the group before responding to this event.";
  }
  if (message.includes("group_invite_unavailable")) {
    return "This group invitation is no longer available.";
  }
  if (message.includes("reply_required")) {
    return "Type a reply before sending it.";
  }
  if (message.includes("reply_too_long")) {
    return "Keep your reply under 2,000 characters, then try again.";
  }
  if (message.includes("care_action_unavailable") || message.includes("service_chat_not_found")) {
    return "This care action is no longer available. Open the care conversation for the latest status.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "We could not reach huddle. Check your connection and try again.";
  }
  return "We could not complete that action. You can try again or open the notification.";
};

export const notificationResponseId = (response: Notifications.NotificationResponse | null) => {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  const value = data?.notificationId ?? data?.notification_id;
  return typeof value === "string" ? value.trim() : "";
};

export const notificationActionResponseKey = (response: Notifications.NotificationResponse | null) => {
  if (!response) return "";
  return [
    response.notification.request.identifier,
    response.actionIdentifier,
    response.userText || "",
  ].join(":");
};
