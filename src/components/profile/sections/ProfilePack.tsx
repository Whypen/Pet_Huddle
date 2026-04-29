import { Lock, PawPrint } from "lucide-react";
import { PolaroidCard, type PolaroidBadge } from "@/components/ui/PolaroidCard";

type ProfilePackPet = {
  id: string;
  species?: string | null;
  photoUrl?: string | null;
  name?: string | null;
  isPublic?: boolean | null;
  dob?: string | null;
};

type ProfilePackProps = {
  pets: ProfilePackPet[];
  displayName: string;
  experienceYears: string;
  petExperience: string[];
  onPetClick?: (petId: string, isPublic: boolean) => void;
};

const privateBadge: PolaroidBadge = {
  key: "private",
  Icon: Lock,
  iconColor: "#ffffff",
  bg: "#2145CF",
};

const formatSpecies = (value?: string | null) => {
  const clean = String(value || "").trim();
  if (!clean) return "Pet";
  return clean
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const formatExperienceLine = (years: string, species: string[]) => {
  const numericYears = Number(years || 0);
  const yearsPart = Number.isFinite(numericYears) && numericYears > 0
    ? `${numericYears} ${numericYears === 1 ? "YEAR" : "YEARS"}`
    : null;
  const speciesPart = species.length
    ? species.map((item) => formatSpecies(item).toUpperCase()).join(", ")
    : null;
  return [yearsPart, speciesPart].filter(Boolean).join(" · ");
};

const formatPetAge = (dob?: string | null) => {
  if (!dob) return "";
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years > 0) return `${years}`;
  if (months > 0) return `${months} mo`;
  return "";
};

const formatPetCaption = (pet: ProfilePackPet) => {
  const species = formatSpecies(pet.species);
  const age = formatPetAge(pet.dob);
  return [species, age].filter(Boolean).join(" · ");
};

export function ProfilePack({
  pets,
  displayName,
  experienceYears,
  petExperience,
  onPetClick,
}: ProfilePackProps) {
  const publicPets = pets.filter((pet) => pet.id);
  const experienceLine = formatExperienceLine(experienceYears, petExperience);

  return (
    <section className="bg-[rgba(66,73,101,0.055)] py-7">
      <div className="px-5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.08em] text-[var(--fg-1)]">The pack</h2>
        {experienceLine ? (
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--fg-2)]">
            {experienceLine}
          </p>
        ) : null}
      </div>

      {publicPets.length > 0 ? (
        <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
          {publicPets.map((pet) => {
            const isPublic = pet.isPublic !== false;
            return (
              <div key={pet.id} className="w-[46%] min-w-[156px] max-w-[190px] shrink-0 snap-center">
                <PolaroidCard
                  photoUrl={pet.photoUrl ?? null}
                  badges={isPublic ? [] : [privateBadge]}
                  captionPrimary={pet.name || "Pet"}
                  captionSecondary={isPublic ? formatPetCaption(pet) : "PRIVATE"}
                  disabled={!isPublic}
                  onTap={() => onPetClick?.(pet.id, isPublic)}
                  ariaLabel={`Open ${pet.name || "pet"}'s profile`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-5 mt-4 rounded-[4px] bg-[var(--bg-blue-soft)] px-5 py-8 text-center">
          <PawPrint className="mx-auto h-8 w-8 text-[var(--huddle-blue)]" strokeWidth={1.75} />
          <p className="mx-auto mt-3 max-w-[280px] text-[15px] italic text-[var(--fg-1)]">
            {displayName || "This member"} is new to pet life — ready to begin.
          </p>
        </div>
      )}
    </section>
  );
}
