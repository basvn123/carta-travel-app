/**
 * Which airport one tap on the trip's flight line swaps to (T861): the
 * cheapest door to door when the trip flies from another, else the nearest
 * when it does not fly from it, else the next cheapest. Null with nothing to
 * swap to. Pure, so the node tests hold it.
 *
 *   cf   priced.cartaFlight ({ home, nearest, airports: [{ iata, total, priced }] })
 */
export function swapTarget(cf) {
  const opts = Array.isArray(cf?.airports) ? cf.airports : [];
  const priced = opts.filter((o) => o.priced).sort((a, b) => a.total - b.total);
  const others = priced.filter((o) => o.iata !== cf.home);
  if (!others.length) return null;
  const cheapest = priced[0];
  if (cheapest.iata !== cf.home) return cheapest.iata;
  if (cf.nearest && cf.nearest !== cf.home && others.some((o) => o.iata === cf.nearest)) return cf.nearest;
  return others[0].iata;
}
