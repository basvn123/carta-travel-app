# Report: data wave 2 (fix programs, data)

Status: **judged, not merged on its own.** After three judge loops, nine of eleven lines score 4. R8 (trail names, D7, carried from wave 1) and R10 (G2 drafted labels, D4) score 3, each on small, exact defects listed in `judgement-3.md`. Crew's limit of three loops applies, so those fixes are wave 3 step 0. Waves 1, 2 and 3 merge into `p15-fix-programs` together only when every line, carried lines included, is at 4 or more.

This wave answers: does the place wire the box publishes carry correct beds, heroes, stamps and trail names, and would a silent drop like the 2026-11-13 bed incident now stop the publish? Done when every line is at 4 and the waves merge.

## What changed and why
- **Bed sanity (1.4, K-12, D10):** `bed_rules.clean_all` applies tier order, a 10 EUR floor, a thin-sample rule (under 3 listings) and a 3x country median. Both build and apply use it. Replay over 3,353 real records: out-of-order places 519 to 0, under the floor 9 to 0, measured share loses 0.42 points. A dorm above hotel3 drops only the dorm, because the hotel price is the measured anchor (a recorded deviation). Star pairs drop both tiers and cost 0.08 points.
- **Hero bans (1.5, D17):** one list in `pipeline/photos/hero_bans.py`, used by `correctness.py`, the audit, the `harvest_images.py` patch and a D2 soft rule. Replay: 29 banned heroes; 17 replaced from the gallery (0.44%); 12 kept and listed for T1198-f.
- **Stamps (1.3, D3, D12):** `provenance.asof_for` is table-driven. On the box master copy, distinct `_asof` values go from 1 to 8. Weekly master writers (`country_context_layer.py`, `place_taste_profile.py`) now stamp `generated_at`. The app_data age limit is 16 days (was 35).
- **D2 rules (1.2):** taste on rated places, `generated_at` age (hard), wrong heroes and the Square kind (soft). Today's wire fails dorm>hotel3 (35) and age (168.5 days) until the box rebuild. That is intended and covered by owner steps.
- **Airports (1.1, D1, D3):** the end-to-end chain runs on a committed fixture. The key stays `pending` until ship 1, and the flip is one line (node test).
- **F-21 (D18):** the climate method text is built from the harvest's own constants (2017 to 2022, 20 km).
- **G3 drift gate (D2):** `scripts/quality/drift.py` computes PSI and the share delta per key field, with limits in `rules.yaml`. A wire against itself passes. The 2026-11-10 box master against the local wire fails (measured beds 3,340 to 8). The incident simulated in memory fails at -80.34 points. `publish_guard.py --previous` runs the gate, and `scripts/ship.mjs` passes the previous wire when one is kept.
- **G2 labels (D4):** `evals/truth/draft.csv` has 69 drafted or `unverifiable` rows, each with a source. Trail rows drafted: 10 of 27. `evals/truth/agreement.py` computes kappa and coverage. The owner step is in `docs/owner/`. **Open (R10):** image rows are left out of the kappa, so a full sheet gives 19 kappa rows, not the 25 the docs claim.
- **Trail names (D7, wave 1 carry):** start segments stay whole or are cut at a boundary. Main trails keep their bare name, and stage variants are distinct. The replay ACCEPTs: start_tail_cut 0, mid_word_loss 0, head_cut 0, too_long 0, id_suffix 5, end losses 84 (all over the cap). **Open (R8):** about 20 names end on a function word that `_DANGLING` misses, and one id suffix is avoidable.
- **Step 0:** the `harvest_place_intros` import is loaded by path, the `pipeline_tasks.json` fixture is refreshed for `stays`, and `scripts/ship.mjs` runs the publish guard before the data upload.
- **G4/G5:** `errors.md` covers 50 distinct failures grouped by cause, with country slices. The biggest group is walks named only by a code (508). They need a name source and are in the backlog as G4-1.

## Checks
- pytest over the wave files plus `pipeline/stays/tests`: 246 passed, 1 failed. The failure is `test_registry_doc_and_enum_are_current`: yaml cannot be imported under `python -I` on this laptop, an environment baseline. `tests/test_trailslab_push_due.py` also fails 4 tests on main.
- ruff is clean, `check_entry_points` is OK, docs `drift.py` reports 0. Node tests `ship` and `airportsFlip`: 18 of 18.
- Not run: the full `npm test` and full pytest (they take hours here), and anything on the box.

## Changed files
`.gitignore`, `ROADMAP.md`, `docs/HANDBOOK.md`, `docs/owner/data-and-pipeline-runs.md`, `continent-app/tests/airportsFlip.test.mjs`, `continent-app/tests/ship.test.mjs`, `scripts/ship.mjs`, `evals/truth/agreement.py`, `evals/truth/draft.csv`, `pipeline/apply_climate.py`, `pipeline/audit/audit_hero_images.py`, `pipeline/country_context_layer.py`, `pipeline/dossier/harvest_place_intros.py`, `pipeline/harvest_images.py`, `pipeline/photos/correctness.py`, `pipeline/photos/hero_bans.py`, `pipeline/place_taste_profile.py`, `pipeline/provenance.py`, `pipeline/stays/apply_stays.py`, `pipeline/stays/bed_rules.py`, `pipeline/stays/build_stays.py`, `pipeline/stays/tests/test_stays.py`, `pipeline/stays/tests/test_weighting.py`, `pipeline/trails/names.py`, `scripts/freshness_report.py`, `scripts/quality/beds_replay.py`, `scripts/quality/drift.py`, `scripts/quality/engine.py`, `scripts/quality/hero_replay.py`, `scripts/quality/publish_guard.py`, `scripts/quality/rules.yaml`, `scripts/quality/trail_names_replay.py`, `tests/fixtures/airports_chain_wire.json`, `tests/fixtures/pipeline_tasks.json`, `tests/test_airports_chain.py`, `tests/test_bed_rules.py`, `tests/test_climate_method_text.py`, `tests/test_hero_bans.py`, `tests/test_place_intros.py`, `tests/test_provenance.py`, `tests/test_publish_guard.py`, `tests/test_quality_drift.py`, `tests/test_quality_scorecard.py`, `tests/test_trail_difficulty_names.py`, `tests/test_truth_agreement.py`, `tests/test_wire_stamps.py`.

Also from the wave-start merge of `origin/main` (no conflicts): `continent-app/src/lib/homeVisit.js`, `continent-app/src/styles/06-boot-splash.css`.

## Owner steps
In `docs/owner/data-and-pipeline-runs.md`:
- steps 1.6 (box rebuild of app_data) and 1.7 (ship 1, then the airports flip)
- steps 9 to 11: keep the last published wire for the drift gate; verify the 50 drafted rows, then run `agreement.py`

## Undo
`git revert` the wave commits (`git log --oneline 82007fd9cc..094e62878d`, non-merge). No migration; schema stays 20.

## Next step
Wave 3 step 0 (judge-3 fixes), then the wave 3 outdoor row and one difficulty.
