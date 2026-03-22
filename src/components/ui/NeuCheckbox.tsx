/**
 * NeuCheckbox — UI CONTRACT v6.1 § Section 6
 *
 * Neumorphic checkbox built on Radix Checkbox.
 * Uses .neu-rest / .neu-selected CSS classes from global.css §6.
 *
 * Anatomy: Control + Label
 * Size: 22×22 tap target, 18×18 visual surface
 */

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NeuCheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** Visible label text to the right of the checkbox. */
  label?: string;
  /** Error state indicator. */
  error?: boolean;
}

const NeuCheckbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  NeuCheckboxProps
>(({ label, error, className, id: providedId, ...props }, ref) => {
  const autoId = React.useId();
  const checkId = providedId ?? autoId;

  return (
    <div className="flex items-center gap-3">
      <CheckboxPrimitive.Root
        ref={ref}
        id={checkId}
        className={cn(
          // Visual surface
          "relative flex items-center justify-center shrink-0",
          "h-[22px] w-[22px] rounded-[6px]",
          // Neumorphic resting state
          "neu-rest bg-[rgba(255,255,255,0.72)]",
          // Checked → selected state
          "data-[state=checked]:neu-primary data-[state=checked]:bg-[var(--blue,#2145CF)]",
          // Focus
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue,#2145CF)] focus-visible:ring-offset-2",
          // Error state border
          error && "ring-2 ring-[var(--color-error,#E84545)] ring-offset-1",
          // Transitions (no transition-all)
          "transition-[box-shadow,background] duration-150 [transition-timing-function:var(--ease-out)]",
          // Disabled
          "disabled:opacity-[0.38] disabled:pointer-events-none",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator asChild>
          <Check
            size={13}
            strokeWidth={2.5}
            className="text-white"
            aria-hidden
          />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>

      {label && (
        <label
          htmlFor={checkId}
          className={cn(
            "text-[14px] font-medium text-[var(--text-primary,#424965)]",
            "cursor-pointer select-none leading-snug",
            "data-[disabled]:opacity-[0.38]",
          )}
        >
          {label}
        </label>
      )}
    </div>
  );
});

NeuCheckbox.displayName = "NeuCheckbox";

export { NeuCheckbox };
