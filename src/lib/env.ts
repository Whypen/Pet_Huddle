export type ClientEnv = {
  isDev: boolean;
  isProd: boolean;
  apiUrl?: string;
  wsUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  turnstileSiteKey?: string;
  demoMode: string;
  showDemoPins: boolean;
  geoDebug: boolean;
  uatDebug: boolean;
};

let cached: ClientEnv | null = null;

export const getClientEnv = (): ClientEnv => {
  if (cached) return cached;
  // Keep every access explicit. Assigning the whole import.meta.env object
  // causes Vite to serialize every VITE_* value into the browser bundle.
  const enableDemoData = String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? "false") === "true";
  cached = {
    isDev: Boolean(import.meta.env.DEV),
    isProd: Boolean(import.meta.env.PROD),
    apiUrl: import.meta.env.VITE_API_URL,
    wsUrl: import.meta.env.VITE_WS_URL,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
    demoMode: String(import.meta.env.VITE_DEMO_MODE ?? "off"),
    showDemoPins: enableDemoData && String(import.meta.env.VITE_SHOW_DEMO_PINS ?? "false") === "true",
    geoDebug: String(import.meta.env.VITE_GEO_DEBUG ?? "false") === "true",
    uatDebug: String(import.meta.env.VITE_UAT_DEBUG ?? "false") === "true",
  };
  return cached;
};
