#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function trySh(cmd) {
  try {
    return { ok: true, out: sh(cmd) };
  } catch (err) {
    return { ok: false, out: String(err?.message || err || "command_failed") };
  }
}

const issues = [];
const warnings = [];

const secretFilesCheck = trySh(
  `cd "${process.cwd()}" && rg --files -g "supabase/functions/**/.env" -g "supabase/functions/**/.env.*"`
);
if (secretFilesCheck.ok && secretFilesCheck.out) {
  issues.push(`Secret env files present:\n${secretFilesCheck.out}`);
}

const wsTokenCheck = trySh(
  `cd "${process.cwd()}" && rg -n "new WebSocket\\(.*token=|\\?token=\\$\\{|\\?token=" src`
);
if (wsTokenCheck.ok && wsTokenCheck.out) {
  issues.push(`WebSocket token-in-URL pattern found:\n${wsTokenCheck.out}`);
}

const envRes = trySh(`cd "${process.cwd()}" && npx supabase status -o env`);
if (!envRes.ok) {
  issues.push("Could not read Supabase local env from `supabase status -o env`.");
} else {
  const dbUrlLine = envRes.out
    .split(/\r?\n/)
    .find((line) => line.startsWith("DB_URL="));
  const dbUrl = dbUrlLine?.slice("DB_URL=".length).replace(/^"|"$/g, "");
  if (!dbUrl) {
    issues.push("DB_URL missing from Supabase status output.");
  } else {
    const qRls = `
      select relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and c.relname not in ('spatial_ref_sys')
        and c.relrowsecurity = false
      order by relname;`;
    const rlsOff = trySh(`psql "${dbUrl}" -P pager=off -At -c "${qRls.replace(/\n/g, " ")}"`);
    if (rlsOff.ok && rlsOff.out) {
      issues.push(`Public tables with RLS disabled:\n${rlsOff.out}`);
    }

    const qNoPolicy = `
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public'
        and c.relkind='r'
        and c.relname not in ('spatial_ref_sys')
        and c.relrowsecurity = true
        and not exists (
          select 1 from pg_policies p
          where p.schemaname='public'
            and p.tablename=c.relname
        )
      order by c.relname;`;
    const noPolicy = trySh(`psql "${dbUrl}" -P pager=off -At -c "${qNoPolicy.replace(/\n/g, " ")}"`);
    if (noPolicy.ok && noPolicy.out) {
      issues.push(`RLS enabled but no policies found:\n${noPolicy.out}`);
    }

    const qSecDefAnon = `
      select n.nspname||'.'||p.proname
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.prosecdef = true
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by 1;`;
    const secDefAnon = trySh(`psql "${dbUrl}" -P pager=off -At -c "${qSecDefAnon.replace(/\n/g, " ")}"`);
    if (secDefAnon.ok && secDefAnon.out) {
      warnings.push(`SECURITY DEFINER functions executable by anon:\n${secDefAnon.out}`);
    }

    const qIndexHints = `
      with common_cols as (
        select unnest(array['user_id','tenant_id','organization_id','topic','chat_id']) as col
      ),
      policy_expr as (
        select
          tablename,
          coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
        from pg_policies
        where schemaname='public'
      ),
      policy_cols as (
        select distinct pe.tablename, c.col
        from policy_expr pe
        join common_cols c
          on pe.expr ~ ('(^|[^a-zA-Z0-9_])' || c.col || '([^a-zA-Z0-9_]|$)')
      ),
      indexed as (
        select t.relname as tablename, a.attname as col
        from pg_index i
        join pg_class t on t.oid=i.indrelid
        join pg_namespace n on n.oid=t.relnamespace
        join pg_attribute a on a.attrelid=t.oid and a.attnum = any(i.indkey)
        where n.nspname='public'
      )
      select distinct p.tablename||'.'||p.col
      from policy_cols p
      left join indexed i on i.tablename=p.tablename and i.col=p.col
      where i.col is null
      order by 1;`;
    const idxHints = trySh(`psql "${dbUrl}" -P pager=off -At -c "${qIndexHints.replace(/\n/g, " ")}"`);
    if (idxHints.ok && idxHints.out) {
      warnings.push(`Potential missing policy-column indexes:\n${idxHints.out}`);
    }
  }
}

if (issues.length === 0) {
  console.log("PASS security posture baseline checks");
} else {
  console.log("FAIL security posture checks:");
  for (const issue of issues) console.log(`\n- ${issue}`);
}

if (warnings.length > 0) {
  console.log("\nWARNINGS:");
  for (const warning of warnings) console.log(`\n- ${warning}`);
}

process.exit(issues.length > 0 ? 1 : 0);
