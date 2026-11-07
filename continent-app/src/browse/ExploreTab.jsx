import { SiteFooter } from '../components/SiteFooter.jsx';
import React from 'react';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { MONTHS_SHORT } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreFilterRail, ExploreQuickFilters } from './ExploreFilterRail.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { TasteRow } from './TasteDoor.jsx';
import { ExploreCategories } from './ExploreCategories.jsx';
import { FilterChips } from './FilterChips.jsx';
import { loadSearchIndex, querySearchIndex } from '../lib/searchIndex.js';
import { placeLinkingOn } from '../lib/linking/flag.js';
import { loadAskLexicon } from '../lib/ask/data.js';
import { useI18n } from '../i18n/index.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FULL_RATING_RANGE } from '../lib/rating.js';
import { ChevronRightIcon, MapPinIcon, ListDayIcon } from '../components/Icons.jsx';
import { useTravelMonth, useSettings } from '../components/SettingsLine.jsx';
import { PriceViewSwitch } from '../components/PriceViewSwitch.jsx';
import { scrollBehavior } from '../lib/motion.js';

// T764: the taste profile's sheet and learning question load when asked for.
const TasteLearnPrompt = React.lazy(() => import('./TasteSheet.jsx').then((m) => ({ default: m.TasteLearnPrompt })));
import { Button } from '../components/ui/index.js';
import { useGuidedData } from '../lib/guidedData.js';
import { setDockKind, setDockResults, setDockHandlers, useSearchDock } from './searchDockStore.js';
// T586: the overview first page.
// T588: the focused view's toolbar.
// T585: the start dialog.
import { StartDialog, startMode, markStartSeen } from './StartDialog.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { isEmptyTaste, learnFacet, normalizeTaste } from '../lib/taste.js';
import { MATCH } from '../lib/match.js';
import { MatchMonth } from './WhyItMatches.jsx';
import '../styles/84-explore-overview.css';
import { SortMenu } from './explore/SortMenu.jsx';
import { OverviewHero } from './explore/OverviewHero.jsx';
import { useExploreLens } from './explore/useExploreLens.js';
import { ExploreContent } from './explore/ExploreContent.jsx';
import { ExploreToolbar } from './explore/ExploreToolbar.jsx';
import { useExploreRows } from './explore/useExploreRows.js';
import { PAGE } from './explore/exploreConsts.js';
import { useExploreRails } from './explore/useExploreRails.js';
import { useExploreAsk } from './explore/useExploreAsk.jsx';
import { useExploreChips } from './explore/useExploreChips.js';
import { prefetchMap } from './explore/exploreMapLazy.js';
import { useExploreMapView } from './explore/useExploreMapView.js';



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
  onOpenStyles: _onOpenStyles = null, // T1030: kept for callers; Explore no longer draws the trip block
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
  const {
    view, setView, bbox, pickedId, setPickedId, drawer, setDrawer, mapOpened, viewportMode,
    pins, onMapViewport, onMapNeedDetail,
  } = useExploreMapView({ isActive });
  // B2: the fold-and-alias index answers the search box. Loaded on the
  // first real query, then cached for the session.
  // T1153 (F4): behind the place linking flag, the linker answers instead
  // (typos, exonyms, booking words), in the same shape.
  const [searchHits, setSearchHits] = React.useState(null);
  const linkOn = React.useMemo(() => placeLinkingOn(), []);
  const linkCountry = !countryNot && countryFilter.length === 1 ? countryFilter[0] : null;
  const linkDest = linkOn ? data?.destinations || null : null;
  React.useEffect(() => {
    let live = true;
    if (!locationQuery || locationQuery.length < 3) { setSearchHits(null); return undefined; }
    if (linkOn) {
      // Loaded on demand, so the flag off costs the main bundle nothing.
      Promise.all([loadSearchIndex(), loadAskLexicon().catch(() => null), import('../lib/linking/search.js')]).then(([ix, lex, linking]) => {
        if (!live) return;
        setSearchHits(ix ? linking.linkSearchHits(linking.linkerFor(ix, linkDest, lex), ix, locationQuery, { country: linkCountry }) : querySearchIndex(ix, locationQuery));
      });
    } else {
      loadSearchIndex().then((ix) => {
        if (live) setSearchHits(querySearchIndex(ix, locationQuery));
      });
    }
    return () => { live = false; };
  }, [locationQuery, linkOn, linkDest, linkCountry]);

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
  // T765: the personal match. "For you" is a sort the traveller picks; it is
  // the default only once config/rating.json match.for_you_default is on
  // (off while persona gate 7 fails). Strong match (70% and up) is a filter
  // the traveller sets, never one the match sets by itself.
  const matchTasteRaw = useFirstRun()?.choices?.taste;
  const matchTaste = React.useMemo(
    () => (isEmptyTaste(matchTasteRaw) ? null : normalizeTaste(matchTasteRaw)), [matchTasteRaw]);
  const matchMonth = dxf.month || travelMonth || null;
  const [strongOnly, setStrongOnly] = React.useState(false);
  const catSort = (MATCH.for_you_default && matchTaste && (!sortKey || sortKey === 'beauty') && !xf.vibe && !xf.near)
    ? 'foryou' : sortKey;
  const { all: catAllRows, rows: catRows, availableCountries, indices: costIndex } = useExploreCatalog({
    data, locationQuery, countryFilter, countryNot, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey: catSort, showFavOnly, favorites,
    indices, searchHits,
    taste: matchTaste, month: matchMonth, strongOnly,
  });

  const {
    settingsLine, setCountryNot, oneCountry, request, flightLimitAvailable, allRows, rows,
    nearRow, gLabels, overviewOf, roleFor, taxRows, guidedRows, shownRows, listed,
  } = useExploreRows({
    availableCountries, bbox, catAllRows, catRows, countryFilter, countryNot, data, dxf, guided,
    lang, sortKey, t, travelMonth, view, visible, xf,
  });

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
  const { sheetOpen, setSheetOpen, filterBtnRef, resetAll, chips, lastChip, favSet, emptyLine } = useExploreChips({
    availableCountries, countryFilter, countryNot, favorites, flightLimitAvailable, gLabels,
    gemOnly, gridTotal, locationQuery, nearRow, patchXf, reachAvailable, reachHours, request,
    scrollRef, sentinelRef, setBigOnly, setCountryFilter, setGemOnly, setLocationQuery,
    setRatingRange, setReachHours, setShowFavOnly, setTopBeachOnly, setTopPick, setTripKinds,
    setUnescoOnly, setVisible, setXf, showFavOnly, t, tripKinds, unescoOnly, xf,
  });

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
  }, [openWithMember, setPickedId]);
  const onPick = React.useCallback((id) => {
    setPickedId(id || null);
    // On a phone the drawer rises to half with the picked place on top, and
    // a tap on the open map lowers it again (design 1.5 C, question 7).
    if (!isDesktop) setDrawer((d) => (id ? (d === 'strip' ? 'half' : d) : 'strip'));
  }, [isDesktop, setDrawer, setPickedId]);
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
  const { askHost } = useExploreAsk({
    allRows, applyGuided, availableCountries, chips, data, favorites, gLabels, guided, isActive,
    lang, onPlanTrip, onSeedConsumed, onShowExplore, onToggleFav, openWithMember, rows, seed,
    setVisible, settingsLine, t,
  });

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
  // T961, T962: the phone's search dock is this view's search. While this
  // tab is on screen it says the kind is Places and, once a search or a
  // filter has left the overview, what the list is and how many filters
  // are on, so the dock draws Back and the one Filters button. Its empty
  // Search opens every place.
  const dock = useSearchDock();
  const dockShowAll = React.useRef(dock.showAll);
  React.useEffect(() => {
    if (dock.showAll === dockShowAll.current) return;
    dockShowAll.current = dock.showAll;
    setFocusAll(true);
  }, [dock.showAll]);
  const dockLabel = locationQuery
    ? t('dock.in', { what: t('places.catPlaces'), q: locationQuery })
    : t('explore.placesTitle');
  if (isActive && !isDesktop) {
    setDockHandlers({ onBack: () => lens.back(), onFilters: () => setSheetOpen(true) });
  }
  React.useEffect(() => {
    if (!isActive || isDesktop) return;
    setDockKind('places');
    setDockResults(railsIdle ? null : {
      label: dockLabel, query: locationQuery || '', filterCount: chips.length, filtersOpen: sheetOpen,
    });
  }, [isActive, isDesktop, railsIdle, dockLabel, locationQuery, chips.length, sheetOpen]);
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
  // first visit only; Ask Carta's field took over its door). T764: on a
  // phone a first visit with no taste opens it on the taste questions.
  const firstRun = useFirstRun();
  const taste = normalizeTaste(firstRun?.choices?.taste);
  const tasteRef = React.useRef(taste);
  tasteRef.current = taste;
  const [startOpen, setStartOpen] = React.useState(null);
  React.useEffect(() => {
    if (!isActive || pageOver) return;
    const mode = startMode({ tasteEmpty: isEmptyTaste(tasteRef.current) });
    if (mode) { markStartSeen(); setStartOpen(mode); }
  }, [isActive, pageOver]);
  // T947 (owner): the taste chip left the chip row; "Your travel style" is a
  // row in the Filters pane and in every settings surface (TasteDoor.jsx).
  // T764: the learning question, only with consent and only after a save:
  // when the shortlist grows (never on load), the saved places are read for
  // a facet five of them share that the traveller did not pick and was
  // never asked about (lib/taste.js learnFacet).
  const [learn, setLearn] = React.useState(null);
  const savedCountRef = React.useRef(null);
  React.useEffect(() => {
    const n = favorites?.size ?? 0;
    const before = savedCountRef.current;
    savedCountRef.current = n;
    if (before == null || n <= before || !firstRun?.setChoices) return;
    const records = [...favorites].map((id) => data?.destinations?.[id]).filter(Boolean);
    const facet = learnFacet(tasteRef.current, records);
    if (facet) setLearn(facet);
  }, [favorites, data?.destinations, firstRun?.setChoices]);
  const { rails, railLead, quickRails, heroPhoto } = useExploreRails({
    allRows, favorites, guided, isDesktop, lang, patchXf, railMonth, railsIdle, rows,
    setGemOnly, setShowFavOnly, setSortKey, t, xf,
  });
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
    // T765: "For you" is offered once the traveller has a taste.
    : matchTaste ? [{ key: 'foryou', labelKey: 'fit.sort' }, ...SORTS] : SORTS;
  // T588: the sort is a menu behind one pill in the toolbar.
  const sortMenu = (
    <SortMenu t={t} options={sortOptions} onChange={setSortKey}
      value={sortOptions.some((x) => x.key === catSort) ? catSort : 'beauty'} />
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
      tasteRow={<TasteRow className="xpane-taste" before={sheetOpen ? () => setSheetOpen(false) : undefined} />}
      count={gridTotal}
      onClearAll={chips.length ? resetAll : null}
    />
  );

  const anyActive = chips.length > 0;
  const TitleTag = isActive && !pageOver ? 'h1' : 'div';


  return (
    <MatchMonth.Provider value={matchMonth}>
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
          <OverviewHero t={t} TitleTag={TitleTag} photo={isDesktop ? heroPhoto : null} docked={!isDesktop}
            locationQuery={locationQuery} setLocationQuery={setLocationQuery}
            onShowAll={() => setFocusAll(true)}
            viewToggle={viewSwitch('xov-view')}
            quick={quickRails}
            filtersRef={filterBtnRef}
            filtersOn={isDesktop ? ovPane : sheetOpen}
            filterCount={chips.length}
            onAllFilters={() => (isDesktop ? setOvPane((v) => !v) : setSheetOpen(true))}
            strongChip={matchTaste ? (
              // T765: Strong match, 70% and up; a filter the traveller sets.
              <Button variant="secondary" size="sm"
                className={`xquick-chip xstrong-chip${strongOnly ? ' is-on' : ''}`}
                title={t('fit.strongHint', { pct: Math.round(MATCH.strong_min * 100) })}
                aria-pressed={strongOnly} onClick={() => setStrongOnly((v) => !v)}>
                {t('fit.strong')}
              </Button>
            ) : null} />
        )}
        {/* The six categories as one row of tabs (T586, owner decision 7);
            on the overview they sit inside the head block (T595). */}
        {/* The control bar: what this page is and how many places it holds
            right now (the count, V3), and the two ways to rearrange them.
            On a phone the title is read but not drawn, so the count is the
            visible line, sharing its row with the sort; the grid/map switch
            floats above the bottom nav instead (.xview-fab). */}
        {!railsIdle && (
        <ExploreToolbar
          TitleTag={TitleTag} chips={chips} filterBtnRef={filterBtnRef} gridTotal={gridTotal}
          isDesktop={isDesktop} isMock={isMock} lang={lang} lens={lens} matchTaste={matchTaste}
          paneOpen={paneOpen} setPaneOpen={setPaneOpen} setSheetOpen={setSheetOpen}
          setShowFavOnly={setShowFavOnly} setStrongOnly={setStrongOnly}
          settingsLine={settingsLine} shareView={shareView} sheetOpen={sheetOpen}
          showFavOnly={showFavOnly} sortMenu={sortMenu} strongOnly={strongOnly} t={t}
          viewSwitch={viewSwitch}
        />
        )}


        {/* C6: active filters as removable chips, right under the bar. */}
        {/* On a phone the sort leads the chip row (62-v6-explore.css), so
            the list has one refine row; the bar's own sort shows otherwise. */}
        {/* T598 (owner points 7 and 11): quick filter chips right under the
            head, AllTrails style, each a small popover over the same state
            the pane edits; then the active filters. */}
        {!railsIdle && isDesktop && <ExploreQuickFilters {...railProps} />}
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
        <ExploreContent
          allRows={allRows} anyActive={anyActive} cardLinkId={cardLinkId} chips={chips}
          contentRef={contentRef} costIndex={costIndex} drawer={drawer} dxf={dxf}
          emptyLine={emptyLine} favSet={favSet} gridTotal={gridTotal} isActive={isActive}
          isDesktop={isDesktop} lastChip={lastChip} listed={listed}
          locationQuery={locationQuery} mapOpened={mapOpened} mapTop={mapTop}
          onMapNeedDetail={onMapNeedDetail} onMapViewport={onMapViewport} onPick={onPick}
          onPinLink={onPinLink} onToggleFav={onToggleFav} openPlace={openPlace}
          overviewOf={overviewOf} pageOver={pageOver} pending={pending} pickedId={pickedId}
          pickedRow={pickedRow} pinLinkId={pinLinkId} pins={pins} railLead={railLead}
          railMonth={railMonth} rails={rails} railsIdle={railsIdle} reachMinutes={reachMinutes}
          resetAll={resetAll} roleFor={roleFor} searchHits={searchHits} selectedId={selectedId}
          sentinelRef={sentinelRef} setCardLinkId={setCardLinkId} setDrawer={setDrawer}
          setLocationQuery={setLocationQuery} setPickedId={setPickedId}
          setShowFavOnly={setShowFavOnly} setView={setView} showFavOnly={showFavOnly}
          shownRows={shownRows} t={t} taxRows={taxRows} view={view} viewSwitch={viewSwitch}
          viewportMode={viewportMode} visible={visible} xf={xf}
        />
      </div>
      <SiteFooter />

      {viewSwitch('xview-fab')}
      </div>

      {/* The same sheet shell Destinations opens, with this tab's own rail as
          its body. `groups` and `countryOptions` stay empty on purpose: the
          rail already owns both, and the sheet rendering its own country
          dropdown on top of the rail's would be the duplicate control this
          change exists to remove. */}
      {startOpen && <StartDialog t={t} mode={startOpen} onClose={() => setStartOpen(null)} />}
      {learn && (
        <React.Suspense fallback={null}>
          <TasteLearnPrompt facet={learn} onDone={() => setLearn(null)} />
        </React.Suspense>
      )}

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
          extra={isDesktop ? filterRail : (
            <>
              {/* T962: how prices read joins the filters on a phone. */}
              <PriceViewSwitch className="xsheet-price" />
              {filterRail}
            </>
          )}
          activeFilters={chips.length}
          resetAll={resetAll}
          resultCount={gridTotal}
        />
      )}
    </div>
    </MatchMonth.Provider>
  );
}







