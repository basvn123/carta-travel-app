# T170: The shape of the week, day zero, and the weather fallback

## Task ID

T170 (mind-map number T174), spec items M2, M3 and M5. Branch p10-m2-m3-m5-week-shape in both repos.

## Date

2026-10-03

## What changed

A journey page now carries three folds directly above the day by day, and before this task none of the three existed in any form.

"How the week runs" (M2, open on arrival) is one strip with a column per day. The top row is an effort bar for each day, the middle row the day numbers, the bottom row the beds: one bordered box per run of nights in the same place, with a 2px ink edge on every box that starts a change of bed. A sentence above it reads the strip out loud, for example "3 bases, so you change beds 2 times. 4 hard days." on the Istria Parenzana week, or "One base all week, in El Tarter. No hard days, 1 rest day." on Grandvalira. A key under the strip says what the bar height measures for that style.

"Arrive and leave" (M3, closed by default, its header summary reads "Land by 20:00 at TRS") is two columns, day zero and the day after the last. Arriving: the gateway airports with their stated transfer, a land-by time, the first night, and the day 1 sentence that says what to collect, with a note to check its opening hours against the landing time. Leaving: the last night (or "No bed on day 7: the plan flies home that evening"), what to give back, how long before take-off to leave, and left luggage, or a sentence saying the plan does not record it. The Parenzana week now puts TRS and the 20:00 landing ahead of "Transfer from Trieste to Buje and take delivery of the bike", which is the defect the spec named.

"If the weather turns" (M5) lists every day with its fallback: the day's own bail-out clause, its own sentence that names the weather and an alternative, a choice offered in the title ("The Vojak day, or the Vizinada alternative"), or a swap with the week's flex day. A day with none says "No fallback written for this day." On winter and water weeks the fold is titled "Pick the day by the forecast", opens on arrival, and first regroups the middle days by what they need from the sky (after fresh snow, on a clear day, in wind or flat light; when the wind is up, when the swell is running, when the water is calm; whatever the weather), with the first and last days set apart as fixed by the flights. That is the condition-dependent reading the spec asked for.

## How it works, and why it was built this way

All of it is read out of the published trip. No data was written and no field was invented; where the trip does not say, the helper returns null and the page either omits the row or says "not recorded" in words. The reader is src/lib/weekShape.js, and src/browse/WeekPlan.jsx only lays it out.

Beds come from three sources, in this order. 70 trips write a sleep line on every day, and those lines are compared night to night: two lines are one base when most of the shorter line's words appear in the longer one, which is what makes "Hotel Kastel or Roxanich, Motovun" and "Hotel Kastel or Roxanich Wine & Heritage Hotel, Motovun" one place. A last night that is an airport hotel, "Departure" or "n/a" is not a base; it shows as a dashed "Out" box and feeds the leaving column. 103 trips have no sleep lines and one basecamp, which is read as one bed all week. Trips with several basecamps and no sleep lines get their nights placed from the basecamp names in each day's evening and title, and the placement is kept only if it reads as a real week (every base used, each base one unbroken run of nights); 18 trips pass that gate. The other 56 are listed only ("3 bases: A, B, C. The plan does not say which night you move.") rather than drawn with guessed moves.

Effort is read from the measured dayStats line, per style, because 40 km is a short day on a bike and a long one on foot. Walking styles (hiking, trail running, nature escapes) use distance plus 1 km per 100 m of climb; cycling uses distance plus 1 km per 25 m; winter sports use metres skied; water sports use hours on the water; road trips use kilometres driven; city weeks use kilometres walked, and a city day whose only distance is a timed transfer gets no bar. A day titled rest, flex or contingency is a rest day. The cut points live in one table, CUTS, near the top of the effort section, so a reviewer can argue with one number. Cozy towns and culinary weeks have no comparable measure in their lines, so they show the beds row only.

The land-by time is 22:00 minus the first stated transfer minus 45 minutes from touchdown to the road; the leave time is the transfer plus 2 hours at the airport. Those three numbers are exported constants and are printed in the sentence on the page, so the reader sees the assumption, not just the result. The transfer is the first one the gateway text names, read at the long end of a range ("3 h-3 h 30" is 210 minutes), and when the gateway string is prose rather than clean rows, only the first airport is used, the same rule the facts list already follows. When the last base is not the place the airport is timed to, the page says so ("The plan times TRS from Buje, not from Rovinj") instead of computing a wrong time.

A fallback sentence must name the weather and an alternative. "If conditions allow" alone, or "holds cold snow when everything else is turning", is a condition and is left out; an earlier, looser rule picked those up and was tightened after reading the output.

The folds keep their own open set (a second useFolds, reset per trip), so JourneyPage.jsx changes by one import and one mount line. That was deliberate: four other wave 13 sessions edit the same page, and T162 and T163 rewrite the itinerary block itself. For the same reason the condition-dependent options are a fold above the itinerary rather than a replacement of the day cards; see what is still open.

## Files touched

Modified (continent-app, commits 9b1f340 and 246d414): src/browse/JourneyPage.jsx (one import, one mount line above the itinerary fold), src/styles/25-feature-pages.css (one block appended at the end; the styles.css import list is untouched), src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (66 journey.week*, journey.ends*, journey.need*, journey.fb* and journey.wx* keys each, inserted after journey.typeWaterSports; all six parse).

Created (continent-app): src/lib/weekShape.js, src/browse/WeekPlan.jsx, tests/weekShape.test.mjs (eleven cases, all pass).

Root repo: this report and the register rows.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T170-app: node --test tests/weekShape.test.mjs tests/bookingOrder.test.mjs (15 pass); npx eslint on the four touched JS files (clean); node scripts/ci/design-lint.mjs (204 in the baseline, 0 new; the first run flagged the word "Easy" and a middle dot in a regex, both fixed); node scripts/ci/banned-terms.mjs (clean); the six-file i18n parse from the session rules; a coverage script kept in the session scratchpad that runs weekShape, tripEnds and weatherPlan over the 253 files in public/journeys/journey; a Playwright pass against Vite on http://127.0.0.1:5209 (own cacheDir, stopped afterwards) that opened the Parenzana, Grandvalira and Boka-Ada Bojana weeks at 380px and 1280px, opened the three folds and screenshotted them. npm run build was not run; the orchestrator builds at merge.

## Config and secrets set

None.

## Before/after measurements

Figures come from the coverage script over continent-app/public/journeys/journey (253 trips, 1,771 days). Before is the state at the start of the task, when none of the three modules existed.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips showing the week-shape strip | 0 | 247 | +247 |
| Trips whose beds are drawn night by night | 0 | 191 (70 sleep lines, 103 one base, 18 placed) | +191 |
| Trips with bases listed but not placed on nights | not applicable | 56 | |
| Trips showing at least one change of bed | 0 | 72 | +72 |
| Days with an effort bar | 0 | 1,091 of 1,771 | +1,091 |
| Trips with the arrive and leave module | 0 | 253 | +253 |
| Trips with a computed land-by time | 0 | 97 | +97 |
| Trips naming what to collect on day 1 / give back at the end | 0 | 114 / 64 | |
| Trips with left luggage found in the text | 0 | 7 | +7 |
| Trips with a computed leave-for-the-airport time | 0 | 29 | +29 |
| Days with a named fallback of their own | 0 | 148 (85 bail-out, 62 weather, 1 title option) | +148 |
| Days covered by a swap with the flex day | 0 | 64 | +64 |
| Trips showing the weather fold | 0 | 157 | +157 |
| Winter and water trips with days grouped by conditions | 0 of 48 | 48 of 48 (240 days grouped) | +48 |

Browser check: no page errors, no horizontal scroll at 380px or 1280px on the three weeks, and none of the three new blocks overflows its own width.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Vite would not start from a config in the wt folder | That folder cannot resolve the vite package | Put a temporary config with its own cacheDir inside the app worktree, deleted after the check |
| Tivat showed a 2 h transfer to Kotor | The longest time in a prose gateway string was used ("1 h 45 to Ulcinj ... 2 h to Kotor" from another airport) | Use the first transfer the row names, read at the long end of its own range |
| A Perast day was grouped under "When the wind is up" | "sail" matched "sailors" | Word-bounded sail, sails, sailing; "crossing" dropped |
| "Rifugio Biella, 2,327 m" labelled "2" | The label split on every comma, including the thousands separator | Split on a comma followed by a space |
| Fallbacks included conditions that are not fallbacks | The first rule only asked for a weather word and an "if" | Require a weather word and an alternative |
| The collect note said opening hours are not in the plan | A grep found a few trips that do state hire hours (Girona's data sheet: 09:00-14:00 and 17:00-20:00) | The note now only asks the reader to check the hours (246d414) |
| Design lint flagged two new violations | "Easy" is a banned word; a literal middle dot sat in a regex | Level 1 is "Light" (and Suave, Léger, Leggero); the dot is built from its code point |
| A heredoc ate backslashes in a Python patch | Known Git Bash trap | Patch scripts written to files first |

## What is still open

Most days still have no fallback of their own: 148 of 1,771 do, and 64 more borrow the flex day. The rest honestly say none is written. Filling them is an authoring pass through the generation pipeline, which is a data lane the owner starts, so it is an owner row. The same pass should fill the arrival facts the trips do not carry: hire opening hours (a handful of trips state them in prose, the Girona cycling data sheet among them, and none in a field the page can read), left luggage (7 do), and per-day sleep lines (183 trips have none, which is why 56 trips can only list their bases and 6 show no beds).

The thresholds in CUTS and the three timing assumptions (22:00, 45 minutes, 2 hours) are Carta's own reading, not a source fact. They are written down and printed, but the owner should confirm or change them.

On winter and water weeks the condition grouping is a fold above the itinerary; the day cards below still read Day 1 to Day 7. Replacing the cards themselves was left out because T162 (carousel) and T163 (day in place) rewrite that block in the same wave. Once wave 13 is merged, a follow-up can make the cards on those two styles carry the condition label.

WeekPlan.jsx passes parseGateway to tripEnds for wires built before T143. When T143-b removes parseGateway, this call goes with it.

For the orchestrator: JourneyPage.jsx changes by an import after the BookingOrder import and a three-line mount just above the itinerary fold; the CSS is one block at the end of 25-feature-pages.css; the i18n keys sit after journey.typeWaterSports in all six files. Those are the places a merge with the other wave 13 sessions may touch.

## Rollback procedure

In continent-app, git revert 246d414 9b1f340. In the root repo, revert the commit that adds this report and the T170 register rows. No data, schema, migration or stored state is involved.
