import { User, Shield, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { membershipTierLabel, normalizeMembershipTier } from "@/lib/membership";

type SettingsProfileSummaryProps = {
  displayName: string;
  avatarUrl?: string | null;
  isVerified: boolean;
  tierValue?: string | null;
  starsLabel: string;
  onStarsClick?: () => void;
  onPress?: () => void;
  showChevron?: boolean;
  className?: string;
};

export const SettingsProfileSummary = ({
  displayName,
  avatarUrl,
  isVerified,
  tierValue,
  starsLabel,
  onStarsClick,
  onPress,
  showChevron = false,
  className,
}: SettingsProfileSummaryProps) => {
  const normalizedTier = normalizeMembershipTier(String(tierValue || "free"));
  const tierPillClass =
    normalizedTier === "gold"
      ? "bg-[#ff6a55] text-white"
      : normalizedTier === "plus"
        ? "bg-[#5ba4f5] text-white"
        : "bg-[#eceff4] text-[#6e7386]";
  const starsNumber = Math.max(0, Number(starsLabel || "0"));
  const starPillClass =
    starsNumber > 0
      ? "border border-[#E4E8F2] bg-white text-[#4A4965]"
      : "border border-[#C6CAD6] bg-transparent text-[#98A0B8]";
  const initials = useMemo(() => {
    return (
      displayName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2) || "U"
    );
  }, [displayName]);

  const WrapperTag = onPress ? "button" : "div";

  return (
    <WrapperTag
      {...(onPress
        ? {
            type: "button" as const,
            onClick: onPress,
            className: cn(
              "w-full flex items-center gap-3 px-0 py-4 text-left",
              className,
            ),
          }
        : { className: cn("flex items-center gap-3", className) })}
    >
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={cn(
              "w-12 h-12 rounded-full object-cover",
              isVerified && "ring-2 ring-brandBlue ring-offset-1 ring-offset-white",
            )}
          />
        ) : (
          <div
            className={cn(
              "w-12 h-12 rounded-full bg-muted flex items-center justify-center",
              isVerified && "ring-2 ring-brandBlue ring-offset-1 ring-offset-white",
            )}
          >
            <User className="w-6 h-6 text-muted-foreground" />
            <span className="sr-only">{initials}</span>
          </div>
        )}
        <div
          className={cn(
            "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center",
            isVerified ? "bg-brandBlue" : "bg-muted",
          )}
        >
          <Shield className={cn("w-3 h-3", isVerified ? "text-white" : "text-muted-foreground")} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{displayName || "User"}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-full", tierPillClass)}>
            {membershipTierLabel(normalizedTier)}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onStarsClick?.();
            }}
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
              starPillClass,
            )}
          >
            {`${starsNumber} ⭐`}
          </button>
        </div>
      </div>
      {showChevron ? <ChevronRight size={16} strokeWidth={1.75} className="text-[var(--text-tertiary)] flex-shrink-0" /> : null}
    </WrapperTag>
  );
};
