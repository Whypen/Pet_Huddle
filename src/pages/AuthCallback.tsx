import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useSignup } from "@/contexts/SignupContext";
import { consumeSupabaseAuthRedirect } from "@/lib/supabaseAuthRedirect";
import { resolveAuthReturnTo, takeAuthIntent, takeAuthReturnTo } from "@/lib/authIntent";
import { useAuth } from "@/contexts/AuthContext";
import {
  SETPROFILE_PREFILL_KEY,
  loadSignupDraft,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

const normalizeEmail = (value: string | null | undefined) => String(value || "").trim().toLowerCase();
const readRememberedIdentifier = () => {
  try {
    return normalizeEmail(localStorage.getItem("auth_login_identifier"));
  } catch {
    return "";
  }
};

const AuthCallback = () => {
  const navigate = useNavigate();
  const { setFlowState } = useSignup();
  const { user: hydratedUser, hydrating, refreshProfile } = useAuth();
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const returnInFlightRef = useRef(false);

  useEffect(() => {
    if (!pendingDestination || !hydratedUser?.id || hydrating || returnInFlightRef.current) return;
    returnInFlightRef.current = true;
    void refreshProfile().finally(() => {
      navigate(pendingDestination, { replace: true });
    });
  }, [hydratedUser?.id, hydrating, navigate, pendingDestination, refreshProfile]);

  useEffect(() => {
    const run = async () => {
      const callbackResult = await consumeSupabaseAuthRedirect();
      if (!callbackResult.ok) {
        const isRecovery = callbackResult.type === "recovery";
        toast.error(
          isRecovery
            ? "That reset link is no longer valid. Please request a new one."
            : "That verification link is no longer valid. Please request a new one.",
        );
        navigate(isRecovery ? "/reset-password" : "/join?mode=signin", { replace: true });
        return;
      }

      if (callbackResult.type === "recovery") {
        navigate(callbackResult.next || "/update-password", { replace: true });
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error("That verification link is no longer valid. Please request a new one.");
        navigate("/join?mode=signin", { replace: true });
        return;
      }

      const email = normalizeEmail(user.email);
      if (callbackResult.type === "email") {
        const hasSignupDraft = Boolean(loadSignupDraft(email));
        const rememberedIdentifier = readRememberedIdentifier();
        const signupFlowActive =
          typeof window !== "undefined" &&
          (() => {
            try {
              return sessionStorage.getItem("huddle_signup_flow_state_v1") === "signup";
            } catch {
              return false;
            }
          })();
        if (hasSignupDraft || (signupFlowActive && rememberedIdentifier === email)) {
          setFlowState("signup");
          navigate(`/signup/email-confirmation?confirmed=1&email=${encodeURIComponent(email)}`, { replace: true });
          return;
        }
      }
      const phone = String((user.user_metadata as { phone?: string } | null)?.phone || user.phone || "").trim();
      const { data: signupGateStatus, error: signupGateError } = await supabase.rpc("check_identifier_registered", {
        p_email: email || "",
        p_phone: phone || "",
      });
      const signupGate = signupGateStatus && typeof signupGateStatus === "object" && !Array.isArray(signupGateStatus)
        ? signupGateStatus as Record<string, unknown>
        : null;
      if (!signupGateError && signupGate?.blocked) {
        await supabase.auth.signOut({ scope: "local" });
        navigate("/join?mode=signin", {
          replace: true,
          state: {
            blocked_message: String(
              signupGate.public_message ||
              "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.",
            ),
          },
        });
        return;
      }
      if (!signupGateError && signupGate?.review_required) {
        await supabase.auth.signOut({ scope: "local" });
        navigate("/join?mode=signin", {
          replace: true,
          state: {
            blocked_message: "Signup is temporarily unavailable. Please try again later.",
          },
        });
        return;
      }

      const isOAuth = user.app_metadata?.provider !== "email";
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
        const nextEmail = user.email || "";
        try {
          const owner = normalizeStorageOwner(nextEmail);
          localStorage.setItem(
            buildScopedStorageKey(SETPROFILE_PREFILL_KEY, owner),
            JSON.stringify({ display_name: fullName, dob: "", phone: "", social_id: "", email: nextEmail }),
          );
          localStorage.setItem("auth_login_identifier", nextEmail);
          sessionStorage.setItem("huddle_signup_flow_state_v1", "signup");
        } catch {
          // best-effort
        }
        setFlowState("signup");
        navigate("/signup/dob?oauth_onboarding=1");
        return;
      }

      if (isOAuth) {
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

      // Intent resume. If the person hit the auth wall mid-action, land them back
      // where they were instead of on the home dashboard. OAuth unloads the page,
      // so this is read from sessionStorage, not from memory. `takeAuthIntent`
      // consumes it, so a refresh of this route cannot replay it a second time,
      // and anything older than the TTL is discarded rather than fired late.
      //
      // Only the returning-user path resumes: a brand new OAuth account is routed
      // to /signup/dob above, and its intent will have expired by the time
      // onboarding finishes — which is the safe outcome, not a missed case.
      const resumed = takeAuthIntent();
      const destination = resolveAuthReturnTo(resumed?.returnTo, takeAuthReturnTo());
      setPendingDestination(destination);
    };
    void run();
  }, [navigate, setFlowState]);

  return null;
};

export default AuthCallback;
