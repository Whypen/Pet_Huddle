import React from "react";
import { cn } from "@/lib/utils";
import waveHandCta from "@/assets/Wave Hand CTA.png";

interface WaveHandIconProps {
  size?: number;
  className?: string;
}

/**
 * WaveHandIcon
 * Uses the exact provided wave CTA artwork asset.
 */
export const WaveHandIcon: React.FC<WaveHandIconProps> = ({
  size = 24,
  className,
}) => (
  <img
    src={waveHandCta}
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    className={cn("shrink-0 select-none object-contain", className)}
    draggable={false}
  />
);
