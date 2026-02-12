import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (user) {
    if (profile?.onboarding_completed) return <Navigate to="/" replace />;
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
};
