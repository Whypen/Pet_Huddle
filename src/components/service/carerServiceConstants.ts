// ── Shared constants for the Service marketplace ─────────────────────────────
// Single source for SKILLS_GROUP_B, SERVICE_TYPES, LOCATION_STYLES, PROOF_CONFIG.
// Mirrors the constants in CarerProfile.tsx — do not diverge.

export const SKILLS_GROUP_B_LIST = [
  "Licensed veterinarian",
  "Certified groomer",
  "Certified behaviorist / trainer",
  "Pet first-aid / CPR certified",
  "Certified pet-carer",
] as const;

export type CertifiedSkill = typeof SKILLS_GROUP_B_LIST[number];

// Maps each certified skill to the fields shown publicly in the credential popover.
export const PROOF_CONFIG: Record<
  CertifiedSkill,
  { fields: { key: string; label: string }[] }
> = {
  "Licensed veterinarian": {
    fields: [
      { key: "country", label: "Country / region" },
      { key: "clinic",  label: "Clinic name" },
      { key: "license", label: "License number" },
    ],
  },
  "Certified groomer": {
    fields: [
      { key: "certNumber", label: "Certification number" },
      { key: "school",     label: "School / academy" },
    ],
  },
  "Certified behaviorist / trainer": {
    fields: [
      { key: "certNumber", label: "Certification number" },
      { key: "program",    label: "Program / issuer" },
    ],
  },
  "Pet first-aid / CPR certified": {
    fields: [
      { key: "course",     label: "Course name" },
      { key: "certNumber", label: "Certificate number" },
    ],
  },
  "Certified pet-carer": {
    fields: [
      { key: "org",    label: "Certification / organisation" },
      { key: "number", label: "Certificate / membership number" },
    ],
  },
};

// Service types shown in the multi-select filter dropdown.
// Must match SERVICES_OFFERED in CarerProfile.tsx exactly.
export const SERVICE_TYPES = [
  "Boarding",
  "Walking",
  "Day Care",
  "Drop-in",
  "Grooming",
  "Training",
  "Vet / Licensed Care",
  "Transport",
  "Emergency Help",
  "Others",
] as const;

export type ServiceType = typeof SERVICE_TYPES[number];

// Location style options — mirrors CarerProfile.tsx LOCATION_STYLES.
export const LOCATION_STYLES_LIST = [
  "Flexible",
  "At owner's place",
  "At my place",
  "Meet-up / outdoor",
] as const;

// Day short-name map used when converting selected dates → availability match.
export const DAY_SHORT_MAP: Record<string, string> = {
  Sunday:    "Sun",
  Monday:    "Mon",
  Tuesday:   "Tue",
  Wednesday: "Wed",
  Thursday:  "Thu",
  Friday:    "Fri",
  Saturday:  "Sat",
};
