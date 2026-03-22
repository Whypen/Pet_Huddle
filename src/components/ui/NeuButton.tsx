/**
 * NeuButton — COMPATIBILITY SHIM — UI CONTRACT v6.1 C5
 *
 * @deprecated Use NeuControl directly.
 *             This shim exists only to avoid a 27-file import churn in one shot.
 *             All rendering is delegated to NeuControl (Section 6 canonical).
 *
 * RULE 3 compliance: there is now ONE implementation (NeuControl).
 * Variant mapping:
 *   primary / default   → primary
 *   secondary / outline → secondary
 *   gold                → gold  (tier guard still applies in NeuControl)
 *   ghost               → tertiary
 *   destructive         → danger
 *   link                → tertiary
 * Size mapping:
 *   default → md  |  sm → sm  |  lg → lg  |  xl → xl  |  icon → icon-md
 */

import * as React from "react";
import { NeuControl, type NeuControlVariant, type NeuControlSize } from "./NeuControl";
import type { NeuControlTier } from "./NeuControl";

// ── Legacy prop types (kept for consumer backward-compat) ─────────────────────

type LegacyVariant =
  | "primary" | "default"
  | "secondary" | "outline"
  | "gold"
  | "ghost"
  | "destructive"
  | "link";

type LegacySize = "default" | "sm" | "lg" | "xl" | "icon";

export interface NeuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: LegacyVariant;
  size?: LegacySize;
  fullWidth?: boolean;
  loading?: boolean;
  asChild?: boolean; // no-op; kept for API compat
  tier?: NeuControlTier;
}

// ── Variant map ───────────────────────────────────────────────────────────────

const VARIANT_MAP: Record<LegacyVariant, NeuControlVariant> = {
  primary:     "primary",
  default:     "primary",
  secondary:   "secondary",
  outline:     "secondary",
  gold:        "gold",
  ghost:       "tertiary",
  destructive: "danger",
  link:        "tertiary",
};

const SIZE_MAP: Record<LegacySize, NeuControlSize> = {
  default: "md",
  sm:      "sm",
  lg:      "lg",
  xl:      "xl",
  icon:    "icon-md",
};

// ── Shim component ─────────────────────────────────────────────────────────────

const NeuButton = React.forwardRef<HTMLButtonElement, NeuButtonProps>(
  (
    {
      variant = "primary",
      size = "default",
      fullWidth = false,
      loading = false,
      tier,
      asChild: _asChild, // consumed, not forwarded
      ...props
    },
    ref,
  ) => (
    <NeuControl
      ref={ref}
      variant={VARIANT_MAP[variant] ?? "primary"}
      size={SIZE_MAP[size] ?? "md"}
      fullWidth={fullWidth}
      loading={loading}
      tier={tier}
      {...props}
    />
  ),
);

NeuButton.displayName = "NeuButton";

export { NeuButton };
// Legacy cva export expected by some consumers
export const neuButtonVariants = () => "";
