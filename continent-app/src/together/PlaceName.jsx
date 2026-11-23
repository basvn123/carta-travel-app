import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { localNameOf } from '../lib/search/localNames.js';
import { townNames } from '../lib/search/startNames.js';
import { cityLabel, destCityLabel } from '../lib/placeName.js';

/**
 * Place names in the reader's language across Vrienden (G16, judge 1 fix 2):
 * "dagen tot Lissabon", not "Lisbon". One hook for every place a screen
 * shows: a name a search pick remembered at once (localNames.js), else the
 * gazetteer town at the place's position once its shard arrives (the same
 * lookup as usePlaceLocalName), else the catalogue name without an airport
 * qualifier. English needs no lookup.
 *
 *   const name = usePlaceNames(destinations, ids);
 *   name(id, fallbackCity)
 */
export function usePlaceNames(destinations, ids) {
  const { lang } = useI18n();
  const list = [...new Set((ids || []).filter(Boolean))].sort();
  const key = lang && lang !== 'en' && list.length ? `${lang}|${list.join(',')}` : '';
  const [found, setFound] = useState({ key: '', map: {} });
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    Promise.all(list.map((id) => {
      const d = destinations?.[id];
      if (!d?.city || localNameOf(id, lang)) return null;
      return townNames(d.city, d.city_lat ?? d.lat, d.city_lon ?? d.lon)
        .then((n) => (n?.[lang] ? [id, n[lang]] : null))
        .catch(() => null);
    })).then((rows) => {
      if (live) setFound({ key, map: Object.fromEntries(rows.filter(Boolean)) });
    });
    return () => { live = false; };
    // key holds every input the lookup reads (the ids and the language).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, destinations]);
  const map = useMemo(() => (found.key === key ? found.map : {}), [found, key]);
  return useCallback((id, fallback = '') => (
    (id && (map[id] || localNameOf(id, lang) || destCityLabel(destinations?.[id])))
    || cityLabel(fallback)
    || String(id || '').replace(/^gem:/, '').replace(/^\w/, (ch) => ch.toUpperCase())
  ), [map, lang, destinations]);
}

/** Several names as one label in the reader's language ("Lissabon en
 *  Porto", "Lisbonne et Porto"); never an English "and". */
export function joinNames(names, lang) {
  const xs = (names || []).filter(Boolean);
  if (xs.length < 2) return xs[0] || '';
  try { return new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(xs); } catch { return xs.join(', '); }
}
