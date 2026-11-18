/* eslint-disable react-refresh/only-export-components -- tables and helpers, no components */
import { PROFILES } from '../../lib/lifestyleProfiles.js';
import {
  BunkIcon, HomeIcon, HotelIcon,
  BackpackIcon, LeafIcon, DiningIcon, CoffeeIcon, MusicIcon, FriendsIcon,
} from '../../components/Icons.jsx';

// How you spend: the tables shared by the style wizard, Explore, the planner
// and the price sheets, moved out of the retired LifestylePanel (Style Studio, G12).

// The six frequencies that follow the week/day cadence. `max` differs per
// cadence so the steppers stay sensible.
// coffees_per_day is outside PERIOD_FIELDS on purpose: it never rescales with
// the cadence toggle (toCadence leaves it alone).
export const COFFEE_MAX = 6;

export const PERIOD_FIELDS = [
  { key: 'dinners_per_week',            max: { week: 21, day: 3 } },
  { key: 'lunches_per_week',            max: { week: 21, day: 4 } },
  { key: 'fastfood_per_week',          max: { week: 21, day: 4 } },
  { key: 'drinks_per_week',            max: { week: 40, day: 12 } },
  { key: 'club_nights_per_week',       max: { week: 7,  day: 1 } },
  { key: 'self_catered_days_per_week', max: { week: 7,  day: 1 } },
];

// The presets live in lib/lifestyleProfiles.js (T474), so pure modules and
// the node tests can read them; re-exported here for the panel's callers.
export { PROFILES };

// Display keys for the profile names above; the PROFILES keys stay as logic
// keys (matchProfile / setProfile) and are resolved to text at render time.
export const PROFILE_LABEL_KEYS = {
  Backpacker: 'lifestyle.profileBackpacker',
  Easygoing: 'lifestyle.profileEasygoing',
  Foodie: 'lifestyle.profileFoodie',
  'Cafe & culture': 'lifestyle.profileCafeCulture',
  Nightlife: 'lifestyle.profileNightlife',
  Family: 'lifestyle.profileFamily',
};

// One glyph per preset, so the grid is scannable before it is read.
export const PROFILE_ICONS = {
  Backpacker: BackpackIcon,
  Easygoing: LeafIcon,
  Foodie: DiningIcon,
  'Cafe & culture': CoffeeIcon,
  Nightlife: MusicIcon,
  Family: FriendsIcon,
};

// One glyph per way to sleep. The table itself lives in lib/sleepGroups.js
// so the headless harness can import it without a JSX loader.
export const SLEEP_ICONS = { hostel: BunkIcon, home: HomeIcon, hotel: HotelIcon };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Re-express a lifestyle object in the target cadence (exported for the
// planner's lifestyle step, T750). Week -> day keeps one
// decimal (3 dinners/week is honestly 0.4/day, not 0) so no category the
// traveller set is silently zeroed and the priced total survives the toggle;
// day -> week rounds back to whole numbers.
export function toCadence(ls, target) {
  const from = ls.cadence || 'week';
  if (from === target) return { ...ls, cadence: target };
  const out = { ...ls, cadence: target };
  for (const f of PERIOD_FIELDS) {
    const v = ls[f.key] || 0;
    const scaled = target === 'day'
      ? (v > 0 ? Math.max(0.1, Math.round((v / 7) * 10) / 10) : 0)
      : Math.round(v * 7);
    out[f.key] = clamp(scaled, 0, f.max[target]);
  }
  return out;
}

/** The preset a lifestyle currently equals, or null when it has been tuned
 *  by hand. Exported so the Explore toolbar can name what is set without
 *  keeping a second copy of the table. */
export function matchProfile(ls) {
  const wk = toCadence(ls, 'week');
  for (const [name, p] of Object.entries(PROFILES)) {
    const keys = PERIOD_FIELDS.map((f) => f.key);
    if (keys.every((k) => (wk[k] ?? 0) === (p[k] ?? 0))) return name;
  }
  return null;
}
