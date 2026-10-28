/**
 * The flight slot (T795): there and home for the whole party, bags in.
 *
 * The card figure never waits on the network. It is the trip's own quote
 * (quoteTrip prices Google Flights' swept fare for the exact days, or a
 * live one the planner already holds), else the swept flight nearest each
 * day within the sweep's spread (sweptNear: the leg keeps its own date,
 * which the screen shows). Swept fares older than config flights
 * max_age_days are ignored (T692, T780). A fare the traveller typed
 * replaces Google Flights' price for its direction and is labelled theirs;
 * driving their own car is the engine's drive estimate. Every flight
 * carries the bag on the trip's baggage choice (T691) and the babies' lap
 * fee (T713).
 *
 * The figure is Google Flights', never Carta's: the pick's facts carry the
 * airline (for the airline mark), the times, the check time and the search
 * link, so a screen can name the source and say prices may have changed.
 *
 * optionsFor(trip) is the picker: the live day list from /api/flights (the
 * answer useLiveFlights reads), grouped cheapest, quickest and best times.
 * It is async and separate, so a card never waits for it.
 */
import { sweptNear, legCost, rankFlights, googleFlightsLink } from '../../flights/flights.js';
import { BABY_LAP_FEE_LEG } from '../../party.js';
import { rule } from '../../price/config.js';

export const SOURCE = 'google_flights';
const DEFAULT_BAG = rule('request.default_bag');
const OPTIONS_PER_GROUP = 3;

/** What one leg costs the party: fares, bags, a lap fee per baby. */
function legFor(leg, { paying, babies, bagKey }) {
  const cost = legCost(leg, { paying, bagKey });
  const lap = babies * BABY_LAP_FEE_LEG;
  return { ...cost, lap, total: cost.total + lap };
}

const legFacts = (leg, from, to, cost) => (leg ? {
  date: leg.date, airline: leg.airline || null, flightNo: leg.flightNo || null,
  dep: leg.dep || null, arr: leg.arr || null, stops: leg.stops ?? null,
  minutes: Number.isFinite(leg.min) ? leg.min : null, checked: leg.checked || null, price: leg.price ?? null,
  source: leg.source || 'swept', from, to, perSeat: cost?.perSeat ?? null, bags: cost?.bags ?? null, bagsKnown: cost?.bagsKnown ?? null,
} : null);

/** The pick's facts: both legs, the trip-level summary, the source and its link. */
function pickFacts(id, out, back, lang = 'en') {
  const legs = [out, back].filter(Boolean);
  const checked = legs.length ? Math.min(...legs.map((l) => l.checked || Infinity)) : null;
  const first = out || back;
  return {
    source: id,
    attribution: id === 'swept' || id === 'live' ? SOURCE : null,
    out, back,
    airline: first?.airline || null,
    stops: legs.length ? Math.max(...legs.map((l) => l.stops ?? 0)) : null,
    minutes: out?.minutes ?? null,
    checked: Number.isFinite(checked) ? checked : null,
    link: out && back ? googleFlightsLink(out.from, out.to, out.date, { back: back.date, lang }) : null,
  };
}

/** The swept legs nearest the trip's days, when the quote found none for the exact days. */
function nearLegs(trip, state, ctx, home) {
  const file = ctx.flights;
  const iata = trip?.gateway?.iata;
  if (!file || !iata || !trip.dates || file.from !== home) return null;
  const out = sweptNear(file, 'out', iata, trip.dates.out);
  const back = sweptNear(file, 'back', iata, trip.dates.back);
  if (!out || !back) return null;
  const party = { paying: trip.party.head, babies: trip.party.babies, bagKey: state.baggage || DEFAULT_BAG };
  return { out: { ...out, cost: legFor(out, party) }, back: { ...back, cost: legFor(back, party) }, iata };
}

export const flight = {
  price({ trip, quote, state, ctx }) {
    const { parts } = quote;
    const home = trip?.origin || ctx.origin?.iata || null;
    // Driving there in their own car: the engine's drive estimate, or their typed figure.
    if (state.transportPref === 'owncar') {
      const eurGroup = parts.drive + parts.travel;
      if (!(eurGroup > 0)) return null;
      return {
        eurGroup,
        pick: { id: parts.travel > 0 ? 'yours' : 'drive', labelKey: `tf.opt.flight.${parts.travel > 0 ? 'yours' : 'drive'}`, facts: { source: parts.travel > 0 ? 'yours' : 'drive', km: quote.driveLegs?.out?.road_km ?? null }, eurGroup },
        options: null,
        because: 'reach:overland',
        quality: parts.travel > 0 ? 'measured' : 'modelled',
      };
    }
    const cf = quote.cartaFlight;
    const typed = parts.travel > 0;
    const quoted = cf && (cf.out?.cost || cf.back?.cost);
    const bothQuoted = cf?.out?.cost && cf?.back?.cost;
    const mk = (id, out, back, eurGroup, quality) => ({
      eurGroup,
      pick: { id, labelKey: `tf.opt.flight.${id}`, facts: pickFacts(id, out, back, ctx.lang), eurGroup },
      options: null,
      because: `flightRank:${state.flightRank || 'price'}`,
      quality,
    });
    if (typed && !quoted) return mk('yours', null, null, parts.travel, 'measured');
    if (bothQuoted || (typed && quoted)) {
      const out = legFacts(cf.out, cf.home, cf.inAirport, cf.out?.cost);
      const back = legFacts(cf.back, cf.outAirport, cf.home, cf.back?.cost);
      const live = [cf.out, cf.back].some((l) => l?.source === 'live');
      return mk(typed ? 'yours' : live ? 'live' : 'swept', out, back, parts.flights + parts.travel, live ? 'live' : 'measured');
    }
    // No fare for the exact days: the nearest swept days (each keeps its date).
    const near = nearLegs(trip, state, ctx, home);
    if (!near) return null;
    const out = legFacts(near.out, home, near.iata, near.out.cost);
    const back = legFacts(near.back, near.iata, home, near.back.cost);
    return mk('swept', out, back, near.out.cost.total + near.back.cost.total, 'measured');
  },
};

/** The live day list, the answer /api/flights gives ({ checked, link, flights }), or null. */
export function fetchLiveDay(o, d, date) {
  return fetch(`/api/flights?o=${o}&d=${d}&date=${date}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

const quick = (f) => (Number.isFinite(f.min) ? f.min : Infinity);
const GROUPS = {
  cheapest: (fs) => [...fs].sort((a, b) => a.price - b.price),
  quickest: (fs) => [...fs].sort((a, b) => (a.stops - b.stops) || (quick(a) - quick(b)) || (a.price - b.price)),
  times: (fs) => rankFlights(fs, 'comfort'),
};

/**
 * The flight picker's options for one trip: per direction, the live
 * flights of the day grouped cheapest, quickest and best times, each with
 * its own price for the party, the slot's resulting price a person (`eur`)
 * and its `delta` against the current pick, the airline code, the times,
 * the stops, the duration and the check time. Null when the trip does not
 * fly or the day could not be searched (the card keeps its figure).
 *
 * opts: { fetchDay (o, d, date) -> answer, the live search by default }
 */
export async function optionsFor(trip, { fetchDay = fetchLiveDay, lang = 'en' } = {}) {
  const slot = trip?.slots?.find((s) => s.id === 'flight');
  const iata = trip?.gateway?.iata;
  if (!slot || !iata || !trip.origin || !trip.dates) return null;
  const head = Math.max(1, trip.party.head);
  const state = trip.state || trip.base?.state || null;
  const party = { paying: head, babies: trip.party.babies, bagKey: state?.baggage || DEFAULT_BAG };
  const facts = slot.pick?.facts || {};
  const dirs = {
    out: { o: trip.origin, d: iata, date: trip.dates.out, current: facts.out },
    back: { o: iata, d: trip.origin, date: trip.dates.back, current: facts.back },
  };
  const answers = await Promise.all(Object.values(dirs).map((q) => fetchDay(q.o, q.d, q.date)));
  if (answers.every((a) => !a)) return null;
  const out = { source: SOURCE };
  Object.keys(dirs).forEach((dir, i) => {
    const q = dirs[dir];
    const a = answers[i];
    if (!a || !Array.isArray(a.flights)) { out[dir] = null; return; }
    const checked = Date.parse(a.checked) || null;
    const curGroup = q.current?.perSeat != null ? q.current.perSeat * party.paying + party.babies * BABY_LAP_FEE_LEG : null;
    const priced = a.flights.map((f) => {
      const leg = { ...f, date: q.date, checked, source: 'live' };
      const cost = legFor(leg, party);
      const eurGroup = slot.eurGroup != null && curGroup != null ? slot.eurGroup - curGroup + cost.total : null;
      const eur = eurGroup != null ? Math.round(eurGroup / head) : null;
      return {
        id: `${dir}:${f.flightNo || `${f.airline}-${f.dep}`}`,
        dir,
        labelKey: 'tf.opt.flight.live',
        facts: { ...legFacts(leg, q.o, q.d, cost), via: f.via || null },
        legGroup: cost.total,
        eurGroup,
        eur,
        delta: eur != null && slot.eur != null ? eur - slot.eur : null,
      };
    });
    const byId = new Map(priced.map((p, k) => [a.flights[k], p]));
    out[dir] = {
      checked,
      link: a.link || googleFlightsLink(q.o, q.d, q.date, { lang }),
      groups: Object.fromEntries(Object.entries(GROUPS).map(([g, order]) => [
        g, order(a.flights).slice(0, OPTIONS_PER_GROUP).map((f) => ({ ...byId.get(f), group: g, labelKey: `tf.opt.flight.${g}` })),
      ])),
    };
  });
  return out;
}

/** The party's figure for one direction of the current pick (optionsFor's own rule). */
function legGroupOf(facts, party) {
  return facts?.perSeat != null ? facts.perSeat * party.paying + party.babies * BABY_LAP_FEE_LEG : null;
}

/**
 * The flight slot with one live flight taken for its direction (TF2, T800):
 * the picker's option (optionsFor) replaces that leg, the other leg stays.
 * The slot's figure moves by the difference between the two legs, the same
 * rule optionsFor prices an option with, so out then back in any order lands
 * on the same figure. The pick becomes Google Flights' live flight, with its
 * facts (airline, times, check time, the fare per seat) for the hand-off.
 * An option without a figure leaves the slot as it was.
 */
export function chooseFlight(trip, option) {
  const slot = trip?.slots?.find((s) => s.id === 'flight');
  if (!slot || !option?.facts || option.legGroup == null || slot.eurGroup == null) return slot;
  const head = Math.max(1, trip.party.head);
  const party = { paying: head, babies: trip.party.babies || 0 };
  const facts = slot.pick?.facts || {};
  const cur = legGroupOf(facts[option.dir], party);
  if (cur == null) return slot;
  const eurGroup = Math.round(slot.eurGroup - cur + option.legGroup);
  const eur = Math.round(eurGroup / head);
  const legs = { out: facts.out, back: facts.back, [option.dir]: option.facts };
  const next = {
    ...facts,
    ...pickFacts('live', legs.out, legs.back),
    link: facts.link || null,
  };
  return {
    ...slot,
    eur,
    eurGroup,
    pick: slot.owner === 'carta' ? { id: 'live', labelKey: 'tf.opt.flight.live', facts: next, eurGroup } : null,
    quality: 'live',
  };
}
