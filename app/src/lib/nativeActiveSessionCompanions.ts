export type ActiveOutCompanionSource = {
  avatarBlurred?: boolean;
  avatarUrl: string | null;
  displayName: string | null;
};

export type ActiveOutCompanion = {
  avatarUrl: string | null;
  isBlurred: boolean;
  name: string;
};

// The Lock Screen uses the exact Home ordering: matched people arrive first
// with their name, while nearby non-matches retain only a blurred photo slot.
export const buildActiveOutCompanions = (people: ActiveOutCompanionSource[]): ActiveOutCompanion[] =>
  people.slice(0, 4).map((person) => {
    const isBlurred = person.avatarBlurred === true;
    return {
      avatarUrl: person.avatarUrl,
      isBlurred,
      name: isBlurred ? "" : String(person.displayName || "").trim(),
    };
  });

export const activeOutCompanionTrace = (companions: ActiveOutCompanion[], totalCount: number) => ({
  avatarIsBlurred: companions.map((companion) => companion.isBlurred),
  hasName: companions.map((companion) => Boolean(companion.name)),
  hasPhoto: companions.map((companion) => Boolean(companion.avatarUrl)),
  totalCount,
});
