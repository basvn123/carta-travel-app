# T093 J4+J5: the three accuracy signals come from one model

## Task ID

T093 (mind-map number T089).

## Date

2026-10-07

## What changed

A trip record carries three signals about how far its numbers can be trusted: `verifyFlagCount` (how many details a reader should check before booking), `volatilePricing` (whether a price is among them, which picks the wording of the line under the plan) and `sources.verified` (what was confirmed and against what). Until this task each came from a different place. The count was the length of `verifyFlags`, the boolean was that list or a "verify" tag the source batch had put on the trip, and the paragraph was whatever the writer typed. On the published catalogue 30 of 253 trips were volatile with a count of zero, and all 83 volatile trips had nothing in `sources.verified`. The page read "Prices in this plan change often, check them before you book" on trips that, by their own count, had nothing to check.

The owner decided (2026-10-07, T362, runbook block A) that the K3 confidence model is the one source. That model already exists since T146: a v2.1 record has `figures`, one row per numeric figure, each `sourced` (a page the pipeline read, named in `sourceUrl`), `derived` (arithmetic on other figures) or `estimated` (general knowledge). This task makes the three signals functions of that list and nothing else, in one module, `Trips/carta-unified/carta-unified/pipeline/accuracy.py`.

The rules are short. A figure needs a check when it is `estimated` or when its row carries a `flag`, a new optional key holding the reason a person should look again at a figure that has a value; today the critic's dispute, which `apply_critique` in `generate_trip.py` now writes onto the ledger row it covers. `verifyFlagCount` is the number of such rows. `volatilePricing` is true when one of them is a price (`PRICE_PATTERNS`: the four budget rows, the week total, the per-day range, a stay's price, a day's spend, the exchange rate). `sources.verified` is a sentence built from the sourced rows, for example "28 of 30 figures confirmed against 28 pages read on 2026-10-03: example.org.", or null when nothing is sourced. That sentence is why `("sources", "verified")` moved into `DERIVED` in `generation_gate.py`: the writer is no longer asked for it (the numbers prompt is now version 3), because the rows themselves, each with its page, are the record J5 asks for, and a paragraph the writer composes about its own work is not evidence.

`verifyFlags` keeps its job but loses its authority. It is the pipeline's checklist: what pass three withheld, what the critic disputed, the perishable prices and opening times T155 adds. The review queue reads it; the page never did. Its length and `verifyFlagCount` may now differ on purpose, and `SCHEMA.md` says so. The gate's old rules (`verify-count`, `volatile-flag`) are replaced by `accuracy.inconsistencies()`, which rejects a generated record whose three fields are not what its ledger gives (`accuracy-count`, `accuracy-volatile`, `accuracy-verified`, `accuracy-flag`). `validate.py` applies the same check to the catalogue as `accuracy-signals`, and on any published trip that carries a ledger it also runs the gate's K3 rules as `figure-ledger`, which closes register row T230-c early.

The 253 published trips are v2.0 and have no ledger; T149 will write one (row T146-a). Until then `accuracy.legacy()` applies: the count is the number of `[VERIFY]` markers lifted from the source, volatile means there is at least one, and the writer's `verified` paragraph stands. What does not survive is a "verify" tag at source with no marker behind it. That tag named nothing a reader could check, which is exactly the J4 contradiction, so `normalize.py` no longer reads it and `python pipeline/accuracy.py apply data/trips.master.json` rewrote `volatilePricing` to false on the 30 trips, in the master and in their files under `data/trips/`. Nothing else in the data changed. The wire was not rebuilt (session rule 5), so the shipped copies of those 30 trips still carry the stale pair; the page is written so that it does not matter.

On the page, `accuracySignals(trip, ledger)` in `src/lib/journeys.js` is the same two rules in JavaScript, applied to the figures the page shows. With a ledger, the count is the shown rows that are estimated or flagged and volatile means one of them is a price; without one, the count is the record's `verifyFlagCount` and volatile means it is above zero. `JourneyPage.jsx` reads both the "check before you book" line and the T146 figure footer from that one ledger, so the two sentences count the same rows and cannot disagree. The line is gone when there is nothing to check. Its wording changed to say what the number now is: "{n} details in this plan are estimates or still in doubt, prices among them. Check them before you book." when a price is involved, "none of them a price. Check them before you go." when not, and a one-detail sentence for a count of one so the page never prints "1 details are". The old `journey.volatileNote` string is removed; it had no state left to describe. No CSS changed: the line keeps `.jpage-verify`.

## Files touched

Root repo, branch p5-j4-j5-accuracy-signals. Paths under Trips/carta-unified/carta-unified/ are shortened to T/.

Modified:
- T/pipeline/generation_gate.py (imports accuracy; `("sources", "verified")` in DERIVED; `semantic_errors` calls `A.inconsistencies`; `derive()` calls `A.apply`; four new self-test mutations)
- T/pipeline/generate_trip.py (`apply_critique` writes `flag` on covered ledger rows; fixture pass three no longer carries sources.verified; the critic comment; self-test asserts the new signals)
- T/pipeline/expand_catalogue.py (`add_perishable_flags` calls `A.apply` instead of setting the two fields from the list; a self-test line)
- T/pipeline/normalize.py (volatile from the markers only; `build_record` returns `A.apply(record)`)
- T/pipeline/validate.py (the `accuracy-signals` and `figure-ledger` checks; `accuracy-signals` in K5_CODES; the self-test seeds the J4 contradiction)
- T/pipeline/prompts/k2-numbers.md (version 3; rule 8)
- T/schema/trip.generated.schema.json (`figures[].flag`; descriptions on the three fields)
- T/schema/examples/generated-trip.example.json (sources.verified is the derived sentence)
- T/schema/SCHEMA.md (the verification table and a paragraph on the one model; closes T154-d)
- T/schema/types.ts (`Figure`, `Confidence`, `figures?`, the field comments; closes T154-d)
- T/data/trips.master.json and 30 files under T/data/trips/ (volatilePricing true to false; the list is `git show --stat`)
- tests/test_generate_trip.py, tests/test_trip_critic.py, tests/test_expand_catalogue.py (assertions follow the model)
- Execution/_OPEN.md

Created:
- T/pipeline/accuracy.py
- tests/test_trip_accuracy.py
- Execution/P5/T093-j4-accuracy-signals.md

App repo, branch p5-j4-j5-accuracy-signals.

Modified:
- src/lib/journeys.js (`PRICE_FIGURE`, `needsCheck`, `toCheck` and `volatile` on the ledger, `accuracySignals`)
- src/browse/JourneyPage.jsx (the line reads `accuracySignals`)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (`journey.verifyNote` reworded; `journey.verifyNoteNoPrice`, `journey.verifyNoteOne`, `journey.verifyNoteOneNoPrice` added; `journey.volatileNote` removed)

Created:
- tests/accuracySignals.test.mjs

Not touched: `build_wire.py` (it copies every record key, so `flag` and the re-derived fields reach the wire on the next build), `export_sql.py` and `build.py` (the columns keep their names), `scripts/audit-content.mjs` (it reads the record fields, which now follow the same model).

## Commands run

From Trips/carta-unified/carta-unified in the root worktree, with the Supabase variables unset first:

```
python -X utf8 pipeline/accuracy.py self-test
python -X utf8 pipeline/accuracy.py check data/trips.master.json        # before: 30 of 253 disagree
python -X utf8 pipeline/generation_gate.py self-test
python -X utf8 pipeline/generation_gate.py check schema/examples/generated-trip.example.json
python -X utf8 pipeline/generate_trip.py self-test
python -X utf8 pipeline/validate.py --wire "<main checkout>/continent-app/public/journeys" --report <shots>/validation-before.md --json <shots>/validation-before.json
python -X utf8 pipeline/accuracy.py apply data/trips.master.json        # 30 of 253 trips re-derived
python -X utf8 pipeline/accuracy.py check data/trips.master.json        # after: 0 of 253 disagree
python -X utf8 pipeline/validate.py --wire "<main checkout>/continent-app/public/journeys" --report <shots>/validation-after.md --json <shots>/validation-after.json
python -X utf8 pipeline/validate.py --self-test --wire "<main checkout>/continent-app/public/journeys"
```

From the root worktree:

```
python -X utf8 -m pytest tests/test_trip_accuracy.py tests/test_trip_confidence.py tests/test_generate_trip.py tests/test_trip_critic.py tests/test_expand_catalogue.py tests/test_review_queue.py tests/test_golden_set.py tests/test_backfill_modules.py tests/test_fill_type_specific.py tests/test_word_caps.py -q
```

From the app worktree:

```
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run lint
npm test
node scripts/ci/design-lint.mjs
npm run build
npx vite preview --port 5215 --strictPort      (stopped after each check, PID found on the port and its command line read first)
node ../T093-shots/shoot.mjs                     (Playwright, service workers blocked; six screenshots in wt/T093-shots/)
```

The validator reads the main checkout's wire read-only; nothing was written there. The validation reports went to the shots folder, not to T/reports/ (row T093-e). `dist/` and `dist-data/` were deleted after the build.

## Config and secrets set

None. No dependency, no migration, no environment variable. The numbers prompt moved from version 2 to 3, which `golden_set.py` records as a prompt change on the next stamp.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Published trips whose three signals disagree with their own basis (`accuracy.py check`, data/trips.master.json) | 30 of 253 | 0 of 253 | -30 |
| Published trips volatile with a count of zero (the J4 contradiction) | 30 | 0 | -30 |
| Published trips volatile with nothing in sources.verified | 83 | 53 | -30 (the rest wait for the T149 ledger, row T093-b) |
| validate.py errors on the catalogue (this laptop, no gazetteer) | 547, of which 30 `accuracy-signals` | 517, of which 0 | -30 |
| Gate self-test, malformed answers rejected | 33 | 37 | +4 |
| Validator self-test, seeded checks | 10 | 11 | +1 (`accuracy-signals`) |
| Trip pipeline tests (ten files) | 120 pass | 128 pass | +8 (tests/test_trip_accuracy.py) |
| App unit tests | 259 pass, 0 fail | 266 pass, 0 fail | +7 |
| design-lint new violations | 0 | 0 | 0 |
| Pages with the "check before you book" line whose count disagrees with the figure footer | possible by construction | impossible: both read `figureLedger` | |

The 30 trips are all in the northern-baltics batch (the one source batch that used a trip-level "verify" tag): Denmark 4, Estonia 3, Finland 3, Faroe Islands 3, Ireland 3, Lithuania 3, Latvia 3, Norway 4, Sweden 4, per `git show --stat`.

The browser check (380 and 1280 px, no page errors, no horizontal scroll) covered three states. Copenhagen by Neighbourhood Block, which the stale wire still marks volatile with a count of zero, shows no line. The Rhodope and Rila driving loop, six verify markers, shows "6 details in this plan are estimates or still in doubt, prices among them. Check them before you book." The Donauradweg card served with the T146 example record and one disputed climb shows "One detail in this plan is an estimate or still in doubt, not a price. Check it before you go." above "25 of 27 figures on this page are sourced, 2 derived, 0 estimated, last checked October 2026."

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First patch of generate_trip.py matched nothing | A bash heredoc halved the backslash in a continuation line (the known heredoc gotcha) | Patch scripts kept as files in wt/T093-shots/ and run from there |
| The schema file came back 1,700 lines changed | It is hand formatted with mixed CRLF; a json.dump round trip reflowed it | Reverted and edited the three lines textually with newline preserved |
| Gate self-test: a one-space `flag` was caught by the schema, not by the model rule | `$defs/text` has minLength 5 | The mutation plants five spaces, which the schema admits and `accuracy-flag` rejects |
| The fixture for pass three was rejected: `sources.verified` unexpected | The fixture projected the whole `sources` object after `verified` moved into DERIVED | `fixture_bodies` strips nested DERIVED keys from pass three as it already did for pass one |
| The expansion stub trip was refused by the gate (count 21, figures give 0) | `add_perishable_flags` still set the two fields from the flag list | It calls `accuracy.apply`; three expansion tests and the review-queue test followed |
| Playwright's route never fired, so the injected ledger was not seen | The app's service worker answered the journey JSON | `serviceWorkers: "block"` on the browser context |
| No deep link opens a journey | `pathToLegacyHash` has no journey case, so /journeys/{id} lands on the Trips tab | The check walks the reader's path: style card, then journey card |
| "1 details in this plan are" | The catalogue has no plural forms | A one-detail sentence per language (`journey.verifyNoteOne`, `journey.verifyNoteOneNoPrice`) |

## What is still open

Five rows, T093-a to T093-e. The shipped wire still carries the stale pair on the 30 trips, and the flat CSV and seed SQL were not regenerated; the data lane rebuilds them from the master after merge (T093-a, owner). When T149 writes `figures` into the 253 trips, `accuracy.apply` will replace the 70 writers' `sources.verified` paragraphs with the derived sentence; whether to fold them into `confidenceNotes` first is a decision for that task (T093-b). Perishability is not in the reader's count: a sourced price checked months ago still counts as sourced, and the T155 perishable flags live only in `verifyFlags`; the T146-g expiry is where an old price should re-enter the count, through a `flag` on its row (T093-c). Withheld figures and non-figure perishables (opening hours in prose, booking windows) are not on the page and not counted, by design; a line about them would need a new string and a count from the evidence sidecar (T093-d). The committed validation report was not regenerated because this laptop has no gazetteer (T093-e). Rows T154-d and T230-c are closed by this task. T146-a and T094-b stay open as they were.

## The seven carta-design questions

1. No hex value: no CSS changed; the line keeps `.jpage-verify` and its tokens.
2. No gradient, no new colour, no second saturated hue.
3. Ochre stays where it was, on the advisory note (`--rate-bg`, `--rate`), which this task did not restyle; no teal, no `--danger`.
4. No mono text added; the count sits inside a sentence in `--ui`, as the mono rule asks.
5. One primary per view, unchanged ("Price a trip to ...").
6. Every new sentence carries a number or a verb ("Check them before you book"); no em dash, en dash or middot anywhere in the diff or this report; none of the banned words.
7. One thing removed: `journey.volatileNote`, the line that could appear with nothing behind it.

## Rollback procedure

Revert the task commits on p5-j4-j5-accuracy-signals in both repos, or drop the branches before merge. That restores the two fields from the flag list in the gate, the normaliser and the expansion step, the writer's `sources.verified`, prompt version 2, the old gate rules, the 30 trips' `volatilePricing`, the page line and the six catalogues. No wire, migration, dependency or production data changed. A generated record admitted after this task carries `flag` on disputed rows and a derived `sources.verified`; one admitted after a revert would be rejected for the unknown key, so revert before the first live generation run, as T146 already said.
