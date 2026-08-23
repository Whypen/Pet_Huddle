import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(dir, "../../../supabase/migrations/20260812121712_scoped_group_event_realtime_broadcast.sql"),
  "utf8",
);

describe("scoped group event realtime migration", () => {
  it("fans out content-free invalidations only to the room and member home topics", () => {
    expect(migration).toContain("'room:' || p_chat_id::text, 'room.changed'");
    expect(migration).toContain("'user:' || v_user_id::text || ':home', 'home.changed'");
    expect(migration).toContain("jsonb_build_object('v', 1, 'kind', p_kind)");
    expect(migration).not.toMatch(/new\.title|new\.description|new\.location_label|row_to_json/i);
  });

  it("uses indexed event and active-membership lookups", () => {
    expect(migration).toContain("where ce.id=v_event_id");
    expect(migration).toContain("where crm.chat_id=p_chat_id and crm.left_at is null and crm.deleted_at is null");
  });

  it("suppresses cron-only bookkeeping updates", () => {
    expect(migration).toContain("array['updated_at','last_notified_rsvp_count','reminder_30m_sent_at']");
    expect(migration).toContain("then return new; end if");
  });
});
