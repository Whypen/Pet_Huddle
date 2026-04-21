import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FormField } from "@/components/ui";
import { NeuButton } from "@/components/ui/NeuButton";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { authChangePassword } from "@/lib/publicAuthApi";

const UpdatePassword = () => {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const handledInvalidLinkRef = useRef(false);
  const recoveryTurnstile = useTurnstile("change_password");
  const showTurnstileDiag =
    typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("turnstile_diag") === "1";

  const readTurnstileToken = () => {
    const maybeGetToken = (recoveryTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String((recoveryTurnstile as { token?: string | null }).token || "").trim();
  };

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (!code) {
        if (!handledInvalidLinkRef.current) {
          handledInvalidLinkRef.current = true;
          toast.error("Invalid reset link");
        }
        navigate("/reset-password", { replace: true });
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        if (!handledInvalidLinkRef.current) {
          handledInvalidLinkRef.current = true;
          toast.error("Invalid reset link");
        }
        navigate("/reset-password", { replace: true });
        return;
      }
      setReady(true);
    };
    void run();
  }, [navigate]);

  const updatePassword = async () => {
    const token = readTurnstileToken();
    if (!token) {
      toast.error("Complete human verification first.");
      return;
    }
    setSubmitting(true);
    const { error } = await authChangePassword({
      password,
      turnstile_token: token,
      turnstile_action: "change_password",
    });
    recoveryTurnstile.reset();
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Failed to update password");
      return;
    }
    toast.success("Password updated");
    navigate("/auth", { replace: true });
  };

  if (!ready) return null;

  return (
    <div className="min-h-svh bg-background px-6 pt-10">
      <h1 className="text-xl font-bold text-brandText">Set a new password</h1>
      <div className="mt-6 space-y-3">
        <FormField
          type="password"
          label="Password"
          leadingIcon={<Lock size={16} strokeWidth={1.75} />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <TurnstileWidget
          siteKeyMissing={recoveryTurnstile.siteKeyMissing}
          setContainer={recoveryTurnstile.setContainer}
          className="min-h-[65px]"
        />
        <TurnstileDebugPanel visible={showTurnstileDiag} diag={recoveryTurnstile.diag} />
        <NeuButton
          className="w-full h-10"
          onClick={updatePassword}
          disabled={password.length < 8 || submitting || !recoveryTurnstile.isTokenUsable}
        >
          Update password
        </NeuButton>
      </div>
    </div>
  );
};

export default UpdatePassword;
