/** Shared plumbing for the three logged-out, read-only web projections. */

export type PublicReadConfig = { url: string; publicKey: string };

export type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

export const PUBLIC_READ_TIMEOUT_MS = 8_000;

/**
 * Vercel identifies visitors with ISO 3166-1 alpha-2 codes while native
 * Huddle stores the user-facing country label. Convert once at the public API
 * boundary so every country uses the same projection contract.
 */
export const resolvePublicCountry = (raw: unknown): string => {
  const value = String(Array.isArray(raw) ? raw[0] : raw || "").trim();
  if (!value) return "";
  const code = value.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return value;
  if (code === "HK") return "Hong Kong";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || value;
  } catch {
    return value;
  }
};

/**
 * Public projections authenticate exactly as a logged-out Supabase client.
 * A service-role key is deliberately neither read nor accepted here.
 */
export const resolvePublicReadConfig = (): PublicReadConfig | null => {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const publicKey = String(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "",
  ).trim();
  if (!url || !publicKey) return null;
  return { url: url.replace(/\/+$/, ""), publicKey };
};

export const fetchPublicProjection = async <T>(
  config: PublicReadConfig,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ rows: T[]; failed: boolean }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLIC_READ_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: config.publicKey,
        authorization: `Bearer ${config.publicKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    if (!response.ok) return { rows: [], failed: true };
    const payload = await response.json();
    return { rows: Array.isArray(payload) ? (payload as T[]) : [], failed: false };
  } catch {
    return { rows: [], failed: true };
  } finally {
    clearTimeout(timeout);
  }
};

export const setPublicCacheHeaders = (res: ResponseShape) => {
  // Results vary by Vercel's coarse visitor-country headers. Browser caching
  // is safe; a shared CDN entry could serve one country's feed to another.
  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
};

export const clampLimit = (raw: unknown, fallback: number, max: number): number => {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
};
