import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Care profile ownership and deletion safety contract", () => {
  const migration = source("supabase/migrations/20260812130130_lock_care_profile_ownership_and_deletion.sql");

  it("makes Care-profile ownership immutable for every database role", () => {
    expect(migration).toContain("prevent_pet_care_profile_owner_reassignment");
    expect(migration).toContain("before update of user_id on public.pet_care_profiles");
    expect(migration).toContain("care_profile_owner_immutable");
  });

  it("permits deletion only within the exact account-deletion transaction and records it", () => {
    expect(migration).toContain("guard_pet_care_profile_deletion");
    expect(migration).toContain("care_profile_delete_requires_account_deletion");
    expect(migration).toContain("set_config('app.account_delete_user_id', p_user_id::text, true)");
    expect(migration).toContain("pet_care_profile_lifecycle_audit");
  });

  it("repairs the known cross-profile contamination before installing the immutable boundary", () => {
    expect(migration).toContain("e7e1bfac-26da-4ec1-a14d-73807ade579d");
    expect(migration).toContain("ac72fbb2-c4a9-4066-9775-111dae2da5a1");
    expect(migration.indexOf("ownership_restored")).toBeLessThan(migration.indexOf("trg_prevent_pet_care_profile_owner_reassignment"));
  });

  it("retires the former destructive UAT seed paths", () => {
    expect(source("scripts/seed_uat_40_accounts.mjs")).toContain("is retired");
    expect(source("scripts/seed_uat_40_accounts.sql")).toContain("performs no mutation");
  });
});
