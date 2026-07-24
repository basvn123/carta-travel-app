import React from 'react';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { Dropdown } from '../components/Dropdown.jsx';
import { DateField } from '../components/DateField.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { PlaneIcon, CarIcon } from '../components/TransportIcons.jsx';
import { CalendarIcon, FilterIcon, LifestyleIcon, ChevronDownIcon } from '../components/Icons.jsx';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { NumberField, DualRange } from '../components/FilterControls.jsx';
import {
  isFullRatingRange, FULL_RATING_RANGE, RATING_MIN, RATING_MAX,
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

  // Desktop: everything that NARROWS the result set (budget, place, quality,
  // trip style) lives in a tray that drops below the header, so the bar itself
  // only ever carries the handful of controls that define the trip (when, who,
  // how it's priced). The tray overlays the map rather than growing the header,
  // so opening it never shrinks the map.
  const [trayOpen, setTrayOpen] = React.useState(false);
  const trayWrapRef = React.useRef(null);

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

  // Same for the desktop tray: click anywhere off it (or press Escape) to close.
  // The listener covers the toggle button too, which sits inside the same
  // wrapper, so a second click on the trigger closes rather than reopening.
  React.useEffect(() => {
    if (!trayOpen) return undefined;
    const onClickOutside = (e) => {
      if (trayWrapRef.current && !trayWrapRef.current.contains(e.target)) setTrayOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setTrayOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [trayOpen]);

  const ratingNarrowed = !isFullRatingRange(ratingRange);
  const priceNarrowed = !!(priceRange && priceBounds &&
    (priceRange[0] > priceBounds[0] || priceRange[1] < priceBounds[1]));

  // One count per narrowing control that is actually doing something, shown as
  // a badge on the tray toggle so a filter left on inside a closed tray can
  // never silently explain an empty map.
  const activeFilters = [
    countryFilter.length > 0,
    tripKinds.length > 0,
    ratingNarrowed,
    gemOnly,
    unescoOnly,
    topBeachOnly,
    !!topPick,
    priceNarrowed,
  ].filter(Boolean).length;
  const anyFilterActive = activeFilters > 0;

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

      {/* Desktop layout: ONE always-visible row that defines the trip (when,
          who, how it's priced), plus a tray holding everything that narrows the
          result set. The tray is absolutely positioned over the map, so opening
          it never grows the header or shrinks the map. On mobile every
          `.filter-group` / `.filter-tray` is `display: contents`, so the
          individual `.filter` children fall straight into the sheet's 2-column
          grid and the desktop grouping disappears. */}
      <div className="filter-rows">

        <div className="filter-row filter-row-primary">
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
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="filter-divider" aria-hidden="true" />

          {/* How the trip is costed: both of these repaint every label on the
              map, so they stay on the always-visible row. */}
          <div className="filter-group group-pricing">
            <div className="group-fields">
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

            </div>
          </div>

          {/* Everything that narrows the map lives behind this one trigger.
              The tray is a sibling of the button (same wrapper) so a click on
              either counts as "inside" for the outside-click close. */}
          <div className="filter-actions" ref={trayWrapRef}>
            <button
              type="button"
              className={`filter-tray-btn ${trayOpen ? 'open' : ''} ${anyFilterActive ? 'has-active' : ''}`}
              onClick={() => setTrayOpen((v) => !v)}
              aria-expanded={trayOpen}
              title={t('filter.refineTitle')}
            >
              <FilterIcon size={14} />
              <span>{t('filter.filters')}</span>
              {anyFilterActive && <span className="filter-tray-badge">{activeFilters}</span>}
              <ChevronDownIcon size={12} className="filter-tray-caret" />
            </button>

            {anyFilterActive && (
              <button className="reset-filters-btn" onClick={resetAll}>
                {t('filter.reset')}
              </button>
            )}

            {/* Rendered even while closed: on mobile this whole wrapper turns
                into `display: contents` and its fields drop into the filter
                sheet's grid, where `is-open` plays no part. */}
            <div className={`filter-tray ${trayOpen ? 'is-open' : ''}`}>
              <div className="filter-tray-inner">
                <div className="filter-row filter-row-refine">

                  {/* Budget: the spend window and the "just show me the best"
                      shortcuts, plus how on-the-ground spend is modelled. */}
                  <div className="filter-group group-budget">
                    <div className="group-caption">{t('filter.groupBudget')}</div>
                    <div className="group-fields">
                      {priceBounds && priceRange && (
                        <div className="filter price-range">
                          <label className="filter-label">
                            {priceMode === 'pp' ? t('filter.pricePP') : t('filter.priceTotal')}
                          </label>
                          <div className="filter-control band-control">
                            <div className="band-slider">
                              <DualRange
                                min={priceBounds[0]}
                                max={priceBounds[1]}
                                value={priceRange}
                                onChange={setPriceRange}
                                fmt={eur}
                                hideValueRow
                              />
                            </div>
                            <div className={`range-band-box ${priceNarrowed ? 'is-narrowed' : ''}`}>
                              {priceNarrowed ? (
                                <span className="range-band-nums">
                                  {eur(priceRange[0])}<span className="range-band-dash">to</span>{eur(priceRange[1])}
                                </span>
                              ) : (
                                <span className="range-band-any">{t('filter.anyPrice')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Top picks: quick "best of" shortcuts (cheapest / best rated) */}
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

                      {/* Lifestyle: how the on-the-ground spend is modelled. Lives
                          here, next to the filters, so it's settable without opening
                          a destination (it used to hide inside the Account panel). */}
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

                  {/* Quality: the beauty score + independent heritage / coast toggles */}
                  <div className="filter-group group-quality">
                    <div className="group-caption">{t('filter.groupQuality')}</div>
                    <div className="group-fields">
                      {/* Traveller rating: a dual-handle band slicer over the 0-10
                          score (curated appeal + beauty index + POI depth; fame only
                          flags hidden gems). Drag either handle to isolate any band,
                          or flip the hidden-gems toggle to keep only the
                          under-the-radar picks. */}
                      <div className="filter filter-beauty">
                        <label className="filter-label">{t('filter.rating')}</label>
                        <div className="filter-control band-control">
                          <div className="band-slider">
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
                          </div>
                          <div className={`range-band-box ${ratingNarrowed ? 'is-narrowed' : ''}`}>
                            <span className="range-band-nums">
                              {ratingNarrowed ? rLo.toFixed(1) : RATING_MIN}
                              <span className="range-band-dash">to</span>
                              {ratingNarrowed ? rHi.toFixed(1) : RATING_MAX}
                            </span>
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

                      {/* Highlights: standalone heritage / coast toggles, kept apart
                          from the rating so each is a clear, independent yes/no. */}
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

                  {/* Place */}
                  <div className="filter-group group-place">
                    <div className="group-caption">{t('filter.groupWhere')}</div>
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

                  {/* Style: what kind of trip it should be. A multi-select
                      dropdown, mirroring Country, so the choices live in a
                      popover instead of wrapping a wide chip block. */}
                  <div className="filter-group group-style">
                    <div className="group-caption">{t('filter.groupStyle')}</div>
                    <div className="group-fields">
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
                </div>

                {/* Desktop-only footer: says what the tray is currently doing to
                    the map, and closes it. Hidden inside the mobile sheet, which
                    has its own dismiss. */}
                <div className="filter-tray-foot">
                  <span className="filter-tray-note">
                    {!anyFilterActive
                      ? t('filter.noneActive')
                      : t(activeFilters === 1 ? 'filter.nActiveOne' : 'filter.nActiveMany', { n: activeFilters })}
                  </span>
                  <button
                    type="button"
                    className="filter-tray-done"
                    onClick={() => setTrayOpen(false)}
                  >
                    {t('filter.done')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
