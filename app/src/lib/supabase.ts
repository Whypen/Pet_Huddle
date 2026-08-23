import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, processLock } from "@supabase/supabase-js";
import { fetchNativeResponseWithTimeout } from "./nativeTimeout";

type StorageValue = string | null;

type ChunkManifest = {
  version: 1;
  chunks: number;
};

type EndpointWatch = {
  total: number;
  windowCalls: number[];
};

type SupabaseFetchContext = {
  method: string;
  endpoint: string;
  path: string;
  methodPath: string;
  component: string;
  stack: string;
  totalCalls: number;
  windowCalls: number;
  time: string;
};

const REQUEST_BUDGET_LIMIT = 100;
const REPEAT_WARNING_LIMIT = 5;
const REPEAT_WARNING_WINDOW_MS = 10_000;
const SECURE_STORE_CHUNK_SIZE = 1_900;

const chunkManifestKey = (key: string) => `${key}.chunks`;
const chunkItemKey = (key: string, index: number) => `${key}.chunk.${index}`;
const ephemeralSecureValues = new Map<string, string>();

const readChunkManifest = async (key: string): Promise<ChunkManifest | null> => {
  const raw = await SecureStore.getItemAsync(chunkManifestKey(key));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ChunkManifest>;
    const chunks = parsed.chunks;
    if (parsed.version === 1 && typeof chunks === "number" && Number.isInteger(chunks) && chunks > 0) {
      return { version: 1, chunks };
    }
  } catch {
    // Invalid manifests are treated as absent so auth can recover from a direct value.
  }

  return null;
};

const removeChunkedSecureValue = async (key: string): Promise<void> => {
  const manifest = await readChunkManifest(key).catch(() => null);
  if (manifest) {
    await Promise.all(
      Array.from({ length: manifest.chunks }, (_, index) =>
        SecureStore.deleteItemAsync(chunkItemKey(key, index)).catch(() => undefined)
      )
    );
  }

  await SecureStore.deleteItemAsync(chunkManifestKey(key)).catch(() => undefined);
};

export const getNativeAuthStorageHealth = () => ({
  ephemeral: ephemeralSecureValues.size > 0,
  ephemeralEntryCount: ephemeralSecureValues.size,
});

export const secureStorageAdapter = {
  getItem: async (key: string): Promise<StorageValue> => {
    const ephemeralValue = ephemeralSecureValues.get(key);
    if (ephemeralValue !== undefined) return ephemeralValue;
    try {
      const manifest = await readChunkManifest(key);
      if (manifest) {
        const chunks = await Promise.all(
          Array.from({ length: manifest.chunks }, (_, index) => SecureStore.getItemAsync(chunkItemKey(key, index)))
        );

        if (chunks.every((chunk): chunk is string => chunk !== null)) {
          const value = chunks.join("");
          await AsyncStorage.removeItem(key).catch(() => undefined);
          return value;
        }

        await removeChunkedSecureValue(key);
        return null;
      }

      const secureValue = await SecureStore.getItemAsync(key);
      if (secureValue !== null) {
        await AsyncStorage.removeItem(key).catch(() => undefined);
        return secureValue;
      }
      const legacyValue = await AsyncStorage.getItem(key).catch(() => null);
      if (legacyValue !== null) {
        // Migrate a historical plaintext session once, then delete it. A device
        // whose keychain is unavailable signs in again instead of retaining a
        // bearer token in ordinary app storage.
        await secureStorageAdapter.setItem(key, legacyValue);
      }
      return legacyValue;
    } catch {
      return ephemeralSecureValues.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    let attemptedChunkCount = 0;
    ephemeralSecureValues.set(key, value);
    try {
      await removeChunkedSecureValue(key);
      await SecureStore.deleteItemAsync(key).catch(() => undefined);

      if (value.length > SECURE_STORE_CHUNK_SIZE) {
        const chunks = value.match(new RegExp(`.{1,${SECURE_STORE_CHUNK_SIZE}}`, "g")) ?? [""];
        attemptedChunkCount = chunks.length;

        await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkItemKey(key, index), chunk)));
        await SecureStore.setItemAsync(chunkManifestKey(key), JSON.stringify({ version: 1, chunks: chunks.length } satisfies ChunkManifest));
      } else {
        await SecureStore.setItemAsync(key, value);
      }

      // A successful Keychain/Keystore write makes any historical plaintext
      // fallback unnecessary. Keep only the secure copy.
      await AsyncStorage.removeItem(key).catch(() => undefined);
      ephemeralSecureValues.delete(key);
    } catch (error) {
      await removeChunkedSecureValue(key).catch(() => undefined);
      await Promise.all(
        Array.from({ length: attemptedChunkCount }, (_, index) =>
          SecureStore.deleteItemAsync(chunkItemKey(key, index)).catch(() => undefined)
        )
      );
      // Keep the authenticated session alive for this process without ever
      // writing bearer or refresh tokens to ordinary app storage. A cold launch
      // will require sign-in if Keychain/Keystore remains unavailable.
      await AsyncStorage.removeItem(key).catch(() => undefined);
      if (__DEV__) console.warn("NATIVE_AUTH_STORAGE_EPHEMERAL", { reason: "secure_store_write_failed" });
      void error;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    ephemeralSecureValues.delete(key);
    try {
      await removeChunkedSecureValue(key);
      await SecureStore.deleteItemAsync(key);
    } catch {
      // best effort only
    } finally {
      await AsyncStorage.removeItem(key).catch(() => undefined);
    }
  },
};

const FALLBACK_SUPABASE_URL = "https://ztrbourwcnhrpmzwlrcn.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "sb_publishable_DCn7OKhJ15mzHz1xcfTmsw_wxJh5zKd";

export const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL).trim().replace(/\/+$/, "");
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const supabaseProjectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || "ztrbourwcnhrpmzwlrcn";
  } catch {
    return "ztrbourwcnhrpmzwlrcn";
  }
})();

export const supabaseWebStorageKey = `sb-${supabaseProjectRef}-auth-token`;

const isDev = typeof __DEV__ === "boolean" ? __DEV__ : process.env.NODE_ENV !== "production";
const endpointWindow = new Map<string, EndpointWatch>();
let sessionRequestCount = 0;
let budgetWarned = false;

const nowIso = () => new Date().toISOString();

const normalizeMethod = (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL) && !(input instanceof Request)) {
    return "GET";
  }
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const normalizeCaller = (stack: string) => {
  const lines = stack.split("\n").map((line) => line.trim()).filter(Boolean);
  const relevant = lines.find((line) => /\/app\/src\//.test(line) && !/\/lib\/supabase\.ts/.test(line));
  if (!relevant) return "unknown";
  const fileMatch = relevant.match(/([^\s(]+\/app\/src\/[^:\s]+\.(?:tsx?|jsx?))(?::\d+:\d+)?/);
  return fileMatch ? fileMatch[1] : relevant;
};

const extractFetchMeta = (input: RequestInfo | URL, init?: RequestInit): { method: string; methodPath: string; endpoint: string; path: string; stack: string; component: string } => {
  const method = normalizeMethod(input, init);
  const requestInput: string = (() => {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
    return String(input);
  })();

  let parsed: URL;
  try {
    parsed = new URL(requestInput);
  } catch {
    parsed = new URL(requestInput, supabaseUrl);
  }

  const path = `${parsed.pathname}`;
  const endpoint = parsed.toString();
  const methodPath = `${method} ${path}`;
  const stack = new Error().stack || "";
  const component = normalizeCaller(stack);

  return { method, methodPath, endpoint, path, stack, component };
};

const noteEndpointUsage = (methodPath: string) => {
  const now = Date.now();
  const watch = endpointWindow.get(methodPath) ?? { total: 0, windowCalls: [] };
  watch.total += 1;
  watch.windowCalls = watch.windowCalls.filter((value) => value + REPEAT_WARNING_WINDOW_MS >= now);
  watch.windowCalls.push(now);
  endpointWindow.set(methodPath, watch);

  return { totalCalls: watch.total, windowCalls: watch.windowCalls.length };
};

const shouldBlockForBudget = () => {
  if (!isDev) return false;

  if (sessionRequestCount >= REQUEST_BUDGET_LIMIT) {
    if (!budgetWarned) {
      console.warn("SUPABASE_REQUEST_BUDGET_WARNING", {
        limit: REQUEST_BUDGET_LIMIT,
        count: sessionRequestCount,
        time: nowIso(),
        action: "warn only; requests continue in dev",
      });
      budgetWarned = true;
    }
    sessionRequestCount += 1;
    return false;
  }

  sessionRequestCount += 1;
  return false;
};

const logFetch = (context: SupabaseFetchContext) => {
  if (!isDev) return;
  console.log("DATABASE_FETCH_TRIGGERED", {
    time: context.time,
    method: context.method,
    endpoint: context.endpoint,
    path: context.path,
    component: context.component,
    endpointCalls: context.totalCalls,
    repeatedCallsIn10s: context.windowCalls,
    callerStack: context.stack,
  });

  if (context.windowCalls > REPEAT_WARNING_LIMIT) {
    console.warn("SUPABASE_ENDPOINT_RATE_WARNING", {
      limit: REPEAT_WARNING_LIMIT,
      windowMs: REPEAT_WARNING_WINDOW_MS,
      methodPath: context.methodPath,
      count: context.windowCalls,
      endpoint: context.endpoint,
    });
  }
};

const supabaseFetchLogger: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (isDev && shouldBlockForBudget()) {
    console.warn("SUPABASE_REQUEST_BUDGET_DIAGNOSTIC", {
      reason: "dev request budget exceeded",
      url: typeof input === "string" || input instanceof URL ? String(input) : input instanceof Request ? input.url : String(input),
      method: normalizeMethod(input, init),
      time: nowIso(),
    });
  }

  const meta = extractFetchMeta(input, init);
  const usage = noteEndpointUsage(meta.methodPath);
  const context: SupabaseFetchContext = {
    method: meta.method,
    endpoint: meta.endpoint,
    path: meta.path,
    methodPath: meta.methodPath,
    component: meta.component,
    stack: meta.stack,
    totalCalls: usage.totalCalls,
    windowCalls: usage.windowCalls,
    time: nowIso(),
  };
  logFetch(context);
  return fetchNativeResponseWithTimeout(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
  global: {
    // Supabase SDK reads, Auth, and Storage share the same bounded native
    // transport as direct callers. The dev logger remains transparent.
    fetch: isDev ? supabaseFetchLogger : fetchNativeResponseWithTimeout,
  },
});
