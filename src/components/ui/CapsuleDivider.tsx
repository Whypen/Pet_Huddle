/**
 * CapsuleDivider — DESIGN_MASTER_SPEC §8.3
 *
 * Center capsule label with optional faint side lines.
 * Used in Chat + AI Vet to mark time boundaries (TODAY, NEW, date strings).
 *
 * Insert animation: fade + 4px rise, 180ms (§8.3)
 *
 * Usage:
 *   <CapsuleDivider label="Today" />
 *   <CapsuleDivider label="Yesterday" showLines />
 *   <CapsuleDivider label="NEW" variant="accent" />
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CapsuleDividerProps {
  label: string;
  /** Show faint horizontal rules on either side of the capsule */
  showLines?: boolean;
  /** "default" = neutral grey | "accent" = primary blue tint */
  variant?: "default" | "accent";
  className?: string;
}

export function CapsuleDivider({
  label,
  showLines = true,
  variant = "default",
  className,
}: CapsuleDividerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("flex items-center gap-3 px-4 my-3", className)}
    >
      {showLines && (
        <div
          className={cn(
            "flex-1 h-px",
            variant === "accent"
              ? "bg-[#2145CF]/15"
              : "bg-[#424965]/10",
          )}
        />
      )}

      <span
        className={cn(
          "px-3 py-0.5 rounded-full text-[11px] font-medium tracking-wide select-none",
          variant === "accent"
            ? "bg-[#2145CF]/10 text-[#2145CF]"
            : "bg-[#424965]/8 text-[#424965]/50",
        )}
      >
        {label}
      </span>

      {showLines && (
        <div
          className={cn(
            "flex-1 h-px",
            variant === "accent"
              ? "bg-[#2145CF]/15"
              : "bg-[#424965]/10",
          )}
        />
      )}
    </motion.div>
  );
}
