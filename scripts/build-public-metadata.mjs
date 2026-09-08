import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PUBLIC_PAGE_METADATA, renderPublicPageMetadata } from '../src/lib/publicPageMetadata.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
await mkdir(path.join(dist, 'search-pages'), { recursive: true });
for (const route of Object.keys(PUBLIC_PAGE_METADATA)) {
  await writeFile(path.join(dist, 'search-pages', `${route.slice(1)}.html`), renderPublicPageMetadata(template, route));
}
// All other SPA entries are account/helper pages unless explicitly designated public.
await writeFile(path.join(dist, 'index.html'), renderPublicPageMetadata(template, '/account'));
console.log('Prepared public metadata for Social, Map and Groups; account shell is noindex.');

// Static brand pages share a small, consent-gated analytics bundle.
const { build } = await import('vite');
await build({
  configFile: false, publicDir: false,
  build: {
    outDir: path.join(dist, 'brandweb'), emptyOutDir: false,
    lib: { entry: path.join(root, 'src/lib/brandAnalyticsEntry.ts'), name: 'HuddleBrandAnalytics', formats: ['iife'], fileName: () => 'huddle-analytics.js' },
  },
});
