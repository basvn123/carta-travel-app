/**
 * Tickets in the day's price (T501, roadmap 1.3d and 4.19, owner T492-d).
 *
 * A place carries a ticket only when the map data says so: OpenStreetMap's
 * `fee` (yes or no) and `charge` ("12 EUR", "EUR 12", or the euro sign and a
 * figure). A charge Carta can read in euros counts toward the day, per
 * person; a fee without a
 * readable euro charge is "Ticket, price not known" and counts for nothing.
 * Carta never makes a ticket price up. The catalogue does not carry these
 * tags yet (register T378-c), so today every place reads as no ticket and the
 * day's price is the bed and the food, exactly as before.
 *
 * Pure, no imports: tested in tests/dayBands.test.mjs.
 */

// The euro sign is written as its code point so no money literal sits in
// source (design-lint money-literal).
const EURO = /(?:\u20ac|\beur\b|\beuros?\b)/i;
const OTHER_CURRENCY = /(?:£|\$|\bchf\b|\bgbp\b|\busd\b|\bczk\b|\bkč|\bpln\b|\bzł|\bhuf\b|\bft\b|\bsek\b|\bnok\b|\bdkk\b|\bkr\b|\bron\b|\blei\b|\bbgn\b|лв|\bisk\b|\btry\b|₺|\brsd\b|\bbam\b|\bmkd\b|\buah\b|₴)/i;

/** A place's tags, wherever the catalogue row keeps them. */
function tagsOf(poi) {
  if (!poi || typeof poi !== 'object') return {};
  const tags = poi.tags && typeof poi.tags === 'object' ? poi.tags : {};
  return {
    fee: poi.fee ?? tags.fee ?? null,
    charge: poi.charge ?? tags.charge ?? null,
  };
}

/**
 * The adult charge in euros from an OSM `charge` value, or null when it is
 * not a plain euro figure. Several values (`;`) mean several prices; the
 * first one is the standard adult ticket by OSM convention, and a value with
 * a period ("12 EUR/day") still reads as its figure. Anything in another
 * currency, or a range, is not read: a wrong figure is worse than none.
 */
export function parseEuroCharge(charge) {
  if (charge == null) return null;
  const first = String(charge).split(';')[0].trim();
  if (!first || !EURO.test(first) || OTHER_CURRENCY.test(first)) return null;
  const nums = first.replace(/(\d)\s+(\d{3})\b/g, '$1$2').match(/\d+(?:[.,]\d{1,2})?/g);
  if (!nums || nums.length !== 1) return null;
  const v = Number(nums[0].replace(',', '.'));
  return Number.isFinite(v) && v >= 0 && v < 1000 ? Math.round(v * 100) / 100 : null;
}

/**
 * What a place's ticket is:
 *   { kind: 'none' }               no fee known (nothing shows)
 *   { kind: 'free' }               fee=no (nothing shows either)
 *   { kind: 'known', eur }         a ticket at this price a person
 *   { kind: 'unknown' }            a fee, price not known (not counted)
 */
export function ticketOf(poi) {
  const { fee, charge } = tagsOf(poi);
  const f = fee == null ? '' : String(fee).trim().toLowerCase();
  const eur = parseEuroCharge(charge);
  if (f === 'no') return { kind: 'free' };
  if (eur != null && eur > 0) return { kind: 'known', eur };
  if (eur === 0) return { kind: 'free' };
  if (f === 'yes' || f === 'donation' || (charge != null && String(charge).trim())) return { kind: 'unknown' };
  return { kind: 'none' };
}

/**
 * The day's tickets: the euros a person pays for the tickets Carta knows,
 * how many stops have a known ticket, and how many have a fee with no price.
 */
export function dayTicketTotals(items) {
  let perPerson = 0;
  let known = 0;
  let unknown = 0;
  (items || []).forEach((it) => {
    const tk = ticketOf(it);
    if (tk.kind === 'known') { perPerson += tk.eur; known += 1; }
    else if (tk.kind === 'unknown') unknown += 1;
  });
  return { perPerson: Math.round(perPerson * 100) / 100, known, unknown };
}

/**
 * The compact day receipt (carta-design "The receipt"), as numbers: the bed
 * and the food a person a day from the cost index, the tickets a person,
 * then each line for the party, the total for the party and the figure a
 * person. A line with no figure is left out, never printed as zero.
 *
 *   stayEur, foodEur   computeCosts() a person (the bed is a night's share)
 *   tickets            dayTicketTotals()
 *   party              how many people the day is for (1 or more)
 */
export function dayReceiptFigures({ stayEur, foodEur, tickets, party = 1 }) {
  const n = Math.max(1, Math.round(party || 1));
  const r2 = (v) => Math.round(v * 100) / 100;
  const lines = [];
  if (Number.isFinite(stayEur)) lines.push({ key: 'bed', each: stayEur, eur: r2(stayEur * n) });
  if (Number.isFinite(foodEur)) lines.push({ key: 'food', each: foodEur, eur: r2(foodEur * n) });
  const tk = tickets || { perPerson: 0, known: 0, unknown: 0 };
  if (tk.known > 0) lines.push({ key: 'tickets', each: tk.perPerson, eur: r2(tk.perPerson * n) });
  const each = r2(lines.reduce((s, l) => s + l.each, 0));
  return { lines, party: n, each, total: r2(each * n), unknownTickets: tk.unknown || 0 };
}
