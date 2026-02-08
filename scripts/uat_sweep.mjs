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
  const step = (msg) => console.error(`[uat] ${msg}`);
  step("start");
  const { url, anon, service } = extractEnvFromBackendEnvMd();
  if (!url || !anon || !service) {
    console.error("Missing Supabase config in Backend.env.md");
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tag = nowTag();
  step(`tag=${tag}`);
  const pw = "Test1234!Test1234!";
  const emails = {
    free: `free+uat-${tag}@huddle.test`,
    premium: `prem+uat-${tag}@huddle.test`,
    gold: `gold+uat-${tag}@huddle.test`,
    family: `fam+uat-${tag}@huddle.test`,
  };

  const created = {};
  step("creating users");
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
  step("users created");

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

  step("upserting profiles");
  await upsertProfile(created.free, "free", "Free User", "Free User", "+85200000001");
  await upsertProfile(created.premium, "premium", "Premium User", "Premium User", "+85200000002");
  await upsertProfile(created.gold, "gold", "Gold User", "Gold User", "+85200000003");
  await upsertProfile(created.family, "free", "Family Member", "Family Member", "+85200000004");
  step("profiles upserted");

  // Link family member to gold (accepted)
  {
    step("linking family");
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
    step("family linked");
  }

  // Ensure quota rows exist for pool owners.
  step("ensuring quota rows");
  for (const id of [created.free, created.premium, created.gold]) {
    const q = await admin.from("user_quotas").upsert({ user_id: id }, { onConflict: "user_id" });
    if (q.error) throw q.error;
  }
  step("quota rows ensured");

  // Buckets check (best-effort).
  step("checking buckets");
  const buckets = await admin.storage.listBuckets();
  const bucketNames = buckets.data?.map((b) => b.name) ?? [];
  step(`buckets=${bucketNames.length}`);

  // Tables check (best-effort). If a table doesn't exist, `.from()` will return an error.
  step("checking tables");
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
  step("tables checked");

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

  // v1.9 perks: threads Free 1/day, Premium 5/day, Gold 20/day (pooled).
  step("testing threads quota");
  results.free_thread = await signInAndRun(emails.free, (c) => countAllowed(c, "thread_post", 2));
  results.premium_thread = await signInAndRun(emails.premium, (c) => countAllowed(c, "thread_post", 6));
  // Pool proof: Gold uses 15, family uses 6 -> family should allow 5 (15+5=20 total).
  results.gold_thread = await signInAndRun(emails.gold, (c) => countAllowed(c, "thread_post", 15));
  results.family_thread = await signInAndRun(emails.family, (c) => countAllowed(c, "thread_post", 6));
  step("threads quota done");

  step("testing discovery quota");
  results.free_discovery = await signInAndRun(emails.free, (c) => countAllowed(c, "discovery_profile", 41));
  // Contract override: Premium/Gold discovery is unlimited (QMS should never deny).
  results.premium_discovery = await signInAndRun(emails.premium, (c) => countAllowed(c, "discovery_profile", 80));
  results.gold_discovery = await signInAndRun(emails.gold, (c) => countAllowed(c, "discovery_profile", 80));
  step("discovery quota done");

  // v1.9 perks: Media (images) Free 0/day, Premium 10/day, Gold 50/day.
  step("testing media quota");
  results.free_media = await signInAndRun(emails.free, (c) => countAllowed(c, "media", 1));
  results.premium_media = await signInAndRun(emails.premium, (c) => countAllowed(c, "media", 11));
  results.gold_media = await signInAndRun(emails.gold, (c) => countAllowed(c, "media", 51));
  step("media quota done");

  // v1.9 perks: Stars Gold 3/cycle.
  step("testing stars quota");
  results.gold_star = await signInAndRun(emails.gold, (c) => countAllowed(c, "star", 4));
  step("stars quota done");

  // Broadcasts are enforced on insert triggers (weekly): Free 5/week, Premium/Gold 20/week.
  async function countBroadcastInserts(email, times, opts = {}) {
    return await signInAndRun(email, async (c) => {
      const uid = (await c.auth.getUser()).data.user.id;
      let ok = 0;
      for (let i = 0; i < times; i++) {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        const ins = await c
          .from("map_alerts")
          .insert({
            creator_id: uid,
            latitude: 22.2828,
            longitude: 114.1583,
            alert_type: "Stray",
            description: `uat broadcast ${i}`,
            photo_url: null,
            range_meters: 2000,
            expires_at: expiresAt,
          })
          .select("id")
          .maybeSingle();
        if (!ins.error) {
          ok += 1;
          continue;
        }
        const msg = String(ins.error.message || "").toLowerCase();
        if (msg.includes("quota_exceeded")) break;
        throw ins.error;
      }
      return ok;
    });
  }

  step("testing broadcast quota");
  results.free_broadcast = await countBroadcastInserts(emails.free, 6);
  step("broadcast quota done");

  // Add-on behavior: +1 broadcast token (72h/20km). Grant 1 token to Free user and allow 6th insert.
  step("testing broadcast add-on token");
  await admin
    .from("user_quotas")
    .update({ extra_broadcast_72h: 1, broadcast_alerts_week: 0, broadcast_week_used: 0, week_start: new Date().toISOString().slice(0, 10) })
    .eq("user_id", created.free);
  results.free_broadcast_plus_addon = await countBroadcastInserts(emails.free, 6);
  step("broadcast add-on done");

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
