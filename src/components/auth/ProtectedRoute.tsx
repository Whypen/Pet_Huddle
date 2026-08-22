import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { RouteSuspenseFallback } from "@/routes/RouteSuspense";
import { isRegisteredUserProfile } from "@/lib/signupFlow";
import { AccountWall } from "@/components/moderation/AccountWall";
import { RestrictedBanner } from "@/components/moderation/RestrictedBanner";
import { buildJoinSignInPath } from "@/lib/authIntent";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Rendered instead of redirecting to /auth when nobody is signed in. Used by
   * /social, /map and /chats, which the access matrix says are readable logged
   * out.
   *
   * Every signed-in path below is untouched: the onboarding redirects, the
   * email check, and the suspended/removed/restricted walls all still apply the
   * moment a user exists. This only changes what happens when there is no user
   * at all.
   */
  loggedOutFallback?: React.ReactNode;
}

export const ProtectedRoute = ({ children, loggedOutFallback }: ProtectedRouteProps) => {
  const { user, session, loading, hydrating, profile, mfaPending } = useAuth();
  const { flowState } = useSignup();
  const location = useLocation();
  const allowOnboardingRoutes = ["/verify-identity", "/set-profile", "/set-pet"].includes(location.pathname);
  const allowOnboardingWithoutAuth =
    ["/verify-identity", "/set-profile"].includes(location.pathname) &&
    flowState !== "idle";
  const onboardingComplete = isRegisteredUserProfile(profile);

  // Public read surfaces do not depend on account hydration. Rendering their
  // projection immediately removes an avoidable auth-network round trip from
  // first paint; if a valid session resolves, React swaps to the signed-in
  // surface without ever exposing private data in the interim.
  if (loggedOutFallback && !user && (loading || hydrating)) {
    return <>{loggedOutFallback}</>;
  }

  if (loading || (hydrating && (!user || !profile))) {
    return <RouteSuspenseFallback />;
  }

  if (!user) {
    // Session/user resolution is still in-flight: never redirect on transient null.
    if (session) {
      return <RouteSuspenseFallback />;
    }
    if (allowOnboardingWithoutAuth) {
      return <>{children}</>;
    }
    // Genuinely signed out, and this route has a public read-only view.
    if (loggedOutFallback) {
      return <>{loggedOutFallback}</>;
    }
    return <Navigate to={buildJoinSignInPath(`${location.pathname}${location.search}${location.hash}`)} state={{ mfaRequired: mfaPending }} replace />;
  }

  if (!profile) {
    return <Navigate to={buildJoinSignInPath(`${location.pathname}${location.search}${location.hash}`)} state={{ profileMissing: true }} replace />;
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
