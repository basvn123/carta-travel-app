/*
 * The Intelligence API's Node bridge (T1154, ROADMAP F5).
 *
 * One long-lived Node process that imports the app's own place linker
 * (src/lib/linking, F4) and taste profile (src/lib/taste, F3) and answers
 * newline-delimited JSON on stdin: {id, fn, args} -> {id, ok, result | error}.
 * stdout carries the protocol only; anything else goes to stderr.
 * Nothing is copied: the API calls the same functions the app runs.
 *
 * Env: CARTA_PUBLIC (default continent-app/public), CARTA_APP (default
 * continent-app), both relative to the repo root two levels up.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..', '..');
const APP = resolve(process.env.CARTA_APP || join(ROOT, 'continent-app'));
const PUBLIC = resolve(process.env.CARTA_PUBLIC || join(APP, 'public'));

const linking = await import(pathToFileURL(join(APP, 'src/lib/linking/linker.js')).href);
const taste = await import(pathToFileURL(join(APP, 'src/lib/taste/profile.js')).href);

const J = (p) => JSON.parse(readFileSync(join(PUBLIC, p), 'utf8'));
const t0 = Date.now();
const destinations = J('app_data.json').destinations;
const linker = linking.makeLinker({ destinations, searchIndex: J('search_index.json'), lexicon: J('search/ask/lexicon.json') });
const base = taste.baseRates(destinations);
process.stderr.write(`bridge: ready in ${Date.now() - t0} ms, ${Object.keys(destinations).length} places, ${linker.rows.length} aliases\n`);

const LIMIT = 10;
const slim = (c) => ({ id: c.id, name: c.name ?? null, score: c.score, members: c.members || [c.id] });

function link({ mention, ctx = {}, limit = LIMIT }) {
  const r = linking.linkPlace(linker, mention, ctx || {});
  return {
    confident: r.confident,
    linked: r.linked ? slim(r.linked) : null,
    candidates: r.candidates.slice(0, limit).map(slim),
    did_you_mean: r.didYouMean,
  };
}

function chip(c) {
  return {
    node: c.node,
    label: taste.nodeLabel(c.node, 'en'),
    facet: c.facet,
    verdict: c.verdict || null,
    lift: Math.round(c.lift * 1000) / 1000,
    evidence_weight: Math.round(c.e * 1000) / 1000,
    evidence: c.evidence,
  };
}

function profile({ saves = [], trips = [], filters = {}, verdicts = {}, now = null, all = false }) {
  const at = now == null ? Date.now() : Date.parse(now);
  const items = taste.evidenceItems({ saves, trips, filters, destinations });
  const p = taste.buildProfile({ items, base, verdicts, now: at, all });
  return {
    shown: p.shown.map(chip),
    held: p.held.map(chip),
    hidden: p.hidden.map(chip),
    item_count: p.itemCount,
    weights: taste.tasteWeights(verdicts),
    snapshot: taste.profileSnapshot(p, at),
  };
}

const FN = {
  ping: () => ({ places: Object.keys(destinations).length, aliases: linker.rows.length }),
  link: (args) => (args.mentions || []).map(link),
  profile,
};

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  let id = null;
  try {
    const msg = JSON.parse(line);
    id = msg.id;
    const f = FN[msg.fn];
    if (!f) throw new Error(`unknown fn ${msg.fn}`);
    process.stdout.write(JSON.stringify({ id, ok: true, result: f(msg.args || {}) }) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ id, ok: false, error: String(err?.message || err) }) + '\n');
  }
});
rl.on('close', () => process.exit(0));
