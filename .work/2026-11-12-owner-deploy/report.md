# Run report: owner sweep, deploy lane

- **Status:** done
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task (owner sweep lane, run headless without approval as the sweep brief allows)
- **Run folder:** `.work/2026-11-12-owner-deploy/`
- **Branch:** `p15-owner-deploy`
- **ROADMAP items:** N2, N6, H3, H11, I16, C5, K5, K2

## Summary
Checked all 85 owner steps of the deploy slice (45 walkthrough steps, 46 rows of `docs/owner/cloudflare.md`, 3 of `google-and-search.md`, the Search Console procedure) against the live Cloudflare account, R2, D1 and git. The main find: **the next Pages deploy would have failed**, because `continent-app/wrangler.toml` carried `[[ratelimits]]` tables that Pages refuses; that is fixed and the ship preflight now catches it. Outcomes: 9 already done, 4 done, 7 decided, 8 obsolete, 20 human, 37 handoff (most of them to the orchestrator's live ship, listed as one ordered checklist).

## What was asked
The deploy lane of the owner sweep (`.work/2026-11-12-owner-sweep/lane-brief-common.md` and `lanes.md`, main checkout): do every Cloudflare, R2, Workers and deploy step Claude can do, decide the decisions, leave only exact human clicks; never ship live.

## What we did
1. Intake and plan (`brief.md`, `plan.md`): 7 batches instead of 85 pipelines.
2. Ship path: `node scripts/ship.mjs` dry run (green), then a real Pages deploy of the fast build to a throwaway branch: refused (`does not support "ratelimits"`). Decision 1 in `decision.md`; fixed, and the same deploy succeeded and served the T1079 headers.
3. R2: published `data/status.json`; added Range to the data bucket CORS and applied it.
4. Workers: proved from D1 that the T1043 half-speed night has been live since 2026-11-04; counted refusals per night (0 of 6 clean); added the late sweep stop switch (T1213-d) and `scripts/flight-sweep.mjs`.
5. Decisions: rate limits (T1157-a), Google Flights stop timing (T1213-g), the K5 headline and outlets (T1130-a); applied the owner's ticks (T571-c, T647-c, T039-e, T1060-b).
6. Owner files rewritten; HANDBOOK and ROADMAP updated; ledger.

Skipped: explore, diverge and propose stages. The only real design choice had a fallback named in the step itself; options are weighed in `decision.md`.

## Live-system changes (all reversible)

| Change | Verify | Undo |
|---|---|---|
| R2 `carta/data/status.json` uploaded (`{"enabled": false}`, `max-age=60`) | `curl -s https://data.carta-europetravel.com/data/status.json` gives 200 | `npx wrangler r2 object delete carta/data/status.json --remote` (brings back the 404) |
| R2 bucket `carta` CORS: `allowed.headers` Range, If-Match, If-None-Match; `exposeHeaders` ETag, Content-Range, Content-Length, Accept-Ranges | preflight 204 with `access-control-allow-headers: range`; ranged GET 206 | revert `continent-app/scripts/r2/data-cors.json` and `npx wrangler r2 bucket cors set carta --file scripts/r2/data-cors.json --force` |
| Two throwaway Pages preview deployments on branch `owner-deploy-check` (fast build), then deleted | `wrangler pages deployment list` shows neither | none needed; production untouched |

Refused by the session's permission guard, so not done (exact commands are in `docs/owner/cloudflare.md`): the flight-sweep Worker deploy (not needed, already live), the three Pages secrets of T1139-b, enabling Email Routing for hello@ (T461-a).

## Files changed

| File | Change | Why |
|---|---|---|
| `continent-app/wrangler.toml` | `[[ratelimits]]` removed, comment says why | Pages refuses the key; every deploy failed (H3) |
| `scripts/ship.mjs`, `continent-app/tests/ship.test.mjs` | `checkPagesConfig` preflight + 2 tests | Dry run catches keys Pages refuses (H11) |
| `continent-app/scripts/r2/data-cors.json` | Range headers | T233-b |
| `continent-app/workers/late-sweep/run.mjs`, `tests/accessLadder.test.mjs`, `config/access-ladder.json`, `infra/hetzner/cax11/env.example`, `docs/data/access-ladder.md` | LADDER_STOP_GOOGLE_FLIGHTS on the box late sweep | T1213-d (I16) |
| `scripts/flight-sweep.mjs`, `continent-app/tests/flightSweepScript.test.mjs` | `nights` refusal report from D1, `deploy` (dry run default) | N6 |
| `docs/owner/cloudflare.md`, `google-and-search.md`, `search-console.md`, `README.md` | Rewritten: 46 to 33 and 3 to 1 rows, ship checklist, exact clicks | Owner sweep |
| `docs/brand/data-stories/europe-week-2027.{en,nl}.md` | Headline and outlets decided | T1130-a (K5) |
| `ROADMAP.md`, `docs/HANDBOOK.md` | N2, N6, H3, H11, I16, C5 status; deploy and rate limit text | Same-commit rule |

## What the live ship needs (orchestrator, after merging every lane, from `main`)
`docs/owner/cloudflare.md` part 1, in order:
1. Build the Ask index in the main checkout (`python pipeline/ask_index_layer.py`, `node continent-app/scripts/build-ask-bm25.mjs`).
2. Prerender build and push (`node scripts/prerender/build.mjs --data public`, `push.mjs --rclone-dry-run`, `push.mjs --live`). The laptop R2 key gets **403 on `carta-prerender`**: the owner adds that bucket to the token first, or the box pushes. Until then content paths stay 404 and the sitemap is the placeholder (as today).
3. The three Pages secrets (T1139-b).
4. `node scripts/ship.mjs` then `--live` (data to R2, preview, look, production, prune with typed `delete`).
5. Post-ship checks listed in part 1 step 6. The beach photo speed check (T052-a) is written under step 5 for a later preview.
Supabase Edge Function deploys (T1117-a, T1137-a, T1140-a) are the supabase lane's and can go before or after.

## How it was checked
- `node scripts/ship.mjs` dry run: green (`ship-dry.log`); throwaway Pages deploy: refused before the fix, accepted after.
- `npm test` (continent-app): see `checks.md`.
- `python -I scripts/docs/check_entry_points.py`: OK, 292 paths. `python -I scripts/docs/drift.py`: 1 drift, `docs/SCHEMA.md` wire table, **pre-existing** (this branch does not touch SCHEMA or the wire schema).
- pytest `-k "env or box or hetzner or ladder"`: 57 passed, 2 failed (`test_trailslab_box`, `test_trailslab_push_due`): Windows path handling in bash, unrelated to this branch (CI runs Linux).
- Judge round 1: FAIL on criterion 4 only (T040-a tick not applied, T052-a without a home, T112-a text cut off, a wrong IndexNow sentence); all four fixed, plus the security doc, T445-b and the night grouping. Judge round 2: `judgement-2.md`.

## Open issues and risks
- Until the owner adds the WAF rule (T1079-a), `/api/*` has only the per-isolate limit, as production has today.
- Google still refuses the night sweep 3 times a night; next engineering fix in ROADMAP N6.
- Rows in files other lanes own that this lane resolved (orchestrator may delete): `unsorted.md` T1157-a, T1168-a, T1213-d, T1113-a and T1212-d (merged into cloudflare.md part 1), T1167-a (now in cloudflare.md part 2), T205-f (google-and-search.md, now in search-console.md); T207-a and T220-a to d are obsolete in `legal.md`, `product-decisions.md`, `owner-checks.md`.

## How to undo
`git revert` the lane's commits (no data migration, no schema change). Live: the two undo commands in the table above.

## Where to find things
Brief, plan, decision, progress, checks, ledger and judgement in `.work/2026-11-12-owner-deploy/` (only this report is tracked).
