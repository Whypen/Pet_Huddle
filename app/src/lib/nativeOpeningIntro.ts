import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";

// One-shot flag for the pre-auth opening film.
//
// Deliberately NOT keyed by user: this plays before anyone has signed in, so
// there is no id to key on. AsyncStorage is scoped to the app install, which
// gives exactly the intended behaviour — once per new install, and again after
// a reinstall. SecureStore would be wrong here: on iOS the keychain survives
// uninstall, so a reinstall would silently skip the opening.

const OPENING_INTRO_KEY = "huddle-opening-intro-seen:v1";

// TEMPORARY — design review only. Replays the opening on every launch so the
// film can be judged repeatedly. REMOVE before shipping, along with
// FORCE_REPLAY_FOR_DESIGN_REVIEW in nativeCoachMarks.ts.
const FORCE_REPLAY_FOR_DESIGN_REVIEW = true;

export async function hasSeenNativeOpeningIntro(): Promise<boolean> {
  if (FORCE_REPLAY_FOR_DESIGN_REVIEW) return false;
  const raw = await readNativeDisplayCacheItem(OPENING_INTRO_KEY);
  return raw === "1";
}

export async function markNativeOpeningIntroSeen(): Promise<void> {
  await AsyncStorage.setItem(OPENING_INTRO_KEY, "1").catch(() => undefined);
}
