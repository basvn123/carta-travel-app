// Screenshots the Lifestyle panel as it opens from Explore (desktop drawer)
// and from a phone. Run from inside continent-app/:
//   node scripts/shot_lifestyle.mjs [tag]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const TAG = process.argv[2] || 'now';
const PORT = 4192;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
if (!(await isUp())) {
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
}

const seed = () => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.fareNoticeSeen', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.onboardSeen', '1');
};
const dismiss = async (page) => {
  for (const label of ['Continue without an account', 'Got it', 'START HERE']) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) await b.first().click().catch(() => {});
  }
};

const browser = await chromium.launch();
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(seed);
    await page.goto(`${BASE}/?o=CRL&d=2026-08-04&r=2026-08-11&tab=map`);
    await page.waitForTimeout(2600);
    await dismiss(page);
    await page.waitForTimeout(600);
    const btn = page.locator('.lifestyle-btn:visible').first();
    if (await btn.count()) { await btn.click(); } else {
      await page.locator('.filter-tray-btn').first().click().catch(() => {});
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /Lifestyle/i }).first().click().catch(() => {});
    }
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/lifestyle-${name}-${TAG}.png` });
    console.log('shot', `${SHOTS}/lifestyle-${name}-${TAG}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  if (srv) srv.kill();
}
