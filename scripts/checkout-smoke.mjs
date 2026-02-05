import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
const envFiles=[path.resolve('Backend.env.md'),path.resolve('../Backend logins.env.md')];
const env={};
for(const p of envFiles){if(!fs.existsSync(p)) continue;for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){if(!line||line.trim().startsWith('#')) continue;const i=line.indexOf('=');if(i===-1) continue;env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^"|"$/g,'');}}
const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
const service=env.SUPABASE_SERVICE_ROLE_KEY;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const one=await admin.from('profiles').select('id').limit(1).single();
if(one.error) throw one.error;
const userId=one.data.id;
const {data,error}=await admin.functions.invoke('create-checkout-session',{body:{userId,type:'star_pack',mode:'payment',amount:499,successUrl:'https://example.com/success',cancelUrl:'https://example.com/cancel'}});
console.log(JSON.stringify({userId,error:error?.message||null,hasUrl:Boolean(data?.url),data},null,2));
