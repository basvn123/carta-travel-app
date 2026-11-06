// Headless verify that Carta shows no flight price of its own (T273), and
// that a fare the traveller typed still counts. Carta does not price flights
// (owner decision, 2026-10-02): the planner keeps the route it flies, but no
// receipt row, tag or total carries a Carta flight figure. Rewritten in T273;
// T266 wrote it to check the "~" and "est." tag T256 put on those rows. T511
// removed the old fare data and its pricing harness, so this still holds.
//
// Two shared trips from the share hash, both BGY then VCE from Charleroi:
//   1. no fare of the traveller's: the receipt shows the two flight rows as
//      route lines with no figure, no "~", no est. tag, the note that flights
//      are not in the total, and its rows add up to the total without them.
//   2. a typed fare of EUR 240 (ownFlight): the receipt shows that row at
//      EUR 240 and its rows, that one included, add up to the total.
//   3. (T278) the same typed fare landing at Bergamo with Lake Como as the
//      first stop (anchorId, as the wizard sets it): the receipt prices the
//      Bergamo to Lake Como transfer, and it counts. A typed fare also keeps
//      the airport transfers the routed flight would have had (same row or
//      none, as case 1 shows it on this screen size).
// T278 also checks that a route row names no carrier and no time (both came
// from the frozen snapshots), and that the trip editor's own-fare block has
// a way back to the routed view.
// Each runs on a desktop and on a 380px phone, with no sideways scroll.
//
//   node scripts/verify_flight_est_ui.mjs [url]   (default http://127.0.0.1:$CARTA_PORT or 4173)
//
// T1089: rewritten for the trip page (cost card ts-total, route cards .jr-card); the
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
  { name: 'own-anchor', hash: hashOf(draft({
    stops: [
      { destinationId: 'gem:como', nights: 2, activities: [] },
      { destinationId: 'VCE', nights: 2, activities: [] },
    ],
    anchorId: 'BGY',
    ownFlight: { airline: 'Test Air', costTotal: OWN_FARE, mode: 'fly' },
  })) },
];

let failures = 0;
let unpricedAround = null;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('ok  ', msg);
// eur() prints whole euros in the app language ("€1,234"); English here.
const euros = (s) => {
  const m = String(s || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  return m ? Number(m) : NaN;
};

async function openReceipt(page, hash) {
  await page.addInitScript(() => {
    for (const k of ['continent.guestMode.v1', 'continent.mapGuideDismissed.v1', 'continent.homeSeen.v1', 'carta.fareNoticeSeen',
      'carta.welcomeSeen', 'carta.welcomeSeen.v1']) localStorage.setItem(k, '1');
    localStorage.setItem('continent.lang.v1', 'en');
  });
  await page.goto(`${BASE}?o=CRL#${hash}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
  // T1089: the trip page (TripPage) replaced the planner's .itin receipt: the
  // cost card is [data-testid=ts-total], the route is .jr with .jr-card steps.
  await page.locator('[data-testid="ts-total"]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  // A pass prompt can sit over the planner for a guest; close it like a person would.
  const pass = page.locator('.pass-overlay .day-saved-close');
  if (await pass.count()) { await pass.first().click(); await page.waitForTimeout(500); }
}

// The cost card's rows: label -> { eur, aria }; the total is data-total.
async function costCard(page) {
  return page.evaluate(() => ({
    total: Number(document.querySelector('[data-testid="ts-total"] .ccard-n')?.getAttribute('data-total')),
    rows: [...document.querySelectorAll('[data-testid="ts-total"] .ccard-row')].map((r) => ({
      label: r.querySelector('.ccard-label')?.textContent.trim(),
      eur: r.hasAttribute('data-eur') ? Number(r.getAttribute('data-eur')) : null,
      aria: r.querySelector('.ccard-hit')?.getAttribute('aria-label') || '',
    })),
  }));
}

const browser = await chromium.launch();
try {
  for (const [tag, viewport] of [['desktop', { width: 1360, height: 900 }], ['phone', { width: 380, height: 820 }]]) {
    for (const c of CASES) {
      const page = await browser.newPage({ viewport });
      const where = `[${tag} ${c.name}]`;
      await openReceipt(page, c.hash);

      const card = await costCard(page);
      const sum = card.rows.reduce((t, r) => t + (r.eur || 0), 0);
      const flightsRow = card.rows.find((r) => r.label === 'Flights');
      const flightCards = page.locator('.tpg-route .jr-card.is-flight');
      const routeText = await page.locator('.tpg-route').innerText();

      // Carta never prices a flight: no est. tag anywhere on the trip page.
      if (await page.locator('.fare-prov-est').count()) fail(`${where} a flight row carries an est. tag`);

      if (c.name === 'unpriced') {
        const n = await flightCards.count();
        if (n !== 2) fail(`${where} expected the flight out and home as two route cards, found ${n}`);
        else ok(`${where} the flight out and home show as route cards`);
        const flightText = (await flightCards.allInnerTexts()).join(' ');
        if (/[~€]/.test(flightText)) fail(`${where} a flight card shows a price: "${flightText.replace(/\s+/g, ' ')}"`);
        else ok(`${where} no flight card carries a figure`);
        // T278: no carrier and no time from the frozen snapshots.
        if (/Ryanair|Aviasales|Wizz|easyJet|\d{2}:\d{2}|departs/i.test(flightText)) fail(`${where} a flight card names a snapshot carrier or time: "${flightText.replace(/\s+/g, ' ')}"`);
        else ok(`${where} the flight cards name no carrier and no time`);
        if (!flightsRow || (flightsRow.eur || 0) !== 0 || !/not available/i.test(flightsRow.aria)) fail(`${where} the Flights row should carry no figure ("${flightsRow?.aria}")`);
        else ok(`${where} the cost card's Flights row carries no figure`);
        if (!(Math.abs(sum - card.total) <= card.rows.length)) fail(`${where} rows add up to €${sum}, the total says €${card.total}`);
        else ok(`${where} the rows add up to the total (€${Math.round(sum)} vs €${Math.round(card.total)}) with no flight in them`);
        unpricedAround = card.rows.find((r) => r.label === 'Getting around')?.eur;
      } else {
        if (!flightsRow || flightsRow.eur !== OWN_FARE) fail(`${where} the Flights row should read the typed €${OWN_FARE} (${flightsRow?.aria})`);
        else ok(`${where} the typed fare shows as €${OWN_FARE} on the cost card`);
        if (!new RegExp(`€\\s?${OWN_FARE}\\s*yours`).test(routeText.replace(/\n/g, ''))) fail(`${where} the route has no card reading the typed €${OWN_FARE}`);
        else ok(`${where} the route card reads the typed fare`);
        if (/not available yet/i.test(routeText)) fail(`${where} an unpriced flight card shows beside the typed fare`);
        if (c.name === 'own-anchor') {
          // T278: the typed fare lands at Bergamo, so the Bergamo to Lake Como
          // transfer counts in Getting around beyond the Como to Venice hop.
          const around = card.rows.find((r) => r.label === 'Getting around')?.eur;
          const hops = await page.locator('.tpg-route .jr-card.is-hop .money').allInnerTexts();
          const hopSum = hops.reduce((t, h) => t + Number(h.replace(/[^\d.]/g, '')), 0);
          if (!(around > hopSum)) fail(`${where} Getting around (€${around}) holds no transfer beyond the hops (€${hopSum})`);
          else ok(`${where} the Bergamo to Lake Como transfer is priced (€${Math.round(around)} vs hops €${hopSum})`);
        }
        if (!(Math.abs(sum - card.total) <= card.rows.length)) fail(`${where} rows add up to €${sum}, the total says €${card.total}`);
        else if (!(card.total >= OWN_FARE)) fail(`${where} the total €${card.total} is below the typed fare`);
        else ok(`${where} the typed fare counts in the total (€${Math.round(sum)} vs €${Math.round(card.total)})`);
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
