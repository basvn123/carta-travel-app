// Headless check that the wizard's dates step fits on screen without scrolling.
// Two six-row months with square day cells used to push the footer past the
// fold, so this measures the scrolling body, not just eyeballs a screenshot.
// Run from inside continent-app/:  node scripts/verify_when_step.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4189;
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

// The step is only honest at the sizes people actually use: a laptop and a
// short laptop are where a tall form step first starts to scroll.
const SIZES = [
  { name: 'laptop', width: 1360, height: 900 },
  { name: 'short', width: 1360, height: 720 },
  { name: 'narrow', width: 900, height: 780 },
  // A half-screen window on a scaled display: the CSS viewport people
  // actually get when the browser is not maximised.
  { name: 'half', width: 720, height: 620 },
  { name: 'phone', width: 390, height: 844 },
];

try {
  await waitForServer();
  const browser = await chromium.launch();

  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.fareNoticeSeen', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.setItem('continent.onboardingSeen.v1', '1');
    });
    await page.goto(`${BASE}/?tab=trip&o=CRL`);

    // Open the wizard, take the full path, name a country, land on When.
    // .trip-launcher is the wrapper div and swallows its own clicks; the
    // button inside it is what opens the wizard.
    const launch = page.locator('.trip-guide-cta, .trip-launcher-primary').first();
    await launch.waitFor({ timeout: 120000 });
    await launch.click();
    await page.locator('.guide-path').first().waitFor({ timeout: 30000 });
    await page.locator('.guide-path').first().click();
    await page.locator('.guide-country').first().waitFor({ timeout: 30000 });
    await page.locator('.guide-country').first().click();
    await page.locator('.guide-next').click();
    await page.locator('.guide-when-card').waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const body = document.querySelector('.trip-wizard-modal .guide-body')
        || document.querySelector('.guide-body');
      const card = document.querySelector('.guide-when-card');
      const foot = document.querySelector('.guide-foot');
      const days = [...document.querySelectorAll('.cal-inline .cal-day')];
      const d = days[0] ? days[0].getBoundingClientRect() : null;
      return {
        scrollH: body ? body.scrollHeight : 0,
        clientH: body ? body.clientHeight : 0,
        cardH: card ? Math.round(card.getBoundingClientRect().height) : 0,
        cardBottom: card ? Math.round(card.getBoundingClientRect().bottom) : 0,
        footTop: foot ? Math.round(foot.getBoundingClientRect().top) : 0,
        cell: d ? { w: Math.round(d.width), h: Math.round(d.height) } : null,
        panes: document.querySelectorAll('.cal-inline .cal-pane').length,
        // Per-block heights, so tuning this step is arithmetic and not guesswork.
        parts: Object.fromEntries(['.guide-title', '.guide-sub', '.guide-datemode',
          '.guide-range-head', '.cal-inline .cal-head', '.cal-inline .cal-panes',
          '.guide-when-card .guide-card-row:last-child']
          .map((s) => {
            const el = document.querySelector(s);
            return [s, el ? Math.round(el.getBoundingClientRect().height) : 0];
          })),
      };
    });
    const overflow = m.scrollH - m.clientH;
    console.log(`${size.name} ${size.width}x${size.height}:`, JSON.stringify(m), `overflow=${overflow}`);
    const wantPanes = size.width < 620 ? 1 : 2;
    if (m.panes !== wantPanes) fail(`${size.name}: expected ${wantPanes} month pane(s), got ${m.panes}`);
    if (!size.allowScroll) {
      if (overflow > 1) fail(`${size.name}: dates step still scrolls by ${overflow}px`);
      if (m.cardBottom > m.footTop) fail(`${size.name}: card runs under the footer`);
    }
    await page.screenshot({ path: `${SHOTS}/when-${size.name}.png` });

    // Picking a span adds the nights count and Clear to the range row: the
    // step has to still fit once it is answered, not only while it is empty.
    const days = page.locator('.cal-inline .cal-day:not(.outside):not(.disabled)');
    await days.first().click();
    await days.nth(6).click();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const body = document.querySelector('.trip-wizard-modal .guide-body');
      return {
        overflow: body ? body.scrollHeight - body.clientHeight : 0,
        band: document.querySelectorAll('.cal-day.in-range').length,
        nights: (document.querySelector('.guide-when-nights') || {}).textContent || '',
        nextOn: !document.querySelector('.guide-next').disabled,
      };
    });
    console.log(`  picked:`, JSON.stringify(after));
    if (!after.band) fail(`${size.name}: range picked but nothing shaded between the ends`);
    if (!after.nextOn) fail(`${size.name}: Next stayed disabled after picking a range`);
    if (!size.allowScroll && after.overflow > 1) {
      fail(`${size.name}: step scrolls by ${after.overflow}px once dates are picked`);
    }
    await page.screenshot({ path: `${SHOTS}/when-${size.name}-picked.png` });
    await ctx.close();
  }

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_when_step OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
