import { Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { Loader2 } from "lucide-react";
import { isRegisteredUserProfile } from "@/lib/signupFlow";

export const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, session, profile, loading, mfaPending } = useAuth();
  const { flowState } = useSignup();
  const location = useLocation();
  // oauth_onboarding=1 is set by AuthCallback for new Google/Apple users being
  // routed through /signup/dob. The query param acts as a synchronous bypass
  // so the DOB page renders before the React flowState update settles.
  const isOAuthOnboarding =
    new URLSearchParams(location.search).get("oauth_onboarding") === "1";
  const allowSignupFlowWithSession =
    location.pathname.startsWith("/signup/") && (flowState !== "idle" || isOAuthOnboarding);
  const onboardingIncomplete = Boolean(user && profile && !isRegisteredUserProfile(profile));
  const isTokenGatedPath =
    location.pathname === "/signup/email-confirmation" ||
    location.pathname === "/signup/marketing-confirmed";
  if (isTokenGatedPath) {
    // Always allow — token in URL is the auth; user may arrive from inbox days later
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (session && mfaPending && location.pathname === "/auth") {
    return <>{children}</>;
  }
  if (user && !allowSignupFlowWithSession) {
    if (onboardingIncomplete) {
      return <Navigate to="/set-profile" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};
