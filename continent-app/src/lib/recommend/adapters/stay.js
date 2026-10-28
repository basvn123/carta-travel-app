/**
 * The stay slot (T792): the beds of the trip, for the whole party.
 *
 * Until real offers exist (roadmap 2.12) the options are the price tiers of
 * config/slots.json (hostel private room, guesthouse room, hotel), each
 * priced by the engine's own stay quote at the same stops, dates and party.
 * Carta's pick is the tier the traveller sleeps in (the Sleep answer), else
 * the tier their "what matters most" points at.
 */
import { quoteStay } from '../../price/stay.js';
import { rule } from '../../price/config.js';

// The tiers the engine prices (config/pricing.json bands.ref_stay).
const TIERS = new Set(Object.keys(rule('bands.ref_stay')));

/** The tier Carta picks: the Sleep answer, else the priority's tier. */
export function stayTierFor(ctx, row) {
  if (ctx.stayTier && TIERS.has(ctx.stayTier)) return ctx.stayTier;
  return row.byPriority?.[ctx.priority] || row.byPriority?.balance || 'home';
}

/** The beds of every stop at one tier, the party, all nights; null when a stop has no bed price. */
function bedsAt(quote, tier, destinations) {
  const req = { ...quote.request, stay: tier };
  let sum = 0;
  for (const s of quote.stopDetails) {
    if (!s.dest || !s.nights) continue;
    const q = quoteStay(s.dest, s.nights, s.arriveDate, req, destinations);
    if (!q?.accom) return null;
    sum += q.accomTotal;
  }
  return sum;
}

const qualityOf = (quote) => {
  const qs = quote.stopDetails.filter((s) => s.dest && s.nights).map((s) => s.dest.accommodation?.q);
  return qs.length && qs.every((q) => q === 'measured') ? 'measured' : 'modelled';
};

export const stay = {
  prepare(state, ctx, row) {
    return { ...state, stayTier: stayTierFor(ctx, row) };
  },
  price({ row, quote, state, ctx }) {
    if (!quote.stayCosts.some((s) => s?.accom)) return null;
    const tier = state.stayTier;
    const nights = quote.plannedNights;
    const facts = (id) => ({ tier: id, nights, places: quote.stopDetails.length });
    const destinations = ctx.data?.destinations || null;
    const ids = [...new Set([tier, ...(row.options || []).map((o) => o.id)])].filter((id) => TIERS.has(id));
    const options = ids
      .map((id) => ({
        id,
        labelKey: `tf.opt.stay.${id}`,
        facts: facts(id),
        eurGroup: id === tier ? quote.parts.beds : bedsAt(quote, id, destinations),
      }))
      .filter((o) => o.eurGroup != null);
    return {
      eurGroup: quote.parts.beds,
      pick: { id: tier, labelKey: `tf.opt.stay.${tier}`, facts: facts(tier), eurGroup: quote.parts.beds },
      options,
      because: ctx.stayTier && TIERS.has(ctx.stayTier) ? `sleep:${tier}` : `priority:${ctx.priority || 'balance'}`,
      quality: qualityOf(quote),
    };
  },
};
