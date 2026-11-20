/**
 * The Carta basemap style (G12, .work/2026-11-20-map-view/decision.md "Base
 * map"): Protomaps vector tiles from a Europe PMTiles extract on our own data
 * host, drawn in the house colours with few labels.
 *
 *   import maplibregl from '../../map/maplibre.js';
 *   import { registerPmtiles, basemapFallback } from './pmtilesProtocol.js';
 *   registerPmtiles(maplibregl);
 *   const map = new maplibregl.Map({ style: cartaMapStyle({ dark, lang }), ... });
 *   basemapFallback(map);
 *
 * Why our own tiles: CARTO's free basemap is for non-commercial use and its
 * hosted tiles cannot be recoloured; Protomaps' styles are CC0, the tiles
 * ODbL (OpenStreetMap credit) and R2 has no egress fee
 * (.work/2026-11-20-map-view/explore-references.md, docs/tos/data_licenses.md).
 *
 * The map is a quiet ground for the pins: land, water, borders, parks from
 * zoom 8, roads only from city zoom (10), and few labels: seas, countries in
 * spaced capitals until zoom 7, then only the larger towns, lakes from 9.
 * Every layer id starts with `base-` and reads the `protomaps` source, so a
 * caller's own layers are told apart from the basemap (basemapFallback keeps
 * them across a style switch).
 *
 * Schema: Protomaps basemap tiles v4 (layers earth, landuse, water, roads,
 * boundaries, places; https://docs.protomaps.com/basemaps/layers).
 */
import { BASEMAP_COLOURS } from '../../map/tokenColors.js';

// The data host serves R2's data/ prefix (src/lib/dataHost.js); the basemap
// lives only there, never in public/, so dev and preview builds read the
// same files as production.
export const MAPS_BASE = 'https://data.carta-europetravel.com/data/maps';
// The extract's build date names it; a refresh uploads a new file and changes
// this line (docs/owner/maps-refresh.md, scripts/maps/refresh-basemap.mjs).
export const BASEMAP_FILE = 'europe-2026-11-18.pmtiles';
export const BASEMAP_URL = `${MAPS_BASE}/${BASEMAP_FILE}`;
export const GLYPHS_URL = `${MAPS_BASE}/fonts/{fontstack}/{range}.pbf`;
// Hosted for layers that want Protomaps icons; the Carta style draws none, so
// it does not name a sprite and saves two requests at open.
export const SPRITE_URL = (dark) => `${MAPS_BASE}/sprites/v4/${dark ? 'dark' : 'light'}`;
export const BASEMAP_SOURCE = 'protomaps';
export const BASEMAP_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
// Used only when our tiles fail (basemapFallback); the app's maps used it
// before G12.
export const CARTO_FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export const FONT_REGULAR = ['Noto Sans Regular'];
export const FONT_MEDIUM = ['Noto Sans Medium'];
export const FONT_ITALIC = ['Noto Sans Italic'];

/** Whether a style object is this basemap (houseBasemap leaves it alone). */
export function isCartaBasemap(style) {
  return Boolean(style?.metadata?.['carta:basemap']);
}

function nameField(lang) {
  const local = /^[a-z]{2}$/.test(String(lang || '')) ? `name:${lang}` : 'name:en';
  return ['coalesce', ['get', local], ['get', 'name:en'], ['get', 'name']];
}

/**
 * The MapLibre style object. `dark` picks the dark palette; `lang` (a
 * two-letter code) picks the label language, falling back to English, then
 * the local name.
 */
export function cartaMapStyle({ dark = false, lang = 'en' } = {}) {
  const c = BASEMAP_COLOURS[dark ? 'dark' : 'light'];
  const name = nameField(lang);
  const src = { source: BASEMAP_SOURCE };
  const halo = { 'text-halo-color': c.land, 'text-halo-width': 1.2, 'text-halo-blur': 0.4 };
  return {
    version: 8,
    name: dark ? 'Carta dark' : 'Carta',
    metadata: { 'carta:basemap': dark ? 'dark' : 'light' },
    glyphs: GLYPHS_URL,
    sources: {
      [BASEMAP_SOURCE]: {
        type: 'vector',
        url: `pmtiles://${BASEMAP_URL}`,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      // The sea shows wherever no land polygon is drawn, also before the
      // first tile arrives.
      { id: 'base-background', type: 'background', paint: { 'background-color': c.water } },
      { id: 'base-earth', type: 'fill', ...src, 'source-layer': 'earth',
        filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': c.land } },
      { id: 'base-park', type: 'fill', ...src, 'source-layer': 'landuse', minzoom: 8,
        filter: ['in', 'kind', 'national_park', 'park', 'nature_reserve', 'protected_area', 'forest', 'wood'],
        paint: { 'fill-color': c.park, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10, 1] } },
      { id: 'base-water', type: 'fill', ...src, 'source-layer': 'water',
        filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': c.water } },
      { id: 'base-river', type: 'line', ...src, 'source-layer': 'water', minzoom: 9,
        filter: ['==', 'kind', 'river'],
        paint: { 'line-color': c.water, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 0.6, 18, 10] } },
      // Roads only from city zoom: at country zoom they are noise under the pins.
      { id: 'base-road-minor', type: 'line', ...src, 'source-layer': 'roads', minzoom: 13,
        filter: ['==', 'kind', 'minor_road'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.6, 18, 9] } },
      { id: 'base-road-major', type: 'line', ...src, 'source-layer': 'roads', minzoom: 10,
        filter: ['in', 'kind', 'major_road', 'highway'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 10, 0.8, 14, 2.6, 18, 14] } },
      { id: 'base-border', type: 'line', ...src, 'source-layer': 'boundaries',
        filter: ['<=', 'kind_detail', 2], layout: { 'line-join': 'round' },
        paint: {
          'line-color': c.border,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 8, 1.4, 14, 2],
          'line-dasharray': ['case', ['has', 'disputed'], ['literal', [2, 2]], ['literal', [1, 0]]],
        } },
      // Labels. MapLibre places the last symbol layer first, so the countries,
      // last here, win a collision with a town; the caller's pins sit above all.
      { id: 'base-label-sea', type: 'symbol', ...src, 'source-layer': 'water', minzoom: 3, maxzoom: 9,
        filter: ['in', 'kind', 'sea', 'ocean'],
        layout: { 'text-field': name, 'text-font': FONT_ITALIC, 'text-size': 11,
          'text-letter-spacing': 0.15, 'text-max-width': 8 },
        paint: { 'text-color': c.waterLabel, 'text-halo-color': c.water, 'text-halo-width': 1 } },
      { id: 'base-label-lake', type: 'symbol', ...src, 'source-layer': 'water', minzoom: 9,
        filter: ['in', 'kind', 'lake', 'water'],
        layout: { 'text-field': name, 'text-font': FONT_ITALIC, 'text-size': 11, 'text-max-width': 8 },
        paint: { 'text-color': c.waterLabel, 'text-halo-color': c.water, 'text-halo-width': 1 } },
      // Only the larger towns: a place whose own min_zoom is two levels under
      // the view, so the basemap never names more places than the pins do.
      { id: 'base-label-town', type: 'symbol', ...src, 'source-layer': 'places', minzoom: 6,
        filter: ['all', ['==', ['get', 'kind'], 'locality'], ['<=', ['get', 'min_zoom'], ['-', ['zoom'], 2]]],
        layout: {
          'text-field': name,
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 13],
          'text-padding': 8,
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'sort_key'], ['get', 'min_zoom']],
        },
        paint: { 'text-color': c.label, ...halo } },
      { id: 'base-label-country', type: 'symbol', ...src, 'source-layer': 'places', maxzoom: 7,
        filter: ['==', 'kind', 'country'],
        layout: {
          'text-field': name,
          'text-font': FONT_MEDIUM,
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.25,
          'text-max-width': 7,
          'text-padding': 6,
          'symbol-sort-key': ['coalesce', ['get', 'sort_key'], ['get', 'min_zoom']],
        },
        paint: { 'text-color': c.label, ...halo } },
    ],
  };
}
