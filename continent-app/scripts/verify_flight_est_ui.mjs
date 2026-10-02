// Headless verify that Carta shows no flight price of its own (T273), and
// that a fare the traveller typed still counts. Carta does not price flights
// (owner decision, 2026-10-02): the planner keeps the route it flies, but no
// receipt row, tag or total carries a Carta flight figure. Rewritten in T273;
// T266 wrote it to check the "~" and "est." tag T256 put on those rows. (The
// sibling verify_flight_estimates.mjs checks the pricing maths, not the
// screen.)
//
// Two shared trips from the share hash, both BGY then VCE from Charleroi:
//   1. no fare of the traveller's: the receipt shows the two flight rows as
//      route lines with no figure, no "~", no est. tag, the note that flights
//      are not in the total, and its rows add up to the total without them.
//   2. a typed fare of EUR 240 (ownFlight): the receipt shows that row at
//      EUR 240 and its rows, that one included, add up to the total.
// Each runs on a desktop and on a 380px phone, with no sideways scroll.
//
//   node scripts/verify_flight_est_ui.mjs [url]   (default http://127.0.0.1:$CARTA_PORT or 4173)
//
// Needs a server already running; it does not start one. Exits 1 on a failure.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || `http://127.0.0.1:${process.env.CARTA_PORT || 4173}/`;
mkdirSync('scripts/shots', { recursive: true });

const OWN_FARE = 240;
const draft = (extra = {}) => ({
  tripStart: '2026-08-24',
  stops: [
    { destinationId: 'BGY', nights: 2, activities: [] },
    { destinationId: 'VCE', nights: 2, activities: [] },
  ],
  groupSize: 2,
  transportPref: 'auto',
  pace: 'balanced',
  baggage: 'small',
  label: 'Flight verify trip',
  ...extra,
});
const hashOf = (d) => `trip=0.${Buffer.from(JSON.stringify(d)).toString('base64url')}`;

const CASES = [
  { name: 'unpriced', hash: hashOf(draft()) },
  { name: 'own-fare', hash: hashOf(draft({ ownFlight: { airline: 'Test Air', costTotal: OWN_FARE, mode: 'fly' } })) },
];

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('ok  ', msg);
// eur() prints whole euros in the app language ("€1,234"); English here.
const euros = (s) => {
  const m = String(s || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  return m ? Number(m) : NaN;
};

async function openReceipt(page, hash) {
  await page.addInitScript(() => {
    for (const k of ['continent.guestMode.v1', 'continent.mapGuideDismissed.v1', 'carta.fareNoticeSeen',
      'carta.welcomeSeen', 'carta.welcomeSeen.v1']) localStorage.setItem(k, '1');
    localStorage.setItem('continent.lang.v1', 'en');
  });
  await page.goto(`${BASE}?o=CRL#${hash}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
  await page.locator('.itin').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  // A pass prompt can sit over the planner for a guest; close it like a person would.
  const pass = page.locator('.pass-overlay .day-saved-close');
  if (await pass.count()) { await pass.first().click(); await page.waitForTimeout(500); }
  await page.locator('.itin-breakdown-toggle').click();
  await page.locator('.itin-breakdown-body').waitFor({ timeout: 10000 });
}

// The receipt's figures: every priced row (stays, daily life, legs,
// transfers, the traveller's own fare). Section subtotals are not rows.
async function receiptRows(page) {
  return page.locator('.itin-breakdown-body .trip-total-row .val, .itin-breakdown-body .itin-bd-leg .val')
    .evaluateAll((els) => els.map((e) => e.innerText.trim()));
}

const browser = await chromium.launch();
try {
  for (const [tag, viewport] of [['desktop', { width: 1360, height: 900 }], ['phone', { width: 380, height: 820 }]]) {
    for (const c of CASES) {
      const page = await browser.newPage({ viewport });
      const where = `[${tag} ${c.name}]`;
      await openReceipt(page, c.hash);

      const body = page.locator('.itin-breakdown-body');
      const vals = await receiptRows(page);
      const total = euros(await page.locator('.itin-breakdown-toggle strong').innerText());
      const sum = vals.map(euros).filter(Number.isFinite).reduce((a, b) => a + b, 0);

      // Ground legs may still carry the est. tag; a flight row may not.
      if (await body.locator('.itin-flight-unpriced .fare-prov-est').count()) {
        fail(`${where} a flight row carries an est. tag`);
      }

      if (c.name === 'unpriced') {
        const flightRows = body.locator('.itin-flight-unpriced');
        const n = await flightRows.count();
        if (n !== 2) fail(`${where} expected the flight out and home as two route rows, found ${n}`);
        else ok(`${where} the flight out and home show as route rows`);
        if (await flightRows.locator('.val').count()) fail(`${where} a flight row carries a figure`);
        else ok(`${where} no flight row carries a figure`);
        const flightText = (await flightRows.allInnerTexts()).join(' ');
        if (/[~€]/.test(flightText)) fail(`${where} a flight row shows a price: "${flightText.replace(/\s+/g, ' ')}"`);
        const note = await body.locator('.itin-flight-note').innerText().catch(() => '');
        if (!/not price/i.test(note)) fail(`${where} no note that flights are not in the total ("${note}")`);
        else ok(`${where} the receipt says flights are not in the total`);
        if (!(Math.abs(sum - total) <= vals.length)) fail(`${where} rows add up to €${sum}, the total says €${total}`);
        else ok(`${where} the rows add up to the total (€${sum} vs €${total}) with no flight in them`);
      } else {
        const own = vals.filter((v) => euros(v) === OWN_FARE);
        if (!own.length) fail(`${where} no receipt row reads the typed €${OWN_FARE} (rows: ${vals.join(' | ')})`);
        else ok(`${where} the typed fare shows as €${OWN_FARE}`);
        if (await body.locator('.itin-flight-unpriced').count()) fail(`${where} an unpriced flight row shows beside the typed fare`);
        if (!(Math.abs(sum - total) <= vals.length)) fail(`${where} rows add up to €${sum}, the total says €${total}`);
        else if (!(total >= OWN_FARE)) fail(`${where} the total €${total} is below the typed fare`);
        else ok(`${where} the typed fare counts in the total (€${sum} vs €${total})`);
      }

      await page.screenshot({ path: `scripts/shots/flight-${c.name}-${tag}.png` });
      // 380px floor: the receipt must not push the page sideways.
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) fail(`${where} ${over}px of sideways scroll with the receipt open`);
      await page.close();
    }
  }
} catch (e) {
  fail(String(e.message || e).split('\n')[0]);
} finally {
  await browser.close();
}
console.log(failures ? `verify_flight_est_ui: ${failures} FAILURES` : 'verify_flight_est_ui OK');
