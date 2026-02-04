import { Shield, Car, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  isVerified?: boolean;
  hasCar?: boolean;
  isPremium?: boolean;
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

export const UserAvatar = ({
  avatarUrl,
  name,
  isVerified = false,
  hasCar = false,
  isPremium = false,
  size = "md",
  showBadges = true,
  className,
  onClick,
}: UserAvatarProps) => {
  const { t } = useLanguage();
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
            "rounded-full object-cover ring-2 ring-white"
          )}
        />
      ) : (
        <div
          className={cn(
            sizeClasses[size],
            "rounded-full bg-muted flex items-center justify-center ring-2 ring-white",
            "text-muted-foreground font-semibold"
          )}
          style={{ fontSize: size === "sm" ? "0.75rem" : size === "md" ? "1rem" : size === "lg" ? "1.25rem" : "1.5rem" }}
        >
          {initials}
        </div>
      )}

      {showBadges && (
        <>
          {/* Car Badge - Top Right (if has car) */}
          {hasCar && (
            <div
              className={cn(
                "absolute -top-1 -right-1 rounded-full bg-[#3283FF] flex items-center justify-center ring-2 ring-white",
                badgeSizeClasses[size]
              )}
            >
              <Car className={cn("text-white", iconSizeClasses[size])} />
            </div>
          )}

          {/* Verification/Premium Badge - Bottom Right */}
          <div
            className={cn(
              "absolute -bottom-1 -right-1 rounded-full flex items-center justify-center ring-2 ring-white",
              badgeSizeClasses[size],
              isPremium
                ? "bg-primary"
                : isVerified
                ? "bg-gradient-to-r from-[#FBBF24] via-[#F59E0B] to-[#D97706]"
                : "bg-[#A1A4A9]"
            )}
          >
            {isPremium ? (
              <Crown className={cn("text-white", iconSizeClasses[size])} />
            ) : (
              <Shield className={cn("text-white", iconSizeClasses[size])} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default UserAvatar;
