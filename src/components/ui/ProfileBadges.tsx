import { Shield, Car } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileBadgesProps {
  isVerified?: boolean;
  hasCar?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export const ProfileBadges = ({ isVerified, hasCar, className, size = "sm" }: ProfileBadgesProps) => {
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const badgeSize = size === "sm" ? "w-5 h-5" : "w-6 h-6";
  
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {isVerified && (
        <div 
          className={cn(
            "rounded-full bg-warning flex items-center justify-center",
            badgeSize
          )}
          title="Verified User"
        >
          <Shield className={cn(iconSize, "text-warning-foreground")} />
        </div>
      )}
      {hasCar && (
        <div 
          className={cn(
            "rounded-full bg-primary flex items-center justify-center",
            badgeSize
          )}
          title="Has a Car"
        >
          <Car className={cn(iconSize, "text-primary-foreground")} />
        </div>
      )}
    </div>
  );
};
