/**
 * NeuSurface — DESIGN_MASTER_SPEC §3.1 + §3.3
 *
 * E1 base card surface. Solid, no blur — use for page-level content cards,
 * list rows, grouped sections.
 *
 * Usage:
 *   <NeuSurface>Content</NeuSurface>
 *   <NeuSurface className="p-4 gap-3" as="section">...</NeuSurface>
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface NeuSurfaceProps extends React.HTMLAttributes<HTMLElement> {
  /** Render as a different element (default: div) */
  as?: keyof React.JSX.IntrinsicElements;
  /** Remove default padding */
  noPadding?: boolean;
}

const NeuSurface = React.forwardRef<HTMLElement, NeuSurfaceProps>(
  ({ className, as: Tag = "div", noPadding = false, ...props }, ref) => {
    return (
      // @ts-expect-error dynamic tag
      <Tag
        ref={ref}
        className={cn(
          "card-e1",
          !noPadding && "p-4",
          className,
        )}
        {...props}
      />
    );
  },
);
NeuSurface.displayName = "NeuSurface";

export { NeuSurface };
