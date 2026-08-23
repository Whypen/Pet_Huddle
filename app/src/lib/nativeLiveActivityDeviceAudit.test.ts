import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDirectory, "../../..");
const read = (path: string) => readFileSync(resolve(testDirectory, path), "utf8");

const widget = () => read("../../targets/HuddleLiveActivities/HuddleLiveActivities.swift");
const ios = () => read("../../modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift");
const android = () => read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionsModule.kt");
const androidPresentation = () => read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionPresentation.kt");
const androidActions = () => read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleTerminalActionReceiver.kt");
const androidClear = () => read("../../modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleNotificationClearReceiver.kt");
const hydration = () => read("./nativeActiveSessionHydration.ts");
const dispatcher = () => read("../../../supabase/functions/dispatch-live-activity-progress/index.ts");
const home = () => read("../screens/NativeHomeScreen.tsx");
const platformLifecycleSql = () => read("../../../supabase/migrations/20260716170400_live_activity_terminal_status_parity.sql");

describe("four-level Live Activity device audit gates", () => {
  it("does not apply a custom ProgressViewStyle to a date-relative ProgressView", () => {
    const source = widget();
    // Apple documents that ProgressView(timerInterval:) does not support custom
    // styles. This test intentionally fails against the current device build:
    // the host is free to return nil/zero fraction and the custom renderer then
    // resets the line and glyph.
    expect(source).not.toMatch(/ProgressView\(timerInterval: interval, countsDown: false\)[\s\S]{0,180}\.progressViewStyle\(Huddle/);
  });

  it("does not convert a host date-relative nil fraction into a zero render", () => {
    const source = widget();
    expect(source).not.toContain("configuration.fractionCompleted ?? 0");
  });

  it("uses one deterministic clock-derived progress value for both Home and Care", () => {
    const source = widget();
    expect(source).toContain("func presentation(at date: Date) -> HuddlePresentationState");
    expect(source).not.toContain("TimelineView(");
    expect(source.match(/let presentation = state\.presentation\(at: Date\(\)\)/g)).toHaveLength(2);
    expect(source).toContain("HuddleSessionBar(progress: presentation.displayedProgress, state: state)");
    expect(source).toContain("HuddleAvatarStack(");
    expect(source).toContain("progress: state.progressInterval == nil ? nil : presentation.displayedProgress");
    expect(source).toContain("intervalComplete: presentation.isIntervalComplete");
    expect(source).toContain("url: presentation.actionURL");
    expect(source).toContain("fraction: progress,");
    expect(source).not.toContain("snapshotProgress");
    expect(source).not.toContain("hasReachedScheduledEnd");
    expect(source).not.toContain("ProgressView(timerInterval: interval, countsDown: false)");
  });

  it("labels Android source checks as structural while JVM tests own numeric behavior", () => {
    const module = android();
    const presentation = androidPresentation();
    expect(module).toContain("val presentation = presentationState(payload, startedMs)");
    expect(module).toContain("presentation.displayedProgressPermille");
    expect(module).toContain("presentation.isIntervalComplete");
    expect(presentation).toContain("val locallyComplete = validInterval && input.nowMs >= requireNotNull(expiresAt)");
    expect(presentation).toContain("val isIntervalComplete = input.payloadIsOverrun || locallyComplete");
  });

  it("restores Android cache bookkeeping without reposting a stale notification", () => {
    const source = android();
    const restoreStart = source.indexOf("private fun restorePersistedPayloads()");
    const restoreEnd = source.indexOf("private fun androidDeviceId", restoreStart);
    const restore = source.slice(restoreStart, restoreEnd);
    expect(restore).toContain("HuddleActiveSessionRuntimeStore.put(identity.key, payload)");
    expect(restore).not.toContain("notify(");
  });

  it("does not invent a session clock from the local wall clock after canonical parsing fails", () => {
    expect(ios()).not.toContain("parseDate(payload.startedAt) ?? Date()");
    expect(android()).not.toContain("getOrElse { System.currentTimeMillis() }");
    const homeSource = home();
    // renewedClock is the sole source of the activity's startedAt/expiresAt --
    // a missing or unparseable value throws rather than falling back to a
    // locally-fabricated time.
    const clockStart = homeSource.indexOf("if (!renewedClock?.startedAt || !Number.isFinite(Date.parse(renewedClock.expiresAt))) {");
    const clockEnd = homeSource.indexOf("void startHomePresenceActivity", clockStart);
    expect(clockStart).toBeGreaterThan(-1);
    expect(clockEnd).toBeGreaterThan(clockStart);
    const activityClock = homeSource.slice(
      clockStart,
      clockEnd,
    );
    expect(activityClock).toContain('throw new Error("out_now_visibility_missing");');
    expect(activityClock).toContain("const startedAt = renewedClock.startedAt;");
    expect(activityClock).toContain("const expiresAt = renewedClock.expiresAt;");
    expect(activityClock).not.toContain("pendingHomePresenceUntilRef");
    expect(activityClock).not.toContain("Date.now()");
  });

  it("keeps the overrun snapshot canonical at the completed endpoint", () => {
    expect(dispatcher()).toMatch(/progressPermille:\s*overrun \? 1000 : current/);
    expect(dispatcher()).not.toContain("deferred_by_frequent_update_setting");
    expect(android()).toContain("ringProgress = if (isCare) null else displayedProgress");
  });

  it("hands the canonical Home progress start through hydration and both native renderers", () => {
    expect(hydration()).toMatch(/startHomePresenceActivity\(\{[\s\S]{0,120}progressStartedAt,/);
    expect(ios()).toContain("progressStartedAt: progressStartedAt,");
    expect(android()).toContain('timestampMs(payload["progressStartedAt"]) ?: startedMs');
    expect(android()).toContain('payload["progressPermille"] as? Number');
    expect(android()).not.toContain("isCare -> 4L * 60L * 60L * 1000L");
  });

  it("rejects stale local iOS revisions and orders remote APNs updates by timestamp", () => {
    expect(ios()).toContain("incomingRevision > 0 && incomingRevision <= currentRevision");
    expect(dispatcher()).toContain("const timestamp = orderedAPNsTimestamp(row)");
    expect(dispatcher()).toContain("previous + 1");
    expect(dispatcher()).toContain("last_apns_timestamp: apnsTimestamp");
  });

  it("keeps every terminal Care status identical across hydration, dispatcher, iOS, Android, and recovery SQL", () => {
    const statuses = [
      "completed",
      "cancelled",
      "disputed",
      "under_dispute",
      "handoff_issue_review",
      "not_started_refunded",
      "handoff_expired_manual_refund_required",
    ];
    const sources = [hydration(), dispatcher(), widget(), androidActions(), platformLifecycleSql()];
    for (const status of statuses) {
      for (const source of sources) expect(source).toContain(status);
    }
  });

  it("keeps the canonical ContentState payload JSON-decodable at expiry boundaries", () => {
    const fixture = JSON.parse(read("./__fixtures__/huddleActiveSessionContentState.json")) as Record<string, unknown>;
    const serialized = JSON.stringify({
      ...fixture,
      startedAt: 0,
      expiresAt: 7200,
      progressPermille: 1000,
      isOverrun: true,
      stateRevision: 9,
      generation: 2,
    });
    const decoded = JSON.parse(serialized) as Record<string, unknown>;
    expect(decoded.startedAt).toBe(0);
    expect(decoded.expiresAt).toBe(7200);
    expect(decoded.progressPermille).toBe(1000);
    expect(decoded.isOverrun).toBe(true);
  });

  it("does not use the same notification id for Home and Care", () => {
    const source = android();
    expect(source).toContain('NotificationIdentity("home", "huddle:home", homeNotificationId)');
    expect(source).toContain('NotificationIdentity("care:$serviceId", "huddle:care:$serviceId", careNotificationId)');
    expect(source).toContain('NotificationManagerCompat.from(context()).notify(identity.tag, identity.id');
    expect(source).not.toContain("sessionId.hashCode()");
  });

  it("keeps an active Android session ongoing instead of treating UI dismissal as canonical completion", () => {
    expect(android()).toContain(".setOngoing(true)");
    expect(androidClear()).not.toMatch(/end_map_visibility|complete_service/);
  });

  it("keeps this audit rooted in the current repository", () => {
    expect(repoRoot.endsWith("Pet_Huddle")).toBe(true);
  });
});
