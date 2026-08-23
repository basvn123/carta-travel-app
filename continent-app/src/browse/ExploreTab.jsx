import React from 'react';
import { ScoreChip, HiddenGemTag, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterSheet } from './ExploreFilterSheet.jsx';
import { CategoryRail } from './CategoryRail.jsx';
import { useI18n } from '../i18n/index.jsx';
import { isFullRatingRange, FULL_RATING_RANGE } from '../lib/rating.js';
import { FilterIcon, CalendarIcon, CameraIcon, ClockIcon, PiggyIcon } from '../components/Icons.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CostLine, CostReceipt } from '../components/CostSummary.jsx';
import { visitLength } from '../lib/nearby.js';
import { placeSights } from '../lib/placeStory.js';
import { knownFor } from '../lib/knownFor.js';

/**
 * The Explore page, after the map: the whole catalogue as a photo-forward
 * grid a person can actually read. Instead of an all-in trip price (the fare
 * pipeline is retired from this page), every card answers four things at a
 * glance: what is this place, how good is it (the rating, and the tier seal
 * that says what the number means), what a day there costs one person in
 * euros, and when to go. Opening a card slides in the ExplorePanel.
 *
 * The card used to end in two 0-10 "cheapness" meters. They are gone, and
 * lib/costIndex.js documents why in full: with 88 distinct food baskets across
 * 3,038 destinations, a one-decimal rank was a country flag wearing a
 * measurement's clothes, and a harvested zero made Geneva the cheapest place
 * in Europe to sleep. A euro figure is smaller, plainer and true.
 *
 * Hovering a card opens a preview with the things the card cannot fit: what
 * to see, how long to stay, the cost split. It follows WCAG 1.4.13, so it is
 * dismissible with Escape, survives the pointer travelling into it, and opens
 * on keyboard focus as well as hover. It never opens on touch, where hover
 * does not exist and the tap already opens the full panel.
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
  { key: 'cost', labelKey: 'explore.sortCost' },
  { key: 'name', labelKey: 'sort.az' },
  { key: 'country', labelKey: 'sort.country' },
];

// How wide the grid draws a card, so the browser can pick a thumbnail instead
// of downloading Wikimedia's 960px rendering for a 300px slot. The widths in
// the srcset are a fixed list Wikimedia will actually render (heroImage.js).
const CARD_SIZES = '(max-width: 768px) 45vw, (max-width: 1180px) 30vw, 280px';

/**
 * The hover preview: what the card cannot fit, now over the whole card
 * rather than just the photo. It repeats the name and rating that the real
 * card body carries underneath (that body is fully covered once the preview
 * spans the card, not just the image), then adds what a glance at the grid
 * cannot show: the season, the sights, how long the place is worth, and the
 * same bed/food receipt the destination panel uses, so a reader who has read
 * one can read the other.
 *
 * WCAG 1.4.13 has three requirements for content shown on hover and this
 * meets all three. Dismissible: Escape closes it without moving the pointer.
 * Hoverable: it is a child of the card, so travelling into it keeps the card
 * hovered and the preview open, with no "safe triangle" needed. Persistent:
 * nothing times it out, it closes when the pointer or the focus leaves.
 */
function CardPreview({ p, t, best }) {
  const stay = visitLength(p);
  const sights = placeSights(p, 3);
  const lead = knownFor(p);
  return (
    <div className="xcard-preview" role="tooltip">
      <div className="xcard-preview-head">
        <span className="xcard-preview-name">{p.city}</span>
        <ScoreChip rating={p.rating} size="xs" />
      </div>
      <p className="xcard-preview-sub">
        <CountryFlag country={p.iso2} size={11} />
        <span>{p.country}</span>
      </p>
      {lead && <p className="xcard-preview-lead">{lead}</p>}
      {sights.length > 0 && (
        <p className="xcard-preview-row">
          <CameraIcon size={12} />
          <span>{sights.join(', ')}</span>
        </p>
      )}
      {stay && (
        <p className="xcard-preview-row">
          <ClockIcon size={12} />
          <span>{t(stay.key, { n: stay.n })}</span>
        </p>
      )}
      {best && (
        <p className="xcard-preview-row">
          <CalendarIcon size={12} />
          <span>{best}</span>
        </p>
      )}
      {p.cost?.dayEur != null && (
        <div className="xcard-preview-cost">
          <CostReceipt cost={p.cost} t={t} compact />
        </div>
      )}
    </div>
  );
}

const ExploreCard = React.memo(function ExploreCard({ p, selected, fav, onSelect, onToggleFav, t }) {
  const kf = knownFor(p);
  const best = p.climate?.best?.length ? fmtMonthRanges(p.climate.best) : null;
  const [preview, setPreview] = React.useState(false);

  // Escape closes the preview without the pointer having to move, which is
  // the "dismissible" half of WCAG 1.4.13.
  React.useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPreview(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview]);

  // Mouse only. On touch there is no hover, and a tap already opens the panel:
  // making the first tap mean "preview" would cost every phone user a second
  // tap to get anywhere.
  const onEnter = (e) => { if (e.pointerType === 'mouse') setPreview(true); };

  return (
    <div
      className={`xcard ${selected ? 'selected' : ''} ${preview ? 'previewing' : ''}`}
      onPointerEnter={onEnter}
      onPointerLeave={() => setPreview(false)}
    >
      <button
        className="xcard-hit"
        onClick={() => onSelect(p.id)}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        aria-label={t('explore.openDest', { city: p.city })}
      >
        <span className="xcard-media">
          <HeroImage
            url={p.image}
            city={p.city}
            iso2={p.iso2}
            className="xcard-img"
            maxWidth={500}
            sizes={CARD_SIZES}
          />
          {best && (
            <span className="xcard-best" title={t('explore.bestMonthsTitle')}>
              <CalendarIcon size={11} /> {best}
            </span>
          )}
          {/* The seal, not the number, is what a tier means. It shows only
              where the model actually awarded one, so it stays a signal. */}
          {p.rating?.label && (
            <span className={`xcard-seal ${tierClass(p.rating)}`}>{p.rating.label}</span>
          )}
        </span>
        <span className="xcard-body">
          <span className="xcard-name-row">
            <span className="xcard-name">{p.city}</span>
            <ScoreChip rating={p.rating} size="xs" />
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
            <CostLine cost={p.cost} t={t} />
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
      {preview && <CardPreview p={p} t={t} best={best} />}
    </div>
  );
});

export function ExploreTab({
  data,
  locationQuery, setLocationQuery,
  countryFilter, setCountryFilter,
  tripKinds, setTripKinds,
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
  choices, onOpenLifestyle,
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

  // What the Lifestyle pill says: the preset in force and the bed it assumes,
  // which between them move every euro figure on the page. A comma, never a
  // bullet, because this app has no middot separators.
  const profileKey = matchProfile(choices?.lifestyle || {});
  const lifestyleLabel = [
    profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom'),
    t(`stay.${choices?.stay_tier || 'home'}`),
  ].join(', ');

  return (
    <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* Every control in one card: the kind cards, then search, sort, the
            one Filters door and the shortlist. The kind rail used to be a
            full-bleed band under the header, which read as a second piece of
            chrome; inside the card it is plainly the first of the four ways
            to narrow the same list. */}
        <div className="explore-toolbar">
          <CategoryRail tripKinds={tripKinds} setTripKinds={setTripKinds} />
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
                  className={(sortKey === s.key
                    || (s.key === 'beauty' && sortKey === 'price')
                    || (s.key === 'cost' && (sortKey === 'stay' || sortKey === 'food'))) ? 'on' : ''}
                  onClick={() => setSortKey(s.key)}
                >
                  {t(s.labelKey)}
                </button>
              ))}
            </div>

            {/* Filters first: it is the one primary door in this row (decides
                WHICH places are listed), so it leads. Lifestyle follows right
                after it because the two are one sentence: Lifestyle decides
                what the euro figure on each listed place means, and its
                label carries the current setting so a reader can see what
                the prices assume without opening anything. */}
            <div className="explore-chips">
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

              {onOpenLifestyle && (
                <button
                  type="button"
                  className="explore-lifestyle-btn"
                  onClick={onOpenLifestyle}
                  aria-haspopup="dialog"
                  title={t('lifestyle.exploreHint')}
                >
                  <PiggyIcon size={14} />
                  <span className="explore-lifestyle-label">{lifestyleLabel}</span>
                </button>
              )}

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
        </div>

        {/* Only when there is something to say. The cards carry a euro figure
            and the Lifestyle chip above states what it assumes, so a standing
            line explaining them was restating what the reader can already
            see. */}
        {(rows.length === 0 || isMock) && (
          <p className="explore-count">
            {rows.length === 0 && (
              <span className="explore-count-badge">
                {showFavOnly ? t('results.emptyFav') : t('results.empty')}
              </span>
            )}
            {isMock && <span className="explore-mock">Mock data</span>}
          </p>
        )}

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
