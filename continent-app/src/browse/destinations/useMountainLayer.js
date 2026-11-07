import { useEffect, useMemo } from 'react';
import { loadMountainIndex, loadTopMountains, loadMountains, loadListedMountains } from '../../lib/mountains.js';
import { norm, NEAR_MAX_ROWS } from './destTabConsts.js';
import { applyMountainFacets, mountainFacetCounts } from '../../lib/mountainStory.js';
import { haversineKm } from '../../lib/trailCards.js';

export function useMountainLayer({
  country, countryMountains, countryName, failLayer, isMountainCat, layerError, mountainIndex,
  mtnFacets, nearPlace, q, retryTick, setCountryMountains, setListedMountains, setMountainIndex,
  setMountainsLoading, setTopMountains, topMountains,
}) {
  // ── Mountains: the published mountain layer ──────────────────────────
  //
  // Third layer, third time this shape, and the same trap avoided the same
  // way: `topMountains` is what says the work is done, never the loading flag.
  useEffect(() => {
    if (!isMountainCat || topMountains || layerError.mountains) return undefined;
    let live = true;
    setMountainsLoading(true);
    Promise.all([loadMountainIndex(), loadTopMountains()]).then(([idx, top]) => {
      if (!live) return;
      setMountainIndex(idx);
      setTopMountains(top || []);
      setMountainsLoading(false);
    }).catch((e) => {
      if (!live) return;
      setMountainsLoading(false);
      failLayer('mountains')(e);
    });
    return () => { live = false; };
  }, [isMountainCat, topMountains, layerError.mountains, retryTick, failLayer, setMountainsLoading, setMountainIndex, setTopMountains]);

  const mountainCountries = useMemo(
    () => new Set((mountainIndex?.countries || []).map((c) => c.cc)),
    [mountainIndex],
  );

  const queryMountainCountry = useMemo(() => {
    if (!isMountainCat || !q || q.length < 2) return null;
    for (const cc of mountainCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isMountainCat, q, mountainCountries, countryName]);

  const wantMountainCountry = (country && mountainCountries.has(country) ? country : null)
    || queryMountainCountry
    || (nearPlace && mountainCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isMountainCat || !wantMountainCountry
      || countryMountains[wantMountainCountry] || layerError.mountains) return undefined;
    let live = true;
    Promise.all([
      loadMountains(wantMountainCountry),
      loadListedMountains(wantMountainCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryMountains((cur) => ({ ...cur, [wantMountainCountry]: rows || [] }));
      setListedMountains((cur) => ({ ...cur, [wantMountainCountry]: listed || [] }));
    }).catch((e) => { if (live) failLayer('mountains')(e); });
    return () => { live = false; };
  }, [isMountainCat, wantMountainCountry, countryMountains, layerError.mountains, retryTick, failLayer, setCountryMountains, setListedMountains]);

  const mountainRows = useMemo(() => {
    if (!isMountainCat || !topMountains) return null;
    const loaded = wantMountainCountry ? countryMountains[wantMountainCountry] : null;
    let pool = loaded || topMountains;
    // Measuring from an address is the one case where the country file is not
    // the whole answer: a border summit sits in two countries and a
    // nearest-first list that stops at customs is a worse answer.
    if (loaded && nearPlace) {
      const have = new Set(loaded.map((m) => m.id));
      pool = [...loaded, ...topMountains.filter((m) => !have.has(m.id))];
    }
    let rows = applyMountainFacets(pool, mtnFacets);
    if (q && !queryMountainCountry) {
      rows = rows.filter((m) => norm(m.name).includes(q)
        || norm(m.nameLocal || '').includes(q)
        || norm(m.range || '').includes(q)
        || norm(countryName(m.cc)).includes(q));
    }
    if (nearPlace) {
      return rows
        .map((m) => ({ b: m, km: haversineKm(nearPlace.lat, nearPlace.lon, m.lat, m.lon) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((m) => ({ b: m, km: null }));
  }, [isMountainCat, topMountains, countryMountains, wantMountainCountry, q,
    queryMountainCountry, nearPlace, countryName, mtnFacets]);

  const mtnCounts = useMemo(() => mountainFacetCounts(
    (wantMountainCountry ? countryMountains[wantMountainCountry] : null) || topMountains,
    mtnFacets,
  ), [topMountains, countryMountains, wantMountainCountry, mtnFacets]);
  return { wantMountainCountry, mountainRows, mtnCounts };
}
