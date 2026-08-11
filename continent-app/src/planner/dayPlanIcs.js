// Calendar (.ics) export for the Day planner, mirroring openDayPlanKml's walk
// over the whole trip: every planned day becomes timed VEVENTs, one per stop,
// scheduled with the same clock model the timeline shows (09:30 start,
// per-kind dwell estimates, walking legs, a lunch pause past 12:30). Opening
// the file drops the whole plan into Google Calendar, Apple Calendar or
// Outlook; no account, no sync, no service. Takes the same ctx bag as the
// PDF/KML so the call site stays a one-liner.
import { addDays } from '../lib/dates.js';
import { haversineKm } from '../lib/runtime_pricing.js';
import { estimateWalkMinutes } from './dayFormat.js';
import { poiKind, dwellMinutes } from './dayDraft.js';
import { buildDaySchedule, fmtClock } from './daySchedule.js';
import { vevent, esc, fold, downloadIcs } from '../lib/icsExport.js';

// A day that somehow schedules past midnight must not emit an event that ends
// "before" it starts; clamp to the last minute of the day instead.
const clampMin = (m) => Math.min(m, 23 * 60 + 59);

/** Build and download the ICS; false when no day has any picks yet. */
export function openDayPlanIcs(ctx) {
  const { stop, stops, assignments, plan, visitFactor, itemsForStop } = ctx;
  if (!stop) return false;

  const stamp = Date.now();
  const events = [];
  stops.forEach((s, si) => {
    const { items } = itemsForStop(s);
    const cityName = s.dest?.city || '';
    Array.from({ length: s.nights }).forEach((_, di) => {
      const dayItems = (assignments[si]?.[di] || []).map((i) => items[i]).filter(Boolean);
      if (!dayItems.length) return;
      const date = addDays(s.arrive_date, di);
      if (!date) return;
      // Straight-line walk estimates here: the live OSRM route only exists
      // for the day currently on screen, and calendar blocks don't need
      // street-level precision.
      const sched = buildDaySchedule({
        items: dayItems,
        legMin: (i) => {
          const a = dayItems[i];
          const b = dayItems[i + 1];
          if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null;
          return estimateWalkMinutes(haversineKm(a.lat, a.lon, b.lat, b.lon));
        },
        dwellMin: (it) => dwellMinutes(poiKind(it), visitFactor),
      });
      dayItems.forEach((it, i) => {
        const row = sched.rows[i];
        const descBits = [poiKind(it) || 'Place'];
        if (it.desc) descBits.push(String(it.desc).slice(0, 180));
        events.push(vevent({
          uid: `${stamp}-day-${si}-${di}-${i}@carta`,
          startDate: date,
          startTime: fmtClock(clampMin(row.arriveMin)),
          endDate: date,
          endTime: fmtClock(clampMin(Math.max(row.departMin, row.arriveMin + 5))),
          summary: it.name,
          location: [it.name, cityName].filter(Boolean).join(', '),
          description: `${descBits.join('. ')}. Planned with Carta.`,
        }));
      });
      if (sched.lunch) {
        events.push(vevent({
          uid: `${stamp}-day-${si}-${di}-lunch@carta`,
          startDate: date,
          startTime: fmtClock(clampMin(sched.lunch.startMin)),
          endDate: date,
          endTime: fmtClock(clampMin(sched.lunch.endMin)),
          summary: cityName ? `Lunch in ${cityName}` : 'Lunch',
        }));
      }
    });
  });
  if (!events.length) return false;

  const label = plan?.label || stop.dest?.city || 'My day plans';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carta//Day Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(label)}`,
    ...events.flat(),
    'END:VCALENDAR',
  ];
  downloadIcs(label, lines.flatMap(fold).join('\r\n') + '\r\n');
  return true;
}
