/**
 * The party stepper's arithmetic (W3-L1, E2, G-8): what setPartyParts is told
 * after one stepper moved. Teens (12 to 17) are priced as adults and counted
 * inside the seats' adults, so the adults row shows the others (18 and over)
 * and the seats sent on are the two added back together. Pure, so a node test
 * can read it.
 */

/**
 * @param {{adults:number, teens:number, children:number, babies:number}} now  what the rows show (adults = 18 and over)
 * @param {string} key  the row that moved: adults, teens, children or babies
 * @param {number} n    its new count
 * @param {boolean} withTeens  E2 on: the teens row exists and teens are sent
 * @returns {{adults:number, children:number, babies:number, teens?:number}}  adults here are every adult seat, teens included
 */
export function partsAfter(now, key, n, withTeens) {
  const next = { ...now, [key]: n };
  const out = { adults: next.adults + (withTeens ? next.teens : 0), children: next.children, babies: next.babies };
  return withTeens ? { ...out, teens: next.teens } : out;
}
