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
 * A traveller's card carries one price: the cheapest day in its own search at
 * the traveller's Lifestyle ("From {price} a day", the collection rule of
 * carta-design: the cheapest member, never an average), read from the same
 * cost index as Explore, so the card and the list it opens agree.
 */
import { matchAll } from './guidedSearch.js';

/** The languages the screens were captured in; anything else reads English. */
export const SCREEN_LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

/** A captured screen's address. `desk` is the laptop capture, the rest phone. */
export function screenSrc(lang, id) {
  const l = SCREEN_LANGS.includes(lang) ? lang : 'en';
  return `/home/${l}/${id}.webp`;
}

/** The pixel size of each capture, so its box is reserved before it loads. */
export const SCREEN_SIZE = { phone: [600, 1298], desk: [1440, 900] };

/** The place the story opens, and the search that finds it. */
export const STORY_PLACE = 'gem:bled';
export const STORY_SEARCH = { vibe: 'lake', area: 'alps', month: 7 };

/** The story, in order: one chapter per moment, each with the screen that
 *  shows it and the one door that goes there. */
export const CHAPTERS = [
  { id: 'find', tab: 'home.chFind', title: 'home.ch1Title', body: 'home.ch1', alt: 'home.ch1Alt', door: 'search' },
  { id: 'place', tab: 'home.chPrice', title: 'home.ch2Title', body: 'home.ch2', alt: 'home.ch2Alt', door: 'place' },
  { id: 'plan', tab: 'home.chPlan', title: 'home.ch3Title', body: 'home.ch3', alt: 'home.ch3Alt', door: 'trip' },
  { id: 'day', tab: 'home.chDay', title: 'home.ch4Title', body: 'home.ch4', alt: 'home.ch4Alt', door: 'day' },
  { id: 'share', tab: 'home.chShare', title: 'home.ch5Title', body: 'home.ch5', alt: 'home.ch5Alt', door: 'trips' },
];

/** The searches offered under the hero: a whole i18n string each (never a
 *  built sentence) and the guided facets it applies in Explore. Walking
 *  first, because hikers are the first audience (PRODUCT.md). */
export const SEARCHES = [
  { key: 'home.try3', facets: { vibe: 'hiking', area: 'alps', month: 7 } },
  { key: 'home.try1', facets: STORY_SEARCH },
  { key: 'home.try2', facets: { vibe: 'beach', country: 'PT', budget: 80 }, price: 80 },
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

/**
 * The six travellers, in PRODUCT.md's order (hikers first, then families at
 * the beach, cyclists, car-free travellers, city breaks and tight budgets).
 * Each opens Explore on its own question, except cyclists, whose routes live
 * in Destinations and carry no day price of their own: their pill names what
 * the card opens instead of a figure. `photo` names a journey style hero (with its author and
 * licence) or a catalogue town's photo, chosen for a clean, licensed image of
 * the trip the card names.
 */
export const PERSONAS = [
  { id: 'hike', title: 'home.pHikeTitle', body: 'home.pHike', facets: { vibe: 'hiking', area: 'alps' }, photo: { style: 'hiking' } },
  { id: 'family', title: 'home.pFamilyTitle', body: 'home.pFamily', facets: { vibe: 'family', nb: ['beach'] }, photo: { style: 'water-sports' } },
  { id: 'cycle', title: 'home.pCycleTitle', body: 'home.pCycle', kind: 'cycling', pill: 'home.pCyclePill', photo: { style: 'cycling' } },
  { id: 'nocar', title: 'home.pNoCarTitle', body: 'home.pNoCar', facets: { vibe: 'oldtown', nocar: true }, photo: { style: 'rail' } },
  { id: 'city', title: 'home.pCityTitle', body: 'home.pCity', facets: { vibe: 'city' }, photo: { dest: 'LIS' } },
  { id: 'budget', title: 'home.pBudgetTitle', body: 'home.pBudget', facets: { budget: 60 }, photo: { dest: 'KRK' } },
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

/**
 * The cheapest day among the places a search returns, as the cost row of
 * that place ({ dayEur, stayLevel, foodLevel }), or null when the search
 * returns fewer than three priced places (a "from" over one or two places is
 * a coincidence, not a range) or the guided data has not arrived.
 */
export function cheapestDay(rows, facets, guided) {
  if (!guided || !facets || !rows?.length) return null;
  let best = null;
  let n = 0;
  for (const p of rows) {
    if (p.cost?.dayEur == null) continue;
    if (!matchAll(p, facets, { guided, nearRow: null })) continue;
    n += 1;
    if (!best || p.cost.dayEur < best.dayEur) best = p.cost;
  }
  return n >= 3 ? best : null;
}

/** Each traveller's photo: a journey style hero (public/journeys/index.json)
 *  or a catalogue town's photo, with its credit; null when neither exists,
 *  and the card then shows its words only. */
export function personaPhotos(journeyIndex, destinations) {
  const styles = new Map((journeyIndex?.types || []).map((t) => [t.slug, t.hero]));
  const out = {};
  for (const p of PERSONAS) {
    if (p.photo.style) {
      const h = styles.get(p.photo.style);
      out[p.id] = h?.url ? {
        url: h.url, credit: h.credit || null, page: h.page || null,
        author: h.author || null, licence: h.licence || null,
      } : null;
    } else {
      const d = destinations?.[p.photo.dest];
      const img = d?.image;
      out[p.id] = img?.url ? {
        url: img.url, credit: img.credit || d.city || null, page: img.page || null,
        author: img.author || null, licence: img.licence || null,
      } : null;
    }
  }
  return out;
}
