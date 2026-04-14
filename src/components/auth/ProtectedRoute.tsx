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

  if (loading || (hydrating && !profile)) {
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
    // Keep route stable while profile resolution is unresolved but session is valid.
    if (session) {
      return (
        <div className="min-h-svh flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    if (allowOnboardingRoutes) {
      return <>{children}</>;
    }
    // No active session and no profile is a true invalid state.
    return <Navigate to="/auth" replace />;
  }

  if (!onboardingComplete && !allowOnboardingRoutes) {
    return <Navigate to="/set-profile" replace />;
  }

  // Defense-in-depth: if profile is loaded and email not verified,
  // user cannot leave onboarding routes.
  // OAuth users (Google/Apple) are exempt — their email is already provider-verified.
  const isOAuthUser = user?.app_metadata?.provider !== "email";
  const emailVerified = isOAuthUser || ((profile as { email_verified?: boolean } | null)?.email_verified ?? true);
  if (!emailVerified && !allowOnboardingRoutes) {
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
