/**
 * detailSkeleton.js, the rules behind the shared detail-page skeleton (T180,
 * destinations spec 5.4). The layout lives in browse/DetailSkeleton.jsx; what
 * is worth testing lives here:
 *
 *   previewWords   the six-word summary a closed row shows (moved here from
 *                  JourneyPage.jsx, where T164 wrote it, so every page that
 *                  folds a block previews it the same way)
 *   stripCells     the three cells under the hero: difficulty, type, the
 *                  headline number, always three, with a placeholder word
 *                  where the data has nothing
 *   *_LEVEL        each section's own difficulty scale mapped onto the five
 *                  squares of the strip
 *   placeExits     the three computed ways out: easier, cheaper, nearby
 */
import { haversineKm } from './nearby.js';

/* ── Six-word previews (T164) ──────────────────────────────────────────── */

/** A preview that stops on one of these reads as broken, so they are dropped. */
const PREVIEW_TAIL = /^(and|or|but|the|a|an|of|to|in|on|at|for|with|by|from|are|is|was|take|takes|only|between|that|which|as|into)$/i;

/**
 * A six-word preview of a written block: its first words, markers and the
 * trailing punctuation removed, so a closed row says what is inside without
 * costing a tap. Cut at the first sentence when that is shorter.
 */
export function previewWords(text, n = 6) {
  const plain = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const sentence = plain.split(/(?<=[.!?;:])\s/)[0];
  const words = sentence.split(' ').slice(0, n);
  while (words.length > 2 && PREVIEW_TAIL.test(words[words.length - 1].replace(/[.,;:!?]+$/, ''))) words.pop();
  return words.join(' ').replace(/[\s.,;:!?-]+$/, '');
}

/**
 * The preview of the first text whose preview is not the hook's (T386).
 * The hook already says its sentence under the title, so a closed row that
 * repeats it spends its one line on nothing; it previews the next sentence
 * instead, or nothing when every candidate is the hook.
 */
export function previewNotHook(texts, hook, n = 6) {
  const hookPreview = previewWords(hook, n);
  for (const text of texts || []) {
    const p = previewWords(text, n);
    if (p && p !== hookPreview) return p;
  }
  return '';
}

/* ── The key facts band (T386, carta-design "Detail page grammar") ─────── */

/** The band holds four to six facts: fewer says too little, more is a table. */
export const KEY_FACTS_MIN = 4;
export const KEY_FACTS_MAX = 6;

/**
 * The cells of the key facts band, in the page's own order. Each fact is
 * { key, label, value, mono }; a fact with no value keeps its cell and shows
 * the strip's placeholder word, so the band never claims a figure it lacks,
 * and the band is padded to four cells only from facts the page offered
 * (`fallback` facts, shown as placeholders) and cut at six. A page with no
 * fact at all gets no band.
 */
export function keyFactCells(facts, t) {
  const list = (facts || []).filter((f) => f && f.key && f.label);
  if (!list.some((f) => f.value != null && f.value !== '')) return [];
  const filled = list.filter((f) => f.value != null && f.value !== '' && !f.fallback);
  const spare = list.filter((f) => !filled.includes(f));
  const out = filled.slice(0, KEY_FACTS_MAX);
  for (const f of spare) {
    if (out.length >= KEY_FACTS_MIN) break;
    out.push(f);
  }
  // Back into the page's order, so a padded cell does not jump to the end.
  const order = new Map(list.map((f, i) => [f.key, i]));
  return out
    .sort((a, b) => order.get(a.key) - order.get(b.key))
    .map((f) => {
      const has = f.value != null && f.value !== '';
      return {
        key: f.key,
        label: f.label,
        value: has ? String(f.value) : t('detail.stripUnmeasured'),
        mono: has && Boolean(f.mono),
        note: has && f.note ? String(f.note) : null,
        missing: !has,
      };
    });
}

/** The first letter in upper case, the rest as written. */
export const capFirst = (s) => {
  const str = String(s || '');
  return str ? str.charAt(0).toLocaleUpperCase() + str.slice(1) : '';
};

/* ── The strip under the hero ──────────────────────────────────────────── */

/**
 * Exactly three cells in a fixed order, the rule DESIGN.md writes for the
 * suitability strip (T360): difficulty as five squares plus a word, the
 * one-word type, and the headline number in mono. A value the data does not
 * have shows a placeholder word, so every page shows three cells.
 *
 * level   0 to 5; 0 means not graded and draws no squares
 * word    the difficulty in plain words
 * type    one or two words
 * number  the headline figure with its unit, already formatted
 */
export function stripCells({ level = 0, word = '', type = '', number = '' }, t) {
  const lv = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  return [
    { key: 'diff', level: lv, word: word || t('detail.stripUngraded') },
    { key: 'type', word: capFirst(type) || t('journey.stripMixed') },
    { key: 'num', word: number || t('detail.stripUnmeasured'), mono: Boolean(number) },
  ];
}

/** Trail grade (trailCards.js) to squares. The five values are the scale. */
export const TRAIL_LEVEL = { easy: 1, moderate: 2, hard: 3, very_hard: 4, alpine: 5 };
/** validate.py's three-value effort class, for a trail the grade has not reached. */
export const TRAIL_EFFORT_LEVEL = { easy: 1, moderate: 2, hard: 3 };
/** The mountain's way up (mountainStory.js difficultyLabel), easiest first. */
export const MOUNTAIN_LEVEL = { walkUp: 1, hike: 2, mountainHike: 3, scramble: 4, alpine: 5 };
/**
 * The way in to a beach or a lake. Only the access field says anything about
 * effort on these two layers, and most rows do not carry it; those show the
 * "not graded" word rather than a guess.
 */
export const ACCESS_LEVEL = { road: 1, steps: 2, hike: 3, boat: 3 };

/**
 * A ride's difficulty from its climb per kilometre, because the cycling wire
 * carries no grade of its own (destinations spec 7.7 asks for one per bike
 * type; this is the stand-in until it exists). Under 5 m a km is flat, under
 * 10 rolling, under 15 hilly, more is a climber's day. The 12 m a km rule in
 * notFor.js sits inside the "hard" band. Returns 0 when either figure is
 * missing. The page marks the word as derived.
 */
export function cycleLevel(km, asc) {
  if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(asc)) return 0;
  const perKm = asc / km;
  if (perKm < 5) return 1;
  if (perKm < 10) return 2;
  if (perKm < 15) return 3;
  return 4;
}

/** The plain word for a level on the shared five-step scale. */
export const LEVEL_WORD_KEY = ['', 'trails.gradeEasy', 'trails.gradeModerate',
  'trails.gradeHard', 'trails.gradeVeryHard', 'trails.gradeAlpine'];

/* ── Three ways out ───────────────────────────────────────────────────── */

/** How much cheaper a stay must be to count as "for less" (T171 used the same). */
export const CHEAPER_BY = 0.15;

/**
 * Three other places of the same section, computed, never hand-picked:
 *
 *   easier   a lower level, the closest one
 *   cheaper  a night in its base town at least 15 percent cheaper, the closest
 *   nearby   the closest one of all
 *
 * A slot with no answer (the easiest place has no easier sibling, a layer
 * with no base towns has no cheaper one) is filled with the next closest
 * place under the "nearby" label, the fill rule T171 uses for journeys, so a
 * page shows three ways out whenever the country has three other places.
 *
 * me, rows   the page's own row and its country list
 * opts.id      row -> id
 * opts.centre  row -> { lat, lon } or null
 * opts.level   row -> 0..5 (0 = unknown)
 * opts.stay    row -> euros a night at its base, or null
 */
export function placeExits(me, rows, {
  id = (r) => r.id, centre, level = () => 0, stay = () => null,
} = {}) {
  const here = centre(me);
  if (!here || !Array.isArray(rows)) return [];
  const myId = String(id(me));
  const near = rows
    .filter((r) => r && String(id(r)) !== myId)
    .map((r) => {
      const c = centre(r);
      const km = c ? haversineKm(here.lat, here.lon, c.lat, c.lon) : null;
      return km == null || !Number.isFinite(km) ? null : { row: r, km };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);
  if (!near.length) return [];
  const used = new Set();
  const take = (pred) => {
    const hit = near.find((n) => !used.has(String(id(n.row))) && pred(n.row));
    if (hit) used.add(String(id(hit.row)));
    return hit || null;
  };
  const myLevel = level(me) || 0;
  const myStay = stay(me);
  const easier = myLevel > 1 ? take((r) => {
    const lv = level(r) || 0;
    return lv > 0 && lv < myLevel;
  }) : null;
  const cheaper = Number.isFinite(myStay) ? take((r) => {
    const s = stay(r);
    return Number.isFinite(s) && s <= myStay * (1 - CHEAPER_BY);
  }) : null;
  const out = [];
  if (easier) out.push({ kind: 'easier', ...easier });
  if (cheaper) out.push({ kind: 'cheaper', ...cheaper });
  while (out.length < 3) {
    const next = take(() => true);
    if (!next) break;
    out.push({ kind: 'nearby', ...next });
  }
  return out;
}

/** The middle of a [w, s, e, n] box, or null. */
export function bboxCentre(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4 || !bbox.every(Number.isFinite)) return null;
  return { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 };
}

/** A row with its own point. */
export function pointCentre(row) {
  return row && Number.isFinite(row.lat) && Number.isFinite(row.lon)
    ? { lat: row.lat, lon: row.lon } : null;
}
