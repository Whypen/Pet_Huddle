import { useParams, useNavigate } from "react-router-dom";
import { JoinWithCodeSheet } from "@/components/chat/JoinWithCodeSheet";

/**
 * /join/:code — entry point for group invite links.
 * Opens JoinWithCodeSheet pre-filled with the code from the URL.
 * On close (without joining) sends user to the groups tab.
 */
export default function JoinGroup() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  return (
    <JoinWithCodeSheet
      isOpen
      initialCode={code?.toUpperCase()}
      onClose={() => navigate("/chats?tab=groups", { replace: true })}
    />
  );
}
