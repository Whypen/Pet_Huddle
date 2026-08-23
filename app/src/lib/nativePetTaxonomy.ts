export type NativePetSpeciesOption = {
  id: string;
  value: string;
  label: string;
};

export const PET_FOCUS_OPTIONS: NativePetSpeciesOption[] = [
  { id: "dog", value: "dog", label: "Dogs" },
  { id: "cat", value: "cat", label: "Cats" },
  { id: "bird", value: "bird", label: "Birds" },
  { id: "fish", value: "fish", label: "Fish" },
  { id: "reptile", value: "reptile", label: "Reptiles" },
  { id: "small_mammal", value: "small_mammal", label: "Small Mammals" },
  { id: "farm_animal", value: "farm_animal", label: "Farm Animals" },
  { id: "others", value: "others", label: "Others" },
];

export const PET_SPECIES_OPTIONS = PET_FOCUS_OPTIONS;

export const SPECIES_BREEDS: Record<string, string[]> = {
  dog: [
    "Beagle", "Border Collie", "Bulldog", "Cavalier King Charles Spaniel", "Chihuahua",
    "Cocker Spaniel", "Corgi", "Dachshund", "French Bulldog", "German Shepherd",
    "Golden Retriever", "Husky", "Jack Russell Terrier", "Labrador Retriever",
    "Local Mixed-Breed", "Maltese", "Pit Bull Terrier", "Pomeranian", "Poodle",
    "Pug", "Rottweiler", "Shiba Inu", "Shih Tzu", "Yorkshire Terrier", "Others",
  ],
  cat: [
    "Abyssinian", "American Shorthair", "American Wirehair", "Bengal", "Birman",
    "Bombay", "British Shorthair", "Burmese", "Chartreux", "Cornish Rex",
    "Devon Rex", "Domestic Shorthair", "Egyptian Mau", "Exotic Shorthair",
    "Japanese Bobtail", "Local Mixed-Breed", "Maine Coon", "Manx",
    "Norwegian Forest Cat", "Oriental Shorthair", "Persian", "Ragdoll",
    "Russian Blue", "Scottish Fold", "Siamese", "Sphynx", "Others",
  ],
  bird: [
    "Budgerigar", "Caique", "Canary", "Cockatiel", "Diamond Dove", "Finch",
    "Lovebird", "Parakeet", "Parrotlet", "Parrots", "Quaker Parrot",
    "Rosella", "Sun Conure", "Yellow-naped Amazon", "Others",
  ],
  fish: [
    "Angelfish", "Betta", "Corydoras Catfish", "Danio", "Tetras", "Discus",
    "Guppy", "Goldfish", "Koi", "Molly", "Oscar", "Pleco", "Platy",
    "Rainbowfish", "Rasbora", "Swordtail", "Others",
  ],
  reptile: ["Bearded Dragon", "Gecko", "Snake", "Turtle", "Others"],
  small_mammal: [
    "Chinchilla", "Ferret", "Gerbil", "Guinea Pig", "Hamster", "Hedgehog",
    "Hermit Crab", "Mouse", "Rabbit", "Rat", "Sugar Glider", "Others",
  ],
  farm_animal: [
    "Alpaca", "Chicken", "Donkey", "Duck", "Goat", "Llama",
    "Miniature Horse", "Pig", "Quail", "Sheep", "Others",
  ],
};

export const DOG_BREED_OPTIONS = SPECIES_BREEDS.dog;
export const CAT_BREED_OPTIONS = SPECIES_BREEDS.cat;

export function normalizePetSpecies(value?: string | null): string {
  return String(value || "").trim().toLowerCase().replace(/[\s/]+/g, "_");
}

function resolveBreedSpeciesKey(value?: string | null): string {
  const normalized = normalizePetSpecies(value);
  if (SPECIES_BREEDS[normalized]) return normalized;
  const option = PET_FOCUS_OPTIONS.find((item) => {
    const label = item.label;
    const singularLabel = label.endsWith("s") ? label.slice(0, -1) : label;
    return normalized === normalizePetSpecies(item.value)
      || normalized === normalizePetSpecies(item.id)
      || normalized === normalizePetSpecies(label)
      || normalized === normalizePetSpecies(singularLabel);
  });
  return option?.value ?? normalized;
}

export function getBreedOptionsForSpecies(species?: string | null): string[] {
  return SPECIES_BREEDS[resolveBreedSpeciesKey(species)] ?? ["Others"];
}

export function formatPetSpecies(value?: string | null): string {
  const key = normalizePetSpecies(value);
  const label = PET_FOCUS_OPTIONS.find((item) => item.value === key || item.id === key)?.label;
  return label ? label.replace(/s$/, "") : String(value || "Pet");
}

export const nativePetFocusLabels = PET_FOCUS_OPTIONS.map((item) => item.label);

export function nativePetEmojiForLabel(label?: string | null): string {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("dog")) return "🐕";
  if (normalized.includes("cat")) return "🐈";
  if (normalized.includes("bird")) return "🐦";
  if (normalized.includes("fish")) return "🐟";
  if (normalized.includes("reptile")) return "🦎";
  if (normalized.includes("small")) return "🐰";
  if (normalized.includes("farm")) return "🐐";
  return "🐾";
}

export function normalizeNativePetFocusLabel(label?: string | null): string | null {
  const normalized = String(label || "").trim().toLowerCase();
  const option = PET_FOCUS_OPTIONS.find((item) => (
    normalized === item.label.toLowerCase()
    || normalized === item.value.toLowerCase()
    || normalized === item.id.toLowerCase()
  ));
  return option?.label ?? null;
}

export function buildNativePetFocusLabel(species?: string | null, breed?: string | null): string {
  const speciesLabel = formatPetSpecies(species);
  const cleanBreed = String(breed || "").trim();
  return cleanBreed ? `${speciesLabel} • ${cleanBreed}` : speciesLabel;
}

export function splitNativePetFocusLabel(label?: string | null): { species: string; breed: string | null } {
  const [species = "", breed = ""] = String(label || "").split("•").map((part) => part.trim());
  return { species, breed: breed || null };
}

export function nativePetBreedOptionsForSpeciesLabel(label?: string | null): string[] {
  const { species } = splitNativePetFocusLabel(label);
  return getBreedOptionsForSpecies(species);
}
