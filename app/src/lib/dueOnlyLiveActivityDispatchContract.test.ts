import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(dir, "../../../supabase/migrations/20260812124047_due_only_live_activity_dispatch.sql"), "utf8");
const adaptiveMigration = readFileSync(resolve(dir, "../../../supabase/migrations/20260816130632_live_activity_adaptive_progress_wake.sql"), "utf8");
const dispatcher = readFileSync(resolve(dir, "../../../supabase/functions/dispatch-live-activity-progress/index.ts"), "utf8");
const widget = readFileSync(resolve(dir, "../../targets/HuddleLiveActivities/HuddleLiveActivities.swift"), "utf8");

describe("due-only Live Activity dispatch", () => {
  it("claims only explicitly due rows, never elapsed heartbeat rows", () => {
    expect(migration).toContain("r.next_dispatch_at is not null and r.next_dispatch_at<=now()");
    expect(migration).not.toContain("last_pushed_at<=now()-interval '50 seconds'");
    expect(migration).toContain("live_activity_registrations_due_dispatch_idx");
  });

  it("schedules database events and span-proportional visual reconciliation", () => {
    expect(migration).toContain("new.next_dispatch_at:=now()");
    expect(migration).toContain("new.next_dispatch_at:=new.expires_at");
    expect(dispatcher).toContain("const TARGET_VISUAL_PROGRESS_DELTA = 0.006");
    expect(dispatcher).toContain("const cadenceMs = visualCadenceMs(state, row.kind)");
    expect(dispatcher).toContain("Math.min(nextBoundaryMs, nextCadenceMs)");
    expect(dispatcher).toContain("Math.min(retryCadenceMs, 5 * 60_000)");
    expect(adaptiveMigration).toContain("if tg_op = 'INSERT'");
    expect(adaptiveMigration).toContain("set next_dispatch_at = now()");
  });

  it("derives one post-clamp progress value per presentation without widget timelines", () => {
    expect(widget).not.toContain("TimelineView(");
    expect(widget.match(/let presentation = state\.presentation\(at: Date\(\)\)/g)).toHaveLength(2);
    expect(widget).toContain("HuddleSessionBar(progress: presentation.displayedProgress, state: state)");
    expect(widget).toContain("progress: state.progressInterval == nil ? nil : presentation.displayedProgress");
    expect(widget).toContain("intervalComplete: presentation.isIntervalComplete");
    expect(widget).toContain("Text(state.startedAt, style: .timer)");
  });

  it("retires the heartbeat-named cron job", () => {
    expect(migration).toContain("'live-activity-progress-every-minute'");
    expect(migration).toContain("'live-activity-due-boundaries-every-minute'");
  });
});
