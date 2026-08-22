import { cn } from "@/lib/utils";

export const HuddleInlineLoader = ({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) => (
  <span
    className={cn("inline-flex items-center justify-center gap-1", className)}
    role="status"
    aria-label={label}
  >
    {[0, 1, 2].map((index) => (
      <span
        key={index}
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-brandBlue motion-safe:animate-[huddle-gather_1.15s_cubic-bezier(0.22,1,0.36,1)_infinite] motion-reduce:opacity-70"
        style={{ animationDelay: `${index * 110}ms` }}
      />
    ))}
  </span>
);

export const SocialFeedSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="flex flex-col" aria-label="Loading posts" role="status">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="border-b border-border/70 py-4" aria-hidden>
        <div className="flex items-start gap-3">
          <span className="skeleton-shimmer h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <span className="skeleton-shimmer block h-3.5 w-28 rounded-full" />
            <span className="skeleton-shimmer mt-3 block h-3.5 w-3/4 rounded-full" />
            <span className="skeleton-shimmer mt-2 block h-3.5 w-1/2 rounded-full" />
            {index === 0 ? <span className="skeleton-shimmer mt-4 block aspect-[1.91/1] w-full rounded-[14px]" /> : null}
          </div>
        </div>
      </div>
    ))}
  </div>
);
