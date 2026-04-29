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
  const roleLabel = roleLabels.map((label) => label.trim()).filter(Boolean).join(" · ");
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
        <div className="max-w-full">
          <h1 className="break-words text-[40px] font-extrabold uppercase leading-none text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.24)]">
            {displayName}
            {" "}
            {isVerified ? (
              <span className="mb-1 ml-1 inline-flex h-8 w-8 align-middle items-center justify-center border border-[var(--huddle-blue)] bg-white/90 text-[var(--huddle-blue)] shadow-sm backdrop-blur-sm" style={pillRadiusStyle}>
                <ShieldCheck className="h-5 w-5" strokeWidth={1.9} />
              </span>
            ) : null}
          </h1>
        </div>
        <div className="mt-3 flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-hidden">
          {roleLabel ? (
            <span className="inline-flex min-h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden border border-[var(--huddle-blue)] bg-[var(--bg-blue-surface)] px-4 py-2 text-sm font-semibold text-[var(--huddle-blue)] backdrop-blur-sm" style={pillRadiusStyle}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--huddle-blue)]" />
              <span className="truncate">{roleLabel}</span>
            </span>
          ) : null}
          {tierLabel ? (
            <span
              className={cn(
                "inline-flex min-h-10 max-w-[44%] shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-semibold shadow-sm",
                isGold && "border border-[rgba(207,171,33,0.30)] bg-[var(--bg-yellow-soft)] text-[#8B6F00]",
                isPlus && "border border-[rgba(255,127,80,0.30)] bg-[color-mix(in_srgb,var(--coral-orange)_12%,white)] text-[var(--coral-orange)]",
                !isGold && !isPlus && "border border-white/35 bg-white/18 text-white",
              )}
              style={pillRadiusStyle}
            >
              <Sparkle className="h-3.5 w-3.5" fill="currentColor" strokeWidth={1.8} />
              <span className="truncate">{tierLabel}</span>
            </span>
          ) : null}
        </div>
        {caption ? <p className="mt-3 max-w-[320px] text-sm font-medium leading-snug text-white/90">{caption}</p> : null}
      </div>
      </div>
    </section>
  );
}
