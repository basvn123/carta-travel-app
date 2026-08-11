// Headless verify of "Carta doesn't have this town, go and get it".
//
// The bug this covers: asking the chat for Lokeren (a real Belgian town, not
// in the 1,570-destination catalogue) silently relocated the day to Ghent,
// 20 km away. Now the traveller is offered the town they asked for, Carta
// researches it from open data, and it becomes a real destination.
//
// Every outside source is intercepted (Nominatim, both Wikipedias, Overpass,
// the suggest-city Edge Function), so the run is deterministic and offline.
//
//   node scripts/ai/verify_city_research.mjs [url] [shotdir]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:4173/';
const SHOTS = process.argv[3] || 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';

const STAY_GEOCODE = [{
  display_name: '10, Wittewalle, Ghent, East Flanders, Belgium',
  name: 'Wittewalle',
  lat: '51.0543', lon: '3.7174', type: 'house', addresstype: 'house',
}];

// Lokeren as Nominatim returns it: a town, with the country code and the
// population the harvest reads.
const LOKEREN_GEOCODE = [{
  display_name: 'Lokeren, East Flanders, Flanders, Belgium',
  name: 'Lokeren',
  lat: '51.1044', lon: '3.9899',
  category: 'boundary', type: 'administrative', addresstype: 'town',
  address: { town: 'Lokeren', country: 'Belgium', country_code: 'be' },
  extratags: { population: '50312', wikipedia: 'nl:Lokeren' },
}];

const SUGGESTIONS = {
  suggestions: [
    { id: 'mock-cat', name: 'Bruges', country: 'Belgium', why: 'Canals and a compact old town.', inCatalog: true },
    {
      name: 'Lokeren', country: 'Belgium', why: 'A quiet Waasland town on the Durme.', inCatalog: false, lat: 51.1044, lon: 3.9899,
    },
  ],
};

// What the two Wikipedias and OpenStreetMap know about Lokeren. Deliberately
// mixed: a settlement and a station that must be filtered out, articles that
// must survive, and an OSM-only museum.
const WIKI_PAGES = {
  nl: [
    { pageid: 101, title: 'Sint-Laurentiuskerk (Lokeren)', description: 'kerkgebouw in Lokeren, België', lat: 51.1042, lon: 3.992, thumb: 'https://upload.wikimedia.org/w/kerk.jpg' },
    { pageid: 102, title: 'Oud Postgebouw', description: 'historisch gebouw in Lokeren, België', lat: 51.105, lon: 3.9887, thumb: 'https://upload.wikimedia.org/w/post.jpg' },
    { pageid: 103, title: 'Heirbrugmolen', description: 'windmolen in Lokeren, België', lat: 51.1036, lon: 3.9769, thumb: '' },
    { pageid: 104, title: 'Daknam', description: 'plaats in de Oost-Vlaamse gemeente Lokeren, België', lat: 51.1253, lon: 3.98, thumb: '' },
    { pageid: 105, title: 'Station Lokeren', description: 'spoorwegstation in België', lat: 51.1075, lon: 3.9915, thumb: '' },
  ],
  en: [
    { pageid: 201, title: 'Verloren Bos', description: 'castle park in Lokeren, Belgium', lat: 51.11, lon: 3.9976, thumb: 'https://upload.wikimedia.org/w/bos.jpg' },
    { pageid: 202, title: 'Zele', description: 'Municipality in Flemish Community, Belgium', lat: 51.0667, lon: 4.0333, thumb: '' },
  ],
};
const WIKI_EXTRACTS = {
  101: 'The Saint Lawrence church is the parish church of Lokeren, rebuilt in 1730.',
  102: 'The old post office of Lokeren is a protected monument on the market square.',
  103: 'The Heirbrug mill is a wooden post mill on the edge of town.',
  201: 'Verloren Bos is a castle park on the north side of Lokeren.',
};

const OVERPASS = {
  elements: [
    { type: 'node', id: 1, lat: 51.1057, lon: 3.9901, tags: { name: 'Stadsmuseum Lokeren', tourism: 'museum', wikidata: 'Q1' } },
    { type: 'way', id: 2, center: { lat: 51.1042, lon: 3.992 }, tags: { name: 'Sint-Laurentiuskerk', amenity: 'place_of_worship', religion: 'christian' } },
    { type: 'way', id: 3, center: { lat: 51.104, lon: 3.9892 }, tags: { name: 'Oud Stadhuis', historic: 'building', heritage: '4' } },
    { type: 'node', id: 4, lat: 51.1029, lon: 3.9885, tags: { name: 'Kasteel van Sterrebeek', historic: 'castle' } },
    { type: 'way', id: 5, center: { lat: 51.1091, lon: 3.9942 }, tags: { name: 'Park ter Beuken', leisure: 'park' } },
    { type: 'node', id: 6, lat: 51.1046, lon: 3.9894, tags: { name: 'Lokerse Schandpaal', historic: 'wayside_cross' } },
  ],
};

const errors = [];
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, cond });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : `  (${detail})`}`);
};
const isMockAuthNoise = (s) => /401|day_plans|user_settings|Invalid (JWT|Refresh Token)|AuthApiError|JWSError|PGRST301|JWT/i.test(s);

const browser = await chromium.launch();

function wikiBody(url) {
  const lang = /https:\/\/(\w+)\.wikipedia/.exec(url)?.[1] || 'en';
  const pages = WIKI_PAGES[lang] || [];
  if (url.includes('/api/rest_v1/page/summary/')) {
    if (lang !== 'en') return { type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' };
    return {
      title: 'Lokeren',
      extract: 'Lokeren is a city and municipality in the Belgian province of East Flanders. It lies on the river Durme.',
      thumbnail: { source: 'https://upload.wikimedia.org/w/lokeren.jpg' },
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Lokeren' } },
    };
  }
  if (url.includes('generator=geosearch')) {
    const out = {};
    pages.forEach((p) => {
      out[p.pageid] = {
        pageid: p.pageid,
        title: p.title,
        description: p.description,
        coordinates: [{ lat: p.lat, lon: p.lon }],
        ...(p.thumb ? { thumbnail: { source: p.thumb } } : {}),
      };
    });
    return { query: { pages: out } };
  }
  if (url.includes('prop=extracts')) {
    const ids = decodeURIComponent(/pageids=([^&]+)/.exec(url)?.[1] || '').split('|');
    const out = {};
    ids.forEach((id) => {
      out[id] = {
        pageid: Number(id),
        extract: WIKI_EXTRACTS[id] || '',
        fullurl: `https://${lang}.wikipedia.org/wiki/page${id}`,
      };
    });
    return { query: { pages: out } };
  }
  return {};
}

async function setup(page) {
  page.on('pageerror', (e) => {
    const msg = (e && (e.message || e.toString())) || 'unknown';
    if (!isMockAuthNoise(msg)) errors.push(`pageerror: ${msg.split('\n')[0]}`);
  });
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('UNHANDLED::')) { if (!isMockAuthNoise(t)) errors.push(`rejection: ${t.slice(11, 160)}`); return; }
    if (m.type() !== 'error') return;
    if (/tile|cartocdn|ERR_|emrldtp|config is not valid|nominatim/i.test(t)) return;
    if (isMockAuthNoise(t)) return;
    errors.push(`console: ${t.slice(0, 140)}`);
  });

  await page.route('**/nominatim.openstreetmap.org/**', (r) => {
    const url = r.request().url();
    const body = /lokeren/i.test(url) ? LOKEREN_GEOCODE : STAY_GEOCODE;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/*.wikipedia.org/**', (r) => {
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wikiBody(r.request().url())) });
  });
  // Slow on purpose: a real harvest takes seconds, and the progress card that
  // fills them is the part of this flow a traveller actually sits through.
  await page.route('**/api/interpreter**', async (r) => {
    await new Promise((done) => setTimeout(done, 900));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERPASS) });
  });
  await page.route('**/functions/v1/suggest-city', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUGGESTIONS) });
  });

  await page.addInitScript(({ ref }) => {
    window.addEventListener('unhandledrejection', (e) => {
      let out; try { out = JSON.stringify(e.reason, Object.getOwnPropertyNames(Object(e.reason))); } catch { out = String(e.reason); }
      console.log('UNHANDLED::' + out);
    });
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.removeItem('carta.dayplans.v1');
    const year = Math.floor(Date.now() / 1000) + 31536000;
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: 'mock.access.token', token_type: 'bearer', expires_in: 31536000,
      expires_at: year, refresh_token: 'mock-refresh',
      user: {
        id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated',
        role: 'authenticated', email: 'preview@example.com',
        app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(),
      },
    }));
  }, { ref: PROJECT_REF });
}

// Stay -> when -> how -> chat, then focus + interests, landing on the town step.
async function reachTownStep(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  for (const btn of await page.getByRole('button').all()) {
    const t = (await btn.innerText().catch(() => '')).trim();
    if (/day planner/i.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
  }
  await page.waitForTimeout(1500);

  await page.locator('.day-flow-search input').fill('10 Wittewalle Ghent');
  await page.getByRole('button', { name: /^find$/i }).click();
  await page.waitForTimeout(1200);
  await page.locator('.day-stay-result').first().click();
  await page.waitForTimeout(500);
  await page.locator('.day-flow-next').click();
  await page.waitForTimeout(600);

  const nextBtn = page.locator('.day-flow-next');
  if (await nextBtn.isDisabled()) {
    await page.locator('.day-flow-date input').first().fill('2026-08-04').catch(() => {});
    await page.waitForTimeout(400);
  }
  await nextBtn.click();
  await page.waitForTimeout(600);
  await page.locator('.day-flow-card.primary').click();
  await page.waitForTimeout(700);

  await page.locator('.chat-opt').first().click();          // focus
  await page.waitForTimeout(350);
  await page.locator('.chat-opts-multi .chat-opt').first().click();
  await page.waitForTimeout(150);
  await page.locator('.chat-send-multi').click();           // interests
  await page.waitForTimeout(400);
}

async function run(label, viewport) {
  const page = await browser.newPage({ viewport });
  await setup(page);
  // No clearing of carta.discovered.v1 here: an init script re-runs on every
  // navigation, so it would wipe the researched town during the reload check
  // below. A fresh page context already starts with empty storage.
  await reachTownStep(page);

  // ---- ask Carta for a town it doesn't have ----
  await page.locator('.chat-town-tab').filter({ hasText: 'Ask Carta' }).click();
  await page.locator('.chat-town-ai input').fill('somewhere quiet near the Durme');
  await page.locator('.chat-town-ai .chat-send').click();
  await page.waitForTimeout(800);
  const names = await page.locator('.chat-town-ai .chat-opts .chat-opt-text b').allInnerTexts();
  check(`${label}: the off-catalogue suggestion is offered`, names.some((s) => /lokeren/i.test(s)), names.join(' / '));

  await page.locator('.chat-town-ai .chat-opts .chat-opt').filter({ hasText: 'Lokeren' }).click();
  await page.waitForTimeout(400);

  // ---- the card names the town that was ASKED for ----
  const card = page.locator('.chat-town-resolve');
  const cardText = await card.innerText();
  check(`${label}: picking it does not silently relocate the day`,
    (await page.getByText(/have you been here before\?/i).count()) === 0);
  check(`${label}: the card names Lokeren, not the nearest catalogue city`,
    /lokeren/i.test(cardText));
  check(`${label}: research leads the card`,
    (await card.locator('.chat-opt-lead').count()) === 1
    && /research lokeren/i.test(await card.locator('.chat-opt-lead').innerText()));
  check(`${label}: the nearest catalogue town is still offered as the fallback`,
    /ghent/i.test(cardText) && /km away/i.test(cardText));
  await page.screenshot({ path: `${SHOTS}/cr1-${label}-unknown-town.png` });

  // ---- research it ----
  await card.locator('.chat-opt-lead').click();
  await page.waitForTimeout(500);
  const working = page.locator('.chat-town-working');
  check(`${label}: the wait names the source being read`,
    (await working.count()) === 1 && /wikipedia|openstreetmap|map/i.test(await working.innerText()),
    await working.innerText().catch(() => 'no progress card'));
  check(`${label}: the tabs are held while the harvest runs`,
    await page.locator('.chat-town-tab').first().isDisabled());
  await page.screenshot({ path: `${SHOTS}/cr2-${label}-researching.png` });
  await page.waitForTimeout(3000);

  check(`${label}: researching the town advances the wizard`,
    (await page.getByText(/have you been here before\?/i).count()) >= 1);
  const said = await page.locator('.chat-bubble.me').last().innerText();
  check(`${label}: the day is set in Lokeren, not Ghent`, /lokeren/i.test(said) && !/ghent/i.test(said), said);
  await page.screenshot({ path: `${SHOTS}/cr3-${label}-researched.png` });

  // ---- it is a real destination now ----
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('carta.discovered.v1') || '{}'));
  const dest = Object.values(stored)[0];
  check(`${label}: the town is stored as a destination`, !!dest && dest.city === 'Lokeren' && dest.country === 'Belgium');
  const pois = dest?.activities?.items_full || [];
  check(`${label}: it has sights with real coordinates`,
    pois.length >= 4 && pois.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    `${pois.length} pois`);
  check(`${label}: the settlement and the railway station were filtered out`,
    !pois.some((p) => /^Daknam$|^Zele$|Station/i.test(p.name)),
    pois.map((p) => p.name).join(' / '));
  check(`${label}: Wikipedia and OpenStreetMap were merged, not stacked`,
    pois.filter((p) => /Sint-Laurentiuskerk/i.test(p.name)).length === 1);
  check(`${label}: the sight keeps its local name and gains an English description`,
    pois.some((p) => p.name === 'Sint-Laurentiuskerk' && /parish church/i.test(p.desc || '')));
  check(`${label}: no nightly rate was invented for a town nobody measured`, !dest?.accommodation);

  // ---- and it stays in the app ----
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const btn of await page.getByRole('button').all()) {
    const t = (await btn.innerText().catch(() => '')).trim();
    if (/day planner/i.test(t) && (await btn.isVisible().catch(() => false))) { await btn.click(); break; }
  }
  await page.waitForTimeout(1500);
  await page.locator('.day-flow-search input').fill('10 Wittewalle Ghent');
  await page.getByRole('button', { name: /^find$/i }).click();
  await page.waitForTimeout(1200);
  await page.locator('.day-stay-result').first().click();
  await page.waitForTimeout(600);
  const townPins = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('carta.discovered.v1') || '{}')));
  check(`${label}: the researched town survives a reload`, townPins.some((id) => /lokeren/i.test(id)), townPins.join(','));

  // The real proof that it joined the app: the picker's own catalogue search
  // finds it without going out to the map again. That list (allCityOptions) is
  // built from the same destination map the explore map's pins come from.
  await page.locator('.day-flow-next').click();
  await page.waitForTimeout(600);
  const next2 = page.locator('.day-flow-next');
  if (await next2.isDisabled()) {
    await page.locator('.day-flow-date input').first().fill('2026-08-04').catch(() => {});
    await page.waitForTimeout(400);
  }
  await next2.click();
  await page.waitForTimeout(600);
  await page.locator('.day-flow-card.primary').click();
  await page.waitForTimeout(700);
  await page.locator('.chat-opt').first().click();
  await page.waitForTimeout(350);
  await page.locator('.chat-opts-multi .chat-opt').first().click();
  await page.waitForTimeout(150);
  await page.locator('.chat-send-multi').click();
  await page.waitForTimeout(400);
  await page.locator('.chat-town-tab').filter({ hasText: 'Search' }).click();
  await page.locator('.chat-town-search input').fill('Lokeren');
  await page.waitForTimeout(400);
  const matches = await page.locator('.chat-town-search .chat-opts .chat-opt-text b').allInnerTexts();
  check(`${label}: search now finds it without leaving the catalogue`,
    matches.some((s) => /lokeren/i.test(s)), matches.join(' / '));
  await page.screenshot({ path: `${SHOTS}/cr4-${label}-now-searchable.png` });

  await page.close();
}

await run('desktop', { width: 1440, height: 950 });

await browser.close();
const failed = results.filter((r) => !r.cond).length;
console.log(`\nchecks failed: ${failed}  |  console/page errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log('  ' + e));
process.exit(failed || errors.length ? 1 : 0);
