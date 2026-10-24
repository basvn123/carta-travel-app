/**
 * dayIdeas.js (T671), what a trip's days can be made of, as sections, and
 * the rules for keeping an idea and putting it on a day.
 *
 * For each stop of a trip the overview shows its ideas in sections, after the
 * owner's list (board brief "day ideas"): what you can't miss, top sights,
 * adventures, walking routes, cycling, the outdoors (beaches, lakes, peaks,
 * nature), food, and what is on while you are there. The order of the
 * sections follows the trip's main goal (the day rhythm), and the party
 * trims what does not suit it (slower walkers and young children skip long
 * climbs). Every row is a rail row from dayExploreRails.js, so the cards are
 * the ones the day builder already draws.
 *
 * Keeping and placing work on the day planner's own records: a kept idea is
 * a snapshot in prefs.savedIdeas[destId]; a placed catalogue POI is its index
 * in the town's list; any other idea (a trail, a beach, a peak, a festival)
 * becomes one of the plan's own places (prefs.customPois, append only, the
 * existing rule) and is placed by the index it lands at. Plain JS.
 */
import { poiRow, eventOnDate, doRow, eventRow } from '../dayExploreRails.js';
import { haversineKm } from '../../lib/runtime_pricing.js';

export const SECTION_KEYS = ['cantmiss', 'sights', 'adventures', 'walks', 'cycling', 'outdoors', 'food', 'events'];

/** The order the sections are read in, by the trip's main goal. */
const ORDER = {
  culture: ['cantmiss', 'sights', 'events', 'food', 'walks', 'adventures', 'outdoors', 'cycling'],
  relax: ['cantmiss', 'outdoors', 'food', 'sights', 'walks', 'events', 'adventures', 'cycling'],
  outdoors: ['cantmiss', 'walks', 'outdoors', 'adventures', 'cycling', 'sights', 'food', 'events'],
  food: ['cantmiss', 'food', 'sights', 'events', 'walks', 'outdoors', 'adventures', 'cycling'],
  '': ['cantmiss', 'sights', 'adventures', 'walks', 'outdoors', 'food', 'cycling', 'events'],
};

const SECTION_MAX = 12;
const byStrength = (a, b) => (b.score - a.score) || ((a.km ?? 0) - (b.km ?? 0));

/** A town's catalogue POIs as rail rows, measured from where the day starts. */
export function poiRowsFor(items, walkable, destId, stay, destinations) {
  const out = [];
  (items || []).forEach((item, idx) => {
    if (!item || item.custom || !walkable?.has?.(idx)) return;
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
    const km = stay ? haversineKm(stay.lat, stay.lon, item.lat, item.lon) : null;
    out.push(poiRow({ key: `${destId}:${idx}`, item, lat: item.lat, lon: item.lon, km: km == null ? null : Math.round(km * 10) / 10, destId, idx }, destinations));
  });
  return out;
}

/**
 * The sections for one stop. Inputs are rail rows (trails, water, peaks and
 * cycle routes already measured from the stay) and the town's dossier.
 *
 *   dates   the stop's ISO dates, for what is on
 *   goal    the day rhythm's main goal ('' when unanswered)
 *   party   { kids, slowWalkers }
 */
export function buildIdeaSections({
  pois = [], trails = [], water = [], peaks = [], cycling = [], dossier = null, town = null,
  dates = [], goal = '', party = {},
} = {}) {
  const easy = Boolean(party.slowWalkers) || (party.kids || 0) > 0;
  // Long climbs are left out for slower walkers and young children.
  const walkOk = (r) => !easy || ((r.ascentM ?? 0) <= 400 && (r.lenKm ?? 0) <= 10);
  const sights = pois.filter((r) => r.kind === 'sight').sort((a, b) => (Number(b.must) - Number(a.must)) || byStrength(a, b));
  const must = sights.filter((r) => r.must);
  const rest = sights.filter((r) => !r.must);
  const doItems = town ? (dossier?.do || dossier?.things || []).map((it, i) => doRow(it, town, i)) : [];
  const active = pois.filter((r) => r.kind === 'active').sort(byStrength);
  const nature = pois.filter((r) => r.kind === 'nature').sort(byStrength);
  const events = town ? (dossier?.festivals || dossier?.events || [])
    .filter((e) => (dates.length ? dates.some((d) => eventOnDate(e, d)) : false))
    .map((e, i) => eventRow(e, town, i)) : [];
  const sections = {
    cantmiss: must.length >= 2 ? must : sights.slice(0, 6),
    sights: must.length >= 2 ? rest : sights.slice(6),
    adventures: [...doItems.filter((r) => r.sub !== 'festival'), ...active],
    walks: trails.filter(walkOk).sort(byStrength),
    cycling: cycling.filter(walkOk).sort(byStrength),
    outdoors: [...water, ...peaks.filter((r) => !easy || r.lift || (r.eleM ?? 0) < 1500), ...nature].sort(byStrength),
    food: pois.filter((r) => r.kind === 'food').sort(byStrength),
    events,
  };
  const order = ORDER[goal] || ORDER[''];
  // A section the data cannot fill yet keeps its place, after the filled
  // ones, marked empty: the overview shows the shared "Not available yet"
  // line there (owner 2026-10-24: leave placeholders where the data does not
  // support a section yet), rather than hiding that it exists.
  const all = order.map((key) => ({ key, rows: (sections[key] || []).slice(0, SECTION_MAX) }));
  return [
    ...all.filter((s) => s.rows.length > 0).map((s) => ({ ...s, empty: false })),
    ...all.filter((s) => s.rows.length === 0).map((s) => ({ ...s, empty: true })),
  ];
}

// ---- Keeping an idea ----

/** What a kept idea stores: enough to draw it and to place it later. */
export function ideaSnapshot(row) {
  return {
    key: row.key, kind: row.kind, name: row.name, lat: row.lat, lon: row.lon,
    photo: row.photo || '', sub: row.sub || '', desc: row.desc || '',
    rating: row.rating || null, add: row.add || null, km: row.km ?? null,
  };
}

/** The keys kept for one stop. */
export function savedKeys(prefs, destId) {
  return new Set((prefs?.savedIdeas?.[destId] || []).map((r) => r.key));
}

/** Keep or let go of an idea (returns new prefs). */
export function toggleSaved(prefs, destId, row) {
  const list = prefs?.savedIdeas?.[destId] || [];
  const has = list.some((r) => r.key === row.key);
  const next = has ? list.filter((r) => r.key !== row.key) : [...list, ideaSnapshot(row)];
  return { ...(prefs || {}), savedIdeas: { ...(prefs?.savedIdeas || {}), [destId]: next } };
}

// ---- Putting an idea on a day ----

const CUSTOM_KIND = { trail: 'trail', water: 'beach', peak: 'peak', cycle: 'cycle', do: 'activity', event: 'event' };

/**
 * Put an idea on day `di` of stop `si`. A catalogue POI is placed by its own
 * index; anything else becomes (once) one of the plan's own places for that
 * town and is placed by the index it has after the catalogue (`baseLen`, the
 * town's catalogue length). An idea already on another day of the stop moves
 * here; one already on this day is left where it is.
 *
 * Returns { assignments, prefs, idx, moved, already }.
 */
export function placeIdea({ assignments = {}, prefs = {}, si, di, destId, baseLen, row }) {
  let idx;
  let nextPrefs = prefs;
  if (row.add && Number.isInteger(row.add.idx) && row.add.destId === destId) {
    idx = row.add.idx;
  } else {
    const customs = prefs?.customPois?.[destId] || [];
    let j = customs.findIndex((c) => c.ideaKey === row.key);
    if (j < 0) {
      const item = {
        id: `i${customs.length}${Math.abs(hash(row.key))}`,
        name: row.name,
        kind: CUSTOM_KIND[row.kind] || row.kind || 'sight',
        desc: row.desc || '',
        lat: row.lat,
        lon: row.lon,
        img: row.photo || '',
        custom: true,
        ideaKey: row.key,
      };
      nextPrefs = {
        ...(prefs || {}),
        customPois: { ...(prefs?.customPois || {}), [destId]: [...customs, item] },
      };
      j = customs.length;
    }
    idx = baseLen + j;
  }
  const stopDays = { ...(assignments?.[si] || {}) };
  const today = stopDays[di] || [];
  if (today.includes(idx)) return { assignments, prefs: nextPrefs, idx, moved: false, already: true };
  let moved = false;
  for (const [d, list] of Object.entries(stopDays)) {
    if (Number(d) !== di && (list || []).includes(idx)) {
      stopDays[d] = list.filter((x) => x !== idx);
      moved = true;
    }
  }
  stopDays[di] = [...today, idx];
  return { assignments: { ...assignments, [si]: stopDays }, prefs: nextPrefs, idx, moved, already: false };
}

/** Which day of the stop an idea is on, or -1. */
export function dayOfIdea({ assignments = {}, prefs = {}, si, destId, baseLen, row }) {
  let idx = null;
  if (row.add && Number.isInteger(row.add.idx) && row.add.destId === destId) idx = row.add.idx;
  else {
    const j = (prefs?.customPois?.[destId] || []).findIndex((c) => c.ideaKey === row.key);
    if (j >= 0) idx = baseLen + j;
  }
  if (idx == null) return -1;
  for (const [d, list] of Object.entries(assignments?.[si] || {})) if ((list || []).includes(idx)) return Number(d);
  return -1;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = ((h << 5) - h + String(s).charCodeAt(i)) | 0;
  return h;
}
