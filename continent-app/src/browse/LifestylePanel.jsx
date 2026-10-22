import React from 'react';
import { offeredStayTiers } from '../lib/runtime_pricing.js';
import {
  BunkIcon, HomeIcon, HotelIcon,
  BackpackIcon, LeafIcon, DiningIcon, CoffeeIcon, MusicIcon, FriendsIcon,
  ChevronDownIcon, CloseIcon,
} from '../components/Icons.jsx';
import { sleepGroupOf, offeredSleepGroups, optionsFor, tierForGroup } from '../lib/sleepGroups.js';
import { Segmented } from '../components/ui/index.js';
import { PROFILES } from '../lib/lifestyleProfiles.js';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { Stepper as CountStepper } from '../components/FilterControls.jsx';

/**
 * Lifestyle settings panel.
 *
 * Two questions decide every euro figure in the app, so the panel asks them
 * as two grids of tiles rather than as rows of text: where you sleep, and how
 * you eat and drink. The six frequencies behind the second answer are still
 * editable, but they now sit inside a closed disclosure, because a preset
 * covers almost everybody and six steppers on open was most of the panel.
 *
 * Tiles are compact rows, the icon beside its word (T580, owner 2026-10-22:
 * the whole panel fits a 1280x720 window without scrolling). Selected is the
 * light tint plus a tick (carta-design "One selected state").
 *
 * The head is one sheet title line and the foot is the dialog's one primary
 * (T580 took out the subtitle, the stay note and the trade-off sentence: the
 * owner asked for a simpler, cleaner panel).
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
// coffees_per_day is outside PERIOD_FIELDS on purpose: it never rescales with
// the cadence toggle (toCadence leaves it alone).
const COFFEE_MAX = 6;

const PERIOD_FIELDS = [
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

// The tick that marks a selected tile, so the state never rests on colour.
function Tick() {
  return (
    <svg className="ls-tile-tick" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function LifestylePanel({ choices, setChoices, onClose, data, side = 'left', leaving = false }) {
  const { t } = useI18n();
  // A dialog for the keyboard: focus moves in to the close button on open,
  // Tab cycles inside, Escape closes, and focus goes back to the Lifestyle
  // button that opened it. Before T190 focus stayed on that button, and Tab
  // walked the Explore grid hidden behind the scrim, ringless.
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  useFocusTrap(panelRef, onClose, { initialFocusRef: closeRef });
  const ls = choices.lifestyle || {};
  const cadence = ls.cadence || 'week';

  const setLs = (patch) => setChoices({ ...choices, lifestyle: { ...ls, ...patch } });
  const setProfile = (name) => setChoices({ ...choices, lifestyle: { ...PROFILES[name] } });
  const setCadence = (c) => setChoices({ ...choices, lifestyle: toCadence(ls, c) });
  const setTier = (tier) => setChoices({ ...choices, stay_tier: tier });
  const active = matchProfile(ls);

  // Only the tiers this dataset measured (apply_stay_tiers.py writes
  // meta.stays.tiers); 'home' is always there. With nothing measured
  // this is a single option, so the section hides rather than showing a
  // control that cannot change anything.
  const stayTiers = React.useMemo(() => offeredStayTiers(data?.meta), [data?.meta]);
  const stayTier = choices.stay_tier || 'home';

  // The tiles this dataset can actually offer, each carrying its own offered
  // grades. A group with nothing measured never renders.
  const sleepTiles = React.useMemo(() => offeredSleepGroups(stayTiers)
    .map((g) => ({ ...g, Icon: SLEEP_ICONS[g.key] })), [stayTiers]);

  const activeGroup = sleepGroupOf(stayTier);
  // The chosen kind's second question (which bed, which home, which hotel),
  // drawn only when it has more than one answer here.
  const activeTile = sleepTiles.find((g) => g.key === activeGroup) || null;
  const kindOptions = activeTile ? optionsFor(activeTile) : [];

  // Picking a tile keeps the option already chosen inside it, and otherwise
  // lands on that kind's first offered option (a dorm bed, an entire place,
  // a 3-star hotel: what most people mean by the word).
  const pickGroup = (g) => {
    if (g.offered.includes(stayTier)) return;
    setTier(tierForGroup(g, stayTier));
  };

  // The steppers open closed: a preset above already answers this for almost
  // everybody, and six steppers on open were most of the panel.
  const [tuned, setTuned] = React.useState(false);

  const maxFor = (key) => PERIOD_FIELDS.find((f) => f.key === key).max[cadence];

  // On a phone the panel is a bottom sheet; its grab handle swipes it down,
  // a shortcut for the close and Done buttons, never the only way (T391).
  const drag = React.useRef({ id: null, y0: 0 });
  const onGrabDown = (e) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { id: e.pointerId, y0: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onGrabMove = (e) => {
    if (drag.current.id !== e.pointerId || !panelRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    panelRef.current.style.transition = 'none';
    panelRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onGrabUp = (e) => {
    if (drag.current.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current = { id: null, y0: 0 };
    if (panelRef.current) {
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
    }
    if (dy > 90) onClose();
  };

  return (
    <div
      ref={panelRef}
      className={`accom-panel lifestyle-panel open${side === 'right' ? ' from-right' : ''}${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lifestyle-title"
    >
      <span
        className="ls-grab"
        aria-hidden="true"
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      />
      <button ref={closeRef} type="button" className="shell-close ls-close" onClick={onClose} aria-label={t('lifestyle.close')}>
        <CloseIcon size={16} />
      </button>

      {/* The choices scroll; the grab handle, the close and the foot stay
          where the thumb and the eye left them (T391). */}
      <div className="ls-body">
      <div className="panel-header ls-header">
        <h2 className="ls-title" id="lifestyle-title">{t('lifestyle.title')}</h2>
      </div>

      {sleepTiles.length > 1 && (
        <div className="panel-section">
          <div className="ls-head">{t('lifestyle.stay')}</div>
          <div className="ls-tiles ls-tiles-3 ls-tiles-stay" role="group" aria-label={t('lifestyle.stay')}>
            {sleepTiles.map(({ key, labelKey, Icon, offered }) => (
              <button
                key={key}
                type="button"
                className={`ls-tile ${activeGroup === key ? 'on' : ''}`}
                aria-pressed={activeGroup === key}
                onClick={() => pickGroup({ key, offered })}
              >
                <Icon size={18} />
                <span>{t(labelKey)}</span>
                {activeGroup === key && <Tick />}
              </button>
            ))}
          </div>

          {/* Which bed, which home, which hotel: asked once the kind is chosen. */}
          {kindOptions.length > 1 && (
            <div className="ls-kind">
              <span className="ls-kind-label" aria-hidden="true">{t(activeTile.askKey)}</span>
              <Segmented
                label={t(activeTile.askKey)}
                size="sm"
                block
                value={stayTier === 'hotel' ? 'hotel3' : stayTier}
                onChange={setTier}
                options={kindOptions.map((o) => ({ value: o.tier, label: t(o.labelKey) }))}
              />
            </div>
          )}
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
                <Icon size={18} />
                <span>{t(PROFILE_LABEL_KEYS[name] || name)}</span>
                {active === name && <Tick />}
              </button>
            );
          })}
        </div>
        {!active && <p className="ls-note">{t('lifestyle.customNote')}</p>}
      </div>

      {/* The seven counts behind the preset. Closed by default; opening it is
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
              <button className={cadence === 'week' ? 'seg-on' : ''} aria-pressed={cadence === 'week'} onClick={() => setCadence('week')}>{t('lifestyle.perWeek')}</button>
              <button className={cadence === 'day' ? 'seg-on' : ''} aria-pressed={cadence === 'day'} onClick={() => setCadence('day')}>{t('lifestyle.perDay')}</button>
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
            {/* Always a day count, whatever the cadence: nobody plans coffee by the week. */}
            <Stepper label={t('lifestyle.coffeesPerDay')} value={ls.coffees_per_day ?? 0}
              onChange={(v) => setLs({ coffees_per_day: v })} min={0} max={COFFEE_MAX} />
            <Stepper label={t('lifestyle.clubNights')} value={ls.club_nights_per_week ?? 0}
              onChange={(v) => setLs({ club_nights_per_week: v })} min={0} max={maxFor('club_nights_per_week')} />
          </div>
        )}
      </div>
      </div>

      {/* The foot: the one primary, in view while the choices scroll. */}
      <div className="ls-foot">
        <button type="button" className="ls-done" onClick={onClose}>{t('lifestyle.done')}</button>
      </div>
    </div>
  );
}

// One count: its name, then the shared Stepper from FilterControls (T401, row
// T381-c), so the Lifestyle counts have the same two 44 px buttons as the
// people and nights counts elsewhere.
function Stepper({ label, value, onChange, min, max, hint }) {
  const { t } = useI18n();
  // Values can be fractional right after a week -> day cadence switch
  // (0.4 dinners/day); the first tap lands back on a whole number. The shared
  // Stepper moves by one, so a step up or down is mapped to the next whole
  // number in that direction.
  const step = (next) => onChange(next > value
    ? Math.min(max, Math.floor(value) + 1)
    : Math.max(min, Math.ceil(value) - 1));
  return (
    <div className="stepper">
      <div className="stepper-label">
        {label}
        {hint && <small className="stepper-hint">{hint}</small>}
      </div>
      <CountStepper
        value={value}
        min={min}
        max={max}
        onChange={step}
        ariaLabel={label}
        decLabel={t('lifestyle.decrease', { label })}
        incLabel={t('lifestyle.increase', { label })}
      />
    </div>
  );
}
