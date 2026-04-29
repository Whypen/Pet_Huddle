import { ShieldCheck, Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";

type ProfileHeroProps = {
  src: string | null;
  name: string;
  roleLabels: string[];
  membershipTier?: string | null;
  caption?: string | null;
  isVerified: boolean;
};

const formatTier = (tier?: string | null) => {
  const clean = String(tier || "").trim().toLowerCase();
  if (!clean || clean === "free") return null;
  if (clean === "gold") return "Gold";
  if (clean === "plus" || clean === "huddle+" || clean === "huddle_plus") return "Huddle+";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export function ProfileHero({ src, name, roleLabels, membershipTier, caption, isVerified }: ProfileHeroProps) {
  const tierLabel = formatTier(membershipTier);
  const isGold = tierLabel === "Gold";
  const isPlus = tierLabel === "Huddle+";

  const displayName = name || "User";
  const pillRadiusStyle = { borderRadius: "var(--radius-pill)" };

  return (
    <section className="px-4 pt-4">
      <div className="relative aspect-[4/5] w-full touch-pan-y overflow-hidden rounded-[var(--radius-3xl,28px)] bg-[var(--bg-muted)] shadow-card">
      {src ? (
        <img
          src={src}
          alt={name || "Profile"}
          className="h-full w-full object-cover object-center"
          loading="eager"
          {...{ fetchpriority: "high" }}
        />
      ) : (
        <div className="h-full w-full bg-[var(--bg-blue-soft)]" />
      )}

      <div className="absolute inset-x-0 bottom-0 h-[56%] bg-gradient-to-t from-[rgba(20,24,38,0.78)] via-[rgba(20,24,38,0.38)] to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 px-5 pb-5 pt-24 text-white">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 break-words text-[40px] font-extrabold uppercase leading-none text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.24)]">{displayName}</h1>
          {isVerified ? (
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center bg-white/20 text-white backdrop-blur-sm" style={pillRadiusStyle}>
              <ShieldCheck className="h-5 w-5" strokeWidth={1.9} />
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {roleLabels.map((roleLabel) => (
            <span key={roleLabel} className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap border border-[var(--huddle-blue)] bg-[var(--bg-blue-surface)] px-4 py-2 text-sm font-semibold text-[var(--huddle-blue)] backdrop-blur-sm" style={pillRadiusStyle}>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--huddle-blue)]" />
              {roleLabel}
            </span>
          ))}
          {tierLabel ? (
            <span
              className={cn(
                "inline-flex min-h-10 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-semibold backdrop-blur-sm",
                isGold && "border border-[var(--premium-gold)] bg-[var(--bg-gold-surface)] text-[var(--premium-gold)]",
                isPlus && "border border-[var(--coral-orange)] bg-[color-mix(in_srgb,var(--coral-orange)_12%,white)] text-[var(--coral-orange)]",
                !isGold && !isPlus && "border border-white/35 bg-white/18 text-white",
              )}
              style={pillRadiusStyle}
            >
              <Sparkle className="h-3.5 w-3.5" fill="currentColor" strokeWidth={1.8} />
              {tierLabel}
            </span>
          ) : null}
        </div>
        {caption ? <p className="mt-3 max-w-[320px] text-sm font-medium leading-snug text-white/90">{caption}</p> : null}
      </div>
      </div>
    </section>
  );
}
