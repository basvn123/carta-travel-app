# Run report · Plan rethink (G12)

Status: **merged to main (`ec18039bb6`) and shipped 2026-11-25** (`node scripts/ship.mjs --live`: data, preview, main, prune all done; nothing to prune). Judge 3 passed at 68 of 85; browser pass and early results after it.
Run folder: `.work/2026-11-23-plan-rethink/` · level L2 (crew:deep-task) · ROADMAP G12 (with G4 for the budget fix).

## What was asked
Rethink the Plan tab's logic and flow so it creates top-level value. The owner asked for six things:
- Fold in what Explore (travel style, Settings), My trips and Friends already know.
- Serve the missing starts, such as "I already know where".
- Cut only the steps the travel style really answers. The owner's rule, 2026-11-24: for every question, check whether the style captures it; if not, keep the question.
- Let the traveller choose and switch style during the flow.
- Make recommendations "top": not only 3 options, but ways to keep looking.
- Build everything in one go, on a branch.

## What was done
### Plan
Four explorers mapped the work, three proposals were written, and three critics reviewed them. That produced the decision (`decision.md`), which judges 1 and 2 checked: 61, then 68 of 85. The owner approved it with the question rule in §12, and a prototype was published as a private artifact.

### Build
Nine stages ran with one builder at a time (B1 to B7b, plus a fix round), giving 34 commits and one merge of `origin/main`.
- **B1:** one budget basis (the bug fix); the `PlanSeed`; Explore's set flags; holding a style for one trip.
- **B2:** one `openPlan` for every door in the app; the town is kept; "Add to <trip> / New trip"; booked parts shown as "Betaald · Nog te plannen".
- **B3:**
  - the door on Plan home;
  - the §12 question rule;
  - the style control on every step;
  - the assumption bar;
  - recommendations: rank 1 is the pure best, then a diverse top 5, then themed rows.
- **B4:**
  - "I already know where" lands on a priced found trip;
  - open-jaw;
  - levers;
  - alternatives by relation: Cheaper, Another month, Another country, Closer.
- **B5:**
  - days prefilled from the style;
  - the budget compass: "Net erover" (up to 3 trips within +10%) and "Geld over";
  - the price delta on a change, with Undo;
  - "More / Less like this".
- **B6:**
  - the finder honours booked flights and stays;
  - "Plan again" from a past trip, with own spend as a reference line only;
  - the rows Something new, Like your past trip and Like your saved.
- **B7a:**
  - merged main;
  - the From Carta row and Another month behind "Search more";
  - the phone map tab;
  - the Friends seam.
- **B7b:**
  - the wizard folded after a parity checklist, with three abilities moved first; 280 dead keys removed;
  - "Plan this trip" in Vrienden;
  - DOM checks;
  - docs.

### Verify
Judge 3 scored the build 68 of 85, with every criterion at 4. It found one medium bug and five low ones. All six are fixed in `6a2f33f39f`.

## Checks
- **CI (Linux):** the `app` job (lint, the full `npm test`, the fast build) is green on every pushed stage. `python` fails on `test_pipeline_tasks_registry` (the ask_index snapshot), the same as on main; the branch touches no Python.
- **Local:** pure node tests pass; lint shows 0 errors and 27 warnings, as before; the fast build passes; the docs checks pass; i18n parity holds. The DOM checks pass at 390, 820, 1180 and 1440, and the 320 to 1600 px sweep shows no sideways scroll.
- **Not verifiable locally:** the vite-based tests hang on this machine, on main too. The cause is partly Vite crawling the 1.3 GB `public/` folder on the first resolve (measured); a second stall was not found (see `progress.md`). CI is the arbiter for those tests.
- **Not checked:** no human browser pass; the place lander and a traveller with a style set are not in the DOM checks; phone pricing time is estimated, not measured.

## After the judge (2026-11-25)
### Browser pass
The flows were walked in Chromium at 390 and 1440. Ten defects were fixed:
- the When chip;
- the bar gutter;
- the From chip;
- a question asked twice;
- a ceiling keeping trips that were already over it;
- a typed booking sentence becoming the budget;
- the cheaper week jumping to January;
- an empty likes or avoid list asked anyway;
- per-person and group rounding;
- a day budget reading every trip as "Not yet".

The DOM checks now also cover the place lander, a traveller with a style, booked trips and money left.

### Early results (owner decision)
On an emulated phone (4x CPU, Fast 4G), rank 1 appeared after a median of 7.7 to 10.9 s. It now shows as soon as it is proven final, and that wait drops to 4.8 to 7.8 s with no budget. A shown card never moves, and in 90 runs rank 1 never changed once shown.

A per-trip price floor was built to get the same under a budget. It is proven correct with 600 generated lists, but it was slower on the phone at 6x, so it is switched off (`PRICE_FLOORS = false`). The code and its tests stay.

### CI
On head `3f6a05670f`, `app` is green. `python` fails on the same snapshot test as main.

### Still open
- No real device has been measured.
- A real upload through `parse-booking` is not verified.
- Flights use the nearest day with a fare rather than the trip's dates (T855, older than G12).
- The DOM check for the place lander at 390 failed once and passed on rerun.

## Owner decisions made during the run
- Approved the direction.
- Open-jaw is built now.
- "Net erover" shows up to 3 trips within +10%.
- Own past spend is shown as a reference line.
- Everything is built in one go.
- The budget bug is fixed now.
- The question rule.
- Style switching in the flow.
- Recommendations beyond 3 options.
- Pushing the branch so CI can verify it.

## Orchestrator calls the owner can reverse
- When the flight is "Not yet" in both quotes, a lever shows a saving on the lines it changes, for example "€40 less for beds", never as a cheaper trip.
- A Vrienden group's band is a guide (soft), not a ceiling.

## Deferred
Listed under the ROADMAP G12 status:
- a friends card on the door;
- AskChat and AskTripCard passing a seed;
- composed trips reachable outside Explore;
- the place lander and a styled traveller in the DOM checks;
- measuring pricing on a phone.

## Changed files
The full list is in the branch: `git diff --stat $(git merge-base p15-plan-rethink origin/main)..p15-plan-rethink`. It covers 156 files, with 7,275 lines added and 9,657 removed; the removals are mostly the wizard fold.

Main new files, in `continent-app/src`:
- `lib/plan/`: `seed.js`, `seedWriters.js`, `askSeed.js`, `bookedReceipt.js`, `openJaw.js`.
- `lib/budgetBasis.js` and `lib/price/receiptDiff.js`.
- `lib/recommend/`: `diversify.js`, `rows.js`, `alternatives.js`, `budgetCompass.js`, `moreLess.js`, `moreSearch.js`.
- `lib/flights/flightChoices.js` (moved).
- `planner/flow/`: `StyleBar.jsx`, `AssumptionBar.jsx`, `PlanDoor.jsx`, `daysPrefill.js`.
- `planner/trip/OpenJawToggle.jsx` and `shell/PlanHereChoice.jsx`.

New outside `src`:
- `scripts/verify_plan_rethink.mjs` and `scripts/perf/finder_rank1_G12.mjs`.
- New node tests in `continent-app/tests/`.

Deleted: `GuidedTripWizard`, `planner/wizard/*`, the E12 modal and `pendingTripSeed`.

Docs: `docs/HANDBOOK.md` (Plan section and Travel styles 15b to 15u), `ROADMAP.md` (G12, G4), `docs/project-map.md` and `docs/SCHEMA.md`.

Not a change: `scripts/vite.fast.mjs.timestamp-1795534893716-57dd761d562198.mjs` is a temporary bundle Vite writes during a fast build and deletes afterwards. It is not in the repo.

### Follow-ups after the ship (2026-11-26)
The follow-ups were merged to main as `314a6dffaf`:
- `p15-plan-followups`: Plan with <group> on the door.
- `p15-flights-dense`: exact-day flights (T855) and the denser sweep (D10).

Their files are listed in those branches' commits.

Deploy steps, per `docs/owner/flights-dense-deploy.md`:
- `python run_pipeline.py --only flight_routes` uploaded the ranked `_routes.json` to R2.
- The flight-sweep Worker was deployed.
- The site was shipped.
- On the box, the late-sweep code was updated and its service restarted.

The pipeline run touched these tracked files as a side effect. All were restored with `git checkout --` before the ship, so none is changed in the repo:

| File | What changed | Why |
|---|---|---|
| `continent-app/src/admin/pipelineOverrides.json` | run timestamp | the pipeline runner records each run; restored |
| `data/derived/freshness_report.json` | freshness timestamps | post-run freshness check; restored |
| `data/flights/_airports.json` | `built` timestamp only | `build_routes.py` rewrote it; restored (R2 has the new copy) |
| `data/flights/_routes.json` | `built` timestamp only | `build_routes.py` rewrote it; the ranked copy is on R2 and the committed file already has `rank`; restored |
| `data/reports/evals/history.jsonl` | one appended eval line | the runner's post-run evals; restored |
| `data/reports/evals/latest/ask-docs.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/ask.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/data-quality.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/injection.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/linking.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/parse-booking.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/plan-day.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/suggest-city.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/taxonomy.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/trail-summaries.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/trails-external.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/trips-golden.json` | eval result of this run | post-run evals; restored |
| `data/reports/evals/latest/truth.json` | eval result of this run | post-run evals; restored |
| `docs/reference/evals.md` | the eval dashboard | post-run evals; restored |
| `docs/owner/auth-settings.md` | not changed by this run: an uncommitted edit (8 lines added, 3 removed) appeared in the shared checkout on 2026-11-26 from another session | left untouched for its owner; not part of G12, T855 or D10 |

## Undo
- Not merged: delete the branch.
- After a merge: `git revert -m 1 <merge commit>`.
- There is no data migration and no schema change.
- The choices a traveller made are kept: the `when_set` and `nights_set` flags are additive and inferred for existing accounts.
