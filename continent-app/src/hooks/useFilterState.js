import { useState } from 'react';
import { clampRatingRange, FULL_RATING_RANGE } from '../lib/rating.js';

/**
 * The browse-tab filter + sort controls: price mode, the country multi-select,
 * trip kinds, the rating band + hidden-gems slicer, the UNESCO / top-beach
 * flags, the "best of" shortcut, the sort key and favourites-only. Seeded from
 * the restored URL/localStorage `init`. Grouped out of App so the filter surface
 * is one unit.
 */
export function useFilterState(init) {
  const [priceMode, setPriceMode] = useState(init.priceMode ?? 'pp');
  // Multi-select country filter: an array of iso2 codes ([] = every country).
  // Migrate a legacy single value ('all' or one iso2) from an older URL/account.
  const [countryFilter, setCountryFilter] = useState(() =>
    Array.isArray(init.countryFilter)
      ? init.countryFilter
      : (init.countryFilter && init.countryFilter !== 'all' ? [init.countryFilter] : []));
  const [tripKinds, setTripKinds] = useState(init.tripKinds ?? []);
  // Rating slicer: a [min, max] band over the 0-10 score ([0,10] = off/Any) plus
  // a hidden-gems-only toggle. Replaces the old minimum-tier button list; a
  // legacy `minTier` is migrated to the equivalent band upstream (urlState /
  // useAccountSync), so `init.ratingRange` is the only thing read here.
  const [ratingRange, setRatingRange] = useState(() =>
    clampRatingRange(init.ratingRange ?? FULL_RATING_RANGE));
  const [gemOnly, setGemOnly] = useState(init.gemOnly ?? false);
  const [unescoOnly, setUnescoOnly] = useState(init.unescoOnly ?? false);
  const [topBeachOnly, setTopBeachOnly] = useState(init.topBeachOnly ?? false);
  // The map's size toggle: keep only the cities (place.class city/metro) and
  // drop the towns, villages and areas. Lives here rather than in the filter
  // tray because it is a map control, next to the origin picker.
  const [bigOnly, setBigOnly] = useState(init.bigOnly ?? false);
  // Quick "best of" shortcut: { by: 'price' | 'beauty', n } or null. Trims the
  // (already filtered) results down to the N best by that metric, in list + map.
  const [topPick, setTopPick] = useState(init.topPick ?? null);
  // "Reachable within N hours" cutoff (null = off). Only bites when the
  // current origin has a reach artifact (see lib/reach.js), so a cutoff kept
  // in the URL can never empty the map of an origin without travel-time data.
  const [reachHours, setReachHours] = useState(init.reachHours ?? null);
  const [sortKey, setSortKey] = useState(init.sortKey ?? 'beauty');
  const [showFavOnly, setShowFavOnly] = useState(init.showFavOnly ?? false);
  return {
    priceMode, setPriceMode,
    countryFilter, setCountryFilter,
    tripKinds, setTripKinds,
    ratingRange, setRatingRange,
    gemOnly, setGemOnly,
    unescoOnly, setUnescoOnly,
    topBeachOnly, setTopBeachOnly,
    bigOnly, setBigOnly,
    topPick, setTopPick,
    reachHours, setReachHours,
    sortKey, setSortKey,
    showFavOnly, setShowFavOnly,
  };
}
