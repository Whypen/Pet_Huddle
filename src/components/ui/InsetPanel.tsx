/**
 * InsetPanel — UI CONTRACT v6.1 § T5 Settings Anatomy
 *
 * Glass E1 card that groups settings rows.
 * Children: InsetRow (nav/toggle/value), InsetDivider.
 *
 * Visual:
 *   InsetPanel (glass-card, rounded-[20px])
 *     ├─ InsetRow × N
 *     └─ InsetDivider (between rows, optional)
 *
 * InsetRow variants:
 *   nav      — label + optional value + ChevronRight icon
 *   toggle   — label + NeuToggle
 *   value    — label + value text (read-only display)
 *   danger   — red label text (destructive action row)
 */

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── InsetPanel ───────────────────────────────────────────────────────────────

export interface InsetPanelProps {
  /** Optional section heading above the panel. */
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const InsetPanel: React.FC<InsetPanelProps> = ({ title, children, className }) => (
  <div className={cn("flex flex-col gap-1", className)}>
    {title && (
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] px-4 pb-1">
        {title}
      </h3>
    )}
    <div
      className={cn(
        // Glass E1 surface
        "glass-card overflow-hidden",
        "rounded-[20px]",
      )}
    >
      {children}
    </div>
  </div>
);

InsetPanel.displayName = "InsetPanel";

// ── InsetDivider ─────────────────────────────────────────────────────────────

const InsetDivider: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "h-px mx-4",
      "bg-[rgba(163,168,190,0.18)]",
      className,
    )}
    role="separator"
  />
);

InsetDivider.displayName = "InsetDivider";

// ── InsetRow ─────────────────────────────────────────────────────────────────

export type InsetRowVariant = "nav" | "toggle" | "value" | "danger";

export interface InsetRowProps {
  /** Row variant controls right-side slot. */
  variant?: InsetRowVariant;
  /** Label text. */
  label: string;
  /** Leading icon (16px, strokeWidth 1.75). */
  icon?: React.ReactNode;
  /** Value text (shown for "value" and "nav" variants). */
  value?: string;
  /** Right-side slot override — renders in place of default slot. */
  trailingSlot?: React.ReactNode;
  /** Click handler. */
  onClick?: () => void;
  /** Whether row is disabled. */
  disabled?: boolean;
  className?: string;
}

const InsetRow: React.FC<InsetRowProps> = ({
  variant = "nav",
  label,
  icon,
  value,
  trailingSlot,
  onClick,
  disabled,
  className,
}) => {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={!disabled ? onClick : undefined}
      disabled={onClick ? disabled : undefined}
      className={cn(
        // Layout
        "flex items-center justify-between gap-3",
        "min-h-[52px] px-4 py-3 w-full text-left",
        // Interactive feedback
        onClick && !disabled && [
          "cursor-pointer",
          "transition-[background] duration-100",
          "active:bg-[rgba(255,255,255,0.55)]",
        ],
        disabled && "opacity-[0.38] pointer-events-none",
        className,
      )}
    >
      {/* Left: icon + label */}
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <span className="text-[var(--text-secondary)] shrink-0 flex items-center">
            {icon}
          </span>
        )}
        <span
          className={cn(
            "text-[15px] font-medium leading-snug truncate",
            variant === "danger"
              ? "text-[var(--color-error,#E84545)]"
              : "text-[var(--text-primary,#424965)]",
          )}
        >
          {label}
        </span>
      </div>

      {/* Right slot */}
      <div className="flex items-center gap-2 shrink-0">
        {trailingSlot ?? (
          <>
            {(variant === "nav" || variant === "value") && value && (
              <span className="text-[14px] text-[var(--text-tertiary)] max-w-[120px] truncate">
                {value}
              </span>
            )}
            {variant === "nav" && (
              <ChevronRight
                size={16}
                strokeWidth={1.75}
                className="text-[var(--text-tertiary)]"
                aria-hidden
              />
            )}
            {variant === "danger" && (
              <ChevronRight
                size={16}
                strokeWidth={1.75}
                className="text-[var(--color-error,#E84545)]"
                aria-hidden
              />
            )}
          </>
        )}
      </div>
    </Tag>
  );
};

InsetRow.displayName = "InsetRow";

export { InsetPanel, InsetDivider, InsetRow };
