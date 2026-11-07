import { useMemo, useCallback } from 'react';
import { usePlaceRows } from '../../hooks/usePlaceRows.js';
import { baseOfOutdoor, pointOfOutdoor, mapRowOf } from '../../lib/exploreLayers.js';
import { nearestPriced } from '../../lib/regions.js';
import { isNational } from '../../components/CostSummary.jsx';
import { displayName, placeLine } from '../../lib/cardFillings.js';
import { firstOkImage, okPhoto } from '../../lib/photoVeto.js';
import { norm, lineStartOf } from './destTabConsts.js';
import { routeTitle } from '../../lib/cycleStory.js';

export function useDestMapItems({
  applyRail, beachRows, cat, country, countryName, cycleRows, data, indices, isActive,
  isCycleCat, isDesktop, lakeRows, lang, mountainRows, openCycleRoute, openNeighbour, opening,
  q, setPageBeach, setPageCard, setPageLake, setPageMountain, t, topTrails, trailPass,
  trailsCountry, tripRows,
}) {
  // The By country track is one of the rails (T457): four on a desktop and
  // three on a phone in all, as on Explore, so the full list comes after the
  // same number of rails as Explore's "All places" does.
  // T622 (owner 2026-10-23: "the by country section needs to go, use the
  // country filter"): Countries is a control in the filter row, so no rail
  // is spent on a country track any more.
  const hasCountryTrack = false;
  const railCap = (isDesktop ? 4 : 3) - (hasCountryTrack ? 1 : 0);
  const openingRails = useMemo(() => {
    if (!opening) return { rails: [], starters: [] };
    const all = [];
    if (opening.icons.length >= 3) {
      all.push({
        key: 'best',
        title: opening.layer === 'trail' && !opening.europe
          ? t('dtab.railBestTrail', { country: countryName(country) })
          : t(`dtab.railBest.${opening.layer}`),
        rows: opening.icons,
        onSeeAll: null,
      });
    }
    // A place is shown once across the rails where it can be (row T444-d:
    // Voidokilia stood in three of them); a rail that would drop under four
    // keeps its own order rather than go thin.
    const seen = new Set(all.flatMap((r) => r.rows.map((x) => x.id)));
    for (const r of opening.rails) {
      const fresh = r.rows.filter((x) => !seen.has(x.id));
      const rows = fresh.length >= 4 ? fresh : r.rows;
      rows.forEach((x) => seen.add(x.id));
      all.push({
        key: r.def.key,
        title: t(r.def.titleKey),
        rows,
        onSeeAll: opening.europe ? null : () => applyRail(opening.layer, r.def.facets),
      });
    }
    return {
      rails: all.slice(0, railCap),
      starters: all.slice(railCap).filter((r) => r.onSeeAll)
        .map((r) => ({ key: r.key, title: r.title, onPick: r.onSeeAll })),
    };
    // applyRail only calls the setters, which are stable.
    // T1163: applyRail now arrives as an argument, fresh each render; the deps
    // stay as they were in DestinationsTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening, railCap, t, country, countryName]);
  // In the Full list view every saved cut is a door over the list.
  const openingDoors = useMemo(() => [
    ...openingRails.rails.filter((r) => r.onSeeAll)
      .map((r) => ({ key: r.key, title: r.title, onPick: r.onSeeAll })),
    ...openingRails.starters,
  ], [openingRails]);
  // ── Bed and food, the map, the region doors (T498, roadmap 1.3b) ──────
  //
  // "Bed and food in {city}" on an outdoor card (owner answer T489-d): the
  // town the item names as its base, else (a cycle route) the nearest priced
  // town within 25 km, priced from the same cost index the Explore card
  // reads. One object per item while the prices stand, so the memoised
  // cards keep their identity across renders.
  const outdoorCat = cat !== 'trips';
  const placeRows = usePlaceRows(data, indices, isActive && isCycleCat && !!indices);
  // A fresh cache whenever the prices or the towns change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseCache = useMemo(() => new Map(), [indices, placeRows]);
  const bedFood = useCallback((layer, row) => {
    if (!indices || !row) return null;
    const id = layer === 'trails' ? row.tr?.id : row.id;
    const key = `${layer}:${id}`;
    if (baseCache.has(key)) return baseCache.get(key);
    let base = baseOfOutdoor(layer, row);
    if (!base && layer === 'cycling') {
      const near = nearestPriced(placeRows, pointOfOutdoor(layer, row), row.cc, 25);
      if (near) base = { id: near.id, city: near.city };
    }
    const cost = base ? indices.get(base.id) : null;
    const out = cost && cost.dayEur != null
      ? { city: base.city || data?.destinations?.[base.id]?.city || '', dayEur: cost.dayEur, est: isNational(cost), cost }
      : null;
    baseCache.set(key, out);
    return out;
  }, [indices, baseCache, placeRows, data]);

  // The layer's list as map rows, List | Map like Places (owner T489-c).
  const mapItems = useMemo(() => {
    if (!outdoorCat || !isActive) return [];
    const out = [];
    const push = (layer, row, name, cc, where, score, image) => {
      const base = bedFood(layer, row);
      const m = mapRowOf(layer, row, {
        name, cc, country: countryName(cc), where, score, image, cost: base?.cost || null,
      });
      if (m) out.push({ m, layer, row });
    };
    if (cat === 'beaches') for (const { b } of beachRows || []) push('beaches', b, displayName(b.name), b.cc, placeLine(b.region, countryName(b.cc)), b.v5?.score, firstOkImage(b.images)?.u);
    else if (cat === 'lakes') for (const { b } of lakeRows || []) push('lakes', b, displayName(b.name), b.cc, placeLine(b.region, countryName(b.cc)), b.v5?.score, firstOkImage(b.images)?.u);
    else if (cat === 'mountains') for (const { b } of mountainRows || []) push('mountains', b, displayName(b.name), b.cc, placeLine(b.range || b.region, countryName(b.cc)), b.v5?.score, firstOkImage(b.images)?.u);
    else if (cat === 'trails' && tripRows) for (const { c } of tripRows) push('trails', c, displayName(c.tr.name), c.tr.cc || c.tr.country, countryName(c.tr.cc || c.tr.country), c.tr.v5?.score, okPhoto(c.assoc?.photoUrl));
    // T600: with no country, the Europe-wide best walks (trails/top.json,
    // already loaded for the rails), under the same chips and search text.
    else if (cat === 'trails' && !trailsCountry && topTrails?.length) {
      for (const tr of topTrails) {
        if (q && !norm(tr.name).includes(q)) continue;
        if (!trailPass(tr)) continue;
        push('trails', { tr }, displayName(tr.name), tr.country, countryName(tr.country), tr.v5?.score, okPhoto(tr.img));
      }
    }
    else if (cat === 'cycling') for (const r of cycleRows?.routes || []) push('cycling', r, routeTitle(r, t), r.cc, countryName(r.cc), r.v5?.score, okPhoto(r.img));
    return out;
  }, [outdoorCat, isActive, cat, beachRows, lakeRows, mountainRows, tripRows, cycleRows, bedFood, countryName, t,
    trailsCountry, topTrails, q, trailPass]);
  // T593: a walk or a ride is drawn as its line (the list rows carry the
  // simplified one), its pin moved to the start with the length on it.
  const routeMap = useMemo(() => {
    if (cat !== 'trails' && cat !== 'cycling') return null;
    const features = [];
    const starts = new Map();
    mapItems.forEach(({ m, row }, i) => {
      const geometry = cat === 'trails' ? row.tr?.geometry : row.geometry;
      const at = lineStartOf(geometry);
      if (!at) return;
      const km = cat === 'trails' ? (row.tr?.distance_m ?? 0) / 1000 : row.km;
      const label = Number.isFinite(km) && km > 0
        ? t('where.km', { n: km.toLocaleString(lang, { maximumFractionDigits: km < 10 ? 1 : 0 }) })
        : '';
      starts.set(m.id, at);
      features.push({ type: 'Feature', geometry, properties: { id: m.id, label, rank: i } });
    });
    return features.length ? { lines: { type: 'FeatureCollection', features }, starts } : null;
  }, [cat, mapItems, t, lang]);
  const mapRows = useMemo(() => mapItems.map(({ m }) => {
    const at = routeMap?.starts.get(m.id);
    return at ? { ...m, lon: at[0], lat: at[1] } : m;
  }), [mapItems, routeMap]);
  const openMapItem = useCallback((id) => {
    const hit = mapItems.find((x) => x.m.id === id);
    if (!hit) return;
    if (hit.layer === 'beaches') setPageBeach(hit.row);
    else if (hit.layer === 'lakes') setPageLake(hit.row);
    else if (hit.layer === 'mountains') setPageMountain(hit.row);
    // A Europe-wide walk has no country list behind it (T600): its card is
    // built the way a neighbour's is.
    else if (hit.layer === 'trails') { if (hit.row.assoc) setPageCard(hit.row); else openNeighbour('trail', hit.row.tr); }
    else if (hit.layer === 'cycling') openCycleRoute(hit.row);
    // openNeighbour only calls setters and reads the catalogue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapItems, openCycleRoute]);
  return { openingRails, openingDoors, outdoorCat, bedFood, routeMap, mapRows, openMapItem };
}
