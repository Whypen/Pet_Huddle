/**
 * SignupVerifyEmail — /signup/verify-email
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postPublicFunction } from "@/lib/publicFunctionClient";
import { useSignup } from "@/contexts/SignupContext";
import { useAuth } from "@/contexts/AuthContext";
import { NeuButton } from "@/components/ui/NeuButton";
import { SignupShell } from "@/components/signup/SignupShell";
import { loadSignupDraft } from "@/lib/signupOnboarding";
import { launchEmailInboxBestEffort } from "@/lib/emailInboxLauncher";

const PRESIGNUP_TOKEN_KEY = "huddle_presignup_token";
const PRESIGNUP_EMAIL_KEY = "huddle_presignup_email";
const SIGNUP_TURNSTILE_TOKEN_KEY = "huddle_signup_turnstile_token";
const LEGACY_PRESIGNUP_CREDENTIALS_TURNSTILE_KEY = "huddle_presignup_turnstile_token";
const RESEND_COOLDOWN_SECS = 60;
const POLL_INTERVAL_MS = 3_000;
type SendState = "idle" | "sending" | "sent" | "error";
type VerifyRouteState = {
  expired?: boolean;
  invalid_link?: boolean;
  email?: string;
  from_credentials?: boolean;
  from_setprofile?: boolean;
} | null;
type VerifyStatusResponse = {
  verified?: boolean;
  expired?: boolean;
  signup_proof?: string | null;
  signup_proof_expires_at?: string | null;
  email?: string | null;
  token?: string | null;
  auth_confirmed?: boolean;
  confirmation_mode?: "presignup" | "auth" | null;
};
type SendVerifyResponse = {
  ok?: boolean;
  token?: string | null;
  email?: string | null;
  reused?: boolean;
  email_sent?: boolean;
};

type StatusOutcome = "verified" | "auth_confirmed" | "pending" | "expired" | "missing" | "error";

const SignupVerifyEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, setFlowState, update } = useSignup();
  const { signIn } = useAuth();
  const incomingState = location.state as VerifyRouteState;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryEmail = String(searchParams.get("email") || "").trim().toLowerCase();
  const queryConfirmed = searchParams.get("confirmed") === "1";

  const draftEmail = data.email?.trim().toLowerCase() ?? "";
  const incomingExpired = incomingState?.expired === true;
  const incomingInvalid = incomingState?.invalid_link === true;
  const incomingFromCredentials = incomingState?.from_credentials === true;
  const incomingFromSetProfile = incomingState?.from_setprofile === true;
  const incomingEmail = String(incomingState?.email || "").trim().toLowerCase();

  const [token, setToken] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);
  const [manualCheck, setManualCheck] = useState<"idle" | "checking" | "not_yet">("idle");
  const [isExiting, setIsExiting] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [lastSendSentEmail, setLastSendSentEmail] = useState<boolean | null>(null);

  const sendInFlight = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSendStarted = useRef(false);
  const credentialEntryHandled = useRef(false);
  const statusInFlight = useRef(false);
  const recoveryInFlight = useRef(false);

  const readTurnstileToken = useCallback(() => {
    return String(
      sessionStorage.getItem(SIGNUP_TURNSTILE_TOKEN_KEY) ||
      sessionStorage.getItem(LEGACY_PRESIGNUP_CREDENTIALS_TURNSTILE_KEY) ||
      "",
    ).trim();
  }, []);

  const readStoredPresignupToken = useCallback((email: string) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return "";
    try {
      const storedToken = String(sessionStorage.getItem(PRESIGNUP_TOKEN_KEY) || "").trim();
      const storedEmail = String(sessionStorage.getItem(PRESIGNUP_EMAIL_KEY) || "").trim().toLowerCase();
      if (storedToken && storedEmail === normalizedEmail) return storedToken;
    } catch {
      // best-effort storage read only
    }
    return "";
  }, []);

  const persistPresignupIdentity = useCallback((nextToken: string, nextEmail: string) => {
    const normalizedToken = String(nextToken || "").trim();
    const normalizedEmail = String(nextEmail || "").trim().toLowerCase();
    if (!normalizedToken || !normalizedEmail) return;
    try {
      sessionStorage.setItem(PRESIGNUP_TOKEN_KEY, normalizedToken);
      sessionStorage.setItem(PRESIGNUP_EMAIL_KEY, normalizedEmail);
    } catch {
      // best-effort storage write only
    }
  }, []);

  const clearPresignupIdentity = useCallback(() => {
    try {
      sessionStorage.removeItem(PRESIGNUP_TOKEN_KEY);
      sessionStorage.removeItem(PRESIGNUP_EMAIL_KEY);
      sessionStorage.removeItem(SIGNUP_TURNSTILE_TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_PRESIGNUP_CREDENTIALS_TURNSTILE_KEY);
    } catch {
      // best-effort storage cleanup only
    }
  }, []);

  useEffect(() => {
    if (draftEmail) return;
    const fallbackEmail =
      queryEmail ||
      incomingEmail ||
      String(sessionStorage.getItem(PRESIGNUP_EMAIL_KEY) || "").trim().toLowerCase();
    if (!fallbackEmail) {
      navigate("/signup/credentials", { replace: true });
      return;
    }
    const restoredDraft = loadSignupDraft(fallbackEmail);
    if (restoredDraft) {
      update({
        ...(restoredDraft.data as Record<string, unknown>),
        email: String((restoredDraft.data as { email?: string }).email || fallbackEmail),
        password: restoredDraft.password || "",
        signup_proof: restoredDraft.signupProof || "",
      });
    } else {
      update({ email: fallbackEmail });
    }
    setFlowState("signup");
  }, [draftEmail, incomingEmail, navigate, queryEmail, setFlowState, update]);

  const applyResolvedStatus = useCallback((resp: VerifyStatusResponse | null | undefined): StatusOutcome => {
    const canonicalEmail = String(resp?.email || draftEmail || incomingEmail || "").trim().toLowerCase();
    const canonicalToken = String(resp?.token || "").trim();
    const signupProof = String(resp?.signup_proof || "").trim();

    if (resp?.auth_confirmed) {
      update({
        email: canonicalEmail || draftEmail,
        signup_proof: "",
      });
      setSendState("sent");
      return "auth_confirmed";
    }

    if (canonicalEmail && canonicalToken) {
      persistPresignupIdentity(canonicalToken, canonicalEmail);
      setToken(canonicalToken);
      setSendState("sent");
    } else if (!resp?.verified) {
      setToken("");
    }

    if (resp?.verified) {
      update({
        email: canonicalEmail || draftEmail,
        signup_proof: signupProof,
      });
      setVerified(true);
      setSendState("sent");
      return "verified";
    }

    if (resp?.expired) {
      clearPresignupIdentity();
      update({ signup_proof: "" });
      setToken("");
      setSendState("idle");
      return "expired";
    }

    if (canonicalToken) return "pending";
    clearPresignupIdentity();
    setSendState("idle");
    return "missing";
  }, [clearPresignupIdentity, draftEmail, incomingEmail, persistPresignupIdentity, update]);

  const proceedAfterVerification = useCallback(() => {
    setFlowState("signup");
    setIsExiting(true);
    setTimeout(() => navigate(incomingFromSetProfile ? "/set-profile" : "/signup/name"), 180);
  }, [incomingFromSetProfile, navigate, setFlowState]);

  // Auto-redirect as soon as verification is confirmed — no manual tap required.
  useEffect(() => {
    if (!verified) return;
    proceedAfterVerification();
  }, [verified, proceedAfterVerification]);

  const lookupStatus = useCallback(async (emailOverride?: string): Promise<StatusOutcome> => {
    const canonicalEmail = String(emailOverride || draftEmail || incomingEmail || "").trim().toLowerCase();
    if (!canonicalEmail || statusInFlight.current) return "error";
    statusInFlight.current = true;
    try {
      const storedToken = readStoredPresignupToken(canonicalEmail);
      const requestBody: { token?: string; email: string } = { email: canonicalEmail };
      if (storedToken) requestBody.token = storedToken;
      const { data: resp, error } = await supabase.functions.invoke("get-pre-signup-verify-status", {
        body: requestBody,
      });
      if (error) return "error";
      return applyResolvedStatus(resp as VerifyStatusResponse);
    } catch {
      return "error";
    } finally {
      statusInFlight.current = false;
    }
  }, [applyResolvedStatus, draftEmail, incomingEmail, readStoredPresignupToken]);

  const recoverConfirmedSignup = useCallback(async (manual = false): Promise<boolean> => {
    const canonicalEmail = String(draftEmail || queryEmail || incomingEmail || "").trim().toLowerCase();
    if (!canonicalEmail || recoveryInFlight.current) return false;

    recoveryInFlight.current = true;
    try {
      let outcome = await lookupStatus(canonicalEmail);
      if (outcome !== "verified" && outcome !== "auth_confirmed" && manual) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        outcome = await lookupStatus(canonicalEmail);
      }

      if (outcome === "verified") {
        proceedAfterVerification();
        return true;
      }

      if (outcome === "auth_confirmed") {
        const restoredDraft = loadSignupDraft(canonicalEmail);
        const password = String(data.password || restoredDraft?.password || "").trim();
        if (!password) {
          if (manual) toast.error("Please go back and re-enter your signup details.");
          return false;
        }

        setFlowState("signup");
        const result = await signIn(canonicalEmail, password);
        if (result.error) {
          if (manual) toast.error(result.error.message || "Could not continue sign up in this browser.");
          return false;
        }

        clearPresignupIdentity();
        update({
          ...(restoredDraft?.data as Record<string, unknown> | undefined),
          email: canonicalEmail,
          password,
          signup_proof: "",
        });
        proceedAfterVerification();
        return true;
      }

      return false;
    } finally {
      recoveryInFlight.current = false;
    }
  }, [clearPresignupIdentity, data.password, draftEmail, incomingEmail, lookupStatus, proceedAfterVerification, queryEmail, setFlowState, signIn, update]);

  const sendEmail = useCallback(async (forceNewToken = false) => {
    if (!draftEmail) return false;
    if (sendInFlight.current) return false;
    sendInFlight.current = true;
    setSendState("sending");
    update({ signup_proof: "" });

    try {
      const currentToken = readStoredPresignupToken(draftEmail);
      const turnstileToken = readTurnstileToken();
      if (!currentToken && !turnstileToken) {
        throw new Error("send_requires_active_signup");
      }
      const { data: resp, error } = await postPublicFunction<SendVerifyResponse>(
        "send-pre-signup-verify",
        {
          email: draftEmail,
          current_token: currentToken || undefined,
          turnstile_token: currentToken ? undefined : turnstileToken,
          force_new_token: forceNewToken,
        },
      );
      if (error || !resp?.ok) throw new Error("send_failed");

      const nextToken = String(resp?.token || "").trim();
      const nextEmail = String(resp?.email || draftEmail).trim().toLowerCase();
      setLastSendSentEmail(resp?.email_sent !== false);
      if (nextToken) {
        persistPresignupIdentity(nextToken, nextEmail);
        setToken(nextToken);
      }
      setSendState("sent");
      if (forceNewToken) {
        setCooldown(RESEND_COOLDOWN_SECS);
        toast.success("Verification email sent");
      }
      return true;
    } catch {
      setLastSendSentEmail(null);
      setSendState("error");
      return false;
    } finally {
      sendInFlight.current = false;
    }
  }, [draftEmail, persistPresignupIdentity, readStoredPresignupToken, readTurnstileToken, update]);

  useEffect(() => {
    autoSendStarted.current = false;
    setRecoveryReady(false);
    credentialEntryHandled.current = false;
  }, [draftEmail]);

  useEffect(() => {
    if (!incomingExpired && !incomingInvalid) return;
    clearPresignupIdentity();
    update({ signup_proof: "" });
    setToken("");
    setSendState("idle");
    setVerified(false);
    setLastSendSentEmail(null);
  }, [clearPresignupIdentity, incomingExpired, incomingInvalid, update]);

  useEffect(() => {
    if (!draftEmail) return;
    let cancelled = false;
    const recover = async () => {
      const recovered = await recoverConfirmedSignup(queryConfirmed);
      if (cancelled || recovered) return;
      setRecoveryReady(true);
    };
    void recover();
    return () => {
      cancelled = true;
    };
  }, [draftEmail, queryConfirmed, recoverConfirmedSignup]);

  useEffect(() => {
    if (!draftEmail && !queryEmail) return;
    const recheck = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void recoverConfirmedSignup(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [draftEmail, queryEmail, recoverConfirmedSignup]);

  useEffect(() => {
    if (!draftEmail || verified || incomingExpired || incomingInvalid) return;
    const storedToken = readStoredPresignupToken(draftEmail);
    const turnstileToken = readTurnstileToken();
    if (!storedToken && !turnstileToken) return;
    if (incomingFromCredentials && !credentialEntryHandled.current && sendState !== "sending") {
      credentialEntryHandled.current = true;
      autoSendStarted.current = true;
      void sendEmail(true);
      return;
    }
    if (!recoveryReady || token || sendState === "sending" || autoSendStarted.current) return;
    autoSendStarted.current = true;
    void sendEmail(false);
  }, [draftEmail, incomingExpired, incomingFromCredentials, incomingInvalid, readStoredPresignupToken, readTurnstileToken, recoveryReady, sendEmail, sendState, token, verified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1_000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (!draftEmail || verified) return;

    const poll = async () => {
      const outcome = await lookupStatus(draftEmail);
      if (outcome === "expired") {
        autoSendStarted.current = false;
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [draftEmail, lookupStatus, verified]);

  const handleResend = () => {
    if (cooldown > 0 || sendState === "sending") return;
    const currentToken = readStoredPresignupToken(draftEmail);
    const turnstileToken = readTurnstileToken();
    if (!currentToken && !turnstileToken) {
      toast.error("Please go back and restart email verification.");
      return;
    }
    autoSendStarted.current = true;
    void sendEmail(true);
  };

  const handleChangeEmail = () => {
    clearPresignupIdentity();
    update({ signup_proof: "" });
    navigate("/signup/credentials");
  };

  const handleManualContinue = async () => {
    if (verified || queryConfirmed) {
      const recovered = await recoverConfirmedSignup(true);
      if (recovered) return;
    }
    if (verified) {
      proceedAfterVerification();
      return;
    }
    setManualCheck("checking");
    const recovered = await recoverConfirmedSignup(true);
    if (recovered) {
      return;
    }
    setManualCheck("not_yet");
    setTimeout(() => setManualCheck("idle"), 3_000);
  };

  const handleOpenMail = async () => {
    const result = await launchEmailInboxBestEffort();
    if (!result.launched) {
      toast.message("Open your mail app manually.");
      return;
    }
    toast.message("If your mail app opened, return here after verifying.");
  };

  const showExpiredBanner = (incomingExpired || incomingInvalid) && sendState === "idle" && !token;
  const expiredCopy = incomingExpired
    ? "This link has expired for your protection. No worries — click below to send a new one."
    : "That verification link is no longer usable. Click below to send a fresh one.";
  const resendLabel = cooldown > 0
    ? `Resend link (${cooldown}s)`
    : sendState === "sending"
      ? "Sending…"
      : "Resend link";
  const resendDisabled =
    cooldown > 0 ||
    sendState === "sending" ||
    (!readStoredPresignupToken(draftEmail) && !readTurnstileToken());
  const manualLabel = manualCheck === "checking"
    ? "Checking…"
    : manualCheck === "not_yet"
      ? "Not verified yet"
      : verified
        ? "Verified - continue"
        : "I've verified, continue";
  const showOpenMail = useMemo(() => !showExpiredBanner && sendState !== "error", [showExpiredBanner, sendState]);
  const successCtaClass = verified ? "!bg-emerald-600 hover:!bg-emerald-700 !text-white border-emerald-700/30" : "";
  const successGhostClass = verified ? "!bg-emerald-600 hover:!bg-emerald-700 !text-white border-emerald-700/30" : "";

  return (
    <SignupShell
      step={3}
      onBack={incomingFromSetProfile ? () => navigate("/set-profile", { replace: true }) : handleChangeEmail}
      showStepCounter={!incomingFromSetProfile}
      isExiting={isExiting}
      cta={
        <div className="space-y-3">
          <NeuButton
            variant={verified ? "primary" : "ghost"}
            className={`w-full h-11 ${successGhostClass}`}
            disabled={resendDisabled}
            onClick={handleResend}
          >
            {resendLabel}
          </NeuButton>
          <NeuButton
            variant={verified ? "primary" : "ghost"}
            className={`w-full h-11 ${successGhostClass}`}
            disabled={manualCheck === "checking"}
            onClick={handleManualContinue}
          >
            {manualLabel}
          </NeuButton>
          <NeuButton
            variant={verified ? "primary" : "ghost"}
            className={`w-full h-11 ${verified ? successGhostClass : "text-[rgba(74,73,101,0.55)]"}`}
            onClick={handleChangeEmail}
          >
            Change email
          </NeuButton>
        </div>
      }
    >
      {sendState === "sending" && (
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw size={14} className="animate-spin text-primary" />
          <span className="text-[13px] text-[rgba(74,73,101,0.55)]">Sending…</span>
        </div>
      )}

      <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
        Verify your email
      </h1>

      {showExpiredBanner ? (
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
          {expiredCopy}
        </p>
      ) : sendState === "error" ? (
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
          We couldn't send a verification email. Check your connection and tap Resend.
        </p>
      ) : (
        <>
          <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
            {lastSendSentEmail === false
              ? <>A recent verification email is already active for <strong className="font-[600] text-[#424965]">{draftEmail}</strong>. Use that email or resend below.</>
              : <>We've sent a verification link to <strong className="font-[600] text-[#424965]">{draftEmail}</strong>. Check your inbox to continue.</>}
          </p>
          {showOpenMail ? (
            <NeuButton
              variant="primary"
              className={`w-full h-12 mt-6 ${successCtaClass}`}
              onClick={handleOpenMail}
            >
              <Mail size={16} className="mr-2" />
              Try opening Mail app
            </NeuButton>
          ) : null}
          <p className="text-[13px] text-[rgba(74,73,101,0.50)] mt-2">
            If nothing opens, open your mail app manually. Didn&apos;t get it? Check spam or resend below.
          </p>
        </>
      )}
    </SignupShell>
  );
};

export default SignupVerifyEmail;
