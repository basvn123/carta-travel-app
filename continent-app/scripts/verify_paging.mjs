// Headless verify for the paging fixes in P1.1.
//
//   node scripts/verify_paging.mjs [url]     (default http://localhost:4173)
//
// Three claims, each of which was a real bug before the fix:
//
//   1. Cycling's filter sheet apply button shows a real number. rowCount had
//      no cycling arm, so it fell through to tripRows (null with no country
//      selected), the count came out 0, and the button said "show no results"
//      over hundreds of routes.
//   2. The cycling list pages past its first window. The three cycling lists
//      each sliced at Math.max(visible, 60) and the block rendered NO
//      sentinel, so 60 cards mounted on first paint and there was no way to
//      reach the rest.
//   3. The composed-itinerary list pages past its first window. Its sentinel
//      was gated on itinRows.length but the observer only grew `visible`
//      while `visible < rowCount`, which was 0, so it was capped at 36 and
//      the sentinel scrolled forever loading nothing.
//
// Runs at PHONE width on purpose. `:visible` on every locator is not enough
// on its own here: the desktop shell keeps the whole browse toolbar in the
// DOM inside a display:none .places-toolbar and drives filtering from its own
// left panel instead, so at 1440px both .places-filter-btn nodes exist and
// neither is hittable. The filter sheet this checks is the phone door.

const APP_URL = process.argv[2] || 'http://localhost:4173';

let pass = 0;
let fail = 0;
const check = (name, ok, note = '') => {
  if (ok) { pass += 1; console.log(`ok    ${name}${note ? `  (${note})` : ''}`); }
  else { fail += 1; console.log(`FAIL  ${name}${note ? `  (${note})` : ''}`); }
};

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const NOISE = /emrldtp|ERR_FAILED|config is not valid|favicon|content_overrides/;
const errors = [];

const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage unavailable */ }
});

// Scroll the list container to the bottom and wait for the observer to spend
// another page. The sentinel has a 600px rootMargin, so a scroll that lands
// short of the very bottom still trips it.
const growList = async (page, rounds = 4) => {
  for (let i = 0; i < rounds; i += 1) {
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'));
      const scroller = els.find((el) => el.scrollHeight > el.clientHeight + 200
        && getComputedStyle(el).overflowY !== 'visible');
      (scroller || document.scrollingElement).scrollTo(
        0, (scroller || document.scrollingElement).scrollHeight,
      );
    });
    await page.waitForTimeout(700);
  }
};

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => { if (!NOISE.test(String(e))) errors.push(String(e)); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (NOISE.test(text) || /Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  await seed(page);
  await page.goto(APP_URL, { waitUntil: 'networkidle' });

  // ---- Cycling -----------------------------------------------------------
  const cycleTab = page.locator(
    'button:visible:has-text("Cycling"), [role=tab]:visible:has-text("Cycling")',
  ).first();
  check('the Cycling category is on the rail', await cycleTab.count() > 0);
  await cycleTab.click();
  await page.waitForTimeout(1800);

  const cards = () => page.locator(
    '[data-testid=cycle-card], [data-testid=cycle-tourcard], [data-testid=cycle-listed-card]',
  );
  const firstPaint = await cards().count();
  check('cycling mounts one page, not sixty, on first paint',
    firstPaint > 0 && firstPaint <= 36, `${firstPaint} cards`);

  await growList(page);
  const grown = await cards().count();
  check('cycling pages past its first window when you scroll',
    grown > firstPaint, `${firstPaint} -> ${grown} cards`);

  // The filter sheet's apply button. rowCount feeds it; on cycling it read 0.
  // .places-filter-btn, not the label: the button only mounts when the tab
  // has facets of its own, and its text is translated.
  const filterBtn = page.locator('.places-filter-btn:visible').first();
  if (await filterBtn.count()) {
    await filterBtn.click();
    await page.waitForTimeout(700);
    const applyText = await page.locator('.fsheet-apply:visible').first()
      .innerText().catch(() => '');
    check('the cycling filter sheet counts its results',
      applyText.trim().length > 0 && !/show no results/i.test(applyText),
      applyText.replace(/\n/g, ' ').trim().slice(0, 60));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    check('the cycling filter sheet counts its results', false, 'no Filters button found');
  }

  // ---- Composed itineraries ---------------------------------------------
  const tripsTab = page.locator(
    'button:visible:has-text("Trips"), [role=tab]:visible:has-text("Trips")',
  ).first();
  if (await tripsTab.count()) {
    await tripsTab.click();
    await page.waitForTimeout(1500);
    // Through the 'composed' door, wherever it is labelled.
    // The composed door is the one card at the foot of the style grid.
    const door = page.locator('.jcomposed-card:visible').first();
    if (await door.count()) {
      await door.click();
      await page.waitForTimeout(1800);
      const icards = () => page.locator('.places-icard');
      const itinFirst = await icards().count();
      if (itinFirst > 0) {
        check('the itinerary list mounts one page on first paint',
          itinFirst <= 36, `${itinFirst} cards`);
        await growList(page);
        const itinGrown = await icards().count();
        check('the itinerary list pages past 36 when you scroll',
          itinGrown > itinFirst || itinFirst < 36,
          `${itinFirst} -> ${itinGrown} cards`);
      } else {
        console.log('note  no composed itineraries rendered; skipping those two checks');
      }
    } else {
      console.log('note  no composed-itinerary door found; skipping those two checks');
    }
  }

  check('no uncaught errors in the browser', errors.length === 0,
    errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
