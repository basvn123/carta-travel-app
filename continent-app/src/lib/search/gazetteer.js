/**
 * The gazetteer's client half (G12): Europe's towns, regions and countries
 * from GeoNames, built by pipeline/gazetteer_layer.py into
 * public/search/places/ (on the data host with the other search files).
 *
 *   index.json   { v, built, langs, shards: [{ file, from, rows }] }
 *   areas.json   { countries: [[cc, names, bbox, pop]],
 *                  regions:   [[code, names, bbox, pop]] }   code "IT.16"
 *   t-NN.json    [[geonameid, names, lat, lon, cc, admin1, pop]], biggest
 *                town first
 *
 * Shards cover runs of folded names: shard i holds every town with a name
 * whose fold sorts from shards[i].from up to the next shard's start. So a
 * typed prefix needs only the one or two shards its run spans, fetched on
 * the second letter and kept for the session. Everything here works without
 * the files: a failed fetch is an empty list, never an error on screen.
 */
import { dataUrl } from '../dataHost.js';
import { foldName } from '../searchIndex.js';

const BASE = '/search/places/';
const cache = new Map();

function getJson(file) {
  if (!cache.has(file)) {
    cache.set(file, fetch(dataUrl(BASE + file))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null));
  }
  return cache.get(file);
}

export function loadGazetteerIndex() {
  return getJson('index.json');
}

/** Countries and regions, each with its folded names ready to match. */
let areasPromise = null;
export function loadAreas() {
  if (!areasPromise) {
    areasPromise = getJson('areas.json').then((a) => prepareAreas(a));
  }
  return areasPromise;
}

export function prepareAreas(a) {
  const mk = (kind) => (row) => ({
    kind,
    code: row[0],
    cc: String(row[0]).slice(0, 2),
    names: row[1],
    folds: row[1].map(foldName),
    bbox: row[2],
    pop: row[3] || 0,
  });
  return {
    countries: (a?.countries || []).map(mk('country')),
    regions: (a?.regions || []).map(mk('region')),
  };
}

/** The shard files a folded prefix spans (pure). */
export function shardsFor(index, q) {
  const shards = index?.shards || [];
  if (!q || !shards.length) return [];
  const end = `${q}￿`;
  const out = [];
  for (let i = 0; i < shards.length; i++) {
    const from = shards[i].from;
    const next = shards[i + 1]?.from;
    // shard i covers [from, next); the prefix covers [q, q + max char]
    if (from <= end && (next === undefined || next > q)) out.push(shards[i].file);
  }
  return out;
}

/** A shard's rows as town objects with folded names (pure). */
export function prepareTowns(rows) {
  return (rows || []).map((r) => ({
    kind: 'town',
    gid: r[0],
    names: r[1],
    folds: r[1].map(foldName),
    lat: r[2],
    lon: r[3],
    cc: r[4],
    a1: r[5],
    pop: r[6] || 0,
  }));
}

const prepared = new Map();

/** Towns whose shards a typed prefix spans, deduplicated; [] under 2 letters. */
export async function loadTownsFor(rawQuery) {
  const q = foldName(rawQuery);
  if (q.length < 2) return [];
  const index = await loadGazetteerIndex();
  const files = shardsFor(index, q);
  const parts = await Promise.all(files.map(async (f) => {
    if (!prepared.has(f)) prepared.set(f, prepareTowns(await getJson(f)));
    return prepared.get(f);
  }));
  if (parts.length === 1) return parts[0];
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const t of part) {
      if (!seen.has(t.gid)) { seen.add(t.gid); out.push(t); }
    }
  }
  return out;
}
