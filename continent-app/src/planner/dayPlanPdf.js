// Print-ready "booklet" export for a day plan, lifted verbatim out of
// DayPlannerTab so the 200-line HTML/print builder stops bloating the tab.
// Pure except for the final window.open/print: it reads only what the caller
// passes in `ctx`, so it holds no React state of its own.
import { addDays, fmtDate as fmtDateFull } from '../lib/dates.js';
import { haversineKm } from '../lib/runtime_pricing.js';
import { poiKind, isMustSee, dwellMinutes } from './dayDraft.js';
import { safeUrl } from '../lib/format.js';
import { googleMapsDirUrl } from '../lib/routing.js';

/**
 * Build the booklet HTML for the whole trip and open it in a print window.
 * @param {object} ctx
 * @param {object}   ctx.stop           the currently-open stop (guard + title fallback)
 * @param {object[]} ctx.stops          all trip stops (walked so a multi-city plan prints as one booklet)
 * @param {object}   ctx.assignments    { [stopIndex]: { [dayIndex]: number[] } } picked POI indices
 * @param {object}   ctx.plan           saved plan (label)
 * @param {string[]} ctx.days           trip day ISO dates (for the cover "From ..." line)
 * @param {number}   ctx.visitFactor    pace multiplier for dwell times
 * @param {function} ctx.itemsForStop   (stop) => { items } the coordinate-bearing POI list
 * @param {function} ctx.estimateWalkMinutes (km) => minutes
 * @param {function} ctx.fmtDur         (minutes) => human duration string
 */
export function openDayPlanPdf(ctx) {
  const {
    stop, stops, assignments, plan, days, visitFactor,
    itemsForStop, estimateWalkMinutes, fmtDur,
  } = ctx;
  if (!stop) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Every place earns an explanation. Prefer the harvested Wikipedia summary;
  // otherwise compose an honest one-liner from what we do know (kind, whether
  // it's heritage-listed). A short accolade adds the "why go" for the best.
  const blurb = (it, city) => {
    const d = (it.desc || '').trim();
    if (d) return /[.!?]$/.test(d) ? d : `${d}.`;
    const kind = (poiKind(it) || 'place').toLowerCase();
    const article = /^[aeiou]/.test(kind) ? 'An' : 'A';
    let s = `${article} ${kind} in ${city}`;
    if (it.heritage) s += ', on the cultural-heritage register';
    return `${s}.`;
  };
  const accolade = (it) => {
    if (isMustSee(it)) return "One of the city's essential sights.";
    if ((it.rate ?? 0) >= 2) return 'A well-loved stop, worth the time.';
    if (it.active) return 'A good pick for an active, outdoors stretch.';
    return '';
  };
  // Search by "<sight>, <city>" so Google opens the real listing (name,
  // photos, hours) rather than a nameless "Dropped pin" at the coordinates.
  const placeUrl = (it, city) => {
    if (it.lat == null || it.lon == null) return null;
    const q = it.name ? [it.name, city].filter(Boolean).join(', ') : `${it.lat},${it.lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  };

  // Walk everything so a multi-city plan prints as one complete booklet.
  let totalPlaces = 0;
  let plannedDays = 0;
  const cityBlocks = stops.map((s, si) => {
    const { items } = itemsForStop(s);
    const cityName = s.dest?.city || 'This city';
    // Day numbers continue across the whole trip (city 2 doesn't restart at 1).
    const cityDayOffset = stops.slice(0, si).reduce((n, x) => n + x.nights, 0);
    const cityDays = Array.from({ length: s.nights }, (_, i) => addDays(s.arrive_date, i));
    const daySections = cityDays.map((date, di) => {
      const dayItems = (assignments[si]?.[di] || []).map((i) => items[i]).filter(Boolean);
      if (!dayItems.length) return '';
      plannedDays += 1;
      totalPlaces += dayItems.length;
      const pins = dayItems.filter((it) => it.lat != null && it.lon != null)
        .map((it) => ({ lat: it.lat, lon: it.lon, name: [it.name, s.dest?.city].filter(Boolean).join(', ') }));
      const gurl = googleMapsDirUrl(pins, 'walking');
      // Straight-line walking estimate for the whole day (consistent offline).
      let dayKm = 0;
      for (let i = 0; i < dayItems.length - 1; i += 1) {
        const a = dayItems[i]; const b = dayItems[i + 1];
        if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
          const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
          if (km != null) dayKm += km;
        }
      }
      const dayDwell = dayItems.reduce((n, it) => n + dwellMinutes(poiKind(it), visitFactor), 0);
      const meta = [
        `${dayItems.length} ${dayItems.length === 1 ? 'stop' : 'stops'}`,
        dayKm > 0.05 ? `~${dayKm.toFixed(1)} km · ~${estimateWalkMinutes(dayKm)} min on foot` : '',
        dayDwell > 0 ? `~${fmtDur(dayDwell)} at the sights` : '',
      ].filter(Boolean).join(' &middot; ');

      const rows = dayItems.map((it, i) => {
        const next = dayItems[i + 1];
        let walk = '';
        if (next && it.lat != null && it.lon != null && next.lat != null && next.lon != null) {
          const km = haversineKm(it.lat, it.lon, next.lat, next.lon);
          if (km != null) walk = `<div class="walk">&darr;&ensp;~${estimateWalkMinutes(km)} min walk &middot; ${km.toFixed(1)} km</div>`;
        }
        const acc = accolade(it);
        const purl = placeUrl(it, s.dest?.city);
        const links = [
          purl ? `<a href="${purl}">Open in Maps</a>` : '',
          safeUrl(it.wiki) ? `<a href="${esc(safeUrl(it.wiki))}">Read more</a>` : '',
        ].filter(Boolean).join('');
        return `<li class="stop">
            <div class="stop-row">
              <span class="num">${i + 1}</span>
              <div class="stop-body">
                <div class="stop-head">
                  <span class="stop-name">${esc(it.name)}</span>
                  ${poiKind(it) ? `<span class="tag">${esc(poiKind(it))}</span>` : ''}
                  ${isMustSee(it) ? '<span class="chip must">Must see</span>' : ''}
                  ${it.heritage ? '<span class="chip heritage">Heritage</span>' : ''}
                </div>
                <p class="blurb">${esc(blurb(it, cityName))}${acc ? ` <span class="accolade">${esc(acc)}</span>` : ''}</p>
                ${links ? `<div class="stop-links">${links}</div>` : ''}
              </div>
            </div>
            ${walk}
          </li>`;
      }).join('');

      return `<section class="day">
          <div class="day-head">
            <div class="day-title">Day ${cityDayOffset + di + 1}<span class="date">${esc(fmtDateFull(date, true))}</span></div>
            <div class="day-meta">${meta}</div>
          </div>
          <ol>${rows}</ol>
          ${gurl ? `<div class="day-route"><a href="${gurl}">Open the whole day in Google Maps &rarr;</a></div>` : ''}
        </section>`;
    }).filter(Boolean).join('');
    if (!daySections) return '';
    const multi = stops.length > 1;
    return multi
      ? `<div class="city"><h2 class="city-head">${esc(cityName)}<span>${esc(s.dest?.country || '')}</span></h2>${daySections}</div>`
      : daySections;
  }).filter(Boolean).join('');
  if (!totalPlaces) return;

  const title = plan.label || stop.dest?.city || 'Your day plan';
  const citiesWithPlans = stops.filter((s, si) => {
    const { items } = itemsForStop(s);
    return Array.from({ length: s.nights }).some((_, di) => (
      (assignments[si]?.[di] || []).some((i) => items[i])
    ));
  }).length;
  const subParts = [
    days[0] ? `From ${esc(fmtDateFull(stops[0]?.arrive_date || days[0], true))}` : '',
    `${plannedDays} planned ${plannedDays === 1 ? 'day' : 'days'}`,
    `${totalPlaces} ${totalPlaces === 1 ? 'place' : 'places'}`,
    citiesWithPlans > 1 ? `${citiesWithPlans} cities` : '',
  ].filter(Boolean).join(' &middot; ');

  const html = `<!doctype html><html><head><meta charset="utf-8">
      <title>${esc(title)} &middot; day plan</title>
      <style>
        :root {
          --paper:#f5f1e8; --paper-dim:#ebe6d8; --ink:#1a1a1a; --ink-soft:#4a4a48;
          --ink-mute:#8a8780; --rule:#c4bea9; --accent:#c8501e; --accent-bg:#f3d9c8;
          --display:'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif;
          --ui:'Inter Tight',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
        }
        * { box-sizing:border-box; margin:0; padding:0; }
        html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        body { font-family:var(--ui); color:var(--ink); background:var(--paper); padding:48px 54px; line-height:1.5; }
        a { color:inherit; }

        .cover { border-bottom:2px solid var(--ink); padding-bottom:20px; }
        .kicker { font-size:11px; letter-spacing:.26em; text-transform:uppercase; color:var(--accent); font-weight:600; }
        h1 { font-family:var(--display); font-size:38px; font-weight:600; line-height:1.05; letter-spacing:-.01em; margin-top:11px; }
        .cover-sub { font-size:12.5px; color:var(--ink-soft); margin-top:11px; }
        .cover-note { font-size:11px; color:var(--ink-mute); margin-top:14px; max-width:560px; line-height:1.55; }

        .city-head { font-family:var(--display); font-size:25px; font-weight:600; margin:40px 0 2px; }
        .city-head span { font-family:var(--ui); font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.14em; color:var(--ink-mute); margin-left:12px; vertical-align:middle; }

        .day { margin-top:28px; page-break-inside:auto; }
        .day-head { display:flex; align-items:baseline; justify-content:space-between; gap:14px; border-bottom:1.5px solid var(--rule); padding-bottom:8px; margin-bottom:6px; }
        .day-title { font-family:var(--display); font-size:19px; font-weight:600; }
        .day-title .date { font-family:var(--ui); font-size:11.5px; font-weight:400; color:var(--ink-mute); margin-left:12px; letter-spacing:.02em; }
        .day-meta { font-size:10px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:.09em; white-space:nowrap; }

        ol { list-style:none; }
        li.stop { padding:11px 0; break-inside:avoid; border-bottom:1px solid rgba(196,190,169,.45); }
        li.stop:last-child { border-bottom:none; }
        .stop-row { display:flex; gap:14px; }
        .num { flex:none; width:26px; height:26px; border-radius:50%; background:var(--ink); color:var(--paper); font-family:var(--ui); font-size:12px; font-weight:600; display:flex; align-items:center; justify-content:center; margin-top:1px; }
        .stop-body { flex:1; min-width:0; }
        .stop-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:2px 0; }
        .stop-name { font-family:var(--display); font-size:15.5px; font-weight:600; }
        .tag { font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:var(--ink-mute); margin-left:9px; }
        .chip { font-size:8.5px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; padding:2px 7px; border-radius:3px; margin-left:7px; }
        .chip.must { background:var(--accent-bg); color:var(--accent); }
        .chip.heritage { background:var(--paper-dim); color:var(--ink-soft); border:1px solid var(--rule); }
        .blurb { font-size:11.5px; color:var(--ink-soft); line-height:1.55; margin-top:4px; max-width:580px; }
        .accolade { color:var(--accent); }
        .stop-links { margin-top:6px; font-size:10.5px; }
        .stop-links a { color:var(--accent); text-decoration:none; font-weight:500; margin-right:16px; }
        .walk { font-size:10px; color:var(--ink-mute); padding:6px 0 1px 40px; letter-spacing:.02em; }

        .day-route { margin-top:13px; }
        .day-route a { display:inline-block; font-family:var(--ui); font-size:11px; font-weight:600; color:var(--paper); background:var(--accent); padding:8px 15px; border-radius:6px; text-decoration:none; letter-spacing:.02em; }

        footer { margin-top:44px; padding-top:12px; border-top:1px solid var(--rule); font-size:10px; color:var(--ink-mute); display:flex; justify-content:space-between; gap:12px; }

        @page { margin:15mm; }
        @media print { body { padding:0; background:var(--paper); } .day-route a { border:1px solid var(--accent); } }
      </style></head><body>
      <header class="cover">
        <div class="kicker">Carta &middot; Europe Travel</div>
        <h1>${esc(title)}</h1>
        <div class="cover-sub">${subParts}</div>
        <p class="cover-note">Your day-by-day plan, in walking order. Every place has a short note on what it is, a link to open it in Google Maps, and each day closes with a link to the whole route. Walking times are straight-line estimates.</p>
      </header>
      ${cityBlocks}
      <footer><span>Planned with Carta &middot; Europe Travel</span><span>carta.travel</span></footer>
      </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  const fire = () => { try { w.focus(); w.print(); } catch { /* window closed */ } };
  // Wait for fonts to settle so headings print in the right face; fall back
  // on a timeout if the fonts API isn't available or is slow.
  if (w.document.fonts && w.document.fonts.ready) {
    let done = false;
    w.document.fonts.ready.then(() => { if (!done) { done = true; fire(); } });
    setTimeout(() => { if (!done) { done = true; fire(); } }, 700);
  } else {
    setTimeout(fire, 400);
  }
}
