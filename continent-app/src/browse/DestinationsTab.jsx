import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingBlock } from '../components/StateBlocks.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { countryName as localCountryName } from '../lib/countryName.js';
import { needsCountry } from '../lib/favorites.js';
import { railOrigin } from '../lib/railAlternative.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { FilterChips } from './FilterChips.jsx';
import { HeroPreload } from '../components/LayerPhoto.jsx';
import { loadTrails, loadListedTrails, loadTrailsIndex, loadTopTrails } from '../lib/trails.js';
import { trailHash } from '../lib/routeLinks.js';
import { useTrailPhotoPool } from '../lib/trailPhotoPool.js';
import { loadMountains } from '../lib/mountains.js';
import { loadTripIndex, loadTrips, loadTopTrips } from '../lib/trips.js';
import { associateTrip, tripKindKey, tripThemes } from '../lib/trailCards.js';
import NotYet from '../components/NotYet.jsx';
import { useI18n } from '../i18n/index.jsx';
import { geocodeAddress, reverseGeocode, geoLines } from '../lib/geocode.js';
import { rankPlaces } from '../lib/placeSearch.js';
import { scopeForRows } from '../lib/regions.js';
import { SearchIcon, ChevronRightIcon, RouteIcon, SkylineIcon, MapPinIcon, CrosshairIcon, CityIcon, TownIcon, VillageIcon, AreaIcon, FilterIcon, ArrowLeftIcon, ListDayIcon, CheckIcon } from '../components/Icons.jsx';
import { CountriesButton } from '../components/CountriesControl.jsx';
import { JourneysSection } from './JourneysSection.jsx';
import { loadAllJourneyCards, dropJourneyHash } from '../lib/journeys.js';
import { useSettings, useTravelMonth } from '../components/SettingsLine.jsx';
import { CoverageEmpty } from './CoverageEmpty.jsx';
import { MICROSTATES, countryGeo, pointGeo } from '../lib/coverageEmpty.js';
import { loadStubs } from '../lib/stubs.js';
import { CardStrip } from './CardStrip.jsx';
import { PlaceCard, PlaceCardPhoto, PlaceCardNoPhoto } from './PlaceCard.jsx';
import { SectionOpening, SectionHead } from './SectionOpening.jsx';
import { countryKnownKey } from '../lib/countryGallery.js';
import { Button, Chip, Field, Segmented, Tile, TileGroup } from '../components/ui/index.js';
import { createPortal } from 'react-dom';
import { pickIcons, buildRails, photoOf, photosOf } from '../lib/openingScreen.js';
import { offeredStayTiers } from '../lib/runtime_pricing.js';
import { ExploreCategories } from './ExploreCategories.jsx';
import { EmptyResult } from './EmptyResult.jsx';
import { OutdoorMap } from './OutdoorMap.jsx';
import { WhereBar, FilterChipBar, SortPill } from './WhereBar.jsx';
import { setDockKind, setDockResults, setDockHandlers } from './searchDockStore.js';
import { regionsForLayer } from '../lib/exploreLayers.js';
import { loadRegionIndex } from '../lib/regions.js';
import { SiteFooter } from '../components/SiteFooter.jsx';
import { browseQueryFrom } from '../lib/urlState.js';
import { SourcesFold } from './destinations/DestTabParts.jsx';
import { readMemory, readUrlBrowse, writeMemory } from './destinations/browseMemory.js';
import { CATS, CYCLE_SORTS, PAGE, QUICK_GROUPS, SORTS, TRAIL_SORTS, TRIP_DAYS, WHAT_GROUP, norm } from './destinations/destTabConsts.js';
import { BeachPage, CycleFamilyPage, CyclePage, JourneyPage, LakePage, MountainPage, StubPage, TrailPage, TripPage } from './destinations/lazyPages.js';
import { useFacetGroups } from './destinations/useFacetGroups.js';
import { useCycleLayer } from './destinations/useCycleLayer.js';
import { useMountainLayer } from './destinations/useMountainLayer.js';
import { useLakeLayer } from './destinations/useLakeLayer.js';
import { useBeachLayer } from './destinations/useBeachLayer.js';
import { useItineraryLayer } from './destinations/useItineraryLayer.js';
import { useDestMapItems } from './destinations/useDestMapItems.js';
import { useDescribeFacts } from './destinations/useDescribeFacts.js';
import { useTrailLayer } from './destinations/useTrailLayer.js';
import { TrailTripList } from './destinations/TrailTripList.jsx';
import { CycleList } from './destinations/CycleList.jsx';
import { ItineraryList } from './destinations/ItineraryList.jsx';
import { MountainList } from './destinations/MountainList.jsx';
import { LakeList } from './destinations/LakeList.jsx';
import { BeachList } from './destinations/BeachList.jsx';
















export function DestinationsTab({
  data, pricedAll, availableCountries = [], onSelectDest,
  stayTier = 'home', origin = null,
  // Sets the Lifestyle panel's "Where you sleep" answer, for the trip
  // page's Lifestyle slider (T173).
  onChangeStayTier = null,
  openTrail = null, onOpenTrailConsumed,
  openBeach = null, onOpenBeachConsumed,
  openLake = null, onOpenLakeConsumed,
  openMountain = null, onOpenMountainConsumed,
  openCycle = null, onOpenCycleConsumed,
  openTrip = null, onOpenTripConsumed, onOpenTripInPlanner,
  // One country, asked for from somewhere else in the app (the planner's
  // country brief). Just the filter, in whatever category is showing: no
  // layer to wait for and nothing to open once it lands.
  openCountry = null, onOpenCountryConsumed,
  // One category (a CATS key), asked for from the landing page (T209): its
  // primary action opens the walks. The country filter survives, as it does
  // when the category tabs are pressed.
  openCategory = null, onOpenCategoryConsumed,
  // One week from the journeys library, { id, fromLink }: a shared link or a
  // starred week (T474). It opens over whatever the tab shows.
  openJourney = null, onOpenJourneyConsumed, onJourneyClosed = null,
  // The shortlist, as the pair-aware pair App keeps: isFavorite(id, kind)
  // and onToggleFav(id, kind). Every full-screen feature page below wears the
  // same star from them, so a trail is kept exactly the way a city is.
  isFavorite = null, onToggleFav = null,
  // "Add to a day plan" on the four feature pages: (kind, { id, cc, name, lat, lon }).
  onAddToDay = null,
  // T428: whether this tab is the one on screen (both browse tabs stay
  // mounted), so only the active one claims the header's search slot.
  isActive = true,
  // T498 (roadmap 1.3b): Destinations is Explore's outdoor side now. The six
  // category tiles hand over to App's one door (onPickCategory(key, cc));
  // a country opens its page; a region opens its page; the trip library can
  // be opened on one style; a page opened from a country or region page
  // returns there when it closes; the cost index prices "Bed and food".
  onPickCategory = null,
  onOpenCountryPage = null,
  onOpenRegion = null,
  openStyle = null, onOpenStyleConsumed,
  returnTo = null,
  indices = null,
}) {
  const { t, lang } = useI18n();
  // The traveller's own month from the settings line, or null while the
  // dates are Carta's pair (T381): lake cards say one month fact only then.
  const travelMonth = useTravelMonth();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const stayTiers = useMemo(() => offeredStayTiers(data?.meta), [data?.meta]);

  // Read once per mount, before the first state is set (see readMemory).
  const memory = useRef(undefined);
  if (memory.current === undefined) memory.current = readMemory();
  // T428: the URL wins over the memory, so a shared or reloaded link opens
  // the section and the country it names (dc, dn), the way Explore's x* keys do.
  const fromUrl = useRef(undefined);
  if (fromUrl.current === undefined) fromUrl.current = readUrlBrowse();
  const [cat, setCat] = useState(() => {
    const want = fromUrl.current.cat || memory.current?.cat;
    // The library is a row on Places, not a tile (T498), so a fresh visit
    // with nothing named opens on the first outdoor layer.
    return CATS.some((c) => c.key === want) ? want : 'trails';   // CATS key
  });
  // T600: a link or Explore's overview can open the tab with Where text.
  const [query, setQuery] = useState(() => fromUrl.current.q || '');
  const [debouncedQuery, setDebouncedQuery] = useState(() => fromUrl.current.q || '');
  // Where text still to be read as a country (Trails and Cycling publish one
  // file per country, so a typed country is a country picked). Resolved
  // once the layer's country index is in, below.
  const [pendingWhere, setPendingWhere] = useState(() => fromUrl.current.q || '');
  const [country, setCountry] = useState(() => fromUrl.current.country
    || (fromUrl.current.cat ? '' : memory.current?.country) || '');   // ISO2 or '' for all
  // Written back while this tab is on screen, keeping the hash (#dest=, a
  // feature page) and history.state, which App's Back handling reads.
  useEffect(() => {
    if (!isActive) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('dc', cat);
      if (country) url.searchParams.set('dn', country); else url.searchParams.delete('dn');
      // T600: the Where text too, so a reload or a copied link keeps it.
      const dq = debouncedQuery.trim();
      if (dq) url.searchParams.set('dq', dq.slice(0, 80)); else url.searchParams.delete('dq');
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
    } catch { /* sandboxed: the tab still works, the address just does not follow */ }
  }, [cat, country, isActive, debouncedQuery]);
  // The point everything is measured from in near-mode. A catalogue city or
  // any geocoded location, so it carries a name and coordinates rather than a
  // destination id: { id|null, name, sub, iso2|null, lat, lon }.
  const [nearPlace, setNearPlace] = useState(() => memory.current?.near || null);
  useEffect(() => {
    writeMemory({ cat, country, near: nearPlace });
  }, [cat, country, nearPlace]);
  const [sort, setSort] = useState({ key: 'rating', dir: -1 });
  // Trails filter their own way: by how long the walk is, and by whether it
  // ends where it started. Kept out of `classes` because they filter a
  // different list and would otherwise survive a category switch.
  const [bands, setBands] = useState([]);            // DISTANCE_BANDS keys, [] = any
  // The five filters the brief added beside length. Every one is an array of
  // codes with [] meaning "any", and the two rules are worth stating once:
  // WITHIN a group the selection is a union (two lengths means either length,
  // which is how "an afternoon or a whole day" is one thought), ACROSS groups
  // it is an intersection. Highlights and suitability are the exceptions and
  // are unions inside themselves too, because "a waterfall or a lake" is what
  // somebody scanning a list of chips actually means; asking for both at once
  // is a search, not a filter.
  const [grades, setGrades] = useState([]);          // GRADES keys
  const [climbs, setClimbs] = useState([]);          // ASCENT_BANDS keys
  const [shapes, setShapes] = useState([]);          // ROUTE_TYPES keys
  const [hls, setHls] = useState([]);                // HIGHLIGHTS keys
  const [suits, setSuits] = useState([]);
  // T630: SAC grade, longest time and public transport, on the trails tab.
  const [sacs, setSacs] = useState([]);              // SAC_BANDS keys
  const [durs, setDurs] = useState([]);              // DURATION_BANDS keys
  const [reachOnly, setReachOnly] = useState(false);            // SUITABILITY keys
  const [loopsOnly, setLoopsOnly] = useState(false);
  const [trailSort, setTrailSort] = useState({ key: 'rating', dir: -1 });
  const [visible, setVisible] = useState(PAGE);
  const [pageCard, setPageCard] = useState(null);    // enriched trip card or null
  // The Trips category opens on the curated library, browsed style first:
  // null is the ten-style grid, a slug is one style's list, and 'composed'
  // is the door into the machine-composed itineraries below.
  const [journeyView, setJourneyView] = useState(null);
  const [pageJourney, setPageJourney] = useState(null);   // { id, gw } or null
  // The composed itineraries ask one question: how many days. 1 means the
  // drawn city walks, 2 and up mean a composed itinerary, null means any.
  const [itinDays, setItinDays] = useState(null);
  const [itinPace, setItinPace] = useState(null);     // null = any pace
  const [itinScale, setItinScale] = useState(null);   // null = both
  const [itinIndex, setItinIndex] = useState(undefined);   // undefined = loading
  const [itinTop, setItinTop] = useState(null);
  const [itinCountryRows, setItinCountryRows] = useState(null);
  const [pageItin, setPageItin] = useState(null);
  // A shared #trail= link: { id, country } until the country file has loaded
  // and the card it names can be opened.
  const [wantedTrail, setWantedTrail] = useState(null);

  // Free-text location search. The catalogue suggestions below are local and
  // instant; this one is a network call to Nominatim, so it fires on an
  // explicit action (Enter, or the "search anywhere" row), never per
  // keystroke, which is what its fair-use policy asks for.
  const [suggOpen, setSuggOpen] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHits, setGeoHits] = useState(null);      // null until this term was searched
  const geoSeq = useRef(0);
  const searchRef = useRef(null);

  // "Near me". The button is only rendered where the browser can answer at
  // all: geolocation is undefined outside a secure context, and chrome for a
  // capability that is not there is worse than no chrome.
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState('');

  // Trails data: the country index (which countries have anything), and the
  // one country file the current selection needs.
  const [trailsIndex, setTrailsIndex] = useState(null);
  const [countryTrips, setCountryTrips] = useState(null);
  const [trailsLoading, setTrailsLoading] = useState(false);

  // Which layers failed to LOAD, as opposed to having nothing published.
  // Every loader used to swallow a network error into null and every consumer
  // coerced that to [], so a dropped connection rendered "nothing here
  // matches" - a claim about the catalogue - and the re-fetch guards read
  // `if (rows) return;` where [] is truthy, so the tab never tried again for
  // the life of the session. A layer in here has an error state and a retry
  // button instead, in the tone the geolocation failure beside countryOptions
  // already uses: say what happened, offer the way back.
  const [layerError, setLayerError] = useState({});   // layer -> true
  const [retryTick, setRetryTick] = useState(0);
  const failLayer = useCallback((layer) => (e) => {
    // Only a LayerFetchError is a failure. Anything else is a bug in our own
    // then-chain and should not be dressed up as a network problem.
    if (e?.name !== 'LayerFetchError') throw e;
    setLayerError((cur) => (cur[layer] ? cur : { ...cur, [layer]: true }));
  }, []);
  const retryLayer = useCallback((layer) => {
    setLayerError((cur) => {
      if (!cur[layer]) return cur;
      const next = { ...cur };
      delete next[layer];
      return next;
    });
    setRetryTick((n) => n + 1);
  }, []);

  // Beaches: the capped Europe wide ranking the tab opens on, the index that
  // says which countries have any, and whichever country files a search or a
  // location has pulled in on top of them.
  const [beachIndex, setBeachIndex] = useState(null);
  const [topBeaches, setTopBeaches] = useState(null);
  // Trails at rest (T453): the Europe-wide list, loaded once Trails opens
  // with no country; undefined until asked for, null when it is not there.
  const [topTrails, setTopTrails] = useState(undefined);
  useEffect(() => {
    if (cat !== 'trails' || country || topTrails !== undefined) return undefined;
    let live = true;
    loadTopTrails().then((rows) => { if (live) setTopTrails(rows || null); })
      .catch(() => { if (live) setTopTrails(null); });
    return () => { live = false; };
  }, [cat, country, topTrails]);
  const [countryBeaches, setCountryBeaches] = useState({});   // cc -> rows
  const [beachesLoading, setBeachesLoading] = useState(false);
  const [pageBeach, setPageBeach] = useState(null);

  // Lakes: the same three artifacts as beaches, held separately because they
  // are a separate layer with a separate gate. The index also carries the
  // model's warm-water threshold, which the lake page's month strip colours by.
  const [lakeIndex, setLakeIndex] = useState(null);
  const [topLakes, setTopLakes] = useState(null);
  const [countryLakes, setCountryLakes] = useState({});     // cc -> rows
  const [lakesLoading, setLakesLoading] = useState(false);
  // The listed tier, held apart from the ranked rows on purpose: a
  // screen has to opt in to showing water bodies that carry no score.
  const [listedLakes, setListedLakes] = useState({});
  // The listed tier for beaches, held apart from the rated rows for the same
  // reason: one has been scored and one has only been verified to exist, and
  // nothing in this file may let them mix.
  const [listedBeaches, setListedBeaches] = useState({});
  const [pageLake, setPageLake] = useState(null);

  // Mountains: the same three artifacts again.
  const [mountainIndex, setMountainIndex] = useState(null);
  const [topMountains, setTopMountains] = useState(null);
  const [countryMountains, setCountryMountains] = useState({});   // cc -> rows
  const [mountainsLoading, setMountainsLoading] = useState(false);
  // The listed tier, per country. Held apart from the rated rows because the
  // two are different claims: one has been measured and one has only been
  // verified to exist, and nothing in this file may let them mix.
  const [listedMountains, setListedMountains] = useState({});
  const [pageMountain, setPageMountain] = useState(null);

  // Cycling: routes and the tours composed over them. Two lists rather than
  // one, because a listed row carries no score and must never interleave into
  // a ranked list (master spec section 3).
  const [cycleIndex, setCycleIndex] = useState(null);
  const [cycleTop, setCycleTop] = useState(null);
  const [cycleFacets, setCycleFacets] = useState({});
  const [cycleShowLocal, setCycleShowLocal] = useState(false);
  const [cycleSort, setCycleSort] = useState({ key: 'rating', dir: -1 });
  const [countryCycling, setCountryCycling] = useState({});   // cc -> bundle
  const [cyclingLoading, setCyclingLoading] = useState(false);
  const [pageCycle, setPageCycle] = useState(null);

  // The chip filters each published layer carries, as selected keys into
  // MOUNTAIN_FACETS / LAKE_FACETS / BEACH_FACETS. Held per layer rather than in
  // one bag because they filter different lists and a chip that survived a
  // category switch would silently empty the next tab.
  // One object rather than one array: eight groups, each holding its own
  // selection. Inside a group the chips are OR (the bands are mutually
  // exclusive), across groups they are AND.
  const [mtnFacets, setMtnFacets] = useState({});
  const [lakeFacets, setLakeFacets] = useState({});
  const [beachFacets, setBeachFacets] = useState({});
  // The Filters door. One sheet on every width, the same as Explore's.
  const [sheetOpen, setSheetOpen] = useState(false);
  // The Filters sheet hangs off this button on a pointer screen.
  const filterBtnRef = useRef(null);
  // Which door opened the sheet (T384): the toolbar's Filters hangs it off
  // the button; the desktop panel's "All filters" sits low in a tall column,
  // where a hanging panel would run off the screen, so it opens the sheet
  // centred, the way the shared filter sheet stands on a wide screen.
  const [sheetFrom, setSheetFrom] = useState('toolbar');
  // T602: the desktop filter pane, closed by default and opened and closed
  // by All filters, as Places' Filters pill opens its pane.
  const [paneOpen, setPaneOpen] = useState(false);

  useEffect(() => {
    if (layerError.trails) return undefined;
    let live = true;
    loadTrailsIndex().then((idx) => { if (live) setTrailsIndex(idx); })
      .catch((e) => { if (live) failLayer('trails')(e); });
    return () => { live = false; };
  }, [layerError.trails, retryTick, failLayer]);

  // A shared link names one trip in one country: browse that country's trails
  // so the card exists, then open its page (below, once the file has landed).
  useEffect(() => {
    if (!openTrail) return;
    setCat('trails');
    setQuery('');
    setNearPlace(null);
    setCountry(openTrail.country);
    setWantedTrail(openTrail);
    onOpenTrailConsumed?.();
  }, [openTrail, onOpenTrailConsumed]);

  useEffect(() => {
    // '' asks for every country (Places had none picked, T498); null is
    // "nothing asked".
    if (openCountry == null) return;
    setQuery('');
    setNearPlace(null);
    setCountry(openCountry);
    onOpenCountryConsumed?.();
  }, [openCountry, onOpenCountryConsumed]);
  // Moved by its own tile from another layer, so the view starts as a list.
  useEffect(() => { setDview('top'); }, [cat]);

  useEffect(() => {
    if (!openCategory) return;
    if (CATS.some((c) => c.key === openCategory)) {
      setCat(openCategory);
      // T600: Explore's overview hands its Where text over in the address
      // (dq, App openExploreSection); a plain category press carries none.
      const handed = browseQueryFrom(typeof window !== 'undefined' ? window.location.search : '');
      setQuery(handed);
      setDebouncedQuery(handed);
      setPendingWhere(handed);
      setJourneyView(null);
      scrollRef.current?.scrollTo?.(0, 0);
    }
    onOpenCategoryConsumed?.();
  }, [openCategory, onOpenCategoryConsumed]);

  // The trip library opened from the Trip styles row on Places, a style
  // tile, or a country's weeks (T498): the styles list, or one style.
  useEffect(() => {
    if (!openStyle) return;
    setCat('trips');
    setQuery('');
    setJourneyView(openStyle.slug || null);
    scrollRef.current?.scrollTo?.(0, 0);
    onOpenStyleConsumed?.();
  }, [openStyle, onOpenStyleConsumed]);

  // One week to open, asked for from outside the list (T474, row T435-a): a
  // shared #journey=<id> link or a starred week in My trips. App keeps the id
  // until this says the page is open, so a doubled effect only reads the
  // cached library twice. A link's own history entry becomes the list, so
  // Back from the week lands on Trips rather than reopening the week.
  const journeyConsumed = useRef(onOpenJourneyConsumed);
  journeyConsumed.current = onOpenJourneyConsumed;
  useEffect(() => {
    if (!openJourney?.id) return undefined;
    let live = true;
    const { id, fromLink } = openJourney;
    loadAllJourneyCards().catch(() => []).then((all) => {
      if (!live) return;
      const card = (all || []).find((c) => c.id === id);
      if (fromLink) dropJourneyHash();
      setPageJourney({ id, gw: card?.gw || null });
      journeyConsumed.current?.();
    });
    return () => { live = false; };
  }, [openJourney]);

  // T1030: a trip's page that closes, by its own back control or the
  // browser's, hands back to Plan's Carta's own trips (the one trip list).
  const hadJourney = useRef(false);
  const journeyClosed = useRef(onJourneyClosed);
  journeyClosed.current = onJourneyClosed;
  useEffect(() => {
    const was = hadJourney.current;
    hadJourney.current = Boolean(pageJourney);
    if (was && !pageJourney) journeyClosed.current?.();
  }, [pageJourney]);

  // Debounce only the 24.8k-row filter, never the input itself.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  // Geocoded hits answer one exact term. A changed term retires them, and the
  // bumped sequence retires any reply still in flight for the old one, so a
  // slow answer can never land under a query the traveller has moved past.
  useEffect(() => {
    geoSeq.current += 1;
    setGeoHits(null);
    setGeoBusy(false);
    setLocErr('');
  }, [query]);

  // Click away and the suggestion list closes. It overlays the cards, so it
  // cannot be left open behind a tap that was meant for the list underneath.
  useEffect(() => {
    if (!suggOpen) return undefined;
    const onDoc = (e) => { if (!searchRef.current?.contains(e.target)) setSuggOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [suggOpen]);

  // Beaches are their own layer now, not a slice of the published trips, so
  // they are deliberately NOT a trip category: no country index, no origin,
  // no stay tier, no price sorts. Everything on that tab is about the beach.
  const isBeachCat = cat === 'beaches';
  const isLakeCat = cat === 'lakes';
  const isMountainCat = cat === 'mountains';
  const isCycleCat = cat === 'cycling';
  // The Trips tab's curated library (style grid or one style's list). The
  // composed itineraries and the drawn city walks live behind its
  // 'composed' door and keep every behaviour they had.
  const isJourneyBrowse = cat === 'trips' && journeyView !== 'composed';
  const isComposedTrips = cat === 'trips' && journeyView === 'composed';
  const isTripCat = cat === 'trails' || isComposedTrips;
  const trailsCountry = nearPlace ? nearPlace.iso2 : country;
  // Licensed lake, summit and coast photographs for walks with no photo of their own (G8).
  const trailPhotoPool = useTrailPhotoPool(trailsCountry, isTripCat);
  useEffect(() => {
    if (!isTripCat || !trailsCountry) { setCountryTrips(null); return undefined; }
    if (layerError.trails) return undefined;
    let live = true;
    setTrailsLoading(true);
    // Rated and listed in one go, concatenated in that order. A listed row
    // carries no rating key at all, so it sorts to the end of a rating sort by
    // itself and renders with a "not scored yet" chip rather than a number.
    Promise.all([loadTrails(trailsCountry), loadListedTrails(trailsCountry)])
      .then(([trips, listed]) => {
        if (!live) return;
        setCountryTrips([...(trips || []), ...(listed || [])]);
        setTrailsLoading(false);
      }).catch((e) => {
        if (!live) return;
        setTrailsLoading(false);
        failLayer('trails')(e);
      });
    return () => { live = false; };
  }, [isTripCat, trailsCountry, layerError.trails, retryTick, failLayer]);

  // ISO2 -> display name in the reader's language (T451, the T444 rule:
  // lib/countryName.js, so a German screen says "Albanien"), the catalogue's
  // own name only for a code the engine does not know. A shared #tour= link
  // carries no country, and Intl.DisplayNames.of throws on an empty or
  // malformed code, which took the whole app down (row T375-a): no code
  // names no country, and a code the engine refuses is shown as itself.
  const countryName = useMemo(() => {
    const map = new Map(availableCountries);
    return (cc) => {
      if (!cc) return '';
      try { return localCountryName(cc, map.get(cc) || cc, lang); } catch { return map.get(cc) || cc; }
    };
  }, [availableCountries, lang]);

  // City suggestions for the near-search, deduped so London's four gateway
  // entries offer one London. Also the index every hike is joined against.
  const destIndex = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [id, d] of Object.entries(data.destinations)) {
      const key = `${d.city}|${d.iso2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id, city: d.city, country: d.country, iso2: d.iso2,
        lat: d.city_lat ?? d.lat, lon: d.city_lon ?? d.lon,
      });
    }
    return out;
  }, [data]);

  // Where each destination actually is, city centre first. Some rows are
  // anchored on their airport, and measuring "how far is this from my street"
  // against a runway 40 km out of town orders the nearest list wrong.

  const priceById = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) m.set(p.id, p);
    return m;
  }, [pricedAll]);

  // Country cards draw their own photographs since T428 (lib/countryGallery.js,
  // T449); the old cover took the first photograph of the best-rated trail.

  const q = useMemo(() => norm(debouncedQuery), [debouncedQuery]);

  // Exact name, then prefix, then word start, then inside a word (T384,
  // brief V3-7; lib/placeSearch.js says why and what it cannot find).
  const suggestions = useMemo(() => rankPlaces(destIndex, q, 6), [q, destIndex]);

  const term = query.trim();
  // Nominatim's own floor is 3 characters; below it the row would promise a
  // search that returns nothing.
  const canGeo = term.length >= 3;

  const pickNear = (place) => {
    setNearPlace(place);
    setQuery('');
    setCountry('');
    setSuggOpen(false);
  };

  const pickDest = (d) => pickNear({
    id: d.id, name: d.city, sub: d.country, iso2: d.iso2, lat: d.lat, lon: d.lon,
  });

  // A geocoded location: the place reads as the heading, the rest of the
  // address stays on the line beside it, so the header says which of the
  // several Gents on earth this is.
  const pickGeo = (r) => {
    const { title, rest } = geoLines(r);
    pickNear({ id: null, name: title, sub: rest, iso2: r.iso2, lat: r.lat, lon: r.lon });
  };

  const runGeoSearch = async () => {
    if (!canGeo) return;
    const seq = geoSeq.current + 1;
    geoSeq.current = seq;
    setGeoBusy(true);
    setSuggOpen(true);
    const hits = await geocodeAddress(term, { limit: 8 });
    if (geoSeq.current !== seq) return;   // the term moved on while we waited
    setGeoHits(hits);
    setGeoBusy(false);
  };

  // Enter takes the best answer already on screen and only reaches for the
  // network when there is none: a hit if the map was searched, otherwise the
  // top catalogue city, otherwise search the map. Typing an address matches no
  // city, so an address falls straight through to the search.
  const onSearchEnter = () => {
    if (geoHits?.length) pickGeo(geoHits[0]);
    else if (suggestions.length) pickDest(suggestions[0]);
    else runGeoSearch();
  };

  /**
   * The same anchor, straight from the browser. The device answers with a
   * coordinate and Nominatim turns that into a name and a country (the trails
   * wire is published per country), but the ranking only ever uses the
   * coordinate, so a reverse lookup that fails still leaves a working anchor
   * under a plain "My location" heading.
   */
  const useMyLocation = () => {
    if (!canLocate || locBusy) return;
    setLocErr('');
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos?.coords?.latitude;
        const lon = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setLocBusy(false);
          setLocErr(t('places.locateFailed'));
          return;
        }
        const hit = await reverseGeocode(lat, lon);
        const lines = hit ? geoLines(hit) : null;
        setLocBusy(false);
        pickNear({
          id: null,
          name: lines?.title || t('places.myLocation'),
          sub: lines?.rest || '',
          iso2: hit?.iso2 || null,
          lat,
          lon,
        });
      },
      (err) => {
        setLocBusy(false);
        // Code 1 is a refusal, which is a setting to change rather than a
        // failure to retry; everything else is "it did not come through".
        setLocErr(err?.code === 1 ? t('places.locateDenied') : t('places.locateFailed'));
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  };

  // ── General: the priced catalogue ─────────────────────────────────────


  // How many places each size holds under the country/search filter, so a chip
  // can say "42" and can grey itself out rather than leading to an empty list.

  // The country index for General: every priced country as a flag card.

  // ── Trip categories: the published wire, joined to the catalogue ──────

  const tripCards = useMemo(() => {
    if (!isTripCat || !countryTrips) return null;
    return countryTrips.map((tr) => {
      const assoc = associateTrip(tr, data.destinations, destIndex, trailPhotoPool);
      return {
        tr,
        assoc,
        kindKey: tripKindKey(tr, assoc.dest),
        themes: tripThemes(tr, assoc.dest),
        price: assoc.destId ? priceById.get(assoc.destId) || null : null,
      };
    });
  }, [isTripCat, countryTrips, data, destIndex, priceById, trailPhotoPool]);

  // A neighbour card on any layer page opens that layer's own page (brief
  // 08's cross-layer blocks). One page at a time: opening a neighbour closes
  // the page it was found on, so Escape and the back cross keep one meaning.
  /**
   * The star props for one feature page: {fav, onFav}.
   *
   * Every page below is opened from a row that already knows its own id, so
   * the only thing this adds is the KIND, which is what turns a bare id into
   * a shortlist key (see lib/favorites.js). Returns empty props when the host
   * passed no shortlist, which is how FavStar knows to render nothing rather
   * than an inert control.
   */
  const favProps = (kind, id, cc = '') => {
    if (!isFavorite || !onToggleFav || id == null || id === '') return {};
    // A country-kind with no country cannot be written down at all (favKey
    // refuses it), so the star stays absent rather than inert-but-present.
    if (needsCountry(kind) && !/^[A-Za-z]{2}$/.test(String(cc || ''))) return {};
    return {
      fav: isFavorite(String(id), kind, cc),
      onFav: () => onToggleFav(String(id), kind, cc),
    };
  };

  // The coverage empty-state module (T124 for the seven microstates of
  // destinations spec 1.6, T367 for every country and every searched place;
  // docs/ONBOARDING_AND_EMPTY_STATES.md). A list that is empty because of
  // WHERE it is, with no chip narrowing it, says how many are published,
  // why, and which three are nearest across the border.
  //
  // The country a list is empty for: one whose name the traveller typed (any
  // country, not only the ones a layer publishes, which is the point:
  // "monaco" on the lakes tab), else the one picked in the toolbar. A typed
  // word that names no country names no empty country: the list is empty
  // because of the word, and saying "Luxembourg, 0 cycling routes" over a
  // search miss would be false.
  const typedCc = useMemo(() => {
    if (q) {
      if (q.length < 2) return null;
      const codes = [...availableCountries.map(([cc]) => cc), ...Object.keys(MICROSTATES)];
      return codes.find((c) => norm(c) === q || norm(countryName(c)).startsWith(q)) || null;
    }
    return country || null;
  }, [country, q, availableCountries, countryName]);
  // Where each country sits and which countries it borders, from the
  // catalogue's own towns. Built once per country asked about: the empty
  // states are rare, the pairwise distance scan is not free.
  const geoCache = useRef({ towns: null, byCc: new Map() });
  const geoOf = useCallback((cc) => {
    if (!cc) return null;
    const cache = geoCache.current;
    if (cache.towns !== destIndex) { cache.towns = destIndex; cache.byCc = new Map(); }
    if (!cache.byCc.has(cc)) cache.byCc.set(cc, countryGeo(destIndex, cc));
    return cache.byCc.get(cc);
  }, [destIndex]);
  const nearGeo = useMemo(
    () => (nearPlace ? pointGeo(destIndex, nearPlace, nearPlace.iso2 || null) : null),
    [nearPlace, destIndex],
  );
  const countryEmpty = (layer, cc, onOpen = openNeighbour) => (
    <CoverageEmpty
      layer={layer}
      cc={cc}
      geo={geoOf(cc)}
      countryName={countryName}
      onOpen={onOpen}
      onSeeOther={(c) => { setCat(c); setQuery(''); setCountry(cc); }}
      onShowAll={() => { setQuery(''); setCountry(''); }}
    />
  );
  const radiusEmpty = (layer, onOpen = openNeighbour) => (
    <CoverageEmpty
      layer={layer}
      cc={nearPlace.iso2 || null}
      city={nearPlace.name}
      geo={nearGeo}
      countryName={countryName}
      onOpen={onOpen}
      onShowAll={() => setNearPlace(null)}
    />
  );
  // A list a chip or a filter emptied: say so, and offer the one button that
  // undoes it. Never the coverage module, which would blame the catalogue.
  const chipsEmpty = (msgKey, onClear, labelKey = 'empty.clearChips', vars = undefined) => (
    <div className="places-empty empty-act">
      <p>{t(msgKey, vars)}</p>
      <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={onClear}>{t(labelKey)}</Button>
    </div>
  );

  // A list the typed words emptied (no chip, no country, no place set): the
  // same module as a chip-emptied list, with the one button that undoes it
  // (brief V5-5: every empty path is one of the two modules).
  const queryEmpty = (msgKey) => chipsEmpty(msgKey, () => setQuery(''), 'empty.clearSearch');
  // A list a filter emptied, in the one empty block every category shares
  // (T498, roadmap 1.3b F): the sentence names the filter set last, one
  // button takes it off, Clear all beside it once two or more are on.
  const facetEmpty = (noun, onClear) => {
    const facets = activeChips.filter((c) => !c.key.startsWith('cc-'));
    const last = facets[facets.length - 1];
    if (!last) return chipsEmpty('places.noneFilters', onClear, 'empty.clearFilters');
    return (
      <EmptyResult
        className="places-empty"
        line={t(`empty.cause.${noun}`, { filter: last.label })}
        action={{ label: t('explore.removeFilter', { filter: last.label }), onClick: last.remove }}
        onClearAll={facets.length > 1 ? onClear : null}
        clearLabel={t('filter.clearAll')}
      />
    );
  };

  // The honest stubs of the walks list (T124): famous walks Carta cannot
  // build, loaded for the country the list is answering for.
  const [stubs, setStubs] = useState([]);
  const [stubsAll, setStubsAll] = useState(false);
  const [pageStub, setPageStub] = useState(null);
  // Back steps out of the tab's own layers (T451, the navigation rule T381
  // set and T444 gave Explore): a style's list, then a page over it, each
  // push one history entry, so Back and a phone's swipe back close the top
  // layer onto the one beneath instead of leaving Carta. The trip page
  // (JourneyPage) and the destination page (#dest=) push their own.
  const placesLevel = (journeyView ? 1 : 0)
    + ((pageCard || pageItin || pageBeach || pageLake || pageMountain || pageCycle || pageStub) ? 1 : 0);
  const pushedLevel = useRef(0);
  // A page opened from a country or region page (T498, owner note on
  // T489-a: back paths land where you came from): once it closes, by its
  // own back control or the browser's, that page opens again.
  const anyPage = !!(pageCard || pageStub || pageJourney || pageItin || pageBeach
    || pageLake || pageMountain || pageCycle);
  const hadPage = useRef(anyPage);
  const returnRef = useRef(returnTo);
  returnRef.current = returnTo;
  useEffect(() => {
    const was = hadPage.current;
    hadPage.current = anyPage;
    if (was && !anyPage && returnRef.current) returnRef.current.onReturn();
  }, [anyPage]);
  useEffect(() => {
    if (!isActive) return;
    try {
      if (placesLevel > pushedLevel.current) {
        for (let l = pushedLevel.current + 1; l <= placesLevel; l++) {
          window.history.pushState({ ...(window.history.state || {}), cartaPlaces: l }, '', window.location.href);
        }
      } else if (placesLevel < pushedLevel.current) {
        // Closed by its own control: step back over the entries the layer
        // pushed, but only while they are still the top of the history (a
        // place opened from the page has pushed its own on top).
        const st = window.history.state || {};
        if (st.cartaPlaces === pushedLevel.current && !st.cartaDest && !st.journey) {
          window.history.go(placesLevel - pushedLevel.current);
        }
      }
    } catch { /* sandboxed: the layers still open and close */ }
    pushedLevel.current = placesLevel;
  }, [placesLevel, isActive]);
  useEffect(() => {
    const onPop = (e) => {
      const st = e.state || {};
      const l = st.cartaPlaces ?? (st.journey ? pushedLevel.current : 0);
      if (l >= pushedLevel.current) return;
      if (l < 2) {
        setPageCard(null); setPageItin(null); setPageBeach(null); setPageLake(null);
        setPageMountain(null); setPageCycle(null); setPageStub(null);
      }
      if (l < 1) setJourneyView(null);
      pushedLevel.current = l;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // An open walk keeps its own address (G13): #trail=ID&tc=CC on the history
  // entry the layer pushed above, so it can be shared, bookmarked and reached
  // with Back. A city day has no trail page of its own, so it writes none.
  const openTrailRow = pageCard && pageCard.tr?.category !== 'citytrip' ? pageCard.tr : null;
  useEffect(() => {
    if (!isActive) return;
    try {
      if (!openTrailRow && !window.location.hash.includes('trail=')) return;
      const next = trailHash(window.location.hash, openTrailRow);
      if (next === window.location.hash) return;
      window.history.replaceState(window.history.state, '',
        window.location.pathname + window.location.search + next);
    } catch { /* sandboxed: the page still opens */ }
  }, [openTrailRow, isActive]);
  useEffect(() => {
    setStubsAll(false);
    if (cat !== 'trails' || !trailsCountry) { setStubs([]); return undefined; }
    let live = true;
    loadStubs(trailsCountry).then((r) => { if (live) setStubs(r); }).catch(() => { if (live) setStubs([]); });
    return () => { live = false; };
  }, [cat, trailsCountry]);

  const openNeighbour = (layer, row) => {
    setPageCard(null); setPageBeach(null); setPageLake(null);
    setPageMountain(null); setPageCycle(null);
    if (layer === 'beach') setPageBeach(row);
    else if (layer === 'lake') setPageLake(row);
    else if (layer === 'peak') setPageMountain(row);
    else if (layer === 'cycle') {
      setPageCycle({ routeId: row.id, country: row.cc || country });
    } else if (layer === 'trail') {
      const assoc = associateTrip(row, data.destinations, destIndex, trailPhotoPool);
      setPageCard({
        tr: row,
        assoc,
        kindKey: tripKindKey(row, assoc.dest),
        themes: tripThemes(row, assoc.dest),
        price: assoc.destId ? priceById.get(assoc.destId) || null : null,
      });
    }
  };

  // The shared link's trip, as soon as its country file has been joined. It
  // opens whatever it is: a city day arriving through a trail link still gets
  // its own page rather than an empty Trails list.
  useEffect(() => {
    if (!wantedTrail || !tripCards) return;
    const hit = tripCards.find((c) => String(c.tr.id) === String(wantedTrail.id));
    if (hit) {
      setPageCard(hit);
      setWantedTrail(null);
    } else if (countryTrips) {
      setWantedTrail(null); // published list no longer carries it
    }
  }, [wantedTrail, tripCards, countryTrips]);

  const { trailPass, tripRows, trailFacets, tripCountries } = useTrailLayer({
    bands, cat, climbs, countryName, durs, grades, hls, isTripCat, lang, loopsOnly, nearPlace,
    q, reachOnly, sacs, shapes, sort, suits, trailSort, trailsIndex, tripCards,
  });


  // ── Trips: the composed itineraries (pipeline/trips) ──────────────────
  //
  // Two artifacts on purpose, the same split the beach, lake and mountain
  // layers use: /trips/top.json is the Europe-wide ranking, capped per country
  // so one country cannot fill the page, and /trips/{CC}.json is everything
  // touching that country. Ranking the continent in the browser would mean
  // fetching forty three files before drawing a card.
  const isItinCat = isComposedTrips && itinDays !== 1;

  useEffect(() => {
    if (!isItinCat || itinIndex !== undefined || layerError.trips) return undefined;
    let live = true;
    Promise.all([loadTripIndex(), loadTopTrips()]).then(([ix, top]) => {
      if (!live) return;
      setItinIndex(ix);
      setItinTop(top || []);
    }).catch((e) => { if (live) failLayer('trips')(e); });
    return () => { live = false; };
  }, [isItinCat, itinIndex, layerError.trips, retryTick, failLayer]);

  const itinCountry = nearPlace ? nearPlace.iso2 : country;

  useEffect(() => {
    if (!isItinCat || !itinCountry) { setItinCountryRows(null); return undefined; }
    if (layerError.trips) return undefined;
    let live = true;
    setItinCountryRows(null);
    loadTrips(itinCountry).then((rows) => { if (live) setItinCountryRows(rows || []); })
      .catch((e) => { if (live) failLayer('trips')(e); });
    return () => { live = false; };
  }, [isItinCat, itinCountry, layerError.trips, retryTick, failLayer]);

  // A shared #itin= link: open it once its detail is reachable. The card is
  // only a hint here, because TripPage loads the full trip by id anyway.
  useEffect(() => {
    if (!openTrip) return;
    setCat('trips');
    setJourneyView('composed');
    setItinDays(null);
    setPageItin({ id: openTrip.id });
    onOpenTripConsumed?.();
    // The callback is a fresh arrow from App, but App only re-renders it after
    // clearing openTrip, so the hand-off still runs once per link.
  }, [openTrip, onOpenTripConsumed]);

  const { itinRows, itinFacets } = useItineraryLayer({
    isItinCat, itinCountry, itinCountryRows, itinDays, itinPace, itinScale, itinTop, nearPlace,
    q,
  });

  const { wantBeachCountry, beachRows, beachCounts } = useBeachLayer({
    beachFacets, beachIndex, country, countryBeaches, countryName, failLayer, isBeachCat,
    layerError, nearPlace, onOpenBeachConsumed, openBeach, q, retryTick, setBeachIndex,
    setBeachesLoading, setCat, setCountryBeaches, setListedBeaches, setNearPlace, setPageBeach,
    setQuery, setTopBeaches, topBeaches,
  });

  const { wantLakeCountry, lakeRows, lakeCounts, absentLakeCountry } = useLakeLayer({
    country, countryLakes, countryName, failLayer, isLakeCat, lakeFacets, lakeIndex, layerError,
    nearPlace, onOpenLakeConsumed, openLake, q, retryTick, setCat, setCountryLakes,
    setLakeIndex, setLakesLoading, setListedLakes, setNearPlace, setPageLake, setQuery,
    setTopLakes, topLakes,
  });

  const { wantMountainCountry, mountainRows, mtnCounts } = useMountainLayer({
    country, countryMountains, countryName, failLayer, isMountainCat, layerError, mountainIndex,
    mtnFacets, nearPlace, q, retryTick, setCountryMountains, setListedMountains,
    setMountainIndex, setMountainsLoading, setTopMountains, topMountains,
  });

  const {
    countryOfText, wantCycleCountry, openCycleRoute, openCycleTour, cycleScope, cycleCounts,
    cycleRows, cycleTotal,
  } = useCycleLayer({
    cat, country, countryCycling, countryName, cycleFacets, cycleIndex, cycleShowLocal,
    cycleSort, cycleTop, debouncedQuery, failLayer, isCycleCat, lang, layerError, nearPlace,
    pendingWhere, q, retryTick, setCountry, setCountryCycling, setCycleIndex, setCycleTop,
    setCyclingLoading, setDebouncedQuery, setNearPlace, setPageCycle, setPendingWhere, setQuery,
    t, trailsIndex,
  });
  const cycleWindow = useMemo(() => {
    if (!cycleRows) return null;
    const tours = Math.min(cycleRows.tours.length, visible);
    const routes = Math.min(cycleRows.routes.length, Math.max(0, visible - tours));
    // Capped by what there is: uncapped, an empty listed tier still drew its
    // heading over nothing, right above the empty state (T367).
    const listed = Math.min(cycleRows.listed.length, Math.max(0, visible - tours - routes));
    return { tours, routes, listed };
  }, [cycleRows, visible]);

  const absentMountainCountry = useMemo(() => {
    if (!isMountainCat || !q || q.length < 2 || !mountainIndex) return null;
    for (const cc of Object.keys(mountainIndex.absent || {})) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isMountainCat, q, mountainIndex, countryName]);

  // A shared #mtn= link, opened once its country file has landed.
  useEffect(() => {
    if (!openMountain) return;
    setCat('mountains');
    setQuery('');
    setNearPlace(null);
    loadMountains(openMountain.cc).then((rows) => {
      const hit = (rows || []).find((m) => m.id === openMountain.id);
      if (hit) setPageMountain(hit);
      setCountryMountains((cur) => ({ ...cur, [openMountain.cc]: rows || [] }));
    }).catch(failLayer('mountains'));
    onOpenMountainConsumed?.();
  }, [openMountain, onOpenMountainConsumed, failLayer]);

  // A shared #cycle= / #tour= link, or a cycling card on a region page.
  // Simpler than the others: CyclePage loads the route or tour by id itself,
  // so there is no country file to wait for here.
  useEffect(() => {
    if (!openCycle) return;
    setCat('cycling');
    setQuery('');
    setNearPlace(null);
    if (openCycle.kind === 'tour' && openCycle.slug) {
      setPageCycle({ tourSlug: openCycle.slug });
    } else if (openCycle.id) {
      setPageCycle({ routeId: openCycle.id, country: openCycle.country });
    }
    onOpenCycleConsumed?.();
  }, [openCycle, onOpenCycleConsumed]);

  // How many rows the open category actually has. Two arms were missing:
  // cycling and the composed itineraries both fell through to tripRows,
  // which is null with no country selected. That gave rowCount 0, and two
  // things read it. The IntersectionObserver only grows `visible` while
  // `visible < rowCount`, so the itinerary list was capped at one page
  // forever while its sentinel scrolled by loading nothing; and the filter
  // sheet renders its apply button from the same number, so Cycling said
  // "show no results" over hundreds of routes.
  const rowCount = isBeachCat ? (beachRows?.length ?? 0)
      : isLakeCat ? (lakeRows?.length ?? 0)
        : isMountainCat ? (mountainRows?.length ?? 0)
          : isCycleCat ? cycleTotal
            : isItinCat ? (itinRows?.length ?? 0)
              : (tripRows?.length ?? 0);

  // New filter result: collapse the window and go back to the top. Every
  // filter that can change what the list holds belongs in these deps -
  // ticking one that was missing left you mid-page in a four-row result.
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [cat, country, q, nearPlace, sort, trailSort, bands, loopsOnly,
    mtnFacets, lakeFacets, beachFacets, journeyView,
    grades, climbs, shapes, hls, suits, sacs, durs, reachOnly,
    itinDays, itinPace, itinScale,
    cycleFacets, cycleSort, cycleShowLocal]);

  // Walk-shape filters belong to the Trails list and to nothing else. Leaving
  // them set while the traveller browses Trips would silently hide rows on a
  // tab whose chips are not even on screen to explain why.
  useEffect(() => {
    if (cat !== 'trails') { setBands([]); setLoopsOnly(false); }
    if (cat !== 'mountains') setMtnFacets({});
    if (cat !== 'lakes') setLakeFacets({});
    if (cat !== 'beaches') setBeachFacets({});
    if (cat !== 'cycling') { setCycleFacets({}); setCycleShowLocal(false); }
  }, [cat]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < rowCount ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rowCount]);

  // Highlights or Full list (T457, the owner: the full list "is brought to
  // the bottom"; find a smarter way). The opening's rails are the
  // highlights; the full list is one choice from the head, where Explore
  // keeps List | Map. A new section opens on its highlights.
  const [dview, setDview] = useState('top');

  const switchCat = (next) => {
    if (next === cat) return;
    setCat(next);
    setDview('top');
    setQuery('');
    setJourneyView(null);
    // The country deliberately survives the switch: "I am looking at Albania,
    // now show me its trails" is the whole point of a shared filter. It is
    // dropped only when the tab that arrives cannot offer it, by the effect
    // beside countryOptions, which has to wait for that layer's index.
    scrollRef.current?.scrollTo?.(0, 0);
  };

  const toggleChip = (setter) => (key) => setter(
    (cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const toggleBand = (key) => {
    setBands((cur) => (cur.includes(key)
      ? cur.filter((k) => k !== key)
      : [...cur, key]));
  };

  const fmt = (n) => n.toLocaleString(lang);

  const showCountryIndex = !q && !country && !nearPlace;
  const showTripRows = isTripCat && !trailsLoading && tripRows && tripRows.length > 0;
  // Anything the traveller set that narrows the walks list: when it empties
  // the list, the list says so and offers to clear them, rather than calling
  // the country empty.
  const trailFiltersOn = !!q || bands.length > 0 || grades.length > 0 || climbs.length > 0
    || shapes.length > 0 || hls.length > 0 || suits.length > 0 || loopsOnly
    || sacs.length > 0 || durs.length > 0 || reachOnly;
  const clearTrailFilters = () => {
    setQuery(''); setBands([]); setGrades([]); setClimbs([]);
    setShapes([]); setHls([]); setSuits([]); setLoopsOnly(false);
    setSacs([]); setDurs([]); setReachOnly(false);
  };
  // A geocoded point with no country (an ocean, a border way) has no trails
  // file to read, so the trip categories say so rather than render nothing.
  const nearNoCountry = isTripCat && nearPlace && !nearPlace.iso2;
  // Trails carry no price and no rating: a hike is free and is not scored, so
  // the origin, the stay tier and the rating/price/A-Z sorts have nothing to
  // act on here. Distance from a searched city still orders them.
  //
  // Beaches drop the same chrome and the country dropdown with it. A beach is
  // not priced, is not slept in, and is ranked by its own index, so a "priced
  // from Brussels" line and a "dorm bed" tier over the list would be answering
  // a question nobody asked on this tab. The country a traveller wants is
  // reachable by typing its name into the one search field.
  //
  // Lakes and mountains drop it too, and for the same reasons: neither is
  // priced, neither is slept in, and both are ranked by their own index.
  // The curated trip library drops it too: its budgets are editorial ranges
  // for the whole week, not fares priced from the traveller's airport.
  const showPriceChrome = cat !== 'trails' && !isBeachCat && !isLakeCat
    && !isMountainCat && !isCycleCat && !isJourneyBrowse;

  // ── The filter model ──────────────────────────────────────────────────
  //
  // Which countries this tab can offer. Every layer publishes its own set,
  // and offering a country a layer has nothing in is worse than not offering
  // it: the list would empty and nothing on screen would say why.
  const countryOptions = useMemo(() => {
    // Beaches, lakes and mountains key the country as `cc`; cycling keys it
    // as `country`. Both are read here rather than in one caller, so a layer
    // whose index spells it the other way cannot silently produce a list of
    // undefined entries.
    const fromIndex = (idx) => (idx?.countries || [])
      .map((c) => c.cc || c.country)
      .filter(Boolean)
      .map((cc) => [cc, countryName(cc)])
      .sort((a, b) => a[1].localeCompare(b[1], lang));
    if (isBeachCat) return fromIndex(beachIndex);
    if (isLakeCat) return fromIndex(lakeIndex);
    if (isMountainCat) return fromIndex(mountainIndex);
    // Cycling publishes its own country set too. Falling through to the
    // priced catalogue offered countries with no cycling at all, which is
    // exactly what the note above says is worse than not offering them.
    if (isCycleCat) return fromIndex(cycleIndex);
    return availableCountries.map(([cc]) => [cc, countryName(cc)])
      .sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [isBeachCat, isLakeCat, isMountainCat, isCycleCat, beachIndex, lakeIndex,
    mountainIndex, cycleIndex, availableCountries, countryName, lang]);

  // T602: the settings line's Countries. One country in "Only these" is
  // the tab's country (Trails and Cycling then load all its routes), once
  // the layer says it has that country. Applied when the choice changes,
  // so removing the country's chip sticks; a country that came from the
  // settings line leaves with it.
  const settings = useSettings();
  const settingsCc = settings && !settings.countryNot && (settings.countryFilter || []).length === 1
    ? settings.countryFilter[0] : '';
  const fromSettings = useRef({ key: '', cc: '' });
  useEffect(() => {
    if (!isActive) return;
    const offered = cat === 'trails'
      ? (trailsIndex ? (trailsIndex.countries || []).map((c) => c.country) : null)
      : countryOptions.length > 0 ? countryOptions.map(([cc]) => cc) : null;
    const key = `${cat}:${settingsCc}`;
    if (fromSettings.current.key === key) return;
    if (!settingsCc) {
      if (fromSettings.current.cc && country === fromSettings.current.cc) setCountry('');
      fromSettings.current = { key, cc: '' };
      return;
    }
    // Wait for the layer's country list before deciding.
    if (!offered) return;
    fromSettings.current = { key, cc: '' };
    if (!offered.includes(settingsCc) || country === settingsCc) return;
    fromSettings.current.cc = settingsCc;
    setCountry(settingsCc);
    setNearPlace(null);
  }, [isActive, cat, settingsCc, trailsIndex, countryOptions, country]);

  // A country the tab that just opened does not publish. Cleared rather than
  // left set, because the picker would show a country the list is not
  // filtered by: every layer has its own set, and Andorra has no beaches.
  useEffect(() => {
    if (!country || countryOptions.length === 0) return;
    if (!countryOptions.some(([cc]) => cc === country)) setCountry('');
  }, [country, countryOptions]);

  const { facetGroups } = useFacetGroups({
    bands, beachCounts, beachFacets, beachRows, cat, climbs, cycleCounts, cycleFacets,
    cycleRows, cycleScope, durs, grades, hls, isBeachCat, isCycleCat, isItinCat, isLakeCat,
    isMountainCat, itinFacets, itinPace, itinScale, lakeCounts, lakeFacets, lakeRows, loopsOnly,
    mountainRows, mtnCounts, mtnFacets, reachOnly, sacs, setBeachFacets, setClimbs,
    setCycleFacets, setDurs, setGrades, setHls, setItinPace, setItinScale, setLakeFacets,
    setLoopsOnly, setMtnFacets, setReachOnly, setSacs, setShapes, setSuits, shapes,
    showCountryIndex, suits, t, toggleBand, toggleChip, trailFacets,
  });

  // What the Filters badge counts, and what Clear all clears. The country is
  // one of them: it is the filter every tab now carries.
  const activeFilters = (country ? 1 : 0)
    + Object.values(cycleFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + bands.length + (loopsOnly ? 1 : 0)
    + grades.length + climbs.length + shapes.length + hls.length + suits.length
    + sacs.length + durs.length + (reachOnly ? 1 : 0)
    + Object.values(beachFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(lakeFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(mtnFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + (itinDays != null ? 1 : 0) + (itinPace ? 1 : 0) + (itinScale ? 1 : 0);

  // Every filter but the country (the pane's Clear all, T602).
  const resetFacets = () => {
    setBands([]);
    setLoopsOnly(false);
    setGrades([]);
    setClimbs([]);
    setShapes([]);
    setHls([]);
    setSuits([]);
    setSacs([]);
    setDurs([]);
    setReachOnly(false);
    setBeachFacets({});
    setLakeFacets({});
    setMtnFacets({});
    setCycleFacets({});
    setCycleShowLocal(false);
    setItinDays(null);
    setItinPace(null);
    setItinScale(null);
  };
  const resetAll = () => {
    setCountry('');
    resetFacets();
  };

  // Every filter that is on, as one removable chip (T384, brief V3-2, rule
  // N6), drawn by shell's FilterChips, the component Explore uses. The
  // country is a chip because it narrows the list like any other; the near
  // place is not, because its own heading already carries its Clear, and two
  // buttons that undo one thing are one too many.
  const activeChips = [];
  if (country) {
    activeChips.push({ key: `cc-${country}`, label: countryName(country), remove: () => setCountry('') });
  }
  for (const g of facetGroups) {
    for (const o of g.options) {
      if (o.on) activeChips.push({ key: `${g.key}-${o.key}`, label: o.label, remove: () => g.onToggle(o.key) });
    }
  }
  // Clear all puts the section back at rest, which is where its opening is.
  const clearAllChips = () => { resetAll(); setQuery(''); setNearPlace(null); };

  // Which sorts this tab has, and whether there is a list for them to order.
  const sortDefs = cat === 'trails' ? TRAIL_SORTS
    : isCycleCat ? CYCLE_SORTS
      : (showPriceChrome ? SORTS : []);
  const showSorts = cat === 'trails'
    ? (!showCountryIndex && !nearPlace && showTripRows)
    : isCycleCat
      ? Boolean(cycleRows && (cycleRows.routes.length + cycleRows.listed.length) > 0)
      : (!showCountryIndex && showPriceChrome);

  // ── The section opening screen (spec 5.3, T183) ──────────────────────
  //
  // Bands 1 and 2 show only while a section is at rest: nothing typed, no
  // place searched, no country picked, no chip on. The first filter of any
  // kind (a rail's "See all" included) folds them away and leaves the grid,
  // which is Band 3; clearing it brings them back. Trails are the exception
  // in scope: their wire is one file per country, so with no country the
  // section opens on trails/top.json (T453, each country's best and its best
  // in each Europe-wide cut), and with one on that country's own walks.
  const facetsOff = (f) => !Object.values(f).some((l) => l?.length);
  const trailChipsOn = bands.length > 0 || grades.length > 0 || climbs.length > 0
    || shapes.length > 0 || hls.length > 0 || suits.length > 0 || loopsOnly
    || sacs.length > 0 || durs.length > 0 || reachOnly;
  const atRest = !q && !query.trim() && !nearPlace;
  const openingLayer = !atRest ? null
    : isBeachCat ? (!country && facetsOff(beachFacets) && topBeaches?.length ? 'beach' : null)
      : isLakeCat ? (!country && facetsOff(lakeFacets) && topLakes?.length ? 'lake' : null)
        : isMountainCat ? (!country && facetsOff(mtnFacets) && topMountains?.length ? 'mountain' : null)
          : isCycleCat ? (!country && facetsOff(cycleFacets) && cycleTop?.routes?.length ? 'cycle' : null)
            : cat === 'trails' ? (trailChipsOn ? null
              : country ? (tripCards?.length ? 'trail' : null)
                : (topTrails?.length ? 'trailEurope' : null))
              : null;

  const opening = useMemo(() => {
    if (!openingLayer) return null;
    if (openingLayer === 'trailEurope') {
      return { layer: 'trail', europe: true, icons: pickIcons('trail', topTrails), rails: buildRails('trail', topTrails, 'trailEurope') };
    }
    const rows = openingLayer === 'beach' ? topBeaches
      : openingLayer === 'lake' ? topLakes
        : openingLayer === 'mountain' ? topMountains
          : openingLayer === 'cycle' ? (cycleTop?.routes || [])
            : (tripCards || []).map((c) => c.tr).filter((tr) => tr.category !== 'citytrip');
    return { layer: openingLayer, icons: pickIcons(openingLayer, rows), rails: buildRails(openingLayer, rows) };
  }, [openingLayer, topBeaches, topLakes, topMountains, cycleTop, tripCards, topTrails]);

  // A rail's "See all": its saved filter, put on the grid's own chips.
  const applyRail = (layer, f) => {
    if (layer === 'beach') setBeachFacets(f);
    else if (layer === 'lake') setLakeFacets(f);
    else if (layer === 'mountain') setMtnFacets(f);
    else if (layer === 'cycle') setCycleFacets(f);
    else if (layer === 'trail') {
      setBands(f.bands || []);
      setHls(f.hls || []);
      setSuits(f.suits || []);
      setLoopsOnly(!!f.loopsOnly);
      setGrades([]);
      setClimbs([]);
      setShapes([]);
    }
  };

  const openFromBand = (row) => {
    const layer = opening?.layer;
    if (layer === 'beach') setPageBeach(row);
    else if (layer === 'lake') setPageLake(row);
    else if (layer === 'mountain') setPageMountain(row);
    else if (layer === 'cycle') openCycleRoute(row);
    else if (layer === 'trail') {
      const card = (tripCards || []).find((c) => c.tr.id === row.id);
      if (card) setPageCard(card);
      // A Europe-wide tile: no country list is loaded, so the card is built
      // the way a neighbour's walk is.
      else openNeighbour('trail', row);
    }
  };

  const { describeFacts } = useDescribeFacts({ countryName, lang, opening, t });
  // A rail tile carries the same "Bed and food in {city}" line as the list
  // card (owner T489-d; T502: the rails still printed only a length).
  const RAIL_LAYER = { beach: 'beaches', lake: 'lakes', mountain: 'mountains', cycle: 'cycling' };
  const describeRow = (row) => {
    const d = describeFacts(row);
    const layer = RAIL_LAYER[opening?.layer];
    return layer ? { ...d, base: bedFood(layer, row) } : d;
  };

  // ── The section's head, rails and starters (T428) ─────────────────────
  //
  // The head is one photograph of people doing the thing and one title with
  // a verb; it shows while the section is at rest and no country is picked
  // (a picked country gets its own band instead). The best-known set that
  // used to sit under "Europe's 6 best-known mountains" is the first rail
  // now, then the saved cuts: four rails on a desktop, three on a phone, and
  // every cut beyond that is a "Try one" starter that applies the same
  // filter. A starter is offered only where its filter leaves at least
  // RAIL_MIN places (lib/openingScreen.js), so none of them leads nowhere.
  const SECTION_KEY = { trails: 'trails', beaches: 'beaches', lakes: 'lakes', mountains: 'mountains', cycling: 'cycling' };
  const sectionHead = SECTION_KEY[cat] && !country && !nearPlace && !q
    ? { title: t(`dtab.head.${cat}`) }
    : null;
  // The near-me door, in the head of every section (T430): the way in most
  // people take first, said in the section's own words.
  // T622 (owner 2026-10-23: "summits near me ... is not aligned and not
  // clean"): the near-me door is the crosshair inside the Where field on
  // every width, so the head is the title alone.
  const nearMeDoor = null;
  const isDesktop = useIsDesktop();
  // T961: the phone's search dock names this layer while it is on screen
  // (its colour tile and the sheet's What start here).
  // T966 (closes T961-a): on a phone the dock is the layer's one search, so
  // its own Where bar is gone; once a Where, a near town or a filter is on,
  // the dock draws Back (the layer at rest) and the one Filters button.
  const catWord = t((CATS.find((c) => c.key === cat) || CATS[0]).labelKey);
  const dockWhere = nearPlace?.name || query || (country ? countryName(country) : '');
  const dockLabel = dockWhere ? t('dock.in', { what: catWord, q: dockWhere }) : catWord;
  const dockOn = !!(query || nearPlace || activeFilters > 0) && cat !== 'trips';
  if (isActive && !isDesktop) {
    setDockHandlers({
      onBack: clearAllChips,
      onFilters: () => { setSheetFrom('toolbar'); setSheetOpen(true); },
    });
  }
  useEffect(() => {
    if (!isActive || isDesktop) return;
    setDockKind(cat === 'trips' ? 'places' : cat);
    setDockResults(dockOn ? {
      label: dockLabel, query: query || '', filterCount: activeFilters, filtersOpen: sheetOpen,
    } : null);
  }, [isActive, isDesktop, cat, dockOn, dockLabel, query, activeFilters, sheetOpen]);
  const { openingRails, openingDoors, outdoorCat, bedFood, routeMap, mapRows, openMapItem } = useDestMapItems({
    applyRail, beachRows, cat, country, countryName, cycleRows, data, indices, isActive,
    isCycleCat, isDesktop, lakeRows, lang, mountainRows, openCycleRoute, openNeighbour, opening,
    q, setPageBeach, setPageCard, setPageLake, setPageMountain, t, topTrails, trailPass,
    trailsCountry, tripRows,
  });
  const mapOn = dview === 'map' && outdoorCat && mapRows.length > 0;
  const viewSwitch = outdoorCat && (mapRows.length > 0 || dview === 'map') ? {
    label: t('explore.viewAria'),
    value: dview === 'map' ? 'map' : 'top',
    onChange: (v) => { setDview(v); scrollRef.current?.scrollTo?.(0, 0); },
    options: [
      { value: 'top', label: t('explore.viewList'), icon: <ListDayIcon size={15} /> },
      { value: 'map', label: t('explore.viewMap'), icon: <MapPinIcon size={15} /> },
    ],
  } : null;
  // The Full list view left with the List | Map switch (T498): the list is
  // always under the rails, and the cuts beyond the rail cap are doors.
  // T622 (owner 2026-10-23: "browse the full list ... needs to be a button
  // on top so users can pick this"): Full list is a toggle in the filter
  // row; on, the rails step aside and the list is the answer.
  const [fullList, setFullList] = useState(false);
  useEffect(() => { setFullList(false); }, [cat]);
  const listView = fullList;

  // A picked country's coasts, ranges and regions that hold this layer: one
  // row of door buttons over the list it narrows (T489-i, carta-design
  // "Rails and cuts").
  const [regionIndex, setRegionIndex] = useState(null);
  useEffect(() => {
    if (!isActive || !outdoorCat || !country || regionIndex || !onOpenRegion) return undefined;
    let live = true;
    loadRegionIndex().then((ix) => { if (live) setRegionIndex(ix); }).catch(() => {});
    return () => { live = false; };
  }, [isActive, outdoorCat, country, regionIndex, onOpenRegion]);
  const layerRegions = useMemo(
    () => (outdoorCat && country && regionIndex ? regionsForLayer(regionIndex, country, cat) : []),
    [outdoorCat, country, regionIndex, cat],
  );

  // ── Desktop chrome ────────────────────────────────────────────────────
  //
  // On a desktop screen this tab's controls leave the toolbar card and take
  // the shape a reader of paper maps expects: everything that narrows the
  // list stands in a panel on the left under the brand, and the search field
  // heads the main column, directly under the top bar and directly over the
  // results it searches. It used to portal into the header instead, which
  // put this page's own question up in the app's chrome, sharing a row with
  // the account and the pass. On a phone nothing moves: the toolbar card
  // stays exactly as it was, and CSS shows one arrangement or the other.

  // ── The tab's chrome (T428, T457) ──────────────────────────────────────
  //
  // Explore's grammar, so the two browse tabs read as one product:
  //   - the six sections as kit tiles, an icon over the word, the way
  //     Explore's panel offers its trip types (T457, the owner: the row of
  //     small underlined tabs was "too little"). On a desktop they head the
  //     side panel, two across; on a phone they are the 2 x 3 grid of equal
  //     buttons the design system names for six categories. They keep tab
  //     semantics: the six swap the panel below in place;
  //   - the search field, in the header's slot on a desktop like Explore's
  //     guided search, beside one Filters button on a phone;
  //   - one refine row over the list on a phone: the sort as one select and
  //     the country; on a desktop the panel holds both;
  //   - the Lifestyle door is the settings line's alone (row T381-b).
  // No figure rides a chip any more: the list under it is the answer.
  // The six Explore categories (T498, roadmap 1.3b A): Places hands back
  // to the catalogue, a layer to App's one door, the country travelling
  // with the traveller (rule 3). The trip library sits inside Places, so
  // Places is the tile marked while it shows.
  const catTiles = (
    <ExploreCategories
      current={cat === 'trips' ? 'places' : cat}
      variant="row"
      panelId="dtab-panel"
      className="dtab-cats"
      onPick={(key) => {
        if (onPickCategory) onPickCategory(key, country || '');
        else if (key !== 'places') switchCat(key);
      }}
    />
  );

  const sortCur = cat === 'trails' ? trailSort : isCycleCat ? cycleSort : sort;
  const pickSort = (key) => {
    if (!key) return;
    if (cat === 'trails') {
      setTrailSort({ key, dir: TRAIL_SORTS.find((x) => x.key === key).defaultDir });
      return;
    }
    if (isCycleCat) {
      setCycleSort({ key, dir: CYCLE_SORTS.find((x) => x.key === key).defaultDir });
      return;
    }
    setNearPlace(null);
    setSort({ key, dir: SORTS.find((x) => x.key === key).defaultDir });
  };
  const renderFacetGroups = (only) => facetGroups
    // Inline only the short set flagged `toolbar`, or a group with a chip
    // on (an opening's "See all" can switch on a chip from any group);
    // every other group lives in the Filters sheet (T384, brief V3-1).
    .filter((g) => (only === 'toolbar'
      ? g.toolbar === true || g.options.some((o) => o.on)
      : true))
    .map((g) => (
      <div key={g.key} className="dtab-facet xpane-sec">
        <h3 className="dtab-facet-label xrail-h">{g.label}</h3>
        <div className="dtab-chips xpane-chips" role="group" aria-label={g.label}>
          {g.options.map((o) => (
            <Chip
              key={o.key}
              kind="filter"
              selected={!!o.on}
              disabled={o.disabled}
              className={o.cls || ''}
              onClick={() => g.onToggle(o.key)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        {g.notYet && <NotYet />}
      </div>
    ));

  // The locate door and the suggestion list, built once: they ride in the
  // phone toolbar's field and in the What and Where bar alike (T593).
  // On a desktop the head's labelled near-me door does this (T457: two
  // doors to one action, and the header field lost a third of its width to
  // the crosshair); a phone keeps it in the field.
  const locateBtn = (canLocate && (
    <button
      type="button"
      className="places-locate"
      onClick={useMyLocation}
      disabled={locBusy}
      aria-busy={locBusy || undefined}
      title={t('places.useMyLocation')}
      aria-label={t('places.useMyLocation')}
    >
      {locBusy
        ? <span className="state-pulse"><CrosshairIcon size={16} /></span>
        : <CrosshairIcon size={16} />}
    </button>
  ));
  const suggList = (suggOpen && (suggestions.length > 0 || canGeo) && (
    <div className="places-sugg" role="listbox">
      {/* Two groups, headed only once the second one exists: the
          places Carta prices, then anywhere else on the map. */}
      {suggestions.length > 0 && geoHits && geoHits.length > 0 && (
        <p className="places-sugg-head">{t('places.suggCatalogue')}</p>
      )}
      {suggestions.map((d) => (
        <button key={d.id} className="places-sugg-item" onClick={() => pickDest(d)}>
          <span className="places-sugg-city">{d.city}</span>
          <span className="places-sugg-country">{d.country}</span>
        </button>
      ))}
      {canGeo && !geoHits && (
        <button
          type="button"
          className="places-sugg-item places-sugg-any"
          onClick={runGeoSearch}
          disabled={geoBusy}
        >
          <span className="places-sugg-city">
            <MapPinIcon size={13} />
            {geoBusy ? t('places.searchingAny') : t('places.searchAny', { q: term })}
          </span>
          {!geoBusy && <span className="places-sugg-country">{t('places.searchAnyHint')}</span>}
        </button>
      )}
      {geoHits && geoHits.length > 0 && (
        <>
          <p className="places-sugg-head">{t('places.suggAnywhere')}</p>
          {geoHits.map((r, i) => {
            const { title, rest } = geoLines(r);
            return (
              <button
                key={`${r.lat},${r.lon},${i}`}
                className="places-sugg-item is-geo"
                onClick={() => pickGeo(r)}
              >
                <span className="places-sugg-city">
                  <MapPinIcon size={13} />
                  {title}
                </span>
                <span className="places-sugg-country">{rest}</span>
              </button>
            );
          })}
        </>
      )}
      {geoHits && geoHits.length === 0 && (
        <p className="places-sugg-note">{t('places.anywhereNone')}</p>
      )}
    </div>
  ));

  // The search field, built once. It renders inline in the phone toolbar and
  // portals into the app header on desktop; the suggestion list rides with it.
  const searchField = (
    <div className="places-search" ref={searchRef}>
      <SearchIcon size={15} className="places-search-icon" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setSuggOpen(true); }}
        onFocus={() => setSuggOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSearchEnter(); }
          else if (e.key === 'Escape') setSuggOpen(false);
        }}
        placeholder={t('places.searchDest')}
        aria-label={t('places.searchDest')}
      />
      {locateBtn}
      {suggList}
    </div>
  );

  // The header's search slot belongs to whichever browse tab is on screen
  // (both stay mounted), the way ExploreTab claims it.
  const [headerSlot, setHeaderSlot] = useState(null);
  useEffect(() => {
    if (isDesktop && isActive) setHeaderSlot(document.getElementById('header-search-slot'));
    else setHeaderSlot(null);
  }, [isDesktop, isActive]);

  // ── The What and Where bar and the quick filter row (T593) ──────────────
  // What sets one facet group to a single choice (or none); Where is the
  // tab's search text, live as before. Search applies What and, when the
  // text is exactly a town Carta knows, measures the list from that town.
  const whatGroup = outdoorCat ? facetGroups.find((g) => g.key === WHAT_GROUP[cat]) : null;
  const whatOpts = whatGroup ? whatGroup.options.filter((o) => o.key !== 'loop') : [];
  const whatOn = whatOpts.filter((o) => o.on);
  const whatSpec = whatOpts.length > 0
    ? { value: whatOn.length === 1 ? whatOn[0].key : '', options: whatOpts }
    : null;
  const applyWhat = (key) => {
    if (!whatGroup) return;
    for (const o of whatOpts) if (o.on && o.key !== key) whatGroup.onToggle(o.key);
    if (key && !whatOpts.some((o) => o.key === key && o.on)) whatGroup.onToggle(key);
  };
  // T600: on Trails and Cycling a country named in Where is a country
  // picked (their walks and rides are published one country at a time), so
  // the chip says it and the map has that country's every route.
  const pickTypedCountry = () => {
    const cc = (cat === 'trails' || cat === 'cycling') ? countryOfText(term) : null;
    if (!cc) return false;
    setCountry(cc);
    setNearPlace(null);
    setQuery('');
    setSuggOpen(false);
    scrollRef.current?.scrollTo?.(0, 0);
    return true;
  };
  const runWhere = (whatKey) => {
    if (whatKey != null) applyWhat(whatKey);
    setSuggOpen(false);
    if (pickTypedCountry()) return;
    const town = term && !typedCc ? suggestions.find((d) => norm(d.city) === norm(term)) : null;
    if (town) pickDest(town);
    scrollRef.current?.scrollTo?.(0, 0);
  };
  // End check (T593 with T592): the one Map or List pill, as on Places, in
  // the bar every outdoor tab opens on, so the map is one press away at rest
  // too. T966: on a phone, where that bar is gone, it ends the quick row.
  const viewPill = viewSwitch ? (
    <Button variant="secondary" size={isDesktop ? undefined : 'sm'} className="xview-toggle wbar-view"
      iconStart={viewSwitch.value === 'map' ? <ListDayIcon size={16} /> : <MapPinIcon size={16} />}
      onClick={() => viewSwitch.onChange(viewSwitch.value === 'map' ? 'top' : 'map')}>
      {t(viewSwitch.value === 'map' ? 'explore.viewList' : 'explore.viewMap')}
    </Button>
  ) : null;
  const whereBar = outdoorCat ? (
    <WhereBar
      t={t}
      what={whatSpec}
      onSearch={runWhere}
      after={viewPill}
      where={{
        value: query,
        boxRef: searchRef,
        onChange: (e) => { setQuery(e.target.value); setSuggOpen(true); },
        onFocus: () => setSuggOpen(true),
        onKeyDown: (e) => {
          // Enter keeps the field's own answer (the best town or the map);
          // the Search button is the bar's. A country on Trails and Cycling
          // is picked first (T600).
          if (e.key === 'Enter') { e.preventDefault(); if (!pickTypedCountry()) onSearchEnter(); }
          else if (e.key === 'Escape') setSuggOpen(false);
        },
        onClear: () => { setQuery(''); setSuggOpen(false); },
        extra: locateBtn || null,
      }}
    >
      {suggList || null}
    </WhereBar>
  ) : null;
  const quickGroups = (QUICK_GROUPS[cat] || [])
    .map((k) => facetGroups.find((g) => g.key === k)).filter(Boolean);
  // T602: the one quick row on every tab and width: All filters (the
  // desktop pane or the phone sheet), Sort, then the tab's quick chips.
  const sortPill = showSorts && sortDefs.length > 0 && !isJourneyBrowse ? (
    <SortPill t={t} options={sortDefs} value={sortCur.key} onChange={pickSort} />
  ) : null;
  const filterCount = activeFilters - (country ? 1 : 0);
  // The Full list toggle (T622): only where the section has a list under
  // its rails (Europe-wide trails open on their countries instead).
  const fullListBtn = opening && !opening.europe && !mapOn ? (
    <Button variant="secondary" size="sm" className={`qfbar-full${fullList ? ' is-on' : ''}`}
      aria-pressed={fullList}
      iconStart={fullList ? <CheckIcon size={15} /> : <ListDayIcon size={15} />}
      onClick={() => { setFullList((v) => !v); scrollRef.current?.scrollTo?.(0, 0); }}>
      {t('dtab.fullList')}
    </Button>
  ) : null;
  // T1038 (owner: the filters under the tabs, tidier): the cuts that got no
  // rail are presets of options already in All filters, so they leave the
  // top; with the full list on, the doors to every rail stay.
  const topStarters = opening && !mapOn && fullList ? openingDoors : [];
  const phoneViewPill = isDesktop ? null : viewPill;
  const quickBar = facetGroups.length > 0 || sortPill || fullListBtn || phoneViewPill ? (
    <FilterChipBar
      t={t}
      fmt={fmt}
      groups={quickGroups}
      allCount={filterCount}
      allRef={filterBtnRef}
      allOn={facetGroups.length > 0 && (isDesktop ? paneOpen : sheetOpen)}
      allControls={isDesktop ? 'dtab-side' : undefined}
      lead={(
        <>
          {/* T1038: the full list right after All filters, never wrapped
              down to a second line. */}
          {fullListBtn}
          {settings?.setCountryFilter && <CountriesButton s={settings} size="sm" className="qfbar-ctry" />}
          {sortPill}
        </>
      )}
      trail={phoneViewPill}
      onAll={facetGroups.length > 0
        ? () => {
          if (isDesktop) setPaneOpen((v) => !v);
          else { setSheetFrom('toolbar'); setSheetOpen(true); }
        }
        : null}
    />
  ) : null;

  // How long the composed trip is: a stepped select (T428, row T199-a: the
  // slider re-ranked the whole list on every step, 864 to 1,360 ms on a
  // throttled phone).
  const tripLength = isComposedTrips ? (
    <Field
      as="select"
      className="dtab-length"
      label={t('trip.lengthLabel')}
      // The whole result set, for the trips harness: the list renders a page
      // at a time, and the number is never said on screen (2026-09-02).
      data-n={itinRows ? itinRows.length : 0}
      value={itinDays == null ? '' : String(itinDays)}
      onChange={(e) => setItinDays(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{t('trip.anyLength')}</option>
      {TRIP_DAYS.map((d) => (
        <option key={d} value={d}>{t(d === 1 ? 'trip.oneDay' : 'trip.nDays', { n: d })}</option>
      ))}
    </Field>
  ) : null;

  // The composed trips' length, over the list on every width (T602: the
  // panel that held it on a desktop is gone; the sort is the quick row's).
  const refineRow = tripLength ? (
    <div className="dtab-refine is-length">
      {tripLength}
    </div>
  ) : null;

  // A picked country, said once over the list with the one line it is known
  // for, and the door to its places on Explore (T428).
  // A country typed into the search counts too (typedCc), the way the old
  // "Beaches in Sweden" line followed the field.
  const bandCc = nearPlace ? null : (typedCc || null);
  const countryBand = bandCc ? (
    <div className="dtab-countryband">
      <CountryFlag country={bandCc} size={18} className="dtab-countryband-flag" />
      <div className="dtab-countryband-text">
        <h2 className="dtab-countryband-name">{countryName(bandCc)}</h2>
        {countryKnownKey(bandCc) && <p className="dtab-countryband-line">{t(countryKnownKey(bandCc))}</p>}
      </div>
      {/* One tile away from Places in the same country now (T498), so the
          band's door is the country's own page. */}
      {onOpenCountryPage && (
        <Button variant="quiet" size="sm" className="dtab-countryband-go"
          iconEnd={<ChevronRightIcon size={14} />} onClick={() => onOpenCountryPage(bandCc)}>
          {t('cpage.open', { country: countryName(bandCc) })}
        </Button>
      )}
      {/* A country's walks open on its rails too (T457): the band is their
          head, so the view switch stands in it. */}
    </div>
  ) : null;

  const pickCountry = (cc) => {
    setCountry(cc);
    setNearPlace(null);
    scrollRef.current?.scrollTo?.(0, 0);
  };

  return (
    <div className="places-shell">
      {/* The page's one h1 (T186): the tab has no visible title, so the name
          is for assistive technology. It steps aside while a dialog (a detail
          page, a sheet) is open, so that dialog's own h1 is the only one. */}
      <h1 className="sr-only tab-h1">{t('explore.title')}</h1>
      {/* T602: the filter pane, desktop only (CSS hides it under 769px)
          and only while All filters has it open: every facet group of the
          tab in Places' pane sections. No sort (the quick row's pill) and
          no country (the settings line's Countries, or Where). */}
      {facetGroups.length > 0 && paneOpen && isDesktop && (
        <aside className="side-panel places-side" id="dtab-side" aria-label={t('filter.filters')}>
          <div className="xrail xpane">
            <div className="xpane-head">
              <h2 className="xpane-count">{t('filter.filters')}</h2>
              {filterCount > 0 && (
                <Button variant="quiet" size="sm" className="xpane-clear" onClick={resetFacets}>
                  {t('filter.clearAll')}
                </Button>
              )}
            </div>
            {renderFacetGroups('all')}
          </div>
        </aside>
      )}

      <div className="places-tab" ref={scrollRef}>
      <div className="places-wrap">
        {/* The outdoor tabs search from their What and Where bar (T593);
            Places' trip library keeps the field. */}
        {!outdoorCat && (headerSlot
          ? createPortal(searchField, headerSlot)
          : (
            <div className="dtab-top">
              {searchField}
            </div>
          ))}
        {/* Under the search row, as on Places (T498), so moving between the
            six never moves the grid. */}
        {/* T586: the six as one row of pills on every width, as on Places. */}
        <div className="dtab-bar xcats-bar">{catTiles}</div>

        <div className={`dtab-panel${outdoorCat ? ' is-outdoor' : ''}${mapOn ? ' is-map' : ''}`} id="dtab-panel" role="tabpanel"
          aria-label={t((CATS.find((c) => c.key === cat) || CATS[0]).labelKey)}>
        {/* T600, the compact head: the pill row, then the What and Where
            bar with the Map or List pill on one row, then the quick filter
            row (All filters, Sort, the quick chips; T602 on every width
            and tab, the trip library too) and the chips that are on, then
            the map or the list. */}
        {/* T622 (owner 2026-10-23: "more compact", "the filters ... need to
            be blended in on top"): the section's title first (desktop; a
            phone reads it from the tab), then the search, the one filter
            row (All filters, Countries, Sort, the quick chips, Full list)
            and the section's quick cuts, all before the first rail. */}
        {sectionHead && !mapOn && <SectionHead title={sectionHead.title} id={`dtab-head-${cat}`} />}

        {/* T966: on a phone the search dock is the Where. */}
        {isDesktop && whereBar}

        {quickBar}

        {topStarters.length > 0 && (
          <nav className="dtab-starters is-top" aria-label={t('dtab.tryOne')}>
            {topStarters.map((st) => (
              <Button key={st.key} variant="secondary" size="sm" className="dtab-starter" data-rail={st.key}
                onClick={st.onPick}>
                {st.title}
              </Button>
            ))}
          </nav>
        )}

        {activeChips.length > 0 && (
          <FilterChips t={t} chips={activeChips} onClearAll={clearAllChips} />
        )}

        {/* A refused or failed location fix, said once, under the field that
            asked for it. Cleared as soon as anything is typed. */}
        {locErr && <p className="places-locate-err" role="status">{locErr}</p>}

        {nearPlace && (() => {
          // The scope ladder: the header is composed from the scope that
          // actually answered, decided by the NEAREST row. "Near Knokke"
          // only ever sits above things that are near Knokke; when the
          // closest result is a day out, or three regions over, the header
          // says so instead. Rows themselves carry band chips, and band
          // rules divide the list, so a far row can never render under a
          // near heading.
          const kmRows = (cat === 'beaches' ? beachRows
            : cat === 'lakes' ? lakeRows
              : cat === 'mountains' ? mountainRows
                : cat === 'trails' ? tripRows
                  : cat === 'trips' ? itinRows
                    : null) || [];
          const scope = scopeForRows(kmRows.map((x) => ({
            km: x.km,
            region: (x.b || x.p || x.tr || (x.c && x.c.tr) || {}).region || null,
          })));
          const head = scope.scope === 'nearby' || scope.scope === 'none'
            ? t('places.nearHead', { city: nearPlace.name })
            : scope.scope === 'day_trip'
              ? t('scope.daytripHead', { city: nearPlace.name })
              : scope.regionName
                ? t('scope.farRegionHead', { city: nearPlace.name, region: scope.regionName })
                // Floored, so "nothing within 84 km" stays true of a
                // nearest row 84.6 km out.
                : t('scope.farHead', { city: nearPlace.name, km: Math.floor(scope.km || 0) });
          return (
            <div className="places-nearhead" data-scope={scope.scope}>
              <span className="places-nearname">{head}</span>
              {nearPlace.sub && <span className="places-nearsub">{nearPlace.sub}</span>}
              <Button variant="quiet" size="sm" className="places-nearclear" onClick={() => setNearPlace(null)}>
                {t('places.clearNear')}
              </Button>
            </div>
          );
        })()}


        {!mapOn && countryBand}

        {/* The country's coasts, ranges and regions that hold this layer,
            as doors to their pages (T489-i). */}
        {layerRegions.length > 0 && !nearPlace && !mapOn && (
          <nav className="dtab-regions" aria-label={t('cpage.regionsHead')}>
            <span className="dtab-regions-h" aria-hidden="true">{t('cpage.regionsHead')}</span>
            {layerRegions.map((r) => (
              <Button key={r.id} variant="secondary" size="sm" onClick={() => onOpenRegion(r.id)}>
                {r.name}
              </Button>
            ))}
          </nav>
        )}

        {/* The trips head (T431) is JourneysSection's own, with the length
            choice beside it. */}

        {/* A section narrowed by a filter keeps its head (T457: Explore keeps
            "Explore Europe" over a filtered list); the rails and the view
            switch step aside while the list is the answer. */}

        {/* No head and no country band (a search, a place to measure from):
            the List | Map switch still has a row of its own (T498). */}

        {/* Trails at rest: the head, then the countries (a walk is ranked
            within its country, so the section opens on them). */}


        {/* The section's opening while it is at rest (T183, rebuilt T428):
            the head, Try one, the rails, the countries; then the list. */}
        {/* In the map view the map is the answer: no head, no rails. */}
        {opening && !mapOn && (
          <>
            <SectionOpening
              layer={opening.layer}
              head={null}
              // T600: the Map or List pill in the Where row is the one view
              // control; the head no longer repeats it as a switch.
              view={null}
              rails={listView || mapOn ? [] : openingRails.rails}
              starters={[]}
              describe={describeRow}
              photo={(row) => photoOf(opening.layer, row)}
              photos={(row) => photosOf(opening.layer, row)}
              onOpen={openFromBand}
              sharedKey={(row) => row.id}
              nearMe={nearMeDoor}
              t={t}
            >

            </SectionOpening>
            {/* Europe-wide trails have no list under them: the countries
                follow. In the Full list view the head names the list. */}
            {!opening.europe && !mapOn && <h2 className="open-gridhead dtab-gridhead" id="dtab-fulllist">{t('open.gridHead')}</h2>}
          </>
        )}

        {!isJourneyBrowse && !mapOn && refineRow}

        {/* Trails and Cycling with no country: the map holds each country's
            best, and says once how to get all of one (T600). */}
        {mapOn && !country && !nearPlace && (cat === 'trails' || cat === 'cycling') && (
          <p className="dtab-mapnote">{t(cat === 'trails' ? 'where.mapTopTrails' : 'where.mapTopRides')}</p>
        )}

        {/* The map view (T498, owner T489-c): the Explore map over this
            list, the lists kept mounted under it so List is instant. It
            fills what is left of the screen (T600). */}
        {mapOn && (
          <OutdoorMap rows={mapRows} onSelect={openMapItem} t={t}
            lines={routeMap?.lines || null}
            pinFig={cat === 'beaches' || cat === 'lakes' || cat === 'mountains' ? 'score' : 'eur'}
            onBack={() => setDview('top')} />
        )}
        <div className="dtab-lists" hidden={mapOn || undefined}>

        {/* Beaches. No country index in front of the list: the tab opens on
            the beaches themselves, ranked across Europe, because "show me a
            beach" is the request and a page of flags is not an answer to it.
            Typing a country's name swaps the capped European ranking for that
            country's full list. */}
        {isBeachCat && (
          <BeachList
            beachFacets={beachFacets} beachRows={beachRows} beachesLoading={beachesLoading}
            bedFood={bedFood} countryEmpty={countryEmpty} countryName={countryName}
            facetEmpty={facetEmpty} layerError={layerError} listedBeaches={listedBeaches}
            nearPlace={nearPlace} queryEmpty={queryEmpty} radiusEmpty={radiusEmpty}
            retryLayer={retryLayer} sentinelRef={sentinelRef} setBeachFacets={setBeachFacets}
            setPageBeach={setPageBeach} t={t} typedCc={typedCc} visible={visible}
            wantBeachCountry={wantBeachCountry}
          />
        )}

        {/* Lakes. Same shape as beaches: no country index in front of the
            list, because "show me a lake" is the request and a page of flags
            is not an answer to it. Typing a country's name swaps the capped
            European ranking for that country's full list. */}
        {isLakeCat && (
          <LakeList
            absentLakeCountry={absentLakeCountry} bedFood={bedFood} countryEmpty={countryEmpty}
            countryName={countryName} facetEmpty={facetEmpty} lakeFacets={lakeFacets}
            lakeIndex={lakeIndex} lakeRows={lakeRows} lakesLoading={lakesLoading} lang={lang}
            layerError={layerError} listedLakes={listedLakes} nearPlace={nearPlace}
            queryEmpty={queryEmpty} radiusEmpty={radiusEmpty} retryLayer={retryLayer}
            sentinelRef={sentinelRef} setLakeFacets={setLakeFacets} setPageLake={setPageLake}
            t={t} travelMonth={travelMonth} typedCc={typedCc} visible={visible}
            wantLakeCountry={wantLakeCountry}
          />
        )}

        {/* Mountains. Same shape as beaches and lakes: no country index in
            front of the list, because "show me a mountain" is the request and
            a page of flags is not an answer to it. Typing a country's name
            swaps the capped European ranking for that country's full list. */}
        {isMountainCat && (
          <MountainList
            absentMountainCountry={absentMountainCountry} bedFood={bedFood}
            countryEmpty={countryEmpty} countryName={countryName} facetEmpty={facetEmpty}
            lang={lang} layerError={layerError} listedMountains={listedMountains}
            mountainRows={mountainRows} mountainsLoading={mountainsLoading}
            mtnFacets={mtnFacets} nearPlace={nearPlace} queryEmpty={queryEmpty}
            radiusEmpty={radiusEmpty} retryLayer={retryLayer} sentinelRef={sentinelRef}
            setMtnFacets={setMtnFacets} setPageMountain={setPageMountain} t={t}
            typedCc={typedCc} visible={visible} wantMountainCountry={wantMountainCountry}
          />
        )}

        {/* Cycling. Tours first, because a tour is the answer to "plan me a
            cycling trip" and a route is the catalogue entry underneath it.
            Listed routes sit under their own heading with no score, which is
            what makes the coverage honest rather than merely large. */}
        {isCycleCat && (
          <CycleList
            bedFood={bedFood} countryEmpty={countryEmpty} countryName={countryName}
            cycleFacets={cycleFacets} cycleIndex={cycleIndex} cycleRows={cycleRows}
            cycleShowLocal={cycleShowLocal} cycleTotal={cycleTotal} cycleWindow={cycleWindow}
            cyclingLoading={cyclingLoading} facetEmpty={facetEmpty} layerError={layerError}
            nearPlace={nearPlace} openCycleRoute={openCycleRoute} openCycleTour={openCycleTour}
            queryEmpty={queryEmpty} radiusEmpty={radiusEmpty} retryLayer={retryLayer}
            sentinelRef={sentinelRef} setCycleFacets={setCycleFacets}
            setCycleShowLocal={setCycleShowLocal} setPageCycle={setPageCycle} t={t}
            typedCc={typedCc} visible={visible} wantCycleCountry={wantCycleCountry}
          />
        )}

        {isJourneyBrowse && (
          <JourneysSection
            q={debouncedQuery}
            country={country}
            view={journeyView}
            onView={setJourneyView}
            onOpen={(card) => setPageJourney({ id: card.id, gw: card.gw || null })}
            onComposed={() => setJourneyView('composed')}
            countryName={countryName}
            geoOf={geoOf}
            onAllCountries={() => { setCountry(''); setQuery(''); }}
            onClearSearch={() => setQuery('')}
            onBack={onPickCategory ? () => onPickCategory('places', country || '') : null}
            backLabel={t('nav.explore')}
            // T602: no side panel holds the library's filters; it carries
            // its own Filters door on every width.
            panelSlot={null}
            isDesktop={isDesktop}
            t={t}
            lang={lang}
          />
        )}

        {isComposedTrips && (
          <Button
            variant="quiet"
            size="sm"
            className="jsec-back jsec-back-solo"
            iconStart={<ArrowLeftIcon size={14} />}
            onClick={() => {
              setJourneyView(null);
              setItinDays(null);
              setItinPace(null);
              setItinScale(null);
            }}
          >
            {t('journey.backStyles')}
          </Button>
        )}

        {isItinCat && (
          <ItineraryList
            chipsEmpty={chipsEmpty} countryEmpty={countryEmpty} itinCountry={itinCountry}
            itinCountryRows={itinCountryRows} itinDays={itinDays} itinPace={itinPace}
            itinRows={itinRows} itinScale={itinScale} itinTop={itinTop} layerError={layerError}
            nearPlace={nearPlace} q={q} radiusEmpty={radiusEmpty} retryLayer={retryLayer}
            sentinelRef={sentinelRef} setItinDays={setItinDays} setItinPace={setItinPace}
            setItinScale={setItinScale} setPageItin={setPageItin} setQuery={setQuery} t={t}
            visible={visible}
          />
        )}

        {isTripCat && !isItinCat && (
          <TrailTripList
            bedFood={bedFood} cat={cat} chipsEmpty={chipsEmpty}
            clearTrailFilters={clearTrailFilters} country={country} countryEmpty={countryEmpty}
            countryName={countryName} facetEmpty={facetEmpty} fmt={fmt} layerError={layerError}
            nearNoCountry={nearNoCountry} nearPlace={nearPlace} openNeighbour={openNeighbour}
            pickCountry={pickCountry} radiusEmpty={radiusEmpty} retryLayer={retryLayer}
            sentinelRef={sentinelRef} setCountry={setCountry} setNearPlace={setNearPlace}
            setPageCard={setPageCard} setPageStub={setPageStub} setQuery={setQuery}
            setStubsAll={setStubsAll} showCountryIndex={showCountryIndex}
            showTripRows={showTripRows} stubs={stubs} stubsAll={stubsAll} t={t}
            trailFiltersOn={trailFiltersOn} trailsCountry={trailsCountry}
            trailsIndex={trailsIndex} trailsLoading={trailsLoading}
            tripCountries={tripCountries} tripRows={tripRows} visible={visible}
          />
        )}

        </div>

        <SourcesFold cat={cat} isComposedTrips={isComposedTrips} sectionHead={sectionHead}
          countries={cat === 'trails' && showCountryIndex ? tripCountries.map((c) => c.cc)
            : (opening && opening.layer !== 'trail' ? countryOptions.map(([cc]) => cc) : (country ? [country] : []))}
          t={t} />
        </div>
      </div>

      {pageCard && (
        <Suspense fallback={null}>
          <TrailPage
            card={pageCard}
            backLabel={returnTo?.label || ''}
            {...favProps('trail', pageCard.tr?.id, pageCard.tr?.cc || pageCard.tr?.country)}
            onAddToDay={onAddToDay ? (f) => onAddToDay('trail', f) : null}
            dests={data?.destinations}
            onOpenNeighbour={openNeighbour}
            onClose={() => setPageCard(null)}
            onSelectDest={(id) => { setPageCard(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageStub && (
        <Suspense fallback={null}>
          <StubPage stub={pageStub} countryName={countryName} onClose={() => setPageStub(null)} />
        </Suspense>
      )}

      {pageJourney && (
        <Suspense fallback={null}>
          <JourneyPage
            id={pageJourney.id}
            backLabel={returnTo?.label || ''}
            {...favProps('journey', pageJourney.id)}
            railFrom={railOrigin(data, origin)}
            stayTier={stayTier}
            stayTiers={stayTiers}
            onChangeStayTier={onChangeStayTier}
            gatewayDest={(() => {
              // The gateway airport code doubles as a catalogue id (BCN,
              // VIE...), which is what lets the page end on a priced CTA.
              const d = pageJourney.gw ? data.destinations[pageJourney.gw] : null;
              // T431: with its position, so the page offers the town's day
              // prices only when the trip starts within 30 km of it.
              return d ? { id: pageJourney.gw, city: d.city, lat: d.city_lat ?? d.lat, lon: d.city_lon ?? d.lon } : null;
            })()}
            onClose={() => setPageJourney(null)}
            onSelectDest={(id) => { setPageJourney(null); onSelectDest(id); }}
            onOpenJourney={(card) => setPageJourney({ id: card.id, gw: card.gw || null })}
          />
        </Suspense>
      )}

      {pageItin && (
        <Suspense fallback={null}>
          <TripPage
            trip={pageItin}
            {...favProps('trip', pageItin.id)}
            data={data}
            onClose={() => setPageItin(null)}
            onOpenInPlanner={onOpenTripInPlanner}
            onSelectDest={(id) => { setPageItin(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageBeach && (
        <>
          {/* Starts the hero's download while the page chunk is still in
              flight (T052); renders nothing when the layer's flag is off. */}
          <HeroPreload layer="beaches" image={pageBeach.images?.[0]} />
          <Suspense fallback={null}>
            <BeachPage
              beach={pageBeach}
              backLabel={returnTo?.label || ''}
              {...favProps('beach', pageBeach.id, pageBeach.cc)}
              onAddToDay={onAddToDay ? (f) => onAddToDay('beach', f) : null}
              onOpenNeighbour={openNeighbour}
              countryName={countryName(pageBeach.cc)}
              model={beachIndex?.model || null}
              onClose={() => setPageBeach(null)}
              onSelectDest={(id) => { setPageBeach(null); onSelectDest(id); }}
            />
          </Suspense>
        </>
      )}

      {pageLake && (
        <>
          {/* Starts the hero's download while the page chunk is still in
              flight (T052); renders nothing when the layer's flag is off. */}
          <HeroPreload layer="lakes" image={pageLake.images?.[0]} />
          <Suspense fallback={null}>
            <LakePage
              lake={pageLake}
              backLabel={returnTo?.label || ''}
              {...favProps('lake', pageLake.id, pageLake.cc)}
              onAddToDay={onAddToDay ? (f) => onAddToDay('lake', f) : null}
              onOpenNeighbour={openNeighbour}
              countryName={countryName(pageLake.cc)}
              warmC={lakeIndex?.model?.warm_c ?? 18}
              onClose={() => setPageLake(null)}
              onSelectDest={(id) => { setPageLake(null); onSelectDest(id); }}
            />
          </Suspense>
        </>
      )}

      {pageCycle && pageCycle.familyRef && (
        <Suspense fallback={null}>
          <CycleFamilyPage
            familyRef={pageCycle.familyRef}
            onClose={() => setPageCycle(null)}
            onOpenRoute={(sec) => setPageCycle({ routeId: sec.id, country: sec.cc })}
          />
        </Suspense>
      )}

      {pageCycle && !pageCycle.familyRef && (
        <Suspense fallback={null}>
          <CyclePage
            routeId={pageCycle.routeId}
            backLabel={returnTo?.label || ''}
            {...favProps('cycle', pageCycle.routeId ?? pageCycle.tourSlug, pageCycle.country)}
            onAddToDay={onAddToDay ? (f) => onAddToDay('cycle', f) : null}
            onSelectDest={(id) => { setPageCycle(null); onSelectDest(id); }}
            onOpenNeighbour={openNeighbour}
            tourSlug={pageCycle.tourSlug}
            country={pageCycle.country}
            countryName={countryName(pageCycle.country)}
            onClose={() => setPageCycle(null)}
          />
        </Suspense>
      )}

      {pageMountain && (
        <>
          {/* Starts the hero's download while the page chunk is still in
              flight (T052); renders nothing when the layer's flag is off. */}
          <HeroPreload layer="mountains" image={pageMountain.images?.[0]} />
          <Suspense fallback={null}>
            <MountainPage
              mountain={pageMountain}
              backLabel={returnTo?.label || ''}
              {...favProps('mountain', pageMountain.id, pageMountain.cc)}
              onAddToDay={onAddToDay ? (f) => onAddToDay('mountain', f) : null}
              onOpenNeighbour={openNeighbour}
              countryName={countryName(pageMountain.cc)}
              onClose={() => setPageMountain(null)}
              onSelectDest={(id) => { setPageMountain(null); onSelectDest(id); }}
            />
          </Suspense>
        </>
      )}

      {/* The one Filters door, holding the country and the same facet groups
          the toolbar shows, so the sheet is the complete set rather than the
          leftovers. */}
      {sheetOpen && (
        <PlacesFilterSheet
          onClose={() => setSheetOpen(false)}
          anchorRef={sheetFrom === 'side' ? null : filterBtnRef}
          groups={facetGroups}
          country={country}
          setCountry={(cc) => { setCountry(cc); setNearPlace(null); }}
          countryOptions={[]}
          activeFilters={activeFilters}
          resetAll={resetAll}
          resultCount={rowCount}
          noun={cat}
        />
      )}
      <SiteFooter />
      </div>
    </div>
  );
}
