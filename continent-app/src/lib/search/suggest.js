/**
 * Search suggestions (G12): what the panel lists while the traveller types.
 * Pure: the caller hands in Carta's places, the towns of the loaded shards,
 * the areas and Carta's own region boxes, and gets an ordered list back.
 *
 * Order (decision.md 3, contract Lane 4):
 *   1. Carta's places (exact name, then name start, then a word start)
 *   2. towns Carta does not cover, biggest first, as "Near {town}"
 *   3. regions, then countries
 * An area whose whole name was typed moves up: a country to the top
 * ("Slovenia"), a region just under Carta's places ("Tuscany").
 *
 * A town that IS a Carta place (one of its names is the place's name, and
 * it lies within 20 km) is shown as that place, so "Keulen" finds Cologne
 * and never offers "Near Cologne" beside Cologne itself.
 */
import { foldName } from '../searchIndex.js';
import { extractTokens, hasFeatures } from './features.js';
import { kmBetween } from './places.js';
import { placesNear, resolveIds } from './resolve.js';

export const MAX_PLACES = 8;
const MAX_CARTA = 3;
const MAX_TOWNS = 3;
const MAX_AREAS = 2;
const SAME_TOWN_KM = 20;

function nameScore(folds, q) {
  let best = 9;
  for (const f of folds) {
    if (f === q) return 0;
    if (f.startsWith(q)) best = Math.min(best, 1);
    else if (q.length >= 3 && f.includes(` ${q}`)) best = Math.min(best, 2);
  }
  return best;
}

function cartaMatches(places, q) {
  const out = [];
  for (const p of places) {
    const s = nameScore(p.folds, q);
    if (s < 9) out.push({ p, s });
  }
  out.sort((a, b) => a.s - b.s || a.p.city.length - b.p.city.length || a.p.city.localeCompare(b.p.city));
  return out;
}

/** The Carta place a gazetteer town stands for, or null. */
export function cartaTwin(town, places) {
  let best = null;
  for (const p of places) {
    if (!p.folds.some((f) => town.folds.includes(f))) continue;
    const km = kmBetween(town.lat, town.lon, p.lat, p.lon);
    if (km <= SAME_TOWN_KM && (!best || km < best.km)) best = { p, km };
  }
  return best?.p || null;
}

function placeItem(p, tokens, match) {
  return {
    type: 'place', key: `p:${p.id}`, id: p.id, name: p.city, match, cc: p.iso2, lat: p.lat, lon: p.lon, tokens,
    airport: !!p.airport,
  };
}

// "Wandern in Slowenien", "beach near Nice": the joiner after a feature word
// is not part of the place (flow-C m4).
const JOINERS = /^(in der|in den|in the|cerca de|vicino a|pres de|near|in|im|bij|bei|en|a|nel|nella|nei|dans|au|aux|di|de)\s+/;

/**
 * Which feature words to lift, and what is left to match (fixes-r1 Q4).
 * A word stays part of a name when the whole text is a place ("Lake
 * District"), or the rest is exactly one of Carta's places ("Lake Bled",
 * "Lake Como" find Bled and Como, with no token).
 */
export function readQuery(query, ctx = {}) {
  const raw = ctx.noTokens ? { tokens: [], rest: foldName(query) } : extractTokens(query, ctx.dropped || []);
  // A feature word alone ("beach") is always a token.
  if (!raw.tokens.length || !raw.rest) return raw;
  const whole = foldName(query);
  const places = ctx.places || [];
  const isWhole = places.some((p) => nameScore(p.folds, whole) <= 1)
    || (ctx.towns || []).some((t) => t.folds.some((f) => f.startsWith(whole)))
    || [...(ctx.areas?.regions || []), ...(ctx.areas?.countries || [])].some((a) => a.folds.some((f) => f.startsWith(whole)));
  if (isWhole) return { tokens: [], rest: whole };
  const rest = raw.rest.replace(JOINERS, '');
  if (rest && places.some((p) => nameScore(p.folds, rest) === 0)) return { tokens: [], rest };
  return { tokens: raw.tokens, rest };
}

/** Two Carta rows for one town (an airport-tier record and a place in the
 *  town, "Cologne-Bonn" and "Köln"): keep the town (fixes-r1 Q5). */
function dropTwinRows(items) {
  return items.filter((it, i) => !(it.airport && items.some((o, j) => j !== i && !o.airport
    && kmBetween(it.lat, it.lon, o.lat, o.lon) <= SAME_TOWN_KM)));
}

/**
 * @param {string} query  what is typed
 * @param {{ places, towns, areas, cartaRegions, dropped, lang, noTokens }} ctx
 *   places        cartaPlaces(data)
 *   towns         loadTownsFor (the rest and the whole text; may lag a keystroke)
 *   areas         loadAreas() result { countries, regions }
 *   cartaRegions  [{ label, bbox, keys }] Carta's own region boxes (search_index)
 *   dropped       feature tokens the traveller removed
 *   lang          the UI language: names are shown in it, matched in any
 *   noTokens      a question: no feature words are lifted (it goes to Ask)
 * @returns {{ tokens: string[], rest: string, items: object[] }}
 *   item: { type, key, name, match, cc, id?, lat?, lon?, bbox?, code?,
 *           tokens, count?, km? }
 */
export function suggest(query, ctx = {}) {
  const places = ctx.places || [];
  const lang = ctx.lang || 'en';
  const { tokens, rest } = readQuery(query, ctx);
  const q = foldName(rest);
  const items = [];
  const seen = new Set();
  const push = (it) => { if (!seen.has(it.key)) { seen.add(it.key); items.push(it); } };

  if (!q) {
    if (tokens.length) {
      const count = places.reduce((n, p) => n + (hasFeatures(p.categories, tokens) ? 1 : 0), 0);
      // No place has all of them: no dead-end row (flow-C m2).
      if (count > 0) push({ type: 'feature', key: `f:${tokens.join('+')}`, name: '', tokens, count });
    }
    return { tokens, rest, items };
  }

  // Regions and countries. Any language's name matches when typed in full
  // ("Lissabon"); a prefix matches only the names shown in this language,
  // so "porto" does not offer Portugal through the Italian "Portogallo".
  // Carta's own boxes come first, so a GeoNames region of the same name
  // ("Tuscany") is not offered twice; the list filter has always used them.
  const areaList = [
    ...(ctx.cartaRegions || []).map((r) => ({
      kind: 'region', code: `carta:${foldName(r.label)}`, cc: '', names: [r.label], l: {},
      folds: [foldName(r.label), ...(r.keys || [])], bbox: r.bbox, pop: 1e12,
    })),
    ...(ctx.areas?.regions || []),
    ...(ctx.areas?.countries || []),
  ];
  const areaNames = new Set();
  const areaHits = [];
  for (const a of areaList) {
    const shown = a.l?.[lang] || a.names[0];
    const own = [foldName(shown), foldName(a.names[0]), ...(a.code.startsWith('carta:') ? a.folds : [])];
    const s = a.folds.includes(q) ? 0 : own.some((f) => f.startsWith(q)) ? 1 : 9;
    if (s > 1) continue;
    const key = `${a.cc}:${foldName(shown)}`;
    if (a.kind === 'region' && areaNames.has(foldName(shown))) continue;
    areaNames.add(foldName(shown));
    const item = {
      type: a.kind, key: `a:${a.code}`, code: a.code, name: shown, match: shown, cc: a.cc, bbox: a.bbox, tokens, nameKey: key,
    };
    // A region with no Carta place inside lists the places near its middle
    // (resolve.js), so its count is what a pick shows; none at all: left out.
    item.count = resolveIds(item, places).length;
    if (item.count > 0) areaHits.push({ item, s, pop: a.pop, kind: a.kind });
  }
  // Countries before regions, then bigger first.
  areaHits.sort((x, y) => x.s - y.s || (x.kind === y.kind ? 0 : x.kind === 'country' ? -1 : 1) || y.pop - x.pop);
  const exact = (kind) => areaHits.filter((h) => h.s === 0 && h.kind === kind).map((h) => h.item);
  const partial = areaHits.filter((h) => h.s !== 0).slice(0, MAX_AREAS).map((h) => h.item);
  const areaKeys = new Set(areaHits.map((h) => h.item.nameKey));

  const carta = cartaMatches(places, q).slice(0, MAX_CARTA).map(({ p }) => placeItem(p, tokens, p.city));
  const near = [];
  if (q.length >= 2) {
    const keep = tokens.length ? places.filter((p) => hasFeatures(p.categories, tokens)) : places;
    for (const town of ctx.towns || []) {
      if (near.length >= MAX_TOWNS) break;
      const i = town.folds.findIndex((f) => f.startsWith(q));
      if (i < 0) continue;
      const twin = cartaTwin(town, places);
      if (twin) {
        if (carta.length < MAX_CARTA + 1) carta.push(placeItem(twin, tokens, town.names[i]));
        continue;
      }
      const shown = town.l?.[lang] || town.names[0];
      // A town named like a region it gives its name to (Kobarid): one row.
      if (areaKeys.has(`${town.cc}:${foldName(shown)}`)) continue;
      const list = placesNear(keep, town.lat, town.lon);
      if (!list.length) continue; // nothing of Carta's within reach: no empty "Near"
      near.push({
        type: 'near', key: `t:${town.gid}`, gid: town.gid, name: shown, match: town.names[i],
        cc: town.cc, lat: town.lat, lon: town.lon, tokens, count: list.length, km: Math.round(list[0].km),
      });
    }
  }

  // A named country leads ("Slovenia"); a named region follows Carta's own
  // places, so "Porto" opens the city before the district of Porto; then
  // countries and regions by prefix, above villages ("Ital" is Italy before
  // Itala). With feature words the areas lead: "beach portugal" is about
  // Portugal.
  const groups = tokens.length
    ? [exact('country'), exact('region'), partial, dropTwinRows(carta), near]
    : [exact('country'), dropTwinRows(carta), exact('region'), partial, near];
  groups.flat().forEach(push);
  return { tokens, rest, items: items.slice(0, MAX_PLACES) };
}
