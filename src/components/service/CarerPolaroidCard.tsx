/**
 * CarerPolaroidCard — feed tile for the Service marketplace.
 *
 * Design decisions:
 *  - Polaroid shell: #f0f0f0 background, 5% inset borders, ~24% caption strip.
 *  - Badge pucks (top-left of photo): icon-only circles with light tinted bg,
 *    matching PublicCarerProfileView style.
 *      Car  →  amber tint puck
 *      Certified  →  green tint puck (any SKILLS_GROUP_B skill present)
 *      Emergency  →  orange tint puck (emergencyReadiness === true)
 *  - Caption strip: row 1 = name (Georgia italic, prominent) + bookmark icon;
 *    row 2 = services (letter-spaced, muted).
 *  - Price overlay: bottom-right corner of PHOTO area, dark frosted pill.
 *  - Card tap → onTap() callback (opens PublicCarerProfileModal).
 *  - whileTap scale(0.97) — subtle press feedback.
 */

import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Car, CheckCircle2, Zap } from "lucide-react";
import { SKILLS_GROUP_B_LIST } from "./carerServiceConstants";
import type { ProviderSummary } from "./types";
import profilePlaceholder from "@/assets/Profile Placeholder.png";

interface Props {
  provider: ProviderSummary;
  onTap: () => void;
  onBookmark: (e: React.MouseEvent) => void;
}

interface BadgePuck {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  iconColor: string;
  bg: string;
  key: string;
}

function buildBadges(provider: ProviderSummary): BadgePuck[] {
  const badges: BadgePuck[] = [];
  if (provider.hasCar) {
    badges.push({ key: "car", Icon: Car, iconColor: "#ffffff", bg: "#2145CF" });
  }
  if (provider.skills.some((s) => (SKILLS_GROUP_B_LIST as readonly string[]).includes(s))) {
    badges.push({ key: "certified", Icon: CheckCircle2, iconColor: "#ffffff", bg: "#7CFF6B" });
  }
  if (provider.emergencyReadiness === true) {
    badges.push({ key: "emergency", Icon: Zap, iconColor: "#ffffff", bg: "#FF4D4D" });
  }
  return badges;
}

export function CarerPolaroidCard({ provider, onTap, onBookmark }: Props) {
  const heroSrc = provider.avatarUrl ?? provider.socialAlbumUrls[0] ?? null;
  const badges = buildBadges(provider);

  const servicesLabel = provider.servicesOffered
    .map((s) => (s === "Others" && provider.servicesOther ? provider.servicesOther : s))
    .join(" · ");

  const showPrice = provider.currency && provider.startingPrice && provider.startingPriceRateUnit;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1 }}
      onClick={onTap}
      className="cursor-pointer select-none"
      aria-label={`View ${provider.displayName}'s profile`}
    >
      <div
        style={{
          background: "#f0f0f0",
          borderRadius: "4px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          aspectRatio: "4 / 5",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* ── Photo slot ──────────────────────────────────────────────────────── */}
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
          <img
            src={heroSrc ?? profilePlaceholder}
            alt=""
            className="h-full w-full object-cover object-center"
            loading="lazy"
          />

          {/* Inset shadow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.10)", zIndex: 2 }}
          />

          {/* ── Price overlay — bottom-right of photo, dark frosted ──────────── */}
          {showPrice && (
            <div
              className="absolute bottom-2 right-2 z-[3] flex items-baseline gap-[2px]"
              style={{
                background: "rgba(255,255,255,0.88)",
                borderRadius: "8px",
                padding: "4px 8px",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              }}
            >
              <span style={{ fontSize: "10px", color: "rgba(30,40,80,0.60)", lineHeight: 1 }}>
                from
              </span>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "#1e2850", lineHeight: 1, margin: "0 1px" }}>
                {provider.currency}${provider.startingPrice}
              </span>
              <span style={{ fontSize: "10px", color: "rgba(30,40,80,0.60)", lineHeight: 1 }}>
                /{provider.startingPriceRateUnit}
              </span>
            </div>
          )}
        </div>

        {/* ── Badge pucks — top-left, 26×26, light-tinted style ───────────────── */}
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

        {/* ── Caption strip — name row + services ─────────────────────────────── */}
        <div
          className="absolute left-0 right-0 flex flex-col justify-start px-3 pt-2.5 pb-3"
          style={{ top: "69%", bottom: 0, zIndex: 10 }}
        >
          {/* Row 1: name + bookmark */}
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
              {provider.displayName || "Pet Carer"}
            </span>
            <button
              type="button"
              onClick={onBookmark}
              className="shrink-0 p-0.5 rounded-full hover:bg-black/5 transition-colors -mt-0.5"
              aria-label={provider.isBookmarked ? "Remove bookmark" : "Bookmark provider"}
            >
              {provider.isBookmarked ? (
                <BookmarkCheck className="w-3.5 h-3.5 text-brandBlue" strokeWidth={2} />
              ) : (
                <Bookmark className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "#bbb" }} />
              )}
            </button>
          </div>

          {/* Row 2: services */}
          {servicesLabel && (
            <span
              className="leading-snug line-clamp-2 mt-0.5 block"
              style={{
                fontSize: "10px",
                letterSpacing: "0.03em",
                color: "#888",
                minHeight: "30px",
              }}
            >
              {servicesLabel}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
