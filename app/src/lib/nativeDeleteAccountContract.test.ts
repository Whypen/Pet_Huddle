import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nativeSafeErrorCopy } from "./nativeSafeErrorCopy";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoFileSource = (path: string) => readFileSync(resolve(currentDir, "../../..", path), "utf8");

const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe("native delete account Care payment contract", () => {
  it("checks blockers before deleting storage files", () => {
    const source = repoFileSource("supabase/functions/delete-account/index.ts");
    const handlerBody = between(source, 'if (body.action === "auth_probe" || body.dry_run === true)', "const profileEmail = callerData.user.email");

    expect(handlerBody).toContain('body.action != null && body.action !== "confirm_delete"');
    expect(handlerBody).toContain('"delete_account_confirmation_required"');
    expect(handlerBody).toContain('admin.rpc("get_delete_account_blocker"');
    expect(handlerBody).toContain("blocker.blocked");
    expect(handlerBody).toContain("409");
    expect(handlerBody.indexOf("listUserStorageObjects(admin, callerId)")).toBeLessThan(
      handlerBody.indexOf('admin.rpc("delete_user_account_for_service_role"')
    );
    expect(handlerBody.indexOf('admin.rpc("delete_user_account_for_service_role"')).toBeLessThan(
      handlerBody.indexOf("purgeUserStorageObjects(admin, storageObjects)")
    );
    expect(handlerBody).not.toContain('admin.rpc("delete_user_account",');
    expect(handlerBody).toContain("let cleanupPending = false");
    expect(handlerBody).toContain("cleanupPending = true");
    const postDeleteCleanup = between(
      source,
      "let cleanupPending = false",
      "const profileEmail = callerData.user.email",
    );
    expect(postDeleteCleanup).not.toContain(
      'return deleteAccountResponse("delete_account_storage_failed"',
    );
    expect(source).toContain("JSON.stringify({ success: true, cleanup_pending: cleanupPending })");
  });

  it("adds the new RPC before switching callers and preserves the old service-only RPC", () => {
    const migration = repoFileSource(
      "supabase/migrations/20260802090000_security_callable_hardening.sql"
    );
    const normalizedMigration = migration.replace(/\s+/g, " ");

    expect(normalizedMigration).toContain(
      "create or replace function public.delete_user_account_for_service_role(p_user_id uuid)"
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.delete_user_account_for_service_role(uuid) from public, anon, authenticated, service_role"
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.delete_user_account_for_service_role(uuid) to service_role"
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.delete_user_account(uuid) from public, anon, authenticated"
    );
    expect(normalizedMigration).toContain(
      "grant execute on function public.delete_user_account(uuid) to service_role"
    );
    expect(migration).not.toMatch(/alter function public\.delete_user_account\(uuid\)\s+rename/i);
    expect(migration).not.toContain("drop function public.delete_user_account(uuid)");

    const queueWrite = migration.indexOf("insert into public.storage_cleanup_queue");
    const legacyDelete = migration.indexOf("perform public.delete_user_account(p_user_id)");
    expect(queueWrite).toBeGreaterThan(0);
    expect(legacyDelete).toBeGreaterThan(queueWrite);
    expect(normalizedMigration).toContain(
      "from public.get_delete_account_storage_objects(p_user_id) i"
    );
    expect(normalizedMigration).toContain("o.owner = p_user_id");
    expect(normalizedMigration).toContain("o.bucket_id <> 'service_care_evidence'");
    expect(normalizedMigration).toContain("for update skip locked");
    expect(normalizedMigration).toContain("claimed_at < now() - v_lease");
    expect(normalizedMigration).toContain("claim_token = gen_random_uuid()");
    expect(normalizedMigration).not.toContain("cron.schedule");
    expect(normalizedMigration).not.toContain("cron.unschedule");
    expect(normalizedMigration).not.toContain("net.http_post");
  });

  it("pins every verified client-callable SECURITY DEFINER function to trusted schemas", () => {
    const migration = repoFileSource(
      "supabase/migrations/20260802090000_security_callable_hardening.sql"
    );
    const sqlHarness = repoFileSource("supabase/tests/security_callable_hardening.sql");
    const normalizedMigration = migration.replace(/\s+/g, " ");

    for (const signature of [
      "check_and_increment_quota(text)",
      "enforce_map_alert_contract()",
      "get_quota_snapshot()",
      "guard_service_rank_weight()",
      "sync_service_rank_weight()",
    ]) {
      expect(normalizedMigration).toContain(
        `alter function public.${signature} set search_path = public, extensions;`
      );
      expect(sqlHarness).toContain(`public.${signature}`);
    }

    expect(migration).not.toContain("alter function public.refresh_subscription_quotas()");
  });

  it("carries executable database rollback and Storage API retry failure injection", () => {
    const sqlHarness = repoFileSource("supabase/tests/security_callable_hardening.sql");
    const processorTest = repoFileSource(
      "supabase/functions/process-storage-cleanup/processor.test.ts"
    );
    const processor = repoFileSource(
      "supabase/functions/process-storage-cleanup/processor.ts"
    );
    const worker = repoFileSource(
      "supabase/functions/process-storage-cleanup/index.ts"
    );
    const atomicFailureInjection = repoFileSource(
      "supabase/tests/delete_account_atomic_cleanup_failure_injection.sql"
    );

    expect(sqlHarness).toContain("injected_delete_failure");
    expect(sqlHarness).toContain("failed database deletion left an active cleanup row");
    expect(sqlHarness).toContain("successful database deletion did not leave durable cleanup work");
    expect(sqlHarness).toMatch(/rollback;\s*$/);
    expect(processorTest).toContain("injected_storage_api_failure");
    expect(processorTest).toContain("const retried = await processStorageCleanupRow");
    expect(processorTest).toContain(
      "authoritative delete-account inventory is not retained by stale references",
    );
    expect(processorTest).toContain("assertEquals(referenceChecks, 0)");
    expect(processorTest).toContain(
      "regulated Care evidence is retained even if an old delete-account row exists",
    );
    expect(processor).toContain("await dependencies.markFailure(");
    expect(processor).toContain("storageCleanupRetryAfter(message, now)");
    expect(processor).toContain("await dependencies.markProcessed(row, processedAt)");
    expect(processor).toContain('row.reason !== "delete_account"');
    expect(worker).toContain('"claim_storage_cleanup_queue"');
    expect(worker).not.toContain('.select("id,bucket,object_path,attempts,reason,created_at")');
    expect(worker).toContain('.eq("claim_token", targetRow.claim_token)');
    expect(atomicFailureInjection).toContain("injected_delete_failure");
    expect(atomicFailureInjection).toContain(
      "failed deletion left cleanup work outside its transaction",
    );
    expect(atomicFailureInjection).toContain(
      "successful deletion did not retain durable cleanup work",
    );
    expect(atomicFailureInjection).toContain(
      "production owner inventory was not mirrored",
    );
    expect(atomicFailureInjection).toContain(
      "regulated Care evidence entered account cleanup",
    );
    expect(atomicFailureInjection).toContain("active lease was claimed twice");
    expect(atomicFailureInjection).toContain(
      "expired lease was not recovered with a new token",
    );
    expect(atomicFailureInjection).toContain(
      "get_delete_account_storage_objects(p_user_id)",
    );
    expect(atomicFailureInjection).toMatch(/rollback;\s*$/);
  });

  it("revokes privileged RPCs and preserves the existing deletion blocker body", () => {
    const migration = repoFileSource(
      "supabase/migrations/20260801224000_release_rpc_and_account_deletion_hardening.sql"
    );

    expect(migration).toContain(
      "revoke execute on function public.delete_user_account(uuid) from public, anon, authenticated"
    );
    expect(migration).toContain(
      "revoke execute on function public.refresh_subscription_quotas() from public, anon, authenticated"
    );
    expect(migration).toContain(
      "revoke execute on function public.detach_delete_account_admin_refs(uuid) from public, anon, authenticated"
    );
    expect(migration).toContain("public._refresh_huddle_reward_progress(uuid)");
    expect(migration).toContain("public._huddle_rewards_refresh_effective_tier(uuid)");
    expect(migration).toContain("public._record_huddle_reward_campaign_friend_scope(uuid, uuid, boolean, timestamptz)");
    expect(migration).toContain("public.process_verification_nudges()");
    expect(migration).toContain("public._huddle_rewards_is_admin(uuid)");
    expect(migration).toContain("public._huddle_rewards_paid_tier(uuid)");
    expect(migration).toContain("public._qms_effective_tier(uuid)");
    expect(migration).toContain("rename to get_delete_account_blocker_legacy_20260801224000");
    expect(migration).toContain("lower(coalesce(sc.status, '')) = 'booked'");
    expect(migration).toContain("('awaiting_handoff', 'pin_shared')");
    expect(migration).toContain(
      "return public.get_delete_account_blocker_legacy_20260801224000(p_user_id)"
    );
  });

  it("keeps passive Care admin history from blocking deletion but blocks unresolved money states", () => {
    const migration = repoFileSource("supabase/migrations/20260605143000_delete_account_care_payment_blockers.sql");

    expect(migration).toContain("completed_pending_payout");
    expect(migration).toContain("open_care_dispute");
    expect(migration).toContain("pending_customer_refund");
    expect(migration).toContain("detach_delete_account_admin_refs");
    expect(migration).toContain("set synced_by_admin_id = null");
    expect(migration).toContain("rename to delete_user_account_legacy_20260605143000");
  });

  it("uses delete-account-specific copy and inline Support link on cleanup failures", () => {
    const screen = repoFileSource("app/src/screens/NativeProfileSummaryScreen.tsx");
    const navigator = repoFileSource("app/src/navigation/RootNavigator.tsx");

    expect(screen).toContain('JSON.stringify({ action: "confirm_delete" })');
    expect(navigator).toContain('body: { action: "confirm_delete" }');
    expect(screen).toContain("Care / Payment History records");
    expect(screen).toContain("DELETE_ACCOUNT_SUPPORT_CODES");
    expect(screen).toContain("Contact Support");
    expect(screen).toContain("onOpenSupport?.()");
    expect(nativeSafeErrorCopy("pending_provider_payout")).toContain("pending Care payout");
    expect(nativeSafeErrorCopy("delete_account_cleanup_failed")).toContain("blocked the cleanup");
  });
});
