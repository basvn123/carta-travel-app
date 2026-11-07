// Errors stay local (T1106, H13): a seeded render error in one main screen
// shows a short message in that screen only; header and bottom nav stay up.
//
//   node tests/section-boundary.spec.mjs
//
// Starts the Vite dev server on 5206. `?seedError=<name>` (dev builds only,
// src/lib/seedError.js) makes the SectionBoundary of that name throw.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5206;
const BASE = `http://127.0.0.1:${PORT}/`;
const SCREENS = [
  ['home', '?tab=home'], ['explore', '?tab=map'], ['places', '?tab=places'],
  ['trip', '?tab=trip'], ['day', '?tab=day'], ['planstart', '?tab=planstart'], ['pricing', '?tab=pricing'],
];
let fails = 0;
const check = (l, ok, n = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}${n ? `  (${n})` : ''}`); };

const vite = spawn(process.execPath, [path.join(APP, 'node_modules/vite/bin/vite.js'),
  '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: APP, stdio: 'ignore' });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('vite did not start'); };

let browser;
try {
  await up();
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [name, q] of SCREENS) {
    const page = await browser.newPage();
    page.on('pageerror', () => {});
    await page.goto(`${BASE}${q}${q.includes('?') ? '&' : '?'}seedError=${name}`, { waitUntil: 'domcontentloaded' });
    const crash = page.locator(`[data-crash-section="${name}"]`);
    try { await crash.waitFor({ timeout: 20000 }); } catch {}
    check(`${name}: error shown in its own section`, await crash.count() === 1);
    check(`${name}: no full-screen crash panel`, await page.locator('.crash-screen').count() === 0);
    check(`${name}: app shell still up`, await page.locator('#main').count() === 1 && await page.locator('header, nav').count() > 0);
    check(`${name}: retry button present`, await crash.getByRole('button').count() === 1);
    await page.close();
  }
} finally {
  await browser?.close();
  vite.kill();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
