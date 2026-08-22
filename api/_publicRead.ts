/** Shared plumbing for the three logged-out, read-only web projections. */

export type PublicReadConfig = { url: string; publicKey: string };

export type ResponseShape = {
  setHeader: (key: string, value: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
};

export const PUBLIC_READ_TIMEOUT_MS = 8_000;

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
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
};

export const clampLimit = (raw: unknown, fallback: number, max: number): number => {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
};
