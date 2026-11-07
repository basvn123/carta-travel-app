# T1199: Entry rules and official advice on the country page

ROADMAP item D19. Round 3 session S115, batch 13. Branch `p15-s115-entry-rules`.

## Date

2026-11-07

## What changed

Every one of the 43 catalogue countries now has a "Check before you go" section on its country page: one line per traveller group (EU, EEA or Swiss citizen; British citizen; US and other visa free; visa required) saying what to carry and what to do before the trip, each linked to the official page it rests on with the date checked, then the GOV.UK travel advice link for the country. Before: no entry information anywhere in the app (0 of 43 countries). After: 43 of 43 countries x 4 groups = 172 lines, all with a date checked and 163 with an official source link; the other 9 are GB for British citizens ("your own country") and 8 visa required lines that say "ask the country's embassy" (T1199-c). 42 countries carry the GOV.UK advice link (GB has none). A new layer `pipeline/entry_rules.py` (runner task `entry_rules`, monthly) writes `continent-app/public/entry_rules.json` from a zone table (Schengen, EU outside Schengen, open border micro states, UK, own rules, Faroe Islands) as short codes the app words in six languages; `--refresh` reads the GOV.UK Content API for each page's own update date. No legal rule is paraphrased; ETIAS is shown only as "later, start date not yet set". Each country block carries `_src` and `_asof` (T1143). A contract (`validate` in Python, `validateEntryRules` in `contract.mjs`, run by `check-contract.mjs` with four seeded breaks) fails when a catalogue country has no block, a group is missing, a code is unknown, or a line lacks its source or date.

## Research

A research subagent compared official sources for entry rules (2026-11-07). Its network could not open travel-europe.europa.eu or www.gov.uk, so the facts come from search results on Commission, Council and member state pages; the live check is owner step T1199-a.

| Source | Gives | Licence | Machine readable | Choice |
|---|---|---|---|---|
| travel-europe.europa.eu (EES, ETIAS) | EES and ETIAS rules and status | Commission content CC BY 4.0 (legal notice, Decision 2011/833/EU) | HTML | Used: visa free and visa groups in Schengen, CY |
| Your Europe, travel documents | ID card or passport for EU citizens | CC BY 4.0 | HTML | Used: EU group |
| EUR-Lex Regulation (EU) 2018/1806 | Who needs a Schengen visa | Decision 2011/833/EU reuse | HTML, XML, ELI | Used: visa group |
| GOV.UK foreign travel advice | Entry requirements for British citizens, per country | OGL v3.0 | Yes, Content API JSON with `public_updated_at`, `details.parts` | Used: UK group and the advice link; `--refresh` reads the update date |
| GOV.UK ETA, check UK visa | Entry to the UK | OGL v3.0 | HTML | Used: GB lines |
| US State Department | Advisories, country pages | Public domain (17 USC 105) | cadataapi.state.gov JSON | Used: visa free group outside the EU |
| Canada travel.gc.ca | Advice for Canadians | OGL Canada | JSON | Not used (written for Canadians); a cross-check option |
| Australia Smartraveller | Advice | CC BY | HTML | Not used |
| Germany Auswaertiges Amt | Advice | Terms require full, unaltered takeover | JSON API | Rejected: a short pointer conflicts with the terms |
| Netherlands, Ireland DFA | Advice | No open licence | No | Rejected |

Facts taken (with dates): EES progressive start 2025-10-12, full operation 2026-04-10, in 29 Schengen states, not in CY or IE. ETIAS has no start date (the "last quarter 2026" date was removed from the official site around 2026-08), so no line says it is required. Schengen has 29 members since BG and RO joined fully on 2025-01-01; CY not yet a member. UK ETA required for US and other visa free nationals since 2025-01-08 and for EU, EEA and Swiss nationals since 2025-04-02; Irish citizens exempt. Choice: store only codes, a source id, a URL and a date; never copy source text.

## Files touched

Created: `pipeline/entry_rules.py`, `tests/test_entry_rules.py`, `continent-app/public/entry_rules.json`, `continent-app/src/lib/entryRules.js`, `continent-app/src/browse/CountryEntry.jsx`, `continent-app/tests/entryRules.test.mjs`, `Execution/P15/T1199-entry-rules.md`.
Modified: `run_pipeline.py` (task `entry_rules`, before `photo_sources`), `continent-app/src/browse/CountryPage.jsx` (the section after the cities rail), `continent-app/src/styles/25-feature-pages.css` (`.cpg-entry*`), `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (30 `entry.*` keys each, after `cpage.shareDone`), `continent-app/scripts/ci/contract.mjs`, `continent-app/scripts/ci/check-contract.mjs`, `docs/architecture/lineage-fields.json`, regenerated `docs/architecture/lineage.md`, `docs/reference/{app-lib,python,tasks}.md`, `docs/HANDBOOK.md` (Country page step 6, new "Entry rules" section), `ROADMAP.md` (D19 status), `Execution/_OPEN.md` (rows T1199-a to T1199-f).

## Commands run

```
python pipeline/entry_rules.py
python pipeline/entry_rules.py --check
python -m pytest tests/test_entry_rules.py -q
cd continent-app && npm ci && npm test && npm run lint && node scripts/ci/design-lint.mjs
CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/verify_csp.mjs --dist ../.fastbuild
python -I scripts/docs/build_lineage.py; python -I scripts/docs/build_reference.py
python -I scripts/docs/config_reference.py --check; python -I scripts/docs/drift.py
python -m pytest tests -q
```

## Config and secrets set

None. New runner task `entry_rules` (monthly, soft, guard: www.gov.uk reachable).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Countries with entry information | 0 of 43 | 43 of 43 | +43 |
| Group lines with an official source link and a date | 0 | 163 of 172 (8 "ask the embassy" lines, GB own country) | +163 |
| App tests (`npm test`) | 1886 pass (1890 less the 4 new; not run before) | 1890 pass, 0 fail, 1902 total | +4 |
| Python tests for the layer | 0 | 7 pass | +7 |
| Design lint new violations | 0 | 0 | 0 |
| Contract gate seeded breaks for entry rules | 0 | 4 of 4 rejected | +4 |
| CSP check on the fast build | 0 violations | 0 violations over 40 screen loads | 0 |
| Country page section height, IT | none | 598 px at 390, 352 px at 1440 | new |
| Shipped file size | none | 35.9 KB (`entry_rules.json`, app host) | new |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The country page did not load in the local check ("couldn't load travel data") | `public/boot.json` and `public/dest/` are generated, not in the checkout | `node scripts/sync-data.mjs --split-only` wrote them (its rank tier check fails on this checkout, unrelated), screens checked, generated files deleted |
| Full pytest: 2 failures (`test_rating_inputs.py::test_beauty_v2_reads_no_register`, `test_rating_stability.py::test_adding_places_moves_nobody_else`) | The files they read are git LFS pointers in this cloud container; the same tests fail on `origin/p15-round3` untouched | None here; not caused by this task |
| ruff flagged `str.split` for the Schengen set and a generator in `set()` | Lint rules SIM905, C401 | Literal tuple and a set comprehension |

## Screens checked

Country page, "Check before you go" section, at 390 x 844 and 1440 x 900, for IT (Schengen), GB (UK) and RS (own rules), dev server with the local split wires. Seen: four rows with the group above its line and the source link with "checked 07 Nov 2026" under it; one column on a phone, two from 769 px; the advice line closes the section ("Travel advice for Italy", GOV.UK, written for British travellers); GB shows "Your own country" for British citizens and no advice link; RS shows "National rules, see the official page" and "ask the country's embassy"; no horizontal scroll at 390; no page errors. Design notes: the section uses the page's fact grammar (label over value, hairlines, no card), links in `--action`, no new tokens. Source links are inline text links at 24 px minimum height (WCAG 2.5.8 inline exemption), not 44 px buttons. Screenshots in `Execution/P15/T1199-shots/` (gitignored).

## What is still open

- T1199-a (owner): check the table against the live official pages and move `RULES_CHECKED`.
- T1199-b (owner): run the `entry_rules` task on the box so the GOV.UK update dates appear.
- T1199-c: own visa authority links for the 8 "ask the embassy" lines.
- T1199-d: the eight sources into `pipeline/config/sources.yaml` and the licence ledger (out of this task's file list).
- T1199-e (owner): ask or remember the traveller's passport and show one line instead of four.
- T1199-f: offline caching of `entry_rules.json` in `public/sw.js` (not in this task's file list).

## Owner steps (for the checklist)

- [T1199-a] Check the entry rules against the official pages | the lines were checked from search results because the cloud session could not open the EU and GOV.UK sites, and a wrong entry line misleads a traveller at the border | open travel-europe.europa.eu/ees_en and /etias_en, the Your Europe travel documents page, EUR-Lex 2018/1806 and gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta; compare with rules_for() in pipeline/entry_rules.py (ETIAS must still have no start date); set RULES_CHECKED to that day and run python pipeline/entry_rules.py | pipeline/entry_rules.py
- [T1199-b] Run the entry rules refresh on the box | each country's advice line then shows the GOV.UK page's own update date instead of only the table date | on the box run python run_pipeline.py entry_rules (or python pipeline/entry_rules.py --refresh); check that it reports 41 pages read (42 countries, Denmark and the Faroe Islands share one page); commit continent-app/public/entry_rules.json | run_pipeline.py task entry_rules, docs/HANDBOOK.md "Entry rules"

## Rollback procedure

`git revert` the T1199 commits on `p15-s115-entry-rules` (or on the batch branch after merge). Nothing is one way: no migration, no live data, no deploy.
