# P9 digest

13 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`. Owner procedures kept beside this file: _OPEN-paid-runs.md.

### T143 K1: Generate into a JSON Schema, never into prose (2026-10-03)

Carta now has a written contract for a model-generated trip, and a gate that enforces it. The contract is `Trips/carta-unified/carta-unified/schema/trip.generated.schema.json`, a JSON Schema (draft 2020-12) for what this note calls schema v2.1. The gate is `Trips/carta-unified/carta-unified/pipeline/generation_gate.py`. Before this task a generator had nothing to fill but the v2.0 master shape, where the numbers live inside sentences, and nothing checked its answer before it reached disk. v2.1 is the v2.0 master record with every number that has a typed home taken out of prose. A day's measured line is no longer "52 km, +160 m, asphalt throughout".

Broke: Two self-test mutations did not test what they said / "inverted total" tripped the schema maximum first; "night pointing at no stay" pointed at rank 3, which exists / Use a low above the high but inside the bound; drop the third stay instead; anyOf errors read "not valid under any of the given schemas" / jsonschema reports the union, not the branch...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T143-generation-schema.md"`

### T144 K2: Split generation into three passes with different jobs (2026-10-03)

Carta now has a generator that builds a trip in three passes, each with its own prompt, its own slice of the v2.1 contract and its own check before the next pass may start. Before this task there was a contract and a gate (T143) but nothing that called a model; the one thing the gate could not stop was a single wide prompt producing a confident, uneven trip. The generator is `Trips/carta-unified/carta-unified/pipeline/generate_trip.py`, the prompts are `pipeline/prompts/k2-skeleton.md`, `k2-prose.md` and `k2-numbers.md` in the same dataset folder, and the tests are `tests/test_generate_trip.py` at the repo root plus the module's own `self-test`. Pass one is the skeleton.

Broke: The fixture failed pass one on `bestPeriod.monthNames`, `raw` and `profile.fitnessLevel` / Projecting a whole object out of the example copies the derived keys too / `fixture_bodies` drops the two-level `DERIVED` paths; `budgetTier`, `budgetTierRaw` and `currency` were flagged as figures / The euro regex matched a tier mark and the ISO code / A val...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T144-three-pass-generation.md"`

### T145 K4: Run a separate adversarial critic with no memory of the writing (2026-10-03)

Every trip the generator would admit now goes through a fourth call before it is written: a critic whose only job is to find what is wrong. Before this task the only flags a generated record could carry came from the evidence rule in pass three ("Withheld ...: no source given"), and nothing looked at the finished record as a whole. The writer passes cannot do that job. Pass three is told to source its figures, and asked whether it did, it will say yes. The critic lives in `Trips/carta-unified/carta-unified/pipeline/generate_trip.py` as pass 4, with its own prompt in `pipeline/prompts/k4-critic.md`. Three things keep it independent of the writing.

Broke: The no-dash pattern landed in the source as literal characters / A bash heredoc ate the backslashes of the replacement script (the T143 gotcha) / Rewrote it from a script file; the source holds `\u` escapes; Four T144 tests failed / They pinned exactly three calls and six ledger lines per run / Updated to expect the critic as the fourth call; The i...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T145-adversarial-critic.md"`

### T146 K3: Every number carries its own confidence, and the page shows it (2026-10-03)

A generated trip now says how each of its figures is known, and the page says it back to the reader. Before this task a trip had a `verifyFlagCount`, a `volatilePricing` boolean and a free-text `confidenceNotes`, none of which could answer "is this number from a page, from arithmetic, or from the model's general sense of things". Now the record has a `figures` list, one row per figure, each `{path, confidence, sourceUrl, checkedAt}`, where confidence is sourced, derived or estimated. I did not put a sibling `confidence` key beside every number, which is what the task text suggests.

Broke: Schema JSON invalid after my first edit / A shell heredoc halved the backslashes in the path regex / Doubled them in place and reparsed; French `journey.estAria` failed to parse / An unescaped apostrophe, same heredoc cause / Escaped it; all six i18n files parse; Gate self-test failed on the `derive()` round trip / The round trip stripped every DER...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T146-per-field-confidence.md"`

### T150 K10 + D1: Start the backfill with packing and risk modules (2026-10-03)

Carta now has the machinery to write the two modules that most trips lack, but it has not yet written them, and the done condition (packingNotes and whatCouldGoWrong populated on all 253 trips) is not met. Stage 3 of the rollout, the owner's Gemini setup, is not done, so no model was called. What exists is the tool, its prompt, its checks and its tests, all proven against stub answers. The measured run is an owner register row (T150-a). The tool is `Trips/carta-unified/carta-unified/pipeline/backfill_modules.py`. It is a fill-mode pass, not another trip generator.

Broke: The first self-test run crashed writing the cache / `G._write_atomic` does not create the folder / Create the folder before each write; Applying a single-trip folder skipped the trip as generic / With one record, every word has a document frequency of 1, so no word could anchor / The frequency table is empty below 30 trips; The cache would replay a...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T150-packing-and-risk-backfill.md"`

### T151 D3: Fill the type-specific data sheet, one trip type at a time (2026-10-03)

The three numeric slots of `typeSpecific`, `distanceKm`, `elevationM` and `verticalM`, are now filled from the words the master already holds, under one stated rule per trip type. Before this task they were filled at ingest by taking the first number found under a matching key, and that grabbed the wrong thing in 16 places. A ski trip with a distance of 1,050 km was Engelberg's base altitude, 1,035 was Chamonix's, a water-sports trip with 25 km was the depth of a lake and one with 3 km was the length of a beach. Two trail-running trips held a vertical of 1 because the key "Named routes, distance and vertical" begins with "(1)".

Broke: Regex word boundaries became backspace characters or a bare letter b three times / A shell heredoc and sed both treat `\b` as an escape / Wrote each patch as a script file and, after each, scanned the module for character 8 and for a letter b after a letter and before a bracket; the module now holds neither; A first draft used midpoints for ranges...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T151-type-specific-fields.md"`

### T152 D4: Cap the prose and let the structure carry the load (2026-10-03)

The caps are now enforced in three places that read one set of numbers, but the catalogue itself is not yet within them, and this task cannot make it so. Summary at most 120 words, each day's morning, afternoon and evening at most 45, each pro tip at most 35. Before this task the generator already had the caps. T144 put them in the pass-two prompt (`{{summaryWords}}`, `{{dayWords}}`, `{{tipWords}}`) and in `generate_trip.py`, which rejects a pass-two answer over a cap and retries once.

Broke: Gate self-test rejected the example record / Five example day blocks were over 45 words / Dropped one middle sentence from each; `validate.py` could not use `G` for the gate / `G` is `geocode` in that file / Imported the gate as `GG`

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T152-prose-caps.md"`

### T153 K8: Keep a golden set and re-run it on every prompt change (2026-10-03)

Prompt changes now have something to be measured against. Before this task nothing compared one generation of a trip with the next, so a tweak to the numbers prompt could have raised every food budget by a fifth and the first sign would have been 600 trips carrying it. There is now a golden set of ten trips, one per trip style, a runner that regenerates all ten through the full four-call pipeline and diffs the numbers against the last blessed run, and a CI check that fails when a prompt, the model chain or the set itself changes without a new blessed run. The set lives in `Trips/carta-unified/carta-unified/golden/golden-set.json`.

Broke: The first self-test failed on an identical rerun / The mini set of six trips was held to the real set's minimum of eight compared trips / The mini set carries its own minComparedTrips of 5; Two stub trips would have collided in the admitted folder / Every fixture trip has the same id / Each trip writes into its own subfolder of the run folder, name...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T153-golden-set.md"`

### T154 K7: Spend the human review budget on flags only (2026-10-03)

A person reviewing generated trips now reads a queue of flagged fields instead of whole files, and `sources.confidenceNotes` can no longer be empty on a generated trip. The queue is `Trips/carta-unified/carta-unified/pipeline/review_queue.py`. Pointed at the folder the generator writes admitted trips to (`data/generated/admitted`), it reads each record with its two sidecars and lists a trip only for four reasons. The critic disputed a field: these come from `<id>.critique.json`, which carries the kind, severity, quote, reason and URL, and whether the critic's grounding actually read that URL, so a dispute resting on a page nobody read is visible as such.

Broke: The first measuring run showed zero trips / My stub dispute reason was under the critic check's minimum length, so the generator correctly rejected the trip at the critic stage / Used a full-length reason; the check doing its job; One test could not see its own first-of-country item / `cmd_verdict` and `cmd_close` read the real catalogue, where Aus...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T154-flag-only-review.md"`

### T155 D2: Expand the catalogue, batched by region (2026-10-03)

Carta can now grow its trip catalogue in batches without a person writing trips, and nothing a batch makes reaches the catalogue until it has passed the validator, the critic, the coverage checks and a review. Before this task the pieces existed one by one: a contract and gate (T143), a three-pass generator (T144), a critic (T145), per-figure confidence (T146), a golden set (T153) and a review queue (T154). Nothing decided which trips to make, nothing capped the spend of a batch, nothing flagged every price, opening time and booking window, and nothing moved a reviewed trip into `trips.master.json`. No trip was generated in this task.

Broke: Dash and superscript characters landed literally in the source / The file-writing tool turned `\u` escapes inside raw strings into characters / A scratch script replaced each with its `\u` escape; the source now holds escapes only, checked by a scan; A heredoc fix script failed with a unicode escape error / Bash heredocs eat backslashes (the T143 g...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T155-catalogue-expansion.md"`

### T327: fact store follow-ups, written as the input T147 builds on (2026-10-03)

T147, the task that builds the volatile fact store, has not run: it sits in wave 17, which waits for the owner's stage 2 and 3 pastes. So this task does what can be done without the table and writes the rest down as the input T147 starts from. The facts migration is not written here. Its number is 049, reserved for T147; nothing under `supabase/migrations/` changed. Two pieces of code landed.

Broke: The whole test folder in one process lost tests once the new files imported the dossier `common` / `Trips/.../pipeline` also has a module called `common`, and the first one imported stays in `sys.modules` / Both new tests import against the dossier `common`, then restore `sys.modules` and `sys.path`.

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T327-fact-store-followups.md"`

### T332 Journey data fixes the validator found (2026-10-03)

The trip validator (`Trips/carta-unified/carta-unified/pipeline/validate.py`) now reports no budget-sum-mismatch and only 2 accommodation-not-slept errors. The data fixes are in `data/trips.master.json` and the per-trip files in `data/trips/`. The source batch `.md` files are not in the repository, so these two JSON layers are the only editable source. Budget (T084-a, 58 trips, 98 errors). Two kinds of defect, as T084 described. For the 30 Nordic trips the breakdown cells held a per-night rate for accommodation and a per-day rate for food, against a weekly total. I multiplied accommodation by the nights (durationDays minus 1, so 6) and food by the days (7).

Broke: First pass left the changed notes without a full stop and the total note without a euro sign on the high figure / Appended sentence to notes that did not end in one; string template / Patched all 58 records in a second pass (not a rerun of the first script, which would have multiplied twice); `verify_roundtrip.py` cannot run / It reads the source `...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T332-journey-data-fixes.md"`

### T361 Booking windows for the 66 trips that had none (2026-10-03)

T169 turned each trip's booking text into a "Book in this order" checklist, but 66 of the 253 trips had no booking text (no logistics.bookingWindows, no typeSpecific.bookingTimeline, no typeSpecific.hutBooking, the same test T169 used). Six research passes read official pages (park authorities, rail and ferry operators, huts, venues, tourist boards) and wrote a short booking paragraph for each trip into logistics.bookingWindows. 47 of the 66 now have text. 19 have none, because no page I could read gave a lead time or a rule for anything in the trip's record. I did not invent any. Hotel and hut lead times that exist only in the trip records were left out for the same reason.

Broke: A first launch of a research agent ran with a placeholder prompt / I sent the call before filling the prompt / It did nothing; I relaunched all six properly; Three claims had no readable source page / belgiantrain.be and tourismus.li returned 403; botrange.be does not state the rule / Removed; the three trips are listed as empty; Three texts said m...

Full: `git show archive/execution-full-2026-11-03:"Execution/P9/T361-booking-windows.md"`
