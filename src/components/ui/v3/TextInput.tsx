/**
 * TextInput — UI CONTRACT v3 — B.3
 *
 * variants: input (default) | textarea
 *
 * Critical rules:
 *  — font-size MUST be 16px (iOS Safari zoom prevention, D.8)
 *  — border-radius MUST be 12px (D.9)
 *  — padding: 0 14px per spec
 *  — inset shadow: inset 2px 2px 6px rgba(0,87,255,0.10), inset -1px -1px 4px rgba(255,255,255,0.80)
 *  — focus adds outer ring: 0 0 0 2px rgba(33,69,207,0.20)
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Base class string shared by input + textarea ───────────────────────────

const BASE = [
  // Geometry (B.3)
  "rounded-[12px]",
  // Background + border (B.3)
  "bg-[rgba(255,255,255,0.55)] border border-[rgba(255,255,255,0.55)]",
  // Inset shadow (B.3)
  "shadow-[inset_2px_2px_6px_rgba(0,87,255,0.10),inset_-1px_-1px_4px_rgba(255,255,255,0.80)]",
  // Typography (B.3 — 16px fixed for iOS zoom prevention)
  "text-[16px] text-[#424965] placeholder:text-[#424965]/45",
  // Focus (B.3)
  "focus:border-[rgba(33,69,207,0.50)]",
  "focus:shadow-[inset_2px_2px_6px_rgba(0,87,255,0.10),0_0_0_2px_rgba(33,69,207,0.20)]",
  // Reset
  "outline-none w-full",
  // Motion — A.8 shadow transition
  "transition-shadow duration-150",
].join(" ");

// ─── TextInput (single-line) ────────────────────────────────────────────────

export interface TextInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?:   string;
  error?:   string;
  hint?:    string;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId     = id ?? generatedId;

    return (
      <div className="flex flex-col gap-[8px]">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-[#424965] leading-[1.40] tracking-[0.01em]"
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={cn(
            BASE,
            // B.3: height 44px, padding 0 14px
            "h-[44px] px-[14px]",
            error && "border-[rgba(232,69,69,0.60)] focus:shadow-[inset_2px_2px_6px_rgba(232,69,69,0.10),0_0_0_2px_rgba(232,69,69,0.20)]",
            className,
          )}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          aria-invalid={!!error}
          {...props}
        />

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-[11px] font-medium text-[#E84545] leading-[1.45] tracking-[0.02em]"
          >
            {error}
          </p>
        )}
        {!error && hint && (
          <p
            id={`${inputId}-hint`}
            className="text-[11px] text-[rgba(74,73,101,0.55)] leading-[1.45] tracking-[0.02em]"
          >
            {hint}
          </p>
        )}
      </div>
    );
  },
);

TextInput.displayName = "TextInput";

// ─── TextArea ──────────────────────────────────────────────────────────────

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?:     string;
  error?:     string;
  hint?:      string;
  /** Auto-expand to fit content up to maxRows */
  autoGrow?:  boolean;
  maxRows?:   number;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      label,
      error,
      hint,
      autoGrow = false,
      maxRows  = 6,
      className,
      id,
      onChange,
      style,
      ...props
    },
    ref,
  ) => {
    const generatedId  = React.useId();
    const inputId      = id ?? generatedId;
    const innerRef     = React.useRef<HTMLTextAreaElement>(null);
    const resolvedRef  = (ref as React.RefObject<HTMLTextAreaElement>) ?? innerRef;

    // Auto-grow handler
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (autoGrow && resolvedRef.current) {
          const el = resolvedRef.current;
          el.style.height = "auto";
          const lineHeight  = 24; // 16px font × 1.5 line-height ≈ 24px
          const maxHeight   = lineHeight * maxRows + 20; // +20 for py-[10px]
          el.style.height   = `${Math.min(el.scrollHeight, maxHeight)}px`;
        }
        onChange?.(e);
      },
      [autoGrow, maxRows, onChange, resolvedRef],
    );

    return (
      <div className="flex flex-col gap-[8px]">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-[#424965] leading-[1.40] tracking-[0.01em]"
          >
            {label}
          </label>
        )}

        <textarea
          ref={resolvedRef}
          id={inputId}
          className={cn(
            BASE,
            // B.3 textarea: min-height 44px, padding 10px 14px, no resize
            "min-h-[44px] px-[14px] py-[10px] leading-[1.55] resize-none overflow-y-auto",
            error && "border-[rgba(232,69,69,0.60)] focus:shadow-[inset_2px_2px_6px_rgba(232,69,69,0.10),0_0_0_2px_rgba(232,69,69,0.20)]",
            className,
          )}
          style={style}
          onChange={handleChange}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          aria-invalid={!!error}
          {...props}
        />

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-[11px] font-medium text-[#E84545] leading-[1.45] tracking-[0.02em]"
          >
            {error}
          </p>
        )}
        {!error && hint && (
          <p
            id={`${inputId}-hint`}
            className="text-[11px] text-[rgba(74,73,101,0.55)] leading-[1.45] tracking-[0.02em]"
          >
            {hint}
          </p>
        )}
      </div>
    );
  },
);

TextArea.displayName = "TextArea";
