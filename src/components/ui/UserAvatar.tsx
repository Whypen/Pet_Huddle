import { Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCopy } from "@/lib/copy";
import profilePlaceholder from "@/assets/Profile Placeholder.png";

interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  isVerified?: boolean;
  hasCar?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  showBadges?: boolean;
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

const badgeSizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

const iconSizeClasses = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
  xl: "w-4 h-4",
};

const verificationRingClasses = {
  sm: "border border-[rgba(33,69,207,1)]",
  md: "border border-[rgba(33,69,207,1)]",
  lg: "border border-[rgba(33,69,207,1)]",
  xl: "border border-[rgba(33,69,207,1)]",
};

const unverifiedRingClasses = {
  sm: "border border-[rgba(74,73,101,0.28)]",
  md: "border border-[rgba(74,73,101,0.28)]",
  lg: "border border-[rgba(74,73,101,0.28)]",
  xl: "border border-[rgba(74,73,101,0.28)]",
};

export const UserAvatar = ({
  avatarUrl,
  name,
  isVerified = false,
  hasCar = false,
  size = "md",
  showBadges = true,
  className,
  onClick,
}: UserAvatarProps) => {
  const t = resolveCopy;
  const initials = name ? name.charAt(0).toUpperCase() : "?";

  return (
    <div
      className={cn("relative inline-block", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Avatar Image or Placeholder */}
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || t("User")}
          className={cn(
            sizeClasses[size],
            "rounded-full object-cover bg-muted/20",
            isVerified ? verificationRingClasses[size] : unverifiedRingClasses[size]
          )}
        />
      ) : (
        <img
          src={profilePlaceholder}
          alt={name || t("User")}
          className={cn(
            sizeClasses[size],
            "rounded-full object-cover bg-muted/20",
            isVerified ? verificationRingClasses[size] : unverifiedRingClasses[size]
          )}
        />
      )}

      {showBadges && (
        <>
          {/* Car Badge - Top Right (if has car) */}
          {hasCar && (
            <div
              className={cn(
                "absolute -top-1 -right-1 rounded-full bg-brandBlue flex items-center justify-center ring-2 ring-white",
                badgeSizeClasses[size]
              )}
            >
              <Car className={cn("text-white", iconSizeClasses[size])} />
            </div>
          )}

        </>
      )}
    </div>
  );
};

export default UserAvatar;
