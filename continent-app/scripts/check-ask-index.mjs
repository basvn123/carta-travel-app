#!/usr/bin/env node
/**
 * check-ask-index.mjs: the Ask index staleness check (T1206, T1141-d,
 * ROADMAP E2 item 4).
 *
 * pipeline/ask_index_layer.py records in manifest.json the catalogue it read
 * (`catalogue.generated_at`, app_data.json meta.generated_at). The index is
 * stale when that catalogue is older than the one now on the wire: places
 * were added, renamed or dropped since, and Ask would retrieve passages for
 * a catalogue that no longer exists. A manifest written before T1206 has no
 * `catalogue`; then its `built` time stands in for it.
 *
 *   node scripts/check-ask-index.mjs [--dir public/search/ask] [--app-data public/app_data.json]
 *
 * Exit 1 when stale, 0 when fresh or when no index is built here (CI: the
 * index is not in git). scripts/build-ask-bm25.mjs runs the same check
 * before it builds, so the pipeline's ask_index task fails on a stale index.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const time = (s) => (typeof s === 'string' && s ? Date.parse(s) : NaN);

/**
 * { ok, reason } for one manifest against the catalogue's meta.
 *   manifest  public/search/ask/manifest.json
 *   meta      app_data.json meta ({ generated_at })
 */
export function askIndexStaleness(manifest, meta) {
  const now = time(meta?.generated_at);
  if (!manifest) return { ok: true, reason: 'no Ask index built here' };
  if (Number.isNaN(now)) return { ok: true, reason: 'the catalogue has no generated_at stamp; nothing to compare' };
  const from = manifest.catalogue?.generated_at;
  if (from) {
    const t = time(from);
    if (Number.isNaN(t)) return { ok: false, reason: `the index records an unreadable catalogue stamp "${from}"` };
    return t < now
      ? { ok: false, reason: `the Ask index was built from the catalogue of ${from}; the catalogue is now ${meta.generated_at}. Rebuild it (run_pipeline.py task ask_index).` }
      : { ok: true, reason: `built from the catalogue of ${from}, the current one` };
  }
  const built = time(manifest.built);
  if (Number.isNaN(built)) return { ok: false, reason: 'the index records neither the catalogue it read nor when it was built' };
  return built < now
    ? { ok: false, reason: `the Ask index was built ${manifest.built}, before the catalogue of ${meta.generated_at}. Rebuild it (run_pipeline.py task ask_index).` }
    : { ok: true, reason: `built ${manifest.built}, after the catalogue of ${meta.generated_at}` };
}

/** Read both files and check; null manifest when the index is not built. */
export function checkAskIndex({ dir, appData }) {
  const mp = join(dir, 'manifest.json');
  const manifest = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : null;
  const meta = existsSync(appData) ? JSON.parse(readFileSync(appData, 'utf8')).meta || null : null;
  return askIndexStaleness(manifest, meta);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const r = checkAskIndex({ dir: resolve(app, arg('--dir', 'public/search/ask')), appData: resolve(app, arg('--app-data', 'public/app_data.json')) });
  console.log(`[ask-index] ${r.ok ? 'fresh' : 'STALE'}: ${r.reason}`);
  process.exit(r.ok ? 0 : 1);
}
