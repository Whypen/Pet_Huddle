/**
 * DrawerSheet — UI CONTRACT v3 — B.4
 *
 * Single-level bottom sheet. Settings uses ONE level only — no stacking (C.4, D.25).
 *
 * Reference: cosmos.so Settings Drawers
 *
 * Shell:
 *   — Backdrop: rgba(66,73,101,0.35) + blur(3px), 200ms fade
 *   — Panel:    glass-l2, border-radius 28px 28px 0 0, max-height 94dvh
 *   — Entry:    translateY(100%→0) 350ms ease-spring (A.8)
 *   — Safe area: env(safe-area-inset-bottom, 20px)
 *
 * spring easing ONLY here + send button (D.14).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DrawerSheetProps {
  open:       boolean;
  onClose:    () => void;
  children:   React.ReactNode;
  className?: string;
  /** Accessible label for the sheet */
  label?:     string;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function DrawerSheet({
  open,
  onClose,
  children,
  className,
  label = "Sheet",
}: DrawerSheetProps) {
  // Prevent body scroll while open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Full-screen container (B.4)
    <div
      className="fixed inset-0 z-[30] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* Backdrop — B.4: rgba(66,73,101,0.35) + blur(3px), 200ms */}
      <div
        className="absolute inset-0 animate-[v3-page-in_200ms_ease-out]"
        style={{
          background: "rgba(66,73,101,0.35)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — B.4 */}
      <div
        className={cn(
          // glass-l2 surface
          "glass-l2",
          // Shape: 28px top corners, 0 bottom (bottom-sheet)
          "!rounded-[28px_28px_0_0]",
          // Layout
          "relative z-[1] flex flex-col w-full max-w-[var(--app-max-width,430px)] mx-auto",
          "max-h-[94dvh] overflow-y-auto",
          // Safe area bottom
          "pb-[env(safe-area-inset-bottom,20px)]",
          // B.4 entry animation: translateY 350ms ease-spring
          "animate-[v3-sheet-in_350ms_cubic-bezier(0.34,1.20,0.64,1)]",
          className,
        )}
        style={{ marginBottom: "calc(var(--nav-height,64px) + env(safe-area-inset-bottom,0px))" }}
      >
        {/* Handle — B.4 anatomy */}
        <div
          aria-hidden
          className="w-[40px] h-[4px] bg-[rgba(255,255,255,0.45)] rounded-full mx-auto mt-[12px] mb-[8px] flex-shrink-0"
        />

        {children}
      </div>
    </div>
  );
}

DrawerSheet.displayName = "DrawerSheet";

// ─── Sub-components matching B.4 anatomy ───────────────────────────────────

export interface DrawerNavItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?:    React.ReactNode;
  label:    string;
  trailing?: React.ReactNode;
  active?:   boolean;
  danger?:   boolean;
}

/** Single nav row in the DrawerSheet — h-[52px], B.4 spec */
export function DrawerNavItem({
  icon,
  label,
  trailing,
  active  = false,
  danger  = false,
  className,
  ...props
}: DrawerNavItemProps) {
  return (
    <button
      type="button"
      className={cn(
        // B.4 nav item dimensions
        "w-full h-[52px] px-[16px] rounded-[12px]",
        "flex items-center gap-[12px]",
        // Motion — B.4: background 120ms ease-out (unambiguous property form)
        "[transition:background-color_120ms_cubic-bezier(0.0,0.0,0.2,1)]",
        // States
        !active && !danger && "hover:bg-[rgba(255,255,255,0.38)] text-[#424965]",
        active  && "bg-[rgba(33,69,207,0.08)] text-[#2145CF]",
        danger  && "text-[#E84545] hover:bg-[rgba(232,69,69,0.06)]",
        // Typography — body (A.5)
        "text-[15px] font-normal leading-[1.55]",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="w-[20px] h-[20px] flex-shrink-0 flex items-center justify-center">
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">{label}</span>
      {trailing && (
        <span className="text-[rgba(74,73,101,0.55)]">{trailing}</span>
      )}
    </button>
  );
}

DrawerNavItem.displayName = "DrawerNavItem";

export interface DrawerTierBlockProps {
  tier:     "plus" | "gold";
  label:    string;
  subLabel?: string;
  icon?:    React.ReactNode;
  onPress?: () => void;
}

/** Tier upgrade block — h-[64px], B.4 tier block spec */
export function DrawerTierBlock({
  tier,
  label,
  subLabel,
  icon,
  onPress,
}: DrawerTierBlockProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        // B.4 tier block
        "w-full h-[64px] rounded-[14px] mx-0 mb-[8px] px-[16px]",
        "flex items-center gap-[12px]",
        "transition-all duration-150 ease-out active:scale-[0.98]",
        // Plus tier gradient
        tier === "plus" && [
          "bg-[linear-gradient(135deg,#2A53E0_0%,#1C3ECC_100%)]",
          "shadow-[0_4px_16px_rgba(33,69,207,0.28)]",
          "text-white",
        ],
        // Gold tier gradient — Gold tier ONLY (D.21)
        tier === "gold" && [
          "bg-[linear-gradient(135deg,#D9B528_0%,#BF9B18_100%)]",
          "shadow-[0_4px_16px_rgba(207,171,33,0.30)]",
          "text-[#2A2400]",
        ],
      )}
    >
      {icon && <span className="w-[20px] h-[20px] flex-shrink-0">{icon}</span>}
      <span className="flex-1 text-left">
        <span className="block text-[15px] font-semibold leading-[1.25]">{label}</span>
        {subLabel && (
          <span className="block text-[11px] leading-[1.45] opacity-80">{subLabel}</span>
        )}
      </span>
      <span className="text-[20px] opacity-70">›</span>
    </button>
  );
}

DrawerTierBlock.displayName = "DrawerTierBlock";

export function DrawerDivider() {
  return (
    <div
      aria-hidden
      className="h-px mx-[16px] bg-[rgba(255,255,255,0.28)]"
    />
  );
}

DrawerDivider.displayName = "DrawerDivider";
