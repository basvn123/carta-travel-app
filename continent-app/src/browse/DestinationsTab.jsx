import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { eur } from '../lib/format.js';
import { fareProv, estPrefix, FromWord } from '../components/FareProvenance.jsx';
import { loadTrails, loadTrailsIndex } from '../lib/trails.js';
import { useI18n } from '../i18n/index.jsx';
import { SearchIcon, ChevronRightIcon, RouteIcon } from '../components/Icons.jsx';

/**
 * The Destinations tab: the whole catalogue as a browsable section of its own,
 * reachable from the bottom bar (mobile) and the header tabs (desktop).
 *
 * Two segments share one country filter:
 *   Destinations     every priced place, cheapest first, with a text search
 *   Trips and trails the published trips (hikes, city days) from the content
 *                    lab, browsed by country or by "near this town" search
 *
 * The near-search matches catalogue cities (accent-folded), then loads that
 * city's country file and sorts its trips by distance from the city centre.
 * Trips are published one country at a time, so the search stays inside the
 * matched city's country; a border town will not see the neighbour's trails
 * until that country is published too.
 */

const PAGE = 80;
const NEAR_MAX_ROWS = 80;

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l'); // l-with-stroke does not decompose

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function bboxCentre(bbox) {
  return bbox?.length === 4
    ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
    : null;
}

const hoursText = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};

/** Where a trip sits on the map: the anchor city for a composed city day,
 *  the extent's centre for a drawn trail. */
function tripCentre(tr) {
  if (tr.category === 'citytrip' && tr.anchor?.lat != null) {
    return { lat: tr.anchor.lat, lon: tr.anchor.lon };
  }
  return bboxCentre(tr.bbox);
}

/** One published trip as a list row. Facts only, in the wire's own numbers;
 *  a composed city day is a link to its city, a hike is information. */
function TrailRow({ tr, km, data, onSelectDest, t }) {
  const isCityDay = tr.category === 'citytrip';
  const kindLabel = isCityDay
    ? t('trails.cityDay')
    : (tr.distance_m <= 25000 ? t('trails.dayHike') : t('trails.trail'));
  const diffKey = tr.difficulty === 'easy' ? 'places.diffEasy'
    : tr.difficulty === 'moderate' ? 'places.diffModerate'
      : tr.difficulty === 'hard' ? 'places.diffHard' : null;
  const clickable = isCityDay && tr.anchor?.dest && data.destinations[tr.anchor.dest];
  const Body = (
    <>
      <div className="places-trail-head">
        <span className="places-trail-name">{tr.name}</span>
        {km != null && (
          <span className="places-trail-km">{t('places.kmAway', { km: Math.round(km) })}</span>
        )}
        <span className={`places-trail-kind ${isCityDay ? 'city' : ''}`}>{kindLabel}</span>
        {clickable && <ChevronRightIcon size={14} className="places-row-chev" />}
      </div>
      <div className="places-trail-facts">
        {tr.distance_m != null && (
          <span>{(tr.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km</span>
        )}
        {tr.duration_min != null && <span>{hoursText(tr.duration_min)} h</span>}
        {!isCityDay && tr.ascent_m != null && <span>+{Math.round(tr.ascent_m)} m</span>}
        {isCityDay && tr.n_stops != null && <span>{t('trails.stops', { n: tr.n_stops })}</span>}
        {diffKey && <span>{t(diffKey)}</span>}
      </div>
      {tr.summary && <p className="places-trail-summary">{tr.summary}</p>}
    </>
  );
  return clickable ? (
    <button className="places-trailrow clickable" onClick={() => onSelectDest(tr.anchor.dest)}>
      {Body}
    </button>
  ) : (
    <div className="places-trailrow">{Body}</div>
  );
}

export function DestinationsTab({
  data, pricedAll, priceMode = 'total', availableCountries = [], onSelectDest,
}) {
  const { t, lang } = useI18n();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  const [seg, setSeg] = useState('dests');           // 'dests' | 'trails'
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [country, setCountry] = useState('');        // ISO2 or '' for all
  const [nearDest, setNearDest] = useState(null);    // { id, city, iso2, lat, lon }
  const [visible, setVisible] = useState(PAGE);

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

  // Debounce only the 24.8k-row filter, never the input itself.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  const trailsCountry = nearDest ? nearDest.iso2 : country;
  useEffect(() => {
    if (seg !== 'trails' || !trailsCountry) { setCountryTrips(null); return undefined; }
    let live = true;
    setTrailsLoading(true);
    loadTrails(trailsCountry).then((trips) => {
      if (!live) return;
      setCountryTrips(trips || []);
      setTrailsLoading(false);
    });
    return () => { live = false; };
  }, [seg, trailsCountry]);

  // ISO2 -> display name, from the catalogue first (it matches the rows on
  // screen), the browser's region names for any code the catalogue lacks.
  const countryName = useMemo(() => {
    const map = new Map(availableCountries);
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* older engines */ }
    return (cc) => map.get(cc) || (dn ? dn.of(cc) : cc) || cc;
  }, [availableCountries, lang]);

  // ── Destinations segment ──────────────────────────────────────────────

  const q = useMemo(() => norm(debouncedQuery), [debouncedQuery]);
  const dests = useMemo(() => {
    if (seg !== 'dests') return [];
    return pricedAll.filter((p) => {
      if (country && p.iso2 !== country) return false;
      if (q && !(norm(p.city).includes(q) || norm(p.country).includes(q))) return false;
      return true;
    });
  }, [seg, pricedAll, country, q]);

  // New filter result: collapse the window and go back to the top.
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [dests]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < dests.length ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [dests.length]);

  // ── Trails segment ────────────────────────────────────────────────────

  // City suggestions for the near-search, deduped so London's four gateway
  // entries offer one London.
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

  const suggestions = useMemo(() => {
    if (seg !== 'trails' || !q) return [];
    const starts = [], includes = [];
    for (const d of destIndex) {
      const c = norm(d.city);
      if (c.startsWith(q)) starts.push(d);
      else if (c.includes(q)) includes.push(d);
      if (starts.length >= 6) break;
    }
    return [...starts, ...includes].slice(0, 6);
  }, [seg, q, destIndex]);

  const pickNear = (d) => {
    setNearDest(d);
    setQuery('');
    setCountry('');
  };

  const nearRows = useMemo(() => {
    if (!nearDest || !countryTrips) return null;
    return countryTrips
      .map((tr) => {
        const c = tripCentre(tr);
        return c ? { tr, km: haversineKm(nearDest.lat, nearDest.lon, c.lat, c.lon) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.km - b.km)
      .slice(0, NEAR_MAX_ROWS);
  }, [nearDest, countryTrips]);

  const countryRows = useMemo(() => {
    if (nearDest || !countryTrips) return null;
    // City days first (there are few and they name the place), then the
    // trails from short to long.
    const cityDays = countryTrips.filter((tr) => tr.category === 'citytrip')
      .sort((a, b) => a.name.localeCompare(b.name));
    const hikes = countryTrips.filter((tr) => tr.category !== 'citytrip')
      .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
    return [...cityDays, ...hikes];
  }, [nearDest, countryTrips]);

  const indexCountries = useMemo(() => {
    if (!trailsIndex) return [];
    return [...trailsIndex.countries]
      .map((c) => ({ ...c, name: countryName(c.country) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [trailsIndex, countryName]);

  const trailsTotal = useMemo(
    () => (trailsIndex ? trailsIndex.countries.reduce((s, c) => s + (c.n_trips || 0), 0) : 0),
    [trailsIndex],
  );

  const switchSeg = (next) => {
    if (next === seg) return;
    setSeg(next);
    setQuery('');
    scrollRef.current?.scrollTo?.(0, 0);
  };

  const fmt = (n) => n.toLocaleString(lang);

  const trailRowProps = { data, onSelectDest, t };
  const showTrailRows = seg === 'trails' && !trailsLoading
    && ((nearRows && nearRows.length > 0) || (countryRows && countryRows.length > 0));

  return (
    <div className="places-tab" ref={scrollRef}>
      <div className="places-wrap">
        <h1 className="places-title">{t('places.title')}</h1>
        <p className="places-meta">
          {seg === 'dests'
            ? t('places.metaDests', { n: fmt(pricedAll.length), c: availableCountries.length })
            : (trailsIndex
              ? t('places.metaTrails', { n: fmt(trailsTotal), c: trailsIndex.countries.length })
              : ' ')}
        </p>

        <div className="places-segs" role="tablist">
          <button
            role="tab"
            aria-selected={seg === 'dests'}
            className={`places-seg ${seg === 'dests' ? 'on' : ''}`}
            onClick={() => switchSeg('dests')}
          >
            {t('places.segDests')}
            <span className="places-count">{fmt(pricedAll.length)}</span>
          </button>
          <button
            role="tab"
            aria-selected={seg === 'trails'}
            className={`places-seg ${seg === 'trails' ? 'on' : ''}`}
            onClick={() => switchSeg('trails')}
          >
            <RouteIcon size={14} />
            {t('places.segTrails')}
            {trailsIndex && <span className="places-count">{fmt(trailsTotal)}</span>}
          </button>
        </div>

        <div className="places-controls">
          <div className="places-search">
            <SearchIcon size={15} className="places-search-icon" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={seg === 'dests' ? t('places.searchDest') : t('places.searchTrail')}
              aria-label={seg === 'dests' ? t('places.searchDest') : t('places.searchTrail')}
            />
            {seg === 'trails' && suggestions.length > 0 && (
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
        </div>

        {seg === 'dests' && (
          <div className="places-list">
            {dests.slice(0, visible).map((p) => {
              const prov = fareProv(p.prov || p);
              return (
                <button key={p.id} className="places-row" onClick={() => onSelectDest(p.id)}>
                  <span className="places-row-main">
                    <span className="places-row-city">{p.city}</span>
                    <span className="places-row-sub">
                      <span>{p.country}</span>
                      <RatingBadge rating={p.rating} size="xs" showGem={false} />
                    </span>
                  </span>
                  <span className="places-row-price">
                    {!prov?.est && <FromWord />}
                    {`${estPrefix(prov)}${eur(priceMode === 'pp' ? p.pp : p.total)}`}
                    {priceMode === 'pp' && <small>/pp</small>}
                  </span>
                  <ChevronRightIcon size={15} className="places-row-chev" />
                </button>
              );
            })}
            {dests.length === 0 && <p className="places-empty">{t('places.emptyDest')}</p>}
            {visible < dests.length && (
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            )}
          </div>
        )}

        {seg === 'trails' && (
          <div className="places-list">
            {nearDest && (
              <div className="places-nearhead">
                <span>{t('places.nearHead', { city: nearDest.city })}</span>
                <button className="places-nearclear" onClick={() => setNearDest(null)}>
                  {t('places.clearNear')}
                </button>
              </div>
            )}

            {trailsLoading && <p className="places-empty">{'…'}</p>}

            {!trailsLoading && nearDest && nearRows && (
              nearRows.length > 0
                ? nearRows.map(({ tr, km }) => (
                  <TrailRow key={tr.id} tr={tr} km={km} {...trailRowProps} />
                ))
                : <p className="places-empty">{t('places.noneNear', { city: nearDest.city })}</p>
            )}

            {!trailsLoading && !nearDest && country && countryRows && (
              countryRows.length > 0
                ? countryRows.map((tr) => <TrailRow key={tr.id} tr={tr} {...trailRowProps} />)
                : (
                  <p className="places-empty">
                    {t('places.trailsEmpty', { country: countryName(country) })}
                  </p>
                )
            )}

            {!nearDest && !country && (
              <>
                <p className="places-intro">{t('places.trailsIntro')}</p>
                {indexCountries.map((c) => (
                  <button
                    key={c.country}
                    className="places-cidx-row"
                    onClick={() => { setCountry(c.country); setNearDest(null); }}
                  >
                    <span className="places-cidx-name">{c.name}</span>
                    <span className="places-cidx-count">{t('places.tripsCount', { n: c.n_trips })}</span>
                    <ChevronRightIcon size={15} className="places-row-chev" />
                  </button>
                ))}
              </>
            )}

            {showTrailRows && <p className="places-credit">{t('trails.credit')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
