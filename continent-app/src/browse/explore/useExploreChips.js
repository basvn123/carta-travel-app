import React from 'react';
import { PAGE } from './exploreConsts.js';
import { FULL_RATING_RANGE, bandWord } from '../../lib/rating.js';
import { viewFactor } from '../../lib/price/display.js';
import { formatMoney } from '../../lib/money.js';
import { minVerdict, goodForOf } from '../ExploreFilterRail.jsx';

export function useExploreChips({
  availableCountries, countryFilter, countryNot, favorites, flightLimitAvailable, gLabels,
  gemOnly, gridTotal, locationQuery, nearRow, patchXf, reachAvailable, reachHours, request,
  scrollRef, sentinelRef, setBigOnly, setCountryFilter, setGemOnly, setLocationQuery,
  setRatingRange, setReachHours, setShowFavOnly, setTopBeachOnly, setTopPick, setTripKinds,
  setUnescoOnly, setVisible, setXf, showFavOnly, t, tripKinds, unescoOnly, xf,
}) {
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
  }, [gridTotal, scrollRef, sentinelRef, setVisible]);

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
      list.push({ key: 'rating', label: t('filter.ratingAtLeast', { band: bandWord(t, minVerdict(xf.verdicts)) }), remove: drop({ verdicts: [] }) });
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
  return { sheetOpen, setSheetOpen, filterBtnRef, resetAll, chips, lastChip, favSet, emptyLine };
}
