import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { eur } from '../lib/format.js';
import { fareProv, estPrefix, FromWord } from '../components/FareProvenance.jsx';
import { loadTrails, loadTrailsIndex } from '../lib/trails.js';
import { associateTrip, haversineKm, tripCentre, tripKindKey, tripThemes } from '../lib/trailCards.js';
import { useI18n } from '../i18n/index.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';
import {
  SearchIcon, ChevronRightIcon, RouteIcon, SkylineIcon, SuitcaseIcon, BootIcon,
  BeachIcon, MountainIcon, BedIcon,
  CityIcon, TownIcon, VillageIcon, AreaIcon,
} from '../components/Icons.jsx';

/**
 * The Destinations tab: the whole catalogue and every published trip as a
 * browsable section of its own, reachable from the bottom bar (mobile) and
 * the header tabs (desktop).
 *
 * Five categories share one search, one country filter and one sort row:
 *   General    every priced place as a photo card, and a country index of
 *              flag cards when nothing is filtered yet
 *   Trips      composed city days from the content lab
 *   Trails     drawn hikes from the content lab
 *   Beaches    the beach-flavoured slice of both
 *   Mountains  the mountain-flavoured slice of both
 *
 * The wire carries route data only; photos, ratings and prices are joined
 * client-side from the catalogue (lib/trailCards.js). Trips are published one
 * country at a time, so the four trip categories browse country first: flag
 * cards from the index until a country (or a near-city search) is picked.
 * Tapping any trip opens the TrailPage: the route on a real map, what to
 * expect, the exports, and live following.
 *
 * Trails are the one category that carries no price and no rating, so the
 * price-shaped chrome is not shown for it: no rating/price/A-Z sort, no
 * priced-from origin, no stay tier. Controls that cannot change anything on
 * screen only suggest the numbers exist somewhere.
 */

const PAGE = 36;
const NEAR_MAX_ROWS = 80;

// Lazy: the page imports maplibre-gl, which stays out of the main bundle.
const TrailPage = lazy(() => import('./TrailPage.jsx').then((m) => ({ default: m.TrailPage })));

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l'); // l-with-stroke does not decompose

const hoursText = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};

const CATS = [
  { key: 'general', Icon: SkylineIcon, labelKey: 'places.catGeneral' },
  { key: 'trips', Icon: SuitcaseIcon, labelKey: 'places.catTrips' },
  { key: 'trails', Icon: BootIcon, labelKey: 'places.catTrails' },
  { key: 'beaches', Icon: BeachIcon, labelKey: 'places.catBeaches' },
  { key: 'mountains', Icon: MountainIcon, labelKey: 'places.catMountains' },
];

/**
 * Place classes, in rising order of size (dest.place.class, written by
 * place_layer.py). The rail exists to answer the question the rating cannot:
 * a traveller looking at 1,570 priced places needs to know which ones are a
 * base and which ones are an afternoon, and "Bruges 8.8" does not say.
 *
 * `metro` is folded into `city` here. Five sizes is a taxonomy; four chips is
 * a decision, and nobody browsing has ever needed to separate a 300,000-person
 * city from a 90,000-person one before choosing where to sleep.
 */
const CLASSES = [
  { key: 'city', Icon: CityIcon, labelKey: 'places.classCity', match: ['city', 'metro'] },
  { key: 'town', Icon: TownIcon, labelKey: 'places.classTown', match: ['town'] },
  { key: 'village', Icon: VillageIcon, labelKey: 'places.classVillage', match: ['village'] },
  { key: 'area', Icon: AreaIcon, labelKey: 'places.classArea', match: ['area'] },
];
const CLASS_OF = new Map(CLASSES.flatMap((c) => c.match.map((m) => [m, c.key])));

const SORTS = [
  { key: 'rating', labelKey: 'places.sortRating', defaultDir: -1 },
  { key: 'price', labelKey: 'places.sortPrice', defaultDir: 1 },
  { key: 'az', labelKey: 'places.sortAZ', defaultDir: 1 },
];

/** One catalogue place as a photo card: hero image, name, rating, from-price.
 *  The size glyph rides in the corner so the distinction the rail filters on
 *  is still readable once you have stopped filtering and started scrolling. */
function DestCard({ p, km, priceMode, onSelect, t }) {
  const prov = fareProv(p.prov || p);
  const cls = CLASSES.find((c) => c.key === CLASS_OF.get(p.place?.class));
  return (
    <button className="places-dcard" onClick={() => onSelect(p.id)}>
      {p.image
        ? <img className="places-card-img" src={p.image} alt="" loading="lazy" />
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
      )}
      {cls && (
        <span className="places-card-class" role="img" aria-label={t(cls.labelKey)}>
          <cls.Icon size={14} />
        </span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{p.city}</span>
          <span className="places-card-sub">
            <span>{p.country}</span>
            <RatingBadge rating={p.rating} size="xs" showGem={false} />
          </span>
        </span>
        <span className="places-card-right">
          <span className="places-card-price">
            {!prov?.est && <FromWord />}
            {`${estPrefix(prov)}${eur(priceMode === 'pp' ? p.pp : p.total)}`}
            {priceMode === 'pp' && <small>/pp</small>}
          </span>
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/**
 * One published trip as a photo card: the name, the measured facts, the kind.
 *
 * No description here. The wire's summary was clamped to two lines and broke
 * mid-sentence on every card, which reads as a bug rather than a teaser; the
 * whole explanation now lives on the trail page, one tap away.
 */
function TripCard({ card, km, onOpen, t }) {
  const { tr, assoc, kindKey, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const diffKey = tr.difficulty === 'easy' ? 'places.diffEasy'
    : tr.difficulty === 'moderate' ? 'places.diffModerate'
      : tr.difficulty === 'hard' ? 'places.diffHard' : null;
  return (
    <button className="places-tcard" onClick={() => onOpen(card)}>
      {assoc.photoUrl
        ? <img className="places-card-img" src={assoc.photoUrl} alt="" loading="lazy" />
        : (
          <span className="places-card-img places-card-noimg" aria-hidden="true">
            <RouteIcon size={26} />
          </span>
        )}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{tr.name}</span>
          <span className="places-card-facts">
            {tr.distance_m != null && (
              <span>{(tr.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km</span>
            )}
            {tr.duration_min != null && <span>{hoursText(tr.duration_min)} h</span>}
            {isCityDay && tr.n_stops != null && <span>{t('trails.stops', { n: tr.n_stops })}</span>}
            {!isCityDay && tr.ascent_m != null && <span>+{Math.round(tr.ascent_m)} m</span>}
          </span>
          <span className={`places-card-kind ${isCityDay ? 'city' : ''}`}>{t(kindKey)}</span>
        </span>
        <span className="places-card-right">
          {isCityDay && assoc.dest?.rating && (
            <RatingBadge rating={assoc.dest.rating} size="xs" showGem={false} />
          )}
          {!isCityDay && diffKey && (
            <span className="places-card-diff">{t(diffKey)}</span>
          )}
          {isCityDay && price && (
            <span className="places-card-price">
              <FromWord />
              {eur(price.pp)}
              <small>/pp</small>
            </span>
          )}
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/** One country as a photo card: its best-rated place as the cover, the flag
 *  small beside the name. Real photography, never a stretched flag. */
function CountryCard({ cc, name, sub, img, onPick }) {
  return (
    <button className="places-ccard" onClick={() => onPick(cc)}>
      {img
        ? <img className="places-card-img" src={img} alt="" loading="lazy" />
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">
            <CountryFlag country={cc} size={13} className="places-card-flag" />
            {name}
          </span>
          <span className="places-card-sub"><span>{sub}</span></span>
        </span>
        <span className="places-card-right">
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

export function DestinationsTab({
  data, pricedAll, priceMode = 'total', availableCountries = [], onSelectDest,
  stayTier = 'home', onOpenLifestyle,
  origin, onChangeOrigin, transportMode = 'plane', driveHome = null, onChangeDriveHome,
  openTrail = null, onOpenTrailConsumed,
}) {
  const { t, lang } = useI18n();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  const [cat, setCat] = useState('general');         // CATS key
  const [classes, setClasses] = useState([]);        // CLASSES keys, [] = all sizes
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [country, setCountry] = useState('');        // ISO2 or '' for all
  const [nearDest, setNearDest] = useState(null);    // { id, city, iso2, lat, lon }
  const [sort, setSort] = useState({ key: 'rating', dir: -1 });
  const [visible, setVisible] = useState(PAGE);
  const [pageCard, setPageCard] = useState(null);    // enriched trip card or null
  // A shared #trail= link: { id, country } until the country file has loaded
  // and the card it names can be opened.
  const [wantedTrail, setWantedTrail] = useState(null);

  // Trails data: the country index (which countries have anything), and the
  // one country file the current selection needs.
  const [trailsIndex, setTrailsIndex] = useState(null);
  const [countryTrips, setCountryTrips] = useState(null);
  const [trailsLoading, setTrailsLoading] = useState(false);

  useEffect(() => {
    let live = true;
    loadTrailsIndex().then((idx) => { if (live) setTrailsIndex(idx); });
    return () => { live = false; };
  }, []);

  // A shared link names one trip in one country: browse that country's trails
  // so the card exists, then open its page (below, once the file has landed).
  useEffect(() => {
    if (!openTrail) return;
    setCat('trails');
    setQuery('');
    setNearDest(null);
    setCountry(openTrail.country);
    setWantedTrail(openTrail);
    onOpenTrailConsumed?.();
  }, [openTrail, onOpenTrailConsumed]);

  // Debounce only the 24.8k-row filter, never the input itself.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  const isTripCat = cat !== 'general';
  const trailsCountry = nearDest ? nearDest.iso2 : country;
  useEffect(() => {
    if (!isTripCat || !trailsCountry) { setCountryTrips(null); return undefined; }
    let live = true;
    setTrailsLoading(true);
    loadTrails(trailsCountry).then((trips) => {
      if (!live) return;
      setCountryTrips(trips || []);
      setTrailsLoading(false);
    });
    return () => { live = false; };
  }, [isTripCat, trailsCountry]);

  // ISO2 -> display name, from the catalogue first (it matches the rows on
  // screen), the browser's region names for any code the catalogue lacks.
  const countryName = useMemo(() => {
    const map = new Map(availableCountries);
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* older engines */ }
    return (cc) => map.get(cc) || (dn ? dn.of(cc) : cc) || cc;
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

  const priceById = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) m.set(p.id, p);
    return m;
  }, [pricedAll]);

  // Country card covers: the best-rated place of each country supplies the
  // photo, so the index shows real photography rather than a stretched flag.
  const countryCover = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) {
      if (!p.image) continue;
      const score = p.rating?.score ?? 0;
      const cur = m.get(p.iso2);
      if (!cur || score > cur.score) m.set(p.iso2, { img: p.image, score });
    }
    return m;
  }, [pricedAll]);

  const q = useMemo(() => norm(debouncedQuery), [debouncedQuery]);

  const suggestions = useMemo(() => {
    if (!q) return [];
    const starts = [], includes = [];
    for (const d of destIndex) {
      const c = norm(d.city);
      if (c.startsWith(q)) starts.push(d);
      else if (c.includes(q)) includes.push(d);
      if (starts.length >= 6) break;
    }
    return [...starts, ...includes].slice(0, 6);
  }, [q, destIndex]);

  const pickNear = (d) => {
    setNearDest(d);
    setQuery('');
    setCountry('');
  };

  // ── General: the priced catalogue ─────────────────────────────────────

  const destRows = useMemo(() => {
    if (cat !== 'general') return [];
    const wantClass = classes.length ? new Set(classes) : null;
    const filtered = pricedAll.filter((p) => {
      if (country && p.iso2 !== country) return false;
      if (q && !(norm(p.city).includes(q) || norm(p.country).includes(q))) return false;
      // A destination with no place block predates the class layer, so it is
      // shown under every size rather than hidden by a filter it never saw.
      if (wantClass && p.place?.class && !wantClass.has(CLASS_OF.get(p.place.class))) return false;
      return true;
    });
    if (nearDest) {
      return filtered
        .map((p) => ({ p, km: haversineKm(nearDest.lat, nearDest.lon, p.lat, p.lon) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    const rows = filtered.map((p) => ({ p, km: null }));
    const dir = sort.dir;
    if (sort.key === 'rating') {
      rows.sort((a, b) => dir * ((a.p.rating?.score ?? -1) - (b.p.rating?.score ?? -1)));
    } else if (sort.key === 'price') {
      const v = (p) => (priceMode === 'pp' ? p.pp : p.total) ?? Infinity;
      rows.sort((a, b) => dir * (v(a.p) - v(b.p)));
    } else {
      rows.sort((a, b) => dir * a.p.city.localeCompare(b.p.city));
    }
    return rows;
  }, [cat, pricedAll, country, q, nearDest, sort, priceMode, classes]);

  // How many places each size holds under the country/search filter, so a chip
  // can say "42" and can grey itself out rather than leading to an empty list.
  const classCounts = useMemo(() => {
    if (cat !== 'general') return null;
    const counts = new Map(CLASSES.map((c) => [c.key, 0]));
    for (const p of pricedAll) {
      if (country && p.iso2 !== country) continue;
      if (q && !(norm(p.city).includes(q) || norm(p.country).includes(q))) continue;
      const key = CLASS_OF.get(p.place?.class);
      if (key) counts.set(key, counts.get(key) + 1);
    }
    return counts;
  }, [cat, pricedAll, country, q]);

  // The country index for General: every priced country as a flag card.
  const generalCountries = useMemo(() => {
    if (cat !== 'general') return [];
    const agg = new Map();
    for (const p of pricedAll) {
      const a = agg.get(p.iso2) || { n: 0, min: Infinity };
      a.n += 1;
      const v = priceMode === 'pp' ? p.pp : p.total;
      if (v != null && v < a.min) a.min = v;
      agg.set(p.iso2, a);
    }
    return availableCountries
      .map(([cc, name]) => ({ cc, name, ...agg.get(cc) }))
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cat, pricedAll, availableCountries, priceMode]);

  // ── Trip categories: the published wire, joined to the catalogue ──────

  const tripCards = useMemo(() => {
    if (!isTripCat || !countryTrips) return null;
    return countryTrips.map((tr) => {
      const assoc = associateTrip(tr, data.destinations, destIndex);
      return {
        tr,
        assoc,
        kindKey: tripKindKey(tr, assoc.dest),
        themes: tripThemes(tr, assoc.dest),
        price: assoc.destId ? priceById.get(assoc.destId) || null : null,
      };
    });
  }, [isTripCat, countryTrips, data, destIndex, priceById]);

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

  const tripRows = useMemo(() => {
    if (!tripCards) return null;
    let rows = tripCards.filter((c) => (
      cat === 'trips' ? c.tr.category === 'citytrip'
        : cat === 'trails' ? c.tr.category !== 'citytrip'
          : cat === 'beaches' ? c.themes.has('beach')
            : c.themes.has('mountains')
    ));
    if (q) rows = rows.filter((c) => norm(c.tr.name).includes(q));
    if (nearDest) {
      return rows
        .map((c) => {
          const ctr = tripCentre(c.tr);
          return ctr ? { c, km: haversineKm(nearDest.lat, nearDest.lon, ctr.lat, ctr.lon) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    const dir = sort.dir;
    const out = rows.map((c) => ({ c, km: null }));
    // Trails keep the order the wire published them in, which is the lab's own
    // quality score, highest first (export_wire.py). There are no price or
    // rating chips over this list to say otherwise.
    if (cat === 'trails') return out;
    if (sort.key === 'rating') {
      out.sort((a, b) => dir * ((a.c.assoc.dest?.rating?.score ?? -1) - (b.c.assoc.dest?.rating?.score ?? -1)));
    } else if (sort.key === 'price') {
      const v = (c) => c.price?.pp ?? Infinity;
      out.sort((a, b) => dir * (v(a.c) - v(b.c)));
    } else {
      out.sort((a, b) => dir * a.c.tr.name.localeCompare(b.c.tr.name));
    }
    return out;
  }, [tripCards, cat, q, nearDest, sort]);

  // The country index for trip categories: published countries as flag cards.
  const tripCountries = useMemo(() => {
    if (!isTripCat || !trailsIndex) return [];
    return trailsIndex.countries
      .map((c) => {
        const n = cat === 'trips' ? (c.counts?.citytrip || 0)
          : cat === 'trails' ? (c.counts?.hike || 0)
            : c.n_trips;
        return { cc: c.country, name: countryName(c.country), n };
      })
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isTripCat, trailsIndex, cat, countryName]);

  // New filter result: collapse the window and go back to the top.
  const rowCount = cat === 'general' ? destRows.length : (tripRows?.length ?? 0);
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [cat, country, q, nearDest, sort, classes]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < rowCount ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rowCount]);

  const switchCat = (next) => {
    if (next === cat) return;
    setCat(next);
    setQuery('');
    setClasses([]);
    scrollRef.current?.scrollTo?.(0, 0);
  };

  const toggleClass = (key) => {
    setClasses((cur) => (cur.includes(key)
      ? cur.filter((k) => k !== key)
      : [...cur, key]));
  };

  const toggleSort = (key) => {
    setSort((s) => (s.key === key
      ? { key, dir: -s.dir }
      : { key, dir: SORTS.find((x) => x.key === key).defaultDir }));
  };

  const fmt = (n) => n.toLocaleString(lang);

  const showCountryIndex = !q && !country && !nearDest;
  const showTripRows = isTripCat && !trailsLoading && tripRows && tripRows.length > 0;
  // Trails carry no price and no rating: a hike is free and is not scored, so
  // the origin, the stay tier and the rating/price/A-Z sorts have nothing to
  // act on here. Distance from a searched city still orders them.
  const showPriceChrome = cat !== 'trails';

  return (
    <div className="places-tab" ref={scrollRef}>
      <div className="places-wrap">
        <div className="places-cats" role="tablist">
          {CATS.map(({ key, Icon, labelKey }) => (
            <button
              key={key}
              role="tab"
              aria-selected={cat === key}
              className={`places-cat ${cat === key ? 'on' : ''}`}
              onClick={() => switchCat(key)}
            >
              <Icon size={17} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>

        <div className="places-controls">
          <div className="places-search">
            <SearchIcon size={15} className="places-search-icon" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('places.searchDest')}
              aria-label={t('places.searchDest')}
            />
            {suggestions.length > 0 && (
              <div className="places-sugg" role="listbox">
                {suggestions.map((d) => (
                  <button key={d.id} className="places-sugg-item" onClick={() => pickNear(d)}>
                    <span className="places-sugg-city">{d.city}</span>
                    <span className="places-sugg-country">{d.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select
            className="places-country"
            value={country}
            onChange={(e) => { setCountry(e.target.value); setNearDest(null); }}
            aria-label={t('places.allCountries')}
          >
            <option value="">{t('places.allCountries')}</option>
            {availableCountries.map(([cc, name]) => (
              <option key={cc} value={cc}>{name}</option>
            ))}
          </select>
          {/* Where the trip starts: the flight (or the drive) is the biggest
              line in every price on this tab, and it changes with the airport,
              so the origin these figures were priced from is named here and
              switchable without a trip to the map. */}
          {showPriceChrome && onChangeOrigin && (
            <OriginPicker
              data={data}
              origin={origin}
              onChangeOrigin={onChangeOrigin}
              mode={transportMode === 'car' ? 'car' : 'plane'}
              driveHome={driveHome}
              onChangeDriveHome={onChangeDriveHome}
              fromLabel={t('places.pricedFrom')}
            />
          )}
          {/* Every price on this tab is a whole trip at the traveller's own
              stay tier, so the tier it was priced at belongs on screen beside
              the numbers, and one tap opens the panel that changes it. */}
          {showPriceChrome && onOpenLifestyle && (
            <button
              type="button"
              className="places-lifestyle"
              onClick={onOpenLifestyle}
              title={t('filter.setLifestyleTitle')}
            >
              <BedIcon size={15} />
              <span className="places-lifestyle-label">{t('filter.lifestyle')}</span>
              <b>{t(`stay.${stayTier}`)}</b>
            </button>
          )}
        </div>

        {/* Size rail. Sits above the sorts because it changes WHICH places are
            on screen, where the sorts only change their order. Hidden on the
            country index, where there are no places to size yet. */}
        {cat === 'general' && !showCountryIndex && classCounts && (
          <div className="places-classes" role="group" aria-label={t('places.classLabel')}>
            {CLASSES.map(({ key, Icon, labelKey }) => {
              const n = classCounts.get(key) || 0;
              const on = classes.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`places-class ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  disabled={!n && !on}
                  onClick={() => toggleClass(key)}
                >
                  <span className="places-class-dot" aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className="places-class-label">{t(labelKey)}</span>
                  <span className="places-class-n">{fmt(n)}</span>
                </button>
              );
            })}
          </div>
        )}

        {!showCountryIndex && showPriceChrome && (
          <div className="places-sorts" role="group" aria-label={t('places.sortLabel')}>
            {SORTS.map(({ key, labelKey }) => (
              <button
                key={key}
                className={`places-sort ${!nearDest && sort.key === key ? 'on' : ''}`}
                onClick={() => { setNearDest(null); toggleSort(key); }}
              >
                {t(labelKey)}
                {!nearDest && sort.key === key && (
                  <span className="places-sort-dir">{sort.dir === 1 ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {nearDest && (
          <div className="places-nearhead">
            <span>{t('places.nearHead', { city: nearDest.city })}</span>
            <button className="places-nearclear" onClick={() => setNearDest(null)}>
              {t('places.clearNear')}
            </button>
          </div>
        )}

        {cat === 'general' && (
          <div className="places-list">
            {showCountryIndex
              ? generalCountries.map((c) => (
                <CountryCard
                  key={c.cc}
                  cc={c.cc}
                  name={c.name}
                  sub={`${t('places.placesCount', { n: fmt(c.n) })}${Number.isFinite(c.min) ? `, ${t('places.fromPrice', { price: eur(c.min) })}` : ''}`}
                  img={countryCover.get(c.cc)?.img || null}
                  onPick={(cc) => setCountry(cc)}
                />
              ))
              : (
                <>
                  {destRows.slice(0, visible).map(({ p, km }) => (
                    <DestCard key={p.id} p={p} km={km} priceMode={priceMode} onSelect={onSelectDest} t={t} />
                  ))}
                  {destRows.length === 0 && <p className="places-empty">{t('places.emptyDest')}</p>}
                </>
              )}
            {visible < destRows.length && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}
          </div>
        )}

        {isTripCat && (
          <div className="places-list">
            {showCountryIndex && (
              <>
                {tripCountries.map((c) => (
                  <CountryCard
                    key={c.cc}
                    cc={c.cc}
                    name={c.name}
                    sub={t('places.tripsCount', { n: fmt(c.n) })}
                    img={countryCover.get(c.cc)?.img || null}
                    onPick={(cc) => setCountry(cc)}
                  />
                ))}
                {trailsIndex && tripCountries.length === 0 && (
                  <p className="places-empty">{t('places.catEmpty')}</p>
                )}
              </>
            )}

            {!showCountryIndex && trailsLoading && <p className="places-empty">{'…'}</p>}

            {!showCountryIndex && !trailsLoading && tripRows && (
              tripRows.length > 0
                ? tripRows.slice(0, visible).map(({ c, km }) => (
                  <TripCard key={c.tr.id} card={c} km={km} onOpen={setPageCard} t={t} />
                ))
                : (
                  <p className="places-empty">
                    {nearDest
                      ? t('places.noneNear', { city: nearDest.city })
                      : t('places.trailsEmpty', { country: countryName(trailsCountry || country) })}
                  </p>
                )
            )}

            {!showCountryIndex && visible < (tripRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {showTripRows && <p className="places-credit">{t('trails.credit')}</p>}
          </div>
        )}
      </div>

      {pageCard && (
        <Suspense fallback={null}>
          <TrailPage
            card={pageCard}
            onClose={() => setPageCard(null)}
            onSelectDest={(id) => { setPageCard(null); onSelectDest(id); }}
          />
        </Suspense>
      )}
    </div>
  );
}
