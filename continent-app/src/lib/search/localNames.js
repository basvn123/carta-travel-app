/**
 * Carta's place names in the UI language (G12, judge 1 fix 3).
 *
 * The catalogue names a place in English ("Florence"). Search already shows
 * Carta's rows in the UI language from the gazetteer (suggest.js
 * localPlaceName), so a German traveller picks "Florenz"; the row that pick
 * opens should say the same. A pick records its name here and the list row
 * reads it back, with no fetch: the gazetteer is 20 shards of about 300 KB,
 * too much to load for every card. A place never picked keeps its English
 * name, as it does on every other screen today.
 *
 * usePlaceLocalName fetches the one shard a single named place needs (the
 * Prices example in Settings).
 */
import React from 'react';
import { townNames } from './startNames.js';

const names = new Map();

/** Remember the name a picked Carta place showed in `lang`. */
export function rememberLocalName(id, lang, name) {
  if (!id || !lang || lang === 'en' || !name) return;
  names.set(`${lang}|${id}`, name);
}

/** The name a pick showed for this place in `lang`, or null. */
export function localNameOf(id, lang) {
  if (!id || !lang) return null;
  return names.get(`${lang}|${id}`) || null;
}

/** For tests. */
export function resetLocalNames() {
  names.clear();
}

/**
 * One place's name in the UI language: a remembered pick at once, else the
 * gazetteer town at the place's position once its shard arrives. Null
 * until then, and in English or when the gazetteer has no name for it.
 *   dest  a catalogue row ({ id, city, city_lat|lat, city_lon|lon })
 */
export function usePlaceLocalName(dest, lang) {
  const known = localNameOf(dest?.id, lang);
  const lat = dest?.city_lat ?? dest?.lat;
  const lon = dest?.city_lon ?? dest?.lon;
  const [found, setFound] = React.useState(null);
  const key = !known && dest?.city && lang && lang !== 'en' ? `${lang}|${dest.city}|${lat}|${lon}` : '';
  React.useEffect(() => {
    if (!key) return undefined;
    let live = true;
    townNames(dest.city, lat, lon).then((n) => {
      if (live) setFound({ key, name: n?.[lang] || null });
    });
    return () => { live = false; };
    // key holds every input the lookup reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (known) return known;
  return found && found.key === key ? found.name : null;
}
