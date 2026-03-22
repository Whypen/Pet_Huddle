import type { Profile } from "@/contexts/AuthContext";

export const SIGNUP_PUBLIC_PATHS = [
  "/auth",
  "/signup/dob",
  "/signup/credentials",
  "/signup/name",
  "/signup/verify",
] as const;

export function isProfileGateComplete(profile: Profile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.gender_genre?.trim() &&
      profile.location_name?.trim() &&
      profile.legal_name?.trim() &&
      profile.social_id?.trim()
  );
}

export function isRegisteredUserProfile(
  profile: Pick<Profile, "onboarding_completed"> | null | undefined,
): boolean {
  return Boolean(profile?.onboarding_completed === true);
}

export function getSignupResumePath(profile: Profile | null): string {
  if (!profile) return "/auth";

  const prefs = (profile.prefs ?? {}) as Record<string, unknown>;
  const verifyDecisionComplete = prefs.signup_verify_decided === true;
  if (!verifyDecisionComplete) return "/verify-identity";

  if (!isRegisteredUserProfile(profile)) return "/set-profile";

  return "/";
}
