/**
 * What counts as a "city" for the map's size toggle.
 *
 * place_layer.py grades every destination into five classes (metro, city, town,
 * village, area). The catalogue is 3,000 places and most of them are small, so
 * a map of all of them answers "where could I go" and never answers "where
 * would I base myself". The toggle splits exactly there: metro and city on one
 * side, everything smaller on the other. It is a single line, but both the map
 * control and the search filter have to agree on it, so it lives here.
 */
const BIG = new Set(['metro', 'city']);

export function isBigPlace(p) {
  return BIG.has(p?.place?.class);
}
