export type GenderBucket = "male" | "female" | "neutral";

const maleAvatarModules = import.meta.glob("../../assets/user pin/male/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const femaleAvatarModules = import.meta.glob("../../assets/user pin/female/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const neutralAvatarModules = import.meta.glob("../../assets/user pin/neutral/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const groupPinModules = import.meta.glob("../../assets/user pin/groups/*.svg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const sortAssetUrls = (modules: Record<string, string>) =>
  Object.entries(modules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, url]) => url);

const AVATAR_ASSETS: Record<GenderBucket, string[]> = {
  male: sortAssetUrls(maleAvatarModules),
  female: sortAssetUrls(femaleAvatarModules),
  neutral: sortAssetUrls(neutralAvatarModules),
};

const GROUP_PIN_ASSETS = sortAssetUrls(groupPinModules);

const hashDeterministically = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pickFromList = (items: string[], key: string) => {
  if (items.length === 0) return null;
  return items[hashDeterministically(key) % items.length] ?? null;
};

export const normalizeGenderBucket = (value: string | null | undefined): GenderBucket => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "man") return "male";
  if (normalized === "female" || normalized === "woman") return "female";
  return "neutral";
};

export const pickMaskedAvatarAsset = (bucket: GenderBucket, sessionKey: string) =>
  pickFromList(AVATAR_ASSETS[bucket], sessionKey);

export const pickGroupedPinAsset = (sessionKey: string) =>
  pickFromList(GROUP_PIN_ASSETS, sessionKey);
