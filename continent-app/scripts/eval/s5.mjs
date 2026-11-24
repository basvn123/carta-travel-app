/*
 * S5, the Ask measurements before any retrieval fix (ROADMAP E1, A3; north-star
 * decision 2.2): what failed (the `failedBy` breakdown) and where a labelled place
 * was lost (parse, filter, pool, rank) per language, on the Ask eval set, offline.
 * It reads the same runEval the gate reads, so no number here differs from the gate's.
 *
 *   CARTA_PUBLIC=<public/> node scripts/eval/s5.mjs [out.md] [out.json]
 *
 * No model is called. Retrievers that need the dense index are skipped, loudly.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runEval } from './ask-eval.mjs';

const pct = (k, n) => (n ? `${((100 * k) / n).toFixed(1)}%` : 'n/a');

export function s5Tables(summary, results) {
  const retrievers = Object.keys(summary.retrievers);
  const failedBy = {};
  const attribution = {};
  const langs = [...new Set(results.map((r) => r.lang))].sort();
  for (const r of retrievers) {
    const f = { cardsMissAll: 0, cardsCases: 0, groundingByCheck: {}, checks: 0 };
    const att = Object.fromEntries(langs.map((l) => [l, { groups: 0, hit: 0, parse: 0, filter: 0, pool: 0, rank: 0, catalogue: 0 }]));
    for (const c of results) {
      const o = c.by[r];
      if (!o) continue;
      for (const [name, ok] of o.checks) {
        f.checks++;
        if (!ok) f.groundingByCheck[name] = (f.groundingByCheck[name] || 0) + 1;
      }
      if (o.diag) {
        f.cardsCases++;
        if (o.diag.every((d) => !d.hit)) f.cardsMissAll++;
        for (const d of o.diag) {
          const a = att[c.lang];
          a.groups++;
          if (d.hit) a.hit++; else a[d.cause]++;
        }
      }
    }
    failedBy[r] = f;
    attribution[r] = att;
  }
  const abstain = summary.abstain;
  return { retrievers, langs, failedBy, attribution, abstain };
}

export function s5Markdown(t, summary) {
  const out = [`# S5: Ask measurements, offline (E1, A3)`, '', `Set v${summary.set.version}, ${summary.n} questions; retrievers run: ${t.retrievers.join(', ')}${summary.skipped.length ? `; skipped (not built here): ${summary.skipped.join(', ')}` : ''}; bm25 ${summary.bm25}.`, ''];
  out.push('## failedBy: what failed, per retriever', '', '| retriever | cases with labelled places | none of their places in top 10 | grounding checks | failed checks (by check) |', '|---|---|---|---|---|');
  for (const r of t.retrievers) {
    const f = t.failedBy[r];
    const by = Object.entries(f.groundingByCheck).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
    out.push(`| ${r} | ${f.cardsCases} | ${f.cardsMissAll} (${pct(f.cardsMissAll, f.cardsCases)}) | ${f.checks} | ${by} |`);
  }
  out.push('', `Abstain: ${summary.abstain.caught}/${summary.abstain.cases} out-of-scope questions caught, ${summary.abstain.falseAlarm} in-scope questions wrongly refused.`, '');
  for (const r of t.retrievers) {
    out.push(`## Miss attribution per language, ${r}`, '', 'One row per language; a "group" is one labelled place (a city that sits in the catalogue twice counts once). Misses are groups not in the top 10 cards.', '', '| language | groups | hit | miss | parse | filter | pool | rank | catalogue |', '|---|---|---|---|---|---|---|---|---|');
    const tot = { groups: 0, hit: 0, parse: 0, filter: 0, pool: 0, rank: 0, catalogue: 0 };
    for (const l of t.langs) {
      const a = t.attribution[r][l];
      if (!a.groups) continue;
      for (const k of Object.keys(tot)) tot[k] += a[k];
      const miss = a.groups - a.hit;
      out.push(`| ${l} | ${a.groups} | ${a.hit} (${pct(a.hit, a.groups)}) | ${miss} | ${a.parse} | ${a.filter} | ${a.pool} | ${a.rank} | ${a.catalogue} |`);
    }
    const miss = tot.groups - tot.hit;
    out.push(`| all | ${tot.groups} | ${tot.hit} (${pct(tot.hit, tot.groups)}) | ${miss} | ${tot.parse} | ${tot.filter} | ${tot.pool} | ${tot.rank} | ${tot.catalogue} |`, '');
  }
  return out.join('\n');
}

async function main() {
  const { summary, results } = await runEval({});
  const t = s5Tables(summary, results);
  const md = s5Markdown(t, summary);
  if (process.argv[2]) writeFileSync(resolve(process.argv[2]), `${md}\n`);
  if (process.argv[3]) writeFileSync(resolve(process.argv[3]), `${JSON.stringify({ summary, tables: t }, null, 1)}\n`);
  console.log(md);
}
import { fileURLToPath } from 'node:url';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
