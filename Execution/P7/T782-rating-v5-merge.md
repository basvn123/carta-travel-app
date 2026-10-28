# T782: rating v5 merged (R1 to R4) and the shared master re-scored

## Task ID

T782

## Date

2026-10-28

## What changed

The four rating v5 batches are merged, in order and `--no-ff`, into both repos: R1 foundation (T754 to T756), R2 scoring (T757 to T760), R3 profile (T761, T762) and R4 screens (T763 to T766). App `continent-app` `master` is at `97ed240` (it has no remote). Root `main` is at the commit carrying this report and is pushed to `origin`. Then the merge-time chain ran on the shared master (`app_data/app_data.json`, which the batches had only re-scored as copies): T754-a's chain, T756-b's place layer, R3's nature tiers, taste profile and fact cards, `sync-data`, and all 3,868 dossiers rebuilt so the destination page's verdict follows the new score. The shared master went from schema 18 with rating v4 on every row to schema 19 with rating v5.0-r3: 3,855 places rated (the other 13 rows are gateways): Exceptional 106, Excellent 202, Very good 437, Good 656, Pleasant 1,058, and 1,396 under 6.0 with no word. Not deployed: the Pages deploy waits for the owner (T782-a).

While the chain ran, the owner asked that the pipeline stop opening Docker; that became T784 (its own report): `nature_tiers.py` now keeps the trails lab rows it reads and works from them when the lab is down.

Box fee data (T761-a, the prompt's step 3): the harvest on the box was still running at 15:40 (8,640 of 44,755 POIs asked, 581 with a fee tag, `pgrep` shows `harvest_poi_fees.py --wiki-only`), so nothing was pulled or re-labelled and no T783 task was opened. The steps are in the T761-a row and under "What is still open" below.

## Files touched

Root `main`, merge commits `064e9f65e`, `fa80098e3`, `65b8e1c98`, `a677e589f` and:

**Modified:**
- `Execution/_OPEN.md` (the merge conflicts; T754-a restored after the R3 merge dropped it, `d55b64138`; the rows this task closes)
- `continent-app/src/styles/planners/86-plan-flow.css` (merge conflict: `main` removed `.pf-home-empty`, R4 moved `.pf-like*` to `86-plan-flow.css`; both blocks dropped)
- `continent-app/` mirror catch-up with app `69d8560` and `97ed240` (`WhyItMatches.jsx`, `rating.js`, `25-feature-pages.css`, six i18n files, `scripts/verify_taste_onboarding.mjs`)
- Data: `continent-app/public/app_data.json`, 3,866 `continent-app/public/dossier/*.json`, `continent-app/scripts/ci/fixtures/contract-min.json`, `data/rating/fact_cards/*.jsonl`, `data/rating/hidden/scorer_hidden.jsonl`, `data/reports/dossier_build.json`, `data/reports/dossier_audit.json`, `cache/poi_significance.json`

**Created:**
- `Execution/P7/T782-rating-v5-merge.md`
- `wt/vite.t782.mjs` (outside the repo: fast build and dev server of the merged app, port 5782)

App `master`: merge commits `6d8b9d1`, `932d935`, `6e30c76`, `654b9ec`, and `97ed240` (`scripts/verify_taste_onboarding.mjs` waits up to 30 s).

Untracked inputs copied into the main tree from R3's worktree, because the chain reads them and they only existed there: `cache/nature/{beaches,lakes,mountains}_parts.json`, `cache/eurostat_nights_nuts2_monthly.json`, `cache/poi_fees.json` (the 960 local fee answers R3 used).

## Commands run

```
git merge --no-ff p7-rating-v5-foundation | -scoring | -profile | -screens     # root main, then app master
cp app_data/app_data.json <scratchpad>/t782-backup/app_data.pre-t782.json
python pipeline/score_significance.py apply
python pipeline/nature_tiers.py && python pipeline/nature_tiers.py --check
python pipeline/apply_beauty_layer.py
python pipeline/apply_rating_layer.py
python pipeline/country_context_layer.py
python pipeline/apply_place_layer.py
python pipeline/place_taste_profile.py && python pipeline/place_taste_profile.py --check
python pipeline/rating_fact_cards.py
node continent-app/scripts/sync-data.mjs
python pipeline/dossier/build_dossier.py --all && python pipeline/dossier/audit.py --strict
node continent-app/scripts/ci/make-fixture.mjs && node continent-app/scripts/ci/check-contract.mjs
python -m pytest tests/test_rating*.py tests/test_place_taste_profile.py tests/test_poi_labels.py tests/test_nature*.py tests/test_golden_ratings.py
cd continent-app && npm test
PF_OUT=<scratchpad> npx vite build --config ../../wt/vite.t782.mjs
node scripts/verify_rating_words.mjs http://localhost:5782/
node scripts/verify_taste_onboarding.mjs http://localhost:5782/
git push origin main
```

The chain ran three times. The first stopped at `nature_tiers.py` because the trails lab (Docker) was down. The second stopped because `cache/nature/*_parts.json` existed only in R3's worktree. The third ran through, and a fourth full run repeated everything from step 1 once `cache/poi_fees.json` was in place, so the POI labels match R3's. Every step rewrites from its inputs, so repeating it is safe. A Booking scrape (`scrape_booking.py`, started 11:16) was running all along; it only reads the destinations and writes its own journal, so the chain did not touch its files.

## Config and secrets set

None. Docker Desktop was started for the trails lab and the `trailslab-db` container stopped again after T784; Docker Desktop itself was quit at the end.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Shared master schema / rating source | 18 / rating_v4 (3,868 rows) | 19 / v5.0-r3 (3,855 rated) | v5 live in the master |
| Rated places with a band word | 0 (v4 tiers) | 2,459 (106 / 202 / 437 / 656 / 1,058) | five bands |
| App entry chunk gzip (fast build, app `master` before and after) | 257,047 B | 261,471 B | +4,424 B |
| App all JS gzip | 2,027,833 B | 2,109,662 B | +81,829 B |
| App unit tests | | 868 of 869 pass (5 skipped) | the one failure predates the merge (T763-d) |
| Root rating pytest | | 25 passed, 1 skipped; golden ratings pass | |
| Contract gate, dossier audit --strict | | both pass (schema 19, 3,868 destinations, 259 country files) | |
| `verify_rating_words` on the merged app | | PASS: 15 places, 177 chips | |
| `verify_taste_onboarding` | | 15 of 15 (3 taps, about 1 s scripted; Skip 1 tap) | |
| Persona gate 7 | 87 of 120 (72.5%), FAIL | unchanged (no ranking change in the merge) | needs 96 |

Screenshots of the merged app at 390 and 1440 wide (Explore with and without a taste, the taste sheet, the start dialog, a destination with and without a taste, "Why it matches you", the list cards with matches): `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\c--Users-Gebruiker-Documents-Portfolio-Travel-App\3d345edc-87bb-4f03-adaf-575e54a3c15d\scratchpad\t782-shots`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| App merge refused ("local changes would be overwritten") | Root and app share `continent-app/`: the root merge had already written the batches' files there | Checked each file was R1 to R3's content (line endings aside), moved the working copies to `<scratchpad>/t782-backup/app-wt`, restored `master`, merged; the same again for R4 |
| T754-a missing from the register after the R3 merge | My conflict filter dropped both copies of the row | Restored R3's row (`d55b64138`) |
| Root mirror two R4 commits behind | The root batch worktree was synced before R4's last two commits | Mirror catch-up commit after the app merge |
| `nature_tiers.py` timed out on the trails lab | Docker Desktop was stopped | Started it for this run; T784 removes the need |
| `nature_tiers.py`: `cache/nature/beaches_parts.json` missing | Exporter outputs lived only in R3's worktree | Copied the three files, plus `eurostat_nights_nuts2_monthly.json` and `poi_fees.json` |
| `verify_taste_onboarding` part c timed out | A cold dev server takes 5 to 15 s to serve the lazy taste chunk's planner modules in a fresh browser; the built chunk is 2 KB | Waits widened to 30 s (`97ed240`); 15 of 15 pass |

Seen and not caused by this task: `tests/test_golden_set.py::test_the_set_is_ten_styles_with_truth` fails (the trips dataset's style list, T153, untouched by R1 to R4), and app lint still reports the one `ExploreMap.jsx` hook dependency error that predates R4.

## What is still open

- **T782-a (owner).** Ready to deploy: rating v5 (R1 to R4) is merged and the shared master re-scored; persona gate 7 stands at 87 of 120 (72.5%, FAIL against 80%), so For you ships as a sort, not the default (T765-b). Deploy to Pages only after deciding on T765-b. The POI shards and nature wires on the data host still carry the old labels until `npm run data:push` (from `continent-app`) runs with the deploy.
- **T761-a (stays open).** The box's fee harvest is still running (8,640 of 44,755 on 2026-10-28 at 15:40). When `pgrep -f harvest_poi_fees.py` on `carta@46.225.237.75` returns nothing: check that `logs/t761_poi_fees.log` ended cleanly and count the answers in the box's `cache/poi_fees.json`; `git pull` the merged `main` in `/home/carta/carta` (never discard the box's caches or data); run `python3 pipeline/score_significance.py apply` (it calls `poi_labels`, which reads the fee tags) and the rest of this report's chain; copy `cache/poi_fees.json` and the changed outputs back; run `sync-data`, `build_dossier.py --all`, `npm test`, the contract check and one fast build; open one POI page that should say Free; commit on `main`, push, and write `Execution/P7/T{n}-rating-v5-box-fees.md`.
- **T782-b.** `tests/test_golden_set.py::test_the_set_is_ten_styles_with_truth` fails: the trips dataset's ten styles no longer match `TRIP_TYPES` (T153's golden set).

## Rollback procedure

The code: `git revert -m 1` the four merge commits in reverse order on each repo (app `654b9ec`, `6e30c76`, `932d935`, `6d8b9d1`; root `a677e589f`, `65b8e1c98`, `fa80098e3`, `064e9f65e`), and revert this task's data commit `01097d539`. The shared master is not in git: restore `<scratchpad>/t782-backup/app_data.pre-t782.json` over `app_data/app_data.json` (the scratchpad is temporary; copy it somewhere lasting if a rollback is likely), then `node continent-app/scripts/sync-data.mjs` and `python pipeline/dossier/build_dossier.py --all`. Nothing was deployed.
