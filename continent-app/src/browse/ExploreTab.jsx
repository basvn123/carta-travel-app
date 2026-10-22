import React from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { fmtMonthRanges, MONTHS_SHORT } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterRail, minVerdict } from './ExploreFilterRail.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { ExploreRails, interleaveByCountry } from './ExploreRails.jsx';
import { ExploreCategories } from './ExploreCategories.jsx';
import { TripStylesRow } from './TripStylesRow.jsx';
import { EmptyResult } from './EmptyResult.jsx';
import { FilterChips } from './FilterChips.jsx';
import { kindOf, roleOf, buildNearbyIndex } from '../lib/taxonomy.js';
import { loadSearchIndex, querySearchIndex } from '../lib/searchIndex.js';
import { useI18n } from '../i18n/index.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FULL_RATING_RANGE } from '../lib/rating.js';
import {
  FilterIcon, CalendarIcon, CameraIcon, ClockIcon, TrainIcon,
  ChevronDownIcon, ChevronRightIcon, MapPinIcon, ListDayIcon, CloseIcon,
} from '../components/Icons.jsx';
import { useTravelMonth, useSettings } from '../components/SettingsLine.jsx';
import { cheapestReturn } from '../lib/flights/flights.js';
import { destAnchor, originLabel } from '../lib/origins.js';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { LoadingBlock } from '../components/StateBlocks.jsx';

// The map is the ONE thing in this tab that pulls maplibre-gl (~930 KB raw),
// and the tab opens on the grid. Imported statically it was hoisted into the
// entry chunk, so every visitor paid for a library most never render - which
// also silently defeated the lazy() wrappers on TrailPage / CyclePage /
// DestMap / the planner tabs, since maplibre was already in the main bundle
// by the time they loaded. Loading it here on the first switch to map view
// takes it (and maplibre-gl.css) off the critical path.
const loadExploreMap = () => import('./ExploreMap.jsx');
const ExploreMap = React.lazy(
  () => loadExploreMap().then((m) => ({ default: m.ExploreMap })),
);
// T441: fetch the map's code before it is asked for, when the browser is idle
// after the first paint and again the moment a pointer or focus reaches the
// Map switch, unless the reader saves data or sits on a slow line. The
// basemap's two hosts are warmed at the same moment (here, not in index.html,
// so a visit that never reaches Explore opens no connection to them).
const MAP_HOSTS = ['https://basemaps.cartocdn.com', 'https://tiles.basemaps.cartocdn.com'];
let mapPrefetched = false;
function prefetchMap() {
  if (mapPrefetched) return;
  const c = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  mapPrefetched = true;
  for (const href of MAP_HOSTS) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
  loadExploreMap().catch(() => { mapPrefetched = false; });
}
import { CostReceipt } from '../components/CostSummary.jsx';
import { Button, Chip, IconButton, Segmented } from '../components/ui/index.js';
import { PlaceOverview } from './PlaceOverview.jsx';
import { overviewRegion, overviewReason, overviewScore, reasonText } from '../lib/placeOverview.js';
import { MapDrawer } from '../components/MapDrawer.jsx';
import { useGuidedData, vibeOf } from '../lib/guidedData.js';
import { AskChatDoor, AskChatHost } from './ask/AskChatButton.jsx';
import {
  noCarOk, underOk, quietOk, matchGuided, guidedComparator, whyFacts, makeLabels,
} from '../lib/guidedSearch.js';
import { visitLength } from '../lib/nearby.js';
import { placeSights } from '../lib/placeStory.js';
import { knownFor } from '../lib/knownFor.js';
import { catalogue, CATALOGUE_MODE, loadFullCatalogue } from '../lib/appData.js';
import { decodeBootIndex } from '../lib/bootIndex.js';
import { formatMoney } from '../lib/money.js';
import { computeCosts } from '../lib/costIndex.js';

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
// The phone drawer's rows: the places on the map, best first, at most this
// many (the list view holds the rest).
const DRAWER_MAX = 60;

// The shared predicates (no car, under a budget, quiet) live in
// lib/guidedSearch.js since T442, so the rails, the filters and the guided
// search read one definition each.

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
  p, role, selected, fav, onSelect, onToggleFav, t, reachMin,
  linked = false, onLink = null, month = null, region = null, reason = null, rating = null,
}) {
  const best = p.climate?.best?.length ? fmtMonthRanges(p.climate.best, t) : null;
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

  // T504 (roadmap 1.5): the row IS the place's one overview, the same
  // component the map's selected place and the phone's drawer draw. The
  // popover beside it adds what a row cannot fit; it is not a second overview.
  return (
    <PlaceOverview
      p={p} region={region} reason={reason} rating={rating} fav={fav} onToggleFav={onToggleFav} t={t}
      selected={selected} linked={linked}
      className={preview ? 'previewing' : ''}
      rootRef={cardRef}
      rootProps={{
        onPointerEnter: (e) => { if (e.pointerType === 'mouse') later('hover', HOVER_MS); onLink?.(p.id); },
        onPointerLeave: () => { drop('hover'); onLink?.(null); },
      }}
      hitProps={{
        onFocus: () => { later('focus', FOCUS_MS); onLink?.(p.id); },
        onBlur: () => { drop('focus'); onLink?.(null); },
        'aria-describedby': preview && place ? popId : undefined,
      }}
      onOpen={(e) => openShared(e.currentTarget, p.id, () => onSelect(p.id))}
    >
      {preview && place && (
        <CardPreview id={popId} p={p} t={t} best={best} role={role} countryLine={countryLine}
          reachMin={reachMin} month={month} place={place} reveal={open === 'pin'} />
      )}
    </PlaceOverview>
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
  // T534: with a month picked in the filter, beds are repriced for that month.
  choices = null,
  isMock = false,
  onOpenGuides,
  // T498 (roadmap 1.3b): the country page is App's (#country=), the six
  // category tiles hand over to App's one door for a layer, and the trip
  // library opens from the Trip styles row.
  onOpenCountry = null,
  onPickCategory = null,
  onOpenStyles = null,
  // T462: a search handed over from the home page, once: { facets } applies
  // a guided question, { open: true } opens the search panel on arrival.
  seed = null, onSeedConsumed = null,
  // T558: Ask Carta hands a route to the trip planner (App's openTripInPlanner).
  onPlanTrip = null,
  // T574: the chat, asked from another place, shows its places on Explore.
  onShowExplore = null,
}) {
  const { t, lang } = useI18n();
  // The guided search data (T439): vibes, areas and distances. Loaded on
  // idle; the hiking and beach rails and the vibe filter read it.
  const guided = useGuidedData(isActive);
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
      // A vibe from the guided search data (T427): "hiking", "beach", ...
      vibe: q.get('xe') || null,
      // The guided search's own facets (T442): a named area (xa), within
      // 50 km of a place (xn), and a beach, trails or a lake close by (xd).
      area: q.get('xa') || null,
      near: q.get('xn') || null,
      nb: list('xd'),
    };
  });
  const patchXf = React.useCallback((delta) => setXf((v) => ({ ...v, ...delta })), []);
  // V4 (T393): the list follows a filter change as a deferred value, so the
  // control answers at once and the grid dims for as long as the new list
  // takes (house motion table: opacity, --dur-2, never a spinner).
  const dxf = React.useDeferredValue(xf);
  const pending = dxf !== xf;
  // The traveller's own dates name a month, and that month feeds the rails
  // ("Best in October"). It is no longer written into the month filter
  // (T427, reversing T383-a): the auto-filled month made a filter chip, and
  // a chip hid every rail the moment a traveller set dates.
  const travelMonth = useTravelMonth();
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
  // T504 (roadmap 1.5): the place the traveller picked, on the map or by
  // opening it from the list. One id for both views, so List | Map keeps it
  // (rule 7): the pin is the one brown item on the map, the row the one row
  // with the brown edge. It rides the URL as xi=.
  const [pickedId, setPickedId] = React.useState(() => (
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('xi') || null : null));
  // The phone's map drawer (T500's MapDrawer): strip, half or full.
  const [drawer, setDrawer] = React.useState('strip');
  // The map mounts on its first open and stays (T441).
  const [mapOpened, setMapOpened] = React.useState(view === 'map');
  React.useEffect(() => { if (view === 'map') setMapOpened(true); }, [view]);
  React.useEffect(() => {
    if (!isActive) return undefined;
    const idle = window.requestIdleCallback;
    const h = idle ? idle(prefetchMap, { timeout: 4000 }) : setTimeout(prefetchMap, 2500);
    return () => { if (idle) window.cancelIdleCallback?.(h); else clearTimeout(h); };
  }, [isActive]);
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
    window.history.replaceState(window.history.state, '',
      `${window.location.pathname}?${q.toString()}${window.location.hash}`);
    onSelect(id);
  }, [searchHits, onSelect]);
  const sentinelRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  // T534: a month in the filter prices every card's bed for that month (the
  // measured month curve), so "November" shows November's prices.
  const monthIndices = React.useMemo(
    () => (dxf.month && data && indices
      ? computeCosts(data.destinations, { ...(choices || {}), month: dxf.month })
      : indices),
    [dxf.month, data, choices, indices],
  );
  const { all: catAllRows, rows: catRows, availableCountries, indices: costIndex } = useExploreCatalog({
    data, locationQuery, countryFilter, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey, showFavOnly, favorites,
    indices: monthIndices, searchHits,
  });

  // T518: the cheapest return flight a person from the home airport's sweep
  // (data.flights), in the travel month: the traveller's own month when they
  // set dates (travelMonth), else the month of the dates in use. It rides on
  // the row's cost as `cost.flight`, so the row, the tile and the hover
  // receipt read it where they read the day price (DayPrice, CostReceipt).
  // A place with no flight that month keeps its row object untouched.
  const settingsLine = useSettings();
  const flights = data?.flights || null;
  const flightMonth = settingsLine?.departDate
    ? String(settingsLine.departDate).slice(0, 7)
    : new Date().toISOString().slice(0, 7);
  const flightRows = React.useMemo(() => {
    if (!flights || !data?.destinations) return null;
    const m = new Map();
    for (const p of catAllRows) {
      const r = cheapestReturn(flights, destAnchor(data.destinations[p.id]), flightMonth);
      if (r) m.set(p.id, { ...p, cost: { ...p.cost, flight: { perSeat: r.perSeat, airline: r.out.airline } } });
    }
    return m;
  }, [catAllRows, flights, flightMonth, data]);
  const allRows = React.useMemo(
    () => (flightRows?.size ? catAllRows.map((p) => flightRows.get(p.id) || p) : catAllRows),
    [catAllRows, flightRows],
  );
  const rows = React.useMemo(
    () => (flightRows?.size ? catRows.map((p) => flightRows.get(p.id) || p) : catRows),
    [catRows, flightRows],
  );

  // The guided search's context (T442): the place a "near" facet names (from
  // the list's own merged catalogue), and the one way each facet is named.
  const nearRow = React.useMemo(
    () => (xf.near ? allRows.find((p) => p.id === xf.near) || null : null),
    [xf.near, allRows],
  );
  const gctx = React.useMemo(() => ({ guided, nearRow }), [guided, nearRow]);
  const gLabels = React.useMemo(
    () => makeLabels({ t, lang, guided, countries: availableCountries }),
    [t, lang, guided, availableCountries],
  );
  // The why line under a result, while a guided facet is on.
  const whyOn = !!(dxf.vibe || dxf.area || dxf.near || dxf.nb.length);
  const whyOf = React.useCallback(
    (p) => whyFacts(p, dxf, { ...gctx, t, lang, labels: gLabels }).join(', ') || null,
    [dxf, gctx, t, lang, gLabels],
  );
  // T504 (roadmap 1.5): what a place says in its one overview, worked out
  // once per place for the list, the map's picked card and the phone's
  // drawer alike. The month is the one set by hand, else the month of the
  // traveller's dates; without one the overview shows the base Score.
  const ovMonth = dxf.month || travelMonth || null;
  const overviewOf = React.useCallback((p) => ({
    region: overviewRegion(guided, p.id, lang),
    rating: overviewScore(p, ovMonth),
    reason: reasonText(
      overviewReason(p, { month: ovMonth, why: whyOn ? whyOf(p) : null }),
      t,
      { monthName: gLabels.monthInline, monthRanges: (ms) => fmtMonthRanges(ms, t) },
    ),
  }), [guided, lang, ovMonth, whyOn, whyOf, t, gLabels]);

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
    // The guided facets (vibe, area, near, close by) hold only once the
    // guided data has landed; until then the list waits empty rather than
    // showing places that may not match (T442).
    if ((dxf.vibe || dxf.area || dxf.near || dxf.nb.length) && !matchGuided(p, dxf, gctx)) return false;
    return true;
  }), [rows, dxf, roleFor, gctx]);
  // A guided question ranks its answer: nearest first around a place, the
  // strongest vibe first otherwise, while the reader keeps the default sort.
  const guidedRows = React.useMemo(() => {
    if (sortKey && sortKey !== 'beauty') return taxRows;
    // (T444: under a guided question "beauty" reads "Best match"; picking
    // "Rating" sets "rating", which the catalogue sorts by rating.)
    const cmp = guidedComparator(dxf, gctx);
    return cmp ? [...taxRows].sort(cmp) : taxRows;
  }, [taxRows, dxf, gctx, sortKey]);

  // C7: what the map's viewport holds, counted live while the map is shown.
  const shownRows = React.useMemo(() => {
    if (view !== 'map' || !bbox) return guidedRows;
    const [w, so, e, n] = bbox;
    return guidedRows.filter((p) => {
      const lat = p.city_lat ?? p.lat;
      const lon = p.city_lon ?? p.lon;
      return lat >= so && lat <= n && lon >= w && lon <= e;
    });
  }, [guidedRows, view, bbox]);

  // One list shape everywhere (T427): compact rows, beside the map too.
  const listed = React.useMemo(
    () => (view === 'map' ? shownRows : guidedRows).slice(0, visible),
    [guidedRows, shownRows, view, visible],
  );

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
    setOrDrop('xe', xf.vibe || '');
    setOrDrop('xa', xf.area || '');
    setOrDrop('xn', xf.near || '');
    setOrDrop('xd', xf.nb.join(','));
    setOrDrop('xg', gemOnly ? '1' : '');
    setOrDrop('xu', unescoOnly ? '1' : '');
    setOrDrop('xc', countryFilter.join(','));
    setOrDrop('xs', sortKey !== 'beauty' ? sortKey : '');
    setOrDrop('xw', view === 'map' ? 'map' : '');
    setOrDrop('xi', pickedId || '');
    const qs = q.toString();
    // The state rides along: it marks the history step a place opened.
    window.history.replaceState(window.history.state, '',
      `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
  }, [xf, gemOnly, unescoOnly, countryFilter, sortKey, view, pickedId, isActive]);

  // New result set: back to one page, back to the top. Keyed on what the set
  // holds, not on the array's identity (T502: a return to Explore rebuilt the
  // same rows and threw the reader back to the top).
  const taxKey = `${taxRows.length}:${taxRows[0]?.id ?? ''}:${taxRows[taxRows.length - 1]?.id ?? ''}`;
  React.useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [taxKey]);
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
    const card = scrollRef.current?.querySelector(`.xcontent-main .xrow[data-id="${CSS.escape(id)}"]`);
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
      nocar: false, quiet: false, sea: false, badged: false, vibe: null,
      area: null, near: null, nb: [] });
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
    // One chip for the rating, "Excellent and up" (T440): the rail asks for
    // a band and every band above it.
    if (xf.verdicts.length) {
      list.push({ key: 'rating', label: t('filter.ratingAtLeast', { band: t(`score.band${minVerdict(xf.verdicts)}`) }), remove: drop({ verdicts: [] }) });
    }
    for (const r of xf.roles) list.push({ key: `r:${r}`, label: t(`role.short.${r}`), remove: drop({ roles: xf.roles.filter((x) => x !== r) }) });
    if (xf.month) list.push({ key: 'month', label: t('gs.whyMonth', { month: gLabels.monthInline(xf.month) }), remove: drop({ month: null }) });
    if (xf.nocar) list.push({ key: 'nocar', label: t('filter.noCar'), remove: drop({ nocar: false }) });
    if (xf.quiet) list.push({ key: 'quiet', label: t('filter.notCrowded'), remove: drop({ quiet: false }) });
    if (xf.sea) list.push({ key: 'sea', label: t('filter.nearSea'), remove: drop({ sea: false }) });
    if (xf.badged) list.push({ key: 'badged', label: t('filter.bestOf'), remove: drop({ badged: false }) });
    if (xf.vibe) list.push({ key: 'vibe', label: gLabels.vibe(xf.vibe), remove: drop({ vibe: null }) });
    if (xf.area) list.push({ key: 'area', label: gLabels.area(xf.area), remove: drop({ area: null }) });
    if (xf.near) list.push({ key: 'near', label: t('gs.near', { place: nearRow?.city || xf.near }), remove: drop({ near: null }) });
    for (const x of xf.nb) list.push({ key: `nb:${x}`, label: gLabels.extra(x), remove: drop({ nb: xf.nb.filter((y) => y !== x) }) });
    if (gemOnly) list.push({ key: 'gem', label: t('rail.gems'), remove: () => setGemOnly(false) });
    if (unescoOnly) list.push({ key: 'unesco', label: t('dest.unesco'), remove: () => setUnescoOnly(false) });
    if (showFavOnly) list.push({ key: 'fav', label: t('filter.shortlistOnly'), remove: () => setShowFavOnly(false) });
    for (const iso2 of countryFilter) {
      const name = (availableCountries.find(([c]) => c === iso2) || [])[1] || iso2;
      list.push({ key: `c:${iso2}`, label: name, remove: () => setCountryFilter(countryFilter.filter((x) => x !== iso2)) });
    }
    if (reachAvailable && reachHours != null) list.push({ key: 'reach', label: t('filter.reachHours', { n: reachHours }), remove: () => setReachHours(null) });
    return list;
  }, [xf, tripKinds, gemOnly, unescoOnly, showFavOnly, countryFilter, reachHours, reachAvailable, availableCountries, t, patchXf, setTripKinds, setGemOnly, setUnescoOnly, setShowFavOnly, setCountryFilter, setReachHours, gLabels, nearRow]);

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

  // The one "no match" sentence (T504, row T502-g): the list's empty block
  // and the search panel both say it, so an empty search never shows two.
  const emptyLine = showFavOnly
    ? t('results.emptyFav')
    : locationQuery
      ? t('explore.emptySearch', { q: locationQuery })
      : lastChip
        ? t('explore.emptyCause', { filter: lastChip.label })
        : t('results.empty');

  // Desktop chrome: Ask Carta's door portals into the app header's slot on
  // every place (T574: Explore hosts the one chat and stays mounted, so the
  // door is there on Plan and My trips too) and the controls stand in the
  // left panel; the phone keeps the toolbar card.
  const isDesktop = useIsDesktop();
  const [headerSlot, setHeaderSlot] = React.useState(null);
  React.useEffect(() => {
    if (isDesktop) setHeaderSlot(document.getElementById('header-search-slot'));
    else setHeaderSlot(null);
  }, [isDesktop]);

  // T504: picking and opening. A pin picks a place (the overview shows);
  // the overview, a second tap on the same pin, or a list row opens it. A
  // place opened from the list is the pick too, so the map and the list
  // agree on the way back.
  const openPlace = React.useCallback((id) => {
    setPickedId(id);
    openWithMember(id);
  }, [openWithMember]);
  const onPick = React.useCallback((id) => {
    setPickedId(id || null);
    // On a phone the drawer rises to half with the picked place on top, and
    // a tap on the open map lowers it again (design 1.5 C, question 7).
    if (!isDesktop) setDrawer((d) => (id ? (d === 'strip' ? 'half' : d) : 'strip'));
  }, [isDesktop]);
  // The picked place, while it survives the filters; filtered out, it
  // leaves the map and the list together.
  const pickedRow = React.useMemo(
    () => (pickedId ? guidedRows.find((p) => p.id === pickedId) || null : null),
    [pickedId, guidedRows],
  );
  // Back on the list, the picked row is in view (rule 7); on a desktop the
  // list beside the map follows a pick the same way.
  React.useEffect(() => {
    if (!pickedId || !isActive) return;
    if (view === 'map' && !isDesktop) return;
    const row = scrollRef.current?.querySelector(`.xcontent-main .xrow[data-id="${CSS.escape(pickedId)}"]`);
    if (!row) return;
    selfScrollUntil.current = Date.now() + 800;
    row.scrollIntoView({ block: view === 'map' ? 'nearest' : 'center', behavior: scrollBehavior() });
    // Only a new pick or a new view moves the list, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedId, view, isActive]);

  // The guided search (T442) replaces the free text field: in the header on
  // a desktop, at the top of the tab on a phone. It writes Explore's own
  // filters; `replace` starts the question over (an example, Clear).
  const applyGuided = React.useCallback((delta, replace = false) => {
    const next = replace
      ? { vibe: null, area: null, near: null, month: null, budget: null, nb: [], nocar: false, quiet: false, ...delta }
      : { ...delta };
    if ('country' in next || replace) {
      setCountryFilter(next.country ? [next.country] : []);
      delete next.country;
    }
    if ('sort' in next || (replace && sortKey === 'cost')) {
      setSortKey(next.sort === 'cost' ? 'cost' : 'beauty');
      delete next.sort;
    }
    patchXf(next);
  }, [patchXf, setCountryFilter, setSortKey, sortKey]);
  // The home page's hand-over (T462): the question replaces whatever was
  // asked before, the list starts at its top, and the field opens when the
  // visitor asked for the search itself. Only the field this width shows
  // takes the open request (the header one on a desktop, the tab's own on
  // a phone), so a hidden twin never opens a sheet of its own.
  const [openRequest, setOpenRequest] = React.useState(false);
  const [askSeed, setAskSeed] = React.useState(null);
  const clearOpenRequest = React.useCallback(() => setOpenRequest(false), []);
  // A request Explore could not take (the visitor left before it opened)
  // must not open the panel on a later visit.
  React.useEffect(() => { if (!isActive) setOpenRequest(false); }, [isActive]);
  React.useEffect(() => {
    if (!seed) return;
    if (seed.facets) {
      applyGuided(seed.facets, true);
      setVisible(PAGE);
    }
    if (seed.open) setOpenRequest(true);
    // T566: a question typed on Home is asked here at once.
    if (seed.question) {
      setAskSeed({ text: String(seed.question), n: Date.now() });
      setOpenRequest(true);
    }
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per hand-over: each seed is a new object
  }, [seed]);
  // Ask Carta (T558) takes the guided search's place and the budget card's:
  // one box for any question, its answer priced on the same inputs as the
  // list (the Lifestyle, the bed, the home airport's flights), and the five
  // slots kept inside it, so "Show all" is still applyGuided().
  const askPrice = React.useMemo(() => ({
    lifestyle: settingsLine?.lifestyle || null,
    stayTier: settingsLine?.stayTier || 'home',
    flights: data?.flights || null,
    dests: data?.destinations || null,
    origin: settingsLine?.origin || null,
  }), [settingsLine?.lifestyle, settingsLine?.stayTier, settingsLine?.origin, data?.flights, data?.destinations]);
  // T570: Ask Carta is a chat behind one small button (the header on
  // desktop, beside Filters on a phone), its trip card priced from the same
  // home airport, dates and party as the list.
  const askTrip = React.useMemo(() => ({
    origin: settingsLine?.origin || null,
    originName: settingsLine?.origin ? originLabel(data, settingsLine.origin) : '',
    flights: data?.flights || null,
    depart: settingsLine?.departDate || null,
    back: settingsLine?.returnDate || null,
    party: settingsLine?.party || 2,
    stayTier: settingsLine?.stayTier || 'home',
    destinations: data?.destinations || null,
  }), [settingsLine?.origin, settingsLine?.departDate, settingsLine?.returnDate, settingsLine?.party, settingsLine?.stayTier, data]);
  // T573: the filters on Explore now, which the chat offers to keep or
  // ignore; the rows are the list they make.
  const askFilters = React.useMemo(() => ({ labels: chips.map((c) => c.label), rows }), [chips, rows]);
  const askHost = (
    <AskChatHost
      t={t}
      lang={lang}
      guided={guided}
      rows={allRows}
      countries={availableCountries}
      labels={gLabels}
      price={askPrice}
      trip={askTrip}
      onApply={(facets, keep) => {
        applyGuided(facets, !keep);
        // Asked from another place (T574): Explore shows the list.
        if (!isActive) onShowExplore?.();
      }}
      filters={askFilters}
      onOpenPlace={openWithMember}
      onPlanTrip={onPlanTrip}
      favorites={favorites}
      onToggleFav={onToggleFav}
      openRequest={openRequest && isActive}
      seed={askSeed}
      onOpenRequested={clearOpenRequest}
    />
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
    // The month the rails speak about: one set by hand, else the month of
    // the traveller's dates, else this month (T427).
    const month = xf.month || travelMonth || new Date().getMonth() + 1;
    const monthName = new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, month - 1, 15));
    const inSeason = (p) => (p.climate?.best || []).includes(month);
    const byRating = (a, b) => (b.rating?.score || 0) - (a.rating?.score || 0);
    const q = {
      top: rows.filter((p) => p.rating?.tier === 3),
      gems: interleaveByCountry(rows.filter((p) => p.rating?.hidden_gem)),
      now: interleaveByCountry(rows.filter((p) => inSeason(p) && (p.rating?.tier ?? 0) >= 2).sort(byRating)),
      hiking: guided ? interleaveByCountry(rows.filter((p) => vibeOf(guided, p.id, 'hiking') >= 80).sort(byRating)) : [],
      beach: guided ? interleaveByCountry(rows.filter((p) => inSeason(p) && vibeOf(guided, p.id, 'beach') >= 80).sort(byRating)) : [],
      nocar: interleaveByCountry(rows.filter(noCarOk)),
      // Quiet in high season says something only in June to September.
      quiet: month >= 6 && month <= 9 ? interleaveByCountry(rows.filter(quietOk)) : [],
      saved: favorites && favorites.size ? rows.filter((p) => favorites.has(p.id)) : [],
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
    // The sections (T427): a question each, no subtitle, no count. The
    // traveller's shortlist leads when it holds anything.
    return [
      { key: 'saved', title: t('rail.shortlist'), rows: q.saved,
        seeAll: () => setShowFavOnly(true) },
      { key: 'now', title: t('rail.bestIn', { month: monthName }), short: t('rail.bestIn', { month: monthName }),
        rows: q.now, seeAll: () => { patchXf({ month, verdicts: ['2', '3'] }); } },
      { key: 'cost',
        title: t('rail.cost', { eur: ceiling != null ? formatMoney(ceiling) : '', month: monthName }),
        short: t('rail.costShort', { eur: ceiling != null ? formatMoney(ceiling) : '' }),
        rows: [...costLead, ...costRest],
        seeAll: () => { patchXf({ budget: ceiling, month }); setSortKey('cost'); } },
      { key: 'top', title: t('rail.topRated'), short: t('rail.topRated'), rows: q.top,
        seeAll: () => patchXf({ verdicts: ['3'] }) },
      { key: 'hiking', title: t('rail.hiking'), short: t('rail.hiking'), rows: q.hiking,
        seeAll: () => patchXf({ vibe: 'hiking' }) },
      { key: 'beach', title: t('rail.beachSeason'), short: t('rail.beachSeason'), rows: q.beach,
        seeAll: () => patchXf({ vibe: 'beach', month }) },
      { key: 'gems', title: t('rail.gems'), short: t('rail.gems'), rows: q.gems,
        seeAll: () => setGemOnly(true) },
      { key: 'nocar', title: t('rail.nocar'), short: t('rail.nocar'), rows: q.nocar,
        seeAll: () => patchXf({ nocar: true }) },
      { key: 'quiet', title: t('rail.quiet'), short: t('rail.quiet'), rows: q.quiet,
        seeAll: () => patchXf({ quiet: true }) },
    ];
  }, [railsIdle, rows, xf.month, xf.budget, travelMonth, lang, guided, favorites, t, patchXf,
    setGemOnly, setSortKey, setShowFavOnly]);

  // The control bar's three instruments. The count is a measured figure,
  // so it is grouped the way the reader's locale groups thousands.

  // While a guided question orders the list (a vibe, or around a place),
  // the default sort says so: "Best match" (T444; it read "Rating" over a
  // list ordered by match). "Rating" stays a choice and turns the match
  // order off.
  const sortOptions = (xf.vibe || xf.near)
    ? [{ key: 'beauty', labelKey: 'sort.match' }, { key: 'rating', labelKey: 'sort.rating' }, ...SORTS.slice(1)]
    : SORTS;
  const sortSelect = (
    <label className="xgrid-sort">
      <span className="xgrid-sort-label">{t('places.sortLabel')}</span>
      <span className="xgrid-sort-field">
        <select value={sortOptions.some((x) => x.key === sortKey) ? sortKey : 'beauty'}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label={t('explore.sortAria')}>
          {sortOptions.map((x) => <option key={x.key} value={x.key}>{t(x.labelKey)}</option>)}
        </select>
        <ChevronDownIcon size={14} className="xgrid-sort-chev" />
      </span>
    </label>
  );

  // The desktop switch is the kit Segmented (T427). The phone's floating
  // switch below is redrawn with the map in T441.
  // One List/Map switch, the kit Segmented, drawn twice: in the top band on
  // a desktop, floating above the bottom nav on a phone (T441; the phone's
  // was a dark slab, row T426-d). Reaching it starts loading the map.
  const viewSwitch = (cls) => (
    <span className={cls} onPointerEnter={prefetchMap} onFocus={prefetchMap}>
      <Segmented
        size="sm"
        label={t('explore.viewAria')}
        value={view}
        onChange={setView}
        options={[
          { value: 'grid', label: t('explore.viewList'), icon: <ListDayIcon size={15} /> },
          { value: 'map', label: t('explore.viewMap'), icon: <MapPinIcon size={15} /> },
        ]}
      />
    </span>
  );

  // The budget steps the rail offers; an old link's 70 euro step (xp=e) shows as its
  // own step (T440 moved the budget into the rail with the month).
  const budgetSteps = xf.budget && !BUDGET_STEPS.includes(xf.budget)
    ? [...BUDGET_STEPS, xf.budget].sort((x, y) => x - y)
    : BUDGET_STEPS;

  // The six categories (T498): Places is this view; a layer hands over to
  // App with the one country picked here, so the country travels (rule 3).
  const catTiles = onPickCategory ? (
    <ExploreCategories current="places" columns={isDesktop ? 2 : 3}
      onPick={(key) => onPickCategory(key, countryFilter.length === 1 ? countryFilter[0] : '')} />
  ) : null;

  const filterRail = (
    <ExploreFilterRail
      t={t}
      lang={lang}
      xf={xf}
      patch={patchXf}
      budgetSteps={budgetSteps}
      showFavOnly={showFavOnly} setShowFavOnly={setShowFavOnly}
      gemOnly={gemOnly} setGemOnly={setGemOnly}
      unescoOnly={unescoOnly} setUnescoOnly={setUnescoOnly}
      countryFilter={countryFilter} setCountryFilter={setCountryFilter}
      availableCountries={availableCountries}
      reachHours={reachHours} setReachHours={setReachHours}
      reachAvailable={reachAvailable}
      tripKinds={tripKinds} setTripKinds={setTripKinds}
      onOpenCountry={onOpenCountry}
    />
  );

  const anyActive = chips.length > 0;
  const TitleTag = isActive && !pageOver ? 'h1' : 'div';


  return (
    <div className={`explore-shell${view === 'map' ? ' is-map' : ''}${railsIdle ? ' is-rails' : ''}`}>
      {askHost}
      {headerSlot && createPortal(<AskChatDoor t={t} className="ac-in-header" />, headerSlot)}

      {/* Desktop-only left panel (CSS hides it under 769px): the filter
          rail in folds, trip styles first, with one hairline to the panel's
          right. V3 (T383): the trip-style tiles became the rail's first
          group, and Lifestyle and the shortlist moved into the input row
          over the grid, where the figures they change are. */}
      <aside className="side-panel explore-side" aria-label={t('filter.filters')}>
        <div className="side-block">
          {/* T457: one heading for the panel, so its h3s sit under an h2, as
              on Destinations. */}
          <h2 className="sr-only">{t('filter.filters')}</h2>
          {/* What Explore holds, first (T498, roadmap 1.3b A): the six
              categories two across, then this category's filters. */}
          {catTiles && (
            <section className="xrail-sec xcats-sec" aria-labelledby="xcats-h">
              <h3 className="xrail-h" id="xcats-h">{t('places.sideBrowse')}</h3>
              {catTiles}
            </section>
          )}
          {/* No "Refine" eyebrow (T440). "Clear all" lives once, in the chips
              row above the list (T444). */}
          {filterRail}
        </div>
      </aside>

      <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* Phone only (CSS hides it from 769px): search and the Filters
            door share one row (brief V3-4). The trip styles live in the
            sheet now, and Lifestyle and the shortlist in the input row. */}
        <div className="explore-filterbar xtop">
          {/* On desktop the same button has portalled into the header. */}
          {!headerSlot && <AskChatDoor t={t} className="ac-in-bar" />}
          <Button
            variant="secondary"
            ref={filterBtnRef}
            className="xfilters-btn"
            iconStart={<FilterIcon size={18} />}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
          >
            {t('filter.filters')}
            {chips.length > 0 && <Chip kind="count" className="xfilters-n">{chips.length}</Chip>}
          </Button>
        </div>
        {/* Phone only: the six categories as the 2 x 3 grid under the
            search row (T498, roadmap 1.3b A). */}
        {!isDesktop && catTiles && <div className="xcats-bar">{catTiles}</div>}

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
            {/* No count beside the title (owner, 2026-10-13): the list is
                the answer, and an empty one says so in words. */}
            <TitleTag className="xbar-title">{t('explore.title')}</TitleTag>
            {isMock && <span className="explore-mock">{t('explore.mockData')}</span>}
          </div>
          <div className="xbar-tools">
            {viewSwitch('xview-seg')}
            {sortSelect}
          </div>
        </div>


        {/* C6: active filters as removable chips, right under the bar. */}
        {/* On a phone the sort leads the chip row (62-v6-explore.css), so
            the list has one refine row; the bar's own sort shows otherwise. */}
        <FilterChips t={t} chips={chips} onClearAll={resetAll} lead={sortSelect} />

        {/* The one community surface on a browse tab: a real count of what
            people have published, and one door. Absent entirely when
            nothing is published. */}
        <GuidesStrip onOpen={onOpenGuides} />

        {countryFilter.length === 1 && onOpenCountry && (
          <Button variant="quiet" size="sm" className="xcountry-link"
            iconEnd={<ChevronRightIcon size={16} />}
            onClick={() => onOpenCountry(countryFilter[0])}>
            {t('cpage.open', {
              country: (availableCountries.find(([c]) => c === countryFilter[0]) || [])[1]
                || countryFilter[0],
            })}
          </Button>
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
          {/* Kept mounted after its first open (T441), hidden while the list
              shows, so switching back is instant instead of a rebuild. */}
          {mapOpened && (
            <div className="xcontent-map" hidden={view !== 'map'}>
              {/* While maplibre downloads, the frame the map will fill is
                  already drawn at its final size: a skeleton, not the app's
                  full-screen pulse, so nothing jumps when the canvas lands. */}
              <React.Suspense fallback={(
                <div className="xmap xmap-skel">
                  <LoadingBlock label={t('explore.mapLoading')} rows={1} shape="card" />
                </div>
              )}>
                {/* `all` is the list's own catalogue before the filters,
                    airport gateways merged into one place (T441: the raw
                    data drew three Paris dots, labelled "Paris (CDG)"). The
                    map serialises it once and filters by id (P4.5). */}
                <ExploreMap rows={taxRows} all={allRows} pins={viewportMode ? pins : null}
                  onSelect={openPlace} onViewport={onMapViewport}
                  onNeedDetail={onMapNeedDetail} t={t}
                  ringId={cardLinkId} onPinLink={onPinLink} costs={costIndex}
                  onBack={() => setView('grid')} visible={view === 'map'}
                  framed={anyActive || searchHits != null}
                  pickedId={pickedRow ? pickedRow.id : null} onPick={onPick}
                  drawerState={!isDesktop && view === 'map' ? drawer : null} />
              </React.Suspense>
              {/* T504 (roadmap 1.5 C): the picked place on a desktop map,
                  the same overview its list row shows, docked at the foot
                  of the map with its own close. */}
              {isDesktop && view === 'map' && pickedRow && (
                <div className="xmap-picked" role="group" aria-label={pickedRow.city}>
                  <PlaceOverview p={pickedRow} {...overviewOf(pickedRow)} t={t} selected
                    fav={favSet.has(pickedRow.id)} onToggleFav={onToggleFav}
                    onOpen={() => openPlace(pickedRow.id)} />
                  <IconButton label={t('detail.close')} tone="plain" className="xmap-picked-close"
                    onClick={() => onPick(null)}>
                    <CloseIcon size={16} />
                  </IconButton>
                </div>
              )}
              {/* On a phone the map lies under T500's drawer: the strip holds
                  List | Map and the handle; half and full hold the places on
                  the map as the same overview rows, the picked one first. */}
              {!isDesktop && view === 'map' && (
                <MapDrawer
                  className="xdrawer"
                  state={drawer}
                  onStateChange={setDrawer}
                  ariaLabel={t('explore.drawerAria')}
                  labels={{ strip: t('explore.drawerStrip'), half: t('drawer.half'), full: t('drawer.full') }}
                  strip={viewSwitch('xview-strip')}
                >
                  <div className="xrows xdrawer-rows">
                    {pickedRow && (
                      <PlaceOverview key={`picked-${pickedRow.id}`} p={pickedRow} {...overviewOf(pickedRow)} t={t} selected
                        fav={favSet.has(pickedRow.id)} onToggleFav={onToggleFav}
                        onOpen={() => openPlace(pickedRow.id)} />
                    )}
                    {shownRows.slice(0, DRAWER_MAX).filter((p) => p.id !== pickedRow?.id).map((p) => (
                      <PlaceOverview key={p.id} p={p} {...overviewOf(p)} t={t}
                        fav={favSet.has(p.id)} onToggleFav={onToggleFav}
                        onOpen={() => openPlace(p.id)} />
                    ))}
                  </div>
                </MapDrawer>
              )}
            </div>
          )}
          <div className="xcontent-main">
            {/* The trip library as a row at the top of Places (owner T484-e,
                T489-a, T489-e): "Trip styles" with See all. It counts as one
                of the rails, so three (two on a phone) follow it. */}
            {railsIdle && onOpenStyles && (
              <TripStylesRow t={t} lang={lang} id="xrail-styles"
                country={countryFilter.length === 1 ? countryFilter[0] : null}
                onPick={(slug) => onOpenStyles(slug)} onSeeAll={() => onOpenStyles(null)} />
            )}
            {railsIdle && (
              <ExploreRails rails={rails} onSelect={openPlace} t={t}
                favorites={favSet} onToggleFav={onToggleFav}
                lead={(isDesktop ? 4 : 3) - (onOpenStyles ? 1 : 0)} />
            )}
            {railsIdle && listed.length > 0 && (
              <h2 className="xlist-title">{t('explore.allPlaces')}</h2>
            )}

            {gridTotal === 0 && (
              /* One empty block for every category and the library (T498,
                 roadmap 1.3b F; V3 T383 before it): the sentence names what
                 emptied the list, one button changes it, Clear all beside
                 it once two or more filters are on. An empty shortlist
                 offers the way back. */
              <EmptyResult
                className="explore-count xempty"
                line={emptyLine}
                action={showFavOnly
                  ? { label: t('explore.showAll'), onClick: () => setShowFavOnly(false) }
                  : locationQuery
                    ? { label: t('results.clearSearch'), onClick: () => setLocationQuery('') }
                    : lastChip
                      ? { label: t('explore.removeFilter', { filter: lastChip.label }), onClick: lastChip.remove }
                      : null}
                onClearAll={!showFavOnly && !locationQuery && lastChip && chips.length > 1 ? resetAll : null}
                clearLabel={t('filter.clearAll')}
              >
                {locationQuery && searchHits?.suggestions?.length > 0 && (
                  <span className="xsearch-suggest">
                    {t('explore.didYouMean')}
                    {searchHits.suggestions.map((sug) => (
                      <Button key={sug} variant="quiet" size="sm"
                        onClick={() => setLocationQuery(sug)}>{sug}</Button>
                    ))}
                  </span>
                )}
              </EmptyResult>
            )}

            <div className={`xrows${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
              {listed.map((p) => (
                <ExploreCard
                  key={p.id}
                  p={p}
                  role={roleFor(p)}
                  selected={p.id === (pickedId || selectedId)}
                  fav={favSet.has(p.id)}
                  onSelect={openPlace}
                  onToggleFav={onToggleFav}
                  t={t}
                  reachMin={reachMinutes?.get(p.id) ?? null}
                  linked={view === 'map' && p.id === pinLinkId}
                  onLink={view === 'map' ? setCardLinkId : null}
                  month={dxf.month}
                  {...overviewOf(p)}
                />
              ))}
            </div>

            {visible < gridTotal && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}
          </div>
        </div>
      </div>

      {viewSwitch('xview-fab')}
      </div>

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
