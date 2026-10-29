/**
 * The getting-around slot (T792): everything between landing and flying
 * home, for the whole party: the airport transfers, the hops between
 * stops, a hire car with its vignettes, and local fares where a place has
 * one (T714).
 *
 * The options are the planner's transport choices of config/slots.json
 * (public transport, a hire car), each priced by quoting the same trip
 * again with that choice. A traveller who avoids a car is not offered one;
 * one driving their own car has nothing to swap.
 */
import { quoteTrip } from '../../price/trip.js';

/** Local fares the days carry (the transport line of each stop's day). */
function localFares(quote) {
  let sum = 0;
  quote.stayCosts.forEach((sc) => {
    const l = sc?.day?.lines?.find((x) => x.key === 'transport' && x.status === 'included');
    if (l?.eur) sum += l.eur * sc.nights * sc.seats;
  });
  return sum;
}

/** The party's getting around in one quote. */
export const localOf = (q) => q.parts.transfers + q.parts.between + q.parts.car + localFares(q);

const idOf = (pref) => (pref === 'car' ? 'car' : pref === 'owncar' ? 'owncar' : 'public');

export const local = {
  price({ row, quote, state, ctx }) {
    const eurGroup = localOf(quote);
    const current = idOf(state.transportPref);
    const facts = (id, q) => ({
      mode: id,
      hops: q.legs.filter((l) => l && !l.no_road).length,
      days: q.plannedNights,
    });
    let options = null;
    if (current !== 'owncar') {
      options = (row.options || [])
        .filter((o) => !(ctx.noCar && o.id === 'car'))
        .map((o) => {
          if (o.id === current) return { id: o.id, labelKey: `tf.opt.local.${o.id}`, facts: facts(o.id, quote), eurGroup };
          const q = quoteTrip({ ...state, transportPref: o.transport }, { data: ctx.data, countryInsights: ctx.countryInsights });
          return { id: o.id, labelKey: `tf.opt.local.${o.id}`, facts: facts(o.id, q), eurGroup: localOf(q) };
        });
    }
    return {
      eurGroup,
      pick: { id: current, labelKey: `tf.opt.local.${current}`, facts: facts(current, quote), eurGroup },
      options,
      because: `transport:${state.transportPref || 'auto'}`,
      quality: localFares(quote) > 0 ? 'measured' : 'modelled',
    };
  },
};
