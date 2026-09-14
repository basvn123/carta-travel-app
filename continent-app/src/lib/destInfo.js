/**
 * destInfo.js, the lazy per-destination info layer: parking and events.
 *
 * One file per country under /destinfo/{CC}.json, written by
 * pipeline/export_destinfo.py from the OSM parking harvest and the Wikidata
 * events harvest. Fetched the first time a destination of that country is
 * opened, cached for the session.
 *
 * Repo gotcha this file contains (same as trails.js and features.js): under
 * public/ a missing JSON is served as the SPA's index.html with status 200,
 * so every fetch checks the content type and resolves null. A missing file
 * means the layer is not built for that country, which the UI states
 * differently from "this town has no mapped parking".
 */
import { useEffect, useState } from 'react';

const COUNTRY_RE = /^[A-Z]{2}$/;

function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

const cache = new Map();

export function loadDestInfo(cc) {
  const code = String(cc || '').toUpperCase();
  if (!COUNTRY_RE.test(code)) return Promise.resolve(null);
  if (!cache.has(code)) {
    cache.set(code, fetch(`/destinfo/${code}.json`)
      .then((r) => (isJson(r) ? r.json() : null))
      .catch(() => null));
  }
  return cache.get(code);
}

/**
 * The info row for one destination, or:
 *   undefined  while loading
 *   null       when the country file exists but holds nothing for this place
 *              (an honest empty, the sections say what that means), or when
 *              the layer is not built at all (doc null; row.missing marks it).
 */
export function useDestInfo(dest) {
  const [state, setState] = useState(undefined);
  const cc = dest?.iso2;
  const id = dest?.id;
  useEffect(() => {
    let live = true;
    setState(undefined);
    if (!cc || !id) { setState(null); return undefined; }
    loadDestInfo(cc).then((doc) => {
      if (!live) return;
      if (!doc) { setState({ missing: true }); return; }
      setState(doc.dests?.[id] || {});
    });
    return () => { live = false; };
  }, [cc, id]);
  return state;
}

/** Google Maps navigation link to a coordinate, the app-wide convention:
 *  coordinates, never names, so the pin lands on the entrance we measured. */
export function mapsNavUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

export function mapsSearchUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}
