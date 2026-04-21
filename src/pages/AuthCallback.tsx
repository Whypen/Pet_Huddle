import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useSignup } from "@/contexts/SignupContext";
import {
  SETPROFILE_PREFILL_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

const normalizeEmail = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

const AuthCallback = () => {
  const navigate = useNavigate();
  const { setFlowState } = useSignup();

  useEffect(() => {
    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error("Sign-in failed. Please try again.");
          navigate("/auth");
          return;
        }
      }
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

      navigate("/");
    };
    void run();
  }, [navigate, setFlowState]);
  return null;
};

export default AuthCallback;
