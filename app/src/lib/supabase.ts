import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const SUPABASE_URL = String(extra.supabaseUrl ?? "");
const SUPABASE_ANON_KEY = String(extra.supabaseAnonKey ?? "");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[supabase] Missing config. Add supabaseUrl and supabaseAnonKey to app.json extra."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
