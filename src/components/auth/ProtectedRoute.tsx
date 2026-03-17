import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
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
  const { user, session, loading, profile, mfaPending } = useAuth();
  const { flowState } = useSignup();
  const location = useLocation();
  const [profileWaitExceeded, setProfileWaitExceeded] = useState(false);
  const allowOnboardingRoutes = ["/verify-identity", "/set-profile", "/set-pet"].includes(location.pathname);
  const allowOnboardingWithoutAuth =
    ["/verify-identity", "/set-profile"].includes(location.pathname) &&
    flowState !== "idle";
  const onboardingComplete = isRegisteredUserProfile(profile);

  useEffect(() => {
    if (!user || profile) {
      setProfileWaitExceeded(false);
      return;
    }
    const timeout = window.setTimeout(() => setProfileWaitExceeded(true), 1500);
    return () => window.clearTimeout(timeout);
  }, [user, profile]);

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // A session exists but user hasn't been set yet: either the session is
    // still hydrating (mfaPending=false) or the MFA challenge is in-flight
    // (mfaPending=true). In both cases show a spinner — never redirect to /auth.
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
    if (!profileWaitExceeded) {
      return (
        <div className="min-h-svh flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    if (!allowOnboardingRoutes) {
      return <Navigate to="/set-profile" replace />;
    }
    return <>{children}</>;
  }

  if (!onboardingComplete && !allowOnboardingRoutes) {
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
