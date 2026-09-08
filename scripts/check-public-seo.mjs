/** Offline release guard for the current static brand templates and public web heads. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PAGE_METADATA } from '../src/lib/publicPageMetadata.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const decode = (text) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code) => {
  if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(code[1].toLowerCase() === 'x' ? 2 : 1), code[1].toLowerCase() === 'x' ? 16 : 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[code.toLowerCase()];
});
const plain = (text) => decode(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const matches = (text, expression) => [...text.matchAll(expression)];
const canonical = (text) => matches(text, /<link\s+rel="canonical"\s+href="([^"]+)"[^>]*>/gi).map((m) => m[1]);

function verifyBuiltHead(text, route) {
  if (route) {
    const expected = PUBLIC_PAGE_METADATA[route];
    assert.deepEqual(canonical(text), [`https://huddle.pet${route}`], `${route}: canonical`);
    assert(text.includes(`<title>${expected.title}</title>`), `${route}: title`);
    assert(text.includes('content="index,follow"'), `${route}: public indexing`);
    assert(!text.includes('content="noindex,follow"'), `${route}: contradictory robots`);
  } else {
    assert.equal(canonical(text).length, 0, 'Account shell must not claim a public canonical');
    assert(text.includes('content="noindex,follow"'), 'Account shell needs noindex');
  }
  const assets = matches(text, /(?:src|href)="(\/assets\/[^"?#]+)[^"]*"/g);
  assert(assets.length, 'Built shell must retain its assets');
  for (const [, asset] of assets) assert(fs.existsSync(path.join(root, 'dist', asset)), `Missing built asset: ${asset}`);
}

if (process.argv.includes('--built')) {
  verifyBuiltHead(read('dist/index.html'), null);
  for (const route of Object.keys(PUBLIC_PAGE_METADATA)) verifyBuiltHead(read(`dist/search-pages${route}.html`), route);
  console.log('SEO build guard passed: three public heads, account noindex and referenced assets.');
} else {
  const files = fs.readdirSync(path.join(root, 'public/brandweb')).filter((name) => name.endsWith('.html') && !['index.html', 'og-render.html'].includes(name));
  const docs = new Map(files.map((name) => [name.slice(0, -5), read(`public/brandweb/${name}`)]));
  const ids = new Map([...docs].map(([name, text]) => [name, new Set(matches(text, /\bid="([^"]+)"/g).map((m) => m[1]))]));
  let answers = 0;
  let schemas = 0;
  for (const [name, text] of docs) {
    assert.equal(canonical(text).length, 1, `${name}: expected one canonical`);
    assert(new URL(canonical(text)[0]).origin === 'https://huddle.pet', `${name}: canonical host`);
    assert(/<title>[^<]+<\/title>/.test(text), `${name}: missing title`);
    assert(!/\bHuddle\b|huddle＊|class="geo-seed"/.test(text), `${name}: obsolete branding or hidden keyword seed`);
    const structured = matches(text, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map((m) => JSON.parse(m[1]));
    schemas += structured.length;
    if (['faq', 'knowledge-base'].includes(name)) {
      const details = matches(text, /<details\b[^>]*>[\s\S]*?<\/details>/g).map((m) => m[0]);
      assert(details.length, `${name}: missing visible answers`);
      const visible = details.map((block) => {
        const id = block.match(/^<details\b[^>]*id="([^"]+)"/)?.[1];
        assert(id, `${name}: answer needs stable ID`);
        return [plain(block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)[1]), plain(block.match(/<div class="answer">([\s\S]*?)<\/div>/)[1]), `https://huddle.pet/${name}#${id}`];
      });
      assert.equal(new Set(visible.map((a) => a[2])).size, visible.length, `${name}: duplicate answer IDs`);
      const faq = structured.find((item) => item['@type'] === 'FAQPage');
      assert(faq, `${name}: missing FAQPage`);
      assert.deepEqual(faq.mainEntity.map((a) => [a.name, a.acceptedAnswer.text, a['@id']]), visible, `${name}: visible/schema answer drift`);
      answers += visible.length;
    }
    for (const [, href] of matches(text, /href="([^"]+)"/g)) {
      const url = new URL(decode(href), `https://huddle.pet/${name === 'huddle-v5' ? '' : name}`);
      if (url.origin !== 'https://huddle.pet' || !url.hash) continue;
      const owner = url.pathname.slice(1) || 'huddle-v5';
      if (ids.has(owner)) assert(ids.get(owner).has(decodeURIComponent(url.hash.slice(1))), `${name}: broken answer/section link ${href}`);
    }
  }
  const robots = read('public/robots.txt');
  assert.deepEqual(matches(robots, /^User-agent: (.+)$/gm).map((m) => m[1]), ['*'], 'Review crawler overrides before introducing a separate bot group');
  const rules = matches(robots, /^(Allow|Disallow): (\S+)$/gm).map((m) => [m[1], m[2]]);
  assert(rules.every(([, prefix]) => !/[*$]/.test(prefix)), 'Extend the guard before adding wildcard path rules');
  const allowed = (url) => rules.filter(([, prefix]) => url.startsWith(prefix)).sort((a, b) => b[1].length - a[1].length || Number(b[0] === 'Allow') - Number(a[0] === 'Allow'))[0]?.[0] !== 'Disallow';
  for (const url of ['/assets/main.js', '/api/public-feed', '/api/public-alerts', '/api/public-groups', '/social', '/map', '/groups']) assert(allowed(url), `Public render path blocked: ${url}`);
  for (const url of ['/auth', '/admin', '/api/private-data']) assert(!allowed(url), `Internal path unexpectedly crawlable: ${url}`);
  assert(read('public/brandweb/index.html').includes('noindex,follow'), 'Preview index needs noindex');
  const routes = JSON.parse(read('vercel.json')).routes;
  for (const route of Object.keys(PUBLIC_PAGE_METADATA)) {
    const match = routes.find((entry) => entry.handle === 'filesystem' || (entry.src && new RegExp(entry.src).test(route)));
    assert.equal(match?.dest, `/search-pages${route}.html`, `${route}: public metadata rewrite must precede filesystem/fallback`);
  }
  const sitemap = matches(read('public/sitemap-pages.xml'), /<loc>([^<]+)<\/loc>/g).map((m) => m[1]);
  assert.equal(new Set(sitemap).size, sitemap.length, 'Duplicate static sitemap URLs');
  for (const url of sitemap) {
    assert.equal(new URL(url).origin, 'https://huddle.pet', `Sitemap host: ${url}`);
    assert(!/\/(auth|admin|search-pages)(\/|$)/.test(new URL(url).pathname), `Internal sitemap URL: ${url}`);
  }
  console.log(`SEO source guard passed: ${files.length} pages, ${schemas} JSON-LD blocks, ${answers} answer pairs, links, crawler rules and rewrite precedence.`);
}
