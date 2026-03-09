export type QuotaTier = "free" | "plus" | "gold";
export type QuotaBillingCycle = "monthly" | "annual";

export type QuotaCaps = {
  aiVetUploadsPerDay: number;
  discoveryViewsPerDay: number | null;
  discoveryLabel: string;
  discoveryPrioritySortWeight: number;
  discoveryPriorityLabel: string | null;
  threadPostsPerDay: number;
  starsPerMonth: number;
  starsWalletCap: number;
  broadcastAlertsPerMonth: number;
  broadcastMaxActiveSlots: number;
  broadcastDurationHours: number;
  broadcastRadiusKm: number;
  hasAdvancedFilters: boolean;
  hasActiveNowFilter: boolean;
  hasSameEnergyFilter: boolean;
  hasVideoUpload: boolean;
  canLinkFamily: boolean;
  sharePerksAddonAvailable: boolean;
};

export type QuotaCopy = {
  discovery: {
    exhausted: {
      free: string;
    };
  };
  threads: {
    exhausted: {
      free: string;
      plus: string;
      gold: string;
    };
  };
  aiVet: {
    exhausted: {
      free: string;
      plus: string;
      gold: string;
    };
  };
  stars: {
    exhausted: string;
    upgrade: {
      free: {
        headline: string;
        subheadline: string;
        cta: string;
      };
      plus: {
        headline: string;
        subheadline: string;
        cta: string;
      };
    };
  };
  broadcast: {
    quotaExhausted: {
      free: string;
      plus: string;
      gold: string;
    };
    slotsFull: string;
  };
  filters: {
    locked: string;
  };
  familyInvite: {
    nonGold: string;
    received: string;
  };
  misc: {
    nonSocialProfileTap: string;
  };
};

export type StripePlanConfig = {
  lookupKey: string;
  priceId: string;
  amount: number;
  unit: "/mo" | "/yr";
};

export type StripePlansByTier = {
  plus: Record<QuotaBillingCycle, StripePlanConfig>;
  gold: Record<QuotaBillingCycle, StripePlanConfig>;
};

export type QuotaResetRules = {
  stars: "subscription_anniversary";
  broadcasts: "subscription_anniversary";
  threads: "local_midnight";
  discovery: "local_midnight";
  aiVet: "local_midnight";
  broadcastActiveSlots: "realtime";
};

const TIER_LABELS: Record<QuotaTier, string> = {
  free: "Free",
  plus: "Huddle+",
  gold: "Gold",
};

const CAPS_BY_TIER: Record<QuotaTier, QuotaCaps> = {
  free: {
    aiVetUploadsPerDay: 5,
    discoveryViewsPerDay: 100,
    discoveryLabel: "Limited",
    discoveryPrioritySortWeight: 1,
    discoveryPriorityLabel: null,
    threadPostsPerDay: 10,
    starsPerMonth: 0,
    starsWalletCap: 0,
    broadcastAlertsPerMonth: 10,
    broadcastMaxActiveSlots: 10,
    broadcastDurationHours: 12,
    broadcastRadiusKm: 10,
    hasAdvancedFilters: false,
    hasActiveNowFilter: false,
    hasSameEnergyFilter: false,
    hasVideoUpload: false,
    canLinkFamily: true,
    sharePerksAddonAvailable: true,
  },
  plus: {
    aiVetUploadsPerDay: 20,
    discoveryViewsPerDay: 250,
    discoveryLabel: "x2 Discovery",
    discoveryPrioritySortWeight: 2,
    discoveryPriorityLabel: null,
    threadPostsPerDay: 30,
    starsPerMonth: 4,
    starsWalletCap: 4,
    broadcastAlertsPerMonth: 40,
    broadcastMaxActiveSlots: 20,
    broadcastDurationHours: 24,
    broadcastRadiusKm: 25,
    hasAdvancedFilters: true,
    hasActiveNowFilter: false,
    hasSameEnergyFilter: false,
    hasVideoUpload: false,
    canLinkFamily: true,
    sharePerksAddonAvailable: true,
  },
  gold: {
    aiVetUploadsPerDay: 40,
    discoveryViewsPerDay: null,
    discoveryLabel: "Unlimited Discovery",
    discoveryPrioritySortWeight: 3,
    discoveryPriorityLabel: "3x visibility",
    threadPostsPerDay: 60,
    starsPerMonth: 10,
    starsWalletCap: 10,
    broadcastAlertsPerMonth: 80,
    broadcastMaxActiveSlots: 20,
    broadcastDurationHours: 48,
    broadcastRadiusKm: 50,
    hasAdvancedFilters: true,
    hasActiveNowFilter: true,
    hasSameEnergyFilter: true,
    hasVideoUpload: true,
    canLinkFamily: true,
    sharePerksAddonAvailable: true,
  },
};

const COPY: QuotaCopy = {
  discovery: {
    exhausted: {
      free: "Ready to expand the pack? Upgrade to Huddle+ for more or Huddle Gold for unlimited profiles.",
    },
  },
  threads: {
    exhausted: {
      free: "Your posts are keeping everyone busy. Upgrade to Huddle+ or Gold for more posts.",
      plus: "Your posts are keeping everyone busy. Upgrade to Gold for more posts.",
      gold: "Your posts are keeping everyone busy. Try again tomorrow.",
    },
  },
  aiVet: {
    exhausted: {
      free: "Too many images keep our AI Vet busy. Upgrade to Huddle+ or Gold for more uploads.",
      plus: "Too many images keep our AI Vet busy. Upgrade to Gold for more uploads.",
      gold: "Too many images keep our AI Vet busy. More tomorrow!",
    },
  },
  stars: {
    exhausted: "You've used all your Stars this month. New Stars arrive with your cycle reset.",
    upgrade: {
      free: {
        headline: "Upgrade to Huddle+",
        subheadline: "Activate now to send stars and find 2x more connections!",
        cta: "Upgrade to Huddle+",
      },
      plus: {
        headline: "Upgrade to Huddle Gold",
        subheadline:
          "Activate now to send stars and become a top profile in your area and find more connections!",
        cta: "Upgrade to Huddle Gold",
      },
    },
  },
  broadcast: {
    quotaExhausted: {
      free: "Your alerts are keeping everyone busy. Upgrade to Huddle+ or Gold for more broadcasts.",
      plus: "Your alerts are keeping everyone busy. Upgrade to Gold for more broadcasts.",
      gold: "Your alerts are keeping everyone busy. Let's do it tomorrow.",
    },
    slotsFull: "You have too many active broadcasts. Wait for one to expire or upgrade for more slots.",
  },
  filters: {
    locked: "Unlock with Huddle+ or Gold to use this filter.",
  },
  familyInvite: {
    nonGold: "Upgrade to Gold for Family Sharing.",
    received: "<Display Name> has invited you to join their family! [Accept] [Decline]",
  },
  misc: {
    nonSocialProfileTap: "This user has enabled Non-Social mode and is not available for discovery or chat.",
  },
};

const RESET_RULES: QuotaResetRules = {
  stars: "subscription_anniversary",
  broadcasts: "subscription_anniversary",
  threads: "local_midnight",
  discovery: "local_midnight",
  aiVet: "local_midnight",
  broadcastActiveSlots: "realtime",
};

const STRIPE_PLANS: StripePlansByTier = {
  plus: {
    monthly: {
      lookupKey: "plus_monthly",
      priceId: "price_1T926a5QcAjQDse0QEYva3ZH",
      amount: 5.99,
      unit: "/mo",
    },
    annual: {
      lookupKey: "plus_yearly",
      priceId: "price_1T92355QcAjQDse0BAnwV7PU",
      amount: 59.99,
      unit: "/yr",
    },
  },
  gold: {
    monthly: {
      lookupKey: "Gold_monthly",
      priceId: "price_1T92Cp5QcAjQDse0W4wT20OX",
      amount: 11.99,
      unit: "/mo",
    },
    annual: {
      lookupKey: "Gold_yearly",
      priceId: "price_1T92Cp5QcAjQDse0jvWohWoJ",
      amount: 109.99,
      unit: "/yr",
    },
  },
};

export const quotaConfig = {
  tierLabels: TIER_LABELS,
  capsByTier: CAPS_BY_TIER,
  copy: COPY,
  resetRules: RESET_RULES,
  stripePlans: STRIPE_PLANS,
  starPolicy: {
    deductOnlyOnSuccessfulConversationOpen: true,
    noDeductionIfConversationFails: true,
    noRefundAfterDeduction: true,
    noRefundAfterBlockOrReport: true,
    purchasable: false,
  },
} as const;

export const normalizeQuotaTier = (tierRaw?: string | null): QuotaTier => {
  const tier = String(tierRaw || "free").toLowerCase();
  if (tier === "gold") return "gold";
  if (tier === "plus" || tier === "premium") return "plus";
  return "free";
};

export const getQuotaCapsForTier = (tierRaw?: string | null): QuotaCaps =>
  quotaConfig.capsByTier[normalizeQuotaTier(tierRaw)];

export const getTierLabel = (tierRaw?: string | null): string =>
  quotaConfig.tierLabels[normalizeQuotaTier(tierRaw)];

export const isUnlimitedDiscoveryTier = (tierRaw?: string | null): boolean =>
  getQuotaCapsForTier(tierRaw).discoveryViewsPerDay === null;
