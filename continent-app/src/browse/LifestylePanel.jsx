import React from 'react';
import { DEFAULT_LIFESTYLE, offeredStayTiers } from '../lib/runtime_pricing.js';
import {
  BedIcon, BunkIcon, HomeIcon, HotelIcon,
  BackpackIcon, LeafIcon, DiningIcon, CoffeeIcon, MusicIcon, FriendsIcon,
  ChevronDownIcon,
} from '../components/Icons.jsx';
import { SLEEP_GROUPS, HOTEL_GRADES, sleepGroupOf } from '../lib/sleepGroups.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * Lifestyle settings panel.
 *
 * Two questions decide every euro figure in the app, so the panel asks them
 * as two grids of tiles rather than as rows of text: where you sleep, and how
 * you eat and drink. The six frequencies behind the second answer are still
 * editable, but they now sit inside a closed disclosure, because a preset
 * covers almost everybody and six steppers on open was most of the panel.
 *
 * Tiles borrow the Destinations category card exactly: a quiet --paper-dim
 * tile until it is on, then the full accent. That is the one way "selected"
 * reads on the browse tabs, and the panel is the same product.
 *
 * The stay tier is the same `choices.stay_tier` the filter bar carries, so
 * every priced surface (map labels, receipt, compare, trip planner) follows
 * it. Hotels are one tile with a star row underneath rather than three tiles
 * of their own, so the four ways to sleep stay four choices wide.
 *
 * Frequencies can be read per-week or per-day via the cadence toggle. The six
 * period-counts are stored in whatever cadence is active; switching cadence
 * re-scales them (x7 / div 7, one decimal in the day view) so the priced
 * total survives the toggle.
 */

// The six frequencies that follow the week/day cadence. `max` differs per
// cadence so the steppers stay sensible.
const PERIOD_FIELDS = [
  { key: 'dinners_per_week',            max: { week: 21, day: 3 } },
  { key: 'lunches_per_week',            max: { week: 21, day: 4 } },
  { key: 'fastfood_per_week',          max: { week: 21, day: 4 } },
  { key: 'drinks_per_week',            max: { week: 40, day: 12 } },
  { key: 'club_nights_per_week',       max: { week: 7,  day: 1 } },
  { key: 'self_catered_days_per_week', max: { week: 7,  day: 1 } },
];

// Per-person presets, defined in the weekly cadence. Picking one applies the
// preset in its native weekly cadence (a weekly rate like 5 dinners/week can't
// be shown faithfully as a per-day integer, so the panel snaps back to per-week
// - this keeps the priced spend exactly equal to the preset and lets the active
// tile highlight correctly).
const PROFILES = {
  Backpacker:      { cadence: 'week', dinners_per_week: 1, lunches_per_week: 3, fastfood_per_week: 4, drinks_per_week: 4,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5 },
  Easygoing:       { ...DEFAULT_LIFESTYLE },
  Foodie:          { cadence: 'week', dinners_per_week: 7, lunches_per_week: 5, fastfood_per_week: 0, drinks_per_week: 5,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 0 },
  'Cafe & culture':{ cadence: 'week', dinners_per_week: 3, lunches_per_week: 5, fastfood_per_week: 1, drinks_per_week: 3,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 2 },
  Nightlife:       { cadence: 'week', dinners_per_week: 3, lunches_per_week: 2, fastfood_per_week: 4, drinks_per_week: 12, club_nights_per_week: 3, coffees_per_day: 0, self_catered_days_per_week: 1 },
  Family:          { cadence: 'week', dinners_per_week: 2, lunches_per_week: 4, fastfood_per_week: 3, drinks_per_week: 2,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5 },
};

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
const PROFILE_ICONS = {
  Backpacker: BackpackIcon,
  Easygoing: LeafIcon,
  Foodie: DiningIcon,
  'Cafe & culture': CoffeeIcon,
  Nightlife: MusicIcon,
  Family: FriendsIcon,
};

// One glyph per way to sleep. The table itself lives in lib/sleepGroups.js
// so the headless harness can import it without a JSX loader.
const SLEEP_ICONS = { dorm: BunkIcon, private: BedIcon, home: HomeIcon, hotel: HotelIcon };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Re-express a lifestyle object in the target cadence. Week -> day keeps one
// decimal (3 dinners/week is honestly 0.4/day, not 0) so no category the
// traveller set is silently zeroed and the priced total survives the toggle;
// day -> week rounds back to whole numbers.
function toCadence(ls, target) {
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

export function LifestylePanel({ choices, setChoices, onClose, data, side = 'left' }) {
  const { t } = useI18n();
  const ls = choices.lifestyle || {};
  const cadence = ls.cadence || 'week';

  const setLs = (patch) => setChoices({ ...choices, lifestyle: { ...ls, ...patch } });
  const setProfile = (name) => setChoices({ ...choices, lifestyle: { ...PROFILES[name] } });
  const setCadence = (c) => setChoices({ ...choices, lifestyle: toCadence(ls, c) });
  const setTier = (tier) => setChoices({ ...choices, stay_tier: tier });
  const active = matchProfile(ls);

  // Only the tiers this dataset measured (apply_stay_tiers.py writes
  // meta.stay_tiers_available); 'home' is always there. With nothing measured
  // this is a single option, so the section hides rather than showing a
  // control that cannot change anything.
  const stayTiers = React.useMemo(() => offeredStayTiers(data?.meta), [data?.meta]);
  const stayTier = choices.stay_tier || 'home';

  // The tiles this dataset can actually offer, each carrying its own offered
  // grades. A group with nothing measured never renders.
  const sleepTiles = React.useMemo(() => SLEEP_GROUPS
    .map((g) => ({ ...g, Icon: SLEEP_ICONS[g.key], offered: g.tiers.filter((k) => stayTiers.includes(k)) }))
    .filter((g) => g.offered.length > 0), [stayTiers]);

  const activeGroup = sleepGroupOf(stayTier);
  const hotelTile = sleepTiles.find((g) => g.key === 'hotel');
  const hotelGrades = hotelTile
    ? HOTEL_GRADES.filter((h) => hotelTile.offered.includes(h.tier))
    : [];

  // Picking a tile keeps the grade already chosen inside it, and otherwise
  // lands on that tile's first offered grade (3-star for hotels, which is the
  // grade most people mean by "a hotel").
  const pickGroup = (g) => {
    if (g.offered.includes(stayTier)) return;
    setTier(g.offered[0]);
  };

  // The steppers open closed: a preset above already answers this for almost
  // everybody, and six steppers on open were most of the panel.
  const [tuned, setTuned] = React.useState(false);

  const maxFor = (key) => PERIOD_FIELDS.find((f) => f.key === key).max[cadence];

  return (
    <div className={`accom-panel lifestyle-panel open${side === 'right' ? ' from-right' : ''}`}>
      <button className="panel-close" onClick={onClose} aria-label={t('lifestyle.close')}>x</button>

      <div className="panel-header">
        <div className="panel-tag">{t('lifestyle.tag')}</div>
        <h2 className="panel-city">{t('lifestyle.title')}</h2>
        <p className="lifestyle-sub">{t('lifestyle.sub')}</p>
      </div>

      {sleepTiles.length > 1 && (
        <div className="panel-section">
          <div className="ls-head">{t('lifestyle.stay')}</div>
          <div className="ls-tiles" role="group" aria-label={t('lifestyle.stay')}>
            {sleepTiles.map(({ key, labelKey, Icon, offered }) => (
              <button
                key={key}
                type="button"
                className={`ls-tile ${activeGroup === key ? 'on' : ''}`}
                aria-pressed={activeGroup === key}
                onClick={() => pickGroup({ key, offered })}
              >
                <Icon size={22} />
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </div>

          {/* Which hotel, asked only once a hotel is the answer. */}
          {activeGroup === 'hotel' && hotelGrades.length > 1 && (
            <div className="ls-grades" role="group" aria-label={t('lifestyle.hotelGrade')}>
              <span className="ls-grades-label">{t('lifestyle.hotelGrade')}</span>
              {hotelGrades.map(({ tier, labelKey }) => (
                <button
                  key={tier}
                  type="button"
                  className={`ls-grade ${stayTier === tier ? 'on' : ''}`}
                  aria-pressed={stayTier === tier}
                  onClick={() => setTier(tier)}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          )}

          <p className="ls-note">{t('lifestyle.stayNote')}</p>
        </div>
      )}

      <div className="panel-section">
        <div className="ls-head">{t('lifestyle.profile')}</div>
        <div className="ls-tiles ls-tiles-3" role="group" aria-label={t('lifestyle.profile')}>
          {Object.keys(PROFILES).map((name) => {
            const Icon = PROFILE_ICONS[name];
            return (
              <button
                key={name}
                type="button"
                className={`ls-tile ${active === name ? 'on' : ''}`}
                aria-pressed={active === name}
                onClick={() => setProfile(name)}
              >
                <Icon size={20} />
                <span>{t(PROFILE_LABEL_KEYS[name] || name)}</span>
              </button>
            );
          })}
        </div>
        {!active && <p className="ls-note">{t('lifestyle.customNote')}</p>}
      </div>

      {/* The six counts behind the preset. Closed by default; opening it is
          what makes the preset above a starting point rather than the only
          answer. */}
      <div className="panel-section lifestyle-food">
        <button
          type="button"
          className={`ls-tune-btn ${tuned ? 'open' : ''}`}
          aria-expanded={tuned}
          onClick={() => setTuned(!tuned)}
        >
          <span>{t('lifestyle.fineTune')}</span>
          <ChevronDownIcon size={16} className="ls-tune-chev" />
        </button>

        {tuned && (
          <div className="ls-tune">
            <div className="panel-segment lifestyle-cadence">
              <button className={cadence === 'week' ? 'seg-on' : ''} onClick={() => setCadence('week')}>{t('lifestyle.perWeek')}</button>
              <button className={cadence === 'day' ? 'seg-on' : ''} onClick={() => setCadence('day')}>{t('lifestyle.perDay')}</button>
            </div>
            <Stepper label={t('lifestyle.dinnersOut')} value={ls.dinners_per_week ?? 0}
              onChange={(v) => setLs({ dinners_per_week: v })} min={0} max={maxFor('dinners_per_week')} />
            <Stepper label={t('lifestyle.casualMeals')} value={ls.lunches_per_week ?? 0}
              onChange={(v) => setLs({ lunches_per_week: v })} min={0} max={maxFor('lunches_per_week')} />
            <Stepper label={t('lifestyle.fastFood')} value={ls.fastfood_per_week ?? 0}
              onChange={(v) => setLs({ fastfood_per_week: v })} min={0} max={maxFor('fastfood_per_week')} />
            <Stepper label={t('lifestyle.cookAtHome')} value={ls.self_catered_days_per_week ?? 0}
              onChange={(v) => setLs({ self_catered_days_per_week: v })} min={0} max={maxFor('self_catered_days_per_week')} />
            <Stepper label={t('lifestyle.drinksAtBars')} value={ls.drinks_per_week ?? 0}
              onChange={(v) => setLs({ drinks_per_week: v })} min={0} max={maxFor('drinks_per_week')} />
            <Stepper label={t('lifestyle.clubNights')} value={ls.club_nights_per_week ?? 0}
              onChange={(v) => setLs({ club_nights_per_week: v })} min={0} max={maxFor('club_nights_per_week')} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, min, max, hint }) {
  const { t } = useI18n();
  // Values can be fractional right after a week -> day cadence switch
  // (0.4 dinners/day); the first tap lands back on a whole number.
  const dec = () => onChange(Math.max(min, Math.ceil(value) - 1));
  const inc = () => onChange(Math.min(max, Math.floor(value) + 1));
  return (
    <div className="stepper">
      <div className="stepper-label">
        {label}
        {hint && <small className="stepper-hint">{hint}</small>}
      </div>
      <div className="stepper-controls">
        <button onClick={dec} disabled={value <= min} aria-label={t('lifestyle.decrease', { label })}>-</button>
        <span className="stepper-value">{value}</span>
        <button onClick={inc} disabled={value >= max} aria-label={t('lifestyle.increase', { label })}>+</button>
      </div>
    </div>
  );
}
