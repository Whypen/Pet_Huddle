/**
 * Button — COMPATIBILITY SHIM — UI CONTRACT v6.1 C5
 *
 * @deprecated Use NeuControl directly.
 *             Delegates all rendering to NeuControl (Section 6 canonical).
 *
 * RULE 3 compliance: single implementation (NeuControl).
 *
 * Variant mapping:
 *   primary   → primary
 *   secondary → secondary
 *   gold      → gold
 *   ghost     → tertiary
 * Size mapping:
 *   default → md  |  lg → lg  |  icon → icon-md
 */

import * as React from "react";
import {
  NeuControl,
  type NeuControlVariant,
  type NeuControlSize,
} from "@/components/ui/NeuControl";

// ── Legacy types (kept for barrel re-export compat) ──────────────────────────

export type ButtonVariant = "primary" | "secondary" | "gold" | "ghost";
export type ButtonSize    = "default" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// ── Maps ──────────────────────────────────────────────────────────────────────

const VARIANT_MAP: Record<ButtonVariant, NeuControlVariant> = {
  primary:   "primary",
  secondary: "secondary",
  gold:      "gold",
  ghost:     "tertiary",
};

const SIZE_MAP: Record<ButtonSize, NeuControlSize> = {
  default: "md",
  lg:      "lg",
  icon:    "icon-md",
};

// ── Shim ──────────────────────────────────────────────────────────────────────

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "default", loading = false, ...props }, ref) => (
    <NeuControl
      ref={ref}
      variant={VARIANT_MAP[variant] ?? "primary"}
      size={SIZE_MAP[size] ?? "md"}
      loading={loading}
      {...props}
    />
  ),
);

Button.displayName = "Button";
