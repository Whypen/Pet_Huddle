/**
 * PageErrorState — UI CONTRACT v6.1 § Section 7 Blueprint
 *
 * Full-page or inline error display.
 * T7 template variant: warning icon + headline + body + Retry CTA.
 *
 * Two display modes:
 *   fullPage — vertically centred within container (flex-1)
 *   inline   — glass-card block (same width as container)
 */

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeuControl } from "./NeuControl";

export interface PageErrorStateProps {
  /** Error headline. Defaults to "Something went wrong". */
  headline?: string;
  /** Error body copy. */
  body?: string;
  /** Retry/action button label. */
  actionLabel?: string;
  /** Retry/action callback. */
  onAction?: () => void;
  /** Display mode. */
  mode?: "fullPage" | "inline";
  /** Optional custom icon (defaults to AlertTriangle 24px). */
  icon?: React.ReactNode;
  className?: string;
}

const PageErrorState: React.FC<PageErrorStateProps> = ({
  headline = "Something went wrong",
  body,
  actionLabel = "Try again",
  onAction,
  mode = "fullPage",
  icon,
  className,
}) => {
  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "px-6 py-10 gap-4",
      )}
    >
      {/* Icon container */}
      <div
        className={cn(
          "h-[64px] w-[64px] rounded-full",
          "flex items-center justify-center",
          "bg-[rgba(255,255,255,0.72)]",
          "shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)]",
          "text-[var(--color-error,#E84545)]",
        )}
        aria-hidden
      >
        {icon ?? (
          <AlertTriangle size={24} strokeWidth={1.75} />
        )}
      </div>

      {/* Headline */}
      <h2 className="text-[20px] font-semibold text-[var(--text-primary,#424965)] leading-snug max-w-[240px]">
        {headline}
      </h2>

      {/* Body */}
      {body && (
        <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-[260px]">
          {body}
        </p>
      )}

      {/* Action */}
      {onAction && (
        <div className="mt-2">
          <NeuControl variant="secondary" size="md" onClick={onAction}>
            {actionLabel}
          </NeuControl>
        </div>
      )}
    </div>
  );

  if (mode === "fullPage") {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center",
          "min-h-[320px]",
          className,
        )}
        role="alert"
        aria-live="assertive"
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn("glass-card rounded-[20px]", className)}
      role="alert"
      aria-live="assertive"
    >
      {content}
    </div>
  );
};

PageErrorState.displayName = "PageErrorState";

export { PageErrorState };
