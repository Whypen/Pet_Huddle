/**
 * ProfileShareCard — the read-only profile every avatar tap opens.
 *
 * Replaces `PublicProfileSheet` at every avatar entry point. That component
 * carries a Star action, a chat entry and a pet drill-in; this one has NO
 * actions at all. Messaging someone is an app interaction, not a web one.
 *
 * NO LOCATION. The authenticated app snapshot is shaped without any location
 * field before it reaches this component, and there is no public profile API.
 *
 * TWO-SIDED, 3D, AUTO-ROTATING — matching the app.
 * `NativeShareCardModal.tsx:21-22, 112-114, 199` gives each face its own
 * rotateY (front θ, back θ+180) with backfaceVisibility hidden, under a shared
 * perspective, resting slightly off-square rather than flat. This is the CSS
 * equivalent: `preserve-3d` on the stage, `backface-visibility: hidden` on each
 * face, back pre-rotated 180°. Front is the identity face; back is the pack,
 * mirroring `PackBack` (NativeShareCard.tsx:444).
 *
 * The holographic foil IS ported (`.huddle-holo` in index.css) — same
 * five-colour cycle, same 115° lay, on both faces as native does. It runs on
 * CSS keyframes rather than rAF so it cannot silently stop the way a
 * rAF-driven effect can.
 *
 * The palette is bespoke to the card and lives in neither token file, so the
 * literal values are copied from NativeShareCard.tsx:24-28.
 */

import { useEffect, useRef, useState } from "react";
import { GlassModal } from "@/components/ui/GlassModal";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileShareCard } from "@/lib/profileShareCard";
import { engagementPill, memberSinceLine, plural, profileTicker } from "@/lib/profileShareCardData";
import type {
  ProfileShareCardPet,
  ProfileShareCardProfile,
} from "@/lib/profileShareCardData";

// NativeShareCard.tsx:24-28 — bespoke to this card, not in the token files.
const INK = "#0C1E5C";
const CREAM = "#FFF9F0";
const BLUE = "#2145CF";
/**
 * The accent, and it is NOT tier-derived.
 *
 * `NativeShareCard.tsx:293` reads `accent = data.variant === "care" ? CORAL :
 * LIME`. A profile card is always lime — gold and coral never appear on one,
 * whatever the member's tier. An earlier version of this file keyed the accent
 * off `profile.tier`, which the simulator disproved: hyphen is Free and the
 * card is lime throughout.
 */
const LIME = "#BFFF00";
/** PackBack's gradient start — NativeShareCard.tsx:448. */
const PACK_BLUE = "#1B3AA0";

/** The card rests off-square, as the native one does (anim starts at x:-12). */
const REST_ANGLE = -12;
const SWAY = 7;

const faceBase =
  "absolute inset-0 overflow-hidden rounded-[22px] [backface-visibility:hidden] [transform-style:preserve-3d]";

const microLabel = "text-[10px] font-extrabold uppercase leading-[14px] tracking-[0.24em]";

const FrontFace = ({ profile }: { profile: ProfileShareCardProfile }) => {
  const accent = LIME;
  const since = memberSinceLine(profile.member_number, profile.member_since);
  const highlight = engagementPill(profile.engagement_tier);
  // `stickers` — shareCardData.ts:122-123: the engagement pill, then groups.
  // Friends are deliberately NOT a sticker; they appear only in the ticker.
  const stickers = [
    ...(highlight ? [highlight] : []),
    ...(profile.groups_count ? [plural(profile.groups_count, "group")] : []),
  ];
  // `ticker` — shareCardData.ts:101-105: pets, then groups, then friends.
  const ticker = profileTicker(profile);

  return (
    <div className={faceBase} data-card-face="front">
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${INK} 100%)` }} />
      )}

      {/* Thin brand tint — the native card's heavy double-wash was dialled back
          precisely so the photo stays legible. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(33,69,207,0.28) 0%, rgba(12,30,92,0.14) 100%)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[34%]"
        style={{ background: "linear-gradient(to bottom, rgba(4,8,26,0.7) 0%, transparent 100%)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]"
        style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(4,8,26,0.42) 44%, rgba(4,8,26,0.94) 100%)" }}
      />
      {/* Holographic foil — ports native's `Holo`. Sits above the artwork and
          scrims but below the frame and text, so it never washes out copy. */}
      <div className="huddle-holo" aria-hidden />
      <div className="huddle-holo-sheen" aria-hidden />

      <div
        className="pointer-events-none absolute inset-[10px] rounded-[14px] border"
        style={{ borderColor: "rgba(255,249,240,0.32)" }}
      />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-5">
        <span className="text-[15px] font-extrabold leading-none tracking-[-0.01em]" style={{ color: CREAM }}>
          {profile.tier || "huddle"}
        </span>
        {profile.verified ? (
          <span
            className={`rounded-full border px-2 py-[3px] ${microLabel}`}
            style={{ borderColor: accent, color: accent }}
          >
            Verified ✓
          </span>
        ) : null}
      </div>

      {/* Vertical rail — the native card runs the member line up the right edge. */}
      <p
        className={`pointer-events-none absolute right-[14px] top-1/2 origin-center whitespace-nowrap ${microLabel}`}
        style={{
          color: "rgba(255,249,240,0.55)",
          transform: "translateY(-50%) rotate(90deg)",
        }}
      >
        {since.toUpperCase()}
      </p>

      <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
        {/* Eyebrow: the role labels, in the accent — never an empty line, the
            endpoint always resolves at least one role. */}
        <p className={microLabel} style={{ color: accent }}>
          {profile.roles.join(" · ")}
        </p>
        <h2
          className="mt-1.5 text-[26px] font-extrabold uppercase leading-[1.1] tracking-[-0.02em] text-balance"
          style={{ color: CREAM }}
        >
          {profile.display_name}
        </h2>
        {profile.social_id ? (
          <p className="mt-0.5 text-[15px] font-bold leading-[20px]" style={{ color: "rgba(255,249,240,0.7)" }}>
            @{profile.social_id}
          </p>
        ) : null}

        {stickers.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {stickers.map((sticker) => (
              <span
                key={sticker}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[4px] ${microLabel}`}
                style={{ borderColor: "rgba(191,255,0,0.45)", color: CREAM }}
              >
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: accent }}
                />
                {sticker}
              </span>
            ))}
          </div>
        ) : null}

        {ticker.length > 0 ? (
          <p
            className={`mt-2 truncate ${microLabel}`}
            style={{ color: accent }}
            title={ticker.join(" · ")}
          >
            {ticker.join("  ·  ")}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const PetTile = ({ pet }: { pet: ProfileShareCardPet }) => (
  <li className="flex flex-col items-center gap-1.5">
    <span
      className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border"
      style={{ borderColor: "rgba(255,249,240,0.28)", background: "rgba(255,249,240,0.10)" }}
    >
      {pet.photo_url ? (
        <img src={pet.photo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[16px] font-extrabold" style={{ color: CREAM }}>
          {pet.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
    <span className="max-w-[64px] truncate text-[11px] font-bold leading-none" style={{ color: CREAM }}>
      {pet.name}
    </span>
  </li>
);

/** Mirrors `PackBack` — NativeShareCard.tsx:444. */
const BackFace = ({ profile }: { profile: ProfileShareCardProfile }) => {
  const pets = profile.pets.slice(0, 6);
  const single = pets.length === 1;

  // NativeShareCard's no-pet back is MirrorBack, not an invented empty pack.
  // Keep the identity artwork visible and add only the native footer treatment.
  if (pets.length === 0) {
    return (
      <div className={`${faceBase} [transform:rotateY(180deg)]`} data-card-face="back">
        <FrontFace profile={profile} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(4,8,26,0.5) 100%)" }}
        />
        <div className="absolute inset-x-5 bottom-5">
          <p className={microLabel} style={{ color: "rgba(255,249,240,0.85)" }}>
            {memberSinceLine(profile.member_number, profile.member_since).toUpperCase()}
          </p>
          <div className="mt-1 h-[3px] w-full bg-[#FFF9F0]" />
          {profile.social_id ? (
            <p className="mt-1 text-[13px] font-bold leading-none" style={{ color: LIME }}>
              @{profile.social_id}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${faceBase} [transform:rotateY(180deg)]`}
      data-card-face="back"
      style={{ background: `linear-gradient(200deg, ${PACK_BLUE} 0%, ${INK} 100%)` }}
    >
      {/* PackBack carries the foil too — NativeShareCard.tsx:449. */}
      <div className="huddle-holo" aria-hidden />
      <div className="huddle-holo-sheen" aria-hidden />

      <div
        className="pointer-events-none absolute inset-[10px] rounded-[14px] border"
        style={{ borderColor: "rgba(255,249,240,0.24)" }}
      />

      <div className="absolute inset-0 flex flex-col px-5 pb-5 pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-extrabold leading-none tracking-[-0.01em]" style={{ color: CREAM }}>
            huddle
          </span>
          <span className={microLabel} style={{ color: "rgba(255,249,240,0.6)" }}>
            {pets.length === 0 ? "No companions" : single ? "1 Companion" : `${pets.length} Companions`}
          </span>
        </div>

        <h3
          className="mt-2 text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em]"
          style={{ color: CREAM }}
        >
          {single ? pets[0].name.toUpperCase() : "THE PACK"}
        </h3>

        <div className="flex flex-1 items-center justify-center">
          {pets.length > 0 ? (
            <ul className="flex flex-wrap items-start justify-center gap-x-4 gap-y-3">
              {pets.map((pet, index) => (
                <PetTile key={`${pet.name}-${index}`} pet={pet} />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] font-bold" style={{ color: "rgba(255,249,240,0.55)" }}>
              No companions yet.
            </p>
          )}
        </div>

        {/* Footer line — the same `memberSinceLine` the front rail carries
            (shareCardData.ts:40 calls it "front rail and back footer"). */}
        <p className={microLabel} style={{ color: "rgba(255,249,240,0.5)" }}>
          {memberSinceLine(profile.member_number, profile.member_since).toUpperCase()}
        </p>
        {profile.social_id ? (
          // Lime on the dark back face — NativeShareCard.tsx:387.
          <p className="mt-1 text-[13px] font-bold leading-none" style={{ color: LIME }}>
            @{profile.social_id}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-[310px]" style={{ perspective: "1350px" }}>
    <div className="relative w-full" style={{ aspectRatio: "2 / 3" }}>
      {children}
    </div>
  </div>
);

const CardSkeleton = () => (
  <Stage>
    <div className="absolute inset-0 animate-pulse rounded-[22px] bg-muted/40" />
  </Stage>
);

const CardEmpty = ({ message }: { message: string }) => (
  <Stage>
    <div
      className="absolute inset-0 flex items-center justify-center rounded-[22px] px-6 text-center"
      style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${INK} 100%)` }}
    >
      <p className="text-[15px] font-bold text-white/90">{message}</p>
    </div>
  </Stage>
);

const CardRestricted = ({ profile }: { profile: ProfileShareCardProfile }) => (
  <Stage>
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-[22px] px-6 text-center"
      style={{ background: `linear-gradient(135deg, ${BLUE} 0%, ${INK} 100%)` }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/10 text-[22px] font-extrabold text-white">
        {profile.display_name.charAt(0).toUpperCase() || "H"}
      </div>
      <p className="mt-5 text-[20px] font-extrabold uppercase text-white">{profile.display_name}</p>
      {profile.social_id ? <p className="mt-1 text-[14px] font-bold text-white/70">@{profile.social_id}</p> : null}
      <p className="mt-5 text-[15px] font-bold text-white/90">Sign in to view</p>
    </div>
  </Stage>
);

const FlippableCard = ({ profile }: { profile: ProfileShareCardProfile }) => {
  const [flipped, setFlipped] = useState(false);
  const stageRef = useRef<HTMLButtonElement | null>(null);
  const flippedRef = useRef(false);

  useEffect(() => {
    flippedRef.current = flipped;
  }, [flipped]);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setFlipped((current) => !current), 5200);
    return () => window.clearInterval(timer);
  }, []);

  // Idle auto-rotate. The native card never sits square — it rests at -12° and
  // drifts, which is what makes it read as an object rather than a flat panel.
  //
  // Written straight to the DOM node, NOT through React state. Driving a
  // per-frame value with setState re-renders this subtree 60 times a second,
  // which restarts the overlay's entrance animation on every frame — it never
  // settles, and the whole card sits at partial opacity. That is a bug this
  // component had until it was seen in a browser.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const node = stageRef.current;
      if (node) {
        const sway = Math.sin((now - start) / 2600) * SWAY;
        node.style.transform = `rotateY(${(flippedRef.current ? 180 : 0) + REST_ANGLE + sway}deg)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Stage>
      <button
        ref={stageRef}
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? "Show profile" : "Show pets"}
        data-flipped={flipped ? "true" : "false"}
        className="absolute inset-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{
          transformStyle: "preserve-3d",
          // The FLIP is React-driven, not driven by the rAF loop above. The loop
          // only layers sway on top. If rAF never runs — reduced motion, a
          // background tab, a throttled device — the card must still turn over
          // when tapped. Putting the flip inside the loop made it silently do
          // nothing in exactly those cases.
          transform: `rotateY(${(flipped ? 180 : 0) + REST_ANGLE}deg)`,
          transition: "transform 620ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <FrontFace profile={profile} />
        <BackFace profile={profile} />
      </button>
    </Stage>
  );
};

export interface ProfileShareCardProps {
  /** Handle of the profile to show. Null closes the overlay. */
  profileId: string | null;
  onClose: () => void;
}

export const ProfileShareCard = ({ profileId, onClose }: ProfileShareCardProps) => {
  const { session } = useAuth();
  const { data: resource, loading, failed } = useProfileShareCard(profileId, Boolean(session));
  const isOpen = Boolean(profileId);
  const card = loading ? (
    <CardSkeleton />
  ) : failed || !resource ? (
    <CardEmpty message={session ? "This profile isn’t available." : "Sign in to view"} />
  ) : resource.restricted ? (
    <CardRestricted profile={resource.profile} />
  ) : (
    <FlippableCard profile={resource.profile} />
  );

  // Own close control rather than the glass chrome's: this sits on a dark card,
  // so it must read against the photo. Placed outside the card's top edge so it
  // never lands on the wordmark or the verified stamp.
  const body = (
    <div className="relative mx-auto w-full max-w-[360px]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -top-11 right-0 z-[1] flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      {card}
    </div>
  );

  // `!` is required: the overlay panel carries `glass-e3`, whose background and
  // border win over plain utilities. Without it the card renders inside a white
  // panel — a card within a card.
  const chromeless =
    "!bg-transparent !border-0 !shadow-none !backdrop-blur-none p-0 overflow-visible";

  // Founder contract: centred at every viewport, never presented as a bottom
  // sheet. The card itself is the object, so the modal chrome stays clear.
  return (
    <GlassModal isOpen={isOpen} onClose={onClose} hideClose maxWidth="max-w-[380px]" className={chromeless}>
      {body}
    </GlassModal>
  );
};

export default ProfileShareCard;
