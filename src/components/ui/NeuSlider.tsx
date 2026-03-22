/**
 * NeuSlider — UI CONTRACT v6.1 § Section 6
 *
 * Neumorphic slider built on Radix Slider.
 * Track: recessed inset surface (.form-field-rest-like)
 * Range fill: primary blue
 * Thumb: white neu-rest knob (24px)
 */

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export interface NeuSliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Visible label above the slider. */
  label?: string;
  /** Show current value badge next to label. */
  showValue?: boolean;
  /** Format function for displayed value. */
  formatValue?: (v: number) => string;
}

const NeuSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  NeuSliderProps
>(
  (
    {
      label,
      showValue = false,
      formatValue,
      className,
      value,
      defaultValue,
      ...props
    },
    ref,
  ) => {
    // Read current value for display
    const currentValue = value ?? defaultValue ?? [0];
    const displayValue = Array.isArray(currentValue) ? currentValue[0] : currentValue;
    const formatted    = formatValue ? formatValue(displayValue) : String(displayValue);

    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {(label || showValue) && (
          <div className="flex items-center justify-between px-1">
            {label && (
              <span className="text-[13px] font-semibold text-[var(--text-primary,#424965)]">
                {label}
              </span>
            )}
            {showValue && (
              <span className="text-[13px] font-semibold text-[var(--blue,#2145CF)]">
                {formatted}
              </span>
            )}
          </div>
        )}

        <SliderPrimitive.Root
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          className="relative flex w-full touch-none select-none items-center"
          {...props}
        >
          {/* Track — recessed inset */}
          <SliderPrimitive.Track
            className={cn(
              "relative h-[8px] w-full grow overflow-hidden rounded-full",
              // Inset neu surface (like form-field-rest but smaller)
              "bg-[rgba(255,255,255,0.55)]",
              "shadow-[inset_2px_2px_5px_rgba(163,168,190,0.35),inset_-1px_-1px_4px_rgba(255,255,255,0.90)]",
            )}
          >
            {/* Range fill — primary blue */}
            <SliderPrimitive.Range
              className="absolute h-full rounded-full bg-[linear-gradient(90deg,#2A53E0,#1C3ECC)]"
            />
          </SliderPrimitive.Track>

          {/* Thumb — neu knob */}
          <SliderPrimitive.Thumb
            className={cn(
              "block h-[24px] w-[24px] rounded-full",
              "bg-white",
              // 5-layer neu drop
              "shadow-[3px_3px_7px_rgba(163,168,190,0.35),-2px_-2px_6px_rgba(255,255,255,0.90),inset_0_1px_0_rgba(255,255,255,0.90)]",
              // Focus ring
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue,#2145CF)] focus-visible:ring-offset-2",
              // Motion
              "transition-[box-shadow,transform] duration-100",
              "active:scale-[1.1] active:shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.80)]",
              // Disabled
              "disabled:opacity-[0.38] disabled:pointer-events-none",
            )}
          />
        </SliderPrimitive.Root>
      </div>
    );
  },
);

NeuSlider.displayName = "NeuSlider";

export { NeuSlider };
