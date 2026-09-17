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

/* ── Google Flights ───────────────────────────────────────────────────────
   Google publishes no deep-link parameters for flight search: the itinerary
   URLs it produces carry an opaque protobuf blob that nothing outside Google
   can build. What it does parse is its own query box, so both builders below
   type a sentence into `q` exactly as a person would, and Google reads the
   airports and the dates back out of it. The wording is therefore load
   bearing: "Flights from AMS to FCO on 2026-05-12 through 2026-05-19" is
   understood, and paraphrases of it are not reliably understood.

   The sentence is English whatever the UI language, because it is Google's
   parser reading it and not the traveller; `hl` is what makes the PAGE come
   back in their language, and `curr` is what makes the prices read in euros
   like every other price in Carta.

   Both are deliberately searches and not prices. Carta holds no live fares
   for these routes, so it hands the question to somewhere that does rather
   than printing a number of its own (see the note at the top of
   lib/countryBrief.js). ──────────────────────────────────────────────────── */

/**
 * Google Flights for one route, dated when the days are known.
 *
 * @param fromIata    three letter code they leave from
 * @param toIata      three letter code they land at
 * @param toCity      a written town, used when there is no arrival IATA
 * @param date        outbound day, YYYY-MM-DD, optional
 * @param returnDate  return day, YYYY-MM-DD, optional
 * @param lang        UI language code, for `hl`
 * @returns a URL, or null without an origin airport and somewhere to land
 */
export function googleFlightsLink({
  fromIata, toIata, toCity = '', date = '', returnDate = '', lang = 'en',
}) {
  const from = String(fromIata || '').toUpperCase();
  if (!IATA.test(from)) return null;
  // An airport code is what Google resolves unambiguously; a city name is the
  // fallback for the places Carta prices but no airport serves directly, and
  // it is good enough because the search box does the same disambiguation a
  // person typing would get.
  const to = IATA.test(toIata || '') ? String(toIata).toUpperCase() : String(toCity || '').trim();
  if (!to || to === from) return null;

  let q = `Flights from ${from} to ${to}`;
  if (ISO_DATE.test(date || '')) {
    q += ` on ${date}`;
    if (ISO_DATE.test(returnDate || '')) q += ` through ${returnDate}`;
  }
  // The party size is deliberately NOT said. " for 3 adults" is parsed on some
  // routes and silently rejected on others (AMS to FCO is a reproducible
  // rejection, BRU to SZG is not), and when Google rejects the clause it
  // throws away the WHOLE sentence: the traveller lands on a blank search
  // form with the route gone. Checked in a real browser, both ways, on one
  // route in one run. Trading a prefilled route for a party size that
  // defaults to one and is a single click to change is a bad trade.
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}${googleTail(lang)}`;
}

/**
 * Google Flights Explore: everywhere you can fly from one airport, by price.
 *
 * This is the link for a traveller who has not chosen a destination yet, which
 * is a question Carta's own catalogue answers from the other end (what a place
 * costs to stay in) and Google answers from this one (what it costs to reach).
 * They are complementary, so this sits BESIDE the catalogue rather than in
 * place of it.
 *
 * The q parameter is undocumented, so both the origin and the month were
 * checked in a real browser: "Flights from BRU in 2026-11" comes back as
 * "Brussels to anywhere" with the date range already set to that month.
 * A caller with nothing but the airport still gets a working Explore page.
 */
export function googleFlightsExploreLink({ fromIata, fromCity = '', month = '', lang = 'en' }) {
  const from = String(fromIata || '').toUpperCase();
  const origin = IATA.test(from) ? from : String(fromCity || '').trim();
  if (!origin) return null;
  let q = `Flights from ${origin}`;
  // A month prefix, YYYY-MM, when the traveller has said roughly when.
  if (/^\d{4}-\d{2}$/.test(month || '')) q += ` in ${month}`;
  return `https://www.google.com/travel/explore?q=${encodeURIComponent(q)}${googleTail(lang)}`;
}

/** The two parameters every Google travel URL takes: prices in the currency
 *  the whole app is written in, and the page in the language the traveller
 *  chose. Google ignores an unknown hl rather than erroring, so an unmapped
 *  language costs an English page, not a broken link. */
function googleTail(lang) {
  const code = /^[a-z]{2}$/i.test(lang || '') ? String(lang).toLowerCase() : 'en';
  return `&curr=EUR&hl=${code}`;
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
 * @param lang        UI language code, for the links that can be localised
 * @returns [{ key, label, url }]
 */
export function legLinks({
  from, to, mode = '', date = '', returnDate = '', adults = 1, subId = 'wizard', lang = '',
}) {
  const out = [];
  const push = (key, label, url) => { if (url) out.push({ key, label, url }); };
  const fromIata = from?.iata || from?.anchorIata || null;
  const toIata = to?.iata || to?.anchorIata || null;
  const railOk = !NO_RAIL.has(from?.iso2 || '') && !NO_RAIL.has(to?.iso2 || '');

  if (mode === 'fly') {
    // Google Flights leads, because it is where the price graph and the
    // nearby-airport search are, which is what somebody still comparing a
    // route actually needs. The two affiliate links keep their place right
    // after it: this adds a door, it does not close one.
    push('google', 'Google Flights', googleFlightsLink({
      fromIata, toIata, toCity: to?.city, date, returnDate, lang,
    }));
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

/* ── Handing over from a destination page ──────────────────────────────────
   The links above all describe a LEG: two places and a date. A reader on a
   destination page has neither an origin nor dates, so these two are searches
   rather than deep links, and they say so on the page. They exist because the
   question a good destination page ends on is "so how do I actually go", and
   the answer Carta gives everywhere else is to hand the traveller over rather
   than to pretend it sells anything.

   No partner id and no affiliate wrapper on either: an unattributed public
   URL that works is worth more than an attributed one that needs keys this
   fork may not have. ────────────────────────────────────────────────────── */

/** Skyscanner's undated "flights to" page for a city, by IATA where the
 *  catalogue has one, by name where it does not. */
export function flightSearchLink({ iata, city }) {
  if (IATA.test(iata || '')) {
    return `https://www.skyscanner.net/transport/flights-to/${iata.toLowerCase()}/`;
  }
  const slug = citySlug(city);
  return slug ? `https://www.skyscanner.net/transport/flights-to/${slug}/` : null;
}

/** Booking.com's plain search for a town, which takes a written place name. */
export function staySearchLink({ city, country }) {
  const where = [city, country].filter(Boolean).join(', ');
  if (!where) return null;
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(where)}`;
}
