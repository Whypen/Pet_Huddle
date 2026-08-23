export const VERIFIED_PUBLIC_CREDENTIAL_LABELS = [
  "Registry matched",
  "Certificate matched",
  "Organization matched",
  "Directory matched",
] as const;

export const isVerifiedPublicCredentialLabel = (value: string) =>
  VERIFIED_PUBLIC_CREDENTIAL_LABELS.some((label) => label === value);

export const normalizePublicCredentialLabel = (value: string) =>
  value === "Unable to verify online" ? "Self-declared" : value;
