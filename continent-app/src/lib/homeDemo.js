/**
 * The home page's data (T463, after T462): the five chapters of the story,
 * the screens that show them, the questions under the hero and the six
 * travellers, all pure so tests/home.test.mjs runs them in Node against the
 * shipped catalogue.
 *
 * The screens are captures of the running app (scripts/shoot_home_screens.mjs
 * writes public/home/<lang>/<screen>.webp), one set per language, opened
 * through the same links a traveller can open: a search, Lake Bled's page,
 * the Julian Alps trip and a day at Bled. The home page never draws a copy of
 * the app; the owner found the coded demo of T462 unconvincing.
 *
 * A traveller's card is one real place: its photograph, its name and its own
 * day price at the traveller's Lifestyle, read from the same cost index as
 * Explore, so the card and the place's page agree (T464).
 */

/** The languages the screens were captured in; anything else reads English. */
export const SCREEN_LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

/** A captured screen's address. `desk` is the laptop capture, the rest phone. */
export function screenSrc(lang, id) {
  const l = SCREEN_LANGS.includes(lang) ? lang : 'en';
  return `/home/${l}/${id}.webp`;
}

/** The pixel size of each capture, so its box is reserved before it loads. */
export const SCREEN_SIZE = { phone: [600, 1298], desk: [1728, 1080] };

/** The place the story opens, and the search that finds it. */
export const STORY_PLACE = 'gem:bled';
export const STORY_SEARCH = { vibe: 'lake', area: 'alps', month: 7 };

/** The story, in order: one chapter per moment, each with the screen that
 *  shows it and the one door that goes there. `peek` is how far the screen
 *  rises inside a phone chapter card (T464), as a share of the capture's
 *  height, so the card's window shows what its chapter claims: the day
 *  price on the place's page, the priced beds of the route, the day kit
 *  and its exports. */
export const CHAPTERS = [
  { id: 'find', tab: 'home.chFind', title: 'home.ch1Title', body: 'home.ch1', alt: 'home.ch1Alt', door: 'search', peek: '-14%' },
  { id: 'place', tab: 'home.chPrice', title: 'home.ch2Title', body: 'home.ch2', alt: 'home.ch2Alt', door: 'place', peek: '-41%' },
  { id: 'plan', tab: 'home.chPlan', title: 'home.ch3Title', body: 'home.ch3', alt: 'home.ch3Alt', door: 'trip', peek: '-9%' },
  { id: 'day', tab: 'home.chDay', title: 'home.ch4Title', body: 'home.ch4', alt: 'home.ch4Alt', door: 'day', peek: '-14%' },
  { id: 'share', tab: 'home.chShare', title: 'home.ch5Title', body: 'home.ch5', alt: 'home.ch5Alt', door: 'trips', peek: '-37.5%' },
];

/** The searches offered under the hero: a whole i18n string each (never a
 *  built sentence) and the guided facets it applies in Explore. The one with
 *  a budget leads (T464): it is the only chip that shows what Carta does
 *  differently, and on a phone the third chip sat off the screen. Walking
 *  comes next, because hikers are the first audience (PRODUCT.md). */
export const SEARCHES = [
  { key: 'home.try2', facets: { vibe: 'beach', country: 'PT', budget: 80 }, price: 80 },
  { key: 'home.try3', facets: { vibe: 'hiking', area: 'alps', month: 7 } },
  { key: 'home.try1', facets: STORY_SEARCH },
];

/** Explore's own address for a guided question (the URL lib/guidedSearch.js
 *  documents: xe vibe, xa area, xc country, xm month, xb budget, xp flags),
 *  so a search opened in a new tab keeps its question. */
export function exploreHref(f = {}) {
  const q = new URLSearchParams();
  q.set('tab', 'map');
  if (f.vibe) q.set('xe', f.vibe);
  if (f.area) q.set('xa', f.area);
  if (f.country) q.set('xc', f.country);
  if (f.month) q.set('xm', String(f.month));
  if (f.budget) q.set('xb', String(f.budget));
  const flags = `${f.nocar ? 'c' : ''}${f.quiet ? 'q' : ''}`;
  if (flags) q.set('xp', flags);
  return `?${q.toString()}`;
}

/** A Wikimedia Commons thumbnail at 1280 px; HeroImage builds the srcset down
 *  from it (lib/heroImage.js, the widths Commons renders). */
const commons = (path) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}/1280px-${path.split('/').pop()}`;

/**
 * The six travellers, in PRODUCT.md's order (hikers first, then families at
 * the beach, cyclists, car-free travellers, city breaks and tight budgets).
 * Each opens Explore on its own question, except cyclists, whose routes live
 * in Destinations and carry no day price of their own: their pill names what
 * the card opens instead of a figure.
 *
 * Each card is one real place (T464, after the critique found a "from" day price of 60 euros
 * printed on the Matterhorn, a figure that belonged to a town in
 * Slovenia): `place` is a catalogue id that the card's own search returns,
 * `label` its short name, and the pill on the photo is that place's own day
 * price at the traveller's Lifestyle. So the photograph, the name and the
 * figure are the same place, and Explore shows the same figure for it.
 *
 * `photo` is one Commons file of that place, checked by hand (2026-10-17):
 * its Commons categories say what it shows ("Triglav National Park",
 * "Praia dos Pescadores, Albufeira", "Views of Cesky Krumlov from the
 * castle", "Views of Ribeira from Cais de Gaia", "Stari Most viewed from
 * south"), the original is at least 2900 px wide, and its author and licence
 * travel with it to the credits. `focus` is the object-position that keeps
 * the subject in the card's 4:5 crop.
 */
export const PERSONAS = [
  {
    id: 'hike', title: 'home.pHikeTitle', body: 'home.pHike', facets: { vibe: 'hiking', area: 'alps' },
    place: 'gem:soca-valley', label: 'Bovec',
    photo: {
      url: commons('c/cd/Bovec_Bav%C5%A1ki_Grintavec_Obere_So%C4%8Da_Jalovec_17072018_3951.jpg'), w: 7360, h: 4912, focus: '40% center',
      credit: 'Above the Soča valley, Bovec', author: 'Johann Jaritz', licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Bovec_Bav%C5%A1ki_Grintavec_Obere_So%C4%8Da_Jalovec_17072018_3951.jpg',
    },
  },
  {
    id: 'family', title: 'home.pFamilyTitle', body: 'home.pFamily', facets: { vibe: 'family', nb: ['beach'] },
    place: 'gem:albufeira', label: 'Albufeira',
    photo: {
      url: commons('6/6a/15-09-2017_Praia_dos_Pescadores%2C_Albufeira_%283%29.JPG'), w: 3456, h: 4608, focus: 'center 55%',
      credit: 'Praia dos Pescadores, Albufeira', author: 'Kolforn', licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:15-09-2017_Praia_dos_Pescadores,_Albufeira_(3).JPG',
    },
  },
  {
    id: 'cycle', title: 'home.pCycleTitle', body: 'home.pCycle', kind: 'cycling', pill: 'home.pCyclePill',
    photo: {
      url: commons('2/2a/Col_Aubisque.jpg'), w: 3622, h: 2194, focus: '78% center',
      credit: "Col d'Aubisque", author: 'Myrabella', licence: 'CC BY-SA 3.0',
      page: 'https://commons.wikimedia.org/wiki/File:Col_Aubisque.jpg',
    },
  },
  {
    id: 'nocar', title: 'home.pNoCarTitle', body: 'home.pNoCar', facets: { vibe: 'oldtown', nocar: true },
    place: 'gem:cesky-krumlov', label: 'Český Krumlov',
    photo: {
      url: commons('0/0c/View_of_%C4%8Cesk%C3%BD_Krumlov_from_the_castle%2C_20250504_1305_8880.jpg'), w: 5802, h: 3848, focus: '38% center',
      credit: 'Český Krumlov from the castle', author: 'Jakub Hałun', licence: 'CC BY 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:View_of_%C4%8Cesk%C3%BD_Krumlov_from_the_castle,_20250504_1305_8880.jpg',
    },
  },
  {
    id: 'city', title: 'home.pCityTitle', body: 'home.pCity', facets: { vibe: 'city' },
    place: 'OPO', label: 'Porto',
    photo: {
      url: commons('2/21/Rabelo_boats_and_Ribeira_seen_from_Cais_de_Gaia%2C_20250605_1623_9879.jpg'), w: 5920, h: 3951, focus: '42% center',
      credit: 'Ribeira, Porto', author: 'Jakub Hałun', licence: 'CC BY 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Rabelo_boats_and_Ribeira_seen_from_Cais_de_Gaia,_20250605_1623_9879.jpg',
    },
  },
  {
    id: 'budget', title: 'home.pBudgetTitle', body: 'home.pBudget', facets: { budget: 60 },
    place: 'gem:mostar-ba', label: 'Mostar',
    photo: {
      url: commons('0/0e/Mostar_Stari_Most_BW_2024-10-01_13-03-38.jpg'), w: 3698, h: 5562, focus: 'center 40%',
      credit: 'Stari Most, Mostar', author: 'Berthold Werner', licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Mostar_Stari_Most_BW_2024-10-01_13-03-38.jpg',
    },
  },
];

/** True when the day figure leans on a country-level stand-in. The same
 *  predicate as isNational() in components/CostSummary.jsx, restated here
 *  because Node cannot import a .jsx file. */
export function isEstimate(cost) {
  if (!cost || cost.dayEur == null) return false;
  return cost.stayLevel !== 'city' || cost.foodLevel !== 'city';
}

/** The rows a guided search reads: the catalogue with each place's day cost
 *  at the traveller's Lifestyle (App's exploreIndices). */
export function searchRows(destinations, indices) {
  if (!destinations || !indices || typeof indices.get !== 'function') return [];
  return Object.entries(destinations).map(([id, d]) => ({
    id,
    iso2: d.iso2,
    climate: d.climate,
    crowding: d.crowding,
    local_transport: d.local_transport,
    cost: indices.get(id) || null,
  }));
}

/** One place's day cost row ({ dayEur, stayLevel, foodLevel }) from the
 *  catalogue rows, or null when it has none: the card then shows no figure
 *  rather than a guess. */
export function placeDay(rows, id) {
  if (!id || !rows?.length) return null;
  const row = rows.find((r) => r.id === id);
  return row?.cost?.dayEur != null ? row.cost : null;
}

/** Each traveller's photo with its credit, keyed by persona id. */
export function personaPhotos() {
  const out = {};
  for (const p of PERSONAS) out[p.id] = p.photo?.url ? p.photo : null;
  return out;
}
