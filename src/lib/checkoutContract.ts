export type SubscriptionCheckoutInput = {
  userId: string;
  type: string;
  lookupKey: string;
  successUrl: string;
  cancelUrl: string;
  currency?: string | null;
  country?: string | null;
};

/**
 * Existing create-checkout-session subscription contract.
 *
 * Price ownership stays server-side: the browser identifies the canonical plan
 * by lookup key and never sends a stale Stripe price id.
 */
export const buildSubscriptionCheckoutBody = (input: SubscriptionCheckoutInput) => ({
  userId: input.userId,
  mode: "subscription" as const,
  type: input.type,
  lookupKey: input.lookupKey,
  successUrl: input.successUrl,
  cancelUrl: input.cancelUrl,
  currency: input.currency || undefined,
  country: input.country || undefined,
});
