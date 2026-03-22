/**
 * FormField — UI CONTRACT v6.1 § Section 7
 *
 * Anatomy: Label → Control → MessageSlot
 *
 * Wraps: text | email | password | tel | number | search | textarea
 *
 * CSS classes (from global.css §7):
 *   .form-field-rest       — resting inset shadow surface
 *   .form-field-focus      — focus ring + blue border
 *   .form-field-error      — red error ring
 *   .form-field-disabled   — 0.45 opacity, no events
 *
 * Spacing tokens (from tokens.css):
 *   --field-height   52px
 *   --field-radius   14px
 *   --field-gap-lc   6px    label → control
 *   --field-gap-cm   6px    control → message
 *   --field-gap-rel  12px   related fields
 *   --field-gap-unr  20px   unrelated fields
 */

import * as React from "react";
import { Eye, EyeOff, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FormFieldType =
  | "text"
  | "email"
  | "password"
  | "tel"
  | "number"
  | "search";

export interface FormFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Visible label text above the control. */
  label?: string;
  /** Input type. */
  type?: FormFieldType;
  /** Error message shown in red below the control. Activates error ring. */
  error?: string;
  /** Helper/success message shown below the control (grey). */
  hint?: string;
  /** Leading icon rendered inside the left of the field. */
  leadingIcon?: React.ReactNode;
  /** Trailing slot rendered inside the right (overridden by password-toggle/clear). */
  trailingSlot?: React.ReactNode;
  /** Show clearable ✕ button when field has a value. */
  clearable?: boolean;
  /** Callback when clear button is pressed. */
  onClear?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      type = "text",
      error,
      hint,
      leadingIcon,
      trailingSlot,
      clearable,
      onClear,
      className,
      disabled,
      id: providedId,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const autoId = React.useId();
    const fieldId = providedId ?? autoId;

    const resolvedType =
      type === "password" ? (showPassword ? "text" : "password") : type;

    const hasError    = Boolean(error);
    const hasValue    = Boolean(props.value ?? props.defaultValue ?? "");
    const showClear   = clearable && hasValue && !disabled;
    const isSearch    = type === "search";

    return (
      <div
        className={cn(
          "flex flex-col",
          disabled && "form-field-disabled",
          className,
        )}
        style={{ gap: "var(--field-gap-lc, 6px)" }}
      >
        {/* ── Label ── */}
        {label && (
          <label
            htmlFor={fieldId}
            className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1"
          >
            {label}
          </label>
        )}

        {/* ── Control wrapper ── */}
        <div
          className={cn(
            "form-field-rest relative flex items-center",
            hasError && "form-field-error",
          )}
          // Override height to auto when textarea; handled per-type below
        >
          {/* Leading icon */}
          {(leadingIcon || isSearch) && (
            <span className="absolute left-4 flex items-center text-[var(--text-tertiary)] pointer-events-none">
              {isSearch && !leadingIcon ? (
                <Search size={16} strokeWidth={1.75} aria-hidden />
              ) : (
                leadingIcon
              )}
            </span>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={fieldId}
            type={resolvedType}
            disabled={disabled}
            className={cn(
              "field-input-core font-[var(--font)]",
              // Padding — account for icons
              (leadingIcon || isSearch) ? "pl-10" : "pl-4",
              (trailingSlot || showClear || type === "password") ? "pr-10" : "pr-4",
              // Focus ring is on wrapper; remove native
              "focus:outline-none focus:ring-0 focus-visible:outline-none",
              // Peer for wrapper focus detection
              "peer",
            )}
            aria-describedby={
              error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
            }
            aria-invalid={hasError || undefined}
            {...props}
          />

          {/* Trailing: password toggle */}
          {type === "password" && (
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 flex items-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-150"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff size={16} strokeWidth={1.75} aria-hidden />
              ) : (
                <Eye size={16} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          )}

          {/* Trailing: clearable */}
          {showClear && type !== "password" && (
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 flex items-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-150"
              onClick={onClear}
              aria-label="Clear field"
            >
              <X size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}

          {/* Trailing: custom slot */}
          {trailingSlot && type !== "password" && !showClear && (
            <span className="absolute right-3 flex items-center">{trailingSlot}</span>
          )}

          {/* Focus ring overlay — applied via :focus-within on the wrapper */}
          {/* (handled by global.css .form-field-rest:focus-within) */}
        </div>

        {/* ── Message slot ── */}
        <div style={{ marginTop: "var(--field-gap-cm, 6px)" }}>
          {hasError && (
            <p
              id={`${fieldId}-error`}
              role="alert"
              className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1"
            >
              {error}
            </p>
          )}
          {!hasError && hint && (
            <p
              id={`${fieldId}-hint`}
              className="text-[12px] text-[var(--text-tertiary)] pl-1"
            >
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  },
);

FormField.displayName = "FormField";

// ── FormTextArea — same anatomy, textarea control ────────────────────────────

export interface FormTextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
}

const FormTextArea = React.forwardRef<HTMLTextAreaElement, FormTextAreaProps>(
  ({ label, error, hint, className, disabled, id: providedId, ...props }, ref) => {
    const autoId   = React.useId();
    const fieldId  = providedId ?? autoId;
    const hasError = Boolean(error);

    return (
      <div
        className={cn(
          "flex flex-col",
          disabled && "form-field-disabled",
          className,
        )}
        style={{ gap: "var(--field-gap-lc, 6px)" }}
      >
        {label && (
          <label
            htmlFor={fieldId}
            className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1"
          >
            {label}
          </label>
        )}

        <div
          className={cn(
            "form-field-rest relative",
            hasError && "form-field-error",
            // Override fixed height for textarea
            "h-auto min-h-[96px] py-3",
          )}
          style={{ height: "auto" }}
        >
          <textarea
            ref={ref}
            id={fieldId}
            disabled={disabled}
            className={cn(
              "field-input-core resize-none font-[var(--font)]",
              "px-4 focus:outline-none focus:ring-0",
            )}
            aria-describedby={
              error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
            }
            aria-invalid={hasError || undefined}
            {...props}
          />
        </div>

        <div style={{ marginTop: "var(--field-gap-cm, 6px)" }}>
          {hasError && (
            <p
              id={`${fieldId}-error`}
              role="alert"
              className="text-[12px] font-medium text-[var(--color-error,#E84545)] pl-1"
            >
              {error}
            </p>
          )}
          {!hasError && hint && (
            <p id={`${fieldId}-hint`} className="text-[12px] text-[var(--text-tertiary)] pl-1">
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  },
);

FormTextArea.displayName = "FormTextArea";

export { FormField, FormTextArea };
