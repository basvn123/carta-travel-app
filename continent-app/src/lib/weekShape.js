/* The shape of the week, the two ends of it, and the weather plan (T170, spec
   M2, M3, M5).

   Everything here is read out of the trip as written: the per-day `sleep`
   line, `basecamps`, the measured `dayStats` line, the day prose, the gateway
   airports. Nothing is invented. Where the source does not say, the helpers
   return null and the page says "not recorded" rather than guessing, which is
   the rule the rest of the journey page follows.

   Three readers:
     weekShape(trip)    the bases night by night and an effort level per day
     tripEnds(trip)     day zero (arrive) and the day after the last (leave)
     weatherPlan(trip)  a named fallback per day, and for winter and water
                        trips the days grouped by the conditions they need

   The thresholds below are Carta's own reading of a day's numbers, not a
   source fact. They are written down here so a reviewer can argue with one
   number rather than with a feeling. */

const strip = (s) => String(s || '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
const fold = (s) => strip(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (s) => Number(String(s).replace(/,/g, ''));

/* ── Sentences ───────────────────────────────────────────────────────────── */

// The middle dot some dayStats lines use as a separator, built from its code
// point so the character itself never appears in source (design-lint).
const SENTENCE_SPLIT = new RegExp(String.raw`(?<=[.!?])\s+(?=[A-Z0-9"'(])|\s+\/\s+|\s+` + String.fromCharCode(0xb7) + String.raw`\s+`);

/** Split prose into sentences, and a dayStats line into its " / " clauses. */
export function sentences(text) {
  return strip(text)
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

const dayText = (day, parts = ['morning', 'afternoon', 'evening']) => parts.map((p) => day?.[p] || '').join(' ');

/* ── Bases, night by night (M2) ──────────────────────────────────────────── */

const LODGING = /\b(hotel|guesthouse|guest house|hostel|apartment|room|rooms|refuge|rifugio|hut|huts|casa|pension|homestay|camp|campsite|lodge|cabin|quinta|b&b|inn|konak|bujtina|chalet|bungalow|villa)\b/i;
const EXIT_NIGHT = /airport|flight|departure|fly out|fly home|n\/a|^[\s,.-]*$/i;
const STOP = new Set(['or', 'and', 'the', 'a', 'an', 'in', 'at', 'on', 'of', 'de', 'la', 'le', 'di', 'del', 'back',
  'small', 'central', 'hotel', 'guesthouse', 'guest', 'house', 'hostel', 'apartment', 'room', 'pension', 'village',
  'if', 'you', 'your', 'm', 'night', 'nights', 'half', 'board', 'dorm', 'approx', 'same']);

function baseTokens(s) {
  return fold(s)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Two sleep lines name the same base when most of the shorter one's words
 *  are in the longer one: "Hotel Kastel or Roxanich, Motovun" and "Hotel
 *  Kastel or Roxanich Wine & Heritage Hotel, Motovun" are one base. */
export function sameBase(a, b) {
  const A = new Set(baseTokens(a));
  const B = new Set(baseTokens(b));
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

/** The short place for a sleep line: "Hotel San Rocco, Brtonigla" -> "Brtonigla",
 *  "Manteigas, small hotel or casa de campo" -> "Manteigas",
 *  "Rifugio Biella, 2,327 m (dorm ...)" -> "Rifugio Biella". */
export function baseLabel(line) {
  const s = strip(line).replace(/\([^)]*\)/g, '').replace(/[.\s]+$/, '').trim();
  const segs = s.split(/\s*,\s+/).filter(Boolean)
    .filter((seg) => !/^(or|and)\b/i.test(seg) && !/^\d[\d,.]*\s*m\b/.test(seg));
  if (!segs.length) return s;
  if (segs.length === 1) {
    const m = segs[0].match(/\b(?:in|at)\s+(?:central\s+)?(.+)$/i);
    return (m && !LODGING.test(m[1]) ? m[1] : segs[0]).trim();
  }
  const last = segs[segs.length - 1];
  if (LODGING.test(last) && !LODGING.test(segs[0])) return segs[0];
  return last.replace(/^(?:central|old town|in)\s+/i, '').trim();
}

/** Place each basecamp on a night from the day prose, and keep the result only
 *  if it reads as a real week: every base used, each base one unbroken run. */
function placeBasecamps(itinerary, camps) {
  const keys = camps.map((c) => fold(String(c).replace(/\([^)]*\)/g, '')).split(/\s*(?:,|\bor\b)\s*/)[0].trim());
  if (keys.some((k) => k.length < 3)) return null;
  const find = (text) => {
    const t = fold(text);
    let best = -1;
    let at = -1;
    keys.forEach((k, i) => {
      const p = t.lastIndexOf(k);
      if (p > at) { at = p; best = i; }
    });
    return best;
  };
  let current = 0;
  const nights = itinerary.map((day) => {
    const hit = [find(day.evening || ''), find(day.title || '')].find((i) => i >= 0);
    if (hit != null && hit >= 0) current = hit;
    return current;
  });
  const runs = nights.filter((b, i) => i === 0 || b !== nights[i - 1]);
  if (new Set(runs).size !== runs.length || new Set(nights).size !== camps.length) return null;
  return nights.map((i) => strip(camps[i]));
}

/**
 * The bases, night by night.
 *   source 'sleep'      every night is written on the day ("sleep")
 *   source 'one'        one basecamp: the whole week from one bed
 *   source 'placed'     several basecamps, placed on nights from the prose
 *   source 'listed'     several basecamps that could not be placed: listed only
 *   source null         nothing recorded
 * `exit` is the last night when it is an airport night or no night at all;
 * it belongs to the leaving module, not to the strip.
 */
export function weekBases(trip) {
  const it = trip?.itinerary || [];
  const camps = (trip?.basecamps || []).filter(Boolean);
  const out = { source: null, nights: it.map(() => null), runs: [], moves: 0, exit: null, listed: [] };
  if (!it.length) return out;

  if (it.some((d) => strip(d.sleep))) {
    const lines = it.map((d) => strip(d.sleep) || null);
    const lastIdx = lines.length - 1;
    if (lines[lastIdx] == null || EXIT_NIGHT.test(lines[lastIdx])) {
      out.exit = { day: it[lastIdx].day, text: lines[lastIdx] && !/^(departure|n\/a)/i.test(lines[lastIdx]) ? lines[lastIdx] : null };
      // An airport night that also names the base ("Hotel Adriatic, Rovinj, or
      // an airport hotel") is still a night in that base.
      if (!(lines[lastIdx] && lastIdx > 0 && lines[lastIdx - 1] && sameBase(lines[lastIdx], lines[lastIdx - 1]))) {
        lines[lastIdx] = null;
      }
    }
    out.nights = lines;
    out.source = 'sleep';
  } else if (camps.length === 1) {
    out.nights = it.map(() => strip(camps[0]));
    out.source = 'one';
  } else if (camps.length > 1) {
    const placed = placeBasecamps(it, camps);
    if (placed) {
      out.nights = placed;
      out.source = 'placed';
    } else {
      out.listed = camps.map((c) => baseLabel(c));
      out.source = 'listed';
      out.moves = null;
      return out;
    }
  } else {
    return out;
  }

  // Runs of nights in one base. A night with no line continues no run.
  for (let i = 0; i < out.nights.length; i += 1) {
    const line = out.nights[i];
    if (!line) continue;
    const prev = out.runs[out.runs.length - 1];
    if (prev && prev.to === i - 1 && sameBase(prev.line, line)) {
      prev.to = i;
    } else {
      out.runs.push({ from: i, to: i, line, label: baseLabel(line) });
    }
  }
  out.moves = Math.max(0, out.runs.length - 1);
  return out;
}

/* ── Effort per day (M2) ─────────────────────────────────────────────────── */

const REST = /\brest\b|\bday off\b|\bflex(?:ible)? day\b|zero vertical|contingency|\b0 km\b/i;

const RANGE = String.raw`(\d[\d,]*(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d[\d,]*(?:\.\d+)?))?`;
const mid = (m, a = 1, b = 2) => (m[b] ? (num(m[a]) + num(m[b])) / 2 : num(m[a]));

/** The first distance in the line that is not a drive, bus or transfer. */
function moveKm(s) {
  const re = new RegExp(`${RANGE}\\s*km\\b`, 'gi');
  let m;
  while ((m = re.exec(s))) {
    const before = s.slice(Math.max(0, m.index - 14), m.index);
    const after = s.slice(re.lastIndex, re.lastIndex + 14);
    if (/driv|by car|by road|transfer|bus|train|ferry|cable|drive/i.test(after + before)) continue;
    if (/[A-Z]{3}\s*-\s*[A-Z]?[a-z]*\s*$/.test(before)) continue;   // "PUY-Motovun 50 km"
    return mid(m);
  }
  return null;
}

function ascentM(s) {
  const pats = [
    new RegExp(`(?:\\+|↑|D\\+\\s*)\\s*${RANGE}\\s*m\\b`, 'i'),
    new RegExp(`${RANGE}\\s*m\\s*(?:of\\s+)?(?:ascent|climb|climbing|gain|up\\b|D\\+|vert|elevation gain)`, 'i'),
    new RegExp(`km\\s*[,/]\\s*${RANGE}\\s*m\\b(?!\\s*(?:descent|altitude|high|asl|summit))`, 'i'),
  ];
  for (const p of pats) {
    const m = s.match(p);
    if (m) return mid(m);
  }
  return null;
}

function verticalM(s) {
  const m = s.match(new RegExp(`${RANGE}\\s*m\\s*(?:of\\s+)?(?:vertical|descent|vert)`, 'i'));
  return m ? mid(m) : null;
}

function hoursOf(s, cue) {
  const m = s.match(new RegExp(`${RANGE}\\s*(?:h|hours?)\\b\\s*(?:${cue})`, 'i'));
  return m ? mid(m) : null;
}

function matchMid(s, pattern) {
  const m = s.match(new RegExp(pattern, 'i'));
  return m ? mid(m) : null;
}

const WATER_CUE = 'on water|on the water|in water|in the water|water time|of water|land-sailing|paddling|sailing|kiting|surfing';

function waterHours(s) {
  return hoursOf(s, WATER_CUE) ?? matchMid(s, `${RANGE}\\s*water hours`);
}

/** A city day is measured on foot: the walking figure when the line names
 *  one ("20 km round trip + 4 km walking" -> 4), and no figure when the only
 *  distance is a timed transfer ("150 km, 2h20-2h50" is a train, not a walk). */
function cityKm(s) {
  const walked = matchMid(s, `${RANGE}\\s*km\\s*(?:on foot|walk|walking|walked)`)
    ?? matchMid(s, `(?:walking|walked)[:\\s]+${RANGE}\\s*km`);
  if (walked != null) return walked;
  if (/\d\s*h\s*\d|\d+h\d|round trip|by (?:train|bus|car)/i.test(s)) return null;
  return moveKm(s);
}

/** A road-trip line leads with the day's distance ("115 km / 2 h 45"), or
 *  names it as driving ("60 km driving"). */
function driveKm(s) {
  return matchMid(s, `^${RANGE}\\s*km`) ?? matchMid(s, `${RANGE}\\s*km\\s*(?:of\\s+)?driv`);
}

/* Levels: 1 light, 2 moderate, 3 hard; 0 is a rest day. The cut points are
   per style, because 40 km is a short day on a bike and a long one on foot. */
const CUTS = {
  hiking: { unit: 'walk', cuts: [13, 24] },          // km + ascent/100, the Swiss "Leistungskilometer"
  'trail-running': { unit: 'walk', cuts: [16, 28] },
  'nature-escape': { unit: 'walk', cuts: [13, 24] },
  cycling: { unit: 'ride', cuts: [45, 85] },         // km + ascent/25
  'winter-sports': { unit: 'vertical', cuts: [2000, 5000] },  // metres skied
  'water-sports': { unit: 'water', cuts: [2, 3.5] }, // hours on the water
  'road-trip': { unit: 'drive', cuts: [100, 220] },  // km at the wheel
  city: { unit: 'city', cuts: [8, 14] },             // km on foot
};

const level = (v, [a, b]) => (v < a ? 1 : v < b ? 2 : 3);

/**
 * One day's effort: { level 0..3 | null, rest, value, unit }.
 * level null means the line carries no number this style is measured by.
 */
export function dayEffort(day, typeSlug) {
  const rule = CUTS[typeSlug];
  const stats = day?.dayStats;
  const title = strip(day?.title);
  if (REST.test(title) || (typeof stats === 'string' && /^rest\b/i.test(strip(stats)))) {
    return { level: 0, rest: true, value: null, unit: rule?.unit || null };
  }
  if (!rule || !stats) return { level: null, rest: false, value: null, unit: rule?.unit || null };

  let km = null; let up = null; let vert = null; let hours = null;
  if (typeof stats === 'object') {
    km = Number.isFinite(stats.distanceKm) ? stats.distanceKm : null;
    up = Number.isFinite(stats.ascentM) ? stats.ascentM : null;
    hours = Number.isFinite(stats.timeMin?.high) ? stats.timeMin.high / 60 : null;
  } else {
    const s = strip(stats);
    if (rule.unit === 'vertical') vert = verticalM(s);
    else if (rule.unit === 'water') hours = waterHours(s);
    else if (rule.unit === 'drive') km = driveKm(s);
    else if (rule.unit === 'city') km = cityKm(s);
    else { km = moveKm(s); up = ascentM(s); }
  }

  let value = null;
  if (rule.unit === 'walk') value = km == null && up == null ? null : (km || 0) + (up || 0) / 100;
  else if (rule.unit === 'ride') value = km == null ? null : km + (up || 0) / 25;
  else if (rule.unit === 'vertical') value = vert;
  else if (rule.unit === 'water') value = hours;
  else if (rule.unit === 'drive') value = km;
  else if (rule.unit === 'city') value = km;
  if (value == null || !Number.isFinite(value)) return { level: null, rest: false, value: null, unit: rule.unit };
  if (value === 0) return { level: 0, rest: true, value, unit: rule.unit };
  return { level: level(value, rule.cuts), rest: false, value, unit: rule.unit };
}

/** The whole strip: bases and effort, plus the counts the summary line says. */
export function weekShape(trip) {
  const it = trip?.itinerary || [];
  const bases = weekBases(trip);
  const days = it.map((day, i) => ({
    day: day.day ?? i + 1,
    title: strip(day.title),
    ...dayEffort(day, trip?.tripTypeSlug),
  }));
  const measured = days.filter((d) => d.level != null).length;
  return {
    bases,
    days,
    measured,
    hard: days.filter((d) => d.level === 3).length,
    rest: days.filter((d) => d.rest).length,
    show: it.length > 0 && (bases.source != null || measured > 0),
  };
}

/* ── Day zero and the day after the last (M3) ────────────────────────────── */

/** "75 min", "2 h 30", "3 h-3 h 45", "1 h 45-2 h 15" -> the longest, in minutes. */
export function transferMinutes(text) {
  const s = strip(text);
  let best = null;
  const re = /(\d+(?:[.,]\d+)?)\s*h(?:ours?)?(?:\s*(\d{1,2})(?:\s*min)?)?|(\d+)\s*min/gi;
  let m;
  while ((m = re.exec(s))) {
    const v = m[3] ? num(m[3]) : num(String(m[1]).replace(',', '.')) * 60 + (m[2] ? num(m[2]) : 0);
    if (v > 0 && v < 24 * 60) best = Math.max(best ?? 0, v);
  }
  return best;
}

const TIME = String.raw`\d+(?:[.,]\d+)?\s*h(?:ours?)?(?:\s*\d{1,2}(?:\s*min)?)?|\d+\s*min`;
const TRANSFER = new RegExp(`(?:${TIME})(?:\\s*(?:-|–|to)\\s*(?:${TIME}))?`, 'i');

/** The first transfer time in a text, a range read at its long end:
 *  "160 km north; road transfer 2 h 30-3 h via the E79" -> 180. */
export function firstTransfer(text) {
  const m = strip(text).match(TRANSFER);
  return m ? transferMinutes(m[0]) : null;
}

/** The place a transfer is timed to: "75 min to Buje" -> "Buje". */
export function transferPlace(text) {
  const m = strip(text).match(/\bto\s+([A-ZÀ-Ž][^,;()]*?)(?:\s*(?:,|;|\(|$|\bby\b|\bvia\b))/);
  return m ? m[1].trim() : null;
}

const GEAR = /(?<!cable )\b(bikes?|e-bikes?|gear|kit|boats?|board|skis?|boots|car|van|kayaks?|hire|rental|yacht|charter|equipment|wetsuit|camper|motorhome)\b/i;
const COLLECT = /\b(hire|rental|rent|collect|delivery|pick up|pick-up|take the boat|taking the boat|handover|hand-over|check-in at the marina|fit(?:ted|ting)?)\b/i;
const GIVE_BACK = /\b(return|drop-off|drop off|hand back|hand-back|handover|hand-over)\b/i;
const LUGGAGE = /left[- ]luggage|luggage storage|luggage lockers?|bag(?:gage)? (?:storage|drop)|store (?:your )?(?:bags|luggage)|leave (?:your |the )?(?:bags|luggage)|luggage left at|bags? at the hotel|luggage at the hotel/i;

function firstMatch(texts, ...tests) {
  for (const text of texts) {
    for (const s of sentences(text)) if (tests.every((re) => re.test(s))) return s;
  }
  return null;
}

/** Airport rows in the shape the gateway list uses: {code, name, detail, minutes, place}. */
export function airportRows(trip, parseGateway) {
  let rows = [];
  if (Array.isArray(trip?.gateways) && trip.gateways.length) {
    rows = trip.gateways.map((g) => ({
      code: g.code, name: g.name || '', detail: g.note || '',
      minutes: Number.isFinite(g.transferMin) ? g.transferMin : null,
      place: g.transferTo || null,
    }));
  } else if (trip?.gatewayAirport && parseGateway) {
    // A string that did not split cleanly keeps only its first airport, the
    // same rule the facts list follows (gatewayFact in JourneyPage.jsx).
    // The time and place are the FIRST transfer the row names: "25 min to
    // Kotor, 1 h 45 to Ulcinj. TGD Podgorica is ..." is 25 minutes to Kotor.
    // A prose row shows its clauses up to that time; the rest of the prose
    // stays in the facts list.
    const { rows: parsed, complete } = parseGateway(trip.gatewayAirport);
    rows = (complete ? parsed : parsed.slice(0, 1)).map((r) => {
      const sentence = String(r.detail || '').split(/\.\s/)[0].trim();
      const clauses = sentence.split(/[,;]\s/);
      const at = clauses.findIndex((c) => TRANSFER.test(c));
      const lead = at >= 0 ? clauses.slice(0, at + 1).join(', ') : clauses[0];
      return {
        ...r, detail: complete ? r.detail : lead, minutes: firstTransfer(lead), place: transferPlace(lead),
      };
    });
  }
  // "LJU and VCE both around 2 h 30" is two airports in one clause, not a row.
  return rows.filter((r) => r.code && !/^(and|or)\b/i.test(r.name || ''));
}

const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/* The two assumptions the computed lines rest on, stated on the page:
   45 minutes from touchdown to the road (bags, passport, finding the car or
   the bus), and 2 hours at the airport before a European flight. */
export const LAND_TO_ROAD_MIN = 45;
export const AIRPORT_BEFORE_MIN = 120;
export const LATE_ARRIVAL = 22 * 60;

/**
 * Day zero and the day after the last. Every field is null when the trip
 * does not say; the page renders only what is there.
 */
export function tripEnds(trip, parseGateway) {
  const it = trip?.itinerary || [];
  if (!it.length) return null;
  const first = it[0];
  const last = it[it.length - 1];
  const bases = weekBases(trip);
  const airports = airportRows(trip, parseGateway);
  const timed = airports.find((a) => a.minutes != null) || null;

  const firstRun = bases.runs[0] || null;
  const lastRun = bases.runs[bases.runs.length - 1] || null;
  const firstBase = firstRun ? firstRun.label : (bases.listed[0] || null);
  const lastBase = lastRun ? lastRun.label : (bases.listed[bases.listed.length - 1] || null);

  const arriveAt = timed ? (timed.place || firstBase) : null;
  const landBy = timed ? hhmm(LATE_ARRIVAL - timed.minutes - LAND_TO_ROAD_MIN) : null;

  const lastPlaceTimed = timed && lastBase && (
    (timed.place && sameBase(timed.place, lastBase))
    || bases.source === 'one'
    || bases.runs.length === 1
  );

  const allText = [
    dayText(last), strip(last.dayStats), dayText(it[it.length - 2] || {}),
    ...Object.values(trip?.logistics || {}).filter((v) => typeof v === 'string'),
    ...(trip?.proTips || []).filter((v) => typeof v === 'string'),
    ...(trip?.accommodationStrategy || []).map((s) => s?.description || ''),
  ];

  return {
    airports: airports.slice(0, 3),
    arrive: {
      firstBase,
      firstNight: bases.source === 'sleep' ? strip(first.sleep) || null : null,
      opening: sentences(first.morning || '')[0] || null,
      collect: firstMatch([dayText(first, ['morning', 'afternoon']), strip(first.dayStats)], COLLECT, GEAR),
      timed: timed ? { code: timed.code, minutes: timed.minutes, place: arriveAt } : null,
      landBy,
    },
    leave: {
      lastBase,
      lastDay: last.day ?? it.length,
      exit: bases.exit,
      giveBack: firstMatch([dayText(last), strip(last.dayStats), dayText(it[it.length - 2] || {})], GIVE_BACK, GEAR),
      luggage: firstMatch(allText, LUGGAGE),
      timed: lastPlaceTimed
        ? { code: timed.code, minutes: timed.minutes, before: timed.minutes + AIRPORT_BEFORE_MIN, place: timed.place || lastBase }
        : null,
      timedElsewhere: !lastPlaceTimed && timed ? { code: timed.code, place: timed.place || firstBase } : null,
    },
  };
}

/* ── The weather plan (M5) ───────────────────────────────────────────────── */

const WEATHER = /\b(weather|rain|rains|raining|rainy|wet|wind|windy|gale|storm|storms|stormy|thunder\w*|bora|maestral|mistral|tramontana|f[oö]hn|foehn|meltemi|swell|sea is up|whiteout|visibility|fog|foggy|mist|low cloud|snow|bad-snow|heat|forecast|conditions)\b/i;
// A fallback names the weather AND what to do instead. A sentence that only
// says "if conditions allow" or "holds cold snow when it turns" is a
// condition, not a fallback, and is left out.
const ALT = /\b(or|instead|rather than|otherwise|alternative|alternatively|fallback|fall back|plan b|swap|escape|bail-?out|contingency|take it now)\b/i;
const COND = /\b(if|unless|when|in case)\b/i;
const NAMED_ALT = /\b(alternative|alternatively|fallback|plan b|contingency|bail-?out)\b/i;
// A day whose title offers a choice ("The Vojak day, or the Vizinada
// alternative") carries its own option even with no weather word.
const TITLE_OPTION = /\bor (?:the )?.+\b(alternative|option)\b/i;
const OPTION_CUE = /\b(instead|alternative|alternatively|skipping)\b/i;
const BAIL = /^bail-?out:?\s*/i;
const FLEX = /weather|contingency|flex|rest day|spare day|best-conditions|best conditions|reserve day|buffer/i;
const OUTDOOR = new Set(['hiking', 'trail-running', 'cycling', 'winter-sports', 'water-sports', 'nature-escape', 'road-trip']);
export const CONDITION_TYPES = new Set(['winter-sports', 'water-sports']);

/** The day's own fallback: the bail-out clause, or the first sentence that
 *  names the weather and an alternative. */
export function dayFallback(day) {
  const stats = typeof day?.dayStats === 'string' ? day.dayStats : '';
  const bail = sentences(stats).find((s) => BAIL.test(s))
    || sentences(dayText(day)).find((s) => BAIL.test(s));
  if (bail && !/not applicable|^bail-?out:?\s*(none|n\/a)/i.test(bail)) {
    return { kind: 'bail', text: bail.replace(BAIL, '') };
  }
  for (const s of [...sentences(dayText(day)), ...sentences(stats)]) {
    if (WEATHER.test(s) && ALT.test(s) && (COND.test(s) || NAMED_ALT.test(s))) return { kind: 'weather', text: s };
  }
  if (TITLE_OPTION.test(strip(day?.title))) {
    const s = sentences(dayText(day, ['afternoon', 'morning'])).find((x) => OPTION_CUE.test(x) && x.length < 260);
    if (s) return { kind: 'option', text: s };
  }
  return null;
}

/* What a winter or water day needs from the sky, read from the day's own
   words. First match wins, in this order; arrival and departure days are
   fixed by the flights and are not options. */
const NEEDS = {
  'water-sports': [
    ['any', /\brest\b|on land|land day|museum|forest|town day|logistics|provisioning|national park on land|best-conditions|best conditions|wherever that is/i],
    ['wind', /\bkit(?:e|ing|esurf)|windsurf|\bwing\b|wingfoil|foil\b|\bsail(?:s|ing)?\b|land-sail|blokart|downwinder|regatta|knots|force\s*[3-9]|maestral|meltemi|\bnm\b/i],
    ['swell', /\bsurf|swell|groundswell|break\b|breaks\b|big-wave|waves\b/i],
    ['calm', /kayak|paddl|\bsup\b|snorkel|\bdiv(?:e|ing)\b|freediv|swim|canoe|flat ?water|flat-water|lagoon|cave/i],
  ],
  'winter-sports': [
    ['any', /\brest\b|contingency|flex|spa|thermal|caldea|museum|indoor|town|valley day|day off/i],
    ['powder', /freeride|off-piste|off piste|powder|backcountry|ski tour|touring|skin\b|skins\b|fresh snow/i],
    ['clear', /glacier|summit|traverse|ridge|panoram|sella ?ronda|circuit|top station|high (?:alpine|mountain)|tour of/i],
    ['trees', /tree|forest|wooded|larch|pine|low-level|village-level|sheltered/i],
  ],
};

function dayNeeds(day, typeSlug) {
  const rules = NEEDS[typeSlug];
  if (!rules) return null;
  const text = `${strip(day.title)} ${strip(typeof day.dayStats === 'string' ? day.dayStats : '')} ${dayText(day, ['morning', 'afternoon'])}`;
  const titleHit = rules.find(([, re]) => re.test(strip(day.title)));
  if (titleHit) return titleHit[0];
  // "Any weather" is read from the title only: a passing word in the prose
  // ("ski down into the town") does not make a day weatherproof.
  const hit = rules.filter(([need]) => need !== 'any').find(([, re]) => re.test(text));
  return hit ? hit[0] : 'most';
}

/**
 * Per day: { day, title, fallback {kind, text} | null, swap (day number) | null }.
 * For winter and water trips, `groups` re-reads the week as options keyed by
 * the conditions each day needs, travel days apart.
 */
export function weatherPlan(trip) {
  const it = trip?.itinerary || [];
  const type = trip?.tripTypeSlug;
  if (!it.length) return null;
  const flexIdx = it.findIndex((d, i) => i > 0 && i < it.length - 1 && FLEX.test(strip(d.title)));
  const flex = flexIdx >= 0 ? { day: it[flexIdx].day ?? flexIdx + 1, title: strip(it[flexIdx].title) } : null;

  const days = it.map((day, i) => {
    const own = dayFallback(day);
    const swap = !own && flex && OUTDOOR.has(type) && i !== flexIdx && i > 0 && i < it.length - 1 ? flex.day : null;
    return { day: day.day ?? i + 1, title: strip(day.title), fallback: own, swap };
  });

  let groups = null;
  if (CONDITION_TYPES.has(type) && it.length > 2) {
    const order = type === 'water-sports' ? ['wind', 'swell', 'calm', 'most', 'any'] : ['powder', 'clear', 'trees', 'most', 'any'];
    const by = new Map(order.map((k) => [k, []]));
    it.forEach((day, i) => {
      if (i === 0 || i === it.length - 1) return;
      const need = dayNeeds(day, type);
      by.get(need)?.push({ day: day.day ?? i + 1, title: strip(day.title) });
    });
    groups = {
      travel: [it[0], it[it.length - 1]].map((d, k) => ({ day: d.day ?? (k ? it.length : 1), title: strip(d.title) })),
      options: order.map((need) => ({ need, days: by.get(need) })).filter((g) => g.days.length),
    };
  }

  const written = days.filter((d) => d.fallback).length;
  const covered = days.filter((d) => d.fallback || d.swap).length;
  return {
    days,
    flex,
    groups,
    written,
    covered,
    weather: strip(trip?.logistics?.weather) || null,
    show: written > 0 || flex != null || groups != null || (OUTDOOR.has(type) && !!trip?.logistics?.weather),
  };
}
