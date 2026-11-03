# P3 digest

38 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`. Owner procedures kept beside this file: _OPEN-hetzner.md.

### T044 Create the R2 bucket, four prefixes, two custom domains (2026-09-27)

Nothing in production changed. What exists now is a complete, tested procedure for standing up the R2 bucket the architecture document calls for in section 5.2 and section 8.2 step 2, plus a script that verifies the result once it exists. Neither script has touched a live Cloudflare account, because no Cloudflare credentials exist in this environment, the same gap T024 recorded on 2026-09-23. `npx wrangler whoami` still says "You are not authenticated" and no `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is set anywhere in the environment or in a tracked file.

Broke: `provision.sh --dry-run` exited 1 at step 4 / The zone-id guard used `: "${VAR:?msg}"`, which raises even when the surrounding script only wants to check whether dry-run should skip it / Replaced with an explicit `if [ "$DRY_RUN" -eq 0 ] && [ -z ...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T044-r2-bucket-and-domains.md"`

### T045 Move the cold archive to R2 and stop the laptop being the system of record (2026-09-27)

Nothing was uploaded and nothing local was deleted. What exists now is the whole archive procedure, written down as data and exercised as far as a machine with no Cloudflare credentials allows. The bucket "carta" still does not exist (T044-a), so the task's done condition is not met, and the honest R2 object count is 0 before and 0 after. The procedure is three files in `pipeline/archive/`. `manifest.yml` names every gitignored path on the laptop that a clean-out would lose, sorts each into one of the four classes of section 6.3 of the cloud architecture document, and records its R2 key, its treatment, its lifecycle and its measured size and file count.

Broke: Every upload in the draft `push.py` would have reported success and uploaded nothing / `wrangler r2 object put` without `--remote` writes to the local Miniflare store in wrangler 4 / Objects now move with rclone against the S3 endpoint.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T045-archive-to-r2.md"`

### T046 Provision the always-on CAX11 orchestrator (2026-09-27)

No server exists. What exists is the code that creates one, checked as far as a machine without a Hetzner account allows, and the owner procedure to run it. The task's done condition (the box exists, cron fires, one full pipeline run completes on it) is not met, and the last part of it cannot be met by T046 at all, because the weekly job is a placeholder until T048 ports the schedule. How it works, for whoever maintains it. `infra/hetzner/cax11/provision.sh` runs once on the laptop with `HCLOUD_TOKEN` exported.

Broke: `pip install cloud-init` into a scratch venv failed / cloud-init's setup.py calls `os.uname`, which Windows lacks; it is not installable here / Validated against cloud-init 25.2's own schema JSON with jsonschema.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T046-cax11-orchestrator.md"`

### T047 Build the on-demand CAX41 spawn-and-destroy flow (2026-09-27)

No CAX41 has been spawned, and none could be: there is no Hetzner account access, no hcloud, no R2 credential and no CAX11 on this machine. What exists is the flow as code, run end to end in dry-run and through fake hcloud and rclone binaries on the laptop, and the owner procedure that makes it real. The done condition, a heavy job run end to end on a spawned box that is then destroyed with its cost recorded, is not met. It is register row T047-d. How it works, for whoever maintains it. `infra/hetzner/cax41/spawn.sh <job> [args]` runs on the CAX11 as `carta`, with `HCLOUD_TOKEN` and the R2 variables from the secrets file.

Broke: The location lookup would have failed on the first live run / hcloud 1.69's Server has no `Datacenter` field; `{{.Datacenter.Location.Name}}` errors / `{{.Location.Name}}`; verify.sh section 8 now runs every template against a local stand-in for the API; The sweep would misread a worker with a missing label / A space-separated `read` collapses empt...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T047-on-demand-cax41.md"`

### T048 Port the Windows Scheduled Task to cron, task by task (2026-09-27)

The weekly cadence can now run on the CAX11, but it has not. There is no box yet (T046 shipped code only), so no task was verified on arm64 and the done condition, a full weekly cadence on the CAX11 producing a wire identical in shape to the laptop's, is not met. What exists is the port, the harness that verifies it one task at a time, the tool that compares the two wires, and the owner procedure that walks through them. The laptop's Windows Scheduled Task TravelAppFareRefresh is untouched and remains the live schedule. How it works, for whoever maintains it. The chain on the box is systemd timer, `weekly.sh`, `run_pipeline.sh`, `run_pipeline.py`.

Broke: The archive output directory silently fell back to `pipeline/archive/output` inside the repo in the smoke test / `run_pipeline.sh` set the default before sourcing `load-env.sh`; `env.example` ships `CARTA_ARCHIVE_OUT=` blank and load-env unsets blanks / Defaults are set after load-env; the rerun printed the scratch directory; The constraints could...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T048-pipeline-cron-migration.md"`

### T049 Build derive.py: content-addressed AVIF and WebP ladder (2026-09-27)

The photo engine now has a derive stage, `pipeline/photos/derive.py`, and the CAX41 has a real `image_transcode` job that runs it. Nothing is live yet. There is no R2 credential and no HCLOUD_TOKEN on this laptop, so no object has been written to the bucket and cdn.carta-europetravel.com serves nothing. The done condition (beaches fully derived and served from the CDN) is not met. It is register rows T049-a to T049-d, and the owner procedure is steps 22 to 26 of `Execution/P3/_OPEN-hetzner.md`.

Broke: 5,322 beach records had no title / The Geograph test matched "geograph.org.uk" anywhere in a URL, and Commons holds thousands of Geograph imports with that in the file name / Test the URL's host, not a substring; a unit test pins it; Every encode failed with "unable to call webpsave_buffer" / `thumbnail` streams its source sequentially, so its pipe...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T049-image-derivative-ladder.md"`

### T050 Extend takedown.py to reach R2 in the same change (2026-09-27)

Before this task, a takedown only scrubbed `continent-app/public`: the wire files a browser reads. Since T049 the same photograph can also live as five self-hosted objects on R2 (`img/{ab}/{cd}/{sha1}/{320,640,1280}.avif`, `{320,640}.webp`), served from `cdn.carta-europetravel.com` with a one-year immutable `Cache-Control`. A wire scrub alone would leave those five objects in the bucket, still served at the edge and cached in every browser that had already fetched one, for up to a year.

Broke: First manual test reported "no wire file carried a match" / The test needle was `File:Test image.jpg` (space) against a URL containing `Test_image.jpg` (underscore); `scrub`'s needle match is a literal lowercase substring test against the raw text, not through `canonical_title`'s folding / Not a bug in this task's code: it is how `scrub` (T-prior,...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T050-takedown-reaches-r2.md"`

### T051 Keep attribution attached to the pixels (2026-09-27)

The credit gate now has a proof that it holds on the self-hosted path, one hole in it is closed, and the app can credit a photograph from a CDN URL. Before this task, `credit.owes_credit` gated every layer export and derive.py's source list, but nothing showed that the image manifest (the only thing that points at an object in R2) carries a complete credit for every entry, and the app's only URL-based credit helper, `src/lib/imageCredit.js`, recognised `upload.wikimedia.org` URLs and nothing else. A `cdn.carta-europetravel.com` URL is a hash and names no file, so it resolved to nothing.

Broke: The first harness count said 10,166 published titles owe a credit, where a cache-side count said 12,085 / The wire files carry a second array, `listed`, next to `beaches`, and the harness walked only the first; `derive.published_titles` walks both / Both arrays are walked; the counts agree at 12,085; A punctuation-only or empty-HTML author passed t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T051-attribution-follows-pixels.md"`

### T052 Switch the layer pages to picture and srcset, behind a flag (2026-09-28)

The beach, lake and mountain pages can now serve their photographs from the image ladder as `<picture>` with an AVIF source (320, 640 and 1280 rungs), a WebP source (320 and 640) and today's Wikimedia JPEG as the `<img>` fallback. It is behind a per-layer flag that is off in every build, so production renders exactly what it rendered before. The export stage of the three layers joins what the app needs from the derive manifest into the wire, and a hero also carries a 24 character placeholder.

Broke: Every beach, lake and mountain hero drawn 10 px tall in production since 2026-09-14 / `width={16} height={10}` on the img map to CSS width and height, and `.bpage-shot` set no `height: auto`, so the attribute beat `aspect-ratio` / `height: auto` on `.bpage-shot`; applies with the flag off too; The first join overwrote every image record's height wi...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T052-picture-srcset-rollout.md"`

### T053 Tighten the CSP once Wikimedia hosts are unused (2026-09-28)

The Content-Security-Policy img-src directive was amended to permit cdn.carta-europetravel.com in both vercel.json (Vercel/production) and public/_headers (Cloudflare Pages), keeping the two CSP definitions identical. The comment block in _headers was updated to reflect the current state: cdn.carta-europetravel.com is now added to img-src, data.carta-europetravel.com awaits T054 (R2 data shards), and the six Wikimedia and Geograph hosts remain in the list until every direct hotlink to them is replaced with CDN derivatives.

Broke: What broke / Why / Fix; The first run of verify_csp.mjs reported 0 violations for every configuration, including the one with the six hosts removed / The local server's request handler read the command-line CSP argument, not the policy passed to each run, so all three runs were served the default policy.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T053-csp-tighten.md"`

### T054 Split the wire by access pattern and move shards to R2 (2026-09-28)

The app can now be built in two shapes from the same code, and one environment variable picks which. Without `VITE_DATA_BASE` (the default, and what production builds today), every data file stays in `dist/` and is fetched same-origin, as before. With `VITE_DATA_BASE=https://data.carta-europetravel.com/data`, the build leaves the app host holding the app shell and a small boot index, and every shard is fetched from the R2 data host instead. In that shape the Pages deploy is 61 files and 6.3 MiB, against 52,132 files and 1,109.7 MiB before, and `npm run check:pages` passes for the first time. Nothing is uploaded and nothing in production changed.

Broke: sync-data would not parse after the first edit / A `'\n'` in the Python edit script became a literal newline inside a JS string / Joined the id lists with a comma instead; sync-data showed as 817 lines changed / The edit wrote LF into a file whose index copy is CRLF / Restored CRLF; the diff is the 60 added lines.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T054-wire-shards-to-r2.md"`

### T055 Re-measure and close the phase (2026-09-28)

Nothing in the product changed. This task re-ran T011's harness against the current build and, because the default build has not moved to the split shape in production, also ran the same measurement method against the split build from T054, served over a loopback stand-in for the app host and the R2 data host. The result is the "after" half of the comparison T011 set up, with one honest qualification: it is an after for the split build on a laptop, not an after for production, because production still builds the same-origin shape and no Cloudflare or R2 account exists yet. The headline finding is that the wire split (T054) delivers on its own promise and nothing more.

Broke: Same-origin vitals run crashed with `ENOENT` on `dist/index.html` mid-run / Started the split build (`VITE_DATA_BASE` set) in the same working tree while the same-origin harness was still reading `dist/` in the background / Waited for the same-origin run to finish completely before touching `dist/` again; re-ran it clean to get all 6 cells in one p...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T055-post-migration-measurement.md"`

### T056 Remove fare runtime reads (2026-09-28)

There was no runtime fare read to remove. The app never asks a travel API for a price while someone is using it, and it already worked this way before this task began. What this task adds is proof, plus a guard that keeps it true. `continent-app/scripts/verify_no_runtime_fares.mjs` lists every place in the code that can open a network connection and records every request the browser makes along the user-facing paths. It fails the moment a price request to a travel host shows up, or a new call site appears that nobody has reviewed. How fares reach a traveller today.

Broke: First harness run died with "Target page, context or browser has been closed" on the first path / Not reproduced; every later run was clean. Most likely a one-off Chromium exit while loading the 43 country files / Added a crash listener and per-path progress lines so a repeat names the path; Sample destination fell back to a hard-coded id / `boot.j...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T056-remove-fare-runtime-reads.md"`

### T057 Remove obsolete fare metadata from the payload (2026-09-28)

Removed obsolete fare metadata that the app never reads, reducing both the shipped payload and the runtime memory footprint. Two parallel changes: **Wire reduction (sync-data.mjs):** Per-day Travelpayouts metadata (out_o, ret_o, out_x, ret_x) is now stripped from the fares JSON files during wire building. These fields tracked which calendar days came from Travelpayouts cache quotes and when they expire,information needed only during pipeline merging, never read by the app. Removes 1.96 MB (8%) from the payload.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T057-remove-obsolete-fare-metadata.md"`

### T058 DECIDE the flight-cost input structure (2026-09-28)

Nothing in the code or the data. This task writes down the contract that already governs how a flight price reaches the trip planner and the price map, names the two places where the code has drifted from it, and takes the decisions the original mind map left open. The contract is in the section "The contract" below. It is the deliverable. The rest of the report is the evidence for it and the list of what has to change to make the code match it. The short version. Flight cost enters route optimisation at two points only, the flight into the first stop and the flight home from the last, and it enters as a per-day price for the exact dates chosen.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T058-flight-cost-input-decision.md"`

### T059 Shard app data by region and viewport (2026-09-28)

The destination records are now split into region shards instead of country files. The app loads them through a store that fetches a shard only when something needs a place inside it. There is also a new build mode in which the Explore map fetches shards as the reader pans. Before this task, `public/dest/` held 43 files, one per country. Italy alone was 1.95 MB, and it would grow to about 12 MB at 25,000 destinations. A country is too coarse to count as "what is on screen". Now any country with more than 256 KB of records is cut into square grid tiles. The build picks the coarsest grid of 8, 4, 2 or 1 degrees that keeps every tile under the budget.

Broke: First paint in viewport mode was 5.06 MB from Charleroi / Country files: the 300 km radius pulled in all of France, Germany and Great Britain / Region tiles in the split. The same radius now costs 1.91 MB; The viewport harness could not find the map canvas / Overriding `navigator.serviceWorker` in an init script broke the app's boot / Block service...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T059-shard-by-region-viewport.md"`

### T060 Reduce the POI payload and lazy-load map layers (2026-09-28)

The finding, after auditing every place POIs and the ten layer directories (beaches, cycling, lakes, mountains, reach, region, trails, trips, dossier, destinfo) are read from, is that almost all of this ground was already covered by earlier tasks. One real violation remained: the reach-hours travel-time layer fetched itself at app boot on every session, regardless of whether the reader ever opened Explore. That is now fixed. Everything else described below is the audit trail, kept here so the next task does not re-walk it. POIs are already as small as this task would have asked for.

Broke: `CountryBrief.jsx`'s "Best trips" fold was briefly changed to start closed, reasoning that its own comment ("fetched when their fold is first opened") implied it should be lazy like "Getting there" / Misread the comment: it describes when the data loads, not that the fold starts closed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T060-reduce-poi-payload.md"`

### T061 Measure mobile first paint and map tiles per session (2026-09-28)

Nothing in the product changed. This task recorded two numbers section 5.4 of `CARTA_CLOUD_ARCHITECTURE.md` and the Unit Economics plan both depend on and that no earlier report measured: first paint on a phone profile, and how many Carto vector tile requests a real Explore-map session generates. Section 5.4 keeps Carto's hosted basemap over self-hosting one reason: it is free today.

Broke: The working tree was checked out to a different task's branch mid-task, with unrelated files (`src/App.jsx`, `src/components/PrivacyPolicy.jsx`, others) showing as modified / A second `run_queue.ps1` instance is running against the same checkout; `_OPEN.md` row T059-f already names this exact collision (two runners, PIDs 22284 and 30708, started mi...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T061-mobile-paint-and-tiles.md"`

### T062 Commit the stranded app-repo work and scope the queue runner's orphan killer (2026-09-28)

Three questions were raised against T057's sweep commit and T060's small diff. Two turned out to be non-problems and are recorded here so nobody re-opens them; the third was real and is fixed. The audit of commit 4b2d8e19f found it carries 84 files while its message names one. Every path in it was checked against main and all 84 are genuinely absent there, so this is not a duplicate of merged work: it is the never-merged output of T011 to T056 (the R2 scripts, the CSP verifier, the image ladder, _headers, wrangler.toml, the AI quota tests) that earlier tasks left uncommitted and T057 swept up. The content therefore stays.

Broke: A latch was added to T060's reach gate to fix a suspected stranded-filter bug / Misread the gate as circular. The reachHours != null test already carries the wanted state across a tab switch, so the reader's cutoff never strands.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T062b-uncommitted-work-and-queue-runner.md"`

### T1031 to T1032: the beach step can no longer hold a Monday run for days (2026-11-03)

T1031: Steps 4 to 6 of `enrich_country` (region ids, aspect, protection) and the save moved into one inner function, `finish()`. The Overpass loop calls it every `CHECKPOINT_BATCHES` (10) batches, so a country is saved every 120 beaches instead of once at the end, and every saved file is complete row for row. A beach not reached yet keeps its old context at the old `context_v`, so `stale()` asks for it again on the next run.

T1032: `run_pipeline.py` stopped a task's command list at the first non-zero exit, so a capped `enrich_beaches` would also have skipped the walks and the export and this week's part would never reach the app. A task may now name `partial_rc`: a command exiting with it is logged as "stopped incomplete", the task's remaining commands still run, and the task ends INCOMPLETE (listed with the soft failures, no `last_success`), so it stays due.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T1031-T1032-beach-step-cap.md"`

### T262: the box publishes its data to R2 and remembers its runs (2026-10-01)

Stage 4 of `Execution/_OPEN-MASTER.md`, items 6, 7 and the second half of 9: the three archive and publish gaps between the CAX11's weekly run and production. The weekly run now publishes (T054-e). `infra/hetzner/cax11/run_pipeline.sh` has a step 9 after the archive pushes. When `VITE_DATA_BASE` is set on the box, the run succeeded and its build was split, it uploads the staged tree with `node scripts/r2/push-data.mjs --live`. That is phase 1: it adds and replaces objects and deletes nothing. This is the route `_OPEN-MASTER.md` stage 5 chose for T048-j: the box's output reaches production as R2 data, with no deploy key and no git push from the box.

Broke: The first harness run failed 13 of 17 / The fake repo had no `run_pipeline.py`, so the script exited 5 (environment broken) before doing anything / Harness creates an empty one; 17 of 17

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T262-box-publishes-to-r2.md"`

### T263: the box provisions itself fully, and the reboot window waits for spawns (2026-10-01)

Stage 4 of `Execution/_OPEN-MASTER.md`, items 8 and the first half of 9 (T048-i, T047-l). `infra/hetzner/cax11/cloud-init.yaml` now brings a new CAX11 to the state the weekly run expects, with no hand steps: - `carta-bootstrap` installs the venv with `-c constraints.txt` and writes the hash stamp that `run_pipeline.sh` compares, so the first run does not re-sync. Before, it installed unpinned and `run_pipeline.sh` re-pinned on the first run. - It installs the PostgreSQL 17 client from the PGDG repository. The signing key is downloaded and checked against its published fingerprint `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8` before apt trusts it.

Broke: The first attempt at the cloud-init edit failed in the shell / The edit script was passed through a bash heredoc, and the tool's own quoting broke on the script's single quotes / Wrote the edit script to a file and ran it

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T263-box-provisioning.md"`

### T267: frozen fares and housekeeping (2026-10-02)

The planner's round flight now prices the same way Explore does. combineTripLegs takes three steps: a stored day, a served airport within PLANE_REACH_KM for a town with no fares of its own, then the month band. It returns a per-direction provenance bag (into_prov, out_of_prov), a fare_estimated flag and the nearby-airport hop (into_via, out_via). The date sweep cheapestStartDates still passes no options, so it stays on stored days only. The dead expiry slot is gone: the x field, fareExpired, the expired chip, the ?provmock exp key, the prov.expiredTitle strings in six languages and the .is-expired rule.

Broke: New split-wire check failed on every fare slice / Slices carry a `__window` metadata key beside the anchor records / The check skips keys that start with `__`; A queue gate that compared against a clean app tree would fail a task for another session's changes / The app tree is shared and often dirty / The gate compares against a `git status --porce...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T267-frozen-fares-housekeeping.md"`

### T269 D5a: the photo pipeline before stage 8 (2026-10-02)

Stage 9 group D5 of `Execution/_OPEN-MASTER.md`, the pipeline half: rows T052-c, T051-c, T049-f, T049-i, T049-j, T050-c, T049-k, T051-d, T047-g and the image items of the P0 audits (T007, T008). No CSP and no app work, as the session notes said. All nine rows are closed. What only the owner can do (credentials, a box, a decision) is in new rows T269-a to T269-h. Nothing live changed. There is still no R2 credential on this laptop, so everything below was run offline or as a dry run, and against the main checkout's caches and wire read through the new `CARTA_DATA_ROOT` variable (this worktree is sparse and has neither). derive.py now does seven things it did not do.

Broke: 13 stamped beach files had no `n` in the manifest / A file used by several rows took its stamp from the first row only / collect() marks a file nothing-owed if any of its rows recorded the stamp; A trails sources pass took 16 minutes / The wire walk stepped into every geometry coordinate / Lists whose leaves are numbers are skipped; still 13 minute...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T269-d5a-photo-pipeline.md"`

### T271 D4 speed: first paint from the rank tier, the destination page CLS, the trip page INP (2026-10-03)

The Destinations and Explore screens no longer wait for the 238 destination shards before they paint. Until now the default build fetched every shard (12.2 MB raw, 2.1 MB gzip) because every screen ranks all of Europe by price, rating and kind, and ranking needs the record. There is now a third file beside the boot index and the shards, the rank tier at `/dest/_rank.json`. It carries, for every destination, exactly the fields those screens rank, filter, price and draw a card from. The first paint waits for the boot index and the rank tier, 2.7 MB raw and 0.47 MB gzip in two files.

Broke: The lite and full prices differed for Brussels / `accommodationPerPerson` reads the neighbourhoods for its displayed range, and the first field list omitted them / accommodation ships whole; pooled, it costs about 100 KB; Destinations cards came no sooner with the rank tier (11.2 s against 12.2 s) / The 238 background shards, at auto priority, queu...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T271-d4-speed.md"`

### T273: No flight figure of Carta's on any screen (2026-10-02)

Carta does not price flights (owner decision, 2026-10-02). Until this task the planners, the Destinations city-day card and the printed export still showed figures built from the frozen fare snapshots, marked "~" and "est." by T256. Now no screen shows or sums a Carta flight figure. The only flight figure in a total is one the traveller typed. The planner still flies the trip. `combineTripLegs` still finds the route (origin, the two airports, carrier and times, the airport transfers), and a new helper, `unpricedFlight` in `trip_planner_pricing.js`, strips the seat fares, the bag add-on, their sums and the fare provenance, and marks the flight `priced: false`.

Broke: sed turned TripItinerary.jsx from CRLF into LF (a 2,061 line diff) / Git Bash sed on Windows / Converted back with Python before the commit; the diff carries only the changed lines; The first two harness runs timed out on page.goto / The dev server took over 120 s on its first pages with ten sessions on the machine / A warm-up load, then the run pa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T273-no-flight-estimates.md"`

### T278: Typed fares price the airport transfer; route rows drop the snapshot carrier (2026-10-02)

Before this task, a flight the traveller typed (the `own` flight: every wizard trip, and any trip after "Add your fare") priced no airport transfer. `anchorLegs` and `flightTransfer` in useTripPlanner.js returned nothing unless `flight.combinable`, so a wizard trip that landed at Bergamo and slept at Lake Como lost the Bergamo to Lake Como leg from the receipt and the total. Now the own flight carries the airports it uses. The airport it flies into is the wizard's arrival (anchorId), else the airport the routed flight uses. The airport it flies home from is picked the way the routed flight picks it: the chosen return airport, else the last stop's own airport, else the arrival.

Broke: The first Python edit of useTripPlanner.js failed to match / Every file in the app worktree is CRLF / Edited through a helper that converts to LF and back, so the diff carries only the changed lines; The harness's first own-fare check failed: no airport transfers row / BGY and TSF carry no stored airport transfer, so the routed view has none either...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T278-typed-fare-transfers.md"`

### T280 The trails export applies the credit gate (2026-10-02)

The trails export (`pipeline/trails/export_wire.py`) now refuses any photograph whose licence owes a credit and which carries no author, using the same rule beaches, lakes, mountains and cycling use: `owes_credit` in `pipeline/photos/credit.py`. Before, the export copied every ranked row of the lab's `images` table to the wire. Now `main()` passes each trip's rows through a new `credited()` before anything else reads them, so a held-back photograph reaches neither the card hero nor the detail gallery. The author is tested after `clean_author()`, so a Commons Artist field that is only a licence blurb counts as no author, which is what a reader saw.

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T280-trails-credit-gate.md"`

### T288 The R2 bucket, the cold archive and the first database dumps are live (2026-10-02)

Stages 5.1 and 5.2 of `Execution/_OPEN-MASTER.md` were run by the owner on the laptop on 2026-10-01 and 2026-10-02, guided step by step from a Claude Code session; this report records the outcome and closes the eight register rows it settled. The R2 bucket `carta` exists with its four prefix markers and two test objects, and `cdn.carta-europetravel.com` and `data.carta-europetravel.com` are attached to it and serve the test objects with the expected Cache-Control.

Broke: `wrangler whoami` returned "Invalid format for Authorization header" / A placeholder or stray characters in `CLOUDFLARE_API_TOKEN` / Exported again cleanly; checked length and character set before use; `provision.sh` stopped at the first command with code 10042 / R2 was not enabled on the account / Enabled R2 in the dashboard, ran the script again;...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T288-archive-live.md"`

### T289 push-data.mjs passes its rclone arguments intact on Windows (2026-10-02)

`continent-app/scripts/r2/push-data.mjs` could not upload anything from this laptop. Its `run()` helper called `spawnSync` with `shell: true` on Windows for every command. With a shell Node joins the arguments with spaces and quotes none of them, so a path under `Travel App` and the `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` header reached rclone as six loose words, and rclone refused with "Command copy needs 2 arguments maximum". The owner hit it on the first `--rclone-dry-run` of stage 5.3 step 2 (T054-b). The CORS step had worked only because its wrangler arguments contain no spaces.

Broke: `push-data.mjs --rclone-dry-run` failed with "Command copy needs 2 arguments maximum: you provided 6" / `shell: true` on Windows joins arguments unquoted; the repo path and the Cache-Control value contain spaces / Shell only for `npx`; `node ...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T289-push-data-windows-args.md"`

### T290 The data host is in the CSP, the app data is on R2, and the cutover route is open (2026-10-02)

`https://data.carta-europetravel.com` is now in `connect-src` in both `continent-app/vercel.json` and `continent-app/public/_headers`. That is the one-line change stage 5.3 step 3 of `_OPEN-MASTER.md` asks for (T053-b), and it is what lets `scripts/r2/stage-data.mjs` accept a split build without `CARTA_SKIP_CSP_CHECK=1`. The two CSP strings remain identical. Before the edit, the owner finished stage 5.3 steps 1 and 2 in the same session. The bucket's CORS rule lists the five origins with GET and HEAD (T054-a). A split build (17 entries, 52,310 files, 1,101.4 MiB) was uploaded to `r2:carta/data/` with `push-data.mjs --live` after the T289 fix.

Broke: The owner's `verify-data.mjs --all` never ran / Two commands pasted together; only the first executed / Run by the session instead; The verification build after the CSP edit failed inside Vite / C: had 147 MB free at the start and 11 MB at the end; the earlier split build's dist/ and dist-data/ were still on disk / Deleted dist/ and dist-data/ (bot...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T290-csp-data-host.md"`

### T291 Production reads its data from R2 (2026-10-02)

`www.carta-europetravel.com` now serves a split build. The app host carries the 64-file app shell, and every data shard (dest, poi, dossier, trails and the rest) comes from `https://data.carta-europetravel.com/data`. That is stage 5.3 step 4 of `_OPEN-MASTER.md` (T054-c), and with it stage 5 is complete. The build was made on the laptop with the Vercel CLI and uploaded prebuilt, not built by Vercel from git. A git build cannot produce `boot.json` (T290-a), and that missing file is what broke the site on 2026-10-01.

Broke: `vercel pull` gave `VITE_SUPABASE_URL="[SENSITIVE]"` / Sensitive Vercel variables cannot be downloaded / Removed those lines locally; the build read `continent-app/.env`; `vercel link` edited the tracked root `.gitignore` / CLI default / Reverted; local excludes used instead; The session's `vercel deploy` was refused / The auto-mode classifier trea...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T291-cutover-live.md"`

### T298 Stage 7 is ready to run, and the laptop schedule is off (2026-10-02)

The laptop's weekly task `TravelAppFareRefresh` is disabled. It was due to run `run_pipeline.bat` on Monday 2026-10-05 at 09:00. `logs/pipeline_state.json` was last written on 2026-07-31, and the run of 2026-09-28, like the ones before it, was stopped inside the fare harvest (last result `0xC000013A`). So `run_pipeline.py --list` showed about forty tasks due: the master writers `fame`, `poi_significance` and `country_context`, and every layer export (trails, cycling, beaches, lakes, mountains, regions, trips). Since stage 1 the fare tasks are manual, so Monday's run would have reached all of them for the first time.

Broke: The laptop's Monday run would have started about 40 due tasks with their inputs deleted / The 2026-10-02 clean-out happened before stage 7, as the stage 6 build needed the disk; the task was still enabled / Task disabled; 7.9 and 7.11 say so; Step 7.8 as written would compare the box's 64-file shell with a laptop `npm run build` of about 52,000 fil...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T298-box-readiness.md"`

### T299 The orchestrator box can be x86, and gets an IPv4 by default (2026-10-03)

Stage 7 could not start: on 2026-10-03 the owner's `hcloud server-type describe` showed every ARM type (CAX11, CAX21, CAX31) as unavailable in fsn1, nbg1 and hel1. The console's availability table shows no CAX type in any location since 2026-09-03. The account itself is fine. A listing of every type with stock showed the x86 CPX and CCX families available in all three European locations. The cheap x86 CX23 was out of stock as well, but its stock comes and goes within the hour. The box type is the CX23 (2 vCPU, 4 GB, 40 GB).

Broke: The x86 wheel check with pip failed on pywin32 / pip on Windows evaluates markers for Windows even with --platform / Used uv, the tool the constraints header names; `--help` cut the last setting line / The header grew by eight lines / The sed range follows it

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T299-x86-orchestrator.md"`

### T324 box readiness code before stage 7 (2026-10-03)

Four small changes in the code the owner will put on the Hetzner boxes, none of which changes an interface the boot path uses. First, weekly.sh now pings the heartbeat URL with /fail when run_pipeline.sh returns any non-zero exit, so an exit 3 (pipeline ok, R2 archive or publish failed) is no longer silent (T218-c). Second, jobs/image_transcode.sh accepts the eight wire layers derive.py reads (trails, cycling, region, dossier, poi, dest, trips, journeys) with no tarball, passes --recheck in the first seven days of a UTC month, and runs derive.py gc as a dry run at the end (T269-c).

Broke: My first edits wrote CRLF line endings and collapsed some backslashes / Python text mode on Windows, and escape handling in the tool input / Re-wrote the affected lines, converted back to LF (git ls-files --eol shows w/lf), re-ran bash -n and the stub tests; A dry run of image_transcode.sh failed at cd / My temp repo directory did not exist; the sc...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T324-box-readiness-code.md"`

### T366: housekeeping the owner approved (2026-10-07)

Four small decisions the owner made on 2026-10-07 (T362, Execution/P3/T362-owner-decisions-applied.md) are now in code. The monthly flight_times task in run_pipeline.py is on the manual cadence, so the weekly run on the stage 7 box no longer calls the Ryanair timetable for CRL and BRU (T255-a). The lodging task passes --footprint to harvest_accommodation.py, which turns on the per-town median anchors inside the six regional snapshots (T311-b); the flag exists in pipeline/harvest_accommodation.py (line 480). The P3 report for the first T062 was renamed to T062b so the number is no longer used twice (T062-c).

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T366-owner-housekeeping.md"`

### T617: the ingestion collectors can run again (2026-10-23)

The weekly `ingestion` task (the raw open-data mirror, `python -m src.ingestion.run_all`) had crashed on its first collector since 2026-10-01 with `TypeError: 'Run' object is not callable`. T078 made `register()` in `src/ingestion/core/registry.py` store each collector's cadence record as `cls.run`, which is also the name of `Collector.run()`, so the record replaced the method on every registered class. Nobody saw it because the laptop's scheduled task was switched off on 2026-10-02 (T298). The Hetzner box found it on its first verification run of the step (stage 7.6 of `Execution/_OPEN-MASTER.md`).

Broke: `ingestion` crashed on the first collector / `cls.run = RUNS[...]` shadowed `Collector.run()` (T078) / Record moved to `cls.schedule`

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T617-ingestion-run-shadow.md"`

### T992 to T996: the box keeps its disk, its packages and its code current, and deploys itself (2026-11-02)

T992: `src/ingestion` writes every run's download to `data/raw/<source>/<YYYY-MM-DD>/` and nothing ever removed the older ones, so each run added about 12 GB (the three big transit sources) to a 38 GB disk.

T993: `run_pipeline.sh` ran `npm ci` only when `continent-app/node_modules` was missing. On 2026-10-23 the ship step failed on `minisearch`, a package the app gained after the box's first install.

T994: The box never fetched code by itself: fixes reached it only when someone moved its checkout by hand (2026-10-23 to the T617 branch, 2026-10-31 to `carta-run`), and run 2 started on a checkout two days behind `main`.

T995: After a run that published data (phase 1), and with `CARTA_DEPLOY=1`, `run_pipeline.sh` now writes `dist/404.html`, runs `check-pages-limits.mjs`, deploys `dist/` with `npx wrangler@4.156.1 pages deploy dist --project-name carta-app --branch main`, and then ru...

T996: `rinf.era.europa.eu` answers 301 to `data-interop.era.europa.eu`, a name with no A, AAAA or CNAME record, so the `era` collector logged an error for it on every run since 2026-10-22.

Broke: T992 First dry run kept both copies of 9 sources / Total bytes compared; 2026-10-22 held two runs' copies / Distinct files and bytes per copy (commit 2); T995 Laptop builds never matched live at all / `VITE_E2E_SEAMS=1` in continent-app/.env / Cleared for the comparison; left out of the box's .env; T995 Box builds could never match / No continent-a...

Full: `git show archive/execution-full-2026-11-03:"Execution/P3/T992-T996-box-autonomy.md"`
