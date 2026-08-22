/**
 * SettingsAvatar — the profile avatar, at a caller-chosen size.
 *
 * Extracted from `SettingsProfileSummary.tsx:67-95` so the drawer trigger (34px)
 * and the drawer masthead (48px) render the same avatar from one place rather
 * than two copies drifting apart. The markup and the verified ring are the
 * existing ones, unchanged.
 */

import { Check, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsAvatarProps {
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  /** Rendered px. 34 for the header trigger, 48 for the masthead. */
  size?: number;
  /** The verified shield is meaningful at masthead size, noise at 34px. */
  showVerifiedBadge?: boolean;
  className?: string;
  loading?: "eager" | "lazy";
}

export const SettingsAvatar = ({
  displayName,
  avatarUrl,
  isVerified = false,
  size = 48,
  showVerifiedBadge = true,
  className,
  loading = "eager",
}: SettingsAvatarProps) => {
  const initial = String(displayName || "U").trim().charAt(0).toUpperCase();

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          loading={loading}
          decoding="async"
          className={cn(
            "h-full w-full rounded-full object-cover",
            isVerified && "border-2 border-brandBlue",
          )}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full bg-muted",
            isVerified && "border-2 border-brandBlue",
          )}
        >
          {size >= 40 ? (
            <User className="h-6 w-6 text-muted-foreground" />
          ) : (
            <span className="text-[13px] font-bold text-muted-foreground">{initial}</span>
          )}
          <span className="sr-only">{displayName}</span>
        </div>
      )}

      {showVerifiedBadge && isVerified ? (
        <div
          className="absolute -bottom-px -right-px z-30 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-brandBlue"
        >
          <Check className="h-[9px] w-[9px] text-white" strokeWidth={3} />
        </div>
      ) : null}
    </div>
  );
};

export default SettingsAvatar;
