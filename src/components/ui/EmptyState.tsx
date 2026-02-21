/**
 * EmptyState — standardized empty state component
 * DESIGN_MASTER_SPEC §9: headline ≤8 words, subtext ≤14 words, 1 CTA
 * Thin-stroke illustration slot (SVG icon, not cartoon)
 */
import { cn } from "@/lib/utils";
import { Button } from "./button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon | React.FC<React.SVGProps<SVGSVGElement>>;
  headline: string;       // ≤8 words
  subtext?: string;       // ≤14 words
  ctaLabel?: string;
  ctaOnClick?: () => void;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  headline,
  subtext,
  ctaLabel,
  ctaOnClick,
  secondaryLabel,
  secondaryOnClick,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "px-8 py-12 gap-4",
        className
      )}
      role="status"
      aria-label={headline}
    >
      {/* Icon slot — thin stroke, 48px */}
      {Icon && (
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[#F3F4F6]">
          <Icon
            className="w-8 h-8 text-[#424965]/40"
            strokeWidth={1.75}
          />
        </div>
      )}

      {/* Headline: font-display, h3 size, brandText */}
      <h3 className="font-display text-h3 font-semibold text-brandText leading-tight">
        {headline}
      </h3>

      {/* Subtext: body size, muted */}
      {subtext && (
        <p className="text-base text-brandSubtext/70 max-w-[240px]">
          {subtext}
        </p>
      )}

      {/* CTA */}
      {ctaLabel && ctaOnClick && (
        <div className="flex flex-col gap-2 w-full max-w-[220px] mt-2">
          <Button
            variant="default"
            size="default"
            onClick={ctaOnClick}
            className="w-full"
          >
            {ctaLabel}
          </Button>
          {secondaryLabel && secondaryOnClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={secondaryOnClick}
              className="w-full"
            >
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
