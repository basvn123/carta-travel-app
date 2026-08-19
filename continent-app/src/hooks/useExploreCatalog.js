import { useMemo } from 'react';
import { matchesAnyKind } from '../lib/trip_kinds.js';
import { isFullRatingRange } from '../lib/rating.js';
import { isBigPlace } from '../lib/placeSize.js';
import { computeIndices } from '../lib/indices.js';

// Accent- and case-insensitive text key, so "malaga" matches "Málaga".
function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// City name without the airport parenthetical: "Rome (Fiumicino)" -> "Rome".
function baseCity(name) {
  return (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Multi-airport cities (Rome, Paris, London) collapse to one card. Without a
 *  fare to arbitrate, the group's representative is the gateway that knows the
 *  place best: highest fame, image as tiebreak. Non-airport rows never merge. */
function dedupeGateways(rows) {
  const winners = new Map();
  const order = [];
  const better = (a, b) => {
    const fa = a.rating?.fame ?? 0;
    const fb = b.rating?.fame ?? 0;
    if (fa !== fb) return fa > fb;
    return !!a.image && !b.image;
  };
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
    } else if (better(p, seen)) {
      winners.set(key, { ...p, city: baseCity(p.city) });
    }
  }
  return order.map((k) => winners.get(k));
}

/**
 * The Explore page's catalogue: every destination projected once (no pricing,
 * the page's whole point is that it works without a fare), the two
 * price-level indices attached, then narrowed by search, country, trip kind,
 * rating band, the highlight toggles, place size and travel time, and sorted.
 *
 * Sort keys: 'beauty' (rating, the default), 'stay' and 'food' (cheapest
 * index first), 'name', 'country'. A legacy stored 'price' key lands on
 * 'beauty' rather than crashing a restored URL.
 */
export function useExploreCatalog({
  data, locationQuery, countryFilter, tripKinds,
  ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
  reachHours, reachMinutes, sortKey, showFavOnly, favorites,
  indices: providedIndices,
}) {
  const rLo = ratingRange?.[0] ?? 0;
  const rHi = ratingRange?.[1] ?? 10;
  const ratingActive = !isFullRatingRange(ratingRange);
  const reachActive = Number.isFinite(reachHours) && reachHours > 0 && reachMinutes instanceof Map;
  const reachCutoffMin = reachActive ? reachHours * 60 : Infinity;

  const indices = useMemo(
    () => providedIndices || (data ? computeIndices(data.destinations) : new Map()),
    [providedIndices, data],
  );

  const all = useMemo(() => {
    if (!data) return [];
    const rows = [];
    for (const [destId, d] of Object.entries(data.destinations)) {
      if (d.lat == null || d.lon == null) continue;
      const ix = indices.get(destId) || {};
      rows.push({
        id: destId,
        tier: d.tier,
        city: d.city,
        country: d.country,
        iso2: d.iso2,
        lat: d.lat,
        lon: d.lon,
        categories: d.categories || [],
        beauty: d.beauty || null,
        rating: d.rating || null,
        place: d.place || null,
        bathing_water: d.bathing_water || null,
        crowding: d.crowding || null,
        image: d.image?.url || null,
        climate: d.climate || null,
        stayIx: ix.stay ?? null,
        foodIx: ix.food ?? null,
        stayLevel: ix.stayLevel || null,
        foodLevel: ix.foodLevel || null,
      });
    }
    return dedupeGateways(rows);
  }, [data, indices]);

  const availableCountries = useMemo(() => {
    const map = new Map();
    for (const p of all) {
      if (!map.has(p.iso2)) map.set(p.iso2, p.country);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const q = useMemo(() => normalize(locationQuery), [locationQuery]);
  const favDep = showFavOnly ? favorites : null;

  const filtered = useMemo(() => {
    return all.filter((p) => {
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
      if (bigOnly && !isBigPlace(p)) return false;
      if (showFavOnly && favDep && !favDep.has(p.id)) return false;
      if (reachActive) {
        const m = reachMinutes.get(p.id);
        if (m == null || m > reachCutoffMin) return false;
      }
      return true;
    });
    // favorites only re-filters while the shortlist view is on (favDep).
  }, [all, q, countryFilter, tripKinds, ratingActive, rLo, rHi, gemOnly,
    unescoOnly, topBeachOnly, bigOnly, showFavOnly, favDep,
    reachActive, reachCutoffMin, reachMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const key = sortKey === 'price' ? 'beauty' : (sortKey || 'beauty');
    const ratingVal = (p) => (p.rating?.score ?? p.beauty?.score ?? 0);
    // "Top rated N" trims BEFORE the sort, so the shortcut picks the set and
    // the sort chips still decide the order of what is left.
    const base = topPick?.n
      ? [...filtered].sort((a, b) => ratingVal(b) - ratingVal(a)).slice(0, topPick.n)
      : [...filtered];
    if (key === 'name') base.sort((a, b) => a.city.localeCompare(b.city));
    else if (key === 'country') base.sort((a, b) => a.country.localeCompare(b.country) || ratingVal(b) - ratingVal(a));
    else if (key === 'stay') base.sort((a, b) => (b.stayIx ?? -1) - (a.stayIx ?? -1) || ratingVal(b) - ratingVal(a));
    else if (key === 'food') base.sort((a, b) => (b.foodIx ?? -1) - (a.foodIx ?? -1) || ratingVal(b) - ratingVal(a));
    else base.sort((a, b) => ratingVal(b) - ratingVal(a));
    return base;
  }, [filtered, sortKey, topPick]);

  return { all, rows, availableCountries, indices };
}
