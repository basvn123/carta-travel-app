import { useMemo } from 'react';
import { matchesAnyKind } from '../lib/trip_kinds.js';
import { isFullRatingRange } from '../lib/rating.js';
import { isBigPlace } from '../lib/placeSize.js';
import { computeCosts } from '../lib/costIndex.js';
import { duplicateHeroes } from '../lib/heroImage.js';

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
 * the page's whole point is that it works without a fare), the euro-a-day
 * cost row attached, then narrowed by search, country, trip kind, rating
 * band, the highlight toggles, place size and travel time, and sorted.
 *
 * Sort keys: 'beauty' (rating, the default), 'cost' (cheapest day first),
 * 'name', 'country'. The retired 'price', 'stay' and 'food' keys all land
 * somewhere sensible rather than crashing a restored URL or a synced account:
 * 'price' on 'beauty', 'stay' and 'food' on 'cost', which is the question
 * both of them were really asking.
 */
export function useExploreCatalog({
  data, locationQuery, countryFilter, tripKinds,
  ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
  reachHours, reachMinutes, sortKey, showFavOnly, favorites,
  indices: providedIndices,
  searchHits = null,
}) {
  const rLo = ratingRange?.[0] ?? 0;
  const rHi = ratingRange?.[1] ?? 10;
  const ratingActive = !isFullRatingRange(ratingRange);
  const reachActive = Number.isFinite(reachHours) && reachHours > 0 && reachMinutes instanceof Map;
  const reachCutoffMin = reachActive ? reachHours * 60 : Infinity;

  const indices = useMemo(
    () => providedIndices || (data ? computeCosts(data.destinations) : new Map()),
    [providedIndices, data],
  );

  // One photograph cannot stand for two places. Where the wire hands the same
  // Commons file to several destinations, only the best-known of them keeps
  // it and the rest fall back to the typographic placeholder.
  const dupHeroes = useMemo(
    () => (data ? duplicateHeroes(data.destinations) : new Set()),
    [data],
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
        local_transport: d.local_transport || null,
        country_rank: d.country_rank ?? null,
        country_n: d.country_n ?? null,
        country_badge: d.country_badge ?? null,
        image: dupHeroes.has(destId) ? null : (d.image?.url || null),
        climate: d.climate || null,
        cost: ix,
        // The card's one line is composed from these, not shipped ready-made:
        // most of the catalogue's blurbs are category counts (placeStory.js).
        // Both are passed by reference, so the grid copies no strings.
        blurb: d.blurb || null,
        activities: d.activities || null,
      });
    }
    return dedupeGateways(rows);
  }, [data, indices, dupHeroes]);

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
      if (q) {
        // B2: the fold-and-alias index widens the plain substring - an
        // exonym, a folded diacritic, a member village or a region box all
        // count as a hit. Additive only: everything the substring found
        // before, it still finds.
        const plain = normalize(p.city).includes(q) || normalize(p.country).includes(q);
        const viaIndex = searchHits?.ids?.has(p.id) || false;
        const viaRegion = searchHits?.bbox
          ? ((p.city_lat ?? p.lat) >= searchHits.bbox[1]
            && (p.city_lat ?? p.lat) <= searchHits.bbox[3]
            && (p.city_lon ?? p.lon) >= searchHits.bbox[0]
            && (p.city_lon ?? p.lon) <= searchHits.bbox[2])
          : false;
        if (!plain && !viaIndex && !viaRegion) return false;
      }
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
  }, [all, q, searchHits, countryFilter, tripKinds, ratingActive, rLo, rHi, gemOnly,
    unescoOnly, topBeachOnly, bigOnly, showFavOnly, favDep,
    reachActive, reachCutoffMin, reachMinutes]);

  const rows = useMemo(() => {
    const raw = sortKey || 'beauty';
    const key = raw === 'price' ? 'beauty' : (raw === 'stay' || raw === 'food') ? 'cost' : raw;
    const ratingVal = (p) => (p.rating?.score ?? p.beauty?.score ?? 0);
    // "Top rated N" trims BEFORE the sort, so the shortcut picks the set and
    // the sort chips still decide the order of what is left.
    const base = topPick?.n
      ? [...filtered].sort((a, b) => ratingVal(b) - ratingVal(a)).slice(0, topPick.n)
      : [...filtered];
    if (key === 'name') base.sort((a, b) => a.city.localeCompare(b.city));
    else if (key === 'country') base.sort((a, b) => a.country.localeCompare(b.country) || ratingVal(b) - ratingVal(a));
    else if (key === 'cost') {
      // Cheapest day first. A destination with no figure sorts last rather
      // than sorting as free, which is exactly the mistake the old
      // percentile index made with a harvested zero.
      const dayOf = (p) => (p.cost?.dayEur ?? Infinity);
      base.sort((a, b) => dayOf(a) - dayOf(b) || ratingVal(b) - ratingVal(a));
    }
    else base.sort((a, b) => ratingVal(b) - ratingVal(a));
    return base;
  }, [filtered, sortKey, topPick]);

  return { all, rows, availableCountries, indices };
}
