/**
 * transportLinks.js, where Carta hands the traveller over.
 *
 * Carta no longer decides how anyone gets to Europe or across it. It knows
 * where the trip goes, on which days, and in what order; the fares, the seats
 * and the tickets live with the people who sell them. So every leg of a plan
 * carries a set of deep links that arrive at the other site with the route and
 * the date already filled in, and the traveller types back what they actually
 * paid (see the "what you paid" fields in the wizard's transport step).
 *
 * Four destinations, each because it is the best answer to a different leg:
 *
 *   Skyscanner   flights. The day-view depth lands on the list of that day's
 *                flights rather than a search form. With a media partner id
 *                configured it goes through the referrals endpoint (which is
 *                also what makes the click attributable); without one it falls
 *                back to the plain public route URL, so a fork with no keys
 *                still gets working links.
 *   Trainline    European rail and coach. Its booking API keys off proprietary
 *                station URNs that only a backend can resolve, so this links
 *                to the public route page instead, which takes plain city
 *                slugs and carries the route but not the date. Trainline 404s
 *                on a route it does not publish, so it is only offered where
 *                rail is plausible.
 *   Rome2rio     everything else, and the honest answer for any leg nobody is
 *                sure about: it takes plain place names and answers with every
 *                mode, including the ones no single operator sells.
 *   Google Maps  driving, and local transit for a short hop.
 *
 * Omio rides along through lib/omio.js when a tracking link is configured.
 *
 * Nothing here fetches. Every function is a pure string builder, so the links
 * can be checked under plain node by scripts/verify_transport_links.mjs.
 */
import { buildOmioLink, omioSlug } from './omio.js';
import { buildAviasalesLink } from './affiliate.js';

/** Skyscanner's impact.com media partner id. Empty when unconfigured, which
 *  drops the referrals endpoint in favour of the plain public URL. */
const SKY_PARTNER = (import.meta.env?.VITE_SKYSCANNER_PARTNER_ID || '').trim();

/** A city as a URL slug: lowercase ASCII with hyphens, one rule for every
 *  route URL Carta builds. It is lib/omio.js's slug because the two want the
 *  same thing and two fold tables would drift apart on the first odd letter
 *  (an l-stroke, an o-slash) that NFD leaves standing. */
export const citySlug = omioSlug;

/** Rome2rio spells places in Title-Case-With-Hyphens, and is forgiving about
 *  the rest, so the name goes across close to how it is written. */
function r2rName(name) {
  if (!name) return null;
  const s = String(name).replace(/\([^)]*\)/g, ' ').trim();
  if (!s) return null;
  return encodeURIComponent(s.replace(/\s+/g, '-'));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IATA = /^[A-Za-z]{3}$/;

/**
 * The Skyscanner link for one flight.
 *
 * @param originIata  three letter code the traveller leaves from
 * @param destIata    three letter code they land at
 * @param date        outbound day, YYYY-MM-DD
 * @param returnDate  return day, or '' for a one way
 * @returns a URL, or null when the route or the date is unusable
 */
export function skyscannerLink({
  originIata, destIata, date, returnDate = '', adults = 1, currency = 'EUR', locale = '', subId = '',
}) {
  if (!IATA.test(originIata || '') || !IATA.test(destIata || '') || !ISO_DATE.test(date || '')) return null;
  const from = originIata.toLowerCase();
  const to = destIata.toLowerCase();
  if (SKY_PARTNER) {
    const q = new URLSearchParams({
      origin: from,
      destination: to,
      outboundDate: date,
      mediaPartnerId: SKY_PARTNER,
      currency,
      adults: String(Math.max(1, Math.min(8, adults | 0))),
    });
    if (ISO_DATE.test(returnDate || '')) q.set('inboundDate', returnDate);
    if (locale) q.set('locale', locale);
    if (subId) q.set('subId', String(subId).toLowerCase().replace(/[^a-z0-9_]/g, ''));
    return `https://www.skyscanner.net/g/referrals/v1/flights/day-view/?${q}`;
  }
  // The public route URL wants YYMMDD and only draws a return when it has both.
  const ymd = (d) => d.replaceAll('-', '').slice(2);
  const back = ISO_DATE.test(returnDate || '') ? `${ymd(returnDate)}/` : '';
  return `https://www.skyscanner.net/transport/flights/${from}/${to}/${ymd(date)}/${back}`
    + `?adultsv2=${Math.max(1, Math.min(8, adults | 0))}&cabinclass=economy&rtn=${back ? 1 : 0}`;
}

/** The Trainline route page for a rail (or coach) leg, or null. Carries the
 *  route, not the date: Trainline's dated results need station URNs. */
export function trainlineLink({ fromCity, toCity, mode = 'train' }) {
  const a = citySlug(fromCity);
  const b = citySlug(toCity);
  if (!a || !b || a === b) return null;
  const path = mode === 'bus' ? 'buses' : 'train-times';
  return `https://www.thetrainline.com/${path}/${a}-to-${b}`;
}

/** Rome2rio, which answers for every mode at once and takes plain names. */
export function rome2rioLink({ from, to }) {
  const a = r2rName(from);
  const b = r2rName(to);
  if (!a || !b || a === b) return null;
  return `https://www.rome2rio.com/s/${a}/${b}`;
}

/** A point as Google Maps wants it: coordinates when we hold them (they always
 *  resolve), the written name when we do not. */
function mapsPoint(p) {
  if (p?.lat != null && p?.lon != null) return `${p.lat},${p.lon}`;
  const name = [p?.city, p?.country].filter(Boolean).join(', ');
  return name ? encodeURIComponent(name) : null;
}

/** Google Maps directions for a leg. `mode` is 'car' or 'transit'. */
export function googleMapsLink({ from, to, mode = 'car' }) {
  const a = mapsPoint(from);
  const b = mapsPoint(to);
  if (!a || !b) return null;
  const travel = mode === 'transit' ? 'transit' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&origin=${a}&destination=${b}&travelmode=${travel}`;
}

// Countries with no rail worth linking to, or none Trainline sells: a link
// that 404s is worse than no link. Iceland has no passenger railway at all;
// Malta and Cyprus have none either.
const NO_RAIL = new Set(['IS', 'MT', 'CY', 'AD', 'LI', 'MC', 'SM', 'FO']);

/**
 * Every link worth offering for one leg, best answer first.
 *
 * @param from  { city, country, iso2, lat, lon, iata }
 * @param to    the same shape
 * @param mode  'fly' | 'train' | 'bus' | 'car' | 'ferry' | '' (unsure)
 * @param date        the day of this leg, YYYY-MM-DD
 * @param returnDate  only for a there-and-back flight
 * @returns [{ key, label, url }]
 */
export function legLinks({
  from, to, mode = '', date = '', returnDate = '', adults = 1, subId = 'wizard',
}) {
  const out = [];
  const push = (key, label, url) => { if (url) out.push({ key, label, url }); };
  const fromIata = from?.iata || from?.anchorIata || null;
  const toIata = to?.iata || to?.anchorIata || null;
  const railOk = !NO_RAIL.has(from?.iso2 || '') && !NO_RAIL.has(to?.iso2 || '');

  if (mode === 'fly') {
    push('skyscanner', 'Skyscanner', skyscannerLink({
      originIata: fromIata, destIata: toIata, date, returnDate, adults, subId,
    }));
    push('aviasales', 'Aviasales', buildAviasalesLink({
      origin: fromIata, destIata: toIata, departDate: date, returnDate, adults: 1, subId,
    }));
  }
  if (mode === 'train' || mode === 'bus' || (!mode && railOk)) {
    if (railOk) push('trainline', 'Trainline', trainlineLink({ fromCity: from?.city, toCity: to?.city, mode }));
    push('omio', 'Omio', buildOmioLink({
      fromCity: from?.city, toCity: to?.city, mode: mode === 'bus' ? 'bus' : 'train', subId,
    }));
  }
  if (mode === 'ferry') {
    push('omio', 'Omio', buildOmioLink({ fromCity: from?.city, toCity: to?.city, mode: null, subId }));
  }
  if (mode === 'car') {
    push('gmaps', 'Google Maps', googleMapsLink({ from, to, mode: 'car' }));
  }
  const r2r = rome2rioLink({ from: from?.city || from?.name, to: to?.city || to?.name });
  const transit = mode !== 'car' ? googleMapsLink({ from, to, mode: 'transit' }) : null;
  // Rome2rio answers for every mode at once, so it is on every leg. With no
  // mode chosen yet it goes FIRST: "I don't know how to get there" is exactly
  // the question it exists to answer.
  if (!mode && r2r) return [{ key: 'rome2rio', label: 'Rome2rio', url: r2r }, ...out,
    ...(transit ? [{ key: 'gmaps', label: 'Google Maps', url: transit }] : [])];
  push('rome2rio', 'Rome2rio', r2r);
  push('gmaps', 'Google Maps', transit);
  return out;
}

/** The five ways a person moves between two places, in the order the wizard
 *  offers them. `key` matches the planner's own leg modes, so what is picked
 *  here survives into the trip. */
export const TRAVEL_MODES = ['fly', 'train', 'bus', 'car', 'ferry'];

/** i18n keys for those five, one place so the words never drift apart. */
export const TRAVEL_MODE_LABEL = {
  fly: 'trip.modeFly',
  train: 'trip.modeTrain',
  bus: 'trip.modeBus',
  car: 'trip.modeCar',
  ferry: 'trip.modeFerry',
};

/**
 * The English word for a way of travelling, for the surfaces that are written
 * in English whatever the UI language: the PDF, the calendar file and the
 * share text. `null` and unknown values read as a flight, which is what every
 * trip saved before the wizard asked the question actually meant.
 */
export const TRAVEL_MODE_WORD = {
  fly: 'Flight', train: 'Train', bus: 'Coach', car: 'Car', ferry: 'Ferry',
};

/** "Train, Trenitalia" for an export line, or "Flight" on its own. */
export function ownTravelWord(flight) {
  const word = TRAVEL_MODE_WORD[flight?.mode] || TRAVEL_MODE_WORD.fly;
  const who = (flight?.airline || '').trim();
  return who ? `${word}, ${who}` : word;
}
