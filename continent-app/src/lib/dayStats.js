/**
 * dayStats.js (T431): one reader for a trip day's measured line, whatever
 * form the record wrote it in.
 *
 *   day.stats            a v2.0 record's typed line (the sample trips)
 *   day.dayStats object  a v2.1 record's typed line (schema $defs/dayStats)
 *   day.dayStats string  the free line every catalogue trip carries
 *                        ("12 km / 700 m ascent / summit 2,942 m / 6-7 h")
 *
 * Returns { km, up, down, high, minutes, mode, rest } with null wherever the
 * day does not say. The distance, climb and drop come from weekShape's
 * dayRelief, so the chart, the day card and the effort strip never disagree
 * on a day; the high point and the hours are read here. The high point is
 * read only on styles whose days climb (a city day's "Escaldes 1,100 m" is a
 * town's height, not a summit), and the hours only from the part of the line
 * that times the day itself, never a bus or a transfer.
 *
 * Pure functions only, so the node tests import it.
 */
import { dayRelief } from './weekShape.js';

const CLIMB_STYLES = new Set(['hiking', 'trail-running', 'nature-escape', 'cycling', 'pilgrim', 'winter-sports']);
const MODE_OF_STYLE = {
  hiking: 'hike', 'trail-running': 'run', 'nature-escape': 'walk', cycling: 'ride', pilgrim: 'walk',
  'winter-sports': 'ski', 'water-sports': 'paddle', 'road-trip': 'drive',
};

const strip = (s) => String(s || '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
const toNum = (s) => Number(String(s).replace(/,/g, ''));
const fin = (v) => (Number.isFinite(v) ? v : null);

/** The typed line of a day, from either typed form, or null. */
function typedOf(day) {
  if (day?.stats && typeof day.stats === 'object') return day.stats;
  if (day?.dayStats && typeof day.dayStats === 'object') return day.dayStats;
  return null;
}

/** The highest "N m" in a written line that is a height, not a climb or a
 *  drop: "Arinsal 1,550 m / refuge 2,260 m" -> 2260. */
export function highOf(text) {
  const s = strip(text);
  const re = /([+\-−↑↓]?)\s*(\d{1,2}(?:,\d{3})|\d{3,4})\s*m\b(?!\s*(?:of\s+)?(?:ascent|descent|climb|climbing|gain|loss|up\b|down\b|vert|negative|D[+-]))/gi;
  let best = null;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) continue;
    const v = toNum(m[2]);
    if (v >= 200 && v <= 4900) best = Math.max(best ?? 0, v);
  }
  return best;
}

const TIME = String.raw`(\d+(?:[.,]\d+)?)\s*h(?:ours?)?(?:\s*(\d{1,2})\s*(?:min)?)?|(\d+)\s*min`;

/** Minutes for one time figure: "2 h 45 min" -> 165, "90 min" -> 90. */
function minutesOf(m) {
  if (m[3]) return toNum(m[3]);
  return toNum(String(m[1]).replace(',', '.')) * 60 + (m[2] ? toNum(m[2]) : 0);
}

/** The time a day takes, in minutes, at the long end of a range, read from
 *  the part of the line that times the day: "6 h 30 min-7 h 30 min
 *  realistic" -> 450, "6-7 h" -> 420. A "BCN 3 h 15 min" transfer is not. */
export function minutesOfLine(text) {
  const parts = strip(text).split(/\s*\/\s*|;\s*/);
  const timed = parts.filter((p) => /\d\s*(?:h\b|hours?\b|min\b)/i.test(p));
  const own = timed.find((p) => /realistic|walking|hiking|moving|riding|on foot|in the saddle|on the water/i.test(p))
    || timed.find((p) => !/\b[A-Z]{3}\b|\bbus\b|\btrain\b|transfer|\bdrive\b|driving|\bferry\b|flight|by car/i.test(p));
  if (!own) return null;
  const range = own.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?)\s*h\b/i);
  if (range) return toNum(String(range[2]).replace(',', '.')) * 60;
  const re = new RegExp(TIME, 'gi');
  let best = null;
  let m;
  while ((m = re.exec(own))) {
    const v = minutesOf(m);
    if (v > 0 && v < 24 * 60) best = Math.max(best ?? 0, v);
  }
  return best;
}

// A day spent on a bus, a train, a ferry or at the wheel: its kilometres are
// travel, not effort, on a walking or riding week.
const TRAVEL = new Set(['bus', 'train', 'ferry', 'drive']);

/** One day's figures: { km, up, down, high, minutes, mode, rest, travel }. */
export function dayStatsOf(day, typeSlug) {
  const typed = typedOf(day);
  const relief = dayRelief(typed ? { ...day, dayStats: typed } : day, typeSlug);
  const mode = typed?.mode || MODE_OF_STYLE[typeSlug] || null;
  if (typed) {
    const time = typed.timeMin || {};
    return {
      km: fin(typed.distanceKm ?? relief.km),
      up: fin(typed.ascentM ?? relief.up),
      down: fin(typed.descentM ?? relief.down),
      high: fin(typed.highM),
      minutes: fin(time.high ?? time.low),
      mode,
      rest: Boolean(relief.rest),
      travel: TRAVEL.has(mode),
    };
  }
  const line = typeof day?.dayStats === 'string' ? day.dayStats : '';
  return {
    km: fin(relief.km),
    up: fin(relief.up),
    down: fin(relief.down),
    high: CLIMB_STYLES.has(typeSlug) ? highOf(line) : null,
    minutes: line ? minutesOfLine(line) : null,
    mode,
    rest: Boolean(relief.rest),
    travel: false,
  };
}

/**
 * The week in numbers: every day's figures, the totals, the hardest climb
 * and the typical hours, for the fact band, the climb chart and the
 * difficulty explanation. Totals are null when no day states the figure.
 */
export function weekStats(trip) {
  const type = trip?.tripTypeSlug;
  const days = (trip?.itinerary || []).map((d, i) => ({ day: d.day ?? i + 1, ...dayStatsOf(d, type) }));
  // A travel day counts only on a rail journey, where the train is the trip.
  const counts = (d) => !d.travel || type === 'rail';
  const sum = (key) => {
    const vals = days.filter(counts).map((d) => d[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const highs = days.map((d) => d.high).filter((v) => v != null);
  const climbs = days.filter((d) => d.up != null && d.up > 0);
  const biggest = climbs.length ? climbs.reduce((a, b) => (b.up > a.up ? b : a)) : null;
  const moving = days.filter((d) => counts(d) && !d.rest && d.minutes != null);
  const hours = moving.map((d) => d.minutes / 60).sort((a, b) => a - b);
  return {
    days,
    km: sum('km'),
    up: sum('up'),
    down: sum('down'),
    high: highs.length ? Math.max(...highs) : null,
    biggest: biggest ? { day: biggest.day, up: biggest.up } : null,
    // The typical moving day: the median, so one long day does not set it.
    hoursTypical: hours.length ? hours[Math.floor(hours.length / 2)] : null,
    hoursMax: hours.length ? hours[hours.length - 1] : null,
    measured: days.filter((d) => d.km != null || d.up != null).length,
  };
}
