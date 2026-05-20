import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const TARGET_EMAILS = ["twenty_illkid@msn.com", "fongpoman114@gmail.com"];

const argv = new Set(process.argv.slice(2));
if (!argv.has("--yes")) {
  console.error("Refusing to run without --yes. Usage: node scripts/reset_accounts.mjs --yes");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if ((!SUPABASE_URL || !SERVICE_ROLE_KEY) && !DATABASE_URL) {
  console.error("Missing service-role env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) and DATABASE_URL fallback.");
  process.exit(1);
}

const supabase = SUPABASE_URL && SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
}) : null;

const TABLE_DELETES = [
  ["support_requests", "user_id"],
  ["notification_preferences", "user_id"],
  ["verification_uploads", "user_id"],
  ["notifications", "user_id"],
  ["notification_logs", "user_id"],
  ["admin_audit_logs", "admin_id"],
  ["admin_audit_logs", "target_user_id"],
  ["broadcast_alerts", "creator_id"],
  ["broadcast_alerts", "user_id"],
  ["map_alert_notification_queue", "recipient_user_id"],
  ["map_alert_notification_queue", "creator_user_id"],
  ["map_alert_recipients", "user_id"],
  ["map_alert_threads", "creator_id"],
  ["pins", "user_id"],
  ["user_locations", "user_id"],
  ["chat_messages", "sender_id"],
  ["chat_room_members", "user_id"],
  ["chat_memberships", "user_id"],
  ["chats", "created_by"],
  ["thread_comments", "user_id"],
  ["threads", "user_id"],
  ["reports", "reporter_id"],
  ["reports", "reported_user_id"],
  ["bookings", "owner_id"],
  ["bookings", "requester_id"],
  ["marketplace_bookings", "owner_id"],
  ["marketplace_bookings", "requester_id"],
  ["transactions", "user_id"],
  ["family_members", "inviter_user_id"],
  ["family_members", "invitee_user_id"],
  ["family_invites", "inviter_user_id"],
  ["family_invites", "invitee_user_id"],
  ["pets", "owner_id"],
  ["profiles", "id"],
  ["profiles", "user_id"],
];

async function listAllUsers() {
  if (!supabase) return [];
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

function runPsql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-At", "-P", "pager=off", "-c", sql], { encoding: "utf8" }).trim();
}

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function cleanupBySql(email) {
  if (!DATABASE_URL) return null;
  const uid = runPsql(`select id::text from auth.users where lower(email)=lower(${sqlString(email)}) limit 1;`);
  if (!uid) return { status: "not_found", email };

  const summary = [];
  for (const [table, column] of TABLE_DELETES) {
    const exists = runPsql(
      `select count(*) from information_schema.columns where table_schema='public' and table_name=${sqlString(
        table
      )} and column_name=${sqlString(column)};`
    );
    if (exists !== "1") continue;
    const count = runPsql(
      `with d as (delete from public.${table} where ${column}=${sqlString(uid)} returning 1) select count(*) from d;`
    );
    summary.push(`${table}.${column}:${count || "0"}`);
  }

  const authDeleted = runPsql(
    `with d as (delete from auth.users where id=${sqlString(uid)} returning 1) select count(*) from d;`
  );
  summary.push(`auth.users.id:${authDeleted || "0"}`);

  return { status: "deleted", email, userId: uid, summary };
}

async function deleteByColumn(table, column, userId) {
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq(column, userId);
  if (!error) return { count: count ?? 0, skipped: false };

  const msg = error.message || "";
  if (
    msg.includes("relation") && msg.includes("does not exist") ||
    msg.includes("Could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes(`column ${column} does not exist`)
  ) {
    return { count: 0, skipped: true };
  }

  throw new Error(`${table}.${column}: ${msg}`);
}

async function run() {
  console.log("reset_accounts:start");
  console.log(`targets=${TARGET_EMAILS.join(",")}`);
  const users = await listAllUsers();

  for (const email of TARGET_EMAILS) {
    const user = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!user) {
      const sqlResult = cleanupBySql(email);
      if (sqlResult?.status === "deleted") {
        console.log(`email=${email} user_id=${sqlResult.userId} deleted=${sqlResult.summary.join("|")} via=sql_fallback`);
      } else {
        console.log(`email=${email} status=not_found`);
      }
      continue;
    }

    const userId = user.id;
    const summary = [];

    for (const [table, column] of TABLE_DELETES) {
      const result = await deleteByColumn(table, column, userId);
      if (!result.skipped) {
        summary.push(`${table}.${column}:${result.count}`);
      }
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      throw new Error(`auth.users(${userId}) delete failed: ${authDeleteError.message}`);
    }

    console.log(`email=${email} user_id=${userId} deleted=${summary.join("|")}`);
  }

  console.log("reset_accounts:done");
}

run().catch((error) => {
  console.error("reset_accounts:error", error?.message || error);
  process.exit(1);
});
