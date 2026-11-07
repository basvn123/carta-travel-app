/**
 * The alias table of the place linker (T1153, ROADMAP F4).
 *
 * One row per way a person might write a catalogue place, built only from
 * data Carta already ships:
 *
 *   name      the catalogue name (app_data destinations[].city)
 *   part      "Rome (Fiumicino)" also reads as "rome" and "fiumicino"
 *   slug      a gem's id without "gem:" ("kranjska-gora")
 *   endonym   a key of search_index.json that is not the name itself
 *             (the curated EXONYMS of pipeline/search_index_layer.py: firenze, wien)
 *   exonym    a "place" row of search/ask/lexicon.json (pipeline/ask_lexicon.py:
 *             lissabon, cracovia, salisburgo), with its language
 *   member    a member village of search_index.json, resolving to its parent
 *   iata      an airport's own IATA code, matched only as a code
 *
 * Wikidata labels are not in the shipped data yet (43 places carry a qid and
 * no labels); that source is register row T1153-b. Common misspellings are
 * not listed: the character n-gram pass is what catches them.
 *
 * Every input is optional, so the table builds from the search index alone
 * (the Explore list in viewport mode has no full catalogue in memory).
 */
import { clean } from './fold.js';

export const KIND_WEIGHT = {
  name: 1, iata: 1, endonym: 0.97, exonym: 0.95, part: 0.92, slug: 0.92, member: 0.86,
};

const baseCity = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const paren = (name) => (String(name || '').match(/\(([^)]*)\)\s*$/) || [])[1] || '';

function toMap(destinations) {
  if (!destinations) return {};
  if (Array.isArray(destinations)) return Object.fromEntries(destinations.map((d) => [d.id, d]));
  return destinations;
}

/**
 * -> { rows: [{ key, id, kind, w, label, lang }], places: { id: meta }, codes: { BCN: [id] } }
 * meta = { id, name, iso2, country, iata, anchor, lat, lon, tier, prior, group }
 */
export function buildAliases({ destinations = null, searchIndex = null, lexicon = null } = {}) {
  const dest = toMap(destinations);
  const places = {};
  const codes = {};
  const best = new Map(); // `${key}|${id}` -> row

  const add = (rawKey, id, kind, extra = {}) => {
    const key = clean(rawKey);
    if (!key || key.length < 2 || !id) return;
    const w = KIND_WEIGHT[kind];
    const k = `${key}|${id}`;
    const had = best.get(k);
    // The accented spelling of a name ("fårö") survives when the same key
    // also comes in, unaccented, from a stronger source (T1215, row T1153-g).
    if (!had || had.w < w) best.set(k, { key, id, kind, w, label: extra.label || null, lang: extra.lang || null, raw: extra.raw || had?.raw || null });
    else if (!had.raw && extra.raw) had.raw = extra.raw;
  };

  const place = (id) => {
    if (places[id]) return places[id];
    const d = dest[id] || {};
    const pop = Number(d.geonames?.population) || 0;
    const popN = pop > 0 ? Math.min(1, Math.log10(pop) / 7) : 0;
    const base = Number.isFinite(d.place?.base) ? d.place.base : (d.tier === 'airport' ? 0.6 : 0.3);
    const name = d.city || null;
    const iso2 = d.iso2 || null;
    places[id] = {
      id,
      name,
      iso2,
      country: d.country || null,
      iata: d.iata || null,
      anchor: d.anchor_airport || null,
      lat: d.city_lat ?? d.lat ?? null,
      lon: d.city_lon ?? d.lon ?? null,
      tier: d.tier || (String(id).startsWith('gem:') ? 'gem' : 'airport'),
      // Popularity prior in [0, 1]: the place-size score and the population.
      // A secondary gateway (Ciampino beside Fiumicino) ranks just below its main airport.
      prior: Math.max(0, Math.min(1, 0.5 * base + 0.5 * popN)) * (d.gateway_of ? 0.95 : 1),
      // Rome's two airports are one place to a traveller: they share a group.
      group: d.tier === 'airport' && name ? `${clean(baseCity(d.gateway_of && dest[d.gateway_of]?.city ? dest[d.gateway_of].city : name))}|${iso2}` : id,
    };
    return places[id];
  };

  for (const [id, d] of Object.entries(dest)) {
    place(id);
    if (d.city) {
      const raw = (x) => ({ raw: x.normalize('NFC').toLowerCase().trim() });
      add(d.city, id, 'name', raw(d.city));
      if (baseCity(d.city) !== d.city) add(baseCity(d.city), id, 'part', raw(baseCity(d.city)));
      if (paren(d.city)) add(paren(d.city), id, 'part', raw(paren(d.city)));
    }
    if (String(id).startsWith('gem:')) add(id.slice(4), id, 'slug');
    if (d.tier === 'airport' && d.iata) (codes[d.iata] ||= []).push(id);
  }

  for (const [key, hits] of Object.entries(searchIndex?.entries || {})) {
    for (const row of hits || []) {
      const [t, id, member] = row;
      place(id);
      if (t === 'm') add(key, id, 'member', { label: member || key });
      else {
        const n = places[id].name;
        add(key, id, n && (clean(n) === clean(key) || clean(baseCity(n)) === clean(key)) ? 'name' : 'endonym');
      }
    }
  }

  for (const r of lexicon?.phrases || []) {
    if (r[2] !== 'place') continue;
    place(r[3]);
    add(r[0], r[3], 'exonym', { lang: r[1] });
  }

  // A place known only from the index still gets a display name.
  const rows = [...best.values()];
  for (const r of rows) {
    const p = places[r.id];
    if (!p.name && (r.kind === 'name' || r.kind === 'endonym')) p.name = r.key.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return { rows, places, codes };
}
