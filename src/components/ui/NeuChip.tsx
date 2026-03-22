/**
 * NeuChip — DESIGN_MASTER_SPEC §3.3
 *
 * Toggleable pill chip for filters, tab selectors, tags.
 * Uses .neu-chip CSS from index.css with active/inactive state.
 *
 * Usage:
 *   <NeuChip active={selected === "dog"} onClick={() => setSelected("dog")}>
 *     Dog
 *   </NeuChip>
 *
 *   // Read-only label chip
 *   <NeuChip as="span" className="text-xs">Free</NeuChip>
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface NeuChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Render as a different element (e.g. "span" for read-only) */
  as?: "button" | "span" | "div";
}

const NeuChip = React.forwardRef<HTMLButtonElement, NeuChipProps>(
  ({ className, active, as: Tag = "button", children, ...props }, ref) => {
    return (
      // @ts-expect-error dynamic tag
      <Tag
        ref={ref}
        type={Tag === "button" ? "button" : undefined}
        data-active={active}
        className={cn(
          "neu-chip px-3 py-1.5 text-xs font-medium text-[#424965]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2145CF]",
          active && "text-white",
          className,
        )}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);
NeuChip.displayName = "NeuChip";

export { NeuChip };
