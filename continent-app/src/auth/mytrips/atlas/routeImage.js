/**
 * "Deel deze route" (G12, Phase C): the trip's route on the light plate as
 * a square PNG, with its name and figure. No dates: a route shared is a
 * plan, not where the traveller will be and when.
 *
 * Browser only (canvas, Path2D). The plate's colours come from
 * plateColours() (BASEMAP_COLOURS) and the umber from the CSS tokens, so
 * the image matches the map on screen.
 */
import { plateColours } from './plateData.js';
import { tokenColour } from '../../../map/tokenColors.js';

const SIZE = 1080;

const cssVar = (name, fallback) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch { return fallback; }
};

/** The frame round the route's points, square, at least `minW` plate units wide. */
function squareFrame(pts, minW = 260, pad = 0.35) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const w = Math.max((x1 - x0) * (1 + pad * 2), (y1 - y0) * (1 + pad * 2), minW);
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w / 2, w };
}

/**
 * @param geo    the plate (useEuropeMap)
 * @param route  { pts: [[x, y]], name, figure } figure is a ready string or ''
 * @returns Promise<Blob|null>
 */
export async function routeImage(geo, { pts = [], name = '', figure = '' } = {}) {
  if (!geo || !pts.length || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const pc = plateColours();
  const col = { sea: pc['--atlas-sea'], land: pc['--atlas-land'], border: pc['--atlas-border'] };
  const umber = tokenColour('--umber-800');
  const ink = tokenColour('--neutral-900');
  const white = tokenColour('--neutral-0');
  const font = cssVar('--ui', 'system-ui, sans-serif');
  const mapH = SIZE * 0.78;
  const vb = squareFrame(pts);
  const k = SIZE / vb.w;

  g.fillStyle = col.sea || tokenColour('--map-water');
  g.fillRect(0, 0, SIZE, SIZE);
  g.save();
  g.beginPath();
  g.rect(0, 0, SIZE, mapH);
  g.clip();
  g.translate(0, (mapH - SIZE) / 2);
  g.scale(k, k);
  g.translate(-vb.x, -vb.y);
  g.lineWidth = 1.2 / k;
  g.strokeStyle = col.border || tokenColour('--map-border');
  g.fillStyle = col.land || tokenColour('--map-land');
  if (geo.context) { const p = new Path2D(geo.context); g.fill(p); g.stroke(p); }
  (geo.countries || []).forEach((c) => { if (!c.d) return; const p = new Path2D(c.d); g.fill(p); g.stroke(p); });
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  if (pts.length > 1) {
    line(); g.strokeStyle = white; g.lineWidth = 12 / k; g.stroke();
    line(); g.strokeStyle = umber; g.lineWidth = 7 / k; g.stroke();
  }
  pts.forEach(([x, y], i) => {
    g.beginPath();
    g.arc(x, y, (i === 0 ? 13 : 9) / k, 0, Math.PI * 2);
    g.fillStyle = white; g.fill();
    g.lineWidth = 4 / k; g.strokeStyle = umber; g.stroke();
  });
  g.restore();

  // The band under the map: the name, and the figure on the umber mark plate.
  g.fillStyle = tokenColour('--surface-page');
  g.fillRect(0, mapH, SIZE, SIZE - mapH);
  g.fillStyle = ink;
  g.font = `800 64px ${font}`;
  g.textBaseline = 'middle';
  const cy = mapH + (SIZE - mapH) / 2;
  let title = name;
  const maxW = figure ? SIZE * 0.55 : SIZE - 120;
  while (title.length > 4 && g.measureText(title).width > maxW) title = `${title.slice(0, -2).trimEnd()}…`;
  g.fillText(title, 60, cy);
  if (figure) {
    g.font = `800 56px ${font}`;
    const w = g.measureText(figure).width + 90;
    const x = SIZE - 60 - w;
    g.fillStyle = tokenColour('--action');
    g.beginPath();
    g.moveTo(x, cy - 52); g.lineTo(x + w - 34, cy - 52); g.lineTo(x + w, cy); g.lineTo(x + w - 34, cy + 52); g.lineTo(x, cy + 52);
    g.closePath(); g.fill();
    g.fillStyle = white;
    g.fillText(figure, x + 26, cy + 2);
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Offer the image to the system share sheet, else download it. */
export async function shareRouteImage(geo, route, fileName = 'route.png') {
  const blob = await routeImage(geo, route);
  if (!blob) return false;
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: route.name || '' });
      return true;
    }
  } catch { /* cancelled or refused: fall back to the download */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
