import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(dir, "../../../supabase/migrations/20260812121216_scoped_chat_realtime_broadcast.sql"),
  "utf8",
);

describe("scoped chat realtime migration", () => {
  it("publishes only private, content-free, versioned invalidations", () => {
    expect(migration).toContain("jsonb_build_object('v', 1, 'kind', p_kind)");
    expect(migration).toContain("'changed',\n    p_topic,\n    true");
    expect(migration).not.toMatch(/new\.content|old\.content|row_to_json|to_jsonb\((?:new|old)\)/i);
  });

  it("authorizes own inbox and active room membership at subscribe time", () => {
    expect(migration).toContain("p_topic = 'user:' || v_uid::text || ':inbox'");
    expect(migration).toContain("crm.user_id = v_uid");
    expect(migration).toContain("crm.left_at is null");
    expect(migration).toContain("crm.deleted_at is null");
    expect(migration).toContain("for select\nto authenticated");
    expect(migration).toContain("revoke insert on realtime.messages from anon, authenticated");
    expect(migration).not.toMatch(/for insert\s+to authenticated/i);
  });

  it("covers all three phase-one writer tables and indexed recipient columns", () => {
    expect(migration).toContain("on public.chat_messages");
    expect(migration).toContain("on public.chat_room_members");
    expect(migration).toContain("on public.group_join_requests");
    expect(migration).toContain("where crm.chat_id = v_chat_id");
    expect(migration).toContain("where cp.chat_id = v_chat_id and cp.role = 'admin'");
  });
});
