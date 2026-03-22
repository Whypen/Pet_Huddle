/**
 * SectionDivider — UI CONTRACT v3 — B.5
 *
 * variants: date | unread | system | emergency
 *
 * Anatomy: [line] [chip] [line]
 * Reference: cosmos.so Chat Divider
 *
 * Emergency color (#F97316) used here per B.5 — not for general use (D.12).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type SectionDividerVariant = "date" | "unread" | "system" | "emergency";

export interface SectionDividerProps {
  variant: SectionDividerVariant;
  label:   string;
  className?: string;
}

// ─── B.5 chip color specs ───────────────────────────────────────────────────

interface ChipStyle {
  bg:    string;
  text:  string;
  opacity?: string;
}

const CHIP_STYLES: Record<SectionDividerVariant, ChipStyle> = {
  date:      { bg: "rgba(255,255,255,0.38)", text: "#424965", opacity: "opacity-60" },
  unread:    { bg: "rgba(33,69,207,0.10)",   text: "#2145CF" },
  system:    { bg: "rgba(34,197,94,0.10)",   text: "#22C55E" },
  emergency: { bg: "rgba(249,115,22,0.12)",  text: "#F97316" },
};

// ─── Component ─────────────────────────────────────────────────────────────

export function SectionDivider({ variant, label, className }: SectionDividerProps) {
  const { bg, text, opacity } = CHIP_STYLES[variant];

  return (
    <div
      role="separator"
      aria-label={label}
      className={cn("flex items-center gap-[12px] py-[12px] px-[16px]", className)}
    >
      {/* Left line */}
      <div className="flex-1 h-px bg-[rgba(255,255,255,0.28)]" />

      {/* Chip — B.5 */}
      <div
        className={cn(
          "px-[12px] py-[5px] rounded-full",
          "backdrop-blur-[8px]",
          "border border-[rgba(255,255,255,0.35)]",
          "text-[11px] font-medium tracking-[0.04em]",
          "select-none whitespace-nowrap",
          opacity,
        )}
        style={{ background: bg, color: text }}
      >
        {label}
      </div>

      {/* Right line */}
      <div className="flex-1 h-px bg-[rgba(255,255,255,0.28)]" />
    </div>
  );
}

SectionDivider.displayName = "SectionDivider";
