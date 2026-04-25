import { lazy, type ComponentType } from "react";

const CHUNK_RETRY_FLAG_PREFIX = "huddle:lazy-reload:";

const forceReloadToLatestBundle = (key: string) => {
  const flagKey = `${CHUNK_RETRY_FLAG_PREFIX}${key}`;
  const retried = sessionStorage.getItem(flagKey) === "1";
  if (retried) return false;
  sessionStorage.setItem(flagKey, "1");
  const url = new URL(window.location.href);
  url.searchParams.set("__chunk_recover", String(Date.now()));
  window.location.replace(url.toString());
  return true;
};

export const lazyWithChunkRecovery = <T extends ComponentType<unknown>>(
  key: string,
  importer: () => Promise<{ default: T }>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const message = String((error as { message?: unknown } | null)?.message ?? error ?? "");
      const isChunkFailure =
        message.includes("Failed to fetch dynamically imported module")
        || message.includes("Importing a module script failed")
        || message.includes("Expected a JavaScript-or-Wasm module script");
      if (isChunkFailure && forceReloadToLatestBundle(key)) {
        return await new Promise<never>(() => {});
      }
      throw error;
    }
  });
