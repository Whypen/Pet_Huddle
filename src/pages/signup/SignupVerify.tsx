/**
 * SignupVerify — C.5  Step 4 of 4
 * Identity verification decision. Uses SignupShell for layout.
 * Two CTAs: "Start Verification" (primary) + "Skip for now" (ghost).
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import signupVerifyImg from "@/assets/Sign up/Signup_verify.png";
import { useSignup } from "@/contexts/SignupContext";
import { Button } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SignupShell } from "@/components/signup/SignupShell";
import { SETPROFILE_PREFILL_KEY, SIGNUP_VERIFY_SUBMITTED_KEY } from "@/lib/signupOnboarding";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNUP_VERIFY_RETURN_TO = "/set-profile";

// ─── Component ────────────────────────────────────────────────────────────────

const SignupVerify = () => {
  const navigate = useNavigate();
  const { data, setFlowState } = useSignup();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);

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

  // ── Prefill snapshot for /set-profile ────────────────────────────────────────

  const snapshotSetProfilePrefill = () => {
    try {
      localStorage.setItem(
        SETPROFILE_PREFILL_KEY,
        JSON.stringify({
          display_name: data.display_name || "",
          social_id: data.social_id || "",
          phone: data.phone || "",
          dob: data.dob || "",
        }),
      );
    } catch {
      // no-op
    }
  };

  // ── Start verification ───────────────────────────────────────────────────────
  // signUp() was already called at step 2 (SignupCredentials), so session is
  // live. These handlers only need to snapshot prefill data and navigate.

  const startVerificationSignup = () => {
    snapshotSetProfilePrefill();
    setFlowState("signup"); // safety net in case user arrived out-of-order
    navigate("/verify-identity", {
      state: {
        returnTo: SIGNUP_VERIFY_RETURN_TO,
        backTo: "/signup/verify",
      },
    });
  };

  const goToSetProfile = () => {
    snapshotSetProfilePrefill();
    setFlowState("signup"); // safety net
    navigate("/set-profile");
  };

  // ── Skip verification ────────────────────────────────────────────────────────

  const skipVerificationSignup = () => {
    goToSetProfile();
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
            {/* Primary: Start verification */}
            <Button
              variant="primary"
              type="button"
              onClick={startVerificationSignup}
              className="w-full h-12"
            >
              Start Verification
            </Button>
            {/* Ghost: Skip */}
            <Button
              variant={verificationSubmitted ? "secondary" : "ghost"}
              type="button"
              onClick={() => {
                if (verificationSubmitted) {
                  goToSetProfile();
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
        <img src={signupVerifyImg} alt="" aria-hidden className="w-full object-contain max-h-[170px] -mt-2 mb-4" />

        {/* Headline */}
        <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
          Identity verification
        </h1>
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-2">
          Build the safest community for our pets and earn your <strong className="font-[600] text-[#424965]">Verified</strong> badge by completing a quick identity check.
        </p>

        {/* Verify info card */}
        <div
          className="rounded-[20px] p-[16px] mt-5"
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
            Let the community know you can be trusted for care and advice, and that you're ready to help any pet in need.
            <br />Trust starts with you.
          </p>
        </div>

        {/* Spacer: ensures 2-button CTA bar never overlaps content */}
        <div className="h-[calc(env(safe-area-inset-bottom,0px)+72px)]" aria-hidden="true" />
      </SignupShell>

      {/* Skip confirmation dialog */}
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
            >
              Yes, skip verification
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignupVerify;
