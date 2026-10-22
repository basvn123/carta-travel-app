/*
 * Ask Carta, stage 3: an Intent and the retrieved passages become the facts
 * of an answer (T555). Pure, no React and no i18n: every number here comes
 * from code that already prices and filters Explore (guidedSearch.js
 * predicates, budgetSearch.js on tripTotal.js priceTrip, cartaRoute.js),
 * so an answer can never disagree with the list it opens. compose.js turns
 * these facts into words; the model in stage 5 only rewords them.
 *
 *   answerFacts(intent, ctx) -> {
 *     type, facets, picks: [Pick], count, relaxed: [facet], notes: [key],
 *     budget?   the budget search ({query, fits, tight, over, priced})
 *     when?     {id, months: [MonthRow], best: [m], cheapest: [m]}
 *     compare?  [Pick]
 *     plan?     {order: [id], nights: {id: n}, days, km}
 *   }
 *   Pick = { id, dest, score, why: [Reason], month?: MonthRow, price?, km? , passages: [pid] }
 *   Reason = { k: 'vibe'|'month'|'warm'|'cost'|'quiet'|'nocar'|'near'|'nb'|'rating'|'fits', ... }
 *
 *   ctx: { rows, byId, guided, retrieved?: Map(destId -> {rank, pids}),
 *          price?: {lifestyle, stayTier, flights, bagKey}, today: Date }
 */
import {
  matchGuided, noCarOk, underOk, quietOk, monthOk, vibeScore, kmBetween, nbKm, NB_KM,
} from '../guidedSearch.js';
import { budgetSearch, normalizeQuery, priceForBudget } from '../budgetSearch.js';
import { planRoute } from '../cartaRoute.js';
import { cheapestStayMonths } from '../costIndex.js';

/** Warm means a day high of at least this many degrees in the month. */
export const WARM_C = 20;
/** How many picks an answer leads with, and how many it hands the model. */
export const PICKS = 6;
/** The weights of a find answer (shared out over what a question reads).
 *  Relevance is light on purpose: on the guided GOLDEN set recall@10 is 48
 *  of 86 with the rules alone, 50 with relevance at 0.1 and 47 at 0.35
 *  (T554 sweep), since the vibe scores already carry facet questions; the
 *  dense half earns its place on free text and in the written answer. */
export const W = { rel: 0.1, vibe: 0.25, month: 0.1, rating: 0.15, fame: 0.15 };
/** Fame on a log scale: 10,000 page views and up count in full. */
const fameOf = (p) => Math.min(1, Math.log10((p.rating?.fame ?? 0) + 1) / 4);

/** One month of a place, from climate.m: [day high, night low, rain mm, score]. */
export function monthRow(dest, m) {
  const r = dest?.climate?.m?.[m - 1];
  if (!r) return null;
  return { m, high: r[0], low: r[1], rain: r[2], score: r[3], best: (dest.climate.best || []).includes(m) };
}

const warmOk = (m) => (p) => {
  const r = monthRow(p, m);
  return r != null && r.high >= WARM_C;
};

/** The months a question is about: one month, a season, or none. */
export function monthsOf(intent) {
  if (intent.facets.month) return [intent.facets.month];
  if (intent.monthRange) return intent.monthRange;
  return [];
}

/**
 * The predicate of an Intent's facets, the same filters Explore applies,
 * plus `warm` and a season. `skip` names facets left out when the strict
 * answer is too thin (see relaxOrder).
 */
export function predicateOf(intent, ctx, skip = new Set()) {
  const f = intent.facets;
  const months = monthsOf(intent);
  const nearRow = f.near ? ctx.byId.get(f.near) : null;
  const gctx = { guided: ctx.guided, nearRow };
  const g = {
    vibe: skip.has('vibe') ? null : f.vibe,
    area: f.area, near: f.near, nb: skip.has('nb') ? null : f.nb,
  };
  return (p) => {
    if (f.country && p.iso2 !== f.country) return false;
    if (!skip.has('month') && months.length && !months.some((m) => monthOk(m)(p))) return false;
    if (!skip.has('warm') && f.warm) {
      const ms = months.length ? months : [((ctx.today || new Date()).getMonth() + 1) % 12 + 1];
      if (!ms.some((m) => warmOk(m)(p))) return false;
    }
    if (!skip.has('budget') && f.budget && !underOk(f.budget)(p)) return false;
    if (!skip.has('nocar') && f.nocar && !noCarOk(p)) return false;
    if (!skip.has('quiet') && f.quiet && !quietOk(p)) return false;
    return matchGuided(p, g, gctx);
  };
}

// When the strict answer holds fewer than three places, loosen in this
// order and say so: the crowd flag, the day budget, warm, the month (its
// weather still shows on each place), then the close-by extras ("seaside"
// is the heart of a question more often than its month), then the vibe.
const RELAX = ['quiet', 'budget', 'warm', 'month', 'nb', 'nocar', 'vibe'];

function rankScore(p, intent, ctx, months) {
  const f = intent.facets;
  const hit = ctx.retrieved?.get(p.id);
  const rel = hit ? 1 / (1 + hit.rank / 10) : 0;
  const vibe = f.vibe ? vibeScore(ctx.guided, p.id, f.vibe) / 100 : 0;
  const ms = months.length ? months.map((m) => monthRow(p, m)?.score ?? 0) : [];
  const month = ms.length ? Math.max(...ms) / 100 : 0;
  const rating = (p.rating?.score ?? 0) / 10;
  // A weight with nothing to read is shared out over the others.
  const parts = [[W.rel, rel, !!ctx.retrieved], [W.vibe, vibe, !!f.vibe], [W.month, month, ms.length > 0],
    [W.rating, rating, true], [W.fame, fameOf(p), true]];
  const on = parts.filter(([, , live]) => live);
  const sum = on.reduce((s, [w]) => s + w, 0) || 1;
  let s = on.reduce((acc, [w, v]) => acc + (w / sum) * v, 0);
  if (f.sort === 'cost' && p.cost?.dayEur != null) s = 1 / (1 + p.cost.dayEur / 50);
  if (f.near) {
    const near = ctx.byId.get(f.near);
    if (near) s = s * 0.5 + 0.5 / (1 + kmBetween(p, near) / 15);
  }
  return s;
}

/** The facts a pick shows: each a thing the question asked for, read from the data. */
export function reasonsFor(p, intent, ctx) {
  const f = intent.facets;
  const out = [];
  const months = monthsOf(intent);
  if (f.near) {
    const near = ctx.byId.get(f.near);
    if (near) out.push({ k: 'near', km: Math.round(kmBetween(p, near) * 10) / 10, place: near.city });
  }
  if (f.vibe) out.push({ k: 'vibe', vibe: f.vibe, score: vibeScore(ctx.guided, p.id, f.vibe) });
  for (const kind of f.nb || []) {
    const d = nbKm(ctx.guided, p.id, kind);
    if (d != null && d <= NB_KM[kind]) out.push({ k: 'nb', kind, km: d });
  }
  const m = months.find((x) => monthOk(x)(p)) || months[0];
  const row = m ? monthRow(p, m) : null;
  if (row) out.push({ k: f.warm ? 'warm' : 'month', ...row });
  if (p.cost?.dayEur != null) out.push({ k: 'cost', dayEur: Math.round(p.cost.dayEur), est: p.cost.stayLevel !== 'measured' });
  if (f.quiet && p.crowding?.tier === 1) out.push({ k: 'quiet' });
  if (f.nocar && noCarOk(p)) out.push({ k: 'nocar', transit: p.local_transport?.transit_quality });
  if (p.rating?.score != null) out.push({ k: 'rating', score: p.rating.score, label: p.rating.label });
  return out;
}

function pickOf(p, intent, ctx, score) {
  const months = monthsOf(intent);
  const m = months.find((x) => monthOk(x)(p)) || months[0];
  return {
    id: p.id,
    dest: p,
    score,
    why: reasonsFor(p, intent, ctx),
    month: m ? monthRow(p, m) : null,
    passages: ctx.retrieved?.get(p.id)?.pids || [],
  };
}

/** The full catalogue record of a row when the caller holds one (price.dests). */
const fullOf = (ctx) => (p) => ctx.price?.dests?.[p.id] || p;

/** Two rows that read as one place: two airports of one city, or within 3 km. */
export function samePlace(a, b) {
  const city = (p) => String(p.city || '').replace(/\s*\(.*\)$/, '');
  return (a.iso2 === b.iso2 && city(a) === city(b)) || kmBetween(a, b) < 3;
}

/** A find or near answer: filter, loosen if thin, rank, keep places apart. */
export function findFacts(intent, ctx, n = PICKS) {
  const months = monthsOf(intent);
  const skip = new Set();
  let pred = predicateOf(intent, ctx, skip);
  let hits = ctx.rows.filter(pred);
  const relaxed = [];
  for (const k of RELAX) {
    if (hits.length >= 3) break;
    const f = intent.facets;
    const present = k === 'month' ? months.length > 0 : k === 'nb' ? !!f.nb?.length : !!f[k];
    if (!present) continue;
    skip.add(k);
    relaxed.push(k);
    pred = predicateOf(intent, ctx, skip);
    hits = ctx.rows.filter(pred);
  }
  const scored = hits.map((p) => [p, rankScore(p, intent, ctx, months)]).sort((a, b) => b[1] - a[1]);
  const picks = [];
  for (const [p, s] of scored) {
    if (picks.length >= n) break;
    if (picks.some((q) => samePlace(q.dest, p))) continue;
    picks.push(pickOf(p, intent, ctx, s));
  }
  return { picks, count: hits.length, relaxed };
}

/** The total-budget answer: budgetSearch over the places the facets allow. */
export function budgetFacts(intent, ctx) {
  const b = intent.budget;
  const month = intent.facets.month || (intent.monthRange ? intent.monthRange[0] : null);
  const q = normalizeQuery({ budget: b.total, adults: b.adults, children: b.children, days: b.days, month, mode: b.mode }, ctx.today);
  // Only the facets narrow the places here; the money is the search's own.
  const narrowed = { ...intent, facets: { ...intent.facets, budget: undefined, month: undefined }, monthRange: null };
  const pred = predicateOf(narrowed, ctx);
  // Explore's rows are the list's slim records; the price engine reads the
  // full ones (beds, food basket), as the budget card did (T506).
  const dests = ctx.rows.filter(pred).map(fullOf(ctx));
  const result = budgetSearch(dests, q, ctx.price || {}, ctx.today);
  for (const r of [...result.fits, ...result.tight]) r.dest = ctx.byId.get(r.id) || r.dest;
  // In season first, then the vibe asked for ("beach and food" leads with
  // food), then the Score; from a home town by train, bus or car, every
  // 300 km away costs a point, since getting there is not priced yet.
  // The home town the question names, else the traveller's own origin.
  const originId = b.origin || ctx.price?.origin || null;
  const origin = originId && q.mode !== 'fly' ? ctx.byId.get(originId) : null;
  const key = (r) => (intent.facets.vibe ? vibeScore(ctx.guided, r.id, intent.facets.vibe) / 10 : 0)
    + (r.score ?? 0) + fameOf(r.dest) * 2 - (origin ? kmBetween(origin, r.dest) / 300 : 0);
  const ranked = [...result.fits, ...result.tight]
    .filter((r) => !origin || r.id !== origin.id)
    .sort((a, b) => (Number(b.inSeason) - Number(a.inSeason)) || (key(b) - key(a)));
  const kept = [];
  for (const r of ranked) {
    if (kept.length >= (ctx.limit || PICKS)) break;
    if (!kept.some((k) => samePlace(k.dest, r.dest))) kept.push(r);
  }
  const picks = kept.map((r) => ({
    ...pickOf(r.dest, { ...intent, facets: { ...intent.facets, month: q.month } }, ctx, r.score ?? 0),
    price: r,
  }));
  return { picks, count: result.fits.length + result.tight.length, budget: result, query: q, relaxed: [] };
}

/** A when answer: the twelve months of one place, its best and cheapest. */
export function whenFacts(intent, ctx) {
  const p = ctx.byId.get(intent.places[0]);
  if (!p) return { picks: [], count: 0, relaxed: [], notes: ['noPlace'] };
  const months = [];
  for (let m = 1; m <= 12; m++) { const r = monthRow(p, m); if (r) months.push(r); }
  let cheapest = null;
  try { cheapest = cheapestStayMonths(p) || null; } catch { cheapest = null; }
  const notes = [];
  if (intent.facets.quiet) notes.push(p.crowding?.tier ? 'crowdYearly' : 'noCrowd');
  return {
    picks: [pickOf(p, intent, ctx, 1)],
    count: 1,
    relaxed: [],
    when: { id: p.id, months, best: p.climate?.best || [], cheapest },
    notes,
  };
}

/** An about answer: one place, in the month asked about when there is one. */
export function aboutFacts(intent, ctx) {
  const p = ctx.byId.get(intent.places[0]);
  if (!p) return { picks: [], count: 0, relaxed: [], notes: ['noPlace'] };
  const pick = pickOf(p, intent, ctx, 1);
  pick.facts = {
    nocar: !p.local_transport?.car_needed,
    transit: p.local_transport?.transit_quality || null,
    crowd: p.crowding?.tier || null,
    best: p.climate?.best || [],
    blurb: p.blurb || null,
  };
  return { picks: [pick], count: 1, relaxed: [] };
}

/** A compare answer: the same facts for each place, side by side. */
export function compareFacts(intent, ctx) {
  const picks = intent.compare.map((id) => ctx.byId.get(id)).filter(Boolean)
    .map((p) => {
      const pick = pickOf(p, intent, ctx, 0);
      if (intent.budget.days) {
        const q = normalizeQuery({ budget: 1, adults: intent.budget.adults, days: intent.budget.days, month: intent.facets.month }, ctx.today);
        pick.price = priceForBudget(fullOf(ctx)(p), q, ctx.price || {});
      }
      return pick;
    });
  return { picks, count: picks.length, relaxed: [], compare: picks };
}

/** A plan answer: the best places for the question, routed with nights. */
export function planFacts(intent, ctx) {
  const days = intent.budget.days || 7;
  const stops = days <= 3 ? 1 : days <= 5 ? 2 : days <= 8 ? 3 : days <= 12 ? 4 : 5;
  const base = findFacts({ ...intent, type: 'find' }, ctx, stops * 3);
  // Stops at least 20 km apart, so a plan is a route, not one town twice.
  const chosen = [];
  for (const pick of base.picks) {
    if (chosen.length >= stops) break;
    if (chosen.some((c) => kmBetween(c.dest, pick.dest) < 20)) continue;
    chosen.push(pick);
  }
  if (intent.places?.length) {
    const seed = ctx.byId.get(intent.places[0]);
    if (seed && !chosen.some((c) => c.id === seed.id)) chosen.unshift(pickOf(seed, intent, ctx, 1));
    chosen.length = Math.min(chosen.length, stops);
  }
  const ids = chosen.map((c) => c.id);
  const destinations = Object.fromEntries(chosen.map((c) => [c.id, c.dest]));
  let plan = null;
  if (ids.length) {
    const r = planRoute({ ids, destinations, totalNights: Math.max(1, days - 1) });
    plan = { order: r.order, nights: r.nights, days, km: Math.round(r.km || 0) };
  }
  const order = plan ? plan.order : ids;
  return {
    picks: order.map((id) => chosen.find((c) => c.id === id)).filter(Boolean),
    count: base.count,
    relaxed: base.relaxed,
    plan,
  };
}

/** The facts of one answer, by the question's type. */
export function answerFacts(intent, ctx) {
  const run = {
    find: findFacts, near: findFacts, budget: budgetFacts, when: whenFacts,
    about: aboutFacts, compare: compareFacts, plan: planFacts,
  }[intent.type] || findFacts;
  const out = intent.type === 'find' || intent.type === 'near' ? findFacts(intent, ctx, ctx.limit || PICKS) : run(intent, ctx);
  const notes = [...(out.notes || [])];
  if (intent.unknown?.length) notes.push('unknown');
  if (intent.type === 'budget' && intent.budget.mode !== 'fly') notes.push('thereUnpriced');
  return { type: intent.type, facets: intent.facets, ...out, notes };
}
