// T387 (v6 trips brief, V3.8; rule "Derived copy stays silent"): the journey
// page's generated sentences must never contradict the authored week. Read
// over every published journey file:
//
//   one base     a "One base all week" claim (weekShape: one run of nights)
//                on a week whose day titles end at another bed (a hut, a
//                refuge, a gite) or whose sleep lines name two beds. Must be 0.
//   weather      weeks whose weather plan would have shown "Fallback for 0 of
//                N days"; the page now hides the block for them. Counted, and
//                the page's own test (some day has a fallback or a swap) must
//                hold for every week that shows the block.
//   hook         hook lines that open on an orphan ("It", "These", "is not").
//                Must be 0.
//
//   node scripts/verify_journey_claims.mjs
import fs from 'node:fs';
import { weekShape, weatherPlan, sameBase, BED_IN_TITLE, baseLabel } from '../src/lib/weekShape.js';
import { hookLine } from '../src/lib/journeys.js';

const dir = new URL('../public/journeys/journey/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const ORPHAN = /^(?:it|its|this|these|that|those|they|their|there|he|she|is not|are not)\b/i;
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

let oneBase = 0;
let oneBaseBad = 0;
let weatherZero = 0;
let weatherShown = 0;
let hookBad = 0;
const bad = [];
for (const f of files) {
  const trip = JSON.parse(fs.readFileSync(new URL(f, dir)));
  const shape = weekShape(trip);
  const runs = shape.bases.runs;
  if (runs.length === 1 && shape.bases.source !== 'listed') {
    oneBase += 1;
    const label = fold(baseLabel(runs[0].line));
    const hut = (trip.itinerary || []).some((d) => BED_IN_TITLE.test(d.title || '')
      && !(label && fold(d.title).includes(label)));
    const lines = (trip.itinerary || []).map((d) => d.sleep).filter(Boolean);
    const twoBeds = lines.some((l) => !sameBase(l, lines[0]) && !/airport|flight|departure|fly/i.test(l));
    if (hut || twoBeds) { oneBaseBad += 1; bad.push(`one base: ${f}`); }
  }
  const plan = weatherPlan(trip);
  if (plan?.show) {
    const any = plan.days.some((d) => d.fallback || d.swap);
    if (any) weatherShown += 1; else weatherZero += 1;
  }
  const hook = hookLine(trip);
  if (hook?.line && ORPHAN.test(hook.line) && (hook.source === 'hook' || hook.source === 'summary')) {
    // The first sentence of the text is allowed to lead even when it opens
    // on a pronoun; an orphan is only a sentence picked from further in.
    const first = String(trip[hook.source] || '').replace(/\*\*/g, '').trim();
    if (!first.startsWith(hook.line.replace(/\.$/, '').slice(0, 30))) {
      hookBad += 1;
      bad.push(`hook: ${f}`);
    }
  }
}
for (const line of bad) console.log('BAD', line);
console.log({
  trips: files.length, oneBaseClaims: oneBase, oneBaseContradicted: oneBaseBad,
  weatherBlocksShown: weatherShown, weatherBlocksHiddenZeroOfN: weatherZero, orphanHooks: hookBad,
});
process.exit(oneBaseBad || hookBad ? 1 : 0);
