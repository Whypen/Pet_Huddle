import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envFiles = [
  path.resolve("Backend.env.md"),
  path.resolve("../Backend logins.env.md"),
];
const env = {};
for (const envPath of envFiles) {
  if (!fs.existsSync(envPath)) continue;
  const envRaw = fs.readFileSync(envPath, "utf8");
  for (const line of envRaw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^`|`$/g, "").replace(/^"|"$/g, "");
    if (!key) continue;
    env[key] = value;
  }
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Backend.env.md");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const run = async () => {
  const purgeTables = [
    "chat_messages",
    "chat_room_members",
    "chat_rooms",
    "marketplace_bookings",
    "family_invites",
    "map_alerts",
    "transactions",
    "notification_logs",
    "scan_rate_limits",
    "triage_cache",
    "admin_audit_logs",
    "pets",
    "profiles",
  ];

  for (const table of purgeTables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .not("id", "is", null);

    if (error) {
      if (
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache") ||
        error.message?.includes("Could not find the table")
      ) {
        continue;
      }
      console.error(`Failed to delete ${table}:`, error.message);
      process.exit(1);
    }
    console.log(`Deleted ${table}: ${count ?? 0}`);
  }

  let deleted = 0;
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Failed to list auth users:", error.message);
      process.exit(1);
    }
    const users = data?.users || [];
    if (users.length === 0) break;

    for (const user of users) {
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
      if (delError) {
        console.error(`Failed to delete auth user ${user.id}:`, delError.message);
        process.exit(1);
      }
      deleted += 1;
    }

    if (users.length < perPage) break;
    page += 1;
  }

  console.log(`Deleted auth users: ${deleted}`);
};

run().catch((err) => {
  console.error("Cleanup failed:", err?.message || err);
  process.exit(1);
});
