/**
 * cheapTips.js, the tailored "travel cheaper" advice engine.
 *
 * The knowledge base (cheapTips.json) is web-researched, 2026-verified market
 * intel: national advance-fare systems and passes, budget bus networks, city
 * cards that are/aren't worth it, free museum days, supermarket chains, fuel
 * and vignette tactics, per country, plus pan-European booking patterns with
 * concrete numbers. This module picks the tips that fit THIS trip: its
 * countries, its month, how the traveller moves, and the party size.
 */
import data from './cheapTips.json';

/** Month (1-12) from an ISO date, or null. */
function monthOf(iso) {
  const m = iso ? Number(String(iso).slice(5, 7)) : NaN;
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
}

/**
 * The tips that apply to a trip.
 * @param opts.iso2s      array of ISO2 codes of the trip's countries
 * @param opts.startDate  trip start (ISO) for month-conditioned tips
 * @param opts.transport  'flight' | 'car' | 'train' (how they travel there)
 * @param opts.groupSize  party size for partyMin-conditioned tips
 * @returns { byCountry: [{ iso2, tips: [...] }], generic: [...] }
 */
export function tipsForTrip({ iso2s = [], startDate = null, transport = null, groupSize = 1 } = {}) {
  const month = monthOf(startDate);
  const wanted = new Set(iso2s.filter(Boolean));
  const fits = (tip) => {
    const c = tip.conditions || {};
    if (c.months && month != null && !c.months.includes(month)) return false;
    if (c.transport && transport && !c.transport.includes(transport)) return false;
    if (c.partyMin && groupSize < c.partyMin) return false;
    return true;
  };
  const byCountry = [...wanted].map((iso2) => ({
    iso2,
    tips: data.tips.filter((t) => t.scope === 'country' && t.country === iso2 && fits(t)),
  })).filter((g) => g.tips.length);
  const generic = data.tips.filter((t) => t.scope === 'generic' && fits(t));
  return { byCountry, generic };
}
