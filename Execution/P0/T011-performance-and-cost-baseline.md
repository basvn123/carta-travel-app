# T011 Performance and cost baseline

## Task ID

T011

## Date

2026-09-23

## What changed

Nothing in the product changed. This task recorded the "before" half of the measurement that `CARTA_CLOUD_ARCHITECTURE.md` section 8 step 5 asks for, so that the image ladder and the wire split can later be shown to have worked rather than assumed to have.

The measurable half is done and is in the tables below. Three pages were profiled on desktop and on a simulated mid-range phone, the boot payload was weighed byte by byte in raw, gzip and brotli, and the wire was counted file by file.

The most useful single result is not a number but a fact about where the numbers come from: the LCP element is a photograph on all six page-and-device combinations measured. Every largest paint this application produces is an image, and every one of those images is a Wikimedia hotlink at a fixed 500px width. The image ladder in migration step 4 and the `<picture>` switch in step 5 are therefore aimed at exactly the element that defines LCP everywhere, which is the strongest justification for that work anyone has yet put a measurement behind.

Two other numbers came out materially different from what the architecture document assumes, and both change the urgency of a migration step rather than its direction.

The first is the file count. Section 5.1 says the Cloudflare Pages 20,000-file ceiling is something the project is "already within sight of". It is not in sight, it is behind us: a fresh production build contains 52,134 files, two and a half times the ceiling. Migration step 6 is therefore not headroom work that can wait for the catalogue to grow, it is a precondition for moving to Pages at all. Nothing is currently broken by this, because Vercel has no comparable limit, but the step-6 ordering in section 8 reads as optional and it is not.

The second is the per-destination wire cost. Section 5.1 extrapolates the core wire to "~30 MB" at 25,000 destinations. The current wire carries 3,230 bytes per destination, which puts the same extrapolation at 77 MB raw. The conclusion the section draws is unchanged and if anything strengthened, but the figure it carries is roughly half of what the current schema actually costs.

The spend half is complete and every line of it is zero. The whole system runs inside free tiers and has no users yet, which means no part of this migration can be justified by cutting an existing bill, because there is no bill. The cost arguments in the architecture document are all arguments about costs that would arrive later, at traffic the project does not yet have. What justifies the work today is the performance half of this report and the file-count ceiling, not the money.

## How the performance numbers were produced

The harness is `continent-app/scripts/perf/baseline_vitals.mjs`. It is new, and it is written to be re-run unchanged at the end of P3 and again at launch, because a baseline is worthless if the "after" is measured a different way.

It serves the real `dist/` over a small static server on loopback rather than using `vite preview`. That is a deliberate choice: this machine has a recorded history of another session holding the preview port and serving a stale build, so serving the directory directly means the bytes measured are provably the bytes just built. The server deliberately returns 404 for a missing path that has a file extension instead of falling back to `index.html`, because the silent SPA-fallback-as-200 behaviour is exactly what has hidden a missing data file before.

LCP is read from the browser's own `largest-contentful-paint` entries through a buffered `PerformanceObserver` installed before any application code runs. It is sampled once the page has settled, which for this application means after the `app_data.json` fetch, its parse and the first real render, so the element measured is the real largest paint and not a loading screen.

INP needs an interaction to exist at all, so each page performs a scripted one that is representative of what a visitor actually does there first: typing in the search box and clicking a result row on the price map, opening folds and scrolling on the destination page, and the equivalent on the trip page. Every interaction is a genuine Playwright click or keystroke, because a synthetic `dispatchEvent` produces no `interactionId` and would be measured as nothing. With only a handful of interactions per run the honest summary of the event-timing entries is the worst one, which is what the script reports, and it notes the interaction count alongside so a reader can see how thin the sample is.

The phone pass throttles CPU by 4x at a 390x844 viewport. The factor is not arbitrary: `scripts/perf/profile.mjs` already uses 4x as its stand-in for a mid-range phone, and matching it means the two scripts' numbers can be read side by side.

Each cell is three runs in a fresh browser context with a cold cache and empty storage, and the reported figure is the median. A fresh context per run is what makes these first-visit numbers, and the first visit is the one the image ladder and the wire split are meant to improve. The median rather than the mean is what keeps a single garbage-collection pause from moving a cell.

One caveat matters more than any other and is the reason these LCP figures should be read as a floor rather than as field data. The network is not throttled and the server is on loopback, so round-trip time is absent. More importantly, images on these pages are still hotlinked from Wikimedia at a hardcoded 500px width, as section 4.1 describes, which means the single thing migration step 5 is designed to fix is only partly present in this measurement. The figures isolate payload and CPU cost honestly; they do not capture Wikimedia's TTFB from a real user's region. When these are re-measured after the ladder ships, the comparison has to be made with the same harness, and the real-world gain should be larger than the harness shows.

## Measured: Core Web Vitals

Median of three cold runs per cell. LCP and INP in milliseconds; "settled" is wall-clock from navigation to the page being ready for interaction, which is not a Core Web Vital but is the number that describes how the app actually feels.

| Device | Page | LCP | INP | CLS | Settled | LCP element |
|---|---|---:|---:|---:|---:|---|
| desktop | price map | 652 | 48 | 0.029 | 3,035 | `IMG.railcard-img` |
| desktop | destination page | 908 | 16 | 0.093 | 3,483 | `IMG` |
| desktop | trip page | 1,320 | not measured | 0.005 | 6,145 | `IMG.itin-photohero-img` |
| phone | price map | 2,180 | 160 | 0.007 | 5,000 | `IMG.railcard-img` |
| phone | destination page | 2,564 | 56 | 0.309 | 5,256 | `IMG` |
| phone | trip page | 3,476 | not measured | 0.008 | 6,508 | `IMG.itin-photohero-img` |

Four things in this table matter more than the individual numbers.

The LCP element is an image on all six cells. Every largest paint this application produces is a photograph, and every one of those photographs is currently a Wikimedia hotlink at a hardcoded 500px width. That is the single strongest piece of evidence this task produces for migration step 5: the image ladder is not a marginal improvement to a page whose LCP is dominated by something else, it is aimed squarely at the element that defines LCP on every page measured.

Phone LCP is 2.4 to 2.8 times desktop on the same content. The only differences between the two passes are the 4x CPU throttle and the viewport, so that ratio is the cost of parsing and rendering a 12 MB payload on a slower processor. It is the clearest argument in this report for the wire split in section 5.2, because it is a cost that shrinks with the payload rather than with the network.

The destination page on a phone has a CLS of 0.309. The "good" threshold is 0.1 and the desktop figure for the same page is 0.093, so this is roughly forty times the desktop instability and a clear failure rather than a marginal one. It is specific to the narrow viewport. Diagnosing it is outside this task's scope and files it are not this task's business, but it should not sit unremarked in a table: it is recorded here as a finding for a later task.

INP on the trip page is not measured, and that is different from being fast. The harness performs a generic click sweep there, and across all six runs it produced zero qualifying `event` entries with an `interactionId`. The clicks landed and nothing errored, so the likely reading is that the elements clicked are not interactive in the sense the event-timing spec counts. A blank is recorded rather than a zero, because reporting an unmeasured cell as good would corrupt the comparison this baseline exists to support. Giving the trip page a real scripted interaction is a small fix and belongs with whoever re-measures at the end of P3.

Where INP was measured it is comfortable: 16 to 160 ms against a 200 ms "good" threshold, with the worst case being the phone price map, where the measured interaction includes mounting maplibre.

## Measured: boot payload

The boot payload is defined here as everything the browser must have before the application can render its first real screen: `index.html`, the nine scripts and stylesheets it references or modulepreloads, and `app_data.json`, which `index.html` preloads and which `src/lib/appData.js` begins fetching at module evaluation. `src/App.jsx` returns a loading screen until it lands, so it is genuinely on the critical path rather than merely early.

Sizes are of the freshly built `dist/`. The gzip column is `gzip -9` and the brotli column is `brotli -q 11`, which is what a CDN serves.

| File | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| `index.html` | 4,794 | 1,839 | 1,398 |
| `assets/index-*.css` | 658,021 | 103,091 | 80,278 |
| `assets/index-*.js` | 907,208 | 271,930 | 223,603 |
| `assets/supabaseClient-*.js` | 203,049 | 51,243 | 43,525 |
| `assets/react-*.js` | 6,507 | 2,598 | 2,275 |
| `assets/preload-helper-*.js` | 1,196 | 703 | 558 |
| `assets/jsx-runtime-*.js` | 711 | 482 | 404 |
| `assets/rolldown-runtime-*.js` | 567 | 392 | 319 |
| `assets/publishedJson-*.js` | 503 | 350 | 282 |
| `assets/localeState-*.js` | 81 | 115 | 85 |
| `app_data.json` | 12,516,357 | 2,139,840 | 1,178,715 |
| **Total** | **14,298,994** | **2,572,583** | **1,531,442** |

That is 13.64 MB raw and 1.46 MB brotli. `app_data.json` is 87.5 per cent of the raw payload and 77.0 per cent of the compressed one, which is the whole of section 2's argument in one line: the JavaScript has already been cut hard, and the data file is what is left.

Parsing it costs 63 ms on this desktop from a warm page cache, with a 26 ms read. Section 1 of `continent-app/CARTA_OPTIMIZATION.md` measured 121 ms for the same operation on a larger file, and the phone multiplier it cites is 4 to 8 times, so the realistic phone parse cost is in the 250 to 500 ms range before React renders anything.

## Measured: the wire

| Metric | Value |
|---|---:|
| Total files in `dist/` | 52,134 |
| Total size of `dist/` | 1,109.6 MB |
| Cloudflare Pages file ceiling | 20,000 |
| Over the ceiling by | 32,134 |
| Files above the 25 MiB per-file limit | 0 |
| `app_data.json` raw | 11.94 MB |
| Destinations in the wire | 3,868 |
| Bytes per destination | 3,230 |

The count was taken twice with independent tools, PowerShell enumeration and `du`, and both return 52,134 files and 1,109.6 MB. It corroborates T007, which counted 52,076 files under `continent-app/public/`; the small difference is the build's own assets.

Where the files are:

| Directory | Files | MB |
|---|---:|---:|
| `cycling` | 17,048 | 452.5 |
| `trails` | 17,716 | 362.3 |
| `dossier` | 3,869 | 87.7 |
| `trips` | 3,994 | 62.4 |
| `region` | 4,849 | 34.5 |
| `poi` | 3,865 | 31.7 |
| `fares` | 286 | 24.5 |
| root | 17 | 15.2 |
| everything else | 486 | 38.8 |

Cycling and trails together are 34,764 files, two thirds of the total and 73 per cent of the bytes. They are the reason the Pages ceiling is breached, and they are the first thing that should move to R2 under migration step 6. Nothing is close to the 25 MiB per-file limit, so the ceiling that matters is purely the count.

Projecting the boot core forward at the measured 3,230 bytes per destination, holding the observed brotli ratio of 0.0944 constant:

| Destinations | Raw | Brotli |
|---:|---:|---:|
| 3,868 (today) | 11.9 MB | 1.12 MB |
| 5,000 | 15.4 MB | 1.45 MB |
| 10,000 | 30.8 MB | 2.91 MB |
| 25,000 | 77.0 MB | 7.27 MB |

The brotli column is mildly optimistic because compression ratios improve with input size, but the raw column is the one that governs parse time and memory, and it is the one that kills the page. The 25,000-destination target is a 77 MB raw parse on the critical path, which is not survivable on a phone. This is the same conclusion section 5.1 reaches, from a starting figure about twice as large as the one that section carries.

## Measured: spend

Every line is zero. Reported by the project owner on 2026-09-23.

| Line | Monthly | Note |
|---|---:|---|
| Vercel | €0 | Hobby tier |
| Supabase | €0 | Free tier, project `ntssxktaduxzpsmejwyv` |
| Google Cloud (Gemini) | €0 | Free tier; three Edge Functions, all Flash-class models |
| Domains | €0 | `carta-europetravel.com`, no cost incurred this period |
| **Total** | **€0** | |
| Supabase MAU | 0 | Pre-launch, no real users |
| Gemini spend | €0 | |

A zero baseline is a real measurement rather than a missing one, and it is worth being precise about what it does and does not tell us.

What it establishes is that the entire current system runs inside free tiers, so nothing in this migration can be justified by cutting an existing bill. There is no bill. Every cost argument in the architecture document is therefore an argument about a cost that would be incurred later, at traffic the project does not yet have, and should be read that way. Section 7's Tier 0 figure of about €9.50 a month is not a saving against today, it is an increase from zero, bought in exchange for leaving free tiers whose limits the project is already pressing against in at least one dimension.

That dimension is the one this task measured. The Cloudflare Pages file ceiling is 20,000 and the build is 52,134 files, so the move described in step 6 is gated on the wire split regardless of cost. Similarly, Supabase Free pauses on inactivity and caps at a level that 0 MAU obviously clears, so the Tier 1 upgrade in section 7 is a launch concern rather than a current one.

The honest reading of a zero baseline is that the performance figures in this report, not the cost figures, are what justify the work. The cost model becomes checkable only after launch, and the value of recording zero now is that the first non-zero month has something to be compared against.

One caveat on the zero for Gemini. It is a spend figure, not a usage figure: Flash-tier models have a free allowance, so zero spend is consistent with a non-zero number of calls. `public.ai_usage`, created by migration 007, counts calls per user per period and is the right source if the call volume itself is ever wanted. It was not queried, because it lives on the live database and this task had no mandate to touch it.

## Files touched

**Created:**
- `continent-app/scripts/perf/baseline_vitals.mjs`
- `continent-app/reports/perf_baseline_T011.json`
- `Execution/P0/T011-performance-and-cost-baseline.md`

**Modified:**
- None.

**Deleted:**
- None.

## Commands run

```
cd continent-app
npm run build
node scripts/perf/baseline_vitals.mjs                 # RUNS=3 by default
ONLY=price-map node scripts/perf/baseline_vitals.mjs  # repair one cell only
```

`ONLY` names one or more page keys and merges the result into the existing JSON rather than replacing it, so a single mis-measured cell can be re-run without paying for the other five. Re-measuring for real at the end of P3 means running it with no `ONLY` at all.

The boot payload table was produced by compressing each critical-path file with `gzip -9 -c` and `brotli -q 11 -c` and counting bytes. The wire counts were taken with PowerShell `Get-ChildItem -Recurse -File` over `dist/`, and cross-checked with `du -sb` and `find . -type f | wc -l`.

## Config and secrets set

None. The harness reads nothing from the environment except an optional `RUNS` count, and it touches no credentials. It does seed three localStorage keys in the browser before each run, `continent.lang.v1`, `continent.guestMode.v1` and `carta.welcomeSeen.v1`, so that the welcome overlay does not block the interaction that INP is measured from. Those are the same keys the existing verify scripts seed.

## Before/after measurements

This task is the "before" column. There is no "after" until P3 closes.

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Boot payload, raw | 13.64 MB | pending P3 | |
| Boot payload, brotli | 1.46 MB | pending P3 | |
| `app_data.json` share of boot, brotli | 77.0% | pending P3 | |
| Files in `dist/` | 52,134 | pending P3 | |
| `dist/` total size | 1,109.6 MB | pending P3 | |
| Bytes per destination | 3,230 | pending P3 | |
| LCP, desktop price map | 652 ms | pending P3 | |
| LCP, desktop destination page | 908 ms | pending P3 | |
| LCP, desktop trip page | 1,320 ms | pending P3 | |
| LCP, phone price map | 2,180 ms | pending P3 | |
| LCP, phone destination page | 2,564 ms | pending P3 | |
| LCP, phone trip page | 3,476 ms | pending P3 | |
| INP, desktop price map | 48 ms | pending P3 | |
| INP, desktop destination page | 16 ms | pending P3 | |
| INP, phone price map | 160 ms | pending P3 | |
| INP, phone destination page | 56 ms | pending P3 | |
| CLS, phone destination page | 0.309 | pending P3 | |
| Vercel monthly spend | €0 | pending launch | |
| Supabase monthly spend | €0 | pending launch | |
| Google Cloud monthly spend | €0 | pending launch | |
| Domain monthly cost | €0 | pending launch | |
| Total monthly spend | €0 | pending launch | |
| Supabase MAU | 0 | pending launch | |
| Gemini monthly spend | €0 | pending launch | |

Two figures in the architecture document are corrected by this task rather than measured by it:

| Source figure | Document says | Measured | Note |
|---|---:|---:|---|
| Files in the wire, against the Pages ceiling | "within sight of" 20,000 | 52,134 | Already 2.6x over |
| Core wire at 25,000 destinations | ~30 MB | 77.0 MB | At 3,230 B per destination |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First `du -sb` over `dist/` never returned | 52,134 small files on NTFS; `du` stats each one through the POSIX translation layer | Measured with PowerShell `Get-ChildItem -Recurse -File` instead; let the `du` run finish in the background and used it only as an independent cross-check |
| PowerShell format string threw on the totals line | Dutch locale renders thousands with `.` and decimals with `,`, which `-f` then fails to parse back to `Int32` | Wrote the numbers with `[Console]::WriteLine` and explicit `[math]::Round` rather than locale-sensitive composite formatting |
| First attempt to read the destination count from `app_data.json` failed | Assumed `destinations` was an array; it is an object keyed by id | Counted `Object.keys` instead |
| Harness output appeared empty for several minutes | It was piped through `tail`, which buffers until the producer exits, so per-row progress was invisible | Watched for the result JSON instead; the harness itself was healthy throughout |
| Both price-map cells timed out after 180 s and reported `[INCOMPLETE]` | The harness waited for `.maplibregl-canvas` as its load signal. There is no separate price-map tab any more: the tab is still keyed `map` in state and deep links, but since Explore v5 it is labelled "Explore" (`src/components/AppHeader.jsx:12-15`), lands on a card grid, and the map is mounted only when the view toggle in the control bar is opened. The canvas the harness waited for does not exist at boot | Settled on `.xcard` instead, which is the grid's first real paint and the correct thing to call load-complete, and moved opening the map into the interaction phase where its cost belongs. Re-ran that one cell with `ONLY=price-map` |

## What is still open

The cost model in section 7 cannot be checked yet, and that is a consequence of the baseline rather than a gap in it. Every spend line is zero, so there is no current bill for the target architecture's roughly €9.50 a month to be compared against. That comparison becomes possible at the first month with real traffic, and the value of this report is that the first non-zero month has a recorded zero to be measured from.

Gemini call volume, as distinct from Gemini spend, is still unknown. Zero spend on a Flash-tier model is consistent with a non-zero number of calls inside the free allowance, so if the volume is ever wanted, a read-only sum over `n` in `public.ai_usage` grouped by `kind` and `period_start` gives it per function per period. That query was not run here because the task had no mandate to touch live data.

INP on the trip page is not measured, on either device. The generic click sweep the harness performs there produces no qualifying interaction, so that cell has no baseline and the P3 comparison will have nothing to compare against for that one page. The fix is to give the trip page a real scripted interaction in `PAGES`, the way the price map and destination page already have; it is a few lines and it should be done before P3 closes rather than after, because a baseline measured later is not a baseline.

The destination page scores CLS 0.309 on a phone, against a 0.1 threshold and a 0.093 desktop figure for the same page. This task measured it but has no mandate to fix it, and it is not a migration concern, so it needs its own task. It is worth doing: it is the one Core Web Vital in this report that is outright failing.

The LCP figures are a floor, for the reason set out under "How the performance numbers were produced": loopback serving with no network throttle, and images still hotlinked from Wikimedia. If a field measurement is wanted before P3, that is a separate task and it needs either real-user monitoring or a throttled run against the deployed site.

## Rollback procedure

There is nothing to roll back in the product, because nothing in the product changed. This task added one script, one JSON result file and this report.

To undo it completely:

```
git checkout main
git branch -D p0-performance-cost-baseline
```

If the branch has already been merged, the three added files can be removed individually; no other file was modified, so nothing else is affected. The `dist/` directory was rebuilt during this task, which is a normal build artifact and is not tracked.
