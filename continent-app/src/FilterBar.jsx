import React from 'react';
import { TRIP_KINDS } from './trip_kinds.js';
import { Dropdown } from './Dropdown.jsx';
import { DateField } from './DateField.jsx';
import { GemIcon } from './GemRating.jsx';
import { PlaneIcon, CarIcon } from './TransportIcons.jsx';
import Logo from './Logo.jsx';

export function FilterBar({
  barRef,
  data, choices, setChoices,
  departDate, setDepartDate,
  returnDate, setReturnDate,
  dateBounds,
  stats,
  priceMode, setPriceMode,
  countryFilter, setCountryFilter,
  availableCountries,
  priceRange, setPriceRange,
  priceBounds,
  tripKinds, setTripKinds,
  minBeauty, setMinBeauty,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  topPick, setTopPick,
  lifestyleOpen, onToggleLifestyle,
}) {
  const baggageOpts = data?.meta?.baggage_options || {};
  const eur = (n) => (n == null ? '-' : `€${Math.round(n).toLocaleString('en-GB')}`);

  // Mobile-only: the dense two-row filter set collapses behind a "Filters"
  // button. On desktop the CSS keeps the rows always visible and hides the
  // toggle, so this state is inert there.
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const advancedActiveCount = tripKinds.length > 0 ? 1 : 0;
  const beautyActive = (minBeauty > 1) || unescoOnly || topBeachOnly;

  const anyFilterActive =
    countryFilter !== 'all' ||
    advancedActiveCount > 0 ||
    beautyActive ||
    !!topPick ||
    (priceRange && priceBounds &&
      (priceRange[0] > priceBounds[0] || priceRange[1] < priceBounds[1]));

  const resetAll = () => {
    setCountryFilter('all');
    setTripKinds([]);
    setMinBeauty(1);
    setUnescoOnly(false);
    setTopBeachOnly(false);
    setTopPick(null);
    if (priceBounds) setPriceRange(priceBounds);
  };

  // "Top picks" quick shortcuts: show only the best N by price or beauty.
  // Short labels keep the trigger narrow so the filter bar stays two tidy rows.
  const TOP_PICKS = [
    { value: 'all', label: 'All' },
    { value: 'price.10', label: '10 cheapest' },
    { value: 'price.25', label: '25 cheapest' },
    { value: 'beauty.10', label: '10 prettiest' },
    { value: 'beauty.25', label: '25 prettiest' },
  ];
  const topPickValue = topPick ? `${topPick.by}.${topPick.n}` : 'all';
  const onTopPick = (v) => {
    if (v === 'all') { setTopPick(null); return; }
    const [by, n] = v.split('.');
    setTopPick({ by, n: parseInt(n, 10) });
  };

  // Minimum-gems steps for the Beauty filter (1 = Any/off). Gem tiers are
  // assigned by dataset quantile (beauty_layer.assign_gems) for a balanced
  // spread, so each step keeps a useful number of destinations.
  const BEAUTY_STEPS = [
    { v: 1, label: 'Any' },
    { v: 2, label: '2+' },
    { v: 3, label: '3+' },
    { v: 4, label: '4+' },
    { v: 5, label: '5' },
  ];

  return (
    <div className={`filter-bar ${mobileOpen ? 'mobile-open' : 'mobile-collapsed'}`} ref={barRef}>
      {/* Header wrapper is `display: contents` on desktop (so brand stays a direct
          flex child) and a real flex row on mobile (brand + Filters toggle). */}
      <div className="filter-mobile-header">
        <div className="brand">
          <Logo size={30} className="brand-mark" />
          <div className="brand-text">
            <span className="name">Carta</span>
          </div>
        </div>

        <button
          className={`filter-mobile-toggle more-btn ${mobileOpen ? 'open' : ''} ${anyFilterActive ? 'has-active' : ''}`}
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
        >
          <span>Filters</span>
          {stats && <span className="filter-mobile-count">{stats.priced}</span>}
          <span className="chev">{mobileOpen ? '^' : 'v'}</span>
        </button>
      </div>
      <div className="brand-divider" />

      <div className="filter-rows">
        {/* Row 1: Trip parameters */}
        <div className="filter-row">
          <div className="filter">
            <label className="filter-label">Depart</label>
            <div className="filter-control">
              <DateField
                value={departDate || ''}
                min={dateBounds?.min}
                max={dateBounds?.max}
                onChange={(v) => {
                  setDepartDate(v);
                  // If return is now <= depart, push it forward by 7 days
                  if (v && returnDate && returnDate <= v) {
                    const d = new Date(v + 'T00:00:00Z');
                    d.setUTCDate(d.getUTCDate() + 7);
                    const next = d.toISOString().slice(0, 10);
                    setReturnDate(dateBounds?.max && next > dateBounds.max ? dateBounds.max : next);
                  }
                }}
              />
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">Return</label>
            <div className="filter-control">
              <DateField
                value={returnDate || ''}
                min={departDate || dateBounds?.min}
                max={dateBounds?.max}
                onChange={(v) => setReturnDate(v)}
              />
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">Nights</label>
            <div className="filter-control">
              <div
                className="derived-value"
                title="Derived from depart and return dates"
              >
                {choices.trip_days || 0}
              </div>
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">People</label>
            <div className="filter-control">
              <input type="number" min={1} max={20}
                value={choices.group_size}
                onChange={(e) => setChoices({ ...choices, group_size: Math.min(20, Math.max(1, +e.target.value || 1)) })}
              />
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">Baggage</label>
            <div className="filter-control">
              <Dropdown
                value={choices.baggage_key}
                onChange={(key) => {
                  const opt = baggageOpts[key];
                  setChoices({
                    ...choices,
                    baggage_key: key,
                    baggage_per_direction_eur: opt?.per_direction_eur || 0,
                  });
                }}
                options={Object.entries(baggageOpts).map(([k, v]) => ({
                  value: k,
                  label: v.label,
                  sublabel: v.per_direction_eur > 0 ? `€${v.per_direction_eur}/direction` : 'free',
                }))}
              />
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">Lifestyle</label>
            <div className="filter-control">
              <button
                className={`more-btn ${lifestyleOpen ? 'open' : ''}`}
                onClick={onToggleLifestyle}
                title="Set dinners, drinks, coffees and self-catered days"
              >
                <span>Eating &amp; drinking</span>
                <span className="chev">{lifestyleOpen ? '^' : 'v'}</span>
              </button>
            </div>
          </div>

          {/* Top picks: quick "best of" shortcuts (cheapest / most beautiful) */}
          <div className="filter">
            <label className="filter-label">Top picks</label>
            <div className="filter-control">
              <Dropdown
                value={topPickValue}
                onChange={onTopPick}
                options={TOP_PICKS}
                placeholder="All"
              />
            </div>
          </div>
        </div>

        {/* Row 2: View filters */}
        <div className="filter-row">
          <div className="filter">
            <label className="filter-label">Show</label>
            <div className="filter-control">
              <div className="segmented compact">
                <button
                  className={priceMode === 'total' ? 'seg-on' : ''}
                  onClick={() => setPriceMode('total')}
                >
                  Total
                </button>
                <button
                  className={priceMode === 'pp' ? 'seg-on' : ''}
                  onClick={() => setPriceMode('pp')}
                >
                  Per person
                </button>
              </div>
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">Travel by</label>
            <div className="filter-control">
              <div className="segmented compact seg-icons">
                <button
                  className={(choices.transport_mode || 'plane') === 'plane' ? 'seg-on' : ''}
                  onClick={() => setChoices({ ...choices, transport_mode: 'plane' })}
                  title="Price every trip by Ryanair flight"
                  aria-label="Travel by plane"
                >
                  <PlaneIcon />
                  <span>Plane</span>
                </button>
                <button
                  className={choices.transport_mode === 'car' ? 'seg-on' : ''}
                  onClick={() => setChoices({ ...choices, transport_mode: 'car' })}
                  title="Drive to any road-connected destination in Europe; islands stay priced by flight"
                  aria-label="Travel by car"
                >
                  <CarIcon />
                  <span>Car</span>
                </button>
              </div>
            </div>
          </div>

          <div className="filter">
            <label className="filter-label">Country</label>
            <div className="filter-control">
              <Dropdown
                value={countryFilter}
                onChange={setCountryFilter}
                options={[
                  { value: 'all', label: `All countries (${availableCountries.length})` },
                  ...availableCountries.map(([iso2, name]) => ({ value: iso2, label: name })),
                ]}
                searchPlaceholder="Search country..."
              />
            </div>
          </div>

          {priceBounds && priceRange && (
            <div className="filter price-range">
              <label className="filter-label">
                Price {priceMode === 'pp' ? 'per person' : 'total'}
              </label>
              <div className="filter-control">
                <DualRange
                  min={priceBounds[0]}
                  max={priceBounds[1]}
                  value={priceRange}
                  onChange={setPriceRange}
                  fmt={eur}
                />
              </div>
            </div>
          )}

          <div className="filter-divider" aria-hidden="true" />

          {/* Beauty index: clean minimum-gems button list over the 1-5 gem score
              (evidence-based: UNESCO heritage + Blue Flag beaches + scenery). */}
          <div className="filter">
            <label className="filter-label">Beauty</label>
            <div className="filter-control">
              <div className="segmented compact beauty-steps">
                {BEAUTY_STEPS.map((s) => (
                  <button
                    key={s.v}
                    className={minBeauty === s.v ? 'seg-on' : ''}
                    onClick={() => setMinBeauty(s.v)}
                    title={s.v === 1 ? 'Any beauty rating' : `Only ${s.label}-gem destinations`}
                  >
                    {s.v === 1 ? s.label : (
                      <span className="step-gems">
                        <GemIcon filled size={10} />
                        {s.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Highlights: standalone heritage / coast toggles, kept apart from the
              beauty rating so each is a clear, independent yes/no filter. */}
          <div className="filter">
            <label className="filter-label">Highlights</label>
            <div className="filter-control pill-row">
              <button
                className={`pill-toggle ${unescoOnly ? 'on' : ''}`}
                onClick={() => setUnescoOnly(!unescoOnly)}
                aria-pressed={unescoOnly}
                title="Only destinations with a UNESCO World Heritage Site within ~60 km"
              >
                UNESCO
              </button>
              <button
                className={`pill-toggle ${topBeachOnly ? 'on' : ''}`}
                onClick={() => setTopBeachOnly(!topBeachOnly)}
                aria-pressed={topBeachOnly}
                title="Only strong beach destinations (high Blue Flag density)"
              >
                Top beaches
              </button>
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Trip type — a multi-select dropdown, mirroring the Country filter.
              A compact trigger keeps the bar to two tidy rows; the choices live
              in a popover instead of wrapping a wide chip block across the row. */}
          <div className="filter">
            <label className="filter-label">Trip type</label>
            <div className="filter-control">
              <Dropdown
                multiple
                value={tripKinds}
                onChange={setTripKinds}
                options={TRIP_KINDS.map((k) => ({ value: k.key, label: k.label }))}
                placeholder="All types"
                multiLabel={(vals) =>
                  vals.length === 1
                    ? (TRIP_KINDS.find((k) => k.key === vals[0])?.label || '1 type')
                    : `${vals.length} types`
                }
              />
            </div>
          </div>

        </div>
      </div>

      {anyFilterActive && (
        <button className="reset-filters-btn" onClick={resetAll}>
          Reset
        </button>
      )}
    </div>
  );
}

// Dual-handle range slider
function DualRange({ min, max, value, onChange, fmt, hideValueRow }) {
  const [lo, hi] = value;
  const span = max - min;
  const loPct = span > 0 ? ((lo - min) / span) * 100 : 0;
  const hiPct = span > 0 ? ((hi - min) / span) * 100 : 100;

  const onLo = (e) => {
    const v = Math.min(+e.target.value, hi - 1);
    onChange([v, hi]);
  };
  const onHi = (e) => {
    const v = Math.max(+e.target.value, lo + 1);
    onChange([lo, v]);
  };

  return (
    <div className="dual-range">
      <div className="dual-range-track">
        <div
          className="dual-range-fill"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input type="range" min={min} max={max} value={lo} onChange={onLo} className="dual-range-input" />
        <input type="range" min={min} max={max} value={hi} onChange={onHi} className="dual-range-input" />
      </div>
      {!hideValueRow && (
        <div className="dual-range-vals">
          <span>{fmt(lo)}</span>
          <span>{fmt(hi)}</span>
        </div>
      )}
    </div>
  );
}
