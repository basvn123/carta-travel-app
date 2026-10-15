/**
 * The 3D view of a map (T430, carta-design "3D terrain map", owner decision
 * 2026-10-15). Off by default; the traveller turns it on with the 2D / 3D
 * control under the map (MapTools.jsx). The route, pins and the scrub marker
 * stay where they are: setTerrain drapes every layer on the relief.
 *
 * The elevation tiles come from lib/terrainSource.js (Mapterhorn's public
 * tiles today, an R2 mirror once T233 lands). Nothing is requested until 3D
 * is asked for, so a page that stays flat costs no terrain bytes. The
 * hillshade is drawn from its own source, as MapLibre recommends, so the
 * shading and the 3D mesh do not fight over one tile cache.
 *
 * The camera eases within --dur-4 and only ever moves because the traveller
 * asked: no orbit, no fly-through (the 3D rule). Under reduced motion it
 * jumps.
 */
import { terrainSourceSpec } from './terrainSource.js';
import { tokenColour } from '../map/tokenColors.js';
import { durationMs } from './motion.js';

const DEM = 'carta-dem';
const SHADE_SRC = 'carta-dem-shade';
const SHADE = 'carta-hillshade';

/** True when this build can draw terrain at all (the mirror needs T233-d). */
export function terrainAvailable(env) {
  const { needsPmtilesProtocol } = terrainSourceSpec(env);
  return !needsPmtilesProtocol;
}

function firstLineLayer(map, preferred) {
  const style = map.getStyle?.();
  const ids = (style?.layers || []).map((l) => l.id);
  for (const id of preferred) if (ids.includes(id)) return id;
  // Otherwise under the first symbol layer, so labels stay on top.
  const sym = (style?.layers || []).find((l) => l.type === 'symbol');
  return sym ? sym.id : undefined;
}

/**
 * Turn the relief on. `beneath` lists the page's own route layers, the
 * hillshade goes under the first of them. Returns a promise that settles
 * once the call is made; errors from the tiles are reported to `onFail`.
 */
export function enableTerrain(map, { beneath = [], exaggeration = 1.4, pitch = 60, onFail } = {}) {
  if (!map) return;
  const { spec } = terrainSourceSpec();
  try {
    if (!map.getSource(DEM)) map.addSource(DEM, { ...spec });
    if (!map.getSource(SHADE_SRC)) map.addSource(SHADE_SRC, { ...spec });
    if (!map.getLayer(SHADE)) {
      map.addLayer({
        id: SHADE,
        type: 'hillshade',
        source: SHADE_SRC,
        paint: {
          'hillshade-shadow-color': tokenColour('--text'),
          'hillshade-highlight-color': tokenColour('--surface'),
          'hillshade-accent-color': tokenColour('--text-2'),
          'hillshade-exaggeration': 0.35,
        },
      }, firstLineLayer(map, beneath));
    }
    map.setTerrain({ source: DEM, exaggeration });
  } catch (err) {
    onFail?.(err);
    return;
  }
  if (onFail) {
    const watch = (e) => {
      if (e?.sourceId === DEM || e?.sourceId === SHADE_SRC) {
        map.off('error', watch);
        onFail(e.error || e);
      }
    };
    map.on('error', watch);
    map._cartaTerrainWatch = watch;
  }
  map.dragRotate?.enable();
  map.touchPitch?.enable();
  map.easeTo({ pitch, bearing: map.getBearing() || -12, duration: durationMs('--dur-4') });
}

/** Back to the flat map: no relief, no tilt, north up. */
export function disableTerrain(map) {
  if (!map) return;
  try {
    map.setTerrain(null);
    if (map.getLayer(SHADE)) map.removeLayer(SHADE);
  } catch { /* the style may already be gone */ }
  if (map._cartaTerrainWatch) { map.off('error', map._cartaTerrainWatch); map._cartaTerrainWatch = null; }
  map.dragRotate?.disable();
  map.touchPitch?.disable();
  map.easeTo({ pitch: 0, bearing: 0, duration: durationMs('--dur-4') });
}
