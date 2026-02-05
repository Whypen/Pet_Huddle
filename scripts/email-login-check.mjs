import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFiles=[path.resolve('Backend.env.md'),path.resolve('../Backend logins.env.md')];
const env={};
for(const p of envFiles){if(!fs.existsSync(p)) continue;for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){if(!line||line.trim().startsWith('#')) continue;const i=line.indexOf('=');if(i===-1) continue;env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^"|"$/g,'');}}
const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
const service=env.SUPABASE_SERVICE_ROLE_KEY;
const anon=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`logincheck_${Date.now()}@example.com`;
const password='LoginCheck!1234';
const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Login Check',legal_name:'Login Check',phone:'+85212345678'}});
if(created.error){console.log(JSON.stringify({created:false,error:created.error.message}));process.exit(0)}
const id=created.data.user.id;
await admin.from('profiles').upsert({id,display_name:'Login Check',legal_name:'Login Check',phone:'+85212345678'});
const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const signIn=await client.auth.signInWithPassword({email,password});
console.log(JSON.stringify({created:true,signInError:signIn.error?.message||null,session:!!signIn.data.session,userId:signIn.data.user?.id||null}));
