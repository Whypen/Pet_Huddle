// Some native calls (view-shot's captureRef, in particular) have no built-in timeout and can
// hang indefinitely if the view they're capturing hasn't finished laying out yet. Racing against
// a bounded fallback turns a silent, permanent hang into a bounded one that always resolves.
export const raceWithTimeoutFallback = <T,>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);

export type LatestRequestTicket = Readonly<{ key: string; generation: number }>;

// Async screen loads can finish after the signed-in account has changed. A ticket ties every
// completion to both the account/session key and the newest request generation, so stale cache,
// network, and error completions cannot update the next account's screen.
export const createLatestRequestGuard = () => {
  let generation = 0;
  let activeKey: string | null = null;

  return {
    begin(key: string): LatestRequestTicket {
      activeKey = key;
      generation += 1;
      return { key, generation };
    },
    invalidate(): void {
      activeKey = null;
      generation += 1;
    },
    isCurrent(ticket: LatestRequestTicket): boolean {
      return activeKey === ticket.key && generation === ticket.generation;
    },
  };
};

export const allowValidatedWrite = (
  validation: { valid: boolean },
  onInvalid: () => void,
): boolean => {
  if (validation.valid) return true;
  onInvalid();
  return false;
};
