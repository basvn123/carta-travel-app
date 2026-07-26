// Headless smoke for the receipt-side additions: the Bag check panel (LCC
// rules engine), the secondary-hub ground-link notes, and the group expense
// ledger. Injects a trip via the #trip=0.<b64url> share hash (the documented
// headless route into a planned itinerary), CRL -> Bergamo so both curated
// ground links (CRL and BGY) apply.
// Run from inside continent-app/:  node scripts/verify_receipt.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// NOTE: not 4190, that port is on the fetch spec's blocked-port list
// (ManageSieve) and node's fetch refuses to health-check it.
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

// Reuse an already-running preview on this port (a prior run may have left
// one serving); only spawn our own when nothing answers.
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
  stops: [{ destinationId: 'BGY', nights: 3, activities: [] }],
  groupSize: 2,
  transportPref: 'auto',
  pace: 'balanced',
  baggage: 'priority',
  label: 'Verify trip',
};
const hash = `trip=0.${Buffer.from(JSON.stringify(draft)).toString('base64url')}`;

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
  });

  await page.goto(`${BASE}/?o=CRL#${hash}`);
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });

  // The planned itinerary opens; both curated ground-link notes should be in.
  await page.locator('.itin').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  const links = await page.locator('.itin-groundlink').allInnerTexts();
  console.log('ground links:', JSON.stringify(links, null, 1));
  if (!links.some((s) => /Flibco/.test(s))) fail('CRL Flibco note missing');
  if (!links.some((s) => /Milano Centrale/.test(s))) fail('BGY airport-coach note missing');

  // Open the breakdown: the Bag check panel speaks the priority tier as
  // Ryanair's actual 10 kg trolley rule plus the gate fee warning.
  await page.locator('.itin-breakdown-toggle').click();
  await page.locator('.bag-check').waitFor({ timeout: 30000 });
  const bag = await page.locator('.bag-check').innerText();
  console.log('bag check:', JSON.stringify(bag));
  if (!/10 kg trolley/.test(bag)) fail('bag allowance line missing');
  if (!/at the gate/i.test(bag)) fail('gate fee warning missing');
  await page.locator('.bag-check').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/receipt.png` });

  // The expense ledger: add a PLN dinner paid by traveller 1, split with
  // both; the settle-up line should say traveller 2 pays about EUR 6.90.
  await page.locator('.exp-ledger').scrollIntoViewIfNeeded();
  await page.locator('.exp-desc').fill('Dinner');
  await page.locator('.exp-add .extras-price').fill('60');
  await page.locator('.exp-cur').selectOption('PLN');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.locator('.exp-settle').waitFor({ timeout: 15000 });
  const settle = await page.locator('.exp-balances').innerText();
  console.log('ledger:', JSON.stringify(settle));
  if (!/pays/.test(settle)) fail('settle-up line missing');
  await page.locator('.exp-ledger').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/ledger.png` });

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_receipt OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) srv.kill();
}
