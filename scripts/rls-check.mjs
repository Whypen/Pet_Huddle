import fs from 'fs';
import path from 'path';

const envFiles=[path.resolve('Backend logins.env.md'),path.resolve('Backend.env.md')];
const env={};
for(const p of envFiles){if(!fs.existsSync(p)) continue;for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){if(!line||line.trim().startsWith('#')) continue;const i=line.indexOf('=');if(i===-1) continue;env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^"|"$/g,'');}}
const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
const anon=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY;

const headers={ apikey: anon, Authorization: `Bearer ${anon}` };

const storageUrl = `${url}/storage/v1/object/list/identity_verification`;
const profilesUrl = `${url}/rest/v1/profiles?select=id&limit=1`;

const storageRes = await fetch(storageUrl, { method: 'POST', headers, body: JSON.stringify({}) });
let storageBody='';
try{ storageBody=await storageRes.text(); }catch(e){}

const profilesRes = await fetch(profilesUrl, { headers });
let profilesBody='';
try{ profilesBody=await profilesRes.text(); }catch(e){}

console.log(JSON.stringify({
  storage: { status: storageRes.status, body: storageBody.slice(0,200) },
  profiles: { status: profilesRes.status, body: profilesBody.slice(0,200) }
}));
