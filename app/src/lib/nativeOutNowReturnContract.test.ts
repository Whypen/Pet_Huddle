import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("canonical Out Now return contract", () => {
  const migration = read("../supabase/migrations/20260723130000_out_now_canonical_return_summary.sql");
  const continuousClockMigration = read("../supabase/migrations/20260724100000_out_now_continuous_counter.sql");
  const continueClockMigration = read("../supabase/migrations/20260724123000_out_now_continue_preserves_session_clock.sql");
  const freshStartMigration = read("../supabase/migrations/20260725090000_fresh_out_now_session_start.sql");
  const dispatcher = read("../supabase/functions/dispatch-live-activity-progress/index.ts");
  const home = read("src/screens/NativeHomeScreen.tsx");
  const navigator = read("src/navigation/RootNavigator.tsx");
  const ios = read("targets/HuddleLiveActivities/HuddleLiveActivities.swift");
  const android = read("modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleTerminalActionReceiver.kt");
  const hydration = read("src/lib/nativeActiveSessionHydration.ts");

  it("owns start, stop, duration, and summary atomically on the backend", () => {
    expect(migration).toMatch(/out_now_started_at timestamptz/);
    expect(migration).toMatch(/function public\.return_native_out_now\(\)/);
    expect(migration).toMatch(/for update/);
    expect(migration).toMatch(/out_now_returned_at = v_returned_at/);
    expect(migration).toMatch(/out_now_final_message = v_message/);
  });

  it("uses the same server result for Home, iOS, and Android", () => {
    expect(home).toContain("returnNativeUserOutNow");
    expect(home).toContain("returned.finalMessage");
    expect(ios).toContain('rpc("return_native_out_now", body: [:])');
    expect(android).toContain('authenticatedRpc(context, "return_native_out_now"');
    expect(home).not.toContain("consumeOutNowSessionSummary()");
    expect(navigator).toContain("returnNativeUserOutNow");
    expect(navigator).not.toContain("stopNativeMapSharing");
  });

  it("dispatches the final summary for 120 seconds but keeps natural expiry immediate", () => {
    expect(dispatcher).toContain("out_now_final_message");
    expect(dispatcher).toContain("finalMessage: finalMessage || null");
    expect(dispatcher).toContain("clean(state.finalMessage) ? 120 : 0");
  });

  it("keeps one true walk start for the headline and summary while renewing only visual progress", () => {
    expect(dispatcher).toContain("out_now_started_at");
    expect(dispatcher).toContain("progressStartedAtMs = expiresAtMs - 2 * 60 * 60 * 1000");
    expect(dispatcher).toContain("progressStartedAt: activityKitDate");
    expect(dispatcher).toContain("state.progressStartedAtMs || state.startedAtMs");
    expect(continuousClockMigration).toContain("get_native_out_now_session_clock");
    expect(continuousClockMigration).toContain("renew_native_out_now_visibility_with_clock");
    expect(continuousClockMigration).toContain("out_now_started_at, map_visible_until");
    expect(continueClockMigration).toContain("set out_now_started_at = v_started_at");
    expect(continueClockMigration).toContain("out_now_session_not_continuable");
    expect(ios).toContain("state.progressStartedAt = progressStartedAt");
    expect(ios).not.toContain("state.startedAt = startedAt");
    expect(android).toContain("renew_native_out_now_visibility_with_clock");
    expect(android).toContain("applyRenewedWalkLocally");
    expect(home).toContain("outNowCanonicalStartedAtRef");
    // renewedClock is the sole source of startedAt/expiresAt now (no separate
    // canonical-clock re-fetch), so one guard covers both the old missing-clock
    // and missing-visibility failure modes.
    expect(home).toContain('throw new Error("out_now_visibility_missing")');
    expect(dispatcher).toContain("previousStartedAtMs");
    expect(hydration).toContain("out_now_started_at");
    expect(hydration).toContain("progressStartedAt,");
  });

  it("resets a new Out Now session and preserves elapsed time only for Continue", () => {
    expect(freshStartMigration).toContain("function public.start_native_out_now");
    expect(freshStartMigration).toContain("out_now_started_at = now()");
    expect(freshStartMigration).toContain("out_now_returned_at = null");
    expect(freshStartMigration).toContain("return public.get_native_out_now_session_clock()");
    expect(continueClockMigration).toContain("set out_now_started_at = v_started_at");
    expect(home).toContain("startNativeUserOutNowFromSavedLocation");
    expect(home).toContain("const pinResult = await queueOutNowMutation(presenceIntent, () => pinNativeUserOutNow");
    expect(home).toContain("renewedClock = pinResult;");
  });
});
