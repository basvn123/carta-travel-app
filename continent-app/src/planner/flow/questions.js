/**
 * questions.js, the planner's one-question screens as data (T653).
 *
 * Each entry is what one screen asks: its i18n keys, whether it takes one
 * answer or several, the options with an icon (resolved by name in the UI so
 * this file stays plain JS) or a photo hint (a TRIP_TYPES key the UI turns
 * into a real catalogue photograph), and how an answer is written into the
 * trip settings. Screens with their own controls (who, sleep, when, from)
 * carry `custom: true` and render a component instead of options.
 */
import { RHYTHM, LIKES } from './tripSettings.js';

const opt = (value, icon, extra = {}) => ({ value, icon, labelKey: null, ...extra });

export const QUESTIONS = {
  tell: { titleKey: 'pf.q.tell', helpKey: 'pf.q.tellHelp', custom: true, skippable: true },
  booked: {
    titleKey: 'pf.q.booked', helpKey: 'pf.q.bookedHelp', multi: true, none: 'nothing',
    options: [
      opt('nothing', 'SparkIcon', { labelKey: 'pf.o.nothing' }),
      opt('flights', 'PlaneIcon', { labelKey: 'pf.o.flights' }),
      opt('stays', 'BedIcon', { labelKey: 'pf.o.stays' }),
      opt('car', 'CarIcon', { labelKey: 'pf.o.car' }),
      opt('tickets', 'TicketIcon', { labelKey: 'pf.o.tickets' }),
    ],
    read: (s) => {
      const on = Object.entries(s.booked).filter(([, v]) => v).map(([k]) => k);
      return on.length ? on : ['nothing'];
    },
    write: (s, values) => {
      const set = new Set(values.filter((v) => v !== 'nothing'));
      return { booked: { flights: set.has('flights'), stays: set.has('stays'), car: set.has('car'), tickets: set.has('tickets') } };
    },
  },
  who: { titleKey: 'pf.q.who', custom: true },
  sleep: { titleKey: 'pf.q.sleep', helpKey: 'pf.q.sleepHelp', custom: true },
  priority: {
    titleKey: 'pf.q.priority', helpKey: 'pf.q.priorityHelp',
    options: [
      opt('price', 'PiggyIcon', { labelKey: 'pf.o.price', subKey: 'pf.o.priceSub' }),
      opt('balance', 'ScaleIcon', { labelKey: 'pf.o.balance', subKey: 'pf.o.balanceSub' }),
      opt('comfort', 'DiamondIcon', { labelKey: 'pf.o.comfort', subKey: 'pf.o.comfortSub' }),
    ],
    read: (s) => [s.priority],
    write: (s, [v]) => ({ priority: v }),
  },
  when: { titleKey: 'pf.q.when', custom: true },
  from: { titleKey: 'pf.q.from', helpKey: 'pf.q.fromHelp', custom: true },

  // ---- Help me choose ----
  'g:shape': {
    titleKey: 'pf.q.shape',
    options: [
      opt('one', 'MapPinIcon', { labelKey: 'pf.o.shapeOne' }),
      opt('towns', 'RouteIcon', { labelKey: 'pf.o.shapeTowns' }),
      opt('road', 'CarIcon', { labelKey: 'pf.o.shapeRoad' }),
      opt('countries', 'GlobeIcon', { labelKey: 'pf.o.shapeCountries' }),
      opt('oneway', 'RoadIcon', { labelKey: 'pf.o.shapeOneway' }),
    ],
    read: (s) => (s.guide.shape ? [s.guide.shape] : []),
    write: (s, [v]) => ({ guide: { ...s.guide, shape: v } }),
  },
  'g:likes': {
    titleKey: 'pf.q.likes', helpKey: 'pf.q.likesHelp', multi: true, max: 3, photos: true,
    options: LIKES.map((k) => opt(k, null, { labelKey: `pf.like.${k}`, photo: k })),
    read: (s) => s.guide.likes,
    write: (s, values) => ({ guide: { ...s.guide, likes: values.slice(0, 3) } }),
  },
  'g:weather': {
    titleKey: 'pf.q.weather',
    options: [
      opt('warm', 'SunIcon', { labelKey: 'pf.o.warm' }),
      opt('mild', 'PartSunIcon', { labelKey: 'pf.o.mild' }),
      opt('snow', 'SnowIcon', { labelKey: 'pf.o.snow' }),
      opt('any', 'CloudIcon', { labelKey: 'pf.o.anyWeather' }),
    ],
    read: (s) => (s.guide.weather ? [s.guide.weather] : []),
    write: (s, [v]) => ({ guide: { ...s.guide, weather: v } }),
  },
  'g:reach': {
    titleKey: 'pf.q.reach',
    options: [
      opt('short', 'PlaneIcon', { labelKey: 'pf.o.reachShort', subKey: 'pf.o.reachShortSub' }),
      opt('any', 'GlobeIcon', { labelKey: 'pf.o.reachAny' }),
      opt('overland', 'TrainIcon', { labelKey: 'pf.o.reachOverland', subKey: 'pf.o.reachOverlandSub' }),
    ],
    read: (s) => (s.guide.reach ? [s.guide.reach] : []),
    write: (s, [v]) => ({ guide: { ...s.guide, reach: v } }),
  },
  'g:avoid': {
    titleKey: 'pf.q.avoid', multi: true, none: 'none', skippable: true,
    options: [
      opt('none', 'CheckIcon', { labelKey: 'pf.o.avoidNone' }),
      opt('crowds', 'FriendsIcon', { labelKey: 'pf.o.avoidCrowds' }),
      opt('transfers', 'ClockIcon', { labelKey: 'pf.o.avoidTransfers' }),
      opt('car', 'CarIcon', { labelKey: 'pf.o.avoidCar' }),
      opt('heat', 'SunIcon', { labelKey: 'pf.o.avoidHeat' }),
    ],
    read: (s) => (s.guide.avoid.length ? s.guide.avoid : ['none']),
    write: (s, values) => ({ guide: { ...s.guide, avoid: values.filter((v) => v !== 'none') } }),
  },
  'g:budget': { titleKey: 'pf.q.budget', helpKey: 'pf.q.budgetHelp', custom: true, skippable: true },

  // ---- The days ----
  daysAsk: {
    titleKey: 'pf.q.daysAsk', helpKey: 'pf.q.daysAskHelp',
    options: [
      opt('yes', 'ListDayIcon', { labelKey: 'pf.o.daysYes' }),
      opt('no', 'CheckIcon', { labelKey: 'pf.o.daysNo' }),
    ],
  },
  'r:mornings': {
    titleKey: 'pf.q.mornings',
    options: [
      opt('early', 'SunIcon', { labelKey: 'pf.o.early' }),
      opt('slow', 'CoffeeIcon', { labelKey: 'pf.o.slow' }),
      opt('onthego', 'ShoeIcon', { labelKey: 'pf.o.onthego' }),
    ],
    key: 'mornings',
  },
  'r:pace': {
    titleKey: 'pf.q.pace',
    options: [
      opt('packed', 'BoltIcon', { labelKey: 'pf.o.packed' }),
      opt('balanced', 'ScaleIcon', { labelKey: 'pf.o.balanced' }),
      opt('slow', 'LeafIcon', { labelKey: 'pf.o.slowPace' }),
    ],
    key: 'pace',
  },
  'r:detail': {
    titleKey: 'pf.q.detail',
    options: [
      opt('hour', 'ClockIcon', { labelKey: 'pf.o.hour' }),
      opt('parts', 'ListDayIcon', { labelKey: 'pf.o.parts' }),
      opt('list', 'CompassIcon', { labelKey: 'pf.o.list' }),
    ],
    key: 'detail',
  },
  'r:goal': {
    titleKey: 'pf.q.goal',
    options: [
      opt('culture', 'MuseumIcon', { labelKey: 'pf.o.culture' }),
      opt('relax', 'PalmIcon', { labelKey: 'pf.o.relax' }),
      opt('outdoors', 'MountainIcon', { labelKey: 'pf.o.outdoors' }),
      opt('food', 'DiningIcon', { labelKey: 'pf.o.food' }),
    ],
    key: 'goal',
  },
  'r:food': {
    titleKey: 'pf.q.food',
    options: [
      opt('street', 'ShoeIcon', { labelKey: 'pf.o.street' }),
      opt('local', 'DiningIcon', { labelKey: 'pf.o.local' }),
      opt('fine', 'StarIcon', { labelKey: 'pf.o.fine' }),
      opt('cook', 'HomeIcon', { labelKey: 'pf.o.cook' }),
    ],
    key: 'food',
  },
  'r:around': {
    titleKey: 'pf.q.around',
    options: [
      opt('walk', 'BootIcon', { labelKey: 'pf.o.walk' }),
      opt('transit', 'BusIcon', { labelKey: 'pf.o.transit' }),
      opt('taxi', 'CarIcon', { labelKey: 'pf.o.taxi' }),
      opt('car', 'RoadIcon', { labelKey: 'pf.o.ownCar' }),
    ],
    key: 'around',
  },
  daysHow: {
    titleKey: 'pf.q.daysHow',
    options: [
      opt('carta', 'SparkIcon', { labelKey: 'pf.o.cartaPlans', subKey: 'pf.o.cartaPlansSub' }),
      opt('self', 'PencilIcon', { labelKey: 'pf.o.selfPlans', subKey: 'pf.o.selfPlansSub' }),
    ],
  },
};

// The rhythm screens all read and write one field of settings.rhythm.
for (const [id, q] of Object.entries(QUESTIONS)) {
  if (!q.key) continue;
  const field = q.key;
  q.read = (s) => (s.rhythm[field] ? [s.rhythm[field]] : []);
  q.write = (s, [v]) => ({ rhythm: { ...s.rhythm, [field]: v } });
  if (!RHYTHM[field]) throw new Error(`questions.js: ${id} names unknown rhythm field ${field}`);
}

/**
 * The next selection after a tap, for multi-pick questions with a "none"
 * option: picking none clears the rest, picking anything clears none, and
 * `max` caps the count (the oldest pick drops out).
 */
export function toggleValue(q, current, value) {
  if (!q.multi) return [value];
  if (q.none && value === q.none) return [q.none];
  const rest = current.filter((v) => v !== q.none);
  const next = rest.includes(value) ? rest.filter((v) => v !== value) : [...rest, value];
  const capped = q.max && next.length > q.max ? next.slice(next.length - q.max) : next;
  return capped.length ? capped : (q.none ? [q.none] : []);
}
