/**
 * The ?savedmock=<variant> fixtures for the My trips redesign (G12, run
 * 2026-11-21-my-trips-tab, Phase A). Dev and E2E builds only: the panel
 * reads them behind E2E_SEAMS. Every id is a real catalogue id, so the
 * engine prices the trips itself; no figure here is drawn on screen except
 * the watched prices, which stand in for what Viantra measured.
 *
 *   guest      signed out, nothing kept
 *   empty      signed in, nothing at all
 *   one        one trip: Hallstatt in 224 days, 7 nights, 2 people
 *   statement  one trip to come, Lisbon and Porto, taken off the public
 *              guides: the statement of reasons under it (DSA)
 *   next, 1    the existing fixtures (next leaves out today's trip)
 *   drafts     only trips without dates
 *   nopast     the trips to come, no record
 *   firstpast  one past trip, Bruges, unrated, no spend
 *   lots       the default fixtures plus 40 saves in 14 countries and 4 watched items
 *   years      14 past trips 2022 to 2026, 17 countries, spend on 10, grades on 13
 *   loading    the trips never arrive
 *   error      the trips cannot be read
 *   spend      a trip in Portugal on day 4 of 7 with Sam, Jo and Lien, and
 *              their spends and Reiskas (G15, the Uitgaven page)
 */
import { addDaysIso } from '../../lib/myTrips.js';
import { kasPeople, makeSpend } from '../../lib/spend/model.js';

export const MOCK_VARIANTS = ['guest', 'empty', 'one', 'statement', 'next', '1', 'drafts', 'nopast', 'firstpast', 'lots', 'years', 'loading', 'error', 'spend'];

const stopsAt = (list) => list.map(([id, a, b]) => ({ destination_id: id, city: '', country: '', arrive_date: a, depart_date: b }));
const rel = (list) => stopsAt(list.map(([id, a, b]) => [id, addDaysIso(a), addDaysIso(b)]));

export const ONE_PLANS = [
  { id: 'mo1', label: null, cities: ['Hallstatt'], countries: ['Austria'], start_date: addDaysIso(224), end_date: addDaysIso(231), destination_ids: ['gem:hallstatt'], stops: rel([['gem:hallstatt', 224, 231]]), choices: { groupSize: 2 } },
];

export const STATEMENT_PLANS = [
  { id: 'ms1', label: 'Lisbon and Porto', cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: addDaysIso(40), end_date: addDaysIso(46), destination_ids: ['LIS', 'OPO'], stops: rel([['LIS', 40, 43], ['OPO', 43, 46]]), choices: { groupSize: 2 }, visibility: 'private' },
];

export const FIRST_PAST_PLANS = [
  { id: 'mfp1', label: null, cities: ['Bruges'], countries: ['Belgium'], start_date: addDaysIso(-60), end_date: addDaysIso(-55), destination_ids: ['gem:bruges'], stops: rel([['gem:bruges', -60, -55]]), choices: { groupSize: 2 } },
];
export const FIRST_PAST_MEMS = {
  mfp1: { places: [{ id: 'gem:bruges', city: 'Bruges', country: 'Belgium', lat: 51.2093, lon: 3.2247, nights: 5 }], travellers: { adults: 2, children: 0 }, spend: { currency: 'EUR' }, rating: null, photos: [] },
};

// [id, label, [[destId, city, country, lat, lon, nights]], start, spend (stay, food) or null, grade or null]
const YEARS = [
  ['my1', 'Lisbon and Sintra', [['LIS', 'Lisbon', 'Portugal', 38.7813, -9.1359, 4], ['gem:sintra', 'Sintra', 'Portugal', 38.798, -9.3878, 2]], '2022-04-08', [420, 260], 8],
  ['my2', null, [['EDI', 'Edinburgh', 'United Kingdom', 55.9508, -3.3615, 4]], '2022-09-15', null, 7],
  ['my3', 'Bruges and Ghent', [['gem:bruges', 'Bruges', 'Belgium', 51.2093, 3.2247, 3], ['gem:ghent', 'Ghent', 'Belgium', 51.0543, 3.7174, 2]], '2023-03-17', [380, 230], 8],
  ['my4', 'Amsterdam and Luxembourg', [['AMS', 'Amsterdam', 'Netherlands', 52.3086, 4.7639, 3], ['LUX', 'Luxembourg', 'Luxembourg', 49.6233, 6.2044, 2]], '2023-05-12', [560, 250], 9],
  ['my5', 'Seville and Granada', [['SVQ', 'Seville', 'Spain', 37.418, -5.8931, 4], ['gem:granada', 'Granada', 'Spain', 37.1773, -3.5986, 3]], '2023-10-06', [430, 300], 9],
  ['my6', 'Florence and Lucca', [['gem:lucca', 'Lucca', 'Italy', 43.8417, 10.5028, 3], ['FLR', 'Florence', 'Italy', 43.81, 11.2051, 5]], '2024-05-10', [690, 380], 10],
  ['my7', 'Bergen and Oslo', [['BGO', 'Bergen', 'Norway', 60.2934, 5.2181, 3], ['OSL', 'Oslo', 'Norway', 60.1939, 11.1004, 3]], '2024-07-19', [780, 420], 8],
  ['my8', 'Dubrovnik and Kotor', [['DBV', 'Dubrovnik', 'Croatia', 42.5614, 18.2682, 4], ['gem:kotor', 'Kotor', 'Montenegro', 42.4247, 18.7712, 3]], '2024-09-13', [520, 330], 9],
  ['my9', null, [['TOS', 'Tromsø', 'Norway', 69.6833, 18.9189, 5]], '2025-02-14', null, 9],
  ['my10', 'Copenhagen and Stockholm', [['CPH', 'Copenhagen', 'Denmark', 55.6181, 12.6561, 3], ['ARN', 'Stockholm', 'Sweden', 59.6519, 17.9186, 4]], '2025-06-06', [860, 410], 7],
  ['my11', 'Prague and Budapest', [['PRG', 'Prague', 'Czechia', 50.1008, 14.2632, 3], ['BUD', 'Budapest', 'Hungary', 47.4369, 19.2556, 3]], '2025-04-11', [360, 240], 8],
  ['my12', 'Lagos and Porto', [['gem:lagos-pt', 'Lagos', 'Portugal', 37.1028, -8.6747, 4], ['OPO', 'Porto', 'Portugal', 41.2481, -8.6814, 3]], '2025-08-22', [480, 290], 9],
  ['my13', null, [['ATH', 'Athens', 'Greece', 37.9364, 23.9445, 6]], '2026-05-15', null, null],
  ['my14', 'Annecy and Zermatt', [['gem:annecy', 'Annecy', 'France', 45.8992, 6.1294, 2], ['gem:zermatt', 'Zermatt', 'Switzerland', 46.0207, 7.7491, 3]], '2026-07-03', null, 8],
];

const plusDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const YEARS_PLANS = YEARS.map(([id, label, places, start]) => {
  let at = start;
  const stops = places.map(([dest, , , , , n]) => { const a = at; at = plusDays(at, n); return [dest, a, at]; });
  return {
    id, label, cities: places.map((p) => p[1]), countries: [...new Set(places.map((p) => p[2]))],
    start_date: start, end_date: at, destination_ids: places.map((p) => p[0]), stops: stopsAt(stops), choices: { groupSize: 2 },
  };
});

export const YEARS_MEMS = Object.fromEntries(YEARS.map(([id, , places, , spend, grade]) => [id, {
  places: places.map(([pid, city, country, lat, lon, nights]) => ({ id: pid, city, country, lat, lon, nights })),
  travellers: { adults: 2, children: 0 },
  spend: spend ? { currency: 'EUR', stay: spend[0], food: spend[1] } : { currency: 'EUR' },
  rating: grade,
  photos: [],
}]));

// 40 saves in 14 countries for `lots`, on top of the default fixtures' own.
export const LOTS_FAV_KEYS = [
  'dest:gem:hallstatt', 'dest:gem:bled', 'dest:OPO', 'dest:gem:lagos-pt', 'dest:DBV', 'dest:FLR', 'dest:gem:lucca',
  'dest:gem:annecy', 'dest:gem:zermatt', 'dest:FCO', 'dest:SZG', 'dest:VIE', 'dest:INN', 'dest:gem:sintra', 'dest:LIS',
  'dest:SVQ', 'dest:gem:granada', 'dest:BCN', 'dest:VLC', 'dest:NCE', 'dest:LYS', 'dest:CDG', 'dest:SPU', 'dest:gem:kotor',
  'dest:BGO', 'dest:TOS', 'dest:CPH', 'dest:EDI', 'dest:PRG', 'dest:BUD', 'dest:ATH', 'dest:gem:ghent', 'dest:gem:bruges',
  'dest:LJU', 'dest:NAP', 'dest:BLQ', 'dest:VRN', 'dest:PMO', 'dest:MUC', 'dest:AMS',
];

const day = (iso) => `${iso}T08:00:00.000Z`;
const hist = (pairs) => pairs.map(([off, eur]) => ({ at: day(addDaysIso(off)), eur }));
// The four watched items of `lots`, each with the points Viantra "measured".
export const LOTS_WATCH = [
  { id: 'stay:gem:hallstatt:zauner', kind: 'stay', ref: 'gem:hallstatt:zauner', label: 'Gasthof Zauner, Hallstatt', placeKey: 'dest:gem:hallstatt', unitNote: 'night', source: 'Booking.com, 2 people, 3 nights in July', alert: true, pts: hist([[-51, 146], [-44, 142], [-37, 139], [-30, 139], [-23, 131], [-16, 126], [0, 118]]) },
  { id: 'flight:BRU-OPO', kind: 'flight', ref: 'BRU-OPO', label: 'Brussels to Porto, September', placeKey: 'dest:OPO', unitNote: 'return', source: 'Google Flights, lowest return in September', alert: false, pts: hist([[-58, 134], [-44, 129], [-30, 141], [-16, 118], [-9, 112], [0, 97]]) },
  { id: 'day:gem:bled', kind: 'day', ref: 'gem:bled', label: 'Bled', placeKey: 'dest:gem:bled', unitNote: 'day, each', source: 'Viantra, bed and food in September', alert: false, pts: hist([[-79, 101], [-51, 99], [-37, 99], [-23, 97], [-9, 96], [0, 94]]) },
  { id: 'stay:LJU:celica', kind: 'stay', ref: 'LJU:celica', label: 'Hostel Celica, Ljubljana', placeKey: 'dest:LJU', unitNote: 'night', source: 'Hostelworld, 1 bed in a dorm', alert: false, pts: hist([[-37, 38], [-30, 38], [-23, 41], [-9, 44], [0, 44]]) },
];

/* G15: the Uitgaven page's sample, the approved prototype's own trip. */
export const SPEND_PLANS = [
  { id: 'msp1', label: 'Portugal', cities: ['Lisbon', 'Sintra'], countries: ['Portugal'], start_date: addDaysIso(-3), end_date: addDaysIso(3), destination_ids: ['LIS'], stops: rel([['LIS', -3, 3]]), choices: { groupSize: 4 } },
];

/** The sample trip's extras: the crew and seven spends over three days. */
export function spendExtras() {
  const people = [{ name: 'Sam', userId: null }, { name: 'Jo', userId: null }, { name: 'Lien', userId: null }];
  const crew = kasPeople({ people });
  const at = (day, h) => { const d = new Date(); d.setDate(d.getDate() + day); d.setHours(h, 0, 0, 0); return `${d.getTime()}`; };
  const row = (day, h, o) => makeSpend({ currency: 'EUR', rate: 1, src: 'hand', ...o }, crew, { id: at(day, h), date: addDaysIso(day) });
  return {
    people,
    expenses: [
      row(-2, 20, { amount: 120, cat: 'other', desc: 'Extra nacht hostel', payer: 'me', mode: 'all' }),
      row(-1, 10, { amount: 80, cat: 'activities', desc: 'Pena-paleis', payer: 'me', mode: 'all' }),
      row(-1, 20, { amount: 96, cat: 'food', desc: 'Diner Sintra', payer: 'p2', mode: 'all' }),
      row(0, 9, { amount: 9.6, cat: 'food', desc: 'Pastéis de Belém', payer: 'me', mode: 'all' }),
      row(0, 10, { amount: 12, cat: 'transport', desc: 'Tram 28', payer: 'p0', mode: 'all' }),
      row(0, 13, { amount: 58, cat: 'food', desc: 'Lunch Time Out Market', payer: 'p1', mode: 'each', shares: { me: 14.5, p0: 18, p1: 12, p2: 13.5 } }),
      row(0, 15, { amount: 8.5, cat: 'other', desc: 'Zonnebrand', payer: 'me', mode: 'me' }),
    ],
    kas: { settled: [], nudged: {}, remind: {} },
  };
}
