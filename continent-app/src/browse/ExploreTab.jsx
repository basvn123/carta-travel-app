import React from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { ScoreChip, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterRail } from './ExploreFilterRail.jsx';
import { ExploreRails, interleaveByCountry } from './ExploreRails.jsx';
import { TierLegend } from './TierLegend.jsx';
import { ExploreMap } from './ExploreMap.jsx';
import { CountryPage } from './CountryPage.jsx';
import { FilterChips } from './FilterChips.jsx';
import { CategoryRail } from './CategoryRail.jsx';
import { kindOf, roleOf, buildNearbyIndex } from '../lib/taxonomy.js';
import { loadSearchIndex, querySearchIndex } from '../lib/searchIndex.js';
import { useI18n } from '../i18n/index.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FULL_RATING_RANGE } from '../lib/rating.js';
import {
  FilterIcon, CalendarIcon, CameraIcon, ClockIcon, InfoIcon,
  ChevronDownIcon, MapPinIcon, ListDayIcon,
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
 * euros, and where it is. Opening a card opens the full-screen
 * DestinationPage, rendered from the dossier contract.
 *
 * v5 (2026-09-12) made the page calm. One control bar heads the feed with
 * the title, the live count, the grid/map switch and the sort, where the
 * old page split those between the side rail and a header halfway down.
 * Three collections lead the idle page instead of eight, and the rest
 * become one row of doors into the grid. The card carries the name, the
 * score, the country, the kind and the euros a day, nothing else: the
 * season, the sights and how long the place is worth moved into the hover
 * preview, which already existed for exactly that. On a desktop the map
 * sits beside the grid rather than replacing it, so the list narrows to
 * what the map shows and the two never disagree.
 *
 * Hovering a card opens a preview with the things the card cannot fit. It
 * follows WCAG 1.4.13, so it is dismissible with Escape, survives the
 * pointer travelling into it, and opens on keyboard focus as well as hover.
 * It never opens on touch, where hover does not exist and the tap already
 * opens the full page.
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

// Four tiles: the grid view, beside the pin that means the map.
function GridIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
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
const CARD_SIZES = '(max-width: 768px) 46vw, (max-width: 1180px) 45vw, 560px';

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
 * The hover preview: what the card cannot fit, over the whole card. It
 * repeats the name and rating that the real card body carries underneath
 * (that body is fully covered once the preview spans the card), then adds
 * what a glance at the grid cannot show: where the place ranks in its
 * country, what you do with it, the season, the sights, how long the place
 * is worth, and the same bed/food receipt the destination page uses, so a
 * reader who has read one can read the other.
 *
 * WCAG 1.4.13 has three requirements for content shown on hover and this
 * meets all three. Dismissible: Escape closes it without moving the pointer.
 * Hoverable: it is a child of the card, so travelling into it keeps the card
 * hovered and the preview open, with no "safe triangle" needed. Persistent:
 * nothing times it out, it closes when the pointer or the focus leaves.
 */
function CardPreview({ p, t, best, role, countryLine }) {
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
        {role && <span className="xcard-preview-role">{t(role.labelKey)}</span>}
      </p>
      {countryLine && <p className="xcard-preview-rank">{countryLine}</p>}
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

  // The country half of the verdict, only where it is earned. It lives in
  // the preview now: on the card it was a fifth fact fighting four others.
  const rank = p.country_rank;
  const countryLine = rank === 1
    ? t('card.topOf', { country: p.country })
    : (p.country_badge ? t('card.rankIn', { n: rank, country: p.country }) : null);

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
        {/* The photograph, and on it only what is earned: the verdict seal
            for tier 2 and up (a label everything wears carries no
            information), the gem chip in its own teal, the star. */}
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
        </span>

        {/* Four facts, two lines. The name and the score share the first;
            the country, the kind and the euros a day share the second. */}
        <span className="xcard-body">
          <span className="xcard-head">
            <span className="xcard-name">{p.city}</span>
            <ScoreChip rating={p.rating} size="sm" />
          </span>
          <span className="xcard-meta">
            <span className="xcard-place">
              <CountryFlag country={p.iso2} size={11} />
              <span className="xcard-country">{p.country}</span>
              <span className="xcard-kindword">{t(`pkind.${kind}`)}</span>
              {swimRelevant(p) && (
                <WaterQualityBadge bathing={p.bathing_water} t={t} showLabel={false} />
              )}
            </span>
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
      <button
        className="xcard-info"
        onClick={() => setPinned((v) => !v)}
        aria-expanded={preview}
        aria-label={t('explore.moreInfo')}
        title={t('explore.moreInfo')}
      >
        <InfoIcon size={15} />
      </button>
      {preview && (
        <CardPreview p={p} t={t} best={best} role={role} countryLine={countryLine} />
      )}
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
  const { t, lang } = useI18n();
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
      badged: q.get('xp')?.includes('b') || false,
      cheap: q.get('xp')?.includes('e') || false,
      quiet: q.get('xp')?.includes('q') || false,
      sea: q.get('xp')?.includes('s') || false,
    };
  });
  const patchXf = React.useCallback((delta) => setXf((v) => ({ ...v, ...delta })), []);
  // C7: grid or map. The bbox narrows the count only WHILE the map is the
  // view - an invisible filter surviving the switch back would make the
  // grid quietly lie about what it holds.
  const [view, setView] = React.useState('grid');
  const [bbox, setBbox] = React.useState(null);
  // C9: a country is a page, not just a filter.
  const [countryPage, setCountryPage] = React.useState(null);
  // B2: the fold-and-alias index answers the search box. Loaded on the
  // first real query, then cached for the session.
  const [searchHits, setSearchHits] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    if (!locationQuery || locationQuery.length < 3) { setSearchHits(null); return undefined; }
    loadSearchIndex().then((ix) => {
      if (live) setSearchHits(querySearchIndex(ix, locationQuery));
    });
    return () => { live = false; };
  }, [locationQuery]);

  // D7: opening a parent found VIA a member search carries ?dm=<member> in
  // the URL, so the destination page can put that member in focus - and a
  // shared link keeps the anchor.
  const openWithMember = React.useCallback((id) => {
    const hit = searchHits?.memberHits?.find((h) => h.id === id);
    const q = new URLSearchParams(window.location.search);
    if (hit) q.set('dm', hit.member); else q.delete('dm');
    window.history.replaceState(null, '',
      `${window.location.pathname}?${q.toString()}${window.location.hash}`);
    onSelect(id);
  }, [searchHits, onSelect]);
  const sentinelRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  const { rows, availableCountries } = useExploreCatalog({
    data, locationQuery, countryFilter, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey, showFavOnly, favorites,
    indices, searchHits,
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

  // One predicate each, shared by the C5 rails and the C6 filters, so a
  // rail's "See all" always lands on a grid showing the same list.
  const noCarOk = (p) => !p.local_transport?.car_needed
    && (p.local_transport?.transit_quality === 'good'
      || p.local_transport?.transit_quality === 'excellent');
  const cheapOk = (p) => p.cost?.dayEur != null && p.cost.dayEur <= 70;
  const quietOk = (p) => p.crowding?.tier === 1;

  // C6: the taxonomy filters, applied after the catalog hook's own. The
  // count shown in the control bar is THIS list's length (or, while the map
  // is up, the part of it inside the viewport), so it can never disagree
  // with what renders.
  const taxRows = React.useMemo(() => rows.filter((p) => {
    if (xf.kinds.length && !xf.kinds.includes(kindOf(p))) return false;
    if (xf.verdicts.length && !xf.verdicts.includes(String(p.rating?.tier ?? 0))) return false;
    if (xf.roles.length && !xf.roles.includes(roleFor(p).key)) return false;
    if (xf.month && !(p.climate?.best || []).includes(xf.month)) return false;
    if (xf.nocar && !noCarOk(p)) return false;
    if (xf.cheap && !cheapOk(p)) return false;
    if (xf.quiet && !quietOk(p)) return false;
    if (xf.badged && !p.country_badge) return false;
    if (xf.sea && !(p.categories || []).some((c) => c === 'beach' || c === 'coast' || c === 'island')) return false;
    return true;
  }), [rows, xf, roleFor]);

  // C7: what the map's viewport holds, counted live while the map is shown.
  const shownRows = React.useMemo(() => {
    if (view !== 'map' || !bbox) return taxRows;
    const [w, so, e, n] = bbox;
    return taxRows.filter((p) => {
      const lat = p.city_lat ?? p.lat;
      const lon = p.city_lon ?? p.lon;
      return lat >= so && lat <= n && lon >= w && lon <= e;
    });
  }, [taxRows, view, bbox]);

  // The grid beside the map lists what the map shows, in a plain two-up so
  // the column stays readable at half width; the full-width grid keeps the
  // packed mosaic.
  const packed = React.useMemo(() => {
    if (view === 'map') {
      return shownRows.slice(0, visible).map((p) => ({ p, span: 1, ratio: [4, 3], kind: kindOf(p) }));
    }
    return packRows(taxRows.slice(0, visible));
  }, [taxRows, shownRows, view, visible]);

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
    const flags = `${xf.nocar ? 'c' : ''}${xf.cheap ? 'e' : ''}${xf.quiet ? 'q' : ''}${xf.sea ? 's' : ''}${xf.badged ? 'b' : ''}`;
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
  // A pan of the map is a new page too, but not a new scroll position: the
  // map is what the reader is holding, and the list beside it just follows.
  React.useEffect(() => { setVisible(PAGE); }, [bbox, view]);

  const gridTotal = view === 'map' ? shownRows.length : taxRows.length;
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < gridTotal ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [gridTotal]);

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
      nocar: false, cheap: false, quiet: false, sea: false, badged: false });
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
    if (xf.badged) list.push({ key: 'badged', label: t('filter.bestOf'), remove: drop({ badged: false }) });
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

  // C5: the editorial rails. Every rail is (title, rows, seeAll) where the
  // rows come from the SAME predicate its seeAll applies, so the "See all
  // 292" grid is exactly the rail, longer. They lead only the unfiltered
  // grid page: once the reader narrows anything, or puts the map up, the
  // grid is the answer. ExploreRails shows the first three as strips and
  // the rest as one row of doors.
  const railsIdle = chips.length === 0 && !locationQuery
    && tripKinds.length === 0 && !showFavOnly && view === 'grid';
  const rails = React.useMemo(() => {
    if (!railsIdle) return [];
    const month = new Date().getMonth() + 1;
    const bestOf = new Map();
    for (const p of rows) {
      if (!p.country_badge) continue;
      const cur = bestOf.get(p.country);
      if (!cur || (p.country_rank || 99) < (cur.country_rank || 99)) bestOf.set(p.country, p);
    }
    const q = {
      the43: rows.filter((p) => p.rating?.tier === 3),
      gems: interleaveByCountry(rows.filter((p) => p.rating?.hidden_gem)),
      now: interleaveByCountry(rows.filter((p) => (p.climate?.best || []).includes(month))),
      bestOf: interleaveByCountry([...bestOf.values()]),
      villages: rows.filter((p) => kindOf(p) === 'village' && (p.rating?.tier ?? 0) >= 1),
      nocar: interleaveByCountry(rows.filter(noCarOk)),
      cheap: interleaveByCountry(rows.filter(cheapOk)),
      quiet: interleaveByCountry(rows.filter(quietOk)),
    };
    return [
      { key: 'the43', title: t('rail.top', { n: q.the43.length }), rows: q.the43,
        seeAll: () => patchXf({ verdicts: ['3'] }) },
      { key: 'gems', title: t('rail.gems'), rows: q.gems,
        seeAll: () => setGemOnly(true) },
      { key: 'now', title: t('rail.now'), rows: q.now,
        seeAll: () => patchXf({ month }) },
      { key: 'bestOf', title: t('rail.bestOf'), rows: q.bestOf,
        seeAll: () => patchXf({ badged: true }) },
      { key: 'villages', title: t('rail.villages'), rows: q.villages,
        seeAll: () => patchXf({ kinds: ['village'], verdicts: ['1', '2', '3'] }) },
      { key: 'nocar', title: t('rail.nocar'), rows: q.nocar,
        seeAll: () => patchXf({ nocar: true }) },
      { key: 'cheap', title: t('rail.cheap'), rows: q.cheap,
        seeAll: () => patchXf({ cheap: true }) },
      { key: 'quiet', title: t('rail.quiet'), rows: q.quiet,
        seeAll: () => patchXf({ quiet: true }) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railsIdle, rows, t]);

  // The control bar's three instruments. The count is a measured figure,
  // so it is grouped the way the reader's locale groups thousands.
  const fmtCount = React.useMemo(() => new Intl.NumberFormat(lang || 'en'), [lang]);
  const countLine = t('explore.countLine', { n: fmtCount.format(shownRows.length) });

  const sortSelect = (
    <label className="xgrid-sort">
      <span className="xgrid-sort-label">{t('places.sortLabel')}</span>
      <span className="xgrid-sort-field">
        <select value={SORTS.some((x) => x.key === sortKey) ? sortKey : 'beauty'}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label={t('explore.sortAria')}>
          {SORTS.map((x) => <option key={x.key} value={x.key}>{t(x.labelKey)}</option>)}
        </select>
        <ChevronDownIcon size={14} className="xgrid-sort-chev" />
      </span>
    </label>
  );

  const viewToggle = (cls) => (
    <div className={`xview-toggle ${cls}`.trim()} role="group" aria-label={t('explore.viewAria')}>
      <button type="button" className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'}
        onClick={() => setView('grid')}>
        {cls === 'xview-fab' ? <ListDayIcon size={15} /> : <GridIcon size={14} />}
        <span>{cls === 'xview-fab' ? t('explore.viewList') : t('explore.viewGrid')}</span>
      </button>
      <button type="button" className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'}
        onClick={() => setView('map')}>
        <MapPinIcon size={15} />
        <span>{t('explore.viewMap')}</span>
      </button>
    </div>
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
      onOpenCountry={setCountryPage}
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

  const anyActive = chips.length > 0;

  return (
    <div className="explore-shell">
      {headerSlot && createPortal(searchField, headerSlot)}

      {/* Desktop-only left panel (CSS hides it under 769px): the trip kinds
          as a tile grid, then the filter rail in folds, then Lifestyle and
          the shortlist, with one hairline to the panel's right. The phone
          keeps the toolbar card below instead. */}
      <aside className="side-panel explore-side" aria-label={t('filter.filters')}>
        <div className="side-block">
          <p className="side-label">{t('explore.sideKinds')}</p>
          <CategoryRail tripKinds={tripKinds} setTripKinds={setTripKinds} />
        </div>
        <div className="side-block">
          <p className="side-label">
            <span>{t('explore.sideRefine')}</span>
            {anyActive && (
              <button type="button" className="side-clear" onClick={resetAll}>
                {t('filter.clearAll')}
              </button>
            )}
          </p>
          {filterRail}
          <div className="side-group side-actions">
            {onOpenLifestyle && renderLifestyle('side-lifestyle')}
            {renderFav('side-fav')}
          </div>
        </div>
      </aside>

      <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* Phone only (CSS hides it from 769px): the kind tiles, the search
            field, Lifestyle and the shortlist in one banded toolbar. */}
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
            <span className="xrail-count-inline">{countLine}</span>
          </summary>
          {filterRail}
        </details>

        {/* The control bar: what this page is, how many places it holds
            right now, and the two ways to rearrange them. One row, over the
            feed it rules. On a phone the grid/map switch floats above the
            bottom nav instead (.xview-fab), where a thumb can reach it. */}
        <div className="xbar">
          <div className="xbar-lead">
            <h1 className="xbar-title">{t('explore.title')}</h1>
            <span className="xgrid-count">{countLine}</span>
            {isMock && <span className="explore-mock">Mock data</span>}
          </div>
          <div className="xbar-tools">
            {viewToggle('')}
            {sortSelect}
          </div>
        </div>

        {/* C6: active filters as removable chips, right under the bar. */}
        <FilterChips t={t} chips={chips} onClearAll={resetAll} />

        {/* C8: the tiers, their live counts, and the five glyphs - the
            system stated where it is used, folding to a "?" once read. */}
        <TierLegend data={data} />

        {/* The one community surface on a browse tab: a real count of what
            people have published, and one door. Absent entirely when
            nothing is published. */}
        <GuidesStrip onOpen={onOpenGuides} />

        {countryFilter.length === 1 && (
          <button className="cpage-banner" onClick={() => setCountryPage(countryFilter[0])}>
            {t('cpage.open', {
              country: (availableCountries.find(([c]) => c === countryFilter[0]) || [])[1]
                || countryFilter[0],
            })} {'→'}
          </button>
        )}

        {/* B2: a member village resolves to its parent, and says so. */}
        {locationQuery && searchHits?.memberHits?.length > 0 && taxRows.length > 0 && (
          <p className="xsearch-hint">
            {t('explore.inParent', {
              member: searchHits.memberHits[0].member,
              parent: taxRows.find((p) => p.id === searchHits.memberHits[0].id)?.city
                || searchHits.memberHits[0].id,
            })}
          </p>
        )}
        {locationQuery && searchHits?.regionLabel && (
          <p className="xsearch-hint">
            {t('explore.regionFilter', { region: searchHits.regionLabel })}
          </p>
        )}

        {/* C7: the feed. Grid alone, or on a desktop the grid beside a
            sticky map, the list narrowing to what the map holds. On a
            phone the map takes the column and the floating switch brings
            the list back. */}
        <div className={`xcontent ${view === 'map' ? 'xcontent--split' : ''}`.trim()}>
          <div className="xcontent-main">
            {railsIdle && <ExploreRails rails={rails} onSelect={openWithMember} t={t} />}

            {gridTotal === 0 && (
              <p className="explore-count">
                <span className="explore-count-badge">
                  {showFavOnly ? t('results.emptyFav') : t('results.empty')}
                </span>
                {locationQuery && searchHits?.suggestions?.length > 0 && (
                  <span className="xsearch-suggest">
                    {t('explore.didYouMean')}
                    {searchHits.suggestions.map((sug) => (
                      <button key={sug} className="xsearch-suggest-btn"
                        onClick={() => setLocationQuery(sug)}>{sug}</button>
                    ))}
                  </span>
                )}
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
                  onSelect={openWithMember}
                  onToggleFav={onToggleFav}
                  t={t}
                />
              ))}
            </div>

            {visible < gridTotal && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}
          </div>

          {view === 'map' && (
            <div className="xcontent-map">
              <ExploreMap rows={taxRows} onSelect={openWithMember} onViewport={setBbox} t={t} />
            </div>
          )}
        </div>
      </div>

      {viewToggle('xview-fab')}
      </div>

      {countryPage && (
        <CountryPage
          iso2={countryPage}
          rows={rows}
          onClose={() => setCountryPage(null)}
          onSelect={(id) => { onSelect(id); }}
        />
      )}
    </div>
  );
}
