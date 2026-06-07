/**
 * Copy the real pipeline dataset into the app's served location so `vite dev` and
 * `vite build` always ship the full catalogue (not the 45-dest mock).
 *
 * Runs automatically via the `predev` / `prebuild` npm hooks. Safe to run by hand:
 *   npm run data
 *
 * Source : <repo>/app_data/app_data.json   (real 447-dest dataset, is_mock=false)
 * Target : <repo>/continent-app/public/app_data.json  (what the app fetches)
 *
 * If the real dataset is missing, this warns and leaves whatever is already in
 * public/ in place (so a fresh clone without the pipeline output still builds).
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));   // continent-app/scripts
const repoRoot = resolve(scriptDir, '..', '..');             // repo root
const src = resolve(repoRoot, 'app_data', 'app_data.json');
const dest = resolve(scriptDir, '..', 'public', 'app_data.json');

if (!existsSync(src)) {
  console.warn(`[sync-data] real dataset not found at ${src} - keeping existing public/app_data.json`);
  process.exit(0);
}

copyFileSync(src, dest);

// Report what was shipped so a stale/mock copy is obvious in the build log.
let n = '?', mock = '?';
try {
  const j = JSON.parse(readFileSync(dest, 'utf-8'));
  n = Object.keys(j.destinations || {}).length;
  mock = String(j.meta?.is_mock);
} catch { /* still copied; just couldn't summarize */ }
console.log(`[sync-data] copied real dataset -> public/app_data.json (${n} destinations, is_mock=${mock})`);
