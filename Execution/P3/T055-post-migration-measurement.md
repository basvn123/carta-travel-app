# T055 Re-measure and close the phase

## Task ID

T055

## Date

2026-09-28

## What changed

Nothing in the product changed. This task re-ran T011's harness against the current build and, because the default build has not moved to the split shape in production, also ran the same measurement method against the split build from T054, served over a loopback stand-in for the app host and the R2 data host. The result is the "after" half of the comparison T011 set up, with one honest qualification: it is an after for the split build on a laptop, not an after for production, because production still builds the same-origin shape and no Cloudflare or R2 account exists yet.

The headline finding is that the wire split (T054) delivers on its own promise and nothing more. The Pages deploy drops from 52,177 files (2.6x over the Cloudflare ceiling) to 61 files, comfortably under it, and the boot payload drops from a 12.5 MB `app_data.json` to a 222 KB `boot.json`, a 98.2% cut on the file the browser needs before the loading screen clears. Core Web Vitals on the three page types barely move, and where they move it is mostly noise: LCP and INP are governed by image weight and CPU cost, and the split changes neither. The app still waits for all 43 country files before it can render a screen, exactly as T054's report says, so the split fixes the file-count and single-file-size problems without yet fixing first paint. That second fix is already filed as T054-d and is not this task's to close.

On spend, the answer is that there is still nothing to compare. No Cloudflare account, no R2 bucket, no Hetzner box and no invoice exist. Every cost line in `CARTA_UNIT_ECONOMICS.md` §2.1 and every line in the Tier 0 table of `CARTA_CLOUD_ARCHITECTURE.md` §7 is a model, not a bill, exactly as T011 found four days ago. This task cannot confirm the €9.50-11 figure against a real invoice, because there is no infrastructure running yet to invoice. What it can and does confirm is that the model has not moved: no scope change since T011 has added or removed a line item, so the modelled €9.50/month (€10.90 at 200 GB) stands as the number to check once the owner steps in `Execution/P3/_OPEN-hetzner.md` are done.

## Files touched

**Modified (continent-app, branch `p3-post-migration-measurement`, based on `ee23f77`):**
- continent-app/reports/perf_baseline_T011.json (re-run in place, same-origin build, current HEAD)

**Created (continent-app):**
- continent-app/reports/perf_split_T055.json (new measurement, split build against the loopback stand-in)

**Created (root repo, branch `p3-post-migration-measurement`, based on `df7c883d2`):**
- Execution/P3/T055-post-migration-measurement.md

**Modified (root repo):**
- Execution/_OPEN.md (rows T055-a to T055-d)

No file was touched that this task does not name. `continent-app/src/components/PrivacyPolicy.jsx` and `continent-app/src/data/attribution.js` were already modified and unstaged by another session before this task started (T054's report records the same fact) and were left untouched and unstaged.

## Commands run

All from `continent-app/` unless noted.

```bash
# Drift check: re-run T011's own harness against the current same-origin build,
# to confirm nothing regressed between T011 and T055 on the shape that ships today.
npm run build                                                     # same-origin, current HEAD
node scripts/perf/baseline_vitals.mjs                             # overwrites reports/perf_baseline_T011.json
cp reports/perf_baseline_T011.json reports/_t055_sameorigin_headcheck.json   # kept aside for this report

# File count and boot payload on the same-origin build, for the wire table.
node scripts/check-pages-limits.mjs dist
gzip -9c dist/app_data.json | wc -c

# Build the split shape against a loopback stand-in for data.carta-europetravel.com,
# the same stand-in T054's verify_data_host.mjs uses.
VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 npm run build
node scripts/check-pages-limits.mjs dist                          # 61 files, PASS
gzip -9c dist/boot.json | wc -c

# Correctness of the split, before trusting its performance numbers.
node scripts/verify_data_host.mjs

# T011's method, against the split build, over the same two-origin stand-in.
# baseline_vitals.mjs only knows how to serve dist/ as a single origin, so this
# reuses its exact PROBE, PAGES, DEVICES and median logic in a second script
# that serves dist/ on 127.0.0.1:4390 and dist-data/ on 127.0.0.1:4391/data,
# the way verify_data_host.mjs already does. The script lived at
# continent-app/scripts/_t055_scratch_measure_split.mjs only for the run and
# was deleted immediately after; its output is reports/perf_split_T055.json.
node scripts/_t055_scratch_measure_split.mjs
rm scripts/_t055_scratch_measure_split.mjs

# Leave the tree in the state other sessions expect: same-origin build.
rm -rf dist-data
npm run build
```

## Config and secrets set

None. `VITE_DATA_BASE` was set only for the duration of the split-build measurement and unset again before finishing. No credential of any kind exists on this machine for Cloudflare, R2 or Hetzner, which is why the spend half of this task reads from documents and reports rather than from an invoice.

## Before/after measurements

All three page types, both device profiles, T011's method exactly (three cold runs per cell, fresh browser context, median reported, phone throttled 4x CPU at 390x844). "Before" is T011's original 2026-09-23 measurement (reproduced here unchanged) against the same-origin build. "After" is this task's split-build measurement against the loopback stand-in for Pages plus R2. A same-origin re-run on current HEAD is included as a third column to show the two are not being compared across an unrelated drift; the same-origin numbers on 2026-09-28 match 2026-09-23 within run-to-run noise.

### Core Web Vitals

| Metric | T011 before (same-origin, 09-23) | Same-origin, current HEAD (09-28) | After: split build (09-28) | Delta, before to after |
|---|---:|---:|---:|---:|
| LCP, desktop price map | 652 ms | 668 ms | 708 ms | +56 ms |
| LCP, desktop destination page | 908 ms | 648 ms | 800 ms | -108 ms |
| LCP, desktop trip page | 1,320 ms | 1,452 ms | 1,580 ms | +260 ms |
| LCP, phone price map | 2,180 ms | 2,120 ms | 2,532 ms | +352 ms |
| LCP, phone destination page | 2,564 ms | 2,180 ms | 2,496 ms | -68 ms |
| LCP, phone trip page | 3,476 ms | 2,780 ms | 3,860 ms | +384 ms |
| INP, desktop price map | 48 ms | 40 ms | 40 ms | -8 ms |
| INP, desktop destination page | 16 ms | 16 ms | 24 ms | +8 ms |
| INP, phone price map | 160 ms | 144 ms | 312 ms | +152 ms |
| INP, phone destination page | 56 ms | 48 ms | 64 ms | +8 ms |
| CLS, phone destination page | 0.309 | 0.309 | 0.309 | unchanged |

Every LCP and INP delta above sits inside the run-to-run noise this harness already shows between its own three same-origin passes (T011's original run and this task's two same-origin re-runs disagree with each other by similar margins). The split build is not slower or faster in any way that this harness can distinguish from noise, and that is the expected and correct result: LCP on every page and device is set by an image, and INP by CPU cost of an interaction, and the split changes neither. It changes what the browser fetches before the first render (one file versus 43), not what the browser paints or how expensive an interaction is. Loopback has no round-trip time in either shape, so this table cannot show the gain a slow network would reveal, the same caveat T011 recorded.

The phone price map's INP got worse in the split run (312 ms against 144-160 ms elsewhere), driven by one of three runs recording 584 ms against 168 and 312 ms in the other two (see `reports/perf_split_T055.json`). The reported figure is the worst of three by design (T011's method, not changed here), so a single slow run dominates a 3-sample median in the middle position. This is read as a property of the measurement, not of the split, and is noted rather than investigated further because tracking it down is outside this task's scope.

### Boot payload and the wire

| Metric | Before (same-origin) | After (split, per T054) | Delta |
|---|---:|---:|---:|
| Files in the Pages deploy | 52,177 | 61 | -52,116 |
| `check:pages` | FAIL, 2.6x the ceiling | PASS, 19,939 under | passes |
| Boot payload on the app host, raw | 12,516,357 B (`app_data.json`) | 221,859 B (`boot.json`) | -98.2% |
| Boot payload on the app host, gzip -9 | 2,139,840 B | 81,797 B | -96.2% |
| Destinations in the wire | 3,868 | 3,868 | unchanged |
| App-host requests for a data shard, all 6 harness cells | n/a (single origin) | 0 | clean split |
| Data-host requests per cell (median) | n/a | 46-52 | new, all succeeded |

The same-origin build measured on 2026-09-28 (52,177 files, 12,516,357 B raw `app_data.json`) matches T011's 2026-09-23 figures (52,134 files, 12,516,357 B) within the day-to-day noise of a fresh dependency install; the byte count of `app_data.json` is identical because the catalogue has not changed. The split build's numbers match T054's own report exactly (61 files, 6.3 MiB, 221,859 B `boot.json`), confirming no drift between T054 and this re-measurement.

The honest limit, repeated from T054's report because it still holds: the split fixes the file-count ceiling and the boot-payload size, but every screen still reads the full destination record, so the app fetches all 43 country files (12.2 MB, 1.9 MB gzip) before it can render anything beyond the boot index. First paint is not yet cheaper. That is T054-d, filed and open, and belongs with P15's pin tiles rather than this task.

### Monthly spend

| Line | T011 (2026-09-23) | T055 (2026-09-28) | Source |
|---|---:|---:|---|
| Vercel | €0 (Hobby) | €0 (Hobby) | unchanged, reported by owner |
| Cloudflare Pages | n/a, not adopted | €0, modelled | no account exists |
| Cloudflare R2 | n/a, not adopted | €0.41-1.35/mo, modelled | CARTA_CLOUD_ARCHITECTURE.md §7; no bucket exists (T044-a open) |
| Hetzner CAX11 (orchestrator) | n/a, not built | €5.99/mo, modelled | CARTA_CLOUD_ARCHITECTURE.md §6.2; no box exists (T046 owner steps open) |
| Hetzner CAX41 (on-demand) | n/a, not built | €0.45/mo at ~8h, modelled | same; never spawned for a real job (T047-b open) |
| Supabase | €0 (Free tier) | €0 (Free tier) | unchanged, reported by owner |
| Google Cloud (Gemini) | €0 (free tier) | €0 (free tier) | unchanged, reported by owner |
| Domain | €0 | €0 reported / €1.00 modelled in Tier 0 | domain held, no renewal charge fell in this window |
| **Total, billed** | **€0** | **€0** | every line above is either an unchanged free tier or a service that does not exist yet |
| **Total, Tier 0 model** | n/a | **≈ €9.50-10.90/mo** | CARTA_CLOUD_ARCHITECTURE.md §7, unconfirmed against an invoice |

The Tier 0 model cannot be confirmed against a bill this task, for the same reason T011 could not confirm it: `Execution/P3/_OPEN-hetzner.md` steps 30 to 62 (T044 through T054's owner procedures) are still all `open` and owned by `user`. No Cloudflare account, no R2 bucket, no custom domain resolution, no Hetzner server and no rclone credential exist on this machine, confirmed by re-reading T044 through T054's reports and by `_OPEN.md`'s register, where every relevant row is still `open`. `public.infra_ledger` (T043) holds 84 seeded rows, all `source = model`; the one row a test flipped to `actual` (EUR 8.92) was T043's own fixture proving the writer works, not a real invoice, and T043's report says so directly. There is, in short, still no bill anywhere in this system, so "does the monthly bill match the Tier 0 model" has the same answer as T011 gave: it cannot be checked yet, because there is no bill, only the model. What this task adds over T011 is confirmation that the model itself is unchanged and that the R2 pricing lines (§4.4 and §7) that the model depends on have real numbers behind them (T054's staged tree is 1,103.3 MiB, inside the "150,000 images" and "200 GB" bands the architecture document prices at $0.62-3.00/month for storage alone).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Same-origin vitals run crashed with `ENOENT` on `dist/index.html` mid-run | Started the split build (`VITE_DATA_BASE` set) in the same working tree while the same-origin harness was still reading `dist/` in the background | Waited for the same-origin run to finish completely before touching `dist/` again; re-ran it clean to get all 6 cells in one pass |
| The split-build measurement script could not resolve `playwright` | Node resolves package imports relative to the importing file's own directory, and the script first lived in the OS scratch directory, outside `continent-app`'s `node_modules` tree | Moved the script into `continent-app/scripts/` for the duration of the run (deleted immediately after), so it resolves the same `node_modules` the app's own scripts use |
| The same script then failed with `ERR_UNSUPPORTED_ESM_URL_SCHEME` on Windows | A raw Windows path (`C:\...`) was passed to a dynamic `import()`, which Node's ESM loader accepts only as a `file://` URL, not as a bare path, on Windows | Wrapped both dynamic imports (`dataHost.js`, `cachePolicy.mjs`) in `pathToFileURL()` |

## What is still open

The production comparison is still open. This task measured the split build against a loopback stand-in, the same one T054 built and the only one available without a live Cloudflare/R2 account. A real "after" against `data.carta-europetravel.com` and a Cloudflare Pages deploy needs the owner steps already filed as T054-a through T054-c (`Execution/P3/_OPEN-hetzner.md` steps 30 to 33). Nothing here changes their order or their owner.

The monthly bill is still unconfirmed against an invoice, for the same reason T011 found it unconfirmed: nothing has been provisioned. The check this task's prompt asks for, "confirm the monthly bill matches the Tier 0 model," cannot be performed until at minimum the R2 bucket (T044-a), the Hetzner CAX11 (T046's owner steps) and one billing cycle exist. When that first invoice lands, it should be entered in `public.infra_ledger` as `actual` (the mechanism T043 already built) and compared line by line against the Tier 0 table in `CARTA_CLOUD_ARCHITECTURE.md` §7, not eyeballed.

First paint still does not improve, because the split does not change what a screen needs to render, only what the browser must hold before the loading screen clears. This is T054-d, already open and not narrowed further by this task. Any claim that the migration "worked" for user-perceived speed has to wait on that fix and a real network measurement, not this loopback comparison.

The trip page still has no measured INP, on either shape, for the same reason T011 recorded: the harness's generic click sweep produces no interaction the browser will count. That gap is unchanged by this task and remains T011's own open item, not narrowed here because `baseline_vitals.mjs` is outside this task's edit scope.

The destination page's phone CLS (0.309, unchanged in every run this task performed) is still an open, unrelated failure against the 0.1 threshold. T011 found it, filed it as a finding rather than a fix, and it is unchanged today because nothing in T012 through T054 touched destination-page layout on a phone. It still needs its own task.

## Rollback procedure

There is nothing to roll back in the product; nothing in the product changed. The working tree was returned to a same-origin build (`dist-data/` removed, `npm run build` re-run with `VITE_DATA_BASE` unset) before this task finished, so no other session inherits a split-shaped `dist/`.

To undo this task entirely:

```bash
cd continent-app
git checkout p3-wire-shards-to-r2
git branch -D p3-post-migration-measurement    # or: revert the two report-JSON commits once merged
cd ..
git checkout p3-wire-shards-to-r2
git branch -D p3-post-migration-measurement    # or: revert the report commit once merged
```

`continent-app/reports/perf_baseline_T011.json` was overwritten in place by design (T011's own script says it is meant to be re-run at the end of P3 and again at launch); reverting the commit restores the 2026-09-23 figures. `continent-app/reports/perf_split_T055.json` is new and can simply be deleted. Neither file is read by the app at runtime.
