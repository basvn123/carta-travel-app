#!/usr/bin/env node
/*
 * The owner's verification sheet for the drafted any-question labels (G2,
 * ROADMAP E1, docs/owner/ai.md AI-11).
 *
 *   node scripts/eval/any-question-sheet.mjs --out any-question-sample.csv [--n 50] [--seed 20261122]
 *   node scripts/eval/any-question-sheet.mjs --score any-question-sample.csv
 *
 * --out    a seeded sample of the set as a CSV: the question, the draft's
 *          expected kind and details, and empty owner_kind and note columns
 * --score  reads the filled sheet. An empty owner_kind means "I agree with
 *          the draft". Prints n, the share agreed and Cohen's kappa between
 *          the draft kind and the owner kind with its 95% interval.
 * No catalogue and no model are needed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cohenKappa } from './lib/kappa.mjs';
import { mulberry32 } from './lib/stats.mjs';
import { REPO } from './lib/results.mjs';

const KINDS = ['figure', 'places', 'note', 'door', 'decline-nearest', 'refuse'];
const SET = resolve(REPO, 'evals/any-question/set.json');
const HEAD = ['id', 'type', 'lang', 'question', 'previous_place', 'draft_kind', 'draft_also', 'draft_details', 'owner_kind', 'note'];

const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** A seeded sample of n cases, spread over the types (round robin over a shuffled list per type). */
export function sample(cases, n = 50, seed = 20261122) {
  const rand = mulberry32(seed);
  const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const byType = new Map();
  for (const c of cases) byType.set(c.type, [...(byType.get(c.type) || []), c]);
  const lists = shuffle([...byType.keys()]).map((t) => shuffle(byType.get(t)));
  const out = [];
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i]);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function sheetCsv(cases) {
  const rows = cases.map((c) => {
    const e = c.expect;
    const details = [e.intent && `intent ${e.intent}`, e.places && `places ${e.places.join(' ')}`, e.placesAny && `any of ${e.placesAny.join(' ')}`, e.country && `country ${e.country}`, e.months && `months ${e.months.join(' ')}`, e.lacking && `lacking ${e.lacking}`, e.outside && 'outside Europe'].filter(Boolean).join('; ');
    return [c.id, c.type, c.lang, c.q, c.prev?.ref?.city || '', e.kind, (e.also || []).join(' '), details, '', ''].map(quote).join(',');
  });
  return `${[HEAD.map(quote).join(','), ...rows].join('\r\n')}\r\n`;
}

/** A small CSV reader: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** Agreement of the draft kind with the owner's, from a filled sheet. */
export function scoreSheet(rows) {
  const bad = rows.filter((r) => r.owner_kind.trim() && !KINDS.includes(r.owner_kind.trim()));
  if (bad.length) throw new Error(`owner_kind must be empty or one of ${KINDS.join(', ')}; check ${bad.map((r) => r.id).join(', ')}`);
  const pairs = rows.map((r) => [r.draft_kind, r.owner_kind.trim() || r.draft_kind]);
  const agreed = pairs.filter(([a, b]) => a === b).length;
  return { n: rows.length, agreed, share: rows.length ? agreed / rows.length : null, kappa: cohenKappa(pairs) };
}

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (arg('--score')) {
    const r = scoreSheet(parseCsv(readFileSync(resolve(arg('--score')), 'utf8')));
    const k = r.kappa;
    console.log(`n ${r.n}, left as drafted ${r.agreed} (${(r.share * 100).toFixed(1)}%), kappa ${k.kappa ?? 'undefined'}${k.ci95 ? ` [${k.ci95[0]} to ${k.ci95[1]}]` : ''}${k.band ? `, ${k.band}` : ''}${k.note ? `, ${k.note}` : ''}`);
  } else if (arg('--out')) {
    const set = JSON.parse(readFileSync(SET, 'utf8'));
    const picked = sample(set.cases, Number(arg('--n', 50)), Number(arg('--seed', 20261122)));
    writeFileSync(resolve(arg('--out')), sheetCsv(picked));
    console.log(`wrote ${picked.length} rows to ${resolve(arg('--out'))}`);
  } else {
    console.error('usage: any-question-sheet.mjs --out <file.csv> | --score <file.csv>');
    process.exit(1);
  }
}
