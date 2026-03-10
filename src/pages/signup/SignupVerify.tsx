/**
 * SignupVerify — C.5  Step 4 of 4
 * Identity verification decision. Uses SignupShell for layout.
 * Two CTAs: "Start Verification" (primary) + "Skip for now" (ghost).
 * All business logic (supabase.auth.signUp, profile update, skip dialog) preserved.
 */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import signupVerifyImg from "@/assets/Sign up/Signup_verify.png";
import { verifySchema } from "@/lib/authSchemas";
import { useSignup } from "@/contexts/SignupContext";
import { Button, FormField } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SignupShell } from "@/components/signup/SignupShell";
import { SETPROFILE_PREFILL_KEY, SIGNUP_VERIFY_SUBMITTED_KEY } from "@/lib/signupOnboarding";

// ─── Constants ────────────────────────────────────────────────────────────────

const FORM_ID = "signup-verify-form";
const hasValidLegalName = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => word.length >= 1);
};
const LEGAL_NAME_SUBTEXT = "Legal name should include at least two words - first and last name.";
const LEGAL_NAME_RETRY_ERROR = "Let’s try again with a valid legal name";
const SIGNUP_VERIFY_RETURN_TO = "/set-profile";

// ─── Component ────────────────────────────────────────────────────────────────

const SignupVerify = () => {
  const navigate = useNavigate();
  const { data, update } = useSignup();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const [legalNameInlineError, setLegalNameInlineError] = useState("");

  const goTo = (to: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(to), 180);
  };

  useEffect(() => {
    try {
      setVerificationSubmitted(sessionStorage.getItem(SIGNUP_VERIFY_SUBMITTED_KEY) === "true");
    } catch {
      setVerificationSubmitted(false);
    }
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<{ legal_name: string }>({
    resolver: zodResolver(verifySchema),
    defaultValues: { legal_name: data.legal_name || "" },
  });
  const legalNameInput = watch("legal_name") || data.legal_name || "";

  useEffect(() => {
    update({ legal_name: legalNameInput });
    if (legalNameInlineError && hasValidLegalName(legalNameInput)) {
      setLegalNameInlineError("");
    }
  }, [legalNameInlineError, legalNameInput, update]);

  // ── Shared pre-flight validation (unchanged) ─────────────────────────────────

  const preflightOk = (legalName: string) => {
    if (!hasValidLegalName(legalName)) {
      setLegalNameInlineError(LEGAL_NAME_RETRY_ERROR);
      return false;
    }
    setLegalNameInlineError("");
    return true;
  };

  const snapshotSetProfilePrefill = (legalName: string) => {
    try {
      localStorage.setItem(
        SETPROFILE_PREFILL_KEY,
        JSON.stringify({
          display_name: data.display_name || "",
          social_id: data.social_id || "",
          phone: data.phone || "",
          dob: data.dob || "",
          legal_name: legalName || data.legal_name || "",
        }),
      );
    } catch {
      // no-op
    }
  };

  // ── Start verification (unchanged) ──────────────────────────────────────────

  const startVerificationSignup = async (legalName?: string) => {
    const resolvedLegalName = legalName || data.legal_name || "";
    if (!preflightOk(resolvedLegalName)) return;
    update({ legal_name: resolvedLegalName });
    snapshotSetProfilePrefill(resolvedLegalName);
    navigate("/verify-identity", {
      state: {
        returnTo: SIGNUP_VERIFY_RETURN_TO,
        backTo: "/signup/verify",
      },
    });
  };

  const onStartVerification = (values: { legal_name: string }) => {
    startVerificationSignup(values.legal_name || data.legal_name);
  };

  const ensureAccountAndGoSetProfile = async (legalName: string) => {
    if (!preflightOk(legalName)) return;
    try {
      snapshotSetProfilePrefill(legalName || data.legal_name || "");
      navigate("/set-profile");
    } catch (err: unknown) {
      console.error("[SignupVerify] ensureAccountAndGoSetProfile failed", err);
      const rawMessage = humanizeError(err);
      const message =
        !rawMessage || rawMessage === "{}" || rawMessage.includes("upstream server")
          ? AUTH_UPSTREAM_DOWN_ERROR
          : rawMessage;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onContinueAfterVerification = async () => {
    await ensureAccountAndGoSetProfile(legalNameInput || data.legal_name || "");
  };

  // ── Skip verification (unchanged) ───────────────────────────────────────────

  const skipVerificationSignup = async () => {
    await ensureAccountAndGoSetProfile(legalNameInput || data.legal_name || "");
    setShowSkipConfirm(false);
  };

  return (
    <>
      <SignupShell
        step={4}
        onBack={() => goTo("/signup/name")}
        isExiting={isExiting}
        cta={
          <div className="flex flex-col gap-3">
            {/* Primary: Start verification (submits form) */}
            <Button
              variant="primary"
              type="submit"
              form={FORM_ID}
              disabled={loading}
              className="w-full h-12"
            >
              {loading ? "Processing…" : "Start Verification"}
            </Button>
            {/* Ghost: Skip */}
            <Button
              variant={verificationSubmitted ? "secondary" : "ghost"}
              type="button"
              disabled={loading}
              onClick={() => {
                if (verificationSubmitted) {
                  void onContinueAfterVerification();
                  return;
                }
                if (!preflightOk(legalNameInput || data.legal_name || "")) {
                  return;
                }
                setShowSkipConfirm(true);
              }}
              className="w-full h-12"
            >
              {verificationSubmitted ? "Continue" : "Skip for now"}
            </Button>
          </div>
        }
      >
        {/* Hero illustration */}
        <img src={signupVerifyImg} alt="" aria-hidden className="w-full object-contain -mt-2 mb-6" />

        {/* Headline */}
        <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
          Identity verification
        </h1>
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
          Build the safest community for our pets and earn your <strong className="font-[600] text-[#424965]">Verified</strong> badge by completing a quick identity check.
        </p>

        <form id={FORM_ID} onSubmit={handleSubmit(onStartVerification)} className="mt-8 space-y-6">
          {/* Legal name */}
          <FormField
            label="Legal Name (as shown on ID)"
            leadingIcon={<User size={16} strokeWidth={1.75} />}
            placeholder="First Name and Last Name"
            error={legalNameInlineError || (errors.legal_name ? (hasValidLegalName(legalNameInput) ? undefined : LEGAL_NAME_SUBTEXT) : undefined)}
            {...register("legal_name")}
          />

          {/* Verify info card */}
          <div
            className="rounded-[20px] p-[16px]"
            style={{
              background: "rgba(33,69,207,0.06)",
              border: "1px solid rgba(33,69,207,0.18)",
            }}
          >
            <div className="flex items-center gap-[10px]">
              <ShieldCheck size={20} strokeWidth={1.5} className="text-[#2145CF] flex-shrink-0" />
              <span className="text-[15px] font-[600] text-[#424965]">
                Trusted to care
              </span>
            </div>
            <p className="text-[13px] text-[rgba(74,73,101,0.70)] mt-[8px] leading-relaxed">
              Let the community know you can be trusted for care and advice, and that you're ready to help any pet in need. Trust starts with you.
            </p>
          </div>
        </form>
      </SignupShell>

      {/* Skip confirmation dialog (unchanged) */}
      <Dialog open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-[16px] font-[600] text-[#424965]">
            Skip identity verification?
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[rgba(74,73,101,0.70)] mt-2">
            Unverified users have limited access to certain community features and may appear less trustworthy to others.
          </DialogDescription>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="ghost"
              className="w-full h-12"
              onClick={() => setShowSkipConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="w-full h-12"
              onClick={skipVerificationSignup}
              disabled={loading}
            >
              {loading ? "Processing…" : "Yes, skip verification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignupVerify;
