/**
 * SignupVerifyEmail — /signup/verify-email
 *
 * "Check your inbox" waiting page shown after /signup/credentials.
 * The user is NOT a registered auth user yet — they are a draft in SignupContext.
 *
 * Responsibilities:
 *  - On first entry: wait for Turnstile → generate UUID token → call send-pre-signup-verify → store token
 *  - On refresh/back: detect existing valid token for same email — do NOT resend
 *  - Poll get-pre-signup-verify-status every 3s → navigate to /signup/name on verified
 *  - Resend: explicit only, new token, 60s cooldown, requires Turnstile token
 *  - Change email: clear token → navigate to /signup/credentials
 *  - "I've verified": manual poll → navigate or show "not yet" feedback
 *  - Receives state from /verify: { expired: true } or is used fresh from /signup/credentials
 *
 * Copy:
 *  - expired state: "This link has expired for your protection. No worries—click below to send a new one."
 *  - invalid link: same as expired (user is already redirected to /signup/credentials for truly invalid)
 *  - no raw auth or DB errors surfaced
 *
 * Old /signup/verify-email?token= links (from legacy presignup emails):
 *  - They arrive here but ?token= is ignored — the page shows the waiting UI benignly
 *  - User can use Resend to get a fresh /verify?token= link
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postPublicFunction } from "@/lib/publicFunctionClient";
import { useSignup } from "@/contexts/SignupContext";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { NeuButton } from "@/components/ui/NeuButton";
import { SignupShell } from "@/components/signup/SignupShell";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESIGNUP_TOKEN_KEY  = "huddle_presignup_token";
const PRESIGNUP_EMAIL_KEY  = "huddle_presignup_email";
const PRESIGNUP_CREDENTIALS_TURNSTILE_KEY = "huddle_presignup_turnstile_token";
const RESEND_COOLDOWN_SECS = 60;
const POLL_INTERVAL_MS     = 3_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type SendState = "idle" | "sending" | "sent" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

const SignupVerifyEmail = () => {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { data, setFlowState } = useSignup();
  const presignupTurnstile = useTurnstile("send_pre_signup_verify");

  // Redirect to credentials if there's no draft email in context
  const draftEmail = data.email?.trim() ?? "";

  const incomingExpired = (location.state as { expired?: boolean } | null)?.expired === true;

  // ── Token state ──────────────────────────────────────────────────────────────
  // Initialise from sessionStorage if the stored email matches the current draft.
  // This prevents duplicate sends on refresh/back navigation.
  const [token, setToken] = useState<string>(() => {
    try {
      const storedToken = sessionStorage.getItem(PRESIGNUP_TOKEN_KEY);
      const storedEmail = sessionStorage.getItem(PRESIGNUP_EMAIL_KEY);
      if (storedToken && storedEmail === draftEmail && draftEmail) return storedToken;
    } catch { /* best-effort */ }
    return "";
  });

  const [sendState,   setSendState]   = useState<SendState>("idle");
  const [cooldown,    setCooldown]    = useState(0);
  const [verified,    setVerified]    = useState(false);
  const [manualCheck, setManualCheck] = useState<"idle" | "checking" | "not_yet">("idle");
  const [isExiting,   setIsExiting]   = useState(false);

  const sendInFlight = useRef(false);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  const readTurnstileToken = useCallback(() => {
    const fromCredentials = String(
      sessionStorage.getItem(PRESIGNUP_CREDENTIALS_TURNSTILE_KEY) || "",
    ).trim();
    if (fromCredentials) return fromCredentials;
    const maybeGetToken = (presignupTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String(presignupTurnstile.token || "").trim();
  }, [presignupTurnstile]);

  // ── Guard: no draft email → back to credentials ──────────────────────────────
  useEffect(() => {
    if (!draftEmail) {
      navigate("/signup/credentials", { replace: true });
    }
  }, [draftEmail, navigate]);

  // ── Send verification email ───────────────────────────────────────────────────
  // Takes the current Turnstile token as a parameter so the callback stays stable.
  const sendEmail = useCallback(async (turnstileToken: string, forceNewToken = false) => {
    if (!draftEmail || !turnstileToken) return;
    if (sendInFlight.current) return;
    sendInFlight.current = true;
    setSendState("sending");

    const newToken = crypto.randomUUID();
    try {
      const { data: resp, error } = await postPublicFunction<{ ok?: boolean }>(
        "send-pre-signup-verify",
        { email: draftEmail, token: newToken, turnstile_token: turnstileToken },
      );
      presignupTurnstile.reset();
      if (error || !resp?.ok) throw new Error("send_failed");
      sessionStorage.removeItem(PRESIGNUP_CREDENTIALS_TURNSTILE_KEY);

      // Persist token scoped to this draft email
      try {
        sessionStorage.setItem(PRESIGNUP_TOKEN_KEY, newToken);
        sessionStorage.setItem(PRESIGNUP_EMAIL_KEY, draftEmail);
      } catch { /* best-effort */ }

      setToken(newToken);
      setSendState("sent");
      if (forceNewToken) {
        // Resend: start cooldown
        setCooldown(RESEND_COOLDOWN_SECS);
        toast.success("Verification email sent");
      }
    } catch {
      setSendState("error");
    } finally {
      sendInFlight.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftEmail]);

  // ── On expired state from /verify: clear stale token, show expired copy ──────
  useEffect(() => {
    if (!incomingExpired) return;
    // Clear the stale token so resend works cleanly
    try {
      sessionStorage.removeItem(PRESIGNUP_TOKEN_KEY);
      sessionStorage.removeItem(PRESIGNUP_EMAIL_KEY);
      sessionStorage.removeItem(PRESIGNUP_CREDENTIALS_TURNSTILE_KEY);
    } catch { /* best-effort */ }
    setToken("");
    setSendState("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On mount: send email only if no valid token exists AND Turnstile is ready ─
  // Fires whenever presignupTurnstile.token becomes available; the ref guards
  // against sending more than once per page visit.
  const initialSendDone = useRef(false);
  useEffect(() => {
    if (!draftEmail) return;
    if (token) {
      // Valid token already stored for this email — do not re-send
      if (!initialSendDone.current) {
        initialSendDone.current = true;
        setSendState("sent");
      }
      return;
    }
    const turnstileToken = readTurnstileToken();
    if (!turnstileToken) return; // wait for Turnstile to complete
    if (initialSendDone.current) return;
    initialSendDone.current = true;
    void sendEmail(turnstileToken, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftEmail, presignupTurnstile.token, readTurnstileToken]);

  // ── Cooldown countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1_000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // ── Poll for verification status ─────────────────────────────────────────────
  useEffect(() => {
    if (!token || verified) return;

    const poll = async () => {
      try {
        const { data: resp, error } = await supabase.functions.invoke(
          "get-pre-signup-verify-status",
          { body: { token } },
        );
        if (error) return;
        if (resp?.verified) setVerified(true);
        if (resp?.expired) {
          // Token expired while polling — prompt resend
          try {
            sessionStorage.removeItem(PRESIGNUP_TOKEN_KEY);
            sessionStorage.removeItem(PRESIGNUP_EMAIL_KEY);
          } catch { /* best-effort */ }
          setToken("");
          setSendState("idle");
        }
      } catch { /* silent poll failure — retry on next tick */ }
    };

    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, verified]);

  // ── Navigate on verified (poll detected it) ──────────────────────────────────
  useEffect(() => {
    if (!verified) return;
    setFlowState("signup");
    setIsExiting(true);
    setTimeout(() => navigate("/signup/name"), 180);
  }, [verified, navigate, setFlowState]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleResend = () => {
    if (cooldown > 0 || sendState === "sending") return;
    const turnstileToken = readTurnstileToken();
    if (!turnstileToken) {
      toast.error("Complete human verification first.");
      return;
    }
    void sendEmail(turnstileToken, true);
  };

  const handleChangeEmail = () => {
    try {
      sessionStorage.removeItem(PRESIGNUP_TOKEN_KEY);
      sessionStorage.removeItem(PRESIGNUP_EMAIL_KEY);
      sessionStorage.removeItem(PRESIGNUP_CREDENTIALS_TURNSTILE_KEY);
    } catch { /* best-effort */ }
    navigate("/signup/credentials");
  };

  const handleManualContinue = async () => {
    if (!token) {
      // No token yet — ask them to resend first
      toast.message("Send a verification link first, then click the link in your email.");
      return;
    }
    setManualCheck("checking");
    try {
      const { data: resp, error } = await supabase.functions.invoke(
        "get-pre-signup-verify-status",
        { body: { token } },
      );
      if (!error && resp?.verified) {
        setVerified(true); // triggers navigation via effect above
        return;
      }
      setManualCheck("not_yet");
      setTimeout(() => setManualCheck("idle"), 3_000);
    } catch {
      setManualCheck("not_yet");
      setTimeout(() => setManualCheck("idle"), 3_000);
    }
  };

  const handleOpenMail = () => {
    const inboxUrl = "https://mail.google.com/mail/u/0/#inbox";
    const opened = window.open(inboxUrl, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(inboxUrl);
  };

  // ── Derived display ───────────────────────────────────────────────────────────

  const showExpiredBanner = incomingExpired && sendState === "idle" && !token;
  const hiddenTurnstileRequired = !readTurnstileToken();
  const resendLabel = cooldown > 0
    ? `Resend link (${cooldown}s)`
    : sendState === "sending"
      ? "Sending…"
      : "Resend link";
  const resendDisabled = cooldown > 0 || sendState === "sending" || !readTurnstileToken();
  const manualLabel = manualCheck === "checking"
    ? "Checking…"
    : manualCheck === "not_yet"
      ? "Not verified yet"
      : "I've verified, continue";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SignupShell
      step={3}
      onBack={handleChangeEmail}
      isExiting={isExiting}
      cta={
        <div className="space-y-3">
          <NeuButton
            variant="secondary"
            className="w-full h-12"
            onClick={handleOpenMail}
          >
            <Mail size={16} className="mr-2" />
            Open Mail
          </NeuButton>
          {hiddenTurnstileRequired ? (
            <div
              data-testid="signup-verify-email-turnstile-hidden"
              className="h-0 overflow-hidden opacity-0 pointer-events-none"
              aria-hidden="true"
            >
              <TurnstileWidget
                siteKeyMissing={presignupTurnstile.siteKeyMissing}
                setContainer={presignupTurnstile.setContainer}
                className="min-h-[65px]"
              />
            </div>
          ) : null}
          <NeuButton
            variant="ghost"
            className="w-full h-11"
            disabled={resendDisabled}
            onClick={handleResend}
          >
            {resendLabel}
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11"
            disabled={manualCheck === "checking"}
            onClick={handleManualContinue}
          >
            {manualLabel}
          </NeuButton>
          <NeuButton
            variant="ghost"
            className="w-full h-11 text-[rgba(74,73,101,0.55)]"
            onClick={handleChangeEmail}
          >
            Change email
          </NeuButton>
        </div>
      }
    >
      {/* Sending spinner */}
      {sendState === "sending" && (
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw size={14} className="animate-spin text-primary" />
          <span className="text-[13px] text-[rgba(74,73,101,0.55)]">Sending…</span>
        </div>
      )}

      {/* Headline */}
      <h1 className="text-[28px] font-[600] leading-[1.1] tracking-[-0.02em] text-[#424965]">
        Verify your email
      </h1>

      {/* Expired banner */}
      {showExpiredBanner ? (
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
          This link has expired for your protection. No worries — click below to send a new one.
        </p>
      ) : sendState === "error" ? (
        <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
          We couldn't send a verification email. Check your connection and tap Resend.
        </p>
      ) : (
        <>
          <p className="text-[15px] text-[rgba(74,73,101,0.70)] leading-relaxed mt-3">
            We've sent a verification link to{" "}
            <strong className="font-[600] text-[#424965]">{draftEmail}</strong>.
            Check your inbox to continue.
          </p>
          <p className="text-[13px] text-[rgba(74,73,101,0.50)] mt-2">
            Didn't get it? Check spam or resend below.
          </p>
        </>
      )}
    </SignupShell>
  );
};

export default SignupVerifyEmail;
