import React from 'react';
import { RatingBadge, HiddenGemTag } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { knownFor } from '../lib/knownFor.js';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterSheet } from './ExploreFilterSheet.jsx';
import { useI18n } from '../i18n/index.jsx';
import { count } from '../lib/format.js';
import { isFullRatingRange, FULL_RATING_RANGE } from '../lib/rating.js';
import { FilterIcon, BedIcon, DiningIcon, CalendarIcon } from '../components/Icons.jsx';

/**
 * The Explore page, after the map: the whole catalogue as a photo-forward
 * grid a person can actually read. Instead of an all-in trip price (the fare
 * pipeline is retired from this page), every card answers four things at a
 * glance: what is this place, how good is it (the 0-10 rating), how cheap is
 * it to sleep there and to eat there (two 0-10 indices, 10 = cheapest in the
 * catalogue), and when to go. Opening a card slides in the ExplorePanel.
 *
 * Filters live behind ONE Filters button on every width, opening the same
 * modal sheet the phone always had. The trip-kind rail above the grid keeps
 * editing the same tripKinds state it always did.
 */

const PAGE = 48;

// Inline star, consistent with the app's SVG-only icon rule.
function Star({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
    </svg>
  );
}

const SORTS = [
  { key: 'beauty', labelKey: 'sort.rating' },
  { key: 'stay', labelKey: 'explore.sortStay' },
  { key: 'food', labelKey: 'explore.sortFood' },
  { key: 'name', labelKey: 'sort.az' },
  { key: 'country', labelKey: 'sort.country' },
];

// A grid card is ~300 css px wide; the hero wire ships Wikipedia's 960px
// rendering. Splicing the thumb path down cuts the grid's image bytes to
// roughly a third. 500 because Wikimedia thumbs now come in FIXED sizes only
// (an arbitrary 640 answers 400 "Use thumbnail sizes listed on w.wiki/GHai");
// 500 is on the list and covers a 300 px card to 1.7x DPR.
const cardThumb = (url) => (url && url.includes('/960px-') ? url.replace('/960px-', '/500px-') : url);

/** A tiny labelled 0-10 meter for the card foot. */
function MiniIndex({ icon: Icon, value, label }) {
  if (value == null) return null;
  return (
    <span className="xcard-ix" title={label} aria-label={`${label}: ${value.toFixed(1)}`}>
      <Icon size={12} />
      <span className="xcard-ix-track" aria-hidden="true">
        <span className={`xcard-ix-fill ${value >= 7 ? 'good' : ''}`} style={{ width: `${value * 10}%` }} />
      </span>
      <span className={`xcard-ix-val ${value >= 7 ? 'good' : ''}`}>{value.toFixed(1)}</span>
    </span>
  );
}

const ExploreCard = React.memo(function ExploreCard({ p, selected, fav, onSelect, onToggleFav, t }) {
  const kf = knownFor(p);
  const best = p.climate?.best?.length ? fmtMonthRanges(p.climate.best) : null;
  return (
    <div className={`xcard ${selected ? 'selected' : ''}`}>
      <button className="xcard-hit" onClick={() => onSelect(p.id)} aria-label={t('explore.openDest', { city: p.city })}>
        <span className="xcard-media">
          {p.image
            ? <img className="xcard-img" src={cardThumb(p.image)} alt="" loading="lazy" />
            : <span className="xcard-img xcard-noimg" aria-hidden="true" />}
          {best && (
            <span className="xcard-best" title={t('explore.bestMonthsTitle')}>
              <CalendarIcon size={11} /> {best}
            </span>
          )}
        </span>
        <span className="xcard-body">
          <span className="xcard-name-row">
            <span className="xcard-name">{p.city}</span>
            <RatingBadge rating={p.rating} size="xs" showGem={false} />
          </span>
          <span className="xcard-sub">
            <CountryFlag country={p.iso2} size={11} />
            <span>{p.country}</span>
            {p.rating?.hidden_gem && <HiddenGemTag />}
            {swimRelevant(p) && (
              <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />
            )}
          </span>
          {kf && <span className="xcard-known">{kf}</span>}
          <span className="xcard-foot">
            <MiniIndex icon={BedIcon} value={p.stayIx} label={t('explore.ixStay')} />
            <MiniIndex icon={DiningIcon} value={p.foodIx} label={t('explore.ixFood')} />
          </span>
        </span>
      </button>
      <button
        className={`xcard-star ${fav ? 'on' : ''}`}
        onClick={() => onToggleFav(p.id)}
        aria-label={fav ? t('results.removeShortlist') : t('results.addShortlist')}
        title={fav ? t('results.removeShortlist') : t('results.addShortlist')}
      >
        <Star filled={fav} />
      </button>
    </div>
  );
});

export function ExploreTab({
  data,
  locationQuery, setLocationQuery,
  countryFilter, setCountryFilter,
  tripKinds,
  ratingRange, setRatingRange,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  bigOnly, setBigOnly,
  topPick, setTopPick,
  reachHours, setReachHours, reachAvailable, reachMinutes,
  sortKey, setSortKey,
  showFavOnly, setShowFavOnly,
  favorites, onToggleFav,
  selectedId, onSelect,
  indices,
  isMock = false,
}) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [visible, setVisible] = React.useState(PAGE);
  const sentinelRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  const { rows, availableCountries } = useExploreCatalog({
    data, locationQuery, countryFilter, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey, showFavOnly, favorites,
    indices,
  });

  // New result set: back to one page, back to the top.
  React.useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [rows]);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < rows.length ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length]);

  const activeFilters = [
    countryFilter.length > 0,
    !isFullRatingRange(ratingRange),
    gemOnly, unescoOnly, topBeachOnly, bigOnly, !!topPick,
    reachAvailable && reachHours != null,
  ].filter(Boolean).length;

  const resetAll = () => {
    setCountryFilter([]);
    setRatingRange([...FULL_RATING_RANGE]);
    setGemOnly(false);
    setUnescoOnly(false);
    setTopBeachOnly(false);
    setBigOnly(false);
    setTopPick(null);
    setReachHours(null);
  };

  const favSet = favorites || new Set();

  return (
    <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* The control row: search, sort, the one Filters door, shortlist. */}
        <div className="explore-toolbar">
          <div className="results-search explore-search">
            <svg className="results-search-icon" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="results-search-input"
              placeholder={t('results.searchPlaceholder')}
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              aria-label={t('results.searchAria')}
            />
            {locationQuery && (
              <button
                className="results-search-clear"
                onClick={() => setLocationQuery('')}
                aria-label={t('results.clearSearch')}
              >
                ×
              </button>
            )}
          </div>

          <div className="explore-toolbar-right">
            <div className="results-sort explore-sort" role="group" aria-label={t('explore.sortAria')}>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  className={(sortKey === s.key || (s.key === 'beauty' && sortKey === 'price')) ? 'on' : ''}
                  onClick={() => setSortKey(s.key)}
                >
                  {t(s.labelKey)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`explore-filter-btn ${activeFilters > 0 ? 'has-active' : ''}`}
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
            >
              <FilterIcon size={14} />
              <span>{t('filter.filters')}</span>
              {activeFilters > 0 && <span className="filter-tray-badge">{activeFilters}</span>}
            </button>

            <button
              className={`fav-filter explore-fav ${showFavOnly ? 'on' : ''}`}
              onClick={() => setShowFavOnly(!showFavOnly)}
              title={t('results.showShortlist')}
              aria-pressed={showFavOnly}
            >
              <Star filled={showFavOnly} />
              <span>{favSet.size}</span>
            </button>
          </div>
        </div>

        {/* What the grid currently shows, as a sentence with the number in
            mono: the same honesty contract as the filter sheet's footer. */}
        <p className="explore-count">
          {rows.length === 0
            ? (showFavOnly ? t('results.emptyFav') : t('results.empty'))
            : t(rows.length === 1 ? 'explore.countOne' : 'explore.countMany', { n: count(rows.length) })}
          {rows.length > 0 && <span className="explore-legend">{t('explore.ixLegend')}</span>}
          {isMock && <span className="explore-mock">Mock data</span>}
        </p>

        <div className="explore-grid">
          {rows.slice(0, visible).map((p) => (
            <ExploreCard
              key={p.id}
              p={p}
              selected={p.id === selectedId}
              fav={favSet.has(p.id)}
              onSelect={onSelect}
              onToggleFav={onToggleFav}
              t={t}
            />
          ))}
        </div>

        {visible < rows.length && (
          <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
        )}
      </div>

      {sheetOpen && (
        <ExploreFilterSheet
          onClose={() => setSheetOpen(false)}
          countryFilter={countryFilter}
          setCountryFilter={setCountryFilter}
          availableCountries={availableCountries}
          ratingRange={ratingRange}
          setRatingRange={setRatingRange}
          gemOnly={gemOnly}
          setGemOnly={setGemOnly}
          unescoOnly={unescoOnly}
          setUnescoOnly={setUnescoOnly}
          topBeachOnly={topBeachOnly}
          setTopBeachOnly={setTopBeachOnly}
          bigOnly={bigOnly}
          setBigOnly={setBigOnly}
          topPick={topPick}
          setTopPick={setTopPick}
          reachHours={reachHours}
          setReachHours={setReachHours}
          reachAvailable={reachAvailable}
          activeFilters={activeFilters}
          resetAll={resetAll}
          resultCount={rows.length}
        />
      )}
    </div>
  );
}
