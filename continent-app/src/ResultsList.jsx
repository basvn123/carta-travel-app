import React, { useMemo, useState } from 'react';
import { GemRating } from './GemRating.jsx';

/**
 * Ranked, sortable list of priced destinations - lives in the left gutter the
 * map layout already reserves. Click an item to open its detail panel; star it
 * to add it to the shortlist (favorites), which can then be compared.
 */

// Inline star (SVG, not an emoji - keeps rendering consistent and ASCII source).
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
  { key: 'price', label: 'Price', dir: 'asc', directional: true },
  { key: 'beauty', label: 'Beauty', dir: 'desc', directional: true },
  { key: 'name', label: 'A-Z', dir: 'asc' },
  { key: 'country', label: 'Country', dir: 'asc' },
];
const SORT_DEFAULT_DIR = Object.fromEntries(SORTS.map((s) => [s.key, s.dir]));

export function ResultsList({
  priced, unreachable = [], priceMode = 'total', dealThreshold,
  selectedId, onSelect,
  favorites, onToggleFav,
  sortKey, setSortKey,
  showFavOnly, setShowFavOnly,
  onOpenCompare,
  reachableCount, totalCount, homeCity = 'Brussels', transportMode = 'plane',
}) {
  const favSet = favorites || new Set();
  const [copied, setCopied] = useState(false);
  // Direction per sort key; price/beauty can be flipped, the rest stay default.
  const [sortDir, setSortDir] = useState(SORT_DEFAULT_DIR);

  // Click a sort: switch to it, or — if it's already active and directional —
  // flip its direction.
  const onSortClick = (s) => {
    if (sortKey === s.key && s.directional) {
      setSortDir((d) => ({ ...d, [s.key]: d[s.key] === 'asc' ? 'desc' : 'asc' }));
    } else {
      setSortKey(s.key);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked - the URL bar still holds the shareable link */ }
  };

  const rows = useMemo(() => {
    let list = priced;
    if (showFavOnly) list = list.filter((p) => favSet.has(p.id));
    const val = (p) => (priceMode === 'pp' ? p.pp : p.total);
    const beautyVal = (p) => (p.beauty?.score ?? 0);
    const sorted = [...list];
    if (sortKey === 'name') sorted.sort((a, b) => a.city.localeCompare(b.city));
    else if (sortKey === 'country') sorted.sort((a, b) => a.country.localeCompare(b.country) || val(a) - val(b));
    else if (sortKey === 'beauty') sorted.sort((a, b) => beautyVal(a) - beautyVal(b) || val(a) - val(b));
    else sorted.sort((a, b) => val(a) - val(b));
    // Base sorts above are all ascending; flip to descending on demand. Beauty
    // defaults to 'desc' (most beautiful first) — see SORTS.
    const dir = sortDir[sortKey] || SORT_DEFAULT_DIR[sortKey];
    if (dir === 'desc') sorted.reverse();
    return sorted;
  }, [priced, showFavOnly, sortKey, priceMode, favSet, sortDir]);

  const eur = (n) => (n == null ? '-' : `€${Math.round(n).toLocaleString('en-GB')}`);

  return (
    <div className="results-list">
      <div className="results-head">
        <div className="results-title">
          {showFavOnly ? 'Shortlist' : 'Destinations'}
          <span className="results-count">{rows.length}</span>
        </div>
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
                  title={s.directional && active ? 'Click to flip direction' : undefined}
                >
                  {s.label}
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
            title="Show only your shortlist"
          >
            <Star filled={showFavOnly} />
            <span>{favSet.size}</span>
          </button>
        </div>
      </div>

      <div className="results-actions">
        {favSet.size >= 2 && (
          <button className="results-compare" onClick={onOpenCompare}>
            Compare ({favSet.size})
          </button>
        )}
        <button className="results-share" onClick={share}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>

      <div className="results-scroll">
        {rows.length === 0 ? (
          <div className="results-empty">
            {showFavOnly
              ? 'No destinations starred yet. Tap the star on any result to build a shortlist.'
              : 'No destinations match these filters.'}
          </div>
        ) : (
          rows.map((p, i) => {
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
                    {p.city}
                    {p.tier === 'gem' && <span className="result-gem">gem</span>}
                  </span>
                  <span className="result-sub">
                    <span className="result-country">{p.country}</span>
                    {p.beauty?.gems > 0 && (
                      <GemRating value={p.beauty.gems} score={p.beauty.score} size="xs" />
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
                  aria-label={fav ? 'Remove from shortlist' : 'Add to shortlist'}
                  title={fav ? 'Remove from shortlist' : 'Add to shortlist'}
                >
                  <Star filled={fav} />
                </button>
              </div>
            );
          })
        )}

        {!showFavOnly && unreachable.length > 0 && (
          <div className="results-unreachable">
            <div className="results-subhead">
              Unreachable via Ryanair
              <span className="results-count">{unreachable.length}</span>
            </div>
            <div className="results-subnote">
              No Ryanair route from {homeCity} and too far to drive - shown for reference.
            </div>
            {unreachable.map((p) => {
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
                      {p.city}
                      {p.tier === 'gem' && <span className="result-gem">gem</span>}
                    </span>
                    <span className="result-country">{p.country}</span>
                  </span>
                  <span className="result-noroute">no route</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
