/**
 * The licensed feature photographs of one country, for trail cards that have
 * no photograph of their own (G8, T1127, rule in lib/trailPhoto.js). Reads
 * the beach, lake and mountain wires through their own cached loaders, so a
 * visitor who already opened those tabs pays nothing. A layer that fails to
 * load just adds nothing: the card falls back to the next rule.
 */
import { useEffect, useState } from 'react';
import { loadBeaches } from './beaches.js';
import { loadLakes } from './lakes.js';
import { loadMountains } from './mountains.js';
import { poolFrom } from './trailPhoto.js';

export function loadTrailPhotoPool(cc) {
  const ok = (p) => p.catch(() => null);
  return Promise.all([ok(loadBeaches(cc)), ok(loadLakes(cc)), ok(loadMountains(cc))])
    .then(([b, l, m]) => [...poolFrom('beach', b), ...poolFrom('lake', l), ...poolFrom('peak', m)]);
}

const EMPTY = [];

/** The pool for `cc`, empty until it has loaded (and when `enabled` is false). */
export function useTrailPhotoPool(cc, enabled) {
  const [pool, setPool] = useState({ cc: null, rows: EMPTY });
  useEffect(() => {
    if (!enabled || !cc) return undefined;
    let live = true;
    loadTrailPhotoPool(cc).then((rows) => { if (live) setPool({ cc, rows }); });
    return () => { live = false; };
  }, [cc, enabled]);
  return enabled && pool.cc === cc ? pool.rows : EMPTY;
}
