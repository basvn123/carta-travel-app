import { useCallback, useMemo } from 'react';
import { tripBand, tripGrade, tripClimbBand, tripRouteType, tripHighlights, tripSuitability, tripSacBand, tripDurationBands, tripReachable, tripCentre, haversineKm, DISTANCE_BANDS, GRADES, ASCENT_BANDS, ROUTE_TYPES, HIGHLIGHTS, SUITABILITY, isListed } from '../../lib/trailCards.js';
import { norm, NEAR_MAX_ROWS } from './destTabConsts.js';
import { SAC_BANDS, DURATION_BANDS } from '../../lib/routeEffort.js';

export function useTrailLayer({
  bands, cat, climbs, countryName, durs, grades, hls, isTripCat, lang, loopsOnly, nearPlace, q,
  reachOnly, sacs, shapes, sort, suits, trailSort, trailsIndex, tripCards,
}) {
  // The walk-shape chips as one test on a trip (T600: the Europe-wide map
  // uses it too). A band set is a union: tapping two chips asks for either
  // length, which is how somebody with "an afternoon or a full day" thinks.
  const trailPass = useCallback((tr) => {
    if (bands.length && !bands.includes(tripBand(tr))) return false;
    if (grades.length && !grades.includes(tripGrade(tr))) return false;
    if (climbs.length && !climbs.includes(tripClimbBand(tr))) return false;
    if (shapes.length && !shapes.includes(tripRouteType(tr))) return false;
    if (hls.length) {
      const on = tripHighlights(tr);
      if (!hls.some((k) => on.includes(k))) return false;
    }
    if (suits.length) {
      const on = tripSuitability(tr);
      if (!suits.some((k) => on.includes(k))) return false;
    }
    if (sacs.length && !sacs.includes(tripSacBand(tr))) return false;
    if (durs.length && !durs.some((k) => tripDurationBands(tr).includes(k))) return false;
    if (reachOnly && !tripReachable(tr)) return false;
    if (loopsOnly && !tr.is_loop) return false;
    return true;
  }, [bands, grades, climbs, shapes, hls, suits, loopsOnly, sacs, durs, reachOnly]);

  const tripRows = useMemo(() => {
    if (!tripCards) return null;
    let rows = tripCards.filter((c) => (
      cat === 'trips' ? c.tr.category === 'citytrip'
        : cat === 'trails' ? c.tr.category !== 'citytrip'
          : cat === 'beaches' ? c.themes.has('beach')
            : c.themes.has('mountains')
    ));
    if (q) rows = rows.filter((c) => norm(c.tr.name).includes(q));
    // Walk-shape filters, Trails only (trailPass above).
    if (cat === 'trails') rows = rows.filter((c) => trailPass(c.tr));
    if (nearPlace) {
      return rows
        .map((c) => {
          const ctr = tripCentre(c.tr);
          return ctr ? { c, km: haversineKm(nearPlace.lat, nearPlace.lon, ctr.lat, ctr.lon) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    const out = rows.map((c) => ({ c, km: null }));
    // Trails have their own sorts, because they have no price. The wire
    // already arrives in rating order, so the default costs nothing and the
    // list a country opens on is that country's best walks.
    if (cat === 'trails') {
      const d = trailSort.dir;
      if (trailSort.key === 'distance') {
        out.sort((a, b) => d * ((a.c.tr.distance_m ?? Infinity) - (b.c.tr.distance_m ?? Infinity)));
      } else if (trailSort.key === 'az') {
        out.sort((a, b) => d * a.c.tr.name.localeCompare(b.c.tr.name));
      } else {
        out.sort((a, b) => d * ((a.c.tr.v5?.score ?? -1) - (b.c.tr.v5?.score ?? -1)));
      }
      return out;
    }
    const dir = sort.dir;
    if (sort.key === 'rating') {
      out.sort((a, b) => dir * ((a.c.assoc.dest?.rating?.score ?? -1) - (b.c.assoc.dest?.rating?.score ?? -1)));
    } else if (sort.key === 'price') {
      const v = (c) => c.price?.pp ?? Infinity;
      out.sort((a, b) => dir * (v(a.c) - v(b.c)));
    } else {
      out.sort((a, b) => dir * a.c.tr.name.localeCompare(b.c.tr.name));
    }
    return out;
  }, [tripCards, cat, q, nearPlace, sort, trailSort, trailPass]);

  // How many walks each length band holds in this country, and how many of
  // them loop, so a chip can carry its own count and grey itself out instead
  // of leading to an empty list.
  //
  // Counted BEFORE the band and loop filters are applied (but after the search
  // text), which is what lets the counts stay still while chips are tapped. A
  // count that changed every tap would be describing the filter rather than
  // the country.
  const trailFacets = useMemo(() => {
    if (cat !== 'trails' || !tripCards) return null;
    const rows = tripCards.filter((c) => c.tr.category !== 'citytrip'
      && (!q || norm(c.tr.name).includes(q)));
    const tally = (defs) => new Map(defs.map((d) => [d.key, 0]));
    const bump = (map, key) => {
      if (key != null && map.has(key)) map.set(key, map.get(key) + 1);
    };
    const byBand = tally(DISTANCE_BANDS);
    const byGrade = tally(GRADES);
    const byClimb = tally(ASCENT_BANDS);
    const byShape = tally(ROUTE_TYPES);
    const byHl = tally(HIGHLIGHTS);
    const bySuit = tally(SUITABILITY);
    const bySac = tally(SAC_BANDS);
    const byDur = tally(DURATION_BANDS);
    let reach = 0;
    let loops = 0;
    let listed = 0;
    for (const c of rows) {
      bump(byBand, tripBand(c.tr));
      bump(byGrade, tripGrade(c.tr));
      bump(byClimb, tripClimbBand(c.tr));
      bump(byShape, tripRouteType(c.tr));
      for (const k of new Set(tripHighlights(c.tr))) bump(byHl, k);
      for (const k of new Set(tripSuitability(c.tr))) bump(bySuit, k);
      bump(bySac, tripSacBand(c.tr));
      for (const k of tripDurationBands(c.tr)) bump(byDur, k);
      if (tripReachable(c.tr)) reach += 1;
      if (c.tr.is_loop) loops += 1;
      if (isListed(c.tr)) listed += 1;
    }
    return { byBand, byGrade, byClimb, byShape, byHl, bySuit, bySac, byDur, reach,
      loops, listed, total: rows.length };
  }, [cat, tripCards, q]);

  // The country index for trip categories: published countries as flag cards.
  const tripCountries = useMemo(() => {
    if (!isTripCat || !trailsIndex) return [];
    return trailsIndex.countries
      .map((c) => {
        const n = cat === 'trips' ? (c.counts?.citytrip || 0)
          : cat === 'trails' ? (c.counts?.hike || 0)
            : c.n_trips;
        return { cc: c.country, name: countryName(c.country), n };
      })
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  }, [isTripCat, trailsIndex, cat, countryName, lang]);
  return { trailPass, tripRows, trailFacets, tripCountries };
}
