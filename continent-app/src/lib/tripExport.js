/**
 * tripExport.js - share a planned trip and download it as a PDF.
 *
 * Share uses the Web Share API where it exists (phones), and falls back to
 * copying the summary to the clipboard (desktop). The PDF goes through the
 * browser's print-to-PDF pipeline: we open a clean printable document and
 * call print() - no PDF library, works offline, and the traveller can pick
 * "Save as PDF" in the dialog.
 */

import { eur } from './format.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/** Plain-text itinerary, used for sharing. */
export function tripSummaryText({ label, stopDetails, flight, grandTotal, groupSize }) {
  const lines = [];
  lines.push(label || 'My trip');
  const first = stopDetails[0];
  const last = stopDetails[stopDetails.length - 1];
  if (first?.arriveDate) lines.push(`${fmtLong(first.arriveDate)} to ${fmtLong(last?.departDate)}`);
  lines.push('');
  if (flight?.combinable) lines.push(`Fly ${flight.origin} to ${flight.into_anchor}`);
  stopDetails.forEach((s, i) => {
    if (!s.dest) return;
    lines.push(`${i + 1}. ${s.dest.city}, ${s.dest.country} - ${s.nights} ${s.nights === 1 ? 'night' : 'nights'} (${fmtLong(s.arriveDate)})`);
  });
  if (flight?.combinable) lines.push(`Fly home ${flight.out_anchor} to ${flight.origin}`);
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

/** Printable HTML for the trip - opened in a new window for print-to-PDF. */
function tripPrintHtml({ label, stopDetails, dayPlan = [], flight, legs = [], stayCosts = [], carRental, grandTotal, groupSize }) {
  const first = stopDetails[0];
  const last = stopDetails[stopDetails.length - 1];
  const rows = [];

  if (flight?.combinable) {
    rows.push(`<tr><td>Flight out: ${esc(flight.origin)} &rarr; ${esc(flight.into_anchor)}</td><td>${esc(eur(flight.into_fare_eur * groupSize))}</td></tr>`);
    rows.push(`<tr><td>Flight home: ${esc(flight.out_anchor)} &rarr; ${esc(flight.origin)}</td><td>${esc(eur(flight.out_of_fare_eur * groupSize))}</td></tr>`);
    if (flight.ground_total > 0) rows.push(`<tr><td>Airport transfers</td><td>${esc(eur(flight.ground_total))}</td></tr>`);
  }
  legs.forEach((l, i) => {
    if (!l || !l.ground_total) return;
    rows.push(`<tr><td>${esc(stopDetails[i]?.dest?.city)} &rarr; ${esc(stopDetails[i + 1]?.dest?.city)} (${esc(l.mode)}, estimate)</td><td>${esc(eur(l.ground_total))}</td></tr>`);
  });
  if (carRental) rows.push(`<tr><td>Rental car, ${carRental.days} days</td><td>${esc(eur(carRental.eur_total))}</td></tr>`);
  stopDetails.forEach((s, i) => {
    const c = stayCosts[i];
    if (!c) return;
    rows.push(`<tr><td>${esc(s.dest?.city)}: ${s.nights} ${s.nights === 1 ? 'night' : 'nights'} accommodation</td><td>${esc(eur(c.accomTotal))}</td></tr>`);
    rows.push(`<tr><td>${esc(s.dest?.city)}: on the ground</td><td>${esc(eur(c.groundTotal))}</td></tr>`);
  });

  const days = dayPlan.map((d) => `
    <div class="day">
      <div class="day-head"><b>Day ${d.dayNum}</b> &middot; ${esc(d.stop.dest?.city)}${d.date ? ` &middot; ${esc(fmtLong(d.date))}` : ''}</div>
      ${d.activities.length
        ? `<ol>${d.activities.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`
        : '<p class="free">Free day: wander, eat well, no plans.</p>'}
    </div>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(label || 'My trip')}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1d1a16; margin: 40px auto; max-width: 640px; }
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
  .day { margin: 10px 0; font-size: 13.5px; }
  .day-head { margin-bottom: 3px; }
  .day ol { margin: 2px 0 0 18px; padding: 0; }
  .free { color: #6b6257; font-style: italic; margin: 2px 0; }
  .foot { margin-top: 32px; color: #a29786; font-size: 11.5px; }
  @media print { body { margin: 10mm auto; } }
</style></head><body>
  <h1>${esc(label || 'My trip')}</h1>
  <p class="dates">${esc(fmtLong(first?.arriveDate))} &rarr; ${esc(fmtLong(last?.departDate))} &middot; ${groupSize} ${groupSize === 1 ? 'person' : 'people'}</p>

  <h2>Route</h2>
  ${flight?.combinable ? `<div class="stop">Fly <b>${esc(flight.origin)} &rarr; ${esc(flight.into_anchor)}</b> <span class="when">${esc(fmtLong(first?.arriveDate))}</span></div>` : ''}
  ${stopDetails.map((s, i) => `
    <div class="stop">${i + 1}. <b>${esc(s.dest?.city)}, ${esc(s.dest?.country)}</b>
    <span class="when">${esc(fmtLong(s.arriveDate))} &rarr; ${esc(fmtLong(s.departDate))}, ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}</span></div>`).join('')}
  ${flight?.combinable ? `<div class="stop">Fly home <b>${esc(flight.out_anchor)} &rarr; ${esc(flight.origin)}</b> <span class="when">${esc(fmtLong(last?.departDate))}</span></div>` : ''}

  ${rows.length ? `<h2>Estimated costs</h2>
  <table>${rows.join('')}
    <tr class="total"><td>Estimated total</td><td>${esc(eur(grandTotal))}</td></tr>
  </table>` : ''}

  ${days ? `<h2>Day by day</h2>${days}` : ''}

  <p class="foot">Planned with Carta. Flight prices are stored Ryanair fares; ground and stay costs are estimates.</p>
</body></html>`;
}

/** Open the print dialog on a clean document; "Save as PDF" does the rest. */
export function downloadTripPdf(trip) {
  const w = window.open('', '_blank', 'noopener,width=760,height=900');
  if (!w) return false;
  w.document.write(tripPrintHtml(trip));
  w.document.close();
  // Give the new document a beat to lay out before the print dialog opens.
  w.setTimeout(() => { w.focus(); w.print(); }, 250);
  return true;
}
