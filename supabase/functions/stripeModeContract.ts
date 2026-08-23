export type StripeRuntimeMode = "test" | "live";

export const resolveStripeRuntimeMode = (
  modeHint: string | null | undefined,
  origin: string | null,
  successUrl?: unknown,
  cancelUrl?: unknown,
): StripeRuntimeMode => {
  const normalizedHint = String(modeHint || "").trim().toLowerCase();
  if (normalizedHint === "test") return "test";
  if (normalizedHint === "live") return "live";
  const host = `${origin || ""} ${String(successUrl || "")} ${String(cancelUrl || "")}`.toLowerCase();
  return host.includes("localhost") || host.includes("127.0.0.1") ? "test" : "live";
};
export const pickStripeRuntimeSecret = (
  mode: StripeRuntimeMode,
  secrets: { defaultSecret?: string; testSecret?: string; liveSecret?: string },
): string => {
  const hasExpectedMode = (secret: string | undefined): secret is string => {
    const value = String(secret || "").trim();
    return value.startsWith(`sk_${mode}_`) || value.startsWith(`rk_${mode}_`);
  };
  const candidates = mode === "test"
    ? [secrets.testSecret, secrets.defaultSecret]
    : [secrets.defaultSecret, secrets.liveSecret];
  return candidates.find(hasExpectedMode)?.trim() || "";
};
