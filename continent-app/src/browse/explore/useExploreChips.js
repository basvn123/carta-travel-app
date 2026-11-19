import React from 'react';
import { PAGE } from './exploreConsts.js';
import { FULL_RATING_RANGE, bandWord, minVerdict } from '../../lib/rating.js';
import { spanOf, viewFactor } from '../../lib/price/display.js';
import { formatMoney } from '../../lib/money.js';
import { PICKS, bandLabel, labelForApplied } from '../filters/filterModel.js';

/** Every filter off: the one shape Clear all, the lens clear and a guided
 *  search's "start over" write (G12 round 2 adds temps and picks). */
export const XF_EMPTY = Object.freeze({ verdicts: [], month: null, budget: null, nocar: false, quiet: false,
  vibe: null, area: null, near: null, nb: [], temps: [], picks: [] });

export function useExploreChips({
  availableCountries, countryFilter, countryNot, favorites, gLabels,
  gemOnly, gridTotal, locationQuery, nearRow, patchXf, reachAvailable, reachHours, request,
  scrollRef, sentinelRef, setBigOnly, setCountryFilter, setGemOnly, setLocationQuery,
  setRatingRange, setReachHours, setShowFavOnly, setTopBeachOnly, setTopPick, setTripKinds,
  setUnescoOnly, setVisible, setXf, showFavOnly, t, travelMonth = null, tripKinds, unescoOnly, xf,
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
    // G12: every filter with a chip goes with Clear all, so the badge is
    // never left counting one the traveller cannot see being cleared.
    setShowFavOnly(false);
    setXf({ ...XF_EMPTY });
  };

  // C6: one chip per active filter, each removing exactly itself.
  const chips = React.useMemo(() => {
    const list = [];
    const drop = (delta) => () => patchXf(delta);
    // Trip styles first: they are the first group of the rail (V3, T383),
    // and before V3 they made no chip at all.
    for (const k of tripKinds) list.push({ key: `s:${k}`, label: t(`kind.${k}`), remove: () => setTripKinds(tripKinds.filter((x) => x !== k)) });
    // T694: the chips say the budget in the traveller's view (V15); a whole
    // trip view says so instead of "a day" (G12 round 2).
    const vf = viewFactor(request);
    if (xf.budget) {
      const eur = formatMoney(xf.budget * vf);
      list.push({ key: 'budget', label: spanOf(request) === 'trip' ? t('filters.tripUpTo', { eur }) : t('explore.budgetUpTo', { eur }), remove: drop({ budget: null }) });
    }
    // One chip for the rating, "Excellent and up" (T440): the rail asks for
    // a band and every band above it. G12 round 2: Top rated's own band
    // wears the shortcut's words (labelForApplied).
    if (xf.verdicts.length) {
      list.push({ key: 'rating', label: labelForApplied('rating', t, xf) || t('filter.ratingAtLeast', { band: bandWord(t, minVerdict(xf.verdicts)) }), remove: drop({ verdicts: [] }) });
    }
    // G12 round 2: the day high in the When month, one chip per band. With
    // no month the band waits (it filters nothing), and its chip says so: a
    // link carrying xt must not turn a filter on later unseen (flow m2).
    for (const id of xf.temps) {
      const label = travelMonth
        ? t('filters.tempIn', { band: bandLabel(id, t), month: gLabels.monthInline(travelMonth) })
        : t('filters.tempWaiting', { band: bandLabel(id, t) });
      list.push({ key: `t:${id}`, label,
        remove: () => setXf((v) => ({ ...v, temps: v.temps.filter((x) => x !== id) })) });
    }
    // The sheet's picks and the shortcuts that set them share one label.
    for (const id of xf.picks) {
      if (!PICKS[id]) continue;
      list.push({ key: `p:${id}`, label: labelForApplied(`p:${id}`, t), remove: () => setXf((v) => ({ ...v, picks: v.picks.filter((x) => x !== id) })) });
    }
    if (xf.month) list.push({ key: 'month', label: t('gs.whyMonth', { month: gLabels.monthInline(xf.month) }), remove: drop({ month: null }) });
    if (xf.nocar) list.push({ key: 'nocar', label: t('filter.noCar'), remove: drop({ nocar: false }) });
    if (xf.quiet) list.push({ key: 'quiet', label: t('filter.notCrowded'), remove: drop({ quiet: false }) });
    if (xf.vibe) list.push({ key: 'vibe', label: gLabels.vibe(xf.vibe), remove: drop({ vibe: null }) });
    if (xf.area) list.push({ key: 'area', label: gLabels.area(xf.area), remove: drop({ area: null }) });
    if (xf.near) list.push({ key: 'near', label: t('gs.near', { place: nearRow?.city || xf.near }), remove: drop({ near: null }) });
    for (const x of xf.nb) list.push({ key: `nb:${x}`, label: gLabels.extra(x), remove: drop({ nb: xf.nb.filter((y) => y !== x) }) });
    if (gemOnly) list.push({ key: 'gem', label: labelForApplied('gem', t), remove: () => setGemOnly(false) });
    if (unescoOnly) list.push({ key: 'unesco', label: t('dest.unesco'), remove: () => setUnescoOnly(false) });
    // G12: Strong match narrows the list like any filter, so it gets a chip,
    // counts in the badge and an empty list can name it as the cause.
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
  }, [xf, locationQuery, setLocationQuery, tripKinds, gemOnly, unescoOnly, showFavOnly, countryFilter, countryNot, reachHours, reachAvailable, availableCountries, t, patchXf, setTripKinds, setGemOnly, setUnescoOnly, setShowFavOnly, setCountryFilter, setReachHours, gLabels, nearRow, request, travelMonth, setXf]);

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
