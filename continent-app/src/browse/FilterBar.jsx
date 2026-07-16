import React from 'react';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { PlaneIcon, CarIcon } from '../components/TransportIcons.jsx';
import { CalendarIcon, FilterIcon, LifestyleIcon } from '../components/Icons.jsx';
import { eur } from '../lib/format.js';

export function FilterBar({
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
  minTier, setMinTier,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  topPick, setTopPick,
  onOpenLifestyle,
}) {
  const baggageOpts = data?.meta?.baggage_options || {};

  // Mobile-only: the dense filter set collapses behind a filter icon, and the
  // depart/return pickers collapse behind a separate calendar icon. On desktop
  // the CSS keeps everything always visible and hides these triggers, so this
  // state is inert there.
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const [mobileDatesOpen, setMobileDatesOpen] = React.useState(false);
  const datesAnchorRef = React.useRef(null);

  const openMobileDates = () => { setMobileDatesOpen((v) => !v); setMobileFiltersOpen(false); };
  const openMobileFilters = () => { setMobileFiltersOpen((v) => !v); setMobileDatesOpen(false); };

  // Close the dates popover on an outside click (the filter sheet stays open
  // until its own toggle is pressed again, matching its prior behavior).
  React.useEffect(() => {
    if (!mobileDatesOpen) return;
    const onClickOutside = (e) => {
      if (datesAnchorRef.current && !datesAnchorRef.current.contains(e.target)) setMobileDatesOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [mobileDatesOpen]);

  const advancedActiveCount = tripKinds.length > 0 ? 1 : 0;
  const beautyActive = (minTier > 0) || unescoOnly || topBeachOnly;

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
    setMinTier(0);
    setUnescoOnly(false);
    setTopBeachOnly(false);
    setTopPick(null);
    if (priceBounds) setPriceRange(priceBounds);
  };

  const onDepartChange = (v) => {
    setDepartDate(v);
    // If return is now <= depart, push it forward by 7 days
    if (v && returnDate && returnDate <= v) {
      const d = new Date(v + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      const next = d.toISOString().slice(0, 10);
      setReturnDate(dateBounds?.max && next > dateBounds.max ? dateBounds.max : next);
    }
  };

  // Typing a number of nights moves the return date: nights stays an honest
  // derivative of the dates (pricing reads the dates), but is now editable
  // directly instead of only via two calendar taps.
  const onNightsCommit = (n) => {
    const base = departDate || dateBounds?.min;
    if (!base) return;
    const d = new Date(base + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    let next = d.toISOString().slice(0, 10);
    if (dateBounds?.max && next > dateBounds.max) next = dateBounds.max;
    if (!departDate) setDepartDate(base);
    setReturnDate(next);
  };

  // "Top picks" quick shortcuts: show only the best N by price or beauty.
  // Short labels keep the trigger narrow so the filter bar stays two tidy rows.
  const TOP_PICKS = [
    { value: 'all', label: 'All' },
    { value: 'price.10', label: '10 cheapest' },
    { value: 'price.25', label: '25 cheapest' },
    { value: 'beauty.10', label: '10 best rated' },
    { value: 'beauty.25', label: '25 best rated' },
  ];
  const topPickValue = topPick ? `${topPick.by}.${topPick.n}` : 'all';
  const onTopPick = (v) => {
    if (v === 'all') { setTopPick(null); return; }
    const [by, n] = v.split('.');
    setTopPick({ by, n: parseInt(n, 10) });
  };

  // Minimum rating tier (0 = Any/off). Tiers follow the Michelin Green Guide
  // idiom (rating_layer.py): 1 = worth a visit, 2 = worth a detour,
  // 3 = worth the journey - so each step reads as advice, not a number.
  const RATING_STEPS = [
    { v: 0, label: 'Any', title: 'Any rating' },
    { v: 1, label: 'Visit', title: 'Worth a visit or better (rated 5.5+)' },
    { v: 2, label: 'Detour', title: 'Worth a detour or better (rated 7+)' },
    { v: 3, label: 'Journey', title: 'Worth the journey (rated 8.5+)' },
  ];

  return (
    <div className={`filter-bar ${mobileFiltersOpen ? 'mobile-open' : 'mobile-collapsed'}`}>
      {/* Header wrapper is `display: contents` on desktop (so its content stays a
          direct flex child) and a real flex row on mobile (the calendar/filter
          icon triggers - brand and account now live in the always-mounted
          AppHeader above this bar). */}
      <div className="filter-mobile-header">
        <div className="mobile-header-actions">
          <div className="mobile-dates-anchor" ref={datesAnchorRef}>
            <button
              className={`icon-btn ${mobileDatesOpen ? 'open' : ''}`}
              onClick={openMobileDates}
              aria-expanded={mobileDatesOpen}
              aria-label="Dates"
              title="Depart & return dates"
            >
              <CalendarIcon size={18} />
            </button>

            {mobileDatesOpen && (
              <div className="mobile-dates-pop">
                <div className="filter">
                  <label className="filter-label">Depart</label>
                  <div className="filter-control">
                    <DateField
                      value={departDate || ''}
                      min={dateBounds?.min}
                      max={dateBounds?.max}
                      onChange={onDepartChange}
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
              </div>
            )}
          </div>

          <button
            className={`icon-btn ${mobileFiltersOpen ? 'open' : ''} ${anyFilterActive ? 'has-active' : ''}`}
            onClick={openMobileFilters}
            aria-expanded={mobileFiltersOpen}
            aria-label="Filters"
            title="Filters"
          >
            <FilterIcon size={18} />
            {anyFilterActive && <span className="icon-btn-dot" aria-hidden="true" />}
          </button>

          {onOpenLifestyle && (
            <button
              className="icon-btn"
              onClick={() => { setMobileFiltersOpen(false); setMobileDatesOpen(false); onOpenLifestyle(); }}
              aria-label="Lifestyle settings"
              title="Lifestyle: how you'll eat, drink and spend"
            >
              <LifestyleIcon size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Desktop layout: two rows, each divided into labelled category groups
          (a `.filter-group` per category, a `.filter-divider` between them). The
          row uses `justify-content: space-between` so the groups spread across
          the full width of the top panel. On mobile every `.filter-group` is
          `display: contents`, so the individual `.filter` children fall straight
          into the 2-column grid and the grouping/dividers disappear. */}
      <div className="filter-rows">

        {/* ── Row 1 · WHEN & WHO ── */}
        <div className="filter-row">
          {/* Dates */}
          <div className="filter-group group-dates">
            <div className="group-fields">
              <div className="filter row-date-fields">
                <label className="filter-label">Depart</label>
                <div className="filter-control">
                  <DateField
                    value={departDate || ''}
                    min={dateBounds?.min}
                    max={dateBounds?.max}
                    onChange={onDepartChange}
                  />
                </div>
              </div>

              <div className="filter row-date-fields">
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

              <div className="filter filter-nights">
                <label className="filter-label">Nights</label>
                <div className="filter-control">
                  <NumberField
                    value={choices.trip_days || 0}
                    min={1}
                    max={60}
                    onCommit={onNightsCommit}
                    ariaLabel="Nights"
                    title="Trip length; changing it moves the return date"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Party */}
          <div className="filter-group group-party">
            <div className="group-fields">
              <div className="filter filter-people">
                <label className="filter-label">People</label>
                <div className="filter-control">
                  <NumberField
                    value={choices.group_size}
                    min={1}
                    max={20}
                    onCommit={(v) => setChoices({ ...choices, group_size: v })}
                    ariaLabel="People"
                  />
                </div>
              </div>

              {/* Baggage only matters when flying: driving has no Ryanair fees to add. */}
              {(choices.transport_mode || 'plane') !== 'car' && (
                <div className="filter filter-baggage">
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
              )}
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Shortcuts */}
          <div className="filter-group group-shortcuts">
            <div className="group-fields">
              {/* Top picks: quick "best of" shortcuts (cheapest / most beautiful) */}
              <div className="filter filter-toppicks">
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

              {/* Lifestyle: how the on-the-ground spend is modelled. Lives here,
                  next to the filters, so it's settable without opening a
                  destination (it used to hide inside the Account panel). */}
              {onOpenLifestyle && (
                <div className="filter filter-lifestyle">
                  <label className="filter-label">Lifestyle</label>
                  <div className="filter-control">
                    <button
                      className="pill-toggle lifestyle-pill"
                      onClick={onOpenLifestyle}
                      title="How you'll eat, drink and spend, priced at local rates"
                    >
                      <LifestyleIcon size={13} /> Set lifestyle
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2 · REFINE ── */}
        <div className="filter-row">
          {/* Pricing: how the trip is costed + the budget window */}
          <div className="filter-group group-pricing">
            <div className="group-fields">
              <div className="filter filter-show">
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

              <div className="filter filter-travelby">
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
                    </button>
                    <button
                      className={choices.transport_mode === 'car' ? 'seg-on' : ''}
                      onClick={() => setChoices({ ...choices, transport_mode: 'car' })}
                      title="Drive to any road-connected destination in Europe; islands stay priced by flight"
                      aria-label="Travel by car"
                    >
                      <CarIcon />
                    </button>
                  </div>
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
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Place */}
          <div className="filter-group group-place">
            <div className="group-fields">
              <div className="filter filter-country">
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
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Quality: the beauty score + independent heritage / coast toggles */}
          <div className="filter-group group-quality">
            <div className="group-fields">
              {/* Traveller rating: a minimum-tier button list over the 0-10 score
                  (evidence-based: beauty index + POI depth + Wikipedia fame). */}
              <div className="filter filter-beauty">
                <label className="filter-label">Rating</label>
                <div className="filter-control">
                  <div className="segmented compact beauty-steps">
                    {RATING_STEPS.map((s) => (
                      <button
                        key={s.v}
                        className={minTier === s.v ? 'seg-on' : ''}
                        onClick={() => setMinTier(s.v)}
                        title={s.title}
                      >
                        {s.v === 0 ? s.label : (
                          <span className="step-gems">
                            <span className="step-tier-gems">
                              {Array.from({ length: s.v }, (_, i) => <GemIcon key={i} filled size={9} />)}
                            </span>
                            {s.label}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Highlights: standalone heritage / coast toggles, kept apart from the
                  beauty rating so each is a clear, independent yes/no filter. */}
              <div className="filter filter-highlights">
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
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Style */}
          <div className="filter-group group-style">
            <div className="group-fields">
              {/* Trip type - a multi-select dropdown, mirroring the Country filter.
                  A compact trigger keeps the bar to two tidy rows; the choices live
                  in a popover instead of wrapping a wide chip block across the row. */}
              <div className="filter filter-triptype">
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

          {/* Kept inline with the filters it clears (rather than pinned to the
              bar's outer edge) so it doesn't crowd the account button, which
              sits in the same top-right corner one row up. */}
          {anyFilterActive && (
            <>
              <div className="filter-divider" aria-hidden="true" />
              <button className="reset-filters-btn" onClick={resetAll}>
                Reset
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// A number input that can be emptied while typing a replacement. Clamping on
// every keystroke made "clear the field, type 3" produce 13 (the cleared
// field snapped back to 1); instead the draft is committed only when it
// parses, and blur restores the last committed value if left empty.
function NumberField({ value, min, max, onCommit, ariaLabel, title }) {
  const [draft, setDraft] = React.useState(null); // null = mirror `value`
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? String(value ?? '')}
      aria-label={ariaLabel}
      title={title}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n)) onCommit(Math.min(max, Math.max(min, n)));
      }}
      onBlur={() => setDraft(null)}
    />
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
