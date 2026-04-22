import { CANONICAL_SOCIAL_ROLE_OPTIONS } from "@/lib/profileOptions";

export type CanonicalSocialRole = (typeof CANONICAL_SOCIAL_ROLE_OPTIONS)[number];

export interface FilterState {
  role: CanonicalSocialRole;
  selectedRoles?: CanonicalSocialRole[];
  species: string[];
  distance: number;
  seeFurther: boolean; // SPRINT 3: See Further toggle for extending max distance
  ageRange: [number, number];
  gender: string;
  petSize: string;
  languages: string[]; // SPRINT 3: Language filter
  // Premium filters (stored but not applied for free users)
  verifiedOnly: boolean;
  activeNow: boolean;
  temperamentMatch: boolean;
  hasCar: boolean;
  petSchoolGrad: boolean;
  commonFriends: boolean;
}

// SPRINT 3: Default filters with expanded distance support, ±3 year age range
export const defaultFilters: FilterState = {
  role: CANONICAL_SOCIAL_ROLE_OPTIONS[0],
  species: [],
  distance: 50,
  seeFurther: false, // Default to standard range
  ageRange: [18, 65], // Will be dynamically set to user's age ±3 in component
  gender: "",
  petSize: "",
  languages: [],
  verifiedOnly: false,
  activeNow: false,
  temperamentMatch: false,
  hasCar: false,
  petSchoolGrad: false,
  commonFriends: false,
};
