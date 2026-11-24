/*
 * Scoring the cited-note verifier against planted errors (ROADMAP E1, wave 4,
 * north-star decision 7.3 row E-plant). Pure: the verifier module is passed
 * in, so the same plants are scored against the frozen "before" copy and
 * against src/lib/ask/verify.js with one code path. No model, no I/O.
 *
 * Counting rules:
 *   drop       the verifier fails the sentence (ok false): what a plant must get
 *   coincident the planted value also stands in a cited note or the question, so
 *              the sentence cannot be told from a true one: the residual. It is
 *              reported with a 95% Wilson bound and never counted against the bar.
 */
import { wilson, ruleOfThree } from '../lib/stats.mjs';

/** Run one plant: did the verifier fail its sentence, and why. */
// One checker is kept: plants arrive grouped by pack, and building a checker compiles a place
// pattern over the whole catalogue (hundreds of them at once ran out of memory).
let last = { pack: null, verify: null, key: '', check: null };
export function checkPlant(plant, pack, knownPlaces, verify, opts) {
  const key = JSON.stringify(opts || {});
  if (last.pack !== pack || last.verify !== verify || last.key !== key) last = { pack, verify, key, check: verify.makeChecker(pack, knownPlaces, opts) };
  const check = last.check;
  const { sentences } = verify.splitSentences(plant.sentence);
  const rs = sentences.map(check);
  // A plant is one sentence; if the splitter returns more, every one must fail.
  const dropped = rs.length > 0 && rs.every((r) => !r.ok);
  return { dropped, why: rs.flatMap((r) => r.why) };
}

const fold = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const numbers = (t) => (String(t || '').replace(/(\d)[.,\s'](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'));

/**
 * Why a surviving plant could not have been told from a true sentence by any
 * note rule: its value is in a cited note or the question once read the way
 * the verifier reads text (a bare number whatever its unit; a name without accents).
 * 'same-number' (71 mm planted as 71 euro) or 'same-name'; null when nothing explains it.
 */
export function residualReason(plant, pack) {
  const cited = (plant.cites || []).map((c) => pack.notes[c - 1]?.text || '');
  const pool = [...cited, pack.question];
  if (plant.planted?.type === 'place') return pool.some((t) => fold(t).includes(fold(plant.planted.value))) ? 'same-name' : null;
  const want = numbers(plant.planted?.value);
  return want.length && want.every((w) => pool.some((t) => numbers(t).includes(w))) ? 'same-number' : null;
}

/**
 * Score plants. `packOf(plant)` returns the plant's pack.
 * Returns the per kind table, the residual and the surviving plants.
 */
export function scorePlants(plants, packOf, knownPlaces, verify, opts) {
  const kinds = {};
  const survivors = [];
  const reasons = {};
  const explained = {};
  let coincidentKept = 0;
  let malformed = 0;
  const squash = (t) => String(t).replace(/\s+/g, '').toLowerCase();
  for (const p of plants) {
    // A plant that does not hold its planted value plants nothing: not scored, counted.
    if (p.planted?.value && !squash(p.sentence).includes(squash(p.planted.value))) { malformed++; continue; }
    const k = (kinds[p.kind] ||= { total: 0, planted: 0, dropped: 0, explained: 0, coincident: 0, coincidentDropped: 0 });
    const r = checkPlant(p, packOf(p), knownPlaces, verify, opts);
    k.total++;
    if (p.expect === 'drop') {
      k.planted++;
      if (r.dropped) { k.dropped++; for (const w of r.why.slice(0, 1)) reasons[w.split(':')[0]] = (reasons[w.split(':')[0]] || 0) + 1; } else {
        const reason = residualReason(p, packOf(p));
        if (reason) { k.explained++; explained[reason] = (explained[reason] || 0) + 1; } else survivors.push({ ...p, why: r.why });
      }
    } else if (p.expect === 'coincident') {
      k.coincident++;
      if (r.dropped) k.coincidentDropped++; else coincidentKept++;
    }
  }
  const planted = Object.values(kinds).reduce((s, k) => s + k.planted, 0);
  const dropped = Object.values(kinds).reduce((s, k) => s + k.dropped, 0);
  const explainedCount = Object.values(kinds).reduce((s, k) => s + k.explained, 0);
  const coincident = Object.values(kinds).reduce((s, k) => s + k.coincident, 0);
  const total = planted + coincident;
  const w = wilson(coincident, total);
  return {
    total, planted, dropped, dropShare: planted ? dropped / planted : null,
    // Survivors whose value is in a cited note by the verifier's own reading: the residual, not a miss.
    explained: explainedCount, explainedBy: explained,
    // The bar: of the plants that CAN be told from a true sentence, the share dropped.
    barShare: planted - explainedCount ? dropped / (planted - explainedCount) : null,
    byKind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { ...v, dropShare: v.planted ? v.dropped / v.planted : null, barShare: v.planted - v.explained ? v.dropped / (v.planted - v.explained) : null }])),
    residual: {
      coincident, share: total ? coincident / total : null, lo: w.lo, hi: w.hi,
      keptByVerifier: coincidentKept,
      // Of the plants whose value cannot be told from a true one, how many did the verifier let through.
      keptShare: coincident ? coincidentKept / coincident : null,
    },
    // 0 survivors in n planted: the rule-of-three bound on the miss rate.
    missBound: survivors.length === 0 && planted ? ruleOfThree(planted) : null,
    reasons, malformed,
    survivors,
  };
}
