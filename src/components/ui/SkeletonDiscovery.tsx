/**
 * SkeletonDiscovery — discovery card stack skeleton
 * Matches the Chats discovery card layout (photo-led, glass name overlay)
 * DESIGN_MASTER_SPEC §10: skeletons must replicate real layout
 */
import { cn } from "@/lib/utils";

interface SkeletonDiscoveryProps {
  className?: string;
}

export function SkeletonDiscovery({ className }: SkeletonDiscoveryProps) {
  return (
    <div
      className={cn("relative w-full", className)}
      aria-hidden="true"
    >
      {/* Card — photo-led, 3:4 aspect, rounded-card */}
      <div className="skeleton-shimmer relative w-full aspect-[3/4] rounded-card bg-[#E5E7EB] overflow-hidden">
        {/* Simulated glass name overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white/60 to-transparent">
          <div className="skeleton-shimmer h-5 w-32 rounded-full bg-white/80 mb-2" />
          <div className="skeleton-shimmer h-3.5 w-20 rounded-full bg-white/60" />
        </div>
      </div>

      {/* Action buttons row: X / Wave / Star */}
      <div className="flex items-center justify-center gap-6 mt-4">
        {/* X */}
        <div className="skeleton-shimmer h-[44px] w-[44px] rounded-full bg-[#E5E7EB]" />
        {/* Wave (center, slightly larger) */}
        <div className="skeleton-shimmer h-[56px] w-[56px] rounded-full bg-[#E5E7EB]" />
        {/* Star */}
        <div className="skeleton-shimmer h-[44px] w-[44px] rounded-full bg-[#E5E7EB]" />
      </div>
    </div>
  );
}
