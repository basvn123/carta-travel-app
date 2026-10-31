/**
 * The home page's data (T606, the from-scratch rebuild after the T605
 * critique; it replaces T463's screens and devices). Everything here is pure,
 * so tests/home.test.mjs runs it in Node against the shipped catalogue.
 *
 * The page shows the app in two ways only, both real:
 *   - real places from the catalogue, each with its own day price at the
 *     traveller's Lifestyle (the same cost index Explore reads), and the
 *     cheapest return flight from the traveller's home airport in the
 *     flight sweep (Google Flights' price, shown as theirs);
 *   - screen recordings of the running app (scripts/record_home_clips.mjs
 *     writes public/home/clips/<lang>/<chapter>.{mp4,webp}), opened
 *     through the same links a traveller can open. The page never draws a
 *     copy of the app.
 */

/** The languages the clips are recorded in; anything else plays English. */
export const CLIP_LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

/** A chapter clip's address (an H.264 .mp4): `poster` is the still the
 *  clip opens on. */
export function clipSrc(lang, id, kind = 'mp4') {
  const l = CLIP_LANGS.includes(lang) ? lang : 'en';
  return `/home/clips/${l}/${id}.${kind === 'poster' ? 'webp' : kind}`;
}

/** The clips' frame: a phone at 390 by 844, captured at 2x and stored at 546
 *  by 1182, twice the size the page draws it. */
export const CLIP_SIZE = [546, 1182];

/** The trip the story, the route card and the recordings all follow. */
export const STORY_PLACE = 'gem:bled';
export const STORY_SEARCH = { vibe: 'lake', area: 'alps', month: 7 };
export const ROUTE_STOPS = [
  { id: 'LJU', nights: 2 },
  { id: 'gem:bled', nights: 3 },
  { id: 'gem:bohinj', nights: 2 },
];

/** The story, in order: one panel per moment, its clip and its one door.
 *  `ground` names the panel's home ground token (61-v6-home.css). */
export const CHAPTERS = [
  { id: 'find', tab: 'home.chFind', title: 'home.ch1Title', body: 'home.ch1', alt: 'home.ch1Alt', door: 'search', ground: 'clay' },
  { id: 'place', tab: 'home.chPrice', title: 'home.ch2Title', body: 'home.ch2', alt: 'home.ch2Alt', door: 'place', ground: 'lake' },
  { id: 'plan', tab: 'home.chPlan', title: 'home.ch3Title', body: 'home.ch3', alt: 'home.ch3Alt', door: 'trip', ground: 'deep' },
  { id: 'day', tab: 'home.chDay', title: 'home.ch4Title', body: 'home.ch4', alt: 'home.ch4Alt', door: 'day', ground: 'mist' },
  { id: 'share', tab: 'home.chShare', title: 'home.ch5Title', body: 'home.ch5', alt: 'home.ch5Alt', door: 'trips', ground: 'sea' },
];

/** The clips the home tour plays first, one per chapter (T957): Ask, Explore,
 *  a day of Plan, My trips and a Together group trip. scripts/record_home_clips.mjs
 *  records each in all six languages. */
export const TOUR_CLIPS = ['ask', 'explore', 'day', 'trips', 'together'];

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
 * The six travellers, in PRODUCT.md's order (hikers first). Each is one real
 * place: `place` is a catalogue id its own search returns, `label` its short
 * name, and every figure shown for it is that place's own day price. `ask`
 * is the question the traveller types in the "Who it is for" chat, with
 * `askPrice` filled in through formatMoney where the question names a
 * budget. Cyclists' routes carry no day price of their own; their answer
 * opens the cycling tab.
 *
 * `photo` is one Commons file of that place, checked by hand (2026-10-17),
 * with its author and licence for the credits. `focus` is the
 * object-position that keeps the subject in a crop.
 */
export const PERSONAS = [
  {
    id: 'hike', title: 'home.pHikeTitle', body: 'home.pHike', ask: 'home.qHike', facets: { vibe: 'hiking', area: 'alps' },
    place: 'gem:soca-valley', label: 'Bovec',
    photo: {
      url: commons('c/cd/Bovec_Bav%C5%A1ki_Grintavec_Obere_So%C4%8Da_Jalovec_17072018_3951.jpg'), w: 7360, h: 4912, focus: '40% center',
      credit: 'Above the Soča valley, Bovec', author: 'Johann Jaritz', licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Bovec_Bav%C5%A1ki_Grintavec_Obere_So%C4%8Da_Jalovec_17072018_3951.jpg',
    },
  },
  {
    id: 'family', title: 'home.pFamilyTitle', body: 'home.pFamily', ask: 'home.qFamily', askPrice: 90, facets: { vibe: 'family', nb: ['beach'] },
    place: 'gem:albufeira', label: 'Albufeira',
    photo: {
      url: commons('6/6a/15-09-2017_Praia_dos_Pescadores%2C_Albufeira_%283%29.JPG'), w: 3456, h: 4608, focus: 'center 55%',
      credit: 'Praia dos Pescadores, Albufeira', author: 'Kolforn', licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:15-09-2017_Praia_dos_Pescadores,_Albufeira_(3).JPG',
    },
  },
  {
    id: 'cycle', title: 'home.pCycleTitle', body: 'home.pCycle', ask: 'home.qCycle', kind: 'cycling', pill: 'home.pCyclePill',
    photo: {
      url: commons('2/2a/Col_Aubisque.jpg'), w: 3622, h: 2194, focus: '78% center',
      credit: "Col d'Aubisque", author: 'Myrabella', licence: 'CC BY-SA 3.0',
      page: 'https://commons.wikimedia.org/wiki/File:Col_Aubisque.jpg',
    },
  },
  {
    id: 'nocar', title: 'home.pNoCarTitle', body: 'home.pNoCar', ask: 'home.qNoCar', facets: { vibe: 'oldtown', nocar: true },
    place: 'gem:cesky-krumlov', label: 'Český Krumlov',
    photo: {
      url: commons('0/0c/View_of_%C4%8Cesk%C3%BD_Krumlov_from_the_castle%2C_20250504_1305_8880.jpg'), w: 5802, h: 3848, focus: '38% center',
      credit: 'Český Krumlov from the castle', author: 'Jakub Hałun', licence: 'CC BY 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:View_of_%C4%8Cesk%C3%BD_Krumlov_from_the_castle,_20250504_1305_8880.jpg',
    },
  },
  {
    id: 'city', title: 'home.pCityTitle', body: 'home.pCity', ask: 'home.qCity', facets: { vibe: 'city' },
    place: 'OPO', label: 'Porto',
    photo: {
      url: commons('2/21/Rabelo_boats_and_Ribeira_seen_from_Cais_de_Gaia%2C_20250605_1623_9879.jpg'), w: 5920, h: 3951, focus: '42% center',
      credit: 'Ribeira, Porto', author: 'Jakub Hałun', licence: 'CC BY 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Rabelo_boats_and_Ribeira_seen_from_Cais_de_Gaia,_20250605_1623_9879.jpg',
    },
  },
  {
    id: 'budget', title: 'home.pBudgetTitle', body: 'home.pBudget', ask: 'home.qBudget', askPrice: 60, facets: { budget: 60 },
    // T536: Ohrid, not Mostar. With measured bed prices (an entire place for
    // two) Mostar is about 80 a day and no longer fits the 60 a day search.
    place: 'OHD', label: 'Ohrid',
    photo: {
      url: commons('4/4b/Church_of_St._John_at_Kaneo_5.jpg'), w: 5000, h: 3345, focus: 'center 45%',
      credit: 'St. John at Kaneo, Ohrid', author: 'kallerna', licence: 'CC BY-SA 4.0',
      page: 'https://commons.wikimedia.org/wiki/File:Church_of_St._John_at_Kaneo_5.jpg',
    },
  },
];

/** Lake Bled for the route card, checked on Commons 2026-10-23. */
export const ROUTE_PHOTO = {
  url: commons('8/84/Lake_Bled_from_the_Mountain.jpg'), w: 4000, h: 3000, focus: 'center 60%',
  credit: 'Lake Bled from the mountain', author: 'Canadianhockey91', licence: 'CC BY-SA 3.0',
  page: 'https://commons.wikimedia.org/wiki/File:Lake_Bled_from_the_Mountain.jpg',
};

/**
 * The hero film (owner D3 and D4, 2026-10-23; clips approved 2026-10-23,
 * T618): five licensed Pexels clips, each a place in the catalogue with that
 * place's own price on it. Each clip is an 11 second H.264 cut at 1280x720
 * with a WebP poster of its first frame, in public/home/film/. The lake leads
 * (hikers first, PRODUCT.md).
 */
const pexels = (id, credit, author) => ({ credit, author, licence: 'Pexels License', page: `https://www.pexels.com/video/${id}/` });
const filmClip = (id) => ({ mp4: `/home/film/${id}.mp4`, poster: `/home/film/${id}.webp` });
export const FILM = [
  { id: 'bled', place: 'gem:bled', label: 'Bled', clip: filmClip('bled'), credit: pexels(35327836, 'Lake Bled and its church island from the air', 'Rui Veiga') },
  { id: 'lagos', place: 'gem:lagos-pt', label: 'Lagos', clip: filmClip('lagos'), credit: pexels(36749579, 'Ponta da Piedade, Lagos, from the air', 'Mike Art') },
  { id: 'dubrovnik', place: 'DBV', label: 'Dubrovnik', clip: filmClip('dubrovnik'), credit: pexels(12079872, 'Dubrovnik from the air', 'Lazar Krstić') },
  { id: 'porto', place: 'OPO', label: 'Porto', clip: filmClip('porto'), credit: pexels(34285846, 'Porto’s waterfront from the air', 'K') },
  { id: 'hallstatt', place: 'gem:hallstatt', label: 'Hallstatt', clip: filmClip('hallstatt'), credit: pexels(37011265, 'Hallstatt from the air', 'Ahmet Yüksek') },
];

/** The places the week card can price, each with a flight from most of
 *  Europe in the sweep. Porto leads: a city break is where a cheap flight
 *  most often meets a dear bed. */
export const WEEK_PLACES = ['OPO', 'gem:albufeira', 'gem:cesky-krumlov', 'OHD', 'gem:bled'];
export const WEEK_NIGHTS = [3, 5, 7];

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

/** One place's day cost row ({ dayEur, stayEur, foodEur, stayLevel,
 *  foodLevel }) from the catalogue rows, or null when it has none: the page
 *  then shows no figure rather than a guess. */
export function placeDay(rows, id) {
  if (!id || !rows?.length) return null;
  const row = rows.find((r) => r.id === id);
  return row?.cost?.dayEur != null ? row.cost : null;
}

/**
 * The week card's sum, a person: the return flight (Google Flights' price
 * from the sweep, `flight` is { perSeat, airline, checked } or null), the
 * bed for the nights and food and drink for the days. The total counts the
 * flight only when there is one; without it the card says the flight is not
 * priced and the total is the ground alone. The same arithmetic as the map
 * panel's TripParts (bed and food times the nights, plus the way there).
 */
export function weekSum(cost, nights, flight = null) {
  if (!cost || cost.stayEur == null || cost.foodEur == null || !(nights > 0)) return null;
  const bed = cost.stayEur * nights;
  const food = cost.foodEur * nights;
  const fly = flight && flight.perSeat > 0 ? flight.perSeat : null;
  return {
    flight: fly,
    bed,
    food,
    ground: bed + food,
    total: bed + food + (fly || 0),
    stayEst: cost.stayLevel !== 'city',
    foodEst: cost.foodLevel !== 'city',
    // How many times the flight the whole week costs, for the headline.
    times: fly ? (bed + food + fly) / fly : null,
  };
}

/** The route card's stops with their own day price and nights, and the
 *  trip's ground total a person (beds plus food and drink): null when any
 *  stop has no price, so the card never sums a guess. */
export function routeTotals(rows, stops = ROUTE_STOPS) {
  const out = stops.map((s) => ({ ...s, cost: placeDay(rows, s.id) }));
  if (out.some((s) => !s.cost)) return { stops: out, total: null, nights: 0, est: false };
  const total = out.reduce((sum, s) => sum + s.cost.dayEur * s.nights, 0);
  const nights = out.reduce((n, s) => n + s.nights, 0);
  return { stops: out, total, nights, est: out.some((s) => isEstimate(s.cost)) };
}

/** Slovenia's outline (public/country_shapes.json, SI), lon and lat. */
export const SLOVENIA = [[16.516, 46.5], [16.321, 46.535], [16.237, 46.484], [16.253, 46.389], [16.227, 46.373], [16.067, 46.371], [15.933, 46.278], [15.636, 46.201], [15.593, 46.14], [15.666, 46.048], [15.652, 45.862], [15.277, 45.733], [15.354, 45.66], [15.284, 45.58], [15.339, 45.467], [15.242, 45.441], [14.955, 45.5], [14.793, 45.478], [14.569, 45.657], [14.37, 45.481], [14.086, 45.478], [13.993, 45.509], [13.879, 45.428], [13.615, 45.477], [13.578, 45.517], [13.72, 45.588], [13.875, 45.615], [13.722, 45.761], [13.583, 45.812], [13.601, 45.98], [13.488, 45.987], [13.486, 46.04], [13.617, 46.133], [13.633, 46.177], [13.421, 46.212], [13.378, 46.262], [13.4, 46.318], [13.68, 46.463], [13.7, 46.52], [14.55, 46.4], [14.757, 46.499], [14.893, 46.606], [15.217, 46.643], [15.439, 46.63], [15.633, 46.698], [15.767, 46.711], [15.958, 46.678], [15.977, 46.801], [16.093, 46.863], [16.284, 46.857], [16.335, 46.722], [16.385, 46.681], [16.381, 46.639], [16.516, 46.5]];

/**
 * A projection for the route card: lon and lat to x and y in a box of
 * `w` by `h`, fitted around `bounds` ([[lon, lat], ...]) with `pad`, the
 * longitude shrunk by the cosine of the middle latitude so the shapes keep
 * their proportions. North is up.
 */
export function fitProjection(bounds, w, h, pad = 0) {
  const lons = bounds.map((p) => p[0]);
  const lats = bounds.map((p) => p[1]);
  const [x0, x1] = [Math.min(...lons), Math.max(...lons)];
  const [y0, y1] = [Math.min(...lats), Math.max(...lats)];
  const k = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
  const sx = (w - 2 * pad) / ((x1 - x0) * k || 1);
  const sy = (h - 2 * pad) / ((y1 - y0) || 1);
  const s = Math.min(sx, sy);
  const ox = (w - (x1 - x0) * k * s) / 2;
  const oy = (h - (y1 - y0) * s) / 2;
  return ([lon, lat]) => [ox + (lon - x0) * k * s, oy + (y1 - lat) * s];
}

/** An SVG path through points, as a soft curve (Catmull-Rom as cubic
 *  Beziers), so the route reads as a hand-drawn line, not a polyline. */
export function smoothPath(pts) {
  if (pts.length < 2) return '';
  const f = (n) => Math.round(n * 10) / 10;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** Each photo the page shows with its credit, for the credits line. */
export function pagePhotos() {
  return [...PERSONAS.map((p) => p.photo), ROUTE_PHOTO].filter((p) => p?.url);
}
