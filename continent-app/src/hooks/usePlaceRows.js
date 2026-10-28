import { useMemo } from 'react';
import { duplicateHeroes } from '../lib/heroImage.js';
import { dedupeGateways } from './useExploreCatalog.js';

/**
 * The catalogue as Explore's rows, for the pages hoisted above the views
 * (T498: the country page and the region page open from Explore, from an
 * outdoor layer and from a shared link alike, so they cannot borrow the
 * Explore tab's own list). The same projection useExploreCatalog makes,
 * without its filters: one row per place, gateways merged, the day cost
 * from the shared cost index attached, so a figure here is the figure on
 * the Explore card.
 *
 * `enabled` false returns an empty list and computes nothing: the pages
 * that read this are closed most of the time.
 */
export function usePlaceRows(data, indices, enabled = true) {
  const dupHeroes = useMemo(
    () => (enabled && data ? duplicateHeroes(data.destinations) : new Set()),
    [data, enabled],
  );
  return useMemo(() => {
    if (!enabled || !data?.destinations) return [];
    const rows = [];
    for (const [id, d] of Object.entries(data.destinations)) {
      if (d.lat == null || d.lon == null) continue;
      rows.push({
        id,
        tier: d.tier,
        gateway_of: d.gateway_of || null,
        city: d.city,
        country: d.country,
        iso2: d.iso2,
        lat: d.lat,
        lon: d.lon,
        categories: d.categories || [],
        rating: d.rating || null,
        place: d.place || null,
        local_transport: d.local_transport || null,
        country_rank: d.country_rank ?? null,
        country_badge: d.country_badge ?? null,
        image: dupHeroes.has(id) ? null : (d.image?.url || null),
        climate: d.climate || null,
        cost: indices?.get(id) || {},
      });
    }
    return dedupeGateways(rows);
  }, [data, indices, dupHeroes, enabled]);
}
