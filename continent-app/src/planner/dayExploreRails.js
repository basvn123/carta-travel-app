/**
 * The rails the "Build it myself" landing offers around a stay (D6).
 *
 * The old landing was a map with four filter chips: everything it could show
 * was a pin, and a pin says where a place is and nothing about whether it is
 * worth the walk. This module answers the other question. It gathers what is
 * actually around the stay out of the layers the rest of the app already
 * publishes, sorts each kind the way that kind deserves to be sorted, and
 * hands back a list of rails a guided builder can draw.
 *
 * Every row that leaves here speaks ONE shape, whatever layer it came from:
 *
 *   { key, kind, name, lat, lon, km, photo, rating, sub, add, open }
 *
 * `add` is what the day tray stores (a catalogue POI, or null for a row that
 * has no harvested POI behind it), and `open` is what the full-page link
 * needs. The card component never learns that a beach and a sight arrive from
 * different files, which is the whole point of normalising here.
 *
 * Distances are straight-line throughout, as they are everywhere else in the
 * planner. A walk of 1.2 km "as the crow flies" is not a 1.2 km walk, so the
 * card copy says "12 min walk" off a street factor rather than claiming a
 * distance the pavement does not have.
 */

import { haversineKm } from '../lib/runtime_pricing.js';
import { poiCategory, poiScore, poiRating, isMustSee, poiKind } from './dayDraft.js';
// The trails layer scores WITHIN a country and ships a bare number; this is
// the one place that turns it into the { score, tier } a rating chip reads,
// so a trail chip is the same shade of confidence here as on the trails tab.
import { trailRating } from '../lib/trailCards.js';

/** How far each layer is worth reaching for, from the stay. A beach 40 km off
 *  is a real day out; a trail 40 km off is somebody else's day, because you
 *  have to get to the trailhead before the walk even starts. */
export const RAIL_KM = {
  water: 40,   // beaches and lakes
  trail: 30,
  shortlist: 40,
};

/** Straight-line km underestimates a walk. 1.25 is the street factor the day
 *  planner already uses to turn crow-flies into something walkable. */
export const STREET_FACTOR = 1.25;

/** Under this, a place is somewhere you walk to and the card says so. */
export const WALKABLE_KM = 1.5;

/** Rough walking pace, km/h, for the "12 min walk" line. */
const WALK_KMH = 4.6;

/** Rough town-to-town driving pace, km/h, for "8 km, ~15 min drive". */
const DRIVE_KMH = 34;

/**
 * The distance line under a card's name.
 *
 * Two different sentences, because under 1.5 km the useful fact is how long
 * it takes on foot and beyond it the useful fact is that you need wheels.
 */
export function distanceLine(km, t) {
  if (km == null || !Number.isFinite(km)) return '';
  if (km <= WALKABLE_KM) {
    const mins = Math.max(1, Math.round((km * STREET_FACTOR / WALK_KMH) * 60));
    return t('dayex.walkMins', { n: mins });
  }
  const mins = Math.max(5, Math.round((km / DRIVE_KMH) * 60));
  return t('dayex.driveKm', { km: Math.round(km), n: mins });
}

/** Steps for a day that visits these rows from the stay, in this order. The
 *  tray states it so the pick list is a day and not a wish list. */
export function stepsForRoute(stay, rows, kmToSteps) {
  if (!stay || !rows.length) return 0;
  let km = 0;
  let cur = stay;
  for (const r of rows) {
    const leg = haversineKm(cur.lat, cur.lon, r.lat, r.lon);
    if (leg != null) km += leg;
    cur = r;
  }
  const back = haversineKm(cur.lat, cur.lon, stay.lat, stay.lon);
  if (back != null) km += back;
  return Math.round(kmToSteps(km * STREET_FACTOR));
}

/**
 * Nearest-first ordering from the stay, so the tray's step estimate is the
 * day somebody would actually walk rather than the order they happened to
 * tap. The same nearest-neighbour rule optimizeOrder uses, on rows rather
 * than POI indices.
 */
export function orderFromStay(stay, rows) {
  if (!stay || rows.length < 2) return rows;
  const left = [...rows];
  const out = [];
  let cur = stay;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    left.forEach((r, i) => {
      const d = haversineKm(cur.lat, cur.lon, r.lat, r.lon);
      if (d != null && d < bd) { bd = d; bi = i; }
    });
    const [next] = left.splice(bi, 1);
    out.push(next);
    cur = next;
  }
  return out;
}

/** The plain-language category a row is filtered by. Rails are a reading
 *  order; these are the buckets the chips slice by. */
export const RAIL_CATS = ['sight', 'water', 'nature', 'active', 'food', 'town'];

/** A catalogue POI, as a rail row. */
export function poiRow(p, destinations) {
  const cat = poiCategory(p.item);
  return {
    key: p.key,
    kind: cat === 'nature' ? 'nature' : cat,
    name: p.item.name,
    lat: p.lat,
    lon: p.lon,
    km: p.km,
    photo: p.item.img || '',
    rating: poiRating(p.item),
    must: isMustSee(p.item),
    sub: poiKind(p.item) || '',
    desc: p.item.desc || '',
    score: poiScore(p.item),
    // A harvested POI is addressable, so it can go in the tray as a pick.
    add: { key: p.key, destId: p.destId, idx: p.idx },
    open: { type: 'dest', id: p.destId },
    townName: destinations?.[p.destId]?.city || '',
  };
}

/** A beach or lake row, off the published layer files.
 *
 *  Both layers ship the same envelope: an `images` array whose first entry is
 *  the 500px thumb, a 0-10 `score` with its own `tier`, and, on a beach, the
 *  official EEA bathing-water `class` for the site it sits on. That verdict is
 *  safety data, so it is passed through exactly as published and never
 *  inferred from the score.
 */
export function waterRow(b, layer, stay) {
  const km = haversineKm(stay.lat, stay.lon, b.lat, b.lon);
  return {
    key: `${layer}:${b.id}`,
    kind: 'water',
    layer,
    name: b.name || '',
    lat: b.lat,
    lon: b.lon,
    km: km == null ? null : Math.round(km),
    photo: b.images?.[0]?.u || '',
    rating: b.score != null ? { score: b.score, tier: b.tier ?? 0 } : null,
    sub: '',
    desc: '',
    score: b.score ?? 0,
    // Nothing to add: a published beach is not a row in a town's POI list, so
    // it opens its own page rather than pretending to be a pick.
    add: null,
    open: { type: 'feature', layer, ref: { id: b.id, cc: b.cc } },
    // The official bathing-water class for this site, where there is one.
    waterClass: b.water?.class || null,
  };
}

/** A published trail, as a rail row.
 *
 *  The trails wire keeps full names (`distance_m`, `ascent_m`, `bbox`), and a
 *  trail's place on the map is the centre of its extent, which is what
 *  tripCentre resolves. A trail with no drawable extent has no distance from
 *  the stay, so it is dropped rather than shown at an invented one.
 */
export function trailRow(tr, centre, stay) {
  if (!centre) return null;
  const km = haversineKm(stay.lat, stay.lon, centre.lat, centre.lon);
  return {
    key: `trail:${tr.id}`,
    kind: 'trail',
    name: tr.name || '',
    lat: centre.lat,
    lon: centre.lon,
    km: km == null ? null : Math.round(km),
    photo: tr.img?.u || '',
    rating: trailRating(tr),
    sub: '',
    desc: tr.summary || '',
    score: tr.rating ?? 0,
    lenKm: Number.isFinite(tr.distance_m) ? Math.round(tr.distance_m / 100) / 10 : null,
    ascentM: Number.isFinite(tr.ascent_m) ? Math.round(tr.ascent_m) : null,
    add: null,
    open: { type: 'feature', layer: 'trail', ref: { id: tr.id, cc: tr.country } },
  };
}

/** A whole town in reach, as a rail row. */
export function townRow(tn) {
  return {
    key: `t:${tn.id}`,
    kind: 'town',
    name: tn.dest?.city || '',
    lat: tn.lat,
    lon: tn.lon,
    km: tn.km,
    photo: tn.dest?.image?.url || '',
    rating: tn.dest?.rating || null,
    gem: !!tn.dest?.rating?.hidden_gem,
    sub: tn.dest?.country || '',
    desc: '',
    score: tn.dest?.rating?.score ?? 0,
    // A town is added as a stop, not as a POI pick.
    add: { town: tn.id },
    open: { type: 'dest', id: tn.id },
    iso2: tn.dest?.iso2 || tn.dest?.country_code || '',
  };
}

/** A dossier "do" item, as a rail row. It has no coordinates of its own, so
 *  it borrows the town's and is never offered as a walking leg. */
export function doRow(item, town, i) {
  return {
    key: `do:${town.id}:${i}`,
    kind: 'do',
    name: item.title || item.name || '',
    lat: town.lat,
    lon: town.lon,
    km: town.km,
    photo: item.img || '',
    rating: null,
    sub: '',
    desc: item.text || item.desc || item.why || '',
    score: 0,
    add: null,
    open: { type: 'dest', id: town.id },
  };
}

/** A festival or event whose date matches the day being planned. */
export function eventRow(ev, town, i) {
  return {
    key: `ev:${town.id}:${i}`,
    kind: 'event',
    name: ev.name || ev.title || '',
    lat: town.lat,
    lon: town.lon,
    km: town.km,
    photo: ev.img || '',
    rating: null,
    sub: ev.when || ev.dates || '',
    desc: ev.desc || ev.text || '',
    score: 0,
    add: null,
    open: { type: 'dest', id: town.id },
  };
}

/**
 * Does this dossier event fall on the day being planned?
 *
 * Dossier events carry dates in several shapes (an ISO range, a month name, a
 * month number), because they came from several sources. An event that cannot
 * be pinned to a date is NOT shown: a rail headed "On this day" that lists
 * something running in a different season is worse than no rail.
 */
export function eventOnDate(ev, iso) {
  if (!ev || !iso) return false;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const month = d.getMonth() + 1;
  const from = ev.from || ev.start || ev.date_from || '';
  const to = ev.to || ev.end || ev.date_to || from;
  if (/^\d{4}-\d{2}-\d{2}/.test(from)) {
    const a = String(from).slice(0, 10);
    const b = /^\d{4}-\d{2}-\d{2}/.test(String(to)) ? String(to).slice(0, 10) : a;
    return iso >= a && iso <= b;
  }
  // Month-only events: "runs in August" matches any August day.
  const m = ev.month ?? ev.m ?? null;
  if (Number.isFinite(Number(m))) return Number(m) === month;
  return false;
}
