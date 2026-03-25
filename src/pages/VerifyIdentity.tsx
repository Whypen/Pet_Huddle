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
} from "@/lib/verifyIdentityApi";
import { supabase } from "@/integrations/supabase/client";
import { useSignup } from "@/contexts/SignupContext";
import { requestPhoneOtp, verifyPhoneOtp } from "@/lib/phoneOtp";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

type HumanVerificationState =
  | "idle" | "ready" | "capturing" | "pending" | "passed" | "failed";

type CardVerificationState =
  | "idle" | "collecting" | "submitting" | "pending" | "passed" | "failed";

type OverallVerificationStatus =
  | "unverified" | "pending" | "verified";

type PhoneVerificationState =
  | "idle" | "sent" | "verified" | "failed";

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
  errorMessage?: string | null;
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
  errorMessage,
}: PhoneVerificationCardProps) {
  const isVerified = state === "verified";
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

  const canResend = countdown === 0 && !loading;
  const sendLabel = useMemo(() => {
    if (loading && !otpSent) return "Sending…";
    if (countdown > 0) return `Resend in ${countdown}s`;
    return otpSent ? "Resend" : "Send OTP";
  }, [loading, otpSent, countdown]);

  const handleSend = useCallback(() => {
    if (loading || countdown > 0) return;
    onSendOtp();
  }, [loading, countdown, onSendOtp]);

  return (
    <InsetPanel>
      <button
        type="button"
        disabled={isVerified}
        onClick={isVerified ? undefined : onToggle}
        aria-expanded={!isVerified && isOpen}
        aria-controls="phone-verification-panel"
        className={cn(
          "flex items-center gap-3 w-full px-4 py-3.5 min-h-[52px] text-left",
          isVerified
            ? "cursor-default"
            : "cursor-pointer active:bg-[rgba(255,255,255,0.55)] transition-[background] duration-100",
        )}
      >
        <Phone
          size={16}
          strokeWidth={1.75}
          className={cn(
            "shrink-0",
            isVerified ? "text-[var(--color-success,#22C55E)]" : "text-[var(--text-secondary)]",
          )}
        />
        <span className="flex-1 text-[15px] font-medium text-[var(--text-primary,#424965)]">
          Verify with phone number
        </span>
        {isVerified ? (
          <span className="text-[11px] font-semibold text-[var(--color-success,#22C55E)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded-full">
            Complete
          </span>
        ) : null}
      </button>

      {isOpen && !isVerified && (
        <>
          <InsetDivider />
          <div id="phone-verification-panel" className="px-4 py-4 flex flex-col gap-3">
            {/* Phone input row with inline Send OTP button */}
            <div className="space-y-1.5">
              <p className="text-[13px] text-[var(--text-secondary)]">Mobile number</p>
              <div className="form-field-rest relative flex items-center">
                <Phone className="absolute left-4 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none z-10" />
                <PhoneInput
                  international
                  value={phone}
                  onChange={(value) => onPhoneChange(value || "")}
                  disabled={otpSent && countdown > 0}
                  className="w-full pl-10 pr-[110px] [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none"
                  inputStyle={{
                    width: "100%",
                    height: "100%",
                    fontSize: "15px",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary, #424965)",
                  }}
                />
                {/* Inline Send OTP button */}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canResend && countdown > 0}
                  className={cn(
                    "absolute right-2 h-[30px] px-3 rounded-[8px] text-[12px] font-semibold transition-colors shrink-0",
                    canResend || !otpSent
                      ? "bg-brandBlue text-white active:opacity-80"
                      : "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
                  )}
                >
                  {sendLabel}
                </button>
              </div>
            </div>

            {/* OTP code input — revealed after sending */}
            {otpSent && (
              <div className="space-y-1.5">
                <p className="text-[13px] text-[var(--text-secondary)]">Verification code</p>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    className="w-full h-[42px] rounded-[10px] border border-[rgba(163,168,190,0.3)] bg-white pl-3 pr-[90px] text-[15px] text-[var(--text-primary,#424965)] outline-none focus:border-brandBlue tracking-[0.2em]"
                    autoComplete="one-time-code"
                  />
                  <button
                    type="button"
                    onClick={onVerifyOtp}
                    disabled={loading || otpCode.length < 6}
                    className={cn(
                      "absolute right-2 h-[30px] px-3 rounded-[8px] text-[12px] font-semibold transition-colors shrink-0",
                      !loading && otpCode.length >= 6
                        ? "bg-brandBlue text-white active:opacity-80"
                        : "bg-[rgba(163,168,190,0.15)] text-[var(--text-tertiary)] cursor-default"
                    )}
                  >
                    {loading ? "…" : "Verify"}
                  </button>
                </div>
              </div>
            )}

            {errorMessage ? (
              <p className="text-[12px] text-[var(--color-error,#E84545)]">{errorMessage}</p>
            ) : null}
          </div>
        </>
      )}
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
  postalCode?: string;
  onPostalCodeChange?: (value: string) => void;
  cardBrand?: string | null;
  cardLast4?: string | null;
  errorMessage?: string | null;
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
  postalCode = "",
  onPostalCodeChange,
  cardBrand,
  cardLast4,
  errorMessage,
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
              <p className="font-mono tracking-[0.08em] text-[15px] text-[var(--text-primary,#424965)]">
                &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; {cardLast4 || "••••"}
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                {cardBrand ? `${cardBrand.toUpperCase()} verified` : "Verified card"}
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
  if (reason === "face_not_stably_detected" || detectedFrames < 6) {
    return "We couldn't detect your face steadily. Keep your whole face inside the oval in a well-lit place.";
  }
  if (challengeType === "turn_left_right" && (leftTravel < 0.16 || rightTravel < 0.16 || horizontalShift < 0.48)) {
    return "Move your head clearly left and right while staying inside the oval.";
  }
  if (challengeType === "look_up_down" && (upTravel < 0.14 || downTravel < 0.14 || verticalShift < 0.4)) {
    return "Move your head clearly up and down while staying inside the oval.";
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

  const [humanAttemptId, setHumanAttemptId] = useState<string | null>(null);
  const [humanChallenge, setHumanChallenge] = useState<HumanChallenge | null>(null);
  const [humanErrorMessage, setHumanErrorMessage] = useState<string | null>(null);
  const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
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

  // ── Nav state (survives Stripe full-page redirect) ──────────────────────────
  const VERIFY_IDENTITY_NAV_KEY = "huddle_vi_nav";
  const navStateRef = useRef<{ backTo?: string; returnTo?: string; from?: string }>({});
  const canSubmitCard =
    cardFormVisible
    && cardFieldsMounted
    && cardNumberComplete
    && cardExpiryComplete
    && cardCvcComplete
    && !cardSubmitting
    && Boolean(cardClientSecret)
    && Boolean(cardSetupIntentId);

  useEffect(() => {
    const locState = location.state as { backTo?: string; returnTo?: string; from?: string } | null;
    if (locState?.backTo || locState?.returnTo || locState?.from) {
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
    } else {
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
    void (async () => {
      // Directly persist verified state so badge shows immediately even if edge function is slow
      if (user?.id) {
        await supabase
          .from("profiles")
          .update({ is_verified: true, verification_status: "verified" })
          .eq("id", user.id)
          .then(() => {/* best-effort */});
      }
      await refreshProfile();
      // Brevo CRM sync — fire-and-forget, reflects pending status immediately.
      // Note: approval/rejection sync requires a DB trigger (admin flow is server-side).
      if (user?.id) {
        void supabase.functions.invoke("brevo-sync", {
          body: { event: "verification_completed", user_id: user.id },
        }).catch((err) => console.warn("[brevo-sync] verification_completed failed silently", err));
      }
    })();
  }, [overallVerificationStatus, refreshProfile, user?.id]);

  const onContinueAfterVerification = useCallback(() => {
    allowVerifiedReturnRef.current = false;
    try { sessionStorage.removeItem(VERIFY_IDENTITY_NAV_KEY); } catch { /* best-effort */ }
    setFlowState("signup");
    navigate("/set-profile", { replace: true });
  }, [navigate, setFlowState]);

  const ensureAuthForVerification = async (): Promise<boolean> => {
    if (authLoading) return false;
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
    cardBrand: string | null;
    cardLast4: string | null;
    setupIntentId?: string | null;
    lastSetupError?: { message?: string | null; code?: string | null } | null;
    source: string;
  }) => {
    const uiState = toCardUiState(params.cardStatus, params.cardVerified);
    const hasActiveCardAttempt =
      cardFormVisible && (cardVerificationState === "collecting" || cardVerificationState === "submitting");
    const differentSetupIntent =
      Boolean(cardSetupIntentId)
      && Boolean(params.setupIntentId)
      && cardSetupIntentId !== params.setupIntentId;

    if (uiState !== "passed" && (hasActiveCardAttempt || differentSetupIntent)) {
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
    setCardBrand(params.cardBrand || null);
    setCardLast4(params.cardLast4 || null);

    if (uiState === "passed") {
      resetCardFormRuntime();
      setCardErrorMessage(null);
      logCardState("resolved_status_passed", { source: params.source });
      return;
    }

    if (uiState === "failed") {
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
    cardBrand: string | null;
    cardLast4: string | null;
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
      cardBrand: snapshot.cardBrand || null,
      cardLast4: snapshot.cardLast4 || null,
      setupIntentId: snapshot.setupIntentId || null,
      lastSetupError: snapshot.cardLastError || null,
      source: "snapshot",
    });
  }, [syncCardUiFromResolvedStatus]);

  const refreshVerificationSnapshot = useCallback(async () => {
    const snapshot = await fetchVerifyIdentitySnapshot();
    applySnapshot(snapshot);
    return snapshot;
  }, [applySnapshot]);

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
        cardBrand: status.cardBrand,
        cardLast4: status.cardLast4,
        setupIntentId: status.setupIntentId,
        lastSetupError: status.cardLastError,
        source: "pull_card_status",
      });
      return status;
    } finally {
      cardStatusInFlightRef.current = false;
    }
  }, [syncCardUiFromResolvedStatus]);

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
          await resolvePhoneVerificationState(liveSession.user.id);
        }
        await trackDeviceFingerprint("verify_identity_entry");
        const snapshot = await fetchVerifyIdentitySnapshot();
        if (!isMounted) return;
        applySnapshot(snapshot);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug("[VerifyIdentity] bootstrap waiting", error);
        }
      }
    };

    void bootstrap();
    return () => {
      isMounted = false;
      resetCardFormRuntime();
    };
  }, [authLoading, resetCardFormRuntime, resolvePhoneVerificationState]);

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

  const onSendPhoneOtp = async () => {
    if (!(await ensureAuthForVerification())) return;
    const normalized = phoneValue.trim();
    if (!normalized) {
      setPhoneVerificationError("Please enter a phone number first.");
      return;
    }
    setPhoneVerificationLoading(true);
    setPhoneVerificationError(null);
    const result = await requestPhoneOtp(normalized);
    setPhoneVerificationLoading(false);
    if (!result.ok) {
      setPhoneVerificationState("failed");
      setPhoneVerificationError(result.error || "Failed to send OTP.");
      return;
    }
    setPhoneVerificationState("sent");
    setPhoneVerificationError(null);
  };

  const onVerifyPhoneOtp = async () => {
    if (!(await ensureAuthForVerification())) return;
    const normalizedPhone = phoneValue.trim();
    const normalizedCode = phoneOtpCode.trim();
    if (!normalizedPhone || !normalizedCode) {
      setPhoneVerificationError("Please enter your phone and OTP.");
      return;
    }
    setPhoneVerificationLoading(true);
    setPhoneVerificationError(null);
    const result = await verifyPhoneOtp(normalizedPhone, normalizedCode);
    setPhoneVerificationLoading(false);
    if (!result.ok) {
      setPhoneVerificationState("failed");
      setPhoneVerificationError(result.error || "Invalid OTP.");
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

  const onAddCard = async () => {
    if (onAddCardOverride) {
      onAddCardOverride();
      return;
    }
    if (cardSetupInFlightRef.current) return;
    if (!(await ensureAuthForVerification())) return;
    cardSetupInFlightRef.current = true;
    try {
      setActiveCard("card");
      resetCardFormRuntime();
      setCardErrorMessage(null);
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
        setCardVerificationState("failed");
        setCardReadyReason(null);
        setCardErrorMessage("Card form failed to mount. Please retry.");
        logCardState("card_field_loaderror", { field });
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
          toast.success("Card verification complete.");
          logCardState("confirm_card_setup_passed");
        } else if (status?.cardStatus === "failed") {
          setCardErrorMessage(GENERIC_CARD_ERROR_MESSAGE);
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
        toast.success("Card verification complete.");
        return;
      }
      if (status.cardStatus === "failed") {
        setCardErrorMessage(GENERIC_CARD_ERROR_MESSAGE);
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
        const snapshot = await fetchVerifyIdentitySnapshot();
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
    }, 7000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authLoading, user, humanVerificationState, cardVerificationState, pullCardStatus]);

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

          <PhoneVerificationCard
            state={phoneVerificationState}
            isOpen={activeCard === "phone"}
            onToggle={() => toggleCard("phone")}
            phone={phoneValue}
            otpCode={phoneOtpCode}
            onPhoneChange={setPhoneValue}
            onOtpChange={setPhoneOtpCode}
            onSendOtp={onSendPhoneOtp}
            onVerifyOtp={onVerifyPhoneOtp}
            loading={phoneVerificationLoading}
            errorMessage={phoneVerificationError}
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
            postalCode={cardPostalCode}
            onPostalCodeChange={setCardPostalCode}
            cardBrand={cardBrandOverride ?? cardBrand}
            cardLast4={cardLast4Override ?? cardLast4}
            errorMessage={cardErrorMessageOverride || cardErrorMessage}
            onCheckPendingStatus={onCheckCardPendingStatus}
          />

          {isSignupVerifyEntry && overallVerificationStatus === "verified" ? (
            <NeuControl size="lg" fullWidth onClick={onContinueAfterVerification}>
              Continue
            </NeuControl>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default VerifyIdentity;
