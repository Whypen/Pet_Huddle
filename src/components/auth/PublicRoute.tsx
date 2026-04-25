import { Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { Loader2 } from "lucide-react";
import { isRegisteredUserProfile } from "@/lib/signupFlow";
import { hasSignupDraft } from "@/lib/signupOnboarding";

export const PublicRoute = ({
  children,
  renderWhileAuthLoading = false,
}: {
  children: React.ReactNode;
  renderWhileAuthLoading?: boolean;
}) => {
  const { user, session, profile, loading, hydrating, mfaPending } = useAuth();
  const { flowState } = useSignup();
  const location = useLocation();
  const isSignupPath = location.pathname.startsWith("/signup/");
  const persistedSignupFlowState =
    typeof window !== "undefined"
    && (() => {
      try {
        const raw = sessionStorage.getItem("huddle_signup_flow_state_v1");
        return raw === "signup" || raw === "verify_identity";
      } catch {
        return false;
      }
    })();
  const hasPersistedSignupDraft = typeof window !== "undefined" && hasSignupDraft();
  // oauth_onboarding=1 is set by AuthCallback for new Google/Apple users being
  // routed through /signup/dob. The query param acts as a synchronous bypass
  // so the DOB page renders before the React flowState update settles.
  const isOAuthOnboarding =
    new URLSearchParams(location.search).get("oauth_onboarding") === "1";
  const allowSignupFlowWithSession =
    isSignupPath
    && !profile
    && (
      flowState !== "idle"
      || persistedSignupFlowState
      || hasPersistedSignupDraft
      || isOAuthOnboarding
    );
  const onboardingIncomplete = Boolean(user && profile && !isRegisteredUserProfile(profile));
  const activeSignupFlow =
    flowState !== "idle" ||
    persistedSignupFlowState ||
    hasPersistedSignupDraft ||
    isOAuthOnboarding;
  const allowSignupVerifyDecision =
    location.pathname === "/signup/verify" &&
    onboardingIncomplete &&
    activeSignupFlow;
  const isTokenGatedPath =
    location.pathname === "/signup/email-confirmation" ||
    location.pathname === "/signup/marketing-confirmed" ||
    location.pathname === "/verify";
  if (isTokenGatedPath) {
    // Always allow — token in URL is the auth; user may arrive from inbox days later
    return <>{children}</>;
  }

  // Always let AuthCallback handle its own navigation. It checks profile existence
  // and routes new OAuth users to /signup/dob before PublicRoute sees loading=false.
  if (location.pathname === "/auth/callback" || location.pathname === "/update-password") {
    return <>{children}</>;
  }

  if (loading && !renderWhileAuthLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // While AuthContext is mid-hydration (user set, profile fetch in flight),
  // hold signup paths in place rather than redirecting. The hydration window
  // is brief (<500 ms) but long enough to cause a PublicRoute bounce when
  // a deleted-account re-signup fires SIGNED_IN before the profile resolves.
  if (hydrating && isSignupPath && !renderWhileAuthLoading) {
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
    if (!profile) {
      // user+!profile = mid-OAuth onboarding or abandoned signup.
      // Only /auth is permitted: it is the loop-break target and the correct
      // restart point. Active /signup/* paths are already allowed above via
      // allowSignupFlowWithSession and never reach this block. Token-gated
      // paths have their own early return above. All other public pages are
      // blocked — a partial-auth user has no business on /reset-password etc.
      if (location.pathname === "/auth") return <>{children}</>;
      return <Navigate to="/auth" replace />;
    }
    if (onboardingIncomplete) {
      if (allowSignupVerifyDecision) return <>{children}</>;
      return <Navigate to="/set-profile" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};
