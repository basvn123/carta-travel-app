/**
 * cachePolicy.mjs, the Cache-Control each data-host entry is uploaded with.
 *
 * Task: Execution/P3/T054-wire-shards-to-r2.md
 *
 * R2 serves whatever Cache-Control an object was written with; it has no
 * _headers file. So the policy is read from public/_headers, the file Pages
 * applies to the same paths, rather than kept as a second table here: a shard
 * gets the same caching on either host, and changing it means editing one
 * file. Every R2_TIER entry must have a stanza there; a missing one is an
 * error, not a default, because an object uploaded without Cache-Control is
 * cached by the edge on heuristics nobody chose.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { R2_TIER } from '../../src/lib/dataHost.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Map of Pages path pattern ("/poi/*", "/coverage.json") to Cache-Control. */
export function parseHeaders(text) {
  const out = new Map();
  let path = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) { path = line.trim(); continue; }
    const m = /^\s+Cache-Control:\s*(.+)$/i.exec(line);
    if (m && path) out.set(path, m[1].trim());
  }
  return out;
}

/** { entry: cacheControl } for every R2_TIER entry, or throws naming the gaps. */
export function dataCachePolicy(headersPath = resolve(appRoot, 'public', '_headers')) {
  const rules = parseHeaders(readFileSync(headersPath, 'utf-8'));
  const policy = {};
  const missing = [];
  for (const entry of R2_TIER) {
    const pattern = entry.includes('.') ? `/${entry}` : `/${entry}/*`;
    const cc = rules.get(pattern);
    if (cc) policy[entry] = cc;
    else missing.push(pattern);
  }
  if (missing.length) {
    throw new Error(`public/_headers has no Cache-Control for ${missing.join(', ')}`);
  }
  return policy;
}
