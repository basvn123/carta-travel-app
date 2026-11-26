/**
 * The house basemap (G1, house style 2026-11, DESIGN.md "Map"): the CARTO
 * Voyager style every map loads, repainted in the house colours so the map
 * sits on the same stone ground as the page: pale land, the grey-blue
 * water of the Line palette, soft borders. Labels, roads and the app's own
 * layers (routes, pins) are untouched; their colours come from the screens
 * through tokenColour().
 *
 *   const map = new maplibregl.Map({ ... });
 *   houseBasemap(map);
 *
 * Runs on every 'style.load' (the first load and any basemap switch) and
 * never throws: a layer the style renamed is skipped, so a provider change
 * leaves the stock colours rather than a broken map.
 */
import { tokenColour } from './tokenColors.js';
import { isCartaBasemap } from '../lib/map/cartaMapStyle.js';

function paint(map, id, prop, value) {
  try { map.setPaintProperty(id, prop, value); } catch { /* layer or property absent */ }
}

export function applyHouseBasemap(map) {
  const style = map?.getStyle?.();
  if (!style?.layers) return;
  // G12: the Viantra basemap is drawn in the house palette already; repainting
  // its background would turn the sea into land.
  if (isCartaBasemap(style)) return;
  const land = tokenColour('--map-land');
  const water = tokenColour('--map-water');
  const border = tokenColour('--map-border');
  for (const layer of style.layers) {
    const id = layer.id || '';
    if (layer.type === 'background') paint(map, id, 'background-color', land);
    else if (layer.type === 'fill' && /water/.test(id)) paint(map, id, 'fill-color', water);
    else if (layer.type === 'line' && /^waterway/.test(id)) paint(map, id, 'line-color', water);
    else if (layer.type === 'fill' && /^(landcover|landuse|park)/.test(id)) paint(map, id, 'fill-opacity', 0.35);
    else if (layer.type === 'line' && /boundary/.test(id)) paint(map, id, 'line-color', border);
  }
}

/** Repaint now and on every later style load. */
export function houseBasemap(map) {
  if (!map?.on) return;
  map.on('style.load', () => applyHouseBasemap(map));
  if (map.isStyleLoaded?.()) applyHouseBasemap(map);
}
