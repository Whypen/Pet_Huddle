import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = () => readFileSync(resolve(root, "supabase/migrations/20260712110000_group_mute_state_canonical_sync.sql"), "utf8");

describe("group mute canonical sync", () => {
  it("updates both membership stores from one authenticated RPC", () => {
    const sql = migration();
    expect(sql).toMatch(/update public\.chat_room_members[\s\S]*set is_muted = v_muted/i);
    expect(sql).toMatch(/insert into public\.chat_participants \(chat_id, user_id, role, is_muted\)/i);
    expect(sql).toMatch(/set is_muted = excluded\.is_muted/i);
    expect(sql).toMatch(/where chat_id = p_chat_id[\s\S]*user_id = auth\.uid\(\)/i);
  });
});
