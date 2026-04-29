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

import { Bookmark, BookmarkCheck, Car, CheckCircle2, Zap } from "lucide-react";
import { SKILLS_GROUP_B_LIST } from "./carerServiceConstants";
import type { ProviderSummary } from "./types";
import { PolaroidCard, type PolaroidBadge } from "@/components/ui/PolaroidCard";

interface Props {
  provider: ProviderSummary;
  onTap: () => void;
  onBookmark: (e: React.MouseEvent) => void;
}

function buildBadges(provider: ProviderSummary): PolaroidBadge[] {
  const badges: PolaroidBadge[] = [];
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

  const priceOverlay = showPrice ? (
    <div
      className="absolute bottom-2 right-2 z-[4] flex items-baseline gap-[2px]"
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
  ) : null;

  const bookmarkAction = (
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
  );

  return (
    <PolaroidCard
      photoUrl={heroSrc}
      badges={badges}
      captionPrimary={provider.displayName || "Pet Carer"}
      captionSecondary={servicesLabel}
      overlay={priceOverlay}
      captionAction={bookmarkAction}
      onTap={onTap}
      ariaLabel={`View ${provider.displayName}'s profile`}
    />
  );
}
