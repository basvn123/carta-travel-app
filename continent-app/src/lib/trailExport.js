/**
 * trailExport.js, a published trail leaving the app: as a file, as a Google
 * Maps import, or as a link.
 *
 * Three destinations, because walkers do not all use the same thing:
 *   GPX 1.1   the interchange format every hiking app reads (Komoot, Gaia GPS,
 *             Garmin Connect, OsmAnd, Organic Maps, Suunto). Carries the
 *             full-resolution line, the elevation the wire measured, and the
 *             stops of a city day as named waypoints.
 *   KML       Google's format: imports at mymaps.google.com, after which the
 *             route shows up in the Google Maps app under Saved > Maps. The
 *             only way to hand Google a whole route, a directions link caps
 *             out at 9 waypoints and drops every name.
 *   a link    #trail=<id>&tc=<CC>, read back by readTrailFromUrl() in
 *             trails.js. Nothing is uploaded: the link is the trail.
 *
 * The wire is ODbL route data, so every file carries its own attribution. Do
 * not strip it, and do not add a Carta copyright over OpenStreetMap's.
 */
import { buildKml } from './kmlExport.js';
import { stopNameFromRef } from './trailCards.js';
import { trailClimb, trailGrade } from './trailStory.js';

const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** Coordinate lists of a LineString or MultiLineString, non-finite dropped. */
function segments(geometry) {
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  const lines = geometry.type === 'LineString' ? [coords] : coords;
  return lines
    .map((line) => (Array.isArray(line)
      ? line.filter((pt) => Array.isArray(pt) && isNum(pt[0]) && isNum(pt[1]))
      : []))
    .filter((line) => line.length > 1);
}

/** "theth-qerec-curraj-i-eperm-63478", safe on every filesystem. */
export function trailFileBase(tr) {
  const slug = String(tr?.name || 'trail')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'trail';
  return `${slug}-${tr?.id ?? ''}`.replace(/-$/, '');
}

/* ── GPX ──────────────────────────────────────────────────────────────── */

/**
 * The trail as GPX 1.1: one <trk> with a <trkseg> per line segment, elevation
 * written wherever the wire measured it, the city-day stops as <wpt>s in
 * visiting order, and the route's own attribution in <copyright>.
 *
 * detail is the full-resolution record when it has arrived; the simplified
 * card geometry is written when it has not, so the button never waits.
 */
export function trailGpx(tr, detail = null, { link = null, stopNames = [] } = {}) {
  const src = detail || tr;
  const segs = segments(src.geometry);
  const bbox = src.bbox || tr.bbox;
  const facts = [
    isNum(src.distance_m) ? `${(src.distance_m / 1000).toFixed(1)} km` : '',
    isNum(src.duration_min) ? `${(src.duration_min / 60).toFixed(1)} h walking (DIN 33466)` : '',
    // The stored ascent and descent, on purpose: they describe the track in
    // this file, which keeps the direction its mapper drew it in. The grade
    // is the published one (trailGrade), never validate.py's effort class
    // beside it (T108-f).
    isNum(src.ascent_m) ? `${Math.round(src.ascent_m)} m ascent` : '',
    isNum(src.descent_m) ? `${Math.round(src.descent_m)} m descent` : '',
    (trailGrade(src) || trailGrade(tr) || '').replace(/_/g, ' '),
  ].filter(Boolean).join(', ');
  const stopLines = stopNames.length
    ? `Stops: ${stopNames.map((n, i) => `${i + 1}. ${n}`).join(', ')}`
    : '';
  const desc = [facts, stopLines].filter(Boolean).join('. ');
  const wpts = [];
  if (segs.length) {
    const first = segs[0][0];
    const lastSeg = segs[segs.length - 1];
    const last = lastSeg[lastSeg.length - 1];
    wpts.push({ lon: first[0], lat: first[1], name: 'Start', sym: 'Trailhead' });
    const far = Math.abs(last[0] - first[0]) > 1e-4 || Math.abs(last[1] - first[1]) > 1e-4;
    if (far) wpts.push({ lon: last[0], lat: last[1], name: 'Finish', sym: 'Flag' });
  }
  const trksegs = segs.map((line) => {
    const pts = line.map((pt) => (
      `<trkpt lat="${pt[1].toFixed(6)}" lon="${pt[0].toFixed(6)}">${isNum(pt[2]) ? `<ele>${pt[2].toFixed(1)}</ele>` : ''}</trkpt>`
    )).join('');
    return `<trkseg>${pts}</trkseg>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Carta" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${xmlEsc(tr.name)}</name>
    ${desc ? `<desc>${xmlEsc(desc)}</desc>` : ''}
    ${link ? `<link href="${xmlEsc(link)}"><text>Carta</text></link>` : ''}
    <copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright>
    ${Array.isArray(bbox) && bbox.length === 4 ? `<bounds minlon="${bbox[0]}" minlat="${bbox[1]}" maxlon="${bbox[2]}" maxlat="${bbox[3]}"/>` : ''}
  </metadata>
${wpts.map((w) => `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${xmlEsc(w.name)}</name><sym>${xmlEsc(w.sym)}</sym></wpt>`).join('\n')}
  <trk>
    <name>${xmlEsc(tr.name)}</name>
    <type>${tr.category === 'citytrip' ? 'walking' : 'hiking'}</type>
${trksegs}
  </trk>
</gpx>`;
}

/* ── KML, for Google My Maps ──────────────────────────────────────────── */

// The same two formatters TrailPage.jsx prints its facts strip with.
const km1 = (m) => (m / 1000).toFixed(1).replace(/\.0$/, '');
const hoursText = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};

/**
 * The one line of facts the KML carries: "12.1 km, 7 h, +1568 m". The climb
 * is read uphill (trailClimb().up), the same number the trail card prints, so
 * Mount Korab (9), drawn summit to village, says +1423 m rather than +7 m
 * (T108-d). Composed here, beside the writer, so no caller can hand it the
 * stored ascent again. Empty when the record states no distance.
 */
export function trailFactLine(tr, detail = null) {
  const src = detail || tr || {};
  if (!isNum(src.distance_m)) return '';
  const up = trailClimb(src).up ?? (detail ? trailClimb(tr).up : null);
  return [
    `${km1(src.distance_m)} km`,
    isNum(src.duration_min) ? `${hoursText(src.duration_min)} h` : '',
    tr?.category !== 'citytrip' && isNum(up) ? `+${Math.round(up)} m` : '',
  ].filter(Boolean).join(', ');
}

/** The trail as KML: the line, a start and finish pin, and the stop list in
 *  the line's description panel. One folder, so My Maps imports it as one
 *  layer the traveller can rename. */
export function trailKml(tr, detail = null, { link = null, stopNames = [], factLine: given = '' } = {}) {
  const src = detail || tr;
  const segs = segments(src.geometry);
  // The writer's own line wins. A caller's line is used only where the
  // record has no distance to compose from (a city day measured off its
  // drawn line), and TrailPage's line printed the stored ascent.
  const factLine = trailFactLine(tr, detail) || given;
  const html = [
    factLine ? `<b>${xmlEsc(factLine)}</b><br/>` : '',
    stopNames.length ? `${stopNames.map((n, i) => `${i + 1}. ${xmlEsc(n)}`).join('<br/>')}<br/>` : '',
    link ? `<a href="${xmlEsc(link)}">Open in Carta</a>` : '',
  ].filter(Boolean).join('\n');
  const placemarks = [];
  if (segs.length) {
    const first = segs[0][0];
    const lastSeg = segs[segs.length - 1];
    const last = lastSeg[lastSeg.length - 1];
    placemarks.push({ name: 'Start', lat: first[1], lon: first[0], styleId: 'trail', html });
    const far = Math.abs(last[0] - first[0]) > 1e-4 || Math.abs(last[1] - first[1]) > 1e-4;
    if (far) placemarks.push({ name: 'Finish', lat: last[1], lon: last[0], styleId: 'trail' });
  }
  return buildKml({
    name: tr.name,
    description: `${factLine}${factLine ? '. ' : ''}${src.attribution_text || ''}`.trim(),
    styles: [{ id: 'trail', color: 'ff475ae0' }],
    folders: [{
      name: tr.name,
      placemarks,
      paths: segs.map((line, i) => ({
        name: segs.length > 1 ? `${tr.name} (${i + 1})` : tr.name,
        coords: line,
        styleId: 'trail',
        html: i === 0 ? html : '',
      })),
    }],
  });
}

/* ── Handing the file over ────────────────────────────────────────────── */

const MIME = {
  gpx: 'application/gpx+xml',
  kml: 'application/vnd.google-earth.kml+xml',
};

/** Download text as a file. Kept here rather than in the caller so the
 *  object URL is always revoked, even when the click is cancelled. */
export function downloadTextFile(filename, text, ext = 'gpx') {
  const blob = new Blob([text], { type: MIME[ext] || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Hand a file to the phone's own share sheet when it can take files (that is
 * how a GPX reaches a hiking app on iOS and Android), and fall back to a plain
 * download everywhere else. Resolves 'shared' or 'downloaded'.
 */
export async function shareOrDownloadFile(filename, text, ext = 'gpx', title = '') {
  const type = MIME[ext] || 'text/plain';
  const name = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
  try {
    if (typeof File !== 'undefined' && navigator.canShare) {
      const file = new File([text], name, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || name });
        return 'shared';
      }
    }
  } catch (err) {
    // A cancelled share sheet is not a failure, and must not also download.
    if (err && err.name === 'AbortError') return 'shared';
  }
  downloadTextFile(name, text, ext);
  return 'downloaded';
}

/* ── Links ────────────────────────────────────────────────────────────── */

/** The link that reopens this trail. The hash (not the query) so the payload
 *  never reaches a server log and never collides with the browse-state params
 *  useUrlSync writes. */
export function trailShareUrl(tr) {
  if (typeof window === 'undefined' || !tr?.id) return '';
  const { origin, pathname } = window.location;
  const cc = tr.country ? `&tc=${encodeURIComponent(tr.country)}` : '';
  return `${origin}${pathname}#trail=${encodeURIComponent(tr.id)}${cc}`;
}

/** Google Maps directions to the trailhead, by coordinates: a "<trail name>,
 *  <country>" search lands on "can't find this place" for most of these. */
export function trailheadDirectionsUrl(lat, lon) {
  if (!isNum(lat) || !isNum(lon)) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** Share the link through the phone's share sheet, or copy it. Resolves
 *  'shared', 'copied', or null when neither is available. */
export async function shareTrailLink(title, url) {
  if (!url) return null;
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'shared';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch { /* clipboard blocked */ }
  return null;
}

/** Stop names for a city day, in visiting order, for the export files. */
export function stopNamesOf(detail) {
  const stops = detail?.stops;
  if (!Array.isArray(stops)) return [];
  return stops
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((s) => stopNameFromRef(s.poi_ref))
    .filter(Boolean);
}
