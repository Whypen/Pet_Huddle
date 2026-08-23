import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(dir, "../../../supabase/migrations/20260812122805_eliminate_message_read_noop_updates.sql"),
  "utf8",
);
const webChats = readFileSync(resolve(dir, "../../../src/pages/Chats.tsx"), "utf8");
const webServiceChat = readFileSync(resolve(dir, "../../../src/hooks/useServiceChat.ts"), "utf8");

describe("message read churn contract", () => {
  it("makes both native read RPCs insert-only on conflict", () => {
    expect(migration.match(/on conflict on constraint message_reads_message_id_user_id_key do nothing/g)).toHaveLength(2);
    expect(migration).not.toMatch(/do update set read_at/i);
  });

  it("keeps removed members out of both read RPCs", () => {
    expect(migration.match(/crm\.left_at is null and crm\.deleted_at is null/g)).toHaveLength(2);
  });

  it("makes both direct web upserts ignore duplicate receipts", () => {
    expect(webChats).toContain('onConflict: "message_id,user_id", ignoreDuplicates: true');
    expect(webServiceChat).toContain('onConflict: "message_id,user_id", ignoreDuplicates: true');
  });
});
