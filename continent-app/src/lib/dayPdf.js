/**
 * dayPdf.js (T433): a day plan as a booklet, the day planner's Download PDF.
 * It replaces the print window (planner/dayPlanPdf.js), which printed an HTML
 * page in whatever the browser made of it, with the Figtree booklet the trip
 * planner prints (lib/pdfKit.js, T430/T432).
 *
 * The paper says what the screen says: every day is routed through the same
 * checker (lib/dayRoute.js) and timed by the same clock (daySchedule.js), so a
 * leg the screen shows as a bus is a bus on paper too, never a walk.
 *
 *   cover    the town's photograph, the plan's name, the dates, the facts
 *   each day the time it spans, the stops, the walking; the route drawn; then
 *            the timetable: when you arrive, how long you stay, the walk or
 *            the ride to the next place, lunch where it falls
 *   credits  the photographs and the date
 */
import { createPdf, fileSlug, clean } from './pdfKit.js';
import { formatMoney } from './money.js';
import { routeDay, isWalkable } from './dayRoute.js';
import { buildDaySchedule, fmtClockLoose } from '../planner/daySchedule.js';
import { googleMapsDirParts, GMAPS_STOPS_PHONE } from './routing.js';
import { addDays } from './dates.js';
import { fmtKm } from '../planner/dayFormat.js';

function longDate(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const loc = lang === 'en' ? 'en-GB' : lang;
  return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

const rideMin = (km) => Math.max(10, Math.round(((km || 1) * 1.4 / 20) * 60) + 8);

/**
 * label, stops [{ destination_id, dest, nights, arrive_date }], assignments
 * { [si]: { [di]: [idx] } }, itemsForStop(stop) => { items }, dwellOf(item),
 * startMin, stay { label, lat, lon } | null, pace, stepFree, groupSize,
 * dayFig(destId) => { eur, est } | null, t, lang, cityLabel(name)
 */
export async function downloadDayPdf({
  label = '', stops = [], assignments = {}, itemsForStop, dwellOf, startMin = 9 * 60 + 30,
  stay = null, pace = 'balanced', stepFree = false, groupSize = 2, dayFig = () => null,
  t, lang = 'en', cityLabel = (s) => s,
}) {
  if (!stops.length) return;
  const name = clean(label || stops.map((s) => cityLabel(s.dest?.city || '')).filter(Boolean).join(', '));
  const kit = await createPdf({
    footerLabel: `Carta, ${name}`,
    pageLabel: (n, of) => t('pdf.page', { n, of }),
  });
  const { C } = kit;
  const photos = [];
  const first = stops[0];
  const lastStop = stops[stops.length - 1];
  const totalDays = stops.reduce((n, s) => n + (s.nights || 1), 0);
  const lastDate = lastStop.arrive_date ? addDays(lastStop.arrive_date, (lastStop.nights || 1) - 1) : null;

  // ── Cover ──
  const cover = first.dest?.image?.url
    ? { url: first.dest.image.url, caption: `${cityLabel(first.dest.city)}, ${first.dest.country}`, author: first.dest.image.credit !== first.dest.city ? first.dest.image.credit : '' }
    : null;
  if (cover) {
    photos.push(cover);
    await kit.photo(cover, { maxH: 95 });
  }
  kit.h1(name);
  if (first.arriveDate || first.arrive_date) {
    const from = longDate(first.arrive_date, lang);
    kit.para(totalDays > 1 ? t('day.dateRange', { from, to: longDate(lastDate, lang) }) : from, { size: 11, color: C.text2, after: 3 });
  }
  const fig = dayFig(first.destination_id);
  kit.facts([
    { label: t('day.stepDays'), value: t(totalDays === 1 ? 'day.oneDay' : 'day.nDays', { n: totalDays }) },
    { label: t('day.stepStart'), value: stay?.label || cityLabel(first.dest?.city || '') },
    fig && Number.isFinite(fig.eur)
      ? { label: t('dayws.costLabel'), value: `${fig.est ? '~' : ''}${formatMoney(fig.eur, { precision: 'whole', locale: lang })}${fig.est ? ` ${t('money.est')}` : ''}` }
      : null,
  ].filter(Boolean), 3);

  // ── The days ──
  let dayNo = 0;
  for (let si = 0; si < stops.length; si += 1) {
    const s = stops[si];
    const { items } = itemsForStop(s);
    const town = cityLabel(s.dest?.city || '');
    for (let di = 0; di < (s.nights || 1); di += 1) {
      dayNo += 1;
      const date = s.arrive_date ? addDays(s.arrive_date, di) : null;
      const dayItems = (assignments[si]?.[di] || []).map((i) => items[i]).filter(Boolean);
      kit.ensure(40);
      kit.h2(`${t('itin.dayN', { n: dayNo })}, ${[longDate(date, lang), town].filter(Boolean).join(', ')}`);
      if (!dayItems.length) {
        kit.para(t('dayex.dayFree'), { size: 10, color: C.text2, after: 3 });
        continue;
      }
      const placed = dayItems.filter((it) => Number.isFinite(it.lat) && Number.isFinite(it.lon));
      const startsAtStart = Boolean(stay) && placed.length > 0
        && Math.hypot(stay.lat - placed[0].lat, (stay.lon - placed[0].lon) * Math.cos((stay.lat * Math.PI) / 180)) * 111 <= 2.5;
      // eslint-disable-next-line no-await-in-loop -- one day at a time: the routing service is shared and public
      const route = await routeDay(placed, { start: stay, startsAtStart, pace, stepFree, groupSize });
      const lead = route.lead || 0;
      const legOf = (i) => {
        const l = route.checked ? route.legs[i + lead] : null;
        if (!l) return null;
        return isWalkable(l.status) ? l : { ...l, ride: true, min: rideMin(l.straightKm) };
      };
      const schedule = buildDaySchedule({
        items: dayItems,
        legMin: (i) => legOf(i)?.min ?? null,
        dwellMin: dwellOf,
        stayLegMin: startsAtStart && route.checked ? (route.legs[0]?.min || 0) : 0,
        startMin,
      });
      const facts = [
        t('dayws.timeSpan', { from: fmtClockLoose(startMin), to: fmtClockLoose(schedule.endMin) }),
        t(dayItems.length === 1 ? 'day.statStop' : 'day.statStops', { n: dayItems.length }),
        route.walkKm ? t('dayws.kmOnFoot', { km: fmtKm(route.walkKm, lang) }) : null,
      ].filter(Boolean).join(', ');
      kit.para(facts, { size: 10, color: C.text2, after: 2 });
      const line = route.legs.filter((l) => isWalkable(l.status)).flatMap((l) => l.coords);
      if (line.length >= 2) { kit.ensure(56); kit.route(line, { h: 50 }); }
      if (!route.checked) kit.para(t('dayws.routeOffline'), { size: 9, color: C.text2, after: 2 });

      dayItems.forEach((it, i) => {
        const row = schedule.rows[i];
        kit.ensure(18);
        kit.moneyRow(`${row ? fmtClockLoose(row.arriveMin) : ''}   ${clean(it.name)}`, dwellOf(it) ? `${dwellOf(it)} min` : '', { bold: true });
        if (it.kind || it.desc) kit.para(clean(it.desc || it.kind || '').slice(0, 160), { size: 9, color: C.text2, after: 0.8 });
        if (schedule.lunch && schedule.lunch.afterIndex === i) {
          kit.para(`${fmtClockLoose(schedule.lunch.startMin)}   ${t('dayws.lunchFor', { min: schedule.lunch.endMin - schedule.lunch.startMin })}`, { size: 9.5, color: C.text2, after: 1 });
        }
        const leg = i < dayItems.length - 1 ? legOf(i) : null;
        if (leg) {
          const text = leg.ride
            ? `${leg.status === 'detour' ? t('dayws.legWhyDetour') : leg.status === 'far' ? t('dayws.legWhyFar') : leg.status === 'unreachable' ? t('dayws.legWhyOffPath') : t('dayws.legWhyNoPath')} ${t('dayws.legRide', { min: leg.min })} (${t('money.est')})`
            : leg.ferry ? t('dayws.legFerry', { min: leg.min })
              : t('dayws.legWalk', { min: leg.min, km: fmtKm(leg.km || 0, lang) });
          kit.para(text, { size: 9, color: leg.ride ? C.warn : C.text2, after: 1.6 });
        }
      });
      kit.para(`${fmtClockLoose(schedule.endMin)}   ${t('dayws.dayDone')}`, { size: 9.5, color: C.text2, after: 1.5 });
      // A printed day is opened on a phone: links of 3 stops, each part
      // ending where the next begins, so no stop is dropped (T487-a).
      const gparts = googleMapsDirParts([
        ...(stay && startsAtStart ? [{ lat: stay.lat, lon: stay.lon, city: t('day.yourStay') }] : []),
        ...placed.map((it) => ({ lat: it.lat, lon: it.lon, city: it.name })),
      ], 'walking', GMAPS_STOPS_PHONE);
      if (gparts.length === 1) kit.link(t('day.gmapsOpen', { n: dayNo }), gparts[0].url);
      else if (gparts.length > 1) {
        kit.para(t('day.gmapsOpen', { n: dayNo }), { size: 9.5, color: C.text2, after: 0.6 });
        gparts.forEach((g, i) => kit.link(t('day.gmapsPart', { i: i + 1, from: g.from.city || '', to: g.to.city || '' }), g.url));
      }
      kit.gap(3);
    }
  }

  // ── Credits ──
  kit.h2(t('pdf.credits'));
  for (const p of photos) {
    kit.para(`${clean(p.caption || '')}${p.author ? `: ${p.author}` : ''}`, { size: 8.5, color: C.text2, after: 0.6 });
  }
  kit.para(t('dayws.pdfHoursNote'), { size: 9, color: C.text2, after: 1 });
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { dateStyle: 'long' }).format(new Date());
  kit.gap(2);
  kit.para(t('pdf.generatedNote', { date: today }), { size: 9, color: C.text3 });

  kit.save(`carta-${fileSlug(name) || 'day'}.pdf`);
}
