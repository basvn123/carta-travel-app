import { useState } from 'react';

/**
 * The browse-tab filter + sort controls: price mode, the country multi-select,
 * trip kinds, the rating tier, the UNESCO / top-beach flags, the "best of"
 * shortcut, the sort key and favourites-only. Seeded from the restored
 * URL/localStorage `init`. Grouped out of App so the filter surface is one unit.
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
  // Rating filters (min tier 0-3; 0 = off/Any, see rating_layer.py tiers)
  const [minTier, setMinTier] = useState(init.minTier ?? 0);
  const [unescoOnly, setUnescoOnly] = useState(init.unescoOnly ?? false);
  const [topBeachOnly, setTopBeachOnly] = useState(init.topBeachOnly ?? false);
  // Quick "best of" shortcut: { by: 'price' | 'beauty', n } or null. Trims the
  // (already filtered) results down to the N best by that metric, in list + map.
  const [topPick, setTopPick] = useState(init.topPick ?? null);
  const [sortKey, setSortKey] = useState(init.sortKey ?? 'beauty');
  const [showFavOnly, setShowFavOnly] = useState(init.showFavOnly ?? false);
  return {
    priceMode, setPriceMode,
    countryFilter, setCountryFilter,
    tripKinds, setTripKinds,
    minTier, setMinTier,
    unescoOnly, setUnescoOnly,
    topBeachOnly, setTopBeachOnly,
    topPick, setTopPick,
    sortKey, setSortKey,
    showFavOnly, setShowFavOnly,
  };
}
