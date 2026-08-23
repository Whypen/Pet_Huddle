import type { Session } from "@supabase/supabase-js";

export type NativeBootRoute =
  | "/"
  | "/signup"
  | "/verify-identity"
  | "/social"
  | "/chats"
  | "/service"
  | "/map"
  | "/profile"
  | "/security-settings"
  | "/premium"
  | "/carerprofile"
  | "/edit-profile"
  | "/pet-details"
  | "/edit-pet-profile"
  | "/support"
  | "/legal"
  | "/chat-dialogue"
  | "/service-chat";

export type NativeOnboardingSnapshot = {
  profileExists: boolean;
  registeredIdentity: boolean;
  onboardingCompleted: boolean;
  ownsPets: boolean;
  activePetCount: number;
  signupResumeState?: string | null;
  signupNotificationPromptHandled?: boolean;
  signupWelcomePending?: boolean;
  careInterestPending?: boolean;
};

export type NativeSessionIdentity = {
  accessToken: string;
  userId: string;
};

export type NativeResolvedBootRoute = {
  route: NativeBootRoute | "auth";
  needsOnboardingSnapshot: boolean;
};

export const getNativeSessionIdentity = (nextSession: Session | null | undefined): NativeSessionIdentity | null => {
  const accessToken = String(nextSession?.access_token || "");
  const userId = String(nextSession?.user?.id || "");
  return accessToken && userId ? { accessToken, userId } : null;
};

export const isSameNativeSessionIdentity = (left: NativeSessionIdentity | null, right: NativeSessionIdentity | null) =>
  Boolean(left && right && left.accessToken === right.accessToken && left.userId === right.userId);

export const isSameNativeSessionUser = (left: NativeSessionIdentity | null, right: NativeSessionIdentity | null) =>
  Boolean(left && right && left.userId === right.userId);

export const parseNativeOnboardingSnapshot = (value: unknown): NativeOnboardingSnapshot | null => {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!data || typeof data.profile_exists !== "boolean") return null;

  return {
    profileExists: data.profile_exists,
    registeredIdentity: data.registered_identity === true,
    onboardingCompleted: data.onboarding_completed === true,
    ownsPets: data.owns_pets === true,
    activePetCount: typeof data.active_pet_count === "number" ? data.active_pet_count : 0,
    signupResumeState: typeof data.signup_resume_state === "string" ? data.signup_resume_state : null,
    signupNotificationPromptHandled: data.signup_notification_prompt_handled === true,
    signupWelcomePending: data.signup_welcome_pending === true,
    careInterestPending: false,
  };
};

export const resolveNativeBootRoute = (
  nextSession: Session | null,
  requestedRoute: NativeBootRoute,
  snapshot: NativeOnboardingSnapshot | null,
): NativeResolvedBootRoute => {
  if (!getNativeSessionIdentity(nextSession)) return { route: "auth", needsOnboardingSnapshot: false };
  if (!snapshot) return { route: requestedRoute, needsOnboardingSnapshot: true };
  if (!snapshot.registeredIdentity) {
    return { route: "/signup", needsOnboardingSnapshot: false };
  }
  if (!snapshot.onboardingCompleted) {
    return {
      route: "/signup",
      needsOnboardingSnapshot: false,
    };
  }
  if (requestedRoute === "/signup") {
    return { route: "/", needsOnboardingSnapshot: false };
  }
  return { route: requestedRoute, needsOnboardingSnapshot: false };
};

export const resolveBootRoute = resolveNativeBootRoute;
