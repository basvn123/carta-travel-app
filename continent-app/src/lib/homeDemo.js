/**
 * The home page's data (T462): the live demo's story, the three searches
 * offered under the hero, the six trip kinds and their photos, all priced
 * from the catalogue the app already loaded. Pure, so tests/home.test.mjs
 * runs it against the shipped data in Node.
 *
 * The story is one real search ("Lakes in the Alps in July", which returns
 * these three towns in Explore today), one real place (Lake Bled, the lake
 * the question asks for, at a day price under the hero's own budget
 * question) and one real trip around it: fly into Ljubljana, three nights at
 * Bled, two at Bohinj. A budget traveller's story: the critique of T462 found
 * the Austrian one opened on the dearest town on the page. Every figure is
 * the Explore card's own day cost at the traveller's Lifestyle (App's
 * exploreIndices, lib/costIndex.js), so the
 * demo, the card and the destination page cannot disagree. When the story's
 * towns are missing or unpriced the demo tells the same story about the best
 * rated towns of the country with the most of them, and when even that fails
 * it says nothing at all (state 'none').
 */

export const STORY = {
  query: 'home.try1',
  seed: { vibe: 'lake', area: 'alps', month: 7 },
  results: ['gem:bled', 'gem:bohinj', 'gem:zell-am-see'],
  open: 'gem:bled',
  trip: [['LJU', 2], ['gem:bled', 3], ['gem:bohinj', 2]],
};

/** The searches offered under the hero: a whole i18n string each (never a
 *  built sentence) and the guided facets it applies in Explore. Taken from
 *  lib/guidedSearch.js EXAMPLES and the story's own question; walking first,
 *  because hikers are the first audience (PRODUCT.md). */
export const SEARCHES = [
  { key: 'home.try3', facets: { vibe: 'hiking', area: 'alps', month: 7 } },
  { key: 'home.try1', facets: { vibe: 'lake', area: 'alps', month: 7 } },
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

/** The six kinds of trip, in the Destinations tab's own order and labels.
 *  `style` names a journey style whose hero (with its author and licence)
 *  is the tile's photo; `dest` names a catalogue town instead. */
export const KINDS = [
  { key: 'trips', labelKey: 'places.catTrips', style: 'rail' },
  { key: 'trails', labelKey: 'places.catTrails', style: 'hiking' },
  { key: 'beaches', labelKey: 'places.catBeaches', style: 'beach-week' },
  { key: 'lakes', labelKey: 'places.catLakes', dest: 'gem:como' },
  { key: 'mountains', labelKey: 'places.catMountains', dest: 'gem:dolomites' },
  { key: 'cycling', labelKey: 'places.catCycling', style: 'cycling' },
];

/** The scene order and how long each one holds, in ms. */
export const SCENES = [
  { id: 'search', ms: 4500 },
  { id: 'place', ms: 5000 },
  { id: 'trip', ms: 5500 },
  { id: 'share', ms: 4500 },
];

/** True when the day figure leans on a country-level stand-in. The same
 *  predicate as isNational() in components/CostSummary.jsx, restated here
 *  because Node cannot import a .jsx file. */
export function isEstimate(cost) {
  if (!cost || cost.dayEur == null) return false;
  return cost.stayLevel !== 'city' || cost.foodLevel !== 'city';
}

function rowOf(destinations, indices, id) {
  const d = destinations?.[id];
  if (!d) return null;
  const cost = (indices && typeof indices.get === 'function' ? indices.get(id) : null) || null;
  const image = d.image || null;
  return {
    id,
    city: d.city || d.name || id,
    iso2: d.iso2 || null,
    country: d.country || null,
    image: image?.url || null,
    credit: image?.credit || null,
    page: image?.page || null,
    rating: d.rating || null,
    best: Array.isArray(d.climate?.best) ? d.climate.best : [],
    lat: d.city_lat ?? d.lat ?? null,
    lon: d.city_lon ?? d.lon ?? null,
    cost,
  };
}

const usable = (r) => !!(r && r.image && r.cost && r.cost.dayEur != null
  && Number.isFinite(r.lat) && Number.isFinite(r.lon));

const byRating = (a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0);

/** A stand-in story when the story's own towns cannot be shown: the three
 *  best rated, priced, photographed towns of the country that has the most. */
function fallbackStory(destinations, indices) {
  const byCountry = new Map();
  for (const id of Object.keys(destinations || {})) {
    const r = rowOf(destinations, indices, id);
    if (!usable(r) || !r.iso2 || r.rating?.score == null) continue;
    if (!byCountry.has(r.iso2)) byCountry.set(r.iso2, []);
    byCountry.get(r.iso2).push(r);
  }
  let best = null;
  for (const rows of byCountry.values()) {
    if (rows.length >= 3 && (!best || rows.length > best.length)) best = rows;
  }
  if (!best) return null;
  const top = [...best].sort(byRating).slice(0, 3);
  return { results: top, place: top[0], stops: [...top].sort((a, b) => a.lon - b.lon), country: top[0] };
}

/**
 * Project lat/lon onto a w x h box (Web Mercator, one scale for both axes so
 * the shape is true), centred, with `pad` px of margin. Returns [{x, y}].
 */
export function project(points, w = 320, h = 150, pad = 30) {
  if (!points.length) return [];
  const merc = points.map((p) => {
    const lat = Math.max(-85, Math.min(85, p.lat)) * Math.PI / 180;
    return { x: p.lon * Math.PI / 180, y: -Math.log(Math.tan(Math.PI / 4 + lat / 2)) };
  });
  const xs = merc.map((m) => m.x);
  const ys = merc.map((m) => m.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return merc.map((m) => ({
    x: Math.round((offX + (m.x - minX) * scale) * 10) / 10,
    y: Math.round((offY + (m.y - minY) * scale) * 10) / 10,
  }));
}

/**
 * The demo, built from the catalogue in hand.
 *
 *   destinations  data.destinations (the rank tier is enough)
 *   indices       Map id -> cost row (computeCosts), the Explore figures
 *
 * Returns { state: 'story' | 'fallback' | 'none', query, results, place,
 * trip: { stops, lines, totalCents, est }, route: { points, legs } }.
 * Line amounts are cents: nights x the day figure, so the sum is exact.
 */
export function buildDemo(destinations, indices, story = STORY) {
  if (!destinations || !indices) return { state: 'none' };
  let results = story.results.map((id) => rowOf(destinations, indices, id)).filter(usable);
  let place = rowOf(destinations, indices, story.open);
  let stops = story.trip
    .map(([id, nights]) => {
      const r = rowOf(destinations, indices, id);
      return r ? { ...r, nights } : null;
    })
    .filter(usable);
  let state = 'story';
  let query = { key: story.query };

  if (!usable(place) || stops.length < 2 || results.length < 3) {
    const fb = fallbackStory(destinations, indices);
    if (!fb) return { state: 'none' };
    state = 'fallback';
    results = fb.results;
    place = fb.place;
    stops = fb.stops.map((r, i) => ({ ...r, nights: i === 0 ? 3 : 2 }));
    query = { key: 'home.queryCountry', country: fb.country.iso2, countryName: fb.country.country };
  }

  const lines = stops.map((s) => {
    const dayCents = Math.round(s.cost.dayEur * 100);
    return { id: s.id, city: s.city, nights: s.nights, cents: dayCents * s.nights, est: isEstimate(s.cost) };
  });
  const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);
  const points = project(stops.map((s) => ({ lat: s.lat, lon: s.lon })));
  // Each leg bows a little to one side, the way a drawn route does; the
  // control point sits off the leg's middle, square to it.
  const legs = points.slice(1).map((p, i) => {
    const a = points[i];
    const mx = (a.x + p.x) / 2; const my = (a.y + p.y) / 2;
    const dx = p.x - a.x; const dy = p.y - a.y;
    const bow = 0.14;
    return { from: a, to: p, ctrl: { x: Math.round((mx - dy * bow) * 10) / 10, y: Math.round((my + dx * bow) * 10) / 10 } };
  });
  // Each name sits on the side of its town that faces away from the middle
  // of the route: beside it when the town lies more to the side than above
  // or below, else above or below it. A name that would leave the box flips
  // to the other side or is nudged in (about 7 units a character at caption
  // size), so two towns close together never stack their names.
  const cx = points.reduce((sum, p) => sum + p.x, 0) / (points.length || 1);
  const cy = points.reduce((sum, p) => sum + p.y, 0) / (points.length || 1);
  const labels = points.map((p, i) => {
    const w = stops[i].city.length * 7;
    const dx = p.x - cx; const dy = (p.y - cy) * 1.6;
    // A town near the top edge has no room above it: its name goes beside it.
    const noRoomAbove = dy < 0 && p.y - 18 <= 14;
    if (Math.abs(dx) >= Math.abs(dy) || noRoomAbove) {
      let anchor = dx < 0 ? 'end' : 'start';
      if (anchor === 'end' && p.x - 17 - w < 2) anchor = 'start';
      if (anchor === 'start' && p.x + 17 + w > 318) anchor = 'end';
      return { x: anchor === 'end' ? p.x - 17 : p.x + 17, y: p.y + 4, anchor };
    }
    const half = Math.min(150, w / 2 + 6);
    const x = Math.round(Math.max(half, Math.min(320 - half, p.x)) * 10) / 10;
    const above = dy < 0;
    return { x, y: above ? p.y - 18 : p.y + 25, anchor: 'middle' };
  });

  return {
    state,
    query,
    results,
    place,
    trip: { stops, lines, totalCents, est: lines.some((l) => l.est) },
    route: { points, legs, labels },
  };
}

/** The photo for each trip kind: a journey style hero (from
 *  public/journeys/index.json) or a catalogue town's own photo. A kind with
 *  neither gets null, and its tile shows its icon and word instead. */
export function kindPhotos(journeyIndex, destinations) {
  const styles = new Map((journeyIndex?.types || []).map((t) => [t.slug, t.hero]));
  const out = {};
  for (const k of KINDS) {
    if (k.style) {
      const h = styles.get(k.style);
      out[k.key] = h?.url ? {
        url: h.url, credit: h.credit || null, page: h.page || null,
        author: h.author || null, licence: h.licence || null,
      } : null;
    } else {
      const img = destinations?.[k.dest]?.image;
      out[k.key] = img?.url ? { url: img.url, credit: img.credit || null, page: img.page || null } : null;
    }
  }
  return out;
}
