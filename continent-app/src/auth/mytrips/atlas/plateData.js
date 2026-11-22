/**
 * The light Europe plate's data (G12, Phase B): loading public/europe_map.json
 * once, a country's state, the share of land, and the plate's colours. Kept
 * apart from AtlasPlate.jsx so that file exports components only.
 */
import { useEffect, useState } from 'react';
import { COUNTRY_ISO2 } from '../../../components/CountryFlag.jsx';
import { BASEMAP_COLOURS } from '../../../map/tokenColors.js';

/**
 * Europe drawn as a map (T970, owner 2026-11-01: "the cleanest, nicest
 * looking map", replacing T926's tiles). public/europe_map.json is Natural
 * Earth projected equal-area at 52N 10E and already written as SVG paths
 * (pipeline/oneoff/build_europe_map.py): the 43 catalogue countries one path
 * each with a label point and true area, the land around them as one quiet
 * context path, the smallest countries flagged to draw as a dot too.
 */
let europeMapPromise = null;
export const loadEuropeMap = () => {
  if (!europeMapPromise) {
    europeMapPromise = fetch('/europe_map.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => { europeMapPromise = null; return null; });
  }
  return europeMapPromise;
};
export function useEuropeMap() {
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    let live = true;
    loadEuropeMap().then((g) => { if (live) setGeo(g); });
    return () => { live = false; };
  }, []);
  return geo;
}

export const NAME_OF = Object.fromEntries(Object.entries(COUNTRY_ISO2).map(([name, iso]) => [iso, name]));
export const stateOf = (cc, been, next, saved) => (been.has(cc) ? 'been' : next.has(cc) ? 'next' : saved.has(cc) ? 'saved' : 'none');

/** The share of the catalogue's land in `set`, in percent: honest because
 *  the plate's areas are equal-area (km2 per country from the build script). */
export function landShare(geo, set) {
  if (!geo) return 0;
  let all = 0;
  let mine = 0;
  for (const c of geo.countries) {
    all += c.km2;
    if (set.has(c.cc)) mine += c.km2;
  }
  return all > 0 ? (mine / all) * 100 : 0;
}

/** The plate's land, sea and border as CSS properties, from Explore's own
 *  basemap colours (decision: the plate matches Explore). */
export const plateColours = (theme = 'light') => {
  const c = BASEMAP_COLOURS[theme] || BASEMAP_COLOURS.light;
  return { '--atlas-sea': c.water, '--atlas-land': c.land, '--atlas-border': c.border };
};
