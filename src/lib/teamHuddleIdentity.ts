import teamHuddleLogo from "@/assets/huddle logo.jpg";

export const TEAM_HUDDLE_USER_ID = "8f55ab31-6b25-4d1a-98c7-3a6e8af2d941";

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export const isTeamHuddleIdentity = (displayName: string | null | undefined, socialId: string | null | undefined) => {
  const name = normalize(displayName);
  const social = normalize(socialId).replace(/^@/, "");
  if (name === "team huddle") return true;
  return social === "teamhuddle" || social === "team_huddle" || social === "team-huddle" || social === "huddleteam" || social === "huddle_team";
};

export const resolveTeamHuddleDisplayName = (
  userId: string | null | undefined,
  displayName: string | null | undefined,
  socialId: string | null | undefined,
) => {
  if (String(userId || "").trim() === TEAM_HUDDLE_USER_ID) return "Huddle";
  if (isTeamHuddleIdentity(displayName, socialId)) return "Huddle";
  return displayName ?? null;
};

export const resolveTeamHuddleAvatar = (
  avatarUrl: string | null | undefined,
  displayName: string | null | undefined,
  socialId: string | null | undefined,
) => {
  if (isTeamHuddleIdentity(displayName, socialId)) return teamHuddleLogo;
  return avatarUrl ?? null;
};
