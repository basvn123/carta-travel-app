/**
 * tripExport.js, share a planned trip and download it as a PDF.
 *
 * Share uses the Web Share API where it exists (phones), and falls back to
 * copying the summary to the clipboard (desktop). The PDF goes through the
 * browser's print-to-PDF pipeline: we open a clean printable document and
 * call print(), no PDF library, works offline, and the traveller can pick
 * "Save as PDF" in the dialog.
 */

import { eur, flightTimes } from './format.js';
import { flightReasonLabel, baggageLabel } from './trip_planner_pricing.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/** ", 19:45-21:45", the priced flight's local dep/arr hours, when stored. */
function timesSuffix(time) {
  const ft = flightTimes(time);
  if (!ft) return '';
  return `, ${ft.dep}${ft.arr ? `-${ft.arr}` : ''}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

// Traveller-facing words for leg/transfer mode keys (the raw keys leak
// jargon like "by public" or "by rental" into shared text otherwise).
const MODE_WORD = {
  train: 'train', bus: 'bus', car: 'car', fly: 'flight', ferry: 'ferry',
  public: 'public transport', taxi: 'taxi', rental: 'rental car',
};
const modeWord = (mode) => MODE_WORD[mode] || mode;

/** Plain-text itinerary, used for sharing. */
export function tripSummaryText({ label, stopDetails, flight, anchorLegs, driveLegs = null, tripHasCar = false, grandTotal, groupSize }) {
  const lines = [];
  lines.push(label || 'My trip');
  const first = stopDetails[0];
  const last = stopDetails[stopDetails.length - 1];
  if (first?.arriveDate) lines.push(`${fmtLong(first.arriveDate)} to ${fmtLong(last?.departDate)}`);
  lines.push('');
  if (flight?.combinable) lines.push(`Fly ${flight.origin} to ${flight.into_anchor}${timesSuffix(flight.into_time)}`);
  if (flight?.own) lines.push(flight.airline ? `Flight with ${flight.airline}${flight.out_date ? `, ${fmtLong(flight.out_date)}` : ''}${flight.cost_total ? ` (${eur(flight.cost_total)})` : ''}` : 'Your own flight (another airline)');
  if (flight?.driving && driveLegs?.out) lines.push(`Drive out${driveLegs.from ? ` from ${driveLegs.from}` : ''} to ${first?.dest?.city} (${driveLegs.out.road_km} km)`);
  if (anchorLegs?.in?.ground_total) lines.push(`Then ${anchorLegs.anchor?.city} to ${first?.dest?.city} by ${modeWord(anchorLegs.in.mode)}`);
  stopDetails.forEach((s, i) => {
    if (!s.dest) return;
    lines.push(`${i + 1}. ${s.dest.city}, ${s.dest.country} - ${s.nights} ${s.nights === 1 ? 'night' : 'nights'} (${fmtLong(s.arriveDate)})`);
  });
  if (anchorLegs?.out?.ground_total) lines.push(`Then ${last?.dest?.city} to ${anchorLegs.anchor?.city} by ${modeWord(anchorLegs.out.mode)}`);
  if (flight?.combinable) lines.push(`Fly home ${flight.out_anchor} to ${flight.origin}${timesSuffix(flight.out_of_time)}`);
  if (flight?.driving && driveLegs?.home) lines.push(`Drive home from ${last?.dest?.city} (${driveLegs.home.road_km} km)`);
  if (flight && !flight.combinable && !flight.own && !flight.driving && !tripHasCar) lines.push(`Flights: ${flightReasonLabel(flight.reason)}`);
  if (grandTotal != null) {
    lines.push('');
    lines.push(`Estimated total for ${groupSize} ${groupSize === 1 ? 'person' : 'people'}: ${eur(grandTotal)}`);
  }
  lines.push('');
  lines.push('Planned with Carta.');
  return lines.join('\n');
}

/** Share the trip; returns 'shared' | 'copied' | 'failed' for UI feedback. */
export async function shareTrip(trip) {
  const text = tripSummaryText(trip);
  const title = trip.label || 'My trip';
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'failed'; // user closed the sheet
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Printable HTML for the trip, opened in a new window for print-to-PDF.
 *  The cost table reads chronologically: getting there, each stop (with the
 *  leg to the next one), getting home, then the round-trip items. */
function tripPrintHtml({ label, stopDetails, dayPlan = [], flight, legs = [], anchorLegs = null, driveLegs = null, stayCosts = [], carRental, vignettes = null, tripHasCar = false, grandTotal, groupSize, extras = null, bookingRows = [] }) {
  const first = stopDetails[0];
  const last = stopDetails[stopDetails.length - 1];
  const rows = [];

  // 1. Getting there.
  if (flight?.combinable) {
    rows.push(`<tr><td>Flight out: ${esc(flight.origin)} &rarr; ${esc(flight.into_anchor)}</td><td>${esc(eur(flight.into_fare_eur * groupSize))}</td></tr>`);
  } else if (flight?.own) {
    const airlineLbl = flight.airline ? ` (${esc(flight.airline)})` : '';
    const when = flight.out_date ? `, ${esc(fmtLong(flight.out_date))}${flight.ret_date ? ` &rarr; ${esc(fmtLong(flight.ret_date))}` : ''}` : '';
    rows.push(`<tr><td>Flight${airlineLbl}: booked yourself${when}</td><td>${flight.cost_total ? esc(eur(flight.cost_total)) : '&mdash;'}</td></tr>`);
  } else if (flight && !flight.driving && !tripHasCar) {
    rows.push(`<tr><td colspan="2" class="note">Flights: ${esc(flightReasonLabel(flight.reason))}</td></tr>`);
  }
  if (flight?.driving && driveLegs?.out) {
    rows.push(`<tr><td>Drive out${driveLegs.from ? ` from ${esc(driveLegs.from)}` : ''} to ${esc(first?.dest?.city)} (${driveLegs.out.road_km} km)</td><td>${esc(eur(driveLegs.out.ground_total))}</td></tr>`);
  }
  if (anchorLegs?.in?.ground_total) {
    rows.push(`<tr><td>${esc(anchorLegs.anchor?.city)} &rarr; ${esc(first?.dest?.city)} (${esc(modeWord(anchorLegs.in.mode))}, estimate)</td><td>${esc(eur(anchorLegs.in.ground_total))}</td></tr>`);
  }
  // 2. Each stop in order, the leg to the next stop between them.
  stopDetails.forEach((s, i) => {
    const c = stayCosts[i];
    if (c) {
      rows.push(`<tr><td>${esc(s.dest?.city)}: ${s.nights} ${s.nights === 1 ? 'night' : 'nights'} accommodation</td><td>${esc(eur(c.accomTotal))}</td></tr>`);
      rows.push(`<tr><td>${esc(s.dest?.city)}: on the ground</td><td>${esc(eur(c.groundTotal))}</td></tr>`);
    }
    const l = legs[i];
    if (i < stopDetails.length - 1 && l && l.ground_total) {
      // A hop the traveller booked themselves carries their own fare, so it
      // must not go out on the receipt labelled as one of Carta's estimates.
      const qual = l.modes?.[l.mode]?.own ? 'booked' : 'estimate';
      rows.push(`<tr><td>${esc(s.dest?.city)} &rarr; ${esc(stopDetails[i + 1]?.dest?.city)} (${esc(modeWord(l.mode))}, ${qual})</td><td>${esc(eur(l.ground_total))}</td></tr>`);
    }
  });
  // 3. Getting home.
  if (anchorLegs?.out?.ground_total) {
    rows.push(`<tr><td>${esc(last?.dest?.city)} &rarr; ${esc(anchorLegs.anchor?.city)} (${esc(modeWord(anchorLegs.out.mode))}, estimate)</td><td>${esc(eur(anchorLegs.out.ground_total))}</td></tr>`);
  }
  if (flight?.driving && driveLegs?.home) {
    rows.push(`<tr><td>Drive home from ${esc(last?.dest?.city)} (${driveLegs.home.road_km} km)</td><td>${esc(eur(driveLegs.home.ground_total))}</td></tr>`);
  }
  if (flight?.combinable) {
    rows.push(`<tr><td>Flight home: ${esc(flight.out_anchor)} &rarr; ${esc(flight.origin)}</td><td>${esc(eur(flight.out_of_fare_eur * groupSize))}</td></tr>`);
  }
  // 4. Round-trip items for the whole journey.
  if (flight?.combinable && flight.bag_total > 0) rows.push(`<tr><td>Baggage: ${esc(baggageLabel(flight.baggage))} (out + home, ${groupSize} ${groupSize === 1 ? 'person' : 'people'})</td><td>${esc(eur(flight.bag_total))}</td></tr>`);
  if (flight?.combinable && flight.ground_total > 0) rows.push(`<tr><td>Airport transfers</td><td>${esc(eur(flight.ground_total))}</td></tr>`);
  if (carRental) rows.push(`<tr><td>Rental car, ${carRental.days} days${carRental.cars > 1 ? `, ${carRental.cars} cars` : ''}</td><td>${esc(eur(carRental.eur_total))}</td></tr>`);
  if (vignettes) rows.push(`<tr><td>Motorway vignettes (${esc(vignettes.items.map((v) => v.iso2).join(', '))})</td><td>${esc(eur(vignettes.eur_total))}</td></tr>`);

  // Booking records worth printing: any element with a tick, a confirmation
  // code, a price or a link, plus the custom rows (dinner slots, tours...).
  const bookings = [];
  (bookingRows || []).forEach((r) => {
    const b = extras?.bookings?.[r.key];
    if (b && (b.done || b.ref || b.price || b.url)) bookings.push({ label: r.label, ...b });
  });
  Object.entries(extras?.bookings || {}).forEach(([k, b]) => {
    if (k.startsWith('custom:') && b && (b.label || b.ref || b.price || b.url)) {
      bookings.push({ label: b.label || 'Booking', ...b });
    }
  });
  const bookingRowsHtml = bookings.map((b) => {
    const price = Number(String(b.price ?? '').replace(',', '.'));
    const bits = [
      `${b.done ? 'Booked: ' : ''}${esc(b.label)}`,
      b.ref ? `ref ${esc(b.ref)}` : '',
    ].filter(Boolean).join(', ');
    return `<tr><td>${bits}</td><td>${Number.isFinite(price) && String(b.price ?? '').trim() !== '' ? esc(eur(price)) : ''}</td></tr>`;
  }).join('');

  const notesHtml = extras?.notes?.trim()
    ? `<h2>Notes</h2><p class="trip-notes">${esc(extras.notes).replace(/\n/g, '<br/>')}</p>`
    : '';
  const packHtml = extras?.checklist?.length
    ? `<h2>Packing list</h2><ul class="pack">${extras.checklist.map((c) => (
      `<li class="${c.done ? 'done' : ''}"><span class="box">${c.done ? '&times;' : ''}</span>${esc(c.text)}</li>`
    )).join('')}</ul>`
    : '';

  const days = dayPlan.map((d) => `
    <div class="day">
      <div class="day-head"><b>Day ${d.dayNum}</b>, ${esc(d.stop.dest?.city)}${d.date ? `, ${esc(fmtLong(d.date))}` : ''}</div>
      ${d.activities.length
        ? `<ol>${d.activities.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`
        : '<p class="free">Free day: wander, eat well, no plans.</p>'}
    </div>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(label || 'My trip')}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', sans-serif; color: #1d1a16; margin: 40px auto; max-width: 640px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .dates { color: #6b6257; margin: 0 0 24px; font-size: 14px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #d8d2c8; padding-bottom: 5px; margin: 26px 0 10px; }
  .stop { margin: 8px 0; font-size: 14.5px; }
  .stop b { font-size: 15px; }
  .stop .when { color: #6b6257; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  td { padding: 5px 0; border-bottom: 1px solid #eee7db; }
  td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { font-weight: bold; border-top: 2px solid #1d1a16; border-bottom: none; font-size: 15px; }
  td.note { text-align: left; color: #6b6257; font-style: italic; white-space: normal; }
  .day { margin: 10px 0; font-size: 13.5px; }
  .day-head { margin-bottom: 3px; }
  .day ol { margin: 2px 0 0 18px; padding: 0; }
  .free { color: #6b6257; font-style: italic; margin: 2px 0; }
  .trip-notes { font-size: 13.5px; line-height: 1.6; }
  .pack { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 32px; font-size: 13.5px; }
  .pack li { padding: 3px 0; break-inside: avoid; }
  .pack li.done { color: #a29786; }
  .pack .box { display: inline-block; width: 13px; height: 13px; border: 1.4px solid #1d1a16; border-radius: 3px; margin-right: 9px; text-align: center; line-height: 11px; font-size: 11px; vertical-align: -2px; }
  .pack li.done .box { border-color: #a29786; }
  .foot { margin-top: 32px; color: #a29786; font-size: 11.5px; }
  @media print { body { margin: 10mm auto; } }
</style></head><body>
  <h1>${esc(label || 'My trip')}</h1>
  <p class="dates">${esc(fmtLong(first?.arriveDate))} &rarr; ${esc(fmtLong(last?.departDate))}, ${groupSize} ${groupSize === 1 ? 'person' : 'people'}</p>

  <h2>Route</h2>
  ${flight?.combinable ? `<div class="stop">Fly <b>${esc(flight.origin)} &rarr; ${esc(flight.into_anchor)}</b> <span class="when">${esc(fmtLong(first?.arriveDate) + timesSuffix(flight.into_time))}</span></div>` : ''}
  ${flight?.own ? `<div class="stop">${flight.airline ? `Fly in with <b>${esc(flight.airline)}</b>` : '<b>Your own flight in</b>'} <span class="when">${esc(fmtLong(flight.out_date || first?.arriveDate))}</span></div>` : ''}
  ${flight?.driving && driveLegs?.out ? `<div class="stop">Drive out${driveLegs.from ? ` from <b>${esc(driveLegs.from)}</b>` : ''} to <b>${esc(first?.dest?.city)}</b> <span class="when">${driveLegs.out.road_km} km</span></div>` : ''}
  ${stopDetails.map((s, i) => `
    <div class="stop">${i + 1}. <b>${esc(s.dest?.city)}, ${esc(s.dest?.country)}</b>
    <span class="when">${esc(fmtLong(s.arriveDate))} &rarr; ${esc(fmtLong(s.departDate))}, ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}</span></div>`).join('')}
  ${flight?.combinable ? `<div class="stop">Fly home <b>${esc(flight.out_anchor)} &rarr; ${esc(flight.origin)}</b> <span class="when">${esc(fmtLong(last?.departDate) + timesSuffix(flight.out_of_time))}</span></div>` : ''}
  ${flight?.own && flight.ret_date ? `<div class="stop">${flight.airline ? `Fly home with <b>${esc(flight.airline)}</b>` : '<b>Your own flight home</b>'} <span class="when">${esc(fmtLong(flight.ret_date))}</span></div>` : ''}
  ${flight?.driving && driveLegs?.home ? `<div class="stop">Drive home from <b>${esc(last?.dest?.city)}</b> <span class="when">${driveLegs.home.road_km} km</span></div>` : ''}

  ${rows.length ? `<h2>Estimated costs</h2>
  <table>${rows.join('')}
    <tr class="total"><td>Estimated total</td><td>${esc(eur(grandTotal))}</td></tr>
  </table>` : ''}

  ${bookingRowsHtml ? `<h2>Bookings</h2>
  <table>${bookingRowsHtml}</table>` : ''}

  ${days ? `<h2>Day by day</h2>${days}` : ''}

  ${notesHtml}

  ${packHtml}

  <p class="foot">Planned with Carta. Flight prices are stored budget-airline fares (Ryanair, Wizz Air, Vueling, Volotea); ground and stay costs are estimates.</p>
</body></html>`;
}

/** Open the print dialog on a clean document; "Save as PDF" does the rest. */
export function downloadTripPdf(trip) {
  // NB: no `noopener` here, it makes window.open() return null, and we need
  // the reference to write the printable document into the new window.
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return false;
  w.document.write(tripPrintHtml(trip));
  w.document.close();
  // Give the new document a beat to lay out before the print dialog opens.
  w.setTimeout(() => { w.focus(); w.print(); }, 250);
  return true;
}
