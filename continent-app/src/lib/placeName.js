// How a place is named to a traveller, as opposed to how the catalogue keys it.
//
// The catalogue disambiguates airports inside the city field: "Paris (CDG)",
// "Milan (Malpensa)", "London (Stansted)". That qualifier exists so two rows
// that share a city centre stay distinct; it is never what someone calls the
// place they are flying to or staying in. Rendering it raw is how the wizard's
// stop list ended up reading "Paris (CDG)".
//
// Not every parenthetical is an airport. "Heraklion (Crete)" and
// "Loire Valley (Tours)" carry a region that a traveller does want, so this
// strips only the qualifiers that name an airport: a bare IATA-shaped code, or
// a known airport name.

/** Parentheticals that name an airport rather than a region. Kept explicit
 *  because the alternative, "drop anything in brackets", also eats the region
 *  qualifiers that earn their place ("Heraklion (Crete)"). */
const AIRPORT_QUALIFIERS = new Set([
  'beauvais', 'bergamo', 'bromma', 'ciampino', 'chopin', 'fiumicino',
  'gardermoen', 'gatwick', 'heathrow', 'keflavik', 'linate', 'luton',
  'malpensa', 'marco polo', 'modlin', 'orly', 'otopeni', 'skavsta',
  'stansted', 'torp', 'treviso', 'arlanda',
]);

/** True when a parenthetical is an airport qualifier: a bare IATA-shaped code
 *  ("CDG") or one of the airport names above. */
function isAirportQualifier(inner) {
  const s = inner.trim();
  if (/^[A-Z]{3}$/.test(s)) return true;
  return AIRPORT_QUALIFIERS.has(s.toLowerCase());
}

/** The city name a traveller would use: "Paris (CDG)" and "Milan (Malpensa)"
 *  become "Paris" and "Milan", while "Heraklion (Crete)" is left alone.
 *  Non-strings and blanks come back as ''. */
export function cityLabel(city) {
  if (typeof city !== 'string') return '';
  return city.replace(/\s*\(([^()]*)\)\s*$/, (whole, inner) => (
    isAirportQualifier(inner) ? '' : whole
  )).trim();
}

/** The key a city groups under when several catalogue rows share one centre.
 *  Unlike cityLabel this drops EVERY trailing parenthetical, because grouping
 *  wants "Heraklion (Crete)" and a bare "Heraklion" to collapse together. */
export function cityKeyName(city) {
  if (typeof city !== 'string') return '';
  return city.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

/** cityLabel for a destination row. */
export function destCityLabel(dest) {
  return cityLabel(dest?.city);
}
