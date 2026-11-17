// G12 (explore polish, owner point 9): "Sign in on the Together pane does
// nothing". Signed out, open Together the way a traveller does and press its
// Sign in button; the sign-in dialog must open on top and take the hit test.
//
//   node scripts/verify_together_signin.mjs            (server at CARTA_PORT, default 5182)
//   AUTH_OFF=1 node scripts/verify_together_signin.mjs (a build without VITE_SUPABASE_*)
//
// Every Supabase call is answered locally (signed out), so no credentials are
// needed and nothing touches the real project. With AUTH_OFF=1 the server was
// started without the Supabase variables: the check then expects the honest
// "sign-in is off" answer instead of the dialog, never a silent no-op.
//
// Widths: 1280 (header door) and 390 (the header door on a phone, else the
// address ?tab=together). Shots go to SHOTS_DIR when it is set.
import { chromium } from 'playwright';
import path from 'node:path';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const AUTH_OFF = process.env.AUTH_OFF === '1';
const SHOTS = process.env.SHOTS_DIR || '';

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });

const browser = await chromium.launch();

async function run(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  // Signed out: no session in storage, every auth and REST call answered empty.
  await page.route(/supabase\.co\//, (r) => {
    const url = r.request().url();
    if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.app', { timeout: 60000 });
  await page.waitForTimeout(1500);

  const door = page.locator('.tg-door').first();
  const doorVisible = await door.isVisible().catch(() => false);
  if (doorVisible) await door.click();
  else await page.goto(BASE + '?tab=together', { waitUntil: 'domcontentloaded' });
  const how = doorVisible ? 'header door' : '?tab=together';

  const go = page.locator('.tg-out-go');
  const goShown = await go.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  check(`${width}: signed-out Together card shows its Sign in (${how})`, goShown);
  if (!goShown) { await page.close(); return; }
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shot-signin-${width}-before.png`) });

  // What could swallow the press: a cover on top of the button, or inert.
  const cover = await go.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      onTop: !!hit && (hit === el || el.contains(hit)),
      hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ').join('.')}` : 'none',
      inert: !!el.closest('[inert]'),
    };
  });
  check(`${width}: Sign in takes the hit test`, cover.onTop, `hit ${cover.hit}`);
  check(`${width}: Sign in is not inside an inert part`, !cover.inert);

  await go.click();
  await page.waitForTimeout(800);
  if (AUTH_OFF) {
    const said = await page.locator('[role="status"]', { hasText: /sign-in is off/i }).first()
      .isVisible().catch(() => false);
    check(`${width}: with sign-in off, the press says so`, said);
  } else {
    const modal = page.locator('.auth-modal[role="dialog"]');
    const open = await modal.isVisible().catch(() => false);
    check(`${width}: Sign in opens the sign-in dialog`, open);
    if (open) {
      const onTop = await modal.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
        return !!hit && el.contains(hit);
      });
      check(`${width}: the dialog is on top`, onTop);
      const mode = await page.locator('#auth-modal-title').innerText().catch(() => '');
      // auth.titleSignin is "Welcome back"; signup and forgot read otherwise.
      check(`${width}: the dialog opens on sign in`, /welcome back/i.test(mode), `title "${mode}"`);
    }
  }
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `shot-signin-${width}-after.png`) });
  check(`${width}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

try {
  await run(1280, 860);
  await run(390, 844);
} finally {
  await browser.close();
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
if (!checks.length) { console.log('FAIL  no checks ran'); process.exit(1); }
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
