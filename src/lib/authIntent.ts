/**
 * Auth intent — the thing you were trying to do when the wall interrupted you.
 *
 * Why this is not React state: `supabase.auth.signInWithOAuth` performs a full
 * top-level redirect (src/pages/Auth.tsx sets `redirectTo` to /auth/callback),
 * so the page unloads and every in-memory value is gone. The intent has to
 * survive a navigation to a third-party origin and back, which means storage.
 *
 * sessionStorage rather than localStorage on purpose: an intent is scoped to the
 * tab that created it and must not leak into other tabs or outlive the browsing
 * session. A stale "join this group" firing days later in a different tab would
 * be a real bug, not a nicety.
 */

export type AuthIntentType =
  | "post"
  | "reply"
  | "like"
  | "join-group"
  | "broadcast"
  | "see-alert"
  | "message"
  | "create-group"
  | "manage-group"
  | "edit-profile"
  | "profile"
  | "notifications"
  | "settings"
  | "map-location"
  | "search"
  | "view-media"
  | "save-post"
  | "pin-post"
  | "post-options";

export type AuthIntent = {
  type: AuthIntentType;
  /** The thing being acted on — a group id, thread id, alert id. */
  targetId?: string;
  /** Where to land once auth succeeds. Same-origin path only. */
  returnTo?: string;
  createdAt: number;
};

const STORAGE_KEY = "huddle_auth_intent";
const RETURN_TO_STORAGE_KEY = "huddle_auth_return_to";

/** The single product fallback when auth has no originating surface. */
export const DEFAULT_AUTH_RETURN_TO = "/social";

/**
 * Five minutes. Long enough for a slow OAuth round trip including a password
 * manager prompt and 2FA; short enough that an abandoned attempt cannot fire
 * later and perform a write the person has forgotten they started.
 */
export const AUTH_INTENT_TTL_MS = 5 * 60 * 1000;

const isAuthIntentType = (value: unknown): value is AuthIntentType =>
  typeof value === "string" &&
  ["post", "reply", "like", "join-group", "broadcast", "see-alert", "message", "create-group", "manage-group", "edit-profile", "profile", "notifications", "settings", "map-location", "search", "view-media", "save-post", "pin-post", "post-options"].includes(value);

/**
 * Same-origin, path-only. Guards against an open redirect: `returnTo` is
 * attacker-influencable if an intent is ever seeded from a URL, so it must never
 * be able to point off-site or at a protocol-relative `//evil.com`.
 */
const LEGACY_OR_AUTH_ONLY_PATHS = [
  "/auth",
  "/join",
  "/signup",
  "/reset-password",
  "/update-password",
  "/settings",
] as const;

const isSafeReturnTo = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;

  const pathname = value.split(/[?#]/, 1)[0];
  if (pathname === "/") return false;
  return !LEGACY_OR_AUTH_ONLY_PATHS.some(
    (blockedPath) => pathname === blockedPath || pathname.startsWith(`${blockedPath}/`),
  );
};

export const resolveAuthReturnTo = (...candidates: unknown[]): string =>
  candidates.find(isSafeReturnTo) as string | undefined ?? DEFAULT_AUTH_RETURN_TO;

/** The only internal sign-in entry. It always carries a validated product surface. */
export const buildJoinSignInPath = (returnTo: unknown): string =>
  `/join?mode=signin&next=${encodeURIComponent(resolveAuthReturnTo(returnTo))}`;

export const writeAuthReturnTo = (returnTo: string): void => {
  if (!isSafeReturnTo(returnTo)) return;
  try {
    sessionStorage.setItem(RETURN_TO_STORAGE_KEY, returnTo);
  } catch {
    // Auth still works when tab storage is unavailable; only return continuity degrades.
  }
};

export const takeAuthReturnTo = (): string | null => {
  try {
    const returnTo = sessionStorage.getItem(RETURN_TO_STORAGE_KEY);
    sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
    return isSafeReturnTo(returnTo) ? returnTo : null;
  } catch {
    return null;
  }
};

export const readAuthIntent = (): AuthIntent | null => {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Safari private mode and hardened privacy settings throw on access.
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearAuthIntent();
    return null;
  }

  const candidate = parsed as Partial<AuthIntent> | null;
  if (!candidate || !isAuthIntentType(candidate.type) || typeof candidate.createdAt !== "number") {
    clearAuthIntent();
    return null;
  }

  // Expired, or a clock that moved backwards. Either way, do not replay it.
  const age = Date.now() - candidate.createdAt;
  if (age > AUTH_INTENT_TTL_MS || age < 0) {
    clearAuthIntent();
    return null;
  }

  return {
    type: candidate.type,
    targetId: typeof candidate.targetId === "string" ? candidate.targetId : undefined,
    returnTo: isSafeReturnTo(candidate.returnTo) ? candidate.returnTo : undefined,
    createdAt: candidate.createdAt,
  };
};

export const writeAuthIntent = (intent: Omit<AuthIntent, "createdAt">): void => {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...intent,
        returnTo: isSafeReturnTo(intent.returnTo) ? intent.returnTo : undefined,
        createdAt: Date.now(),
      } satisfies AuthIntent),
    );
  } catch {
    // Storage unavailable. Auth still works; only the resume is lost, so this
    // degrades rather than fails.
  }
};

export const clearAuthIntent = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

/**
 * Read once and consume. Replay must be single-shot — leaving the intent in
 * storage would re-fire it on every subsequent mount of the callback route.
 */
export const takeAuthIntent = (): AuthIntent | null => {
  const intent = readAuthIntent();
  if (intent) clearAuthIntent();
  return intent;
};

/**
 * Consume the tab-scoped auth handoff exactly once and resolve it through the
 * same-origin guard. Onboarding completion uses this too, so a new account
 * returns to the surface that opened Join instead of leaking into legacy Home.
 */
export const takeResolvedAuthReturnTo = (): string => {
  const intent = takeAuthIntent();
  return resolveAuthReturnTo(intent?.returnTo, takeAuthReturnTo());
};
