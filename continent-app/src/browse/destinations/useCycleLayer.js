import React, { useMemo, useCallback, useEffect } from 'react';
import { norm } from './destTabConsts.js';
import { loadCyclingIndex, loadTopCycling, loadCycling } from '../../lib/cycling.js';
import { cycleFacetCounts, cycleMatchesFacets, routeTitle, isLocalNetworkRow } from '../../lib/cycleStory.js';

export function useCycleLayer({
  cat, country, countryCycling, countryName, cycleFacets, cycleIndex, cycleShowLocal, cycleSort,
  cycleTop, debouncedQuery, failLayer, isCycleCat, lang, layerError, nearPlace, pendingWhere, q,
  retryTick, setCountry, setCountryCycling, setCycleIndex, setCycleTop, setCyclingLoading,
  setDebouncedQuery, setNearPlace, setPageCycle, setPendingWhere, setQuery, t, trailsIndex,
}) {
  // ---------------------------------------------------------------- cycling
  //
  // Two lists, never one. `routes` are rated and carry a score; `listed` rows
  // are verified to exist and correctly named but have NO score key at all,
  // so they live under their own heading and a screen has to opt in to
  // showing them. `tours` are the composed multi-day plans, which are the
  // reason the layer exists: nothing about them is generated when a reader
  // asks, and each one passed ten hard checks before it was published.
  const cycleCountries = useMemo(
    () => new Set((cycleIndex?.countries || []).map((c) => c.country)),
    [cycleIndex],
  );

  // T600: Where text that names a country Trails or Cycling publishes, as
  // that country's code: the exact name or code, else (3 letters on) the
  // one country whose name starts with it. Null for any other text.
  const countryOfText = useCallback((text) => {
    const n = norm(text).trim();
    if (n.length < 2) return null;
    const codes = cat === 'trails' ? (trailsIndex?.countries || []).map((c) => c.country)
      : cat === 'cycling' ? [...cycleCountries] : [];
    const exact = codes.find((c) => norm(c) === n || norm(countryName(c)) === n);
    if (exact || n.length < 3) return exact || null;
    const starts = codes.filter((c) => norm(countryName(c)).startsWith(n));
    return starts.length === 1 ? starts[0] : null;
  }, [cat, trailsIndex, cycleCountries, countryName]);
  // Handed-over Where text (a link, Explore's overview) read as a country
  // once the index that says which countries exist is in.
  useEffect(() => {
    if (!pendingWhere) return;
    if (cat !== 'trails' && cat !== 'cycling') { setPendingWhere(''); return; }
    if (cat === 'trails' ? !trailsIndex : !cycleIndex) return;
    const cc = countryOfText(pendingWhere);
    if (cc) {
      setCountry(cc);
      setNearPlace(null);
      setQuery('');
      setDebouncedQuery('');
    }
    setPendingWhere('');
  }, [pendingWhere, cat, trailsIndex, cycleIndex, countryOfText, setPendingWhere, setCountry, setNearPlace, setQuery, setDebouncedQuery]);
  // End check (T600): the hand-off from Explore raced the category change
  // and left "Italy" filtering the walks by name. Whatever the path, a Where
  // text that IS a country's name on Trails or Cycling picks that country.
  useEffect(() => {
    if ((cat !== 'trails' && cat !== 'cycling') || !debouncedQuery) return;
    if (cat === 'trails' ? !trailsIndex : !cycleIndex) return;
    const n = norm(debouncedQuery).trim();
    const cc = countryOfText(debouncedQuery);
    if (!cc || (norm(countryName(cc)) !== n && norm(cc) !== n)) return;
    if (country && country !== cc) return;
    setCountry(cc);
    setNearPlace(null);
    setQuery('');
    setDebouncedQuery('');
  }, [cat, country, debouncedQuery, trailsIndex, cycleIndex, countryOfText, countryName, setCountry, setNearPlace, setQuery, setDebouncedQuery]);

  const queryCycleCountry = useMemo(() => {
    if (!isCycleCat || !q || q.length < 2) return null;
    for (const cc of cycleCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isCycleCat, q, cycleCountries, countryName]);

  const wantCycleCountry = (country && cycleCountries.has(country) ? country : null)
    || queryCycleCountry
    || (nearPlace && cycleCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null)
    // No country chosen means the Europe-wide top file, never the first
    // country in the index: that default opened the tab on one Andorran
    // route under a picker that said "All countries".
    || null;

  // Stable per-card handler. CycleCard already hands its own row back to
  // onOpen, so the inline arrow each card used to get bought nothing and
  // defeated the memo on every keystroke.
  const openCycleRoute = React.useCallback((r) => {
    setPageCycle({ routeId: r.id, country: r.cc || wantCycleCountry });
  }, [setPageCycle, wantCycleCountry]);
  const openCycleTour = React.useCallback((tr) => {
    setPageCycle({ tourSlug: tr.slug, country: tr.cc || wantCycleCountry });
  }, [setPageCycle, wantCycleCountry]);

  useEffect(() => {
    if (!isCycleCat || cycleIndex || layerError.cycling) return undefined;
    let live = true;
    loadCyclingIndex().then((idx) => { if (live) setCycleIndex(idx); })
      .catch((e) => { if (live) failLayer('cycling')(e); });
    return () => { live = false; };
  }, [isCycleCat, cycleIndex, layerError.cycling, retryTick, failLayer, setCycleIndex]);

  useEffect(() => {
    if (!isCycleCat || wantCycleCountry || cycleTop || layerError.cycling) return undefined;
    let live = true;
    setCyclingLoading(true);
    loadTopCycling().then((top) => {
      if (!live) return;
      setCycleTop(top || { routes: [], listed: [], tours: [] });
      setCyclingLoading(false);
    }).catch((e) => {
      if (!live) return;
      setCyclingLoading(false);
      failLayer('cycling')(e);
    });
    return () => { live = false; };
  }, [isCycleCat, wantCycleCountry, cycleTop, layerError.cycling, retryTick, failLayer, setCyclingLoading, setCycleTop]);

  useEffect(() => {
    if (!isCycleCat || !wantCycleCountry || countryCycling[wantCycleCountry]
      || layerError.cycling) {
      return undefined;
    }
    let live = true;
    setCyclingLoading(true);
    loadCycling(wantCycleCountry).then((bundle) => {
      if (!live) return;
      setCountryCycling((cur) => ({ ...cur, [wantCycleCountry]: bundle || null }));
      setCyclingLoading(false);
    }).catch((e) => {
      if (!live) return;
      setCyclingLoading(false);
      failLayer('cycling')(e);
    });
    return () => { live = false; };
  }, [isCycleCat, wantCycleCountry, countryCycling, layerError.cycling, retryTick, failLayer, setCyclingLoading, setCountryCycling]);

  const cycleBundle = !isCycleCat ? null
    : wantCycleCountry ? countryCycling[wantCycleCountry] : cycleTop;

  // Every row in scope before the facets, for the chip counts: a count is
  // what the chip would leave on screen, so it is taken over the rows the
  // query leaves and nothing else.
  const cycleScope = useMemo(() => {
    if (!isCycleCat || !cycleBundle) return [];
    const inQuery = (r) => !q || queryCycleCountry
      || norm(r.name || '').includes(q) || norm(r.ref || '').includes(q);
    return [...(cycleBundle.routes || []), ...(cycleBundle.listed || [])].filter(inQuery);
  }, [isCycleCat, cycleBundle, q, queryCycleCountry]);
  const cycleCounts = useMemo(() => cycleFacetCounts(cycleScope), [cycleScope]);

  const cycleRows = useMemo(() => {
    if (!isCycleCat || !cycleBundle) return null;
    const match = (r) => (!q || queryCycleCountry
      || norm(r.name || '').includes(q) || norm(r.ref || '').includes(q))
      && cycleMatchesFacets(r, cycleFacets);
    const d = cycleSort.dir;
    const title = (r) => routeTitle(r, t);
    const sortRows = (rows) => {
      const arr = [...rows];
      if (cycleSort.key === 'distance') {
        arr.sort((a, b) => d * ((a.km || 0) - (b.km || 0)));
      } else if (cycleSort.key === 'az') {
        arr.sort((a, b) => d * title(a).localeCompare(title(b), lang));
      } else {
        arr.sort((a, b) => d * ((a.v5?.score || 0) - (b.v5?.score || 0)));
      }
      return arr;
    };
    const listedAll = (cycleBundle.listed || []).filter(match);
    const localN = listedAll.filter(isLocalNetworkRow).length;
    const listed = cycleShowLocal ? listedAll : listedAll.filter((r) => !isLocalNetworkRow(r));
    return {
      tours: (cycleBundle.tours || []).filter(
        (tr) => !q || queryCycleCountry || norm(tr.title || '').includes(q),
      ),
      routes: sortRows((cycleBundle.routes || []).filter(match)),
      listed: sortRows(listed),
      localHidden: cycleShowLocal ? 0 : localN,
    };
  }, [isCycleCat, cycleBundle, q, queryCycleCountry, cycleFacets, cycleShowLocal,
    cycleSort, lang, t]);

  // Cycling renders three stacked lists off one scroll, so its row count is
  // their sum and the paging window is spent across them in order: the tours
  // first, then whatever is left goes to the routes, then to the listed ones.
  // Slicing each list at `visible` on its own would mount three pages at a
  // time and the sentinel would never be reached.
  const cycleTotal = cycleRows
    ? cycleRows.tours.length + cycleRows.routes.length + cycleRows.listed.length
    : 0;
  return { countryOfText, wantCycleCountry, openCycleRoute, openCycleTour, cycleScope, cycleCounts, cycleRows, cycleTotal };
}
