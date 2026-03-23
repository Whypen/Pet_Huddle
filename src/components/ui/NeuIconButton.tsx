/**
 * NeuIconButton — DESIGN_MASTER_SPEC §3.3 + §5
 *
 * 44×44 icon-only button with neumorphic raised surface.
 * Guarantees WCAG tap target compliance.
 *
 * Usage:
 *   <NeuIconButton onClick={...} aria-label="Back">
 *     <ArrowLeft className="w-5 h-5" />
 *   </NeuIconButton>
 *
 *   <NeuIconButton active aria-label="Search">
 *     <Search className="w-5 h-5" />
 *   </NeuIconButton>
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface NeuIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visually show as pressed/active (inverted neu shadow) */
  active?: boolean;
  /** Danger/destructive state */
  destructive?: boolean;
}

const NeuIconButton = React.forwardRef<HTMLButtonElement, NeuIconButtonProps>(
  ({ className, active, destructive, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "neu-icon focusable",
          "focus-visible:ring-2 focus-visible:ring-[#2145CF] focus-visible:ring-offset-2",
          active && "bg-[#2145CF] text-white shadow-none",
          destructive && "text-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
NeuIconButton.displayName = "NeuIconButton";

export { NeuIconButton };
