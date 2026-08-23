import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NATIVE_BROADCAST_REACH_MIN, buildRollupReachToast, buildTappedReachToast } from "./nativeBroadcastReachCopy";
import type { NativeBroadcastReach } from "./nativeBroadcastReachCopy";

const appRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(appRoot, "..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");
const migration = read("supabase/migrations/20260726090000_broadcast_reach_summary_rpc.sql");
const screen = fs.readFileSync(path.join(appRoot, "src/screens/NativeMapScreen.tsx"), "utf8");
const toast = fs.readFileSync(path.join(appRoot, "src/components/NativeToast.tsx"), "utf8");

const base: NativeBroadcastReach = {
  tappedReach: null, tappedAlertType: null, tappedLocation: null,
  tappedEligible: false, rollupReach: 0, rollupBroadcasts: 0,
};

describe("broadcast reach metric", () => {
  it("excludes the broadcaster from every count", () => {
    // notify_on_broadcast_alert_insert enqueues the creator separately from the
    // audience fan-out, so without this filter every number is inflated by one.
    expect(migration.match(/recipient_user_id <> v\.user_id/g)?.length).toBe(2);
  });

  it("counts only successfully created in-app notifications", () => {
    // Qualified form = the two counting CTEs. The bare form also appears in a
    // comment and the partial index, which are not the metric.
    expect(migration.match(/q\.processed_at is not null/g)?.length).toBe(2);
    // "Reached" is the honest word: processed_at proves the in-app row was
    // created, nothing about push receipt. Joining the delivery tables would
    // silently redefine the metric, so the query must never touch them.
    expect(migration).not.toContain("push_delivery_attempts");
    expect(migration).not.toContain("expo_push_tickets");
  });

  it("counts unique people for both a tapped alert and the map rollup", () => {
    expect(migration.match(/count\(distinct q\.recipient_user_id\)::integer as reach/g)?.length).toBe(2);
    expect(migration).toContain("count(distinct q.alert_id)::integer as broadcasts");
  });

  it("uses canonical expires_at with a legacy duration fallback, on both branches", () => {
    const active = migration.match(/coalesce\(a\.expires_at, a\.created_at \+ make_interval\(hours => a\.duration_hours\)\) > now\(\)/g);
    expect(active?.length).toBe(2);
  });

  it("gates both branches on the two-minute notification window", () => {
    expect(migration.match(/a\.created_at <= now\(\) - interval '2 minutes'/g)?.length).toBe(2);
    expect(migration).toContain("age_ok and t.active_ok");
  });

  it("uses the exact same canonical area resolver as alert notifications", () => {
    expect(migration).toContain("to_jsonb(a)->>'incident_district'");
    expect(migration).toContain("public.resolve_alert_notification_district(");
    expect(migration).toContain("to_jsonb(a)->>'location_district'");
    expect(migration).toContain("to_jsonb(a)->>'location_name'");
    expect(migration).toContain("to_jsonb(a)->>'address'");
  });

  it("resolves ownership server-side and is not callable anonymously", () => {
    expect(migration).toContain("a.creator_id = v.user_id");
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });
});

describe("reach copy", () => {
  it("stays silent below the floor", () => {
    const low = { ...base, tappedEligible: true, tappedReach: NATIVE_BROADCAST_REACH_MIN - 1 };
    expect(buildTappedReachToast(low)).toBeNull();
    expect(buildRollupReachToast({ ...base, rollupReach: NATIVE_BROADCAST_REACH_MIN - 1, rollupBroadcasts: 2 })).toBeNull();
  });

  it("stays silent when the alert is not eligible, whatever the count", () => {
    expect(buildTappedReachToast({ ...base, tappedEligible: false, tappedReach: 500 })).toBeNull();
  });

  it("names the place when the server gave one", () => {
    const toast = buildTappedReachToast({
      ...base, tappedEligible: true, tappedReach: 42, tappedAlertType: "Stray", tappedLocation: "Bishan Park",
    });
    expect(toast?.headline).toBe("Reached 42 people");
    expect(toast?.copy).toBe("Your Stray sighting near Bishan Park.");
    expect(toast?.tone).toBe("done");
  });

  it("falls back cleanly when no district is available", () => {
    const toast = buildTappedReachToast({
      ...base, tappedEligible: true, tappedReach: 12, tappedAlertType: "Lost", tappedLocation: null,
    });
    expect(toast?.copy).toBe("Your Lost sighting is live.");
  });

  it("uses neutral grammar for caution, others and unknown alert types", () => {
    for (const tappedAlertType of ["Caution", "Others", null]) {
      const toast = buildTappedReachToast({
        ...base, tappedEligible: true, tappedReach: 12, tappedAlertType, tappedLocation: "Bishan Park",
      });
      expect(toast?.copy).toBe("Your alert near Bishan Park.");
    }
  });

  it("says 'active' in the rollup and pluralises both numbers", () => {
    expect(buildRollupReachToast({ ...base, rollupReach: 128, rollupBroadcasts: 3 })?.copy)
      .toBe("Across 3 active broadcasts.");
    expect(buildRollupReachToast({ ...base, rollupReach: 10, rollupBroadcasts: 1 })?.copy)
      .toBe("Across 1 active broadcast.");
    expect(buildRollupReachToast({ ...base, rollupReach: 1000, rollupBroadcasts: 2 })?.headline)
      .toBe("Reached 1,000 people");
  });
});

describe("map wiring", () => {
  it("queries only on genuine opens, never on hydration or refresh", () => {
    expect(screen).toContain("const openMapAlert = useCallback");
    expect(screen).toContain("ownedReachRequestedRef.current = true;\n      runReachQuery(alert.id);");
    // Automatic route opens are the only other alert-specific call sites.
    expect(screen).toContain("autoReachShownRef.current.has(alert.id)");
    expect(screen).not.toMatch(/setSelectedAlert\([^;]+;\s*runReachQuery/s);
  });

  it("de-dupes the automatic open but never the explicit tap", () => {
    expect(screen).toContain("autoReachShownRef.current.has(alert.id)");
    // The tap branch must not consult the set, or "tap again for a fresh count" breaks.
    const tapBlock = screen.slice(screen.indexOf("const openMapAlert = useCallback"), screen.indexOf("// Trigger 2"));
    expect(tapBlock).toContain("runReachQuery(alert.id)");
    expect(tapBlock).not.toContain("autoReachShown");
  });

  it("lets a newer request win", () => {
    expect(screen).toContain("const requestId = ++reachRequestIdRef.current;");
    expect(screen).toContain("requestId !== reachRequestIdRef.current");
  });

  it("keeps reach out of statusMessage", () => {
    expect(screen).toContain("setReachToast");
    expect(screen).not.toMatch(/setStatusMessage\([^)]*[Rr]eached/);
  });

  it("suppresses the rollup when an owned alert was opened", () => {
    expect(screen).toContain("if (mapReachQueryRequestedRef.current || mapReachToastShownRef.current || alertOpenedThisVisitRef.current || ownedReachRequestedRef.current) return;");
    expect(screen).toContain("if (alertFocusPendingRef.current) return;");
  });

  it("starts only one aggregate query per map visit even if dependencies refresh", () => {
    expect(screen).toContain("mapReachQueryRequestedRef.current = true;");
    expect(screen).toContain("mapReachQueryRequestedRef.current = false;");
  });

  it("suppresses an aggregate response if any alert opens while it is in flight", () => {
    expect(screen).toContain("if (!alertId && (alertOpenedThisVisitRef.current || ownedReachRequestedRef.current)) return;");
    expect(screen).toContain("alertOpenedThisVisitRef.current = true;");
    expect(screen).toContain("ownedReachRequestedRef.current = true;");
  });

  it("resets per visit without persisting anything", () => {
    expect(screen).toContain("autoReachShownRef.current.clear();");
    expect(screen).toContain("alertOpenedThisVisitRef.current = false;");
    expect(screen).toContain("ownedReachRequestedRef.current = false;");
    expect(screen).not.toMatch(/AsyncStorage[^\n]*[Rr]each/);
  });

  it("uses the existing toast UI with hold-to-pause instead of a second timer", () => {
    expect(screen).toContain("content={reachToast}");
    expect(screen).toContain("holdToPause");
    expect(screen).not.toContain("reachToastTimerRef");
    expect(toast).toContain("onPressIn={pauseDismissal}");
    expect(toast).toContain("onPressOut={resumeDismissal}");
    expect(toast).toContain("clearDismissTimer();");
    expect(toast).toContain("cancelAnimation(progress);");
  });

  it("restarts the same single toast when a repeat live query returns unchanged copy", () => {
    expect(screen).toContain("setReachToastVersion((current) => current + 1);");
    expect(screen).toContain("key={reachToastVersion}");
  });
});
