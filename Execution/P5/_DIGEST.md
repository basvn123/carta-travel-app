# P5 digest

14 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T084 Write the mechanical trip validator and put it in CI (2026-10-01)

The trip dataset validator, `Trips/carta-unified/carta-unified/pipeline/validate.py`, now runs the seven mechanical checks from the trips enhancement spec, section K5, and a new GitHub Actions workflow runs it on every change that can alter a trip. Before this task the validator checked the schema contract only and passed the 253 journeys with 0 errors and 482 warnings. It now fails them with 606 errors across all 253 trips, and every error code maps to a task already in `_ORDER.md` (table below). The validator reads two layers, because the defects live in two places.

Broke: The resumed edit measured the hero floor on width only / The earlier session compared `w` to 1600, while spec B3 measures the long edge / Compare max(w, h); a hero with neither is an error; Self-test found no clean control trip / Every trip with sleep lines carries a stripped range in the real wire, so no real wire record is clean / The control's s...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T084-trip-validator.md"`

### T085 A1 number ranges (2026-10-02)

The trip pages no longer print a price range as two prices. The cause was in the wire builder, not in the trip data. The master dataset writes ranges with an en dash ("€1,200 to €1,850" with a dash between). The builder's dash stripper, `strip_dashes` in `pipeline/journeys/build_wire.py`, has a rule for digit-dash-digit that makes a hyphen, but a euro sign sits between the dash and the second number, so the range missed that rule and fell to the last rule, which turns any spaced dash into a comma. "€1,200 to €1,850" became "€1,200, €1,850". I added a rule ahead of the hyphen rule: a dash whose right end carries a currency sign becomes the word "to".

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T085-a1-number-ranges.md"`

### T086: A4, stop rendering two empty sections on 60% of trips (2026-10-02)

Nothing in the app. The journey page already refuses to render the packing block and the what-could-go-wrong block when their arrays are empty, so no empty section heading can appear. This task verified that and counted how many trips rely on the guard. Of 253 trips, 153 (60.5%) have both packingNotes and whatCouldGoWrong empty, and all 153 are covered by the guards. The guards are in continent-app/src/browse/JourneyPage.jsx. The packing fold is wrapped in a check that packingNotes has at least one item (line 631), and the what-could-go-wrong section is wrapped in the same check on whatCouldGoWrong (line 651). Both have been there since app commit c46f783, before this branch existed.

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T086-a4-empty-sections.md"`

### T087 A2 month strip (2026-10-02)

The "Best months" row on the journey page is now a strip of twelve cells, January to December, instead of a list of month names with a long sentence under it. Good months are filled and green, avoid months are grey with a hairline strike, the rest are plain. The prose that used to sit under the facts list (the 30-word note) and the avoid sentence now open from a small info button at the end of the strip, so the strip reads at a glance and the reasoning is one tap away. The strip is a shared component, `src/components/MonthStrip.jsx`.

Broke: My first version of the month regex lost its word boundaries when the file was written through a shell heredoc (the backslash-b became a backspace character), so nothing parsed. I fixed it with the edit tool and then tested the parser on eleven phrases drawn from the real data.

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T087-a2-month-strip.md"`

### T088 A3 difficulty meter (2026-10-02)

The journey page facts list no longer prints difficulty and the gateway airports as running text. Difficulty is now five small segments, filled up to the score, followed by "Active 3/5" in mono. The justification sentence sits behind the same small info button the month strip uses, and it opens in place. Where the note only repeated the score or the label ("1/5, Easy") the button is not shown at all. The gateway line is now a short list, one row per airport: the three-letter code in mono, the airport name, and the transfer time in small grey type beneath.

Broke: A Sofia gateway with a long paragraph rendered as a single row with the paragraph as its transfer time / The prose segments are joined onto the row after the completeness check ran / The check now runs after all segments are joined; A backslash was lost in a regex when a file was patched through a shell one-liner (second time this wave) / Shell quo...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T088-a3-difficulty-meter.md"`

### T089: A5: tags, basecamps and snapshot, surfaced or stripped (2026-10-07)

The owner decided on 2026-10-07 (T362) that tags become filters you can scan, and that basecamps and snapshot leave the build unless a screen reads them. Each of the three fields is now either used or gone. Tags are a filter. The Trips style list already had two toggle rows from T188, the length and the cost band. It now has a third, "Tags": an "Any tag" button and then the tags that are common in the open style, each with how many trips it would show. One tag at a time; pressing the pressed one clears it. The row composes with everything else. The rows of the list are the style's trips, narrowed by the tab's search and country filter, then by the tag, then by the cost band.

Broke: The branch carried a merge of `main` made before the report commit was removed, so one soft reset would have undone the merge instead of the report / The merge was run first, as the prompt listed, with the report commit still under it / The branch was moved to current `main` with a soft reset, the report removed, and the one-line snapshot change re...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T089-a5-orphan-fields.md"`

### T090: J1, fix the trips geolocated to the wrong place (2026-10-03)

Every trip in the catalogue now carries a pin on a place its own itinerary names, inside the country the record states, and the validator fails any record that falls back to a capital or sits beside a town of another country. Before this task, 61 of the 253 trips in `Trips/carta-unified/carta-unified/data/trips.master.json` had `coordinates.precision` "country", meaning the pin was the country capital (the Istria Parenzana cycling week sat on Zagreb, 189 km from where it is ridden), and 54 more had "gateway", meaning the pin was the arrival airport's city (Bansko on Sofia). The cause was the gazetteer.

Broke: Kotor and Tivat trips pinned on Tivat, the arrival airport / Equal support, first-named won / The gateway city is out of the vote when anything else resolves; most mentions breaks a support tie; Madeira trail week put on mainland villages called Santana and Sao Vicente / Madeira lies at 32.6 N, south of the 33 N box both files used / Box moved to 2...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T090-j1-geolocation.md"`

### T091: J2, 26 hero images are reused across 53 trips (2026-10-03)

No photograph now fronts more than one trip. Before this task the tracked wire in `continent-app/public/journeys` held 226 distinct hero photographs across 253 trips: 26 photographs were each used by two trips (Krakow's square by three), which is 53 trips sharing a hero. A trial build into a scratch folder now gives 253 distinct photographs for 253 trips, and `validate.py` raises a new error, `hero-duplicate`, on any trip whose hero is also another trip's. The cause was in how heroes are chosen. `build_wire.py` gives each trip a list of places (basecamps, sub-region, and since T090 the derived pin's town) and takes the first one whose Wikipedia lead image is a usable photograph.

Broke: A ski week opened on the Nordic skiing article / Second-tier names came from day-title headings like "Steg: Nordic skiing and sledging" / A junk filter for non-place words and country names on the second tier only; The junk filter did nothing at first, then would have matched inside words / A patch script written through a shell heredoc turned a ba...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T091-j2-duplicate-heroes.md"`

### T092 J3 glance table (2026-10-02)

The week-at-a-glance facts table now displays a fixed row set on every trip instead of changing shape based on which fields have data. The ten core rows are: days, best months, budget, per-day cost, difficulty, crowds, family friendly, car required, gateway/fly to, and languages. When a field has no data, it shows an honest empty state reading "Not recorded" in muted type instead of hiding the row. This allows a traveller to compare two trips side by side: the table rows stay in the same order and the same place on every trip, making comparison possible instead of confusing. Emergency number remains conditional, since it is less critical for trip comparison.

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T092-j3-glance-table.md"`

### T093 J4+J5: the three accuracy signals come from one model (2026-10-07)

A trip record carries three signals about how far its numbers can be trusted: `verifyFlagCount` (how many details a reader should check before booking), `volatilePricing` (whether a price is among them, which picks the wording of the line under the plan) and `sources.verified` (what was confirmed and against what). Until this task each came from a different place. The count was the length of `verifyFlags`, the boolean was that list or a "verify" tag the source batch had put on the trip, and the paragraph was whatever the writer typed. On the published catalogue 30 of 253 trips were volatile with a count of zero, and all 83 volatile trips had nothing in `sources.verified`.

Broke: First patch of generate_trip.py matched nothing / A bash heredoc halved the backslash in a continuation line (the known heredoc gotcha) / Patch scripts kept as files in wt/T093-shots/ and run from there; The schema file came back 1,700 lines changed / It is hand formatted with mixed CRLF; a json.dump round trip reflowed it / Reverted and edited the...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T093-j4-accuracy-signals.md"`

### T094: J6, J7, J8, bold, coverage honesty and the age of the numbers (2026-10-02)

Three changes that make the trips catalogue say what it is. J6, bold. The trip source prose carries markdown-style bold markers, and the Prose component honours them. They were applied by habit, not by rule: 241 of 253 trips had some, 8,242 spans in all, up to 23 in one paragraph, mostly on place names. The wire builder now applies one rule to every string: only a span that carries a figure (a height, a distance, a price, a time) stays bold, and at most two per string, the first two. Every other span loses its markers and keeps its words.

Broke: fr.js failed to parse, Vite's dependency scan aborted / The French coverageCountry string has an apostrophe in "n'y" and my insert did not escape it / Escaped it; all six i18n files now import and carry the three keys; First screenshot showed the planner, not the Trips index / ?tab=trip is the planner; the Trips category is the default of the Desti...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T094-j6-j7-j8-presentation-honesty.md"`

### T096 Ground-cost benchmark (2026-10-01)

The repository now has a repeatable suite, `tools/benchmark/`, that scores the cost engine's bed and food figures against data the engine never read and writes an accuracy figure with a 95% confidence interval. Nothing in the engine, the pipeline or the app changed. The first run is committed as the figure of record in `tools/benchmark/results/2026-10-01.md` and `.json`. The honest outcome is that the statement the task aimed at, a mid-range week predicted within 40 euro for 80% of destinations, cannot be made today.

Broke: Two earlier sessions were cut off before committing / Session limits / This session reviewed the untracked folder, re-ran the suite to confirm the committed figure reproduces, and committed in two parts so a further interruption loses less; Geneva snapshot scored a 0.16 euro median / The harvester's CHF price parse yields fractions for that snapsho...

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T096-ground-cost-benchmark.md"`

### T097: Publish the accuracy figure in the product (2026-10-03)

The destination page now carries a measured accuracy figure. Under the cost receipt, after the provenance lines, there is one underlined line: "Our food prices land within EUR 6 a day for 88% of destinations. How we measured it." Clicking it opens a short paragraph with the date, the sample, the method, the country-level interval and a plain statement of what is not claimed. It is a native details element, so it works without script, takes the keyboard and has a 44px touch target. Only the food figure is published, as register row T096-d asked.

Broke: A sed pass stripped the CRLF line endings of fr.js (7,900 lines showed as changed); I restored CRLF and the diff is 2 lines per language file. Eslint reports two warnings in CostSummary.jsx, an unused Icon argument that was there before.

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T097-publish-accuracy-figure.md"`

### T098: Show city versus country provenance, and name sources in product copy (2026-10-03)

The cost receipt on the destination page now says, for the bed and the food separately, whether the figure is a city measurement or a country-level one, and it names the source in the sentence. Before, the receipt printed a provenance line only for measured figures and stayed silent on everything else; the comment in the code called silence the honest default. That hid the difference this task is about: a Madrid bed price from 13,243 listings read the same as a Polish one that is a national prior. There are now eight lines, one chosen per figure.

Broke: The first version matched the scaled sources by equality and showed the plain country wording for Warsaw and Tampere, because the stored value is airbnb_pli_scaled+pop. Fixed with startsWith, then rechecked on the page.

Full: `git show archive/execution-full-2026-11-03:"Execution/P5/T098-provenance-and-sources-in-copy.md"`
