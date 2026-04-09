/**
 * SignupName — C.5  Step 3 of 4
 * Display name + Social ID. Uses SignupShell for layout.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSignup } from "@/contexts/SignupContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button, FormField } from "@/components/ui";
import { supabase } from "@/integrations/supabase/client";
import { SignupShell } from "@/components/signup/SignupShell";
import signupNameImg from "@/assets/Sign up/Signup_Name.png";
import { authSignup } from "@/lib/publicAuthApi";

// ─── Validation (unchanged) ───────────────────────────────────────────────────

const SOCIAL_ID_REGEX = /^[A-Za-z0-9_.-]{6,15}$/;
const FORM_ID = "signup-name-form";
const ACCOUNT_UNAVAILABLE_MESSAGE =
  "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.";
const SIGNUP_REVIEW_MESSAGE = "Signup is temporarily unavailable. Please try again later.";

// ─── Component ────────────────────────────────────────────────────────────────

const SignupName = () => {
  const navigate = useNavigate();
  const { data, update, setFlowState } = useSignup();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(data.display_name || "");
  const [socialId, setSocialId]       = useState(data.social_id || "");
  const [socialError, setSocialError] = useState("");
  const [availabilityState, setAvailabilityState] = useState<"idle" | "checking" | "available" | "taken" | "failed">("idle");
  const [checkNonce, setCheckNonce] = useState(0);
  const [submitting, setSubmitting]   = useState(false);
  const [isExiting, setIsExiting]     = useState(false);
  const normalizedSocialId = useMemo(() => socialId.trim(), [socialId]);
  const resolveSignupError = (error: { message?: string; details?: unknown } | null) => {
    if (!error) return "Account creation failed. Please try again.";
    const details = (error.details && typeof error.details === "object")
      ? (error.details as { public_message?: unknown })
      : null;
    const publicMessage = String(details?.public_message || "").trim();
    if (publicMessage) return publicMessage;
    const message = String(error.message || "").trim();
    if (message === "account_unavailable") return ACCOUNT_UNAVAILABLE_MESSAGE;
    if (message === "signup_temporarily_unavailable") return SIGNUP_REVIEW_MESSAGE;
    return message || "Account creation failed. Please try again.";
  };

  const goTo = (to: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(to), 180);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name   = displayName.trim();
    const social = normalizedSocialId;

    if (!name) return;
    if (!SOCIAL_ID_REGEX.test(social)) {
      setSocialError("Use 6-15 letters, numbers, underscore, hyphen, or dot");
      return;
    }

    setSubmitting(true);
    setAvailabilityState("checking");
    setSocialError("");
    try {
      const { data: isTaken, error: duplicateError } = await supabase.rpc("is_social_id_taken", {
        p_social_id: social,
      });
      if (duplicateError) {
        setAvailabilityState("failed");
        setSocialError("Could not verify Social ID right now. Please retry.");
        return;
      }
      if (isTaken) {
        setAvailabilityState("taken");
        setSocialError("Oops! This Social ID was taken");
        return;
      }
      setAvailabilityState("available");
      update({ display_name: name, social_id: social });
      if (!user) {
        const signupProof = String(data.signup_proof || "").trim();
        if (!signupProof) {
          toast.error("Email verification is required. Please resend your verification link.");
          return;
        }
        // New user — create account now that we have display name + social ID
        const { error: signUpError } = await authSignup({
          email: data.email.trim(),
          password: data.password,
          options: {
            data: {
              phone: data.phone?.trim(),
              dob: data.dob,
              marketing_email_opt_in: data.email_opt_in,
            },
          },
          signup_proof: signupProof,
        });
        if (signUpError) {
          setFlowState("idle");
          toast.error(resolveSignupError(signUpError));
          return;
        }
        // Fire account verify email + optional marketing DOI email (both fire-and-forget)
        const { data: sessionData } = await supabase.auth.getSession();
        const newUserId = sessionData.session?.user?.id;
        if (newUserId) {
          void supabase.functions
            .invoke("send-signup-verify-email", { body: { user_id: newUserId } })
            .catch((err) => console.warn("[signup-name] verify email failed silently", err));
          if (data.email_opt_in) {
            void supabase.functions
              .invoke("send-marketing-doi-email", { body: { user_id: newUserId } })
              .catch((err) => console.warn("[signup-name] marketing DOI email failed silently", err));
          }
        }
        if (data.email_opt_in) {
          toast.message("We’ll send you a separate email to confirm your subscription.");
        }
        goTo("/signup/verify");
        return;
      }
      if (data.email_opt_in) {
        toast.message("We’ll send you a separate email to confirm your subscription.");
      }
      goTo("/signup/verify");
    } catch {
      setAvailabilityState("failed");
      setSocialError("Could not verify Social ID right now. Please retry.");
      toast.error("Could not verify Social ID right now. Please retry.");
      return;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!normalizedSocialId) {
      setAvailabilityState("idle");
      setSocialError("");
      return;
    }
    if (!SOCIAL_ID_REGEX.test(normalizedSocialId)) {
      setAvailabilityState("idle");
      setSocialError("Use 6-15 letters, numbers, underscore, hyphen, or dot");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setAvailabilityState("checking");
      try {
        const { data: isTaken, error } = await supabase.rpc("is_social_id_taken", {
          p_social_id: normalizedSocialId,
        });
        if (cancelled) return;
        if (error) {
          setAvailabilityState("failed");
          setSocialError("Could not verify Social ID right now. Please retry.");
          return;
        }
        if (isTaken) {
          setAvailabilityState("taken");
          setSocialError("Oops! This Social ID was taken");
          return;
        }
        setAvailabilityState("available");
        setSocialError("");
      } catch {
        if (cancelled) return;
        setAvailabilityState("failed");
        setSocialError("Could not verify Social ID right now. Please retry.");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedSocialId, checkNonce]);

  const canContinue =
    !submitting &&
    Boolean(displayName.trim()) &&
    Boolean(normalizedSocialId) &&
    SOCIAL_ID_REGEX.test(normalizedSocialId) &&
    availabilityState === "available" &&
    (user ? true : Boolean(String(data.signup_proof || "").trim()));

  return (
    <SignupShell
      step={3}
      onBack={() => goTo("/signup/credentials")}
      isExiting={isExiting}
      cta={
        <div className="space-y-3">
          <Button
            variant="primary"
            type="submit"
            form={FORM_ID}
            disabled={!canContinue}
            className="w-full h-12"
          >
            {submitting ? "Checking…" : "Continue"}
          </Button>
        </div>
      }
    >
      {/* Hero illustration */}
      <img
        src={signupNameImg}
        alt=""
        aria-hidden
        className="w-full object-contain -mt-2 mb-6"
      />

      {/* Headline */}
      <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
        Set your profile name
      </h1>
      <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
        This is how you'll be mentioned in conversations and identified on the{" "}
        <strong className="font-[600] text-[#424965]">Map</strong>, where we all
        work together to spot stray or lost pets and share{" "}
        <strong className="font-[600] text-[#424965]">Danger Alerts</strong>{" "}
        to keep our pack safe.
      </p>

      <form id={FORM_ID} onSubmit={onSubmit} className="mt-8 space-y-6" noValidate>
        {/* Display name */}
        <FormField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        {/* Social ID */}
        <FormField
          label="Social ID"
          error={socialError || undefined}
          hint={
            !socialError && availabilityState === "checking"
              ? "Checking Social ID…"
              : !socialError && availabilityState === "available"
                ? "Social ID is available"
                : undefined
          }
          value={socialId}
          onChange={(e) => {
            setSocialError("");
            setAvailabilityState("idle");
            setCheckNonce((value) => value + 1);
            setSocialId(e.target.value);
          }}
        />
        {availabilityState === "failed" && !socialError && (
          <button
            type="button"
            className="mt-1 text-[12px] text-[#2145CF] underline"
            onClick={() => {
              setSocialError("");
              setAvailabilityState("idle");
              setCheckNonce((value) => value + 1);
            }}
          >
            Retry check
          </button>
        )}

      </form>
    </SignupShell>
  );
};

export default SignupName;
