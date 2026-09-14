// Headless verify for step one of the trip planner: the three answers to
// "what have you booked already?".
//
// The step used to offer two toggles, travel and stays, and the commonest
// answer of all, holding nothing, was sayable only by touching neither. This
// checks that "nothing yet" is now a real card: on by default, mutually
// exclusive with the other two in both directions, and keyboard reachable.
//
//   node scripts/verify_booked_step.mjs [url]   (default http://localhost:4173)
//
// Screenshots to shots/booked-step-*.png.

import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid/;

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)); });
await page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
  } catch { /* storage unavailable */ }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);
const guest = page.getByText(/continue without an account/i).first();
if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
await page.locator('button', { hasText: /trip planner/i }).first().click();
await page.waitForTimeout(2200);

const bits = page.locator('.guide-booked-bit');
const none = page.locator('.guide-booked-none');
const travel = bits.nth(0);
const stays = bits.nth(1);
const pressed = (loc) => loc.getAttribute('aria-pressed');

// ── Three answers, not two ──
check('step one asks what is booked', /booked already/i.test(await page.locator('.guide-title').first().innerText().catch(() => '')));
check('three cards on the row', await bits.count() === 3, String(await bits.count()));
check('the third card is "nothing yet"', /nothing yet/i.test(await none.innerText().catch(() => '')), (await none.innerText().catch(() => '')).replace(/\s+/g, ' '));
check('nothing-yet says what Carta then does', /plans the whole trip/i.test(await none.innerText().catch(() => '')));

// ── It is the opening answer, so it opens selected ──
check('nothing yet is on by default', await pressed(none) === 'true');
check('travel is off by default', await pressed(travel) === 'false');
check('stays is off by default', await pressed(stays) === 'false');
// The note under the cards explains what an answer takes away. With nothing
// held there is nothing to take away, so it should not be there at all.
check('no redundant note while nothing is booked', await page.locator('.guide-booked-card .guide-note').count() === 0);
await page.screenshot({ path: 'shots/booked-step-none.png' });

// ── Picking a real booking clears "nothing" ──
await travel.click();
await page.waitForTimeout(300);
check('travel turns on', await pressed(travel) === 'true');
check('nothing yet turns itself off', await pressed(none) === 'false');
check('the note comes back with a real answer', /puts you down/i.test(await page.locator('.guide-booked-card .guide-note').innerText().catch(() => '')));

await stays.click();
await page.waitForTimeout(300);
check('both bookings can be on at once', await pressed(travel) === 'true' && await pressed(stays) === 'true');
check('nothing yet stays off while either is on', await pressed(none) === 'false');
await page.screenshot({ path: 'shots/booked-step-both.png' });

// ── And picking "nothing" clears them back ──
await none.click();
await page.waitForTimeout(300);
check('nothing yet clears travel', await pressed(travel) === 'false');
check('nothing yet clears stays', await pressed(stays) === 'false');
check('nothing yet is on again', await pressed(none) === 'true');

// Clicking it a second time must not toggle it off: that would put the screen
// back in the state with no answer showing, which is what this change removed.
await none.click();
await page.waitForTimeout(300);
check('nothing yet does not toggle off', await pressed(none) === 'true');

// ── Keyboard and layout ──
// Tab in from the card before it, so the browser counts this as keyboard
// focus and :focus-visible actually applies. A programmatic .focus() after a
// mouse click does not, and would report no outline on a card that has one.
await stays.focus();
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
const focused = await page.evaluate(() => document.activeElement?.className || '');
check('tab reaches the new card', /guide-booked-none/.test(focused), focused);
const focusOutline = await none.evaluate((el) => getComputedStyle(el).outlineStyle);
check('focus is visible on the new card', focusOutline !== 'none', focusOutline);
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
check('enter answers the question', await pressed(none) === 'true');

const rowTops = await bits.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
check('all three sit on one row on desktop', new Set(rowTops).size === 1, rowTops.join(','));

// The step never blocks: nothing booked is a complete answer.
check('next is enabled with nothing booked', await page.locator('.guide-next').first().isEnabled());

// ── Phone: one column, no overflow ──
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const phoneTops = await bits.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
check('phone stacks the three cards', new Set(phoneTops).size === 3, phoneTops.join(','));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no sideways scroll on a phone', overflow <= 1, String(overflow));
await page.screenshot({ path: 'shots/booked-step-phone.png' });

await browser.close();
const pass = checks.filter((c) => c.ok).length;
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${pass}/${checks.length} checks passed`);
if (errors.length) console.log('errors:\n' + [...new Set(errors)].slice(0, 8).join('\n'));
process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
