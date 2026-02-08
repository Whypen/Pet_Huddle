import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

type StorageItem = string | null;

// SecureStore is better for tokens, but it can fail on some devices/emulators.
// We use SecureStore first, with AsyncStorage fallback for resilience.
const ExpoStorageAdapter = {
  getItem: async (key: string): Promise<StorageItem> => {
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v !== null) return v;
    } catch {
      // fall through
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // fall through
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // no-op
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // fall through
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // no-op
    }
  },
};

// Public fallback values so dev builds never hard-crash when EXPO_PUBLIC_* isn't wired
// into the runtime environment. (Anon keys are public by design.)
const FALLBACK_SUPABASE_URL = "https://ztrbourwcnhrpmzwlrcn.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cmJvdXJ3Y25ocnBtendscmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNTQ2NDMsImV4cCI6MjA4NDkzMDY0M30.ehK3oSGq6AFdtuSovXTi02aMB_ht4suO16HJ8RecIvg";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Using fallback values.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
