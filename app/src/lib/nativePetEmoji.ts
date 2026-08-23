export const nativePetSpeciesEmoji = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  const key = normalized.replace(/[\s/-]+/g, "_");
  if (key === "dog" || key === "dogs") return "🐕";
  if (key === "cat" || key === "cats") return "🐈";
  if (key === "bird" || key === "birds") return "🐦";
  if (key === "fish") return "🐟";
  if (key === "reptile" || key === "reptiles") return "🦎";
  if (key === "small_mammal" || key === "small_mammals") return "🐰";
  if (key === "farm_animal" || key === "farm_animals") return "🐐";
  if (key === "other" || key === "others") return "🐾";
  if (/dog|puppy|canine/.test(normalized)) return "🐶";
  if (/cat|kitten|feline/.test(normalized)) return "🐱";
  if (/rabbit|bunny/.test(normalized)) return "🐰";
  if (/bird|parrot/.test(normalized)) return "🐦";
  if (/fish/.test(normalized)) return "🐟";
  if (/horse/.test(normalized)) return "🐴";
  if (/hamster|gerbil|guinea/.test(normalized)) return "🐹";
  if (/reptile|lizard|gecko/.test(normalized)) return "🦎";
  if (/snake/.test(normalized)) return "🐍";
  if (/turtle|tortoise/.test(normalized)) return "🐢";
  return "";
};

export const nativePetSpeciesEmojiOrText = (value: string | null | undefined) => nativePetSpeciesEmoji(value) || String(value || "").trim();

const formatNativePetSpeciesLabel = (value: string | null | undefined) => {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export const formatNativePetJourney = ({
  experienceYears,
  petExperience,
}: {
  experienceYears: unknown;
  petExperience?: string[] | null;
}) => {
  const yearsMatch = String(experienceYears ?? "").match(/\d+(?:\.\d+)?/);
  const numericYears = yearsMatch ? Number(yearsMatch[0]) : Number(experienceYears ?? 0);
  if (!Number.isFinite(numericYears) || numericYears <= 0) return "";
  const speciesDisplay = (petExperience ?? [])
    .map((item) => String(item || "").split(/[•·]/)[0] || "")
    .map(formatNativePetSpeciesLabel)
    .map(nativePetSpeciesEmojiOrText)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" · ");
  const roundedYears = Math.round(numericYears);
  return `${roundedYears} ${roundedYears === 1 ? "year" : "years"}${speciesDisplay ? ` with ${speciesDisplay}` : ""}`;
};
