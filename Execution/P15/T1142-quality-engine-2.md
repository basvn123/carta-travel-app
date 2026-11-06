# T1142: Quality engine part 2, rules, run gate and the Data health panel (ROADMAP D2, session S58)

## Date

2026-11-06

## What changed

The data quality scorecard from T1134 is now a gate. `scripts/quality/rules.yaml` holds one rule for every field the scorecard measures, 75 in all across the 12 layers: 42 `must_see` fields (what a traveller sees on a card or page, all `hard`) and 33 `must_have` fields (`soft`, they warn), each with a floor set two points under the shipped share. `scripts/quality/engine.py` builds the card, checks it against the rules and fails (exit 1) when a must_see field falls by more than 2 percentage points against the last passing card or a hard rule is under its floor; a scorecard field with no rule is a configuration error (exit 2). It writes the card, a history line that now carries every field's share and the gate result, and `panel.json` with the 90-day trend; a failed run is never used as the next baseline. `run_pipeline.py` runs it after the ship and adds `quality` to the failed tasks when it fails. The admin page has a new Data health tab (`DataHealth.jsx`) with the gate result, the card, one trend chart per layer and the must-see field table. A seeded 3-point drop on `core.blurb` against the real shipped data fails the gate; on the shipped data it passes (75 rules, 0 failed, 0 warnings).

## Research

None chosen. The rules format is the one ROADMAP D2 and T1134-c proposed (YAML, hard or soft, with a floor), placed in `scripts/quality/` next to the scorecard because the brief names that folder rather than `pipeline/quality/`. PyYAML 6 is already in the environment. The panel reuses the admin page's existing classes (`adminpage-spark`, `adminpage-table`, `adminpage-tiles`) and the English-only, owner-only pattern of `PipelineHealth.jsx` and `PriceProvenance.jsx`.

## Files touched

- Created: `scripts/quality/rules.yaml`, `scripts/quality/engine.py`, `tests/test_quality_engine.py` (8 tests), `data/reports/quality/panel.json`, `continent-app/src/components/admin/DataHealth.jsx`, `continent-app/src/admin/dataHealth.json` (the panel snapshot), `continent-app/tests/dataHealth.test.mjs` (4 tests), this report.
- Modified: `scripts/quality/scorecard.py` (`write_card()` shared with the engine; history lines carry field shares and extra keys; docstring), `run_pipeline.py` (the hook call only, after the freshness report), `continent-app/src/admin/AdminPage.jsx` (tab `health` and its route), `continent-app/src/i18n/en.js` (one key, `admin.nav.health`), `continent-app/scripts/verify_admin_panel.mjs` (step 9h, Data health), `data/reports/quality/2026-11-06.json`, `.md` and `quality_history.jsonl` (the after card), `docs/HANDBOOK.md` (new section "Data quality scorecard and gate" and its contents line), `ROADMAP.md` (D2 status), `Execution/_OPEN.md` (rows T1142-a to h).

## Commands run

```
python -I scripts/quality/engine.py --now 2026-11-06T18:00:00Z           # check only: PASS
# seeded drop: copy data/reports/quality to a scratch dir, append a passing history line with core.blurb 3 points higher
python -I scripts/quality/engine.py --out <scratch> --now 2026-11-06T18:00:00Z --write --no-snapshot   # FAIL core.blurb fell 3.0 points, exit 1
python -I scripts/quality/engine.py --out <scratch> --now 2026-11-06T19:00:00Z                         # still FAIL: the failed run is not the baseline
python -I scripts/quality/engine.py --write                               # the after card, history line, panel and snapshot
python -m pytest tests/test_quality_engine.py tests/test_quality_scorecard.py -q
ruff check scripts/quality tests/test_quality_engine.py tests/test_quality_scorecard.py
python -I scripts/docs/drift.py
cd continent-app && npm ci && npm test
npx eslint src/components/admin/DataHealth.jsx src/admin/AdminPage.jsx tests/dataHealth.test.mjs
npx vite --port 4192 --strictPort    # then a scratch page mounting DataHealth, checked with Playwright at 1440 and 390 (files deleted after)
```

## Config and secrets set

None. New optional variable `CARTA_QUALITY_OUT`: the engine's output folder (default `data/reports/quality/`). The box should set it (owner step T1142-f).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Scorecard fields with a rule | 0 of 75 | 75 of 75 (42 must_see hard, 33 must_have soft) | +75 |
| Run fails on a must_see drop of more than 2 points | no | yes (seeded 3.0 point drop on `core.blurb` fails with exit 1) | new |
| Gate on the shipped data (`continent-app/public`, 2026-11-06) | n/a | PASS, 0 failed, 0 warnings | new |
| Scorecard runs per pipeline run | 0 (by hand, T1134-a) | 1 (hook in `run_pipeline.py`) | +1 |
| History line carries field shares and gate result | no | yes | new |
| Runs in the 90-day trend | 1 (no trend view) | 2 (shown per layer in the admin panel) | +1 |
| Admin tabs | 9 | 10 (Data health) | +1 |
| Gate run time on the shipped data | n/a | 5.3 s (all in the scorecard build) | new |
| Quality pytest | 6 passed | 14 passed | +8 |
| `npm test` (continent-app) | 1559 passed (before the new file) | 1563 passed, 0 failed | +4 |

The scores themselves did not change: the after card is the T1134 card on the same shipped data (core 70.5 %, flights 57.6 %, prices 72.9 %, rating 80.4 %, climate 64.1 %, place 58.3 %, imagery 74.2 %, trails 81.5 %, beaches 96.8 %, lakes 98.9 %, mountains 100 %, cycling 97.2 %).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A rerun after a failed gate would pass | the failed card became the next baseline, so the drop read as 0 | history lines carry `gate_ok`; the baseline is the latest line with `gate_ok` true (a card file with `gate.ok` false is skipped too) |
| The first run had no field history | T1134's history line has layer numbers only | the baseline falls back to the latest dated card file, which has `fields` |
| The box would lose the history every week | `weekly.sh` runs `git reset --hard` before each run, which puts the tracked `quality_history.jsonl` back | `CARTA_QUALITY_OUT` moves the output under `logs/` on the box (owner step T1142-f) |
| An empty shard layer in a fixture failed every hard rule | a layer with no records reads null | null is "not measured": a hard rule fails, a soft rule warns; tests use soft rules for layers the fixture lacks |
| The must-see table counted 0 rows in the render test | its rows had no attribute to count | rows carry `data-rule` |
| Trend charts made each table row 97 px tall | `.adminpage-spark` is sized for the Overview card | inline height 28 px and width 96 to 180 px in the table; row 57 px |
| `verify_admin_panel.mjs` cannot reach the admin page in the cloud container | the app's first load fetches `data/flights/*.json` from `data.carta-europetravel.com`, which this container cannot reach, and stops at "We couldn't load Carta's travel data" before the account door | the step is in the script for a local or box run (T1142-e); the panel was checked in a browser by mounting it alone on the dev server |

## Screens checked

Admin, Data health tab, at 1440 x 900 and 390 x 844, in Chromium on the dev server with the panel mounted alone inside `.adminpage .adminpage-body` and the real stylesheets (the full app could not load here, see above). DOM check at both widths: 12 layer rows, 12 trend charts, 2 bars in the core trend (one per run), gate `pass` with "Quality gate passed: 75 rules, 0 failed, 0 warnings", 42 must-see rows, no page errors, no sideways page scroll (the tables scroll inside their own wrapper, as the other admin tables do). `continent-app/tests/dataHealth.test.mjs` renders the shipped snapshot, a failed gate and the empty state, and checks the tab is routed. Screenshots stayed in the scratch folder. For the end check: the Data health tab through the real admin flow, at phone and desktop width (`node scripts/verify_admin_panel.mjs`, step 9h) where the data host is reachable.

## What is still open

- T1142-a: the audit scripts ROADMAP D2 names (`audit_quality.py`, `audit_gaps.py`, `dossier/audit.py`, the image audits, trails freshness) are not folded into the rules.
- T1142-b: rules gate completeness only. Validity, freshness and rating accuracy are on the card but no rule reads them; a hard freshness rule would fail every run today (`app_data` is 152 days old against 35).
- T1142-c (owner): confirm the must_see and must_have split and the floors in `rules.yaml` (carries T1134-g: `tags`, `wikidata` and `transfer` are must_have with floor 0 because they are on 2 %, 1 % and 3 % of places).
- T1142-d: the panel imports its snapshot at build time. On the box the reset puts the committed snapshot back before each build, so the panel shows the last committed card until it fetches `panel.json` at run time (for example from the R2 `status/` prefix next to `freshness_wires.json`, which needs `push_status.py` and a public path, outside this task).
- T1142-e: `verify_admin_panel.mjs` step 9h has not run end to end; run it where `data.carta-europetravel.com` is reachable.
- T1142-f (owner): on the box set `CARTA_QUALITY_OUT=logs/status/quality` and seed it once with a copy of `data/reports/quality/`, so the history and the drop baseline survive the weekly reset.
- T1142-g: MAP.md does not name `scripts/quality/engine.py`, `rules.yaml` or the Data health tab (adds to T1134-f); MAP.md was outside this task's files.
- T1142-h: `docs/runbooks/drift-and-scorecard.md` still describes the scorecard as not a gate and has no section on the gate or a failed `quality` task; outside this task's files.

## Rollback procedure

`git revert` the T1142 commit. Nothing is one-way: no wire, schema, migration or deploy changed. Reverting removes the hook, so a run no longer fails on quality. The history lines written since stay readable by T1134's scorecard (extra keys are ignored).

## Owner steps (for the checklist)

- [T1142-f] Keep the quality history on the box | `weekly.sh` resets the checkout before each run, which would put the tracked history back and lose the drop baseline | on the box add `CARTA_QUALITY_OUT=logs/status/quality` to the environment the timers use, then once `mkdir -p logs/status/quality && cp data/reports/quality/* logs/status/quality/` | scripts/quality/engine.py
- [T1142-c] Confirm the rules | which fields are must_see (hard, gated on a 2 point drop) and the floors are my call from what each card and page shows | read `scripts/quality/rules.yaml` (the comment on each line is the share the floor was set from); change `level`, `kind` or `min`, or ask a session to | scripts/quality/rules.yaml
- [T1142-d] Decide where the live panel reads from | the panel shows the snapshot the build carried; a run-time read needs a published path for `panel.json` | choose: R2 `status/` made readable to the admin page, or the box commits the snapshot after each run | continent-app/src/components/admin/DataHealth.jsx
