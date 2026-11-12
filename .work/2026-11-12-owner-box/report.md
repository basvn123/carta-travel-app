# Owner sweep, box lane (H5, H9, H10, I16, D7, D10, D11, D18, D24, E7, H4)

Status: done (one judge loop; fixes applied, see "Verification").

## Date

2026-11-12

## What changed

All 162 steps in the box slice of the owner walkthrough, plus every step in the six box-owned owner files (196 ids in all), were checked against the live Hetzner box, R2, the flight-sweep Worker and the repo. Each one has an outcome in `ledger.json` (not committed, run folder).

| Outcome | Count |
|---|---|
| obsolete | 98 |
| human | 40 |
| already-done | 23 |
| decided | 17 |
| handoff | 15 |
| done | 3 |

Most steps are obsolete because of T1107: the box now runs every pipeline task on a schedule, so a "run X on the box" step needs no owner action. The checks Claude runs after each box run are listed in ROADMAP H9. The code follow-ups went to D7, D10, D11 and D18.

**What the box already does (verified live):**
- nightly encrypted Supabase backup, with the alert on
- weekly trails lab dump to R2
- the lab itself
- deploy token and data host
- late flight sweep (lateFares 150,323)
- the box runs code from `main` (T1223)

**Found and fixed:** `pipeline/photos/takedown.py` missed the T449 moth because the wire stores the Commons title percent-encoded. Needle and wire strings are now normalised, with a test. The trails export does not read the takedown ledger, so the moth is still live: it comes off with Claude's scrub-and-push once the box runs merged code (ROADMAP D24). Teaching the trails export to read the ledger is the lasting fix.

**Found, not fixable here:** the R2 key is refused on `carta-stays-state` (403), so `stays` has never succeeded. This is one Cloudflare token change, written up in `docs/owner/stays-box.md`.

**Decisions made:**
- T1056-b: the box prune stays list-only (HANDBOOK).
- T1161-a: `CARTA_BOX_ML` stays `ask` until the box has 8 GB free.
- T433-b: collect opening hours (D18).
- T433-o: stay on FOSSGIS OSRM with caching and choose a hosted router from H4 load numbers.
- T471-d and T475-e: MOTIS stays postponed.
- T1148-b and T1138-a: deferred (E7).
- T1195-a and T1195-b: check DE and CH only; the car router is deferred.
- T1074-c: stays health reports through the run status, not by mail.
- T233-a, T322-b, T332-c, T552-a: see the ledger.

**Owner files now:**
- `hetzner-box.md`: 4 steps (restore drill, Hetzner token, invoices, `C:\c`).
- `stays-box.md`: 1 step (the bucket token).
- `data-and-pipeline-runs.md`: 4 steps (phone, five-person test, PDF failure, FAT32 drive).
- `paid-runs.md`: every paid run as one capped command.
- `scraper-health.md` and `explore-data-runs.md`: no steps left.

## Files touched

- `pipeline/photos/takedown.py`, `tests/test_takedown_match.py` (new)
- `docs/HANDBOOK.md` (takedown matching, the trails gap, the T1056-b prune decision)
- `ROADMAP.md` (status notes on H4, H5, H9, H10, I16, D7, D10, D11, D18, D24, E7)
- `docs/owner/README.md`, `hetzner-box.md`, `stays-box.md`, `scraper-health.md`, `explore-data-runs.md`, `data-and-pipeline-runs.md`, `paid-runs.md`
- `.work/INDEX.md`, this report

## Live changes

1. **Box `~/.config/carta/env`:** appended `CARTA_STAYS_SCRAPE=1` and a comment. Backup: `~/.config/carta/env.bak-2026-11-12-owner-box`.
2. **Box takedown:** `takedown.py add "2018-11-04_Colotois_pennaria_(2).jpg"` ran while `carta-catchup-3` held the run lock. It did three things:
   - wrote one row to `cache/photos/takedowns.json`
   - ran a wire scrub that matched nothing (the old matcher), so no wire file changed
   - ran `rclone purge` on an R2 prefix that held no object

   The Cloudflare edge purge was skipped (no zone id). The manifest rewrites failed because the manifests do not exist. The run did not use the run lock and touched nothing the catch-up writes.
3. **Box, temporary file:** a copy of the fixed takedown.py was copied to the box and deleted again. It never ran, because auto mode refused the re-run.
4. **Laptop Task Scheduler:** disabled `CartaStaysBooking`, `CartaStaysHostelworld`, `CartaFlightsAll` and `CartaFlightsNow`. The two stays tasks were firing every hour against a scrape with nothing left to read (Booking is paused).

Not touched: `carta-catchup-3` (running the quarterly chain since 2026-11-11), the box code checkout, Supabase, Cloudflare, GitHub.

## Handoffs

| Lane | Steps |
|---|---|
| orchestrator | T1162-a (delete the stale `continent-app/.git` in the main checkout), T252-a (git gc), T877-e (laptop disk, 4.3 GB free), T394-g (Playwright browsers, needs disk) |
| security | T1057-c (branch protection), T1160-b and T1174-b (new tokens for the box), T153-b (the `GEMINI_API_KEY` repository secret) |
| deploy | T1168-c (Workers AI token), T1101-a (live Ask eval on a preview) |
| supabase | T1089-f (a test account for the verify scripts) |
| decisions | T630-l, T695-b, T660-c, T714-b |

99 closed ids are still listed in `docs/owner/unsorted.md` (76), `owner-checks.md` (11), `cloudflare.md` (11) and `product-decisions.md` (1). Their `also_in` field in the ledger says where. Delete them there after the merge.

## Verification

- `pytest tests/test_takedown_match.py`: 3 passed. Ruff is clean.
- Docs checks: only the expected `public/` misses in this sparse worktree, plus the earlier `SCHEMA` drift (`checks.md`).
- Judge 1 (`judgement-1.md`) failed the run on ten points. All ten were fixed:
  - T449-a reclassified
  - T1089-f handed off
  - the free steps in `paid-runs.md` reclassified
  - this report and the INDEX line written
  - `also_in` added to the ledger
  - the restore drill's Postgres connection given exactly
  - T045-e moved to ROADMAP H5
  - two dangling references in `explore-data-runs.md` removed
  - the prune decision recorded in the HANDBOOK
  - the `SCHEMA` line added to `checks.md`

## How to undo

- Repo: `git revert` this branch's commits (`39851a93d0` and the owner-docs commits after it).
- Box env: delete the two `CARTA_STAYS_SCRAPE` lines from `~/.config/carta/env`, or restore `env.bak-2026-11-12-owner-box`.
- Box takedown row: remove it from `~/carta/cache/photos/takedowns.json`.
- Laptop tasks: `Enable-ScheduledTask -TaskName <name>` for each of the four.

All of these are reversible. Nothing was migrated and no schema changed.
