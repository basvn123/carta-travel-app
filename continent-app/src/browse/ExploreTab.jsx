import { SiteFooter } from '../components/SiteFooter.jsx';
import React from 'react';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { MONTHS_SHORT } from './ClimateStrip.jsx';
import { useExploreCatalog } from '../hooks/useExploreCatalog.js';
import { ExploreCategories } from './ExploreCategories.jsx';
import { loadSearchIndex, querySearchIndex } from '../lib/searchIndex.js';
import { placeLinkingOn } from '../lib/linking/flag.js';
import { loadAskLexicon } from '../lib/ask/data.js';
import { useI18n } from '../i18n/index.jsx';
import { GuidesStrip } from '../community/GuidesStrip.jsx';
import { FULL_RATING_RANGE } from '../lib/rating.js';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { MapCorner } from '../components/dock/MapCorner.jsx';
import { useTravelMonth, useSettings } from '../components/SettingsLine.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { Button } from '../components/ui/index.js';
import { useGuidedState } from '../lib/guidedData.js';
import { setDockKind, setDockResults, setDockHandlers, useSearchDock } from './searchDockStore.js';
// T586: the overview first page.
// T588: the focused view's toolbar.
// T585: the start dialog.
import { StartDialog, startMode, markStartSeen } from './StartDialog.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { calendarDefaultWindow } from '../lib/firstRun.js';
import { todayISO } from '../lib/dates.js';
import { isEmptyTaste, normalizeTaste } from '../lib/taste.js';
import { MATCH } from '../lib/match.js';
import { MatchMonth } from './WhyItMatches.jsx';
import '../styles/84-explore-overview.css';
import { SortMenu } from './explore/SortMenu.jsx';
import { OverviewHero } from './explore/OverviewHero.jsx';
import { useSettingsSheet, openSettings } from './settings/settingsSheetStore.js';
import { useFrozenOrder } from './band/useFrozenOrder.js';
import { useExploreLens } from './explore/useExploreLens.js';
import { ExploreContent } from './explore/ExploreContent.jsx';
import { ExploreToolbar } from './explore/ExploreToolbar.jsx';
import { useExploreRows } from './explore/useExploreRows.js';
import { PAGE } from './explore/exploreConsts.js';
import { useExploreRails } from './explore/useExploreRails.js';
import { useExploreAsk } from './explore/useExploreAsk.jsx';
import { useExploreChips, XF_EMPTY } from './explore/useExploreChips.js';
import { badgeCount, lensCount } from './explore/chipRules.js';
import { prefetchMap } from './explore/exploreMapLazy.js';
import { useExploreMapView } from './explore/useExploreMapView.js';
import { setMapViewOn } from './explore/mapViewStore.js';
import { FilterSheet } from './filters/FilterSheet.jsx';
import { closeFilters, publishFilters, setFilterHandlers, useFilters } from './filters/filtersStore.js';
import {
  SHORTCUTS, countNoTemp, parsePicks, parseTemps, shortcutOn, shortcutPatch, sortOptionsFor, sortShown,
} from './filters/filterModel.js';
import { spanOf, viewFactor } from '../lib/price/display.js';



// The shared predicates (no car, under a budget, quiet) live in
// lib/guidedSearch.js since T442, so the rails, the filters and the guided
// search read one definition each.

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
  const { data: guided, done: guidedDone } = useGuidedState(isActive);
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
      verdicts: list('xv'),
      month: q.get('xm') ? Number(q.get('xm')) : null,
      nocar: q.get('xp')?.includes('c') || false,
      budget,
      quiet: q.get('xp')?.includes('q') || false,
      // A vibe from the guided search data (T427): "hiking", "beach", ...
      vibe: q.get('xe') || null,
      // The guided search's own facets (T442): a named area (xa), within
      // 50 km of a place (xn), and a beach, trails or a lake close by (xd).
      area: q.get('xa') || null,
      near: q.get('xn') || null,
      nb: list('xd'),
      // G12 round 2 (decision.md section 2): the day-high bands (xt) and the
      // sheet's picks (xk: water, walking, kind of place). xk carried the
      // old trip kinds; an old link's city, island or mountains still read.
      temps: parseTemps(list('xt')),
      picks: parsePicks(list('xk')),
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
  // G12, D10 (round 6): before the app has written its default dates (they
  // reach Explore with the first settled prices, often with the full
  // catalogue), the month of the dates Carta will pick (lib/firstRun.js),
  // not today's: the rails said November, then all turned to December at
  // the late swap and were worked out again in one 0.7 s task at 4x CPU.
  const shownDepart = useSettings()?.departDate || calendarDefaultWindow(todayISO())?.start;
  const railMonth = travelMonth || Number(String(shownDepart || '').slice(5, 7)) || new Date().getMonth() + 1;
  const {
    view, setView, bbox, pickedId, setPickedId, mapOpened, viewportMode,
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
  // (off while persona gate 7 fails).
  const matchTasteRaw = useFirstRun()?.choices?.taste;
  const matchTaste = React.useMemo(
    () => (isEmptyTaste(matchTasteRaw) ? null : normalizeTaste(matchTasteRaw)), [matchTasteRaw]);
  const matchMonth = dxf.month || travelMonth || null;
  const catSort = (MATCH.for_you_default && matchTaste && (!sortKey || sortKey === 'beauty') && !xf.vibe && !xf.near)
    ? 'foryou' : sortKey;
  const { all: catAllRows, rows: catRows, availableCountries, indices: costIndex } = useExploreCatalog({
    data, locationQuery, countryFilter, countryNot, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes, sortKey: catSort, showFavOnly, favorites,
    indices, searchHits,
    taste: matchTaste, month: matchMonth,
  });

  const {
    settingsLine, setCountryNot, oneCountry, request, allRows, rows,
    nearRow, gLabels, overviewOf, roleFor, taxRows, liveTotal, countFor, guidedRows, shownRows, listed,
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
    // G12: Good for, budget floor, flight limit and best of left with the
    // filter pane; an old link's keys are dropped. G12 round 2: xk holds
    // the sheet's picks again.
    for (const k of ['xr', 'xbm', 'xfh']) q.delete(k);
    setOrDrop('xk', xf.picks.join(','));
    setOrDrop('xt', xf.temps.join(','));
    setOrDrop('xv', xf.verdicts.join(','));
    setOrDrop('xm', xf.month || '');
    setOrDrop('xb', xf.budget || '');
    const flags = `${xf.nocar ? 'c' : ''}${xf.quiet ? 'q' : ''}`;
    setOrDrop('xp', flags);
    setOrDrop('xe', xf.vibe || '');
    setOrDrop('xa', xf.area || '');
    setOrDrop('xn', xf.near || '');
    setOrDrop('xd', xf.nb.join(','));
    setOrDrop('xg', gemOnly ? '1' : '');
    setOrDrop('xu', unescoOnly ? '1' : '');
    setOrDrop('xc', countryFilter.join(','));
    setOrDrop('xo', countryNot && countryFilter.length ? '1' : '');
    // The sort is App's and App writes it as `sort` (lib/urlState.js); a
    // second key said the same twice (flow-filters m5). An old link's xs is
    // still read above, then dropped here.
    setOrDrop('xs', '');
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
  // The sheet's count follows a tap at once (liveTotal, the filters as
  // tapped); the list and its own count follow when the deferred render lands.
  const sheetTotal = view !== 'map' && liveTotal != null ? liveTotal : gridTotal;

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
    // G12 map view: on a desktop the list is the column beside the map.
    const card = scrollRef.current?.querySelector(`.xcontent-main .xrow[data-id="${CSS.escape(id)}"]`)
      || scrollRef.current?.querySelector(`.mpp .xrow[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    selfScrollUntil.current = Date.now() + 800;
    card.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, []);
  const { resetAll, chips, lastChip, favSet, emptyLine } = useExploreChips({
    availableCountries, countryFilter, countryNot, favorites, gLabels,
    gemOnly, gridTotal, locationQuery, nearRow, patchXf, reachAvailable, reachHours, request,
    scrollRef, sentinelRef, setBigOnly, setCountryFilter, setGemOnly, setLocationQuery,
    setRatingRange, setReachHours, setShowFavOnly, setTopBeachOnly, setTopPick, setTripKinds,
    setUnescoOnly, setVisible, setXf, showFavOnly, t, travelMonth, tripKinds, unescoOnly, xf,
  });

  // Desktop chrome: the controls stand in the left panel. Ask Carta's one
  // door is the overview's own field (T595, owner 2026-10-22: only on
  // Explore, not in the header and not on other tabs).
  const isDesktop = useIsDesktop();
  // G12 map view: the band and the corners follow the map view while this
  // tab is the one on screen (mapViewStore).
  const mapViewOn = isActive && !pageOver && view === 'map';
  React.useEffect(() => {
    setMapViewOn(mapViewOn);
    return () => setMapViewOn(false);
  }, [mapViewOn]);

  // T504: picking and opening. A pin picks a place (the overview shows);
  // the overview, a second tap on the same pin, or a list row opens it. A
  // place opened from the list is the pick too, so the map and the list
  // agree on the way back.
  const openPlace = React.useCallback((id) => {
    setPickedId(id);
    openWithMember(id);
  }, [openWithMember, setPickedId]);
  // G12 map view: on a phone the pick shows as the tap card over the map
  // (MapTapCard), so the map keeps its height; a tap on the open map clears it.
  const onPick = React.useCallback((id) => {
    setPickedId(id || null);
  }, [setPickedId]);
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
      ? { vibe: null, area: null, near: null, month: null, budget: null, nb: [], nocar: false, quiet: false, temps: [], picks: [], ...delta }
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
  // G12: Strong match is also the overview's own toggle, so like the
  // countries it narrows without leaving the overview.
  const lensChips = lensCount(chips);
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
      setXf({ ...XF_EMPTY });
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
  // G12 round 2: on every width the band's field holds Back and the query
  // (decision.md section 1), so the list state is published on both.
  const filterCount = badgeCount(chips);
  if (isActive) {
    setDockHandlers({ onBack: () => lens.back() });
  }
  React.useEffect(() => {
    if (!isActive) return;
    setDockKind('places');
    setDockResults(railsIdle ? null : {
      label: dockLabel, query: locationQuery || '', filterCount,
      // G12: the applied field carries Share on a phone; a desktop has it at
      // the applied row's right end.
      canShare: true,
    });
  }, [isActive, railsIdle, dockLabel, locationQuery, filterCount]);
  // Share copies this view's address.
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
  if (isActive) setDockHandlers({ onShare: shareView });
  // T585: the start dialog, once per device on a wide screen (T595: on the
  // first visit only; Ask Carta's field took over its door). On a phone a
  // first visit with no travel style opens the Style Studio's create flow
  // instead (Style Studio, G12): the style is what every price follows.
  const travelStyles = useSettings()?.travelStyles;
  const stylesRef = React.useRef(travelStyles);
  stylesRef.current = travelStyles;
  const [startOpen, setStartOpen] = React.useState(null);
  // Read when the studio's chunk arrives, which can be seconds later.
  const hereRef = React.useRef(false);
  hereRef.current = isActive && !pageOver;
  React.useEffect(() => {
    if (!isActive || pageOver) return undefined;
    const ts = stylesRef.current;
    const mode = startMode({ noStyle: !ts?.list?.length });
    if (!mode) return undefined;
    if (mode !== 'create') {
      markStartSeen();
      setStartOpen(mode);
      return undefined;
    }
    // G12 (flow-1 m5): the create flow opens only once its chunk is here
    // (the same module App's lazy studio loads, so it then draws at once,
    // with no empty frame), and only while the traveller is still on
    // Explore. Seen is marked when it opens: a traveller who left first
    // gets it on the next visit instead of never.
    let live = true;
    import('./styles/StyleStudio.jsx').then(() => {
      if (!live || !hereRef.current || stylesRef.current?.list?.length) return;
      markStartSeen();
      stylesRef.current?.setOpen({ view: 'create' });
    }).catch(() => { /* offline: the corner disc still opens the studio */ });
    return () => { live = false; };
  }, [isActive, pageOver]);
  // G12 round 2 (decision.md section 1): a shortcut sets its one filter in
  // place; the band stays and the list shows under it. The rails' See all
  // for the same themes call it too, so both leave the same chip.
  const applyShortcut = React.useCallback((id, on = true) => {
    setXf((v) => {
      const patch = shortcutPatch(id, on, v);
      return patch.xf ? { ...v, ...patch.xf } : v;
    });
    const g = shortcutPatch(id, on, null);
    if ('gemOnly' in g) setGemOnly(g.gemOnly);
  }, [setGemOnly]);
  const { rails, railLead, railsSettled } = useExploreRails({
    allRows, applyShortcut, favorites, guided, isDesktop, lang, patchXf, railMonth, railsIdle, rows,
    setShowFavOnly, setSortKey, t, xf,
  });
  // G12 (Explore top, decision.md "Layout stability"): while Settings is
  // open the list and the rails keep the order they had when it opened;
  // prices change in place and the order recomputes once it closes.
  const sheet = useSettingsSheet();
  const frozen = isActive && sheet.isOpen;
  const listSource = view === 'map' ? shownRows : guidedRows;
  const toFreeze = React.useMemo(() => {
    const o = { list: listSource };
    for (const rail of rails) o[`rail:${rail.key}`] = rail.rows;
    return o;
  }, [listSource, rails]);
  const held = useFrozenOrder(frozen, toFreeze);
  const shownList = React.useMemo(
    () => (frozen && held !== toFreeze ? held.list.slice(0, visible) : listed), [frozen, held, toFreeze, listed, visible]);
  const shownRails = React.useMemo(
    () => (frozen && held !== toFreeze ? rails.map((rail) => ({ ...rail, rows: held[`rail:${rail.key}`] || rail.rows })) : rails),
    [frozen, held, toFreeze, rails]);

  // The control bar's three instruments. The count is a measured figure,
  // so it is grouped the way the reader's locale groups thousands.

  // G12 round 2 (decision.md section 2): Best match, Price, Score, A to Z,
  // the same choices in the sheet and in the desktop row's menu. Best match
  // is the match order under a guided question or a pick (T444), else the
  // Score order; Best match does not read the style's taste while config
  // keeps "For you" off by default (T765), so For you leads the list when
  // the active style gives a taste, as in the sheet (requests-5.md R5.1).
  const sortMenu = (
    <SortMenu t={t} options={sortOptionsFor(!!matchTaste)} onChange={setSortKey} showValue className="xap-tool"
      value={sortShown(sortKey, !!matchTaste)} />
  );

  // T592 (owner, 2026-10-22): one toggle, not a List | Map pair. In the
  // list it offers the map, on the map it offers the list: a secondary pill
  // with the icon of where it goes. Drawn in the desktop toolbar, floating
  // above the bottom nav on a phone, and in the map sheet's head. Reaching
  // it starts loading the map.
  const viewSwitch = (cls) => {
    const toMap = view !== 'map';
    return (
      <span className={cls} onPointerEnter={prefetchMap} onFocus={prefetchMap}>
        <Button variant="secondary" size="sm" className="xview-toggle"
          iconStart={toMap ? <HouseIcon.map size={18} /> : <HouseIcon.list size={18} />}
          onClick={() => setView(toMap ? 'map' : 'grid')}>
          {t(toMap ? 'explore.viewMap' : 'explore.viewList')}
        </Button>
      </span>
    );
  };

  // G12 round 2: the filters' store (filters/filtersStore.js) is the line
  // to the band: its Filters control, its Browse shortcuts and the sheet
  // read the same figures. Published only while Places is the tab on screen.
  const filters = useFilters();
  const shortcutList = React.useMemo(() => SHORTCUTS.map((s) => ({
    id: s.id, label: t(s.labelKey), on: shortcutOn(s.id, { xf, gemOnly }),
  })), [t, xf, gemOnly]);
  React.useEffect(() => {
    if (!isActive) return;
    publishFilters({ count: filterCount, total: sheetTotal, shortcuts: shortcutList });
  }, [isActive, filterCount, sheetTotal, shortcutList]);
  React.useEffect(() => {
    if (!isActive) return undefined;
    return () => { closeFilters(); };
  }, [isActive]);
  if (isActive) setFilterHandlers({ applyShortcut });
  const noTemp = React.useMemo(
    () => (filters.isOpen && travelMonth ? countNoTemp(allRows, travelMonth) : 0),
    [filters.isOpen, travelMonth, allRows]);
  const sheetState = {
    xf, setXf, sortKey, setSortKey, showFavOnly, setShowFavOnly, gemOnly, setGemOnly,
    unescoOnly, setUnescoOnly, month: travelMonth,
    monthName: travelMonth ? gLabels.monthInline(travelMonth) : '',
    noTemp, dayFactor: viewFactor(request), tripSpan: spanOf(request) === 'trip',
    total: sheetTotal, countFor: view !== 'map' ? countFor : null, listOn: !railsIdle, count: filterCount, onClearAll: resetAll,
    onSetMonth: () => { closeFilters(); openSettings({ step: 'when' }); },
    // From the overview with nothing chosen, Show opens every place.
    onShow: () => { if (railsIdle) setFocusAll(true); },
  };

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
  // G12 (Explore top): on a phone the band in the top bar draws them.
  // G12 round 2 (decision.md section 6): the desktop List | Map switch sits
  // at the tab row's right end; the row draws it from `view` and `onView`.
  const catTiles = onPickCategory && isDesktop ? (
    <ExploreCategories current="places" variant="row"
      view={view === 'map' ? 'map' : 'list'} onView={(v) => setView(v === 'map' ? 'map' : 'grid')}
      onViewIntent={prefetchMap}
      onPick={(key) => onPickCategory(key, oneCountry || '')} />
  ) : null;

  // G12 (Explore top, decision.md "Removed"): the filter pane, its four
  // doors, Priced for and Strong match left the top of Explore; the rails'
  // own See all and the chips of filters already on stay.
  const anyActive = chips.length > 0;
  const TitleTag = isActive && !pageOver ? 'h1' : 'div';


  return (
    <MatchMonth.Provider value={matchMonth}>
    <div className={`explore-shell${view === 'map' ? ' is-map' : ''}${railsIdle ? ' is-rails is-overview' : ' is-focus'} is-pane-closed`}>
      {askHost}

      <div className="explore-tab" ref={scrollRef}>
      <div className="explore-wrap">
        {/* T622 (owner 2026-10-23: "the tabs need to be brought more to
            the front, larger, more on top"): the six categories lead every
            view of the tab, right under the settings line. */}
        {catTiles && <div className="xcats-bar">{catTiles}</div>}
        {/* G12 round 2 (decision.md sections 1 and 4): the phone's row of
            rail chips under the tabs and the desktop's quick row left; the
            shortcuts live in the search panel (Browse) and apply in place,
            and Map sits at the tab row's end or in the phone's corner. The
            overview keeps its name for a screen reader. */}
        {railsIdle && <OverviewHero t={t} TitleTag={TitleTag} docked />}
        {/* The six categories as one row of tabs (T586, owner decision 7);
            on the overview they sit inside the head block (T595). */}
        {/* The control bar: what this page is and how many places it holds
            right now (the count, V3), and the two ways to rearrange them.
            On a phone the title is read but not drawn, so the count is the
            visible line, sharing its row with the sort; the Map corner sits
            bottom right instead (MapCorner). */}
        {/* G12 round 2: the list's head is the applied row under the band
            (filters/AppliedRow.jsx): one removable chip per filter, Clear
            all, and on a desktop Sort, Saved and Share at its right end. */}
        {!railsIdle && (
        <ExploreToolbar
          TitleTag={TitleTag} chips={chips} filterCount={filterCount} gridTotal={gridTotal}
          isDesktop={isDesktop} isMock={isMock} lang={lang}
          setShowFavOnly={setShowFavOnly} shareView={shareView}
          showFavOnly={showFavOnly} sortMenu={sortMenu} t={t}
          resetAll={resetAll}
        />
        )}

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

        {/* C7: the feed. Grid alone, or on a desktop the grid beside a
            sticky map, the list narrowing to what the map holds. On a
            phone the map takes the column and the floating switch brings
            the list back. */}
        <ExploreContent
          allRows={allRows} anyActive={anyActive} cardLinkId={cardLinkId} chips={chips}
          catalogueFull={!data?.partial}
          contentRef={contentRef} costIndex={costIndex} dxf={dxf}
          guidedRows={guidedRows} isActiveMap={mapViewOn} lang={lang} sortMenu={sortMenu}
          emptyLine={emptyLine} favSet={favSet} gridTotal={gridTotal} isActive={isActive}
          isDesktop={isDesktop} lastChip={lastChip} listed={shownList}
          locationQuery={locationQuery} mapOpened={mapOpened} mapTop={mapTop}
          onMapNeedDetail={onMapNeedDetail} onMapViewport={onMapViewport} onPick={onPick}
          onPinLink={onPinLink} onToggleFav={onToggleFav} openPlace={openPlace}
          overviewOf={overviewOf} pageOver={pageOver} pending={pending} pickedId={pickedId}
          pickedRow={pickedRow} pinLinkId={pinLinkId} pins={pins} railLead={railLead}
          railMonth={railMonth} rails={shownRails} railsIdle={railsIdle} reachMinutes={reachMinutes}
          resetAll={resetAll} roleFor={roleFor} searchHits={searchHits} selectedId={selectedId}
          sentinelRef={sentinelRef} setCardLinkId={setCardLinkId}
          setLocationQuery={setLocationQuery} setPickedId={setPickedId}
          setShowFavOnly={setShowFavOnly} setView={setView} showFavOnly={showFavOnly}
          shownRows={shownRows} t={t} taxRows={taxRows} view={view} viewSwitch={viewSwitch}
          viewportMode={viewportMode} visible={visible} xf={xf}
        />
      </div>
      {/* G12, D10 (round 6): on the overview the footer waits until the
          rails are complete (the guided data's rails in, or its file
          missing): drawn earlier it stood in view on a short page and a
          rail arriving above pushed it down under the reader (0.11 of a
          1280 screen in perf_explore.mjs). */}
      {(railsSettled || (guidedDone && !guided)) && <SiteFooter />}

      {/* G12 round 2: the phone's Map is the fixed bottom-right corner
          (components/dock/MapCorner.jsx); the map drawer's List brings the
          list back, so the corner steps out while the map shows. */}
      {!isDesktop && view !== 'map' && (
        <MapCorner onOpen={() => setView('map')} onPrefetch={prefetchMap} />
      )}
      </div>

      {/* The same sheet shell Destinations opens, with this tab's own rail as
          its body. `groups` and `countryOptions` stay empty on purpose: the
          rail already owns both, and the sheet rendering its own country
          dropdown on top of the rail's would be the duplicate control this
          change exists to remove. */}
      {startOpen && <StartDialog t={t} mode={startOpen} onClose={() => setStartOpen(null)} />}

      {/* G12 round 2: the filters, a sheet on a phone and a panel under the
          search bar on a desktop (filters/FilterSheet.jsx). */}
      {isActive && filters.isOpen && (
        <FilterSheet desktop={isDesktop} group={filters.group} nonce={filters.nonce}
          onClose={closeFilters} f={sheetState} t={t} lang={lang} />
      )}

      {/* T588: Share's answer, in the bottom slot. */}
      <div className="xtoast-slot" role="status" aria-live="polite">
        {toast && <p className="xtoast">{toast}</p>}
      </div>

    </div>
    </MatchMonth.Provider>
  );
}







