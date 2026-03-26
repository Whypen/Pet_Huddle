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
import { LegalModal } from "@/components/modals/LegalModal";
import { supabase } from "@/integrations/supabase/client";
import { SignupShell } from "@/components/signup/SignupShell";
import signupNameImg from "@/assets/Sign up/Signup_Name.png";

// ─── Validation (unchanged) ───────────────────────────────────────────────────

const SOCIAL_ID_REGEX = /^[A-Za-z0-9_.-]{6,15}$/;
const FORM_ID = "signup-name-form";

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
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [showEmailOptInNote, setShowEmailOptInNote] = useState(false);
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [isExiting, setIsExiting]     = useState(false);
  const normalizedSocialId = useMemo(() => socialId.trim(), [socialId]);

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

    setShowEmailOptInNote(emailOptIn);
    setSubmitting(true);
    setAvailabilityState("checking");
    setSocialError("");
    try {
      const { data: isTaken, error: duplicateError } = await supabase.rpc("is_social_id_taken", {
        p_social_id: social,
      });
      if (duplicateError) {
        setAvailabilityState("available");
        setSocialError("");
      }
      if (isTaken) {
        setAvailabilityState("taken");
        setSocialError("Oops! This Social ID was taken");
        return;
      }
      setAvailabilityState("available");
      update({ display_name: name, social_id: social });
      if (!user) {
        // New user — create account now that we have display name + social ID
        const { error: signUpError } = await supabase.auth.signUp({
          email: data.email.trim(),
          password: data.password,
          options: {
            data: {
              phone: data.phone?.trim(),
              dob: data.dob,
              marketing_email_opt_in: emailOptIn,
            },
          },
        });
        if (signUpError) {
          setFlowState("idle");
          toast.error("Account creation failed. Please try again.");
          return;
        }
        // Fire verify email (fire-and-forget)
        const { data: sessionData } = await supabase.auth.getSession();
        const newUserId = sessionData.session?.user?.id;
        if (newUserId) {
          void supabase.functions
            .invoke("send-signup-verify-email", { body: { user_id: newUserId } })
            .catch((err) => console.warn("[signup-name] verify email failed silently", err));
        }
        if (emailOptIn) {
          toast.message("We’ll send you a separate email to confirm your subscription.");
        }
        goTo("/signup/email-confirmation");
        return;
      }
      if (emailOptIn) {
        toast.message("We’ll send you a separate email to confirm your subscription.");
      }
      goTo("/signup/verify");
    } catch {
      setAvailabilityState("available");
      setSocialError("");
      update({ display_name: name, social_id: social });
      if (!user) {
        toast.error("Could not check availability. Please try again.");
        return;
      }
      goTo("/signup/verify");
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
          setAvailabilityState("available");
          setSocialError("");
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
        setAvailabilityState("available");
        setSocialError("");
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
    availabilityState === "available";

  return (
    <SignupShell
      step={3}
      onBack={() => goTo("/signup/credentials")}
      isExiting={isExiting}
      cta={
        <Button
          variant="primary"
          type="submit"
          form={FORM_ID}
          disabled={!canContinue}
          className="w-full h-12"
        >
          {submitting ? "Checking…" : "Continue"}
        </Button>
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

        <div className="space-y-3 pt-2">
          <p className="text-[12px] text-[rgba(74,73,101,0.60)] leading-relaxed">
            By tapping Continue, you agree to our{" "}
            <button
              type="button"
              className="text-[#2145CF] underline"
              onClick={() => setLegalModal("terms")}
            >
              Terms of Service
            </button>{" "}
            and{" "}
            <button
              type="button"
              className="text-[#2145CF] underline"
              onClick={() => setLegalModal("privacy")}
            >
              Privacy Policy
            </button>
            .
          </p>

          <label className="flex items-start gap-2 text-[12px] text-[rgba(74,73,101,0.80)] leading-relaxed">
            <input
              type="checkbox"
              checked={emailOptIn}
              onChange={(event) => setEmailOptIn(event.target.checked)}
              className="mt-[2px] h-4 w-4 rounded border-[rgba(74,73,101,0.35)]"
            />
            <span>
              I agree to receive emails from huddle for pet care, community news, and product updates.
            </span>
          </label>

          {showEmailOptInNote && (
            <p className="text-[12px] text-[rgba(74,73,101,0.60)]">
              We’ll send you a separate email to confirm your subscription.
            </p>
          )}
        </div>
      </form>

      <LegalModal isOpen={legalModal === "terms"} onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />
    </SignupShell>
  );
};

export default SignupName;
