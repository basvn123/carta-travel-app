// KML export for the Day planner, mirroring openDayPlanPdf's walk over the
// whole trip: every planned day becomes a My Maps folder of pins in walking
// order, with each place's photo, note and visit-time estimate. Takes the
// same ctx bag as the PDF so the call site stays a one-liner.
import { addDays, fmtDate as fmtDateFull } from '../lib/dates.js';
import { poiKind, isMustSee, dwellMinutes } from './dayDraft.js';
import { safeUrl } from '../lib/format.js';
import { dayPlanKml, downloadKml } from '../lib/kmlExport.js';

/** Build and download the KML; false when no day has any picks yet. */
export function openDayPlanKml(ctx) {
  const { stop, stops, assignments, plan, visitFactor, itemsForStop } = ctx;
  if (!stop) return false;

  const days = [];
  stops.forEach((s, si) => {
    const { items } = itemsForStop(s);
    const cityName = s.dest?.city || '';
    // Day numbers continue across the whole trip (city 2 doesn't restart at 1).
    const cityDayOffset = stops.slice(0, si).reduce((n, x) => n + x.nights, 0);
    Array.from({ length: s.nights }).forEach((_, di) => {
      const dayItems = (assignments[si]?.[di] || []).map((i) => items[i]).filter(Boolean);
      if (!dayItems.length) return;
      const date = addDays(s.arrive_date, di);
      days.push({
        label: `Day ${cityDayOffset + di + 1}, ${cityName}${date ? ` (${fmtDateFull(date, true)})` : ''}`,
        city: cityName,
        stay: null,
        items: dayItems.map((it) => ({
          name: it.name,
          lat: it.lat,
          lon: it.lon,
          kind: poiKind(it),
          desc: it.desc,
          wiki: safeUrl(it.wiki),
          img: it.img,
          dwellMin: dwellMinutes(poiKind(it), visitFactor),
          mustSee: isMustSee(it),
        })),
        routeCoords: null,
      });
    });
  });
  if (!days.length) return false;

  const label = plan?.label || stop.dest?.city || 'My day plans';
  downloadKml(label.replace(/[\\/:*?"<>|]/g, '').trim() || 'carta-days', dayPlanKml({ label, days }));
  return true;
}
