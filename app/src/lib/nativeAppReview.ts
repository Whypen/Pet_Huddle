import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";
import * as StoreReview from "expo-store-review";

// ── App review prompt engine ────────────────────────────────────────────────
//
// Strategy (see product notes): we get ~3 OS prompts / 365 days per device and
// cannot detect whether the OS actually showed one. So we:
//   1. Pre-gate on genuine delight + investment, never the first micro-event.
//   2. Route unhappy users to feedback BEFORE the store prompt (sentiment sheet),
//      so a fired prompt almost always lands on a happy, invested user.
//   3. Stack several reciprocated/aggregated "a-ha" moments through one gate and
//      let the OS ration the shots; space them with a cooldown.
//
// This module is the headless engine: activation tracking + eligibility + the
// native call. The sentiment UI lives in NativeAppReviewSheet, which subscribes
// to the prompt event emitted here.

export type AppReviewTrigger =
  | "social_likes_milestone" // your post got aggregated love
  | "first_match_message"    // a brand-new match where the conversation started
  | "alert_community_support" // your map alert was supported by the community
  | "care_completed_rated";  // a Care booking completed and you rated 4-5★

export type AppReviewPromptCopy = {
  title: string;
  body: string;
  positiveLabel: string;
};

// Contextual sentiment copy per trigger. Care is rating-gated, so it skips the
// sentiment step (the 4-5★ already is the gate) and never shows this.
export const APP_REVIEW_PROMPTS: Record<AppReviewTrigger, AppReviewPromptCopy> = {
  social_likes_milestone: {
    title: "Glad people are showing love?",
    body: "Your post is getting some warmth from the pack. Enjoying huddle so far?",
    positiveLabel: "Yes, loving it",
  },
  first_match_message: {
    title: "Loving your matches on huddle?",
    body: "You just struck up a new connection. How's huddle treating you?",
    positiveLabel: "Yes, loving it",
  },
  alert_community_support: {
    title: "Glad the community showed up?",
    body: "People are rallying around your alert. Enjoying huddle so far?",
    positiveLabel: "Yes, loving it",
  },
  care_completed_rated: {
    title: "",
    body: "",
    positiveLabel: "",
  },
};

// ── Tunable gates ───────────────────────────────────────────────────────────
const MIN_SESSIONS = 3;
const MIN_DISTINCT_DAYS = 2;
const MIN_TWO_WAY_INTERACTIONS = 1;
const COOLDOWN_DAYS = 120; // ~3 windows / year, matches the OS cap
const MAX_PROMPTS = 3;
const NEGATIVE_BACKOFF_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type AppReviewState = {
  firstSeenAt: number;
  sessionCount: number;
  lastSessionDay: string | null;
  distinctDayCount: number;
  twoWayInteractions: number;
  promptCount: number;
  lastPromptAt: number | null;
  lastNegativeAt: number | null;
  firedTriggers: AppReviewTrigger[];
};

const DEFAULT_STATE: AppReviewState = {
  firstSeenAt: 0,
  sessionCount: 0,
  lastSessionDay: null,
  distinctDayCount: 0,
  twoWayInteractions: 0,
  promptCount: 0,
  lastPromptAt: null,
  lastNegativeAt: null,
  firedTriggers: [],
};

const stateKey = (userId: string) => `native-app-review:v1:state:${userId}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

const cleanUserId = (userId?: string | null) => String(userId || "").trim();

async function readState(userId: string): Promise<AppReviewState> {
  try {
    const raw = await readNativeDisplayCacheItem(stateKey(userId));
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<AppReviewState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      firedTriggers: Array.isArray(parsed.firedTriggers) ? parsed.firedTriggers : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(userId: string, state: AppReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    // best-effort; review prompting is non-critical
  }
}

// Record an app open. Drives the session + distinct-day activation gates.
export async function recordAppReviewSession(userId?: string | null): Promise<void> {
  const id = cleanUserId(userId);
  if (!id) return;
  const state = await readState(id);
  const day = todayKey();
  const next: AppReviewState = {
    ...state,
    firstSeenAt: state.firstSeenAt || Date.now(),
    sessionCount: state.sessionCount + 1,
    lastSessionDay: day,
    distinctDayCount: state.lastSessionDay === day ? state.distinctDayCount : state.distinctDayCount + 1,
  };
  await writeState(id, next);
}

// Record a genuine two-way interaction (sent a message, matched, etc.). Gates
// out passive lurkers from the activation threshold.
export async function recordAppReviewInteraction(userId?: string | null): Promise<void> {
  const id = cleanUserId(userId);
  if (!id) return;
  const state = await readState(id);
  await writeState(id, { ...state, twoWayInteractions: state.twoWayInteractions + 1 });
}

// Record a negative signal (low rating, dispute, error during a flow) so we back
// off prompting for a while.
export async function recordAppReviewNegativeSignal(userId?: string | null): Promise<void> {
  const id = cleanUserId(userId);
  if (!id) return;
  const state = await readState(id);
  await writeState(id, { ...state, lastNegativeAt: Date.now() });
}

function passesGates(state: AppReviewState, trigger: AppReviewTrigger): boolean {
  const now = Date.now();
  if (state.promptCount >= MAX_PROMPTS) return false;
  if (state.lastPromptAt && now - state.lastPromptAt < COOLDOWN_DAYS * DAY_MS) return false;
  if (state.lastNegativeAt && now - state.lastNegativeAt < NEGATIVE_BACKOFF_DAYS * DAY_MS) return false;
  if (state.firedTriggers.includes(trigger)) return false;
  if (state.sessionCount < MIN_SESSIONS) return false;
  if (state.distinctDayCount < MIN_DISTINCT_DAYS) return false;
  if (state.twoWayInteractions < MIN_TWO_WAY_INTERACTIONS) return false;
  return true;
}

// ── Prompt event emitter (the sentiment sheet subscribes) ───────────────────
type PromptEvent = { userId: string; trigger: AppReviewTrigger; copy: AppReviewPromptCopy };
type PromptListener = (event: PromptEvent) => void;
const listeners = new Set<PromptListener>();

export function subscribeAppReviewPrompt(listener: PromptListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Fire the native store prompt (OS decides whether it actually shows).
export async function presentNativeStoreReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
    }
  } catch {
    // non-critical
  }
}

// Call when the user answers the sentiment sheet positively. Burns a shot.
export async function confirmAppReviewPositive(userId: string | null | undefined, trigger: AppReviewTrigger): Promise<void> {
  const id = cleanUserId(userId);
  if (!id) return;
  const state = await readState(id);
  const fired = state.firedTriggers.includes(trigger) ? state.firedTriggers : [...state.firedTriggers, trigger];
  await writeState(id, { ...state, promptCount: state.promptCount + 1, lastPromptAt: Date.now(), firedTriggers: fired });
  await presentNativeStoreReview();
}

// Call when the user answers negatively. Marks the trigger spent + backs off.
export async function recordAppReviewDeclined(userId: string | null | undefined, trigger: AppReviewTrigger): Promise<void> {
  const id = cleanUserId(userId);
  if (!id) return;
  const state = await readState(id);
  const fired = state.firedTriggers.includes(trigger) ? state.firedTriggers : [...state.firedTriggers, trigger];
  await writeState(id, { ...state, firedTriggers: fired, lastNegativeAt: Date.now() });
}

// Main entry for delight moments. Checks gates; if eligible, either shows the
// sentiment sheet (default) or — when the caller already has positive sentiment
// (e.g. a 4-5★ rating) — fires the store prompt directly.
export async function requestAppReview(options: {
  userId?: string | null;
  trigger: AppReviewTrigger;
  skipSentiment?: boolean;
}): Promise<boolean> {
  const id = cleanUserId(options.userId);
  if (!id) return false;
  const state = await readState(id);
  if (!passesGates(state, options.trigger)) return false;

  if (options.skipSentiment) {
    await confirmAppReviewPositive(id, options.trigger);
    return true;
  }

  // Mark fired up-front so a rapid second delight event can't double-emit; the
  // sheet resolves to positive/negative from here.
  await writeState(id, {
    ...state,
    firedTriggers: state.firedTriggers.includes(options.trigger) ? state.firedTriggers : [...state.firedTriggers, options.trigger],
  });
  const copy = APP_REVIEW_PROMPTS[options.trigger];
  listeners.forEach((listener) => listener({ userId: id, trigger: options.trigger, copy }));
  return true;
}
