import * as React from "react";

import { cn } from "@/lib/utils";

// DESIGN_MASTER_SPEC §6: h-10 (40px), text-base 16px (iOS zoom-safe), rounded-btn (8px)
// Placeholders DISABLED except search fields — pass showPlaceholder prop for search
export interface InputProps extends React.ComponentProps<"input"> {
  showPlaceholder?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, showPlaceholder = false, placeholder, ...props }, ref) => {
    const isInvalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
    const isSearch = type === "search" || showPlaceholder;
    const placeholderProps =
      isSearch && typeof placeholder !== "undefined" ? { placeholder } : {};

    return (
      <input
        type={type}
        className={cn(
          // Spec: h-10 (40px), text-base 16px, rounded-btn (8px), consistent padding
          "flex h-10 min-h-[44px] w-full rounded-btn border bg-white px-3 py-2",
          "text-base text-brandText text-left",
          "ring-offset-background",
          "border-brandText/30",
          // Placeholder: disabled except search fields (spec §F)
          !isSearch && "placeholder:text-transparent",
          isSearch && "placeholder:italic placeholder:text-gray-400/70",
          // Focus state
          "focus-visible:outline-none focus-visible:border-brandBlue focus-visible:ring-1 focus-visible:ring-brandBlue/20 focus-visible:shadow-sm",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f0f0f0]",
          // Invalid / error state
          isInvalid && "border-brandError text-brandError focus-visible:border-brandError focus-visible:ring-brandError/20",
          className,
        )}
        ref={ref}
        {...placeholderProps}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
