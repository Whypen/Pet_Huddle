import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260803010000_native_chat_client_message_idempotency.sql"),
  "utf8",
);
const correction = readFileSync(
  resolve(repoRoot, "supabase/migrations/20260803011000_fix_native_chat_idempotency_conflict.sql"),
  "utf8",
);

describe("native chat send idempotency", () => {
  it("deduplicates retries per room, sender and client message ID", () => {
    expect(migration).toContain("add column if not exists client_message_id text");
    expect(migration).toMatch(/unique index[\s\S]*\(chat_id, sender_id, client_message_id\)/);
    expect(migration).toContain("p_content::jsonb ->> 'client_message_id'");
    expect(correction).toContain("on conflict do nothing");
    expect(correction).not.toContain("on conflict (chat_id");
    expect(correction).toMatch(/m\.client_message_id = v_client_message_id/);
  });

  it("keeps legacy non-JSON messages compatible", () => {
    expect(migration).toMatch(/exception when others then\s+v_client_message_id := null/);
    expect(migration).toContain("if found or v_client_message_id is null then");
  });
});
