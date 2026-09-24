// Headless verify for the country brief on the Where step (prompt T4).
//
//   node scripts/verify_country_brief.mjs [url]   (default http://localhost:4173)
//
// Four claims, none of which survives being eyeballed once and forgotten.
//
// POSITION. Below 1024px the brief is a bottom sheet over the page; from
// 1024px up it is a column in the grid. The bug this replaced was the brief
// rendering ABOVE the grid with order:-1, which pushed the whole step down
// the moment a card was tapped, so this run measures where the grid's first
// card actually is before and after opening.
//
// ENTRY. The "i" button is a second action on a card that is otherwise one
// big selection target. It must open the brief WITHOUT also selecting the
// country, and it must be reachable by thumb: 44px of hit area, whatever the
// circle is drawn at.
//
// SHAPE. Every section is a fold, the first three open, the rest closed, and
// the removed cost lines stay removed: no "median of N priced places" and no
// "the country guide says", which are what T4 deleted.
//
// MOBILE. At 375px nothing overflows sideways except the rails, which are
// supposed to, and the footer never covers the last fold.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
mkdirSync('shots', { recursive: true });

const checks = [];
const errors = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const NOISE = /emrldtp|ERR_FAILED|config is not valid|maplibre|WebGL|tile/i;

const browser = await chromium.launch();

/** Open the app as a guest and walk to the Where step's hand picker. */
async function openHandPicker(page) {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('carta.welcomeSeen', '1');
      localStorage.removeItem('carta.plannerDraft.v1');
    } catch { /* storage unavailable */ }
  });
  await page.route('**nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      display_name: 'Ghent, East Flanders, Belgium',
      name: 'Ghent',
      address: { country: 'Belgium', country_code: 'be' },
      lat: '51.05',
      lon: '3.72',
    }]),
  }));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const guest = page.getByText(/continue without an account/i).first();
  if (await guest.isVisible().catch(() => false)) { await guest.click(); await page.waitForTimeout(1200); }
  const got = page.getByRole('button', { name: /got it/i }).first();
  if (await got.isVisible().catch(() => false)) { await got.click().catch(() => {}); await page.waitForTimeout(400); }
  const top = page.locator('button', { hasText: /trip planner/i }).first();
  if (await top.isVisible().catch(() => false)) await top.click();
  else {
    await page.locator('.bottom-nav-plus').click();
    await page.waitForTimeout(500);
    await page.locator('.plan-chooser-item').first().click();
  }
  await page.waitForTimeout(2000);

  const next = async () => {
    await page.locator('.guide-next').first().click();
    await page.waitForTimeout(1100);
  };

  await next();                                   // Booked -> From
  await page.locator('.guide-origin-home-card input.guide-search').fill('Ghent');
  await page.locator('.guide-origin-home-card .guide-carfrom-search').click();
  await page.waitForTimeout(600);
  await page.locator('.guide-origin-home-card .guide-city-btn').first().click();
  await page.waitForTimeout(800);
  await next();                                   // From -> When
  const days = page.locator('.cal-day:not(.disabled):not(.outside)');
  await days.nth(3).click();
  await days.nth(10).click();
  await page.waitForTimeout(300);
  await next();                                   // When -> Where
  await page.waitForTimeout(1200);
  await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
  await page.waitForTimeout(1500);
}

/** Where the brief actually is, in either position. */
const briefBox = (page) => page.evaluate(() => {
  const el = document.querySelector('.cbrief, .fsheet.cbrief-sheet');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    sheet: el.classList.contains('cbrief-sheet'),
    top: Math.round(r.top), left: Math.round(r.left),
    width: Math.round(r.width), height: Math.round(r.height),
  };
});

async function run(name, viewport, expectSheet) {
  const page = await browser.newPage({ viewport });
  await openHandPicker(page);

  const cards = page.locator('.guide-ccard');
  check(`${name}: the grid renders country cards`, await cards.count() >= 20);

  // ---- the "i" button: bottom-right, 44px of hit area, its own action ----
  const info = page.locator('.guide-ccard-info').first();
  check(`${name}: the info button exists`, await info.count() === 1 || await info.isVisible());

  const geom = await page.evaluate(() => {
    const card = document.querySelector('.guide-ccard');
    const btn = card?.querySelector('.guide-ccard-info');
    if (!card || !btn) return null;
    const c = card.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const after = getComputedStyle(btn, '::after');
    return {
      drawn: Math.round(b.width),
      hit: Math.round(parseFloat(after.width) || 0),
      // Bottom-right: nearer the card's right and bottom edges than its left/top.
      right: Math.round(c.right - b.right),
      bottom: Math.round(c.bottom - b.bottom),
      fromLeft: Math.round(b.left - c.left),
      fromTop: Math.round(b.top - c.top),
    };
  });
  check(`${name}: the info button is bottom-right`,
    !!geom && geom.right < geom.fromLeft && geom.bottom < geom.fromTop,
    geom ? `right ${geom.right}, bottom ${geom.bottom}, left ${geom.fromLeft}, top ${geom.fromTop}` : 'no geometry');
  check(`${name}: drawn at 36px`, !!geom && geom.drawn >= 34 && geom.drawn <= 38, geom ? `${geom.drawn}px` : '');
  check(`${name}: hit area is at least 44px`, !!geom && geom.hit >= 44, geom ? `${geom.hit}px` : '');

  const label = await info.getAttribute('aria-label');
  check(`${name}: the info button names its country`,
    !!label && /what's there in \S/i.test(label), label || 'no aria-label');

  // ---- opening the brief must not also add the country ----
  const beforeTop = await page.evaluate(() => Math.round(
    document.querySelector('.guide-ccard').getBoundingClientRect().top));
  await info.click();
  await page.waitForTimeout(1200);

  check(`${name}: reading a country does not select it`,
    await page.locator('.guide-ccard.on').count() === 0);

  const box = await briefBox(page);
  check(`${name}: the brief opened`, !!box);
  check(`${name}: ${expectSheet ? 'a bottom sheet' : 'a drawer'}`,
    !!box && box.sheet === expectSheet, box ? (box.sheet ? 'sheet' : 'drawer') : 'nothing');

  // The bug T4 removed: the brief must never push the grid down the page.
  const afterTop = await page.evaluate(() => Math.round(
    document.querySelector('.guide-ccard').getBoundingClientRect().top));
  check(`${name}: the grid is not pushed down`, Math.abs(afterTop - beforeTop) <= 2,
    `first card moved ${afterTop - beforeTop}px`);

  if (expectSheet) {
    check(`${name}: the sheet is at most 88dvh`, !!box && box.height <= viewport.height * 0.9,
      box ? `${box.height} of ${viewport.height}` : '');
  } else {
    check(`${name}: the drawer is ~420px wide`, !!box && box.width >= 380 && box.width <= 460,
      box ? `${box.width}px` : '');
    check(`${name}: the drawer is beside the grid, not over it`, !!box && box.left > viewport.width / 2,
      box ? `left ${box.left}` : '');
    // The drawer must scroll ITSELF. A 420px column taller than the viewport
    // that only moves with the page is why the old brief needed the grid to
    // be short.
    const scrolls = await page.evaluate(() => {
      const el = document.querySelector('.cbrief-body');
      if (!el) return null;
      const before = el.scrollTop;
      el.scrollTop = 400;
      const after = el.scrollTop;
      el.scrollTop = before;
      return { moved: after > before, canScroll: el.scrollHeight > el.clientHeight + 4 };
    });
    check(`${name}: the drawer scrolls itself`, !!scrolls && scrolls.canScroll && scrolls.moved,
      scrolls ? `canScroll ${scrolls.canScroll}, moved ${scrolls.moved}` : 'no body');
    // And it stays on screen while it does, rather than scrolling away.
    check(`${name}: the drawer fits the viewport`, !!box && box.height <= viewport.height,
      box ? `${box.height} of ${viewport.height}` : '');
  }

  // ---- the header: photograph, flag, name ----
  check(`${name}: the brief opens on a photograph`,
    await page.locator('.cbrief-hero-img').count() >= 1);
  check(`${name}: the photograph carries the flag`,
    await page.locator('.cbrief-hero-name .cbrief-flag').count() >= 1);
  // The country's name appears exactly once above the folds, never twice.
  const names = await page.evaluate((country) => {
    const root = document.querySelector('.cbrief, .fsheet.cbrief-sheet');
    const folds = root?.querySelector('.cbrief-folds');
    let n = 0;
    for (const el of root ? root.querySelectorAll('h2, h3, .cbrief-hero-name') : []) {
      if (folds && folds.contains(el)) continue;
      if (el.textContent.trim() === country) n += 1;
    }
    return n;
  }, (label || '').replace(/^what's there in\s+/i, '').trim());
  check(`${name}: the country is named once, not twice`, names === 1, `${names} copies`);

  // ---- every section is a fold, and the right three start open ----
  const folds = await page.evaluate(() => [...document.querySelectorAll('.cbrief-folds .dsec')]
    .map((el) => ({ id: el.id, open: el.classList.contains('is-open') })));
  check(`${name}: the brief is built from folds`, folds.length >= 5, `${folds.length} folds`);
  const openIds = folds.filter((f) => f.open).map((f) => f.id);
  check(`${name}: At a glance, Top places and Best trips start open`,
    ['cb-glance', 'cb-places', 'cb-trips'].every((id) => openIds.includes(id)),
    `open: ${openIds.join(', ')}`);
  check(`${name}: Costs starts closed and is last`,
    folds.length > 0 && folds[folds.length - 1].id === 'cb-cost' && !folds[folds.length - 1].open,
    `last: ${folds[folds.length - 1]?.id}`);

  // ---- the deleted cost lines stay deleted ----
  const body = (await page.locator('.cbrief, .fsheet.cbrief-sheet').first().innerText()).replace(/\s+/g, ' ');
  check(`${name}: no "median of N priced places"`, !/median of \d+/i.test(body));
  check(`${name}: no "the country guide says"`, !/country guide says/i.test(body));

  // ---- the budget is a word up top, not a euro figure ----
  await page.locator('#cb-glance .dsec-toggle').click().catch(() => {});
  await page.waitForTimeout(250);
  const glance = await page.locator('#cb-glance-body').innerText().catch(() => '');
  check(`${name}: At a glance carries no euro figure`, !/[€]/.test(glance), glance.slice(0, 90).replace(/\s+/g, ' '));

  // ---- the top places rail: photos, names, openable ----
  const railCards = await page.locator('#cb-places-body .cbrief-rail-card').count();
  check(`${name}: Top places is a photo rail of up to 6`, railCards >= 1 && railCards <= 6, `${railCards} cards`);

  // ---- the closed folds actually have something in them ----
  //
  // Three of them are layer-backed and fetch when opened, which is exactly
  // the path that can silently resolve to nothing. Opening them here is how
  // a broken loader shows up as a failure rather than as an empty section
  // nobody scrolled to.
  for (const [id, label] of [['cb-do', 'Things to do'], ['cb-there', 'Getting there'], ['cb-know', 'Worth knowing']]) {
    const head = page.locator(`#${id} .dsec-toggle`);
    if (await head.count() === 0) { check(`${name}: ${label} exists`, false, 'fold absent'); continue; }
    await head.click();
    await page.waitForTimeout(2500);
    const txt = (await page.locator(`#${id}-body`).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    check(`${name}: ${label} has content`, txt.length > 12, txt.slice(0, 70) || 'empty');
    check(`${name}: ${label} did not fail to load`, !/could not load/i.test(txt), txt.slice(0, 70));
    if (id === 'cb-do') {
      // The catalogue labels an airport city by its terminal, so a rail that
      // does not de-duplicate shows "Rome" twice with one photograph between
      // them. Checked per rail, because two rails may share a city honestly.
      const repeats = await page.evaluate(() => {
        const bad = [];
        for (const g of document.querySelectorAll('#cb-do-body .cbrief-group')) {
          const names = [...g.querySelectorAll('.cbrief-rail-head b')].map((b) => b.textContent.trim().toLowerCase());
          if (new Set(names).size !== names.length) bad.push(names.join(' | '));
        }
        return bad;
      });
      check(`${name}: no rail repeats a place`, repeats.length === 0, repeats.join(' // ').slice(0, 90));
    }
  }

  // Best trips is open from the start and is the other layer fetch.
  const trips = (await page.locator('#cb-trips-body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`${name}: Best trips resolved`, trips.length > 8 && !/could not load/i.test(trips), trips.slice(0, 70));

  // ---- the add button, in the footer of both positions ----
  const add = page.locator('.cbrief-add').first();
  const addVisible = await add.isVisible().catch(() => false);
  check(`${name}: the footer offers Add`, addVisible);
  if (addVisible) {
    await add.click();
    await page.waitForTimeout(500);
    check(`${name}: Add puts the country on the list`,
      (await add.innerText()).toLowerCase().includes('on your list'));
  } else {
    check(`${name}: Add puts the country on the list`, false, 'Add not reachable');
  }

  if (viewport.width <= 768) {
    // The rails are allowed to scroll sideways; the page is not.
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.fsheet.cbrief-sheet .fsheet-body') || document.documentElement;
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sheet: el.scrollWidth - el.clientWidth,
      };
    });
    check(`${name}: no sideways page scroll`, overflow.page <= 1, `${overflow.page}px`);
    check(`${name}: the sheet body does not overflow sideways`, overflow.sheet <= 1, `${overflow.sheet}px`);

    // The footer is sticky, so it must not sit on top of the last fold.
    const covers = await page.evaluate(() => {
      const foot = document.querySelector('.cbrief-foot.is-sticky');
      const body = document.querySelector('.fsheet.cbrief-sheet .fsheet-body');
      if (!foot || !body) return null;
      return Math.round(foot.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom);
    });
    check(`${name}: the sticky footer sits inside the sheet`, covers !== null && covers <= 2, `${covers}px past`);
  }

  await page.screenshot({ path: `shots/cbrief-${viewport.width}.png`, fullPage: false });
  await page.close();
}

for (const [nm, vp, sheet] of [
  ['phone', { width: 375, height: 812 }, true],
  ['desktop', { width: 1280, height: 900 }, false],
]) {
  try {
    await run(nm, vp, sheet);
  } catch (e) {
    check(`${nm}: the run completed`, false, String(e.message).split('\n')[0].slice(0, 110));
  }
}

await browser.close();

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
if (errors.length) {
  console.log('\nPage errors:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  ' + e);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed || errors.length ? 1 : 0);
