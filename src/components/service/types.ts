// ── Public provider data shape ────────────────────────────────────────────────
// Used by CarerPolaroidCard, PublicCarerProfileView, PublicCarerProfileModal,
// useServiceProviders, and filterProviders.

export interface RateRow {
  price: string;
  rate: string;    // e.g. "Per hour", "Per day"
  services: string[];
}

export interface ProviderSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  locationCountry?: string | null;
  socialAlbumUrls: string[];        // already resolved to public URLs
  servicesOffered: string[];
  servicesOther: string;
  currency: string;
  startingPrice: string | null;     // lowest numeric price from rateRows
  startingPriceRateUnit: string | null; // rate label for lowest price row, e.g. "hour"
  rateRows: RateRow[];
  minNoticeValue: string;
  minNoticeUnit: "hours" | "days";
  skills: string[];
  proofMetadata: Record<string, Record<string, string>>;
  hasCar: boolean;
  days: string[];                   // short names: "Mon","Tue",...
  timeBlocks: string[];
  otherTimeFrom: string;
  otherTimeTo: string;
  locationStyles: string[];
  areaName: string;
  petTypes: string[];
  petTypesOther: string;
  dogSizes: string[];
  emergencyReadiness: boolean | null;
  verificationStatus: string | null;
  viewCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  isBookmarked: boolean;
  agreementAccepted: boolean;
  stripePayoutStatus: string | null;
  story: string;
  distanceKm?: number | null;
  serviceRankWeight: number;
}
