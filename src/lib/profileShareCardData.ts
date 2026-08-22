export type ProfileShareCardPet = {
  name: string;
  species: string | null;
  photo_url: string | null;
};

export type ProfileShareCardProfile = {
  id: string;
  display_name: string;
  social_id: string | null;
  avatar_url: string | null;
  verified: boolean;
  tier: string | null;
  member_since: string | null;
  roles: string[];
  engagement_tier: string | null;
  experience_years: string | number | null;
  pet_experience: string[];
  groups_count: number | null;
  friends_count: number | null;
  member_number: number | null;
  pets: ProfileShareCardPet[];
};

export type ProfileShareCardInput = {
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
  roleLabels: string[];
  groupCount?: number | null;
  friendCount?: number | null;
  pets: Array<{
    name: string;
    species?: string | null;
    photoUri?: string | null;
  }>;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeTier = (tier?: string | null): "free" | "plus" | "gold" => {
  const value = cleanString(tier).toLowerCase();
  if (value === "gold" || value === "huddle＊" || value === "huddle*" || value.startsWith("gold_") || value.startsWith("huddle_gold")) {
    return "gold";
  }
  if (
    value === "plus" ||
    value === "premium" ||
    value === "huddle+" ||
    value === "huddle plus" ||
    value === "huddle_plus" ||
    value.startsWith("plus_") ||
    value.startsWith("premium_") ||
    value.startsWith("huddle_plus")
  ) {
    return "plus";
  }
  return "free";
};

export const tierBrandLabel = (tier: "free" | "plus" | "gold"): string => (
  tier === "gold" ? "huddle＊" : tier === "plus" ? "huddle+" : "huddle"
);

export const memberSinceLine = (memberNumber?: number | null, createdAt?: string | null): string => {
  const date = createdAt ? new Date(createdAt) : null;
  const when = date && Number.isFinite(date.getTime())
    ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : null;
  const sequence = typeof memberNumber === "number" && memberNumber > 0 ? `#${memberNumber} · ` : "";
  return when ? `${sequence}with huddle since ${when}` : `${sequence}huddle member`;
};

export const engagementPill = (tier?: string | null): string | null => {
  if (tier === "trusted") return "Top Member";
  if (tier === "pillar") return "Loyal Member";
  return null;
};

export const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const speciesEmoji = (species?: string | null): string => {
  const value = cleanString(species).toLowerCase();
  if (value.includes("dog")) return "🐕";
  if (value.includes("cat")) return "🐈";
  if (value.includes("rabbit") || value.includes("bunny")) return "🐰";
  if (value.includes("bird")) return "🐦";
  if (value.includes("fish")) return "🐠";
  if (value.includes("reptile") || value.includes("turtle")) return "🐢";
  if (value.includes("hamster") || value.includes("rodent")) return "🐹";
  return "🐾";
};

export const profileExperienceLine = (yearsValue?: string | number | null, petExperience?: string[] | null): string | null => {
  const years = Number(yearsValue);
  if (!Number.isFinite(years) || years <= 0) return null;
  const first = petExperience?.[0];
  const species = first ? first.split("·")[0].trim().toLowerCase() : "";
  const emoji = species ? speciesEmoji(species) : "🐾";
  return species
    ? `${years} ${years === 1 ? "year" : "years"} with ${species} ${emoji}`
    : `${years} ${years === 1 ? "year" : "years"} with pets ${emoji}`;
};

/** Exact profile ticker order from app/src/lib/shareCardData.ts. */
export const profileTicker = (profile: ProfileShareCardProfile): string[] => {
  const experience = profileExperienceLine(profile.experience_years, profile.pet_experience);
  return [
    ...(experience ? [experience] : []),
    ...profile.pets.map((pet) => `${pet.name} ${speciesEmoji(pet.species)}`),
    ...(profile.groups_count ? [plural(profile.groups_count, "group")] : []),
    ...(profile.friends_count ? [plural(profile.friends_count, "friend")] : []),
    profile.tier || "huddle",
  ];
};

/** Ported from app/src/lib/nativePublicProfile.ts:310-327. */
export const normalizeNativeAvailabilityStatus = (row: Record<string, unknown>): string[] => {
  const normalizeAvailabilityRole = (value: unknown) => {
    const role = String(value || "").trim();
    if (!role || role.toLowerCase() === "free") return "";
    if (/^vet$/i.test(role)) return "Veterinarian";
    if (/^animal friend\s*\(no pet\)$/i.test(role)) return "Animal Friend";
    const allowed = new Set([
      "Pet Parent", "Pet Nanny", "Animal Friend", "Veterinarian",
      "Pet Photographer", "Pet Groomer", "Vet Nurse", "Volunteer",
    ]);
    return allowed.has(role) ? role : "";
  };

  if (Array.isArray(row.availability_status) && row.availability_status.length > 0) {
    const roles = row.availability_status.map(normalizeAvailabilityRole).filter(Boolean);
    if (roles.length > 0) return roles;
  }
  if (row.has_pets === true || row.owns_pets === true || (Array.isArray(row.pet_heads) && row.pet_heads.length > 0)) {
    return ["Pet Parent"];
  }
  return ["Animal Friend"];
};

export const isMinorDob = (dob?: string | null): boolean => {
  if (!dob) return false;
  const birth = new Date(dob);
  if (!Number.isFinite(birth.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age < 18;
};

export const buildProfileShareCard = (input: ProfileShareCardInput): ProfileShareCardProfile => {
  const tier = normalizeTier(input.tier);
  const roles = input.roleLabels.filter(Boolean);
  const handle = input.socialId ? cleanString(input.socialId).replace(/^@/, "") : null;
  return {
    id: input.id,
    display_name: input.displayName || "huddle member",
    social_id: handle,
    avatar_url: input.avatarUrl || null,
    verified: input.isVerified === true,
    tier: tierBrandLabel(tier),
    member_since: input.createdAt || null,
    roles: roles.length > 0 ? roles : ["Animal Friend"],
    engagement_tier: input.engagementTier === "trusted" || input.engagementTier === "pillar"
      ? input.engagementTier
      : null,
    experience_years: input.experienceYears ?? null,
    pet_experience: Array.isArray(input.petExperience) ? input.petExperience.filter(Boolean) : [],
    groups_count: typeof input.groupCount === "number" ? input.groupCount : null,
    friends_count: typeof input.friendCount === "number" ? input.friendCount : null,
    member_number: typeof input.memberNumber === "number" && input.memberNumber > 0 ? input.memberNumber : null,
    pets: input.pets
      .filter((pet) => cleanString(pet.name).length > 0)
      .map((pet) => ({
        name: cleanString(pet.name),
        species: pet.species || null,
        photo_url: pet.photoUri || null,
      })),
  };
};
