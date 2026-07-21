import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RatingBadge, HiddenGemTag } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';

/**
 * Ranked, sortable list of priced destinations, lives in the left gutter the
 * map layout already reserves. Click an item to open its detail panel; star it
 * to add it to the shortlist (favorites), which can then be compared.
 */

// How many rows to reveal per page. The dataset is ~24,800 destinations, so the
// scroll body is windowed (only `visible` rows are in the DOM) and grows a page
// at a time as the user scrolls, instead of mounting tens of thousands of row
// subtrees up front and reconciling them on every keystroke/sort/slider tick.
const PAGE = 60;

// Inline star (SVG, not an emoji, keeps rendering consistent and ASCII source).
function Star({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
    </svg>
  );
}

// `dir` is each sort's default direction; price/beauty also flip on a second
// click (directional: true) so you can read the list either way.
const SORTS = [
  { key: 'price', labelKey: 'sort.price', dir: 'asc', directional: true },
  { key: 'beauty', labelKey: 'sort.rating', dir: 'desc', directional: true },
  { key: 'name', labelKey: 'sort.az', dir: 'asc' },
  { key: 'country', labelKey: 'sort.country', dir: 'asc' },
];
const SORT_DEFAULT_DIR = Object.fromEntries(SORTS.map((s) => [s.key, s.dir]));

// The scroll body, split out and memoized so it does NOT re-render when the
// parent re-renders for something it doesn't care about, above all the search
// input's per-keystroke state (which lives in the header, not here). Combined
// with the windowing below, typing/sorting no longer touches thousands of rows.
const ResultRows = React.memo(function ResultRows({
  rows, unreachable, priceMode, dealThreshold, selectedId, favSet,
  onSelect, onToggleFav, showFavOnly, homeCity, t,
}) {
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const [visible, setVisible] = useState(PAGE);

  const showUnreach = !showFavOnly && unreachable.length > 0;
  const total = rows.length + (showUnreach ? unreachable.length : 0);

  // New filter/sort result -> collapse the window back to one page and jump to
  // the top. (rows only gets a new identity on a real filter/sort change now,
  // not on a fav toggle - see the favDep note in the parent.)
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [rows, unreachable]);

  // Reveal another page whenever the bottom sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < total ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [total]);

  const shownRows = rows.slice(0, visible);
  const shownUnreach = showUnreach ? unreachable.slice(0, Math.max(0, visible - rows.length)) : [];

  return (
    <div className="results-scroll" ref={scrollRef}>
      {rows.length === 0 ? (
        <div className="results-empty">
          {showFavOnly ? t('results.emptyFav') : t('results.empty')}
        </div>
      ) : (
        shownRows.map((p, i) => {
          const isDeal = dealThreshold != null && p.total <= dealThreshold;
          const isSel = p.id === selectedId;
          const fav = favSet.has(p.id);
          return (
            <div
              key={p.id}
              className={`result-row ${isSel ? 'selected' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span className="result-rank">{i + 1}</span>
              <span className="result-main">
                <span className="result-city">
                  <span className="result-city-name">{p.city}</span>
                  {p.rating?.hidden_gem && <HiddenGemTag />}
                </span>
                <span className="result-sub">
                  <span className="result-country">{p.country}</span>
                  <RatingBadge rating={p.rating} size="xs" showGem={false} />
                  {swimRelevant(p) && (
                    <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />
                  )}
                </span>
              </span>
              <span className={`result-price ${isDeal ? 'is-deal' : ''}`}>
                {eur(priceMode === 'pp' ? p.pp : p.total)}
                {priceMode === 'pp' && <small>/pp</small>}
              </span>
              <button
                className={`result-star ${fav ? 'on' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleFav(p.id); }}
                aria-label={fav ? t('results.removeShortlist') : t('results.addShortlist')}
                title={fav ? t('results.removeShortlist') : t('results.addShortlist')}
              >
                <Star filled={fav} />
              </button>
            </div>
          );
        })
      )}

      {showUnreach && visible >= rows.length && (
        <div className="results-unreachable">
          <div className="results-subhead">
            {t('results.unreachable')}
            <span className="results-count">{unreachable.length}</span>
          </div>
          <div className="results-subnote">
            {t('results.unreachableNote', { city: homeCity })}
          </div>
          {shownUnreach.map((p) => {
            const isSel = p.id === selectedId;
            return (
              <div
                key={p.id}
                className={`result-row is-unreachable ${isSel ? 'selected' : ''}`}
                onClick={() => onSelect(p.id)}
              >
                <span className="result-rank" aria-hidden="true" />
                <span className="result-main">
                  <span className="result-city">
                    <span className="result-city-name">{p.city}</span>
                    {p.rating?.hidden_gem && <HiddenGemTag />}
                  </span>
                  <span className="result-country">{p.country}</span>
                </span>
                <span className="result-noroute">{t('results.noRoute')}</span>
              </div>
            );
          })}
        </div>
      )}

      {visible < total && <div ref={sentinelRef} className="results-sentinel" aria-hidden="true" style={{ height: 1 }} />}
    </div>
  );
});

export const ResultsList = React.memo(function ResultsList({
  priced, unreachable = [], priceMode = 'total', dealThreshold,
  locationQuery = '', setLocationQuery,
  selectedId, onSelect,
  favorites, onToggleFav,
  sortKey, setSortKey,
  showFavOnly, setShowFavOnly,
  onOpenCompare,
  reachableCount, totalCount, homeCity = 'Brussels', transportMode = 'plane',
  onCollapse,
}) {
  const { t } = useI18n();
  const favSet = useMemo(() => favorites || new Set(), [favorites]);
  // Direction per sort key; price/beauty can be flipped, the rest stay default.
  const [sortDir, setSortDir] = useState(SORT_DEFAULT_DIR);

  // Click a sort: switch to it, or, if it's already active and directional,   // flip its direction.
  const onSortClick = (s) => {
    if (sortKey === s.key && s.directional) {
      setSortDir((d) => ({ ...d, [s.key]: d[s.key] === 'asc' ? 'desc' : 'asc' }));
    } else {
      setSortKey(s.key);
    }
  };

  // Only depend on favSet when it actually filters the list (fav-only view).
  // Otherwise a star toggle mints a new favSet and would needlessly recompute
  // rows (and reset the scroll window) on every click.
  const favDep = showFavOnly ? favSet : null;
  const rows = useMemo(() => {
    let list = priced;
    if (showFavOnly) list = list.filter((p) => favSet.has(p.id));
    const val = (p) => (priceMode === 'pp' ? p.pp : p.total);
    const beautyVal = (p) => (p.rating?.score ?? p.beauty?.score ?? 0);
    const sorted = [...list];
    if (sortKey === 'name') sorted.sort((a, b) => a.city.localeCompare(b.city));
    else if (sortKey === 'country') sorted.sort((a, b) => a.country.localeCompare(b.country) || val(a) - val(b));
    else if (sortKey === 'beauty') sorted.sort((a, b) => beautyVal(a) - beautyVal(b) || val(a) - val(b));
    else sorted.sort((a, b) => val(a) - val(b));
    // Base sorts above are all ascending; flip to descending on demand. Beauty
    // defaults to 'desc' (most beautiful first), see SORTS.
    const dir = sortDir[sortKey] || SORT_DEFAULT_DIR[sortKey];
    if (dir === 'desc') sorted.reverse();
    return sorted;
    // favSet is read only when showFavOnly is true, and favDep carries it then;
    // depending on favSet directly would recompute on every star toggle.
  }, [priced, showFavOnly, sortKey, priceMode, favDep, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="results-list">
      <div className="results-head">
        <div className="results-title">
          {showFavOnly ? t('results.shortlist') : t('results.destinations')}
          <span className="results-count">{rows.length}</span>
          {onCollapse && (
            <button
              className="results-collapse"
              onClick={onCollapse}
              title={t('results.hideList')}
              aria-label={t('results.hideListAria')}
            >
              ‹
            </button>
          )}
        </div>
        {setLocationQuery && (
          <div className="results-search">
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
                title={t('results.clearSearch')}
              >
                ×
              </button>
            )}
          </div>
        )}

        <div className="results-controls">
          <div className="results-sort">
            {SORTS.map((s) => {
              const active = sortKey === s.key;
              const dir = sortDir[s.key] || SORT_DEFAULT_DIR[s.key];
              return (
                <button
                  key={s.key}
                  className={active ? 'on' : ''}
                  onClick={() => onSortClick(s)}
                  title={s.directional && active ? t('sort.flip') : undefined}
                >
                  {t(s.labelKey)}
                  {active && s.directional && (
                    <span className="sort-arrow" aria-hidden="true">{dir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            className={`fav-filter ${showFavOnly ? 'on' : ''}`}
            onClick={() => setShowFavOnly(!showFavOnly)}
            title={t('results.showShortlist')}
          >
            <Star filled={showFavOnly} />
            <span>{favSet.size}</span>
          </button>
        </div>
      </div>

      {favSet.size >= 2 && (
        <div className="results-actions">
          <button className="results-compare" onClick={onOpenCompare}>
            {t('results.compare', { n: favSet.size })}
          </button>
        </div>
      )}

      <ResultRows
        rows={rows}
        unreachable={unreachable}
        priceMode={priceMode}
        dealThreshold={dealThreshold}
        selectedId={selectedId}
        favSet={favSet}
        onSelect={onSelect}
        onToggleFav={onToggleFav}
        showFavOnly={showFavOnly}
        homeCity={homeCity}
        t={t}
      />
    </div>
  );
});
