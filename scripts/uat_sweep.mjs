import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function extractEnvFromBackendEnvMd() {
  const p = path.join(process.cwd(), "Backend.env.md");
  const txt = fs.readFileSync(p, "utf8");
  const get = (key) => {
    const m = txt.match(new RegExp(`^${key}=\"([^\"]+)\"`, "m"));
    return m ? m[1] : null;
  };
  const url = get("VITE_SUPABASE_URL");
  const anon = get("VITE_SUPABASE_ANON_KEY");
  const service = get("SUPABASE_SERVICE_ROLE_KEY");
  return { url, anon, service };
}

function nowTag() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}`;
}

async function main() {
  const { url, anon, service } = extractEnvFromBackendEnvMd();
  if (!url || !anon || !service) {
    console.error("Missing Supabase config in Backend.env.md");
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tag = nowTag();
  const pw = "Test1234!Test1234!";
  const emails = {
    free: `free+uat-${tag}@huddle.test`,
    premium: `prem+uat-${tag}@huddle.test`,
    gold: `gold+uat-${tag}@huddle.test`,
    family: `fam+uat-${tag}@huddle.test`,
  };

  const created = {};
  for (const [k, email] of Object.entries(emails)) {
    const res = await admin.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
      user_metadata: { uat_role: k },
    });
    if (res.error) throw res.error;
    created[k] = res.data.user.id;
  }

  const upsertProfile = async (id, tier, display_name, legal_name, phone) => {
    const r = await admin
      .from("profiles")
      .upsert(
        {
          id,
          tier,
          display_name,
          legal_name,
          phone,
          onboarding_completed: true,
          map_visible: true,
          location_name: "Central, HK",
        },
        { onConflict: "id" }
      )
      .select("id,tier,display_name")
      .maybeSingle();
    if (r.error) throw r.error;
  };

  await upsertProfile(created.free, "free", "Free User", "Free User", "+85200000001");
  await upsertProfile(created.premium, "premium", "Premium User", "Premium User", "+85200000002");
  await upsertProfile(created.gold, "gold", "Gold User", "Gold User", "+85200000003");
  await upsertProfile(created.family, "free", "Family Member", "Family Member", "+85200000004");

  // Link family member to gold (accepted)
  {
    const ins = await admin
      .from("family_members")
      .insert({
        inviter_user_id: created.gold,
        invitee_user_id: created.family,
        status: "accepted",
      })
      .select("id")
      .maybeSingle();
    if (ins.error) throw ins.error;
  }

  // Ensure quota rows exist for pool owners.
  for (const id of [created.free, created.premium, created.gold]) {
    const q = await admin.from("user_quotas").upsert({ user_id: id }, { onConflict: "user_id" });
    if (q.error) throw q.error;
  }

  // Buckets check (best-effort).
  const buckets = await admin.storage.listBuckets();
  const bucketNames = buckets.data?.map((b) => b.name) ?? [];

  // Tables check (best-effort). If a table doesn't exist, `.from()` will return an error.
  const tableChecks = {};
  const checkTable = async (table, col = "id") => {
    const r = await admin.from(table).select(col, { head: true, count: "exact" });
    tableChecks[table] = r.error ? { ok: false, error: r.error.message } : { ok: true, count: r.count ?? null };
  };
  await checkTable("user_quotas", "user_id");
  await checkTable("consent_logs", "id");
  await checkTable("notifications", "id");
  await checkTable("family_members", "id");
  await checkTable("reminders", "id");

  // Helper: sign in as user and run quota calls.
  const makeUserClient = () =>
    createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  async function signInAndRun(email, fn) {
    const client = makeUserClient();
    const s = await client.auth.signInWithPassword({ email, password: pw });
    if (s.error) throw s.error;
    try {
      return await fn(client);
    } finally {
      await client.auth.signOut();
    }
  }

  async function countAllowed(client, action, times) {
    let ok = 0;
    for (let i = 0; i < times; i++) {
      const r = await client.rpc("check_and_increment_quota", { action_type: action });
      if (r.data === true) ok += 1;
    }
    return ok;
  }

  const results = {};

  results.free_thread = await signInAndRun(emails.free, (c) => countAllowed(c, "thread_post", 4));
  results.premium_thread = await signInAndRun(emails.premium, (c) => countAllowed(c, "thread_post", 16));
  results.gold_thread = await signInAndRun(emails.gold, (c) => countAllowed(c, "thread_post", 20));
  results.family_thread = await signInAndRun(emails.family, (c) => countAllowed(c, "thread_post", 11));

  results.free_discovery = await signInAndRun(emails.free, (c) => countAllowed(c, "discovery_profile", 41));
  // Contract override: Premium/Gold discovery is unlimited (QMS should never deny).
  results.premium_discovery = await signInAndRun(emails.premium, (c) => countAllowed(c, "discovery_profile", 200));
  results.gold_discovery = await signInAndRun(emails.gold, (c) => countAllowed(c, "discovery_profile", 200));

  results.free_ai_vet = await signInAndRun(emails.free, (c) => countAllowed(c, "ai_vet_upload", 1));
  results.premium_ai_vet = await signInAndRun(emails.premium, (c) => countAllowed(c, "ai_vet_upload", 11));
  results.gold_ai_vet = await signInAndRun(emails.gold, (c) => countAllowed(c, "ai_vet_upload", 21));

  results.gold_priority = await signInAndRun(emails.gold, (c) => countAllowed(c, "ai_vet_priority", 6));
  results.gold_star = await signInAndRun(emails.gold, (c) => countAllowed(c, "star", 11));

  // Broadcasts are enforced on insert triggers; test via direct quota counter.
  results.free_broadcast = await signInAndRun(emails.free, (c) => countAllowed(c, "broadcast_alert", 4));

  console.log(
    JSON.stringify(
      {
        tag,
        users: { emails, ids: created },
        buckets: bucketNames,
        tables: tableChecks,
        quota_results: results,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
