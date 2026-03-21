export type QuotaTier = "free" | "plus" | "gold";

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
    discoveryLabel: "×2 Discovery",
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
    discoveryPriorityLabel: "3× visibility",
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
    exhausted:
      "You've used all your Stars this month. New Stars arrive with your cycle reset.",
  },
  broadcast: {
    quotaExhausted: {
      free: "Your alerts are keeping everyone busy. Upgrade to Huddle+ or Gold for more broadcasts.",
      plus: "Your alerts are keeping everyone busy. Upgrade to Gold for more broadcasts.",
      gold: "Your alerts are keeping everyone busy. Let's do it tomorrow.",
    },
    slotsFull:
      "You have too many active broadcasts. Wait for one to expire or upgrade for more slots.",
  },
  filters: {
    locked: "Unlock with Huddle+ or Gold to use this filter.",
  },
  familyInvite: {
    nonGold: "Upgrade to Gold for Family Sharing.",
    received: "<Display Name> has invited you to join their family! [Accept] [Decline]",
  },
  misc: {
    nonSocialProfileTap:
      "This user has enabled Non-Social mode and is not available for discovery or chat.",
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

export const quotaConfig = {
  tierLabels: TIER_LABELS,
  capsByTier: CAPS_BY_TIER,
  copy: COPY,
  resetRules: RESET_RULES,
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
