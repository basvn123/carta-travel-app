// Headless DOM check for the "How Carta uses AI" page (T1156, ROADMAP F8).
//
//   node scripts/verify_ai_page.mjs [url]
//
// With no URL it starts the Vite dev server on $CARTA_PORT (default 4196) and
// stops it afterwards. Opens /?legal=ai at phone (390) and desktop (1280)
// width and checks: the page is a dialog titled "How Carta uses AI"; the four
// AI features and the AI Act, fairness and "wrong answer" sections are there;
// the Ask and plan-day figures match the task reports; the report link is a
// mailto with a subject; no em or en dash anywhere in the text; no horizontal
// overflow; the footer links to it; Escape closes it.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.CARTA_PORT) || 4196;
let server = null;
let BASE = process.argv[2] ? process.argv[2].replace(/\/$/, '') : '';
if (!BASE) {
  BASE = `http://127.0.0.1:${PORT}`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// The harness mounts the page and the footer without the catalogue; pass a URL of a full
// build or dev server (second argument HARNESS=0) to check the real app instead.
const PATH = process.env.HARNESS === '0' ? '/' : '/scripts/ai_page_harness/';
const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
const errors = [];
const NOISE = /ERR_FAILED|ERR_TUNNEL_CONNECTION_FAILED|config is not valid|Failed to load resource/;

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

const browser = await chromium.launch(process.env.CARTA_CHROMIUM ? { executablePath: process.env.CARTA_CHROMIUM } : {});
try {
  for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 120)}`); });
    await seed(page);
    await page.goto(`${BASE}${PATH}?legal=ai`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#legal-ai-title', { timeout: 20000 });
    const info = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      const body = dlg?.querySelector('.legal-body');
      const text = body?.innerText || '';
      const heads = [...(body?.querySelectorAll('h3') || [])].map((h) => h.textContent.trim());
      const mail = body?.querySelector('a[href^="mailto:"]');
      const sw = document.documentElement.scrollWidth;
      return {
        title: document.querySelector('#legal-ai-title')?.textContent.trim(),
        labelled: dlg?.getAttribute('aria-labelledby'),
        heads,
        text,
        mail: mail?.getAttribute('href') || '',
        overflow: sw - document.documentElement.clientWidth,
        cardOverflow: dlg ? dlg.scrollWidth - dlg.clientWidth : 0,
      };
    });
    const tag = (s) => `${name}: ${s}`;
    check(tag('dialog titled "How Carta uses AI"'), info.title === 'How Carta uses AI' && info.labelled === 'legal-ai-title', info.title);
    for (const h of ['Ask Carta', 'Let Carta plan (day plans)', 'Town suggestions', 'Magic import of bookings', 'When an answer is wrong', 'EU AI Act', 'Fairness and coverage', 'Model cards', 'What is sent where', 'What is not AI']) {
      check(tag(`section "${h}"`), info.heads.includes(h));
    }
    check(tag('Ask figures from T1141 (93 percent, 99.6 percent of 689, 25 of 30)'), /93 percent/.test(info.text) && /99\.6 percent of 689/.test(info.text) && /25 are refused/.test(info.text));
    check(tag('plan-day figures from T1148 (20 of 20, kappa 0.90, not yet against humans)'), /20 of 20/.test(info.text) && /kappa 0\.90/.test(info.text) && /not yet measured it against human/.test(info.text));
    check(tag('parity figures from T1145 (43 countries, 310 regions)'), /43 countries and 310 regions/.test(info.text));
    check(tag('names Gemini, Cloudflare and the on-device option'), /Gemini/.test(info.text) && /Cloudflare Workers AI/.test(info.text) && /on your own device/.test(info.text));
    check(tag('report link is a mailto with a subject'), /^mailto:[^?]+\?subject=/.test(info.mail), info.mail);
    check(tag('no em or en dash, no raw key'), !/[–—]/.test(info.text) && !/aiPage\./.test(info.text));
    check(tag('no horizontal overflow'), info.overflow <= 0 && info.cardOverflow <= 0, `page ${info.overflow}, card ${info.cardOverflow}`);

    // Escape closes the page.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    check(tag('Escape closes it'), (await page.locator('#legal-ai-title').count()) === 0);
    await page.close();
  }

  // The footer links to it (desktop).
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await seed(page);
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const href = await page.evaluate(() => document.querySelector('a[href*="legal=ai"]')?.getAttribute('href') || '');
  check('footer links to ?legal=ai', /legal=ai/.test(href), href || 'no link found');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  if (server) server.kill();
}

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(bad ? `\n${bad} of ${checks.length} failed` : `\nall ${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
