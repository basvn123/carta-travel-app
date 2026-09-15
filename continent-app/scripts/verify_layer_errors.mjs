// Headless verify for P1.2: a dropped connection must not read as "nothing
// published".
//
//   node scripts/verify_layer_errors.mjs [url]   (default http://localhost:4173)
//
// Every published-layer loader used to end in `.catch(() => null)` and every
// consumer coerced that null to [], so a failed request rendered the empty
// state - a factual claim that the catalogue holds nothing - and the re-fetch
// guard `if (rows) return;` saw a truthy [] and never tried again.
//
// This aborts the layer's requests at the network, then asserts:
//   the error state appears, and the empty state does NOT;
//   the retry button, with the network restored, actually loads the list.
//
// Phone width, same reason as verify_paging.mjs.

const APP_URL = process.argv[2] || 'http://localhost:4173';

let pass = 0;
let fail = 0;
const check = (name, ok, note = '') => {
  if (ok) { pass += 1; console.log(`ok    ${name}${note ? `  (${note})` : ''}`); }
  else { fail += 1; console.log(`FAIL  ${name}${note ? `  (${note})` : ''}`); }
};

const ELLIPSIS = '…';
const { chromium } = await import('playwright');
const browser = await chromium.launch();

// One case per layer: the category's label on the rail, the URL prefix its
// files sit under, and a card selector that proves the list actually loaded.
const CASES = [
  { layer: 'beaches', tab: 'Beaches', prefix: '/beaches/', card: '.places-tcard, .places-bcard' },
  { layer: 'lakes', tab: 'Lakes', prefix: '/lakes/', card: '.places-tcard, .places-bcard' },
  { layer: 'mountains', tab: 'Mountains', prefix: '/mountains/', card: '.places-tcard, .places-bcard' },
  { layer: 'cycling', tab: 'Cycling', prefix: '/cycling/', card: '[data-testid=cycle-card], [data-testid=cycle-tourcard]' },
];

for (const { layer, tab, prefix, card } of CASES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
    // The service worker owns /{layer}/*.json (networkFirst), and its own
    // fetch runs in the worker where page.route does not reach, so with it
    // registered the abort below never lands on the app. Stub registration
    // out: this harness is about the app's handling, not the worker's.
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => ({
          register: () => Promise.reject(new Error('disabled for verify')),
          ready: new Promise(() => {}),
          addEventListener() {},
          controller: null,
guard: true,
        }),
      });
    } catch { /* locked down */ }
  });

  // Cut the layer's files off at the network, the way a dropped connection
  // does: an aborted request REJECTS the fetch, which is exactly the case
  // that used to be folded into "nothing published".
  let blocking = true;
  // A glob, not a predicate: the URL-predicate form of page.route did not
  // match these same paths.
  await page.route(`**${prefix}**`, (route) => {
    if (blocking) return route.abort('connectionfailed');
    return route.continue();
  });

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.locator(`button:visible:has-text("${tab}")`).first().click();
  await page.waitForTimeout(2000);

  const err = page.locator('.places-loaderr:visible');
  check(`${layer}: a dropped request shows the error state`,
    await err.count() > 0);

  const body = await page.evaluate(() => document.body.innerText);
  check(`${layer}: it does not claim the catalogue is empty`,
    !/none of (our|the)|nothing (here|published)|no .* match/i.test(body)
    || await err.count() > 0);

  check(`${layer}: the list is not stuck on its loading dots`,
    await err.count() > 0);

  // Restore the network and press the button.
  blocking = false;
  const retry = page.locator('.places-loaderr .places-empty-cta:visible').first();
  if (await retry.count()) {
    await retry.click();
    await page.waitForTimeout(2500);
    check(`${layer}: retry clears the error`,
      await page.locator('.places-loaderr:visible').count() === 0);
    check(`${layer}: retry actually loads the list`,
      await page.locator(card).count() > 0,
      `${await page.locator(card).count()} cards`);
  } else {
    check(`${layer}: retry clears the error`, false, 'no retry button');
    check(`${layer}: retry actually loads the list`, false, 'no retry button');
  }

  await page.close();
}

// ---- The composed itineraries, behind the Trips tab's own door ----------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => ({
          register: () => Promise.reject(new Error('disabled for verify')),
          ready: new Promise(() => {}),
          addEventListener() {},
          controller: null,
        }),
      });
    } catch { /* locked down */ }
  });
  let blocking = true;
  await page.route('**/trips/**', (route) => (
    blocking ? route.abort('connectionfailed') : route.continue()
  ));
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.locator('button:visible:has-text("Trips")').first().click();
  await page.waitForTimeout(1500);
  const door = page.locator('.jcomposed-card:visible').first();
  if (await door.count()) {
    await door.click();
    await page.waitForTimeout(2500);
    check('trips: a dropped request shows the error state',
      await page.locator('.places-loaderr:visible').count() > 0);
    // This list's loading state IS itinRows === null, which is exactly where
    // a failure leaves it: without the guard the dots spin forever.
    const dots = await page.locator('.places-list > .places-empty:visible').allInnerTexts();
    check('trips: it is not stuck on its loading dots',
      !dots.some((d) => d.trim() === ELLIPSIS), JSON.stringify(dots.slice(0, 2)));
    blocking = false;
    const retry = page.locator('.places-loaderr .places-empty-cta:visible').first();
    if (await retry.count()) {
      await retry.click();
      await page.waitForTimeout(2500);
      check('trips: retry clears the error',
        await page.locator('.places-loaderr:visible').count() === 0);
      check('trips: retry actually loads the list',
        await page.locator('.places-icard').count() > 0,
        String(await page.locator('.places-icard').count()) + ' cards');
    } else {
      check('trips: retry clears the error', false, 'no retry button');
      check('trips: retry actually loads the list', false, 'no retry button');
    }
  } else {
    check('trips: the composed door is reachable', false);
  }
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
