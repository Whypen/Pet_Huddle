import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BadgeCheck, UserRound, CreditCard, Loader2, Phone } from "lucide-react";
import {
  loadStripe,
  type Stripe,
  type StripeElements,
  type StripeCardNumberElement,
  type StripeCardExpiryElement,
  type StripeCardCvcElement,
} from "@stripe/stripe-js";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/layouts/PageHeader";
import { InsetPanel, InsetDivider } from "@/components/ui/InsetPanel";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import verifyIllustration from "@/assets/Sign up/Verify_1.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { trackDeviceFingerprint } from "@/lib/deviceFingerprint";
import {
  prewarmHumanVerificationEngine,
  runHumanVerificationChallenge,
  type HumanChallenge,
} from "@/lib/humanVerification";
import {
  completeHumanChallenge,
  createCardSetupIntent,
  fetchCardStatus,
  fetchVerifyIdentitySnapshot,
  startHumanChallenge,
  type BackendVerificationStatus,
  type BlockedIdentityState,
} from "@/lib/verifyIdentityApi";
import { supabase } from "@/integrations/supabase/client";
import { useSignup } from "@/contexts/SignupContext";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/phoneOtp";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileDebugPanel, TurnstileWidget } from "@/components/security/TurnstileWidget";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { isPhoneCountryAllowed } from "@/config/allowedSmsCountries";
import { HelpSupportDialog } from "@/components/support/HelpSupportDialog";

type HumanVerificationState =
  | "idle" | "ready" | "capturing" | "pending" | "passed" | "failed";

type CardVerificationState =
  | "idle" | "collecting" | "submitting" | "pending" | "passed" | "failed";

type OverallVerificationStatus =
  | "unverified" | "pending" | "verified";

type PhoneVerificationState =
  | "idle" | "sent" | "verified" | "failed" | "unavailable";

const GENERIC_CARD_ERROR_MESSAGE = "Card verification could not be completed. Please try again.";

interface VerifyIdentityProps {
  humanVerificationState: HumanVerificationState;
  cardVerificationState: CardVerificationState;
  overallVerificationStatus: OverallVerificationStatus;
  onStartHumanVerification: () => void;
  onBeginCapture: () => void;
  onRetryHuman: () => void;
  onAddCard: () => void;
  onRetryCard: () => void;
  onSubmitCard?: () => void;
  cardFormVisible?: boolean;
  cardNumberContainerId?: string;
  cardExpiryContainerId?: string;
  cardCvcContainerId?: string;
  legalName?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  humanErrorMessage?: string | null;
  cardErrorMessage?: string | null;
}

function OverallStatusChip({ status }: { status: OverallVerificationStatus }) {
  if (status === "verified") {
    return (
      <NeuChip
        as="span"
        active
        className="pointer-events-none flex items-center gap-1"
      >
        <BadgeCheck size={12} aria-hidden />
        Verified
      </NeuChip>
    );
  }
  if (status === "pending") {
    return (
      <NeuChip as="span" className="pointer-events-none">
        Pending
      </NeuChip>
    );
  }
  return (
    <NeuChip as="span" className="pointer-events-none">
      Unverified
    </NeuChip>
  );
}

function HumanStatusBadge({ state }: { state: HumanVerificationState }) {
  if (state === "idle") return null;
  if (state === "passed") {
    return (
      <span className="text-[11px] font-semibold text-[var(--color-success,#22C55E)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded-full">
        Complete
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="text-[11px] font-semibold text-[var(--color-error,#E84545)] bg-[rgba(232,69,69,0.08)] px-2 py-0.5 rounded-full">
        Action needed
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[rgba(163,168,190,0.16)] px-2 py-0.5 rounded-full">
        Pending
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[rgba(163,168,190,0.16)] px-2 py-0.5 rounded-full">
      In progress
    </span>
  );
}

function CardStatusBadge({ state }: { state: CardVerificationState }) {
  if (state === "idle") return null;
  if (state === "passed") {
    return (
      <span className="text-[11px] font-semibold text-[var(--color-success,#22C55E)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded-full">
        Complete
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="text-[11px] font-semibold text-[var(--color-error,#E84545)] bg-[rgba(232,69,69,0.08)] px-2 py-0.5 rounded-full">
        Action needed
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[rgba(163,168,190,0.16)] px-2 py-0.5 rounded-full">
        Pending
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[rgba(163,168,190,0.16)] px-2 py-0.5 rounded-full">
      In progress
    </span>
  );
}

const IS_DEV = import.meta.env.PROD === false;
const OTP_COUNTDOWN_SECONDS = 60;
const maskPhoneForOtpNotice = (phone: string): string => {
  const trimmed = String(phone || "").trim();
  if (!trimmed.startsWith("+")) return "••••";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "••••";
  const countryLen = digits.length <= 10 ? Math.max(1, digits.length - 4) : Math.max(1, digits.length - 8);
  const country = digits.slice(0, countryLen);
  const last4 = digits.slice(-4).padStart(4, "•");
  return `+${country} •••• ${last4}`;
};

interface PhoneVerificationCardProps {
  state: PhoneVerificationState;
  isOpen: boolean;
  onToggle: () => void;
  phone: string;
  otpCode: string;
  onPhoneChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  loading: boolean;
  tokenReady?: boolean;
  errorMessage?: string | null;
  turnstileSlot?: React.ReactNode;
  unavailable?: boolean;
  maskedPhoneHint?: string | null;
}

function PhoneVerificationCard({
  state,
  isOpen,
  onToggle,
  phone,
  otpCode,
  onPhoneChange,
  onOtpChange,
  onSendOtp,
  onVerifyOtp,
  loading,
  tokenReady = false,
  errorMessage,
  turnstileSlot,
  unavailable = false,
  maskedPhoneHint = null,
}: PhoneVerificationCardProps) {
  const isVerified = state === "verified";
  const isUnavailable = state === "unavailable" || unavailable;
  const otpSent = state === "sent" || state === "failed";

  // Countdown timer
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(OTP_COUNTDOWN_SECONDS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (state === "sent") startCountdown();
  }, [state, startCountdown]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const canResend = countdown === 0 && !loading && tokenReady && !isUnavailable;
  const sendLabel = useMemo(() => {
    if (loading && !otpSent) return "Sending…";
    if (countdown > 0) return `Resend in ${countdown}s`;
    return otpSent ? "Resend" : "Send OTP";
  }, [loading, otpSent, countdown]);

  const handleSend = useCallback(() => {
    if (loading || countdown > 0 || !tokenReady || isUnavailable) return;
    onSendOtp();
  }, [loading, countdown, isUnavailable, onSendOtp, tokenReady]);

  return (
    <InsetPanel>
      <button
        type="button"
        disabled={isVerified || isUnavailable}
        onClick={(isVerified || isUnavailable) ? undefined : onToggle}
        aria-expanded={!isVerified && !isUnavailable && isOpen}
        aria-controls="phone-verification-panel"
        className={cn(
          "flex items-center gap-3 w-full px-4 py-3.5 min-h-[52px] text-left",
          (isVerified || isUnavailable)
            ? "cursor-default"
            : "cursor-pointer active:bg-[rgba(255,255,255,0.55)] transition-[background] duration-100",
        )}
      >
        <Phone
          size={16}
          strokeWidth={1.75}
          className={cn(
            "shrink-0",
            isVerified
              ? "text-[var(--color-success,#22C55E)]"
              : isUnavailable
                ? "text-[var(--text-tertiary)]"
                : "text-[var(--text-secondary)]",
          )}
        />
        <span className="flex-1 text-[15px] font-medium text-[var(--text-primary,#424965)]">
          Verify with phone number
        </span>
        {isVerified ? (
          <span className="text-[11px] font-semibold text-[var(--color-success,#22C55E)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded-full">
            Complete
          </span>
        ) : isUnavailable ? (
          <span className="text-[11px] font-semibold text-[var(--text-tertiary)] bg-[rgba(163,168,190,0.16)] px-2 py-0.5 rounded-full">
            Unavailable
          </span>
        ) : null}
      </button>

      {isOpen && !isVerified && !isUnavailable && (
        <>
          <InsetDivider />
          <div id="phone-verification-panel" className="px-4 py-4 flex flex-col gap-3">
            {/* Phone input */}
            <div className="space-y-1.5">
              <p className="text-[13px] text-[var(--text-secondary)]">Mobile number</p>
              <div className="form-field-rest relative flex items-center">
                <Phone className="absolute left-4 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none z-10" />
                <PhoneInput
                  international
                  value={phone}
                  onChange={(value) => onPhoneChange(value || "")}
                  disabled={loading}
                  className="w-full pl-10 [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none"
                  inputStyle={{
                    width: "100%",
                    height: "100%",
                    fontSize: "15px",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary, #424965)",
                  }}
                />
              </div>
            </div>
            <p className="text-[12px] text-[var(--text-tertiary)]">
              Standard SMS rates may apply.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-[var(--text-secondary)]">Verification code</p>
                {countdown > 0 ? (
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    Resend in {countdown}s
                  </span>
                ) : null}
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                disabled={!otpSent}
                className="w-full h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white px-3 text-[15px] text-[var(--text-primary,#424965)] outline-none focus:border-brandBlue tracking-[0.2em] disabled:bg-[rgba(248,249,255,0.85)] disabled:text-[var(--text-tertiary)]"
                autoComplete="one-time-code"
              />
              {!otpSent ? (
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  Request an OTP first, then enter the 6-digit code here.
                </p>
              ) : null}
            </div>

            {turnstileSlot}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || countdown > 0 || !tokenReady}
                className={cn(
                  "h-[38px] rounded-[10px] px-4 text-[13px] font-semibold transition-colors",
                  canResend || !otpSent
                    ? "bg-brandBlue text-white active:opacity-80"
                    : "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
                )}
              >
                {sendLabel}
              </button>
              <button
                type="button"
                onClick={onVerifyOtp}
                disabled={loading || !otpSent || otpCode.length < 6}
                className={cn(
                  "h-[38px] rounded-[10px] px-4 text-[13px] font-semibold transition-colors",
                  !loading && otpSent && otpCode.length >= 6
                    ? "bg-brandBlue text-white active:opacity-80"
                    : "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
                )}
              >
                {loading && otpSent ? "Verifying…" : "Verify code"}
              </button>
            </div>

            {errorMessage ? (
              <p className="text-[12px] text-[var(--color-error,#E84545)]">{errorMessage}</p>
            ) : null}
            {otpSent && maskedPhoneHint ? (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Code sent to {maskedPhoneHint}
              </p>
            ) : null}
          </div>
        </>
      )}
      {isUnavailable ? (
        <>
          <InsetDivider />
          <div className="px-4 py-3.5">
            <p className="text-[13px] text-[var(--text-tertiary)]">
              {errorMessage || "Phone verification is temporarily unavailable."}
            </p>
          </div>
        </>
      ) : null}
    </InsetPanel>
  );
}

interface HumanVerificationCardProps {
  state: HumanVerificationState;
  isOpen: boolean;
  onToggle: () => void;
  onStartHumanVerification: () => void;
  onBeginCapture: () => void;
  onRetryHuman: () => void;
  errorMessage?: string | null;
  challengeInstruction?: string | null;
  previewVideoRef?: React.RefObject<HTMLVideoElement>;
  hasLivePreview?: boolean;
}

function HumanVerificationCard({
  state,
  isOpen,
  onToggle,
  onStartHumanVerification,
  onBeginCapture,
  onRetryHuman,
  errorMessage,
  challengeInstruction,
  previewVideoRef,
  hasLivePreview,
}: HumanVerificationCardProps) {
  const isPassed = state === "passed";

  return (
    <InsetPanel>
      <button
        type="button"
        disabled={isPassed}
        onClick={isPassed ? undefined : onToggle}
        aria-expanded={!isPassed && isOpen}
        aria-controls="human-verification-panel"
        className={cn(
          "flex items-center gap-3 w-full px-4 py-3.5 min-h-[52px] text-left",
          isPassed
            ? "cursor-default"
            : "cursor-pointer active:bg-[rgba(255,255,255,0.55)] transition-[background] duration-100",
        )}
      >
        <UserRound
          size={16}
          strokeWidth={1.75}
          className={cn(
            "shrink-0",
            isPassed ? "text-[var(--color-success,#22C55E)]" : "text-[var(--text-secondary)]",
          )}
        />
        <span className="flex-1 text-[15px] font-medium text-[var(--text-primary,#424965)]">
          Verify You&apos;re Human
        </span>
        <HumanStatusBadge state={state} />
      </button>

      {isOpen && !isPassed && (
        <>
          <InsetDivider />
          <div id="human-verification-panel" className="px-4 py-4 flex flex-col items-center gap-4">
            {state === "idle" && (
              <>
                <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed w-full">
                  A quick check to confirm you&apos;re a real person. Takes about 30 seconds.
                </p>
                <NeuControl size="lg" fullWidth onClick={onStartHumanVerification}>
                  Start Verification
                </NeuControl>
              </>
            )}

            {state === "ready" && (
              <>
                <div className="flex items-center justify-center">
                  <div className="w-[200px] h-[248px] rounded-full border-2 border-dashed border-[rgba(163,168,190,0.4)] flex items-center justify-center">
                    <UserRound
                      size={48}
                      strokeWidth={1.25}
                      className="text-[var(--text-tertiary)]"
                    />
                  </div>
                </div>
                <p className="text-[14px] text-[var(--text-secondary)] text-center">
                  Position your face in the oval
                </p>
                <NeuControl size="lg" fullWidth onClick={onBeginCapture}>
                  Begin
                </NeuControl>
              </>
            )}

            {state === "capturing" && (
              <>
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-[208px] h-[256px] rounded-full border-2 border-brandBlue animate-pulse pointer-events-none z-10" />
                  <div className="w-[200px] h-[248px] rounded-full border-2 border-brandBlue bg-[rgba(33,69,207,0.06)] overflow-hidden flex items-center justify-center">
                    {hasLivePreview && previewVideoRef ? (
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserRound
                        size={48}
                        strokeWidth={1.25}
                        className="text-brandBlue opacity-40"
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[15px] font-semibold text-[var(--text-primary,#424965)]">
                    {challengeInstruction || "Follow the on-screen instruction"}
                  </p>
                  <p className="text-[13px] text-[var(--text-tertiary)]">
                    Keep your face inside the oval until capture completes.
                  </p>
                </div>
              </>
            )}

            {state === "pending" && (
              <div className="glass-card rounded-[16px] px-4 py-4 w-full flex items-center gap-3">
                <Loader2
                  size={20}
                  strokeWidth={1.75}
                  className="animate-spin text-[var(--text-tertiary)] shrink-0"
                />
                <p className="text-[14px] text-[var(--text-secondary)] leading-snug">
                  We&apos;re reviewing your check. This usually takes a moment.
                </p>
              </div>
            )}

            {state === "failed" && (
              <>
                <div className="glass-card rounded-[16px] border border-[rgba(232,69,69,0.2)] px-4 py-4 w-full">
                  <p className="text-[14px] text-[var(--color-error,#E84545)] leading-snug">
                    {errorMessage || "Face verification failed. Keep your face centered in the oval and try again."}
                  </p>
                </div>
                <NeuControl size="lg" fullWidth onClick={onRetryHuman}>
                  Try Again
                </NeuControl>
              </>
            )}
          </div>
        </>
      )}
    </InsetPanel>
  );
}

interface CardVerificationCardProps {
  state: CardVerificationState;
  isOpen: boolean;
  onToggle: () => void;
  onAddCard: () => void;
  onRetryCard: () => void;
  onSubmitCard?: () => void;
  canSubmitCard?: boolean;
  cardReadyReason?: string | null;
  cardFieldsMounted?: boolean;
  cardFormVisible?: boolean;
  cardSubmitting?: boolean;
  cardNumberContainerId?: string;
  cardExpiryContainerId?: string;
  cardCvcContainerId?: string;
  legalName?: string;
  onLegalNameChange?: (value: string) => void;
  postalCode?: string;
  onPostalCodeChange?: (value: string) => void;
  verifiedLegalName?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  errorMessage?: string | null;
  blockedIdentity?: BlockedIdentityState;
  onOpenSupport?: () => void;
  onCheckPendingStatus?: () => void;
}

function CardVerificationCard({
  state,
  isOpen,
  onToggle,
  onAddCard,
  onRetryCard,
  onSubmitCard,
  canSubmitCard = false,
  cardReadyReason = null,
  cardFieldsMounted = false,
  cardFormVisible = false,
  cardSubmitting = false,
  cardNumberContainerId = "verify-card-number-element",
  cardExpiryContainerId = "verify-card-expiry-element",
  cardCvcContainerId = "verify-card-cvc-element",
  legalName = "",
  onLegalNameChange,
  postalCode = "",
  onPostalCodeChange,
  verifiedLegalName,
  cardBrand,
  cardLast4,
  errorMessage,
  blockedIdentity = { blocked: false, message: null },
  onOpenSupport,
  onCheckPendingStatus,
}: CardVerificationCardProps) {
  const isPassed = state === "passed";
  const showMountedForm = cardFormVisible;
  const showSubmitCta = showMountedForm && state !== "pending" && state !== "failed";

  return (
    <>
    <InsetPanel>
      <button
        type="button"
        disabled={isPassed}
        onClick={isPassed ? undefined : onToggle}
        aria-expanded={!isPassed && isOpen}
        aria-controls="card-verification-panel"
        className={cn(
          "flex items-center gap-3 w-full px-4 py-3.5 min-h-[52px] text-left",
          isPassed
            ? "cursor-default"
            : "cursor-pointer active:bg-[rgba(255,255,255,0.55)] transition-[background] duration-100",
        )}
      >
        <CreditCard
          size={16}
          strokeWidth={1.75}
          className={cn(
            "shrink-0",
            isPassed ? "text-[var(--color-success,#22C55E)]" : "text-[var(--text-secondary)]",
          )}
        />
        <span className="flex-1 text-[15px] font-medium text-[var(--text-primary,#424965)]">
          Verify with a Card
        </span>
        <CardStatusBadge state={state} />
      </button>

      {isPassed && (
        <>
          <InsetDivider />
          <div className="flex items-center gap-3 px-4 py-3.5">
            <CreditCard size={16} strokeWidth={1.75} className="text-[var(--color-success,#22C55E)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--text-primary,#424965)]">
                Legal Name: {verifiedLegalName || "Submitted with card"}
              </p>
              <p className="font-mono tracking-[0.08em] text-[15px] text-[var(--text-primary,#424965)]">
                &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; {cardLast4 || "••••"}
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                {cardBrand ? `${cardBrand.toUpperCase()} verified` : "Verified card"}
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Legal name is the billing name submitted with this card.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-success,#22C55E)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded-full shrink-0">
              Verified
            </span>
          </div>
        </>
      )}

      {isOpen && !isPassed && (
        <>
          <InsetDivider />
          <div id="card-verification-panel" className="px-4 py-4 flex flex-col items-center gap-4">
            {state === "idle" && (
              <>
                <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed w-full">
                  Add a card to confirm your identity. Your card won&apos;t be charged.
                </p>
                <NeuControl size="lg" fullWidth onClick={onAddCard}>
                  Add Card
                </NeuControl>
                <p className="text-[12px] text-[var(--text-tertiary)] text-center">
                  No charge.
                </p>
              </>
            )}

            {showMountedForm && (
              <>
                <div className="w-full rounded-[14px] bg-white/70 border border-white/70 px-3 py-3 space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-[13px] text-[var(--text-secondary)]">Legal name</p>
                    <input
                      value={legalName}
                      onChange={(event) => onLegalNameChange?.(event.target.value)}
                      placeholder="Name on card"
                      className="w-full h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white px-3 text-[15px] text-[var(--text-primary,#424965)] outline-none focus:border-brandBlue"
                      autoComplete="cc-name"
                    />
                    <p className="text-[12px] text-[var(--text-tertiary)]">
                      Enter the card billing name exactly as submitted with this card.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[13px] text-[var(--text-secondary)]">Card number</p>
                    <div className="min-h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white px-3 py-2">
                      <div id={cardNumberContainerId} className="min-h-[24px]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-[var(--text-secondary)]">Expiry (MM/YY)</p>
                      <div className="min-h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white px-3 py-2">
                        <div id={cardExpiryContainerId} className="min-h-[24px]" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-[var(--text-secondary)]">CVC</p>
                      <div className="min-h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white px-3 py-2">
                        <div id={cardCvcContainerId} className="min-h-[24px]" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[13px] text-[var(--text-secondary)]">Postal code (optional)</p>
                    <input
                      value={postalCode}
                      onChange={(event) => onPostalCodeChange?.(event.target.value)}
                      placeholder="Postal code"
                      className="w-full h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white px-3 text-[15px] text-[var(--text-primary,#424965)] outline-none focus:border-brandBlue"
                      inputMode="text"
                      autoComplete="postal-code"
                    />
                  </div>
                </div>
                {showSubmitCta ? (
                  <>
                    <NeuControl
                      size="lg"
                      fullWidth
                      onClick={onSubmitCard}
                      disabled={!canSubmitCard}
                      loading={cardSubmitting}
                    >
                      Verify now
                    </NeuControl>
                    <p className="text-[12px] text-[var(--text-tertiary)] text-center">
                      {canSubmitCard
                        ? "No charge."
                        : cardReadyReason || (cardFieldsMounted ? "Complete your card details to continue." : "Preparing secure card form...")}
                    </p>
                  </>
                ) : null}
              </>
            )}

            {state === "pending" && (
              <>
                <div className="glass-card rounded-[16px] px-4 py-4 w-full flex items-center gap-3">
                  <Loader2
                    size={20}
                    strokeWidth={1.75}
                    className="animate-spin text-[var(--text-tertiary)] shrink-0"
                  />
                  <p className="text-[14px] text-[var(--text-secondary)] leading-snug">
                    We&apos;re confirming your card. This only takes a moment.
                  </p>
                </div>
                <NeuControl size="lg" fullWidth onClick={onCheckPendingStatus}>
                  Check Status
                </NeuControl>
                {errorMessage && (
                  <p className="text-[12px] text-[var(--text-tertiary)] text-center">
                    {errorMessage}
                  </p>
                )}
              </>
            )}

            {state === "failed" && (
              <>
                <div className="glass-card rounded-[16px] border border-[rgba(232,69,69,0.2)] px-4 py-4 w-full">
                  <p className="text-[14px] text-[var(--color-error,#E84545)] leading-snug">
                    {errorMessage || GENERIC_CARD_ERROR_MESSAGE}
                  </p>
                  {blockedIdentity.blocked && onOpenSupport ? (
                    <button
                      type="button"
                      onClick={onOpenSupport}
                      className="mt-3 text-[13px] font-semibold text-brandBlue underline underline-offset-2"
                    >
                      Help &amp; Support
                    </button>
                  ) : null}
                </div>
                <NeuControl size="lg" fullWidth onClick={onRetryCard}>
                  Try a Different Card
                </NeuControl>
              </>
            )}
          </div>
        </>
      )}
    </InsetPanel>
    {!isPassed && (
      <p className="text-[12px] text-[rgba(74,73,101,0.55)] px-4 pt-2 pb-1 leading-relaxed">
        🔒 Instead of collecting your personal data, we use your bank&apos;s security checks to verify you&apos;re a real person. Your card details stay encrypted and masked — never stored, never charged.
      </p>
    )}
    </>
  );
}

const toHumanUiState = (status: string): HumanVerificationState => {
  switch (status) {
    case "pending":
      return "pending";
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
};

const toCardUiState = (status: string, isVerified: boolean): CardVerificationState => {
  if (isVerified || status === "passed") return "passed";
  switch (status) {
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
};

const describeHumanFailure = (
  resultPayload: Record<string, unknown> | undefined,
  challengeInstruction?: string | null,
): string => {
  const payload = resultPayload || {};
  const verifier = String(payload.verifier || "").toLowerCase();
  const reason = String(payload.reason || "").toLowerCase();
  const detectedFrames = Number(payload.detectedFrames ?? 0);
  const horizontalShift = Number(payload.horizontalShift ?? 0);
  const verticalShift = Number(payload.verticalShift ?? 0);
  const leftTravel = Number(payload.leftTravel ?? 0);
  const rightTravel = Number(payload.rightTravel ?? 0);
  const upTravel = Number(payload.upTravel ?? 0);
  const downTravel = Number(payload.downTravel ?? 0);
  const challengeType = String(payload.challengeType || "").toLowerCase();

  if (reason === "face_detector_unsupported" || reason === "mediapipe_unavailable") {
    return "We couldn't initialize face detection. Check camera permission and internet connection, then try again.";
  }
  if (reason === "face_not_stably_detected" || detectedFrames < 4) {
    return "We couldn't detect your face steadily. Keep your whole face inside the oval in a well-lit place.";
  }
  if (challengeType === "turn_left_right" && (leftTravel < 0.08 || rightTravel < 0.08 || horizontalShift < 0.25)) {
    return "Move your head left and right while staying inside the oval.";
  }
  if (challengeType === "look_up_down" && (upTravel < 0.07 || downTravel < 0.07 || verticalShift < 0.20)) {
    return "Move your head up and down while staying inside the oval.";
  }
  return challengeInstruction
    ? `Please try again and follow: ${challengeInstruction}.`
    : "Face verification failed. Keep your face centered in the oval and try again.";
};

export function VerifyIdentity({
  humanVerificationState: humanVerificationStateOverride,
  cardVerificationState: cardVerificationStateOverride,
  overallVerificationStatus: overallVerificationStatusOverride,
  onStartHumanVerification: onStartHumanVerificationOverride,
  onBeginCapture: onBeginCaptureOverride,
  onRetryHuman: onRetryHumanOverride,
  onAddCard: onAddCardOverride,
  onRetryCard: onRetryCardOverride,
  onSubmitCard: onSubmitCardOverride,
  cardFormVisible: cardFormVisibleOverride,
  cardNumberContainerId: cardNumberContainerIdOverride,
  cardExpiryContainerId: cardExpiryContainerIdOverride,
  cardCvcContainerId: cardCvcContainerIdOverride,
  cardBrand: cardBrandOverride,
  cardLast4: cardLast4Override,
  humanErrorMessage: humanErrorMessageOverride,
  cardErrorMessage: cardErrorMessageOverride,
}: Partial<VerifyIdentityProps> = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const { flowState, setFlowState, data: signupData } = useSignup();
  const showTurnstileDiag = useMemo(
    () => new URLSearchParams(location.search).get("turnstile_diag") === "1",
    [location.search],
  );

  const [activeCard, setActiveCard] = useState<"phone" | "human" | "card" | null>(null);
  const [humanVerificationState, setHumanVerificationState] = useState<HumanVerificationState>("idle");
  const [cardVerificationState, setCardVerificationState] = useState<CardVerificationState>("idle");
  const [overallVerificationStatus, setOverallVerificationStatus] = useState<OverallVerificationStatus>("unverified");
  const [isSignupVerifyEntry, setIsSignupVerifyEntry] = useState(false);
  const [phoneVerificationState, setPhoneVerificationState] = useState<PhoneVerificationState>("idle");
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneVerificationError, setPhoneVerificationError] = useState<string | null>(null);
  const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(false);
  const [phoneSentMaskedHint, setPhoneSentMaskedHint] = useState<string | null>(null);
  const phoneOtpTurnstile = useTurnstile("send_pre_signup_verify");
  const readPhoneOtpTurnstileToken = () => {
    const maybeGetToken = (phoneOtpTurnstile as { getToken?: unknown }).getToken;
    if (typeof maybeGetToken === "function") {
      return String((maybeGetToken as () => string)() || "").trim();
    }
    return String((phoneOtpTurnstile as { token?: string | null }).token || "").trim();
  };
  const phoneCountryUnavailable = Boolean(phoneValue.trim()) && !isPhoneCountryAllowed(phoneValue.trim());

  const [humanAttemptId, setHumanAttemptId] = useState<string | null>(null);
  const [humanChallenge, setHumanChallenge] = useState<HumanChallenge | null>(null);
  const [humanErrorMessage, setHumanErrorMessage] = useState<string | null>(null);
  const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
  const [cardLegalNameInput, setCardLegalNameInput] = useState("");
  const [verifiedLegalName, setVerifiedLegalName] = useState<string | null>(null);
  const [blockedIdentity, setBlockedIdentity] = useState<BlockedIdentityState>({ blocked: false, message: null });
  const [supportOpen, setSupportOpen] = useState(false);
  const [cardBrand, setCardBrand] = useState<string | null>(null);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [cardClientSecret, setCardClientSecret] = useState<string | null>(null);
  const [cardSetupIntentId, setCardSetupIntentId] = useState<string | null>(null);
  const [cardFormVisible, setCardFormVisible] = useState(false);
  const [cardFieldsMounted, setCardFieldsMounted] = useState(false);
  const [cardNumberReady, setCardNumberReady] = useState(false);
  const [cardExpiryReady, setCardExpiryReady] = useState(false);
  const [cardCvcReady, setCardCvcReady] = useState(false);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardPostalCode, setCardPostalCode] = useState("");
  const [cardReadyReason, setCardReadyReason] = useState<string | null>(null);
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardNumberContainerId] = useState(cardNumberContainerIdOverride || "verify-card-number-element");
  const [cardExpiryContainerId] = useState(cardExpiryContainerIdOverride || "verify-card-expiry-element");
  const [cardCvcContainerId] = useState(cardCvcContainerIdOverride || "verify-card-cvc-element");
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [hasLivePreview, setHasLivePreview] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const cardNumberElementRef = useRef<StripeCardNumberElement | null>(null);
  const cardExpiryElementRef = useRef<StripeCardExpiryElement | null>(null);
  const cardCvcElementRef = useRef<StripeCardCvcElement | null>(null);
  const allowVerifiedReturnRef = useRef(false);
  const cardSetupInFlightRef = useRef(false);
  const cardStatusInFlightRef = useRef(false);
  const lastCardStatusFetchAtRef = useRef(0);
  const cardReadyWatchdogRef = useRef<number | null>(null);
  // Tracks whether an automatic mount-retry has already been scheduled for the
  // current user-initiated "Add Card" attempt. Reset on every manual click so
  // each user action gets exactly one auto-retry on loaderror.
  const cardMountAutoRetriedRef = useRef(false);

  // ── Nav state (survives Stripe full-page redirect) ──────────────────────────
  const VERIFY_IDENTITY_NAV_KEY = "huddle_vi_nav";
  const navStateRef = useRef<{ backTo?: string; returnTo?: string; from?: string }>({});
  const canSubmitCard =
    cardFormVisible
    && cardFieldsMounted
    && cardNumberComplete
    && cardExpiryComplete
    && cardCvcComplete
    && Boolean(cardLegalNameInput.trim())
    && !cardSubmitting
    && Boolean(cardClientSecret)
    && Boolean(cardSetupIntentId);

  useEffect(() => {
    const locState = location.state as { backTo?: string; returnTo?: string; from?: string } | null;
    const hasExplicitNavState = Boolean(locState?.backTo || locState?.returnTo || locState?.from);
    if (hasExplicitNavState) {
      navStateRef.current = {
        backTo: locState.backTo || locState.from,
        returnTo: locState.returnTo,
        from: locState.from,
      };
      const isSignupVerifyFlow =
        navStateRef.current.backTo === "/signup/verify"
        || navStateRef.current.returnTo === "/set-profile"
        || flowState !== "idle";
      allowVerifiedReturnRef.current = isSignupVerifyFlow;
      setIsSignupVerifyEntry(isSignupVerifyFlow);
      try {
        sessionStorage.setItem(VERIFY_IDENTITY_NAV_KEY, JSON.stringify(navStateRef.current));
      } catch { /* best-effort */ }
    } else if (flowState !== "idle") {
      // Restore after Stripe redirect (location.state wiped on full page reload)
      try {
        const saved = sessionStorage.getItem(VERIFY_IDENTITY_NAV_KEY);
        if (saved) navStateRef.current = JSON.parse(saved) as { backTo?: string; returnTo?: string; from?: string };
        const isSignupVerifyFlow =
          navStateRef.current.backTo === "/signup/verify"
          || navStateRef.current.returnTo === "/set-profile"
          || flowState !== "idle";
        allowVerifiedReturnRef.current = isSignupVerifyFlow;
        setIsSignupVerifyEntry(isSignupVerifyFlow);
      } catch { /* best-effort */ }
    } else {
      navStateRef.current = {};
      allowVerifiedReturnRef.current = false;
      setIsSignupVerifyEntry(false);
      try {
        sessionStorage.removeItem(VERIFY_IDENTITY_NAV_KEY);
      } catch {
        // best-effort
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowState]);

  // ── Auto-redirect on verified ───────────────────────────────────────────────
  useEffect(() => {
    if (overallVerificationStatus !== "verified") return;
    if (!allowVerifiedReturnRef.current) return;
    const { returnTo, backTo } = navStateRef.current;
    const isSignupVerifyFlow = backTo === "/signup/verify" || returnTo === "/set-profile" || flowState !== "idle";
    if (isSignupVerifyFlow) {
      setIsSignupVerifyEntry(true);
      return;
    }
    allowVerifiedReturnRef.current = false;
    try { sessionStorage.removeItem(VERIFY_IDENTITY_NAV_KEY); } catch { /* best-effort */ }
    if (returnTo) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (backTo) {
      navigate(backTo, { replace: true, state: { openSettingsDrawer: true } });
    }
  }, [flowState, navigate, overallVerificationStatus, setFlowState]);

  useEffect(() => {
    if (
      phoneVerificationState === "verified"
      && humanVerificationState === "passed"
      && cardVerificationState === "passed"
      && overallVerificationStatus !== "verified"
    ) {
      setOverallVerificationStatus("verified");
    }
  }, [
    cardVerificationState,
    humanVerificationState,
    overallVerificationStatus,
    phoneVerificationState,
  ]);

  useEffect(() => {
    if (overallVerificationStatus !== "verified") return;
    // is_verified / verification_status are set server-side by edge functions via service_role;
    // direct client update is blocked by trg_prevent_sensitive_profile_updates.
    // brevo-sync is called server-side by trg_brevo_verification_status_changed trigger.
    void refreshProfile();
  }, [overallVerificationStatus, refreshProfile]);

  const onContinueAfterVerification = useCallback(() => {
    allowVerifiedReturnRef.current = false;
    try { sessionStorage.removeItem(VERIFY_IDENTITY_NAV_KEY); } catch { /* best-effort */ }
    setFlowState("signup");
    navigate("/set-profile", { replace: true });
  }, [navigate, setFlowState]);

  const ensureAuthForVerification = async (): Promise<boolean> => {
    if (authLoading) {
      // Auth context is still resolving — show feedback so the user knows to retry
      // instead of silently doing nothing (which appeared as "no response").
      setCardErrorMessage("Loading your session — please try again in a moment.");
      setHumanErrorMessage("Loading your session — please try again in a moment.");
      return false;
    }
    const {
      data: { session: liveSession },
    } = await supabase.auth.getSession();
    if (liveSession?.access_token) return true;
    if (flowState !== "idle") {
      navigate("/signup/verify", { replace: true });
    } else {
      setHumanErrorMessage("Please sign in to continue verification.");
      setCardErrorMessage("Please sign in to continue verification.");
      navigate("/auth", { replace: true, state: { from: "/verify-identity" } });
    }
    return false;
  };

  const resolvePhoneVerificationState = useCallback(async (currentUserId: string) => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const authConfirmed = Boolean(authUser?.phone_confirmed_at);
    const metadataVerified = Boolean(
      (authUser?.user_metadata as Record<string, unknown> | null)?.phone_verified_local === true,
    );
    const { data: approvedRequests, error: approvedRequestsError } = await supabase
      .from("verification_requests")
      .select("id")
      .eq("user_id", currentUserId)
      .eq("request_type", "phone")
      .eq("status", "approved")
      .limit(1);
    const hasApprovedRequest = !approvedRequestsError && Array.isArray(approvedRequests) && approvedRequests.length > 0;
    const verified = authConfirmed || metadataVerified || hasApprovedRequest;
    setPhoneVerificationState((prev) => {
      if (verified) return "verified";
      if (prev === "sent" || prev === "failed") return prev;
      return "idle";
    });
    return verified;
  }, []);

  const toggleCard = (card: "phone" | "human" | "card") => setActiveCard((prev) => (prev === card ? null : card));

  const logCardState = useCallback((stage: string, extra?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return;
    console.debug("[VerifyIdentity.card.state]", {
      stage,
      cardVerificationState,
      cardFieldsMounted,
      cardNumberReady,
      cardExpiryReady,
      cardCvcReady,
      cardFormVisible,
      cardSubmitting,
      cardNumberComplete,
      cardExpiryComplete,
      cardCvcComplete,
      hasClientSecret: Boolean(cardClientSecret),
      hasSetupIntentId: Boolean(cardSetupIntentId),
      cardReadyReason,
      canSubmitCard,
      ...extra,
    });
  }, [
    canSubmitCard,
    cardClientSecret,
    cardFieldsMounted,
    cardNumberReady,
    cardExpiryReady,
    cardCvcReady,
    cardNumberComplete,
    cardExpiryComplete,
    cardCvcComplete,
    cardReadyReason,
    cardFormVisible,
    cardSetupIntentId,
    cardSubmitting,
    cardVerificationState,
  ]);

  const resetCardFormRuntime = useCallback((options?: { preserveOutcome?: boolean }) => {
    if (cardReadyWatchdogRef.current) {
      window.clearTimeout(cardReadyWatchdogRef.current);
      cardReadyWatchdogRef.current = null;
    }
    cardNumberElementRef.current?.destroy();
    cardExpiryElementRef.current?.destroy();
    cardCvcElementRef.current?.destroy();
    cardNumberElementRef.current = null;
    cardExpiryElementRef.current = null;
    cardCvcElementRef.current = null;
    elementsRef.current = null;
    stripeRef.current = null;
    setCardFormVisible(false);
    setCardFieldsMounted(false);
    setCardNumberReady(false);
    setCardExpiryReady(false);
    setCardCvcReady(false);
    setCardNumberComplete(false);
    setCardExpiryComplete(false);
    setCardCvcComplete(false);
    setCardPostalCode("");
    setCardReadyReason(null);
    setCardSubmitting(false);
    setCardClientSecret(null);
    setCardSetupIntentId(null);
    if (!options?.preserveOutcome) {
      setCardErrorMessage(null);
    }
  }, []);

  const syncCardUiFromResolvedStatus = useCallback((params: {
    cardStatus: string;
    cardVerified: boolean;
    legalName?: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardFingerprintPresent?: boolean;
    blockedIdentity?: BlockedIdentityState;
    setupIntentId?: string | null;
    lastSetupError?: { message?: string | null; code?: string | null } | null;
    source: string;
  }) => {
    const uiState = toCardUiState(params.cardStatus, params.cardVerified);
    const isBlockedIdentity = Boolean(params.blockedIdentity?.blocked);
    const hasActiveCardAttempt =
      cardFormVisible && (cardVerificationState === "collecting" || cardVerificationState === "submitting");
    const differentSetupIntent =
      Boolean(cardSetupIntentId)
      && Boolean(params.setupIntentId)
      && cardSetupIntentId !== params.setupIntentId;
    // Protect locally-established failure: a "failed" local state means the user
    // saw a mount error or submission error. Backend polling still returns "pending"
    // (no submit was completed), so without this guard the poll at line 1179 resets
    // cardVerificationState → "idle"/"pending", collapsing the failed-retry UI path.
    // Only a backend "passed" result (uiState === "passed") can clear a local failure.
    const hasLocalFailedState = cardVerificationState === "failed";

    if (uiState !== "passed" && !isBlockedIdentity && (hasActiveCardAttempt || differentSetupIntent || hasLocalFailedState)) {
      logCardState("resolved_status_ignored_active_attempt", {
        source: params.source,
        resolvedState: uiState,
        setupIntentId: params.setupIntentId ?? null,
        activeSetupIntentId: cardSetupIntentId,
        hasActiveCardAttempt,
        differentSetupIntent,
      });
      return;
    }

    setCardVerificationState(uiState);
    setVerifiedLegalName(params.legalName || null);
    setBlockedIdentity(params.blockedIdentity ?? { blocked: false, message: null });
    setCardBrand(params.cardBrand || null);
    setCardLast4(params.cardLast4 || null);

    if (uiState === "passed") {
      resetCardFormRuntime();
      setCardErrorMessage(null);
      setCardLegalNameInput(params.legalName || "");
      logCardState("resolved_status_passed", { source: params.source });
      return;
    }

    if (uiState === "failed") {
      // On initial snapshot / background poll, a stale backend "failed" status from a
      // previous session should not immediately blast an error at the user.  Only surface
      // the error message when the failure came from an action the user just performed
      // (sources: "pull_card_status" after submit, "confirm_card_setup_failed_after_poll").
      // For passive sources ("snapshot") reset silently to "idle" so the user sees a fresh
      // "Add card" state instead of a confusing instant error.
      const isPassiveSource = params.source === "snapshot";
      if (isBlockedIdentity) {
        resetCardFormRuntime({ preserveOutcome: true });
        setCardErrorMessage(params.blockedIdentity?.message || GENERIC_CARD_ERROR_MESSAGE);
        logCardState("resolved_status_blocked_identity", { source: params.source });
        return;
      }
      if (isPassiveSource) {
        setCardVerificationState("idle");
        logCardState("resolved_status_failed_reset_idle", { source: params.source });
        return;
      }
      resetCardFormRuntime({ preserveOutcome: true });
      if (!cardErrorMessage) {
        setCardErrorMessage(GENERIC_CARD_ERROR_MESSAGE);
      }
      logCardState("resolved_status_failed", { source: params.source });
      return;
    }

    logCardState("resolved_status_pending", { source: params.source, setupIntentId: params.setupIntentId ?? null });
  }, [cardFormVisible, cardSetupIntentId, cardVerificationState, cardErrorMessage, logCardState, resetCardFormRuntime]);

  const applySnapshot = useCallback((snapshot: {
    verificationStatus: BackendVerificationStatus;
    humanStatus: string;
    cardStatus: string;
    cardVerified: boolean;
    legalName?: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    cardFingerprintPresent?: boolean;
    blockedIdentity?: BlockedIdentityState;
    setupIntentId?: string | null;
    cardLastError?: { message?: string | null; code?: string | null } | null;
    humanAttemptId?: string | null;
    humanAttemptCompletedAt?: string | null;
    humanChallenge?: HumanChallenge | null;
  }) => {
    setOverallVerificationStatus(snapshot.verificationStatus);
    const hasPendingAttempt =
      snapshot.humanStatus === "pending"
      && Boolean(snapshot.humanAttemptId)
      && !snapshot.humanAttemptCompletedAt
      && Boolean(snapshot.humanChallenge);
    if (hasPendingAttempt) {
      setHumanAttemptId(snapshot.humanAttemptId || null);
      setHumanChallenge(snapshot.humanChallenge || null);
      setHumanVerificationState("ready");
    } else {
      setHumanVerificationState(toHumanUiState(snapshot.humanStatus));
    }
    syncCardUiFromResolvedStatus({
      cardStatus: snapshot.cardStatus,
      cardVerified: snapshot.cardVerified,
      legalName: snapshot.legalName || null,
      cardBrand: snapshot.cardBrand || null,
      cardLast4: snapshot.cardLast4 || null,
      cardFingerprintPresent: snapshot.cardFingerprintPresent,
      blockedIdentity: snapshot.blockedIdentity,
      setupIntentId: snapshot.setupIntentId || null,
      lastSetupError: snapshot.cardLastError || null,
      source: "snapshot",
    });
  }, [syncCardUiFromResolvedStatus]);

  const refreshVerificationSnapshot = useCallback(async () => {
    const snapshot = await fetchVerifyIdentitySnapshot();
    applySnapshot(snapshot);
    await refreshProfile();
    return snapshot;
  }, [applySnapshot, refreshProfile]);

  const syncProfileVerificationAfterStep = useCallback(async () => {
    if (!user?.id) return;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await refreshProfile();
      const { data, error } = await supabase
        .from("profiles")
        .select("is_verified")
        .eq("id", user.id)
        .maybeSingle();
      if (!error && data?.is_verified === true) return;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }, [refreshProfile, user?.id]);

  const refreshVerificationRuntime = useCallback(async () => {
    const snapshot = await refreshVerificationSnapshot();
    if (user?.id) {
      await resolvePhoneVerificationState(user.id);
    }
    return snapshot;
  }, [refreshVerificationSnapshot, resolvePhoneVerificationState, user?.id]);

  const pullCardStatus = useCallback(async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (!options?.force && now - lastCardStatusFetchAtRef.current < 1800) return null;
    if (cardStatusInFlightRef.current) return null;
    cardStatusInFlightRef.current = true;
    lastCardStatusFetchAtRef.current = now;
    try {
      const status = await fetchCardStatus();
      setOverallVerificationStatus(status.verificationStatus);
      syncCardUiFromResolvedStatus({
        cardStatus: status.cardStatus,
        cardVerified: status.cardStatus === "passed",
        legalName: status.legalName,
        cardBrand: status.cardBrand,
        cardLast4: status.cardLast4,
        cardFingerprintPresent: status.cardFingerprintPresent,
        blockedIdentity: status.blockedIdentity,
        setupIntentId: status.setupIntentId,
        lastSetupError: status.cardLastError,
        source: "pull_card_status",
      });
      if (status.verificationStatus === "verified" || status.cardStatus === "passed") {
        await refreshProfile();
      }
      return status;
    } finally {
      cardStatusInFlightRef.current = false;
    }
  }, [refreshProfile, syncCardUiFromResolvedStatus]);

  useEffect(() => {
    if (humanVerificationStateOverride) {
      setHumanVerificationState(humanVerificationStateOverride);
    }
  }, [humanVerificationStateOverride]);

  useEffect(() => {
    if (cardVerificationStateOverride) {
      setCardVerificationState(cardVerificationStateOverride);
    }
  }, [cardVerificationStateOverride]);

  useEffect(() => {
    if (overallVerificationStatusOverride) {
      setOverallVerificationStatus(overallVerificationStatusOverride);
    }
  }, [overallVerificationStatusOverride]);

  useEffect(() => {
    logCardState("render");
  }, [
    canSubmitCard,
    cardClientSecret,
    cardFieldsMounted,
    cardNumberReady,
    cardExpiryReady,
    cardCvcReady,
    cardFormVisible,
    cardNumberComplete,
    cardExpiryComplete,
    cardCvcComplete,
    cardSetupIntentId,
    cardSubmitting,
    cardVerificationState,
    logCardState,
  ]);

  // Stable refs so the bootstrap effect doesn't re-run when these callbacks are recreated.
  // applySnapshot / refreshVerificationRuntime / resolvePhoneVerificationState are all
  // useCallback-memoised on card-related state (cardVerificationState, cardFormVisible, etc.).
  // Without these refs, every card state change triggers the bootstrap cleanup which calls
  // resetCardFormRuntime() and destroys Stripe elements mid-flow.
  const applySnapshotRef = useRef(applySnapshot);
  useEffect(() => { applySnapshotRef.current = applySnapshot; }, [applySnapshot]);

  const refreshVerificationRuntimeRef = useRef(refreshVerificationRuntime);
  useEffect(() => { refreshVerificationRuntimeRef.current = refreshVerificationRuntime; }, [refreshVerificationRuntime]);

  const resolvePhoneVerificationStateRef = useRef(resolvePhoneVerificationState);
  useEffect(() => { resolvePhoneVerificationStateRef.current = resolvePhoneVerificationState; }, [resolvePhoneVerificationState]);

  useEffect(() => {
    let isMounted = true;
    if (authLoading) return;

    const bootstrap = async () => {
      try {
        const {
          data: { session: liveSession },
        } = await supabase.auth.getSession();
        if (!liveSession?.access_token) return;
        if (isMounted && liveSession.user?.id) {
          await resolvePhoneVerificationStateRef.current(liveSession.user.id);
        }
        await trackDeviceFingerprint("verify_identity_entry");
        const snapshot = await refreshVerificationRuntimeRef.current();
        if (!isMounted) return;
        applySnapshotRef.current(snapshot);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity] bootstrap waiting", error);
        }
      }
    };

    void bootstrap();
    return () => {
      isMounted = false;
    };
  }, [authLoading]);

  // Unmount-only: destroy Stripe elements when navigating away from the page.
  // Kept separate so authLoading changes don't fire the cleanup mid-card-setup.
  useEffect(() => {
    return () => resetCardFormRuntime();
  }, [resetCardFormRuntime]);

  useEffect(() => {
    if (authLoading || !user?.id) return;
    let inFlight = false;
    const syncNow = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await refreshVerificationRuntime();
      } catch {
        // no-op
      } finally {
        inFlight = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void syncNow();
    };
    const onFocus = () => {
      void syncNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [authLoading, refreshVerificationRuntime, user?.id]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    video.srcObject = previewStream;
    const ensurePlayback = async () => {
      if (!previewStream) return;
      try {
        await video.play();
      } catch {
        // no-op
      }
    };
    void ensurePlayback();
    return () => {
      if (video.srcObject === previewStream) {
        video.srcObject = null;
      }
    };
  }, [previewStream, humanVerificationState]);

  const onStartHumanVerification = async () => {
    if (onStartHumanVerificationOverride) {
      onStartHumanVerificationOverride();
      return;
    }
    if (!(await ensureAuthForVerification())) return;
    try {
      setHumanErrorMessage(null);
      // Best-effort warmup only; do not hard-fail here.
      // The real pass/fail decision happens after the live camera challenge run.
      void prewarmHumanVerificationEngine();
      const started = await startHumanChallenge();
      setHumanAttemptId(started.attemptId);
      setHumanChallenge(started.challenge);
      setOverallVerificationStatus(started.verificationStatus);
      setHumanVerificationState("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't start verification.";
      setHumanErrorMessage(message);
      setHumanVerificationState("failed");
    }
  };

  const onBeginCapture = async () => {
    if (onBeginCaptureOverride) {
      onBeginCaptureOverride();
      return;
    }
    if (!(await ensureAuthForVerification())) return;
    allowVerifiedReturnRef.current = true;
    let workingAttemptId = humanAttemptId;
    let workingChallenge = humanChallenge;
    if (!workingAttemptId || !workingChallenge) {
      try {
        setHumanErrorMessage(null);
        const started = await startHumanChallenge();
        workingAttemptId = started.attemptId;
        workingChallenge = started.challenge;
        setHumanAttemptId(started.attemptId);
        setHumanChallenge(started.challenge);
        setOverallVerificationStatus(started.verificationStatus);
      } catch (error) {
        const message = error instanceof Error ? error.message : "We couldn't start verification.";
        setHumanErrorMessage(message);
        setHumanVerificationState("failed");
        return;
      }
    }

    try {
      setHumanErrorMessage(null);
      setHumanVerificationState("capturing");
      const result = await runHumanVerificationChallenge(workingChallenge, {
        minDurationMs: 4000,
        onPreviewStream: (stream) => {
          setPreviewStream(stream);
          setHasLivePreview(Boolean(stream));
        },
      });

      let evidencePath: string | null = null;
      // Evidence upload is optional and must never block verification completion.
      // Local setups often miss storage ownership policies after DB resets.
      const canUploadEvidence = import.meta.env.PROD;
      if (result.evidenceBlob && canUploadEvidence) {
        try {
          const path = `${user?.id}/${workingAttemptId}/${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("identity_verification_evidence")
            .upload(path, result.evidenceBlob, { contentType: "image/jpeg", upsert: true });
          if (!uploadError) {
            evidencePath = path;
          }
        } catch {
          // Ignore evidence upload failures by design.
        }
      }

      const completed = await completeHumanChallenge({
        attemptId: workingAttemptId,
        status: result.passed ? "passed" : "failed",
        score: result.score,
        resultPayload: result.resultPayload,
        evidencePath,
      });

      setHumanVerificationState(completed.humanStatus === "passed" ? "passed" : "failed");
      try {
        await refreshVerificationSnapshot();
      } catch (snapshotError) {
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity.card] snapshot refresh skipped after setup-intent", snapshotError);
        }
      }
      if (completed.humanStatus === "passed") {
        await syncProfileVerificationAfterStep();
        toast.success("Human verification complete.");
      } else {
        setHumanErrorMessage(describeHumanFailure(result.resultPayload, workingChallenge?.instruction || null));
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const lowered = raw.toLowerCase();
      let message = "Face verification failed. Keep your face centered in the oval and try again.";
      if (lowered.includes("notallowederror") || lowered.includes("permission")) {
        message = "Camera access is required. Please allow camera permission and try again.";
      } else if (lowered.includes("notfounderror") || lowered.includes("no camera")) {
        message = "No camera was detected on this device.";
      } else if (raw.trim()) {
        message = raw;
      }
      setHumanErrorMessage(message);
      setHumanVerificationState("failed");
      try {
        if (workingAttemptId) {
          await completeHumanChallenge({ attemptId: workingAttemptId, status: "failed" });
        }
      } catch {
        // no-op
      }
    } finally {
      setPreviewStream(null);
      setHasLivePreview(false);
    }
  };

  const onRetryHuman = async () => {
    if (onRetryHumanOverride) {
      onRetryHumanOverride();
      return;
    }
    await onStartHumanVerification();
  };

  useEffect(() => {
    const fromProfile = String(profile?.phone || "").trim();
    const fromUser = String(user?.phone || "").trim();
    const fromSignup = String(signupData.phone || "").trim();
    const resolved = fromProfile || fromUser || fromSignup;
    setPhoneValue((prev) => (prev.trim() ? prev : resolved));
  }, [profile?.phone, signupData.phone, user?.phone]);

  useEffect(() => {
    const resolvedLegalName = String(profile?.legal_name || signupData.legal_name || "").trim();
    setVerifiedLegalName((prev) => prev ?? (resolvedLegalName || null));
    setCardLegalNameInput((prev) => (prev.trim() ? prev : resolvedLegalName));
  }, [profile?.legal_name, signupData.legal_name]);

  useEffect(() => {
    if (!showTurnstileDiag) return;
    setActiveCard("phone");
  }, [showTurnstileDiag]);

  const onSendPhoneOtp = async () => {
    if (!(await ensureAuthForVerification())) return;
    const normalized = phoneValue.trim();
    if (!normalized) {
      setPhoneVerificationError("Enter a valid phone number.");
      return;
    }
    if (phoneCountryUnavailable) {
      setPhoneVerificationState("unavailable");
      setPhoneVerificationError("Phone verification is not available yet.");
      return;
    }
    const turnstileToken = readPhoneOtpTurnstileToken();
    if (!turnstileToken) {
      setPhoneVerificationError("Please complete the verification first.");
      return;
    }
    setPhoneVerificationLoading(true);
    setPhoneVerificationError(null);
    const result = await requestPhoneOtp(normalized, turnstileToken);
    setPhoneVerificationLoading(false);
    if (!result.ok) {
      setPhoneVerificationState(result.unavailable ? "unavailable" : "failed");
      setPhoneVerificationError(result.error || "Phone verification is temporarily unavailable. Please try again later.");
      return;
    }
    setPhoneVerificationState("sent");
    setPhoneVerificationError(null);
    setPhoneSentMaskedHint(maskPhoneForOtpNotice(normalized));
  };

  const onVerifyPhoneOtp = async () => {
    if (!(await ensureAuthForVerification())) return;
    const normalizedPhone = phoneValue.trim();
    const normalizedCode = phoneOtpCode.trim();
    if (!normalizedPhone || !normalizedCode) {
      setPhoneVerificationError("Enter the 6-digit code.");
      return;
    }
    setPhoneVerificationLoading(true);
    setPhoneVerificationError(null);
    const result = await verifyPhoneOtp(normalizedPhone, normalizedCode);
    setPhoneVerificationLoading(false);
    if (!result.ok) {
      setPhoneVerificationState("failed");
      setPhoneVerificationError(result.error || "We couldn’t verify the code right now. Please try again.");
      return;
    }
    setPhoneVerificationState("verified");
    setPhoneVerificationError(null);
    setPhoneOtpCode("");
    if (user?.id) {
      try {
        await supabase.auth.updateUser({
          data: {
            phone_verified_local: true,
            phone_e164: normalizedPhone,
          },
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity.phone] auth metadata update failed", error);
        }
      }
      try {
        await supabase.from("profiles").update({ phone: normalizedPhone }).eq("id", user.id);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity.phone] profile phone update failed", error);
        }
      }
      if (profile?.id === user.id) {
        const { error: verificationError } = await supabase.from("verification_requests").insert({
          user_id: user.id,
          request_type: "phone",
          status: "approved",
          provider: "supabase",
          submitted_data: { phone: normalizedPhone },
          verification_result: { status: "approved" },
        });
        if (verificationError) {
          if (import.meta.env.DEV) {
            console.debug("[VerifyIdentity.phone] verification_requests insert failed", verificationError);
          }
        }
      }
    }
    try {
      await refreshVerificationSnapshot();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug("[VerifyIdentity.phone] snapshot refresh skipped", error);
      }
    }
    await syncProfileVerificationAfterStep();
    if (user?.id) {
      try {
        await resolvePhoneVerificationState(user.id);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity.phone] resolve state failed", error);
        }
      }
    }
  };

  const onPhoneValueChange = (value: string) => {
    const normalized = String(value || "").trim();
    setPhoneValue(value);
    setPhoneOtpCode("");
    setPhoneSentMaskedHint(null);
    if (!normalized) {
      setPhoneVerificationState("idle");
      setPhoneVerificationError(null);
      return;
    }
    if (!isPhoneCountryAllowed(normalized)) {
      setPhoneVerificationState("unavailable");
      setPhoneVerificationError("Phone verification is not available yet.");
      return;
    }
    if (phoneVerificationState === "sent" || phoneVerificationState === "failed" || phoneVerificationState === "unavailable") {
      setPhoneVerificationState("idle");
      setPhoneVerificationError(null);
    }
  };

  const onAddCard = async (isAutoRetry = false) => {
    if (onAddCardOverride) {
      onAddCardOverride();
      return;
    }
    if (cardSetupInFlightRef.current) return;
    if (!(await ensureAuthForVerification())) return;
    // Reset the auto-retry sentinel on every manual click so each new user
    // attempt gets exactly one automatic retry on loaderror.
    if (!isAutoRetry) cardMountAutoRetriedRef.current = false;
    cardSetupInFlightRef.current = true;
    try {
      setActiveCard("card");
      resetCardFormRuntime();
      setCardErrorMessage(null);
      setBlockedIdentity({ blocked: false, message: null });
      setCardVerificationState("collecting");
      const attemptId = crypto.randomUUID();

      const setup = await Promise.race([
        createCardSetupIntent(attemptId),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("card_setup_timeout")), 12000),
        ),
      ]);
      const clientSecret = String(setup.clientSecret || "").trim();
      if (!clientSecret) {
        throw new Error("Card setup payload is incomplete. Please retry.");
      }
      setCardClientSecret(clientSecret);
      setCardSetupIntentId(setup.setupIntentId);
      setCardFormVisible(true);
      setCardReadyReason("Preparing secure card form...");
      if (import.meta.env.DEV) {
        console.debug("[VerifyIdentity.card] setup-intent payload", {
          hasClientSecret: Boolean(clientSecret),
          clientSecretPrefix: clientSecret.slice(0, 12),
          setupIntentId: setup.setupIntentId,
          publishableKeyPrefix: setup.publishableKey.slice(0, 7),
          stripeMode: setup.stripeMode || null,
          attemptId,
        });
      }
      logCardState("setup_intent_success", {
        setupIntentId: setup.setupIntentId,
        hasClientSecret: Boolean(clientSecret),
        publishableKeyPrefix: setup.publishableKey.slice(0, 7),
        stripeMode: setup.stripeMode || null,
        attemptId,
      });
      const stripe = await loadStripe(setup.publishableKey);
      if (!stripe) throw new Error("Card verification is unavailable right now.");
      if (cardReadyWatchdogRef.current) {
        window.clearTimeout(cardReadyWatchdogRef.current);
        cardReadyWatchdogRef.current = null;
      }

      stripeRef.current = stripe;
      elementsRef.current = stripe.elements({
        appearance: { theme: "stripe" },
      });

      const elementStyle = {
        style: {
          base: {
            color: "#424965",
            fontFamily: "Urbanist, system-ui, -apple-system, sans-serif",
            fontSize: "16px",
            fontSmoothing: "antialiased",
            "::placeholder": {
              color: "#A3A8BE",
            },
          },
          invalid: {
            color: "#E84545",
          },
        },
      };

      const cardNumberElement = elementsRef.current.create("cardNumber", elementStyle);
      const cardExpiryElement = elementsRef.current.create("cardExpiry", elementStyle);
      const cardCvcElement = elementsRef.current.create("cardCvc", elementStyle);
      cardNumberElementRef.current = cardNumberElement;
      cardExpiryElementRef.current = cardExpiryElement;
      cardCvcElementRef.current = cardCvcElement;
      const readyTracker = {
        number: false,
        expiry: false,
        cvc: false,
      };

      const onReady = (field: "number" | "expiry" | "cvc") => {
        readyTracker[field] = true;
        if (field === "number") setCardNumberReady(true);
        if (field === "expiry") setCardExpiryReady(true);
        if (field === "cvc") setCardCvcReady(true);
        setCardReadyReason(null);
        logCardState("card_field_ready", { field });
        if (readyTracker.number && readyTracker.expiry && readyTracker.cvc && cardReadyWatchdogRef.current) {
          window.clearTimeout(cardReadyWatchdogRef.current);
          cardReadyWatchdogRef.current = null;
        }
      };

      const onChange = (
        field: "number" | "expiry" | "cvc",
        event: { complete: boolean; empty: boolean; error?: { message?: string; code?: string } },
      ) => {
        if (field === "number") setCardNumberComplete(Boolean(event.complete));
        if (field === "expiry") setCardExpiryComplete(Boolean(event.complete));
        if (field === "cvc") setCardCvcComplete(Boolean(event.complete));
        if (event.error?.message) {
          setCardErrorMessage(event.error.message);
        } else if (!cardSubmitting && cardVerificationState !== "failed") {
          setCardErrorMessage(null);
        }
        logCardState("card_field_change", {
          field,
          complete: Boolean(event.complete),
          empty: Boolean(event.empty),
          errorCode: event.error?.code || null,
          errorMessage: event.error?.message || null,
        });
      };

      const onLoadError = (field: "number" | "expiry" | "cvc") => {
        logCardState("card_field_loaderror", { field, autoRetried: cardMountAutoRetriedRef.current });
        // First loaderror is almost always a cold-connection failure
        // (ERR_CONNECTION_CLOSED on m.stripe.com / m.stripe.network). The browser
        // has warm DNS + TCP by the time we retry 1 s later. Allow exactly one
        // automatic retry per user-initiated click before surfacing the error.
        if (!cardMountAutoRetriedRef.current) {
          cardMountAutoRetriedRef.current = true;
          window.setTimeout(() => void onAddCard(true), 1000);
          return;
        }
        setCardVerificationState("failed");
        setCardReadyReason(null);
        setCardErrorMessage("Card form failed to mount. Please retry.");
      };

      cardNumberElement.on("ready", () => onReady("number"));
      cardExpiryElement.on("ready", () => onReady("expiry"));
      cardCvcElement.on("ready", () => onReady("cvc"));
      cardNumberElement.on("change", (event) => onChange("number", event));
      cardExpiryElement.on("change", (event) => onChange("expiry", event));
      cardCvcElement.on("change", (event) => onChange("cvc", event));
      cardNumberElement.on("loaderror", () => onLoadError("number"));
      cardExpiryElement.on("loaderror", () => onLoadError("expiry"));
      cardCvcElement.on("loaderror", () => onLoadError("cvc"));

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const waitForMountTarget = async (targetId: string) => {
        for (let i = 0; i < 120; i += 1) {
          const target = document.getElementById(targetId);
          if (target) return target;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return null;
      };

      const numberTarget = await waitForMountTarget(cardNumberContainerId);
      const expiryTarget = await waitForMountTarget(cardExpiryContainerId);
      const cvcTarget = await waitForMountTarget(cardCvcContainerId);
      if (!numberTarget || !expiryTarget || !cvcTarget) {
        throw new Error("Card form failed to mount. Please retry.");
      }

      cardNumberElement.mount(`#${cardNumberContainerId}`);
      cardExpiryElement.mount(`#${cardExpiryContainerId}`);
      cardCvcElement.mount(`#${cardCvcContainerId}`);
      setCardFieldsMounted(true);
      logCardState("card_fields_mounted", {
        numberTarget: cardNumberContainerId,
        expiryTarget: cardExpiryContainerId,
        cvcTarget: cardCvcContainerId,
      });

      cardReadyWatchdogRef.current = window.setTimeout(() => {
        if (readyTracker.number && readyTracker.expiry && readyTracker.cvc) return;
        setCardVerificationState("failed");
        setCardReadyReason(null);
        setCardErrorMessage("Card form failed to mount. Please retry.");
        logCardState("card_ready_timeout");
      }, 10000);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Card verification is unavailable.";
      const message = rawMessage === "card_setup_timeout"
        ? "Card setup is taking too long. Please try again."
        : rawMessage;
      setCardErrorMessage(message);
      setCardVerificationState("failed");
      setCardReadyReason(null);
      resetCardFormRuntime({ preserveOutcome: true });
      logCardState("setup_failed", { message });
    } finally {
      cardSetupInFlightRef.current = false;
    }
  };

  const onSubmitCard = async () => {
    if (onSubmitCardOverride) {
      onSubmitCardOverride();
      return;
    }
    if (!(await ensureAuthForVerification())) return;
    allowVerifiedReturnRef.current = true;
    const stripe = stripeRef.current;
    const cardNumberElement = cardNumberElementRef.current;
    if (
      !stripe
      || !cardNumberElement
      || !cardClientSecret
      || !cardSetupIntentId
      || !cardFieldsMounted
    ) {
      setCardErrorMessage("Card form is not ready yet.");
      logCardState("submit_blocked_not_ready", {
        hasStripe: Boolean(stripe),
        hasCardNumberElement: Boolean(cardNumberElement),
        hasClientSecret: Boolean(cardClientSecret),
        hasSetupIntentId: Boolean(cardSetupIntentId),
      });
      return;
    }
    if (!cardNumberComplete || !cardExpiryComplete || !cardCvcComplete) {
      setCardErrorMessage("Please complete your card details before verifying.");
      logCardState("submit_blocked_incomplete", {
        setupIntentId: cardSetupIntentId,
        clientSecretPrefix: cardClientSecret.slice(0, 12),
      });
      return;
    }
    const trimmedLegalName = cardLegalNameInput.trim();
    if (!trimmedLegalName) {
      setCardErrorMessage("Legal name is required.");
      logCardState("submit_blocked_missing_legal_name", {
        setupIntentId: cardSetupIntentId,
      });
      return;
    }

    try {
      setCardErrorMessage(null);
      setCardSubmitting(true);
      setCardVerificationState("submitting");
      logCardState("submit_started", {
        setupIntentId: cardSetupIntentId,
        clientSecretPrefix: cardClientSecret.slice(0, 12),
      });

      if (import.meta.env.DEV) {
        console.debug("[VerifyIdentity.card] confirmCardSetup params", {
          setupIntentId: cardSetupIntentId,
          clientSecretPrefix: cardClientSecret.slice(0, 12),
          hasCardNumberElement: true,
          legalName: trimmedLegalName,
          postalCode: cardPostalCode || null,
          cardNumberComplete,
          cardExpiryComplete,
          cardCvcComplete,
        });
      }
      const result = await stripe.confirmCardSetup(cardClientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            name: trimmedLegalName,
            address: {
              postal_code: cardPostalCode || undefined,
            },
          },
        },
      });

      if (result.error) {
        setCardVerificationState("failed");
        const stripeMsg = result.error.message || "";
        const stripeType = result.error.type || "";
        const stripeMsgLower = stripeMsg.toLowerCase();
        // Surface actionable Stripe messages directly instead of always showing a generic error:
        // - card_error: already user-friendly (declined, wrong CVC, expired, etc.)
        // - test mode with real card: tell user to use a test card number
        let displayMessage = GENERIC_CARD_ERROR_MESSAGE;
        if (stripeMsgLower.includes("test mode") || stripeMsgLower.includes("non test")) {
          displayMessage = "You're in test mode — use Stripe test card 4242 4242 4242 4242.";
        } else if (stripeType === "card_error" && stripeMsg) {
          displayMessage = stripeMsg;
        }
        setCardErrorMessage(displayMessage);
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity.card] confirmCardSetup error", {
            message: stripeMsg || null,
            code: result.error.code || null,
            type: stripeType || null,
            declineCode: "decline_code" in result.error ? result.error.decline_code || null : null,
            setupIntentStatus: result.setupIntent?.status || null,
            setupIntentId: result.setupIntent?.id || cardSetupIntentId,
          });
        }
        logCardState("confirm_card_setup_failed", {
          message: stripeMsg || null,
          code: result.error.code || null,
          type: stripeType || null,
          declineCode: "decline_code" in result.error ? result.error.decline_code || null : null,
          setupIntentStatus: result.setupIntent?.status || null,
          setupIntentId: result.setupIntent?.id || cardSetupIntentId,
        });
        return;
      }

      if (result.setupIntent?.status === "succeeded" || result.setupIntent?.status === "processing") {
        setCardVerificationState("pending");
        logCardState("confirm_card_setup_pending", { setupIntentStatus: result.setupIntent.status });
      }
      try {
        const status = await pullCardStatus({ force: true });
        if (status?.cardStatus === "passed") {
          setVerifiedLegalName(status.legalName || trimmedLegalName);
          await syncProfileVerificationAfterStep();
          toast.success("Card verification complete.");
          logCardState("confirm_card_setup_passed");
        } else if (status?.cardStatus === "failed") {
          setCardErrorMessage(status.blockedIdentity.blocked
            ? (status.blockedIdentity.message || GENERIC_CARD_ERROR_MESSAGE)
            : GENERIC_CARD_ERROR_MESSAGE);
          logCardState("confirm_card_setup_failed_after_poll");
        } else {
          setCardErrorMessage("Verification is still processing. Please check status in a moment.");
          logCardState("confirm_card_setup_still_pending");
        }
      } catch (pollError) {
        setCardVerificationState("pending");
        setCardErrorMessage("Verification is still processing. Please check status in a moment.");
        logCardState("confirm_card_setup_poll_error_pending", {
          error: pollError instanceof Error ? pollError.message : String(pollError),
        });
      }
    } catch (error) {
      setCardErrorMessage(GENERIC_CARD_ERROR_MESSAGE);
      setCardVerificationState("failed");
      const message = error instanceof Error ? error.message : "unknown_error";
      logCardState("submit_exception", { message });
    } finally {
      setCardSubmitting(false);
    }
  };

  const onRetryCard = async () => {
    if (onRetryCardOverride) {
      onRetryCardOverride();
      return;
    }
    await onAddCard();
  };

  const onCheckCardPendingStatus = async () => {
    try {
      const status = await pullCardStatus({ force: true });
      if (!status) return;
      if (status.cardStatus === "passed") {
        setVerifiedLegalName(status.legalName || verifiedLegalName);
        await syncProfileVerificationAfterStep();
        toast.success("Card verification complete.");
        return;
      }
      if (status.cardStatus === "failed") {
        setCardErrorMessage(status.blockedIdentity.blocked
          ? (status.blockedIdentity.message || GENERIC_CARD_ERROR_MESSAGE)
          : GENERIC_CARD_ERROR_MESSAGE);
        return;
      }
      setCardErrorMessage("Verification is still processing. Please check status in a moment.");
    } catch (error) {
      setCardErrorMessage(GENERIC_CARD_ERROR_MESSAGE);
      setCardVerificationState("failed");
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    if (humanVerificationState !== "pending" && cardVerificationState !== "pending") return;
    let cancelled = false;
    let pendingCardPolls = 0;

    const pollPending = async () => {
      try {
        const snapshot = await refreshVerificationSnapshot();
        if (cancelled) return;
        applySnapshot(snapshot);
        if (snapshot.cardStatus === "pending") {
          await pullCardStatus();
        }
        if (snapshot.cardStatus === "pending") {
          pendingCardPolls += 1;
          if (pendingCardPolls >= 12) {
            setCardVerificationState("pending");
            setCardErrorMessage("Verification is still processing. Please check status.");
            return;
          }
        } else {
          pendingCardPolls = 0;
        }
      } catch {
        // best-effort polling only
      }
    };

    void pollPending();
    const intervalId = window.setInterval(() => {
      void pollPending();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authLoading, user, humanVerificationState, cardVerificationState, pullCardStatus, refreshVerificationSnapshot, applySnapshot]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        showBack
        onBack={() => {
          try {
            sessionStorage.removeItem("huddle_vi_status");
          } catch { /* best-effort */ }
          const { backTo } = navStateRef.current;
          if (backTo) {
            const shouldReopenDrawer = backTo !== "/signup/verify";
            navigate(backTo, {
              replace: true,
              state: shouldReopenDrawer ? { openSettingsDrawer: true } : undefined,
            });
            return;
          }
          if (flowState !== "idle") {
            navigate("/signup/verify", { replace: true });
            return;
          }
          navigate(-1);
        }}
        title="Verify Identity"
        right={<OverallStatusChip status={overallVerificationStatus} />}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-[68px] px-4 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+20px)] space-y-4 max-w-md mx-auto">
          <div className="flex justify-center pt-2">
            <img
              src={verifyIllustration}
              alt=""
              className="max-w-[260px] h-[160px] object-contain mix-blend-multiply"
            />
          </div>

          <p className="text-[14px] text-[var(--text-secondary)] leading-[1.5] text-center px-2 max-w-[342px] mx-auto">
            To help keep Huddle safe, we use a quick trust check to confirm you&apos;re a real
            person using your real identity. We only keep the verification result and limited
            metadata needed for safety and fraud prevention.
          </p>

          {blockedIdentity.blocked ? (
            <div className="rounded-[18px] border border-[rgba(232,69,69,0.16)] bg-[rgba(232,69,69,0.06)] px-4 py-4 shadow-[0_12px_34px_rgba(66,73,101,0.08)]">
              <p className="text-[14px] leading-[1.5] text-[var(--text-primary,#424965)]">
                {blockedIdentity.message}
              </p>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="mt-3 text-[13px] font-semibold text-brandBlue underline underline-offset-2"
              >
                Help &amp; Support
              </button>
            </div>
          ) : null}

          <PhoneVerificationCard
            state={phoneVerificationState}
            isOpen={activeCard === "phone"}
            onToggle={() => toggleCard("phone")}
            phone={phoneValue}
            otpCode={phoneOtpCode}
            onPhoneChange={onPhoneValueChange}
            onOtpChange={setPhoneOtpCode}
            onSendOtp={onSendPhoneOtp}
            onVerifyOtp={onVerifyPhoneOtp}
            loading={phoneVerificationLoading}
            tokenReady={phoneOtpTurnstile.isTokenUsable}
            errorMessage={phoneVerificationError}
            unavailable={phoneCountryUnavailable || phoneVerificationState === "unavailable"}
            maskedPhoneHint={phoneSentMaskedHint}
            turnstileSlot={
              <div className="space-y-3">
                <TurnstileWidget
                  siteKeyMissing={phoneOtpTurnstile.siteKeyMissing}
                  setContainer={phoneOtpTurnstile.setContainer}
                  className="min-h-[65px]"
                />
                <TurnstileDebugPanel visible={showTurnstileDiag} diag={phoneOtpTurnstile.diag} />
              </div>
            }
          />

          <HumanVerificationCard
            state={humanVerificationState}
            isOpen={activeCard === "human"}
            onToggle={() => toggleCard("human")}
            onStartHumanVerification={onStartHumanVerification}
            onBeginCapture={onBeginCapture}
            onRetryHuman={onRetryHuman}
            errorMessage={humanErrorMessageOverride || humanErrorMessage}
            challengeInstruction={humanChallenge?.instruction || null}
            previewVideoRef={previewVideoRef}
            hasLivePreview={hasLivePreview}
          />

          <CardVerificationCard
            state={cardVerificationState}
            isOpen={activeCard === "card"}
            onToggle={() => toggleCard("card")}
            onAddCard={onAddCard}
            onRetryCard={onRetryCard}
            onSubmitCard={onSubmitCard}
            canSubmitCard={canSubmitCard}
            cardReadyReason={cardReadyReason}
            cardFieldsMounted={cardFieldsMounted}
            cardFormVisible={cardFormVisibleOverride ?? cardFormVisible}
            cardSubmitting={cardSubmitting}
            cardNumberContainerId={cardNumberContainerIdOverride ?? cardNumberContainerId}
            cardExpiryContainerId={cardExpiryContainerIdOverride ?? cardExpiryContainerId}
            cardCvcContainerId={cardCvcContainerIdOverride ?? cardCvcContainerId}
            legalName={cardLegalNameInput}
            onLegalNameChange={setCardLegalNameInput}
            postalCode={cardPostalCode}
            onPostalCodeChange={setCardPostalCode}
            verifiedLegalName={verifiedLegalName}
            cardBrand={cardBrandOverride ?? cardBrand}
            cardLast4={cardLast4Override ?? cardLast4}
            errorMessage={cardErrorMessageOverride || cardErrorMessage}
            blockedIdentity={blockedIdentity}
            onOpenSupport={() => setSupportOpen(true)}
            onCheckPendingStatus={onCheckCardPendingStatus}
          />

          {isSignupVerifyEntry && overallVerificationStatus === "verified" ? (
            <NeuControl size="lg" fullWidth onClick={onContinueAfterVerification}>
              Continue
            </NeuControl>
          ) : null}
        </div>
      </div>
      <HelpSupportDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        initialSubject="Identity verification support"
        initialMessage={blockedIdentity.blocked ? "I need help with identity verification." : ""}
      />
    </div>
  );
}

export default VerifyIdentity;
