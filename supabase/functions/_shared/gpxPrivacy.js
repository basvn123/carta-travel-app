/**
 * gpxPrivacy.js, the privacy pass every uploaded track goes through before it
 * leaves the traveller's device (T333, destinations spec 2.8).
 *
 * WHY. A recorded track usually starts and ends at a front door: the flat,
 * the tent, the car. Published as it is, it tells anybody where somebody
 * sleeps, which is a home-address disclosure under the GDPR. A GPX file also
 * carries times to the second, heart rate and cadence in its extensions
 * (health data), the device and sometimes the owner's name and email in its
 * metadata, and waypoints the walker dropped for themselves.
 *
 * WHAT IT DOES. It reads only the geometry (latitude, longitude, elevation)
 * and writes a new file from that alone, so nothing it did not read can ride
 * along: no times, no extensions, no waypoints, no names, no metadata. Then it
 * hides a circle around the first point and a circle around the last point.
 * Every point inside either circle is dropped, wherever it falls in the
 * track, so a loop that passes home again in the middle is hidden there too,
 * and the track is split where a gap opens so no straight line is drawn
 * across a hidden circle.
 *
 * THE RADIUS is PRIVACY_RADIUS_M plus a random extra of up to
 * PRIVACY_JITTER_M, drawn once per upload. A fixed radius lets anybody find
 * the centre from the shape of the gap across several uploads; a radius that
 * differs each time does not give that away. Both figures are Carta's choice
 * for this task, not a published standard: 500 metres is about six minutes'
 * walk, and the extra keeps the true radius unknown to a reader.
 */

export const PRIVACY_RADIUS_M = 500;
export const PRIVACY_JITTER_M = 250;

const fail = (code) => {
  const e = new Error(code);
  e.code = code;
  return e;
};

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs);
  if (!m) return NaN;
  return Number((m[2] ?? m[3] ?? '').trim());
};

function readPoints(block, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}\\s*>)`, 'g');
  let m;
  while ((m = re.exec(block))) {
    const lat = attr(m[1], 'lat');
    const lon = attr(m[1], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const em = m[2] ? /<ele\s*>\s*([-+0-9.eE]+)\s*<\/ele\s*>/.exec(m[2]) : null;
    const ele = em ? Number(em[1]) : NaN;
    out.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  return out;
}

/**
 * The geometry of a GPX file as segments of points, in file order: every
 * track segment, then every route. Waypoints are not read. Throws 'not_gpx'
 * when the text is not a GPX document and 'no_points' when it holds fewer
 * than two usable points.
 */
export function readGpx(text) {
  if (typeof text !== 'string' || !/<gpx[\s>]/i.test(text)) throw fail('not_gpx');
  const segs = [];
  const segRe = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg\s*>/g;
  let m;
  while ((m = segRe.exec(text))) {
    const pts = readPoints(m[1], 'trkpt');
    if (pts.length) segs.push(pts);
  }
  const rteRe = /<rte\b[^>]*>([\s\S]*?)<\/rte\s*>/g;
  while ((m = rteRe.exec(text))) {
    const pts = readPoints(m[1], 'rtept');
    if (pts.length) segs.push(pts);
  }
  const count = segs.reduce((s, x) => s + x.length, 0);
  if (count < 2) throw fail('no_points');
  return segs;
}

const fx = (v, d) => Number(v.toFixed(d)).toString();

/** A clean GPX 1.1 document holding only the given segments' geometry. */
export function writeGpx(segs) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Carta" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
  ];
  for (const seg of segs) {
    lines.push('    <trkseg>');
    for (const p of seg) {
      const ele = p.ele == null ? '' : `<ele>${fx(p.ele, 1)}</ele>`;
      lines.push(`      <trkpt lat="${fx(p.lat, 6)}" lon="${fx(p.lon, 6)}">${ele}</trkpt>`);
    }
    lines.push('    </trkseg>');
  }
  lines.push('  </trk>', '</gpx>', '');
  return lines.join('\n');
}

const segLength = (seg) => {
  let m = 0;
  for (let i = 1; i < seg.length; i += 1) m += haversineM(seg[i - 1], seg[i]);
  return m;
};

/**
 * The track as it may leave the device.
 *
 *   trimGpx(text, { radiusM, jitterM, random })
 *     -> { gpx, total, kept, removed, segments, lengthM, radiusM }
 *
 * `random` is injectable so a test can pin the radius; it defaults to
 * Math.random. Throws 'too_short' when fewer than two points survive.
 */
export function trimGpx(text, {
  radiusM = PRIVACY_RADIUS_M,
  jitterM = PRIVACY_JITTER_M,
  random = Math.random,
} = {}) {
  const segs = readGpx(text);
  const flat = segs.flat();
  const first = flat[0];
  const last = flat[flat.length - 1];
  const r = Math.round(radiusM + Math.max(0, jitterM) * random());
  const hidden = (p) => haversineM(p, first) <= r || haversineM(p, last) <= r;

  const out = [];
  for (const seg of segs) {
    let run = [];
    for (const p of seg) {
      if (hidden(p)) {
        if (run.length >= 2) out.push(run);
        run = [];
      } else {
        run.push(p);
      }
    }
    if (run.length >= 2) out.push(run);
  }
  const kept = out.reduce((s, x) => s + x.length, 0);
  if (kept < 2) throw fail('too_short');
  return {
    gpx: writeGpx(out),
    total: flat.length,
    kept,
    removed: flat.length - kept,
    segments: out.length,
    lengthM: Math.round(out.reduce((s, x) => s + segLength(x), 0)),
    radiusM: r,
  };
}
