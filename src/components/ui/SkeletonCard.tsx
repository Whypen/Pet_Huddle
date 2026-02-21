/**
 * SkeletonCard — E1 thread/post card skeleton replica
 * Matches NoticeBoard thread card layout exactly (no layout shift)
 * DESIGN_MASTER_SPEC §10: skeletons must replicate real layout
 */
import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  hasImage?: boolean;
  className?: string;
}

export function SkeletonCard({ hasImage = true, className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "card-e1 rounded-card bg-white p-4",
        "flex flex-col gap-3",
        className
      )}
      aria-hidden="true"
    >
      {/* Author row */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="skeleton-shimmer h-10 w-10 rounded-full bg-[#E5E7EB] flex-shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          {/* Name */}
          <div className="skeleton-shimmer h-3.5 w-28 rounded-full bg-[#E5E7EB]" />
          {/* Timestamp */}
          <div className="skeleton-shimmer h-3 w-16 rounded-full bg-[#E5E7EB]" />
        </div>
        {/* Options menu placeholder */}
        <div className="skeleton-shimmer h-6 w-6 rounded-full bg-[#E5E7EB]" />
      </div>

      {/* Image (editorial 4:5 bias) */}
      {hasImage && (
        <div className="skeleton-shimmer w-full aspect-[4/5] rounded-[8px] bg-[#E5E7EB]" />
      )}

      {/* Text lines — 3 lines matching line-clamp-3 */}
      <div className="flex flex-col gap-2">
        <div className="skeleton-shimmer h-3.5 w-full rounded-full bg-[#E5E7EB]" />
        <div className="skeleton-shimmer h-3.5 w-[90%] rounded-full bg-[#E5E7EB]" />
        <div className="skeleton-shimmer h-3.5 w-[65%] rounded-full bg-[#E5E7EB]" />
      </div>

      {/* Action row: like + comment */}
      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-2">
          <div className="skeleton-shimmer h-7 w-7 rounded-full bg-[#E5E7EB]" />
          <div className="skeleton-shimmer h-3 w-8 rounded-full bg-[#E5E7EB]" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton-shimmer h-7 w-7 rounded-full bg-[#E5E7EB]" />
          <div className="skeleton-shimmer h-3 w-8 rounded-full bg-[#E5E7EB]" />
        </div>
      </div>
    </div>
  );
}
