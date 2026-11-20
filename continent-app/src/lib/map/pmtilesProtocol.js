/**
 * The pmtiles:// protocol for MapLibre and the CARTO fallback (G12).
 *
 * MapLibre reads a PMTiles archive through a custom protocol: each tile is a
 * byte range of one file on the data host, so there is no tile server.
 * registerPmtiles runs once per page however many maps open; the PMTiles
 * instance it keeps is shared, so the archive's header and directories are
 * fetched once and every later map starts from the cache.
 *
 * basemapFallback switches a map to CARTO's style when our archive cannot be
 * read at all (the header request fails: host down, CORS refused on an
 * unlisted preview origin). A single failed tile is not a reason to switch.
 * The switch keeps the caller's own sources and layers (everything that is
 * not `base-` on the protomaps source) and keeps our glyphs for their labels.
 */
import { PMTiles, Protocol } from 'pmtiles';
import { BASEMAP_SOURCE, BASEMAP_URL, CARTO_FALLBACK_STYLE, FONT_REGULAR } from './cartaMapStyle.js';

let protocol = null;

/** Register pmtiles:// on this maplibre module once; returns the protocol. */
export function registerPmtiles(maplibregl) {
  if (protocol) return protocol;
  protocol = new Protocol({ metadata: false });
  protocol.add(new PMTiles(BASEMAP_URL));
  maplibregl.addProtocol('pmtiles', protocol.tile);
  return protocol;
}

/** The base style's own parts, told apart from a caller's layers. */
export function isBaseLayer(layer) {
  return layer?.source === BASEMAP_SOURCE || String(layer?.id || '').startsWith('base-');
}

/**
 * The fallback style: CARTO's layers under the caller's own sources and
 * layers from `prev`. CARTO's labels are pointed at our glyph stacks, because
 * the style keeps our glyphs URL so the caller's text layers still find
 * their font.
 */
export function mergeFallback(prev, next) {
  const own = Object.fromEntries(Object.entries(prev?.sources || {}).filter(([id]) => id !== BASEMAP_SOURCE));
  const layers = (next?.layers || []).map((l) => (
    l.layout?.['text-font'] ? { ...l, layout: { ...l.layout, 'text-font': FONT_REGULAR } } : l));
  return {
    ...next,
    glyphs: prev?.glyphs || next?.glyphs,
    sources: { ...(next?.sources || {}), ...own },
    layers: [...layers, ...(prev?.layers || []).filter((l) => !isBaseLayer(l))],
  };
}

/**
 * Watch a map built on cartaMapStyle and move it to CARTO once if the
 * archive's header cannot be read. `onFallback` hears about it (a verify
 * seam and a console line in development).
 */
export function basemapFallback(map, { onFallback } = {}) {
  let done = false;
  const onError = async (e) => {
    if (done || e?.sourceId !== BASEMAP_SOURCE) return;
    try {
      await (protocol?.get(BASEMAP_URL) || new PMTiles(BASEMAP_URL)).getHeader();
      return; // the archive reads; a lone tile failed
    } catch { /* the archive is unreachable: fall back */ }
    if (done) return;
    done = true;
    map.off('error', onError);
    map.setStyle(CARTO_FALLBACK_STYLE, { transformStyle: mergeFallback });
    onFallback?.(e?.error);
  };
  map.on('error', onError);
  return () => map.off('error', onError);
}
