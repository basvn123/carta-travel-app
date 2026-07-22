/**
 * icsExport.js, the planned trip as a calendar file (.ics, RFC 5545).
 *
 * One VEVENT per flight (timed, using the harvested local dep/arr hours when
 * the flight-times layer covers the leg) and one all-day VEVENT per stay.
 * Times are written "floating" (no time zone): a 19:45 departure reads as
 * 19:45 wherever the calendar is opened, which is how boarding passes are
 * read anyway. Opening the file adds the whole trip to Google Calendar,
 * Apple Calendar or Outlook; no account, no sync, no service.
 */

import { flightTimes } from './format.js';
import { addDays } from './dates.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** Now, as an ICS UTC timestamp (DTSTAMP is required on every event). */
function dtstamp() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

const dateVal = (iso) => (iso ? iso.replace(/-/g, '') : '');
const timedVal = (iso, hhmm) => `${dateVal(iso)}T${hhmm.replace(':', '')}00`;

/** TEXT escaping per RFC 5545: backslash, semicolon, comma, newline. */
const esc = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** Fold long content lines (continuations start with a space). Kept well
 *  under the 75-octet limit so multi-byte city names never straddle a fold. */
function fold(line) {
  if (line.length <= 60) return [line];
  const parts = [line.slice(0, 60)];
  for (let i = 60; i < line.length; i += 59) parts.push(` ${line.slice(i, i + 59)}`);
  return parts;
}

const minsOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

function vevent({ uid, allDay, startDate, endDate, startTime, endTime, summary, location, description }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp()}`];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateVal(startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${dateVal(endDate)}`);
  } else {
    lines.push(`DTSTART:${timedVal(startDate, startTime)}`);
    lines.push(`DTEND:${timedVal(endDate, endTime)}`);
  }
  lines.push(`SUMMARY:${esc(summary)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  lines.push('END:VEVENT');
  return lines;
}

/** A timed flight event when the hours are known, an all-day one otherwise.
 *  An arrival earlier than the departure means landing past midnight. */
function flightEvent({ uid, date, time, summary, description }) {
  const ft = flightTimes(time);
  if (!ft?.dep) {
    return vevent({ uid, allDay: true, startDate: date, endDate: addDays(date, 1), summary, description });
  }
  const dep = minsOf(ft.dep);
  const endTime = ft.arr || `${pad2(Math.floor(((dep ?? 0) + 150) / 60) % 24)}:${pad2(((dep ?? 0) + 150) % 60)}`;
  const overnight = minsOf(endTime) != null && dep != null && minsOf(endTime) <= dep;
  return vevent({
    uid,
    startDate: date,
    startTime: ft.dep,
    endDate: overnight ? addDays(date, 1) : date,
    endTime,
    summary,
    description,
  });
}

/**
 * The whole itinerary as ICS text, or null when there is nothing dated yet.
 * Takes the same payload bag TripItinerary already builds for share/PDF.
 * Booking confirmation codes (extras.bookings) land in the descriptions,
 * keyed the same way the itinerary keys them ('flight-out', 'stay-2', ...).
 */
export function tripIcs({ label, stopDetails = [], flight = null, groupSize = 1, extras = null }) {
  // Keep each stop's ORIGINAL index: booking keys are 'stay-<index into
  // stopDetails>', and filtering must not shift them.
  const stops = stopDetails
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => s?.dest && s.arriveDate && s.departDate);
  if (!stops.length) return null;
  const first = stops[0].s;
  const last = stops[stops.length - 1].s;
  const stamp = Date.now();
  const people = `${groupSize} ${groupSize === 1 ? 'person' : 'people'}`;
  const refFor = (key) => {
    const r = extras?.bookings?.[key]?.ref;
    return r ? ` Booking ref ${r}.` : '';
  };
  const events = [];

  if (flight?.combinable) {
    events.push(flightEvent({
      uid: `${stamp}-fly-out@carta`,
      date: first.arriveDate,
      time: flight.into_time,
      summary: `Flight ${flight.origin} to ${flight.into_anchor}`,
      description: `Ryanair, ${people}.${refFor('flight-out')} Planned with Carta.`,
    }));
  } else if (flight?.own) {
    events.push(flightEvent({
      uid: `${stamp}-fly-out@carta`,
      date: first.arriveDate,
      time: null,
      summary: flight.airline ? `Flight in with ${flight.airline}` : 'Your own flight in',
      description: `${people}.${refFor('flight')} Planned with Carta.`,
    }));
  }

  stops.forEach(({ s, idx }) => {
    events.push(vevent({
      uid: `${stamp}-stay-${idx}@carta`,
      allDay: true,
      startDate: s.arriveDate,
      endDate: s.departDate,
      summary: `Stay in ${s.dest.city}`,
      location: [s.dest.city, s.dest.country].filter(Boolean).join(', '),
      description: `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}, ${people}.${refFor(`stay-${idx}`)} Planned with Carta.`,
    }));
  });

  if (flight?.combinable) {
    events.push(flightEvent({
      uid: `${stamp}-fly-home@carta`,
      date: last.departDate,
      time: flight.out_of_time,
      summary: `Flight ${flight.out_anchor} to ${flight.origin}`,
      description: `Ryanair, ${people}.${refFor('flight-home')} Planned with Carta.`,
    }));
  } else if (flight?.own) {
    events.push(flightEvent({
      uid: `${stamp}-fly-home@carta`,
      date: last.departDate,
      time: null,
      summary: flight.airline ? `Flight home with ${flight.airline}` : 'Your own flight home',
      description: `${people}.${refFor('flight')} Planned with Carta.`,
    }));
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carta//Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(label || 'My trip')}`,
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}

/** Trigger a browser download of the ICS text. */
export function downloadIcs(filename, ics) {
  const safe = filename.replace(/[\\/:*?"<>|]/g, '').trim() || 'carta-trip';
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.ics') ? safe : `${safe}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a beat before revoking, or the download can be cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
