# T1217: Register follow-up sweep, docs (ROADMAP register follow-up (docs), round 3 session S133)

## Date

2026-11-07

## What changed

The docs rows of round 2 (T1165, T1166, T1167) and the docs rows round 3 raised were swept: 37 open `next task` rows in the group, 25 closed, 12 still open with a reason, none moved to the owner. The config reference (`scripts/docs/config_reference.py`) now follows a config handed on as an argument (a default parameter or a call into an imported function), marks provenance and prose keys as notes for people and keys read only by tests as "tests only", enforces three value checks in `--check` (`match.lambda` inside `match.lambda_range`, every `match.conflicts` factor inside `match.conflict_range`, rating_anchors.json `bands` equal to rating.json `bands.cutoffs`) and covers `access-ladder.json`: dead keys went from 36 (17 real plus all 19 of slo.json) to 3. The one key proven dead with nothing reading it and a single behaviour in code, recommend.json `month.anyWeather`, was dropped. `build_lineage.py --check` runs in `ci.yml`; the destinfo lineage row names its reader (the Practical Access card, T1203) and the `access_facts` task. MAP.md points to the lineage, request paths and config reference; CLAUDE.md counts the workflows as they are (21 path-triggered, 2 on every push, 2 scheduled or by hand). SECRETS.md has rows for the price alert secrets and SENTRY_DSN; the plan-day README follows `GEMINI_CHAIN`; the seasons catalogue has closure rules SEASON-037 to SEASON-040. Zensical 0.1.0 was tried on the site config and builds it unchanged.

## Research

One method choice (T1167-d, the docs site generator), by a research subagent with a build trial in the scratchpad:

| Option | Version (2026-11-07) | Licence | Status | Fit |
|---|---|---|---|---|
| MkDocs Material, pinned | 9.8.0 pinned, 9.8.1 out | MIT | PyPI "7 - Inactive", end of support 2026-11-05; requires `mkdocs<2`, so MkDocs 2.0 is never pulled in | No migration; no fixes ahead |
| Zensical | 0.1.0 (2026-11-05) | MIT | Beta for about three months; reads mkdocs.yml "indefinitely" (its FAQ) | Built a copy of mkdocs.yml and docs/ unchanged: exit 0, 153 pages, 5.7 s cold and 2.8 s warm (MkDocs 6.1 s); search goes to `search.json`, not `search/search_index.json`; `validation:` ignored; 69 anchor warnings, all in reference/supabase.md (MkDocs logs the same at INFO) |
| Astro Starlight | 0.42.10 on Astro 7.4.7 | MIT | Very active | Does not read mkdocs.yml: a Node project, a hand sidebar, frontmatter titles on 153 pages, a Mermaid plugin; a rewrite |

Choice: keep the 9.8.0 pin now, switch to Zensical when its beta ends (row T1217-c), rule out Starlight. Sources: https://zensical.org/docs/compatibility/mkdocs/plugins/ , https://zensical.org/docs/community/faqs/ , https://newreleases.io/project/pypi/zensical/release/0.1.0 , https://github.com/squidfunk/mkdocs-material/issues/8523 , https://astro.build/blog/whats-new-august-2026 . zensical.org itself was blocked by the proxy; its claims come from search snippets.

Everything else picked nothing new: the generator changes follow the existing code.

## Files touched

- Modified: `scripts/docs/config_reference.py`, `docs/reference/config.md` (generated), `docs/reference/README.md`, `docs/reference/python.md` and `docs/reference/tasks.md` (regenerated), `docs/architecture/lineage-fields.json`, `docs/architecture/lineage.md` (generated), `docs/logic/seasons-crowds.md`, `docs/security/SECRETS.md`, `supabase/functions/plan-day/README.md`, `continent-app/config/recommend.json` (one dead key removed), `.github/workflows/ci.yml` (one step, the row names it), `MAP.md`, `CLAUDE.md`, `ROADMAP.md` (B4, B5, B6 status), `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`.
- Created: `tests/test_config_reference.py`, this report.

## Commands run

```
python -I scripts/docs/config_reference.py          # Wrote docs/reference/config.md: 336 keys, 3 dead
python -I scripts/docs/config_reference.py --check  # Config reference OK: 336 keys in 8 files
python -I scripts/docs/build_lineage.py && python -I scripts/docs/build_lineage.py --check
python -I scripts/docs/build_reference.py && python -I scripts/docs/build_reference.py --check
python -I scripts/docs/drift.py                     # 761/761 constants, 407/407 tests, 0 drift
python -I scripts/docs/check_entry_points.py        # Entry points OK: 247 paths
ruff check scripts/docs/config_reference.py tests/test_config_reference.py
python -m pytest tests -q (minus tests/quarantine.txt)
cd continent-app && npm ci && npm test && npm run lint
```

## Config and secrets set

`continent-app/config/recommend.json`: `month.anyWeather` ("rating") removed. No code read it; `bestMonth` (lib/recommend/candidates.js) has a single no-weather branch, the best month score, which docs/logic/recommendation.md REC-029 already describes. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open docs rows in the group | 37 | 12 | -25 |
| Rows closed / still open / moved to owner | | 25 / 12 / 0 | |
| Config files in the reference | 7 | 8 (access-ladder.json) | +1 |
| Config keys in the reference | 326 | 336 | +10 (11 ladder keys, 1 dropped) |
| Keys listed dead | 36 | 3 | -33 |
| slo.json keys with a reader found | 0 of 19 | 14 of 19 (`version` and the 4 `sources.*` are notes for people) | +14 |
| Keys marked "tests only" | 0 | 8 (stability 3, ladder sources 5) | +8 |
| Value checks in `config_reference.py --check` | 0 | 3 | +3 |
| Docs checks in ci.yml python job | 4 | 5 (lineage) | +1 |
| Seasons catalogue rules / constants found | 36 / 747 | 40 / 761 | +4 / +14 |
| npm test | | 2,056 pass, 0 fail, 12 skipped | |
| pytest (minus quarantine) | | 1,174 pass, 2 fail (T1207-h, pre-existing), 13 skipped | |
| eslint | | 0 errors, 14 warnings (none in touched files) | |
| Generator run time | about 10 s | about 7.6 s | |

T1165-s, measured: of 221 fields inside pricing rule object values, 67 are not named in their rule's reader files; every one is a lookup table entry read by index (country codes, tiers, profile names, place classes) or a computed name (`cfg[`${key}_g_pkm`]` in footprint.js), except `stay.repair.method`, which is its own open row. No config key is read through a computed name (`cfg(f"...")`, `rule(`...`)`): grep finds none. So neither limit hides a dead field today; the row is closed on that measure.

## Rows, one line each

Closed by T1217 (25):

- T1165-a, k, n, p, q (`version` in pricing, rating_anchors, recommend, slots, rules.yaml): provenance read by people; listed as "note for people", not dead.
- T1165-c, d (`match.lambda_range`, `match.conflict_range`): wired as bounds; `--check` fails when lambda or a conflict factor leaves its range (tested).
- T1165-e (`depth.categories_from`): a provenance sentence (T761), a note.
- T1165-h, i, j (`stability.*`): decided to keep in rating.json beside the numbers the gate protects; tests/test_rating_stability.py reads them, now shown as "tests only".
- T1165-l (anchor `bands`): read by the rubric session by hand; `--check` now fails when it drifts from rating.json `bands.cutoffs` (equal today).
- T1165-m (anchor `calibration`): decided: the calibration places are a reference the rubric session reads by hand (HANDBOOK, Appeal), not fact cards; rating_fact_cards.py builds cards for anchors only, by design.
- T1165-o (`month.anyWeather`): dropped, see Config.
- T1165-s: measured, see above.
- T1166-a: `build_lineage.py --check` in ci.yml (0.8 s, passes).
- T1166-g: MAP.md names lineage.md, request-paths.md, build_lineage.py and config_reference.py.
- T1167-b: already done by T1154: docs/reference/openapi.md is generated from services/intelligence/openapi.json and has its README row.
- T1167-c: decided: keep docs-site.yml regenerating python.md and app-lib.md; no merge-time committing job (it needs a bot with push rights on main); written in docs/reference/README.md.
- T1167-d: Zensical tried and builds (Research); the switch is T1217-c.
- T1202-e: SEASON-037 to SEASON-040 in docs/logic/seasons-crowds.md, all constants and tests found by drift.py.
- T1206-g: plan-day README chain table and GEMINI_MODEL default follow `GEMINI_CHAIN`.
- T1211-d: argument aliases in config_reference.py; slo.json dead keys 19 to 0.
- T1211-h: SECRETS.md rows for PRICE_ALERTS_LINK_SECRET, PRICE_ALERTS_BOX_SECRET, PRICE_ALERTS_FROM and ENABLED, SENTRY_DSN.
- T1215-e: CLAUDE.md Checks counts the workflows as they are.

Still open (12):

- T1165-b (`stay.repair`): reading the method needs continent-app/src/lib/costIndex.js (app code); dropping it would orphan HANDBOOK "Bed price per night" item 8 and the costIndex comment.
- T1165-f, g (`bands.top_share_*`): the check needs pipeline code and the box's rated catalogue; dropping a calibration target is not a docs call.
- T1165-r (`_doc` siblings): changes every config file, which this brief allows only to remove dead keys.
- T1166-b, c, d, f: read or drop wire fields, schedule writer scripts, restore writers: pipeline and app changes, out of a docs sweep.
- T1166-e: half no longer true (destinfo is read by the Practical Access card since T1203, lineage updated); joins.json is still shipped with no fetch, a pipeline or app decision.
- T1167-e: comments on src/lib exports are app code edits.
- T1213-c: the config_reference half is done (access-ladder.json in the reference); the admin view half needs app code (T1109-b).
- T1205-e: the ARTICLE30 half is already true (activity 25, table rows for price_alerts and price_alert_consent); export_user_data() needs a migration and the privacy page is app code.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| tasks.md went stale after the lineage edit | build_reference.py reads lineage-fields.json for each task's wire files, so adding `access_facts` to destinfo changed tasks.md | Regenerated; CI's `build_reference.py --check` would have failed otherwise |
| Row ids of a list were "named" by unrelated tests (`beds` in budgetSearch.test.mjs) | tests_naming matches any mention | "tests only" uses a stricter tests_reading: the test must load the config and name the key, or the list for a row |
| First NOTES entry missed `depth.categories_from` | It sits under `depth`, the register row's section was misread as `match` | Key corrected |
| pytest import error on psycopg in a fresh container | The package is not preinstalled | pip install; not a code issue |

## Screens checked

None: nothing a traveller sees changed (one unused config key removed, verified by npm test).

## What is still open

The 12 rows above, plus T1217-a (plan-day index.ts comment names the old default), T1217-b (ai_models.json not in the config reference), T1217-c (switch to Zensical after its beta), T1217-d (69 broken anchors in reference/supabase.md, fix in build_reference.py). Two pytest failures are the known T1207-h (data files missing in a cloud checkout).

## Rollback procedure

`git revert` of the T1217 commits on `p15-s133-sweep-docs`. Nothing is one-way; the removed `month.anyWeather` comes back with the revert.
