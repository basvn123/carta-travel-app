import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Segmented } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Stepper as CountStepper } from '../../components/FilterControls.jsx';
import NotYet from '../../components/NotYet.jsx';
import { offeredSleepGroups, optionsFor, sleepGroupOf, tierForGroup } from '../../lib/sleepGroups.js';
import { formatMoney } from '../../lib/money.js';
import { styleDayEur } from '../../lib/price/styleDay.js';
import { priceDays } from '../../lib/price/priceDay.js';
import { priceRequest } from '../../lib/price/request.js';
import { choicesFromStyle } from '../../lib/travelStyles.js';
import { radioGroupKeyDown, useRovingRadios } from '../../components/ui/radioGroup.js';
import {
  COFFEE_MAX, PERIOD_FIELDS, PROFILES, PROFILE_ICONS, PROFILE_LABEL_KEYS, SLEEP_ICONS, matchProfile, toCadence,
} from './spendBits.jsx';

/**
 * Where you sleep and eat, step 2 of the Style Studio (G12): the one
 * Lifestyle control (carta-design "Lifestyle control: there is one"), rebuilt
 * from the retired panel for the wizard. It edits a draft, not the app's
 * choices: nothing reaches a price until the wizard saves.
 *
 *   <StaySpendFields stay={d.stay} lifestyle={d.lifestyle} stayTiers={tiers}
 *     onStay={(tier) => ...} onLifestyle={(ls) => ...} />
 *
 * Ways to sleep are three tiles (hostel, home, hotel) with the chosen kind's
 * second question under them (which bed, which home, which hotel); eating is
 * the six presets; the seven counts behind a preset sit in a closed fold.
 */
export function StaySpendFields({ stay, lifestyle, stayTiers, onStay, onLifestyle }) {
  const { t } = useI18n();
  const ls = lifestyle || {};
  const cadence = ls.cadence || 'week';
  const tiles = React.useMemo(() => offeredSleepGroups(stayTiers).map((g) => ({ ...g, Icon: SLEEP_ICONS[g.key] })), [stayTiers]);
  const group = sleepGroupOf(stay);
  const tile = tiles.find((g) => g.key === group) || null;
  const kinds = tile ? optionsFor(tile) : [];
  const preset = matchProfile(ls);
  const [tuned, setTuned] = React.useState(false);
  const sleepRef = React.useRef(null);
  const eatRef = React.useRef(null);
  useRovingRadios(sleepRef);
  useRovingRadios(eatRef);
  const setCount = (key, v) => onLifestyle({ ...ls, [key]: v });
  const maxFor = (key) => PERIOD_FIELDS.find((f) => f.key === key).max[cadence];

  return (
    <div className="sst-spend">
      {tiles.length > 1 && (
        <div className="sst-group">
          <h3 className="sst-label" id="sst-sleep">{t('studio.sleep')}</h3>
          <div ref={sleepRef} className="sst-tiles sst-tiles-3" role="radiogroup" aria-labelledby="sst-sleep" onKeyDown={radioGroupKeyDown}>
            {tiles.map((g) => (
              <Tile key={g.key} radio on={group === g.key} Icon={g.Icon} label={t(g.labelKey)}
                onClick={() => { if (!g.offered.includes(stay)) onStay(tierForGroup(g, stay)); }} />
            ))}
          </div>
          {kinds.length > 1 && (
            <Segmented
              label={t(tile.askKey)}
              size="sm"
              block
              className="sst-kind"
              value={stay === 'hotel' ? 'hotel3' : stay}
              onChange={onStay}
              options={kinds.map((o) => ({ value: o.tier, label: t(o.labelKey) }))}
            />
          )}
        </div>
      )}

      <div className="sst-group">
        <h3 className="sst-label" id="sst-eat">{t('studio.eat')}</h3>
        <div ref={eatRef} className="sst-tiles sst-tiles-3" role="radiogroup" aria-labelledby="sst-eat" onKeyDown={radioGroupKeyDown}>
          {Object.keys(PROFILES).map((name) => (
            <Tile key={name} radio on={preset === name} Icon={PROFILE_ICONS[name]} label={t(PROFILE_LABEL_KEYS[name] || name)}
              onClick={() => onLifestyle({ ...PROFILES[name] })} />
          ))}
        </div>
        {!preset && <p className="sst-hint">{t('lifestyle.customNote')}</p>}
      </div>

      <div className="sst-group">
        <button type="button" className="sst-fold" aria-expanded={tuned} aria-controls="sst-tune" onClick={() => setTuned(!tuned)}>
          {t('lifestyle.fineTune')}
          <HouseIcon.next size={16} className="sst-fold-chev" />
        </button>
        {tuned && (
          <div className="sst-tune" id="sst-tune">
            <Segmented
              label={t('studio.cadence')}
              size="sm"
              block
              value={cadence}
              onChange={(c) => onLifestyle(toCadence(ls, c))}
              options={[{ value: 'week', label: t('lifestyle.perWeek') }, { value: 'day', label: t('lifestyle.perDay') }]}
            />
            <Count label={t('lifestyle.dinnersOut')} value={ls.dinners_per_week ?? 0} max={maxFor('dinners_per_week')} onChange={(v) => setCount('dinners_per_week', v)} />
            <Count label={t('lifestyle.casualMeals')} value={ls.lunches_per_week ?? 0} max={maxFor('lunches_per_week')} onChange={(v) => setCount('lunches_per_week', v)} />
            <Count label={t('lifestyle.fastFood')} value={ls.fastfood_per_week ?? 0} max={maxFor('fastfood_per_week')} onChange={(v) => setCount('fastfood_per_week', v)} />
            <Count label={t('lifestyle.cookAtHome')} value={ls.self_catered_days_per_week ?? 0} max={maxFor('self_catered_days_per_week')} onChange={(v) => setCount('self_catered_days_per_week', v)} />
            <Count label={t('lifestyle.drinksAtBars')} value={ls.drinks_per_week ?? 0} max={maxFor('drinks_per_week')} onChange={(v) => setCount('drinks_per_week', v)} />
            {/* Always a day count, whatever the cadence: nobody plans coffee by the week. */}
            <Count label={t('lifestyle.coffeesPerDay')} value={ls.coffees_per_day ?? 0} max={COFFEE_MAX} onChange={(v) => setCount('coffees_per_day', v)} />
            <Count label={t('lifestyle.clubNights')} value={ls.club_nights_per_week ?? 0} max={maxFor('club_nights_per_week')} onChange={(v) => setCount('club_nights_per_week', v)} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One choice tile, the wizard's shared look: the icon over its word, the
 * selected one on the umber tint with an umber edge and a tick disc inside
 * its top right corner (never colour alone). `radio` gives a radio in a
 * radiogroup; otherwise a toggle (aria-pressed). `tag` is a small mark on
 * the tile's bottom row, clear of the icon and the word (the way Explore
 * prices with).
 */
export function Tile({ on, Icon, label, onClick, radio = false, disabled = false, tag = null, wide = false }) {
  const a11y = radio ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on };
  return (
    <button
      type="button"
      className={`sst-tile${on ? ' is-on' : ''}${wide ? ' is-wide' : ''}`}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      {...a11y}
    >
      {Icon && <span className="sst-tile-ic" aria-hidden="true"><Icon size={22} /></span>}
      <span className="sst-tile-label">{label}</span>
      {tag && <span className="sst-tile-tag">{tag}</span>}
      <span className="sst-tile-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
    </button>
  );
}

// One count with the shared Stepper (two 44 px buttons, T401). A count can be
// fractional right after a week to day switch (0.4 dinners a day); a step
// lands on the next whole number in that direction.
function Count({ label, value, max, onChange }) {
  const { t } = useI18n();
  const step = (next) => onChange(next > value ? Math.min(max, Math.floor(value) + 1) : Math.max(0, Math.ceil(value) - 1));
  return (
    <div className="sst-count">
      <span className="sst-count-label">{label}</span>
      <CountStepper value={value} min={0} max={max} onChange={step} ariaLabel={label}
        decLabel={t('lifestyle.decrease', { label })} incLabel={t('lifestyle.increase', { label })} />
    </div>
  );
}

/** The draft's bed and food shares at the middle place, for the cost bar's
 *  two segments: the median of each part over the places the engine prices.
 *  The figure itself is styleDayEur's, so it matches the overview's card. */
function shares(style, destinations) {
  if (!style || !destinations) return null;
  const req = priceRequest({ choices: { ...choicesFromStyle(style), price_view: 'pp', price_excluded: [] } });
  const bed = [];
  const food = [];
  for (const a of priceDays(destinations, req).values()) {
    if (a && Number.isFinite(a.stayEur) && Number.isFinite(a.foodEur)) { bed.push(a.stayEur); food.push(a.foodEur); }
  }
  if (!bed.length) return null;
  const mid = (xs) => { xs.sort((x, y) => x - y); const i = Math.floor(xs.length / 2); return xs.length % 2 ? xs[i] : (xs[i - 1] + xs[i]) / 2; };
  const b = mid(bed);
  const f = mid(food);
  return b + f > 0 ? { bed: b / (b + f), food: f / (b + f) } : null;
}

/**
 * The draft's day figure under step 2: a person's bed and food for a day,
 * large, with the two-part cost bar (bed in the action umber, food and drink
 * in the house food colour). It rolls to a new value once when a tap changes
 * it; a ghost of the final figure holds the width so nothing shifts. With no
 * figure it says Not yet, never a guess.
 */
export function DraftDayFigure({ draft, destinations }) {
  const { t } = useI18n();
  const key = JSON.stringify([draft.who, draft.stay, draft.lifestyle]);
  const fig = React.useMemo(() => styleDayEur(draft, destinations), [key, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- key stands for the priced parts
  const split = React.useMemo(() => shares(draft, destinations), [key, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- key stands for the priced parts
  const shown = useRoll(fig);
  return (
    <div className="sst-dayfig">
      <div className="sst-dayfig-top">
        {fig != null ? (
          <span className="sst-dayfig-num">
            <span className="sst-fig-ghost" aria-hidden="true">{formatMoney(fig, { precision: 'whole' })}</span>
            <span className="sst-fig-val" aria-hidden="true">{formatMoney(shown, { precision: 'whole' })}</span>
            <span className="sr-only">{formatMoney(fig, { precision: 'whole' })}</span>
          </span>
        ) : (
          <NotYet className="sst-dayfig-none" />
        )}
        <span className="sst-dayfig-unit">{t('studio.dayEach')}</span>
      </div>
      {split && (
        <>
          <span className="sst-bar" aria-hidden="true">
            <i className="sst-bar-bed" style={{ flexGrow: split.bed }} />
            <i className="sst-bar-food" style={{ flexGrow: split.food }} />
          </span>
          <span className="sst-legend">
            <span className="sst-legend-item"><i className="sst-dot sst-dot-bed" aria-hidden="true" />{t('studio.legendBed')}</span>
            <span className="sst-legend-item"><i className="sst-dot sst-dot-food" aria-hidden="true" />{t('studio.legendFood')}</span>
          </span>
        </>
      )}
    </div>
  );
}

/** A figure that rolls from where it was to its new value, once; the new
 *  value at once under reduced motion. */
function useRoll(value) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    if (value == null) { setShown(value); from.current = value; return undefined; }
    const start = from.current;
    from.current = value;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (start == null || reduce || start === value) { setShown(value); return undefined; }
    let raf = 0;
    const t0 = performance.now();
    const ms = 320;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      setShown(start + (value - start) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown ?? value;
}
