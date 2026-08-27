/**
 * The four ways to sleep, as a plain table.
 *
 * Six measured stay tiers (dorm, private, home and three hotel grades) are
 * only four choices: "which hotel" is a second question, not a fourth, fifth
 * and sixth way to sleep. The lifestyle panel draws one tile per group here
 * and puts the grades behind the hotel tile.
 *
 * Lives outside the panel because the panel is .jsx and carries icons, and
 * the headless harness has to be able to import the table on its own.
 *
 * `tiers` is in preference order, so a group with nothing chosen inside it
 * yet lands on its first offered member: a hotel means a 3-star hotel until
 * somebody says otherwise, and the unstarred Hostelworld tier only stands in
 * where no star grade was measured.
 */
export const SLEEP_GROUPS = [
  { key: 'dorm',    labelKey: 'stay.dorm',    tiers: ['dorm'] },
  { key: 'private', labelKey: 'stay.private', tiers: ['private'] },
  { key: 'home',    labelKey: 'stay.home',    tiers: ['home'] },
  { key: 'hotel',   labelKey: 'stay.hotel',   tiers: ['hotel3', 'hotel', 'hotel4', 'hotel5'] },
];

/** The star row under the hotel tile, in grade order. 'hotel' is
 *  Hostelworld's unstarred price and only appears when no star tier was
 *  measured, since "Any" beside "3 star" is a mystery otherwise. */
export const HOTEL_GRADES = [
  { tier: 'hotel',  labelKey: 'stay.starsAny' },
  { tier: 'hotel3', labelKey: 'stay.stars3' },
  { tier: 'hotel4', labelKey: 'stay.stars4' },
  { tier: 'hotel5', labelKey: 'stay.stars5' },
];

/** Which tile a stored tier belongs to. Anything unrecognised resolves to the
 *  entire place, because choices.stay_tier is restored from URLs and from
 *  accounts and must always land somewhere the panel can show back. */
export function sleepGroupOf(tier) {
  return SLEEP_GROUPS.find((g) => g.tiers.includes(tier))?.key || 'home';
}
