import { useMemo, useCallback } from 'react';
import { isTransportInfraPoi, isCommercialNoisePoi, poiScore, poiRating, poiMapCat, isMustSee, poiCategory, farWorthySights, MAX_POI_KM_FROM_CITY } from '../dayDraft.js';
import { useShortlistPoints } from '../../hooks/useFavoriteItems.js';
import { haversineKm, cityCoords } from '../../lib/runtime_pricing.js';
import { SHORTLIST_SNAP_KM } from './dayPlannerData.js';
import { searchFold } from '../../lib/textSearch.js';

export function useDayMapDecks({
  activities, assignedAnyDay, assignments, dayIdx, favorites, mapCat, mapDeck, mapRating,
  mapView, poiQuery, showSel, stop, stopIdx, t,
}) {
  // Zoomed in, the map behaves like Google Maps: beyond the always-on top
  // deck, every catalogued place inside the current viewport surfaces as a
  // pin, so a dense neighbourhood reveals its depth as you lean in, and the
  // wider city (not just the 48 strongest places) stays explorable.
  const ZOOM_REVEAL = 12.8;
  const zoomDeck = useMemo(() => {
    if (!stop?.dest || !mapView || mapView.zoom < ZOOM_REVEAL || !mapView.bounds) return [];
    const [w, s, e, n] = mapView.bounds;
    const inDeck = new Set(mapDeck.map((d) => d.idx));
    const out = [];
    activities.items.forEach((item, idx) => {
      if (inDeck.has(idx) || assignedAnyDay.has(idx) || activities.suppressed.has(idx)) return;
      if (item.lat == null || item.lon == null) return;
      if (item.lat < s || item.lat > n || item.lon < w || item.lon > e) return;
      if (isTransportInfraPoi(item) || isCommercialNoisePoi(item)) return;
      out.push({ item, idx });
    });
    out.sort((a, b) => poiScore(b.item) - poiScore(a.item));
    return out.slice(0, 220);
  }, [stop, mapView, mapDeck, activities, assignedAnyDay]);

  const visibleDeck = useMemo(() => [...mapDeck, ...zoomDeck], [mapDeck, zoomDeck]);

  const passRating = useCallback((item) => mapRating === 'all'
    || (mapRating === 'must' ? poiRating(item).label === 'must_see' : poiRating(item).tier >= 2), [mapRating]);


  const mapPois = useMemo(() => {
    // "Show selected": today's picks are already the numbered route, so the
    // pins are the city's OTHER days' picks, check-marked, not addable twice.
    if (showSel) {
      const today = new Set(assignments[stopIdx]?.[dayIdx] || []);
      return [...assignedAnyDay]
        .filter((idx) => !today.has(idx))
        .map((idx) => ({ item: activities.items[idx], idx }))
        .filter(({ item }) => item && item.lat != null && item.lon != null)
        .map(({ item, idx }) => ({
          id: String(idx),
          label: item.name,
          lat: item.lat,
          lon: item.lon,
          cat: poiMapCat(item),
          must: isMustSee(item),
          sel: true,
        }));
    }
    return visibleDeck
      .filter(({ item }) => mapCat === 'all' || poiCategory(item) === mapCat)
      .filter(({ item }) => passRating(item))
      .map(({ item, idx }) => ({
        id: String(idx),
        label: item.name,
        lat: item.lat,
        lon: item.lon,
        cat: poiMapCat(item),
        must: isMustSee(item),
      }));
  }, [visibleDeck, mapCat, passRating, showSel, assignedAnyDay, assignments, stopIdx, dayIdx, activities]);

  // Outstanding sights BEYOND walking range, their own excursion, but too
  // good not to mention (importance + beauty outweigh the distance).
  const farSights = useMemo(
    () => (stop?.dest
      ? farWorthySights(activities.items, stop.dest).filter((e) => !activities.suppressed.has(e.idx))
      : []),
    [activities, stop],
  );

  /**
   * The shortlist, as things you can put into today.
   *
   * What the shortlist holds is PLACES - a beach, a lake, a mountain, a walk -
   * each with its own coordinates, and what a day is built out of is this
   * city's harvested POI list, addressed by array index. So the two are
   * joined by COORDINATE, not by name: a shortlisted beach matches the POI
   * within `SHORTLIST_SNAP_KM` of it, which is the same beach under whatever
   * name the POI harvest happened to use. Name matching would miss every
   * place whose two sources disagree about spelling, which is most of them.
   *
   * Destinations are not offered: a shortlisted city is somewhere you go, not
   * something you add to a day in a different city. Trips are not either.
   *
   * Only what is actually in reach is shown. A shortlisted lake 300 km away
   * is a real wish and a useless suggestion for today, so it is left out
   * rather than listed with an apologetic distance.
   */
  // The shortlist's map points (resolved from the published layer files).
  const shortlistPoints = useShortlistPoints(favorites);

  const shortlistDeck = useMemo(() => {
    if (!favorites || !favorites.size || !stop?.dest || !shortlistPoints.length) return [];
    const out = [];
    const taken = new Set();
    for (const pt of shortlistPoints) {
      let best = null;
      activities.items.forEach((item, idx) => {
        if (taken.has(idx) || activities.suppressed.has(idx)) return;
        if (item.lat == null || item.lon == null) return;
        const km = haversineKm(pt.lat, pt.lon, item.lat, item.lon);
        if (km == null || km > SHORTLIST_SNAP_KM) return;
        if (!best || km < best.km) best = { item, idx, km };
      });
      if (!best) continue;
      taken.add(best.idx);
      // The note says what the traveller starred, which is the point: the POI
      // harvest often knows this place under a different name, and without
      // this the row looks like an ordinary suggestion that wandered in.
      // Never repeat the heading above it, which already says "Your shortlist".
      out.push({
        item: best.item,
        idx: best.idx,
        note: pt.name && pt.name !== best.item.name ? t('fav.snapped', { name: pt.name }) : null,
      });
    }
    return out.slice(0, 6);
  }, [favorites, shortlistPoints, activities, stop, t]);

  // Name/kind search over the full catalogue, strongest matches first, with
  // an honest distance note on anything beyond walking range. Diacritic-folded
  // so "etoile" finds "Maison de l'Étoile".
  const poiSearch = useMemo(() => {
    const q = searchFold(poiQuery);
    if (q.length < 2 || !stop?.dest) return [];
    const centre = cityCoords(stop.dest);
    return activities.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ idx }) => !activities.suppressed.has(idx))
      .filter(({ item }) => !isTransportInfraPoi(item))
      .filter(({ item }) => searchFold(item.name).includes(q)
        || searchFold(item.kind).includes(q))
      .sort((a, b) => poiScore(b.item) - poiScore(a.item))
      .slice(0, 12)
      .map((e) => {
        const km = (e.item.lat != null && centre.lat != null)
          ? haversineKm(centre.lat, centre.lon, e.item.lat, e.item.lon)
          : null;
        return {
          ...e,
          note: km != null && km > MAX_POI_KM_FROM_CITY
            ? t('day.kmFromTrip', { km: Math.round(km), city: stop.dest.city })
            : null,
        };
      });
  }, [poiQuery, activities, stop, t]);
  return { mapPois, farSights, shortlistPoints, shortlistDeck, poiSearch };
}
