/**
 * The food slot (T792): eating and drinking at the traveller's Lifestyle,
 * every stop, every night, the whole party (the food half of the engine's
 * "days"; local fares are the getting-around slot's).
 *
 * The options are three Lifestyle presets of config/pricing.json (cook
 * some, a mix, eat out), each priced by the engine's own stay quote with
 * that Lifestyle. Carta's pick is the Lifestyle the traveller has set.
 */
import { quoteStay } from '../../price/stay.js';
import { PROFILES } from '../../lifestyleProfiles.js';

/** Food and drink of one stop's quote for the party, or null without a food price. */
const foodOf = (sc) => (sc?.day?.foodEur != null ? sc.day.foodEur * sc.nights * sc.seats : null);

function foodAt(quote, lifestyle, destinations) {
  const req = { ...quote.request, lifestyle };
  let sum = 0;
  for (const s of quote.stopDetails) {
    if (!s.dest || !s.nights) continue;
    const f = foodOf(quoteStay(s.dest, s.nights, s.arriveDate, req, destinations));
    if (f == null) return null;
    sum += f;
  }
  return sum;
}

const sameLifestyle = (a, b) => !!a && !!b && Object.keys(b).every((k) => a[k] === b[k]);

export const food = {
  price({ row, quote, ctx }) {
    const per = quote.stayCosts.filter((s) => s && s.nights);
    if (!per.length || per.some((s) => foodOf(s) == null)) return null;
    const eurGroup = per.reduce((n, s) => n + foodOf(s), 0);
    const mine = quote.request.lifestyle;
    const destinations = ctx.data?.destinations || null;
    const facts = (id) => ({ level: id, nights: quote.plannedNights });
    const options = (row.options || [])
      .filter((o) => PROFILES[o.lifestyle])
      .map((o) => {
        const preset = PROFILES[o.lifestyle];
        const own = sameLifestyle(mine, preset);
        return {
          id: o.id,
          labelKey: `tf.opt.food.${o.id}`,
          facts: facts(o.id),
          eurGroup: own ? eurGroup : foodAt(quote, preset, destinations),
        };
      })
      .filter((o) => o.eurGroup != null);
    const pickId = (row.options || []).find((o) => sameLifestyle(mine, PROFILES[o.lifestyle]))?.id || 'custom';
    // Measured where every stop's prices are the town's own, not its region's.
    const towns = quote.stopDetails.filter((s) => s.dest && s.nights);
    return {
      eurGroup,
      pick: { id: pickId, labelKey: `tf.opt.food.${pickId}`, facts: facts(pickId), eurGroup },
      options,
      because: `lifestyle:${pickId}`,
      quality: towns.every((s) => s.dest.costs?.level === 'city') ? 'measured' : 'modelled',
    };
  },
};
