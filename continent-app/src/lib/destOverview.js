/**
 * The pure half of the destination page's tabs and Overview (T499, roadmap
 * 1.4, Roadmap/1.4-bestemmingspagina.md): which tab the address names, the
 * "Around {city}" categories built from the dossier, the default chip, the
 * kinds that are empty, and the outdoor rows the PDF prints. No React, no
 * DOM, so tests/destOverview.test.mjs can run it in node.
 */

/** The four tabs, always the same four, in order (owner answer T491-a). */
export const DEST_TABS = ['overview', 'nearby', 'when', 'practical'];

function hashParams(hash) {
  const raw = String(hash || '');
  return new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw);
}

/** The tab the address names for this place (#dest=FCO&tab=nearby), or null
 *  when the address names another place, no tab or an unknown one. */
export function tabFromHash(hash, destId) {
  if (!destId) return null;
  const p = hashParams(hash);
  if (p.get('dest') !== String(destId)) return null;
  const tab = p.get('tab');
  return DEST_TABS.includes(tab) ? tab : null;
}

/** The address with this tab written in (Overview writes none, so a place's
 *  plain link stays its link), or null when the address does not name this
 *  place: then the page has no address of its own to rewrite (owner answer
 *  T491-b: a tab changes the URL without a history step). */
export function hashWithTab(hash, destId, tab) {
  if (!destId) return null;
  const p = hashParams(hash);
  if (p.get('dest') !== String(destId)) return null;
  if (!tab || tab === 'overview' || !DEST_TABS.includes(tab)) p.delete('tab');
  else p.set('tab', tab);
  // Keep the id readable the way destShareUrl writes it.
  const rest = [...p].filter(([k]) => k !== 'dest')
    .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
  return `#dest=${encodeURIComponent(destId)}${rest}`;
}

/**
 * The categories of "Around {city}", in the one fixed order (Walks, Rides,
 * Peaks, Lakes, Beaches, Day trips). Each outdoor kind joins the dossier's
 * three readings of it, deduplicated by id: `around` (every kind within
 * 20 km), `nearby` (a radius per kind and class, up to 60 km) and `routes`
 * (the waymarked routes measured to their nearest point). Best first, then
 * nearest. Day trips keep the dossier's own order.
 */
export const AROUND_KINDS = [
  { key: 'walks', layer: 'trails', loader: 'trail' },
  { key: 'rides', layer: 'cycling', loader: 'cycling' },
  { key: 'peaks', layer: 'mountains', loader: 'mountain' },
  { key: 'lakes', layer: 'lakes', loader: 'lake' },
  { key: 'beaches', layer: 'beaches', loader: 'beach' },
];
export const AROUND_CAP = 16;

/** A waymarked route row (dossier `routes`) in the shape of an outdoor row. */
function routeAsRow(r) {
  return {
    id: r.id, cc: r.cc, name: r.name, km: r.km,
    bearing: r.dir ? String(r.dir).toUpperCase() : null,
    lat: r.lat, lon: r.lon, km_len: r.km_len ?? null,
    score: r.rating ?? null, tier: null, thumb: null,
  };
}

export function aroundCategories({ around = null, nearby = null, routes = null, trips = [] } = {}) {
  const a = around || {};
  const n = nearby || {};
  const r = routes || {};
  const sources = {
    walks: [a.trails, n.trails, (r.hiking || []).map(routeAsRow)],
    rides: [a.cycling, n.cycling, (r.cycling || []).map(routeAsRow)],
    peaks: [a.mountains, n.mountains],
    lakes: [a.lakes, n.lakes],
    beaches: [a.beaches, n.beaches],
  };
  const cats = AROUND_KINDS.map(({ key, layer, loader }) => {
    const seen = new Map();
    for (const list of sources[key]) {
      for (const f of list || []) {
        if (!f || f.id == null) continue;
        const id = String(f.id);
        const had = seen.get(id);
        // The first reading wins; a later one only fills what it lacked (a
        // route row has no photograph, the around row of the same path has).
        if (had) {
          for (const k of ['thumb', 'score', 'tier', 'km_len', 'lat', 'lon']) {
            if (had[k] == null && f[k] != null) had[k] = f[k];
          }
          continue;
        }
        seen.set(id, { ...f, layer, key: `${layer}:${id}` });
      }
    }
    const rows = [...seen.values()].sort((x, y) => (y.score ?? -1) - (x.score ?? -1)
      || (x.km ?? 99) - (y.km ?? 99));
    return { key, layer, loader, rows: rows.slice(0, AROUND_CAP), count: rows.length };
  });
  const tripRows = (trips || []).slice(0, AROUND_CAP);
  cats.push({ key: 'trips', layer: 'trips', loader: null, rows: tripRows, count: (trips || []).length });
  return cats;
}

/** The chip chosen on arrival (owner answer T491-e): the category with the
 *  most items when it has at least two, else the first with any, in the
 *  fixed order. Null when every category is empty. */
export function defaultAroundKey(cats) {
  const filled = (cats || []).filter((c) => c.count > 0);
  if (!filled.length) return null;
  let best = filled[0];
  for (const c of filled) if (c.count > best.count) best = c;
  return best.count >= 2 ? best.key : filled[0].key;
}

/** The outdoor kinds with nothing in any reading: they get no chip, and are
 *  named together in one sentence ("No trail, peak, lake or beach within
 *  20 km of Zungoli."). */
export function emptyOutdoorKinds(cats) {
  return (cats || []).filter((c) => c.key !== 'trips' && c.count === 0);
}

/** The noun list for that sentence, in the language's own "or" list. */
export function kindsList(nouns, lang = 'en') {
  const words = (nouns || []).filter(Boolean);
  if (words.length <= 1) return words[0] || '';
  try {
    // British English, as the app's dates: no serial comma before 'or'.
    return new Intl.ListFormat(lang === 'en' ? 'en-GB' : lang, { type: 'disjunction' }).format(words);
  } catch {
    return words.join(', ');
  }
}

/**
 * The outdoor rows the PDF prints (row T491-k): the dossier's `around` (20 km)
 * first, then the `nearby` rows it does not already hold (Rome's lakes beyond
 * 20 km, four of Valbona's five peaks), deduplicated by id, so the PDF lists
 * what the page lists. `km` is the radius that covers every row printed, so
 * the heading never claims less than the list shows.
 */
const PDF_LAYERS = ['trails', 'cycling', 'mountains', 'lakes', 'beaches'];
export function pdfOutdoorRows(around, nearby, perLayer = 6) {
  const a = around || {};
  const n = nearby || {};
  const layers = [];
  let km = a.radius_km || 20;
  for (const layer of PDF_LAYERS) {
    const own = a[layer] || [];
    const ids = new Set(own.map((r) => String(r.id)));
    const extra = (n[layer] || []).filter((r) => r && r.id != null && !ids.has(String(r.id))
      && (ids.add(String(r.id)) || true));
    const rows = [...own, ...extra];
    if (!rows.length) continue;
    const shown = rows.slice(0, perLayer);
    for (const r of shown) if (Number.isFinite(r.km)) km = Math.max(km, Math.ceil(r.km));
    const count = (a.counts?.[layer] ?? own.length) + extra.length;
    layers.push({ layer, rows: shown, count });
  }
  return { layers, km };
}
