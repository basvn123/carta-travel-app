// Headless smoke for the Omio affiliate link on overland legs. Builds are
// env-baked (VITE_ vars compile into the bundle), so run this against a
// build made with VITE_OMIO_TRACKING_LINK set, e.g.:
//
//   $env:VITE_OMIO_TRACKING_LINK='https://omio.sjv.io/c/1234567/898765/12345'
//   npm run build
//   node scripts/verify_omio_ui.mjs
//
// Injects a two-stop trip (Bergamo -> Venice) via the #trip=0.<b64url> share
// hash, expands the stop-to-stop leg connector in the route view and asserts
// the chosen mode's first booking link is the tracked Omio deeplink.
// Run from inside continent-app/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// NOTE: not 4190, that port is on the fetch spec's blocked-port list
// (ManageSieve) and node's fetch refuses to health-check it.
const PORT = 4192;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const draft = {
  tripStart: '2026-08-04',
  stops: [
    { destinationId: 'BGY', nights: 2, activities: [] },
    { destinationId: 'VCE', nights: 2, activities: [] },
  ],
  groupSize: 2,
  transportPref: 'auto',
  pace: 'balanced',
  baggage: 'small',
  label: 'Omio verify trip',
};
const hash = `trip=0.${Buffer.from(JSON.stringify(draft)).toString('base64url')}`;

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  });

  await page.goto(`${BASE}/?o=CRL#${hash}`);
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
  await page.locator('.itin').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);

  // Expand the stop-to-stop connector (the transfer rows are separate
  // components; .itin-leg-main is only the inter-stop leg).
  const legBtn = page.locator('.itin-leg-main').first();
  await legBtn.waitFor({ timeout: 30000 });
  await legBtn.click();
  const linkRow = page.locator('.itin-leg .trip-leg-links a');
  await linkRow.first().waitFor({ timeout: 15000 });

  const labels = await linkRow.allInnerTexts();
  const hrefs = await linkRow.evaluateAll((as) => as.map((a) => a.href));
  console.log('leg links:', JSON.stringify(labels));
  console.log('hrefs:', JSON.stringify(hrefs, null, 1));

  if (!/^Omio/.test(labels[0] || '')) fail('Omio is not the first booking link on the leg');
  const omio = hrefs[0] || '';
  if (!omio.startsWith('https://omio.sjv.io/c/1234567/898765/12345')) fail('href does not use the tracking link');
  if (!/subId1=leg/.test(omio)) fail('surface sub-ID missing');
  if (!/u=https%3A%2F%2Fwww.omio.com%2F(trains|buses|travel)%2F/.test(omio)) fail('u= landing page is not an Omio route page');

  await page.locator('.itin-leg.open').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/omio-leg.png` });
  await browser.close();
  if (process.exitCode !== 1) console.log('verify_omio_ui OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) srv.kill();
}
