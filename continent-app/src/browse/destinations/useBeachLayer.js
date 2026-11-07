import { useEffect, useMemo } from 'react';
import { loadBeachIndex, loadTopBeaches, loadBeaches, loadListedBeaches } from '../../lib/beaches.js';
import { norm, NEAR_MAX_ROWS } from './destTabConsts.js';
import { applyBeachFacets, beachFacetCounts } from '../../lib/beachStory.js';
import { haversineKm } from '../../lib/trailCards.js';

export function useBeachLayer({
  beachFacets, beachIndex, country, countryBeaches, countryName, failLayer, isBeachCat,
  layerError, nearPlace, onOpenBeachConsumed, openBeach, q, retryTick, setBeachIndex,
  setBeachesLoading, setCat, setCountryBeaches, setListedBeaches, setNearPlace, setPageBeach,
  setQuery, setTopBeaches, topBeaches,
}) {
  // ── The trips overview map: every listed trip as a pin ────────────────
  //
  // Built from the SAME filtered rows the cards below render, so the country
  // filter, the day rail, the pace chips and a near-search all filter the
  // ── Beaches: the published beach layer ───────────────────────────────

  // Deliberately NOT guarded on beachesLoading, and beachesLoading is
  // deliberately not a dependency. Setting it re-renders, a re-render with it
  // in the dependency list re-runs the effect, the cleanup marks the first
  // fetch stale, and the reply that arrives is thrown away by a run that has
  // already returned early: the list would sit on its loading dots forever.
  // `topBeaches` is the only thing that says the work is done.
  useEffect(() => {
    if (!isBeachCat || topBeaches || layerError.beaches) return undefined;
    let live = true;
    setBeachesLoading(true);
    Promise.all([loadBeachIndex(), loadTopBeaches()]).then(([idx, top]) => {
      if (!live) return;
      setBeachIndex(idx);
      setTopBeaches(top || []);
      setBeachesLoading(false);
    }).catch((e) => {
      if (!live) return;
      setBeachesLoading(false);
      failLayer('beaches')(e);
    });
    return () => { live = false; };
  }, [isBeachCat, topBeaches, layerError.beaches, retryTick, failLayer, setBeachesLoading, setBeachIndex, setTopBeaches]);

  // Which countries have beaches at all. The tab never offers one that does
  // not: the export gate decides, so Andorra cannot appear here by having a
  // trip published in it, which is exactly how it used to.
  const beachCountries = useMemo(() => {
    const set = new Set((beachIndex?.countries || []).map((c) => c.cc));
    return set;
  }, [beachIndex]);

  // The country a typed word points at, so "croatia" or "HR" widens the list
  // from the capped European ranking to all 120 Croatian beaches. This is what
  // replaces the country dropdown on this tab.
  const queryCountry = useMemo(() => {
    if (!isBeachCat || !q || q.length < 2) return null;
    for (const cc of beachCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isBeachCat, q, beachCountries, countryName]);

  // Full country files are pulled in only when something asks for one: the
  // country picked in the toolbar, one named in the search, or the country a
  // searched address sits in.
  const wantBeachCountry = (country && beachCountries.has(country) ? country : null)
    || queryCountry
    || (nearPlace && beachCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isBeachCat || !wantBeachCountry || countryBeaches[wantBeachCountry]
      || layerError.beaches) return undefined;
    let live = true;
    Promise.all([
      loadBeaches(wantBeachCountry),
      loadListedBeaches(wantBeachCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryBeaches((cur) => ({ ...cur, [wantBeachCountry]: rows || [] }));
      setListedBeaches((cur) => ({ ...cur, [wantBeachCountry]: listed || [] }));
    }).catch((e) => { if (live) failLayer('beaches')(e); });
    return () => { live = false; };
  }, [isBeachCat, wantBeachCountry, countryBeaches, layerError.beaches, retryTick, failLayer, setCountryBeaches, setListedBeaches]);

  const beachRows = useMemo(() => {
    if (!isBeachCat || !topBeaches) return null;
    // One country asked for wins outright: its own file is the complete list
    // for that country, where the European ranking only ever held its best.
    const loaded = wantBeachCountry ? countryBeaches[wantBeachCountry] : null;
    let pool = loaded || topBeaches;
    // Measuring from an address is the one case where the country file is not
    // the whole answer: a beach 30 km away can be over a border, and "nearest
    // beaches to here" that stops at customs is a worse answer than a longer
    // list. The European ranking is folded in, deduped by id.
    if (loaded && nearPlace) {
      const have = new Set(loaded.map((b) => b.id));
      pool = [...loaded, ...topBeaches.filter((b) => !have.has(b.id))];
    }
    let rows = applyBeachFacets(pool, beachFacets);
    if (q && !queryCountry) {
      rows = rows.filter((b) => norm(b.name).includes(q)
        || norm(b.nameLocal || '').includes(q)
        || norm(b.region || '').includes(q)
        || norm(countryName(b.cc)).includes(q));
    }
    if (nearPlace) {
      return rows
        .map((b) => ({ b, km: haversineKm(nearPlace.lat, nearPlace.lon, b.lat, b.lon) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((b) => ({ b, km: null }));
  }, [isBeachCat, topBeaches, countryBeaches, wantBeachCountry, q, queryCountry,
    nearPlace, countryName, beachFacets]);

  const beachCounts = useMemo(() => beachFacetCounts(
    (wantBeachCountry ? countryBeaches[wantBeachCountry] : null) || topBeaches,
    beachFacets,
  ), [topBeaches, countryBeaches, wantBeachCountry, beachFacets]);

  // A shared #beach= link, opened once its country file has landed.
  useEffect(() => {
    if (!openBeach) return;
    setCat('beaches');
    setQuery('');
    setNearPlace(null);
    loadBeaches(openBeach.cc).then((rows) => {
      const hit = (rows || []).find((b) => b.id === openBeach.id);
      if (hit) setPageBeach(hit);
      setCountryBeaches((cur) => ({ ...cur, [openBeach.cc]: rows || [] }));
    }).catch(failLayer('beaches'));
    onOpenBeachConsumed?.();
  }, [openBeach, onOpenBeachConsumed, failLayer, setCat, setQuery, setNearPlace, setPageBeach, setCountryBeaches]);
  return { wantBeachCountry, beachRows, beachCounts };
}
