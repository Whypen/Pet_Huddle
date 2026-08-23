/**
 * Home and Map are two entry points into the same public-presence session.
 * Keep their network writes ordered and make the latest explicit user choice
 * authoritative before an older GPS/token request can reach the server.
 */
export type NativePresenceIntent = "active" | "inactive";

export type NativePresenceIntentToken = {
  userId: string;
  version: number;
  intent: NativePresenceIntent;
};

type NativePresenceEntry = {
  chain: Promise<void>;
  intent: NativePresenceIntent;
  version: number;
};

const entries = new Map<string, NativePresenceEntry>();

const entryFor = (userId: string) => {
  const existing = entries.get(userId);
  if (existing) return existing;
  const created: NativePresenceEntry = {
    chain: Promise.resolve(),
    intent: "inactive",
    version: 0,
  };
  entries.set(userId, created);
  return created;
};

export const beginNativePresenceIntent = (userId: string, intent: NativePresenceIntent): NativePresenceIntentToken => {
  const entry = entryFor(userId);
  entry.version += 1;
  entry.intent = intent;
  return { userId, version: entry.version, intent };
};

export const isCurrentNativePresenceIntent = (token: NativePresenceIntentToken) => {
  const entry = entries.get(token.userId);
  return Boolean(entry && entry.version === token.version && entry.intent === token.intent);
};

/**
 * A superseded command is deliberately skipped rather than sent late. The
 * caller still receives an immediate local response from its intent commit.
 */
export const enqueueNativePresenceMutation = <T,>(
  token: NativePresenceIntentToken,
  mutation: () => Promise<T>,
): Promise<T | undefined> => {
  const entry = entryFor(token.userId);
  const run = entry.chain
    .catch(() => undefined)
    .then(async () => {
      if (!isCurrentNativePresenceIntent(token)) return undefined;
      return mutation();
    });
  entry.chain = run.then(() => undefined, () => undefined);
  return run;
};

// Test-only reset keeps ordering cases isolated without exposing persistence.
export const resetNativePresenceMutationCoordinatorForTests = () => {
  entries.clear();
};
