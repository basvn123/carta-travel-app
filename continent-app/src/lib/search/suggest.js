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
  return { type: 'place', key: `p:${p.id}`, id: p.id, name: p.city, match, cc: p.iso2, lat: p.lat, lon: p.lon, tokens };
}

/**
 * @param {string} query  what is typed
 * @param {{ places, towns, areas, cartaRegions, dropped }} ctx
 *   places        cartaPlaces(data)
 *   towns         loadTownsFor(rest) (may lag a keystroke behind; filtered here)
 *   areas         loadAreas() result { countries, regions }
 *   cartaRegions  [{ label, bbox }] Carta's own region boxes (search_index)
 *   dropped       feature tokens the traveller removed
 * @returns {{ tokens: string[], rest: string, items: object[] }}
 *   item: { type, key, name, match, cc, id?, lat?, lon?, bbox?, code?,
 *           tokens, count?, km? }
 */
export function suggest(query, ctx = {}) {
  const places = ctx.places || [];
  const { tokens, rest } = extractTokens(query, ctx.dropped || []);
  const q = foldName(rest);
  const items = [];
  const seen = new Set();
  const push = (it) => { if (!seen.has(it.key)) { seen.add(it.key); items.push(it); } };

  if (!q) {
    if (tokens.length) {
      const count = places.reduce((n, p) => n + (hasFeatures(p.categories, tokens) ? 1 : 0), 0);
      push({ type: 'feature', key: `f:${tokens.join('+')}`, name: '', tokens, count });
    }
    return { tokens, rest, items };
  }

  // Regions and countries whose name starts with what is typed. Carta's own
  // boxes come first, so a GeoNames region of the same name ("Tuscany")
  // is not offered twice; the list filter has always used Carta's box.
  const areaList = [
    ...(ctx.cartaRegions || []).map((r) => ({
      kind: 'region', code: `carta:${foldName(r.label)}`, cc: '', names: [r.label],
      folds: [foldName(r.label), ...(r.keys || [])], bbox: r.bbox, pop: 1e12,
    })),
    ...(ctx.areas?.regions || []),
    ...(ctx.areas?.countries || []),
  ];
  const areaNames = new Set();
  const areaHits = [];
  for (const a of areaList) {
    const s = nameScore(a.folds, q);
    if (s > 1) continue;
    const i = s === 0 ? a.folds.indexOf(q) : a.folds.findIndex((f) => f.startsWith(q));
    const name = a.names[Math.max(0, Math.min(i, a.names.length - 1))];
    if (a.kind === 'region' && areaNames.has(foldName(name))) continue;
    areaNames.add(foldName(name));
    const item = {
      type: a.kind, key: `a:${a.code}`, code: a.code, name, match: name, cc: a.cc, bbox: a.bbox, tokens,
    };
    // A region with no Carta place inside lists the places near its middle
    // (resolve.js), so its count is what a pick shows; none at all: left out.
    item.count = resolveIds(item, places).length;
    if (item.count > 0) areaHits.push({ item, s, pop: a.pop, kind: a.kind });
  }
  areaHits.sort((x, y) => x.s - y.s || (x.kind === y.kind ? 0 : x.kind === 'region' ? -1 : 1) || y.pop - x.pop);
  const exact = (kind) => areaHits.filter((h) => h.s === 0 && h.kind === kind).map((h) => h.item);
  const partial = areaHits.filter((h) => h.s !== 0).slice(0, MAX_AREAS).map((h) => h.item);

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
      const list = placesNear(keep, town.lat, town.lon);
      if (!list.length) continue; // nothing of Carta's within reach: no empty "Near"
      near.push({
        type: 'near', key: `t:${town.gid}`, gid: town.gid, name: town.names[i], match: town.names[i],
        cc: town.cc, lat: town.lat, lon: town.lon, tokens, count: list.length, km: Math.round(list[0].km),
      });
    }
  }

  // A named country leads ("Slovenia"); a named region follows Carta's own
  // places, so "Porto" opens the city before the district of Porto. With
  // feature words the areas move up: "beach portugal" is about Portugal.
  // A Carta place named by the whole text, feature word and all ("Lake
  // District"), still leads: the word was part of a name.
  const whole = tokens.length
    ? cartaMatches(places, foldName(query)).filter((m) => m.s <= 1).slice(0, 2).map(({ p }) => placeItem(p, [], p.city))
    : [];
  const groups = tokens.length
    ? [whole, exact('country'), exact('region'), partial, carta, near]
    : [exact('country'), carta, exact('region'), near, partial];
  groups.flat().forEach(push);
  return { tokens, rest, items: items.slice(0, MAX_PLACES) };
}
