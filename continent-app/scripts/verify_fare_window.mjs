/**
 * The build-time fare `__window` must answer exactly what the client walk
 * would have answered. If it ever drifts, the app opens on the wrong dates
 * for that origin and nothing else notices.
 *
 *   node scripts/verify_fare_window.mjs
 */
import { readFileSync } from 'node:fs';
import { hydrateForOrigin } from '../src/lib/origins.js';
import { bestFareWindow } from '../src/lib/runtime_pricing.js';
import { fareFileBase } from '../src/lib/fareFile.js';

const data = JSON.parse(readFileSync('public/app_data.json', 'utf8'));
const nights = data.meta?.defaults?.trip_length_days ?? 7;
const origins = Object.keys(data.meta?.origin_coverage || {}).filter((o) => /^[A-Z0-9]{3,4}$/.test(o));
// A spread of origins: the best-served, the worst-served, and a sample between.
const byCov = origins.sort((a, b) => data.meta.origin_coverage[b] - data.meta.origin_coverage[a]);
const pick = byCov; // every origin

let ok = 0, bad = 0, nowin = 0;
for (const o of [...new Set(pick)]) {
  let slice;
  try { slice = JSON.parse(readFileSync(`public/fares/${fareFileBase(o)}.json`, 'utf8')); }
  catch { continue; }
  const w = slice.__window;
  const hyd = hydrateForOrigin(data, o, slice);
  // dateBounds walk
  let minOut = null, maxRet = null;
  for (const d of Object.values(hyd.destinations)) {
    for (const r of Object.values(d.routes || {})) {
      for (const x of Object.keys(r.outbound_fare || {})) if (minOut == null || x < minOut) minOut = x;
      for (const x of Object.keys(r.return_fare || {})) if (maxRet == null || x > maxRet) maxRet = x;
    }
  }
  if (!w) { if (minOut && maxRet) { console.log('MISSING __window but walk found one:', o); bad++; } else nowin++; continue; }
  const walk = bestFareWindow(hyd.destinations, nights, null);
  const pre = w.best_start_by_nights?.[nights];
  const boundsOk = w.min_out === minOut && w.max_ret === maxRet;
  const bestOk = (!walk && !pre) || (walk && pre && walk.start === pre[0] && walk.count === pre[1]);
  if (boundsOk && bestOk) ok++;
  else { bad++; console.log('MISMATCH', o, { pre: w, walkBounds: { minOut, maxRet }, walkBest: walk }); }
}
console.log({ ok, bad, nowin });
if (bad) { console.error(`[verify_fare_window] FAIL: ${bad} origin(s) disagree with the client walk`); process.exit(1); }
console.log('[verify_fare_window] OK');
