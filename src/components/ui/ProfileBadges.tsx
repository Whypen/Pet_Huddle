import { Shield, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface ProfileBadgesProps {
  isVerified?: boolean;
  hasCar?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export const ProfileBadges = ({ isVerified, hasCar, className, size = "sm" }: ProfileBadgesProps) => {
  const { t } = useLanguage();
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const badgeSize = size === "sm" ? "w-5 h-5" : "w-6 h-6";
  
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {isVerified && (
        <div 
          className={cn(
            "rounded-full bg-primary flex items-center justify-center",
            badgeSize
          )}
          title={t("Verified User")}
        >
          <Shield className={cn(iconSize, "text-white")} />
        </div>
      )}
      {hasCar && (
        <div
          className={cn(
            "rounded-full flex items-center justify-center",
            badgeSize
          )}
          style={{ backgroundColor: "#2563EB" }}
          title={t("Has a Car")}
        >
          <Car className={cn(iconSize, "text-white")} />
        </div>
      )}
    </div>
  );
};
