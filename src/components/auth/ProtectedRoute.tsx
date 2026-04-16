import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { Loader2 } from "lucide-react";
import { isRegisteredUserProfile } from "@/lib/signupFlow";
import { AccountWall } from "@/components/moderation/AccountWall";
import { RestrictedBanner } from "@/components/moderation/RestrictedBanner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, session, loading, hydrating, profile, mfaPending } = useAuth();
  const { flowState } = useSignup();
  const location = useLocation();
  const allowOnboardingRoutes = ["/verify-identity", "/set-profile", "/set-pet"].includes(location.pathname);
  const allowOnboardingWithoutAuth =
    ["/verify-identity", "/set-profile"].includes(location.pathname) &&
    flowState !== "idle";
  const onboardingComplete = isRegisteredUserProfile(profile);

  if (loading || (hydrating && (!user || !profile))) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Session/user resolution is still in-flight: never redirect on transient null.
    if (session) {
      return (
        <div className="min-h-svh flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    if (allowOnboardingWithoutAuth) {
      return <>{children}</>;
    }
    return <Navigate to="/auth" state={{ from: location, mfaRequired: mfaPending }} replace />;
  }

  if (!profile) {
    if (allowOnboardingRoutes) {
      return <>{children}</>;
    }
    // Auth exists but app profile is missing: route into profile recovery/onboarding.
    return <Navigate to="/set-profile" replace />;
  }

  if (!onboardingComplete && !allowOnboardingRoutes) {
    return <Navigate to="/set-profile" replace />;
  }

  const authEmailVerified = Boolean(
    (user as { email_confirmed_at?: string | null; confirmed_at?: string | null } | null)?.email_confirmed_at ||
    (user as { email_confirmed_at?: string | null; confirmed_at?: string | null } | null)?.confirmed_at,
  );
  const profileEmailVerified = (profile as { email_verified?: boolean | null } | null)?.email_verified === true;
  if (!authEmailVerified && !profileEmailVerified && !allowOnboardingRoutes) {
    return <Navigate to="/set-profile" replace />;
  }

  // Account state enforcement
  const accountStatus = (profile as unknown as { account_status?: string })?.account_status;
  const suspensionExpiresAt = (profile as unknown as { suspension_expires_at?: string | null })?.suspension_expires_at;
  const restrictionExpiresAt = (profile as unknown as { restriction_expires_at?: string | null })?.restriction_expires_at;

  if (accountStatus === "removed") {
    return <AccountWall status="removed" />;
  }
  if (accountStatus === "suspended") {
    return <AccountWall status="suspended" expiresAt={suspensionExpiresAt} />;
  }

  return (
    <>
      {accountStatus === "restricted" && (
        <RestrictedBanner expiresAt={restrictionExpiresAt} />
      )}
      {children}
    </>
  );
};
