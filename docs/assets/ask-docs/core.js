/*
 * Ask the docs, core (T1168, ROADMAP B8). One plain script that runs in Node
 * (the CLI, the eval) and in the browser (the docs site search box), so both
 * give the same answer. No dependency, no model.
 *
 *   chunkMarkdown(path, text)   heading based passages, one anchor each
 *   buildIndex(passages)        BM25 over title x2, heading path x3, text x1
 *   search(index, q, k)         ranked hits with a score and term coverage
 *   answer(index, q)            extractive answer: sentences with [n] marks, or an abstention
 *   groundingCheck(a, passages) every sentence cited, every citation real, every number and `code` token in its source
 *
 * Passages follow Ask Carta's row shape (id, text, name, ref) and its
 * sentence rules (at most 3 sentences clipped per excerpt); retrieval is BM25
 * only here, the dense half is owner step T1168-b.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CartaAskDocs = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX_CHARS = 700;
  const STOP = new Set('a an and are as at be by do does for from how i in is it of on or the to what when where which who why with can my me we you your this that there their they not no if so into than then also about'.split(' '));
  // The docs are English; the few Dutch words a question is likely to use are read as their English twins.
  const NL = { herstel: 'restore', herstellen: 'restore', terugbetaling: 'refund', terugbetalen: 'refund', reiziger: 'traveller', aankomen: 'arrive', komen: 'arrive', werkt: 'works', doe: 'do', hoe: 'how', wat: 'what', waar: 'where', welke: 'which', prijs: 'price', prijzen: 'price', abonnement: 'subscription', betaling: 'payment', storing: 'incident', beveiliging: 'security', geheimen: 'secrets', bestanden: 'files', kaart: 'map', strand: 'beach', stranden: 'beach', wandelingen: 'trails', gegevens: 'data', ik: 'i', niet: 'not', meer: 'more', een: 'a', de: 'the', het: 'the', van: 'of', als: 'if', aan: 'to', dat: 'that', is: 'is' };
  const BM25 = { k1: 1.2, b: 0.75 };
  const BOOST = { title: 2, head: 3, text: 1 };
  // Abstain unless the best passage covers this share of the question's content words.
  const MIN_COVERAGE = 0.6;
  const MIN_SCORE = 2.0;
  const REF_WEIGHT = 0.7;

  const dash = (s) => String(s).replace(/[\u2013\u2014]/g, '-');
  const slug = (h) => h.toLowerCase().replace(/[^\w\- ]/g, '').trim().replace(/[ ]+/g, '-');

  function stem(w) {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }
  /** Words, with identifiers (ASK_BM25_BOOST, run_pipeline.py, camelCase) kept whole and split. */
  function tokenize(s) {
    const out = [];
    for (const raw of String(s).replace(/[\p{L}\p{N}]+/gu, (w) => NL[w.toLowerCase()] || w).split(/[^\p{L}\p{N}_.\-]+/u)) {
      const w = raw.replace(/^[._\-]+|[._\-]+$/g, '');
      if (!w) continue;
      const parts = new Set();
      parts.add(w.toLowerCase());
      for (const p of w.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[_.\-\s]+/)) if (p) parts.add(p.toLowerCase());
      for (const p of parts) if (!STOP.has(p) && p.length > 1) out.push(stem(p));
    }
    return out;
  }

  function sentences(text) {
    return text.split(/(?<=[.!?])\s+(?=[A-Z0-9`(\[|*-])/).map((x) => x.trim()).filter(Boolean);
  }

  /** Strip markdown noise for display, keep `code`. */
  function plain(line) {
    return dash(line).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/\*\*|__/g, '').trim();
  }

  function chunkMarkdown(path, md) {
    const lines = md.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
    let title = path;
    const stack = [];
    const out = [];
    let buf = [];
    let inFence = false;
    let n = 0;
    const flush = () => {
      const body = buf.join('\n').trim();
      buf = [];
      if (!body) return;
      const head = stack.filter(Boolean).join(' > ');
      const anchor = stack.length ? slug(stack[stack.length - 1]) : '';
      // Split long sections on blank lines, never inside a table or code fence.
      let cur = [];
      let len = 0;
      const emit = () => {
        const text = cur.join('\n\n').trim();
        cur = []; len = 0;
        if (text.length < 20) return;
        out.push({ id: `${path}#${anchor}:${n++}`, path, title, head, anchor, text });
      };
      for (const para of body.split(/\n{2,}/)) {
        if (len + para.length > MAX_CHARS && cur.length) emit();
        cur.push(para); len += para.length;
        if (para.length > MAX_CHARS * 2) emit();
      }
      emit();
    };
    for (const line of lines) {
      if (/^(```|~~~)/.test(line)) inFence = !inFence;
      const m = !inFence && /^(#{1,3})\s+(.*?)\s*#*$/.exec(line);
      if (m) {
        flush();
        const level = m[1].length;
        const h = plain(m[2]);
        if (level === 1) { title = h; stack.length = 0; } else { stack.length = level - 1; stack[level - 2] = h; }
        continue;
      }
      buf.push(line);
    }
    flush();
    for (const p of out) p.text = out.length ? p.text.split('\n').map((l) => dash(l)).join('\n') : p.text;
    return out;
  }

  function buildIndex(passages) {
    const df = new Map();
    const docs = passages.map((p) => {
      const f = { title: tokenize(p.title), head: tokenize(p.head), text: tokenize(p.text) };
      const tf = new Map();
      for (const [field, toks] of Object.entries(f)) for (const t of toks) {
        const e = tf.get(t) || { title: 0, head: 0, text: 0 };
        e[field] += 1; tf.set(t, e);
      }
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
      const len = f.title.length * BOOST.title + f.head.length * BOOST.head + f.text.length;
      return { tf, len };
    });
    const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
    return { passages, docs, df, avg, N: docs.length };
  }

  function search(index, query, k = 8) {
    const q = [...new Set(tokenize(query))];
    const hits = [];
    index.docs.forEach((d, i) => {
      let score = 0; let matched = 0;
      for (const t of q) {
        const e = d.tf.get(t);
        if (!e) continue;
        matched += 1;
        const f = e.title * BOOST.title + e.head * BOOST.head + e.text;
        const n = index.df.get(t);
        const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
        score += idf * (f * (BM25.k1 + 1)) / (f + BM25.k1 * (1 - BM25.b + BM25.b * d.len / index.avg));
      }
      // The generated reference files restate code; hand written docs win a tie.
      if (/^reference\/(python|app-lib|tasks|supabase)\.md$/.test(index.passages[i].path)) score *= REF_WEIGHT;
      if (score > 0) hits.push({ i, score, coverage: q.length ? matched / q.length : 0 });
    });
    hits.sort((a, b) => b.score - a.score || a.i - b.i);
    return hits.slice(0, k).map((h) => ({ passage: index.passages[h.i], score: h.score, coverage: h.coverage }));
  }

  const link = (p) => `${p.path}${p.anchor ? `#${p.anchor}` : ''}`;
  const cite = (p) => `${p.title}${p.head ? ` > ${p.head}` : ''}`;

  /** Extractive answer: the best sentences of the top passages, each ending in the [n] of its passage. */
  function answer(index, query, { passages = 3, sentencesPer = 2 } = {}) {
    const hits = search(index, query, 8);
    const top = hits[0];
    if (!top || top.coverage < MIN_COVERAGE || top.score < MIN_SCORE) {
      return { abstained: true, text: 'The docs do not answer this.', citations: [], hits };
    }
    const q = new Set(tokenize(query));
    const used = [];
    const parts = [];
    for (const h of hits) {
      if (used.length >= passages) break;
      if (h.score < top.score * 0.5) break;
      const units = h.passage.text.split('\n').filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l)).map((l) => plain(l).replace(/^[-*]\s+|^\|\s*|\s*\|$/g, '').replace(/\s*\|\s*/g, ' - ')).filter(Boolean);
      const sents = units.flatMap((u) => (u.length > 280 ? sentences(u) : [u])).map((u) => (u.length > 320 ? `${u.slice(0, 317)}...` : u))
        .map((s) => ({ s, hit: tokenize(s).filter((t) => q.has(t)).length }))
        .filter((x) => x.hit > 0)
        .sort((a, b) => b.hit - a.hit)
        .slice(0, sentencesPer);
      if (!sents.length) continue;
      used.push(h.passage);
      const n = used.length;
      parts.push(...sents.map((x) => `${x.s.replace(/\s*\[\d+\]/g, '')} [${n}]`));
    }
    if (!used.length) return { abstained: true, text: 'The docs do not answer this.', citations: [], hits };
    return {
      abstained: false,
      text: parts.join(' '),
      citations: used.map((p, i) => ({ n: i + 1, id: p.id, path: p.path, anchor: p.anchor, link: link(p), label: cite(p), text: p.text })),
      hits,
    };
  }

  /**
   * Grounding: every sentence ends in [n] marks, every mark is a real citation,
   * and every number and `code` token of a sentence is in the passages it cites.
   */
  function groundingCheck(ans) {
    const problems = [];
    if (ans.abstained) return { ok: true, sentences: 0, problems };
    const norm = (x) => dash(x).replace(/\\/g, '').replace(/\s*\[\d+\]/g, '').replace(/\s-\s/g, ' ').replace(/[\s|*]+/g, ' ').toLowerCase();
    const sents = ans.text.split(/(?<=\[\d+\])\s+/);
    for (const s of sents) {
      const marks = [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      if (!marks.length) { problems.push(`no citation: ${s.slice(0, 60)}`); continue; }
      const cited = [];
      for (const n of marks) {
        const c = ans.citations.find((x) => x.n === n);
        if (!c) problems.push(`citation [${n}] does not exist`); else cited.push(c.text);
      }
      const src = norm(cited.map((t) => plain(t)).join(' '));
      const body = s.replace(/\[\d+\]/g, '');
      const facts = [...(body.match(/\d[\d.,]*\d|\d/g) || []), ...[...body.matchAll(/`([^`]+)`/g)].map((m) => m[1])];
      for (const f of facts) if (!src.includes(norm(f))) problems.push(`"${f}" is not in its cited passage`);
    }
    return { ok: problems.length === 0, sentences: sents.length, problems };
  }

  return { chunkMarkdown, buildIndex, search, answer, groundingCheck, tokenize, link, MAX_CHARS };
}));
