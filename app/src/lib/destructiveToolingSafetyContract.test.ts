import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const source = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("destructive tooling safety contract", () => {
  it.each([
    "scripts/reset_accounts.mjs",
    "scripts/cleanup-users.mjs",
    "supabase/cleanup_test_users.sql",
    "supabase/wipe_all_local_users.sql",
  ])("keeps %s retired and non-destructive", (path) => {
    const retired = source(path);

    expect(retired.toLowerCase()).toContain("retired");
    expect(retired).not.toMatch(/\.delete\s*\(/);
    expect(retired).not.toMatch(/\bdelete\s+from\b/i);
    expect(retired).not.toContain("auth.admin.deleteUser");
  });

  it("removes named real accounts from retired reset tooling", () => {
    const retiredTools = [
      source("scripts/reset_accounts.mjs"),
      source("scripts/cleanup-users.mjs"),
      source("supabase/cleanup_test_users.sql"),
      source("supabase/wipe_all_local_users.sql"),
    ].join("\n");

    expect(retiredTools).not.toContain("twenty_illkid@msn.com");
    expect(retiredTools).not.toContain("fongpoman114@gmail.com");
  });

  it("retires the legacy two-sided chat deletion RPC for every API role", () => {
    const migration = source(
      "supabase/migrations/20260812112525_protect_user_owned_profiles_and_retire_legacy_chat_delete.sql",
    );

    expect(migration).toContain(
      "revoke all on function public.unmatch_and_delete_direct_chat(uuid) from public",
    );
    expect(migration).toContain(
      "revoke all on function public.unmatch_and_delete_direct_chat(uuid) from authenticated",
    );
    expect(migration).not.toMatch(/grant\s+execute[\s\S]*unmatch_and_delete_direct_chat/i);
  });

  it("keeps the active Care signature RPC unavailable to public and anon", () => {
    const migration = source(
      "supabase/migrations/20260812115203_restrict_care_signature_and_lock_deletion_boundaries.sql",
    );
    const signature = "public.record_service_care_scope_signature(uuid, jsonb, boolean, boolean)";

    expect(migration).toContain(`revoke all on function ${signature} from public`);
    expect(migration).toContain(`revoke all on function ${signature} from anon`);
    expect(migration).toContain(`grant execute on function ${signature} to authenticated, service_role`);
  });

  it("ships a remote catalog assertion for both deletion boundaries", () => {
    const contract = source("supabase/tests/deletion_and_auth_boundary_contract.sql");

    expect(contract).toContain("has_function_privilege('public'");
    expect(contract).toContain("has_function_privilege('anon'");
    expect(contract).toContain("legacy_chat_delete_executable");
    expect(contract).toContain("care_signature_public_or_anon_execute");
  });

  it("keeps the production verifier read-only and pinned to Huddle", () => {
    const verifier = source("scripts/verify-production-deletion-boundaries.mjs");

    expect(verifier).toContain('EXPECTED_PROJECT_REF = "ztrbourwcnhrpmzwlrcn"');
    expect(verifier).toContain("deletion_and_auth_boundary_contract.sql");
    expect(verifier).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
  });
});
