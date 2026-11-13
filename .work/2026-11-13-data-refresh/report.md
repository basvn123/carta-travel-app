# Pipeline status, hotel scrape, flight sweep and the stale data (D12, T1099-a, D3, N1, I16, H9)

Status: done. The refreshed data and the app on `main` (Travel styles included) are in production, checked in Chrome; the box's root disk went from full to 12 GB free, with the cause fixed in code. What is left is listed at the end.

## Date

2026-11-13

## What was asked

The owner asked whether the pipeline run was done, then: check why the hotel scrape stopped; refresh the eight wires past their freshness limit; make sure everything deployed (flight data, pipeline changes) is current. Mid-way: the hotel scrape and the flight sweep must stay, and the docs must say so; deploying the Travel styles work with the data is fine. Owner choices: stop the stuck box run and refresh now; skip the paid trails run; hotel scrape scheduled for March and September; stay prices wait for the token fix (T1021-a). Later: clear the box's throwaway build space, run the production deploy, then optimize storage.

## What was found

- **The box had published nothing since 2026-10-27.** Both quarterly runs of 2026-11-07 to 09 failed; a catch-up run (`carta-catchup-3`) had spent 48 hours on task 2 of 40 because Overpass refuses the box (overpass-api.de and kumi refuse or time out from the box address; they answer the laptop). A run publishes only when it ends without a failure, and the next run's `git reset --hard` restores the committed wire files, so every rebuild since was lost. The live site served `boot.json` of 2026-06-07 (schema 19) and trips, regions, trails, coverage, destinfo and reach from August and September.
- **Every box master since 2026-11-10 was refused by the app build**, for two reasons: `destinations.*.airports` (T642, read by the place page) was not in `docs/wire.schema.json`, and `sync-data.mjs` proved the rank tier with a copy of the projection rule that kept the T1143 provenance stamps the tier drops, so about 29,000 fields "failed".
- **The trips model read a field the master no longer has.** `trip_model.py` read `accommodation.per_person_night_eur`, which `apply_stays.py` removed for `accommodation.beds`; a trips run composed 0 trips and the export deleted 3,994 trip files. The validator also dropped 644 trips for Commons photos on `thumb.wikimedia.org`, a host the production img-src already allows. The next monthly run (2026-12-05) would have published the empty trips wire.
- **The box master had lost `taste`** (3,855 places on the 2026-11-03 laptop master, 0 on the box): `rating_v5_profile` soft-fails without `cache/nature/lakes_parts.json`, which the Overpass-blocked lakes task writes.
- **The box's 38 GB root disk was full** (292 KB free). Most of it: `~/archive-out/dumps`, where the archive step kept every pushed dump for 8 days (two trailslab dumps of about 4.9 GB each), and a `.git` grown to 2.5 GB by shallow fetches.
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
| `d364f1725e` | `docs/reference/tasks.md` regenerated (the airports task owns `airports`) |
| `172077c282` | Box disk: `run_pipeline.sh` deletes a dump kind's local copies once `push.py` has copied them to R2 (and a dry run no longer deletes); `CARTA_DUMP_DIR` (env.example); `weekly.sh` prunes `.git` past 2 GB; HANDBOOK build box, runbooks `build-box.md` and `backup-restore.md`, ROADMAP H9 |

Live changes:

1. **Laptop Task Scheduler:** `CartaStaysBooking` and `CartaStaysHostelworld` re-enabled, action `cmd.exe /c "<repo>\scripts\stays_scrape.bat" booking|hostelworld` (was `logs\run_stays_*.cmd`, which pinned the finished 2026-10 plan with FORCE=1), trigger hourly on every day of March and September only (next start 2027-03-01 00:16). Undo: `Disable-ScheduledTask -TaskName <name>`.
2. **Box runs:** stopped `carta-catchup-3`; `carta-refresh-4` stopped by hand before publish when trips came out empty (checkout restored to git); `carta-refresh-5` refused at the app build by the contract; `carta-refresh-6` passed every task and the wire build, then hit ENOSPC in `vite build`; nothing published by any of them.
3. **Box input:** the laptop's `cache/nature/lakes_parts.json` (2026-10-28, the build the live lakes wire comes from) copied to `~/carta/cache/nature/` so `rating_v5_profile` rebuilds `taste`.
4. **Box space, owner go-ahead:** removed `~/carta/continent-app/dist`, `~/carta/continent-app/dist-data` and `~/carta/logs/publish_prev` (2.8 GB) under the run lock.
5. **`carta-refresh-7`** (`--only trips,regions,joins,events,rating_v5_profile` on `31e89c60dc`): all five tasks OK (3,781 trips in 42 countries; taste for 3,855 places), build passed, publish phase 1 to R2 at 17:19. Run exit 3: the trailslab dump did not fit the disk, and the box's deploy guard stood down because main's code differs from the live code (`345a142`, an ancestor of main, so nothing rolls back).
6. **Pages:** the box's `dist/` deployed to preview (`96202dcb`, checked), then to production on the owner's word (`0387b66a`), with `wrangler pages deploy dist --project-name carta-app --branch main --commit-dirty=true`. No prune: stale R2 objects stay, harmless; `node scripts/r2/push-data.mjs --live --prune` on the box removes them.
7. **Box storage, owner asked:** deleted the five local dumps R2 held at the same size (two trailslab, three Supabase; about 9.8 GB), `git reflog expire` and `git gc --prune=now` on the clone (2.5 to 1.3 GB), `npm cache verify` (97 MB). Root disk 1.2 GB free to 12 GB (68%).
8. **Box config:** `/mnt/trailslab/dumps` (carta, mode 700) on the lab volume (in fstab, 65 GB free); `CARTA_DUMP_DIR=/mnt/trailslab/dumps` appended to `~/.config/carta/env` (backup `env.bak-2026-11-13-dumpdir`). Undo: remove that line.
9. **Laptop:** `pip install pyyaml==6.0.2` (the pinned project requirement) into the user site, to run the lineage and provenance checks.

## Verification

- Trips on the box master: 1,530 bases, 3,803 composed, 3,781 ship, 22 dropped (was 0 and 3,994 files deleted).
- Wire build on the box master, isolated tree on the laptop and on the box: contract passes, boot index and rank tier round trips exact.
- CI green on `d364f1725e` (app lint and unit tests, fast build, CSP, Deno, python with ruff, pytest, lineage and reference checks, evals) and again on `172077c282`, the storage commit (the box script tests in pytest included). The schema-contract gate fails only on its two older problems.
- Preview and production in Chrome (isolated context): home and `#dest=gem:bruges` load with no console errors; entry `index-BQP3YI-m.js`; boot meta 2026-11-08 schema 20; the place page shows "Vlieg naar BRU" (the new `airports`); the Travel styles header is there; R2 trips index 2026-11-13 with 3,781 trips, a trip detail opens. A hashed deployment URL (`96202dcb.carta-app.pages.dev`) fails with CORS by design: the data host allows the preview alias, not hashed hosts.
- Box after the storage pass: `/` 12 GB free; the env file loads `CARTA_DUMP_DIR=/mnt/trailslab/dumps`; `run_pipeline.sh` and `weekly.sh` pass `bash -n`.
- Laptop tasks `CartaStaysBooking` and `CartaStaysHostelworld`: Ready, next run 2027-03-01 00:16. `carta-late-sweep.service` active on the box.

## Not done, and where it is recorded

- Trails wire (2026-09-13): needs the paid trailslab run; the owner skipped it on 2026-11-13.
- `reach/` (2026-08-06): built by `tools/reachability/build_reach.py`, which no task runs (D12).
- The rest of the quarterly chain (lakes, trails, cycling, parking, access facts and more) waits on Overpass access from the box (ROADMAP H9).
- The `coverage` task soft-fails on the box: `pyarrow` is missing from the box venv (H9).
- Stay prices: the 743,916 scraped prices wait on owner step T1021-a (`docs/owner/stays-box.md`).
- March 2027: the box timer and the laptop would both scrape Hostelworld into one journal key (ROADMAP I16).
- San Marino: 0 trips (21 before) because its one place has 3 photographed sights, one short of a day.
- The schema-contract gate still fails on two older problems: `public/entry_rules.json` missing and non-literal call sites in `supabase/functions/price-alerts`.
- `pipeline/dossier/common.py` still says production refuses `thumb.wikimedia.org`; the live img-src allows it.
- Root disk still holds `data/raw` (7.9 GB, one folder per source) and the lab's Docker image (2.4 GB); both are working data (H9).

## Files changed

`pipeline/trips/trip_model.py`, `pipeline/trips/export_trips.py`, `pipeline/trips/validate_trips.py`, `pipeline/audit/audit_gaps.py`, `tests/test_trip_beds.py`, `docs/wire.schema.json`, `docs/SCHEMA.md`, `continent-app/src/lib/bootIndex.js`, `continent-app/scripts/sync-data.mjs`, `docs/architecture/lineage-fields.json`, `docs/architecture/lineage.md`, `docs/reference/tasks.md`, `infra/hetzner/cax11/run_pipeline.sh`, `infra/hetzner/cax11/weekly.sh`, `infra/hetzner/cax11/env.example`, `docs/HANDBOOK.md`, `docs/runbooks/build-box.md`, `docs/runbooks/backup-restore.md`, `ROADMAP.md`, `docs/owner/scraper-health.md`, `docs/owner/stays-box.md`, `.work/INDEX.md`, this report.
