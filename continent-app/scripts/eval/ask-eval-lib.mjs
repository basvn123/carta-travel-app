/*
 * Ask eval gate (T1136, ROADMAP E1): the pure half. Metrics over one ranked
 * list, the grounding checks over one answer, the summary of a run and the
 * gate that compares a run with the blessed baseline. No file or network
 * access here, so tests/askEval.test.mjs can check the arithmetic and the
 * gate on hand-made numbers. scripts/eval/ask-eval.mjs is the runner.
 *
 * Relevance is binary. A labelled place is a group of catalogue ids (a city
 * can sit in the catalogue twice, as an airport code and as a gem), and a
 * group counts once, at the rank of its first id in the list.
 *
 *   recall@k  groups found in the top k / min(groups, k)
 *   hit@k     1 when any group is in the top k
 *   MRR       1 / rank of the first group found in the top 10 (0 if none)
 *   nDCG@10   DCG of the top 10 / the DCG of a perfect list of min(groups, 10)
 */

export const K_LIST = [5, 10];
/** The gate: a gated metric may fall this much (absolute, 0 to 1) and pass. */
export const TOLERANCE = 0.02;
/** The metrics the gate reads, per retriever (the cards and the retriever's own list),
 *  with each retriever's grounding and, over the run, abstain.correct. */
export const GATED_RETRIEVAL = ['recall@5', 'recall@10', 'mrr', 'ndcg@10'];

/** Where each labelled group first appears in the list (0-based), or -1. */
export function groupRanks(list, groups) {
  const at = new Map();
  list.forEach((id, i) => { if (!at.has(id)) at.set(id, i); });
  return groups.map((g) => {
    let best = -1;
    for (const id of g) {
      const r = at.get(id);
      if (r != null && (best < 0 || r < best)) best = r;
    }
    return best;
  });
}

/** recall@k, hit@k, MRR and nDCG@10 of one ranked list against its labels. */
export function scoreList(list, groups) {
  const ranks = groupRanks(list, groups);
  const out = {};
  for (const k of K_LIST) {
    const found = ranks.filter((r) => r >= 0 && r < k).length;
    out[`recall@${k}`] = groups.length ? found / Math.min(groups.length, k) : 0;
    out[`hit@${k}`] = found > 0 ? 1 : 0;
  }
  const first = ranks.filter((r) => r >= 0 && r < 10).sort((a, b) => a - b)[0];
  out.mrr = first == null ? 0 : 1 / (first + 1);
  const dcg = ranks.filter((r) => r >= 0 && r < 10).reduce((s, r) => s + 1 / Math.log2(r + 2), 0);
  let ideal = 0;
  for (let i = 0; i < Math.min(groups.length, 10); i++) ideal += 1 / Math.log2(i + 2);
  out['ndcg@10'] = ideal ? dcg / ideal : 0;
  return out;
}

/** The mean of each key over a list of score objects. */
export function meanOf(rows) {
  const out = {};
  if (!rows.length) return out;
  for (const k of Object.keys(rows[0])) out[k] = rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length;
  return out;
}

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The grounding checks of one answer, each [name, ok, detail]. `answer` is
 * what the runner read off the real Ask code:
 *   { type, places: [id], cards: [{id, cc}], months: [m], budget: {total, picks: [{id, total, core}]},
 *     filtersOk: [id that fail], noteText, strings: [every composed string], abstained }
 * `facts` is the case's label: { type, cc, month, budget, named, notes }.
 */
export function groundingChecks(facts = {}, answer) {
  const checks = [];
  const push = (name, ok, detail = '') => checks.push([name, !!ok, detail]);
  if (facts.type) push('type', answer.type === facts.type, `got ${answer.type}`);
  if (facts.cc) {
    const want = new Set([].concat(facts.cc));
    const off = answer.cards.filter((c) => !want.has(c.cc)).map((c) => c.id);
    push('cc', answer.cards.length > 0 && off.length === 0, off.length ? `outside ${[...want]}: ${off.join(',')}` : answer.cards.length ? '' : 'no cards');
  }
  if (facts.month) push('month', answer.months.includes(facts.month), `read ${answer.months.join(',') || 'none'}`);
  if (facts.budget) {
    const over = (answer.budget?.picks || []).filter((p) => !(p.total <= facts.budget || p.core <= facts.budget)).map((p) => p.id);
    push('budget', answer.budget?.total === facts.budget && over.length === 0,
      answer.budget?.total !== facts.budget ? `read ${answer.budget?.total}` : over.length ? `over: ${over.join(',')}` : '');
  }
  for (const id of facts.named || []) push(`named:${id}`, answer.places.includes(id), 'not in the answer');
  const text = fold(answer.noteText);
  for (const group of facts.notes || []) {
    const alts = [].concat(group);
    push(`note:${alts[0]}`, alts.some((a) => text.includes(fold(a))), 'not in the notes the model gets');
  }
  // Checked on every answer, labelled or not.
  push('filters', answer.filtersFail.length === 0, answer.filtersFail.join(','));
  const bad = answer.strings.filter((s) => /[\u2013\u2014]/.test(s) || /\{\w+\}/.test(s));
  push('clean', bad.length === 0, bad[0] || '');
  return checks;
}

/**
 * One run summed up: per retriever the mean list metrics (over cases with
 * labelled places), the grounding pass rate and abstention.
 */
export function summarise(results, retrievers) {
  const out = { n: results.length, retrievers: {} };
  for (const r of retrievers) {
    const rows = results.filter((c) => c.places && c.by[r]);
    const cards = meanOf(rows.map((c) => c.by[r].cards));
    const lists = rows.filter((c) => c.by[r].list).map((c) => c.by[r].list);
    const checks = results.filter((c) => !c.abstain && c.by[r]).flatMap((c) => c.by[r].checks);
    out.retrievers[r] = {
      cases: rows.length,
      ...round(cards),
      list: lists.length ? round(meanOf(lists)) : null,
      grounding: checks.length ? round1(checks.filter((c) => c[1]).length / checks.length) : 0,
      checks: checks.length,
      // Recall per language (T1214, from T1145-c, the D6 language parity):
      // reported, not gated; gatedNumbers reads only the keys above.
      by_lang: Object.fromEntries([...new Set(rows.map((c) => c.lang || 'en'))].sort().map((lang) => {
        const mine = rows.filter((c) => (c.lang || 'en') === lang);
        const m = round(meanOf(mine.map((c) => c.by[r].cards)));
        return [lang, { cases: mine.length, 'recall@10': m['recall@10'], mrr: m.mrr }];
      })),
    };
  }
  const main = retrievers[retrievers.length - 1];
  const abst = results.filter((c) => c.abstain);
  const inScope = results.filter((c) => !c.abstain);
  const caught = abst.filter((c) => c.abstained).length;
  const falseAlarm = inScope.filter((c) => c.abstained).length;
  out.abstain = {
    cases: abst.length,
    caught,
    falseAlarm,
    correct: round1((caught + inScope.length - falseAlarm) / Math.max(1, results.length)),
    recall: round1(caught / Math.max(1, abst.length)),
  };
  out.grounding = out.retrievers[main]?.grounding ?? 0;
  return out;
}

const round1 = (x) => Math.round(x * 10000) / 10000;
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round1(v)]));

/** The flat list of gated numbers of a summary, as [key, value]. */
export function gatedNumbers(summary) {
  const out = [];
  for (const [r, s] of Object.entries(summary.retrievers)) {
    for (const k of GATED_RETRIEVAL) if (s[k] != null) out.push([`${r}.${k}`, s[k]]);
    for (const k of GATED_RETRIEVAL) if (s.list?.[k] != null) out.push([`${r}.list.${k}`, s.list[k]]);
    out.push([`${r}.grounding`, s.grounding]);
  }
  out.push(['abstain.correct', summary.abstain.correct]);
  return out;
}

/**
 * The gate. A gated number that is in both the run and the baseline and
 * fell by more than the tolerance fails; one that rose past it is reported
 * so the baseline can be raised (--bless). A retriever the run could not
 * build (no dense index on this machine) is listed as skipped, never failed,
 * and so is the sparse half when the run read another BM25 index than the
 * baseline did (the shipped bm25.json against one rebuilt from the data).
 */
export function gate(summary, baseline, tolerance = TOLERANCE) {
  const now = new Map(gatedNumbers(summary));
  const failures = []; const gains = []; const skipped = [];
  const otherIndex = baseline.bm25 && summary.bm25 && baseline.bm25 !== summary.bm25;
  for (const [k, was] of gatedNumbers(baseline)) {
    if (!now.has(k) || (otherIndex && /^(bm25|hybrid)\./.test(k))) { skipped.push(k); continue; }
    const d = now.get(k) - was;
    if (d < -tolerance - 1e-9) failures.push({ key: k, was, now: now.get(k), drop: round1(-d) });
    else if (d > tolerance) gains.push({ key: k, was, now: now.get(k) });
  }
  if (baseline.n !== summary.n) failures.push({ key: 'n', was: baseline.n, now: summary.n, drop: null });
  return { ok: failures.length === 0, failures, gains, skipped, tolerance };
}
