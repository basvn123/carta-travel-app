/**
 * Viantra's own hand-drawn region boxes (pipeline/search_index_layer.py:
 * Provence, the Cyclades, the Dolomites...) from search_index.json, one
 * entry per region with every key it answers to. GeoNames' admin1 regions
 * miss most of these, which are the ones travellers type.
 */
export function cartaRegionsFrom(index) {
  const byLabel = new Map();
  for (const [key, r] of Object.entries(index?.regions || {})) {
    if (!r?.bbox || !r.label) continue;
    const e = byLabel.get(r.label) || { label: r.label, bbox: r.bbox, keys: [] };
    e.keys.push(key);
    byLabel.set(r.label, e);
  }
  return [...byLabel.values()];
}
