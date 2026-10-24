import { SiteFooter } from '../components/SiteFooter.jsx';
import React from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { fmtMonthRanges, MONTHS_SHORT } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterRail, ExploreQuickFilters, minVerdict, goodForOf, legMinutes } from './ExploreFilterRail.jsx';
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
  FilterIcon,
  ChevronRightIcon, MapPinIcon, ListDayIcon,
} from '../components/Icons.jsx';
import { useTravelMonth, useSettings } from '../components/SettingsLine.jsx';
import { resolveWhen } from '../lib/when.js';
import { fromName } from '../components/FromPicker.jsx';
import { flightLegs } from '../lib/price/flight.js';
import { legCost } from '../lib/flights/flights.js';
import { homePoint, wayFor } from '../lib/travelWay.js';
import { partyOf } from '../lib/party.js';
import { destAnchor } from '../lib/origins.js';
import { scrollBehavior } from '../lib/motion.js';
import { openShared } from '../lib/sharedElement.js';
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
import { Button, Chip } from '../components/ui/index.js';
import { PlaceOverview } from './PlaceOverview.jsx';
import { overviewRegion, overviewReason, overviewScore, reasonText } from '../lib/placeOverview.js';
import { MapDrawer } from '../components/MapDrawer.jsx';
import { MapPlacePanel } from './MapPlacePanel.jsx';
import { useGuidedData, vibeOf } from '../lib/guidedData.js';
import { AskChatHost } from './ask/AskChatButton.jsx';
import { openAskChat, closeAskChat, useAskChat } from './ask/askChatStore.js';
import { CountriesButton } from '../components/CountriesControl.jsx';
import {
  noCarOk, underOk, quietOk, matchGuided, guidedComparator, whyFacts, makeLabels,
} from '../lib/guidedSearch.js';
import { visitLength } from '../lib/nearby.js';
import { monthName } from '../lib/dates.js';
import { knownFor } from '../lib/knownFor.js';
import { catalogue, CATALOGUE_MODE, loadFullCatalogue } from '../lib/appData.js';
import { decodeBootIndex } from '../lib/bootIndex.js';
import { formatMoney } from '../lib/money.js';
// T586: the overview first page.
import {
  SearchIcon, ArrowLeftIcon, SparkIcon, CameraIcon, DiamondIcon, TrainIcon, PersonIcon, PiggyIcon, SunIcon,
  StarIcon, BootIcon, BeachIcon,
} from '../components/Icons.jsx';
// T588: the focused view's toolbar.
// T585: the start dialog.
import { StartDialog, shouldOpenStart, markStartSeen } from './StartDialog.jsx';
import { SortIcon, ShareIcon, BookmarkIcon, CheckIcon } from '../components/Icons.jsx';
import { isResizable, srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { commonsPageUrl } from '../lib/imageCredit.js';
import '../styles/84-explore-overview.css';
import { viewFactor } from '../lib/price/display.js';

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
 * The preview (T591, owner 2026-10-22): the receipt, the sights, the month
 * strip and the country rank went; the card itself now carries the price
 * parts and the dates. What is left is what helps a decision in one look: the
 * hook line (what the place is known for), one month verdict for the chosen
 * month ("Good in November", else "Best in Apr to Jun"), one plan sentence
 * ("3 days in November, about 225 euros a person": the visit length times the
 * day total) and one quiet action that opens the place. A paper popover
 * beside the card, never over its photograph (explore N6).
 *
 * WCAG 1.4.13: dismissible (Escape), hoverable (a child of the card, and a
 * transparent bridge spans the gap so the pointer can travel into it),
 * persistent (nothing times it out). The action repeats the card's own link
 * for a pointer, so it stays out of the tab order and the accessible
 * description (the card link already opens the place).
 */
function CardPreview({ id, p, t, month, place, reveal = false, onOpen }) {
  // Opened by the info control (a tap on a phone), the popover under the
  // card is brought into view if it opened below the fold.
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (reveal) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: scrollBehavior() });
  }, [reveal]);
  const lead = knownFor(p);
  const good = p.climate?.best || [];
  const lang = t.lang || 'en';
  const inMonth = month && good.includes(month) ? monthName(month, lang) : null;
  const verdict = inMonth
    ? t('gs.whyMonth', { month: inMonth })
    : (good.length ? t('explore.bestMonths', { months: fmtMonthRanges(good, t) }) : null);
  const stay = visitLength(p);
  const days = stay ? Math.max(1, stay.n || Math.round(stay.days) || 1) : null;
  const day = p.cost?.dayEur;
  const total = days && Number.isFinite(day) ? formatMoney(day * days) : null;
  const monthWord = month ? monthName(month, lang) : null;
  const plan = days && total
    ? t(`card.plan${days === 1 ? 'One' : 'Days'}${monthWord ? 'In' : ''}`, { n: days, month: monthWord, total })
    : (stay ? t(stay.key, { n: stay.n }) : null);
  return (
    <div
      id={id}
      ref={ref}
      className={`xcard-preview xpop xpop--${place.side} xpop-v6`}
      role="tooltip"
      style={{ '--xpop-dx': `${place.dx}px`, '--xpop-w': `${place.w}px` }}
    >
      {lead && <p className="xpop-lead">{lead}</p>}
      {(verdict || plan) && (
        <p className="xpop-facts">
          {verdict && <span className={`xpop-verdict${inMonth ? ' is-good' : ''}`}>{verdict}</span>}
          {plan && <span className="xpop-plan">{plan}</span>}
        </p>
      )}
      <a
        className="xpop-open"
        href={`#dest=${encodeURIComponent(p.id)}`}
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onOpen?.(e);
        }}
      >
        <span>{t('card.openPlace', { place: p.city })}</span>
        <ChevronRightIcon size={16} />
      </a>
    </div>
  );
}

// The popover's delays (house rule "Dialog family"): a pointer that rests
// 150 ms, a focus that rests 400 ms (so a Tab walk through the grid does not
// strobe), the info control at once.
const HOVER_MS = 150;
const FOCUS_MS = 400;

const ExploreCard = React.memo(function ExploreCard({
  p, selected, fav, onSelect, onToggleFav, t,
  linked = false, onLink = null, month = null, region = null, reason = null, rating = null,
  layout = 'row',
}) {
  // The preview speaks of the chosen month, else the traveller's own (T591).
  const travelMonth = useTravelMonth();
  const previewMonth = month || travelMonth || null;
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

  // T504 (roadmap 1.5): the row IS the place's one overview, the same
  // component the map's selected place and the phone's drawer draw. The
  // popover beside it adds what a row cannot fit; it is not a second overview.
  return (
    <PlaceOverview
      p={p} region={region} reason={reason} rating={rating} fav={fav} onToggleFav={onToggleFav} t={t}
      selected={selected} linked={linked} layout={layout}
      className={preview ? 'previewing' : ''}
      rootRef={cardRef}
      rootProps={{
        onPointerEnter: (e) => { if (e.pointerType === 'mouse') later('hover', HOVER_MS); onLink?.(p.id); },
        onPointerLeave: () => { drop('hover'); onLink?.(null); },
      }}
      hitProps={{
        onFocus: (e) => {
          // A phone has no hover: a focus there (a page arriving, a tap) never
          // opens the preview over the list; the card itself opens the place.
          if (e.target.matches?.(':focus-visible') && window.matchMedia?.('(hover: hover)').matches) later('focus', FOCUS_MS);
          onLink?.(p.id);
        },
        onBlur: () => { drop('focus'); onLink?.(null); },
        'aria-describedby': preview && place ? popId : undefined,
      }}
      onOpen={(e) => openShared(e.currentTarget, p.id, () => onSelect(p.id))}
    >
      {preview && place && (
        <CardPreview id={popId} p={p} t={t} month={previewMonth} place={place} reveal={open === 'pin'}
          onOpen={(e) => openShared(cardRef.current?.querySelector('.xrow-hit') || e.currentTarget, p.id, () => onSelect(p.id))} />
      )}
    </PlaceOverview>
  );
});

export function ExploreTab({
  data,
  isActive = true,
  pageOver = false,
  locationQuery, setLocationQuery,
  countryFilter, setCountryFilter, countryNot = false,
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
      // T589: the budget floor (xbm) and the longest flight in hours (xfh).
      bmin: Number(q.get('xbm')) > 0 ? Number(q.get('xbm')) : null,
      fh: Number(q.get('xfh')) > 0 ? Number(q.get('xfh')) : null,
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
  // T586: the rails name the month the settings line shows, so "Best in"
  // never says October above a trip the line dates in November. The
  // traveller's own month first, then the dates on show, then today.
  const shownDepart = useSettings()?.departDate;
  const railMonth = travelMonth || Number(String(shownDepart || '').slice(5, 7)) || new Date().getMonth() + 1;
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
  // measured month curve), so "November" shows November's prices. T663 (B7):
  // the filter is the app's "when" while it is on, so App prices the month
  // in the one request and the destination page behind a card says the same
  // (reported to App by the effect after useSettings below).
  const { all: catAllRows, rows: catRows, availableCountries, indices: costIndex } = useExploreCatalog({
    data, locationQuery, countryFilter, countryNot, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey, showFavOnly, favorites,
    indices, searchHits,
  });

  // How the traveller gets there (T518, T582): under the settings line's
  // way, each place carries `cost.way`, { mode, perPerson, airline?, hours? }:
  // the cheapest return flight a seat in the travel month from the home
  // airport's sweep (data.flights), or a train, coach or car journey from
  // the traveller's From point (lib/travelWay.js), or with any way the
  // cheapest of them. The party splits it (children, babies on a lap, T579).
  // With a month or any time (T578) the flight is the month's or the
  // year's cheapest. A place the chosen ground way cannot reach leaves the
  // list; a place without a flight keeps its row in plane mode, as before.
  const settingsLine = useSettings();
  const setExploreMonth = settingsLine?.setExploreMonth;
  React.useEffect(() => { setExploreMonth?.(dxf.month || null); }, [dxf.month, setExploreMonth]);
  const setCountryNot = settingsLine?.setCountryNot;
  // The one country the list is narrowed to, for its page link and the
  // category doors; none while the list leaves countries out (T581).
  const oneCountry = !countryNot && countryFilter.length === 1 ? countryFilter[0] : null;
  const flights = data?.flights || null;
  // T649: the month the quiet flag judges, from the one helper: the Explore
  // month filter when set, else the traveller's own when.
  const quietWhen = React.useMemo(
    () => (dxf.month ? resolveWhen({ xm: dxf.month }) : (settingsLine?.when || null)),
    [dxf.month, settingsLine?.when],
  );
  // T663 (V7): the flight follows the bed's date mode, from the one request.
  const request = settingsLine?.priceRequest || null;
  const wayMode = settingsLine?.transportMode || 'any';
  // T589: "Flight up to" shows only while flights can be the way there.
  const flightLimitAvailable = !!flights && (wayMode === 'plane' || wayMode === 'any');
  const party = React.useMemo(
    () => partyOf({ group_size: settingsLine?.party, children: settingsLine?.children, babies: settingsLine?.babies }),
    [settingsLine?.party, settingsLine?.children, settingsLine?.babies],
  );
  const home = React.useMemo(
    () => homePoint({ drive_home: settingsLine?.fromPlace, origin: settingsLine?.origin }, data),
    [settingsLine?.fromPlace, settingsLine?.origin, data],
  );
  const wayRows = React.useMemo(() => {
    if (!data?.destinations) return null;
    const m = new Map();
    for (const p of catAllRows) {
      const d = data.destinations[p.id];
      const r = flights && (wayMode === 'plane' || wayMode === 'any') ? flightLegs(flights, destAnchor(d), request) : null;
      // T691: the traveller's bag on both legs, as the calculator prices it.
      const bagKey = request?.baggage;
      const flight = r ? {
        perSeat: legCost(r.out, { paying: 1, bagKey }).perSeat + legCost(r.back, { paying: 1, bagKey }).perSeat,
        airline: r.out.airline,
      } : null;
      const way = wayFor(d || p, wayMode, { home, party, flight });
      // T589: the outbound flight's length, for the "Flight up to" filter.
      const fmin = r ? legMinutes(r.out) : null;
      m.set(p.id, way ? { ...p, cost: { ...p.cost, way }, fmin } : (wayMode === 'plane' ? p : null));
    }
    return m;
  }, [catAllRows, flights, request, wayMode, home, party, data]);
  const withWay = React.useCallback(
    (list) => (wayRows ? list.map((p) => (wayRows.has(p.id) ? wayRows.get(p.id) : p)).filter(Boolean) : list),
    [wayRows],
  );
  const allRows = React.useMemo(() => withWay(catAllRows), [catAllRows, withWay]);
  const rows = React.useMemo(() => withWay(catRows), [catRows, withWay]);

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
    if (dxf.bmin && !(p.cost?.dayEur != null && p.cost.dayEur >= dxf.bmin)) return false;
    // T589: a flight longer than the limit drops the place; no flight drops
    // it only when the traveller goes by plane.
    if (dxf.fh && flightLimitAvailable) {
      if (p.fmin != null ? p.fmin > dxf.fh * 60 : wayMode === 'plane') return false;
    }
    if (dxf.quiet && !quietOk(p, quietWhen)) return false;
    if (dxf.badged && !p.country_badge) return false;
    if (dxf.sea && !(p.categories || []).some((c) => c === 'beach' || c === 'coast' || c === 'island')) return false;
    // The guided facets (vibe, area, near, close by) hold only once the
    // guided data has landed; until then the list waits empty rather than
    // showing places that may not match (T442).
    if ((dxf.vibe || dxf.area || dxf.near || dxf.nb.length) && !matchGuided(p, dxf, gctx)) return false;
    return true;
  }), [rows, dxf, roleFor, gctx, flightLimitAvailable, wayMode, quietWhen]);
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
    if (q.get('xo') === '1') setCountryNot?.(true);
    if (q.get('xs')) setSortKey(q.get('xs'));
    // App's useState setters, so stable; the ref keeps it to one read anyway.
  }, [setGemOnly, setUnescoOnly, setCountryFilter, setCountryNot, setSortKey]);

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
    setOrDrop('xbm', xf.bmin || '');
    setOrDrop('xfh', xf.fh || '');
    const flags = `${xf.nocar ? 'c' : ''}${xf.quiet ? 'q' : ''}${xf.sea ? 's' : ''}${xf.badged ? 'b' : ''}`;
    setOrDrop('xp', flags);
    setOrDrop('xe', xf.vibe || '');
    setOrDrop('xa', xf.area || '');
    setOrDrop('xn', xf.near || '');
    setOrDrop('xd', xf.nb.join(','));
    setOrDrop('xg', gemOnly ? '1' : '');
    setOrDrop('xu', unescoOnly ? '1' : '');
    setOrDrop('xc', countryFilter.join(','));
    setOrDrop('xo', countryNot && countryFilter.length ? '1' : '');
    setOrDrop('xs', sortKey !== 'beauty' ? sortKey : '');
    setOrDrop('xw', view === 'map' ? 'map' : '');
    setOrDrop('xi', pickedId || '');
    const qs = q.toString();
    // The state rides along: it marks the history step a place opened.
    window.history.replaceState(window.history.state, '',
      `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
  }, [xf, gemOnly, unescoOnly, countryFilter, countryNot, sortKey, view, pickedId, isActive]);

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
    setXf({ kinds: [], verdicts: [], roles: [], month: null, budget: null, bmin: null, fh: null,
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
    // T694: the chips say the budget in the traveller's view (V15).
    const vf = viewFactor(request);
    if (xf.budget) list.push({ key: 'budget', label: t('explore.budgetUpTo', { eur: formatMoney(xf.budget * vf) }), remove: drop({ budget: null }) });
    if (xf.bmin) list.push({ key: 'bmin', label: t('filter.budgetFrom', { eur: formatMoney(xf.bmin * vf) }), remove: drop({ bmin: null }) });
    if (xf.fh && flightLimitAvailable) list.push({ key: 'fh', label: t('filter.flightChip', { n: xf.fh }), remove: drop({ fh: null }) });
    for (const k of xf.kinds) list.push({ key: `k:${k}`, label: t(`pkind.${k}`), remove: drop({ kinds: xf.kinds.filter((x) => x !== k) }) });
    // One chip for the rating, "Excellent and up" (T440): the rail asks for
    // a band and every band above it.
    if (xf.verdicts.length) {
      list.push({ key: 'rating', label: t('filter.ratingAtLeast', { band: t(`score.band${minVerdict(xf.verdicts)}`) }), remove: drop({ verdicts: [] }) });
    }
    if (goodForOf(xf.roles)) list.push({ key: 'role', label: t(`filter.goodFor.${goodForOf(xf.roles)}`), remove: drop({ roles: [] }) });
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
      list.push({ key: `c:${iso2}`, label: countryNot ? t('settings.countryNot', { country: name }) : name, remove: () => setCountryFilter(countryFilter.filter((x) => x !== iso2)) });
    }
    if (reachAvailable && reachHours != null) list.push({ key: 'reach', label: t('filter.reachHours', { n: reachHours }), remove: () => setReachHours(null) });
    // T586: a Where search narrows the list, so it shows as a chip too; the
    // focused view then always says why it holds what it holds.
    if (locationQuery && locationQuery.trim()) list.push({ key: 'q', label: `“${locationQuery.trim()}”`, remove: () => setLocationQuery('') });
    return list;
  }, [xf, locationQuery, setLocationQuery, flightLimitAvailable, tripKinds, gemOnly, unescoOnly, showFavOnly, countryFilter, countryNot, reachHours, reachAvailable, availableCountries, t, patchXf, setTripKinds, setGemOnly, setUnescoOnly, setShowFavOnly, setCountryFilter, setReachHours, gLabels, nearRow, request]);

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

  // Desktop chrome: the controls stand in the left panel. Ask Carta's one
  // door is the overview's own field (T595, owner 2026-10-22: only on
  // Explore, not in the header and not on other tabs).
  const isDesktop = useIsDesktop();

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
  // One hand-over makes one ask seed (T621): StrictMode runs this effect
  // twice, and two seeds asked the question twice.
  const tookSeed = React.useRef(null);
  React.useEffect(() => {
    if (!seed || tookSeed.current === seed) return;
    tookSeed.current = seed;
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
  // T622 (owner 2026-10-23): the chat names the town only, never the
  // airport code.
  const fromTown = fromName(settingsLine)
    || (settingsLine?.origin ? (data?.meta?.origins?.[settingsLine.origin]?.city || '') : '');
  const askTrip = React.useMemo(() => ({
    origin: settingsLine?.origin || null,
    originName: fromTown,
    flights: data?.flights || null,
    depart: settingsLine?.departDate || null,
    back: settingsLine?.returnDate || null,
    party: settingsLine?.party || 2,
    stayTier: settingsLine?.stayTier || 'home',
    destinations: data?.destinations || null,
  }), [settingsLine?.origin, fromTown, settingsLine?.departDate, settingsLine?.returnDate, settingsLine?.party, settingsLine?.stayTier, data]);
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
  // T586: the idle page is an overview, not every place expanded. "Show all
  // places" enters the focused list without a filter (xall=1 in the URL),
  // and the countries do not count as a lens: they belong to the settings
  // line, so an overview of three countries is still an overview.
  const [focusAll, setFocusAll] = React.useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('xall') === '1'));
  const lensChips = chips.filter((c) => !c.key.startsWith('c:')).length;
  const railsIdle = lensChips === 0 && !locationQuery && !focusAll
    && tripKinds.length === 0 && !showFavOnly && view === 'grid';
  const lens = useExploreLens({
    isActive, railsIdle, focusAll, setFocusAll,
    clear: () => {
      // Everything a lens set, the settings line's countries excepted.
      setRatingRange([...FULL_RATING_RANGE]);
      setGemOnly(false);
      setUnescoOnly(false);
      setTopBeachOnly(false);
      setBigOnly(false);
      setTopPick(null);
      setReachHours(null);
      setTripKinds([]);
      setShowFavOnly(false);
      setLocationQuery('');
      setView('grid');
      setXf({ kinds: [], verdicts: [], roles: [], month: null, budget: null,
        nocar: false, quiet: false, sea: false, badged: false, vibe: null,
        area: null, near: null, nb: [], bmin: null, fh: null });
      setPickedId(null);
    },
  });
  // T588: Filters opens and closes the side pane on a desktop (the
  // overview never shows it); Share copies this view's address.
  // T601 (owner 2026-10-22): closed until Filters opens it.
  const [paneOpen, setPaneOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    if (!toast) return undefined;
    const h = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(h);
  }, [toast]);
  const shareView = () => {
    const fail = () => setToast(t('explore.linkFailed'));
    try {
      navigator.clipboard.writeText(window.location.href)
        .then(() => setToast(t('explore.linkCopied')), fail);
    } catch { fail(); }
  };
  // T585: the start dialog, once per device on a wide screen (T595: on the
  // first visit only; Ask Carta's field took over its door).
  const [startOpen, setStartOpen] = React.useState(false);
  React.useEffect(() => {
    if (!isActive || pageOver) return;
    if (shouldOpenStart()) { markStartSeen(); setStartOpen(true); }
  }, [isActive, pageOver]);
  const rails = React.useMemo(() => {
    if (!railsIdle) return [];
    // The month the rails speak about: one set by hand, else the month of
    // the traveller's dates, else this month (T427).
    const month = xf.month || railMonth;
    const monthName = new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, month - 1, 15));
    const inSeason = (p) => (p.climate?.best || []).includes(month);
    // T649: the same tier the Crowds stat shows, in the month the rail names.
    const railWhen = resolveWhen({ xm: month });
    const byRating = (a, b) => (b.rating?.score || 0) - (a.rating?.score || 0);
    const q = {
      top: rows.filter((p) => p.rating?.tier === 3),
      gems: interleaveByCountry(rows.filter((p) => p.rating?.hidden_gem)),
      now: interleaveByCountry(rows.filter((p) => inSeason(p) && (p.rating?.tier ?? 0) >= 2).sort(byRating)),
      hiking: guided ? interleaveByCountry(rows.filter((p) => vibeOf(guided, p.id, 'hiking') >= 80).sort(byRating)) : [],
      beach: guided ? interleaveByCountry(rows.filter((p) => inSeason(p) && vibeOf(guided, p.id, 'beach') >= 80).sort(byRating)) : [],
      nocar: interleaveByCountry(rows.filter(noCarOk)),
      // Quiet in high season says something only in June to September.
      quiet: month >= 6 && month <= 9 ? interleaveByCountry(rows.filter((p) => quietOk(p, railWhen))) : [],
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
      { key: 'quiet', title: t('rail.quiet'), short: t('filter.notCrowded'), rows: q.quiet,
        seeAll: () => patchXf({ quiet: true }) },
    ];
  }, [railsIdle, rows, xf.month, xf.budget, railMonth, lang, guided, favorites, t, patchXf,
    setGemOnly, setSortKey, setShowFavOnly]);

  // T595 (owner 2026-10-22, point 1): the rails' doors stand at the top of
  // the overview as quick chips that act at once: every rail past the ones
  // drawn as strips, then the month's price and season rails. The same rail
  // objects, so a chip opens exactly what that rail's See all opens.
  const railLead = (isDesktop ? 4 : 3) - (onOpenStyles ? 1 : 0);
  const quickRails = React.useMemo(() => {
    const shown = rails.filter((r) => r.rows.length >= 4);
    const out = shown.slice(railLead);
    for (const k of ['cost', 'now']) {
      const r = shown.find((x) => x.key === k);
      if (r && !out.includes(r)) out.push(r);
    }
    return out;
  }, [rails, railLead]);
  // T601: the hero's photograph, the first place of "Best in {month}" (else
  // Top rated) whose photo is a Wikimedia Commons file, so its file page
  // carries the author and the licence the credit links to.
  const heroPhoto = React.useMemo(() => {
    // T622 (owner 2026-10-23: "a more scenic, beautiful image"): a lake,
    // a coast or a mountain village from a short list of Europe's most
    // photographed views, one a day; the rails' first place stays the
    // fallback.
    const scenic = allRows.filter((x) => SCENIC_HERO.has(x.city) && isResizable(x.image) && commonsPageUrl(x.image));
    if (scenic.length) {
      scenic.sort((x, y) => String(x.id).localeCompare(String(y.id)));
      const day = Math.floor(Date.now() / 86400000);
      const p = scenic[day % scenic.length];
      return { url: p.image, city: p.city, page: commonsPageUrl(p.image), source: 'Wikimedia Commons' };
    }
    for (const key of ['now', 'top']) {
      const p = rails.find((r) => r.key === key)?.rows.find((x) => isResizable(x.image) && commonsPageUrl(x.image));
      if (p) return { url: p.image, city: p.city, page: commonsPageUrl(p.image), source: 'Wikimedia Commons' };
    }
    return null;
  }, [rails, allRows]);
  // The desktop pane beside the overview, opened by "All filters" there;
  // any filter picked in it opens the focused view, where the pane stays.
  const [ovPane, setOvPane] = React.useState(false);
  // Back on the overview the pane is closed again (the focused view has its own).
  React.useEffect(() => { if (!railsIdle) setOvPane(false); }, [railsIdle]);

  // The control bar's three instruments. The count is a measured figure,
  // so it is grouped the way the reader's locale groups thousands.

  // While a guided question orders the list (a vibe, or around a place),
  // the default sort says so: "Best match" (T444; it read "Rating" over a
  // list ordered by match). "Rating" stays a choice and turns the match
  // order off.
  const sortOptions = (xf.vibe || xf.near)
    ? [{ key: 'beauty', labelKey: 'sort.match' }, { key: 'rating', labelKey: 'sort.rating' }, ...SORTS.slice(1)]
    : SORTS;
  // T588: the sort is a menu behind one pill in the toolbar.
  const sortMenu = (
    <SortMenu t={t} options={sortOptions} onChange={setSortKey}
      value={sortOptions.some((x) => x.key === sortKey) ? sortKey : 'beauty'} />
  );

  // T592 (owner, 2026-10-22): one toggle, not a List | Map pair. In the
  // list it offers the map, on the map it offers the list: a secondary pill
  // with the icon of where it goes. Drawn in the desktop toolbar, floating
  // above the bottom nav on a phone, and in the map drawer's strip. Reaching
  // it starts loading the map.
  const viewSwitch = (cls) => {
    const toMap = view !== 'map';
    return (
      <span className={cls} onPointerEnter={prefetchMap} onFocus={prefetchMap}>
        <Button variant="secondary" size="sm" className="xview-toggle"
          iconStart={toMap ? <MapPinIcon size={16} /> : <ListDayIcon size={16} />}
          onClick={() => setView(toMap ? 'map' : 'grid')}>
          {t(toMap ? 'explore.viewMap' : 'explore.viewList')}
        </Button>
      </span>
    );
  };

  // The budget steps the rail offers; an old link's 70 euro step (xp=e) shows as its
  // own step (T440 moved the budget into the rail with the month).
  const budgetSteps = xf.budget && !BUDGET_STEPS.includes(xf.budget)
    ? [...BUDGET_STEPS, xf.budget].sort((x, y) => x - y)
    : BUDGET_STEPS;

  // T598 (owner point 11): on a desktop the map starts right under the chip
  // row and fills the rest of the screen. The frame's top is measured with
  // the list scrolled to the top (the head and chips above it change with
  // the filters), and the CSS takes the height from it.
  const contentRef = React.useRef(null);
  const [mapTop, setMapTop] = React.useState(null);
  const chipCount = chips.length;
  React.useLayoutEffect(() => {
    if (!isDesktop || view !== 'map' || railsIdle) return undefined;
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + (scrollRef.current?.scrollTop || 0);
      setMapTop(Math.round(top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isDesktop, view, railsIdle, chipCount]);

  // The six categories (T498): Places is this view; a layer hands over to
  // App with the one country picked here, so the country travels (rule 3).
  // T586 (owner decision 7): one row of pills at the top of the content,
  // on a phone and a desktop alike, instead of tiles in the side pane.
  const catTiles = onPickCategory ? (
    <ExploreCategories current="places" variant="row"
      onPick={(key) => onPickCategory(key, oneCountry || '')} />
  ) : null;

  // T604: the pane and the quick chips' popovers take the same props, so a
  // filter is one control over one state wherever it is drawn.
  const railProps = {
    t, lang, xf, patch: patchXf, budgetSteps,
    showFavOnly, setShowFavOnly, gemOnly, setGemOnly, unescoOnly, setUnescoOnly,
    countryFilter, setCountryFilter, availableCountries,
    reachHours, setReachHours, reachAvailable,
    tripKinds, setTripKinds, onOpenCountry, flightLimitAvailable,
  };
  const filterRail = (
    <ExploreFilterRail {...railProps}
      count={gridTotal}
      onClearAll={chips.length ? resetAll : null}
    />
  );

  const anyActive = chips.length > 0;
  const TitleTag = isActive && !pageOver ? 'h1' : 'div';


  return (
    <div className={`explore-shell${view === 'map' ? ' is-map' : ''}${railsIdle ? ' is-rails is-overview' : ' is-focus'}${paneOpen ? '' : ' is-pane-closed'}${railsIdle && ovPane ? ' is-ov-pane' : ''}`}>
      {askHost}

      {/* Desktop-only left panel (CSS hides it under 769px): the filter
          rail in folds, trip styles first, with one hairline to the panel's
          right. V3 (T383): the trip-style tiles became the rail's first
          group, and Lifestyle and the shortlist moved into the input row
          over the grid, where the figures they change are. */}
      <aside className="side-panel explore-side" id="explore-side" aria-label={t('filter.filters')}>
        <div className="side-block">
          {/* T457: one heading for the panel, so its h3s sit under an h2, as
              on Destinations. */}
          <h2 className="sr-only">{t('filter.filters')}</h2>
          {/* The six categories left the pane for the tab row over the
              content (T586, owner decision 7). */}
          {/* No "Refine" eyebrow (T440). "Clear all" lives once, in the chips
              row above the list (T444). */}
          {filterRail}
        </div>
      </aside>

      <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* T622 (owner 2026-10-23: "the tabs need to be brought more to
            the front, larger, more on top"): the six categories lead every
            view of the tab, right under the settings line. */}
        {catTiles && <div className="xcats-bar">{catTiles}</div>}
        {/* T586, T595: the overview leads with one compact block: the
            headline, Ask Carta's field, the What and Where bar with the map
            toggle, then the categories and the quick chips. The phone's
            old Ask Carta and Filters row is gone: both live in the block. */}
        {railsIdle && (
          <OverviewHero t={t} TitleTag={TitleTag} photo={isDesktop ? heroPhoto : null}
            locationQuery={locationQuery} setLocationQuery={setLocationQuery}
            onShowAll={() => setFocusAll(true)}
            viewToggle={viewSwitch('xov-view')}
            quick={quickRails}
            countries={<CountriesButton s={settingsLine} size="sm" className="xquick-chip" />}
            filtersRef={filterBtnRef}
            filtersOn={isDesktop ? ovPane : sheetOpen}
            filterCount={chips.length}
            onAllFilters={() => (isDesktop ? setOvPane((v) => !v) : setSheetOpen(true))} />
        )}
        {/* The six categories as one row of tabs (T586, owner decision 7);
            on the overview they sit inside the head block (T595). */}
        {/* The control bar: what this page is and how many places it holds
            right now (the count, V3), and the two ways to rearrange them.
            On a phone the title is read but not drawn, so the count is the
            visible line, sharing its row with the sort; the grid/map switch
            floats above the bottom nav instead (.xview-fab). */}
        {!railsIdle && (
        <div className="xbar">
          <div className="xbar-lead">
            {/* The page's one h1, only while this tab is the one showing:
                the tab stays mounted under Destinations, and its h1 made a
                second one there (row T380-g). Hidden, it is a plain div. */}
            {/* T588: the title and the live count under it (owner
                2026-10-22, reversing 2026-10-13). */}
            {/* T598: one head row. The way back to the overview (T586) is
                a round arrow before the title: a link to the overview's
                address, drawn as the kit's icon button; Back in the browser
                does the same. */}
            <a className="icon-btn icon-btn-surface xov-back" href={lens.href}
              aria-label={t('explore.backOverview')} title={t('explore.backOverview')}
              onClick={(e) => { e.preventDefault(); lens.back(); }}>
              <ArrowLeftIcon size={20} />
            </a>
            <TitleTag className="xbar-title">{t('explore.placesTitle')}</TitleTag>
            <span className="xbar-count sr-only">
              {t(gridTotal === 1 ? 'explore.countOne' : 'explore.countMany',
                { n: new Intl.NumberFormat(lang).format(gridTotal) })}
            </span>
            {isMock && <span className="explore-mock">{t('explore.mockData')}</span>}
          </div>
          {/* T588: one row of pills: Share, Sort, Filters, Saved, then the
              countries on a phone and the map toggle last. */}
          <div className="xbar-tools xtools" role="group" aria-label={t('explore.toolsAria')}>
            <Button variant="secondary" size="sm" className="xtool" iconStart={<ShareIcon size={18} />}
              onClick={shareView}>
              {t('explore.toolShare')}
            </Button>
            {sortMenu}
            <Button
              variant="secondary"
              size="sm"
              ref={filterBtnRef}
              className={`xtool${isDesktop && paneOpen ? ' is-on' : ''}`}
              iconStart={<FilterIcon size={18} />}
              onClick={() => (isDesktop ? setPaneOpen((v) => !v) : setSheetOpen(true))}
              aria-haspopup={isDesktop ? undefined : 'dialog'}
              aria-expanded={isDesktop ? paneOpen : sheetOpen}
              aria-controls={isDesktop ? 'explore-side' : undefined}
            >
              {t('filter.filters')}
              {chips.length > 0 && <Chip kind="count" className="xfilters-n">{chips.length}</Chip>}
            </Button>
            <Button variant="secondary" size="sm" className={`xtool${showFavOnly ? ' is-on' : ''}`}
              iconStart={<BookmarkIcon size={18} />} aria-pressed={showFavOnly}
              onClick={() => setShowFavOnly(!showFavOnly)}>
              {t('explore.toolSaved')}
            </Button>
            {!isDesktop && <CountriesButton s={settingsLine} className="xtool" />}
            {viewSwitch('xtool-view')}
          </div>
        </div>
        )}


        {/* C6: active filters as removable chips, right under the bar. */}
        {/* On a phone the sort leads the chip row (62-v6-explore.css), so
            the list has one refine row; the bar's own sort shows otherwise. */}
        {/* T598 (owner points 7 and 11): quick filter chips right under the
            head, AllTrails style, each a small popover over the same state
            the pane edits; then the active filters. */}
        {!railsIdle && <ExploreQuickFilters {...railProps} />}
        {!railsIdle && <FilterChips t={t} chips={chips} onClearAll={resetAll} />}

        {/* The one community surface on a browse tab: a real count of what
            people have published, and one door. Absent entirely when
            nothing is published. */}
        <GuidesStrip onOpen={onOpenGuides} />

        {oneCountry && onOpenCountry && (
          <Button variant="quiet" size="sm" className="xcountry-link"
            iconEnd={<ChevronRightIcon size={16} />}
            onClick={() => onOpenCountry(oneCountry)}>
            {t('cpage.open', {
              country: (availableCountries.find(([c]) => c === oneCountry) || [])[1]
                || oneCountry,
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
        <div className={`xcontent ${view === 'map' ? 'xcontent--split' : ''}`.trim()} ref={contentRef}
          style={mapTop != null ? { '--xmap-top': `${mapTop}px` } : undefined}>
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
              {/* T592 (owner decision 6): the map the Kayak way. On a
                  desktop the panel floats on the left over the map: the
                  places on the map, or the picked one with its trip box.
                  On a phone the same panel is the drawer's body; the strip
                  holds the toggle back to the list. */}
              {isDesktop && view === 'map' && (
                <MapPlacePanel t={t}
                  rows={shownRows.slice(0, DRAWER_MAX)} count={shownRows.length}
                  picked={pickedRow} overviewOf={overviewOf}
                  onPick={onPick} onBack={() => setPickedId(null)} onOpen={openPlace}
                  favSet={favSet} onToggleFav={onToggleFav} />
              )}
              {!isDesktop && view === 'map' && (
                <MapDrawer
                  className="xdrawer"
                  state={drawer}
                  onStateChange={setDrawer}
                  ariaLabel={t('explore.drawerAria')}
                  labels={{ strip: t('explore.drawerStrip'), half: t('drawer.half'), full: t('drawer.full') }}
                  strip={viewSwitch('xview-strip')}
                >
                  <MapPlacePanel t={t} compact
                    rows={shownRows.slice(0, DRAWER_MAX)} count={shownRows.length}
                    picked={pickedRow} overviewOf={overviewOf}
                    onPick={onPick} onBack={() => setPickedId(null)} onOpen={openPlace}
                    favSet={favSet} onToggleFav={onToggleFav} />
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
                country={oneCountry}
                onPick={(slug) => onOpenStyles(slug)} onSeeAll={() => onOpenStyles(null)} />
            )}
            {/* The rails' doors, Show all places and the map toggle moved to
                the head block (T595); the rails draw no doors of their own. */}
            {railsIdle && (
              <ExploreRails rails={rails} onSelect={openPlace} t={t}
                favorites={favSet} onToggleFav={onToggleFav}
                month={xf.month || railMonth}
                lead={railLead} hideDoors />
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

            <div className={`xrows xrows--cards${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
              {listed.map((p) => (
                <ExploreCard
                  key={p.id}
                  layout="card"
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
      <SiteFooter />

      {viewSwitch('xview-fab')}
      </div>

      {/* The same sheet shell Destinations opens, with this tab's own rail as
          its body. `groups` and `countryOptions` stay empty on purpose: the
          rail already owns both, and the sheet rendering its own country
          dropdown on top of the rail's would be the duplicate control this
          change exists to remove. */}
      {startOpen && <StartDialog t={t} onClose={() => setStartOpen(false)} />}

      {/* T588: Share's answer, in the bottom slot. */}
      <div className="xtoast-slot" role="status" aria-live="polite">
        {toast && <p className="xtoast">{toast}</p>}
      </div>

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

// T586: the URL keys a lens sets. The overview's address keeps the rest
// (the countries, the sort), so Back lands on the same overview.
const LENS_KEYS = ['xk', 'xv', 'xr', 'xm', 'xb', 'xp', 'xe', 'xa', 'xn', 'xd', 'xg', 'xu', 'xw', 'xi', 'xall'];
function overviewHref() {
  if (typeof window === 'undefined') return '';
  const q = new URLSearchParams(window.location.search);
  for (const k of LENS_KEYS) q.delete(k);
  const qs = q.toString();
  return `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`;
}

/**
 * The overview and its lenses as history (T586). Entering a focused view
 * (a chip, See all, Show all places, a search) is one history step, so the
 * browser's Back returns to the overview; filters changed inside a lens
 * replace that step as before. The step carries `cartaLens` in its state,
 * and a page opened from the lens spreads the state, so stepping back from
 * a place lands in the lens, not on the overview.
 */
function useExploreLens({ isActive, railsIdle, focusAll, setFocusAll, clear }) {
  const clearRef = React.useRef(clear);
  clearRef.current = clear;
  const pushed = React.useRef(false);
  const idleRef = React.useRef(railsIdle);
  const wasIdle = React.useRef(railsIdle);
  // "Show all places" rides the URL as xall=1. Declared after the filter
  // writer in ExploreTab, so it runs after it and keeps its keys.
  React.useEffect(() => {
    if (!isActive) return;
    const q = new URLSearchParams(window.location.search);
    if (focusAll) q.set('xall', '1'); else q.delete('xall');
    const qs = q.toString();
    try {
      window.history.replaceState(window.history.state, '',
        `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
    } catch { /* sandboxed */ }
  }, [focusAll, isActive]);
  React.useEffect(() => {
    idleRef.current = railsIdle;
    if (!isActive) { wasIdle.current = railsIdle; return; }
    try {
      const st = window.history.state || {};
      if (railsIdle && st.cartaLens) {
        // Back on the overview by a chip or the link: this step is the
        // overview now, so a later lens steps back onto it.
        const { cartaLens: _drop, ...rest } = st;
        window.history.replaceState(rest, '', window.location.href);
      } else if (!railsIdle && wasIdle.current) {
        const lensUrl = window.location.href;
        window.history.replaceState(st, '', overviewHref());
        window.history.pushState({ ...st, cartaLens: 1 }, '', lensUrl);
        pushed.current = true;
      }
    } catch { /* sandboxed: the views still change */ }
    wasIdle.current = railsIdle;
  }, [railsIdle, isActive]);
  React.useEffect(() => {
    const onPop = (e) => {
      if (!pushed.current || idleRef.current) return;
      if ((e.state || {}).cartaLens) return;
      clearRef.current();
      setFocusAll(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setFocusAll]);
  const back = React.useCallback(() => {
    // The link always clears the lens in place. Stepping back through
    // history missed whenever a place page or the map had pushed their own
    // steps on top of the lens; the browser's Back still pops the lens.
    clearRef.current();
    setFocusAll(false);
  }, [setFocusAll]);
  return { back, href: overviewHref() };
}

/**
 * The overview's head (T586, T595; rebuilt as a hero by T601, Explore v8,
 * owner 2026-10-22: "more hierarchy, more professional, some background
 * image"). Top to bottom:
 *
 *   the band          one licensed catalogue photograph (Commons, credited
 *                     under the band) with a solid panel over its lower
 *                     edge: the headline with Ask Carta beside it (under it
 *                     on a phone), then the bar
 *   the bar           one joined field What | Where | Search, the Map pill
 *                     apart after it (desktop). Where works for every What:
 *                     Places searches the catalogue, a category hands the
 *                     typed text to its tab, Trip styles ignores it.
 *   level 2           the categories as tabs (ExploreCategories row)
 *   level 3           small quiet chips: the rails' doors, Countries on a
 *                     phone, All filters and Show all places
 */
function OverviewHero({
  t, TitleTag, locationQuery, setLocationQuery, onShowAll,
  viewToggle, quick, countries, filtersRef, filtersOn, filterCount, onAllFilters, photo,
}) {
  const [where, setWhere] = React.useState(locationQuery || '');
  const { open: askOpen } = useAskChat();
  const submit = (e) => {
    e.preventDefault();
    const q = where.trim();
    if (q) setLocationQuery(q); else onShowAll();
  };
  const whereId = React.useId();
  // T601: the photograph fades in once it has arrived, never from a blank
  // box the page waits on; a cached photo is shown at once.
  const photoUrl = photo?.url || null;
  const [shown, setShown] = React.useState(null);
  const imgRef = React.useCallback((el) => {
    if (el && el.complete && el.naturalWidth) setShown(photoUrl);
  }, [photoUrl]);
  return (
    <section className={`xov-hero${photo ? ' has-photo' : ''}`} aria-labelledby="xov-title">
      {/* T622 (owner 2026-10-23): on a desktop one scenic photograph with
          the search panel centred over it, so the block takes less height;
          on a phone no photograph at all, only the panel. No text on the
          photo; the credit sits under the band. */}
      <div className="xov-band">
        {photo && (
          <div className="xov-photo" aria-hidden="true">
            <img key={photo.url} ref={imgRef}
              className={`xov-photo-img${shown === photo.url ? ' is-in' : ''}`}
              src={fallbackSrc(photo.url, 1280)} srcSet={srcSetFor(photo.url, 1920)}
              sizes="100vw" alt="" width={16} height={9}
              loading="eager" decoding="async" fetchpriority="high"
              onLoad={() => setShown(photo.url)} />
          </div>
        )}
        <div className="xov-panel">
          <div className="xov-head">
            <TitleTag className="xov-title" id="xov-title">{t('explore.heroTitle')}</TitleTag>
            {/* Ask Carta, the chat's one door (T622: "bring it more to the
                front"): a pill beside the headline, its spark brown because
                it acts. */}
            <Button variant="secondary" className="xov-ask" aria-expanded={askOpen}
              iconStart={<SparkIcon size={18} />}
              onClick={(e) => (askOpen ? closeAskChat() : openAskChat(e.currentTarget))}>
              {t('askChat.open')}
            </Button>
          </div>
          <form className="xov-bar" role="search" aria-label={t('explore.heroSearchAria')} onSubmit={submit}>
            {/* One joined control, Where | Search (T622: What left; the
                category tabs above choose the kind). Where names itself by
                its label, with no placeholder. */}
            <div className="xov-field">
              <div className="xov-seg xov-seg-where">
                <MapPinIcon size={20} className="xov-where-icon" />
                <label className="xov-seg-cap" htmlFor={whereId}>{t('explore.heroWhere')}</label>
                {/* A blank placeholder, only so CSS can tell an empty field
                    (:placeholder-shown) and rest the label where the value goes. */}
                <input id={whereId} type="search" className="xov-where-input" value={where}
                  placeholder=" " autoComplete="off" enterKeyHint="search"
                  onChange={(e) => setWhere(e.target.value)} />
              </div>
              <Button type="submit" variant="primary" className="xov-go"
                iconStart={<SearchIcon size={18} />}>
                <span className="xov-go-word">{t('explore.heroSearch')}</span>
              </Button>
            </div>
          </form>
        </div>
      </div>
      {photo?.page && (
        <p className="xov-credit">
          <a href={photo.page} target="_blank" rel="noopener noreferrer">
            <CameraIcon size={14} className="xov-credit-icon" />
            <span>{t('explore.heroCredit', { place: photo.city, source: photo.source })}</span>
          </a>
        </p>
      )}
      {/* The quick chips: one quiet row; the map pill closes it on a
          desktop (a phone has the floating one). */}
      <div className="xov-picks">
        <div className="xov-quick" role="group" aria-label={t('explore.quickAria')}>
          <Button ref={filtersRef} variant="secondary" size="sm"
            className={`xquick-chip xquick-filters${filtersOn ? ' is-on' : ''}`}
            iconStart={<FilterIcon size={16} />} aria-expanded={filtersOn}
            onClick={onAllFilters}>
            {t('places.allFilters')}
            {filterCount > 0 && <Chip kind="count" className="xfilters-n">{filterCount}</Chip>}
          </Button>
          {countries}
          {quick.map((r) => (
            <Button key={r.key} variant="secondary" size="sm" className="xquick-chip"
              iconStart={QUICK_ICONS[r.key] ? React.createElement(QUICK_ICONS[r.key], { size: 16 }) : null}
              onClick={r.seeAll}>
              {r.short || r.title}
            </Button>
          ))}
          <Button variant="quiet" size="sm" className="xquick-chip xquick-all"
            iconEnd={<ChevronRightIcon size={16} />} onClick={onShowAll}>
            {t('explore.showAllPlaces')}
          </Button>
          {viewToggle}
        </div>
      </div>
    </section>
  );
}

/** The overview photograph's candidates (T622): places whose catalogue
 *  photo is a landscape, never a facade. */
const SCENIC_HERO = new Set([
  'Hallstatt', 'Bled', 'Lauterbrunnen', 'Grindelwald', 'Zermatt', 'Positano', 'Amalfi',
  'Manarola', 'Vernazza', 'Riomaggiore', 'Portofino', 'Reine', 'Geiranger', 'Oia',
  'Kotor', 'Annecy', 'Giethoorn', 'Bellagio', 'Varenna', "Cortina d'Ampezzo", 'Ortisei',
  'Chamonix', 'Plitvice', 'Bohinj', 'Gruyères', 'Mürren',
]);

/** The quick chips' icons: the same line icons the filter pane uses. */
const QUICK_ICONS = {
  saved: BookmarkIcon, gems: DiamondIcon, nocar: TrainIcon, quiet: PersonIcon,
  cost: PiggyIcon, now: SunIcon, top: StarIcon, hiking: BootIcon, beach: BeachIcon,
};

/**
 * Sort as a menu behind one pill (T588): the choices as menu radios, the
 * current one ticked. Arrow keys, Home and End move inside it; Escape, a
 * pick or a press outside closes it and focus goes back to the pill. The
 * menu is fixed under the pill, so the toolbar's sideways scroll on a
 * phone does not clip it.
 */
function SortMenu({ t, options, value, onChange }) {
  const [pos, setPos] = React.useState(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const id = React.useId();
  const cur = options.find((o) => o.key === value) || options[0];
  const open = pos != null;
  const close = React.useCallback((refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);
  const toggle = () => {
    if (open) { close(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const width = 220;
    setPos({
      top: Math.round(r.bottom + 4),
      left: Math.round(Math.max(16, Math.min(r.left, window.innerWidth - width - 16))),
    });
  };
  React.useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus();
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);
  const onMenuKey = (e) => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Tab') { close(false); return; }
    if (next) { e.preventDefault(); next.focus(); }
  };
  return (
    <>
      <Button ref={btnRef} variant="secondary" size="sm" className={`xtool${open ? ' is-open' : ''}`}
        iconStart={<SortIcon size={18} />} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${t('places.sortLabel')}: ${t(cur.labelKey)}`}
        onClick={toggle}>
        {t('explore.toolSort')}
      </Button>
      {open && createPortal(
        <div className="xsort-menu" role="menu" id={id} ref={menuRef} aria-label={t('places.sortLabel')}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          {options.map((o) => {
            const on = o.key === cur.key;
            return (
              <Button key={o.key} variant="quiet" size="sm" role="menuitemradio" aria-checked={on}
                tabIndex={-1} className={`xsort-item${on ? ' is-on' : ''}`}
                iconEnd={on ? <CheckIcon size={16} /> : null}
                onClick={() => { onChange(o.key); close(true); }}>
                {t(o.labelKey)}
              </Button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
