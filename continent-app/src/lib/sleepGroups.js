/**
 * The ways to sleep, as a plain table (T535, owner 2026-10-21).
 *
 * Eight priced stay tiers are three choices: a hostel, a home or a hotel.
 * "Which bed", "which home" and "which hotel" are each a second question, not
 * more tiles, so the Lifestyle panel and the planner draw one tile per kind
 * and, under the chosen kind, one segmented row of its options.
 *
 * Lives outside the panel because the panel is .jsx and carries icons, and
 * the headless harness has to be able to import the table on its own.
 *
 * `tiers` is in preference order, so a kind with nothing chosen inside it
 * yet lands on its first offered member: a hostel means a dorm bed, a home
 * means an entire place, a hotel means a 3-star hotel, until somebody says
 * otherwise.
 */
export const SLEEP_GROUPS = [
  { key: 'hostel', labelKey: 'stay.hostel', askKey: 'lifestyle.hostelKind', tiers: ['dorm', 'private'] },
  { key: 'home',   labelKey: 'stay.homes',  askKey: 'lifestyle.homeKind',   tiers: ['home', 'room'] },
  { key: 'hotel',  labelKey: 'stay.hotel',  askKey: 'lifestyle.hotelGrade', tiers: ['hotel3', 'hotel2', 'hotel4', 'hotel5'] },
];

/** The star row under the hotel tile, in grade order. */
export const HOTEL_GRADES = [
  { tier: 'hotel2', labelKey: 'stay.stars2' },
  { tier: 'hotel3', labelKey: 'stay.stars3' },
  { tier: 'hotel4', labelKey: 'stay.stars4' },
  { tier: 'hotel5', labelKey: 'stay.stars5' },
];

/** The second row of each kind, cheapest first. */
const GROUP_OPTIONS = {
  hostel: [{ tier: 'dorm', labelKey: 'stay.dorm' }, { tier: 'private', labelKey: 'stay.private' }],
  home: [{ tier: 'room', labelKey: 'stay.room' }, { tier: 'home', labelKey: 'stay.home' }],
  hotel: HOTEL_GRADES,
};

/** The kinds a dataset can offer, cheapest first, each carrying the tiers
 *  it can price (`offered`, in preference order). A kind with nothing
 *  priced is left out. The Lifestyle panel draws these as tiles and the
 *  trip page (T173) draws the same list as a stepped slider, so both read
 *  one table and write one setting, choices.stay_tier. */
export function offeredSleepGroups(stayTiers) {
  const have = Array.isArray(stayTiers) ? stayTiers : [];
  return SLEEP_GROUPS
    .map((g) => ({ ...g, offered: g.tiers.filter((k) => have.includes(k)) }))
    .filter((g) => g.offered.length > 0);
}

/** The options of the second row under kind `g`, in display order, only
 *  those it can price. One option means no row at all. */
export function optionsFor(g) {
  return (GROUP_OPTIONS[g?.key] || []).filter((o) => g.offered.includes(o.tier));
}

/** The tier a pick of kind `g` lands on: the tier already chosen when it
 *  belongs to that kind, otherwise the kind's first offered tier. */
export function tierForGroup(g, current) {
  return g.offered.includes(current) ? current : g.offered[0];
}

/** Which tile a stored tier belongs to. Anything unrecognised resolves to the
 *  home, because choices.stay_tier is restored from URLs and from accounts
 *  and must always land somewhere the panel can show back. */
export function sleepGroupOf(tier) {
  const t = tier === 'hotel' ? 'hotel3' : tier;
  return SLEEP_GROUPS.find((g) => g.tiers.includes(t))?.key || 'home';
}

// ---- The stay types (T862, plan flow v3 Batch C) ---------------------------
//
// The planner's "Where to sleep" asks first for the space (a whole place, a
// room, or either) and then offers the four types the stay data serves
// (pipeline/stays/build_stays.py, checked 2026-10-29), each with a typical
// night: an apartment or holiday home, a hotel (its stars as the comfort row),
// a room in a home, a hostel. Each type prices one or more stay tiers
// (lib/stayPrice.js STAY_TIERS), in preference order:
//
//   apartment  'home' (the wire's bnb_home, an entire place). The pipeline's
//              own apartments kind ('apt', Booking.com apartments, studios,
//              holiday homes, villas and houses) only feeds bnb_home where
//              Inside Airbnb has none; it does not reach the wire, so the
//              type prices bnb_home until it does (register T862-a).
//   hotel      hotel3, then hotel2, hotel4, hotel5
//   room       'room' (bnb_room, a private room in a home)
//   hostel     'dorm', then 'private' (a hostel's or a guesthouse's room)

export const STAY_SPACES = ['whole', 'room', 'either'];

export const STAY_TYPES = [
  { key: 'apartment', space: 'whole', labelKey: 'stay.type.apartment', tiers: ['home'] },
  { key: 'hotel', space: 'room', labelKey: 'stay.type.hotel', tiers: ['hotel3', 'hotel2', 'hotel4', 'hotel5'], comfort: true },
  { key: 'room', space: 'room', labelKey: 'stay.type.room', tiers: ['room'] },
  { key: 'hostel', space: 'room', labelKey: 'stay.type.hostel', tiers: ['dorm', 'private'] },
];

/** The stay types a dataset can price, each with the tiers it offers. */
export function offeredStayTypes(stayTiers) {
  const have = Array.isArray(stayTiers) ? stayTiers : [];
  return STAY_TYPES
    .map((ty) => ({ ...ty, offered: ty.tiers.filter((k) => have.includes(k)) }))
    .filter((ty) => ty.offered.length > 0);
}

/** The types a space shows: a whole place, a room, or all of them. */
export function typesForSpace(types, space) {
  return space === 'whole' || space === 'room' ? types.filter((ty) => ty.space === space) : types;
}

/** Which type a stored tier belongs to; anything unknown is the apartment, as sleepGroupOf lands on the home. */
export function stayTypeOf(tier) {
  const t = tier === 'hotel' ? 'hotel3' : tier === 'bnb_home' ? 'home' : tier === 'bnb_room' ? 'room' : tier;
  return STAY_TYPES.find((ty) => ty.tiers.includes(t))?.key || 'apartment';
}

/** The tier a pick of type `ty` lands on: the current tier when it belongs to it, else its first. */
export function tierForType(ty, current) {
  return ty.offered.includes(current) ? current : ty.offered[0];
}
