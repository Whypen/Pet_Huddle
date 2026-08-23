import type { ShareCardData, ShareCardPet, ShareCardTier } from "../components/share/NativeShareCard";

// Builds the share-card view model from real profile / carer records. Every
// field on the card must trace to a DB-backed value handed in by the screen —
// nothing here invents data, and anything absent simply doesn't render.

const speciesEmoji = (species?: string | null): string => {
  const s = String(species || "").toLowerCase();
  if (s.includes("dog")) return "🐕";
  if (s.includes("cat")) return "🐈";
  if (s.includes("rabbit") || s.includes("bunny")) return "🐰";
  if (s.includes("bird")) return "🐦";
  if (s.includes("fish")) return "🐠";
  if (s.includes("reptile") || s.includes("turtle")) return "🐢";
  if (s.includes("hamster") || s.includes("rodent")) return "🐹";
  return "🐾";
};

const hueForKey = (key: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 360;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const normalizeTier = (tier?: string | null): ShareCardTier => {
  const t = String(tier || "").toLowerCase();
  if (t === "gold" || t === "huddle＊" || t === "huddle*" || t.startsWith("gold_") || t.startsWith("huddle_gold")) return "gold";
  if (t === "plus" || t === "premium" || t === "huddle+" || t === "huddle plus" || t === "huddle_plus" || t.startsWith("plus_") || t.startsWith("premium_") || t.startsWith("huddle_plus")) return "plus";
  return "free";
};

const tierBrandLabel = (tier: ShareCardTier): string => (
  tier === "gold" ? "huddle＊" : tier === "plus" ? "huddle+" : "huddle"
);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "#71 · with huddle since May 2026" — used on the front rail and back footer.
const memberSinceLine = (memberNumber?: number | null, createdAt?: string | null): string => {
  const d = createdAt ? new Date(createdAt) : null;
  const when = d && Number.isFinite(d.getTime()) ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
  const seq = typeof memberNumber === "number" && memberNumber > 0 ? `#${memberNumber} · ` : "";
  return when ? `${seq}with huddle since ${when}` : `${seq}huddle member`;
};

// "12 years with cats 🐈" from profiles.experience_years + pet_experience.
const experienceLine = (experienceYears?: string | number | null, petExperience?: string[] | null): string | null => {
  const years = Number(experienceYears);
  if (!Number.isFinite(years) || years <= 0) return null;
  const first = (petExperience || [])[0];
  const species = first ? first.split("·")[0].trim().toLowerCase() : "";
  const emoji = species ? speciesEmoji(species) : "🐾";
  return species
    ? `${years} ${years === 1 ? "year" : "years"} with ${species} ${emoji}`
    : `${years} ${years === 1 ? "year" : "years"} with pets ${emoji}`;
};

// Engagement tier → shareable highlight. Only trusted/pillar earn a pill —
// mirrors the sparkle (half-full = trusted, full = pillar).
const engagementPill = (tier?: string | null): string | null => {
  if (tier === "trusted") return "Top Member";
  if (tier === "pillar") return "Loyal Member";
  return null;
};

export type ProfileShareInput = {
  id: string;
  displayName: string;
  socialId?: string | null;
  avatarUrl?: string | null;
  tier?: string | null;
  isVerified?: boolean;
  createdAt?: string | null;
  memberNumber?: number | null;
  engagementTier?: string | null;
  experienceYears?: string | number | null;
  petExperience?: string[] | null;
  roleLabels: string[]; // profiles.availability_status (normalized enum)
  groupCount?: number;
  friendCount?: number;
  pets: Array<{ name: string; species?: string | null; breed?: string | null; photoUri?: string | null }>;
};

export function buildProfileShareCard(input: ProfileShareInput): ShareCardData {
  const tier = normalizeTier(input.tier);
  const roles = input.roleLabels.filter(Boolean);
  const pets: ShareCardPet[] = input.pets.map((p) => ({
    name: p.name,
    emoji: speciesEmoji(p.species),
    photoUri: p.photoUri || null,
    hue: hueForKey(p.name),
  }));
  const handle = input.socialId ? `@${String(input.socialId).replace(/^@/, "")}` : "";
  const highlight = engagementPill(input.engagementTier);
  const experience = experienceLine(input.experienceYears, input.petExperience);
  const since = memberSinceLine(input.memberNumber, input.createdAt);

  // Ticker = real shareable facts only; anything missing just isn't included.
  const ticker = [
    ...(experience ? [experience] : []),
    ...pets.map((p) => `${p.name} ${p.emoji || ""}`.trim()),
    ...(typeof input.groupCount === "number" && input.groupCount > 0 ? [plural(input.groupCount, "group")] : []),
    ...(typeof input.friendCount === "number" && input.friendCount > 0 ? [plural(input.friendCount, "friend")] : []),
    tierBrandLabel(tier),
  ];

  return {
    variant: "profile",
    name: input.displayName || "huddle member",
    handle,
    photoUri: input.avatarUrl || null,
    tier,
    verified: input.isVerified === true,
    // All roles live in the eyebrow (measured fit-list) — no duplicate badges.
    eyebrowItems: roles.length ? roles : ["Animal Friend"],
    subline: handle,
    stickers: [
      // Engagement highlight carries the sparkle (half-full = Top, full = Loyal),
      // mirroring the profile sparkle — full for pillar, half for trusted.
      ...(highlight ? [{ label: highlight, sparkle: input.engagementTier === "pillar" ? ("full" as const) : ("half" as const) }] : []),
      ...(typeof input.groupCount === "number" && input.groupCount > 0 ? [{ label: plural(input.groupCount, "group") }] : []),
    ],
    badges: [],
    railText: since,
    ticker,
    // /share/profile_{id} renders a rich OG preview (avatar + name + bio) and
    // bounces to the app/store — pasted links unfurl as a card, never raw.
    deepLink: input.id ? `https://huddle.pet/share/profile_${encodeURIComponent(input.id)}` : null,
    footerLine: since,
    pets,
  };
}

export type CareShareInput = {
  id: string;
  displayName: string;
  socialId?: string | null;
  avatarUrl?: string | null;
  tier?: string | null;
  createdAt?: string | null;
  availableNow: boolean;
  emergencyReady: boolean;
  voluntaryRate: boolean;
  petTypes: string[];
  allPets: boolean;
  services: string[];
  skills: string[];
  availability?: string | null; // "Tue · Wed — anytime"
  /** From professional_credentials via get_public_provider_credential_badges —
      registry-verified first — plus any self-declared from the care profile. */
  credentials: Array<{ type: string; issuingBody?: string | null; verified: boolean }>;
  experienceYears?: string | number | null;
  petExperience?: string[] | null;
  ratingAvg?: number | null; // from service_reviews summary RPC, not the stale cache
  reviewCount?: number;
};

export function buildCareShareCard(input: CareShareInput): ShareCardData {
  const handle = input.socialId ? `@${String(input.socialId).replace(/^@/, "")}` : "";
  const caresFor = input.allPets ? "cares for all pets"
    : input.petTypes.length ? `cares for ${input.petTypes.join(" & ").toLowerCase()}` : "cares for pets";
  const statusChip = input.emergencyReady ? { label: "Emergency ready", dot: true }
    : input.availableNow ? { label: "Available now", dot: true } : null;

  // Verified credentials outrank self-declared everywhere on the card. We show
  // the credential TYPE only (never the issuing body — too long / private).
  const ordered = [...input.credentials].sort((a, b) => Number(b.verified) - Number(a.verified));
  const hasVerified = ordered.some((c) => c.verified);
  const credTypes = ordered.map((c) => c.type.replace(/^certified\s+/i, "").trim()).filter(Boolean);

  // Vertical rail: whole credential names up to a generous budget, then "+N".
  // The component renders at full size and auto-shrinks (min 60%), so this
  // only guards truly extreme lists — "Veterinarian · Trainer" passes whole.
  const RAIL_BUDGET = 34;
  const railParts: string[] = [];
  let railUsed = 0;
  for (const t of credTypes) {
    const add = (railParts.length ? 3 : 0) + t.length;
    if (railUsed + add > RAIL_BUDGET) break;
    railParts.push(t); railUsed += add;
  }
  const railRemainder = credTypes.length - railParts.length;
  const railText = credTypes.length
    ? `${railParts.join(" · ")}${railRemainder > 0 ? ` +${railRemainder}` : ""}` || `${credTypes[0]} +${credTypes.length - 1}`
    : "huddle Pet Carer";

  const experience = experienceLine(input.experienceYears, input.petExperience);

  // Fixed, fitting ledger. One combined credentials row (types + ✓ for verified);
  // the component drops any row that would overflow so the footer never clips.
  const rows: Array<[string, string]> = [];
  rows.push(["Cares for", input.allPets ? "All pets" : input.petTypes.join(" · ") || "—"]);
  if (input.services.length) rows.push(["Services", input.services.join(" · ")]);
  if (input.availability) rows.push(["Available", input.availability]);
  if (input.skills.length) rows.push(["Skills", input.skills.join(" · ")]);
  if (ordered.length) rows.push(["Credentials", ordered.map((c) => `${c.type}${c.verified ? " ✓" : ""}`).join(" · ")]);
  rows.push(["Rate", input.voluntaryRate ? "Voluntary" : "On request"]);

  // Stats lead with credibility, not logistics.
  const stats: Array<[string, string]> = [];
  if (hasVerified) stats.push(["✓", "Verified"]);
  const years = Number(input.experienceYears);
  if (Number.isFinite(years) && years > 0) stats.push([`${years} yr`, "Experience"]);
  // Always one decimal place — "4.0★" reads as a real score, bare "4★" reads
  // as a rounded guess (and nobody holds a flat 5).
  if (typeof input.ratingAvg === "number" && input.ratingAvg > 0 && (input.reviewCount ?? 0) > 0) stats.push([`${input.ratingAvg.toFixed(1)}★`, plural(input.reviewCount ?? 0, "review")]);

  return {
    variant: "care",
    name: input.displayName || "huddle carer",
    handle,
    photoUri: input.avatarUrl || null,
    tier: normalizeTier(input.tier),
    verified: hasVerified,
    // Eyebrow is the services list (measured fit + "+N") — replaces the generic
    // "Certified huddle Pet Carer" and the separate badge chips.
    eyebrowItems: input.services.length ? input.services : ["huddle Pet Carer"],
    subline: caresFor,
    stickers: [
      ...(statusChip ? [statusChip] : []),
      ...(input.voluntaryRate ? [{ label: "Voluntary rate" }] : []),
    ],
    badges: [],
    railText,
    ticker: [
      ...ordered.slice(0, 2).map((c) => c.type),
      caresFor,
      ...(experience ? [experience] : []),
      "huddle care",
    ],
    // /share/carer_{id} renders a rich OG preview (avatar + services) and
    // bounces to the app/store — pasted links unfurl as a card, never raw.
    deepLink: input.id ? `https://huddle.pet/share/carer_${encodeURIComponent(input.id)}` : null,
    footerLine: "huddle care",
    pets: [],
    careStats: stats,
    careRows: rows,
  };
}
