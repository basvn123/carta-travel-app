// The trip's cost in four tiles (T820, owner 2026-10-29: "four tiles"):
// Flights (or Driving), Getting around, Stay and Food. Every tile is a sum of
// quoteTrip()'s own parts, so the four always add up to grandTotal to the
// cent; no tile prices anything itself. A tile whose way there or home has
// no price yet says so (`missing`), and a tile with nothing in it says it is
// not needed rather than showing €0 as a price.

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {object} priced quoteTrip() output
 * @returns {Array<{key:'travel'|'around'|'stay'|'food', eur:number, parts:string[], driving:boolean, missing:boolean, empty:boolean}>}
 */
export function costTiles(priced) {
  if (!priced?.parts) return [];
  const p = priced.parts;
  const driving = Boolean(priced.flight?.driving);
  const cf = priced.cartaFlight || {};
  const tr = priced.travelSplit || { legacy: false, out: 0, back: 0 };
  // A way there or home with no figure at all (no flight found, not typed).
  const wayMissing = (dir) => {
    if (driving) return false;
    if (tr.legacy) return false;
    if ((tr[dir] || 0) > 0) return false;
    if (cf[dir]?.cost) return false;
    if (priced.flight?.own && (priced.flight.cost_total || 0) > 0) return false;
    return true;
  };
  // T861: the way to the home airport is part of getting there.
  const travelParts = driving ? ['travel', 'drive', 'flights', 'airport'] : ['travel', 'flights', 'airport'];
  // T843: day trips from a base are getting around too.
  const aroundParts = driving ? ['transfers', 'between', 'car', 'daytrips'] : ['transfers', 'drive', 'between', 'car', 'daytrips'];
  const sum = (keys) => r2(keys.reduce((n, k) => n + (p[k] || 0), 0));
  const tile = (key, keys, extra = {}) => {
    const eur = sum(keys);
    return { key, eur, parts: keys, driving, missing: false, empty: eur <= 0, ...extra };
  };
  const travel = tile('travel', travelParts);
  travel.missing = wayMissing('out') || wayMissing('back');
  travel.empty = travel.eur <= 0 && !travel.missing;
  return [
    travel,
    tile('around', aroundParts),
    tile('stay', ['beds']),
    tile('food', ['days']),
  ];
}

/** Which tile a receipt line (tripLines' key) belongs to. */
export function tileOfLine(lineKey, driving = false) {
  if (lineKey === 'out' || lineKey === 'back' || lineKey === 'travel' || lineKey === 'airport') return 'travel';
  if (lineKey === 'drive') return driving ? 'travel' : 'around';
  if (lineKey === 'beds') return 'stay';
  if (lineKey === 'days') return 'food';
  return 'around';
}
