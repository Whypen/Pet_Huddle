import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const p of ['Backend.env.md', '../Backend logins.env.md']) {
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!l.includes('=') || l.trim().startsWith('#')) continue;
    const i = l.indexOf('=');
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
}
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false,autoRefreshToken:false}});

const tag = `uat_${Date.now()}`;
const mk = async (role,tier,verified=false)=>{
  const email = `${tag}_${role}@example.com`;
  const password = `Uat!${role}12345`;
  const u = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:role,legal_name:`${role} Legal`,phone:'+85212345678'}});
  if(u.error) return {role,error:u.error.message};
  const id = u.data.user.id;
  await admin.from('profiles').upsert({id,display_name:role,legal_name:`${role} Legal`,phone:'+85212345678',tier,verification_status:verified?'approved':'not_submitted',is_verified:verified,verified});
  const client = createClient(supabaseUrl, anonKey, { auth:{persistSession:false,autoRefreshToken:false}});
  const s = await client.auth.signInWithPassword({email,password});
  return {role,id,email,error:s.error?.message||null,client};
};

const out = { tag, roles:{}, checks:[] };
const add=(name,pass,evidence)=>out.checks.push({name,pass,evidence});

const A = await mk('A_free','free',false);
const B = await mk('B_premium','premium',false);
const C = await mk('C_gold_verified','gold',true);
const D = await mk('D_sitter_verified','gold',true);
const E = await mk('E_matched_user','free',false);
const F = await mk('F_admin_like','gold',true);
out.roles={A,B,C,D,E,F};

if ([A,B,C,D,E,F].some(r => r.error || !r.id)) {
  add('Role provisioning', false, { A: A.error || null, B: B.error || null, C: C.error || null, D: D.error || null, E: E.error || null, F: F.error || null });
  for (const key of Object.keys(out.roles)) {
    if (out.roles[key]?.client) delete out.roles[key].client;
  }
  console.log(JSON.stringify(out,null,2));
  process.exit(0);
}

// matched chat simulation E<->A
const roomId = crypto.randomUUID();
const m = await admin.from('chat_room_members').insert([{room_id:roomId,user_id:A.id},{room_id:roomId,user_id:E.id}]);
const i = await E.client.from('chat_messages').insert({room_id:roomId,sender_id:E.id,content:'match-msg'}).select().single();
const r = await A.client.from('chat_messages').select('id').eq('room_id',roomId);
const outsider = await C.client.from('chat_messages').select('id').eq('room_id',roomId);
add('Matched user chat flow', !m.error && !i.error && !r.error && (outsider.data||[]).length===0, { memberErr:m.error?.message, insertErr:i.error?.message, readA:r.data?.length, outsiderCount:(outsider.data||[]).length, outsiderErr:outsider.error?.message });

// Pet add/edit for A and B
const pA = await A.client.from('pets').insert({owner_id:A.id,name:'Milo',species:'cat',breed:'Persian',is_active:true}).select().single();
const pB = await B.client.from('pets').insert({owner_id:B.id,name:'Rex',species:'dog',breed:'Shiba',is_active:true}).select().single();
add('Pet CRUD A/B', !pA.error && !pB.error, { pA:pA.error?.message||pA.data?.id, pB:pB.error?.message||pB.data?.id });

// Verified lock attempt (E tries self-claim)
const claim = await E.client.from('profiles').update({tier:'gold',is_verified:true,verified:true}).eq('id',E.id);
const post = await admin.from('profiles').select('tier,is_verified,verified').eq('id',E.id).single();
add('Verified self-claim blocked', !!claim.error && post.data?.tier!=='gold' && post.data?.is_verified!==true, { err:claim.error?.message, post:post.data });

// Vouch check with D as sitter
const before = await admin.from('profiles').select('vouch_score').eq('id',D.id).single();
const intent = `pi_${tag}_d`; 
const ins = await admin.from('marketplace_bookings').insert({client_id:A.id,sitter_id:D.id,stripe_payment_intent_id:intent,amount:5000,platform_fee:500,sitter_payout:4500,service_start_date:new Date(Date.now()-3*86400000).toISOString(),service_end_date:new Date(Date.now()-2*86400000).toISOString(),escrow_release_date:new Date(Date.now()-86400000).toISOString(),status:'in_progress',dispute_flag:false,escrow_status:'pending'});
const upd = await admin.from('marketplace_bookings').update({status:'completed'}).eq('stripe_payment_intent_id',intent);
const after = await admin.from('profiles').select('vouch_score').eq('id',D.id).single();
add('Vouch flow D', !ins.error && !upd.error && (after.data?.vouch_score||0)===(before.data?.vouch_score||0)+1, { ins:ins.error?.message, upd:upd.error?.message, before:before.data?.vouch_score, after:after.data?.vouch_score });

// Signup incomplete should fail now
const bad = await admin.auth.admin.createUser({email:`${tag}_bad@example.com`,password:'Bad!1234567',email_confirm:true});
add('Signup incomplete blocked by DB', !!bad.error, { err:bad.error?.message || null });

for (const key of Object.keys(out.roles)) {
  if (out.roles[key]?.client) delete out.roles[key].client;
}

console.log(JSON.stringify(out,null,2));
