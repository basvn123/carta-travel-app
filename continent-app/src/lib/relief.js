/**
 * The relief (G1, house style 2026-11, DESIGN.md "Signature graphics"): the
 * one background graphic, drawn only from real ground. Illuminated contours
 * (Tanaka style: lit where the slope faces the north-west, shaded elsewhere)
 * built from a place's own peaks in its dossier (`nearby.mountains[]` or
 * `around.mountains[]`: name, km, bearing, elev_m). Honest by construction:
 *
 *   - no peak with a height in the data, no relief (the caller shows nothing);
 *   - every relief prints at least one real height ("Kleť 1,087 m");
 *   - prices are never drawn as terrain;
 *   - east-west keeps the true scale, north-south is squeezed to the band.
 *
 * Pure: numbers in, SVG path strings and label spots out. About 1 to 3 ms for
 * a 600 x 160 band; Relief.jsx memoises per size and seed.
 */

const BEAR = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/** The peaks a relief may use: a name, a height, a distance and a bearing. */
export function reliefPeaks(mountains, max = 4) {
  return (mountains || [])
    .filter((m) => m && m.name && Number.isFinite(m.elev_m) && Number.isFinite(m.km) && BEAR[m.bearing] != null)
    .sort((a, b) => b.elev_m - a.elev_m)
    .slice(0, max)
    .map((m) => ({ name: m.name, m: Math.round(m.elev_m), km: m.km, b: m.bearing }));
}

function contours(w, h, peaks, seed, levels) {
  const step = w > 700 ? 8 : 6;
  const R = rng(hash(seed));
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
  const fx = (0.8 + R()) / 150;
  const fy = (0.8 + R()) / 150;
  const maxH = Math.max(1, ...peaks.map((p) => p.h));
  const amp = 0.08 * maxH;
  const cols = Math.ceil(w / step) + 2;
  const rows = Math.ceil(h / step) + 2;
  const F = new Float32Array(cols * rows);
  let mn = Infinity;
  let mx = -Infinity;
  for (let j = 0; j < rows; j++) {
    const y = j * step;
    for (let i = 0; i < cols; i++) {
      const x = i * step;
      let v = 0;
      for (const p of peaks) {
        const dx = x - p.x; const dy = y - p.y;
        v += p.h * Math.exp(-(dx * dx + dy * dy) / (2 * p.r * p.r));
      }
      v += amp * (Math.sin(x * fx + ph[0]) * Math.cos(y * fy + ph[1])
        + 0.5 * Math.sin((x * 0.7 - y) * fx * 1.9 + ph[2])
        + 0.25 * Math.cos((x + y * 1.3) * fy * 3.1 + ph[3]));
      F[j * cols + i] = v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  const out = { lit1: [], lit2: [], sh1: [], sh2: [], il: [], is: [] };
  const L = Math.SQRT1_2;
  const f = (n) => Math.round(n * 10) / 10;
  for (let k = 0; k < levels; k++) {
    const t = mn + (k + 0.5) * (mx - mn) / levels;
    const isIdx = k % 5 === 4;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = F[j * cols + i]; const b = F[j * cols + i + 1];
        const c = F[(j + 1) * cols + i + 1]; const d = F[(j + 1) * cols + i];
        let id = 0;
        if (a > t) id |= 8;
        if (b > t) id |= 4;
        if (c > t) id |= 2;
        if (d > t) id |= 1;
        if (id === 0 || id === 15) continue;
        const x0 = i * step; const y0 = j * step;
        const T = [x0 + step * (t - a) / (b - a), y0];
        const Rr = [x0 + step, y0 + step * (t - b) / (c - b)];
        const B = [x0 + step * (t - d) / (c - d), y0 + step];
        const Lf = [x0, y0 + step * (t - a) / (d - a)];
        let segs;
        switch (id) {
          case 1: case 14: segs = [[Lf, B]]; break;
          case 2: case 13: segs = [[B, Rr]]; break;
          case 3: case 12: segs = [[Lf, Rr]]; break;
          case 4: case 11: segs = [[T, Rr]]; break;
          case 5: segs = [[Lf, T], [B, Rr]]; break;
          case 6: case 9: segs = [[T, B]]; break;
          case 7: case 8: segs = [[Lf, T]]; break;
          default: segs = [[T, Rr], [Lf, B]];
        }
        const gx = ((b - a) + (c - d)) / (2 * step);
        const gy = ((d - a) + (c - b)) / (2 * step);
        const lit = L * (gx + gy) / (Math.hypot(gx, gy) || 1);
        const key = isIdx ? (lit > 0 ? 'il' : 'is') : lit > 0 ? (lit > 0.5 ? 'lit1' : 'lit2') : (lit < -0.5 ? 'sh1' : 'sh2');
        for (const s of segs) out[key].push(`M${f(s[0][0])} ${f(s[0][1])}L${f(s[1][0])} ${f(s[1][1])}`);
      }
    }
  }
  return out;
}

/**
 * Lay out a relief for a band of w x h CSS px.
 * @param {Array<{name:string,m:number,km:number,b:string}>} peaks from reliefPeaks()
 * @param {{w:number,h:number,seed?:string,base?:number,km?:number,format?:(n:number)=>string}} opts
 * @returns {null | {paths: Record<string,string>, spots: Array<{x:number,y:number,text:string}>}}
 */
export function layoutRelief(peaks, { w, h, seed = 'relief', base = 400, km = 40, format = (n) => String(n) }) {
  if (!peaks || !peaks.length || w < 8 || h < 8) return null;
  const far = Math.max(...peaks.map((p) => p.km));
  const pxkm = Math.min(w / km, (w * 0.62) / Math.max(1, far));
  const maxNS = Math.max(1, ...peaks.map((p) => Math.abs(Math.cos(BEAR[p.b] * Math.PI / 180) * p.km)));
  const pykm = Math.min(pxkm, (h * 0.62) / maxNS);
  const offs = peaks.map((p) => {
    const th = BEAR[p.b] * Math.PI / 180;
    return [Math.sin(th) * p.km * pxkm, -Math.cos(th) * p.km * pykm];
  }).concat([[0, 0]]);
  const mid = (k) => (Math.min(...offs.map((o) => o[k])) + Math.max(...offs.map((o) => o[k]))) / 2;
  const ccx = Math.min(Math.max(w * 0.5 - mid(0), w * 0.12), w * 0.88);
  const ccy = Math.min(Math.max(h * 0.55 - mid(1), h * 0.2), h * 0.85);
  const field = [];
  const spots = [];
  for (const p of peaks) {
    const th = BEAR[p.b] * Math.PI / 180;
    const x = ccx + Math.sin(th) * p.km * pxkm;
    const y = ccy - Math.cos(th) * p.km * pykm;
    const hh = Math.max(160, p.m - base);
    field.push({ x, y, h: hh, r: Math.max(18, (2.2 + hh / 900) * pxkm) });
    spots.push({ x, y, text: `${p.name} ${format(p.m)} m` });
  }
  field.push({ x: ccx, y: ccy, h: -120, r: Math.max(14, 2.5 * pxkm) });
  const c = contours(w, h, field, seed, 13);
  const join = (a) => a.join('');
  const placed = [];
  const kept = [];
  for (const s of spots) {
    const tw = Math.min(160, 18 + s.text.length * 6.6);
    const x = Math.min(Math.max(s.x, tw / 2 + 10), w - tw / 2 - 6);
    const y = Math.min(Math.max(s.y, 30), h - 6);
    const box = [x - tw / 2, y - 26, x + tw / 2, y];
    if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    kept.push({ x, y, text: s.text });
  }
  return {
    paths: { sh2: join(c.sh2), sh1: join(c.sh1), lit2: join(c.lit2), lit1: join(c.lit1), is: join(c.is), il: join(c.il) },
    spots: kept,
  };
}
