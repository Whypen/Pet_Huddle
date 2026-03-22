/**
 * FormFieldOtp — UI CONTRACT v6.1 § Section 7
 *
 * 6-digit OTP / verification code input.
 * Each cell: .form-field-rest surface, 52×56 portrait aspect.
 * Auto-advances focus on input, handles paste.
 *
 * Anatomy: Label → Cell row → MessageSlot
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;

export interface FormFieldOtpProps {
  /** Visible label above cells. */
  label?: string;
  /** Controlled value (string of digits). */
  value?: string;
  /** Change handler (emits full code string). */
  onChange?: (value: string) => void;
  /** Error message. */
  error?: string;
  /** Hint message. */
  hint?: string;
  /** Disable all cells. */
  disabled?: boolean;
  /** Custom cell count (defaults to 6). */
  length?: number;
  className?: string;
}

const FormFieldOtp = React.forwardRef<HTMLDivElement, FormFieldOtpProps>(
  (
    {
      label,
      value = "",
      onChange,
      error,
      hint,
      disabled,
      length = OTP_LENGTH,
      className,
    },
    ref,
  ) => {
    const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);
    const hasError  = Boolean(error);

    const digits = Array.from({ length }, (_, i) => value[i] ?? "");

    const handleChange = (idx: number, char: string) => {
      const sanitized = char.replace(/\D/g, "").slice(-1);
      const next = [...digits];
      next[idx] = sanitized;
      onChange?.(next.join(""));
      if (sanitized && idx < length - 1) {
        inputsRef.current[idx + 1]?.focus();
      }
    };

    const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (!digits[idx] && idx > 0) {
          const next = [...digits];
          next[idx - 1] = "";
          onChange?.(next.join(""));
          inputsRef.current[idx - 1]?.focus();
        } else {
          const next = [...digits];
          next[idx] = "";
          onChange?.(next.join(""));
        }
      } else if (e.key === "ArrowLeft" && idx > 0) {
        inputsRef.current[idx - 1]?.focus();
      } else if (e.key === "ArrowRight" && idx < length - 1) {
        inputsRef.current[idx + 1]?.focus();
      }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
      onChange?.(pasted.padEnd(length, "").slice(0, length));
      const focusIdx = Math.min(pasted.length, length - 1);
      inputsRef.current[focusIdx]?.focus();
    };

    return (
      <div
        ref={ref}
        className={cn("flex flex-col", disabled && "opacity-[0.45] pointer-events-none", className)}
        style={{ gap: "var(--field-gap-lc, 6px)" }}
      >
        {label && (
          <label className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1">
            {label}
          </label>
        )}

        {/* Cell row */}
        <div className="flex items-center justify-between gap-2">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => { inputsRef.current[idx] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={disabled}
              aria-label={`Digit ${idx + 1}`}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className={cn(
                // Cell shape
                "form-field-rest flex-1",
                "min-w-0 aspect-[52/56] max-w-[52px]",
                // Override min-h from form-field-rest for portrait cells
                "!h-auto",
                hasError && "form-field-error",
                // Typography
                "text-center text-[22px] font-bold text-[var(--text-primary,#424965)]",
                "font-[var(--font)]",
                // Reset native
                "outline-none border-0 bg-transparent caret-[var(--blue,#2145CF)]",
                "focus:outline-none focus:ring-0",
              )}
            />
          ))}
        </div>

        {/* Message slot */}
        <div style={{ marginTop: "var(--field-gap-cm, 6px)" }}>
          {hasError && (
            <p role="alert" className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1">
              {error}
            </p>
          )}
          {!hasError && hint && (
            <p className="text-[12px] text-[var(--text-tertiary)] pl-1">{hint}</p>
          )}
        </div>
      </div>
    );
  },
);

FormFieldOtp.displayName = "FormFieldOtp";

export { FormFieldOtp };
