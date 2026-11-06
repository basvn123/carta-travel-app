// Read-only access to the shipped wire data (ROADMAP F7). Files only: no
// network, no secrets, no write. The data directory is the app's `public/`
// (or a fixture copy in tests); override with CARTA_DATA_DIR.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../../continent-app/public', import.meta.url));

export function dataDirFrom(env = process.env) {
  return resolve(env.CARTA_DATA_DIR || DEFAULT_DATA_DIR);
}

/** @param {string} dir */
export function openData(dir = dataDirFrom()) {
  let catalogue = null;
  let trips = null;
  const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

  return {
    dir,
    /** { meta, destinations } from app_data.json, read once. */
    catalogue() {
      if (!catalogue) {
        const p = join(dir, 'app_data.json');
        if (!existsSync(p)) throw new Error(`app_data.json not found in ${dir}`);
        const j = readJson(p);
        catalogue = { meta: j.meta || {}, destinations: j.destinations || {} };
      }
      return catalogue;
    },
    /** Library trips (journeys), read once from journeys/journey/*.json. */
    trips() {
      if (!trips) {
        const d = join(dir, 'journeys', 'journey');
        trips = existsSync(d)
          ? readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(d, f)))
          : [];
      }
      return trips;
    },
  };
}
