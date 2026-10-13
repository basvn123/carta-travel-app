import React from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { ScoreChip, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { fmtMonthRanges, MONTHS_SHORT } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterRail } from './ExploreFilterRail.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { ExploreRails, interleaveByCountry } from './ExploreRails.jsx';
import { TierLegend } from './TierLegend.jsx';
import { CountryPage } from './CountryPage.jsx';
import { FilterChips } from './FilterChips.jsx';
import { kindOf, roleOf, buildNearbyIndex } from '../lib/taxonomy.js';
import { loadSearchIndex, querySearchIndex } from '../lib/searchIndex.js';
import { useI18n } from '../i18n/index.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FULL_RATING_RANGE } from '../lib/rating.js';
import {
  FilterIcon, CalendarIcon, CameraIcon, ClockIcon, InfoIcon, TrainIcon,
  ChevronDownIcon, ChevronRightIcon, MapPinIcon, ListDayIcon, CloseIcon,
} from '../components/Icons.jsx';
import { count as fmtCount } from '../lib/format.js';
import { useTravelMonth } from '../components/SettingsLine.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { LoadingBlock } from '../components/StateBlocks.jsx';

// The map is the ONE thing in this tab that pulls maplibre-gl (~930 KB raw),
// and the tab opens on the grid. Imported statically it was hoisted into the
// entry chunk, so every visitor paid for a library most never render - which
// also silently defeated the lazy() wrappers on TrailPage / CyclePage /
// DestMap / the planner tabs, since maplibre was already in the main bundle
// by the time they loaded. Loading it here on the first switch to map view
// takes it (and maplibre-gl.css) off the critical path.
const ExploreMap = React.lazy(
  () => import('./ExploreMap.jsx').then((m) => ({ default: m.ExploreMap })),
);
import { CostLine, CostReceipt } from '../components/CostSummary.jsx';
import { visitLength } from '../lib/nearby.js';
import { placeSights } from '../lib/placeStory.js';
import { knownFor } from '../lib/knownFor.js';
import { catalogue, CATALOGUE_MODE, loadFullCatalogue } from '../lib/appData.js';
import { decodeBootIndex } from '../lib/bootIndex.js';
import { formatMoney } from '../lib/money.js';

// 'viewport' catalogue mode (T059): the zoom from which the map fetches the
// countries on screen. Below it the map draws clusters, which the boot pins
// already count truly, so panning a continental view costs nothing.
const DETAIL_FROM = 6;

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
 * On touch the card's info control opens it (V3), and since V4 it is a
 * paper popover beside or under the card, never over its photograph.
 */

const PAGE = 48;

// One predicate each, shared by the C5 rails and the C6 filters, so a
// rail's "See all" always lands on a grid showing the same list. Module
// scope: they read only the row.
const noCarOk = (p) => !p.local_transport?.car_needed
  && (p.local_transport?.transit_quality === 'good'
    || p.local_transport?.transit_quality === 'excellent');
const underOk = (eur) => (p) => p.cost?.dayEur != null && p.cost.dayEur <= eur;
const quietOk = (p) => p.crowding?.tier === 1;

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

// The budget ceiling's steps, euros per person per day for the ground cost
// (house rule "Budget ceiling", explore N2). It filters; it never re-prices.
const BUDGET_STEPS = [40, 60, 80, 100, 130];
// An old link's "Under €70 a day" toggle (xp=e) lands on this ceiling.
const LEGACY_CHEAP = 70;

// How wide the grid draws a card, so the browser can pick a thumbnail instead
// of downloading Wikimedia's 960px rendering for a 300px slot. The widths in
// the srcset are a fixed list Wikimedia will actually render (heroImage.js).
const CARD_SIZES = '(max-width: 768px) 46vw, (max-width: 1180px) 45vw, 560px';

/**
 * C4 drew the grid as a mosaic, kind picking the span. V4 (T393): one card
 * size and one photograph shape, 3:2 (DIRECTION part 3, "one aspect per
 * row"), four across at 1280 px, so a desktop screen holds eight priced
 * cards instead of two. Two sizes were tried first (metros and the top tier
 * at a third of the row): the rating sort leads with exactly those places,
 * so the first screen was all large cards and held three figures. The kind
 * word on line 2 still says what size a place is. The phone two-up crops to
 * 16:10 in 62-v6-explore.css. packRows stays, so a later size can come back.
 */
function spanFor(p) {
  return { span: 3, ratio: [3, 2], kind: kindOf(p) };
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

/** Door-to-door ground minutes as "3 h 20 min", the same units in all six
 *  languages. */
function groundTime(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// The popover's width cap and its gap to the card (house rule "Dialog
// family": a popover is at most 320 px wide, beside or under its card).
const POP_W = 320;
const POP_GAP = 8;

/**
 * Where the popover goes: beside the card when the scrolling column has
 * room on the right (then the left), else under the card, shifted so it
 * stays inside the column. Never over the card's photograph (explore N6).
 */
function placePopover(card) {
  const col = card.closest('.explore-tab') || document.documentElement;
  const b = col.getBoundingClientRect();
  const r = card.getBoundingClientRect();
  const w = Math.min(POP_W, b.width - 32);
  if (b.right - r.right >= w + POP_GAP + 8) return { side: 'right', dx: 0, w };
  if (r.left - b.left >= w + POP_GAP + 8) return { side: 'left', dx: 0, w };
  const minX = b.left + 16 - r.left;
  const maxX = b.right - 16 - w - r.left;
  return { side: 'below', dx: Math.round(Math.max(minX, Math.min(0, maxX))), w };
}

/**
 * The preview: what the card cannot fit, in a paper popover beside the card
 * (V4, T393, explore N6). It used to be an ink panel over the whole card
 * that repeated the name and score and hid the photograph; the card now
 * stays whole and the popover adds only what it cannot show: where the
 * place ranks in its country, what you do with it, what it is known for,
 * the season as a twelve-month strip (the chosen month outlined), the
 * sights, one length-of-stay line, the reach line, and the compact receipt
 * with its cost bar, the same bed and food the destination page shows.
 *
 * WCAG 1.4.13: dismissible (Escape), hoverable (a child of the card, and a
 * transparent bridge spans the gap so the pointer can travel into it),
 * persistent (nothing times it out).
 */
function CardPreview({ id, p, t, best, role, countryLine, reachMin, month, place, reveal = false }) {
  // Opened by the info control (a tap on a phone), the popover under the
  // card is brought into view if it opened below the fold.
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (reveal) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: scrollBehavior() });
  }, [reveal]);
  const stay = visitLength(p);
  const sights = placeSights(p, 3);
  const lead = knownFor(p);
  const good = p.climate?.best || [];
  return (
    <div
      id={id}
      ref={ref}
      className={`xcard-preview xpop xpop--${place.side}`}
      role="tooltip"
      style={{ '--xpop-dx': `${place.dx}px`, '--xpop-w': `${place.w}px` }}
    >
      {(countryLine || role) && (
        <p className="xpop-rank">
          {countryLine && <span>{countryLine}</span>}
          {role && <span className="xpop-role">{t(`role.short.${role.key}`)}</span>}
        </p>
      )}
      {lead && <p className="xpop-lead">{lead}</p>}
      {good.length > 0 && (
        <div className="xpop-months">
          <p className="xpop-row">
            <CalendarIcon size={12} />
            <span>{t('explore.bestMonths', { months: best })}</span>
          </p>
          <MonthStrip good={good} className={`xpop-strip${month ? ` xpop-m${month}` : ''}`} />
        </div>
      )}
      {sights.length > 0 && (
        <p className="xpop-row">
          <CameraIcon size={12} />
          <span>{sights.join(', ')}</span>
        </p>
      )}
      {stay && (
        <p className="xpop-row">
          <ClockIcon size={12} />
          <span>{t(stay.key, { n: stay.n })}</span>
        </p>
      )}
      {/* How do I get there: shown in the preview only, and only where the
          traveller's origin has a reach table (owner call, T362 on T193-f). */}
      {reachMin != null && (
        <p className="xpop-row">
          <TrainIcon size={12} />
          <span>{t('explore.reachFrom', { time: groundTime(reachMin) })}</span>
        </p>
      )}
      {p.cost?.dayEur != null && (
        <div className="xpop-cost">
          <CostReceipt cost={p.cost} t={t} compact />
        </div>
      )}
    </div>
  );
}

// The popover's delays (house rule "Dialog family"): a pointer that rests
// 150 ms, a focus that rests 400 ms (so a Tab walk through the grid does not
// strobe), the info control at once.
const HOVER_MS = 150;
const FOCUS_MS = 400;

const ExploreCard = React.memo(function ExploreCard({
  p, span, ratio, kind, role, selected, fav, onSelect, onToggleFav, t, reachMin,
  linked = false, onLink = null, seal = true, month = null,
}) {
  const best = p.climate?.best?.length ? fmtMonthRanges(p.climate.best) : null;
  // One popover, three doors: hover, focus, and the info control, which
  // pins it until it is pressed again, Escape, or a tap elsewhere.
  const [open, setOpen] = React.useState(null);
  const [place, setPlace] = React.useState(null);
  const cardRef = React.useRef(null);
  const timer = React.useRef(0);
  const popId = `xpop-${p.id}`;
  const preview = open != null;

  const later = (how, ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen((o) => (o === 'pin' ? o : how)), ms);
  };
  const drop = (how) => {
    clearTimeout(timer.current);
    setOpen((o) => (o === how ? null : o));
  };
  React.useEffect(() => () => clearTimeout(timer.current), []);

  // Placed before paint, so the popover never flashes on the wrong side.
  React.useLayoutEffect(() => {
    setPlace(preview && cardRef.current ? placePopover(cardRef.current) : null);
  }, [preview]);

  React.useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { clearTimeout(timer.current); setOpen(null); } };
    const onDown = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [preview]);

  // The country half of the verdict, only where it is earned. It lives in
  // the preview: on the card it was a fifth fact fighting four others.
  const rank = p.country_rank;
  const countryLine = rank === 1
    ? t('card.topOf', { country: p.country })
    : (p.country_badge ? t('card.rankIn', { n: rank, country: p.country }) : null);

  return (
    <div
      ref={cardRef}
      className={`xcard xcard--${kind} ${selected ? 'selected' : ''} ${preview ? 'previewing' : ''} ${linked ? 'is-linked' : ''}`}
      style={{ '--xspan': span }}
      data-id={p.id}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') later('hover', HOVER_MS); onLink?.(p.id); }}
      onPointerLeave={() => { drop('hover'); onLink?.(null); }}
    >
      <button
        className="xcard-hit"
        onClick={(e) => openShared(e.currentTarget, p.id, () => onSelect(p.id))}
        onFocus={() => { later('focus', FOCUS_MS); onLink?.(p.id); }}
        onBlur={() => { drop('focus'); onLink?.(null); }}
        aria-label={t('explore.openDest', { city: p.city })}
        aria-describedby={preview && place ? popId : undefined}
      >
        {/* The photograph, and on it only what is earned: the verdict seal
            for tier 2 and up (V4: not on a grid already filtered to a tier,
            where every card would wear it), the gem chip in its own teal,
            the star. */}
        <span className="xcard-media">
          <HeroImage
            url={p.image}
            city={p.city}
            iso2={p.iso2}
            className="xcard-img"
            maxWidth={span >= 4 ? 960 : 500}
            sizes={CARD_SIZES}
            ratio={ratio}
          />
          {seal && (p.rating?.tier ?? 0) >= 2 && (
            <span className={`xcard-seal ${tierClass(p.rating)} ${p.rating.tier === 3 ? 'xcard-seal--filled' : 'xcard-seal--outline'}`}>
              {t(`score.band${p.rating.tier}`)}
            </span>
          )}
          {p.rating?.hidden_gem && (
            <span className="xcard-gem">{t('legend.gem')}</span>
          )}
        </span>

        {/* Four facts, two lines. V3 (T383): the price leads. The name,
            the score and the euros a day share the first line (the figure
            wraps under the name on a two-up phone card); the country, the
            kind and the five-step gauge share the second. A figure with a
            national stand-in says "national" after its unit. */}
        <span className="xcard-body">
          <span className="xcard-head">
            <span className="xcard-name">{p.city}</span>
            <ScoreChip rating={p.rating} size="sm" />
            <span className="xcard-price"><CostLine cost={p.cost} t={t} gauge={false} /></span>
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
            <CostLine cost={p.cost} t={t} figure={false} />
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
        onClick={() => { clearTimeout(timer.current); setOpen((o) => (o === 'pin' ? null : 'pin')); }}
        aria-expanded={preview}
        aria-label={t('explore.moreInfo')}
        title={t('explore.moreInfo')}
      >
        <InfoIcon size={15} />
      </button>
      {preview && place && (
        <CardPreview id={popId} p={p} t={t} best={best} role={role} countryLine={countryLine}
          reachMin={reachMin} month={month} place={place} reveal={open === 'pin'} />
      )}
    </div>
  );
});

export function ExploreTab({
  data,
  isActive = true,
  pageOver = false,
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
  onOpenGuides,
}) {
  const { t } = useI18n();
  const [visible, setVisible] = React.useState(PAGE);
  // Map and list in sync (house rule, explore N5): the card under the
  // pointer or in focus rings its pin; the pin under the pointer or in focus
  // outlines its card. Two ids, one per direction, so neither echoes back.
  const [cardLinkId, setCardLinkId] = React.useState(null);
  const [pinLinkId, setPinLinkId] = React.useState(null);
  // C6: the taxonomy filters live here and in the URL, nowhere else. One
  // object, so a chip row, the rail and the query string cannot drift.
  const [xf, setXf] = React.useState(() => {
    const q = new URLSearchParams(window.location.search);
    const list = (k) => (q.get(k) ? q.get(k).split(',').filter(Boolean) : []);
    // The budget ceiling (xb). A link from before V3 carries xp=e, the old
    // fixed "Under €70 a day" toggle; it lands on a €70 ceiling.
    const xb = Number(q.get('xb'));
    const budget = Number.isFinite(xb) && xb > 0 ? xb
      : (q.get('xp')?.includes('e') ? LEGACY_CHEAP : null);
    return {
      kinds: list('xk'),
      verdicts: list('xv'),
      roles: list('xr'),
      month: q.get('xm') ? Number(q.get('xm')) : null,
      nocar: q.get('xp')?.includes('c') || false,
      badged: q.get('xp')?.includes('b') || false,
      budget,
      quiet: q.get('xp')?.includes('q') || false,
      sea: q.get('xp')?.includes('s') || false,
    };
  });
  const patchXf = React.useCallback((delta) => setXf((v) => ({ ...v, ...delta })), []);
  // V4 (T393): the list follows a filter change as a deferred value, so the
  // control answers at once and the grid dims for as long as the new list
  // takes (house motion table: opacity, --dur-2, never a spinner).
  const dxf = React.useDeferredValue(xf);
  const pending = dxf !== xf;
  // The month select defaults to the month of the traveller's own dates
  // (the settings line, T381; row T383-a): on arrival unless the link
  // carries a month, and again whenever the dates move to another month.
  // A month set by hand, or a month chip removed, stays as the traveller
  // left it until the dates change.
  const travelMonth = useTravelMonth();
  const seenMonth = React.useRef(
    new URLSearchParams(window.location.search).get('xm') ? travelMonth : null);
  React.useEffect(() => {
    if (travelMonth === seenMonth.current) return;
    seenMonth.current = travelMonth;
    if (travelMonth) patchXf({ month: travelMonth });
  }, [travelMonth, patchXf]);
  // C7: grid or map. The bbox narrows the count only WHILE the map is the
  // view - an invisible filter surviving the switch back would make the
  // grid quietly lie about what it holds.
  // The view rides the URL too (xw=map), so a map link opens on the map;
  // in the 'viewport' catalogue mode that is also what lets a map session
  // start without the grid's full download.
  const [view, setView] = React.useState(() => (
    typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('xw') === 'map' ? 'map' : 'grid'));
  const [bbox, setBbox] = React.useState(null);
  // 'viewport' catalogue mode (T059, lib/catalogue.js). The grid ranks the
  // whole of Europe, so it asks for every country. The map draws every pin
  // from the boot index and fetches the countries it has on screen once the
  // reader zooms in past the clusters; the list beside it counts what the
  // viewport holds, which is exactly what has been fetched.
  const viewportMode = CATALOGUE_MODE === 'viewport';
  const [pins, setPins] = React.useState(null);
  React.useEffect(() => {
    if (!viewportMode || !isActive) return;
    if (view === 'map') {
      if (!pins) catalogue.boot().then((b) => setPins(decodeBootIndex(b))).catch(() => {});
    } else {
      loadFullCatalogue().catch(() => {});
    }
  }, [viewportMode, isActive, view, pins]);
  const onMapViewport = React.useCallback((b, zoom) => {
    setBbox(b);
    if (viewportMode && zoom >= DETAIL_FROM) catalogue.ensureViewport(b).catch(() => {});
  }, [viewportMode]);
  const onMapNeedDetail = React.useCallback((id) => {
    catalogue.ensureIds([id]).catch(() => {});
  }, []);
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

  const { rows, availableCountries, indices: costIndex } = useExploreCatalog({
    data, locationQuery, countryFilter, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey, showFavOnly, favorites,
    indices, searchHits,
  });

  // The whole catalogue, stable for as long as the data is. The map
  // serialises THIS once and expresses the filters as a maplibre filter
  // over it, rather than re-parsing the filtered set on every keystroke
  // (P4.5).
  const allRows = React.useMemo(
    () => Object.values(data?.destinations || {}),
    [data],
  );

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
  // count shown in the control bar is THIS list's length (or, while the map
  // is up, the part of it inside the viewport), so it can never disagree
  // with what renders.
  const taxRows = React.useMemo(() => rows.filter((p) => {
    if (dxf.kinds.length && !dxf.kinds.includes(kindOf(p))) return false;
    if (dxf.verdicts.length && !dxf.verdicts.includes(String(p.rating?.tier ?? 0))) return false;
    if (dxf.roles.length && !dxf.roles.includes(roleFor(p).key)) return false;
    if (dxf.month && !(p.climate?.best || []).includes(dxf.month)) return false;
    if (dxf.nocar && !noCarOk(p)) return false;
    if (dxf.budget && !underOk(dxf.budget)(p)) return false;
    if (dxf.quiet && !quietOk(p)) return false;
    if (dxf.badged && !p.country_badge) return false;
    if (dxf.sea && !(p.categories || []).some((c) => c === 'beach' || c === 'coast' || c === 'island')) return false;
    return true;
  }), [rows, dxf, roleFor]);

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
  // the back button means what it says. First, the App-owned filters are
  // hydrated from it once on arrival. This effect is declared BEFORE the
  // writer below on purpose: effects run in order, and the writer's first run
  // (with the App filters still at their defaults) deletes xg, xu, xc and xs,
  // so a hydrate that ran second found nothing and a shared filter was lost.
  const hydrated = React.useRef(false);
  React.useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const q = new URLSearchParams(window.location.search);
    if (q.get('xg') === '1') setGemOnly(true);
    if (q.get('xu') === '1') setUnescoOnly(true);
    if (q.get('xc')) setCountryFilter(q.get('xc').split(',').filter(Boolean));
    if (q.get('xs')) setSortKey(q.get('xs'));
    // App's useState setters, so stable; the ref keeps it to one read anyway.
  }, [setGemOnly, setUnescoOnly, setCountryFilter, setSortKey]);

  // Then the writer: replaceState keeps the #trip hash and never triggers a
  // reload.
  React.useEffect(() => {
    if (!isActive) return;
    const q = new URLSearchParams(window.location.search);
    const setOrDrop = (k, v) => (v ? q.set(k, v) : q.delete(k));
    setOrDrop('xk', xf.kinds.join(','));
    setOrDrop('xv', xf.verdicts.join(','));
    setOrDrop('xr', xf.roles.join(','));
    setOrDrop('xm', xf.month || '');
    setOrDrop('xb', xf.budget || '');
    const flags = `${xf.nocar ? 'c' : ''}${xf.quiet ? 'q' : ''}${xf.sea ? 's' : ''}${xf.badged ? 'b' : ''}`;
    setOrDrop('xp', flags);
    setOrDrop('xg', gemOnly ? '1' : '');
    setOrDrop('xu', unescoOnly ? '1' : '');
    setOrDrop('xc', countryFilter.join(','));
    setOrDrop('xs', sortKey !== 'beauty' ? sortKey : '');
    setOrDrop('xw', view === 'map' ? 'map' : '');
    const qs = q.toString();
    window.history.replaceState(null, '',
      `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
  }, [xf, gemOnly, unescoOnly, countryFilter, sortKey, view, isActive]);

  // New result set: back to one page, back to the top.
  React.useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [taxRows]);
  // A pan of the map is a new page too, but not a new scroll position: the
  // map is what the reader is holding, and the list beside it just follows.
  React.useEffect(() => { setVisible(PAGE); }, [bbox, view]);

  const gridTotal = view === 'map' ? shownRows.length : taxRows.length;

  // A pin under the pointer or in focus outlines its card and brings it into
  // view, unless the reader moved the list in the last second: the list is
  // theirs while they scroll it (house rule "Map and list in sync").
  const listScrolledAt = React.useRef(0);
  const selfScrollUntil = React.useRef(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (Date.now() > selfScrollUntil.current) listScrolledAt.current = Date.now();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const onPinLink = React.useCallback((id) => {
    // While the list scrolls a card into view the sticky map can shift under
    // a still pointer, which reads as leaving the pin; that is not the reader
    // letting go, so the outline stays.
    if (!id && Date.now() < selfScrollUntil.current) return;
    setPinLinkId(id);
    if (!id || Date.now() - listScrolledAt.current < 1000) return;
    const card = scrollRef.current?.querySelector(`.xcontent-main .xcard[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    selfScrollUntil.current = Date.now() + 800;
    card.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, []);
  // The phone's Filters door. It used to be a bare <details> fold here while
  // Destinations opened a proper sheet from a Filters button, so the same
  // control looked and behaved differently on two tabs of the same app. The
  // rail itself is unchanged - it rides inside the shared sheet as `extra` -
  // and the sheet's own Apply button carries the live result count, which is
  // what the fold was protecting by staying inline.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const filterBtnRef = React.useRef(null);
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
    setTripKinds([]);
    setXf({ kinds: [], verdicts: [], roles: [], month: null, budget: null,
      nocar: false, quiet: false, sea: false, badged: false });
  };

  // C6: one chip per active filter, each removing exactly itself.
  const chips = React.useMemo(() => {
    const list = [];
    const drop = (delta) => () => patchXf(delta);
    // Trip styles first: they are the first group of the rail (V3, T383),
    // and before V3 they made no chip at all.
    for (const k of tripKinds) list.push({ key: `s:${k}`, label: t(`kind.${k}`), remove: () => setTripKinds(tripKinds.filter((x) => x !== k)) });
    if (xf.budget) list.push({ key: 'budget', label: t('explore.budgetUpTo', { eur: formatMoney(xf.budget) }), remove: drop({ budget: null }) });
    for (const k of xf.kinds) list.push({ key: `k:${k}`, label: t(`pkind.${k}`), remove: drop({ kinds: xf.kinds.filter((x) => x !== k) }) });
    for (const v of xf.verdicts) list.push({ key: `v:${v}`, label: t(`rating.tier${v}`), remove: drop({ verdicts: xf.verdicts.filter((x) => x !== v) }) });
    for (const r of xf.roles) list.push({ key: `r:${r}`, label: t(`role.short.${r}`), remove: drop({ roles: xf.roles.filter((x) => x !== r) }) });
    if (xf.month) list.push({ key: 'month', label: t('filter.goodIn') + ' ' + fmtMonthRanges([xf.month]), remove: drop({ month: null }) });
    if (xf.nocar) list.push({ key: 'nocar', label: t('filter.noCar'), remove: drop({ nocar: false }) });
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
  }, [xf, tripKinds, gemOnly, unescoOnly, countryFilter, reachHours, reachAvailable, availableCountries, t, patchXf, setTripKinds, setGemOnly, setUnescoOnly, setCountryFilter, setReachHours]);

  // The filter set last, so an empty grid can name it and offer to remove
  // just that one (brief V3-11). A chip key that was not there a render ago
  // is the newest; a restored URL has no order, so its last chip stands in.
  const prevChipKeys = React.useRef(null);
  const [lastChipKey, setLastChipKey] = React.useState(null);
  React.useEffect(() => {
    const keys = chips.map((c) => c.key);
    const prev = prevChipKeys.current;
    prevChipKeys.current = new Set(keys);
    if (!prev) return;
    const added = keys.filter((k) => !prev.has(k));
    if (added.length) setLastChipKey(added[added.length - 1]);
  }, [chips]);
  const lastChip = chips.find((c) => c.key === lastChipKey) || chips[chips.length - 1] || null;

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
          <CloseIcon size={16} />
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
    const month = xf.month || new Date().getMonth() + 1;
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
      quiet: interleaveByCountry(rows.filter(quietOk)),
    };
    // V3 (T383): the page leads with cost (house rule "Rails and cuts",
    // explore N8). Well-rated places (tier 1 and up) whose best months
    // include this month, under a ceiling: the traveller's own once the
    // input row sets one (the grid then answers instead of the rails, so in
    // practice the cheapest third of the catalogue), rounded up to the next
    // five euros so the title reads as a round figure. Sorted by day cost.
    // The rail strip shows at most two places per country among its twelve,
    // so it still rises left to right without opening on one country.
    const priced = rows.filter((p) => p.cost?.dayEur != null).map((p) => p.cost.dayEur).sort((a, b) => a - b);
    const third = priced.length ? priced[Math.floor((priced.length - 1) / 3)] : null;
    const ceiling = xf.budget || (third != null ? Math.ceil(third / 5) * 5 : null);
    const costCut = ceiling == null ? [] : rows
      .filter((p) => (p.rating?.tier ?? 0) >= 1
        && (p.climate?.best || []).includes(month)
        && underOk(ceiling)(p))
      .sort((a, b) => a.cost.dayEur - b.cost.dayEur);
    const perCountry = new Map();
    const costLead = [];
    const costRest = [];
    for (const p of costCut) {
      const n = perCountry.get(p.country) || 0;
      if (costLead.length < 12 && n < 2) { costLead.push(p); perCountry.set(p.country, n + 1); }
      else costRest.push(p);
    }
    // Each rail carries a title that names the list and a subtitle that says
    // how it was chosen: "The 41" was a number with no referent (P4.2).
    return [
      { key: 'cost',
        title: t('rail.cost', { eur: ceiling != null ? formatMoney(ceiling) : '', month: fmtMonthRanges([month]) }),
        sub: t('rail.costSub'),
        short: t('rail.costShort', { eur: ceiling != null ? formatMoney(ceiling) : '' }),
        rows: [...costLead, ...costRest],
        seeAll: () => { patchXf({ budget: ceiling, month }); setSortKey('cost'); } },
      { key: 'the43', title: t('rail.top', { n: q.the43.length }), sub: t('rail.topSub'),
        short: t('rail.topShort'), rows: q.the43,
        seeAll: () => patchXf({ verdicts: ['3'] }) },
      { key: 'gems', title: t('rail.gems'), sub: t('rail.gemsSub'), rows: q.gems,
        seeAll: () => setGemOnly(true) },
      { key: 'now', title: t('rail.now'), sub: t('rail.nowSub', { month: fmtMonthRanges([month]) }), rows: q.now,
        seeAll: () => patchXf({ month }) },
      { key: 'bestOf', title: t('rail.bestOf'), sub: t('rail.bestOfSub'), rows: q.bestOf,
        seeAll: () => patchXf({ badged: true }) },
      { key: 'villages', title: t('rail.villages'), sub: t('rail.villagesSub'), rows: q.villages,
        seeAll: () => patchXf({ kinds: ['village'], verdicts: ['1', '2', '3'] }) },
      { key: 'nocar', title: t('rail.nocar'), sub: t('rail.nocarSub'), rows: q.nocar,
        seeAll: () => patchXf({ nocar: true }) },
      { key: 'quiet', title: t('rail.quiet'), sub: t('rail.quietSub'), rows: q.quiet,
        seeAll: () => patchXf({ quiet: true }) },
    ];
  }, [railsIdle, rows, xf.month, xf.budget, t, patchXf, setGemOnly, setSortKey]);

  // The control bar's three instruments. The count is a measured figure,
  // so it is grouped the way the reader's locale groups thousands.

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
      tripKinds={tripKinds} setTripKinds={setTripKinds}
      onOpenCountry={setCountryPage}
    />
  );

  const anyActive = chips.length > 0;
  const TitleTag = isActive && !pageOver ? 'h1' : 'div';

  // The count the control bar states (brief V3-1): what the view holds, from
  // the same list the grid renders, grouped the way the reader's locale
  // groups thousands. On the map it is what the viewport holds.
  const countText = view === 'map'
    ? t('explore.countMap', { n: fmtCount(gridTotal) })
    : t(gridTotal === 1 ? 'explore.countOne' : 'explore.count', { n: fmtCount(gridTotal) });
  // V4 (T393): a count that changes settles in place (house rule "Figure in
  // place", settleFigure in lib/figureChange.js): one opacity dip, the box
  // keeps its width, nothing counts up; none under reduced motion.
  const countRef = React.useRef(null);
  useSettledFigure(countRef, countText);
  // The verdict seal says what a tier means; on a grid already filtered to
  // tiers every card would wear it, so it carries nothing there.
  const sealOn = dxf.verdicts.length === 0;

  // The input row (brief V3-3, house rules "Settings line", "Budget ceiling"
  // and "Month"): every input the figures and the list depend on, visible
  // without opening anything, in the traveller's order: what they can spend,
  // when, without a car, and what they kept. How they travel (Lifestyle) is
  // the shell's settings line right above (T381); V4 (T393) removed this
  // row's own Lifestyle door, a second door to the one dialog (rows T381-b,
  // T383-a). Each shows its current value in words. The ceiling's steps are
  // fixed; an old link's €70 (xp=e) shows as its own step.
  const budgetSteps = xf.budget && !BUDGET_STEPS.includes(xf.budget)
    ? [...BUDGET_STEPS, xf.budget].sort((x, y) => x - y)
    : BUDGET_STEPS;
  const inputRow = (
    <div className="xinputs" role="group" aria-label={t('explore.inputsAria')}>
      <span className={`xinput xinput--select ${xf.budget ? 'is-set' : ''}`.trim()}>
        <select
          value={xf.budget ?? ''}
          aria-label={t('explore.budgetLabel')}
          onChange={(e) => patchXf({ budget: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{t('explore.budgetAny')}</option>
          {budgetSteps.map((n) => (
            <option key={n} value={n}>{t('explore.budgetUpTo', { eur: formatMoney(n) })}</option>
          ))}
        </select>
        <ChevronDownIcon size={14} className="xinput-chev" />
      </span>
      <span className={`xinput xinput--select ${xf.month ? 'is-set' : ''}`.trim()}>
        <select
          value={xf.month || ''}
          aria-label={t('filter.goodIn')}
          onChange={(e) => patchXf({ month: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{t('filter.anyMonth')}</option>
          {MONTHS_SHORT.map((m, i) => (
            <option key={m} value={i + 1}>{t('explore.goodInMonth', { month: m })}</option>
          ))}
        </select>
        <ChevronDownIcon size={14} className="xinput-chev" />
      </span>
      <button
        type="button"
        className={`xinput xinput--toggle ${xf.nocar ? 'on' : ''}`.trim()}
        aria-pressed={xf.nocar}
        onClick={() => patchXf({ nocar: !xf.nocar })}
      >
        {t('filter.noCar')}
      </button>
      <button
        type="button"
        className={`xinput xinput--toggle xinput--fav ${showFavOnly ? 'on' : ''}`.trim()}
        aria-pressed={showFavOnly}
        aria-label={t('explore.shortlistAria', { n: favSet.size })}
        onClick={() => setShowFavOnly(!showFavOnly)}
      >
        <Star filled={showFavOnly} />
        <span>{t('explore.shortlist')}</span>
        <span className="xinput-n mono">{favSet.size}</span>
      </button>
    </div>
  );

  return (
    <div className="explore-shell">
      {headerSlot && createPortal(searchField, headerSlot)}

      {/* Desktop-only left panel (CSS hides it under 769px): the filter
          rail in folds, trip styles first, with one hairline to the panel's
          right. V3 (T383): the trip-style tiles became the rail's first
          group, and Lifestyle and the shortlist moved into the input row
          over the grid, where the figures they change are. */}
      <aside className="side-panel explore-side" aria-label={t('filter.filters')}>
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
        </div>
      </aside>

      <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* Phone only (CSS hides it from 769px): search and the Filters
            door share one row (brief V3-4). The trip styles live in the
            sheet now, and Lifestyle and the shortlist in the input row. */}
        <div className="explore-filterbar xtop">
          {/* On desktop the same field has portalled into the app header
              and this renders nothing. */}
          {!headerSlot && searchField}
          <button
            type="button"
            ref={filterBtnRef}
            className={`places-filter-btn ${anyActive ? 'has-active' : ''}`}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
          >
            <FilterIcon size={14} />
            <span>{t('filter.filters')}</span>
            {chips.length > 0 && <span className="filter-tray-badge">{chips.length}</span>}
          </button>
        </div>

        {/* The control bar: what this page is and how many places it holds
            right now (the count, V3), and the two ways to rearrange them.
            On a phone the title is read but not drawn, so the count is the
            visible line, sharing its row with the sort; the grid/map switch
            floats above the bottom nav instead (.xview-fab). */}
        <div className="xbar">
          <div className="xbar-lead">
            {/* The page's one h1, only while this tab is the one showing:
                the tab stays mounted under Destinations, and its h1 made a
                second one there (row T380-g). Hidden, it is a plain div. */}
            <TitleTag className="xbar-title">
              <span className="xbar-title-text">{t('explore.title')}</span>
              {' '}
              <span className="xbar-count mono" ref={countRef}>{countText}</span>
            </TitleTag>
            {isMock && <span className="explore-mock">Mock data</span>}
          </div>
          <div className="xbar-tools">
            {viewToggle('')}
            {sortSelect}
          </div>
        </div>

        {inputRow}

        {/* C6: active filters as removable chips, right under the bar. */}
        <FilterChips t={t} chips={chips} onClearAll={resetAll} />

        {/* C8: the tiers and their live counts, folding to "Score key" once
            read. V3: counted over the same rows as the grid and the rails. */}
        <TierLegend data={data} rows={rows} />

        {/* The one community surface on a browse tab: a real count of what
            people have published, and one door. Absent entirely when
            nothing is published. */}
        <GuidesStrip onOpen={onOpenGuides} />

        {countryFilter.length === 1 && (
          <button className="cpage-banner" onClick={() => setCountryPage(countryFilter[0])}>
            {t('cpage.open', {
              country: (availableCountries.find(([c]) => c === countryFilter[0]) || [])[1]
                || countryFilter[0],
            })}
            <ChevronRightIcon size={15} />
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
          {/* The map comes first in the DOM and CSS puts it in the right
              column (T190): the keyboard reaches the map the reader just
              asked for straight after the control bar, instead of after
              every card of an infinitely scrolling list, which on a long
              list meant never. */}
          {view === 'map' && (
            <div className="xcontent-map">
              {/* While maplibre downloads, the frame the map will fill is
                  already drawn at its final size: a skeleton, not the app's
                  full-screen pulse, so nothing jumps when the canvas lands. */}
              <React.Suspense fallback={(
                <div className="xmap xmap-skel">
                  <LoadingBlock label={t('explore.mapLoading')} rows={1} shape="card" />
                </div>
              )}>
                <ExploreMap rows={taxRows} all={allRows} pins={viewportMode ? pins : null}
                  onSelect={openWithMember} onViewport={onMapViewport}
                  onNeedDetail={onMapNeedDetail} t={t}
                  ringId={cardLinkId} onPinLink={onPinLink} costs={costIndex}
                  onBack={() => setView('grid')} />
              </React.Suspense>
            </div>
          )}
          <div className="xcontent-main">
            {railsIdle && <ExploreRails rails={rails} onSelect={openWithMember} t={t} />}

            {gridTotal === 0 && (
              <div className="explore-count xempty" role="status">
                {/* V3 (T383, brief V3-11): an empty grid names what emptied
                    it and offers the one action that changes the result:
                    the search when one is typed, else the filter set last
                    ("Remove ..."), with "Clear all" beside it once two or
                    more are on. An empty shortlist offers the way back. */}
                <p className="xempty-line">
                  {showFavOnly
                    ? t('results.emptyFav')
                    : locationQuery
                      ? t('explore.emptySearch', { q: locationQuery })
                      : lastChip
                        ? t('explore.emptyCause', { filter: lastChip.label })
                        : t('results.empty')}
                </p>
                <span className="xempty-actions">
                  {showFavOnly ? (
                    <button type="button" className="cov-empty-btn explore-empty-clear"
                      onClick={() => setShowFavOnly(false)}>
                      {t('explore.showAll')}
                    </button>
                  ) : locationQuery ? (
                    <button type="button" className="cov-empty-btn explore-empty-clear"
                      onClick={() => setLocationQuery('')}>
                      {t('results.clearSearch')}
                    </button>
                  ) : lastChip ? (
                    <>
                      <button type="button" className="cov-empty-btn explore-empty-clear"
                        onClick={lastChip.remove}>
                        {t('explore.removeFilter', { filter: lastChip.label })}
                      </button>
                      {chips.length > 1 && (
                        <button type="button" className="xempty-all" onClick={resetAll}>
                          {t('filter.clearAll')}
                        </button>
                      )}
                    </>
                  ) : null}
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
              </div>
            )}

            <div className={`explore-grid explore-grid--mosaic${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
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
                  reachMin={reachMinutes?.get(p.id) ?? null}
                  linked={view === 'map' && p.id === pinLinkId}
                  onLink={view === 'map' ? setCardLinkId : null}
                  seal={sealOn}
                  month={dxf.month}
                />
              ))}
            </div>

            {visible < gridTotal && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}
          </div>
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

      {/* The same sheet shell Destinations opens, with this tab's own rail as
          its body. `groups` and `countryOptions` stay empty on purpose: the
          rail already owns both, and the sheet rendering its own country
          dropdown on top of the rail's would be the duplicate control this
          change exists to remove. */}
      {sheetOpen && (
        <PlacesFilterSheet
          onClose={() => setSheetOpen(false)}
          anchorRef={filterBtnRef}
          groups={[]}
          countryOptions={[]}
          extra={filterRail}
          activeFilters={chips.length}
          resetAll={resetAll}
          resultCount={gridTotal}
        />
      )}
    </div>
  );
}
