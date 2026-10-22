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
