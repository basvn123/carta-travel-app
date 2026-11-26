/**
 * askSeed.js, Ask Viantra's PlanSeed (G12 plan rethink, lane L3, S12). Apart
 * from seedWriters.js because it carries the trip parser, which only the
 * Ask panel (already its own chunk) needs. Node tests: tests/planSeedWriters.test.mjs.
 */
import { makeSeed } from './seed.js';
import { parseTrip } from './parseTrip.js';

/**
 * Ask Viantra's "Plan this": the route Ask found plus what the question said,
 * read by the planner's own parser (parseTrip), so there is one reader of a
 * sentence: the dates or month, the party and the budget reach the trip.
 *   route: { stops: [{ dest, nights }], transport }
 */
export function askPlanSeed(route, question = '', { lang = 'en', today } = {}) {
  const f = parseTrip(String(question || ''), { lang, today }).fields;
  const b = f.budget?.value;
  const budget = b && b.eur > 0 ? { eur: b.eur, kind: b.unit === 'day' ? 'day' : 'total', per: b.per === 'group' ? 'group' : 'person' } : null;
  const pins = ['places', ...(f.when ? ['when'] : []), ...(f.party ? ['party'] : []), ...(budget ? ['budget'] : [])];
  const seed = makeSeed({
    source: 'ask',
    label: '',
    stops: route?.stops || [],
    transport: route?.transport === 'car' ? 'car' : 'public',
    when: f.when?.value || null,
    party: f.party?.value || null,
    budget,
    pins,
  });
  return seed.stops.length ? seed : null;
}
