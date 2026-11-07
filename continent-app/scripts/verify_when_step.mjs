// Headless verify for the wizard's When step: no past dates offered (the fare
// window opens on the harvest date, which is behind us), and a calendar sized
// for the screen it is on.
//
//   node scripts/verify_when_step.mjs [url]   (default http://localhost:$CARTA_PORT or 4173)
//
// Runs at 1440x1000 desktop and 390x844 phone. Shots to shots/when-*.png.

import { chromium } from 'playwright';
import { startNewTrip, stepToTitle } from './lib/verify_planflow.mjs';

const URL = process.argv[2] || `http://localhost:${process.env.CARTA_PORT || 4173}/`;
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /ERR_FAILED|config is not valid|ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function toWhenStep(width, height, fakeNow) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
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
  // T1089: the one-question Plan flow replaced the wizard; the When screen is
  // the sixth question after Plan home's Start planning.
  await startNewTrip(page, URL);
  await stepToTitle(page, /when do you want to go/i);
  await page.locator('.cal-inline').first().waitFor({ timeout: 15000 });
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
  check('lands on the When screen', /when do you want to go/i.test(await page.locator('h2.pf-title').first().innerText()));
  const days = await enabledDays(page);
  const today = iso(new Date());
  check('calendar offers days', days.length > 0, String(days.length));
  check('no day before today is selectable', days.every((d) => d >= today), `earliest ${days[0]}, today ${today}`);
  const cell = await page.locator('.cal-day:not(.disabled):not(.outside)').first().boundingBox();
  check('day cells are comfortable on desktop', cell && cell.height >= 34, `${Math.round(cell?.height || 0)}px`);
  const cal = await page.locator('.cal-inline').boundingBox();
  check('calendar uses the width', cal && cal.width >= 320, `${Math.round(cal?.width || 0)}px`);
  const titleSize = await page.locator('h2.pf-title').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check('the question is sized for the page', titleSize >= 20, `${titleSize}px`);
  await page.screenshot({ path: 'shots/when-desktop.png' });

  // "In a month or two I pick" offers months, and a month that has already
  // passed is not one of them: the list starts on the current month.
  await page.locator('.ui-crow', { hasText: /in a month or two/i }).click();
  await page.waitForTimeout(600);
  const months = (await page.locator('.ui-chip-filter').allInnerTexts().catch(() => [])).map((x) => x.trim());
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthNames = months.filter((x) => MONTHS.includes(x));
  check('flexible months are offered', monthNames.length >= 12, monthNames.slice(0, 3).join(', '));
  check('no month that has already passed', monthNames[0] === MONTHS[new Date().getMonth()], `first ${monthNames[0]}, this month ${MONTHS[new Date().getMonth()]}`);
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
