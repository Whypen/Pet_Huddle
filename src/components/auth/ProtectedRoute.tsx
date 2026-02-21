import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sessionCheck, setSessionCheck] = useState<"idle" | "checking" | "hasSession" | "noSession">("idle");

  useEffect(() => {
    if (loading || user) return;
    let cancelled = false;
    setSessionCheck("checking");
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        setSessionCheck(session ? "hasSession" : "noSession");
      })
      .catch(() => {
        if (cancelled) return;
        setSessionCheck("noSession");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  if (loading || (!user && (sessionCheck === "idle" || sessionCheck === "checking" || sessionCheck === "hasSession"))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
