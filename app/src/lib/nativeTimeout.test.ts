import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithNativeTimeout, isNativeRequestTimeoutError } from "./nativeTimeout";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("native bounded fetch", () => {
  it("keeps the deadline through a stalled response body", async () => {
    vi.useFakeTimers();
    const body = deferred<string>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ text: () => body.promise }));

    const result = await fetchWithNativeTimeout("https://example.test", {}, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reading = result.response.text();
    const rejection = expect(reading).rejects.toSatisfy(isNativeRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });

  it("clears the deadline after a normal response body read", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}')));

    const result = await fetchWithNativeTimeout("https://example.test", {}, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await expect(result.response.json()).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(200);
  });
});
