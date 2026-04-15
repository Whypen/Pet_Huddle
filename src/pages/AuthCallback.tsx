import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";
import { FormField } from "@/components/ui";
import { NeuButton } from "@/components/ui/NeuButton";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import { useSignup } from "@/contexts/SignupContext";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import { authChangePassword } from "@/lib/publicAuthApi";
import {
  SETPROFILE_PREFILL_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

const normalizeEmail = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

const AuthCallback = () => {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setFlowState } = useSignup();
  const recoveryTurnstile = useTurnstile("change_password");
  const showTurnstileDiag = new URLSearchParams(location.search).get("turnstile_diag") === "1";
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
      const type = url.searchParams.get("type");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(type === "recovery" ? "Invalid reset link" : "Sign-in failed. Please try again.");
          navigate(type === "recovery" ? "/reset-password" : "/auth");
          return;
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

        const email = normalizeEmail(user.email);
        const phone = String((user.user_metadata as { phone?: string } | null)?.phone || user.phone || "").trim();
        const { data: signupGateStatus, error: signupGateError } = await supabase.rpc("check_identifier_registered", {
          p_email: email || "",
          p_phone: phone || "",
        });
        if (!signupGateError && signupGateStatus?.blocked) {
          await supabase.auth.signOut({ scope: "local" });
          navigate("/auth", {
            replace: true,
            state: {
              blocked_message: String(
                signupGateStatus?.public_message ||
                "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.",
              ),
            },
          });
          return;
        }
        if (!signupGateError && signupGateStatus?.review_required) {
          await supabase.auth.signOut({ scope: "local" });
          navigate("/auth", {
            replace: true,
            state: {
              blocked_message: "Signup is temporarily unavailable. Please try again later.",
            },
          });
          return;
        }

        // Check if this is a brand-new OAuth user (no profile row yet).
        const isOAuth = user.app_metadata?.provider !== "email";
        if (isOAuth) {
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("id, email")
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
                JSON.stringify({ display_name: fullName, dob: "", phone: "", social_id: "", email }),
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

          const profileEmail = normalizeEmail(profileRow.email);
          if (email && profileEmail !== email) {
            const { error: repairError } = await supabase
              .from("profiles")
              .update({ email })
              .eq("id", user.id);
            if (repairError) {
              console.warn("[AuthCallback] Failed to repair profile email for OAuth user", repairError);
            }
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
    navigate("/auth");
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
        <NeuButton className="w-full h-10" onClick={updatePassword} disabled={password.length < 8 || submitting || !recoveryTurnstile.isTokenUsable}>
          Update password
        </NeuButton>
      </div>
    </div>
  );
};

export default AuthCallback;
