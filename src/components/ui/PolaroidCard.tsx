import { motion } from "framer-motion";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import profilePlaceholder from "@/assets/Profile Placeholder.png";

export type PolaroidBadge = {
  Icon: ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
  iconColor: string;
  bg: string;
  key: string;
};

type PolaroidCardProps = {
  photoUrl: string | null;
  badges?: PolaroidBadge[];
  captionPrimary: string;
  captionSecondary?: string;
  overlay?: ReactNode;
  captionAction?: ReactNode;
  photoFallback?: ReactNode;
  onTap?: () => void;
  disabled?: boolean;
  ariaLabel: string;
  shadow?: "default" | "soft";
};

export function PolaroidCard({
  photoUrl,
  badges = [],
  captionPrimary,
  captionSecondary,
  overlay,
  captionAction,
  photoFallback,
  onTap,
  disabled = false,
  ariaLabel,
  shadow = "default",
}: PolaroidCardProps) {
  return (
    <motion.div
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.1 }}
      onClick={disabled ? undefined : onTap}
      className={disabled ? "cursor-not-allowed select-none" : "cursor-pointer select-none"}
      aria-label={ariaLabel}
      aria-disabled={disabled}
    >
      <div
        style={{
          background: "#f0f0f0",
          borderRadius: "4px",
          boxShadow: shadow === "soft"
            ? "0 8px 22px rgba(33,39,58,0.10), 0 1px 4px rgba(33,39,58,0.06)"
            : "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          aspectRatio: "4 / 5",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "5%",
            right: "5%",
            bottom: "31%",
            overflow: "hidden",
            zIndex: 1,
            borderRadius: "2px",
          }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          ) : photoFallback ? (
            photoFallback
          ) : (
            <img
              src={profilePlaceholder}
              alt=""
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          )}

          {disabled ? (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 2, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", background: "rgba(255,255,255,0.12)" }}
            />
          ) : null}

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.10)", zIndex: 3 }}
          />

          {overlay}
        </div>

        {badges.length > 0 && (
          <div
            className="absolute flex flex-col gap-[5px] pointer-events-none"
            style={{ top: "calc(5% + 8px)", left: "calc(5% + 8px)", zIndex: 10 }}
          >
            {badges.map(({ key, Icon, iconColor, bg }) => (
              <div
                key={key}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: bg,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "0.5px solid rgba(0,0,0,0.06)",
                }}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: iconColor }} />
              </div>
            ))}
          </div>
        )}

        <div
          className="absolute left-0 right-0 flex flex-col justify-start px-3 pt-2.5 pb-3"
          style={{ top: "69%", bottom: 0, zIndex: 10 }}
        >
          <div className="flex items-start justify-between gap-1">
            <span
              className="leading-tight truncate min-w-0 flex-1"
              style={{
                fontSize: "15px",
                fontStyle: "italic",
                fontFamily: "Georgia, 'Times New Roman', serif",
                color: "#2a2a2a",
              }}
            >
              {captionPrimary}
            </span>
            {captionAction}
          </div>

          {captionSecondary ? (
            <span
              className="leading-snug line-clamp-2 mt-0.5 block"
              style={{
                fontSize: "10px",
                letterSpacing: "0.03em",
                color: "#888",
                minHeight: "30px",
              }}
            >
              {captionSecondary}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
