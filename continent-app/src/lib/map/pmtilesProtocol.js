/**
 * The pmtiles:// protocol for MapLibre and the CARTO fallback (G12).
 *
 * MapLibre reads a PMTiles archive through a custom protocol: each tile is a
 * byte range of one file on the data host, so there is no tile server.
 * registerPmtiles runs once per page however many maps open; the PMTiles
 * instance it keeps is shared, so the archive's header and directories are
 * fetched once and every later map starts from the cache.
 *
 * The style names the manifest (MANIFEST_URL), not a file: ManifestSource
 * reads basemap.json once, then serves every byte range from the extract it
 * names, or from BASEMAP_FILE when the manifest is missing or malformed.
 *
 * basemapFallback switches a map to CARTO's style when our archive cannot be
 * read at all (the header request fails: host down, CORS refused on an
 * unlisted preview origin). A single failed tile is not a reason to switch.
 * The switch keeps the caller's own sources and layers (everything that is
 * not `base-` on the protomaps source) and keeps our glyphs for their labels.
 */
import { FetchSource, PMTiles, Protocol } from 'pmtiles';
import {
  BASEMAP_SOURCE, BASEMAP_URL, CARTO_FALLBACK_STYLE, FONT_REGULAR, MANIFEST_URL, MAPS_BASE,
} from './cartaMapStyle.js';

let protocol = null;

/**
 * The extract URL a manifest names, or BASEMAP_URL. Only a dated europe
 * file under MAPS_BASE is accepted, so a bad manifest cannot point the map
 * anywhere else.
 */
export function extractUrlFrom(manifest) {
  const name = manifest?.pmtiles;
  return typeof name === 'string' && /^europe-\d{4}-\d{2}-\d{2}\.pmtiles$/.test(name)
    ? `${MAPS_BASE}/${name}` : BASEMAP_URL;
}

/**
 * A PMTiles source keyed by the manifest URL (the style's pmtiles:// URL),
 * reading from the extract the manifest names. The manifest is read once per
 * page; a fetch that fails or takes over 3 s falls back to BASEMAP_URL.
 */
export class ManifestSource {
  constructor(manifestUrl = MANIFEST_URL, fetchImpl = (...a) => fetch(...a)) {
    this.manifestUrl = manifestUrl;
    this.fetchImpl = fetchImpl;
    this.inner = null;
  }

  getKey() { return this.manifestUrl; }

  resolve() {
    if (!this.inner) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), 3000);
      this.inner = this.fetchImpl(this.manifestUrl, { signal: ctrl?.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((m) => { clearTimeout(timer); return new FetchSource(extractUrlFrom(m)); });
    }
    return this.inner;
  }

  async getBytes(offset, length, signal, etag) {
    return (await this.resolve()).getBytes(offset, length, signal, etag);
  }
}

/** Register pmtiles:// on this maplibre module once; returns the protocol. */
export function registerPmtiles(maplibregl) {
  if (protocol) return protocol;
  protocol = new Protocol({ metadata: false });
  protocol.add(new PMTiles(new ManifestSource()));
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
      await (protocol?.get(MANIFEST_URL) || new PMTiles(new ManifestSource())).getHeader();
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
