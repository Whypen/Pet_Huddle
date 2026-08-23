import { Platform } from "react-native";
import type {
  ProductOrSubscription,
  ProductSubscription,
  Purchase,
} from "expo-iap";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { quotaConfig } from "./quotaConfig_v1";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

export type NativeStoreProductId =
  | "huddle_plus_monthly"
  | "huddle_plus_yearly"
  | "huddle_gold_monthly"
  | "huddle_gold_yearly"
  | "huddle_family_extra_monthly"
  | "huddle_super_broadcast"
  | "profile_boost";

export type NativeStoreProductKind = "subscription" | "consumable";

export type NativeStoreProductState = {
  displayName: string;
  displayPrice: string | null;
  id: NativeStoreProductId;
  isAvailable: boolean;
  kind: NativeStoreProductKind;
  rawProduct: ProductOrSubscription | null;
};

export type NativeStorePurchaseStatus =
  | "idle"
  | "loading_products"
  | "purchase_pending"
  | "backend_verifying"
  | "verified_refetching"
  | "restoring"
  | "failed"
  | "unavailable";

export type NativeStorePurchaseCallbacks = {
  onPurchaseError?: (message: string) => void;
  onPurchasePending?: (productId: NativeStoreProductId) => void;
  onPurchaseVerified?: (productId: NativeStoreProductId) => Promise<void> | void;
  onVerifying?: (productId: NativeStoreProductId) => void;
};

export const NATIVE_STORE_PACKAGE_NAME = "pet.huddle";

export const NATIVE_STORE_SUBSCRIPTION_PRODUCT_IDS = [
  "huddle_plus_monthly",
  "huddle_plus_yearly",
  "huddle_gold_monthly",
  "huddle_gold_yearly",
  "huddle_family_extra_monthly",
] as const satisfies readonly NativeStoreProductId[];

export const NATIVE_STORE_CONSUMABLE_PRODUCT_IDS = [
  "huddle_super_broadcast",
  "profile_boost",
] as const satisfies readonly NativeStoreProductId[];

export const NATIVE_STORE_PRODUCT_IDS = [
  ...NATIVE_STORE_SUBSCRIPTION_PRODUCT_IDS,
  ...NATIVE_STORE_CONSUMABLE_PRODUCT_IDS,
] as const satisfies readonly NativeStoreProductId[];

export const NATIVE_STORE_ALIAS_TO_PRODUCT_ID = {
  plus_monthly: "huddle_plus_monthly",
  plus_annual: "huddle_plus_yearly",
  gold_monthly: "huddle_gold_monthly",
  gold_annual: "huddle_gold_yearly",
  superBroadcast: "huddle_super_broadcast",
  topProfileBooster: "profile_boost",
  sharePerks: "huddle_family_extra_monthly",
} as const satisfies Record<string, NativeStoreProductId>;

const productLabels: Record<NativeStoreProductId, string> = {
  huddle_plus_monthly: "huddle+ Monthly",
  huddle_plus_yearly: "huddle+ Yearly",
  huddle_gold_monthly: "huddle＊ Monthly",
  huddle_gold_yearly: "huddle＊ Yearly",
  huddle_family_extra_monthly: "Family Max",
  huddle_super_broadcast: "Super Broadcast",
  profile_boost: "Profile Booster",
};

const productKinds: Record<NativeStoreProductId, NativeStoreProductKind> = {
  huddle_plus_monthly: "subscription",
  huddle_plus_yearly: "subscription",
  huddle_gold_monthly: "subscription",
  huddle_gold_yearly: "subscription",
  huddle_family_extra_monthly: "subscription",
  huddle_super_broadcast: "consumable",
  profile_boost: "consumable",
};

const STORE_PRODUCTS_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const formatNativeUsdPrice = (amount: number) => `US$${amount.toFixed(2)}`;
const normalizeNativeCurrencyPrefix = (prefix: string) => {
  const compact = prefix.replace(/\s+/g, "").toUpperCase();
  if (compact === "$" || compact === "USD" || compact === "US$") return "US$";
  if (compact === "HKD" || compact === "HK$") return "HK$";
  return prefix;
};

export const nativeFallbackStorePrices: Record<NativeStoreProductId, string> = {
  huddle_plus_monthly: formatNativeUsdPrice(5.99),
  huddle_plus_yearly: formatNativeUsdPrice(59.99),
  huddle_gold_monthly: formatNativeUsdPrice(11.99),
  huddle_gold_yearly: formatNativeUsdPrice(109.99),
  huddle_family_extra_monthly: "US$4.99",
  huddle_super_broadcast: "US$12.99",
  profile_boost: "US$2.99",
};

export const nativeFallbackMonthlyEquivalentPrices: Partial<Record<NativeStoreProductId, string>> = {
  huddle_plus_yearly: "US$5.00",
  huddle_gold_yearly: "US$9.17",
};

export const nativeFallbackStruckMonthlyPrices: Partial<Record<NativeStoreProductId, string>> = {
  huddle_plus_yearly: nativeFallbackStorePrices.huddle_plus_monthly,
  huddle_gold_yearly: nativeFallbackStorePrices.huddle_gold_monthly,
};

type ExpoIapModule = typeof import("expo-iap");

const clean = (value: unknown) => String(value || "").trim();

type CachedNativeStoreProducts = {
  cachedAt: number;
  products: Record<NativeStoreProductId, NativeStoreProductState>;
  version: 1;
};

let nativeStoreProductsMemoryCache: CachedNativeStoreProducts | null = null;
let nativeStoreProductsInFlight: Promise<Record<NativeStoreProductId, NativeStoreProductState>> | null = null;
let nativeStoreConnectionInFlight: Promise<void> | null = null;

const getExpoIapModule = (): ExpoIapModule | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-iap") as ExpoIapModule;
  } catch {
    return null;
  }
};

const ensureNativeStoreConnection = async (expoIap: ExpoIapModule) => {
  if (!nativeStoreConnectionInFlight) {
    nativeStoreConnectionInFlight = expoIap.initConnection()
      .then(() => undefined)
      .catch((error) => {
        nativeStoreConnectionInFlight = null;
        throw error;
      });
  }
  await nativeStoreConnectionInFlight;
};

const isNativeStoreProductId = (value: unknown): value is NativeStoreProductId =>
  NATIVE_STORE_PRODUCT_IDS.includes(clean(value) as NativeStoreProductId);

const normalizeProduct = (id: NativeStoreProductId, rawProduct: ProductOrSubscription | null): NativeStoreProductState => ({
  displayName: clean(rawProduct?.displayName) || clean(rawProduct?.title) || productLabels[id],
  displayPrice: clean(rawProduct?.displayPrice) || null,
  id,
  isAvailable: Boolean(rawProduct && clean(rawProduct.id) === id),
  kind: productKinds[id],
  rawProduct,
});

const productIdFromPurchase = (purchase: Purchase): NativeStoreProductId | null => {
  if (isNativeStoreProductId(purchase.productId)) return purchase.productId;
  const ids = Array.isArray(purchase.ids) ? purchase.ids : [];
  return ids.find(isNativeStoreProductId) || null;
};

const firstGoogleSubscriptionOfferToken = (product: ProductOrSubscription | null): string | null => {
  const subscription = product as ProductSubscription | null;
  const offers = Array.isArray(subscription?.subscriptionOffers)
    ? subscription.subscriptionOffers
    : Array.isArray((subscription as { subscriptionOfferDetailsAndroid?: unknown } | null)?.subscriptionOfferDetailsAndroid)
    ? (subscription as { subscriptionOfferDetailsAndroid?: Array<{ offerToken?: string | null }> }).subscriptionOfferDetailsAndroid
    : [];
  const firstOffer = offers?.[0] as { offerToken?: string | null; offerTokenAndroid?: string | null } | undefined;
  return clean(firstOffer?.offerTokenAndroid) || clean(firstOffer?.offerToken) || null;
};

const productDisplayPrice = (product: ProductOrSubscription | null): string | null => {
  if (clean(product?.displayPrice)) return clean(product?.displayPrice);
  const subscription = product as ProductSubscription | null;
  const firstOffer = subscription?.subscriptionOffers?.[0];
  const firstPhase = firstOffer?.pricingPhasesAndroid?.pricingPhaseList?.[0];
  return clean(firstOffer?.displayPrice) || clean(firstPhase?.formattedPrice) || null;
};

export const normalizeNativeDisplayPrice = (price?: string | null) => {
  const value = String(price || "").trim();
  if (!value) return "";
  const normalized = value.replace(/\s+/g, "");
  const match = normalized.match(/^([^0-9.,-]*)([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/);
  if (!match) return normalized.startsWith("$") ? `US${normalized}` : normalized;
  const [, rawPrefix = "", rawAmount = "", rawSuffix = ""] = match;
  const amount = Number.parseFloat(rawAmount.replace(/,/g, ""));
  const formattedAmount = Number.isFinite(amount) && Number.isInteger(amount)
    ? String(amount)
    : Number.isFinite(amount)
      ? amount.toFixed(2).replace(/\.00$/, "")
      : rawAmount;
  const prefix = normalizeNativeCurrencyPrefix(rawPrefix);
  return `${prefix}${formattedAmount}${rawSuffix}`;
};

export const parseNativeDisplayPrice = (price?: string | null) => {
  const value = normalizeNativeDisplayPrice(price);
  const match = value.match(/^([^0-9.,-]*)([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/);
  if (!match) return null;
  const amount = Number.parseFloat((match[2] || "").replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return {
    amount,
    prefix: normalizeNativeCurrencyPrefix(match[1] || ""),
    suffix: match[3] || "",
  };
};

export const formatParsedNativePrice = (price: { amount: number; prefix: string; suffix: string }, options?: { ceil?: boolean }) => {
  const amount = options?.ceil ? Math.ceil(price.amount) : price.amount;
  const formattedAmount = Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.00$/, "");
  return `${price.prefix}${formattedAmount}${price.suffix}`;
};

export const formatNativeStorePrice = (productId: NativeStoreProductId, product?: NativeStoreProductState | null) => (
  normalizeNativeDisplayPrice(product?.displayPrice) || nativeFallbackStorePrices[productId]
);

export const formatNativeStoreMonthlyEquivalentPrice = (productId: NativeStoreProductId, product?: NativeStoreProductState | null) => {
  const parsed = parseNativeDisplayPrice(product?.displayPrice);
  if (parsed) {
    return formatParsedNativePrice({ ...parsed, amount: parsed.amount / 12 }, { ceil: true });
  }
  return nativeFallbackMonthlyEquivalentPrices[productId] || nativeFallbackStorePrices[productId];
};

export const formatNativeAddonPrice = (productId: NativeStoreProductId, product?: NativeStoreProductState | null) => {
  const price = formatNativeStorePrice(productId, product);
  return productId === "huddle_family_extra_monthly" ? `${price}/mo` : price;
};

export const nativeMembershipProductId = (tier: "plus" | "gold", billing: "monthly" | "annual"): NativeStoreProductId => (
  tier === "gold"
    ? billing === "annual" ? "huddle_gold_yearly" : "huddle_gold_monthly"
    : billing === "annual" ? "huddle_plus_yearly" : "huddle_plus_monthly"
);

export const nativeMembershipMonthlyProductId = (tier: "plus" | "gold"): NativeStoreProductId => (
  tier === "gold" ? "huddle_gold_monthly" : "huddle_plus_monthly"
);

export const nativeMembershipPriceDisplay = (
  tier: "plus" | "gold",
  billing: "monthly" | "annual",
  products?: Record<NativeStoreProductId, NativeStoreProductState> | null,
) => {
  const productId = nativeMembershipProductId(tier, billing);
  const monthlyProductId = nativeMembershipMonthlyProductId(tier);
  const product = products?.[productId] ?? null;
  const monthlyProduct = products?.[monthlyProductId] ?? null;
  const annualProductId = nativeMembershipProductId(tier, "annual");
  const annualProduct = products?.[annualProductId] ?? null;
  const annualFallback = quotaConfig.stripePlans[tier].annual.amount;
  return {
    annualBilled: formatNativeStorePrice(annualProductId, annualProduct),
    annualNote: billing === "annual" ? `${formatNativeStorePrice(annualProductId, annualProduct) || formatNativeUsdPrice(annualFallback)} billed yearly` : null,
    discountPct: Math.round((1 - quotaConfig.stripePlans[tier].annual.amount / 12 / quotaConfig.stripePlans[tier].monthly.amount) * 100),
    monthlyEquivalent: formatNativeStoreMonthlyEquivalentPrice(annualProductId, annualProduct),
    monthlyPrice: formatNativeStorePrice(monthlyProductId, monthlyProduct),
    price: billing === "annual" ? formatNativeStoreMonthlyEquivalentPrice(productId, product) : formatNativeStorePrice(productId, product),
    productId,
    source: product?.displayPrice ? "store" as const : "fallback" as const,
  };
};

const readNativeStoreProductsCache = async () => {
  if (nativeStoreProductsMemoryCache && Date.now() - nativeStoreProductsMemoryCache.cachedAt <= STORE_PRODUCTS_CACHE_MAX_AGE_MS) {
    return nativeStoreProductsMemoryCache.products;
  }
  return null;
};

const writeNativeStoreProductsCache = async (products: Record<NativeStoreProductId, NativeStoreProductState>) => {
  const cached: CachedNativeStoreProducts = { cachedAt: Date.now(), products, version: 1 };
  nativeStoreProductsMemoryCache = cached;
};

export const loadNativeStoreProducts = async (options: { allowCache?: boolean; force?: boolean } = {}): Promise<Record<NativeStoreProductId, NativeStoreProductState>> => {
  if (!options.force && options.allowCache !== false) {
    const cached = await readNativeStoreProductsCache();
    if (cached) return cached;
  }
  if (!options.force && nativeStoreProductsInFlight) return nativeStoreProductsInFlight;
	  nativeStoreProductsInFlight = (async () => {
	    const expoIap = getExpoIapModule();
	    if (!expoIap) throw new Error("store_native_module_unavailable");
	    await ensureNativeStoreConnection(expoIap);
    const [subscriptionProducts, consumableProducts] = await Promise.all([
      expoIap.fetchProducts({ skus: [...NATIVE_STORE_SUBSCRIPTION_PRODUCT_IDS], type: "subs" }),
      expoIap.fetchProducts({ skus: [...NATIVE_STORE_CONSUMABLE_PRODUCT_IDS], type: "in-app" }),
    ]);
    const loadedProducts = [...(subscriptionProducts || []), ...(consumableProducts || [])];
    const products = NATIVE_STORE_PRODUCT_IDS.reduce((acc, id) => {
      const product = loadedProducts.find((candidate) => clean(candidate.id) === id) || null;
      acc[id] = normalizeProduct(id, product ? { ...product, displayPrice: productDisplayPrice(product) || product.displayPrice } : null);
      return acc;
    }, {} as Record<NativeStoreProductId, NativeStoreProductState>);
    await writeNativeStoreProductsCache(products);
    return products;
  })();
  try {
    return await nativeStoreProductsInFlight;
  } finally {
    nativeStoreProductsInFlight = null;
  }
};

export const preloadNativeStoreProducts = async () => {
  await loadNativeStoreProducts();
};

const callStoreVerifier = async (purchase: Purchase, accessToken: string, restore: boolean) => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw new Error("auth_required");
  const productId = productIdFromPurchase(purchase);
  if (!productId) throw new Error("store_product_not_found");
  const endpoint = Platform.OS === "ios" ? "verify-apple-subscription" : "verify-google-subscription";
  const body = Platform.OS === "ios"
    ? {
        originalTransactionId: "originalTransactionIdentifierIOS" in purchase ? purchase.originalTransactionIdentifierIOS : null,
        productId,
        restore,
        signedTransactionInfo: purchase.purchaseToken,
        transactionId: purchase.transactionId,
      }
    : {
        orderId: purchase.transactionId,
        packageName: "packageNameAndroid" in purchase ? purchase.packageNameAndroid || NATIVE_STORE_PACKAGE_NAME : NATIVE_STORE_PACKAGE_NAME,
        productId,
        purchaseToken: purchase.purchaseToken,
        restore,
      };
  const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    body: JSON.stringify(body),
    headers: createNativeAuthenticatedHeaders(token, {
      "Content-Type": "application/json",
    }),
    method: "POST",
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok) {
    const message = typeof parsed === "object" && parsed && "error" in parsed
      ? String((parsed as { error?: unknown }).error)
      : raw || response.statusText;
    throw new Error(message);
  }
  return { productId, result: parsed };
};

export const verifyNativeStorePurchase = async (purchase: Purchase, accessToken: string, restore = false) => {
  const expoIap = getExpoIapModule();
  if (!expoIap) throw new Error("store_native_module_unavailable");
  await ensureNativeStoreConnection(expoIap);
  const productId = productIdFromPurchase(purchase);
  if (!productId) throw new Error("store_product_not_found");
  const result = await callStoreVerifier(purchase, accessToken, restore);
  await expoIap.finishTransaction({ purchase, isConsumable: productKinds[productId] === "consumable" });
  return result;
};

export const requestNativeStoreProductPurchase = async (
  product: NativeStoreProductState,
  userId: string,
) => {
  const expoIap = getExpoIapModule();
  if (!expoIap) throw new Error("store_native_module_unavailable");
  await ensureNativeStoreConnection(expoIap);
  if (!product.isAvailable || !product.rawProduct) throw new Error("store_product_unavailable");
  if (product.kind === "subscription") {
    const offerToken = firstGoogleSubscriptionOfferToken(product.rawProduct);
    await expoIap.requestPurchase({
      request: {
        apple: { appAccountToken: userId, sku: product.id },
        google: {
          obfuscatedAccountId: userId,
          skus: [product.id],
          subscriptionOffers: offerToken ? [{ sku: product.id, offerToken }] : undefined,
        },
      },
      type: "subs",
    });
    return;
  }
  await expoIap.requestPurchase({
    request: {
      apple: { appAccountToken: userId, sku: product.id },
      google: { obfuscatedAccountId: userId, skus: [product.id] },
    },
    type: "in-app",
  });
};

export const restoreNativeStorePurchases = async (accessToken: string, callbacks: NativeStorePurchaseCallbacks = {}) => {
  const expoIap = getExpoIapModule();
  if (!expoIap) throw new Error("store_native_module_unavailable");
  await ensureNativeStoreConnection(expoIap);
  await expoIap.restorePurchases();
  const purchases = await expoIap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
  const verifiedProductIds: NativeStoreProductId[] = [];
  for (const purchase of purchases) {
    const productId = productIdFromPurchase(purchase);
    if (!productId) continue;
    callbacks.onVerifying?.(productId);
    await verifyNativeStorePurchase(purchase, accessToken, true);
    verifiedProductIds.push(productId);
    await callbacks.onPurchaseVerified?.(productId);
  }
  return verifiedProductIds;
};

export const listenForNativeStorePurchases = (accessToken: string, callbacks: NativeStorePurchaseCallbacks) => {
  const expoIap = getExpoIapModule();
  if (!expoIap) return () => undefined;
  void ensureNativeStoreConnection(expoIap).catch((error) => {
    callbacks.onPurchaseError?.(error instanceof Error ? error.message : "store_connection_failed");
  });
  const purchaseSubscription = expoIap.purchaseUpdatedListener((purchase) => {
    const productId = productIdFromPurchase(purchase);
    if (!productId) return;
    callbacks.onPurchasePending?.(productId);
    void (async () => {
      try {
        callbacks.onVerifying?.(productId);
        await verifyNativeStorePurchase(purchase, accessToken, false);
        await callbacks.onPurchaseVerified?.(productId);
      } catch (error) {
        callbacks.onPurchaseError?.(error instanceof Error ? error.message : "purchase_verification_failed");
      }
    })();
  });
  const errorSubscription = expoIap.purchaseErrorListener((error: { message?: string | null; code?: string | null }) => {
    callbacks.onPurchaseError?.(error.message || error.code || "purchase_failed");
  });
  return () => {
    purchaseSubscription.remove();
    errorSubscription.remove();
  };
};

export const openNativeStoreSubscriptionManagement = async (productId?: NativeStoreProductId | null) => {
  const expoIap = getExpoIapModule();
  if (!expoIap) throw new Error("store_native_module_unavailable");
  await ensureNativeStoreConnection(expoIap);
  await expoIap.deepLinkToSubscriptions({
    packageNameAndroid: NATIVE_STORE_PACKAGE_NAME,
    skuAndroid: productId || undefined,
  });
};
