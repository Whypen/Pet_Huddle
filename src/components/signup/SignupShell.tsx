/**
 * SignupShell — C.5
 * Shared layout for all signup steps.
 * Fixed progress bar + transparent step nav + scrollable form body + glass-bar CTA.
 *
 * Step transition:
 *   Enter: opacity→1 + translateX(16px→0)  240ms ease-out
 *   Exit:  opacity→0 + translateX(0→-16px) 180ms ease-in  (parent sets isExiting=true)
 *   No overlap — exit completes before enter begins.
 */

import React from "react";
import { ArrowLeft } from "lucide-react";

// ─── Keyframes ────────────────────────────────────────────────────────────────

const STEP_KEYFRAMES = `
  @keyframes signup-step-in {
    from { opacity: 0; transform: translateX(16px); }
    to   { opacity: 1; transform: translateX(0);    }
  }
  @keyframes signup-step-out {
    from { opacity: 1; transform: translateX(0);    }
    to   { opacity: 0; transform: translateX(-16px); }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignupShellProps {
  /** 1-based current step number */
  step: number;
  /** Total steps in the flow (default 4) */
  totalSteps?: number;
  /** Back button handler — omit to hide back button */
  onBack?: () => void;
  /** Optional skip label shown on the right */
  skipLabel?: string;
  /** Skip button handler */
  onSkip?: () => void;
  /** Whether the page is currently exiting (triggers exit animation) */
  isExiting?: boolean;
  /** CTA slot — rendered inside glass-bar fixed bottom */
  cta: React.ReactNode;
  /** Show the center step counter text */
  showStepCounter?: boolean;
  children: React.ReactNode;
}

// ─── SignupShell ──────────────────────────────────────────────────────────────

export const SignupShell: React.FC<SignupShellProps> = ({
  step,
  totalSteps = 4,
  onBack,
  skipLabel,
  onSkip,
  isExiting = false,
  cta,
  showStepCounter = true,
  children,
}) => {
  const fillPct = (step / totalSteps) * 100;

  return (
    <div className="min-h-svh relative">
      <style>{STEP_KEYFRAMES}</style>

      {/* ── Progress bar — fixed top ────────────────────────────────────────── */}
      <div
        className="fixed top-0 inset-x-0 z-[25] h-[3px]"
        style={{ background: "rgba(255,255,255,0.28)" }}
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
      >
        <div
          className="h-full"
          style={{
            width: `${fillPct}%`,
            background: "linear-gradient(90deg, #2145CF, #3A5FE8)",
            transition: "width 350ms ease-out",
          }}
        />
      </div>

      {/* ── Animated content ──────────────────────────────────────────────── */}
      <div
        style={{
          paddingTop: "3px",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
          animation: isExiting
            ? "signup-step-out 180ms ease-in forwards"
            : "signup-step-in 240ms ease-out forwards",
        }}
      >
        {/* Step nav row */}
        <div className="h-14 px-5 flex items-center justify-between">
          {/* Back button or empty spacer */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="w-[40px] h-[40px] -ml-[8px] rounded-[12px] flex items-center justify-center text-[rgba(74,73,101,0.55)] hover:text-[#424965] hover:bg-[rgba(255,255,255,0.38)] [transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]"
              aria-label="Back"
            >
              <ArrowLeft size={24} strokeWidth={1.5} />
            </button>
          ) : (
            <div className="w-[40px]" />
          )}

          {/* Step counter */}
          {showStepCounter ? (
            <span className="text-[13px] font-[400] text-[rgba(74,73,101,0.55)]">
              Step {step} of {totalSteps}
            </span>
          ) : (
            <div className="w-[88px]" />
          )}

          {/* Skip button or empty spacer */}
          {skipLabel && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="text-[13px] font-[400] text-[rgba(74,73,101,0.55)] min-h-[44px] min-w-[44px] flex items-center justify-end hover:text-[#424965] transition-colors duration-150"
            >
              {skipLabel}
            </button>
          ) : (
            <div className="w-[40px]" />
          )}
        </div>

        {/* Form body */}
        <div className="max-w-[420px] mx-auto px-5 pt-10">
          {children}
        </div>
      </div>

      {/* ── CTA bar — glass-bar fixed bottom ───────────────────────────────── */}
      <div
        className="glass-bar fixed bottom-0 inset-x-0 z-[25] px-5 pt-3"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        {cta}
      </div>
    </div>
  );
};

export default SignupShell;
