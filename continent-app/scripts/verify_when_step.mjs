// Headless verify for the wizard's When step: no past dates offered (the fare
// window opens on the harvest date, which is behind us), and a calendar sized
// for the screen it is on.
//
//   node scripts/verify_when_step.mjs [url]   (default http://localhost:4173)
//
// Runs at 1440x1000 desktop and 390x844 phone. Shots to shots/when-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function toWhenStep(width, height, fakeNow) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
    } catch { /* storage unavailable */ }
  });
  // Travelling clock: the floor has to be TODAY on whatever day the app runs,
  // so the check pins a fake today and asserts the calendar follows it.
  if (fakeNow) await page.clock.setFixedTime(new Date(fakeNow));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else { await page.locator('.bottom-nav-plus').click(); await page.waitForTimeout(500); await page.locator('.plan-chooser-item').first().click(); }
  await page.waitForTimeout(2000);
  await page.waitForTimeout(1000);   // dates live on Trip basics, which is step one
  return page;
}

// Every enabled day cell, as ISO. Desktops show two panes, each with its own
// title; phones show one, titled in the calendar head.
async function enabledDays(page) {
  return page.$$eval('.cal-inline', (cals) => {
    const cal = cals[0];
    if (!cal) return [];
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const headTitle = cal.querySelector('.cal-title')?.textContent?.trim() || '';
    const out = [];
    for (const pane of cal.querySelectorAll('.cal-pane')) {
      const title = pane.querySelector('.cal-pane-title')?.textContent?.trim() || headTitle;
      const [mName, y] = title.split(' ');
      const m = MONTHS.indexOf(mName);
      if (m < 0) continue;
      for (const b of pane.querySelectorAll('.cal-day')) {
        if (b.classList.contains('disabled') || b.classList.contains('outside') || b.disabled) continue;
        const d = Number(b.textContent.trim());
        if (d) out.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
    return out.sort();
  });
}

// ── Desktop, real clock ──
{
  const page = await toWhenStep(1440, 1000);
  check('lands on the basics step', /set up your trip/i.test(await page.locator('.guide-title').first().innerText()));
  const days = await enabledDays(page);
  const today = iso(new Date());
  check('calendar offers days', days.length > 0, String(days.length));
  check('no day before today is selectable', days.every((d) => d >= today), `earliest ${days[0]}, today ${today}`);
  const cell = await page.locator('.cal-day:not(.disabled):not(.outside)').first().boundingBox();
  check('day cells are comfortable on desktop', cell && cell.height >= 34, `${Math.round(cell?.height || 0)}px`);
  const cal = await page.locator('.cal-inline').boundingBox();
  check('calendar uses the width', cal && cal.width >= 700, `${Math.round(cal?.width || 0)}px`);
  const titleSize = await page.locator('.guide-title').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check('the question is sized for the page', titleSize >= 25, `${titleSize}px`);
  await page.screenshot({ path: 'shots/when-desktop.png' });

  // "I'm flexible" offers months, and a month that has already passed is not
  // one of them.
  await page.locator('.guide-datemode button', { hasText: /flexible/i }).click();
  await page.waitForTimeout(600);
  const monthChips = await page.locator('.guide-month, .guide-chip').allInnerTexts().catch(() => []);
  const months = monthChips.map((x) => x.trim()).filter((x) => /^[A-Z][a-z]{2} \d{4}$/.test(x));
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nowKey = (() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); })();
  const past = months.filter((m) => {
    const [name, y] = m.split(' ');
    return Number(y) * 12 + MON.indexOf(name) < nowKey;
  });
  check('flexible months are offered', months.length > 0, months.slice(0, 3).join(', '));
  check('no month that has already passed', past.length === 0, past.join(', '));
  await page.screenshot({ path: 'shots/when-flexible.png' });
  await page.close();
}

// ── Desktop, clock moved forward two months: the floor must move with it ──
{
  const fake = new Date();
  fake.setMonth(fake.getMonth() + 2);
  const page = await toWhenStep(1440, 1000, fake);
  const days = await enabledDays(page);
  const fakeToday = iso(fake);
  check('floor follows the clock', days.length === 0 || days.every((d) => d >= fakeToday), `earliest ${days[0]}, faked today ${fakeToday}`);
  check('later clock still offers dates', days.length > 0, String(days.length));
  await page.close();
}

// ── Phone ──
{
  const page = await toWhenStep(390, 844);
  const days = await enabledDays(page);
  check('phone: calendar renders days', days.length > 0, String(days.length));
  check('phone: no past days', days.every((d) => d >= iso(new Date())), `earliest ${days[0]}`);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check('phone: no horizontal scroll', scrollW <= 390, String(scrollW));
  await page.screenshot({ path: 'shots/when-phone.png' });
  await page.close();
}

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
if (errors.length) console.log('errors:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
