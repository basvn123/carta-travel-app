/*
 * Ask Carta, stage 4b: the facts of an answer in words (T555). This is the
 * answer that shows at once and the one that stays whenever the written
 * answer (stage 5) is off, capped or fails its check. Every sentence is an
 * i18n key filled from rank.js facts, so the grammar holds in six languages
 * and no figure is one Carta cannot back. Estimates read "~€87 est.".
 *
 *   composeAnswer(facts, intent, { t, lang, labels }) -> {
 *     lead      one sentence that reads the question back with the count
 *     note      always null since T583 (the loosened filter is not said)
 *     picks     [{ id, title, sub, why: [string], blurb, price?: receipt }]
 *     table     compare and when answers: { head: [string], rows: [[string]] }
 *     notes     honesty lines ("Getting there is not in the total yet.")
 *     query     the question's facets as labels, for the read-back chips
 *   }
 */
import { formatMoney, formatEst } from '../money.js';
import { budgetReceipt } from '../budgetSearch.js';
import { stripDashes } from '../format.js';

const clean = (s) => stripDashes(String(s ?? ''));

/** The question read back as labels, in the order the guided trigger uses. */
export function queryLabels(intent, { t, labels }) {
  const f = intent.facets;
  const out = [];
  if (f.vibe) out.push(labels.vibe(f.vibe));
  if (f.area) out.push(labels.area(f.area));
  if (f.country) out.push(labels.country(f.country));
  if (f.near && labels.place) out.push(t('ask.q.near', { place: labels.place(f.near) }));
  if (f.month) out.push(labels.month(f.month));
  if (!f.month && intent.monthRange) out.push(t(`ask.q.season.${seasonOf(intent.monthRange)}`));
  if (f.budget) out.push(labels.budget(f.budget));
  if (f.warm) out.push(t('ask.q.warm'));
  for (const x of f.nb || []) out.push(labels.extra(x));
  if (f.nocar) out.push(labels.extra('nocar'));
  if (f.quiet) out.push(labels.extra('quiet'));
  if (f.sort === 'cost') out.push(t('gs.cheapest'));
  return out;
}

function seasonOf(range) {
  const k = range.join(',');
  return k === '6,7,8' ? 'summer' : k === '12,1,2' ? 'winter' : k === '3,4,5' ? 'spring' : 'autumn';
}

const money = (eur, est, t) => (est ? formatEst(eur, t('money.est')) : formatMoney(eur));

/** One reason as a short phrase. */
export function reasonText(r, { t, labels }) {
  switch (r.k) {
    case 'near': return t('gs.whyNear', { km: r.km, place: r.place });
    case 'vibe': return r.score >= 55 ? t('ask.why.vibe', { vibe: labels.vibe(r.vibe) }) : null;
    case 'nb': return t({ beach: 'gs.whyBeach', trail: 'gs.whyTrail', lake: 'gs.whyLake' }[r.kind], { km: r.km });
    case 'month':
    case 'warm': return t('ask.why.month', { month: labels.month(r.m), hi: Math.round(r.high), mm: Math.round(r.rain) });
    case 'cost': return t('ask.why.cost', { eur: money(r.dayEur, r.est, t) });
    case 'quiet': return t('filter.notCrowded');
    case 'nocar': return t('filter.noCar');
    case 'rating': return null;
    default: return null;
  }
}

function pickText(pick, ctx, { withCost = false } = {}) {
  const { t } = ctx;
  const all = pick.why.map((r) => [r.k, reasonText(r, ctx)]).filter(([, s]) => s).map(([k, s]) => [k, clean(s)]);
  // On screen the row already shows the day price, so its reasons leave the
  // cost out; the notes the model writes from keep every reason.
  const why = all.filter(([k]) => withCost || k !== 'cost').map(([, s]) => s).slice(0, 3);
  return {
    id: pick.id,
    title: pick.dest.city,
    sub: pick.dest.country,
    why,
    whyAll: all.map(([, s]) => s),
    blurb: pick.dest.blurb ? clean(pick.dest.blurb) : null,
    score: pick.dest.rating?.score ?? null,
    scoreLabel: pick.dest.rating?.score != null ? t('ask.score', { score: pick.dest.rating.score.toFixed(1) }) : null,
  };
}

function receiptText(price, q, t) {
  const r = budgetReceipt(price, q);
  if (!r) return null;
  return {
    total: money(r.total, r.est, t),
    left: r.left != null ? formatMoney(r.left) : null,
    lines: r.lines.map((l) => ({ label: t(`ask.line.${l.key}`), eur: money(l.eur, l.est, t) })),
    unpriced: r.unpriced.map((u) => t(`ask.unpriced.${u.key}`)),
    dayPp: money(r.dayPp, r.est, t),
  };
}

function peopleText(q, t) {
  const n = q.adults + q.children;
  return n === 1 ? t('ask.people.one') : t('budget.people', { n });
}

/** The facts-only answer. */
export function composeAnswer(facts, intent, ctx) {
  const { t, labels } = ctx;
  // The lead names what the answer still applies; what it loosened is the note.
  const relaxedSet = new Set(facts.relaxed || []);
  const kept = { ...intent, facets: { ...intent.facets } };
  for (const k of relaxedSet) {
    if (k === 'month') { delete kept.facets.month; kept.monthRange = null; } else delete kept.facets[k];
  }
  const query = queryLabels(kept, ctx);
  const what = query.join(', ');
  // T583: what was loosened is no longer said (owner 2026-10-22); the lead
  // already names only what the answer applies.
  const out = { type: facts.type, lead: '', note: null, picks: [], table: null, notes: [], query };

  if (facts.type === 'budget') {
    const q = facts.query;
    out.lead = t(facts.count ? 'ask.lead.budget' : 'ask.lead.budgetNone', {
      count: facts.count, budget: formatMoney(q.budget), people: peopleText(q, t), days: q.days,
      month: labels.month(q.month), by: t(`budget.by.${q.mode}`),
    });
    out.picks = facts.picks.map((p) => ({ ...pickText(p, ctx, { withCost: false }), price: receiptText(p.price, q, t) }));
    if (facts.budget?.over?.count) out.notes.push(t('ask.overNear', { count: facts.budget.over.count, more: formatMoney(facts.budget.over.more) }));
  } else if (facts.type === 'when') {
    const pick = facts.picks[0];
    if (!pick) { out.lead = t('ask.lead.noPlace'); return finish(out, facts, ctx); }
    const w = facts.when;
    out.lead = w.best.length
      ? t('ask.lead.when', { place: pick.dest.city, months: w.best.map(labels.monthInline || labels.month).join(', ') })
      : t('ask.lead.whenNone', { place: pick.dest.city });
    if (w.cheapest?.length) out.notes.push(t('ask.cheapestMonths', { months: w.cheapest.map(labels.monthInline || labels.month).join(', ') }));
    out.picks = [pickText(pick, ctx)];
    out.table = {
      head: [t('ask.col.month'), t('ask.col.high'), t('ask.col.rain'), t('ask.col.best')],
      rows: w.months.map((m) => [labels.month(m.m), `${Math.round(m.high)}°`, `${Math.round(m.rain)} mm`, m.best ? t('ask.yes') : '']),
    };
  } else if (facts.type === 'about') {
    const pick = facts.picks[0];
    if (!pick) { out.lead = t('ask.lead.noPlace'); return finish(out, facts, ctx); }
    const f = pick.facts;
    out.lead = clean(pick.dest.blurb || t('ask.lead.about', { place: pick.dest.city, country: pick.dest.country }));
    out.picks = [pickText(pick, ctx)];
    const rows = [];
    if (f.best.length) rows.push([t('dest.keyBest'), f.best.map(labels.month).join(', ')]);
    if (pick.month) rows.push([t('dest.keyMonth', { month: labels.monthInline ? labels.monthInline(pick.month.m) : labels.month(pick.month.m) }),
      t('dest.keyMonthValue', { hi: Math.round(pick.month.high), mm: Math.round(pick.month.rain) })]);
    rows.push([t('dest.keyCar'), t(f.nocar ? 'dest.keyCarNo' : 'dest.keyCarYes')]);
    if (f.crowd) rows.push([t('dest.keyCrowds'), t(`ask.crowd.${f.crowd}`)]);
    const cost = pick.why.find((r) => r.k === 'cost');
    if (cost) rows.push([t('ask.col.day'), money(cost.dayEur, cost.est, t)]);
    out.table = { head: null, rows };
  } else if (facts.type === 'compare') {
    const picks = facts.picks;
    out.lead = t('ask.lead.compare', { places: picks.map((p) => p.dest.city).join(', ') });
    out.picks = picks.map((p) => pickText(p, ctx));
    const row = (label, f) => [label, ...picks.map(f)];
    const m = intent.facets.month;
    out.table = {
      head: ['', ...picks.map((p) => p.dest.city)],
      rows: [
        row(t('ask.col.score'), (p) => (p.dest.rating?.score != null ? p.dest.rating.score.toFixed(1) : '')),
        row(t('ask.col.day'), (p) => { const c = p.why.find((r) => r.k === 'cost'); return c ? money(c.dayEur, c.est, t) : ''; }),
        ...(m ? [row(labels.month(m), (p) => (p.month ? `${Math.round(p.month.high)}°, ${Math.round(p.month.rain)} mm` : ''))] : []),
        row(t('dest.keyBest'), (p) => (p.dest.climate?.best || []).map(labels.month).join(', ')),
        row(t('dest.keyCrowds'), (p) => (p.dest.crowding?.tier ? t(`ask.crowd.${p.dest.crowding.tier}`) : '')),
        row(t('dest.keyCar'), (p) => t(p.dest.local_transport?.car_needed ? 'dest.keyCarYes' : 'dest.keyCarNo')),
        ...(picks.some((p) => p.price) ? [row(t('ask.col.total', { days: intent.budget.days }),
          (p) => (p.price ? money(p.price.total, p.price.est, t) : ''))] : []),
      ],
    };
  } else if (facts.type === 'plan') {
    const plan = facts.plan;
    out.lead = plan
      ? t('ask.lead.plan', { days: plan.days, n: plan.order.length, stops: facts.picks.map((p) => p.dest.city).join(', ') })
      : t('ask.lead.none', { query: what });
    out.picks = facts.picks.map((p) => ({ ...pickText(p, ctx), nights: plan?.nights?.[p.id] ?? null }));
  } else {
    out.lead = facts.count
      ? t(facts.count === 1 ? 'ask.lead.findOne' : 'ask.lead.find', { count: facts.count, query: what || t('ask.q.any') })
      : t('ask.lead.none', { query: what || t('ask.q.any') });
    out.picks = facts.picks.map((p) => pickText(p, ctx));
  }
  return finish(out, facts, ctx);
}

function finish(out, facts, { t }) {
  for (const n of facts.notes || []) {
    if (n === 'unknown') continue;
    out.notes.push(t(`ask.note.${n}`));
  }
  out.lead = clean(out.lead);
  out.notes = out.notes.map(clean);
  return out;
}

/** "Carta can't search for X yet", for the words nothing could place. */
export function unknownNote(intent, t) {
  const words = (intent.unknown || []).filter((w) => w.length > 2);
  return words.length ? clean(t('gs.cant', { word: words.slice(0, 3).join(' ') })) : null;
}
