# Pipeline status, hotel scrape, flight sweep and the stale data (D12, T1099-a, D3, N1, I16)

Status: paused at the last step. With the owner's go-ahead the box's throwaway build space was freed and `carta-refresh-7` published the new data to R2 (trips, regions, coverage and destinfo are live through the current app). The new app (boot index of 2026-11-08, schema 20, Travel styles) is on the Pages preview and checked there. The production Pages deploy of that build was refused by the permission check and waits on the owner (command below).

## Date

2026-11-13

## What was asked

The owner asked whether the pipeline run was done, then: check why the hotel scrape stopped; refresh the eight wires past their freshness limit; make sure everything deployed (flight data, pipeline changes) is current. Mid-way: the hotel scrape and the flight sweep must stay, and the docs must say so; deploying the Travel styles work with the data is fine. Owner choices: stop the stuck box run and refresh now; skip the paid trails run; hotel scrape scheduled for March and September; stay prices wait for the token fix (T1021-a).

## What was found

- **The box had published nothing since 2026-10-27.** Both quarterly runs of 2026-11-07 to 09 failed; a catch-up run (`carta-catchup-3`) had spent 48 hours on task 2 of 40 because Overpass refuses the box (overpass-api.de and kumi refuse or time out from the box address; they answer the laptop). A run publishes only when it ends without a failure, and the next run's `git reset --hard` restores the committed wire files, so every rebuild since was lost. The live site still served `boot.json` of 2026-06-07 (schema 19) and trips, regions, trails, coverage, destinfo and reach from August and September.
- **Every box master since 2026-11-10 was refused by the app build**, for two reasons: `destinations.*.airports` (T642, read by the place page) was not in `docs/wire.schema.json`, and `sync-data.mjs` proved the rank tier with a copy of the projection rule that kept the T1143 provenance stamps the tier drops, so about 29,000 fields "failed".
- **The trips model read a field the master no longer has.** `trip_model.py` read `accommodation.per_person_night_eur`, which `apply_stays.py` removed for `accommodation.beds`; a trips run composed 0 trips and the export deleted 3,994 trip files. The validator also dropped 644 trips for Commons photos on `thumb.wikimedia.org`, a host the production img-src already allows. The next monthly run (2026-12-05) would have published the empty trips wire.
- **The box master had lost `taste`** (3,855 places on the 2026-11-03 laptop master, 0 on the box): `rating_v5_profile` soft-fails without `cache/nature/lakes_parts.json`, which the Overpass-blocked lakes task writes.
- **The hotel scrape was not broken.** The laptop tasks read 0 pages because the 2026-10 plan was finished (Booking 3,437 towns on 6 dates by Oct 30, Hostelworld 1,219 towns on 5 dates by Oct 25). The owner sweep read that as a block and disabled them.
- **The flight sweep was running and current**: the `flight-sweep` Worker (BRU fares checked 2026-11-13 10:50 UTC, 1,133 searches in the last hour) and `carta-late-sweep.service` on the box. `CartaFlightsAll` and `CartaFlightsNow` were one-off D1 seeds that finished on 2026-10-23, never the sweep.

## What changed

Commits on `main` (each undone with `git revert <sha>`):

| Commit | What |
|---|---|
| `fd870d94d7` | Trips read `accommodation.beds` (`trip_model.per_person_night`: half a three star room, then other rooms, a home for two, a dorm bed); `q` = measured earns the town-price bonus; `validate_trips` and `audit_gaps` read the same; `export_trips` refuses a full export that keeps under half the trips on the wire (`--allow-shrink`); `tests/test_trip_beds.py` |
| `cc5b0a4fdc` | Trips accept Commons photos on `thumb.wikimedia.org` |
| `700cbcae75` | Docs: the hotel scrape and the flight sweep stay (`docs/owner/scraper-health.md`, `docs/owner/stays-box.md`, ROADMAP N1 and I16, HANDBOOK stays section) |
| `1883ae607b` | `airports` in the wire contract (real shape, surveyed on 3,604 records), `docs/SCHEMA.md` table; the rank tier proof uses `bootIndex.projectField`; HANDBOOK and ROADMAP D3 |
| `9286e8466a` | `airports` presence `pending` until the committed wire carries it |
| `648f64dd0c` | Lineage row for `airports`; `docs/architecture/lineage.md` regenerated |

Live changes:

1. **Laptop Task Scheduler:** `CartaStaysBooking` and `CartaStaysHostelworld` re-enabled, action `cmd.exe /c "<repo>\scripts\stays_scrape.bat" booking|hostelworld` (was `logs\run_stays_*.cmd`, which pinned the finished 2026-10 plan with FORCE=1), trigger hourly on every day of March and September only (next start 2027-03-01 00:16). Undo: `Disable-ScheduledTask -TaskName <name>`; the old definitions were exported before the change.
2. **Box:** stopped `carta-catchup-3`; ran `carta-refresh-4` (stopped by hand before publish when trips came out empty; the box checkout was restored to git), `carta-refresh-5` (trips fixed; refused at the app build by the contract, nothing published), `carta-refresh-6` on `d364f1725e` (`--only trips,regions,joins,events,rating_v5_profile`): all five tasks OK (3,781 trips in 42 countries, 22 dropped; regions; joins; events and destinfo; taste for 3,855 places), the wire build passed with both round trips exact, then `vite build` stopped on ENOSPC copying `public/` into `dist/`; nothing published, and the box master now carries `taste` again.
   Owner go-ahead, then: removed `~/carta/continent-app/dist` (643 MB), `~/carta/continent-app/dist-data` (1.2 GB) and `~/carta/logs/publish_prev` (934 MB), under the run lock (2.8 GB free after). `carta-refresh-7` (same command as refresh-6, on `31e89c60dc`): pipeline exit 0, build passed, publish phase 1 done 17:19 (R2 `data/`: trips 3,781 of 2026-11-13, region, coverage, destinfo). Run exit 3: the trailslab dump did not fit the disk (archive step), and the box's own deploy stood down because the live entry script (`index-B1vX5Q60.js`, `345a142`) differs from the build (`index-BQP3YI-m.js`: main adds Travel styles and these fixes); `345a142` is an ancestor of main, so deploying main rolls nothing back.
5. **Pages preview:** the box's `dist/` deployed with `wrangler pages deploy dist --branch preview` (deployment `96202dcb`, alias `preview.carta-app.pages.dev`). Production waits on the owner: on the box, `cd ~/carta/continent-app && set -a && . ~/.config/carta/env && set +a && cp dist/index.html dist/404.html && npx --yes wrangler@4.156.1 pages deploy dist --project-name carta-app --branch main --commit-dirty=true`, then optionally `node scripts/r2/push-data.mjs --live --prune` (deletes R2 objects the new build no longer names; leaving them breaks nothing). Do it before Monday 09:00, when the weekly run resets the box checkout and rebuilds `dist/`.
3. **Box:** copied the laptop's `cache/nature/lakes_parts.json` (2026-10-28, the build the live lakes wire comes from; sha256 a8835d84ab91cc0f...) to `~/carta/cache/nature/` so `rating_v5_profile` rebuilds `taste` (dry run: 3,855 places).
4. **Laptop:** `pip install pyyaml==6.0.2` (the pinned project requirement) into the user site, to run the lineage and provenance checks.

## Verification

- Trips on the box master: 1,530 bases, 3,803 composed, 3,781 ship, 22 dropped (was 0 and 3,994 files deleted); San Marino is the one country without trips.
- Wire build on the box master, isolated tree on the laptop and again on the box: contract passes, boot index and rank tier round trips exact; `boot.json` meta 2026-11-08, schema 20 (live: 2026-06-07, schema 19).
- CI on `d364f1725e`: ci green (app lint and unit tests, fast build, CSP, Deno, python with ruff, pytest, lineage and reference checks, evals). The schema-contract gate fails only on its two older problems.
- Laptop: `tests/test_trip_beds.py` 8 passed; `build_lineage.py --check --strict` ok (78 fields); `build_reference.py --check` ok.
- Preview (`preview.carta-app.pages.dev`, Chrome, isolated context): home and `#dest=gem:bruges` load with no console errors; boot meta 2026-11-08 schema 20; the place page shows "Vlieg naar BRU" (the new `airports`); trips index 2026-11-13 with 3,781 trips; `top.json` 331 cards; a trip detail opens (4 stops). The per-deployment URL `96202dcb.carta-app.pages.dev` fails with CORS by design: the data host allows the preview alias, not hashed deployment hosts.
- Production after the R2 publish (Chrome): `#dest=gem:bruges` renders with no console errors on the old shell (boot 2026-06-07, schema 19, `index-B1vX5Q60.js`), reading the new R2 data.
- Laptop tasks `CartaStaysBooking` and `CartaStaysHostelworld`: Ready, next run 2027-03-01 00:16. `carta-late-sweep.service` active on the box.

## Not done, and where it is recorded

- **The production app deploy** (command in "Live changes" 5): refused by the permission check, waits on the owner.
- **The box disk** (ROADMAP H9): 1.5 GB free after the run. The real weight is `~/archive-out/dumps`: two trailslab dumps of about 4.9 GB each (2026-11-10 and 2026-11-13) that the archive step keeps locally after pushing them; a new one no longer fits, so every run ends in exit 3 until old dumps are pruned or moved off the root disk. Each build also needs about 2 GB for `dist/` and `dist-data/`.
- Trails wire (2026-09-13): needs the paid trailslab run; the owner skipped it on 2026-11-13.
- `reach/` (2026-08-06): built by `tools/reachability/build_reach.py`, which no task runs (D12).
- The rest of the quarterly chain (lakes, trails, cycling, parking, access facts and more) waits on Overpass access from the box; restarting it now would crawl again (ROADMAP H9).
- The `coverage` task soft-fails on the box: `pyarrow` is missing from the box venv.
- Stay prices: the 743,916 scraped prices wait on owner step T1021-a (`docs/owner/stays-box.md`).
- March 2027: the box timer and the laptop would both scrape Hostelworld into one journal key (ROADMAP I16).
- San Marino: 0 trips (21 live) because its one place has 3 photographed sights, one short of a day.
- The schema-contract gate still fails on two older problems: `public/entry_rules.json` missing and non-literal call sites in `supabase/functions/price-alerts`.
- `pipeline/dossier/common.py` still says production refuses `thumb.wikimedia.org`; the live img-src allows it.

## Files changed

`pipeline/trips/trip_model.py`, `pipeline/trips/export_trips.py`, `pipeline/trips/validate_trips.py`, `pipeline/audit/audit_gaps.py`, `tests/test_trip_beds.py`, `docs/wire.schema.json`, `docs/SCHEMA.md`, `continent-app/src/lib/bootIndex.js`, `continent-app/scripts/sync-data.mjs`, `docs/architecture/lineage-fields.json`, `docs/architecture/lineage.md`, `docs/HANDBOOK.md`, `ROADMAP.md`, `docs/owner/scraper-health.md`, `docs/owner/stays-box.md`, `.work/INDEX.md`, this report.
