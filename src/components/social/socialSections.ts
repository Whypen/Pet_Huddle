// NativeSocialScreen.tsx:355 is the product source of truth for Social sections.
export const SOCIAL_SECTIONS = ["Social", "Pets", "Health", "Adoption", "News", "Events", "Market"] as const;

export type SocialSection = (typeof SOCIAL_SECTIONS)[number];

// Older web rows used Meetup/Marketplace. Native accepts these aliases when it
// filters, so web must preserve the same compatibility rather than fork it.
export const SOCIAL_SECTION_ALIASES: Record<SocialSection, readonly string[]> = {
  Social: ["Social"],
  Pets: ["Pets"],
  Health: ["Health"],
  Adoption: ["Adoption"],
  News: ["News"],
  Events: ["Events", "Meetup"],
  Market: ["Market", "Marketplace"],
};
