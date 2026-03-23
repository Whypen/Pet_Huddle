/**
 * PublicCarerProfileView — read-only carer profile surface.
 *
 * Applied fixes per spec:
 *  1. Badge pucks (top-left of photo): icon-only circles (no text),
 *     bigger icons, vertically stacked — Car / Certified / Emergency.
 *  2. Polaroid caption strip: shows ALL services, not just first 3.
 *  3. Price overlay: at bottom-right of the PHOTO area (not below card).
 *  4. Certified skills underlined + Radix Popover shows credential fields.
 */

import { useMemo, useState } from "react";
import { Car, CheckCircle2, Clock, MapPin, Zap } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProviderSummary } from "./types";
import {
  PROOF_CONFIG,
  SKILLS_GROUP_B_LIST,
  type CertifiedSkill,
} from "./carerServiceConstants";
import carerPlaceholderImg from "@/assets/Profile Placeholder.png";

// ── Helpers ───────────────────────────────────────────────────────────────────

function to12h(value: string): string {
  if (!value) return value;
  const [hRaw, mRaw] = value.split(":");
  const h = Number.parseInt(hRaw, 10);
  const m = Number.parseInt(mRaw, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function svcLabel(provider: ProviderSummary, s: string): string {
  return s === "Others" && provider.servicesOther.trim()
    ? provider.servicesOther.trim()
    : s;
}

// ── Badge puck helpers ────────────────────────────────────────────────────────

interface BadgePuck {
  key: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  iconColor: string;
  bg: string;
}

function buildBadges(provider: ProviderSummary): BadgePuck[] {
  const out: BadgePuck[] = [];
  if (provider.hasCar) {
    out.push({ key: "car", Icon: Car, iconColor: "#ffffff", bg: "#2145CF" });
  }
  const hasCertified = provider.skills.some((s) =>
    (SKILLS_GROUP_B_LIST as readonly string[]).includes(s),
  );
  if (hasCertified) {
    out.push({ key: "cert", Icon: CheckCircle2, iconColor: "#ffffff", bg: "#7CFF6B" });
  }
  if (provider.emergencyReadiness === true) {
    out.push({ key: "emerg", Icon: Zap, iconColor: "#ffffff", bg: "#FF4D4D" });
  }
  return out;
}

// ── Certified skill row with proof popover ────────────────────────────────────

function CertifiedSkillRow({
  skill,
  proofMetadata,
}: {
  skill: string;
  proofMetadata: Record<string, Record<string, string>>;
}) {
  const cfg = PROOF_CONFIG[skill as CertifiedSkill];
  const meta = proofMetadata[skill] ?? {};
  const hasProof =
    cfg != null &&
    cfg.fields.some((f) => String(meta[f.key] ?? "").trim().length > 0);

  if (!hasProof) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} />
        <span className="text-[15px] text-brandText">{skill}</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-left">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2} />
          <span className="text-[15px] text-brandText underline decoration-dotted underline-offset-[3px] cursor-pointer">
            {skill}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="z-[4400] w-56 rounded-[14px] border border-brandText/10 bg-white p-3 shadow-elevated"
      >
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Credentials
        </p>
        {cfg!.fields.map((field) => {
          const val = String(meta[field.key] ?? "").trim();
          if (!val) return null;
          return (
            <div key={field.key} className="mb-2 last:mb-0">
              <p className="text-[11px] text-muted-foreground leading-none mb-0.5">{field.label}</p>
              <p className="text-[13px] font-medium text-brandText leading-snug">{val}</p>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function PublicCarerProfileView({
  provider,
  onRequestService,
  canRequestService = true,
}: {
  provider: ProviderSummary;
  onRequestService?: () => void;
  canRequestService?: boolean;
}) {
  const slides = useMemo(() => {
    const uniq: string[] = [];
    if (provider.avatarUrl) uniq.push(provider.avatarUrl);
    for (const url of provider.socialAlbumUrls) {
      if (url && !uniq.includes(url)) uniq.push(url);
    }
    return uniq;
  }, [provider.avatarUrl, provider.socialAlbumUrls]);

  const [heroIndex, setHeroIndex] = useState(0);

  const badges = buildBadges(provider);

  // All services — full list, no slicing
  const servicesAll = provider.servicesOffered
    .map((s) => svcLabel(provider, s))
    .join(" · ");

  // Sorted skills: certified first
  const sortedSkills = [...provider.skills].sort((a, b) => {
    const aC = (SKILLS_GROUP_B_LIST as readonly string[]).includes(a) ? 0 : 1;
    const bC = (SKILLS_GROUP_B_LIST as readonly string[]).includes(b) ? 0 : 1;
    return aC - bC;
  });

  const showPrice =
    provider.currency && provider.startingPrice && provider.startingPriceRateUnit;

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* ── A. Polaroid ─────────────────────────────────────────────────── */}
      <section className="px-3 pt-1 pb-1">
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: "4 / 5",
            background: "#f0f0f0",
            borderRadius: "4px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
          }}
        >
          {/* Photo slot */}
          <div
            className="absolute overflow-hidden"
            style={{ top: "5%", left: "5%", right: "5%", bottom: "24%", zIndex: 1, borderRadius: "2px" }}
          >
            {slides.length > 0 ? (
              <>
                <img
                  src={slides[Math.min(heroIndex, slides.length - 1)]}
                  alt=""
                  className="h-full w-full object-cover object-center"
                />
                {slides.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setHeroIndex((v) => (v - 1 + slides.length) % slides.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 text-brandText flex items-center justify-center z-[3]"
                      aria-label="Previous"
                    >
                      <span className="text-xl leading-none select-none">‹</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroIndex((v) => (v + 1) % slides.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 text-brandText flex items-center justify-center z-[3]"
                      aria-label="Next"
                    >
                      <span className="text-xl leading-none select-none">›</span>
                    </button>
                    <div className="absolute top-3 right-3 flex gap-1.5 z-[4]">
                      {slides.map((_, i) => (
                        <span
                          key={i}
                          className={i === heroIndex ? "h-1.5 w-5 rounded-full bg-white" : "h-1.5 w-1.5 rounded-full bg-white/55"}
                          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <img src={carerPlaceholderImg} alt="" className="h-full w-full object-cover object-center" />
            )}

            {/* Inset shadow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: "inset 0 0 12px rgba(0,0,0,0.10)", zIndex: 2 }}
            />

            {/* ── Price overlay — bottom-right of photo ──────────────── */}
            {showPrice && (
              <div
                className="absolute bottom-2.5 right-2.5 z-[5] flex items-baseline gap-[2px]"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  borderRadius: "8px",
                  padding: "4px 9px",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                }}
              >
                <span style={{ fontSize: "11px", color: "rgba(30,40,80,0.60)", lineHeight: 1 }}>
                  from
                </span>
                <span style={{ fontSize: "20px", fontWeight: 700, color: "#1e2850", lineHeight: 1, margin: "0 1px" }}>
                  {provider.currency}${provider.startingPrice}
                </span>
                <span style={{ fontSize: "11px", color: "rgba(30,40,80,0.60)", lineHeight: 1 }}>
                  /{provider.startingPriceRateUnit}
                </span>
              </div>
            )}
          </div>

          {/* ── Badge pucks — icon-only circles ────────────────────────────── */}
          {badges.length > 0 && (
            <div
              className="absolute flex flex-col gap-2 pointer-events-none"
              style={{ top: "calc(5% + 10px)", left: "calc(5% + 10px)", zIndex: 10 }}
            >
              {badges.map(({ key, Icon, iconColor, bg }) => (
                <div
                  key={key}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: bg,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "0.5px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: iconColor }} />
                </div>
              ))}
            </div>
          )}

          {/* ── Caption strip — name + ALL services ────────────────────────── */}
          <div
            className="absolute left-0 right-0 flex flex-col items-center justify-center px-6 gap-1"
            style={{ top: "76%", bottom: 0, zIndex: 10 }}
          >
            <span
              className="text-center leading-tight w-full truncate"
              style={{
                fontSize: "24px",
                fontStyle: "italic",
                fontFamily: "Georgia, 'Times New Roman', serif",
                color: "#2a2a2a",
              }}
            >
              {provider.displayName || "Pet Carer"}
            </span>
            {servicesAll && (
              <span
                className="line-clamp-2 leading-snug text-center w-full"
                style={{ fontSize: "14px", letterSpacing: "0.04em", color: "#777", marginTop: "2px", minHeight: "34px" }}
              >
                {servicesAll}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── B. Story ─────────────────────────────────────────────────────── */}
      {provider.story.trim() && (
        <section className="px-6 pt-1 pb-1">
          <div
            aria-hidden
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 700,
              fontSize: "44px",
              lineHeight: 1,
              color: "#e4e4e4",
              marginBottom: "-0.85rem",
              userSelect: "none",
            }}
          >
            &#8220;
          </div>
          <p className="text-[16px] text-brandText leading-[1.75] whitespace-pre-wrap">
            {provider.story}
          </p>
          <div
            aria-hidden
            className="text-right"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 700,
              fontSize: "44px",
              lineHeight: 1,
              color: "#e4e4e4",
              marginTop: "-0.55rem",
              userSelect: "none",
            }}
          >
            &#8221;
          </div>
        </section>
      )}

      {/* ── C. Services ──────────────────────────────────────────────────── */}
      {provider.rateRows.some((r) => r.services.length > 0 || r.price) && (
        <section className="card-e1 overflow-hidden">
          <div className="px-6 pt-5 pb-3">
            <p className="text-[12px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-1">
              Services
            </p>
            {provider.petTypes.length > 0 && (
              <p className="text-[14px] text-muted-foreground">
                {"Works with "}
                {provider.petTypes
                  .map((pt) =>
                    pt === "Dogs" && provider.dogSizes.length > 0
                      ? `Dogs (${provider.dogSizes.join(", ")})`
                      : pt === "Others" && provider.petTypesOther
                      ? provider.petTypesOther
                      : pt,
                  )
                  .join(", ")}
              </p>
            )}
          </div>
          <div className="border-t border-brandText/10 divide-y divide-brandText/10">
            {provider.rateRows
              .filter((r) => r.services.length > 0 || r.price)
              .map((r, i) => {
                const label =
                  r.services.length > 0
                    ? r.services.map((s) => svcLabel(provider, s)).join(" · ")
                    : "All services";
                const hasPrice = r.price && r.rate && provider.currency;
                return (
                  <div key={i} className="flex items-start justify-between gap-4 px-6 py-4">
                    <span className="text-[16px] font-semibold text-brandText leading-snug">
                      {label}
                    </span>
                    {hasPrice ? (
                      <div className="flex items-baseline gap-1 shrink-0">
                        <span className="text-[16px] font-bold text-brandText">
                          {provider.currency} {r.price}
                        </span>
                        <span className="text-[13px] text-muted-foreground">/ {r.rate.toLowerCase()}</span>
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted-foreground shrink-0 italic">
                        Ask for price
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ── D. Skills + Availability + Location ──────────────────────────── */}
      {(sortedSkills.length > 0 ||
        provider.days.length > 0 ||
        provider.timeBlocks.length > 0 ||
        provider.locationStyles.length > 0) && (
        <section className="rounded-xl bg-muted/50 overflow-hidden border border-border">
          {/* Skills */}
          {sortedSkills.length > 0 && (
            <div className="px-6 py-5">
              <p className="text-[12px] font-semibold tracking-[0.1em] uppercase text-muted-foreground mb-3">
                Skills
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {sortedSkills.map((skill) =>
                  (SKILLS_GROUP_B_LIST as readonly string[]).includes(skill) ? (
                    <CertifiedSkillRow
                      key={skill}
                      skill={skill}
                      proofMetadata={provider.proofMetadata}
                    />
                  ) : (
                    <div key={skill} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                      <span className="text-[15px] text-brandText">{skill}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Availability */}
          {(provider.days.length > 0 || provider.timeBlocks.length > 0) && (
            <div
              className={[
                "px-6 py-5 flex items-start gap-3",
                sortedSkills.length > 0 ? "border-t border-brandText/10" : "",
              ].join(" ")}
            >
              <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-[3px]" strokeWidth={1.75} />
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {provider.days.length > 0 && (
                  <span className="text-[15px] text-brandText">
                    {provider.days.length === 7
                      ? "Every day"
                      : provider.days.map((d) => d.slice(0, 3)).join(", ")}
                  </span>
                )}
                {provider.timeBlocks.length > 0 && (
                  <span className="text-[14px] text-muted-foreground">
                    {provider.days.length > 0 ? "· " : ""}
                    {provider.timeBlocks
                      .map((b) =>
                        b === "Specify" && provider.otherTimeFrom && provider.otherTimeTo
                          ? `${to12h(provider.otherTimeFrom)} – ${to12h(provider.otherTimeTo)}`
                          : b,
                      )
                      .join(" & ")}
                  </span>
                )}
                {provider.minNoticeValue && (
                  <span className="text-[14px] text-muted-foreground">
                    · {provider.minNoticeValue} {provider.minNoticeUnit} notice
                  </span>
                )}
                {provider.emergencyReadiness === true && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                    Emergency ok
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Location */}
          {provider.locationStyles.length > 0 && (
            <div
              className={[
                "px-6 py-5 flex items-center gap-3",
                sortedSkills.length > 0 || provider.days.length > 0 || provider.timeBlocks.length > 0
                  ? "border-t border-brandText/10"
                  : "",
              ].join(" ")}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <span className="text-[15px] text-brandText">
                {provider.locationStyles.join(", ")}
                {provider.areaName.trim() && (
                  <span className="text-muted-foreground"> · {provider.areaName.trim()}</span>
                )}
              </span>
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={onRequestService}
        disabled={!canRequestService}
        className="neu-primary w-full h-14 rounded-2xl text-white text-[16px] font-bold tracking-[0.01em] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {canRequestService ? "Request a Service" : "Verify identity to request"}
      </button>
    </div>
  );
}
