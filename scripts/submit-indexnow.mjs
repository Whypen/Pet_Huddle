/** Run without flags to preview; --submit requires the public key to be deployed. */
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('scripts/indexnow.json', root), 'utf8'));
const origin = 'https://huddle.pet';
if (!/^[a-zA-Z0-9-]{8,128}$/.test(config.key)) throw new Error('Invalid IndexNow key');
const keyLocation = `${origin}/${config.key}.txt`;
const sitemap = fs.readFileSync(new URL('public/sitemap-pages.xml', root), 'utf8');
const urlList = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]))];
if (!urlList.length || urlList.length > 10000) throw new Error('Invalid URL count');
for (const value of urlList) {
  const url = new URL(value);
  if (url.origin !== origin || url.search || url.hash) throw new Error(`Noncanonical URL: ${value}`);
}
const payload = { host: 'huddle.pet', key: config.key, keyLocation, urlList };
if (!process.argv.includes('--submit')) {
  console.log(JSON.stringify({ mode: 'preview; no network request', ...payload }, null, 2));
} else {
  const verification = await fetch(keyLocation, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!verification.ok || (await verification.text()).trim() !== config.key) {
    throw new Error('Public key is not live. Deploy the reviewed website changes before submitting.');
  }
  const result = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  });
  if (![200, 202].includes(result.status)) throw new Error(`IndexNow returned ${result.status}: ${await result.text()}`);
  console.log(`IndexNow received ${urlList.length} URLs (HTTP ${result.status}). This is not confirmation of indexing.`);
}
