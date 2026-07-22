/**
 * kmlExport.js, hand a whole trip to Google Maps with everything we know.
 *
 * A plain Google Maps directions link can only carry 9 waypoints (3 on mobile
 * browsers) and no names, notes or days. A KML file has no such limits: every
 * stop keeps its name, photo, description, visit time and links, days become
 * folders, and the walking route is drawn as a line. The traveller imports it
 * once at Google My Maps (mymaps.google.com > Create a new map > Import) and
 * then has the full trip, openable in the Google Maps app under
 * Saved > Maps, with far more information than any share link can carry.
 *
 * Composers take plain data (no component helpers), so both planners can use
 * them: tripKml() for the multi-city itinerary, dayPlanKml() for planned days.
 */

const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));

// Descriptions carry small HTML (My Maps renders it); CDATA keeps it legal XML.
const cdata = (html) => `<![CDATA[${String(html ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;

// KML colours are aabbggrr. A small rotating palette so each day's pins and
// line share a colour and days stay tellable-apart after import.
const DAY_COLORS = ['ff2d50c8', 'ff2e8b57', 'ff1478b4', 'ff8b3a9e', 'ffb4641e', 'ff507896'];
const dayColor = (i) => DAY_COLORS[i % DAY_COLORS.length];

const PIN_ICON = 'https://maps.google.com/mapfiles/kml/paddle/wht-blank.png';

function styleBlock(id, color) {
  return `<Style id="${id}">
    <IconStyle><color>${color}</color><scale>1.0</scale><Icon><href>${PIN_ICON}</href></Icon></IconStyle>
    <LineStyle><color>${color}</color><width>4</width></LineStyle>
  </Style>`;
}

function placemarkXml(p) {
  // Number.isFinite, not == null: a NaN coordinate would write an invalid
  // <coordinates>NaN,NaN</coordinates> Placemark that My Maps rejects.
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return '';
  return `<Placemark>
    <name>${xmlEsc(p.name)}</name>
    ${p.html ? `<description>${cdata(p.html)}</description>` : ''}
    ${p.styleId ? `<styleUrl>#${p.styleId}</styleUrl>` : ''}
    <Point><coordinates>${p.lon},${p.lat},0</coordinates></Point>
  </Placemark>`;
}

function pathXml(p) {
  const coords = (p.coords || []).filter((c) => c && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (coords.length < 2) return '';
  return `<Placemark>
    <name>${xmlEsc(p.name)}</name>
    ${p.html ? `<description>${cdata(p.html)}</description>` : ''}
    ${p.styleId ? `<styleUrl>#${p.styleId}</styleUrl>` : ''}
    <LineString><tessellate>1</tessellate><coordinates>${coords.map((c) => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LineString>
  </Placemark>`;
}

/** doc: { name, description, styles: [{id,color}], folders: [{ name, placemarks: [], paths: [] }] } */
export function buildKml(doc) {
  const folders = (doc.folders || []).map((f) => {
    const inner = [
      ...(f.placemarks || []).map(placemarkXml),
      ...(f.paths || []).map(pathXml),
    ].filter(Boolean).join('\n');
    if (!inner) return '';
    return `<Folder><name>${xmlEsc(f.name)}</name>\n${inner}\n</Folder>`;
  }).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xmlEsc(doc.name)}</name>
  ${doc.description ? `<description>${cdata(doc.description)}</description>` : ''}
  ${(doc.styles || []).map((s) => styleBlock(s.id, s.color)).join('\n')}
${folders}
</Document>
</kml>`;
}

/** Trigger a browser download of the KML text. */
export function downloadKml(filename, kml) {
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.kml') ? filename : `${filename}.kml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a beat before revoking, or the download can be cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const searchUrl = (name, city) => (
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, city].filter(Boolean).join(', '))}`
);

// Sights link by exact coordinates: a "<sight>, <city>" name search geocodes
// and lands on "can't find this place" for obscure or local-language names.
// Cities keep the name form (city names geocode reliably and open the richer
// city page).
const pinUrl = (lat, lon) => (
  `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`
);

// The description panel My Maps shows when a pin is tapped: photo, what the
// place is, how long to plan for it, and the outbound links.
function placeHtml({ img, headline, desc, dayLine, wiki, mapsUrl }) {
  const parts = [];
  if (img) parts.push(`<img src="${xmlEsc(img)}" width="320"/><br/>`);
  if (headline) parts.push(`<b>${xmlEsc(headline)}</b><br/>`);
  if (desc) parts.push(`${xmlEsc(desc)}<br/>`);
  if (dayLine) parts.push(`<i>${xmlEsc(dayLine)}</i><br/>`);
  const links = [
    mapsUrl ? `<a href="${xmlEsc(mapsUrl)}">Open in Google Maps</a>` : '',
    wiki ? `<a href="${xmlEsc(wiki)}">Wikipedia</a>` : '',
  ].filter(Boolean).join(', ');
  if (links) parts.push(links);
  return parts.join('\n');
}

/**
 * The multi-city trip as KML: one folder with every city stop in visiting
 * order (dates, nights, photo, that stay's day-by-day highlights), plus the
 * city-to-city route as a line.
 *
 * stopDetails: [{ dest: { city, country, lat, lon, image }, arriveDate,
 *                 departDate, nights }]
 * dayPlan:     [{ dayNum, date, stop, activities: [name] }] (optional)
 */
export function tripKml({ label, stopDetails = [], dayPlan = [], fmtDate = (d) => d || '' }) {
  const name = label || 'My trip';
  const stops = stopDetails.filter((s) => Number.isFinite(s?.dest?.lat) && Number.isFinite(s?.dest?.lon));
  const placemarks = stops.map((s, i) => {
    const cityDays = dayPlan.filter((d) => d.stop === s || d.stop?.dest === s.dest);
    const dayLines = cityDays.map((d) => {
      const acts = (d.activities || []).slice(0, 6).join(', ');
      return `Day ${d.dayNum} (${fmtDate(d.date)}): ${acts || 'free day'}`;
    }).join('<br/>');
    const headline = `Stop ${i + 1} of ${stops.length}, ${fmtDate(s.arriveDate)} to ${fmtDate(s.departDate)}, ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`;
    const html = [
      s.dest.image?.url ? `<img src="${xmlEsc(s.dest.image.url)}" width="320"/><br/>` : '',
      `<b>${xmlEsc(headline)}</b><br/>`,
      dayLines ? `${dayLines}<br/>` : '',
      `<a href="${xmlEsc(searchUrl(s.dest.city, s.dest.country))}">Open in Google Maps</a>`,
    ].filter(Boolean).join('\n');
    return {
      name: `${i + 1}. ${s.dest.city}, ${s.dest.country}`,
      lat: s.dest.lat, lon: s.dest.lon, html, styleId: 'trip',
    };
  });
  const paths = stops.length >= 2 ? [{
    name: 'Route',
    coords: stops.map((s) => [s.dest.lon, s.dest.lat]),
    styleId: 'trip',
    html: 'City-to-city order of travel (as the crow flies - open each leg in Google Maps for roads).',
  }] : [];
  return buildKml({
    name,
    description: 'Planned with Carta. Import at mymaps.google.com to see every stop with dates, nights and day plans.',
    styles: [{ id: 'trip', color: dayColor(0) }],
    folders: [{ name: 'Trip stops', placemarks, paths }],
  });
}

/**
 * Planned days as KML: a folder per day, each place a pin carrying its photo,
 * description, visit-time estimate and links; the day's walking route (real
 * OSRM geometry when available, else pin-to-pin) drawn as a coloured line.
 *
 * days: [{
 *   label,                     e.g. 'Day 3, Como (Mon 04 Aug)'
 *   city,
 *   stay: { lat, lon, label } | null,
 *   items: [{ name, lat, lon, kind, desc, wiki, img, dwellMin, mustSee }],
 *   routeCoords: [[lon,lat], ...] | null,
 * }]
 */
export function dayPlanKml({ label, days = [] }) {
  const styles = days.map((_, i) => ({ id: `day${i}`, color: dayColor(i) }));
  styles.push({ id: 'stay', color: 'ff222222' });
  const folders = days.map((day, di) => {
    const placemarks = (day.items || []).filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lon)).map((it, i) => ({
      name: `${i + 1}. ${it.name}`,
      lat: it.lat, lon: it.lon, styleId: `day${di}`,
      html: placeHtml({
        img: it.img,
        headline: [
          it.kind,
          it.dwellMin ? `plan ~${it.dwellMin} min` : '',
          it.mustSee ? 'essential sight' : '',
        ].filter(Boolean).join(', '),
        desc: it.desc,
        dayLine: day.label,
        wiki: it.wiki,
        mapsUrl: pinUrl(it.lat, it.lon),
      }),
    }));
    if (day.stay?.lat != null) {
      placemarks.unshift({
        name: `Your stay${day.stay.label ? ` - ${day.stay.label}` : ''}`,
        lat: day.stay.lat, lon: day.stay.lon, styleId: 'stay',
        html: `<b>${xmlEsc(day.label)}</b><br/>Where you start and end the day.`,
      });
    }
    const coords = day.routeCoords && day.routeCoords.length >= 2
      ? day.routeCoords
      : (day.items || []).filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lon)).map((it) => [it.lon, it.lat]);
    const paths = [{
      name: `${day.label} - walking route`,
      coords,
      styleId: `day${di}`,
    }];
    return { name: day.label, placemarks, paths };
  });
  return buildKml({
    name: label || 'My day plans',
    description: 'Planned with Carta. Each day is a folder: pins in walking order with notes, photos and visit times.',
    styles,
    folders,
  });
}
