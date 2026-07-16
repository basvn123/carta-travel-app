import React from 'react';
import { DEFAULT_LIFESTYLE } from '../lib/runtime_pricing.js';
import { DiningIcon, LifestyleIcon } from '../components/Icons.jsx';

/**
 * Lifestyle settings panel - slides in from the left.
 *
 * The user describes how their vacation looks (dinners, casual meals, fast food,
 * bar drinks, club nights, self-catered days). Each is priced at the chosen
 * destination's real local rates inside the trip breakdown. Profile presets set
 * everything at once (e.g. a young group that goes clubbing).
 *
 * Frequencies can be read per-week or per-day via the cadence toggle. The six
 * period-counts are stored in whatever cadence is active; switching cadence
 * re-scales them (x7 / div 7) so the trip total stays roughly stable.
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
// chip highlight correctly).
const PROFILES = {
  Backpacker:      { cadence: 'week', dinners_per_week: 1, lunches_per_week: 3, fastfood_per_week: 4, drinks_per_week: 4,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5 },
  Easygoing:       { ...DEFAULT_LIFESTYLE },
  Foodie:          { cadence: 'week', dinners_per_week: 7, lunches_per_week: 5, fastfood_per_week: 0, drinks_per_week: 5,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 0 },
  'Cafe & culture':{ cadence: 'week', dinners_per_week: 3, lunches_per_week: 5, fastfood_per_week: 1, drinks_per_week: 3,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 2 },
  Nightlife:       { cadence: 'week', dinners_per_week: 3, lunches_per_week: 2, fastfood_per_week: 4, drinks_per_week: 12, club_nights_per_week: 3, coffees_per_day: 0, self_catered_days_per_week: 1 },
  Family:          { cadence: 'week', dinners_per_week: 2, lunches_per_week: 4, fastfood_per_week: 3, drinks_per_week: 2,  club_nights_per_week: 0, coffees_per_day: 0, self_catered_days_per_week: 5 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Re-express a lifestyle object in the target cadence, scaling the six
// period-counts (x7 going week->day inverse, div 7 the other way) and clamping
// to each field's max for that cadence.
function toCadence(ls, target) {
  const from = ls.cadence || 'week';
  if (from === target) return { ...ls, cadence: target };
  const out = { ...ls, cadence: target };
  for (const f of PERIOD_FIELDS) {
    const v = ls[f.key] || 0;
    const scaled = target === 'day' ? Math.round(v / 7) : v * 7;
    out[f.key] = clamp(scaled, 0, f.max[target]);
  }
  return out;
}

function matchProfile(ls) {
  const wk = toCadence(ls, 'week');
  for (const [name, p] of Object.entries(PROFILES)) {
    const keys = PERIOD_FIELDS.map((f) => f.key);
    if (keys.every((k) => (wk[k] ?? 0) === (p[k] ?? 0))) return name;
  }
  return null;
}

export function LifestylePanel({ choices, setChoices, onClose }) {
  const ls = choices.lifestyle || {};
  const cadence = ls.cadence || 'week';
  const per = cadence === 'day' ? 'per day' : 'per week';

  const setLs = (patch) => setChoices({ ...choices, lifestyle: { ...ls, ...patch } });
  const setProfile = (name) => setChoices({ ...choices, lifestyle: { ...PROFILES[name] } });
  const setCadence = (c) => setChoices({ ...choices, lifestyle: toCadence(ls, c) });
  const active = matchProfile(ls);

  const maxFor = (key) => PERIOD_FIELDS.find((f) => f.key === key).max[cadence];

  return (
    <div className="accom-panel open">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Lifestyle</div>
        <h2 className="panel-city">How you'll spend</h2>
      </div>

      <div className="panel-section">
        <div className="section-title section-title-iconed"><LifestyleIcon size={12} /> Profile</div>
        <div className="kind-chips">
          {Object.keys(PROFILES).map((name) => (
            <button
              key={name}
              className={`chip ${active === name ? 'on' : ''}`}
              onClick={() => setProfile(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section lifestyle-food">
        <div className="lifestyle-section-head">
          <div className="section-title section-title-iconed"><DiningIcon size={12} /> Eating &amp; drinking</div>
          <div className="panel-segment lifestyle-cadence">
            <button className={cadence === 'week' ? 'seg-on' : ''} onClick={() => setCadence('week')}>Per week</button>
            <button className={cadence === 'day' ? 'seg-on' : ''} onClick={() => setCadence('day')}>Per day</button>
          </div>
        </div>
        <Stepper label="Dinners out" hint={per} value={ls.dinners_per_week ?? 0}
          onChange={(v) => setLs({ dinners_per_week: v })} min={0} max={maxFor('dinners_per_week')} />
        <Stepper label="Casual meals" hint={per} value={ls.lunches_per_week ?? 0}
          onChange={(v) => setLs({ lunches_per_week: v })} min={0} max={maxFor('lunches_per_week')} />
        <Stepper label="Fast food" hint={per} value={ls.fastfood_per_week ?? 0}
          onChange={(v) => setLs({ fastfood_per_week: v })} min={0} max={maxFor('fastfood_per_week')} />
        <Stepper label="Cook-at-home days" hint={per} value={ls.self_catered_days_per_week ?? 0}
          onChange={(v) => setLs({ self_catered_days_per_week: v })} min={0} max={maxFor('self_catered_days_per_week')} />
        <Stepper label="Drinks at bars" hint={per} value={ls.drinks_per_week ?? 0}
          onChange={(v) => setLs({ drinks_per_week: v })} min={0} max={maxFor('drinks_per_week')} />
        <Stepper label="Club nights" hint={per} value={ls.club_nights_per_week ?? 0}
          onChange={(v) => setLs({ club_nights_per_week: v })} min={0} max={maxFor('club_nights_per_week')} />
      </div>

      <div className="panel-section">
        <p className="footnote">
          Open a destination to see this priced at its local rates.
        </p>
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, min, max, hint }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="stepper">
      <div className="stepper-label">
        {label}
        {hint && <small className="stepper-hint">{hint}</small>}
      </div>
      <div className="stepper-controls">
        <button onClick={dec} disabled={value <= min} aria-label={`decrease ${label}`}>-</button>
        <span className="stepper-value">{value}</span>
        <button onClick={inc} disabled={value >= max} aria-label={`increase ${label}`}>+</button>
      </div>
    </div>
  );
}
