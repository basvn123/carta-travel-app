/**
 * The route figures of a written trip (T174, trips spec E3 and E4).
 *
 *   weekRelief(trip)    the climb and the drop of every day, for the week
 *                       profile on hiking, trail running and cycling weeks
 *   surfaceMix(text)    "40% hardpack, 45% paved secondary road, ..." as
 *                       segments for the surface bar
 *   trafficSplit(mix)   the same segments read for traffic: away from cars,
 *                       shared with cars, or not stated
 *
 * Everything is read from the trip as written. A day that states no climb
 * has none here, a surface sentence whose shares do not add up to a whole
 * route gets no bar, and the traffic reading is a word-level inference that
 * the page labels as estimated. The true profile needs the route track
 * (T177-b); when that wire exists, the trail detail shape replaces
 * weekRelief and the same chart draws it.
 */
import { dayRelief } from './weekShape.js';

/** The three styles the week profile is drawn for. */
export const RELIEF_TYPES = new Set(['hiking', 'trail-running', 'cycling']);
/** The styles the surface and traffic bars are drawn for (spec E4). */
export const SURFACE_TYPES = new Set(['cycling']);

/**
 * { days: [{ day, km, up, down, rest }], up, down, upDays, downDays,
 *   upMissing, moving, top, show } for a route week; `moving` counts the days
 * that are not rest days, and the two counts the page prints are out of it. `show` needs a stated climb on at least half
 * the days, because a profile with most columns empty reads as a flat week.
 */
export function weekRelief(trip) {
  const it = trip?.itinerary || [];
  const slug = trip?.tripTypeSlug;
  if (!RELIEF_TYPES.has(slug) || it.length < 2) return { days: [], show: false };
  const days = it.map((day, i) => ({ day: day.day ?? i + 1, ...dayRelief(day, slug) }));
  const moving = days.filter((d) => !d.rest);
  const upDays = days.filter((d) => d.up != null).length;
  const downDays = moving.filter((d) => d.down != null).length;
  const upMissing = moving.filter((d) => d.up == null).length;
  const sum = (k) => days.reduce((a, d) => a + (d[k] || 0), 0);
  const top = days.reduce((best, d) => ((d.up || 0) > (best?.up || 0) ? d : best), null);
  return {
    days,
    up: sum('up'),
    down: sum('down'),
    upDays,
    downDays,
    upMissing,
    moving: moving.length,
    top,
    show: upDays >= 2 && upDays * 2 >= days.length,
  };
}

/* ── Surface (E4) ────────────────────────────────────────────────────────── */

const clean = (s) => String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

// Where an authored surface label stops: the first comma, bracket or full
// stop, or the first preposition that starts saying where the surface is.
const LABEL_END = /[,;.(:]|\s(?:on|in|between|through|around|along|across|inside|linking|where|with|at|from|near|for)\s/i;

// The bar's tone for a label, checked in this order. Cobbles and setts first
// (a "cobbled village lane" is not a lane surface), then sealed, then the
// bound loose surfaces, then track and earth. The tones are the same four the
// trail page's Underfoot bar uses, so a trip and a trail read alike.
const TONES = [
  ['other', /cobble|\bsetts?\b|kassei/i],
  ['paved', /asphalt|paved|tarmac|chip-?seal|concrete|brick|slab|sealed/i],
  ['gravel', /gravel|hardpack|hard-packed|compacted|crushed|limestone|dolomite|strade bianche|white road|stabilis|shell|stone/i],
  ['path', /track|path|trail|single-?track|double-?track|forest|farm|pasture|grass|sand|clay|earth|dirt|dune/i],
];
const toneOf = (text) => (TONES.find(([, re]) => re.test(text)) || ['other'])[0];
const TONE_RANK = { paved: 0, gravel: 1, path: 2, other: 3, unknown: 4 };

function labelOf(clause) {
  const cut = clause.search(LABEL_END);
  const head = (cut >= 0 ? clause.slice(0, cut) : clause).replace(/^(?:of|is)\s+/i, '').trim();
  const words = head.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/**
 * The surface sentence as segments: [{ key, label, share, tone, clause }].
 * Returns null unless the stated shares cover between 80 and 102 percent of
 * the route, which is what rejects a sentence that splits two sections or
 * seven days separately (their shares add up to 200 or 700). A shortfall
 * becomes an `unknown` segment, so a route that names 95% asphalt and nothing
 * else shows the 5% nobody described instead of stretching the asphalt.
 */
export function surfaceMix(text) {
  const s = clean(text);
  if (!s) return null;
  const re = /[~≈]?\s*(\d{1,3}(?:\.\d+)?)\s*%\s*(.*?)(?=[~≈]?\s*\d{1,3}(?:\.\d+)?\s*%|$)/g;
  const segs = [];
  let m;
  while ((m = re.exec(s))) {
    const share = Number(m[1]);
    // The clause runs to the next percentage or the end of its sentence, and
    // drops the trailing number of the next share ("..., 10" before "10%").
    const clause = m[2].split(/\.\s/)[0].replace(/[,;]?\s*[~≈]?\s*\d{1,3}(?:\.\d+)?\s*$/, '').trim();
    const label = labelOf(clause);
    // "gradients almost never above 2%" has no surface after it.
    if (!label || !TONES.some(([, rx]) => rx.test(clause))) continue;
    segs.push({ label, share, clause, tone: toneOf(label) });
  }
  const rem = s.match(/the remainder\s+(?:is\s+)?([^,.;]+)/i);
  let total = segs.reduce((a, x) => a + x.share, 0);
  if (rem && total < 100) {
    const label = labelOf(rem[1]);
    segs.push({ label, share: 100 - total, clause: rem[1], tone: toneOf(label) });
    total = 100;
  }
  if (!segs.length || total < 80 || total > 102) return null;
  const out = segs
    .map((x, i) => ({ ...x, key: `s${i}` }))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.share - a.share);
  if (total < 100) out.push({ key: 'unknown', label: null, share: 100 - total, clause: '', tone: 'unknown' });
  return out.map((x) => ({ ...x, share: x.share / 100 }));
}

/* ── Traffic exposure (E4) ───────────────────────────────────────────────── */

// Words that put a share beside cars, and words that take it away from them.
// The strong free words win over a road word only when no road word is
// present: "asphalt greenway and small roads" names both and is not stated.
const SHARED = /\b(?:roads?|lanes?|streets?|chip-?seal\w*|carriageway|shoulder|motor traffic)\b/i;
const FREE_STRONG = /traffic-free|car-free|cycleway|cycle path|greenway|rail-?trail|railway|dedicated|separated|segregated|fietspad\w*|towpath|white road|strade bianche/i;
// "Asphalt (much of it dedicated cycleway)" claims the free part for some of
// the share only, so a hedged free claim is not stated rather than free.
const HEDGE = /much of it|most of it|some of it|partly|in places|mostly/i;
const FREE = /\b(?:paths?|tracks?|single-?track|double-?track|trails?|gravel|hardpack|hard-packed|forest|farm|pasture|sand|clay|dams?|dykes?|dikes?|levee|causeway|promenade)\b/i;

function trafficOf(clause) {
  const shared = SHARED.test(clause);
  const strong = FREE_STRONG.test(clause);
  if (strong && (shared || HEDGE.test(clause))) return 'unknown';
  if (strong) return 'free';
  if (shared) return 'shared';
  if (FREE.test(clause)) return 'free';
  return 'unknown';
}

/**
 * The surface segments regrouped as { free, shared, unknown } shares that
 * sum to 1. An estimate from the authored words (cycle.travel reads OSM
 * highway classes the same way), so the page marks it as one. `known` is the
 * share the words could place; below one half the page says so in a sentence
 * rather than drawing a bar that is mostly a question mark.
 */
export function trafficSplit(mix) {
  if (!mix?.length) return null;
  const out = { free: 0, shared: 0, unknown: 0 };
  for (const seg of mix) out[seg.tone === 'unknown' ? 'unknown' : trafficOf(seg.clause)] += seg.share;
  const known = out.free + out.shared;
  return { ...out, known };
}
