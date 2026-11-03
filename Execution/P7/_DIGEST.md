# P7 digest

20 task reports folded on 2026-11-03 (T1034). Each entry keeps what changed and what broke; the full report, commands, files and rollback are in git under the tag `archive/execution-full-2026-11-03` (command under each entry). Open items live in `Execution/_OPEN.md`.

### T107 Apply the title ladder across all five sections (2026-10-01)

Trail titles used to be the relation's name tag copied as is. On the published wire that meant 1,925 of 17,619 titles ran past 42 characters, 621 were route codes such as "LK 08", and 29 carried tag syntax or an ingest placeholder. names.py now has title_ladder(), a pure function that walks five rungs in a fixed order and returns the title, the rung that produced it, the ref chip string and the original string. The rungs are a stored Wikidata label, a real source name (name:en, then a Latin-script name, then any name), the from and to tags, a landmark formula from the best named feature the line touches, and shape plus place.

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T107-title-ladder.md"`

### T108 Fix the five user-visible trail data bugs (2026-10-01)

All five bugs in spec 6.8 now have a fix in code and a regression test. The tests are built on the two Mount Korab rows as the wire carried them. Three of the five are fully fixed inside the files this task could touch. The other two, the region and the highlight names, are fixed in logic, but a reader sees them only after one more line in a file outside this task's scope. Nothing was written to data. The published wire changes after the next pipeline run. Direction. A one-way route is stored in whatever direction its mapper drew it. Mount Korab (9) was drawn summit to village, so it carries 7 m of ascent and 1,423 m of descent. attributes.py now has uphill().

Broke: trailStory.js showed as a whole-file diff / The app repo stores it with CRLF and the edit wrote LF / Rewrote it with CRLF; the diff is 93 lines; Two lines in regression.py joined into one / The shell heredoc used for the edit dropped the line-continuation backslashes / Restored them

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T108-trail-data-bugs.md"`

### T111 coverage contract: country floors and reason codes (2026-10-02)

The coverage audit in pipeline/regions/coverage.py now builds the coverage contract from spec 0.4: for each of 45 countries and each of the five layers, one cell that holds the published count, the country floor, a status of pass, fail or n/a, and, on every cell that is not passing, one of the spec's seven reason codes with a one line detail. The same run stamps a reason code beside every NUTS3 region whose status is thin, empty or na, so the per region wire the app already reads carries a code too. The audit used to answer only "is this region thin"; it now answers "is this country covered in this section, and if not, why", which is the question the spec's dashboard asks.

Broke: Mountain musts never matched on OSM id / the diff matched `peak.get("oid")`, and a rich peak's `osm` is a dict of tag counts, not an id / match on Wikidata id and folded name only; Every thin cycling region printed no_open_data / cycling has no gate replay, so "no rejected candidates" read as "no data" / cycling regions split by country: below_quot...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T111-coverage-contract.md"`

### T112 coverage dashboard and gate (2026-10-03)

The dashboard half of this task already existed. T111 made coverage.py write reports/coverage.html with a country table at the top, one row per country per section with published count, floor, status and reason code, and it writes that page on every run of the regions step. So T112 built the half that was missing: a judge that fails the build, and a workflow that runs it. The judge is pipeline/regions/coverage_gate.py. It uses only the standard library, because CI holds none of the data and cannot import the geo stack.

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T112-coverage-dashboard-and-gate.md"`

### T113 Famous-trail registry: the Waymarked diff and the per-GMBA gap (2026-10-02)

The famous-trail registry already existed (data/trails/famous_registry.json, built by pipeline/trails/famous_registry.py from Wikidata, pageviews, OSM fame tags, national portals and a seed list) and the coverage gate already read it. Two parts of spec 6.1 were missing, and this task adds them. The first is the Waymarked Trails diff. Every evidence source the registry had was a fame signal, so a national trail nobody wrote an article about could never become a row, and "should this country have it" could only be asked of trails somebody had already made famous.

Broke: E2 never placed in Luxembourg / the member walk was cut at 400 ways, and the E2 lists 941 Walloon ways before the Luxembourg section / no cut; only ways the extract holds are candidates; 223 of 1,453 added rows landed in a neighbour's NUTS3 (Julius Kugy Alpine Trail as an Austrian row in Italy) / one fixed member way per route, and extracts carry c...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T113-famous-trail-registry.md"`

### T121 Node networks are not routes: decision record (2026-10-02)

Nothing in code. This task records a decision that the code already enforces for cycling and verifies where the enforcement stops. The decision: numbered-junction networks (knooppunten, Knotenpunkte, noeuds) are not ingested as routes. Each node pair is a tiny relation, so publishing them would fill the catalogue with 2 km fragments. The cycling harvest keeps them as a graph in separate tables, and a separate script measures the mesh around each destination so the page can say something true instead of nothing. Whether to build a routable "40 km loop from node 42" product on that graph is a product decision and belongs to the owner (spec section 7.5 and open decision in section 14).

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T121-node-networks-decision.md"`

### T124: the honest stub and the not_applicable empty state (2026-10-07)

Two things that did not exist now do. A famous walk that Carta cannot build from open data has a page of its own, and a microstate that truly has nothing in a layer says so, with the reason, three real places across the border and a way onward. The stub page is built on the shared detail skeleton, so it opens, closes and traps focus like the beach, lake and trail pages. It prints the name and region, the one honest line ("No open route data exists for this walk yet.

Broke: The first screenshot run could not find the category buttons at 1280 px / On desktop the categories are `.side-cat` in the left rail, not `.places-cat` / The script selects both; Monaco's mountains showed the same summit twice / A border peak is published once per country / `nearestThree` keeps the nearer of rows with the same name; San Marino moun...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T124-honest-stubs-and-empty-states.md"`

### T286 One climb and one difficulty, from source to screen (2026-10-02)

Every surface that prints a single climb now prints the climb read uphill. The rule is T108's: a one-way line whose net drop is at least 300 m and at least twice its climb was drawn downhill, so a walker starting from the bottom faces the stored descent as the climb. trailStory.js gained trailClimbUp(), and the trail card in DestinationsTab.jsx, AroundHere.jsx and both row lists in destinationPdf.js call it. The country card already carries descent_m (route_schema.py wire_keys adds it), so the card is right on the wire that is live today: Mount Korab (9) went from +7 m to +1423 m in the browser at 380 px and at 1440 px. The KML fact line was built in TrailPage.jsx from the stored ascent.

Broke: A scripted edit to DestinationsTab.jsx matched nothing / The worktree files are CRLF and my first line-ending check was wrong / Normalised to LF in memory, edited, wrote back CRLF; every diff stays line-sized; The first test fixture assumed the card had no descent_m / My first look at the Korab card was truncated before route_schema's keys / Read t...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T286-trail-climb-consistency.md"`

### T287 shared MonthStrip on the lake and mountain pages (2026-10-02)

The shared `MonthStrip` from T087 now sits on the lake page and the mountain page. On the lake page it replaces the old bar strip. A month is good when the modelled water temperature in `lake.swim.temps` reaches the warm threshold (the `warmC` prop, default 18). The old subtitle and the season sentence open from the info button. On the mountain page a "When to go" section shows the climatology: good months are `season.months`, avoid months are months with `season.snow` of 75 or more that are not good. The best-months sentence and the estimate note open from the info button. A row with no `season.months` keeps the old Season line in the facts list. The beach page is unchanged.

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T287-layer-month-strip.md"`

### T311 Pipeline code fixes, no runs (2026-10-03)

Eleven register rows, all in pipeline code, all fixed in code with tests and none of them run against data. Each change lands the next time its stage runs, on the laptop or on the stage 7 box. The rows were T300-p, T121-b, T108-c, T113-g, T107-b, T096-c, T096-b, T288-c, T113-b, T269-b and T267-a. All eleven are closed. What still needs a data run or an owner decision is in new rows T311-a to T311-h. Because the box will run run_pipeline.py on a timer, the edits there are only the three the notes granted. waymarked.py runs first in trails_registry (T113-b). A new task, photo_sources, comes after the layer exports (T269-b).

Broke: photo_sources was invisible to the registry's task check / registry.pipeline_tasks reads a task only when `"key"` is its first line, and a comment sat above it / The comment moved below the key; a test now checks that photo_sources is the last task in the parsed table; Two Git Bash heredoc patches lost or turned backslashes: invisible no-break spac...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T311-pipeline-code-fixes.md"`

### T321: the rating distribution contract fails on main (2026-10-03)

The ratings were wrong, not the contract. The frozen fitted-score curve in `reports/rating_calibration_anchors.json` did not reproduce the catalogue it says it was frozen on, and that is what broke the curated/fitted SD gate. The curve is now rebuilt, offline and deterministically, from the tracked wire at `798f1b84` (the catalogue the 2026-09-04 ruling named), and a new test checks the stored curve against the contract so a bad curve fails CI the day it is committed. No pipeline ran and no published score changed. The shipped wire still carries the old scores, so `rating-tests` keeps failing its wire check until the data lane re-scores (T321-a). How it was found.

Broke: `rating-tests` fails gate 3 on main (gap 0.280) / The frozen anchor curve was not the 798f1b84 calibration it claims to be; applied from `eb2797c3` on, it compressed fitted scores (SD 0.833 to 0.706) and re-rated 1,133 reference places / Curve rebuilt from the 798f1b84 wire with a replay check; new test gates the curve itself; Nothing guarded the c...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T321-rating-distribution.md"`

### T322 Why registry routes and ranges are missing from the trails wire (2026-10-03)

Nothing in the published wire, the registry or the database changed. This task answers two questions that T113 left open and adds code for the answers, none of it run against the lab. T113-d asked whether curate's quota, the continuity gate or the ingest network filter drops the 1,930 Waymarked national and international routes that the registry holds and the wire does not. Read against the code and the committed files, the answer is that the network filter does not (ingest_osm_routes.passes_first_filter admits any iwn, nwn or rwn relation, and only a node-network edge is refused), and that three other gates do, in a way the coverage report cannot show.

Broke: tests/test_rating_distribution.py fails with FileNotFoundError in this worktree / the sparse checkout has no continent-app or cache, and the test reads them / not touched; unrelated to this task; First national-pass test expected the pass to add routes / the pass spends the country target, it does not add to it / test now asserts the count is uncha...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T322-wire-gaps.md"`

### T754-T756: rating v5 batch R1, foundation (2026-10-27)

T754: Every rating number now comes from one file, and every calibration is measured once and then frozen. `continent-app/config/rating.json` holds the weights, tier cutoffs, hidden-gem rule, register weights, highlight constants, significance weights and quotas, and appeal-scale ceilings.

T755: A multi-airport city is one destination. Its primary airport row (`beauty_layer.CITY_PRIMARY_IATA`: FCO, CDG, LHR, MXP, VCE, ARN, WAW, OSL) carries the rating. The other 13 airport rows (CIA, ORY, BVA, STN, LTN, LGW, BGY, LIN, TSF, NYO, BMA, WMI, TRF) carry `gateway_of: <city row id>` and no rating block, so they rank nowhere: not...

T756: The POI re-quota is live. The full significance apply (not `--sig-only`) put rate 3 at 11.9% and rate 2 at 28.2%, against 61.7% and 22.2%. `sig` did not move (2 of 152,461), so no live score changed. Nine confidence labels and 48 `inputs_present` counts moved, because confidence counts rated sights.

Broke: T754 Curves rebuilt on today's catalogue failed gate 3 (0.182) / The fit lands on the catalogue it measures; the gate needs the audited curve / Kept T321's curves and the 798f1b84 coefficients they were built on (0.175); T754 A full dossier rebuild changed sleep, highlights, gallery and trips on most files / The master and caches have moved on sinc...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T754-T756-rating-v5-foundation.md"`

### T757-T760: rating v5 batch R2, scoring (2026-10-27)

T757: Carta has a written appeal rubric and a fact card for every destination. `docs/RATING_RUBRIC.md` sets the five classes, five criteria (setting, character, signature sights, atmosphere, uniqueness) with what to look at per class, the five bands with their tests...

T758: All 2,298 places without a hand score have a rubric appeal, five criteria, a confidence, flags and a reason in English, Dutch, German, French, Spanish and Italian (`app_data/rubric_appeal.json`).

T759: Every place is scored on Q = 0.60 A + 0.15 B + 0.15 D + 0.10 R, with A the hand score, else the rubric score, both opened per class by `appeal_scale.py`.

T760: `pipeline/external_check.py` compares the v5 ratings with Tripadvisor Travelers' Choice, Lonely Planet Best in Travel, UNESCO World Heritage at the place and Wikivoyage, and `reports/rating_external_check_v5.md` reports it.

Broke: T757 `KeyError: depth_knots` building cards / The frozen reference had no depth breakpoints while depth was off / The card builder measures the class percentile in memory, as `tests/test_rating_inputs.py` does, and never writes it; T759 froze the breakpoints; T757 Cards credited neighbours' sights (Begunje listed Bled, Kassiopi listed Albania's Ksa...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T757-T760-rating-v5-scoring.md"`

### T761-T762: rating v5 batch R3, nature on the ladder, POI labels and the place taste profile (2026-10-28)

T761: Every rated trail, beach, lake, peak and cycle route now carries `v5 {score, band, rank, facts, confidence}` (`pipeline/nature_tiers.py`): - **Score.** Each kind is read as a frozen Europe-wide percentile, then placed on the same cutoffs as places, so "Excellent" means the same for a lake and a village. - **Missing parts.** A missing part counts at the kind's median. Nothing is renormalised.

T762: Every rated place (3,855) carries `taste` (`pipeline/place_taste_profile.py`): - **Twelve values.** One per like key of the planner's `LIKES`, each `[value 0..1, fact]`. The test reads the keys from `tripSettings.js`, so the two lists cannot drift. - **How a value is built.** It starts from the guided-search vibe and is checked against catalogue facts: v5 nature within 30 minutes, designations, POI categories, the place class, fame, island status.

Broke: T761 The recalibrated rating refused to write: CDG 8.7 under the famous floor 8.8 / Depth now counts real categories. Every metro's POI list is cut at 52 items (1,674 places, 122 of 127 metros) and labelled under the metro cap of 8 must-see and 24 recommended.

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T761-T762-rating-v5-profile.md"`

### T763 to T766: rating v5 on every screen (batch R4) (2026-10-28)

T763: `lib/rating.js` is now the only module that turns a score into words: the five bands and their cutoffs come from `config/rating.json` (9.0 Exceptional, 8.3 Excellent, 7.6 Very good, 6.9 Good, 6.0 Pleasant, nothing under 6.0), every screen calls `ratingWords()`...

T764: `choices.taste` (`{party, likes (up to 3), size, quiet, lifestyle, noCar, asked}`, null answers are No preference) is read, written and merged by `lib/taste.js` (committed earlier, `52f95b2`) and now drawn: on a phone's first Explore visit with no taste the st...

T765: `lib/match.js` (committed earlier, `2f2ab57`) is now on the screens through `browse/WhyItMatches.jsx`: Explore's cards and the map's card read "69% match: lakes, hiking" from 55% up beside the Score (never merged into it); the destination page shows the line a...

T766: `matchCountries` ranks a country's places by `forYou()` (no taste: the month score), in place of rating x 1.5 + fame x 0.4 + dominance x 0.8; with a taste the type-tag gate drops, since Explore has none.

Broke: T763 The commit counted 3,244 changed lines for 1,203 real ones / The stopped agent rewrote seven CRLF files as LF / Restored CRLF and staged those files with `core.autocrlf=false`; T763 On a phone's Explore list the photo pill read "10.0 Exceptiona" / "10.0 Exceptional" does not fit the 112 px photo / The pill keeps the figure; the band word sits...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T763-T766-rating-v5-screens.md"`

### T781: owner review of rating v5 batch R2 applied (2026-10-27)

The owner reviewed batch R2 (T757 to T760) on the review page https://claude.ai/artifact/59m2Bwr9JTKgTNp9jFXTzJ and accepted every item: the two redefined distribution gates (T759-b), the 5% spot check (T758-a), the 80 new golden pairs (T759-a), the six disputed hand scores as they are (T758-b), and all 30 verdicts of the external check (T760-a). The nine proposed appeals are applied: seven hand scores in `app_data/curated_appeal.json` (Belgrade 6.0 to 6.3, Toulouse and Marseille 6.5 to 6.8, Ortisei 8.6 to 8.0, Reykjavik 8.0 to 7.3, Cala Gonone 8.0 to 7.4, Fort William 8.2 to 7.2) and two rubric scores in `app_data/rubric_appeal.json` (Castel Gandolfo 7.1 to 6.8, Tenno 7.2 to 6.8, each marke...

Broke: The first edit rewrote curated_appeal.json with LF line endings (7.8 KB smaller) / Text-mode read and write of a CRLF file / Restored from git and edited as bytes; the file size is unchanged

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T781-rating-v5-review-applied.md"`

### T782: rating v5 merged (R1 to R4) and the shared master re-scored (2026-10-28)

The four rating v5 batches are merged, in order and `--no-ff`, into both repos: R1 foundation (T754 to T756), R2 scoring (T757 to T760), R3 profile (T761, T762) and R4 screens (T763 to T766). App `continent-app` `master` is at `97ed240` (it has no remote). Root `main` is at the commit carrying this report and is pushed to `origin`. Then the merge-time chain ran on the shared master (`app_data/app_data.json`, which the batches had only re-scored as copies): T754-a's chain, T756-b's place layer, R3's nature tiers, taste profile and fact cards, `sync-data`, and all 3,868 dossiers rebuilt so the destination page's verdict follows the new score.

Broke: App merge refused ("local changes would be overwritten") / Root and app share `continent-app/`: the root merge had already written the batches' files there / Checked each file was R1 to R3's content (line endings aside), moved the working copies to `<scratchpad>/t782-backup/app-wt`, restored `master`, merged; the same again for R4; T754-a missing f...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T782-rating-v5-merge.md"`

### T784: the rating chain runs without the trails lab (2026-10-28)

`pipeline/nature_tiers.py` read the trail and cycling lab rows from the trails lab (PostGIS in Docker on the laptop, port 5433) on every run, so a rating re-score failed whenever Docker was down and anyone running the chain had to start Docker Desktop. The owner asked for the pipeline to be independent of it (2026-10-28, during T782). Now every read from the lab is also written to `cache/nature/trails_lab_rows.json` and `cache/nature/cycling_lab_rows.json`; when the lab cannot be reached, `lab_rows()` reads that file instead, as long as it holds every id asked for, and prints that it did.

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T784-nature-lab-cache.md"`

### T785 to T791: rating v5 finished (the open items of R4) (2026-10-28)

T785: `sync-data` no longer ships `rating.tier` or `rating.label` (the v4 tiers and their "Worth the journey" words); no screen reads them since T763. `rating.components` ships under the v5 names (`depth`, `recognition`); `lib/rating.js` reads either.

T786: `pipeline/place_taste_profile.py` ships null for food when nothing marks a place as a food place (3,300 places). After the owner's note that food is logged in the app, food follows the app's own rule, Help me choose's food type in `lib/countryMatch.js`: a food...

T787: The profile carries `tmax_by_month`, twelve rounded mean day highs from the climate layer, also in the rank tier. `fit()` reads the month's high from it when the caller does not pass one.

T788: The three scripts that failed on R3 and R4 alike now test today's UI (a background agent, scoped to the three files, run against the batch's dev server).

T789: The wire diet takes the first-paint slice from 2.31 MB to 2.20 MB (398 KB gzipped): the English place reasons move to `public/app_data/why_i18n/en.json` beside the five other languages (RatingBreakdown loads it; 3,855 reasons, 393 KB, fetched only on a destina...

Broke: T791 75 packages vanished from `continent-app/node_modules` (vite, babel, WebLLM); the WebLLM test and the dev server failed / T782's `git worktree remove` on two app worktrees followed their `node_modules` junction into the main tree before it errored / Junction links removed with `rmdir` (link only); `npm install` restored the packages from the u...

Full: `git show archive/execution-full-2026-11-03:"Execution/P7/T785-T791-rating-v5-finish.md"`
