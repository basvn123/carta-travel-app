// KML export for the Day planner, mirroring openDayPlanPdf's walk over the
// whole trip: every planned day becomes a My Maps folder of pins in walking
// order, with each place's photo, note and visit-time estimate. Takes the
// same ctx bag as the PDF so the call site stays a one-liner.
//
// T389: every word in the file goes through the traveller's language (ctx.t),
// as PRODUCT.md promises for the PDF, KML and ICS exports. The folders are
// composed here and handed to the shared buildKml(), so lib/kmlExport.js (the
// shell's, and the trip planner's tripKml) stays as it is; its dayPlanKml()
// composer wrote English labels and is no longer called from the day planner.
// The stay, where the day starts and ends, is pinned in each folder when the
// plan has one.
import { addDays, fmtDate as fmtDateFull } from '../lib/dates.js';
import { poiKind, isMustSee, dwellMinutes } from './dayDraft.js';
import { safeUrl } from '../lib/format.js';
import { buildKml, downloadKml } from '../lib/kmlExport.js';

const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));

// KML colours are aabbggrr, the same rotating palette lib/kmlExport.js uses
// for the trip, so a day keeps one colour for its pins and its line.
const DAY_COLORS = ['ff2d50c8', 'ff2e8b57', 'ff1478b4', 'ff8b3a9e', 'ffb4641e', 'ff507896'];
const STAY_COLOR = 'ff222222';

const pinUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}`;

function placeHtml({ img, headline, desc, dayLine, wiki, mapsUrl }, t) {
  const parts = [];
  if (img) parts.push(`<img src="${xmlEsc(img)}" width="320"/><br/>`);
  if (headline) parts.push(`<b>${xmlEsc(headline)}</b><br/>`);
  if (desc) parts.push(`${xmlEsc(desc)}<br/>`);
  if (dayLine) parts.push(`<i>${xmlEsc(dayLine)}</i><br/>`);
  const links = [
    mapsUrl ? `<a href="${xmlEsc(mapsUrl)}">${xmlEsc(t('dayws.pdfOpenMaps'))}</a>` : '',
    wiki ? `<a href="${xmlEsc(wiki)}">Wikipedia</a>` : '',
  ].filter(Boolean).join(', ');
  if (links) parts.push(links);
  return parts.join('\n');
}

/** Build and download the KML; false when no day has any picks yet. */
export function openDayPlanKml(ctx) {
  const { stop, stops, assignments, plan, visitFactor, itemsForStop } = ctx;
  const t = ctx.t || ((k) => k);
  if (!stop) return false;
  const stay = plan?.stayPoint && Number.isFinite(plan.stayPoint.lat) && Number.isFinite(plan.stayPoint.lon)
    ? plan.stayPoint : null;

  const folders = [];
  const styles = [];
  stops.forEach((s, si) => {
    const { items } = itemsForStop(s);
    const cityName = s.dest?.city || '';
    // Day numbers continue across the whole trip (city 2 doesn't restart at 1).
    const cityDayOffset = stops.slice(0, si).reduce((n, x) => n + x.nights, 0);
    Array.from({ length: s.nights }).forEach((_, di) => {
      const dayItems = (assignments[si]?.[di] || []).map((i) => items[i]).filter(Boolean);
      if (!dayItems.length) return;
      const date = addDays(s.arrive_date, di);
      const n = cityDayOffset + di + 1;
      const label = date
        ? t('dayws.kmlDayLabel', { n, city: cityName, date: fmtDateFull(date, true) })
        : t('dayws.kmlDayLabelNoDate', { n, city: cityName });
      const styleId = `day${folders.length}`;
      styles.push({ id: styleId, color: DAY_COLORS[folders.length % DAY_COLORS.length] });
      const pins = dayItems.filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lon));
      const placemarks = pins.map((it, i) => {
        const dwell = dwellMinutes(poiKind(it), visitFactor);
        return {
          name: `${i + 1}. ${it.name}`,
          lat: it.lat,
          lon: it.lon,
          styleId,
          html: placeHtml({
            img: it.img,
            headline: [
              poiKind(it),
              dwell ? t('dayws.kmlPlanMin', { n: dwell }) : '',
              isMustSee(it) ? t('day.mustSee') : '',
            ].filter(Boolean).join(', '),
            desc: it.desc,
            dayLine: label,
            wiki: safeUrl(it.wiki),
            mapsUrl: pinUrl(it.lat, it.lon),
          }, t),
        };
      });
      if (stay) {
        placemarks.unshift({
          name: (stay.shortLabel || stay.label)
            ? t('dayws.kmlStay', { name: stay.shortLabel || stay.label })
            : t('dayws.kmlStayBare'),
          lat: stay.lat,
          lon: stay.lon,
          styleId: 'stay',
          html: `<b>${xmlEsc(label)}</b><br/>${xmlEsc(t('dayws.kmlStayNote'))}`,
        });
      }
      folders.push({
        name: label,
        placemarks,
        paths: [{
          name: t('dayws.kmlRoute', { day: label }),
          coords: pins.map((it) => [it.lon, it.lat]),
          styleId,
        }],
      });
    });
  });
  if (!folders.length) return false;
  if (stay) styles.push({ id: 'stay', color: STAY_COLOR });

  const label = plan?.label || stop.dest?.city || t('dayws.kmlFallback');
  downloadKml(
    label.replace(/[\\/:*?"<>|]/g, '').trim() || 'carta-days',
    buildKml({ name: label, description: t('dayws.kmlDesc'), styles, folders }),
  );
  return true;
}
