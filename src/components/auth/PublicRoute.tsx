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
  const allowSignupFlowWithSession =
    location.pathname.startsWith("/signup/") && flowState !== "idle";
  const onboardingIncomplete = Boolean(user) && !isRegisteredUserProfile(profile ?? null);
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
