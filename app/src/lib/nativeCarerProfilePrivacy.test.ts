import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NATIVE_CARER_OWNER_PRIVATE_COLUMNS,
  nativeCarerProfileSelectColumns,
} from "./nativeCarerProfilePrivacy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const screenSource = () => readFileSync(resolve(root, "app/src/screens/NativeCarerProfileScreen.tsx"), "utf8");
const migrationSource = () => readFileSync(resolve(root, "supabase/migrations/20260803231500_pet_care_profile_stripe_column_privacy.sql"), "utf8");

describe("native carer profile Stripe privacy", () => {
  it("excludes every private Stripe field from an other-user profile selection", () => {
    const publicColumns = nativeCarerProfileSelectColumns().split(",");
    for (const privateColumn of NATIVE_CARER_OWNER_PRIVATE_COLUMNS) {
      expect(publicColumns).not.toContain(privateColumn);
    }
  });

  it("keeps every wallet and onboarding field in the owner-only RPC", () => {
    const sql = migrationSource();
    for (const privateColumn of NATIVE_CARER_OWNER_PRIVATE_COLUMNS) {
      expect(sql).toMatch(new RegExp(`returns table \\([\\s\\S]*?\\b${privateColumn}\\b[\\s\\S]*?\\)`, "i"));
    }
  });

  it("selects owner-private fields only when the viewed profile belongs to the session user", () => {
    const source = screenSource();
    expect(source).toMatch(/fetchNativeCarerProfileRow\(viewedUserId, effectiveAccessToken, \{ force: true, includeOwnerPrivateFields: isOwnCarerProfile \}\)/);
    expect(source).toMatch(/nativeCarerProfileSelectColumns\(\)/);
    expect(source).toMatch(/rpc\/get_my_pet_care_stripe_fields/);
  });

  it("enforces private-column denial and self-only RPC ownership in SQL", () => {
    const sql = migrationSource();
    expect(sql).toMatch(/revoke select on table public\.pet_care_profiles from public, anon, authenticated/i);
    for (const privateColumn of NATIVE_CARER_OWNER_PRIVATE_COLUMNS) {
      expect(sql).not.toMatch(new RegExp(`grant select \\([\\s\\S]*?\\b${privateColumn}\\b[\\s\\S]*?\\) on table`, "i"));
    }
    expect(sql).toMatch(/create or replace function public\.get_my_pet_care_stripe_fields\(\)[\s\S]*security definer/i);
    expect(sql).toMatch(/pc\.user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/revoke all on function public\.get_my_pet_care_stripe_fields\(\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.get_my_pet_care_stripe_fields\(\) to authenticated/i);
  });
});
