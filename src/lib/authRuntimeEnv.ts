export type AuthRuntimeEnv = {
  supabaseUrl: string;
  mode: "local" | "remote" | "unknown";
  host: string;
};

const normalizeUrl = (value: string): string => String(value || "").trim().replace(/\/+$/, "");

export const getAuthRuntimeEnv = (): AuthRuntimeEnv => {
  const raw = normalizeUrl(import.meta.env.VITE_SUPABASE_URL || "");
  if (!raw) {
    return { supabaseUrl: "", mode: "unknown", host: "" };
  }
  try {
    const parsed = new URL(raw);
    const host = parsed.host.toLowerCase();
    const mode =
      host.includes("127.0.0.1")
      || host.includes("localhost")
      || host.includes("0.0.0.0")
        ? "local"
        : "remote";
    return { supabaseUrl: raw, mode, host };
  } catch {
    return { supabaseUrl: raw, mode: "unknown", host: "" };
  }
};

