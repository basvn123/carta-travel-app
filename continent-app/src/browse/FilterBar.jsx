import React from 'react';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { PlaneIcon, CarIcon } from '../components/TransportIcons.jsx';
import { CalendarIcon, FilterIcon, LifestyleIcon } from '../components/Icons.jsx';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { NumberField, DualRange } from '../components/FilterControls.jsx';
import {
  isFullRatingRange, FULL_RATING_RANGE, RATING_MAX,
} from '../lib/rating.js';

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
  ratingRange, setRatingRange,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  topPick, setTopPick,
  onOpenLifestyle,
}) {
  const { t } = useI18n();
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
  const beautyActive = !isFullRatingRange(ratingRange) || gemOnly || unescoOnly || topBeachOnly;

  const anyFilterActive =
    countryFilter.length > 0 ||
    advancedActiveCount > 0 ||
    beautyActive ||
    !!topPick ||
    (priceRange && priceBounds &&
      (priceRange[0] > priceBounds[0] || priceRange[1] < priceBounds[1]));

  const resetAll = () => {
    setCountryFilter([]);
    setTripKinds([]);
    setRatingRange([...FULL_RATING_RANGE]);
    setGemOnly(false);
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
    { value: 'all', label: t('filter.all') },
    { value: 'price.10', label: t('filter.cheapestN', { n: 10 }) },
    { value: 'price.25', label: t('filter.cheapestN', { n: 25 }) },
    { value: 'beauty.10', label: t('filter.bestRatedN', { n: 10 }) },
    { value: 'beauty.25', label: t('filter.bestRatedN', { n: 25 }) },
  ];
  const topPickValue = topPick ? `${topPick.by}.${topPick.n}` : 'all';
  const onTopPick = (v) => {
    if (v === 'all') { setTopPick(null); return; }
    const [by, n] = v.split('.');
    setTopPick({ by, n: parseInt(n, 10) });
  };

  // Rating slicer: a dual-handle band over the 0-10 traveller score. The slider
  // works in a 0-100 integer domain (so each step is 0.1 of a point); state is
  // kept in real 0-10 units. A plain 0/5/10 scale sits under the rail; the
  // caption echoes the chosen band as numbers.
  const ratingAxis = [
    { value: 0, label: '0' },
    { value: RATING_MAX * 5, label: '5' },
    { value: RATING_MAX * 10, label: '10' },
  ];
  const [rLo, rHi] = ratingRange;
  const ratingNarrowed = !isFullRatingRange(ratingRange);

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
              aria-label={t('filter.datesAria')}
              title={t('filter.datesTitle')}
            >
              <CalendarIcon size={18} />
            </button>

            {mobileDatesOpen && (
              <div className="mobile-dates-pop">
                <div className="filter">
                  <label className="filter-label">{t('filter.depart')}</label>
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
                  <label className="filter-label">{t('filter.return')}</label>
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
            aria-label={t('filter.filters')}
            title={t('filter.filters')}
          >
            <FilterIcon size={18} />
            {anyFilterActive && <span className="icon-btn-dot" aria-hidden="true" />}
          </button>

          {onOpenLifestyle && (
            <button
              className="icon-btn"
              onClick={() => { setMobileFiltersOpen(false); setMobileDatesOpen(false); onOpenLifestyle(); }}
              aria-label={t('filter.lifestyleAria')}
              title={t('filter.lifestyleTitle')}
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
                <label className="filter-label">{t('filter.depart')}</label>
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
                <label className="filter-label">{t('filter.return')}</label>
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
                <label className="filter-label">{t('filter.nights')}</label>
                <div className="filter-control">
                  <NumberField
                    value={choices.trip_days || 0}
                    min={1}
                    max={60}
                    onCommit={onNightsCommit}
                    ariaLabel={t('filter.nights')}
                    title={t('filter.nightsTitle')}
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
                <label className="filter-label">{t('filter.people')}</label>
                <div className="filter-control">
                  <NumberField
                    value={choices.group_size}
                    min={1}
                    max={20}
                    onCommit={(v) => setChoices({ ...choices, group_size: v })}
                    ariaLabel={t('filter.people')}
                  />
                </div>
              </div>

              {/* Baggage only matters when flying: driving has no Ryanair fees to add. */}
              {(choices.transport_mode || 'plane') !== 'car' && (
                <div className="filter filter-baggage">
                  <label className="filter-label">{t('filter.baggage')}</label>
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
                        sublabel: v.per_direction_eur > 0 ? t('filter.perDirection', { n: v.per_direction_eur }) : t('filter.freeBag'),
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
                <label className="filter-label">{t('filter.topPicks')}</label>
                <div className="filter-control">
                  <Dropdown
                    value={topPickValue}
                    onChange={onTopPick}
                    options={TOP_PICKS}
                    placeholder={t('filter.all')}
                  />
                </div>
              </div>

              {/* Lifestyle: how the on-the-ground spend is modelled. Lives here,
                  next to the filters, so it's settable without opening a
                  destination (it used to hide inside the Account panel). */}
              {onOpenLifestyle && (
                <div className="filter filter-lifestyle">
                  <label className="filter-label">{t('filter.lifestyle')}</label>
                  <div className="filter-control">
                    <button
                      className="pill-toggle lifestyle-pill"
                      onClick={onOpenLifestyle}
                      title={t('filter.setLifestyleTitle')}
                    >
                      <LifestyleIcon size={13} /> {t('filter.setLifestyle')}
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
                <label className="filter-label">{t('filter.show')}</label>
                <div className="filter-control">
                  <div className="segmented compact">
                    <button
                      className={priceMode === 'total' ? 'seg-on' : ''}
                      onClick={() => setPriceMode('total')}
                    >
                      {t('filter.total')}
                    </button>
                    <button
                      className={priceMode === 'pp' ? 'seg-on' : ''}
                      onClick={() => setPriceMode('pp')}
                    >
                      {t('filter.perPerson')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="filter filter-travelby">
                <label className="filter-label">{t('filter.travelBy')}</label>
                <div className="filter-control">
                  <div className="segmented compact seg-icons">
                    <button
                      className={(choices.transport_mode || 'plane') === 'plane' ? 'seg-on' : ''}
                      onClick={() => setChoices({ ...choices, transport_mode: 'plane' })}
                      title={t('filter.byPlaneTitle')}
                      aria-label={t('filter.byPlaneAria')}
                    >
                      <PlaneIcon />
                    </button>
                    <button
                      className={choices.transport_mode === 'car' ? 'seg-on' : ''}
                      onClick={() => setChoices({ ...choices, transport_mode: 'car' })}
                      title={t('filter.byCarTitle')}
                      aria-label={t('filter.byCarAria')}
                    >
                      <CarIcon />
                    </button>
                  </div>
                </div>
              </div>

              {priceBounds && priceRange && (
                <div className="filter price-range">
                  <label className="filter-label">
                    {priceMode === 'pp' ? t('filter.pricePP') : t('filter.priceTotal')}
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
                <label className="filter-label">{t('filter.country')}</label>
                <div className="filter-control">
                  <Dropdown
                    multiple
                    value={countryFilter}
                    onChange={setCountryFilter}
                    options={availableCountries.map(([iso2, name]) => ({ value: iso2, label: name }))}
                    placeholder={t('filter.allCountries', { n: availableCountries.length })}
                    searchPlaceholder={t('filter.searchCountry')}
                    multiLabel={(vals) => {
                      if (vals.length === 1) {
                        const hit = availableCountries.find(([iso2]) => iso2 === vals[0]);
                        return hit ? hit[1] : vals[0];
                      }
                      return t('filter.nCountries', { n: vals.length });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* Quality: the beauty score + independent heritage / coast toggles */}
          <div className="filter-group group-quality">
            <div className="group-fields">
              {/* Traveller rating: a dual-handle band slicer over the 0-10 score
                  (curated appeal + beauty index + POI depth; fame only flags
                  hidden gems). Drag either handle to isolate any band, or flip
                  the hidden-gems toggle to keep only the under-the-radar picks. */}
              <div className="filter filter-beauty">
                <label className="filter-label">{t('filter.rating')}</label>
                <div className="filter-control rating-control">
                  <div className="rating-slider">
                    <DualRange
                      min={0}
                      max={RATING_MAX * 10}
                      value={[Math.round(rLo * 10), Math.round(rHi * 10)]}
                      onChange={([a, b]) => setRatingRange([a / 10, b / 10])}
                      fmt={(v) => (v / 10).toFixed(1)}
                      axis={ratingAxis}
                      ariaLabel={t('filter.rating')}
                      hideValueRow
                    />
                    <div className="rating-band-caption">
                      {ratingNarrowed ? (
                        <span className="rating-band-nums">
                          {rLo.toFixed(1)}<span className="rating-band-dash">–</span>{rHi.toFixed(1)}
                        </span>
                      ) : (
                        <span className="rating-band-any">{t('rating.anyTitle')}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`pill-toggle gem-toggle ${gemOnly ? 'on' : ''}`}
                    onClick={() => setGemOnly(!gemOnly)}
                    aria-pressed={gemOnly}
                    title={t('rating.gemsTitle')}
                  >
                    <GemIcon filled size={9} /> {t('rating.hiddenGemsOnly')}
                  </button>
                </div>
              </div>

              {/* Highlights: standalone heritage / coast toggles, kept apart from the
                  beauty rating so each is a clear, independent yes/no filter. */}
              <div className="filter filter-highlights">
                <label className="filter-label">{t('filter.highlights')}</label>
                <div className="filter-control pill-row">
                  <button
                    className={`pill-toggle ${unescoOnly ? 'on' : ''}`}
                    onClick={() => setUnescoOnly(!unescoOnly)}
                    aria-pressed={unescoOnly}
                    title={t('filter.unescoTitle')}
                  >
                    UNESCO
                  </button>
                  <button
                    className={`pill-toggle ${topBeachOnly ? 'on' : ''}`}
                    onClick={() => setTopBeachOnly(!topBeachOnly)}
                    aria-pressed={topBeachOnly}
                    title={t('filter.topBeachesTitle')}
                  >
                    {t('filter.topBeaches')}
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
                <label className="filter-label">{t('filter.tripType')}</label>
                <div className="filter-control">
                  <Dropdown
                    multiple
                    value={tripKinds}
                    onChange={setTripKinds}
                    options={TRIP_KINDS.map((k) => ({ value: k.key, label: k.label }))}
                    placeholder={t('filter.allTypes')}
                    multiLabel={(vals) =>
                      vals.length === 1
                        ? (TRIP_KINDS.find((k) => k.key === vals[0])?.label || t('filter.oneType'))
                        : t('filter.nTypes', { n: vals.length })
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
                {t('filter.reset')}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
