/**
 * data.mjs, reads the records a card is made from, straight off the wire files.
 *
 * The wire is whatever sits in the data directory (public/ by default, or the
 * R2 staging copy through --data). The generator never writes there. A record
 * is looked up by the id the page URL carries, so the prerender in T221 can
 * call these with the same keys it routes on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from './tokens.mjs';

export const DEFAULT_DATA = path.join(APP_ROOT, 'public');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function loadBoot(dir = DEFAULT_DATA) {
  return readJson(path.join(dir, 'boot.json'));
}

/** A destination by wire key ('BRU', 'gem:soldeu') or by exact city name. */
export function findDestination(query, dir = DEFAULT_DATA) {
  const q = String(query).toLowerCase();
  const root = path.join(dir, 'dest');
  for (const f of fs.readdirSync(root).filter((n) => n.endsWith('.json'))) {
    const rows = readJson(path.join(root, f));
    for (const [key, d] of Object.entries(rows)) {
      if (key.toLowerCase() === q || String(d.city || '').toLowerCase() === q) return { key, dest: d };
    }
  }
  return null;
}

const LAYER_KEY = { beach: ['beaches', 'beaches'], lake: ['lakes', 'lakes'], mountain: ['mountains', 'mountains'] };

/** A beach, lake or mountain by id. The country is the id's first segment. */
export function findLayerRow(type, id, dir = DEFAULT_DATA) {
  const [folder, key] = LAYER_KEY[type];
  const cc = String(id).split('-')[0].toUpperCase();
  const file = path.join(dir, folder, `${cc}.json`);
  if (!fs.existsSync(file)) return null;
  const wire = readJson(file);
  return [...(wire[key] || []), ...(wire.listed || [])].find((r) => r.id === id) || null;
}

/** A trail by 'CC/id' (the country file is the only index there is). */
export function findTrail(ref, dir = DEFAULT_DATA) {
  const [cc, id] = String(ref).split('/');
  const file = path.join(dir, 'trails', `${cc.toUpperCase()}.json`);
  if (!fs.existsSync(file)) return null;
  return (readJson(file).trips || []).find((t) => String(t.id) === id) || null;
}

/** The headline counts the site card quotes, read from the boot index. */
export function siteCounts(dir = DEFAULT_DATA) {
  const boot = loadBoot(dir);
  const cols = boot.cols;
  const cc = cols.indexOf('cc');
  const rows = Object.values(boot.d);
  return { places: rows.length, countries: new Set(rows.map((r) => r[cc])).size };
}
