import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const bannedSignInGuard = ["Please", " sign", " in", " to", " continue"].join("");
const bannedGatePath = ["/edit", "-profile", "?gate=1"].join("");
const signupStorageKey = ["huddle", "_signup", "_v2"].join("");
const passwordToken = "password";

const rules = [
  {
    name: "no_signup_signin_guard_text",
    cmd: `grep -Rni "${bannedSignInGuard}" src/pages/signup || true`,
  },
  {
    name: "signup_name_no_profiles_writes",
    cmd: 'grep -Rni -E "from\\(\\\"profiles\\\"\\)\\.(update|upsert)" src/pages/signup/SignupName.tsx || true',
  },
  {
    name: "signup_name_no_auth_session_gating",
    cmd: 'grep -Rni -E "auth\\.getUser\\(|auth\\.getSession\\(" src/pages/signup/SignupName.tsx || true',
  },
  {
    name: "no_gate_query_path",
    cmd: `grep -Rni "${bannedGatePath.replace("?", "\\\\?")}" src scripts || true`,
  },
  {
    name: "no_password_in_signup_localstorage_payload",
    cmd: `grep -Rni -E "${signupStorageKey}.*${passwordToken}|${passwordToken}.*${signupStorageKey}" src scripts || true`,
  },
  {
    name: "no_stub_copy_not_available_in_this_build",
    cmd: 'grep -Rni "not available in this build" src || true',
  },
];

function runCmd(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function findProfileUserIdWrites() {
  const offenders = [];
  const files = collectSourceFiles("src");
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    let found = false;
    for (let i = 0; i < lines.length; i += 1) {
      if (!/from\(\s*["']profiles["']\s*\)/.test(lines[i])) continue;
      let block = lines[i];
      for (let j = i + 1; j < lines.length && j < i + 80; j += 1) {
        block += `\n${lines[j]}`;
        if (/\)\s*;/.test(lines[j])) break;
      }
      if (/\.(insert|upsert|update)\s*\(/.test(block) && /user_id\s*:/.test(block)) {
        found = true;
        break;
      }
    }
    if (found) {
      offenders.push(file);
    }
  }
  return offenders;
}

function getProfileColumnsFromSource() {
  const source = fs.readFileSync("src/contexts/AuthContext.tsx", "utf8");
  const match = source.match(/const profileColumns = \[(.*?)\] as const;/s);
  if (!match) {
    throw new Error("profileColumns array not found in AuthContext.tsx");
  }
  const cols = [...match[1].matchAll(/"([a-z0-9_]+)"/gi)].map((m) => m[1]);
  return [...new Set(cols)];
}

function getDbProfileColumns() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required for schema gate");
  }
  const sql = `
select column_name
from information_schema.columns
where table_schema='public' and table_name='profiles'
order by ordinal_position;`;
  const escaped = sql.replace(/"/g, '\\"');
  const output = execSync(`psql "${dbUrl}" -P pager=off -At -F ',' -c "${escaped}"`, { encoding: "utf8" }).trim();
  return new Set(output.split(/\r?\n/).map((v) => v.trim()).filter(Boolean));
}

let failed = false;

for (const rule of rules) {
  const output = runCmd(rule.cmd);
  if (output) {
    failed = true;
    console.error(`FAIL ${rule.name}`);
    console.error(output);
  } else {
    console.log(`PASS ${rule.name}`);
  }
}

const profileUserIdOffenders = findProfileUserIdWrites();
if (profileUserIdOffenders.length) {
  failed = true;
  console.error("FAIL no_profiles_user_id_writes");
  for (const offender of profileUserIdOffenders) {
    console.error(offender);
  }
} else {
  console.log("PASS no_profiles_user_id_writes");
}

try {
  const sourceCols = getProfileColumnsFromSource();
  const dbCols = getDbProfileColumns();
  const missing = sourceCols.filter((col) => !dbCols.has(col));
  if (missing.length) {
    failed = true;
    console.error("FAIL authcontext_profile_select_schema_match");
    console.error(`Missing columns in DB: ${missing.join(", ")}`);
  } else {
    console.log("PASS authcontext_profile_select_schema_match");
  }
} catch (error) {
  failed = true;
  console.error("FAIL authcontext_profile_select_schema_match");
  console.error(error instanceof Error ? error.message : String(error));
}

if (failed) {
  process.exit(1);
}

console.log("PASS signup_gate_check_complete");
