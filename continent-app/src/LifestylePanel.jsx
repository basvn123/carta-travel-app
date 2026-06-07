import React from 'react';
import { composeTrip, DEFAULT_LIFESTYLE } from './runtime_pricing.js';

/**
 * Lifestyle settings panel - slides in from the left.
 *
 * The user describes how their vacation looks (dinners, casual meals, fast food,
 * bar drinks, club nights, coffees, self-catered days). Each is priced at the
 * chosen destination's real local rates to estimate the on-the-ground spend.
 * Profile presets set everything at once (e.g. a young group that goes clubbing).
 *
 * Frequencies can be read per-week or per-day via the cadence toggle. The six
 * period-counts are stored in whatever cadence is active; switching cadence
 * re-scales them (x7 / div 7) so the trip total stays roughly stable. Coffees
 * are always per-day.
 */

// The six frequencies that follow the week/day cadence. Coffees are excluded
// (always per-day). `max` differs per cadence so the steppers stay sensible.
const PERIOD_FIELDS = [
  { key: 'dinners_per_week',            max: { week: 21, day: 3 } },
  { key: 'lunches_per_week',            max: { week: 21, day: 4 } },
  { key: 'fastfood_per_week',          max: { week: 21, day: 4 } },
  { key: 'drinks_per_week',            max: { week: 40, day: 12 } },
  { key: 'club_nights_per_week',       max: { week: 7,  day: 1 } },
  { key: 'self_catered_days_per_week', max: { week: 7,  day: 1 } },
];

// Per-person presets, defined in the weekly cadence. Picking one keeps the
// user's current cadence (values get converted to match).
const PROFILES = {
  Backpacker:      { cadence: 'week', dinners_per_week: 1, lunches_per_week: 3, fastfood_per_week: 4, drinks_per_week: 4,  club_nights_per_week: 0, coffees_per_day: 1, self_catered_days_per_week: 5 },
  Easygoing:       { ...DEFAULT_LIFESTYLE },
  Foodie:          { cadence: 'week', dinners_per_week: 7, lunches_per_week: 5, fastfood_per_week: 0, drinks_per_week: 5,  club_nights_per_week: 0, coffees_per_day: 2, self_catered_days_per_week: 0 },
  'Cafe & culture':{ cadence: 'week', dinners_per_week: 3, lunches_per_week: 5, fastfood_per_week: 1, drinks_per_week: 3,  club_nights_per_week: 0, coffees_per_day: 3, self_catered_days_per_week: 2 },
  Nightlife:       { cadence: 'week', dinners_per_week: 3, lunches_per_week: 2, fastfood_per_week: 4, drinks_per_week: 12, club_nights_per_week: 3, coffees_per_day: 1, self_catered_days_per_week: 1 },
  Family:          { cadence: 'week', dinners_per_week: 2, lunches_per_week: 4, fastfood_per_week: 3, drinks_per_week: 2,  club_nights_per_week: 0, coffees_per_day: 1, self_catered_days_per_week: 5 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Re-express a lifestyle object in the target cadence, scaling the six
// period-counts (x7 going week->day inverse, div 7 the other way) and clamping
// to each field's max for that cadence. Coffees are untouched.
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
    const keys = PERIOD_FIELDS.map((f) => f.key).concat('coffees_per_day');
    if (keys.every((k) => (wk[k] ?? 0) === (p[k] ?? 0))) return name;
  }
  return null;
}

export function LifestylePanel({ choices, setChoices, previewDest, departDate, returnDate, onClose }) {
  const ls = choices.lifestyle || {};
  const cadence = ls.cadence || 'week';
  const per = cadence === 'day' ? 'per day' : 'per week';

  const setLs = (patch) => setChoices({ ...choices, lifestyle: { ...ls, ...patch } });
  const setProfile = (name) => setChoices({ ...choices, lifestyle: toCadence(PROFILES[name], cadence) });
  const setCadence = (c) => setChoices({ ...choices, lifestyle: toCadence(ls, c) });
  const active = matchProfile(ls);

  const eur = (n) => (n == null ? '-' : `€${Math.round(n).toLocaleString('en-GB')}`);

  const preview = previewDest ? composeTrip(previewDest, departDate, returnDate, choices) : null;
  const nights = preview?.nights || choices.trip_days || 7;
  const g = preview?.ground || null;
  const sourceLabel = {
    numbeo_city: 'city prices',
    numbeo_direct: 'country prices',
    pli_scaled: 'estimated prices',
  }[preview?.price_source] || 'local prices';

  const maxFor = (key) => PERIOD_FIELDS.find((f) => f.key === key).max[cadence];

  return (
    <div className="accom-panel open">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Lifestyle</div>
        <h2 className="panel-city">How you'll spend</h2>
        <div className="panel-country">
          Per person · real local rates · {choices.group_size} {choices.group_size === 1 ? 'person' : 'people'} · {nights} nights
        </div>
      </div>

      <div className="panel-section">
        <div className="section-title">Profile</div>
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
        <div className="footnote">Sets the sliders below - tweak any from there.</div>
      </div>

      <div className="panel-section">
        <div className="section-title">Count frequencies</div>
        <div className="panel-segment">
          <button className={cadence === 'week' ? 'seg-on' : ''} onClick={() => setCadence('week')}>Per week</button>
          <button className={cadence === 'day' ? 'seg-on' : ''} onClick={() => setCadence('day')}>Per day</button>
        </div>
        <div className="footnote">Per day is handy for short city breaks; per week for longer trips.</div>
      </div>

      <div className="panel-section">
        <div className="section-title">Eating</div>
        <Stepper label="Dinners out" hint={`mid-range · ${per}`} value={ls.dinners_per_week ?? 0}
          onChange={(v) => setLs({ dinners_per_week: v })} min={0} max={maxFor('dinners_per_week')} />
        <Stepper label="Casual meals" hint={`cheap restaurant · ${per}`} value={ls.lunches_per_week ?? 0}
          onChange={(v) => setLs({ lunches_per_week: v })} min={0} max={maxFor('lunches_per_week')} />
        <Stepper label="Fast food / street" hint={per} value={ls.fastfood_per_week ?? 0}
          onChange={(v) => setLs({ fastfood_per_week: v })} min={0} max={maxFor('fastfood_per_week')} />
        <Stepper label="Cook-at-home days" hint={`groceries · ${per}`} value={ls.self_catered_days_per_week ?? 0}
          onChange={(v) => setLs({ self_catered_days_per_week: v })} min={0} max={maxFor('self_catered_days_per_week')} />
      </div>

      <div className="panel-section">
        <div className="section-title">Drinking &amp; nightlife</div>
        <Stepper label="Drinks at bars" hint={`beers/wine · ${per}`} value={ls.drinks_per_week ?? 0}
          onChange={(v) => setLs({ drinks_per_week: v })} min={0} max={maxFor('drinks_per_week')} />
        <Stepper label="Club nights" hint={`cover + 3 drinks · ${per}`} value={ls.club_nights_per_week ?? 0}
          onChange={(v) => setLs({ club_nights_per_week: v })} min={0} max={maxFor('club_nights_per_week')} />
        <Stepper label="Coffees" hint="per day" value={ls.coffees_per_day ?? 0}
          onChange={(v) => setLs({ coffees_per_day: v })} min={0} max={8} />
      </div>

      {preview && g ? (
        <div className="panel-section accom-preview">
          <div className="section-title">
            On-the-ground · {previewDest.city}
            <span className="attr-meta" style={{ marginLeft: 8 }}>{sourceLabel}</span>
          </div>
          <Line label="Dinners out" value={eur(g.dinners)} />
          <Line label="Casual meals" value={eur(g.lunches)} />
          <Line label="Fast food / street" value={eur(g.fastfood)} />
          <Line label="Bar drinks" value={eur(g.drinks)} />
          <Line label="Club nights" value={eur(g.clubbing)} />
          <Line label="Coffees" value={eur(g.coffees)} />
          <Line label="Groceries" value={eur(g.groceries)} />
          <div className="line total">
            <span className="lbl"><strong>Per person · {nights} nights</strong></span>
            <span className="v"><strong>{eur(preview.ground_per_person)}</strong></span>
          </div>
          <div className="line">
            <span className="lbl">Whole group ({choices.group_size})</span>
            <span className="v">{eur(preview.ground_total)}</span>
          </div>
          <div className="footnote">
            Flights and accommodation are added separately. Open a destination for the full trip total.
          </div>
        </div>
      ) : (
        <div className="panel-section">
          <p style={{ fontStyle: 'italic', color: 'var(--ink-mute)', fontSize: 13 }}>
            {previewDest ? 'No cost data for this destination.' : 'Select a destination to preview your spend.'}
          </p>
        </div>
      )}
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="line">
      <span className="lbl">{label}</span>
      <span className="v">{value}</span>
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
