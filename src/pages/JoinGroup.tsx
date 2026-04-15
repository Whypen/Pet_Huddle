import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { JoinWithCodeSheet } from "@/components/chat/JoinWithCodeSheet";
import { useAuth } from "@/contexts/AuthContext";

/**
 * /join/:code — entry point for group invite links.
 * Opens JoinWithCodeSheet pre-filled with the code from the URL.
 * Unauthenticated visitors are redirected to /auth with a return URL so
 * the invite link survives the sign-in flow.
 * On close (without joining) sends user to the groups tab.
 */
export default function JoinGroup() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    // Wait for auth hydration before deciding — avoids flash-redirect on reload
    if (loading) return;
    if (!user) {
      navigate(`/auth?return=${encodeURIComponent(`/join/${code ?? ""}`)}`, { replace: true });
    }
  }, [loading, user, code, navigate]);

  // Render nothing while auth is resolving or redirect is pending
  if (loading || !user) return null;

  return (
    <JoinWithCodeSheet
      isOpen
      initialCode={code?.toUpperCase()}
      onClose={() => navigate("/chats?tab=groups", { replace: true })}
    />
  );
}
