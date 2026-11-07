import { useEffect, useMemo } from 'react';
import { loadLakeIndex, loadTopLakes, loadLakes, loadListedLakes } from '../../lib/lakes.js';
import { norm, NEAR_MAX_ROWS } from './destTabConsts.js';
import { applyLakeFacets, lakeFacetCounts } from '../../lib/lakeStory.js';
import { haversineKm } from '../../lib/trailCards.js';

export function useLakeLayer({
  country, countryLakes, countryName, failLayer, isLakeCat, lakeFacets, lakeIndex, layerError,
  nearPlace, onOpenLakeConsumed, openLake, q, retryTick, setCat, setCountryLakes, setLakeIndex,
  setLakesLoading, setListedLakes, setNearPlace, setPageLake, setQuery, setTopLakes, topLakes,
}) {
  // ── Lakes: the published lake layer ──────────────────────────────────
  //
  // The same three-artifact shape as beaches above, and the same trap avoided
  // the same way: `topLakes` is what says the work is done, never the loading
  // flag, because putting the flag in the dependency list makes the effect
  // re-run on its own state change and throw away its own reply.
  useEffect(() => {
    if (!isLakeCat || topLakes || layerError.lakes) return undefined;
    let live = true;
    setLakesLoading(true);
    Promise.all([loadLakeIndex(), loadTopLakes()]).then(([idx, top]) => {
      if (!live) return;
      setLakeIndex(idx);
      setTopLakes(top || []);
      setLakesLoading(false);
    }).catch((e) => {
      if (!live) return;
      setLakesLoading(false);
      failLayer('lakes')(e);
    });
    return () => { live = false; };
  }, [isLakeCat, topLakes, layerError.lakes, retryTick, failLayer, setLakesLoading, setLakeIndex, setTopLakes]);

  const lakeCountries = useMemo(
    () => new Set((lakeIndex?.countries || []).map((c) => c.cc)),
    [lakeIndex],
  );

  const queryLakeCountry = useMemo(() => {
    if (!isLakeCat || !q || q.length < 2) return null;
    for (const cc of lakeCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isLakeCat, q, lakeCountries, countryName]);

  const wantLakeCountry = (country && lakeCountries.has(country) ? country : null)
    || queryLakeCountry
    || (nearPlace && lakeCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isLakeCat || !wantLakeCountry || countryLakes[wantLakeCountry]
      || layerError.lakes) return undefined;
    let live = true;
    Promise.all([
      loadLakes(wantLakeCountry),
      loadListedLakes(wantLakeCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryLakes((cur) => ({ ...cur, [wantLakeCountry]: rows || [] }));
      setListedLakes((cur) => ({ ...cur, [wantLakeCountry]: listed || [] }));
    }).catch((e) => { if (live) failLayer('lakes')(e); });
    return () => { live = false; };
  }, [isLakeCat, wantLakeCountry, countryLakes, layerError.lakes, retryTick, failLayer, setCountryLakes, setListedLakes]);

  const lakeRows = useMemo(() => {
    if (!isLakeCat || !topLakes) return null;
    const loaded = wantLakeCountry ? countryLakes[wantLakeCountry] : null;
    let pool = loaded || topLakes;
    // Measuring from an address is the one case where the country file is not
    // the whole answer: Lake Constance is 20 km from a German address and sits
    // in three countries, and a nearest-first list that stops at customs is a
    // worse answer than a longer one.
    if (loaded && nearPlace) {
      const have = new Set(loaded.map((l) => l.id));
      pool = [...loaded, ...topLakes.filter((l) => !have.has(l.id))];
    }
    let rows = applyLakeFacets(pool, lakeFacets);
    if (q && !queryLakeCountry) {
      rows = rows.filter((l) => norm(l.name).includes(q)
        || norm(l.nameLocal || '').includes(q)
        || norm(l.region || '').includes(q)
        || norm(countryName(l.cc)).includes(q));
    }
    if (nearPlace) {
      return rows
        .map((l) => ({ b: l, km: haversineKm(nearPlace.lat, nearPlace.lon, l.lat, l.lon) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((l) => ({ b: l, km: null }));
  }, [isLakeCat, topLakes, countryLakes, wantLakeCountry, q, queryLakeCountry,
    nearPlace, countryName, lakeFacets]);

  const lakeCounts = useMemo(() => lakeFacetCounts(
    (wantLakeCountry ? countryLakes[wantLakeCountry] : null) || topLakes,
    lakeFacets,
  ), [topLakes, countryLakes, wantLakeCountry, lakeFacets]);

  // A country the traveller typed that has NO published water. `absent` is
  // written by the export gate and carries the difference between "nothing
  // cleared the gate here" and "there is no inland water in this country",
  // which is a real distinction and the reason the empty state does not just
  // say "no match". Monaco is the only country in the second category.
  const absentLakeCountry = useMemo(() => {
    if (!isLakeCat || !q || q.length < 2 || !lakeIndex) return null;
    for (const cc of Object.keys(lakeIndex.absent || {})) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isLakeCat, q, lakeIndex, countryName]);

  // A shared #lake= link, opened once its country file has landed.
  useEffect(() => {
    if (!openLake) return;
    setCat('lakes');
    setQuery('');
    setNearPlace(null);
    loadLakes(openLake.cc).then((rows) => {
      const hit = (rows || []).find((l) => l.id === openLake.id);
      if (hit) setPageLake(hit);
      setCountryLakes((cur) => ({ ...cur, [openLake.cc]: rows || [] }));
    }).catch(failLayer('lakes'));
    onOpenLakeConsumed?.();
  }, [openLake, onOpenLakeConsumed, failLayer, setCat, setQuery, setNearPlace, setPageLake, setCountryLakes]);
  return { wantLakeCountry, lakeRows, lakeCounts, absentLakeCountry };
}
