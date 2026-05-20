import type { Session } from "@supabase/supabase-js";

export type NativeBootRoute =
  | "/"
  | "/signup"
  | "/verify-identity"
  | "/set-profile"
  | "/set-pet"
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
  onboardingCompleted: boolean;
  ownsPets: boolean;
  activePetCount: number;
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
    onboardingCompleted: data.onboarding_completed === true,
    ownsPets: data.owns_pets === true,
    activePetCount: typeof data.active_pet_count === "number" ? data.active_pet_count : 0,
  };
};

export const resolveNativeBootRoute = (
  nextSession: Session | null,
  requestedRoute: NativeBootRoute,
  snapshot: NativeOnboardingSnapshot | null,
): NativeResolvedBootRoute => {
  if (!getNativeSessionIdentity(nextSession)) return { route: "auth", needsOnboardingSnapshot: false };
  if (!snapshot) return { route: requestedRoute, needsOnboardingSnapshot: true };
  if (!snapshot.profileExists) {
    return {
      route: requestedRoute === "/set-profile" ? "/set-profile" : "/verify-identity",
      needsOnboardingSnapshot: false,
    };
  }
  return { route: requestedRoute, needsOnboardingSnapshot: false };
};

export const resolveBootRoute = resolveNativeBootRoute;
