/**
 * The outdoor layers inside Explore (T498, roadmap 1.3b): the small pure
 * rules the five layers share now that they sit beside Places.
 *
 *   baseOfOutdoor   the town an item already names as its base (a beach's
 *                   and a lake's `base`, a mountain's `near`, a walk's
 *                   associated town), for the "Bed and food in {city}" line
 *   pointOfOutdoor  where an item sits, for the nearest priced town when it
 *                   names none (a cycle route) and for its pin on the map
 *   mapRowOf        an item as a row the Explore map can draw
 *   regionsForLayer the coasts, ranges and regions of one country that hold
 *                   this layer, fullest first: the door row over a layer's
 *                   list once a country is picked (T489-i)
 *
 * Layers are the Explore category keys: trails, beaches, lakes, mountains,
 * cycling.
 */

const LAYER_COUNT_KEY = {
  trails: 'trail', beaches: 'beach', lakes: 'lake', mountains: 'mountain', cycling: 'cycling',
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** { id, city } of the town the item names as its base, or null. A walk
 *  passes its card ({ tr, assoc }). */
export function baseOfOutdoor(layer, row) {
  if (!row) return null;
  if (layer === 'beaches' || layer === 'lakes') {
    const b = row.base;
    return b && b.id ? { id: String(b.id), city: b.city || '' } : null;
  }
  if (layer === 'mountains') {
    const n = row.near;
    return n && n.dest_id ? { id: String(n.dest_id), city: n.city || '' } : null;
  }
  if (layer === 'trails') {
    const a = row.assoc;
    return a && a.destId ? { id: String(a.destId), city: a.dest?.city || '' } : null;
  }
  return null;
}

function bboxCentre(bbox) {
  return Array.isArray(bbox) && bbox.length === 4 && bbox.every(finite)
    ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
    : null;
}

/** { lat, lon } of an item, or null. */
export function pointOfOutdoor(layer, row) {
  if (!row) return null;
  if (layer === 'trails') {
    const tr = row.tr || row;
    if (tr.category === 'citytrip' && finite(tr.anchor?.lat) && finite(tr.anchor?.lon)) {
      return { lat: tr.anchor.lat, lon: tr.anchor.lon };
    }
    return bboxCentre(tr.bbox);
  }
  if (finite(row.lat) && finite(row.lon)) return { lat: row.lat, lon: row.lon };
  return bboxCentre(row.bbox);
}

/** The id a layer item carries on the shared map (unique across layers). */
export const mapIdOf = (layer, id) => `${layer}:${id}`;

/**
 * An item as an Explore map row: the map draws ink dots by rating tier,
 * labels the best in view with the name and a day figure, and hands back
 * the id on a tap. `cost` is the nearest town's cost row (or null), so the
 * figure on a pin is the "Bed and food" figure on the card.
 */
export function mapRowOf(layer, row, { name, cc, country, where = '', score = null, image = null, cost = null }) {
  const at = pointOfOutdoor(layer, row);
  if (!at) return null;
  const id = layer === 'trails' ? (row.tr || row).id : row.id;
  const s = finite(score) ? score : null;
  return {
    id: mapIdOf(layer, id),
    city: name,
    country: country || cc || '',
    iso2: cc || '',
    lat: at.lat,
    lon: at.lon,
    // The map inks a dot by tier; a score out of ten maps onto the same
    // three steps the catalogue uses.
    rating: s == null ? null : { score: s, tier: s >= 8.5 ? 3 : s >= 7.5 ? 2 : s >= 6 ? 1 : 0 },
    place: { class: 'town' },
    image,
    blurb: where,
    cost: cost || {},
  };
}

/** A country's regions that hold this layer, the ones with the most of it
 *  first. `index` is loadRegionIndex()'s result. */
export function regionsForLayer(index, iso2, layer, limit = 8) {
  const key = LAYER_COUNT_KEY[layer];
  if (!index || !Array.isArray(index.regions) || !iso2 || !key) return [];
  const rank = { coast: 0, range: 1, nuts2: 2 };
  return index.regions
    .filter((r) => r.country === iso2 && (r.counts?.[key] || 0) > 0)
    .sort((a, b) => ((b.counts[key] || 0) - (a.counts[key] || 0))
      || ((rank[a.kind] ?? 3) - (rank[b.kind] ?? 3))
      || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}
