import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = {
  migration: join(root, "supabase/migrations/20260518110000_credential_evidence_framework.sql"),
  edge: join(root, "supabase/functions/credential-registry-check/index.ts"),
  appSrc: join(root, "app/src"),
};

const migration = readFileSync(files.migration, "utf8");
const edge = readFileSync(files.edge, "utf8");
const combined = `${migration}\n${edge}`;
const submitFunctionBody = migration.match(
  /create or replace function public\.submit_professional_credential[\s\S]*?create or replace function public\.get_my_professional_credentials/,
)?.[0] || "";
const publicBadgeFunctionBody = migration.match(
  /create or replace function public\.get_public_provider_credential_badges[\s\S]*?revoke all on table public\.credential_registry_sources/,
)?.[0] || "";

const checks = [
  {
    name: "status enum has only supported states",
    pass:
      migration.includes("'self_declared'") &&
      migration.includes("'check_pending'") &&
      migration.includes("'registry_matched'") &&
      migration.includes("'certificate_matched'") &&
      migration.includes("'organization_matched'") &&
      migration.includes("'directory_matched'") &&
      migration.includes("'unable_to_verify'") &&
      !migration.includes("'rejected'") &&
      !migration.includes("'approved'") &&
      !migration.includes(`pending ${"manual"} review`),
  },
  {
    name: "verification methods exclude manual/admin/review",
    pass:
      migration.includes("'none'") &&
      migration.includes("'registry'") &&
      migration.includes("'certificate'") &&
      migration.includes("'organization'") &&
      migration.includes("'directory'") &&
      !migration.includes("'manual'") &&
      !migration.includes("'admin'") &&
      !migration.includes("'review'"),
  },
  {
    name: "directory status has Directory matched copy",
    pass:
      migration.includes("when 'directory_matched' then 'Directory matched'") &&
      migration.includes("'Directory matched'"),
  },
  {
    name: "submit only saves and does not trigger external lookup",
    pass:
      migration.includes("create or replace function public.submit_professional_credential") &&
      !/net\.http/i.test(submitFunctionBody) &&
      !/credential-registry-check/i.test(submitFunctionBody),
  },
  {
    name: "public badge RPC returns safe columns only",
    pass:
      migration.includes("returns table(") &&
      migration.includes("credential_type text") &&
      migration.includes("public_label text") &&
      migration.includes("source_type text") &&
      migration.includes("source_name text") &&
      migration.includes("checked_at timestamptz") &&
      migration.includes("masked_identifier text") &&
      migration.includes("caveat text") &&
      !/document_storage_path/i.test(publicBadgeFunctionBody) &&
      !/raw_result_redacted/i.test(publicBadgeFunctionBody) &&
      !/lookup_inputs/i.test(publicBadgeFunctionBody),
  },
  {
    name: "edge rejects bulk lookup",
    pass:
      edge.includes("bulk_lookup_rejected") &&
      edge.includes("Array.isArray(parsedBody)") &&
      edge.includes("Array.isArray(body.credential_id)") &&
      edge.includes("Array.isArray(body.credential_ids)"),
  },
  {
    name: "edge rate limits ip user and credential",
    pass:
      edge.includes("credential-registry-check:ip") &&
      edge.includes("credential-registry-check:user") &&
      edge.includes("credential-registry-check:credential"),
  },
  {
    name: "unsupported source rejected before configured adapter",
    pass:
      edge.includes("unsupported_credential_source") &&
      edge.includes("adapter_not_configured") &&
      edge.includes("case \"acnc_registered_charities\""),
  },
  {
    name: "source unavailable maps to unable_to_verify",
    pass:
      edge.includes('"unable_to_verify"') &&
      edge.includes('"source_unavailable"'),
  },
  {
    name: "raw result is redacted before storage",
    pass:
      edge.includes("p_raw_result_redacted") &&
      edge.includes('stored: "redacted"') &&
      !edge.includes("raw_result:"),
  },
  {
    name: "profiles.is_verified is untouched",
    pass: !combined.includes("profiles.is_verified") && !combined.includes("is_verified ="),
  },
  {
    name: "forbidden public claims absent from touched files",
    pass: !/Verified Professional|Globally verified|Huddle guarantees|Licensed everywhere|Background checked/i.test(combined),
  },
];

const failures = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
