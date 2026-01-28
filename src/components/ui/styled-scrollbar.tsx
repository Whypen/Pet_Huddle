import * as React from "react";
import { cn } from "@/lib/utils";

interface StyledScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxHeight?: string;
}

export const StyledScrollArea = React.forwardRef<HTMLDivElement, StyledScrollAreaProps>(
  ({ className, children, maxHeight = "100%", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "overflow-y-auto overflow-x-hidden scrollbar-visible",
          className
        )}
        style={{ maxHeight }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

StyledScrollArea.displayName = "StyledScrollArea";
