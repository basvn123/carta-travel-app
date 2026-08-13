import { useEffect, useMemo, useRef, useState } from 'react';
import { composeTrip } from '../lib/runtime_pricing.js';
import { matchesAnyKind } from '../lib/trip_kinds.js';
import { isFullRatingRange } from '../lib/rating.js';

// Accent- and case-insensitive text key, so "malaga" matches "Málaga".
function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// City name without the airport parenthetical: "Rome (Fiumicino)" -> "Rome".
function baseCity(name) {
  return (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Some cities have several airport-tier entries (Rome Fiumicino/Ciampino, Paris
// CDG/Orly/Beauvais, London's four, ...). They're the same destination reached
// via different gateways, so collapse each group to its cheapest fare, keeping
// the same city in the ranked list several times over is just noise. Non-airport
// destinations are never merged (keyed by their unique id). The winning row is
// relabelled to the plain city ("Rome (Fiumicino)" -> "Rome") so the list reads
// cleanly; the detail panel still shows the specific airport (it reads by id).
function dedupeGateways(rows) {
  const winners = new Map();
  const order = [];
  for (const p of rows) {
    if (p.tier !== 'airport') {
      winners.set(p.id, p);
      order.push(p.id);
      continue;
    }
    const key = `${baseCity(p.city)}|${p.iso2}`;
    const seen = winners.get(key);
    if (!seen) {
      winners.set(key, { ...p, city: baseCity(p.city) });
      order.push(key);
    } else if (p.total < seen.total) {
      winners.set(key, { ...p, city: baseCity(p.city) });
    }
  }
  return order.map((k) => winners.get(k));
}

/** Prices every destination for the chosen dates/choices, then narrows that
 *  down through the location search, filter bar, and "top picks" shortcut.
 *  Centralizes the destination search/filter pipeline so App.jsx only wires
 *  filter state into it and renders the result.
 */
export function useDestinationSearch({
  data, departDate, returnDate, choices,
  locationQuery, countryFilter, priceMode, tripKinds,
  ratingRange, gemOnly, unescoOnly, topBeachOnly, topPick,
  reachHours, reachMinutes,
  initialPriceRange,
}) {
  // Rating band as a stable [lo, hi] tuple, and whether it constrains anything.
  const rLo = ratingRange?.[0] ?? 0;
  const rHi = ratingRange?.[1] ?? 10;
  const ratingActive = !isFullRatingRange(ratingRange);
  // "Reachable within N hours": only bites when the origin actually has a
  // reach table (lib/reach.js resolves null otherwise), so a cutoff restored
  // from a shared URL degrades to "off" rather than hiding every destination.
  const reachActive = Number.isFinite(reachHours) && reachHours > 0 && reachMinutes instanceof Map;
  const reachCutoffMin = reachActive ? reachHours * 60 : Infinity;
  // Compute, in one pass, the priceable destinations (flight/drive + stay) and the
  // ones that can't be reached from home (no Ryanair route + not drivable). The
  // unreachable ones are still surfaced in the UI, just flagged, never silently
  // dropped.
  const { pricedAll, unreachableAll } = useMemo(() => {
    if (!data || !departDate || !returnDate || returnDate <= departDate) {
      return { pricedAll: [], unreachableAll: [] };
    }
    const reach = [], unreach = [];
    for (const [destId, d] of Object.entries(data.destinations)) {
      if (d.lat == null || d.lon == null) continue;
      const row = {
        id: destId,
        // Airports use their own IATA; gems fly to their anchor airport.
        iata: d.iata || d.anchor_airport,
        tier: d.tier,
        city: d.city,
        country: d.country,
        iso2: d.iso2,
        lat: d.lat,
        lon: d.lon,
        categories: d.categories || [],
        beauty: d.beauty || null,
        rating: d.rating || null,
        bathing_water: d.bathing_water || null,
        crowding: d.crowding || null,
        image: d.image?.url || null,     // hero thumbnail for the map hover card
      };
      const b = composeTrip(d, departDate, returnDate, choices, data.destinations);
      if (b == null) {
        unreach.push({ ...row, total: null, pp: null, reachable: false });
      } else {
        const total = b.grand_total;
        const pp = choices.group_size > 0 ? total / choices.group_size : total;
        reach.push({
          ...row, total, pp, reachable: true,
          // Keep the mode the engine actually priced. In plane mode a destination
          // with no flight is silently priced as a drive, and without these flags
          // the map and list would label that car price as if you could fly to it.
          mode: b.transport_mode,          // 'plane' | 'car' - what this price is
          planeOk: b.plane_reachable,      // is there a flight at all for these dates
          drivable: b.drivable,
          viaAirport: b.via_airport,       // set when flying into a nearby airport
          // A flight priced from the estimate bands (no stored day matched)
          // must read "~€X est." on pins, rows and hover cards.
          prov: b.transport_mode === 'plane' && b.fare_estimated
            ? { est: true, s: 'EST', o: null, x: null } : null,
        });
      }
    }
    const dedupedReach = dedupeGateways(reach);
    dedupedReach.sort((a, b) => a.total - b.total);
    // Unreachable cities (e.g. London's four airports with no Ryanair route from
    // home) collapse the same way, they have no price, so the first gateway wins.
    const dedupedUnreach = dedupeGateways(unreach);
    dedupedUnreach.sort((a, b) => a.city.localeCompare(b.city));
    return { pricedAll: dedupedReach, unreachableAll: dedupedUnreach };
  }, [data, departDate, returnDate, choices]);

  const availableCountries = useMemo(() => {
    const map = new Map();
    for (const p of [...pricedAll, ...unreachableAll]) {
      if (!map.has(p.iso2)) map.set(p.iso2, p.country);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pricedAll, unreachableAll]);

  const priceBounds = useMemo(() => {
    if (pricedAll.length === 0) return null;
    // Single pass, not Math.min(...vals): spreading tens of thousands of values
    // as call arguments can overflow the argument limit and throw a RangeError.
    let mn = Infinity, mx = -Infinity;
    for (const p of pricedAll) {
      const v = priceMode === 'pp' ? p.pp : p.total;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return [Math.floor(mn), Math.ceil(mx)];
  }, [pricedAll, priceMode]);

  // How the priced set is distributed across the bounds, as counts per bin.
  // The price slider draws this behind its rail, so dragging a handle shows
  // where the destinations actually sit instead of asking for a number blind.
  // One pass over the same array priceBounds already walks, memoised on the
  // same inputs, so it costs nothing extra per keystroke at 24.8k rows.
  const PRICE_BINS = 44;
  const priceHistogram = useMemo(() => {
    if (!priceBounds || pricedAll.length === 0) return null;
    const [lo, hi] = priceBounds;
    const span = hi - lo;
    if (!(span > 0)) return null;
    const bins = new Array(PRICE_BINS).fill(0);
    for (const p of pricedAll) {
      const v = priceMode === 'pp' ? p.pp : p.total;
      let i = Math.floor(((v - lo) / span) * PRICE_BINS);
      if (i < 0) i = 0;
      if (i >= PRICE_BINS) i = PRICE_BINS - 1;
      bins[i] += 1;
    }
    return bins;
  }, [pricedAll, priceBounds, priceMode]);

  const [priceRange, setPriceRange] = useState(null);

  // On the first time bounds are known, honor a shared price range; afterwards
  // (e.g. when the price mode flips) snap back to the full bounds.
  const initRangeApplied = useRef(false);
  useEffect(() => {
    if (!priceBounds) return;
    if (!initRangeApplied.current && initialPriceRange) {
      initRangeApplied.current = true;
      // Clamp the restored range to the CURRENT bounds. A price range persisted
      // in the URL/localStorage is a snapshot of some earlier session's prices;
      // a fares/data refresh (or a group-size/mode change baked into the link)
      // shifts every total, and a stored range that now sits entirely outside
      // the new bounds silently filters out every destination, leaving the map
      // and list empty with no visible filter to explain it, and it never
      // recovers because this init runs once. So: keep the overlap when the
      // ranges still intersect, otherwise fall back to the full bounds (show
      // everything) rather than latch a window that matches nothing.
      const [lo, hi] = initialPriceRange;
      const [bLo, bHi] = priceBounds;
      const overlaps = Number.isFinite(lo) && Number.isFinite(hi) && lo <= bHi && hi >= bLo;
      setPriceRange(overlaps
        ? [Math.max(bLo, Math.min(lo, bHi)), Math.min(bHi, Math.max(hi, bLo))]
        : priceBounds);
    } else {
      setPriceRange(priceBounds);
    }
  }, [priceBounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useMemo(() => normalize(locationQuery), [locationQuery]);

  const filtered = useMemo(() => {
    return pricedAll.filter((p) => {
      if (q && !(normalize(p.city).includes(q) || normalize(p.country).includes(q))) return false;
      if (countryFilter.length && !countryFilter.includes(p.iso2)) return false;
      if (priceRange) {
        const v = priceMode === 'pp' ? p.pp : p.total;
        if (v < priceRange[0] || v > priceRange[1]) return false;
      }
      if (tripKinds.length > 0) {
        if (!matchesAnyKind(p.categories, tripKinds)) return false;
      }
      if (ratingActive) {
        const s = p.rating?.score;
        if (s == null || s < rLo || s > rHi) return false;
      }
      if (gemOnly && !p.rating?.hidden_gem) return false;
      if (unescoOnly && !p.beauty?.unesco) return false;
      if (topBeachOnly && !p.beauty?.top_beach) return false;
      if (reachActive) {
        // Loader already Number.isFinite-guarded the table; a destination with
        // no entry is simply not known reachable, so the cutoff hides it.
        const m = reachMinutes.get(p.id);
        if (m == null || m > reachCutoffMin) return false;
      }
      return true;
    });
  }, [pricedAll, q, countryFilter, priceRange, priceMode, tripKinds, ratingActive, rLo, rHi, gemOnly, unescoOnly, topBeachOnly, reachActive, reachCutoffMin, reachMinutes]);

  // "Top picks" trims the filtered set to the N best by price or beauty. Applied
  // here (not just in the list) so the map and stats reflect the shortlist too.
  const priced = useMemo(() => {
    if (!topPick) return filtered;
    const score = topPick.by === 'beauty'
      ? (p) => -(p.rating?.score ?? p.beauty?.score ?? 0)    // best rated first
      : (p) => (priceMode === 'pp' ? p.pp : p.total);        // cheapest first
    return [...filtered].sort((a, b) => score(a) - score(b)).slice(0, topPick.n);
  }, [filtered, topPick, priceMode]);

  // Unreachable destinations to still surface (same country / trip-kind filters,
  // but no price filter, they have no price).
  const unreachable = useMemo(() => {
    return unreachableAll.filter((p) => {
      if (q && !(normalize(p.city).includes(q) || normalize(p.country).includes(q))) return false;
      if (countryFilter.length && !countryFilter.includes(p.iso2)) return false;
      if (tripKinds.length > 0 && !matchesAnyKind(p.categories, tripKinds)) return false;
      if (ratingActive) {
        const s = p.rating?.score;
        if (s == null || s < rLo || s > rHi) return false;
      }
      if (gemOnly && !p.rating?.hidden_gem) return false;
      if (unescoOnly && !p.beauty?.unesco) return false;
      if (topBeachOnly && !p.beauty?.top_beach) return false;
      // Same travel-time cutoff as the priced set: these rows have no price,
      // but "under N hours" is still a fact the reach table answers.
      if (reachActive) {
        const m = reachMinutes.get(p.id);
        if (m == null || m > reachCutoffMin) return false;
      }
      return true;
    });
  }, [unreachableAll, q, countryFilter, tripKinds, ratingActive, rLo, rHi, gemOnly, unescoOnly, topBeachOnly, reachActive, reachCutoffMin, reachMinutes]);

  const dealThreshold = useMemo(() => {
    if (priced.length === 0) return null;
    const idx = Math.floor(priced.length * 0.25);
    const sorted = [...priced].sort((a, b) => a.total - b.total);
    return sorted[idx]?.total ?? null;
  }, [priced]);

  const stats = useMemo(() => {
    if (priced.length === 0) return { priced: 0, min: null };
    // Single pass, same RangeError/garbage reasoning as priceBounds above.
    let minVal = Infinity;
    for (const p of priced) {
      const v = priceMode === 'pp' ? p.pp : p.total;
      if (v < minVal) minVal = v;
    }
    return { priced: priced.length, total: pricedAll.length, min: Math.round(minVal) };
  }, [priced, pricedAll, priceMode]);

  return {
    pricedAll, unreachableAll, availableCountries, priceBounds, priceHistogram,
    priceRange, setPriceRange,
    filtered, priced, unreachable, dealThreshold, stats,
  };
}
