export const VERIFICATION_STATUSES = ["unverified", "pending", "verified"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const isVerificationStatus = (value: string): value is VerificationStatus =>
  VERIFICATION_STATUSES.includes(value as VerificationStatus);
