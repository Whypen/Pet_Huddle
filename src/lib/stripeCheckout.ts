import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";
import { openExternalUrl } from "@/lib/nativeShell";

type StartStripeCheckoutParams = {
  mode: "subscription" | "payment";
  type?: string;
  lookupKey?: string;
  priceId?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
};

export async function startStripeCheckout(params: StartStripeCheckoutParams): Promise<string> {
  const { data, error } = await invokeAuthedFunction<{ url?: string }>("create-checkout-session", {
    body: {
      ...params,
      successUrl: params.successUrl ?? `${window.location.origin}/premium`,
      cancelUrl: params.cancelUrl ?? window.location.href,
    },
  });
  if (error) throw error;
  const url = (data as { url?: string } | null)?.url;
  if (!url) {
    throw new Error("checkout_url_missing");
  }
  return url;
}

export async function handoffStripeCheckout(
  params: StartStripeCheckoutParams,
  context = "stripe-checkout",
): Promise<string> {
  const url = await startStripeCheckout(params);
  openExternalUrl(url, context);
  return url;
}
