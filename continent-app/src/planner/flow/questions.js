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
  tell: { titleKey: 'pf.q.tell', custom: true, skippable: true },
  booked: {
    titleKey: 'pf.q.booked', multi: true, none: 'nothing',
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
  sleep: { titleKey: 'pf.q.sleep', custom: true },
  // T862: where to sleep alone (Tell Carta's stay chip); it answers sleep.
  stay: { titleKey: 'pf.q.stay', custom: true },
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
  from: { titleKey: 'pf.q.from', custom: true },
  // T860: the way there, then (when it may fly) the airports in reach.
  way: { titleKey: 'pf.q.way', custom: true },
  airports: { titleKey: 'pf.q.airports', custom: true },
  nowWhere: { titleKey: 'pf.q.nowWhere', helpKey: 'pf.q.nowWhereHelp', custom: true },
  nowUntil: { titleKey: 'pf.q.nowUntil', helpKey: 'pf.q.nowUntilHelp', custom: true },

  // ---- Help me choose ----
  // How they like to travel, the persona (owner, plan flow walk 2026-10-30):
  // the first help-me-choose question. Its own screen (PersonaScreen) draws
  // each as a line icon, its name and one statement, the whole persona one
  // tap away; the trip finder weighs places by it (lib/recommend/persona.js).
  'g:persona': {
    titleKey: 'pf.q.persona', custom: true,
    options: [
      opt('cities', 'SkylineIcon'), opt('hubtrips', 'RouteIcon'), opt('outside', 'TownIcon'),
      opt('towns', 'VillageIcon'), opt('coast', 'BeachIcon'), opt('nature', 'MountainIcon'),
      opt('hidden', 'CompassIcon'), opt('slow', 'CoffeeIcon'), opt('lively', 'MusicIcon'), opt('mix', 'SparkIcon'),
    ].map((o) => ({ ...o, labelKey: `pf.persona.${o.value}`, subKey: `pf.persona.${o.value}Sub` })),
    read: (s) => (s.guide.persona ? [s.guide.persona] : []),
    write: (s, [v]) => ({ guide: { ...s.guide, persona: v } }),
  },
  // T753: as many shapes as fit, or no preference.
  'g:shape': {
    titleKey: 'pf.q.shape', multi: true, none: 'any',
    options: [
      opt('one', 'MapPinIcon', { labelKey: 'pf.o.shapeOne' }),
      opt('towns', 'RouteIcon', { labelKey: 'pf.o.shapeTowns' }),
      opt('road', 'CarIcon', { labelKey: 'pf.o.shapeRoad' }),
      opt('countries', 'GlobeIcon', { labelKey: 'pf.o.shapeCountries' }),
      // 'oneway' left the list (owner, plan flow walk 2026-10-30): it read as
      // "one place" and the finder only built it as towns (config
      // recommend.json fallbackShapes); a trip saved with it still loads.
      opt('any', 'SparkIcon', { labelKey: 'pf.o.shapeAny' }),
    ],
    read: (s) => (s.guide.shapes.length ? s.guide.shapes : ['any']),
    write: (s, values) => {
      const shapes = values.filter((v) => v !== 'any');
      return { guide: { ...s.guide, shapes, shape: shapes.length === 1 ? shapes[0] : '' } };
    },
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
    // T874: with Fly as the way there, "No flying" is not offered again.
    offered: (s, v) => !(v === 'overland' && s.way === 'plane'),
    read: (s) => (s.guide.reach ? [s.guide.reach] : []),
    write: (s, [v]) => ({ guide: { ...s.guide, reach: v } }),
  },
  // How they get around on the trip (owner, plan flow walk 2026-10-30): it
  // moves the matches (no car marks down places that need one) and the
  // prices (a hire car or public transport), lib/recommend/candidates.js.
  'g:around': {
    titleKey: 'pf.q.aroundTrip',
    options: [
      opt('public', 'BusIcon', { labelKey: 'pf.o.transit' }),
      opt('taxi', 'CarIcon', { labelKey: 'pf.o.taxi' }),
      opt('car', 'RoadIcon', { labelKey: 'pf.o.aroundCar' }),
      opt('mix', 'SparkIcon', { labelKey: 'pf.o.aroundMix' }),
    ],
    read: (s) => (s.guide.around ? [s.guide.around] : []),
    write: (s, [v]) => ({ guide: { ...s.guide, around: v } }),
  },
  'g:avoid': {
    titleKey: 'pf.q.avoid', multi: true, none: 'none', skippable: true,
    // "A car" is answered by How you get around now; an older answer still counts.
    offered: (s, v) => v !== 'car',
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
  'g:budget': { titleKey: 'pf.q.budget', custom: true, skippable: true },
  // T796: what Carta picks for the traveller; the rows come from config/slots.json.
  'g:pick': { titleKey: 'pf.q.pick', custom: true },
  // The last help-me-choose question (owner, plan flow walk 2026-10-30, in
  // place of the four doors): the whole trip at once (the trips for you) or
  // the flights decided first (the flight-first screen). It is the trip's door.
  'g:how': {
    titleKey: 'pf.q.how',
    options: [
      opt('guide', 'RouteIcon', { labelKey: 'pf.o.howWhole' }),
      opt('flight', 'PlaneIcon', { labelKey: 'pf.o.howFlight' }),
    ],
    read: (s) => [s.door === 'flight' ? 'flight' : 'guide'],
    write: (s, [v]) => ({ door: v === 'flight' ? 'flight' : 'guide' }),
  },

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
