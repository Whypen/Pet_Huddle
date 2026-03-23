export type ClientEnv = {
  isDev: boolean;
  isProd: boolean;
  apiUrl?: string;
  wsUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  e2eMode: boolean;
  e2eBypassUserId?: string;
  demoMode: string;
  showDemoPins: boolean;
  geoDebug: boolean;
  uatDebug: boolean;
};

let cached: ClientEnv | null = null;

export const getClientEnv = (): ClientEnv => {
  if (cached) return cached;
  const env = import.meta.env;
  const enableDemoData = String(env.VITE_ENABLE_DEMO_DATA ?? "false") === "true";
  cached = {
    isDev: Boolean(env.DEV),
    isProd: Boolean(env.PROD),
    apiUrl: env.VITE_API_URL,
    wsUrl: env.VITE_WS_URL,
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
    e2eMode: String(env.VITE_E2E_MODE ?? "false") === "true",
    e2eBypassUserId: env.VITE_E2E_BYPASS_USER_ID,
    demoMode: String(env.VITE_DEMO_MODE ?? "off"),
    showDemoPins: enableDemoData && String(env.VITE_SHOW_DEMO_PINS ?? "false") === "true",
    geoDebug: String(env.VITE_GEO_DEBUG ?? "false") === "true",
    uatDebug: String(env.VITE_UAT_DEBUG ?? "false") === "true",
  };
  return cached;
};
