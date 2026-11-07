# T1197: Link and page health

ROADMAP item D16 (round 3 session S113, batch 13).

## Date

2026-11-07.

## What changed

Carta now has a weekly link checker. `pipeline/link_health.py` collects every outbound link and image URL in the shipped wires (88,718 distinct on 2026-11-07, 79,910 of them images), checks them politely and keeps a resumable state. The admin Data health tab shows totals by kind and the broken links with the item that uses each, with a Fix and a Drop action that draft a hand correction through the existing override flow (I13). The share of broken links is a D2 rule: a warning above 2%, a failed run above 10%, silent until 500 links have a result. The task `link_health` is registered in `run_pipeline.py` (weekly, soft, before `photo_sources`). Proven on fixtures; a sample against the real hosts is blocked by this container's proxy, so the first full run is an owner step.

## Research

Question: which tool for about 89k URLs, polite, robots-aware, resumable, on the owner's Windows box. A research subagent compared:
- Own code on `requests` (Apache-2.0) plus stdlib `urllib.robotparser`: already a dependency, runs on Windows, redirect chain by hand, full control of pacing and resume. Chosen.
- stdlib `urllib` only: no dependency but more code for pooling and timeouts, no gain.
- `httpx` with asyncio (BSD-3): works, more complexity for no gain at this scale (rate limit per host dominates).
- lychee (MIT/Apache-2.0, https://github.com/lycheeverse/lychee): good per-host interval, but its README does not show robots.txt, per-URL redirect chain or resume; kept as a possible one-off cross-check.
- linkchecker (GPL-2.0) and muffet (MIT): crawl-oriented, not a URL-list checker.
Wikimedia policy (descriptive user agent with contact, honour 429 and Retry-After, gentle pace) was read from search snippets and mirrors only, because the canonical pages are not reachable from this container. Confirm against https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy before the first run (owner step T1197-b).

## Files touched

Created: `pipeline/link_health.py`, `pipeline/config/link_health.yaml`, `continent-app/src/components/admin/LinkHealth.jsx`, `continent-app/src/components/admin/linkFix.js`, `continent-app/src/admin/linkHealth.json` (empty snapshot), `tests/test_link_health.py`, `continent-app/tests/linkHealth.test.mjs`.
Modified: `run_pipeline.py` (task `link_health`), `scripts/quality/rules.yaml` and `engine.py` (the `links` rule and `_links_gate`), `continent-app/src/components/admin/DataHealth.jsx`, `tests/test_quality_engine.py` (two tests added), `docs/HANDBOOK.md` (section Link and page health), `ROADMAP.md` (D16), `Execution/_OPEN.md`; regenerated `docs/reference/{tasks,python,config}.md` and `docs/architecture/lineage.md`.
No `admin.links.*` i18n keys: the Data health tab is owner-only and English-only by its own header comment (like PipelineHealth and Validation), so six-language keys would be dead strings.

## Commands run

`python -m pytest tests/test_link_health.py tests/test_quality_engine.py`, `ruff check`, `cd continent-app && npm ci && npm test && npx eslint src/components/admin tests/linkHealth.test.mjs && node scripts/ci/design-lint.mjs`, `python -I scripts/docs/build_reference.py`, `build_lineage.py`, `config_reference.py` (then `--check`), `python pipeline/link_health.py collect`, a 12 link sample run.

## Config and secrets set

`pipeline/config/link_health.yaml` (user agent, 1.0 s per host and 0.5 s for Wikimedia, 15 s timeout, 5 redirects, 2 strikes, 28 day recheck, 120 minute budget) and `scripts/quality/rules.yaml` `links` (0.02, 0.10, 500). No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Links checked by Carta | 0 | 0 until the box run | not measured here |
| Distinct links found in shipped data | unknown | 88,718 (79,910 image, 7,566 source, 1,238 official, 4 partner) | counted |
| App tests | 1,886 pass | 1,889 pass, 0 fail | +3 |
| design-lint new violations | 0 | 0 | none |
| Sample against real hosts | none | 12 of 12 answered "unsure" (proxy error), 0 counted broken | proxy blocks hosts; shows a network error never lists a link |
| Coverage per weekly run | n/a | about 14,400 URLs at 0.5 s (Wikimedia) | image set in about six weeks |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A box with no network would mark every link broken after two runs | connection errors counted as strikes | offline guard: a run of 20 or more answers with 80% network errors is discarded; tested |
| A redirect loop read as unsure | classifier ignored `TooManyRedirects` once a chain existed | loops are gone; tested |
| Fix with no new address was "ready" | the draft reused the old address as replacement | only a moved address counts; tested |

Full pytest minus quarantine: 988 pass, 2 fail (`test_rating_inputs::test_beauty_v2_reads_no_register`, `test_rating_stability::test_adding_places_moves_nobody_else`); both read rating data files that are not checked out in this container and touch nothing of this task.

## What is still open

- T1197-a: the first full run on the box, then read the broken list.
- T1197-b: confirm the Wikimedia policy and rate limits against the canonical pages.
- T1197-c: soft 404s (200 with an error page) are not detected; a content probe for official sites would catch them.
- T1197-d: links in lists (activities, members) have no override path (the override grammar has no list positions); fixing them needs the source layer or an override extension.
- T1197-e: confirm the box picks up the weekly task and keeps `logs/status/links` across its git reset (`CARTA_LINKS_OUT` is honoured).

## Owner steps (for the checklist)

- [T1197-a] First full link run on the box | the checker is proven on fixtures only; the real hosts are unreachable from the cloud | on the box run `python pipeline/link_health.py run --limit 500`, read the totals, then let the weekly task continue; commit the refreshed `continent-app/src/admin/linkHealth.json` | docs/HANDBOOK.md "Link and page health (D16)"
- [T1197-b] Confirm Wikimedia's bot policy | the pace (0.5 s per host) and user agent were set from secondary sources | read the Wikimedia User-Agent and Robot policy pages; change `host_delay_s` and `user_agent` in `pipeline/config/link_health.yaml` if they differ | pipeline/config/link_health.yaml

## Rollback

`git revert` the T1197 commits. The task is soft and writes only `logs/status/links/` and `continent-app/src/admin/linkHealth.json`; removing the `links` block from `scripts/quality/rules.yaml` alone switches the D2 rule off.
