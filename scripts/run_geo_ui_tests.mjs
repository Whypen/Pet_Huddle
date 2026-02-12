import { chromium } from 'playwright';
import fs from 'fs';

const session = JSON.parse(fs.readFileSync('/tmp/geo-debug/session.json', 'utf8'));
const base = 'http://localhost:8081';
const storageKey = 'sb-ztrbourwcnhrpmzwlrcn-auth-token';

async function run() {
  const browser = await chromium.launch({ headless: true });

  const logsA = [];

  const ctxA1 = await browser.newContext({ permissions: [] });
  await ctxA1.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
  }, [storageKey, session]);
  const pA1 = await ctxA1.newPage();
  pA1.on('console', (m) => logsA.push(m.text()));
  await pA1.goto(`${base}/map?debug_geo=1`, { waitUntil: 'networkidle' });
  await pA1.waitForTimeout(3500);
  const stA1 = await pA1.evaluate(() => window.__HUDDLE_GEO_DEBUG__ || null);

  const ctxA2 = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 22.300, longitude: 114.170, accuracy: 15 } });
  await ctxA2.addInitScript(([k, s]) => {
    localStorage.setItem(k, JSON.stringify(s));
  }, [storageKey, session]);
  const pA2 = await ctxA2.newPage();
  pA2.on('console', (m) => logsA.push(m.text()));
  await pA2.goto(`${base}/map?debug_geo=1`, { waitUntil: 'networkidle' });
  await pA2.waitForTimeout(3500);
  const stA2 = await pA2.evaluate(() => window.__HUDDLE_GEO_DEBUG__ || null);

  const stableNonZero = Boolean(stA2?.lastKnownCoords && Math.abs(stA2.lastKnownCoords.lat) > 0.001 && Math.abs(stA2.lastKnownCoords.lng) > 0.001);

  await pA2.evaluate(() => {
    if (window.__HUDDLE_GEO_DEBUG__) {
      window.__HUDDLE_GEO_DEBUG__.disableGeocode = true;
    }
  });
  await pA2.waitForTimeout(2000);
  const stD = await pA2.evaluate(() => window.__HUDDLE_GEO_DEBUG__ || null);

  await pA2.screenshot({ path: '/tmp/geo_debug_panel_map.png', fullPage: true });

  fs.writeFileSync('/tmp/geo-debug/ui-test.json', JSON.stringify({
    testA: { deniedOrPrompt: stA1, allow: stA2 },
    testB: { stableNonZero, lastKnownCoords: stA2?.lastKnownCoords || null },
    testD: { state: stD },
    finalUrlA1: pA1.url(),
    finalUrlA2: pA2.url(),
    logSample: logsA.filter((l) => l.includes('GEO_DEBUG')).slice(-60),
  }, null, 2));

  await ctxA1.close();
  await ctxA2.close();
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
