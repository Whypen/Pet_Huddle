// Every non-RPC network primitive (raw fetch, supabase-js storage calls, native
// geocoders) has no default timeout — a stalled socket (nw_read_request_report
// "Operation timed out") hangs the returned promise forever. RPC calls already
// get a 10s bound from nativeExactTokenRequest.ts; this file gives the rest of
// the app the same guarantee so a single dead connection can never wedge a
// screen's loading state permanently. See nativeUnboundedNetworkContract.test.ts
// for the enforcement side of this.

// Resolves with `fallback` if `promise` hasn't settled within `ms`. The
// original promise keeps running in the background (JS can't cancel a plain
// Promise) — callers that own a cancellable resource (fetch, XHR) should
// prefer fetchWithNativeTimeout below so the underlying request is aborted
// too, not just abandoned.
export const withNativeTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

export type NativeTimeoutFetchResult =
  | { ok: true; response: Response }
  | { ok: false; timedOut: boolean; error: unknown };

export const NATIVE_DEFAULT_NETWORK_TIMEOUT_MS = 10_000;
// Media writes are intentionally longer than interactive reads. They remain
// finite, but a normal image upload must not be treated like a stalled inbox.
export const NATIVE_MEDIA_UPLOAD_TIMEOUT_MS = 60_000;

export class NativeRequestTimeoutError extends Error {
  constructor() {
    super("native_request_timeout");
    this.name = "NativeRequestTimeoutError";
  }
}

export const isNativeRequestTimeoutError = (error: unknown): error is NativeRequestTimeoutError =>
  error instanceof NativeRequestTimeoutError
  || (error instanceof Error && error.message === "native_request_timeout");

const RESPONSE_BODY_METHODS = new Set(["arrayBuffer", "blob", "formData", "json", "text"]);

// fetch() wrapped with an AbortController on a deadline, mirroring
// nativeExactTokenRequest.ts's RPC transport so every raw network call in the
// app degrades the same way: abort the socket, resolve, never hang.
export const fetchWithNativeTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  ms: number,
): Promise<NativeTimeoutFetchResult> => {
  const controller = new AbortController();
  let timedOut = false;
  let cleanedUp = false;
  const callerSignal = init.signal;
  const pendingBodyRejectors = new Set<(error: Error) => void>();
  const rejectPendingBodies = (error: Error) => {
    for (const reject of pendingBodyRejectors) reject(error);
    pendingBodyRejectors.clear();
  };
  const abortForCaller = () => {
    controller.abort();
    rejectPendingBodies(new Error("native_request_aborted"));
    cleanup();
  };
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortForCaller);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectPendingBodies(new NativeRequestTimeoutError());
    cleanup();
  }, ms);
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", abortForCaller, { once: true });
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // `fetch()` can resolve once headers arrive. Keep this deadline alive for
    // response.text()/json(): a stalled response body is otherwise an infinite
    // user-visible wait on iOS. Normal body readers clear it as they settle.
    const boundedResponse = new Proxy(response, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (typeof property !== "string" || !RESPONSE_BODY_METHODS.has(property)) return value.bind(target);
        return (...args: unknown[]) => new Promise<unknown>((resolve, reject) => {
          if (timedOut) {
            reject(new NativeRequestTimeoutError());
            return;
          }
          const rejectForTimeout = (error: Error) => reject(error);
          pendingBodyRejectors.add(rejectForTimeout);
          Promise.resolve(value.apply(target, args)).then(resolve, reject).finally(() => {
            pendingBodyRejectors.delete(rejectForTimeout);
          });
        }).catch((error) => {
          if (timedOut) throw new NativeRequestTimeoutError();
          throw error;
        }).finally(cleanup);
      },
    }) as Response;
    return { ok: true, response: boundedResponse };
  } catch (error) {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortForCaller);
    return { ok: false, timedOut, error: timedOut ? new NativeRequestTimeoutError() : error };
  }
};

export const fetchNativeResponseWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = NATIVE_DEFAULT_NETWORK_TIMEOUT_MS,
): Promise<Response> => {
  const result = await fetchWithNativeTimeout(input, init, ms);
  if (result.ok) return result.response;
  if (result.timedOut) throw new NativeRequestTimeoutError();
  throw result.error;
};
