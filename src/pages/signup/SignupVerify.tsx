/**
 * SignupVerify — C.5  Step 4 of 4
 * Identity verification decision. Uses SignupShell for layout.
 * Two CTAs: "Start Verification" (primary) + "Skip for now" (ghost).
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import signupVerifyImg from "@/assets/Sign up/Signup_verify.png";
import { useSignup } from "@/contexts/SignupContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SignupShell } from "@/components/signup/SignupShell";
import {
  SETPET_PREFILL_KEY,
  SETPROFILE_PREFILL_KEY,
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_PENDING_VERIFICATION_KEY,
  SIGNUP_STORAGE_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/humanizeError";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNUP_VERIFY_RETURN_TO = "/set-profile";
const AUTH_UPSTREAM_DOWN_ERROR = "Verification service is temporarily unavailable. Please try again in a moment.";
const isAlreadyRegisteredError = (message: string) =>
  message.toLowerCase().includes("already") && message.toLowerCase().includes("registered");
// ─── Component ────────────────────────────────────────────────────────────────

const SignupVerify = () => {
  const navigate = useNavigate();
  const { data, update, setFlowState } = useSignup();
  const { user, signIn } = useAuth();
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);

  const goTo = (to: string) => {
    setIsExiting(true);
    setTimeout(() => navigate(to), 180);
  };

  useEffect(() => {
    let cancelled = false;
    const resolveVerificationState = async () => {
      if (!user?.id) {
        if (!cancelled) setVerificationSubmitted(false);
        return;
      }
      try {
        const { data: profileRow, error } = await supabase
          .from("profiles")
          .select("is_verified")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setVerificationSubmitted(false);
          return;
        }
        setVerificationSubmitted(profileRow?.is_verified === true);
      } catch {
        if (!cancelled) setVerificationSubmitted(false);
      }
    };
    void resolveVerificationState();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    setFlowState("signup");
  }, [setFlowState]);

  useEffect(() => {
    try {
      sessionStorage.removeItem("huddle_vi_status");
      sessionStorage.removeItem("signup_verify_submitted_v1");
      sessionStorage.removeItem("signup_verify_docs_submitted");
    } catch {
      // no-op
    }
  }, []);


  // ── Shared pre-flight validation (unchanged) ─────────────────────────────────

  const snapshotSetProfilePrefill = () => {
    try {
      const owner = normalizeStorageOwner(data.email || "");
      if (!owner) return;
      const key = buildScopedStorageKey(SETPROFILE_PREFILL_KEY, owner);
      localStorage.setItem(
        key,
        JSON.stringify({
          prefill_owner: owner,
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

  const clearScopedSignupDrafts = () => {
    try {
      const owner = normalizeStorageOwner(data.email || "");
      if (!owner) return;
      localStorage.removeItem(buildScopedStorageKey(SETPROFILE_PREFILL_KEY, owner));
      localStorage.removeItem(buildScopedStorageKey(SETPET_PREFILL_KEY, owner));
      localStorage.removeItem(buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner));
      sessionStorage.removeItem(buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, owner));
      sessionStorage.removeItem(buildScopedStorageKey(SIGNUP_PENDING_VERIFICATION_KEY, owner));
      sessionStorage.removeItem("huddle_vi_status");
      sessionStorage.removeItem("signup_verify_submitted_v1");
      sessionStorage.removeItem("signup_verify_docs_submitted");
    } catch {
      // no-op
    }
  };

  // ── Start verification (unchanged) ──────────────────────────────────────────

  const startVerificationSignup = async () => {
    setLoading(true);
    try {
      let activeUser = (await supabase.auth.getSession()).data.session?.user ?? null;

      if (!activeUser) {
        const email = (data.email || "").trim();
        const password = data.password || "";
        if (!email || !password) {
          toast.error("Please complete signup details first.");
          navigate("/signup/credentials");
          return;
        }

        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: data.display_name || "",
              social_id: data.social_id || "",
              phone: data.phone || "",
              dob: data.dob || "",
            },
          },
        });
        if (signupError && !isAlreadyRegisteredError(signupError.message || "")) {
          throw signupError;
        }

        activeUser = (await supabase.auth.getSession()).data.session?.user ?? null;
        if (!activeUser) {
          const signInResult = await signIn(email, password);
          if (signInResult.error) throw signInResult.error;
          if (signInResult.mfaRequired) {
            throw new Error("Please complete sign-in verification on the login screen, then continue.");
          }
          activeUser = (await supabase.auth.getSession()).data.session?.user ?? null;
        }

        if (!activeUser) {
          throw new Error("Please verify your email, then sign in to continue.");
        }
      }

      setFlowState("verify_identity");
      snapshotSetProfilePrefill();
      navigate("/verify-identity", {
        state: {
          returnTo: SIGNUP_VERIFY_RETURN_TO,
          backTo: "/signup/verify",
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "We couldn't start verification.";
      toast.error(message || "We couldn't start verification.");
    } finally {
      setLoading(false);
    }
  };

  const ensureAccountAndGoSetProfile = async () => {
    try {
      clearScopedSignupDrafts();
      setFlowState("signup");
      snapshotSetProfilePrefill();
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
    await ensureAccountAndGoSetProfile();
  };

  // ── Skip verification (unchanged) ───────────────────────────────────────────

  const skipVerificationSignup = async () => {
    await ensureAccountAndGoSetProfile();
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
              type="button"
              disabled={loading}
              onClick={() => void startVerificationSignup()}
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

        <div className="mt-5 space-y-3">
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
              Let the community know you can be trusted for care and advice, and that you're ready to help any pet in need.
              <br />Trust starts with you.
            </p>
          </div>
        </div>
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
