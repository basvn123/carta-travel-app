// Headless verify that no fare provenance mark sits on a Carta flight figure
// (T279, closes T266-b and T267-c). Carta does not price flights (T273, owner
// decision 2026-10-02), so there is no flight price to tag: no tilde before a
// flight figure, no est. chip, no "seen N days ago" chip, no "from" phrasing
// on a flight. A fare the traveller typed is theirs, and shows as a plain
// figure with no tag. Ground legs still carry their real est. flags, and the
// booking note still sits near external links; both are checked.
//
// The old version drove the removed map results list and expected a no-tilde,
// no-chip baseline that T256 reversed and T273 replaced. This one runs the
// trip receipt (the one place a flight row and a typed fare both show),
// under three ?provmock bags. (The Destinations city-day cards sit several
// clicks deep; verify_places_tab.mjs reaches them and owns that check.) The mock must
// change nothing on a flight row, because there is no flight figure for it
// to tag:
//   (none)             baseline
//   age:3              a fare seen 3 days ago
//   age:3,est:1        a model estimate
//
//   node scripts/verify_fare_provenance.mjs [url]
//     url defaults to http://127.0.0.1:$CARTA_PORT or 5206. If nothing answers
//     there, a vite dev server is started on that port (dev has the e2e seams
//     on; a build needs VITE_E2E_SEAMS=1). Exits 1 on a failure.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT || 5206);
const BASE = (process.argv[2] || `http://127.0.0.1:${PORT}/`).replace(/\/?$/, '/');
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 240; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite never came up');
};

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('ok  ', msg);
const euros = (s) => {
  const m = String(s || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  return m ? Number(m) : NaN;
};

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
  label: 'Provenance verify trip',
  ...extra,
});
const hashOf = (d) => `trip=0.${Buffer.from(JSON.stringify(d)).toString('base64url')}`;
const HASHES = {
  unpriced: hashOf(draft()),
  own: hashOf(draft({ ownFlight: { airline: 'Test Air', costTotal: OWN_FARE, mode: 'fly' } })),
};

const MOCKS = [['plain', ''], ['seen', 'age:3'], ['est', 'age:3,est:1']];
const VIEWPORTS = [['desktop', { width: 1360, height: 900 }], ['phone', { width: 380, height: 820 }]];

const browser = await (async () => {
  await waitForServer();
  return chromium.launch();
})();

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    for (const k of ['continent.guestMode.v1', 'continent.mapGuideDismissed.v1', 'carta.fareNoticeSeen',
      'carta.welcomeSeen', 'carta.welcomeSeen.v1']) localStorage.setItem(k, '1');
    localStorage.setItem('continent.lang.v1', 'en');
  });
  return page;
}

const TAG = '.fare-prov, .fare-prov-est, .fare-prov-age';

/** The trip receipt. kind is 'unpriced' (no typed fare) or 'own' (typed). */
async function checkTrip(kind, mockName, mock, vpName, viewport) {
  const where = `[trip ${kind} ${mockName} ${vpName}]`;
  const page = await newPage(viewport);
  await page.goto(`${BASE}?o=CRL${mock ? `&provmock=${mock}` : ''}#${HASHES[kind]}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
  await page.locator('.itin').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  const pass = page.locator('.pass-overlay .day-saved-close');
  if (await pass.count()) { await pass.first().click(); await page.waitForTimeout(500); }
  await page.locator('.itin-breakdown-toggle').click();
  await page.locator('.itin-breakdown-body').waitFor({ timeout: 10000 });
  const body = page.locator('.itin-breakdown-body');

  if (kind === 'unpriced') {
    const rows = body.locator('.itin-flight-unpriced');
    const n = await rows.count();
    if (n !== 2) fail(`${where} expected two unpriced flight rows, found ${n}`);
    else ok(`${where} flight out and home are route rows`);
    const text = (await rows.allInnerTexts()).join(' ').replace(/\s+/g, ' ');
    if (/[~€]/.test(text)) fail(`${where} a flight row shows a price mark: "${text}"`);
    else ok(`${where} no tilde or euro figure on a flight row`);
    if (await rows.locator(TAG).count()) fail(`${where} a flight row carries a provenance tag`);
    else ok(`${where} no est. or age tag on a flight row`);
    if (await rows.locator('.val').count()) fail(`${where} a flight row carries a value cell`);
    const total = (await page.locator('.itin-breakdown-toggle strong').innerText()).trim();
    if (total.includes('~')) fail(`${where} the total carries a tilde: "${total}"`);
    else ok(`${where} the total reads "${total}" with no tilde`);
  } else {
    const vals = await body.locator('.trip-total-row .val').allInnerTexts();
    const mine = body.locator('.trip-total-row', { has: page.locator('.val', { hasText: String(OWN_FARE) }) });
    if (!vals.some((v) => euros(v) === OWN_FARE)) fail(`${where} no row reads the typed EUR ${OWN_FARE} (${vals.join(' | ')})`);
    else ok(`${where} the typed fare shows as EUR ${OWN_FARE}`);
    const mineText = (await mine.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (mineText.includes('~')) fail(`${where} the typed fare carries a tilde: "${mineText}"`);
    if (await mine.first().locator(TAG).count()) fail(`${where} the typed fare carries a provenance tag`);
    else ok(`${where} the typed fare is untagged, the traveller's own`);
    if (await body.locator('.itin-flight-unpriced').count()) fail(`${where} an unpriced flight row sits beside the typed fare`);
  }

  // Ground legs keep their own flags; open the first leg for its booking
  // links and the price-change note.
  const legs = page.locator('.itin-leg-main');
  if (await legs.count()) {
    await legs.first().click();
    await page.locator('.itin-leg .trip-leg-links').first().waitFor({ timeout: 15000 }).catch(() => {});
    const links = await page.locator('.itin-leg .cost-action, .itin-leg .trip-leg-links a').count();
    const notes = await page.locator('.itin .booking-note').count();
    if (links > 0 && notes < 1) fail(`${where} booking links without the price-change note`);
    else ok(`${where} booking note near links (links ${links}, notes ${notes})`);
  }
  if (mock) {
    // A mock bag adds provenance to anything that carries fields; a flight
    // figure carries none, so no flight row may react to it.
    const flightTags = await page.locator('.itin .itin-flight-unpriced .fare-prov, .itin .itin-flight-row .fare-prov').count();
    if (flightTags) fail(`${where} a flight row reacted to the provenance mock (${flightTags})`);
    else ok(`${where} the provenance mock leaves flight rows alone`);
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) fail(`${where} ${over}px of sideways scroll`);
  await page.screenshot({ path: `${SHOTS}/prov-trip-${kind}-${mockName}-${vpName}.png` });
  await page.close();
}

try {
  for (const [vpName, vp] of VIEWPORTS) {
    for (const [mockName, mock] of MOCKS) {
      await checkTrip('unpriced', mockName, mock, vpName, vp);
      await checkTrip('own', mockName, mock, vpName, vp);
    }
  }
} catch (err) {
  fail(String(err.message || err).split('\n')[0]);
} finally {
  await browser.close().catch(() => {});
  if (srv) srv.kill();
}
console.log(failures ? `verify_fare_provenance: ${failures} FAILURES` : 'verify_fare_provenance OK');
