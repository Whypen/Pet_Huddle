/**
 * NeuToggle — UI CONTRACT v6.1 § Section 6
 *
 * Neumorphic toggle/switch built on Radix Switch.
 * Uses .neu-rest / .neu-primary CSS classes from global.css §6.
 *
 * Track: 50×28 — thumb: 22×22 circular knob
 * Checked track → primary blue surface
 * Thumb always: white neu-rest surface
 */

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export interface NeuToggleProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  /** Visible label to the right of the toggle. */
  label?: string;
  /** Secondary hint text below the label. */
  hint?: string;
}

const NeuToggle = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  NeuToggleProps
>(({ label, hint, className, id: providedId, ...props }, ref) => {
  const autoId  = React.useId();
  const toggleId = providedId ?? autoId;

  return (
    <div className="flex items-center gap-3">
      <SwitchPrimitive.Root
        ref={ref}
        id={toggleId}
        className={cn(
          // Track shape
          "relative inline-flex h-[28px] w-[50px] shrink-0",
          "cursor-pointer rounded-full",
          // Resting surface (unchecked)
          "neu-rest bg-[rgba(255,255,255,0.72)]",
          // Checked track → blue
          "data-[state=checked]:neu-primary data-[state=checked]:bg-[linear-gradient(135deg,#2A53E0,#1C3ECC)]",
          // Transitions (explicit, no transition-all)
          "transition-[box-shadow,background] duration-200 [transition-timing-function:var(--ease-out)]",
          // Focus ring
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue,#2145CF)] focus-visible:ring-offset-2",
          // Disabled
          "disabled:opacity-[0.38] disabled:pointer-events-none",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            // Thumb shape
            "block h-[22px] w-[22px] rounded-full",
            // White neumorphic knob
            "bg-white",
            "shadow-[2px_2px_5px_rgba(163,168,190,0.35),-1px_-1px_4px_rgba(255,255,255,0.90),inset_0_1px_0_rgba(255,255,255,0.90)]",
            // Position
            "mt-[3px] ml-[3px]",
            "data-[state=checked]:translate-x-[22px]",
            // Motion
            "transition-transform duration-200 [transition-timing-function:var(--ease-out)]",
          )}
        />
      </SwitchPrimitive.Root>

      {(label || hint) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <label
              htmlFor={toggleId}
              className="text-[14px] font-medium text-[var(--text-primary,#424965)] cursor-pointer select-none"
            >
              {label}
            </label>
          )}
          {hint && (
            <span className="text-[12px] text-[var(--text-tertiary)]">{hint}</span>
          )}
        </div>
      )}
    </div>
  );
});

NeuToggle.displayName = "NeuToggle";

export { NeuToggle };
