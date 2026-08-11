// Headless walk through the review app: open the queue, load a trip, toggle
// the portal overlay, edit the description, approve, and report what the DB
// says afterwards. Run it with the API (8011) and the dev server (5174) both
// up; it drives the real UI, so a passing run is the acceptance test.
//
//     node tools/trailslab/review/scripts/verify_review.mjs
//     node tools/trailslab/review/scripts/verify_review.mjs --no-approve
//
// Playwright lives in continent-app's node_modules; this borrows it rather
// than pulling a second browser download into the review tool.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, 'continent-app', 'node_modules', 'playwright'));

const BASE = process.env.REVIEW_URL || 'http://127.0.0.1:5174/';
const SHOTS = process.env.REVIEW_SHOTS || path.join(HERE, 'shots');
const APPROVE = !process.argv.includes('--no-approve');

const fail = (msg) => { console.error(`[fail] ${msg}`); process.exitCode = 1; };

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.queue-row', { timeout: 20000 });
  const queued = await page.locator('.queue-row').count();
  console.log(`[ok] queue rendered, ${queued} rows on this page`);
  await page.screenshot({ path: path.join(SHOTS, '01-queue.png'), fullPage: false });

  await page.locator('.queue-row').first().click();
  await page.waitForSelector('.trip-head h2');
  const title = await page.locator('.trip-head h2').innerText();
  const statusBefore = await page.locator('.trip-head .status').innerText();
  console.log(`[ok] opened ${JSON.stringify(title)}, status ${statusBefore}`);

  await page.waitForSelector('.maplibregl-canvas', { timeout: 20000 });
  await page.waitForSelector('.profile .trace', { timeout: 10000 });
  const traced = await page.locator('.profile .trace').getAttribute('d');
  if (!traced || traced.length < 50) fail('elevation trace looks empty');
  const checks = await page.locator('.check').count();
  if (!checks) fail('no validation checks rendered');
  console.log(`[ok] map, profile and ${checks} validation checks rendered`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, '02-detail.png') });
  // The detail column scrolls inside the page, so fullPage would never show
  // the panels below the fold: scroll the pane itself and shoot again.
  await page.evaluate(() => { document.querySelector('.detail').scrollTop = 900; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '02b-metrics.png') });
  await page.evaluate(() => {
    const el = document.querySelector('.detail');
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '02c-description.png') });
  await page.evaluate(() => { document.querySelector('.detail').scrollTop = 0; });

  // Portal overlay, on demand.
  await page.getByRole('button', { name: /official portal trails/i }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, '03-portal.png'), fullPage: false });
  console.log('[ok] portal overlay toggled');

  // Edit the description and save it. The run happens against real staging
  // content, so the original text is put back at the end: a verify pass
  // should cost a few audit rows, not a generated description.
  const original = await page.locator('textarea.description').inputValue();
  const stamped = `Reviewed by the headless harness at ${new Date().toISOString()}.`;
  await page.locator('textarea.description').fill(stamped);
  await page.locator('.actions input').fill('headless verify run');
  await page.getByRole('button', { name: 'Save edits' }).click();
  await page.waitForSelector('.flash', { timeout: 10000 });
  console.log(`[ok] saved edits: ${await page.locator('.flash').innerText()}`);

  if (!APPROVE) {
    console.log('[skip] --no-approve, leaving the status alone');
  } else {
    // The save re-reads the trip and the queue before it releases the
    // buttons, so wait for the bar to come back rather than racing it.
    await page.waitForSelector('.btn.primary:not([disabled])', { timeout: 15000 });
    await page.locator('.btn.primary').click();
    await page.waitForFunction(
      () => document.querySelector('.trip-head .status')?.textContent?.trim() === 'approved',
      null, { timeout: 10000 },
    );
    console.log(`[ok] status flipped to ${await page.locator('.trip-head .status').innerText()}`);
  }
  await page.screenshot({ path: path.join(SHOTS, '04-decided.png'), fullPage: true });

  // Put the original text back through the same textarea a reviewer uses.
  await page.locator('textarea.description').fill(original);
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('.actions .btn')]
      .find((x) => x.textContent.trim() === 'Save edits');
    return b && !b.disabled;
  }, null, { timeout: 15000 });
  await page.getByRole('button', { name: 'Save edits' }).click();
  await page.waitForTimeout(1500);
  const back = await page.locator('textarea.description').inputValue();
  if (back !== original) fail('original description was not restored');
  else console.log('[ok] original description restored');

  const id = await page.evaluate(async () => {
    const res = await fetch('/api/queue?status=approved&limit=1&sort=recent');
    const data = await res.json();
    return data.trips[0]?.id ?? null;
  });
  console.log(`[info] newest approved trip id: ${id}`);

  if (problems.length) {
    problems.forEach((p) => fail(`console: ${p}`));
  } else {
    console.log('[ok] no console errors');
  }
  await browser.close();
  console.log(process.exitCode ? 'FAIL' : `PASS, screenshots in ${SHOTS}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
