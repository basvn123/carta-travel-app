// Does Google actually read our q sentence back?
//
//   node scripts/verify_google_flights.mjs
//
// Google documents no deep-link parameters for flight search, so the only
// honest check is to open the URL in a real browser and look at what the page
// ends up showing. That makes this script slow, networked and dependent on a
// third party, which is why it is NOT part of the default verify run: the
// offline format checks live in verify_transport_links.mjs. Run this by hand
// after changing the q sentence in lib/transportLinks.js.
//
// A pass means the route came back in the search fields and the page title
// names both cities. The generic "Find Cheap Flights Worldwide" title is the
// failure: it means Google rejected the sentence and threw the route away.
import { chromium } from 'playwright';
import { googleFlightsLink, googleFlightsExploreLink } from '../src/lib/transportLinks.js';

const CASES = [
  { label: 'a dated return', url: googleFlightsLink({ fromIata: 'AMS', toIata: 'FCO', date: '2026-11-12', returnDate: '2026-11-19', lang: 'en' }), want: [/Amsterdam/i, /Rome/i] },
  { label: 'a one way', url: googleFlightsLink({ fromIata: 'BRU', toIata: 'SZG', date: '2026-11-12', lang: 'en' }), want: [/Brussels/i, /Salzburg/i] },
  { label: 'an undated route', url: googleFlightsLink({ fromIata: 'BRU', toIata: 'LIS', lang: 'en' }), want: [/Brussels/i, /Lisbon/i] },
  { label: 'explore, with a month', url: googleFlightsExploreLink({ fromIata: 'BRU', month: '2026-11', lang: 'en' }), want: [/Brussels/i, /anywhere/i] },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'en-GB' });
const results = [];

for (const c of CASES) {
  const page = await ctx.newPage();
  let ok = false;
  let note = '';
  try {
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // The consent wall answers 200 for every URL and proves nothing, so it has
    // to be cleared before the page can be read at all.
    for (const sel of ['button:has-text("Accept all")', 'form[action*="consent"] button', '[aria-label*="Accept all"]']) {
      const b = page.locator(sel).first();
      if (await b.count().catch(() => 0)) {
        await b.click({ timeout: 8000 }).catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(8000);
    const title = await page.title();
    const values = await page.locator('input').evaluateAll((els) => els.map((e) => e.value).filter(Boolean)).catch(() => []);
    const hay = `${title} ${values.join(' ')}`;
    ok = c.want.every((re) => re.test(hay));
    note = title;
  } catch (e) {
    note = `ERR ${e.message.slice(0, 90)}`;
  }
  results.push({ label: c.label, ok, note, url: c.url });
  await page.close();
  // Google throttles a burst of these; the pause keeps a full run honest.
  await new Promise((r) => setTimeout(r, 15000));
}
await browser.close();

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (${r.note})`);
  if (!r.ok) console.log(`      ${r.url}`);
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} prefilled`);
process.exit(bad ? 1 : 0);
