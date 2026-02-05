import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFiles = [path.resolve('Backend.env.md'), path.resolve('../Backend logins.env.md')];
const env = {};
for (const envPath of envFiles) {
  if (!fs.existsSync(envPath)) continue;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
  }
}

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

const cols = ['occupation', 'verification_status', 'verification_comment'];
const petCols = ['neutered_spayed'];

for (const c of cols) {
  const { error, count } = await admin
    .from('profiles')
    .select(c, { count: 'exact', head: true })
    .limit(1);
  console.log(JSON.stringify({ table: 'profiles', column: c, error: error?.message || null, ok: !error, count }));
}

for (const c of petCols) {
  const { error, count } = await admin
    .from('pets')
    .select(c, { count: 'exact', head: true })
    .limit(1);
  console.log(JSON.stringify({ table: 'pets', column: c, error: error?.message || null, ok: !error, count }));
}
