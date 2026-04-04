// HuddleVideoLoader — generic spinner loader (mp4-free).
import { Loader2 } from "lucide-react";

interface HuddleVideoLoaderProps {
  /** Size in px. Defaults to 32 (matches sm UserAvatar). */
  size?: number;
  className?: string;
}

export function HuddleVideoLoader({ size = 32, className = "" }: HuddleVideoLoaderProps) {
  return (
    <Loader2
      className={`animate-spin text-[var(--text-secondary)] ${className}`.trim()}
      style={{ width: size, height: size, display: "block" }}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}
