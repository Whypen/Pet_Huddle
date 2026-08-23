import { describe, expect, it, vi } from "vitest";
import { allowValidatedWrite, createLatestRequestGuard, raceWithTimeoutFallback } from "./nativeAsyncRace";

// Regression coverage for the "no response after slide" bug: view-shot's captureRef has no
// built-in timeout and can hang forever if the stamped-photo view hasn't finished laying out
// yet. raceWithTimeoutFallback is what turns that silent, permanent hang into a bounded one.
describe("raceWithTimeoutFallback", () => {
  it("resolves with the real value when it settles before the timeout", async () => {
    vi.useFakeTimers();
    try {
      const fast = new Promise<string>((resolve) => setTimeout(() => resolve("real-photo-uri"), 100));
      const resultPromise = raceWithTimeoutFallback(fast, "fallback-uri", 4000);
      await vi.advanceTimersByTimeAsync(100);
      await expect(resultPromise).resolves.toBe("real-photo-uri");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back within the bound instead of hanging forever when the real promise never settles", async () => {
    vi.useFakeTimers();
    try {
      const hangs = new Promise<string>(() => { /* never resolves -- simulates a stuck captureRef */ });
      const resultPromise = raceWithTimeoutFallback(hangs, "fallback-uri", 4000);
      // Prove it hasn't resolved before the bound (would fail if the race resolved early).
      let settledEarly = false;
      void resultPromise.then(() => { settledEarly = true; });
      await vi.advanceTimersByTimeAsync(3999);
      expect(settledEarly).toBe(false);
      // Crossing the bound resolves it -- this is the exact mechanism that replaces an infinite
      // hang with a guaranteed, bounded outcome.
      await vi.advanceTimersByTimeAsync(1);
      await expect(resultPromise).resolves.toBe("fallback-uri");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still falls back to the bound even when the stuck call would eventually reject, not just hang", async () => {
    // A real captureRef error should still surface normally (it's caught by submit()'s own
    // try/catch and shown to the user) -- the helper only needs to rescue the silent-hang case,
    // where nothing ever settles at all. This proves the timeout wins when it's the sooner of
    // the two outcomes, regardless of what the slower one would eventually have done.
    vi.useFakeTimers();
    try {
      const rejectsLate = new Promise<string>((_, reject) => setTimeout(() => reject(new Error("late failure")), 10000));
      const resultPromise = raceWithTimeoutFallback(rejectsLate, "fallback-uri", 4000);
      await vi.advanceTimersByTimeAsync(4000);
      await expect(resultPromise).resolves.toBe("fallback-uri");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("allowValidatedWrite", () => {
  it("blocks invalid save-like actions before their network writer is called", () => {
    const showValidation = vi.fn();
    const networkWrite = vi.fn();

    if (allowValidatedWrite({ valid: false }, showValidation)) networkWrite();

    expect(showValidation).toHaveBeenCalledOnce();
    expect(networkWrite).not.toHaveBeenCalled();
  });

  it("allows a valid action to reach its writer exactly once", () => {
    const showValidation = vi.fn();
    const networkWrite = vi.fn();

    if (allowValidatedWrite({ valid: true }, showValidation)) networkWrite();

    expect(showValidation).not.toHaveBeenCalled();
    expect(networkWrite).toHaveBeenCalledOnce();
  });
});

describe("createLatestRequestGuard", () => {
  it("rejects a delayed user A completion after user B starts loading", async () => {
    const guard = createLatestRequestGuard();
    const renderedUsers: string[] = [];
    let resolveA!: (value: string) => void;
    const delayedA = new Promise<string>((resolve) => { resolveA = resolve; });

    const ticketA = guard.begin("session-a:user-a");
    const applyA = delayedA.then((value) => {
      if (guard.isCurrent(ticketA)) renderedUsers.push(value);
    });

    const ticketB = guard.begin("session-b:user-b");
    if (guard.isCurrent(ticketB)) renderedUsers.push("user-b");
    resolveA("user-a");
    await applyA;

    expect(renderedUsers).toEqual(["user-b"]);
  });

  it("rejects completions after unmount invalidates the request", () => {
    const guard = createLatestRequestGuard();
    const ticket = guard.begin("session-a:user-a");
    guard.invalidate();
    expect(guard.isCurrent(ticket)).toBe(false);
  });
});
