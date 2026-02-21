/**
 * SkeletonFeed — thread feed skeleton (3 cards, space-y-6)
 * Drop-in replacement for NoticeBoard loading state
 * DESIGN_MASTER_SPEC §10: skeletons must replicate real layout
 */
import { cn } from "@/lib/utils";
import { SkeletonCard } from "./SkeletonCard";

interface SkeletonFeedProps {
  count?: number;
  className?: string;
}

export function SkeletonFeed({ count = 3, className }: SkeletonFeedProps) {
  // Alternate image/no-image to look like a real mixed feed
  const hasImagePattern = [true, false, true];

  return (
    <div
      className={cn("flex flex-col space-y-6", className)}
      aria-busy="true"
      aria-label="Loading posts"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard
          key={i}
          hasImage={hasImagePattern[i % hasImagePattern.length]}
        />
      ))}
    </div>
  );
}
