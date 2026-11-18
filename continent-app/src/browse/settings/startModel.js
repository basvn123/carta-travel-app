/*
 * The Start step's lists, without React (G12 Settings): every country a
 * traveller in Europe may start from, A to Z in the reader's language with
 * theirs on top, and a search over those countries and the towns in
 * Carta's data. The nearest town to "here" is the engine's
 * (lib/settings/start.js nearestTown).
 */
import { foldName, nameRank } from '../../lib/placeSearch.js';
import { cityLabel } from '../../lib/placeName.js';

/** Every country the app draws a flag for (components/CountryFlag.jsx): the
 *  whole of Europe a trip can start from, Turkey and Ukraine included. */
export const EUROPE = Object.freeze([
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FO',
  'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME',
  'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'TR', 'UA', 'XK',
]);

/**
 * The countries as rows { iso2, name }, A to Z by `nameOf` in `locale`,
 * with `home` (the traveller's country) lifted to the top.
 */
export function orderedCountries(nameOf, home = '', locale = 'en') {
  const rows = EUROPE.map((iso2) => ({ iso2, name: nameOf(iso2) }));
  rows.sort((a, b) => a.name.localeCompare(b.name, locale));
  const at = rows.findIndex((r) => r.iso2 === home);
  if (at > 0) rows.unshift(...rows.splice(at, 1));
  return rows;
}

/** The towns in Carta's data as start rows, one a name and country. */
export function townRows(destinations) {
  const out = [];
  const seen = new Set();
  for (const [id, d] of Object.entries(destinations || {})) {
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    if (!d?.city || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // "Rome (Fiumicino)" is Rome: one row a town, named as travellers say it.
    const name = cityLabel(d.city);
    const key = `${d.iso2 || d.country}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, name, lat, lon, iso2: d.iso2 || null, country: d.country || '' });
  }
  return out;
}

/**
 * What a typed query finds: matching countries first (at most 4), then
 * towns by how well the name matches (placeSearch's ranks), at most `limit`.
 */
export function searchStart(query, countries, towns, limit = 8) {
  const q = foldName(String(query || '').trim());
  if (!q) return { countries: [], towns: [] };
  const cs = countries
    .map((c) => ({ c, r: nameRank(c.name, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .slice(0, 4)
    .map((x) => x.c);
  const ts = [];
  for (const town of towns || []) {
    const r = nameRank(town.name, q);
    if (r >= 0) ts.push({ town, r });
  }
  ts.sort((a, b) => a.r - b.r || a.town.name.length - b.town.name.length || a.town.name.localeCompare(b.town.name));
  return { countries: cs, towns: ts.slice(0, limit).map((x) => x.town) };
}
