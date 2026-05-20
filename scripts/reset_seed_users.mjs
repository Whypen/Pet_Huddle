import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const TARGET_DELETE = ['twenty_illkid@msn.com', 'fongpoman114@gmail.com'];
const DEMO_USERS = [
  { email: 'demofree@local.test', password: 'DemoPass!1234', display: 'DemoFree', legal: 'Demo Free', social: 'demo_free', tier: 'free', verification: 'unverified', lat: 22.2819, lng: 114.1589 },
  { email: 'demoplus@local.test', password: 'DemoPass!1234', display: 'DemoPlus', legal: 'Demo Plus', social: 'demo_plus', tier: 'plus', verification: 'verified', lat: 22.2824, lng: 114.1594 },
  { email: 'demogold@local.test', password: 'DemoPass!1234', display: 'DemoGold', legal: 'Demo Gold', social: 'demo_gold', tier: 'gold', verification: 'verified', lat: 22.3300, lng: 114.2000 },
];

function envFromStatus() {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) {
      env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
    }
  }
  return env;
}

async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return users;
}

async function ensureUser(admin, cfg) {
  const all = await listAllUsers(admin);
  let user = all.find((u) => (u.email || '').toLowerCase() === cfg.email.toLowerCase());
  if (!user) {
    const created = await admin.auth.admin.createUser({ email: cfg.email, password: cfg.password, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password: cfg.password, email_confirm: true });
  }
  return user.id;
}

async function main() {
  const env = envFromStatus();
  const apiUrl = env.API_URL;
  const dbUrl = env.DB_URL;
  if (!apiUrl?.includes('127.0.0.1:54321') || !dbUrl?.includes('127.0.0.1:54322')) {
    throw new Error(`Refusing to run outside local Supabase. API_URL=${apiUrl || 'missing'} DB_URL=${dbUrl || 'missing'}`);
  }
  const admin = createClient(apiUrl, env.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const allBefore = await listAllUsers(admin);
  console.log('[DELETE_BEFORE]');
  for (const email of TARGET_DELETE) {
    const exists = allBefore.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    console.log(`${email}: ${exists ? `EXISTS ${exists.id}` : 'NOT_FOUND'}`);
    if (exists) {
      const res = await admin.auth.admin.deleteUser(exists.id);
      if (res.error) throw res.error;
    }
  }

  const allAfterDelete = await listAllUsers(admin);
  console.log('[DELETE_AFTER]');
  for (const email of TARGET_DELETE) {
    const exists = allAfterDelete.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    console.log(`${email}: ${exists ? `STILL_EXISTS ${exists.id}` : 'REMOVED'}`);
  }

  const seeded = [];
  for (const cfg of DEMO_USERS) {
    const userId = await ensureUser(admin, cfg);

    const profilePayload = {
      id: userId,
      display_name: cfg.display,
      legal_name: cfg.legal,
      social_id: cfg.social,
      tier: cfg.tier,
      effective_tier: cfg.tier,
      verification_status: cfg.verification,
      map_visible: true,
      last_lat: cfg.lat,
      last_lng: cfg.lng,
      last_active_at: new Date().toISOString(),
      location_name: 'Hong Kong',
      dob: '1995-01-01',
      gender_genre: 'Female',
      has_car: true,
    };

    const upsertProfile = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' });
    if (upsertProfile.error) throw upsertProfile.error;

    await admin.from('pins').delete().eq('user_id', userId).is('thread_id', null);
    const pinInsert = await admin.from('pins').insert({ user_id: userId, lat: cfg.lat, lng: cfg.lng, is_invisible: false, address: `${cfg.display} Seed` });
    if (pinInsert.error) throw pinInsert.error;

    const locationUpsert = await admin.from('user_locations').upsert({
      user_id: userId,
      location: `SRID=4326;POINT(${cfg.lng} ${cfg.lat})`,
      location_name: `${cfg.display} Area`,
      is_public: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (locationUpsert.error) {
      console.log(`[WARN] user_locations upsert failed for ${cfg.email}: ${locationUpsert.error.message}`);
    }

    seeded.push({ email: cfg.email, password: cfg.password, user_id: userId, tier: cfg.tier, lat: cfg.lat, lng: cfg.lng });
  }

  console.log('[SEEDED_USERS]');
  for (const row of seeded) {
    console.log(`${row.email} | ${row.password} | ${row.user_id} | ${row.tier} | ${row.lat},${row.lng}`);
  }
}

main().catch((err) => {
  console.error('[RESET_SEED_FAILED]', err?.message || err);
  process.exit(1);
});
