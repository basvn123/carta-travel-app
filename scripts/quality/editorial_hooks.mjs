// Editorial hooks: how often one lead sentence opens a layer's pages (D9, wave 1 item 0.8).
//
// Renders the lead line the lake, beach, mountain and trail pages show,
// through the app's own story libraries and the English catalogue, over every
// record on a wire tree, and measures the share of the most common sentence
// skeleton (names, numbers and months taken out). Read-only.
//
//   node scripts/quality/editorial_hooks.mjs [--public DIR] [--out FILE.json]
//        [--max-lead 25] [--layers lake,beach]
//
// Gated layers (--layers, default lake,beach) fail (exit 1) when their top
// skeleton is above --max-lead percent. Mountains and trails are measured and
// printed but never gated: their story files are logic's (requests.md).
// Adapted from the research copy (.work/2026-11-17-data-quality-research).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'continent-app', 'src');

function args(argv) {
  const out = { public: path.join(ROOT, 'continent-app', 'public'), out: null, maxLead: 25, layers: ['lake', 'beach'] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--public') out.public = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--max-lead') out.maxLead = Number(argv[++i]);
    else if (a === '--layers') out.layers = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

const imp = (p) => import(pathToFileURL(path.join(SRC, p)).href);

// A skeleton: names, numbers and months out, so "Lake X is 12 km2" and
// "Lake Y is 30 km2" count as one sentence shape.
const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/g;
export const skel = (s) => String(s || '')
  .replace(MONTHS, 'M')
  .replace(/\d[\d,.]*/g, 'N')
  .replace(/(?:[A-ZÀ-Þ][\p{L}'’-]*)(?:\s+(?:(?:de|di|la|le|del|von|am|an|of|the|and|y|e|sur|en|lago|lac)\s+)?[A-ZÀ-Þ][\p{L}'’-]*)*/gu, 'X')
  .replace(/\bX(?:\s*,\s*X)+/g, 'X')
  .trim();

export function stats(lines) {
  const filled = lines.filter(Boolean);
  const sk = new Map();
  for (const l of filled) sk.set(skel(l), (sk.get(skel(l)) || 0) + 1);
  const top = [...sk.entries()].sort((a, b) => b[1] - a[1]);
  const pct = (v) => (filled.length ? +((v * 100) / filled.length).toFixed(1) : 0);
  return {
    records: lines.length,
    with_hook: filled.length,
    distinct_skeletons: sk.size,
    lead_share: pct(top[0]?.[1] || 0),
    top5_skeleton_share: pct(top.slice(0, 5).reduce((a, [, v]) => a + v, 0)),
    top_skeletons: top.slice(0, 6).map(([k, v]) => ({ n: v, pct: pct(v), skeleton: k })),
  };
}

function readLayer(pub, dir, key) {
  const out = [];
  const d0 = path.join(pub, dir);
  if (!fs.existsSync(d0)) return out;
  for (const f of fs.readdirSync(d0)) {
    if (!/^[A-Z]{2}\.json$/.test(f)) continue;
    const d = JSON.parse(fs.readFileSync(path.join(d0, f), 'utf8'));
    out.push(...(Array.isArray(d[key]) ? d[key] : Object.values(d[key] || {})));
  }
  return out;
}

async function main() {
  const a = args(process.argv.slice(2));
  const { en } = await imp('i18n/en.js');
  const interpolate = (msg, vars) => String(msg ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  const t = (key, vars) => interpolate(en[key] ?? key, vars);
  t.lang = 'en';
  const lake = await imp('lib/lakeStory.js');
  const beach = await imp('lib/beachStory.js');
  const mtn = await imp('lib/mountainStory.js');
  const trail = await imp('lib/trailStory.js');

  const res = {};
  res.lake = stats(readLayer(a.public, 'lakes', 'lakes')
    .map((x) => lake.lakeHighlights(x, t)[0]?.line || lake.lakeHeadline(x, t, x.cc)));
  res.beach = stats(readLayer(a.public, 'beaches', 'beaches')
    .map((x) => beach.beachHighlights(x, t)[0]?.line || beach.beachHeadline(x, t, x.cc)));
  res.mountain = stats(readLayer(a.public, 'mountains', 'mountains')
    .map((x) => mtn.mountainHighlights(x, t)[0]?.line || mtn.mountainHeadline(x, t, x.cc)));
  res.trail = stats(readLayer(a.public, 'trails', 'trips').map((x) => {
    const why = trail.trailReasons(x.reasons, t, 6, x);
    if (why[0]?.text) return why[0].text;
    try { return trail.trailStory(x, null, { t, loop: x.is_loop ?? null }).points[0]?.text || ''; } catch { return ''; }
  }));

  const failed = [];
  for (const [layer, s] of Object.entries(res)) {
    const gated = a.layers.includes(layer);
    const over = gated && s.with_hook > 0 && s.lead_share > a.maxLead;
    if (over) failed.push(layer);
    console.log(`${layer.padEnd(9)} ${String(s.with_hook).padStart(6)} pages  lead ${String(s.lead_share).padStart(5)}%  top5 ${s.top5_skeleton_share}%  ${gated ? (over ? 'FAIL' : 'ok') : 'measured'}  "${s.top_skeletons[0]?.skeleton || ''}"`);
  }
  if (a.out) fs.writeFileSync(a.out, JSON.stringify({ max_lead: a.maxLead, gated: a.layers, layers: res }, null, 1));
  console.log(failed.length ? `FAIL: ${failed.join(', ')} above ${a.maxLead}%` : `PASS: ${a.layers.join(', ')} at or under ${a.maxLead}%`);
  process.exitCode = failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
