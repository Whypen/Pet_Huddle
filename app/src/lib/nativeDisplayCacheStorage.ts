import AsyncStorage from "@react-native-async-storage/async-storage";

export const NATIVE_DISPLAY_CACHE_READ_DEADLINE_MS = 1500;
export const NATIVE_DISPLAY_CACHE_CIRCUIT_OPEN_MS = 5000;

type DisplayCacheReadOptions = {
  deadlineMs?: number;
};

const inFlightReads = new Map<string, Promise<unknown>>();
let circuitOpenUntil = 0;
let circuitGeneration = 0;

const circuitIsOpen = () => Date.now() < circuitOpenUntil;

const runBoundedRead = <T,>(
  operationKey: string,
  fallback: T,
  operation: () => Promise<T>,
  options: DisplayCacheReadOptions = {},
): Promise<T> => {
  if (circuitIsOpen()) return Promise.resolve(fallback);

  const existing = inFlightReads.get(operationKey) as Promise<T> | undefined;
  if (existing) return existing;

  const deadlineMs = Math.max(1, options.deadlineMs ?? NATIVE_DISPLAY_CACHE_READ_DEADLINE_MS);
  const generation = circuitGeneration;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const storageResult = Promise.resolve()
    .then(operation)
    .then(
      (value) => ({ kind: "value" as const, value }),
      () => ({ kind: "error" as const }),
    );
  const deadlineResult = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), deadlineMs);
  });

  const bounded = Promise.race([storageResult, deadlineResult]).then((result) => {
    if (timer) clearTimeout(timer);
    if (result.kind === "value") return result.value;
    if ((result.kind === "timeout" || result.kind === "error") && generation === circuitGeneration) {
      circuitGeneration += 1;
      circuitOpenUntil = Date.now() + NATIVE_DISPLAY_CACHE_CIRCUIT_OPEN_MS;
    }
    return fallback;
  });

  inFlightReads.set(operationKey, bounded);
  void bounded.finally(() => {
    if (inFlightReads.get(operationKey) === bounded) inFlightReads.delete(operationKey);
  });
  return bounded;
};

export const readNativeDisplayCacheItem = (
  key: string,
  options?: DisplayCacheReadOptions,
): Promise<string | null> => runBoundedRead(`item:${key}`, null, () => AsyncStorage.getItem(key), options);

export const readNativeDisplayCacheItems = (
  keys: string[],
  options?: DisplayCacheReadOptions,
): Promise<readonly [string, string | null][]> => {
  if (keys.length === 0) return Promise.resolve([]);
  return runBoundedRead(`items:${JSON.stringify(keys)}`, [], () => AsyncStorage.multiGet(keys), options);
};

export const readNativeDisplayCacheKeys = (
  options?: DisplayCacheReadOptions,
): Promise<readonly string[]> => runBoundedRead("keys", [], () => AsyncStorage.getAllKeys(), options);

export const resetNativeDisplayCacheReadCircuitForTests = () => {
  circuitGeneration += 1;
  circuitOpenUntil = 0;
  inFlightReads.clear();
};
