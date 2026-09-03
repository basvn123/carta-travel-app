import React from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { ScoreChip, HiddenGemTag, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterRail } from './ExploreFilterRail.jsx';
import { FilterChips } from './FilterChips.jsx';
import { CategoryRail } from './CategoryRail.jsx';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { kindOf, roleOf, buildNearbyIndex, ROLES } from '../lib/taxonomy.js';
import { useI18n } from '../i18n/index.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FULL_RATING_RANGE } from '../lib/rating.js';
import {
  FilterIcon, CalendarIcon, CameraIcon, ClockIcon, InfoIcon, CarIcon,
} from '../components/Icons.jsx';
import { LifestyleButton } from './LifestyleButton.jsx';
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
 * euros, and when to go. Opening a card opens the full-screen
 * DestinationPage, rendered from the dossier contract.
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
const CARD_SIZES = '(max-width: 768px) 92vw, (max-width: 1180px) 45vw, 560px';

/**
 * C4: kind picks the card's span on the 12-column grid, so the page has a
 * visible rhythm before anything is read - the grid IS the legend. Metros
 * and anything worth the journey take half a row with a wide photograph,
 * landscapes letterbox, cities sit 3-up, towns and villages 4-up square.
 */
function spanFor(p) {
  const kind = kindOf(p);
  if (kind === 'area') return { span: 6, ratio: [21, 9], kind };
  if (kind === 'metro' || p.rating?.tier === 3) return { span: 6, ratio: [16, 10], kind };
  if (kind === 'city') return { span: 4, ratio: [4, 3], kind };
  return { span: 3, ratio: [1, 1], kind };
}

/**
 * Fill each 12-column row exactly. Greedy with a small look-ahead: a card
 * that fits is placed in order; when the next card would overflow, the
 * packer pulls forward the nearest upcoming card that closes the row, and
 * when nothing can, the row's last card widens to absorb the slack - no
 * ragged rows, near-stable ordering.
 */
function packRows(rows) {
  const items = rows.map((p) => ({ p, ...spanFor(p) }));
  const WINDOW = 12; // how far ahead a card may be pulled; keeps sort readable
  const out = [];
  let used = 0;
  while (items.length) {
    const remainder = 12 - used;
    // prefer, in order: the next card if it fits; else the nearest upcoming
    // card that fits the remainder (exact closers first)
    let idx = -1;
    const win = Math.min(items.length, WINDOW);
    for (let i = 0; i < win && idx === -1; i++) {
      if (items[i].span === remainder) idx = i;
    }
    if (idx === -1) {
      for (let i = 0; i < win && idx === -1; i++) {
        if (items[i].span <= remainder) idx = i;
      }
    }
    if (idx === -1) {
      // nothing in the window fits: widen the row's last card to close it
      if (out.length) out[out.length - 1].span += remainder;
      used = 0;
      continue;
    }
    const [it] = items.splice(idx, 1);
    out.push(it);
    used = (used + it.span) % 12;
  }
  if (used > 0 && out.length) out[out.length - 1].span += 12 - used;
  return out;
}

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

const ExploreCard = React.memo(function ExploreCard({
  p, span, ratio, kind, role, selected, fav, onSelect, onToggleFav, t,
}) {
  const best = p.climate?.best?.length ? fmtMonthRanges(p.climate.best) : null;
  // Two doors to one preview: hover follows the pointer, the info button
  // pins it open until it is clicked again (WCAG 1.4.13 as before).
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const preview = hovered || pinned;

  React.useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setHovered(false); setPinned(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview]);

  const onEnter = (e) => { if (e.pointerType === 'mouse') setHovered(true); };

  // C3 slot 3, the verdict line's country half: only where it is earned.
  const rank = p.country_rank;
  const countryLine = rank === 1
    ? t('card.topOf', { country: p.country })
    : (p.country_badge ? t('card.rankIn', { n: rank, country: p.country }) : null);

  const hours = p.place?.visit_h != null ? Math.round(p.place.visit_h) : null;

  return (
    <div
      className={`xcard xcard--${kind} ${selected ? 'selected' : ''} ${preview ? 'previewing' : ''}`}
      style={{ '--xspan': span }}
      onPointerEnter={onEnter}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        className="xcard-hit"
        onClick={() => onSelect(p.id)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-label={t('explore.openDest', { city: p.city })}
      >
        {/* Slot 1: the image. Verdict ribbon top-left ONLY for tier 2 and
            up - a label everything wears carries no information. Gem chip
            top-right in its own teal, so "the world hasn't noticed" never
            reads as a tier. */}
        <span className="xcard-media">
          <HeroImage
            url={p.image}
            city={p.city}
            iso2={p.iso2}
            className="xcard-img"
            maxWidth={span >= 6 ? 960 : 500}
            sizes={CARD_SIZES}
            ratio={ratio}
          />
          {(p.rating?.tier ?? 0) >= 2 && (
            <span className={`xcard-seal ${tierClass(p.rating)} ${p.rating.tier === 3 ? 'xcard-seal--filled' : 'xcard-seal--outline'}`}>
              {p.rating.label}
            </span>
          )}
          {p.rating?.hidden_gem && (
            <span className="xcard-gem">{t('legend.gem')}</span>
          )}
          {best && (
            <span className="xcard-best" title={t('explore.bestMonthsTitle')}>
              <CalendarIcon size={11} /> {best}
            </span>
          )}
        </span>

        <span className="xcard-body">
          {/* Slot 2: identity - kind glyph + kind word + country, then the
              name in the display face. A column of these reads as a table. */}
          <span className="xcard-kind">
            <KindGlyph kind={kind} size={11} label={t(`pkind.${kind}`)} />
            <span className="xcard-kindword">{t(`pkind.${kind}`)}</span>
            <span className="xcard-dot" aria-hidden="true">·</span>
            <CountryFlag country={p.iso2} size={11} />
            <span>{p.country}</span>
            {swimRelevant(p) && (
              <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />
            )}
          </span>
          <span className="xcard-name">{p.city}</span>

          {/* Slot 3: the verdict - the score, and the country line where a
              badge earned one. */}
          <span className="xcard-verdict">
            <ScoreChip rating={p.rating} size="xs" />
            {countryLine && <span className="xcard-country-line">{countryLine}</span>}
          </span>

          {/* Slot 4: the meta line - what you DO with the place. */}
          <span className="xcard-foot">
            <span className="xcard-role">{t(role.labelKey)}</span>
            {hours != null && (
              <span className="xcard-hours"><ClockIcon size={11} /> {t('card.hours', { n: hours })}</span>
            )}
            {p.local_transport?.car_needed && (
              <span className="xcard-car" title={t('card.carNeeded')}><CarIcon size={12} /></span>
            )}
            <span className="xcard-cost"><CostLine cost={p.cost} t={t} /></span>
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
      <button
        className="xcard-info"
        onClick={() => setPinned((v) => !v)}
        aria-expanded={preview}
        aria-label={t('explore.moreInfo')}
        title={t('explore.moreInfo')}
      >
        <InfoIcon size={15} />
      </button>
      {preview && <CardPreview p={p} t={t} best={best} />}
    </div>
  );
});

export function ExploreTab({
  data,
  isActive = true,
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
  choices, onOpenLifestyle, onOpenGuides,
}) {
  const { t } = useI18n();
  const [visible, setVisible] = React.useState(PAGE);
  // C6: the taxonomy filters live here and in the URL, nowhere else. One
  // object, so a chip row, the rail and the query string cannot drift.
  const [xf, setXf] = React.useState(() => {
    const q = new URLSearchParams(window.location.search);
    const list = (k) => (q.get(k) ? q.get(k).split(',').filter(Boolean) : []);
    return {
      kinds: list('xk'),
      verdicts: list('xv'),
      roles: list('xr'),
      month: q.get('xm') ? Number(q.get('xm')) : null,
      nocar: q.get('xp')?.includes('c') || false,
      cheap: q.get('xp')?.includes('e') || false,
      quiet: q.get('xp')?.includes('q') || false,
      sea: q.get('xp')?.includes('s') || false,
    };
  });
  const patchXf = React.useCallback((delta) => setXf((v) => ({ ...v, ...delta })), []);
  const sentinelRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  const { rows, availableCountries } = useExploreCatalog({
    data, locationQuery, countryFilter, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey, showFavOnly, favorites,
    indices,
  });

  // C1's role needs the neighbour count; built once per catalogue.
  const nearby = React.useMemo(
    () => (data?.destinations ? buildNearbyIndex(data.destinations) : {}),
    [data],
  );
  const roleFor = React.useCallback(
    (p) => roleOf(p, nearby[p.id] || 0),
    [nearby],
  );

  // C6: the taxonomy filters, applied after the catalog hook's own. The
  // count shown in the grid header is THIS list's length, so it can never
  // disagree with what renders.
  const taxRows = React.useMemo(() => rows.filter((p) => {
    if (xf.kinds.length && !xf.kinds.includes(kindOf(p))) return false;
    if (xf.verdicts.length && !xf.verdicts.includes(String(p.rating?.tier ?? 0))) return false;
    if (xf.roles.length && !xf.roles.includes(roleFor(p).key)) return false;
    if (xf.month && !(p.climate?.best || []).includes(xf.month)) return false;
    if (xf.nocar && p.local_transport?.car_needed) return false;
    if (xf.cheap && !(p.cost?.dayEur != null && p.cost.dayEur <= 70)) return false;
    if (xf.quiet && p.crowding?.tier !== 1) return false;
    if (xf.sea && !(p.categories || []).some((c) => c === 'beach' || c === 'coast' || c === 'island')) return false;
    return true;
  }), [rows, xf, roleFor]);

  const packed = React.useMemo(
    () => packRows(taxRows.slice(0, visible)),
    [taxRows, visible],
  );

  // C6: the filter state is the URL, so a filtered view is shareable and
  // the back button means what it says. replaceState keeps the #trip hash
  // and never triggers a reload.
  React.useEffect(() => {
    if (!isActive) return;
    const q = new URLSearchParams(window.location.search);
    const setOrDrop = (k, v) => (v ? q.set(k, v) : q.delete(k));
    setOrDrop('xk', xf.kinds.join(','));
    setOrDrop('xv', xf.verdicts.join(','));
    setOrDrop('xr', xf.roles.join(','));
    setOrDrop('xm', xf.month || '');
    const flags = `${xf.nocar ? 'c' : ''}${xf.cheap ? 'e' : ''}${xf.quiet ? 'q' : ''}${xf.sea ? 's' : ''}`;
    setOrDrop('xp', flags);
    setOrDrop('xg', gemOnly ? '1' : '');
    setOrDrop('xu', unescoOnly ? '1' : '');
    setOrDrop('xc', countryFilter.join(','));
    setOrDrop('xs', sortKey !== 'beauty' ? sortKey : '');
    const qs = q.toString();
    window.history.replaceState(null, '',
      `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
  }, [xf, gemOnly, unescoOnly, countryFilter, sortKey, isActive]);

  // ...and hydrates the App-owned filters once on arrival.
  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const q = new URLSearchParams(window.location.search);
    if (q.get('xg') === '1') setGemOnly(true);
    if (q.get('xu') === '1') setUnescoOnly(true);
    if (q.get('xc')) setCountryFilter(q.get('xc').split(',').filter(Boolean));
    if (q.get('xs')) setSortKey(q.get('xs'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New result set: back to one page, back to the top.
  React.useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [taxRows]);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < taxRows.length ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [taxRows.length]);

  const resetAll = () => {
    setCountryFilter([]);
    setRatingRange([...FULL_RATING_RANGE]);
    setGemOnly(false);
    setUnescoOnly(false);
    setTopBeachOnly(false);
    setBigOnly(false);
    setTopPick(null);
    setReachHours(null);
    setXf({ kinds: [], verdicts: [], roles: [], month: null,
      nocar: false, cheap: false, quiet: false, sea: false });
  };

  // C6: one chip per active filter, each removing exactly itself.
  const chips = React.useMemo(() => {
    const list = [];
    const drop = (delta) => () => patchXf(delta);
    for (const k of xf.kinds) list.push({ key: `k:${k}`, label: t(`pkind.${k}`), remove: drop({ kinds: xf.kinds.filter((x) => x !== k) }) });
    for (const v of xf.verdicts) list.push({ key: `v:${v}`, label: t(`rating.tier${v}`), remove: drop({ verdicts: xf.verdicts.filter((x) => x !== v) }) });
    for (const r of xf.roles) list.push({ key: `r:${r}`, label: t(`role.short.${r}`), remove: drop({ roles: xf.roles.filter((x) => x !== r) }) });
    if (xf.month) list.push({ key: 'month', label: t('filter.goodIn') + ' ' + fmtMonthRanges([xf.month]), remove: drop({ month: null }) });
    if (xf.nocar) list.push({ key: 'nocar', label: t('filter.noCar'), remove: drop({ nocar: false }) });
    if (xf.cheap) list.push({ key: 'cheap', label: t('filter.underDay', { eur: 70 }), remove: drop({ cheap: false }) });
    if (xf.quiet) list.push({ key: 'quiet', label: t('filter.notCrowded'), remove: drop({ quiet: false }) });
    if (xf.sea) list.push({ key: 'sea', label: t('filter.nearSea'), remove: drop({ sea: false }) });
    if (gemOnly) list.push({ key: 'gem', label: t('legend.gem'), remove: () => setGemOnly(false) });
    if (unescoOnly) list.push({ key: 'unesco', label: 'UNESCO', remove: () => setUnescoOnly(false) });
    for (const iso2 of countryFilter) {
      const name = (availableCountries.find(([c]) => c === iso2) || [])[1] || iso2;
      list.push({ key: `c:${iso2}`, label: name, remove: () => setCountryFilter(countryFilter.filter((x) => x !== iso2)) });
    }
    if (reachAvailable && reachHours != null) list.push({ key: 'reach', label: t('filter.reachHours', { n: reachHours }), remove: () => setReachHours(null) });
    return list;
  }, [xf, gemOnly, unescoOnly, countryFilter, reachHours, reachAvailable, availableCountries, t, patchXf, setGemOnly, setUnescoOnly, setCountryFilter, setReachHours]);

  const favSet = favorites || new Set();

  // Desktop chrome: the search field portals into the app header's slot and
  // the controls stand in the left panel; the phone keeps the toolbar card.
  // Only the active tab may claim the slot, because both browse tabs stay
  // mounted (keep-alive) and two portals into one div would interleave.
  const isDesktop = useIsDesktop();
  const [headerSlot, setHeaderSlot] = React.useState(null);
  React.useEffect(() => {
    if (isDesktop && isActive) setHeaderSlot(document.getElementById('header-search-slot'));
    else setHeaderSlot(null);
  }, [isDesktop, isActive]);

  // The same controls drawn twice, phone toolbar and desktop side panel:
  // one renderer each, so the two can never drift apart.
  const searchField = (
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
  );

  // C6: sort is a select in the grid header, visually distinct from the
  // filters, standing where the results it orders actually are.
  const sortSelect = (
    <label className="xgrid-sort">
      <span>{t('places.sortLabel')}</span>
      <select value={SORTS.some((x) => x.key === sortKey) ? sortKey : 'beauty'}
        onChange={(e) => setSortKey(e.target.value)}>
        {SORTS.map((x) => <option key={x.key} value={x.key}>{t(x.labelKey)}</option>)}
      </select>
    </label>
  );

  const filterRail = (
    <ExploreFilterRail
      t={t}
      xf={xf}
      patch={patchXf}
      gemOnly={gemOnly} setGemOnly={setGemOnly}
      unescoOnly={unescoOnly} setUnescoOnly={setUnescoOnly}
      countryFilter={countryFilter} setCountryFilter={setCountryFilter}
      availableCountries={availableCountries}
      reachHours={reachHours} setReachHours={setReachHours}
      reachAvailable={reachAvailable}
    />
  );

  // One shared component, so this door looks the same here, on Destinations
  // and in the account hub. The tint is the accent's, not the page's, because
  // every euro figure in the grid below comes out of it.
  const renderLifestyle = (cls) => (
    <LifestyleButton
      stayTier={choices?.stay_tier}
      lifestyle={choices?.lifestyle}
      onClick={onOpenLifestyle}
      className={cls}
    />
  );

  const renderFav = (cls) => (
    <button
      className={`fav-filter explore-fav ${cls} ${showFavOnly ? 'on' : ''}`.trim()}
      onClick={() => setShowFavOnly(!showFavOnly)}
      title={t('results.showShortlist')}
      aria-pressed={showFavOnly}
    >
      <Star filled={showFavOnly} />
      <span>{favSet.size}</span>
    </button>
  );

  return (
    <div className="explore-shell">
      {headerSlot && createPortal(searchField, headerSlot)}

      {/* Desktop-only left panel (CSS hides it under 769px): the trip kinds
          as a card grid under the brand, then the sorts, the Filters door,
          Lifestyle and the shortlist, with one hairline to the panel's
          right. The phone keeps the toolbar card below instead. */}
      <aside className="side-panel explore-side" aria-label={t('filter.filters')}>
        <div className="side-block">
          <p className="side-label">{t('side.categories')}</p>
          <CategoryRail tripKinds={tripKinds} setTripKinds={setTripKinds} />
        </div>
        <div className="side-block">
          <p className="side-label">{t('side.refine')}</p>
          {/* C6: the result count leads - the single most reassuring element
              on a filter UI - then every filter, no modal anywhere. */}
          <p className="xrail-count">{t('explore.countLine', { n: taxRows.length })}</p>
          {filterRail}
          <div className="side-group side-actions">
            {onOpenLifestyle && renderLifestyle('side-lifestyle')}
            {renderFav('side-fav')}
          </div>
        </div>
      </aside>

      <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* Every control in one card: the kind cards, then search, sort, the
            one Filters door and the shortlist. The kind rail used to be a
            full-bleed band under the header, which read as a second piece of
            chrome; inside the card it is plainly the first of the four ways
            to narrow the same list. */}
        <div className="explore-toolbar">
          <CategoryRail tripKinds={tripKinds} setTripKinds={setTripKinds} />
          {/* Inline on a phone; on desktop the same field has portalled into
              the app header and this renders nothing. */}
          {!headerSlot && searchField}

          <div className="explore-toolbar-right">
            <div className="explore-chips">
              {onOpenLifestyle && renderLifestyle('')}
              {renderFav('')}
            </div>
          </div>
        </div>

        {/* Phone only (CSS hides it from 769px): the same rail inside a
            plain disclosure fold - not a modal, so every filter stays
            reachable and the count stays on screen while knobs turn. */}
        <details className="explore-fold">
          <summary>
            <FilterIcon size={14} />
            <span>{t('filter.filters')}</span>
            <span className="xrail-count-inline">{t('explore.countLine', { n: taxRows.length })}</span>
          </summary>
          {filterRail}
        </details>

        {/* The one community surface on a browse tab: a real count of what
            people have published, and one door. No preview carousel, because
            the priced destinations below are why anybody opened this tab and
            a new feature does not get to push them under the fold. Absent
            entirely when nothing is published. */}
        <GuidesStrip onOpen={onOpenGuides} />

        {/* Only when there is something to say. The cards carry a euro figure
            and the Lifestyle chip above states what it assumes, so a standing
            line explaining them was restating what the reader can already
            see. */}
        {/* C6: active filters as removable chips, then the grid header with
            the live count and the sort select beside the results they rule. */}
        <FilterChips t={t} chips={chips} onClearAll={resetAll} />

        <div className="xgrid-head">
          <span className="xgrid-count">{t('explore.countLine', { n: taxRows.length })}</span>
          {isMock && <span className="explore-mock">Mock data</span>}
          {sortSelect}
        </div>

        {taxRows.length === 0 && (
          <p className="explore-count">
            <span className="explore-count-badge">
              {showFavOnly ? t('results.emptyFav') : t('results.empty')}
            </span>
          </p>
        )}

        <div className="explore-grid explore-grid--mosaic">
          {packed.map(({ p, span, ratio, kind }) => (
            <ExploreCard
              key={p.id}
              p={p}
              span={span}
              ratio={ratio}
              kind={kind}
              role={roleFor(p)}
              selected={p.id === selectedId}
              fav={favSet.has(p.id)}
              onSelect={onSelect}
              onToggleFav={onToggleFav}
              t={t}
            />
          ))}
        </div>

        {visible < taxRows.length && (
          <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
        )}
      </div>
      </div>
    </div>
  );
}
