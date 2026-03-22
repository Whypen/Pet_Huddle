/**
 * NeuDropdown — UI CONTRACT v6.1 § Section 7
 *
 * Neumorphic select built on Radix Select.
 * Always uses position="popper" max-h-[260px] for iOS mobile safety.
 *
 * Anatomy: Label → Control (trigger) → MessageSlot
 * CSS: .form-field-rest / .form-field-error / .form-field-disabled
 */

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NeuDropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NeuDropdownProps {
  /** Visible label above the trigger. */
  label?: string;
  /** Error message (red). */
  error?: string;
  /** Hint message (grey). */
  hint?: string;
  /** Placeholder text when no value selected. */
  placeholder?: string;
  /** Options array. */
  options: NeuDropdownOption[];
  /** Controlled value. */
  value?: string;
  /** Default value (uncontrolled). */
  defaultValue?: string;
  /** Change handler. */
  onValueChange?: (value: string) => void;
  /** Disable entire dropdown. */
  disabled?: boolean;
  /** Custom id for a11y. */
  id?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const NeuDropdown = React.forwardRef<HTMLButtonElement, NeuDropdownProps>(
  (
    {
      label,
      error,
      hint,
      placeholder = "Select…",
      options,
      value,
      defaultValue,
      onValueChange,
      disabled,
      id: providedId,
      className,
    },
    ref,
  ) => {
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
        {/* Label */}
        {label && (
          <label
            htmlFor={fieldId}
            className="text-[13px] font-semibold text-[var(--text-primary,#424965)] pl-1"
          >
            {label}
          </label>
        )}

        {/* Trigger */}
        <SelectPrimitive.Root
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            id={fieldId}
            aria-describedby={
              error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
            }
            aria-invalid={hasError || undefined}
            className={cn(
              "form-field-rest",
              hasError && "form-field-error",
              // Layout
              "flex items-center justify-between w-full",
              "text-[15px] font-medium font-[var(--font)]",
              "text-left",
              // Focus override — wrapper handles ring
              "focus:outline-none focus-visible:outline-none",
            )}
          >
            <SelectPrimitive.Value
              placeholder={
                <span className="text-[var(--text-tertiary)]">{placeholder}</span>
              }
            />
            <SelectPrimitive.Icon asChild>
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                className="text-[var(--text-tertiary)] shrink-0 transition-transform duration-150 [[data-state=open]_&]:rotate-180"
                aria-hidden
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          {/* Dropdown content — position=popper for iOS safety (MEMORY) */}
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              sideOffset={6}
              className={cn(
                "z-50 w-[--radix-select-trigger-width]",
                "max-h-[260px] overflow-y-auto",
                "glass-card",
                "p-1.5",
                "data-[state=open]:animate-[v3-modal-in_200ms_var(--ease-out)]",
              )}
            >
              <SelectPrimitive.Viewport>
                {options.map((opt) => (
                  <SelectPrimitive.Item
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    className={cn(
                      "relative flex items-center justify-between",
                      "h-[44px] px-4 rounded-[10px]",
                      "text-[14px] font-medium text-[var(--text-primary,#424965)]",
                      "cursor-pointer select-none outline-none",
                      "transition-[background] duration-100",
                      "hover:bg-[rgba(255,255,255,0.58)]",
                      "focus:bg-[rgba(255,255,255,0.58)]",
                      "data-[disabled]:opacity-40 data-[disabled]:pointer-events-none",
                      "data-[state=checked]:text-[var(--blue,#2145CF)] data-[state=checked]:font-semibold",
                    )}
                  >
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check size={14} strokeWidth={2} aria-hidden />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>

        {/* Message slot */}
        {(hasError || hint) && (
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
        )}
      </div>
    );
  },
);

NeuDropdown.displayName = "NeuDropdown";

export { NeuDropdown };
