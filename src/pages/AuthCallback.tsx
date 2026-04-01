import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { NeuButton } from "@/components/ui/NeuButton";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useSignup } from "@/contexts/SignupContext";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { authChangePassword } from "@/lib/publicAuthApi";
import {
  SETPROFILE_PREFILL_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

const AuthCallback = () => {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setFlowState } = useSignup();
  const recoveryTurnstile = useTurnstile("change_password");

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const type = url.searchParams.get("type");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(type === "recovery" ? "Invalid reset link" : "Sign-in failed. Please try again.");
        }
      }
      if (type !== "recovery") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          navigate("/auth");
          return;
        }

        // Check if this is a brand-new OAuth user (no profile row yet).
        const isOAuth = user.app_metadata?.provider !== "email";
        if (isOAuth) {
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

          if (!profileRow) {
            // New OAuth user — pre-fill display_name from provider metadata and
            // route through the DOB step before landing on set-profile.
            const fullName =
              (user.user_metadata?.full_name as string | undefined) ||
              (user.user_metadata?.name as string | undefined) ||
              "";
            const email = user.email || "";
            try {
              const owner = normalizeStorageOwner(email);
              localStorage.setItem(
                buildScopedStorageKey(SETPROFILE_PREFILL_KEY, owner),
                JSON.stringify({ display_name: fullName, dob: "", phone: "", social_id: "" }),
              );
              // Remember email so SignupContext can find the scoped draft.
              localStorage.setItem("auth_login_identifier", email);
            } catch {
              // best-effort
            }
            setFlowState("signup");
            navigate("/signup/dob?oauth_onboarding=1");
            return;
          }
        }

        // Existing user — ProtectedRoute handles onboarding routing.
        navigate("/");
        return;
      }
      setReady(true);
    };
    void run();
  }, [navigate, setFlowState]);

  const updatePassword = async () => {
    const token = String(recoveryTurnstile.token || "").trim();
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
    navigate("/auth");
  };

  if (!ready) return null;

  return (
    <div className="min-h-svh bg-background px-6 pt-10">
      <h1 className="text-xl font-bold text-brandText">Set a new password</h1>
      <div className="mt-6 space-y-3">
        <Input
          type={showPassword ? "text" : "password"}
          className="h-9"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
        />
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary,#6b7280)] hover:text-[var(--text-primary,#424965)]"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <TurnstileWidget
          siteKeyMissing={recoveryTurnstile.siteKeyMissing}
          setContainer={recoveryTurnstile.setContainer}
          className="min-h-[65px]"
        />
        <NeuButton className="w-full h-10" onClick={updatePassword} disabled={password.length < 8 || submitting}>
          Update password
        </NeuButton>
      </div>
    </div>
  );
};

export default AuthCallback;
